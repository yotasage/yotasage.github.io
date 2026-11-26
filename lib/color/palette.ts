import {
  clamp,
  hslToRgb,
  hsvToRgb,
  labToRgb,
  normalizeHue,
  normalizeRgba,
  oklchToRgb,
  rgbToHsl,
  rgbToHsv,
  rgbToLab,
  rgbToOklch,
} from './convert';
import { formatHex, formatOklch } from './parse';
import type { HarmonyKind, MixSpace, RGBA } from './types';

export interface SwatchStep {
  label: string;
  color: RGBA;
  hex: string;
}

export function getHarmonyColors(base: RGBA, kind: HarmonyKind): SwatchStep[] {
  const hsv = rgbToHsv(base);
  const hue = hsv.h;
  const make = (label: string, h: number, s = hsv.s, v = hsv.v): SwatchStep => {
    const color = hsvToRgb({ h: normalizeHue(h), s: clamp(s, 0, 100), v: clamp(v, 0, 100) }, base.a);
    return { label, color, hex: formatHex(color) };
  };

  switch (kind) {
    case 'complementary':
      return [
        make('Base', hue),
        make('+180°', hue + 180),
      ];
    case 'analogous':
      return [
        make('-30°', hue - 30),
        make('Base', hue),
        make('+30°', hue + 30),
      ];
    case 'triadic':
      return [
        make('Base', hue),
        make('+120°', hue + 120),
        make('+240°', hue + 240),
      ];
    case 'split':
      return [
        make('Base', hue),
        make('+150°', hue + 150),
        make('+210°', hue + 210),
      ];
    case 'tetradic':
      return [
        make('Base', hue),
        make('+90°', hue + 90),
        make('+180°', hue + 180),
        make('+270°', hue + 270),
      ];
    case 'monochromatic': {
      const ok = rgbToOklch(base);
      const levels = [0.88, 0.72, ok.l, 0.44, 0.28];
      const labels = ['Light', 'Soft', 'Base', 'Deep', 'Dark'];
      return levels.map((l, idx) => {
        const c = idx === 2 ? base : oklchToRgb({ l, c: ok.c * (idx === 0 ? 0.45 : idx === 4 ? 0.75 : 0.92), h: ok.h }, base.a);
        return { label: labels[idx], color: c, hex: formatHex(c) };
      });
    }
  }
}

/** Returns harmony hue offsets in degrees for plotting on the circular wheel. */
export function getHarmonyAngles(baseHue: number, kind: HarmonyKind): number[] {
  const h = normalizeHue(baseHue);
  switch (kind) {
    case 'complementary':
      return [h, normalizeHue(h + 180)];
    case 'analogous':
      return [normalizeHue(h - 30), h, normalizeHue(h + 30)];
    case 'triadic':
      return [h, normalizeHue(h + 120), normalizeHue(h + 240)];
    case 'split':
      return [h, normalizeHue(h + 150), normalizeHue(h + 210)];
    case 'tetradic':
      return [h, normalizeHue(h + 90), normalizeHue(h + 180), normalizeHue(h + 270)];
    case 'monochromatic':
      return [h];
  }
}

const SCALE_STOPS: readonly { step: string; l: number; chromaScale: number }[] = [
  { step: '50', l: 0.97, chromaScale: 0.16 },
  { step: '100', l: 0.93, chromaScale: 0.32 },
  { step: '200', l: 0.86, chromaScale: 0.56 },
  { step: '300', l: 0.77, chromaScale: 0.78 },
  { step: '400', l: 0.68, chromaScale: 0.94 },
  { step: '500', l: 0.60, chromaScale: 1.0 },
  { step: '600', l: 0.52, chromaScale: 0.98 },
  { step: '700', l: 0.44, chromaScale: 0.88 },
  { step: '800', l: 0.36, chromaScale: 0.76 },
  { step: '900', l: 0.28, chromaScale: 0.62 },
  { step: '950', l: 0.20, chromaScale: 0.46 },
];

/** Generates a perceptually balanced 11-step 50..950 UI scale in OKLCH. */
export function generateOklchScale(base: RGBA): SwatchStep[] {
  const ok = rgbToOklch(base);
  const peakChroma = Math.max(ok.c, ok.c > 0.01 ? ok.c : 0);
  return SCALE_STOPS.map(({ step, l, chromaScale }) => {
    const color = oklchToRgb({ l, c: peakChroma * chromaScale, h: ok.h }, 1);
    return { label: step, color, hex: formatHex(color) };
  });
}

export function generateTintsShadesTones(base: RGBA, steps = 7): {
  tints: SwatchStep[];
  shades: SwatchStep[];
  tones: SwatchStep[];
} {
  const mixTowards = (target: RGBA): SwatchStep[] => {
    const out: SwatchStep[] = [];
    for (let i = 0; i < steps; i++) {
      const t = i / (steps - 1);
      const color = mixColors(base, target, t, 'srgb');
      out.push({
        label: `${Math.round(t * 100)}%`,
        color,
        hex: formatHex(color),
      });
    }
    return out;
  };
  return {
    tints: mixTowards({ r: 255, g: 255, b: 255, a: base.a }),
    shades: mixTowards({ r: 0, g: 0, b: 0, a: base.a }),
    tones: mixTowards({ r: 128, g: 128, b: 128, a: base.a }),
  };
}

