// The Via section's 3D scene (step M5.1, lib/emsim/scene3d.ts) against the 2D drawings' geometry (viaGeom.ts) and the
// via: barrels, return vias and pads where and as large as the via says; every plane's openings where viaGeom puts them
// (on the side view's section line: its openings open, its copper copper; across the top view: insideAntipad); feeds
// from the pad's edge along their angle; no two solids overlap (sampled with a margin, independent of scene3d's
// polygons' making); outer rings counter-clockwise, holes clockwise and inside the square; the counts; the top field
// plane between two planes. On every preset stackup's two presets, named variants (stub and backdrill both ways,
// every antipad shape of a pair) and random vias without errors.

import * as S0 from '../../../lib/emsim/stackup.ts';
import * as P0 from '../../../lib/emsim/presets.ts';
import * as V0 from '../../../lib/emsim/via.ts';
import * as G0 from '../../../lib/emsim/viaGeom.ts';
import * as C0 from '../../../lib/emsim/scene3d.ts';
import { mulberry32 } from './check-geometry.mjs';

const S = S0.default ?? S0, P = P0.default ?? P0, V = V0.default ?? V0, G = G0.default ?? G0, C = C0.default ?? C0;
const clone = (x) => JSON.parse(JSON.stringify(x));
const errors = (s, v) => V.viaIssues(s, v).filter((i) => i.level === 'error');

// ---- polygons, independent of scene3d.ts ----
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
  let d = Infinity;
  for (let k = 0, j = p.length - 2; k < p.length; j = k, k += 2) {
    const ax = p[j], ay = p[j + 1], bx = p[k], by = p[k + 1];
    const L = (bx - ax) ** 2 + (by - ay) ** 2;
    const t = L > 0 ? Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / L)) : 0;
    d = Math.min(d, Math.hypot(x - ax - t * (bx - ax), y - ay - t * (by - ay)));
  }
  return d;
}
/** 1 inside the prism's region by more than m, −1 outside by more than m, 0 near an edge. */
function region(pr, x, y, m = 1e-6) {
  if (edgeDist(pr.outer, x, y) <= m || pr.holes.some((h) => edgeDist(h, x, y) <= m)) return 0;
  return inPoly(pr.outer, x, y) && !pr.holes.some((h) => inPoly(h, x, y)) ? 1 : -1;
}
const bbox = (p) => { let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity; for (let k = 0; k < p.length; k += 2) { x0 = Math.min(x0, p[k]); x1 = Math.max(x1, p[k]); y0 = Math.min(y0, p[k + 1]); y1 = Math.max(y1, p[k + 1]); } return { x0, x1, y0, y1 }; };

