import test, { after, afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createServer } from 'node:http';
import chatRouter from '../routes/chat.js';
import visionRouter from '../routes/vision.js';

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use('/api/chat', chatRouter);
app.use('/api/vision', visionRouter);

const server = createServer(app);
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const baseUrl = `http://127.0.0.1:${server.address().port}`;
const nativeFetch = globalThis.fetch;
const originalEnvironment = {
  HF_TOKEN: process.env.HF_TOKEN,
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  GEMINI_MODEL: process.env.GEMINI_MODEL,
  DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY,
  DEEPSEEK_MODEL: process.env.DEEPSEEK_MODEL,
  HF_CHAT_MODEL: process.env.HF_CHAT_MODEL,
  HF_DEEPSEEK_MODEL: process.env.HF_DEEPSEEK_MODEL,
  HF_VISION_MODEL: process.env.HF_VISION_MODEL,
  HF_VISION_FALLBACK_MODEL: process.env.HF_VISION_FALLBACK_MODEL,
};

after(async () => {
  globalThis.fetch = nativeFetch;
  for (const [name, value] of Object.entries(originalEnvironment)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

afterEach(() => {
  globalThis.fetch = nativeFetch;
});

beforeEach(() => {
  process.env.HF_TOKEN = 'test-huggingface-token';
  process.env.GEMINI_API_KEY = '';
  process.env.GEMINI_MODEL = 'gemma-4-31b-it';
  process.env.DEEPSEEK_API_KEY = '';
  process.env.DEEPSEEK_MODEL = 'deepseek-chat';
  process.env.HF_CHAT_MODEL = 'google/gemma-test';
  process.env.HF_DEEPSEEK_MODEL = 'deepseek-ai/deepseek-test';
  delete process.env.HF_VISION_MODEL;
  delete process.env.HF_VISION_FALLBACK_MODEL;
});

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function ask(messages) {
  return nativeFetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages }),
  });
}

test('ordinary chat prefers the configured Hugging Face chat route', async () => {
  delete process.env.HF_CHAT_MODEL;
  let requestedModel = '';
  let systemPrompt = '';
  globalThis.fetch = async (url, options) => {
    const request = JSON.parse(options.body);
    requestedModel = request.model;
    systemPrompt = request.messages[0].content;
    return jsonResponse({ choices: [{ message: { content: 'A concise answer.' } }] });
  };

  const response = await ask([{ role: 'user', content: 'Why does the moon have phases?' }]);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).text, 'A concise answer.');
  assert.equal(requestedModel, 'google/gemma-4-12B-it');
  assert.match(systemPrompt, /Vux AI Studio/);
});

test('coding requests prefer the configured DeepSeek route', async () => {
  let requestedModel = '';
  globalThis.fetch = async (_url, options) => {
    requestedModel = JSON.parse(options.body).model;
    return jsonResponse({ choices: [{ message: { content: 'Here is the fix.' } }] });
  };

  const response = await ask([{ role: 'user', content: 'Debug this JavaScript function and fix the error.' }]);
  assert.equal(response.status, 200);
  assert.equal(requestedModel, 'deepseek-ai/deepseek-test');
});

test('coding requests prefer the configured DeepSeek API key', async () => {
  process.env.DEEPSEEK_API_KEY = 'test-deepseek-key';
  let requestedUrl = '';
  let requestBody;
  globalThis.fetch = async (url, options) => {
    requestedUrl = String(url);
    assert.equal(options.headers.Authorization, 'Bearer test-deepseek-key');
    requestBody = JSON.parse(options.body);
    return jsonResponse({ choices: [{ message: { content: 'Direct DeepSeek answer.' } }] });
  };

  const response = await ask([{ role: 'user', content: 'Debug this JavaScript function.' }]);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).text, 'Direct DeepSeek answer.');
  assert.equal(requestedUrl, 'https://api.deepseek.com/chat/completions');
  assert.equal(requestBody.model, 'deepseek-chat');
});

test('Gemma is used for ordinary chat without a systemInstruction field', async () => {
  process.env.GEMINI_API_KEY = 'test-gemini-key';
  let requestedUrl = '';
  let requestBody;
  globalThis.fetch = async (url, options) => {
    requestedUrl = String(url);
    requestBody = JSON.parse(options.body);
    return jsonResponse({ candidates: [{ content: { parts: [{ text: 'Gemma answer.' }] } }] });
  };

  const response = await ask([{ role: 'user', content: 'What is a closure?' }]);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).text, 'Gemma answer.');
  assert.match(requestedUrl, /models\/gemma-4-31b-it:/);
  assert.equal(requestBody.systemInstruction, undefined);
  assert.match(requestBody.contents[0].parts[0].text, /Vux AI Studio/);
});

