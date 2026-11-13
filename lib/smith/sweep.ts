// The sweep (step M7.1, docs/smith-chart/milestones.md M7): the input Γ of a circuit over a band of frequencies, the
// trace refined where it bends on the Γ plane, markers at chosen frequencies and the band's figures.
//
// - A band is linear or logarithmic, `points` frequencies from `start` to `stop` with both ends exact. One sweep is
//   network.ts's allocation-free `sweep` over the band's frequencies into a Trace's typed arrays (interleaved Γ).
// - `refine` inserts midpoints (arithmetic in a linear band, geometric in a logarithmic one) into every segment whose
//   chord on the Γ plane is longer than `maxStep` or that meets a vertex turning by more than `maxAngle`, pass after
//   pass until none is left, a segment is narrower than `minSpan`·f, or the trace holds `cap` points; when the cap
//   cannot take every split of a pass, the worst segments (largest ratio to their threshold) are split first, ties
//   from low to high frequency. Turns between chords shorter than ANGLE_FLOOR are not counted (rounding noise).
// - `bandFigures`: worst and best |Γ| (return loss, VSWR) polished between samples by golden-section search; every
//   interval where |Γ| < a chosen threshold, its edges bracketed by bisection to 1e-12 relative in f (samples close to
//   the threshold are polished first, so a dip or bump between samples is seen); the interval around f0 and its
//   fractional bandwidth (hi − lo)/f0; the loaded Q: from the |Γ| minimum nearest f0 (f0 itself when |Γ(f0)|² is that
//   minimum to 1e-12 relative, as for a flat |Γ| or a resonance at f0), the band where the delivered
//   power 1 − |Γ|² stays above half its peak, i.e. |Γ|² < (1 + |Γmin|²)/2, and Q = fmin/(hi − lo) (notes-M7.1.md).
//
// Everything is deterministic: the same circuit, band and options give the same arrays and figures to the bit.
// sweepBand and refine allocate nothing once the Trace has its capacity; bandFigures allocates only its result.

import type { Vec } from './complex';
import { returnLoss, vswr, zFromGamma } from './convert';
import { inputGamma, sweep as sweepNetwork } from './network';
import type { Circuit } from './network';
import { packParts } from './parts';
import type { PlotPaths } from './plot';

/** A band: `points` frequencies (Hz) from `start` to `stop`, evenly spaced in f or in log f. */
export interface Band {
  start: number;
  stop: number;
  points: number;
  log: boolean;
}

export const MIN_POINTS = 2;
/** The most points a band or a refined trace holds. */
export const MAX_POINTS = 100_000;

/** Why a band cannot be swept, or null: 'start', 'stop' (not above start), 'points' or 'narrow' (spacing at rounding level). */
export type BandProblem = 'start' | 'stop' | 'points' | 'narrow' | null;

export function bandProblem(band: Band): BandProblem {
  const { start, stop, points, log } = band;
  if (!Number.isFinite(start) || start < 0 || (log && start === 0)) return 'start';
  if (!Number.isFinite(stop) || !(stop > start)) return 'stop';
  if (!Number.isInteger(points) || points < MIN_POINTS || points > MAX_POINTS) return 'points';
  if (stop - start < (points - 1) * 1e-12 * stop) return 'narrow';
  return null;
}

/** A band of `span` around f0 (default ±50 %), 401 points, linear. */
export function defaultBand(f0: number, span = 0.5, points = 401): Band {
  return { start: f0 * (1 - span), stop: f0 * (1 + span), points, log: false };
}

/** The n frequencies of a band into freqs[0…n − 1]; freqs[0] = start and freqs[n − 1] = stop exactly. */
export function bandFrequencies(freqs: Vec, start: number, stop: number, n: number, log: boolean): void {
  const last = n - 1;
  if (log) {
    const a = Math.log(start), d = Math.log(stop) - a;
    for (let i = 1; i < last; i++) freqs[i] = Math.exp(a + d * (i / last));
  } else {
    const d = stop - start;
    for (let i = 1; i < last; i++) freqs[i] = start + d * (i / last);
  }
  freqs[0] = start;
  freqs[last] = stop;
}

