// Line results from the 2D solve (engine.md §4, facts.md §3–§6): per line Z0, εeff and delay; the modes; the
// characteristic impedance matrix Zc; for a pair every definition of facts.md §5 and the coupling coefficients of §6.
//
// Every impedance is taken from Zc (solver.md §3, step 5), never from single mode vectors:
//   line k:  Z0 = Zc_kk (the line's impedance when the other lines carry no current; √(L/C) for one line),
//            εeff = C_kk/C0_kk (the line with the others at 0 V), delay = √εeff/c0 (s/m);
//   pair, definition A (the tool's default): Zdiff = Zdd = Zc11 + Zc22 − 2·Zc12, Zcm = Zcc = (Zc11 + Zc22 + 2·Zc12)/4,
//            Zdc = (Zc11 − Zc22)/2; Zodd = Zdd/2 and Zeven = 2·Zcc (for a symmetric pair the textbook even and odd);
//   definition B (voltage drive): Zdiff_B = 4/(Yc11 + Yc22 − 2·Yc12) = Zdd − Zdc²/Zcc, Zcm_B = 1/(Yc11 + Yc22 + 2·Yc12);
//   differential TDR (notes-M0.2e.md item 2): Z_TDR = Zdd − Zdc²/(Zcc + 25 Ω), so B ≤ Z_TDR ≤ A;
//   definition C: the modal impedances Z_k,m (modes.ts) with the voltage ratio of each mode;
//   coupling: kb = ¼·(Cm/C + Lm/L), kf = (Cm/C − Lm/L)/(2v) in s/m with Cm = −C12, Lm = L12, C = √(C11·C22),
//            L = √(L11·L22), v = (L11·C11·L22·C22)^(−1/4) (facts.md §6 for a symmetric pair; geometric means otherwise).
//
// Error: each quantity is computed at every level the solver returned (coarse to fine) and given estimateOf's
// estimate of those values (the same rule as the solver's own quantities), at least the level's removed asymmetry
// times the value. One level (estimate: false) gives status `unchecked` with the floor.

import { C0, estimateOf, solveSection, worse } from './bem2d';
import type { BemOptions, BemResult, Level, Status } from './bem2d';
import { section } from './geometry';
import type { Section } from './geometry';
import { modesOf } from './modes';
import type { Modes } from './modes';
import type { Setup } from './setup';
import { stackupIssues } from './stackup';
import { structureIssues } from './structure';

export const LINES_VERSION = 1;
export const TDR_COMMON_OHM = 25; // the common-mode source of two 50 Ω sources driving a differential TDR

export interface Q { v: number; e: number; status: Status }
export interface LineInfo { z0: Q; eeff: Q; delay: Q }
export interface ModeInfo {
  label: string; // pair: 'odd'/'even' (symmetric) or 'π'/'c'; otherwise ''
  eeff: Q;
  delay: Q; // s/m
  v: number; // m/s
  Tv: number[]; // voltage vector, normalised Tvᵀ·C·Tv = 1, largest entry positive
  Ti: number[];
  z: Q[]; // modal impedance of each conductor (Tripathi; definition C)
  ratio: number; // pair: Tv2/Tv1
}
export interface PairInfo {
  symmetric: boolean; // Zc11 = Zc22 to 10⁻⁹
  zdiff: Q; zcm: Q; zdc: Q; // definition A
  zdiffB: Q; zcmB: Q; // definition B
  ztdr: Q;
  zodd: Q; zeven: Q;
  kb: Q; kf: Q; // kf in s/m
}
export interface Flag { code: string; message: string; numbers: number[] }
export interface LineResults {
  ok: boolean;
  reason: string;
  version: number;
  n: number;
  M: number;
  panels: number;
  status: Status;
  lines: LineInfo[];
  modes: ModeInfo[];
  pair: PairInfo | null;
  Zc: number[][];
  Yc: number[][];
  errZc: number[][];
  clusters: number[][];
  flags: Flag[];
  check: { asymC: number; residual: number };
  bem: BemResult | null;
  ms: number;
}

const ROWS = (A: Float64Array, n: number): number[][] => Array.from({ length: n }, (_, i) => Array.from(A.subarray(i * n, i * n + n)));

