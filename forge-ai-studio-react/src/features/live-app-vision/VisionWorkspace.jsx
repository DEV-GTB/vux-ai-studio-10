import { useState } from 'react';
import { useVisionSession } from './hooks/useVisionSession';
import {
  artifactUrl,
  clearEvents as apiClearEvents,
  compareScreenshots as apiCompare,
  createIssue as apiCreateIssue,
  deleteScreenshot as apiDeleteScreenshot,
  listIssues as apiListIssues,
  setBaseline as apiSetBaseline,
} from './api/visionClient';

const TABS = [
  ['preview', 'Preview'],
  ['screenshots', 'Screenshots'],
  ['compare', 'Compare'],
  ['diagnostics', 'Diagnostics'],
  ['issues', 'Issues'],
];

export function VisionWorkspace() {
  const [url, setUrl] = useState('http://localhost:5173');
  const [label, setLabel] = useState('');
  const [mode, setMode] = useState('viewport');
  const [tab, setTab] = useState('preview');
  const [baselineId, setBaselineId] = useState('');
  const [currentId, setCurrentId] = useState('');
  const [threshold, setThreshold] = useState(0.1);
  const [issueForm, setIssueForm] = useState({
    title: '', summary: '', severity: 'warning', expected: '', actual: '',
    reproductionSteps: '', suspectedCauses: '', verificationPlan: '',
  });
  const [issues, setIssues] = useState([]);

  const {
    session, busy, error, screenshots, events, diffResult,
    setScreenshots, setEvents, setDiffResult, setError,
    connect, disconnect, capture, refreshEvents,
  } = useVisionSession();

  async function handleConnect(e) {
    e?.preventDefault?.();
    try { await connect(url); } catch { /* error state already set */ }
  }

  async function handleCapture() {
    try {
      await capture(label.trim() || undefined, mode);
      setLabel('');
      setTab('screenshots');
    } catch { /* surfaced */ }
  }

  async function handleCompare() {
    if (!baselineId || !currentId) { setError('Choose baseline and current screenshots.'); return; }
    try {
      const result = await apiCompare(baselineId, currentId, Number(threshold));
      setDiffResult(result.result);
      setTab('compare');
    } catch (cause) { setError(cause?.message || 'Compare failed'); }
  }

  async function handleSetBaseline(id) {
    try {
      await apiSetBaseline(id);
      setScreenshots((current) => current.map((s) => ({ ...s, baseline: s.id === id })));
    } catch (cause) { setError(cause?.message || 'Baseline update failed'); }
  }

  async function handleDeleteShot(id) {
    try {
      await apiDeleteScreenshot(id);
      setScreenshots((current) => current.filter((s) => s.id !== id));
    } catch (cause) { setError(cause?.message || 'Delete failed'); }
  }

  async function handleClearEvents() {
    if (!session) return;
    try { await apiClearEvents(session.sessionId); setEvents([]); } catch (cause) { setError(cause?.message || 'Clear failed'); }
  }

  async function handleCreateIssue(e) {
    e?.preventDefault?.();
    try {
      const payload = {
        title: issueForm.title,
        summary: issueForm.summary,
        severity: issueForm.severity,
        reproductionSteps: issueForm.reproductionSteps.split('\n').map((s) => s.trim()).filter(Boolean),
        expected: issueForm.expected,
        actual: issueForm.actual,
        screenshotIds: screenshots.slice(0, 5).map((s) => s.id),
        eventIds: events.slice(0, 20).map((e) => e.id),
        suspectedCauses: issueForm.suspectedCauses.split('\n').map((s) => s.trim()).filter(Boolean),
        verificationPlan: issueForm.verificationPlan.split('\n').map((s) => s.trim()).filter(Boolean),
      };
      const result = await apiCreateIssue(payload);
      setIssues((current) => [result.issue, ...current]);
      setTab('issues');
    } catch (cause) { setError(cause?.message || 'Issue creation failed'); }
  }

  async function handleLoadIssues() {
    try {
      const result = await apiListIssues();
      setIssues(result.issues || []);
    } catch (cause) { setError(cause?.message || 'Load issues failed'); }
  }

  return (
    <section className="flex h-full min-h-0 flex-col bg-forge-bg text-forge-text">
      <header className="flex flex-wrap items-center gap-3 border-b border-forge-border bg-forge-surface px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-xl">📸</span>
          <div>
            <h1 className="text-sm font-semibold">Live App Vision</h1>
            <p className="text-xs text-forge-textMuted">Real screenshots, diagnostics, and visual diffs</p>
          </div>
        </div>

        <form className="flex flex-1 min-w-[260px] items-center gap-2" onSubmit={handleConnect}>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="http://localhost:5173"
            spellCheck={false}
            className="min-h-[36px] flex-1 rounded-lg border border-forge-border bg-forge-bg px-3 text-sm outline-none focus:border-forge-primary"
          />
          {!session ? (
            <button type="submit" disabled={busy || !url.trim()} className="min-h-[36px] rounded-lg border border-forge-border bg-forge-surfaceHigh px-4 text-sm disabled:opacity-50">
              {busy ? 'Connecting…' : 'Connect'}
            </button>
          ) : (
            <button type="button" disabled={busy} onClick={() => disconnect()} className="min-h-[36px] rounded-lg border border-forge-border bg-forge-surfaceHigh px-4 text-sm disabled:opacity-50">
              Disconnect
            </button>
          )}
        </form>

        <div className="flex items-center gap-2">
          <span className={`text-xs ${session ? 'text-forge-success' : 'text-forge-textMuted'}`}>
            {session ? `● ${session.origin}` : '○ Disconnected'}
          </span>
        </div>
      </header>

      {error && (
        <div role="alert" className="mx-4 mt-3 rounded-lg border border-forge-error/40 bg-forge-error/10 px-4 py-2 text-sm text-forge-error">
          <strong>Operation failed:</strong> {error}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 border-b border-forge-border px-4 py-2">
        {TABS.map(([id, title]) => (
          <button
            key={id}
            type="button"
            onClick={() => { setTab(id); if (id === 'issues') void handleLoadIssues(); }}
            className={`rounded-lg px-3 py-1.5 text-sm ${tab === id ? 'bg-forge-primary text-black' : 'text-forge-textMuted hover:bg-forge-surfaceLow'}`}
            aria-pressed={tab === id}
          >
            {title}
          </button>
        ))}
      </div>

      <main className="flex-1 min-h-0 overflow-auto p-4">
        {tab === 'preview' && (
          <div className="grid gap-4">
            {!session ? (
              <div className="rounded-xl border border-forge-border bg-forge-surface p-8 text-center">
                <div className="text-4xl mb-2">🖥️</div>
                <h2 className="text-base font-semibold">Connect a local preview</h2>
                <p className="mt-1 text-sm text-forge-textMuted">Start your dev server and connect an allowed localhost URL.</p>
              </div>
            ) : (
              <>
                <div className="rounded-xl border border-forge-border bg-forge-surface p-4">
                  <p className="text-sm"><strong>Title:</strong> {session.title || '(no title)'}</p>
                  <p className="text-sm"><strong>URL:</strong> {session.url}</p>
                  <p className="text-sm"><strong>Viewport:</strong> {session.viewport.width} × {session.viewport.height}</p>
                  <p className="text-xs text-forge-textMuted mt-1">Last checked {session.lastCheckedAt}</p>
                </div>
                <div className="rounded-xl border border-forge-border bg-white p-2">
                  <iframe src={session.url} title="Live preview" className="h-[520px] w-full border-0" sandbox="allow-scripts allow-same-origin allow-forms" />
                </div>
              </>
            )}
          </div>
        )}

        {tab === 'screenshots' && (
          <div className="grid gap-4">
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-forge-border bg-forge-surface p-3">
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Capture label (optional)"
                maxLength={120}
                className="min-h-[36px] flex-1 min-w-[180px] rounded-lg border border-forge-border bg-forge-bg px-3 text-sm outline-none"
              />
              <select value={mode} onChange={(e) => setMode(e.target.value)} className="min-h-[36px] rounded-lg border border-forge-border bg-forge-bg px-2 text-sm">
                <option value="viewport">Viewport</option>
                <option value="full-page">Full page</option>
              </select>
              <button
                type="button"
                disabled={!session || busy}
                onClick={handleCapture}
                className="min-h-[36px] rounded-lg border border-forge-border bg-forge-surfaceHigh px-4 text-sm disabled:opacity-50"
              >
                {busy ? 'Capturing…' : 'Capture'}
              </button>
            </div>

            {screenshots.length === 0 ? (
              <p className="text-sm text-forge-textMuted">No screenshots captured yet.</p>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {screenshots.map((shot) => (
                  <article key={shot.id} className="rounded-xl border border-forge-border bg-forge-surface p-3">
                    <img
                      src={artifactUrl('screenshots', shot.id)}
                      alt={shot.label || 'Screenshot'}
                      className="mb-2 aspect-video w-full rounded-lg object-cover"
                    />
                    <div className="flex items-center justify-between gap-2">
                      <strong className="text-sm">{shot.label || 'Untitled capture'}</strong>
                      {shot.baseline && <span className="text-xs text-forge-primary">Baseline</span>}
                    </div>
                    <p className="text-xs text-forge-textMuted">{shot.width} × {shot.height}</p>
                    <p className="text-xs text-forge-textMuted">{new Date(shot.createdAt).toLocaleString()}</p>
                    <p className="truncate text-[10px] text-forge-textMuted" title={shot.sha256}>sha256: {shot.sha256.slice(0, 12)}…</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button type="button" onClick={() => handleSetBaseline(shot.id)} className="text-xs text-forge-primary hover:underline">Set baseline</button>
                      <button type="button" onClick={() => handleDeleteShot(shot.id)} className="text-xs text-forge-error hover:underline">Delete</button>
                      <label className="text-xs text-forge-textMuted">
                        <input type="radio" name="baselinePick" checked={baselineId === shot.id} onChange={() => setBaselineId(shot.id)} /> Baseline
                      </label>
                      <label className="text-xs text-forge-textMuted">
                        <input type="radio" name="currentPick" checked={currentId === shot.id} onChange={() => setCurrentId(shot.id)} /> Current
                      </label>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'compare' && (
          <div className="grid gap-4">
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-forge-border bg-forge-surface p-3">
              <span className="text-sm">Baseline:</span>
              <select value={baselineId} onChange={(e) => setBaselineId(e.target.value)} className="min-h-[36px] rounded-lg border border-forge-border bg-forge-bg px-2 text-sm">
                <option value="">Select…</option>
                {screenshots.map((s) => <option key={s.id} value={s.id}>{s.label || s.id.slice(0, 8)}</option>)}
              </select>
              <span className="text-sm">Current:</span>
              <select value={currentId} onChange={(e) => setCurrentId(e.target.value)} className="min-h-[36px] rounded-lg border border-forge-border bg-forge-bg px-2 text-sm">
                <option value="">Select…</option>
                {screenshots.map((s) => <option key={s.id} value={s.id}>{s.label || s.id.slice(0, 8)}</option>)}
              </select>
              <label className="flex items-center gap-2 text-sm">
                Threshold
                <input type="number" min="0" max="1" step="0.01" value={threshold} onChange={(e) => setThreshold(e.target.value)} className="w-20 rounded-lg border border-forge-border bg-forge-bg px-2 py-1 text-sm" />
              </label>
              <button type="button" onClick={handleCompare} disabled={!baselineId || !currentId} className="min-h-[36px] rounded-lg border border-forge-border bg-forge-surfaceHigh px-4 text-sm disabled:opacity-50">
                Compare
              </button>
            </div>

            {diffResult && (
              <div className="rounded-xl border border-forge-border bg-forge-surface p-4">
                <h2 className="text-sm font-semibold">Visual comparison</h2>
                <p className="text-sm">Changed pixels: {diffResult.changedPixels.toLocaleString()}</p>
                <p className="text-sm">Total pixels: {diffResult.totalPixels.toLocaleString()}</p>
                <p className="text-sm">Changed ratio: {(diffResult.changedRatio * 100).toFixed(2)}%</p>
                <p className="text-sm">Dimensions match: {diffResult.dimensionsMatch ? 'yes' : 'no'}</p>
                {diffResult.diffArtifactId && (
                  <img src={artifactUrl('diffs', diffResult.id)} alt="Diff" className="mt-3 max-h-[420px] w-full rounded-lg object-contain" />
                )}
              </div>
            )}
            {!diffResult && <p className="text-sm text-forge-textMuted">Select baseline and current captures, then compare.</p>}
          </div>
        )}

        {tab === 'diagnostics' && (
          <div className="grid gap-3">
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => refreshEvents()} disabled={!session} className="min-h-[36px] rounded-lg border border-forge-border bg-forge-surfaceHigh px-4 text-sm disabled:opacity-50">
                Refresh
              </button>
              <button type="button" onClick={handleClearEvents} disabled={!session} className="min-h-[36px] rounded-lg border border-forge-border bg-forge-surfaceHigh px-4 text-sm disabled:opacity-50">
                Clear
              </button>
            </div>
            {events.length === 0 ? (
              <p className="text-sm text-forge-textMuted">
                {session ? 'No diagnostics collected yet. This is not the same as collection being unavailable.' : 'Connect a preview to collect diagnostics.'}
              </p>
            ) : (
              <ul className="space-y-2">
                {events.map((ev) => (
                  <li key={ev.id} className="rounded-xl border border-forge-border bg-forge-surface p-3 text-sm">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-semibold ${ev.severity === 'error' ? 'text-forge-error' : ev.severity === 'warning' ? 'text-forge-warning' : 'text-forge-textMuted'}`}>
                        {ev.severity.toUpperCase()}
                      </span>
                      <span className="text-xs text-forge-textMuted">{ev.kind}</span>
                      <span className="ml-auto text-xs text-forge-textMuted">{new Date(ev.timestamp).toLocaleTimeString()}</span>
                    </div>
                    <p className="mt-1 break-words">{ev.message}</p>
                    {ev.sourceUrl && <p className="mt-1 truncate text-xs text-forge-textMuted">{ev.sourceUrl}</p>}
                    {ev.statusCode && <p className="text-xs text-forge-textMuted">Status: {ev.statusCode}</p>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {tab === 'issues' && (
          <div className="grid gap-4 lg:grid-cols-2">
            <form onSubmit={handleCreateIssue} className="rounded-xl border border-forge-border bg-forge-surface p-4 space-y-2">
              <h2 className="text-sm font-semibold">Create issue report</h2>
              <input value={issueForm.title} onChange={(e) => setIssueForm({ ...issueForm, title: e.target.value })} placeholder="Title" maxLength={200} required className="w-full rounded-lg border border-forge-border bg-forge-bg px-3 py-2 text-sm" />
              <select value={issueForm.severity} onChange={(e) => setIssueForm({ ...issueForm, severity: e.target.value })} className="w-full rounded-lg border border-forge-border bg-forge-bg px-3 py-2 text-sm">
                <option value="info">Info</option>
                <option value="warning">Warning</option>
                <option value="error">Error</option>
              </select>
              <textarea value={issueForm.summary} onChange={(e) => setIssueForm({ ...issueForm, summary: e.target.value })} placeholder="Summary" className="w-full rounded-lg border border-forge-border bg-forge-bg px-3 py-2 text-sm" rows={2} />
              <textarea value={issueForm.reproductionSteps} onChange={(e) => setIssueForm({ ...issueForm, reproductionSteps: e.target.value })} placeholder="Reproduction steps (one per line)" className="w-full rounded-lg border border-forge-border bg-forge-bg px-3 py-2 text-sm" rows={3} />
              <textarea value={issueForm.expected} onChange={(e) => setIssueForm({ ...issueForm, expected: e.target.value })} placeholder="Expected behavior" className="w-full rounded-lg border border-forge-border bg-forge-bg px-3 py-2 text-sm" rows={2} />
              <textarea value={issueForm.actual} onChange={(e) => setIssueForm({ ...issueForm, actual: e.target.value })} placeholder="Actual behavior" className="w-full rounded-lg border border-forge-border bg-forge-bg px-3 py-2 text-sm" rows={2} />
              <textarea value={issueForm.suspectedCauses} onChange={(e) => setIssueForm({ ...issueForm, suspectedCauses: e.target.value })} placeholder="Suspected causes (one per line)" className="w-full rounded-lg border border-forge-border bg-forge-bg px-3 py-2 text-sm" rows={2} />
              <textarea value={issueForm.verificationPlan} onChange={(e) => setIssueForm({ ...issueForm, verificationPlan: e.target.value })} placeholder="Verification plan (one per line)" className="w-full rounded-lg border border-forge-border bg-forge-bg px-3 py-2 text-sm" rows={2} />
              <button type="submit" className="min-h-[36px] rounded-lg border border-forge-border bg-forge-primary px-4 text-sm text-black">Create Report</button>
            </form>

            <div className="space-y-3">
              {issues.length === 0 && <p className="text-sm text-forge-textMuted">No issue reports yet.</p>}
              {issues.map((iss) => (
                <article key={iss.id} className="rounded-xl border border-forge-border bg-forge-surface p-4">
                  <div className="flex items-center gap-2">
                    <strong className="text-sm">{iss.title}</strong>
                    <span className="ml-auto text-xs text-forge-textMuted">{iss.severity}</span>
                  </div>
                  <p className="mt-1 text-xs text-forge-textMuted">{new Date(iss.createdAt).toLocaleString()}</p>
                  <p className="mt-2 text-sm">{iss.summary}</p>
                  <p className="mt-1 text-xs text-forge-textMuted">
                    Screenshots: {iss.screenshotIds?.length || 0} • Events: {iss.eventIds?.length || 0}
                  </p>
                </article>
              ))}
            </div>
          </div>
        )}
      </main>
    </section>
  );
}

export default VisionWorkspace;