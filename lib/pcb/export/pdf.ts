// PDF export of the PCB viewer at exactly 1:1: the shown layers on one page (in drawing order, each with its colour
// and opacity) or one page per layer, on A4, A3 or Letter or on a page fitted to the board, seen from the top or
// mirrored (seen from the bottom, or only the pages of bottom layers), with a title (file and layer names) and a scale
// bar. Everything is vectors: the page maps board millimetres to points with one transform, so lengths stay exact. Each
// layer is a form (optional content, so PDF viewers can show and hide it; a transparency group when it is not opaque);
// flashes use a form per aperture; arcs are Bézier curves. PDF has no clear polarity, so layers with clear items are
// flattened with polygon booleans (flatten.ts) into filled outlines. @cantoo/pdf-lib (loaded only now) puts the file
// together and sets the text; the drawing is written as content streams, compressed with fflate on the way.
import type { PDFDocument, PDFFont, PDFPage, PDFRef } from '@cantoo/pdf-lib';
import { Zlib } from 'fflate';

import { apertureBox, DEG, flashMatrix, segArc } from '../geometry';
import { layerTitle } from '../identify';
import { Aperture, Box, Contour, emptyBox, isEmptyBox, Layer, Pt, unionBox } from '../model';
import { classify } from '../render/prepare';
import { BACKGROUND } from '../render/view';
import { flattenAperture, flattenLayer, hasClearItems, Polygon } from './flatten';
import { Cancelled } from './png';

export type PdfPaper = 'a4' | 'a3' | 'letter' | 'fit';
export type PdfColors = 'screen' | 'white' | 'black';
// Seen from the top, from the bottom (everything mirrored), or each layer from its own side (pages of bottom layers
// mirrored).
export type PdfMirror = 'top' | 'bottom' | 'own';

export interface PdfLayer {
  layer: Layer;
  color: string;
  opacity: number;
  // The highlighted part of a layer, drawn after all the layers (one page only).
  highlighted?: boolean;
}

export interface PdfOptions {
  // The board's name, for the title and the document properties.
  title: string;
  // The layers in drawing order (the first is at the bottom).
  layers: PdfLayer[];
  pages: 'one' | 'each';
  paper: PdfPaper;
  mirror: PdfMirror;
  colors: PdfColors;
  // The area of the board on the page, in board millimetres (the same on every page; default: around the layers).
  box?: Box;
  // The board shape, drawn thinly on every page (per-layer pages are hard to place without it).
  outline?: Contour[];
  // Extra text for the title line (e.g. "net GND highlighted").
  note?: string;
  onProgress?: (done: number) => void;
  signal?: AbortSignal;
}

// Points per millimetre.
export const PT = 72 / 25.4;
// The chords that stand in for arcs of flattened layers stay this close to the arc (mm).
export const FLATTEN_TOLERANCE = 0.0025;
const MARGIN = 10;
const HEADER = 15;
const FOOTER = 15;
const PAPERS: Record<Exclude<PdfPaper, 'fit'>, { w: number; h: number; label: string }> = {
  a4: { w: 210, h: 297, label: 'A4' },
  a3: { w: 297, h: 420, label: 'A3' },
  letter: { w: 215.9, h: 279.4, label: 'Letter' },
};
const SLICE_MS = 30;

// --- Page layout ---

export interface PageLayout {
  // Page size in mm, and the area the board is drawn in.
  w: number;
  h: number;
  area: Box;
  // Whether the board fits into the area at 1:1.
  fits: boolean;
}

