// The 2D quasi-static boundary-element solver (solver.md §2, engine.md §4) for any number of conductors: per unit
// length the Maxwell capacitance matrix C (with the dielectrics), C0 (in vacuum), L = μ0ε0·C0⁻¹, and for one
// conductor Z0, εeff and the delay; the error estimate by refinement (solver.md §2.6) with a check of the order.
//
// One level M: panels (panels.ts), one assembly (kernels.ts), one LU of the dielectric matrix and one of its
// conductor block (the vacuum problem: the same potentials), one right-hand side per signal (V = 1 on it, 0 on all
// others and on ground). The result is level M; levels M/2 and M/4 (when M/4 ≥ 1/2) give the estimate. A section
// that is its own mirror image is solved as even and odd halves (symmetry.ts; 4× less LU, 2× less assembly, the odd
// half skipped when every signal is its own mirror), with the same charges on the whole boundary.
//
// The estimate (`estimateOf`): e = max(|X(M) − X(M/2)|, floor·|X|), floor 10⁻⁵. With three levels the two
// differences must shrink at an order between 1 and 4 (ratio 2…16, same sign), else the status is 'irregular' and
// e becomes the larger difference: refinement can fail silently (literature.md, Zhechev2026), so the page shows the
// status with the number. Collocation makes C slightly unsymmetric; it is symmetrised and the removed part
// (`asym`, relative) is reported and added to the estimate of every off-diagonal entry.

import type { Section } from './geometry';
import { assemble, vacuumMatrix } from './kernels';
import type { Panels } from './kernels';
import { invert, luFactor, luSolve, symmetrize, toRows } from './linalg';
import { meshBoundary, sectionBoundary, validLevel } from './panels';
import type { Boundary } from './panels';
import { assembleMirror, findMirror, vacuumMirror } from './symmetry';

export const EPS0 = 8.8541878188e-12; // F/m, CODATA 2022
export const C0 = 299792458; // m/s
export const BEM_VERSION = 1;
export const DEFAULT_LEVEL = 2;
export const ERROR_FLOOR = 1e-5;

export interface Times { mesh: number; assemble: number; lu: number; lu0: number; solve: number; total: number }

export interface Level {
  M: number;
  panels: number; // all panels (conductor and interface)
  nc: number; // conductor panels
  C: Float64Array; // n × n row-major, F/m, symmetrised
  C0: Float64Array;
  L: Float64Array; // H/m
  asym: number; // largest relative asymmetry removed from C or C0
  pivot: number; // smallest/largest LU pivot of the dielectric matrix (the worse of the two halves)
  mirror: boolean; // solved as even and odd halves (symmetry.ts)
  mesh: Panels;
  q: Float64Array; // dielectric solve: q[s·N + j] = total charge density σ/ε0 on panel j for V = 1 on signal s + 1
  q0: Float64Array; // vacuum solve: q0[s·nc + j]
  ms: Times;
}

export type Status = 'regular' | 'converged' | 'irregular' | 'unchecked';

export interface Estimate { e: number; order: number; status: Status } // order NaN when not measured

export interface SingleLine { z0: number; eeff: number; delay: number; z0Err: Estimate; eeffErr: Estimate; delayErr: Estimate }

export interface BemResult {
  ok: boolean;
  reason: string; // why not, when !ok
  signals: number;
  M: number;
  C: number[][]; // F/m
  C0: number[][];
  L: number[][]; // H/m
  errC: number[][]; // estimates of each entry
  errC0: number[][];
  errL: number[][];
  single: SingleLine | null; // one signal conductor
  status: Status; // the worst status of the results above
  levels: Level[]; // coarse to fine; the last is the result
  boundary: Boundary | null;
  ms: number;
}

// M: the level (default 2); estimate: false solves level M alone (no estimate, status unchecked: the fast path for
// sweeps, Monte Carlo and the inverse solve); floor: the estimate's floor; mirror: false forces the full solve.
export interface BemOptions { M?: number; estimate?: boolean; floor?: number; mirror?: boolean }

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

