// The Waves section's 3D view (step M7.2b), framework-free so the harness checks it in Node: the run's structure as
// scene3d.ts's prisms, made from the full-wave run's own model (fdtd/model.ts: what the run simulated, in its frame,
// the slices' frame), and each snapshot slice's place in it as a textured cut plane. The renderer is the Via section's
// (components/EmSim/via3dRender.ts); the textures' pixels are wavesPlayer.ts's (rasterOf, framePixels), so a plane in
// 3D shows the 2D player's picture of the same frame.
//
// Frame: the model's mm, z up from the board's bottom (as scene3d.ts's stackZ). A slice's u and v are its two axes in
// order (axesOf: a side view's u across and v = z, a top view's x and y); `pointOf` puts (u, v) on the plane at `at`.

import { taperAt } from './fdtd/model';
import type { CuLayer, Model, Shape } from './fdtd/model';
import type { SliceInfo, SnapComp } from './fdtd/snapshots';
import { antipadHoles, circlePoly, PRISM_KINDS } from './scene3d';
import type { Prism, PrismKind, Scene3D } from './scene3d';
import type { Antipad, ViaStructure } from './via';
import { axesOf, focusBox, viewBox } from './wavesPlayer';
import type { PlayerView } from './wavesPlayer';

export interface Box3 { x0: number; x1: number; y0: number; y1: number; z0: number; z1: number }
export type Vec3 = [number, number, number];

/** Texels of a plane's texture at most (a side view's 3:1 plane: about 443 × 148). */
export const TEX_CAP = 65_536;
/** Its longest side at most. */
export const TEX_SIDE = 1024;
/** A sheet's thickness drawn (mm): the model's copper thinner than HMIN is a sheet on its mid-plane. */
const SHEET_T = 0.012;

/** The part of the run drawn in 3D: the structure with a margin, as the 2D player's views crop it (focusBox from
 *  above for x and y, from the side for z), inside the model's mesh. */
export function waveBox(m: Model): Box3 {
  const ex = m.extent;
  const xy = focusBox(m, 'z', { u0: ex.x[0], u1: ex.x[1], v0: ex.y[0], v1: ex.y[1] });
  const xz = focusBox(m, 'y', { u0: ex.x[0], u1: ex.x[1], v0: ex.z[0], v1: ex.z[1] });
  return { x0: xy.u0, x1: xy.u1, y0: xy.v0, y1: xy.v1, z0: xz.v0, z1: xz.v1 };
}

/** The point (u, v) of a plane with `normal` at `at`, in the model's x, y, z. */
export function pointOf(normal: 'x' | 'y' | 'z', at: number, u: number, v: number): Vec3 {
  return normal === 'z' ? [u, v, at] : normal === 'y' ? [u, at, v] : [at, u, v];
}

const AXIS: Record<'x' | 'y' | 'z', Vec3> = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };

/** A slice's cut plane: the rectangle shown in the slice's own mm (`box`), its corner (u0, v0) in 3D (`o`), the unit
 *  vectors of u and v (`U`, `V`), its size (mm) and its texture's size (texels, the plane's aspect, at most TEX_CAP). */
export interface PlanePlace {
  normal: 'x' | 'y' | 'z'; at: number;
  box: { u0: number; u1: number; v0: number; v1: number };
  o: Vec3; U: Vec3; V: Vec3; w: number; h: number;
  tw: number; th: number;
}

/** The slice's plane inside the box (null when it misses it). */
export function placeOf(info: SliceInfo, b: Box3, cap = TEX_CAP): PlanePlace | null {
  const [ua, va] = axesOf(info.normal);
  const lo = { x: b.x0, y: b.y0, z: b.z0 }, hi = { x: b.x1, y: b.y1, z: b.z1 };
  if (info.at < lo[info.normal] || info.at > hi[info.normal]) return null;
  const u0 = Math.max(info.u[0], lo[ua]), u1 = Math.min(info.u[info.nu - 1], hi[ua]);
  const v0 = Math.max(info.v[0], lo[va]), v1 = Math.min(info.v[info.nv - 1], hi[va]);
  if (!(u1 > u0) || !(v1 > v0)) return null;
  const w = u1 - u0, h = v1 - v0;
  const { tw, th } = texSize(w, h, cap);
  return { normal: info.normal, at: info.at, box: { u0, u1, v0, v1 }, o: pointOf(info.normal, info.at, u0, v0), U: AXIS[ua], V: AXIS[va], w, h, tw, th };
}

