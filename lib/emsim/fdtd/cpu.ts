// The full-wave time loop on the CPU (step M6.2a, docs/em-sim/fullwave.md §5, §7.4, §8, §10): Yee updates with
// per-edge CA, CB and the 1D factors c0Δt/(κΔ) of problem.ts, the CPML's ψ corrections in the six slabs (Roden &
// Gedney), the conformal edges (Yu–Mittra: the H update takes E·f on them, the face area stays whole), the sources
// and the energy monitor. Framework-free; the full-wave worker (M6.2b) calls `run(chunk)` and yields between chunks.
// Works on the problem's arrays in place, in its precision (Float32Array for runs, Float64Array for the reference).
//
// One step n: E·f on the conformal edges; H (n − ½ → n + ½); H's ψ; E restored; E (n → n + 1); E's ψ; the sources at
// t = (n + ½)·Δt. Every `monitorEvery` steps the E update also sums W = Σ εr·f·V_E·Eⁿ·Eⁿ⁺¹ + Σ V_H·(H̃ⁿ⁺½)² (εr from
// CA, CB: (1 + CA)/(2·CB)), which the scheme keeps to rounding on a lossless closed problem without sources: the H
// update's curl is C·F (edges shortened to f), the E update's Cᵀ, adjoint in the inner product with ε·V_E·f, and the
// Courant limit of F^½·A·F^½ is no lower than A's, so Δt needs no reduction (notes-M6.2a.md). In the CPML the sum is
// only a monitor (κ, σ; E before its ψ correction).
//
// Kernels are compiled per instance with `new Function` from their own source, so each loop's V8 feedback sees one
// array type (§10). They use only their parameters (no closures, no nested functions).

import { C0_MM } from './model';
import type { FArray } from './materials';
import type { Problem } from './problem';
import { pulseAt } from './ports';

/** What the loop needs of a problem (a `Problem` has it all; the harness builds small boxes by hand). */
export interface Grid {
  nx: number; ny: number; nz: number; N: number;
  gx: Float64Array; gy: Float64Array; gz: Float64Array;
  dt: number;
  lines: FArray;
  mat: { ca: FArray; cb: FArray; cut: Int32Array; frac: Float64Array; hcut: Int32Array; harea: Float64Array };
  cpml: { x: { cells: number }; y: { cells: number }; z: { cells: number }; coef: FArray[]; psi: FArray[] };
  E: FArray; H: FArray;
}
/** E[idx] += w·wave(t) after the E update of step n, t = (n + ½)·Δt (s). */
export interface Source { idx: Int32Array; w: Float64Array; wave: (t: number) => number }
export type LoopStatus = 'running' | 'settled' | 'unstable' | 'done';
export interface LoopOptions {
  sources?: Source[];
  monitorEvery?: number; // steps between energy sums (default 100; 0: never)
  sourceEnd?: number; // s; after it the stop and stability rules apply (default 0; a port run passes pulseEnd(p))
  stopDb?: number; // settled when W falls this far under its maximum after sourceEnd (default 50 dB)
  maxSteps?: number; // the run's cap (status 'done')
}
export const MONITOR_EVERY = 100;
/** Energy rising to this factor over its least value after the sources ended means an unstable run. */
export const UNSTABLE_RISE = 2;
/** …and above this fraction of its maximum (−30 dB, M6.2b): low-frequency energy that sloshes between the CPML and the
 *  ports' loads at −40…−50 dB after a baseband pulse rises and falls by a few dB without diverging. */
export const UNSTABLE_FLOOR = 1e-3;

/** The energy monitor's state (CpuLoop, and gpu.ts's GpuLoop). */
export interface EnergyWatch { status: LoopStatus; energy: [number, number][]; wMax: number; wMinAfter: number }
/** The stop and stability rules on an energy sum W after `step` (shared by both backends so they stop alike). */
export function judgeEnergy(s: EnergyWatch, step: number, w: number, dt: number, o: { sourceEnd: number; stopDb: number; sources: boolean }): void {
  s.energy.push([step, w]);
  // under the Courant limit the sum is a positive definite form; negative or not finite means the run diverges
  if (!Number.isFinite(w) || w < 0) { s.status = 'unstable'; return; }
  s.wMax = Math.max(s.wMax, w);
  if (step * dt <= o.sourceEnd) return;
  s.wMinAfter = Math.min(s.wMinAfter, w);
  if (w > UNSTABLE_RISE * s.wMinAfter && w > UNSTABLE_FLOOR * s.wMax) s.status = 'unstable';
  else if (o.sources && w < s.wMax * 10 ** (-o.stopDb / 10)) s.status = 'settled';
}