/** A circuit packed for sweeping (network.ts's layout): made once per circuit, read by every evaluation. */
export interface SweepCircuit {
  parts: Float64Array;
  count: number;
  loadR: number;
  loadX: number;
  z0: number;
  f0: number;
}

/** Packs a circuit for sweeping; reuses `into` (and its parts array when long enough). */
export function sweepCircuit(circuit: Circuit, into?: SweepCircuit): SweepCircuit {
  const parts = packParts(circuit.parts, into?.parts);
  const sc = into ?? ({} as SweepCircuit);
  sc.parts = parts;
  sc.count = circuit.parts.length;
  sc.loadR = circuit.loadR;
  sc.loadX = circuit.loadX;
  sc.z0 = circuit.z0;
  sc.f0 = circuit.f0;
  return sc;
}

/** The input Γ at f into out[o], out[o + 1]. */
export function gammaAt(out: Vec, o: number, sc: SweepCircuit, f: number): void {
  inputGamma(out, o, sc.parts, sc.count, sc.loadR, sc.loadX, sc.z0, f, sc.f0);
}

const G = new Float64Array(2);

/** |Γ|² at f. */
export function mag2At(sc: SweepCircuit, f: number): number {
  inputGamma(G, 0, sc.parts, sc.count, sc.loadR, sc.loadX, sc.z0, f, sc.f0);
  return G[0] * G[0] + G[1] * G[1];
}

/**
 * A swept trace: n frequencies (ascending) in freqs and their input Γ interleaved (re, im) in gamma. The arrays are
 * replaced when the capacity grows and swapped by `refine`, so read them from the Trace after each call.
 */
export class Trace {
  capacity = 0;
  n = 0;
  log = false;
  start = 0;
  stop = 0;
  /** Points of the band before refinement. */
  base = 0;
  freqs = new Float64Array(0);
  gamma = new Float64Array(0);
  /** The last refine: passes made, points added, whether the cap stopped it, segments left at the minimum span. */
  passes = 0;
  added = 0;
  capped = false;
  limited = 0;
  /** Workspace of refine and bandFigures. */
  backF = new Float64Array(0);
  backG = new Float64Array(0);
  work = new Float64Array(0);
  turn = new Float64Array(0);
  sel = new Float64Array(0);

  constructor(capacity = 1024) {
    this.reserve(capacity);
  }

  /** Grows the arrays to hold `capacity` points, keeping the trace. Allocates only when it grows. */
  reserve(capacity: number): void {
    if (capacity <= this.capacity) return;
    const freqs = new Float64Array(capacity), gamma = new Float64Array(2 * capacity);
    freqs.set(this.freqs.subarray(0, this.n));
    gamma.set(this.gamma.subarray(0, 2 * this.n));
    this.freqs = freqs;
    this.gamma = gamma;
    this.backF = new Float64Array(capacity);
    this.backG = new Float64Array(2 * capacity);
    this.work = new Float64Array(capacity);
    this.turn = new Float64Array(capacity);
    this.sel = new Float64Array(capacity);
    this.capacity = capacity;
  }
}

/** Sweeps a band into the trace (one network.ts sweep). The band must pass bandProblem. */
export function sweepBand(trace: Trace, band: Band, sc: SweepCircuit): void {
  const n = band.points;
  trace.reserve(n);
  trace.n = n;
  trace.base = n;
  trace.log = band.log;
  trace.start = band.start;
  trace.stop = band.stop;
  trace.passes = 0;
  trace.added = 0;
  trace.capped = false;
  trace.limited = 0;
  bandFrequencies(trace.freqs, band.start, band.stop, n, band.log);
  sweepNetwork(trace.gamma, trace.freqs, n, sc.parts, sc.count, sc.loadR, sc.loadX, sc.z0, sc.f0);
}

