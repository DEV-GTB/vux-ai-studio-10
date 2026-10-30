// Request understanding for coding requests.
//
// Before we can build a good prompt we need to know what the user is actually
// asking for. A user who says "make the login form work" wants an edit. A user
// who says "why does this throw?" wants an explanation. A user who says
// "add a REST API for users" wants new files. Guessing wrong here wastes a
// whole model round trip, so we classify first and let the prompt adapt.

import { detectLanguagesFromText, detectWorkspaceStack, languageProfileForFile } from './languageProfiles.js';

export const INTENTS = {
  CREATE: 'create',
  EDIT: 'edit',
  FIX: 'fix',
  REFACTOR: 'refactor',
  EXPLAIN: 'explain',
  REVIEW: 'review',
  TEST: 'test',
  PLAN: 'plan',
  RUN: 'run',
  TRANSLATE: 'translate',
  ANSWER: 'answer',
};

// Ordered by specificity: the first pattern that matches wins, so the more
// specific intents must be tested before the generic ones.
const INTENT_PATTERNS = [
  {
    intent: INTENTS.PLAN,
    patterns: [
      /\b(?:plan|steps?|roadmap|break (?:it|this) down|step[- ]by[- ]step|how (?:do|should) i (?:start|approach)|outline)\b/i,
    ],
  },
  {
    intent: INTENTS.TRANSLATE,
    patterns: [
      /\b(?:convert|translate|port|rewrite|rewrite|migrate)\b.{0,30}\b(?:to|from|into)\b.{0,30}\b(?:java|python|javascript|typescript|go|rust|c\+\+|c#|csharp|php|ruby|kotlin|swift|sql)\b/i,
      /\b(?:convert|translate|port)\b/i,
    ],
  },
  {
    intent: INTENTS.RUN,
    patterns: [
      /\b(?:run|build|compile|start|install|execute|deploy|serve|launch)\b/i,
    ],
  },
  {
    intent: INTENTS.TEST,
    patterns: [
      /\b(?:unit test|tests?|testing|spec|coverage|pytest|jest|vitest|mocha|junit|rspec|go test|test case)\b/i,
    ],
  },
  {
    intent: INTENTS.REVIEW,
    patterns: [
      /\b(?:review|audit|check (?:my|the|this) (?:code|work)|code quality|best practice|pitfall|security review)\b/i,
    ],
  },
  {
    intent: INTENTS.FIX,
    patterns: [
      /\b(?:fix|debug|repair|troubleshoot|diagnos|resolve|it (?:is|'s) (?:broken|not working|failing|crashing))\b/i,
      /\b(?:error|exception|traceback|stack ?trace|bug|crash|fail(?:s|ing|ed)? to compile|does(?:n't| not) compile|does(?:n't| not) work)\b/i,
      /\bstack ?trace\b/i,
    ],
  },
  {
    intent: INTENTS.REFACTOR,
    patterns: [
      /\b(?:refactor|clean ?up|optimi[sz]e|simplify|rename|extract|modulari[sz]e|remove (?:the )?(?:unused|dead code)|reduce complexity|make (?:it|this) (?:cleaner|more readable))\b/i,
    ],
  },
  {
    intent: INTENTS.EXPLAIN,
    patterns: [
      /\b(?:explain|what (?:does|is|are)|how does|why (?:does|is|are)|walk me through|teach me|documentation for|docs for|describe)\b/i,
    ],
  },
  {
    intent: INTENTS.CREATE,
    patterns: [
      /\b(?:create|add|generate|scaffold|new|build|implement|write|set ?up|bootstrap|create a)\b/i,
    ],
  },
  {
    intent: INTENTS.EDIT,
    patterns: [
      /\b(?:edit|update|change|modify|replace|patch|tweak|adjust|style|rename|make it)\b/i,
    ],
  },
];

export function detectIntent(text = '') {
  const value = String(text || '').trim();
  if (!value) return INTENTS.ANSWER;

  for (const { intent, patterns } of INTENT_PATTERNS) {
    if (patterns.some((pattern) => pattern.test(value))) return intent;
  }
  return INTENTS.ANSWER;
}

// Intents that should result in a file operation rather than prose.
export const MUTATING_INTENTS = new Set([
  INTENTS.CREATE,
  INTENTS.EDIT,
  INTENTS.FIX,
  INTENTS.REFACTOR,
  INTENTS.TRANSLATE,
  INTENTS.TEST,
]);

// Signals that a request is about code at all. This is the check that decides
// whether we use the coding pipeline or the general chat pipeline.
const CODE_SIGNALS = [
  'code', 'coding', 'debug', 'fix', 'bug', 'function', 'script', 'program', 'app',
  'html', 'css', 'javascript', 'typescript', 'react', 'node', 'python', 'java',
  'api', 'sql', 'json', 'class ', 'import ', 'export ', 'const ', 'let ', 'if (',
  'for (', 'while (', '```', '<html', '</html>', 'console.log', 'return ', 'throw ',
  'error', 'component', 'endpoint', 'route', 'refactor', 'deploy', 'build',
  'compile', 'stack trace', 'traceback', 'exception', 'regex', 'algorithm',
];

export function isCodingRequest(text = '') {
  const value = String(text || '').toLowerCase();
  if (!value.trim()) return false;
  if (value.includes('```')) return true;
  if (/\b(?:def |class |function |public |private |fn |func |impl |package |import |#include)\b/.test(value)) return true;
  return CODE_SIGNALS.some((signal) => value.includes(signal));
}

// Pulls out file paths the user explicitly named, so we can target them
// directly instead of guessing.
export function extractRequestedFiles(text = '') {
  const value = String(text || '');
  const matches = new Set();

  const quoted = value.matchAll(/["'`]([^"'`\n]*?\.[A-Za-z0-9]{1,8})["'`]/g);
  for (const match of quoted) {
    const candidate = match[1].trim();
    if (candidate && !candidate.includes('..') && !candidate.startsWith('/')) matches.add(candidate);
  }

  const bare = value.matchAll(/(?<![\w./-])((?:[\w.-]+\/)*[\w.-]+\.[A-Za-z0-9]{1,8})\b/g);
  for (const match of bare) {
    const candidate = match[1].trim();
    if (!candidate || candidate.includes('..')) continue;
    if (!/\.[A-Za-z0-9]{1,8}$/.test(candidate)) continue;
    matches.add(candidate);
  }

  return [...matches];
}

// The single source of truth for "what are we dealing with". Everything the
// prompt builder needs is derived here.
export function analyzeRequest({
  request = '',
  activeFile = '',
  fileNames = [],
  history = [],
} = {}) {
  const text = String(request || '').trim();
  const intent = detectIntent(text);
  const stack = detectWorkspaceStack(fileNames);

  const requestedFiles = extractRequestedFiles(text);
  const activeProfile = activeFile ? languageProfileForFile(activeFile) : null;

  // Language precedence: what the user named in words, then the file they are
  // looking at, then the dominant language of the workspace.
  const textLanguages = detectLanguagesFromText(text);
  const ranked = [];
  const push = (profile) => {
    if (profile && !ranked.some((item) => item.id === profile.id)) ranked.push(profile);
  };
  textLanguages.forEach(push);
  if (activeProfile) push(activeProfile);
  stack.languages.forEach((entry) => push(entry.profile));

  const languageIds = ranked.slice(0, 4).map((profile) => profile.id);

  // The language we are most likely writing in for this specific request.
  const primaryLanguage = languageIds[0] || null;

  const referencedFiles = requestedFiles.filter((name) => fileNames.includes(name));

  return {
    request: text,
    intent,
    isCoding: isCodingRequest(text) || Boolean(activeFile) || stack.languages.length > 0,
    languageIds,
    primaryLanguage,
    activeFile,
    activeLanguage: activeProfile?.id || null,
    requestedFiles,
    referencedFiles,
    stack,
    historyTurns: Array.isArray(history) ? history.length : 0,
  };
}
