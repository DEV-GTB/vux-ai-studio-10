// ============================================================================
// The memory layer.
//
// When the user says something like "remember these related words: quantum,
// photon, entropy" the words are pulled out, turned into embeddings, and
// stored. Later, when a message arrives that is close to one of those
// memories — by meaning, or by keyword when no embedding service is
// reachable — the memory is recalled and handed to the model as context.
//
// The embedding service is optional. When it is missing or slow, the memory
// still works; it is matched by keyword instead of by meaning.
// ============================================================================
import { generate, CAPABILITY } from './aiProviders.js';
import { withTimeout } from './providers.js';
import {
  addMemory,
  findMemoriesByTerms,
  listMemories,
  markRecalled,
  searchMemories,
} from './memoryStore.js';

const EMBEDDING_TIMEOUT_MS = Number(process.env.MEMORY_EMBEDDING_TIMEOUT_MS) || 4000;
const EMBEDDING_RETRY_AFTER_MS = process.env.MEMORY_EMBEDDING_RETRY_MS
  ? Number(process.env.MEMORY_EMBEDDING_RETRY_MS)
  : 10 * 60 * 1000;
const RECALL_LIMIT = 4;
const SIMILARITY_FLOOR = 0.25;

// When the embedding service is out of credits or over its daily limit,
// every attempt fails the same way. The service is left alone for a while
// after a failure so a chat answer is never held up by it, and the memory
// falls back to matching by keyword in the meantime.
let embeddingsBlockedUntil = 0;

