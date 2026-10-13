import { Router } from 'express';
import path from 'path';
import * as TJ from '../lib/trainingJobs.js';

const router = Router();

function isLoopback(hostname = '') {
  return ['127.0.0.1', '::1', '[::1]', 'localhost'].includes(String(hostname).toLowerCase());
}

function assertLocal(req, res, next) {
  if (process.env.TRAINING_ALLOW_REMOTE === '1') return next();
  if (process.env.VERCEL === '1' || process.env.NODE_ENV === 'production') {
    return res.status(403).json({ error: 'TRAINING_LOCAL_ONLY' });
  }
  if (!isLoopback(req.hostname?.toLowerCase())) {
    return res.status(403).json({ error: 'TRAINING_LOCAL_ONLY' });
  }
  const origin = req.get('origin');
  if (origin) {
    try { if (!isLoopback(new URL(origin).hostname)) return res.status(403).json({ error: 'TRAINING_LOCAL_ONLY' }); }
    catch { return res.status(400).json({ error: 'INVALID_ORIGIN' }); }
  }
  return next();
}

router.use(assertLocal);
router.use((req, res, next) => {
  if (req.method !== 'GET' && !req.is('application/json')) {
    // allow raw text uploads for datasets via JSON string field only
    if (req.path === '/datasets' && req.method === 'POST') return next();
  }
  if (req.method !== 'GET' && !req.is('application/json')) return res.status(415).json({ error: 'JSON_REQUIRED' });
  next();
});

router.get('/environment', async (_req, res) => {
  try { res.json(await TJ.getEnvironment()); }
  catch (e) { res.status(500).json({ error: 'ENV_CHECK_FAILED', message: e.message }); }
});

router.get('/datasets', async (_req, res) => {
  try { res.json({ datasets: await TJ.listDatasets() }); }
  catch (e) { res.status(500).json({ error: 'LIST_FAILED', message: e.message }); }
});

router.post('/datasets', async (req, res) => {
  try {
    const { name, content } = req.body || {};
    const saved = await TJ.saveDataset(name, content);
    res.json({ success: true, name: saved });
  } catch (e) { res.status(400).json({ error: 'SAVE_FAILED', message: e.message }); }
});

router.delete('/datasets/:name', async (req, res) => {
  try {
    await TJ.deleteDataset(req.params.name);
    res.json({ success: true });
  } catch (e) { res.status(400).json({ error: 'DELETE_FAILED', message: e.message }); }
});

router.post('/validate', async (req, res) => {
  try {
    const { name } = req.body || {};
    const result = await TJ.validateDataset(name);
    res.json({ success: result.code === 0, ...result });
  } catch (e) { res.status(400).json({ error: 'VALIDATE_FAILED', message: e.message }); }
});

router.get('/jobs', async (_req, res) => {
  try { res.json({ jobs: await TJ.listJobs() }); }
  catch (e) { res.status(500).json({ error: 'LIST_JOBS_FAILED', message: e.message }); }
});

router.post('/jobs', async (req, res) => {
  try {
    const cfg = req.body || {};
    const config = {
      baseModel: cfg.baseModel,
      trainFile: cfg.trainFile,
      validFile: cfg.validFile || null,
      maxLength: Number(cfg.maxLength) || 512,
      epochs: Number(cfg.epochs) || 1,
      learningRate: Number(cfg.learningRate) || 1e-4,
      batchSize: Number(cfg.batchSize) || 1,
      gradAccum: Number(cfg.gradAccum) || 8,
      loraR: Number(cfg.loraR) || 8,
      use4bit: Boolean(cfg.use4bit),
    };
    if (!config.baseModel || !config.trainFile) {
      return res.status(400).json({ error: 'MISSING_CONFIG', message: 'baseModel and trainFile required' });
    }
    const job = await TJ.startTraining(config);
    res.status(202).json({ job });
  } catch (e) { res.status(400).json({ error: 'START_FAILED', message: e.message }); }
});

router.get('/jobs/:id', async (req, res) => {
  try {
    const job = await TJ.getJob(req.params.id);
    if (!job) return res.status(404).json({ error: 'NOT_FOUND' });
    res.json({ job });
  } catch (e) { res.status(400).json({ error: 'GET_FAILED', message: e.message }); }
});

router.get('/jobs/:id/log', async (req, res) => {
  try {
    const log = await TJ.readLog(req.params.id, Number(req.query.bytes) || 200000);
    res.json({ log });
  } catch (e) { res.status(400).json({ error: 'LOG_FAILED', message: e.message }); }
});

router.post('/jobs/:id/cancel', async (req, res) => {
  try {
    const job = await TJ.cancelJob(req.params.id);
    res.json({ job });
  } catch (e) { res.status(400).json({ error: 'CANCEL_FAILED', message: e.message }); }
});

router.get('/artifacts', async (_req, res) => {
  try { res.json({ artifacts: await TJ.listArtifacts() }); }
  catch (e) { res.status(500).json({ error: 'LIST_ARTIFACTS_FAILED', message: e.message }); }
});

router.delete('/artifacts/:id', async (req, res) => {
  try {
    await TJ.deleteArtifact(req.params.id);
    res.json({ success: true });
  } catch (e) { res.status(400).json({ error: 'DELETE_ARTIFACT_FAILED', message: e.message }); }
});

export default router;
