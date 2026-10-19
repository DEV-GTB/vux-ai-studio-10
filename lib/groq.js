// Groq.
//
// Groq serves an OpenAI-compatible chat API, speech synthesis, and speech
// recognition. The inference is fast, which makes it a good first fallback
// when the primary service is slow.

const GROQ_BASE = 'https://api.groq.com/openai/v1';

export const GROQ_CHAT_MODEL = process.env.GROQ_CHAT_MODEL || 'llama-3.3-70b-versatile';
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
export async function callGroq(messages, { model = GROQ_CHAT_MODEL, maxTokens = 2048, temperature = 0.7 } = {}) {
  const response = await fetch(`${GROQ_BASE}/chat/completions`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ model, messages, max_tokens: maxTokens, temperature }),
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
