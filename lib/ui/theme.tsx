import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from 'react';

export type ThemePreference = 'system' | 'light' | 'dark' | 'hc';
export type ResolvedTheme = 'light' | 'dark' | 'hc';

const STORAGE_KEY = 'site.theme';

const THEME_COLORS: Record<ResolvedTheme, string> = {
  light: '#f5f7fb',
  dark: '#09090b',
  hc: '#000000',
};

const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

function isStoredTheme(value: string | null): value is ResolvedTheme {
  return value === 'light' || value === 'dark' || value === 'hc';
}

function readStoredPreference(): ThemePreference {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return isStoredTheme(stored) ? stored : 'system';
  } catch {
    return 'system';
  }
}

function readSystemDark(): boolean {
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  } catch {
    return false;
  }
}

export interface ThemeContextValue {
  preference: ThemePreference;
  theme: ResolvedTheme;
  setTheme: (next: ThemePreference) => void;
  mounted: boolean;
}

const ThemeContext = createContext<ThemeContextValue>({
  preference: 'system',
  theme: 'light',
  setTheme: () => {},
  mounted: false,
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [preference, setPreference] = useState<ThemePreference>('system');
  const [systemDark, setSystemDark] = useState<boolean>(false);
  const [mounted, setMounted] = useState<boolean>(false);

  useEffect(() => {
    setPreference(readStoredPreference());
    setSystemDark(readSystemDark());
    setMounted(true);

    if (typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (event: MediaQueryListEvent) => setSystemDark(event.matches);
    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', onChange);
      return () => mq.removeEventListener('change', onChange);
    }
    mq.addListener(onChange);
    return () => mq.removeListener(onChange);
  }, []);

  const theme: ResolvedTheme = useMemo(() => {
    if (preference === 'system') return systemDark ? 'dark' : 'light';
    return preference;
  }, [preference, systemDark]);

  useEffect(() => {
    if (!mounted) return;
    document.documentElement.dataset.dsTheme = theme;
  }, [mounted, theme]);

  const setTheme = useCallback((next: ThemePreference) => {
    setPreference(next);
    try {
      if (next === 'system') {
        window.localStorage.removeItem(STORAGE_KEY);
      } else {
        window.localStorage.setItem(STORAGE_KEY, next);
      }
    } catch {
      // Ignore storage failures (e.g. private mode).
    }
    if (typeof document !== 'undefined') {
      const resolved: ResolvedTheme = next === 'system' ? (readSystemDark() ? 'dark' : 'light') : next;
      document.documentElement.dataset.dsTheme = resolved;
    }
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ preference, theme, setTheme, mounted }),
    [preference, theme, setTheme, mounted],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}

/**
 * Opts the active route into Design System v2 page-level styling (`html[data-ds-page="v2"]`),
 * per-tool accent variables, and a matching `<meta name="theme-color">`, then cleans everything
 * up on unmount so legacy routes never inherit v2 body or footer styles.
 */
export function useDesignSystemPage(accentLight?: string, accentDark?: string): void {
  const { theme, mounted } = useTheme();

  useIsomorphicLayoutEffect(() => {
    const html = document.documentElement;
    html.dataset.dsPage = 'v2';
    if (accentLight) {
      html.style.setProperty('--ds-accent-light', accentLight);
    } else {
      html.style.removeProperty('--ds-accent-light');
    }
    if (accentDark) {
      html.style.setProperty('--ds-accent-dark', accentDark);
    } else {
      html.style.removeProperty('--ds-accent-dark');
    }

    return () => {
      delete html.dataset.dsPage;
      html.style.removeProperty('--ds-accent-light');
      html.style.removeProperty('--ds-accent-dark');
    };
  }, [accentLight, accentDark]);

  useEffect(() => {
    if (!mounted) return;
    let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"][data-ds-managed="true"]');
    const created = !meta;
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'theme-color';
      meta.dataset.dsManaged = 'true';
      document.head.appendChild(meta);
    }
    meta.content = THEME_COLORS[theme];

    return () => {
      if (created && meta && meta.parentNode) {
        meta.parentNode.removeChild(meta);
      }
    };
  }, [mounted, theme]);
}
