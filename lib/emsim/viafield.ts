// The via's field maps (engine.md §9 "Via fields", step M3.2b), both as fields.ts `FieldGrid`s so the page draws and
// probes them as the trace's:
//   Side view: §5's axisymmetric solution of one via (the last level of `viaAxisym`, with the wall where the via model
//   puts it: the return vias' coaxial equivalent radius, or the rule wall when that lies inside an opening), on the
//   section line through via A: grid x = the distance along the line (signed, the barrel at 0), z = stackZ's frame.
//   The grid's x points are snapped to multiples of its spacing, so |x| falls on one r lattice and the solution is
//   evaluated once per (r, z) and mirrored exactly (Ex = sign(x)·Er). Points beyond the wall (a pair: also beyond half
//   the pitch, where the other via is) are outside the model and drawn as nothing. 1 V on the via.
//   Top view: the via cut's 2D solve (viacut.ts, vacuum; a homogeneous layer has the same φ and E for the same
//   voltages) through fields.ts with the cut's circles as its media: grid x, z = the board's x, y.
// Both progressive: a coarse lattice first, then halvings, every stage a whole grid (points not evaluated yet
// interpolated). No Node APIs.

import type { AxiLevel, ViaLayout } from './axisym';
import { AXI_LEVEL, axiField, viaAxisym, viaLayout, viaWall } from './axisym';
import type { FieldGrid, View } from './fields';
import { electric, fieldGrid, fieldModel, functionMedia } from './fields';
import type { Contour } from './fieldlines';
import { contours, fieldLines, levelsBetween } from './fieldlines';
import type { Stackup } from './stackup';
import type { ViaStructure } from './via';
import { equivalentRadius, viaCut } from './viacut';
import type { CutCircle, ViaCutResult } from './viacut';

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

// ---------- side view ----------

export interface ViaSide {
  ok: boolean;
  reason: string;
  lv: AxiLevel | null;
  L: ViaLayout | null;
  Rw: number; // the solve's wall (mm)
  rLim: number; // the map's radius: Rw, for a pair at most half the pitch
  wall: 'equivalent' | 'rule';
}

/** The side view's solution: the via model's axisymmetric solve of one via (cached by axisym.ts like the model's). */
export function viaSide(s: Stackup, v: ViaStructure, estimate?: boolean): ViaSide {
  const bad = (reason: string): ViaSide => ({ ok: false, reason, lv: null, L: null, Rw: NaN, rLim: NaN, wall: 'rule' });
  const L = viaLayout(s, v);
  if (!L.ok) return bad(L.reason);
  const cut = viaCut(s, v, { estimate });
  const Req = cut.ok ? equivalentRadius(cut, L.a) : NaN;
  const { h0 } = viaWall(L);
  let rMax = 0;
  for (const c of L.crossings) rMax = Math.max(rMax, c.pad, c.antipad);
  for (const p of L.planes) rMax = Math.max(rMax, p.r0);
  const axOpt = { M: AXI_LEVEL, estimate };
  let axi = Req > rMax + h0 ? viaAxisym(s, v, { ...axOpt, Rw: Req }) : null;
  let wall: 'equivalent' | 'rule' = 'equivalent';
  if (!axi || !axi.ok) { wall = 'rule'; axi = viaAxisym(s, v, axOpt); }
  if (!axi.ok || !axi.levels.length) return bad(axi.reason || 'The via could not be solved.');
  const rLim = v.pitch ? Math.min(axi.Rw, v.pitch.v / 2) : axi.Rw;
  return { ok: true, reason: '', lv: axi.levels[axi.levels.length - 1], L, Rw: axi.Rw, rLim, wall };
}

/** The side view's media: eps[0] air, then the slabs bottom to top; −1 ground (planes, beyond the map's radius), −2 the via. */
export function sideClassifier(L: ViaLayout, rLim: number): { eps: number[]; at: (x: number, z: number) => number } {
  const eps = [1, ...L.slabs.map((sl) => sl.er)];
  const at = (x: number, z: number): number => {
    const r = Math.abs(x);
    if (r > rLim) return -1;
    if (r <= L.a && z >= L.zBot && z <= L.zTop) return -2;
    for (const c of L.crossings) if (c.pad > 0 && r <= c.pad && z >= c.zLo && z <= c.zHi) return -2;
    for (const p of L.planes) if (r >= p.r0 && z >= p.zLo && z <= p.zHi) return -1;
    for (let k = 0; k < L.slabs.length; k++) { const sl = L.slabs[k]; if (z >= sl.zLo && z < sl.zHi) return k + 1; }
    return 0;
  };
  return { eps, at };
}

