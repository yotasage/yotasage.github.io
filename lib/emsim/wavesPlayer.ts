// The Waves section's player (step M7.1b), framework-free so the harness checks it in Node: the snapshot slices grouped
// into views (a plane with the components taken on it), the fixed colour scale of a slice over the whole run, a frame
// turned into the pixels of a picture to scale (bilinear on the run's graded mesh), the structure's outline in the
// slice (copper cut by it, the copper beside it, the ports), the axes' ticks in the page's unit and the playback clock.
//
// Values: E in V/m for the run's source, a Gaussian pulse of 1 V peak behind each port's resistor (fdtd/ports.ts); the
// frames hold f·E on conformal edges (snapshots.ts). The colour maps are colormap.ts's: sequential for |E|, diverging
// with zero in the middle for a signed component.

import { mapTable, niceTicks } from './colormap';
import type { MapName, Scale } from './colormap';
import { inLayer } from './fdtd/model';
import type { CuLayer, Model, Shape } from './fdtd/model';
import type { Frame, SliceInfo, SnapComp } from './fdtd/snapshots';
import type { SnapView } from './fullwave';
import { fromMm, toMm } from './units';
import type { LengthUnit } from './units';

export const COMP_TEXT: Readonly<Record<SnapComp, string>> = { E: '|E|', Ex: 'Ex', Ey: 'Ey', Ez: 'Ez' };
export const VIEW_TEXT: Readonly<Record<SnapView, string>> = {
  side: 'From the side', entry: 'At the entry feed', cavity: 'Between the planes', exit: 'At the exit feed',
  above: 'From above', along: 'Along the trace', across: 'Across the trace',
};
/** Frames per second at 1× (about 10 s for a run's 300 frames). */
export const FPS_1X = 30;
export const SPEEDS: readonly number[] = [0.25, 0.5, 1, 2];
/** The top of the fixed scale: this share of all values of all frames lies under it (the rest, at copper edges where
 *  the field is singular, is drawn in the top colour). */
export const PLAY_CLIP = 0.999;
/** The largest picture computed per frame (pixels); a larger canvas gets it scaled with smoothing. */
export const RASTER_CAP = 200_000;

// ---------------------------------------------------------------- views

export interface PlayerView { view: SnapView; normal: 'x' | 'y' | 'z'; at: number; slices: number[]; comps: SnapComp[] }

/** The slices grouped by their plane (one view per plane, its components in the order taken). */
export function playerViews(infos: readonly SliceInfo[], views: readonly SnapView[]): PlayerView[] {
  const out: PlayerView[] = [];
  infos.forEach((s, i) => {
    const v = views[i] ?? (s.normal === 'z' ? 'above' : 'side');
    let g = out.find((o) => o.view === v && o.normal === s.normal && Math.abs(o.at - s.at) < 1e-6);
    if (!g) { g = { view: v, normal: s.normal, at: s.at, slices: [], comps: [] }; out.push(g); }
    g.slices.push(i); g.comps.push(s.comp);
  });
  return out;
}

/** A view's extent: every slice of it (an edge component's samples lie half a cell inside the nodes'). */
export function viewBox(infos: readonly SliceInfo[], v: PlayerView): { u0: number; u1: number; v0: number; v1: number } {
  const ss = v.slices.map((i) => infos[i]);
  return {
    u0: Math.min(...ss.map((s) => s.u[0])), u1: Math.max(...ss.map((s) => s.u[s.nu - 1])),
    v0: Math.min(...ss.map((s) => s.v[0])), v1: Math.max(...ss.map((s) => s.v[s.nv - 1])),
  };
}

/** The part of a view worth showing: the structure (ports, barrels, return vias, openings; a side view's board) with
 *  a margin, inside the slice's extent. The rest of the mesh (out to the CPML) holds feeds' ends and quiet field. */
