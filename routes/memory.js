import { Router } from 'express';
import {
  clearMemories,
  listMemories,
  memoryStats,
  removeMemory,
} from '../lib/memoryStore.js';

const router = Router();

// GET /api/memory  -> the items the user asked Vux to remember
router.get('/', (_req, res) => {
  try {
    const memories = listMemories({ limit: 100 }).map((memory) => ({
      id: memory.id,
      text: memory.text,
      terms: memory.terms,
      createdAt: memory.createdAt,
      hits: memory.hits,
    }));
    res.json({ memories, stats: memoryStats() });
  } catch (error) {
    res.status(500).json({ error: 'MEMORY_LIST_FAILED', message: error?.message });
  }
});

// DELETE /api/memory/:id  -> forget one item
router.delete('/:id', (req, res) => {
  try {
    const removed = removeMemory(req.params.id);
    if (!removed) return res.status(404).json({ error: 'MEMORY_NOT_FOUND' });
    res.json({ success: true, removed });
  } catch (error) {
    res.status(400).json({ error: 'MEMORY_REMOVE_FAILED', message: error?.message });
  }
});

// DELETE /api/memory  -> forget everything
router.delete('/', (_req, res) => {
  try {
    res.json({ success: true, removed: clearMemories() });
  } catch (error) {
    res.status(400).json({ error: 'MEMORY_CLEAR_FAILED', message: error?.message });
  }
});

export default router;
