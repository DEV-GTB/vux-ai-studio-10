// Provider integration for every AI text call.
//
// This module is the single place that knows how to talk to the model
// providers. Both /api/chat and /api/code use it, so provider behaviour,
// fallback order, and error handling stay consistent between the general
// assistant and the coding assistant.

const DEEPSEEK_BASE_URL = 'https://api.deepseek.com/chat/completions';
const HUGGINGFACE_BASE_URL = 'https://router.huggingface.co/v1/chat/completions';
const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

import { getModelList, hasCloudflareAccounts, getCloudflareAccounts, runCloudflareModel, extractImagePayload, extractAudioPayload, extractVideoPayload, extractTranscription, extractGeneratedText, extractEmbeddings } from './cloudflare.js';

// Abandons an attempt that takes too long, so a slow service is replaced
// rather than waited on.
export function withTimeout(promise, timeoutMs, label = 'request') {
  let timer;
  const timeout = new Promise((_resolve, reject) => {
    timer = setTimeout(() => {
      const error = new Error(`The ${label} took too long to answer.`);
      error.code = 'ETIMEDOUT';
      reject(error);
    }, timeoutMs);
  });

  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export function getTextContent(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .filter((part) => part?.type === 'text' && typeof part.text === 'string')
    .map((part) => part.text)
    .join('\n');
}

export function toGeminiParts(content) {
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

export function extractAssistantText(data) {
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content.trim();
  if (Array.isArray(content)) {
    return content.map((part) => typeof part === 'string' ? part : part?.text || '').join('\n').trim();
  }
  return '';
}

export function getCloudflareTextModels(kind = 'text') {
  return getModelList(kind);
}

export function hasHuggingFace() {
  return Boolean(process.env.HF_TOKEN && process.env.HF_TOKEN !== 'your_huggingface_api_key_here');
}

export function hasGemini() {
  return Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'your_gemini_api_key_here');
}

export function hasDeepSeek() {
  return Boolean(process.env.DEEPSEEK_API_KEY && process.env.DEEPSEEK_API_KEY !== 'your_deepseek_api_key_here');
}

export function hasCloudflare() {
  return hasCloudflareAccounts();
}

export function hasAnyProvider() {
  return hasHuggingFace() || hasGemini() || hasDeepSeek() || hasCloudflare();
}

export function getChatModel() {
  return process.env.HF_CHAT_MODEL || 'google/gemma-4-12B-it';
}

export function getDeepSeekModel() {
  return process.env.HF_DEEPSEEK_MODEL || 'deepseek-ai/DeepSeek-V3.2';
}

async function callHuggingFace(messages, model) {
  const response = await fetch(HUGGINGFACE_BASE_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.HF_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model, messages, stream: false }),
  });
  const body = await response.text();
  let data = {};
  try { data = body ? JSON.parse(body) : {}; } catch { data = {}; }

  if (!response.ok) {
    const error = new Error(data?.error?.message || data?.error || 'Chat request failed');
    error.status = response.status;
    throw error;
  }

  const text = extractAssistantText(data);
  if (!text) throw new Error('The chat service returned an empty response.');
  return text;
}

async function callDeepSeek(messages) {
  const response = await fetch(DEEPSEEK_BASE_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.DEEPSEEK_MODEL || 'deepseek-flash',
      messages,
      thinking: { type: 'enabled' },
      reasoning_effort: 'high',
      stream: false,
    }),
  });
  const body = await response.text();
  let data = {};
  try { data = body ? JSON.parse(body) : {}; } catch { data = {}; }

  if (!response.ok) {
    const error = new Error(data?.error?.message || 'Chat request failed');
    error.status = response.status;
    throw error;
  }

  const text = extractAssistantText(data);
  if (!text) throw new Error('The chat service returned an empty response.');
  return text;
}

