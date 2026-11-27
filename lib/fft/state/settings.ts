// Shareable settings hash (#s=<base64url>), localStorage presets,
// and bidirectional ?fs=&f0=&n= query bridge with /simsetup/main.
// Security: never serializes raw sample data; caps hash at 4 KiB; strips prototype keys.

import type {
  EstimatorKind,
  PlotThemeId,
  Setup,
  WindowKind,
  YAxisUnit,
} from '../types';
import { createDefaultSetup } from '../metrics/analyze';

export const PRESET_STORAGE_KEY = 'fft:presets';
export const MAX_HASH_BYTES = 4096;

const ALLOWED_WINDOWS: ReadonlySet<string> = new Set<WindowKind>([
  'auto',
  'rectangular',
  'hann',
  'hamming',
  'blackman',
  'blackman-harris',
  'nuttall',
  'flattop',
  'kaiser',
  'chebyshev',
  'gaussian',
  'tukey',
  'bartlett',
  'welch',
]);

const ALLOWED_ESTIMATORS: ReadonlySet<string> = new Set<EstimatorKind>(['dft', 'welch', 'czt']);
const ALLOWED_YUNITS: ReadonlySet<string> = new Set<YAxisUnit>(['dBFS', 'dBV', 'dBm', 'asd', 'nsd']);
const ALLOWED_THEMES: ReadonlySet<string> = new Set<PlotThemeId>([
  'mpl-default',
  'mpl-grid',
  'mpl-dark',
]);

export interface ShareableSettings {
  v: 1;
  setup: Partial<Setup>;
  yUnit?: YAxisUnit;
  xScale?: 'linear' | 'log';
  plotTheme?: PlotThemeId;
}

