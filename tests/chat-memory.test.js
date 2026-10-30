import './helpers/memoryDb.js';
import test, { after, afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createServer } from 'node:http';
import chatRouter from '../routes/chat.js';

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use('/api/chat', chatRouter);

const server = createServer(app);
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const baseUrl = `http://127.0.0.1:${server.address().port}`;
const nativeFetch = globalThis.fetch;

after(async () => {
  globalThis.fetch = nativeFetch;
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

afterEach(() => {
  globalThis.fetch = nativeFetch;
});

beforeEach(() => {
  // Only the Hugging Face route is configured, so one prompt is captured
  // and nothing else is called.
  process.env.HF_TOKEN = 'test-huggingface-token';
  process.env.HF_CHAT_MODEL = 'google/gemma-test';
  process.env.GEMINI_API_KEY = '';
  process.env.GROQ_API_KEY = '';
  process.env.DEEPSEEK_API_KEY = '';
  process.env.CLOUDFLARE_API_TOKEN = '';
  process.env.CLOUDFLARE_ACCOUNT_ID = '';
});

let capturedSystemPrompt = '';

function capturePrompt() {
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    capturedSystemPrompt = body.messages[0].content;
    return new Response(JSON.stringify({ choices: [{ message: { content: 'An answer.' } }] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };
}

async function ask(content) {
  capturedSystemPrompt = '';
  const response = await nativeFetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: [{ role: 'user', content }] }),
  });
  assert.equal(response.status, 200);
  return response.json();
}

test('a message asking Vux to remember is stored and passed to the model', async () => {
  capturePrompt();
  await ask('Remember these related words: quantum, photon, entropy');

  assert.match(capturedSystemPrompt, /long-term memory/i);
  assert.match(capturedSystemPrompt, /quantum/);
  assert.match(capturedSystemPrompt, /entropy/);
});

test('a later related message brings the memory back as context', async () => {
  capturePrompt();
  await ask('Explain quantum tunnelling like I am new to it');

  assert.match(capturedSystemPrompt, /RECALLED MEMORY/i);
  assert.match(capturedSystemPrompt, /quantum/);
});

test('an unrelated message carries no memory', async () => {
  capturePrompt();
  await ask('What is the capital of France?');

  assert.equal(/RECALLED MEMORY/i.test(capturedSystemPrompt), false);
});
