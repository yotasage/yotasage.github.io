// The page's side of a full-wave run (step M7.1a; framework-free, in the Waves chunk with the engine, never in the
// first load): the Waves section's job, the estimate shown before the run as the worker will judge it
// (fdtd/problem.ts buildProblem without allocating, fullwave.md §11.4 by `judge` with the adapter's limits and the rate
// measured by an earlier run on this device, else §9.6's table), and the result made comparable with the quasi-static
// one: a via's ports moved along their feeds from the run's reference planes to the via model's feed ends (the feeds
// are matched to their ports, so the move is a phase per port), every port renormalised to the page's 50 Ω, a pair as
// mixed mode, the TDR/TDT from those S on tdr.ts's record (the model's own time grid), and for a trace section the
// lossless line of the 2D solver's Z0 and εeff as the quasi-static curve.

import { buildProblem, judge } from './fdtd/problem';
import { buildModel } from './fdtd/model';
import { minCell } from './fdtd/mesh';
import type { Model, Note } from './fdtd/model';
import { RATES } from './fdtd/estimate';
import type { Env, Estimate, Offer, Verdict } from './fdtd/estimate';
import { gpuMisfit } from './fdtd/gpu';
import type { GpuLimits } from './fdtd/gpu';
import { CALIB_RANGE } from './fdtd/job';
import type { Backend, FdtdJob, FdtdResult } from './fdtd/job';
import { snapPlanOf, snapRuns } from './fdtd/snapshots';
import type { SliceSpec, SnapSpec } from './fdtd/snapshots';
import { renormalize, toMixedMode } from './nport';
import type { NPort } from './nport';
import { dbOf, readAt } from './plot';
import { edgeSigma, tdr, TDR_LEVEL } from './tdr';
import type { SEval, TdrOptions, TdrResult } from './tdr';
import type { Setup } from './setup';
import type { ViaModelResult } from './viamodel';

export type WaveKind = 'via' | 'trace';
export const WAVES_Z0 = 50; // Ω, the page's port reference (the Via section's default)
export const WAVES_NF = 401; // S points of the run over 0 … f_S
export const WAVES_LENGTH = 10; // mm, the default trace section between the reference planes
const C0 = 299792458;

export interface WavesSpec { kind: WaveKind; tr: number; length: number; backend: 'auto' | 'js' }

export interface DeviceInfo {
  gpu: { ok: true; vendor: string; architecture: string; limits: GpuLimits } | { ok: false; reason: string };
  js: Env; // the CPU's refusal environment (§11.4: phone, deviceMemory)
  mobile: boolean;
}

/** What this browser offers (the adapter only; the worker makes the device). The reasons are acquireGpu's. */
export async function probeDevice(): Promise<DeviceInfo> {
  const nav = (globalThis as { navigator?: Navigator & { gpu?: GPU; userAgentData?: { mobile?: boolean }; deviceMemory?: number } }).navigator;
  const mobile = !!nav?.userAgentData?.mobile;
  const js: Env = { backend: 'js', mobile, ...(nav?.deviceMemory ? { deviceMemory: nav.deviceMemory } : {}) };
  const gpu = nav?.gpu;
  if (!gpu) return { gpu: { ok: false, reason: 'This browser has no WebGPU.' }, js, mobile };
  let a: GPUAdapter | null = null;
  try { a = await gpu.requestAdapter({ powerPreference: 'high-performance' }); } catch { a = null; }
  if (!a) return { gpu: { ok: false, reason: 'WebGPU found no GPU adapter.' }, js, mobile };
  const ai = a.info as GPUAdapterInfo & { isFallbackAdapter?: boolean };
  if (ai?.isFallbackAdapter ?? (a as GPUAdapter & { isFallbackAdapter?: boolean }).isFallbackAdapter) return { gpu: { ok: false, reason: 'WebGPU offers only a software adapter.' }, js, mobile };
  const l = a.limits;
  return {
    gpu: { ok: true, vendor: ai?.vendor ?? '', architecture: ai?.architecture ?? '', limits: { maxBufferSize: l.maxBufferSize, maxStorageBufferBindingSize: l.maxStorageBufferBindingSize, maxComputeWorkgroupsPerDimension: l.maxComputeWorkgroupsPerDimension, maxStorageBuffersPerShaderStage: l.maxStorageBuffersPerShaderStage, minUniformBufferOffsetAlignment: l.minUniformBufferOffsetAlignment } },
    js, mobile,
  };
}

