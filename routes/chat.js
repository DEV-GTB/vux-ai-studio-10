import { Router } from 'express';
import Cloudflare from 'cloudflare';
import { IDENTITY_PROMPT, scrubIdentity, GENERIC_ERROR, getIdentityResponse } from '../lib/identity.js';
import { INDIA_KNOWLEDGE_PROMPT } from '../lib/knowledge.js';
import { searchKnowledge } from '../lib/knowledgeStore.js';

const router = Router();
const DEFAULT_CLOUDFLARE_CODE_MODELS = [
  '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
];

const FORCE_ENGLISH_INSTRUCTIONS = `
You are Vux AI Studio.
Reply in English only, even if the user writes in another language.
For non-coding requests, add this instruction to the request: "Make it in English."
Keep the answer clear, helpful, concise, and practical.
`;

function looksLikeCodingRequest(text = '') {
  const value = String(text || '').toLowerCase();
  if (!value.trim()) return false;

  const codeSignals = [
    'code', 'coding', 'debug', 'fix', 'bug', 'function', 'script', 'program', 'app',
    'html', 'css', 'javascript', 'react', 'node', 'python', 'api', 'sql', 'json',
    'class ', 'import ', 'export ', 'const ', 'let ', 'if (', 'for (', 'while (',
    '```', '<html', '</html>', 'console.log', 'return ', 'throw ', 'error'
  ];

  return codeSignals.some((signal) => value.includes(signal));
}

function getTextContent(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .filter((part) => part?.type === 'text' && typeof part.text === 'string')
    .map((part) => part.text)
    .join('\n');
}

function addUserInstruction(content, instruction) {
  if (!Array.isArray(content)) return `${getTextContent(content)}${instruction}`;

  let instructionAdded = false;
  const parts = content.map((part) => {
    if (part?.type !== 'text' || instructionAdded) return part;
    instructionAdded = true;
    return { ...part, text: `${part.text}${instruction}` };
  });
  if (!instructionAdded) parts.unshift({ type: 'text', text: instruction.trim() });
  return parts;
}

function buildMessages(messages, extraKnowledge = '') {
  const normalizedMessages = messages.map((m) => {
    if (m.role !== 'user') {
      return {
        role: 'assistant',
        content: getTextContent(m.content),
      };
    }

    const content = getTextContent(m.content);
    const finalContent = looksLikeCodingRequest(content)
      ? m.content
      : addUserInstruction(m.content, '\n\nMake it in English.');

    return {
      role: 'user',
      content: finalContent,
    };
  });

  return [
    { role: 'system', content: `${IDENTITY_PROMPT}\n\n${FORCE_ENGLISH_INSTRUCTIONS}\n\n${INDIA_KNOWLEDGE_PROMPT}${extraKnowledge ? `\n\nRETRIEVED KNOWLEDGE (cite when used; verify time-sensitive facts):\n${extraKnowledge}` : ''}` },
    ...normalizedMessages,
  ];
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

function extractAssistantText(data) {
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content.trim();
  if (Array.isArray(content)) {
    return content.map((part) => typeof part === 'string' ? part : part?.text || '').join('\n').trim();
  }
  return '';
}

async function callHuggingFace(messages, model) {
  const response = await fetch('https://router.huggingface.co/v1/chat/completions', {
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

async function callGroq(messages) {
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.GROQ_CHAT_MODEL || 'llama-3.3-70b-versatile',
      messages,
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

async function callCloudflare(messages, model = process.env.CLOUDFLARE_CHAT_MODEL || '@cf/meta/llama-3.3-70b-instruct-fp8-fast') {
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/ai/run/${model}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: messages.map((message) => ({
          role: message.role,
          content: getTextContent(message.content),
        })),
        max_tokens: 2048,
      }),
    }
  );
  const body = await response.text();
  let data = {};
  try { data = body ? JSON.parse(body) : {}; } catch { data = {}; }
  if (!response.ok) {
    throw new Error(data?.errors?.[0]?.message || 'Cloudflare Workers AI request failed');
  }
  const text = (typeof data?.result?.response === 'string' && data.result.response.trim())
    || (typeof data?.result?.choices?.[0]?.message?.content === 'string' && data.result.choices[0].message.content.trim())
    || '';
  if (!text) throw new Error('The chat service returned an empty response.');
  return text;
}

function getCloudflareCodeModels() {
  const configuredModels = process.env.CLOUDFLARE_CODE_MODELS
    ?.split(',')
    .map((model) => model.trim())
    .filter(Boolean);
  const models = configuredModels?.length ? configuredModels : DEFAULT_CLOUDFLARE_CODE_MODELS;
  return [...new Set([...models, process.env.CLOUDFLARE_CHAT_MODEL || '@cf/moonshotai/kimi-k2.7-code'])];
}

async function callMistral(messages) {
  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) throw new Error('No Mistral key');
  const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.MISTRAL_MODEL || 'mistral-small-latest',
      messages: messages.map((message) => ({
        role: message.role,
        content: getTextContent(message.content),
      })),
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

async function callDeepSeek(messages) {
  const response = await fetch('https://api.deepseek.com/chat/completions', {
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
    const systemPrompt = messages[0]?.content || `${IDENTITY_PROMPT}\n\n${FORCE_ENGLISH_INSTRUCTIONS}`;
    if (isGemma && contents[0]?.role === 'user') {
      contents[0].parts.unshift({ text: systemPrompt });
    }

    response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(!isGemma ? { systemInstruction: { parts: [{ text: systemPrompt }] } } : {}),
          contents,
        }),
      }
    );

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

