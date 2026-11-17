// The full-wave engine's WebGPU backend (step M6.3, docs/em-sim/fullwave.md §9, §11.2): the adapter and device
// (`acquireGpu`, `GpuContext` with its lost and error events), a problem's buffers and pipelines (`GpuRunner`) and
// one excitation's loop (`GpuLoop`), which run.ts's `Excitation` drives like the CPU loop through `advanceAsync`, so
// everything after the records (DFT, S-parameters, TDR, snapshots' quantisation) is shared. Kernels in gpuKernels.ts.
//
// Buffers (§9.1): E, H, CA, CB as [x | y | z] blocks in f32; L the per-line factors; the CPML's ψ and tables; the
// conformal edges; the energy partials and their ring (64 monitors); the step counter; the sources' waves sampled at
// (n + ½)·Δt in f64 on the host; META (sources and probes); the record ring (`ring` rows of RECORD values per port);
// the snapshot gathers (`frameSlots` frames). One step: conformal E·f, H, H's ψ, E restored, E (with the energy sum
// on monitor steps), the conformal correction, E's ψ, the energy reduction, `post` (sources, record row, counter),
// and a gather on frame steps. K steps go into one compute pass and one submit, at most two submits in flight
// (§9.3); every dispatch is split to the adapter's maxComputeWorkgroupsPerDimension (or a smaller forced limit).
// After a call to `advance` the record rows, energies and frames are copied to one staging buffer and read back;
// the stop and stability rules (cpu.ts `judgeEnergy`) then run on the host, so a run that settles inside a call
// ends at the same step as on the CPU (the GPU's extra steps are discarded).
//
// A lost device or a GPU error makes `advance` throw a `GpuError` (`lost` set when the device is gone); job.ts then
// restarts the excitation on the CPU (fullwave.md §9.3).

import type { Problem } from './problem';
import { judgeEnergy, MONITOR_EVERY } from './cpu';
import type { LoopStatus, Source } from './cpu';
import { C0_MM } from './model';
import type { Env, Estimate } from './estimate';
import { MiB } from './estimate';
import type { AsyncLoop, AsyncLoopOptions, LoopFactory, ProbeLayout } from './run';
import type { SnapRecorder } from './snapshots';
import * as K from './gpuKernels';

// The flag constants of the WebGPU spec, which TypeScript's lib.dom types as numbers but does not declare (plan.md D12).
const BU = { MAP_READ: 0x0001, COPY_SRC: 0x0004, COPY_DST: 0x0008, UNIFORM: 0x0040, STORAGE: 0x0080 } as const;
const MAP_READ = 0x0001; // GPUMapMode.READ
const COMPUTE = 0x4; // GPUShaderStage.COMPUTE

export const ENERGY_SLOTS = 64; // monitors per `advance` call
export const RING_ROWS = 2048; // record rows on the GPU (one `advance` call at most ring − 1 steps)
export const FRAME_BYTES = 32 * MiB; // snapshot staging per call (frames per call = this / frame size, 1 … 64)
export const SUBMIT_MS = 30; // §9.3: K = clamp(⌊30 ms / t_step⌋, 10, 500)
export const K_MIN = 10, K_MAX = 500;

export interface GpuLimits {
  maxBufferSize: number; maxStorageBufferBindingSize: number; maxComputeWorkgroupsPerDimension: number;
  maxStorageBuffersPerShaderStage: number; minUniformBufferOffsetAlignment: number;
}
export interface GpuInfo { vendor: string; architecture: string; description: string; fallback: boolean; limits: GpuLimits }

/** A GPU failure; `lost` when the device is gone (the run falls back to the CPU). */
/** The GPU buffers every runner holds now (step M7.1a: the page's check that a cancelled or finished run frees them). */
const HELD = new Set<GPUBuffer>();
const drop = (b: GPUBuffer | null | undefined): void => { if (b) { HELD.delete(b); b.destroy(); } };
export const gpuHeld = (): { buffers: number; bytes: number } => { let bytes = 0; for (const b of HELD) bytes += b.size; return { buffers: HELD.size, bytes }; };

export class GpuError extends Error {
  constructor(message: string, readonly lost = false) { super(message); this.name = 'GpuError'; }
}

type Listener = (message: string) => void;

/** The device and its events: 'lost' (device.lost) and 'error' (uncaptured errors). */
export class GpuContext {
  lost: string | null = null;
  error: string | null = null;
  private fns: Record<'lost' | 'error', Listener[]> = { lost: [], error: [] };
  private lostP: Promise<void>;

  constructor(readonly device: GPUDevice, readonly info: GpuInfo) {
    this.lostP = device.lost.then((i) => {
      this.lost = `The GPU device was lost (${i.reason}${i.message ? `: ${i.message}` : ''}).`;
      this.emit('lost', this.lost);
    });
    device.addEventListener('uncapturederror', (ev) => {
      const m = `GPU error: ${(ev as GPUUncapturedErrorEvent).error?.message ?? 'unknown'}`;
      if (!this.error) this.error = m;
      this.emit('error', m);
    });
  }

  on(type: 'lost' | 'error', fn: Listener): () => void {
    this.fns[type].push(fn);
    return () => { this.fns[type] = this.fns[type].filter((f) => f !== fn); };
  }
  private emit(type: 'lost' | 'error', m: string): void { for (const f of this.fns[type]) { try { f(m); } catch { /* a listener's own failure */ } } }

