// "Explain this move" (step M5.4, docs/smith-chart/learning.md §3): what a part does to the point, as data the page
// turns into sentences. For a part of a circuit: the rule of its kind (theory.md §4 "Moving on the chart", claims
// ⟨46⟩–⟨77⟩), the circle it moves on with centre and radius from the circle's equation and the value it keeps, the
// sense of travel and why, the nodes it starts and ends at (z, y, Γ, |Γ|), the registry's equation ids and the
// derivation and theory topic to link. For a change of its value (a drag, a typed value): the same for the old and
// the new value, the sense and amount of the change and the change in |Γ|. Every number comes from the engine
// (network.evaluateCircuit, parts.added); the sense comes from the rules of the theory, and the harness
// (scripts/harness/smith/check-explain.mjs) holds both the sense and the circle against geometry.ts.

import { cabs } from './complex';
import { LOCUS_STRIDE, locusPoint, partLocus } from './geometry';
import { METRIC_STRIDE, M_GI, M_GR, M_YI, M_YR, M_ZI, M_ZR, evaluateCircuit } from './network';
import type { Circuit } from './network';
import {
  LINE, QUARTER, SERIES_C, SERIES_L, SERIES_R, SHUNT_C, SHUNT_L, SHUNT_R, STUB_OPEN, STUB_SHORT, added, noEffect, valueFor,
} from './parts';

/** Senses of travel on the chart (the chart's own view: Γi up). STRAIGHT: along a straight piece (the real axis). */
export const CW = 1;
export const CCW = -1;
export const STRAIGHT = 0;
export type Sense = -1 | 0 | 1;

/** The rule a part follows (theory.md §4). */
export type Rule = 'series-reactance' | 'series-resistor' | 'shunt-susceptance' | 'shunt-resistor' | 'line' | 'quarter';

/**
 * The circle a part's point moves on: an r or g circle, an x or b arc (radius Infinity: the real axis, for x = 0 or
 * b = 0), a circle about the centre (a line of Z0: 'rotation') or the circle of a line of another impedance ('line',
 * centre on the real axis; also a λ/4 transformer's line of Zt). `value` is the r, g, x or b kept, or the line's B.
 */
export interface Circle { kind: 'r' | 'g' | 'x' | 'b' | 'rotation' | 'line'; value: number; cx: number; cy: number; radius: number }

/** A node as the explanation states it. */
export interface Point { gr: number; gi: number; zr: number; zi: number; yr: number; yi: number; mag: number }

export interface Explanation {
  /** The part (index from the load) and its kind. */
  i: number;
  kind: number;
  rule: Rule;
  /** The part's value and the value at which it has no effect (parts.noEffect at f0; NaN for λ/4). */
  value: number;
  none: number;
  /** What the part adds at f0 (parts.added: r, x, g, b, turns of length or Zt/Z0). */
  added: number;
  /** The coordinate kept ('r', 'x', 'g', 'b'; '' for lines) and its value at the start node. */
  keeps: 'r' | 'x' | 'g' | 'b' | '';
  kept: number;
  /** The coordinate that changes ('x', 'r', 'b', 'g'; '' for lines) at the start and end nodes. */
  changes: 'x' | 'r' | 'b' | 'g' | '';
  from: number;
  to: number;
  /** The circle, or null when the point cannot move here (an open before a series part, a short before a shunt one). */
  circle: Circle | null;
  /** The sense from no effect to the value; for lines and λ/4 the full turns of their own chart (2 × length in λ). */
  sense: Sense;
  turns: number;
  /** Resistors: the pole they move towards (+1: the open, Γ = +1; −1: the short, Γ = −1), else 0. */
  pole: number;
  /** The point does not move (no effect, or a start that the part cannot move). */
  still: boolean;
  start: Point;
  end: Point;
  /** |Γ| at the end minus |Γ| at the start. */
  dMag: number;
  /** Registry ids, in the order the page shows them (all in equations.ts EQUATION_BY_ID). */
  equations: readonly string[];
  /** The registry entry with steps the page links ("derive"). */
  derivation: string;
  /** The theory topic (an anchor of Theory.tsx). */
  topic: string;
  /** The claims of theory.md §4 the narration makes (claims.md numbers). */
  claims: readonly number[];
  /** The line's B and Γ against Zc at the start (lines and λ/4 only, else 0). */
  lineB: number;
  gcr: number;
  gci: number;
}

