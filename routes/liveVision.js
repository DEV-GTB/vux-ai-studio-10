import { Router } from 'express';
import { z } from 'zod';
import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';

import { validatePreviewUrl } from '../lib/live-vision/policy.js';
import {
  createSession as createBrowserSession,
  getHandle,
  getSession,
  listEvents as listSessionEvents,
  clearEvents as clearSessionEvents,
  pauseEvents,
  resumeEvents,
  closeSession,
  closeAll,
} from '../lib/live-vision/sessionManager.js';
import { persistScreenshot, deleteScreenshotFile } from '../lib/live-vision/screenshotService.js';
import { compareScreenshots } from '../lib/live-vision/diffService.js';
import { validateIssue, createIssue, toMarkdown } from '../lib/live-vision/issueReport.js';
import { listScreenshots, getScreenshot, setBaseline, deleteScreenshot, pinScreenshot, listEvents as listStoredEvents, insertEvent } from '../lib/live-vision/repo.js';
import { normalizeEvent } from '../lib/live-vision/normalizer.js';
import { STORAGE } from '../lib/live-vision/repo.js';

const router = Router();

const createSessionSchema = z.object({ url: z.string().trim().min(1).max(2048) }).strict();
const screenshotSchema = z.object({
  mode: z.enum(['viewport', 'full-page']).default('viewport'),
  label: z.string().trim().max(120).optional(),
}).strict();
const diffSchema = z.object({
  baselineId: z.string().min(1).max(128),
  currentId: z.string().min(1).max(128),
  threshold: z.number().min(0).max(1).default(0.1),
}).strict();

function sendError(res, code, message, status = 400) {
  return res.status(status).json({ code, message });
}

function wrap(fn) {
  return async (req, res) => {
    try {
      await fn(req, res);
    } catch (err) {
      const message = err?.message || 'Live Vision request failed';
      if (err instanceof z.ZodError) {
        return sendError(res, 'VISION_PREVIEW_INVALID', 'Request validation failed.');
      }
      console.error('[live-vision]', err?.message || err);
      if (/net::ERR_CONNECTION_REFUSED|Navigation timeout|Timeout exceeded/i.test(message)) {
        return sendError(res, 'VISION_PREVIEW_UNREACHABLE', 'Preview URL is not reachable.', 502);
      }
      if (/not allowed|invalid|Unsafe/i.test(message)) return sendError(res, 'VISION_PREVIEW_BLOCKED', message);
      if (/not found/i.test(message)) return sendError(res, 'VISION_ARTIFACT_MISSING', message, 404);
      if (/Cannot find module.*playwright/i.test(message)) return sendError(res, 'VISION_BROWSER_MISSING', 'Playwright browser runtime is not installed.', 503);
      return sendError(res, 'VISION_CAPTURE_FAILED', message, 500);
    }
  };
}

router.post('/sessions', wrap(async (req, res) => {
  const parsed = createSessionSchema.parse(req.body || {});
  const url = validatePreviewUrl(parsed.url);
  const handle = await createBrowserSession(url);
  const info = await handle.getInfo();
  // persist session
  const { upsertSession, now } = await import('../lib/live-vision/repo.js');
  upsertSession({
    id: info.sessionId,
    url: info.url,
    origin: info.origin,
    title: info.title,
    createdAt: now(),
    lastSeenAt: now(),
    state: 'ready',
  });
  return res.status(201).json({ session: info });
}));

router.get('/sessions/:id', wrap(async (req, res) => {
  const handle = getHandle(req.params.id);
  if (!handle) return sendError(res, 'VISION_SESSION_EXPIRED', 'Session not found.', 404);
  const info = await handle.getInfo();
  return res.json({ session: info });
}));

router.post('/sessions/:id/reload', wrap(async (req, res) => {
  const handle = getHandle(req.params.id);
  if (!handle) return sendError(res, 'VISION_SESSION_EXPIRED', 'Session not found.', 404);
  await handle.reload();
  const info = await handle.getInfo();
  return res.json({ session: info });
}));

router.delete('/sessions/:id', wrap(async (req, res) => {
  await closeSession(req.params.id);
  const { setSessionState } = await import('../lib/live-vision/repo.js');
  setSessionState(req.params.id, 'closed');
  return res.json({ ok: true });
}));

router.post('/sessions/:id/screenshots', wrap(async (req, res) => {
  const handle = getHandle(req.params.id);
  if (!handle) return sendError(res, 'VISION_SESSION_EXPIRED', 'Connect a preview first.', 404);
  const body = screenshotSchema.parse(req.body || {});
  const fullPage = body.mode === 'full-page';
  const buffer = await handle.capture(fullPage);
  const record = await persistScreenshot({
    sessionId: req.params.id,
    buffer,
    label: body.label,
    fullPage,
  });
  return res.status(201).json({ screenshot: record });
}));

router.get('/sessions/:id/screenshots', wrap(async (req, res) => {
  const records = listScreenshots(req.params.id);
  return res.json({ screenshots: records });
}));

