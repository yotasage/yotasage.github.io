// Suggestions (step M4.4a; solver.md "When nothing is marked"): with nothing marked and a goal, which single change of
// one part reaches it, and which change of two parts. Framework-free; runs in the solver's worker (solveJob.ts).
//
// - Singles: every part before the goal's node, its value as the one unknown (a line's or stub's length, a λ/4's Zt,
//   R, L or C, never "free": a value of the other sign is offered as the other kind, swapped, true at f0 only). A
//   circle goal: the crossing nearest the current value (an inequality goal: the nearest edge of a range that keeps
//   it, with the ranges); a point target: one unknown reaches it only by chance, so the best value and the mismatch it
//   reaches.
// - Pairs (point targets only): every two such parts, the exact solutions that change both. Every pair takes the
//   geometric path (values only, never a line's Zc or f0: no grid search), a few µs each. A circle goal with two parts
//   is a family (no single answer to rank); not offered (BL59).
//
// Ranking (deterministic): meets the goal first; then realisable (no swapped kind); then fewer parts changed; then, for
// those that do not meet it, the smaller mismatch; then the smaller change; then the parts and the values. The change
// is the solver's `Solution.change`: per changed unknown the distance of its coordinates, atan of the normalised
// added quantity (r, x, g, b, (Zt/Z0)²; period π, so 0 → ∞ is π/2 whatever the scale) or 2π per wavelength of a
// length (period λ/2). It treats a factor of two in a value alike at every scale near Z0 and keeps 0 and ∞ finite.

import { ACCEPT, solve } from './solve';
import type { Solution, SolveResult, Unknown, ValueRange } from './solve';
import { goalNode, goalProblem, goalResidual, goalSigned, isWithin } from './goal';
import type { Goal } from './goal';
import { NODE_STRIDE, evaluate, nodeGamma } from './network';
import type { Circuit } from './network';
import { packParts } from './parts';
import { defaultChoice, standardVariants } from './values';
import type { ValueChoice, Variant } from './values';

export interface Suggestion {
  /** The unknowns changed (one or two, nearest the load first), as `solve` was asked. */
  unknowns: Unknown[];
  /** The solver's solution: values, residual, mismatch, |Γ|, realisable, swapped kinds, changed, change. */
  solution: Solution;
  /** The goal holds with the solution's values (residual ≤ ACCEPT, or an inequality goal kept). */
  meets: boolean;
  /** The solution on its value lists' neighbours (values.ts), the nearest to the goal first. */
  variants: Variant[];
  /** An inequality goal with one unknown: every range of its values that keeps the goal; else empty. */
  ranges: ValueRange[];
  /** The solver's circles for the chart (as SolveResult), and the node they live at (−1 for none). */
  circleNode: number;
  circles: Float64Array;
}

export interface SuggestOptions {
  /** At most this many suggestions (default MAX_SUGGESTIONS). */
  max?: number;
  /** The value lists for the variants (default values.ts defaultChoice). */
  lists?: ValueChoice;
  /** Leave out the pairs (default false). */
  singlesOnly?: boolean;
}

export interface Suggestions {
  /** 'holds': the goal already holds; 'some': suggestions; 'none': no part can change it; 'rejected': a bad goal. */
  status: 'holds' | 'some' | 'none' | 'rejected';
  reason: string;
  list: Suggestion[];
  /** How many single and pair solves were run (for the timings). */
  singles: number;
  pairs: number;
}

export const MAX_SUGGESTIONS = 8;

const nodes = new Float64Array(64 * NODE_STRIDE);
const gv = new Float64Array(2);

/** Whether the goal holds for the circuit as it is (network.ts's evaluation). */
export function goalHolds(circuit: Circuit, goal: Goal): boolean {
  const n = circuit.parts.length;
  const buf = (n + 1) * NODE_STRIDE <= nodes.length ? nodes : new Float64Array((n + 1) * NODE_STRIDE);
  evaluate(buf, packParts(circuit.parts), n, circuit.loadR, circuit.loadX, circuit.z0, circuit.f0, circuit.f0);
  nodeGamma(gv, 0, buf, goalNode(goal, n) * NODE_STRIDE);
  const gr = gv[0], gi = gv[1];
  if (!(Math.abs(gr) < Infinity && Math.abs(gi) < Infinity)) return false;
  return isWithin(goal) ? goalSigned(goal, gr, gi) <= 0 : goalResidual(goal, gr, gi, circuit.z0) <= ACCEPT;
}

