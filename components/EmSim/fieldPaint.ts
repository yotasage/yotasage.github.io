// The field view's drawing (M2.2), loaded by `await import` when the view is turned on (with the colour maps and the
// fields engine's helpers, so none of it is in the page's first load). A worker's field grid becomes an image of the
// grid's own size (one pixel per grid point, copper transparent) that the canvas behind the cross-section scales into
// the view with smoothing; with "widen" the view's y is piecewise linear in z, so the image is drawn band by band
// between the stack's faces. Contours, field lines and the surface strips become SVG paths in the view's pixels, drawn
// under the copper. The probe interpolates the grid bilinearly (the grid is fine where the field bends: fields.ts).

import type { Scale } from '../../lib/emsim/colormap';
import { barPosition, mapTable, scaleBar, scaleOf, toRGBA } from '../../lib/emsim/colormap';
import type { FieldGrid, Media, Surface } from '../../lib/emsim/fields';
import { classify, magnitude, sectionMedia } from '../../lib/emsim/fields';
import type { Contour } from '../../lib/emsim/fieldlines';
import type { Section } from '../../lib/emsim/geometry';
import type { FieldQty, FieldScale } from './fieldTypes';
import { isMagnetic } from './fieldTypes';

export interface Painted {
  qty: FieldQty;
  grid: FieldGrid;
  values: Float32Array | null; // what the map shows per grid point (null: no map, the surface quantities)
  scale: Scale;
  unit: string;
  image: HTMLCanvasElement | null; // nx × ny, row 0 at the view's top (z1)
  contours: Contour[];
  lines: Float32Array[];
  surface: Surface | null;
  done: boolean;
}

const UNIT: Record<FieldQty, string> = { phi: 'V', E: 'V/m', lines: 'V/m', H: 'A/m', charge: 'C/m²', current: 'A/m' };

/** A grid (and, once done, the job's contours, lines and surface) made ready to draw. */
export function prepare(grid: FieldGrid, qty: FieldQty, kind: FieldScale, extra?: { contours: Contour[]; lines: Float32Array[]; surface: Surface | null }): Painted {
  const { nx, ny } = grid.view;
  let values: Float32Array | null = null;
  let scale: Scale;
  if (qty === 'charge' || qty === 'current') {
    const d = extra?.surface?.density ?? new Float64Array(0);
    scale = scaleOf(d, 'signed', { clip: 0.98 });
  } else {
    values = qty === 'phi' ? grid.phi : magnitude(grid);
    let sk: 'linear' | 'log' | 'signed' = kind;
    if (qty === 'phi') {
      let lo = Infinity, hi = -Infinity;
      for (let i = 0; i < values.length; i++) { const v = values[i]; if (v < lo) lo = v; if (v > hi) hi = v; }
      if (lo < -1e-3 * (hi - lo) && hi > 1e-3 * (hi - lo)) sk = 'signed'; // both signs: diverging, zero in the middle
    }
    scale = scaleOf(values, sk, { cls: grid.cls });
  }
  let image: HTMLCanvasElement | null = null;
  if (values && typeof document !== 'undefined') {
    image = document.createElement('canvas');
    image.width = nx; image.height = ny;
    const rgba = toRGBA(values, nx, ny, scale, { cls: grid.cls });
    image.getContext('2d')!.putImageData(new ImageData(rgba as unknown as Uint8ClampedArray<ArrayBuffer>, nx, ny), 0, 0);
  }
  return {
    qty, grid, values, scale, unit: UNIT[qty], image,
    contours: extra?.contours ?? [], lines: extra?.lines ?? [], surface: extra?.surface ?? null, done: !!extra && grid.done,
  };
}

/**
 * Draws the map into ctx (cleared first) in the view: px = W/2 + (x − cx)·k, py = H/2 + (Y(z) − cy)·k. faces: the
 * stack's heights where Y's slope changes (all of them, or none when not widened).
 */
export function drawMap(ctx: CanvasRenderingContext2D, p: Painted | null, v: { cx: number; cy: number; k: number; w: number; h: number }, Y: (z: number) => number, faces: number[], dpr: number): void {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, v.w, v.h);
  if (!p || !p.image) return;
  const g = p.grid.view;
  const dx = (g.x1 - g.x0) / Math.max(1, g.nx - 1), dz = (g.z1 - g.z0) / Math.max(1, g.ny - 1);
  const px = (x: number) => v.w / 2 + (x - v.cx) * v.k;
  const py = (z: number) => v.h / 2 + (Y(z) - v.cy) * v.k;
  const ztop = g.z1 + dz / 2, zbot = g.z0 - dz / 2;
  const cuts = [ztop];
  for (const f of faces.slice().sort((a, b) => b - a)) if (f < ztop && f > zbot) cuts.push(f);
  cuts.push(zbot);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  const X0 = px(g.x0 - dx / 2), DW = g.nx * dx * v.k;
  for (let i = 0; i + 1 < cuts.length; i++) {
    const za = cuts[i], zb = cuts[i + 1]; // za above zb
    const sy0 = (ztop - za) / dz, sy1 = (ztop - zb) / dz;
    const y0 = py(za), y1 = py(zb);
    if (sy1 - sy0 <= 0 || y1 - y0 <= 0) continue;
    ctx.drawImage(p.image, 0, sy0, g.nx, sy1 - sy0, X0, y0, DW, y1 - y0);
  }
}

const f1 = (v: number) => Math.round(v * 10) / 10;

export interface Overlay { contours: string; lines: string; strips: { color: string; d: string }[] }

