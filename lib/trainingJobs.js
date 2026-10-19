import { spawn } from 'child_process';
import { homedir } from 'os';
import path from 'path';
import { appendFile, mkdir, readdir, readFile, rm, stat, writeFile } from 'fs/promises';
import { existsSync } from 'fs';

const ROOT = path.join(homedir(), '.vux-ai-studio', 'ai-training');
const DIRS = {
  root: ROOT,
  datasets: path.join(ROOT, 'datasets'),
  jobs: path.join(ROOT, 'jobs'),
  logs: path.join(ROOT, 'logs'),
  artifacts: path.join(ROOT, 'artifacts'),
};

const PROTECTED = new Set(['.git', 'node_modules', '.env']);
const ALLOWED_DATASET_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}\.jsonl$/;

let jobsCache = null;
let runningJob = null;
const queue = [];

async function ensureDirs() {
  for (const dir of Object.values(DIRS)) await mkdir(dir, { recursive: true });
}

async function loadJobs() {
  if (jobsCache) return jobsCache;
  await ensureDirs();
  const file = path.join(DIRS.jobs, 'index.json');
  if (!existsSync(file)) { jobsCache = []; return jobsCache; }
  try { jobsCache = JSON.parse(await readFile(file, 'utf8')); } catch { jobsCache = []; }
  return jobsCache;
}

async function saveJobs() {
  await ensureDirs();
  await writeFile(path.join(DIRS.jobs, 'index.json'), JSON.stringify(jobsCache || [], null, 2), 'utf8');
}

function newJobId() {
  return 'job_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

function sanitizeName(name) {
  if (typeof name !== 'string' || !name.trim()) throw new Error('Invalid dataset name');
  const base = path.basename(name.trim());
  if (!ALLOWED_DATASET_NAME.test(base)) throw new Error('Dataset name must be a safe .jsonl filename');
  return base;
}

const PYTHON_CANDIDATES = [
  process.env.PYTHON_BIN,
  process.env.PYTHON,
  'python3.14', 'python3.13', 'python3.12', 'python3.11', 'python3.10',
  'python3', 'python', 'py',
  'C:\\\\Users\\\\Lenovo\\\\.local\\\\bin\\\\python3.14.exe',
].filter(Boolean);

let cachedPython = undefined;

export async function resolvePython() {
  if (cachedPython !== undefined) return cachedPython;
  for (const c of PYTHON_CANDIDATES) {
    try {
      const out = await new Promise((resolve, reject) => {
        const child = spawn(c, ['--version'], { windowsHide: true });
        let d = '';
        child.stdout.on('data', x => d += x);
        child.stderr.on('data', x => d += x);
        child.on('exit', code => code === 0 ? resolve(d.trim()) : reject(new Error('bad')));
        child.on('error', reject);
      });
      cachedPython = { cmd: c, version: out };
      return cachedPython;
    } catch {}
  }
  cachedPython = null;
  return null;
}

export async function getEnvironment() {
  const python = await resolvePython();
  return { root: ROOT, python, cuda: null };
}

export async function listDatasets() {
  await ensureDirs();
  const entries = await readdir(DIRS.datasets, { withFileTypes: true });
  const out = [];
  for (const e of entries) {
    if (!e.isFile()) continue;
    if (!ALLOWED_DATASET_NAME.test(e.name)) continue;
    const st = await stat(path.join(DIRS.datasets, e.name));
    out.push({ name: e.name, size: st.size, modifiedAt: st.mtime.toISOString() });
  }
  return out;
}

export async function saveDataset(name, content) {
  await ensureDirs();
  const safe = sanitizeName(name);
  if (typeof content !== 'string') throw new Error('content must be string');
  if (Buffer.byteLength(content, 'utf8') > 25 * 1024 * 1024) throw new Error('Dataset too large');
  await writeFile(path.join(DIRS.datasets, safe), content, 'utf8');
  return safe;
}

export async function deleteDataset(name) {
  await ensureDirs();
  const safe = sanitizeName(name);
  await rm(path.join(DIRS.datasets, safe), { force: true });
}

export async function validateDataset(name) {
  await ensureDirs();
  const safe = sanitizeName(name);
  const fullPath = path.join(DIRS.datasets, safe);
  const python = await resolvePython();
  if (!python) throw new Error('Python not available');
  return new Promise((resolve, reject) => {
    const p = spawn(python.cmd, ['validate_jsonl.py', fullPath], {
      cwd: path.resolve(process.cwd(), 'training', 'python'),
      windowsHide: true,
    });
    let out = '', err = '';
    p.stdout.on('data', d => out += d);
    p.stderr.on('data', d => err += d);
    p.on('exit', code => resolve({ code, stdout: out, stderr: err }));
    p.on('error', reject);
  });
}

async function runQueued() {
  if (runningJob) return;
  const next = queue.shift();
  if (!next) return;
  runningJob = next;
  const job = next.job;
  const python = await resolvePython();
  if (!python) {
    job.status = 'failed';
    job.error = 'Python not available';
    await saveJobs();
    runningJob = null;
    runQueued();
    return;
  }

  job.status = 'running';
  job.startedAt = new Date().toISOString();
  await saveJobs();

  const scriptPath = path.resolve(process.cwd(), 'training', 'python', 'train_coding.py');
  const cwd = process.cwd();
  const env = {
    ...process.env,
    BASE_MODEL: job.config.baseModel,
    TRAIN_FILE: path.join(DIRS.datasets, job.config.trainFile),
    VALID_FILE: job.config.validFile ? path.join(DIRS.datasets, job.config.validFile) : '',
    OUTPUT_DIR: path.join(DIRS.artifacts, job.id),
    MAX_LENGTH: String(job.config.maxLength || 512),
    EPOCHS: String(job.config.epochs || 1),
    LR: String(job.config.learningRate || 1e-4),
    BATCH_SIZE: String(job.config.batchSize || 1),
    GRAD_ACCUM: String(job.config.gradAccum || 8),
    LORA_R: String(job.config.loraR || 8),
    USE_4BIT: job.config.use4bit ? '1' : '0',
    PYTHONUNBUFFERED: '1',
  };

  const logFile = path.join(DIRS.logs, job.id + '.log');
  const out = [];
  const child = spawn(python.cmd, [scriptPath], { cwd, env, windowsHide: true });
  job.pid = child.pid;
  await saveJobs();

  child.stdout.on('data', d => { const s = d.toString(); out.push(s); writeFile(logFile, out.join(''), 'utf8').catch(()=>{}); });
  child.stderr.on('data', d => { const s = d.toString(); out.push(s); writeFile(logFile, out.join(''), 'utf8').catch(()=>{}); });

  child.on('exit', async (code) => {
    job.status = code === 0 ? 'completed' : 'failed';
    if (code !== 0) job.error = `Exit code ${code}`;
    job.finishedAt = new Date().toISOString();
    job.exitCode = code;
    if (code === 0) job.artifactPath = path.join(DIRS.artifacts, job.id);
    await saveJobs();
    runningJob = null;
    runQueued();
  });
  child.on('error', async (err) => {
    job.status = 'failed';
    job.error = err.message;
    job.finishedAt = new Date().toISOString();
    await saveJobs();
    runningJob = null;
    runQueued();
  });
}

export async function startTraining(config) {
  await ensureDirs();
  const jobs = await loadJobs();
  if (runningJob && runningJob.job.status === 'running') {
    // queue
  }
  const job = {
    id: newJobId(),
    status: 'queued',
    config,
    createdAt: new Date().toISOString(),
    logFile: null,
  };
  jobs.unshift(job);
  jobsCache = jobs;
  await saveJobs();

  const wrapped = { job, cancel: null };
  queue.push(wrapped);
  // kick
  runQueued().catch(() => {});
  // Actually runQueued needs runningJob null; but runningJob may be set. Fine.
  return job;
}

export async function cancelJob(id) {
  const jobs = await loadJobs();
  const job = jobs.find(j => j.id === id);
  if (!job) throw new Error('Job not found');
  if (runningJob && runningJob.job.id === id && runningJob.job.pid) {
    try { process.kill(runningJob.job.pid); } catch {}
  }
  // remove from queue
  const qi = queue.findIndex(w => w.job.id === id);
  if (qi >= 0) queue.splice(qi, 1);
  job.status = 'cancelled';
  job.finishedAt = new Date().toISOString();
  await saveJobs();
  return job;
}

export async function getJob(id) {
  const jobs = await loadJobs();
  return jobs.find(j => j.id === id) || null;
}

export async function listJobs() {
  return await loadJobs();
}

export async function readLog(id, maxBytes = 200000) {
  await ensureDirs();
  const file = path.join(DIRS.logs, id + '.log');
  try {
    const buf = await readFile(file);
    const txt = buf.toString('utf8');
    return txt.length > maxBytes ? txt.slice(-maxBytes) : txt;
  } catch {
    return '';
  }
}

export async function listArtifacts() {
  await ensureDirs();
  const entries = await readdir(DIRS.artifacts, { withFileTypes: true });
  const out = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const st = await stat(path.join(DIRS.artifacts, e.name));
    out.push({ id: e.name, modifiedAt: st.mtime.toISOString() });
  }
  return out;
}

