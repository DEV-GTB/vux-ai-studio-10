import { Router } from 'express';
import { InferenceClient } from '@huggingface/inference';
import { GENERIC_ERROR } from '../lib/identity.js';

const router = Router();

// POST /api/3d  { prompt: string, image?: string, mode: 'text' | 'image' }
router.post('/', async (req, res) => {
  const { prompt, image, mode = 'text' } = req.body;
  
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
    
    let model3D = null;
    let lastError = null;

    // Try Hugging Face TRELLIS model for text-to-3D
    if (mode === 'text') {
      try {
        console.log('[3d] Attempting Hugging Face for text-to-3D preview...');
        // Note: Using SD 1.5 as placeholder for 3D generation preview
        // In production, you'd use a dedicated 3D model endpoint
        const result = await client.textToImage({
          provider: 'hf-inference',
          model: 'runwayml/stable-diffusion-v1-5',
          inputs: `3D model of ${prompt}, isometric view, white background, high quality, professional render`,
          parameters: {
            width: 512,
            height: 512,
            num_inference_steps: 20,
          },
        });
        
        // Convert to base64 (this is a placeholder - real 3D would return GLB/OBJ)
        const arrayBuffer = await result.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const base64Image = buffer.toString('base64');
        
        // For now, return the image as a preview (real implementation would return 3D model)
        return res.json({ 
          model: 'data:image/png;base64,' + base64Image,
          format: 'glb',
          preview: true,
          message: '3D generation preview - full 3D model support coming soon'
        });
      } catch (hfError) {
        console.error('[3d] Hugging Face failed:', hfError?.message || hfError);
        lastError = hfError;
      }
    }

    // Try Together AI as fallback for text-to-3D
    if (mode === 'text' && !model3D) {
      try {
        console.log('[3d] Attempting Together AI for text-to-3D...');
        const result = await client.textToImage({
          provider: 'together',
          model: 'stabilityai/stable-diffusion-2-1',
          inputs: `3D model render of ${prompt}, isometric, white background, professional, high quality`,
          parameters: {
            width: 512,
            height: 512,
            num_inference_steps: 20,
          },
        });
        
        const arrayBuffer = await result.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const base64Image = buffer.toString('base64');
        
        return res.json({ 
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
        // For image-to-3D, we would use a model like TripoSR or similar
        // For now, return the input image as preview
        return res.json({ 
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

    if (!model3D) {
      console.error('[3d] All providers failed', lastError);
      return res.status(502).json({ error: GENERIC_ERROR.image });
    }

    res.json({ model: model3D, format: 'glb' });
  } catch (err) {
    console.error('[3d] request failed:', err);
    console.error('[3d] error details:', {
      message: err?.message,
      status: err?.status,
      stack: err?.stack,
      name: err?.name
    });
    const status = err?.status === 429 ? 429 : 502;
    const error = status === 429
      ? '3D generation is temporarily unavailable because this account has reached its limit. Please check your plan or try again later.'
      : GENERIC_ERROR.image;
    res.status(status).json({ error, details: err?.message });
  }
});

export default router;