// Every scalar of one level, by key. `modes` is that level's decomposition.
export function levelValues(C: ArrayLike<number>, Cv: ArrayLike<number>, L: ArrayLike<number>, n: number): { values: Record<string, number>; modes: Modes } {
  const md = modesOf(C, L, n);
  const out: Record<string, number> = {};
  if (!md.ok) return { values: out, modes: md };
  const Zc = md.Zc;
  for (let k = 0; k < n; k++) {
    const ee = C[k * n + k] / Cv[k * n + k];
    out[`z0.${k + 1}`] = Zc[k * n + k];
    out[`eeff.${k + 1}`] = ee;
    out[`delay.${k + 1}`] = Math.sqrt(ee) / C0;
  }
  if (n === 1) { out.z0 = out['z0.1']; out.eeff = out['eeff.1']; out.delay = out['delay.1']; }
  for (let m = 0; m < n; m++) {
    out[`mode${m + 1}.eeff`] = md.eeff[m];
    out[`mode${m + 1}.delay`] = 1 / md.v[m];
    for (let k = 0; k < n; k++) out[`mode${m + 1}.z${k + 1}`] = md.zMode[k * n + m];
  }
  for (let i = 0; i < n; i++) for (let j = i; j < n; j++) out[`zc${i + 1}${j + 1}`] = Zc[i * n + j];
  if (n === 2) {
    const z11 = Zc[0], z12 = Zc[1], z22 = Zc[3];
    const y11 = md.Yc[0], y12 = md.Yc[1], y22 = md.Yc[3];
    const zdd = z11 + z22 - 2 * z12;
    const zcc = (z11 + z22 + 2 * z12) / 4;
    const zdc = (z11 - z22) / 2;
    out.zdiff = zdd; out.zcm = zcc; out.zdc = zdc;
    out.zdiffB = 4 / (y11 + y22 - 2 * y12);
    out.zcmB = 1 / (y11 + y22 + 2 * y12);
    out.ztdr = zdd - (zdc * zdc) / (zcc + TDR_COMMON_OHM);
    out.zodd = zdd / 2; out.zeven = 2 * zcc;
    const cm = -C[1] / Math.sqrt(C[0] * C[3]);
    const lm = L[1] / Math.sqrt(L[0] * L[3]);
    const v = 1 / Math.sqrt(Math.sqrt(L[0] * C[0] * L[3] * C[3]));
    out.kb = 0.25 * (cm + lm);
    out.kf = (cm - lm) / (2 * v);
    out._kfScale = (Math.abs(cm) + Math.abs(lm)) / (2 * v); // internal: the scale kf is zero against
  }
  return { values: out, modes: md };
}

// The key a tolerance band, inverse or ranking is about: Z0 of one line, Zdiff of a pair, line 1's Z0 otherwise.
export function mainKey(n: number): string { return n === 1 ? 'z0' : n === 2 ? 'zdiff' : 'z0.1'; }

function failed(reason: string, bem: BemResult | null = null): LineResults {
  return { ok: false, reason, version: LINES_VERSION, n: 0, M: 0, panels: 0, status: 'unchecked', lines: [], modes: [], pair: null, Zc: [], Yc: [], errZc: [], clusters: [], flags: [], check: { asymC: NaN, residual: NaN }, bem, ms: 0 };
}

