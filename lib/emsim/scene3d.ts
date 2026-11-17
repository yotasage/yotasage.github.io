// The Via section's 3D view as plain geometry (step M5.1), framework-free and checked in Node
// (scripts/harness/emsim/check-scene3d.mjs). Board frame in mm, z up: x, y as lib/emsim/via.ts (via A at the origin, a
// pair's via B at (0, pitch)), z as stackZ (0 at the board's bottom). Every solid is a prism: a polygon with holes
// extruded from z0 to z1, so the renderer needs one kind of geometry. Polygons are flat [x0, y0, x1, y1, …], the outer
// ring counter-clockwise, holes clockwise. Solids do not overlap: a barrel's tube fills its hole in the laminate, a
// pad sits in the plane's antipad, a return via's tube fills its hole in the planes and the laminate. Copper of one
// conductor may meet: a return via that an antipad cuts into keeps the plane whole there and gets its pad on that
// plane (`return-pad`), and a feed is drawn where the via puts it even over a return via (the 2D drawings do the same).
// A pair's feed that would run into the other via leaves mirrored across the line between the vias.
//   The square of board drawn holds both 2D drawings' boxes (viaGeom.ts); feeds run to its edge. A backdrill takes the
// barrel, the pads and the laminate away inside its diameter down to its depth (`drilled`, the removed section, is
// drawn as a ghost). The top field map lies at `topZ`, between the two planes the barrel passes with the most laminate
// between them; the side map on the vertical plane through the barrels along `u` (sectionDir), as in the 2D views.

import { layerIndex, stackZ } from './stackup';
import type { Stackup } from './stackup';
import type { Antipad, ViaStructure } from './via';
import { barrelsOf, insideAntipad, sectionDir, sideGeom, topGeom } from './viaGeom';
import type { Pt } from './viaGeom';

export type PrismKind = 'barrel' | 'pad' | 'plane' | 'return' | 'return-pad' | 'feed' | 'dielectric' | 'mask';
export const PRISM_KINDS: readonly PrismKind[] = ['barrel', 'pad', 'plane', 'return', 'return-pad', 'feed', 'dielectric', 'mask'];

export interface Prism {
  kind: PrismKind;
  layer: string; // the stackup layer ('' for barrels and return vias, which cross layers)
  name: string; // barrel 'A'/'B', return via '1'…, feed 'entry'/'exit' with the barrel
  z0: number;
  z1: number;
  outer: number[];
  holes: number[][];
  er: number; // the laminate's or the mask's εr (NaN for copper)
  role: string; // 'core' | 'prepreg' for laminate
  ring?: { x: number; y: number; r0: number; r1: number }; // barrels, pads, return vias: the annulus it is
}
export interface Drilled { x: number; y: number; r: number; z0: number; z1: number }
export interface Scene3D {
  ok: boolean;
  thick: number;
  box: { x0: number; x1: number; y0: number; y1: number };
  centre: Pt; // the barrels' middle
  u: Pt; // the side view's direction (the cut-away and the side field plane contain it)
  prisms: Prism[];
  drilled: Drilled[];
  topZ: number; // the top field plane's height
  counts: Record<PrismKind, number>;
}

/** Segments of a full circle (pads, barrels, antipads). */
export const CIRCLE_SEG = 64;

const TAU = 2 * Math.PI;

/** A circle as a polygon: counter-clockwise, or clockwise for a hole. Same vertices for the same centre and radius. */
export function circlePoly(x: number, y: number, r: number, cw = false): number[] {
  const out = new Array<number>(2 * CIRCLE_SEG);
  for (let k = 0; k < CIRCLE_SEG; k++) {
    const a = (TAU * (cw ? CIRCLE_SEG - k : k)) / CIRCLE_SEG;
    out[2 * k] = x + r * Math.cos(a);
    out[2 * k + 1] = y + r * Math.sin(a);
  }
  return out;
}

function pushPt(out: number[], x: number, y: number) {
  const n = out.length;
  if (n >= 2 && Math.abs(out[n - 2] - x) < 1e-9 && Math.abs(out[n - 1] - y) < 1e-9) return;
  out.push(x, y);
}
function arc(out: number[], cx: number, cy: number, r: number, a0: number, a1: number) {
  const n = Math.max(2, Math.ceil((CIRCLE_SEG * Math.abs(a1 - a0)) / TAU));
  for (let k = 0; k <= n; k++) { const a = a0 + ((a1 - a0) * k) / n; pushPt(out, cx + r * Math.cos(a), cy + r * Math.sin(a)); }
}

