// DXF export of the PCB viewer (ASCII, AutoCAD 2004 format, millimetres: $INSUNITS 4), in two kinds:
// - the board outline and holes, for mechanical CAD: the board shape as closed polylines (arcs as bulges) on the layer
//   "Board outline", and the holes as circles (slots as closed polylines) on "Plated holes" and "Non-plated holes";
// - the shown layers, each on a DXF layer named after it in its colour: lines as polylines with their width (square
//   ends drawn by lengthening them), arcs as arc segments of polylines with their width, regions, flashes and dots as
//   closed polylines with bulges for their arcs, holes as circles. Layers with clear items are flattened with polygon
//   booleans (flatten.ts) and written as the closed outlines of what remains.
// Positions are board millimetres from a chosen origin, Y up (as DXF). The file has the tables, blocks and objects
// that AutoCAD expects of a 2004 file (handles, owners, the model and paper space layouts); layers carry their colour
// as a true colour and as the nearest AutoCAD colour index.
import { DEG, flashMatrix, segArc } from '../geometry';
import { layerTitle } from '../identify';
import { Aperture, Box, Contour, emptyBox, isEmptyBox, Layer, Pt } from '../model';
import { classify } from '../render/prepare';
import { flattenAperture, flattenLayer, hasClearItems, Polygon } from './flatten';
import { Cancelled } from './png';

export interface DxfLayer {
  layer: Layer;
  color: string;
}

export interface DxfOptions {
  // 'outline': the board shape and the holes; 'layers': the layers given.
  kind: 'outline' | 'layers';
  // The board shape (outer edges counter-clockwise, cutouts clockwise) and the drill layers, for 'outline', with the
  // smallest hole written (Infinity: none).
  outline?: Contour[];
  drills?: Layer[];
  minHole?: number;
  // For 'layers', from the top of the layer list down.
  layers?: DxfLayer[];
  // Subtracted from every position (the origin of the drawing on the board).
  origin: Pt;
  onProgress?: (done: number) => void;
  signal?: AbortSignal;
}

// The chords that stand in for the arcs of flattened layers stay this close to the arc (mm).
export const DXF_TOLERANCE = 0.0025;
const SLICE_MS = 30;

