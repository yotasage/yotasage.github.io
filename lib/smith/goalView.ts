// The goal and the solver's circles as the chart draws them (step M4.3b, solver.md "On the chart"): framework-free.
// The ring the chart draws for a goal: a point target's "close enough" circle (mismatch ≤ GOAL_MAG about it, a circle
// in Γ: for the centre the VSWR 1.5 circle of M3) or the goal's own circle; where the mark goes (a point target, the
// centre of an inequality goal, none for an r, g, x or b circle); how far a node is from the goal and whether it holds
// (the node table's goal line). `diskArc` cuts any generalised circle (geometry.ts's form) to its part inside the unit
// disk as one arc in geometry.ts's arc layout, which pathLayer.ts's `arcPath` draws as exact SVG arcs.

import { magFromVswr } from './convert';
import { ARC_CX, ARC_CY, ARC_EX, ARC_EY, ARC_MX, ARC_MY, ARC_R, ARC_SWEEP, ARC_SX, ARC_SY, ARC_TURNS } from './geometry';
import {
  goalCircle, goalMag, goalMismatch, goalNode, goalResidual, goalTarget, isWithin, pointGoal, RIM,
} from './goal';
import type { Goal } from './goal';
import { NODE_STRIDE, evaluate, nodeGamma } from './network';
import type { Circuit } from './network';
import { packParts } from './parts';

type Vec = Float64Array | number[];

/** A point target is "close enough" within this VSWR (engine.md §8; M3's fixed goal, now about any point target). */
export const GOAL_VSWR = 1.5;
export const GOAL_MAG = magFromVswr(GOAL_VSWR);
/** An exact circle goal counts as held within this residual (in Γ) in the node table's line. */
export const ON_GOAL = 1e-6;

/** The goal as a point target: a point, or a circle goal that is one point (pointGoal); else null. */
export const goalPoint = (goal: Goal): Goal | null => (goal.kind === 'point' ? goal : pointGoal(goal));

/**
 * The circle {Γ : |Γ − t|/|1 − t*·Γ| = m} about a point target t into out[o…o+3] (geometry.ts's form): centre
 * t(1 − m²)/(1 − m²|t|²), radius m(1 − |t|²)/(1 − m²|t|²); a target on the rim (goal.ts RIM) takes |Γ − t| = m.
 */
export function mismatchCircle(out: Vec, o: number, tr: number, ti: number, m: number): void {
  const t2 = tr * tr + ti * ti;
  let cr = tr, ci = ti, r = m;
  if (Math.sqrt(t2) < RIM) {
    const den = 1 - m * m * t2, s = (1 - m * m) / den;
    cr = tr * s; ci = ti * s; r = (m * (1 - t2)) / den;
  }
  out[o] = 1; out[o + 1] = cr; out[o + 2] = ci; out[o + 3] = cr * cr + ci * ci - r * r;
}

/** The ring of a goal into out[o…o+3]: a point target's close-enough circle, else the goal's circle. */
export function goalRing(out: Vec, o: number, goal: Goal, z0: number): void {
  const p = goalPoint(goal);
  if (p) {
    goalTarget(out, o, p, z0);
    mismatchCircle(out, o, out[o], out[o + 1], GOAL_MAG);
  } else goalCircle(out, o, goal);
}

/**
 * Where the goal's mark goes, into out[0], out[1]: the target of a point (or of a circle goal that is one point), the
 * centre of an inequality goal; true then. Otherwise false, with the goal's circle in out[2…5] (the line from the
 * goal's node goes to its nearest point).
 */
export function goalMark(out: Vec, goal: Goal, z0: number): boolean {
  const p = goalPoint(goal);
  if (p) { goalTarget(out, 0, p, z0); return true; }
  goalCircle(out, 2, goal);
  if (isWithin(goal)) { out[0] = 0; out[1] = 0; return true; }
  out[0] = NaN; out[1] = NaN;
  return false;
}

/** How a node stands to the goal: the distance shown and whether the goal holds there. */
export interface Standing {
  /** A point target: goal.ts goalMismatch; an inequality goal: |Γ|; an exact circle: goal.ts goalResidual. */
  distance: number;
  met: boolean;
  /** 'point', 'within' or 'circle': which of the three the distance is. */
  mode: 'point' | 'within' | 'circle';
}

export function goalStanding(goal: Goal, gr: number, gi: number, z0: number): Standing {
  const p = goalPoint(goal);
  if (p) {
    const d = goalMismatch(p, gr, gi, z0);
    return { distance: d, met: d <= GOAL_MAG, mode: 'point' };
  }
  if (isWithin(goal)) {
    const d = Math.hypot(gr, gi);
    return { distance: d, met: d <= goalMag(goal) * (1 + 1e-12), mode: 'within' };
  }
  const d = goalResidual(goal, gr, gi, z0);
  return { distance: d, met: d <= ON_GOAL, mode: 'circle' };
}