/** A texture of a w × h mm plane: its aspect, at most `cap` texels and TEX_SIDE a side. */
export function texSize(w: number, h: number, cap = TEX_CAP): { tw: number; th: number } {
  const a = w / h;
  let th = Math.sqrt(cap / a), tw = a * th;
  const k = Math.min(1, TEX_SIDE / tw, TEX_SIDE / th);
  tw *= k; th *= k;
  return { tw: Math.max(1, Math.floor(tw)), th: Math.max(1, Math.floor(th)) };
}

/** The slice's (u, v) of a texel's centre (i across from u0, j up from v0: the texture's rows bottom up), as rasterOf
 *  samples its pixel (column i, row th − 1 − j from the top). */
export function texelUv(p: PlanePlace, i: number, j: number): [number, number] {
  return [p.box.u0 + ((i + 0.5) / p.tw) * p.w, p.box.v0 + ((j + 0.5) / p.th) * p.h];
}

// ---------------------------------------------------------------- the structure

const rectPoly = (x0: number, y0: number, x1: number, y1: number, cw = false): number[] =>
  cw ? [x0, y0, x0, y1, x1, y1, x1, y0] : [x0, y0, x1, y0, x1, y1, x0, y1];

/** A plane's openings as clockwise holes: a pair's two round antipads with their bridge or oblong slot as one outline
 *  where they meet (scene3d.ts antipadHoles, as the Via section draws them), any other opening on its own. */
export function openingHoles(ops: readonly Shape[], b: Box3): number[][] {
  const disks = ops.filter((o): o is Extract<Shape, { k: 'disk' }> => o.k === 'disk');
  const rects = ops.filter((o): o is Extract<Shape, { k: 'rect' }> => o.k === 'rect');
  const out: number[][] = [];
  const [a, c] = disks;
  if (disks.length === 2 && rects.length <= 1 && Math.abs(a.x - c.x) < 1e-9 && Math.abs(a.r1 - c.r1) < 1e-9 && c.y !== a.y) {
    const [p, q] = a.y < c.y ? [a, c] : [c, a];
    const bridge = rects[0] ? rects[0].x1 - rects[0].x0 : 0;
    const ap = { d: { v: 2 * p.r1 }, shape: 'joined', bridge: { v: bridge } } as unknown as Antipad;
    for (const h of antipadHoles(ap, { pitch: { v: q.y - p.y } } as unknown as ViaStructure)) {
      const m = h.slice();
      for (let k = 0; k < m.length; k += 2) { m[k] += p.x; m[k + 1] += p.y; }
      out.push(m);
    }
  } else {
    for (const o of disks) out.push(circlePoly(o.x, o.y, o.r1, true));
    for (const r of rects) {
      const x0 = Math.max(r.x0, b.x0), x1 = Math.min(r.x1, b.x1), y0 = Math.max(r.y0, b.y0), y1 = Math.min(r.y1, b.y1);
      if (x1 > x0 && y1 > y0) out.push(rectPoly(x0, y0, x1, y1, true));
    }
  }
  return out;
}

/** A copper layer's z span drawn: its faces, or a thin slab on a sheet's plane. */
export function copperZ(c: CuLayer): [number, number] {
  return c.zt - c.zb >= SHEET_T ? [c.zb, c.zt] : c.sheet ? [c.z - SHEET_T / 2, c.z + SHEET_T / 2] : [c.zb, c.zb + SHEET_T];
}

/** The run's structure as scene3d.ts's prisms inside the box: each plane a slab with its openings, the copper added to
 *  a layer (feeds: rects at their mid-height width; pads, return pads: annuli), barrels and return vias (cylinders of
 *  the drill), the laminate (slabs with the barrels' holes) and the backdrilled holes; `u` along the first port's
 *  feed (the side view's line). */