// One level. Returns a reason instead when the matrix is singular. mirror (default true): a mirror-symmetric
// section is solved as its even and odd halves (symmetry.ts); the charges are those of the whole boundary either way.
export function solveLevel(b: Boundary, M: number, mirror = true): Level | string {
  const t0 = now();
  const mesh = meshBoundary(b, M);
  const N = mesh.n;
  const nc = mesh.nc;
  const ns = b.signals;
  if (nc === 0) return 'The structure has no conductor surface.';
  const sym = mirror ? findMirror(mesh, ns) : null;
  const t1 = now();
  const B = new Float64Array(ns * N); // the charges, filled below
  const B0 = new Float64Array(ns * nc);
  let pivot: number;
  let pivot0: number;
  let t2: number;
  let t3: number;
  let t4: number;
  const cond = mesh.cond;
  if (sym) {
    const withOdd = sym.oddNeeded && sym.no > 0;
    const { Ae, Ao, nE, nO } = assembleMirror(b.kernel, mesh, sym, withOdd);
    const ve = vacuumMirror(b.kernel, mesh, sym, Ae, nE, false);
    const vo = Ao && sym.nco > 0 ? vacuumMirror(b.kernel, mesh, sym, Ao, nO, true) : null;
    t2 = now();
    const pivE = new Int32Array(nE);
    pivot = luFactor(Ae, nE, pivE);
    const pivO = Ao ? new Int32Array(nO) : null;
    if (Ao) pivot = Math.min(pivot, luFactor(Ao, nO, pivO));
    t3 = now();
    const piv0E = new Int32Array(ve.n0);
    pivot0 = luFactor(ve.A0, ve.n0, piv0E);
    const piv0O = vo ? new Int32Array(vo.n0) : null;
    if (vo) pivot0 = Math.min(pivot0, luFactor(vo.A0, vo.n0, piv0O));
    t4 = now();
    if (!(pivot > 1e-15) || !(pivot0 > 1e-15)) return 'The solver\'s matrix is singular (conductors overlapping or too thin for the mesh).';
    // excitations: V = 1 on signal s + 1, split into even and odd parts on the representatives
    const n0e = ve.n0;
    const n0o = vo ? vo.n0 : 0;
    const Be = new Float64Array(ns * nE);
    const B0e = new Float64Array(ns * n0e);
    const Bo = Ao ? new Float64Array(ns * nO) : null;
    const B0o = vo ? new Float64Array(ns * n0o) : null;
    for (let s = 0; s < ns; s++) {
      for (let a = 0; a < sym.nce; a++) {
        const r = sym.reps[a];
        const o = sym.mate[r];
        const vr = cond[r] === s + 1 ? 1 : 0;
        const vm = cond[o] === s + 1 ? 1 : 0;
        const e = o === r ? vr : 0.5 * (vr + vm);
        Be[s * nE + a] = e;
        B0e[s * n0e + a] = e;
        if (o !== r) {
          const d = 0.5 * (vr - vm);
          if (Bo) Bo[s * nO + sym.odd[r]] = d;
          if (B0o) B0o[s * n0o + sym.odd[r]] = d;
        }
      }
    }
    luSolve(Ae, nE, pivE, Be, ns);
    luSolve(ve.A0, n0e, piv0E, B0e, ns);
    if (Bo) luSolve(Ao, nO, pivO, Bo, ns);
    if (B0o) luSolve(vo.A0, n0o, piv0O, B0o, ns);
    const even = sym.even;
    const odd = sym.odd;
    const sign = sym.sign;
    for (let s = 0; s < ns; s++) {
      for (let j = 0; j < N; j++) {
        let v = Be[s * nE + even[j]];
        if (Bo && odd[j] >= 0) v += sign[j] * Bo[s * nO + odd[j]];
        B[s * N + j] = v;
      }
      for (let j = 0; j < nc; j++) {
        let v = B0e[s * n0e + even[j]];
        if (B0o && odd[j] >= 0) v += sign[j] * B0o[s * n0o + odd[j]];
        B0[s * nc + j] = v;
      }
    }
  } else {
    const free = b.kernel.kind === 'free';
    const n = N + (free ? 1 : 0);
    const A = new Float64Array(n * n);
    assemble(b.kernel, mesh, A, n);
    const { A0, n0 } = vacuumMatrix(b.kernel, mesh, A, n);
    t2 = now();
    const piv = new Int32Array(n);
    pivot = luFactor(A, n, piv);
    t3 = now();
    const piv0 = new Int32Array(n0);
    pivot0 = luFactor(A0, n0, piv0);
    t4 = now();
    if (!(pivot > 1e-15) || !(pivot0 > 1e-15)) return 'The solver\'s matrix is singular (conductors overlapping or too thin for the mesh).';
    const X = new Float64Array(ns * n);
    const X0 = new Float64Array(ns * n0);
    for (let s = 0; s < ns; s++) for (let i = 0; i < nc; i++) if (cond[i] === s + 1) { X[s * n + i] = 1; X0[s * n0 + i] = 1; }
    luSolve(A, n, piv, X, ns);
    luSolve(A0, n0, piv0, X0, ns);
    for (let s = 0; s < ns; s++) {
      B.set(X.subarray(s * n, s * n + N), s * N);
      B0.set(X0.subarray(s * n0, s * n0 + nc), s * nc);
    }
  }
  const C = new Float64Array(ns * ns);
  const Cv = new Float64Array(ns * ns);
  for (let s = 0; s < ns; s++) {
    for (let j = 0; j < nc; j++) {
      const c = cond[j];
      if (c < 1) continue;
      C[(c - 1) * ns + s] += EPS0 * mesh.epsC[j] * B[s * N + j] * mesh.len[j];
      Cv[(c - 1) * ns + s] += EPS0 * B0[s * nc + j] * mesh.len[j];
    }
  }
  const asym = Math.max(symmetrize(C, ns), symmetrize(Cv, ns));
  const inv = invert(Cv, ns);
  if (!inv) return 'The vacuum capacitance matrix is singular.';
  const L = new Float64Array(ns * ns);
  for (let i = 0; i < ns * ns; i++) L[i] = inv[i] / (C0 * C0);
  symmetrize(L, ns);
  const t5 = now();
  return {
    M, panels: N, nc, C, C0: Cv, L, asym, pivot, mirror: !!sym, mesh, q: B, q0: B0,
    ms: { mesh: t1 - t0, assemble: t2 - t1, lu: t3 - t2, lu0: t4 - t3, solve: t5 - t4, total: t5 - t0 },
  };
}

