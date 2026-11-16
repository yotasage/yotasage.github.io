// The EM simulation's export figures (step M8.1a, docs/em-sim/notes-M8.1a.md, plan.md D16): one framework-free model
// in millimetres on paper that svg.ts writes as a standalone SVG (and the page as a PNG through a canvas) and tikz.ts as
// plain TikZ. Builders: board.ts (stackup, cross-section, via side and top views), field.ts (a field map added to one
// of those), plot.ts (any plot of lib/emsim/plot.ts).
//
// Coordinates: mm on paper, x to the right, **y up** (TikZ's sense; the SVG writer negates y). `box` is the figure's
// extent; the standalone page is exactly the box. Every primitive has a `role` (style.ts gives its paint per colour
// mode), a drawing `layer` (writers draw layer by layer, in insertion order within a layer) and an optional `clip`
// (an index into `clips`, rectangles in the same mm). Text is set at `pt` (never under MIN_PT), placed by its anchor
// point at the middle of its height (0.35 em above the baseline).

import type { Role } from './style';

export type ColourMode = 'colour' | 'grey' | 'bw';
export const COLOUR_MODES: readonly ColourMode[] = ['colour', 'grey', 'bw'];

export const PT_MM = 25.4 / 72.27; // a TeX point in mm
export const MIN_PT = 6;
export const MIN_WIDTH = 40; // mm
export const MAX_WIDTH = 2000;
export const LINEWIDTH_MM = 160; // the width a `\linewidth` figure is laid out for
export const SIZE_PRESETS: readonly { id: string; name: string; mm: number }[] = [
  { id: 'column', name: 'Column', mm: 88 },
  { id: 'text', name: 'Text width', mm: 160 },
  { id: 'page', name: 'Page width', mm: 180 },
];

// Drawing layers (writers draw them in this order).
export const L_BACK = 0; // laminate, air, planes in the top view
export const L_MAP = 1; // the field map's image
export const L_OVER = 2; // contours and field lines
export const L_COPPER = 3; // copper, holes
export const L_NOTE = 4; // dimensions, leaders, labels, scale bars, legends, plot frames

export interface Rect { x0: number; y0: number; x1: number; y1: number }

interface Base { role: Role; layer: number; clip?: number; index?: number /* a plot series or similar */ }
export interface RectPrim extends Base { t: 'rect'; x: number; y: number; w: number; h: number }
export interface PolyPrim extends Base { t: 'poly'; pts: number[]; closed: boolean } // x, y interleaved
export interface CirclePrim extends Base { t: 'circle'; cx: number; cy: number; r: number }
export interface SegsPrim extends Base { t: 'segs'; s: number[] } // separate segments x0, y0, x1, y1 …
export interface TextPrim extends Base {
  t: 'text'; x: number; y: number; text: string; pt: number; anchor: 'start' | 'middle' | 'end'; rotate: number;
  w: number; h: number; // the estimated box (mm), unrotated
}
export interface ImagePrim extends Base {
  t: 'image'; x: number; y: number; w: number; h: number; // its box in mm (x, y the lower left corner)
  px: number; py: number; // pixels
  png: Uint8Array; // the PNG file
  name: string; // file name beside a TikZ document
}
export type Prim = RectPrim | PolyPrim | CirclePrim | SegsPrim | TextPrim | ImagePrim;

export interface FigureOptions {
  width?: number | string; // mm, or text for readWidth ("88", "8.8 cm", "3.5in", "\linewidth"); default 88
  colour?: ColourMode;
  fontPt?: number; // labels (default 8; ticks one point smaller); never under MIN_PT
}

export interface World { s: number; ox: number; oy: number; clip: number; rect: Rect } // paper = o + s·world; clip index
export interface Figure {
  kind: string;
  name: string; // a short id for files ("stackup", "section-map" …)
  width: number; // mm: the box's width
  height: number;
  linewidth: boolean; // the width is \linewidth (laid out for `width` mm)
  colour: ColourMode;
  fontPt: number;
  box: Rect;
  prims: Prim[];
  clips: Rect[];
  world: World | null; // board figures: how world mm map to paper
  note: string; // one line for the head of the TikZ (what is drawn)
}

/** "88", "88mm", "8.8 cm", "3.5in", "\linewidth" → mm and whether it is \linewidth; null when not a width. */
export function readWidth(text: string | number): { mm: number; linewidth: boolean } | null {
  if (typeof text === 'number') return text >= MIN_WIDTH && text <= MAX_WIDTH ? { mm: text, linewidth: false } : null;
  const s = text.trim().replace(',', '.');
  if (/^\\(line|text|column)width$/.test(s)) return { mm: LINEWIDTH_MM, linewidth: true };
  const m = /^(\d+(?:\.\d*)?|\.\d+)\s*(mm|cm|in)?$/i.exec(s);
  if (!m) return null;
  const mm = Number(m[1]) * ({ mm: 1, cm: 10, in: 25.4 }[(m[2] ?? 'mm').toLowerCase() as 'mm' | 'cm' | 'in']);
  return mm >= MIN_WIDTH && mm <= MAX_WIDTH ? { mm, linewidth: false } : null;
}

