// ============================================================================
// Memory store: the things the user asked Vux to remember.
//
// A memory keeps three things:
//   - the words that were remembered, exactly as they were spoken
//   - the keywords they were indexed by, so a plain text match still works
//   - the embedding vector, so a later message can find the memory through
//     related words even when it never repeats the original phrasing
//
// The store lives outside the web roots, next to the knowledge index, so the
// private index never ends up in a static file folder.
// ============================================================================
import Database from 'better-sqlite3';
import { homedir } from 'os';
import path from 'path';
import { mkdirSync } from 'fs';

const ROOT = path.join(homedir(), '.vux-ai-studio', 'memory');
const DB_PATH = process.env.VUX_MEMORY_DB_PATH || path.join(ROOT, 'memory.db');

let db = null;

function getDb() {
  if (db) return db;
  mkdirSync(path.dirname(DB_PATH), { recursive: true });
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS memories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      text TEXT NOT NULL,
      terms TEXT NOT NULL DEFAULT '[]',
      vector TEXT,
      created_at INTEGER NOT NULL,
      hits INTEGER NOT NULL DEFAULT 0
    );
  `);
  return db;
}

function parseVector(value) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed) || !parsed.length) return null;
    return parsed.map((entry) => Number(entry) || 0);
  } catch {
    return null;
  }
}

function toMemory(row) {
  if (!row) return null;
  let terms = [];
  try {
    terms = JSON.parse(row.terms || '[]');
  } catch {
    terms = [];
  }
  return {
    id: row.id,
    text: row.text,
    terms: Array.isArray(terms) ? terms : [],
    vector: parseVector(row.vector),
    createdAt: row.created_at,
    hits: row.hits,
  };
}

/**
 * Stores one remembered item.
 *
 * @param {{ text: string, terms?: string[], vector?: number[] | null }} memory
 * @returns {object} the stored memory
 */
export function addMemory({ text, terms = [], vector = null }) {
  const database = getDb();
  const cleanText = String(text || '').trim();
  if (!cleanText) throw new Error('A memory needs some text.');

  const info = database.prepare(
    `INSERT INTO memories(text, terms, vector, created_at, hits) VALUES (?, ?, ?, ?, 0)`
  ).run(
    cleanText,
    JSON.stringify(Array.isArray(terms) ? terms : []),
    Array.isArray(vector) && vector.length ? JSON.stringify(vector) : null,
    Date.now()
  );

  return {
    id: info.lastInsertRowid,
    text: cleanText,
    terms: Array.isArray(terms) ? terms : [],
    vector: Array.isArray(vector) ? vector : null,
    createdAt: Date.now(),
    hits: 0,
  };
}

/**
 * Lists remembered items, newest first.
 *
 * @param {{ limit?: number }} [options]
 * @returns {object[]}
 */
export function listMemories({ limit = 100 } = {}) {
  const database = getDb();
  const rows = database.prepare(
    `SELECT id, text, terms, vector, created_at, hits FROM memories ORDER BY created_at DESC LIMIT ?`
  ).all(Math.max(1, Math.min(500, Number(limit) || 100)));
  return rows.map(toMemory).filter(Boolean);
}

/**
 * Finds the memories whose keywords overlap the given tokens.
 *
 * This is the fallback when no embedding service is reachable: the words are
 * matched literally instead of by meaning.
 *
 * @param {string[]} tokens
 * @param {{ limit?: number }} [options]
 * @returns {object[]}
 */
export function findMemoriesByTerms(tokens, { limit = 5 } = {}) {
  const wanted = [...new Set((tokens || []).map((token) => String(token).toLowerCase()).filter(Boolean))];
  if (!wanted.length) return [];

  const matches = [];
  for (const memory of listMemories({ limit: 500 })) {
    const haystack = new Set([
      ...memory.terms.map((term) => term.toLowerCase()),
      ...String(memory.text).toLowerCase().split(/[^a-z0-9+#.]+/i).filter(Boolean),
    ]);
    const overlap = wanted.filter((token) => haystack.has(token)).length;
    if (!overlap) continue;
    matches.push({ ...memory, score: overlap / wanted.length });
  }

  matches.sort((left, right) => right.score - left.score || right.createdAt - left.createdAt);
  return matches.slice(0, Math.max(1, Number(limit) || 5));
}

/**
 * Finds the memories closest to the given vector.
 *
 * @param {number[]} vector
 * @param {{ limit?: number, minScore?: number }} [options]
 * @returns {object[]}
 */
export function searchMemories(vector, { limit = 5, minScore = 0.2 } = {}) {
  const query = Array.isArray(vector) ? vector.map((entry) => Number(entry) || 0) : [];
  if (!query.length) return [];

  const scored = [];
  for (const memory of listMemories({ limit: 500 })) {
    if (!memory.vector || memory.vector.length !== query.length) continue;
    const score = cosineSimilarity(query, memory.vector);
    if (score >= minScore) scored.push({ ...memory, score });
  }

  scored.sort((left, right) => right.score - left.score || right.createdAt - left.createdAt);
  return scored.slice(0, Math.max(1, Number(limit) || 5));
}

/**
 * Counts how often a memory was recalled.
 *
 * @param {number[]} ids
 */
export function markRecalled(ids) {
  const list = (ids || []).map(Number).filter(Number.isFinite);
  if (!list.length) return;
  const database = getDb();
  const update = database.prepare('UPDATE memories SET hits = hits + 1 WHERE id = ?');
  const transaction = database.transaction((memoryIds) => {
    for (const id of memoryIds) update.run(id);
  });
  transaction(list);
}

/**
 * Removes one remembered item.
 *
 * @param {number} id
 * @returns {number} how many rows were removed
 */
export function removeMemory(id) {
  const database = getDb();
  const info = database.prepare('DELETE FROM memories WHERE id = ?').run(Number(id));
  return info.changes;
}

/**
 * Removes every remembered item.
 *
 * @returns {number} how many rows were removed
 */
export function clearMemories() {
  const database = getDb();
  const info = database.prepare('DELETE FROM memories').run();
  return info.changes;
}

/**
 * Closes the store. The file stays on disk; only the connection is closed.
 */
export function closeMemoryStore() {
  if (!db) return;
  try {
    db.close();
  } catch {
    /* the connection is already gone */
  }
  db = null;
}

/**
 * @returns {{ total: number }}
 */
export function memoryStats() {
  const database = getDb();
  const total = database.prepare('SELECT COUNT(*) AS n FROM memories').get().n;
  const embedded = database.prepare('SELECT COUNT(*) AS n FROM memories WHERE vector IS NOT NULL').get().n;
  return { total, embedded };
}

function cosineSimilarity(left, right) {
  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    dot += left[index] * right[index];
    leftMagnitude += left[index] * left[index];
    rightMagnitude += right[index] * right[index];
  }
  if (!leftMagnitude || !rightMagnitude) return 0;
  return dot / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude));
}
