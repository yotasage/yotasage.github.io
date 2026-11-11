// The geometry of the chart (docs/smith-chart/engine.md §3, §5, §6): Möbius maps of the parts on the Γ plane,
// generalised circles, each part's locus as a circle through its start node, the arc a part draws (exact circle arcs
// for SVG), the projection of a point (the pointer) onto what a part can reach and back to a value, continuous
// length tracking for lines and stubs, and an adaptive polyline sampler for curves that are not circles.
//
// Everything is in Γ coordinates with Γi pointing up (engine.md §1); the flip to SVG's downward y and the chart's
// transform are the drawing boundary's job (M2). The functions that run per frame (partArcs, partArc, partLocus,
// locusPoint, locusValue, project, projectOnCircle, samplePolyline) allocate nothing: they write into arrays the
// caller owns and use module scratch.
//
// Parametrisation. A lumped part or stub adds a real p (r, x, g or b, normalised) to z or y of its start node Γs; a
// λ/4 transformer at f0 multiplies z by s = (Zt/Z0)² against 1/z_L. Each is a Möbius map of the real p:
//   Γ(p) = (αp + β)/(γp + δ):  series  α = γ = u(1 − Γs), β = 2Γs, δ = 2;   shunt  γ = u(1 + Γs) = −α, β = 2Γs, δ = 2;
//   λ/4 at f0  α = γ = 1 − Γs, β = −(1 + Γs), δ = 1 + Γs;   u = 1 for R, j for L, C and stubs.
// So the locus is the image of the real line (a generalised circle) and p of a point is (δΓ − β)/(α − γΓ), real on
// the locus. A line rotates Γo = (Γ − B)/(1 − BΓ), B = (zc − 1)/(zc + 1), by −4π·turns (clockwise) about the centre of
// its own chart; its locus is the image of |Γo| = ρ.

import { cdiv, csqrt } from './complex';
import type { Vec } from './complex';
import { nodeGamma, NODE_STRIDE } from './network';
import * as P from './parts';
import {
  LINE, PART_STRIDE, QUARTER, REACH_HI, REACH_LO, SERIES_C, SERIES_R, SHUNT_R, STUB_OPEN, STUB_SHORT,
  added, noEffect, partMatrix, sincosTurns, valueFor,
} from './parts';

const TAU = 2 * Math.PI;
const HALF_PI = 0.5 * Math.PI;
const tmp = new Float64Array(8);
const mp = new Float64Array(8);

// ---------------------------------------------------------------------------------------------------------------
// Möbius maps: 8 numbers (a re, a im, b re, b im, c re, c im, d re, d im), Γ → (aΓ + b)/(cΓ + d), defined up to a
// non-zero factor (only the ratio matters; never rely on the determinant).

export const MOB_STRIDE = 8;

/**
 * The map Γ_in = M(Γ_out) of a part at f: its normalised ABCD matrix [[A, B], [C, D]] (parts.ts partMatrix) acts on z
 * as (Az + B)/(Cz + D); conjugated by Γ = (z − 1)/(z + 1) it is [[A − B − C + D, A + B − C − D], [A − B + C − D,
 * A + B + C + D]]. Rank 1 for a series open or a shunt short (their image is the one point open or short).
 */
export function partMobius(m: Vec, o: number, kind: number, value: number, zc: number, f: number, f0: number, z0: number): void {
  partMatrix(tmp, 0, kind, value, zc, f, f0, z0);
  const ar = tmp[0], ai = tmp[1], br = tmp[2], bi = tmp[3], cr = tmp[4], ci = tmp[5], dr = tmp[6], di = tmp[7];
  m[o] = ar - br - cr + dr; m[o + 1] = ai - bi - ci + di;
  m[o + 2] = ar + br - cr - dr; m[o + 3] = ai + bi - ci - di;
  m[o + 4] = ar - br + cr - dr; m[o + 5] = ai - bi + ci - di;
  m[o + 6] = ar + br + cr + dr; m[o + 7] = ai + bi + ci + di;
}

/** out = M(Γ). Γ infinite gives a/c; a rank-1 map at its kernel point (0/0) gives its image point. */
export function mobApply(out: Vec, o: number, m: Vec, mo: number, gr: number, gi: number): void {
  const ar = m[mo], ai = m[mo + 1], br = m[mo + 2], bi = m[mo + 3], cr = m[mo + 4], ci = m[mo + 5], dr = m[mo + 6], di = m[mo + 7];
  if (!(Math.abs(gr) < Infinity && Math.abs(gi) < Infinity)) { cdiv(out, o, ar, ai, cr, ci); return; }
  const nr = ar * gr - ai * gi + br, ni = ar * gi + ai * gr + bi;
  const er = cr * gr - ci * gi + dr, ei = cr * gi + ci * gr + di;
  if (nr === 0 && ni === 0 && er === 0 && ei === 0) {
    if (cr !== 0 || ci !== 0) cdiv(out, o, ar, ai, cr, ci); else cdiv(out, o, br, bi, dr, di);
    return;
  }
  cdiv(out, o, nr, ni, er, ei);
}

// Rescales 8 numbers by a power of two so the largest is in [0.5, 1) (exact; keeps products of many maps finite).
function rescale(m: Vec, o: number, n: number): void {
  let big = 0;
  for (let k = 0; k < n; k++) { const v = Math.abs(m[o + k]); if (v > big) big = v; }
  if (big === 0 || !(big < Infinity) || (big >= 2 ** -64 && big <= 2 ** 64)) return;
  const e = -Math.round(Math.log2(big)), h = e >> 1, s1 = 2 ** h, s2 = 2 ** (e - h);
  for (let k = 0; k < n; k++) m[o + k] = m[o + k] * s1 * s2;
}

