import { Router } from 'express';
import { lstat, mkdir, readdir, readFile, realpath, rename, rm, writeFile } from 'fs/promises';
import { homedir } from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const router = Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_WORKSPACE_ROOT = path.join(homedir(), '.vux-ai-studio', 'workspace');
const MAX_FILE_BYTES = 1024 * 1024;
const MAX_WORKSPACE_BYTES = 8 * 1024 * 1024;
const MAX_WORKSPACE_FILES = 500;
const BLOCKED_DIRECTORIES = new Set([
  '.git', '.next', '.render', '.vercel', '__pycache__', 'build', 'coverage',
  'dist', 'node_modules', 'target', 'venv', '.venv',
]);
const TEXT_EXTENSIONS = new Set([
  '.c', '.cc', '.cpp', '.cs', '.css', '.dockerfile', '.go', '.h', '.hpp',
  '.html', '.ino', '.java', '.js', '.jsx', '.json', '.kt', '.kts', '.md',
  '.php', '.py', '.rb', '.rs', '.scss', '.sh', '.sql', '.svg', '.swift',
  '.toml', '.ts', '.tsx', '.txt', '.xml', '.yaml', '.yml',
]);

function isLoopback(hostname = '') {
  return ['127.0.0.1', '::1', '[::1]', 'localhost'].includes(hostname.toLowerCase());
}

function isProtectedName(name) {
  const value = name.toLowerCase();
  return /^\.env(?:\.|$)/.test(value) ||
    (/(^|[._-])(secret|secrets|credential|credentials|token|api[_-]?key|private[_-]?key)([._-]|$)/.test(value) && !value.includes('example')) ||
    /\.(?:key|pem|p12|pfx)$/i.test(value) || value === 'nexus_secrets.h';
}

function assertLocalRequest(req, res, next) {
  if (process.env.VERCEL === '1' || process.env.NODE_ENV === 'production') {
    return res.status(403).json({ error: 'LOCAL_WORKSPACE_ONLY' });
  }

  if (!isLoopback(req.hostname?.toLowerCase())) {
    return res.status(403).json({ error: 'LOCAL_WORKSPACE_ONLY' });
  }

  const origin = req.get('origin');
  if (origin) {
    try {
      if (!isLoopback(new URL(origin).hostname)) return res.status(403).json({ error: 'LOCAL_WORKSPACE_ONLY' });
    } catch {
      return res.status(403).json({ error: 'INVALID_ORIGIN' });
    }
  }

  if (req.method !== 'GET' && !req.is('application/json')) {
    return res.status(415).json({ error: 'JSON_REQUIRED' });
  }
  return next();
}

async function getRoot() {
  const configuredRoot = process.env.STUDIO_WORKSPACE_ROOT || DEFAULT_WORKSPACE_ROOT;
  const root = path.resolve(configuredRoot);
  await mkdir(root, { recursive: true });
  return realpath(root);
}

function resolveRelativePath(root, value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 500 || value.includes('\0')) {
    throw Object.assign(new Error('Invalid relative path.'), { status: 400 });
  }

  const normalized = value.replace(/\\/g, '/');
  if (normalized.startsWith('/') || /^[A-Za-z]:/.test(normalized)) {
    throw Object.assign(new Error('Absolute paths are not allowed.'), { status: 400 });
  }

  const segments = normalized.split('/');
  if (segments.some((segment) => !segment || segment === '.' || segment === '..' || /[<>:"|?*\x00-\x1f]/.test(segment))) {
    throw Object.assign(new Error('Invalid relative path.'), { status: 400 });
  }
  if (segments.some((segment) => BLOCKED_DIRECTORIES.has(segment.toLowerCase()) || isProtectedName(segment))) {
    throw Object.assign(new Error('Protected workspace paths cannot be accessed.'), { status: 403 });
  }

  const target = path.resolve(root, ...segments);
  const relative = path.relative(root, target);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw Object.assign(new Error('Workspace root cannot be modified.'), { status: 403 });
  }
  return { target, segments };
}

async function assertNoSymlinks(root, segments) {
  let current = root;
  for (const segment of segments) {
    current = path.join(current, segment);
    try {
      if ((await lstat(current)).isSymbolicLink()) {
        throw Object.assign(new Error('Symbolic links are not allowed.'), { status: 403 });
      }
    } catch (error) {
      if (error.code === 'ENOENT') return;
      throw error;
    }
  }
}

function isTextFile(name) {
  return TEXT_EXTENSIONS.has(path.extname(name).toLowerCase()) ||
    ['.dockerignore', '.editorconfig', '.gitignore', 'dockerfile', 'makefile'].includes(name.toLowerCase());
}

