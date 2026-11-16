// Structure geometry: every preset structure on every preset stackup (masked and not), variants (narrow gaps where
// the mask coats meet, finite coplanar grounds, walls, the bottom side, KiCad-like masks) and randomised general
// arrangements. Invariants: simple counter-clockwise polygons, no overlap, the box tiled exactly, layers in order,
// signals numbered, copper widths, the mask thickness rules of engine.md §3. Also the time one section takes.

import { performance } from 'node:perf_hooks';
import * as S0 from '../../../lib/emsim/stackup.ts';
import * as P0 from '../../../lib/emsim/presets.ts';
import * as T0 from '../../../lib/emsim/structure.ts';
import * as G0 from '../../../lib/emsim/geometry.ts';

const S = S0.default ?? S0;
const P = P0.default ?? P0;
const T = T0.default ?? T0;
const G = G0.default ?? G0;

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let x = a;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

// --- Polygon helpers (independent of lib/emsim/geometry.ts) ---

const area = (p) => { let a = 0; for (let k = 0; k < p.length; k += 2) { const j = (k + 2) % p.length; a += p[k] * p[j + 1] - p[j] * p[k + 1]; } return a / 2; };

function segCross(ax, ay, bx, by, cx, cy, dx, dy) {
  // Proper intersection (interiors cross) or collinear overlap of positive length.
  const o = (px, py, qx, qy, rx, ry) => (qx - px) * (ry - py) - (qy - py) * (rx - px);
  const s = Math.max(Math.abs(bx - ax) + Math.abs(by - ay), Math.abs(dx - cx) + Math.abs(dy - cy));
  const eps = 1e-12 * s * s;
  const d1 = o(ax, ay, bx, by, cx, cy);
  const d2 = o(ax, ay, bx, by, dx, dy);
  const d3 = o(cx, cy, dx, dy, ax, ay);
  const d4 = o(cx, cy, dx, dy, bx, by);
  if (((d1 > eps && d2 < -eps) || (d1 < -eps && d2 > eps)) && ((d3 > eps && d4 < -eps) || (d3 < -eps && d4 > eps))) return true;
  if (Math.abs(d1) <= eps && Math.abs(d2) <= eps) {
    // Collinear: overlap of positive length along the longer axis.
    const useX = Math.abs(bx - ax) >= Math.abs(by - ay);
    const [p0, p1] = useX ? [Math.min(ax, bx), Math.max(ax, bx)] : [Math.min(ay, by), Math.max(ay, by)];
    const [q0, q1] = useX ? [Math.min(cx, dx), Math.max(cx, dx)] : [Math.min(cy, dy), Math.max(cy, dy)];
    return Math.min(p1, q1) - Math.max(p0, q0) > 1e-12 * s;
  }
  return false;
}

function onSegment(px, py, ax, ay, bx, by) {
  const l2 = (bx - ax) ** 2 + (by - ay) ** 2;
  const tt = l2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / l2)) : 0;
  return Math.hypot(px - ax - tt * (bx - ax), py - ay - tt * (by - ay)) <= 1e-11;
}

// Strictly inside (points on the boundary are not inside).
export function inside(p, x, y) {
  let c = false;
  for (let k = 0, n = p.length; k < n; k += 2) {
    const j = (k + 2) % n;
    if (onSegment(x, y, p[k], p[k + 1], p[j], p[j + 1])) return false;
    const yi = p[k + 1];
    const yj = p[j + 1];
    if ((yi > y) !== (yj > y) && x < ((p[j] - p[k]) * (y - yi)) / (yj - yi) + p[k]) c = !c;
  }
  return c;
}

function simple(p) {
  const n = p.length / 2;
  for (let i = 0; i < n; i += 1) {
    const i1 = (i + 1) % n;
    for (let j = i + 1; j < n; j += 1) {
      const j1 = (j + 1) % n;
      if (j === i1 || i === j1) {
        // Adjacent edges: must not fold back onto each other.
        const shared = j === i1 ? i1 : i;
        const a = j === i1 ? i : j;
        const b = j === i1 ? j1 : i1;
        const ux = p[2 * a] - p[2 * shared], uy = p[2 * a + 1] - p[2 * shared + 1];
        const vx = p[2 * b] - p[2 * shared], vy = p[2 * b + 1] - p[2 * shared + 1];
        const cr = ux * vy - uy * vx;
        if (Math.abs(cr) <= 1e-14 * Math.hypot(ux, uy) * Math.hypot(vx, vy) && ux * vx + uy * vy > 0) return `edges ${a}-${shared}-${b} fold back`;
        continue;
      }
      if (segCross(p[2 * i], p[2 * i + 1], p[2 * i1], p[2 * i1 + 1], p[2 * j], p[2 * j + 1], p[2 * j1], p[2 * j1 + 1])) return `edges ${i} and ${j} cross`;
    }
  }
  return '';
}

