// Builds the fine-tuning dataset from the seed examples and the edits that
// users approved in the Studio.
//
// The system and user messages are regenerated with the same prompt builder
// the agent uses at inference time. This is the whole point of the script: if
// the training prompts differ from the serving prompts, a fine-tune teaches
// the model a format it will never be asked to use, and the fine-tune quietly
// stops helping.
//
// Usage:
//   node training/eval/build_dataset.mjs
//   node training/eval/build_dataset.mjs --out-dir training/data --valid-ratio 0.2

import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAgentPrompts } from '../../lib/studioAgent.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');

const COLLECTED_DIR = path.join(homedir(), '.vux-ai-studio', 'ai-training', 'datasets');

function parseArgs(argv) {
  const args = { outDir: 'training/data', validRatio: 0.2, seedFile: 'training/data/seed_coding.jsonl' };
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];
    if (key === '--out-dir') { args.outDir = value; index += 1; }
    else if (key === '--valid-ratio') { args.validRatio = Number(value); index += 1; }
    else if (key === '--seed') { args.seedFile = value; index += 1; }
  }
  return args;
}

async function readJsonl(file) {
  const content = await readFile(file, 'utf8');
  return content
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => {
      try { return JSON.parse(line); } catch { return null; }
    })
    .filter(Boolean);
}

// Converts a seed example into the chat format the trainer expects, using the
// production prompt builder.
function seedToChatFormat(seed) {
  const prompts = buildAgentPrompts({
    request: seed.request,
    activeFile: seed.activeFile || '',
    files: seed.files || {},
    folders: [],
    history: [],
  });

  return {
    messages: [
      { role: 'system', content: prompts.systemPrompt },
      { role: 'user', content: prompts.userMessage },
      { role: 'assistant', content: JSON.stringify(seed.target) },
    ],
    metadata: {
      source: 'seed',
      id: seed.id,
      language: seed.language,
      intent: prompts.analysis.intent,
    },
  };
}

// Validates a record the same way training/python/validate_jsonl.py does, so
// a broken dataset is caught before a training job burns GPU hours.
export function validateRecord(record) {
  if (!record || typeof record !== 'object') return 'record is not an object';
  const messages = record.messages;
  if (!Array.isArray(messages) || !messages.length) return 'missing or empty messages array';

  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index];
    if (!message || typeof message !== 'object') return `message ${index} is not an object`;
    if (!('role' in message) || !('content' in message)) return `message ${index} missing role/content`;
    if (!['user', 'assistant', 'system'].includes(message.role)) return `message ${index} has invalid role`;
    if (typeof message.content !== 'string' || !message.content.trim()) return `message ${index} has empty content`;
  }

  if (messages[messages.length - 1].role !== 'assistant') return 'last message should be assistant';
  return null;
}

// Deterministic shuffle so a rebuild produces the same split.
function shuffle(items, seed = 20260101) {
  const output = [...items];
  let state = seed;
  for (let index = output.length - 1; index > 0; index -= 1) {
    state = (state * 1664525 + 1013904223) % 4294967296;
    const target = Math.floor((state / 4294967296) * (index + 1));
    [output[index], output[target]] = [output[target], output[index]];
  }
  return output;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const outDir = path.isAbsolute(args.outDir) ? args.outDir : path.join(ROOT, args.outDir);
  const seedPath = path.isAbsolute(args.seedFile) ? args.seedFile : path.join(ROOT, args.seedFile);

  const records = [];

  if (existsSync(seedPath)) {
    const seeds = await readJsonl(seedPath);
    for (const seed of seeds) {
      if (!seed?.request || !seed?.target) continue;
      records.push(seedToChatFormat(seed));
    }
    console.log(`Seed examples: ${seeds.length}`);
  }

  // Edits the user approved in the Studio are already in chat format.
  let collected = 0;
  if (existsSync(COLLECTED_DIR)) {
    const files = await readdir(COLLECTED_DIR);
    for (const file of files) {
      if (!file.endsWith('.jsonl')) continue;
      const examples = await readJsonl(path.join(COLLECTED_DIR, file));
      for (const example of examples) {
        if (example?.messages) {
          records.push(example);
          collected += 1;
        }
      }
    }
  }
  console.log(`Collected (approved) examples: ${collected}`);

  const invalid = [];
  const valid = [];
  for (const record of records) {
    const error = validateRecord(record);
    if (error) invalid.push({ error, id: record?.metadata?.id });
    else valid.push(record);
  }
  if (invalid.length) {
    console.warn(`Skipped ${invalid.length} invalid record(s):`);
    invalid.slice(0, 5).forEach((item) => console.warn(`  - ${item.id || 'unknown'}: ${item.error}`));
  }

  const shuffled = shuffle(valid);
  const validCount = Math.max(1, Math.round(shuffled.length * args.validRatio));
  const validation = shuffled.slice(0, validCount);
  const training = shuffled.slice(validCount);

  await mkdir(outDir, { recursive: true });
  const trainPath = path.join(outDir, 'coding_train.jsonl');
  const validPath = path.join(outDir, 'coding_valid.jsonl');

  await writeFile(trainPath, training.map((record) => JSON.stringify(record)).join('\n') + (training.length ? '\n' : ''), 'utf8');
  await writeFile(validPath, validation.map((record) => JSON.stringify(record)).join('\n') + (validation.length ? '\n' : ''), 'utf8');

  console.log(`\nTrain: ${training.length} -> ${path.relative(ROOT, trainPath)}`);
  console.log(`Valid: ${validation.length} -> ${path.relative(ROOT, validPath)}`);

  const languages = new Map();
  for (const record of valid) {
    const language = record?.metadata?.language || 'unknown';
    languages.set(language, (languages.get(language) || 0) + 1);
  }
  if (languages.size) {
    console.log('\nCoverage:');
    for (const [language, count] of [...languages.entries()].sort()) {
      console.log(`  ${language.padEnd(12)} ${count}`);
    }
  }
}

// Only run when executed directly, so the validator can be imported by tests.
const invokedDirectly = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
