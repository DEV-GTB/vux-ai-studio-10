import { Router } from 'express';
import path from 'path';
import * as TJ from '../lib/trainingJobs.js';
import { buildAgentPrompts } from '../lib/studioAgent.js';

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

// GET /datasets/:name/preview
// Shows the first examples in a dataset so the user can check what would be
// trained on before starting a job.
router.get('/datasets/:name/preview', async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    res.json(await TJ.readDataset(req.params.name, limit));
  } catch (e) {
    res.status(400).json({ error: 'PREVIEW_FAILED', message: e.message });
  }
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

// POST /collect
//   { request, action, activeFile, files, folders, history, dataset }
//
// Captures an edit the user actually approved in the Studio as a training
// example. The system and user messages are rebuilt with the same prompt
// builder the agent uses at inference time, so the dataset matches what the
// model will see when it is served.
router.post('/collect', async (req, res) => {
  try {
    const body = req.body || {};
    const request = typeof body.request === 'string' ? body.request.trim() : '';
    const action = body.action;

    if (!request) return res.status(400).json({ error: 'MISSING_REQUEST', message: 'request is required' });
    if (!action || typeof action !== 'object' || typeof action.action !== 'string') {
      return res.status(400).json({ error: 'MISSING_ACTION', message: 'action is required' });
    }
    // Only successful, user-approved work is worth learning from.
    if (!['edit', 'create', 'answer'].includes(action.action)) {
      return res.status(400).json({ error: 'UNSUPPORTED_ACTION', message: `Cannot collect action "${action.action}"` });
    }

    const files = {};
    if (body.files && typeof body.files === 'object' && !Array.isArray(body.files)) {
      for (const [name, content] of Object.entries(body.files).slice(0, 200)) {
        if (typeof name === 'string' && typeof content === 'string') files[name] = content;
      }
    }

    const history = Array.isArray(body.history)
      ? body.history
        .filter((turn) => turn && (turn.role === 'user' || turn.role === 'assistant') && typeof turn.content === 'string')
        .slice(-12)
      : [];

    const prompts = buildAgentPrompts({
      request,
      activeFile: typeof body.activeFile === 'string' ? body.activeFile : '',
      files,
      folders: Array.isArray(body.folders) ? body.folders.filter((name) => typeof name === 'string') : [],
      history,
    });

    const example = {
      messages: [
        { role: 'system', content: prompts.systemPrompt },
        { role: 'user', content: prompts.userMessage },
        { role: 'assistant', content: JSON.stringify(action) },
      ],
      metadata: {
        source: 'studio-approved-edit',
        intent: prompts.analysis.intent,
        languages: prompts.analysis.languageIds,
        collectedAt: new Date().toISOString(),
      },
    };

    const dataset = typeof body.dataset === 'string' && body.dataset.trim()
      ? body.dataset.trim()
      : 'approved_edits.jsonl';

    const result = await TJ.appendExamples(dataset, [example]);
    res.json({ success: true, ...result, example });
  } catch (e) {
    res.status(400).json({ error: 'COLLECT_FAILED', message: e.message });
  }
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
