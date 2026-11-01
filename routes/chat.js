import { Router } from 'express';
import Cloudflare from 'cloudflare';
import { IDENTITY_PROMPT, scrubIdentity, GENERIC_ERROR, getIdentityResponse } from '../lib/identity.js';
import { withTimeout } from '../lib/providers.js';
import { generate, CAPABILITY } from '../lib/aiProviders.js';
import { callGroq, getGroqChatModel } from '../lib/llama-whisper.js';
import { INDIA_KNOWLEDGE_PROMPT } from '../lib/knowledge.js';
import { searchKnowledge } from '../lib/knowledgeStore.js';
import { buildMemoryContext } from '../lib/memory.js';
import { STUDIO_TOOL_GUIDANCE } from '../lib/promptBuilder.js';
import { buildLiveContext } from '../lib/liveContext.js';
import { looksLikeSearchRequest, webSearch } from '../lib/webSearch.js';

const router = Router();

// A slow service is replaced rather than waited on. A chat answer that
// arrives late is worth nothing to the person waiting for it.
const CHAT_TIMEOUT_MS = Number(process.env.CHAT_TIMEOUT_MS) || 15000;
const CODING_TIMEOUT_MS = Number(process.env.CODING_TIMEOUT_MS) || 45000;
const DEFAULT_CLOUDFLARE_CODE_MODELS = [
  '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
];