/** out = M1 ∘ M2 (M2 applied first). out may be either input. */
export function mobCompose(out: Vec, o: number, m1: Vec, o1: number, m2: Vec, o2: number): void {
  const ar = m1[o1], ai = m1[o1 + 1], br = m1[o1 + 2], bi = m1[o1 + 3], cr = m1[o1 + 4], ci = m1[o1 + 5], dr = m1[o1 + 6], di = m1[o1 + 7];
  const er = m2[o2], ei = m2[o2 + 1], fr = m2[o2 + 2], fi = m2[o2 + 3], gr = m2[o2 + 4], gi = m2[o2 + 5], hr = m2[o2 + 6], hi = m2[o2 + 7];
  out[o] = ar * er - ai * ei + br * gr - bi * gi; out[o + 1] = ar * ei + ai * er + br * gi + bi * gr;
  out[o + 2] = ar * fr - ai * fi + br * hr - bi * hi; out[o + 3] = ar * fi + ai * fr + br * hi + bi * hr;
  out[o + 4] = cr * er - ci * ei + dr * gr - di * gi; out[o + 5] = cr * ei + ci * er + dr * gi + di * gr;
  out[o + 6] = cr * fr - ci * fi + dr * hr - di * hi; out[o + 7] = cr * fi + ci * fr + dr * hi + di * hr;
  rescale(out, o, 8);
}

/** out = M⁻¹ by the adjugate [[d, −b], [−c, a]]. out may be m. */
export function mobInvert(out: Vec, o: number, m: Vec, mo: number): void {
  const ar = m[mo], ai = m[mo + 1], br = m[mo + 2], bi = m[mo + 3], cr = m[mo + 4], ci = m[mo + 5], dr = m[mo + 6], di = m[mo + 7];
  out[o] = dr; out[o + 1] = di; out[o + 2] = -br; out[o + 3] = -bi;
  out[o + 4] = -cr; out[o + 5] = -ci; out[o + 6] = ar; out[o + 7] = ai;
}

// ---------------------------------------------------------------------------------------------------------------
// Generalised circles: 4 numbers (A, Dr, Di, C) for A|w|² − 2(Dr·wr + Di·wi) + C = 0, scaled so the largest is 1.
// A ≠ 0: centre D/A, radius √(|D|² − AC)/|A|; A = 0: a straight line; all zero: no constraint (a degenerate locus).

export const CIRCLE_STRIDE = 4;

function normaliseCircle(c: Vec, o: number): void {
  const big = Math.max(Math.abs(c[o]), Math.abs(c[o + 1]), Math.abs(c[o + 2]), Math.abs(c[o + 3]));
  if (big > 0 && big < Infinity) { const s = 1 / big; c[o] *= s; c[o + 1] *= s; c[o + 2] *= s; c[o + 3] *= s; }
}

/** The generalised circle through three points (a line when they are collinear). */
export function circleThrough(out: Vec, o: number, x1: number, y1: number, x2: number, y2: number, x3: number, y3: number): void {
  const ux = x2 - x1, uy = y2 - y1, vx = x3 - x1, vy = y3 - y1;
  const su = ux * ux + uy * uy, sv = vx * vx + vy * vy;
  const A = 2 * (ux * vy - uy * vx);
  const dx = su * vy - sv * uy, dy = ux * sv - vx * su; // D of the circle through the origin, u and v
  out[o] = A;
  out[o + 1] = A * x1 + dx;
  out[o + 2] = A * y1 + dy;
  out[o + 3] = A * (x1 * x1 + y1 * y1) + 2 * (dx * x1 + dy * y1);
  normaliseCircle(out, o);
}

/** The image of a generalised circle under a Möbius map: H′ = N*·H·N with N = adj(M), H = [[A, −D], [−D̄, C]]. */
export function circleImage(out: Vec, o: number, circ: Vec, co: number, m: Vec, mo: number): void {
  const A = circ[co], Dr = circ[co + 1], Di = circ[co + 2], C = circ[co + 3];
  // N = [[d, −b], [−c, a]]
  const n11r = m[mo + 6], n11i = m[mo + 7], n12r = -m[mo + 2], n12i = -m[mo + 3];
  const n21r = -m[mo + 4], n21i = -m[mo + 5], n22r = m[mo], n22i = m[mo + 1];
  // conj(x)·D·y, real and imaginary parts
  let tr = n11r * Dr + n11i * Di, ti = n11r * Di - n11i * Dr; // conj(n11)·D
  const a11 = A * (n11r * n11r + n11i * n11i) - 2 * (tr * n21r - ti * n21i) + C * (n21r * n21r + n21i * n21i);
  const t2r = tr * n22r - ti * n22i, t2i = tr * n22i + ti * n22r; // conj(n11)·D·n22
  const c12r = n11r * n12r + n11i * n12i, c12i = n11r * n12i - n11i * n12r; // conj(n11)·n12
  // conj(n21)·conj(D) = conj(n21·D)
  const sr = n21r * Dr - n21i * Di, si = -(n21r * Di + n21i * Dr);
  const t3r = sr * n12r - si * n12i, t3i = sr * n12i + si * n12r;
  const c22r = n21r * n22r + n21i * n22i, c22i = n21r * n22i - n21i * n22r; // conj(n21)·n22
  const h12r = A * c12r - t2r - t3r + C * c22r, h12i = A * c12i - t2i - t3i + C * c22i;
  tr = n12r * Dr + n12i * Di; ti = n12r * Di - n12i * Dr; // conj(n12)·D
  const a22 = A * (n12r * n12r + n12i * n12i) - 2 * (tr * n22r - ti * n22i) + C * (n22r * n22r + n22i * n22i);
  out[o] = a11; out[o + 1] = -h12r; out[o + 2] = -h12i; out[o + 3] = a22;
  normaliseCircle(out, o);
}

