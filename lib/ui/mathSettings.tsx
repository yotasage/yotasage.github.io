import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import {
  clampMathScale,
  DEFAULT_MATH_SCALE,
  FULL_FRACTIONS_STORAGE_KEY,
  MATH_SCALE_STORAGE_KEY,
} from './mathFormat';

export interface MathSettingsContextValue {
  /** Site-wide math font scale percentage (60–300, default 115). */
  mathScale: number;
  /** Update site-wide math scale percentage (clamped to [60, 300]). */
  setMathScale: (next: number) => void;
  /** Whether inline \frac{}{} commands render at full display size (\dfrac). */
  fullSizeFractions: boolean;
  /** Toggle full-size fractions across all KaTeX formulas. */
  setFullSizeFractions: (next: boolean) => void;
  /** Restore default math display settings. */
  resetMathSettings: () => void;
  /** True when both math scale and full-size fractions match defaults. */
  isDefault: boolean;
  /** True after client hydration has synced persisted preferences. */
  mounted: boolean;
}

const MathSettingsContext = createContext<MathSettingsContextValue | null>(null);

function readStoredScale(): number {
  if (typeof window === 'undefined') return DEFAULT_MATH_SCALE;
  try {
    const raw = window.localStorage.getItem(MATH_SCALE_STORAGE_KEY);
    if (!raw) return DEFAULT_MATH_SCALE;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return DEFAULT_MATH_SCALE;
    return clampMathScale(parsed);
  } catch {
    return DEFAULT_MATH_SCALE;
  }
}

function readStoredFullFractions(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    const raw = window.localStorage.getItem(FULL_FRACTIONS_STORAGE_KEY);
    if (raw === '0' || raw === 'false') return false;
    return true;
  } catch {
    return true;
  }
}

function applyMathScaleToDocument(scalePercent: number): void {
  if (typeof document === 'undefined') return;
  const factor = (scalePercent / 100).toFixed(4).replace(/\.?0+$/, '');
  document.documentElement.style.setProperty('--ds-math-scale', factor);
}

export function MathSettingsProvider({ children }: { children: React.ReactNode }) {
  const [mathScale, setMathScaleState] = useState<number>(DEFAULT_MATH_SCALE);
  const [fullSizeFractions, setFullSizeFractionsState] = useState<boolean>(true);
  const [mounted, setMounted] = useState<boolean>(false);

  useEffect(() => {
    const storedScale = readStoredScale();
    const storedFractions = readStoredFullFractions();
    setMathScaleState(storedScale);
    setFullSizeFractionsState(storedFractions);
    applyMathScaleToDocument(storedScale);
    setMounted(true);

    const onStorage = (event: StorageEvent) => {
      if (event.key === MATH_SCALE_STORAGE_KEY) {
        const next = readStoredScale();
        setMathScaleState(next);
        applyMathScaleToDocument(next);
      } else if (event.key === FULL_FRACTIONS_STORAGE_KEY) {
        setFullSizeFractionsState(readStoredFullFractions());
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const setMathScale = useCallback((next: number) => {
    const clamped = clampMathScale(next);
    setMathScaleState(clamped);
    applyMathScaleToDocument(clamped);
    try {
      window.localStorage.setItem(MATH_SCALE_STORAGE_KEY, String(clamped));
    } catch {
      // Ignore storage quota / privacy-mode errors.
    }
  }, []);

  const setFullSizeFractions = useCallback((next: boolean) => {
    setFullSizeFractionsState(next);
    try {
      window.localStorage.setItem(FULL_FRACTIONS_STORAGE_KEY, next ? '1' : '0');
    } catch {
      // Ignore storage quota / privacy-mode errors.
    }
  }, []);

  const resetMathSettings = useCallback(() => {
    setMathScaleState(DEFAULT_MATH_SCALE);
    setFullSizeFractionsState(true);
    applyMathScaleToDocument(DEFAULT_MATH_SCALE);
    try {
      window.localStorage.removeItem(MATH_SCALE_STORAGE_KEY);
      window.localStorage.removeItem(FULL_FRACTIONS_STORAGE_KEY);
    } catch {
      // Ignore storage errors.
    }
  }, []);

  const isDefault = mathScale === DEFAULT_MATH_SCALE && fullSizeFractions === true;

  const value = useMemo<MathSettingsContextValue>(
    () => ({
      mathScale,
      setMathScale,
      fullSizeFractions,
      setFullSizeFractions,
      resetMathSettings,
      isDefault,
      mounted,
    }),
    [mathScale, setMathScale, fullSizeFractions, setFullSizeFractions, resetMathSettings, isDefault, mounted],
  );

  return <MathSettingsContext.Provider value={value}>{children}</MathSettingsContext.Provider>;
}

const FALLBACK_VALUE: MathSettingsContextValue = {
  mathScale: DEFAULT_MATH_SCALE,
  setMathScale: () => {},
  fullSizeFractions: true,
  setFullSizeFractions: () => {},
  resetMathSettings: () => {},
  isDefault: true,
  mounted: false,
};

export function useMathSettings(): MathSettingsContextValue {
  const ctx = useContext(MathSettingsContext);
  return ctx ?? FALLBACK_VALUE;
}
