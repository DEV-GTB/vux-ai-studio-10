import { useWorkspace } from '../WorkspaceContext.jsx';
import { PANEL_REGISTRY, getPanelDefinition } from '../panelRegistry.js';

/**
 * The workspace tool menu.
 *
 * Every tool has its own entry. They are deliberately not folded into a
 * dashboard: a user who wants the debugger should find a Debug entry, not a
 * panel that happens to contain a debugger tab.
 *
 * The menu is a navigation surface only. It never renders a second copy of a
 * tool; it routes to the one implementation the workspace already has.
 */
export function WorkspaceToolMenu({ mode, onSelect }) {
  const { activePanel, setActivePanel } = useWorkspace();

  const handleSelect = (id) => {
    setActivePanel(id);
    if (onSelect) onSelect(id);
  };

  return (
    <nav
      aria-label="Workspace tools"
      className="workspace-tool-menu"
      data-mode={mode}
    >
      {PANEL_REGISTRY.map((panel) => {
        const isActive = activePanel === panel.id;
        return (
          <button
            key={panel.id}
            type="button"
            onClick={() => handleSelect(panel.id)}
            className={`workspace-tool-menu-item ${isActive ? 'is-active' : ''}`}
            aria-current={isActive ? 'true' : undefined}
            title={`${panel.label} — ${panel.description}`}
          >
            <span aria-hidden="true" className="workspace-tool-menu-icon">{panel.icon}</span>
            <span className="workspace-tool-menu-label">{panel.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

/**
 * The tool menu as a horizontal list, used in the workspace toolbar.
 * Same registry, same entries, different arrangement.
 */
export function WorkspaceToolBar({ onSelect }) {
  const { activePanel, setActivePanel } = useWorkspace();

  return (
    <div className="workspace-tool-bar" role="group" aria-label="Workspace tools">
      {PANEL_REGISTRY.filter((panel) => panel.id !== 'settings').map((panel) => {
        const isActive = activePanel === panel.id;
        return (
          <button
            key={panel.id}
            type="button"
            onClick={() => {
              setActivePanel(panel.id);
              if (onSelect) onSelect(panel.id);
            }}
            className={`workspace-tool-bar-item ${isActive ? 'is-active' : ''}`}
            aria-pressed={isActive}
            title={panel.description}
          >
            <span aria-hidden="true">{panel.icon}</span>
            <span>{panel.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export { getPanelDefinition };
