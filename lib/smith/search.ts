// The solver's numerical search (docs/smith-chart/solver.md "Fallback numerical search", M4.1b): for unknowns whose
// locus is not a circle (a line's Zc at a general length, f0) and as the safety net of the closed forms in solve.ts.
// Framework-free and allocation-light: functions of bounded variables (solve.ts maps every unknown to one: the angle
// atan of a normalised quantity, a length, or ln f), a grid, then refinement by a bracketing step (roots), golden
// section (minima) or damped Newton (two unknowns). Every result is in a fixed order for the same input.

/** A function of one variable; NaN where it cannot be evaluated (such points never bracket a root). */
export type Fn1 = (t: number) => number;

const GOLD = 0.5 * (Math.sqrt(5) - 1);

/**
 * The point on the chart the caller's f has just reached (up to 4 numbers: Γ at the goal node, or Γ and the target
 * carried back): the grid is refined where consecutive points are farther apart than MAX_STEP, so a sharp
 * resonance (Γ round the chart within a fraction of a grid step) is sampled as finely as a slow stretch.
 */
export const CURVE = new Float64Array(4);
/** The largest distance of consecutive grid points on the chart (Γ moves about 0.2 per step at 32 per turn). */
export const MAX_STEP = 0.25;
const MAX_DEPTH = 18, MAX_EXTRA = 20000;
/** roots1D's `passes`: refine where CURVE's first point passes close by the short (Γ = −1) or the open (Γ = +1). */
export const PASS_SHORT = 1, PASS_OPEN = 2;
/** The most halvings of one passage (48 take a grid step to the last bits of its argument). */
const PASS_DEPTH = 48;

/** The samples: arguments, values, and 1 for a point added only for a passage (else 0). */
const T: number[] = [], V: number[] = [], A: number[] = [];
let C = new Float64Array(4 * 1025);
let extra = 0, passing = 0;

/**
 * Whether the chord of CURVE's first points at C[ca] and C[cb] passes the short or open (the `passing` ones) nearer
 * than half the nearer of the two: a passage the points do not resolve (BL58).
 */
function passes(ca: number, cb: number): boolean {
  const ar = C[ca], ai = C[ca + 1], br = C[cb], bi = C[cb + 1], ux = br - ar, uy = bi - ai, l2 = ux * ux + uy * uy;
  if (!(l2 > 0)) return false;
  for (let p = -1; p <= 1; p += 2) {
    if (!(passing & (p < 0 ? PASS_SHORT : PASS_OPEN))) continue;
    const s = Math.min(1, Math.max(0, ((p - ar) * ux - ai * uy) / l2));
    if (Math.hypot(ar + s * ux - p, ai + s * uy) < 0.5 * Math.min(Math.hypot(ar - p, ai), Math.hypot(br - p, bi))) return true;
  }
  return false;
}

function walk(f: Fn1, ta: number, ca: number, tb: number, cb: number, depth: number): void {
  if (extra >= MAX_EXTRA) return;
  const d = Math.hypot(C[ca] - C[cb], C[ca + 1] - C[cb + 1], C[ca + 2] - C[cb + 2], C[ca + 3] - C[cb + 3]);
  const fast = d > MAX_STEP && depth < MAX_DEPTH;
  if (!fast && !(passing && depth < PASS_DEPTH && tb - ta > 4e-16 * Math.max(1, Math.abs(ta)) && passes(ca, cb))) return;
  extra++;
  const tm = 0.5 * (ta + tb), vm = f(tm);
  const cm = 4 * T.length;
  if (C.length < cm + 4) { const bigger = new Float64Array(2 * C.length); bigger.set(C); C = bigger; }
  // The midpoint is appended at the end and sorted in later; its curve point stays at its own index.
  C[cm] = CURVE[0]; C[cm + 1] = CURVE[1]; C[cm + 2] = CURVE[2]; C[cm + 3] = CURVE[3];
  T.push(tm); V.push(vm); A.push(fast ? 0 : 1);
  walk(f, ta, ca, tm, cm, depth + 1);
  walk(f, tm, cm, tb, cb, depth + 1);
}