// ---------------------------------------------------------------------------------------------------------------
// Refinement

export interface RefineOptions {
  /** Largest turn (radians) between consecutive chords. */
  maxAngle: number;
  /** Longest chord on the Γ plane (the chart's radius is 1). */
  maxStep: number;
  /** Most points of the refined trace (at least the band's, at most MAX_POINTS). */
  cap: number;
  /** A segment narrower than minSpan·f is not split. */
  minSpan: number;
}

export const REFINE_DEFAULTS: Readonly<RefineOptions> = { maxAngle: (5 * Math.PI) / 180, maxStep: 0.02, cap: 10_000, minSpan: 1e-9 };

/** Chords shorter than this (on the Γ plane) count no turn: their direction is rounding noise. */
export const ANGLE_FLOOR = 1e-9;

/** The k-th largest (1-based) of a[0…n − 1], by quickselect in place (deterministic: middle pivot of three). */
function kthLargest(a: Float64Array, n: number, k: number): number {
  let lo = 0, hi = n - 1;
  const target = k - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    let x = a[lo], y = a[mid], z = a[hi];
    if (x < y) { const t = x; x = y; y = t; }
    if (y < z) { const t = y; y = z; z = t; }
    if (x < y) { const t = x; x = y; y = t; }
    const pivot = y; // the median of three, sorting descending
    let i = lo, j = hi;
    while (i <= j) {
      while (a[i] > pivot) i++;
      while (a[j] < pivot) j--;
      if (i <= j) { const t = a[i]; a[i] = a[j]; a[j] = t; i++; j--; }
    }
    if (target <= j) hi = j;
    else if (target >= i) lo = i;
    else return a[target];
  }
  return a[target];
}

/**
 * Refines a swept trace where it bends (see the head of this file). Allocates nothing once the trace holds `cap`
 * points. The trace's `passes`, `added`, `capped` and `limited` say what it did.
 */