export function linesOf(bem: BemResult, floor?: number): LineResults {
  const t0 = performance.now();
  if (!bem.ok) return failed(bem.reason, bem);
  const n = bem.signals;
  const per = bem.levels.map((lv: Level) => levelValues(lv.C, lv.C0, lv.L, n));
  const fin = per[per.length - 1];
  if (!fin.modes.ok) return failed(fin.modes.reason, bem);
  const asym = bem.levels[bem.levels.length - 1].asym;
  let status: Status = bem.status;
  let rho = 0;
  let rho0 = 0;
  for (let i = 0; i < n; i++) { rho = Math.max(rho, bem.errC[i][i] / bem.C[i][i]); rho0 = Math.max(rho0, bem.errC0[i][i] / bem.C0[i][i]); }
  // A quantity's levels can agree by chance (two refinement errors of opposite sign cancel) while C itself still moves:
  // every impedance, εeff and delay is given at least the error that the relative estimates of C's and C0's diagonal
  // imply to first order (½ for impedances and delays, 1 for εeff).
  const cfloor = (key: string, x: number): number => {
    if (bem.levels.length < 2) return 0;
    if (/^(z0|zdiff|zcm|zodd|zeven|ztdr|zdiffB|zcmB)/.test(key)) return 0.5 * (rho + rho0) * Math.abs(x);
    if (/^(eeff|mode\d\.eeff)/.test(key)) return (rho + rho0) * Math.abs(x);
    if (/^(delay|mode\d\.delay)/.test(key)) return 0.5 * (rho + rho0) * Math.abs(x);
    const m = /^zc(\d)(\d)$/.exec(key);
    if (m) { const i = +m[1] - 1, j = +m[2] - 1; return 0.5 * (rho + rho0) * Math.sqrt(Math.abs(fin.values[`zc${i + 1}${i + 1}`] * fin.values[`zc${j + 1}${j + 1}`])); }
    return 0;
  };
  // `scale`: a quantity that is zero by symmetry (Zdc of a symmetric pair, kf in one dielectric) is `converged` with
  // the floor of that scale when every level gives less than 10⁻¹⁰ of it (its rounding noise is not a refinement).
  const q = (key: string, scale = 0): Q => {
    const x = fin.values[key];
    const vals = per.map((p) => p.values[key]);
    if (!vals.every(Number.isFinite)) return { v: x, e: NaN, status: 'irregular' };
    if (scale > 0 && vals.every((y) => Math.abs(y) <= 1e-10 * scale)) return { v: x, e: Math.max(1e-10 * scale, Math.abs(x)), status: 'converged' };
    const est = estimateOf(vals, floor);
    status = worse(status, est.status);
    return { v: x, e: Math.max(est.e, asym * Math.abs(x), cfloor(key, x)), status: est.status };
  };
  const md = fin.modes;
  const lines: LineInfo[] = [];
  for (let k = 1; k <= n; k++) lines.push({ z0: q(`z0.${k}`), eeff: q(`eeff.${k}`), delay: q(`delay.${k}`) });
  const pairSym = n === 2 && Math.abs(md.Zc[0] - md.Zc[3]) <= 1e-9 * (md.Zc[0] + md.Zc[3]);
  const modes: ModeInfo[] = [];
  for (let m = 0; m < n; m++) {
    const Tv = Array.from({ length: n }, (_, k) => md.Tv[k * n + m]);
    const Ti = Array.from({ length: n }, (_, k) => md.Ti[k * n + m]);
    const ratio = n === 2 ? Tv[1] / Tv[0] : NaN;
    const label = n !== 2 ? '' : ratio < 0 ? (pairSym ? 'odd' : 'π') : (pairSym ? 'even' : 'c');
    // the modal impedances are display values (definition C): their estimate does not enter the status
    const z = Tv.map((_, k) => {
      const key = `mode${m + 1}.z${k + 1}`;
      const vals = per.map((p) => p.values[key]);
      const x = fin.values[key];
      if (!vals.every(Number.isFinite)) return { v: x, e: NaN, status: 'irregular' as Status };
      const est = estimateOf(vals, floor);
      return { v: x, e: est.e, status: est.status };
    });
    modes.push({ label, eeff: q(`mode${m + 1}.eeff`), delay: q(`mode${m + 1}.delay`), v: md.v[m], Tv, Ti, z, ratio });
  }
  const errZc: number[][] = [];
  for (let i = 0; i < n; i++) {
    const row: number[] = [];
    for (let j = 0; j < n; j++) row.push(q(i <= j ? `zc${i + 1}${j + 1}` : `zc${j + 1}${i + 1}`).e);
    errZc.push(row);
  }
  let pair: PairInfo | null = null;
  if (n === 2) {
    pair = {
      symmetric: pairSym, zdiff: q('zdiff'), zcm: q('zcm'), zdc: q('zdc', fin.values.zdiff), zdiffB: q('zdiffB'), zcmB: q('zcmB'), ztdr: q('ztdr'),
      zodd: q('zodd'), zeven: q('zeven'), kb: q('kb'), kf: q('kf', fin.values._kfScale),
    };
  }
  const flags: Flag[] = [];
  const inCluster = new Set(md.clusters.flat());
  for (let m = 0; m + 1 < n; m++) {
    if (inCluster.has(m) && inCluster.has(m + 1)) continue;
    const a = modes[m].eeff, b = modes[m + 1].eeff;
    const gap = Math.abs(b.v - a.v);
    if (gap <= a.e + b.e) flags.push({ code: 'modes-unresolved', message: `Modes ${m + 1} and ${m + 2}: their εeff differ by less than the solver's error, so their velocities are not resolved (impedances are not affected).`, numbers: [a.v, b.v, a.e + b.e] });
  }
  if (bem.levels.length === 1) flags.push({ code: 'single-level', message: 'Solved at one level: no error estimate.', numbers: [bem.M] });
  if (status === 'irregular') flags.push({ code: 'irregular', message: 'The refinement did not converge at a sensible order; the error is a level difference.', numbers: [] });
  const last = bem.levels[bem.levels.length - 1];
  return {
    ok: true, reason: '', version: LINES_VERSION, n, M: bem.M, panels: last.panels, status, lines, modes, pair,
    Zc: ROWS(md.Zc, n), Yc: ROWS(md.Yc, n), errZc, clusters: md.clusters, flags,
    check: { asymC: md.asymC, residual: md.residual }, bem, ms: bem.ms + performance.now() - t0,
  };
}

