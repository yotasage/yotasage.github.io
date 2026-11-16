// The Via section's drawings as geometry (step M3.1a), framework-free so M3.1b can add handles and pan-zoom on the
// same world: everything in mm.
//   Side view: x along the section line u through the via's centre (sectionDir), y down from the board's top surface
//   (y = zTop − z of stackZ), so the board spans y 0 … thickness. Return vias and a barrel off the line are projected
//   onto it (`inCut` false: drawn faded, behind the cut).
//   Top view: the board's (x, y) with y flipped for the screen: world (x, −y). The via's centre (pair: via A) is the
//   origin, a pair's via B at board (0, pitch) (lib/emsim/via.ts).
// The antipad shapes are tests (`insideAntipad`); the cut's openings are found on the section line by sampling and
// bisection, so a new shape needs only its test.

import { layerIndex, stackZ } from '../../lib/emsim/stackup';
import type { Stackup } from '../../lib/emsim/stackup';
import { viaStubs } from '../../lib/emsim/via';
import type { Antipad, ViaStructure } from '../../lib/emsim/via';

export interface Pt { x: number; y: number }
export interface Box { x0: number; x1: number; y0: number; y1: number }

/** The barrels' centres in the board frame (mm). */
export function barrelsOf(v: ViaStructure): Pt[] {
  return v.pitch ? [{ x: 0, y: 0 }, { x: 0, y: v.pitch.v }] : [{ x: 0, y: 0 }];
}

/** Whether board point (x, y) lies inside the antipad's opening (the shapes of via.ts's Antipad). */
export function insideAntipad(ap: Antipad, v: ViaStructure, x: number, y: number): boolean {
  const r = ap.d.v / 2;
  const p = v.pitch ? v.pitch.v : 0;
  if (ap.shape === 'oblong' && v.pitch) {
    const t = Math.max(0, Math.min(p, y));
    return Math.hypot(x, y - t) <= r;
  }
  if (Math.hypot(x, y) <= r) return true;
  if (!v.pitch) return false;
  if (Math.hypot(x, y - p) <= r) return true;
  return ap.shape === 'joined' && !!ap.bridge && Math.abs(x) <= ap.bridge.v / 2 && y >= 0 && y <= p;
}

/** The section line's direction: along a pair; for one via against its entry feed (the entry comes in from the left). */
export function sectionDir(v: ViaStructure): Pt {
  if (v.pitch) return { x: 0, y: 1 };
  const f = v.feeds.find((x) => x.layer === v.entry) ?? v.feeds[0];
  if (!f || !Number.isFinite(f.angle)) return { x: 1, y: 0 };
  const a = (f.angle * Math.PI) / 180;
  return { x: -Math.cos(a), y: -Math.sin(a) };
}

const along = (u: Pt, p: Pt): number => p.x * u.x + p.y * u.y;
const across = (u: Pt, p: Pt): number => -p.x * u.y + p.y * u.x;

/** The intervals of the section line (s from a to b) inside a set: sampled, edges refined by bisection. */
function intervalsOn(inside: (s: number) => boolean, a: number, b: number, n = 480): [number, number][] {
  const out: [number, number][] = [];
  const h = (b - a) / n;
  const edge = (lo: number, hi: number, inLo: boolean): number => {
    for (let k = 0; k < 24; k++) { const m = 0.5 * (lo + hi); if (inside(m) === inLo) lo = m; else hi = m; }
    return 0.5 * (lo + hi);
  };
  let prev = inside(a);
  let start = prev ? a : NaN;
  for (let i = 1; i <= n; i++) {
    const s = a + i * h;
    const cur = inside(s);
    if (cur !== prev) {
      const e = edge(s - h, s, prev);
      if (cur) start = e; else out.push([start, e]);
      prev = cur;
    }
  }
  if (prev) out.push([start, b]);
  return out;
}

/** The stubs worth listing: the model also counts the half of a signal layer's copper beyond its middle as a stub
 *  (some µm, resonating above a THz); only barrel beyond the signal layer's copper is listed. */