// "Remember this", "keep in mind these words", "don't forget that ...", and
// the other ways a person asks a chat assistant to hold on to something.
const INTENT_PATTERN = /\b(?:please\s+)?(?:remember|memori[sz]e|keep\s+(?:this|that|these|those)?\s*in\s+mind|do\s+not\s+forget|don'?t\s+forget|never\s+forget|take\s+note\s+of|note\s+down|keep\s+track\s+of|hold\s+on\s+to|store\s+for\s+later)\b/i;

// "Do you remember the old config?" is a question about the past, not an
// instruction to remember something now.
const QUESTION_PATTERN = /\b(?:do|does|did|can|could|would|will|should)\s+(?:you|we|it)\s+(?:really\s+)?remember\b/i;

// An instruction leads the message. A mention buried deep inside a sentence
// is a passing remark, not something to store.
const INTENT_MAX_INDEX = 60;

// "Tell me what you remember" asks about the memory; it does not create one.
const PRECEDING_BLOCKER = /\b(?:what|which|who|whom|whose|how|why|when|where|tell|show|list|give|repeat|describe|explain|do|does|did|can|could|would|will|should|you|we|me|us|it|there|everything|nothing|something|anything)$/i;

const LEADING_FILLER_PATTERN = /^\s*(?:just\s+)?(?:that|those|these|this|the\s+following|about|all\s+of\s+(?:the|these|those)|and|the)\b[\s:,-]*/i;

// "remember these related words: a, b" — the label before the colon says what
// the list is, so it is dropped instead of being remembered as an item.
const LABEL_PATTERN = /\b(?:words?|terms?|phrases?|items?|things?|topics?|names?|subjects?)\b/i;

const STOP_WORDS = new Set([
  'a', 'about', 'all', 'also', 'am', 'an', 'and', 'any', 'are', 'as', 'at', 'be',
  'been', 'but', 'by', 'can', 'do', 'does', 'for', 'from', 'had', 'has', 'have',
  'he', 'her', 'here', 'him', 'his', 'how', 'i', 'if', 'in', 'into', 'is', 'it',
  'its', 'me', 'my', 'not', 'of', 'on', 'or', 'our', 'out', 'over', 'please',
  'she', 'should', 'so', 'some', 'such', 'than', 'that', 'the', 'their', 'them',
  'then', 'there', 'these', 'they', 'this', 'those', 'to', 'too', 'up', 'us',
  'very', 'was', 'we', 'were', 'what', 'when', 'where', 'which', 'while', 'who',
  'will', 'with', 'would', 'you', 'your',
]);

/**
 * Tells whether the user asked for something to be remembered.
 *
 * @param {string} text
 * @returns {{ matched: boolean, phrase: string }}
 */
export function detectMemoryIntent(text) {
  const value = String(text || '').trim();
  const match = value.match(INTENT_PATTERN);
  if (!match) return { matched: false, phrase: '' };
  // A question about the past is not an instruction to remember something.
  if (value.endsWith('?')) return { matched: false, phrase: '' };
  if (QUESTION_PATTERN.test(value)) return { matched: false, phrase: '' };
  if (match.index > INTENT_MAX_INDEX) return { matched: false, phrase: '' };
  if (PRECEDING_BLOCKER.test(value.slice(0, match.index).trim())) {
    return { matched: false, phrase: '' };
  }
  return { matched: true, phrase: match[0].trim() };
}

/**
 * Pulls the items to remember out of the sentence.
 *
 * "Remember these related words: quantum, photon and entropy" gives
 * ["quantum", "photon", "entropy"].
 *
 * @param {string} text
 * @returns {string[]}
 */
export function extractMemoryItems(text) {
  const value = String(text || '').trim();
  if (!value) return [];

  // Every "remember ..." clause in the message is its own group of items.
  const segments = value.split(INTENT_PATTERN).filter((segment) => segment.trim());
  const items = [];

  for (const segment of segments) {
    let body = segment;
    // "that the API rate limit" carries two pieces of filler, so the front
    // of the phrase is trimmed until nothing obvious is left.
    for (let pass = 0; pass < 3; pass += 1) {
      const trimmed = body.replace(LEADING_FILLER_PATTERN, ' ');
      if (trimmed === body) break;
      body = trimmed;
    }

    const colonIndex = body.indexOf(':');
    if (colonIndex > 0 && colonIndex < 48) {
      const label = body.slice(0, colonIndex);
      if (/^[\w\s]*$/.test(label) && LABEL_PATTERN.test(label)) {
        body = body.slice(colonIndex + 1);
      }
    }

    const parts = body
      .split(/[,;\n•|]+|\band\b|\bor\b/i)
      .map((part) => part.replace(/^[\s\-–—:•.]+/, '').replace(/[\s\-–—:•.]+$/, '').trim())
      .filter((part) => part.length >= 2 && part.length <= 240)
      .filter((part) => !STOP_WORDS.has(part.toLowerCase()));

    items.push(...parts);
  }

  return [...new Set(items)];
}

/**
 * Reduces a piece of text to the words that identify it.
 *
 * @param {string} text
 * @returns {string[]}
 */
export function extractKeywords(text) {
  const value = String(text || '').toLowerCase();
  const words = value.match(/[a-z0-9][a-z0-9+#._-]*/g) || [];
  const unique = [];
  for (const word of words) {
    const clean = word.replace(/[._-]+$/, '');
    if (clean.length < 3) continue;
    if (STOP_WORDS.has(clean)) continue;
    if (!unique.includes(clean)) unique.push(clean);
  }
  return unique.slice(0, 24);
}

/**
 * Turns text into embedding vectors.
 *
 * Never throws: a missing or slow embedding service simply means there are
 * no vectors, and the caller falls back to keyword matching.
 *
 * @param {string[]} texts
 * @returns {Promise<number[][]>}
 */
export async function embedTexts(texts) {
  const input = (texts || []).map((text) => String(text || '').trim()).filter(Boolean);
  if (!input.length) return [];
  if (Date.now() < embeddingsBlockedUntil) return [];

  try {
    const work = generate(CAPABILITY.EMBEDDINGS, { texts: input })
      .then((result) => {
        const rows = result?.result?.embeddings;
        if (!Array.isArray(rows) || rows.length !== input.length) return [];
        return rows.map((row) => (Array.isArray(row) ? row.map((entry) => Number(entry) || 0) : []));
      });

    const rows = await withTimeout(work, EMBEDDING_TIMEOUT_MS, 'embedding service');
    if (!Array.isArray(rows) || !rows.length) {
      embeddingsBlockedUntil = Date.now() + EMBEDDING_RETRY_AFTER_MS;
      return [];
    }
    embeddingsBlockedUntil = 0;
    return rows;
  } catch (error) {
    embeddingsBlockedUntil = Date.now() + EMBEDDING_RETRY_AFTER_MS;
    console.warn('[memory] embedding service unavailable:', error?.message || error);
    return [];
  }
}

/**
 * Stores the given items as memories.
 *
 * @param {string[]} items
 * @returns {Promise<{ text: string, terms: string[], embedded: boolean }[]>}
 */
export async function rememberItems(items) {
  const list = (items || []).map((item) => String(item || '').trim()).filter(Boolean);
  if (!list.length) return [];

  const vectors = await embedTexts(list);
  const stored = [];

  for (const [index, text] of list.entries()) {
    const vector = vectors[index]?.length ? vectors[index] : null;
    const terms = extractKeywords(text);
    const memory = addMemory({ text, terms, vector });
    stored.push({ id: memory.id, text, terms, embedded: Boolean(vector) });
  }

  return stored;
}

/**
 * Finds the memories that are close to the given message.
 *
 * The keyword search runs first, so a message that repeats the remembered
 * words is answered at once. When the words do not match, the vector search
 * runs, and that is what finds a memory through related words — "quantum"
 * remembered earlier comes back for a question about particle physics.
 *
 * @param {string} query
 * @param {{ limit?: number, exclude?: string[] }} [options]
 * @returns {Promise<{ id: number, text: string, terms: string[], score: number }[]>}
 */
export async function recallMemories(query, { limit = RECALL_LIMIT, exclude = [] } = {}) {
  const value = String(query || '').trim();
  if (!value) return [];

  const stored = listMemories({ limit: 500 });
  if (!stored.length) return [];

  const excluded = new Set(exclude.map((item) => String(item).toLowerCase()));
  const keywordHits = findMemoriesByTerms(extractKeywords(value), { limit })
    .filter((memory) => !excluded.has(String(memory.text).toLowerCase()));
  const strongKeywordHit = keywordHits.some((hit) => hit.score >= 0.5);

  let hits = keywordHits;
  if (!strongKeywordHit) {
    const [vector] = await embedTexts([value]);
    if (vector?.length) {
      const vectorHits = searchMemories(vector, { limit, minScore: SIMILARITY_FLOOR })
        .filter((memory) => !excluded.has(String(memory.text).toLowerCase()));
      const seen = new Set(vectorHits.map((memory) => memory.id));
      hits = [...vectorHits, ...keywordHits.filter((memory) => !seen.has(memory.id))];
    }
  }

  hits = hits.filter((memory) => !excluded.has(String(memory.text).toLowerCase()));
  if (hits.length) markRecalled(hits.map((memory) => memory.id));
  return hits.slice(0, Math.max(1, Number(limit) || RECALL_LIMIT));
}

/**
 * Builds the memory part of the system prompt for one chat turn.
 *
 * @param {string} userText
 * @returns {Promise<string>}
 */
export async function buildMemoryContext(userText) {
  const value = String(userText || '').trim();
  if (!value) return '';

  const lines = [];
  const justStored = [];

  const intent = detectMemoryIntent(value);
  if (intent.matched) {
    const items = extractMemoryItems(value);
    if (items.length) {
      const stored = await rememberItems(items);
      justStored.push(...stored.map((item) => item.text));
      lines.push('The user asked you to remember something. It is now saved in your long-term memory:');
      for (const item of stored) lines.push(`- ${item.text}`);
      lines.push('Confirm briefly that you remembered it, and continue with what the user asked.');
    }
  }

  const recalled = await recallMemories(value, { exclude: justStored });
  if (recalled.length) {
    if (lines.length) lines.push('');
    lines.push('RECALLED MEMORY (related to this message — use it when it is relevant):');
    for (const memory of recalled) lines.push(`- ${memory.text}`);
  }

  return lines.join('\n');
}
