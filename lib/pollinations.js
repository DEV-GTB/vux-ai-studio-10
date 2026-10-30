// Pollinations.
//
// A free image and speech source that needs no key and no login. It is the
// only provider in the set that always works, so it is the first attempt for
// image generation and the last resort for speech.

const IMAGE_BASE = 'https://image.pollinations.ai';
const TEXT_BASE = 'https://text.pollinations.ai';

export const POLLINATION_IMAGE_MODELS = ['flux', 'turbo', 'kontext'];
export const POLLINATION_AUDIO_MODELS = ['openai', 'kokoro', 'piper'];

/**
 * Generates an image from a prompt.
 *
 * @param {object} input
 * @param {string} input.prompt
 * @param {number} [input.width]
 * @param {number} [input.height]
 * @param {string} [input.model]
 * @param {number} [input.seed]
 * @returns {Promise<{ buffer: Buffer, contentType: string }>}
 */
export async function generatePollinationsImage({
  prompt,
  width = 1024,
  height = 1024,
  model = 'flux',
  seed,
  nologo = true,
} = {}) {
  if (!prompt || !String(prompt).trim()) {
    throw new Error('A prompt is required.');
  }

  const query = new URLSearchParams({
    width: String(width),
    height: String(height),
    model: String(model),
    nologo: nologo ? 'true' : 'false',
  });
  if (seed !== undefined && seed !== null) query.set('seed', String(seed));

  const response = await fetch(`${IMAGE_BASE}/prompt/${encodeURIComponent(String(prompt).trim())}?${query}`);

  if (!response.ok) {
    throw new Error(`The free image service returned HTTP ${response.status}.`);
  }

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.startsWith('image/')) {
    throw new Error('The free image service did not return an image.');
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (!buffer.length) throw new Error('The free image service returned an empty image.');

  return { buffer, contentType };
}

/**
 * Speaks a line of text.
 *
 * @param {object} input
 * @param {string} input.text
 * @param {string} [input.voice]
 * @param {string} [input.model]
 * @returns {Promise<{ buffer: Buffer, contentType: string }>}
 */
export async function generatePollinationsSpeech({
  text,
  voice = 'alloy',
  model = 'openai',
} = {}) {
  if (!text || !String(text).trim()) {
    throw new Error('A text is required.');
  }

  const url = `${TEXT_BASE}/${encodeURIComponent(model)}/${encodeURIComponent(voice)}/${encodeURIComponent(String(text).trim())}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`The free speech service returned HTTP ${response.status}.`);
  }

  const contentType = response.headers.get('content-type') || '';
  const buffer = Buffer.from(await response.arrayBuffer());
  if (!buffer.length) throw new Error('The free speech service returned empty audio.');

  return { buffer, contentType: contentType || 'audio/mpeg' };
}

export function hasPollinations() {
  // Always available: it needs no credentials.
  return true;
}
