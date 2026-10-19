// Cloudflare Workers AI integration.
//
// This module is the single place that knows how to reach Workers AI. The
// model lists, the credential resolution, and the request shape were
// duplicated across the image, music, voice, embeddings, video, and chat
// routes. They all drifted, and the drift caused real bugs.
//
// Two credential conventions are supported:
//
//   CLOUDFLARE_ACCOUNT_ID_1 / CLOUDFLARE_API_KEY_1   (preferred, two accounts)
//   CLOUDFLARE_ACCOUNT_ID   / CLOUDFLARE_API_TOKEN    (legacy single account)
//
// A token that cannot see its account fails with HTTP 7000 "No route for that
// URI" or HTTP 9109 "Unauthorized to access requested resource". That is a
// credentials problem, not a code problem — tools/probe-models.mjs exists to
// diagnose exactly that, and tools/list-account-models.mjs shows what an
// account can actually reach.
//
// The model lists below put the models that are confirmed reachable on a
// Workers AI account first, and keep the larger partner models after them.
// The partner models (partner-hosted text, image, and speech) are only
// available on accounts that have them enabled, so they are tried second and
// skipped automatically when the account does not offer them.

export const CLOUDFLARE_BASE_URL = 'https://api.cloudflare.com/client/v4';

export const MODEL_LISTS = {
  // The lists are ordered by measured response time, fastest first. The
  // secondary service is the fallback for a slow primary service, so it has
  // to answer quickly: a 27B model took 33 seconds to answer while a 3B
  // model took 1 second for the same request.
  text: {
    env: 'CLOUDFLARE_TEXT_MODELS',
    defaults: [
      '@cf/meta/llama-3.2-3b-instruct',
      '@cf/mistralai/mistral-small-3.1-24b-instruct',
      '@cf/openai/gpt-oss-20b',
      '@cf/google/gemma-4-26b-a4b-it',
      '@cf/qwen/qwen3.8-27b',
      'fireworks/ember-1',
      'google/gemini-4-argon',
      'xai/grok-4.7',
    ],
  },
  coding: {
    env: 'CLOUDFLARE_CODING_MODELS',
    defaults: [
      '@cf/qwen/qwen2.5-coder-32b-instruct',
      '@cf/openai/gpt-oss-20b',
      '@cf/mistralai/mistral-small-3.1-24b-instruct',
      '@cf/meta/llama-3.2-3b-instruct',
      '@cf/qwen/qwen3.8-27b',
    ],
  },
  image: {
    env: 'CLOUDFLARE_IMAGE_MODELS',
    defaults: [
      '@cf/leonardo/phoenix-1.0',
      '@cf/lykon/dreamshaper-8-lcm',
      '@cf/black-forest-labs/flux-1-schnell',
      '@cf/stabilityai/stable-diffusion-xl-base-1.0',
      '@cf/bytedance/stable-diffusion-xl-lightning',
      'google/nano-banana-2.1',
      'google/nano-banana-2-lite',
      'recraft/recraftv4-1-flash',
    ],
  },
  imageEdit: {
    env: 'CLOUDFLARE_EDIT_MODELS',
    defaults: [
      'krea/krea-3',
      'bria/fibo-edit-1.5',
      'pruna/p-image-upscale',
    ],
  },
  music: {
    env: 'CLOUDFLARE_MUSIC_MODELS',
    defaults: [
      'elevenlabs/music-v2',
      'minimax/music-2.6',
    ],
  },
  tts: {
    env: 'CLOUDFLARE_TEXT_TO_SPEECH_MODELS',
    defaults: [
      '@cf/deepgram/aura-2-en',
      '@cf/deepgram/aura-1',
      '@cf/myshell-ai/melotts',
      'google/gemini-3.8-flash-lite-tts',
      'elevenlabs/eleven-v3',
    ],
  },
  stt: {
    env: 'CLOUDFLARE_SPEECH_TO_TEXT_MODELS',
    defaults: [
      '@cf/openai/whisper-large-v3-turbo',
      '@cf/openai/whisper-tiny-en',
      'assemblyai/universal-3.5-pro',
      'openai/gpt-4o-transcribe',
      'xai/grok-stt',
    ],
  },
  embeddings: {
    env: 'CLOUDFLARE_EMBEDDING_MODELS',
    defaults: [
      '@cf/google/embeddinggemma-300m',
      '@cf/qwen/qwen3-embedding-0.6b',
      '@cf/baai/bge-m3',
    ],
  },
  video: {
    env: 'CLOUDFLARE_VIDEO_MODELS',
    defaults: [],
  },
};

