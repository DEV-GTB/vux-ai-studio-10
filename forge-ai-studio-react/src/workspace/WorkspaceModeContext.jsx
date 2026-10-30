import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  MODE_PREFERENCE,
  getRecommendedMode,
  isValidPreference,
  resolveWorkspaceMode,
} from './getRecommendedMode.js';

const STORAGE_KEY = 'vux.workspace.mode';

const WorkspaceModeContext = createContext(null);

/**
 * Combines the automatic width recommendation with the user's saved
 * preference.
 *
 * The two are kept separate on purpose. Automatic detection must never
 * override a deliberate choice, otherwise the interface keeps rearranging
 * itself behind the user's back.
 */
export function WorkspaceModeProvider({ children, width = 0 }) {
  const [preference, setPreferenceState] = useState(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (isValidPreference(stored)) return stored;
    } catch {
      // Storage may be unavailable. The session still works.
    }
    return MODE_PREFERENCE.AUTO;
  });

  const recommendedMode = getRecommendedMode(width);
  const effectiveMode = resolveWorkspaceMode(preference, recommendedMode);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, preference);
    } catch {
      // A failed write only means the choice does not survive a reload.
    }
  }, [preference]);

  const value = useMemo(() => ({
    preference,
    recommendedMode,
    effectiveMode,
    setPreference: (next) => {
      if (isValidPreference(next)) setPreferenceState(next);
    },
  }), [preference, recommendedMode, effectiveMode]);

  return (
    <WorkspaceModeContext.Provider value={value}>
      {children}
    </WorkspaceModeContext.Provider>
  );
}

export function useWorkspaceMode() {
  const context = useContext(WorkspaceModeContext);
  if (!context) {
    throw new Error('useWorkspaceMode must be used inside WorkspaceModeProvider');
  }
  return context;
}