test('Gemini retries with its fallback model after a transient Gemma error', async () => {
  process.env.GEMINI_API_KEY = 'test-gemini-key';
  const requestedUrls = [];
  globalThis.fetch = async (url) => {
    requestedUrls.push(String(url));
    if (String(url).includes('/gemma-4-31b-it:')) return jsonResponse({ error: { message: 'temporarily unavailable' } }, 503);
    return jsonResponse({ candidates: [{ content: { parts: [{ text: 'Fallback answer.' }] } }] });
  };

  const response = await ask([{ role: 'user', content: 'What is a closure?' }]);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).text, 'Fallback answer.');
  assert.match(requestedUrls[0], /models\/gemma-4-31b-it:/);
  assert.match(requestedUrls[1], /models\/gemini-3.6-flash:/);
});

test('Gemini falls back after both Hugging Face routes fail for coding requests', async () => {
  process.env.GEMINI_API_KEY = 'test-gemini-key';
  const requestedUrls = [];
  globalThis.fetch = async (url) => {
    requestedUrls.push(String(url));
    if (String(url).includes('router.huggingface.co')) return jsonResponse({ error: 'unavailable' }, 503);
    return jsonResponse({ candidates: [{ content: { parts: [{ text: 'Fallback answer.' }] } }] });
  };

  const response = await ask([{ role: 'user', content: 'Debug this JavaScript function.' }]);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).text, 'Fallback answer.');
  assert.equal(requestedUrls.filter((url) => url.includes('router.huggingface.co')).length, 2);
  assert.ok(requestedUrls.some((url) => url.includes('generativelanguage.googleapis.com')));
});

test('attached image parts are preserved for vision chat', async () => {
  let submittedContent;
  globalThis.fetch = async (_url, options) => {
    submittedContent = JSON.parse(options.body).messages.at(-1).content;
    return jsonResponse({ choices: [{ message: { content: 'The image is visible.' } }] });
  };

  const response = await ask([{
    role: 'user',
    content: [
      { type: 'text', text: 'Describe the image.' },
      { type: 'image_url', image_url: { url: 'data:image/png;base64,iVBORw==' } },
    ],
  }]);
  assert.equal(response.status, 200);
  assert.equal(submittedContent[1].image_url.url, 'data:image/png;base64,iVBORw==');
});

test('vision requests include shared identity instructions and the image URL', async () => {
  let submitted;
  globalThis.fetch = async (_url, options) => {
    submitted = JSON.parse(options.body);
    return jsonResponse({ choices: [{ message: { content: 'A red bicycle.' } }] });
  };

  const response = await nativeFetch(`${baseUrl}/api/vision`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      imageUrl: 'https://images.example.test/bicycle.jpg',
      message: 'What is visible?',
    }),
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { reply: 'A red bicycle.' });
  assert.match(submitted.messages[0].content, /Vux AI Studio/);
  assert.equal(submitted.messages[1].content[1].image_url.url, 'https://images.example.test/bicycle.jpg');
  assert.equal(submitted.model, 'google/gemma-4-12B-it');
});

test('vision rejects non-HTTPS image URLs without making an upstream call', async () => {
  let calledUpstream = false;
  globalThis.fetch = async () => {
    calledUpstream = true;
    return jsonResponse({ choices: [{ message: { content: 'unused' } }] });
  };

  const response = await nativeFetch(`${baseUrl}/api/vision`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageUrl: 'http://127.0.0.1/private.png', message: 'Describe this.' }),
  });

  assert.equal(response.status, 400);
  assert.equal(calledUpstream, false);
});

test('vision falls back only when the preferred model is unsupported', async () => {
  process.env.HF_VISION_MODEL = 'google/gemma-test';
  process.env.HF_VISION_FALLBACK_MODEL = 'Qwen/vision-test';
  const requestedModels = [];
  globalThis.fetch = async (_url, options) => {
    const model = JSON.parse(options.body).model;
    requestedModels.push(model);
    if (model === 'google/gemma-test') {
      return jsonResponse({ error: { code: 'model_not_supported' } }, 400);
    }
    return jsonResponse({ choices: [{ message: { content: 'Fallback vision reply.' } }] });
  };

  const response = await nativeFetch(`${baseUrl}/api/vision`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageUrl: 'https://images.example.test/item.jpg', message: 'Describe it.' }),
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { reply: 'Fallback vision reply.' });
  assert.deepEqual(requestedModels, ['google/gemma-test', 'Qwen/vision-test']);
});