export function focusBox(m: Model, normal: 'x' | 'y' | 'z', ext: { u0: number; u1: number; v0: number; v1: number }): { u0: number; u1: number; v0: number; v1: number } {
  const xs: number[] = [], ys: number[] = [];
  const pt = (x: number, y: number) => { xs.push(x); ys.push(y); };
  for (const p of m.ports) for (const a of p.across) { if (p.axis === 'x') pt(p.pos, a); else pt(a, p.pos); }
  for (const c of m.cyl) { pt(c.x - c.r, c.y - c.r); pt(c.x + c.r, c.y + c.r); }
  for (const c of m.cu) for (const o of c.openings) {
    if (o.k === 'disk') { pt(o.x - o.r1, o.y - o.r1); pt(o.x + o.r1, o.y + o.r1); } else { pt(o.x0, o.y0); pt(o.x1, o.y1); }
  }
  if (!xs.length) return ext;
  const span = (a: number[]) => [Math.min(...a), Math.max(...a)];
  const pad = ([a, b]: number[], min: number) => { const g = Math.max(min, 0.12 * (b - a)); return [a - g, b + g]; };
  const [x0, x1] = pad(span(xs), 0.4), [y0, y1] = pad(span(ys), 0.4), [z0, z1] = pad([0, m.thick], 0.25);
  const [a0, a1, b0, b1] = normal === 'z' ? [x0, x1, y0, y1] : normal === 'y' ? [x0, x1, z0, z1] : [y0, y1, z0, z1];
  const cut = (lo: number, hi: number, e0: number, e1: number) => (Math.min(hi, e1) - Math.max(lo, e0) > 0.1 * (e1 - e0) ? [Math.max(lo, e0), Math.min(hi, e1)] : [e0, e1]);
  const [u0, u1] = cut(a0, a1, ext.u0, ext.u1), [v0, v1] = cut(b0, b1, ext.v0, ext.v1);
  return { u0, u1, v0, v1 };
}

/** The slice's axes: u across, v up the picture (a side view's v is z, a top view's y). */
export function axesOf(normal: 'x' | 'y' | 'z'): ['x' | 'y' | 'z', 'x' | 'y' | 'z'] {
  return normal === 'x' ? ['y', 'z'] : normal === 'y' ? ['x', 'z'] : ['x', 'y'];
}

// ---------------------------------------------------------------- the fixed scale

export interface PlayScale {
  signed: boolean;
  top: number; // V/m: the scale runs 0 … top (|E|) or −top … top
  max: number; // the run's largest |value| on the slice (SnapRecorder.max)
  clipped: number; // the share of values above top
  scale: Scale; // colormap.ts's, for the bar
}

const BINS = 4096;

/** The slice's scale over all frames: the PLAY_CLIP quantile of |value| (values of every frame and sample), from a
 *  histogram on 0 … max. One scale for the whole run, so a frame's colours compare with every other frame's. */
export function playScale(frames: readonly Frame[], s: number, comp: SnapComp, max: number, clip = PLAY_CLIP): PlayScale {
  const signed = comp !== 'E';
  const hist = new Float64Array(BINS + 1);
  let n = 0;
  const m = max > 0 ? max : 1;
  for (const f of frames) {
    const d = f.data[s], k = (f.scale[s] / m) * BINS;
    // per quantised level: the bin of |q|·scale (127 or 255 levels), counted once per sample
    const lv = new Float64Array(256);
    if (signed) for (let q = 0; q < d.length; q++) { const x = d[q]; lv[x < 0 ? -x : x]++; }
    else for (let q = 0; q < d.length; q++) lv[d[q]]++;
    for (let a = 0; a < 256; a++) if (lv[a]) hist[Math.min(BINS, Math.floor(a * k))] += lv[a];
    n += d.length;
  }
  let top = m;
  if (n > 0) {
    const want = clip * n;
    let acc = 0;
    for (let b = 0; b <= BINS; b++) { acc += hist[b]; if (acc >= want) { top = Math.min(m, ((b + 1) / BINS) * m); break; } }
  }
  let above = 0;
  const tb = Math.floor((top / m) * BINS);
  for (let b = tb + 1; b <= BINS; b++) above += hist[b];
  if (!(top > 0)) top = 1;
  const scale: Scale = signed
    ? { kind: 'signed', map: 'diverging', lo: -top, hi: top, ticks: niceTicks(-top, top, 4) }
    : { kind: 'linear', map: 'sequential', lo: 0, hi: top, ticks: niceTicks(0, top) };
  return { signed, top, max, clipped: n ? above / n : 0, scale };
}

// ---------------------------------------------------------------- pixels

export interface Raster {
  w: number; h: number; nu: number;
  u0: number; u1: number; v0: number; v1: number; // mm shown: u0 at the left edge, v1 at the top
  c0: Int32Array; c1: Int32Array; cw: Float32Array; // per column: the samples left and right, the right one's weight
  r0: Int32Array; r1: Int32Array; rw: Float32Array; // per row (row 0 at the top): the sample rows' offsets (·nu), weight
}

