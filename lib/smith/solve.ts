// The solver, "find the missing value" (docs/smith-chart/solver.md, plan.md D7): one or two parts' values (or a line's
// or stub's Zc, or f0) are unknown, a goal (goal.ts) says what must hold at the input or at a chosen node, and the
// answer is the intersection of two circles in the Γ plane wherever the unknowns move the node along circles.
//
// Two unknowns a < b (a nearer the load) and a point target T at node g (M4.1a):
//   1. forward: as a's value changes, node a + 1 moves on a's locus A (geometry.ts partLocus from node a); the fixed
//      parts between a and b map it by a Möbius map M to the circle A′ at node b;
//   2. backward: the fixed parts after b (map N) carry T back to T′ = N⁻¹(T) at node b + 1; b reaches T′ from a point
//      P only if P lies on b's locus through T′ run backwards, which for every v1 part is the same family of circles
//      (a series reactance: the constant-r circle; a shunt one or a stub: constant g; a line: its circle about Zc;
//      λ/4 at f0: z → s/z), so it is partLocus of b's kind from T′: the circle B at node b;
//   3. A′ ∩ B (geometry.ts circleIntersect): 0, 1 (touching) or 2 points, or the whole circle (coincident: "these two
//      parts do the same job"). For each point P, a's value from M⁻¹(P) on A, then node b evaluated with that value
//      (network.ts) and b's value from there to T′.
// One unknown and a circle goal K: the same with K carried back to node a + 1 (M⁻¹ of the parts after a): A ∩ K′.
//
// M4.1b:
// - One unknown and a point target (exact only by chance): the best value. With Q = T∘N (N the parts after a, T the
//   map Γ → (Γ − Γt)/(1 − Γt*Γ) whose modulus is goal.ts goalMismatch), the mismatch at the goal node is |Q(P)| for P
//   on A, and Q(A) is a circle: its nearest point to 0 (closed form) carried back by Q⁻¹ is the best value; |Q| along
//   a circle has one minimum, so on an arc (a part's reach) the best is that point or an end. 32 samples guard it.
// - Inequality goals (|Γ| ≤ m, VSWR ≤ s, RL ≥ dB) with one unknown: the ranges between the crossings of A and K′ (and
//   the cuts where the kind changes or a length wraps) whose middle keeps the goal.
// - Two unknowns and a circle goal: a family. For a value of a, node b is evaluated and b's locus from there meets K′
//   (K carried back to node b + 1) in 0–2 points: the values of b. b's loci form a one-parameter family (constant r, g,
//   x, b, |Γ| about Zc, or arg z for λ/4), so b reaches K′ from P exactly when P's member of the family is one K′
//   meets; the range of a ends where P is on a member that touches K′ (found in closed form in the plane where the
//   family is straight lines or circles about 0) or where P crosses K′; a 48-point count guards the classification.
// - The fallback search (search.ts) for unknowns whose locus is not a circle: a line's Zc and f0 (a stub's Zc at a
//   fixed length moves along constant g and takes the geometric path). One unknown: a grid of its bounded variable
//   (atan of Zc/Z0, ln f) and bracketed roots of the goal's signed distance, or the minima of the mismatch; two:
//   a grid of both, damped Newton from every local minimum of |Γ − Γt|, duplicates merged.
//
// Every candidate is re-evaluated by network.ts; one whose residual at the goal node is above ACCEPT after at most
// four Newton steps is not a solution (the touching point of two circles of one family at the open or short, a
// rank-1 map) and is dropped. Values: L, C and R are never negative: a reactance or susceptance of the wrong sign is
// offered as the other kind (swapped, true at f0 only) unless the unknown is free ("a series reactance", "a shunt
// susceptance", whose sign picks L or C); a negative R or Zc and an imaginary Zt are not passive and are dropped
// (counted in nonPassive). Lengths are the shortest ≥ 0, with `period` (λ/2 at f0) for the note that adding it gives
// the same match. Order (solver.md "What comes back"): realisable first, fewer parts changed, smaller total change,
// then by value; deterministic. Everything is at f0, except an f0 unknown: the frequency at which the goal holds, with
// lengths kept physically (in wavelengths at the circuit's f0; `atFrequency` rewrites a circuit for a new f0).

import type { Vec } from './complex';
import {
  CROSS_SAME, LOCUS_FIXED, LOCUS_LINE, LOCUS_MOBIUS, LOCUS_STRIDE, L_A, L_MODE, MOB_STRIDE,
  circleImage, circleResidual, circleIntersect, locusParam, locusValue, mobApply, mobCompose, mobInvert, partLocus, partMobius,
  pointCircle, projectOnCircle, sameCircle,
} from './geometry';
import { POLE_TOL, RIM, goalCircle, goalMismatch, goalNode, goalPole, goalProblem, goalResidual, goalSigned, goalTarget, isWithin, pointGoal } from './goal';
import type { Goal } from './goal';
import { NODE_STRIDE, applyPart, loadNode, nodeGamma } from './network';
import type { Circuit } from './network';
import * as PT from './parts';
import {
  LINE, LINE_PERIOD, PART_STRIDE, QUARTER, REACH_HI, REACH_LO, SERIES_C, SERIES_L, SERIES_R, SHUNT_C,
  SHUNT_L, SHUNT_R, STUB_OPEN, STUB_SHORT, added, noEffect, packParts, sincosTurns, turnsAt, valueFor,
} from './parts';
import type { Part, PartKind } from './parts';
import { CURVE, golden, minima1D, newton2D, roots1D } from './search';

/** What is unknown: a part's value (the default), a line's or stub's Zc, or f0 (the frequency the goal holds at). */
export type UnknownParam = 'value' | 'zc' | 'f0';

export interface Unknown {
  /** The part (0-based, from the load); ignored for 'f0'. */
  part: number;
  param?: UnknownParam;
  /** A series L or C as "a series reactance", a shunt L or C as "a shunt susceptance": the sign picks L or C. */
  free?: boolean;
  /** The search range of a line's Zc (Ω; default 0 to ∞) or of f0 (Hz; default f0/10 to 10·f0). */
  lo?: number;
  hi?: number;
}

export interface SolvedValue {
  /** The part, −1 for f0. */
  part: number;
  param: UnknownParam;
  /** The kind to use: the part's own, the other of L and C for a free unknown, or for a swapped one; −1 for f0. */
  kind: PartKind | -1;
  /**
   * In the unknown's unit: Ω, H, F, wavelengths at f0, Zt in Ω; Zc in Ω for a 'zc' unknown, Hz for f0. Lumped values
   * may be 0 or ∞ (the part's limits).
   */
  value: number;
  zc: number;
  /**
   * The normalised r, x, g or b added (a stub's b, also for its Zc), (Zt/Z0)² for λ/4, a line's length in
   * wavelengths at f0, Zc/Z0 of a line's Zc, f/f0 for f0.
   */
  added: number;
  /** The unknown's coordinate (see Domain): atan of the added quantity, a length, or ln(f/f0). */
  coord: number;
  /** A reactance or susceptance of the wrong sign for the part's kind, offered as the other kind: true at f0 only. */
  swapped: boolean;
  /** For a length (line, stub): adding it gives the same Γ at f0 (and a narrower band); 0 otherwise. */
  period: number;
}

export interface Solution {
  /** One per unknown, in the order of the unknowns (parts nearest the load first, f0 last). */
  values: SolvedValue[];
  /** How far Γ at the goal node is from the goal (goal.ts goalResidual), from network.ts's evaluation. */
  residual: number;
  /** goal.ts goalMismatch: for a point target |Γ − Γt|/|1 − Γt*Γ| (|Γ| for the centre), else the residual. */
  mismatch: number;
  /** |Γ| at the goal node. */
  gamma: number;
  /** Every value is of the kind the part has (or a free unknown's sign), so no value holds at f0 only. */
  realisable: boolean;
  /** Some value is swapped to the other kind: true at this frequency only. */
  atF0Only: boolean;
  /** How many unknowns differ from the circuit's current values. */
  changed: number;
  /** The total change: per unknown the distance of its coordinates (projective: atan, period π; lengths: 2π per λ, period λ/2; ln f). */
  change: number;
}

export type SolveStatus =
  | 'solved'      // at least one solution
  | 'none'        // no solution (reason says why)
  | 'coincident'  // infinitely many: the two circles are one ("these two parts do the same job"), or every value keeps a circle goal
  | 'degenerate'  // the target is a part's fixed point (the open for a series part, the short for a shunt one)
  | 'best'        // one unknown, a point target not reached: solutions are the nearest values (the best, then the best realisable)
  | 'range'       // one unknown, an inequality goal: `ranges` keep it, `solutions` are its edges
  | 'family'      // two unknowns, a circle goal: `ranges` of the first, `family.at` gives the second
  | 'rejected';   // the question cannot be asked (reason says why)

/**
 * An unknown's coordinate: 'angle' is atan of its normalised quantity (± π/2 is ∞), 'length' a length in
 * wavelengths, 'log' ln(f/f0). [lo, hi] is what the solver searches (unrolled: an open stub's b runs over [0, π], so
 * its length grows from 0 to λ/2); periodic when lo and hi are the same point; cuts are coordinates inside where the
 * kind changes (L ↔ C at no effect). Ranges never cross a cut.
 */
export interface Domain { mode: 'angle' | 'length' | 'log'; lo: number; hi: number; periodic: boolean; cuts: number[] }

/** Values of the first unknown, between two coordinates of its Domain (t0 < t1). */
export interface ValueRange {
  t0: number;
  t1: number;
  /** The kind in the range (−1 for f0) and the values at t0 and t1 in the unknown's unit; min ≤ max are the same two. */
  kind: PartKind | -1;
  from: number;
  to: number;
  min: number;
  max: number;
  swapped: boolean;
  /** A family: the most values of the second unknown a value inside has (1 or 2). One unknown: 1. */
  branches: number;
}

export interface Family {
  /** The solutions (0 to 2) with the first unknown at coordinate t of its Domain. */
  at(t: number): Solution[];
  /** The solutions at the ends of every range (t0, then t1). */
  ends: Solution[];
}

