// Workspace mode selection.
//
// Three things are deliberately kept apart:
//
//   1. The physical device.
//   2. The available viewport.
//   3. The user's preferred workspace mode.
//
// They are related but not identical. A phone can open Desktop Mode. A tablet
// can use Mobile Mode. A desktop browser can be resized into a narrow
// window. The user-agent string is therefore never the deciding factor — a
// narrow desktop window and a wide phone both need the layout to follow the
// available space.

export const WORKSPACE_MODE = {
  MOBILE: 'mobile',
  TABLET: 'tablet',
  DESKTOP: 'desktop',
};

export const MODE_PREFERENCE = {
  AUTO: 'auto',
  MOBILE: 'mobile',
  TABLET: 'tablet',
  DESKTOP: 'desktop',
};

// Starting thresholds. These are design values, not laws: they are meant to
// be tuned against the real editor, preview, and panel widths.
export const BREAKPOINTS = {
  mobile: 600,
  tablet: 1024,
};

/**
 * @param {number} width available workspace width in CSS pixels
 * @returns {'mobile'|'tablet'|'desktop'}
 */
export function getRecommendedMode(width) {
  if (!Number.isFinite(width) || width <= 0) return WORKSPACE_MODE.DESKTOP;
  if (width < BREAKPOINTS.mobile) return WORKSPACE_MODE.MOBILE;
  if (width < BREAKPOINTS.tablet) return WORKSPACE_MODE.TABLET;
  return WORKSPACE_MODE.DESKTOP;
}

/**
 * Resolves the layout to render.
 *
 * An explicit preference always wins over the automatic recommendation. A user
 * who picked Desktop Mode on a phone keeps the desktop organisation of tools,
 * even though the individual panels still have to fit the narrow space.
 *
 * @param {string} preference
 * @param {string} recommendedMode
 * @returns {'mobile'|'tablet'|'desktop'}
 */
export function resolveWorkspaceMode(preference, recommendedMode) {
  if (preference === MODE_PREFERENCE.AUTO) return recommendedMode;
  if (preference === WORKSPACE_MODE.MOBILE) return WORKSPACE_MODE.MOBILE;
  if (preference === WORKSPACE_MODE.TABLET) return WORKSPACE_MODE.TABLET;
  if (preference === WORKSPACE_MODE.DESKTOP) return WORKSPACE_MODE.DESKTOP;
  return recommendedMode;
}

/**
 * Whether a split editor and preview view can show both panes usefully.
 * Enabling the split purely because the mode is "tablet" produces two
 * unusable columns, so the widths decide.
 */
export function canShowSplitView(
  availableWidth,
  { minEditorWidth = 360, minPreviewWidth = 320, dividerWidth = 8 } = {},
) {
  if (!Number.isFinite(availableWidth)) return false;
  return availableWidth >= minEditorWidth + minPreviewWidth + dividerWidth;
}

/**
 * Whether the workspace has room for a persistent file tree beside the
 * editor. Below this, the tree has to become a drawer.
 */
export function canShowPersistentFileTree(availableWidth, { minTreeWidth = 200, minEditorWidth = 360 } = {}) {
  if (!Number.isFinite(availableWidth)) return false;
  return availableWidth >= minTreeWidth + minEditorWidth;
}

export function isValidPreference(value) {
  return value === MODE_PREFERENCE.AUTO
    || value === WORKSPACE_MODE.MOBILE
    || value === WORKSPACE_MODE.TABLET
    || value === WORKSPACE_MODE.DESKTOP;
}
