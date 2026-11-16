// The Trace section's drawing, framework-free (M2.1c): the world the pan-zoom controller (panZoom.ts) looks at, the
// fit that shows the whole cross-section, and the drag handles of the preset structures with the edit each one makes.
//
// World: x = u (mm across, 0 at the structure's centre), y = Y(z) down; without widening Y = −z (mm, z up from the
// stack's bottom), widened every board layer is at least MIN px tall at the fit's scale kRef (air stays linear).
// Handles: widths, gaps, the coplanar gap and ground width on the signal layer's base edges (the base is on fillSide's
// far side), a broadside pair's offset at the second trace's centre, and the thickness of every dielectric between the
// signals and their planes on its top face (thickening it moves everything above, so the face follows the pointer).
// M2.1d: the general structure's handles (`sig.<i>.w|u`, `gnd.<i>.a|b`), a fit that fills a short box, `labelSpot`.

import type { Section } from '../../lib/emsim/geometry';
import type { Setup } from '../../lib/emsim/setup';
import { cloneStackup, fillSide, layerIndex, stackupIssues, stackZ, TYPED } from '../../lib/emsim/stackup';
import type { DielectricLayer, Stackup, Val } from '../../lib/emsim/stackup';
import { KIND_INFO, structureIssues } from '../../lib/emsim/structure';
import type { Structure } from '../../lib/emsim/structure';
import { fromMm, toMm } from '../../lib/emsim/units';
import type { LengthUnit } from '../../lib/emsim/units';
import type { Rect } from './panZoom';

export const MAXH = 340; // px: the drawing's height at most (more board is shown across instead)
export const MINH = 170; // px: and at least, while the copper still fits across
export const MIN = 9; // px per board layer when widened
/** Deepest zoom: px per mm (0.5 µm per px). */
export const MAX_K = 2000;

export interface WorldMap { Y: (z: number) => number; Z: (y: number) => number }

// The world's y of the stack's heights (see the head); widened layers are at least MIN / kRef world units.
export function worldMap(s: Stackup, widen: boolean, kRef: number): WorldMap {
  const z = stackZ(s);
  const n = s.layers.length;
  if (!widen) return { Y: (zz) => -zz, Z: (y) => -y };
  const B = new Float64Array(n + 1); // warped height of each face, from the bottom
  for (let i = n - 1; i >= 0; i--) B[i] = B[i + 1] + Math.max(z[i] - z[i + 1], MIN / kRef);
  const Y = (zz: number): number => {
    if (zz <= 0) return -zz;
    if (zz >= z[0]) return -(B[0] + zz - z[0]);
    for (let i = n - 1; i >= 0; i--) {
      if (zz <= z[i]) { const dz = z[i] - z[i + 1]; return -(B[i + 1] + (dz > 0 ? ((zz - z[i + 1]) / dz) * (B[i] - B[i + 1]) : 0)); }
    }
    return -zz;
  };
  const Z = (y: number): number => {
    const h = -y;
    if (h <= 0) return h;
    if (h >= B[0]) return z[0] + h - B[0];
    for (let i = n - 1; i >= 0; i--) {
      if (h <= B[i]) { const dh = B[i] - B[i + 1]; return z[i + 1] + (dh > 0 ? ((h - B[i + 1]) / dh) * (z[i] - z[i + 1]) : 0); }
    }
    return h;
  };
  return { Y, Z };
}

export interface TraceFit { rect: Rect; H: number; kRef: number; content: [number, number] /* world y of the section's top and bottom */ }

