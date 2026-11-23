import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

export const WIDE_VIEW_STORAGE_KEY = 'ds.wide';

interface LayoutContextValue {
  wide: boolean;
  mounted: boolean;
  setWide: (next: boolean) => void;
  toggleWide: () => void;
}

const LayoutContext = createContext<LayoutContextValue>({
  wide: false,
  mounted: false,
  setWide: () => {},
  toggleWide: () => {},
});

function readStoredWide(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(WIDE_VIEW_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function LayoutProvider({ children }: { children: React.ReactNode }) {
  const [wide, setWideState] = useState<boolean>(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setWideState(readStoredWide());
    setMounted(true);
  }, []);

  const setWide = useCallback((next: boolean) => {
    setWideState(next);
    try {
      if (next) window.localStorage.setItem(WIDE_VIEW_STORAGE_KEY, '1');
      else window.localStorage.removeItem(WIDE_VIEW_STORAGE_KEY);
    } catch {
      // Ignore storage errors (private browsing / restricted storage).
    }
  }, []);

  const toggleWide = useCallback(() => {
    setWideState((prev) => {
      const next = !prev;
      try {
        if (next) window.localStorage.setItem(WIDE_VIEW_STORAGE_KEY, '1');
        else window.localStorage.removeItem(WIDE_VIEW_STORAGE_KEY);
      } catch {
        // Ignore storage errors.
      }
      return next;
    });
  }, []);

  const value = useMemo<LayoutContextValue>(
    () => ({ wide, mounted, setWide, toggleWide }),
    [wide, mounted, setWide, toggleWide],
  );

  return <LayoutContext.Provider value={value}>{children}</LayoutContext.Provider>;
}

export function useWideView(): LayoutContextValue {
  return useContext(LayoutContext);
}
