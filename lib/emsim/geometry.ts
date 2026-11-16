// The cross-section of a trace structure as polygons tagged with their material (engine.md §3), in the (u, z) frame
// of engine.md §1 (mm, z up from the bottom of the stack). What the 2D solver (M1.2) and the drawings read.
//
// Contract:
// - Every polygon is simple and counter-clockwise, a flat [u0, z0, u1, z1, …] Float64Array. Conductors (signals
//   1…n, grounds 0) and regions (dielectric, mask, air) tile the box [−ext, ext] × [zLo, zHi] without overlap.
// - At |u| = ext every boundary is horizontal: a polygon flagged OPEN_L / OPEN_R continues unchanged to infinity (the
//   solver's rays, solver.md §2.4); OPEN_UP / OPEN_DOWN mark the air above and below. With side walls, ext is the
//   wall and nothing is open sideways.
// - Reference planes are not polygons: zLo / zHi are their faces (planeBelow / planeAbove), and the layers beyond them
//   are left out (solver.md §2.2).
// - Copper is a trapezoid: its base on the side it was etched from (stackup.ts `fillSide`), the narrow top towards
//   the fill; the gaps of an inner copper layer are filled with the adjacent dielectric on that side (same material
//   index, so the solver drops the interface).
// - Solder mask (outer layers, when the stackup has one and the structure is masked): on laminate `onLaminate` thick,
//   in the gap between two features of the layer `between`, over copper `onCopper`, and on the copper's side walls
//   `onCopper` measured across (u) from the side: the mask's outer surface is the upper envelope of these, so coats
//   that meet in a narrow gap merge (the convention of engine.md §3, notes-M1.1.md).

import { etchOffset, fillSide, stackZ } from './stackup';
import type { CopperLayer, DielectricLayer, MaskLayer, Stackup } from './stackup';
import { arrangement } from './structure';
import type { Arrangement, Feature, Structure } from './structure';

export const OPEN_L = 1;
export const OPEN_R = 2;
export const OPEN_UP = 4;
export const OPEN_DOWN = 8;

export interface Material {
  kind: 'air' | 'dielectric' | 'mask';
  layer: number; // stackup index (−1 for air)
  er: number;
  tand: number | null; // null: not stated
}

export interface Conductor { id: number; layer: number; pts: Float64Array; open: number }
export interface Region { mat: number; pts: Float64Array; open: number }

// The outer surface of one side of the board (the mask's outside, or laminate and copper when unmasked), left to
// right, with the laminate level z0 it stands on.
export interface Skin { side: 'top' | 'bottom'; layer: number; z0: number; surface: Float64Array; masked: boolean }

export interface Section {
  ext: number;
  zLo: number;
  zHi: number;
  planeBelow: number | null; // z of the plane's face towards the signals
  planeAbove: number | null;
  wall: number; // 0: none; else ideal side walls at ±wall
  signals: number;
  materials: Material[]; // [0] is air
  conductors: Conductor[];
  regions: Region[];
  skins: Skin[];
}

// The drawn margin beyond the outermost copper: five section heights, at least 0.5 mm.
export const MARGIN_HEIGHTS = 5;
export const MARGIN_MIN = 0.5;

export function section(s: Stackup, st: Structure): Section {
  return sectionOf(s, arrangement(s, st));
}

// --- Envelope of piecewise-linear pieces (segments ua < ub) ---

