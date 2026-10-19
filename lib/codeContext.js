// Context selection for coding requests.
//
// A coding model is only as good as the context it can see. Dumping the whole
// workspace into the prompt is wasteful and often counterproductive: the model
// loses the request inside noise. This module ranks workspace files by how
// likely they are to be relevant, then builds a budgeted context block.
//
// Everything here is deterministic and unit-testable — no model calls.

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'if', 'then', 'else', 'for', 'while',
  'to', 'of', 'in', 'on', 'at', 'by', 'with', 'from', 'as', 'is', 'are', 'was',
  'were', 'be', 'been', 'it', 'its', 'this', 'that', 'these', 'those', 'i',
  'me', 'my', 'we', 'our', 'you', 'your', 'he', 'she', 'they', 'them', 'do',
  'does', 'did', 'not', 'no', 'so', 'than', 'too', 'very', 'can', 'will', 'just',
  'should', 'now', 'please', 'make', 'add', 'code', 'file', 'files', 'use',
  'using', 'need', 'want', 'give', 'create', 'update', 'change', 'work',
]);

// Files that usually hold the entry point of a project. Including one of these
// helps the model understand the project's shape.
const ENTRY_FILE_PATTERNS = [
  /^package\.json$/i,
  /^readme(\.md)?$/i,
  /^index\.(js|ts|jsx|tsx)$/i,
  /^main\.(js|ts|py|go|rs|java|cs)$/i,
  /^app\.(js|ts|jsx|tsx|py)$/i,
  /^server\.(js|ts|py|go)$/i,
  /^src\/index\.(js|ts|jsx|tsx)$/i,
  /^pyproject\.toml$/i,
  /^requirements\.txt$/i,
  /^cargo\.toml$/i,
  /^go\.mod$/i,
];

const TEST_FILE_PATTERN = /(?:^|\/)(?:tests?|__tests__|spec)\//i;
const TEST_NAME_PATTERN = /\.(?:test|spec)\.[A-Za-z0-9]+$/i;

export function tokenize(text = '') {
  return String(text || '')
    .toLowerCase()
    .split(/[^a-z0-9_+#.-]+/)
    .map((token) => token.replace(/^[.-]+|[.-]+$/g, ''))
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token));
}

function fileNameTokens(fileName = '') {
  const base = String(fileName || '').split('/').pop() || '';
  const parts = base.split('.');
  return new Set(parts.flatMap((part) => tokenize(part)));
}

function directoryOf(fileName = '') {
  const index = String(fileName || '').lastIndexOf('/');
  return index === -1 ? '' : fileName.slice(0, index);
}

// Score one workspace file against the request. Higher is more relevant.
// The weights are intentionally coarse: we want a stable ordering, not a
// finely tuned ranking that is impossible to reason about.
export function scoreFile({
  fileName = '',
  content = '',
  requestTokens = [],
  requestedFiles = [],
  activeFile = '',
  intent = '',
  historyTokens = [],
} = {}) {
  let score = 0;
  const reasons = [];

  if (requestedFiles.includes(fileName)) {
    score += 100;
    reasons.push('named in the request');
  }

  if (fileName === activeFile) {
    score += 60;
    reasons.push('currently open');
  }

  const nameTokens = fileNameTokens(fileName);
  const nameHits = requestTokens.filter((token) => nameTokens.has(token));
  if (nameHits.length) {
    score += nameHits.length * 12;
    reasons.push(`filename mentions ${nameHits.slice(0, 3).join(', ')}`);
  }

  const contentTokens = new Set(tokenize(content));
  const contentHits = requestTokens.filter((token) => contentTokens.has(token));
  if (contentHits.length) {
    score += Math.min(contentHits.length, 8) * 2;
    reasons.push('content matches the request');
  }

  const historyHits = historyTokens.filter((token) => contentTokens.has(token) || nameTokens.has(token));
  if (historyHits.length) {
    score += Math.min(historyHits.length, 6);
  }

  const activeDirectory = directoryOf(activeFile);
  if (activeDirectory && directoryOf(fileName) === activeDirectory) {
    score += 8;
    reasons.push('same folder as the open file');
  }

  if (ENTRY_FILE_PATTERNS.some((pattern) => pattern.test(fileName))) {
    score += 6;
    reasons.push('project entry point');
  }

  const isTestFile = TEST_FILE_PATTERN.test(fileName) || TEST_NAME_PATTERN.test(fileName);
  if (isTestFile) {
    if (intent === 'fix' || intent === 'test' || intent === 'edit' || intent === 'create') {
      score += 12;
      reasons.push('test file');
    } else {
      score -= 6;
    }
  }

  if (/\.(?:json|lock|lockb|min\.js|map|png|jpg|jpeg|gif|svg|ico|woff2?|ttf|eot|mp4|mp3|wav|zip)$/i.test(fileName)) {
    score -= 12;
  }

  return { score, reasons };
}