/** Rates measured by runs on this device (the worker's calibration, `started.info`), by backend, with their mesh. */
export const measured: Partial<Record<Backend, { rate: number; cells: number }>> = {};

export interface Preview {
  ok: boolean; backend: Backend; reason: string; rateFrom: 'table' | 'measured';
  est: Estimate | null; verdicts: Verdict[]; offer: Offer | null; notes: Note[];
  model: { length?: number; trMin: number }; // the run's ModelOptions
  ports: { name: string; layer: string; ref: number; eeff: number }[]; // ref: a via port's reference plane, mm from its barrel
  snap: SnapSpec | null; ms: number;
  views: SnapView[]; // the snapshot slices' places (M7.1b), one per slice of `snap` in order
  geom: Model; // the run's structure (the player's outline)
  pair: boolean; // four ports: the frames are of entry A's and entry B's excitations (`snap.runs`, M7.2a)
  snapBytes: number; // the frames' memory over the recorded runs (0 before the mesh)
  minCell: [number, number, number] | null; // mm, the mesh's smallest cell per axis, which set Δt (M7.2d: the theory's numbers)
}

/** The estimate and backend before the run, as job.ts will choose and judge them. */
export function preview(setup: Setup, spec: WavesSpec, dev: DeviceInfo): Preview {
  const t0 = performance.now();
  const opt: { trMin: number; length?: number } = { trMin: spec.tr };
  if (spec.kind === 'trace') {
    const m0 = buildModel(setup, 'trace', { trMin: spec.tr, z0: Array(16).fill(WAVES_Z0), eeff: Array(16).fill(1), length: 100 }); // only the feeds' L
    const L = m0.ports.length ? m0.ports[0].feed : 0;
    opt.length = spec.length + 2 * L;
  }
  const b = buildProblem(setup, spec.kind, { ...opt, precision: 'f32', env: dev.js, rate: RATES.js, allocate: false });
  const ports = (m: Model) => m.ports.map((p) => {
    let ref = 0;
    if (m.kind === 'via') {
      const bar = m.cyl.filter((c) => !c.name.startsWith('return'));
      const at = (c: { x: number; y: number }) => (p.axis === 'x' ? c.y : c.x);
      const c = bar.reduce((a, q) => (Math.abs(at(q) - p.centre) < Math.abs(at(a) - p.centre) ? q : a), bar[0]);
      ref = c ? Math.abs(p.pos - (p.axis === 'x' ? c.x : c.y)) - p.feed : 0;
    }
    return { name: p.name, layer: p.layer, ref, eeff: p.eeff };
  });
  const sv = snapOf(b.model);
  const snapBytes = sv.spec && b.mesh && b.est ? snapPlanOf(b.mesh, sv.spec, b.est.steps).bytes * snapRuns(sv.spec).length : 0;
  const base = { model: opt, ports: ports(b.model), notes: [...b.notes, ...overReturns(b.model)], snap: sv.spec, views: sv.views, geom: b.model, pair: pairOf(b.model) > 0, snapBytes, ms: 0,
    minCell: b.mesh ? [minCell(b.mesh.x), minCell(b.mesh.y), minCell(b.mesh.z)] as [number, number, number] : null };
  let backend: Backend = 'js', reason = '';
  if (spec.backend === 'js') reason = 'The CPU was asked for.';
  else if (!dev.gpu.ok) reason = `${(dev.gpu as { reason: string }).reason} The run is on the CPU.`;
  if (!b.mesh || !b.est) return { ...base, ok: false, backend, reason, rateFrom: 'table', est: null, verdicts: b.verdicts, offer: b.offer, ms: performance.now() - t0 };
  if (dev.gpu.ok && spec.backend !== 'js') {
    const g = dev.gpu;
    const env: Env = { backend: 'webgpu', maxBufferSize: g.limits.maxBufferSize, maxStorageBufferBindingSize: g.limits.maxStorageBufferBindingSize, mobile: dev.mobile };
    const misfit = gpuMisfit(b.est, g.limits);
    const gpuSize = judge(b, env, RATES.webgpu).verdicts.filter((v) => v.level === 'refuse' && v.code !== 'time');
    const jsSize = judge(b, dev.js, RATES.js).verdicts.filter((v) => v.level === 'refuse' && v.code !== 'time');
    if (misfit) reason = `The run does not fit the GPU: ${misfit}. It is on the CPU.`;
    else if (gpuSize.length && !jsSize.length) reason = `${gpuSize[0].message} It is on the CPU.`;
    else { backend = 'webgpu'; reason = `WebGPU (${g.vendor || 'GPU'}${g.architecture ? ` ${g.architecture}` : ''}).`; }
    if (backend === 'webgpu') return { ...base, ...judged(b, env, 'webgpu'), backend, reason, ms: performance.now() - t0 };
  }
  return { ...base, ...judged(b, dev.js, 'js'), backend, reason, ms: performance.now() - t0 };
}