export function refine(trace: Trace, sc: SweepCircuit, options: Readonly<RefineOptions> = REFINE_DEFAULTS): void {
  const cap = Math.min(Math.max(Math.floor(options.cap), trace.n), MAX_POINTS);
  trace.reserve(cap);
  const { maxAngle, maxStep, minSpan } = options;
  const cosMax = Math.cos(maxAngle), invAngle = 1 / maxAngle, invStep = 1 / maxStep, step2 = maxStep * maxStep;
  const floor2 = ANGLE_FLOOR * ANGLE_FLOOR;
  const log = trace.log, parts = sc.parts, count = sc.count, loadR = sc.loadR, loadX = sc.loadX, z0 = sc.z0, f0 = sc.f0;
  let passes = 0, added = 0, capped = false, limited = 0;
  for (;;) {
    const n = trace.n, f = trace.freqs, g = trace.gamma, bad = trace.work, turn = trace.turn;
    // Turn at each inner vertex as a ratio to maxAngle, 0 when within it (angle > θ ⇔ a·b < |a||b|cos θ).
    turn[0] = 0;
    turn[n - 1] = 0;
    for (let v = 1, o = 2; v < n - 1; v++, o += 2) {
      const ax = g[o] - g[o - 2], ay = g[o + 1] - g[o - 1], bx = g[o + 2] - g[o], by = g[o + 3] - g[o + 1];
      const la2 = ax * ax + ay * ay, lb2 = bx * bx + by * by;
      if (!(la2 >= floor2 && lb2 >= floor2 && la2 < Infinity && lb2 < Infinity)) { turn[v] = 0; continue; }
      const dot = ax * bx + ay * by;
      turn[v] = dot < Math.sqrt(la2 * lb2) * cosMax ? Math.atan2(Math.abs(ax * by - ay * bx), dot) * invAngle : 0;
    }
    // Each segment's worst ratio, 0 when it needs no split or cannot be split.
    let need = 0;
    limited = 0;
    for (let s = 0, o = 0; s < n - 1; s++, o += 2) {
      const dx = g[o + 2] - g[o], dy = g[o + 3] - g[o + 1], d2 = dx * dx + dy * dy;
      let r = d2 > step2 && d2 < Infinity ? Math.sqrt(d2) * invStep : 0;
      if (turn[s] > r) r = turn[s];
      if (turn[s + 1] > r) r = turn[s + 1];
      if (r > 1) {
        if (f[s + 1] - f[s] <= minSpan * f[s + 1]) { r = 0; limited++; } else need++;
      } else r = 0;
      bad[s] = r;
    }
    if (need === 0) break;
    const room = cap - n;
    if (room <= 0) { capped = true; break; }
    let thr = 0, ties = 0;
    if (need > room) {
      capped = true;
      const sel = trace.sel;
      let k = 0;
      for (let s = 0; s < n - 1; s++) if (bad[s] > 0) sel[k++] = bad[s];
      thr = kthLargest(sel, k, room);
      let above = 0;
      for (let s = 0; s < n - 1; s++) if (bad[s] > thr) above++;
      ties = room - above;
    }
    const nf = trace.backF, ng = trace.backG;
    let k = 0;
    for (let s = 0, o = 0; s < n - 1; s++, o += 2) {
      nf[k] = f[s]; ng[2 * k] = g[o]; ng[2 * k + 1] = g[o + 1]; k++;
      const r = bad[s];
      if (r > 0 && (r > thr || (r === thr && ties-- > 0))) {
        const fm = log ? Math.sqrt(f[s] * f[s + 1]) : 0.5 * (f[s] + f[s + 1]);
        nf[k] = fm;
        inputGamma(ng, 2 * k, parts, count, loadR, loadX, z0, fm, f0);
        k++;
      }
    }
    nf[k] = f[n - 1]; ng[2 * k] = g[2 * n - 2]; ng[2 * k + 1] = g[2 * n - 1]; k++;
    trace.backF = f; trace.backG = g; trace.freqs = nf; trace.gamma = ng;
    added += k - n;
    trace.n = k;
    passes++;
    if (capped) break;
  }
  trace.passes = passes;
  trace.added = added;
  trace.capped = capped;
  trace.limited = limited;
}

// ---------------------------------------------------------------------------------------------------------------
// The page's drawing of a trace (M7.2a) and the worker's reply

/** Path units per unit of Γ in pathData. */
export const TRACE_SCALE = 1e9;

/**
 * An SVG path's `d` of the first n points of gamma (interleaved re, im): "M x y x y …" (pairs after M are lines) in whole
 * numbers of Γ × TRACE_SCALE, so a point is within 5e-10 of the engine's; a point that is not finite breaks the line.
 * Whole numbers print about twice as fast as doubles and give a shorter string to parse (notes-M7.2a.md).
 */
export function pathData(g: Vec, n: number): string {
  let d = '', pen = false;
  for (let i = 0, o = 0; i < n; i++, o += 2) {
    const x = g[o], y = g[o + 1];
    if (x - x !== 0 || y - y !== 0) { pen = false; continue; }
    d += (pen ? ' ' : 'M') + Math.round(x * TRACE_SCALE) + ' ' + Math.round(y * TRACE_SCALE);
    pen = true;
  }
  return d;
}

/** What sweep.worker.ts answers: the refined trace (arrays of exactly n points), its `d`, the plot's, the figures and the worker's time. */
export interface SweepReply {
  id: number;
  n: number;
  base: number;
  freqs: Float64Array<ArrayBuffer>;
  gamma: Float64Array<ArrayBuffer>;
  d: string;
  /** M7.2b: the plot's paths (plot.ts plotPath) and the band figures at the request's threshold. */
  plot: PlotPaths;
  figures: BandFigures;
  ms: number;
}