let nodes = new Float64Array(16 * NODE_STRIDE);
let parts: Float64Array = new Float64Array(0);

/** Γ at the goal's node of circuit c (at f0) into out[o], out[o + 1]; returns the node. */
export function goalGamma(out: Vec, o: number, c: Circuit, goal: Goal): number {
  const n = c.parts.length, k = Math.min(goalNode(goal, n), n);
  if (nodes.length < (n + 1) * NODE_STRIDE) nodes = new Float64Array((n + 1) * NODE_STRIDE);
  parts = packParts(c.parts, parts);
  evaluate(nodes, parts, n, c.loadR, c.loadX, c.z0, c.f0, c.f0);
  nodeGamma(out, o, nodes, k * NODE_STRIDE);
  return k;
}

/**
 * The part of the generalised circle circ[co…co+3] inside the unit disk (|Γ| ≤ 1), as one arc of geometry.ts's layout
 * in arcs[a…]: a full turn when the circle lies inside, the chord of a straight line, else the arc between the two
 * rim points Re(D̄·e^(jθ)) = (A + C)/2 (stable for any radius: no centre is needed to find them) that runs inside.
 * False (nothing written) when no part is inside, for a point circle and for a degenerate form.
 */
export function diskArc(arcs: Vec, a: number, circ: Vec, co: number): boolean {
  const A = circ[co], Dr = circ[co + 1], Di = circ[co + 2], C = circ[co + 3];
  const dm = Math.hypot(Dr, Di), s2 = Dr * Dr + Di * Di - A * C;
  if (!(s2 > 0) || !(dm < Infinity)) return false;
  const q = dm > 0 ? (A + C) / (2 * dm) : Infinity;
  let cx = 0, cy = 0, R = Infinity;
  if (A !== 0) { cx = Dr / A; cy = Di / A; R = Math.sqrt(s2) / Math.abs(A); }
  if (!(Math.abs(q) < 1)) {
    // No crossing with the rim (or touching it): the circle is inside or outside as a whole.
    if (A === 0 || !(Math.hypot(cx + R, cy) <= 1)) return false;
    arcs[a + ARC_SX] = arcs[a + ARC_EX] = cx + R; arcs[a + ARC_SY] = arcs[a + ARC_EY] = cy;
    arcs[a + ARC_MX] = cx - R; arcs[a + ARC_MY] = cy;
    arcs[a + ARC_CX] = cx; arcs[a + ARC_CY] = cy; arcs[a + ARC_R] = R; arcs[a + ARC_SWEEP] = 0; arcs[a + ARC_TURNS] = 1;
    return true;
  }
  const phi = Math.atan2(Di, Dr), dt = Math.acos(q);
  const x1 = Math.cos(phi - dt), y1 = Math.sin(phi - dt), x2 = Math.cos(phi + dt), y2 = Math.sin(phi + dt);
  arcs[a + ARC_SX] = x1; arcs[a + ARC_SY] = y1; arcs[a + ARC_EX] = x2; arcs[a + ARC_EY] = y2;
  arcs[a + ARC_CX] = cx; arcs[a + ARC_CY] = cy; arcs[a + ARC_R] = R; arcs[a + ARC_TURNS] = 0;
  if (A === 0) {
    arcs[a + ARC_MX] = 0.5 * (x1 + x2); arcs[a + ARC_MY] = 0.5 * (y1 + y2); arcs[a + ARC_SWEEP] = 0;
    return true;
  }
  const a1 = Math.atan2(y1 - cy, x1 - cx);
  let sweep = Math.atan2(y2 - cy, x2 - cx) - a1;
  if (sweep <= 0) sweep += 2 * Math.PI;
  // The arc counter-clockwise from the first rim point, or the other one: whichever has its middle inside.
  let mx = cx + R * Math.cos(a1 + 0.5 * sweep), my = cy + R * Math.sin(a1 + 0.5 * sweep);
  if (!(Math.hypot(mx, my) <= 1)) {
    sweep -= 2 * Math.PI;
    mx = cx + R * Math.cos(a1 + 0.5 * sweep); my = cy + R * Math.sin(a1 + 0.5 * sweep);
  }
  arcs[a + ARC_MX] = mx; arcs[a + ARC_MY] = my; arcs[a + ARC_SWEEP] = sweep;
  return true;
}