/** Centre and radius into out[o…o+2]; a line gives (0, 0, Infinity). */
export function circleCentre(out: Vec, o: number, circ: Vec, co: number): void {
  const A = circ[co], Dr = circ[co + 1], Di = circ[co + 2], C = circ[co + 3];
  if (A === 0) { out[o] = 0; out[o + 1] = 0; out[o + 2] = Infinity; return; }
  const s = Dr * Dr + Di * Di - A * C;
  out[o] = Dr / A; out[o + 1] = Di / A; out[o + 2] = Math.sqrt(s > 0 ? s : 0) / Math.abs(A);
}

/** The value of the circle's form at a point divided by its gradient's length: the signed distance near the circle. */
export function circleResidual(circ: Vec, co: number, x: number, y: number): number {
  const A = circ[co], Dr = circ[co + 1], Di = circ[co + 2], C = circ[co + 3];
  const f = A * (x * x + y * y) - 2 * (Dr * x + Di * y) + C;
  const g = 2 * Math.hypot(A * x - Dr, A * y - Di);
  return g > 0 ? f / g : f;
}

/**
 * The nearest point of a generalised circle to (px, py), into out[o], out[o + 1]. Stable for any radius (no centre
 * is formed): P − f·(AP − D)/(|AP − D|·(|AP − D| + √(|D|² − AC))). The centre itself projects to the circle's point
 * at angle 0; a degenerate circle returns the point.
 */
export function projectOnCircle(out: Vec, o: number, circ: Vec, co: number, px: number, py: number): void {
  const A = circ[co], Dr = circ[co + 1], Di = circ[co + 2], C = circ[co + 3];
  const f = A * (px * px + py * py) - 2 * (Dr * px + Di * py) + C;
  const gx = A * px - Dr, gy = A * py - Di, g = Math.hypot(gx, gy);
  const s2 = Dr * Dr + Di * Di - A * C, S = Math.sqrt(s2 > 0 ? s2 : 0);
  if (g === 0) {
    if (A !== 0) { out[o] = Dr / A + S / Math.abs(A); out[o + 1] = Di / A; } else { out[o] = px; out[o + 1] = py; }
    return;
  }
  const k = f / (g * (g + S));
  out[o] = px - k * gx;
  out[o + 1] = py - k * gy;
}

// ---------------------------------------------------------------------------------------------------------------
// The parameter maps of lumped parts, stubs and the λ/4 transformer at f0 (see the head of the file).

function paramMap(m: Vec, o: number, kind: number, sr: number, si: number): void {
  if (kind === QUARTER) {
    m[o] = 1 - sr; m[o + 1] = -si; m[o + 2] = -(1 + sr); m[o + 3] = -si;
    m[o + 4] = 1 - sr; m[o + 5] = -si; m[o + 6] = 1 + sr; m[o + 7] = si;
    return;
  }
  const series = kind <= SERIES_C;
  let vr = series ? 1 - sr : 1 + sr, vi = series ? -si : si;
  if (kind !== SERIES_R && kind !== SHUNT_R) { const t = vr; vr = -vi; vi = t; } // × j
  m[o] = series ? vr : -vr; m[o + 1] = series ? vi : -vi;
  m[o + 2] = 2 * sr; m[o + 3] = 2 * si;
  m[o + 4] = vr; m[o + 5] = vi;
  m[o + 6] = 2; m[o + 7] = 0;
}

const mapDegenerate = (m: Vec, o: number): boolean => {
  const dr = m[o] * m[o + 6] - m[o + 1] * m[o + 7] - (m[o + 2] * m[o + 4] - m[o + 3] * m[o + 5]);
  const di = m[o] * m[o + 7] + m[o + 1] * m[o + 6] - (m[o + 2] * m[o + 5] + m[o + 3] * m[o + 4]);
  // The entries are O(1) for |Γs| ≤ 1: a determinant this small (Γs within 1e-140 of the open or short) moves no
  // point by a representable amount, and its circle's coefficients would underflow.
  return !(Math.abs(dr) + Math.abs(di) > 1e-280);
};

// The image of the real line under the parameter map: Im[(δΓ − β)·conj(α − γΓ)] = 0, i.e. A = −Im(δγ̄),
// D = −(Im K, Re K)/2 with K = δᾱ − β̄γ, C = −Im(βᾱ).
function paramCircle(m: Vec, o: number, out: Vec, co: number): void {
  const ar = m[o], ai = m[o + 1], br = m[o + 2], bi = m[o + 3], gr = m[o + 4], gi = m[o + 5], dr = m[o + 6], di = m[o + 7];
  const Kr = dr * ar + di * ai - (br * gr + bi * gi);
  const Ki = di * ar - dr * ai - (br * gi - bi * gr);
  out[co] = dr * gi - di * gr;
  out[co + 1] = -0.5 * Ki;
  out[co + 2] = -0.5 * Kr;
  out[co + 3] = br * ai - bi * ar;
  normaliseCircle(out, co);
}

// Γ(p) of a parameter map; p = ±∞ gives α/γ.
function mapAt(out: Vec, o: number, m: Vec, mo: number, p: number): void {
  const ar = m[mo], ai = m[mo + 1], br = m[mo + 2], bi = m[mo + 3], gr = m[mo + 4], gi = m[mo + 5], dr = m[mo + 6], di = m[mo + 7];
  if (p === Infinity || p === -Infinity) cdiv(out, o, ar, ai, gr, gi);
  else if (Math.abs(p) > 1) { const s = 1 / p; cdiv(out, o, ar + br * s, ai + bi * s, gr + dr * s, gi + di * s); }
  else cdiv(out, o, ar * p + br, ai * p + bi, gr * p + dr, gi * p + di);
}

