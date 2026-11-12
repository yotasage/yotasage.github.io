// Goals of the solver (docs/smith-chart/solver.md "Setting it up", engine.md §8): what must hold at the input, or at a
// chosen node for an intermediate step. A point target (a z in ohms, the centre by default) is two real conditions;
// a circle goal is one: |Γ| = m, VSWR = s or a return loss (circles about the centre), a constant r, g, x or b circle
// (r = 1 and g = 1 for the first step of a match, x = 0 for resonance). Each circle goal is a generalised circle in
// the Γ plane in geometry.ts's representation (A|w|² − 2(Dr·wr + Di·wi) + C = 0, largest coefficient 1), so the
// solver (solve.ts) intersects it with a part's locus. The circles of engine.md §1: r: (r/(1+r), 0), 1/(1+r);
// g: (−g/(1+g), 0), 1/(1+g); x: (1, 1/x), 1/|x|; b: (−1, −1/b), 1/|b|.
//
// An inequality goal (|Γ| ≤ m, VSWR ≤ s, return loss ≥ dB: `within`) is represented here; the solver of M4.1a gives
// the values on its boundary circle, and M4.1b turns them into the range of values that keeps it.

import { gammaFromImpedance, magFromReturnLoss, magFromVswr } from './convert';
import type { Vec } from './complex';
import { circleResidual, pointCircle } from './geometry';

export type GoalKind = 'point' | 'mag' | 'vswr' | 'rl' | 'r' | 'g' | 'x' | 'b';

/** Every goal kind, the point first. */
export const GOAL_KINDS: readonly GoalKind[] = ['point', 'mag', 'vswr', 'rl', 'r', 'g', 'x', 'b'];

export interface Goal {
  kind: GoalKind;
  /** The node the goal is at: 0 the load … parts.length the input (the default). */
  node?: number;
  /**
   * The circle's figure: |Γ| (mag, 0…1), VSWR (≥ 1, ∞ the rim), return loss in dB (≥ 0), or the normalised r, g
   * (≥ 0), x or b of the circle. Defaults: mag 0, vswr 1, rl ∞ (all three the centre), r 1, g 1, x 0, b 0.
   */
  value?: number;
  /** A point target in ohms; default Z0 + j0 (the centre). R = ∞ is the open. */
  targetR?: number;
  targetX?: number;
  /** mag and vswr: at most the value; rl: at least the value. Ranges are M4.1b. */
  within?: boolean;
}

const DEFAULT_VALUE: Readonly<Record<GoalKind, number>> = { point: 0, mag: 0, vswr: 1, rl: Infinity, r: 1, g: 1, x: 0, b: 0 };

export const isCircleGoal = (goal: Goal): boolean => goal.kind !== 'point';

/** The goal's figure with its default. */
export const goalValue = (goal: Goal): number => goal.value ?? DEFAULT_VALUE[goal.kind];

/** The node the goal is at, for a ladder of `count` parts. */
export const goalNode = (goal: Goal, count: number): number => goal.node ?? count;

/** |Γ| of a mag, vswr or rl goal; NaN for the other kinds. */
export function goalMag(goal: Goal): number {
  const v = goalValue(goal);
  switch (goal.kind) {
    case 'mag': return v;
    case 'vswr': return magFromVswr(v);
    case 'rl': return magFromReturnLoss(v);
    default: return NaN;
  }
}

