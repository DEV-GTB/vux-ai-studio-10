// Reports the state of every configured provider.
//
// This answers the question that matters before a release: which providers are
// configured, which are reachable, and which are refused for a reason that is
// not a code fault.
//
// Usage:
//   node tools/probe-providers.mjs
//   node tools/probe-providers.mjs --env-file path/to/.env

import 'dotenv/config';
import { readFile } from 'node:fs/promises';

const args = process.argv.slice(2);
const envIndex = args.indexOf('--env-file');
if (envIndex !== -1) {
  const content = await readFile(args[envIndex + 1], 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^\s*([^#=\s][^=]*)=(.*)$/);
    if (!match) continue;
    const key = match[1].trim();
    const value = match[2].trim().replace(/^["']|["']$/g, '');
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

const { getCloudflareAccounts, getModelList } = await import('../lib/cloudflare.js');
const { getFalApiKey, listFalModels } = await import('../lib/flux-sdxl.js');
const { getGroqApiKey } = await import('../lib/llama-whisper.js');
const { getHuggingFaceToken } = await import('../lib/bge-m3-flux.js');
const { getGeminiApiKey } = await import('../lib/gemini-flash.js');

const rows = [];

function row(provider, capability, configured, reachable, detail) {
  rows.push({ provider, capability, configured, reachable, detail });
}

// Cloudflare.
const accounts = getCloudflareAccounts();
row('Cloudflare', 'text, image, video, music, speech, embeddings', accounts.length > 0, null,
  accounts.length ? `${accounts.length} account(s): ${accounts.map((a) => a.accountId.slice(0, 8)).join(', ')}` : 'no account configured');
if (accounts.length) {
  for (const kind of ['text', 'coding', 'image', 'imageEdit', 'video', 'music', 'tts', 'stt', 'embeddings']) {
    const models = getModelList(kind);
    row('Cloudflare', kind, true, null, models.length ? models.join(', ') : 'no model configured for this capability');
  }
}

// Gemini.
row('Gemini', 'text, image, video', Boolean(getGeminiApiKey()), null, getGeminiApiKey() ? 'configured' : 'no key');

// Groq.
row('Groq', 'text, speech in, speech out', Boolean(getGroqApiKey()), null, getGroqApiKey() ? 'configured' : 'no key');

// fal.
row('fal', 'text, image, video, music, speech', Boolean(getFalApiKey()), null, getFalApiKey() ? 'configured' : 'no key');

// Hugging Face.
row('Hugging Face', 'text, image, embeddings', Boolean(getHuggingFaceToken()), null, getHuggingFaceToken() ? 'configured' : 'no key');

// Pollinations is no longer an image source. It only serves speech, so the
// status row describes it as a speech provider.
row('Pollinations', 'speech out', true, null, 'no credential required');

// Cartesia.
row('Cartesia', 'speech out', Boolean(process.env.CARTESIA_API_KEY), null, process.env.CARTESIA_API_KEY ? 'configured' : 'no key');

// Tripo.
row('Tripo', '3D', Boolean(process.env.TRIPO_API_KEY), null, process.env.TRIPO_API_KEY ? 'configured' : 'no key');

console.log('Vux AI Studio â€” provider status');
console.log('='.repeat(78));
for (const item of rows) {
  const state = item.configured ? 'READY ' : 'OFF   ';
  console.log(`  [${state}] ${item.provider.padEnd(14)} ${item.capability.padEnd(42)} ${item.detail}`);
}

// The two checks that need a network call.
console.log('\nLive checks');
console.log('-'.repeat(78));

if (getFalApiKey()) {
  try {
    const models = await listFalModels('image', 3);
    console.log(`  [OK   ] fal model list: ${models.join(', ') || 'no models'}`);
  } catch (error) {
    console.log(`  [FAIL ] fal model list: ${error.message.slice(0, 120)}`);
  }
  try {
    const response = await fetch('https://fal.run/fal-ai/flux/schnell', {
      method: 'POST',
      headers: { Authorization: `Key ${getFalApiKey()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'a blue cube', image_size: '512x512' }),
    });
    const text = await response.text();
    if (response.ok) console.log('  [OK   ] fal generation');
    else console.log(`  [FAIL ] fal generation: ${text.slice(0, 120)}`);
  } catch (error) {
    console.log(`  [FAIL ] fal generation: ${error.message.slice(0, 120)}`);
  }
}

try {
  const { runCloudflareModel, getModelList } = await import('../lib/cloudflare.js');
  const imageModels = getModelList('image');
  const primaryImageModel = imageModels[0];
  if (primaryImageModel) {
    const response = await runCloudflareModel(primaryImageModel, { prompt: 'a blue cube' }, getCloudflareAccounts()[0]);
    console.log(`  [OK   ] cloudflare image generation: ${String(response).length}`);
  }
} catch (error) {
  console.log(`  [FAIL ] cloudflare image generation: ${error.message.slice(0, 120)}`);
}

if (getHuggingFaceToken()) {
  try {
    const response = await fetch('https://huggingface.co/api/whoami-v2', {
      headers: { Authorization: `Bearer ${getHuggingFaceToken()}` },
    });
    const data = await response.json();
    if (response.ok) console.log(`  [OK   ] token is valid for ${data.name || 'the account'}`);
    else console.log(`  [FAIL ] token check: HTTP ${response.status}`);
  } catch (error) {
    console.log(`  [FAIL ] token check: ${error.message.slice(0, 120)}`);
  }
}

console.log('\nA provider that is configured but refused usually needs a top-up or');
console.log('a scope change. A provider that is not configured is simply skipped.');
