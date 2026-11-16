// The colour maps of lib/emsim/colormap.ts, generated (step M1.5). Run `node colormap-gen.mjs` to print the tables;
// check-fields.mjs regenerates them and compares them byte for byte with the stored ones.
//
// - Sequential: a straight line in OKLab (Ottosson 2020) from dark blue oklch(0.27 0.10 265°) to light yellow
//   oklch(0.93 0.14 100°). A straight line has equal OKLab steps by construction and its lightness rises
//   monotonically; the blue–yellow axis is the one that red–green colour-blind viewers keep, as in cividis.
// - Diverging: two straight lines meeting at near white oklch(0.965 0 0), the ends blue oklch(0.45 0.13 255°) and red
//   oklch(0.45 0.15 30°) at the same lightness, so +x and −x are equally strong and told apart by hue.

export function oklabToLinear(L, a, b) {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ ** 3, m = m_ ** 3, s = s_ ** 3;
  return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
}
export function linearToOklab(r, g, b) {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}
export const toSrgb = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
export const fromSrgb = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const lch = (L, C, h) => [L, C * Math.cos((h * Math.PI) / 180), C * Math.sin((h * Math.PI) / 180)];

function line(out, off, n, p, q, inGamut) {
  for (let k = 0; k < n; k++) {
    const t = n === 1 ? 0 : k / (n - 1);
    const lin = oklabToLinear(p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1]), p[2] + t * (q[2] - p[2]));
    for (let c = 0; c < 3; c++) {
      if (lin[c] < -1e-4 || lin[c] > 1 + 1e-4) inGamut.ok = false;
      out[(off + k) * 3 + c] = Math.round(255 * toSrgb(Math.min(1, Math.max(0, lin[c]))));
    }
  }
}

export function generate() {
  const g = { ok: true };
  const sequential = new Uint8Array(256 * 3);
  line(sequential, 0, 256, lch(0.27, 0.1, 265), lch(0.93, 0.14, 100), g);
  const diverging = new Uint8Array(256 * 3);
  const mid = lch(0.965, 0, 0);
  line(diverging, 0, 128, lch(0.45, 0.13, 255), mid, g); // entries 0 … 127: −1 … 0
  line(diverging, 128, 128, mid, lch(0.45, 0.15, 30), g); // 128 … 255: 0 … +1
  return { sequential, diverging, inGamut: g.ok };
}

const hex = (a) => Array.from(a, (v) => v.toString(16).padStart(2, '0')).join('');
if ((process.argv[1] ?? "").endsWith("colormap-gen.mjs")) {
  const { sequential, diverging, inGamut } = generate();
  console.log(`in gamut: ${inGamut}`);
  console.log(`SEQ ${hex(sequential)}`);
  console.log(`DIV ${hex(diverging)}`);
}