// p of a point: Re[(δΓ − β)/(α − γΓ)]; the point α/γ gives Infinity.
function paramAt(m: Vec, mo: number, gr: number, gi: number): number {
  const ar = m[mo], ai = m[mo + 1], br = m[mo + 2], bi = m[mo + 3], cr = m[mo + 4], ci = m[mo + 5], dr = m[mo + 6], di = m[mo + 7];
  const nr = dr * gr - di * gi - br, ni = dr * gi + di * gr - bi;
  const er = ar - (cr * gr - ci * gi), ei = ai - (cr * gi + ci * gr);
  if (er === 0 && ei === 0) return Infinity;
  cdiv(tmp, 0, nr, ni, er, ei);
  return tmp[0];
}

const paramOf = (kind: number, value: number, zc: number, f: number, f0: number, z0: number): number =>
  kind === QUARTER ? (value / z0) * (value / z0) : added(kind, value, zc, f, f0, z0);

/**
 * The nearest value to `prev` of the lengths candidate + n·period that are ≥ 0 (engine.md §6: a length is tracked
 * continuously, so a drag twice round gives two turns, not a jump back). A drag back past 0 stays at 0 until the
 * pointer comes round to a candidate nearer than 0. prev NaN or negative: the candidate itself.
 */
export function trackLength(candidate: number, prev: number, period: number): number {
  if (!(prev >= 0 && prev < Infinity)) return candidate;
  const v = candidate + Math.round((prev - candidate) / period) * period;
  if (v >= 0) return v;
  return Math.abs(prev - candidate) < prev ? candidate : 0;
}

// The value of a parameter, within the part's reach: p beyond the reach's 0 end is the value of no effect; the point
// at p = ±∞ is the reach's infinite end; a stub's length is tracked from prev.
function valueOfParam(kind: number, p: number, zc: number, f: number, f0: number, z0: number, prev: number): number {
  if (kind === QUARTER) return p > 0 ? z0 * Math.sqrt(p) : 0;
  if (kind === STUB_OPEN || kind === STUB_SHORT) return trackLength(valueFor(kind, p, zc, f, f0, z0), prev, (0.5 * f0) / f);
  const lo = REACH_LO[kind], hi = REACH_HI[kind];
  if (p === Infinity || p === -Infinity) p = hi === Infinity ? Infinity : -Infinity;
  if (p === 0 || (hi === 0 && p > 0) || (lo === 0 && p < 0)) return noEffect(kind, f, f0);
  return valueFor(kind, p, zc, f, f0, z0);
}

// ---------------------------------------------------------------------------------------------------------------
// A part's locus: where the end of the part goes as its value changes, from a fixed start node. LOCUS_STRIDE
// numbers; the circle (for LOCUS_MOBIUS and LOCUS_LINE) at L_A, usable with the circle functions above.

export const LOCUS_FIXED = 0;   // every value gives the start (series part at the open, shunt at the short, matched line)
export const LOCUS_MOBIUS = 1;  // lumped parts, stubs, λ/4 at f0: the image of the real line
export const LOCUS_LINE = 2;    // a line: the image of |Γo| = ρ
export const LOCUS_NUMERIC = 3; // λ/4 at f ≠ f0 (Zt changes Γ along a curve that is not a circle)

export const L_MODE = 0;
export const L_KIND = 1;
export const L_A = 2;       // circle (A, Dr, Di, C) at 2…5
export const L_MAP = 6;     // parameter map α, β, γ, δ at 6…13
export const L_LO = 14;     // reach of the parameter
export const L_HI = 15;
export const L_Z0 = 16;
export const L_ZC = 17;
export const L_F = 18;
export const L_F0 = 19;
export const L_SR = 20;     // start node Γ
export const L_SI = 21;
export const L_B = 22;      // line: B, ρ, ψ of the start in its own chart, Γo of the start
export const L_RHO = 23;
export const L_PSI = 24;
export const L_OR = 25;
export const L_OI = 26;
export const LOCUS_STRIDE = 27;

/** The locus of a part of this kind from the start node Γs = (sr, si) at f, into loc[l…]. */
export function partLocus(loc: Vec, l: number, kind: number, zc: number, sr: number, si: number, z0: number, f: number, f0: number): void {
  loc[l + L_MODE] = LOCUS_FIXED; loc[l + L_KIND] = kind;
  loc[l + L_A] = 0; loc[l + L_A + 1] = 0; loc[l + L_A + 2] = 0; loc[l + L_A + 3] = 0;
  loc[l + L_LO] = 0; loc[l + L_HI] = Infinity;
  loc[l + L_Z0] = z0; loc[l + L_ZC] = zc; loc[l + L_F] = f; loc[l + L_F0] = f0; loc[l + L_SR] = sr; loc[l + L_SI] = si;
  if (!(Math.abs(sr) < Infinity && Math.abs(si) < Infinity)) return;
  if (kind === LINE) {
    const zn = zc / z0, B = (zn - 1) / (zn + 1);
    cdiv(tmp, 0, sr - B, si, 1 - B * sr, -B * si);
    const or = tmp[0], oi = tmp[1], rho = Math.hypot(or, oi);
    loc[l + L_B] = B; loc[l + L_RHO] = rho; loc[l + L_PSI] = Math.atan2(oi, or); loc[l + L_OR] = or; loc[l + L_OI] = oi;
    if (rho === 0) return;
    loc[l + L_MODE] = LOCUS_LINE;
    loc[l + L_A] = 1 - rho * rho * B * B; loc[l + L_A + 1] = B * (1 - rho * rho); loc[l + L_A + 2] = 0; loc[l + L_A + 3] = B * B - rho * rho;
    normaliseCircle(loc, l + L_A);
    return;
  }
  if (kind === QUARTER && f !== f0) { loc[l + L_MODE] = LOCUS_NUMERIC; return; }
  paramMap(loc, l + L_MAP, kind, sr, si);
  if (mapDegenerate(loc, l + L_MAP)) return;
  paramCircle(loc, l + L_MAP, loc, l + L_A);
  if (kind !== QUARTER) {
    const stub = kind === STUB_OPEN || kind === STUB_SHORT;
    loc[l + L_LO] = stub ? -Infinity : REACH_LO[kind]; loc[l + L_HI] = stub ? Infinity : REACH_HI[kind];
  }
  loc[l + L_MODE] = LOCUS_MOBIUS;
}

