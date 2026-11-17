// Checks of a pair's drive in the Waves player (step M7.2a): lib/emsim/wavesPlayer.ts trackOf, the pair's slices of
// lib/emsim/fullwave.ts (snapOf through preview), snapshots.ts's components at the nodes (Nx, Ny, Nz) and the job's
// recorded runs (fdtd/job.ts, SnapSpec.runs). On the edge-coupled microstrip pair (3 mm section, the CPU, f32):
// (a) the pair's slices: a via's side view and a trace's views from above and across as Nx, Ny, Nz, the player's
//     components |E|, Ez and the one across the picture; runs [0, entry B]; the estimate's frames memory equals the
//     plan of the allocated problem for both runs, within the 64 MiB budget;
// (b) the components at the nodes: |E| from Nx, Ny, Nz equals the recorder's own |E| within their quantisation, and the
//     other slices' frames are unchanged by them (the engine's numbers);
// (c) linearity: the entry A and entry B runs combined as values (A − B, A + B) against a run driven at both ports
//     at once (A + 1 V, B ∓ 1 V) on every component of both views, within the stated quantisation bound, and against
//     the exact A ∓ B of the dequantised frames within half a step of the combined frame's scale;
// (d) symmetry about the pair's mid-plane (x = 0) from above: Ez of the common drive even, of the differential odd;
// (e) the job: frames of entry A's and entry B's excitations only, tagged with their run, the result's runs and bytes.
//   (part of npm run check: group "Waves drive (M7.2a)")

import { performance } from 'node:perf_hooks';
import * as Su0 from '../../../lib/emsim/setup.ts';
import * as St0 from '../../../lib/emsim/structure.ts';
import * as V0 from '../../../lib/emsim/via.ts';
import * as Pr0 from '../../../lib/emsim/fdtd/problem.ts';
import * as Ru0 from '../../../lib/emsim/fdtd/run.ts';
import * as Sn0 from '../../../lib/emsim/fdtd/snapshots.ts';
import * as J0 from '../../../lib/emsim/fdtd/job.ts';
import * as Fw0 from '../../../lib/emsim/fullwave.ts';
import * as Wp0 from '../../../lib/emsim/wavesPlayer.ts';

const d = (m) => m.default ?? m;
const Su = d(Su0), St = d(St0), V = d(V0), Pr = d(Pr0), Ru = d(Ru0), Sn = d(Sn0), J = d(J0), Fw = d(Fw0), Wp = d(Wp0);
const DEV = { gpu: { ok: false, reason: '' }, js: { backend: 'js' }, mobile: false };
const STEPS = 900; // the pair's runs: the pulse (t0 = 5σ) into the section and along it
const FRAMES = 45;

export function pairTrace() {
  const s = Su.defaultSetup();
  s.trace = St.presetStructure('pair-microstrip', s.stackup, 0.15);
  return s;
}
export function pairVia() {
  const s = Su.defaultSetup();
  const pre = V.presetVia('pair', s.stackup);
  s.via = { ...pre, feeds: [{ ...pre.feeds[0], angle: 180 }, { ...pre.feeds[1], angle: 0 }] };
  return s;
}

export async function run(t) {
  const ctx = checkSlices(t);
  checkNodes(t, ctx);
  const runs = checkLinear(t, ctx);
  checkSymmetry(t, ctx, runs);
  await checkJob(t, ctx);
}

const deq = (f, s, q) => f.data[s][q] * f.scale[s];

