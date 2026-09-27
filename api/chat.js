import app from '../server.js';

import { IDENTITY_PROMPT, scrubIdentity, GENERIC_ERROR } from '../lib/identity.js';

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

function buildMessages(messages) {
  return messages.map((message) => {
    if (message.role !== 'user') {
      return { role: 'assistant', content: String(message.content || '') };
    }

    const content = String(message.content || '');
    const finalContent = looksLikeCodingRequest(content)
      ? content
      : `${content}\n\nMake it in English.`;

    return { role: 'user', content: finalContent };
  });
}

function getIdentityResponse(messages) {
  const latestUserMessage = [...messages].reverse().find((message) => message.role === 'user');
  const text = String(latestUserMessage?.content || '').toLowerCase().trim();
  if (!text) return null;

  if (/^(who are you|what are you|what is this ai|who is this ai)\??$/.test(text)) {
    return 'I am Vux AI Studio, your secure assistant for chat, coding help, and creative work.';
  }
  if (/\b(who (made|created|built|developed) you|who is your founder|who founded you)\b/.test(text)) {
    return 'Vux AI Studio was developed by Game Theory Building Studio. The owners are Muhammed Thariq P.S and Gokul S Nair.';
  }
  if (/\bwho (are|is) the (co-?founders?|engineering team)\b/.test(text)) {
    return 'The AI Engineers are Muhammed Thariq P.S and Gokul S Nair.';
  }
  return null;
}

async function callGemini(messages) {
  const contents = messages.map((message) => ({
    role: message.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: String(message.content || '') }],
  }));

  const configuredModel = process.env.GEMINI_MODEL || 'gemini-3.6-flash';
  const models = [...new Set([configuredModel, 'gemini-3.6-flash'])];
  let data;
  let response;

  for (const model of models) {
    response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: `${IDENTITY_PROMPT}\n\n${FORCE_ENGLISH_INSTRUCTIONS}` }] },
          contents,
        }),
      }
    );

    data = await response.json();
    if (response.ok || response.status !== 404) break;
    console.warn(`[chat] configured model ${model} was not found; trying fallback`);
  }

  if (!response.ok) {
    const err = new Error(data.error?.message || 'Chat request failed');
    err.status = response.status;
    err.payload = data;
    throw err;
  }

  const rawText =
    data.candidates?.[0]?.content?.parts?.map((part) => part.text).join('\n') ||
    "I couldn't generate a response to that — try rephrasing.";

  return scrubIdentity(rawText);
}

async function legacyHandler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const messages = body.messages;

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages array is required' });
  }

  const identityResponse = getIdentityResponse(messages);
  if (identityResponse) return res.status(200).json({ text: identityResponse });

  if (!process.env.GEMINI_API_KEY) {
    console.error('[chat] GEMINI_API_KEY is not set on the server');
    return res.status(500).json({ error: GENERIC_ERROR.chat });
  }

  try {
    const text = await callGemini(buildMessages(messages));
    return res.status(200).json({ text });
  } catch (err) {
    console.error('[chat] Gemini failed:', err?.payload || err.message || err);
    const status = err?.status >= 400 ? err.status : 502;
    return res.status(status >= 500 ? 502 : status).json({ error: GENERIC_ERROR.chat });
  }
}

export default app;