function overlap(p, q) {
  for (let i = 0; i < p.length; i += 2) {
    const i1 = (i + 2) % p.length;
    for (let j = 0; j < q.length; j += 2) {
      const j1 = (j + 2) % q.length;
      const o = (ax, ay, bx, by, cx, cy) => (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
      const a = [p[i], p[i + 1], p[i1], p[i1 + 1]];
      const b = [q[j], q[j + 1], q[j1], q[j1 + 1]];
      const d1 = o(...a, b[0], b[1]), d2 = o(...a, b[2], b[3]), d3 = o(...b, a[0], a[1]), d4 = o(...b, a[2], a[3]);
      const s = 1e-13;
      if (((d1 > s && d2 < -s) || (d1 < -s && d2 > s)) && ((d3 > s && d4 < -s) || (d3 < -s && d4 > s))) return 'edges cross';
    }
    if (inside(q, p[i], p[i + 1])) return 'a vertex lies inside';
    const mx = (p[i] + p[i1]) / 2, my = (p[i + 1] + p[i1 + 1]) / 2;
    if (inside(q, mx, my)) return 'an edge midpoint lies inside';
  }
  return '';
}

// Height of a skin surface at u (the larger value at a jump).
function surfaceAt(sf, u) {
  let best = -Infinity;
  for (let k = 0; k + 2 < sf.length; k += 2) {
    const u0 = sf[k], u1 = sf[k + 2];
    if (u < Math.min(u0, u1) || u > Math.max(u0, u1)) continue;
    const z = u1 === u0 ? Math.max(sf[k + 1], sf[k + 3]) : sf[k + 1] + ((sf[k + 3] - sf[k + 1]) * (u - u0)) / (u1 - u0);
    best = Math.max(best, z);
  }
  return best;
}

const arrOf = (s, st) => T.arrangement(s, st);

// --- The invariants of one section ---

export function checkSection(t, s, st, label, opts = {}) {
  const errs = T.structureIssues(s, st).filter((i) => i.level === 'error');
  if (!t.ok(errs.length === 0, () => `${label}: structure errors ${JSON.stringify(errs)}`)) return;
  const sec = G.section(s, st);
  const polys = [...sec.conductors.map((c) => ({ p: c.pts, what: `conductor ${c.id}` })), ...sec.regions.map((r) => ({ p: r.pts, what: `region ${sec.materials[r.mat].kind} ${r.mat}` }))];
  let good = true;
  const fail = (m) => { good = false; t.ok(false, `${label}: ${m}`); };
  let sum = 0;
  for (const { p, what } of polys) {
    if (p.length < 6 || p.some((x) => !Number.isFinite(x))) { fail(`${what} is not a polygon`); continue; }
    const a = area(p);
    if (!(a > 0)) fail(`${what} is not counter-clockwise (area ${a})`);
    sum += a;
    const sm = simple(p);
    if (sm) fail(`${what} is not simple: ${sm}`);
    for (let k = 0; k < p.length; k += 2) {
      if (Math.abs(p[k]) > sec.ext * (1 + 1e-12) || p[k + 1] < sec.zLo - 1e-12 || p[k + 1] > sec.zHi + 1e-12) { fail(`${what} leaves the box`); break; }
    }
  }
  for (let i = 0; i < polys.length; i += 1) {
    for (let j = i + 1; j < polys.length; j += 1) {
      const o = overlap(polys[i].p, polys[j].p) || overlap(polys[j].p, polys[i].p);
      if (o) fail(`${polys[i].what} and ${polys[j].what} overlap (${o})`);
    }
  }
  const box = 2 * sec.ext * (sec.zHi - sec.zLo);
  if (Math.abs(sum - box) > 1e-9 * box) fail(`the polygons do not tile the box: ${sum} vs ${box}`);
  // Signals numbered 1…n once; the number the kind has.
  const ids = sec.conductors.filter((c) => c.id > 0).map((c) => c.id).sort((a, b) => a - b);
  const want = st.kind === 'general' ? st.signals.length : T.KIND_INFO[st.kind].signals;
  if (ids.length !== want || ids.some((id, k) => id !== k + 1)) fail(`signals ${ids} (wanted ${want})`);
  // Layers in order: every dielectric layer between the planes (or the air) has its band at its stackup position.
  const z = S.stackZ(s);
  const a0 = arrOf(s, st);
  const iTop = a0.above >= 0 ? a0.above + 1 : 0;
  const iBot = a0.below >= 0 ? a0.below - 1 : s.layers.length - 1;
  for (let i = iTop; i <= iBot; i += 1) {
    if (s.layers[i].kind !== 'dielectric') continue;
    const band = sec.regions.find((r) => sec.materials[r.mat].layer === i && r.pts.length === 8 && r.pts[1] === z[i + 1] && r.pts[5] === z[i] && r.pts[0] === -sec.ext && r.pts[2] === sec.ext);
    if (!band) fail(`band of ${s.layers[i].id} is not at its place`);
  }
  if (sec.planeBelow !== null && sec.zLo !== sec.planeBelow) fail('zLo is not the plane below');
  if (sec.planeAbove !== null && sec.zHi !== sec.planeAbove) fail('zHi is not the plane above');
  // Copper: base width and the etched top.
  const arr = T.arrangement(s, st);
  for (const c of sec.conductors) {
    if (c.id === 0) continue;
    const f = arr.features[c.id - 1];
    const e = S.etchOffset(s.layers[f.layer]);
    const w0 = c.pts[2] - c.pts[0];
    const w1 = c.pts[4] - c.pts[6];
    const [base, top] = S.fillSide(s, f.layer) === 'up' ? [w0, w1] : [w1, w0];
    if (Math.abs(base - (f.b - f.a)) > 1e-12 || Math.abs(top - (f.b - f.a - 2 * e)) > 1e-12) fail(`conductor ${c.id}: base ${base}, top ${top}`);
  }
  // Mask rules on every masked skin.
  for (const sk of sec.skins) {
    if (!sk.masked) continue;
    const mask = s.layers[sk.side === 'top' ? sk.layer - 1 : sk.layer + 1];
    const c1 = mask.onLaminate.v, c2 = mask.onCopper.v, c3 = mask.between.v;
    const sg = sk.side === 'top' ? 1 : -1;
    const h = (u) => sg * (surfaceAt(sk.surface, u) - sk.z0);
    const t0 = s.layers[sk.layer].t.v;
    const feats = arr.features.filter((f) => f.layer === sk.layer).sort((a, b) => a.a - b.a);
    for (let k = 0; k < sk.surface.length; k += 2) if (sg * (sk.surface[k + 1] - sk.z0) < Math.min(c1, c3) - 1e-12) { fail(`${sk.side} mask thinner than on laminate at u ${sk.surface[k]}`); break; }
    if (!feats.length || Number.isFinite(feats[0].a)) { if (Math.abs(h(-sec.ext) - c1) > 1e-12) fail(`${sk.side} mask on laminate at the left: ${h(-sec.ext)} vs ${c1}`); }
    if (!feats.length || Number.isFinite(feats[feats.length - 1].b)) { if (Math.abs(h(sec.ext) - c1) > 1e-12) fail(`${sk.side} mask on laminate at the right`); }
    const maskPoly = sec.regions.find((r) => sec.materials[r.mat].kind === 'mask' && sec.materials[r.mat].layer === (sk.side === 'top' ? sk.layer - 1 : sk.layer + 1));
    feats.forEach((f, k) => {
      const a = Math.max(f.a, -sec.ext), b = Math.min(f.b, sec.ext);
      const mid = (a + b) / 2;
      const over = h(mid) - t0;
      if (Math.abs(over - c2) > 1e-12 && !(k > 0 && feats[k - 1].b > f.a)) fail(`${sk.side} mask over copper at u ${mid}: ${over} vs ${c2}`);
      if (k > 0) {
        const gap = f.a - feats[k - 1].b;
        if (gap / 2 > c2 + 1e-12 && Math.abs(h(feats[k - 1].b + gap / 2) - Math.max(c3, 0)) > 1e-12) fail(`${sk.side} mask between features: ${h(feats[k - 1].b + gap / 2)} vs ${c3}`);
      }
      // Side walls: at half height the mask reaches at least c2 across from the copper.
      const e = S.etchOffset(s.layers[sk.layer]);
      const half = e / 2; // the side at half height is e/2 in from the outer edge, whichever way the trapezoid faces
      const zMid = sk.z0 + sg * t0 / 2;
      const gapL = k > 0 ? f.a - feats[k - 1].b : Infinity;
      const gapR = k < feats.length - 1 ? feats[k + 1].a - f.b : Infinity;
      if (Number.isFinite(f.a) && gapL >= c2 + e) {
        const u = f.a + half - 0.999 * c2;
        if (!inside(maskPoly.pts, u, zMid)) fail(`${sk.side} mask on the left wall of feature ${k + 1} is thinner than ${c2}`);
      }
      if (Number.isFinite(f.b) && gapR >= c2 + e) {
        const u = f.b - half + 0.999 * c2;
        if (!inside(maskPoly.pts, u, zMid)) fail(`${sk.side} mask on the right wall of feature ${k + 1} is thinner than ${c2}`);
      }
    });
  }
  if (opts.count) opts.count.n += 1;
  t.ok(good, `${label}: section invariants`);
  return sec;
}

export function run(t) {
  const count = { n: 0 };
  const kinds = T.TRACE_KINDS.map((k) => k.kind);
  let built = 0;
  let missing = 0;
  for (const id of P.PRESET_IDS) {
    const s = P.presetStackup(id);
    for (const kind of kinds) {
      const st = T.presetStructure(kind, s, 0.15);
      if (!st) { missing += 1; continue; }
      built += 1;
      for (const masked of [true, false]) {
        st.masked = masked;
        checkSection(t, s, st, `${id} ${kind}${masked ? '' : ' unmasked'}`, { count });
      }
      // Variants: a narrow gap where the coats meet, a finite coplanar ground, walls.
      if (T.KIND_INFO[kind].signals === 2 && kind !== 'broadside') { st.s = S.val(0.02); st.masked = true; checkSection(t, s, st, `${id} ${kind} narrow gap`, { count }); }
      if (T.KIND_INFO[kind].coplanar) { st.gw = S.val(0.3); st.g = S.val(0.025); checkSection(t, s, st, `${id} ${kind} finite ground`, { count }); }
      st.wall = S.val(3); checkSection(t, s, st, `${id} ${kind} walls`, { count });
    }
    // The bottom side: a microstrip pair on the bottom layer under its neighbour.
    const C = s.layers.filter((l) => l.kind === 'copper').map((l) => l.id);
    const bot = T.presetStructure('pair-cpw', s, 0.12);
    bot.layer = C[C.length - 1]; bot.below = ''; bot.above = C[C.length - 2]; bot.gw = S.val(0.2);
    checkSection(t, s, bot, `${id} bottom coplanar pair`, { count });
  }
  t.note(`${built} preset structures on ${P.PRESET_IDS.length} stackups (${missing} kinds need more copper layers than a stackup has).`);
  // Owner's microstrip C39 and its mask: mask 15.24 µm over the 0.035 copper, 30.48 µm on laminate.
  const s = P.presetStackup('JLC061611-3313A');
  const ms = T.presetStructure('microstrip', s, 0.1377);
  const sec = checkSection(t, s, ms, 'C39 microstrip', { count });
  const sig = sec.conductors.find((c) => c.id === 1);
  t.near(sig.pts[1], S.stackZ(s)[2], 'C39: the trace stands on the 3313 prepreg', 1e-12);
  t.near(sig.pts[2] - sig.pts[0], 0.1377, 'C39 base width');
  t.near(sig.pts[4] - sig.pts[6], 0.1377 - 0.7 * 0.0254, 'C39 top width = base − 0.7 mil');
  t.eq(sec.planeBelow, S.stackZ(s)[3], 'C39 plane below is L2’s top');
  t.eq(sec.regions.filter((r) => sec.materials[r.mat].kind === 'dielectric').length, 1, 'C39: one dielectric band (the 3313)');
  // A KiCad-like mask: one thickness everywhere, no etch.
  const k = P.presetStackup('JLC061611-3313A');
  for (const l of k.layers) {
    if (l.kind === 'mask') { l.onLaminate = S.val(0.01); l.onCopper = S.val(0.01); l.between = S.val(0.01); }
    if (l.kind === 'copper') l.etch = { kind: 'none' };
  }
  for (const kind of kinds) { const st = T.presetStructure(kind, k, 0.11); if (st) checkSection(t, k, st, `KiCad-like ${kind}`, { count }); }
  // A thick mask between traces (c3 above the copper) and copper whose fill side is overridden.
  const thick = P.presetStackup('JLC04161H-7628');
  thick.layers[0].between = S.val(0.08);
  thick.layers[1].fill = 'down';
  checkSection(t, thick, T.presetStructure('pair-cpw', thick, 0.2), 'thick mask between, flipped top copper', { count });
  // Randomised general arrangements (seeded): features on any copper layer not a plane, grounds to the edge.
  const rnd = mulberry32(20261116);
  let tried = 0;
  let valid = 0;
  for (let n = 0; n < 400; n += 1) {
    const s2 = P.presetStackup(P.PRESET_IDS[Math.floor(rnd() * P.PRESET_IDS.length)]);
    const C = s2.layers.filter((l) => l.kind === 'copper').map((l) => l.id);
    const st = T.presetStructure('general', s2, 0.1);
    const pb = Math.floor(rnd() * (C.length + 1)) - 1;
    st.above = '';
    st.below = pb >= 1 ? C[pb] : '';
    const pa = pb >= 2 && rnd() < 0.5 ? Math.floor(rnd() * (pb - 1)) : -1;
    if (pa >= 0) st.above = C[pa];
    const lo = pa + 1;
    const hi = pb >= 1 ? pb - 1 : C.length - 1;
    const pick = () => C[lo + Math.floor(rnd() * (hi - lo + 1))];
    st.signals = [];
    st.grounds = [];
    const ns = 1 + Math.floor(rnd() * 3);
    let u = -0.6;
    for (let i = 0; i < ns; i += 1) {
      const w = 0.03 + rnd() * 0.3;
      u += 0.005 + rnd() * 0.2;
      st.signals.push({ layer: pick(), w: S.val(w), u: S.val(u + w / 2) });
      u += w;
    }
    if (rnd() < 0.5) {
      const layer = pick();
      st.grounds.push({ layer, a: null, b: S.val(-0.7 - rnd() * 0.2) });
      st.grounds.push({ layer, a: S.val(u + 0.01 + rnd() * 0.2), b: rnd() < 0.5 ? null : S.val(u + 0.6) });
    }
    st.masked = rnd() < 0.8;
    if (rnd() < 0.15) st.wall = S.val(2 + rnd());
    tried += 1;
    if (T.structureIssues(s2, st).some((i) => i.level === 'error')) continue;
    valid += 1;
    checkSection(t, s2, st, `random ${n}`, { count });
  }
  t.note(`${count.n} sections checked; ${valid} of ${tried} random general arrangements were valid and checked.`);
  // Invalid structures are refused, not drawn.
  const bad = T.presetStructure('pair-microstrip', s, 0.1);
  bad.s = S.val(-0.01);
  t.ok(T.structureIssues(s, bad).some((i) => i.level === 'error'), 'overlapping pair refused');
  const bad2 = T.presetStructure('microstrip', s, 0.01);
  t.ok(T.structureIssues(s, bad2).some((i) => i.code === 'etch'), 'a trace narrower than its etch is refused');
  const bad3 = T.presetStructure('stripline', s);
  bad3.below = bad3.layer;
  t.ok(T.structureIssues(s, bad3).some((i) => i.code === 'plane'), 'a plane on the signal layer is refused');
  // Time: one section of the owner's microstrip and of a coplanar pair (M1.2 rebuilds it on every drag).
  const pair = T.presetStructure('pair-cpw', s, 0.11);
  for (const [name, st] of [['microstrip', ms], ['coplanar pair', pair]]) {
    for (let i = 0; i < 2000; i += 1) G.section(s, st);
    const N = 20000;
    const t0 = performance.now();
    for (let i = 0; i < N; i += 1) G.section(s, st);
    const us = ((performance.now() - t0) / N) * 1000;
    t.note(`section() of the ${name}: ${us.toFixed(1)} µs`);
    t.ok(us < 200, `section() of the ${name} takes ${us.toFixed(1)} µs (budget 200 µs)`);
  }
}