function checkSlices(t) {
  const via = Fw.preview(pairVia(), { kind: 'via', tr: 35e-12, length: 10, backend: 'js' }, DEV);
  t.ok(via.pair && via.snap.runs.join() === '0,1', () => `via pair: records entry A and entry B (runs ${via.snap.runs})`);
  t.eq(via.views.join(), 'side,side,side,entry,cavity,exit', 'via pair: the views');
  t.eq(via.snap.slices.map((s) => s.comp).join(), 'Nx,Ny,Nz,Ez,Ez,Ez', 'via pair: the side view as the components at the nodes');
  const fake = (pv) => pv.snap.slices.map((s) => ({ ...s, nu: 2, nv: 2, u: new Float32Array(2), v: new Float32Array(2) }));
  const vv = Wp.playerViews(fake(via), via.views);
  t.eq(vv.map((v) => `${v.view}:${v.comps.join('/')}`).join(' '), 'side:E/Ez/Ex entry:Ez cavity:Ez exit:Ez', 'via pair: the player\'s views and components');
  t.eq(JSON.stringify(vv[0].src), '[[0,1,2],[2],[0]]', 'via pair: |E| from Nx, Ny, Nz; Ez from Nz; Ex from Nx');
  const single = Fw.preview(Su.defaultSetup(), { kind: 'via', tr: 35e-12, length: 10, backend: 'js' }, DEV);
  t.ok(!single.pair && !single.snap.runs && single.snap.slices.map((s) => s.comp).join() === 'E,Ez,Ex,Ez,Ez,Ez', 'a single via: entry A only, the slices of M7.1b');
  t.ok(single.snapBytes > 0 && via.snapBytes > 0 && via.snapBytes <= Sn.SNAP_BUDGET, () => `frames memory: C44 ${(single.snapBytes / 1048576).toFixed(1)} MiB, C45 pair ${(via.snapBytes / 1048576).toFixed(1)} MiB (both runs)`);

  const su = pairTrace();
  const tr = Fw.preview(su, { kind: 'trace', tr: 35e-12, length: 3, backend: 'js' }, DEV);
  t.ok(tr.pair && tr.snap.runs.join() === '0,2' && tr.geom.ports[2].name === 'T2.1', () => `trace pair: records T1.1 and T2.1 (runs ${tr.snap.runs}, ports ${tr.geom.ports.map((p) => p.name)})`);
  t.eq(tr.views.join(), 'above,above,above,across,across,across', 'trace pair: the views (along trace 1 left out)');
  const tv = Wp.playerViews(fake(tr), tr.views);
  t.eq(tv.map((v) => `${v.view}:${v.comps.join('/')}`).join(' '), 'above:E/Ez across:E/Ez/Ex', 'trace pair: the player\'s views and components');
  const b = Pr.buildProblem(su, 'trace', { trMin: 35e-12, length: tr.model.length, precision: 'f32' });
  const p = b.problem;
  const pl = Sn.snapPlan(p, tr.snap, Ru.stepsCap(p));
  t.ok(tr.snapBytes === 2 * pl.bytes && Sn.snapPlanOf(b.mesh, tr.snap, b.est.steps).bytes === pl.bytes, () => `trace pair: the estimate's frames ${tr.snapBytes} B = 2 × the plan's ${pl.bytes} B`);
  t.ok(2 * pl.bytes <= Sn.SNAP_BUDGET, 'trace pair: both runs within the budget');
  t.note(`frames memory: C44 ${(single.snapBytes / 1048576).toFixed(1)} MiB (entry A), C45 pair ${(via.snapBytes / 1048576).toFixed(1)} MiB (A and B), trace pair 3 mm ${(tr.snapBytes / 1048576).toFixed(1)} MiB`);
  return { p, spec: { ...tr.snap, frames: FRAMES }, views: tr.views, geom: tr.geom };
}

/** One excitation with its own recorder: the frames and the run's maxima. */
function excite(p, drive, spec, steps = STEPS) {
  p.E.fill(0); p.H.fill(0);
  const rec = new Sn.SnapRecorder(p, spec, steps);
  const x = new Ru.Excitation(p, drive, { maxSteps: steps, snap: rec });
  x.advance(steps);
  return { frames: rec.drain(), max: Array.from(rec.max), plan: rec.plan };
}

function checkNodes(t, ctx) {
  const { p } = ctx;
  // the plane from above with |E| beside the components at the nodes, and an edge Ez
  const at = ctx.spec.slices[0].at;
  const spec = { comp: 'E', frames: 30, slices: [{ normal: 'z', at, comp: 'Nx' }, { normal: 'z', at, comp: 'Ny' }, { normal: 'z', at, comp: 'Nz' }, { normal: 'z', at, comp: 'E' }, { normal: 'z', at, comp: 'Ez' }] };
  const r = excite(p, [1, 0, 0, 0], spec, 600);
  let worst = 0, n = 0;
  for (const f of r.frames) {
    const m = f.data[3].length;
    for (let q = 0; q < m; q++) {
      const c = [0, 1, 2].map((s) => deq(f, s, q));
      const mag = Math.hypot(...c);
      const tol = f.scale[3] / 2 + Math.hypot(f.scale[0], f.scale[1], f.scale[2]) / 2 + 1e-9;
      worst = Math.max(worst, Math.abs(mag - deq(f, 3, q)) / tol);
      n++;
    }
  }
  t.ok(r.frames.length >= 25 && worst <= 1, () => `|E| from Nx, Ny, Nz against the recorder's |E|: worst ${worst.toFixed(3)} of the bound (½ step of each), ${n} samples`);
  const alone = excite(p, [1, 0, 0, 0], { comp: 'Ez', frames: 30, slices: [{ normal: 'z', at }] }, 600);
  const same = alone.frames.length === r.frames.length && alone.frames.every((f, i) => f.scale[0] === r.frames[i].scale[4] && f.data[0].every((x, q) => x === r.frames[i].data[4][q]));
  t.ok(same, 'the edge Ez beside the components at the nodes: its frames equal a recorder of Ez alone');
  // entry A alone through trackOf: |E| from the nodes is the same as the recorder's |E| (one more rounding)
  const tk = Wp.trackOf([r.frames, []], [0, 1, 2], 'E', 'single', r.max);
  let w2 = 0;
  tk.frames.forEach((f, i) => { const g = r.frames[i]; for (let q = 0; q < f.data[0].length; q++) w2 = Math.max(w2, Math.abs(deq(f, 0, q) - deq(g, 3, q)) / (f.scale[0] / 2 + g.scale[3] / 2 + Math.hypot(g.scale[0], g.scale[1], g.scale[2]) / 2)); });
  t.ok(w2 <= 1, () => `entry A alone, |E| through trackOf: within the bound of the recorder's |E| (worst ${w2.toFixed(3)})`);
  const raw = Wp.trackOf([r.frames, []], [4], 'Ez', 'single', r.max);
  t.ok(raw.frames === r.frames && raw.si === 4 && raw.max === r.max[4], 'entry A alone on one slice: its own frames, untouched');
}