export function realStubs<T extends { side: 'entry' | 'exit'; length: number }>(st: Stackup, v: ViaStructure, stubs: T[]): T[] {
  return stubs.filter((x) => {
    const l = st.layers[layerIndex(st, x.side === 'entry' ? v.entry : v.exit)];
    return l && l.kind === 'copper' && x.length > l.t.v / 2 + 1e-6;
  });
}

export interface SideLayer { i: number; id: string; name: string; kind: 'mask' | 'copper' | 'dielectric'; role: string; y0: number; y1: number; plane: boolean; signal: '' | 'entry' | 'exit' }
export interface SideRect extends Box { what: 'plane' | 'pad' | 'feed' | 'return-pad'; layer: string }
export interface SideBarrel { s: number; inCut: boolean; d: number; wall: number; y0: number; y1: number; name: string }
export interface SideReturn { k: number; s: number; inCut: boolean; d: number; y0: number; y1: number }
export interface SideStub { s: number; side: 'top' | 'bottom'; y0: number; y1: number; length: number }
export interface SideGeom {
  ok: boolean;
  u: Pt;
  thick: number; // board thickness (mm)
  air: number; // air drawn above and below (mm)
  box: Box; // the world drawn (x along the cut, y down from the top surface, air included)
  layers: SideLayer[];
  copper: SideRect[];
  openings: SideRect[]; // the antipads' cut through the plane layers (drawn as laminate)
  barrels: SideBarrel[];
  drilled: Box[]; // backdrilled holes
  stubs: SideStub[];
  returns: SideReturn[];
  feedEnds: { side: 'entry' | 'exit'; s: number; y: number; clipped: boolean; across: boolean }[];
}