function weights(g: Float32Array, n: number, a: number, b: number, mul: number, flip: boolean): { i0: Int32Array; i1: Int32Array; w: Float32Array } {
  const i0 = new Int32Array(n), i1 = new Int32Array(n), w = new Float32Array(n);
  const m = g.length;
  let k = 0;
  for (let p = 0; p < n; p++) {
    const t = (p + 0.5) / n, x = flip ? b - t * (b - a) : a + t * (b - a);
    if (m === 1 || x <= g[0]) { i0[p] = 0; i1[p] = 0; w[p] = 0; continue; }
    if (x >= g[m - 1]) { i0[p] = (m - 1) * mul; i1[p] = (m - 1) * mul; w[p] = 0; continue; }
    // monotone in p (either way): walk k
    if (x < g[k]) k = 0;
    while (k + 1 < m - 1 && g[k + 1] <= x) k++;
    i0[p] = k * mul; i1[p] = (k + 1) * mul; w[p] = (x - g[k]) / (g[k + 1] - g[k]);
  }
  return { i0, i1, w };
}

/** The mapping of a w × h picture of the slice (its whole extent unless `box`) to its samples. */
export function rasterOf(info: SliceInfo, w: number, h: number, box?: { u0: number; u1: number; v0: number; v1: number }): Raster {
  const b = box ?? { u0: info.u[0], u1: info.u[info.nu - 1], v0: info.v[0], v1: info.v[info.nv - 1] };
  const c = weights(info.u, w, b.u0, b.u1, 1, false), r = weights(info.v, h, b.v0, b.v1, info.nu, true);
  return { w, h, nu: info.nu, ...b, c0: c.i0, c1: c.i1, cw: c.w, r0: r.i0, r1: r.i1, rw: r.w };
}

/** The raster's size for a canvas of cw × ch device pixels: the same, or smaller to RASTER_CAP pixels. */
export function rasterSize(cw: number, ch: number, cap = RASTER_CAP): { w: number; h: number } {
  const s = Math.min(1, Math.sqrt(cap / Math.max(1, cw * ch)));
  return { w: Math.max(1, Math.round(cw * s)), h: Math.max(1, Math.round(ch * s)) };
}

const PALETTES: Partial<Record<MapName, Uint32Array>> = {};
/** A colour map as 256 RGBA words in memory order R, G, B, A (little-endian packing, as every browser runs). */
export function palette(map: MapName): Uint32Array {
  let p = PALETTES[map];
  if (!p) {
    const t = mapTable(map);
    p = new Uint32Array(256);
    for (let i = 0; i < 256; i++) p[i] = (255 << 24) | (t[3 * i + 2] << 16) | (t[3 * i + 1] << 8) | t[3 * i];
    PALETTES[map] = p;
  }
  return p;
}

/** A frame of slice `s` as pixels on the fixed scale: bilinear in the quantised values, then the table index as
 *  colormap.ts's indexOf (floor of 256·t, clamped). `out` is the picture's RGBA as words (w·h). */
export function framePixels(r: Raster, data: Int8Array | Uint8Array, frameScale: number, ps: PlayScale, out: Uint32Array): void {
  const pal = palette(ps.scale.map);
  const span = ps.scale.hi - ps.scale.lo;
  const A = (frameScale * 256) / span, B = (-ps.scale.lo * 256) / span;
  const { w, h, c0, c1, cw, r0, r1, rw } = r;
  let o = 0;
  for (let j = 0; j < h; j++) {
    const a = r0[j], b = r1[j], wv = rw[j];
    for (let i = 0; i < w; i++) {
      const p0 = c0[i], p1 = c1[i], wu = cw[i];
      const q00 = data[a + p0], q01 = data[a + p1], q10 = data[b + p0], q11 = data[b + p1];
      const top = q00 + (q01 - q00) * wu, bot = q10 + (q11 - q10) * wu;
      const k = (top + (bot - top) * wv) * A + B;
      out[o++] = pal[k <= 0 ? 0 : k >= 255 ? 255 : k | 0];
    }
  }
}

