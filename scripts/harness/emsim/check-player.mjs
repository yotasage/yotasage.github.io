// Checks of the Waves section's player (step M7.1b): lib/emsim/wavesPlayer.ts and the snapshot slices of
// lib/emsim/fullwave.ts (snapOf through preview), with snapshots.ts's per-slice components.
// (a) a slice's own component gives the frames a recorder of that component alone gives (the engine's numbers are
//     untouched: one gather per slice, the same quantisation);
// (b) the slices of a via (side |E|, Ez, Ex; entry, cavity, exit Ez) and of a trace, at the planes they name;
// (c) the fixed scale: the PLAY_CLIP quantile of all values of all frames, within one histogram bin of a sort; with
//     clip 1 the run's maximum; the same whatever the frames' order;
// (d) a frame's pixels against an independent bilinear sampling of the same frame on the graded mesh (colormap.ts's
//     index of each value), and the time framePixels takes for RASTER_CAP pixels;
// (e) the outline of the C44 via: the side view's barrel, the plane cut at its antipad, the pads; the top views' discs,
//     antipads, feeds and ports; a trace's ports;
// (f) the axes' ticks in mil and µm, the playback clock (speed, loop, the end).

import { performance } from 'node:perf_hooks';
import * as Su0 from '../../../lib/emsim/setup.ts';
import * as V0 from '../../../lib/emsim/via.ts';
import * as Pr0 from '../../../lib/emsim/fdtd/problem.ts';
import * as Ru0 from '../../../lib/emsim/fdtd/run.ts';
import * as Sn0 from '../../../lib/emsim/fdtd/snapshots.ts';
import * as Fw0 from '../../../lib/emsim/fullwave.ts';
import * as Cm0 from '../../../lib/emsim/colormap.ts';
import * as Wp0 from '../../../lib/emsim/wavesPlayer.ts';

const d = (m) => m.default ?? m;
const Su = d(Su0), V = d(V0), Pr = d(Pr0), Ru = d(Ru0), Sn = d(Sn0), Fw = d(Fw0), Cm = d(Cm0), Wp = d(Wp0);
const DEV = { gpu: { ok: false, reason: '' }, js: { backend: 'js' }, mobile: false };

export async function run(t) {
  checkComponents(t);
  checkSlices(t);
  checkScale(t);
  checkPixels(t);
  checkOutline(t);
  checkAxesClock(t);
}

function checkComponents(t) {
  const p = Pr.buildProblem(Su.defaultSetup(), 'trace', { length: 3 }).problem;
  const mixed = { comp: 'E', slices: [{ normal: 'x', at: 0, comp: 'Ez' }, { normal: 'x', at: 0 }, { normal: 'z', at: 1.59, comp: 'Ey' }] };
  const take = (spec) => {
    p.E.fill(0); p.H.fill(0);
    const rec = new Sn.SnapRecorder(p, spec, 400);
    const x = new Ru.Excitation(p, [1], { maxSteps: 400, snap: rec });
    x.advance(160);
    return { rec, f: rec.drain() };
  };
  const a = take(mixed);
  t.ok(a.rec.plan.slices.map((s) => s.comp).join() === 'Ez,E,Ey', () => `per-slice components: ${a.rec.plan.slices.map((s) => s.comp)}`);
  t.ok(a.f.length > 2 && a.f.every((f) => f.data[0] instanceof Int8Array && f.data[1] instanceof Uint8Array && f.data[2] instanceof Int8Array), 'per-slice components: int8 for a component, u8 for |E|');
  const alone = [take({ comp: 'Ez', slices: [{ normal: 'x', at: 0 }] }), take({ comp: 'E', slices: [{ normal: 'x', at: 0 }] }), take({ comp: 'Ey', slices: [{ normal: 'z', at: 1.59 }] })];
  let same = true;
  alone.forEach((b, s) => {
    if (b.f.length !== a.f.length) same = false;
    b.f.forEach((f, q) => {
      const g = a.f[q];
      if (f.step !== g.step || f.scale[0] !== g.scale[s] || f.data[0].length !== g.data[s].length) same = false;
      else for (let i = 0; i < f.data[0].length; i++) if (f.data[0][i] !== g.data[s][i]) { same = false; break; }
    });
    if (b.rec.max[0] !== a.rec.max[s]) same = false;
  });
  t.ok(same, 'per-slice components: every slice\'s frames and maximum equal a recorder of that component alone');
}

