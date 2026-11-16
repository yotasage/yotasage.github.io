// The Trace section's drawing, framework-free (M2.1c): the world the pan-zoom controller (panZoom.ts) looks at, the
// fit that shows the whole cross-section, and the drag handles of the preset structures with the edit each one makes.
//
// World: x = u (mm across, 0 at the structure's centre), y = Y(z) down; without widening Y = −z (mm, z up from the
// stack's bottom), widened every board layer is at least MIN px tall at the fit's scale kRef (air stays linear).
// Handles: widths, gaps, the coplanar gap and ground width on the signal layer's base edges (the base is on fillSide's
// far side), a broadside pair's offset at the second trace's centre, and the thickness of every dielectric between the
// signals and their planes on its top face (thickening it moves everything above, so the face follows the pointer).

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

export interface TraceFit { rect: Rect; H: number; kRef: number }

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
  const m = worldMap(s, widen, k);
  const y0 = m.Y(zTop), y1 = m.Y(zBottom);
  return { rect: { x0: -U, x1: U, y0, y1 }, H: Math.max(Math.round((y1 - y0) * k), 60), kRef: k };
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

export type HandleKey = 'w' | 's' | 'g' | 'gw' | `t:${string}`;

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

// The handles of a preset structure (none for `general`: M2.1d).
export function traceHandles(s: Stackup, st: Structure): HandleDef[] {
  const info = KIND_INFO[st.kind];
  if (!info || st.kind === 'general') return [];
  const z = stackZ(s);
  const L = layerIndex(s, st.layer);
  if (L < 0) return [];
  const base = (i: number) => (fillSide(s, i) === 'up' ? z[i + 1] : z[i]);
  const zb = base(L);
  const w = st.w.v, sv = st.s.v;
  const out: HandleDef[] = [];
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
  // Dielectrics between the signals and their planes (or between the two signal layers of a broadside pair).
  const sig = st.kind === 'broadside' ? [L, layerIndex(s, st.layer2)].filter((i) => i >= 0) : [L];
  const A = st.above ? layerIndex(s, st.above) : -1, Bl = st.below ? layerIndex(s, st.below) : -1;
  const top = A >= 0 ? A : Math.min(...sig), bottom = Bl >= 0 ? Bl : Math.max(...sig);
  for (let j = top + 1; j < bottom; j++) {
    const l = s.layers[j];
    if (l.kind !== 'dielectric') continue;
    const t0 = l.t.v, face = z[j];
    out.push({ key: `t:${l.id}`, axis: 'z', u: null, z: face, value: t0, name: `Thickness of ${l.name}`, min: 0, from: (zp) => t0 + zp - face });
  }
  return out;
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
  const k = key as 'w' | 's' | 'g' | 'gw';
  const t: Structure = { ...x.trace, [k]: keep(x.trace[k], v) };
  const bad = structureIssues(x.stackup, t).find((q) => q.level === 'error');
  return bad ? { reason: bad.message } : { setup: { ...x, trace: t } };
}
