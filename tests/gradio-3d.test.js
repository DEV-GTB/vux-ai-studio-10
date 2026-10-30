import test, { after, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createServer } from 'node:http';
import object3dRouter from '../routes/3d.js';
import {
  generateGradioImage,
  generateGradioText,
  getGradioSpace,
  getGradioTextSpace,
  hasGradioSpace,
  setGradioClientFactory,
} from '../lib/hunyuan3d-2.js';

const GLB = Buffer.concat([Buffer.from('glTF', 'ascii'), Buffer.alloc(64, 7)]);

// The parameters of a space that builds a model from a prompt and a picture,
// the way Hunyuan3D-2 declares them.
const API_INFO = {
  named_endpoints: {
    '/shape_generation': {
      parameters: [
        { parameter_name: 'caption', type: 'string' },
        { parameter_name: 'image', type: 'Blob | File | Buffer' },
        { parameter_name: 'steps', type: 'number', parameter_default: 30 },
        { parameter_name: 'guidance_scale', type: 'number', parameter_default: 5.5 },
        { parameter_name: 'seed', type: 'number', parameter_default: 42 },
        { parameter_name: 'octree_resolution', type: 'string', parameter_default: '256' },
        { parameter_name: 'check_box_rembg', type: 'boolean', parameter_default: true },
      ],
      returns: [{ type: '{ name: string; data: string; size?: number; is_file?: boolean }' }],
    },
  },
  unnamed_endpoints: {},
};

const calls = [];

function fakeClient() {
  return {
    view_api: async () => API_INFO,
    predict: async (endpoint, payload) => {
      calls.push({ endpoint, payload });
      return { data: [{ name: 'model.glb', data: 'https://space.test/file=/tmp/model.glb', is_file: true }] };
    },
  };
}

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use('/api/3d', object3dRouter);

const server = createServer(app);
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const baseUrl = `http://127.0.0.1:${server.address().port}`;
const nativeFetch = globalThis.fetch;

after(async () => {
  globalThis.fetch = nativeFetch;
  setGradioClientFactory(null);
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

before(() => {
  setGradioClientFactory(fakeClient);
  // The Tripo key is not set, so the space answers instead.
  delete process.env.TRIPO_API_KEY;
  delete process.env.THREE_FREE_PROVIDER;
});

beforeEach(() => {
  calls.length = 0;
  globalThis.fetch = async (url) => {
    if (String(url).includes('space.test')) {
      return new Response(GLB, { status: 200, headers: { 'Content-Type': 'model/gltf-binary' } });
    }
    throw new Error(`Unexpected request to ${url}`);
  };
});

test('the space is used for a text prompt', async () => {
  const glb = await generateGradioText('A low-poly treasure chest');

  assert.equal(glb.toString('ascii', 0, 4), 'glTF');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].endpoint, '/shape_generation');
  assert.equal(calls[0].payload.caption, 'A low-poly treasure chest');
  assert.equal(calls[0].payload.image, null);
  assert.equal(calls[0].payload.steps, 30);
  assert.equal(calls[0].payload.guidance_scale, 5.5);
  assert.equal(calls[0].payload.octree_resolution, '256');
});

test('the space is used for a picture', async () => {
  const glb = await generateGradioImage({
    buffer: Buffer.from('a picture'),
    mimetype: 'image/png',
    originalname: 'photo.png',
  });

  assert.equal(glb.toString('ascii', 0, 4), 'glTF');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].payload.caption, '');
  assert.ok(calls[0].payload.image, 'the picture is sent to the space');
});

test('the text route returns the model the space built', async () => {
  const response = await nativeFetch(`${baseUrl}/api/3d`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: 'A red cube' }),
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'model/gltf-binary');
  const body = Buffer.from(await response.arrayBuffer());
  assert.equal(body.toString('ascii', 0, 4), 'glTF');
  assert.equal(calls[0].payload.caption, 'A red cube');
});