/** The sources of a problem's ports, driven with the weights `drive` (port 1 alone by default) by the problem's pulse. */
export function portSources(p: Problem, drive: number[] = [1]): Source[] {
  const out: Source[] = [];
  p.ports.forEach((pt, q) => {
    const a = drive[q] ?? 0;
    if (!a) return;
    out.push({ idx: pt.edges, w: Float64Array.from(pt.src, (s) => s * a), wave: (t) => pulseAt(p.pulse, t) });
  });
  return out;
}
/** When a problem's pulse has ended (its peak at 5σ, −60 dB of it 5.3σ later; 10σ as §11.1). */
export const pulseEnd = (p: Problem): number => p.pulse.t0 + 5 * p.pulse.sigma;

// ---------------------------------------------------------------- kernels (compiled per instance, see header)

function hMain(E, H, kxH, kyH, kzH, nx, ny, nz, N) {
  const sy = nx, sz = nx * ny, N2 = 2 * N;
  for (let k = 0; k < nz - 1; k++) {
    const kz = kzH[k];
    for (let j = 0; j < ny - 1; j++) {
      const ky = kyH[j];
      let c = sy * j + sz * k;
      for (let i = 0; i < nx - 1; i++, c++) {
        const ex = E[c], ey = E[N + c], ez = E[N2 + c], kx = kxH[i];
        H[c] -= ky * (E[N2 + c + sy] - ez) - kz * (E[N + c + sz] - ey);
        H[N + c] -= kz * (E[c + sz] - ex) - kx * (E[N2 + c + 1] - ez);
        H[N2 + c] -= kx * (E[N + c + 1] - ey) - ky * (E[c + sy] - ex);
      }
    }
  }
}

function eMain(E, H, ca, cb, kxE, kyE, kzE, nx, ny, nz, N) {
  const sy = nx, sz = nx * ny, N2 = 2 * N;
  for (let k = 1; k < nz; k++) {
    const kz = kzE[k];
    for (let j = 1; j < ny; j++) {
      const ky = kyE[j];
      let c = 1 + sy * j + sz * k;
      for (let i = 1; i < nx; i++, c++) {
        const hx = H[c], hy = H[N + c], hz = H[N2 + c], kx = kxE[i];
        E[c] = ca[c] * E[c] + cb[c] * (ky * (hz - H[N2 + c - sy]) - kz * (hy - H[N + c - sz]));
        E[N + c] = ca[N + c] * E[N + c] + cb[N + c] * (kz * (hx - H[c - sz]) - kx * (hz - H[N2 + c - 1]));
        E[N2 + c] = ca[N2 + c] * E[N2 + c] + cb[N2 + c] * (kx * (hy - H[N + c - 1]) - ky * (hx - H[c - sy]));
      }
    }
  }
}

// eMain with Σ εr·V·Eⁿ·Eⁿ⁺¹ (dX primal lengths, DX dual lengths per node, 0 outside, as ref.ts)
function eMainMon(E, H, ca, cb, kxE, kyE, kzE, nx, ny, nz, N, dX, dY, dZ, DX, DY, DZ) {
  const sy = nx, sz = nx * ny, N2 = 2 * N;
  let w = 0;
  for (let k = 1; k < nz; k++) {
    const kz = kzE[k], hz0 = dZ[k], Hz0 = DZ[k];
    for (let j = 1; j < ny; j++) {
      const ky = kyE[j], hy0 = dY[j], Hy0 = DY[j];
      let c = 1 + sy * j + sz * k;
      for (let i = 1; i < nx; i++, c++) {
        const hx = H[c], hy = H[N + c], hz = H[N2 + c], kx = kxE[i];
        const e0 = E[c], e1 = E[N + c], e2 = E[N2 + c];
        const a0 = ca[c] * e0 + cb[c] * (ky * (hz - H[N2 + c - sy]) - kz * (hy - H[N + c - sz]));
        const a1 = ca[N + c] * e1 + cb[N + c] * (kz * (hx - H[c - sz]) - kx * (hz - H[N2 + c - 1]));
        const a2 = ca[N2 + c] * e2 + cb[N2 + c] * (kx * (hy - H[N + c - 1]) - ky * (hx - H[c - sy]));
        E[c] = a0; E[N + c] = a1; E[N2 + c] = a2;
        if (cb[c] > 0) w += ((1 + ca[c]) / (2 * cb[c])) * dX[i] * Hy0 * Hz0 * e0 * E[c];
        if (cb[N + c] > 0) w += ((1 + ca[N + c]) / (2 * cb[N + c])) * DX[i] * hy0 * Hz0 * e1 * E[N + c];
        if (cb[N2 + c] > 0) w += ((1 + ca[N2 + c]) / (2 * cb[N2 + c])) * DX[i] * Hy0 * hz0 * e2 * E[N2 + c];
      }
    }
  }
  return w;
}

