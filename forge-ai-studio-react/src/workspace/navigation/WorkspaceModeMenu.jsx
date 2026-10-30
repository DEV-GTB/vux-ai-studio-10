import { useEffect, useRef, useState } from 'react';
import { useWorkspaceMode } from '../WorkspaceModeContext.jsx';
import { MODE_PREFERENCE, WORKSPACE_MODE } from '../getRecommendedMode.js';

const OPTIONS = [
  {
    value: MODE_PREFERENCE.AUTO,
    label: 'Automatic',
    description: 'Follow the available space',
  },
  {
    value: WORKSPACE_MODE.MOBILE,
    label: 'Mobile',
    description: 'One tool at a time with a bottom bar',
  },
  {
    value: WORKSPACE_MODE.TABLET,
    label: 'Tablet',
    description: 'Editor with a side panel and split view',
  },
  {
    value: WORKSPACE_MODE.DESKTOP,
    label: 'Desktop',
    description: 'The full multi-panel workspace',
  },
];

/**
 * The workspace layout picker.
 *
 * It is a small part of the existing workspace menu, not a separate feature
 * page. Selecting a mode rearranges the tools that are already open; it does
 * not reload the IDE, close the project, or discard unsaved changes.
 */
export function WorkspaceModeMenu({ compact = false }) {
  const { preference, recommendedMode, setPreference } = useWorkspaceMode();
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    const onPointerDown = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const active = OPTIONS.find((option) => option.value === preference) || OPTIONS[0];

  return (
    <div className="workspace-mode-menu" ref={containerRef}>
      <button
        type="button"
        className="workspace-mode-trigger"
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="menu"
        aria-expanded={open}
        title={`Workspace layout: ${active.label}`}
      >
        <span aria-hidden="true">▦</span>
        {!compact && <span className="workspace-mode-trigger-label">{active.label}</span>}
      </button>

      {open && (
        <div className="workspace-mode-popover" role="menu" aria-label="Workspace layout">
          <p className="workspace-mode-heading">Workspace layout</p>
          <p className="workspace-mode-hint">Choose how your workspace tools are arranged.</p>

          <ul className="workspace-mode-list">
            {OPTIONS.map((option) => (
              <li key={option.value}>
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked={preference === option.value}
                  className={`workspace-mode-option ${preference === option.value ? 'is-selected' : ''}`}
                  onClick={() => {
                    setPreference(option.value);
                    setOpen(false);
                  }}
                >
                  <span className="workspace-mode-radio" aria-hidden="true">
                    {preference === option.value ? '●' : '○'}
                  </span>
                  <span className="workspace-mode-text">
                    <span className="workspace-mode-label">{option.label}</span>
                    <span className="workspace-mode-description">{option.description}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>

          <p className="workspace-mode-note">
            {preference === MODE_PREFERENCE.AUTO
              ? `Following the available space. Recommended: ${recommendedMode}.`
              : `Locked to ${active.label.toLowerCase()}. The tools still fit the space available.`}
          </p>
        </div>
      )}
    </div>
  );
}
