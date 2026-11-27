// Time-grid classification (uniform, uniform with gaps, non-uniform, none)
// and linear / natural-cubic-spline resampling with rigorous interpolation error bounds.

import type { ResampleReport, TimeGrid } from '../types';

const UNIFORM_REL_TOL = 1e-3; // 0.1% relative step spread threshold
const GAP_RATIO_MIN = 1.8;

/** Computes the median of a non-empty Float64Array copy. */
function medianOf(values: Float64Array): number {
  const sorted = Float64Array.from(values).sort();
  const mid = sorted.length >>> 1;
  return sorted.length % 2 === 1 ? sorted[mid] : 0.5 * (sorted[mid - 1] + sorted[mid]);
}

/**
 * Classifies a time column into uniform, uniform-with-gaps, non-uniform, or none.
 */
export function analyseTimeGrid(time: Float64Array | null): TimeGrid {
  if (!time || time.length < 2) {
    return {
      kind: 'none',
      fs: null,
      dtMin: 0,
      dtMax: 0,
      dtMedian: 0,
      relSpread: 0,
      gapCount: 0,
    };
  }

  const diffs = new Float64Array(time.length - 1);
  let dtMin = Infinity;
  let dtMax = -Infinity;
  let validCount = 0;

  for (let i = 0; i < time.length - 1; i++) {
    const dt = time[i + 1] - time[i];
    if (!Number.isFinite(dt) || dt <= 0) {
      return {
        kind: 'nonuniform',
        fs: null,
        dtMin: 0,
        dtMax: 0,
        dtMedian: 0,
        relSpread: Infinity,
        gapCount: 0,
      };
    }
    diffs[i] = dt;
    if (dt < dtMin) dtMin = dt;
    if (dt > dtMax) dtMax = dt;
    validCount++;
  }

  if (validCount === 0) {
    return { kind: 'none', fs: null, dtMin: 0, dtMax: 0, dtMedian: 0, relSpread: 0, gapCount: 0 };
  }

  const dtMedian = medianOf(diffs);
  const relSpread = dtMedian > 0 ? (dtMax - dtMin) / dtMedian : Infinity;
  const fs = dtMedian > 0 ? 1 / dtMedian : null;

  if (relSpread <= UNIFORM_REL_TOL) {
    return { kind: 'uniform', fs, dtMin, dtMax, dtMedian, relSpread, gapCount: 0 };
  }

  // Distinguish uniform-with-gaps (every step is either ~dtMedian or near-integer multiple >= 2*dtMedian)
  // from genuinely variable-step transient data.
  let gapCount = 0;
  let nonGapNonUniform = 0;
  for (let i = 0; i < diffs.length; i++) {
    const ratio = diffs[i] / dtMedian;
    if (Math.abs(ratio - 1) <= UNIFORM_REL_TOL * 5) continue;
    if (ratio >= GAP_RATIO_MIN && Math.abs(ratio - Math.round(ratio)) <= 0.05) {
      gapCount++;
    } else {
      nonGapNonUniform++;
    }
  }

  if (gapCount > 0 && nonGapNonUniform === 0) {
    return { kind: 'gaps', fs, dtMin, dtMax, dtMedian, relSpread, gapCount };
  }

  return { kind: 'nonuniform', fs, dtMin, dtMax, dtMedian, relSpread, gapCount };
}

/**
 * Fits natural cubic spline second derivatives M[i] on strictly increasing knots t[0..n-1].
 */
function buildNaturalCubicSpline(t: Float64Array, y: Float64Array): Float64Array {
  const n = t.length;
  const m = new Float64Array(n);
  if (n < 3) return m;

  const h = new Float64Array(n - 1);
  for (let i = 0; i < n - 1; i++) h[i] = t[i + 1] - t[i];

  // Solve tridiagonal system for interior second derivatives m[1..n-2]
  const diag = new Float64Array(n);
  const rhs = new Float64Array(n);
  const upper = new Float64Array(n);
  const lower = new Float64Array(n);

  for (let i = 1; i < n - 1; i++) {
    lower[i] = h[i - 1];
    diag[i] = 2 * (h[i - 1] + h[i]);
    upper[i] = h[i];
    rhs[i] = 6 * ((y[i + 1] - y[i]) / h[i] - (y[i] - y[i - 1]) / h[i - 1]);
  }

  // Thomas algorithm forward sweep
  for (let i = 2; i < n - 1; i++) {
    const factor = lower[i] / (diag[i - 1] || 1e-30);
    diag[i] -= factor * upper[i - 1];
    rhs[i] -= factor * rhs[i - 1];
  }

  // Back substitution
  m[n - 2] = rhs[n - 2] / (diag[n - 2] || 1e-30);
  for (let i = n - 3; i >= 1; i--) {
    m[i] = (rhs[i] - upper[i] * m[i + 1]) / (diag[i] || 1e-30);
  }
  return m;
}

