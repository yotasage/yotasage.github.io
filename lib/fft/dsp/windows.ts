// Periodic (DFT-even) window catalogue and numeric window figures of merit.
// Matches scipy.signal.get_window(..., fftbins=True) and Harris (1978) conventions.

import type { ResolvedWindowKind, WindowMetrics, WindowParams } from '../types';
import { fftComplex } from './fft';

const TWO_PI = 2 * Math.PI;

export const DEFAULT_WINDOW_PARAMS: WindowParams = {
  kaiserBeta: 14,
  chebyshevDb: 100,
  gaussianSigma: 0.4,
  tukeyAlpha: 0.5,
};

/** Nominal main-lobe half-width in bins (for bin-sum tone & harmonic integration). */
export const NOMINAL_MAIN_LOBE_HALF_WIDTH: Record<ResolvedWindowKind, number> = {
  rectangular: 1,
  hann: 2,
  hamming: 2,
  blackman: 3,
  'blackman-harris': 4,
  nuttall: 4,
  flattop: 5,
  kaiser: 4,
  chebyshev: 4,
  gaussian: 4,
  tukey: 2,
  bartlett: 2,
  welch: 2,
};

export const WINDOW_CATALOGUE: readonly { id: ResolvedWindowKind; label: string }[] = [
  { id: 'rectangular', label: 'Rectangular (Dirichlet)' },
  { id: 'hann', label: 'Hann' },
  { id: 'hamming', label: 'Hamming' },
  { id: 'blackman', label: 'Blackman' },
  { id: 'blackman-harris', label: '4-term Blackman–Harris' },
  { id: 'nuttall', label: '4-term Nuttall' },
  { id: 'flattop', label: 'Flat-Top (ISO 18431)' },
  { id: 'kaiser', label: 'Kaiser (β)' },
  { id: 'chebyshev', label: 'Dolph–Chebyshev (dB)' },
  { id: 'gaussian', label: 'Gaussian (σ)' },
  { id: 'tukey', label: 'Tukey (α)' },
  { id: 'bartlett', label: 'Bartlett (Triangular)' },
  { id: 'welch', label: 'Welch (Parabolic)' },
];

/** Modified Bessel function of the first kind, order 0: I0(x). */
export function besselI0(x: number): number {
  const ax = Math.abs(x);
  if (ax < 3.75) {
    const t = x / 3.75;
    const t2 = t * t;
    return (
      1.0 +
      t2 *
        (3.5156229 +
          t2 *
            (3.0899424 +
              t2 * (1.2067492 + t2 * (0.2659732 + t2 * (0.0360768 + t2 * 0.0045813)))))
    );
  }
  const t = 3.75 / ax;
  return (
    (Math.exp(ax) / Math.sqrt(ax)) *
    (0.39894228 +
      t *
        (0.01328592 +
          t *
            (0.00225319 +
              t *
                (-0.00157565 +
                  t *
                    (0.00916281 +
                      t *
                        (-0.02057706 +
                          t * (0.02635537 + t * (-0.01647633 + t * 0.00392377))))))))
  );
}

/** Chebyshev polynomial T_n(x) for real x (including |x| > 1). */
function chebPoly(n: number, x: number): number {
  if (Math.abs(x) <= 1) return Math.cos(n * Math.acos(x));
  const val = Math.cosh(n * Math.acosh(Math.abs(x)));
  return x < 0 && n % 2 === 1 ? -val : val;
}

/**
 * Generates a periodic (DFT-even, length N) window matching scipy.signal.get_window(..., fftbins=True).
 */
