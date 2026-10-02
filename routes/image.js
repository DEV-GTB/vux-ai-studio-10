import { Router } from 'express';
import { InferenceClient } from '@huggingface/inference';
import { GENERIC_ERROR } from '../lib/identity.js';

const router = Router();

function getDimensions(aspectRatio) {
  const dimensions = {
    '1:1': { width: 1024, height: 1024 },
    '16:9': { width: 1536, height: 864 },
    '9:16': { width: 864, height: 1536 },
    '4:3': { width: 1365, height: 1024 },
    '3:2': { width: 1216, height: 816 },
    '21:9': { width: 1536, height: 640 },
  };
  return dimensions[aspectRatio] || dimensions['1:1'];
}

function getInferenceSteps(quality) {
  return { fast: 4, standard: 5, high: 8, ultra: 12 }[quality] || 8;
}

router.post('/', async (req, res) => {
  const { prompt, stylePreset = 'photorealistic', aspectRatio = '1:1', quality = 'high' } = req.body || {};
  if (typeof prompt !== 'string' || !prompt.trim()) {
    return res.status(400).json({ error: 'A prompt is required.' });
  }
  if (prompt.length > 4000) {
    return res.status(400).json({ error: 'Please keep the prompt under 4,000 characters.' });
  }
  if (!process.env.HF_TOKEN || process.env.HF_TOKEN === 'your_huggingface_api_key_here') {
    return res.status(503).json({ error: 'Image generation is not configured. Add HF_TOKEN to the server environment.' });
  }

  try {
    const styledPrompt = `${prompt.trim()}, ${String(stylePreset).slice(0, 40)} style`;
    const client = new InferenceClient(process.env.HF_TOKEN);
    const imageBlob = await client.textToImage({
      model: process.env.HF_IMAGE_MODEL || 'black-forest-labs/FLUX.1-Krea-dev',
      inputs: styledPrompt,
      provider: 'auto',
      parameters: {
        ...getDimensions(aspectRatio),
        num_inference_steps: getInferenceSteps(quality),
      },
    });
    const contentType = imageBlob.type || 'image/png';
    if (!contentType.startsWith('image/')) {
      console.error('[image] Hugging Face returned an unsupported content type:', contentType);
      return res.status(502).json({ error: GENERIC_ERROR.image });
    }

    const imageBuffer = Buffer.from(await imageBlob.arrayBuffer());
    if (!imageBuffer.length) {
      return res.status(502).json({ error: GENERIC_ERROR.image });
    }

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'no-store');
    return res.send(imageBuffer);
  } catch (error) {
    const failureText = String(error?.message || '').toLowerCase();
    const creditsDepleted = failureText.includes('depleted your monthly included credits') || failureText.includes('purchase pre-paid credits');
    console.error('[image] generation failed:', error?.status || (creditsDepleted ? 'credits-depleted' : error?.message || 'unknown error'));
    if (creditsDepleted) {
      return res.status(402).json({ error: 'Hugging Face image-generation credits are depleted. Add credits or wait for your monthly allowance to renew.' });
    }
    const status = error?.status === 429 ? 429 : error?.status === 503 ? 503 : 502;
    return res.status(status).json({ error: status === 429 ? 'Image generation is busy. Please try again shortly.' : GENERIC_ERROR.image });
  }
});

export default router;