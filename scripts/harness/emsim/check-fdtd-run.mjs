// Checks of the full-wave runs and their outputs (step M6.2b): lib/emsim/fdtd/run.ts, snapshots.ts, job.ts (the
// worker's handler) and fdtdClient.ts, against the 2D solver.
// (a) a uniform microstrip (the default C39 trace, a 6 mm section, f32, each port in turn): the TDR's flat impedance
//     between the reference planes within 1 % of the 2D solver's Z0 (51.50 Ω);
// (b) the line between its matched ports: |S11| under −30 dB up to f_S; (c) reciprocity |S21 − S12| ≤ 10⁻³ (§7.1);
// (d) passivity: no column of S above 1 + 10⁻³; S renormalised to 50 Ω and back;
// (e) the worker's handler in Node: progress with record rows that add up to the result's, cancel mid-run, a newer run
//     cancelling the older, refusal by the estimator's rules, and the client on the page (no Worker in Node);
// (f) snapshots: the planned frame count, bytes as planned, the budget lowering the frame count, and a frame against
//     the fields it was taken from (within half a quantisation step).
// EMSIM_FDTD_LONG=1 adds a 12 mm section (port 1 alone, a long flat TDR) and the edge-coupled pair's 4-port.

import { performance } from 'node:perf_hooks';
import { readFileSync } from 'node:fs';
import * as Su0 from '../../../lib/emsim/setup.ts';
import * as Pr0 from '../../../lib/emsim/fdtd/problem.ts';
import * as Ru0 from '../../../lib/emsim/fdtd/run.ts';
import * as Sn0 from '../../../lib/emsim/fdtd/snapshots.ts';
import * as Jb0 from '../../../lib/emsim/fdtd/job.ts';
import * as FC0 from '../../../lib/emsim/fdtdClient.ts';
import * as N0 from '../../../lib/emsim/nport.ts';
import * as T0 from '../../../lib/emsim/structure.ts';

const d = (m) => m.default ?? m;
const Su = d(Su0), Pr = d(Pr0), Ru = d(Ru0), Sn = d(Sn0), Jb = d(Jb0), FC = d(FC0), N = d(N0), T = d(T0);
const LONG = process.env.EMSIM_FDTD_LONG === '1';
const LEN = 6; // mm: the default check's section (3 mm between the reference planes); the 12 mm one is in LONG
const C0 = 299792458e3; // mm/s
const Z2D = 51.50; // the default trace's Z0 from the 2D solver (engine.md, examples.md)
const db = (x) => 20 * Math.log10(x);
const rows = [];

/** Flat TDR impedance: the mean of Z(t) over the middle half of the round trip between the two reference planes. */
function flatZ(tdr, tau) {
  let s = 0, n = 0;
  for (let m = 0; m < tdr.t.length; m++) if (tdr.t[m] >= 0.25 * tau && tdr.t[m] <= 0.75 * tau) { s += tdr.z[m]; n++; }
  return s / n;
}
function sMax(np, i, j, fMax = Infinity) {
  let w = 0;
  for (let k = 0; k < np.f.length; k++) if (np.f[k] <= fMax) { const [a, b] = N.sEntry(np, k, i, j); w = Math.max(w, Math.hypot(a, b)); }
  return w;
}

function microstrip(t, length, mode, snapSpec) {
  const su = Su.defaultSetup();
  const b = Pr.buildProblem(su, 'trace', { length });
  t.ok(b.ok && b.problem, `microstrip ${length} mm: built`);
  const p = b.problem;
  const snap = snapSpec ? new Sn.SnapRecorder(p, snapSpec, Ru.stepsCap(p)) : null;
  const t0 = performance.now();
  const r = Ru.runProblem(p, mode, { snap });
  const ms = performance.now() - t0;
  for (const [q, x] of r.runs.entries()) t.ok(x.status === 'settled' || x.status === 'done', () => `microstrip ${length} mm run ${q}: ${x.status}`);
  return { p, b, r, ms, snap, su };
}

