// The via's field maps (M3.2b, lib/emsim/viafield.ts): the top view's evaluator on the cut against the exact coax
// field (the barrel inside a coaxial ring), on points and on a progressive grid; the side view's mirrored grid against
// axiField at its points; the job through the worker's runJob; times of both maps at 1440 px sizes.

import { performance } from 'node:perf_hooks';
import * as VF0 from '../../../lib/emsim/viafield.ts';
import * as VC0 from '../../../lib/emsim/viacut.ts';
import * as AX0 from '../../../lib/emsim/axisym.ts';
import * as F0 from '../../../lib/emsim/fields.ts';
import * as SU0 from '../../../lib/emsim/setup.ts';
import * as V0 from '../../../lib/emsim/via.ts';
import * as J0 from '../../../lib/emsim/jobs.ts';

const VF = VF0.default ?? VF0, VC = VC0.default ?? VC0, AX = AX0.default ?? AX0, F = F0.default ?? F0, SU = SU0.default ?? SU0, V = V0.default ?? V0, J = J0.default ?? J0;

const drain = (g) => { const parts = []; for (;;) { const s = g.next(); if (s.done) return { value: s.value, parts }; if (s.value) parts.push(s.value); } };

export async function run(t) {
  const setup = SU.defaultSetup();
  const st = setup.stackup, via = setup.via;
  const a = via.drill.v / 2, b = 0.5;
  // 1. Top view: the barrel in a coaxial ring, exact φ = ln(b/r)/ln(b/a), |E| = 1/(r·ln(b/a)).
  const cut = VC.viaCut(st, via, { ring: b, estimate: false });
  const src = VF.topSource(cut, [1]);
  t.ok(typeof src !== 'string', `coax source: ${src}`);
  const lnab = Math.log(b / a);
  let worst = 0;
  for (const [r, ang] of [[0.17, 0.3], [0.22, 1.9], [0.3, 2.8], [0.4, 4.4], [0.48, 5.5]]) {
    const p = F.pointField(src, r * Math.cos(ang), r * Math.sin(ang));
    const e1 = Math.abs(p.phi - Math.log(b / r) / lnab), e2 = Math.abs(p.f / (1000 / (r * lnab)) - 1);
    worst = Math.max(worst, e1, e2);
    t.ok(e1 < 0.01 && e2 < 0.01, `coax at r ${r}: φ ${p.phi} vs ${Math.log(b / r) / lnab}, |E| ${p.f} vs ${1000 / (r * lnab)}`);
  }
  // On a progressive grid: every evaluated point between the conductors (two spacings away from them) within 1 %.
  const view = { x0: -0.55, x1: 0.55, z0: -0.55, z1: 0.55, nx: 111, ny: 111 };
  const g = drain(F.fieldGrid(src, view, { coarse: 8 }));
  t.ok(g.parts.length >= 2 && g.parts[0].step === 8 && g.value.done, `top grid progressive: ${g.parts.map((p) => p.step)}`);
  let gw = 0, gn = 0, gr = 0;
  for (let j = 0; j < view.ny; j++) for (let i = 0; i < view.nx; i++) {
    const x = view.x0 + i * 0.01, z = view.z0 + j * 0.01, r = Math.hypot(x, z);
    if (r < a + 0.02 || r > b - 0.02) continue;
    const k = j * view.nx + i;
    const e = Math.max(Math.abs(g.value.phi[k] - Math.log(b / r) / lnab), Math.abs(Math.hypot(g.value.fx[k], g.value.fz[k]) / (1000 / (r * lnab)) - 1));
    if (e > gw) { gw = e; gr = r; }
    gn++;
  }
  t.ok(gw < 0.01, `coax grid worst ${gw} at r ${gr}`);
  t.note(`top view on the coax (a ${a}, b ${b}): points within ${(worst * 100).toFixed(3)} % (φ of the 1 V, |E| relative), grid (${gn} points) within ${(gw * 100).toFixed(3)} %`);

  // 2. Side view: the mirrored grid equals axiField at its points (the snapped view), copper and the wall classified.
  const side = VF.viaSide(st, via);
  t.ok(side.ok && side.lv && side.rLim > a, `side solution: ${side.reason}`);
  const sv = { x0: -1.637, x1: 0.91, z0: -0.1, z1: 1.7, nx: 151, ny: 121 };
  const sg = drain(VF.sideGrid(side, sv, 8, 1));
  const G = sg.value;
  t.ok(G.done && sg.parts.some((p) => p && p.step === 8), 'side grid progressive');
  const dx = (G.view.x1 - G.view.x0) / (G.view.nx - 1);
  t.ok(Math.abs(G.view.x0 / dx - Math.round(G.view.x0 / dx)) < 1e-9 && Math.abs(dx - (sv.x1 - sv.x0) / (sv.nx - 1)) < 1e-12, 'side view snapped to its spacing');
  const dz = (G.view.z1 - G.view.z0) / (G.view.ny - 1);
  const o = [0, 0, 0];
  let sw = 0, nCu = 0, nOut = 0, nVal = 0;
  for (let k = 0; k < G.view.ny; k += 7) for (let i = 0; i < G.view.nx; i += 5) {
    const x = G.view.x0 + i * dx, z = G.view.z0 + k * dz, q = k * G.view.nx + i, c = G.cls[q];
    if (Math.abs(x) > side.rLim) { nOut++; t.ok(c === -1, `beyond the wall at x ${x}: class ${c}`); continue; }
    if (c < 0) { nCu++; continue; }
    AX.axiField(side.lv, Math.abs(x), z, o);
    const ex = x < 0 ? -o[1] : o[1];
    const d = Math.max(Math.abs(G.phi[q] - o[0]), Math.abs(G.fx[q] - ex) / Math.max(1, Math.abs(ex)), Math.abs(G.fz[q] - o[2]) / Math.max(1, Math.abs(o[2])));
    sw = Math.max(sw, d);
    nVal++;
  }
  t.ok(sw < 1e-5 && nVal > 100 && nCu > 10 && nOut > 10, `side grid vs axiField: worst ${sw}, ${nVal} values, ${nCu} copper, ${nOut} beyond`);
  t.ok(G.cls[Math.round((0.5 * (side.L.zTop + side.L.zBot) - G.view.z0) / dz) * G.view.nx + Math.round(-G.view.x0 / dx)] === -2, 'the barrel is the via');
  // 3. The pair: the side map's radius is at most half the pitch; the top view's differential drive is antisymmetric.
  const pair = V.presetVia('pair', st);
  const ps = VF.viaSide(st, pair);
  t.ok(ps.ok && ps.rLim <= pair.pitch.v / 2 + 1e-12, `pair side radius ${ps.rLim} vs pitch ${pair.pitch.v}`);
  const pc = VC.viaCut(st, pair, { estimate: false });
  const psrc = VF.topSource(pc, [0.5, -0.5]);
  const mid = F.pointField(psrc, 0.3, pair.pitch.v / 2);
  t.ok(Math.abs(mid.phi) < 1e-6, `pair differential: φ on the middle line ${mid.phi}`);
  // 4. The job through runJob: partials, then the result; the top view's contours and lines.
  const job = { kind: 'via-field', setup, which: 'top', view: { x0: -1.5, x1: 1.5, z0: -1.2, z1: 1.2, nx: 121, ny: 97 }, drive: [1], contours: 10, lines: 24 };
  const r = drain(J.runJob(job));
  t.ok(r.value.ok && r.value.grid.done && r.value.contours.length > 0 && r.value.lines.length > 0, `job top: ${r.value.reason}`);
  const rs = drain(J.runJob({ kind: 'via-field', setup, which: 'side', view: sv }));
  t.ok(rs.value.ok && rs.value.grid.done && rs.value.Rw > 0 && rs.value.wall, `job side: ${rs.value.reason}`);
  const ad = drain(VF.sideGrid(side, sv, 8)).value;
  t.ok(rs.value.grid.phi.every((x, i) => x === ad.phi[i]), 'job side equals sideGrid');
  let aw = 0;
  for (let i = 0; i < G.phi.length; i++) if (G.cls[i] >= 0) aw = Math.max(aw, Math.abs(ad.phi[i] - G.phi[i]), Math.abs(Math.hypot(ad.fx[i], ad.fz[i]) - Math.hypot(G.fx[i], G.fz[i])) / Math.max(1e3, Math.hypot(G.fx[i], G.fz[i])));
  t.ok(aw < 0.3, `side grid refined only near copper: worst ${aw} against every point evaluated`);
  t.note(`side view: ${ad.evaluated} of ${G.evaluated} points evaluated; worst difference ${aw.toExponential(2)} (φ in V, |E| relative)`);
  // 5. Times at 1440 px wide (2 px per point; side view about 560 × 300 px, top view 560 × 330 px).
  const time = (f) => { const t0 = performance.now(); let first = NaN; const gen = f(); for (;;) { const s = gen.next(); if (s.value && s.value.view && first !== first) first = performance.now() - t0; if (s.done) return [first, performance.now() - t0]; } };
  const ts = time(() => VF.viaFieldJob(st, via, { which: 'side', view: { x0: -1.9, x1: 1.9, z0: -0.13, z1: 1.73, nx: 281, ny: 151 } }));
  const tt = time(() => VF.viaFieldJob(st, via, { which: 'top', view: { x0: -2, x1: 2, z0: -1.2, z1: 1.2, nx: 281, ny: 166 } }));
  t.note(`times (Node): side 281 × 151 first ${ts[0].toFixed(1)} ms, all ${ts[1].toFixed(1)} ms; top 281 × 166 first ${tt[0].toFixed(1)} ms, all ${tt[1].toFixed(1)} ms`);
}