// The page for a board box: the chosen paper turned to suit the board, or a page fitted around it.
export function pageLayout(box: Box, paper: PdfPaper): PageLayout {
  const bw = box.maxX - box.minX;
  const bh = box.maxY - box.minY;
  let w: number;
  let h: number;
  if (paper === 'fit') {
    w = Math.max(bw + 2 * MARGIN, 120);
    h = bh + 2 * MARGIN + HEADER + FOOTER;
  } else {
    const p = PAPERS[paper];
    const landscape = bw > bh;
    w = landscape ? p.h : p.w;
    h = landscape ? p.w : p.h;
  }
  const area = { minX: MARGIN, minY: MARGIN + FOOTER, maxX: w - MARGIN, maxY: h - MARGIN - HEADER };
  return { w, h, area, fits: bw <= area.maxX - area.minX + 1e-6 && bh <= area.maxY - area.minY + 1e-6 };
}

export function paperLabel(paper: PdfPaper): string {
  return paper === 'fit' ? 'a page fitted to the board' : PAPERS[paper].label;
}

// --- Numbers and colours ---

function n(v: number): string {
  const r = Math.round(v * 1e4) / 1e4;
  return Object.is(r, -0) || !Number.isFinite(r) ? '0' : String(r);
}

// The numbers of the page transform, with all their digits, so that 1:1 is exact.
function exact(v: number): string {
  const r = Number(v.toFixed(9));
  return Object.is(r, -0) || !Number.isFinite(r) ? '0' : String(r);
}

function rgb(color: string): [number, number, number] {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim());
  if (!m) return [0.5, 0.5, 0.5];
  const hex = m[1].length === 3 ? m[1].split('').map((c) => c + c).join('') : m[1];
  return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];
}

// A layer colour on white paper: light colours (silkscreen, drills) are darkened so they show.
function onPaper(color: string): string {
  const [r, g, b] = rgb(color);
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  if (lum <= 0.55) return color;
  const k = 0.55 / lum;
  return `#${[r, g, b].map((v) => Math.round(v * k * 255).toString(16).padStart(2, '0')).join('')}`;
}

function colorOps(color: string): string {
  const [r, g, b] = rgb(color).map((v) => n(Math.round(v * 1000) / 1000));
  return `${r} ${g} ${b} rg ${r} ${g} ${b} RG\n`;
}

// --- Content streams, compressed as they are written ---

class Progress {
  done = 0;
  private slice = performance.now();

  constructor(private total: number, private o: PdfOptions) {}

  async tick(items: number) {
    this.done += items;
    if (performance.now() - this.slice < SLICE_MS) return;
    this.o.onProgress?.(this.total ? Math.min(0.99, this.done / this.total) : 0.5);
    await new Promise((resolve) => setTimeout(resolve, 0));
    if (this.o.signal?.aborted) throw new Cancelled();
    this.slice = performance.now();
  }
}

const encoder = new TextEncoder();

class Stream {
  private z = new Zlib({ level: 6 });
  private chunks: Uint8Array[] = [];
  private buffer: string[] = [];
  private size = 0;

  constructor() {
    this.z.ondata = (data) => this.chunks.push(data);
  }

  w(s: string) {
    this.buffer.push(s);
    this.size += s.length;
    if (this.size > 1 << 18) this.flush(false);
  }

  private flush(final: boolean) {
    this.z.push(encoder.encode(this.buffer.join('')), final);
    this.buffer = [];
    this.size = 0;
  }

  // The compressed bytes.
  finish(): Uint8Array {
    this.flush(true);
    const total = this.chunks.reduce((s, c) => s + c.length, 0);
    const out = new Uint8Array(total);
    let at = 0;
    for (const c of this.chunks) {
      out.set(c, at);
      at += c.length;
    }
    return out;
  }
}

// --- Paths in board millimetres ---

