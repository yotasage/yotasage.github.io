// The full-wave worker's protocol and work (steps M6.2b and M6.3, engine.md §10, fullwave.md §7, §9, §11), framework-
// free: the worker (fdtd.worker.ts) wires `createFdtdHandler` to its messages, the client (fdtdClient.ts) runs the
// same handler on the page when no worker can be made, and the harness calls it directly.
//
// One run at a time: a new 'run' cancels the running one (it answers 'cancelled'). A run builds the problem's mesh and
// estimate, chooses the backend (WebGPU when the adapter is there, the run is f32 and fits the device's limits; else
// the CPU, said in a 'backend' message with the reason), calibrates the backend on the real problem once per session
// and mesh size (fullwave.md §11.2: 10 + 30 steps, the estimate the calibrated time × 1.1; again when the mesh is 4×
// larger or smaller than the calibrated one), judges it by §11.4's rules (refused with the reasons and the coarser-
// mesh offer), then steps each excitation in chunks of about CHUNK_MS (the GPU's chunk is a number of steps from the
// calibration), yielding between chunks through `schedule` so a 'cancel' gets in; after each chunk it posts progress
// (step of the cap, elapsed and estimated remaining ms, the energy level) with the new record rows and the snapshot
// frames taken since (both transferred). When the GPU device is lost or fails, the excitation under way restarts on
// the CPU (fullwave.md §9.3) after a 'backend' message with `restart` (that run's rows and frames sent so far are void)
// and the session stays on the CPU; the CPU's own calibration and §11.4 then decide whether the run goes on.
// The result holds the records (to post-process again at another rise time), the N-port, the TDRs at the asked rise
// times, the feeds' εeff, the backend of each excitation and the run's notes.
//
//   page → worker: { type: 'run', id, job: FdtdJob } | { type: 'cancel', id }
//   worker → page: 'backend' { backend, reason, adapter?, restart? } | 'refused' { verdicts, offer, notes }
//                  | 'started' { info } | 'progress' { …FdtdProgress } | 'done' { result: FdtdResult }
//                  | 'error' { message } | 'cancelled'

import { allocateBuilt, buildProblem, judge } from './problem';
import type { Built, Problem } from './problem';
import type { ModelOptions, Note } from './model';
import { OVERHEAD, RATES, rateFromCalibration } from './estimate';
import type { Env, Offer, Verdict } from './estimate';
import { bandOf, calibrate, drivesOf, Excitation, feedEeff, newRecords, nportOf, probeLayout, RECORD, stepsCap, tdrOf } from './run';
import type { Records } from './run';
import { SnapRecorder } from './snapshots';
import type { Frame, SliceInfo, SnapSpec } from './snapshots';
import { acquireGpu, GpuError, gpuEnv, gpuHeld, gpuMisfit, GpuRunner, perSubmitOf } from './gpu';
import type { GpuAcquire, RunnerOptions } from './gpu';
import type { NPort } from '../nport';
import type { TdrResult } from '../tdr';
import type { Setup } from '../setup';

export const CHUNK_MS = 100;
/** A calibration holds for meshes within this factor of its cells (§11.2). */
export const CALIB_RANGE = 4;