  /** The reason the device cannot be used, or null. */
  get failure(): string | null { return this.lost ?? this.error; }
  /** Waits up to `ms` for a loss that is under way to be reported (an aborted map comes before device.lost). */
  async settle(ms = 300): Promise<void> {
    if (this.lost) return;
    await Promise.race([this.lostP, new Promise((r) => setTimeout(r, ms))]);
  }
  destroy(): void { this.device.destroy(); }
}

export type GpuAcquire = { ok: true; ctx: GpuContext } | { ok: false; reason: string };

/** The adapter and device of §9.4: high-performance, the adapter's maxBufferSize and maxStorageBufferBindingSize as
 *  required limits, no optional features. `gpu` defaults to navigator.gpu (pass null or a stub to test the fallback). */
export async function acquireGpu(opt: { gpu?: GPU | null } = {}): Promise<GpuAcquire> {
  const gpu = opt.gpu !== undefined ? opt.gpu : (globalThis as { navigator?: { gpu?: GPU } }).navigator?.gpu;
  if (!gpu) return { ok: false, reason: 'This browser has no WebGPU.' };
  let adapter: GPUAdapter | null = null;
  try { adapter = await gpu.requestAdapter({ powerPreference: 'high-performance' }); } catch { adapter = null; }
  if (!adapter) return { ok: false, reason: 'WebGPU found no GPU adapter.' };
  const ai = adapter.info as GPUAdapterInfo & { isFallbackAdapter?: boolean };
  const fallback = !!(ai?.isFallbackAdapter ?? (adapter as GPUAdapter & { isFallbackAdapter?: boolean }).isFallbackAdapter);
  if (fallback) return { ok: false, reason: 'WebGPU offers only a software adapter.' };
  const al = adapter.limits;
  let device: GPUDevice;
  try {
    device = await adapter.requestDevice({ requiredLimits: { maxBufferSize: al.maxBufferSize, maxStorageBufferBindingSize: al.maxStorageBufferBindingSize } });
  } catch (e) {
    return { ok: false, reason: `The GPU device could not be made (${(e as Error)?.message ?? e}).` };
  }
  const dl = device.limits;
  const limits: GpuLimits = {
    maxBufferSize: dl.maxBufferSize, maxStorageBufferBindingSize: dl.maxStorageBufferBindingSize,
    maxComputeWorkgroupsPerDimension: dl.maxComputeWorkgroupsPerDimension, maxStorageBuffersPerShaderStage: dl.maxStorageBuffersPerShaderStage,
    minUniformBufferOffsetAlignment: dl.minUniformBufferOffsetAlignment,
  };
  return { ok: true, ctx: new GpuContext(device, { vendor: ai?.vendor ?? '', architecture: ai?.architecture ?? '', description: ai?.description ?? '', fallback, limits }) };
}

/** The estimator's environment of a device (§11.4). */
export function gpuEnv(info: GpuInfo, mobile = false): Env {
  return { backend: 'webgpu', maxBufferSize: info.limits.maxBufferSize, maxStorageBufferBindingSize: info.limits.maxStorageBufferBindingSize, mobile };
}

/** Why a problem of this estimate does not fit the device's limits (null when it fits): the field buffers against
 *  maxBufferSize and the binding size; the kernels bind at most 6 storage buffers. */
export function gpuMisfit(est: Estimate, lim: GpuLimits): string | null {
  const mb = (x: number) => `${(x / MiB).toFixed(0)} MiB`;
  if (est.largestBuffer > lim.maxBufferSize) return `a field buffer of ${mb(est.largestBuffer)} is over the GPU's largest buffer (${mb(lim.maxBufferSize)})`;
  if (est.largestBuffer > lim.maxStorageBufferBindingSize) return `a field buffer of ${mb(est.largestBuffer)} is over the GPU's largest binding (${mb(lim.maxStorageBufferBindingSize)})`;
  if (lim.maxStorageBuffersPerShaderStage < 6) return `the GPU allows ${lim.maxStorageBuffersPerShaderStage} storage buffers per shader, the kernels need 6`;
  return null;
}

// ---------------------------------------------------------------- the runner (one problem's buffers and pipelines)

interface Op { pipe: GPUComputePipeline; bg: GPUBindGroup; off: number; n: [number, number, number] }
/** Splits `groups` workgroups into parts of at most `max`: [offset, count]. */
export function splitGroups(groups: number, max: number): [number, number][] {
  const out: [number, number][] = [];
  for (let o = 0; o < groups; o += max) out.push([o, Math.min(max, groups - o)]);
  return out;
}

export interface RunnerOptions {
  maxWorkgroups?: number; // per dimension (default the device's; smaller forces split dispatches, harness)
  ring?: number; // record rows (default RING_ROWS)
}

export class GpuRunner {
  /** Steps per submit (§9.3), set from the calibration. */
  perSubmit = 20;
  dispatches = 0; // per ordinary step
  splits = 0; // dispatches beyond one per kernel (split to the limit)
  readonly ring: number;
  private buffers: GPUBuffer[] = [];
  private B!: Record<'G' | 'D' | 'E' | 'H' | 'CA' | 'CB' | 'L' | 'PSI' | 'T' | 'CUTS' | 'HCUTS' | 'WP' | 'EN' | 'ST' | 'META' | 'REC', GPUBuffer>;
  private wave: GPUBuffer | null = null; private waveLen = 0;
  private gidx: GPUBuffer | null = null; private snapBuf: GPUBuffer | null = null; private stage: GPUBuffer | null = null;
  private stageBytes = 0;
  private ngather = 0; private frameSlots = 0; private snapFor: SnapRecorder | null = null;
  private pre: Op[] = []; private eNorm: Op[] = []; private eMon: Op[] = []; private psiE: Op[] = []; private cutE: Op[] = [];
  private reduce: Op[] = []; private post!: Op; private gathers: Op[][] = [];
  private pipes!: Record<string, GPUComputePipeline>;
  private layouts!: Record<string, GPUBindGroupLayout>;
  private g: Uint32Array;
  private metaLen: number;
  readonly nprobe: number;
  private active: GpuLoop | null = null;