export interface SolveResult {
  status: SolveStatus;
  /** A sentence for the page when there is no plain list of solutions; '' when solved. */
  reason: string;
  solutions: Solution[];
  /** The unknowns in the order used (parts nearest the load first, f0 last). */
  unknowns: Unknown[];
  goalNode: number;
  /**
   * The node at which the two circles live and their generalised circles (geometry.ts, 4 numbers each) at 0 and 4:
   * two unknowns: A′ and B (a point target) or A′ and the goal carried back to node b + 1 (a family) at node b; one
   * unknown: a's locus and the goal carried back (for the best value: the mismatch circle it touches), at node
   * a + 1. −1 when none (the fallback search).
   */
  circleNode: number;
  circles: Float64Array;
  /** Points of the circles that need a negative R or Zc or an imaginary Zt (dropped). */
  nonPassive: number;
  /** The two unknowns move the node along the same circle (coincident circles, or none because that circle misses the target). */
  sameJob: boolean;
  /** 'range': the values of the unknown that keep the goal; 'family': the values of the first unknown with a second. */
  ranges: ValueRange[];
  /** Per unknown, its coordinate (Solution values' coord, ranges, family.at). */
  domains: Domain[];
  family: Family | null;
}

/** A solution's residual at the goal node above this (after polishing) means it is not one. */
export const ACCEPT = 1e-9;
/** Candidates with a residual above this get Newton steps on network.ts's evaluation. */
const POLISH_ABOVE = 1e-13;
const POLISH_STEPS = 4;
const HALF_PI = 0.5 * Math.PI;
const TAU = 2 * Math.PI;

const KIND_NAME = ['series R', 'series L', 'series C', 'shunt R', 'shunt L', 'shunt C', 'line', 'open stub', 'short stub', 'λ/4 transformer'];
const OTHER: readonly number[] = [SERIES_R, SERIES_C, SERIES_L, SHUNT_R, SHUNT_C, SHUNT_L, LINE, STUB_OPEN, STUB_SHORT, QUARTER];
const isReactive = (kind: number): boolean => kind === SERIES_L || kind === SERIES_C || kind === SHUNT_L || kind === SHUNT_C;
const isStubKind = (kind: number): boolean => kind === STUB_OPEN || kind === STUB_SHORT;
const partName = (circuit: Circuit, k: number): string => `part ${k + 1} (${KIND_NAME[circuit.parts[k].kind]})`;

// ---------------------------------------------------------------------------------------------------------------
// Working state of one solve (module scratch: the solver allocates only its results).

let packed = new Float64Array(16 * PART_STRIDE);
const node = new Float64Array(NODE_STRIDE);
const gam = new Float64Array(2);
const tgt = new Float64Array(2);
const tp = new Float64Array(2);
const q = new Float64Array(2);
const pts = new Float64Array(4);
const kc = new Float64Array(4);
const kp = new Float64Array(4);
const mA = new Float64Array(MOB_STRIDE);
const mAi = new Float64Array(MOB_STRIDE);
const mB = new Float64Array(MOB_STRIDE);
const mk = new Float64Array(MOB_STRIDE);
const mQ = new Float64Array(MOB_STRIDE);
const mT = new Float64Array(MOB_STRIDE);
const mw = new Float64Array(MOB_STRIDE);
const mwi = new Float64Array(MOB_STRIDE);
const cw = new Float64Array(8);
const members = new Float64Array(8);
const locA = new Float64Array(LOCUS_STRIDE);
const locB = new Float64Array(LOCUS_STRIDE);
const locP = new Float64Array(LOCUS_STRIDE);

/** Z0, f0 and the working frequency (f0 but for an f0 unknown), the load, the goal node and the goal in use. */
let Z0 = 50, F0 = 1e8, FW = 1e8, LR = 50, LX = 0, GNODE = 0;
let GOAL: Goal = { kind: 'point' };
/** The goal as asked (GOAL is its point target when a circle goal is one point): solutions' residuals are against it. */
let ASKED: Goal = GOAL;
/** goalPole of the goal asked. */
let POLE = 0;
/** Polish only this slot (a family's second unknown), or all (−1). */
let ONLY = -1;

const P_VALUE = 0, P_ZC = 1, P_F0 = 2;
const M_ANGLE = 0, M_LEN = 1, M_LOG = 2;
const PARAMS: readonly UnknownParam[] = ['value', 'zc', 'f0'];
const MODES: readonly Domain['mode'][] = ['angle', 'length', 'log'];

interface Slot {
  part: number; kind: number; zc: number; free: boolean; param: number;
  /** The locus is a circle (the geometric path). */
  geo: boolean;
  mode: number;
  /** An R, Zt or Zc: the coordinate's far end (±π/2) is one value (∞ or 0), never negative. */
  half: boolean;
  lo: number; hi: number; periodic: boolean; cuts: number[];
  /** The current coordinate. */
  t0: number;
  /** A stub's length for its Zc. */
  len: number;
}
const slots: Slot[] = [];

/** Γ at node n of the working circuit (network.ts's evaluation), into out[o]. */
function gammaAt(out: Vec, o: number, n: number): void {
  loadNode(node, 0, LR, LX, Z0);
  for (let k = 0, p = 0; k < n; k++, p += PART_STRIDE) applyPart(node, 0, packed[p], packed[p + 1], packed[p + 2], FW, F0, Z0);
  nodeGamma(out, o, node, 0);
}

/** The Möbius map of parts from…to − 1 of the working circuit at FW (identity when none): node `from` → node `to`. */
function chain(m: Vec, from: number, to: number): void {
  m[0] = 1; m[1] = 0; m[2] = 0; m[3] = 0; m[4] = 0; m[5] = 0; m[6] = 1; m[7] = 0;
  for (let k = from, p = from * PART_STRIDE; k < to; k++, p += PART_STRIDE) {
    partMobius(mk, 0, packed[p], packed[p + 1], packed[p + 2], FW, F0, Z0);
    mobCompose(m, 0, mk, 0, m, 0);
  }
}

// A slot's coordinate: atan of the added quantity (the projective line as an angle: ±π/2 is ±∞), a length, or ln f/f0.
const coordOf = (s: Slot, p: number): number => (s.mode === M_LEN ? p : s.mode === M_LOG ? Math.log(p) : Math.atan(p));
function paramOf(s: Slot, t: number): number {
  if (s.mode === M_LEN) return t;
  if (s.mode === M_LOG) return Math.exp(t);
  if (t > HALF_PI || t < -HALF_PI) t -= Math.PI * Math.round(t / Math.PI); // an unrolled coordinate
  return Math.abs(t) >= HALF_PI ? Infinity : Math.tan(t);
}

/**
 * Writes the unknown of slot s with parameter p (added quantity, b of a stub's Zc, Zc/Z0 of a line's, a length, f/f0)
 * into the working circuit. Returns 0, 1 when the value is swapped to the other kind, −1 when not passive (a negative
 * R or Zc: written so it can be evaluated) and −2 when it cannot be written (an imaginary, zero or infinite Zt; a
 * line's Zc or f of 0 or ∞).
 */
function settle(s: Slot, p: number): number {
  if (s.param === P_F0) { FW = F0 * p; return p > 0 && p < Infinity ? 0 : -2; }
  const o = s.part * PART_STRIDE;
  if (s.param === P_ZC) {
    if (s.kind === LINE) { if (!(p > 0 && p < Infinity)) return -2; packed[o + 2] = Z0 * p; return 0; }
    let zc: number;
    if (p === 0) zc = Infinity;
    else if (!(Math.abs(p) < Infinity)) zc = 0;
    else { sincosTurns(s.len); zc = s.kind === STUB_OPEN ? (Z0 * PT.SIN) / (PT.COS * p) : -(Z0 * PT.COS) / (PT.SIN * p); }
    packed[o + 2] = zc === 0 ? 0 : zc;
    return zc < 0 ? -1 : 0;
  }
  let kind = s.kind, value: number, code = 0;
  switch (kind) {
    case LINE: value = p; break;
    case QUARTER:
      // Zt within 1e-6·Z0 of 0 or ∞ is a short or open that network.ts cannot evaluate as a λ/4 (and every λ/4 locus
      // passes through the short and the open, so such a point is not an answer about this part).
      if (!(p > 1e-12 && p < 1e12)) return -2;
      value = Z0 * Math.sqrt(p);
      break;
    case STUB_OPEN: value = Math.abs(p) === Infinity ? 0.25 : valueFor(kind, p, s.zc, F0, F0, Z0); break;
    case STUB_SHORT: value = Math.abs(p) === Infinity ? 0 : valueFor(kind, p, s.zc, F0, F0, Z0); break;
    case SERIES_R: case SHUNT_R:
      if (p < 0) { value = valueFor(kind, p, 0, F0, F0, Z0); code = -1; break; }
      value = p === 0 ? noEffect(kind, F0, F0) : valueFor(kind, p, 0, F0, F0, Z0);
      break;
    default:
      if (Math.abs(p) === Infinity) p = REACH_HI[kind] === Infinity ? Infinity : -Infinity;
      else if (p !== 0 && !(p >= REACH_LO[kind] && p <= REACH_HI[kind])) { kind = OTHER[kind]; code = s.free ? 0 : 1; }
      value = p === 0 ? noEffect(kind, F0, F0) : valueFor(kind, p, 0, F0, F0, Z0);
  }
  packed[o] = kind; packed[o + 1] = value;
  return code;
}

/** The parameter (added quantity or length) of the point (gr, gi) on a part's locus. */
function paramOn(loc: Vec, gr: number, gi: number): number {
  return loc[L_MODE] === LOCUS_LINE ? locusValue(loc, 0, gr, gi, NaN) : locusParam(loc, 0, gr, gi);
}

// ---------------------------------------------------------------------------------------------------------------
// Candidates: settled, evaluated, polished, kept.

interface Candidate { t: number[]; codes: number[]; residual: number }
const cands: Candidate[] = [];
let nonPassive = 0;

/** Settles every slot from its coordinate (codes per slot into `codes`); returns the smallest code below 0, else 0. */
function settleAll(t: readonly number[], codes: number[]): number {
  let worst = 0;
  for (let i = 0; i < slots.length; i++) {
    const c = settle(slots[i], paramOf(slots[i], t[i]));
    codes[i] = c;
    if (c < worst) worst = c;
  }
  return worst;
}

/** The residual of the working circuit at the goal node; for a point target also Γ − Γt into F[0], F[1], for a circle goal the signed distance into F[0]. */
function residualOf(F: number[]): number {
  gammaAt(gam, 0, GNODE);
  const gr = gam[0], gi = gam[1];
  if (!(Math.abs(gr) < Infinity && Math.abs(gi) < Infinity)) return Infinity;
  if (GOAL.kind === 'point') { F[0] = gr - tgt[0]; F[1] = gi - tgt[1]; return Math.hypot(F[0], F[1]); }
  F[0] = goalSigned(GOAL, gr, gi);
  return goalResidual(GOAL, gr, gi, Z0);
}