function checkMicrostrip(t) {
  const spec = { comp: 'Ez', slices: [{ normal: 'z', at: 1.59 }, { normal: 'x', at: 0 }, { normal: 'y', at: LEN / 2 }], frames: 300 };
  const { p, r, ms, snap } = microstrip(t, LEN, 'full', spec);
  const m = r.ports[0];
  // (a) TDR
  const tdr = Ru.tdrOf(r, p.pulse.trMin);
  const between = LEN - 2 * m.sRef, tau = (2 * between * Math.sqrt(m.eeff)) / C0;
  const zf = flatZ(tdr, tau);
  t.ok(Math.abs(zf / Z2D - 1) < 0.01, () => `microstrip: TDR flat impedance ${zf.toFixed(3)} Ω, 2D ${Z2D} Ω: ${((zf / Z2D - 1) * 100).toFixed(2)} % (bar 1 %)`);
  t.ok(tdr.err.z < 0.05, () => `microstrip: the TDR's stated error ${tdr.err.z} Ω`);
  t.ok(Math.abs(tdr.z[0] - m.z0) < 0.01, () => `microstrip: TDR before the edge at the reference ${tdr.z[0]} Ω`);
  // (b)–(d) S
  const np = Ru.nportOf(r);
  t.ok(np.known.every(Boolean) && np.ports === 2 && np.producer.name === 'fdtd', 'microstrip: full 2-port from two runs, producer fdtd');
  t.near(np.valid.fMax, Ru.F_S * r.fRun, 'microstrip: valid up to f_S = 0.816·f_run', 1e-12);
  const s11 = Math.max(sMax(np, 0, 0), sMax(np, 1, 1));
  t.ok(s11 < 10 ** (-30 / 20), () => `microstrip: |S11| max ${db(s11).toFixed(1)} dB over 0 … f_S (bar −30 dB)`);
  const rec = N.reciprocityError(np), pas = N.passivityExcess(np);
  t.ok(rec <= 1e-3, () => `microstrip: reciprocity |S21 − S12| ${rec.toExponential(2)} (bar 10⁻³)`);
  t.ok(pas <= 1e-3, () => `microstrip: passivity excess ${pas.toExponential(2)} (bar 10⁻³)`);
  const [a0, b0] = N.sEntry(np, 0, 1, 0);
  t.ok(Math.abs(Math.hypot(a0, b0) - 1) < 1e-3, () => `microstrip: |S21(0)| ${Math.hypot(a0, b0)}`);
  // S21's phase over the line between the reference planes against εeff from γ
  const ee = Ru.feedEeff(r);
  // εeff from γ against the 2D solver (M6.4b, BL150: 4.1 % high before the H faces took their areas; openEMS +0.9 %)
  for (const [q, e] of ee.entries()) t.ok(Math.abs(e.diff) <= 0.015, () => `microstrip: port ${q + 1}'s εeff from γ ${e.eeff.toFixed(4)}, 2D ${e.eeff2d.toFixed(4)}: ${(e.diff * 100).toFixed(2)} % (bar 1.5 %)`);
  const k = Math.round(np.f.length / 4), [a1, b1] = N.sEntry(np, k, 1, 0);
  const phase = -Math.atan2(b1, a1), want = (2 * Math.PI * np.f[k] * between * Math.sqrt(ee[0].eeff)) / C0;
  t.ok(Math.abs(phase - want) < 0.02 * want, () => `microstrip: S21's phase ${phase.toFixed(4)} rad at ${(np.f[k] / 1e9).toFixed(1)} GHz, ${want.toFixed(4)} from εeff`);
  // renormalised to 50 Ω and back
  const n50 = N.renormalize(np, [50, 50]), back = N.renormalize(n50, np.z0);
  let dr = 0; for (let q = 0; q < np.s.length; q++) dr = Math.max(dr, Math.abs(back.s[q] - np.s[q]));
  t.ok(dr < 1e-12, () => `renormalize to 50 Ω and back: ${dr}`);
  const [c0r, c0i] = N.sEntry(n50, 0, 0, 0);
  t.ok(Math.hypot(c0r, c0i) < 1e-3, () => `renormalised to 50 Ω: |S11(0)| ${Math.hypot(c0r, c0i)} (a line is transparent at DC)`);
  // the lumped port's own reflection (port 2 in run 0, at its reference plane) — stated
  const w = Ru.waves(r, np.f);
  let gl = 0;
  for (let q = 0; q < np.f.length; q++) { const o = 2 * (q * 2 * 2 + 1); gl = Math.max(gl, Math.hypot(w.a[o], w.a[o + 1]) / Math.max(1e-30, Math.hypot(w.b[o], w.b[o + 1]))); }
  // (f) snapshots
  const pl = snap.plan;
  t.ok(pl.bytes <= Sn.SNAP_BUDGET && pl.frames <= 300 && pl.slices.length === 3, () => `snapshots: planned ${pl.frames} frames, ${pl.bytes} B`);
  t.eq(snap.count, Math.min(pl.frames, Math.floor((r.runs[0].rows - 1) / pl.every)), 'snapshots: frames taken (every k steps of the first run)');
  t.eq(snap.bytes, snap.count * pl.frameBytes, 'snapshots: bytes = frames × the planned frame size');
  const fr = snap.drain();
  t.eq(fr.length, snap.count, 'snapshots: drained');
  t.ok(fr.every((f) => f.data.length === 3 && f.data.every((x, s) => x instanceof Int8Array && x.length === pl.slices[s].nu * pl.slices[s].nv)), 'snapshots: int8 per slice of nu × nv');
  t.ok(snap.max.every((x) => x > 0) && pl.slices.every((s) => s.u.length === s.nu && s.v.length === s.nv), 'snapshots: run maxima and coordinates');
  t.ok(Math.abs(pl.slices[0].at - 1.59) < 0.03 && pl.slices[1].at === 0, () => `snapshots: slice planes ${pl.slices.map((s) => s.at)}`);
  rows.push({ name: `microstrip ${LEN} mm, 2 runs`, cells: p.N, steps: r.runs.map((x) => x.rows - 1).join('+'), ms, z: zf, s11, rec, extra: `port's own reflection ${db(gl).toFixed(1)} dB; εeff from γ ${ee[0].eeff.toFixed(3)} (2D ${ee[0].eeff2d.toFixed(3)}, ${(ee[0].diff * 100).toFixed(1)} %); TDR err ${tdr.err.z.toFixed(3)} Ω; snapshots ${snap.count} × ${pl.frameBytes} B` });
}