  private constructor(readonly ctx: GpuContext, readonly p: Problem, readonly probes: ProbeLayout, private opt: RunnerOptions) {
    this.ring = opt.ring ?? RING_ROWS;
    this.nprobe = probes.off.length - 1;
    this.g = new Uint32Array(K.G_FIELDS.length);
    const srcMax = p.ports.reduce((a, q) => a + q.edges.length, 0);
    this.metaLen = 3 * srcMax + (this.nprobe + 1) + this.nprobe + 2 * probes.idx.length;
  }

  /** Uploads a problem (f32) and compiles the kernels; throws GpuError on failure. */
  static async create(ctx: GpuContext, p: Problem, probes: ProbeLayout, opt: RunnerOptions = {}): Promise<GpuRunner> {
    if (p.precision !== 'f32') throw new GpuError('The GPU runs f32 problems only.');
    if (ctx.failure) throw new GpuError(ctx.failure, !!ctx.lost);
    const r = new GpuRunner(ctx, p, probes, opt);
    const d = ctx.device;
    d.pushErrorScope('out-of-memory');
    d.pushErrorScope('validation');
    let pipesErr: unknown = null;
    try { await r.build(); } catch (e) { pipesErr = e; }
    const val = await d.popErrorScope(), oom = await d.popErrorScope();
    if (pipesErr || val || oom) {
      r.destroy();
      const m = oom ? `the GPU is out of memory (${oom.message})` : val ? val.message : String((pipesErr as Error)?.message ?? pipesErr);
      await ctx.settle(50);
      throw new GpuError(ctx.lost ?? `The GPU run could not be set up: ${m}`, !!ctx.lost);
    }
    return r;
  }

  private buf(size: number, usage: number, data?: ArrayBufferView): GPUBuffer {
    const b = this.ctx.device.createBuffer({ size: Math.max(16, Math.ceil(size / 4) * 4), usage, mappedAtCreation: !!data });
    if (data) { new Uint8Array(b.getMappedRange()).set(new Uint8Array(data.buffer, data.byteOffset, data.byteLength)); b.unmap(); }
    this.buffers.push(b);
    HELD.add(b);
    return b;
  }

