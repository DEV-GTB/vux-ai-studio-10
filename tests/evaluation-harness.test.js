import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scoreCase, loadCases } from '../training/eval/run_evals.mjs';
import { validateRecord } from '../training/eval/build_dataset.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

test('the golden set loads and covers many languages', async () => {
  const cases = await loadCases();
  assert.ok(cases.length >= 14, `expected at least 14 golden cases, found ${cases.length}`);

  const languages = new Set(cases.map((testCase) => testCase.language));
  assert.ok(languages.size >= 10, `expected at least 10 languages, found ${languages.size}`);

  for (const testCase of cases) {
    assert.ok(testCase.id, 'every case needs an id');
    assert.ok(testCase.request, `${testCase.id} needs a request`);
    assert.ok(testCase.expect, `${testCase.id} needs expectations`);
  }
});

test('the golden set covers the create, edit and answer actions', async () => {
  const cases = await loadCases();
  const actions = new Set(cases.map((testCase) => testCase.expect.action));
  assert.ok(actions.has('edit'));
  assert.ok(actions.has('create'));
  assert.ok(actions.has('answer'));
});

test('the golden set covers the languages the ruleset supports', async () => {
  const cases = await loadCases();
  const { LANGUAGE_PROFILES } = await import('../lib/languageProfiles.js');
  const known = new Set(LANGUAGE_PROFILES.map((profile) => profile.id));
  for (const testCase of cases) {
    assert.ok(known.has(testCase.language), `${testCase.id} uses an unknown language "${testCase.language}"`);
  }
});

test('a correct action passes its case', () => {
  const testCase = {
    id: 'x',
    expect: { action: 'edit', filename: 'app.js', contentContains: ['const a = 1;'] },
    forbid: ['TODO'],
  };

  const result = scoreCase(testCase, {
    action: 'edit',
    filename: 'app.js',
    content: 'const a = 1;\n',
  });

  assert.equal(result.pass, true);
  assert.deepEqual(result.failures, []);
});

test('the wrong action type fails the case', () => {
  const result = scoreCase(
    { id: 'x', expect: { action: 'edit' } },
    { action: 'answer', message: 'something' },
  );

  assert.equal(result.pass, false);
  assert.match(result.failures[0], /expected action/);
});

test('the wrong file fails the case', () => {
  const result = scoreCase(
    { id: 'x', expect: { action: 'edit', filename: 'app.js' } },
    { action: 'edit', filename: 'other.js', content: '' },
  );

  assert.equal(result.pass, false);
  assert.match(result.failures[0], /expected filename/);
});

test('missing required content fails the case', () => {
  const result = scoreCase(
    { id: 'x', expect: { action: 'edit', contentContains: ['std::vector'] } },
    { action: 'edit', filename: 'a.cpp', content: 'int values[10];' },
  );

  assert.equal(result.pass, false);
  assert.match(result.failures[0], /missing "std::vector"/);
});

test('forbidden content fails the case', () => {
  const result = scoreCase(
    { id: 'x', expect: { action: 'edit' }, forbid: ['.unwrap()'] },
    { action: 'edit', filename: 'a.rs', content: 'let x = foo.unwrap();' },
  );

  assert.equal(result.pass, false);
  assert.match(result.failures[0], /forbidden/);
});

test('an answer action is scored on its message', () => {
  const result = scoreCase(
    { id: 'x', expect: { action: 'answer', contentContains: ['crash'] } },
    { action: 'answer', message: 'It can crash on a missing user.' },
  );

  assert.equal(result.pass, true);
});

test('the seed dataset is valid and covers many languages', async () => {
  const content = await readFile(path.join(ROOT, 'training', 'data', 'seed_coding.jsonl'), 'utf8');
  const seeds = content.split('\n').filter((line) => line.trim()).map((line) => JSON.parse(line));

  assert.ok(seeds.length >= 12, `expected at least 12 seed examples, found ${seeds.length}`);

  const languages = new Set(seeds.map((seed) => seed.language));
  assert.ok(languages.size >= 10, `expected at least 10 languages in the seed data, found ${languages.size}`);

  for (const seed of seeds) {
    assert.ok(seed.id, 'every seed needs an id');
    assert.ok(seed.request, `${seed.id} needs a request`);
    assert.ok(seed.target?.action, `${seed.id} needs a target action`);
  }
});

test('the dataset validator rejects malformed records', () => {
  assert.equal(validateRecord(null), 'record is not an object');
  assert.equal(validateRecord({}), 'missing or empty messages array');
  assert.equal(validateRecord({ messages: [{ role: 'user', content: 'x' }] }), 'last message should be assistant');
  assert.equal(validateRecord({ messages: [{ role: 'user', content: '' }] }), 'message 0 has empty content');
  assert.equal(
    validateRecord({ messages: [{ role: 'user', content: 'x' }, { role: 'assistant', content: 'y' }] }),
    null,
  );
});
