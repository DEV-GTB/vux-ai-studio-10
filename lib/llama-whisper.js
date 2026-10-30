// Llama and Whisper, through the Groq API.
//
// The models this file serves:
//   conversation  Qwen 3.8, Llama 3.3/3.4, GPT-OSS (whichever answers)
//   speech in     Whisper-large-v3-turbo
//   speech out    PlayAI TTS
//
// Groq serves an OpenAI-compatible chat API, speech synthesis, and speech
// recognition. The inference is fast, which makes it a good first fallback
// when the primary service is slow.
//
// Groq retires models now and then, so the model list is tried in order and
// a retired model moves on to the next one instead of failing the request.

const GROQ_BASE = 'https://api.groq.com/openai/v1';

export const GROQ_CHAT_MODEL = process.env.GROQ_CHAT_MODEL || 'qwen/qwen3.8-27b';

// Groq retires models now and then. When the configured one is gone the
// next model in the list answers instead of the route failing.
export const GROQ_CHAT_MODELS = [
  process.env.GROQ_CHAT_MODEL,
  'qwen/qwen3.8-27b',
  'openai/gpt-oss-120b',
  'openai/gpt-oss-20b',
].filter(Boolean);

/**
 * @returns {string} the model the conversation goes to
 *
 * The environment is read here and not only when the module is loaded, so a
 * change to the setting is picked up without a restart.
 */
export function getGroqChatModel() {
  return process.env.GROQ_CHAT_MODEL || GROQ_CHAT_MODEL;
}

export const GROQ_WHISPER_MODEL = process.env.GROQ_WHISPER_MODEL || 'whisper-large-v3-turbo';
export const GROQ_TTS_MODEL = process.env.GROQ_TTS_MODEL || 'playai-tts';

export function getGroqApiKey() {
  return process.env.GROQ_API_KEY || '';
}

export function hasGroq() {
  const key = getGroqApiKey();
  return Boolean(key && key !== 'your_groq_api_key_here');
}

function authHeaders(extra = {}) {
  return {
    Authorization: `Bearer ${getGroqApiKey()}`,
    ...extra,
  };
}

/**
 * Runs a chat completion.
 *
 * @param {Array<{role: string, content: string}>} messages
 * @param {object} [options]
 */
export async function callGroq(messages, { model = getGroqChatModel(), maxTokens = 2048, temperature = 0.7 } = {}) {
  const models = [...new Set([model, ...GROQ_CHAT_MODELS].filter(Boolean))];
  let lastError = null;

  for (const candidate of models) {
    try {
      return await requestGroqCompletion(messages, candidate, maxTokens, temperature);
    } catch (error) {
      lastError = error;
      // A retired model is worth replacing straight away. Any other failure
      // is about the service, not the model, so it is reported as it is.
      if (error?.status !== 404) throw error;
    }
  }

  throw lastError || new Error('Groq returned no answer.');
}

async function requestGroqCompletion(messages, model, maxTokens, temperature) {
  const response = await fetch(`${GROQ_BASE}/chat/completions`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ model, messages, max_tokens: maxTokens, temperature, stream: false }),
  });

  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = {}; }

  if (!response.ok) {
    const message = data.error?.message || data.error || `Groq returned HTTP ${response.status}`;
    const error = new Error(String(message));
    error.status = response.status;
    throw error;
  }

  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('The service returned an empty response.');
  }
  return content.trim();
}

/**
 * Transcribes audio.
 *
 * @param {Buffer} audio
 * @param {string} filename
 */
export async function callGroqTranscription(audio, filename = 'audio.wav', { model = GROQ_WHISPER_MODEL } = {}) {
  const form = new FormData();
  form.append('file', new Blob([audio], { type: 'audio/wav' }), filename);
  form.append('model', model);

  const response = await fetch(`${GROQ_BASE}/audio/transcriptions`, {
    method: 'POST',
    headers: authHeaders(),
    body: form,
  });

  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = {}; }

  if (!response.ok) {
    const message = data.error?.message || data.error || `Groq returned HTTP ${response.status}`;
    const error = new Error(String(message));
    error.status = response.status;
    throw error;
  }

  const transcription = data.text;
  if (typeof transcription !== 'string' || !transcription.trim()) {
    throw new Error('The service returned no text.');
  }
  return transcription.trim();
}

/**
 * Speaks a line of text.
 */
export async function callGroqSpeech(text, { model = GROQ_TTS_MODEL, voice = 'alloy' } = {}) {
  const response = await fetch(`${GROQ_BASE}/audio/speech`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ model, voice, input: text, response_format: 'wav' }),
  });

  if (!response.ok) {
    const text2 = await response.text().catch(() => '');
    throw new Error(text2.slice(0, 160) || `Groq returned HTTP ${response.status}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (!buffer.length) throw new Error('The service returned empty audio.');
  return { buffer, contentType: response.headers.get('content-type') || 'audio/wav' };
}
