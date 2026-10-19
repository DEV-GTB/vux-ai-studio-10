// Prompt assembly for the coding pipeline.
//
// The prompt used to live as one long string inside Studio.jsx. That made it
// impossible to test, impossible to adapt per request, and impossible to
// evolve without touching the UI. It lives here now, where it can be
// assembled from parts, unit tested, and improved in one place.

import { buildLanguageRules } from './languageProfiles.js';
import { INTENTS, MUTATING_INTENTS } from './codeIntent.js';

const BASE_CODING_RULES = [
  'Follow the conventions of the language and the surrounding codebase. Read the provided files before you decide anything.',
  'Write complete, runnable code. No placeholders, no "rest of the code here", no omitted imports.',
  'Match the existing style: naming, indentation, comment density, error handling, and module layout.',
  'Make the smallest change that fully satisfies the request. Do not refactor code the user did not ask about.',
  'Never invent file paths, APIs, or configuration that do not exist in the workspace context you were given.',
  'If the request is ambiguous in a way that changes the result, return an "answer" action that states the assumption you made.',
  'Explain briefly outside the JSON only when the action is "answer". For file actions, return the JSON object and nothing else.',
];

const ACTION_CONTRACT = `Reply with exactly ONE JSON object and no other text. No markdown fences, no commentary before or after.

Allowed actions:
{"action":"edit","filename":"path/to/existing.file","content":"the complete updated file content"}
{"action":"create","filename":"path/to/new.file","content":"the complete new file content"}
{"action":"delete","filename":"path/to/existing.file","reason":"why this deletion is required"}
{"action":"create_folder","path":"path/to/folder"}
{"action":"delete_folder","path":"path/to/folder","recursive":true,"reason":"why this deletion is required"}
{"action":"answer","message":"the explanation or guidance, in markdown"}

Rules for choosing an action:
- Use "edit" when the target file already exists in the workspace context. The content must be the WHOLE file, not a diff or a fragment.
- Use "create" when the file does not exist yet, or when the user explicitly asked for a new file.
- Use "delete" and "delete_folder" ONLY when the user explicitly asked for that deletion. Never as a side effect of another request.
- Use "answer" for questions, explanations, reviews, and anything that does not require changing a file.
- "filename" and "path" must be relative paths inside the workspace. Never use absolute paths and never use "..".
- Exactly one file per response. If the request needs several files, describe the first one and mention the rest in the "message" field of an "answer" action.
- The "content" field must be valid, complete source code for that file type. Escape newlines and quotes correctly so the object parses as JSON.`;

const INTENT_GUIDANCE = {
  [INTENTS.CREATE]: [
    'The user wants something new. Create the file that best matches the request, and put the whole implementation in it — not a skeleton.',
    'Match the naming and structure conventions of the existing project.',
  ],
  [INTENTS.EDIT]: [
    'The user wants an existing file changed. Return the complete updated content of that file, preserving everything you were not asked to change.',
  ],
  [INTENTS.FIX]: [
    'The user reported a problem. Find the actual cause in the provided code before you answer.',
    'Fix the cause, not the symptom. Do not add try/catch that swallows the error, and do not disable a failing check.',
    'If the cause is not visible in the provided context, say so in an "answer" action and describe exactly what you need to see.',
  ],
  [INTENTS.REFACTOR]: [
    'The user wants the code restructured without changing behaviour.',
    'Keep the public interface identical unless the user asked to change it, and return the complete updated file.',
  ],
  [INTENTS.TEST]: [
    'Write tests that would fail before the fix and pass after it.',
    'Cover the happy path, the error path, and the boundary case. Follow the testing style already used in the project.',
  ],
  [INTENTS.EXPLAIN]: [
    'The user asked for an explanation. Use an "answer" action. Reference the provided files by name and point at specific lines or functions.',
  ],
  [INTENTS.REVIEW]: [
    'The user asked for a review. Use an "answer" action. Lead with the concrete problems, name the file and location, and give the corrected code for the most important issue.',
  ],
  [INTENTS.PLAN]: [
    'The user asked for a plan. Use an "answer" action with a numbered list of concrete steps.',
    'Each step must name the file to change and the specific change to make. Do not write the code yet.',
  ],
  [INTENTS.RUN]: [
    'The user wants to run, build, or install something. Use an "answer" action with the exact command and what it does.',
    'Only suggest commands that work with the tools present in the workspace context.',
  ],
  [INTENTS.TRANSLATE]: [
    'The user wants code moved to another language. Use the rules for the target language and keep the behaviour identical.',
  ],
  [INTENTS.ANSWER]: [
    'Use an "answer" action unless the request clearly requires changing a file.',
  ],
};

