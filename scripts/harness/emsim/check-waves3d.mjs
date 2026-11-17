// Checks of the Waves section's 3D view (step M7.2b, lib/emsim/waves3d.ts) on the full-wave runs' own models and
// snapshot slices (fullwave.ts preview, snapshots.ts snapPlan): the C44 via, the LVDS via pair (C45 with its feeds
// apart, as the UI checks run it), a microstrip section and an edge-coupled pair.
// (a) the box: inside the mesh, holding every port, barrel and opening;
// (b) the scene against the model (fdtd/model.ts inLayer and its cylinders, independent of the prisms' making): points
//     sampled inside each copper prism are copper of its layer (or inside its cylinder), and copper of the model sampled
//     in the box lies inside a prism of its layer (both away from edges by a margin: circles are 64-gons); outer rings
//     counter-clockwise, holes clockwise; a pair's overlapping antipads one hole;
// (c) each view's plane: its corner and far corner are the slice's (u0, v0) and (u1, v1) on its plane `at`, its axes
//     the slice's u and v, its extent inside the box and the slice's samples; the texture's aspect the plane's within
//     a texel, at most TEX_CAP texels;
// (d) the texture is rasterOf's picture: column i's sample position is the texel centre's u, row r from the top is
//     texel row th − 1 − r's v (the renderer turns the plane's v round so row 0 is at the top);
// (e) planeViews: a view's planes as one (a trace's Ez from above on an edge's middle beside its |E| on the nodes);
//     planeComp: the player's field where a plane has it, else the plane's first.

import * as Su0 from '../../../lib/emsim/setup.ts';
import * as V0 from '../../../lib/emsim/via.ts';
import * as St0 from '../../../lib/emsim/structure.ts';
import * as S0 from '../../../lib/emsim/stackup.ts';
import * as Pr0 from '../../../lib/emsim/fdtd/problem.ts';
import * as Ru0 from '../../../lib/emsim/fdtd/run.ts';
import * as Sn0 from '../../../lib/emsim/fdtd/snapshots.ts';
import * as M0 from '../../../lib/emsim/fdtd/model.ts';
import * as Fw0 from '../../../lib/emsim/fullwave.ts';
import * as Wp0 from '../../../lib/emsim/wavesPlayer.ts';
import * as W30 from '../../../lib/emsim/waves3d.ts';

const d = (m) => m.default ?? m;
const Su = d(Su0), V = d(V0), St = d(St0), S = d(S0), Pr = d(Pr0), Ru = d(Ru0), Sn = d(Sn0), M = d(M0), Fw = d(Fw0), Wp = d(Wp0), W3 = d(W30);
const DEV = { gpu: { ok: false, reason: '' }, js: { backend: 'js' }, mobile: false };

function cases() {
  const via = Su.defaultSetup();
  const pair = Su.defaultSetup();
  const pre = V.presetVia('pair', pair.stackup);
  pair.via = { ...pre, feeds: [{ ...pre.feeds[0], angle: 180 }, { ...pre.feeds[1], angle: 0 }] };
  const tr = Su.defaultSetup();
  const tp = Su.defaultSetup();
  tp.trace = { ...St.presetStructure('pair-microstrip', tp.stackup, 0.11), s: S.val(0.2) };
  return [['C44 via', via, 'via', 10], ['LVDS via pair', pair, 'via', 10], ['microstrip section', tr, 'trace', 4], ['microstrip pair', tp, 'trace', 4]];
}

export async function run(t) {
  for (const [name, setup, kind, length] of cases()) {
    const pv = Fw.preview(setup, { kind, tr: 35e-12, length, backend: 'js' }, DEV);
    const m = pv.geom;
    const b = Pr.buildProblem(setup, kind, { trMin: 35e-12, precision: 'f32', ...(kind === 'trace' ? { length } : {}) });
    const infos = Sn.snapPlan(b.problem, pv.snap, Ru.stepsCap(b.problem)).slices;
    checkBox(t, name, m);
    checkScene(t, name, m);
    checkPlanes(t, name, m, infos, pv.views);
  }
}