/** Sweeps a band and, unless `options` is null, refines it. */
export function runSweep(trace: Trace, band: Band, sc: SweepCircuit, options: Readonly<RefineOptions> | null = REFINE_DEFAULTS): void {
  sweepBand(trace, band, sc);
  if (options) refine(trace, sc, options);
}

// ---------------------------------------------------------------------------------------------------------------
// Lookups and markers

/** The largest i with freqs[i] ≤ f, clamped to 0…n − 2 (the segment holding f). */
export function segmentAt(trace: Trace, f: number): number {
  const fr = trace.freqs;
  let lo = 0, hi = trace.n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (fr[mid] <= f) lo = mid; else hi = mid;
  }
  return lo;
}

/** The index of the trace point nearest f in frequency (ties to the lower). */
export function nearestIndex(trace: Trace, f: number): number {
  if (trace.n < 2) return 0;
  const s = segmentAt(trace, f), fr = trace.freqs;
  return f - fr[s] <= fr[s + 1] - f ? s : s + 1;
}

/** A frequency between a and b at fraction t, in the band's spacing. */
const between = (a: number, b: number, t: number, log: boolean): number => (log ? a * (b / a) ** t : a + (b - a) * t);

export interface TracePick {
  /** Segment index and the fraction along it. */
  index: number;
  t: number;
  /** The frequency there (interpolated in the band's spacing; evaluate it with markerAt for the exact point). */
  f: number;
  /** Distance on the Γ plane from the asked point to the trace. */
  dist: number;
}

/** The point of the trace's polyline nearest (gr, gi) on the Γ plane. */
export function pickOnTrace(trace: Trace, gr: number, gi: number): TracePick {
  const g = trace.gamma, fr = trace.freqs, n = trace.n;
  let best = Infinity, bi = 0, bt = 0;
  if (n === 1) {
    best = (g[0] - gr) ** 2 + (g[1] - gi) ** 2;
  }
  for (let s = 0, o = 0; s < n - 1; s++, o += 2) {
    const ax = g[o], ay = g[o + 1], dx = g[o + 2] - ax, dy = g[o + 3] - ay;
    const l2 = dx * dx + dy * dy;
    let t = l2 > 0 ? ((gr - ax) * dx + (gi - ay) * dy) / l2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const ex = ax + t * dx - gr, ey = ay + t * dy - gi, d2 = ex * ex + ey * ey;
    if (d2 < best) { best = d2; bi = s; bt = t; }
  }
  const f = n < 2 ? fr[0] : between(fr[bi], fr[bi + 1], bt, trace.log);
  return { index: bi, t: bt, f, dist: Math.sqrt(best) };
}

/** A marker: the input point at f, z in ohms. */
export interface MarkerPoint {
  f: number;
  gr: number;
  gi: number;
  mag: number;
  vswr: number;
  /** Return loss in dB. */
  rl: number;
  zr: number;
  zi: number;
}

const Z = new Float64Array(2);

/** The input point at f (the point engine's Γ, exactly as a sweep gives it). */
export function markerAt(sc: SweepCircuit, f: number): MarkerPoint {
  inputGamma(G, 0, sc.parts, sc.count, sc.loadR, sc.loadX, sc.z0, f, sc.f0);
  const gr = G[0], gi = G[1], mag = Math.sqrt(gr * gr + gi * gi);
  zFromGamma(Z, 0, gr, gi);
  return { f, gr, gi, mag, vswr: vswr(mag), rl: returnLoss(mag), zr: Z[0] * sc.z0, zi: Z[1] * sc.z0 };
}

/** Markers at chosen frequencies. */
export const markersAt = (sc: SweepCircuit, freqs: readonly number[]): MarkerPoint[] => freqs.map((f) => markerAt(sc, f));

// ---------------------------------------------------------------------------------------------------------------
// Band figures

/** Relative width in f to which edges are bracketed and extrema polished. */
export const EDGE_TOL = 1e-12;