/** The ranking (see the head of this file). */
export function rankSuggestions(a: Suggestion, b: Suggestion): number {
  if (a.meets !== b.meets) return a.meets ? -1 : 1;
  const sa = a.solution, sb = b.solution;
  if (sa.realisable !== sb.realisable) return sa.realisable ? -1 : 1;
  if (sa.changed !== sb.changed) return sa.changed - sb.changed;
  if (!a.meets && sa.mismatch !== sb.mismatch) return sa.mismatch - sb.mismatch;
  if (sa.change !== sb.change) return sa.change - sb.change;
  for (let i = 0; i < Math.min(a.unknowns.length, b.unknowns.length); i++) {
    if (a.unknowns[i].part !== b.unknowns[i].part) return a.unknowns[i].part - b.unknowns[i].part;
  }
  if (a.unknowns.length !== b.unknowns.length) return a.unknowns.length - b.unknowns.length;
  for (let i = 0; i < sa.values.length; i++) {
    const x = sa.values[i].added, y = sb.values[i].added;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

function make(r: SolveResult, s: Solution, meets: boolean, ranges: ValueRange[]): Suggestion {
  return { unknowns: r.unknowns, solution: s, meets, variants: [], ranges, circleNode: r.circleNode, circles: r.circles };
}

/**
 * The suggestions for a circuit and a goal: single changes, then pairs (point targets), ranked, at most `max`, each
 * with its standard-value variants. Pure. About 0.1 ms for the start circuit, 1 ms for ten parts (notes-M4.4a.md).
 */
export function suggest(circuit: Circuit, goal: Goal, options: SuggestOptions = {}): Suggestions {
  const count = circuit.parts.length;
  const problem = goalProblem(goal, count);
  if (problem) return { status: 'rejected', reason: problem, list: [], singles: 0, pairs: 0 };
  if (goalHolds(circuit, goal)) return { status: 'holds', reason: 'the goal already holds', list: [], singles: 0, pairs: 0 };
  const g = goalNode(goal, count);
  const point = goal.kind === 'point', within = isWithin(goal);
  const all: Suggestion[] = [];
  let singles = 0, pairs = 0;
  for (let k = 0; k < g; k++) {
    const r = solve(circuit, [{ part: k }], goal);
    singles++;
    if (r.status !== 'solved' && r.status !== 'best' && r.status !== 'range') continue;
    let pick: Suggestion | null = null;
    for (const s of r.solutions) {
      if (s.changed === 0) continue;
      const c = make(r, s, r.status !== 'best' && (s.residual <= ACCEPT || (within && r.status === 'range')), r.status === 'range' ? r.ranges : []);
      if (!pick || rankSuggestions(c, pick) < 0) pick = c;
    }
    if (pick) all.push(pick);
  }
  if (point && !options.singlesOnly) {
    for (let a = 0; a < g; a++) {
      for (let b = a + 1; b < g; b++) {
        const r = solve(circuit, [{ part: a }, { part: b }], goal);
        pairs++;
        if (r.status !== 'solved') continue;
        for (const s of r.solutions) if (s.changed === 2 && s.residual <= ACCEPT) all.push(make(r, s, true, []));
      }
    }
  }
  all.sort(rankSuggestions);
  const list = all.slice(0, Math.max(0, options.max ?? MAX_SUGGESTIONS));
  const lists = options.lists ?? defaultChoice();
  for (const s of list) s.variants = standardVariants(circuit, goal, s.solution, lists);
  return {
    status: list.length ? 'some' : 'none',
    reason: list.length ? '' : g === 0 ? 'no part lies before the goal’s node' : point ? 'no part can move the node at the goal' : 'no change of one part reaches the goal',
    list, singles, pairs,
  };
}