// The view that shows the whole section in a box W px wide (the M2.1b drawing's choice of scale and window).
export function traceFit(s: Stackup, st: Structure, sec: Section, W: number, widen: boolean): TraceFit {
  const z = stackZ(s);
  const thick = (id: string) => { const i = layerIndex(s, id); return i >= 0 ? z[i] - z[i + 1] : 0; };
  let ext = 0;
  for (const c of sec.conductors) {
    for (let i = 0; i < c.pts.length; i += 2) if (Math.abs(c.pts[i]) < sec.ext * (1 - 1e-9)) ext = Math.max(ext, Math.abs(c.pts[i]));
  }
  let lo = Infinity, hi = -Infinity;
  for (const sk of sec.skins) {
    for (let i = 1; i < sk.surface.length; i += 2) { lo = Math.min(lo, sk.surface[i]); hi = Math.max(hi, sk.surface[i]); }
    lo = Math.min(lo, sk.z0); hi = Math.max(hi, sk.z0);
  }
  for (const c of sec.conductors) for (let i = 1; i < c.pts.length; i += 2) { lo = Math.min(lo, c.pts[i]); hi = Math.max(hi, c.pts[i]); }
  const zb0 = sec.planeBelow !== null ? sec.zLo - thick(st.below) : lo;
  const zt0 = sec.planeAbove !== null ? sec.zHi + thick(st.above) : hi;
  const span = Math.max(zt0 - zb0, 1e-3);
  const pad = Math.max(0.3 * span, 0.04);
  const zBottom = sec.planeBelow !== null ? zb0 : Math.max(zb0 - pad, sec.zLo);
  const zTop = sec.planeAbove !== null ? zt0 : Math.min(zt0 + pad, sec.zHi);
  const vh = zTop - zBottom;
  const need = Math.max(ext * 1.25, ext + 0.03);
  let U = Math.max(ext * 1.3, ext + 1.4 * span);
  let k = W / (2 * U);
  if (vh * k > MAXH) { k = MAXH / vh; U = W / (2 * k); }
  else if (vh * k < MINH) { const k2 = Math.min(MINH / vh, W / (2 * need)); if (k2 > k) { k = k2; U = W / (2 * k); } }
  // M2.1d: still short because the width limits the scale (a thin board on a phone): zoom in until the section fills
  // FILL of the box, as long as the signals stay whole across (wide grounds may be cut at the sides).
  if (vh * k < FILL * MINH) {
    let sx = 0;
    for (const c of sec.conductors) if (c.id > 0) for (let i = 0; i < c.pts.length; i += 2) sx = Math.max(sx, Math.abs(c.pts[i]));
    const k3 = Math.min(FILL * MINH / vh, W / (2 * Math.max(sx * 1.15, sx + 0.02)));
    if (k3 > k) { k = k3; U = W / (2 * k); }
  }
  const m = worldMap(s, widen, k);
  let y0 = m.Y(zTop), y1 = m.Y(zBottom);
  // The box is at least MINH px; a section shorter than that gets air or board around it on the open sides.
  const H = Math.max(Math.round((y1 - y0) * k), MINH);
  const extra = H / k - (y1 - y0);
  if (extra > 0) {
    const up = sec.planeAbove !== null ? (sec.planeBelow !== null ? 0.5 : 0) : sec.planeBelow !== null ? 1 : 0.5;
    y0 -= extra * up; y1 += extra * (1 - up);
  }
  return { rect: { x0: -U, x1: U, y0, y1 }, H, kRef: k, content: [m.Y(zTop), m.Y(zBottom)] };
}

const FILL = 0.52; // the section fills at least this part of a MINH box when the signals allow it (a little more
// than half, so the default view still shows a 0.5 mm ground width beside a 50 Ω microstrip at 1440 px)

// Where a layer label (right-aligned at xr, `w` px wide, baseline candidates ys) goes so it covers no handle (circles
// of radius R px at hs): the first free candidate, else moved left of the handles it meets. Box is W × H px.
export function labelSpot(xr: number, w: number, ys: number[], hs: [number, number][], W: number, H: number, R = 14): [number, number] {
  const hits = (x1: number, yb: number) => hs.filter(([hx, hy]) => hx + R > x1 - w && hx - R < x1 && hy + R > yb - 11 && hy - R < yb + 3);
  const inBox = (yb: number) => yb - 11 >= 0 && yb + 3 <= H;
  for (const yb of ys) if (inBox(yb) && hits(xr, yb).length === 0) return [xr, yb];
  for (const yb of ys) {
    if (!inBox(yb)) continue;
    let x1 = xr;
    for (let n = 0; n < 8; n++) {
      const h = hits(x1, yb);
      if (!h.length) break;
      x1 = Math.min(...h.map(([hx]) => hx)) - R - 2;
    }
    if (x1 - w >= 0 && hits(x1, yb).length === 0) return [x1, yb];
  }
  return [xr, ys.find(inBox) ?? ys[0]];
}

