import test, { after, afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createServer } from 'node:http';
import imageRouter from '../routes/image.js';
import videoRouter from '../routes/video.js';
import embeddingsRouter from '../routes/embeddings.js';
import musicRouter from '../routes/music.js';
import voiceRouter from '../routes/voice.js';

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use('/api/image', imageRouter);
app.use('/api/video', videoRouter);
app.use('/api/embeddings', embeddingsRouter);
app.use('/api/music', musicRouter);
app.use('/api/voice', voiceRouter);

const server = createServer(app);
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const baseUrl = `http://127.0.0.1:${server.address().port}`;
const nativeFetch = globalThis.fetch;
const originalEnvironment = {};

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
  for (const name of [
    'HF_TOKEN',
    'GEMINI_API_KEY',
    'GEMINI_MODEL',
    'CLOUDFLARE_ACCOUNT_ID_1',
    'CLOUDFLARE_API_KEY_1',
    'CLOUDFLARE_ACCOUNT_ID_2',
    'CLOUDFLARE_API_KEY_2',
    'CLOUDFLARE_IMAGE_MODELS',
    'CLOUDFLARE_EDIT_MODELS',
    'CLOUDFLARE_VIDEO_MODELS',
    'CLOUDFLARE_EMBEDDING_MODELS',
    'CLOUDFLARE_MUSIC_MODELS',
    'CLOUDFLARE_TEXT_TO_SPEECH_MODELS',
    'CLOUDFLARE_SPEECH_TO_TEXT_MODELS',
  ]) {
    delete process.env[name];
  }
  process.env.CLOUDFLARE_VIDEO_MODELS = '@cf/wan-ai/wan-2.1-14b';
  process.env.CLOUDFLARE_ACCOUNT_ID_1 = '0ebc445b416bb5124ee647c04f432868';
  process.env.CLOUDFLARE_API_KEY_1 = 'cfut_test_account_one';
  process.env.CLOUDFLARE_ACCOUNT_ID_2 = '54dc3f70d645cce3ab1a43957586a447';
  process.env.CLOUDFLARE_API_KEY_2 = 'cfut_test_account_two';
});

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// Workers AI returns raw bytes for the audio models, so the mock does too.
const AUDIO_BYTES = Buffer.from('fake-mp3-audio-bytes');
const AUDIO_BASE64 = AUDIO_BYTES.toString('base64');

function audioResponse(body = AUDIO_BYTES, contentType = 'audio/mpeg') {
  return new Response(body, {
    status: 200,
    headers: { 'Content-Type': contentType },
  });
}

const PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const VIDEO_BASE64 = 'AAAAVGVzdA==';


const requests = [];

// Builds a mock that fails for any model whose URL contains one of the
// given fragments, and succeeds for everything else. This is how the
// fallback chains are tested: the route must try the next model when one
// is unavailable.
function mockWithFailures(failingFragments, responseFactory) {
  return async (url, options) => {
    const target = String(url);
    requests.push({ url: target, body: JSON.parse(options.body) });
    if (failingFragments.some((fragment) => target.includes(fragment))) {
      return jsonResponse({ errors: [{ message: 'model unavailable' }] }, 503);
    }
    return responseFactory();
  };
}

beforeEach(() => {
  requests.length = 0;
});