// The estimate of a quantity from its values at levels coarse to fine (2 or 3 of them; see the head).
export function estimateOf(values: number[], floor = ERROR_FLOOR): Estimate {
  const k = values.length;
  const x = values[k - 1];
  const fl = floor * Math.abs(x);
  if (k < 2) return { e: fl, order: NaN, status: 'unchecked' };
  const d1 = x - values[k - 2];
  if (k < 3) return { e: Math.max(Math.abs(d1), fl), order: NaN, status: 'unchecked' };
  const d2 = values[k - 2] - values[k - 3];
  const a1 = Math.abs(d1);
  const a2 = Math.abs(d2);
  const order = a1 > 0 && a2 > 0 ? Math.log2(a2 / a1) : NaN;
  if (a1 <= fl && a2 <= 4 * fl) return { e: fl, order, status: 'converged' };
  const r = d2 / d1;
  if (r >= 2 && r <= 16) return { e: Math.max(a1, fl), order, status: 'regular' };
  if (a1 <= fl && a2 <= 16 * fl) return { e: fl, order, status: 'converged' };
  return { e: Math.max(a1, r > 16 ? a2 / 4 : a2, fl), order, status: 'irregular' };
}

const RANK: Record<Status, number> = { converged: 0, regular: 1, unchecked: 2, irregular: 3 };
export function worse(a: Status, b: Status): Status { return RANK[b] > RANK[a] ? b : a; }

