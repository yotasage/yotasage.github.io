import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

export type ExperienceMode = 'quick' | 'standard' | 'teaching';

const STORAGE_KEY = 'site.mode';

function isExperienceMode(value: string | null): value is ExperienceMode {
  return value === 'quick' || value === 'standard' || value === 'teaching';
}

export interface ModeContextValue {
  mode: ExperienceMode;
  setMode: (next: ExperienceMode) => void;
  mounted: boolean;
}

const ModeContext = createContext<ModeContextValue>({
  mode: 'standard',
  setMode: () => {},
  mounted: false,
});

export function ModeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ExperienceMode>('standard');
  const [mounted, setMounted] = useState<boolean>(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (isExperienceMode(stored)) setModeState(stored);
    } catch {
      // Ignore storage failures.
    }
    setMounted(true);
  }, []);

  const setMode = useCallback((next: ExperienceMode) => {
    setModeState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Ignore storage failures.
    }
  }, []);

  const value = useMemo<ModeContextValue>(
    () => ({ mode, setMode, mounted }),
    [mode, setMode, mounted],
  );

  return <ModeContext.Provider value={value}>{children}</ModeContext.Provider>;
}

export function useExperienceMode(): ModeContextValue {
  return useContext(ModeContext);
}