// Picks the files worth showing the model, honouring a character budget.
// The active file and any explicitly named file are always included first
// (subject to the budget) because the model cannot work without them.
export function selectRelevantFiles({
  files = {},
  request = '',
  requestedFiles = [],
  activeFile = '',
  intent = '',
  history = [],
  maxFiles = 8,
  maxChars = 24000,
} = {}) {
  const fileNames = Object.keys(files);
  if (!fileNames.length) return { selected: [], omitted: [], totalChars: 0 };

  const requestTokens = tokenize(request);
  const historyTokens = history.flatMap((turn) => tokenize(turn?.content || '')).slice(0, 40);

  const scored = fileNames.map((fileName) => {
    const { score, reasons } = scoreFile({
      fileName,
      content: files[fileName] || '',
      requestTokens,
      requestedFiles,
      activeFile,
      intent,
      historyTokens,
    });
    return { fileName, score, reasons, size: (files[fileName] || '').length };
  });

  scored.sort((left, right) => {
    if (right.score !== left.score) return right.score - left.score;
    if (left.size !== right.size) return left.size - right.size;
    return left.fileName.localeCompare(right.fileName);
  });

  const mandatory = new Set([...requestedFiles, activeFile].filter((name) => name && files[name] !== undefined));
  const selected = [];
  const omitted = [];
  let used = 0;

  for (const entry of scored) {
    if (selected.length >= maxFiles) {
      omitted.push(entry.fileName);
      continue;
    }
    const isMandatory = mandatory.has(entry.fileName);
    if (used + entry.size > maxChars && !isMandatory) {
      omitted.push(entry.fileName);
      continue;
    }
    if (isMandatory && used + entry.size > maxChars && used > 0) {
      // Still include it, but drop the cheapest optional file to make room.
      const removableIndex = selected.findIndex((item) => !mandatory.has(item.fileName));
      if (removableIndex !== -1) {
        const [removed] = selected.splice(removableIndex, 1);
        used -= removed.size;
        omitted.push(removed.fileName);
      }
    }
    selected.push(entry);
    used += entry.size;
  }

  return { selected, omitted, totalChars: used };
}

// Builds the final context block that gets injected into the prompt.
// Structure matters: the request and the file tree come first so the model
// knows the shape of the project, then the relevant file contents.
export function buildContextBlock({
  files = {},
  selected = [],
  activeFile = '',
  folders = [],
  truncated = false,
  maxChars = 24000,
} = {}) {
  const allNames = Object.keys(files).sort((left, right) => left.localeCompare(right));
  const tree = allNames.length
    ? allNames.map((name) => `  ${name}`).join('\n')
    : '  (workspace is empty)';

  const sections = [];
  sections.push(`Workspace files (${allNames.length}${truncated ? ', truncated' : ''}):\n${tree}`);

  if (folders.length) {
    const folderList = [...folders].sort((left, right) => left.localeCompare(right)).slice(0, 60);
    sections.push(`Workspace folders:\n${folderList.map((name) => `  ${name}`).join('\n')}`);
  }

  for (const entry of selected) {
    const name = typeof entry === 'string' ? entry : entry.fileName;
    const content = files[name] || '';
    const isActive = name === activeFile;
    const header = `--- FILE: ${name}${isActive ? ' (currently open)' : ''} ---`;
    sections.push(`${header}\n${content}\n--- END FILE: ${name} ---`);
  }

  let block = sections.join('\n\n');
  if (block.length > maxChars) {
    block = `${block.slice(0, maxChars)}\n[context truncated at ${maxChars} characters]`;
  }
  return block;
}