const F0v = [0, 0], F1v = [0, 0], F2v = [0, 0];

/** Newton steps on the slots' coordinates against network.ts's evaluation (finite differences). Updates t in place. */
function polish(t: number[], codes: number[], residual: number): number {
  const n = slots.length, point = GOAL.kind === 'point';
  const j = ONLY >= 0 ? ONLY : 0;
  for (let step = 0; step < POLISH_STEPS && residual > POLISH_ABOVE; step++) {
    if (settleAll(t, codes) < -1) return residual;
    residualOf(F0v);
    const h0 = 1e-8 * Math.max(1, Math.abs(t[j]));
    t[j] += h0; if (settleAll(t, codes) < -1) { t[j] -= h0; return residual; }
    residualOf(F1v); t[j] -= h0;
    let d0: number, d1 = 0;
    const two = n === 2 && point && ONLY < 0;
    if (two) {
      const h1 = 1e-8 * Math.max(1, Math.abs(t[1]));
      t[1] += h1; if (settleAll(t, codes) < -1) { t[1] -= h1; return residual; }
      residualOf(F2v); t[1] -= h1;
      const a = (F1v[0] - F0v[0]) / h0, c = (F1v[1] - F0v[1]) / h0, b = (F2v[0] - F0v[0]) / h1, d = (F2v[1] - F0v[1]) / h1;
      const det = a * d - b * c;
      if (!(Math.abs(det) > 0)) break;
      d0 = -(d * F0v[0] - b * F0v[1]) / det; d1 = -(a * F0v[1] - c * F0v[0]) / det;
    } else {
      const slope = (F1v[0] - F0v[0]) / h0;
      if (!(Math.abs(slope) > 0)) break;
      d0 = -F0v[0] / slope;
    }
    if (!(Math.abs(d0) < 1 && Math.abs(d1) < 1)) break;
    t[j] += d0; if (two) t[1] += d1;
    const worst = settleAll(t, codes);
    const r = worst < -1 ? Infinity : residualOf(F0v);
    if (!(r < residual)) { t[j] -= d0; if (two) t[1] -= d1; break; }
    residual = r;
  }
  settleAll(t, codes);
  return residual;
}

/**
 * The far end of a half slot's domain: +π/2, or −π/2 for a stub's Zc whose b is negative (domain [−π/2, 0]), where a
 * Zc of 0 makes b = −∞ (BL56: it read +π/2, outside the domain).
 */
const farEnd = (s: Slot): number => (s.lo < 0 ? -HALF_PI : HALF_PI);

/** Coordinates into their usual interval: lengths [0, λ/2), the projective coordinate (−π/2, π/2] (R, Zt, Zc past ∞: their far end). */
function normalise(t: number[]): void {
  for (let i = 0; i < slots.length; i++) {
    const s = slots[i];
    if (s.mode === M_LEN) { t[i] -= LINE_PERIOD * Math.floor(t[i] / LINE_PERIOD); if (t[i] >= LINE_PERIOD) t[i] = 0; }
    else if (s.mode === M_LOG) continue;
    else if (s.half && Math.abs(t[i]) >= HALF_PI) t[i] = farEnd(s);
    else if (t[i] > HALF_PI || t[i] <= -HALF_PI) { t[i] -= Math.PI * Math.round(t[i] / Math.PI); if (t[i] <= -HALF_PI) t[i] += Math.PI; }
  }
}

/** Keeps a candidate (merged with one at the same coordinates, the smaller residual winning). */
function keep(t: number[], codes: number[], residual: number): void {
  for (const c of cands) {
    let same = true;
    for (let i = 0; i < t.length && same; i++) same = coordDistance(slots[i], c.t[i], t[i]) < 1e-9;
    if (same) { if (residual < c.residual) { c.t = t; c.codes = codes; c.residual = residual; } return; }
  }
  cands.push({ t, codes, residual });
}

/** Evaluates the slots at parameters ps, polishes, and keeps the candidate if it reaches the goal. */
function consider(ps: readonly number[]): void {
  const t = ps.map((p, i) => coordOf(slots[i], p));
  // An R, Zt or Zc at the far end of its circle (the open or short) reads as a huge value of either sign: take the
  // domain's far end (+∞, or a down stub's b of −∞).
  for (let i = 0; i < t.length; i++) {
    const s = slots[i];
    if (s.half && (s.lo < 0 ? t[i] > HALF_PI - 1e-7 : t[i] < 1e-7 - HALF_PI)) t[i] = farEnd(s);
  }
  const codes: number[] = new Array(slots.length);
  const worst = settleAll(t, codes);
  if (worst < -1) return;
  let residual = residualOf(F0v);
  if (worst === 0 || worst === 1) {
    polish(t, codes, residual);
    normalise(t);
    if (settleAll(t, codes) < -1) return;
    residual = residualOf(F0v);
  }
  if (!(residual <= ACCEPT)) return;
  // On a circle goal, Γ at the point all its circles share (an unknown that opens or shorts the node) is no answer.
  if (POLE !== 0 && Math.hypot(gam[0] - POLE, gam[1]) < POLE_TOL) return;
  if (codes.some((c) => c < 0)) { nonPassive++; return; }
  keep(t, codes, residual);
}

/** The distance of two coordinates of a slot: projective (period π), lengths (period λ/2, as 2π per λ), ln f. */
function coordDistance(s: Slot, a: number, b: number): number {
  if (s.mode === M_LOG) return Math.abs(a - b);
  if (s.mode === M_LEN) { let d = Math.abs(a - b) % LINE_PERIOD; if (d > 0.5 * LINE_PERIOD) d = LINE_PERIOD - d; return TAU * d; }
  let d = Math.abs(a - b) % Math.PI;
  if (d > HALF_PI) d = Math.PI - d;
  return d;
}

function buildSolution(c: Candidate): Solution {
  settleAll(c.t, c.codes);
  gammaAt(gam, 0, GNODE);
  const values: SolvedValue[] = [];
  let swapped = false, changed = 0, change = 0;
  for (let i = 0; i < slots.length; i++) {
    const s = slots[i], o = s.part * PART_STRIDE;
    const sw = c.codes[i] === 1;
    swapped ||= sw;
    const p = paramOf(s, c.t[i]);
    const d = coordDistance(s, c.t[i], s.t0);
    change += d;
    let kind: PartKind | -1, value: number, zc: number;
    if (s.param === P_F0) { kind = -1; value = FW; zc = 0; }
    else if (s.param === P_ZC) { kind = s.kind as PartKind; value = packed[o + 2]; zc = value; }
    else { kind = packed[o] as PartKind; value = packed[o + 1]; zc = s.zc; }
    if (d > 1e-9 || kind !== s.kind) changed++;
    values.push({
      part: s.part, param: PARAMS[s.param], kind, value, zc, added: p, coord: c.t[i], swapped: sw,
      period: s.param === P_VALUE && (s.kind === LINE || isStubKind(s.kind)) ? LINE_PERIOD : 0,
    });
  }
  const gr = gam[0], gi = gam[1];
  return {
    values, residual: ASKED === GOAL ? c.residual : goalResidual(ASKED, gr, gi, Z0), mismatch: goalMismatch(GOAL, gr, gi, Z0), gamma: Math.hypot(gr, gi),
    realisable: !swapped, atF0Only: swapped, changed, change,
  };
}

function order(a: Solution, b: Solution): number {
  if (a.realisable !== b.realisable) return a.realisable ? -1 : 1;
  if (a.changed !== b.changed) return a.changed - b.changed;
  if (a.change !== b.change) return a.change - b.change;
  return byValue(a, b);
}