/** The side view's geometry; `traceW` is the feed traces' width (the Trace section's). */
export function sideGeom(st: Stackup, v: ViaStructure, traceW: number): SideGeom {
  const z = stackZ(st);
  const thick = z[0];
  const u = sectionDir(v);
  const iS = layerIndex(st, v.start), iE = layerIndex(st, v.end), iA = layerIndex(st, v.entry), iB = layerIndex(st, v.exit);
  const bad: SideGeom = { ok: false, u, thick, air: 0, box: { x0: -1, x1: 1, y0: 0, y1: Math.max(thick, 0.1) }, layers: [], copper: [], openings: [], barrels: [], drilled: [], stubs: [], returns: [], feedEnds: [] };
  if (iS < 0 || iE < 0 || iS > iE || !(v.drill?.v > 0) || !(thick > 0)) return bad;
  const yOf = (zz: number) => thick - zz;
  const B = barrelsOf(v);
  const planes = new Set(v.planes);
  const padOf = new Map(v.pads.map((p) => [p.layer, p.d ? p.d.v : 0]));
  const padMax = Math.max(v.drill.v, ...v.pads.map((p) => (p.d ? p.d.v : 0)));
  // The extent: what is near the barrels, and the returns.
  const cs = B.map((b) => along(u, b));
  const c = 0.5 * (Math.min(...cs) + Math.max(...cs));
  let R = 0;
  for (const s of cs) R = Math.max(R, Math.abs(s - c) + padMax / 2);
  for (const ap of v.antipads) if (ap.d?.v > 0) for (const s of cs) R = Math.max(R, Math.abs(s - c) + ap.d.v / 2);
  v.returns.forEach((r) => { if (Number.isFinite(r.x?.v) && Number.isFinite(r.y?.v)) R = Math.max(R, Math.abs(along(u, { x: r.x.v, y: r.y.v }) - c) + (r.pad ? r.pad.v : r.drill?.v ?? 0) / 2); });
  if (v.backdrill?.d?.v > 0) R = Math.max(R, v.backdrill.d.v / 2);
  R = Math.max(R * 1.25, R + 0.3);
  const x0 = c - R, x1 = c + R;
  const air = Math.max(0.12, 0.08 * thick);
  const g: SideGeom = { ...bad, ok: true, air, box: { x0, x1, y0: -air, y1: thick + air } };
  const lo = Math.min(iA, iB), hi = Math.max(iA, iB);
  st.layers.forEach((l, i) => {
    const y0 = yOf(z[i]), y1 = yOf(z[i + 1]);
    g.layers.push({ i, id: l.id, name: l.name || l.id, kind: l.kind, role: l.kind === 'dielectric' ? l.role : '', y0, y1, plane: planes.has(l.id), signal: l.id === v.entry ? 'entry' : l.id === v.exit ? 'exit' : '' });
    if (l.kind !== 'copper') return;
    const inBarrel = i >= iS && i <= iE;
    if (planes.has(l.id)) {
      const ap = inBarrel ? v.antipads.find((a) => a.layer === l.id) : null;
      const open = ap && ap.d?.v > 0 ? intervalsOn((s) => insideAntipad(ap, v, s * u.x, s * u.y), x0, x1) : [];
      let at = x0;
      for (const [a, b] of open) {
        if (a > at) g.copper.push({ x0: at, x1: a, y0, y1, what: 'plane', layer: l.id });
        g.openings.push({ x0: a, x1: b, y0, y1, what: 'plane', layer: l.id });
        at = b;
      }
      if (at < x1) g.copper.push({ x0: at, x1, y0, y1, what: 'plane', layer: l.id });
    }
    const pd = inBarrel ? padOf.get(l.id) ?? 0 : 0;
    if (pd > 0) for (const s of cs) g.copper.push({ x0: s - pd / 2, x1: s + pd / 2, y0, y1, what: 'pad', layer: l.id });
  });
  // Feeds on the signal layers, projected onto the section line (a feed across the line shows as its width only).
  for (const f of v.feeds) {
    const i = layerIndex(st, f.layer);
    if (i < 0 || !(f.length?.v > 0) || !Number.isFinite(f.angle)) continue;
    const a = (f.angle * Math.PI) / 180;
    const proj = Math.cos(a) * u.x + Math.sin(a) * u.y;
    const pd = (padOf.get(f.layer) ?? 0) / 2;
    const side = f.layer === v.entry ? 'entry' : 'exit';
    const y0 = yOf(z[i]), y1 = yOf(z[i + 1]);
    for (const s of cs) {
      if (Math.abs(proj) < 0.2) {
        const w = Math.max(traceW, 0.02) / 2;
        g.copper.push({ x0: s - w, x1: s + w, y0, y1, what: 'feed', layer: f.layer });
        g.feedEnds.push({ side, s, y: y0, clipped: false, across: true });
        continue;
      }
      const sa = s + Math.sign(proj) * pd, sb = s + proj * (pd + f.length.v);
      const end = Math.max(x0, Math.min(x1, sb));
      g.copper.push({ x0: Math.min(sa, end), x1: Math.max(sa, end), y0, y1, what: 'feed', layer: f.layer });
      g.feedEnds.push({ side, s: end, y: y0, clipped: end !== sb, across: false });
    }
  }
  // The barrel: plated from the start layer's top to the end layer's bottom, less what is backdrilled.
  let yTop = yOf(z[iS]), yBot = yOf(z[iE + 1]);
  const bd = v.backdrill;
  if (bd && bd.depth?.v > 0 && bd.d?.v > 0) {
    for (const s of cs) g.drilled.push(bd.side === 'top' ? { x0: s - bd.d.v / 2, x1: s + bd.d.v / 2, y0: -air, y1: bd.depth.v } : { x0: s - bd.d.v / 2, x1: s + bd.d.v / 2, y0: thick - bd.depth.v, y1: thick + air });
    if (bd.side === 'top') yTop = Math.max(yTop, bd.depth.v); else yBot = Math.min(yBot, thick - bd.depth.v);
  }
  const wall = Math.max(0, Math.min(v.plating?.v ?? 0, v.drill.v / 2));
  B.forEach((b, k) => g.barrels.push({ s: cs[k], inCut: Math.abs(across(u, b)) < v.drill.v / 2, d: v.drill.v, wall, y0: yTop, y1: yBot, name: B.length > 1 ? (k ? 'B' : 'A') : '' }));
  // Stubs: the barrel beyond the signal layers (after the backdrill).
  if (iA >= 0 && iB >= 0) {
    const sb = viaStubs(st, v);
    for (const s of cs) {
      if (sb.top > 1e-9) g.stubs.push({ s, side: 'top', y0: yTop, y1: yOf(z[lo]), length: sb.top });
      if (sb.bottom > 1e-9) g.stubs.push({ s, side: 'bottom', y0: yOf(z[hi + 1]), y1: yBot, length: sb.bottom });
    }
  }
  // Return vias through the board, projected.
  const cuIdx = st.layers.map((l, i) => (l.kind === 'copper' ? i : -1)).filter((i) => i >= 0);
  const yR0 = yOf(z[cuIdx[0]]), yR1 = yOf(z[cuIdx[cuIdx.length - 1] + 1]);
  v.returns.forEach((r, k) => {
    if (!Number.isFinite(r.x?.v) || !Number.isFinite(r.y?.v) || !(r.drill?.v > 0)) return;
    const p = { x: r.x.v, y: r.y.v };
    const s = along(u, p), t = across(u, p);
    if (s < x0 || s > x1) return;
    const inCut = Math.abs(t) < r.drill.v / 2;
    g.returns.push({ k, s, inCut, d: r.drill.v, y0: yR0, y1: yR1 });
    if (r.pad?.v > 0) for (const id of r.planes) {
      const i = layerIndex(st, id);
      if (i >= 0) g.copper.push({ x0: s - r.pad.v / 2, x1: s + r.pad.v / 2, y0: yOf(z[i]), y1: yOf(z[i + 1]), what: 'return-pad', layer: id });
    }
  });
  return g;
}

