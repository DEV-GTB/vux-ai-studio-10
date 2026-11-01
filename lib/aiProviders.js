// The unified model layer.
//
// Every capability the platform offers â€” text, coding, image, image edit,
// video, music, speech, and embeddings â€” is served by the same ordered list of
// providers:
//
//   Cloudflare, Gemini, Groq, fal, and Hugging Face.
//
// The order is chosen by two rules. A provider that needs no credentials is
// skipped for image work so the configured quality models answer first, and a
// provider that answers fastest goes first, because a slow answer is worthless
// to the person waiting for it.
//
// The result of every attempt is normalised to the same shape, so a route does
// not need to know which provider served it:
//
//   text, coding          -> { text }
//   image, video, music    -> { buffer, contentType }
//   speech in, speech out -> { buffer, contentType } or { text }
//   embeddings            -> { embeddings }

import {
  getModelList,
  hasCloudflareAccounts,
  runCloudflareModel,
  extractMediaPayload,
  extractTranscription,
  extractGeneratedText,
  extractEmbeddings,
} from './cloudflare.js';
import { callGroq, callGroqSpeech, callGroqTranscription, getGroqChatModel, GROQ_TTS_MODEL, GROQ_WHISPER_MODEL, hasGroq } from './llama-whisper.js';
import { hasFal, getFalModels, runFalModel, downloadFalFile, extractFalMediaUrl, extractFalText } from './flux-sdxl.js';
import { hasHuggingFace, callHuggingFace, generateHuggingFaceImage, generateHuggingFaceEmbeddings } from './bge-m3-flux.js';
import { hasGeminiKey, callGeminiText, callGeminiImage, callGeminiEmbeddings } from './gemini-flash.js';

export const CAPABILITY = {
  TEXT: 'text',
  CODING: 'coding',
  IMAGE: 'image',
  IMAGE_EDIT: 'image-edit',
  VIDEO: 'video',
  MUSIC: 'music',
  TTS: 'tts',
  STT: 'stt',
  EMBEDDINGS: 'embeddings',
};

// Hugging Face text-to-image models served through the Inference provider.
// They sit in the image chain after the Cloudflare quality models and the
// Gemini image model, and each one gets its own attempt, so when one model
// runs out of credits or goes unavailable the next one answers instead of
// failing the whole image request.
const HUGGING_FACE_IMAGE_MODELS = [
  'black-forest-labs/FLUX.1-Krea-dev',
  'black-forest-labs/FLUX.1-dev',
  'black-forest-labs/FLUX.1-schnell',
  'stabilityai/stable-diffusion-xl-base-1.0',
];

/**
 * Builds the ordered attempts for a capability.
 *
 * Each attempt is `{ label, run }`, and `run` resolves to the normalised
 * result for that capability.
 *
 * @param {string} capability
 * @param {object} input
 * @returns {Array<{ label: string, run: Function }>}
 */