const feedOverReturn = new Set();
const overScenes = [];
function checkScene(t, name, s, v, traceW) {
  feedOverReturn.clear();
  const sc = C.viaScene(s, v, traceW);
  if (!t.ok(sc.ok, `${name}: the scene is made`)) return 0;
  const z = S.stackZ(s);
  const iS = S.layerIndex(s, v.start), iE = S.layerIndex(s, v.end);
  const B = G.barrelsOf(v);
  const ps = sc.prisms;
  const of = (k) => ps.filter((p) => p.kind === k);
  // Counts.
  for (const k of C.PRISM_KINDS) t.eq(sc.counts[k], of(k).length, `${name}: count of ${k}`);
  // Rings: outer counter-clockwise, holes clockwise, inside the square.
  let orient = true, inside = true;
  for (const p of ps) {
    if (!(area(p.outer) > 0) || p.holes.some((h) => !(area(h) < 0))) orient = false;
    for (const h of p.holes) { const b = bbox(h); if (b.x0 < sc.box.x0 - 1e-9 || b.x1 > sc.box.x1 + 1e-9 || b.y0 < sc.box.y0 - 1e-9 || b.y1 > sc.box.y1 + 1e-9) inside = false; }
    if (!(p.z1 > p.z0)) orient = false;
  }
  t.ok(orient, `${name}: outer rings counter-clockwise, holes clockwise, every prism has a height`);
  t.ok(inside, `${name}: every hole inside the square`);
  // Barrels where barrelsOf puts them, the drill's radius, the backdrill taken off.
  const br = of('barrel');
  t.eq(br.length, B.length, `${name}: one barrel per via`);
  br.forEach((p, k) => {
    t.ok(Math.hypot(p.ring.x - B[k].x, p.ring.y - B[k].y) < 1e-12 && Math.abs(p.ring.r1 - v.drill.v / 2) < 1e-12, `${name}: barrel ${k} at its centre with the drill's radius`);
    t.ok(p.ring.r0 >= 0 && p.ring.r0 < p.ring.r1 && Math.abs(p.ring.r1 - p.ring.r0 - Math.min(v.plating.v, v.drill.v / 2)) < 1e-12, `${name}: barrel ${k}'s wall is the plating`);
    let z0 = z[iE + 1], z1 = z[iS];
    const bd = v.backdrill;
    if (bd) { if (bd.side === 'top') z1 = Math.min(z1, z[0] - bd.depth.v); else z0 = Math.max(z0, bd.depth.v); }
    t.ok(Math.abs(p.z0 - z0) < 1e-12 && Math.abs(p.z1 - z1) < 1e-12, `${name}: barrel ${k} from its start layer to its end layer, less the backdrill`);
  });
  t.eq(sc.drilled.length, v.backdrill ? B.length : 0, `${name}: the backdrilled section per barrel`);
  // Return vias.
  const rv = of('return');
  const want = v.returns.filter((r) => r.drill?.v > 0);
  t.eq(rv.length, want.length, `${name}: one prism per return via`);
  rv.forEach((p, k) => t.ok(Math.hypot(p.ring.x - want[k].x.v, p.ring.y - want[k].y.v) < 1e-12 && Math.abs(p.ring.r1 - want[k].drill.v / 2) < 1e-12, `${name}: return via ${k + 1} where and as large as the via says`));
  // Pads: on every copper layer of the barrel with a pad, per barrel, the pad's radius (none drilled away here).
  let nPad = 0;
  for (const pd of v.pads) {
    const i = S.layerIndex(s, pd.layer);
    if (!pd.d || i < iS || i > iE) continue;
    const got = of('pad').filter((p) => p.layer === pd.layer);
    const zm = 0.5 * (z[i] + z[i + 1]);
    const drilled = v.backdrill && (v.backdrill.side === 'top' ? zm > z[0] - v.backdrill.depth.v : zm < v.backdrill.depth.v);
    if (drilled && pd.d.v / 2 <= Math.max(v.backdrill.d.v, v.drill.v) / 2) { t.eq(got.length, 0, `${name}: the pad on ${pd.layer} is drilled away`); continue; }
    nPad += B.length;
    t.ok(got.length === B.length && got.every((p, k) => Math.hypot(p.ring.x - B[k].x, p.ring.y - B[k].y) < 1e-12 && Math.abs(p.ring.r1 - pd.d.v / 2) < 1e-12 && p.z0 === z[i + 1] && p.z1 === z[i]), `${name}: pads on ${pd.layer}`);
  }
  t.eq(of('pad').length, nPad, `${name}: no other pads`);
  // Planes: on the section line as sideGeom, across the square as insideAntipad.
  const sg = G.sideGeom(s, v, traceW);
  const nearReturn = (x, y, m) => v.returns.some((r) => Math.hypot(x - r.x.v, y - r.y.v) < r.drill.v / 2 + m);
  const rnd = mulberry32(name.length * 7919 + 13);
  for (const id of v.planes) {
    const pl = of('plane').filter((p) => p.layer === id);
    if (!t.eq(pl.length, 1, `${name}: one prism for plane ${id}`)) continue;
    const p = pl[0];
    const i = S.layerIndex(s, id);
    t.ok(p.z0 === z[i + 1] && p.z1 === z[i], `${name}: plane ${id} at its layer's height`);
    let bad = 0, n = 0;
    for (const o of sg.openings.filter((r) => r.layer === id)) {
      const sm = 0.5 * (o.x0 + o.x1), x = sm * sg.u.x, y = sm * sg.u.y;
      n++; if (region(p, x, y) !== -1) bad++;
    }
    for (const c of sg.copper.filter((r) => r.layer === id && r.what === 'plane')) {
      for (const f of [0.25, 0.5, 0.75]) {
        const sm = c.x0 + f * (c.x1 - c.x0), x = sm * sg.u.x, y = sm * sg.u.y;
        if (nearReturn(x, y, 0.01) || x < sc.box.x0 || x > sc.box.x1 || y < sc.box.y0 || y > sc.box.y1) continue;
        n++; if (region(p, x, y) !== 1) bad++;
      }
    }
    t.ok(bad === 0 && n > 0, `${name}: plane ${id} open and copper on the side view's line as sideGeom (${bad} of ${n} differ)`);
    const ap = v.antipads.find((a) => a.layer === id);
    if (!ap || i < iS || i > iE) continue;
    bad = 0; n = 0;
    const e = 0.004;
    for (let k = 0; k < 600; k++) {
      const x = sc.box.x0 + rnd() * (sc.box.x1 - sc.box.x0), y = sc.box.y0 + rnd() * (sc.box.y1 - sc.box.y0);
      const inA = G.insideAntipad(ap, v, x, y);
      let clear = true;
      for (let q = 0; q < 8 && clear; q++) { const a = (Math.PI * q) / 4; if (G.insideAntipad(ap, v, x + e * Math.cos(a), y + e * Math.sin(a)) !== inA) clear = false; }
      if (!clear || nearReturn(x, y, 0.01)) continue;
      n++; if (region(p, x, y, 1e-9) !== (inA ? -1 : 1)) bad++;
    }
    t.ok(bad === 0 && n > 300, `${name}: plane ${id}'s openings across the square as insideAntipad (${bad} of ${n} differ)`);
  }
  t.eq(of('plane').length, v.planes.length, `${name}: no other planes`);
  // Laminate and mask: every dielectric and mask layer, split only at the backdrill's depth.
  const lam = s.layers.filter((l) => l.kind !== 'copper');
  const nLam = of('dielectric').length + of('mask').length;
  t.ok(nLam >= lam.length && nLam <= lam.length + 1, `${name}: a prism per laminate and mask layer (${nLam} for ${lam.length})`);
  // Feeds: from the pad's edge along the angle.
  let feedOk = true;
  for (const p of of('feed')) {
    const f = v.feeds.find((x) => x.layer === p.layer);
    const k = p.name.endsWith(' B') ? 1 : 0;
    const o = B[1 - k];
    let a = (f.angle * Math.PI) / 180;
    if (o && Math.cos(a) * (o.x - B[k].x) + Math.sin(a) * (o.y - B[k].y) > 1e-9) a = -a; // a pair's feed into the other via leaves mirrored
    const sx = 0.5 * (p.outer[0] + p.outer[6]) - B[k].x, sy = 0.5 * (p.outer[1] + p.outer[7]) - B[k].y;
    const ex = 0.5 * (p.outer[2] + p.outer[4]) - B[k].x, ey = 0.5 * (p.outer[3] + p.outer[5]) - B[k].y;
    const pr = Math.max((v.pads.find((x) => x.layer === f.layer)?.d?.v ?? 0) / 2, v.drill.v / 2);
    if (Math.abs(Math.hypot(sx, sy) - pr) > 1e-9 || Math.abs(Math.atan2(ey - sy, ex - sx) - Math.atan2(Math.sin(a), Math.cos(a))) > 1e-9 || Math.abs(Math.hypot(p.outer[2] - p.outer[4], p.outer[3] - p.outer[5]) - Math.max(traceW, 0.02)) > 1e-9) feedOk = false;
  }
  t.ok(feedOk && of('feed').length <= v.feeds.length * B.length, `${name}: feeds from the pad's edge along their angle, the trace's width`);
  // Return pads only where an antipad cuts into a return via, on a plane it joins.
  for (const p of of('return-pad')) {
    const r = v.returns[Number(p.name) - 1];
    const ap = v.antipads.find((a) => a.layer === p.layer);
    t.ok(r && r.planes.includes(p.layer) && ap && Math.hypot(r.x.v, r.y.v - (v.pitch ? v.pitch.v / 2 : 0)) - r.drill.v / 2 < ap.d.v / 2 + (v.pitch ? v.pitch.v / 2 : 0) && Math.abs(p.ring.r1 - r.pad.v / 2) < 1e-12, `${name}: return pad ${p.name} on ${p.layer} where the antipad cuts into it`);
  }
  // No two solids overlap, but copper of one conductor may meet: a return via and its pad with a plane it joins, a feed
  // over a return via (the via's data puts it there; counted).
  const joins = (A, Bp) => {
    const [r, o] = A.kind === 'return' || A.kind === 'return-pad' ? [A, Bp] : [Bp, A];
    if (r.kind !== 'return' && r.kind !== 'return-pad') return false;
    if (o.kind === 'plane' || (o.kind === 'return-pad' && r.kind === 'return')) return r.kind === 'return-pad' ? r.layer === o.layer : v.returns[Number(r.name) - 1].planes.includes(o.layer) || o.kind === 'return-pad';
    if (o.kind === 'feed') { feedOverReturn.add(`${o.name}/${r.name}`); return true; }
    return false;
  };
  let over = [];
  for (let a = 0; a < ps.length; a++) for (let b = a + 1; b < ps.length; b++) {
    const A = ps[a], Bp = ps[b];
    if (Math.min(A.z1, Bp.z1) - Math.max(A.z0, Bp.z0) <= 1e-9) continue;
    const ba = bbox(A.outer), bb = bbox(Bp.outer);
    const x0 = Math.max(ba.x0, bb.x0), x1 = Math.min(ba.x1, bb.x1), y0 = Math.max(ba.y0, bb.y0), y1 = Math.min(ba.y1, bb.y1);
    if (!(x1 > x0 && y1 > y0)) continue;
    const N = 28;
    let hit = 0;
    for (let i = 0; i <= N && !hit; i++) for (let j = 0; j <= N && !hit; j++) {
      const x = x0 + ((i + 0.37) / (N + 1)) * (x1 - x0), y = y0 + ((j + 0.61) / (N + 1)) * (y1 - y0);
      if (region(A, x, y) === 1 && region(Bp, x, y) === 1) hit = 1;
    }
    if (hit && !joins(A, Bp)) over.push(`${A.kind} ${A.layer}${A.name} / ${Bp.kind} ${Bp.layer}${Bp.name}`);
  }
  t.ok(over.length === 0, `${name}: no two solids overlap (${over.slice(0, 3).join('; ')})`);
  // The top field plane between two planes of the barrel, in laminate.
  const inCopper = s.layers.some((l, i) => l.kind === 'copper' && sc.topZ > z[i + 1] && sc.topZ < z[i]);
  t.ok(!inCopper && sc.topZ > z[iE + 1] && sc.topZ < z[iS], `${name}: the top field plane in the laminate within the barrel (z ${sc.topZ.toFixed(3)})`);
  if (feedOverReturn.size) overScenes.push(name.startsWith('random') ? 'random' : name);
  return ps.length;
}

