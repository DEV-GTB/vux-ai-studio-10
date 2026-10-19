import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseAction,
  validateAction,
  validateWorkspacePath,
  buildAgentPrompts,
} from '../lib/studioAgent.js';
import { buildCodeSystemPrompt, buildCodeUserMessage } from '../lib/promptBuilder.js';
import { INTENTS } from '../lib/codeIntent.js';

test('a clean JSON action is parsed', () => {
  const action = parseAction('{"action":"edit","filename":"app.js","content":"const a = 1;"}');
  assert.equal(action.action, 'edit');
  assert.equal(action.filename, 'app.js');
  assert.equal(action.content, 'const a = 1;');
});

test('a fenced JSON action is parsed', () => {
  const action = parseAction('```json\n{"action":"create","filename":"a.js","content":""}\n```');
  assert.equal(action.action, 'create');
});

test('a JSON action embedded in prose is parsed', () => {
  const action = parseAction('Sure thing:\n{"action":"answer","message":"done"}\nHope that helps.');
  assert.equal(action.action, 'answer');
  assert.equal(action.message, 'done');
});

test('a response with no action returns null', () => {
  assert.equal(parseAction('Just some prose.'), null);
  assert.equal(parseAction(''), null);
  assert.equal(parseAction('{"action":"explode","filename":"a.js"}'), null);
});

test('workspace paths reject traversal, absolute paths and protected folders', () => {
  assert.equal(validateWorkspacePath('src/app.js').valid, true);
  assert.equal(validateWorkspacePath('app.js').valid, true);

  assert.equal(validateWorkspacePath('../etc/passwd').valid, false);
  assert.equal(validateWorkspacePath('/etc/passwd').valid, false);
  assert.equal(validateWorkspacePath('C:\\Windows\\system32').valid, false);
  assert.equal(validateWorkspacePath('node_modules/pkg/index.js').valid, false);
  assert.equal(validateWorkspacePath('.env').valid, false);
  assert.equal(validateWorkspacePath('').valid, false);
});

test('an edit for a file that does not exist is rejected', () => {
  const result = validateAction(
    { action: 'edit', filename: 'missing.js', content: 'x' },
    { files: { 'app.js': '' }, intent: INTENTS.EDIT },
  );

  assert.equal(result.valid, false);
  assert.match(result.error, /does not exist/);
});

test('an edit for an existing file is accepted', () => {
  const result = validateAction(
    { action: 'edit', filename: 'app.js', content: 'const a = 1;' },
    { files: { 'app.js': 'old' }, intent: INTENTS.EDIT },
  );

  assert.equal(result.valid, true);
});

test('a delete without a reason is rejected', () => {
  const result = validateAction(
    { action: 'delete', filename: 'app.js' },
    { files: { 'app.js': '' }, intent: INTENTS.EDIT },
  );

  assert.equal(result.valid, false);
  assert.match(result.error, /reason/);
});

test('an action with a traversal path is rejected before it reaches the filesystem', () => {
  const result = validateAction(
    { action: 'edit', filename: '../../etc/passwd', content: 'x' },
    { files: {}, intent: INTENTS.EDIT },
  );

  assert.equal(result.valid, false);
});

test('an answer action needs a message', () => {
  assert.equal(validateAction({ action: 'answer', message: 'ok' }, {}).valid, true);
  assert.equal(validateAction({ action: 'answer', message: '  ' }, {}).valid, false);
});

test('the system prompt states the output contract and the language rules', () => {
  const prompt = buildCodeSystemPrompt({
    analysis: {
      intent: INTENTS.FIX,
      languageIds: ['python', 'rust'],
      stack: { framework: 'Node.js' },
      primaryLanguage: 'python',
      historyTurns: 0,
    },
    contextBlock: 'Workspace files (1):\n  app.py',
  });

  assert.match(prompt, /exactly ONE JSON object/i);
  assert.match(prompt, /"action":"edit"/);
  assert.match(prompt, /Python:/);
  assert.match(prompt, /Rust:/);
  assert.match(prompt, /Find the actual cause/);
  assert.match(prompt, /Node\.js/);
  assert.match(prompt, /app\.py/);
});

test('the coding system prompt never contains the team biographies', () => {
  const prompt = buildCodeSystemPrompt({
    analysis: { intent: INTENTS.EDIT, languageIds: ['javascript'], stack: { framework: null } },
  });

  assert.doesNotMatch(prompt, /Founder/);
  assert.doesNotMatch(prompt, /team roster/);
  assert.doesNotMatch(prompt, /Muhammed/);
});

test('the user message puts the request before the context', () => {
  const message = buildCodeUserMessage({
    request: 'Fix the parser',
    contextBlock: 'Workspace files (1):\n  parser.py',
    activeFile: 'parser.py',
  });

  assert.ok(message.indexOf('Fix the parser') < message.indexOf('Workspace context'));
  assert.match(message, /parser\.py/);
});

test('earlier turns are carried into the prompt', () => {
  const message = buildCodeUserMessage({
    request: 'now make it responsive',
    history: [
      { role: 'user', content: 'build me a login page' },
      { role: 'assistant', content: 'Created login.html' },
    ],
  });

  assert.match(message, /build me a login page/);
  assert.match(message, /Created login\.html/);
});

test('the agent prompts can be rebuilt without calling a model', () => {
  const prompts = buildAgentPrompts({
    request: 'Fix the null check in login.js',
    activeFile: 'login.js',
    files: { 'login.js': 'function login() { return user.name; }' },
  });

  assert.match(prompts.systemPrompt, /exactly ONE JSON object/i);
  assert.match(prompts.userMessage, /Fix the null check/);
  assert.ok(prompts.contextFiles.includes('login.js'));
  assert.equal(prompts.analysis.intent, INTENTS.FIX);
});

test('plan mode forces the plan intent', () => {
  const prompts = buildAgentPrompts({
    request: 'add authentication',
    files: { 'app.js': '' },
    mode: 'plan',
  });

  assert.equal(prompts.analysis.intent, INTENTS.PLAN);
  assert.match(prompts.systemPrompt, /numbered list/i);
});
