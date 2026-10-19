import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getRecommendedMode,
  resolveWorkspaceMode,
  canShowSplitView,
  canShowPersistentFileTree,
  isValidPreference,
  BREAKPOINTS,
  MODE_PREFERENCE,
  WORKSPACE_MODE,
} from '../forge-ai-studio-react/src/workspace/getRecommendedMode.js';
import {
  PANEL_REGISTRY,
  PANEL_IDS,
  getPanelDefinition,
  getMobilePrimaryPanels,
  getMobileSecondaryPanels,
  getDesktopVisiblePanels,
  getPanelsByGroup,
} from '../forge-ai-studio-react/src/workspace/panelRegistry.js';

test('the width policy picks the layout that fits the space', () => {
  assert.equal(getRecommendedMode(375), WORKSPACE_MODE.MOBILE);
  assert.equal(getRecommendedMode(BREAKPOINTS.mobile - 1), WORKSPACE_MODE.MOBILE);
  assert.equal(getRecommendedMode(BREAKPOINTS.mobile), WORKSPACE_MODE.TABLET);
  assert.equal(getRecommendedMode(768), WORKSPACE_MODE.TABLET);
  assert.equal(getRecommendedMode(BREAKPOINTS.tablet - 1), WORKSPACE_MODE.TABLET);
  assert.equal(getRecommendedMode(BREAKPOINTS.tablet), WORKSPACE_MODE.DESKTOP);
  assert.equal(getRecommendedMode(1440), WORKSPACE_MODE.DESKTOP);
});

test('an unknown width falls back to the widest layout', () => {
  assert.equal(getRecommendedMode(0), WORKSPACE_MODE.DESKTOP);
  assert.equal(getRecommendedMode(-100), WORKSPACE_MODE.DESKTOP);
  assert.equal(getRecommendedMode(Number.NaN), WORKSPACE_MODE.DESKTOP);
});

test('an explicit preference is never overridden by the automatic recommendation', () => {
  // A user who picked Desktop Mode keeps it, even in a narrow window.
  assert.equal(resolveWorkspaceMode(WORKSPACE_MODE.DESKTOP, WORKSPACE_MODE.MOBILE), WORKSPACE_MODE.DESKTOP);
  assert.equal(resolveWorkspaceMode(WORKSPACE_MODE.MOBILE, WORKSPACE_MODE.DESKTOP), WORKSPACE_MODE.MOBILE);
  assert.equal(resolveWorkspaceMode(WORKSPACE_MODE.TABLET, WORKSPACE_MODE.MOBILE), WORKSPACE_MODE.TABLET);
});

test('the automatic preference follows the recommendation', () => {
  assert.equal(resolveWorkspaceMode(MODE_PREFERENCE.AUTO, WORKSPACE_MODE.MOBILE), WORKSPACE_MODE.MOBILE);
  assert.equal(resolveWorkspaceMode(MODE_PREFERENCE.AUTO, WORKSPACE_MODE.TABLET), WORKSPACE_MODE.TABLET);
  assert.equal(resolveWorkspaceMode(MODE_PREFERENCE.AUTO, WORKSPACE_MODE.DESKTOP), WORKSPACE_MODE.DESKTOP);
});

test('an invalid preference falls back to the recommendation', () => {
  assert.equal(resolveWorkspaceMode('nonsense', WORKSPACE_MODE.TABLET), WORKSPACE_MODE.TABLET);
  assert.equal(isValidPreference('nonsense'), false);
  assert.equal(isValidPreference(MODE_PREFERENCE.AUTO), true);
  assert.equal(isValidPreference(WORKSPACE_MODE.DESKTOP), true);
});

test('the split view only appears when both panes fit', () => {
  assert.equal(canShowSplitView(1024), true);
  assert.equal(canShowSplitView(680), false);
  assert.equal(canShowSplitView(0), false);
});

test('the file tree only stays open when the editor still has room', () => {
  assert.equal(canShowPersistentFileTree(1024), true);
  assert.equal(canShowPersistentFileTree(500), false);
});

test('every panel in the registry is described completely', () => {
  for (const panel of PANEL_REGISTRY) {
    assert.ok(panel.id, 'a panel needs an id');
    assert.ok(panel.label, `${panel.id} needs a label`);
    assert.ok(panel.description, `${panel.id} needs a description`);
    assert.ok(panel.icon, `${panel.id} needs an icon`);
    assert.ok(PANEL_IDS.includes(panel.id), `${panel.id} is not in the id list`);
  }
});

test('every tool the user asked for has its own menu entry', () => {
  // Each of these is a separate entry rather than a tab inside a dashboard.
  const required = ['debug', 'terminal', 'preview', 'console', 'output', 'problems'];
  for (const id of required) {
    const panel = getPanelDefinition(id);
    assert.ok(panel, `${id} must have its own entry`);
    assert.ok(panel.label.length > 0);
  }
});

test('the file tree and the editor share one entry', () => {
  const files = getPanelDefinition('files');
  assert.ok(files, 'there must be a files entry');
  assert.match(files.label, /Files/i);
  assert.match(files.description, /tree/i);
});

test('the panel ids are unique', () => {
  assert.equal(new Set(PANEL_REGISTRY.map((panel) => panel.id)).size, PANEL_REGISTRY.length);
});

test('the mobile navigation carries three primary tools plus More', () => {
  const primary = getMobilePrimaryPanels();
  assert.deepEqual(primary.map((panel) => panel.id), ['editor', 'preview', 'terminal']);
});

test('the assistant is not part of the mobile workspace', () => {
  const secondary = getMobileSecondaryPanels();
  assert.ok(!secondary.some((panel) => panel.id === 'assistant'));
  assert.ok(!getMobilePrimaryPanels().some((panel) => panel.id === 'assistant'));
});

test('the mobile drawer still exposes the tools the user asked for', () => {
  const secondary = getMobileSecondaryPanels();
  for (const id of ['files', 'output', 'console', 'inspect', 'debug', 'search', 'problems']) {
    assert.ok(secondary.some((panel) => panel.id === id), `${id} must be reachable on mobile`);
  }
});

test('the panels are grouped so a menu can be ordered', () => {
  assert.ok(getPanelsByGroup('code').length > 0);
  assert.ok(getPanelsByGroup('run').length > 0);
  assert.ok(getPanelsByGroup('assist').length > 0);
});

test('the desktop layout shows the file tree, the editor, the preview and the terminal', () => {
  const visible = getDesktopVisiblePanels().map((panel) => panel.id);
  for (const id of ['files', 'editor', 'preview', 'terminal']) {
    assert.ok(visible.includes(id), `${id} should be visible on desktop`);
  }
});