function checkSnapshotValues(t) {
  const p = Pr.buildProblem(Su.defaultSetup(), 'trace', { length: 3 }).problem;
  // a frame against the fields: the budget sets every = 40 steps of a 400-step cap
  for (const comp of ['Ez', 'E']) {
    const spec = { comp, slices: [{ normal: 'x', at: 0 }], budget: 0 };
    const pl0 = Sn.snapPlan(p, spec, 400);
    spec.budget = 10 * pl0.frameBytes;
    const rec = new Sn.SnapRecorder(p, spec, 400);
    t.eq(rec.plan.frames, 10, `snapshots ${comp}: the budget lowers the frames to 10`);
    t.eq(rec.plan.every, 40, `snapshots ${comp}: every 40 steps`);
    const x = new Ru.Excitation(p, [1], { maxSteps: 400, snap: rec });
    x.advance(120);
    const f = rec.drain();
    t.eq(f.length, 3, `snapshots ${comp}: 3 frames after 120 steps`);
    const last = f[2], sl = rec.plan.slices[0];
    t.ok(comp === 'E' ? last.data[0] instanceof Uint8Array : last.data[0] instanceof Int8Array, `snapshots ${comp}: ${comp === 'E' ? 'u8' : 'int8'}`);
    // direct gather at the slice (x = 0 node, the trace centre; Ez on its edges, |E| at the nodes)
    const { nx, ny, N: NN, gx, gy, gz } = p;
    const i = gx.findIndex((v) => Math.abs(v - sl.at) < 1e-12);
    let worst = 0;
    for (let iv = 0; iv < sl.nv; iv++) for (let iu = 0; iu < sl.nu; iu++) {
      const j = gy.findIndex((v) => Math.abs(v - sl.u[iu]) < 1e-6);
      let val;
      if (comp === 'Ez') { const k = gz.findIndex((v, kk) => kk + 1 < gz.length && Math.abs((gz[kk] + gz[kk + 1]) / 2 - sl.v[iv]) < 1e-6); val = p.E[2 * NN + i + nx * (j + ny * k)]; }
      else {
        const k = gz.findIndex((v) => Math.abs(v - sl.v[iv]) < 1e-6), c = i + nx * (j + ny * k);
        const ex = (p.E[c] + p.E[c - 1]) / 2, ey = (p.E[NN + c] + p.E[NN + c - nx]) / 2, ez = (p.E[2 * NN + c] + p.E[2 * NN + c - nx * ny]) / 2;
        val = Math.hypot(ex, ey, ez);
      }
      worst = Math.max(worst, Math.abs(last.data[0][iu + sl.nu * iv] * last.scale[0] - val) / last.scale[0]);
    }
    t.ok(worst <= 0.5 + 1e-3, () => `snapshots ${comp}: frame vs fields ${worst.toFixed(4)} of a quantisation step`);
  }
}

