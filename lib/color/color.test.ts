import assert from 'node:assert/strict';
import test from 'node:test';

import {
  apcaContrast,
  evaluateContrast,
  findAccessibleForeground,
  simulateCvd,
  wcagContrastRatio,
} from './accessibility';
import {
  cmykToRgb,
  deltaE2000,
  findNearestNamedColor,
  hslToRgb,
  hsvToRgb,
  hwbToRgb,
  labToRgb,
  lchToRgb,
  maxSrgbChromaForOklch,
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
import {
  buildMixRamp,
  exportPalette,
  generateOklchScale,
  getHarmonyColors,
} from './palette';
import { formatHex, formatHexShort, getAllFormats, parseColorString } from './parse';
import { extractDominantColors, sampleRegionRgba } from './quantize';
import type { RGBA } from './types';

const SAMPLE_COLORS: readonly RGBA[] = [
  { r: 0, g: 0, b: 0, a: 1 },
  { r: 255, g: 255, b: 255, a: 1 },
  { r: 255, g: 0, b: 0, a: 1 },
  { r: 0, g: 255, b: 0, a: 1 },
  { r: 0, g: 0, b: 255, a: 1 },
  { r: 59, g: 130, b: 246, a: 1 },
  { r: 225, g: 29, b: 72, a: 1 },
  { r: 16, g: 185, b: 129, a: 1 },
  { r: 128, g: 128, b: 128, a: 1 },
];

function assertRgbClose(actual: RGBA, expected: RGBA, tol = 2) {
  assert.ok(Math.abs(actual.r - expected.r) <= tol, `R mismatch: ${actual.r} vs ${expected.r}`);
  assert.ok(Math.abs(actual.g - expected.g) <= tol, `G mismatch: ${actual.g} vs ${expected.g}`);
  assert.ok(Math.abs(actual.b - expected.b) <= tol, `B mismatch: ${actual.b} vs ${expected.b}`);
}

test('round-trip color space conversions preserve sRGB within tolerance', () => {
  for (const c of SAMPLE_COLORS) {
    assertRgbClose(hsvToRgb(rgbToHsv(c)), c, 1);
    assertRgbClose(hslToRgb(rgbToHsl(c)), c, 1);
    assertRgbClose(hwbToRgb(rgbToHwb(c)), c, 1);
    assertRgbClose(cmykToRgb(rgbToCmyk(c)), c, 1);
    assertRgbClose(xyzToRgb(rgbToXyz(c)), c, 1);
    assertRgbClose(labToRgb(rgbToLab(c)), c, 1);
    assertRgbClose(lchToRgb(rgbToLch(c)), c, 1);
    assertRgbClose(oklabToRgb(rgbToOklab(c)), c, 1);
    assertRgbClose(oklchToRgb(rgbToOklch(c)), c, 1);
  }
});

test('known reference conversions match textbook values', () => {
  // Pure red in OKLab: L ≈ 0.627955
  const redOk = rgbToOklch({ r: 255, g: 0, b: 0, a: 1 });
  assert.ok(Math.abs(redOk.l - 0.628) < 0.003);
  assert.ok(Math.abs(redOk.h - 29.23) < 0.5);

  // Pure white in Lab: L = 100, a = 0, b = 0
  const whiteLab = rgbToLab({ r: 255, g: 255, b: 255, a: 1 });
  assert.ok(Math.abs(whiteLab.l - 100) < 0.05);
  assert.ok(Math.abs(whiteLab.a) < 0.05);
  assert.ok(Math.abs(whiteLab.b) < 0.05);

  // Max sRGB chroma for black/white is 0, mid lightness > 0.1
  assert.equal(maxSrgbChromaForOklch(0, 120), 0);
  assert.equal(maxSrgbChromaForOklch(1, 120), 0);
  assert.ok(maxSrgbChromaForOklch(0.65, 260) > 0.12);
});

test('universal color parser handles HEX, RGB, HSL, HSV, HWB, CMYK, OKLCH, Lab, 0x, and named colors', () => {
  assertRgbClose(parseColorString('#3b82f6')!, { r: 59, g: 130, b: 246, a: 1 }, 0);
  assertRgbClose(parseColorString('38f')!, { r: 51, g: 136, b: 255, a: 1 }, 0);
  assert.equal(parseColorString('#ff000080')!.a, 0.502);
  assertRgbClose(parseColorString('0xFF3B82F6')!, { r: 59, g: 130, b: 246, a: 1 }, 0);
  assertRgbClose(parseColorString('rgb(59, 130, 246)')!, { r: 59, g: 130, b: 246, a: 1 }, 0);
  assertRgbClose(parseColorString('rgba(59 130 246 / 50%)')!, { r: 59, g: 130, b: 246, a: 0.5 }, 0);
  assert.equal(parseColorString('rgba(59 130 246 / 50%)')!.a, 0.5);
  assertRgbClose(parseColorString('hsl(217, 91%, 60%)')!, { r: 60, g: 131, b: 246, a: 1 }, 2);
  assertRgbClose(parseColorString('hsv(0, 100%, 100%)')!, { r: 255, g: 0, b: 0, a: 1 }, 0);
  assertRgbClose(parseColorString('hwb(120 0% 0%)')!, { r: 0, g: 255, b: 0, a: 1 }, 0);
  assertRgbClose(parseColorString('cmyk(100%, 0%, 0%, 0%)')!, { r: 0, g: 255, b: 255, a: 1 }, 0);
  assertRgbClose(parseColorString('oklch(62.8% 0.2577 29.23)')!, { r: 255, g: 0, b: 0, a: 1 }, 3);
  assertRgbClose(parseColorString('rebeccapurple')!, { r: 102, g: 51, b: 153, a: 1 }, 0);
  assert.equal(parseColorString('not-a-color'), null);
  assert.equal(parseColorString('#12345'), null);
});

test('HEX shorthand and nearest CSS named color lookup work accurately', () => {
  assert.equal(formatHexShort({ r: 51, g: 136, b: 255, a: 1 }), '#38F');
  assert.equal(formatHexShort({ r: 59, g: 130, b: 246, a: 1 }), null);
  const exact = findNearestNamedColor({ r: 102, g: 51, b: 153, a: 1 });
  assert.equal(exact.name, 'rebeccapurple');
  assert.equal(exact.deltaE, 0);
  assert.ok(deltaE2000(rgbToLab({ r: 0, g: 0, b: 0, a: 1 }), rgbToLab({ r: 255, g: 255, b: 255, a: 1 })) > 95);
  assert.equal(getAllFormats({ r: 59, g: 130, b: 246, a: 1 }).length, 11);
});

test('WCAG 2.1 contrast, APCA Lc, auto-fix accessible shade, and CVD simulation', () => {
  const black: RGBA = { r: 0, g: 0, b: 0, a: 1 };
  const white: RGBA = { r: 255, g: 255, b: 255, a: 1 };
  assert.ok(Math.abs(wcagContrastRatio(black, white) - 21) < 0.01);
  assert.ok(Math.abs(wcagContrastRatio(white, white) - 1) < 0.001);
  assert.ok(apcaContrast(black, white) > 100);
  assert.ok(apcaContrast(white, black) < -100);

  const lowContrastFg: RGBA = { r: 147, g: 197, b: 253, a: 1 };
  const evalBefore = evaluateContrast(lowContrastFg, white);
  assert.equal(evalBefore.aaNormal, false);

  const fixedAA = findAccessibleForeground(lowContrastFg, white, 4.5);
  assert.ok(wcagContrastRatio(fixedAA, white) >= 4.5);

  const fixedAAA = findAccessibleForeground(lowContrastFg, white, 7.0);
  assert.ok(wcagContrastRatio(fixedAAA, white) >= 7.0);

  // Achromatopsia collapses color to grayscale (R == G == B)
  const mono = simulateCvd({ r: 225, g: 29, b: 72, a: 1 }, 'achromatopsia');
  assert.equal(mono.r, mono.g);
  assert.equal(mono.g, mono.b);
});

test('harmonies, OKLCH 50-950 scale, mixer, and palette exports produce expected outputs', () => {
  const base: RGBA = { r: 59, g: 130, b: 246, a: 1 };
  assert.equal(getHarmonyColors(base, 'complementary').length, 2);
  assert.equal(getHarmonyColors(base, 'triadic').length, 3);
  assert.equal(getHarmonyColors(base, 'tetradic').length, 4);

  const scale = generateOklchScale(base);
  assert.equal(scale.length, 11);
  assert.equal(scale[0].label, '50');
  assert.equal(scale[10].label, '950');
  // Lightness decreases monotonically from 50 to 950
  assert.ok(rgbToOklch(scale[0].color).l > rgbToOklch(scale[5].color).l);
  assert.ok(rgbToOklch(scale[5].color).l > rgbToOklch(scale[10].color).l);

  const ramp = buildMixRamp({ r: 255, g: 0, b: 0, a: 1 }, { r: 0, g: 0, b: 255, a: 1 }, 5, 'oklch');
  assert.equal(ramp.length, 5);
  assert.equal(formatHex(ramp[0].color), '#FF0000');
  assert.equal(formatHex(ramp[4].color), '#0000FF');

  const css = exportPalette(scale, 'css', 'ocean');
  assert.ok(css.includes('--ocean-50:'));
  const svg = exportPalette(scale, 'svg', 'ocean');
  assert.ok(svg.startsWith('<svg') && svg.includes('</svg>'));
});

test('image region sampling and dominant color quantization work deterministically', () => {
  // Build a 20x20 synthetic image: top half pure red, bottom half pure teal
  const w = 20;
  const h = 20;
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      if (y < 10) {
        data[idx] = 220; data[idx + 1] = 40; data[idx + 2] = 60; data[idx + 3] = 255;
      } else {
        data[idx] = 20; data[idx + 1] = 170; data[idx + 2] = 160; data[idx + 3] = 255;
      }
    }
  }

  // Exact 1x1 pixel sample in top half
  const topPx = sampleRegionRgba(data, w, h, 5, 3, 1);
  assertRgbClose(topPx, { r: 220, g: 40, b: 60, a: 1 }, 0);

  // 3x3 average across the boundary (y=9 has two red rows + one teal row)
  const borderAvg = sampleRegionRgba(data, w, h, 5, 9, 3);
  assert.ok(borderAvg.r > 120 && borderAvg.r < 180);

  // Dominant color extraction finds both main colors ~50/50
  const dominant = extractDominantColors(data, w, h, 5);
  assert.equal(dominant.length, 2);
  const shares = dominant.map((d) => d.share).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(shares - 1) < 0.01);
});