// The values of the result as flat keys (levelValues' keys), and their estimates.
export function valuesOf(r: LineResults): { values: Record<string, number>; errors: Record<string, number> } {
  const values: Record<string, number> = {};
  const errors: Record<string, number> = {};
  if (!r.ok) return { values, errors };
  const put = (k: string, x: Q) => { values[k] = x.v; errors[k] = x.e; };
  r.lines.forEach((l, i) => { put(`z0.${i + 1}`, l.z0); put(`eeff.${i + 1}`, l.eeff); put(`delay.${i + 1}`, l.delay); });
  if (r.n === 1) { put('z0', r.lines[0].z0); put('eeff', r.lines[0].eeff); put('delay', r.lines[0].delay); }
  r.modes.forEach((m, i) => { put(`mode${i + 1}.eeff`, m.eeff); put(`mode${i + 1}.delay`, m.delay); m.z.forEach((z, k) => put(`mode${i + 1}.z${k + 1}`, z)); });
  for (let i = 0; i < r.n; i++) for (let j = i; j < r.n; j++) { values[`zc${i + 1}${j + 1}`] = r.Zc[i][j]; errors[`zc${i + 1}${j + 1}`] = r.errZc[i][j]; }
  if (r.pair) for (const k of ['zdiff', 'zcm', 'zdc', 'zdiffB', 'zcmB', 'ztdr', 'zodd', 'zeven', 'kb', 'kf'] as const) put(k, r.pair[k]);
  return { values, errors };
}

export interface SolveOptions extends BemOptions { floor?: number }

// The section of a setup, or why not: the first error of the stackup or the structure, or a drawing failure.
export function setupSection(setup: Setup): Section | string {
  const bad = stackupIssues(setup.stackup).find((i) => i.level === 'error') ?? structureIssues(setup.stackup, setup.trace).find((i) => i.level === 'error');
  if (bad) return bad.message;
  try {
    return section(setup.stackup, setup.trace);
  } catch (e) {
    return `The cross-section could not be drawn: ${e && (e as Error).message ? (e as Error).message : e}`;
  }
}

// The cross-section of a setup's trace, solved, as line results. Never throws.
export function solveSetup(setup: Setup, opt: SolveOptions = {}): LineResults {
  const sec = setupSection(setup);
  if (typeof sec === 'string') return failed(sec);
  const bem = solveSection(sec, opt);
  return linesOf(bem, opt.floor);
}

// Values of one setup at one level, without estimates (the fast path of sweeps, corners and Monte Carlo).
export function quickValues(setup: Setup, M: number, mirror = true): Record<string, number> | string {
  const sec = setupSection(setup);
  if (typeof sec === 'string') return sec;
  const bem = solveSection(sec, { M, estimate: false, mirror });
  if (!bem.ok) return bem.reason;
  const lv = bem.levels[0];
  const r = levelValues(lv.C, lv.C0, lv.L, bem.signals);
  return r.modes.ok ? r.values : r.modes.reason;
}