export interface MoveExplanation {
  before: Explanation;
  after: Explanation;
  oldValue: number;
  newValue: number;
  /** The change in what the part adds (x, b, r, g; lines and stubs: their length in λ; λ/4: Zt/Z0). */
  delta: number;
  /** The sense of the change; STRAIGHT along a straight piece; for a line or stub also `turns`, the chart's turns. */
  sense: Sense;
  turns: number;
  /** Resistors: +1 towards their pole, −1 away from it; else 0. */
  approach: number;
  /** The claims the sense rests on. */
  claims: readonly number[];
  /** |Γ| after minus |Γ| before (at the part's end). */
  dMag: number;
}

const RULES: readonly Rule[] = [
  'series-resistor', 'series-reactance', 'series-reactance', 'shunt-resistor', 'shunt-susceptance', 'shunt-susceptance',
  'line', 'shunt-susceptance', 'shunt-susceptance', 'quarter',
];

const OWN: readonly (readonly string[])[] = [
  ['r-series'], ['x-series-l'], ['x-series-c'], ['g-shunt'], ['b-shunt-l'], ['b-shunt-c'], ['line-theta', 'line-zin'],
  ['stub-open-b'], ['stub-short-b'], ['quarter-wave'],
];

/** The claims of theory.md §4 each rule's narration makes: the rule, the circle, the sense, why a circle, the arc's start. */
const CLAIMS: Readonly<Record<Rule, readonly number[]>> = {
  'series-reactance': [46, 47, 48, 55, 56, 58, 63, 64, 65, 66, 73, 74, 75],
  'series-resistor': [46, 49, 67, 68, 69, 70, 73, 74, 75],
  'shunt-susceptance': [50, 51, 52, 54, 57, 58, 62, 67, 68, 69, 70, 73, 74, 75],
  'shunt-resistor': [50, 53, 67, 68, 69, 70, 73, 74, 75],
  line: [61, 70, 71, 72, 73, 74, 75],
  quarter: [61, 70, 71, 72, 75],
};

const metrics = (m: Float64Array, k: number): Point => {
  const o = k * METRIC_STRIDE, gr = m[o + M_GR], gi = m[o + M_GI];
  return { gr, gi, zr: m[o + M_ZR], zi: m[o + M_ZI], yr: m[o + M_YR], yi: m[o + M_YI], mag: cabs(gr, gi) };
};

/** The circle of a line of impedance zn·Z0 through Γs (line-circle-b, -centre, -radius; line-rotation for zn = 1). */
function lineCircle(zn: number, sr: number, si: number, out: Explanation): Circle | null {
  if (!(zn > 0 && zn < Infinity)) return null;
  const B = (zn - 1) / (zn + 1);
  // Γ against the line's own impedance: Γc = (Γs − B)/(1 − B·Γs).
  const nr = sr - B, ni = si, dr = 1 - B * sr, di = -B * si, dd = dr * dr + di * di;
  const cr = (nr * dr + ni * di) / dd, ci = (ni * dr - nr * di) / dd, rho = Math.hypot(cr, ci);
  out.lineB = B; out.gcr = cr; out.gci = ci;
  if (rho === 0) return null;
  if (B === 0) return { kind: 'rotation', value: 0, cx: 0, cy: 0, radius: rho };
  // line-circle-centre, (B − 1/B)/(1 − |BΓc|²) + 1/B, written without the cancellation of its two terms.
  const den = 1 - B * B * rho * rho;
  return { kind: 'line', value: B, cx: (B * (1 - rho * rho)) / den, cy: 0, radius: ((1 - B * B) * rho) / den };
}

