// A full-wave run and its outputs (step M6.2b, docs/em-sim/fullwave.md §6, §7.1, §7.2, §7.4): the excitations (each
// port in turn for the full S-matrix, or port 1 alone for a TDR), the records of v and i at every port's two
// measurement planes, the energy stop, and from the records alone (serialisable, so the page can post-process again
// at another rise time without a new run): the S-parameters by DFT (an `NPort`, producer "fdtd"), the propagation
// constant γ of each feed and the TDR/TDT. Framework-free; the worker (job.ts) drives `Excitation.advance` in chunks.
//
// Records, per step n (row n, n = 0 the zero fields before the first step) and port, 6 f64 values: v at plane 1's two
// lines, v at plane 2's two lines (E at n·Δt), i at plane 1, i at plane 2 (H̃ at (n − ½)·Δt), as ports.ts defines
// them (v from the reference to the trace, i along the feed away from the port). A plane's voltage is the mean of its
// two lines' (the loop's half index in space), its current is moved to n·Δt in the DFT by e^{+jωΔt/2}.
// Waves (power waves at the feed's Z0 from the 2D solver, Zr): a = (V + Zr·I)/(2√Zr) into the structure,
// b = (V − Zr·I)/(2√Zr). γ of each feed from the forward waves at its two planes (the run where that port's a is
// largest): e^{−γd} = a₂/a₁, so γ carries the mesh's own dispersion; the waves at plane 2 are moved to the reference
// plane, ℓ further on: a·e^{−γℓ}, b·e^{+γℓ}. The reference plane is the feed's end (the port's position + L along the
// feed: a trace section's port 1 at L, a via's feed at the barrel block's edge). With one run per port (drives forming
// an invertible matrix A of incident waves), S = B·A⁻¹, which takes out the small incident waves the loads reflect;
// with fewer runs only the driven port's column, b/a of the driven port.

import { CpuLoop, portSources, pulseEnd } from './cpu';
import type { LoopStatus } from './cpu';
import type { Problem } from './problem';
import { runTime } from './estimate';
import { C0_MM } from './model';
import { cInv, cMul, NPORT_VERSION } from '../nport';
import type { NPort } from '../nport';
import { edgeSigma, tdr, TDR_LEVEL } from '../tdr';
import type { TdrResult } from '../tdr';
import type { SnapRecorder } from './snapshots';

export const FDTD_VERSION = 1;
export const RECORD = 6; // values per port and step
export const F_S = 0.816; // S-parameters are reported up to f_S = 0.816·f_run, the excitation at −40 dB (§7.1)
export const NF_DEFAULT = 201;
export const EEFF_FLAG = 0.01; // flag when the feed's εeff from γ differs from the 2D solver's by more (§6)

export interface PortMeta {
  name: string; z0: number; eeff: number; // Zr (Ω) and the 2D solver's εeff of the feed
  s: [number, number]; // the measurement planes' mid points, mm from the port along the feed
  sRef: number; // the reference plane, mm from the port (the feed's length L)
}
export interface RunRecord { drive: number[]; rows: number; rec: Float64Array; status: LoopStatus; ms: number }
/** Everything the outputs are computed from; plain data (posted by the worker, kept by the page). */
export interface Records {
  version: number;
  dt: number; fRun: number; trMin: number; // s, Hz, s
  delay: number; // s, the longest port-to-port path's one-way delay (sets the TDR's period)
  ports: PortMeta[];
  runs: RunRecord[];
}

export function portMeta(p: Problem): PortMeta[] {
  return p.ports.map((pt) => {
    const along = pt.spec.axis === 'y' ? p.gy : p.gx;
    const mid = pt.lines.map(([a0, a1]) => ((along[a0] + along[a1]) / 2 - pt.spec.pos) * pt.spec.dir);
    return { name: pt.spec.name, z0: pt.spec.z0, eeff: pt.spec.eeff, s: [mid[0], mid[1]], sRef: pt.spec.feed };
  });
}

/** The run's cap in steps: T = 10σ + 3τrt (§11.1) over Δt, or `maxSteps`. */
export function stepsCap(p: Problem, maxSteps?: number): number {
  return maxSteps ?? Math.ceil(runTime(p.model.trMin, p.model.path).T / p.dt);
}

