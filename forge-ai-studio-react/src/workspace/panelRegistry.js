// Workspace mode types and the panel registry.
//
// The registry is the single source of truth for which tools the workspace can
// show. The activity bar, the mobile navigation, the More drawer, the command
// palette, and the layout switcher all read from it, so a tool is described
// exactly once.
//
// Every tool gets its own entry. The workspace does not group tools into a
// dashboard: a user looking for the debugger should find a Debug entry, not a
// panel that happens to contain a debugger tab.

export const WORKSPACE_MODES = ['mobile', 'tablet', 'desktop'];

export const WORKSPACE_MODE_PREFERENCES = ['auto', ...WORKSPACE_MODES];

export const PANEL_IDS = [
  'editor',
  'files',
  'preview',
  'terminal',
  'output',
  'console',
  'inspect',
  'debug',
  'search',
  'problems',
  'tests',
  'source-control',
  'deploy',
  'extensions',
  'assistant',
  'settings',
];

/**
 * @typedef {object} PanelDefinition
 * @property {string} id
 * @property {string} label
 * @property {string} description
 * @property {string} icon
 * @property {boolean} mobilePrimary   shown in the mobile bottom navigation
 * @property {boolean} desktopVisible  visible by default on desktop
 * @property {string}  group            used to group entries in menus
 */

/** @type {PanelDefinition[]} */
export const PANEL_REGISTRY = [
  {
    id: 'editor',
    label: 'Editor',
    description: 'Write and edit project files',
    icon: '📝',
    mobilePrimary: true,
    desktopVisible: true,
    group: 'code',
  },
  {
    id: 'files',
    label: 'Files & Editor',
    description: 'Browse the project tree and open files',
    icon: '📁',
    mobilePrimary: false,
    desktopVisible: true,
    group: 'code',
  },
  {
    id: 'preview',
    label: 'Preview',
    description: 'See the running project',
    icon: '👁️',
    mobilePrimary: true,
    desktopVisible: true,
    group: 'run',
  },
  {
    id: 'terminal',
    label: 'Terminal',
    description: 'Run project commands',
    icon: '💻',
    mobilePrimary: true,
    desktopVisible: true,
    group: 'run',
  },
  {
    id: 'output',
    label: 'Output',
    description: 'Build and task results',
    icon: '📤',
    mobilePrimary: false,
    desktopVisible: false,
    group: 'run',
  },
  {
    id: 'console',
    label: 'Console Logs',
    description: 'Runtime messages and errors',
    icon: '🧾',
    mobilePrimary: false,
    desktopVisible: false,
    group: 'run',
  },
  {
    id: 'problems',
    label: 'Problems',
    description: 'Diagnostics for the project',
    icon: '⚠️',
    mobilePrimary: false,
    desktopVisible: false,
    group: 'run',
  },
  {
    id: 'tests',
    label: 'Tests',
    description: 'Run and review the test suite',
    icon: '🧪',
    mobilePrimary: false,
    desktopVisible: false,
    group: 'run',
  },
  {
    id: 'debug',
    label: 'Debug',
    description: 'Breakpoints and debugging controls',
    icon: '🐛',
    mobilePrimary: false,
    desktopVisible: false,
    group: 'code',
  },
  {
    id: 'inspect',
    label: 'Inspect',
    description: 'Select and inspect preview elements',
    icon: '🔍',
    mobilePrimary: false,
    desktopVisible: false,
    group: 'code',
  },
  {
    id: 'search',
    label: 'Search',
    description: 'Find text across the project',
    icon: '🔎',
    mobilePrimary: false,
    desktopVisible: false,
    group: 'code',
  },
  {
    id: 'source-control',
    label: 'Source Control',
    description: 'Review branch and changes',
    icon: '🌿',
    mobilePrimary: false,
    desktopVisible: false,
    group: 'code',
  },
  {
    id: 'deploy',
    label: 'Deploy',
    description: 'Publish the project',
    icon: '🚀',
    mobilePrimary: false,
    desktopVisible: false,
    group: 'run',
  },
  {
    id: 'extensions',
    label: 'Extensions',
    description: 'Available editor extensions',
    icon: '🧩',
    mobilePrimary: false,
    desktopVisible: false,
    group: 'code',
  },
  {
    id: 'assistant',
    label: 'AI Assistant',
    description: 'Ask for code changes',
    icon: '🤖',
    mobilePrimary: false,
    desktopVisible: true,
    group: 'assist',
  },
  {
    id: 'settings',
    label: 'Settings',
    description: 'Preferences and workspace layout',
    icon: '⚙️',
    mobilePrimary: false,
    desktopVisible: false,
    group: 'assist',
  },
];

const PANEL_BY_ID = new Map(PANEL_REGISTRY.map((panel) => [panel.id, panel]));

export function getPanelDefinition(id) {
  return PANEL_BY_ID.get(id) || null;
}

export function getMobilePrimaryPanels() {
  return PANEL_REGISTRY.filter((panel) => panel.mobilePrimary);
}

export function getDesktopVisiblePanels() {
  return PANEL_REGISTRY.filter((panel) => panel.desktopVisible);
}

export function getPanelsByGroup(group) {
  return PANEL_REGISTRY.filter((panel) => panel.group === group);
}

/**
 * The tools the mobile More drawer lists.
 *
 * The assistant is deliberately not here. The mobile workspace is for working
 * on the project, not for chatting with it, and an empty assistant entry on a
 * phone is a dead end.
 */
export function getMobileSecondaryPanels() {
  return PANEL_REGISTRY.filter((panel) => !panel.mobilePrimary && panel.id !== 'assistant');
}