/** A new figure of the given width (height 0, grown by the builder). */
export function newFigure(kind: string, name: string, o: FigureOptions = {}): Figure {
  const w = readWidth(o.width ?? 88) ?? { mm: 88, linewidth: false };
  return {
    kind, name, width: w.mm, height: 0, linewidth: w.linewidth, colour: o.colour ?? 'colour',
    fontPt: Math.max(MIN_PT, o.fontPt ?? 8), box: { x0: 0, y0: 0, x1: w.mm, y1: 0 }, prims: [], clips: [], world: null, note: '',
  };
}

/** The em of a text (mm). */
export const emMm = (pt: number): number => pt * PT_MM;
/** The estimated width of a text in mm: about Computer Modern's widths (a sans font is narrower), for layout. */
export function textWidth(text: string, pt: number): number {
  let n = 0;
  for (const ch of text) n += ch === ' ' ? 0.34 : /[il.,:;|'·]/.test(ch) ? 0.3 : /[mw]/.test(ch) ? 0.84 : /[MWΩ]/.test(ch) ? 0.95 : /[A-Z]/.test(ch) ? 0.74 : 0.53;
  return n * emMm(pt);
}

export function text(fig: Figure, x: number, y: number, s: string, pt: number, anchor: TextPrim['anchor'], role: Role = 'ink', layer = L_NOTE, rotate = 0): TextPrim {
  const p: TextPrim = { t: 'text', x, y, text: s, pt: Math.max(MIN_PT, pt), anchor, rotate, w: 0, h: 0, role, layer };
  p.w = textWidth(s, p.pt); p.h = 0.7 * emMm(p.pt);
  fig.prims.push(p);
  return p;
}

/** The text's box (unrotated texts; a rotation by ±90° swaps it). */
export function textBox(p: TextPrim): Rect {
  const vertical = Math.abs(Math.abs(p.rotate) - 90) < 1e-9;
  const w = vertical ? p.h : p.w, h = vertical ? p.w : p.h;
  const along = p.anchor === 'start' ? 0 : p.anchor === 'end' ? -1 : -0.5;
  if (!vertical) return { x0: p.x + along * w, x1: p.x + (along + 1) * w, y0: p.y - h / 2, y1: p.y + h / 2 };
  const sgn = p.rotate > 0 ? 1 : -1; // +90: the text runs upwards from its anchor
  const a = p.y + sgn * along * h, b = p.y + sgn * (along + 1) * h;
  return { x0: p.x - w / 2, x1: p.x + w / 2, y0: Math.min(a, b), y1: Math.max(a, b) };
}

export function addClip(fig: Figure, r: Rect): number {
  fig.clips.push({ ...r });
  return fig.clips.length - 1;
}

/** The parallel lines of a hatch (angle in degrees, gap mm) over a rectangle, anchored at the origin so neighbouring
 *  shapes' hatches line up: segments x0, y0, x1, y1 … cut to the rectangle. */
export function hatchLines(r: Rect, angle: number, gap: number): number[] {
  const a = (angle * Math.PI) / 180, dx = Math.cos(a), dy = Math.sin(a), nx = -dy, ny = dx;
  const ds = [r.x0 * nx + r.y0 * ny, r.x1 * nx + r.y0 * ny, r.x0 * nx + r.y1 * ny, r.x1 * nx + r.y1 * ny];
  const k0 = Math.ceil(Math.min(...ds) / gap), k1 = Math.floor(Math.max(...ds) / gap);
  const out: number[] = [];
  const L = Math.hypot(r.x1 - r.x0, r.y1 - r.y0) + Math.abs(r.x0) + Math.abs(r.y0) + Math.abs(r.x1) + Math.abs(r.y1);
  for (let k = k0; k <= k1; k++) {
    const px = k * gap * nx, py = k * gap * ny;
    const c = clipSeg(px - L * dx, py - L * dy, px + L * dx, py + L * dy, r);
    if (c && Math.hypot(c[2] - c[0], c[3] - c[1]) > 1e-6) out.push(...c);
  }
  return out;
}

/** Liang–Barsky: the part of a segment inside a rectangle, or null. */
export function clipSeg(x0: number, y0: number, x1: number, y1: number, r: Rect): [number, number, number, number] | null {
  let t0 = 0, t1 = 1;
  const dx = x1 - x0, dy = y1 - y0;
  for (const [p, q] of [[-dx, x0 - r.x0], [dx, r.x1 - x0], [-dy, y0 - r.y0], [dy, r.y1 - y0]]) {
    if (p === 0) { if (q < 0) return null; continue; }
    const t = q / p;
    if (p < 0) { if (t > t1) return null; if (t > t0) t0 = t; } else { if (t < t0) return null; if (t < t1) t1 = t; }
  }
  return [x0 + t0 * dx, y0 + t0 * dy, x0 + t1 * dx, y0 + t1 * dy];
}

/** A polyline (x, y interleaved; NaN breaks it) cut to a rectangle: its runs inside. */
export function clipPolyline(pts: ArrayLike<number>, r: Rect): number[][] {
  const runs: number[][] = [];
  let cur: number[] | null = null;
  const end = () => { if (cur && cur.length >= 4) runs.push(cur); cur = null; };
  for (let i = 0; i + 3 < pts.length; i += 2) {
    const x0 = pts[i], y0 = pts[i + 1], x1 = pts[i + 2], y1 = pts[i + 3];
    if (!(Number.isFinite(x0) && Number.isFinite(y0) && Number.isFinite(x1) && Number.isFinite(y1))) { end(); continue; }
    const c = clipSeg(x0, y0, x1, y1, r);
    if (!c) { end(); continue; }
    if (cur && (Math.abs(cur[cur.length - 2] - c[0]) > 1e-9 || Math.abs(cur[cur.length - 1] - c[1]) > 1e-9)) end();
    if (!cur) cur = [c[0], c[1]];
    cur.push(c[2], c[3]);
    if (c[2] !== x1 || c[3] !== y1) end();
  }
  end();
  return runs;
}

/** The bounding box of a primitive (text by its estimate; images by their box). */
export function primBox(p: Prim): Rect {
  switch (p.t) {
    case 'rect': case 'image': return { x0: p.x, y0: p.y, x1: p.x + p.w, y1: p.y + p.h };
    case 'circle': return { x0: p.cx - p.r, y0: p.cy - p.r, x1: p.cx + p.r, y1: p.cy + p.r };
    case 'text': return textBox(p);
    default: {
      const a = p.t === 'poly' ? p.pts : p.s;
      const r = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
      for (let i = 0; i < a.length; i += 2) { r.x0 = Math.min(r.x0, a[i]); r.x1 = Math.max(r.x1, a[i]); r.y0 = Math.min(r.y0, a[i + 1]); r.y1 = Math.max(r.y1, a[i + 1]); }
      return r;
    }
  }
}

/** The 1-2-5 length (mm of world) of a scale bar about `most` mm long on paper at s mm per mm. */
export function barLength(s: number, most: number): number {
  let best = 0;
  for (let e = -4; e <= 3; e++) for (const m of [1, 2, 5]) { const v = m * 10 ** e; if (v * s <= most) best = v; }
  return best || 10 ** -4;
}

/** A length as text in mm or µm, three significant digits (the default label formatter). */
export function mmText(mm: number): string {
  if (!Number.isFinite(mm)) return '–';
  const a = Math.abs(mm);
  const t = a > 0 && a < 1 ? `${Number((mm * 1000).toPrecision(3))} µm` : `${Number(mm.toPrecision(3))} mm`;
  return t.replace('-', '−');
}

/** Moves every primitive and clip by (dx, dy). */
export function shift(fig: Figure, dx: number, dy: number): void {
  for (const p of fig.prims) {
    if (p.t === 'rect' || p.t === 'image' || p.t === 'text') { p.x += dx; p.y += dy; }
    else if (p.t === 'circle') { p.cx += dx; p.cy += dy; }
    else { const a = p.t === 'poly' ? p.pts : p.s; for (let i = 0; i < a.length; i += 2) { a[i] += dx; a[i + 1] += dy; } }
  }
  for (const c of fig.clips) { c.x0 += dx; c.x1 += dx; c.y0 += dy; c.y1 += dy; }
  if (fig.world) { fig.world.ox += dx; fig.world.oy += dy; const r = fig.world.rect; r.x0 += dx; r.x1 += dx; r.y0 += dy; r.y1 += dy; }
}

/** Rounds to 1e-6 mm for writing (no "-0", no exponent). */
export function num(v: number): string {
  const r = Math.round(v * 1e6) / 1e6;
  if (r === 0) return '0';
  let s = r.toFixed(6);
  s = s.replace(/0+$/, '').replace(/\.$/, '');
  return s;
}

/** A text broken at spaces into lines no wider than `width` mm (a word wider than that stays whole). */
export function wrapText(s: string, pt: number, width: number): string[] {
  const out: string[] = [];
  let line = '';
  for (const w of s.split(' ')) {
    const t = line ? `${line} ${w}` : w;
    if (line && textWidth(t, pt) > width) { out.push(line); line = w; } else line = t;
  }
  if (line) out.push(line);
  return out;
}

/** A comment line's text in ASCII (the TikZ head). */
export function asciiText(s: string): string {
  const MAP: Record<string, string> = { 'φ': 'phi', 'µ': 'u', 'Ω': 'Ohm', 'ε': 'e', '−': '-', '·': '.', '’': "'", '–': '-', 'Ø': 'D' };
  let out = '';
  for (const ch of s) out += MAP[ch] ?? (ch >= ' ' && ch <= '~' ? ch : '?');
  return out;
}