  private async build(): Promise<void> {
    const p = this.p, d = this.ctx.device, { nx, ny, nz, N } = p, S = nx + ny + nz;
    const f32 = (a: ArrayLike<number>) => (a instanceof Float32Array ? a : Float32Array.from(a));
    const SRW = BU.STORAGE | BU.COPY_DST | BU.COPY_SRC;
    // L: [kE | kH | dE | dH | len | dual] (cpu.ts CpuLoop's dE, dH, len, dual)
    const L = new Float32Array(6 * S);
    L.set(f32(p.lines), 0);
    const c0dt = C0_MM * p.dt;
    let o = 0;
    for (const a of [p.gx, p.gy, p.gz]) {
      const n = a.length;
      for (let i = 0; i < n; i++) {
        L[2 * S + o + i] = c0dt / (i >= 1 && i <= n - 2 ? (a[i + 1] - a[i - 1]) / 2 : a[1] - a[0]);
        L[3 * S + o + i] = c0dt / (i <= n - 2 ? a[i + 1] - a[i] : a[n - 1] - a[n - 2]);
        L[4 * S + o + i] = i <= n - 2 ? a[i + 1] - a[i] : 0;
        L[5 * S + o + i] = i >= 1 && i <= n - 2 ? (a[i + 1] - a[i - 1]) / 2 : 0;
      }
      o += n;
    }
    // CPML: ψ and tables concatenated (offsets per array)
    const psiOff: number[] = [], tabOff: number[] = [];
    let np = 0, nt = 0;
    for (const a of p.cpml.psi) { psiOff.push(np); np += a.length; }
    const T = new Float32Array(Math.max(1, p.cpml.coef.reduce((s, a) => s + a.length, 0)));
    for (const a of p.cpml.coef) { tabOff.push(nt); T.set(f32(a), nt); nt += a.length; }
    // conformal edges: [edge | f | weight | saved]
    const { cut, frac, ca, cb } = p.mat, nc = cut.length;
    const CU = new Uint32Array(Math.max(4, 4 * nc));
    const CF = new Float32Array(CU.buffer);
    const lenA = [0, 1, 2].map((a) => L.subarray(4 * S + [0, nx, nx + ny][a], 4 * S + [0, nx, nx + ny][a] + [nx, ny, nz][a]));
    const dualA = [0, 1, 2].map((a) => L.subarray(5 * S + [0, nx, nx + ny][a], 5 * S + [0, nx, nx + ny][a] + [nx, ny, nz][a]));
    for (let q = 0; q < nc; q++) {
      const e = cut[q], a = Math.floor(e / N), c = e - a * N;
      const i = c % nx, j = Math.floor(c / nx) % ny, k = Math.floor(c / (nx * ny));
      const lx = a === 0 ? lenA[0][i] : dualA[0][i], ly = a === 1 ? lenA[1][j] : dualA[1][j], lz = a === 2 ? lenA[2][k] : dualA[2][k];
      CU[q] = e; CF[nc + q] = frac[q];
      CF[2 * nc + q] = cb[e] > 0 ? ((1 + ca[e]) / (2 * cb[e])) * lx * ly * lz * (frac[q] - 1) : 0;
    }
    // H faces with an area fraction: [face | 1/A | weight | saved]
    const { hcut, harea } = p.mat, nh = hcut.length;
    const HU = new Uint32Array(Math.max(4, 4 * nh));
    const HF = new Float32Array(HU.buffer);
    for (let q = 0; q < nh; q++) {
      const h = hcut[q], a = Math.floor(h / N), c = h - a * N;
      const i = c % nx, j = Math.floor(c / nx) % ny, k = Math.floor(c / (nx * ny));
      const lx = a === 0 ? dualA[0][i] : lenA[0][i], ly = a === 1 ? dualA[1][j] : lenA[1][j], lz = a === 2 ? dualA[2][k] : lenA[2][k];
      HU[q] = h; HF[nh + q] = 1 / harea[q]; HF[2 * nh + q] = lx * ly * lz * (harea[q] - 1);
    }
    // dispatch geometry
    const maxDim = Math.max(1, this.opt.maxWorkgroups ?? this.ctx.info.limits.maxComputeWorkgroupsPerDimension);
    const gx = Math.ceil(nx / K.WG_X), gy = Math.ceil(ny / K.WG_Y), gz = nz;
    const cutGroups = Math.ceil(nc / K.WG_1D);
    const hcutGroups = Math.ceil(nh / K.WG_1D);
    const partials = gx * gy * gz + cutGroups + hcutGroups;
    // slots of the dynamic uniform: [o, s, a, p, q, t0, t1] as u32 ×4 each
    const slots: Uint32Array[] = [];
    const slot = (v: number[][]) => { const u = new Uint32Array(K.SLOT / 4); v.forEach((x, r) => u.set(x, 4 * r)); slots.push(u); return (slots.length - 1) * K.SLOT; };
    const main: { off: number; n: [number, number, number] }[] = [];
    for (const [ox, cx] of splitGroups(gx, maxDim)) for (const [oy, cy] of splitGroups(gy, maxDim)) for (const [oz, cz] of splitGroups(gz, maxDim)) {
      main.push({ off: slot([[ox, oy, oz, 0], [gx, gy, 0, 0]]), n: [cx, cy, cz] });
    }
    const cutParts = splitGroups(cutGroups, maxDim).map(([o1, c1]) => ({ off: slot([[o1, 0, 0, 0], [0, 0, 0, gx * gy * gz]]), n: [c1, 1, 1] as [number, number, number] }));
    const hcutParts = splitGroups(hcutGroups, maxDim).map(([o1, c1]) => ({ off: slot([[o1, 0, 0, 0], [0, 0, 0, gx * gy * gz + cutGroups]]), n: [c1, 1, 1] as [number, number, number] }));
    // ψ: per open axis, E and H, both slabs in one dispatch
    const cells = [p.cpml.x.cells, p.cpml.y.cells, p.cpml.z.cells], n3 = [nx, ny, nz];
    const psiParts: { axis: 0 | 1 | 2; h: boolean; off: number; n: [number, number, number] }[] = [];
    let ps = 0, ts = 0;
    for (let a = 0; a < 3; a++) {
      const m = cells[a];
      if (!m) continue;
      const nt8 = a < 2 ? 8 : 4;
      const tab = tabOff.slice(ts, ts + nt8); ts += nt8;
      const lo = psiOff.slice(ps, ps + 4), hi = psiOff.slice(ps + 4, ps + 8); ps += 8;
      const na = n3[a];
      const across = a === 0 ? (ny - 1) * (nz - 1) : a === 1 ? (nx - 1) * (nz - 1) : (nx - 1) * (ny - 1);
      const per = m * across;
      const t0 = [tab[0], tab[1], tab[2], tab[3]], t1 = a < 2 ? [tab[4], tab[5], tab[6], tab[7]] : [0, 0, 0, 0];
      for (const h of [false, true]) {
        const a1 = h ? [m, 1, na - 1 - m, per] : [m, 1, na - m, per];
        for (const [o1, c1] of splitGroups(Math.ceil((2 * per) / K.WG_1D), maxDim)) {
          psiParts.push({ axis: a as 0 | 1 | 2, h, off: slot([[o1, 0, 0, 0], [0, 0, 0, 0], a1, lo, hi, t0, t1]), n: [c1, 1, 1] });
        }
      }
    }
    const reduceOffs = Array.from({ length: ENERGY_SLOTS }, (_, s) => slot([[0, 0, 0, s], [0, 0, partials, 0]]));
    // gathers: frame slots × parts, written with a snapshot plan (setSnap) after these slots
    const DU = new Uint8Array(Math.max(1, slots.length + 64 * 64) * K.SLOT); // room for gather slots (≤ 64 frames × 64 parts)
    slots.forEach((u, q) => DU.set(new Uint8Array(u.buffer), q * K.SLOT));

    // buffers
    const g = this.g, gi = (f: (typeof K.G_FIELDS)[number], v: number) => { g[K.G_FIELDS.indexOf(f)] = v; };
    const pr = this.probes, np2 = this.nprobe, srcMax = (this.metaLen - (np2 + 1) - np2 - 2 * pr.idx.length) / 3;
    gi('nx', nx); gi('ny', ny); gi('nz', nz); gi('N', N); gi('S', S); gi('nprobe', np2); gi('ring', this.ring);
    gi('oSw', srcMax); gi('oWave', 2 * srcMax); gi('oOff', 3 * srcMax); gi('oOnH', 3 * srcMax + np2 + 1); gi('oPidx', 3 * srcMax + 2 * np2 + 1);
    gi('oPco', 3 * srcMax + 2 * np2 + 1 + pr.idx.length); gi('ncut', nc); gi('nhcut', nh);
    const meta = new Uint32Array(Math.max(4, this.metaLen)), metaF = new Float32Array(meta.buffer);
    meta.set(pr.off, g[K.G_FIELDS.indexOf('oOff')]);
    meta.set(pr.onH, g[K.G_FIELDS.indexOf('oOnH')]);
    meta.set(pr.idx, g[K.G_FIELDS.indexOf('oPidx')]);
    metaF.set(f32(pr.coef), g[K.G_FIELDS.indexOf('oPco')]);
    this.B = {
      G: this.buf(g.byteLength, BU.UNIFORM | BU.COPY_DST, g),
      D: this.buf(DU.byteLength, BU.UNIFORM | BU.COPY_DST, DU),
      E: this.buf(12 * N, SRW), H: this.buf(12 * N, SRW),
      CA: this.buf(12 * N, BU.STORAGE, f32(ca)), CB: this.buf(12 * N, BU.STORAGE, f32(cb)),
      L: this.buf(L.byteLength, BU.STORAGE, L),
      PSI: this.buf(4 * Math.max(1, np), SRW), T: this.buf(T.byteLength, BU.STORAGE, T),
      CUTS: this.buf(CU.byteLength, BU.STORAGE, CU), HCUTS: this.buf(HU.byteLength, BU.STORAGE, HU),
      WP: this.buf(4 * Math.max(1, partials), SRW), EN: this.buf(4 * ENERGY_SLOTS, SRW),
      ST: this.buf(16, SRW), META: this.buf(meta.byteLength, BU.STORAGE | BU.COPY_DST, meta),
      REC: this.buf(4 * this.ring * Math.max(1, np2), SRW),
    };
    // layouts: u uniform, d dynamic uniform, r read-only storage, w storage, - none
    const layout = (spec: string): GPUBindGroupLayout => d.createBindGroupLayout({
      entries: [...spec].flatMap((ch, binding) => ch === '-' ? [] : [{
        binding, visibility: COMPUTE,
        buffer: ch === 'u' ? { type: 'uniform' as const } : ch === 'd' ? { type: 'uniform' as const, hasDynamicOffset: true, minBindingSize: 112 } : { type: ch === 'r' ? 'read-only-storage' as const : 'storage' as const },
      }]),
    });
    const L8 = this.layouts = {
      H: layout('udrwr'), E: layout('udwrrrr'), EMON: layout('udwrrrrw'), PE: layout('udwrrrwr'), PH: layout('udrwrrwr'),
      CUT: layout('udwww'), RED: layout('udrw'), POST: layout('u-wrwrrw'), GATH: layout('udrrw'),
    };
    const mk = (lay: GPUBindGroupLayout, code: string, entryPoint = 'main') => d.createComputePipelineAsync({
      layout: d.createPipelineLayout({ bindGroupLayouts: [lay] }), compute: { module: d.createShaderModule({ code }), entryPoint },
    });
    const names: [string, GPUBindGroupLayout, string, string?][] = [
      ['H', L8.H, K.WGSL_H], ['E', L8.E, K.WGSL_E], ['EMON', L8.EMON, K.WGSL_EMON],
      ['PE0', L8.PE, K.wgslPsiE(0)], ['PE1', L8.PE, K.wgslPsiE(1)], ['PE2', L8.PE, K.wgslPsiE(2)],
      ['PH0', L8.PH, K.wgslPsiH(0)], ['PH1', L8.PH, K.wgslPsiH(1)], ['PH2', L8.PH, K.wgslPsiH(2)],
      ['SCALE', L8.CUT, K.WGSL_CUT, 'scale'], ['RESTORE', L8.CUT, K.WGSL_CUT, 'restore'], ['CUTW', L8.CUT, K.WGSL_CUT, 'energy'],
      ['HSAVE', L8.CUT, K.WGSL_HCUT, 'save'], ['HAPPLY', L8.CUT, K.WGSL_HCUT, 'apply'], ['HCUTW', L8.CUT, K.WGSL_HCUT, 'energy'],
      ['RED', L8.RED, K.WGSL_REDUCE], ['POST', L8.POST, K.WGSL_POST], ['GATH', L8.GATH, K.WGSL_GATHER],
    ];
    const built = await Promise.all(names.map(([, lay, code, ep]) => mk(lay, code, ep)));
    this.pipes = Object.fromEntries(names.map(([n], q) => [n, built[q]]));
    const B = this.B;
    const bg = (lay: GPUBindGroupLayout, bufs: (GPUBuffer | null)[]) => d.createBindGroup({
      layout: lay,
      entries: bufs.flatMap((b, binding) => (b ? [{ binding, resource: binding === 1 ? { buffer: b, size: 112 } : { buffer: b } }] : [])),
    });
    const P = this.pipes;
    const bH = bg(L8.H, [B.G, B.D, B.E, B.H, B.L]);
    const bE = bg(L8.E, [B.G, B.D, B.E, B.H, B.CA, B.CB, B.L]);
    const bM = bg(L8.EMON, [B.G, B.D, B.E, B.H, B.CA, B.CB, B.L, B.WP]);
    const bPE = bg(L8.PE, [B.G, B.D, B.E, B.H, B.CB, B.L, B.PSI, B.T]);
    const bPH = bg(L8.PH, [B.G, B.D, B.E, B.H, B.CB, B.L, B.PSI, B.T]);
    const bC = bg(L8.CUT, [B.G, B.D, B.E, B.CUTS, B.WP]);
    const bHC = bg(L8.CUT, [B.G, B.D, B.H, B.HCUTS, B.WP]);
    const bR = bg(L8.RED, [B.G, B.D, B.WP, B.EN]);
    this.postBg = (wave: GPUBuffer) => bg(L8.POST, [B.G, null, B.E, B.H, B.ST, wave, B.META, B.REC]); // WAVE per excitation
    const ops = (pipe: GPUComputePipeline, b: GPUBindGroup, list: { off: number; n: [number, number, number] }[]): Op[] => list.map((x) => ({ pipe, bg: b, off: x.off, n: x.n }));
    const cutOps = (name: string) => (nc ? ops(P[name], bC, cutParts) : []);
    const psiOf = (h: boolean) => psiParts.filter((x) => x.h === h).map((x) => ({ pipe: P[(h ? 'PH' : 'PE') + x.axis], bg: h ? bPH : bPE, off: x.off, n: x.n }));
    const hcutOps = (name: string) => (nh ? ops(P[name], bHC, hcutParts) : []);
    this.pre = [...cutOps('SCALE'), ...hcutOps('HSAVE'), ...ops(P.H, bH, main), ...psiOf(true), ...hcutOps('HAPPLY'), ...cutOps('RESTORE')];
    this.psiE = psiOf(false);
    this.eNorm = [...ops(P.E, bE, main), ...this.psiE];
    this.cutE = [...cutOps('CUTW'), ...hcutOps('HCUTW')];
    this.eMon = [...ops(P.EMON, bM, main), ...this.cutE, ...this.psiE];
    this.reduce = reduceOffs.map((off) => ({ pipe: P.RED, bg: bR, off, n: [1, 1, 1] }));
    this.dispatches = this.pre.length + this.eNorm.length + 1;
    const kernels = (nc ? 2 : 0) + (nh ? 2 : 0) + 3 + new Set(psiParts.map((x) => `${x.axis}${x.h}`)).size;
    this.splits = this.dispatches - kernels;
    this.slotsUsed = slots.length; this.maxDim = maxDim;
  }
  private postBg!: (wave: GPUBuffer) => GPUBindGroup;
  private slotsUsed = 0; private maxDim = 1;