// Bézier curves along an arc (at most a quarter turn each), from the point at `start`, which the path is already at.
function arcCurves(c: Pt, r: number, start: number, sweep: number): string {
  const count = Math.max(1, Math.ceil(Math.abs(sweep) / 90 - 1e-9));
  const step = (sweep / count) * DEG;
  const k = (4 / 3) * Math.tan(step / 4);
  let a = start * DEG;
  let s = '';
  for (let i = 0; i < count; i += 1) {
    const b = a + step;
    const x0 = c.x + r * Math.cos(a);
    const y0 = c.y + r * Math.sin(a);
    const x3 = c.x + r * Math.cos(b);
    const y3 = c.y + r * Math.sin(b);
    s += `${n(x0 - k * r * Math.sin(a))} ${n(y0 + k * r * Math.cos(a))} ${n(x3 + k * r * Math.sin(b))} ${n(y3 - k * r * Math.cos(b))} ${n(x3)} ${n(y3)} c\n`;
    a = b;
  }
  return s;
}

function circlePath(c: Pt, r: number, ccw = true): string {
  return `${n(c.x + r)} ${n(c.y)} m\n${arcCurves(c, r, 0, ccw ? 360 : -360)}h\n`;
}

function contourPath(contour: Contour): string {
  let s = `${n(contour.start.x)} ${n(contour.start.y)} m\n`;
  let from = contour.start;
  for (const seg of contour.segs) {
    if (seg.arc) {
      const { start, sweep } = segArc(from, seg);
      s += arcCurves(seg.arc.c, Math.hypot(from.x - seg.arc.c.x, from.y - seg.arc.c.y), start, sweep);
    } else {
      s += `${n(seg.to.x)} ${n(seg.to.y)} l\n`;
    }
    from = seg.to;
  }
  return `${s}h\n`;
}

function ringPath(ring: Pt[]): string {
  if (ring.length < 3) return '';
  let s = `${n(ring[0].x)} ${n(ring[0].y)} m\n`;
  for (let i = 1; i < ring.length; i += 1) s += `${n(ring[i].x)} ${n(ring[i].y)} l\n`;
  return `${s}h\n`;
}

function polygonsPath(polys: Polygon[]): string {
  return polys.map((p) => ringPath(p.outer) + p.holes.map(ringPath).join('')).join('');
}

const FILL_CHUNK = 2000;

// The items of a layer without clear items: filled shapes (regions, holes, dots) in non-zero fills, lines and arcs in
// strokes grouped by width and cap (lines that continue each other in one subpath), flashes as forms of their aperture.
async function itemsContent(s: Stream, layer: Layer, apNames: Map<number, string>, progress: Progress) {
  let fill: string[] = [];
  const strokes = new Map<string, { w: number; cap: number; parts: string[]; end: Pt | null }>();
  const flushFill = () => {
    if (fill.length) s.w(`${fill.join('')}f\n`);
    fill = [];
  };
  const flushStroke = (g: { w: number; cap: number; parts: string[] }) => {
    if (g.parts.length) s.w(`${n(g.w)} w ${g.cap} J\n${g.parts.join('')}S\n`);
    g.parts = [];
  };
  const group = (w: number, cap: number) => {
    const key = `${w}|${cap}`;
    let g = strokes.get(key);
    if (!g) strokes.set(key, (g = { w, cap, parts: [], end: null }));
    return g;
  };
  s.w('1 j\n');
  const items = layer.items;
  for (let k = 0; k < items.length; k += 1) {
    const item = items[k];
    switch (item.k) {
      case 'line': {
        if (!(item.w > 0)) break;
        if (item.a.x === item.b.x && item.a.y === item.b.y) {
          if (item.cap === 'round') fill.push(circlePath(item.a, item.w / 2));
          else {
            const h = item.w / 2;
            fill.push(`${n(item.a.x - h)} ${n(item.a.y - h)} ${n(item.w)} ${n(item.w)} re\n`);
          }
          break;
        }
        const g = group(item.w, item.cap === 'square' ? 2 : 1);
        if (!g.end || g.end.x !== item.a.x || g.end.y !== item.a.y) g.parts.push(`${n(item.a.x)} ${n(item.a.y)} m\n`);
        g.parts.push(`${n(item.b.x)} ${n(item.b.y)} l\n`);
        g.end = item.b;
        if (g.parts.length >= FILL_CHUNK) {
          flushStroke(g);
          g.end = null;
        }
        break;
      }
      case 'arc': {
        if (!(item.w > 0) || !(item.r > 0)) break;
        const g = group(item.w, 1);
        const a = item.start * DEG;
        g.parts.push(`${n(item.c.x + item.r * Math.cos(a))} ${n(item.c.y + item.r * Math.sin(a))} m\n${arcCurves(item.c, item.r, item.start, item.sweep)}`);
        g.end = null;
        if (g.parts.length >= FILL_CHUNK) flushStroke(g);
        break;
      }
      case 'flash': {
        const name = apNames.get(item.ap);
        if (!name) break;
        const m = flashMatrix(item.at, item.rot, item.mirror, item.scale);
        s.w(`q ${n(m.a)} ${n(m.b)} ${n(m.c)} ${n(m.d)} ${n(m.e)} ${n(m.f)} cm /${name} Do Q\n`);
        break;
      }
      case 'region':
        fill.push(item.contours.map(contourPath).join(''));
        break;
      case 'hole':
        if (item.to && (item.to.x !== item.at.x || item.to.y !== item.at.y)) {
          const g = group(item.d, 1);
          g.parts.push(`${n(item.at.x)} ${n(item.at.y)} m\n${n(item.to.x)} ${n(item.to.y)} l\n`);
          g.end = null;
        } else if (item.d > 0) {
          fill.push(circlePath(item.at, item.d / 2));
        }
        break;
    }
    if (fill.length >= FILL_CHUNK) flushFill();
    if (k % 2000 === 1999) await progress.tick(2000);
  }
  flushFill();
  for (const g of strokes.values()) flushStroke(g);
  await progress.tick(items.length % 2000);
}

