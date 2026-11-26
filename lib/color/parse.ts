import {
  clamp,
  clampByte,
  cmykToRgb,
  CSS_NAMED_COLORS,
  hslToRgb,
  hsvToRgb,
  hwbToRgb,
  labToRgb,
  lchToRgb,
  normalizeHue,
  normalizeRgba,
  oklabToRgb,
  oklchToRgb,
  rgbToCmyk,
  rgbToHsl,
  rgbToHsv,
  rgbToHwb,
  rgbToLab,
  rgbToLch,
  rgbToOklab,
  rgbToOklch,
  rgbToXyz,
  xyzToRgb,
} from './convert';
import type { ColorFormatItem, RGBA } from './types';

function roundTo(n: number, decimals: number): string {
  const factor = Math.pow(10, decimals);
  const val = Math.round(n * factor) / factor;
  const normalized = Object.is(val, -0) ? 0 : val;
  return decimals === 0 ? String(Math.round(normalized)) : normalized.toFixed(decimals).replace(/\.?0+$/, '');
}

export function formatHex(c: RGBA, opts?: { uppercase?: boolean; includeAlpha?: boolean }): string {
  const norm = normalizeRgba(c);
  const r = norm.r.toString(16).padStart(2, '0');
  const g = norm.g.toString(16).padStart(2, '0');
  const b = norm.b.toString(16).padStart(2, '0');
  const showAlpha = opts?.includeAlpha ?? norm.a < 0.9995;
  let hex = `#${r}${g}${b}`;
  if (showAlpha) {
    const a = clampByte(norm.a * 255).toString(16).padStart(2, '0');
    hex += a;
  }
  return opts?.uppercase === false ? hex.toLowerCase() : hex.toUpperCase();
}

export function formatHexShort(c: RGBA, uppercase = true): string | null {
  const norm = normalizeRgba(c);
  if (norm.r % 17 !== 0 || norm.g % 17 !== 0 || norm.b % 17 !== 0) return null;
  const r = (norm.r / 17).toString(16);
  const g = (norm.g / 17).toString(16);
  const b = (norm.b / 17).toString(16);
  const showAlpha = norm.a < 0.9995;
  let hex = `#${r}${g}${b}`;
  if (showAlpha) {
    const aByte = clampByte(norm.a * 255);
    if (aByte % 17 !== 0) return null;
    hex += (aByte / 17).toString(16);
  }
  return uppercase ? hex.toUpperCase() : hex.toLowerCase();
}

export function formatRgb(c: RGBA): string {
  const norm = normalizeRgba(c);
  if (norm.a < 0.9995) {
    return `rgba(${norm.r}, ${norm.g}, ${norm.b}, ${roundTo(norm.a, 2)})`;
  }
  return `rgb(${norm.r}, ${norm.g}, ${norm.b})`;
}

export function formatCssRgba(c: RGBA): string {
  const norm = normalizeRgba(c);
  return `rgba(${norm.r}, ${norm.g}, ${norm.b}, ${roundTo(norm.a, 3)})`;
}

export function formatHsl(c: RGBA): string {
  const hsl = rgbToHsl(c);
  const h = roundTo(hsl.h, 1);
  const s = roundTo(hsl.s, 1);
  const l = roundTo(hsl.l, 1);
  if (c.a < 0.9995) {
    return `hsla(${h}, ${s}%, ${l}%, ${roundTo(c.a, 2)})`;
  }
  return `hsl(${h}, ${s}%, ${l}%)`;
}

export function formatHsv(c: RGBA): string {
  const hsv = rgbToHsv(c);
  const h = roundTo(hsv.h, 1);
  const s = roundTo(hsv.s, 1);
  const v = roundTo(hsv.v, 1);
  if (c.a < 0.9995) {
    return `hsva(${h}, ${s}%, ${v}%, ${roundTo(c.a, 2)})`;
  }
  return `hsv(${h}, ${s}%, ${v}%)`;
}

