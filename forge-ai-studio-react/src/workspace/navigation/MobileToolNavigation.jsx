import { useEffect, useRef } from 'react';
import { useWorkspace } from '../WorkspaceContext.jsx';
import { getMobilePrimaryPanels, getMobileSecondaryPanels } from '../panelRegistry.js';

/**
 * The mobile bottom navigation.
 *
 * Three primary tools plus More. A narrow screen cannot carry eight equally
 * prominent destinations without the labels becoming unreadable and the
 * buttons turning into accidental taps, so the rest live in the drawer.
 */
export function MobileToolNavigation({ onOpenMore }) {
  const { activePanel, setActivePanel } = useWorkspace();
  const primary = getMobilePrimaryPanels();

  return (
    <nav className="mobile-tool-navigation" aria-label="Workspace tools">
      {primary.map((panel) => {
        const isActive = activePanel === panel.id;
        return (
          <button
            key={panel.id}
            type="button"
            className={`mobile-tool-navigation-item ${isActive ? 'is-active' : ''}`}
            aria-current={isActive ? 'page' : undefined}
            onClick={() => setActivePanel(panel.id)}
          >
            <span aria-hidden="true" className="mobile-tool-navigation-icon">{panel.icon}</span>
            <span className="mobile-tool-navigation-label">{panel.label}</span>
          </button>
        );
      })}
      <button
        type="button"
        className="mobile-tool-navigation-item mobile-tool-navigation-more"
        onClick={onOpenMore}
        aria-haspopup="dialog"
      >
        <span aria-hidden="true" className="mobile-tool-navigation-icon">⋯</span>
        <span className="mobile-tool-navigation-label">More</span>
      </button>
    </nav>
  );
}

/**
 * The More drawer.
 *
 * It is a navigation surface, not a second IDE. Each entry routes to the
 * existing tool implementation. Escape closes it, and focus returns to the
 * control that opened it.
 */
export function MoreToolsDrawer({ open, onClose }) {
  const { activePanel, setActivePanel } = useWorkspace();
  const closeRef = useRef(null);
  const triggerRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    closeRef.current?.focus();

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
        triggerRef.current?.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const handleSelect = (panel) => {
    setActivePanel(panel);
    onClose();
  };

  return (
    <div className="more-drawer-backdrop" onClick={onClose} role="presentation">
      <div
        className="more-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="More tools"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="more-drawer-header">
          <h2 className="more-drawer-title">Tools</h2>
          <button
            ref={closeRef}
            type="button"
            className="more-drawer-close"
            onClick={() => {
              onClose();
              triggerRef.current?.focus();
            }}
            aria-label="Close the tools menu"
          >
            ✕
          </button>
        </div>

        <ul className="more-drawer-list">
          {getMobileSecondaryPanels().map((panel) => (
            <li key={panel.id}>
              <button
                type="button"
                className={`more-drawer-item ${activePanel === panel.id ? 'is-active' : ''}`}
                onClick={() => handleSelect(panel.id)}
              >
                <span aria-hidden="true" className="more-drawer-icon">{panel.icon}</span>
                <span className="more-drawer-text">
                  <span className="more-drawer-label">{panel.label}</span>
                  <span className="more-drawer-description">{panel.description}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