class Pieces {
  ua: number[] = [];
  za: number[] = [];
  ub: number[] = [];
  zb: number[] = [];
  add(ua: number, za: number, ub: number, zb: number): void {
    if (!(ub - ua > 1e-15)) return; // vertical or empty: the envelope's jump covers it
    this.ua.push(ua); this.za.push(za); this.ub.push(ub); this.zb.push(zb);
  }
  at(k: number, u: number): number {
    return this.za[k] + ((this.zb[k] - this.za[k]) * (u - this.ua[k])) / (this.ub[k] - this.ua[k]);
  }
  // The upper envelope on [lo, hi] as points left to right, a vertical jump as two points at one u.
  envelope(lo: number, hi: number): number[] {
    const n = this.ua.length;
    const cand: number[] = [lo, hi];
    for (let k = 0; k < n; k += 1) {
      cand.push(this.ua[k], this.ub[k]);
      for (let m = k + 1; m < n; m += 1) {
        const a = Math.max(this.ua[k], this.ua[m]);
        const b = Math.min(this.ub[k], this.ub[m]);
        if (!(b > a)) continue;
        const da = this.at(k, a) - this.at(m, a);
        const db = this.at(k, b) - this.at(m, b);
        if ((da < 0 && db > 0) || (da > 0 && db < 0)) cand.push(a + ((b - a) * da) / (da - db));
      }
    }
    cand.sort((x, y) => x - y);
    const out: number[] = [];
    let prev = NaN;
    for (const u of cand) {
      if (u < lo || u > hi || u === prev) continue;
      prev = u;
      let left = -Infinity;
      let right = -Infinity;
      for (let k = 0; k < n; k += 1) {
        if (this.ua[k] < u && u <= this.ub[k]) left = Math.max(left, this.at(k, u));
        if (this.ua[k] <= u && u < this.ub[k]) right = Math.max(right, this.at(k, u));
      }
      if (left > -Infinity) push(out, u, left);
      if (right > -Infinity && right !== left) push(out, u, right);
    }
    return out;
  }
}

// Appends (u, z), dropping a point that lies on the line through the two before it.
function push(out: number[], u: number, z: number): void {
  const n = out.length;
  if (n >= 2 && out[n - 2] === u && out[n - 1] === z) return;
  if (n >= 4) {
    const u0 = out[n - 4], z0 = out[n - 3], u1 = out[n - 2], z1 = out[n - 1];
    const cross = (u1 - u0) * (z - z0) - (z1 - z0) * (u - u0);
    const scale = Math.abs(u - u0) + Math.abs(z - z0);
    if (Math.abs(cross) <= 1e-14 * scale * scale && (u1 - u0) * (u - u1) + (z1 - z0) * (z - z1) >= 0) {
      out[n - 2] = u; out[n - 1] = z;
      return;
    }
  }
  out.push(u, z);
}

// A copper feature in a skin's local frame (h up from the laminate): bottom edge p0…p1 at h = 0, top q0…q1 at h = t.
interface Local { p0: number; p1: number; q0: number; q1: number; openL: boolean; openR: boolean }