/** The antipad's opening(s) as clockwise polygons: round around each barrel, or one outline around a pair when the
 *  circles overlap, a bridge joins them or the slot is oblong (all one outline with a waist half-width w). */
export function antipadHoles(ap: Antipad, v: ViaStructure): number[][] {
  const r = ap.d.v / 2;
  if (!(r > 0)) return [];
  if (!v.pitch) return [circlePoly(0, 0, r, true)];
  const p = v.pitch.v;
  const wo = 2 * r > p ? Math.sqrt(r * r - (p * p) / 4) : 0;
  const h = ap.shape === 'joined' && ap.bridge?.v > 0 ? ap.bridge.v / 2 : 0;
  const w = ap.shape === 'oblong' ? r : Math.max(wo, Math.min(h, r));
  if (!(w > 0)) return [circlePoly(0, 0, r, true), circlePoly(0, p, r, true)];
  const out: number[] = [];
  const yA = Math.sqrt(Math.max(0, r * r - w * w));
  const al = Math.atan2(yA, w);
  arc(out, 0, 0, r, al, -Math.PI - al); // via A's outer arc, clockwise round the bottom: (w, yA) → (−w, yA)
  if (h > r) { pushPt(out, -h, 0); pushPt(out, -h, p); } // a bridge wider than the circles
  arc(out, 0, p, r, al - Math.PI, -2 * Math.PI - al); // via B's, over the top: (−w, p − yA) → (w, p − yA)
  if (h > r) { pushPt(out, h, p); pushPt(out, h, 0); }
  const n = out.length;
  if (Math.abs(out[n - 2] - out[0]) < 1e-9 && Math.abs(out[n - 1] - out[1]) < 1e-9) out.length = n - 2;
  return [out];
}

const square = (b: Scene3D['box']) => [b.x0, b.y0, b.x1, b.y0, b.x1, b.y1, b.x0, b.y1];