export interface Extremum {
  f: number;
  mag: number;
}

/** An interval of the band; an open end is the band's end, where the interval may go on. */
export interface Interval {
  lo: number;
  hi: number;
  openLo: boolean;
  openHi: boolean;
}

/** The loaded-Q estimate: the |Γ| minimum at f with |Γ| = mag, the half-power band lo…hi and Q = f/(hi − lo). */
export interface LoadedQ {
  f: number;
  mag: number;
  lo: number;
  hi: number;
  /** f/(hi − lo); an upper bound when an end is open (the band ends before the power falls to half). */
  q: number;
  openLo: boolean;
  openHi: boolean;
}

export interface BandFigures {
  start: number;
  stop: number;
  /** Largest |Γ| (worst return loss) and smallest (best). */
  worst: Extremum;
  best: Extremum;
  worstRL: number;
  bestRL: number;
  maxVswr: number;
  /** The |Γ| below which the intervals are counted. */
  threshold: number;
  /** Every interval with |Γ| < threshold, ascending. */
  intervals: Interval[];
  /** The interval holding f0 (null when f0 is outside the band or |Γ(f0)| ≥ threshold). */
  atF0: Interval | null;
  /** (hi − lo)/f0 of atF0, NaN without it. */
  fractional: number;
  /** null when no power is delivered at the minimum (a lossless circuit) or the trace has under 2 points. */
  q: LoadedQ | null;
}

const PHI = (Math.sqrt(5) - 1) / 2;
// The result of polish: where and the value (sign · |Γ|²).
let PF = 0;
let PV = 0;

/**
 * Golden-section search of sg·|Γ|² for its largest value on [a, b], starting from the known (fs, vs); the best point
 * evaluated into PF, PV (never worse than the start).
 */
function polish(sc: SweepCircuit, a: number, b: number, sg: number, fs: number, vs: number): void {
  let bf = fs, bv = vs;
  let c = b - PHI * (b - a), d = a + PHI * (b - a);
  let vc = sg * mag2At(sc, c), vd = sg * mag2At(sc, d);
  for (let it = 0; it < 200 && b - a > EDGE_TOL * Math.max(Math.abs(a), Math.abs(b)); it++) {
    if (vc >= vd) {
      if (vc > bv) { bv = vc; bf = c; }
      b = d; d = c; vd = vc; c = b - PHI * (b - a); vc = sg * mag2At(sc, c);
    } else {
      if (vd > bv) { bv = vd; bf = d; }
      a = c; c = d; vc = vd; d = a + PHI * (b - a); vd = sg * mag2At(sc, d);
    }
  }
  if (vc > bv) { bv = vc; bf = c; }
  if (vd > bv) { bv = vd; bf = d; }
  PF = bf;
  PV = bv;
}

/** The edge where |Γ|² crosses g2 between a and b (aBelow: |Γ(a)|² < g2), by bisection to EDGE_TOL relative. */
function bracket(sc: SweepCircuit, a: number, b: number, g2: number, aBelow: boolean): number {
  for (let it = 0; it < 2100 && b - a > EDGE_TOL * Math.max(Math.abs(a), Math.abs(b)); it++) {
    const m = a + 0.5 * (b - a);
    if (m <= a || m >= b) break;
    if (mag2At(sc, m) < g2 === aBelow) a = m; else b = m;
  }
  return a + 0.5 * (b - a);
}

/** The largest change of m between sample i and a neighbour. */
function spread(m: Float64Array, n: number, i: number): number {
  let d = 0;
  if (i > 0) d = Math.abs(m[i] - m[i - 1]);
  if (i < n - 1) d = Math.max(d, Math.abs(m[i] - m[i + 1]));
  return d;
}

/** Whether sample i is a local extremum of sg·m, strictly above at least one neighbour. */
function isPeak(m: Float64Array, n: number, i: number, sg: number): boolean {
  const v = sg * m[i];
  const l = i > 0 ? sg * m[i - 1] : -Infinity, r = i < n - 1 ? sg * m[i + 1] : -Infinity;
  return v >= l && v >= r && (v > l || v > r) && n > 1;
}