async function checkWorker(t) {
  const su = Su.defaultSetup();
  const job = { setup: su, kind: 'trace', model: { length: 3 }, maxSteps: 300, snapshots: { comp: 'E', slices: [{ normal: 'z', at: 1.59 }], frames: 10 } };
  const runJob = (reqs, chunkMs = 20, until = (m) => m.some((x) => x.type === 'done' || x.type === 'error' || x.type === 'refused')) => new Promise((resolve) => {
    const msgs = [];
    let h;
    const post = (m) => { msgs.push(m); const step = reqs.find((r) => r.after && r.after(msgs) && !r.sent); if (step) { step.sent = true; h(step.req); } if (until(msgs)) setTimeout(() => resolve(msgs), 50); };
    h = Jb.createFdtdHandler(post, (fn) => setTimeout(fn, 0), chunkMs);
    for (const r of reqs) if (!r.after) h(r.req);
  });
  // progress, partial rows, frames, result
  let msgs = await runJob([{ req: { type: 'run', id: 1, job } }]);
  const st = msgs.find((m) => m.type === 'started'), prog = msgs.filter((m) => m.type === 'progress'), done = msgs.find((m) => m.type === 'done');
  t.ok(st && st.info.runs === 2 && st.info.steps === 300 && st.info.frames === 10, () => `worker: started ${JSON.stringify(st?.info && { ...st.info, slices: undefined })}`);
  t.ok(prog.length >= 4, () => `worker: ${prog.length} progress messages`);
  t.ok(prog.every((m, q) => q === 0 || m.run > prog[q - 1].run || m.step >= prog[q - 1].step), 'worker: progress steps do not go back');
  t.ok(prog.every((m) => m.elapsed >= 0 && m.steps === 300) && prog.slice(1).every((m) => Number.isFinite(m.eta)), 'worker: elapsed, cap and estimate');
  t.ok(done && done.result.status.length === 2 && done.result.nport.known.every(Boolean), 'worker: done with both runs and the full N-port');
  for (const run of [0, 1]) {
    const parts = prog.filter((m) => m.run === run);
    const W = done.result.records.ports.length * Ru.RECORD;
    const joined = new Float64Array(parts.reduce((a, m) => a + m.rows.length, 0));
    let o = 0; for (const m of parts) { t.eq(m.from * W, o, `worker: run ${run} rows continue`); joined.set(m.rows, o); o += m.rows.length; }
    const full = done.result.records.runs[run].rec;
    t.ok(joined.length === full.length && joined.every((v, q) => v === full[q]), `worker: run ${run}'s partial rows add up to its record`);
  }
  const frames = prog.flatMap((m) => m.frames);
  t.ok(frames.length === done.result.snap.frames && frames.length > 0 && frames.every((f) => f.run === undefined && f.data[0] instanceof Uint8Array), () => `worker: ${frames.length} frames streamed, ${done.result.snap.frames} in the result`);
  t.ok(done.result.tdr.length === 1 && done.result.tdr[0].tr === done.result.records.trMin, 'worker: the TDR at tr_min');
  // cancel mid-run
  msgs = await runJob([{ req: { type: 'run', id: 2, job: { ...job, maxSteps: 4000 } } }, { after: (m) => m.filter((x) => x.type === 'progress').length === 2, req: { type: 'cancel', id: 2 } }], 20, (m) => m.some((x) => x.type === 'cancelled'));
  await new Promise((r) => setTimeout(r, 100));
  const ci = msgs.findIndex((m) => m.type === 'cancelled');
  t.ok(ci > 0 && ci === msgs.length - 1 && !msgs.some((m) => m.type === 'done'), () => `worker: cancelled after ${msgs.filter((m) => m.type === 'progress').length} progress messages, nothing after (${msgs.map((m) => m.type).slice(-3)})`);
  // a newer run cancels the older one
  msgs = await runJob([{ req: { type: 'run', id: 3, job: { ...job, maxSteps: 4000 } } }, { req: { type: 'run', id: 4, job: { ...job, maxSteps: 100, mode: 'tdr', snapshots: null } } }]);
  t.ok(msgs.some((m) => m.type === 'cancelled' && m.id === 3) && msgs.some((m) => m.type === 'done' && m.id === 4) && !msgs.some((m) => m.type === 'done' && m.id === 3), 'worker: a newer run cancels the older (one at a time)');
  const d4 = msgs.find((m) => m.type === 'done' && m.id === 4);
  t.ok(d4.result.status.length === 1 && d4.result.nport.known[0] && !d4.result.nport.known[1], 'worker: TDR mode runs port 1 alone (S column 1 known)');
  // refusal by the estimator (a rate that makes the run take hours)
  msgs = await runJob([{ req: { type: 'run', id: 5, job: { ...job, rate: 1e3 } } }]);
  const rf = msgs.find((m) => m.type === 'refused');
  t.ok(rf && rf.verdicts.some((v) => v.level === 'refuse' && v.code === 'time') && rf.offer && rf.offer.s > 1, () => `worker: refused with its reason and an offer (${JSON.stringify(rf?.verdicts)})`);
  // the client without a Worker (Node): the handler on the page
  const cl = new FC.FdtdClient();
  let seen = 0;
  const out = await cl.run({ ...job, maxSteps: 200, snapshots: null }, { progress: () => seen++ });
  t.ok(out && out.kind === 'done' && out.where === 'page' && seen > 0, () => `client: ran on the page (${out?.kind}, ${seen} progress)`);
  const p2 = cl.run({ ...job, maxSteps: 4000 }, { progress: () => cl.cancel() });
  const c2 = await p2;
  t.ok(c2 === null, () => `client: cancel gives null (${c2?.kind})`);
  const ref = await cl.run({ ...job, rate: 1e3 });
  t.eq(ref?.kind, 'refused', 'client: a refused run');
  cl.stop();
  // wiring as the bundler builds it
  const dir = new URL('../../../lib/emsim/', import.meta.url);
  t.ok(/createFdtdHandler/.test(readFileSync(new URL('fdtd.worker.ts', dir), 'utf8')) && /new URL\('\.\/fdtd\.worker\.ts', import\.meta\.url\)/.test(readFileSync(new URL('fdtdClient.ts', dir), 'utf8')), 'the worker wires the handler; the client creates it the way the bundler builds it');
}