async function walkWorkspace(root) {
  const files = {};
  const folders = [];
  let totalBytes = 0;

  async function visit(directory, relativeDirectory) {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      if (Object.keys(files).length >= MAX_WORKSPACE_FILES || totalBytes >= MAX_WORKSPACE_BYTES) break;
      if (entry.isSymbolicLink() || BLOCKED_DIRECTORIES.has(entry.name.toLowerCase()) || isProtectedName(entry.name)) continue;

      const relativePath = relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        folders.push(relativePath);
        await visit(path.join(directory, entry.name), relativePath);
      } else if (entry.isFile() && isTextFile(entry.name)) {
        const absolutePath = path.join(directory, entry.name);
        const metadata = await lstat(absolutePath);
        if (metadata.size > MAX_FILE_BYTES || totalBytes + metadata.size > MAX_WORKSPACE_BYTES) continue;
        const content = await readFile(absolutePath, 'utf8');
        if (content.includes('\0')) continue;
        files[relativePath] = content;
        totalBytes += metadata.size;
      }
    }
  }

  await visit(root, '');
  return { files, folders, truncated: Object.keys(files).length >= MAX_WORKSPACE_FILES || totalBytes >= MAX_WORKSPACE_BYTES };
}

router.use(assertLocalRequest);

router.get('/', async (_req, res) => {
  try {
    const root = await getRoot();
    return res.json({ name: path.basename(root), ...(await walkWorkspace(root)) });
  } catch (error) {
    console.error('[workspace] listing failed:', error.message);
    return res.status(500).json({ error: 'WORKSPACE_LIST_FAILED' });
  }
});

router.post('/file', async (req, res) => {
  const { path: relativePath, content, mode = 'write' } = req.body || {};
  if (typeof content !== 'string' || Buffer.byteLength(content, 'utf8') > MAX_FILE_BYTES || !['create', 'write'].includes(mode)) {
    return res.status(400).json({ error: 'INVALID_FILE_REQUEST' });
  }

  try {
    const root = await getRoot();
    const { target, segments } = resolveRelativePath(root, relativePath);
    await assertNoSymlinks(root, segments);
    if (mode === 'create') {
      // The parent folder may not exist yet. Creating it here means a file
      // can be created straight into a new folder instead of failing.
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, content, { encoding: 'utf8', flag: 'wx' });
    }
    else {
      if (!(await lstat(target)).isFile()) return res.status(400).json({ error: 'NOT_A_FILE' });
      await writeFile(target, content, 'utf8');
    }
    return res.json({ success: true, path: relativePath });
  } catch (error) {
    if (error.code === 'EEXIST') return res.status(409).json({ error: 'FILE_ALREADY_EXISTS' });
    if (error.code === 'ENOENT') return res.status(404).json({ error: 'PARENT_OR_FILE_NOT_FOUND' });
    return res.status(error.status || 500).json({ error: error.status ? error.message : 'FILE_WRITE_FAILED' });
  }
});

router.patch('/file', async (req, res) => {
  const { from, to } = req.body || {};
  try {
    const root = await getRoot();
    const source = resolveRelativePath(root, from);
    const destination = resolveRelativePath(root, to);
    await assertNoSymlinks(root, source.segments);
    await assertNoSymlinks(root, destination.segments);
    if (!(await lstat(source.target)).isFile()) return res.status(400).json({ error: 'NOT_A_FILE' });
    await rename(source.target, destination.target);
    return res.json({ success: true, path: to });
  } catch (error) {
    if (error.code === 'ENOENT') return res.status(404).json({ error: 'FILE_NOT_FOUND' });
    return res.status(error.status || 500).json({ error: error.status ? error.message : 'FILE_RENAME_FAILED' });
  }
});

router.delete('/file', async (req, res) => {
  try {
    const root = await getRoot();
    const { target, segments } = resolveRelativePath(root, req.body?.path);
    await assertNoSymlinks(root, segments);
    if (!(await lstat(target)).isFile()) return res.status(400).json({ error: 'NOT_A_FILE' });
    await rm(target);
    return res.json({ success: true });
  } catch (error) {
    if (error.code === 'ENOENT') return res.status(404).json({ error: 'FILE_NOT_FOUND' });
    return res.status(error.status || 500).json({ error: error.status ? error.message : 'FILE_DELETE_FAILED' });
  }
});

router.post('/folder', async (req, res) => {
  try {
    const root = await getRoot();
    const { target, segments } = resolveRelativePath(root, req.body?.path);
    await assertNoSymlinks(root, segments);
    await mkdir(target, { recursive: true });
    return res.json({ success: true, path: req.body.path });
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.status ? error.message : 'FOLDER_CREATE_FAILED' });
  }
});

router.delete('/folder', async (req, res) => {
  try {
    const root = await getRoot();
    const { target, segments } = resolveRelativePath(root, req.body?.path);
    await assertNoSymlinks(root, segments);
    if (!(await lstat(target)).isDirectory()) return res.status(400).json({ error: 'NOT_A_FOLDER' });
    await rm(target, { recursive: req.body?.recursive === true, force: false });
    return res.json({ success: true });
  } catch (error) {
    if (error.code === 'ENOENT') return res.status(404).json({ error: 'FOLDER_NOT_FOUND' });
    if (error.code === 'ENOTEMPTY') return res.status(409).json({ error: 'FOLDER_NOT_EMPTY' });
    return res.status(error.status || 500).json({ error: error.status ? error.message : 'FOLDER_DELETE_FAILED' });
  }
});

export default router;