export function generateWindow(
  kind: ResolvedWindowKind,
  n: number,
  params: WindowParams = DEFAULT_WINDOW_PARAMS,
): Float64Array {
  const w = new Float64Array(n);
  if (n <= 0) return w;
  if (n === 1) {
    w[0] = 1;
    return w;
  }

  switch (kind) {
    case 'rectangular':
      w.fill(1);
      return w;

    case 'hann':
      for (let i = 0; i < n; i++) {
        w[i] = 0.5 - 0.5 * Math.cos((TWO_PI * i) / n);
      }
      return w;

    case 'hamming':
      for (let i = 0; i < n; i++) {
        w[i] = 0.54 - 0.46 * Math.cos((TWO_PI * i) / n);
      }
      return w;

    case 'blackman':
      for (let i = 0; i < n; i++) {
        const p = (TWO_PI * i) / n;
        w[i] = 0.42 - 0.5 * Math.cos(p) + 0.08 * Math.cos(2 * p);
      }
      return w;

    case 'blackman-harris': {
      // Exact 4-term minimum Blackman-Harris (Harris 1978, -92 dB sidelobes)
      const a0 = 0.35875;
      const a1 = 0.48829;
      const a2 = 0.14128;
      const a3 = 0.01168;
      for (let i = 0; i < n; i++) {
        const p = (TWO_PI * i) / n;
        w[i] = a0 - a1 * Math.cos(p) + a2 * Math.cos(2 * p) - a3 * Math.cos(3 * p);
      }
      return w;
    }

    case 'nuttall': {
      // 4-term Nuttall continuous first derivative (-98 dB sidelobes)
      const a0 = 0.3635819;
      const a1 = 0.4891775;
      const a2 = 0.1365995;
      const a3 = 0.0106411;
      for (let i = 0; i < n; i++) {
        const p = (TWO_PI * i) / n;
        w[i] = a0 - a1 * Math.cos(p) + a2 * Math.cos(2 * p) - a3 * Math.cos(3 * p);
      }
      return w;
    }

    case 'flattop': {
      // ISO 18431-2 / scipy 5-term flat-top window (< 0.01 dB scalloping loss)
      const a0 = 0.21557895;
      const a1 = 0.41663158;
      const a2 = 0.277263158;
      const a3 = 0.083578947;
      const a4 = 0.006947368;
      for (let i = 0; i < n; i++) {
        const p = (TWO_PI * i) / n;
        w[i] =
          a0 -
          a1 * Math.cos(p) +
          a2 * Math.cos(2 * p) -
          a3 * Math.cos(3 * p) +
          a4 * Math.cos(4 * p);
      }
      return w;
    }

    case 'kaiser': {
      const beta = Math.max(0, Math.min(30, params.kaiserBeta));
      const denom = besselI0(beta);
      const half = n / 2;
      for (let i = 0; i < n; i++) {
        const r = (i - half) / half;
        const arg = Math.max(0, 1 - r * r);
        w[i] = besselI0(beta * Math.sqrt(arg)) / denom;
      }
      return w;
    }

    case 'chebyshev': {
      // Dolph-Chebyshev window via frequency-domain sampling and inverse FFT
      const at = Math.max(20, Math.min(180, params.chebyshevDb));
      const m = n;
      const order = m - 1;
      const beta = Math.cosh(Math.acosh(Math.pow(10, at / 20)) / order);
      const specRe = new Float64Array(m);
      const specIm = new Float64Array(m);
      const odd = m % 2 === 1;
      for (let k = 0; k < m; k++) {
        const x = beta * Math.cos((Math.PI * k) / m);
        const val = chebPoly(order, x);
        if (odd) {
          specRe[k] = val;
        } else {
          // Half-sample shift for even-length symmetry
          const phase = (Math.PI * k) / m;
          specRe[k] = val * Math.cos(phase);
          specIm[k] = val * Math.sin(phase);
        }
      }
      const td = fftComplex(specRe, specIm, true);
      // Center-shift and normalize peak to 1
      let maxVal = 0;
      const shift = Math.floor(m / 2);
      for (let i = 0; i < m; i++) {
        const val = td.re[(i + shift) % m];
        w[i] = val;
        if (Math.abs(val) > maxVal) maxVal = Math.abs(val);
      }
      if (maxVal > 0) {
        const sign = w[Math.floor(m / 2)] >= 0 ? 1 : -1;
        for (let i = 0; i < m; i++) w[i] = (sign * w[i]) / maxVal;
      }
      return w;
    }

    case 'gaussian': {
      const sigma = Math.max(0.05, Math.min(2, params.gaussianSigma));
      const half = n / 2;
      for (let i = 0; i < n; i++) {
        const r = (i - half) / (sigma * half);
        w[i] = Math.exp(-0.5 * r * r);
      }
      return w;
    }

    case 'tukey': {
      const alpha = Math.max(0, Math.min(1, params.tukeyAlpha));
      if (alpha <= 0) {
        w.fill(1);
        return w;
      }
      const edge = (alpha * n) / 2;
      for (let i = 0; i < n; i++) {
        if (i < edge) {
          w[i] = 0.5 * (1 - Math.cos((Math.PI * i) / edge));
        } else if (i > n - edge) {
          w[i] = 0.5 * (1 - Math.cos((Math.PI * (n - i)) / edge));
        } else {
          w[i] = 1;
        }
      }
      return w;
    }

    case 'bartlett': {
      const half = n / 2;
      for (let i = 0; i < n; i++) {
        w[i] = 1 - Math.abs((i - half) / half);
      }
      return w;
    }

    case 'welch': {
      const half = n / 2;
      for (let i = 0; i < n; i++) {
        const r = (i - half) / half;
        w[i] = 1 - r * r;
      }
      return w;
    }
  }
}

/**
 * Computes numeric window metrics (CG, ENBW, scalloping loss, highest sidelobe,
 * main-lobe half-width, and frequency-response curve) directly from the window samples.
 */
