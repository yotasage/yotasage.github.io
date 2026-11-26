import {
  clamp,
  linearToSrgbChannel,
  normalizeRgba,
  oklchToRgb,
  rgbToOklch,
  srgbChannelToLinear,
} from './convert';
import type { ContrastResult, CvdKind, RGBA } from './types';

/** Composites foreground RGBA over an opaque background RGB. */
export function compositeOver(fg: RGBA, bg: RGBA): RGBA {
  const a = clamp(fg.a, 0, 1);
  if (a >= 0.9995) return { r: fg.r, g: fg.g, b: fg.b, a: 1 };
  return normalizeRgba({
    r: fg.r * a + bg.r * (1 - a),
    g: fg.g * a + bg.g * (1 - a),
    b: fg.b * a + bg.b * (1 - a),
    a: 1,
  });
}

/** WCAG 2.1 relative luminance (0..1). */
export function relativeLuminance(c: RGBA): number {
  const r = srgbChannelToLinear(c.r);
  const g = srgbChannelToLinear(c.g);
  const b = srgbChannelToLinear(c.b);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2.1 contrast ratio (1..21). */
export function wcagContrastRatio(fg: RGBA, bg: RGBA): number {
  const bgOpaque: RGBA = { r: bg.r, g: bg.g, b: bg.b, a: 1 };
  const fgComp = compositeOver(fg, bgOpaque);
  const l1 = relativeLuminance(fgComp);
  const l2 = relativeLuminance(bgOpaque);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * APCA W3 0.0.98G-4g perceptual lightness contrast (Lc, approx -108..+106).
 * Positive Lc = dark text on light background; negative Lc = light text on dark background.
 */
export function apcaContrast(fg: RGBA, bg: RGBA): number {
  const bgOpaque: RGBA = { r: bg.r, g: bg.g, b: bg.b, a: 1 };
  const fgComp = compositeOver(fg, bgOpaque);

  const yFromRgb = (c: RGBA) =>
    0.2126729 * Math.pow(clamp(c.r, 0, 255) / 255, 2.4) +
    0.7151522 * Math.pow(clamp(c.g, 0, 255) / 255, 2.4) +
    0.072175 * Math.pow(clamp(c.b, 0, 255) / 255, 2.4);

  let yTxt = yFromRgb(fgComp);
  let yBg = yFromRgb(bgOpaque);

  // Soft black clamp
  if (yTxt < 0.022) yTxt += Math.pow(0.022 - yTxt, 1.414);
  if (yBg < 0.022) yBg += Math.pow(0.022 - yBg, 1.414);

  if (Math.abs(yBg - yTxt) < 0.0005) return 0;

  let sapc = 0;
  let output = 0;
  if (yBg > yTxt) {
    sapc = (Math.pow(yBg, 0.56) - Math.pow(yTxt, 0.57)) * 1.14;
    output = sapc < 0.1 ? 0 : (sapc - 0.027) * 100;
  } else {
    sapc = (Math.pow(yBg, 0.65) - Math.pow(yTxt, 0.62)) * 1.14;
    output = sapc > -0.1 ? 0 : (sapc + 0.027) * 100;
  }
  return Math.round(output * 10) / 10;
}

export function evaluateContrast(fg: RGBA, bg: RGBA): ContrastResult {
  const ratio = wcagContrastRatio(fg, bg);
  const apcaLc = apcaContrast(fg, bg);
  const absLc = Math.abs(apcaLc);

  let apcaLevel: ContrastResult['apcaLevel'] = 'fail';
  if (absLc >= 90) apcaLevel = 'fluent';
  else if (absLc >= 75) apcaLevel = 'body';
  else if (absLc >= 60) apcaLevel = 'large';
  else if (absLc >= 45) apcaLevel = 'spot';

  return {
    ratio,
    aaNormal: ratio >= 4.5,
    aaLarge: ratio >= 3.0,
    aaaNormal: ratio >= 7.0,
    aaaLarge: ratio >= 4.5,
    aaUi: ratio >= 3.0,
    apcaLc,
    apcaLevel,
  };
}

/**
 * Adjusts OKLCH lightness (preserving hue and relative chroma) to find the closest
 * foreground color that satisfies the requested WCAG contrast ratio against `bg`.
 */
export function findAccessibleForeground(fg: RGBA, bg: RGBA, targetRatio: number): RGBA {
  if (wcagContrastRatio(fg, bg) >= targetRatio) return fg;
  const ok = rgbToOklch(fg);

  const searchDir = (dark: boolean): RGBA | null => {
    let lo = dark ? 0 : ok.l;
    let hi = dark ? ok.l : 1;
    const extreme = oklchToRgb({ l: dark ? 0 : 1, c: 0, h: ok.h }, 1);
    if (wcagContrastRatio(extreme, bg) < targetRatio) return null;

    let best = extreme;
    for (let i = 0; i < 18; i++) {
      const mid = (lo + hi) * 0.5;
      const cand = oklchToRgb({ l: mid, c: ok.c, h: ok.h }, 1);
      if (wcagContrastRatio(cand, bg) >= targetRatio) {
        best = cand;
        if (dark) lo = mid;
        else hi = mid;
      } else {
        if (dark) hi = mid;
        else lo = mid;
      }
    }
    return best;
  };

  const darker = searchDir(true);
  const lighter = searchDir(false);

  if (darker && lighter) {
    const dDark = Math.abs(rgbToOklch(darker).l - ok.l);
    const dLight = Math.abs(rgbToOklch(lighter).l - ok.l);
    return dDark <= dLight ? darker : lighter;
  }
  return darker ?? lighter ?? (relativeLuminance(bg) > 0.5 ? { r: 0, g: 0, b: 0, a: 1 } : { r: 255, g: 255, b: 255, a: 1 });
}

/** Picks readable black or white ink on top of an arbitrary swatch color. */
export function pickReadableInk(bg: RGBA): '#0f172a' | '#ffffff' {
  const darkInk: RGBA = { r: 15, g: 23, b: 42, a: 1 };
  const lightInk: RGBA = { r: 255, g: 255, b: 255, a: 1 };
  return wcagContrastRatio(darkInk, bg) >= wcagContrastRatio(lightInk, bg) ? '#0f172a' : '#ffffff';
}

// ---------------------------------------------------------------------------
// Color Vision Deficiency (CVD) Simulation — Linear sRGB Viénot / Brettel matrices
// ---------------------------------------------------------------------------

const CVD_MATRICES: Record<CvdKind, readonly [number, number, number, number, number, number, number, number, number]> = {
  // Viénot 1999 linear sRGB dichromacy matrices
  protanopia: [
    0.152286, 1.052583, -0.204868,
    0.114503, 0.786281, 0.099216,
    -0.003882, -0.048116, 1.051998,
  ],
  deuteranopia: [
    0.367322, 0.860646, -0.227968,
    0.280085, 0.672501, 0.047413,
    -0.01182, 0.04294, 0.968881,
  ],
  // Brettel/Machado-calibrated linear tritanopia approximation
  tritanopia: [
    1.255528, -0.076749, -0.178779,
    -0.078411, 0.930809, 0.147602,
    0.004733, 0.691367, 0.3039,
  ],
  achromatopsia: [
    0.2126, 0.7152, 0.0722,
    0.2126, 0.7152, 0.0722,
    0.2126, 0.7152, 0.0722,
  ],
};

export function simulateCvd(c: RGBA, kind: CvdKind): RGBA {
  const m = CVD_MATRICES[kind];
  const r = srgbChannelToLinear(c.r);
  const g = srgbChannelToLinear(c.g);
  const b = srgbChannelToLinear(c.b);

  const nr = m[0] * r + m[1] * g + m[2] * b;
  const ng = m[3] * r + m[4] * g + m[5] * b;
  const nb = m[6] * r + m[7] * g + m[8] * b;

  return normalizeRgba({
    r: linearToSrgbChannel(nr),
    g: linearToSrgbChannel(ng),
    b: linearToSrgbChannel(nb),
    a: c.a,
  });
}