/** The contours, field lines and surface strips as SVG paths in the view's pixels (X(x), Yp(z)). */
export function overlay(p: Painted | null, X: (x: number) => number, Yp: (z: number) => number): Overlay {
  const out: Overlay = { contours: '', lines: '', strips: [] };
  if (!p) return out;
  const parts: string[] = [];
  for (const c of p.contours) {
    const s = c.segs;
    for (let i = 0; i < s.length; i += 4) parts.push(`M${f1(X(s[i]))} ${f1(Yp(s[i + 1]))}L${f1(X(s[i + 2]))} ${f1(Yp(s[i + 3]))}`);
  }
  out.contours = parts.join('');
  parts.length = 0;
  for (const l of p.lines) {
    if (l.length < 4) continue;
    let d = `M${f1(X(l[0]))} ${f1(Yp(l[1]))}`;
    for (let i = 2; i < l.length; i += 2) d += `L${f1(X(l[i]))} ${f1(Yp(l[i + 1]))}`;
    parts.push(d);
  }
  out.lines = parts.join('');
  const sf = p.surface;
  if (sf && (p.qty === 'charge' || p.qty === 'current')) {
    const BINS = 24;
    const tab = mapTable('diverging');
    const bins: string[][] = Array.from({ length: BINS }, () => []);
    const hi = p.scale.hi || 1;
    for (let j = 0; j < sf.x.length; j++) {
      const t = Math.min(1, Math.max(0, (sf.density[j] / hi + 1) / 2));
      const b = Math.min(BINS - 1, Math.floor(t * BINS));
      const tx = -sf.nz[j], tz = sf.nx[j], h = sf.len[j] / 2;
      const ax = X(sf.x[j] - tx * h), az = Yp(sf.z[j] - tz * h), bx = X(sf.x[j] + tx * h), bz = Yp(sf.z[j] + tz * h);
      const ox = sf.nx[j] * 2.5, oy = -sf.nz[j] * 2.5; // outside the copper by half the strip
      bins[b].push(`M${f1(ax + ox)} ${f1(az + oy)}L${f1(bx + ox)} ${f1(bz + oy)}`);
    }
    bins.forEach((segs, b) => {
      if (!segs.length) return;
      const e = Math.min(255, Math.floor(((b + 0.5) / BINS) * 256)) * 3;
      out.strips.push({ color: `rgb(${tab[e]},${tab[e + 1]},${tab[e + 2]})`, d: segs.join('') });
    });
  }
  return out;
}

export interface Probe { x: number; z: number; phi: number; fx: number; fz: number; f: number; cls: number }

/** The field at (x, z) from the grid, bilinear; null outside the grid. */
export function probeAt(p: Painted | null, x: number, z: number, media: Media | null): Probe | null {
  if (!p) return null;
  const g = p.grid, v = g.view;
  const dx = (v.x1 - v.x0) / Math.max(1, v.nx - 1), dz = (v.z1 - v.z0) / Math.max(1, v.ny - 1);
  const fi = (x - v.x0) / dx, fj = (z - v.z0) / dz;
  if (!(fi >= 0 && fj >= 0 && fi <= v.nx - 1 && fj <= v.ny - 1)) return null;
  const i = Math.min(v.nx - 2, Math.floor(fi)), j = Math.min(v.ny - 2, Math.floor(fj));
  const a = fi - i, b = fj - j;
  const k = j * v.nx + i;
  const lerp = (q: Float32Array) => (1 - b) * ((1 - a) * q[k] + a * q[k + 1]) + b * ((1 - a) * q[k + v.nx] + a * q[k + v.nx + 1]);
  const cls = media ? classify(media, x, z) : g.cls[Math.round(fj) * v.nx + Math.round(fi)];
  const phi = lerp(g.phi);
  const fx = cls < 0 ? 0 : lerp(g.fx), fz = cls < 0 ? 0 : lerp(g.fz);
  return { x, z, phi, fx, fz, f: Math.hypot(fx, fz), cls };
}

const mediaCache = new WeakMap<Section, Media>();
/** The section's media (for the probe's material), made once per section. */
export function mediaOf(sec: Section): Media {
  let m = mediaCache.get(sec);
  if (!m) { m = sectionMedia(sec); mediaCache.set(sec, m); }
  return m;
}

/** The class (Media) at a point of the section: ≥ 0 a material of sec.materials, < 0 copper (−1 − conductor id). */
export const classAt = (sec: Section, x: number, z: number): number => classify(mediaOf(sec), x, z);

const PREFIX: [number, string][] = [[1e9, 'G'], [1e6, 'M'], [1e3, 'k'], [1, ''], [1e-3, 'm'], [1e-6, 'µ'], [1e-9, 'n'], [1e-12, 'p'], [1e-15, 'f']];
/** A value with an SI prefix and three significant digits. */
export function si(v: number, unit: string, digits = 3): string {
  if (!Number.isFinite(v)) return `— ${unit}`;
  if (v === 0) return `0 ${unit}`;
  const a = Math.abs(v);
  const [m, p] = PREFIX.find(([m]) => a >= m * 0.9995) ?? PREFIX[PREFIX.length - 1];
  return `${Number((v / m).toPrecision(digits))} ${p}${unit}`.replace('-', '−');
}

/** The scale bar's strip as an image (w × 1 px, stretched by CSS) and its ticks at 0 … 1 across. */
export function bar(scale: Scale, w: number, unit: string): { url: string; ticks: { t: number; text: string }[] } {
  let url = '';
  if (typeof document !== 'undefined') {
    const c = document.createElement('canvas');
    c.width = w; c.height = 1;
    c.getContext('2d')!.putImageData(new ImageData(scaleBar(scale, w, 1) as unknown as Uint8ClampedArray<ArrayBuffer>, w, 1), 0, 0);
    url = c.toDataURL();
  }
  return { url, ticks: scale.ticks.map((v) => ({ t: barPosition(scale, v), text: si(v, unit, 2) })) };
}