export function z0Of(lv: Level, i = 0): number {
  const n = Math.round(Math.sqrt(lv.C.length));
  return 1 / (C0 * Math.sqrt(lv.C[i * n + i] * lv.C0[i * n + i]));
}

function failed(reason: string, levels: Level[] = [], b: Boundary | null = null): BemResult {
  return { ok: false, reason, signals: 0, M: 0, C: [], C0: [], L: [], errC: [], errC0: [], errL: [], single: null, status: 'unchecked', levels, boundary: b, ms: 0 };
}

// Solves at level M and (estimate) at M/2 and M/4. `b` is a boundary, or a function giving the boundary of a level
// when the geometry itself depends on it (polygons of circles in the harness).
export function solveBoundary(b: Boundary | ((M: number) => Boundary), opt: BemOptions = {}): BemResult {
  const t0 = now();
  const M = opt.M ?? DEFAULT_LEVEL;
  if (!validLevel(M)) return failed(`Level ${M} is not one of 1/2, 1, 2, 4 … 64.`);
  const Ms = opt.estimate === false ? [M] : M / 4 >= 0.5 ? [M / 4, M / 2, M] : M / 2 >= 0.5 ? [M / 2, M] : [M];
  const levels: Level[] = [];
  let bd: Boundary | null = null;
  for (const m of Ms) {
    bd = typeof b === 'function' ? b(m) : b;
    const lv = solveLevel(bd, m, opt.mirror !== false);
    if (typeof lv === 'string') return failed(lv, levels, bd);
    levels.push(lv);
  }
  const fin = levels[levels.length - 1];
  const n = bd!.signals;
  const floor = opt.floor ?? ERROR_FLOOR;
  let status: Status = 'converged';
  const errOf = (pick: (lv: Level) => Float64Array, offAsym: boolean): number[][] => {
    const out: number[][] = [];
    for (let i = 0; i < n; i++) {
      const row: number[] = [];
      for (let j = 0; j < n; j++) {
        const est = estimateOf(levels.map((lv) => pick(lv)[i * n + j]), floor);
        status = worse(status, est.status);
        let e = est.e;
        if (offAsym && i !== j) e = Math.max(e, fin.asym * Math.sqrt(Math.abs(pick(fin)[i * n + i] * pick(fin)[j * n + j])));
        row.push(e);
      }
      out.push(row);
    }
    return out;
  };
  const errC = errOf((lv) => lv.C, true);
  const errC0 = errOf((lv) => lv.C0, true);
  const errL = errOf((lv) => lv.L, true);
  let single: SingleLine | null = null;
  if (n === 1) {
    const zs = levels.map((lv) => z0Of(lv));
    const es = levels.map((lv) => lv.C[0] / lv.C0[0]);
    const ds = es.map((e) => Math.sqrt(e) / C0);
    single = {
      z0: zs[zs.length - 1], eeff: es[es.length - 1], delay: ds[ds.length - 1],
      z0Err: estimateOf(zs, floor), eeffErr: estimateOf(es, floor), delayErr: estimateOf(ds, floor),
    };
    status = worse(worse(single.z0Err.status, single.eeffErr.status), status);
  }
  return {
    ok: true, reason: '', signals: n, M, C: toRows(fin.C, n), C0: toRows(fin.C0, n), L: toRows(fin.L, n),
    errC, errC0, errL, single, status, levels, boundary: bd, ms: now() - t0,
  };
}

// A cross-section of geometry.ts, solved.
export function solveSection(sec: Section, opt: BemOptions = {}): BemResult {
  const sb = sectionBoundary(sec);
  if (!sb.boundary) return failed(sb.reason);
  return solveBoundary(sb.boundary, opt);
}