// A 1-2-5 step of at least `mm`, round in the shown unit.
export function niceStep(mm: number, unit: LengthUnit): number {
  const u = unit === 'oz' ? 'mm' : unit;
  const want = fromMm(mm, u);
  const p = 10 ** Math.floor(Math.log10(want));
  for (const f of [1, 2, 5, 10]) if (f * p >= want * (1 - 1e-9)) return toMm(f * p, u);
  return toMm(10 * p, u);
}

export function roundTo(v: number, step: number): number {
  return Number((Math.round(v / step) * step).toPrecision(12));
}

export type HandleKey = 'w' | 's' | 'g' | 'gw' | `t:${string}` | `sig.${number}.${'w' | 'u'}` | `gnd.${number}.${'a' | 'b'}`;

export interface HandleDef {
  key: HandleKey;
  axis: 'x' | 'z';
  u: number | null; // world x of the handle; null: at the box's left edge
  z: number; // model z
  value: number; // mm: what it edits now
  name: string;
  min: number; // the value is refused at or below this (−Infinity: none)
  from: (p: number) => number; // the value with the pointer at u (axis x) or z (axis z)
}

// The handles of a structure. General (M2.1d): each trace's width on its base's right edge (`sig.<i>.w`) and its
// centre on its top face (`sig.<i>.u`), each ground's finite edges on its base (`gnd.<i>.a`, `gnd.<i>.b`; an edge to
// the edge of the board has none and stays so).
export function traceHandles(s: Stackup, st: Structure): HandleDef[] {
  const info = KIND_INFO[st.kind];
  if (!info) return [];
  const z = stackZ(s);
  const base = (i: number) => (fillSide(s, i) === 'up' ? z[i + 1] : z[i]);
  const out: HandleDef[] = [];
  if (st.kind === 'general') {
    const sig: number[] = [];
    st.signals.forEach((g, i) => {
      const Li = layerIndex(s, g.layer);
      if (Li < 0) return;
      sig.push(Li);
      const u = g.u.v, w = g.w.v, top = fillSide(s, Li) === 'up' ? z[Li] : z[Li + 1];
      out.push({ key: `sig.${i}.w`, axis: 'x', u: u + w / 2, z: base(Li), value: w, name: `Trace ${i + 1} width`, min: 0, from: (p) => 2 * (p - u) });
      out.push({ key: `sig.${i}.u`, axis: 'x', u, z: top, value: u, name: `Trace ${i + 1} position`, min: -Infinity, from: (p) => p });
    });
    st.grounds.forEach((g, i) => {
      const Li = layerIndex(s, g.layer);
      if (Li < 0) return;
      if (g.a) out.push({ key: `gnd.${i}.a`, axis: 'x', u: g.a.v, z: base(Li), value: g.a.v, name: `Ground ${i + 1} left edge`, min: -Infinity, from: (p) => p });
      if (g.b) out.push({ key: `gnd.${i}.b`, axis: 'x', u: g.b.v, z: base(Li), value: g.b.v, name: `Ground ${i + 1} right edge`, min: -Infinity, from: (p) => p });
    });
    if (sig.length) heights(s, st, sig, z, out);
    return out;
  }
  const L = layerIndex(s, st.layer);
  if (L < 0) return [];
  const zb = base(L);
  const w = st.w.v, sv = st.s.v;
  const pair = info.signals === 2 && st.kind !== 'broadside';
  if (st.kind === 'broadside') {
    out.push({ key: 'w', axis: 'x', u: w / 2, z: zb, value: w, name: 'Width', min: 0, from: (u) => 2 * u });
    const L2 = layerIndex(s, st.layer2);
    if (L2 >= 0) out.push({ key: 's', axis: 'x', u: sv, z: base(L2), value: sv, name: 'Offset across', min: -Infinity, from: (u) => u });
  } else if (pair) {
    out.push({ key: 'w', axis: 'x', u: sv / 2 + w, z: zb, value: w, name: 'Width (each)', min: 0, from: (u) => u - sv / 2 });
    out.push({ key: 's', axis: 'x', u: sv / 2, z: zb, value: sv, name: 'Gap', min: 0, from: (u) => 2 * u });
  } else out.push({ key: 'w', axis: 'x', u: w / 2, z: zb, value: w, name: 'Width', min: 0, from: (u) => 2 * u });
  if (info.coplanar) {
    const edge = pair ? w + sv / 2 : w / 2;
    const g = st.g.v, in0 = edge + g;
    out.push({ key: 'g', axis: 'x', u: in0, z: zb, value: g, name: 'Gap to ground', min: 0, from: (u) => u - edge });
    if (st.gw) out.push({ key: 'gw', axis: 'x', u: in0 + st.gw.v, z: zb, value: st.gw.v, name: 'Ground width', min: 0, from: (u) => u - in0 });
  }
  heights(s, st, st.kind === 'broadside' ? [L, layerIndex(s, st.layer2)].filter((i) => i >= 0) : [L], z, out);
  return out;
}