/** The locus of part k (0-based, from the load) of an evaluated ladder: from node k. */
export function nodeLocus(loc: Vec, l: number, nodes: Vec, parts: Vec, k: number, z0: number, f: number, f0: number): void {
  nodeGamma(tmp, 0, nodes, k * NODE_STRIDE);
  const p = k * PART_STRIDE;
  partLocus(loc, l, parts[p], parts[p + 2], tmp[0], tmp[1], z0, f, f0);
}

// λ/4 transformer away from f0: the line of Zt (normalised zt) at θ = π/2·f/f0 from the start.
function quarterPoint(out: Vec, o: number, sr: number, si: number, zt: number, f: number, f0: number): void {
  if (zt === 0) { out[o] = -1; out[o + 1] = 0; return; }
  if (zt === Infinity) { out[o] = 1; out[o + 1] = 0; return; }
  const B = (zt - 1) / (zt + 1);
  cdiv(tmp, 0, sr - B, si, 1 - B * sr, -B * si);
  const or = tmp[0], oi = tmp[1];
  sincosTurns(0.5 * (f / f0));
  const c = P.COS, s = P.SIN, gr = or * c + oi * s, gi = oi * c - or * s;
  cdiv(out, o, gr + B, gi, 1 + B * gr, B * gi);
}

/** Γ at the end of the part with this value (the part's own unit: Ω, H, F, wavelengths at f0, Zt in Ω). */
export function locusPoint(out: Vec, o: number, loc: Vec, l: number, value: number): void {
  const mode = loc[l + L_MODE], kind = loc[l + L_KIND];
  if (mode === LOCUS_MOBIUS) {
    mapAt(out, o, loc, l + L_MAP, paramOf(kind, value, loc[l + L_ZC], loc[l + L_F], loc[l + L_F0], loc[l + L_Z0]));
  } else if (mode === LOCUS_LINE) {
    sincosTurns(2 * value * (loc[l + L_F] / loc[l + L_F0]));
    const c = P.COS, s = P.SIN, or = loc[l + L_OR], oi = loc[l + L_OI], B = loc[l + L_B];
    const gr = or * c + oi * s, gi = oi * c - or * s;
    cdiv(out, o, gr + B, gi, 1 + B * gr, B * gi);
  } else if (mode === LOCUS_NUMERIC) {
    quarterPoint(out, o, loc[l + L_SR], loc[l + L_SI], value / loc[l + L_Z0], loc[l + L_F], loc[l + L_F0]);
  } else { out[o] = loc[l + L_SR]; out[o + 1] = loc[l + L_SI]; }
}

// A line's length for a point of its locus: the clockwise angle from the start in its own chart.
function lineValue(loc: Vec, l: number, gr: number, gi: number, prev: number): number {
  const B = loc[l + L_B];
  cdiv(tmp, 0, gr - B, gi, 1 - B * gr, -B * gi);
  let d = loc[l + L_PSI] - Math.atan2(tmp[1], tmp[0]);
  d -= TAU * Math.floor(d / TAU);
  const period = (0.5 * loc[l + L_F0]) / loc[l + L_F];
  return trackLength((d / TAU) * period, prev, period);
}

// Zt of a point of a λ/4 transformer's locus away from f0: the real positive root of
// jS(1 − Γs)(1 − Γ)·zt² + 2C(Γs − Γ)·zt − jS(1 + Γ)(1 + Γs) = 0 (S, C = sin, cos θ), nearest prev.
function quarterValue(loc: Vec, l: number, gr: number, gi: number, prev: number): number {
  const sr = loc[l + L_SR], si = loc[l + L_SI], z0 = loc[l + L_Z0];
  sincosTurns(0.25 * (loc[l + L_F] / loc[l + L_F0]));
  const S = P.SIN, C = P.COS;
  const m1r = (1 - sr) * (1 - gr) - si * gi, m1i = -(1 - sr) * gi - si * (1 - gr);
  const m2r = (1 + gr) * (1 + sr) - gi * si, m2i = (1 + gr) * si + gi * (1 + sr);
  const ar = -S * m1i, ai = S * m1r, br = 2 * C * (sr - gr), bi = 2 * C * (si - gi), cr = S * m2i, ci = -S * m2r;
  // q = −(b + sign·√(b² − 4ac))/2, roots q/a and c/q
  const dr = br * br - bi * bi - 4 * (ar * cr - ai * ci), di = 2 * br * bi - 4 * (ar * ci + ai * cr);
  csqrt(tmp, 0, dr, di);
  let qr = tmp[0], qi = tmp[1];
  if (br * qr + bi * qi < 0) { qr = -qr; qi = -qi; }
  qr = -0.5 * (br + qr); qi = -0.5 * (bi + qi);
  let best = NaN, score = Infinity;
  for (let k = 0; k < 2; k++) {
    if (k === 0) cdiv(tmp, 0, qr, qi, ar, ai); else cdiv(tmp, 0, cr, ci, qr, qi);
    const xr = tmp[0], xi = tmp[1], mag = Math.hypot(xr, xi);
    if (!(xr > 0 && mag < Infinity)) continue;
    const s = Math.abs(xi) / mag + (prev >= 0 ? 1e-9 * Math.abs(Math.log((xr * z0) / prev)) : 0);
    if (s < score) { score = s; best = xr * z0; }
  }
  if (best === best && score < 1e-6) return best;
  // Not on the curve to working precision (or a degenerate load): the nearest point by search.
  return quarterProject(tmp, 4, loc, l, gr, gi);
}