router.get('/sessions/:id/events', wrap(async (req, res) => {
  const handle = getHandle(req.params.id);
  if (!handle) return sendError(res, 'VISION_SESSION_EXPIRED', 'Session not found.', 404);
  const collected = listSessionEvents(req.params.id) || [];
  // persist new events by fingerprint dedup
  const stored = listStoredEvents(req.params.id);
  const known = new Set(stored.map((e) => e.fingerprint));
  for (const event of collected) {
    if (!known.has(event.fingerprint)) {
      insertEvent(event);
      known.add(event.fingerprint);
    }
  }
  const events = listStoredEvents(req.params.id);
  return res.json({ events });
}));

router.post('/sessions/:id/events/pause', wrap(async (req, res) => {
  pauseEvents(req.params.id);
  return res.json({ ok: true });
}));

router.post('/sessions/:id/events/resume', wrap(async (req, res) => {
  resumeEvents(req.params.id);
  return res.json({ ok: true });
}));

router.post('/sessions/:id/events/clear', wrap(async (req, res) => {
  clearSessionEvents(req.params.id);
  const { clearEvents } = await import('../lib/live-vision/repo.js');
  clearEvents(req.params.id);
  return res.json({ ok: true });
}));

router.post('/screenshots/:id/set-baseline', wrap(async (req, res) => {
  const ok = setBaseline(req.params.id);
  if (!ok) return sendError(res, 'VISION_ARTIFACT_MISSING', 'Screenshot not found.', 404);
  return res.json({ ok: true });
}));

router.post('/screenshots/:id/pin', wrap(async (req, res) => {
  const ok = pinScreenshot(req.params.id);
  if (!ok) return sendError(res, 'VISION_ARTIFACT_MISSING', 'Screenshot not found.', 404);
  return res.json({ ok: true });
}));

router.delete('/screenshots/:id', wrap(async (req, res) => {
  const shot = deleteScreenshot(req.params.id);
  if (!shot) return sendError(res, 'VISION_ARTIFACT_MISSING', 'Screenshot not found or pinned.', 404);
  await deleteScreenshotFile(shot.relative_path);
  return res.json({ ok: true });
}));

router.post('/diffs', wrap(async (req, res) => {
  const body = diffSchema.parse(req.body || {});
  const result = await compareScreenshots(body.baselineId, body.currentId, body.threshold);
  return res.status(201).json({ result });
}));

router.get('/diffs/:id', wrap(async (req, res) => {
  const { getDiff } = await import('../lib/live-vision/repo.js');
  const result = getDiff(req.params.id);
  if (!result) return sendError(res, 'VISION_ARTIFACT_MISSING', 'Diff not found.', 404);
  return res.json({ result });
}));

router.post('/issues', wrap(async (req, res) => {
  const report = createIssue(req.body || {});
  return res.status(201).json({ issue: report });
}));

router.get('/issues', wrap(async (req, res) => {
  return res.json({ issues: (await import('../lib/live-vision/repo.js')).listIssues() });
}));

router.get('/issues/:id', wrap(async (req, res) => {
  const issue = (await import('../lib/live-vision/repo.js')).getIssue(req.params.id);
  if (!issue) return sendError(res, 'VISION_ARTIFACT_MISSING', 'Issue not found.', 404);
  return res.json({ issue });
}));

router.get('/issues/:id/markdown', wrap(async (req, res) => {
  const issue = (await import('../lib/live-vision/repo.js')).getIssue(req.params.id);
  if (!issue) return sendError(res, 'VISION_ARTIFACT_MISSING', 'Issue not found.', 404);
  res.type('text/markdown').send(toMarkdown(issue));
}));

router.delete('/history', wrap(async (req, res) => {
  // clear screenshots/events/issues? simple clear screenshots table + files not
  const { clearHistory } = await import('../lib/live-vision/repo.js');
  clearHistory();
  return res.json({ ok: true });
}));

router.get('/artifacts/screenshots/:id', wrap(async (req, res) => {
  const shot = getScreenshot(req.params.id);
  if (!shot) return sendError(res, 'VISION_ARTIFACT_MISSING', 'Screenshot not found.', 404);
  if (shot.relative_path.includes('..')) return sendError(res, 'VISION_ARTIFACT_MISSING', 'Invalid artifact.', 400);
  const filePath = path.join(STORAGE.ROOT, shot.relative_path);
  if (!fs.existsSync(filePath)) return sendError(res, 'VISION_ARTIFACT_MISSING', 'File missing.', 404);
  res.sendFile(filePath);
}));

router.get('/artifacts/diffs/:id', wrap(async (req, res) => {
  // id is diff record id
  const { getDiff } = await import('../lib/live-vision/repo.js');
  const diff = getDiff(req.params.id);
  if (!diff || !diff.diffArtifactId) return sendError(res, 'VISION_ARTIFACT_MISSING', 'Diff not found.', 404);
  if (diff.diffArtifactId.includes('..')) return sendError(res, 'VISION_ARTIFACT_MISSING', 'Invalid artifact.', 400);
  const filePath = path.join(STORAGE.ROOT, diff.diffArtifactId);
  if (!fs.existsSync(filePath)) return sendError(res, 'VISION_ARTIFACT_MISSING', 'File missing.', 404);
  res.sendFile(filePath);
}));

// Clean up on process exit is handled by sessionManager.

export default router;