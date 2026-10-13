const API_BASE = '/api/vision/app';

async function request(path, init = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init.headers || {}) },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const message = body && typeof body.message === 'string' ? body.message : `Request failed: ${response.status}`;
    const error = new Error(message);
    error.code = body?.code;
    throw error;
  }
  return body;
}

export async function connectPreview(url, signal) {
  return request('/sessions', { method: 'POST', body: JSON.stringify({ url }), signal });
}
export async function readSession(sessionId, signal) {
  return request(`/sessions/${encodeURIComponent(sessionId)}`, { signal });
}
export async function reloadPreview(sessionId, signal) {
  return request(`/sessions/${encodeURIComponent(sessionId)}/reload`, { method: 'POST', signal });
}
export async function disconnectPreview(sessionId, signal) {
  return request(`/sessions/${encodeURIComponent(sessionId)}`, { method: 'DELETE', signal });
}
export async function captureScreenshot(sessionId, payload = {}, signal) {
  return request(`/sessions/${encodeURIComponent(sessionId)}/screenshots`, {
    method: 'POST',
    body: JSON.stringify(payload),
    signal,
  });
}
export async function listScreenshots(sessionId, signal) {
  return request(`/sessions/${encodeURIComponent(sessionId)}/screenshots`, { signal });
}
export async function getEvents(sessionId, signal) {
  return request(`/sessions/${encodeURIComponent(sessionId)}/events`, { signal });
}
export async function clearEvents(sessionId, signal) {
  return request(`/sessions/${encodeURIComponent(sessionId)}/events/clear`, { method: 'POST', signal });
}
export async function setBaseline(screenshotId, signal) {
  return request(`/screenshots/${encodeURIComponent(screenshotId)}/set-baseline`, { method: 'POST', signal });
}
export async function pinScreenshot(screenshotId, signal) {
  return request(`/screenshots/${encodeURIComponent(screenshotId)}/pin`, { method: 'POST', signal });
}
export async function deleteScreenshot(screenshotId, signal) {
  return request(`/screenshots/${encodeURIComponent(screenshotId)}`, { method: 'DELETE', signal });
}
export async function compareScreenshots(baselineId, currentId, threshold = 0.1, signal) {
  return request('/diffs', {
    method: 'POST',
    body: JSON.stringify({ baselineId, currentId, threshold }),
    signal,
  });
}
export async function createIssue(payload, signal) {
  return request('/issues', { method: 'POST', body: JSON.stringify(payload), signal });
}
export async function listIssues(signal) {
  return request('/issues', { signal });
}
export async function clearHistory(signal) {
  return request('/history', { method: 'DELETE', signal });
}
export function artifactUrl(kind, id) {
  return `${API_BASE}/artifacts/${kind}/${encodeURIComponent(id)}`;
}