/**
 * f on n intervals of [lo, hi] and at the points `at` inside it (where the caller knows the curve is sharp), refined
 * where the chart's points are far apart and, with `passes`, where CURVE's first point passes the short or open
 * between two of them: ascending arguments into T, values into V.
 */
function sample(f: Fn1, lo: number, hi: number, n: number, at?: readonly number[], passes = 0): void {
  T.length = 0; V.length = 0; A.length = 0; extra = 0; passing = passes;
  const step = (hi - lo) / n;
  const pts: number[] = [];
  for (let k = 0; k <= n; k++) pts.push(k === n ? hi : lo + step * k);
  if (at && at.length) {
    for (const t of at) if (t > lo && t < hi) pts.push(t);
    pts.sort((a, b) => a - b);
  }
  const np = pts.length;
  if (C.length < 4 * np) C = new Float64Array(8 * np);
  for (let k = 0; k < np; k++) {
    const t = pts[k];
    CURVE[0] = 0; CURVE[1] = 0; CURVE[2] = 0; CURVE[3] = 0;
    const v = f(t);
    C[4 * k] = CURVE[0]; C[4 * k + 1] = CURVE[1]; C[4 * k + 2] = CURVE[2]; C[4 * k + 3] = CURVE[3];
    T.push(t); V.push(v); A.push(0);
  }
  for (let k = 0; k + 1 < np; k++) walk(f, T[k], 4 * k, T[k + 1], 4 * (k + 1), 0);
  if (T.length > np) {
    const idx = T.map((_, i) => i).sort((a, b) => T[a] - T[b]);
    const t2 = idx.map((i) => T[i]), v2 = idx.map((i) => V[i]), a2 = idx.map((i) => A[i]);
    for (let i = 0; i < t2.length; i++) { T[i] = t2[i]; V[i] = v2[i]; A[i] = a2[i]; }
  }
}

/**
 * Roots of f on [lo, hi]: f on a grid of n intervals (refined where the chart moves fast, see CURVE), every sign
 * change refined by the Illinois variant of false position until the bracket is at the last bits, with 4 samples on
 * each side of it for a triple in one step; exact zeros of the grid count once. A pair of roots closer than the grid
 * (f dips through 0 and back between two points) is caught at the grid's local minima of |f|: golden section pushes f
 * towards the other sign and, if it gets there, both roots are refined. Appends the roots, ascending, to out. A jump
 * of f (a pole) also changes sign: the caller checks each root (solve.ts re-evaluates it). With `passes`
 * (PASS_SHORT, PASS_OPEN or both), the grid is also halved towards every point where CURVE's first point passes the
 * short or open between two grid points (BL58: where every locus of a part meets, f changes sign and back within a
 * band of a part's resonance far narrower than the grid). The local minima are then looked for on the grid without
 * those points too, so a dip they hide (a local minimum whose neighbour a passage made lower) is still tried.
 */
export function roots1D(f: Fn1, lo: number, hi: number, n: number, out: number[], at?: readonly number[], passes = 0): void {
  sample(f, lo, hi, n, at, passes);
  const gt = T.slice(), gv = V.slice(), m = gt.length - 1, start = out.length;
  if (gv[0] === 0) out.push(lo);
  for (let k = 1; k <= m; k++) {
    const fa = gv[k - 1], fb = gv[k];
    if (fb === 0) out.push(gt[k]);
    else if (fa !== 0 && fa === fa && fb === fb && (fa < 0) !== (fb < 0)) bracketed(f, gt[k - 1], fa, gt[k], fb, out, 2);
  }
  const dip = (i: number, j: number, l: number): void => {
    const a = gv[i], b = gv[j], c = gv[l];
    if (!(a === a && b === b && c === c) || a === 0 || b === 0 || c === 0) return;
    if ((a < 0) !== (b < 0) || (b < 0) !== (c < 0)) return;
    if (!(Math.abs(b) <= Math.abs(a) && Math.abs(b) <= Math.abs(c))) return;
    const s = b < 0 ? -1 : 1;
    const t = golden((x) => s * f(x), gt[i], gt[l], gt[j], s * b, 0, 1e-13);
    if (!(GOLDEN_F < 0)) return;
    const fm = s * GOLDEN_F;
    out.push(refineRoot(f, gt[i], a, t, fm), refineRoot(f, t, fm, gt[l], c));
  };
  for (let k = 1; k < m; k++) dip(k - 1, k, k + 1);
  if (A.includes(1)) {
    // The grid without the passages' points: each triple not already tried above.
    for (let i = -1, j = -1, l = 0; l <= m; l++) {
      if (A[l]) continue;
      if (i >= 0 && (j - i > 1 || l - j > 1)) dip(i, j, l);
      i = j; j = l;
    }
  }
  if (out.length - start > 1) {
    const mine = out.splice(start).sort((x, y) => x - y);
    out.push(...mine);
  }
}

