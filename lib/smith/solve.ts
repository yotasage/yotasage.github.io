// The solver, "find the missing value" (docs/smith-chart/solver.md, plan.md D7), its geometric core (M4.1a): one or
// two parts' values are unknown, a goal (goal.ts) says what must hold at the input or at a chosen node, and the
// answer is the intersection of two circles in the Γ plane.
//
// Two unknowns a < b (a nearer the load) and a point target T at node g:
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
// Every candidate is re-evaluated by network.ts; one whose residual at the goal node is above ACCEPT after at most
// four Newton steps is not a solution (the touching point of two circles of one family at the open or short, a
// rank-1 map) and is dropped. Values: L, C and R are never negative: a reactance or susceptance of the wrong sign is
// offered as the other kind (swapped, true at f0 only) unless the unknown is free ("a series reactance", "a shunt
// susceptance", whose sign picks L or C); a negative R and an imaginary Zt are not passive and are dropped (counted in
// nonPassive). Lengths are the shortest ≥ 0, with `period` (λ/2 at f0) for the note that adding it gives the same
// match. Order (solver.md "What comes back"): realisable first, fewer parts changed, smaller total change, then by
// value; deterministic.
//
// Not here (M4.1b): one unknown with a point target (the best value), ranges of inequality goals, families (two
// unknowns, a circle goal), the fallback search for unknowns whose locus is not a circle (a line's or stub's Zc, f0),
// standard values. Everything is at f0.

import type { Vec } from './complex';
import {
  CROSS_SAME, LOCUS_FIXED, LOCUS_LINE, LOCUS_STRIDE, L_A, L_MODE, MOB_STRIDE,
  circleImage, circleIntersect, locusParam, locusValue, mobApply, mobCompose, mobInvert, partLocus, partMobius,
  pointCircle, projectOnCircle, sameCircle,
} from './geometry';
import { goalCircle, goalNode, goalProblem, goalResidual, goalSigned, goalTarget, isCircleGoal } from './goal';
import type { Goal } from './goal';
import { NODE_STRIDE, applyPart, loadNode, nodeGamma } from './network';
import type { Circuit } from './network';
import {
  LINE, LINE_PERIOD, PART_STRIDE, QUARTER, REACH_HI, REACH_LO, SERIES_C, SERIES_L, SERIES_R, SHUNT_C,
  SHUNT_L, SHUNT_R, STUB_OPEN, STUB_SHORT, added, noEffect, packParts, valueFor,
} from './parts';
import type { PartKind } from './parts';

/** What is unknown: a part's value (the default), a line's or stub's Zc, or f0 (the last two are M4.1b). */
export type UnknownParam = 'value' | 'zc' | 'f0';

export interface Unknown {
  /** The part (0-based, from the load); ignored for 'f0'. */
  part: number;
  param?: UnknownParam;
  /** A series L or C as "a series reactance", a shunt L or C as "a shunt susceptance": the sign picks L or C. */
  free?: boolean;
}

export interface SolvedValue {
  part: number;
  /** The kind to use: the part's own, the other of L and C for a free unknown, or for a swapped one. */
  kind: PartKind;
  /** In the part's unit: Ω, H, F, wavelengths at f0, Zt in Ω. Lumped values may be 0 or ∞ (the part's limits). */
  value: number;
  zc: number;
  /** The normalised r, x, g or b added (a stub's b), (Zt/Z0)² for λ/4, a line's length in wavelengths at f0. */
  added: number;
  /** A reactance or susceptance of the wrong sign for the part's kind, offered as the other kind: true at f0 only. */
  swapped: boolean;
  /** For a length (line, stub): adding it gives the same Γ at f0 (and a narrower band); 0 otherwise. */
  period: number;
}

export interface Solution {
  /** One per unknown, in the order of the parts (nearest the load first). */
  values: SolvedValue[];
  /** How far Γ at the goal node is from the goal (goal.ts goalResidual), from network.ts's evaluation. */
  residual: number;
  /** |Γ| at the goal node. */
  gamma: number;
  /** Every value is of the kind the part has (or a free unknown's sign), so no value holds at f0 only. */
  realisable: boolean;
  /** Some value is swapped to the other kind: true at this frequency only. */
  atF0Only: boolean;
  /** How many unknowns differ from the circuit's current values. */
  changed: number;
  /** The total change: for each unknown the turn of its added quantity on the angle-mapped scale (atan), or of its length (2π per λ). */
  change: number;
}

export type SolveStatus =
  | 'solved'      // at least one solution
  | 'none'        // no solution (reason says why)
  | 'coincident'  // infinitely many: the two circles are one ("these two parts do the same job"), or every value keeps a circle goal
  | 'degenerate'  // the target is a part's fixed point (the open for a series part, the short for a shunt one)
  | 'family'      // two unknowns, a circle goal: a family (M4.1b fills it)
  | 'unsupported' // one unknown, a point target: the best value (M4.1b)
  | 'rejected';   // the question cannot be asked (reason says why)