const area = (p) => { let a = 0; for (let k = 0; k < p.length; k += 2) { const j = (k + 2) % p.length; a += p[k] * p[j + 1] - p[j] * p[k + 1]; } return a / 2; };
function inPoly(p, x, y) {
  let c = false;
  for (let k = 0, j = p.length - 2; k < p.length; j = k, k += 2) {
    const xi = p[k], yi = p[k + 1], xj = p[j], yj = p[j + 1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
function edgeDist(p, x, y) {
  let dd = Infinity;
  for (let k = 0, j = p.length - 2; k < p.length; j = k, k += 2) {
    const ax = p[j], ay = p[j + 1], bx = p[k], by = p[k + 1];
    const L = (bx - ax) ** 2 + (by - ay) ** 2;
    const s = L > 0 ? Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / L)) : 0;
    dd = Math.min(dd, Math.hypot(x - ax - s * (bx - ax), y - ay - s * (by - ay)));
  }
  return dd;
}
/** 1 inside the prism's region by more than mg, −1 outside by more than mg, 0 near an edge. */
function side(pr, x, y, mg) {
  const rings = [pr.outer, ...pr.holes];
  if (rings.some((r) => edgeDist(r, x, y) < mg)) return 0;
  return inPoly(pr.outer, x, y) && !pr.holes.some((h) => inPoly(h, x, y)) ? 1 : -1;
}
let seed = 7;
const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

function checkBox(t, name, m) {
  const b = W3.waveBox(m);
  const ex = m.extent;
  const inMesh = b.x0 >= ex.x[0] - 1e-9 && b.x1 <= ex.x[1] + 1e-9 && b.y0 >= ex.y[0] - 1e-9 && b.y1 <= ex.y[1] + 1e-9 && b.z0 >= ex.z[0] - 1e-9 && b.z1 <= ex.z[1] + 1e-9;
  const pts = [];
  for (const p of m.ports) for (const a of p.across) pts.push(p.axis === 'x' ? [p.pos, a] : [a, p.pos]);
  for (const c of m.cyl) pts.push([c.x - c.r, c.y - c.r], [c.x + c.r, c.y + c.r]);
  for (const c of m.cu) for (const o of c.openings) if (o.k === 'disk') pts.push([o.x - o.r1, o.y - o.r1], [o.x + o.r1, o.y + o.r1]);
  const holds = pts.every(([x, y]) => x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1) && b.z0 <= 0 && b.z1 >= m.thick;
  t.ok(inMesh && holds, () => `${name}: the box ${JSON.stringify(b)} inside the mesh ${JSON.stringify(ex)} and holding the ports, barrels, openings and board`);
}

function checkScene(t, name, m) {
  const b = W3.waveBox(m);
  const sc = W3.modelScene(m, b);
  const mg = 0.01;
  const layer = new Map(m.cu.map((c) => [c.id, c]));
  const cylOf = (pr) => m.cyl.find((c) => pr.ring && Math.hypot(c.x - pr.ring.x, c.y - pr.ring.y) < 1e-9 && Math.abs(c.r - pr.ring.r1) < 1e-9);
  const copper = sc.prisms.filter((p) => p.kind !== 'dielectric' && p.kind !== 'mask');
  let bad = 0, n = 0, orient = 0;
  for (const p of sc.prisms) {
    if (!(area(p.outer) > 0) || p.holes.some((h) => !(area(h) < 0))) orient++;
  }
  for (const p of copper) {
    const zm = (p.z0 + p.z1) / 2;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (let k = 0; k < p.outer.length; k += 2) { x0 = Math.min(x0, p.outer[k]); x1 = Math.max(x1, p.outer[k]); y0 = Math.min(y0, p.outer[k + 1]); y1 = Math.max(y1, p.outer[k + 1]); }
    for (let q = 0; q < 1500; q++) {
      const x = x0 + rnd() * (x1 - x0), y = y0 + rnd() * (y1 - y0);
      if (side(p, x, y, mg) !== 1) continue;
      n++;
      const cy = p.kind === 'barrel' || p.kind === 'return' ? cylOf(p) : null;
      const ok = cy ? Math.hypot(x - cy.x, y - cy.y) <= cy.r : layer.has(p.layer) && M.inLayer(layer.get(p.layer), x, y, zm);
      if (!ok) bad++;
    }
  }
  t.ok(n > 1000 && bad === 0, () => `${name}: ${n} points inside the copper prisms are the model's copper (${bad} are not)`);
  // the model's copper inside the box lies in a prism of its layer (or a barrel's)
  let miss = 0, m2 = 0;
  for (const c of m.cu) {
    const zs = sc.prisms.filter((p) => p.layer === c.id && p.kind !== 'dielectric');
    if (!zs.length) continue;
    const zm = (zs[0].z0 + zs[0].z1) / 2;
    for (let q = 0; q < 3000; q++) {
      const x = b.x0 + rnd() * (b.x1 - b.x0), y = b.y0 + rnd() * (b.y1 - b.y0);
      if (!M.inLayer(c, x, y, zm)) continue;
      // away from the model's own edges: copper a margin round too
      if (![[mg, 0], [-mg, 0], [0, mg], [0, -mg]].every(([dx, dy]) => M.inLayer(c, x + dx, y + dy, zm))) continue;
      if (m.cyl.some((k) => Math.hypot(x - k.x, y - k.y) < k.r + mg)) continue; // a pad's hole is the barrel's
      m2++;
      if (!zs.some((p) => side(p, x, y, mg / 2) >= 0)) miss++;
    }
  }
  t.ok(m2 > 500 && miss === 0, () => `${name}: ${m2} points of the model's copper in the box lie in a prism of their layer (${miss} do not)`);
  t.ok(orient === 0, () => `${name}: every outer ring counter-clockwise, every hole clockwise (${orient} not)`);
  const planes = sc.prisms.filter((p) => p.kind === 'plane');
  const holes = planes.map((p) => p.holes.length);
  if (name === 'LVDS via pair') {
    const opened = m.cu.filter((c) => c.plane && c.openings.length);
    t.ok(opened.length > 0 && planes.filter((p) => opened.some((c) => c.id === p.layer)).every((p) => p.holes.length >= 1), () => `${name}: the planes' antipads as holes (${holes.join(', ')})`);
  }
  t.note(`${name}: scene ${Object.entries(sc.counts).filter(([, v]) => v).map(([k, v]) => `${k} ${v}`).join(', ')}; plane holes ${holes.join('/')}`);
}

function checkPlanes(t, name, m, infos, views) {
  const b = W3.waveBox(m);
  const pvs = W3.planeViews(Wp.playerViews(infos, views));
  let bad = [];
  const near = (a, c, e = 1e-6) => Math.abs(a - c) <= e;
  for (const v of pvs) {
    const p = W3.viewPlace(infos, v, b);
    if (!p) { bad.push(`${v.view}: no plane`); continue; }
    const [ua, va] = Wp.axesOf(v.normal);
    const e = Wp.viewBox(infos, v);
    const o = W3.pointOf(v.normal, v.at, p.box.u0, p.box.v0), far = W3.pointOf(v.normal, v.at, p.box.u1, p.box.v1);
    const end = [0, 1, 2].map((k) => p.o[k] + p.U[k] * p.w + p.V[k] * p.h);
    const ax = { x: 0, y: 1, z: 2 };
    const okPlace = [0, 1, 2].every((k) => near(p.o[k], o[k]) && near(end[k], far[k])) && p.U[ax[ua]] === 1 && p.V[ax[va]] === 1
      && p.at === v.at && near(p.w, p.box.u1 - p.box.u0) && near(p.h, p.box.v1 - p.box.v0);
    const lo = { x: b.x0, y: b.y0, z: b.z0 }, hi = { x: b.x1, y: b.y1, z: b.z1 };
    const inside = p.box.u0 >= Math.max(e.u0, lo[ua]) - 1e-6 && p.box.u1 <= Math.min(e.u1, hi[ua]) + 1e-6 && p.box.v0 >= Math.max(e.v0, lo[va]) - 1e-6 && p.box.v1 <= Math.min(e.v1, hi[va]) + 1e-6;
    const aspect = Math.abs(p.tw / p.th - p.w / p.h) <= (p.w / p.h) * (1 / p.th + 1 / p.tw) * 1.01 && p.tw * p.th <= W3.TEX_CAP;
    if (!okPlace) bad.push(`${v.view}: placed ${JSON.stringify(p.o)} → ${JSON.stringify(end)}, the slice's ${JSON.stringify(o)} → ${JSON.stringify(far)}`);
    if (!inside) bad.push(`${v.view}: outside the box or the slice`);
    if (!aspect) bad.push(`${v.view}: texture ${p.tw}×${p.th} for ${p.w.toFixed(3)}×${p.h.toFixed(3)} mm`);
    // (d) the texture's texels are rasterOf's samples of the shown component's slice
    for (let k = 0; k < v.src.length; k++) {
      const info = infos[v.src[k][0]];
      const r = Wp.rasterOf(info, p.tw, p.th, p.box);
      const at = (g, i0, i1, w, mul) => { const a = g[i0 / mul], c = g[i1 / mul]; return a + (c - a) * w; };
      let worst = 0;
      for (let i = 0; i < p.tw; i++) {
        const [u] = W3.texelUv(p, i, 0);
        if (u <= info.u[0] || u >= info.u[info.nu - 1]) continue;
        worst = Math.max(worst, Math.abs(at(info.u, r.c0[i], r.c1[i], r.cw[i], 1) - u));
      }
      for (let row = 0; row < p.th; row++) {
        const [, vv] = W3.texelUv(p, 0, p.th - 1 - row);
        if (vv <= info.v[0] || vv >= info.v[info.nv - 1]) continue;
        worst = Math.max(worst, Math.abs(at(info.v, r.r0[row], r.r1[row], r.rw[row], info.nu) - vv));
      }
      if (worst > 1e-4) bad.push(`${v.view} ${v.comps[k]}: rasterOf's samples ${worst.toExponential(2)} mm off the texels' centres`);
    }
  }
  t.ok(pvs.length > 0 && bad.length === 0, () => `${name}: ${pvs.length} planes placed as their slices, textures as rasterOf (${bad.slice(0, 3).join('; ')})`);
  t.note(`${name}: planes ${pvs.map((v) => { const p = W3.viewPlace(infos, v, b); return `${v.view} ${v.normal}@${v.at.toFixed(3)} ${p.tw}×${p.th}`; }).join(', ')}`);
  // (e) the component each plane shows
  const comps = pvs.map((v) => v.comps[W3.planeComp(v, 'E')]).join(',');
  const want = { 'C44 via': 'E,Ez,Ez,Ez', 'LVDS via pair': 'E,Ez,Ez,Ez', 'microstrip section': 'E,E,E', 'microstrip pair': 'E,E' }[name];
  t.eq(comps, want, `${name}: with |E| chosen, the planes show`);
}