export type Backend = 'webgpu' | 'js';
export interface FdtdJob {
  setup: Setup; kind: 'trace' | 'via';
  model?: ModelOptions; // trMin, length, z0 …
  precision?: 'f32' | 'f64'; // f64 runs on the CPU
  backend?: 'auto' | Backend; // default auto: WebGPU when it is there and the run fits
  env?: Env; rate?: number; // the CPU's refusal environment (default JavaScript) and a fixed rate (no calibration)
  mode?: 'full' | 'tdr'; // each port in turn (default), or port 1 alone
  nf?: number; // S-parameter points over 0 … f_S (default 201)
  tr?: number[]; // rise times of the TDRs (default [tr_min])
  snapshots?: SnapSpec | null; // of the first excitation
  maxSteps?: number; stopDb?: number;
}
export interface FdtdInfo {
  cells: number; steps: number; dt: number; runs: number; ports: string[]; seconds: number; slices: SliceInfo[]; every: number; frames: number; snapBytes: number;
  backend: Backend; rate: number; calibrated: boolean; // the estimator's rate (cell updates per second, bare) and whether it was measured
  held: { buffers: number; bytes: number }; // GPU buffers all runners hold once this run's are made (M7.1a: none left by earlier runs)
}
export interface FdtdProgress {
  run: number; runs: number; step: number; steps: number; // the excitation (from 0) and its step of its cap
  elapsed: number; eta: number; // ms
  energyDb: number; // the last energy sum under its maximum (dB, ≤ 0)
  from: number; rows: Float64Array; // record rows from row `from` of this run (RECORD values per port)
  frames: Frame[];
}
export interface FdtdResult {
  records: Records; nport: NPort & { known: boolean[] }; tdr: TdrResult[];
  eeff: ReturnType<typeof feedEeff>;
  status: string[]; steps: number[]; backends: Backend[]; ms: number; notes: Note[];
  snap: { slices: SliceInfo[]; every: number; frames: number; max: number[]; bytes: number } | null;
}
export interface BackendInfo { backend: Backend; reason: string; adapter?: { vendor: string; architecture: string }; restart?: number }
export type FdtdRequest = { type: 'run'; id: number; job: FdtdJob } | { type: 'cancel'; id: number };
export type FdtdReply =
  | ({ type: 'backend'; id: number } & BackendInfo)
  | { type: 'refused'; id: number; verdicts: Verdict[]; offer: Offer | null; notes: Note[] }
  | { type: 'started'; id: number; info: FdtdInfo }
  | ({ type: 'progress'; id: number } & FdtdProgress)
  | { type: 'done'; id: number; result: FdtdResult }
  | { type: 'error'; id: number; message: string }
  | { type: 'cancelled'; id: number };
export interface HandlerOptions {
  gpu?: () => Promise<GpuAcquire>; // default acquireGpu() (navigator.gpu); the harness passes stubs
  runner?: RunnerOptions; // the harness forces small dispatch limits
  mobile?: boolean; // §11.4's phone limits on the GPU
}

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

interface Calibration { cells: number; rate: number; stepMs: number }
interface Current {
  id: number; job: FdtdJob; b: Built | null; p: Problem | null; rec: Records | null; drives: number[][]; run: number; x: Excitation | null;
  snap: SnapRecorder | null; t0: number; sent: number; notes: Note[]; backend: Backend; backends: Backend[];
  runner: GpuRunner | null; chunkSteps: number; busy: boolean;
}