/** Polishes the extremum of sg·|Γ|² around sample i (between its neighbours) into PF, PV. */
function polishAt(trace: Trace, sc: SweepCircuit, m: Float64Array, i: number, sg: number): void {
  const fr = trace.freqs, n = trace.n;
  polish(sc, fr[i > 0 ? i - 1 : 0], fr[i < n - 1 ? i + 1 : n - 1], sg, fr[i], sg * m[i]);
}

/** The global extremum of sg·|Γ|²: every sample peak that could beat the best so far, polished, best first. */
function extremum(trace: Trace, sc: SweepCircuit, m: Float64Array, sg: number): Extremum {
  const n = trace.n, fr = trace.freqs;
  let bi = 0;
  for (let i = 1; i < n; i++) if (sg * m[i] > sg * m[bi]) bi = i;
  let bf = fr[bi], bv = sg * m[bi];
  // Candidates with their bound (a smooth peak between samples exceeds its best sample by under the spread).
  const cand: number[] = [];
  for (let i = 0; i < n; i++) if (isPeak(m, n, i, sg) && sg * m[i] + spread(m, n, i) >= bv) cand.push(i);
  const bound = (i: number): number => sg * m[i] + spread(m, n, i);
  cand.sort((x, y) => bound(y) - bound(x) || x - y);
  for (const i of cand) {
    if (bound(i) <= bv && i !== bi) break;
    polishAt(trace, sc, m, i, sg);
    if (PV > bv) { bv = PV; bf = PF; }
  }
  return { f: bf, mag: Math.sqrt(sg * bv) };
}

/**
 * The band's figures from a swept (and usually refined) trace: see the head of this file. `threshold` is a |Γ|
 * (from magFromVswr or magFromReturnLoss for a VSWR or return-loss limit).
 */
export function bandFigures(trace: Trace, sc: SweepCircuit, threshold: number, f0 = sc.f0): BandFigures {
  const n = trace.n, fr = trace.freqs, g = trace.gamma, m = trace.work, start = trace.start, stop = trace.stop;
  for (let i = 0; i < n; i++) m[i] = g[2 * i] * g[2 * i] + g[2 * i + 1] * g[2 * i + 1];
  const worst = extremum(trace, sc, m, 1);
  const best = extremum(trace, sc, m, -1);
  const g2 = threshold * threshold;

  // Samples near the threshold whose dip or bump could cross it between samples: polished, kept when they cross.
  const extraF: number[] = [], extraM: number[] = [];
  for (let i = 0; i < n; i++) {
    const v = m[i], d = spread(m, n, i);
    if (v >= g2 && v - d < g2 && isPeak(m, n, i, -1)) {
      polishAt(trace, sc, m, i, -1);
      if (-PV < g2) { extraF.push(PF); extraM.push(-PV); }
    } else if (v < g2 && v + d >= g2 && isPeak(m, n, i, 1)) {
      polishAt(trace, sc, m, i, 1);
      if (PV >= g2) { extraF.push(PF); extraM.push(PV); }
    }
  }
  const order = extraF.map((_, k) => k).sort((a, b) => extraF[a] - extraF[b] || a - b);

  // Walk samples and extra points in frequency order; bracket every change of side.
  const intervals: Interval[] = [];
  let pf = fr[0], pBelow = m[0] < g2, lo = start, openLo = pBelow;
  const visit = (f: number, below: boolean): void => {
    if (below !== pBelow) {
      const e = bracket(sc, pf, f, g2, pBelow);
      if (below) { lo = e; openLo = false; } else intervals.push({ lo, hi: e, openLo, openHi: false });
      pBelow = below;
    }
    pf = f;
  };
  for (let i = 1, j = 0; i < n; i++) {
    const f = fr[i];
    for (; j < order.length && extraF[order[j]] < f; j++) {
      const k = order[j];
      if (extraF[k] > pf) visit(extraF[k], extraM[k] < g2);
    }
    visit(f, m[i] < g2);
  }
  if (pBelow) intervals.push({ lo, hi: stop, openLo, openHi: true });

  // The interval around f0; found by walking out from f0 when the samples missed it.
  let atF0: Interval | null = null;
  if (n >= 2 && f0 >= start && f0 <= stop) {
    for (const iv of intervals) if (iv.lo <= f0 && f0 <= iv.hi) { atF0 = iv; break; }
    if (!atF0 && mag2At(sc, f0) < g2) {
      atF0 = halfBand(trace, sc, m, f0, g2);
      let at = 0;
      while (at < intervals.length && intervals[at].lo < atF0.lo) at++;
      intervals.splice(at, 0, atF0);
    }
  }
  const fractional = atF0 ? (atF0.hi - atF0.lo) / f0 : NaN;

  return {
    start, stop, worst, best,
    worstRL: returnLoss(worst.mag), bestRL: returnLoss(best.mag), maxVswr: vswr(worst.mag),
    threshold, intervals, atF0, fractional,
    q: n >= 2 ? loadedQ(trace, sc, m, f0) : null,
  };
}