/** A view with its x points on multiples of the spacing (so |x| lies on one lattice); nx and the spacing kept. */
export function snapSide(view: View): View {
  const dx = view.nx > 1 ? (view.x1 - view.x0) / (view.nx - 1) : 1;
  const i0 = Math.round(view.x0 / dx);
  return { ...view, x0: i0 * dx, x1: (i0 + view.nx - 1) * dx };
}

const PHI_TOL = 0.05; // V (of the via's 1 V): a cell whose corners differ by more is refined
const E_TOL = 0.25; // the same for |E|, relative to the corners' largest
const YIELD_POINTS = 120; // direct evaluations between plain yields (about 4 ms on C44: the worker lets new requests in between)

/**
 * The side view's field on the (snapped) view, progressive. Yields `FieldGrid`s (each stage) and `null` (a pause
 * for the worker's slicing); returns the final grid. exact = 1: every point evaluated (checks).
 */
export function* sideGrid(side: ViaSide, view0: View, coarse = 8, exact = 0): Generator<FieldGrid | null, FieldGrid> {
  const t0 = now();
  const view = snapSide(view0);
  const { nx, ny } = view;
  const dx = nx > 1 ? (view.x1 - view.x0) / (nx - 1) : 1;
  const dz = ny > 1 ? (view.z1 - view.z0) / (ny - 1) : 1;
  const i0 = Math.round(view.x0 / dx);
  const { eps, at } = sideClassifier(side.L, side.rLim);
  // The r lattice: columns j0 … j1 (r = j·dx) that the view's |x| reach.
  const jA = Math.abs(i0), jB = Math.abs(i0 + nx - 1);
  const j0 = i0 <= 0 && i0 + nx - 1 >= 0 ? 0 : Math.min(jA, jB);
  const j1 = Math.min(Math.max(jA, jB), Math.floor(side.rLim / dx));
  const nr = Math.max(0, j1 - j0 + 1);
  const P = new Float32Array(nr * ny), R = new Float32Array(nr * ny), Z = new Float32Array(nr * ny);
  const C = new Int16Array(nr * ny);
  const done = new Uint8Array(nr * ny); // 1 evaluated (or copper)
  for (let k = 0; k < ny; k++) {
    const z = view.z0 + k * dz;
    for (let j = 0; j < nr; j++) {
      const q = k * nr + j, c = at((j0 + j) * dx, z);
      C[q] = c;
      if (c < 0) { P[q] = c === -2 ? 1 : 0; done[q] = 1; }
    }
  }
  const cls = new Int16Array(nx * ny);
  for (let k = 0; k < ny; k++) { const z = view.z0 + k * dz; for (let i = 0; i < nx; i++) cls[k * nx + i] = at((i0 + i) * dx, z); }
  const o = [0, 0, 0];
  let evaluated = 0, sinceYield = 0;
  let step = 1;
  while (step * 2 <= coarse) step *= 2;
  const pr = new Float32Array(nr * ny), er = new Float32Array(nr * ny), ez = new Float32Array(nr * ny);
  const make = (st: number, last: boolean): FieldGrid => {
    // Fill the lattice's in-between points by bilinear interpolation (lattice: every st-th row and column and the last).
    const onCol = (j: number) => j % st === 0 || j === nr - 1, onRow = (k: number) => k % st === 0 || k === ny - 1;
    for (let k = 0; k < ny; k++) {
      const ka = Math.floor(k / st) * st, kb = Math.min(ka + st, ny - 1);
      const b = kb > ka ? (k - ka) / (kb - ka) : 0;
      for (let j = 0; j < nr; j++) {
        const q = k * nr + j;
        if (last || C[q] < 0 || (onCol(j) && onRow(k))) { pr[q] = P[q]; er[q] = R[q]; ez[q] = Z[q]; continue; }
        const ja = Math.floor(j / st) * st, jb = Math.min(ja + st, nr - 1);
        const a = jb > ja ? (j - ja) / (jb - ja) : 0;
        const q00 = ka * nr + ja, q01 = ka * nr + jb, q10 = kb * nr + ja, q11 = kb * nr + jb;
        const lerp = (A: Float32Array) => (1 - b) * ((1 - a) * A[q00] + a * A[q01]) + b * ((1 - a) * A[q10] + a * A[q11]);
        pr[q] = lerp(P); er[q] = lerp(R); ez[q] = lerp(Z);
      }
    }
    const phi = new Float32Array(nx * ny), fx = new Float32Array(nx * ny), fz = new Float32Array(nx * ny);
    for (let k = 0; k < ny; k++) {
      for (let i = 0; i < nx; i++) {
        const p = k * nx + i, ii = i0 + i, j = Math.abs(ii) - j0;
        if (cls[p] < 0 || j < 0 || j >= nr) { phi[p] = cls[p] === -2 ? 1 : 0; continue; }
        const q = k * nr + j;
        phi[p] = pr[q]; fx[p] = ii < 0 ? -er[q] : er[q]; fz[p] = ez[q];
      }
    }
    return { kind: 'E', view, step: last ? 1 : st, done: last, phi, fx, fz, cls, eps: Float64Array.from(eps), evaluated, ms: now() - t0 };
  };
  const evalAt = (j: number, k: number, q: number) => {
    axiField(side.lv, (j0 + j) * dx, view.z0 + k * dz, o);
    P[q] = o[0]; R[q] = o[1]; Z[q] = o[2];
    done[q] = 1;
    evaluated++;
  };
  // The first lattice, every point.
  let eMax = 0;
  for (let k = 0; k < ny; k++) {
    if (k % step && k !== ny - 1) continue;
    for (let j = 0; j < nr; j++) {
      if (j % step && j !== nr - 1) continue;
      const q = k * nr + j;
      if (done[q]) continue;
      evalAt(j, k, q);
      eMax = Math.max(eMax, Math.hypot(R[q], Z[q]));
      if (++sinceYield >= YIELD_POINTS) { sinceYield = 0; yield null; }
    }
  }
  if (step === 1) return make(1, true);
  yield make(step, false);
  // Each halving: a new point is evaluated when its cell of the last lattice is rough (copper at a corner or at the
  // point, a dielectric's face is not one: φ and E are continuous enough there, φ changing by more than PHI_TOL across it, or |E| by more than E_TOL of its largest),
  // else interpolated from the cell's corners and kept as a corner for the next halving.
  while (step > 1) {
    const prev = step;
    step /= 2;
    for (let k = 0; k < ny; k++) {
      if (k % step && k !== ny - 1) continue;
      const ka = Math.floor(k / prev) * prev, kb = Math.min(ka + prev, ny - 1);
      const b = kb > ka ? (k - ka) / (kb - ka) : 0;
      for (let j = 0; j < nr; j++) {
        if (j % step && j !== nr - 1) continue;
        const q = k * nr + j;
        if (done[q]) continue;
        const ja = Math.floor(j / prev) * prev, jb = Math.min(ja + prev, nr - 1);
        const q00 = ka * nr + ja, q01 = ka * nr + jb, q10 = kb * nr + ja, q11 = kb * nr + jb;
        let rough = exact === 1 || C[q] < 0 || C[q00] < 0 || C[q01] < 0 || C[q10] < 0 || C[q11] < 0;
        if (!rough) {
          const p0 = Math.min(P[q00], P[q01], P[q10], P[q11]), p1 = Math.max(P[q00], P[q01], P[q10], P[q11]);
          const m00 = Math.hypot(R[q00], Z[q00]), m01 = Math.hypot(R[q01], Z[q01]), m10 = Math.hypot(R[q10], Z[q10]), m11 = Math.hypot(R[q11], Z[q11]);
          const e0 = Math.min(m00, m01, m10, m11), e1 = Math.max(m00, m01, m10, m11);
          rough = p1 - p0 > PHI_TOL || (e1 - e0 > E_TOL * e1 && e1 > 1e-3 * eMax);
        }
        if (rough) {
          evalAt(j, k, q);
          if (++sinceYield >= YIELD_POINTS) { sinceYield = 0; yield null; }
        } else {
          const a = jb > ja ? (j - ja) / (jb - ja) : 0;
          const lerp = (A: Float32Array) => (1 - b) * ((1 - a) * A[q00] + a * A[q01]) + b * ((1 - a) * A[q10] + a * A[q11]);
          P[q] = lerp(P); R[q] = lerp(R); Z[q] = lerp(Z);
          done[q] = 1;
        }
      }
    }
    if (step === 1) return make(1, true);
    yield make(step, false);
  }
  return make(1, true);
}