/** The explanation of part i of a circuit: its arc from no effect to its value, at f0. */
export function explainPart(c: Circuit, i: number, m: Float64Array = evaluateCircuit(c).metrics): Explanation {
  const p = c.parts[i], kind = p.kind, z0 = c.z0, f0 = c.f0;
  const zc = kind === QUARTER ? p.value : p.zc ?? z0;
  const rule = RULES[kind];
  const start = metrics(m, i), end = metrics(m, i + 1);
  const ad = added(kind, p.value, zc, f0, f0, z0);
  const e: Explanation = {
    i, kind, rule, value: p.value, none: noEffect(kind, f0, f0), added: ad, keeps: '', kept: NaN, changes: '', from: NaN, to: NaN,
    circle: null, sense: STRAIGHT, turns: 0, pole: 0, still: false, start, end, dMag: end.mag - start.mag,
    equations: [], derivation: '', topic: 'moving-on-the-chart', claims: CLAIMS[rule], lineB: 0, gcr: 0, gci: 0,
  };
  const ids = [...OWN[kind]];
  switch (rule) {
    case 'series-reactance': {
      const r = start.zr;
      e.keeps = 'r'; e.kept = r; e.changes = 'x'; e.from = start.zi; e.to = end.zi;
      if (r >= 0 && r < Infinity) e.circle = { kind: 'r', value: r, cx: r / (1 + r), cy: 0, radius: 1 / (1 + r) };
      e.sense = ad > 0 ? CW : CCW;
      ids.push('series-adds-z', 'circle-r');
      e.derivation = 'series-adds-z';
      break;
    }
    case 'series-resistor': {
      const x = start.zi;
      e.keeps = 'x'; e.kept = x; e.changes = 'r'; e.from = start.zr; e.to = end.zr;
      if (Math.abs(x) < Infinity) e.circle = x === 0 ? { kind: 'x', value: 0, cx: 0, cy: 0, radius: Infinity } : { kind: 'x', value: x, cx: 1, cy: 1 / x, radius: 1 / Math.abs(x) };
      // Towards Γ = +1 on the x arc, whose centre (1, 1/x) lies above the axis for x > 0: there the way to +1 is
      // counter-clockwise, below it clockwise.
      e.sense = x > 0 ? CCW : x < 0 ? CW : STRAIGHT;
      e.pole = 1;
      ids.push('series-adds-z', 'circle-x');
      e.derivation = 'series-adds-z';
      break;
    }
    case 'shunt-susceptance': {
      const g = start.yr;
      e.keeps = 'g'; e.kept = g; e.changes = 'b'; e.from = start.yi; e.to = end.yi;
      if (g >= 0 && g < Infinity) e.circle = { kind: 'g', value: g, cx: -g / (1 + g), cy: 0, radius: 1 / (1 + g) };
      // A stub at b = ±∞ (a short) is reached the same way as +∞ (geometry.partArc).
      e.sense = ad > 0 || ad === -Infinity ? CW : CCW;
      ids.push('shunt-adds-y', 'circle-g');
      e.derivation = 'shunt-adds-y';
      if (kind === STUB_OPEN || kind === STUB_SHORT) e.topic = 'transmission-lines';
      break;
    }
    case 'shunt-resistor': {
      const b = start.yi;
      e.keeps = 'b'; e.kept = b; e.changes = 'g'; e.from = start.yr; e.to = end.yr;
      if (Math.abs(b) < Infinity) e.circle = b === 0 ? { kind: 'b', value: 0, cx: 0, cy: 0, radius: Infinity } : { kind: 'b', value: b, cx: -1, cy: -1 / b, radius: 1 / Math.abs(b) };
      // Towards Γ = −1 on the b arc, centre (−1, −1/b): below the axis for b > 0, where that way is counter-clockwise.
      e.sense = b > 0 ? CCW : b < 0 ? CW : STRAIGHT;
      e.pole = -1;
      ids.push('shunt-adds-y', 'circle-b');
      e.derivation = 'shunt-adds-y';
      break;
    }
    case 'line': case 'quarter': {
      e.circle = lineCircle(zc / z0, start.gr, start.gi, e);
      e.sense = CW;
      e.turns = kind === QUARTER ? 0.5 : 2 * p.value;
      e.topic = 'transmission-lines';
      if (e.circle?.kind === 'rotation') ids.push('line-rotation');
      else ids.push('line-circle-b', 'line-circle-centre', 'line-circle-radius');
      e.derivation = kind === QUARTER ? 'quarter-wave' : e.circle?.kind === 'rotation' ? 'line-rotation' : 'line-zin';
      break;
    }
  }
  ids.push('gamma-z');
  e.equations = ids;
  e.still = start.gr === end.gr && start.gi === end.gi;
  if (e.still || !e.circle) { e.still = true; e.sense = STRAIGHT; }
  if (e.circle && (e.circle.kind === 'x' || e.circle.kind === 'b') && e.circle.radius === Infinity) e.sense = STRAIGHT;
  return e;
}

/** A copy of the circuit with part i at another value. */
export const withValue = (c: Circuit, i: number, value: number): Circuit => ({
  ...c, parts: c.parts.map((p, j) => (j === i ? { ...p, value } : p)),
});

const tmp = new Float64Array(2);

// The sense of travel through three points on a circle: the sign of the triangle's area (> 0: counter-clockwise).
function orient(ax: number, ay: number, bx: number, by: number, cx: number, cy: number): Sense {
  const a = (bx - ax) * (cy - by) - (by - ay) * (cx - bx);
  return a > 0 ? CCW : a < 0 ? CW : STRAIGHT;
}

/**
 * The change of part i of `c` from `oldValue` to its value in `c`: the sense from the rules of theory.md §4 (a larger L
 * or C, or a longer line or stub, turns its point clockwise ⟨61⟩ ⟨77⟩; a resistor moves towards its pole as its r or g
 * grows ⟨49⟩ ⟨53⟩), for a λ/4's Zt from three points of its locus.
 */
