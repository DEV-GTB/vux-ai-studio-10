import { Router } from 'express';
import {
  ingestText, appendText, searchKnowledge, knowledgeStats, clearSource,
  allSources,
} from '../lib/knowledgeStore.js';

const router = Router();

function assertLocal(req, res, next) {
  if (process.env.KNOWLEDGE_ALLOW_REMOTE === '1') return next();
  if (process.env.VERCEL === '1' || process.env.NODE_ENV === 'production') {
    return res.status(403).json({ error: 'KNOWLEDGE_LOCAL_ONLY' });
  }
  const host = String(req.hostname || '').toLowerCase();
  if (!['127.0.0.1', '::1', '[::1]', 'localhost'].includes(host)) {
    return res.status(403).json({ error: 'KNOWLEDGE_LOCAL_ONLY' });
  }
  return next();
}

function isLocal(req) {
  if (process.env.KNOWLEDGE_ALLOW_REMOTE === '1') return true;
  const host = String(req.hostname || '').toLowerCase();
  return ['127.0.0.1', '::1', '[::1]', 'localhost'].includes(host);
}

router.use((req, res, next) => {
  if (req.method !== 'GET' && !req.is('application/json')) {
    return res.status(415).json({ error: 'JSON_REQUIRED' });
  }
  if (req.method !== 'GET' && !isLocal(req)) {
    return res.status(403).json({ error: 'KNOWLEDGE_LOCAL_ONLY' });
  }
  next();
});

router.get('/search', (req, res) => {
  try {
    const q = String(req.query.q || '');
    const limit = Math.min(20, Math.max(1, Number(req.query.limit) || 6));
    const results = searchKnowledge(q, limit);
    res.json({ query: q, results });
  } catch (e) {
    res.status(500).json({ error: 'SEARCH_FAILED', message: e.message });
  }
});

router.get('/stats', (_req, res) => {
  try { res.json(knowledgeStats()); }
  catch (e) { res.status(500).json({ error: 'STATS_FAILED', message: e.message }); }
});

router.get('/sources', (_req, res) => {
  try { res.json({ sources: allSources() }); }
  catch (e) { res.status(500).json({ error: 'SOURCES_FAILED', message: e.message }); }
});

router.post('/ingest', (req, res) => {
  try {
    const { source, category, text, mode } = req.body || {};
    if (typeof text !== 'string' || !text.trim()) {
      return res.status(400).json({ error: 'TEXT_REQUIRED' });
    }
    const safeSource = String(source || 'inline').slice(0, 120);
    const n = mode === 'append'
      ? appendText({ source: safeSource, category, text })
      : ingestText({ source: safeSource, category, text });
    res.json({ success: true, chunks: n, source: safeSource });
  } catch (e) {
    res.status(400).json({ error: 'INGEST_FAILED', message: e.message });
  }
});

router.delete('/source/:name', (req, res) => {
  try {
    const n = clearSource(req.params.name);
    res.json({ success: true, removedChunks: n });
  } catch (e) {
    res.status(400).json({ error: 'CLEAR_FAILED', message: e.message });
  }
});

export default router;
