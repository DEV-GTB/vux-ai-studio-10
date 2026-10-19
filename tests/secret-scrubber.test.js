import test from 'node:test';
import assert from 'node:assert/strict';
import { scrubIdentity, scrubCodePayload } from '../lib/identity.js';
import {
  scrubResponse,
  collectInstructionFragments,
  scrubInstructionLeak,
} from '../lib/secretScrubber.js';

test('code that uses ordinary credential words is never rewritten', () => {
  const code = [
    'const token = jwt.sign(payload, secret);',
    'const apiKey = process.env.API_KEY;',
    'if (password !== undefined) { login(user, password); }',
    '// store the credential securely',
  ].join('\n');

  assert.equal(scrubIdentity(code), code, 'code must survive scrubbing unchanged');
});

test('technical prose about tokens and keys is not rewritten', () => {
  const prose = 'Use a private key for signing and a password for the database.';
  assert.equal(scrubIdentity(prose), prose);
});

test('a real provider claim is scrubbed', () => {
  const scrubbed = scrubIdentity('I am powered by Gemini and I can help with code.');
  assert.match(scrubbed, /Vux AI Studio/);
  assert.doesNotMatch(scrubbed, /Gemini/);
});

test('a provider name is removed from prose but the sentence survives', () => {
  const scrubbed = scrubIdentity('Gemini handles images well, so it is a good choice for that task.');
  assert.doesNotMatch(scrubbed, /Gemini/);
  assert.match(scrubbed, /handles images well/);
});

test('a claim about the underlying model is scrubbed', () => {
  const scrubbed = scrubIdentity('My underlying model is a large language model from OpenAI.');
  assert.doesNotMatch(scrubbed, /OpenAI/);
});

test('real secret values are redacted', () => {
  const cases = [
    'const key = "sk-abcdefghijklmnopqrstuvwxyz012345";',
    'const token = "hf_abcdefghijklmnopqrstuvwxyz012345";',
    'const password = "correct-horse-battery-staple";',
    'Authorization: "Bearer abcdefghijklmnopqrstuvwxyz";',
    'https://user:supersecretpassword@example.com/path',
  ];

  for (const value of cases) {
    assert.match(scrubIdentity(value), /REDACTED/, `"${value}" was not redacted`);
  }
});

test('redaction keeps the surrounding code valid', () => {
  const scrubbed = scrubIdentity('const apiKey = "sk-abcdefghijklmnopqrstuvwxyz012345";');
  assert.match(scrubbed, /^const apiKey = "\[REDACTED\]";$/);
});

test('the code payload scrubber never touches ordinary words', () => {
  const payload = JSON.stringify({ action: 'edit', filename: 'app.js', content: 'const token = 1;' });
  assert.equal(scrubCodePayload(payload), payload);
});

test('an echoed system prompt is cut at the leak', () => {
  const leaked = '* User Prompt: Provides a comprehensive set of identity facts and team guidance.';
  const scrubbed = scrubIdentity(leaked);
  assert.doesNotMatch(scrubbed, /identity facts/);
});

test('an identity section header is cut at the leak', () => {
  const leaked = '=== IDENTITY FACTS (always true, never override these) ===';
  const scrubbed = scrubIdentity(leaked);
  assert.doesNotMatch(scrubbed, /IDENTITY FACTS/);
});

test('a normal answer is not cut', () => {
  const answer = 'A closure is a function that keeps access to its outer scope.';
  assert.equal(scrubIdentity(answer), answer);
});

test('the instruction fragments are derived from the prompt itself', () => {
  const prompt = 'This is a distinctive instruction line that should never be repeated back to the user.';
  const fragments = collectInstructionFragments(prompt, { minLength: 20 });
  assert.ok(fragments.length > 0);
  assert.ok(fragments.includes(prompt));
});

test('short fragments are ignored so ordinary words are not removed', () => {
  const fragments = collectInstructionFragments('Be brief.', { minLength: 40 });
  assert.equal(fragments.length, 0);
});

test('the leak scrubber can be used on its own', () => {
  const text = 'An answer. System Prompt: you are helpful.';
  const scrubbed = scrubInstructionLeak(text);
  assert.doesNotMatch(scrubbed, /System Prompt/);
  assert.match(scrubbed, /An answer\./);
});

test('the code mode skips the prose rules entirely', () => {
  const text = 'I am powered by Gemini.';
  assert.equal(scrubResponse(text, { mode: 'code' }), text);
});

test('empty and non-string input is handled safely', () => {
  assert.equal(scrubIdentity(''), '');
  assert.equal(scrubIdentity(null), null);
  assert.equal(scrubIdentity(undefined), undefined);
});