// --- The document ---

type PdfLib = typeof import('@cantoo/pdf-lib');

interface Built {
  ref: PDFRef;
  bbox: Box;
}

// The text a standard font can set (WinAnsi); other characters become "?".
function encodable(font: PDFFont, text: string): string {
  let out = '';
  for (const ch of text) {
    try {
      font.encodeText(ch);
      out += ch;
    } catch {
      out += '?';
    }
  }
  return out;
}

// Breaks text into lines no wider than `width` points, at most `max` lines (the last one shortened with "…").
function wrap(font: PDFFont, size: number, text: string, width: number, max: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    const next = line ? `${line} ${word}` : word;
    if (line && font.widthOfTextAtSize(next, size) > width) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  if (lines.length <= max) return lines;
  const kept = lines.slice(0, max);
  let last = `${kept[max - 1]} …`;
  while (last.length > 2 && font.widthOfTextAtSize(last, size) > width) last = `${last.slice(0, -3).trimEnd()} …`;
  kept[max - 1] = last;
  return kept;
}

// A round length for the scale bar that fits into `room` mm.
function barLength(room: number): number {
  for (const len of [100, 50, 20, 10, 5, 2, 1]) if (len <= room) return len;
  return 1;
}

function boxOfLayers(layers: PdfLayer[]): Box {
  let box = emptyBox();
  for (const l of layers) if (!isEmptyBox(l.layer.bbox)) box = unionBox(box, l.layer.bbox);
  return box;
}

