// Evaluation of a ladder from the load towards the source (docs/smith-chart/engine.md §4, D4): a node is a
// normalised (V, I·Z0) pair at the port towards the load, started at the load and multiplied through each part's
// ABCD matrix (facts.md eqs. 25–28); z = V/(I·Z0), Γ = (V − I·Z0)/(V + I·Z0). The figures of every node (|Γ|, ∠Γ,
// VSWR, return loss, mismatch loss, Q, z, y) come from convert.ts.
//
// Parts of value 0 or ∞: parts.ts gives each lumped part and stub in a bounded form (a series z with |z| > 1 is
// applied as [[1/z, 1], [0, 1/z]], a shunt y with |y| > 1 as [[1/y, 0], [1, 1/y]]), so a series open is the rank-1
// [[0, 1], [0, 0]] and a shunt short [[0, 0], [1, 0]] with no special case. When the product is (0, 0) (an open
// followed by a series open, a short followed by a shunt short, or an underflow on the way to one of those), the
// node is the part's image point: the open (1, 0) after a series part, the short (0, 1) after a shunt part. A node is
// rescaled by a power of two when it leaves [2^−64, 2^64], which leaves Γ unchanged. So no node is ever (0, 0), ∞ or NaN.
//
// Data layout: nodes are NODE_STRIDE = 4 numbers (V re, V im, I re, I im) in a Float64Array, node 0 the load and node
// k the input of part k (counted from the load); parts are packed by parts.ts (PART_STRIDE per part). The hot paths
// (evaluate, inputGamma, sweep) allocate nothing.

import { cdiv } from './complex';
import type { Vec } from './complex';
import { gammaAngle, gammaMag, mismatchLoss, qFromGamma, returnLoss, vswr } from './convert';
import * as P from './parts';
import { LINE, PART_STRIDE, QUARTER, SERIES_C, packParts, sincosTurns } from './parts';
import type { Part } from './parts';

export const NODE_STRIDE = 4;

/** A circuit as the editor holds it (engine.md §2): Z0 and f0, the load in ohms (R = ∞ is the open), parts from the load. */
export interface Circuit {
  z0: number;
  f0: number;
  loadR: number;
  loadX: number;
  parts: Part[];
}

// A node is rescaled by a power of two when its largest component leaves [2^−64, 2^64]. Lumped parts at most double
// a node, so this is rare; it keeps products such as w·V (w down to 1e-308 for a value near ∞) out of the subnormals.
const BIG = 2 ** 64;
const SMALL = 2 ** -64;

/** The node of a load R + jX (Ω) on Z0 into nodes[o…]: (z, 1) for |z| ≤ 1, else (1, 1/z); an infinite R or X is the open (1, 0). */
export function loadNode(nodes: Vec, o: number, R: number, X: number, z0: number): void {
  const r = R / z0, x = X / z0;
  if (r === Infinity || x === Infinity || x === -Infinity) {
    nodes[o] = 1; nodes[o + 1] = 0; nodes[o + 2] = 0; nodes[o + 3] = 0;
  } else if (r * r + x * x <= 1) {
    nodes[o] = r; nodes[o + 1] = x; nodes[o + 2] = 1; nodes[o + 3] = 0;
  } else {
    nodes[o] = 1; nodes[o + 1] = 0;
    cdiv(nodes, o + 2, 1, 0, r, x);
  }
}

/** Applies one part to the node at nodes[o…] in place, with the degenerate rule and the rescaling above. */
export function applyPart(nodes: Vec, o: number, kind: number, value: number, zc: number, f: number, f0: number, z0: number): void {
  const vr = nodes[o], vi = nodes[o + 1], ir = nodes[o + 2], ii = nodes[o + 3];
  let a: number, b: number, c: number, d: number;
  if (kind === LINE || kind === QUARTER) {
    const zn = (kind === QUARTER ? value : zc) / z0;
    sincosTurns(kind === QUARTER ? 0.25 * (f / f0) : value * (f / f0));
    const cs = P.COS, zs = zn * P.SIN, ys = P.SIN / zn;
    a = cs * vr - zs * ii; b = cs * vi + zs * ir;
    c = cs * ir - ys * vi; d = cs * ii + ys * vr;
  } else {
    P.lumped(kind, value, zc, f, f0, z0);
    const pr = P.PART_RE, pi = P.PART_IM;
    const series = kind <= SERIES_C;
    if (series) {
      if (P.PART_DIRECT) { a = vr + pr * ir - pi * ii; b = vi + pr * ii + pi * ir; c = ir; d = ii; }
      else { a = pr * vr - pi * vi + ir; b = pr * vi + pi * vr + ii; c = pr * ir - pi * ii; d = pr * ii + pi * ir; }
    } else if (P.PART_DIRECT) { a = vr; b = vi; c = pr * vr - pi * vi + ir; d = pr * vi + pi * vr + ii; }
    else { a = pr * vr - pi * vi; b = pr * vi + pi * vr; c = vr + pr * ir - pi * ii; d = vi + pr * ii + pi * ir; }
    if (a === 0 && b === 0 && c === 0 && d === 0) {
      // The (0, 0) product: the part's image point (engine.md §4).
      if (series) { nodes[o] = 1; nodes[o + 1] = 0; nodes[o + 2] = 0; nodes[o + 3] = 0; }
      else { nodes[o] = 0; nodes[o + 1] = 0; nodes[o + 2] = 1; nodes[o + 3] = 0; }
      return;
    }
  }
  const m = Math.max(Math.abs(a), Math.abs(b), Math.abs(c), Math.abs(d));
  if (m > BIG || m < SMALL) {
    // By a power of two (exact), in two factors so that a subnormal m (down to 2^−1074) does not overflow.
    const e = -Math.round(Math.log2(m)), h = e >> 1, s1 = 2 ** h, s2 = 2 ** (e - h);
    a = a * s1 * s2; b = b * s1 * s2; c = c * s1 * s2; d = d * s1 * s2;
  }
  nodes[o] = a; nodes[o + 1] = b; nodes[o + 2] = c; nodes[o + 3] = d;
}