export interface TopShape { layer: string; d: string } // an SVG path in world mm (x, −y)
export interface TopGeom {
  box: Box;
  barrels: { x: number; y: number; name: string; pad: number; drill: number }[];
  antipads: TopShape[]; // one per plane the barrel passes, union drawn as laminate
  returns: { k: number; x: number; y: number; pad: number; drill: number }[];
  feeds: { side: 'entry' | 'exit'; layer: string; x0: number; y0: number; x1: number; y1: number; w: number; clipped: boolean }[];
  cut: { x0: number; y0: number; x1: number; y1: number }; // the side view's section line
  pitch: number | null;
}

const fx = (x: number) => +x.toFixed(5);
const circle = (cx: number, cy: number, r: number) => `M${fx(cx - r)} ${fx(cy)}a${fx(r)} ${fx(r)} 0 1 0 ${fx(2 * r)} 0a${fx(r)} ${fx(r)} 0 1 0 ${fx(-2 * r)} 0Z`;

/** The antipad as a path in the top view's world (x, −y). */
export function antipadPath(ap: Antipad, v: ViaStructure): string {
  const r = ap.d.v / 2;
  if (!(r > 0)) return '';
  if (!v.pitch) return circle(0, 0, r);
  const p = v.pitch.v;
  if (ap.shape === 'oblong') return `M${fx(-r)} 0L${fx(-r)} ${fx(-p)}A${fx(r)} ${fx(r)} 0 0 1 ${fx(r)} ${fx(-p)}L${fx(r)} 0A${fx(r)} ${fx(r)} 0 0 1 ${fx(-r)} 0Z`;
  let d = circle(0, 0, r) + circle(0, -p, r);
  if (ap.shape === 'joined' && ap.bridge?.v > 0) { const h = ap.bridge.v / 2; d += `M${fx(-h)} 0H${fx(h)}V${fx(-p)}H${fx(-h)}Z`; }
  return d;
}

