import crypto from 'node:crypto';
import { validatePreviewUrl, isAllowedFinalUrl } from './policy.js';
import { normalizeEvent } from './normalizer.js';

let browserPromise = null;
const sessions = new Map();

async function getBrowser() {
  if (!browserPromise) {
    const { chromium } = await import('playwright');
    browserPromise = chromium.launch({ headless: true });
  }
  return browserPromise;
}

function makeHandle(session) {
  return {
    id: session.id,
    async getInfo() {
      const title = await session.page.title().catch(() => null);
      return {
        sessionId: session.id,
        url: session.page.url(),
        origin: new URL(session.page.url()).origin,
        title,
        reachable: true,
        viewport: { width: session.viewport.width, height: session.viewport.height },
        lastCheckedAt: new Date().toISOString(),
      };
    },
    async reload() { await session.page.reload({ waitUntil: 'domcontentloaded', timeout: 15000 }); },
    async capture(fullPage = false) { return session.page.screenshot({ fullPage, type: 'png' }); },
    async close() { await session.context.close().catch(() => {}); },
  };
}

export async function createSession(rawUrl, viewport = { width: 1440, height: 900 }) {
  const url = validatePreviewUrl(rawUrl);
  const browser = await getBrowser();
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const id = crypto.randomUUID();
  const events = [];

  page.on('console', (msg) => {
    const type = msg.type();
    if (type === 'error' || type === 'warning') {
      events.push(normalizeEvent({
        sessionId: id,
        kind: type === 'error' ? 'console-error' : 'console-warning',
        severity: type === 'error' ? 'error' : 'warning',
        message: msg.text(),
        sourceUrl: msg.location()?.url,
      }));
    }
  });
  page.on('pageerror', (err) => {
    events.push(normalizeEvent({
      sessionId: id,
      kind: 'page-error',
      severity: 'error',
      message: err?.message || String(err),
      sourceUrl: page.url(),
    }));
  });
  page.on('requestfailed', (req) => {
    events.push(normalizeEvent({
      sessionId: id,
      kind: 'request-failed',
      severity: 'warning',
      message: `${req.method()} ${req.url()} failed: ${req.failure()?.errorText || 'unknown'}`,
      sourceUrl: req.url(),
    }));
  });
  page.on('response', (res) => {
    if (res.status() >= 400) {
      events.push(normalizeEvent({
        sessionId: id,
        kind: 'http-error',
        severity: res.status() >= 500 ? 'error' : 'warning',
        message: `${res.request().method()} ${res.url()} returned ${res.status()}`,
        sourceUrl: res.url(),
        statusCode: res.status(),
      }));
    }
  });

  const session = { id, page, context, viewport, events, createdAt: new Date().toISOString() };
  sessions.set(id, session);

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    if (!isAllowedFinalUrl(page.url())) {
      throw new Error('Final preview URL is not allowed.');
    }
  } catch (err) {
    await context.close().catch(() => {});
    sessions.delete(id);
    throw err;
  }

  // bound event buffer
  const originalPush = session.events.push.bind(session.events);
  session.events.push = (...items) => {
    originalPush(...items);
    if (session.events.length > 2000) session.events.splice(0, session.events.length - 2000);
  };

  return makeHandle(session);
}

export function getSession(id) {
  return sessions.get(id);
}

export function getHandle(id) {
  const s = sessions.get(id);
  return s ? makeHandle(s) : null;
}

export function listEvents(id) {
  const s = sessions.get(id);
  return s ? [...s.events] : null;
}

export function clearEvents(id) {
  const s = sessions.get(id);
  if (s) s.events.length = 0;
}

export function pauseEvents(id) {
  const s = sessions.get(id);
  if (s) s.paused = true;
}

export function resumeEvents(id) {
  const s = sessions.get(id);
  if (s) s.paused = false;
}

export async function closeSession(id) {
  const s = sessions.get(id);
  if (!s) return false;
  await s.context.close().catch(() => {});
  sessions.delete(id);
  return true;
}

export async function closeAll() {
  for (const id of [...sessions.keys()]) await closeSession(id);
  if (browserPromise) {
    const browser = await browserPromise.catch(() => null);
    await browser?.close().catch(() => {});
    browserPromise = null;
  }
}

process.on('exit', () => { void closeAll(); });
process.on('SIGINT', () => { void closeAll(); process.exit(0); });
process.on('SIGTERM', () => { void closeAll(); process.exit(0); });