/** The colour index of a value on the scale (colormap.ts indexOf), for checks. */
export function indexOfValue(ps: PlayScale, v: number): number {
  const t = (v - ps.scale.lo) / (ps.scale.hi - ps.scale.lo);
  return t <= 0 ? 0 : t >= 1 ? 255 : Math.min(255, Math.floor(t * 256));
}

// ---------------------------------------------------------------- the outline

export type Pt = [number, number]; // u, v (mm)
export type Ring = { k: 'poly'; pts: Pt[] } | { k: 'circle'; u: number; v: number; r: number };
export interface Outline {
  copper: Pt[][]; // cut by the slice: filled
  discs: { u: number; v: number; r: number }[]; // barrels and return vias cut across (top views): filled
  beside: Ring[][]; // copper above and below a top view, outlined: per layer its shapes (or a plane's openings), one union
  faces: number[]; // a side view's board faces (v, mm)
  ports: { a: Pt; b: Pt; name: string }[];
}

const TOL = 1e-9;
const sideCut = (sh: Shape, along: 'x' | 'y', at: number, z: number): number[] => {
  if (sh.k === 'rect') {
    const lo = along === 'x' ? sh.y0 : sh.x0, hi = along === 'x' ? sh.y1 : sh.x1;
    if (at < lo - TOL || at > hi + TOL) return [];
    const d = sh.tx ? Math.max(0, sh.tx.d0 + (sh.tx.d1 - sh.tx.d0) * Math.min(1, Math.max(0, sh.tx.z1 === sh.tx.z0 ? 0 : (z - sh.tx.z0) / (sh.tx.z1 - sh.tx.z0)))) : 0;
    return along === 'x' ? [sh.x0 - d, sh.x1 + d] : [sh.y0, sh.y1];
  }
  const c = along === 'x' ? sh.y : sh.x, m = along === 'x' ? sh.x : sh.y, e = Math.abs(at - c), out: number[] = [];
  for (const r of [sh.r0, sh.r1]) if (r > e) { const h = Math.sqrt(r * r - e * e); out.push(m - h, m + h); }
  return out;
};

/** The copper intervals of a layer along a side view's line (normal `n` at `at`), at its mid-height. */
function layerCut(c: CuLayer, n: 'x' | 'y', at: number, lo: number, hi: number): [number, number][] {
  const along = n === 'y' ? 'x' : 'y', z = (c.zb + c.zt) / 2;
  const br = [lo, hi];
  for (const sh of [...c.shapes, ...c.openings]) for (const x of sideCut(sh, along, at, z)) if (x > lo && x < hi) br.push(x);
  br.sort((a, b) => a - b);
  const out: [number, number][] = [];
  for (let i = 0; i + 1 < br.length; i++) {
    const a = br[i], b = br[i + 1];
    if (b - a < 1e-7) continue;
    const m = (a + b) / 2;
    if (!inLayer(c, along === 'x' ? m : at, along === 'x' ? at : m, z)) continue;
    const last = out[out.length - 1];
    if (last && Math.abs(last[1] - a) < 1e-7) last[1] = b; else out.push([a, b]);
  }
  return out;
}

const rectPts = (u0: number, v0: number, u1: number, v1: number): Pt[] => [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];

/** The structure in the slice: what the slice cuts (filled), what lies just above and below a top view (outlined),
 *  the board's faces and the ports. `box`: the slice's extent (u0, u1, v0, v1). */
