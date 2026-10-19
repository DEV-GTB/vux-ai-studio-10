// The coding agent: turns a user request into a validated file action.
//
// Pipeline:
//   request -> analyze (intent + language) -> select context -> build prompt
//           -> call the model -> parse the action -> validate the action
//
// Everything except the model call is deterministic and unit tested. The
// validation step matters as much as the prompt: a model that returns
// `{"action":"edit","filename":"../../etc/passwd"}` must never reach the
// filesystem.

import { analyzeRequest, INTENTS, MUTATING_INTENTS } from './codeIntent.js';
import { selectRelevantFiles, buildContextBlock } from './codeContext.js';
import { buildCodeSystemPrompt, buildCodeUserMessage } from './promptBuilder.js';
import { runProviderChain } from './providers.js';
import { scrubCodePayload, scrubResponse } from './secretScrubber.js';

const VALID_ACTIONS = new Set(['edit', 'create', 'delete', 'create_folder', 'delete_folder', 'answer']);
const MAX_CONTENT_BYTES = 1024 * 1024;

// Path segments that must never be written to, mirroring routes/workspace.js.
const BLOCKED_SEGMENTS = new Set([
  '.git', '.next', '.render', '.vercel', '__pycache__', 'build', 'coverage',
  'dist', 'node_modules', 'target', 'venv', '.venv', '.env',
]);

/**
 * Extracts the action object from a model response.
 *
 * The model is asked for a single JSON object with no fences, but real models
 * sometimes wrap it anyway, so the fences are stripped and a bare object is
 * accepted too.
 */
export function parseAction(text) {
  const source = String(text || '').trim();
  if (!source) return null;

  const candidates = [];
  const fenced = source.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) candidates.push(fenced[1].trim());
  candidates.push(source);

  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      const value = JSON.parse(candidate);
      if (value && typeof value === 'object' && VALID_ACTIONS.has(value.action)) return value;
    } catch {
      // Try the next candidate.
    }

    // Fall back to the first balanced JSON object in the text.
    const embedded = extractFirstJsonObject(candidate);
    if (embedded) {
      try {
        const value = JSON.parse(embedded);
        if (value && typeof value === 'object' && VALID_ACTIONS.has(value.action)) return value;
      } catch {
        // Not valid JSON after all.
      }
    }
  }

  return null;
}

// Scans for the first balanced { ... } block, respecting string literals.
function extractFirstJsonObject(text) {
  const start = text.indexOf('{');
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(start, index + 1);
    }
  }
  return null;
}

/**
 * Validates a workspace-relative path.
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateWorkspacePath(value) {
  if (typeof value !== 'string' || !value.trim()) {
    return { valid: false, error: 'The path is empty.' };
  }
  if (value.length > 500) {
    return { valid: false, error: 'The path is too long.' };
  }
  if (value.includes('\0')) {
    return { valid: false, error: 'The path contains an invalid character.' };
  }

  const normalized = value.replace(/\\/g, '/');
  if (normalized.startsWith('/') || /^[A-Za-z]:/.test(normalized)) {
    return { valid: false, error: 'Absolute paths are not allowed. Use a path relative to the workspace.' };
  }

  const segments = normalized.split('/').filter((segment) => segment !== '');
  if (!segments.length) {
    return { valid: false, error: 'The path is empty.' };
  }
  if (segments.some((segment) => segment === '.' || segment === '..')) {
    return { valid: false, error: 'Paths may not contain "." or ".." segments.' };
  }
  if (segments.some((segment) => BLOCKED_SEGMENTS.has(segment.toLowerCase()))) {
    return { valid: false, error: 'That path is protected and cannot be modified by the assistant.' };
  }
  if (segments.some((segment) => /[<>:"|?*]/.test(segment))) {
    return { valid: false, error: 'The path contains characters that are not allowed.' };
  }

  return { valid: true };
}

/**
 * Validates a parsed action against the workspace and the request.
 * @returns {{ valid: boolean, error?: string, action?: object }}
 */
export function validateAction(action, { files = {}, intent = INTENTS.ANSWER, activeFile = '' } = {}) {
  if (!action || !VALID_ACTIONS.has(action.action)) {
    return { valid: false, error: 'The assistant returned an action that is not supported.' };
  }

  if (action.action === 'answer') {
    if (typeof action.message !== 'string' || !action.message.trim()) {
      return { valid: false, error: 'The assistant returned an empty explanation.' };
    }
    return { valid: true, action };
  }

  const path = action.action === 'create_folder' || action.action === 'delete_folder'
    ? action.path
    : action.filename;
  const pathCheck = validateWorkspacePath(path);
  if (!pathCheck.valid) return { valid: false, error: pathCheck.error };

  const normalized = String(path).replace(/\\/g, '/');

  if (action.action === 'edit') {
    if (!Object.prototype.hasOwnProperty.call(files, normalized)) {
      return {
        valid: false,
        error: `The assistant tried to edit "${normalized}", which does not exist in the workspace.`,
      };
    }
    if (typeof action.content !== 'string') {
      return { valid: false, error: 'The assistant did not return file content for the edit.' };
    }
  }

  if (action.action === 'create') {
    if (typeof action.content !== 'string') {
      return { valid: false, error: 'The assistant did not return file content for the new file.' };
    }
  }

  if (action.action === 'delete' || action.action === 'delete_folder') {
    if (!Object.prototype.hasOwnProperty.call(files, normalized) && action.action === 'delete') {
      return {
        valid: false,
        error: `The assistant tried to delete "${normalized}", which does not exist in the workspace.`,
      };
    }
    if (typeof action.reason !== 'string' || !action.reason.trim()) {
      return { valid: false, error: 'A deletion must include a reason.' };
    }
  }

  if (typeof action.content === 'string' && Buffer.byteLength(action.content, 'utf8') > MAX_CONTENT_BYTES) {
    return { valid: false, error: 'The returned file exceeds the 1 MB limit.' };
  }

  // Guard against a model quietly returning prose for a request that clearly
  // needed a file change. The user is told what happened either way.
  const actionFitsIntent = MUTATING_INTENTS.has(intent)
    ? action.action !== 'answer'
    : true;

  return { valid: true, action, actionFitsIntent };
}