export function newRecords(p: Problem): Records {
  const { tauRt } = runTime(p.model.trMin, p.model.path);
  return { version: FDTD_VERSION, dt: p.dt, fRun: p.pulse.fRun, trMin: p.pulse.trMin, delay: tauRt / 2, ports: portMeta(p), runs: [] };
}

/** The drives of a run mode: 'full' each port in turn, 'tdr' port 1 alone (or the given weights). */
export function drivesOf(P: number, mode: 'full' | 'tdr' | number[][]): number[][] {
  if (Array.isArray(mode)) return mode;
  if (mode === 'tdr') return [[1]];
  return Array.from({ length: P }, (_, j) => Array.from({ length: P }, (_, q) => (q === j ? 1 : 0)));
}

export interface ExcitationOptions { maxSteps?: number; stopDb?: number; snap?: SnapRecorder | null }

/** One excitation of a problem: zeroes its fields, then `advance(n)` steps and records until the loop stops. */
export class Excitation {
  readonly loop: CpuLoop;
  readonly cap: number;
  readonly rec: Float64Array;
  rows = 1; // row 0: the zero fields
  ms = 0;
  private idx: Int32Array; private coef: Float64Array; private off: Int32Array; private onH: Uint8Array;

  constructor(readonly p: Problem, readonly drive: number[], private opt: ExcitationOptions = {}) {
    p.E.fill(0); p.H.fill(0);
    for (const a of p.cpml.psi) a.fill(0);
    this.cap = stepsCap(p, opt.maxSteps);
    this.loop = new CpuLoop(p, { sources: portSources(p, drive), sourceEnd: pulseEnd(p), stopDb: opt.stopDb, maxSteps: this.cap });
    this.rec = new Float64Array((this.cap + 1) * p.ports.length * RECORD);
    const probes = p.ports.flatMap((pt) => [...pt.v.map((v) => [v, 0] as const), ...pt.i.map((i) => [i, 1] as const)]);
    const n = probes.reduce((s, [q]) => s + q.idx.length, 0);
    this.idx = new Int32Array(n); this.coef = new Float64Array(n); this.off = new Int32Array(probes.length + 1); this.onH = new Uint8Array(probes.length);
    let o = 0;
    probes.forEach(([q, h], k) => { this.idx.set(q.idx, o); this.coef.set(q.coef, o); o += q.idx.length; this.off[k + 1] = o; this.onH[k] = h; });
  }

  get status(): LoopStatus { return this.loop.status; }
  get step(): number { return this.loop.step; }

  /** Up to `steps` steps, each recorded; returns the steps done (fewer when the loop stops). */
  advance(steps: number): number {
    const t0 = now();
    const { E, H } = this.p, L = this.loop, idx = this.idx, coef = this.coef, off = this.off, onH = this.onH;
    const np = off.length - 1, snap = this.opt.snap;
    let done = 0;
    while (done < steps && L.status === 'running') {
      if (L.run(1) === 0) break;
      done++;
      const o = this.rows * np;
      for (let k = 0; k < np; k++) {
        const F = onH[k] ? H : E;
        let s = 0;
        for (let q = off[k]; q < off[k + 1]; q++) s += coef[q] * F[idx[q]];
        this.rec[o + k] = s;
      }
      this.rows++;
      if (snap) snap.take(this.p, L.step);
    }
    this.ms += now() - t0;
    return done;
  }

  /** The finished run as a record (the array cut to its rows). */
  record(): RunRecord {
    return { drive: this.drive.slice(), rows: this.rows, rec: this.rec.slice(0, this.rows * this.p.ports.length * RECORD), status: this.loop.status, ms: this.ms };
  }
}

/** Runs a problem to the end in one call (the harness; the worker chunks it): one excitation per drive. */
export function runProblem(p: Problem, mode: 'full' | 'tdr' | number[][] = 'full', opt: ExcitationOptions = {}): Records {
  const r = newRecords(p);
  drivesOf(p.ports.length, mode).forEach((d, k) => {
    const x = new Excitation(p, d, { ...opt, snap: k === 0 ? opt.snap : null });
    while (x.status === 'running') x.advance(1000);
    r.runs.push(x.record());
  });
  return r;
}

