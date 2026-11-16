// A field map on a board figure (step M8.1a): the map as an image at its grid's size (one pixel per grid point, centred
// on it, copper transparent) laid under the copper by the figure's world, contours and field lines as vectors over
// it (`addMap`), and the colour bar below (`mapFooter`); board.ts's builders call both for their `map` option. Colour: the page's maps (colormap.ts). Greyscale: a grey ramp of the same scale
// (dark at the low end; for a signed map dark is −). Black and white: no image and no bar, only the lines.

import type { Scale } from '../colormap';
import { barPosition, indexOf, toRGBA } from '../colormap';
import type { View } from '../fields';
import type { Contour } from '../fieldlines';
import { L_MAP, L_NOTE, L_OVER, clipPolyline, emMm, text, textWidth, wrapText } from './model';
import type { Figure } from './model';
import { encodePng } from './png';
import { paintOf } from './style';

export interface MapInput {
  view: View; // the grid (world mm: x across, z up; the top view's board y), row 0 at z0
  values: ArrayLike<number> | null; // what the map shows per grid point; null: lines only
  cls?: ArrayLike<number> | null; // < 0: copper (transparent)
  scale: Scale;
  unit: string; // of the values: 'V', 'V/m'
  label: string; // the quantity: 'φ', '|E|'
  contours?: Contour[];
  lines?: ArrayLike<number>[]; // world x, z interleaved
}

const GREY0 = 51, GREY1 = 242;

/** The map's pixels for a colour mode: RGBA, row 0 at the top. */
export function mapPixels(m: MapInput, mode: 'colour' | 'grey'): Uint8ClampedArray {
  const { nx, ny } = m.view;
  if (mode === 'colour') return toRGBA(m.values, nx, ny, m.scale, { cls: m.cls ?? null });
  const out = new Uint8ClampedArray(nx * ny * 4);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const k = j * nx + i, o = ((ny - 1 - j) * nx + i) * 4;
    const e = m.cls && m.cls[k] < 0 ? -1 : indexOf(m.scale, m.values[k]);
    if (e < 0) continue;
    const g = Math.round(GREY0 + (e * (GREY1 - GREY0)) / 255);
    out[o] = g; out[o + 1] = g; out[o + 2] = g; out[o + 3] = 255;
  }
  return out;
}

/** A value with an SI prefix and two significant digits (as the page's scale bar). */
export function siText(v: number, unit: string, digits = 2): string {
  if (!Number.isFinite(v)) return `– ${unit}`;
  if (v === 0) return `0 ${unit}`;
  const P: [number, string][] = [[1e9, 'G'], [1e6, 'M'], [1e3, 'k'], [1, ''], [1e-3, 'm'], [1e-6, 'µ'], [1e-9, 'n'], [1e-12, 'p'], [1e-15, 'f']];
  const [m, p] = P.find(([q]) => Math.abs(v) >= q * 0.9995) ?? P[P.length - 1];
  return `${Number((v / m).toPrecision(digits))} ${p}${unit}`.replace('-', '−');
}

/** Lays the map, its contours and field lines on a board figure's world (board.ts calls it for its `map` option). */
export function addMap(fig: Figure, m: MapInput): void {
  const w = fig.world;
  if (!w) throw new Error('this figure has no world to lay a map on');
  const { x0, x1, z0, z1, nx, ny } = m.view;
  const dx = (x1 - x0) / (nx - 1), dz = (z1 - z0) / (ny - 1);
  const X = (x: number) => w.ox + w.s * x, Y = (z: number) => w.oy + w.s * z;
  const mode = fig.colour;
  fig.kind += '+map';
  fig.name += '-map';
  fig.note += `, with the field map (${m.label})`;
  if (m.values && mode !== 'bw') {
    const px = mapPixels(m, mode);
    const png = encodePng(px, nx, ny, { grey: mode === 'grey' });
    fig.prims.push({ t: 'image', x: X(x0 - dx / 2), y: Y(z0 - dz / 2), w: w.s * (x1 - x0 + dx), h: w.s * (z1 - z0 + dz), px: nx, py: ny, png, name: `${fig.name}.png`, role: 'map', layer: L_MAP, clip: w.clip });
  }
  const r = w.rect;
  const segs: number[] = [];
  for (const c of m.contours ?? []) {
    const s = c.segs;
    for (let i = 0; i + 3 < s.length; i += 4) {
      const ax = X(s[i]), ay = Y(s[i + 1]), bx = X(s[i + 2]), by = Y(s[i + 3]);
      if (Math.max(ax, bx) < r.x0 || Math.min(ax, bx) > r.x1 || Math.max(ay, by) < r.y0 || Math.min(ay, by) > r.y1) continue;
      segs.push(ax, ay, bx, by);
    }
  }
  const halo = (role: 'contourHalo' | 'fieldlineHalo') => paintOf(mode, role).stroke !== null;
  if (segs.length) {
    if (halo('contourHalo')) fig.prims.push({ t: 'segs', s: segs.slice(), role: 'contourHalo', layer: L_OVER, clip: w.clip });
    fig.prims.push({ t: 'segs', s: segs, role: 'contour', layer: L_OVER, clip: w.clip });
  }
  const runs: number[][] = [];
  const big = { x0: r.x0 - 1, y0: r.y0 - 1, x1: r.x1 + 1, y1: r.y1 + 1 };
  for (const l of m.lines ?? []) {
    const pts: number[] = new Array(l.length);
    for (let i = 0; i + 1 < l.length; i += 2) { pts[i] = X(l[i]); pts[i + 1] = Y(l[i + 1]); }
    runs.push(...clipPolyline(pts, big));
  }
  if (halo('fieldlineHalo')) for (const p of runs) fig.prims.push({ t: 'poly', pts: p.slice(), closed: false, role: 'fieldlineHalo', layer: L_OVER, clip: w.clip });
  for (const p of runs) fig.prims.push({ t: 'poly', pts: p, closed: false, role: 'fieldline', layer: L_OVER, clip: w.clip });
}