function byValue(a: Solution, b: Solution): number {
  for (let i = 0; i < a.values.length; i++) {
    const x = a.values[i].added, y = b.values[i].added;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

// ---------------------------------------------------------------------------------------------------------------
// Setting up

function makeSlot(circuit: Circuit, u: Unknown): Slot {
  const param = u.param === 'zc' ? P_ZC : u.param === 'f0' ? P_F0 : P_VALUE;
  if (param === P_F0) {
    const lo = Math.log((u.lo ?? F0 / 10) / F0), hi = Math.log((u.hi ?? F0 * 10) / F0);
    return { part: -1, kind: -1, zc: 0, free: false, param, geo: false, mode: M_LOG, half: false, lo, hi, periodic: false, cuts: [], t0: 0, len: 0 };
  }
  const part = circuit.parts[u.part], kind = part.kind, zc = part.zc ?? 0;
  const base = { part: u.part, kind, zc, free: !!u.free, param, len: part.value };
  if (param === P_ZC) {
    if (kind === LINE) {
      const lo = u.lo !== undefined ? Math.atan(u.lo / Z0) : 0, hi = u.hi !== undefined ? Math.atan(u.hi / Z0) : HALF_PI;
      return { ...base, geo: false, mode: M_ANGLE, half: true, lo, hi, periodic: false, cuts: [], t0: Math.atan(zc / Z0) };
    }
    const up = added(kind, part.value, Z0, F0, F0, Z0) > 0;
    return { ...base, geo: true, mode: M_ANGLE, half: true, lo: up ? 0 : -HALF_PI, hi: up ? HALF_PI : 0, periodic: false, cuts: [], t0: Math.atan(added(kind, part.value, zc, F0, F0, Z0)) };
  }
  if (kind === LINE) {
    return { ...base, geo: true, mode: M_LEN, half: false, lo: 0, hi: LINE_PERIOD, periodic: true, cuts: [], t0: part.value - LINE_PERIOD * Math.floor(part.value / LINE_PERIOD) };
  }
  const p0 = kind === QUARTER ? (part.value / Z0) ** 2 : added(kind, part.value, zc, F0, F0, Z0);
  const half = kind === SERIES_R || kind === SHUNT_R || kind === QUARTER;
  const s: Slot = { ...base, geo: true, mode: M_ANGLE, half, lo: -HALF_PI, hi: HALF_PI, periodic: !half, cuts: [], t0: Math.atan(p0) };
  if (half) s.lo = 0;
  else if (kind === STUB_OPEN) { s.lo = 0; s.hi = Math.PI; }
  else if (isReactive(kind)) s.cuts = [0];
  return s;
}

const domainOf = (s: Slot): Domain => ({ mode: MODES[s.mode], lo: s.lo, hi: s.hi, periodic: s.periodic, cuts: s.cuts.slice() });

/** The working circuit, goal and slots for these (sorted, checked) unknowns. */
function setup(circuit: Circuit, unknowns: readonly Unknown[], goal: Goal): void {
  const count = circuit.parts.length;
  Z0 = circuit.z0; F0 = circuit.f0; FW = F0; LR = circuit.loadR; LX = circuit.loadX; GOAL = goal; ASKED = goal; POLE = goalPole(goal);
  GNODE = goalNode(goal, count);
  if (packed.length < count * PART_STRIDE) packed = new Float64Array(count * PART_STRIDE);
  packParts(circuit.parts, packed);
  slots.length = 0;
  for (const u of unknowns) slots.push(makeSlot(circuit, u));
  goalTarget(tgt, 0, goal, Z0);
  cands.length = 0; nonPassive = 0; ONLY = -1;
}

function result(status: SolveStatus, reason: string, unknowns: Unknown[], circleNode = -1, circles: Float64Array = new Float64Array(8), sameJob = false): SolveResult {
  return {
    status, reason, solutions: [], unknowns, goalNode: GNODE, circleNode, circles, nonPassive: 0, sameJob,
    ranges: [], domains: slots.map(domainOf), family: null,
  };
}

const sortKey = (u: Unknown): number => (u.param === 'f0' ? Infinity : 2 * u.part + (u.param === 'zc' ? 1 : 0));

/** Why the unknowns cannot be solved for in this circuit with this goal, or null. */
export function unknownsProblem(circuit: Circuit, unknowns: readonly Unknown[], goal: Goal): string | null {
  const count = circuit.parts.length;
  const gp = goalProblem(goal, count);
  if (gp) return gp;
  if (unknowns.length === 0) return 'mark a value to solve for';
  if (unknowns.length > 2) return 'at most two values can be solved for at a time';
  if (!(circuit.f0 > 0 && circuit.f0 < Infinity && circuit.z0 > 0 && circuit.z0 < Infinity)) return 'Z0 and f0 must be positive';
  const g = goalNode(goal, count);
  for (let i = 0; i < unknowns.length; i++) {
    const u = unknowns[i], param = u.param ?? 'value';
    if (param !== 'value' && param !== 'zc' && param !== 'f0') return `unknown kind of unknown "${param}"`;
    const range = u.lo !== undefined || u.hi !== undefined;
    if (param === 'f0') {
      if (unknowns.some((v, j) => j < i && v.param === 'f0')) return 'f0 is marked twice';
      if (u.free) return 'f0 cannot be a free reactance';
      const lo = u.lo ?? circuit.f0 / 10, hi = u.hi ?? circuit.f0 * 10;
      if (!(lo > 0 && hi > lo && hi < Infinity)) return 'the frequency range must be from a positive frequency up to a higher, finite one';
      continue;
    }
    if (!(Number.isInteger(u.part) && u.part >= 0 && u.part < count)) return `there is no part ${u.part + 1}`;
    const part = circuit.parts[u.part], kind = part.kind;
    if (param === 'zc') {
      if (kind === QUARTER) return `${partName(circuit, u.part)}: its Zt is its value, so mark the value`;
      if (kind !== LINE && !isStubKind(kind)) return `${partName(circuit, u.part)} has no Zc`;
      if (u.free) return `${partName(circuit, u.part)}: Zc cannot be a free reactance`;
      if (isStubKind(kind)) {
        sincosTurns(part.value);
        if (PT.SIN === 0 || PT.COS === 0) return `${partName(circuit, u.part)} is a multiple of λ/4 long, so its Zc changes nothing`;
        if (range) return 'only a line\'s Zc takes a search range';
      } else if (range) {
        const lo = u.lo ?? 0, hi = u.hi ?? Infinity;
        if (!(lo >= 0 && hi > lo)) return 'the Zc range must be from 0 Ω or more up to a larger value';
      }
    } else if (range) return 'only Zc and f0 take a search range';
    if (u.free && !isReactive(kind)) return `${partName(circuit, u.part)} is not an L or C, so it cannot be a free reactance or susceptance`;
    if (u.part >= g) return `${partName(circuit, u.part)} is beyond the goal's node, so it cannot change it`;
    for (let j = 0; j < i; j++) {
      if (unknowns[j].part === u.part && (unknowns[j].param ?? 'value') === param) return `${partName(circuit, u.part)} is marked twice`;
    }
  }
  return null;
}

/**
 * Solves for one or two unknowns so that the goal holds (solver.md): the solutions, the best value (one unknown, a
 * point target), the ranges (one unknown, an inequality goal) or a family (two unknowns, a circle goal). Pure: the
 * circuit is not changed. A few µs for a 10-part circuit on the geometric path; the fallback search is slower.
 */
export function solve(circuit: Circuit, unknownsIn: readonly Unknown[], goal: Goal): SolveResult {
  const count = circuit.parts.length;
  Z0 = circuit.z0; F0 = circuit.f0; FW = F0; LR = circuit.loadR; LX = circuit.loadX; GOAL = goal; POLE = goalPole(goal);
  GNODE = goalNode(goal, count);
  slots.length = 0;
  const unknowns = unknownsIn.slice().sort((a, b) => sortKey(a) - sortKey(b));
  const problem = unknownsProblem(circuit, unknowns, goal);
  if (problem) return result('rejected', problem, unknowns);
  const n = unknowns.length;
  const geo = unknowns.every((u) => u.param !== 'f0' && (u.param !== 'zc' || circuit.parts[u.part].kind !== LINE));
  // A circle goal that is one point is that point target for two unknowns and for the search.
  const asPoint = goal.kind === 'point' ? null : pointGoal(goal);
  setup(circuit, unknowns, asPoint && (n === 2 || !geo) ? asPoint : goal);
  ASKED = goal;
  // |Γ| ≤ 0 is |Γ| = 0.
  const point = GOAL.kind === 'point', within = isWithin(GOAL) && !asPoint;
  const circles = new Float64Array(8);
  if (n === 1) {
    if (point) return best(circuit, unknowns, circles, geo, !!asPoint);
    const early = geo ? oneUnknown(circuit, unknowns, circles) : searchOne();
    if (early) return within && early.status === 'coincident' ? rangeResult(circuit, unknowns, circles, early.circleNode, true) : early;
    return within ? rangeResult(circuit, unknowns, circles, geo ? slots[0].part + 1 : -1, false) : finish(circuit, unknowns, circles, geo ? slots[0].part + 1 : -1);
  }
  if (point) {
    if (geo) {
      const early = twoUnknowns(circuit, unknowns, circles);
      if (early) return early;
      return finish(circuit, unknowns, circles, slots[1].part);
    }
    searchTwo();
    return finish(circuit, unknowns, circles, -1);
  }
  if (!geo) {
    return result('family', 'with a line\'s Zc or f0 among two unknowns and a circle goal there is a family of solutions: fix one of them, or choose a point target', unknowns);
  }
  return familyResult(circuit, unknowns, circles);
}

function finish(circuit: Circuit, unknowns: Unknown[], circles: Float64Array, circleNode: number): SolveResult {
  const solutions = cands.map(buildSolution).sort(order);
  let sameJob = false;
  if (solutions.length === 0 && unknowns.length === 2 && circleNode >= 0) {
    // Does b's family of circles contain A′? Then a and b move the node along one circle.
    projectOnCircle(q, 0, circles, 0, 0.1234567, -0.0456789);
    partLocus(locP, 0, slots[1].kind, slots[1].zc, q[0], q[1], Z0, F0, F0);
    sameJob = locP[L_MODE] !== LOCUS_FIXED && sameCircle(circles, 0, locP, L_A);
  }
  let reason = '';
  if (solutions.length === 0) {
    const a = slots[0].part;
    if (sameJob) reason = `${partName(circuit, a)} and ${partName(circuit, slots[1].part)} do the same job: together they move the node along one circle, which misses the target`;
    else if (nonPassive > 0) reason = 'the only solutions need a negative resistance or Zc';
    else if (circleNode < 0) reason = unknowns.length === 2
      ? 'the search found no values of these two unknowns that reach the target'
      : 'the search found no value of this unknown in its range that meets the goal';
    else reason = unknowns.length === 2
      ? 'the two circles do not cross: no values of these two parts reach the target'
      : 'the part\'s circle does not reach the goal circle: no value of this part meets the goal';
  }
  return {
    status: solutions.length > 0 ? 'solved' : 'none', reason, solutions, unknowns, goalNode: GNODE,
    circleNode: solutions.length > 0 || circleNode >= 0 ? circleNode : -1, circles, nonPassive, sameJob,
    ranges: [], domains: slots.map(domainOf), family: null,
  };
}

// ---------------------------------------------------------------------------------------------------------------
// One unknown, a circle goal; two unknowns, a point target (M4.1a)

function oneUnknown(circuit: Circuit, unknowns: Unknown[], circles: Float64Array): SolveResult | null {
  const s = slots[0], a = s.part;
  gammaAt(gam, 0, a);
  partLocus(locA, 0, s.kind, s.zc, gam[0], gam[1], Z0, F0, F0);
  if (locA[L_MODE] === LOCUS_FIXED) {
    gammaAt(gam, 0, GNODE);
    const holds = isWithin(GOAL) ? goalSigned(GOAL, gam[0], gam[1]) <= 0 : goalResidual(GOAL, gam[0], gam[1], Z0) <= ACCEPT;
    return result(holds ? 'coincident' : 'none', holds
      ? `${partName(circuit, a)} cannot move the node here, and the goal already holds for every value`
      : `${partName(circuit, a)} cannot move the node here (it starts at its own fixed point), so no value meets the goal`, unknowns);
  }
  for (let k = 0; k < 4; k++) circles[k] = locA[L_A + k];
  chain(mA, a + 1, GNODE);
  mobInvert(mAi, 0, mA, 0);
  goalCircle(kc, 0, GOAL);
  circleImage(circles, 4, kc, 0, mAi, 0);
  const n = circleIntersect(pts, 0, circles, 0, circles, 4);
  if (n === CROSS_SAME) {
    return result('coincident', `every value of ${partName(circuit, a)} keeps the goal: its circle is the goal circle`, unknowns, a + 1, circles);
  }
  for (let i = 0; i < n; i++) consider([paramOn(locA, pts[2 * i], pts[2 * i + 1])]);
  return null;
}

function twoUnknowns(circuit: Circuit, unknowns: Unknown[], circles: Float64Array): SolveResult | null {
  const sa = slots[0], sb = slots[1], a = sa.part, b = sb.part;
  gammaAt(gam, 0, a);
  partLocus(locA, 0, sa.kind, sa.zc, gam[0], gam[1], Z0, F0, F0);
  if (locA[L_MODE] === LOCUS_FIXED) {
    return result('none', `${partName(circuit, a)} cannot move the node here (it starts at its own fixed point): only ${partName(circuit, b)} is free`, unknowns);
  }
  chain(mA, a + 1, b);
  circleImage(circles, 0, locA, L_A, mA, 0);
  chain(mB, b + 1, GNODE);
  mobInvert(mB, 0, mB, 0);
  mobApply(tp, 0, mB, 0, tgt[0], tgt[1]);
  const tr = tp[0], ti = tp[1];
  if (!(Math.abs(tr) < Infinity && Math.abs(ti) < Infinity)) {
    return result('none', 'the parts after the unknowns cannot reach the target', unknowns, b, circles);
  }
  partLocus(locB, 0, sb.kind, sb.zc, tr, ti, Z0, F0, F0);
  if (locB[L_MODE] === LOCUS_FIXED) {
    if (sb.kind !== LINE) {
      return result('degenerate', `the target is where ${partName(circuit, b)} sends every node with an infinite value, so ${partName(circuit, a)} is free`, unknowns, b, circles);
    }
    pointCircle(circles, 4, tr, ti);
  } else for (let k = 0; k < 4; k++) circles[4 + k] = locB[L_A + k];
  const n = circleIntersect(pts, 0, circles, 0, circles, 4);
  if (n === CROSS_SAME) {
    return result('coincident', `${partName(circuit, a)} and ${partName(circuit, b)} do the same job: their circles are one, so any value of one has a value of the other`, unknowns, b, circles, true);
  }
  mobInvert(mAi, 0, mA, 0);
  const ps = [0, 0];
  for (let i = 0; i < n; i++) {
    mobApply(q, 0, mAi, 0, pts[2 * i], pts[2 * i + 1]);
    const pa = paramOn(locA, q[0], q[1]);
    if (pa !== pa) continue;
    if (settle(sa, pa) < -1) continue;
    gammaAt(gam, 0, b);
    partLocus(locP, 0, sb.kind, sb.zc, gam[0], gam[1], Z0, F0, F0);
    if (locP[L_MODE] === LOCUS_FIXED) continue;
    const pb = paramOn(locP, tr, ti);
    if (pb !== pb) continue;
    ps[0] = pa; ps[1] = pb;
    consider(ps);
  }
  return null;
}

// ---------------------------------------------------------------------------------------------------------------
// One unknown, a point target: the best value

/** Mismatch of the working circuit at the goal node with slot 0 at coordinate t (∞ when it cannot be evaluated or is not passive). */
function mismatchAt(t: number): number {
  if (settle(slots[0], paramOf(slots[0], t)) < 0) return Infinity;
  gammaAt(gam, 0, GNODE);
  CURVE[0] = gam[0]; CURVE[1] = gam[1];
  const m = goalMismatch(GOAL, gam[0], gam[1], Z0);
  return m === m ? m : Infinity;
}

/** Keeps slot 0 at coordinate t as a candidate whatever its residual (passive values only). */
function keepAt(t: number): void {
  const ts = [t];
  normalise(ts);
  const codes = [0];
  if (settleAll(ts, codes) < 0) return;
  const r = residualOf(F0v);
  if (r === r && r < Infinity) keep(ts, codes, r);
}

const SAFETY = 32;
const bestTs: number[] = [];

function best(circuit: Circuit, unknowns: Unknown[], circles: Float64Array, geo: boolean, fromCircle: boolean): SolveResult {
  const s = slots[0];
  let circleNode = -1;
  bestTs.length = 0;
  if (geo) {
    const a = s.part;
    gammaAt(gam, 0, a);
    partLocus(locA, 0, s.kind, s.zc, gam[0], gam[1], Z0, F0, F0);
    if (locA[L_MODE] === LOCUS_FIXED) {
      return result('none', `${partName(circuit, a)} cannot move the node here (it starts at its own fixed point), so no value brings it nearer the target`, unknowns);
    }
    circleNode = a + 1;
    for (let k = 0; k < 4; k++) circles[k] = locA[L_A + k];
    // Q = T∘N: the mismatch at the goal node is |Q(P)| for P on a's locus.
    chain(mA, a + 1, GNODE);
    const tr = tgt[0], ti = tgt[1], rim = !(Math.hypot(tr, ti) < RIM);
    mT[0] = 1; mT[1] = 0; mT[2] = -tr; mT[3] = -ti; mT[4] = rim ? 0 : -tr; mT[5] = rim ? 0 : ti; mT[6] = 1; mT[7] = 0;
    mobCompose(mQ, 0, mT, 0, mA, 0);
    circleImage(kc, 0, locA, L_A, mQ, 0);
    const A = kc[0], Dr = kc[1], Di = kc[2], C = kc[3];
    let wr = NaN, wi = NaN;
    if (Math.abs(A) > 1e-14) {
      const cx = Dr / A, cy = Di / A, d = Math.hypot(cx, cy), R = Math.sqrt(Math.max(0, cx * cx + cy * cy - C / A));
      if (d > 0 && d < Infinity) { const k = 1 - R / d; wr = cx * k; wi = cy * k; }
    } else {
      const h2 = Dr * Dr + Di * Di;
      if (h2 > 0) { const k = C / (2 * h2); wr = Dr * k; wi = Di * k; }
    }
    if (wr === wr && wi === wi) {
      mobInvert(mAi, 0, mQ, 0);
      mobApply(q, 0, mAi, 0, wr, wi);
      const p = paramOn(locA, q[0], q[1]);
      if (p === p) bestTs.push(coordOf(s, p));
      // The circle of the mismatch reached, carried back to node a + 1: it touches a's locus at the best value.
      const rho = Math.hypot(wr, wi);
      if (rho > 0) { members[0] = 1; members[1] = 0; members[2] = 0; members[3] = -rho * rho; circleImage(circles, 4, members, 0, mAi, 0); }
      else pointCircle(circles, 4, q[0], q[1]);
    }
  }
  // The ends of the reach and the cuts (the best on an arc that misses the closed form's point is at an end).
  bestTs.push(s.lo, s.hi);
  for (const c of s.cuts) bestTs.push(c);
  let known = Infinity;
  for (const t of bestTs) { const m = mismatchAt(t); if (m < known) known = m; }
  if (geo) {
    // The guard of the closed form (a degenerate map, rounding): 32 samples, refined only if one does better.
    const step = (s.hi - s.lo) / SAFETY;
    let bt = NaN, bm = known;
    for (let k = 0; k <= SAFETY; k++) { const t = s.lo + step * k, m = mismatchAt(t); if (m < bm * (1 - 1e-12) - 1e-15) { bm = m; bt = t; } }
    if (bt === bt) bestTs.push(golden(mismatchAt, Math.max(s.lo, bt - step), Math.min(s.hi, bt + step), bt, bm));
  } else {
    const mins: number[] = [];
    minima1D(mismatchAt, s.lo, s.hi, gridOf(s, 1), mins, sharpPoints(s));
    for (let i = 0; i < Math.min(8, mins.length); i++) bestTs.push(mins[i]);
  }
  for (const t of bestTs) keepAt(t);
  let sols = cands.map(buildSolution);
  if (sols.length === 0) return result('none', 'no value of this unknown can be evaluated', unknowns);
  sols.sort((x, y) => x.mismatch - y.mismatch || byValue(x, y));
  const exact = sols.filter((x) => x.residual <= ACCEPT);
  const domains = slots.map(domainOf);
  if (exact.length > 0) {
    exact.sort(order);
    return { status: 'solved', reason: '', solutions: exact, unknowns, goalNode: GNODE, circleNode, circles, nonPassive: 0, sameJob: false, ranges: [], domains, family: null };
  }
  const top1 = sols[0];
  const out = [top1];
  if (!top1.realisable) { const r = sols.find((x) => x.realisable); if (r) out.push(r); }
  sols = out.sort((x, y) => (x.realisable !== y.realisable ? (x.realisable ? -1 : 1) : x.mismatch - y.mismatch));
  const reason = fromCircle
    ? 'no value of this unknown meets the goal: this is the value that comes nearest'
    : 'one value alone reaches a point only by chance: this is the value that comes nearest; free a second value to reach the target, or choose a circle goal';
  return { status: 'best', reason, solutions: sols, unknowns, goalNode: GNODE, circleNode, circles, nonPassive: 0, sameJob: false, ranges: [], domains, family: null };
}

// ---------------------------------------------------------------------------------------------------------------
// Ranges (an inequality goal with one unknown, and a family's first unknown)

const CUT = 2, HARD = 1, SOFT = 0;

/** Every coordinate of slot s's domain equivalent to t (the domain unrolled: a period of π or λ/2). */
function unroll(s: Slot, t: number, out: number[]): void {
  if (!(t === t)) return;
  if (!s.periodic) { if (t >= s.lo && t <= s.hi) out.push(t); return; }
  const per = s.mode === M_LEN ? LINE_PERIOD : Math.PI;
  let u = t - per * Math.floor((t - s.lo) / per);
  for (; u <= s.hi; u += per) if (u >= s.lo) out.push(u);
}

/**
 * The value of slot s at coordinate t (an end of a range), as the kind `kind`. ±π/2 is −∞ at the domain's low side
 * and +∞ at its high side (a short stub's −π/2 is length 0, its π/2 is λ/2; a C's −π/2 is C = 0).
 */
function valueAt(s: Slot, t: number, kind: number): number {
  if (s.param === P_F0) return F0 * Math.exp(t);
  if (s.mode === M_LEN) return t;
  let p = paramOf(s, t);
  if (!(Math.abs(p) < Infinity)) p = t < 0 ? -Infinity : Infinity;
  if (s.param === P_ZC) {
    if (s.kind === LINE) return Z0 * p;
    if (p === 0) return Infinity;
    if (!(Math.abs(p) < Infinity)) return 0;
    sincosTurns(s.len);
    return s.kind === STUB_OPEN ? (Z0 * PT.SIN) / (PT.COS * p) : -(Z0 * PT.COS) / (PT.SIN * p);
  }
  if (kind === QUARTER) return p > 0 ? Z0 * Math.sqrt(p) : 0;
  if (kind === STUB_OPEN && t >= s.hi) return LINE_PERIOD;
  return p === 0 ? noEffect(kind, F0, F0) : valueFor(kind, p, s.zc, F0, F0, Z0);
}

function makeRange(s: Slot, t0: number, t1: number, branches: number): ValueRange {
  const mid = 0.5 * (t0 + t1);
  const code = settle(s, paramOf(s, mid));
  const kind = (s.param === P_F0 ? -1 : s.param === P_ZC ? s.kind : packed[s.part * PART_STRIDE + 0]) as PartKind | -1;
  const from = valueAt(s, t0, kind), to = valueAt(s, t1, kind);
  return { t0, t1, kind, from, to, min: Math.min(from, to), max: Math.max(from, to), swapped: code === 1, branches };
}

/**
 * The ranges of slot s's coordinate where count(t) ≥ 1, from boundaries `breaks`, the domain's cuts and ends, and a
 * grid of `grid` intervals whose points only separate when the count differs on their two sides (then the boundary
 * is found by bisection). A range never crosses a cut.
 */
function buildRanges(s: Slot, breaks: number[], count: (t: number) => number, grid: number): ValueRange[] {
  const lo = s.lo, hi = s.hi;
  const at: number[] = [lo, hi], kind: number[] = [CUT, CUT];
  for (const c of s.cuts) { at.push(c); kind.push(CUT); }
  for (const b of breaks) if (b > lo && b < hi) { at.push(b); kind.push(HARD); }
  for (let k = 1; k < grid; k++) { at.push(lo + ((hi - lo) * k) / grid); kind.push(SOFT); }
  const idx = at.map((_, i) => i).sort((i, j) => at[i] - at[j] || kind[j] - kind[i]);
  const P: number[] = [], K: number[] = [];
  for (const i of idx) {
    const t = at[i], last = P.length - 1;
    if (last >= 0 && t - P[last] <= 1e-12 * Math.max(1, Math.abs(t))) { if (kind[i] > K[last]) K[last] = kind[i]; continue; }
    P.push(t); K.push(kind[i]);
  }
  const m = P.length - 1;
  if (m < 1) return [];
  const counts: number[] = new Array(m);
  for (let i = 0; i < m; i++) counts[i] = count(0.5 * (P[i] + P[i + 1]));
  for (let i = 1; i < m; i++) {
    if (K[i] !== SOFT || counts[i - 1] === counts[i]) continue;
    let a = 0.5 * (P[i - 1] + P[i]), b = 0.5 * (P[i] + P[i + 1]);
    const ca = counts[i - 1];
    for (let it = 0; it < 80 && b - a > 1e-14 * Math.max(1, Math.abs(a)); it++) {
      const c = 0.5 * (a + b);
      if (count(c) === ca) a = c; else b = c;
    }
    P[i] = 0.5 * (a + b);
  }
  const out: ValueRange[] = [];
  for (let i = 0; i < m; i++) {
    if (counts[i] < 1) continue;
    const start = i;
    let branches = counts[i];
    while (i + 1 < m && counts[i + 1] >= 1 && K[i + 1] !== CUT) { i++; if (counts[i] > branches) branches = counts[i]; }
    out.push(makeRange(s, P[start], P[i + 1], branches));
  }
  return out;
}

function rangeResult(circuit: Circuit, unknowns: Unknown[], circles: Float64Array, circleNode: number, all: boolean): SolveResult {
  const s = slots[0];
  const breaks: number[] = [];
  for (const c of cands) unroll(s, c.t[0], breaks);
  const inside = (t: number): number => {
    if (all) return 1;
    if (settle(s, paramOf(s, t)) < 0) return 0;
    gammaAt(gam, 0, GNODE);
    return goalSigned(GOAL, gam[0], gam[1]) <= 0 ? 1 : 0;
  };
  const ranges = buildRanges(s, breaks, inside, 0);
  const solutions = cands.map(buildSolution).sort(order);
  return {
    status: ranges.length ? 'range' : 'none',
    reason: ranges.length ? '' : `no value of ${s.param === P_F0 ? 'f0 in its range' : partName(circuit, s.part)} keeps the goal`,
    solutions, unknowns, goalNode: GNODE, circleNode, circles, nonPassive, sameJob: false, ranges, domains: slots.map(domainOf), family: null,
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Two unknowns, a circle goal: a family

/**
 * b's locus through P crossing K′ by a half-chord above this (in Γ) gives two members even when the circles touch
 * within TANGENT_TOL: with P a hair inside the rim, b's locus (a line's |Γ| circle) runs a hair inside the rim and
 * crosses a K′ that touches the rim within about 1e-6 of that point, for every value of a (BL55).
 */
const FAMILY_SPLIT = 1e-7;

/** The solutions with slot 0 at coordinate t, into cands (K′ of the goal at node b + 1 in kp). */
function familyAt(t: number): void {
  const sa = slots[0], sb = slots[1];
  cands.length = 0;
  const pa = paramOf(sa, t);
  if (settle(sa, pa) < 0) return;
  gammaAt(gam, 0, sb.part);
  partLocus(locP, 0, sb.kind, sb.zc, gam[0], gam[1], Z0, F0, F0);
  if (locP[L_MODE] === LOCUS_FIXED) return;
  const n = circleIntersect(pts, 0, locP, L_A, kp, 0, FAMILY_SPLIT);
  const ps = [pa, 0];
  for (let i = 0; i < n; i++) {
    const pb = paramOn(locP, pts[2 * i], pts[2 * i + 1]);
    if (pb !== pb) continue;
    ps[1] = pb;
    consider(ps);
  }
}

const W_Z = 0, W_Y = 1, W_C = 2;
const F_RE = 0, F_IM = 1, F_ABS = 2, F_ARG = 3;

/**
 * The circles of b's family that touch K′ (k at o), into out (4 numbers each); returns how many (0–2), or −1 when K′
 * is itself a circle of the family (b moves the node along it). The family is b's loci through every point: lines
 * Re or Im of z or y, circles about 0 in the chart of b's Zc, or (λ/4) lines through 0 in z, reflected (z → s/z).
 */
function touching(out: Vec, kind: number, zc: number, k: Vec, o: number): number {
  let plane: number, fam: number;
  switch (kind) {
    case SERIES_L: case SERIES_C: plane = W_Z; fam = F_RE; break;
    case SERIES_R: plane = W_Z; fam = F_IM; break;
    case SHUNT_R: plane = W_Y; fam = F_IM; break;
    case LINE: plane = W_C; fam = F_ABS; break;
    case QUARTER: plane = W_Z; fam = F_ARG; break;
    default: plane = W_Y; fam = F_RE; // shunt L, C, stubs
  }
  mw.fill(0);
  if (plane === W_Z) { mw[0] = 1; mw[2] = 1; mw[4] = -1; mw[6] = 1; }
  else if (plane === W_Y) { mw[0] = -1; mw[2] = 1; mw[4] = 1; mw[6] = 1; }
  else { const zn = zc / Z0, B = (zn - 1) / (zn + 1); mw[0] = 1; mw[2] = -B; mw[4] = -B; mw[6] = 1; }
  mobInvert(mwi, 0, mw, 0);
  circleImage(cw, 0, k, o, mw, 0);
  const A = cw[0], Dr = cw[1], Di = cw[2], C = cw[3];
  const line = Math.abs(A) <= 1e-12;
  let m = 0;
  const add = (a: number, dr: number, di: number, c: number): void => {
    if (!(Math.abs(c) < Infinity && Math.abs(dr) < Infinity && Math.abs(di) < Infinity)) return;
    cw[4] = a; cw[5] = dr; cw[6] = di; cw[7] = c;
    circleImage(out, 4 * m, cw, 4, mwi, 0);
    m++;
  };
  if (fam === F_RE || fam === F_IM) {
    const d = fam === F_RE ? Dr : Di, e = fam === F_RE ? Di : Dr;
    if (line) return Math.abs(e) <= 1e-12 ? -1 : 0;
    const S2 = Dr * Dr + Di * Di - A * C;
    if (!(S2 >= 0)) return 0;
    const S = Math.sqrt(S2);
    for (const v of S > 0 ? [(d - S) / A, (d + S) / A] : [d / A]) {
      if (fam === F_RE) add(0, 1, 0, 2 * v); else add(0, 0, 1, 2 * v);
    }
  } else if (fam === F_ABS) {
    const h = Math.hypot(Dr, Di);
    if (line) { if (h > 0) { const r = Math.abs(C) / (2 * h); if (r > 0) add(1, 0, 0, -r * r); } return m; }
    const S = Math.sqrt(Math.max(0, h * h - A * C));
    if (!(h + S > 0)) return 0;
    const rMax = (h + S) / Math.abs(A), rMin = Math.abs(C) / (h + S);
    if (rMin > 0) add(1, 0, 0, -rMin * rMin);
    if (rMax !== rMin) add(1, 0, 0, -rMax * rMax);
  } else {
    // Lines through 0 at angle φ meet K′ in z; b's start must be at angle −φ (z_out = s/z_in, s > 0).
    if (line) {
      if (Math.abs(C) <= 1e-12) return -1;
      add(0, Dr, -Di, 0);
    } else {
      if (Math.abs(C) <= 1e-12) {
        // K′ through 0: the line through 0 that touches it there.
        const phi = Math.atan2(Di / A, Dr / A) + HALF_PI;
        add(0, Math.sin(phi), Math.cos(phi), 0);
        return m;
      }
      if (!(C / A > 0)) return 0;
      const cx = Dr / A, cy = Di / A, dist = Math.hypot(cx, cy), R = Math.sqrt(Math.max(0, dist * dist - C / A));
      const base = Math.atan2(cy, cx), half = Math.asin(Math.min(1, R / dist));
      for (const phi of [base - half, base + half]) add(0, Math.sin(phi), Math.cos(phi), 0);
    }
  }
  return m;
}

const FAMILY_GRID = 48;

function familyResult(circuit: Circuit, unknowns: Unknown[], circles: Float64Array): SolveResult {
  const sa = slots[0], sb = slots[1], a = sa.part, b = sb.part;
  gammaAt(gam, 0, a);
  partLocus(locA, 0, sa.kind, sa.zc, gam[0], gam[1], Z0, F0, F0);
  if (locA[L_MODE] === LOCUS_FIXED) {
    return result('none', `${partName(circuit, a)} cannot move the node here (it starts at its own fixed point): only ${partName(circuit, b)} is free, so fix it or choose a point target`, unknowns);
  }
  chain(mA, a + 1, b);
  circleImage(circles, 0, locA, L_A, mA, 0);
  chain(mB, b + 1, GNODE);
  mobInvert(mB, 0, mB, 0);
  goalCircle(kc, 0, GOAL);
  circleImage(kp, 0, kc, 0, mB, 0);
  for (let k = 0; k < 4; k++) circles[4 + k] = kp[k];
  const kprime = Float64Array.from(kp);
  // Boundaries of a's range: P on a circle of b's family that touches K′, or on K′ (b's value through 0 or ∞).
  mobInvert(mAi, 0, mA, 0);
  const breaks: number[] = [];
  const crossings = (c: Vec, o: number): void => {
    const n = circleIntersect(pts, 0, circles, 0, c, o);
    for (let i = 0; i < n; i++) {
      mobApply(q, 0, mAi, 0, pts[2 * i], pts[2 * i + 1]);
      const p = paramOn(locA, q[0], q[1]);
      if (p === p) unroll(sa, coordOf(sa, p), breaks);
    }
  };
  const nm = touching(members, sb.kind, sb.zc, kp, 0);
  if (nm < 0) {
    return result('none', `${partName(circuit, b)} moves the node along the goal circle itself, so it cannot bring the node onto it: fix ${partName(circuit, b)} and solve for ${partName(circuit, a)}`, unknowns, b, circles);
  }
  for (let i = 0; i < nm; i++) crossings(members, 4 * i);
  crossings(kp, 0);
  ONLY = 1;
  const ranges = buildRanges(sa, breaks, (t) => { familyAt(t); return cands.length; }, FAMILY_GRID);
  const GOAL_USED = GOAL;
  const at = (t: number): Solution[] => {
    setup(circuit, unknowns, GOAL_USED);
    kp.set(kprime);
    ONLY = 1;
    familyAt(t);
    const sols = cands.map(buildSolution).sort(order);
    ONLY = -1;
    return sols;
  };
  const ends: Solution[] = [];
  for (const r of ranges) {
    for (const [t, inward] of [[r.t0, 1], [r.t1, -1]]) {
      let sols = at(t);
      if (sols.length === 0) sols = at(t + inward * 1e-9 * (r.t1 - r.t0));
      ends.push(...sols);
    }
  }
  // at() set the state up again: the result's fields come from it.
  ONLY = -1;
  const within = isWithin(GOAL);
  const reason = ranges.length === 0
    ? `for no value of ${partName(circuit, a)} does ${partName(circuit, b)} reach the goal circle`
    : within
      ? 'two unknowns and a circle goal leave a family of solutions: these are the values on the goal\'s circle; values inside it keep the goal too'
      : 'two unknowns and a circle goal leave a family of solutions: choose the first value in its range, or fix one of them';
  return {
    status: ranges.length ? 'family' : 'none', reason, solutions: [], unknowns, goalNode: GNODE, circleNode: b, circles,
    nonPassive: 0, sameJob: false, ranges, domains: slots.map(domainOf), family: ranges.length ? { at, ends } : null,
  };
}

// ---------------------------------------------------------------------------------------------------------------
// The fallback search: a line's Zc, f0

/** Intervals of a grid over slot s's coordinate: 32 per half turn of the circuit's lines at the top of an f0 range. */
function gridOf(s: Slot, dims: number): number {
  if (s.mode !== M_LOG) return dims === 1 ? 256 : 64;
  const fHi = F0 * Math.exp(s.hi);
  let turns = 0;
  for (let k = 0, p = 0; k < GNODE; k++, p += PART_STRIDE) turns += turnsAt(packed[p], packed[p + 1], fHi, F0);
  const span = s.hi - s.lo;
  return dims === 1 ? Math.min(50000, 256 + Math.ceil(64 * span * turns)) : Math.min(2048, 64 + Math.ceil(8 * span * turns));
}

/**
 * Where an f0 search must look closely: the frequencies at which a stub before the goal node is a multiple of λ/4
 * long (its b passes through 0 or ∞, so a node may go round the chart within a tiny band), with points at relative
 * distances 1e-9, 1e-6 and 1e-3 on both sides, as ln(f/f0). None for other unknowns.
 */
function sharpPoints(s: Slot): number[] {
  const out: number[] = [];
  if (s.param !== P_F0) return out;
  const fLo = Math.exp(s.lo), fHi = Math.exp(s.hi);
  for (let k = 0, p = 0; k < GNODE; k++, p += PART_STRIDE) {
    if (!isStubKind(packed[p])) continue;
    const len = packed[p + 1];
    if (!(len > 0 && len < Infinity)) continue;
    for (let q = Math.max(1, Math.ceil(4 * len * fLo)); q <= 4 * len * fHi && out.length < 20000; q++) {
      const u = Math.log(q / (4 * len));
      out.push(u, u - 1e-9, u + 1e-9, u - 1e-6, u + 1e-6, u - 1e-3, u + 1e-3);
    }
  }
  return out;
}

function signedAt(t: number): number {
  if (settle(slots[0], paramOf(slots[0], t)) < -1) return NaN;
  gammaAt(gam, 0, GNODE);
  CURVE[0] = gam[0]; CURVE[1] = gam[1];
  return goalSigned(GOAL, gam[0], gam[1]);
}

/** One unknown, a circle goal: the roots of the goal's signed distance over the coordinate. */
function searchOne(): null {
  const s = slots[0];
  const roots: number[] = [];
  roots1D(signedAt, s.lo, s.hi, gridOf(s, 1), roots, sharpPoints(s));
  for (const t of roots) consider([paramOf(s, t)]);
  return null;
}

const nt = new Float64Array(2);

function f2(x: number, y: number, out: Float64Array): number {
  if (settle(slots[0], paramOf(slots[0], x)) < -1 || settle(slots[1], paramOf(slots[1], y)) < -1) return NaN;
  gammaAt(gam, 0, GNODE);
  out[0] = gam[0] - tgt[0]; out[1] = gam[1] - tgt[1];
  const r = Math.hypot(out[0], out[1]);
  return r === r ? r : NaN;
}

let grid2 = new Float64Array(64 * 64);

/**
 * Two unknowns (one at least without a circle), a point target. When one unknown moves its node along a circle at
 * every value of the other (a part's value with a line's Zc, or with f0 unless it is a λ/4 or a stub's Zc), the
 * question for each value u of the other is whether the target carried back lies on that circle: the roots of the
 * signed distance in u (searchMixed). Otherwise a grid of both and damped Newton from every local minimum.
 */
function searchTwo(): void {
  const gi = slots[0].geo ? 0 : 1, fi = 1 - gi, sg = slots[gi], sf = slots[fi];
  if (sg.geo && !(sf.param === P_F0 && (sg.kind === QUARTER || sg.param === P_ZC))) searchMixed(fi, gi);
  else searchGrid();
}

let MF = 0, MG = 1;

/** The signed distance of the target carried back to node g + 1 from the circle of the geometric unknown g. */
function mixedAt(u: number): number {
  const sf = slots[MF], sg = slots[MG];
  if (settle(sf, paramOf(sf, u)) < -1) return NaN;
  gammaAt(gam, 0, sg.part);
  CURVE[0] = gam[0]; CURVE[1] = gam[1];
  partLocus(locP, 0, sg.kind, packed[sg.part * PART_STRIDE + 2], gam[0], gam[1], Z0, FW, F0);
  const mode = locP[L_MODE];
  if (mode !== LOCUS_MOBIUS && mode !== LOCUS_LINE) return NaN;
  chain(mB, sg.part + 1, GNODE);
  mobInvert(mB, 0, mB, 0);
  mobApply(tp, 0, mB, 0, tgt[0], tgt[1]);
  if (!(Math.abs(tp[0]) < Infinity && Math.abs(tp[1]) < Infinity)) return NaN;
  CURVE[2] = tp[0]; CURVE[3] = tp[1];
  return circleResidual(locP, L_A, tp[0], tp[1]);
}

const geoPs: number[] = [];

/** The geometric unknown's parameters at f0 for its parameter pg at FW (every length that gives it, for lines and stubs). */
function atF0(sg: Slot, pg: number): void {
  geoPs.length = 0;
  const r = FW / F0;
  if (r === 1) { geoPs.push(pg); return; }
  const per = 0.5 / r;
  switch (sg.kind) {
    // An L's x or a C's b grows with f, a C's x or an L's b falls; the sign of pg says which kind it is (a swapped
    // value is the other kind, scaled as that kind).
    case SERIES_L: case SERIES_C: case SHUNT_L: case SHUNT_C: geoPs.push(pg >= 0 ? pg / r : pg * r); break;
    case LINE: for (let l = pg - per * Math.floor(pg / per); l < LINE_PERIOD; l += per) geoPs.push(l); break;
    case STUB_OPEN: case STUB_SHORT: {
      const len = valueFor(sg.kind, pg, sg.zc, FW, F0, Z0);
      if (!(len === len)) break;
      for (let l = len - per * Math.floor(len / per); l < LINE_PERIOD; l += per) geoPs.push(added(sg.kind, l, sg.zc, F0, F0, Z0));
      break;
    }
    default: geoPs.push(pg); // R
  }
}

function searchMixed(fi: number, gi: number): void {
  MF = fi; MG = gi;
  const sf = slots[fi], sg = slots[gi];
  const roots: number[] = [];
  roots1D(mixedAt, sf.lo, sf.hi, gridOf(sf, 1), roots, sharpPoints(sf));
  const ps = [0, 0];
  for (const u of roots) {
    const d = mixedAt(u);
    if (d !== d) continue;
    const pg = paramOn(locP, tp[0], tp[1]);
    if (pg !== pg) continue;
    atF0(sg, pg);
    const pu = paramOf(sf, u), list = geoPs.slice();
    for (const p of list) { ps[fi] = pu; ps[gi] = p; consider(ps); }
  }
}

/**
 * Point i of an n-point grid over slot s. A Zc or Zt (half) is sampled closer towards 0 and ∞ (1 − cos spacing, the
 * end cells about π/(4n)² wide): near Zc → ∞ a line's input moves as fast as 1/(π/2 − t), and a uniform grid missed
 * answers there (M4.2).
 */
function gridAt(s: Slot, i: number, n: number): number {
  const f = (i + 0.5) / n;
  return s.lo + (s.hi - s.lo) * (s.half ? 0.5 * (1 - Math.cos(Math.PI * f)) : f);
}

/** searchGrid: an interval of the grid is halved while Γ moves more than this across it in some row or column. */
const GRID_JUMP = 0.25;
const GRID_PASSES = 6;
const GRID_MAX = 8192 * 8;
/** searchGrid: a Zt or Zc also gets columns towards 0 and ∞ past the first grid's end ones, END_RATIO apart, to END_NEAREST. */
const END_RATIO = 0.125, END_NEAREST = 1e-12;
/** searchGrid: Newton (40 steps) that ends within NEWTON_ON of the target goes on for NEWTON_MORE steps. */
const NEWTON_ON = 0.03, NEWTON_MORE = 160;
let gridRe = new Float64Array(64 * 64), gridIm = new Float64Array(64 * 64);

/** passRows: the most bisections of one passage (48 halvings take a grid row's width to the last bits of ln f). */
const PASS_DEPTH = 48;
const passRe: number[] = [], passIm: number[] = [];

/** Γ at node n at the frequency of f0's coordinate y into gam (false if it cannot be evaluated). */
function nodeAtF(s1: Slot, n: number, y: number): boolean {
  if (settle(s1, paramOf(s1, y)) < -1) return false;
  gammaAt(gam, 0, n);
  return gam[0] === gam[0] && gam[1] === gam[1];
}

/**
 * searchGrid with f0 and a Zc or Zt (BL56): far from Z0 such a part turns the short or the open at its input node into
 * the whole chart, so where that node (which f alone moves) passes the short or open between two rows, the answers
 * lie in a band of f as narrow as the passage is close: a high-Q resonance before the part, which no grid resolves
 * and whose rows may show no jump at all. Such passages (the chord of two rows' points nearer the short or open than
 * half the nearer row) are bisected towards their nearest point, PASS_DEPTH times at most, and the rows added to ys.
 */
function passRows(s0: Slot, s1: Slot, ys: number[]): void {
  const n = ys.length, at = s0.part, added: number[] = [];
  passRe.length = 0; passIm.length = 0;
  for (let j = 0; j < n; j++) {
    const ok = nodeAtF(s1, at, ys[j]);
    passRe.push(ok ? gam[0] : NaN); passIm.push(ok ? gam[1] : NaN);
  }
  for (let j = 0; j + 1 < n; j++) {
    for (let p = -1; p <= 1; p += 2) passBisect(s1, at, p, ys[j], passRe[j], passIm[j], ys[j + 1], passRe[j + 1], passIm[j + 1], 0, added);
  }
  for (const y of added) ys.push(y);
  if (added.length) ys.sort((a, b) => a - b);
}

/** One passage of passRows between rows ya and yb (node points a, b) by the short (p = −1) or open (p = 1): midpoints into out. */
function passBisect(s1: Slot, at: number, p: number, ya: number, ar: number, ai: number, yb: number, br: number, bi: number, depth: number, out: number[]): void {
  if (depth >= PASS_DEPTH || !(yb - ya > 4e-16 * Math.max(1, Math.abs(ya)))) return;
  const ux = br - ar, uy = bi - ai, l2 = ux * ux + uy * uy;
  if (!(l2 > 0)) return;
  const s = Math.min(1, Math.max(0, ((p - ar) * ux - ai * uy) / l2));
  const dc = Math.hypot(ar + s * ux - p, ai + s * uy);
  if (!(dc < 0.5 * Math.min(Math.hypot(ar - p, ai), Math.hypot(br - p, bi)))) return;
  const ym = 0.5 * (ya + yb);
  if (!nodeAtF(s1, at, ym)) return;
  const mr = gam[0], mi = gam[1];
  out.push(ym);
  passBisect(s1, at, p, ya, ar, ai, ym, mr, mi, depth + 1, out);
  passBisect(s1, at, p, ym, mr, mi, yb, br, bi, depth + 1, out);
}

/** The midpoints of the intervals of `at` across which Γ jumps by more than GRID_JUMP near the target (along axis 0 or 1 of the grid). */
function jumps(at: number[], other: number, axis: number, stride: number): number[] {
  const out: number[] = [];
  for (let a = 0; a + 1 < at.length; a++) {
    for (let b = 0; b < other; b++) {
      const p = axis === 0 ? a * stride + b : b * stride + a, q = axis === 0 ? p + stride : p + 1;
      const d = Math.hypot(gridRe[q] - gridRe[p], gridIm[q] - gridIm[p]);
      if (d > GRID_JUMP) { out.push(0.5 * (at[a] + at[a + 1])); break; }
    }
  }
  return out;
}

/**
 * Two unknowns, a point target, neither on a circle: damped Newton from every local minimum of a grid. The grid is
 * refined (up to GRID_PASSES halvings) wherever Γ jumps across an interval in some row or column: where the circuit
 * resonates the answers lie in bands far narrower than the first grid (a line's Zc far from Z0 against f0, M4.2).
 */
function searchGrid(): void {
  const s0 = slots[0], s1 = slots[1];
  let xs: number[] = [], ys: number[] = [];
  for (let i = 0, m = gridOf(s0, 2); i < m; i++) xs.push(gridAt(s0, i, m));
  // A Zt or Zc: columns ever closer to 0 and ∞ too, where the answers of a λ/4 or line near a multiple of λ/2 lie
  // (Zt·sin θ finite as Zt → ∞; BL56: Zt = 307·Z0 at 8.01·f0, past the first grid's last column at 64·Z0).
  if (s0.half) {
    const m = xs.length;
    for (let d = xs[0] - s0.lo; d > END_NEAREST; ) { d *= END_RATIO; xs.push(s0.lo + d); }
    for (let d = s0.hi - xs[m - 1]; d > END_NEAREST; ) { d *= END_RATIO; xs.push(s0.hi - d); }
    xs.sort((a, b) => a - b);
  }
  for (let j = 0, m = gridOf(s1, 2); j < m; j++) ys.push(gridAt(s1, j, m));
  // f0 (always the second unknown) also gets every frequency where a stub before the goal is a multiple of λ/4.
  for (const u of sharpPoints(s1)) if (u > s1.lo && u < s1.hi) ys.push(u);
  ys.sort((a, b) => a - b);
  if (s0.half && s1.param === P_F0) passRows(s0, s1, ys);
  let n0 = 0, n1 = 0, oldX: number[] = [], oldY: number[] = [];
  const started = new Set<string>();
  const ps = [0, 0];
  // Damped Newton from every local minimum of the grid (once per grid point over the passes).
  const descend = (): void => {
    for (let i = 0; i < n0; i++) {
      for (let j = 0; j < n1; j++) {
        const r = grid2[i * n1 + j];
        if (r === Infinity) continue;
        let low = true;
        for (let di = -1; di <= 1 && low; di++) {
          for (let dj = -1; dj <= 1 && low; dj++) {
            if ((di === 0 && dj === 0) || i + di < 0 || i + di >= n0 || j + dj < 0 || j + dj >= n1) continue;
            const v = grid2[(i + di) * n1 + j + dj];
            // Ties go to the first cell, so a flat run starts once.
            low = di < 0 || (di === 0 && dj < 0) ? r < v : r <= v;
          }
        }
        if (!low) continue;
        const key = `${xs[i]},${ys[j]}`;
        if (started.has(key)) continue;
        started.add(key);
        let end = newton2D(f2, xs[i], ys[j], 40, nt);
        // A start in a thin curved valley (an extreme Zc or Zt at a resonance, BL56) crawls along it: one that ends
        // near the target goes on.
        if (end > 1e-10 && end < NEWTON_ON) end = newton2D(f2, nt[0], nt[1], NEWTON_MORE, nt);
        if (!(end <= 1e-10)) continue;
        // Newton may leave a bounded coordinate (f0 outside its search range, M4.2): not an answer of this question.
        if ((!s0.periodic && !(nt[0] >= s0.lo && nt[0] <= s0.hi)) || (!s1.periodic && !(nt[1] >= s1.lo && nt[1] <= s1.hi))) continue;
        ps[0] = paramOf(s0, nt[0]); ps[1] = paramOf(s1, nt[1]);
        consider(ps);
      }
    }
  };
  for (let pass = 0; ; pass++) {
    const m0 = xs.length, m1 = ys.length;
    const re = new Float64Array(m0 * m1), im = new Float64Array(m0 * m1), r2 = new Float64Array(m0 * m1);
    // Keep what the last pass evaluated (both lists only grow, in order).
    const ix: number[] = [], iy: number[] = [];
    for (let i = 0, k = 0; i < m0; i++) { while (k < n0 && oldX[k] < xs[i]) k++; ix.push(k < n0 && oldX[k] === xs[i] ? k : -1); }
    for (let j = 0, k = 0; j < m1; j++) { while (k < n1 && oldY[k] < ys[j]) k++; iy.push(k < n1 && oldY[k] === ys[j] ? k : -1); }
    for (let i = 0; i < m0; i++) {
      for (let j = 0; j < m1; j++) {
        const o = i * m1 + j;
        if (ix[i] >= 0 && iy[j] >= 0) {
          const q = ix[i] * n1 + iy[j];
          re[o] = gridRe[q]; im[o] = gridIm[q]; r2[o] = grid2[q];
          continue;
        }
        const r = f2(xs[i], ys[j], nt);
        if (r === r) { re[o] = nt[0]; im[o] = nt[1]; r2[o] = r; } else { re[o] = NaN; im[o] = NaN; r2[o] = Infinity; }
      }
    }
    gridRe = re; gridIm = im; grid2 = r2; n0 = m0; n1 = m1; oldX = xs; oldY = ys;
    // The first grid's minima, and the refined grid's (a refinement can turn a good start into a slope).
    if (pass === 0) descend();
    if (pass === GRID_PASSES) break;
    let ax = jumps(xs, n1, 0, n1), ay = jumps(ys, n0, 1, n1);
    // Within GRID_MAX points: both refinements, else the one that fits (the smaller first).
    if ((n0 + ax.length) * (n1 + ay.length) > GRID_MAX) {
      const fitX = (n0 + ax.length) * n1 <= GRID_MAX, fitY = n0 * (n1 + ay.length) <= GRID_MAX;
      if (fitX && (!fitY || ax.length * n1 <= ay.length * n0)) ay = []; else if (fitY) ax = []; else break;
    }
    if (!ax.length && !ay.length) break;
    xs = xs.concat(ax).sort((a, b) => a - b);
    ys = ys.concat(ay).sort((a, b) => a - b);
  }
  descend();
}

/**
 * The circuit for a new f0 = f with every part as it is physically: lengths in wavelengths scaled by f/f0, a λ/4
 * transformer (λ/4 at the old f0) as a line of Zc = Zt. For an f0 solution.
 */
export function atFrequency(circuit: Circuit, f: number): Circuit {
  const k = f / circuit.f0;
  const parts: Part[] = circuit.parts.map((p) => {
    if (p.kind === QUARTER) return { kind: LINE, value: 0.25 * k, zc: p.value };
    if (p.kind === LINE || isStubKind(p.kind)) return { ...p, value: p.value * k };
    return { ...p };
  });
  return { ...circuit, f0: f, parts };
}
