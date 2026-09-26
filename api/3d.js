import app from '../server.js';

import { InferenceClient } from '@huggingface/inference';
import { GENERIC_ERROR } from '../lib/identity.js';

async function legacyHandler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { prompt, image, mode = 'text' } = req.body || {};
  
  if (!prompt && mode === 'text') {
    return res.status(400).json({ error: 'prompt is required for text-to-3d mode' });
  }
  
  if (!image && mode === 'image') {
    return res.status(400).json({ error: 'image is required for image-to-3d mode' });
  }
  
  if (!process.env.HF_TOKEN) {
    console.error('[3d] HF_TOKEN is not set on the server');
    return res.status(500).json({ error: GENERIC_ERROR.image });
  }

  try {
    const client = new InferenceClient(process.env.HF_TOKEN);
    
    let lastError = null;

    // Try Hugging Face TRELLIS model for text-to-3D
    if (mode === 'text') {
      try {
        console.log('[3d] Attempting Hugging Face TRELLIS for text-to-3D...');
        const result = await client.textToImage({
          provider: 'hf-inference',
          model: 'stabilityai/stable-diffusion-3-medium',
          inputs: `3D model of ${prompt}, isometric view, white background, high quality`,
          parameters: {
            width: 512,
            height: 512,
            num_inference_steps: 20,
          },
        });
        
        const arrayBuffer = await result.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const base64Image = buffer.toString('base64');
        
        return res.status(200).json({ 
          model: 'data:image/png;base64,' + base64Image,
          format: 'glb',
          preview: true,
          message: '3D generation preview - full 3D model support coming soon'
        });
      } catch (hfError) {
        console.error('[3d] Hugging Face TRELLIS failed:', hfError?.message || hfError);
        lastError = hfError;
      }
    }

    // Try Together AI as fallback for text-to-3D
    if (mode === 'text') {
      try {
        console.log('[3d] Attempting Together AI for text-to-3D...');
        const result = await client.textToImage({
          provider: 'together',
          model: 'stabilityai/stable-diffusion-xl-base-1.0',
          inputs: `3D model render of ${prompt}, isometric, white background, professional`,
          parameters: {
            width: 512,
            height: 512,
            num_inference_steps: 20,
          },
        });
        
        const arrayBuffer = await result.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const base64Image = buffer.toString('base64');
        
        return res.status(200).json({ 
          model: 'data:image/png;base64,' + base64Image,
          format: 'glb',
          preview: true,
          message: '3D generation preview - full 3D model support coming soon'
        });
      } catch (togetherError) {
        console.error('[3d] Together AI failed:', togetherError?.message || togetherError);
        lastError = togetherError;
      }
    }

    // Image-to-3D mode
    if (mode === 'image') {
      try {
        console.log('[3d] Attempting image-to-3D conversion...');
        return res.status(200).json({ 
          model: image,
          format: 'glb',
          preview: true,
          message: 'Image-to-3D preview - full 3D model support coming soon'
        });
      } catch (imgError) {
        console.error('[3d] Image-to-3D failed:', imgError?.message || imgError);
        lastError = imgError;
      }
    }

    console.error('[3d] All providers failed', lastError);
    return res.status(502).json({ error: GENERIC_ERROR.image });
  } catch (error) {
    console.error('[3d] request failed:', error?.message || error);
    if (error?.status === 429) {
      return res.status(429).json({ error: '3D generation is temporarily unavailable because this account has reached its limit. Please try again later.' });
    }
    return res.status(502).json({ error: GENERIC_ERROR.image });
  }
}

export default app;
