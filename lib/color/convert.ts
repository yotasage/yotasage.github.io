import type {
  CMYK,
  HSL,
  HSV,
  HWB,
  Lab,
  LCH,
  NamedColorMatch,
  OKLab,
  OKLCH,
  RGBA,
  XYZ,
} from './types';

export function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

export function clampByte(value: number): number {
  return Math.round(clamp(value, 0, 255));
}

export function normalizeHue(h: number): number {
  if (!Number.isFinite(h)) return 0;
  const mod = h % 360;
  return mod < 0 ? mod + 360 : mod;
}

export function normalizeRgba(c: RGBA): RGBA {
  return {
    r: clampByte(c.r),
    g: clampByte(c.g),
    b: clampByte(c.b),
    a: Math.round(clamp(c.a, 0, 1) * 1000) / 1000,
  };
}

// ---------------------------------------------------------------------------
// sRGB <-> Linear sRGB
// ---------------------------------------------------------------------------

export function srgbChannelToLinear(c8: number): number {
  const c = clamp(c8, 0, 255) / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

export function linearToSrgbChannel(lin: number): number {
  const c = clamp(lin, 0, 1);
  const v = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  return clampByte(v * 255);
}

// ---------------------------------------------------------------------------
// RGB <-> HSV
// ---------------------------------------------------------------------------

export function rgbToHsv(c: RGBA): HSV {
  const r = clamp(c.r, 0, 255) / 255;
  const g = clamp(c.g, 0, 255) / 255;
  const b = clamp(c.b, 0, 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;

  let h = 0;
  if (d > 1e-7) {
    if (max === r) h = 60 * (((g - b) / d) % 6);
    else if (max === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
  }
  const s = max <= 1e-7 ? 0 : (d / max) * 100;
  const v = max * 100;

  return { h: normalizeHue(h), s, v };
}

export function hsvToRgb(hsv: HSV, a = 1): RGBA {
  const h = normalizeHue(hsv.h);
  const s = clamp(hsv.s, 0, 100) / 100;
  const v = clamp(hsv.v, 0, 100) / 100;
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

  return normalizeRgba({
    r: (r1 + m) * 255,
    g: (g1 + m) * 255,
    b: (b1 + m) * 255,
    a,
  });
}

// ---------------------------------------------------------------------------
// RGB <-> HSL
// ---------------------------------------------------------------------------

export function rgbToHsl(c: RGBA): HSL {
  const r = clamp(c.r, 0, 255) / 255;
  const g = clamp(c.g, 0, 255) / 255;
  const b = clamp(c.b, 0, 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  const l = (max + min) / 2;

  let h = 0;
  let s = 0;
  if (d > 1e-7) {
    s = d / (1 - Math.abs(2 * l - 1));
    if (max === r) h = 60 * (((g - b) / d) % 6);
    else if (max === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
  }

  return { h: normalizeHue(h), s: s * 100, l: l * 100 };
}

export function hslToRgb(hsl: HSL, a = 1): RGBA {
  const h = normalizeHue(hsl.h);
  const s = clamp(hsl.s, 0, 100) / 100;
  const l = clamp(hsl.l, 0, 100) / 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;

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

  return normalizeRgba({
    r: (r1 + m) * 255,
    g: (g1 + m) * 255,
    b: (b1 + m) * 255,
    a,
  });
}

// ---------------------------------------------------------------------------
// RGB <-> HWB (CSS Color 4)
// ---------------------------------------------------------------------------

export function rgbToHwb(c: RGBA): HWB {
  const r = clamp(c.r, 0, 255) / 255;
  const g = clamp(c.g, 0, 255) / 255;
  const b = clamp(c.b, 0, 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const { h } = rgbToHsv(c);
  return {
    h,
    w: min * 100,
    b: (1 - max) * 100,
  };
}

export function hwbToRgb(hwb: HWB, a = 1): RGBA {
  const h = normalizeHue(hwb.h);
  let w = clamp(hwb.w, 0, 100) / 100;
  let bl = clamp(hwb.b, 0, 100) / 100;
  if (w + bl >= 1) {
    const gray = (w / (w + bl)) * 255;
    return normalizeRgba({ r: gray, g: gray, b: gray, a });
  }
  const pure = hsvToRgb({ h, s: 100, v: 100 }, a);
  const scale = 1 - w - bl;
  return normalizeRgba({
    r: (pure.r / 255 * scale + w) * 255,
    g: (pure.g / 255 * scale + w) * 255,
    b: (pure.b / 255 * scale + w) * 255,
    a,
  });
}

// ---------------------------------------------------------------------------
// RGB <-> CMYK (Device-independent naive conversion)
// ---------------------------------------------------------------------------

export function rgbToCmyk(c: RGBA): CMYK {
  const r = clamp(c.r, 0, 255) / 255;
  const g = clamp(c.g, 0, 255) / 255;
  const b = clamp(c.b, 0, 255) / 255;
  const k = 1 - Math.max(r, g, b);
  if (k >= 1 - 1e-7) {
    return { c: 0, m: 0, y: 0, k: 100 };
  }
  const inv = 1 - k;
  return {
    c: ((1 - r - k) / inv) * 100,
    m: ((1 - g - k) / inv) * 100,
    y: ((1 - b - k) / inv) * 100,
    k: k * 100,
  };
}

export function cmykToRgb(cmyk: CMYK, a = 1): RGBA {
  const c = clamp(cmyk.c, 0, 100) / 100;
  const m = clamp(cmyk.m, 0, 100) / 100;
  const y = clamp(cmyk.y, 0, 100) / 100;
  const k = clamp(cmyk.k, 0, 100) / 100;
  return normalizeRgba({
    r: 255 * (1 - c) * (1 - k),
    g: 255 * (1 - m) * (1 - k),
    b: 255 * (1 - y) * (1 - k),
    a,
  });
}

// ---------------------------------------------------------------------------
// sRGB <-> CIE XYZ (D65) <-> CIE Lab <-> CIE LCH
// ---------------------------------------------------------------------------

const D65_X = 0.95047;
const D65_Y = 1.0;
const D65_Z = 1.08883;
const LAB_EPS = 216 / 24389;
const LAB_KAPPA = 24389 / 27;

export function rgbToXyz(c: RGBA): XYZ {
  const r = srgbChannelToLinear(c.r);
  const g = srgbChannelToLinear(c.g);
  const b = srgbChannelToLinear(c.b);
  return {
    x: 0.4124564 * r + 0.3575761 * g + 0.1804375 * b,
    y: 0.2126729 * r + 0.7151522 * g + 0.072175 * b,
    z: 0.0193339 * r + 0.119192 * g + 0.9503041 * b,
  };
}

export function xyzToRgb(xyz: XYZ, a = 1): RGBA {
  const rl = 3.2404542 * xyz.x - 1.5371385 * xyz.y - 0.4985314 * xyz.z;
  const gl = -0.969266 * xyz.x + 1.8760108 * xyz.y + 0.041556 * xyz.z;
  const bl = 0.0556434 * xyz.x - 0.2040259 * xyz.y + 1.0572252 * xyz.z;
  return normalizeRgba({
    r: linearToSrgbChannel(rl),
    g: linearToSrgbChannel(gl),
    b: linearToSrgbChannel(bl),
    a,
  });
}

function labF(t: number): number {
  return t > LAB_EPS ? Math.cbrt(t) : (LAB_KAPPA * t + 16) / 116;
}

function labFInv(f: number): number {
  const f3 = f * f * f;
  return f3 > LAB_EPS ? f3 : (116 * f - 16) / LAB_KAPPA;
}

export function rgbToLab(c: RGBA): Lab {
  const xyz = rgbToXyz(c);
  const fx = labF(xyz.x / D65_X);
  const fy = labF(xyz.y / D65_Y);
  const fz = labF(xyz.z / D65_Z);
  return {
    l: 116 * fy - 16,
    a: 500 * (fx - fy),
    b: 200 * (fy - fz),
  };
}

export function labToRgb(lab: Lab, a = 1): RGBA {
  const fy = (lab.l + 16) / 116;
  const fx = fy + lab.a / 500;
  const fz = fy - lab.b / 200;
  const xyz: XYZ = {
    x: D65_X * labFInv(fx),
    y: D65_Y * labFInv(fy),
    z: D65_Z * labFInv(fz),
  };
  return xyzToRgb(xyz, a);
}

export function labToLch(lab: Lab): LCH {
  const c = Math.hypot(lab.a, lab.b);
  const h = c < 1e-5 ? 0 : normalizeHue((Math.atan2(lab.b, lab.a) * 180) / Math.PI);
  return { l: lab.l, c, h };
}

export function lchToLab(lch: LCH): Lab {
  const rad = (normalizeHue(lch.h) * Math.PI) / 180;
  return {
    l: lch.l,
    a: lch.c * Math.cos(rad),
    b: lch.c * Math.sin(rad),
  };
}

export function rgbToLch(c: RGBA): LCH {
  return labToLch(rgbToLab(c));
}

export function lchToRgb(lch: LCH, a = 1): RGBA {
  return labToRgb(lchToLab(lch), a);
}

// ---------------------------------------------------------------------------
// sRGB <-> OKLab <-> OKLCH (Björn Ottosson exact matrices)
// ---------------------------------------------------------------------------

export function rgbToOklab(c: RGBA): OKLab {
  const r = srgbChannelToLinear(c.r);
  const g = srgbChannelToLinear(c.g);
  const b = srgbChannelToLinear(c.b);

  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;

  const l_ = Math.cbrt(l);
  const m_ = Math.cbrt(m);
  const s_ = Math.cbrt(s);

  return {
    l: 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_,
    a: 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_,
    b: 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_,
  };
}

export function oklabToLinearRgb(ok: OKLab): { r: number; g: number; b: number } {
  const l_ = ok.l + 0.3963377774 * ok.a + 0.2158037573 * ok.b;
  const m_ = ok.l - 0.1055613458 * ok.a - 0.0638541728 * ok.b;
  const s_ = ok.l - 0.0894841775 * ok.a - 1.291485548 * ok.b;

  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;

  return {
    r: +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    g: -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    b: -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  };
}

export function isLinearInSrgbGamut(lin: { r: number; g: number; b: number }, tol = 1e-4): boolean {
  return (
    lin.r >= -tol &&
    lin.r <= 1 + tol &&
    lin.g >= -tol &&
    lin.g <= 1 + tol &&
    lin.b >= -tol &&
    lin.b <= 1 + tol
  );
}

export function oklabToRgb(ok: OKLab, a = 1): RGBA {
  const lin = oklabToLinearRgb(ok);
  return normalizeRgba({
    r: linearToSrgbChannel(lin.r),
    g: linearToSrgbChannel(lin.g),
    b: linearToSrgbChannel(lin.b),
    a,
  });
}

export function oklabToOklch(ok: OKLab): OKLCH {
  const c = Math.hypot(ok.a, ok.b);
  const h = c < 1e-5 ? 0 : normalizeHue((Math.atan2(ok.b, ok.a) * 180) / Math.PI);
  return { l: ok.l, c, h };
}

export function oklchToOklab(lch: OKLCH): OKLab {
  const rad = (normalizeHue(lch.h) * Math.PI) / 180;
  return {
    l: lch.l,
    a: lch.c * Math.cos(rad),
    b: lch.c * Math.sin(rad),
  };
}

export function rgbToOklch(c: RGBA): OKLCH {
  return oklabToOklch(rgbToOklab(c));
}

/** Finds maximum in-gamut sRGB chroma for a given OKLCH lightness and hue via binary search. */
export function maxSrgbChromaForOklch(l: number, h: number): number {
  const lc = clamp(l, 0, 1);
  if (lc <= 0.0001 || lc >= 0.9999) return 0;
  const rad = (normalizeHue(h) * Math.PI) / 180;
  const cosH = Math.cos(rad);
  const sinH = Math.sin(rad);
  let lo = 0;
  let hi = 0.4;
  for (let i = 0; i < 18; i++) {
    const mid = (lo + hi) * 0.5;
    const lin = oklabToLinearRgb({ l: lc, a: mid * cosH, b: mid * sinH });
    if (isLinearInSrgbGamut(lin, 1e-5)) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return lo;
}

/** Converts OKLCH to sRGB, mapping out-of-gamut chroma smoothly along constant (L, H). */
export function oklchToRgb(lch: OKLCH, a = 1): RGBA {
  const l = clamp(lch.l, 0, 1);
  const c = Math.max(0, lch.c);
  const h = normalizeHue(lch.h);
  const directLin = oklabToLinearRgb(oklchToOklab({ l, c, h }));
  if (isLinearInSrgbGamut(directLin, 1e-4)) {
    return normalizeRgba({
      r: linearToSrgbChannel(directLin.r),
      g: linearToSrgbChannel(directLin.g),
      b: linearToSrgbChannel(directLin.b),
      a,
    });
  }
  const maxC = maxSrgbChromaForOklch(l, h);
  return oklabToRgb(oklchToOklab({ l, c: Math.min(c, maxC), h }), a);
}

export function isOklchInSrgbGamut(lch: OKLCH): boolean {
  if (lch.l < 0 || lch.l > 1 || lch.c < 0) return false;
  return isLinearInSrgbGamut(oklabToLinearRgb(oklchToOklab(lch)), 1e-4);
}

// ---------------------------------------------------------------------------
// CIE Delta E 2000 (perceptual color difference)
// ---------------------------------------------------------------------------

export function deltaE2000(lab1: Lab, lab2: Lab): number {
  const rad = Math.PI / 180;
  const deg = 180 / Math.PI;
  const c1 = Math.hypot(lab1.a, lab1.b);
  const c2 = Math.hypot(lab2.a, lab2.b);
  const cBar = (c1 + c2) * 0.5;
  const cBar7 = Math.pow(cBar, 7);
  const g = 0.5 * (1 - Math.sqrt(cBar7 / (cBar7 + Math.pow(25, 7))));

  const a1p = (1 + g) * lab1.a;
  const a2p = (1 + g) * lab2.a;
  const c1p = Math.hypot(a1p, lab1.b);
  const c2p = Math.hypot(a2p, lab2.b);

  const h1p = c1p === 0 ? 0 : normalizeHue(Math.atan2(lab1.b, a1p) * deg);
  const h2p = c2p === 0 ? 0 : normalizeHue(Math.atan2(lab2.b, a2p) * deg);

  const dLp = lab2.l - lab1.l;
  const dCp = c2p - c1p;

  let dhp = 0;
  if (c1p * c2p !== 0) {
    const diff = h2p - h1p;
    if (Math.abs(diff) <= 180) dhp = diff;
    else if (diff > 180) dhp = diff - 360;
    else dhp = diff + 360;
  }
  const dHp = 2 * Math.sqrt(c1p * c2p) * Math.sin((dhp * 0.5) * rad);

  const lBarP = (lab1.l + lab2.l) * 0.5;
  const cBarP = (c1p + c2p) * 0.5;

  let hBarP = h1p + h2p;
  if (c1p * c2p !== 0) {
    if (Math.abs(h1p - h2p) <= 180) hBarP = (h1p + h2p) * 0.5;
    else if (h1p + h2p < 360) hBarP = (h1p + h2p + 360) * 0.5;
    else hBarP = (h1p + h2p - 360) * 0.5;
  }

  const t =
    1 -
    0.17 * Math.cos((hBarP - 30) * rad) +
    0.24 * Math.cos(2 * hBarP * rad) +
    0.32 * Math.cos((3 * hBarP + 6) * rad) -
    0.2 * Math.cos((4 * hBarP - 63) * rad);

  const dTheta = 30 * Math.exp(-Math.pow((hBarP - 275) / 25, 2));
  const cBarP7 = Math.pow(cBarP, 7);
  const rC = 2 * Math.sqrt(cBarP7 / (cBarP7 + Math.pow(25, 7)));
  const l50Sq = Math.pow(lBarP - 50, 2);
  const sL = 1 + (0.015 * l50Sq) / Math.sqrt(20 + l50Sq);
  const sC = 1 + 0.045 * cBarP;
  const sH = 1 + 0.015 * cBarP * t;
  const rT = -Math.sin(2 * dTheta * rad) * rC;

  const termL = dLp / sL;
  const termC = dCp / sC;
  const termH = dHp / sH;

  return Math.sqrt(termL * termL + termC * termC + termH * termH + rT * termC * termH);
}

// ---------------------------------------------------------------------------
// CSS Color 4 Named Colors (148 standard names)
// ---------------------------------------------------------------------------

export const CSS_NAMED_COLORS: Readonly<Record<string, string>> = {
  aliceblue: '#f0f8ff', antiquewhite: '#faebd7', aqua: '#00ffff', aquamarine: '#7fffd4',
  azure: '#f0ffff', beige: '#f5f5dc', bisque: '#ffe4c4', black: '#000000',
  blanchedalmond: '#ffebcd', blue: '#0000ff', blueviolet: '#8a2be2', brown: '#a52a2a',
  burlywood: '#deb887', cadetblue: '#5f9ea0', chartreuse: '#7fff00', chocolate: '#d2691e',
  coral: '#ff7f50', cornflowerblue: '#6495ed', cornsilk: '#fff8dc', crimson: '#dc143c',
  cyan: '#00ffff', darkblue: '#00008b', darkcyan: '#008b8b', darkgoldenrod: '#b8860b',
  darkgray: '#a9a9a9', darkgreen: '#006400', darkgrey: '#a9a9a9', darkkhaki: '#bdb76b',
  darkmagenta: '#8b008b', darkolivegreen: '#556b2f', darkorange: '#ff8c00', darkorchid: '#9932cc',
  darkred: '#8b0000', darksalmon: '#e9967a', darkseagreen: '#8fbc8f', darkslateblue: '#483d8b',
  darkslategray: '#2f4f4f', darkslategrey: '#2f4f4f', darkturquoise: '#00ced1', darkviolet: '#9400d3',
  deeppink: '#ff1493', deepskyblue: '#00bfff', dimgray: '#696969', dimgrey: '#696969',
  dodgerblue: '#1e90ff', firebrick: '#b22222', floralwhite: '#fffaf0', forestgreen: '#228b22',
  fuchsia: '#ff00ff', gainsboro: '#dcdcdc', ghostwhite: '#f8f8ff', gold: '#ffd700',
  goldenrod: '#daa520', gray: '#808080', green: '#008000', greenyellow: '#adff2f',
  grey: '#808080', honeydew: '#f0fff0', hotpink: '#ff69b4', indianred: '#cd5c5c',
  indigo: '#4b0082', ivory: '#fffff0', khaki: '#f0e68c', lavender: '#e6e6fa',
  lavenderblush: '#fff0f5', lawngreen: '#7cfc00', lemonchiffon: '#fffacd', lightblue: '#add8e6',
  lightcoral: '#f08080', lightcyan: '#e0ffff', lightgoldenrodyellow: '#fafad2', lightgray: '#d3d3d3',
  lightgreen: '#90ee90', lightgrey: '#d3d3d3', lightpink: '#ffb6c1', lightsalmon: '#ffa07a',
  lightseagreen: '#20b2aa', lightskyblue: '#87cefa', lightslategray: '#778899', lightslategrey: '#778899',
  lightsteelblue: '#b0c4de', lightyellow: '#ffffe0', lime: '#00ff00', limegreen: '#32cd32',
  linen: '#faf0e6', magenta: '#ff00ff', maroon: '#800000', mediumaquamarine: '#66cdaa',
  mediumblue: '#0000cd', mediumorchid: '#ba55d3', mediumpurple: '#9370db', mediumseagreen: '#3cb371',
  mediumslateblue: '#7b68ee', mediumspringgreen: '#00fa9a', mediumturquoise: '#48d1cc', mediumvioletred: '#c71585',
  midnightblue: '#191970', mintcream: '#f5fffa', mistyrose: '#ffe4e1', moccasin: '#ffe4b5',
  navajowhite: '#ffdead', navy: '#000080', oldlace: '#fdf5e6', olive: '#808000',
  olivedrab: '#6b8e23', orange: '#ffa500', orangered: '#ff4500', orchid: '#da70d6',
  palegoldenrod: '#eee8aa', palegreen: '#98fb98', paleturquoise: '#afeeee', palevioletred: '#db7093',
  papayawhip: '#ffefd5', peachpuff: '#ffdab9', peru: '#cd853f', pink: '#ffc0cb',
  plum: '#dda0dd', powderblue: '#b0e0e6', purple: '#800080', rebeccapurple: '#663399',
  red: '#ff0000', rosybrown: '#bc8f8f', royalblue: '#4169e1', saddlebrown: '#8b4513',
  salmon: '#fa8072', sandybrown: '#f4a460', seagreen: '#2e8b57', seashell: '#fff5ee',
  sienna: '#a0522d', silver: '#c0c0c0', skyblue: '#87ceeb', slateblue: '#6a5acd',
  slategray: '#708090', slategrey: '#708090', snow: '#fffafa', springgreen: '#00ff7f',
  steelblue: '#4682b4', tan: '#d2b48c', teal: '#008080', thistle: '#d8bfd8',
  tomato: '#ff6347', turquoise: '#40e0d0', violet: '#ee82ee', wheat: '#f5deb3',
  white: '#ffffff', whitesmoke: '#f5f5f5', yellow: '#ffff00', yellowgreen: '#9acd32',
};

interface CachedNamedEntry {
  name: string;
  hex: string;
  rgb: RGBA;
  lab: Lab;
}

let cachedNamedEntries: CachedNamedEntry[] | null = null;

function getNamedEntries(): CachedNamedEntry[] {
  if (cachedNamedEntries) return cachedNamedEntries;
  const entries: CachedNamedEntry[] = [];
  const seenHex = new Set<string>();
  for (const [name, hex] of Object.entries(CSS_NAMED_COLORS)) {
    // Skip duplicate spelling aliases (grey/cyan/magenta) so nearest lookup is canonical
    if (seenHex.has(hex)) continue;
    seenHex.add(hex);
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const rgb: RGBA = { r, g, b, a: 1 };
    entries.push({ name, hex: hex.toUpperCase(), rgb, lab: rgbToLab(rgb) });
  }
  cachedNamedEntries = entries;
  return entries;
}

export function findNearestNamedColor(c: RGBA): NamedColorMatch {
  const targetLab = rgbToLab(c);
  const entries = getNamedEntries();
  let best = entries[0];
  let bestDist = Infinity;
  for (const entry of entries) {
    const d = deltaE2000(targetLab, entry.lab);
    if (d < bestDist) {
      bestDist = d;
      best = entry;
      if (d === 0) break;
    }
  }
  return {
    name: best.name,
    hex: best.hex,
    rgb: best.rgb,
    deltaE: bestDist,
  };
}