function judged(b: Parameters<typeof judge>[0], env: Env, bk: Backend) {
  const k = measured[bk];
  const cells = b.est!.cells;
  const own = k && cells <= k.cells * CALIB_RANGE && cells >= k.cells / CALIB_RANGE;
  const v = judge(b, env, own ? k.rate : RATES[bk]);
  return { ok: v.ok, est: v.est, verdicts: v.verdicts, offer: v.offer, rateFrom: (own ? 'measured' : 'table') as 'measured' | 'table' };
}

/** BL161: a via's feed that runs over a return via touches its pad in the mesh, a short to the planes. */
function overReturns(m: Model): Note[] {
  if (m.kind !== 'via') return [];
  const out: Note[] = [];
  const bar = m.cyl.filter((c) => !c.name.startsWith('return'));
  for (const p of m.ports) {
    const along = (c: { x: number; y: number }) => (p.axis === 'x' ? c.x : c.y), across = (c: { x: number; y: number }) => (p.axis === 'x' ? c.y : c.x);
    const own = bar.reduce((a, q) => (Math.abs(across(q) - p.centre) < Math.abs(across(a) - p.centre) ? q : a), bar[0]);
    if (!own) continue;
    const lo = Math.min(along(own), p.pos), hi = Math.max(along(own), p.pos), half = (p.across[1] - p.across[0]) / 2;
    const hit = m.cyl.find((c) => c.name.startsWith('return') && along(c) > lo && along(c) < hi && Math.abs(across(c) - p.centre) < half + c.r);
    if (hit) out.push({ level: 'warning', code: 'feed-over-return', message: `The ${p.name} feed runs over ${hit.name.replace('return', 'return via')}, which joins it to the planes in the run: turn the feed (its angle in the Via section) or move the return.` });
  }
  return out;
}

/** Where a slice of the snapshots lies (M7.1b's player names its views by it). */
export type SnapView = 'side' | 'entry' | 'cavity' | 'exit' | 'above' | 'along' | 'across';

/** A pair's second entry port (the excitation whose frames join entry A's for the differential and common drive), as
 *  wavesView pairs the ports: a via's entry B is port 2 of [A in, B in, A out, B out], a trace's port 3 of
 *  [A near, A far, B near, B far]; −1 for a single line. */
export function pairOf(m: Model): number {
  return m.ports.length === 4 ? (m.kind === 'via' ? 1 : 2) : -1;
}

/** The slices the frames are taken on (M7.1b plays them), each plane with the components worth seeing there:
 *  a via from the side through barrel A along its feeds (|E|, Ez, E along the feeds), from above halfway between each
 *  feed and its plane (Ez: the feed's wave, a pair's odd mode) and in the plane cavity the barrel crosses (Ez: the
 *  parallel-plate wave the quasi-static model leaves out); a trace from above halfway to its plane (Ez, |E|), from the
 *  side along trace 1 (|E|) and across the section's middle (|E|).
 *  A pair (M7.2a) records entry A's and entry B's excitations, and the player adds them as values for the
 *  differential and common drive; |E| of a sum is not the sum of |E|, so a pair's |E| planes take the three
 *  components at the nodes (Nx, Ny, Nz: |E| as the recorder makes it, and the components shown beside it). Within six
 *  slices: a via's side view as Nx, Ny, Nz and the three top views (Ez); a trace's view from above and across the
 *  middle as Nx, Ny, Nz each (the view along trace 1, which shows one line of the two, is left out, BL180). */