// POST /api/chat  { messages: [{ role: 'user'|'assistant', content: string }] }
router.post('/', async (req, res) => {
  const { messages } = req.body;
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages array is required' });
  }

  const identityMessages = messages.map((message) => ({
    ...message,
    content: getTextContent(message.content),
  }));
  const identityResponse = getIdentityResponse(identityMessages);
  if (identityResponse) return res.json({ text: identityResponse });

  const latestUserMessageForKb = [...messages].reverse().find((m) => (m?.role || '').toLowerCase() === 'user');
  const latestUserText = typeof latestUserMessageForKb?.content === 'string'
    ? latestUserMessageForKb.content
    : Array.isArray(latestUserMessageForKb?.content)
      ? latestUserMessageForKb.content.map((p) => (typeof p === 'string' ? p : p?.text || '')).join(' ')
      : '';
  const retrieved = latestUserText ? searchKnowledge(latestUserText, 5) : [];
  const extraKnowledge = retrieved
    .map((r) => `- [${r.source}/${r.category}] ${String(r.text || '').replace(/\s+/g, ' ').slice(0, 600)}`)
    .join('\n');
  const normalizedMessages = buildMessages(messages, extraKnowledge);
  const latestUserMessage = [...identityMessages].reverse().find((message) => message.role === 'user');
  const isCoding = looksLikeCodingRequest(latestUserMessage?.content || '');
  const hasImageAttachment = normalizedMessages.some((message) => Array.isArray(message.content)
    && message.content.some((part) => part?.type === 'image_url'));
  const hasGroq = Boolean(process.env.GROQ_API_KEY && process.env.GROQ_API_KEY !== 'your_groq_api_key_here');
  const hasCloudflare = Boolean(
    process.env.CLOUDFLARE_API_TOKEN
    && process.env.CLOUDFLARE_API_TOKEN !== 'your_cloudflare_api_token_here'
    && process.env.CLOUDFLARE_ACCOUNT_ID
  );
  const hasHuggingFace = Boolean(process.env.HF_TOKEN && process.env.HF_TOKEN !== 'your_huggingface_api_key_here');
  const hasGemini = Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'your_gemini_api_key_here');
  const hasDeepSeek = Boolean(process.env.DEEPSEEK_API_KEY && process.env.DEEPSEEK_API_KEY !== 'your_deepseek_api_key_here');
  const hasMistral = Boolean(process.env.MISTRAL_API_KEY && process.env.MISTRAL_API_KEY !== 'your_mistral_api_key_here');
  const systemMessage = normalizedMessages[0];
  const userMessages = normalizedMessages.slice(1);
  const chatModel = process.env.HF_CHAT_MODEL || 'google/gemma-4-12B-it';
  const deepSeekModel = process.env.HF_DEEPSEEK_MODEL || 'deepseek-ai/DeepSeek-V3.2';
  const huggingFaceModels = isCoding
    ? [...new Set([deepSeekModel, chatModel])]
    : [...new Set([chatModel, deepSeekModel])];

  let lastError = null;
  if (!hasImageAttachment && isCoding && hasCloudflare) {
    for (const model of getCloudflareCodeModels()) {
      try {
        const text = await callCloudflare(normalizedMessages, model);
        return res.json({ text: scrubIdentity(text) });
      } catch (error) {
        lastError = error;
        console.warn(`[chat] Cloudflare Workers AI model ${model} failed; trying the next model.`);
      }
    }
  }

  if (!hasImageAttachment && hasGroq) {
    try {
      const text = await callGroq(normalizedMessages);
      return res.json({ text: scrubIdentity(text) });
    } catch (error) {
      lastError = error;
      console.warn('[chat] Groq route failed; trying the next configured service.');
    }
  }

  if (isCoding && hasDeepSeek) {
    try {
      const text = await callDeepSeek(normalizedMessages);
      return res.json({ text: scrubIdentity(text) });
    } catch (error) {
      lastError = error;
      console.warn(`[chat] DeepSeek route failed with HTTP ${error?.status || 'provider-error'}; trying the next configured service.`);
    }
  }

  if (!isCoding && hasGemini) {
    try {
      const text = await callGemini(normalizedMessages);
      return res.json({ text: scrubIdentity(text) });
    } catch (error) {
      lastError = error;
      console.warn('[chat] Gemini route failed; trying the next configured service:', error?.status || 'provider-error');
    }
  }

  if (hasMistral) {
    try {
      const text = await callMistral(normalizedMessages);
      return res.json({ text: scrubIdentity(text) });
    } catch (error) {
      lastError = error;
      console.warn('[chat] Mistral route failed:', error?.status || error?.message);
    }
  }

  if (hasHuggingFace) {
    for (const model of huggingFaceModels) {
      try {
        const text = await callHuggingFace([systemMessage, ...userMessages], model);
        return res.json({ text: scrubIdentity(text) });
      } catch (error) {
        lastError = error;
        console.warn('[chat] Hugging Face route failed; trying the next configured service.');
      }
    }
  }

  if (!hasImageAttachment && !isCoding && hasCloudflare) {
    try {
      const text = await callCloudflare(normalizedMessages);
      return res.json({ text: scrubIdentity(text) });
    } catch (error) {
      lastError = error;
      console.warn('[chat] Cloudflare Workers AI fallback failed.');
    }
  }

  if (isCoding && hasGemini) {
    try {
      const text = await callGemini(normalizedMessages);
      return res.json({ text: scrubIdentity(text) });
    } catch (error) {
      lastError = error;
      console.error('[chat] configured fallback failed:', error?.status || error?.message || 'unknown error');
    }
  }

  if (!isCoding && hasDeepSeek) {
    try {
      const text = await callDeepSeek(normalizedMessages);
      return res.json({ text: scrubIdentity(text) });
    } catch (error) {
      lastError = error;
      console.error('[chat] DeepSeek fallback failed:', error?.status || error?.message || 'unknown error');
    }
  }

  console.error('[chat] no configured service completed the request:', lastError?.status || lastError?.message || 'no credentials configured');
  return res.status(hasHuggingFace || hasGemini || hasDeepSeek || hasGroq || hasCloudflare ? 502 : 503).json({ error: GENERIC_ERROR.chat });
});

export default router;