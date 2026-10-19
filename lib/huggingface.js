// Hugging Face inference.
//
// The router is OpenAI-compatible for chat. Image and embedding models are
// reached through the same router with a different body shape.
//
// A token with no credits answers with "You have no remaining credits". That
// is a billing problem, so the failure is reported plainly rather than hidden
// behind a generic message.

const ROUTER_BASE = 'https://router.huggingface.co';

export const HF_CHAT_MODEL = process.env.HF_CHAT_MODEL || 'google/gemma-4-12B-it';
export const HF_IMAGE_MODEL = process.env.HF_IMAGE_MODEL || 'black-forest-labs/FLUX.1-Krea-dev';
export const HF_EMBEDDING_MODEL = process.env.HF_EMBEDDING_MODEL || 'sentence-transformers/all-MiniLM-L6-v2';

export function getHuggingFaceToken() {
  return process.env.HF_TOKEN || '';
}

export function hasHuggingFace() {
  const token = getHuggingFaceToken();
  return Boolean(token && token !== 'your_huggingface_api_key_here');
}

function authHeaders(extra = {}) {
  return {
    Authorization: `Bearer ${getHuggingFaceToken()}`,
    ...extra,
  };
}

/** Runs a chat completion. */
export async function callHuggingFace(messages, model = HF_CHAT_MODEL) {
  const response = await fetch(`${ROUTER_BASE}/v1/chat/completions`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ model, messages, stream: false }),
  });

  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = {}; }

  if (!response.ok) {
    const message = data.error?.message || data.error || `The service returned HTTP ${response.status}`;
    const error = new Error(String(message));
    error.status = response.status;
    error.noCredits = /no remaining credits/i.test(String(message));
    throw error;
  }

  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('The service returned an empty response.');
  }
  return content.trim();
}

/** Generates an image. */
export async function generateHuggingFaceImage(prompt, {
  model = HF_IMAGE_MODEL,
  width = 1024,
  height = 1024,
  steps = 8,
} = {}) {
  const response = await fetch(`${ROUTER_BASE}/hf-inference/models/${model}`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      inputs: prompt,
      parameters: { width, height, num_inference_steps: steps },
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    const error = new Error(text.slice(0, 180) || `The service returned HTTP ${response.status}`);
    error.status = response.status;
    error.noCredits = /no remaining credits/i.test(text);
    throw error;
  }

  const contentType = response.headers.get('content-type') || '';
  const buffer = Buffer.from(await response.arrayBuffer());
  if (!buffer.length) throw new Error('The service returned an empty image.');
  return { buffer, contentType: contentType || 'image/png' };
}

/** Generates embeddings. */
export async function generateHuggingFaceEmbeddings(texts, model = HF_EMBEDDING_MODEL) {
  const response = await fetch(`${ROUTER_BASE}/hf-inference/models/${model}`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ inputs: texts }),
  });

  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = {}; }

  if (!response.ok) {
    const message = data.error?.message || data.error || `The service returned HTTP ${response.status}`;
    const error = new Error(String(message));
    error.status = response.status;
    error.noCredits = /no remaining credits/i.test(String(message));
    throw error;
  }

  const rows = Array.isArray(data) ? data : (data.embeddings || data.data);
  if (!Array.isArray(rows)) throw new Error('The service returned no embeddings.');
  return rows.map((row) => (Array.isArray(row) ? row : [row]));
}