export function outlineOf(m: Model, normal: 'x' | 'y' | 'z', at: number, box: { u0: number; u1: number; v0: number; v1: number }): Outline {
  const o: Outline = { copper: [], discs: [], beside: [], faces: [], ports: [] };
  if (normal !== 'z') {
    const along = normal === 'y' ? 'x' : 'y';
    for (const c of m.cu) for (const [a, b] of layerCut(c, normal, at, box.u0, box.u1)) o.copper.push(rectPts(a, c.zb, b, c.zt));
    for (const y of m.cyl) {
      const e = Math.abs(at - (normal === 'y' ? y.y : y.x));
      if (e >= y.r) continue;
      const h = Math.sqrt(y.r * y.r - e * e), cu = along === 'x' ? y.x : y.y;
      o.copper.push(rectPts(cu - h, y.z0, cu + h, y.z1));
    }
    o.faces = [0, m.thick];
    for (const p of m.ports) {
      if (p.axis !== along || at < p.across[0] - TOL || at > p.across[1] + TOL) continue;
      const zr = p.ref.kind === 'plane' ? p.ref.z : p.zSig;
      o.ports.push({ a: [p.pos, p.zSig], b: [p.pos, zr], name: p.name });
    }
    return o;
  }
  // a top view: what crosses the plane, and the nearest copper above and below
  for (const y of m.cyl) if (at > y.z0 && at < y.z1) o.discs.push({ u: y.x, v: y.y, r: y.r });
  const group = (rs: Ring[]) => { if (rs.length) o.beside.push(rs); };
  for (const c of m.cu) if (at >= c.zb && at <= c.zt && !c.plane) group(c.shapes.map((sh) => shapeOutline(sh, at)));
  const above = m.cu.filter((c) => c.zb > at).sort((a, b) => a.zb - b.zb), below = m.cu.filter((c) => c.zt < at).sort((a, b) => b.zt - a.zt);
  for (const side of [above, below]) {
    // the layers up to the first plane on that side: their copper outlined, the plane's openings
    for (const c of side) {
      if (c.plane) { group(c.openings.map((sh) => shapeOutline(sh, at, true))); break; }
      group(c.shapes.map((sh) => shapeOutline(sh, (c.zb + c.zt) / 2)));
    }
  }
  for (const p of m.ports) {
    const zr = p.ref.kind === 'plane' ? p.ref.z : p.zSig;
    if (at < Math.min(p.zSig, zr) - TOL || at > Math.max(p.zSig, p.zt, zr) + TOL) continue;
    o.ports.push(p.axis === 'x' ? { a: [p.pos, p.across[0]], b: [p.pos, p.across[1]], name: p.name } : { a: [p.across[0], p.pos], b: [p.across[1], p.pos], name: p.name });
  }
  return o;
}

function shapeOutline(sh: Shape, z: number, opening = false): Ring {
  if (sh.k === 'disk') return { k: 'circle', u: sh.x, v: sh.y, r: sh.r1 };
  const d = !opening && sh.tx ? Math.max(0, sh.tx.d0 + (sh.tx.d1 - sh.tx.d0) * Math.min(1, Math.max(0, sh.tx.z1 === sh.tx.z0 ? 0 : (z - sh.tx.z0) / (sh.tx.z1 - sh.tx.z0)))) : 0;
  return { k: 'poly', pts: rectPts(sh.x0 - d, sh.y0, sh.x1 + d, sh.y1) };
}

// ---------------------------------------------------------------- axes and clock

/** Ticks between lo and hi mm, nice in the shown unit: their place (mm) and text. */
export function axisTicks(lo: number, hi: number, unit: LengthUnit, n = 5): { mm: number; text: string }[] {
  const a = fromMm(lo, unit), b = fromMm(hi, unit);
  return niceTicks(a, b, n).filter((t) => t >= a - 1e-9 && t <= b + 1e-9).map((t) => ({ mm: toMm(t, unit), text: String(Number(t.toPrecision(6))).replace('-', '−') }));
}

/** The playback position after `ms` at `speed` (frames, fractional): wraps with `loop`, else stops on the last frame. */
export function advance(pos: number, ms: number, speed: number, n: number, loop: boolean): { pos: number; ended: boolean } {
  if (n <= 1) return { pos: 0, ended: !loop };
  const p = pos + (ms / 1000) * FPS_1X * speed;
  if (p < n) return { pos: p, ended: false };
  return loop ? { pos: p % n, ended: false } : { pos: n - 1, ended: true };
}

const PREFIX: [number, string][] = [[1e9, 'G'], [1e6, 'M'], [1e3, 'k'], [1, ''], [1e-3, 'm'], [1e-6, 'µ'], [1e-9, 'n']];
/** A value with an SI prefix and `digits` significant digits, a true minus sign. */
export function siText(v: number, unit: string, digits = 3): string {
  if (!Number.isFinite(v)) return `– ${unit}`;
  if (v === 0) return `0 ${unit}`;
  const a = Math.abs(v);
  const [m, p] = PREFIX.find(([k]) => a >= k * 0.9995) ?? PREFIX[PREFIX.length - 1];
  return `${Number((v / m).toPrecision(digits))} ${p}${unit}`.replace('-', '−');
}

/** A frame's time in ps as the player shows it. */
export const psText = (t: number): string => `${(t * 1e12).toFixed(1)} ps`;
