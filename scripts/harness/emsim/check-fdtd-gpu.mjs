// Checks of the full-wave engine's WebGPU backend (step M6.3, docs/em-sim/fullwave.md §8, §9, §11.2, §12), run in
// headless Edge through webgpu/runner.mjs with webgpu/fdtd-gpu.mts as the page; skipped with a note when Edge or its
// WebGPU adapter is missing (on the owner's PC it must run).
// (a) GPU (f32) against the CPU loop in f32 and f64 (child processes, fdtd-cpuref.mts, in parallel) on M6.2b's 6 mm
//     microstrip (both runs) and the C44 via with CPML and ports (port 1, VIA_STEPS steps; EMSIM_FDTD_LONG=1: both
//     runs at full length): the f32 bar of §8 — port signals within 10⁻⁴ of their peak (per 10 000 steps), |ΔS| ≤ 10⁻³
//     up to f_S, TDR impedance within 0.05 Ω;
// (b) the C45 pair (4 runs, 957 k cells) through the product's job handler: run time against the calibrated estimate
//     (§11.2) within 2×, and the throughput next to the spike's (§9.6);
// (c) the fallback: no navigator.gpu, no adapter, a run over the device's binding limit, an f64 run, and a device
//     destroyed mid-run (the excitation restarts on the CPU), each with its message;
// (d) dispatch splitting: a forced limit of 3 workgroups per dimension gives the same records and frames bit for bit;
//     snapshots on the GPU against the CPU's frames (within one quantisation step).
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as Ru0 from '../../../lib/emsim/fdtd/run.ts';
import * as N0 from '../../../lib/emsim/nport.ts';
import { withWebGpuPage } from './webgpu/runner.mjs';

const d = (m) => m.default ?? m;
const Ru = d(Ru0), N = d(N0);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const LONG = process.env.EMSIM_FDTD_LONG === '1';
const VIA_STEPS = 3000; // the C44 via's default comparison (port 1); LONG runs both ports to the cap (7 645)
const BAR = { signal: 1e-4, s: 1e-3, z: 0.05 }; // §8, per 10 000 steps
const SPIKE = '§9.6 spike, bare update: 3.1·10⁹/s at 0.52 M cells, 5.8–6.5·10⁹/s at 2.1 M';

function unpack(r) {
  return { ...r, runs: r.runs.map((x) => { const b = Buffer.from(x.rec, 'base64'); return { ...x, rec: new Float64Array(b.buffer, b.byteOffset, b.byteLength / 8) }; }) };
}

/** Port signals: max over runs and probe columns of max|a − b| / max|b| over the common rows. */
function signalDiff(a, b) {
  const W = b.ports.length * Ru.RECORD;
  let worst = 0, rows = Infinity;
  b.runs.forEach((rb, q) => {
    const ra = a.runs[q], n = Math.min(ra.rows, rb.rows);
    rows = Math.min(rows, n);
    for (let k = 0; k < W; k++) {
      let pk = 0, df = 0;
      for (let r = 0; r < n; r++) { const x = rb.rec[r * W + k]; pk = Math.max(pk, Math.abs(x)); df = Math.max(df, Math.abs(ra.rec[r * W + k] - x)); }
      if (pk > 0) worst = Math.max(worst, df / pk);
    }
  });
  return { worst, rows };
}
function sDiff(a, b) {
  const f = Ru.bandOf(b), na = Ru.nportOf(a, f), nb = Ru.nportOf(b, f);
  let w = 0;
  for (let i = 0; i < nb.ports; i++) for (let j = 0; j < nb.ports; j++) {
    if (!nb.known[j]) continue;
    for (let k = 0; k < f.length; k++) { const [x, y] = N.sEntry(na, k, i, j), [u, v] = N.sEntry(nb, k, i, j); w = Math.max(w, Math.hypot(x - u, y - v)); }
  }
  return w;
}
function zDiff(a, b) {
  const ta = Ru.tdrOf(a, a.trMin), tb = Ru.tdrOf(b, b.trMin);
  let w = 0;
  for (let m = 0; m < tb.z.length; m++) if (Number.isFinite(tb.z[m]) && Number.isFinite(ta.z[m])) w = Math.max(w, Math.abs(ta.z[m] - tb.z[m]));
  return w;
}