/** The top view's geometry. */
export function topGeom(st: Stackup, v: ViaStructure, traceW: number): TopGeom {
  const B = barrelsOf(v);
  const iS = layerIndex(st, v.start), iE = layerIndex(st, v.end);
  const padOf = new Map(v.pads.map((p) => [p.layer, p.d ? p.d.v : 0]));
  const padMax = Math.max(v.drill?.v ?? 0, ...v.pads.map((p) => (p.d ? p.d.v : 0)));
  const cx = 0, cy = v.pitch ? -v.pitch.v / 2 : 0;
  let R = padMax / 2 + (v.pitch ? v.pitch.v / 2 : 0);
  for (const ap of v.antipads) if (ap.d?.v > 0) R = Math.max(R, ap.d.v / 2 + (v.pitch ? v.pitch.v / 2 : 0), ap.shape === 'joined' && ap.bridge ? ap.bridge.v / 2 : 0);
  const rets: TopGeom['returns'] = [];
  v.returns.forEach((r, k) => {
    if (!Number.isFinite(r.x?.v) || !Number.isFinite(r.y?.v)) return;
    const pad = r.pad?.v > 0 ? r.pad.v : r.drill?.v ?? 0;
    rets.push({ k, x: r.x.v, y: -r.y.v, pad, drill: r.drill?.v ?? 0 });
    R = Math.max(R, Math.hypot(r.x.v - cx, -r.y.v - cy) + pad / 2);
  });
  R = Math.max(R * 1.2, R + 0.25);
  const box = { x0: cx - R, x1: cx + R, y0: cy - R, y1: cy + R };
  const antipads: TopShape[] = [];
  for (const ap of v.antipads) {
    const i = layerIndex(st, ap.layer);
    if (i < iS || i > iE || !(ap.d?.v > 0)) continue;
    antipads.push({ layer: ap.layer, d: antipadPath(ap, v) });
  }
  const feeds: TopGeom['feeds'] = [];
  for (const f of v.feeds) {
    if (!(f.length?.v > 0) || !Number.isFinite(f.angle)) continue;
    const a = (f.angle * Math.PI) / 180;
    const dx = Math.cos(a), dy = -Math.sin(a);
    const pr = (padOf.get(f.layer) ?? 0) / 2;
    for (const b of B) {
      const bx = b.x, by = -b.y;
      const full = pr + f.length.v;
      // Clip to the box (a ray from inside the box).
      let tMax = full;
      for (const [d0, lo, hi, o] of [[dx, box.x0, box.x1, bx], [dy, box.y0, box.y1, by]] as const) {
        if (d0 > 1e-12) tMax = Math.min(tMax, (hi - o) / d0);
        else if (d0 < -1e-12) tMax = Math.min(tMax, (lo - o) / d0);
      }
      if (tMax <= pr) continue;
      feeds.push({ side: f.layer === v.entry ? 'entry' : 'exit', layer: f.layer, x0: bx + dx * pr, y0: by + dy * pr, x1: bx + dx * tMax, y1: by + dy * tMax, w: Math.max(traceW, 0.02), clipped: tMax < full - 1e-9 });
    }
  }
  const u = sectionDir(v);
  const cut = { x0: cx - u.x * R, y0: cy + u.y * R, x1: cx + u.x * R, y1: cy - u.y * R };
  const topPad = Math.max(padOf.get(v.entry) ?? 0, padOf.get(v.exit) ?? 0, v.drill?.v ?? 0);
  return {
    box,
    barrels: B.map((b, k) => ({ x: b.x, y: -b.y, name: B.length > 1 ? (k ? 'B' : 'A') : '', pad: topPad, drill: v.drill?.v ?? 0 })),
    antipads, returns: rets, feeds, cut, pitch: v.pitch ? v.pitch.v : null,
  };
}

/** px per mm that fits a world box into W × Hmax px (with `pad` px around). */
export function fitK(box: Box, W: number, Hmax: number, pad: number): number {
  return Math.max(1e-6, Math.min((W - 2 * pad) / (box.x1 - box.x0), (Hmax - 2 * pad) / (box.y1 - box.y0)));
}
