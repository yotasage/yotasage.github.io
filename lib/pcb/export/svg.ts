// SVG export of the PCB viewer, in millimetres at 1:1 (width and height in mm), seen from the top or the bottom:
// - the layer view: every shown layer as a group (an Inkscape layer) in its colour and opacity; a layer with clear
//   items (or a negative image) is a rectangle in its colour seen through a mask, where dark items are white and
//   clear ones black, in their order;
// - the realistic view: the board shape, mask, copper, finish and silkscreen put together with masks made of the
//   layers, and holes cut through.
// Flashes are <use> of the aperture shapes; apertures whose clear parts are not plain holes get a mask of their own.
// The file is written in parts into a Blob, with pauses (and progress) on large boards, and is plain XML: text is
// escaped and characters that XML does not allow are left out.
import { apertureBox, DEG, flashMatrix, segArc } from '../geometry';
import { layerTitle } from '../identify';
import { Aperture, ArtItem, Box, Contour, Layer, Pt } from '../model';
import { RealisticColors } from '../render/paint';
import { classify } from '../render/prepare';
import { SideLayers } from '../render/view';
import { Cancelled } from './png';

const SLICE_MS = 30;
// Subpaths per <path>, to keep each element a reasonable size.
const PATH_CHUNK = 2000;

// Characters XML 1.0 does not allow, also lone surrogates.
const INVALID_XML = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

