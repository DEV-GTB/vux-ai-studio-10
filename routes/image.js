import { Router } from 'express';
import { getCloudflareAccounts } from '../lib/cloudflare.js';
import { generate, CAPABILITY } from '../lib/aiProviders.js';
import Cloudflare from 'cloudflare';
import { InferenceClient } from '@huggingface/inference';
import { GENERIC_ERROR } from '../lib/identity.js';

const router = Router();

const GEMINI_IMAGE_MODEL = process.env.GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image';

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

// Builds the request body a model expects. Each image model family has its
// own shape, so the body is built per model. The newer Cloudflare Workers AI
// image models accept an explicit resolution instruction, which is what makes
// a render detailed instead of guessing from the prompt alone.
const RESOLUTION_IMAGE_MODELS = new Set([
  'black-forest-labs/flux-3-image-klein',
  'klingai/kling-v3-image',
  'topaz/gigapixel-standard-2',
  'google/nano-banana-2.1',
]);

function buildCloudflareImageRequest(modelName, input) {
  if (input.reference) {
    if (modelName === 'krea/krea-3') {
      return {
        prompt: input.instruction || input.prompt,
        image_urls: [input.reference],
        resolution: input.resolution,
      };
    } else if (modelName === 'bria/fibo-edit-1.5') {
      return {
        instruction: input.instruction,
        images: [input.reference],
      };
    } else if (modelName === 'pruna/p-image-upscale') {
      return {
        image: input.reference,
        target: input.target,
        enhance_details: input.enhanceDetails,
      };
    }
    return { prompt: input.instruction || input.prompt };
  }

  const body = {
    prompt: input.prompt,
    steps: input.steps,
  };
  if (RESOLUTION_IMAGE_MODELS.has(modelName) && input.resolution) {
    body.resolution = input.resolution;
  }
  return body;
}

function getInferenceSteps(quality) {
  return { fast: 4, standard: 5, high: 8, ultra: 12 }[quality] || 8;
}

// Resolution and quality guidance, added to the prompt itself. Image models
// render what they are told, so the intent has to travel in the words: a prompt
// that says "8k, ultra-detailed, sharp focus" comes back sharper than the same
// prompt without those sentences, and the output size follows the request.
// Keeping the suffix short also keeps it inside the model's prompt budget.
const QUALITY_PROMPTS = {
  '1k': 'ultra-detailed, sharp focus, photorealistic, high resolution',
  '2k': 'ultra-detailed, sharp focus, cinematic lighting, professional color grading, high resolution',
  '4k': '8k resolution, ultra-detailed, sharp focus, professional color grading, cinematic lighting, photorealistic, high detail, masterpiece quality',
  '8k': '8k resolution, ultra-detailed, sharp focus, professional color grading, cinematic lighting, photorealistic, high detail, masterpiece quality',
};

function buildQualityPrompt(prompt, resolution = '1k') {
  const key = String(resolution || '1k').trim().toLowerCase();
  const qualityLine = QUALITY_PROMPTS[key] || QUALITY_PROMPTS['1k'];
  const base = String(prompt || '').trim();
  return base ? `${base}, ${qualityLine}` : qualityLine;
}

async function generateGeminiImage(prompt) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('No Gemini key');
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_IMAGE_MODEL}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { responseModalities: ['IMAGE', 'TEXT'] },
      }),
    }
  );
  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = {}; }
  if (!response.ok) {
    throw new Error(data?.error?.message || 'Gemini image generation failed');
  }
  const parts = data?.candidates?.[0]?.content?.parts || [];
  const imagePart = parts.find((p) => p?.inlineData?.data);
  if (!imagePart) throw new Error('Gemini did not return an image.');
  const mimeType = imagePart.inlineData.mimeType || 'image/png';
  return { buffer: Buffer.from(imagePart.inlineData.data, 'base64'), mimeType };
}

router.post('/', async (req, res) => {
  const { prompt, stylePreset = 'photorealistic', aspectRatio = '1:1', quality = 'high', referenceImage, instruction, target, enhanceDetails } = req.body || {};
  if (typeof prompt !== 'string' || !prompt.trim()) {
    return res.status(400).json({ error: 'A prompt is required.' });
  }
  if (prompt.length > 4000) {
    return res.status(400).json({ error: 'Please keep the prompt under 4,000 characters.' });
  }
  const hasHuggingFace = Boolean(process.env.HF_TOKEN && process.env.HF_TOKEN !== 'your_huggingface_api_key_here');
  const hasGemini = Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'your_gemini_api_key_here');
  const cloudflareAccounts = getCloudflareAccounts(true);
  const hasCloudflare = cloudflareAccounts.length > 0;
  // Image generation is served by the configured Cloudflare quality models
  // first, then the paid fallbacks. The unified layer reports a failure only
  // when every provider refuses the request.

  try {
    const { width, height } = getDimensions(aspectRatio);
    const resolutionKey = String(height >= width ? '2K' : '1K').toLowerCase();
    const styledPrompt = buildQualityPrompt(
      `${prompt.trim()}, ${String(stylePreset).slice(0, 40)} style`,
      resolutionKey,
    );
    const capability = referenceImage ? CAPABILITY.IMAGE_EDIT : CAPABILITY.IMAGE;

    // The unified layer tries every configured provider in order, and the
    // free source catches the request when none of them can.
    const { result, provider, model } = await generate(capability, {
      prompt: styledPrompt.slice(0, 2048),
      instruction,
      reference: referenceImage,
      target,
      enhanceDetails: enhanceDetails === true,
      resolution: height >= width ? '2K' : '1K',
      width,
      height,
      aspectRatio,
      steps: Math.min(getInferenceSteps(quality), 8),
      account: cloudflareAccounts[0],
      bodyFor: (modelName) => buildCloudflareImageRequest(modelName, {
        prompt: styledPrompt.slice(0, 2048),
        instruction,
        reference: referenceImage,
        target,
        enhanceDetails: enhanceDetails === true,
        resolution: height >= width ? '2K' : '1K',
      }),
    });

    res.setHeader('X-Vux-AI-Provider', provider || 'unknown');
    res.setHeader('X-Vux-AI-Model', model || provider || 'unknown');
    res.setHeader('Content-Type', result.contentType || 'image/png');
    res.setHeader('Cache-Control', 'no-store');
    return res.send(result.buffer);
  } catch (error) {
    console.error('[image] generation failed:', error?.message || 'provider-error');
    const failureText = String(error?.message || '').toLowerCase();
    const creditsDepleted = failureText.includes('depleted your monthly included credits')
      || failureText.includes('purchase pre-paid credits');
    if (creditsDepleted) {
      return res.status(402).json({ error: 'Image-generation credits are depleted. Add credits or wait for your monthly allowance to renew.' });
    }
    const status = error?.status === 429 ? 429 : error?.status === 503 ? 503 : 502;
    return res.status(status).json({ error: status === 429 ? 'Image generation is busy. Please try again shortly.' : GENERIC_ERROR.image });
  }
});

export default router;