// Nearest point of the λ/4 transformer's curve away from f0: zt = tan u, u in [0, π/2], 64 samples, then golden
// section. Returns Zt (Ω) and writes the point.
const QUARTER_SAMPLES = 128;
function quarterDist(loc: Vec, l: number, u: number, px: number, py: number): number {
  quarterPoint(tmp, 6, loc[l + L_SR], loc[l + L_SI], u >= HALF_PI ? Infinity : Math.tan(u), loc[l + L_F], loc[l + L_F0]);
  const dx = tmp[6] - px, dy = tmp[7] - py;
  return dx * dx + dy * dy;
}
const qd = new Float64Array(QUARTER_SAMPLES + 1);
const GOLD = 0.5 * (Math.sqrt(5) - 1);
function quarterProject(out: Vec, o: number, loc: Vec, l: number, px: number, py: number): number {
  const step = HALF_PI / QUARTER_SAMPLES;
  let bestU = 0, best = Infinity;
  for (let k = 0; k <= QUARTER_SAMPLES; k++) {
    const d = quarterDist(loc, l, step * k, px, py);
    qd[k] = d;
    if (d < best) { best = d; bestU = step * k; }
  }
  // Golden section around every local minimum of the samples (the curve can come near the pointer more than once).
  for (let k = 0; k <= QUARTER_SAMPLES; k++) {
    if ((k > 0 && qd[k] > qd[k - 1]) || (k < QUARTER_SAMPLES && qd[k] > qd[k + 1])) continue;
    let a = Math.max(0, step * (k - 1)), b = Math.min(HALF_PI, step * (k + 1));
    let c = b - GOLD * (b - a), d = a + GOLD * (b - a), fc = quarterDist(loc, l, c, px, py), fd = quarterDist(loc, l, d, px, py);
    for (let j = 0; j < 50; j++) {
      if (fc < fd) { b = d; d = c; fd = fc; c = b - GOLD * (b - a); fc = quarterDist(loc, l, c, px, py); }
      else { a = c; c = d; fc = fd; d = a + GOLD * (b - a); fd = quarterDist(loc, l, d, px, py); }
    }
    if (fc < best) { best = fc; bestU = c; }
    if (fd < best) { best = fd; bestU = d; }
  }
  const u = bestU;
  const zt = u >= HALF_PI ? Infinity : Math.tan(u);
  quarterPoint(out, o, loc[l + L_SR], loc[l + L_SI], zt, loc[l + L_F], loc[l + L_F0]);
  return zt * loc[l + L_Z0];
}

/**
 * The value of a point of the locus (as from projectOnCircle or locusPoint). prev is the part's value before (lines
 * and stubs are tracked from it; a fixed locus returns it). Lumped values beyond their reach give the end in reach.
 */
export function locusValue(loc: Vec, l: number, gr: number, gi: number, prev: number): number {
  const mode = loc[l + L_MODE];
  if (mode === LOCUS_MOBIUS) {
    const p = paramAt(loc, l + L_MAP, gr, gi);
    return valueOfParam(loc[l + L_KIND], p, loc[l + L_ZC], loc[l + L_F], loc[l + L_F0], loc[l + L_Z0], prev);
  }
  if (mode === LOCUS_LINE) return lineValue(loc, l, gr, gi, prev);
  if (mode === LOCUS_NUMERIC) return quarterValue(loc, l, gr, gi, prev);
  return prev;
}

/**
 * Dragging (engine.md §6): the nearest point to (px, py) that the part can reach from its start, into out[o],
 * out[o + 1], and its value (returned). Closed form for every part but λ/4 away from f0. A lumped part reaches only
 * its arc from the start to the open or short (its value never negative): a pointer whose projection on the circle
 * falls outside that arc goes to the nearer end. Lines and stubs reach the whole circle; their length is tracked from
 * prev (pass the value before this pointer event).
 */
export function project(out: Vec, o: number, loc: Vec, l: number, px: number, py: number, prev: number): number {
  const mode = loc[l + L_MODE];
  if (mode === LOCUS_NUMERIC) return quarterProject(out, o, loc, l, px, py);
  if (mode === LOCUS_FIXED) { out[o] = loc[l + L_SR]; out[o + 1] = loc[l + L_SI]; return prev; }
  projectOnCircle(tmp, 2, loc, l + L_A, px, py);
  const qx = tmp[2], qy = tmp[3];
  if (mode === LOCUS_LINE) {
    const v = lineValue(loc, l, qx, qy, prev);
    if (v === 0 && prev >= 0) { out[o] = loc[l + L_SR]; out[o + 1] = loc[l + L_SI]; }
    else { out[o] = qx; out[o + 1] = qy; }
    return v;
  }
  const kind = loc[l + L_KIND], lo = loc[l + L_LO], hi = loc[l + L_HI];
  const zc = loc[l + L_ZC], f = loc[l + L_F], f0 = loc[l + L_F0], z0 = loc[l + L_Z0];
  const p = paramAt(loc, l + L_MAP, qx, qy);
  const inReach = p === Infinity ? lo === -Infinity || hi === Infinity : p >= lo && p <= hi;
  if (inReach) {
    out[o] = qx; out[o + 1] = qy;
    const v = valueOfParam(kind, p, zc, f, f0, z0, prev);
    if ((kind === STUB_OPEN || kind === STUB_SHORT) && v === 0 && prev >= 0) locusPoint(out, o, loc, l, 0);
    return v;
  }
  // The nearer end of the reachable arc.
  mapAt(tmp, 4, loc, l + L_MAP, lo);
  mapAt(tmp, 6, loc, l + L_MAP, hi);
  const dl = (tmp[4] - px) ** 2 + (tmp[5] - py) ** 2, dh = (tmp[6] - px) ** 2 + (tmp[7] - py) ** 2;
  const end = dl <= dh ? lo : hi;
  out[o] = dl <= dh ? tmp[4] : tmp[6]; out[o + 1] = dl <= dh ? tmp[5] : tmp[7];
  return valueOfParam(kind, end, zc, f, f0, z0, prev);
}