/**
 * Resamples a non-uniformly sampled signal (t, y) onto a uniform grid at targetFs
 * using linear or natural cubic spline interpolation, and estimates a worst-case
 * interpolation error bound (metrics.md §6).
 */
export function resampleSignal(
  t: Float64Array,
  y: Float64Array,
  method: 'linear' | 'cubic',
  targetFs: number,
  maxSamples = 1 << 20,
): { tUniform: Float64Array; yUniform: Float64Array; report: ResampleReport } {
  const nIn = Math.min(t.length, y.length);
  if (nIn < 2 || !Number.isFinite(targetFs) || targetFs <= 0) {
    return {
      tUniform: t,
      yUniform: y,
      report: {
        applied: false,
        method,
        targetFs: targetFs || 1,
        errorBoundRms: 0,
        errorBoundDbBelowSig: -Infinity,
        originalSamples: nIn,
        resampledSamples: nIn,
      },
    };
  }

  const t0 = t[0];
  const tEnd = t[nIn - 1];
  const duration = tEnd - t0;
  const dt = 1 / targetFs;
  const nOut = Math.max(2, Math.min(maxSamples, Math.floor(duration * targetFs) + 1));

  const tUniform = new Float64Array(nOut);
  const yUniform = new Float64Array(nOut);
  const m = method === 'cubic' ? buildNaturalCubicSpline(t, y) : null;

  // Compute max local step h and numerical derivative estimates for error bound
  let maxH = 0;
  let sigSq = 0;
  for (let i = 0; i < nIn; i++) {
    sigSq += y[i] * y[i];
    if (i < nIn - 1) {
      const hi = t[i + 1] - t[i];
      if (hi > maxH) maxH = hi;
    }
  }
  const sigRms = Math.sqrt(sigSq / nIn) || 1;

  // Estimate max |x''| (for linear) and max |x''''| (for cubic) via divided differences
  let maxD2 = 0;
  let maxD4 = 0;
  const d2Arr = new Float64Array(nIn);
  for (let i = 1; i < nIn - 1; i++) {
    const h0 = t[i] - t[i - 1];
    const h1 = t[i + 1] - t[i];
    if (h0 > 0 && h1 > 0) {
      const slope0 = (y[i] - y[i - 1]) / h0;
      const slope1 = (y[i + 1] - y[i]) / h1;
      const d2 = (2 * (slope1 - slope0)) / (h0 + h1);
      d2Arr[i] = d2;
      if (Math.abs(d2) > maxD2) maxD2 = Math.abs(d2);
    }
  }
  if (method === 'cubic') {
    for (let i = 2; i < nIn - 2; i++) {
      const h0 = t[i] - t[i - 1];
      const h1 = t[i + 1] - t[i];
      if (h0 > 0 && h1 > 0) {
        const s0 = (d2Arr[i] - d2Arr[i - 1]) / h0;
        const s1 = (d2Arr[i + 1] - d2Arr[i]) / h1;
        const d4 = (2 * (s1 - s0)) / (h0 + h1);
        if (Math.abs(d4) > maxD4) maxD4 = Math.abs(d4);
      }
    }
  }

  let seg = 0;
  for (let j = 0; j < nOut; j++) {
    const tj = t0 + j * dt;
    tUniform[j] = tj;
    while (seg < nIn - 2 && t[seg + 1] < tj) seg++;
    const x0 = t[seg];
    const x1 = t[seg + 1];
    const h = x1 - x0;
    if (h <= 0) {
      yUniform[j] = y[seg];
      continue;
    }
    const a = (x1 - tj) / h;
    const b = (tj - x0) / h;
    if (method === 'cubic' && m) {
      const h2Over6 = (h * h) / 6;
      yUniform[j] =
        a * y[seg] +
        b * y[seg + 1] +
        ((a * a * a - a) * m[seg] + (b * b * b - b) * m[seg + 1]) * h2Over6;
    } else {
      yUniform[j] = a * y[seg] + b * y[seg + 1];
    }
  }

  // Theoretical error bounds (metrics.md §6):
  //   Linear: max|x''| * h^2 / 8
  //   Cubic:  (5/384) * max|x''''| * h^4
  const errorBoundPeak =
    method === 'cubic'
      ? (5 / 384) * maxD4 * Math.pow(maxH, 4)
      : (maxD2 * maxH * maxH) / 8;
  const errorBoundRms = errorBoundPeak / Math.SQRT2;
  const errorBoundDbBelowSig =
    errorBoundRms > 1e-30 ? 20 * Math.log10(errorBoundRms / sigRms) : -200;

  return {
    tUniform,
    yUniform,
    report: {
      applied: true,
      method,
      targetFs,
      errorBoundRms,
      errorBoundDbBelowSig,
      originalSamples: nIn,
      resampledSamples: nOut,
    },
  };
}