export function formatHwb(c: RGBA): string {
  const hwb = rgbToHwb(c);
  const base = `hwb(${roundTo(hwb.h, 1)} ${roundTo(hwb.w, 1)}% ${roundTo(hwb.b, 1)}%`;
  return c.a < 0.9995 ? `${base} / ${roundTo(c.a * 100, 0)}%)` : `${base})`;
}

export function formatCmyk(c: RGBA): string {
  const cmyk = rgbToCmyk(c);
  return `cmyk(${roundTo(cmyk.c, 0)}%, ${roundTo(cmyk.m, 0)}%, ${roundTo(cmyk.y, 0)}%, ${roundTo(cmyk.k, 0)}%)`;
}

export function formatOklch(c: RGBA): string {
  const oklch = rgbToOklch(c);
  const base = `oklch(${(oklch.l * 100).toFixed(1)}% ${oklch.c.toFixed(4)} ${oklch.h.toFixed(1)}`;
  return c.a < 0.9995 ? `${base} / ${roundTo(c.a, 2)})` : `${base})`;
}

export function formatOklab(c: RGBA): string {
  const oklab = rgbToOklab(c);
  const base = `oklab(${(oklab.l * 100).toFixed(1)}% ${oklab.a.toFixed(4)} ${oklab.b.toFixed(4)}`;
  return c.a < 0.9995 ? `${base} / ${roundTo(c.a, 2)})` : `${base})`;
}

export function formatLab(c: RGBA): string {
  const lab = rgbToLab(c);
  const base = `lab(${lab.l.toFixed(1)}% ${lab.a.toFixed(2)} ${lab.b.toFixed(2)}`;
  return c.a < 0.9995 ? `${base} / ${roundTo(c.a, 2)})` : `${base})`;
}

export function formatLch(c: RGBA): string {
  const lch = rgbToLch(c);
  const base = `lch(${lch.l.toFixed(1)}% ${lch.c.toFixed(2)} ${lch.h.toFixed(1)}`;
  return c.a < 0.9995 ? `${base} / ${roundTo(c.a, 2)})` : `${base})`;
}

export function formatXyz(c: RGBA): string {
  const xyz = rgbToXyz(c);
  return `xyz(${xyz.x.toFixed(4)}, ${xyz.y.toFixed(4)}, ${xyz.z.toFixed(4)})`;
}

export function getAllFormats(c: RGBA, uppercaseHex = true): ColorFormatItem[] {
  const hexShort = formatHexShort(c, uppercaseHex);
  return [
    {
      id: 'hex',
      label: 'HEX',
      value: formatHex(c, { uppercase: uppercaseHex }),
      shortNote: hexShort ?? undefined,
    },
    { id: 'rgb', label: 'RGB', value: formatRgb(c) },
    { id: 'hsl', label: 'HSL', value: formatHsl(c) },
    { id: 'hsv', label: 'HSV / HSB', value: formatHsv(c) },
    { id: 'hwb', label: 'HWB', value: formatHwb(c) },
    { id: 'cmyk', label: 'CMYK', value: formatCmyk(c) },
    { id: 'oklch', label: 'OKLCH', value: formatOklch(c) },
    { id: 'oklab', label: 'OKLab', value: formatOklab(c) },
    { id: 'lab', label: 'CIE Lab', value: formatLab(c) },
    { id: 'lch', label: 'CIE LCH', value: formatLch(c) },
    { id: 'xyz', label: 'CIE XYZ (D65)', value: formatXyz(c) },
  ];
}

export interface CodeSnippet {
  id: string;
  label: string;
  code: string;
}