/** The colour bar (or, in black and white, a note) from y down; returns the new y. */
export function mapFooter(fig: Figure, y: number, m: MapInput): number {
  const mode = fig.colour;
  const pt = Math.max(6, fig.fontPt - 1), em = emMm(pt);
  y -= 0.4;
  if (m.values && mode !== 'bw') {
    const bw = Math.min(60, fig.width * 0.6), bh = 2.2;
    const strip = new Uint8ClampedArray(256 * 4);
    const bar: MapInput = { view: { x0: 0, x1: 1, z0: 0, z1: 0, nx: 256, ny: 1 }, values: Float64Array.from({ length: 256 }, (_, i) => valueOf(m.scale, (i + 0.5) / 256)), scale: m.scale, unit: m.unit, label: '' };
    strip.set(mapPixels(bar, mode));
    const png = encodePng(strip, 256, 1, { alpha: false, grey: mode === 'grey' });
    fig.prims.push({ t: 'image', x: 0, y: y - bh, w: bw, h: bh, px: 256, py: 1, png, name: `${fig.name}-bar.png`, role: 'map', layer: L_NOTE });
    fig.prims.push({ t: 'poly', pts: [0, y - bh, bw, y - bh, bw, y, 0, y], closed: true, role: 'leader', layer: L_NOTE });
    const ty = y - bh - 0.5 * em - 1.1;
    const tick: number[] = [];
    let last = -Infinity;
    for (const v of m.scale.ticks) {
      const t = barPosition(m.scale, v);
      if (!(t >= 0 && t <= 1)) continue;
      const xx = t * bw, label = siText(v, m.unit), tw = textWidth(label, pt);
      tick.push(xx, y - bh, xx, y - bh - 0.7);
      const cx = Math.min(Math.max(xx, tw / 2 + 0.3), fig.width - tw / 2 - 0.3);
      if (cx - tw / 2 < last + 1.5) continue;
      text(fig, cx, ty, label, pt, 'middle');
      last = cx + tw / 2;
    }
    if (tick.length) fig.prims.push({ t: 'segs', s: tick, role: 'dim', layer: L_NOTE });
    const lab = `${m.label}${m.scale.kind === 'log' ? ', log scale' : ''}`;
    if (bw + 2 + textWidth(lab, pt) <= fig.width) text(fig, bw + 2, y - bh / 2, lab, pt, 'start');
    else text(fig, Math.max(last + 1, 0), ty - 1.4 * em, lab, pt, 'start');
    y = ty - (bw + 2 + textWidth(lab, pt) <= fig.width ? 0.6 * em : 2 * em) - 0.8;
  } else {
    const note = m.values ? 'Black and white: the map is left out; dashed lines are equipotentials.' : 'Dashed lines are equipotentials.';
    for (const l of wrapText(note, pt, fig.width)) { text(fig, 0, y - 0.6 * em, l, pt, 'start', 'muted'); y -= 1.3 * em; }
    y -= 0.6;
  }
  return y;
}

/** The value at a fraction 0 … 1 of a scale (the inverse of indexOf's t). */
function valueOf(s: Scale, t: number): number {
  return s.kind === 'log' ? s.lo * (s.hi / s.lo) ** t : s.lo + t * (s.hi - s.lo);
}