// DXF layer names may not hold these characters. A 2004 file is in a Windows code page, so characters other than ASCII
// are written as \U+XXXX (dashes as hyphens).
export function dxfLayerName(name: string): string {
  const clean = name.replace(/[<>/\\":;?*|=,`\u0000-\u001f]/g, '_').replace(/[‐-―]/g, '-').replace(/\s+/g, ' ').trim();
  const ascii = [...(clean || 'Layer')].map((ch) => {
    const c = ch.codePointAt(0);
    return c < 128 ? ch : c <= 0xffff ? `\\U+${c.toString(16).toUpperCase().padStart(4, '0')}` : '_';
  }).join('');
  return ascii.slice(0, 255);
}

function num(v: number): string {
  const r = Math.round(v * 1e6) / 1e6;
  return Object.is(r, -0) || !Number.isFinite(r) ? '0' : String(r);
}

// The AutoCAD colour index nearest to a colour (from the standard colours 1–9 and the greys), for programs that do not
// read true colours.
const ACI: [number, number, number, number][] = [
  [1, 255, 0, 0], [2, 255, 255, 0], [3, 0, 255, 0], [4, 0, 255, 255], [5, 0, 0, 255], [6, 255, 0, 255], [7, 255, 255, 255],
  [8, 128, 128, 128], [9, 192, 192, 192], [30, 255, 127, 0], [40, 255, 191, 0], [140, 0, 127, 255], [210, 255, 0, 191],
  [250, 51, 51, 51], [251, 80, 80, 80], [252, 105, 105, 105], [253, 130, 130, 130], [254, 190, 190, 190],
];

function rgbOf(color: string): [number, number, number] {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim());
  if (!m) return [128, 128, 128];
  const hex = m[1].length === 3 ? m[1].split('').map((c) => c + c).join('') : m[1];
  return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
}

function aciOf(rgb: [number, number, number]): number {
  let best = 7;
  let bestD = Infinity;
  for (const [i, r, g, b] of ACI) {
    const d = (r - rgb[0]) ** 2 + (g - rgb[1]) ** 2 + (b - rgb[2]) ** 2;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

// A vertex of a polyline, with the bulge of the segment that starts at it (tan of a quarter of its angle,
// positive counter-clockwise).
interface Vertex {
  x: number;
  y: number;
  bulge?: number;
}

class Writer {
  private parts: string[] = [];
  private buffer: string[] = [];
  private size = 0;
  private handle = 0x400;
  private slice = performance.now();
  done = 0;

  constructor(private total: number, private o: DxfOptions) {}

  // A group: its code (right-aligned in three columns, as AutoCAD writes them) and value.
  g(code: number, value: string | number) {
    const c = String(code);
    const line = `${c.length < 3 ? ' '.repeat(3 - c.length) + c : c}\r\n${value}\r\n`;
    this.buffer.push(line);
    this.size += line.length;
    if (this.size > 1 << 20) this.flush();
  }

  nextHandle(): string {
    this.handle += 1;
    return this.handle.toString(16).toUpperCase();
  }

  get seed(): string {
    return (this.handle + 1).toString(16).toUpperCase();
  }

  flush() {
    if (this.buffer.length) this.parts.push(this.buffer.join(''));
    this.buffer = [];
    this.size = 0;
  }

  take(): string[] {
    this.flush();
    const out = this.parts;
    this.parts = [];
    return out;
  }

  async tick(items: number) {
    this.done += items;
    if (performance.now() - this.slice < SLICE_MS) return;
    this.o.onProgress?.(this.total ? Math.min(0.99, this.done / this.total) : 0.5);
    await new Promise((resolve) => setTimeout(resolve, 0));
    if (this.o.signal?.aborted) throw new Cancelled();
    this.slice = performance.now();
  }
}

// --- Entities ---

const MODEL_SPACE = '1F';

class Entities {
  constructor(private w: Writer, readonly origin: Pt) {}

  private head(type: string, layer: string) {
    const w = this.w;
    w.g(0, type);
    w.g(5, w.nextHandle());
    w.g(330, MODEL_SPACE);
    w.g(100, 'AcDbEntity');
    w.g(8, layer);
  }

  polyline(layer: string, pts: Vertex[], closed: boolean, width = 0) {
    if (pts.length < 2) return;
    const w = this.w;
    this.head('LWPOLYLINE', layer);
    w.g(100, 'AcDbPolyline');
    w.g(90, pts.length);
    w.g(70, closed ? 1 : 0);
    w.g(43, num(width));
    for (const p of pts) {
      w.g(10, num(p.x - this.origin.x));
      w.g(20, num(p.y - this.origin.y));
      if (p.bulge) w.g(42, num(p.bulge));
    }
  }

  circle(layer: string, c: Pt, r: number) {
    const w = this.w;
    this.head('CIRCLE', layer);
    w.g(100, 'AcDbCircle');
    w.g(10, num(c.x - this.origin.x));
    w.g(20, num(c.y - this.origin.y));
    w.g(30, 0);
    w.g(40, num(r));
  }

  // A circle as a closed polyline of two half circles (it can have a width).
  circleLine(layer: string, c: Pt, r: number, width = 0) {
    this.polyline(layer, [{ x: c.x + r, y: c.y, bulge: 1 }, { x: c.x - r, y: c.y, bulge: 1 }], true, width);
  }

  // A slot: a stroke with round ends from a to b, as its closed outline.
  slot(layer: string, a: Pt, b: Pt, d: number) {
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < 1e-9) {
      this.circle(layer, a, d / 2);
      return;
    }
    const nx = (-(b.y - a.y) / len) * (d / 2);
    const ny = ((b.x - a.x) / len) * (d / 2);
    this.polyline(layer, [
      { x: a.x - nx, y: a.y - ny }, { x: b.x - nx, y: b.y - ny, bulge: 1 }, { x: b.x + nx, y: b.y + ny }, { x: a.x + nx, y: a.y + ny, bulge: 1 },
    ], true);
  }

  contour(layer: string, contour: Contour) {
    this.polyline(layer, contourVertices(contour), true);
  }

  polygons(layer: string, polys: Polygon[]) {
    for (const p of polys) {
      this.polyline(layer, p.outer, true);
      for (const h of p.holes) this.polyline(layer, h, true);
    }
  }
}

// The vertices of a contour with bulges for its arcs; a full circle is split into two halves.
function contourVertices(contour: Contour): Vertex[] {
  const out: Vertex[] = [];
  let from = contour.start;
  for (const seg of contour.segs) {
    const v: Vertex = { x: from.x, y: from.y };
    if (seg.arc) {
      const { start, sweep } = segArc(from, seg);
      if (Math.abs(sweep) >= 359.999) {
        const r = Math.hypot(from.x - seg.arc.c.x, from.y - seg.arc.c.y);
        const mid = { x: seg.arc.c.x + r * Math.cos((start + sweep / 2) * DEG), y: seg.arc.c.y + r * Math.sin((start + sweep / 2) * DEG) };
        const b = Math.tan((sweep / 2 / 4) * DEG);
        out.push({ ...v, bulge: b }, { x: mid.x, y: mid.y, bulge: b });
        from = seg.to;
        continue;
      }
      v.bulge = Math.tan((sweep / 4) * DEG);
    }
    out.push(v);
    from = seg.to;
  }
  // The last segment ends where the contour starts, which the closed polyline joins by itself.
  const last = out[out.length - 1];
  if (out.length > 1 && last && Math.abs(last.x - contour.start.x) < 1e-9 && Math.abs(last.y - contour.start.y) < 1e-9 && !last.bulge) out.pop();
  return out;
}

// The parts of an aperture as closed outlines in aperture coordinates: circles by centre and radius, polygons by
// their corners; apertures whose clear parts are not plain holes as flattened polygons.
type Outline = { circle: { c: Pt; r: number } } | { ring: Pt[] };

const apertureOutlines = new WeakMap<Aperture, Outline[]>();

async function outlinesOf(ap: Aperture): Promise<Outline[]> {
  let list = apertureOutlines.get(ap);
  if (list) return list;
  if (classify(ap) === 'separate') {
    const polys = await flattenAperture(ap, DXF_TOLERANCE / 4);
    list = polys.flatMap((p) => [p.outer, ...p.holes]).map((ring) => ({ ring }));
  } else {
    list = ap.parts.map((p): Outline => (p.circle ? { circle: p.circle } : { ring: p.poly ?? [] }));
  }
  apertureOutlines.set(ap, list);
  return list;
}

// The items of a layer without clear items.
async function layerEntities(e: Entities, w: Writer, name: string, layer: Layer) {
  // Lines of the same width that continue each other become one polyline.
  let run: Vertex[] = [];
  let runW = 0;
  const flush = () => {
    if (run.length > 1) e.polyline(name, run, false, runW);
    run = [];
  };
  const items = layer.items;
  for (let k = 0; k < items.length; k += 1) {
    const item = items[k];
    if (item.k !== 'line') flush();
    switch (item.k) {
      case 'line': {
        if (!(item.w > 0)) break;
        let a = item.a;
        let b = item.b;
        if (a.x === b.x && a.y === b.y) {
          flush();
          e.circleLine(name, a, item.w / 2);
          break;
        }
        if (item.cap === 'square') {
          // Square ends reach half the width past the ends.
          const len = Math.hypot(b.x - a.x, b.y - a.y);
          const ux = ((b.x - a.x) / len) * (item.w / 2);
          const uy = ((b.y - a.y) / len) * (item.w / 2);
          a = { x: a.x - ux, y: a.y - uy };
          b = { x: b.x + ux, y: b.y + uy };
          flush();
          e.polyline(name, [a, b], false, item.w);
          break;
        }
        const last = run[run.length - 1];
        if (run.length && runW === item.w && last.x === a.x && last.y === a.y) run.push({ x: b.x, y: b.y });
        else {
          flush();
          run = [{ x: a.x, y: a.y }, { x: b.x, y: b.y }];
          runW = item.w;
        }
        break;
      }
      case 'arc': {
        if (!(item.w > 0) || !(item.r > 0)) break;
        if (Math.abs(item.sweep) >= 359.999) {
          e.circleLine(name, item.c, item.r, item.w);
          break;
        }
        const p = (deg: number) => ({ x: item.c.x + item.r * Math.cos(deg * DEG), y: item.c.y + item.r * Math.sin(deg * DEG) });
        // A polyline bulge covers less than a full turn; arcs over a half turn are split.
        const parts = Math.abs(item.sweep) > 180 ? 2 : 1;
        const step = item.sweep / parts;
        const pts: Vertex[] = [];
        for (let i = 0; i < parts; i += 1) pts.push({ ...p(item.start + i * step), bulge: Math.tan((step / 4) * DEG) });
        pts.push(p(item.start + item.sweep));
        e.polyline(name, pts, false, item.w);
        break;
      }
      case 'flash': {
        const ap = layer.apertures[item.ap];
        if (!ap) break;
        const m = flashMatrix(item.at, item.rot, item.mirror, item.scale);
        const map = (q: Pt) => ({ x: m.a * q.x + m.c * q.y + m.e, y: m.b * q.x + m.d * q.y + m.f });
        for (const o of await outlinesOf(ap)) {
          if ('circle' in o) e.circleLine(name, map(o.circle.c), o.circle.r * item.scale);
          else if (o.ring.length >= 3) e.polyline(name, o.ring.map(map), true);
        }
        break;
      }
      case 'region':
        for (const c of item.contours) e.contour(name, c);
        break;
      case 'hole':
        if (item.to && (item.to.x !== item.at.x || item.to.y !== item.at.y)) e.slot(name, item.at, item.to, item.d);
        else if (item.d > 0) e.circle(name, item.at, item.d / 2);
        break;
    }
    if (k % 2000 === 1999) await w.tick(2000);
  }
  flush();
  await w.tick(items.length % 2000);
}

// --- The file ---

interface TableLayer {
  name: string;
  color: string;
}

function header(w: Writer, extents: Box, seed: string) {
  w.g(0, 'SECTION');
  w.g(2, 'HEADER');
  w.g(9, '$ACADVER');
  w.g(1, 'AC1018');
  w.g(9, '$HANDSEED');
  w.g(5, seed);
  w.g(9, '$DWGCODEPAGE');
  w.g(3, 'ANSI_1252');
  w.g(9, '$INSUNITS');
  w.g(70, 4);
  w.g(9, '$MEASUREMENT');
  w.g(70, 1);
  w.g(9, '$LUNITS');
  w.g(70, 2);
  w.g(9, '$LUPREC');
  w.g(70, 4);
  w.g(9, '$EXTMIN');
  w.g(10, num(extents.minX));
  w.g(20, num(extents.minY));
  w.g(30, 0);
  w.g(9, '$EXTMAX');
  w.g(10, num(extents.maxX));
  w.g(20, num(extents.maxY));
  w.g(30, 0);
  w.g(0, 'ENDSEC');
  w.g(0, 'SECTION');
  w.g(2, 'CLASSES');
  w.g(0, 'ENDSEC');
}

function table(w: Writer, name: string, handle: string, count: number, entries: () => void, dimstyle = false) {
  w.g(0, 'TABLE');
  w.g(2, name);
  w.g(5, handle);
  w.g(330, 0);
  w.g(100, 'AcDbSymbolTable');
  w.g(70, count);
  if (dimstyle) w.g(100, 'AcDbDimStyleTable');
  entries();
  w.g(0, 'ENDTAB');
}

function record(w: Writer, type: string, handle: string, owner: string, subclass: string, name: string, handleCode = 5) {
  w.g(0, type);
  w.g(handleCode, handle);
  w.g(330, owner);
  w.g(100, 'AcDbSymbolTableRecord');
  w.g(100, subclass);
  w.g(2, name);
  w.g(70, 0);
}

// The tables (handles 1–26 are fixed, layers get handles from 30, entities from 401), the blocks of model and paper
// space.
function tables(w: Writer, layers: TableLayer[], extents: Box) {
  w.g(0, 'SECTION');
  w.g(2, 'TABLES');
  table(w, 'VPORT', '8', 1, () => {
    record(w, 'VPORT', '20', '8', 'AcDbViewportTableRecord', '*Active');
    const cx = (extents.minX + extents.maxX) / 2;
    const cy = (extents.minY + extents.maxY) / 2;
    const h = Math.max(extents.maxY - extents.minY, (extents.maxX - extents.minX) / 1.5, 1) * 1.1;
    for (const [c, v] of [[10, 0], [20, 0], [11, 1], [21, 1], [12, num(cx)], [22, num(cy)], [13, 0], [23, 0], [14, 1], [24, 1], [15, 1], [25, 1], [16, 0], [26, 0], [36, 1],
      [17, 0], [27, 0], [37, 0], [40, num(h)], [41, 1.5], [42, 50], [43, 0], [44, 0], [50, 0], [51, 0], [71, 0], [72, 1000], [73, 1], [74, 3], [75, 0], [76, 0], [77, 0], [78, 0]] as [number, string | number][]) {
      w.g(c, v);
    }
  });
  table(w, 'LTYPE', '2', 3, () => {
    for (const [h, name] of [['21', 'ByBlock'], ['22', 'ByLayer'], ['23', 'Continuous']]) {
      record(w, 'LTYPE', h, '2', 'AcDbLinetypeTableRecord', name);
      w.g(3, name === 'Continuous' ? 'Solid line' : '');
      w.g(72, 65);
      w.g(73, 0);
      w.g(40, 0);
    }
  });
  table(w, 'LAYER', '1', layers.length + 1, () => {
    const entry = (h: string, name: string, color: string) => {
      record(w, 'LAYER', h, '1', 'AcDbLayerTableRecord', name);
      const rgb = rgbOf(color);
      w.g(62, aciOf(rgb));
      w.g(420, (rgb[0] << 16) | (rgb[1] << 8) | rgb[2]);
      w.g(6, 'Continuous');
      w.g(370, -3);
    };
    entry('10', '0', '#ffffff');
    layers.forEach((l, i) => entry((0x30 + i).toString(16).toUpperCase(), l.name, l.color));
  });
  table(w, 'STYLE', '5', 1, () => {
    record(w, 'STYLE', '24', '5', 'AcDbTextStyleTableRecord', 'Standard');
    for (const [c, v] of [[40, 0], [41, 1], [50, 0], [71, 0], [42, 2.5], [3, 'txt'], [4, '']] as [number, string | number][]) w.g(c, v);
  });
  table(w, 'VIEW', '7', 0, () => {});
  table(w, 'UCS', '6', 0, () => {});
  table(w, 'APPID', '3', 1, () => record(w, 'APPID', '25', '3', 'AcDbRegAppTableRecord', 'ACAD'));
  table(w, 'DIMSTYLE', '4', 1, () => {
    record(w, 'DIMSTYLE', '26', '4', 'AcDbDimStyleTableRecord', 'Standard', 105);
    for (const [c, v] of [[3, ''], [4, ''], [40, 1], [41, 2.5], [42, 0.625], [43, 3.75], [44, 1.25], [140, 2.5], [141, 2.5], [143, 0.03937007874], [147, 0.625],
      [77, 1], [78, 8], [271, 2], [272, 2], [278, 44], [279, 0]] as [number, string | number][]) {
      w.g(c, v);
    }
  }, true);
  table(w, 'BLOCK_RECORD', '9', 2, () => {
    w.g(0, 'BLOCK_RECORD');
    w.g(5, MODEL_SPACE);
    w.g(330, '9');
    w.g(100, 'AcDbSymbolTableRecord');
    w.g(100, 'AcDbBlockTableRecord');
    w.g(2, '*Model_Space');
    w.g(340, '1A');
    w.g(0, 'BLOCK_RECORD');
    w.g(5, '1B');
    w.g(330, '9');
    w.g(100, 'AcDbSymbolTableRecord');
    w.g(100, 'AcDbBlockTableRecord');
    w.g(2, '*Paper_Space');
    w.g(340, '1E');
  });
  w.g(0, 'ENDSEC');
  w.g(0, 'SECTION');
  w.g(2, 'BLOCKS');
  for (const [begin, end, owner, name] of [['1C', '1D', MODEL_SPACE, '*Model_Space'], ['18', '19', '1B', '*Paper_Space']]) {
    w.g(0, 'BLOCK');
    w.g(5, begin);
    w.g(330, owner);
    w.g(100, 'AcDbEntity');
    w.g(8, '0');
    w.g(100, 'AcDbBlockBegin');
    w.g(2, name);
    w.g(70, 0);
    w.g(10, 0);
    w.g(20, 0);
    w.g(30, 0);
    w.g(3, name);
    w.g(1, '');
    w.g(0, 'ENDBLK');
    w.g(5, end);
    w.g(330, owner);
    w.g(100, 'AcDbEntity');
    w.g(8, '0');
    w.g(100, 'AcDbBlockEnd');
  }
  w.g(0, 'ENDSEC');
}

// The objects: the root dictionary with the groups and the layouts of model and paper space.
function objects(w: Writer) {
  w.g(0, 'SECTION');
  w.g(2, 'OBJECTS');
  const dict = (h: string, owner: string, entries: [string, string][]) => {
    w.g(0, 'DICTIONARY');
    w.g(5, h);
    w.g(330, owner);
    w.g(100, 'AcDbDictionary');
    w.g(281, 1);
    for (const [k, v] of entries) {
      w.g(3, k);
      w.g(350, v);
    }
  };
  dict('A', '0', [['ACAD_GROUP', 'B'], ['ACAD_LAYOUT', 'D']]);
  dict('B', 'A', []);
  dict('D', 'A', [['Model', '1A'], ['Layout1', '1E']]);
  for (const [h, name, tab, block] of [['1A', 'Model', 0, MODEL_SPACE], ['1E', 'Layout1', 1, '1B']] as [string, string, number, string][]) {
    w.g(0, 'LAYOUT');
    w.g(5, h);
    w.g(330, 'D');
    w.g(100, 'AcDbPlotSettings');
    for (const [c, v] of [[1, ''], [4, 'A3'], [6, ''], [40, 7.5], [41, 20], [42, 7.5], [43, 20], [44, 420], [45, 297], [46, 0], [47, 0], [48, 0], [49, 0], [140, 0], [141, 0],
      [142, 1], [143, 1], [70, tab ? 0 : 1024], [72, 1], [73, 0], [74, 5], [7, ''], [75, 16], [76, 0], [77, 2], [78, 300], [147, 1], [148, 0], [149, 0]] as [number, string | number][]) {
      w.g(c, v);
    }
    w.g(100, 'AcDbLayout');
    for (const [c, v] of [[1, name], [70, 1], [71, tab], [10, 0], [20, 0], [11, 420], [21, 297], [12, 0], [22, 0], [32, 0], [14, '1e+20'], [24, '1e+20'], [34, '1e+20'],
      [15, '-1e+20'], [25, '-1e+20'], [35, '-1e+20'], [146, 0], [13, 0], [23, 0], [33, 0], [16, 1], [26, 0], [36, 0], [17, 0], [27, 1], [37, 0], [76, 1], [330, block]] as [number, string | number][]) {
      w.g(c, v);
    }
  }
  w.g(0, 'ENDSEC');
  w.g(0, 'EOF');
}

function uniqueNames(names: string[]): string[] {
  const seen = new Map<string, number>();
  return names.map((n) => {
    const key = n.toLowerCase();
    const k = (seen.get(key) ?? 0) + 1;
    seen.set(key, k);
    return k === 1 ? n : `${n} ${k}`;
  });
}

export async function exportDxf(o: DxfOptions): Promise<Blob> {
  const drills = o.drills ?? [];
  const layers = o.layers ?? [];
  const total = o.kind === 'outline'
    ? drills.reduce((s, l) => s + l.items.length, 0) + (o.outline?.length ?? 0)
    : layers.reduce((s, l) => s + l.layer.items.length, 0);
  const w = new Writer(total, o);
  const e = new Entities(w, o.origin);
  const extents = emptyBox();
  const grow = (b: Box) => {
    if (isEmptyBox(b)) return;
    extents.minX = Math.min(extents.minX, b.minX - o.origin.x);
    extents.minY = Math.min(extents.minY, b.minY - o.origin.y);
    extents.maxX = Math.max(extents.maxX, b.maxX - o.origin.x);
    extents.maxY = Math.max(extents.maxY, b.maxY - o.origin.y);
  };
  const tableLayers: TableLayer[] = [];
  // The entities first (they give the handles and the extents); the head of the file is written after them.
  w.g(0, 'SECTION');
  w.g(2, 'ENTITIES');
  if (o.kind === 'outline') {
    tableLayers.push({ name: 'Board outline', color: '#d0d2cd' });
    for (const c of o.outline ?? []) e.contour('Board outline', c);
    const kept = (i: Layer['items'][number]) => i.k === 'hole' && i.d >= (o.minHole ?? 0);
    const plated = drills.some((l) => l.items.some((i) => kept(i) && i.k === 'hole' && i.plated));
    const npth = drills.some((l) => l.items.some((i) => kept(i) && i.k === 'hole' && !i.plated));
    if (plated) tableLayers.push({ name: 'Plated holes', color: '#e3e3e3' });
    if (npth) tableLayers.push({ name: 'Non-plated holes', color: '#9aa0a8' });
    const minHole = o.minHole ?? 0;
    for (const l of drills) {
      grow(l.bbox);
      for (const item of l.items) {
        if (item.k === 'hole') {
          if (!(item.d >= minHole)) continue;
          const name = item.plated ? 'Plated holes' : 'Non-plated holes';
          if (item.to && (item.to.x !== item.at.x || item.to.y !== item.at.y)) e.slot(name, item.at, item.to, item.d);
          else if (item.d > 0) e.circle(name, item.at, item.d / 2);
        } else if (item.k === 'arc' && item.w >= minHole) {
          // A routed arc of a drill file: the path of the tool, with its width.
          const name = l.plated === false ? 'Non-plated holes' : 'Plated holes';
          if (!tableLayers.some((t) => t.name === name)) tableLayers.push({ name, color: '#e3e3e3' });
          const p = (deg: number) => ({ x: item.c.x + item.r * Math.cos(deg * DEG), y: item.c.y + item.r * Math.sin(deg * DEG) });
          const parts = Math.abs(item.sweep) > 180 ? 2 : 1;
          const step = item.sweep / parts;
          const pts: Vertex[] = [];
          for (let i = 0; i < parts; i += 1) pts.push({ ...p(item.start + i * step), bulge: Math.tan((step / 4) * DEG) });
          pts.push(p(item.start + item.sweep));
          e.polyline(name, pts, false, item.w);
        }
      }
      await w.tick(l.items.length);
    }
    if (o.outline?.length) {
      for (const c of o.outline) {
        for (const v of contourVertices(c)) grow({ minX: v.x, minY: v.y, maxX: v.x, maxY: v.y });
      }
    }
  } else {
    const names = uniqueNames(layers.map((l) => dxfLayerName(layerTitle(l.layer))));
    for (let i = 0; i < layers.length; i += 1) {
      const { layer, color } = layers[i];
      const name = names[i];
      tableLayers.push({ name, color });
      grow(layer.bbox);
      if (hasClearItems(layer)) {
        const polys = await flattenLayer(layer, {
          tolerance: DXF_TOLERANCE,
          pause: () => w.tick(0),
          onItems: (k) => { w.done += k; },
        });
        e.polygons(name, polys);
      } else {
        await layerEntities(e, w, name, layer);
      }
    }
  }
  w.g(0, 'ENDSEC');
  const body = w.take();
  if (isEmptyBox(extents)) Object.assign(extents, { minX: 0, minY: 0, maxX: 1, maxY: 1 });
  header(w, extents, w.seed);
  tables(w, tableLayers, extents);
  const head = w.take();
  objects(w);
  const tail = w.take();
  o.onProgress?.(1);
  return new Blob([...head, ...body, ...tail], { type: 'application/dxf' });
}