function snapOf(m: Model): { spec: SnapSpec | null; views: SnapView[] } {
  const p = m.ports[0];
  if (!p) return { spec: null, views: [] };
  const pair = pairOf(m);
  const mid = (q: typeof p) => (q.ref.kind === 'plane' ? (q.zSig + q.ref.z) / 2 : q.zSig);
  const slices: SliceSpec[] = [], views: SnapView[] = [];
  const add = (v: SnapView, s: SliceSpec) => { slices.push(s); views.push(v); };
  const nodes = (v: SnapView, s: Omit<SliceSpec, 'comp'>) => { for (const c of ['Nx', 'Ny', 'Nz'] as const) add(v, { ...s, comp: c }); };
  if (m.kind === 'via') {
    const side = p.axis === 'x' ? 'y' : 'x';
    if (pair > 0) nodes('side', { normal: side, at: p.centre });
    else {
      add('side', { normal: side, at: p.centre, comp: 'E' });
      add('side', { normal: side, at: p.centre, comp: 'Ez' });
      add('side', { normal: side, at: p.centre, comp: p.axis === 'x' ? 'Ex' : 'Ey' });
    }
    add('entry', { normal: 'z', at: mid(p), comp: 'Ez' });
    // the widest gap between two planes inside the barrel's length
    const bar = m.cyl.find((c) => !c.name.startsWith('return'));
    const planes = m.cu.filter((c) => c.plane && bar && c.zt <= bar.z1 + 1e-9 && c.zb >= bar.z0 - 1e-9).sort((a, b) => a.zb - b.zb);
    let gap: [number, number] | null = null;
    for (let i = 0; i + 1 < planes.length; i++) if (!gap || planes[i + 1].zb - planes[i].zt > gap[1] - gap[0]) gap = [planes[i].zt, planes[i + 1].zb];
    if (gap && gap[1] - gap[0] > 0) add('cavity', { normal: 'z', at: (gap[0] + gap[1]) / 2, comp: 'Ez' });
    const q = m.ports.find((x) => x.layer !== p.layer);
    if (q) add('exit', { normal: 'z', at: mid(q), comp: 'Ez' });
  } else {
    const ends = m.ports.filter((x) => x.centre === p.centre).map((x) => x.pos);
    const half = ends.length > 1 ? (Math.min(...ends) + Math.max(...ends)) / 2 : p.pos;
    if (pair > 0) {
      nodes('above', { normal: 'z', at: mid(p) });
      nodes('across', { normal: p.axis, at: half });
    } else {
      add('above', { normal: 'z', at: mid(p), comp: 'Ez' });
      add('above', { normal: 'z', at: mid(p), comp: 'E' });
      add('along', { normal: p.axis === 'y' ? 'x' : 'y', at: p.centre, comp: 'E' });
      add('across', { normal: p.axis, at: half, comp: 'E' });
    }
  }
  return { spec: { comp: 'E', slices, ...(pair > 0 ? { runs: [0, pair] } : {}) }, views };
}

export function wavesJob(setup: Setup, spec: WavesSpec, pv: Preview, dev: DeviceInfo): FdtdJob {
  return { setup, kind: spec.kind, model: pv.model, backend: spec.backend, env: dev.js, nf: WAVES_NF, tr: [spec.tr], snapshots: pv.snap };
}

// ---------------------------------------------------------------- the result beside the quasi-static one

export interface WavesView {
  pair: boolean; names: [string, string]; // the reflection and transmission shown (S11, S21 or Sdd11, Sdd21)
  f: number[]; // GHz, the run's band without DC
  fw: { db: [number[], number[]]; tdr: TdrResult };
  qs: { db: [number[], number[]]; tdr: TdrResult | null; fValid: number } | null; // fValid GHz (NaN: a lossless line)
  zRef: number; fS: number; // Ω of the shown mode; GHz, the run's top
  shift: number[]; // mm each port was moved (a via: to the model's feed ends)
  np: NPort; // the shown network (renormalised, mixed for a pair)
}

