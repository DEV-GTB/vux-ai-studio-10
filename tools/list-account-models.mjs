// Lists the Workers AI models available on a Cloudflare account.
// Usage: node tools/list-account-models.mjs --env-file <path>
import { readFile } from 'node:fs/promises';

const args = process.argv.slice(2);
const envIndex = args.indexOf('--env-file');
const envFile = envIndex === -1 ? null : args[envIndex + 1];

const vars = {};
if (envFile) {
  for (const line of (await readFile(envFile, 'utf8')).split(/\r?\n/)) {
    const match = line.match(/^\s*([^#=\s][^=]*)=(.*)$/);
    if (match) vars[match[1].trim()] = match[2].trim();
  }
}

const token = vars.CLOUDFLARE_API_TOKEN || process.env.CLOUDFLARE_API_TOKEN || process.env.CLOUDFLARE_API_KEY_1;
const account = vars.CLOUDFLARE_ACCOUNT_ID || process.env.CLOUDFLARE_ACCOUNT_ID || process.env.CLOUDFLARE_ACCOUNT_ID_1;

if (!token || !account) {
  console.error('No Cloudflare credentials. Use --env-file or set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID.');
  process.exit(1);
}

const response = await fetch(
  `https://api.cloudflare.com/client/v4/accounts/${account}/ai/models/search?per_page=100`,
  { headers: { Authorization: `Bearer ${token}` } },
);

const text = await response.text();
let data = {};
try { data = JSON.parse(text); } catch { data = {}; }

if (!response.ok) {
  console.error(`Failed: HTTP ${response.status} ${text.slice(0, 200)}`);
  process.exit(1);
}

const models = data.result || [];
console.log(`\n${models.length} models available on account ${account}\n`);

const byCategory = new Map();
for (const model of models) {
  const task = model.tasks?.[0] || 'unknown';
  if (!byCategory.has(task)) byCategory.set(task, []);
  byCategory.get(task).push(model);
}

for (const [task, list] of [...byCategory.entries()].sort()) {
  console.log(`${task.toUpperCase()} (${list.length})`);
  for (const model of list) {
    const name = model.name;
    const price = model.pricing?.price_per_million?.['1'] ?? model.pricing?.price_per_million?.['1k'] ?? '';
    console.log(`  ${name.padEnd(46)} ${price ? `$${price}/M` : ''}`);
  }
  console.log('');
}

// The models the app is configured to use.
const wanted = [
  'fireworks/ember-1', 'google/gemini-4-argon', 'xai/grok-4.7',
  '@cf/qwen/qwen3.8-27b', '@cf/google/gemma-4-26b-a4b-it', '@cf/meta/llama-3.2-11b-vision-instruct',
  '@cf/google/embeddinggemma-300m', '@cf/qwen/qwen3-embedding-0.6b', '@cf/baai/bge-m3',
  'google/gemini-3.8-flash-lite-tts', 'elevenlabs/eleven-v3',
  'assemblyai/universal-3.5-pro', 'openai/gpt-4o-transcribe', 'xai/grok-stt',
  'elevenlabs/music-v2', 'minimax/music-2.6',
  'google/nano-banana-2.1', 'google/nano-banana-2-lite', 'recraft/recraftv4-1-flash',
  'krea/krea-3', 'bria/fibo-edit-1.5', 'pruna/p-image-upscale',
];
const available = new Set(models.map((model) => model.name));
console.log('CONFIGURED MODEL CHECK');
console.log('-'.repeat(60));
for (const name of wanted) {
  console.log(`  ${available.has(name) ? 'AVAILABLE  ' : 'unavailable'} ${name}`);
}