export function explainMove(c: Circuit, i: number, oldValue: number): MoveExplanation {
  const after = explainPart(c, i), before = explainPart(withValue(c, i, oldValue), i);
  const kind = after.kind, nv = after.value, ov = oldValue;
  let delta = after.added - before.added, sense: Sense = STRAIGHT, turns = 0, approach = 0;
  let claims: readonly number[] = [];
  const grow = nv > ov ? 1 : nv < ov ? -1 : 0;
  switch (kind) {
    case SERIES_L: case SERIES_C: case SHUNT_L: case SHUNT_C:
      sense = grow as Sense; claims = [77]; break;
    case LINE: case STUB_OPEN: case STUB_SHORT:
      delta = nv - ov; sense = grow as Sense; turns = 2 * delta; claims = kind === LINE ? [61] : [54, 57]; break;
    case SERIES_R: case SHUNT_R: {
      // r (series) or g (shunt) grows: towards the pole, in the sense of the arc from no effect.
      const g = kind === SERIES_R ? grow : -grow;
      approach = g; sense = (g * after.sense) as Sense; claims = kind === SERIES_R ? [49] : [53];
      break;
    }
    case QUARTER: {
      const z0 = c.z0, f0 = c.f0, loc = new Float64Array(LOCUS_STRIDE), s = after.start;
      partLocus(loc, 0, QUARTER, 0, s.gr, s.gi, z0, f0, f0);
      locusPoint(tmp, 0, loc, 0, Math.sqrt(ov * nv));
      sense = grow === 0 ? STRAIGHT : orient(before.end.gr, before.end.gi, tmp[0], tmp[1], after.end.gr, after.end.gi);
      break;
    }
  }
  if (after.still && before.still) sense = STRAIGHT;
  if (before.end.gr === after.end.gr && before.end.gi === after.end.gi) sense = STRAIGHT;
  if (after.circle && after.circle.radius === Infinity) sense = STRAIGHT;
  return { before, after, oldValue: ov, newValue: nv, delta, sense, turns, approach, claims, dMag: after.end.mag - before.end.mag };
}

/** The value of part i at fraction t ∈ [0, 1] of the way from v0 to v1 (for the trace of a move). */
function valueAt(kind: number, v0: number, v1: number, t: number, c: Circuit, zc: number): number {
  if (kind === LINE || kind === STUB_OPEN || kind === STUB_SHORT) return v0 + (v1 - v0) * t;
  if (v0 > 0 && v0 < Infinity && v1 > 0 && v1 < Infinity) return v0 * (v1 / v0) ** t;
  // An end at 0 or ∞ (no effect): along what the part adds, which is finite there.
  const z0 = c.z0, f0 = c.f0, a0 = added(kind, v0, zc, f0, f0, z0), a1 = added(kind, v1, zc, f0, f0, z0);
  if (!(Math.abs(a0) < Infinity && Math.abs(a1) < Infinity)) return t < 0.5 ? v0 : v1;
  if (t === 0) return v0;
  if (t === 1) return v1;
  return valueFor(kind, a0 + (a1 - a0) * t, zc, f0, f0, z0);
}

/**
 * Γ along part i's change from v0 to v1 (n + 1 points, interleaved), from the node before it: the path a marker
 * traces. A λ/4's arc from no effect is its line of Zt from length 0 (as geometry.partArc draws it).
 */
export function movePath(c: Circuit, i: number, v0: number, v1: number, n = 48): Float64Array {
  const p = c.parts[i], kind = p.kind, z0 = c.z0, f0 = c.f0, out = new Float64Array(2 * (n + 1));
  const m = evaluateCircuit(c).metrics, o = i * METRIC_STRIDE, sr = m[o + M_GR], si = m[o + M_GI];
  const loc = new Float64Array(LOCUS_STRIDE);
  const zc = kind === QUARTER ? p.value : p.zc ?? z0;
  if (kind === QUARTER && v0 !== v0) {
    // From no effect: a line of Zt from 0 to λ/4.
    partLocus(loc, 0, LINE, p.value, sr, si, z0, f0, f0);
    for (let j = 0; j <= n; j++) { locusPoint(out, 2 * j, loc, 0, (0.25 * j) / n); }
    return out;
  }
  partLocus(loc, 0, kind, zc, sr, si, z0, f0, f0);
  for (let j = 0; j <= n; j++) locusPoint(out, 2 * j, loc, 0, valueAt(kind, v0, v1, j / n, c, zc));
  return out;
}