/**
 * The interval around f (where |Γ(f)|² < g2): walk the samples out from f on each side to the first at or above g2
 * and bracket the edge; an end with none is the band's end, open.
 */
function halfBand(trace: Trace, sc: SweepCircuit, m: Float64Array, f: number, g2: number): Interval {
  const fr = trace.freqs, n = trace.n, s = segmentAt(trace, f);
  let lo = trace.start, hi = trace.stop, openLo = true, openHi = true;
  let inner = f;
  for (let i = s; i >= 0; i--) {
    if (fr[i] >= f) continue;
    if (m[i] >= g2) { lo = bracket(sc, fr[i], inner, g2, false); openLo = false; break; }
    inner = fr[i];
  }
  inner = f;
  for (let i = s + 1; i < n; i++) {
    if (fr[i] <= f) continue;
    if (m[i] >= g2) { hi = bracket(sc, inner, fr[i], g2, true); openHi = false; break; }
    inner = fr[i];
  }
  return { lo, hi, openLo, openHi };
}

/** The loaded-Q estimate around the |Γ| minimum nearest f0 (the band's best when f0 is outside the band). */
function loadedQ(trace: Trace, sc: SweepCircuit, m: Float64Array, f0: number): LoadedQ | null {
  const fr = trace.freqs, n = trace.n;
  let j: number;
  if (f0 >= trace.start && f0 <= trace.stop) {
    const s = segmentAt(trace, f0);
    j = m[s + 1] < m[s] ? s + 1 : s;
    if (j > 0 && m[j - 1] < m[j]) while (j > 0 && m[j - 1] < m[j]) j--;
    else while (j < n - 1 && m[j + 1] < m[j]) j++;
  } else {
    j = 0;
    for (let i = 1; i < n; i++) if (m[i] < m[j]) j = i;
  }
  polishAt(trace, sc, m, j, -1);
  let fm = PF, m2 = -PV;
  // f0 itself when it is as low as the minimum (to rounding): a flat |Γ| or a minimum at f0.
  if (f0 >= trace.start && f0 <= trace.stop) {
    const m0 = mag2At(sc, f0);
    if (m0 - m2 <= 1e-12 * m2 + 1e-15) { fm = f0; m2 = m0; }
  }
  if (!(m2 < 1 - 1e-12)) return null;
  const level = 0.5 * (1 + m2);
  const band = halfBand(trace, sc, m, fm, level);
  return { f: fm, mag: Math.sqrt(m2), lo: band.lo, hi: band.hi, q: fm / (band.hi - band.lo), openLo: band.openLo, openHi: band.openHi };
}