test('the image route returns the model the space built', async () => {
  const form = new FormData();
  form.append('image', new Blob([Buffer.from('a picture')], { type: 'image/png' }), 'photo.png');

  const response = await nativeFetch(`${baseUrl}/api/3d/image-to-3d`, {
    method: 'POST',
    body: form,
  });

  assert.equal(response.status, 200);
  const body = Buffer.from(await response.arrayBuffer());
  assert.equal(body.toString('ascii', 0, 4), 'glTF');
  assert.ok(calls[0].payload.image, 'the picture is sent to the space');
});

test('a model that is not a GLB file is refused', async () => {
  globalThis.fetch = async () => new Response(Buffer.from('not a model'), { status: 200 });

  await assert.rejects(
    () => generateGradioText('A red cube'),
    /valid GLB/i,
  );
});

test('the space can be switched off', () => {
  const previous = process.env.HF_3D_ENABLED;
  process.env.HF_3D_ENABLED = '0';
  assert.equal(hasGradioSpace(), false);
  process.env.HF_3D_ENABLED = '1';
  assert.equal(hasGradioSpace(), true);
  if (previous === undefined) delete process.env.HF_3D_ENABLED;
  else process.env.HF_3D_ENABLED = previous;
});

test('the space can be chosen', () => {
  const previous = process.env.HF_3D_SPACE;
  process.env.HF_3D_SPACE = 'someone/other-space';
  assert.equal(getGradioSpace(), 'someone/other-space');
  if (previous === undefined) delete process.env.HF_3D_SPACE;
  else process.env.HF_3D_SPACE = previous;
});

test('a space for prompts can be named on its own', () => {
  const previousSpace = process.env.HF_3D_SPACE;
  const previousText = process.env.HF_3D_TEXT_SPACE;

  process.env.HF_3D_SPACE = 'someone/other-space';
  delete process.env.HF_3D_TEXT_SPACE;
  assert.equal(getGradioTextSpace(), 'someone/other-space');

  process.env.HF_3D_TEXT_SPACE = 'someone/text-space';
  assert.equal(getGradioTextSpace(), 'someone/text-space');

  if (previousSpace === undefined) delete process.env.HF_3D_SPACE;
  else process.env.HF_3D_SPACE = previousSpace;
  if (previousText === undefined) delete process.env.HF_3D_TEXT_SPACE;
  else process.env.HF_3D_TEXT_SPACE = previousText;
});

test('a space that has the mode switched off is reported as such', async () => {
  setGradioClientFactory(async () => ({
    view_api: async () => API_INFO,
    predict: async () => {
      throw new Error('Text to 3D is disable. Please enable it by `python gradio_app.py --enable_t23d`.');
    },
  }));

  try {
    const response = await nativeFetch(`${baseUrl}/api/3d`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'A red cube' }),
    });

    assert.equal(response.status, 503);
    const body = await response.json();
    assert.match(body.error, /switched off/i);
  } finally {
    setGradioClientFactory(fakeClient);
  }
});

test('the reason of every provider is reported when none of them can', async () => {
  process.env.TRIPO_API_KEY = 'test-tripo-key';
  globalThis.fetch = async (url) => {
    if (String(url).includes('tripo3d.ai')) {
      return new Response(JSON.stringify({ code: 2010, message: 'Insufficient credits' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    throw new Error(`Unexpected request to ${url}`);
  };
  setGradioClientFactory(async () => ({
    view_api: async () => API_INFO,
    predict: async () => {
      throw new Error('Text to 3D is disable. Please enable it by `python gradio_app.py --enable_t23d`.');
    },
  }));

  try {
    const response = await nativeFetch(`${baseUrl}/api/3d`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'A red cube' }),
    });

    assert.equal(response.status, 402);
    const body = await response.json();
    assert.match(body.error, /credits/i);
    assert.match(body.error, /Text to 3D is disable/i);
  } finally {
    setGradioClientFactory(fakeClient);
    delete process.env.TRIPO_API_KEY;
  }
});
