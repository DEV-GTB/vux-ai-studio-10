import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// The memory store is a file on disk, so the test points it at a temporary
// directory before the module is loaded.
const workspace = mkdtempSync(path.join(tmpdir(), 'vux-memory-'));
process.env.VUX_MEMORY_DB_PATH = path.join(workspace, 'memory.db');

// No embedding service is configured here, so the memory falls back to
// matching by keyword — the path that must work without any credentials.
for (const name of [
  'HF_TOKEN',
  'FAL_API_KEY',
  'CLOUDFLARE_API_TOKEN',
  'CLOUDFLARE_ACCOUNT_ID',
  'CLOUDFLARE_API_KEY_1',
  'CLOUDFLARE_ACCOUNT_ID_1',
  'CLOUDFLARE_API_KEY_2',
  'CLOUDFLARE_ACCOUNT_ID_2',
]) {
  delete process.env[name];
}

// The embedding service is left alone for a while after a failure. The retry
// wait is set to nothing here so every test starts from a clean slate.
process.env.MEMORY_EMBEDDING_RETRY_MS = '0';

const {
  buildMemoryContext,
  detectMemoryIntent,
  embedTexts,
  extractKeywords,
  extractMemoryItems,
} = await import('../lib/memory.js');
const { clearMemories, closeMemoryStore, listMemories, memoryStats } = await import('../lib/memoryStore.js');

const nativeFetch = globalThis.fetch;

before(() => {
  clearMemories();
});

after(() => {
  closeMemoryStore();
  rmSync(workspace, { recursive: true, force: true });
});

test('a request to remember is recognised as a memory instruction', () => {
  assert.equal(detectMemoryIntent('Remember these related words: quantum, photon').matched, true);
  assert.equal(detectMemoryIntent('please keep in mind the rate limit').matched, true);
  assert.equal(detectMemoryIntent("don't forget my favourite editor").matched, true);
});

test('ordinary questions are not treated as a memory instruction', () => {
  assert.equal(detectMemoryIntent('What is the weather like today?').matched, false);
  assert.equal(detectMemoryIntent('Do you remember the old config?').matched, false);
  assert.equal(detectMemoryIntent('What did I ask you to remember?').matched, false);
  assert.equal(detectMemoryIntent('Tell me what you remember about the build.').matched, false);
});

test('the words to remember are pulled out of the sentence', () => {
  assert.deepEqual(
    extractMemoryItems('Remember these related words: quantum, photon, and entropy'),
    ['quantum', 'photon', 'entropy'],
  );
  assert.deepEqual(extractMemoryItems('remember: kubernetes, docker'), ['kubernetes', 'docker']);
  assert.deepEqual(
    extractMemoryItems('Keep in mind that the API rate limit is 40 requests'),
    ['API rate limit is 40 requests'],
  );
  assert.deepEqual(
    extractMemoryItems('Remember the build command is npm run build and remember the port is 3001'),
    ['build command is npm run build', 'port is 3001'],
  );
});

test('keywords drop the filler words and keep the identifying ones', () => {
  assert.deepEqual(extractKeywords('the quantum and the photon'), ['quantum', 'photon']);
  assert.deepEqual(extractKeywords('my project is called Forge'), ['project', 'called', 'forge']);
});

test('a memory instruction stores the words and reports them back', async () => {
  const context = await buildMemoryContext('Remember these related words: quantum, photon, entropy');

  assert.match(context, /saved in your long-term memory/i);
  assert.match(context, /quantum/);
  assert.match(context, /entropy/);

  const stored = listMemories();
  assert.equal(stored.length, 3);
  assert.deepEqual(stored.map((memory) => memory.text).sort(), ['entropy', 'photon', 'quantum']);
  assert.equal(memoryStats().total, 3);
});

test('a later message recalls the memory through the shared words', async () => {
  const context = await buildMemoryContext('Explain quantum tunnelling to me');

  assert.match(context, /RECALLED MEMORY/i);
  assert.match(context, /quantum/);
});

test('an unrelated message recalls nothing', async () => {
  const context = await buildMemoryContext('What is the capital of France?');

  assert.equal(/RECALLED MEMORY/i.test(context), false);
});

test('the memory can be forgotten', async () => {
  clearMemories();
  assert.equal(memoryStats().total, 0);
  assert.deepEqual(listMemories(), []);
});

test('a configured embedding service turns the words into vectors', async () => {
  process.env.GEMINI_API_KEY = 'test-gemini-key';
  let requestedUrl = '';
  globalThis.fetch = async (url) => {
    requestedUrl = String(url);
    return new Response(JSON.stringify({ embedding: { values: [0.1, 0.2, 0.3] } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  try {
    const vectors = await embedTexts(['quantum', 'photon']);
    assert.equal(vectors.length, 2);
    assert.deepEqual(vectors[0], [0.1, 0.2, 0.3]);
    assert.match(requestedUrl, /embedContent/);
  } finally {
    globalThis.fetch = nativeFetch;
    delete process.env.GEMINI_API_KEY;
  }
});
