import test, { after, afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createServer } from 'node:http';
import codeRouter from '../routes/code.js';

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use('/api/code', codeRouter);

const server = createServer(app);
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const baseUrl = `http://127.0.0.1:${server.address().port}`;
const nativeFetch = globalThis.fetch;

after(async () => {
  globalThis.fetch = nativeFetch;
  await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
});

afterEach(() => {
  globalThis.fetch = nativeFetch;
});

beforeEach(() => {
  process.env.HF_TOKEN = 'test-huggingface-token';
  process.env.GEMINI_API_KEY = '';
  process.env.DEEPSEEK_API_KEY = '';
  process.env.HF_CHAT_MODEL = 'google/gemma-test';
  process.env.HF_DEEPSEEK_MODEL = 'deepseek-test';
});

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function ask(body) {
  return nativeFetch(`${baseUrl}/api/code`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

test('a request is required', async () => {
  const response = await ask({});
  assert.equal(response.status, 400);
});

test('the analyze endpoint reports the detected intent and language without calling a model', async () => {
  let calledUpstream = false;
  globalThis.fetch = async () => {
    calledUpstream = true;
    return jsonResponse({ choices: [{ message: { content: 'unused' } }] });
  };

  const response = await nativeFetch(`${baseUrl}/api/code/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      request: 'Fix the crash in the Python parser',
      activeFile: 'parser.py',
      files: { 'parser.py': 'print(1)' },
    }),
  });

  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.intent, 'fix');
  assert.ok(body.languages.includes('python'));
  assert.equal(calledUpstream, false, 'analyze must not call a provider');
});

test('a valid edit action is returned with the detected metadata', async () => {
  globalThis.fetch = async () => jsonResponse({
    choices: [{
      message: {
        content: JSON.stringify({
          action: 'edit',
          filename: 'app.py',
          content: 'def load():\n    return None\n',
        }),
      },
    }],
  });

  const response = await ask({
    request: 'Fix the parser so it returns None instead of raising',
    activeFile: 'app.py',
    files: { 'app.py': 'def load():\n    raise ValueError()\n' },
  });

  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.action.action, 'edit');
  assert.equal(body.action.filename, 'app.py');
  assert.equal(body.meta.intent, 'fix');
  assert.ok(body.meta.languages.includes('python'));
  assert.ok(body.meta.contextFiles.includes('app.py'));
});

test('the system prompt sent to the model carries the language rules and the action contract', async () => {
  let submitted;
  globalThis.fetch = async (_url, options) => {
    submitted = JSON.parse(options.body);
    return jsonResponse({ choices: [{ message: { content: '{"action":"answer","message":"ok"}' } }] });
  };

  await ask({
    request: 'Fix the Rust error handling',
    activeFile: 'main.rs',
    files: { 'main.rs': 'fn main() {}' },
  });

  const systemPrompt = submitted.messages[0].content;
  assert.match(systemPrompt, /exactly ONE JSON object/i);
  assert.match(systemPrompt, /Rust:/);
  assert.match(systemPrompt, /Result/);
  assert.doesNotMatch(systemPrompt, /Muhammed|Founder/);
});

test('a model that returns an action for a file that does not exist is rejected safely', async () => {
  globalThis.fetch = async () => jsonResponse({
    choices: [{ message: { content: '{"action":"edit","filename":"ghost.js","content":"x"}' } }],
  });

  const response = await ask({
    request: 'Fix the thing',
    activeFile: 'app.js',
    files: { 'app.js': 'const a = 1;' },
  });

  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.action.action, 'answer');
  assert.match(body.action.message, /rejected/i);
  assert.match(body.action.message, /Nothing was changed/);
});

test('a model that tries to escape the workspace is rejected', async () => {
  globalThis.fetch = async () => jsonResponse({
    choices: [{ message: { content: '{"action":"edit","filename":"../../etc/passwd","content":"x"}' } }],
  });

  const response = await ask({
    request: 'Fix the thing',
    activeFile: 'app.js',
    files: { 'app.js': 'const a = 1;' },
  });

  const body = await response.json();
  assert.equal(body.action.action, 'answer');
  assert.match(body.action.message, /rejected/i);
});

test('a prose answer is surfaced as an answer action instead of failing', async () => {
  globalThis.fetch = async () => jsonResponse({
    choices: [{ message: { content: 'The function reverses a string by walking it backwards.' } }],
  });

  const response = await ask({
    request: 'Explain what this function does',
    activeFile: 'app.js',
    files: { 'app.js': 'function reverse(s) {}' },
  });

  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.action.action, 'answer');
  assert.match(body.action.message, /reverses a string/);
  assert.equal(body.meta.parsed, false);
});

test('the conversation history is carried into the request', async () => {
  let submitted;
  globalThis.fetch = async (_url, options) => {
    submitted = JSON.parse(options.body);
    return jsonResponse({ choices: [{ message: { content: '{"action":"answer","message":"ok"}' } }] });
  };

  await ask({
    request: 'now make it responsive',
    activeFile: 'app.js',
    files: { 'app.js': '' },
    history: [
      { role: 'user', content: 'build me a login page' },
      { role: 'assistant', content: 'Created login.html' },
    ],
  });

  const userMessage = submitted.messages[1].content;
  assert.match(userMessage, /build me a login page/);
  assert.match(userMessage, /now make it responsive/);
});

test('oversized requests are rejected before any provider call', async () => {
  let calledUpstream = false;
  globalThis.fetch = async () => {
    calledUpstream = true;
    return jsonResponse({});
  };

  const response = await ask({ request: 'x'.repeat(9000) });
  assert.equal(response.status, 400);
  assert.equal(calledUpstream, false);
});

test('a provider failure returns a generic error without leaking provider detail', async () => {
  globalThis.fetch = async () => jsonResponse({ error: { message: 'hf token sk-abcdefghijklmnop rejected' } }, 401);

  const response = await ask({
    request: 'Fix the thing',
    activeFile: 'app.js',
    files: { 'app.js': '' },
  });

  const body = await response.json();
  assert.equal(response.status, 502);
  assert.doesNotMatch(JSON.stringify(body), /sk-|token|provider/i);
});

test('the workspace file list is capped so a huge workspace cannot flood the prompt', async () => {
  let submitted;
  globalThis.fetch = async (_url, options) => {
    submitted = JSON.parse(options.body);
    return jsonResponse({ choices: [{ message: { content: '{"action":"answer","message":"ok"}' } }] });
  };

  const files = {};
  for (let index = 0; index < 900; index += 1) {
    files[`file-${index}.js`] = 'const a = 1;';
  }

  await ask({ request: 'What is this project?', files });

  const contextBlock = submitted.messages[1].content;
  const listedFiles = new Set(contextBlock.match(/file-\d+\.js/g) || []);
  assert.ok(listedFiles.size <= 400, `context listed ${listedFiles.size} distinct files`);
});