export async function exportPdf(o: PdfOptions): Promise<Blob> {
  const lib: PdfLib = await import('@cantoo/pdf-lib');
  const { PDFDocument, PDFName, PDFHexString, StandardFonts } = lib;
  if (o.signal?.aborted) throw new Cancelled();
  const doc: PDFDocument = await PDFDocument.create();
  const ctx = doc.context;
  doc.setTitle(`${o.title} – PCB layers at 1:1`);
  doc.setCreator('PCB viewer (yotasage.github.io)');
  doc.setProducer('PCB viewer (yotasage.github.io) with pdf-lib');
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const total = o.layers.reduce((s, l) => s + l.layer.items.length, 0) + 1;
  const progress = new Progress(total, o);
  const pause = async () => {
    await progress.tick(0);
  };

  // One form per layer (and per aperture it flashes), shared by the pages that show the layer.
  const built = new Map<Layer, Built>();
  const buildLayer = async (layer: Layer): Promise<Built> => {
    const known = built.get(layer);
    if (known) return known;
    const s = new Stream();
    const resources: Record<string, PDFRef> = {};
    if (hasClearItems(layer)) {
      const polys = await flattenLayer(layer, { tolerance: FLATTEN_TOLERANCE, pause, onItems: (k) => { progress.done += k; } });
      for (let i = 0; i < polys.length; i += 500) {
        s.w(`${polygonsPath(polys.slice(i, i + 500))}f*\n`);
        await progress.tick(0);
      }
    } else {
      const used = new Set<number>();
      for (const item of layer.items) if (item.k === 'flash') used.add(item.ap);
      const names = new Map<number, string>();
      for (const ap of used) {
        const ref = await apertureForm(ctx, layer.apertures[ap]);
        if (!ref) continue;
        names.set(ap, `A${ap}`);
        resources[`A${ap}`] = ref;
      }
      await itemsContent(s, layer, names, progress);
    }
    const b = isEmptyBox(layer.bbox) ? { minX: 0, minY: 0, maxX: 1, maxY: 1 } : layer.bbox;
    const bbox = { minX: b.minX - 1, minY: b.minY - 1, maxX: b.maxX + 1, maxY: b.maxY + 1 };
    const stream = ctx.stream(s.finish(), {
      Type: 'XObject',
      Subtype: 'Form',
      BBox: [bbox.minX, bbox.minY, bbox.maxX, bbox.maxY],
      Resources: { XObject: resources },
      Filter: 'FlateDecode',
    });
    const entry = { ref: ctx.register(stream), bbox };
    built.set(layer, entry);
    return entry;
  };

  // A transparency group around a layer form, for layers that are not opaque, so overlapping items do not add up.
  const groups = new Map<PDFRef, PDFRef>();
  const groupOf = (inner: Built): PDFRef => {
    let g = groups.get(inner.ref);
    if (!g) {
      const b = inner.bbox;
      g = ctx.register(ctx.stream(encoder.encode('/L Do\n'), {
        Type: 'XObject', Subtype: 'Form', BBox: [b.minX, b.minY, b.maxX, b.maxY],
        Group: { S: 'Transparency', CS: 'DeviceRGB' }, Resources: { XObject: { L: inner.ref } },
      }));
      groups.set(inner.ref, g);
    }
    return g;
  };

  // Optional content groups: one per layer, so PDF viewers can show and hide the layers.
  const ocgs = new Map<Layer, PDFRef>();
  const ocgOf = (l: PdfLayer): PDFRef => {
    let ref = ocgs.get(l.layer);
    if (!ref) {
      const name = `${layerTitle(l.layer)}${l.highlighted ? ', highlighted' : ''} (${l.layer.name})`;
      ref = ctx.register(ctx.obj({ Type: 'OCG', Name: PDFHexString.fromText(name) }));
      ocgs.set(l.layer, ref);
    }
    return ref;
  };

  const pageSets: PdfLayer[][] = o.pages === 'one' ? [o.layers] : o.layers.filter((l) => !l.highlighted).map((l) => [l]);
  const ink = o.colors === 'screen' ? '#d0d2cd' : '#000000';
  for (let p = 0; p < pageSets.length; p += 1) {
    const set = pageSets[p];
    const mirrored = o.mirror === 'bottom' || (o.mirror === 'own' && o.pages === 'each' && set[0]?.layer.side === 'bottom');
    const box = o.box ?? boxOfLayers(o.layers);
    const lay = pageLayout(box, o.paper);
    const page: PDFPage = doc.addPage([lay.w * PT, lay.h * PT]);
    const xobjects: Record<string, PDFRef> = {};
    const states: Record<string, PDFRef> = {};
    const props: Record<string, PDFRef> = {};
    const s = new Stream();
    s.w('q\n');
    const area = lay.area;
    if (o.colors === 'screen') s.w(`${colorOps(BACKGROUND)}${n(area.minX * PT)} ${n(area.minY * PT)} ${n((area.maxX - area.minX) * PT)} ${n((area.maxY - area.minY) * PT)} re f\n`);
    s.w(`${n(area.minX * PT)} ${n(area.minY * PT)} ${n((area.maxX - area.minX) * PT)} ${n((area.maxY - area.minY) * PT)} re W n\n`);
    // Board millimetres to points: the centre of the box at the centre of the area, mirrored in X when seen from below.
    const cx = (area.minX + area.maxX) / 2;
    const cy = (area.minY + area.maxY) / 2;
    const bx = (box.minX + box.maxX) / 2;
    const by = (box.minY + box.maxY) / 2;
    const sx = mirrored ? -PT : PT;
    s.w(`${exact(sx)} 0 0 ${exact(PT)} ${exact(cx * PT - sx * bx)} ${exact(cy * PT - PT * by)} cm\n`);
    for (let i = 0; i < set.length; i += 1) {
      const l = set[i];
      const b = await buildLayer(l.layer);
      const color = o.colors === 'black' ? '#000000' : o.colors === 'white' ? onPaper(l.color) : l.color;
      const opacity = o.colors === 'black' ? 1 : Math.max(0, Math.min(1, l.opacity));
      const xo = `L${i}`;
      const oc = `oc${i}`;
      props[oc] = ocgOf(l);
      s.w(`q /OC /${oc} BDC\n${colorOps(color)}`);
      if (opacity < 0.999) {
        const gs = `G${i}`;
        states[gs] = ctx.register(ctx.obj({ Type: 'ExtGState', ca: opacity, CA: opacity }));
        xobjects[xo] = groupOf(b);
        s.w(`/${gs} gs `);
      } else {
        xobjects[xo] = b.ref;
      }
      s.w(`/${xo} Do\nEMC Q\n`);
    }
    if (o.outline?.length) {
      s.w(`q ${colorOps(ink)}0.1 w 1 j 1 J\n${o.outline.map(contourPath).join('')}S Q\n`);
    }
    s.w('Q\n');

    // The scale bar, under the drawing: a round length in mm with ticks.
    const room = Math.min(lay.w - 2 * MARGIN - 70, 100);
    const len = barLength(room);
    const x0 = MARGIN;
    const y0 = MARGIN + 4;
    const tick = len >= 50 ? 10 : len >= 10 ? 1 : 0.5;
    s.w(`q ${colorOps('#000000')}0.25 w 0 J\n${exact(x0 * PT)} ${exact(y0 * PT)} m ${exact((x0 + len) * PT)} ${exact(y0 * PT)} l S\n`);
    for (let t = 0; t <= len + 1e-9; t += tick) {
      const major = Math.abs(t % (tick * 5)) < 1e-9 || Math.abs(t - len) < 1e-9;
      s.w(`${exact((x0 + t) * PT)} ${exact(y0 * PT)} m ${exact((x0 + t) * PT)} ${exact((y0 + (major ? 2.5 : 1.2)) * PT)} l S\n`);
    }
    s.w('Q\n');
    const ref = ctx.register(ctx.stream(s.finish(), { Filter: 'FlateDecode' }));
    page.node.addContentStream(ref);
    for (const [k, v] of Object.entries(xobjects)) page.node.setXObject(PDFName.of(k), v);
    for (const [k, v] of Object.entries(states)) page.node.setExtGState(PDFName.of(k), v);
    page.node.normalizedEntries().Resources.set(PDFName.of('Properties'), ctx.obj(props));

    // Text: the title, the layers, the view, the scale bar's labels.
    const text = (t: string, x: number, y: number, size: number, f: PDFFont = font) => page.drawText(encodable(f, t), { x: x * PT, y: y * PT, size, font: f });
    const top = lay.h - MARGIN - 4;
    const pageNote = pageSets.length > 1 ? `Page ${p + 1} of ${pageSets.length}` : '';
    const right = [`1:1, mm`, mirrored ? 'seen from the bottom (mirrored)' : 'seen from the top', pageNote].filter(Boolean).join(' · ');
    const rightW = font.widthOfTextAtSize(encodable(font, right), 8) / PT;
    text(right, lay.w - MARGIN - rightW, top + 0.5, 8);
    const titleWidth = (lay.w - 2 * MARGIN - rightW - 5) * PT;
    const [title] = wrap(bold, 11, encodable(bold, o.title), titleWidth, 1);
    text(title, MARGIN, top, 11, bold);
    const names = set.map((l) => `${layerTitle(l.layer)}${l.highlighted ? ' (highlighted)' : ''}${l.layer.name && l.layer.name !== layerTitle(l.layer) ? ` – ${l.layer.name}` : ''}`);
    const unique = names.filter((name, i) => names.indexOf(name) === i);
    const lines = wrap(font, 7.5, encodable(font, `${unique.join(', ')}${o.note ? ` · ${o.note}` : ''}`), (lay.w - 2 * MARGIN) * PT, 2);
    lines.forEach((line, i) => text(line, MARGIN, top - 4.2 - i * 3.3, 7.5));
    text('0', x0 - 0.6, y0 + 3.4, 6.5);
    const end = `${len} mm`;
    text(end, x0 + len - font.widthOfTextAtSize(end, 6.5) / PT / 2, y0 + 3.4, 6.5);
    text(`Scale 1:1: this bar is ${len} mm long. Print at actual size (100 %), not fitted to the page.`, x0, y0 - 4, 6.5);
    if (!lay.fits) {
      const warn = 'The board does not fit on this page at 1:1 and is cut off at the edges.';
      text(warn, lay.w - MARGIN - font.widthOfTextAtSize(warn, 6.5) / PT, y0 - 4, 6.5);
    }
    await progress.tick(1);
  }
  // The layers as optional content, all shown.
  const refs = [...ocgs.values()];
  if (refs.length) doc.catalog.set(PDFName.of('OCProperties'), ctx.obj({ OCGs: refs, D: { Order: refs, ON: refs, OFF: [] } }));
  const bytes = await doc.save({ useObjectStreams: false });
  o.onProgress?.(1);
  return new Blob([bytes as BlobPart], { type: 'application/pdf' });
}

