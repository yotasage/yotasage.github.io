// High-precision Float64 FFT engine:
// - Iterative Cooley-Tukey radix-2 FFT with exact cos/sin twiddles (no recurrence drift)
// - Bluestein's chirp-z algorithm for arbitrary N (primes, odd, composites)
// - Real-input convenience helper, inverse FFT, Goertzel single-frequency DFT, and Zoom FFT (CZT)
// - Naive O(N^2) reference DFT for unit-test verification.

const TWO_PI = 2 * Math.PI;

/** Returns true if n is a positive power of two. */
export function isPowerOfTwo(n: number): boolean {
  return n > 0 && (n & (n - 1)) === 0;
}

/** Smallest power of two >= n. */
export function nextPow2(n: number): number {
  if (n <= 1) return 1;
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

/** Cached twiddle tables for power-of-two FFT sizes to accelerate repeated transforms and Welch segments. */
interface TwiddleCacheEntry {
  cos: Float64Array;
  sin: Float64Array;
  bitRev: Uint32Array;
}

const twiddleCache = new Map<number, TwiddleCacheEntry>();

function getRadix2Tables(n: number): TwiddleCacheEntry {
  const cached = twiddleCache.get(n);
  if (cached) return cached;

  const half = n >>> 1;
  const cos = new Float64Array(half);
  const sin = new Float64Array(half);
  const step = TWO_PI / n;
  for (let k = 0; k < half; k++) {
    const angle = step * k;
    cos[k] = Math.cos(angle);
    sin[k] = Math.sin(angle);
  }

  const bits = Math.round(Math.log2(n));
  const bitRev = new Uint32Array(n);
  for (let i = 0; i < n; i++) {
    let x = i;
    let r = 0;
    for (let b = 0; b < bits; b++) {
      r = (r << 1) | (x & 1);
      x >>>= 1;
    }
    bitRev[i] = r;
  }

  const entry: TwiddleCacheEntry = { cos, sin, bitRev };
  if (twiddleCache.size > 16) {
    const firstKey = twiddleCache.keys().next().value;
    if (firstKey !== undefined) twiddleCache.delete(firstKey);
  }
  twiddleCache.set(n, entry);
  return entry;
}

/**
 * In-place iterative radix-2 complex FFT (forward or inverse).
 * When inverse=true, computes the unnormalized sum with +j*2*pi*k*n/N and divides by N.
 */
export function fftRadix2InPlace(
  re: Float64Array,
  im: Float64Array,
  inverse = false,
): void {
  const n = re.length;
  if (n <= 1) return;
  if (!isPowerOfTwo(n)) {
    throw new Error(`fftRadix2InPlace requires power-of-two length, got ${n}`);
  }

  const { cos, sin, bitRev } = getRadix2Tables(n);

  for (let i = 0; i < n; i++) {
    const j = bitRev[i];
    if (j > i) {
      const tr = re[i];
      const ti = im[i];
      re[i] = re[j];
      im[i] = im[j];
      re[j] = tr;
      im[j] = ti;
    }
  }

  const sign = inverse ? 1 : -1;

  for (let size = 2; size <= n; size <<= 1) {
    const half = size >>> 1;
    const stride = n / size;
    for (let start = 0; start < n; start += size) {
      for (let k = 0; k < half; k++) {
        const idx = k * stride;
        const wr = cos[idx];
        const wi = sign * sin[idx];
        const even = start + k;
        const odd = even + half;
        const or = re[odd];
        const oi = im[odd];
        const tr = wr * or - wi * oi;
        const ti = wr * oi + wi * or;
        re[odd] = re[even] - tr;
        im[odd] = im[even] - ti;
        re[even] += tr;
        im[even] += ti;
      }
    }
  }

  if (inverse) {
    const invN = 1 / n;
    for (let i = 0; i < n; i++) {
      re[i] *= invN;
      im[i] *= invN;
    }
  }
}

/**
 * Arbitrary-length FFT via Bluestein's chirp-z convolution algorithm.
 * Exact to ~1e-13 relative RMS for primes, odd lengths, and composites.
 */
export function fftBluestein(
  inRe: Float64Array,
  inIm: Float64Array,
  inverse = false,
): { re: Float64Array; im: Float64Array } {
  const n = inRe.length;
  const outRe = new Float64Array(n);
  const outIm = new Float64Array(n);
  if (n === 0) return { re: outRe, im: outIm };
  if (n === 1) {
    outRe[0] = inRe[0];
    outIm[0] = inIm[0];
    return { re: outRe, im: outIm };
  }

  const m = nextPow2(2 * n - 1);
  const sign = inverse ? 1 : -1;

  const chirpRe = new Float64Array(n);
  const chirpIm = new Float64Array(n);
  for (let k = 0; k < n; k++) {
    // Reduce k^2 mod 2n to keep trig arguments small and accurate for large N.
    const k2 = (k * k) % (2 * n);
    const angle = (sign * Math.PI * k2) / n;
    chirpRe[k] = Math.cos(angle);
    chirpIm[k] = Math.sin(angle);
  }

  const aRe = new Float64Array(m);
  const aIm = new Float64Array(m);
  for (let k = 0; k < n; k++) {
    const xr = inRe[k];
    const xi = inIm[k];
    const cr = chirpRe[k];
    const ci = chirpIm[k];
    aRe[k] = xr * cr - xi * ci;
    aIm[k] = xr * ci + xi * cr;
  }

  const bRe = new Float64Array(m);
  const bIm = new Float64Array(m);
  bRe[0] = chirpRe[0];
  bIm[0] = -chirpIm[0];
  for (let k = 1; k < n; k++) {
    const cr = chirpRe[k];
    const ci = -chirpIm[k];
    bRe[k] = cr;
    bIm[k] = ci;
    bRe[m - k] = cr;
    bIm[m - k] = ci;
  }

  fftRadix2InPlace(aRe, aIm, false);
  fftRadix2InPlace(bRe, bIm, false);

  for (let i = 0; i < m; i++) {
    const ar = aRe[i];
    const ai = aIm[i];
    const br = bRe[i];
    const bi = bIm[i];
    aRe[i] = ar * br - ai * bi;
    aIm[i] = ar * bi + ai * br;
  }

  fftRadix2InPlace(aRe, aIm, true);

  const scale = inverse ? 1 / n : 1;
  for (let k = 0; k < n; k++) {
    const cr = chirpRe[k];
    const ci = chirpIm[k];
    const yr = aRe[k];
    const yi = aIm[k];
    outRe[k] = (yr * cr - yi * ci) * scale;
    outIm[k] = (yr * ci + yi * cr) * scale;
  }

  return { re: outRe, im: outIm };
}

/** Complex FFT for any positive integer length N. */
export function fftComplex(
  inRe: Float64Array,
  inIm: Float64Array,
  inverse = false,
): { re: Float64Array; im: Float64Array } {
  const n = inRe.length;
  if (n === 0) return { re: new Float64Array(0), im: new Float64Array(0) };
  if (isPowerOfTwo(n)) {
    const re = new Float64Array(inRe);
    const im = new Float64Array(inIm);
    fftRadix2InPlace(re, im, inverse);
    return { re, im };
  }
  return fftBluestein(inRe, inIm, inverse);
}

/**
 * Real-input FFT returning bins 0..floor(N/2).
 * Uses the N/2 complex packing trick when N is even and a power of two (2x faster),
 * and falls back cleanly to Bluestein for arbitrary N.
 */
export function fftReal(input: Float64Array): { re: Float64Array; im: Float64Array } {
  const n = input.length;
  const outLen = Math.floor(n / 2) + 1;
  if (n === 0) return { re: new Float64Array(0), im: new Float64Array(0) };
  if (n === 1) {
    const re = new Float64Array(1);
    re[0] = input[0];
    return { re, im: new Float64Array(1) };
  }

  if (n >= 4 && isPowerOfTwo(n)) {
    const half = n >>> 1;
    const zRe = new Float64Array(half);
    const zIm = new Float64Array(half);
    for (let k = 0; k < half; k++) {
      zRe[k] = input[2 * k];
      zIm[k] = input[2 * k + 1];
    }
    fftRadix2InPlace(zRe, zIm, false);

    const outRe = new Float64Array(outLen);
    const outIm = new Float64Array(outLen);

    // DC and Nyquist bins
    outRe[0] = zRe[0] + zIm[0];
    outIm[0] = 0;
    outRe[half] = zRe[0] - zIm[0];
    outIm[half] = 0;

    const step = TWO_PI / n;
    for (let k = 1; k < half; k++) {
      const mk = half - k;
      const zr = zRe[k];
      const zi = zIm[k];
      const zmr = zRe[mk];
      const zmi = zIm[mk];

      const evenRe = 0.5 * (zr + zmr);
      const evenIm = 0.5 * (zi - zmi);
      const oddRe = 0.5 * (zi + zmi);
      const oddIm = -0.5 * (zr - zmr);

      const angle = step * k;
      const wr = Math.cos(angle);
      const wi = -Math.sin(angle);

      outRe[k] = evenRe + (wr * oddRe - wi * oddIm);
      outIm[k] = evenIm + (wr * oddIm + wi * oddRe);
    }

    return { re: outRe, im: outIm };
  }

  const zeros = new Float64Array(n);
  const full = fftComplex(input, zeros, false);
  return {
    re: full.re.subarray(0, outLen),
    im: full.im.subarray(0, outLen),
  };
}

/**
 * Goertzel algorithm: evaluates the exact DFT at a single arbitrary normalized frequency f/fs.
 */
export function goertzel(
  samples: Float64Array,
  freqHz: number,
  fs: number,
): { re: number; im: number; magSq: number } {
  const n = samples.length;
  if (n === 0 || fs <= 0) return { re: 0, im: 0, magSq: 0 };
  const omega = (TWO_PI * freqHz) / fs;
  const cosW = Math.cos(omega);
  const sinW = Math.sin(omega);
  const coeff = 2 * cosW;

  let s0 = 0;
  let s1 = 0;
  let s2 = 0;
  for (let i = 0; i < n; i++) {
    s0 = samples[i] + coeff * s1 - s2;
    s2 = s1;
    s1 = s0;
  }

  // Exact phase-aligned complex value matching sum_{k=0}^{N-1} x[k] exp(-j omega k)
  const reUnshifted = s1 - s2 * cosW;
  const imUnshifted = s2 * sinW;
  const phi = omega * (n - 1);
  const cPhi = Math.cos(phi);
  const sPhi = Math.sin(phi);
  const re = reUnshifted * cPhi + imUnshifted * sPhi;
  const im = imUnshifted * cPhi - reUnshifted * sPhi;
  return { re, im, magSq: re * re + im * im };
}

/**
 * Chirp Z-Transform (Zoom FFT): evaluates M uniformly spaced frequency points between f1 and f2 (Hz).
 */
export function zoomFftCzt(
  samples: Float64Array,
  fs: number,
  f1: number,
  f2: number,
  points: number,
): { freqs: Float64Array; re: Float64Array; im: Float64Array } {
  const n = samples.length;
  const m = Math.max(2, Math.min(8192, Math.floor(points)));
  const freqs = new Float64Array(m);
  const outRe = new Float64Array(m);
  const outIm = new Float64Array(m);
  if (n === 0 || fs <= 0 || f2 <= f1) return { freqs, re: outRe, im: outIm };

  const df = (f2 - f1) / (m - 1);
  for (let k = 0; k < m; k++) freqs[k] = f1 + k * df;

  const l = nextPow2(n + m - 1);
  const theta0 = (TWO_PI * f1) / fs;
  const dTheta = (TWO_PI * df) / fs;

  const yRe = new Float64Array(l);
  const yIm = new Float64Array(l);
  for (let i = 0; i < n; i++) {
    const phi = -(theta0 * i + 0.5 * dTheta * i * i);
    const c = Math.cos(phi);
    const s = Math.sin(phi);
    yRe[i] = samples[i] * c;
    yIm[i] = samples[i] * s;
  }

  const vRe = new Float64Array(l);
  const vIm = new Float64Array(l);
  for (let k = 0; k < m; k++) {
    const phi = 0.5 * dTheta * k * k;
    vRe[k] = Math.cos(phi);
    vIm[k] = Math.sin(phi);
  }
  for (let k = 1; k < n; k++) {
    const phi = 0.5 * dTheta * k * k;
    vRe[l - k] = Math.cos(phi);
    vIm[l - k] = Math.sin(phi);
  }

  fftRadix2InPlace(yRe, yIm, false);
  fftRadix2InPlace(vRe, vIm, false);

  for (let i = 0; i < l; i++) {
    const yr = yRe[i];
    const yi = yIm[i];
    const vr = vRe[i];
    const vi = vIm[i];
    yRe[i] = yr * vr - yi * vi;
    yIm[i] = yr * vi + yi * vr;
  }

  fftRadix2InPlace(yRe, yIm, true);

  for (let k = 0; k < m; k++) {
    const phi = -0.5 * dTheta * k * k;
    const c = Math.cos(phi);
    const s = Math.sin(phi);
    const gr = yRe[k];
    const gi = yIm[k];
    outRe[k] = gr * c - gi * s;
    outIm[k] = gr * s + gi * c;
  }

  return { freqs, re: outRe, im: outIm };
}

/** Reference O(N^2) complex DFT for small-N exact verification in unit tests. */
export function refDft(
  inRe: Float64Array,
  inIm?: Float64Array,
): { re: Float64Array; im: Float64Array } {
  const n = inRe.length;
  const outRe = new Float64Array(n);
  const outIm = new Float64Array(n);
  for (let k = 0; k < n; k++) {
    let sr = 0;
    let si = 0;
    const step = (-TWO_PI * k) / n;
    for (let t = 0; t < n; t++) {
      const angle = step * t;
      const c = Math.cos(angle);
      const s = Math.sin(angle);
      const xr = inRe[t];
      const xi = inIm ? inIm[t] : 0;
      sr += xr * c - xi * s;
      si += xr * s + xi * c;
    }
    outRe[k] = sr;
    outIm[k] = si;
  }
  return { re: outRe, im: outIm };
}