function checkSlices(t) {
  const via = Su.defaultSetup();
  const pv = Fw.preview(via, { kind: 'via', tr: 35e-12, length: 10, backend: 'js' }, DEV);
  t.eq(pv.views.join(), 'side,side,side,entry,cavity,exit', 'via slices: the views');
  t.eq(pv.snap.slices.map((s) => s.comp).join(), 'E,Ez,Ex,Ez,Ez,Ez', 'via slices: the components');
  const m = pv.geom, p0 = m.ports[0], q = m.ports.find((x) => x.layer !== p0.layer);
  const [l2, l5] = m.cu.filter((c) => c.plane);
  t.ok(pv.snap.slices[0].normal === 'y' && pv.snap.slices[0].at === 0, 'via slices: the side view through the barrel along its feeds (normal y at 0)');
  t.near(pv.snap.slices[3].at, (p0.zSig + p0.ref.z) / 2, 'via slices: the entry view halfway between the feed and its plane');
  t.near(pv.snap.slices[4].at, (l2.zb + l5.zt) / 2, 'via slices: the cavity view halfway between the two planes');
  t.near(pv.snap.slices[5].at, (q.zSig + q.ref.z) / 2, 'via slices: the exit view halfway between its feed and plane');
  const views = Wp.playerViews(pv.snap.slices.map((s, i) => ({ ...s, nu: 2, nv: 2, u: new Float32Array(2), v: new Float32Array(2), comp: s.comp })), pv.views);
  t.eq(views.map((v) => `${v.view}:${v.comps.join('/')}`).join(' '), 'side:E/Ez/Ex entry:Ez cavity:Ez exit:Ez', 'player views: one per plane with its components');
  const tr = Fw.preview(Su.defaultSetup(), { kind: 'trace', tr: 35e-12, length: 4, backend: 'js' }, DEV);
  t.eq(tr.views.join(), 'above,above,along,across', 'trace slices: the views');
  const tp = tr.geom.ports;
  t.near(tr.snap.slices[3].at, (tp[0].pos + tp[1].pos) / 2, 'trace slices: across the section\'s middle');
  // the planned frames of the C44 run fit the budget
  const b = Pr.buildProblem(via, 'via', { trMin: 35e-12, precision: 'f32' });
  const pl = Sn.snapPlan(b.problem, pv.snap, Ru.stepsCap(b.problem));
  t.ok(pl.slices.length === 6 && pl.bytes <= Sn.SNAP_BUDGET && pl.frames >= 250, () => `C44: ${pl.slices.length} slices, ${pl.frames} frames every ${pl.every} steps, ${(pl.bytes / 1048576).toFixed(1)} MiB`);
  t.note(`C44 snapshots: ${pl.slices.map((s) => `${s.comp} ${s.normal}@${s.at.toFixed(3)} ${s.nu}×${s.nv}`).join(', ')}; ${pl.frames} frames, ${(pl.bytes / 1048576).toFixed(1)} MiB`);
}

// synthetic frames: a travelling pulse with a few hot samples, per-frame scales as SnapRecorder makes them
function synth(n, nu, nv, signed, seed = 1) {
  let r = seed;
  const rnd = () => { r = (r * 16807) % 2147483647; return r / 2147483647; };
  const frames = [];
  let max = 0;
  for (let f = 0; f < n; f++) {
    const vals = new Float64Array(nu * nv);
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
      const x = i / nu - f / n;
      let v = 1000 * Math.exp(-((x * 8) ** 2)) * (signed ? Math.cos(j / 3) : 1) + 5 * (rnd() - 0.5);
      if (!signed) v = Math.abs(v);
      if (i === 3 && j === 2) v = 8000 * (f + 1) / n; // a hot spot
      vals[i + nu * j] = v;
    }
    const mx = vals.reduce((a, v) => Math.max(a, Math.abs(v)), 0);
    const sc = mx / (signed ? 127 : 255);
    const data = signed ? Int8Array.from(vals, (v) => Math.round(v / sc)) : Uint8Array.from(vals, (v) => Math.round(v / sc));
    frames.push({ step: f + 1, t: (f + 1) * 1e-13, data: [data], scale: Float32Array.of(sc) });
    max = Math.max(max, mx);
  }
  return { frames, max };
}

