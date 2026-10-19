import { Router } from 'express';
import { getCloudflareAccounts, getModelList, runCloudflareModel, extractMediaPayload } from '../lib/cloudflare.js';
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
// own shape, so the body is built per model.
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

  return {
    prompt: input.prompt,
    steps: input.steps,
  };
}

function getInferenceSteps(quality) {
  return { fast: 4, standard: 5, high: 8, ultra: 12 }[quality] || 8;
}

async function generatePollinationsImage(prompt, width, height) {
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${width}&height=${height}&model=flux&nologo=true&safe=true`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Pollinations returned HTTP ${response.status}`);
  const contentType = response.headers.get('content-type') || 'image/jpeg';
  if (!contentType.startsWith('image/')) throw new Error('Pollinations did not return an image.');
  return { buffer: Buffer.from(await response.arrayBuffer()), mimeType: contentType };
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
  if (!hasHuggingFace && !hasCloudflare && !hasGemini) {
    return res.status(503).json({ error: 'Image generation is not configured. Add HF_TOKEN, GEMINI_API_KEY, or Cloudflare credentials to the server environment.' });
  }

  try {
    const styledPrompt = `${prompt.trim()}, ${String(stylePreset).slice(0, 40)} style`;
    if (hasCloudflare) {
      // An edit request uses the models that can take a reference image; a
      // text request uses the models that generate one. Every model is tried
      // in order, because a model can be unavailable on a given account.
      const modelList = referenceImage ? getModelList('imageEdit') : getModelList('image');
      for (const cloudflareModel of modelList) {
        try {
          const cloudflarePayload = await runCloudflareModel(
            cloudflareModel,
            buildCloudflareImageRequest(cloudflareModel, {
              prompt: styledPrompt.slice(0, 2048),
              instruction,
              reference: referenceImage,
              target,
              enhanceDetails: enhanceDetails === true,
              resolution: getDimensions(aspectRatio).height >= getDimensions(aspectRatio).width ? '2K' : '1K',
              steps: Math.min(getInferenceSteps(quality), 8),
            }),
            cloudflareAccounts[0],
          );
          const { base64, contentType } = extractMediaPayload(cloudflarePayload, { contentType: 'image/jpeg' });
          if (!base64) throw new Error('The image service returned no image.');
          res.setHeader('Content-Type', contentType);
          res.setHeader('Cache-Control', 'no-store');
          return res.send(Buffer.from(base64, 'base64'));
        } catch (error) {
          console.error(`[image] ${cloudflareModel} failed:`, error?.message || 'provider-error');
        }
      }
    }

    if (hasGemini) {
      try {
        const geminiImage = await generateGeminiImage(styledPrompt.slice(0, 4000));
        res.setHeader('Content-Type', geminiImage.mimeType);
        res.setHeader('Cache-Control', 'no-store');
        return res.send(geminiImage.buffer);
      } catch (error) {
        console.error('[image] Gemini image generation failed:', error?.message || 'provider-error');
        if (!hasHuggingFace) {
          // try free Pollinations before giving up
        }
      }
    }

    try {
      const { width, height } = getDimensions(aspectRatio);
      const pollinationsImage = await generatePollinationsImage(styledPrompt.slice(0, 1500), width, height);
      res.setHeader('Content-Type', pollinationsImage.mimeType);
      res.setHeader('Cache-Control', 'no-store');
      return res.send(pollinationsImage.buffer);
    } catch (pollinationsError) {
      console.error('[image] Pollinations fallback failed:', pollinationsError?.message || 'provider-error');
      if (!hasHuggingFace) {
        return res.status(502).json({ error: GENERIC_ERROR.image });
      }
    }

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