/** A CPU reference in a child process (tsx, as this check runs). */
function cpuRef(dir, name, mode, precision, maxSteps) {
  const out = path.join(dir, `${name}-${mode}-${precision}.json`);
  return new Promise((resolve, reject) => {
    const ch = spawn(process.execPath, [...process.execArgv, path.join(HERE, 'fdtd-cpuref.mts'), name, mode, precision, maxSteps === undefined ? '-' : String(maxSteps), out], { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    ch.stderr.on('data', (s) => { err += s; });
    const timer = setTimeout(() => { ch.kill(); reject(new Error(`CPU reference ${name} ${precision} over 15 min`)); }, 15 * 60_000);
    ch.on('exit', (code) => {
      clearTimeout(timer);
      if (code !== 0) { reject(new Error(`CPU reference ${name} ${precision}: exit ${code} ${err.slice(0, 300)}`)); return; }
      const j = JSON.parse(readFileSync(out, 'utf8'));
      resolve({ ...j, records: unpack(j.records) });
    });
  });
}

const fmt = (x) => x.toExponential(1);
const rate = (cells, steps, ms) => (cells * steps) / (ms / 1000);

export async function run(t) {
  const dir = mkdtempSync(path.join(tmpdir(), 'emsim-gpu-'));
  const cases = [['micro6', 'full', undefined], LONG ? ['c44', 'full', undefined] : ['c44', 'tdr', VIA_STEPS]];
  let refs = null;
  const lines = [];
  try {
    let skipped = null;
    try {
      await withWebGpuPage(path.join(HERE, 'webgpu', 'fdtd-gpu.mts'), async (page, mode) => {
        const inf = await page.evaluate(() => fdtd.info());
        if (!inf.ok) { skipped = inf.reason; return; }
        // the references start only when the GPU is there
        refs = Promise.all(cases.flatMap(([name, m, max]) => ['f32', 'f64'].map((pr) => cpuRef(dir, name, m, pr, max))));
        refs.catch(() => {});
        lines.push(`adapter ${inf.info.vendor} ${inf.info.architecture} (${mode}), maxComputeWorkgroupsPerDimension ${inf.info.limits.maxComputeWorkgroupsPerDimension}`);
        await gpuChecks(t, page, lines);
        const gpu = {};
        for (const [name, m, max] of cases) gpu[name] = await page.evaluate((o) => fdtd.runCase(o), { name, mode: m, maxSteps: max });
        const R = await refs;
        for (const [name, m] of cases) {
          const g = gpu[name], a = unpack(g.records);
          const steps = a.runs.reduce((s, x) => s + x.rows - 1, 0);
          const bar = BAR.signal * Math.max(1, Math.max(...a.runs.map((x) => x.rows - 1)) / 1e4);
          lines.push(`${name} ${m}: ${g.cells} cells, ${steps} steps on the GPU in ${(g.ms / 1000).toFixed(2)} s (${fmt(rate(g.cells, steps, g.ms))} cells/s, K ${g.perSubmit}, ${g.dispatches} dispatches per step; calibrated ${fmt(g.cal.rate)}/s)`);
          for (const pr of ['f32', 'f64']) {
            const ref = R.find((x) => x.name === name && x.precision === pr), b = ref.records;
            t.ok(a.runs.length === b.runs.length && a.runs.every((x, q) => x.status === b.runs[q].status && x.rows === b.runs[q].rows), () => `${name} GPU vs CPU ${pr}: runs ${a.runs.map((x) => `${x.status}/${x.rows}`)} vs ${b.runs.map((x) => `${x.status}/${x.rows}`)}`);
            const sg = signalDiff(a, b), ds = sDiff(a, b), dz = zDiff(a, b);
            t.ok(sg.worst <= bar, () => `${name} GPU vs CPU ${pr}: port signals ${fmt(sg.worst)} of their peak (bar ${fmt(bar)})`);
            t.ok(ds <= BAR.s, () => `${name} GPU vs CPU ${pr}: |ΔS| ${fmt(ds)} up to f_S (bar 10⁻³)`);
            t.ok(dz <= BAR.z, () => `${name} GPU vs CPU ${pr}: TDR ${dz.toFixed(4)} Ω (bar 0.05 Ω)`);
            lines.push(`  vs CPU ${pr} (${(ref.ms / 1000).toFixed(0)} s, ${fmt(rate(ref.cells, steps, ref.ms))} cells/s): signals ${fmt(sg.worst)} of peak, |ΔS| ${fmt(ds)}, TDR ${dz.toExponential(1)} Ω`);
          }
        }
      }, { timeoutMs: (LONG ? 25 : 10) * 60_000, log: () => {} });
    } catch (e) {
      if (/no WebGPU adapter|Executable doesn't exist|msedge/i.test(String(e?.message))) skipped = String(e.message).split('\n')[0];
      else throw e;
    }
    if (skipped) { t.note(`skipped: no WebGPU (${skipped})`); return; }
  } finally {
    if (refs) await refs.catch(() => {});
    rmSync(dir, { recursive: true, force: true });
  }
  t.note(`FDTD WebGPU (${SPIKE}):\n    ${lines.join('\n    ')}`);
}

async function gpuChecks(t, page, lines) {
  const ev = (fn, arg) => page.evaluate(fn, arg);
  // (d) dispatch splitting and snapshots
  const snap = { comp: 'E', slices: [{ normal: 'z', at: 1.59 }, { normal: 'y', at: 0 }], frames: 10 };
  const base = { name: 'micro3', mode: 'tdr', maxSteps: 300, snap };
  const g1 = await ev((o) => fdtd.runCase(o), base);
  const g3 = await ev((o) => fdtd.runCase(o), { ...base, runner: { maxWorkgroups: 3 } });
  const c1 = await ev((o) => fdtd.runCase(o), { ...base, cpu: true });
  t.ok(g3.splits > 50 && g1.splits === 0, () => `split dispatches: ${g3.splits} extra per step at 3 workgroups per dimension, ${g1.splits} at the device's limit`);
  const r1 = unpack(g1.records).runs[0].rec, r3 = unpack(g3.records).runs[0].rec;
  t.ok(r1.length === r3.length && r1.every((x, q) => x === r3[q]), 'split dispatches: the same records bit for bit');
  t.ok(g1.frames.length === 10 && JSON.stringify(g1.frames) === JSON.stringify(g3.frames), () => `split dispatches: the same ${g1.frames.length} frames`);
  let worst = 0;
  t.ok(c1.frames.length === g1.frames.length && c1.frames.every((f, q) => f.step === g1.frames[q].step), 'snapshots: the GPU takes the CPU\'s frame steps');
  c1.frames.forEach((f, q) => f.data.forEach((sl, s) => sl.forEach((v, k) => { worst = Math.max(worst, Math.abs(v * f.scale[s] - g1.frames[q].data[s][k] * g1.frames[q].scale[s]) / f.scale[s]); })));
  t.ok(worst <= 1.01, () => `snapshots: GPU frames within ${worst.toFixed(3)} quantisation steps of the CPU's (bar 1)`);
  const sg = signalDiff(unpack(g1.records), unpack(c1.records));
  t.ok(sg.worst <= BAR.signal, () => `micro3 GPU vs the page's CPU f32: ${fmt(sg.worst)}`);
  lines.push(`split: ${g3.dispatches} dispatches per step at 3 workgroups per dimension (${g1.dispatches} unsplit), records and frames identical; snapshots within ${worst.toFixed(2)} of a step of the CPU's`);

  // (c) fallback
  const job = { name: 'micro3', mode: 'full', maxSteps: 200 };
  for (const [gpu, want] of [['none', /no WebGPU/], ['noadapter', /no GPU adapter/], ['misfit', /does not fit the GPU/]]) {
    const r = await ev(([o, h]) => fdtd.job(o, h), [job, { gpu, chunkMs: 20 }]);
    t.ok(r.backend.length === 1 && r.backend[0].backend === 'js' && want.test(r.backend[0].reason), () => `fallback ${gpu}: ${JSON.stringify(r.backend)}`);
    t.ok(r.done && r.done.backends.every((b) => b === 'js') && r.started?.backend === 'js', () => `fallback ${gpu}: ran on the CPU (${r.types.slice(-2)}, ${r.error})`);
  }
  const f64 = await ev(([o, h]) => fdtd.job(o, h), [{ ...job, precision: 'f64' }, { gpu: 'real', chunkMs: 20 }]);
  t.ok(f64.backend.length === 1 && f64.backend[0].backend === 'js' && /f64/.test(f64.backend[0].reason) && f64.done, () => `f64 job: ${JSON.stringify(f64.backend)}`);
  const fixed = await ev(([o, h]) => fdtd.job(o, h), [{ name: 'micro3', mode: 'tdr', maxSteps: 300, rate: 6e9 }, { gpu: 'real', chunkMs: 20 }]);
  t.ok(fixed.done && fixed.started.backend === 'webgpu' && !fixed.started.calibrated && fixed.done.steps.join() === '300', () => `a GPU job with a fixed rate (no calibration): ${JSON.stringify(fixed.started)} ${JSON.stringify(fixed.done?.steps)}`);
  const lost = await ev(([o, h]) => fdtd.job(o, h), [{ name: 'micro3', mode: 'full', maxSteps: 1500 }, { gpu: 'fresh', lose: 1, chunkMs: 20 }]);
  const lb = lost.backend;
  t.ok(lb.length === 2 && lb[0].backend === 'webgpu' && lb[1].backend === 'js' && /lost/.test(lb[1].reason) && lb[1].restart === 0, () => `device lost: ${JSON.stringify(lb)}`);
  t.ok(lost.done && lost.done.status.every((s) => s === 'done' || s === 'settled') && lost.done.backends.join() === 'js,js' && lost.done.known.every(Boolean) && lost.restarts === 1, () => `device lost: restarted on the CPU and done (${JSON.stringify(lost.done && { ...lost.done, records: undefined })}, restarts ${lost.restarts}, ${lost.error})`);
  const ok = await ev(([o, h]) => fdtd.job(o, h), [{ name: 'micro3', mode: 'full', maxSteps: 1500 }, { gpu: 'real', chunkMs: 20 }]);
  const da = unpack(ok.done.records), db = unpack(lost.done.records);
  const sl = signalDiff(da, db);
  t.ok(ok.done.backends.join() === 'webgpu,webgpu' && sl.worst <= BAR.signal, () => `device lost: the CPU's records match a GPU run's (${fmt(sl.worst)}, ${ok.done.backends})`);
  lines.push(`fallback: no navigator.gpu, no adapter, over the binding limit → CPU with the reason; device destroyed after the first progress → "${lb[1]?.reason}"`);

  // (b) the C45 pair through the job handler: time against the calibrated estimate
  const c45 = await ev(([o, h]) => fdtd.job(o, h), [{ name: 'c45', mode: 'full' }, { gpu: 'real', timeoutMs: 300_000 }]);
  const st = c45.started, est = st.seconds * st.runs, act = c45.done.ms / 1000;
  const steps = c45.done.steps.reduce((a, b) => a + b, 0);
  t.ok(st.backend === 'webgpu' && st.calibrated && c45.done.backends.every((b) => b === 'webgpu'), () => `C45 pair: on WebGPU, calibrated (${JSON.stringify(st)})`);
  t.ok(act <= 2 * est && act >= est / 2, () => `C45 pair: ${act.toFixed(2)} s against the calibrated estimate ${est.toFixed(2)} s (bar within 2×)`);
  lines.push(`C45 pair: ${st.cells} cells, 4 runs, ${steps} steps in ${act.toFixed(2)} s, estimate ${est.toFixed(2)} s (${(act / est).toFixed(2)}×); ${fmt(rate(st.cells, steps, c45.done.ms))} cells/s with CPML, ports and records`);
}