function checkScale(t) {
  for (const signed of [false, true]) {
    const { frames, max } = synth(60, 40, 30, signed);
    const ps = Wp.playScale(frames, 0, signed ? 'Ez' : 'E', max);
    const all = [];
    for (const f of frames) for (const q of f.data[0]) all.push(Math.abs(q * f.scale[0]));
    all.sort((a, b) => a - b);
    const want = all[Math.ceil(Wp.PLAY_CLIP * all.length) - 1];
    t.ok(Math.abs(ps.top - want) <= (2 * max) / 4096 + 1e-9, () => `${signed ? 'signed' : '|E|'} scale: top ${ps.top.toFixed(1)} against the ${Wp.PLAY_CLIP} quantile ${want.toFixed(1)} (bin ${(max / 4096).toFixed(2)})`);
    t.ok(ps.clipped <= 1 - Wp.PLAY_CLIP + 1e-9 && ps.top < max, () => `${signed ? 'signed' : '|E|'} scale: ${(ps.clipped * 100).toFixed(3)} % above the top, which is under the maximum`);
    t.ok(signed ? ps.scale.lo === -ps.top && ps.scale.map === 'diverging' : ps.scale.lo === 0 && ps.scale.map === 'sequential', `${signed ? 'signed' : '|E|'} scale: map and range`);
    const rev = Wp.playScale(frames.slice().reverse(), 0, signed ? 'Ez' : 'E', max);
    t.eq(rev.top, ps.top, `${signed ? 'signed' : '|E|'} scale: the same in any order of the frames`);
    const full = Wp.playScale(frames, 0, signed ? 'Ez' : 'E', max, 1);
    t.near(full.top, max, `${signed ? 'signed' : '|E|'} scale: clip 1 gives the run's maximum`, 1e-9);
  }
}

function checkPixels(t) {
  // a graded mesh: cells from 0.02 to 0.3 mm
  const g = (n, h0) => { const a = [0]; let h = h0; for (let i = 1; i < n; i++) { a.push(a[i - 1] + h); h = Math.min(0.3, h * 1.3); } return Float32Array.from(a); };
  const u = g(40, 0.02), v = g(30, 0.03);
  for (const signed of [false, true]) {
    const { frames, max } = synth(20, u.length, v.length, signed, 7);
    const info = { comp: signed ? 'Ez' : 'E', normal: 'y', at: 0, nu: u.length, nv: v.length, u, v };
    const ps = Wp.playScale(frames, 0, info.comp, max);
    const W = 173, H = 91, r = Wp.rasterOf(info, W, H);
    const out = new Uint32Array(W * H), tab = Cm.mapTable(ps.scale.map);
    let bad = 0, worst = 0;
    for (const f of [frames[3], frames[15]]) {
      Wp.framePixels(r, f.data[0], f.scale[0], ps, out);
      for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
        // independently: the pixel's centre in mm, its bracket by a linear search, bilinear in the values
        const x = u[0] + ((i + 0.5) / W) * (u[u.length - 1] - u[0]), y = v[v.length - 1] - ((j + 0.5) / H) * (v[v.length - 1] - v[0]);
        const br = (g2, z) => { for (let k = 0; k + 1 < g2.length; k++) if (z >= g2[k] && z <= g2[k + 1]) return [k, (z - g2[k]) / (g2[k + 1] - g2[k])]; return z < g2[0] ? [0, 0] : [g2.length - 2, 1]; };
        const [ku, wu] = br(u, x), [kv, wv] = br(v, y);
        const at = (a, b) => f.data[0][a + u.length * b] * f.scale[0];
        const val = (1 - wv) * ((1 - wu) * at(ku, kv) + wu * at(ku + 1, kv)) + wv * ((1 - wu) * at(ku, kv + 1) + wu * at(ku + 1, kv + 1));
        const e = Wp.indexOfValue(ps, val), w = out[i + W * j];
        const got = [w & 255, (w >>> 8) & 255, (w >>> 16) & 255];
        // the table index whose colour the pixel has (neighbouring entries differ)
        let gi = -1;
        for (let q = Math.max(0, e - 2); q <= Math.min(255, e + 2); q++) if (tab[3 * q] === got[0] && tab[3 * q + 1] === got[1] && tab[3 * q + 2] === got[2]) { gi = q; if (q === e) break; }
        const dd = gi < 0 ? 99 : Math.abs(gi - e);
        if (dd > 0) bad++;
        worst = Math.max(worst, dd);
        if ((w >>> 24) !== 255) worst = 99;
      }
    }
    t.ok(worst <= 1 && bad <= 0.002 * 2 * W * H, () => `${signed ? 'signed' : '|E|'} pixels: ${bad} of ${2 * W * H} off by ${worst} table entries against an independent bilinear sampling (bar: ≤ 1 entry at ≤ 0.2 %, rounding at entry edges)`);
  }
  // the time per frame for the largest raster
  const { frames, max } = synth(4, 93, 53, true, 3);
  const info = { comp: 'Ez', normal: 'y', at: 0, nu: 93, nv: 53, u: Float32Array.from({ length: 93 }, (_, i) => i * 0.1), v: Float32Array.from({ length: 53 }, (_, i) => i * 0.07) };
  const ps = Wp.playScale(frames, 0, 'Ez', max);
  const sz = Wp.rasterSize(1800, 760);
  const r = Wp.rasterOf(info, sz.w, sz.h), out = new Uint32Array(sz.w * sz.h);
  for (let k = 0; k < 20; k++) Wp.framePixels(r, frames[k % 4].data[0], frames[k % 4].scale[0], ps, out);
  const t0 = performance.now();
  for (let k = 0; k < 50; k++) Wp.framePixels(r, frames[k % 4].data[0], frames[k % 4].scale[0], ps, out);
  const ms = (performance.now() - t0) / 50;
  t.ok(sz.w * sz.h <= Wp.RASTER_CAP * 1.01 && ms < 4, () => `framePixels: ${sz.w}×${sz.h} px in ${ms.toFixed(2)} ms (budget 4 ms, Node)`);
  t.note(`framePixels: ${sz.w}×${sz.h} px (a 1800×760 canvas capped to ${Wp.RASTER_CAP}) in ${ms.toFixed(2)} ms`);
}