  /** Sets up the snapshot gathers of a recorder (indices into E) and its frame slots. */
  private setSnap(snap: SnapRecorder | null): void {
    if (snap === this.snapFor) return;
    this.snapFor = snap;
    this.gathers = [];
    if (!snap) return;
    const idx = snap.gatherIndex();
    const ng = idx.length;
    this.ngather = ng;
    this.frameSlots = Math.max(1, Math.min(64, Math.floor(FRAME_BYTES / Math.max(4, 4 * ng))));
    drop(this.gidx); drop(this.snapBuf);
    this.gidx = this.buf(4 * ng, BU.STORAGE, Uint32Array.from(idx));
    this.snapBuf = this.buf(4 * ng * this.frameSlots, BU.STORAGE | BU.COPY_SRC);
    const parts = splitGroups(Math.ceil(ng / K.WG_1D), this.maxDim);
    if (this.frameSlots * parts.length > 64 * 64) throw new GpuError('Too many snapshot dispatches for the forced workgroup limit.');
    const d = this.ctx.device, B = this.B;
    const bG = d.createBindGroup({ layout: this.layouts.GATH, entries: [{ binding: 0, resource: { buffer: B.G } }, { binding: 1, resource: { buffer: B.D, size: 112 } }, { binding: 2, resource: { buffer: B.E } }, { binding: 3, resource: { buffer: this.gidx } }, { binding: 4, resource: { buffer: this.snapBuf } }] });
    let q = this.slotsUsed;
    const upd = new Uint8Array(this.frameSlots * parts.length * K.SLOT);
    for (let f = 0; f < this.frameSlots; f++) {
      const list: Op[] = [];
      for (const [o1, c1] of parts) {
        const u = new Uint32Array(K.SLOT / 4); u.set([o1, 0, 0, f], 0);
        upd.set(new Uint8Array(u.buffer), (q - this.slotsUsed) * K.SLOT);
        list.push({ pipe: this.pipes.GATH, bg: bG, off: q * K.SLOT, n: [c1, 1, 1] });
        q++;
      }
      this.gathers.push(list);
    }
    d.queue.writeBuffer(B.D, this.slotsUsed * K.SLOT, upd);
  }