export function sectionOf(s: Stackup, arr: Arrangement): Section {
  const L = s.layers;
  const n = L.length;
  const z = stackZ(s);
  const iTop = arr.above >= 0 ? arr.above + 1 : 0;
  const iBot = arr.below >= 0 ? arr.below - 1 : n - 1;
  const planeAbove = arr.above >= 0 ? z[arr.above + 1] : null;
  const planeBelow = arr.below >= 0 ? z[arr.below] : null;
  // Extent: the finite edges of the copper plus the margin.
  let umax = 0;
  for (const f of arr.features) {
    if (Number.isFinite(f.a)) umax = Math.max(umax, Math.abs(f.a));
    if (Number.isFinite(f.b)) umax = Math.max(umax, Math.abs(f.b));
  }
  const height = (planeAbove ?? z[iTop]) - (planeBelow ?? z[iBot + 1]);
  const wall = arr.wall > 0 ? arr.wall : 0;
  const ext = wall || umax + Math.max(MARGIN_HEIGHTS * height, MARGIN_MIN);
  const side = wall ? 0 : OPEN_L | OPEN_R;

  const materials: Material[] = [{ kind: 'air', layer: -1, er: 1, tand: 0 }];
  const matOf = new Map<number, number>();
  const mat = (i: number): number => {
    let m = matOf.get(i);
    if (m === undefined) {
      const l = L[i] as DielectricLayer | MaskLayer;
      m = materials.length;
      materials.push({ kind: l.kind === 'mask' ? 'mask' : 'dielectric', layer: i, er: l.er.v, tand: l.tand ? l.tand.v : null });
      matOf.set(i, m);
    }
    return m;
  };

  // Features per layer, clipped to the box and sorted.
  const byLayer = new Map<number, Feature[]>();
  for (const f of arr.features) {
    const list = byLayer.get(f.layer) ?? [];
    list.push(f);
    byLayer.set(f.layer, list);
  }
  for (const list of byLayer.values()) list.sort((p, q) => p.a - q.a);

  const conductors: Conductor[] = [];
  const regions: Region[] = [];
  const skins: Skin[] = [];
  let zLo = planeBelow ?? 0;
  let zHi = planeAbove ?? 0;

  for (let i = iTop; i <= iBot; i += 1) {
    const l = L[i];
    const zt = z[i];
    const zb = z[i + 1];
    if (l.kind === 'dielectric') {
      regions.push({ mat: mat(i), pts: rect(-ext, zb, ext, zt), open: side });
      continue;
    }
    if (l.kind !== 'copper') continue;
    const feats = byLayer.get(i) ?? [];
    const t = zt - zb;
    const e = etchOffset(l as CopperLayer);
    const up = fillSide(s, i) === 'up';
    // Local outlines: bottom edge at zb, top at zt, whichever is the base.
    const loc: Local[] = feats.map((f) => {
      const openL = !(f.a > -ext);
      const openR = !(f.b < ext);
      const a = openL ? -ext : f.a;
      const b = openR ? ext : f.b;
      const na = openL ? a : a + e; // narrow side
      const nb = openR ? b : b - e;
      return up ? { p0: a, p1: b, q0: na, q1: nb, openL, openR } : { p0: na, p1: nb, q0: a, q1: b, openL, openR };
    });
    feats.forEach((f, k) => {
      const o = loc[k];
      conductors.push({
        id: f.id, layer: i, open: (o.openL && !wall ? OPEN_L : 0) | (o.openR && !wall ? OPEN_R : 0),
        pts: new Float64Array([o.p0, zb, o.p1, zb, o.q1, zt, o.q0, zt]),
      });
    });
    const upN = i > 0 && L[i - 1].kind === 'dielectric';
    const dnN = i < n - 1 && L[i + 1].kind === 'dielectric';
    if (upN && dnN) {
      // Inner copper: the gaps are filled by the dielectric on the fill side.
      const m = mat(up ? i - 1 : i + 1);
      let lowL = -ext; // left side of the current gap at zb and at zt
      let highL = -ext;
      let openLeft = true;
      let closed = false;
      for (const o of loc) {
        if (!o.openL) regions.push({ mat: m, pts: dedupe(new Float64Array([lowL, zb, o.p0, zb, o.q0, zt, highL, zt])), open: openLeft ? side & OPEN_L : 0 });
        lowL = o.p1; highL = o.q1; openLeft = false;
        if (o.openR) { closed = true; break; }
      }
      if (!closed) regions.push({ mat: m, pts: dedupe(new Float64Array([lowL, zb, ext, zb, ext, zt, highL, zt])), open: openLeft ? side : side & OPEN_R });
      continue;
    }
    // Outer copper: the skin (mask and air) on the open side.
    const top = !upN;
    const maskIdx = top ? (i > 0 && L[i - 1].kind === 'mask' ? i - 1 : -1) : (i < n - 1 && L[i + 1].kind === 'mask' ? i + 1 : -1);
    const mask = maskIdx >= 0 && arr.masked ? (L[maskIdx] as MaskLayer) : null;
    // Local frame: h up and away from the laminate; u kept. For the bottom side h = −(z − zt) and the trapezoid flips.
    const z0 = top ? zb : zt;
    const sgn = top ? 1 : -1;
    const lf: Local[] = loc.map((o) => (top ? o : { p0: o.q0, p1: o.q1, q0: o.p0, q1: o.p1, openL: o.openL, openR: o.openR }));
    // Lower chain: laminate and copper outlines, left to right.
    const lower: number[] = [];
    if (!(lf.length && lf[0].openL)) lower.push(-ext, 0);
    for (const o of lf) {
      if (o.openL) lower.push(-ext, t); else lower.push(o.p0, 0, o.q0, t);
      if (o.openR) lower.push(ext, t); else lower.push(o.q1, t, o.p1, 0);
    }
    if (!(lf.length && lf[lf.length - 1].openR)) lower.push(ext, 0);
    let surface: number[];
    if (mask) {
      const c1 = mask.onLaminate.v;
      const c2 = mask.onCopper.v;
      const c3 = mask.between.v;
      const P = new Pieces();
      if (lf.length === 0) P.add(-ext, c1, ext, c1);
      lf.forEach((o, k) => {
        if (k === 0 && !o.openL) P.add(-ext, c1, o.p0, c1);
        if (k > 0) P.add(lf[k - 1].p1, c3, o.p0, c3);
        if (k === lf.length - 1 && !o.openR) P.add(o.p1, c1, ext, c1);
        const uTL = o.openL ? -ext : o.q0 - c2 + ((o.q0 - o.p0) * c2) / t;
        const uTR = o.openR ? ext : o.q1 + c2 + ((o.q1 - o.p1) * c2) / t;
        if (!o.openL) P.add(o.p0 - c2, 0, uTL, t + c2);
        P.add(uTL, t + c2, uTR, t + c2);
        if (!o.openR) P.add(uTR, t + c2, o.p1 + c2, 0);
      });
      surface = P.envelope(-ext, ext);
      // The mask: lower chain left to right, then the surface right to left.
      const poly = [...lower];
      for (let k = surface.length - 2; k >= 0; k -= 2) poly.push(surface[k], surface[k + 1]);
      regions.push({ mat: mat(maskIdx), pts: place(poly, z0, sgn), open: side });
    } else surface = lower;
    // Air: the surface left to right, then the far top.
    let hmax = 0;
    for (let k = 1; k < surface.length; k += 2) hmax = Math.max(hmax, surface[k]);
    const far = hmax + ext;
    const air = [...surface, ext, far, -ext, far];
    regions.push({ mat: 0, pts: place(air, z0, sgn), open: side | (top ? OPEN_UP : OPEN_DOWN) });
    if (top) zHi = z0 + far; else zLo = z0 - far;
    const surf = new Float64Array(surface.length);
    for (let k = 0; k < surface.length; k += 2) { surf[k] = surface[k]; surf[k + 1] = z0 + sgn * surface[k + 1]; }
    skins.push({ side: top ? 'top' : 'bottom', layer: i, z0, surface: surf, masked: !!mask });
  }
  return { ext, zLo, zHi, planeBelow, planeAbove, wall, signals: arr.signals, materials, conductors, regions, skins };
}