function checkLinear(t, ctx) {
  const { p, spec } = ctx;
  const t0 = performance.now();
  const A = excite(p, [1, 0, 0, 0], spec), B = excite(p, [0, 0, 1, 0], spec);
  const D = excite(p, [1, 0, -1, 0], spec), C = excite(p, [1, 0, 1, 0], spec);
  const ms = performance.now() - t0;
  t.ok(A.frames.length === FRAMES && [B, C, D].every((r) => r.frames.length === FRAMES), () => `four runs of ${STEPS} steps, ${FRAMES} frames each`);
  const views = Wp.playerViews(A.plan.slices, ctx.views);
  const lines = [];
  let allOk = true, exactOk = true, worstRel = 0, worstExact = 0, tDerive = 0, samples = 0;
  for (const [mode, run, sign] of [['diff', D, -1], ['common', C, 1]]) {
    for (const v of views) v.comps.forEach((comp, k) => {
      const src = v.src[k];
      const c0 = performance.now();
      const tk = Wp.trackOf([A.frames, B.frames], src, comp, mode, A.max);
      tDerive += performance.now() - c0;
      let worst = 0, rel = 0, ex = 0;
      tk.frames.forEach((f, i) => {
        const fa = A.frames[i], fb = B.frames[i], fd = run.frames[i];
        const m = f.data[0].length;
        samples += m * src.length * 2;
        for (let q = 0; q < m; q++) {
          const ab = src.map((s) => deq(fa, s, q) + sign * deq(fb, s, q));
          const dd = src.map((s) => deq(fd, s, q));
          const qab = src.map((s) => (fa.scale[s] + fb.scale[s]) / 2), qd = src.map((s) => fd.scale[s] / 2);
          const exact = comp === 'E' ? Math.hypot(...ab) : ab[0];
          const direct = comp === 'E' ? Math.hypot(...dd) : dd[0];
          const got = deq(f, 0, q);
          const tol = f.scale[0] / 2 + (comp === 'E' ? Math.hypot(...src.map((_, c) => qab[c] + qd[c])) : qab[0] + qd[0]) + 1e-6 * f.scale[0];
          worst = Math.max(worst, Math.abs(got - direct) / tol);
          rel = Math.max(rel, Math.abs(got - direct) / tk.max);
          ex = Math.max(ex, Math.abs(got - exact) / (f.scale[0] * (0.5 + 1e-4) + 1e-30)); // ½ step, and the f32 scale's rounding
        }
      });
      if (worst > 1) allOk = false;
      if (ex > 1) exactOk = false;
      worstRel = Math.max(worstRel, rel); worstExact = Math.max(worstExact, ex);
      lines.push(`${mode} ${v.view} ${comp} ${worst.toFixed(2)}`);
    });
  }
  t.ok(allOk, () => `A ∓ B as values against a run driven at both ports: within the quantisation bound on every component (worst of the bound: ${lines.join(', ')})`);
  t.ok(exactOk, () => `the combined frames against the exact A ∓ B of the dequantised frames: within ½ step of their scale (worst ${worstExact.toFixed(3)})`);
  t.ok(worstRel <= 0.02, () => `A ∓ B against the run at both ports: worst ${(100 * worstRel).toFixed(2)} % of the drive's largest value over the run (bar 2 %: about two 8-bit steps of the runs' own scales)`);
  t.note(`drive linearity (pair-microstrip 3 mm, ${p.N} cells, ${STEPS} steps, ${FRAMES} frames, 4 runs in ${(ms / 1000).toFixed(1)} s): combined against the run at both ports, worst of the quantisation bound ${lines.join(', ')}; worst ${(100 * worstRel).toFixed(2)} % of the run's largest value; trackOf ${(tDerive / samples * 1e6).toFixed(2)} ms per million samples read`);
  return { A, B, C, D };
}

