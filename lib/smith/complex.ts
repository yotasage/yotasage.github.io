// Complex arithmetic for the Smith chart's engine, on plain numbers. Nothing here allocates: every function takes its
// operands as (re, im) pairs and writes its result into `out[o]` (real part) and `out[o + 1]` (imaginary part), so
// one Float64Array can hold a scratch value, a node or a whole interleaved trace ([re0, im0, re1, im1, …]). Use
// Float64Array for `out` in hot code (a plain array works, but mixing both at one call site makes it polymorphic).
//
// Infinity: a quotient by 0 is the point at infinity, written (Infinity, 0) (the Riemann sphere has one infinity, the
// open circuit of the chart); 0/0 is NaN. Callers that must never see NaN (convert.ts) handle 0/0 themselves.

export type Vec = Float64Array | number[];

// |a| without overflow or underflow, fast in the usual range.
export function cabs(re: number, im: number): number {
  const s = Math.sqrt(re * re + im * im);
  return s < 1e150 && s > 1e-150 ? s : Math.hypot(re, im);
}

// The angle of a in radians, in (−π, π].
export const carg = (re: number, im: number): number => Math.atan2(im, re);

// out = a + b
export function cadd(out: Vec, o: number, ar: number, ai: number, br: number, bi: number): void {
  out[o] = ar + br;
  out[o + 1] = ai + bi;
}

// out = a − b
export function csub(out: Vec, o: number, ar: number, ai: number, br: number, bi: number): void {
  out[o] = ar - br;
  out[o + 1] = ai - bi;
}

// out = a · b
export function cmul(out: Vec, o: number, ar: number, ai: number, br: number, bi: number): void {
  const re = ar * br - ai * bi;
  out[o + 1] = ar * bi + ai * br;
  out[o] = re;
}

// out = a / b by Smith's method (no overflow of |b|²). b = 0: (Infinity, 0) for a ≠ 0, NaN for a = 0.
export function cdiv(out: Vec, o: number, ar: number, ai: number, br: number, bi: number): void {
  if (br === 0 && bi === 0) {
    if (ar === 0 && ai === 0) { out[o] = NaN; out[o + 1] = NaN; } else { out[o] = Infinity; out[o + 1] = 0; }
    return;
  }
  let re: number, im: number;
  if (Math.abs(br) >= Math.abs(bi)) {
    const t = bi / br, d = br + bi * t;
    re = (ar + ai * t) / d;
    im = (ai - ar * t) / d;
  } else {
    const t = br / bi, d = br * t + bi;
    re = (ar * t + ai) / d;
    im = (ai * t - ar) / d;
  }
  out[o] = re;
  out[o + 1] = im;
}

// out = 1 / a. 1/0 = (Infinity, 0); 1/∞ = 0 (an infinite part in either component).
export function cinv(out: Vec, o: number, re: number, im: number): void {
  if (re === 0 && im === 0) { out[o] = Infinity; out[o + 1] = 0; return; }
  if (Math.abs(re) === Infinity || Math.abs(im) === Infinity) { out[o] = 0; out[o + 1] = 0; return; }
  let r: number, i: number;
  if (Math.abs(re) >= Math.abs(im)) {
    const t = im / re, d = re + im * t;
    r = 1 / d;
    i = -t / d;
  } else {
    const t = re / im, d = re * t + im;
    r = t / d;
    i = -1 / d;
  }
  if (Math.abs(r) === Infinity || Math.abs(i) === Infinity) { r = Infinity; i = 0; }
  out[o] = r;
  out[o + 1] = i;
}

// out = s · a for a real s
export function cscale(out: Vec, o: number, re: number, im: number, s: number): void {
  out[o] = re * s;
  out[o + 1] = im * s;
}

// out = e^{jθ}
export function cexpj(out: Vec, o: number, theta: number): void {
  out[o] = Math.cos(theta);
  out[o + 1] = Math.sin(theta);
}

// out = a · e^{jθ}: a turned by θ radians (counter-clockwise for θ > 0).
export function crotate(out: Vec, o: number, re: number, im: number, theta: number): void {
  const c = Math.cos(theta), s = Math.sin(theta);
  out[o] = re * c - im * s;
  out[o + 1] = re * s + im * c;
}

// out = √a, the principal root (real part ≥ 0; on the negative real axis +j√|a|). Stable for all finite a.
export function csqrt(out: Vec, o: number, re: number, im: number): void {
  if (re === 0 && im === 0) { out[o] = 0; out[o + 1] = im; return; }
  const m = cabs(re, im);
  if (re >= 0) {
    const t = Math.sqrt(0.5 * (m + re));
    out[o] = t;
    out[o + 1] = im / (2 * t);
  } else {
    const t = Math.sqrt(0.5 * (m - re));
    out[o] = Math.abs(im) / (2 * t);
    out[o + 1] = im < 0 || Object.is(im, -0) ? -t : t;
  }
}

// Interleaved arrays of n values: out[k] = a[k] · b[k]. `out` may be `a` or `b`.
export function cmulN(out: Vec, a: Vec, b: Vec, n: number): void {
  for (let k = 0, i = 0; k < n; k++, i += 2) cmul(out, i, a[i], a[i + 1], b[i], b[i + 1]);
}

// Interleaved arrays of n values: out[k] = a[k] / b[k]. `out` may be `a` or `b`.
export function cdivN(out: Vec, a: Vec, b: Vec, n: number): void {
  for (let k = 0, i = 0; k < n; k++, i += 2) cdiv(out, i, a[i], a[i + 1], b[i], b[i + 1]);
}

// Interleaved array of n values: mag[k] = |a[k]|.
export function cabsN(mag: Vec, a: Vec, n: number): void {
  for (let k = 0, i = 0; k < n; k++, i += 2) mag[k] = cabs(a[i], a[i + 1]);
}