function checkOutline(t) {
  const pv = Fw.preview(Su.defaultSetup(), { kind: 'via', tr: 35e-12, length: 10, backend: 'js' }, DEV);
  const m = pv.geom, box = { u0: m.extent.x[0], u1: m.extent.x[1], v0: m.extent.z[0], v1: m.extent.z[1] };
  const side = Wp.outlineOf(m, 'y', 0, box);
  const rect = (p) => [Math.min(...p.map((q) => q[0])), Math.max(...p.map((q) => q[0])), Math.min(...p.map((q) => q[1])), Math.max(...p.map((q) => q[1]))];
  const rs = side.copper.map(rect);
  const bar = m.cyl.find((c) => c.name === 'barrel');
  t.ok(rs.some((r) => Math.abs(r[0] + 0.15) < 1e-9 && Math.abs(r[1] - 0.15) < 1e-9 && Math.abs(r[2] - bar.z0) < 1e-9 && Math.abs(r[3] - bar.z1) < 1e-9), 'outline (side): the barrel Ø0.3 over its length');
  const l2 = m.cu.find((c) => c.id === 'L2');
  const onL2 = rs.filter((r) => Math.abs(r[2] - l2.zb) < 1e-9 && Math.abs(r[3] - l2.zt) < 1e-9).sort((a, b) => a[0] - b[0]);
  t.ok(onL2.length === 3 && Math.abs(onL2[0][1] + 0.9) < 1e-9 && Math.abs(onL2[1][0] + 0.3) < 1e-9 && Math.abs(onL2[1][1] - 0.3) < 1e-9 && Math.abs(onL2[2][0] - 0.9) < 1e-9 && Math.abs(onL2[0][0] - box.u0) < 1e-9,
    () => `outline (side): L2 cut at its Ø1.8 antipad with the Ø0.6 pad inside (${onL2.map((r) => `${r[0].toFixed(2)}…${r[1].toFixed(2)}`).join(', ')})`);
  t.ok(side.faces.length === 2 && side.ports.length === 2 && side.ports.every((p) => Math.abs(Math.abs(p.a[0]) - Math.abs(m.ports[0].pos)) < 1e-9), () => `outline (side): the board's faces and both ports at the feeds' ends (${side.ports.map((p) => `${p.name} ${p.a[0].toFixed(2)}`).join(', ')})`);
  const topBox = { u0: m.extent.x[0], u1: m.extent.x[1], v0: m.extent.y[0], v1: m.extent.y[1] };
  const entry = Wp.outlineOf(m, 'z', pv.snap.slices[3].at, topBox);
  const circles = (o) => o.beside.flat().filter((x) => x.k === 'circle').map((x) => x.r).sort((x, y) => x - y);
  t.ok(entry.discs.length === 3 && entry.discs.some((c) => c.u === 0 && c.v === 0 && c.r === 0.15), () => `outline (entry): the barrel and both return vias cut (${entry.discs.length})`);
  t.ok(circles(entry).join() === '0.3,0.9' && entry.beside.flat().filter((x) => x.k === 'poly').length === 1 && entry.beside.length === 2, () => `outline (entry): the L1 pad and feed above, the L2 antipad below (${circles(entry)})`);
  t.ok(entry.ports.length === 1 && entry.ports[0].name === m.ports[0].name, () => `outline (entry): the entry port only (${entry.ports.map((p) => p.name)})`);
  const fb = Wp.focusBox(m, 'y', box), feedEnd = Math.max(...m.ports.map((p) => Math.abs(p.pos)));
  t.ok(fb.u0 < -feedEnd && fb.u1 > feedEnd && fb.u1 - fb.u0 < box.u1 - box.u0 && fb.v0 < 0 && fb.v1 > m.thick && fb.v1 - fb.v0 < box.v1 - box.v0,
    () => `focus (side): ports and board inside, less than the mesh (${fb.u0.toFixed(2)}…${fb.u1.toFixed(2)} × ${fb.v0.toFixed(2)}…${fb.v1.toFixed(2)} mm of ${box.u0.toFixed(2)}…${box.u1.toFixed(2)} × ${box.v0}…${box.v1.toFixed(2)})`);
  const cav = Wp.outlineOf(m, 'z', pv.snap.slices[4].at, topBox);
  t.ok(cav.discs.length === 3 && circles(cav).join() === '0.3,0.3,0.9,0.9' && cav.ports.length === 0, () => `outline (cavity): barrels, the L3 and L4 pads and both antipads, no port (${circles(cav)})`);
  const tr = Fw.preview(Su.defaultSetup(), { kind: 'trace', tr: 35e-12, length: 4, backend: 'js' }, DEV);
  const tm = tr.geom, above = Wp.outlineOf(tm, 'z', tr.snap.slices[0].at, { u0: tm.extent.x[0], u1: tm.extent.x[1], v0: tm.extent.y[0], v1: tm.extent.y[1] });
  t.ok(above.ports.length === 2 && above.beside.length >= 1 && above.discs.length === 0, () => `outline (trace from above): its two ports and the trace (${above.ports.length}, ${above.beside.length})`);
}