// ---------- top view ----------

/** The cut's media: vacuum (class 0) and the circles as copper (−1 the returns, −2, −3 the barrels). */
export function cutMedia(circles: CutCircle[]) {
  return functionMedia([1], (x, z) => {
    for (const c of circles) {
      const inside = (x - c.x) * (x - c.x) + (z - c.y) * (z - c.y) <= c.r * c.r;
      if (inside !== (c.cond === 0 && c.r * c.r > c.x * c.x + c.y * c.y)) return -1 - c.cond; // a ring (checks) is copper outside
    }
    return 0;
  }, circleVertices(circles));
}

// Points around each circle, as the media's corners: fields.ts evaluates directly around them (the field bends there).
function circleVertices(circles: CutCircle[]): number[] {
  const out: number[] = [];
  for (const c of circles) for (let k = 0; k < 16; k++) out.push(c.x + c.r * Math.cos((k * Math.PI) / 8), c.y + c.r * Math.sin((k * Math.PI) / 8));
  return out;
}

/** The top view's field source: the cut's charges for the barrels' voltages (V per barrel). */
export function topSource(cut: ViaCutResult, V: number[]) {
  if (!cut.ok) return cut.reason || 'The via cut could not be solved.';
  const model = fieldModel(cut.bem, cutMedia(cut.circles));
  if (typeof model === 'string') return model;
  return electric(model, V);
}

