// The browser entry of compare-openems.mjs (M6.4c): one full-wave problem from a plain-JSON setup, run on the WebGPU
// backend (lib/emsim/fdtd/gpu.ts) with every port driven in turn, as fdtd-gpu.mts runs its cases. Node calls
// window.cmp.run and gets the records (arrays as base64) with the ports' positions for de-embedding. Not part of the site.
import * as G0 from '../../../../lib/emsim/fdtd/gpu.ts';
import * as Pr0 from '../../../../lib/emsim/fdtd/problem.ts';
import { packRecords, Ru } from './cases.mts';

const d = (m: any) => m.default ?? m;
const G = d(G0), Pr = d(Pr0);
let shared: Promise<any> | null = null;
const sharedGpu = () => (shared ??= G.acquireGpu());

async function info() {
  const a = await sharedGpu();
  return a.ok ? { ok: true, info: a.ctx.info } : { ok: false, reason: a.reason };
}

async function run(o: { setup: any; kind: 'trace' | 'via'; model: any; mode?: 'full' | 'tdr' }) {
  const b = Pr.buildProblem(o.setup, o.kind, { ...o.model, precision: 'f32', force: true });
  if (!b.problem) throw new Error(`not built: ${JSON.stringify(b.notes.filter((n: any) => n.level === 'error'))}`);
  const p = b.problem;
  const a = await sharedGpu();
  if (!a.ok) throw new Error(a.reason);
  const runner = await G.GpuRunner.create(a.ctx, p, Ru.probeLayout(p), {});
  try {
    const k = await Ru.calibrate(p, runner.factory(), (ms: number) => { runner.perSubmit = G.perSubmitOf(ms); });
    runner.perSubmit = G.perSubmitOf(k.stepMs);
    const t0 = performance.now();
    const r = await Ru.runProblemAsync(p, o.mode ?? 'full', { backend: runner.factory() }, Math.max(runner.perSubmit, Math.round(100 / k.stepMs)));
    const ms = performance.now() - t0;
    if (a.ctx.failure) throw new Error(a.ctx.failure);
    return {
      cells: p.N, dt: p.dt, ms, notes: b.notes.map((n: any) => n.code),
      ports: p.ports.map((pt: any) => ({ name: pt.spec.name, axis: pt.spec.axis, pos: pt.spec.pos, dir: pt.spec.dir, centre: pt.spec.centre, feed: pt.spec.feed })),
      records: packRecords(r),
    };
  } finally { runner.destroy(); }
}

(globalThis as any).cmp = { info, run };
(globalThis as any).__ready = true;