// Appends training examples to a dataset. Used to capture the edits a user
// actually approved in the Studio, so the fine-tuning data reflects real
// accepted work rather than synthetic guesses.
export async function appendExamples(name, examples) {
  await ensureDirs();
  const safe = sanitizeName(name);
  if (!Array.isArray(examples) || !examples.length) {
    throw new Error('No examples to append');
  }

  const file = path.join(DIRS.datasets, safe);
  const lines = examples
    .map((example) => JSON.stringify(example))
    .join('\n');

  await appendFile(file, `${lines}\n`, 'utf8');
  return { name: safe, appended: examples.length };
}

// Reads the first N examples from a dataset so the UI can preview what would
// be trained on.
export async function readDataset(name, limit = 20) {
  await ensureDirs();
  const safe = sanitizeName(name);
  const file = path.join(DIRS.datasets, safe);
  if (!existsSync(file)) return { name: safe, examples: [], total: 0 };

  const content = await readFile(file, 'utf8');
  const lines = content.split('\n').filter((line) => line.trim());
  const examples = [];
  for (const line of lines.slice(0, limit)) {
    try {
      examples.push(JSON.parse(line));
    } catch {
      // Skip a malformed line rather than failing the whole preview.
    }
  }
  return { name: safe, examples, total: lines.length };
}

export async function deleteArtifact(id) {
  await ensureDirs();
  // safety: id must be job_...
  if (!/^job_[a-z0-9_]+$/.test(id)) throw new Error('Invalid artifact id');
  await rm(path.join(DIRS.artifacts, id), { recursive: true, force: true });
}