  private ensureStage(bytes: number): GPUBuffer {
    if (this.stage && this.stageBytes >= bytes) return this.stage;
    drop(this.stage);
    this.stageBytes = Math.ceil(bytes / 256) * 256;
    this.stage = this.ctx.device.createBuffer({ size: this.stageBytes, usage: BU.MAP_READ | BU.COPY_DST });
    this.buffers.push(this.stage);
    HELD.add(this.stage);
    return this.stage;
  }

  /** A loop for one excitation (the previous one of this runner ends). */
  loop(o: AsyncLoopOptions): GpuLoop {
    if (this.active) this.active.status = this.active.status === 'running' ? 'done' : this.active.status;
    const l = new GpuLoop(this, o);
    this.active = l;
    return l;
  }
  /** The factory run.ts's Excitation takes (`backend`). */
  factory(): LoopFactory { return (_p, o) => this.loop(o); }

  /** Zeroes the fields and state, writes the sources and their waves (t = (n + ½)·Δt in f64), the snapshot plan. */
  reset(o: AsyncLoopOptions): void {
    const p = this.p, d = this.ctx.device, B = this.B;
    if (this.ctx.failure) throw new GpuError(this.ctx.failure, !!this.ctx.lost);
    // sources: merge edges per wave
    const waves: Source['wave'][] = [];
    const map = new Map<string, number>();
    const edges: number[] = [], ws: number[] = [], wid: number[] = [];
    for (const s of o.sources) {
      let k = waves.indexOf(s.wave);
      if (k < 0) { waves.push(s.wave); k = waves.length - 1; }
      for (let q = 0; q < s.idx.length; q++) {
        const key = `${k}:${s.idx[q]}`;
        const at = map.get(key);
        if (at !== undefined) ws[at] += s.w[q];
        else { map.set(key, edges.length); edges.push(s.idx[q]); ws.push(s.w[q]); wid.push(k); }
      }
    }
    const len = o.maxSteps + 1;
    if (!this.wave || this.waveLen < len * Math.max(1, waves.length)) {
      drop(this.wave);
      this.waveLen = len * Math.max(1, waves.length);
      this.wave = this.buf(4 * this.waveLen, BU.STORAGE | BU.COPY_DST);
    }
    const W = new Float32Array(len * Math.max(1, waves.length));
    waves.forEach((f, k) => { for (let n = 0; n < len; n++) W[k * len + n] = f((n + 0.5) * p.dt); });
    d.queue.writeBuffer(this.wave, 0, W);
    const gi = (f: (typeof K.G_FIELDS)[number]) => K.G_FIELDS.indexOf(f);
    const ns = edges.length, srcMax = this.g[gi('oSw')];
    if (ns > srcMax) throw new GpuError('More source edges than the ports have.');
    const mu = new Uint32Array(3 * srcMax || 1), mf = new Float32Array(mu.buffer);
    mu.set(edges, 0); mf.set(ws, srcMax); mu.set(wid, 2 * srcMax);
    d.queue.writeBuffer(B.META, 0, mu);
    this.g[gi('nsrc')] = ns; this.g[gi('nwave')] = len;
    this.setSnap(o.snap);
    this.g[gi('ngather')] = this.ngather;
    d.queue.writeBuffer(B.G, 0, this.g);
    this.post = { pipe: this.pipes.POST, bg: this.postBg(this.wave), off: -1, n: [1, 1, 1] };
    const enc = d.createCommandEncoder();
    for (const b of [B.E, B.H, B.PSI, B.ST, B.REC, B.EN, B.WP]) enc.clearBuffer(b);
    d.queue.submit([enc.finish()]);
  }