/**
 * The root of a sign change in [a, b] and, `depth` times, the pairs of roots beside it (a triple inside one grid step):
 * 4 samples on each side of the root, any sign change among them refined in turn.
 */
function bracketed(f: Fn1, a: number, fa: number, b: number, fb: number, out: number[], depth: number): void {
  const r = refineRoot(f, a, fa, b, fb);
  out.push(r);
  if (depth === 0 || !(r > a && r < b)) return;
  const T = [a], V = [fa];
  for (let k = 1; k <= 4; k++) { const t = a + ((r - a) * k) / 5; T.push(t); V.push(f(t)); }
  for (let k = 1; k <= 4; k++) { const t = r + ((b - r) * k) / 5; T.push(t); V.push(f(t)); }
  T.push(b); V.push(fb);
  for (let i = 0; i + 1 < T.length; i++) {
    const u = V[i], v = V[i + 1];
    if (i === 4 || !(u === u && v === v) || u === 0 || v === 0 || (u < 0) === (v < 0)) continue; // 4 → 5 straddles r
    bracketed(f, T[i], u, T[i + 1], v, out, depth - 1);
  }
}

/** A root of f in [a, b] with f(a), f(b) of opposite signs (Illinois false position, bisection when it stalls). */
export function refineRoot(f: Fn1, a: number, fa: number, b: number, fb: number): number {
  let side = 0;
  for (let it = 0; it < 200; it++) {
    const width = Math.abs(b - a);
    if (width <= 4e-16 * Math.max(1, Math.abs(a), Math.abs(b))) break;
    let c = (a * fb - b * fa) / (fb - fa);
    // Every fourth step a bisection: false position alone can creep from one side.
    if (!(c > Math.min(a, b) && c < Math.max(a, b)) || (it & 3) === 3) c = 0.5 * (a + b);
    const fc = f(c);
    if (fc === 0 || fc !== fc) return c;
    if ((fc < 0) === (fb < 0)) {
      b = c; fb = fc;
      if (side === -1) fa *= 0.5;
      side = -1;
    } else {
      a = c; fa = fc;
      if (side === 1) fb *= 0.5;
      side = 1;
    }
  }
  return Math.abs(fa) < Math.abs(fb) ? a : b;
}

/**
 * The local minima of f ≥ 0 on [lo, hi]: the grid's local minima (ends included; the grid refined as for roots1D)
 * refined by golden section between the points beside each. Writes the arguments into out, sorted by f (ties by
 * argument); returns how many.
 */
export function minima1D(f: Fn1, lo: number, hi: number, n: number, out: number[], at?: readonly number[]): number {
  sample(f, lo, hi, n, at);
  const gt = T.slice(), gv = V.map((v) => (v === v ? v : Infinity)), m = gt.length - 1;
  const found: number[] = [], fv: number[] = [];
  for (let k = 0; k <= m; k++) {
    const v = gv[k];
    if (v === Infinity || (k > 0 && gv[k - 1] < v) || (k < m && gv[k + 1] < v)) continue;
    if (k > 0 && gv[k - 1] === v) continue; // a flat run counts once
    const t = golden(f, gt[Math.max(0, k - 1)], gt[Math.min(m, k + 1)], gt[k], v);
    found.push(t); fv.push(GOLDEN_F);
  }
  const order = found.map((_, i) => i).sort((i, j) => fv[i] - fv[j] || found[i] - found[j]);
  out.length = 0;
  for (const i of order) out.push(found[i]);
  return out.length;
}

/** The value of f at the argument the last golden() returned. */
export let GOLDEN_F = Infinity;