export function computeWindowMetrics(
  kind: ResolvedWindowKind,
  n: number,
  params: WindowParams = DEFAULT_WINDOW_PARAMS,
  precomputedWindow?: Float64Array,
): WindowMetrics {
  const w = precomputedWindow ?? generateWindow(kind, n, params);
  let s1 = 0;
  let s2 = 0;
  for (let i = 0; i < n; i++) {
    const v = w[i];
    s1 += v;
    s2 += v * v;
  }

  const coherentGain = n > 0 ? s1 / n : 1;
  const enbwBins = s1 !== 0 ? (n * s2) / (s1 * s1) : 1;

  // Evaluate oversampled DTFT on a 256-point prototype (16x zero-padded to 4096) for exact
  // scalloping loss, sidelobe height, and smooth frequency response regardless of N.
  const protoN = Math.min(Math.max(64, n), 256);
  const protoW = protoN === n ? w : generateWindow(kind, protoN, params);
  const zp = 16;
  const fftLen = 4096;
  const binsPerDftBin = fftLen / protoN;
  const re = new Float64Array(fftLen);
  const im = new Float64Array(fftLen);
  let protoS1 = 0;
  for (let i = 0; i < protoN; i++) {
    re[i] = protoW[i];
    protoS1 += protoW[i];
  }
  const spec = fftComplex(re, im, false);
  const mag0 = Math.abs(protoS1) || 1;

  // Magnitude at 0.5 DFT bin offset gives exact scalloping loss
  const halfBinIdx = Math.round(0.5 * binsPerDftBin);
  const magHalf = Math.hypot(spec.re[halfBinIdx], spec.im[halfBinIdx]);
  const scallopingLossDb =
    magHalf > 0 ? Math.max(0, -20 * Math.log10(magHalf / mag0)) : 0;

  // Walk outward from bin 0 to find first local minimum (first null = main-lobe edge),
  // then find highest sidelobe peak beyond it.
  const maxCheck = fftLen >>> 1;
  const mags = new Float64Array(maxCheck);
  for (let k = 0; k < maxCheck; k++) {
    mags[k] = Math.hypot(spec.re[k], spec.im[k]) / mag0;
  }

  let firstNullIdx = Math.max(2, Math.round(binsPerDftBin));
  for (let k = 2; k < maxCheck - 1; k++) {
    if (mags[k] <= mags[k - 1] && mags[k] <= mags[k + 1] && mags[k] < 0.25) {
      firstNullIdx = k;
      break;
    }
  }

  let maxSidelobe = 1e-12;
  for (let k = firstNullIdx + 1; k < maxCheck - 1; k++) {
    if (mags[k] >= mags[k - 1] && mags[k] >= mags[k + 1]) {
      if (mags[k] > maxSidelobe) maxSidelobe = mags[k];
    }
  }
  const highestSidelobeDb = 20 * Math.log10(Math.max(1e-12, maxSidelobe));

  // Main-lobe half-width in integer DFT bins (using first null rounded up, bounded reasonably)
  let mainLobeHalfWidth = NOMINAL_MAIN_LOBE_HALF_WIDTH[kind];
  if (kind === 'kaiser' || kind === 'chebyshev' || kind === 'gaussian') {
    const nullInBins = firstNullIdx / binsPerDftBin;
    mainLobeHalfWidth = Math.max(1, Math.min(10, Math.ceil(nullInBins)));
  }

  // Build frequency-response curve over -12..+12 DFT bins
  const spanBins = 12;
  const halfSamples = Math.min(maxCheck - 1, Math.round(spanBins * binsPerDftBin));
  const step = Math.max(1, Math.floor(halfSamples / 160));
  const freqBins: number[] = [];
  const freqDb: number[] = [];
  for (let k = -halfSamples; k <= halfSamples; k += step) {
    const ak = Math.abs(k);
    const db = 20 * Math.log10(Math.max(1e-9, mags[ak]));
    freqBins.push(k / binsPerDftBin);
    freqDb.push(Math.max(-160, db));
  }

  // Downsampled time-domain window shape (<= 256 points)
  const shapePts = Math.min(protoN, 200);
  const shapeX: number[] = [];
  const shapeY: number[] = [];
  for (let i = 0; i < shapePts; i++) {
    const idx = Math.min(protoN - 1, Math.round((i / Math.max(1, shapePts - 1)) * (protoN - 1)));
    shapeX.push(i / Math.max(1, shapePts - 1));
    shapeY.push(protoW[idx]);
  }
  void zp;

  return {
    kind,
    coherentGain,
    enbwBins,
    s1,
    s2,
    highestSidelobeDb,
    scallopingLossDb,
    mainLobeHalfWidth,
    shapeX,
    shapeY,
    freqBins,
    freqDb,
  };
}

export const WINDOW_OPTIONS: readonly ResolvedWindowKind[] = [
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
];