  /** Encodes the dispatches of one step (`mon`: the energy sum into ring slot `eslot`; `fslot` ≥ 0: a frame). */
  encodeStep(pass: GPUComputePassEncoder, mon: boolean, eslot: number, fslot: number): void {
    const run = (ops: Op[]) => {
      for (const o of ops) {
        pass.setPipeline(o.pipe);
        if (o.off >= 0) pass.setBindGroup(0, o.bg, [o.off]); else pass.setBindGroup(0, o.bg);
        pass.dispatchWorkgroups(o.n[0], o.n[1], o.n[2]);
      }
    };
    run(this.pre);
    if (mon) { run(this.eMon); run([this.reduce[eslot]]); } else run(this.eNorm);
    run([this.post]);
    if (fslot >= 0) run(this.gathers[fslot]);
  }

  get frameCapacity(): number { return this.frameSlots; }
  get gatherCount(): number { return this.ngather; }
  get buffersB(): Record<string, GPUBuffer> { return this.B; }
  get snapBuffer(): GPUBuffer | null { return this.snapBuf; }
  stageFor(bytes: number): GPUBuffer { return this.ensureStage(bytes); }

  /** Reads E or H back (the harness). */
  async readField(which: 'E' | 'H'): Promise<Float32Array> {
    const d = this.ctx.device, src = this.B[which], size = src.size;
    const rb = d.createBuffer({ size, usage: BU.MAP_READ | BU.COPY_DST });
    const enc = d.createCommandEncoder(); enc.copyBufferToBuffer(src, 0, rb, 0, size); d.queue.submit([enc.finish()]);
    await rb.mapAsync(MAP_READ);
    const out = new Float32Array(rb.getMappedRange().slice(0));
    rb.unmap(); rb.destroy();
    return out;
  }

  /** Frees the buffers (the device stays). */
  destroy(): void {
    for (const b of this.buffers) { HELD.delete(b); try { b.destroy(); } catch { /* lost already */ } }
    this.buffers = [];
  }
}

// ---------------------------------------------------------------- one excitation

export class GpuLoop implements AsyncLoop {
  step = 0;
  status: LoopStatus = 'running';
  readonly energy: [number, number][] = [];
  wMax = 0;
  wMinAfter = Infinity;
  /** ms of the last `advance`'s GPU work (first submit to the last one done) and in all. */
  lastWorkMs = 0;
  private every = MONITOR_EVERY;

