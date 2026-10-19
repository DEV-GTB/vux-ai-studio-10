// End-to-end smoke test against a running server with real credentials.
// Usage: node tools/smoke.mjs [--url http://127.0.0.1:3001]
import 'dotenv/config';

const args = process.argv.slice(2);
const urlIndex = args.indexOf('--url');
const base = urlIndex === -1 ? 'http://127.0.0.1:3001' : args[urlIndex + 1];

const results = [];

async function check(name, path, body, validate) {
  const started = Date.now();
  try {
    const response = await fetch(`${base}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const contentType = response.headers.get('content-type') || '';
    let payload = null;
    if (contentType.includes('application/json')) payload = await response.json().catch(() => null);
    else payload = await response.arrayBuffer();

    const problem = validate ? validate(response, payload) : null;
    const status = problem ? 'FAIL' : 'PASS';
    const detail = problem || describe(response, payload);
    results.push({ name, status, detail, ms: Date.now() - started });
    console.log(`  [${status}] ${name.padEnd(26)} ${String(Date.now() - started).padStart(6)}ms  ${detail}`);
  } catch (error) {
    results.push({ name, status: 'FAIL', detail: error.message, ms: Date.now() - started });
    console.log(`  [FAIL] ${name.padEnd(26)} ${String(Date.now() - started).padStart(6)}ms  ${error.message}`);
  }
}

function describe(response, payload) {
  if (typeof payload === 'string') return `HTTP ${response.status} ${payload.slice(0, 90)}`;
  if (payload?.byteLength !== undefined) return `HTTP ${response.status} ${payload.byteLength} bytes`;
  if (payload?.text) return `HTTP ${response.status} text: ${String(payload.text).slice(0, 70)}`;
  if (payload?.embeddings) return `HTTP ${response.status} ${payload.embeddings.length} vectors`;
  if (payload?.audio) return `HTTP ${response.status} audio ${payload.audio.length} chars`;
  if (payload?.error) return `HTTP ${response.status} ${payload.error}`;
  return `HTTP ${response.status}`;
}

console.log('Vux AI Studio — live smoke test');
console.log('='.repeat(78));

await check('chat', '/api/chat', {
  messages: [{ role: 'user', content: 'Reply with the single word: ready' }],
}, (response, payload) => {
  if (response.status !== 200) return `HTTP ${response.status}: ${payload?.error}`;
  if (!payload?.text) return 'no text returned';
  if (/gemini|deepseek|gemma|claude|openai|qwen|llama/i.test(payload.text)) return 'the response names a service';
  return null;
});

await check('code', '/api/code', {
  request: 'Fix the null check in getUserLabel',
  activeFile: 'app.js',
  files: { 'app.js': 'function getUserLabel(id) {\n  const user = db.find(id);\n  return user.name.toUpperCase();\n}\n' },
}, (response, payload) => {
  if (response.status !== 200) return `HTTP ${response.status}: ${payload?.error}`;
  if (!payload?.action) return 'no action returned';
  if (JSON.stringify(payload).match(/provider|model|gemini|deepseek/i)) return 'the response names a service';
  return null;
});

await check('embeddings', '/api/embeddings', { text: ['hello world'] }, (response, payload) => {
  if (response.status !== 200) return `HTTP ${response.status}: ${payload?.error}`;
  if (!Array.isArray(payload?.embeddings) || !payload.embeddings.length) return 'no embeddings returned';
  if (payload.model) return 'the response names a service';
  return null;
});

await check('tts', '/api/tts', { text: 'This is a smoke test.' }, (response, payload) => {
  if (response.status !== 200) return `HTTP ${response.status}: ${payload?.error}`;
  if (!payload?.audio?.startsWith('data:audio/')) return 'no audio returned';
  return null;
});

await check('stt', '/api/stt', {
  audioUrl: 'https://cdn.openai.com/API/docs/audio/alloy.wav',
}, (response, payload) => {
  if (response.status !== 200) return `HTTP ${response.status}: ${payload?.error}`;
  if (!payload?.text?.trim()) return 'no text returned';
  return null;
});

await check('image', '/api/image', { prompt: 'A simple blue square on white' }, (response, payload) => {
  if (response.status !== 200) return `HTTP ${response.status}`;
  if (!String(response.headers.get('content-type') || '').startsWith('image/')) return 'not an image';
  return null;
});

await check('music', '/api/music', { prompt: 'A short calm loop' }, (response, payload) => {
  if (response.status !== 200) return `HTTP ${response.status}: ${payload?.error}`;
  if (!payload?.audio?.startsWith('data:audio/')) return 'no audio returned';
  return null;
});

await check('3d', '/api/3d', { prompt: 'a small cube' }, (response, payload) => {
  if (response.status !== 200) return `HTTP ${response.status}: ${payload?.error}`;
  if (!String(response.headers.get('content-type') || '').includes('gltf')) return 'not a glb';
  return null;
});

const passed = results.filter((result) => result.status === 'PASS').length;
const failed = results.filter((result) => result.status === 'FAIL').length;

console.log(`\n${'='.repeat(78)}`);
console.log(`RESULT: ${passed} passed, ${failed} failed, ${results.length} total`);
if (failed) {
  console.log('\nFailures:');
  for (const result of results.filter((item) => item.status === 'FAIL')) {
    console.log(`  - ${result.name}: ${result.detail}`);
  }
}
console.log(`\nOVERALL: ${failed === 0 ? 'SUCCESS' : 'FAILURE'}`);
process.exitCode = failed === 0 ? 0 : 1;