export function run(t) {
  let n = 0, scenes = 0;
  const go = (name, s, v, w = 0.15) => { n += checkScene(t, name, s, v, w); scenes++; };
  for (const id of P.PRESET_IDS) {
    const s = P.presetStackup(id);
    for (const kind of V.VIA_PRESETS) { const v = V.presetVia(kind, s); if (v) go(`${id} ${kind}`, s, v); }
  }
  const s = P.presetStackup('JLC061611-3313A');
  const single = V.presetVia('single', s), pair = V.presetVia('pair', s);
  // Stub with the backdrill from the bottom, and an entry low with the backdrill from the top.
  const stub = clone(single);
  stub.exit = 'L3'; stub.feeds[1].layer = 'L3';
  go('stub', s, stub);
  stub.backdrill = { side: 'bottom', depth: S.val(0.3), d: S.val(0.5) };
  t.ok(errors(s, stub).length === 0, 'the bottom backdrill is valid');
  go('backdrill bottom', s, stub);
  const up = clone(single);
  up.entry = 'L4'; up.feeds[0].layer = 'L4';
  up.backdrill = { side: 'top', depth: S.val(0.6), d: S.val(0.45) };
  t.ok(errors(s, up).length === 0, () => `the top backdrill is valid: ${JSON.stringify(errors(s, up))}`);
  go('backdrill top', s, up);
  // Every antipad shape of the pair, overlapping and apart.
  for (const [shape, d, bridge] of [['round', 0.5, 0], ['round', 1.0, 0], ['oblong', 0.9, 0], ['joined', 0.5, 0.3], ['joined', 0.9, 0.2], ['joined', 0.5, 0.45]]) {
    const v = clone(pair);
    v.antipads = v.antipads.map((a) => ({ ...a, shape, d: S.val(d), bridge: bridge ? S.val(bridge) : null }));
    const e = errors(s, v);
    if (e.length) { t.note(`pair ${shape} ${d}/${bridge} has errors (${e.map((x) => x.code).join(', ')}), skipped`); continue; }
    go(`pair ${shape} ${d} ${bridge}`, s, v);
  }
  // Random vias without errors.
  const rnd = mulberry32(5101);
  let tried = 0, used = 0;
  while (used < 40 && tried < 400) {
    tried++;
    const v = clone(rnd() < 0.5 ? single : pair);
    const dr = 0.15 + 0.3 * rnd();
    v.drill = S.val(dr);
    v.plating = S.val(0.01 + 0.03 * rnd());
    const pad = dr + 0.1 + 0.3 * rnd();
    v.pads = v.pads.map((p) => (p.d ? { ...p, d: S.val(pad) } : p));
    const ap = pad + 0.1 + 0.8 * rnd();
    const shapes = v.pitch ? ['round', 'oblong', 'joined'] : ['round'];
    const shape = shapes[Math.floor(rnd() * shapes.length)];
    v.antipads = v.antipads.map((a) => ({ ...a, d: S.val(ap), shape, bridge: shape === 'joined' ? S.val(0.05 + 0.5 * rnd() * ap) : null }));
    if (v.pitch) v.pitch = S.val(pad + 0.05 + 0.5 * rnd());
    const a0 = rnd() * 2 * Math.PI;
    v.returns = v.returns.map((r, k) => { const a = a0 + (2 * Math.PI * k) / v.returns.length, R = ap / 2 + 0.2 + 0.6 * rnd(); return { ...r, x: S.val(R * Math.cos(a)), y: S.val((v.pitch ? v.pitch.v / 2 : 0) + R * Math.sin(a)) }; });
    if (!v.pitch) v.feeds = v.feeds.map((f, k) => ({ ...f, angle: Math.round(rnd() * 360) + 90 * k }));
    if (errors(s, v).length) continue;
    used++;
    go(`random ${used}`, s, v, 0.08 + 0.2 * rnd());
  }
  t.ok(used >= 30, `${used} random vias without errors (of ${tried})`);
  t.note(`${scenes} scenes, ${n} solids; feeds over a return via, as the via's data puts them, in ${overScenes.length} (${[...new Set(overScenes)].length > 4 ? 'every preset pair and some random vias' : overScenes.join(', ')})`);
}