test('image requests use the Cloudflare text-to-image model on the primary account', async () => {
  const originalFetch = nativeFetch;
  globalThis.fetch = async (url, options) => {
    requests.push({ url: String(url), body: JSON.parse(options.body) });
    return jsonResponse({ result: PNG_BASE64 });
  };
  try {
    const response = await nativeFetch(`${baseUrl}/api/image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'a cat in space' }),
    });
    const data = await response.arrayBuffer();
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type') || '', /^image\//);
    assert.ok(data.byteLength > 0, 'the image route must return image bytes');
    assert.equal(requests.length, 1);
    assert.ok(requests[0].url.includes('/accounts/0ebc445b416bb5124ee647c04f432868/ai/run/@cf/leonardo/phoenix-1.0'));
    assert.match(requests[0].body.prompt, /a cat in space/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('image edit requests send the reference image and the target upscale size', async () => {
  const originalFetch = nativeFetch;
  // Fail the two edit models so the route has to fall through to the
  // upscale model, which proves the edit model list is ordered and wired.
  globalThis.fetch = mockWithFailures(['krea/krea-3', 'bria/fibo-edit-1.5'], () => jsonResponse({ result: PNG_BASE64 }));
  try {
    const response = await nativeFetch(`${baseUrl}/api/image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: 'make it dusk',
        instruction: 'make it dusk',
        referenceImage: 'data:image/png;base64,abc123',
        target: 4,
        enhanceDetails: true,
      }),
    });
    const data = await response.arrayBuffer();
    assert.equal(response.status, 200);
    assert.ok(data.byteLength > 0);
    assert.equal(requests.length >= 3, true);
    const kreaRequest = requests.find((request) => request.url.includes('krea/krea-3'));
    assert.ok(kreaRequest);
    assert.equal(kreaRequest.body.prompt, 'make it dusk');
    assert.equal(kreaRequest.body.image_urls[0], 'data:image/png;base64,abc123');
    assert.equal(kreaRequest.body.resolution, '2K');

    const prunaRequest = requests.find((request) => request.url.includes('pruna'));
    assert.ok(prunaRequest);
    assert.equal(prunaRequest.body.target, 4);
    assert.equal(prunaRequest.body.enhance_details, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('video requests use the Cloudflare video model and return a video data URL', async () => {
  const originalFetch = nativeFetch;
  globalThis.fetch = async (url, options) => {
    requests.push({ url: String(url), body: JSON.parse(options.body) });
    return jsonResponse({ result: VIDEO_BASE64 });
  };
  try {
    const response = await nativeFetch(`${baseUrl}/api/video`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'a rotating planet', duration: '10s' }),
    });
    const data = await response.json();
    assert.equal(response.status, 200);
    assert.equal(data.video.startsWith('data:video/mp4;base64,'), true);
    assert.ok(requests.length >= 1);
    assert.ok(requests.some((request) => request.url.includes('/accounts/54dc3f70d645cce3ab1a43957586a447')));
    assert.equal(requests.find((request) => request.url.includes('/accounts/54dc3f70d645cce3ab1a43957586a447'))?.body.prompt, 'a rotating planet');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('embeddings requests use the configured Cloudflare embedding models', async () => {
  const originalFetch = nativeFetch;
  globalThis.fetch = async (url, options) => {
    requests.push({ url: String(url), body: JSON.parse(options.body) });
    return jsonResponse({ result: [[0.1, 0.2], [0.3, 0.4]] });
  };
  try {
    const response = await nativeFetch(`${baseUrl}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: ['hello world', 'hello there'] }),
    });
    const data = await response.json();
    assert.equal(response.status, 200);
    assert.equal(Array.isArray(data.embeddings), true);
    assert.equal(data.embeddings.length, 2);
    assert.equal(data.embeddings[0][0], 0.1);
    assert.ok(requests.length >= 1);
    assert.ok(requests.some((request) => request.body.text?.includes('hello world')));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('music requests send the music specific parameters and return an audio data URL', async () => {
  const originalFetch = nativeFetch;
  // The first music model is unavailable, so the route must fall through to
  // the next one and still send the model-specific parameters.
  globalThis.fetch = mockWithFailures(['elevenlabs/music-v2'], () => audioResponse());
  try {
    const response = await nativeFetch(`${baseUrl}/api/music`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: 'an upbeat electronic dance track',
        forceInstrumental: true,
        isInstrumental: true,
        lyricsOptimizer: true,
      }),
    });
    const data = await response.json();
    assert.equal(response.status, 200);
    assert.equal(data.audio.startsWith('data:audio/mpeg;base64,'), true);
    assert.equal(data.audio, `data:audio/mpeg;base64,${AUDIO_BASE64}`);
    assert.ok(requests.length >= 1);
    const elevenlabsRequest = requests.find((request) => request.url.includes('elevenlabs'));
    assert.ok(elevenlabsRequest);
    assert.equal(elevenlabsRequest.body.prompt, 'an upbeat electronic dance track');
    assert.equal(elevenlabsRequest.body.force_instrumental, true);

    const minimaxRequest = requests.find((request) => request.url.includes('minimax'));
    assert.ok(minimaxRequest);
    assert.equal(minimaxRequest.body.is_instrumental, true);
    assert.equal(minimaxRequest.body.lyrics_optimizer, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('text to speech requests return an audio data URL', async () => {
  const originalFetch = nativeFetch;
  globalThis.fetch = async (url, options) => {
    requests.push({ url: String(url), body: JSON.parse(options.body) });
    return audioResponse();
  };
  try {
    const response = await nativeFetch(`${baseUrl}/api/voice/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'hello there, this is spoken' }),
    });
    const data = await response.json();
    assert.equal(response.status, 200);
    assert.equal(data.audio, `data:audio/mpeg;base64,${AUDIO_BASE64}`);
    assert.ok(requests.length >= 1);
    assert.ok(requests.some((request) => request.body.text === 'hello there, this is spoken'));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('speech to text requests return the transcribed text', async () => {
  const originalFetch = nativeFetch;
  // The catalogue speech model is unavailable, so the route falls through to
  // the next one, which takes a data URL.
  globalThis.fetch = mockWithFailures(['@cf/openai/whisper'], () => jsonResponse({ result: { text: 'the quick brown fox' } }));
  try {
    const response = await nativeFetch(`${baseUrl}/api/voice/stt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ audioBase64: 'ZmFrZQ==' }),
    });
    const data = await response.json();
    assert.equal(response.status, 200);
    assert.equal(data.text, 'the quick brown fox');
    assert.ok(requests.length >= 1);
    const openaiRequest = requests.find((request) => request.url.includes('openai/gpt-4o-transcribe'));
    assert.ok(openaiRequest);
    assert.equal(openaiRequest?.body.file, 'data:audio/wav;base64,ZmFrZQ==');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
