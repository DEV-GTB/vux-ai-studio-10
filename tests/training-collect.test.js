import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import express from 'express';
import { createServer } from 'node:http';

// trainingJobs resolves its storage directory from the home directory at
// import time, so it has to be redirected before the module is loaded.
const sandbox = await mkdtemp(path.join(tmpdir(), 'vux-training-'));
process.env.USERPROFILE = sandbox;
process.env.HOME = sandbox;

const { default: trainingRouter } = await import('../routes/training.js');

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use('/api/training', trainingRouter);

const server = createServer(app);
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const baseUrl = `http://127.0.0.1:${server.address().port}`;

after(async () => {
  await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  await rm(sandbox, { recursive: true, force: true });
});

async function post(path, body) {
  const response = await fetch(`${baseUrl}/api/training${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json().catch(() => ({})) };
}

test('an approved edit is collected as a training example', async () => {
  const { status, body } = await post('/collect', {
    request: 'Fix the null check in login.js',
    action: { action: 'edit', filename: 'login.js', content: 'const a = 1;' },
    activeFile: 'login.js',
    files: { 'login.js': 'const b = 2;' },
  });

  assert.equal(status, 200);
  assert.equal(body.success, true);
  assert.equal(body.appended, 1);
  assert.equal(body.example.messages.length, 3);
  assert.equal(body.example.messages[0].role, 'system');
  assert.equal(body.example.messages[1].role, 'user');
  assert.equal(body.example.messages[2].role, 'assistant');
  assert.match(body.example.messages[1].content, /Fix the null check/);
  assert.equal(body.example.metadata.source, 'studio-approved-edit');
});

test('the collected example uses the same system prompt the agent serves', async () => {
  const { body } = await post('/collect', {
    request: 'Fix the Rust error handling',
    action: { action: 'edit', filename: 'main.rs', content: 'fn main() {}' },
    activeFile: 'main.rs',
    files: { 'main.rs': 'fn main() { panic!(); }' },
  });

  const systemPrompt = body.example.messages[0].content;
  assert.match(systemPrompt, /exactly ONE JSON object/i);
  assert.match(systemPrompt, /Rust:/);
});

test('a collected example is written to a dataset on disk', async () => {
  await post('/collect', {
    request: 'Add a helper in utils.js',
    action: { action: 'create', filename: 'utils.js', content: 'export const noop = () => {};' },
    files: { 'app.js': '' },
  });

  const list = await fetch(`${baseUrl}/api/training/datasets`).then((response) => response.json());
  assert.ok(list.datasets.length >= 1);

  const dataset = list.datasets[0];
  const content = await readFile(path.join(sandbox, '.vux-ai-studio', 'ai-training', 'datasets', dataset.name), 'utf8');
  assert.ok(content.trim().split('\n').length >= 1);
  for (const line of content.trim().split('\n')) {
    const record = JSON.parse(line);
    assert.ok(Array.isArray(record.messages));
    assert.equal(record.messages.at(-1).role, 'assistant');
  }
});

test('a request without an action is rejected', async () => {
  const { status } = await post('/collect', { request: 'do something' });
  assert.equal(status, 400);
});

test('a destructive action is not collected', async () => {
  const { status } = await post('/collect', {
    request: 'delete everything',
    action: { action: 'delete', filename: 'app.js', reason: 'because' },
  });
  assert.equal(status, 400);
});

test('a dataset preview returns the stored examples', async () => {
  const list = await fetch(`${baseUrl}/api/training/datasets`).then((response) => response.json());
  const name = list.datasets[0].name;

  const preview = await fetch(`${baseUrl}/api/training/datasets/${name}/preview?limit=5`).then((response) => response.json());
  assert.ok(preview.examples.length >= 1);
  assert.ok(preview.total >= preview.examples.length);
});

test('a dataset name that tries to escape the dataset directory stays inside it', async () => {
  const { status, body } = await post('/datasets', { name: '../escape.jsonl', content: '{"messages":[]}' });
  assert.equal(status, 200);

  // The name is reduced to its basename, so the file is written inside the
  // dataset directory and never next to it.
  assert.equal(body.name, 'escape.jsonl');

  const datasetDir = path.join(sandbox, '.vux-ai-studio', 'ai-training', 'datasets');
  const written = await readFile(path.join(datasetDir, 'escape.jsonl'), 'utf8');
  assert.equal(written, '{"messages":[]}');
  await assert.rejects(readFile(path.join(sandbox, '.vux-ai-studio', 'ai-training', 'escape.jsonl'), 'utf8'));
});
