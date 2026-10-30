// Probes every configured AI model and reports PASS / FAIL per capability.
//
// This is a diagnostic, not a test suite: it makes real network calls with
// real credentials, so it is never run by `npm test`. Run it when you change
// credentials, add a model, or want to confirm a provider is reachable.
//
// Usage:
//   node tools/probe-models.mjs
//   node tools/probe-models.mjs --env-file path/to/.env
//   node tools/probe-models.mjs --only text,embeddings
//
// It reads the same environment variables the server reads, so if a model
// fails here it will fail in the app.

import 'dotenv/config';
import { readFile } from 'node:fs/promises';

const args = process.argv.slice(2);

function argValue(name) {
  const index = args.indexOf(name);
  return index === -1 ? null : args[index + 1];
}

async function loadEnvFile(file) {
  const content = await readFile(file, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^\s*([^#=\s][^=]*)=(.*)$/);
    if (!match) continue;
    const key = match[1].trim();
    const value = match[2].trim().replace(/^["']|["']$/g, '');
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

const envFile = argValue('--env-file');
if (envFile) {
  await loadEnvFile(envFile);
  console.log(`Loaded environment from ${envFile}\n`);
}

const only = (argValue('--only') || '').split(',').map((value) => value.trim()).filter(Boolean);

const CLOUDFLARE_BASE = 'https://api.cloudflare.com/client/v4';

function cloudflareAccounts() {
  const accounts = [];
  for (let index = 1; index <= 2; index += 1) {
    const accountId = process.env[`CLOUDFLARE_ACCOUNT_ID_${index}`];
    const apiKey = process.env[`CLOUDFLARE_API_KEY_${index}`];
    if (!accountId || !apiKey) continue;
    accounts.push({ label: `account-${index}`, accountId, apiKey });
  }
  if (!accounts.length) {
    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    const apiKey = process.env.CLOUDFLARE_API_TOKEN;
    if (accountId && apiKey) accounts.push({ label: 'account-legacy', accountId, apiKey });
  }
  return accounts;
}

const TIMEOUT_MS = 180000;

async function withTimeout(promise, label) {
  let timer;
  const timeout = new Promise((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`timed out after ${TIMEOUT_MS / 1000}s`)), TIMEOUT_MS);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
    void label;
  }
}

/**
 * Runs a model and returns a normalised payload.
 *
 * The model name keeps its slashes: Cloudflare routes on the literal path
 * segments, and a percent-encoded slash produces "No route for that URI".
 */
async function cloudflareRun(model, body, account) {
  const response = await fetch(
    `${CLOUDFLARE_BASE}/accounts/${account.accountId}/ai/run/${model}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${account.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    },
  );

  const contentType = response.headers.get('content-type') || '';
  const raw = Buffer.from(await response.arrayBuffer());
  const text = raw.toString('utf8');

  let data = null;
  let parsed = false;
  if (text.trim().startsWith('{') || text.trim().startsWith('[')) {
    try { data = JSON.parse(text); parsed = true; } catch { data = null; }
  }

  if (!response.ok) {
    const message = parsed
      ? (data?.errors?.[0]?.message || data?.error || `HTTP ${response.status}`)
      : (text.slice(0, 160) || `HTTP ${response.status}`);
    throw new Error(String(message).replace(/\s+/g, ' ').slice(0, 150));
  }

  if (parsed) {
    if (data && Object.hasOwn(data, 'result')) return data.result;
    if (data && Object.hasOwn(data, 'response')) return data.response;
    if (data && Object.hasOwn(data, 'data')) return data.data;
    return data;
  }

  return { __binary: raw.length, contentType };
}

function describe(result) {
  if (result == null) return 'empty result';
  if (result.__binary !== undefined) return `binary ${result.contentType} ${result.__binary} bytes`;
  if (typeof result === 'string') return `string ${result.length} chars`;
  if (Array.isArray(result)) return `${result.length} items`;
  if (typeof result === 'object') {
    if (result.choices) return `chat.completion (${result.choices.length} choice)`;
    if (typeof result.response === 'string') return `response: ${result.response.slice(0, 48)}`;
    if (typeof result.text === 'string') return `text: ${result.text.slice(0, 48)}`;
    if (result.data) return `data: ${Array.isArray(result.data) ? `${result.data.length} rows` : 'object'}`;
    return `object{${Object.keys(result).slice(0, 4).join(',')}}`;
  }
  return typeof result;
}

// ---------------------------------------------------------------------------
// Probes
// ---------------------------------------------------------------------------

const PROBES = {
  text: [
    { model: '@cf/qwen/qwen3.8-27b', body: { messages: [{ role: 'user', content: 'Say hi in three words.' }] } },
    { model: '@cf/google/gemma-4-26b-a4b-it', body: { messages: [{ role: 'user', content: 'Say hi in three words.' }] } },
    { model: '@cf/qwen/qwen2.5-coder-32b-instruct', body: { messages: [{ role: 'user', content: 'Say hi.' }] } },
    { model: 'fireworks/ember-1', body: { messages: [{ role: 'user', content: 'Say hi.' }], max_tokens: 64 } },
    { model: 'google/gemini-4-argon', body: { contents: [{ role: 'user', parts: [{ text: 'Say hi.' }] }] } },
    { model: 'xai/grok-4.7', body: { messages: [{ role: 'user', content: 'Say hi.' }] } },
  ],

  embeddings: [
    { model: '@cf/google/embeddinggemma-300m' },
    { model: '@cf/qwen/qwen3-embedding-0.6b' },
    { model: '@cf/baai/bge-m3' },
  ],

  tts: [
    { model: '@cf/deepgram/aura-2-en', body: { text: 'This is a short audio probe.' } },
    { model: '@cf/deepgram/aura-1', body: { text: 'This is a short audio probe.' } },
    { model: '@cf/myshell-ai/melotts', body: { prompt: 'This is a short audio probe.' } },
    { model: 'google/gemini-3.8-flash-lite-tts', body: { text: 'This is a short audio probe.' } },
    { model: 'elevenlabs/eleven-v3', body: { text: 'This is a short audio probe.', voice_id: 'JBFqnCBsd6RMkjVDRZzb', output_format: 'mp3_44100_128' } },
  ],

  stt: [
    { model: '@cf/openai/whisper-large-v3-turbo', body: { audio: 'UklGRigAAABXQVZFZm10IBAAAAABAAEAgD4AAAB9AAACABAAZGF0YQAAAAA=' } },
    { model: '@cf/openai/whisper', body: { audio: 'UklGRigAAABXQVZFZm10IBAAAAABAAEAgD4AAAB9AAACABAAZGF0YQAAAAA=' } },
    { model: 'assemblyai/universal-3.5-pro', body: { audio_url: 'https://cdn.openai.com/API/docs/audio/alloy.wav' } },
    { model: 'openai/gpt-4o-transcribe', body: { file: 'https://cdn.openai.com/API/docs/audio/alloy.wav' } },
    { model: 'xai/grok-stt', body: { url: 'https://storage.googleapis.com/cloud-samples-data/speech/brooklyn_bridge.mp3' } },
  ],

  music: [
    { model: 'elevenlabs/music-v2', body: { prompt: 'A short calm ambient loop.', music_length_ms: 5000, force_instrumental: true, output_format: 'mp3_48000_192' } },
    { model: 'minimax/music-2.6', body: { prompt: 'A short calm ambient loop.', is_instrumental: true } },
  ],

  image: [
    { model: '@cf/leonardo/phoenix-1.0', body: { prompt: 'A simple red circle on a white background.' } },
    { model: '@cf/lykon/dreamshaper-8-lcm', body: { prompt: 'A simple red circle on a white background.' } },
    { model: '@cf/black-forest-labs/flux-1-schnell', body: { prompt: 'A simple red circle on a white background.' } },
    { model: 'google/nano-banana-2.1', body: { prompt: 'A simple red circle on a white background.' } },
    { model: 'recraft/recraftv4-1-flash', body: { prompt: 'A simple red circle on a white background.' } },
  ],

  'image-edit': [
    { model: 'krea/krea-3', body: { prompt: 'Make the sky more dramatic.', image_urls: ['https://gen.krea.ai/images/296f8f50-13db-43f4-ae85-518a07d3c2b4.png'], resolution: '1K' } },
    { model: 'bria/fibo-edit-1.5', body: { instruction: 'Change the palette to teal.', images: ['https://bria-datasets.s3.us-east-1.amazonaws.com/api_doc/fibo-edit/pexels-cottonbro-3401900.jpg'] } },
    { model: 'pruna/p-image-upscale', body: { image: 'https://huggingface.co/spaces/yisol/IDM-VTON/resolve/main/example/human/00121_00.jpg', target: 2, enhance_details: true, output_format: 'jpg' } },
  ],
};

// ---------------------------------------------------------------------------
// Direct (non-Cloudflare) probes
// ---------------------------------------------------------------------------

async function probeCartesiaTts() {
  const apiKey = process.env.CARTESIA_API_KEY || process.env.Cartesia_API_KEY;
  if (!apiKey) return { status: 'SKIP', detail: 'no CARTESIA_API_KEY' };

  const response = await fetch('https://api.cartesia.ai/tts/bytes', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': apiKey,
      'Cartesia-Version': process.env.CARTESIA_VERSION || '2026-08-14',
    },
    body: JSON.stringify({
      model_id: process.env.CARTESIA_MODEL || 'sonic-3.6',
      voice_id: process.env.CARTESIA_VOICE || 'db6b0ed5-d5d3-463d-ae85-518a07d3c2b4',
      transcript: 'This is a short audio probe.',
      output_format: { container: 'wav', encoding: 'pcm_s16le', sample_rate: 44100 },
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text.slice(0, 160) || `HTTP ${response.status}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  if (!buffer.length) throw new Error('empty audio');
  return { status: 'PASS', detail: `${buffer.length} bytes audio` };
}

async function probeTripo() {
  const apiKey = process.env.TRIPO_API_KEY;
  if (!apiKey) return { status: 'SKIP', detail: 'no TRIPO_API_KEY' };

  // Only task creation is probed. A full generation takes 10-120 seconds and
  // costs credits; the point is to confirm the key and the account work.
  const response = await fetch('https://openapi.tripo3d.ai/v3/generation/text-to-model', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ prompt: 'a small cube', model: process.env.TRIPO_MODEL || 'v3.1-20260211' }),
  });

  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = {}; }

  if (!response.ok) throw new Error(data.message || data.error?.message || `HTTP ${response.status}`);
  if (!data.data?.task_id) throw new Error('no task id returned');
  return { status: 'PASS', detail: `task created (${data.data.task_id.slice(0, 12)}…)` };
}

async function probeGemini() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { status: 'SKIP', detail: 'no GEMINI_API_KEY' };

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${process.env.GEMINI_MODEL || 'gemini-3.6-flash'}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'Say hello in three words.' }] }] }),
    },
  );

  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = {}; }
  if (!response.ok) throw new Error(data.error?.message || `HTTP ${response.status}`);

  const output = data.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join(' ').trim();
  if (!output) throw new Error('empty response');
  return { status: 'PASS', detail: output.slice(0, 50) };
}