export function createFdtdHandler(post: (msg: FdtdReply, transfer?: ArrayBuffer[]) => void, schedule: (fn: () => void) => void, chunkMs = CHUNK_MS, hopt: HandlerOptions = {}): (req: FdtdRequest) => void {
  let cur: Current | null = null;
  let gpuP: Promise<GpuAcquire> | null = null;
  const cal: Partial<Record<Backend, Calibration>> = {};

  const getGpu = () => (gpuP ??= (hopt.gpu ?? (() => acquireGpu()))().catch((e) => ({ ok: false as const, reason: `WebGPU failed (${(e as Error)?.message ?? e}).` })));
  const live = (c: Current) => cur === c;
  const release = (c: Current) => { if (!c.busy) { c.runner?.destroy(); c.runner = null; } };
  const end = (c: Current) => { if (cur === c) cur = null; release(c); };
  const jsEnv = (j: FdtdJob): Env => j.env ?? { backend: 'js' };
  const fits = (k: Calibration | undefined, cells: number) => !!k && cells <= k.cells * CALIB_RANGE && cells >= k.cells / CALIB_RANGE;
  const refuse = (c: Current, v: { verdicts: Verdict[]; offer: Offer | null }) => { post({ type: 'refused', id: c.id, verdicts: v.verdicts, offer: v.offer, notes: c.notes }); end(c); };

  /** Calibrates the current backend when needed and judges the run; false when refused or dropped. */
  async function prepare(c: Current): Promise<{ rate: number; seconds: number; calibrated: boolean } | null> {
    const j = c.job, b = c.b!, bk = c.backend;
    const env = bk === 'webgpu' && c.runner ? gpuEnv(c.runner.ctx.info, hopt.mobile ?? j.env?.mobile) : jsEnv(j);
    if (j.rate !== undefined) {
      const v = judge(b, env, j.rate);
      if (!v.ok) { refuse(c, v); return null; }
      if (c.runner) { // no calibration: K and the chunk from the given rate
        const stepMs = (1000 * b.est!.cells * OVERHEAD) / j.rate;
        c.runner.perSubmit = perSubmitOf(stepMs);
        c.chunkSteps = Math.max(c.runner.perSubmit, Math.round(chunkMs / Math.max(stepMs, 1e-4)));
      }
      return { rate: j.rate, seconds: v.est.seconds, calibrated: false };
    }
    if (!fits(cal[bk], b.est!.cells)) {
      // before calibrating: refuse at once what the table rate refuses on other grounds than time
      const v0 = judge(b, env, RATES[bk]);
      if (v0.verdicts.some((x) => x.level === 'refuse' && x.code !== 'time')) { refuse(c, v0); return null; }
      const p = allocateBuilt(b, { ...j.model, precision: j.precision ?? 'f32' });
      c.p = p;
      if (bk === 'webgpu' && !c.runner) return null;
      const runner = c.runner;
      const k = await calibrate(p, runner ? runner.factory() : null, runner ? (ms) => { runner.perSubmit = perSubmitOf(ms); } : undefined);
      if (!live(c)) return null;
      cal[bk] = { cells: p.N, rate: k.rate, stepMs: k.stepMs };
    }
    const k = cal[bk]!;
    const rate = rateFromCalibration(k.rate);
    const v = judge(b, env, rate);
    if (!v.ok) { refuse(c, v); return null; }
    if (c.runner) {
      const stepMs = (k.stepMs * b.est!.cells) / k.cells;
      c.runner.perSubmit = perSubmitOf(stepMs);
      c.chunkSteps = Math.max(c.runner.perSubmit, Math.round(chunkMs / Math.max(stepMs, 1e-4)));
    }
    return { rate, seconds: v.est.seconds, calibrated: true };
  }

  async function begin(c: Current): Promise<void> {
    const j = c.job, precision = j.precision ?? 'f32';
    let reason = '';
    let acq: GpuAcquire | null = null;
    if (j.backend === 'js') reason = 'The CPU was asked for.';
    else if (precision !== 'f32') reason = 'f64 runs on the CPU.';
    else {
      acq = await getGpu();
      if (!live(c)) return;
      if (acq.ok === false) reason = `${(acq as { reason: string }).reason} The run is on the CPU.`;
    }
    const b = buildProblem(j.setup, j.kind, { ...j.model, precision, env: jsEnv(j), rate: j.rate ?? RATES.js, allocate: false });
    c.b = b;
    c.notes = b.notes;
    if (!b.mesh || !b.est) { refuse(c, { verdicts: b.verdicts, offer: b.offer }); return; }
    if (acq?.ok) {
      const env = gpuEnv(acq.ctx.info, hopt.mobile ?? j.env?.mobile);
      const misfit = gpuMisfit(b.est, acq.ctx.info.limits);
      const gpuSize = judge(b, env, RATES.webgpu).verdicts.filter((v) => v.level === 'refuse' && v.code !== 'time');
      const jsSize = judge(b, jsEnv(j), RATES.js).verdicts.filter((v) => v.level === 'refuse' && v.code !== 'time');
      if (misfit) reason = `The run does not fit the GPU: ${misfit}. It is on the CPU.`;
      else if (gpuSize.length && !jsSize.length) reason = `${gpuSize[0].message} It is on the CPU.`;
      else {
        try {
          const p = allocateBuilt(b, { ...j.model, precision });
          c.p = p;
          c.runner = await GpuRunner.create(acq.ctx, p, probeLayout(p), hopt.runner);
          if (!live(c)) { release(c); return; }
          c.backend = 'webgpu';
        } catch (e) {
          if (!live(c)) return;
          if (e instanceof GpuError && e.lost) gpuP = Promise.resolve({ ok: false, reason: e.message });
          reason = `${(e as Error).message} The run is on the CPU.`;
        }
      }
    }
    const ai = acq?.ok ? acq.ctx.info : null;
    post({ type: 'backend', id: c.id, backend: c.backend, reason: c.backend === 'webgpu' ? `WebGPU (${ai!.vendor || 'GPU'}${ai!.architecture ? ` ${ai!.architecture}` : ''}).` : reason, ...(ai ? { adapter: { vendor: ai.vendor, architecture: ai.architecture } } : {}) });
    let pr: Awaited<ReturnType<typeof prepare>>;
    try { pr = await prepare(c); } catch (e) {
      if (!(e instanceof GpuError) || !live(c)) throw e;
      await fallback(c, e.message, false);
      return;
    }
    if (!pr || !live(c)) return;
    launch(c, pr);
  }

  function launch(c: Current, pr: { rate: number; seconds: number; calibrated: boolean }): void {
    const j = c.job, p = allocateBuilt(c.b!, { ...j.model, precision: j.precision ?? 'f32' });
    c.p = p; c.rec = newRecords(p); c.drives = drivesOf(p.ports.length, j.mode ?? 'full');
    c.snap = j.snapshots?.slices?.length ? new SnapRecorder(p, j.snapshots, stepsCap(p, j.maxSteps)) : null;
    c.x = excitation(c);
    const sp = c.snap?.plan;
    post({ type: 'started', id: c.id, info: { cells: p.N, steps: c.x.cap, dt: p.dt, runs: c.drives.length, ports: c.rec.ports.map((q) => q.name), seconds: pr.seconds, slices: sp?.slices ?? [], every: sp?.every ?? 0, frames: sp?.frames ?? 0, snapBytes: sp?.bytes ?? 0, backend: c.backend, rate: pr.rate, calibrated: pr.calibrated, held: gpuHeld() } });
    c.t0 = now();
    kick(c);
  }

  const excitation = (c: Current) => new Excitation(c.p!, c.drives[c.run], { maxSteps: c.job.maxSteps, stopDb: c.job.stopDb, snap: c.run === 0 ? c.snap : null, backend: c.runner ? c.runner.factory() : null });

  /** The GPU failed: the session goes on on the CPU; the excitation under way restarts there (`started`: it had begun). */
  async function fallback(c: Current, message: string, started = true): Promise<void> {
    gpuP = Promise.resolve({ ok: false, reason: message });
    c.runner?.destroy(); c.runner = null;
    c.backend = 'js';
    post({ type: 'backend', id: c.id, backend: 'js', reason: `${message} The run goes on on the CPU${started ? ` from excitation ${c.run + 1}` : ''}.`, ...(started ? { restart: c.run } : {}) });
    const pr = await prepare(c);
    if (!pr || !live(c)) return;
    if (!started) { launch(c, pr); return; }
    c.sent = 0;
    if (c.run === 0 && c.snap) c.snap = new SnapRecorder(c.p!, c.job.snapshots!, stepsCap(c.p!, c.job.maxSteps));
    c.x = excitation(c);
    kick(c);
  }

  const kick = (c: Current) => schedule(() => { void pump(c); });

  async function pump(c: Current): Promise<void> {
    if (!live(c)) { release(c); return; }
    const x = c.x!;
    c.busy = true;
    try {
      if (x.async) await x.advanceAsync(c.chunkSteps);
      else { const t0 = now(); while (now() - t0 < chunkMs && x.status === 'running') x.advance(10); }
    } catch (e) {
      c.busy = false;
      if (!live(c)) { release(c); return; }
      if (e instanceof GpuError) {
        try { await fallback(c, e.message); } catch (e2) { fail(c, e2); }
        return;
      }
      fail(c, e);
      return;
    }
    c.busy = false;
    if (!live(c)) { release(c); return; }
    try {
      progress(c);
      if (x.status !== 'running') {
        x.release();
        c.rec!.runs.push(x.record());
        c.backends.push(c.backend);
        if (c.run + 1 < c.drives.length) {
          c.run++; c.sent = 0;
          c.x = excitation(c);
        } else { finish(c); return; }
      }
    } catch (e) { fail(c, e); return; }
    kick(c);
  }

  function fail(c: Current, e: unknown): void {
    end(c);
    post({ type: 'error', id: c.id, message: String((e && (e as Error).message) || e) });
  }

  function progress(c: Current): void {
    const P = c.p!.ports.length, W = P * RECORD, x = c.x!;
    const rows = x.rec.slice(c.sent * W, x.rows * W);
    const from = c.sent;
    c.sent = x.rows;
    const frames = c.run === 0 && c.snap ? c.snap.drain() : [];
    const elapsed = now() - c.t0;
    const runs = c.rec!.runs;
    const done = runs.reduce((a, r) => a + r.rows - 1, 0) + x.step;
    const total = runs.reduce((a, r) => a + r.rows - 1, 0) + x.cap * (c.drives.length - c.run);
    const e = x.loop.energy, w = e.length ? e[e.length - 1][1] : 0;
    const msg: FdtdReply = {
      type: 'progress', id: c.id, run: c.run, runs: c.drives.length, step: x.step, steps: x.cap, elapsed,
      eta: done > 0 ? (elapsed / done) * Math.max(0, total - done) : NaN,
      energyDb: w > 0 && x.loop.wMax > 0 ? 10 * Math.log10(w / x.loop.wMax) : -Infinity, from, rows, frames,
    };
    post(msg, [rows.buffer as ArrayBuffer, ...frames.flatMap((f) => [...f.data.map((d) => d.buffer as ArrayBuffer), f.scale.buffer as ArrayBuffer])]);
  }

  function finish(c: Current): void {
    end(c);
    const r = c.rec!, j = c.job;
    const nport = nportOf(r, bandOf(r, j.nf));
    const tdr = (j.tr ?? [r.trMin]).map((tr) => tdrOf(r, Math.max(tr, r.trMin)));
    const notes = [...c.notes];
    const eeff = feedEeff(r);
    eeff.forEach((e, q) => { if (e.flag) notes.push({ level: 'warning', code: 'eeff', message: `Port ${r.ports[q].name}: the feed's εeff from the run is ${e.eeff.toFixed(3)}, the 2D solver's ${e.eeff2d.toFixed(3)} (${(e.diff * 100).toFixed(1)} %).` }); });
    r.runs.forEach((x, q) => {
      if (x.status === 'unstable') notes.push({ level: 'error', code: 'unstable', message: `Excitation ${q + 1} became unstable; its results are not valid.` });
      else if (x.status === 'done') notes.push({ level: 'info', code: 'not-settled', message: `Excitation ${q + 1} reached the run's length before its energy fell 50 dB.` });
    });
    const s = c.snap;
    const result: FdtdResult = {
      records: r, nport, tdr, eeff, status: r.runs.map((x) => x.status), steps: r.runs.map((x) => x.rows - 1), backends: c.backends, ms: now() - c.t0, notes,
      snap: s ? { slices: s.plan.slices, every: s.plan.every, frames: s.count, max: Array.from(s.max), bytes: s.bytes } : null,
    };
    post({ type: 'done', id: c.id, result }, r.runs.map((x) => x.rec.buffer as ArrayBuffer));
  }

  return (req) => {
    if (!req || typeof req !== 'object') return;
    if (req.type === 'cancel') {
      const c = cur;
      if (c && c.id === req.id) { end(c); post({ type: 'cancelled', id: req.id }); }
      return;
    }
    if (req.type === 'run') {
      const old = cur;
      if (old) { end(old); post({ type: 'cancelled', id: old.id }); }
      const c: Current = {
        id: req.id, job: req.job, b: null, p: null, rec: null, drives: [], run: 0, x: null, snap: null, t0: now(), sent: 0, notes: [],
        backend: 'js', backends: [], runner: null, chunkSteps: 0, busy: false,
      };
      cur = c;
      // busy while setting up (the runner is in use by the calibration); released when dropped meanwhile
      c.busy = true;
      begin(c).catch((e) => { c.busy = false; if (live(c)) fail(c, e); }).finally(() => { c.busy = false; if (!live(c)) release(c); });
    }
  };
}