function hEnergy(H, nx, ny, nz, N, dX, dY, dZ, DX, DY, DZ) {
  const N2 = 2 * N;
  let w = 0;
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) {
    let c = nx * (j + ny * k);
    const yz0 = dY[j] * dZ[k], yz1 = DY[j] * dZ[k], yz2 = dY[j] * DZ[k];
    for (let i = 0; i < nx; i++, c++) {
      const a = H[c], b = H[N + c], d = H[N2 + c];
      w += DX[i] * yz0 * a * a + dX[i] * yz1 * b * b + dX[i] * yz2 * d * d;
    }
  }
  return w;
}

// ψ of a slab normal to x: E nodes i0..i1 − 1 (local l = i − l0), tables [bEn cEn bEh cEh bHn cHn bHh cHh] at i + nx·k
function psiEx(E, H, cb, p1, p2, bEn, cEn, bEh, cEh, dxE, i0, i1, nx, ny, nz, N, cells) {
  const sz = nx * ny, N2 = 2 * N;
  for (let k = 1; k < nz; k++) for (let j = 1; j < ny; j++) for (let i = i0; i < i1; i++) {
    const c = i + nx * j + sz * k, p = i - i0 + cells * (j + ny * k), t = i + nx * k, d = dxE[i];
    p1[p] = bEn[t] * p1[p] + cEn[t] * d * (H[N2 + c] - H[N2 + c - 1]);
    E[N + c] -= cb[N + c] * p1[p];
    p2[p] = bEh[t] * p2[p] + cEh[t] * d * (H[N + c] - H[N + c - 1]);
    E[N2 + c] += cb[N2 + c] * p2[p];
  }
}
function psiHx(E, H, p3, p4, bHn, cHn, bHh, cHh, dxH, i0, i1, nx, ny, nz, N, cells) {
  const sz = nx * ny, N2 = 2 * N;
  for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = i0; i < i1; i++) {
    const c = i + nx * j + sz * k, p = i - i0 + cells * (j + ny * k), t = i + nx * k, d = dxH[i];
    p3[p] = bHh[t] * p3[p] + cHh[t] * d * (E[N2 + c + 1] - E[N2 + c]);
    H[N + c] += p3[p];
    p4[p] = bHn[t] * p4[p] + cHn[t] * d * (E[N + c + 1] - E[N + c]);
    H[N2 + c] -= p4[p];
  }
}
// normal to y: E nodes j0..j1 − 1, tables at j + ny·k, ψ index l + cells·(i + nx·k)
function psiEy(E, H, cb, p1, p2, bEn, cEn, bEh, cEh, dyE, j0, j1, nx, ny, nz, N, cells) {
  const sz = nx * ny, N2 = 2 * N;
  for (let k = 1; k < nz; k++) for (let j = j0; j < j1; j++) {
    const t = j + ny * k, d = dyE[j], b1 = bEn[t], c1 = cEn[t] * d, b2 = bEh[t], c2 = cEh[t] * d;
    for (let i = 1; i < nx; i++) {
      const c = i + nx * j + sz * k, p = j - j0 + cells * (i + nx * k);
      p1[p] = b1 * p1[p] + c1 * (H[N2 + c] - H[N2 + c - nx]);
      E[c] += cb[c] * p1[p];
      p2[p] = b2 * p2[p] + c2 * (H[c] - H[c - nx]);
      E[N2 + c] -= cb[N2 + c] * p2[p];
    }
  }
}
function psiHy(E, H, p3, p4, bHn, cHn, bHh, cHh, dyH, j0, j1, nx, ny, nz, N, cells) {
  const sz = nx * ny, N2 = 2 * N;
  for (let k = 0; k < nz - 1; k++) for (let j = j0; j < j1; j++) {
    const t = j + ny * k, d = dyH[j], b3 = bHh[t], c3 = cHh[t] * d, b4 = bHn[t], c4 = cHn[t] * d;
    for (let i = 0; i < nx - 1; i++) {
      const c = i + nx * j + sz * k, p = j - j0 + cells * (i + nx * k);
      p3[p] = b3 * p3[p] + c3 * (E[N2 + c + nx] - E[N2 + c]);
      H[c] -= p3[p];
      p4[p] = b4 * p4[p] + c4 * (E[c + nx] - E[c]);
      H[N2 + c] += p4[p];
    }
  }
}
// normal to z: tables [bE cE bH cH] at k, ψ index l + cells·(i + nx·j)
function psiEz(E, H, cb, p1, p2, bE, cE, dzE, k0, k1, nx, ny, N, cells) {
  const sz = nx * ny;
  for (let k = k0; k < k1; k++) {
    const b = bE[k], cc = cE[k] * dzE[k];
    for (let j = 1; j < ny; j++) for (let i = 1; i < nx; i++) {
      const c = i + nx * j + sz * k, p = k - k0 + cells * (i + nx * j);
      p1[p] = b * p1[p] + cc * (H[N + c] - H[N + c - sz]);
      E[c] -= cb[c] * p1[p];
      p2[p] = b * p2[p] + cc * (H[c] - H[c - sz]);
      E[N + c] += cb[N + c] * p2[p];
    }
  }
}
function psiHz(E, H, p3, p4, bH, cH, dzH, k0, k1, nx, ny, N, cells) {
  const sz = nx * ny;
  for (let k = k0; k < k1; k++) {
    const b = bH[k], cc = cH[k] * dzH[k];
    for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
      const c = i + nx * j + sz * k, p = k - k0 + cells * (i + nx * j);
      p3[p] = b * p3[p] + cc * (E[N + c + sz] - E[N + c]);
      H[c] += p3[p];
      p4[p] = b * p4[p] + cc * (E[c + sz] - E[c]);
      H[N + c] -= p4[p];
    }
  }
}