/** The scene of the via; `traceW` is the feeds' width (the Trace section's). */
export function viaScene(st: Stackup, v: ViaStructure, traceW: number): Scene3D {
  const z = stackZ(st);
  const thick = z[0];
  const counts = Object.fromEntries(PRISM_KINDS.map((k) => [k, 0])) as Record<PrismKind, number>;
  const B = v ? barrelsOf(v) : [{ x: 0, y: 0 }];
  const centre = { x: 0, y: v?.pitch ? v.pitch.v / 2 : 0 };
  const bad: Scene3D = { ok: false, thick, box: { x0: -1, x1: 1, y0: -1, y1: 1 }, centre, u: { x: 1, y: 0 }, prisms: [], drilled: [], topZ: thick / 2, counts };
  if (!v) return bad;
  const iS = layerIndex(st, v.start), iE = layerIndex(st, v.end);
  if (iS < 0 || iE < 0 || iS > iE || !(v.drill?.v > 0) || !(thick > 0)) return bad;
  const u = sectionDir(v);
  // The square: both drawings' boxes.
  const tg = topGeom(st, v, traceW), sg = sideGeom(st, v, traceW);
  const H = Math.max((tg.box.x1 - tg.box.x0) / 2, (tg.box.y1 - tg.box.y0) / 2, (sg.box.x1 - sg.box.x0) / 2, 1);
  const box = { x0: centre.x - H, x1: centre.x + H, y0: centre.y - H, y1: centre.y + H };
  const sc: Scene3D = { ...bad, ok: true, box, u };
  const add = (p: Prism) => { sc.prisms.push(p); counts[p.kind] += 1; };
  const ring = (kind: PrismKind, layer: string, name: string, x: number, y: number, r0: number, r1: number, z0: number, z1: number) => {
    if (!(r1 > r0) || !(z1 > z0)) return;
    add({ kind, layer, name, z0, z1, outer: circlePoly(x, y, r1), holes: r0 > 0 ? [circlePoly(x, y, r0, true)] : [], er: NaN, role: '', ring: { x, y, r0, r1 } });
  };
  const rd = v.drill.v / 2;
  const wallOf = (r: number) => (v.plating?.v > 0 ? Math.min(v.plating.v, r) : Math.min(r, 0.015));
  // The barrel's span, less the backdrill.
  let zb0 = z[iE + 1], zb1 = z[iS];
  const bd = v.backdrill && v.backdrill.depth?.v > 0 && v.backdrill.d?.v > 0 ? v.backdrill : null;
  const rb = bd ? Math.max(bd.d.v / 2, rd) : 0;
  const zc = bd ? (bd.side === 'top' ? thick - bd.depth.v : bd.depth.v) : NaN;
  if (bd) {
    if (bd.side === 'top') zb1 = Math.min(zb1, zc); else zb0 = Math.max(zb0, zc);
    for (const b of B) sc.drilled.push(bd.side === 'top' ? { x: b.x, y: b.y, r: rb, z0: zc, z1: thick } : { x: b.x, y: b.y, r: rb, z0: 0, z1: zc });
  }
  const drilledAt = (za: number, zz: number) => !!bd && (bd.side === 'top' ? 0.5 * (za + zz) > zc : 0.5 * (za + zz) < zc);
  B.forEach((b, k) => ring('barrel', '', B.length > 1 ? (k ? 'B' : 'A') : '', b.x, b.y, rd - wallOf(rd), rd, zb0, zb1));
  // Return vias: through all the copper.
  const cuIdx = st.layers.map((l, i) => (l.kind === 'copper' ? i : -1)).filter((i) => i >= 0);
  const zr0 = z[cuIdx[cuIdx.length - 1] + 1], zr1 = z[cuIdx[0]];
  const rets: { x: number; y: number; r: number; k: number; pad: number; planes: string[] }[] = [];
  v.returns.forEach((r, k) => {
    if (!Number.isFinite(r.x?.v) || !Number.isFinite(r.y?.v) || !(r.drill?.v > 0)) return;
    const R = r.drill.v / 2;
    rets.push({ x: r.x.v, y: r.y.v, r: R, k, pad: r.pad?.v > 0 ? r.pad.v / 2 : 0, planes: r.planes });
    ring('return', '', String(k + 1), r.x.v, r.y.v, R - wallOf(R), R, zr0, zr1);
  });
  // A hole for each barrel and return via a layer between za and zz meets (laminate and mask).
  const barrelHoles = (za: number, zz: number, out: number[][]) => {
    const inB = za < zb1 - 1e-12 && zz > zb0 + 1e-12;
    const dr = drilledAt(za, zz);
    if (inB || dr) for (const b of B) out.push(circlePoly(b.x, b.y, dr ? rb : rd, true));
  };
  const returnHoles = (za: number, zz: number, out: number[][], skip: (x: number, y: number, r: number) => boolean, skipped: (typeof rets)[number][] = []) => {
    if (!(za < zr1 - 1e-12 && zz > zr0 + 1e-12)) return;
    const kept: typeof rets = [];
    for (const r of rets) {
      if (skip(r.x, r.y, r.r) || kept.some((q) => Math.hypot(q.x - r.x, q.y - r.y) < q.r + r.r)) { skipped.push(r); continue; }
      kept.push(r);
      out.push(circlePoly(r.x, r.y, r.r, true));
    }
  };
  const nearBarrel = (holeR: (k: number) => number) => (x: number, y: number, r: number) => B.some((b, k) => Math.hypot(b.x - x, b.y - y) < holeR(k) + r);
  const padOf = new Map(v.pads.map((p) => [p.layer, p.d ? p.d.v / 2 : 0]));
  const planes = new Set(v.planes);
  // Each layer, cut at the backdrill's depth where it ends inside one.
  st.layers.forEach((l, i) => {
    const za = z[i + 1], zz = z[i];
    if (!(zz > za)) return;
    if (l.kind === 'dielectric' || l.kind === 'mask') {
      const parts: [number, number][] = bd && zc > za + 1e-9 && zc < zz - 1e-9 ? [[za, zc], [zc, zz]] : [[za, zz]];
      for (const [a, b] of parts) {
        const holes: number[][] = [];
        barrelHoles(a, b, holes);
        const hr = drilledAt(a, b) ? rb : rd;
        const inB = (a < zb1 - 1e-12 && b > zb0 + 1e-12) || drilledAt(a, b);
        returnHoles(a, b, holes, inB ? nearBarrel(() => hr) : () => false);
        add({ kind: l.kind, layer: l.id, name: '', z0: a, z1: b, outer: square(box), holes, er: l.er?.v ?? NaN, role: l.kind === 'dielectric' ? l.role : '' });
      }
      return;
    }
    const inBarrel = i >= iS && i <= iE;
    const dr = drilledAt(za, zz);
    if (planes.has(l.id)) {
      const holes: number[][] = [];
      const ap = inBarrel || dr ? v.antipads.find((a) => a.layer === l.id && a.d?.v > 0) : undefined;
      if (ap) holes.push(...antipadHoles(ap, v));
      else if (inBarrel || dr) for (const b of B) holes.push(circlePoly(b.x, b.y, Math.max(dr ? rb : rd, inBarrel ? padOf.get(l.id) ?? 0 : 0), true)); // joined to the via
      const inAp = (x: number, y: number, r: number) => {
        if (!ap) return (inBarrel || dr) && nearBarrel(() => (dr ? rb : rd))(x, y, r);
        if (insideAntipad(ap, v, x, y)) return true;
        for (let k = 0; k < 16; k++) { const a = (TAU * k) / 16; if (insideAntipad(ap, v, x + r * Math.cos(a), y + r * Math.sin(a))) return true; }
        return false;
      };
      const cut: typeof rets = [];
      returnHoles(za, zz, holes, inAp, cut);
      add({ kind: 'plane', layer: l.id, name: '', z0: za, z1: zz, outer: square(box), holes, er: NaN, role: '' });
      for (const r of cut) if (r.planes.includes(l.id)) ring('return-pad', l.id, String(r.k + 1), r.x, r.y, r.r, r.pad, za, zz);
    }
    const pr = inBarrel ? padOf.get(l.id) ?? 0 : 0;
    if (pr > 0) B.forEach((b, k) => ring('pad', l.id, B.length > 1 ? (k ? 'B' : 'A') : '', b.x, b.y, dr ? Math.max(rb, rd) : rd, pr, za, zz));
  });
  // Feeds from the pad's edge to the square's edge (or their length).
  for (const f of v.feeds) {
    const i = layerIndex(st, f.layer);
    if (i < 0 || !(f.length?.v > 0) || !Number.isFinite(f.angle)) continue;
    const a = (f.angle * Math.PI) / 180;
    const t0 = Math.max(padOf.get(f.layer) ?? 0, rd);
    const w = Math.max(traceW, 0.02) / 2;
    B.forEach((b, k) => {
      const dx = Math.cos(a);
      let dy = Math.sin(a);
      const o = B[1 - k];
      if (o && dx * (o.x - b.x) + dy * (o.y - b.y) > 1e-9) dy = -dy; // towards the other via: mirrored
      let t1 = t0 + f.length.v;
      for (const [d0, lo, hi, o] of [[dx, box.x0, box.x1, b.x], [dy, box.y0, box.y1, b.y]] as const) {
        if (d0 > 1e-12) t1 = Math.min(t1, (hi - o) / d0);
        else if (d0 < -1e-12) t1 = Math.min(t1, (lo - o) / d0);
      }
      if (!(t1 > t0)) return;
      const nx = -dy * w, ny = dx * w;
      const sx = b.x + dx * t0, sy = b.y + dy * t0, ex = b.x + dx * t1, ey = b.y + dy * t1;
      add({
        kind: 'feed', layer: f.layer, name: `${f.layer === v.entry ? 'entry' : 'exit'}${B.length > 1 ? (k ? ' B' : ' A') : ''}`, z0: z[i + 1], z1: z[i],
        outer: [sx - nx, sy - ny, ex - nx, ey - ny, ex + nx, ey + ny, sx + nx, sy + ny], holes: [], er: NaN, role: '',
      });
    });
  }
  // The top map's height: the middle of the most laminate between two planes the barrel passes.
  const pl = st.layers.map((l, i) => (planes.has(l.id) && i >= iS && i <= iE ? i : -1)).filter((i) => i >= 0);
  let best = -1;
  sc.topZ = 0.5 * (zb0 + zb1);
  for (let k = 0; k + 1 < pl.length; k++) {
    const g = z[pl[k] + 1] - z[pl[k + 1]];
    if (g > best) { best = g; sc.topZ = 0.5 * (z[pl[k] + 1] + z[pl[k + 1]]); }
  }
  return sc;
}