function rect(u0: number, z0: number, u1: number, z1: number): Float64Array {
  return new Float64Array([u0, z0, u1, z0, u1, z1, u0, z1]);
}

// Local (u, h) to (u, z0 + sgn·h); a mirrored polygon is reversed to stay counter-clockwise. Repeated points dropped.
function place(local: number[], z0: number, sgn: number): Float64Array {
  const m = local.length / 2;
  const out: number[] = [];
  for (let k = 0; k < m; k += 1) {
    const j = sgn > 0 ? k : m - 1 - k;
    const u = local[2 * j];
    const zz = z0 + sgn * local[2 * j + 1];
    const c = out.length;
    if (c >= 2 && out[c - 2] === u && out[c - 1] === zz) continue;
    out.push(u, zz);
  }
  if (out.length >= 4 && out[0] === out[out.length - 2] && out[1] === out[out.length - 1]) out.length -= 2;
  return new Float64Array(out);
}

function dedupe(p: Float64Array): Float64Array {
  const out: number[] = [];
  for (let k = 0; k < p.length; k += 2) {
    const c = out.length;
    if (c >= 2 && out[c - 2] === p[k] && out[c - 1] === p[k + 1]) continue;
    out.push(p[k], p[k + 1]);
  }
  if (out.length >= 4 && out[0] === out[out.length - 2] && out[1] === out[out.length - 1]) out.length -= 2;
  return out.length === p.length ? p : new Float64Array(out);
}

// Signed area (positive: counter-clockwise).
export function polygonArea(p: Float64Array): number {
  let a = 0;
  const n = p.length;
  for (let k = 0; k < n; k += 2) {
    const j = (k + 2) % n;
    a += p[k] * p[j + 1] - p[j] * p[k + 1];
  }
  return a / 2;
}