// ---------------------------------------------------------------- DFT

/** Per frequency, port and plane: V and I (complex, V·s and A·s): out[((k·P + p)·2 + plane)·4 + (Vre, Vim, Ire, Iim)]. */
export function spectra(r: Records, run: number, f: Float64Array): Float64Array {
  const P = r.ports.length, rr = r.runs[run], rows = rr.rows, rec = rr.rec, dt = r.dt, W = P * RECORD;
  const out = new Float64Array(f.length * P * 8);
  const acc = new Float64Array(2 * W);
  for (let k = 0; k < f.length; k++) {
    const w = 2 * Math.PI * f[k] * dt;
    acc.fill(0);
    const cw = Math.cos(w), sw = Math.sin(w);
    let c = 1, s = 0; // e^{−jωnΔt} = c − j·s
    for (let n = 0; n < rows; n++) {
      if ((n & 255) === 0) { c = Math.cos(w * n); s = Math.sin(w * n); }
      const o = n * W;
      for (let q = 0; q < W; q++) { const x = rec[o + q]; acc[2 * q] += x * c; acc[2 * q + 1] -= x * s; }
      const c2 = c * cw - s * sw; s = s * cw + c * sw; c = c2;
    }
    const hc = Math.cos(w / 2), hs = Math.sin(w / 2); // e^{+jωΔt/2} for the currents
    for (let p = 0; p < P; p++) for (let pl = 0; pl < 2; pl++) {
      const v0 = p * RECORD + 2 * pl, i0 = p * RECORD + 4 + pl;
      const vr = (acc[2 * v0] + acc[2 * v0 + 2]) / 2, vi = (acc[2 * v0 + 1] + acc[2 * v0 + 3]) / 2;
      const ir = acc[2 * i0], ii = acc[2 * i0 + 1];
      const o = ((k * P + p) * 2 + pl) * 4;
      out[o] = vr * dt; out[o + 1] = vi * dt;
      out[o + 2] = (ir * hc - ii * hs) * dt; out[o + 3] = (ir * hs + ii * hc) * dt;
    }
  }
  return out;
}

export interface Waves {
  f: Float64Array;
  /** At the reference planes: [(k·R + run)·P + port] complex (re, im interleaved). */
  a: Float64Array; b: Float64Array;
  /** γ = α + jβ of each feed (1/m): [k·P + port] complex. */
  gamma: Float64Array;
}

export function waves(r: Records, f: Float64Array): Waves {
  const P = r.ports.length, R = r.runs.length, nf = f.length;
  const sp = r.runs.map((_, q) => spectra(r, q, f));
  const a = new Float64Array(2 * nf * R * P), b = new Float64Array(2 * nf * R * P), gamma = new Float64Array(2 * nf * P);
  const aPl = new Float64Array(2 * nf * R * P * 2), bPl = new Float64Array(2 * nf * R * P * 2);
  for (let k = 0; k < nf; k++) for (let q = 0; q < R; q++) for (let p = 0; p < P; p++) {
    const z = r.ports[p].z0, sz = 2 * Math.sqrt(z);
    for (let pl = 0; pl < 2; pl++) {
      const o = ((k * P + p) * 2 + pl) * 4, d = sp[q];
      const w = 2 * ((((k * R + q) * P + p) * 2) + pl);
      aPl[w] = (d[o] + z * d[o + 2]) / sz; aPl[w + 1] = (d[o + 1] + z * d[o + 3]) / sz;
      bPl[w] = (d[o] - z * d[o + 2]) / sz; bPl[w + 1] = (d[o + 1] - z * d[o + 3]) / sz;
    }
  }
  for (let k = 0; k < nf; k++) for (let p = 0; p < P; p++) {
    const m = r.ports[p];
    // γ from the run with this port's largest incident wave
    let best = 0, bq = 0;
    for (let q = 0; q < R; q++) { const w = 2 * (((k * R + q) * P + p) * 2); const m2 = aPl[w] ** 2 + aPl[w + 1] ** 2; if (m2 > best) { best = m2; bq = q; } }
    const w = 2 * (((k * R + bq) * P + p) * 2);
    const [rr, ri] = cdiv(aPl[w + 2], aPl[w + 3], aPl[w], aPl[w + 1]); // a₂/a₁ = e^{−γd}
    const d = (m.s[1] - m.s[0]) * 1e-3;
    let ph = -Math.atan2(ri, rr);
    if (ph < -Math.PI / 2) ph += 2 * Math.PI; // βd < 3π/2
    const g0 = f[k] === 0 ? 0 : -Math.log(Math.hypot(rr, ri)) / d, g1 = f[k] === 0 ? 0 : ph / d;
    gamma[2 * (k * P + p)] = g0; gamma[2 * (k * P + p) + 1] = g1;
    const l = (m.sRef - m.s[1]) * 1e-3;
    const er = Math.exp(-g0 * l), ei = -g1 * l; // e^{−γℓ}
    for (let q = 0; q < R; q++) {
      const x = 2 * (((k * R + q) * P + p) * 2 + 1), y = 2 * ((k * R + q) * P + p);
      const ca = er * Math.cos(ei), sa = er * Math.sin(ei);
      a[y] = aPl[x] * ca - aPl[x + 1] * sa; a[y + 1] = aPl[x] * sa + aPl[x + 1] * ca;
      const cb = Math.cos(-ei) / er, sb = Math.sin(-ei) / er;
      b[y] = bPl[x] * cb - bPl[x + 1] * sb; b[y + 1] = bPl[x] * sb + bPl[x + 1] * cb;
    }
  }
  return { f, a, b, gamma };
}