const KERNELS = { hMain, eMain, eMainMon, hEnergy, psiEx, psiHx, psiEy, psiHy, psiEz, psiHz };
type Kernels = typeof KERNELS;
// A serial in the source (M6.2b): V8's compilation cache returns the same code and feedback for the same source, so
// without it a loop after one in the other precision ran about 2× slower (the arrays' feedback went polymorphic).
let serial = 0;
function compile(): Kernels {
  const out = {} as Record<string, unknown>;
  const id = ++serial;
  for (const [name, f] of Object.entries(KERNELS)) out[name] = new Function(`return (${f.toString()}); // ${id}`)();
  return out as Kernels;
}

// ---------------------------------------------------------------- the loop

interface Slab { axis: 0 | 1 | 2; e0: number; e1: number; h0: number; h1: number; psi: FArray[]; tab: FArray[] }

export class CpuLoop {
  readonly g: Grid;
  step = 0; // steps done; E is at step·Δt, H at (step − ½)·Δt
  status: LoopStatus = 'running';
  /** The energy sums: [step after which, W] (step·Δt is E's time). */
  readonly energy: [number, number][] = [];
  wMax = 0;
  wMinAfter = Infinity;
  private K: Kernels;
  private kE: FArray[]; private kH: FArray[];
  private dE: Float64Array[]; private dH: Float64Array[];
  private len: Float64Array[]; private dual: Float64Array[];
  private save: FArray;
  private cutW: Float64Array; // ε·V·(f − 1) per conformal edge (the monitor's correction)
  private hsave: FArray; private hinv: Float64Array; // H before the update and 1/A per face of mat.hcut (Dey–Mittra, M6.4b)
  private hW: Float64Array; // V_H·(A − 1) per such face (the monitor's correction)
  private slabs: Slab[] = [];
  private opt: Required<Omit<LoopOptions, 'maxSteps'>> & { maxSteps: number };