/**
 * Every node of the ladder at frequency f into nodes (count + 1 nodes of NODE_STRIDE: node 0 the load, node k the
 * input of part k). `parts` is packed by packParts with `count` parts.
 */
export function evaluate(nodes: Vec, parts: Vec, count: number, loadR: number, loadX: number, z0: number, f: number, f0: number): void {
  loadNode(nodes, 0, loadR, loadX, z0);
  for (let k = 0, p = 0, o = 0; k < count; k++, p += PART_STRIDE) {
    const n = o + NODE_STRIDE;
    nodes[n] = nodes[o]; nodes[n + 1] = nodes[o + 1]; nodes[n + 2] = nodes[o + 2]; nodes[n + 3] = nodes[o + 3];
    applyPart(nodes, n, parts[p], parts[p + 1], parts[p + 2], f, f0, z0);
    o = n;
  }
}

const scratch = new Float64Array(NODE_STRIDE);

/** Γ of a node (V, I): (V − I)/(V + I). V + I = 0 (z = −1, not passive) gives (Infinity, 0). */
export function nodeGamma(out: Vec, o: number, nodes: Vec, n: number): void {
  const vr = nodes[n], vi = nodes[n + 1], ir = nodes[n + 2], ii = nodes[n + 3];
  cdiv(out, o, vr - ir, vi - ii, vr + ir, vi + ii);
}

/** Γ at the input (the source end) at frequency f, into out[o], out[o + 1], without storing the nodes. */
export function inputGamma(out: Vec, o: number, parts: Vec, count: number, loadR: number, loadX: number, z0: number, f: number, f0: number): void {
  loadNode(scratch, 0, loadR, loadX, z0);
  for (let k = 0, p = 0; k < count; k++, p += PART_STRIDE) applyPart(scratch, 0, parts[p], parts[p + 1], parts[p + 2], f, f0, z0);
  nodeGamma(out, o, scratch, 0);
}

/** The input Γ at each of the nf frequencies in freqs, interleaved (re, im) into gamma. Allocates nothing. */
export function sweep(gamma: Vec, freqs: Vec, nf: number, parts: Vec, count: number, loadR: number, loadX: number, z0: number, f0: number): void {
  for (let i = 0; i < nf; i++) inputGamma(gamma, 2 * i, parts, count, loadR, loadX, z0, freqs[i], f0);
}

// The figures of a node: METRIC_STRIDE numbers at these offsets.
export const M_GR = 0;
export const M_GI = 1;
export const M_MAG = 2;
/** ∠Γ in radians. */
export const M_ANGLE = 3;
export const M_VSWR = 4;
/** Return loss in dB, ∞ for a match. */
export const M_RL = 5;
/** Mismatch loss in dB, ∞ on the rim. */
export const M_ML = 6;
export const M_Q = 7;
/** Normalised z = V/I (the open is (Infinity, 0)). */
export const M_ZR = 8;
export const M_ZI = 9;
/** Normalised y = I/V (the short is (Infinity, 0)). */
export const M_YR = 10;
export const M_YI = 11;
export const METRIC_STRIDE = 12;

/** The figures of node k of nodes into metrics[mo…] (METRIC_STRIDE numbers). Never NaN. */
export function nodeMetrics(metrics: Vec, mo: number, nodes: Vec, k: number): void {
  const n = k * NODE_STRIDE;
  nodeGamma(metrics, mo, nodes, n);
  const gr = metrics[mo], gi = metrics[mo + 1];
  const mag = gammaMag(gr, gi);
  metrics[mo + M_MAG] = mag;
  metrics[mo + M_ANGLE] = gammaAngle(gr, gi);
  metrics[mo + M_VSWR] = vswr(mag);
  metrics[mo + M_RL] = returnLoss(mag);
  metrics[mo + M_ML] = mismatchLoss(mag);
  metrics[mo + M_Q] = qFromGamma(gr, gi);
  const vr = nodes[n], vi = nodes[n + 1], ir = nodes[n + 2], ii = nodes[n + 3];
  cdiv(metrics, mo + M_ZR, vr, vi, ir, ii);
  cdiv(metrics, mo + M_YR, ir, ii, vr, vi);
}

/** The figures of nodes 0…count into metrics, METRIC_STRIDE per node. */
export function allMetrics(metrics: Vec, nodes: Vec, count: number): void {
  for (let k = 0; k <= count; k++) nodeMetrics(metrics, k * METRIC_STRIDE, nodes, k);
}

/** One-shot evaluation for panels (allocates): the nodes and their figures at f (default f0). */
export function evaluateCircuit(circuit: Circuit, f = circuit.f0): { nodes: Float64Array; metrics: Float64Array } {
  const count = circuit.parts.length;
  const parts = packParts(circuit.parts);
  const nodes = new Float64Array((count + 1) * NODE_STRIDE);
  const metrics = new Float64Array((count + 1) * METRIC_STRIDE);
  evaluate(nodes, parts, count, circuit.loadR, circuit.loadX, circuit.z0, f, circuit.f0);
  allMetrics(metrics, nodes, count);
  return { nodes, metrics };
}