function cdiv(ar: number, ai: number, br: number, bi: number): [number, number] {
  const d = br * br + bi * bi;
  return [(ar * br + ai * bi) / d, (ai * br - ar * bi) / d];
}

/** S at f (nf × P × P complex, as NPort.s) and which columns are known (all with one run per port). */
export function sMatrix(r: Records, f: Float64Array, w: Waves = waves(r, f)): { s: Float64Array; known: boolean[] } {
  const P = r.ports.length, R = r.runs.length, nf = f.length;
  const s = new Float64Array(2 * nf * P * P);
  const known = new Array<boolean>(P).fill(false);
  if (R === P) {
    const A = new Float64Array(2 * P * P), B = new Float64Array(2 * P * P), Ai = new Float64Array(2 * P * P), S = new Float64Array(2 * P * P);
    let ok = true;
    for (let k = 0; k < nf && ok; k++) {
      for (let i = 0; i < P; i++) for (let q = 0; q < R; q++) {
        const y = 2 * ((k * R + q) * P + i), z = 2 * (i * P + q);
        A[z] = w.a[y]; A[z + 1] = w.a[y + 1]; B[z] = w.b[y]; B[z + 1] = w.b[y + 1];
      }
      if (!cInv(A, P, Ai)) { ok = false; break; }
      cMul(B, Ai, P, S);
      s.set(S, 2 * k * P * P);
    }
    if (ok) { known.fill(true); return { s, known }; }
    s.fill(0);
  }
  // one column per run: the driven port's (largest weight)
  r.runs.forEach((run, q) => {
    let j = 0;
    for (let p = 1; p < run.drive.length; p++) if (Math.abs(run.drive[p]) > Math.abs(run.drive[j])) j = p;
    known[j] = true;
    for (let k = 0; k < nf; k++) {
      const y = 2 * ((k * R + q) * P + j);
      for (let i = 0; i < P; i++) {
        const x = 2 * ((k * R + q) * P + i);
        const [re, im] = cdiv(w.b[x], w.b[x + 1], w.a[y], w.a[y + 1]);
        const o = 2 * ((k * P + i) * P + j);
        s[o] = re; s[o + 1] = im;
      }
    }
  });
  return { s, known };
}

/** The band of §7.1: 0 … f_S in nf points. */
export function bandOf(r: Records, nf = NF_DEFAULT): Float64Array {
  const fS = F_S * r.fRun;
  return Float64Array.from({ length: nf }, (_, k) => (fS * k) / (nf - 1));
}

/** The S-parameters as an N-port at the ports' Zr (renormalise with nport.ts `renormalize`). Needs one run per port
 *  for every column; otherwise the unknown columns are 0 and `known` says which are filled. */