function checkAxesClock(t) {
  const mil = Wp.axisTicks(-4, 4, 'mil', 5);
  t.ok(mil.length >= 3 && mil.every((k) => Math.abs(k.mm / 0.0254 - Number(k.text.replace('−', '-'))) < 1e-6) && mil.every((k) => Number(k.text.replace('−', '-')) % 50 === 0), () => `ticks in mil: ${mil.map((k) => k.text).join(' ')}`);
  const um = Wp.axisTicks(0, 1.7, 'um', 4);
  t.ok(um.length >= 3 && um[0].mm === 0 && um.every((k) => Math.abs(k.mm * 1000 - Number(k.text)) < 1e-6), () => `ticks in µm: ${um.map((k) => k.text).join(' ')}`);
  const a = Wp.advance(0, 1000, 1, 300, true), b = Wp.advance(0, 1000, 2, 300, true);
  t.ok(Math.abs(a.pos - Wp.FPS_1X) < 1e-9 && Math.abs(b.pos - 2 * Wp.FPS_1X) < 1e-9, 'clock: 1× plays FPS_1X frames a second, 2× twice that');
  const w = Wp.advance(290, 1000, 1, 300, true), e = Wp.advance(290, 1000, 1, 300, false);
  t.ok(Math.abs(w.pos - 20) < 1e-9 && !w.ended && e.pos === 299 && e.ended, 'clock: Loop wraps to the start, without it the last frame ends the play');
}