function checkSymmetry(t, ctx, runs) {
  const { A, B } = runs;
  const views = Wp.playerViews(A.plan.slices, ctx.views);
  const above = views.find((v) => v.view === 'above');
  const k = above.comps.indexOf('Ez'), info = A.plan.slices[above.src[k][0]];
  // mirror x → −x (u of the view from above): linear interpolation on the graded mesh
  const u = info.u, mirror = (vals, j, x) => {
    if (x <= u[0] || x >= u[u.length - 1]) return NaN;
    let i = 0; while (u[i + 1] < x) i++;
    const w = (x - u[i]) / (u[i + 1] - u[i]);
    return vals[i + info.nu * j] * (1 - w) + vals[i + 1 + info.nu * j] * w;
  };
  const sym = (mode, sign) => {
    const tk = Wp.trackOf([A.frames, B.frames], above.src[k], 'Ez', mode, A.max);
    let worst = 0, at = 0;
    tk.frames.forEach((f, fi) => {
      const vals = Float64Array.from(f.data[0], (q) => q * f.scale[0]);
      let mx = 0; for (const x of vals) mx = Math.max(mx, Math.abs(x));
      if (mx < 1e-3 * tk.max) return; // before the pulse
      for (let j = 0; j < info.nv; j++) for (let i = 0; i < info.nu; i++) {
        const m = mirror(vals, j, -u[i]);
        if (Number.isNaN(m)) continue;
        const e = Math.abs(vals[i + info.nu * j] - sign * m) / mx;
        if (e > worst) { worst = e; at = fi; }
      }
    });
    return { worst, at };
  };
  const c = sym('common', 1), dd = sym('diff', -1), ad = sym('diff', 1), single = sym('single', 1);
  t.ok(c.worst <= 0.03, () => `common drive from above: Ez even about the mid-plane within ${(100 * c.worst).toFixed(2)} % of the frame's largest value (bar 3 %)`);
  t.ok(dd.worst <= 0.03, () => `differential drive from above: Ez odd about the mid-plane within ${(100 * dd.worst).toFixed(2)} % (bar 3 %)`);
  t.ok(ad.worst > 0.5 && single.worst > 0.3, () => `the checks see a difference: the differential drive is not even (${(100 * ad.worst).toFixed(0)} %), entry A alone not even (${(100 * single.worst).toFixed(0)} %)`);
  t.note(`symmetry from above (Ez, mirror x → −x, linear on the graded mesh): common even within ${(100 * c.worst).toFixed(2)} %, differential odd within ${(100 * dd.worst).toFixed(2)} % of each frame's largest value`);
}

async function checkJob(t, ctx) {
  const msgs = [];
  const handle = J.createFdtdHandler((m) => msgs.push(m), (fn) => setTimeout(fn, 0), 50, {});
  const su = pairTrace();
  await new Promise((resolve) => {
    const iv = setInterval(() => { if (msgs.some((m) => ['done', 'error', 'refused'].includes(m.type))) { clearInterval(iv); resolve(); } }, 20);
    handle({ type: 'run', id: 1, job: { setup: su, kind: 'trace', model: { length: 3 }, backend: 'js', rate: 4e7, maxSteps: 240, snapshots: { ...ctx.spec, frames: 20 } } });
  });
  const st = msgs.find((m) => m.type === 'started'), dn = msgs.find((m) => m.type === 'done');
  t.ok(!!dn, () => `the job ran: ${msgs.map((m) => m.type).join(',')} ${msgs.find((m) => m.type === 'error')?.message ?? ''}`);
  if (!dn) return;
  const per = [0, 0, 0, 0];
  for (const m of msgs) if (m.type === 'progress') per[m.run] += m.frames.length;
  const s = dn.result.snap;
  t.ok(st.info.snapRuns.join() === '0,2' && per[0] === 20 && per[2] === 20 && per[1] === 0 && per[3] === 0, () => `the job's frames: of excitations 1 and 3 only (${per.join(', ')}), started ${st.info.snapRuns}`);
  t.ok(s.runs.map((r) => `${r.run}:${r.frames}`).join() === '0:20,2:20' && s.frames === 20 && s.max === s.runs[0].max && s.bytes === st.info.snapBytes, () => `the result: ${JSON.stringify({ runs: s.runs.map((r) => r.run), frames: s.frames, bytes: s.bytes, started: st.info.snapBytes })}`);
}
