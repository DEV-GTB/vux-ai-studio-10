import test from 'node:test';
import assert from 'node:assert/strict';
import {
  detectIntent,
  isCodingRequest,
  extractRequestedFiles,
  analyzeRequest,
  INTENTS,
  MUTATING_INTENTS,
} from '../lib/codeIntent.js';

test('intent detection separates the kinds of request a user makes', () => {
  const cases = [
    ['Create a new Python script that renames files.', INTENTS.CREATE],
    ['Add a test for the login function.', INTENTS.TEST],
    ['Fix the TypeError on line 12.', INTENTS.FIX],
    ['Refactor this component to use a custom hook.', INTENTS.REFACTOR],
    ['Explain what this function does.', INTENTS.EXPLAIN],
    ['Review this code for security issues.', INTENTS.REVIEW],
    ['Give me a step by step plan to add auth.', INTENTS.PLAN],
    ['How do I run the tests?', INTENTS.RUN],
    ['Convert this Python script to Go.', INTENTS.TRANSLATE],
    ['Update the header to say Vux.', INTENTS.EDIT],
  ];

  for (const [text, expected] of cases) {
    assert.equal(detectIntent(text), expected, `"${text}" should be ${expected}`);
  }
});

test('a request with no clear intent falls back to answer', () => {
  assert.equal(detectIntent('thanks!'), INTENTS.ANSWER);
  assert.equal(detectIntent(''), INTENTS.ANSWER);
});

test('coding requests are recognised from signals in the text', () => {
  assert.equal(isCodingRequest('write a function to reverse a string'), true);
  assert.equal(isCodingRequest('```js\nconst a = 1;\n```'), true);
  assert.equal(isCodingRequest('def hello(): pass'), true);
  assert.equal(isCodingRequest('the render loop is slow'), false);
  assert.equal(isCodingRequest('why is the sky blue'), false);
  assert.equal(isCodingRequest(''), false);
});

test('file paths named by the user are extracted', () => {
  const files = extractRequestedFiles('update src/components/Button.tsx and also "styles/main.css"');
  assert.ok(files.includes('src/components/Button.tsx'));
  assert.ok(files.includes('styles/main.css'));
});

test('path traversal and absolute paths are never extracted as targets', () => {
  const files = extractRequestedFiles('read ../../etc/passwd and /etc/shadow');
  for (const file of files) {
    assert.ok(!file.includes('..'), `traversal leaked: ${file}`);
    assert.ok(!file.startsWith('/'), `absolute path leaked: ${file}`);
  }
});

test('the request analysis combines intent, language and workspace context', () => {
  const analysis = analyzeRequest({
    request: 'Fix the bug in the Go handler so it returns the error',
    activeFile: 'main.go',
    fileNames: ['main.go', 'main_test.go', 'go.mod', 'README.md'],
  });

  assert.equal(analysis.intent, INTENTS.FIX);
  assert.equal(analysis.activeLanguage, 'go');
  assert.ok(analysis.languageIds.includes('go'));
  assert.equal(analysis.stack.framework, 'Go modules');
});

test('the language the user names wins over the workspace default', () => {
  const analysis = analyzeRequest({
    request: 'Convert this file to Python',
    activeFile: 'app.js',
    fileNames: ['app.js'],
  });

  assert.equal(analysis.primaryLanguage, 'python');
});

test('mutating intents are the ones that should produce a file action', () => {
  assert.ok(MUTATING_INTENTS.has(INTENTS.EDIT));
  assert.ok(MUTATING_INTENTS.has(INTENTS.CREATE));
  assert.ok(MUTATING_INTENTS.has(INTENTS.FIX));
  assert.ok(!MUTATING_INTENTS.has(INTENTS.EXPLAIN));
  assert.ok(!MUTATING_INTENTS.has(INTENTS.ANSWER));
});

test('the analysis reports a coding request when a workspace is open', () => {
  const analysis = analyzeRequest({
    request: 'make it better',
    activeFile: 'app.js',
    fileNames: ['app.js'],
  });
  assert.equal(analysis.isCoding, true);
});