  constructor(g: Grid, opt: LoopOptions = {}) {
    this.g = g;
    this.K = compile();
    const { nx, ny, nz, N, lines, dt } = g;
    const L = lines;
    const sub = (a: number, b: number) => L.subarray(a, b) as FArray;
    const o = nx + ny + nz;
    this.kE = [sub(0, nx), sub(nx, nx + ny), sub(nx + ny, o)];
    this.kH = [sub(o, o + nx), sub(o + nx, o + nx + ny), sub(o + nx + ny, 2 * o)];
    const c0dt = C0_MM * dt;
    const axes = [g.gx, g.gy, g.gz];
    // c0Δt/Δ without κ (the ψ terms), and the primal and dual lengths of ref.ts's energy
    this.dE = axes.map((a) => Float64Array.from(a, (_, i) => c0dt / (i >= 1 && i <= a.length - 2 ? (a[i + 1] - a[i - 1]) / 2 : a[1] - a[0])));
    this.dH = axes.map((a) => Float64Array.from(a, (_, i) => c0dt / (i <= a.length - 2 ? a[i + 1] - a[i] : a[a.length - 1] - a[a.length - 2])));
    this.len = axes.map((a) => Float64Array.from(a, (_, i) => (i <= a.length - 2 ? a[i + 1] - a[i] : 0)));
    this.dual = axes.map((a) => Float64Array.from(a, (_, i) => (i >= 1 && i <= a.length - 2 ? (a[i + 1] - a[i - 1]) / 2 : 0)));
    const { cut, frac, ca, cb } = g.mat;
    this.save = new (g.E.constructor as Float64ArrayConstructor)(cut.length);
    this.cutW = new Float64Array(cut.length);
    for (let q = 0; q < cut.length; q++) {
      const e = cut[q], a = Math.floor(e / N), c = e - a * N;
      const i = c % nx, j = Math.floor(c / nx) % ny, k = Math.floor(c / (nx * ny));
      const [lx, ly, lz] = [a === 0 ? this.len[0][i] : this.dual[0][i], a === 1 ? this.len[1][j] : this.dual[1][j], a === 2 ? this.len[2][k] : this.dual[2][k]];
      this.cutW[q] = cb[e] > 0 ? ((1 + ca[e]) / (2 * cb[e])) * lx * ly * lz * (frac[q] - 1) : 0;
    }
    const { hcut, harea } = g.mat;
    this.hsave = new (g.H.constructor as Float64ArrayConstructor)(hcut.length);
    this.hinv = Float64Array.from(harea, (A) => 1 / A);
    this.hW = new Float64Array(hcut.length);
    for (let q = 0; q < hcut.length; q++) {
      const h = hcut[q], a = Math.floor(h / N), c = h - a * N;
      const i = c % nx, j = Math.floor(c / nx) % ny, k = Math.floor(c / (nx * ny));
      const [lx, ly, lz] = [a === 0 ? this.dual[0][i] : this.len[0][i], a === 1 ? this.dual[1][j] : this.len[1][j], a === 2 ? this.dual[2][k] : this.len[2][k]];
      this.hW[q] = lx * ly * lz * (harea[q] - 1);
    }
    // slabs in cpml.ts's order: ψ 4 per open side, tables 8 per open x/y axis, 4 for z
    const cells = [g.cpml.x.cells, g.cpml.y.cells, g.cpml.z.cells];
    const n = [nx, ny, nz];
    let ps = 0, ts = 0;
    for (let a = 0; a < 3; a++) {
      if (!cells[a]) continue;
      const tab = g.cpml.coef.slice(ts, ts + (a < 2 ? 8 : 4));
      ts += a < 2 ? 8 : 4;
      const m = cells[a], na = n[a];
      this.slabs.push({ axis: a as 0 | 1 | 2, e0: 1, e1: 1 + m, h0: 1, h1: 1 + m, psi: g.cpml.psi.slice(ps, ps + 4), tab });
      this.slabs.push({ axis: a as 0 | 1 | 2, e0: na - m, e1: na, h0: na - 1 - m, h1: na - 1, psi: g.cpml.psi.slice(ps + 4, ps + 8), tab });
      ps += 8;
    }
    this.opt = { sources: opt.sources ?? [], monitorEvery: opt.monitorEvery ?? MONITOR_EVERY, sourceEnd: opt.sourceEnd ?? 0, stopDb: opt.stopDb ?? 50, maxSteps: opt.maxSteps ?? Infinity };
  }

