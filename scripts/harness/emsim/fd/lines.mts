// Line quantities from the FD solver's C and C0 (facts.md §4–§5), with the harness's own small linear algebra
// (cyclic Jacobi for symmetric matrices). Written without the engine's modes.ts or lines.ts (plan.md D11).

import { C0 as c0, MU0, EPS0, richardson } from './solve.mts';
import type { FdResult } from './solve.mts';

type M = number[][];

const zeros = (n: number): M => Array.from({ length: n }, () => new Array(n).fill(0));
export function mul(A: M, B: M): M {
  const n = A.length, C = zeros(n);
  for (let i = 0; i < n; i += 1) for (let k = 0; k < n; k += 1) { const a = A[i][k]; if (a) for (let j = 0; j < n; j += 1) C[i][j] += a * B[k][j]; }
  return C;
}
const T = (A: M): M => A.map((r, i) => r.map((_, j) => A[j][i]));

// Symmetric eigen-decomposition A = V·diag(w)·Vᵀ by cyclic Jacobi rotations.
export function eigSym(A0: M): { w: number[]; V: M } {
  const n = A0.length;
  const A = A0.map((r) => r.slice());
  const V = zeros(n);
  for (let i = 0; i < n; i += 1) V[i][i] = 1;
  for (let sweep = 0; sweep < 100; sweep += 1) {
    let off = 0, dia = 0;
    for (let i = 0; i < n; i += 1) { dia += A[i][i] * A[i][i]; for (let j = i + 1; j < n; j += 1) off += A[i][j] * A[i][j]; }
    if (off <= 1e-32 * dia) break;
    for (let p = 0; p < n; p += 1) for (let q = p + 1; q < n; q += 1) {
      if (A[p][q] === 0) continue;
      const th = (A[q][q] - A[p][p]) / (2 * A[p][q]);
      const t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1));
      const c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < n; k += 1) {
        const akp = A[k][p], akq = A[k][q];
        A[k][p] = c * akp - s * akq; A[k][q] = s * akp + c * akq;
      }
      for (let k = 0; k < n; k += 1) {
        const apk = A[p][k], aqk = A[q][k];
        A[p][k] = c * apk - s * aqk; A[q][k] = s * apk + c * aqk;
      }
      for (let k = 0; k < n; k += 1) {
        const vkp = V[k][p], vkq = V[k][q];
        V[k][p] = c * vkp - s * vkq; V[k][q] = s * vkp + c * vkq;
      }
    }
  }
  return { w: A.map((r, i) => r[i]), V };
}

function fn(A: M, f: (x: number) => number): M {
  const { w, V } = eigSym(A);
  const n = A.length, R = zeros(n);
  for (let k = 0; k < n; k += 1) { const fk = f(w[k]); for (let i = 0; i < n; i += 1) for (let j = 0; j < n; j += 1) R[i][j] += V[i][k] * fk * V[j][k]; }
  return R;
}

export interface LineQ {
  Zc: M; L: M;
  z0: number[]; // Zc_kk (what the engine reports per line; for n = 1 √(L/C))
  eeff: number[]; // C_kk / C0_kk (per line)
  modeEeff: number[]; // ascending
  zodd?: number; zeven?: number; // symmetric-pair formulas (only meaningful for symmetric pairs)
  zdiff?: number; zcm?: number; // definition A
}

export function lineQuantities(C: M, Cv: M): LineQ {
  const n = C.length;
  const L = fn(Cv, (x) => MU0 * EPS0 / x);
  const Ch = fn(C, Math.sqrt), Cmh = fn(C, (x) => 1 / Math.sqrt(x));
  const W = mul(mul(Ch, L), Ch);
  const Ws = W.map((r, i) => r.map((v, j) => 0.5 * (v + W[j][i])));
  const Zc = mul(mul(Cmh, fn(Ws, Math.sqrt)), Cmh);
  const ev = eigSym(Ws).w.map((x) => x * c0 * c0).sort((a, b) => a - b);
  const q: LineQ = { Zc, L, z0: Zc.map((r, i) => r[i]), eeff: C.map((r, i) => r[i] / Cv[i][i]), modeEeff: ev };
  if (n === 2) {
    q.zodd = Math.sqrt((L[0][0] - L[0][1]) / (C[0][0] - C[0][1]));
    q.zeven = Math.sqrt((L[0][0] + L[0][1]) / (C[0][0] + C[0][1]));
    q.zdiff = Zc[0][0] + Zc[1][1] - 2 * Zc[0][1];
    q.zcm = (Zc[0][0] + Zc[1][1] + 2 * Zc[0][1]) / 4;
  }
  return q;
}

// Flattened named quantities, so each gets its own extrapolation and error.
export function flat(q: LineQ): Record<string, number> {
  const out: Record<string, number> = {};
  q.z0.forEach((v, k) => { out[`z0_${k + 1}`] = v; });
  q.eeff.forEach((v, k) => { out[`eeff_${k + 1}`] = v; });
  q.modeEeff.forEach((v, k) => { out[`mode_${k + 1}`] = v; });
  const n = q.Zc.length;
  if (n > 1) for (let i = 0; i < n; i += 1) for (let j = i; j < n; j += 1) out[`Zc${i + 1}${j + 1}`] = q.Zc[i][j];
  for (const k of ['zodd', 'zeven', 'zdiff', 'zcm'] as const) if (q[k] !== undefined) out[k] = q[k];
  return out;
}

// Quantities from the extrapolated matrices, with an error estimate: with four regular levels twice the change
// between the quantities of the last two extrapolations; otherwise the change from the finest level's value (or,
// when an entry's order was outside its range, the change between the two finest levels), and never less than the
// spread of the quantity's own Richardson.
export function fdQuantities(r: FdResult): { v: Record<string, number>; e: Record<string, number> } {
  const L = r.levels.length;
  const v = flat(lineQuantities(r.C, r.C0));
  const lv = r.levels.map((x) => flat(lineQuantities(x.C, x.C0)));
  const e: Record<string, number> = {};
  const pv = r.prev ? flat(lineQuantities(r.prev.C, r.prev.C0)) : null;
  for (const k of Object.keys(v)) {
    const a = lv.map((x) => x[k]);
    let err: number;
    if (pv) err = Math.max(2 * Math.abs(v[k] - pv[k]), 0.1 * Math.abs(v[k] - a[L - 1]));
    else {
      err = r.flagged ? Math.abs(a[L - 1] - a[L - 2]) : Math.abs(v[k] - a[L - 1]);
      if (L >= 3) err = Math.max(err, Math.abs(richardson(a[L - 3], a[L - 2], a[L - 1]).v - v[k]));
    }
    e[k] = Math.max(err, 1e-9 * Math.abs(v[k]));
  }
  return { v, e };
}