/**
 * Golden-section search for a minimum of f in [a, b], starting from the best known point (t0, f0), until the bracket
 * is `tol` of the scale or a value below `stop` is found; the best point (its value in GOLDEN_F).
 */
export function golden(f: Fn1, a: number, b: number, t0: number, f0: number, stop = -Infinity, tol = 1e-15): number {
  let bestT = t0, bestF = f0 === f0 ? f0 : Infinity;
  let c = b - GOLD * (b - a), d = a + GOLD * (b - a);
  let fc = f(c), fd = f(d);
  if (fc !== fc) fc = Infinity;
  if (fd !== fd) fd = Infinity;
  for (let it = 0; it < 120 && b - a > tol * Math.max(1, Math.abs(a)) && fc >= stop && fd >= stop; it++) {
    if (fc < fd) { b = d; d = c; fd = fc; c = b - GOLD * (b - a); fc = f(c); if (fc !== fc) fc = Infinity; }
    else { a = c; c = d; fc = fd; d = a + GOLD * (b - a); fd = f(d); if (fd !== fd) fd = Infinity; }
  }
  if (fc < bestF) { bestF = fc; bestT = c; }
  if (fd < bestF) { bestF = fd; bestT = d; }
  GOLDEN_F = bestF;
  return bestT;
}

/** A function of two variables writing its two residual components into out[0], out[1]; returns |F| (NaN or ∞ if it cannot be evaluated). */
export type Fn2 = (x: number, y: number, out: Float64Array) => number;

const F0v = new Float64Array(2), Fx = new Float64Array(2), Fy = new Float64Array(2), Ft = new Float64Array(2);

/**
 * Damped Newton for F(x, y) = 0 from (x, y) with finite-difference Jacobians, at most `steps` steps, each step halved
 * until |F| decreases (at most 30 times). Writes the end point into at[0], at[1]; returns |F| there.
 */
export function newton2D(F: Fn2, x: number, y: number, steps: number, at: Float64Array): number {
  let r = F(x, y, F0v);
  if (!(r < Infinity)) { at[0] = x; at[1] = y; return Infinity; }
  for (let it = 0; it < steps && r > 1e-15; it++) {
    // Central differences: in a thin valley (a line's Zc near ∞ against f0) the two columns are nearly parallel and a
    // forward difference's error turned the step away from the root (M4.2).
    const hx = 1e-7 * Math.max(1, Math.abs(x)), hy = 1e-7 * Math.max(1, Math.abs(y));
    const rx = F(x + hx, y, Fx), ry = F(x, y + hy, Fy);
    if (!(rx < Infinity && ry < Infinity)) break;
    const fx0 = Fx[0], fx1 = Fx[1], fy0 = Fy[0], fy1 = Fy[1];
    const sx = F(x - hx, y, Fx), sy = F(x, y - hy, Fy);
    if (!(sx < Infinity && sy < Infinity)) break;
    const a = (fx0 - Fx[0]) / (2 * hx), c = (fx1 - Fx[1]) / (2 * hx), b = (fy0 - Fy[0]) / (2 * hy), d = (fy1 - Fy[1]) / (2 * hy);
    const det = a * d - b * c;
    if (!(Math.abs(det) > 0)) break;
    let dx = -(d * F0v[0] - b * F0v[1]) / det, dy = -(a * F0v[1] - c * F0v[0]) / det;
    if (!(Math.abs(dx) < Infinity && Math.abs(dy) < Infinity)) break;
    // Never more than a tenth of a radian (or of the variable's unit) per step: the variables are bounded angles.
    const big = Math.max(Math.abs(dx), Math.abs(dy));
    if (big > 0.1) { dx *= 0.1 / big; dy *= 0.1 / big; }
    let moved = false;
    for (let h = 0; h < 30; h++) {
      const rt = F(x + dx, y + dy, Ft);
      if (rt < r) { x += dx; y += dy; r = rt; F0v[0] = Ft[0]; F0v[1] = Ft[1]; moved = true; break; }
      dx *= 0.5; dy *= 0.5;
    }
    if (!moved) break;
  }
  at[0] = x; at[1] = y;
  return r;
}