/**
 * Builds the exact prompts the agent uses for a request.
 *
 * Exported separately so the training pipeline can produce examples with the
 * same system and user messages the model sees at inference time. If these
 * two drift apart, a fine-tuned model is trained on a different distribution
 * than it is served, and the fine-tune quietly stops helping.
 */
export function buildAgentPrompts({
  request = '',
  activeFile = '',
  files = {},
  folders = [],
  history = [],
  mode = 'auto',
} = {}) {
  const text = String(request || '').trim();
  const fileNames = Object.keys(files);
  const analysis = analyzeRequest({ request: text, activeFile, fileNames, history });
  const effectiveIntent = mode === 'plan' ? INTENTS.PLAN : analysis.intent;

  const { selected, omitted, totalChars } = selectRelevantFiles({
    files,
    request: text,
    requestedFiles: analysis.requestedFiles,
    activeFile,
    intent: effectiveIntent,
    history,
  });

  const contextBlock = buildContextBlock({
    files,
    selected,
    activeFile,
    folders,
    maxChars: 24000,
  });

  const systemPrompt = buildCodeSystemPrompt({
    analysis: { ...analysis, intent: effectiveIntent },
    contextBlock,
  });

  const userMessage = buildCodeUserMessage({
    request: text,
    contextBlock,
    activeFile,
    history,
  });

  return {
    analysis: { ...analysis, intent: effectiveIntent },
    systemPrompt,
    userMessage,
    contextFiles: selected.map((entry) => entry.fileName),
    omittedFiles: omitted,
    contextChars: totalChars,
  };
}

/**
 * Runs one coding request end to end.
 *
 * @param {object} options
 * @param {string} options.request      the user's instruction
 * @param {string} options.activeFile   the file currently open in the editor
 * @param {object} options.files        map of workspace-relative path to content
 * @param {string[]} options.folders    workspace folders
 * @param {Array}  options.history      prior turns of this conversation
 * @param {'auto'|'plan'} options.mode
 */
export async function runCodeRequest({
  request = '',
  activeFile = '',
  files = {},
  folders = [],
  history = [],
  mode = 'auto',
  logger = console,
} = {}) {
  const text = String(request || '').trim();
  if (!text) {
    const error = new Error('A request is required.');
    error.status = 400;
    throw error;
  }

  const {
    analysis,
    systemPrompt,
    userMessage,
    contextFiles,
    omittedFiles,
    contextChars,
  } = buildAgentPrompts({ request: text, activeFile, files, folders, history, mode });

  const effectiveIntent = analysis.intent;

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userMessage },
  ];

  const { text: rawText, provider, model } = await runProviderChain({
    messages,
    isCoding: true,
    preferCode: true,
    logger,
  });

  const action = parseAction(rawText);
  if (!action) {
    // The model answered in prose. That is a legitimate outcome, so surface it
    // as an answer action instead of failing the request.
    const message = scrubResponse(rawText);
    return {
      action: { action: 'answer', message },
      meta: {
        intent: effectiveIntent,
        languages: analysis.languageIds,
        contextFiles,
        omittedFiles,
        contextChars,
        parsed: false,
      },
    };
  }

  const cleanAction = { ...action };
  if (typeof cleanAction.content === 'string') {
    cleanAction.content = scrubCodePayload(cleanAction.content);
  }
  if (typeof cleanAction.message === 'string') {
    cleanAction.message = scrubResponse(cleanAction.message);
  }

  const validation = validateAction(cleanAction, {
    files,
    intent: effectiveIntent,
    activeFile,
  });

  if (!validation.valid) {
    return {
      action: {
        action: 'answer',
        message: `The assistant's proposed change was rejected: ${validation.error}\n\nNothing was changed. Please rephrase the request or open the file you meant to work on.`,
      },
      meta: {
        intent: effectiveIntent,
        languages: analysis.languageIds,
        contextFiles,
        omittedFiles,
        contextChars,
        parsed: true,
        rejected: validation.error,
      },
    };
  }

  return {
    action: cleanAction,
    meta: {
      intent: effectiveIntent,
      languages: analysis.languageIds,
      contextFiles,
      omittedFiles,
      contextChars,
      parsed: true,
      actionFitsIntent: validation.actionFitsIntent !== false,
    },
  };
}