// ---------------------------------------------------------------------------------------------------------------
// Arcs (engine.md §5): ARC_STRIDE numbers per part. The arc runs from the start node S (no effect) to the end node E
// along the part's circle, about centre C with radius R, turning by ARC_SWEEP radians (> 0 anticlockwise in the
// model, |sweep| < 2π) after ARC_TURNS full circles (lines longer than λ/2 at f). M is the point halfway along the
// sweep, on the circle. A straight locus has R = Infinity (centre 0, 0) and M halfway along S–E; a part that cannot
// move its start (or a part of no effect) has R = 0, C = M = S, sweep 0. A λ/4 transformer is drawn as its line of
// Zt from length 0; a stub as the susceptance it adds (b from 0, the shorter way: its sign says the direction).

export const ARC_SX = 0;
export const ARC_SY = 1;
export const ARC_EX = 2;
export const ARC_EY = 3;
export const ARC_MX = 4;
export const ARC_MY = 5;
export const ARC_CX = 6;
export const ARC_CY = 7;
export const ARC_R = 8;
export const ARC_SWEEP = 9;
export const ARC_TURNS = 10;
export const ARC_STRIDE = 11;

/**
 * SVG flags of an arc after the flip to SVG's downward y: bit 1 large-arc (|sweep| > π), bit 0 sweep-flag (1 when the
 * model sweep is clockwise: the flip keeps how the arc looks, and a clockwise turn on screen is SVG's positive angle
 * direction, sweep-flag 1). Full turns are drawn before as pairs of half circles.
 */
export function arcFlags(arcs: Vec, a: number): number {
  const s = arcs[a + ARC_SWEEP];
  return (Math.abs(s) > Math.PI ? 2 : 0) | (s < 0 ? 1 : 0);
}

function lineArc(arcs: Vec, a: number, kind: number, value: number, zc: number, sr: number, si: number, z0: number, f: number, f0: number): void {
  const zn = (kind === QUARTER ? value : zc) / z0;
  const t = kind === QUARTER ? 0.25 * (f / f0) : value * (f / f0);
  if (!(zn > 0 && zn < Infinity)) { // Zt of 0 or ∞: no circle to follow
    if (arcs[a] !== arcs[a + 2] || arcs[a + 1] !== arcs[a + 3]) {
      arcs[a + ARC_R] = Infinity; arcs[a + ARC_CX] = 0; arcs[a + ARC_CY] = 0;
      arcs[a + ARC_MX] = 0.5 * (arcs[a] + arcs[a + 2]); arcs[a + ARC_MY] = 0.5 * (arcs[a + 1] + arcs[a + 3]);
    }
    return;
  }
  const B = (zn - 1) / (zn + 1);
  cdiv(tmp, 0, sr - B, si, 1 - B * sr, -B * si);
  const rho = Math.hypot(tmp[0], tmp[1]);
  if (rho === 0 || !(t > 0)) return;
  const psi = Math.atan2(tmp[1], tmp[0]);
  const bm = 1 - B * rho, bp = 1 + B * rho, den = bm * bp, k = bm / bp;
  const cx = (B * (1 - rho * rho)) / den, R = (rho * ((4 * zn) / ((zn + 1) * (zn + 1)))) / den;
  const h = 2 * t, n = Math.floor(h), r = h - n;
  // The own chart's angle ψ maps to the angle χ about the centre by tan(χ/2) = k·tan(ψ/2), k = (1 − Bρ)/(1 + Bρ):
  // χ(ψ) = ψ + 2·atan((k − 1)·sin ψ/((1 + k) + (1 − k)·cos ψ)), continuous and increasing.
  let rem = 0;
  if (r > 0) {
    const pe = psi - TAU * r, km = k - 1, kp = 1 + k, kn = 1 - k;
    rem = -TAU * r + 2 * (Math.atan((km * Math.sin(pe)) / (kp + kn * Math.cos(pe))) - Math.atan((km * Math.sin(psi)) / (kp + kn * Math.cos(psi))));
  }
  arcs[a + ARC_CX] = cx; arcs[a + ARC_CY] = 0; arcs[a + ARC_R] = R; arcs[a + ARC_SWEEP] = rem; arcs[a + ARC_TURNS] = n;
  if (rem !== 0) {
    const ang = Math.atan2(si, sr - cx) + 0.5 * rem;
    arcs[a + ARC_MX] = cx + R * Math.cos(ang); arcs[a + ARC_MY] = R * Math.sin(ang);
  }
}

