// fal.ai.
//
// fal hosts many models across image, video, speech, music, and language. The
// account has to be in credit for a generation to run: a locked account
// answers with "User is locked. Reason: TOP_UP." for every model, so the
// failure is a billing problem rather than a model problem.

const FAL_RUN_BASE = 'https://fal.run';
const FAL_API_BASE = 'https://fal.ai/api';

export const FAL_MODELS = {
  image: {
    env: 'FAL_IMAGE_MODELS',
    defaults: [
      'fal-ai/flux/schnell',
      'fal-ai/fast-sdxl',
      'fal-ai/kolors',
      'fal-ai/aura-flow',
    ],
  },
  imageEdit: {
    env: 'FAL_IMAGE_EDIT_MODELS',
    defaults: [
      'fal-ai/flux-pro/kontext',
      'fal-ai/bria/eraser',
      'fal-ai/flux/dev/image-to-image',
    ],
  },
  video: {
    env: 'FAL_VIDEO_MODELS',
    defaults: [
      'fal-ai/fast-sdxl/image-to-video',
      'fal-ai/kling-video/v1.6/standard/image-to-video',
    ],
  },
  music: {
    env: 'FAL_MUSIC_MODELS',
    defaults: ['fal-ai/stable-audio'],
  },
  tts: {
    env: 'FAL_TTS_MODELS',
    defaults: ['fal-ai/playht/tts/v3'],
  },
  stt: {
    env: 'FAL_STT_MODELS',
    defaults: ['fal-ai/wizper/speech-to-text'],
  },
  text: {
    env: 'FAL_TEXT_MODELS',
    defaults: ['fal-ai/any-llm'],
  },
};

export function getFalApiKey() {
  return process.env.FAL_API_KEY || '';
}

export function hasFal() {
  const key = getFalApiKey();
  return Boolean(key && key !== 'your_fal_api_key_here');
}

export function getFalModels(kind) {
  const entry = FAL_MODELS[kind];
  if (!entry) return [];
  const configured = String(process.env[entry.env] || '')
    .split(',')
    .map((model) => model.trim())
    .filter(Boolean);
  return configured.length ? [...new Set(configured)] : [...entry.defaults];
}

function authHeaders() {
  return {
    Authorization: `Key ${getFalApiKey()}`,
    'Content-Type': 'application/json',
  };
}

/**
 * Runs a fal model and returns its raw payload.
 *
 * @param {string} model
 * @param {object} body
 */
export async function runFalModel(model, body) {
  const response = await fetch(`${FAL_RUN_BASE}/${model}`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(body),
  });

  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text.slice(0, 200) }; }

  if (!response.ok) {
    const message = data.detail || data.error?.message || data.error || `fal returned HTTP ${response.status}`;
    const error = new Error(String(message));
    error.status = response.status;
    // A locked account is a billing problem and is worth saying so plainly.
    error.locked = /locked/i.test(String(message));
    throw error;
  }

  return data;
}

/** Downloads a file fal produced and returns it as bytes. */
export async function downloadFalFile(url) {
  if (typeof url !== 'string' || !url) throw new Error('The service returned no file.');
  const response = await fetch(url);
  if (!response.ok) throw new Error(`The generated file could not be downloaded (HTTP ${response.status}).`);
  const buffer = Buffer.from(await response.arrayBuffer());
  if (!buffer.length) throw new Error('The generated file was empty.');
  return {
    buffer,
    contentType: response.headers.get('content-type') || 'application/octet-stream',
  };
}

/** The first media URL in a fal payload, whatever shape it used. */
export function extractFalMediaUrl(payload) {
  if (!payload || typeof payload !== 'object') return '';
  const candidates = [
    payload.images?.[0]?.url,
    payload.image?.url,
    payload.video?.url,
    payload.audio?.url,
    payload.output?.url,
    payload.url,
  ];
  return candidates.find((value) => typeof value === 'string' && value) || '';
}

/** The text in a fal payload, whatever shape it used. */
export function extractFalText(payload) {
  if (typeof payload === 'string') return payload.trim();
  if (!payload || typeof payload !== 'object') return '';
  const candidates = [
    payload.text,
    payload.output,
    payload.transcription,
    payload.choices?.[0]?.message?.content,
    payload.choices?.[0]?.text,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
  }
  return '';
}

/** Lists the models the account can reach. Useful for a capability check. */
export async function listFalModels(keywords = '', limit = 20) {
  const response = await fetch(`${FAL_API_BASE}/models?keywords=${encodeURIComponent(keywords)}&limit=${limit}`, {
    headers: { Authorization: `Key ${getFalApiKey()}` },
  });
  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = {}; }
  if (!response.ok) throw new Error(`fal model list failed with HTTP ${response.status}`);
  return (data.items || data.models || []).map((item) => item.id).filter(Boolean);
}
