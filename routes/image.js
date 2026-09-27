import { Router } from 'express';
import { InferenceClient } from '@huggingface/inference';
import { GENERIC_ERROR } from '../lib/identity.js';

const router = Router();

// Helper function to convert aspect ratio to dimensions
function getDimensionsFromAspectRatio(aspectRatio) {
  const ratioMap = {
    '1:1': { width: 1024, height: 1024 },
    '16:9': { width: 1536, height: 864 },
    '9:16': { width: 864, height: 1536 },
    '4:3': { width: 1365, height: 1024 },
    '3:2': { width: 1216, height: 816 },
    '21:9': { width: 1536, height: 640 },
  };
  return ratioMap[aspectRatio] || { width: 1024, height: 1024 };
}

// Helper function to convert quality to inference steps
function getInferenceSteps(quality) {
  const qualityMap = {
    'fast': 4,
    'standard': 5,
    'high': 6,
    'ultra': 8,
  };
  return qualityMap[quality] || 5;
}

// POST /api/image  { prompt: string }
router.post('/', async (req, res) => {
  const { prompt, aspectRatio = '1:1', quality = 'high', stylePreset = 'photorealistic' } = req.body;
  if (!prompt) return res.status(400).json({ error: 'prompt is required' });
  
  if (!process.env.HF_TOKEN) {
    console.error('[image] HF_TOKEN is not set on the server');
    return res.status(500).json({ error: GENERIC_ERROR.image });
  }

  try {
    const client = new InferenceClient(process.env.HF_TOKEN);
    const { width, height } = getDimensionsFromAspectRatio(aspectRatio);
    const numInferenceSteps = getInferenceSteps(quality);
    
    // Enhance prompt with style preset
    const enhancedPrompt = `${prompt}, ${stylePreset} style`;

    // Try Hugging Face provider first
    let imageBlob = null;
    let lastError = null;

    // Provider 1: Hugging Face (default) - using available model
    try {
      console.log('[image] Attempting Hugging Face provider...');
      const result = await client.textToImage({
        provider: 'hf-inference',
        model: 'runwayml/stable-diffusion-v1-5',
        inputs: enhancedPrompt,
        parameters: {
          width,
          height,
          num_inference_steps: numInferenceSteps,
        },
      });
      console.log('[image] Hugging Face provider succeeded');
      imageBlob = result;
    } catch (hfError) {
      console.error('[image] Hugging Face provider failed:', hfError?.message || hfError);
      lastError = hfError;
    }

    // Provider 2: Together AI (fallback) - using available model
    if (!imageBlob) {
      try {
        console.log('[image] Attempting Together AI provider as fallback...');
        imageBlob = await client.textToImage({
          provider: 'together',
          model: 'stabilityai/stable-diffusion-2-1',
          inputs: enhancedPrompt,
          parameters: {
            width,
            height,
            num_inference_steps: numInferenceSteps,
          },
        });
        console.log('[image] Together AI provider succeeded');
      } catch (togetherError) {
        console.error('[image] Together AI provider failed:', togetherError);
        console.error('[image] Together AI error details:', JSON.stringify(togetherError, null, 2));
        lastError = togetherError;
      }
    }

    if (!imageBlob) {
      console.error('[image] All providers failed', lastError);
      return res.status(502).json({ error: GENERIC_ERROR.image });
    }

    // Convert blob to base64
    const arrayBuffer = await imageBlob.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64Image = buffer.toString('base64');

    res.json({ image: `data:image/png;base64,${base64Image}` });
  } catch (err) {
    console.error('[image] request failed:', err);
    console.error('[image] error details:', {
      message: err?.message,
      status: err?.status,
      stack: err?.stack,
      name: err?.name
    });
    const status = err?.status === 429 ? 429 : 502;
    const error = status === 429
      ? 'Image creation is temporarily unavailable because this account has reached its image limit. Please check your plan or try again later.'
      : GENERIC_ERROR.image;
    res.status(status).json({ error, details: err?.message });
  }
});

export default router;