function lerpHue(h1: number, h2: number, t: number): number {
  let diff = normalizeHue(h2) - normalizeHue(h1);
  if (diff > 180) diff -= 360;
  if (diff < -180) diff += 360;
  return normalizeHue(h1 + diff * t);
}

export function mixColors(c1: RGBA, c2: RGBA, t: number, space: MixSpace): RGBA {
  const k = clamp(t, 0, 1);
  const a = c1.a + (c2.a - c1.a) * k;

  if (space === 'srgb') {
    return normalizeRgba({
      r: c1.r + (c2.r - c1.r) * k,
      g: c1.g + (c2.g - c1.g) * k,
      b: c1.b + (c2.b - c1.b) * k,
      a,
    });
  }

  if (space === 'hsl') {
    const h1 = rgbToHsl(c1);
    const h2 = rgbToHsl(c2);
    const h = h1.s < 0.5 ? h2.h : h2.s < 0.5 ? h1.h : lerpHue(h1.h, h2.h, k);
    return hslToRgb(
      {
        h,
        s: h1.s + (h2.s - h1.s) * k,
        l: h1.l + (h2.l - h1.l) * k,
      },
      a,
    );
  }

  if (space === 'lab') {
    const l1 = rgbToLab(c1);
    const l2 = rgbToLab(c2);
    return labToRgb(
      {
        l: l1.l + (l2.l - l1.l) * k,
        a: l1.a + (l2.a - l1.a) * k,
        b: l1.b + (l2.b - l1.b) * k,
      },
      a,
    );
  }

  // OKLCH perceptual interpolation
  const o1 = rgbToOklch(c1);
  const o2 = rgbToOklch(c2);
  const h = o1.c < 0.002 ? o2.h : o2.c < 0.002 ? o1.h : lerpHue(o1.h, o2.h, k);
  return oklchToRgb(
    {
      l: o1.l + (o2.l - o1.l) * k,
      c: o1.c + (o2.c - o1.c) * k,
      h,
    },
    a,
  );
}

export function buildMixRamp(c1: RGBA, c2: RGBA, steps: number, space: MixSpace): SwatchStep[] {
  const count = Math.max(2, Math.min(21, Math.round(steps)));
  const out: SwatchStep[] = [];
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    const color = mixColors(c1, c2, t, space);
    out.push({
      label: `${Math.round(t * 100)}%`,
      color,
      hex: formatHex(color),
    });
  }
  return out;
}

export type PaletteExportFormat = 'css' | 'scss' | 'tailwind' | 'json' | 'svg';

export function exportPalette(
  swatches: readonly SwatchStep[],
  format: PaletteExportFormat,
  prefix = 'brand',
): string {
  const safePrefix = prefix.replace(/[^a-zA-Z0-9_-]/g, '') || 'color';

  if (format === 'css') {
    const lines = swatches.map(
      (s, i) => `  --${safePrefix}-${s.label.toLowerCase().replace(/[^a-z0-9]+/g, '-') || i + 1}: ${s.hex}; /* ${formatOklch(s.color)} */`,
    );
    return `:root {\n${lines.join('\n')}\n}`;
  }

  if (format === 'scss') {
    return swatches
      .map((s, i) => `$${safePrefix}-${s.label.toLowerCase().replace(/[^a-z0-9]+/g, '-') || i + 1}: ${s.hex};`)
      .join('\n');
  }

  if (format === 'tailwind') {
    const entries = swatches.map(
      (s, i) => `  '${s.label.toLowerCase().replace(/[^a-z0-9]+/g, '-') || i + 1}': '${s.hex}',`,
    );
    return `${safePrefix}: {\n${entries.join('\n')}\n}`;
  }

  if (format === 'json') {
    const obj: Record<string, { hex: string; oklch: string }> = {};
    swatches.forEach((s, i) => {
      const key = s.label.toLowerCase().replace(/[^a-z0-9]+/g, '-') || String(i + 1);
      obj[key] = { hex: s.hex, oklch: formatOklch(s.color) };
    });
    return JSON.stringify({ [safePrefix]: obj }, null, 2);
  }

  // SVG swatch sheet
  const cellW = 96;
  const cellH = 112;
  const width = Math.max(cellW, swatches.length * cellW);
  const rects = swatches
    .map((s, i) => {
      const x = i * cellW;
      return [
        `  <g transform="translate(${x},0)">`,
        `    <rect width="${cellW}" height="80" fill="${s.hex}" />`,
        `    <rect y="80" width="${cellW}" height="32" fill="#ffffff" />`,
        `    <text x="8" y="95" font-family="monospace" font-size="11" font-weight="600" fill="#0f172a">${s.hex}</text>`,
        `    <text x="8" y="107" font-family="sans-serif" font-size="9" fill="#64748b">${s.label}</text>`,
        `  </g>`,
      ].join('\n');
    })
    .join('\n');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${cellH}" viewBox="0 0 ${width} ${cellH}">\n${rects}\n</svg>`;
}