// A form for an aperture, in aperture coordinates: solid parts filled together (non-zero), plain holes as reversed
// paths, and other clear parts worked out with booleans. Null for an empty aperture.
async function apertureForm(ctx: PDFDocument['context'], ap: Aperture | undefined): Promise<PDFRef | null> {
  if (!ap) return null;
  const cls = classify(ap);
  if (cls === 'empty') return null;
  let content: string;
  if (cls === 'separate') {
    const polys = await flattenAperture(ap, FLATTEN_TOLERANCE / 4);
    if (!polys.length) return null;
    content = `${polygonsPath(polys)}f*\n`;
  } else {
    content = ap.parts.map((p) => {
      if (p.circle) return circlePath(p.circle.c, p.circle.r, p.dark);
      const pts = p.poly ?? [];
      return ringPath(p.dark ? pts : pts.slice().reverse());
    }).join('');
    content += 'f\n';
  }
  const b = apertureBox(ap);
  return ctx.register(ctx.stream(encoder.encode(content), {
    Type: 'XObject', Subtype: 'Form', BBox: [b.minX - 0.01, b.minY - 0.01, b.maxX + 0.01, b.maxY + 0.01],
  }));
}

// Which of the layers will be flattened (they have clear items).
export function flattenedLayers(layers: Layer[]): Layer[] {
  return layers.filter(hasClearItems);
}