/** Why the goal cannot be used with a ladder of `count` parts, or null. */
export function goalProblem(goal: Goal, count: number): string | null {
  if (!GOAL_KINDS.includes(goal.kind)) return `unknown goal kind "${goal.kind}"`;
  const node = goalNode(goal, count);
  if (!(Number.isInteger(node) && node >= 0 && node <= count)) return `the goal's node must be 0 (the load) to ${count} (the input)`;
  const v = goalValue(goal);
  switch (goal.kind) {
    case 'point': {
      const R = goal.targetR, X = goal.targetX;
      if (R !== undefined && !(R >= 0)) return 'the target resistance must be 0 or more';
      if (X !== undefined && !(Math.abs(X) < Infinity)) return 'the target reactance must be finite';
      return null;
    }
    case 'mag': return v >= 0 && v <= 1 ? null : '|Γ| must be from 0 to 1';
    case 'vswr': return v >= 1 ? null : 'the VSWR must be 1 or more';
    case 'rl': return v >= 0 ? null : 'the return loss must be 0 dB or more';
    case 'r': case 'g': return v >= 0 ? null : `${goal.kind} must be 0 or more`;
    default: return Math.abs(v) < Infinity ? null : `${goal.kind} must be finite`;
  }
}

/** Γ of a point target into out[o], out[o + 1] (the centre for a circle goal). */
export function goalTarget(out: Vec, o: number, goal: Goal, z0: number): void {
  if (goal.kind !== 'point') { out[o] = 0; out[o + 1] = 0; return; }
  const R = goal.targetR ?? z0, X = goal.targetX ?? 0;
  if (R === Infinity) { out[o] = 1; out[o + 1] = 0; return; }
  gammaFromImpedance(out, o, R, X, z0);
}

/** The goal's circle into out[o…o+3]; false (and nothing written) for a point target. */
export function goalCircle(out: Vec, o: number, goal: Goal): boolean {
  const v = goalValue(goal);
  switch (goal.kind) {
    case 'point': return false;
    case 'mag': case 'vswr': case 'rl': {
      const m = goalMag(goal);
      if (m === 0) { pointCircle(out, o, 0, 0); return true; }
      out[o] = 1; out[o + 1] = 0; out[o + 2] = 0; out[o + 3] = -m * m;
      return true;
    }
    // (1 + r)|w|² − 2r·wr + (r − 1) = 0, and so on; ∞ is the open or short point.
    case 'r':
      if (v === Infinity) pointCircle(out, o, 1, 0);
      else set(out, o, 1 + v, v, 0, v - 1);
      return true;
    case 'g':
      if (v === Infinity) pointCircle(out, o, -1, 0);
      else set(out, o, 1 + v, -v, 0, v - 1);
      return true;
    case 'x': set(out, o, v, v, 1, v); return true;
    case 'b': set(out, o, v, -v, -1, v); return true;
  }
  return false;
}

function set(out: Vec, o: number, A: number, Dr: number, Di: number, C: number): void {
  const s = 1 / Math.max(Math.abs(A), Math.abs(Dr), Math.abs(Di), Math.abs(C));
  out[o] = A * s; out[o + 1] = Dr * s; out[o + 2] = Di * s; out[o + 3] = C * s;
}

const circ = new Float64Array(4);
const tg = new Float64Array(2);

/**
 * How far Γ at the goal node is from the goal, in Γ: |Γ − Γt| for a point target, ||Γ| − m| for the circles about the
 * centre, the distance to the circle (to first order) for r, g, x and b. 0 when the goal holds; for an inequality
 * goal, its boundary.
 */
export function goalResidual(goal: Goal, gr: number, gi: number, z0: number): number {
  if (goal.kind === 'point') {
    goalTarget(tg, 0, goal, z0);
    return Math.hypot(gr - tg[0], gi - tg[1]);
  }
  const m = goalMag(goal);
  if (m === m) return Math.abs(Math.hypot(gr, gi) - m);
  goalCircle(circ, 0, goal);
  return Math.abs(circleResidual(circ, 0, gr, gi));
}

/** The signed form of goalResidual for a circle goal (negative inside the circle about the centre, sign of the circle's form otherwise). */
export function goalSigned(goal: Goal, gr: number, gi: number): number {
  const m = goalMag(goal);
  if (m === m) return Math.hypot(gr, gi) - m;
  goalCircle(circ, 0, goal);
  return circleResidual(circ, 0, gr, gi);
}