  /** Runs up to `steps` steps; stops early when the status leaves 'running'. Returns the steps done. */
  run(steps: number): number {
    let done = 0;
    while (done < steps && this.status === 'running') {
      const mon = this.opt.monitorEvery > 0 && (this.step + 1) % this.opt.monitorEvery === 0;
      this.advance(mon);
      done++;
      if (this.step >= this.opt.maxSteps && this.status === 'running') this.status = 'done';
    }
    return done;
  }

  /** One step that returns the energy sum W of the header (for checks); also logged. */
  measure(): number { this.advance(true); return this.energy[this.energy.length - 1][1]; }

  private advance(mon: boolean): void {
    const g = this.g, K = this.K, { nx, ny, nz, N, E, H } = g;
    const { ca, cb, cut, frac } = g.mat;
    const save = this.save;
    for (let q = 0; q < cut.length; q++) { const e = cut[q]; save[q] = E[e]; E[e] *= frac[q]; }
    const { hcut } = g.mat, hsave = this.hsave, hinv = this.hinv;
    for (let q = 0; q < hcut.length; q++) hsave[q] = H[hcut[q]];
    K.hMain(E, H, this.kH[0], this.kH[1], this.kH[2], nx, ny, nz, N);
    for (const s of this.slabs) {
      const p3 = s.psi[2], p4 = s.psi[3], t = s.tab, m = s.e1 - s.e0;
      if (s.axis === 0) K.psiHx(E, H, p3, p4, t[4], t[5], t[6], t[7], this.dH[0], s.h0, s.h1, nx, ny, nz, N, m);
      else if (s.axis === 1) K.psiHy(E, H, p3, p4, t[4], t[5], t[6], t[7], this.dH[1], s.h0, s.h1, nx, ny, nz, N, m);
      else K.psiHz(E, H, p3, p4, t[2], t[3], this.dH[2], s.h0, s.h1, nx, ny, N, m);
    }
    for (let q = 0; q < hcut.length; q++) { const h = hcut[q], s0 = hsave[q]; H[h] = s0 + (H[h] - s0) * hinv[q]; }
    for (let q = 0; q < cut.length; q++) E[cut[q]] = save[q];
    let w = 0;
    if (mon) {
      const [dX, dY, dZ] = this.len, [DX, DY, DZ] = this.dual;
      w = K.eMainMon(E, H, ca, cb, this.kE[0], this.kE[1], this.kE[2], nx, ny, nz, N, dX, dY, dZ, DX, DY, DZ);
      for (let q = 0; q < cut.length; q++) w += this.cutW[q] * save[q] * E[cut[q]];
      w += K.hEnergy(H, nx, ny, nz, N, dX, dY, dZ, DX, DY, DZ);
      for (let q = 0; q < hcut.length; q++) { const x = H[hcut[q]]; w += this.hW[q] * x * x; }
    } else K.eMain(E, H, ca, cb, this.kE[0], this.kE[1], this.kE[2], nx, ny, nz, N);
    for (const s of this.slabs) {
      const [p1, p2] = s.psi, t = s.tab, m = s.e1 - s.e0;
      if (s.axis === 0) K.psiEx(E, H, cb, p1, p2, t[0], t[1], t[2], t[3], this.dE[0], s.e0, s.e1, nx, ny, nz, N, m);
      else if (s.axis === 1) K.psiEy(E, H, cb, p1, p2, t[0], t[1], t[2], t[3], this.dE[1], s.e0, s.e1, nx, ny, nz, N, m);
      else K.psiEz(E, H, cb, p1, p2, t[0], t[1], this.dE[2], s.e0, s.e1, nx, ny, N, m);
    }
    const t = (this.step + 0.5) * g.dt;
    for (const s of this.opt.sources) {
      const v = s.wave(t);
      if (v === 0) continue;
      for (let q = 0; q < s.idx.length; q++) E[s.idx[q]] += s.w[q] * v;
    }
    this.step++;
    if (mon) this.monitor(w);
  }

  private monitor(w: number): void {
    judgeEnergy(this, this.step, w, this.g.dt, { sourceEnd: this.opt.sourceEnd, stopDb: this.opt.stopDb, sources: this.opt.sources.length > 0 });
  }
}
