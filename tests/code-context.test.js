import test from 'node:test';
import assert from 'node:assert/strict';
import { selectRelevantFiles, buildContextBlock, tokenize, scoreFile } from '../lib/codeContext.js';

const WORKSPACE = {
  'src/auth/login.js': 'export function login(user, password) { return authenticate(user, password); }',
  'src/auth/session.js': 'export function createSession(user) { return { user, token: sign(user) }; }',
  'src/components/Button.jsx': 'export function Button({ label }) { return <button>{label}</button>; }',
  'src/styles/main.css': '.button { color: red; }',
  'src/utils/format.js': 'export function formatDate(date) { return date.toISOString(); }',
  'README.md': '# Project\n\nA demo project.',
  'package.json': '{ "name": "demo" }',
};

test('tokenization drops filler words and keeps identifiers', () => {
  const tokens = tokenize('Please fix the login function in src/auth/login.js');
  assert.ok(tokens.includes('login'));
  assert.ok(tokens.includes('function'));
  assert.ok(!tokens.includes('the'));
  assert.ok(!tokens.includes('please'));
});

test('a file named in the request is always selected', () => {
  const { selected } = selectRelevantFiles({
    files: WORKSPACE,
    request: 'update src/auth/session.js',
    requestedFiles: ['src/auth/session.js'],
  });

  assert.ok(selected.some((entry) => entry.fileName === 'src/auth/session.js'));
});

test('the open file is always selected', () => {
  const { selected } = selectRelevantFiles({
    files: WORKSPACE,
    request: 'clean this up',
    activeFile: 'src/components/Button.jsx',
  });

  assert.ok(selected.some((entry) => entry.fileName === 'src/components/Button.jsx'));
});

test('files that match the request are ranked above unrelated files', () => {
  const { selected } = selectRelevantFiles({
    files: WORKSPACE,
    request: 'update the login function',
    activeFile: '',
  });

  const names = selected.map((entry) => entry.fileName);
  assert.ok(names.indexOf('src/auth/login.js') < names.indexOf('src/styles/main.css'));
});

test('a file in the same folder as the open file is preferred over distant files', () => {
  const { selected } = selectRelevantFiles({
    files: WORKSPACE,
    request: 'tidy this up',
    activeFile: 'src/auth/login.js',
  });

  const names = selected.map((entry) => entry.fileName);
  assert.ok(names.indexOf('src/auth/session.js') < names.indexOf('src/styles/main.css'));
});

test('the number of selected files respects the limit', () => {
  const { selected, omitted } = selectRelevantFiles({
    files: WORKSPACE,
    request: 'login session format',
    maxFiles: 2,
  });

  assert.equal(selected.length, 2);
  assert.ok(omitted.length > 0);
});

test('the context budget is respected', () => {
  const big = {};
  for (let index = 0; index < 20; index += 1) {
    big[`file-${index}.js`] = 'x'.repeat(5000);
  }

  const { selected, totalChars } = selectRelevantFiles({
    files: big,
    request: 'file-3',
    maxFiles: 20,
    maxChars: 10000,
  });

  assert.ok(totalChars <= 10000, `selected ${totalChars} characters, over the budget`);
  assert.ok(selected.length < 20);
});

test('a scored file reports why it was chosen', () => {
  const result = scoreFile({
    fileName: 'src/auth/login.js',
    content: 'export function login() {}',
    requestTokens: ['login'],
    requestedFiles: ['src/auth/login.js'],
    activeFile: '',
    intent: 'edit',
  });

  assert.ok(result.score > 0);
  assert.ok(result.reasons.includes('named in the request'));
});

test('the context block lists the workspace tree and the selected files', () => {
  const { selected } = selectRelevantFiles({
    files: WORKSPACE,
    request: 'update the login function',
    requestedFiles: ['src/auth/login.js'],
  });

  const block = buildContextBlock({
    files: WORKSPACE,
    selected,
    activeFile: 'src/auth/login.js',
  });

  assert.match(block, /Workspace files \(7\)/);
  assert.match(block, /src\/auth\/login\.js/);
  assert.match(block, /--- FILE: src\/auth\/login\.js \(currently open\) ---/);
  assert.match(block, /export function login/);
});

test('the context block is truncated when it exceeds the budget', () => {
  const huge = { 'big.js': 'y'.repeat(5000) };
  const block = buildContextBlock({
    files: huge,
    selected: [{ fileName: 'big.js' }],
    maxChars: 1000,
  });

  assert.ok(block.length < 6000);
  assert.match(block, /context truncated/);
});

test('an empty workspace produces a usable context block', () => {
  const block = buildContextBlock({ files: {}, selected: [] });
  assert.match(block, /workspace is empty/);
});