export function getCodeSnippets(c: RGBA, uppercaseHex = true): CodeSnippet[] {
  const norm = normalizeRgba(c);
  const hex6 = formatHex({ ...norm, a: 1 }, { uppercase: uppercaseHex, includeAlpha: false });
  const hexNoHash = hex6.slice(1);
  const aByte = clampByte(norm.a * 255).toString(16).padStart(2, '0').toUpperCase();
  const rf = (norm.r / 255).toFixed(4);
  const gf = (norm.g / 255).toFixed(4);
  const bf = (norm.b / 255).toFixed(4);
  const af = norm.a.toFixed(3);

  return [
    { id: 'cssVar', label: 'CSS Variable', code: `--color-accent: ${formatHex(norm, { uppercase: uppercaseHex })};` },
    { id: 'oklchCss', label: 'CSS Color 4', code: `color: ${formatOklch(norm)};` },
    { id: 'android', label: 'Android / Flutter', code: `Color(0x${aByte}${hexNoHash.toUpperCase()})` },
    {
      id: 'swift',
      label: 'SwiftUI',
      code:
        norm.a < 0.9995
          ? `Color(red: ${rf}, green: ${gf}, blue: ${bf}, opacity: ${af})`
          : `Color(red: ${rf}, green: ${gf}, blue: ${bf})`,
    },
    {
      id: 'glsl',
      label: 'GLSL / Shader',
      code: `vec4(${rf}, ${gf}, ${bf}, ${af})`,
    },
    {
      id: 'latex',
      label: 'LaTeX (xcolor)',
      code: `\\definecolor{accent}{HTML}{${hexNoHash.toUpperCase()}}`,
    },
  ];
}

// ---------------------------------------------------------------------------
// Universal Color String Parser
// ---------------------------------------------------------------------------

function parseAlphaToken(tok: string | undefined): number | null {
  if (tok === undefined) return 1;
  const trimmed = tok.trim();
  if (!trimmed) return 1;
  if (trimmed.endsWith('%')) {
    const n = Number(trimmed.slice(0, -1));
    return Number.isFinite(n) ? clamp(n / 100, 0, 1) : null;
  }
  const n = Number(trimmed);
  return Number.isFinite(n) ? clamp(n, 0, 1) : null;
}

function parseAngleToken(tok: string): number | null {
  const s = tok.trim().toLowerCase();
  if (s === 'none') return 0;
  const m = s.match(/^([+-]?(?:\d+\.?\d*|\.\d+))(deg|rad|grad|turn)?$/);
  if (!m) return null;
  const v = Number(m[1]);
  if (!Number.isFinite(v)) return null;
  switch (m[2]) {
    case 'rad':
      return normalizeHue((v * 180) / Math.PI);
    case 'grad':
      return normalizeHue(v * 0.9);
    case 'turn':
      return normalizeHue(v * 360);
    default:
      return normalizeHue(v);
  }
}