export function splitModelList(value, fallbackModels = []) {
  const configured = String(value || '')
    .split(',')
    .map((model) => model.trim())
    .filter(Boolean);
  const models = [...new Set(configured)];
  return models.length ? models : [...new Set(fallbackModels)];
}

/**
 * Returns the configured Cloudflare accounts.
 *
 * @param {{ preferPrimary?: boolean } | boolean} options
 *   preferPrimary puts account 1 first. Image work prefers the primary
 *   account because the team reserved it for images. A bare boolean is
 *   accepted for compatibility with the previous call signature.
 */
export function getCloudflareAccounts(options = {}) {
  const preferPrimary = typeof options === 'boolean' ? options : Boolean(options.preferPrimary);
  const accounts = [];

  for (let index = 1; index <= 2; index += 1) {
    const accountId = process.env[`CLOUDFLARE_ACCOUNT_ID_${index}`];
    const apiKey = process.env[`CLOUDFLARE_API_KEY_${index}`];
    if (!accountId || !apiKey) continue;
    accounts.push({ accountId, apiKey, order: preferPrimary ? index : 3 - index });
  }

  // Legacy single-account configuration.
  if (!accounts.length) {
    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    const apiKey = process.env.CLOUDFLARE_API_TOKEN;
    if (accountId && apiKey) {
      accounts.push({ accountId, apiKey, order: preferPrimary ? 1 : 2 });
    }
  }

  return accounts.sort((left, right) => left.order - right.order);
}

export function hasCloudflareAccounts() {
  return getCloudflareAccounts().length > 0;
}

export function getModelList(kind) {
  const entry = MODEL_LISTS[kind];
  if (!entry) return [];
  return splitModelList(process.env[entry.env], entry.defaults);
}

/**
 * Runs a model on Workers AI.
 *
 * The model name keeps its slashes in the path. Cloudflare routes on the
 * literal path segments, so `fireworks/ember-1` must not be percent-encoded.
 * Percent-encoding the slash produces HTTP 7000 "No route for that URI" for
 * every model.
 *
 * Workers AI returns three different shapes depending on the model family:
 *
 *   { "result": "<base64>" }        image, audio, video payloads
 *   { "result": { "response": "" } } text generation
 *   raw bytes                       some media models
 *
 * All three are normalised here. The return value is:
 *
 *   - a base64 string, for a binary response
 *   - the unwrapped JSON payload, for a JSON response
 */