export function xmlText(s: string): string {
  return s.replace(INVALID_XML, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function n(v: number): string {
  const r = Math.round(v * 1e4) / 1e4;
  return Object.is(r, -0) || !Number.isFinite(r) ? '0' : String(r);
}

// A colour as CSS writes it (#rgb, #rrggbb, rgb()…); anything else becomes grey.
function safeColor(color: string): string {
  return /^(#[0-9a-f]{3,8}|rgba?\([\d.,\s%]+\))$/i.test(color) ? color : '#808080';
}

export interface SvgLayer {
  layer: Layer;
  color: string;
  opacity: number;
  // The highlighted part of a layer (drawn after all the layers, which are dimmed).
  highlighted?: boolean;
}

export interface SvgOptions {
  title: string;
  // Seen from the bottom: mirrored in X.
  flipped: boolean;
  // The area of the image, in board millimetres.
  box: Box;
  background: string | null;
  // The layer view: shown layers in drawing order (the first is at the bottom).
  layers?: SvgLayer[];
  // The realistic view of one side, perhaps darkened (dim, 0 to 1) under a highlight: highlighted copper and
  // silkscreen in their colours, with the holes cut through.
  realistic?: { side: SideLayers; colors: RealisticColors; outline: Contour[]; dim?: number; highlight?: { layer: Layer; color: string }[] };
  onProgress?: (done: number) => void;
  signal?: AbortSignal;
}

class Writer {
  parts: string[] = [];
  private buffer: string[] = [];
  private size = 0;
  private sliceStart = performance.now();
  done = 0;

  constructor(private total: number, private o: SvgOptions) {}

  w(s: string) {
    this.buffer.push(s);
    this.size += s.length;
    if (this.size > 1 << 20) this.flush();
  }

  flush() {
    if (this.buffer.length) this.parts.push(this.buffer.join(''));
    this.buffer = [];
    this.size = 0;
  }

  async tick(items: number) {
    this.done += items;
    if (performance.now() - this.sliceStart < SLICE_MS) return;
    this.o.onProgress?.(this.total ? Math.min(1, this.done / this.total) : 1);
    await new Promise((resolve) => setTimeout(resolve, 0));
    if (this.o.signal?.aborted) throw new Cancelled();
    this.sliceStart = performance.now();
  }
}

// Board millimetres to SVG coordinates: Y down, X mirrored when seen from the bottom.
class Coords {
  constructor(readonly flipped: boolean) {}

  x(p: Pt): string {
    return n(this.flipped ? -p.x : p.x);
  }

  y(p: Pt): string {
    return n(-p.y);
  }

  xy(p: Pt): string {
    return `${this.x(p)} ${this.y(p)}`;
  }

  // The SVG sweep flag of a board arc: Y is negated, which turns a direction around, unless X is negated too.
  sweep(ccw: boolean): string {
    return ccw === this.flipped ? '1' : '0';
  }

  box(b: Box): { x: number; y: number; w: number; h: number } {
    const x = this.flipped ? -b.maxX : b.minX;
    return { x, y: -b.maxY, w: b.maxX - b.minX, h: b.maxY - b.minY };
  }
}

function arcTo(c: Coords, center: Pt, r: number, start: number, sweep: number): string {
  // A full circle is two half circles; any other arc one command.
  const at = (deg: number) => ({ x: center.x + r * Math.cos(deg * DEG), y: center.y + r * Math.sin(deg * DEG) });
  const s = c.sweep(sweep > 0);
  if (Math.abs(sweep) >= 360 - 1e-9) {
    const mid = at(start + sweep / 2);
    const end = at(start + sweep);
    return `A${n(r)} ${n(r)} 0 1 ${s} ${c.xy(mid)}A${n(r)} ${n(r)} 0 1 ${s} ${c.xy(end)}`;
  }
  const large = Math.abs(sweep) > 180 ? 1 : 0;
  return `A${n(r)} ${n(r)} 0 ${large} ${s} ${c.xy(at(start + sweep))}`;
}

function contourD(c: Coords, contour: Contour): string {
  let d = `M${c.xy(contour.start)}`;
  let from = contour.start;
  for (const seg of contour.segs) {
    if (seg.arc) {
      const { start, sweep } = segArc(from, seg);
      d += arcTo(c, seg.arc.c, Math.hypot(from.x - seg.arc.c.x, from.y - seg.arc.c.y), start, sweep);
    } else {
      d += `L${c.xy(seg.to)}`;
    }
    from = seg.to;
  }
  return `${d}Z`;
}

function circleD(c: Coords, p: Pt, r: number): string {
  return `M${c.xy({ x: p.x + r, y: p.y })}${arcTo(c, p, r, 0, 360)}Z`;
}

// An aperture's parts as paths in aperture coordinates (the <use> transform maps them to SVG coordinates).
function partD(part: Aperture['parts'][number]): string {
  if (part.circle) {
    const { c, r } = part.circle;
    return `M${n(c.x + r)} ${n(c.y)}A${n(r)} ${n(r)} 0 1 1 ${n(c.x - r)} ${n(c.y)}A${n(r)} ${n(r)} 0 1 1 ${n(c.x + r)} ${n(c.y)}Z`;
  }
  if (part.poly?.length) return `M${part.poly.map((p) => `${n(p.x)} ${n(p.y)}`).join('L')}Z`;
  return '';
}

// Aperture definitions of a layer, each written once: <path id> for apertures without clear parts or with plain
// holes (outline and reversed holes, non-zero), and a masked path for the others.
function apertureDefs(w: Writer, layer: Layer, prefix: string, used: Set<number>) {
  for (const i of used) {
    const ap = layer.apertures[i];
    const cls = classify(ap);
    if (cls === 'empty') continue;
    const id = `${prefix}a${i}`;
    if (cls === 'solid') {
      w.w(`<path id="${id}" stroke="none" d="${ap.parts.map(partD).join('')}"/>`);
    } else if (cls === 'holed') {
      // The outline counter-clockwise, the holes clockwise: a path that is reversed in the drawing.
      const [outer, ...holes] = ap.parts;
      const holesD = holes.map((h) => {
        if (h.circle) {
          const { c, r } = h.circle;
          return `M${n(c.x + r)} ${n(c.y)}A${n(r)} ${n(r)} 0 1 0 ${n(c.x - r)} ${n(c.y)}A${n(r)} ${n(r)} 0 1 0 ${n(c.x + r)} ${n(c.y)}Z`;
        }
        return h.poly?.length ? `M${h.poly.slice().reverse().map((p) => `${n(p.x)} ${n(p.y)}`).join('L')}Z` : '';
      });
      w.w(`<path id="${id}" stroke="none" d="${partD(outer)}${holesD.join('')}"/>`);
    } else {
      const b = apertureBox(ap);
      const pad = 0.01;
      w.w(`<mask id="${id}m" maskUnits="userSpaceOnUse" x="${n(b.minX - pad)}" y="${n(b.minY - pad)}" width="${n(b.maxX - b.minX + 2 * pad)}" height="${n(b.maxY - b.minY + 2 * pad)}">`);
      for (const part of ap.parts) w.w(`<path stroke="none" fill="${part.dark ? '#fff' : '#000'}" d="${partD(part)}"/>`);
      w.w(`</mask><path id="${id}" stroke="none" mask="url(#${id}m)" d="${ap.parts.filter((p) => p.dark).map(partD).join('')}"/>`);
    }
  }
}

function usedApertures(layer: Layer): Set<number> {
  const used = new Set<number>();
  for (const item of layer.items) if (item.k === 'flash') used.add(item.ap);
  return used;
}

// The items of a layer, in runs of the same polarity: each run in `dark` and `clear` paint. Within a run, filled
// shapes go into paths, lines and arcs into stroked paths by width and cap, and flashes into <use> elements.
async function writeItems(w: Writer, c: Coords, layer: Layer, prefix: string, dark: string, clear: string) {
  const items = layer.items;
  let i = 0;
  while (i < items.length) {
    const polarity = items[i].dark;
    let end = i;
    while (end < items.length && items[end].dark === polarity) end += 1;
    const paint = polarity ? dark : clear;
    w.w(`<g fill="${paint}" stroke="${paint}" stroke-linejoin="round">`);
    await writeRun(w, c, layer, items, i, end, prefix);
    w.w('</g>');
    i = end;
  }
}

async function writeRun(w: Writer, c: Coords, layer: Layer, items: ArtItem[], from: number, to: number, prefix: string) {
  let fill: string[] = [];
  const strokes = new Map<string, string[]>();
  const flushFill = () => {
    if (fill.length) w.w(`<path stroke="none" d="${fill.join('')}"/>`);
    fill = [];
  };
  const stroke = (width: number, cap: string, d: string) => {
    const key = `${n(width)}|${cap}`;
    let list = strokes.get(key);
    if (!list) strokes.set(key, (list = []));
    list.push(d);
    if (list.length >= PATH_CHUNK) {
      w.w(`<path fill="none" stroke-width="${n(width)}" stroke-linecap="${cap}" d="${list.join('')}"/>`);
      list.length = 0;
    }
  };
  for (let k = from; k < to; k += 1) {
    const item = items[k];
    switch (item.k) {
      case 'line': {
        if (!(item.w > 0)) break;
        if (item.a.x === item.b.x && item.a.y === item.b.y) {
          // A dot.
          if (item.cap === 'round') fill.push(circleD(c, item.a, item.w / 2));
          else {
            const h = item.w / 2;
            fill.push(contourD(c, { start: { x: item.a.x - h, y: item.a.y - h }, segs: [{ to: { x: item.a.x + h, y: item.a.y - h } }, { to: { x: item.a.x + h, y: item.a.y + h } }, { to: { x: item.a.x - h, y: item.a.y + h } }] }));
          }
          break;
        }
        stroke(item.w, item.cap, `M${c.xy(item.a)}L${c.xy(item.b)}`);
        break;
      }
      case 'arc': {
        if (!(item.w > 0) || !(item.r > 0)) break;
        const start = { x: item.c.x + item.r * Math.cos(item.start * DEG), y: item.c.y + item.r * Math.sin(item.start * DEG) };
        stroke(item.w, 'round', `M${c.xy(start)}${arcTo(c, item.c, item.r, item.start, item.sweep)}`);
        break;
      }
      case 'flash': {
        const ap = layer.apertures[item.ap];
        if (!ap || !ap.parts.length) break;
        const m = flashMatrix(item.at, item.rot, item.mirror, item.scale);
        const sx = c.flipped ? -1 : 1;
        w.w(`<use xlink:href="#${prefix}a${item.ap}" transform="matrix(${n(sx * m.a)} ${n(-m.b)} ${n(sx * m.c)} ${n(-m.d)} ${n(sx * m.e)} ${n(-m.f)})"/>`);
        break;
      }
      case 'region':
        fill.push(item.contours.map((ct) => contourD(c, ct)).join(''));
        break;
      case 'hole':
        if (item.to && (item.to.x !== item.at.x || item.to.y !== item.at.y)) stroke(item.d, 'round', `M${c.xy(item.at)}L${c.xy(item.to)}`);
        else fill.push(circleD(c, item.at, item.d / 2));
        break;
    }
    if (fill.length >= PATH_CHUNK) flushFill();
    if ((k - from) % 2000 === 1999) await w.tick(2000);
  }
  flushFill();
  for (const [key, list] of strokes) {
    if (!list.length) continue;
    const [width, cap] = key.split('|');
    w.w(`<path fill="none" stroke-width="${width}" stroke-linecap="${cap}" d="${list.join('')}"/>`);
  }
  await w.tick((to - from) % 2000);
}

function hasClear(layer: Layer): boolean {
  return Boolean(layer.negative) || layer.items.some((i) => !i.dark);
}

// A layer's coverage as a mask: white where it is dark, black where clear items erase it.
async function coverageMask(w: Writer, c: Coords, layer: Layer, id: string, prefix: string, area: { x: number; y: number; w: number; h: number }) {
  w.w(`<mask id="${id}" maskUnits="userSpaceOnUse" x="${n(area.x)}" y="${n(area.y)}" width="${n(area.w)}" height="${n(area.h)}">`);
  if (layer.negative) {
    const b = c.box(layer.bbox);
    w.w(`<rect x="${n(b.x)}" y="${n(b.y)}" width="${n(b.w)}" height="${n(b.h)}" fill="#fff"/>`);
  }
  await writeItems(w, c, layer, prefix, '#fff', '#000');
  w.w('</mask>');
}

export async function exportSvg(o: SvgOptions): Promise<Blob> {
  const c = new Coords(o.flipped);
  const margin = 0;
  const area = c.box({ minX: o.box.minX - margin, minY: o.box.minY - margin, maxX: o.box.maxX + margin, maxY: o.box.maxY + margin });
  const lit = o.realistic?.highlight ?? [];
  const layers = o.layers?.map((l) => l.layer)
    ?? (o.realistic ? [...o.realistic.side.copper, ...o.realistic.side.mask, ...o.realistic.side.silk, ...o.realistic.side.holes, ...lit.map((h) => h.layer)] : []);
  const total = layers.reduce((sum, l) => sum + l.items.length, 0);
  const w = new Writer(total, o);
  w.w('<?xml version="1.0" encoding="UTF-8"?>\n');
  w.w(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" version="1.1" width="${n(area.w)}mm" height="${n(area.h)}mm" viewBox="${n(area.x)} ${n(area.y)} ${n(area.w)} ${n(area.h)}">\n`);
  w.w(`<title>${xmlText(o.title)}</title>\n`);
  if (o.background) w.w(`<rect x="${n(area.x)}" y="${n(area.y)}" width="${n(area.w)}" height="${n(area.h)}" fill="${safeColor(o.background)}"/>\n`);
  // Apertures of each layer, defined once.
  w.w('<defs>');
  layers.forEach((l, i) => apertureDefs(w, l, `l${i}`, usedApertures(l)));
  w.w('</defs>\n');
  const prefixOf = (l: Layer) => `l${layers.indexOf(l)}`;

  if (o.layers) {
    for (const { layer, color: raw, opacity, highlighted } of o.layers) {
      const color = safeColor(raw);
      const prefix = prefixOf(layer);
      const label = xmlText(`${layerTitle(layer)} (${layer.name})${highlighted ? ', highlighted' : ''}`);
      w.w(`<g id="${prefix}" inkscape:groupmode="layer" inkscape:label="${label}" opacity="${n(opacity)}">`);
      if (hasClear(layer)) {
        const b = layer.negative ? c.box(layer.bbox) : area;
        await coverageMask(w, c, layer, `${prefix}m`, prefix, area);
        w.w(`<rect x="${n(b.x)}" y="${n(b.y)}" width="${n(b.w)}" height="${n(b.h)}" fill="${color}" mask="url(#${prefix}m)"/>`);
      } else {
        await writeItems(w, c, layer, prefix, color, color);
      }
      w.w('</g>\n');
    }
  } else if (o.realistic) {
    const { side, colors, outline } = o.realistic;
    const rect = (fill: string, mask?: string) => `<rect x="${n(area.x)}" y="${n(area.y)}" width="${n(area.w)}" height="${n(area.h)}" fill="${safeColor(fill)}"${mask ? ` mask="url(#${mask})"` : ''}/>`;
    const shapeD = outline.map((ct) => contourD(c, ct)).join('');
    // One mask per role, the union of its layers; holes are cut out of the board mask.
    w.w('<defs>');
    const roleMask = async (id: string, ls: Layer[]) => {
      // Clear items erase only their own layer: such a layer gets a mask of its own, used by a white rectangle.
      for (const l of ls) if (hasClear(l)) await coverageMask(w, c, l, `${prefixOf(l)}m`, prefixOf(l), area);
      w.w(`<mask id="${id}" maskUnits="userSpaceOnUse" x="${n(area.x)}" y="${n(area.y)}" width="${n(area.w)}" height="${n(area.h)}">`);
      for (const l of ls) {
        if (hasClear(l)) w.w(rect('#fff', `${prefixOf(l)}m`));
        else await writeItems(w, c, l, prefixOf(l), '#fff', '#fff');
      }
      w.w('</mask>');
    };
    const hasMask = side.mask.length > 0;
    await roleMask('copper', side.copper);
    await roleMask('silk', side.silk);
    if (hasMask) {
      await roleMask('openings', side.mask);
      // Where the mask is: everything but the openings.
      w.w(`<mask id="covered" maskUnits="userSpaceOnUse" x="${n(area.x)}" y="${n(area.y)}" width="${n(area.w)}" height="${n(area.h)}">${rect('#fff')}${rect('#000', 'openings')}</mask>`);
    }
    w.w(`<mask id="board" maskUnits="userSpaceOnUse" x="${n(area.x)}" y="${n(area.y)}" width="${n(area.w)}" height="${n(area.h)}"><path fill="#fff" d="${shapeD}"/>`);
    for (const l of side.holes) await writeItems(w, c, l, prefixOf(l), '#000', '#000');
    w.w('</mask></defs>\n');
    w.w('<g id="board-view" mask="url(#board)">');
    w.w(`<path fill="${safeColor(hasMask ? colors.maskSubstrate : colors.substrate)}" d="${shapeD}"/>`);
    if (hasMask) {
      w.w(rect(colors.substrate, 'openings'));
      w.w(`<g mask="url(#covered)">${rect(colors.maskCopper, 'copper')}</g>`);
      w.w(`<g mask="url(#openings)">${rect(colors.finish, 'copper')}</g>`);
      w.w(`<g mask="url(#covered)">${rect(colors.silk, 'silk')}</g>`);
    } else {
      w.w(rect(colors.finish, 'copper'));
      w.w(rect(colors.silk, 'silk'));
    }
    w.w('</g>\n');
    if (o.realistic.dim) w.w(`<path id="dimmed" fill="#000" fill-opacity="${n(o.realistic.dim)}" d="${shapeD}" mask="url(#board)"/>\n`);
    if (lit.length) {
      w.w('<g id="highlight" inkscape:groupmode="layer" inkscape:label="Highlight" mask="url(#board)">');
      for (const { layer, color: raw } of lit) {
        const color = safeColor(raw);
        if (hasClear(layer)) {
          await coverageMask(w, c, layer, `${prefixOf(layer)}m`, prefixOf(layer), area);
          w.w(rect(color, `${prefixOf(layer)}m`));
        } else {
          await writeItems(w, c, layer, prefixOf(layer), color, color);
        }
      }
      w.w('</g>\n');
    }
  }
  w.w('</svg>\n');
  w.flush();
  o.onProgress?.(1);
  return new Blob(w.parts, { type: 'image/svg+xml' });
}