/** The run's S at the model's planes and the page's reference. */
export function atPlanes(res: FdtdResult, pv: Preview, setup: Setup, q: ViaModelResult | null, z0 = WAVES_Z0): { np: NPort; shift: number[] } {
  const r = res.records, P = r.ports.length, np = res.nport;
  const shift = r.ports.map((_, p) => {
    if (setup.via == null || !q || !q.ok || !pv.ports[p] || pv.ports.length !== P) return 0;
    const layer = pv.ports[p].layer, v = setup.via;
    const pad = v.pads.find((x) => x.layer === layer);
    const padR = pad && pad.d ? pad.d.v / 2 : v.drill.v / 2;
    const feed = q.feeds.find((f) => f.layer === layer);
    return q.ok && pv.ports[0].ref > 0 ? padR + (feed ? feed.length : 0) - pv.ports[p].ref : 0;
  });
  const s = new Float64Array(np.s.length);
  for (let k = 0; k < np.f.length; k++) {
    const ph = r.ports.map((pm, p) => (2 * Math.PI * np.f[k] * Math.sqrt(pm.eeff) * shift[p] * 1e-3) / C0);
    for (let i = 0; i < P; i++) for (let j = 0; j < P; j++) {
      const o = 2 * ((k * P + i) * P + j), a = -(ph[i] + ph[j]), c = Math.cos(a), sn = Math.sin(a);
      const re = np.s[o], im = np.s[o + 1];
      s[o] = re * c - im * sn; s[o + 1] = re * sn + im * c;
    }
  }
  const moved: NPort = { version: np.version, ports: P, names: np.names, f: np.f, s, z0: np.z0, producer: np.producer, valid: np.valid, mixed: false } as NPort;
  return { np: renormalize(moved, Array(P).fill(z0)) ?? moved, shift };
}

/** A network's entries (i, j) as tdr.ts's evaluator: complex-linear on its grid, its first point (real) below it, 0
 *  above its top (the run's f_S, where the edge is at `level`). */
function evalOf(np: NPort, ij: [number, number][]): SEval {
  const P = np.ports, F = np.f, n = F.length;
  const at = (k: number, i: number, j: number, c: 0 | 1) => np.s[2 * ((k * P + i) * P + j) + c];
  const one = (fq: Float64Array, i: number, j: number) => {
    const out = new Float64Array(2 * fq.length);
    const k0 = F[0] === 0 && Number.isFinite(at(0, i, j, 0)) ? 0 : 1;
    let lo = k0;
    for (let m = 0; m < fq.length; m++) { // fq ascending
      const f = fq[m];
      if (f > F[n - 1]) break;
      if (f <= F[k0]) { out[2 * m] = at(k0, i, j, 0); continue; }
      while (lo + 2 < n && F[lo + 1] < f) lo++;
      const hi = lo + 1, w = (f - F[lo]) / (F[hi] - F[lo]);
      for (const c of [0, 1] as const) out[2 * m + c] = at(lo, i, j, c) + w * (at(hi, i, j, c) - at(lo, i, j, c));
    }
    return out;
  };
  return (fq) => ({ s11: one(fq, ij[0][0], ij[0][1]), s21: ij[1] ? one(fq, ij[1][0], ij[1][1]) : null });
}

