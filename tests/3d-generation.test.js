import test, { after, afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createServer } from 'node:http';
import object3dRouter from '../routes/3d.js';

const app = express();
app.use(express.json({ limit: '20mb' }));
app.use('/api/3d', object3dRouter);

const server = createServer(app);
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const baseUrl = `http://127.0.0.1:${server.address().port}`;
const nativeFetch = globalThis.fetch;
const originalEnvironment = {
  THREE_STUDIO_URL: process.env.THREE_STUDIO_URL,
  TRELLIS_ENDPOINT: process.env.TRELLIS_ENDPOINT,
  TRIPO_API_KEY: process.env.TRIPO_API_KEY,
};
const testGlb = Buffer.concat([Buffer.from('glTF'), Buffer.alloc(8)]);

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
  process.env.THREE_STUDIO_URL = 'http://three-studio.test';
  delete process.env.TRELLIS_ENDPOINT;
  delete process.env.TRIPO_API_KEY;
});

function glbResponse() {
  return new Response(testGlb, { status: 200, headers: { 'Content-Type': 'model/gltf-binary' } });
}

function jsonResponse(data) {
  return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

test('text generation resolves the returned Threestudio model URL to validated GLB bytes', async () => {
  const requests = [];
  globalThis.fetch = async (url, options = {}) => {
    requests.push({ url: String(url), options });
    if (String(url) === 'http://three-studio.test/generate') {
      assert.deepEqual(JSON.parse(options.body), { prompt: 'A small ceramic vase' });
      return new Response(JSON.stringify({ model: '/models/vase.glb', format: 'glb' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return glbResponse();
  };

  const response = await nativeFetch(`${baseUrl}/api/3d`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: 'A small ceramic vase' }),
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'model/gltf-binary');
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), testGlb);
  assert.deepEqual(requests.map((request) => request.url), [
    'http://three-studio.test/generate',
    'http://three-studio.test/models/vase.glb',
  ]);
});

test('image-to-3D forwards the uploaded image as multipart data and returns GLB', async () => {
  let submittedFile;
  globalThis.fetch = async (url, options) => {
    assert.equal(String(url), 'http://three-studio.test/image-to-3d');
    assert.ok(options.body instanceof FormData);
    submittedFile = options.body.get('image');
    return glbResponse();
  };

  const form = new FormData();
  form.append('image', new Blob([Buffer.from('fake png bytes')], { type: 'image/png' }), 'reference.png');
  const response = await nativeFetch(`${baseUrl}/api/3d/image-to-3d`, { method: 'POST', body: form });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'model/gltf-binary');
  assert.equal(submittedFile.name, 'reference.png');
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), testGlb);
});

test('image-to-3D rejects missing files and invalid GLB output', async () => {
  const missingFile = await nativeFetch(`${baseUrl}/api/3d/image-to-3d`, { method: 'POST', body: new FormData() });
  assert.equal(missingFile.status, 400);

  globalThis.fetch = async () => new Response('not a model', { status: 200, headers: { 'Content-Type': 'text/plain' } });
  const response = await nativeFetch(`${baseUrl}/api/3d`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: 'A test model' }),
  });
  assert.equal(response.status, 502);
});

test('text generation reports missing service configuration clearly', async () => {
  delete process.env.THREE_STUDIO_URL;
  const response = await nativeFetch(`${baseUrl}/api/3d`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: 'A test model' }),
  });
  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /THREE_STUDIO_URL/);
});

test('Tripo text generation creates a task, polls it, and returns the GLB', async () => {
  process.env.TRIPO_API_KEY = 'test-tripo-key';
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url).endsWith('/generation/text-to-model')) {
      assert.equal(options.headers.Authorization, 'Bearer test-tripo-key');
      assert.deepEqual(JSON.parse(options.body), {
        prompt: 'A detailed toy boat',
        model: 'tripo-v3.1',
        texture: true,
        pbr: true,
      });
      return jsonResponse({ code: 0, data: { task_id: 'task_text' } });
    }
    if (String(url).endsWith('/tasks/task_text')) {
      return jsonResponse({ code: 0, data: { status: 'success', output: { model_url: 'https://cdn.tripo3d.ai/test.glb' } } });
    }
    return glbResponse();
  };

  const response = await nativeFetch(`${baseUrl}/api/3d`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: 'A detailed toy boat' }),
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'model/gltf-binary');
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), testGlb);
  assert.equal(calls.length, 3);
});

test('Tripo image generation uploads a file token and returns the GLB', async () => {
  process.env.TRIPO_API_KEY = 'test-tripo-key';
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url).endsWith('/files')) {
      assert.ok(options.body instanceof FormData);
      assert.equal(options.body.get('file').name, 'reference.png');
      return jsonResponse({ code: 0, data: { file_token: 'file_test' } });
    }
    if (String(url).endsWith('/generation/image-to-model')) {
      assert.deepEqual(JSON.parse(options.body), {
        input: 'file_test',
        model: 'tripo-v3.1',
        texture: true,
        pbr: true,
      });
      return jsonResponse({ code: 0, data: { task_id: 'task_image' } });
    }
    if (String(url).endsWith('/tasks/task_image')) {
      return jsonResponse({ code: 0, data: { status: 'success', output: { model_url: 'https://cdn.tripo3d.ai/test.glb' } } });
    }
    return glbResponse();
  };

  const form = new FormData();
  form.append('image', new Blob([Buffer.from('image bytes')], { type: 'image/png' }), 'reference.png');
  const response = await nativeFetch(`${baseUrl}/api/3d/image-to-3d`, { method: 'POST', body: form });

  assert.equal(response.status, 200);
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), testGlb);
  assert.equal(calls.length, 4);
});

test('Tripo insufficient credits returns an actionable payment status', async () => {
  process.env.TRIPO_API_KEY = 'test-tripo-key';
  globalThis.fetch = async () => jsonResponse({ code: 2010, message: 'Insufficient credits' });

  const response = await nativeFetch(`${baseUrl}/api/3d`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: 'A test model' }),
  });

  assert.equal(response.status, 402);
  assert.match((await response.json()).error, /Tripo generation credits/);
});
