import type { HSVA, RGBA } from './types';

export function clampByte(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(255, Math.round(n)));
}

export function clampRange(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

export function hexToRgba(hex: string, alpha = 255): RGBA {
  const clean = hex.trim().replace(/^#/, '');
  if (clean.length === 3 || clean.length === 4) {
    const r = parseInt(clean[0] + clean[0], 16);
    const g = parseInt(clean[1] + clean[1], 16);
    const b = parseInt(clean[2] + clean[2], 16);
    const a = clean.length === 4 ? parseInt(clean[3] + clean[3], 16) : alpha;
    if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b) || Number.isNaN(a)) {
      return { r: 0, g: 0, b: 0, a: clampByte(alpha) };
    }
    return { r, g, b, a };
  }
  if (clean.length === 6 || clean.length === 8) {
    const r = parseInt(clean.slice(0, 2), 16);
    const g = parseInt(clean.slice(2, 4), 16);
    const b = parseInt(clean.slice(4, 6), 16);
    const a = clean.length === 8 ? parseInt(clean.slice(6, 8), 16) : alpha;
    if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b) || Number.isNaN(a)) {
      return { r: 0, g: 0, b: 0, a: clampByte(alpha) };
    }
    return { r, g, b, a };
  }
  return { r: 0, g: 0, b: 0, a: clampByte(alpha) };
}

export function rgbaToHex(c: RGBA, includeAlpha = false): string {
  const r = clampByte(c.r).toString(16).padStart(2, '0');
  const g = clampByte(c.g).toString(16).padStart(2, '0');
  const b = clampByte(c.b).toString(16).padStart(2, '0');
  if (includeAlpha) {
    const a = clampByte(c.a).toString(16).padStart(2, '0');
    return `#${r}${g}${b}${a}`.toUpperCase();
  }
  return `#${r}${g}${b}`.toUpperCase();
}

export function rgbaToCss(c: RGBA, opacityMultiplier = 1): string {
  const alpha = clampRange((c.a / 255) * opacityMultiplier, 0, 1);
  return `rgba(${clampByte(c.r)}, ${clampByte(c.g)}, ${clampByte(c.b)}, ${alpha.toFixed(4)})`;
}

export function rgbToHsv(c: RGBA): HSVA {
  const r = clampByte(c.r) / 255;
  const g = clampByte(c.g) / 255;
  const b = clampByte(c.b) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;

  let h = 0;
  if (d > 0) {
    if (max === r) {
      h = 60 * (((g - b) / d) % 6);
    } else if (max === g) {
      h = 60 * ((b - r) / d + 2);
    } else {
      h = 60 * ((r - g) / d + 4);
    }
  }
  if (h < 0) h += 360;

  const s = max === 0 ? 0 : (d / max) * 100;
  const v = max * 100;

  return {
    h: Math.round(h) % 360,
    s: Math.round(s),
    v: Math.round(v),
    a: clampByte(c.a),
  };
}

export function hsvToRgb(hsv: HSVA): RGBA {
  const h = ((hsv.h % 360) + 360) % 360;
  const s = clampRange(hsv.s, 0, 100) / 100;
  const v = clampRange(hsv.v, 0, 100) / 100;

  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;

  let r1 = 0;
  let g1 = 0;
  let b1 = 0;

  if (h < 60) {
    r1 = c; g1 = x; b1 = 0;
  } else if (h < 120) {
    r1 = x; g1 = c; b1 = 0;
  } else if (h < 180) {
    r1 = 0; g1 = c; b1 = x;
  } else if (h < 240) {
    r1 = 0; g1 = x; b1 = c;
  } else if (h < 300) {
    r1 = x; g1 = 0; b1 = c;
  } else {
    r1 = c; g1 = 0; b1 = x;
  }

  return {
    r: clampByte((r1 + m) * 255),
    g: clampByte((g1 + m) * 255),
    b: clampByte((b1 + m) * 255),
    a: clampByte(hsv.a),
  };
}

export function isValidHexInput(input: string): boolean {
  return /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(input.trim());
}

// 32-swatch raster palette: two balanced rows of standard & vivid hues.
export const DEFAULT_PALETTE: readonly string[] = [
  '#000000', '#404040', '#FF0000', '#FF6A00', '#FFD800', '#B6FF00', '#4CFF00', '#00FF21',
  '#00FF90', '#00FFFF', '#0094FF', '#0026FF', '#4800FF', '#B200FF', '#FF00DC', '#FF006E',
  '#FFFFFF', '#808080', '#7F0000', '#7F3300', '#7F6A00', '#5B7F00', '#267F00', '#007F0E',
  '#007F46', '#007F7F', '#004A7F', '#00137F', '#21007F', '#57007F', '#7F006E', '#7F0037',
];

export const BLACK: RGBA = { r: 0, g: 0, b: 0, a: 255 };
export const WHITE: RGBA = { r: 255, g: 255, b: 255, a: 255 };