function checkLong(t) {
  // a 12 mm section, port 1 alone: a long flat TDR
  const { p, r, ms } = microstrip(t, 12, 'tdr');
  const m = r.ports[0];
  const tdr = Ru.tdrOf(r, p.pulse.trMin);
  // flat between the reference plane and the far port's reflection (round trip to the port at 12 mm)
  const tau = (2 * (12 - m.sRef) * Math.sqrt(m.eeff)) / C0;
  const zf = flatZ(tdr, tau);
  t.ok(Math.abs(zf / Z2D - 1) < 0.01, () => `microstrip 12 mm: TDR flat ${zf.toFixed(3)} Ω (${((zf / Z2D - 1) * 100).toFixed(2)} %)`);
  rows.push({ name: 'microstrip 12 mm, port 1', cells: p.N, steps: `${r.runs[0].rows - 1}`, ms, z: zf, s11: NaN, rec: NaN, extra: '' });
  // the edge-coupled microstrip pair, 4 runs
  const su = Su.defaultSetup();
  const su2 = { ...su, trace: T.presetStructure('pair-microstrip', su.stackup, 0.12) };
  const b = Pr.buildProblem(su2, 'trace', {});
  const t0 = performance.now();
  const r2 = Ru.runProblem(b.problem, 'full');
  const ms2 = performance.now() - t0;
  const np = Ru.nportOf(r2);
  const rec = N.reciprocityError(np), pas = N.passivityExcess(np);
  t.ok(np.ports === 4 && np.known.every(Boolean), 'pair: full 4-port');
  t.ok(rec <= 1e-3, () => `pair: reciprocity max |Sij − Sji| ${rec.toExponential(2)}`);
  // one γ per feed moves both modes of the coupled feeds alike: 5.8·10⁻³ (also with 9 000 steps), BL155
  t.ok(pas <= 1e-2, () => `pair: passivity excess ${pas.toExponential(2)} (bar 10⁻² until BL155)`);
  t.ok(r2.runs.every((x) => x.status !== 'unstable'), () => `pair: runs ${r2.runs.map((x) => x.status)}`);
  const mm = N.toMixedMode(N.renormalize(np, [50, 50, 50, 50]), [[0, 2], [1, 3]]);
  t.ok(N.reciprocityError(mm) <= 2e-3, 'pair: mixed-mode S reciprocal');
  let s11 = 0; for (let q = 0; q < 4; q++) s11 = Math.max(s11, sMax(np, q, q));
  rows.push({ name: 'pair-microstrip, 4 runs', cells: b.problem.N, steps: r2.runs.map((x) => x.rows - 1).join('+'), ms: ms2, z: NaN, s11, rec, extra: `ports ${r2.ports.map((q) => q.name).join(', ')}; passivity excess ${pas.toExponential(1)}` });
}

export async function run(t) {
  checkMicrostrip(t);
  checkSnapshotValues(t);
  await checkWorker(t);
  if (LONG) checkLong(t);
  t.note('FDTD runs: case | cells | steps | run s | Z0 TDR vs 2D 51.50 Ω | |S11| max | reciprocity');
  for (const r of rows) t.note(`FDTD runs: ${r.name} | ${r.cells} | ${r.steps} | ${(r.ms / 1000).toFixed(1)} | ${Number.isFinite(r.z) ? `${r.z.toFixed(3)} (${((r.z / Z2D - 1) * 100).toFixed(2)} %)` : '–'} | ${Number.isFinite(r.s11) ? `${db(r.s11).toFixed(1)} dB` : '–'} | ${Number.isFinite(r.rec) ? r.rec.toExponential(1) : '–'}${r.extra ? ` | ${r.extra}` : ''}`);
  if (!LONG) t.note('FDTD runs: EMSIM_FDTD_LONG=1 adds the 12 mm section and the pair\'s 4-port');
}
