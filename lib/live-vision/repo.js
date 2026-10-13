import Database from 'better-sqlite3';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.cwd(), 'data', 'vision');
const DB_PATH = path.join(ROOT, 'vision.db');
const SHOT_DIR = path.join(ROOT, 'screenshots');
const DIFF_DIR = path.join(ROOT, 'diffs');

for (const dir of [ROOT, SHOT_DIR, DIFF_DIR]) {
  fs.mkdirSync(dir, { recursive: true });
}

const db = new Database(DB_PATH);
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS vision_sessions (
  id TEXT PRIMARY KEY,
  url TEXT NOT NULL,
  origin TEXT NOT NULL,
  title TEXT,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  state TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS vision_screenshots (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  relative_path TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  label TEXT,
  is_baseline INTEGER NOT NULL DEFAULT 0,
  pinned INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY(session_id) REFERENCES vision_sessions(id)
);
CREATE TABLE IF NOT EXISTS vision_events (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  severity TEXT NOT NULL,
  message TEXT NOT NULL,
  source_url TEXT,
  status_code INTEGER,
  fingerprint TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  redacted INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY(session_id) REFERENCES vision_sessions(id)
);
CREATE INDEX IF NOT EXISTS idx_vision_events_session_time ON vision_events(session_id, timestamp);
CREATE TABLE IF NOT EXISTS vision_diffs (
  id TEXT PRIMARY KEY,
  baseline_id TEXT NOT NULL,
  current_id TEXT NOT NULL,
  diff_artifact_id TEXT NOT NULL,
  changed_pixels INTEGER NOT NULL,
  total_pixels INTEGER NOT NULL,
  changed_ratio REAL NOT NULL,
  threshold REAL NOT NULL,
  dimensions_match INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS vision_issues (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  severity TEXT NOT NULL,
  report_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
`);

const stmts = {
  upsertSession: db.prepare(`INSERT INTO vision_sessions (id,url,origin,title,created_at,last_seen_at,state)
    VALUES (@id,@url,@origin,@title,@created_at,@last_seen_at,@state)
    ON CONFLICT(id) DO UPDATE SET url=@url,origin=@origin,title=@title,last_seen_at=@last_seen_at,state=@state`),
  getSession: db.prepare('SELECT * FROM vision_sessions WHERE id=?'),
  setSessionState: db.prepare('UPDATE vision_sessions SET state=?, last_seen_at=? WHERE id=?'),
  insertShot: db.prepare(`INSERT INTO vision_screenshots (id,session_id,created_at,width,height,relative_path,sha256,label,is_baseline,pinned)
    VALUES (@id,@session_id,@created_at,@width,@height,@relative_path,@sha256,@label,@is_baseline,@pinned)`),
  listShots: db.prepare('SELECT * FROM vision_screenshots ORDER BY created_at DESC'),
  listShotsBySession: db.prepare('SELECT * FROM vision_screenshots WHERE session_id=? ORDER BY created_at DESC'),
  getShot: db.prepare('SELECT * FROM vision_screenshots WHERE id=?'),
  setBaseline: db.prepare('UPDATE vision_screenshots SET is_baseline=1 WHERE id=?'),
  unsetBaseline: db.prepare('UPDATE vision_screenshots SET is_baseline=0 WHERE session_id=?'),
  pinShot: db.prepare('UPDATE vision_screenshots SET pinned=1 WHERE id=?'),
  deleteShot: db.prepare('DELETE FROM vision_screenshots WHERE id=?'),
  insertEvent: db.prepare(`INSERT INTO vision_events (id,session_id,kind,severity,message,source_url,status_code,fingerprint,timestamp,redacted)
    VALUES (@id,@session_id,@kind,@severity,@message,@source_url,@status_code,@fingerprint,@timestamp,@redacted)`),
  listEvents: db.prepare('SELECT * FROM vision_events WHERE session_id=? ORDER BY timestamp ASC'),
  clearEvents: db.prepare('DELETE FROM vision_events WHERE session_id=?'),
  insertDiff: db.prepare(`INSERT INTO vision_diffs (id,baseline_id,current_id,diff_artifact_id,changed_pixels,total_pixels,changed_ratio,threshold,dimensions_match,created_at)
    VALUES (@id,@baseline_id,@current_id,@diff_artifact_id,@changed_pixels,@total_pixels,@changed_ratio,@threshold,@dimensions_match,@created_at)`),
  getDiff: db.prepare('SELECT * FROM vision_diffs WHERE id=?'),
  insertIssue: db.prepare('INSERT INTO vision_issues (id,title,summary,severity,report_json,created_at) VALUES (@id,@title,@summary,@severity,@report_json,@created_at)'),
  listIssues: db.prepare('SELECT * FROM vision_issues ORDER BY created_at DESC'),
  getIssue: db.prepare('SELECT * FROM vision_issues WHERE id=?'),
  clearHistory: db.prepare('DELETE FROM vision_screenshots'),
};

export const STORAGE = { ROOT, DB_PATH, SHOT_DIR, DIFF_DIR };

export function now() { return new Date().toISOString(); }

export function upsertSession(row) {
  stmts.upsertSession.run({
    id: row.id,
    url: row.url,
    origin: row.origin,
    title: row.title ?? null,
    created_at: row.createdAt,
    last_seen_at: row.lastSeenAt,
    state: row.state,
  });
}

export function getSession(id) { return stmts.getSession.get(id); }

export function setSessionState(id, state) {
  stmts.setSessionState.run(state, new Date().toISOString(), id);
}

export function insertScreenshot(row) {
  stmts.insertShot.run({
    id: row.id,
    session_id: row.sessionId,
    created_at: row.createdAt,
    width: row.width,
    height: row.height,
    relative_path: row.relativePath,
    sha256: row.sha256,
    label: row.label ?? null,
    is_baseline: row.baseline ? 1 : 0,
    pinned: 0,
  });
}

export function getScreenshot(id) { return stmts.getShot.get(id); }
export function listScreenshots(sessionId) {
  return (sessionId ? stmts.listShotsBySession.all(sessionId) : stmts.listShots.all()).map(mapShot);
}
export function setBaseline(id) {
  const shot = getScreenshot(id);
  if (!shot) return false;
  stmts.unsetBaseline.run(shot.session_id);
  stmts.setBaseline.run(id);
  return true;
}
export function pinScreenshot(id) {
  const shot = getScreenshot(id);
  if (!shot) return false;
  const stmt = db.prepare('UPDATE vision_screenshots SET pinned=1 WHERE id=?');
  stmt.run(id);
  return true;
}

export function deleteScreenshot(id) {
  const shot = getScreenshot(id);
  if (!shot) return false;
  if (shot.pinned) return false;
  stmts.deleteShot.run(id);
  return shot;
}
export function insertEvent(row) {
  stmts.insertEvent.run({
    id: row.id,
    session_id: row.sessionId,
    kind: row.kind,
    severity: row.severity,
    message: row.message,
    source_url: row.sourceUrl ?? null,
    status_code: row.statusCode ?? null,
    fingerprint: row.fingerprint,
    timestamp: row.timestamp,
    redacted: row.redacted ? 1 : 0,
  });
}
export function listEvents(sessionId) {
  return stmts.listEvents.all(sessionId).map(mapEvent);
}
export function clearEvents(sessionId) { stmts.clearEvents.run(sessionId); }
export function insertDiff(row) {
  stmts.insertDiff.run({
    id: row.id,
    baseline_id: row.baselineId,
    current_id: row.currentId,
    diff_artifact_id: row.diffArtifactId,
    changed_pixels: row.changedPixels,
    total_pixels: row.totalPixels,
    changed_ratio: row.changedRatio,
    threshold: row.threshold,
    dimensions_match: row.dimensionsMatch ? 1 : 0,
    created_at: row.createdAt,
  });
}
export function getDiff(id) {
  const r = stmts.getDiff.get(id);
  if (!r) return null;
  return {
    id: r.id,
    baselineId: r.baseline_id,
    currentId: r.current_id,
    diffArtifactId: r.diff_artifact_id,
    changedPixels: r.changed_pixels,
    totalPixels: r.total_pixels,
    changedRatio: r.changed_ratio,
    threshold: r.threshold,
    dimensionsMatch: !!r.dimensions_match,
    createdAt: r.created_at,
  };
}
export function insertIssue(row) {
  stmts.insertIssue.run({
    id: row.id,
    title: row.title,
    summary: row.summary,
    severity: row.severity,
    report_json: JSON.stringify(row),
    created_at: row.createdAt,
  });
}
export function listIssues() {
  return stmts.listIssues.all().map((r) => ({ ...JSON.parse(r.report_json) }));
}
export function getIssue(id) {
  const r = stmts.getIssue.get(id);
  return r ? JSON.parse(r.report_json) : null;
}
export function clearHistory() {
  stmts.clearHistory.run();
}

function mapShot(r) {
  return {
    id: r.id,
    sessionId: r.session_id,
    createdAt: r.created_at,
    width: r.width,
    height: r.height,
    relativePath: r.relative_path,
    sha256: r.sha256,
    label: r.label ?? undefined,
    baseline: !!r.is_baseline,
    pinned: !!r.pinned,
  };
}
function mapEvent(r) {
  return {
    id: r.id,
    sessionId: r.session_id,
    kind: r.kind,
    severity: r.severity,
    message: r.message,
    sourceUrl: r.source_url ?? undefined,
    statusCode: r.status_code ?? undefined,
    fingerprint: r.fingerprint,
    timestamp: r.timestamp,
    redacted: !!r.redacted,
  };
}

export function shotPath(relativePath) {
  return path.join(ROOT, relativePath);
}

export function safeArtifactId() { return crypto.randomUUID(); }