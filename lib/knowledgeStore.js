// ============================================================================
// Server-side knowledge store (no GPU): SQLite FTS5 full-text search.
// Keeps private indices outside the web roots. Used for travel/India knowledge
// and any ingested documents.
// ============================================================================
import Database from 'better-sqlite3';
import { homedir } from 'os';
import path from 'path';
import { mkdirSync, readFileSync, readdirSync, existsSync } from 'fs';

const ROOT = path.join(homedir(), '.vux-ai-studio', 'knowledge');
const DB_PATH = path.join(ROOT, 'knowledge.db');

let db = null;

function getDb() {
  if (db) return db;
  mkdirSync(ROOT, { recursive: true });
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS chunks
    USING fts5(chunk_text, source UNINDEXED, category UNINDEXED);
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
  `);
  return db;
}

function chunkText(text) {
  // Split into heading-aware blocks first.
  const lines = String(text || '').split(/\n/);
  const blocks = [];
  let currentHeading = '';
  let current = '';
  for (const line of lines) {
    const headingMatch = line.match(/^#{1,4}\s+(.+)/);
    if (headingMatch) {
      if (current.trim()) blocks.push({ heading: currentHeading, text: current.trim() });
      currentHeading = headingMatch[1].trim();
      current = '';
    } else {
      current += line + '\n';
    }
  }
  if (current.trim()) blocks.push({ heading: currentHeading, text: current.trim() });

  // Build chunks with target size, splitting long blocks by sentences.
  const chunks = [];
  for (const block of blocks) {
    const prefix = block.heading ? `## ${block.heading}\n` : '';
    const body = block.text;
    if ((prefix + body).length <= 450) {
      chunks.push((prefix + body).trim());
      continue;
    }
    const sentences = body.split(/(?<=[.!?])\s+/);
    let buffer = '';
    for (const s of sentences) {
      if (buffer && (buffer.length + s.length) > 400) {
        chunks.push((prefix + buffer).trim());
        buffer = '';
      }
      buffer += (buffer ? ' ' : '') + s;
    }
    if (buffer.trim()) chunks.push((prefix + buffer).trim());
  }
  return chunks.filter(c => c.length >= 40);
}

export function ingestText({ source, category = 'general', text }) {
  const database = getDb();
  const chunks = chunkText(text);
  if (!chunks.length) return 0;
  const del = database.prepare('DELETE FROM chunks WHERE source = ?');
  const ins = database.prepare('INSERT INTO chunks(chunk_text, source, category) VALUES (?, ?, ?)');
  const tx = database.transaction((rows) => {
    del.run(source);
    for (const c of rows) ins.run(c, source, category);
  });
  tx(chunks);
  return chunks.length;
}

export function appendText({ source, category = 'general', text }) {
  const database = getDb();
  const chunks = chunkText(text);
  if (!chunks.length) return 0;
  const ins = database.prepare('INSERT INTO chunks(chunk_text, source, category) VALUES (?, ?, ?)');
  const tx = database.transaction((rows) => {
    for (const c of rows) ins.run(c, source, category);
  });
  tx(chunks);
  return chunks.length;
}

function sanitizeFtsQuery(q) {
  const tokens = String(q || '').toLowerCase().match(/[a-z0-9]+/g) || [];
  const unique = [...new Set(tokens)].slice(0, 12);
  if (!unique.length) return null;
  return unique.map(t => `"${t}"`).join(' OR ');
}

export function searchKnowledge(query, limit = 6) {
  const database = getDb();
  const fts = sanitizeFtsQuery(query);
  if (!fts) return [];
  try {
    const stmt = database.prepare(
      `SELECT chunk_text, source, category, bm25(chunks) AS score
       FROM chunks WHERE chunks MATCH ? ORDER BY score LIMIT ?`
    );
    const rows = stmt.all(fts, Math.max(1, Math.min(20, Number(limit) || 6)));
    return rows.map(r => ({ text: r.chunk_text, source: r.source, category: r.category }));
  } catch {
    return [];
  }
}

export function knowledgeStats() {
  const database = getDb();
  const total = database.prepare('SELECT COUNT(*) AS n FROM chunks').get().n;
  const sources = database.prepare('SELECT source, COUNT(*) AS n FROM chunks GROUP BY source ORDER BY n DESC').all();
  return { totalChunks: total, sources };
}

export function clearSource(source) {
  const database = getDb();
  const info = database.prepare('DELETE FROM chunks WHERE source = ?').run(source);
  return info.changes;
}

export function allSources() {
  const database = getDb();
  return database.prepare('SELECT DISTINCT source FROM chunks').all().map(r => r.source);
}

export function seedDefaultKnowledge() {
  const database = getDb();
  const existing = database.prepare('SELECT COUNT(*) n FROM chunks').get().n;
  if (existing > 0) return { seeded: false, existing };
  const base = path.join(process.cwd(), 'data', 'knowledge');
  if (!existsSync(base)) return { seeded: false, existing: 0 };
  const files = readdirSync(base).filter(f => /\.(md|txt)$/i.test(f));
  let total = 0;
  for (const f of files) {
    try {
      const text = readFileSync(path.join(base, f), 'utf8');
      total += ingestText({ source: f, category: 'travel', text });
    } catch {}
  }
  return { seeded: total > 0, chunks: total };
}