export function nportOf(r: Records, f: Float64Array = bandOf(r)): NPort & { known: boolean[] } {
  const { s, known } = sMatrix(r, f);
  return {
    version: NPORT_VERSION, ports: r.ports.length, names: r.ports.map((p) => p.name), f, s,
    z0: r.ports.map((p) => p.z0), producer: { name: 'fdtd', version: FDTD_VERSION },
    valid: { fMin: 0, fMax: F_S * r.fRun, reason: `the excitation is above −40 dB of its peak up to 0.816·f_run (f_run = ${(r.fRun / 1e9).toPrecision(4)} GHz)` },
    mixed: false, known,
  };
}

/** εeff of each feed from γ (β·c0/ω)², the mean over f_S/8 … f_S/4, against the 2D solver's; flagged over 1 %. */
export function feedEeff(r: Records, nf = 16): { eeff: number; eeff2d: number; diff: number; flag: boolean }[] {
  const fS = F_S * r.fRun;
  const f = Float64Array.from({ length: nf }, (_, k) => fS / 8 + ((fS / 8) * k) / (nf - 1));
  const w = waves(r, f), P = r.ports.length;
  return r.ports.map((m, p) => {
    let s = 0;
    for (let k = 0; k < nf; k++) s += ((w.gamma[2 * (k * P + p) + 1] * C0_MM * 1e-3) / (2 * Math.PI * f[k])) ** 2;
    const e = s / nf, diff = e / m.eeff - 1;
    return { eeff: e, eeff2d: m.eeff, diff, flag: Math.abs(diff) > EEFF_FLAG };
  });
}

export interface FdtdTdrOptions {
  port?: number; // the driven port (default 0)
  to?: number; // the port of the TDT (default: the last port of the other side, 1 for a 2-port, P/2 for a pair)
  zRef?: number; // Ω (default: the port's Zr)
  t0?: number; t1?: number; dt?: number; // s, the time record (tdr.ts's defaults)
}
/** TDR and TDT at the rise time tr ≥ tr_min (§7.2 by tdr.ts's definition, engine.md §6.6): the series of S11 and S21
 *  on tdr.ts's grid from the records' DFT; above f_run S is 0, the edge's spectrum there at most −60 dB (tr = tr_min). */
export function tdrOf(r: Records, tr: number, opt: FdtdTdrOptions = {}): TdrResult {
  const P = r.ports.length, j = opt.port ?? 0;
  const to = opt.to ?? (P === 1 ? -1 : P === 2 ? 1 - j : (j + P / 2) % P);
  const zr = r.ports[j].z0;
  const level = Math.max(TDR_LEVEL, Math.exp(-((2 * Math.PI * r.fRun * edgeSigma(tr)) ** 2) / 2));
  return tdr((f) => {
    const { s } = sMatrix(r, f);
    const nf = f.length, s11 = new Float64Array(2 * nf), s21 = to >= 0 ? new Float64Array(2 * nf) : null;
    for (let k = 0; k < nf; k++) {
      if (f[k] > r.fRun) continue;
      const o = 2 * ((k * P + j) * P + j);
      s11[2 * k] = s[o]; s11[2 * k + 1] = s[o + 1];
      if (s21) { const o2 = 2 * ((k * P + to) * P + j); s21[2 * k] = s[o2]; s21[2 * k + 1] = s[o2 + 1]; }
    }
    if (opt.zRef !== undefined && opt.zRef !== zr) renormReflection(s11, zr, opt.zRef);
    return { s11, s21 };
  }, { tr, zRef: opt.zRef ?? zr, span: r.delay, level, t0: opt.t0, t1: opt.t1, dt: opt.dt });
}

// A one-port's reflection from reference z to z' in place (the TDR at another reference; the TDT is left as it is).
function renormReflection(s: Float64Array, z: number, z2: number): void {
  const g = (z2 - z) / (z2 + z);
  for (let k = 0; k < s.length; k += 2) {
    const [re, im] = cdiv(s[k] - g, s[k + 1], 1 - g * s[k], -g * s[k + 1]);
    s[k] = re; s[k + 1] = im;
  }
}

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