export async function runCloudflareModel(modelName, body, account) {
  const response = await fetch(
    `${CLOUDFLARE_BASE_URL}/accounts/${account.accountId}/ai/run/${modelName}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${account.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    },
  );

  const contentType = response.headers.get('content-type') || '';
  const raw = Buffer.from(await response.arrayBuffer());
  const text = raw.toString('utf8');

  let data = null;
  let parsed = false;
  if (text.trim().startsWith('{') || text.trim().startsWith('[')) {
    try {
      data = JSON.parse(text);
      parsed = true;
    } catch {
      data = null;
    }
  }

  if (!response.ok) {
    let message = `Cloudflare request failed with HTTP ${response.status}`;
    if (parsed && data?.errors?.[0]?.message) message = data.errors[0].message;
    else if (!parsed && text.trim()) message = text.slice(0, 180);
    const error = new Error(String(message));
    error.status = response.status;
    throw error;
  }

  if (parsed) {
    if (data && Object.hasOwn(data, 'result')) return data.result;
    if (data && Object.hasOwn(data, 'response')) return data.response;
    if (data && Object.hasOwn(data, 'data')) return data.data;
    return data;
  }

  // Binary payload. Return it as base64 so every consumer can treat media
  // payloads the same way.
  if (contentType.includes('json')) return text;
  return raw.toString('base64');
}

// ---------------------------------------------------------------------------
// Payload extractors
//
// Each media family returns its payload in a different shape, so each one has
// its own extractor. They all accept a base64 string, because that is what a
// binary Workers AI response normalises to.
// ---------------------------------------------------------------------------

const DATA_URL_PATTERN = /^data:[^;,]+;base64,/;

/** Strips a data URL prefix and returns the base64 payload. */
export function toBase64Payload(value) {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (DATA_URL_PATTERN.test(trimmed)) {
    return trimmed.slice(trimmed.indexOf(',') + 1);
  }
  return trimmed;
}

/** Returns the mime type declared by a data URL, if there is one. */
export function dataUrlContentType(value) {
  if (typeof value !== 'string') return '';
  const match = value.trim().match(/^data:([^;,]+);base64,/);
  return match ? match[1] : '';
}

/**
 * Extracts a media payload together with its content type.
 *
 * @returns {{ base64: string, contentType: string }}
 */
export function extractMediaPayload(payload, { contentType = '' } = {}) {
  let raw = payload;
  let declaredType = '';

  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    const candidate = payload.image ?? payload.audio ?? payload.video ?? payload.output ?? payload.data ?? payload.result;
    raw = candidate;
  }

  if (typeof raw === 'string') {
    declaredType = dataUrlContentType(raw);
  }

  const base64 = toBase64Payload(raw);
  if (!base64) return { base64: '', contentType };

  const resolved = declaredType || contentType || guessImageContentType(base64);
  return { base64, contentType: resolved };
}

// Sniffs the format from the base64 header so a JPEG is served as a JPEG.
function guessImageContentType(base64) {
  if (!base64.startsWith('/9j/')) return 'image/png';
  if (base64.startsWith('R0lGOD')) return 'image/gif';
  if (base64.startsWith('UklGR')) return 'image/webp';
  return 'image/png';
}

/** Extracts an image payload from any of the shapes Workers AI returns. */
export function extractImagePayload(payload) {
  if (typeof payload === 'string') return toBase64Payload(payload);
  if (payload && typeof payload === 'object') {
    const candidate = payload.image ?? payload.result ?? payload.output ?? payload.data;
    if (typeof candidate === 'string') return toBase64Payload(candidate);
  }
  return '';
}

/** Extracts an audio payload from any of the shapes Workers AI returns. */
export function extractAudioPayload(payload) {
  if (typeof payload === 'string') return toBase64Payload(payload);
  if (payload && typeof payload === 'object') {
    const candidate = payload.audio ?? payload.result ?? payload.output ?? payload.data;
    if (typeof candidate === 'string') return toBase64Payload(candidate);
  }
  return '';
}

/** Extracts a video payload from any of the shapes Workers AI returns. */
export function extractVideoPayload(payload) {
  if (typeof payload === 'string') return toBase64Payload(payload);
  if (payload && typeof payload === 'object') {
    const candidate = payload.video ?? payload.result ?? payload.output ?? payload.data;
    if (typeof candidate === 'string') return toBase64Payload(candidate);
  }
  return '';
}

/** Extracts transcribed text. */
export function extractTranscription(payload) {
  if (typeof payload === 'string') return payload.trim();
  if (payload && typeof payload === 'object') {
    const candidate = payload.text ?? payload.transcription ?? payload.transcript ?? payload.result;
    if (typeof candidate === 'string') return candidate.trim();
  }
  return '';
}

/** Extracts generated text from the several text response shapes. */
export function extractGeneratedText(payload) {
  if (typeof payload === 'string') return payload.trim();
  if (payload && typeof payload === 'object') {
    const choice = payload.choices?.[0];
    const content = choice?.message?.content ?? choice?.text ?? choice?.delta?.content;
    if (typeof content === 'string') return content.trim();
    if (typeof payload.response === 'string') return payload.response.trim();
    if (typeof payload.text === 'string') return payload.text.trim();
    if (typeof payload.result === 'string') return payload.result.trim();
  }
  return '';
}

/** Extracts an embedding matrix. */
export function extractEmbeddings(payload) {
  let rows = payload;
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    rows = payload.data ?? payload.embeddings ?? payload.result;
  }
  if (!Array.isArray(rows)) return null;
  return rows.map((row) => (Array.isArray(row) ? row : [row]));
}

/**
 * Builds the list of attempts for a capability, trying every configured model
 * on every configured account. The caller runs them in order until one works.
 */
export function buildAttempts(kind, { bodyFor, accounts } = {}) {
  const attempts = [];
  const accountList = accounts || getCloudflareAccounts();

  for (const modelName of getModelList(kind)) {
    for (const account of accountList) {
      attempts.push({
        modelName,
        account,
        label: `${modelName} (${account.accountId.slice(0, 8)})`,
        run: () => runCloudflareModel(modelName, bodyFor(modelName), account),
      });
    }
  }

  return attempts;
}