async function callGemini(messages) {
  const configuredModel = process.env.GEMINI_MODEL || 'gemma-4-31b-it';
  const models = [...new Set([configuredModel, 'gemini-3.6-flash'])];
  let data = {};
  let response;

  for (const model of models) {
    const isGemma = model.toLowerCase().startsWith('gemma-');
    const contents = messages.slice(1).map((message) => ({
      role: message.role === 'assistant' ? 'model' : 'user',
      parts: toGeminiParts(message.content),
    }));
    const systemPrompt = messages[0]?.content || '';
    if (isGemma && contents[0]?.role === 'user') {
      contents[0].parts.unshift({ text: systemPrompt });
    }

    response = await fetch(`${GEMINI_BASE_URL}/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...(!isGemma ? { systemInstruction: { parts: [{ text: systemPrompt }] } } : {}),
        contents,
      }),
    });

    const responseText = await response.text();
    try { data = responseText ? JSON.parse(responseText) : {}; } catch { data = {}; }
    if (response.ok || (response.status !== 404 && response.status !== 429 && response.status < 500)) break;
  }

  if (!response?.ok) {
    const error = new Error(data.error?.message || 'Chat request failed');
    error.status = response?.status;
    throw error;
  }

  const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('\n').trim();
  if (!text) throw new Error('The chat service returned an empty response.');
  return text;
}

async function callCloudflareText(messages, modelName) {
  const accounts = getCloudflareAccounts();

  let lastError = null;
  for (const account of accounts) {
    try {
      const payload = await runCloudflareModel(modelName, { messages }, account);
      const text = extractGeneratedText(payload);
      if (!text) {
        lastError = new Error('The service returned an empty response.');
        continue;
      }
      return text;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error('No Cloudflare account is configured.');
}

// Runs the request through the configured services, in order, and returns the
// first successful response.
//
// The order is deliberate:
//
//   conversation   primary service -> secondary service -> remaining services
//   coding         coding service  -> secondary service -> remaining services
//
// The secondary service is tried next because it is the one that is always
// reachable, and a slow primary service should not hold up the answer. Every
// attempt has a timeout, so a slow service is abandoned rather than waited on.
//
// The returned `provider` value is for server-side logging only. It is never
// sent to the browser: the product does not expose which service answered.
export async function runProviderChain({
  messages,
  isCoding = false,
  preferCode = false,
  logger = console,
  timeouts = {},
} = {}) {
  const chatModel = getChatModel();
  const deepSeekModel = getDeepSeekModel();
  const huggingFaceModels = preferCode || isCoding
    ? [...new Set([deepSeekModel, chatModel])]
    : [...new Set([chatModel, deepSeekModel])];

  // A slow service is replaced rather than waited on. The conversation
  // budget is short because a chat answer that arrives late is worthless,
  // and the coding budget is longer because a full file takes longer to
  // write than a sentence takes to say.
  const chatTimeoutMs = Number(timeouts.chat) || 15000;
  const codeTimeoutMs = Number(timeouts.code) || 45000;
  const limit = isCoding || preferCode ? codeTimeoutMs : chatTimeoutMs;

  let lastError = null;

  const attempt = async (label, run) => {
    try {
      const text = await withTimeout(run(), limit, label);
      if (typeof text !== 'string' || !text.trim()) {
        throw new Error('The service returned an empty response.');
      }
      return text;
    } catch (error) {
      lastError = error;
      logger.warn(`[ai] ${label} did not answer (HTTP ${error?.status || 'timeout' || 'provider-error'}); trying the next configured service.`);
      return null;
    }
  };

  if (preferCode && hasDeepSeek()) {
    const text = await attempt('primary coding service', () => callDeepSeek(messages));
    if (text) return { text, provider: 'primary' };
  }

  if (!isCoding && !preferCode && hasGemini()) {
    const text = await attempt('primary conversation service', () => callGemini(messages));
    if (text) return { text, provider: 'primary' };
  }

  // The secondary service is the fallback for a slow or failing primary.
  // The coding list is used for coding requests, because the models tuned for
  // code answer faster and more accurately for this work.
  if (hasCloudflare()) {
    for (const modelName of getCloudflareTextModels(isCoding || preferCode ? 'coding' : 'text')) {
      const text = await attempt('secondary service', () => callCloudflareText(messages, modelName));
      if (text) return { text, provider: 'secondary' };
    }
  }

  if (hasHuggingFace()) {
    for (const model of huggingFaceModels) {
      const text = await attempt('tertiary service', () => callHuggingFace(messages, model));
      if (text) return { text, provider: 'tertiary' };
    }
  }

  if (isCoding && hasGemini()) {
    const text = await attempt('primary conversation service', () => callGemini(messages));
    if (text) return { text, provider: 'primary' };
  }

  if (!isCoding && hasDeepSeek()) {
    const text = await attempt('coding service', () => callDeepSeek(messages));
    if (text) return { text, provider: 'primary' };
  }

  const error = new Error('No configured AI service completed the request.');
  error.cause = lastError;
  error.status = hasAnyProvider() ? 502 : 503;
  error.providerError = lastError?.status || lastError?.message || 'no credentials configured';
  throw error;
}
