import { Router } from 'express';
import { GoogleGenAI } from '@google/genai';
import { GENERIC_ERROR } from '../lib/identity.js';
import { getCloudflareAccounts, getModelList, runCloudflareModel, splitModelList, extractImagePayload, extractAudioPayload, extractVideoPayload, extractTranscription, extractGeneratedText, extractEmbeddings, extractMediaPayload } from '../lib/cloudflare.js';
import { generate, CAPABILITY } from '../lib/aiProviders.js';

const router = Router();

function getCloudflareVideoModels() {
  return getModelList('video');
}

function getGeminiVideoModels() {
  return splitModelList(
    process.env.GEMINI_VIDEO_MODELS,
    ['models/gemini-omni-flash-preview'],
  );
}

async function generateWithCloudflareVideo(modelName, prompt, duration, account) {
  const data = await runCloudflareModel(modelName, {
    prompt,
    ...(duration ? { duration } : {}),
  }, account);
  const { base64, contentType } = extractMediaPayload(data, { contentType: 'video/mp4' });
  if (!base64) {
    throw new Error('The video service returned no video.');
  }
  return { buffer: Buffer.from(base64, 'base64'), contentType };
}

async function generateWithGeminiVideo(modelName, prompt, duration) {
  const client = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    vertexai: false,
  });

  const interaction = await client.interactions.create({
    model: modelName,
    input: prompt,
    generation_config: {
      max_output_tokens: 65536,
      thinking_level: 'high',
      video_config: {
        task: 'unspecified',
      },
      top_p: 0.95,
    },
    response_modalities: ['video'],
    response_format: {
      type: 'video',
      ...(duration ? { duration } : {}),
    },
  });

  let videoData = null;
  if (interaction.steps) {
    for (const step of interaction.steps) {
      if (step.type === 'model_output' && step.content) {
        for (const part of step.content) {
          if (part.type === 'video') {
            videoData = await extractVideoPart(part.video?.data);
            break;
          }
        }
        if (videoData) break;
      }
    }
  }

  if (!videoData) {
    throw new Error('No video data in response.');
  }
  return { buffer: videoData, contentType: 'video/mp4' };
}

async function extractVideoPart(videoBase64) {
  if (typeof videoBase64 !== 'string' || !videoBase64) {
    throw new Error('The video service returned no video.');
  }
  const videoBuffer = Buffer.from(videoBase64, 'base64');
  if (!videoBuffer.length) {
    throw new Error('The video service returned an empty video.');
  }
  return videoBuffer;
}

// POST /api/video  { prompt, duration }
router.post('/', async (req, res) => {
  const { prompt, duration } = req.body || {};
  if (!prompt) {
    return res.status(400).json({ error: 'prompt is required' });
  }
  if (!process.env.GEMINI_API_KEY && !getCloudflareAccounts(false).length && !process.env.FAL_API_KEY) {
    console.error('[video] GEMINI_API_KEY and/or Cloudflare API credentials are not set on the server');
    return res.status(503).json({ error: GENERIC_ERROR.video });
  }

  const configuredDuration = duration || '10s';

  try {
    const { result } = await generate(CAPABILITY.VIDEO, {
      prompt,
      duration: configuredDuration,
      account: getCloudflareAccounts(false)[0],
    });
    return res.json({ video: `data:${result.contentType || 'video/mp4'};base64,${result.buffer.toString('base64')}` });
  } catch (error) {
    console.error('[video] request failed:', error?.message || 'provider-error');
    return res.status(502).json({ error: GENERIC_ERROR.video });
  }
});

export default router;
