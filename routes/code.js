import { Router } from 'express';
import { runCodeRequest } from '../lib/studioAgent.js';
import { analyzeRequest } from '../lib/codeIntent.js';
import { GENERIC_ERROR } from '../lib/identity.js';

const router = Router();

// A request may carry the workspace so the assistant can see what the user is
// working on. Cap it so a huge workspace cannot blow up the prompt or the
// request body.
const MAX_FILES = 400;
const MAX_TOTAL_FILE_CHARS = 400000;
const MAX_REQUEST_CHARS = 8000;
const MAX_HISTORY_TURNS = 20;

function sanitizeFiles(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};

  const files = {};
  let total = 0;
  for (const [name, content] of Object.entries(value)) {
    if (typeof name !== 'string' || typeof content !== 'string') continue;
    if (name.length > 500 || name.includes('\0')) continue;
    if (Object.keys(files).length >= MAX_FILES) break;
    total += content.length;
    if (total > MAX_TOTAL_FILE_CHARS) break;
    files[name] = content;
  }
  return files;
}

function sanitizeHistory(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((turn) => turn && (turn.role === 'user' || turn.role === 'assistant') && typeof turn.content === 'string')
    .map((turn) => ({ role: turn.role, content: turn.content.slice(0, 4000) }))
    .slice(-MAX_HISTORY_TURNS);
}

function sanitizeFolders(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((name) => typeof name === 'string' && name.length <= 500 && !name.includes('\0'))
    .slice(0, 200);
}

// POST /api/code
//   { request, activeFile, files, folders, history, mode }
// -> { action, meta }
//
// `action` is one of the studio actions: edit, create, delete, create_folder,
// delete_folder, answer. The client is responsible for asking the user to
// approve before it touches the filesystem.
router.post('/', async (req, res) => {
  const body = req.body || {};
  const request = typeof body.request === 'string' ? body.request.trim() : '';

  if (!request) {
    return res.status(400).json({ error: 'A request is required.' });
  }
  if (request.length > MAX_REQUEST_CHARS) {
    return res.status(400).json({ error: 'The request is too long.' });
  }

  const activeFile = typeof body.activeFile === 'string' ? body.activeFile : '';
  const files = sanitizeFiles(body.files);
  const folders = sanitizeFolders(body.folders);
  const history = sanitizeHistory(body.history);
  const mode = body.mode === 'plan' ? 'plan' : 'auto';

  try {
    const result = await runCodeRequest({
      request,
      activeFile,
      files,
      folders,
      history,
      mode,
    });
    return res.json(result);
  } catch (error) {
    console.error('[code] request failed:', error?.message || error);
    const status = error?.status || 502;
    return res.status(status).json({
      error: status === 503 ? GENERIC_ERROR.rateLimited : GENERIC_ERROR.chat,
    });
  }
});

// POST /api/code/analyze
//   { request, activeFile, files }
// -> the detected intent, languages and context selection, with no model call.
//
// Useful for the UI (showing what the assistant understood) and for evals.
router.post('/analyze', (req, res) => {
  const body = req.body || {};
  const request = typeof body.request === 'string' ? body.request.trim() : '';
  if (!request) return res.status(400).json({ error: 'A request is required.' });

  const activeFile = typeof body.activeFile === 'string' ? body.activeFile : '';
  const files = sanitizeFiles(body.files);

  const analysis = analyzeRequest({
    request,
    activeFile,
    fileNames: Object.keys(files),
  });

  return res.json({
    intent: analysis.intent,
    isCoding: analysis.isCoding,
    languages: analysis.languageIds,
    primaryLanguage: analysis.primaryLanguage,
    activeLanguage: analysis.activeLanguage,
    requestedFiles: analysis.requestedFiles,
    referencedFiles: analysis.referencedFiles,
    framework: analysis.stack.framework,
    workspaceLanguages: analysis.stack.languages.map((entry) => ({
      id: entry.profile.id,
      label: entry.profile.label,
      files: entry.count,
    })),
  });
});

export default router;