const HISTORY_GUIDANCE = [
  'This is a continuing session. Treat earlier messages as established context: reuse names, paths, and decisions the user already made.',
  'Do not ask the user to repeat information that is already in the conversation or in the workspace context.',
];

// Builds the system prompt for a coding request.
export function buildCodeSystemPrompt({
  analysis = {},
  contextBlock = '',
  includeContext = true,
} = {}) {
  const {
    intent = INTENTS.ANSWER,
    languageIds = [],
    stack = { framework: null, languages: [] },
    primaryLanguage = null,
    historyTurns = 0,
  } = analysis;

  const parts = [];

  parts.push(
    'You are the coding assistant inside Vux AI Studio, working directly on a user\'s local project.',
    'You produce code that is ready to run, not examples that need finishing.',
  );

  parts.push(`## Output contract\n${ACTION_CONTRACT}`);

  const languageRules = buildLanguageRules(languageIds);
  if (languageRules) {
    parts.push(`## Language rules you must follow\n${languageRules}`);
  }

  if (stack.framework) {
    parts.push(`## Project context\nThis project uses the ${stack.framework} stack. Assume its conventions, tooling, and directory layout.`);
  }

  const guidance = INTENT_GUIDANCE[intent] || INTENT_GUIDANCE[INTENTS.ANSWER];
  parts.push(`## How to handle this request\n${guidance.join('\n- ')}`);

  parts.push(`## General code quality\n${BASE_CODING_RULES.map((rule) => `- ${rule}`).join('\n')}`);

  if (historyTurns > 0) {
    parts.push(`## Conversation\n${HISTORY_GUIDANCE.join('\n- ')}`);
  }

  if (includeContext && contextBlock) {
    parts.push(`## Workspace context\n${contextBlock}`);
  }

  if (primaryLanguage) {
    parts.push(`## Primary language for this request\n${primaryLanguage}. Apply its rules above even when the workspace mixes languages.`);
  }

  return parts.join('\n\n');
}

// The general chat prompt. The original identity prompt is intentionally kept
// intact for brand questions, but coding requests never see it — a wall of
// team biographies actively degrades code quality and makes the model
// hesitant to write anything that mentions keys, tokens, or APIs.
export function buildChatSystemPrompt({ identityPrompt = '', englishOnly = true } = {}) {
  const parts = [];
  if (identityPrompt) parts.push(identityPrompt);
  if (englishOnly) {
    parts.push('Reply in English only, even if the user writes in another language.');
  }
  parts.push('Keep the answer clear, helpful, concise, and practical.');
  return parts.join('\n\n');
}

// The user message for a coding request. The request always goes first so the
// model reads the goal before the context.
export function buildCodeUserMessage({
  request = '',
  contextBlock = '',
  activeFile = '',
  history = [],
  maxHistoryTurns = 6,
} = {}) {
  const sections = [];

  const recentHistory = (Array.isArray(history) ? history : [])
    .filter((turn) => turn && typeof turn.content === 'string' && turn.content.trim())
    .slice(-maxHistoryTurns);

  if (recentHistory.length) {
    const rendered = recentHistory
      .map((turn) => `${turn.role === 'assistant' ? 'Assistant' : 'User'}: ${turn.content}`)
      .join('\n\n');
    sections.push(`## Earlier conversation\n${rendered}`);
  }

  sections.push(`## User request\n${request}`);

  if (activeFile) {
    sections.push(`## Currently open file\n${activeFile}`);
  }

  if (contextBlock) {
    sections.push(`## Workspace context\n${contextBlock}`);
  }

  return sections.join('\n\n');
}

// Decides whether the request should get a file action or a prose answer,
// based on the intent we detected. Used to validate what the model returns.
export function expectsFileAction(intent) {
  return MUTATING_INTENTS.has(intent);
}