  constructor(private r: GpuRunner, private o: AsyncLoopOptions) {
    r.reset(o);
  }

  private fail(e: unknown): never {
    const c = this.r.ctx;
    if (e instanceof GpuError) throw e;
    throw new GpuError(c.failure ?? `GPU run failed: ${(e as Error)?.message ?? e}`, !!c.lost);
  }

  /** Up to `steps` steps; rows of the steps done go to `rec` from row `row` (RECORD values per port each), frames to
   *  `snap`. Resolves with the steps done; throws GpuError when the device is lost or fails. */
  async advance(steps: number, rec: Float64Array, row: number, snap: SnapRecorder | null): Promise<number> {
    if (this.status !== 'running') return 0;
    const r = this.r, c = r.ctx;
    if (c.failure) this.fail(new GpuError(c.failure, !!c.lost));
    const t0 = this.step, cap = this.o.maxSteps, every = this.every;
    let n = Math.min(steps, cap - t0, r.ring - 1, ENERGY_SLOTS * every);
    if (steps <= 0) return 0;
    if (n <= 0) { this.status = 'done'; return 0; }
    // frames inside this call (at most the slots)
    const frames: { step: number; slot: number }[] = [];
    if (snap && r.frameCapacity) {
      const pl = snap.plan;
      for (let s = t0 + 1; s <= t0 + n; s++) {
        if (s % pl.every || snap.count + frames.length >= pl.frames) continue;
        frames.push({ step: s, slot: frames.length });
        if (frames.length === r.frameCapacity) { n = s - t0; break; }
      }
    }
    const np = r.nprobe, R = r.ring, ng = r.gatherCount;
    const recBytes = 4 * n * np, enBytes = 4 * ENERGY_SLOTS, frBytes = 4 * ng * frames.length;
    const stage = r.stageFor(recBytes + enBytes + frBytes);
    const d = c.device;
    const mons: { step: number; slot: number }[] = [];
    const tw = now();
    try {
      const inflight: Promise<void>[] = [];
      let s = t0, f = 0;
      while (s < t0 + n) {
        const k = Math.min(r.perSubmit, t0 + n - s);
        const enc = d.createCommandEncoder();
        const pass = enc.beginComputePass();
        for (let q = 0; q < k; q++) {
          const no = s + 1;
          const mon = every > 0 && no % every === 0;
          if (mon) mons.push({ step: no, slot: mons.length });
          const fr = f < frames.length && frames[f].step === no ? frames[f++].slot : -1;
          r.encodeStep(pass, mon, mon ? mons.length - 1 : 0, fr);
          s++;
        }
        pass.end();
        if (s >= t0 + n) {
          // record rows t0 + 1 … t0 + n of the ring (one or two copies), the energies, the frames
          const B = r.buffersB, a = (t0 + 1) % R, b = a + n;
          if (b <= R) enc.copyBufferToBuffer(B.REC, 4 * a * np, stage, 0, recBytes);
          else {
            enc.copyBufferToBuffer(B.REC, 4 * a * np, stage, 0, 4 * (R - a) * np);
            enc.copyBufferToBuffer(B.REC, 0, stage, 4 * (R - a) * np, 4 * (b - R) * np);
          }
          enc.copyBufferToBuffer(B.EN, 0, stage, recBytes, enBytes);
          if (frBytes) enc.copyBufferToBuffer(r.snapBuffer!, 0, stage, recBytes + enBytes, frBytes);
        }
        d.queue.submit([enc.finish()]);
        inflight.push(d.queue.onSubmittedWorkDone());
        if (inflight.length >= 2) await inflight.shift();
      }
      await Promise.all(inflight);
      this.lastWorkMs = now() - tw;
      if (c.failure) throw new GpuError(c.failure, !!c.lost);
      await stage.mapAsync(MAP_READ, 0, recBytes + enBytes + frBytes);
    } catch (e) {
      await c.settle();
      this.fail(e);
    }
    const all = new Float32Array(stage.getMappedRange(0, recBytes + enBytes + frBytes).slice(0));
    stage.unmap();
    const en = all.subarray(n * np, n * np + ENERGY_SLOTS);
    // the stop and stability rules, in order: the run ends at the first monitor that leaves 'running'
    let end = t0 + n;
    for (const m of mons) {
      judgeEnergy(this, m.step, en[m.slot], r.p.dt, { sourceEnd: this.o.sourceEnd, stopDb: this.o.stopDb, sources: this.o.sources.length > 0 });
      if (this.status !== 'running') { end = m.step; break; }
    }
    for (let s = t0 + 1; s <= end; s++) {
      const src = (s - t0 - 1) * np, dst = (row + s - t0 - 1) * np;
      for (let q = 0; q < np; q++) rec[dst + q] = all[src + q];
    }
    if (snap) {
      const fb = n * np + ENERGY_SLOTS;
      for (const fr of frames) if (fr.step <= end) snap.takeGathered(all.subarray(fb + fr.slot * ng, fb + (fr.slot + 1) * ng), fr.step, r.p.dt);
    }
    this.step = end;
    if (this.status === 'running' && this.step >= cap) this.status = 'done';
    return end - t0;
  }

  release(): void { /* the runner owns the buffers */ }
}

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/** K steps per submit from a measured time per step (§9.3). */
export function perSubmitOf(stepMs: number): number {
  return Math.max(K_MIN, Math.min(K_MAX, Math.floor(SUBMIT_MS / Math.max(stepMs, 1e-6))));
}