export interface SavedUserPreset {
  id: string;
  name: string;
  savedAt: string;
  settings: ShareableSettings;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function finiteOr(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function finiteOrNull(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** Validate and clamp untrusted settings JSON onto a clean default Setup. */
export function sanitizeSetup(raw: unknown, base: Setup = createDefaultSetup()): Setup {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ...base };
  const obj = raw as Record<string, unknown>;
  const convRaw =
    obj.conventions && typeof obj.conventions === 'object' && !Array.isArray(obj.conventions)
      ? (obj.conventions as Record<string, unknown>)
      : {};
  const wpRaw =
    obj.windowParams && typeof obj.windowParams === 'object' && !Array.isArray(obj.windowParams)
      ? (obj.windowParams as Record<string, unknown>)
      : {};

  const fs = clamp(finiteOr(obj.fs, base.fs), 1e-6, 1e15);
  const start = Math.max(0, Math.floor(finiteOr(obj.start, base.start)));
  const n = clamp(Math.floor(finiteOr(obj.n, base.n)), 16, 1 << 20);
  const window: WindowKind =
    typeof obj.window === 'string' && ALLOWED_WINDOWS.has(obj.window)
      ? (obj.window as WindowKind)
      : base.window;
  const estimator: EstimatorKind =
    typeof obj.estimator === 'string' && ALLOWED_ESTIMATORS.has(obj.estimator)
      ? (obj.estimator as EstimatorKind)
      : base.estimator;

  let band: [number, number] | null = base.band;
  if (obj.band === null) {
    band = null;
  } else if (
    Array.isArray(obj.band) &&
    obj.band.length === 2 &&
    typeof obj.band[0] === 'number' &&
    typeof obj.band[1] === 'number' &&
    Number.isFinite(obj.band[0]) &&
    Number.isFinite(obj.band[1]) &&
    obj.band[1] > obj.band[0]
  ) {
    band = [Math.max(0, obj.band[0]), obj.band[1]];
  }

  return {
    fs,
    start,
    n,
    window,
    windowParams: {
      kaiserBeta: clamp(finiteOr(wpRaw.kaiserBeta, base.windowParams.kaiserBeta), 0, 24),
      chebyshevDb: clamp(finiteOr(wpRaw.chebyshevDb, base.windowParams.chebyshevDb), 40, 160),
      gaussianSigma: clamp(finiteOr(wpRaw.gaussianSigma, base.windowParams.gaussianSigma), 0.1, 0.8),
      tukeyAlpha: clamp(finiteOr(wpRaw.tukeyAlpha, base.windowParams.tukeyAlpha), 0, 1),
    },
    estimator,
    welchSegments: clamp(Math.floor(finiteOr(obj.welchSegments, base.welchSegments)), 1, 128),
    welchOverlap: clamp(finiteOr(obj.welchOverlap, base.welchOverlap), 0, 0.9),
    welchDetrend:
      obj.welchDetrend === 'none' || obj.welchDetrend === 'mean' || obj.welchDetrend === 'linear'
        ? obj.welchDetrend
        : base.welchDetrend,
    cztF1: finiteOrNull(obj.cztF1),
    cztF2: finiteOrNull(obj.cztF2),
    cztPoints: clamp(Math.floor(finiteOr(obj.cztPoints, base.cztPoints)), 64, 4096),
    fullScale:
      obj.fullScale === null
        ? null
        : finiteOrNull(obj.fullScale) !== null && (obj.fullScale as number) > 0
          ? (obj.fullScale as number)
          : base.fullScale,
    bits:
      obj.bits === null
        ? null
        : finiteOrNull(obj.bits) !== null
          ? clamp(Math.round(obj.bits as number), 1, 32)
          : base.bits,
    f0Hint: finiteOrNull(obj.f0Hint),
    band,
    inputGain: clamp(finiteOr(obj.inputGain, base.inputGain), 1e-9, 1e9),
    powerWatts:
      obj.powerWatts === null
        ? null
        : finiteOrNull(obj.powerWatts) !== null && (obj.powerWatts as number) > 0
          ? (obj.powerWatts as number)
          : base.powerWatts,
    interleaveChannels: clamp(
      Math.floor(finiteOr(obj.interleaveChannels, base.interleaveChannels)),
      1,
      64,
    ),
    twoToneMode: typeof obj.twoToneMode === 'boolean' ? obj.twoToneMode : base.twoToneMode,
    resampleMethod:
      obj.resampleMethod === 'linear' || obj.resampleMethod === 'cubic'
        ? obj.resampleMethod
        : base.resampleMethod,
    resampleFs:
      obj.resampleFs === null
        ? null
        : finiteOrNull(obj.resampleFs) !== null && (obj.resampleFs as number) > 0
          ? (obj.resampleFs as number)
          : base.resampleFs,
    conventions: {
      harmonicsCount: clamp(
        Math.floor(finiteOr(convRaw.harmonicsCount, base.conventions.harmonicsCount)),
        2,
        50,
      ),
      snrExcludesHarmonics:
        typeof convRaw.snrExcludesHarmonics === 'boolean'
          ? convRaw.snrExcludesHarmonics
          : base.conventions.snrExcludesHarmonics,
      thdNegativeDb:
        typeof convRaw.thdNegativeDb === 'boolean'
          ? convRaw.thdNegativeDb
          : base.conventions.thdNegativeDb,
      enobFsCorrection:
        typeof convRaw.enobFsCorrection === 'boolean'
          ? convRaw.enobFsCorrection
          : base.conventions.enobFsCorrection,
      noiseBinCompensation:
        typeof convRaw.noiseBinCompensation === 'boolean'
          ? convRaw.noiseBinCompensation
          : base.conventions.noiseBinCompensation,
      coherenceTol: clamp(
        finiteOr(convRaw.coherenceTol, base.conventions.coherenceTol),
        1e-9,
        0.1,
      ),
      refImpedanceOhm: clamp(
        finiteOr(convRaw.refImpedanceOhm, base.conventions.refImpedanceOhm),
        1,
        1e6,
      ),
      dcBinsOverride:
        convRaw.dcBinsOverride === null
          ? null
          : finiteOrNull(convRaw.dcBinsOverride) !== null
            ? clamp(Math.floor(convRaw.dcBinsOverride as number), 1, 50)
            : base.conventions.dcBinsOverride,
      signalBinsOverride:
        convRaw.signalBinsOverride === null
          ? null
          : finiteOrNull(convRaw.signalBinsOverride) !== null
            ? clamp(Math.floor(convRaw.signalBinsOverride as number), 1, 50)
            : base.conventions.signalBinsOverride,
    },
  };
}

function toBase64Url(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  const b64 = typeof btoa === 'function' ? btoa(bin) : Buffer.from(bytes).toString('base64');
  return b64.replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/g, '');
}

function fromBase64Url(b64url: string): string {
  const b64 = b64url.replaceAll('-', '+').replaceAll('_', '/');
  const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
  const full = b64 + pad;
  if (typeof atob === 'function') {
    const bin = atob(full);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }
  return Buffer.from(full, 'base64').toString('utf8');
}

/** Encode settings-only payload into `#s=<base64url>` (guaranteed <= 4 KiB). */
export function encodeSettingsHash(settings: ShareableSettings): string {
  const json = JSON.stringify({
    v: 1,
    setup: settings.setup,
    yUnit: settings.yUnit,
    xScale: settings.xScale,
    plotTheme: settings.plotTheme,
  });
  const encoded = toBase64Url(json);
  if (encoded.length > MAX_HASH_BYTES) {
    throw new Error('Serialized settings exceed 4 KiB URL hash limit.');
  }
  return `#s=${encoded}`;
}

/** Decode and strictly validate `#s=<base64url>` hash. Never throws on malformed input. */
export function decodeSettingsHash(hash: string): ShareableSettings | null {
  if (!hash) return null;
  const trimmed = hash.startsWith('#') ? hash.slice(1) : hash;
  const match = trimmed.match(/(?:^|&)s=([A-Za-z0-9_-]+)/);
  if (!match) return null;
  const token = match[1];
  if (token.length === 0 || token.length > MAX_HASH_BYTES) return null;
  try {
    const jsonStr = fromBase64Url(token);
    if (jsonStr.length > MAX_HASH_BYTES * 2) return null;
    // Strip prototype-pollution keys during parse
    const parsed = JSON.parse(jsonStr, (k, v) => {
      if (k === '__proto__' || k === 'constructor' || k === 'prototype') return undefined;
      return v;
    });
    if (!parsed || typeof parsed !== 'object' || parsed.v !== 1) return null;
    const setup = sanitizeSetup(parsed.setup);
    const yUnit: YAxisUnit | undefined =
      typeof parsed.yUnit === 'string' && ALLOWED_YUNITS.has(parsed.yUnit)
        ? (parsed.yUnit as YAxisUnit)
        : undefined;
    const xScale: 'linear' | 'log' | undefined =
      parsed.xScale === 'linear' || parsed.xScale === 'log' ? parsed.xScale : undefined;
    const plotTheme: PlotThemeId | undefined =
      typeof parsed.plotTheme === 'string' && ALLOWED_THEMES.has(parsed.plotTheme)
        ? (parsed.plotTheme as PlotThemeId)
        : undefined;
    return { v: 1, setup, yUnit, xScale, plotTheme };
  } catch {
    return null;
  }
}

/** Parse optional `?fs=&f0=&n=` bridge parameters from /simsetup/main. */
export function parseSimSetupQuery(search: string): {
  fs: number | null;
  f0: number | null;
  n: number | null;
} {
  const params = new URLSearchParams(search);
  const parsePos = (key: string) => {
    const raw = params.get(key);
    if (!raw) return null;
    const v = Number(raw);
    return Number.isFinite(v) && v > 0 ? v : null;
  };
  return {
    fs: parsePos('fs'),
    f0: parsePos('f0'),
    n: parsePos('n'),
  };
}

/** Build `/simsetup/main?fs=...&f0=...&n=...` bridge URL from active FFT setup. */
export function buildSimSetupHref(fs: number, f0: number | null, n: number): string {
  const params = new URLSearchParams();
  if (Number.isFinite(fs) && fs > 0) params.set('fs', String(fs));
  if (f0 !== null && Number.isFinite(f0) && f0 > 0) params.set('f0', String(Number(f0.toPrecision(8))));
  if (Number.isFinite(n) && n >= 16) params.set('n', String(Math.round(n)));
  return `/simsetup/main?${params.toString()}`;
}

export function loadSavedPresets(): SavedUserPreset[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(PRESET_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((p) => p && typeof p.id === 'string' && typeof p.name === 'string' && p.settings)
      .slice(0, 20);
  } catch {
    return [];
  }
}

export function saveUserPreset(name: string, settings: ShareableSettings): SavedUserPreset[] {
  const existing = loadSavedPresets();
  const cleanName = name.trim().slice(0, 48) || 'Saved setup';
  const entry: SavedUserPreset = {
    id: `u-${Date.now().toString(36)}`,
    name: cleanName,
    savedAt: new Date().toISOString().slice(0, 10),
    settings,
  };
  const next = [entry, ...existing.filter((e) => e.name !== cleanName)].slice(0, 20);
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(PRESET_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Ignore quota / private browsing errors
    }
  }
  return next;
}

export function deleteUserPreset(id: string): SavedUserPreset[] {
  const next = loadSavedPresets().filter((e) => e.id !== id);
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(PRESET_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Ignore storage errors
    }
  }
  return next;
}
