// Evaluation runner for the Vux coding agent.
//
// Runs the golden set in training/evaluation/coding_tests.jsonl against a
// running Vux AI Studio server and scores every case. This is the only way to
// know whether a prompt change, a model change, or a fine-tune actually made
// the assistant better at following user requests.
//
// Usage:
//   node training/eval/run_evals.mjs
//   node training/eval/run_evals.mjs --url http://127.0.0.1:3001 --out training/evaluation/results.jsonl
//
// Exit code is 1 when the pass rate drops below the threshold, so this can be
// wired into CI.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');

function parseArgs(argv) {
  const args = { url: 'http://127.0.0.1:3001', out: 'training/evaluation/results.jsonl', threshold: 0.7 };
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];
    if (key === '--url') { args.url = value; index += 1; }
    else if (key === '--out') { args.out = value; index += 1; }
    else if (key === '--threshold') { args.threshold = Number(value); index += 1; }
  }
  return args;
}

function loadCases() {
  const file = path.join(ROOT, 'training', 'evaluation', 'coding_tests.jsonl');
  return readFile(file, 'utf8')
    .then((content) => content.split('\n').filter((line) => line.trim()).map((line) => JSON.parse(line)));
}

// Scores one case against the assistant's action.
export function scoreCase(testCase, action) {
  const failures = [];
  const expect = testCase.expect || {};

  if (!action || typeof action !== 'object') {
    return { pass: false, failures: ['no action returned'] };
  }

  if (expect.action && action.action !== expect.action) {
    failures.push(`expected action "${expect.action}" but got "${action.action}"`);
  }

  if (expect.filename && action.filename !== expect.filename && action.path !== expect.filename) {
    failures.push(`expected filename "${expect.filename}" but got "${action.filename || action.path}"`);
  }

  const content = typeof action.content === 'string'
    ? action.content
    : (typeof action.message === 'string' ? action.message : '');

  for (const needle of expect.contentContains || []) {
    if (!content.includes(needle)) failures.push(`content is missing "${needle}"`);
  }

  for (const needle of testCase.forbid || []) {
    if (content.includes(needle)) failures.push(`content contains forbidden "${needle}"`);
  }

  return { pass: failures.length === 0, failures };
}

async function runCase(baseUrl, testCase) {
  const started = Date.now();
  try {
    const response = await fetch(`${baseUrl}/api/code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        request: testCase.request,
        activeFile: testCase.activeFile || '',
        files: testCase.workspace || {},
        folders: [],
        history: [],
      }),
    });

    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      return { id: testCase.id, language: testCase.language, pass: false, failures: [`HTTP ${response.status}: ${body.error || 'unknown error'}`], durationMs: Date.now() - started };
    }

    const result = scoreCase(testCase, body.action);
    return {
      id: testCase.id,
      language: testCase.language,
      pass: result.pass,
      failures: result.failures,
      action: body.action?.action,
      durationMs: Date.now() - started,
    };
  } catch (error) {
    return { id: testCase.id, language: testCase.language, pass: false, failures: [error.message], durationMs: Date.now() - started };
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const cases = await loadCases();

  console.log(`Running ${cases.length} evaluation cases against ${args.url}\n`);

  const results = [];
  for (const testCase of cases) {
    const result = await runCase(args.url, testCase);
    results.push(result);
    const status = result.pass ? 'PASS' : 'FAIL';
    console.log(`${status}  ${result.id} (${result.language}, ${result.durationMs}ms)`);
    if (!result.pass) result.failures.forEach((failure) => console.log(`      - ${failure}`));
  }

  const passed = results.filter((result) => result.pass).length;
  const rate = results.length ? passed / results.length : 0;

  console.log(`\nOverall: ${passed}/${results.length} (${(rate * 100).toFixed(1)}%)`);

  const byLanguage = new Map();
  for (const result of results) {
    const entry = byLanguage.get(result.language) || { pass: 0, total: 0 };
    entry.total += 1;
    if (result.pass) entry.pass += 1;
    byLanguage.set(result.language, entry);
  }
  for (const [language, entry] of [...byLanguage.entries()].sort()) {
    console.log(`  ${language.padEnd(12)} ${entry.pass}/${entry.total}`);
  }

  const outPath = path.isAbsolute(args.out) ? args.out : path.join(ROOT, args.out);
  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, `${results.map((result) => JSON.stringify(result)).join('\n')}\n`, 'utf8');
  console.log(`\nResults written to ${path.relative(ROOT, outPath)}`);

  if (rate < args.threshold) {
    console.error(`\nPass rate ${(rate * 100).toFixed(1)}% is below the ${(args.threshold * 100).toFixed(0)}% threshold.`);
    process.exitCode = 1;
  }
}

// Only run when executed directly, so the scorer can be imported by tests.
const invokedDirectly = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

export { loadCases, parseArgs };