export function modelScene(m: Model, b: Box3): Scene3D {
  const counts = Object.fromEntries(PRISM_KINDS.map((k) => [k, 0])) as Record<PrismKind, number>;
  const box = { x0: b.x0, x1: b.x1, y0: b.y0, y1: b.y1 };
  const p0 = m.ports[0];
  const u = p0 && p0.axis === 'y' ? { x: 0, y: 1 } : { x: 1, y: 0 };
  const bars = m.cyl.filter((c) => !c.name.startsWith('return'));
  const centre = bars.length
    ? { x: bars.reduce((s, c) => s + c.x, 0) / bars.length, y: bars.reduce((s, c) => s + c.y, 0) / bars.length }
    : { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 };
  const sc: Scene3D = { ok: m.thick > 0, thick: m.thick, box, centre, u, prisms: [], drilled: [], topZ: m.thick / 2, counts };
  const add = (p: Prism) => { if (p.z1 > p.z0) { sc.prisms.push(p); counts[p.kind] += 1; } };
  const zc = (z: number) => Math.min(b.z1, Math.max(b.z0, z));
  const inside = (x: number, y: number, r: number) => x - r >= b.x0 && x + r <= b.x1 && y - r >= b.y0 && y + r <= b.y1;
  const square = rectPoly(b.x0, b.y0, b.x1, b.y1);
  // laminate
  for (const d of m.dielectric) {
    const z0 = zc(d.z0), z1 = zc(d.z1);
    const holes = m.cyl.filter((c) => c.z0 < z1 && c.z1 > z0 && inside(c.x, c.y, c.r)).map((c) => circlePoly(c.x, c.y, c.r, true));
    const l = m.stackup.layers.find((x) => x.id === d.id) as { role?: string } | undefined;
    add({ kind: 'dielectric', layer: d.id, name: '', z0, z1, outer: square, holes, er: d.er, role: l?.role === 'prepreg' ? 'prepreg' : 'core' });
  }
  // copper
  for (const c of m.cu) {
    const [z0, z1] = copperZ(c);
    if (z1 < b.z0 || z0 > b.z1) continue;
    if (c.plane) add({ kind: 'plane', layer: c.id, name: '', z0, z1, outer: square, holes: openingHoles(c.openings, b), er: NaN, role: '' });
    const zm = (z0 + z1) / 2;
    for (const s of c.shapes) {
      if (s.k === 'rect') {
        const d = taperAt(s.tx, zm);
        const x0 = Math.max(s.x0 - d, b.x0), x1 = Math.min(s.x1 + d, b.x1), y0 = Math.max(s.y0, b.y0), y1 = Math.min(s.y1, b.y1);
        if (x1 > x0 && y1 > y0) add({ kind: 'feed', layer: c.id, name: '', z0, z1, outer: rectPoly(x0, y0, x1, y1), holes: [], er: NaN, role: '' });
      } else if (inside(s.x, s.y, s.r1) && s.r1 > s.r0) {
        const ret = m.cyl.some((y) => y.name.startsWith('return') && Math.hypot(y.x - s.x, y.y - s.y) < 1e-9);
        add({ kind: ret ? 'return-pad' : 'pad', layer: c.id, name: '', z0, z1, outer: circlePoly(s.x, s.y, s.r1), holes: s.r0 > 0 ? [circlePoly(s.x, s.y, s.r0, true)] : [], er: NaN, role: '', ring: { x: s.x, y: s.y, r0: s.r0, r1: s.r1 } });
      }
    }
  }
  // barrels and return vias (the model's are solid cylinders of the drill)
  for (const c of m.cyl) {
    if (!inside(c.x, c.y, c.r)) continue;
    const ret = c.name.startsWith('return');
    add({ kind: ret ? 'return' : 'barrel', layer: '', name: ret ? c.name.slice(7) : c.name, z0: zc(c.z0), z1: zc(c.z1), outer: circlePoly(c.x, c.y, c.r), holes: [], er: NaN, role: '', ring: { x: c.x, y: c.y, r0: 0, r1: c.r } });
  }
  for (const d of m.drilled) if (inside(d.x, d.y, d.r)) sc.drilled.push({ x: d.x, y: d.y, r: d.r, z0: zc(d.z0), z1: zc(d.z1) });
  return sc;
}

/** A player view's plane (all its components' slices: an edge component's samples lie half a cell inside the
 *  nodes'), so its place and texture stay when the component or the drive changes. */
export function viewPlace(infos: readonly SliceInfo[], v: PlayerView, b: Box3, cap = TEX_CAP): PlanePlace | null {
  const e = viewBox(infos, v);
  const s = infos[v.slices[0]];
  return placeOf({ ...s, nu: 2, nv: 2, u: Float32Array.of(e.u0, e.u1), v: Float32Array.of(e.v0, e.v1) }, b, cap);
}

/** The component a plane shows: the player's own where the plane has it, else the plane's first (a top view shows Ez
 *  while the side view shows |E|). */
export function planeComp(v: PlayerView, comp: SnapComp): number {
  const k = v.comps.indexOf(comp);
  return k >= 0 ? k : 0;
}

/** The player's views as 3D planes: views of one name and normal are one plane (a trace's Ez from above lies on an
 *  edge's middle, its |E| on the nodes 11 µm away: two views in the player, one plane here, at the first's height). */
export function planeViews(views: readonly PlayerView[]): PlayerView[] {
  const out: PlayerView[] = [];
  for (const v of views) {
    const g = out.find((o) => o.view === v.view && o.normal === v.normal);
    if (!g) { out.push({ ...v, slices: [...v.slices], comps: [...v.comps], src: v.src.map((s) => [...s]) }); continue; }
    g.slices.push(...v.slices);
    v.comps.forEach((c, k) => { if (!g.comps.includes(c)) { g.comps.push(c); g.src.push([...v.src[k]]); } });
  }
  return out;
}