// Dielectrics between the signals and their planes (or between the signal layers when they are several).
function heights(s: Stackup, st: Structure, sig: number[], z: Float64Array | number[], out: HandleDef[]): void {
  const A = st.above ? layerIndex(s, st.above) : -1, Bl = st.below ? layerIndex(s, st.below) : -1;
  const top = A >= 0 ? A : Math.min(...sig), bottom = Bl >= 0 ? Bl : Math.max(...sig);
  for (let j = top + 1; j < bottom; j++) {
    const l = s.layers[j];
    if (l.kind !== 'dielectric') continue;
    const t0 = l.t.v, face = z[j];
    out.push({ key: `t:${l.id}`, axis: 'z', u: null, z: face, value: t0, name: `Thickness of ${l.name}`, min: 0, from: (zp) => t0 + zp - face });
  }
}

const keep = (old: Val | null, v: number): Val => ({ v, tol: old ? old.tol : null, src: TYPED });

// The setup with one handle's value, or why it cannot take it (the reason the typed fields give).
export function applyHandle(x: Setup, key: HandleKey, v: number): { setup: Setup } | { reason: string } {
  if (!Number.isFinite(v)) return { reason: 'The value is not a number.' };
  if (key.startsWith('t:')) {
    const i = layerIndex(x.stackup, key.slice(2));
    if (i < 0 || x.stackup.layers[i].kind !== 'dielectric') return { reason: 'That layer is no longer in the stackup.' };
    if (!(v > 0)) return { reason: `${x.stackup.layers[i].name} must be thicker than zero.` };
    const s = cloneStackup(x.stackup);
    const l = s.layers[i] as DielectricLayer;
    l.t = keep(l.t, v);
    const bad = stackupIssues(s).find((q) => q.level === 'error') ?? structureIssues(s, x.trace).find((q) => q.level === 'error');
    return bad ? { reason: bad.message } : { setup: { ...x, stackup: s } };
  }
  const gm = /^(sig|gnd)\.(\d+)\.([wuab])$/.exec(key);
  if (gm) {
    const i = Number(gm[2]), f = gm[3] as 'w' | 'u' | 'a' | 'b';
    const t: Structure = { ...x.trace, signals: x.trace.signals.slice(), grounds: x.trace.grounds.slice() };
    if (gm[1] === 'sig') {
      const g = t.signals[i];
      if (!g || (f !== 'w' && f !== 'u')) return { reason: 'That trace is no longer in the structure.' };
      if (f === 'w' && !(v > 0)) return { reason: `Trace ${i + 1}'s width must be above zero.` };
      t.signals[i] = { ...g, [f]: keep(g[f], v) };
    } else {
      const g = t.grounds[i];
      if (!g || (f !== 'a' && f !== 'b') || !g[f]) return { reason: 'That ground edge is no longer in the structure.' };
      t.grounds[i] = { ...g, [f]: keep(g[f], v) };
    }
    const bad = structureIssues(x.stackup, t).find((q) => q.level === 'error');
    return bad ? { reason: bad.message } : { setup: { ...x, trace: t } };
  }
  const k = key as 'w' | 's' | 'g' | 'gw';
  const t: Structure = { ...x.trace, [k]: keep(x.trace[k], v) };
  const bad = structureIssues(x.stackup, t).find((q) => q.level === 'error');
  return bad ? { reason: bad.message } : { setup: { ...x, trace: t } };
}
