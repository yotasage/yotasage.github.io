import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { LOCALES, Locale, TRANSLATIONS, TranslationKey } from './translations';

export type { Locale, TranslationKey } from './translations';

const STORAGE_KEY = 'site.lang';

function isLocale(value: string | null): value is Locale {
  return value === 'en' || value === 'nb';
}

export type TranslationVars = Record<string, string | number>;

function interpolate(template: string, vars?: TranslationVars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : match,
  );
}

export interface I18nContextValue {
  locale: Locale;
  setLocale: (next: Locale) => void;
  toggleLocale: () => void;
  t: (key: TranslationKey | (string & {}), vars?: TranslationVars) => string;
  locales: readonly Locale[];
}

function defaultT(key: TranslationKey | (string & {}), vars?: TranslationVars): string {
  const dict = TRANSLATIONS.en as Record<string, string>;
  return interpolate(dict[key] ?? key, vars);
}

const I18nContext = createContext<I18nContextValue>({
  locale: 'en',
  setLocale: () => {},
  toggleLocale: () => {},
  t: defaultT,
  locales: LOCALES,
});

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('en');

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (isLocale(stored)) {
        setLocaleState(stored);
        document.documentElement.lang = stored;
      }
    } catch {
      // Ignore storage failures.
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Ignore storage failures.
    }
    if (typeof document !== 'undefined') {
      document.documentElement.lang = next;
    }
  }, []);

  const toggleLocale = useCallback(() => {
    setLocale(locale === 'en' ? 'nb' : 'en');
  }, [locale, setLocale]);

  const t = useCallback(
    (key: TranslationKey | (string & {}), vars?: TranslationVars): string => {
      const activeDict = TRANSLATIONS[locale] as Record<string, string>;
      const fallbackDict = TRANSLATIONS.en as Record<string, string>;
      const raw = activeDict[key] ?? fallbackDict[key] ?? key;
      return interpolate(raw, vars);
    },
    [locale],
  );

  const value = useMemo<I18nContextValue>(
    () => ({ locale, setLocale, toggleLocale, t, locales: LOCALES }),
    [locale, setLocale, toggleLocale, t],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  return useContext(I18nContext);
}
