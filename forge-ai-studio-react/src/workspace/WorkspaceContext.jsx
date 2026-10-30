import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { getPanelDefinition } from './panelRegistry.js';

const WorkspaceContext = createContext(null);

/**
 * Shared navigation state for the workspace.
 *
 * The layout decides where a tool is shown. The tool itself owns its own
 * state. That separation is what lets the same terminal session, editor
 * model, and preview survive a change of workspace mode.
 */
export function WorkspaceProvider({ children, initialPanel = 'editor' }) {
  const [activePanel, setActivePanelState] = useState(initialPanel);
  const [previousPanel, setPreviousPanel] = useState(null);
  const [openPanels, setOpenPanels] = useState([initialPanel]);

  const setActivePanel = useCallback((panel) => {
    if (!getPanelDefinition(panel)) return;
    setActivePanelState((current) => {
      if (current === panel) return current;
      setPreviousPanel(current);
      return panel;
    });
    setOpenPanels((current) => (current.includes(panel) ? current : [...current, panel]));
  }, []);

  const closePanel = useCallback((panel) => {
    setOpenPanels((current) => {
      const next = current.filter((item) => item !== panel);
      if (panel === activePanel) {
        setActivePanelState(next.length ? next[next.length - 1] : 'editor');
        setPreviousPanel(null);
      }
      return next;
    });
  }, [activePanel]);

  const togglePanel = useCallback((panel) => {
    if (activePanel === panel) closePanel(panel);
    else setActivePanel(panel);
  }, [activePanel, closePanel, setActivePanel]);

  const value = useMemo(() => ({
    activePanel,
    previousPanel,
    openPanels,
    setActivePanel,
    closePanel,
    togglePanel,
  }), [activePanel, previousPanel, openPanels, setActivePanel, closePanel, togglePanel]);

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error('useWorkspace must be used inside WorkspaceProvider');
  }
  return context;
}