function parseNumOrPercent(tok: string, percentScale: number): number | null {
  const s = tok.trim().toLowerCase();
  if (s === 'none') return 0;
  if (s.endsWith('%')) {
    const n = Number(s.slice(0, -1));
    return Number.isFinite(n) ? (n / 100) * percentScale : null;
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function splitFuncArgs(rawArgs: string): { parts: string[]; alpha?: string } | null {
  const slashParts = rawArgs.split('/');
  if (slashParts.length > 2) return null;
  const main = slashParts[0].trim();
  const alphaFromSlash = slashParts.length === 2 ? slashParts[1].trim() : undefined;

  const tokens = main.includes(',')
    ? main.split(',').map((s) => s.trim()).filter(Boolean)
    : main.split(/\s+/).filter(Boolean);

  return { parts: tokens, alpha: alphaFromSlash };
}

export function parseColorString(raw: string): RGBA | null {
  const input = raw.trim();
  if (!input) return null;

  // 1. Named CSS color
  const lower = input.toLowerCase();
  if (Object.prototype.hasOwnProperty.call(CSS_NAMED_COLORS, lower)) {
    return parseColorString(CSS_NAMED_COLORS[lower]);
  }
  if (lower === 'transparent') {
    return { r: 0, g: 0, b: 0, a: 0 };
  }

  // 2. 0xRRGGBB or 0xAARRGGBB (Android / Flutter / C hex literal)
  const hex0x = input.match(/^0x([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/);
  if (hex0x) {
    const digits = hex0x[1];
    if (digits.length === 6) {
      return {
        r: parseInt(digits.slice(0, 2), 16),
        g: parseInt(digits.slice(2, 4), 16),
        b: parseInt(digits.slice(4, 6), 16),
        a: 1,
      };
    }
    const a = parseInt(digits.slice(0, 2), 16) / 255;
    return normalizeRgba({
      r: parseInt(digits.slice(2, 4), 16),
      g: parseInt(digits.slice(4, 6), 16),
      b: parseInt(digits.slice(6, 8), 16),
      a,
    });
  }

  // 3. HEX (#RGB, #RGBA, #RRGGBB, #RRGGBBAA, with or without leading #)
  const hexMatch = input.match(/^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/);
  if (hexMatch) {
    const digits = hexMatch[1];
    if (digits.length === 3 || digits.length === 4) {
      const r = parseInt(digits[0] + digits[0], 16);
      const g = parseInt(digits[1] + digits[1], 16);
      const b = parseInt(digits[2] + digits[2], 16);
      const a = digits.length === 4 ? parseInt(digits[3] + digits[3], 16) / 255 : 1;
      return normalizeRgba({ r, g, b, a });
    }
    const r = parseInt(digits.slice(0, 2), 16);
    const g = parseInt(digits.slice(2, 4), 16);
    const b = parseInt(digits.slice(4, 6), 16);
    const a = digits.length === 8 ? parseInt(digits.slice(6, 8), 16) / 255 : 1;
    return normalizeRgba({ r, g, b, a });
  }

  // 4. Bare RGB triplet "59, 130, 246" or "59 130 246"
  const bareRgb = input.match(/^(\d{1,3})\s*[,\s]\s*(\d{1,3})\s*[,\s]\s*(\d{1,3})$/);
  if (bareRgb) {
    const r = Number(bareRgb[1]);
    const g = Number(bareRgb[2]);
    const b = Number(bareRgb[3]);
    if (r <= 255 && g <= 255 && b <= 255) {
      return { r, g, b, a: 1 };
    }
  }

  // 5. Functional notations
  const fnMatch = input.match(/^([a-zA-Z][a-zA-Z0-9-]*)\s*\(([^)]+)\)$/);
  if (!fnMatch) return null;

  const fnName = fnMatch[1].toLowerCase();
  const parsedArgs = splitFuncArgs(fnMatch[2]);
  if (!parsedArgs) return null;
  const { parts, alpha: slashAlpha } = parsedArgs;

  if (fnName === 'rgb' || fnName === 'rgba') {
    if (parts.length !== 3 && parts.length !== 4) return null;
    const r = parseNumOrPercent(parts[0], 255);
    const g = parseNumOrPercent(parts[1], 255);
    const b = parseNumOrPercent(parts[2], 255);
    const a = parseAlphaToken(parts.length === 4 ? parts[3] : slashAlpha);
    if (r === null || g === null || b === null || a === null) return null;
    return normalizeRgba({ r, g, b, a });
  }

  if (fnName === 'hsl' || fnName === 'hsla') {
    if (parts.length !== 3 && parts.length !== 4) return null;
    const h = parseAngleToken(parts[0]);
    const s = parseNumOrPercent(parts[1], 100);
    const l = parseNumOrPercent(parts[2], 100);
    const a = parseAlphaToken(parts.length === 4 ? parts[3] : slashAlpha);
    if (h === null || s === null || l === null || a === null) return null;
    return hslToRgb({ h, s, l }, a);
  }

  if (fnName === 'hsv' || fnName === 'hsva' || fnName === 'hsb' || fnName === 'hsba') {
    if (parts.length !== 3 && parts.length !== 4) return null;
    const h = parseAngleToken(parts[0]);
    const s = parseNumOrPercent(parts[1], 100);
    const v = parseNumOrPercent(parts[2], 100);
    const a = parseAlphaToken(parts.length === 4 ? parts[3] : slashAlpha);
    if (h === null || s === null || v === null || a === null) return null;
    return hsvToRgb({ h, s, v }, a);
  }

  if (fnName === 'hwb') {
    if (parts.length !== 3 && parts.length !== 4) return null;
    const h = parseAngleToken(parts[0]);
    const w = parseNumOrPercent(parts[1], 100);
    const b = parseNumOrPercent(parts[2], 100);
    const a = parseAlphaToken(parts.length === 4 ? parts[3] : slashAlpha);
    if (h === null || w === null || b === null || a === null) return null;
    return hwbToRgb({ h, w, b }, a);
  }

  if (fnName === 'cmyk' || fnName === 'device-cmyk') {
    if (parts.length !== 4 && parts.length !== 5) return null;
    const c = parseNumOrPercent(parts[0], 100);
    const m = parseNumOrPercent(parts[1], 100);
    const y = parseNumOrPercent(parts[2], 100);
    const k = parseNumOrPercent(parts[3], 100);
    const a = parseAlphaToken(parts.length === 5 ? parts[4] : slashAlpha);
    if (c === null || m === null || y === null || k === null || a === null) return null;
    // Allow 0..1 floats when no % signs are present and all <= 1
    const allUnit = !fnMatch[2].includes('%') && c <= 1 && m <= 1 && y <= 1 && k <= 1;
    const scale = allUnit ? 100 : 1;
    return cmykToRgb({ c: c * scale, m: m * scale, y: y * scale, k: k * scale }, a);
  }

  if (fnName === 'oklch') {
    if (parts.length !== 3 && parts.length !== 4) return null;
    const l = parseNumOrPercent(parts[0], 1);
    const c = parseNumOrPercent(parts[1], 0.4);
    const h = parseAngleToken(parts[2]);
    const a = parseAlphaToken(parts.length === 4 ? parts[3] : slashAlpha);
    if (l === null || c === null || h === null || a === null) return null;
    return oklchToRgb({ l: l > 1 ? l / 100 : l, c, h }, a);
  }

  if (fnName === 'oklab') {
    if (parts.length !== 3 && parts.length !== 4) return null;
    const l = parseNumOrPercent(parts[0], 1);
    const aVal = parseNumOrPercent(parts[1], 0.4);
    const bVal = parseNumOrPercent(parts[2], 0.4);
    const alpha = parseAlphaToken(parts.length === 4 ? parts[3] : slashAlpha);
    if (l === null || aVal === null || bVal === null || alpha === null) return null;
    return oklabToRgb({ l: l > 1 ? l / 100 : l, a: aVal, b: bVal }, alpha);
  }

  if (fnName === 'lab') {
    if (parts.length !== 3 && parts.length !== 4) return null;
    const l = parseNumOrPercent(parts[0], 100);
    const aVal = parseNumOrPercent(parts[1], 125);
    const bVal = parseNumOrPercent(parts[2], 125);
    const alpha = parseAlphaToken(parts.length === 4 ? parts[3] : slashAlpha);
    if (l === null || aVal === null || bVal === null || alpha === null) return null;
    return labToRgb({ l, a: aVal, b: bVal }, alpha);
  }

  if (fnName === 'lch') {
    if (parts.length !== 3 && parts.length !== 4) return null;
    const l = parseNumOrPercent(parts[0], 100);
    const c = parseNumOrPercent(parts[1], 150);
    const h = parseAngleToken(parts[2]);
    const alpha = parseAlphaToken(parts.length === 4 ? parts[3] : slashAlpha);
    if (l === null || c === null || h === null || alpha === null) return null;
    return lchToRgb({ l, c, h }, alpha);
  }

  if (fnName === 'xyz' || fnName === 'xyz-d65') {
    if (parts.length !== 3 && parts.length !== 4) return null;
    const x = parseNumOrPercent(parts[0], 1);
    const y = parseNumOrPercent(parts[1], 1);
    const z = parseNumOrPercent(parts[2], 1);
    const alpha = parseAlphaToken(parts.length === 4 ? parts[3] : slashAlpha);
    if (x === null || y === null || z === null || alpha === null) return null;
    return xyzToRgb({ x, y, z }, alpha);
  }

  return null;
}