/** S of a lossless line (Z, εeff, ℓ mm) between ports of zr, as a 2-port NPort on f. */
export function lineNPort(f: Float64Array, z: number, eeff: number, len: number, zr = WAVES_Z0): NPort {
  const s = new Float64Array(8 * f.length);
  for (let k = 0; k < f.length; k++) {
    const th = (2 * Math.PI * f[k] * Math.sqrt(eeff) * len * 1e-3) / C0, c = Math.cos(th), sn = Math.sin(th);
    // D = 2·Z·Zr·cos θ + j(Z² + Zr²)·sin θ;  S11 = j(Z² − Zr²)·sin θ / D,  S21 = 2·Z·Zr / D
    const dr = 2 * z * zr * c, di = (z * z + zr * zr) * sn, d2 = dr * dr + di * di;
    const nr = 0, ni = (z * z - zr * zr) * sn;
    const s11 = [(nr * dr + ni * di) / d2, (ni * dr - nr * di) / d2], s21 = [(2 * z * zr * dr) / d2, (-2 * z * zr * di) / d2];
    const o = 8 * k;
    s[o] = s11[0]; s[o + 1] = s11[1]; s[o + 2] = s21[0]; s[o + 3] = s21[1];
    s[o + 4] = s21[0]; s[o + 5] = s21[1]; s[o + 6] = s11[0]; s[o + 7] = s11[1];
  }
  return { version: 1, ports: 2, names: ['1', '2'], f, s, z0: [zr, zr], producer: { name: 'line', version: 1 } } as NPort;
}

const dbs = (np: NPort, i: number, j: number): number[] => {
  const out: number[] = [];
  for (let k = 1; k < np.f.length; k++) { const o = 2 * ((k * np.ports + i) * np.ports + j); out.push(dbOf(np.s[o], np.s[o + 1])); }
  return out;
};

/** The run beside the quasi-static result: S in dB on the run's band, TDR/TDT at `tr` on one time grid. */
export function wavesView(res: FdtdResult, pv: Preview, setup: Setup, spec: WavesSpec, q: ViaModelResult | null, z0 = WAVES_Z0): WavesView {
  const P = res.records.ports.length;
  const via = spec.kind === 'via';
  const { np: se, shift } = atPlanes(res, pv, setup, via ? q : null, z0);
  const pair = P === 4;
  const np = pair ? toMixedMode(se, via ? [[0, 1], [2, 3]] : [[0, 2], [1, 3]]) : se;
  const ij: [number, number][] = [[0, 0], [1, 0]];
  const names: [string, string] = pair ? ['Sdd11', 'Sdd21'] : ['S11', 'S21'];
  const f = Array.from(np.f.slice(1), (x) => x / 1e9);
  const fS = np.f[np.f.length - 1];
  const zRef = np.z0[0];
  const level = Math.max(TDR_LEVEL, Math.exp(-((2 * Math.PI * fS * edgeSigma(spec.tr)) ** 2) / 2));
  let opt: TdrOptions;
  let qs: WavesView['qs'] = null;
  if (via && q && q.ok && q.tdr) {
    const T = q.tdr, n = T.t.length;
    opt = { tr: spec.tr, zRef, span: q.span, half: T.grid.half, t0: T.t[0], t1: T.t[n - 1], dt: T.t[1] - T.t[0], level };
    const qn = (pair ? q.mixed : q.nport)!;
    const qf = Array.from(qn.f, (x) => x / 1e9), d0 = dbs(qn, 0, 0), d1 = dbs(qn, 1, 0);
    qf.shift();
    qs = { db: [f.map((x) => readAt(qf, d0, x)), f.map((x) => readAt(qf, d1, x))], tdr: T, fValid: qn.valid.fMax / 1e9 };
  } else {
    const pm = res.records.ports[0];
    const span = (spec.length * 1e-3 * Math.sqrt(pm.eeff)) / C0;
    opt = { tr: spec.tr, zRef, span, level };
    if (!via && P === 2) {
      const ln = lineNPort(np.f, pm.z0, pm.eeff, spec.length, z0);
      const exact: SEval = (fq) => { const l = lineNPort(fq, pm.z0, pm.eeff, spec.length, z0); return evalOf(l, [[0, 0], [1, 0]])(fq); };
      const T = tdr(exact, { ...opt, level: TDR_LEVEL });
      qs = { db: [dbs(ln, 0, 0), dbs(ln, 1, 0)], tdr: T, fValid: NaN };
      opt = { ...opt, half: T.grid.half, t0: T.t[0], dt: T.t[1] - T.t[0], t1: T.t[T.t.length - 1] };
    }
  }
  const T = tdr(evalOf(np, ij), opt);
  return { pair, names, f, fw: { db: [dbs(np, 0, 0), dbs(np, 1, 0)], tdr: T }, qs, zRef, fS: fS / 1e9, shift, np };
}