/** The arc of one part of value `value` from S = (sr, si) to E = (er, ei) (both from network.ts) at f, into arcs[a…]. */
export function partArc(arcs: Vec, a: number, kind: number, value: number, zc: number, sr: number, si: number, er: number, ei: number, z0: number, f: number, f0: number): void {
  arcs[a] = sr; arcs[a + 1] = si; arcs[a + 2] = er; arcs[a + 3] = ei;
  arcs[a + ARC_MX] = sr; arcs[a + ARC_MY] = si; arcs[a + ARC_CX] = sr; arcs[a + ARC_CY] = si;
  arcs[a + ARC_R] = 0; arcs[a + ARC_SWEEP] = 0; arcs[a + ARC_TURNS] = 0;
  if (!(Math.abs(sr) < Infinity && Math.abs(si) < Infinity && Math.abs(er) < Infinity && Math.abs(ei) < Infinity)) return;
  if (kind === LINE || kind === QUARTER) { lineArc(arcs, a, kind, value, zc, sr, si, z0, f, f0); return; }
  paramMap(mp, 0, kind, sr, si);
  if (mapDegenerate(mp, 0)) return;
  let p1 = added(kind, value, zc, f, f0, z0);
  if (!(p1 !== 0 && p1 === p1)) return;
  if (p1 === -Infinity && (kind === STUB_OPEN || kind === STUB_SHORT)) p1 = Infinity; // b = ±∞ is the short either way
  const qr = 0.5 * mp[4], qi = 0.5 * mp[5]; // γ/δ with δ = 2
  let zr: number, zi: number;
  if (p1 === Infinity) { zr = qr; zi = qi; } else if (p1 === -Infinity) { zr = -qr; zi = -qi; } else { zr = 1 + qr * p1; zi = qi * p1; }
  // The central angle is twice the turn of the chord from Γ(∞): sweep = −2·arg(1 + (γ/δ)·p1).
  const phi = -2 * Math.atan2(zi, zr);
  const A = 2 * mp[5]; // −Im(δγ̄) with δ = 2
  if (A === 0) {
    arcs[a + ARC_R] = Infinity; arcs[a + ARC_CX] = 0; arcs[a + ARC_CY] = 0;
    arcs[a + ARC_MX] = 0.5 * (sr + er); arcs[a + ARC_MY] = 0.5 * (si + ei);
    return;
  }
  const ar = mp[0], ai = mp[1], br = mp[2], bi = mp[3], gr = mp[4], gi = mp[5];
  const Kr = 2 * ar - (br * gr + bi * gi), Ki = -2 * ai - (br * gi - bi * gr);
  const detr = 2 * ar - (br * gr - bi * gi), deti = 2 * ai - (br * gi + bi * gr);
  arcs[a + ARC_CX] = (-0.5 * Ki) / A; arcs[a + ARC_CY] = (-0.5 * Kr) / A;
  arcs[a + ARC_R] = Math.hypot(detr, deti) / (2 * Math.abs(A));
  arcs[a + ARC_SWEEP] = phi;
  if (phi === 0) { arcs[a + ARC_MX] = 0.5 * (sr + er); arcs[a + ARC_MY] = 0.5 * (si + ei); return; }
  // Halfway along the sweep: the p where arg(1 + qp) = −φ/4.
  const th = -0.25 * phi, c = Math.cos(th), s = Math.sin(th);
  mapAt(arcs, a + ARC_MX, mp, 0, s / (qi * c - qr * s));
}

const gs = new Float64Array(4);

/** The arcs of all `count` parts of an evaluated ladder (nodes from network.ts evaluate at f), ARC_STRIDE each. */
export function partArcs(arcs: Vec, nodes: Vec, parts: Vec, count: number, z0: number, f: number, f0: number): void {
  nodeGamma(gs, 0, nodes, 0);
  for (let k = 0, p = 0, a = 0; k < count; k++, p += PART_STRIDE, a += ARC_STRIDE) {
    nodeGamma(gs, 2, nodes, (k + 1) * NODE_STRIDE);
    partArc(arcs, a, parts[p], parts[p + 1], parts[p + 2], gs[0], gs[1], gs[2], gs[3], z0, f, f0);
    gs[0] = gs[2]; gs[1] = gs[3];
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Polylines for curves that are not circles (sweep traces, lossy parts; engine.md §5): the interval [t0, t1] is cut
// into `start` pieces, each halved until its midpoint is within `tol` of its chord (tol: a quarter of a pixel in Γ
// units at the zoom drawn), to a depth of 24, never writing more than `cap` points (interleaved x, y into out).

export type CurveFn = (t: number, out: Vec, o: number) => void;

let sFn: CurveFn = null;
let sOut: Vec = null;
let sCap = 0;
let sCount = 0;
let sPending = 0;
let sTol2 = 0;
const sP = new Float64Array(2);
const MAX_DEPTH = 24;

function refine(ta: number, xa: number, ya: number, tb: number, xb: number, yb: number, depth: number): void {
  if (depth < MAX_DEPTH && sCount + sPending + 1 <= sCap) {
    const tm = 0.5 * (ta + tb);
    sFn(tm, sP, 0);
    const xm = sP[0], ym = sP[1], dx = xb - xa, dy = yb - ya, len2 = dx * dx + dy * dy;
    let u = len2 > 0 ? ((xm - xa) * dx + (ym - ya) * dy) / len2 : 0;
    u = u < 0 ? 0 : u > 1 ? 1 : u;
    const ex = xm - xa - u * dx, ey = ym - ya - u * dy;
    if (!(ex * ex + ey * ey <= sTol2)) {
      sPending++;
      refine(ta, xa, ya, tm, xm, ym, depth + 1);
      refine(tm, xm, ym, tb, xb, yb, depth + 1);
      return;
    }
  }
  sOut[2 * sCount] = xb; sOut[2 * sCount + 1] = yb;
  sCount++; sPending--;
}

/** Samples fn over [t0, t1] into out (x, y pairs); returns the number of points (≤ cap, cap ≥ start + 1). */
export function samplePolyline(out: Vec, cap: number, fn: CurveFn, t0: number, t1: number, tol: number, start = 16): number {
  sFn = fn; sOut = out; sCap = cap; sTol2 = tol * tol;
  fn(t0, sP, 0);
  out[0] = sP[0]; out[1] = sP[1];
  sCount = 1;
  const n = Math.max(1, Math.min(start, cap - 1));
  sPending = n;
  let ta = t0, xa = sP[0], ya = sP[1];
  for (let i = 1; i <= n; i++) {
    const tb = i === n ? t1 : t0 + ((t1 - t0) * i) / n;
    fn(tb, sP, 0);
    const xb = sP[0], yb = sP[1];
    refine(ta, xa, ya, tb, xb, yb, 0);
    ta = tb; xa = xb; ya = yb;
  }
  sFn = null; sOut = null;
  return sCount;
}