const FORCE_ENGLISH_INSTRUCTIONS = `
You are VUX AI.
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

// Chat image tool triggers: create / generate / make / draw / render / design /
// imagine / art requests send the image straight to the image model.
const IMAGE_REQUEST_TRIGGERS = [
  'create image', 'create an image', 'generate image', 'generate an image', 'make image', 'make an image',
  'draw image', 'draw an image', 'paint image', 'paint an image', 'render image', 'render an image',
  'design image', 'design an image', 'compose image', 'compose an image', 'visualize image', 'visualise image',
  'imagine image', 'imagine an image', 'generate art', 'create art', 'make art', 'generate artwork', 'create artwork',
  'make artwork', 'generate illustration', 'create illustration', 'generate wallpaper', 'create wallpaper',
  'generate poster', 'create poster', 'generate logo', 'create logo', 'generate picture', 'create picture',
  'generate photo', 'create photo', 'generate visual', 'create visual', 'generate graphic', 'create graphic',
  'generate drawing', 'create drawing', 'generate sketch', 'create sketch', 'generate character', 'create character',
  'generate scene', 'create scene', 'generate art',
];

function looksLikeImageRequest(text = '') {
  const value = String(text || '').toLowerCase();
  if (!value.trim()) return false;
  return IMAGE_REQUEST_TRIGGERS.some((trigger) => value.includes(trigger));
}

const IMAGE_EDIT_TRIGGERS = [
  'edit this image', 'edit the image', 'edit image', 'edit photo', 'edit picture', 'edit artwork',
  'edit the picture', 'edit the photo', 'modify this image', 'modify the image', 'modify photo', 'modify picture',
  'change this image', 'change the image', 'change photo', 'change picture', 'transform this image', 'transform photo',
  'transform picture', 'remix this image', 'remix photo', 'remix picture', 'variate this image', 'variate image',
  'variate photo', 'variate picture', 'variation of this image', 'reimagine this image', 'reimagine the image',
  'reimagine photo', 'reimagine picture', 'reimagine artwork', 'update this image', 'update the image',
  'adjust this image', 'adjust photo', 'restyle this image', 'reimagine image',
];

function looksLikeImageEditRequest(text = '') {
  const value = String(text || '').toLowerCase();
  if (!value.trim()) return false;
  return IMAGE_EDIT_TRIGGERS.some((trigger) => value.includes(trigger));
}

function findImageDataUrl(content) {
  const parts = Array.isArray(content) ? content : [];
  for (const part of parts) {
    if (part?.type === 'image_url' && typeof part.image_url?.url === 'string') return part.image_url.url;
  }
  return '';
}

async function generateImageForChat(prompt, imageUrl) {
  const { result } = await generate(CAPABILITY.IMAGE, {
    prompt,
    ...(imageUrl ? { imageUrl } : {}),
    width: 1024,
    height: 1024,
  });
  return `data:${result.contentType || 'image/png'};base64,${result.buffer.toString('base64')}`;
}

function sendChatText(res, text, provider, model, image) {
  res.setHeader('X-Vux-AI-Provider', provider || 'unknown');
  res.setHeader('X-Vux-AI-Model', model || provider || 'unknown');
  return res.json({ text, ...(image ? { image } : {}) });
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

function buildMessages(messages, extraKnowledge = '', extraMemory = '', liveContext = '') {
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

  const memoryBlock = extraMemory
    ? `\n\n${extraMemory}`
    : '';

  return [
    { role: 'system', content: `${IDENTITY_PROMPT}\n\n${FORCE_ENGLISH_INSTRUCTIONS}\n\n${INDIA_KNOWLEDGE_PROMPT}${extraKnowledge ? `\n\nRETRIEVED KNOWLEDGE (cite when used; verify time-sensitive facts):\n${extraKnowledge}` : ''}${memoryBlock}${liveContext ? `\n\n${liveContext}` : ''}${STUDIO_TOOL_GUIDANCE ? `\n\n${STUDIO_TOOL_GUIDANCE}` : ''}` },
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

  // A thinking model returns its reasoning as extra parts. Those are not the
  // answer, so they are left out of what the reader sees.
  const text = data.candidates?.[0]?.content?.parts
    ?.filter((part) => part?.thought !== true)
    ?.map((part) => part.text || '')
    .join('\n')
    .trim();
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
  if (identityResponse) return sendChatText(res, identityResponse, 'VUX AI');

  const latestUserMessageForKb = [...messages].reverse().find((m) => (m?.role || '').toLowerCase() === 'user');
  const latestUserText = typeof latestUserMessageForKb?.content === 'string'
    ? latestUserMessageForKb.content
    : Array.isArray(latestUserMessageForKb?.content)
      ? latestUserMessageForKb.content.map((p) => (typeof p === 'string' ? p : p?.text || '')).join(' ')
      : '';
  const retrieved = latestUserText ? searchKnowledge(latestUserText, 5) : [];
  const extraKnowledge = retrieved
    .map((r) => '- [' + String(r.source || '') + '/' + String(r.category || '') + '] ' + String(r.text || '').trim().slice(0, 600))
    .join('\n');
  // What the user asked Vux to remember is saved and recalled here. A failure
  // here must never take the chat down with it.
  let memoryContext = '';
  try {
    memoryContext = await buildMemoryContext(latestUserText);
  } catch (error) {
    console.warn('[chat] memory pass failed:', error?.message || error);
  }
  // Live context and the web search tool keep answers current without a slow
  // provider round trip per question. Both are best effort: a failure here must
  // never take the chat down, the provider answer still goes out.
  const latestUserMessage = [...identityMessages].reverse().find((message) => message.role === 'user');
  const isCodingEarly = looksLikeCodingRequest(latestUserMessage?.content || '');
  const latestUserHasImage = Array.isArray(latestUserMessage?.content)
    && latestUserMessage.content.some((part) => part?.type === 'image_url');
  const wantsLiveContext = Boolean(latestUserText)
    && !isCodingEarly
    && !latestUserHasImage
    && !looksLikeImageRequest(latestUserText)
    && !looksLikeImageEditRequest(latestUserText);
  let liveContext = '';
  if (wantsLiveContext) {
    try {
      liveContext = await buildLiveContext(latestUserText);
    } catch (error) {
      console.warn('[chat] live context pass failed:', error?.message || error);
    }
  }
  let webKnowledge = '';
  if (wantsLiveContext && looksLikeSearchRequest(latestUserText)) {
    try {
      const search = await webSearch(latestUserText, { maxResults: 5 });
      const results = Array.isArray(search?.results) ? search.results : [];
      if (results.length) {
        const webResultLines = results.map((result) => '- ' + String(result.title || 'Untitled') + ' - ' + String(result.url || '')).join('\n');
        webKnowledge = '\n\nWEB SEARCH RESULTS (cite sources, verify before answering):\n' + webResultLines;
      }
    } catch (error) {
      console.warn('[chat] web search pass failed:', error?.message || error);
    }
  }
  const contextBlock = [liveContext, webKnowledge].filter(Boolean).join('\n\n');
  const normalizedMessages = buildMessages(messages, extraKnowledge, memoryContext, contextBlock);
  const isCoding = isCodingEarly;

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

  // Chat image tool: a create / generate / make / draw / design request goes
  // straight to the image model and the result comes back inside the chat
  // answer. An attached image plus an edit / remix / vary request edits it.
  const chatImagePrompt = getTextContent(latestUserMessage?.content);
  const imageReferenceUrl = hasImageAttachment ? findImageDataUrl(latestUserMessage?.content) : '';
  const wantsImage = looksLikeImageRequest(chatImagePrompt) || (Boolean(imageReferenceUrl) && looksLikeImageEditRequest(chatImagePrompt));

  if (wantsImage) {
    try {
      const { result, provider, model } = await generate(CAPABILITY.IMAGE, {
        prompt: chatImagePrompt,
        ...(imageReferenceUrl ? { imageUrl: imageReferenceUrl } : {}),
        width: 1024,
        height: 1024,
      });
      const image = `data:${result.contentType || 'image/png'};base64,${result.buffer.toString('base64')}`;
      const kind = imageReferenceUrl ? 'edited' : 'generated';
      return sendChatText(
        res,
        scrubIdentity(`Here is your ${kind} image. Answered by ${provider} using ${model || 'the image service'}. Your image is ready below.`),
        provider,
        model,
        image,
      );
    } catch (error) {
      console.warn('[chat] image tool did not answer:', error?.message || error);
    }
  }

  let lastError = null;
  if (!hasImageAttachment && isCoding && hasCloudflare) {
    for (const model of getCloudflareCodeModels()) {
      try {
        const text = await callCloudflare(normalizedMessages, model);
        return sendChatText(res, scrubIdentity(text), `Cloudflare ${model}`, model);
      } catch (error) {
        lastError = error;
        console.warn(`[chat] Cloudflare Workers AI model ${model} failed; trying the next model.`);
      }
    }
  }

  if (!hasImageAttachment && hasGroq) {
    try {
      const text = await callGroq(normalizedMessages);
      return sendChatText(res, scrubIdentity(text), 'Groq', getGroqChatModel());
    } catch (error) {
      lastError = error;
      console.warn('[chat] Groq route failed; trying the next configured service:', error?.status || error?.message);
    }
  }

  if (isCoding && hasDeepSeek) {
    try {
      const text = await callDeepSeek(normalizedMessages);
      return sendChatText(res, scrubIdentity(text), 'DeepSeek', process.env.DEEPSEEK_MODEL || 'deepseek-flash');
    } catch (error) {
      lastError = error;
      console.warn(`[chat] DeepSeek route failed with HTTP ${error?.status || 'provider-error'}; trying the next configured service.`);
    }
  }

  if (!isCoding && hasGemini) {
    try {
      const text = await callGemini(normalizedMessages);
      return sendChatText(res, scrubIdentity(text), 'Gemini', process.env.GEMINI_MODEL || 'gemma-4-31b-it');
    } catch (error) {
      lastError = error;
      console.warn('[chat] Gemini route failed; trying the next configured service:', error?.status || 'provider-error');
    }
  }


  if (hasMistral) {
    try {
      const text = await callMistral(normalizedMessages);
      return sendChatText(res, scrubIdentity(text), 'Mistral', process.env.MISTRAL_MODEL || 'mistral-small-latest');
    } catch (error) {
      lastError = error;
      console.warn('[chat] Mistral route failed:', error?.status || error?.message);
    }
  }

  if (hasHuggingFace) {
    for (const model of huggingFaceModels) {
      try {
        const text = await callHuggingFace([systemMessage, ...userMessages], model);
        return sendChatText(res, scrubIdentity(text), 'Hugging Face', model);
      } catch (error) {
        lastError = error;
        console.warn('[chat] Hugging Face route failed; trying the next configured service.');
      }
    }
  }

  if (!hasImageAttachment && !isCoding && hasCloudflare) {
    try {
      const text = await callCloudflare(normalizedMessages);
      return sendChatText(res, scrubIdentity(text), 'Cloudflare', process.env.CLOUDFLARE_CHAT_MODEL || '@cf/moonshotai/kimi-k2.7-code');
    } catch (error) {
      lastError = error;
      console.warn('[chat] Cloudflare Workers AI fallback failed.');
    }
  }

  if (isCoding && hasGemini) {
    try {
      const text = await callGemini(normalizedMessages);
      return sendChatText(res, scrubIdentity(text), 'Gemini', process.env.GEMINI_MODEL || 'gemma-4-31b-it');
    } catch (error) {
      lastError = error;
      console.error('[chat] configured fallback failed:', error?.status || error?.message || 'unknown error');
    }
  }

  if (!isCoding && hasDeepSeek) {
    try {
      const text = await callDeepSeek(normalizedMessages);
      return sendChatText(res, scrubIdentity(text), 'DeepSeek', process.env.DEEPSEEK_MODEL || 'deepseek-flash');
    } catch (error) {
      lastError = error;
      console.error('[chat] DeepSeek fallback failed:', error?.status || error?.message || 'unknown error');
    }
  }

  console.error('[chat] no configured service completed the request:', lastError?.status || lastError?.message || 'no credentials configured');
  return res.status(hasHuggingFace || hasGemini || hasDeepSeek || hasGroq || hasCloudflare ? 502 : 503).json({ error: GENERIC_ERROR.chat });
});

export default router;