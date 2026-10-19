// Gemini.
//
// The conversation and image services are reached through the same key. The
// calls live here so the chat route, the image route, and the unified model
// layer all behave identically.

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

export function getGeminiApiKey() {
  return process.env.GEMINI_API_KEY || '';
}

export function hasGeminiKey() {
  const key = getGeminiApiKey();
  return Boolean(key && key !== 'your_gemini_api_key_here');
}

export function getGeminiModel() {
  return process.env.GEMINI_MODEL || 'gemma-4-31b-it';
}

export function getGeminiImageModels() {
  const configured = String(process.env.GEMINI_IMAGE_MODELS || '')
    .split(',')
    .map((model) => model.trim())
    .filter(Boolean);
  return configured.length ? [...new Set(configured)] : ['gemini-2.5-flash-image', 'gemini-3-pro-image'];
}

function toGeminiParts(content) {
  if (typeof content === 'string') return [{ text: content }];
  if (!Array.isArray(content)) return [{ text: '' }];

  return content.flatMap((part) => {
    if (part?.type === 'text' && typeof part.text === 'string') return [{ text: part.text }];
    const imageUrl = part?.type === 'image_url' ? part.image_url?.url : '';
    const imageMatch = typeof imageUrl === 'string'
      ? imageUrl.match(/^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=]+)$/)
      : null;
    return imageMatch ? [{ inlineData: { mimeType: imageMatch[1], data: imageMatch[2] } }] : [];
  });
}

/**
 * Runs a conversation.
 *
 * @param {Array<{role: string, content: any}>} messages
 * @param {object} [options]
 */
export async function callGeminiText(messages, { model = getGeminiModel() } = {}) {
  const apiKey = getGeminiApiKey();
  const isGemma = model.toLowerCase().startsWith('gemma-');
  const systemMessage = messages?.[0]?.role === 'system' ? messages[0] : null;
  const conversation = systemMessage ? messages.slice(1) : messages;

  const contents = conversation.map((message) => ({
    role: message.role === 'assistant' ? 'model' : 'user',
    parts: toGeminiParts(message.content),
  }));

  // A Gemma model has no separate system instruction, so it is folded into
  // the first turn.
  if (isGemma && systemMessage && contents[0]?.role === 'user') {
    contents[0].parts.unshift({ text: systemMessage.content });
  }

  const response = await fetch(`${GEMINI_BASE}/${model}:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...(!isGemma && systemMessage ? { systemInstruction: { parts: [{ text: systemMessage.content }] } } : {}),
      contents,
    }),
  });

  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = {}; }

  if (!response.ok) {
    const message = data.error?.message || `The service returned HTTP ${response.status}`;
    const error = new Error(String(message));
    error.status = response.status;
    throw error;
  }

  const output = data.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('').trim();
  if (!output) throw new Error('The service returned an empty response.');
  return output;
}

/**
 * Generates an image.
 *
 * @param {string} prompt
 * @param {string} [aspectRatio]
 */
export async function callGeminiImage(prompt, aspectRatio, { model } = {}) {
  const apiKey = getGeminiApiKey();
  const models = model ? [model] : getGeminiImageModels();

  let lastError = null;
  for (const candidate of models) {
    try {
      const response = await fetch(`${GEMINI_BASE}/${candidate}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: {
            responseModalities: ['IMAGE'],
            ...(aspectRatio ? { imageConfig: { aspectRatio } } : {}),
          },
        }),
      });

      const text = await response.text();
      let data = {};
      try { data = text ? JSON.parse(text) : {}; } catch { data = {}; }

      if (!response.ok) {
        const error = new Error(data.error?.message || `The service returned HTTP ${response.status}`);
        error.status = response.status;
        throw error;
      }

      const part = data.candidates?.[0]?.content?.parts?.find((entry) => entry.inlineData?.data);
      if (!part?.inlineData?.data) throw new Error('The service returned no image.');

      return {
        buffer: Buffer.from(part.inlineData.data, 'base64'),
        contentType: part.inlineData.mimeType || 'image/png',
      };
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error('The image service is unavailable.');
}