// ---------- the job ----------

export interface ViaFieldSpec {
  which: 'side' | 'top';
  view: View;
  drive?: number[]; // top view: volts per barrel (default 1 on each)
  estimate?: boolean; // as the via job's (so axisym.ts's cache serves the side view)
  coarse?: number; // the first lattice's spacing (grid points, a power of two; default 8)
  contours?: number; // equipotentials (default 10, 0 for none)
  lines?: number; // top view: field lines (0 or absent for none)
}

export interface ViaFieldResult {
  ok: boolean;
  reason: string;
  which: 'side' | 'top';
  grid: FieldGrid | null;
  contours: Contour[];
  lines: Float32Array[];
  drive: number[];
  Rw: number; rLim: number; wall: 'equivalent' | 'rule' | ''; // side view
  ms: number;
}

export function* viaFieldJob(s: Stackup, v: ViaStructure, spec: ViaFieldSpec): Generator<FieldGrid | null, ViaFieldResult> {
  const t0 = now();
  const res = (x: Partial<ViaFieldResult>): ViaFieldResult => ({ ok: false, reason: '', which: spec.which, grid: null, contours: [], lines: [], drive: [], Rw: NaN, rLim: NaN, wall: '', ms: now() - t0, ...x });
  if (!v) return res({ reason: 'There is no via.' });
  const nC = spec.contours ?? 10;
  if (spec.which === 'side') {
    const side = viaSide(s, v, spec.estimate);
    if (!side.ok) return res({ reason: side.reason });
    const g = sideGrid(side, spec.view, spec.coarse ?? 8);
    let grid: FieldGrid;
    for (;;) { const st = g.next(); if (st.done) { grid = st.value; break; } yield st.value; }
    const cs = nC > 0 ? contours(grid, levelsBetween(0, 1, nC)) : [];
    return res({ ok: true, grid, contours: cs, drive: [1], Rw: side.Rw, rLim: side.rLim, wall: side.wall });
  }
  const cut = viaCut(s, v, { estimate: false });
  const n = v.pitch ? 2 : 1;
  const drive = Array.from({ length: n }, (_, k) => spec.drive?.[k] ?? 1);
  const src = topSource(cut, drive);
  if (typeof src === 'string') return res({ reason: src });
  const g = fieldGrid(src, spec.view, { coarse: spec.coarse ?? 8 });
  let grid: FieldGrid;
  for (;;) { const st = g.next(); if (st.done) { grid = st.value; break; } yield st.value; }
  let lo = 0, hi = 0;
  for (const x of drive) { lo = Math.min(lo, x); hi = Math.max(hi, x); }
  const cs = nC > 0 && hi > lo ? contours(grid, levelsBetween(lo, hi, nC)) : [];
  const lines = spec.lines > 0 ? fieldLines(src, { view: spec.view, count: spec.lines }).lines : [];
  return res({ ok: true, grid, contours: cs, lines, drive });
}