export interface SolveResult {
  status: SolveStatus;
  /** A sentence for the page when there is no plain list of solutions; '' when solved. */
  reason: string;
  solutions: Solution[];
  /** The unknowns in the order used (nearest the load first). */
  unknowns: Unknown[];
  goalNode: number;
  /**
   * The node at which the two circles live and their generalised circles (geometry.ts, 4 numbers each) at 0 and 4:
   * two unknowns: A′ and B at node b; one unknown: a's locus and the goal carried back, at node a + 1. −1 when none.
   */
  circleNode: number;
  circles: Float64Array;
  /** Points of the circles that need a negative R or an imaginary Zt (dropped). */
  nonPassive: number;
  /** The two unknowns move the node along the same circle (coincident circles, or none because that circle misses the target). */
  sameJob: boolean;
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
const mA = new Float64Array(MOB_STRIDE);
const mAi = new Float64Array(MOB_STRIDE);
const mB = new Float64Array(MOB_STRIDE);
const mk = new Float64Array(MOB_STRIDE);
const locA = new Float64Array(LOCUS_STRIDE);
const locB = new Float64Array(LOCUS_STRIDE);
const locP = new Float64Array(LOCUS_STRIDE);

let Z0 = 50, F0 = 1e8, LR = 50, LX = 0, GNODE = 0;
let GOAL: Goal = { kind: 'point' };

interface Slot { part: number; kind: number; zc: number; free: boolean; line: boolean; half: boolean; t0: number }
const slots: Slot[] = [];

/** Γ at node n of the working circuit (network.ts's evaluation), into out[o]. */
function gammaAt(out: Vec, o: number, n: number): void {
  loadNode(node, 0, LR, LX, Z0);
  for (let k = 0, p = 0; k < n; k++, p += PART_STRIDE) applyPart(node, 0, packed[p], packed[p + 1], packed[p + 2], F0, F0, Z0);
  nodeGamma(out, o, node, 0);
}

/** The Möbius map of parts from…to − 1 of the working circuit (identity when none): node `from` → node `to`. */
function chain(m: Vec, from: number, to: number): void {
  m[0] = 1; m[1] = 0; m[2] = 0; m[3] = 0; m[4] = 0; m[5] = 0; m[6] = 1; m[7] = 0;
  for (let k = from, p = from * PART_STRIDE; k < to; k++, p += PART_STRIDE) {
    partMobius(mk, 0, packed[p], packed[p + 1], packed[p + 2], F0, F0, Z0);
    mobCompose(m, 0, mk, 0, m, 0);
  }
}

// A slot's coordinate: atan of the added quantity (the projective line as an angle: ±π/2 is ±∞), or a length.
const coordOf = (s: Slot, p: number): number => (s.line ? p : Math.atan(p));
const paramOf = (s: Slot, t: number): number => (s.line ? t : Math.abs(t) >= HALF_PI ? Infinity : Math.tan(t));

/**
 * Writes the part of slot s with parameter p (added quantity, or length) into the working circuit. Returns 0, 1 when
 * the value is swapped to the other kind, −1 when not passive (a negative R: written so it can be evaluated) and −2
 * when it cannot be written (an imaginary, zero or infinite Zt).
 */
function settle(s: Slot, p: number): number {
  const o = s.part * PART_STRIDE;
  let kind = s.kind, value: number, code = 0;
  switch (kind) {
    case LINE: value = p; break;
    case QUARTER:
      if (!(p > 0 && p < Infinity)) return -2;
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
  for (let step = 0; step < POLISH_STEPS && residual > POLISH_ABOVE; step++) {
    if (settleAll(t, codes) < -1) return residual;
    residualOf(F0v);
    const h0 = 1e-8 * Math.max(1, Math.abs(t[0]));
    t[0] += h0; if (settleAll(t, codes) < -1) { t[0] -= h0; return residual; }
    residualOf(F1v); t[0] -= h0;
    let d0: number, d1 = 0;
    if (n === 2 && point) {
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
    t[0] += d0; if (n === 2) t[1] += d1;
    const worst = settleAll(t, codes);
    const r = worst < -1 ? Infinity : residualOf(F0v);
    if (!(r < residual)) { t[0] -= d0; if (n === 2) t[1] -= d1; break; }
    residual = r;
  }
  settleAll(t, codes);
  return residual;
}

/** Evaluates the slots at parameters ps, polishes, and keeps the candidate if it reaches the goal. */
function consider(ps: readonly number[]): void {
  const t = ps.map((p, i) => coordOf(slots[i], p));
  // An R or Zt at the far end of its circle (the open or short) reads as a huge value of either sign: take +∞.
  for (let i = 0; i < t.length; i++) if (slots[i].half && t[i] < 1e-7 - HALF_PI) t[i] = HALF_PI;
  const codes: number[] = new Array(slots.length);
  const worst = settleAll(t, codes);
  if (worst < -1) return;
  let residual = residualOf(F0v);
  if (worst === 0 || worst === 1) {
    polish(t, codes, residual);
    // Lengths into [0, λ/2); the projective coordinate into (−π/2, π/2] (±π/2 is ±∞, the same point). Then the
    // candidate is judged as it will be returned.
    for (let i = 0; i < slots.length; i++) {
      if (slots[i].line) { t[i] -= LINE_PERIOD * Math.floor(t[i] / LINE_PERIOD); if (t[i] >= LINE_PERIOD) t[i] = 0; }
      else if (slots[i].half && Math.abs(t[i]) >= HALF_PI) t[i] = HALF_PI; // R or Zt past ∞: ∞, not a negative value
      else if (t[i] <= -HALF_PI) t[i] += Math.PI;
      else if (t[i] > HALF_PI) t[i] -= Math.PI;
    }
    if (settleAll(t, codes) < -1) return;
    residual = residualOf(F0v);
  }
  if (!(residual <= ACCEPT)) return;
  if (codes.some((c) => c < 0)) { nonPassive++; return; }
  for (const c of cands) {
    let same = true;
    for (let i = 0; i < t.length && same; i++) same = coordDistance(slots[i], c.t[i], t[i]) < 1e-9;
    if (same) { if (residual < c.residual) { c.t = t; c.codes = codes; c.residual = residual; } return; }
  }
  cands.push({ t, codes, residual });
}

/** The distance of two coordinates of a slot: on the projective line (period π) or of lengths (period λ/2, as 2π per λ). */
function coordDistance(s: Slot, a: number, b: number): number {
  if (s.line) { let d = Math.abs(a - b) % LINE_PERIOD; if (d > 0.5 * LINE_PERIOD) d = LINE_PERIOD - d; return TAU * d; }
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
    const s = slots[i], o = s.part * PART_STRIDE, kind = packed[o] as PartKind;
    const sw = c.codes[i] === 1;
    swapped ||= sw;
    const p = paramOf(s, c.t[i]);
    const d = coordDistance(s, c.t[i], s.t0);
    change += d;
    if (d > 1e-9 || kind !== s.kind) changed++;
    values.push({
      part: s.part, kind, value: packed[o + 1], zc: s.zc, added: p, swapped: sw,
      period: s.line || s.kind === STUB_OPEN || s.kind === STUB_SHORT ? LINE_PERIOD : 0,
    });
  }
  return { values, residual: c.residual, gamma: Math.hypot(gam[0], gam[1]), realisable: !swapped, atF0Only: swapped, changed, change };
}

function order(a: Solution, b: Solution): number {
  if (a.realisable !== b.realisable) return a.realisable ? -1 : 1;
  if (a.changed !== b.changed) return a.changed - b.changed;
  if (a.change !== b.change) return a.change - b.change;
  for (let i = 0; i < a.values.length; i++) {
    const x = a.values[i].added, y = b.values[i].added;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

// ---------------------------------------------------------------------------------------------------------------

function result(status: SolveStatus, reason: string, unknowns: Unknown[], circleNode = -1, circles: Float64Array = new Float64Array(8), sameJob = false): SolveResult {
  return { status, reason, solutions: [], unknowns, goalNode: GNODE, circleNode, circles, nonPassive: 0, sameJob };
}

/** Why the unknowns cannot be solved for in this circuit with this goal, or null. */
export function unknownsProblem(circuit: Circuit, unknowns: readonly Unknown[], goal: Goal): string | null {
  const count = circuit.parts.length;
  const gp = goalProblem(goal, count);
  if (gp) return gp;
  if (unknowns.length === 0) return 'mark a value to solve for';
  if (unknowns.length > 2) return 'at most two values can be solved for at a time';
  const g = goalNode(goal, count);
  for (let i = 0; i < unknowns.length; i++) {
    const u = unknowns[i], param = u.param ?? 'value';
    if (param === 'f0') return 'f0 as an unknown moves every point along a curve that is not a circle; its search comes later';
    if (!(Number.isInteger(u.part) && u.part >= 0 && u.part < count)) return `there is no part ${u.part + 1}`;
    const kind = circuit.parts[u.part].kind;
    if (param === 'zc') {
      return kind === LINE || kind === STUB_OPEN || kind === STUB_SHORT
        ? `${partName(circuit, u.part)}: Zc as an unknown moves the node along a curve that is not a circle; its search comes later`
        : `${partName(circuit, u.part)} has no Zc`;
    }
    if (u.free && !isReactive(kind)) return `${partName(circuit, u.part)} is not an L or C, so it cannot be a free reactance or susceptance`;
    if (u.part >= g) return `${partName(circuit, u.part)} is beyond the goal's node, so it cannot change it`;
    for (let j = 0; j < i; j++) if (unknowns[j].part === u.part && (unknowns[j].param ?? 'value') !== 'f0') return `${partName(circuit, u.part)} is marked twice`;
  }
  return null;
}

/**
 * Solves for one or two unknown part values so that the goal holds (solver.md). Two unknowns with a point target, or
 * one unknown with a circle goal; the other combinations return status 'unsupported' or 'family' (M4.1b). Pure: the
 * circuit is not changed. A few µs for a 10-part circuit.
 */
export function solve(circuit: Circuit, unknownsIn: readonly Unknown[], goal: Goal): SolveResult {
  const count = circuit.parts.length;
  Z0 = circuit.z0; F0 = circuit.f0; LR = circuit.loadR; LX = circuit.loadX; GOAL = goal;
  GNODE = goalNode(goal, count);
  const unknowns = unknownsIn.slice().sort((a, b) => a.part - b.part);
  const problem = unknownsProblem(circuit, unknowns, goal);
  if (problem) return result('rejected', problem, unknowns);
  const circle = isCircleGoal(goal);
  if (unknowns.length === 2 && circle) {
    return result('family', 'two unknowns and a circle goal leave a family of solutions: fix one of them, or choose a point target', unknowns);
  }
  if (unknowns.length === 1 && !circle) {
    return result('unsupported', 'one value alone reaches a point only by chance: free a second one, or choose a circle goal', unknowns);
  }

  if (packed.length < count * PART_STRIDE) packed = new Float64Array(count * PART_STRIDE);
  packParts(circuit.parts, packed);
  slots.length = 0;
  for (const u of unknowns) {
    const part = circuit.parts[u.part], kind = part.kind, zc = part.zc ?? 0, line = kind === LINE;
    const p0 = line ? part.value : kind === QUARTER ? (part.value / Z0) ** 2 : added(kind, part.value, zc, F0, F0, Z0);
    slots.push({ part: u.part, kind, zc, free: !!u.free, line, half: kind === SERIES_R || kind === SHUNT_R || kind === QUARTER, t0: line ? p0 - LINE_PERIOD * Math.floor(p0 / LINE_PERIOD) : Math.atan(p0) });
  }
  cands.length = 0; nonPassive = 0;
  goalTarget(tgt, 0, goal, Z0);
  const circles = new Float64Array(8);
  const out = unknowns.length === 2 ? twoUnknowns(circuit, unknowns, circles) : oneUnknown(circuit, unknowns, circles);
  if (out) return out;
  const solutions = cands.map(buildSolution).sort(order);
  const a = slots[0].part;
  const circleNode = unknowns.length === 2 ? slots[1].part : a + 1;
  let sameJob = false;
  if (solutions.length === 0 && unknowns.length === 2) {
    // Does b's family of circles contain A′? Then a and b move the node along one circle.
    projectOnCircle(q, 0, circles, 0, 0.1234567, -0.0456789);
    partLocus(locP, 0, slots[1].kind, slots[1].zc, q[0], q[1], Z0, F0, F0);
    sameJob = locP[L_MODE] !== LOCUS_FIXED && sameCircle(circles, 0, locP, L_A);
  }
  let reason = '';
  if (solutions.length === 0) {
    if (sameJob) reason = `${partName(circuit, a)} and ${partName(circuit, slots[1].part)} do the same job: together they move the node along one circle, which misses the target`;
    else if (nonPassive > 0) reason = 'the only solutions need a negative resistance';
    else reason = unknowns.length === 2
      ? 'the two circles do not cross: no values of these two parts reach the target'
      : 'the part\'s circle does not reach the goal circle: no value of this part meets the goal';
  }
  return {
    status: solutions.length > 0 ? 'solved' : 'none', reason, solutions, unknowns, goalNode: GNODE, circleNode, circles, nonPassive, sameJob,
  };
}

function oneUnknown(circuit: Circuit, unknowns: Unknown[], circles: Float64Array): SolveResult | null {
  const s = slots[0], a = s.part;
  gammaAt(gam, 0, a);
  partLocus(locA, 0, s.kind, s.zc, gam[0], gam[1], Z0, F0, F0);
  if (locA[L_MODE] === LOCUS_FIXED) {
    gammaAt(gam, 0, GNODE);
    const holds = goalResidual(GOAL, gam[0], gam[1], Z0) <= ACCEPT;
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
    const r = result('coincident', `${partName(circuit, a)} and ${partName(circuit, b)} do the same job: their circles are one, so any value of one has a value of the other`, unknowns, b, circles, true);
    return r;
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
