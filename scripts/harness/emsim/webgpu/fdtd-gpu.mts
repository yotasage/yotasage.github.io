// The browser entry of check-fdtd-gpu.mjs (M6.3): the product's WebGPU backend (lib/emsim/fdtd/gpu.ts) and job
// handler run in headless Edge through runner.mjs; Node calls these as window.fdtd.* and gets plain JSON (record
// arrays as base64). Not part of the site.
import * as G0 from '../../../../lib/emsim/fdtd/gpu.ts';
import * as J0 from '../../../../lib/emsim/fdtd/job.ts';
import * as S0 from '../../../../lib/emsim/fdtd/snapshots.ts';
import { caseJob, caseProblem, packRecords, Ru } from './cases.mts';

const d = (m: any) => m.default ?? m;
const G = d(G0), J = d(J0), Sn = d(S0);
let shared: Promise<any> | null = null;
const sharedGpu = () => (shared ??= G.acquireGpu());

async function info() {
  const a = await sharedGpu();
  if (!a.ok) return { ok: false, reason: a.reason };
  return { ok: true, info: a.ctx.info, userAgent: navigator.userAgent };
}

const frameJson = (f: any) => ({ step: f.step, scale: Array.from(f.scale), data: f.data.map((x: any) => Array.from(x)) });

/** One case on the GPU (calibrated first, as the worker does), or on the page's CPU (`cpu`). */
async function runCase(o: { name: string; mode: 'full' | 'tdr'; maxSteps?: number; runner?: any; snap?: any; cpu?: boolean; perSubmit?: number }) {
  const p = caseProblem(o.name, 'f32');
  const snap = o.snap ? new Sn.SnapRecorder(p, o.snap, Ru.stepsCap(p, o.maxSteps)) : null;
  const out: any = { cells: p.N, nx: p.nx, ny: p.ny, nz: p.nz };
  if (o.cpu) {
    const t0 = performance.now();
    const r = await Ru.runProblemAsync(p, o.mode, { maxSteps: o.maxSteps, snap });
    out.ms = performance.now() - t0;
    out.records = packRecords(r);
  } else {
    const a = await sharedGpu();
    if (!a.ok) throw new Error(a.reason);
    const runner = await G.GpuRunner.create(a.ctx, p, Ru.probeLayout(p), o.runner ?? {});
    try {
      const k = await Ru.calibrate(p, runner.factory(), (ms: number) => { runner.perSubmit = G.perSubmitOf(ms); });
      runner.perSubmit = o.perSubmit ?? G.perSubmitOf(k.stepMs);
      const t0 = performance.now();
      const r = await Ru.runProblemAsync(p, o.mode, { maxSteps: o.maxSteps, snap, backend: runner.factory() }, Math.max(runner.perSubmit, Math.round(100 / k.stepMs)));
      out.ms = performance.now() - t0;
      out.cal = k; out.perSubmit = runner.perSubmit; out.dispatches = runner.dispatches; out.splits = runner.splits;
      out.records = packRecords(r);
      if (a.ctx.failure) throw new Error(a.ctx.failure);
    } finally { runner.destroy(); }
  }
  if (snap) { out.frames = snap.drain().map(frameJson); out.snapMax = Array.from(snap.max); }
  return out;
}

/** A job through the product's handler with a GPU provider: 'real' (the shared device), 'fresh' (a device of its own,
 *  destroyed after `lose` progress messages when given), 'none' (no navigator.gpu), 'noadapter', 'misfit' (a device
 *  whose binding limit is 1 MiB). Resolves with the messages' summary. */
async function job(o: { name: string; mode?: 'full' | 'tdr'; maxSteps?: number; snapshots?: any; backend?: string; rate?: number; precision?: string }, h: { gpu: string; lose?: number; runner?: any; chunkMs?: number; timeoutMs?: number }) {
  let fresh: any = null;
  const provider = async () => {
    if (h.gpu === 'real') return sharedGpu();
    if (h.gpu === 'none') return G.acquireGpu({ gpu: null });
    if (h.gpu === 'noadapter') return G.acquireGpu({ gpu: { requestAdapter: async () => null } });
    const a = await G.acquireGpu();
    if (!a.ok) return a;
    fresh = a.ctx;
    if (h.gpu === 'misfit') {
      const w = Object.create(a.ctx);
      Object.defineProperty(w, 'info', { value: { ...a.ctx.info, limits: { ...a.ctx.info.limits, maxStorageBufferBindingSize: 1 << 20 } } });
      return { ok: true, ctx: w };
    }
    return a;
  };
  const j = caseJob(o.name);
  const msgs: any[] = [];
  let progress = 0;
  const events: string[] = [];
  const t0 = performance.now();
  const done = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`job over ${h.timeoutMs ?? 300000} ms`)), h.timeoutMs ?? 300000);
    const handle = J.createFdtdHandler((m: any) => {
      msgs.push(m);
      if (m.type === 'progress' && ++progress === h.lose && fresh) {
        fresh.on('lost', (s: string) => events.push(`lost: ${s}`));
        fresh.destroy();
      }
      if (['done', 'error', 'refused', 'cancelled'].includes(m.type)) { clearTimeout(timer); resolve(); }
    }, (fn: () => void) => setTimeout(fn, 0), h.chunkMs ?? 100, { gpu: provider, runner: h.runner });
    handle({ type: 'run', id: 1, job: { setup: j.setup, kind: j.kind, model: j.model, mode: o.mode, maxSteps: o.maxSteps, snapshots: o.snapshots, backend: o.backend, rate: o.rate, precision: o.precision } });
  });
  await done;
  const wall = performance.now() - t0;
  const st = msgs.find((m) => m.type === 'started'), dn = msgs.find((m) => m.type === 'done');
  const prog = msgs.filter((m) => m.type === 'progress');
  return {
    wall, events,
    types: msgs.map((m) => m.type),
    backend: msgs.filter((m) => m.type === 'backend').map(({ backend, reason, restart }) => ({ backend, reason, restart })),
    started: st?.info ? { ...st.info, slices: undefined } : null,
    error: msgs.find((m) => m.type === 'error')?.message ?? null,
    refused: msgs.find((m) => m.type === 'refused')?.verdicts ?? null,
    progress: prog.length,
    restarts: prog.filter((m, q) => q > 0 && m.run === prog[q - 1].run && m.from === 0).length, // rows sent again from 0
    done: dn ? {
      ms: dn.result.ms, status: dn.result.status, steps: dn.result.steps, backends: dn.result.backends, known: dn.result.nport.known,
      notes: dn.result.notes.map((n: any) => n.code), snapFrames: dn.result.snap?.frames ?? null, records: packRecords(dn.result.records),
    } : null,
  };
}

(globalThis as any).fdtd = { info, runCase, job };
(globalThis as any).__ready = true;