// ---------------------------------------------------------------------------

async function main() {
  const accounts = cloudflareAccounts();
  const results = [];

  console.log('Vux AI Studio — model probe');
  console.log('='.repeat(78));

  if (!accounts.length) {
    console.log('\nNo Cloudflare credentials configured. Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN (or the _1/_2 variants).\n');
  }

  for (const [capability, probes] of Object.entries(PROBES)) {
    if (only.length && !only.includes(capability)) continue;

    console.log(`\n${capability.toUpperCase()}`);
    console.log('-'.repeat(78));

    for (const probe of probes) {
      for (const account of accounts) {
        const started = Date.now();
        let status = 'FAIL';
        let detail = '';
        try {
          const body = probe.body || { text: ['a short probe sentence'] };
          const result = await withTimeout(cloudflareRun(probe.model, body, account), probe.model);
          status = 'PASS';
          detail = describe(result);
        } catch (error) {
          detail = error?.message || String(error);
        }
        results.push({ capability, model: probe.model, account: account.label, status, detail });
        console.log(`  [${status === 'PASS' ? 'PASS' : 'FAIL'}] ${probe.model.padEnd(40)} ${account.label.padEnd(14)} ${String(Date.now() - started).padStart(6)}ms  ${detail}`);
      }
    }
  }

  if (!only.length || only.includes('direct')) {
    console.log('\nDIRECT');
    console.log('-'.repeat(78));
    for (const [label, fn] of [['conversation', probeGemini], ['cartesia-tts', probeCartesiaTts], ['tripo-3d', probeTripo]]) {
      const started = Date.now();
      try {
        const result = await withTimeout(fn(), label);
        results.push({ capability: label, model: label, account: '-', status: result.status, detail: result.detail });
        console.log(`  [${String(result.status).padEnd(4)}] ${label.padEnd(40)} ${'-'.padEnd(14)} ${String(Date.now() - started).padStart(6)}ms  ${result.detail}`);
      } catch (error) {
        const detail = error?.message || String(error);
        results.push({ capability: label, model: label, account: '-', status: 'FAIL', detail });
        console.log(`  [FAIL] ${label.padEnd(40)} ${'-'.padEnd(14)} ${String(Date.now() - started).padStart(6)}ms  ${detail}`);
      }
    }
  }

  const passed = results.filter((result) => result.status === 'PASS').length;
  const failed = results.filter((result) => result.status === 'FAIL').length;
  const skipped = results.filter((result) => result.status === 'SKIP').length;

  console.log(`\n${'='.repeat(78)}`);
  console.log(`RESULT: ${passed} passed, ${failed} failed, ${skipped} skipped, ${results.length} total`);
  if (failed) {
    console.log('\nFailures:');
    for (const result of results.filter((item) => item.status === 'FAIL')) {
      console.log(`  - ${result.model} (${result.account}, ${result.capability}): ${result.detail}`);
    }
  }
  console.log(`\nOVERALL: ${failed === 0 ? 'SUCCESS' : 'FAILURE'}`);
  process.exitCode = failed === 0 ? 0 : 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