export function buildAttempts(capability, input = {}) {
  const attempts = [];

  // ------------------------------------------------------------------ text
  if (capability === CAPABILITY.TEXT || capability === CAPABILITY.CODING) {
    if (hasGeminiKey()) {
      attempts.push({
        label: 'Gemini',
        model: input.model,
        run: async () => ({ text: await callGeminiText(input.messages, { model: input.model }) }),
      });
    }

    if (hasCloudflareAccounts()) {
      const list = getModelList(capability === CAPABILITY.CODING ? 'coding' : 'text');
      for (const model of list) {
        attempts.push({
          model,
          label: `Cloudflare ${model}`,
          run: async () => {
            const payload = await runCloudflareModel(model, { messages: input.messages }, input.account);
            const text = extractGeneratedText(payload);
            if (!text) throw new Error('The service returned an empty response.');
            return { text };
          },
        });
      }
    }

    if (hasGroq()) {
      attempts.push({
        label: 'Groq',
        model: getGroqChatModel(),
        run: async () => ({ text: await callGroq(input.messages, { model: getGroqChatModel() }) }),
      });
    }

    if (hasHuggingFace()) {
      attempts.push({
        label: 'Hugging Face',
        model: input.model,
        run: async () => ({ text: await callHuggingFace(input.messages, input.model) }),
      });
    }

    if (hasFal()) {
      for (const model of getFalModels('text')) {
        attempts.push({
          model,
          label: `fal ${model}`,
          run: async () => {
            const payload = await runFalModel(model, { prompt: input.messages?.at(-1)?.content || '' });
            const text = extractFalText(payload);
            if (!text) throw new Error('The service returned an empty response.');
            return { text };
          },
        });
      }
    }

    return attempts;
  }

  // ----------------------------------------------------------------- image
  if (capability === CAPABILITY.IMAGE) {
    if (hasCloudflareAccounts()) {
      for (const model of getModelList('image')) {
        attempts.push({
          model,
          label: `Cloudflare ${model}`,
          run: async () => {
            const payload = await runCloudflareModel(model, {
              prompt: input.prompt,
              ...(input.steps ? { steps: input.steps } : {}),
            }, input.account);
            const { base64, contentType } = extractMediaPayload(payload, { contentType: 'image/png' });
            if (!base64) throw new Error('The service returned no image.');
            return { buffer: Buffer.from(base64, 'base64'), contentType };
          },
        });
      }
    }

    if (hasGeminiKey()) {
      attempts.push({
        label: 'Gemini',
        model: input.model,
        run: async () => callGeminiImage(input.prompt, input.aspectRatio, { model: input.model }),
      });
    }

    if (hasHuggingFace()) {
      for (const model of HUGGING_FACE_IMAGE_MODELS) {
        attempts.push({
          label: `Hugging Face ${model}`,
          model,
          run: async () => generateHuggingFaceImage(input.prompt, {
            model,
            width: input.width,
            height: input.height,
            steps: input.steps,
          }),
        });
      }
    }

    if (hasFal()) {
      for (const model of getFalModels('image')) {
        attempts.push({
          model,
          label: `fal ${model}`,
          run: async () => {
            const payload = await runFalModel(model, {
              prompt: input.prompt,
              ...(input.imageUrl ? { image_url: input.imageUrl } : {}),
              image_size: `${input.width || 1024}x${input.height || 1024}`,
              num_images: 1,
            });
            return downloadFalFile(extractFalMediaUrl(payload));
          },
        });
      }
    }

    // The free sources are gone from image work. Image generation runs on the
    // configured Cloudflare quality models first, then the paid fallbacks, and
    // every model renders the prompt with no branding, watermark, or badge.

    return attempts;
  }

  // ------------------------------------------------------------ image edit
  if (capability === CAPABILITY.IMAGE_EDIT) {
    if (hasCloudflareAccounts()) {
      for (const model of getModelList('imageEdit')) {
        attempts.push({
          model,
          label: `Cloudflare ${model}`,
          run: async () => {
            const payload = await runCloudflareModel(model, input.bodyFor ? await input.bodyFor(model) : (input.body || {}), input.account);
            const { base64, contentType } = extractMediaPayload(payload, { contentType: 'image/png' });
            if (!base64) throw new Error('The service returned no image.');
            return { buffer: Buffer.from(base64, 'base64'), contentType };
          },
        });
      }
    }

    if (hasFal()) {
      for (const model of getFalModels('imageEdit')) {
        attempts.push({
          model,
          label: `fal ${model}`,
          run: async () => {
            const payload = await runFalModel(model, input.body || {});
            return downloadFalFile(extractFalMediaUrl(payload));
          },
        });
      }
    }

    if (hasHuggingFace()) {
      attempts.push({
        label: 'Hugging Face',
        model: input.model,
        run: async () => generateHuggingFaceImage(input.prompt, {
          model: input.model,
          width: input.width,
          height: input.height,
          steps: input.steps,
        }),
      });
    }

    return attempts;
  }

  // ----------------------------------------------------------------- video
  if (capability === CAPABILITY.VIDEO) {
    if (hasGeminiKey()) {
      attempts.push({
        label: 'Gemini',
        model: input.model,
        run: async () => callGeminiImage(input.prompt, input.aspectRatio, { model: input.model }),
      });
    }

    if (hasCloudflareAccounts()) {
      for (const model of getModelList('video')) {
        attempts.push({
          model,
          label: `Cloudflare ${model}`,
          run: async () => {
            const payload = await runCloudflareModel(model, {
              prompt: input.prompt,
              ...(input.duration ? { duration: input.duration } : {}),
            }, input.account);
            const { base64, contentType } = extractMediaPayload(payload, { contentType: 'video/mp4' });
            if (!base64) throw new Error('The service returned no video.');
            return { buffer: Buffer.from(base64, 'base64'), contentType };
          },
        });
      }
    }

    if (hasFal()) {
      for (const model of getFalModels('video')) {
        attempts.push({
          model,
          label: `fal ${model}`,
          run: async () => {
            const payload = await runFalModel(model, {
              prompt: input.prompt,
              ...(input.imageUrl ? { image_url: input.imageUrl } : {}),
              duration: String(input.duration || '5'),
            });
            return downloadFalFile(extractFalMediaUrl(payload));
          },
        });
      }
    }

    return attempts;
  }

  // ----------------------------------------------------------------- music
  if (capability === CAPABILITY.MUSIC) {
    if (hasCloudflareAccounts()) {
      for (const model of getModelList('music')) {
        attempts.push({
          model,
          label: `Cloudflare ${model}`,
          run: async () => {
            const payload = await runCloudflareModel(model, input.bodyFor ? input.bodyFor(model) : (input.body || {}), input.account);
            const { base64, contentType } = extractMediaPayload(payload, { contentType: 'audio/mpeg' });
            if (!base64) throw new Error('The service returned no audio.');
            return { buffer: Buffer.from(base64, 'base64'), contentType };
          },
        });
      }
    }

    if (hasFal()) {
      for (const model of getFalModels('music')) {
        attempts.push({
          model,
          label: `fal ${model}`,
          run: async () => {
            const payload = await runFalModel(model, input.body || {});
            return downloadFalFile(extractFalMediaUrl(payload));
          },
        });
      }
    }

    return attempts;
  }

  // ------------------------------------------------------------------- tts
  if (capability === CAPABILITY.TTS) {
    if (input.cartesia && (process.env.CARTESIA_API_KEY || process.env.Cartesia_API_KEY)) {
      attempts.push({ label: 'Cartesia', run: () => input.cartesia() });
    }

    if (hasCloudflareAccounts()) {
      for (const model of getModelList('tts')) {
        attempts.push({
          model,
          label: `Cloudflare ${model}`,
          run: async () => {
            const payload = await runCloudflareModel(model, await input.bodyFor(model), input.account);
            const { base64, contentType } = extractMediaPayload(payload, { contentType: 'audio/mpeg' });
            if (!base64) throw new Error('The service returned no audio.');
            return { buffer: Buffer.from(base64, 'base64'), contentType };
          },
        });
      }
    }

    if (hasGroq()) {
      attempts.push({
        label: 'Groq',
        model: GROQ_TTS_MODEL,
        run: async () => callGroqSpeech(input.text, { voice: input.voice, model: GROQ_TTS_MODEL }),
      });
    }

    if (hasFal()) {
      for (const model of getFalModels('tts')) {
        attempts.push({
          model,
          label: `fal ${model}`,
          run: async () => {
            const payload = await runFalModel(model, { text: input.text });
            return downloadFalFile(extractFalMediaUrl(payload));
          },
        });
      }
    }

    return attempts;
  }

  // ------------------------------------------------------------------- stt
  if (capability === CAPABILITY.STT) {
    if (hasCloudflareAccounts()) {
      for (const model of getModelList('stt')) {
        attempts.push({
          model,
          label: `Cloudflare ${model}`,
          run: async () => {
            const payload = await runCloudflareModel(model, await input.bodyFor(model), input.account);
            const text = extractTranscription(payload);
            if (!text) throw new Error('The service returned no text.');
            return { text };
          },
        });
      }
    }

    if (hasGroq() && input.audioBuffer) {
      attempts.push({
        label: 'Groq',
        model: GROQ_WHISPER_MODEL,
        run: async () => ({ text: await callGroqTranscription(input.audioBuffer, input.filename, { model: GROQ_WHISPER_MODEL }) }),
      });
    }

    if (hasFal()) {
      for (const model of getFalModels('stt')) {
        attempts.push({
          model,
          label: `fal ${model}`,
          run: async () => {
            const payload = await runFalModel(model, {
              audio_url: input.audioUrl,
              ...(input.audioBase64 ? { audio_data: input.audioBase64 } : {}),
            });
            const text = extractFalText(payload);
            if (!text) throw new Error('The service returned no text.');
            return { text };
          },
        });
      }
    }

    return attempts;
  }

  // ------------------------------------------------------------- embeddings
  if (capability === CAPABILITY.EMBEDDINGS) {
    if (hasGeminiKey()) {
      attempts.push({
        label: 'Gemini',
        model: input.model,
        run: async () => ({ embeddings: await callGeminiEmbeddings(input.texts, { model: input.model }) }),
      });
    }

    if (hasCloudflareAccounts()) {
      for (const model of getModelList('embeddings')) {
        attempts.push({
          model,
          label: `Cloudflare ${model}`,
          run: async () => {
            const payload = await runCloudflareModel(model, { text: input.texts }, input.account);
            const embeddings = extractEmbeddings(payload);
            if (!embeddings) throw new Error('The service returned no embeddings.');
            return { embeddings };
          },
        });
      }
    }

    if (hasHuggingFace()) {
      attempts.push({
        label: 'Hugging Face',
        model: input.model,
        run: async () => ({ embeddings: await generateHuggingFaceEmbeddings(input.texts) }),
      });
    }

    if (hasFal()) {
      for (const model of getFalModels('text')) {
        attempts.push({
          model,
          label: `fal ${model}`,
          run: async () => {
            const payload = await runFalModel(model, { prompt: input.texts.join('\n') });
            const rows = extractEmbeddings(payload);
            if (!rows) throw new Error('The service returned no embeddings.');
            return { embeddings: rows };
          },
        });
      }
    }

    return attempts;
  }

  return attempts;
}

/**
 * Runs a capability through its providers until one answers.
 *
 * @param {string} capability
 * @param {object} input
 * @param {{ logger?: Console }} [options]
 * @returns {Promise<{ result: object, provider: string }>}
 */
export async function generate(capability, input = {}, { logger = console } = {}) {
  const attempts = buildAttempts(capability, input);

  if (!attempts.length) {
    const error = new Error(`No provider is configured for ${capability}.`);
    error.status = 503;
    throw error;
  }

  let lastError = null;
  for (const attempt of attempts) {
    try {
      const result = await attempt.run();
      return { result, provider: attempt.label, model: attempt.model };
    } catch (error) {
      lastError = error;
      logger.warn(`[ai] ${attempt.label} did not answer for ${capability}: ${error?.message || 'provider-error'}`);
    }
  }

  const failure = new Error(
    `VUX AI could not complete the ${capability} request. Sorry for the errors — please try again in a moment.`,
  );
  failure.status = lastError?.status === 429 ? 429 : 502;
  failure.cause = lastError;
  throw failure;
}
