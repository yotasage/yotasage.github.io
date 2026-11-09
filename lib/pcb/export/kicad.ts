// The KiCad export: a design read from Altium, PADS or EAGLE (Board.design) written as a KiCad board (.kicad_pcb), to
// be worked on in KiCad. Not everything maps exactly; lib/pcb/export/kicadnotes.ts says what the page warns about.
//
// The file is in KiCad 9's format (version 20241229): the oldest that holds pad stacks with a shape per copper layer
// (Altium's), and one that KiCad 9 and 10 open. Positions are KiCad's: Y down, so every Y is negated. Footprint items
// are relative to their footprint and turned back by its angle (the design has a bottom footprint's items already
// mirrored, as KiCad stores them); pad and text angles are their angles on the board. A design from another program
// is moved onto the drawing sheet by whole millimetres, with the drill/place and grid origins at its own origin.
//
// - Layers: copper in order (F.Cu, In1.Cu…, B.Cu, with the design's names as user names, planes as power layers); the
//   mask, paste, silkscreen, fabrication and courtyard layers of each side (layers of one kind and side are merged, as
//   EAGLE's tPlace and tNames on F.SilkS); the board shape on Edge.Cuts; every other layer in use on a user layer
//   (User.1…) with its name.
// - Footprints: one per component with its pads, graphics and texts; the reference and value as properties, the other
//   fields as hidden ones. Pads keep their shapes (octagons as chamfered rectangles, others as custom shapes with
//   primitives), pad stacks, holes, slots, offsets and plating. Mask and paste openings are the pads' margins where
//   they are the copper grown (as KiCad grows it, or with sharp corners as Altium does), else pads of their own on the
//   mask or paste layer (aperture pads). Free pads and holes get a footprint each.
// - Tracks, arcs and vias (through, blind and buried, micro; other sizes per layer as a pad stack), with their nets. A
//   pad or via with copper on some of its layers only uses KiCad's "remove unused layers" with the layers it keeps.
// - Zones with their outline (a zone per outer contour, as KiCad has one), net, layers, priority and saved fill, as
//   fractured polygons (holes joined to the outline by a cut, as KiCad stores fills). Planes whose copper the file does
//   not store (Altium's and PADS's negative planes, PADS plane areas, EAGLE polygons) are zones whose fill is the copper
//   the viewer draws (the plane's items flattened with polygon booleans); KiCad fills them again by its own rules only
//   when asked to. Keep-outs and cut-outs are rule areas.
// - Board graphics, text (KiCad's stroke font: anchor, angle, size, stroke, justification, mirror, knockout) and the
//   board shape.
import { padParts, shapeKey } from '../design/pads';
import { breakLines, textLines } from '../font/stroke';
import { addItem, apertureBox, contourArea, DEG, segArc } from '../geometry';
import {
  AperturePart, ArtItem, Board, Box, Contour, Design, DesignComponent, DesignGraphic, DesignPad, DesignShape, DesignText, DesignVia,
  DesignZone, emptyBox, isEmptyBox, Layer, PadShape, Pt,
} from '../model';
import { contourPoints, shapeBox } from '../outline';
import { contourRing, flattenLayer, Polygon, Ring } from './flatten';
import { Cancelled } from './png';

export const KICAD_VERSION = 20241229;

// Arcs and circles of fills and zone outlines become chords this close to the curve (mm).
const TOLERANCE = 0.0025;
const SLICE_MS = 30;
// Lines of points: KiCad reads a file line by line, with a limit on a line's length.
const POINTS_PER_LINE = 4;
// The width of a hairline (as lib/pcb/design/art.ts draws zero-width lines).
const HAIRLINE = 0.001;

export interface KicadOptions {
  signal?: AbortSignal;
  onProgress?: (share: number) => void;
}

// --- Numbers, strings, UUIDs ---

// Millimetres to the nanometre, without an exponent or a negative zero.
function n(v: number): string {
  const r = Math.round(v * 1e6) / 1e6;
  return r === 0 || !Number.isFinite(r) ? '0' : String(r);
}

function normAngle(a: number): number {
  let r = Math.round((((a % 360) + 360) % 360) * 1e6) / 1e6;
  if (r >= 360) r -= 360;
  return r;
}

// A quoted string with KiCad's escapes; other control characters are left out.
export function quote(s: string): string {
  if (!/["\\\u0000-\u001f\u007f]/.test(s)) return `"${s}"`;
  let out = '"';
  for (const ch of s) {
    if (ch === '"' || ch === '\\') out += `\\${ch}`;
    else if (ch === '\n') out += '\\n';
    else if (ch === '\r') out += '\\r';
    else if (ch === '\t') out += '\\t';
    else if (ch < ' ' || ch === '\u007f') continue;
    else out += ch;
  }
  return `${out}"`;
}

const HEX = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, '0'));

// Random (version 4) UUIDs from crypto.getRandomValues, which pages served over plain http have too (randomUUID is
// only there in secure contexts).
class Uuids {
  private pool = new Uint8Array(4096);
  private at = this.pool.length;

  next(): string {
    if (this.at + 16 > this.pool.length) {
      crypto.getRandomValues(this.pool);
      this.at = 0;
    }
    const b = this.pool;
    const i = this.at;
    this.at += 16;
    b[i + 6] = (b[i + 6] & 0x0f) | 0x40;
    b[i + 8] = (b[i + 8] & 0x3f) | 0x80;
    let s = '';
    for (let k = 0; k < 16; k += 1) {
      s += HEX[b[i + k]];
      if (k === 3 || k === 5 || k === 7 || k === 9) s += '-';
    }
    return s;
  }
}

// --- S-expressions ---

// A list: its head, then atoms (already written: numbers, symbols, quoted strings) and lists; empty entries are left
// out.
type Sx = (string | Sx | null | undefined | false)[];

function isList(e: string | Sx | null | undefined | false): e is Sx {
  return Array.isArray(e);
}

// KiCad's layout: a list without lists on one line, others with a line per list, indented by tabs; points a few to a
// line.
function emit(e: Sx, depth: number, out: string[]) {
  const pad = '\t'.repeat(depth);
  const items = e.slice(1).filter((x) => x !== null && x !== undefined && x !== false) as (string | Sx)[];
  if (!items.some(isList)) {
    out.push(`${pad}(${e[0] as string}${items.length ? ` ${items.join(' ')}` : ''})`);
    return;
  }
  if (e[0] === 'pts') {
    out.push(`${pad}(pts`);
    let line: string[] = [];
    const flush = () => {
      if (line.length) out.push(`${pad}\t${line.join(' ')}`);
      line = [];
    };
    for (const x of items) {
      if (isList(x) && x[0] === 'xy') {
        line.push(`(xy ${x[1] as string} ${x[2] as string})`);
        if (line.length >= POINTS_PER_LINE) flush();
      } else {
        flush();
        if (isList(x)) emit(x, depth + 1, out);
        else out.push(`${pad}\t${x}`);
      }
    }
    flush();
    out.push(`${pad})`);
    return;
  }
  let first = `${pad}(${e[0] as string}`;
  let k = 0;
  while (k < items.length && !isList(items[k])) {
    first += ` ${items[k] as string}`;
    k += 1;
  }
  out.push(first);
  for (; k < items.length; k += 1) {
    const x = items[k];
    if (isList(x)) emit(x, depth + 1, out);
    else out.push(`${pad}\t${x}`);
  }
  out.push(`${pad})`);
}

// --- Geometry ---

// A point on the board to KiCad's coordinates: on the board (Y negated and moved) or in a footprint.
type ToKicad = (p: Pt) => [number, number];

// KiCad's rotation (Y down, counter-clockwise on screen), exact for multiples of 90°.
function rotK(x: number, y: number, angle: number): [number, number] {
  const a = normAngle(angle);
  if (a === 0) return [x, y];
  if (a === 90) return [y, -x];
  if (a === 180) return [-x, -y];
  if (a === 270) return [-y, x];
  const s = Math.sin(a * DEG);
  const c = Math.cos(a * DEG);
  return [y * s + x * c, y * c - x * s];
}

function xyOf(f: ToKicad, p: Pt, head = 'xy'): Sx {
  const [x, y] = f(p);
  return [head, n(x), n(y)];
}

function arcPoint(c: Pt, r: number, deg: number): Pt {
  return { x: c.x + r * Math.cos(deg * DEG), y: c.y + r * Math.sin(deg * DEG) };
}

// An arc from its centre, radius, start and sweep as KiCad's start, mid and end points.
function arcLists(f: ToKicad, c: Pt, r: number, start: number, sweep: number): Sx[] {
  return [xyOf(f, arcPoint(c, r, start), 'start'), xyOf(f, arcPoint(c, r, start + sweep / 2), 'mid'), xyOf(f, arcPoint(c, r, start + sweep), 'end')];
}

function dist(a: Pt, b: Pt): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

// The points of a polygon's outline for (pts …), its arcs as arc entries (a full circle as two halves).
function ptsOf(f: ToKicad, c: Contour): Sx {
  const out: Sx = ['pts'];
  let from = c.start;
  let written = false;
  c.segs.forEach((seg, i) => {
    const last = i === c.segs.length - 1;
    if (seg.arc) {
      const { start, sweep } = segArc(from, seg);
      const r = dist(from, seg.arc.c);
      if (Math.abs(sweep) >= 360 - 1e-9) {
        out.push(['arc', ...arcLists(f, seg.arc.c, r, start, sweep / 2)]);
        out.push(['arc', ...arcLists(f, seg.arc.c, r, start + sweep / 2, sweep / 2)]);
      } else out.push(['arc', ...arcLists(f, seg.arc.c, r, start, sweep)]);
      written = true;
    } else {
      if (!written) out.push(xyOf(f, from));
      // The polygon closes itself: the last point is the first again.
      if (!(last && dist(seg.to, c.start) < 1e-9)) out.push(xyOf(f, seg.to));
      written = true;
    }
    from = seg.to;
  });
  if (!c.segs.length) out.push(xyOf(f, c.start));
  return out;
}

function ringPts(f: ToKicad, ring: Ring): Sx {
  return ['pts', ...ring.map((p) => xyOf(f, p))];
}

// One ring from an outline (counter-clockwise) and its holes (clockwise): each hole is joined to what is there by a cut
// from its leftmost point to the nearest edge on its left, the holes taken from the left, as KiCad stores the filled
// areas of zones and polygons with holes.
export function fracture(outer: Ring, holes: Ring[]): Ring {
  let ring = outer.slice();
  const list = holes.filter((h) => h.length >= 3).map((h) => {
    let i = 0;
    for (let k = 1; k < h.length; k += 1) if (h[k].x < h[i].x || (h[k].x === h[i].x && h[k].y < h[i].y)) i = k;
    return { h, i };
  }).sort((a, b) => a.h[a.i].x - b.h[b.i].x);
  for (const { h, i } of list) {
    const m = h[i];
    let best = -Infinity;
    let at = -1;
    for (let k = 0; k < ring.length; k += 1) {
      const a = ring[k];
      const b = ring[(k + 1) % ring.length];
      if ((a.y > m.y) === (b.y > m.y)) continue;
      const x = a.x + ((m.y - a.y) * (b.x - a.x)) / (b.y - a.y);
      if (x <= m.x + 1e-12 && x > best) {
        best = x;
        at = k;
      }
    }
    const loop = [...h.slice(i), ...h.slice(0, i), m];
    if (at < 0) {
      // No edge to the left (cannot happen for a hole inside its outline): joined at the first point.
      ring = [...ring, ring[0], ...loop];
      continue;
    }
    const p = { x: best, y: m.y };
    ring = [...ring.slice(0, at + 1), p, ...loop, p, ...ring.slice(at + 1)];
  }
  return ring;
}

function ringArea(r: Ring): number {
  let s = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i, i += 1) s += r[j].x * r[i].y - r[i].x * r[j].y;
  return s / 2;
}

function insideRing(p: Pt, r: Ring): boolean {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i, i += 1) {
    const a = r[i];
    const b = r[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

function ringBox(r: Ring): Box {
  const b = emptyBox();
  for (const p of r) {
    b.minX = Math.min(b.minX, p.x);
    b.minY = Math.min(b.minY, p.y);
    b.maxX = Math.max(b.maxX, p.x);
    b.maxY = Math.max(b.maxY, p.y);
  }
  return b;
}

function boxesMeet(a: Box, b: Box): boolean {
  return a.minX <= b.maxX && b.minX <= a.maxX && a.minY <= b.maxY && b.minY <= a.maxY;
}

// Outlines with their holes, from contours (outer ones counter-clockwise, holes clockwise): each hole goes with the
// smallest outline around it.
interface Part {
  outer: Ring;
  holes: Ring[];
}

function partsOf(contours: Contour[]): Part[] {
  const rings = contours.map((c) => contourRing(c, TOLERANCE)).filter((r) => r.length >= 3);
  const outers = rings.filter((r) => ringArea(r) > 0).map((outer) => ({ outer, holes: [] as Ring[], area: ringArea(outer) }));
  for (const r of rings) {
    if (ringArea(r) > 0) continue;
    const around = outers.filter((o) => insideRing(r[0], o.outer)).sort((a, b) => a.area - b.area)[0];
    if (around) around.holes.push(r);
    else outers.push({ outer: r.slice().reverse(), holes: [], area: -ringArea(r) });
  }
  return outers.map(({ outer, holes }) => ({ outer, holes }));
}

// The lines and arcs along a contour, as items of width w (a stroked outline).
function strokeItems(c: Contour, w: number): ArtItem[] {
  const out: ArtItem[] = [];
  let from = c.start;
  for (const seg of c.segs) {
    if (seg.arc) {
      const { start, sweep } = segArc(from, seg);
      out.push({ k: 'arc', c: seg.arc.c, r: dist(from, seg.arc.c), start, sweep, w, dark: true });
    } else out.push({ k: 'line', a: from, b: seg.to, w, cap: 'round', dark: true });
    from = seg.to;
  }
  return out;
}

// A text as KiCad gets it: a text box's lines broken where the viewer breaks them, and a text whose line spacing is not
// 1 as a text per line where the viewer draws it (KiCad's plots ignore line spacing); empty lines are left out.
function textParts(t: DesignText): DesignText[] {
  const s = t.wrap ? breakLines(t.s, t.wrap * 1e6, t.w * 1e6, t.h * 1e6, t.thick * 1e6, Boolean(t.italic)) : t.s;
  const plain: DesignText = { ...t, s, wrap: undefined, lineSpacing: undefined };
  const spacing = t.lineSpacing ?? 1;
  if (Math.abs(spacing - 1) < 1e-9 || !s.includes('\n')) return [plain];
  const lines = textLines(s, t.h, spacing, t.just.v === 'middle' ? 'center' : t.just.v);
  if (lines.length < 2) return [plain];
  const a = t.rot * DEG;
  // The text's own "down" on the board (Y up).
  const down = { x: Math.sin(a), y: -Math.cos(a) };
  return lines.filter(({ line }) => line.trim()).map(({ line, dy }) => ({
    ...plain, s: line, at: { x: t.at.x + dy * down.x, y: t.at.y + dy * down.y }, just: { h: t.just.h, v: 'top' },
  }));
}

function scratchLayer(items: ArtItem[]): Layer {
  return { id: 'kicad-export', name: '', kind: 'copper', side: 'none', items, apertures: [], bbox: emptyBox() };
}

// --- Layers ---

// KiCad 9's numbers of the layers that are not copper, and the names KiCad gives them.
const TECH: [string, number, string?][] = [
  ['F.Adhes', 9, 'F.Adhesive'], ['B.Adhes', 11, 'B.Adhesive'], ['F.Paste', 13], ['B.Paste', 15], ['F.SilkS', 5, 'F.Silkscreen'],
  ['B.SilkS', 7, 'B.Silkscreen'], ['F.Mask', 1], ['B.Mask', 3], ['Dwgs.User', 17, 'User.Drawings'], ['Cmts.User', 19, 'User.Comments'],
  ['Eco1.User', 21, 'User.Eco1'], ['Eco2.User', 23, 'User.Eco2'], ['Edge.Cuts', 25], ['Margin', 27], ['F.CrtYd', 31, 'F.Courtyard'],
  ['B.CrtYd', 29, 'B.Courtyard'], ['F.Fab', 35], ['B.Fab', 33],
];
const TECH_NAMES = new Set(TECH.map(([name]) => name));
// KiCad 9 has 45 user layers.
const MAX_USER = 45;
const CANONICAL = /^(?:[FB]\.(?:Cu|Adhes|Paste|SilkS|Mask|CrtYd|Fab)|In\d+\.Cu|(?:Dwgs|Cmts|Eco1|Eco2)\.User|Edge\.Cuts|Margin|User\.\d+)$/;

const SIDE_LAYERS: Partial<Record<string, [string, string]>> = {
  mask: ['F.Mask', 'B.Mask'], paste: ['F.Paste', 'B.Paste'], silk: ['F.SilkS', 'B.SilkS'], fab: ['F.Fab', 'B.Fab'], courtyard: ['F.CrtYd', 'B.CrtYd'],
};

class LayerMap {
  // KiCad's copper layers from the top.
  readonly copper: string[] = [];
  private ids = new Map<string, string>();
  // The design's names of KiCad's layers (user names), and the user layers in use.
  private names = new Map<string, string>();
  private types = new Map<string, string>();
  private users: string[] = [];
  // Graphics of an outline layer that are not the board shape go to a user layer of their own.
  private extras = new Map<string, string>();
  // Negative planes (Altium, PADS CAM): what is drawn on them is cut out of the plane's copper.
  readonly negative = new Set<string>();

  constructor(design: Design, kicad: boolean, used: Set<string>) {
    const copper = design.layers.map((l, i) => ({ l, i })).filter(({ l }) => l.kind === 'copper')
      .sort((a, b) => (a.l.copper ?? 1e6) - (b.l.copper ?? 1e6) || a.i - b.i).map(({ l }) => l);
    const count = Math.max(2, Math.min(32, copper.length));
    for (let i = 0; i < count; i += 1) this.copper.push(i === 0 ? 'F.Cu' : i === count - 1 ? 'B.Cu' : `In${i}.Cu`);
    copper.forEach((l, i) => {
      let k: string;
      if (kicad && /^(?:[FB]\.Cu|In\d+\.Cu)$/.test(l.id) && this.copper.includes(l.id)) k = l.id;
      else if (copper.length === 1) k = l.side === 'bottom' ? 'B.Cu' : 'F.Cu';
      // KiCad has 32 copper layers: inner layers beyond In30.Cu share it.
      else k = i === 0 ? 'F.Cu' : i >= copper.length - 1 ? 'B.Cu' : i < count - 1 ? `In${i}.Cu` : `In${count - 2}.Cu`;
      this.ids.set(l.id, k);
      if (l.plane) this.negative.add(l.id);
      if (!this.names.has(k) && l.name && l.name !== k) this.names.set(k, l.name);
      this.types.set(k, l.plane ? 'power' : /mixed/i.test(l.label ?? '') ? 'mixed' : 'signal');
    });
    for (const l of design.layers) {
      if (l.kind === 'copper') continue;
      if (kicad && CANONICAL.test(l.id) && (TECH_NAMES.has(l.id) || /^User\.\d+$/.test(l.id))) {
        this.ids.set(l.id, l.id);
        if (/^User\.\d+$/.test(l.id)) this.users.push(l.id);
        if (l.name && l.name !== l.id && !this.names.has(l.id)) this.names.set(l.id, l.name);
        continue;
      }
      const pair = SIDE_LAYERS[l.kind];
      if (pair && (l.side === 'top' || l.side === 'bottom')) {
        this.ids.set(l.id, pair[l.side === 'top' ? 0 : 1]);
        continue;
      }
      if (l.kind === 'other' && l.label === 'Glue' && (l.side === 'top' || l.side === 'bottom')) {
        this.ids.set(l.id, l.side === 'top' ? 'F.Adhes' : 'B.Adhes');
        continue;
      }
      if (l.kind === 'outline') {
        this.ids.set(l.id, 'Edge.Cuts');
        continue;
      }
      if (!used.has(l.id)) continue;
      // Beyond KiCad's 45 user layers, what is left goes to Dwgs.User.
      this.ids.set(l.id, this.user(l.name || l.id) ?? 'Dwgs.User');
    }
  }

  // A new user layer with this name; null when all of them are taken.
  private user(name: string): string | null {
    let i = 1;
    while (this.users.includes(`User.${i}`)) i += 1;
    if (i > MAX_USER) return null;
    const k = `User.${i}`;
    this.users.push(k);
    this.names.set(k, this.uniqueName(name, k));
    return k;
  }

  private uniqueName(name: string, k: string): string {
    const taken = new Set<string>([...this.names.entries()].filter(([key]) => key !== k).map(([, v]) => v));
    for (const [, , def] of TECH) if (def) taken.add(def);
    const canonical = (s: string) => CANONICAL.test(s);
    let candidate = name;
    for (let i = 2; taken.has(candidate) || (canonical(candidate) && candidate !== k); i += 1) candidate = `${name} (${i})`;
    return candidate;
  }

  get(id: string): string | undefined {
    return this.ids.get(id);
  }

  isCopper(k: string): boolean {
    return k === 'F.Cu' || k === 'B.Cu' || /^In\d+\.Cu$/.test(k);
  }

  // The user layer for the graphics of an outline layer that are not the board shape.
  extra(id: string, design: Design): string | undefined {
    let k = this.extras.get(id);
    if (!k) {
      const name = design.layers.find((l) => l.id === id)?.name ?? id;
      k = this.user(name === 'Edge.Cuts' ? 'Edge.Cuts drawings' : name) ?? 'Dwgs.User';
      this.extras.set(id, k);
    }
    return k;
  }

  table(): Sx {
    const out: Sx = ['layers'];
    const entry = (num: number, k: string, type: string, def?: string): Sx => {
      const name = this.names.get(k) ?? def;
      return [String(num), quote(k), type, name ? quote(name) : null];
    };
    this.copper.forEach((k) => {
      const num = k === 'F.Cu' ? 0 : k === 'B.Cu' ? 2 : 2 * Number(/^In(\d+)/.exec(k)[1]) + 2;
      out.push(entry(num, k, this.types.get(k) ?? 'signal'));
    });
    for (const [k, num, def] of TECH) out.push(entry(num, k, 'user', def));
    const users = this.users.slice().sort((a, b) => Number(a.slice(5)) - Number(b.slice(5)));
    for (const k of users) out.push(entry(37 + 2 * Number(k.slice(5)), k, 'user'));
    return out;
  }
}

// --- Nets ---

class NetMap {
  readonly numbers: number[] = [0];
  readonly names: string[] = [''];

  constructor(nets: string[]) {
    const byName = new Map<string, number>([['', 0]]);
    for (let i = 1; i < nets.length; i += 1) {
      const name = (nets[i] ?? '').trim() || `Net-${i}`;
      let k = byName.get(name);
      if (k === undefined) {
        k = this.names.length;
        this.names.push(name);
        byName.set(name, k);
      }
      this.numbers[i] = k;
    }
  }

  of(net: number | undefined): number {
    return net ? this.numbers[net] ?? 0 : 0;
  }

  list(net: number | undefined): Sx | null {
    const k = this.of(net);
    return k ? ['net', String(k), quote(this.names[k])] : null;
  }
}

// --- Pads ---

const CORNERS: Record<string, string> = { tl: 'top_left', tr: 'top_right', bl: 'bottom_left', br: 'bottom_right' };

// The size and the box of a shape's parts (pad coordinates), for comparing openings with the copper.
function partsBox(s: PadShape): Box | null {
  const b = emptyBox();
  for (const p of padParts(s)) {
    if (p.circle) {
      b.minX = Math.min(b.minX, p.circle.c.x - p.circle.r);
      b.maxX = Math.max(b.maxX, p.circle.c.x + p.circle.r);
      b.minY = Math.min(b.minY, p.circle.c.y - p.circle.r);
      b.maxY = Math.max(b.maxY, p.circle.c.y + p.circle.r);
    }
    for (const q of p.poly ?? []) {
      b.minX = Math.min(b.minX, q.x);
      b.maxX = Math.max(b.maxX, q.x);
      b.minY = Math.min(b.minY, q.y);
      b.maxY = Math.max(b.maxY, q.y);
    }
  }
  return isEmptyBox(b) ? null : b;
}

const POLYGONAL = new Set(['rect', 'roundrect', 'chamfer', 'octagon', 'trapezoid', 'custom']);

// How much larger an opening is than the copper on each axis, when the opening is the copper grown or shrunk (as
// KiCad does it, rounding grown corners, or with the corners kept, as Altium and PADS do); null for another shape.
function grownBy(copper: PadShape, open: PadShape): { mx: number; my: number } | null {
  if (shapeKey(copper) === shapeKey(open)) return { mx: 0, my: 0 };
  const a = partsBox(copper);
  const b = partsBox(open);
  if (!a || !b) return null;
  if (Math.abs((a.minX + a.maxX) / 2 - (b.minX + b.maxX) / 2) > 1e-4 || Math.abs((a.minY + a.maxY) / 2 - (b.minY + b.maxY) / 2) > 1e-4) return null;
  const round = (k: string) => k === 'circle' || k === 'oval';
  const fits = copper.k === open.k
    || (round(copper.k) && round(open.k))
    || (POLYGONAL.has(copper.k) && copper.k !== 'roundrect' && (open.k === 'custom' || (copper.k === 'rect' && open.k === 'roundrect')))
    || (copper.k === 'roundrect' && open.k === 'rect');
  if (!fits) return null;
  return { mx: ((b.maxX - b.minX) - (a.maxX - a.minX)) / 2, my: ((b.maxY - b.minY) - (a.maxY - a.minY)) / 2 };
}

function chamfered(s: PadShape): boolean {
  return s.k === 'octagon' || (s.k === 'chamfer' && s.chamfer?.size > 1e-9 && s.chamfer.corners.length > 0);
}

// The shape name and the lists that give a pad shape (size, ratios, corners, primitives), in pad coordinates with Y
// down. The offset of the shape goes with the drill (or the layer of a pad stack). A chamfered rectangle is a rounded
// one with its chamfered corners listed.
function shapeName(s: PadShape): string {
  switch (s.k) {
    case 'circle':
      return 'circle';
    case 'oval':
      return 'oval';
    case 'roundrect':
      return (s.r ?? 0) > 1e-9 ? 'roundrect' : 'rect';
    case 'chamfer':
    case 'octagon':
      return chamfered(s) || (s.r ?? 0) > 1e-9 ? 'roundrect' : 'rect';
    case 'trapezoid':
      return 'trapezoid';
    case 'custom':
      return 'custom';
    default:
      return 'rect';
  }
}

function primitive(p: AperturePart): Sx | null {
  if (p.circle) {
    return ['gr_circle', ['center', n(p.circle.c.x), n(-p.circle.c.y)], ['end', n(p.circle.c.x + p.circle.r), n(-p.circle.c.y)], ['width', '0'], ['fill', 'yes']];
  }
  if (p.poly?.length >= 3) return ['gr_poly', ['pts', ...p.poly.map((q): Sx => ['xy', n(q.x), n(-q.y)])], ['width', '0'], ['fill', 'yes']];
  return null;
}

function shapeLists(s: PadShape): Sx[] {
  const min = Math.min(s.w, s.h);
  const ratio = (v: number) => n(Math.max(0, Math.min(0.5, min > 0 ? v / min : 0)));
  switch (s.k) {
    case 'circle':
      return [['size', n(s.w), n(s.w)]];
    case 'roundrect':
      return [['size', n(s.w), n(s.h)], (s.r ?? 0) > 1e-9 ? ['roundrect_rratio', ratio(s.r)] : null];
    case 'chamfer': {
      const list: Sx[] = [['size', n(s.w), n(s.h)]];
      if ((s.r ?? 0) > 1e-9 || chamfered(s)) list.push(['roundrect_rratio', ratio(s.r ?? 0)]);
      if (chamfered(s)) list.push(['chamfer_ratio', ratio(s.chamfer.size)], ['chamfer', ...s.chamfer.corners.map((c) => CORNERS[c])]);
      return list;
    }
    case 'octagon':
      return [['size', n(s.w), n(s.h)], ['roundrect_rratio', '0'], ['chamfer_ratio', n(1 - Math.SQRT1_2)], ['chamfer', 'top_left', 'top_right', 'bottom_left', 'bottom_right']];
    case 'trapezoid':
      return [['size', n(s.w), n(s.h)], ['rect_delta', n(s.delta?.x ?? 0), n(s.delta?.y ?? 0)]];
    case 'custom':
      // A tiny round anchor; the shape is its primitives.
      return [['size', '0.01', '0.01'], ['options', ['clearance', 'outline'], ['anchor', 'circle']], ['primitives', ...(s.parts ?? []).map(primitive)]];
    default:
      return [['size', n(s.w), n(s.h)]];
  }
}

function offsetOf(s: PadShape): Pt | null {
  return s.offset && (Math.abs(s.offset.x) > 1e-9 || Math.abs(s.offset.y) > 1e-9) ? s.offset : null;
}

// --- The writer ---

interface Fill {
  layer: string;
  rings: Ring[];
}

interface PlaneJob {
  index: number;
  k: string;
  layer: Layer;
  items: ArtItem[];
}

interface ZoneSettings {
  clearance: number;
  minWidth: number;
  thermalGap: number;
  thermalWidth: number;
  solid: boolean;
}

const ZONE_DEFAULTS: ZoneSettings = { clearance: 0.254, minWidth: 0.25, thermalGap: 0.5, thermalWidth: 0.5, solid: false };

function median(values: number[], fallback: number): number {
  const v = values.filter((x) => Number.isFinite(x) && x > 0).sort((a, b) => a - b);
  return v.length ? v[Math.floor(v.length / 2)] : fallback;
}

// What the rule area of a zone keeps out: from its name (PADS keep-outs list their restrictions; cut-outs keep out only
// pours), else everything but footprints, as KiCad's default.
function keepoutRules(name: string | undefined): Record<string, boolean> {
  const all = { tracks: true, vias: true, pads: true, copperpour: true, footprints: false };
  if (!name) return all;
  if (/cut-?out/i.test(name)) return { tracks: false, vias: false, pads: false, copperpour: true, footprints: false };
  const m = /^Keep-out: (.+)$/.exec(name);
  if (!m) return all;
  const list = m[1];
  return {
    tracks: /traces/.test(list),
    vias: /vias/.test(list),
    pads: false,
    copperpour: /copper pour|traces and copper/.test(list),
    footprints: /placement/.test(list),
  };
}

class Writer {
  private out: string[] = [];
  private uuids = new Uuids();
  private slice = performance.now();
  private done = 0;
  private total = 1;
  readonly layers: LayerMap;
  readonly nets: NetMap;
  private kicad: boolean;
  private dx = 0;
  private dy = 0;
  private paper: Sx = ['paper', quote('A4')];
  // Board-level settings chosen from the vias.
  private maskMargin = 0;
  private tent = { top: true, bottom: true };
  // The board shape written on Edge.Cuts.
  private outline: Contour[];
  private outlineWidth = 0.05;
  private edgeGraphics: DesignGraphic[];
  private counts = new Map<string, number>();

  constructor(private board: Board, private design: Design, private o: KicadOptions) {
    this.kicad = board.source === 'kicad';
    this.layers = new LayerMap(design, this.kicad, usedLayers(design));
    this.nets = new NetMap(design.nets);
    this.outline = design.outline.length ? design.outline : board.outline ?? [];
    this.place();
    this.viaDefaults();
    this.edgeGraphics = design.graphics.filter((g) => this.layers.get(g.layer) === 'Edge.Cuts' && !('curve' in g.shape));
    const widths = this.edgeGraphics.filter((g) => g.w > 0).map((g) => g.w);
    this.outlineWidth = widths.length ? mode(widths) : 0.05;
  }

  count(what: string, k = 1) {
    this.counts.set(what, (this.counts.get(what) ?? 0) + k);
  }

  private async tick(k = 1) {
    this.done += k;
    if (performance.now() - this.slice < SLICE_MS) return;
    if (this.o.signal?.aborted) throw new Cancelled();
    this.o.onProgress?.(Math.min(0.99, this.done / this.total));
    await new Promise((resolve) => setTimeout(resolve, 0));
    if (this.o.signal?.aborted) throw new Cancelled();
    this.slice = performance.now();
  }

  private uuid(): Sx {
    return ['uuid', quote(this.uuids.next())];
  }

  private push(e: Sx) {
    emit(e, 1, this.out);
  }

  // Where the board goes: KiCad boards stay; others are moved onto the smallest A sheet they fit, centred.
  private place() {
    if (this.kicad) return;
    let box: Box | null = this.outline.length ? shapeBox(this.outline) : null;
    if (!box || isEmptyBox(box)) {
      box = emptyBox();
      for (const l of this.board.layers) {
        if (isEmptyBox(l.bbox)) continue;
        box.minX = Math.min(box.minX, l.bbox.minX);
        box.minY = Math.min(box.minY, l.bbox.minY);
        box.maxX = Math.max(box.maxX, l.bbox.maxX);
        box.maxY = Math.max(box.maxY, l.bbox.maxY);
      }
    }
    if (isEmptyBox(box)) return;
    const w = box.maxX - box.minX + 40;
    const h = box.maxY - box.minY + 40;
    const sheets: [string, number, number][] = [['A4', 297, 210], ['A3', 420, 297], ['A2', 594, 420], ['A1', 841, 594], ['A0', 1189, 841]];
    const sheet = sheets.find(([, sw, sh]) => w <= sw && h <= sh);
    let pw: number;
    let ph: number;
    if (sheet) {
      [, pw, ph] = sheet;
      this.paper = ['paper', quote(sheet[0])];
    } else {
      pw = Math.ceil(w);
      ph = Math.ceil(h);
      this.paper = ['paper', quote('User'), n(pw), n(ph)];
    }
    this.dx = Math.round(pw / 2 - (box.minX + box.maxX) / 2);
    this.dy = Math.round(ph / 2 + (box.minY + box.maxY) / 2);
  }

  // The vias' most common mask margin is the board's (KiCad has no margin per via). In KiCad 9's file a via can only
  // tent a side the board leaves open ((tenting front) names the sides it tents; the others follow the board, as
  // kicad-cli 10 reads it), so the board tents a side only where every via is tented.
  private viaDefaults() {
    const margins = this.design.vias.filter((v) => v.mask && (v.mask.top || v.mask.bottom)).map((v) => v.mask.margin);
    if (margins.length) this.maskMargin = mode(margins);
    this.tent = { top: !this.design.vias.some((v) => v.mask?.top), bottom: !this.design.vias.some((v) => v.mask?.bottom) };
  }

  // A board point in KiCad's coordinates.
  readonly board_: ToKicad = (p) => [p.x + this.dx, this.dy - p.y];

  // A board point in a footprint's coordinates.
  private local(c: DesignComponent): ToKicad {
    const [fx, fy] = this.board_(c.at);
    return (p) => {
      const [x, y] = this.board_(p);
      return rotK(x - fx, y - fy, -c.rot);
    };
  }

  // --- The file ---

  async write(): Promise<string> {
    const d = this.design;
    const jobs = this.planeJobs();
    this.total = d.pads.length + d.graphics.length + d.texts.length + d.tracks.length + d.vias.length + d.components.length + d.holes.length
      + d.zones.reduce((s, z) => s + 1 + z.fill.length, 0) + jobs.reduce((s, j) => s + j.items.length, 0) + 1;
    this.out.push('(kicad_pcb');
    this.push(['version', String(KICAD_VERSION)]);
    this.push(['generator', quote('yotasage_pcb_viewer')]);
    this.push(['general', ['thickness', n(d.stackup?.thickness ?? 1.6)], ['legacy_teardrops', 'no']]);
    this.push(this.paper);
    this.push(['title_block', ['title', quote(this.board.name)], ['comment', '1', quote(`Converted from ${d.format} by the PCB viewer of yotasage.github.io: check before use`)]]);
    this.push(this.layers.table());
    this.push(this.setup());
    this.nets.names.forEach((name, i) => this.push(['net', String(i), quote(name)]));
    await this.footprints();
    await this.graphics();
    await this.copper();
    await this.zones();
    await this.planes(jobs);
    this.push(['embedded_fonts', 'no']);
    this.out.push(')');
    this.o.onProgress?.(1);
    return `${this.out.join('\n')}\n`;
  }

  private setup(): Sx {
    const d = this.design;
    const origin = d.placeOrigin ?? (this.kicad ? null : { x: 0, y: 0 });
    const setup: Sx = ['setup', this.stackup(), ['pad_to_mask_clearance', n(this.maskMargin)], ['allow_soldermask_bridges_in_footprints', 'no']];
    const tent = [this.tent.top ? 'front' : null, this.tent.bottom ? 'back' : null].filter(Boolean) as string[];
    setup.push(['tenting', ...(tent.length ? tent : ['none'])]);
    if (origin) {
      const [x, y] = this.board_(origin);
      setup.push(['aux_axis_origin', n(x), n(y)]);
      if (!this.kicad) setup.push(['grid_origin', n(x), n(y)]);
    }
    const dash = d.dash;
    if (dash && (Math.abs(dash.dash - 12) > 1e-9 || Math.abs(dash.gap - 3) > 1e-9)) {
      setup.push(['pcbplotparams', ['dashed_line_dash_ratio', n(dash.dash)], ['dashed_line_gap_ratio', n(dash.gap)]]);
    }
    return setup;
  }

  // The stackup: the copper layers with the board's thickness split evenly between the dielectrics, and the colours and
  // finish where the design names them in KiCad's words.
  private stackup(): Sx {
    const s = this.design.stackup ?? {};
    const copper = this.layers.copper;
    const thickness = s.thickness ?? 1.6;
    const cu = 0.035;
    const maskT = 0.01;
    const gaps = copper.length - 1;
    let diel = (thickness - copper.length * cu - 2 * maskT) / gaps;
    if (!(diel > 0.01)) diel = thickness / gaps;
    const colour = (c: string | undefined) => (this.kicad && c ? ['color', quote(c)] as Sx : null);
    const out: Sx = ['stackup'];
    out.push(['layer', quote('F.SilkS'), ['type', quote('Top Silk Screen')], colour(s.silk)]);
    out.push(['layer', quote('F.Paste'), ['type', quote('Top Solder Paste')]]);
    out.push(['layer', quote('F.Mask'), ['type', quote('Top Solder Mask')], colour(s.mask), ['thickness', n(maskT)]]);
    copper.forEach((k, i) => {
      out.push(['layer', quote(k), ['type', quote('copper')], ['thickness', n(cu)]]);
      if (i < gaps) {
        out.push(['layer', quote(`dielectric ${i + 1}`), ['type', quote(i % 2 === 0 ? 'core' : 'prepreg')], ['thickness', n(diel)], ['material', quote('FR4')], ['epsilon_r', '4.5'], ['loss_tangent', '0.02']]);
      }
    });
    out.push(['layer', quote('B.Mask'), ['type', quote('Bottom Solder Mask')], colour(s.mask), ['thickness', n(maskT)]]);
    out.push(['layer', quote('B.Paste'), ['type', quote('Bottom Solder Paste')]]);
    out.push(['layer', quote('B.SilkS'), ['type', quote('Bottom Silk Screen')], colour(s.silk)]);
    if (this.kicad && s.finish) out.push(['copper_finish', quote(s.finish)]);
    out.push(['dielectric_constraints', 'no']);
    return out;
  }

  // --- Footprints ---

  private async footprints() {
    const d = this.design;
    const pads = new Map<number, DesignPad[]>();
    const graphics = new Map<number, DesignGraphic[]>();
    const texts = new Map<number, DesignText[]>();
    const add = <T>(map: Map<number, T[]>, i: number, x: T) => {
      const list = map.get(i);
      if (list) list.push(x);
      else map.set(i, [x]);
    };
    const free: DesignPad[] = [];
    for (const p of d.pads) {
      if (p.comp !== undefined && d.components[p.comp]) add(pads, p.comp, p);
      else free.push(p);
    }
    for (const g of d.graphics) if (g.comp !== undefined && d.components[g.comp]) add(graphics, g.comp, g);
    for (const t of d.texts) if (t.comp !== undefined && d.components[t.comp]) add(texts, t.comp, t);
    const regions = await this.regionRings(d.graphics.filter((g) => g.comp !== undefined && d.components[g.comp]));
    for (let i = 0; i < d.components.length; i += 1) {
      this.footprint(d.components[i], pads.get(i) ?? [], graphics.get(i) ?? [], texts.get(i) ?? [], regions);
      await this.tick(1 + (pads.get(i)?.length ?? 0) + (graphics.get(i)?.length ?? 0) + (texts.get(i)?.length ?? 0));
    }
    // Pads without a component and holes: a footprint each, as KiCad has no pads outside footprints.
    for (const p of free) {
      const bottom = p.type === 'smd' && p.shapes.some((s) => s.layers.some((id) => this.layers.get(id) === 'B.Cu'));
      const comp: DesignComponent = { ref: 'REF**', value: p.num ? `Pad ${p.num}` : 'Pad', footprint: 'Pad', at: p.at, rot: 0, side: bottom ? 'bottom' : 'top', attrs: { board_only: 'yes', exclude_from_bom: 'yes', exclude_from_pos_files: 'yes' }, fields: {} };
      this.footprint(comp, [p], [], [], regions);
      this.count('free pad');
      await this.tick();
    }
    for (const h of d.holes) {
      const pad: DesignPad = {
        num: '', net: 0, at: h.at, rot: h.slot?.rot ?? 0, type: 'np', shapes: [],
        hole: { d: h.d, ...(h.slot ? { slot: { w: h.slot.w, h: h.slot.h } } : {}), plated: h.plated },
      };
      if (h.plated) pad.type = 'th';
      const comp: DesignComponent = { ref: 'REF**', value: 'Hole', footprint: 'Hole', at: h.at, rot: 0, side: 'top', attrs: { board_only: 'yes', exclude_from_bom: 'yes', exclude_from_pos_files: 'yes' }, fields: {} };
      this.footprint(comp, [pad], [], [], regions, true);
      this.count('hole');
      await this.tick();
    }
  }

  private footprint(c: DesignComponent, pads: DesignPad[], graphics: DesignGraphic[], texts: DesignText[], regions: Map<DesignGraphic, Ring[]>, hole = false) {
    const f = this.local(c);
    const bottom = c.side === 'bottom';
    const name = footprintName(c.footprint);
    const [x, y] = this.board_(c.at);
    const rot = normAngle(c.rot);
    const e: Sx = ['footprint', quote(name), ['layer', quote(bottom ? 'B.Cu' : 'F.Cu')], this.uuid(), ['at', n(x), n(y), rot ? n(rot) : null]];
    if (c.description) e.push(['descr', quote(c.description)]);
    // Reference and value: the first text that shows them, else hidden.
    const silk = bottom ? 'B.SilkS' : 'F.SilkS';
    const fab = bottom ? 'B.Fab' : 'F.Fab';
    let refText: DesignText | undefined;
    let valueText: DesignText | undefined;
    const single = (t: DesignText) => textParts(t).length === 1;
    for (const t of texts) {
      if (!refText && t.role === 'reference' && t.s === c.ref && this.layers.get(t.layer) && single(t)) refText = t;
      else if (!valueText && t.role === 'value' && t.s === c.value && this.layers.get(t.layer) && single(t)) valueText = t;
    }
    e.push((refText && this.text(refText, 'Reference', f, c)) || this.hiddenProperty('Reference', c.ref, silk, c));
    e.push((valueText && this.text(valueText, 'Value', f, c)) || this.hiddenProperty('Value', c.value, fab, c));
    for (const [key, value] of Object.entries(c.fields)) {
      if (/^(Reference|Value|Footprint)$/i.test(key) || !key) continue;
      e.push(this.hiddenProperty(key, value, fab, c));
    }
    const type = c.attrs.type ?? (pads.some((p) => p.type === 'th') ? 'through_hole' : pads.some((p) => p.type === 'smd') && !hole ? 'smd' : undefined);
    const flags = ['board_only', 'exclude_from_pos_files', 'exclude_from_bom', 'allow_missing_courtyard', 'dnp', 'allow_soldermask_bridges'].filter((k) => c.attrs[k]);
    if (type === 'smd' || type === 'through_hole' || flags.length) e.push(['attr', type === 'smd' || type === 'through_hole' ? type : null, ...flags]);
    for (const g of graphics) e.push(...this.graphic(g, f, 'fp_', regions));
    for (const t of texts) if (t !== refText && t !== valueText) e.push(...this.texts(t, f, c));
    for (const p of pads) e.push(...this.pad(p, f));
    this.push(e);
  }

  private hiddenProperty(key: string, value: string, layer: string, c: DesignComponent): Sx {
    return [
      'property', quote(key), quote(value), ['at', '0', '0', normAngle(c.rot) ? n(normAngle(c.rot)) : null], ['unlocked', 'yes'], ['layer', quote(layer)], ['hide', 'yes'],
      this.uuid(), ['effects', ['font', ['size', '1', '1'], ['thickness', '0.15']], c.side === 'bottom' ? ['justify', 'mirror'] : null],
    ];
  }

  // --- Pads ---

  private pad(p: DesignPad, f: ToKicad): Sx[] {
    const L = this.layers;
    const cu = new Map<string, PadShape>();
    const masks: [PadShape | null, PadShape | null] = [null, null];
    const pastes: [PadShape | null, PadShape | null] = [null, null];
    const others: { k: string; shape: PadShape }[] = [];
    const extra: { k: string; shape: PadShape }[] = [];
    for (const s of p.shapes) {
      for (const id of s.layers) {
        const k = L.get(id);
        if (!k || L.negative.has(id)) continue;
        if (L.isCopper(k)) {
          if (!cu.has(k)) cu.set(k, s.shape);
        } else if (k === 'F.Mask' || k === 'B.Mask') {
          const i = k === 'F.Mask' ? 0 : 1;
          if (!masks[i]) masks[i] = s.shape;
          else extra.push({ k, shape: s.shape });
        } else if (k === 'F.Paste' || k === 'B.Paste') {
          const i = k === 'F.Paste' ? 0 : 1;
          if (!pastes[i]) pastes[i] = s.shape;
          else extra.push({ k, shape: s.shape });
        } else if (k !== 'Edge.Cuts') others.push({ k, shape: s.shape });
      }
    }
    const hole = p.hole && p.hole.d > 0 ? p.hole : undefined;
    const kind = hole && p.type === 'th' ? 'thru_hole' : hole && p.type === 'np' ? 'np_thru_hole' : p.type === 'connect' ? 'connect' : 'smd';
    const through = kind === 'thru_hole' || kind === 'np_thru_hole';
    const present = L.copper.filter((k) => cu.has(k));
    // A hole of its own size when the pad has no copper.
    const holeShape: PadShape | null = hole
      ? hole.slot ? { k: 'oval', w: hole.slot.w, h: hole.slot.h } : { k: 'circle', w: hole.d, h: hole.d }
      : null;
    const main = cu.get('F.Cu') ?? (present.length ? cu.get(present[0]) : null) ?? holeShape ?? masks[0] ?? masks[1] ?? pastes[0] ?? pastes[1] ?? others[0]?.shape;
    if (!main) return [];
    const sideShape = (i: 0 | 1): PadShape | null => cu.get(i === 0 ? 'F.Cu' : 'B.Cu') ?? (through ? main : null);
    const layers: string[] = [];
    // Copper layers.
    if (kind === 'thru_hole') layers.push('*.Cu');
    else if (kind === 'np_thru_hole') {
      if (!present.length || present.length === L.copper.length) layers.push('*.Cu');
      else layers.push(...present);
    } else layers.push(...present);
    const apertures: Sx[] = [];
    // Solder mask: a margin when the openings are the copper grown alike, else aperture pads.
    const maskMargins = ([0, 1] as const).map((i) => {
      const open = masks[i];
      const ref = sideShape(i);
      if (!open || !ref) return null;
      const g = grownBy(ref, open);
      return g && Math.abs(g.mx - g.my) < 1e-6 ? g.mx : null;
    });
    let maskMargin: number | null = null;
    ([0, 1] as const).forEach((i) => {
      const open = masks[i];
      if (!open) return;
      const m = maskMargins[i];
      if (m !== null && (maskMargin === null || Math.abs(maskMargin - m) < 1e-6)) {
        maskMargin = m;
        layers.push(i === 0 ? 'F.Mask' : 'B.Mask');
      } else apertures.push(this.aperture(open, p, f, i === 0 ? 'F.Mask' : 'B.Mask'));
    });
    // Paste: a margin and a ratio (KiCad grows each axis by margin + ratio × size), else aperture pads.
    let paste: { margin: number; ratio: number } | null = null;
    ([0, 1] as const).forEach((i) => {
      const open = pastes[i];
      if (!open) return;
      const ref = sideShape(i);
      const g = ref ? grownBy(ref, open) : null;
      let m: { margin: number; ratio: number } | null = null;
      if (g && ref) {
        if (Math.abs(g.mx - g.my) < 1e-6) m = { margin: g.mx, ratio: 0 };
        else if (ref.k !== 'custom' && Math.abs(ref.w - ref.h) > 1e-6) {
          const ratio = (g.mx - g.my) / (ref.w - ref.h);
          if (Math.abs(ratio) <= 1) m = { margin: g.mx - ratio * ref.w, ratio };
        }
      }
      if (m && (!paste || (Math.abs(paste.margin - m.margin) < 1e-6 && Math.abs(paste.ratio - m.ratio) < 1e-9))) {
        paste = m;
        layers.push(i === 0 ? 'F.Paste' : 'B.Paste');
      } else apertures.push(this.aperture(open, p, f, i === 0 ? 'F.Paste' : 'B.Paste'));
    });
    // Other layers: the copper's shape there, or an aperture pad.
    for (const { k, shape } of [...others, ...extra]) {
      if (shapeKey(shape) === shapeKey(main) && !layers.includes(k)) layers.push(k);
      else apertures.push(this.aperture(shape, p, f, k));
    }
    if (layers.includes('F.Mask') && layers.includes('B.Mask')) {
      layers.splice(layers.indexOf('F.Mask'), 1, '*.Mask');
      layers.splice(layers.indexOf('B.Mask'), 1);
    }
    if (!layers.length) return apertures;
    const [x, y] = f(p.at);
    const e: Sx = ['pad', quote(p.num), kind, shapeName(main), ['at', n(x), n(y), normAngle(p.rot) ? n(normAngle(p.rot)) : null]];
    e.push(...shapeLists(main).filter((l) => l && l[0] === 'size'));
    // The drill and the shape's offset from it.
    const off = offsetOf(main);
    if (hole && through) {
      const slot = hole.slot && Math.abs(hole.slot.w - hole.slot.h) > 1e-9 ? hole.slot : null;
      e.push(['drill', slot ? 'oval' : null, n(slot ? slot.w : hole.d), slot ? n(slot.h) : null, off ? ['offset', n(off.x), n(-off.y)] : null]);
    } else if (off) e.push(['drill', ['offset', n(off.x), n(-off.y)]]);
    e.push(['layers', ...layers.map(quote)]);
    e.push(...shapeLists(main).filter((l) => l && l[0] !== 'size'));
    // Copper on some layers only.
    if (kind === 'thru_hole') {
      if (present.length && present.length < L.copper.length) {
        const ends = present.includes('F.Cu') && present.includes('B.Cu');
        e.push(['remove_unused_layers', 'yes'], ['keep_end_layers', ends ? 'yes' : 'no']);
        const forced = present.filter((k) => !(ends && (k === 'F.Cu' || k === 'B.Cu')));
        if (forced.length) e.push(['zone_layer_connections', ...forced.map(quote)]);
      } else e.push(['remove_unused_layers', 'no']);
    }
    if (maskMargin !== null) e.push(['solder_mask_margin', n(maskMargin)]);
    if (paste) {
      e.push(['solder_paste_margin', n(paste.margin)]);
      if (Math.abs(paste.ratio) > 1e-9) e.push(['solder_paste_margin_ratio', n(paste.ratio)]);
    }
    e.push(this.nets.list(p.net));
    if (p.info?.function) e.push(['pinfunction', quote(p.info.function)]);
    if (p.info?.type) e.push(['pintype', quote(p.info.type)]);
    // Pad stacks: another shape on some copper layers.
    const stack = this.padstack(main, cu, present);
    if (stack) e.push(stack);
    e.push(this.uuid());
    return [e, ...apertures];
  }

  private padstack(main: PadShape, cu: Map<string, PadShape>, present: string[]): Sx | null {
    const L = this.layers;
    const key = shapeKey(main);
    if (present.every((k) => shapeKey(cu.get(k)) === key)) return null;
    const layer = (name: string, s: PadShape): Sx => {
      const off = offsetOf(s);
      return ['layer', quote(name), ['shape', shapeName(s)], ...shapeLists(s), off ? ['offset', n(off.x), n(-off.y)] : null];
    };
    const inner = L.copper.slice(1, -1);
    const innerShapes = inner.filter((k) => cu.has(k)).map((k) => cu.get(k));
    const innerSame = innerShapes.every((s) => shapeKey(s) === shapeKey(innerShapes[0]));
    const front = cu.get('F.Cu') ?? main;
    if (innerSame && shapeKey(front) === key) {
      return ['padstack', ['mode', 'front_inner_back'], layer('Inner', innerShapes[0] ?? main), layer('B.Cu', cu.get('B.Cu') ?? main)];
    }
    this.count('custom padstack');
    return ['padstack', ['mode', 'custom'], ...L.copper.map((k) => layer(k, cu.get(k) ?? main))];
  }

  // A pad of its own for an opening (or a shape on another layer): no number, no net, no margin.
  private aperture(shape: PadShape, p: DesignPad, f: ToKicad, k: string): Sx {
    this.count('aperture pad');
    const [x, y] = f(p.at);
    const off = offsetOf(shape);
    return [
      'pad', quote(''), 'smd', shapeName(shape), ['at', n(x), n(y), normAngle(p.rot) ? n(normAngle(p.rot)) : null], ...shapeLists(shape).filter((l) => l && l[0] === 'size'),
      off ? ['drill', ['offset', n(off.x), n(-off.y)]] : null, ['layers', quote(k)], ...shapeLists(shape).filter((l) => l && l[0] !== 'size'),
      /Mask/.test(k) ? ['solder_mask_margin', '0'] : null, /Paste/.test(k) ? ['solder_paste_margin', '0'] : null, this.uuid(),
    ];
  }

  // --- Graphics and text ---

  // Filled graphics with holes, as fractured polygons (KiCad's polygons have no holes).
  private async regionRings(graphics: DesignGraphic[]): Promise<Map<DesignGraphic, Ring[]>> {
    const out = new Map<DesignGraphic, Ring[]>();
    for (const g of graphics) {
      if (!('region' in g.shape) || !g.filled) continue;
      const polys = await flattenLayer(scratchLayer([{ k: 'region', contours: g.shape.region, dark: true }]), { tolerance: TOLERANCE });
      out.set(g, polys.map((p) => fracture(p.outer, p.holes)));
    }
    return out;
  }

  // The KiCad layer of a graphic or text: its layer's, or, on an outline layer, a user layer unless it is part of the
  // board shape (which Edge.Cuts gets from the design's outline). Null when it is not written.
  private layerOf(id: string, shape?: DesignShape, w = 0): string | null {
    const k = this.layers.get(id);
    if (!k) return null;
    if (this.layers.negative.has(id)) {
      this.count('on plane');
      return null;
    }
    if (k !== 'Edge.Cuts') return k;
    if (shape && this.outline.length && onOutline(shape, this.outline, Math.max(0.05, w / 2 + 0.01))) return null;
    return this.layers.extra(id, this.design);
  }

  private graphic(g: DesignGraphic, f: ToKicad, prefix: 'gr_' | 'fp_', regions: Map<DesignGraphic, Ring[]>): Sx[] {
    const k = this.layerOf(g.layer, g.shape, g.w);
    if (!k) return [];
    const s = g.shape;
    // KiCad plots an outline of width 0 with a pen of 0.1 mm; other programs' zero-width lines are hairlines, as the
    // viewer draws them (a filled shape of width 0 has no outline in either).
    const width = g.w > 0 ? g.w : g.filled || this.kicad ? 0 : HAIRLINE;
    const stroke: Sx = ['stroke', ['width', n(width)], ['type', g.dash ?? 'solid']];
    const layer: Sx = ['layer', quote(k)];
    const net = prefix === 'gr_' && this.layers.isCopper(k) && g.net ? ['net', String(this.nets.of(g.net))] as Sx : null;
    const tail = (): Sx[] => [layer, net, this.uuid()];
    if ('line' in s) return [[`${prefix}line`, xyOf(f, s.line[0], 'start'), xyOf(f, s.line[1], 'end'), stroke, ...tail()]];
    if ('arc' in s) {
      if (Math.abs(s.arc.sweep) >= 360 - 1e-9) return this.graphic({ ...g, shape: { circle: { c: s.arc.c, r: s.arc.r } }, filled: false }, f, prefix, regions);
      if (!(s.arc.r > 0)) return [];
      return [[`${prefix}arc`, ...arcLists(f, s.arc.c, s.arc.r, s.arc.start, s.arc.sweep), stroke, ...tail()]];
    }
    if ('circle' in s) {
      const c = s.circle.c;
      return [[`${prefix}circle`, xyOf(f, c, 'center'), xyOf(f, { x: c.x + s.circle.r, y: c.y }, 'end'), stroke, ['fill', g.filled ? 'yes' : 'no'], ...tail()]];
    }
    if ('poly' in s) {
      if (isCircle(s.poly)) {
        const seg = s.poly.segs[0];
        return this.graphic({ ...g, shape: { circle: { c: seg.arc.c, r: dist(s.poly.start, seg.arc.c) } } }, f, prefix, regions);
      }
      return [[`${prefix}poly`, ptsOf(f, s.poly), stroke, ['fill', g.filled ? 'yes' : 'no'], ...tail()]];
    }
    if ('region' in s) {
      if (g.filled) {
        const rings = regions.get(g) ?? [];
        return rings.map((r) => [`${prefix}poly`, ringPts(f, r), stroke, ['fill', 'yes'], ...tail()]);
      }
      return s.region.map((c) => [`${prefix}poly`, ptsOf(f, c), stroke, ['fill', 'no'], ...tail()]);
    }
    if ('curve' in s) return [[`${prefix}curve`, ['pts', ...s.curve.map((p) => xyOf(f, p))], stroke, ...tail()]];
    return [];
  }

  // The texts KiCad gets for a design text (see textParts).
  private texts(t: DesignText, f: ToKicad, c?: DesignComponent): Sx[] {
    return textParts(t).map((p) => this.text(p, null, f, c)).filter(Boolean);
  }

  // A text: a board text, a footprint's text, or its reference or value property (one line, or lines one pitch apart).
  private text(t: DesignText, property: 'Reference' | 'Value' | null, f: ToKicad, c?: DesignComponent): Sx | null {
    const k = this.layerOf(t.layer);
    if (!k || !(t.h > 0) || !(t.w > 0)) return null;
    const s = t.s;
    if (!s.trim()) return null;
    const [x, y] = f(t.at);
    const rot = normAngle(t.rot);
    // KiCad keeps a footprint's text upright (its angle in (−90°, 90°]) unless it is unlocked.
    const unlocked = c && rot > 90 + 1e-9 && rot <= 270 + 1e-9 ? ['unlocked', 'yes'] as Sx : null;
    // A KiCad board keeps its TrueType faces (and their outlines); other programs' TrueType text is in the stroke font,
    // as the viewer draws it.
    const keepFace = this.kicad && Boolean(t.font);
    if (t.font && !keepFace) this.count('truetype');
    if (t.thick > Math.min(t.h, t.w) * 0.25 + 1e-9) this.count('thick text');
    const font: Sx = [
      'font', keepFace ? ['face', quote(t.font)] : null, ['size', n(t.h), n(t.w)], ['thickness', n(t.thick)],
      t.bold ? ['bold', 'yes'] : null, t.italic ? ['italic', 'yes'] : null,
    ];
    const just = [t.just.h !== 'center' ? t.just.h : null, t.just.v !== 'middle' ? t.just.v : null, t.mirror ? 'mirror' : null].filter(Boolean) as string[];
    const effects: Sx = ['effects', font, just.length ? ['justify', ...just] : null];
    const layer: Sx = ['layer', quote(k), t.knockout ? 'knockout' : null];
    if (t.knockout && t.knockoutMargin !== undefined) this.count('knockout margin');
    const at: Sx = ['at', n(x), n(y), rot ? n(rot) : null];
    let head: Sx;
    if (property) head = ['property', quote(property), quote(s), at, unlocked, layer, this.uuid(), effects];
    else if (c) head = ['fp_text', 'user', quote(s), at, unlocked, layer, this.uuid(), effects];
    else head = ['gr_text', quote(s), at, layer, this.uuid(), effects];
    if (keepFace && t.outline?.length) head.push(this.renderCache(t, s));
    return head;
  }

  // The glyph outlines KiCad keeps for TrueType text (only for KiCad's own boards, whose texts have them).
  private renderCache(t: DesignText, s: string): Sx {
    const e: Sx = ['render_cache', quote(s), n(normAngle(t.rot))];
    let poly: Sx | null = null;
    for (const c of t.outline) {
      const pts = ptsOf(this.board_, c);
      if (contourArea(c) >= 0 || !poly) {
        poly = ['polygon', pts];
        e.push(poly);
      } else poly.push(pts);
    }
    return e;
  }

  private async graphics() {
    const d = this.design;
    const board = d.graphics.filter((g) => g.comp === undefined || !d.components[g.comp]);
    const regions = await this.regionRings(board);
    for (const g of board) {
      for (const e of this.graphic(g, this.board_, 'gr_', regions)) this.push(e);
      await this.tick();
    }
    // The board shape on Edge.Cuts.
    for (const c of this.outline) for (const e of this.edge(c)) this.push(e);
    for (const t of d.texts) {
      if (t.comp !== undefined && d.components[t.comp]) continue;
      for (const e of this.texts(t, this.board_)) this.push(e);
      await this.tick();
    }
  }

  // A contour of the board shape as lines, arcs and circles on Edge.Cuts.
  private edge(c: Contour): Sx[] {
    const out: Sx[] = [];
    // Each piece as wide as the outline graphic it lies on (else the most common width).
    const stroke = (p: Pt): Sx => {
      let w = this.outlineWidth;
      let best = Infinity;
      for (const g of this.edgeGraphics) {
        const d = graphicDistance(p, g.shape);
        if (d < best && d <= Math.max(0.05, g.w / 2 + 0.01)) [best, w] = [d, g.w > 0 ? g.w : this.outlineWidth];
      }
      return ['stroke', ['width', n(w)], ['type', 'solid']];
    };
    const tail = (p: Pt): Sx[] => [stroke(p), ['layer', quote('Edge.Cuts')], this.uuid()];
    const line = (a: Pt, b: Pt): Sx => ['gr_line', xyOf(this.board_, a, 'start'), xyOf(this.board_, b, 'end'), ...tail({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })];
    let from = c.start;
    for (const seg of c.segs) {
      if (seg.arc) {
        const { start, sweep } = segArc(from, seg);
        const r = dist(from, seg.arc.c);
        const mid = arcPoint(seg.arc.c, r, start + sweep / 2);
        if (Math.abs(sweep) >= 360 - 1e-9) {
          out.push(['gr_circle', xyOf(this.board_, seg.arc.c, 'center'), xyOf(this.board_, from, 'end'), tail(mid)[0], ['fill', 'no'], ['layer', quote('Edge.Cuts')], this.uuid()]);
        } else out.push(['gr_arc', ...arcLists(this.board_, seg.arc.c, r, start, sweep), ...tail(mid)]);
      } else if (dist(from, seg.to) > 1e-9) out.push(line(from, seg.to));
      from = seg.to;
    }
    if (dist(from, c.start) > 1e-9) out.push(line(from, c.start));
    return out;
  }

  // --- Tracks and vias ---

  private async copper() {
    const L = this.layers;
    for (const t of this.design.tracks) {
      await this.tick();
      if (!(t.w > 0)) continue;
      const k = L.get(t.layer);
      if (!k) continue;
      if (L.negative.has(t.layer)) {
        this.count('on plane');
        continue;
      }
      if (!L.isCopper(k)) {
        // A track on a layer that is not copper in KiCad: a line there.
        const shape: DesignShape = t.arc ? arcShape(t) : { line: [t.a, t.b] };
        for (const e of this.graphic({ layer: t.layer, shape, w: t.w, filled: false }, this.board_, 'gr_', new Map())) this.push(e);
        continue;
      }
      const tail = (): Sx[] => [['width', n(t.w)], ['layer', quote(k)], ['net', String(this.nets.of(t.net))], this.uuid()];
      if (t.arc) {
        const { start, sweep } = segArc(t.a, { to: t.b, arc: t.arc });
        const r = dist(t.a, t.arc.c);
        if (!(r > 0)) continue;
        // A full circle as two halves (KiCad's arcs end where they do not start).
        const parts = Math.abs(sweep) >= 360 - 1e-9 ? [[start, sweep / 2], [start + sweep / 2, sweep / 2]] : [[start, sweep]];
        for (const [s0, sw] of parts) this.push(['arc', ...arcLists(this.board_, t.arc.c, r, s0, sw), ...tail()]);
      } else {
        this.push(['segment', xyOf(this.board_, t.a, 'start'), xyOf(this.board_, t.b, 'end'), ...tail()]);
      }
    }
    for (const v of this.design.vias) {
      await this.tick();
      const e = this.via(v);
      if (e) this.push(e);
    }
  }

  private via(v: DesignVia): Sx | null {
    const L = this.layers;
    let from = L.get(v.from);
    let to = L.get(v.to);
    if (!from || !L.isCopper(from)) from = 'F.Cu';
    if (!to || !L.isCopper(to)) to = 'B.Cu';
    let i0 = L.copper.indexOf(from);
    let i1 = L.copper.indexOf(to);
    if (i0 > i1) [i0, i1] = [i1, i0];
    const span = L.copper.slice(i0, i1 + 1);
    const ringed = new Set(v.layers.map((id) => L.get(id)).filter((k) => k && L.isCopper(k)));
    const present = span.filter((k) => ringed.has(k));
    const type = v.type === 'micro' ? 'micro' : v.type === 'blind' || v.type === 'buried' || i0 > 0 || i1 < L.copper.length - 1 ? 'blind' : null;
    if (v.square) this.count('square via');
    const [x, y] = this.board_(v.at);
    const e: Sx = ['via', type, ['at', n(x), n(y)], ['size', n(v.d)], ['drill', n(v.drill)], ['layers', quote(span[0]), quote(span[span.length - 1])]];
    if (present.length < span.length) {
      const ends = present.includes(span[0]) && present.includes(span[span.length - 1]);
      e.push(['remove_unused_layers', 'yes'], ['keep_end_layers', ends ? 'yes' : 'no']);
      const forced = present.filter((k) => !(ends && (k === span[0] || k === span[span.length - 1])));
      if (forced.length) e.push(['zone_layer_connections', ...forced.map(quote)]);
    }
    // Other sizes on some layers: a pad stack with every copper layer's size.
    const sizes = v.sizes ?? {};
    const sized = new Map<string, number>();
    for (const [id, s] of Object.entries(sizes)) {
      const k = L.get(id);
      if (k && L.isCopper(k)) sized.set(k, s);
    }
    if ([...sized.values()].some((s) => Math.abs(s - v.d) > 1e-9)) {
      e.push(['padstack', ['mode', 'custom'], ...L.copper.map((k): Sx => ['layer', quote(k), ['size', n(sized.get(k) ?? v.d)]])]);
    }
    // The sides the via tents where the board leaves vias open.
    const tents = [
      span[0] === 'F.Cu' && !v.mask?.top && !this.tent.top ? 'front' : null,
      span[span.length - 1] === 'B.Cu' && !v.mask?.bottom && !this.tent.bottom ? 'back' : null,
    ].filter(Boolean) as string[];
    if (tents.length) e.push(['tenting', ...tents]);
    if (v.mask && Math.abs(v.mask.margin - this.maskMargin) > 1e-6 && (v.mask.top || v.mask.bottom)) this.count('via margin');
    e.push(['net', String(this.nets.of(v.net))], this.uuid());
    return e;
  }

  // --- Zones ---

  private async zoneFills(z: DesignZone): Promise<Fill[]> {
    const L = this.layers;
    const byLayer = new Map<string, { contours: Contour[]; lines: ArtItem[] }>();
    const entry = (k: string) => {
      let e = byLayer.get(k);
      if (!e) byLayer.set(k, (e = { contours: [], lines: [] }));
      return e;
    };
    for (const f of z.fill) {
      const k = L.get(f.layer);
      if (k) entry(k).contours.push(...f.contours);
    }
    for (const l of z.lines ?? []) {
      const k = L.get(l.layer);
      if (k && l.w > 0) entry(k).lines.push({ k: 'line', a: l.a, b: l.b, w: l.w, cap: 'round', dark: true });
    }
    const out: Fill[] = [];
    for (const [k, e] of byLayer) {
      // Fills of single outlines (KiCad's own, already fractured) are written as they are.
      if (!z.stroke && !e.lines.length && e.contours.every((c) => contourArea(c) > 0)) {
        out.push({ layer: k, rings: e.contours.map((c) => contourRing(c, TOLERANCE)).filter((r) => r.length >= 3) });
        continue;
      }
      const items: ArtItem[] = e.contours.length ? [{ k: 'region', contours: e.contours, dark: true }] : [];
      if (z.stroke) for (const c of e.contours) items.push(...strokeItems(c, z.stroke));
      items.push(...e.lines);
      const polys = await flattenLayer(scratchLayer(items), { tolerance: TOLERANCE });
      out.push({ layer: k, rings: polys.map((p) => fracture(p.outer, p.holes)) });
    }
    return out;
  }

  private async zones() {
    const d = this.design;
    const L = this.layers;
    // Priorities: KiCad fills higher numbers first; Altium's pour order and PADS's priority count the other way.
    const given = d.zones.filter((z) => !z.keepout && z.priority !== undefined).map((z) => z.priority);
    const top = given.length ? Math.max(...given) : 0;
    const priority = (z: DesignZone) => (z.priority === undefined ? 0 : this.kicad ? z.priority : top - z.priority);
    for (const z of d.zones) {
      await this.tick(1 + z.fill.length);
      if (z.keepout) {
        this.ruleArea(z);
        continue;
      }
      const copper = [...new Set(z.layers.map((id) => L.get(id)).filter((k) => k && L.isCopper(k)))];
      const fills = await this.zoneFills(z);
      const copperFills = fills.filter((f) => L.isCopper(f.layer));
      // Fills on layers that are not copper in KiCad: filled polygons there.
      for (const f of fills) {
        if (L.isCopper(f.layer)) continue;
        for (const r of f.rings) this.push(['gr_poly', ringPts(this.board_, r), ['stroke', ['width', '0'], ['type', 'solid']], ['fill', 'yes'], ['layer', quote(f.layer)], this.uuid()]);
      }
      if (!copper.length) continue;
      const settings: ZoneSettings = { ...ZONE_DEFAULTS, ...(z.stroke ? { minWidth: z.stroke } : {}) };
      this.zone({
        layers: copper, net: z.net, name: z.name, priority: z.teardrop ? 30000 : priority(z), outline: z.outline, fills: copperFills,
        filled: !z.unfilled && Boolean(z.fill.length || z.lines?.length), teardrop: z.teardrop, settings,
      });
    }
  }

  // A zone per outer contour of its outline (KiCad's zones have one), with the holes inside it and the fill that lies
  // in it.
  private zone(z: { layers: string[]; net: number; name?: string; priority: number; outline: Contour[]; fills: Fill[]; filled: boolean; teardrop?: boolean; settings: ZoneSettings }) {
    let parts = partsOf(z.outline);
    if (!parts.length) {
      // No outline: the box around the fill.
      const box = emptyBox();
      for (const f of z.fills) for (const r of f.rings) for (const p of r) {
        box.minX = Math.min(box.minX, p.x);
        box.minY = Math.min(box.minY, p.y);
        box.maxX = Math.max(box.maxX, p.x);
        box.maxY = Math.max(box.maxY, p.y);
      }
      if (isEmptyBox(box)) return;
      parts = [{ outer: [{ x: box.minX, y: box.minY }, { x: box.maxX, y: box.minY }, { x: box.maxX, y: box.maxY }, { x: box.minX, y: box.maxY }], holes: [] }];
    }
    const boxes = parts.map((p) => ringBox(p.outer));
    const owner = (r: Ring): number => {
      if (parts.length === 1) return 0;
      const b = ringBox(r);
      let best = 0;
      let bestScore = -Infinity;
      parts.forEach((p, i) => {
        if (!boxesMeet(b, boxes[i])) return;
        const inside = [0, 0.25, 0.5, 0.75].map((t) => r[Math.floor(t * r.length)]).filter((q) => insideRing(q, p.outer)).length;
        const overlap = Math.max(0, Math.min(b.maxX, boxes[i].maxX) - Math.max(b.minX, boxes[i].minX)) * Math.max(0, Math.min(b.maxY, boxes[i].maxY) - Math.max(b.minY, boxes[i].minY));
        const score = inside * 1e12 + overlap;
        if (score > bestScore) [best, bestScore] = [i, score];
      });
      return best;
    };
    const fillsOf = parts.map(() => [] as Sx[]);
    for (const f of z.fills) for (const r of f.rings) if (r.length >= 3) fillsOf[owner(r)].push(['filled_polygon', ['layer', quote(f.layer)], ringPts(this.board_, r)]);
    const s = z.settings;
    parts.forEach((p, i) => {
      const e: Sx = [
        'zone', ['net', String(this.nets.of(z.net))], ['net_name', quote(this.nets.names[this.nets.of(z.net)])],
        z.layers.length === 1 ? ['layer', quote(z.layers[0])] : ['layers', ...z.layers.map(quote)], this.uuid(),
        z.name ? ['name', quote(z.teardrop ? '$teardrop_padvia$' : z.name)] : z.teardrop ? ['name', quote('$teardrop_padvia$')] : null,
        ['hatch', 'edge', '0.5'], z.priority > 0 ? ['priority', String(Math.round(z.priority))] : null,
        z.teardrop ? ['attr', ['teardrop', ['type', 'padvia']]] : null,
        ['connect_pads', s.solid ? 'yes' : null, ['clearance', n(s.clearance)]], ['min_thickness', n(s.minWidth)], ['filled_areas_thickness', 'no'],
        ['fill', z.filled ? 'yes' : null, ['thermal_gap', n(s.thermalGap)], ['thermal_bridge_width', n(s.thermalWidth)]],
        ['polygon', ringPts(this.board_, p.outer)], ...p.holes.map((h): Sx => ['polygon', ringPts(this.board_, h)]),
        ...(z.filled ? fillsOf[i] : []),
      ];
      this.push(e);
    });
  }

  private ruleArea(z: DesignZone) {
    const L = this.layers;
    let layers = [...new Set(z.layers.map((id) => L.get(id)).filter((k) => k && L.isCopper(k)))];
    // A keep-out layer (Altium's) or another layer that is not copper keeps out on all copper layers.
    if (!layers.length) layers = L.copper.slice();
    const rules = keepoutRules(z.name);
    const word = (b: boolean) => (b ? 'not_allowed' : 'allowed');
    for (const p of partsOf(z.outline)) {
      this.push([
        'zone', ['net', '0'], ['net_name', quote('')], layers.length === 1 ? ['layer', quote(layers[0])] : ['layers', ...layers.map(quote)], this.uuid(),
        z.name ? ['name', quote(z.name)] : null, ['hatch', 'edge', '0.5'], ['connect_pads', ['clearance', '0']], ['min_thickness', '0.25'], ['filled_areas_thickness', 'no'],
        ['keepout', ['tracks', word(rules.tracks)], ['vias', word(rules.vias)], ['pads', word(rules.pads)], ['copperpour', word(rules.copperpour)], ['footprints', word(rules.footprints)]],
        ['fill', ['thermal_gap', '0.5'], ['thermal_bridge_width', '0.5']],
        ['polygon', ringPts(this.board_, p.outer)], ...p.holes.map((h): Sx => ['polygon', ringPts(this.board_, h)]),
      ]);
      this.count('rule area');
    }
  }

  // --- Planes ---

  // Each plane's copper as the viewer draws it: its own items (its area or the board shape, less what it keeps clear)
  // with every clear item drawn after them on its layer that reaches it (later planes' cuts, and what is cut out of
  // negative planes), flattened with polygon booleans. Collected first, so the work is known for the progress.
  private planeJobs(): PlaneJob[] {
    const d = this.design;
    const planes = d.planes ?? [];
    const L = this.layers;
    const objOf = new Map<number, number>();
    this.board.objects.forEach((ob, i) => {
      if (ob.design?.list === 'planes') objOf.set(ob.design.index, i);
    });
    const jobs: PlaneJob[] = [];
    planes.forEach((plane, index) => {
      const k = L.get(plane.layer);
      const layer = this.board.layers.find((l) => l.id === plane.layer);
      const obj = objOf.get(index);
      if (!k || !L.isCopper(k) || !layer || obj === undefined) return;
      const boxes = layer.apertures.map(apertureBox);
      const own: ArtItem[] = [];
      let first = -1;
      layer.items.forEach((it, i) => {
        if (it.obj !== obj) return;
        own.push(it);
        if (first < 0) first = i;
      });
      if (!own.length) return;
      const box = emptyBox();
      for (const it of own) if (it.dark) addItem(box, it, boxes);
      const later: ArtItem[] = [];
      for (let i = first + 1; i < layer.items.length; i += 1) {
        const it = layer.items[i];
        if (it.dark || it.obj === obj) continue;
        const b = emptyBox();
        addItem(b, it, boxes);
        if (boxesMeet(b, box)) later.push(it);
      }
      jobs.push({ index, k, layer, items: [...own, ...later] });
    });
    return jobs;
  }

  private async planes(jobs: PlaneJob[]) {
    const d = this.design;
    const L = this.layers;
    const holes = [...d.pads.filter((p) => p.hole).map((p) => ({ at: p.at, d: p.hole.slot ? Math.max(p.hole.slot.w, p.hole.slot.h) : p.hole.d })), ...d.vias.map((v) => ({ at: v.at, d: v.drill }))];
    const onLayer = new Map<string, number>();
    for (const { index, k, layer, items } of jobs) {
      const plane = d.planes[index];
      const polys: Polygon[] = await flattenLayer({ ...layer, items, negative: false }, {
        tolerance: TOLERANCE,
        pause: () => this.tick(0),
        onItems: (count) => {
          this.done += count;
        },
      });
      const rings = polys.map((p) => fracture(p.outer, p.holes));
      // Later planes of a layer lie over earlier ones, so they get higher priorities.
      const order = onLayer.get(k) ?? 0;
      onLayer.set(k, order + 1);
      // The zone's settings from what the plane keeps: its cuts are other nets' copper grown by the clearance, its
      // clearances holes grown by it; thermal reliefs give the gap and the spokes.
      const fromCuts = (plane.cuts ?? []).filter((c) => c.w > 0).map((c) => c.w / 2);
      const fromHoles = plane.clearances.map((c) => {
        const h = holes.find((q) => dist(q.at, c.at) < 1e-6);
        return h ? (c.d - h.d) / 2 : NaN;
      });
      const isolate = Number.parseFloat(plane.info?.Isolate ?? '');
      const settings: ZoneSettings = {
        clearance: Number.isFinite(isolate) && isolate > 0 ? isolate : median([...fromCuts, ...fromHoles], ZONE_DEFAULTS.clearance),
        minWidth: plane.stroke > 0 ? plane.stroke : ZONE_DEFAULTS.minWidth,
        thermalGap: median(plane.thermals.map((t) => t.gap), ZONE_DEFAULTS.thermalGap),
        thermalWidth: median(plane.thermals.map((t) => t.width), ZONE_DEFAULTS.thermalWidth),
        solid: !plane.thermals.length,
      };
      this.zone({
        layers: [k], net: plane.net, name: plane.name, priority: order, outline: plane.area ?? this.outline, fills: [{ layer: k, rings }], filled: true, settings,
      });
      this.count(L.negative.has(plane.layer) ? 'negative plane' : 'plane area');
      await this.tick(0);
    }
  }

  // --- Notes ---

  summary(): Map<string, number> {
    return this.counts;
  }

  // How far the board was moved (KiCad's coordinates are the design's, Y negated, plus this).
  offset(): { dx: number; dy: number } {
    return { dx: this.dx, dy: this.dy };
  }
}

function mode(values: number[]): number {
  const tally = new Map<number, number>();
  for (const v of values) {
    const key = Math.round(v * 1e6) / 1e6;
    tally.set(key, (tally.get(key) ?? 0) + 1);
  }
  let best = values[0];
  let most = 0;
  for (const [v, c] of tally) if (c > most) [best, most] = [v, c];
  return best;
}

function isCircle(c: Contour): boolean {
  return c.segs.length === 1 && Boolean(c.segs[0].arc) && dist(c.segs[0].to, c.start) < 1e-9;
}

function arcShape(t: { a: Pt; b: Pt; arc?: { c: Pt; ccw: boolean } }): DesignShape {
  const { start, sweep } = segArc(t.a, { to: t.b, arc: t.arc });
  return { arc: { c: t.arc.c, r: dist(t.a, t.arc.c), start, sweep } };
}

// The design layers that something is on.
function usedLayers(d: Design): Set<string> {
  const used = new Set<string>();
  for (const g of d.graphics) used.add(g.layer);
  for (const t of d.texts) used.add(t.layer);
  for (const t of d.tracks) used.add(t.layer);
  for (const p of d.pads) for (const s of p.shapes) for (const id of s.layers) used.add(id);
  for (const v of d.vias) for (const id of [v.from, v.to, ...v.layers]) used.add(id);
  for (const z of d.zones) {
    for (const id of z.layers) used.add(id);
    for (const f of z.fill) used.add(f.layer);
    for (const l of z.lines ?? []) used.add(l.layer);
  }
  for (const p of d.planes ?? []) used.add(p.layer);
  return used;
}

// A footprint name KiCad reads as a library identifier ("library:name"), its illegal characters replaced.
function footprintName(name: string): string {
  const colon = name.indexOf(':');
  const lib = colon >= 0 ? name.slice(0, colon) : '';
  const item = colon >= 0 ? name.slice(colon + 1) : name;
  const clean = (s: string, spaces: boolean) => s.replace(spaces ? /[\\/:"<>|*?\s\u0000-\u001f]/g : /[\\/:"<>|*?\u0000-\u001f]/g, '_');
  const l = clean(lib, true);
  const i = clean(item, false);
  return l ? `${l}:${i}` : i;
}

// The distance from a point to a contour's lines and arcs.
function contourDistance(p: Pt, c: Contour): number {
  let best = Infinity;
  let from = c.start;
  for (const seg of c.segs) {
    if (seg.arc) {
      const { start, sweep } = segArc(from, seg);
      const r = dist(from, seg.arc.c);
      const a = Math.atan2(p.y - seg.arc.c.y, p.x - seg.arc.c.x) / DEG;
      const rel = (((a - (sweep >= 0 ? start : start + sweep)) % 360) + 360) % 360;
      if (rel <= Math.abs(sweep) + 1e-9) best = Math.min(best, Math.abs(dist(p, seg.arc.c) - r));
      else best = Math.min(best, dist(p, from), dist(p, seg.to));
    } else {
      const dx = seg.to.x - from.x;
      const dy = seg.to.y - from.y;
      const len2 = dx * dx + dy * dy;
      const t = len2 ? Math.max(0, Math.min(1, ((p.x - from.x) * dx + (p.y - from.y) * dy) / len2)) : 0;
      best = Math.min(best, Math.hypot(p.x - (from.x + t * dx), p.y - (from.y + t * dy)));
    }
    from = seg.to;
  }
  if (dist(from, c.start) > 1e-9) {
    const dx = c.start.x - from.x;
    const dy = c.start.y - from.y;
    const len2 = dx * dx + dy * dy;
    const t = Math.max(0, Math.min(1, ((p.x - from.x) * dx + (p.y - from.y) * dy) / len2));
    best = Math.min(best, Math.hypot(p.x - (from.x + t * dx), p.y - (from.y + t * dy)));
  }
  return best;
}

// The distance from a point to the line of a graphic (its outline for closed shapes; curves are not measured).
function graphicDistance(p: Pt, s: DesignShape): number {
  if ('line' in s) return contourDistance(p, { start: s.line[0], segs: [{ to: s.line[1] }] });
  if ('arc' in s) {
    const a = arcPoint(s.arc.c, s.arc.r, s.arc.start);
    const b = arcPoint(s.arc.c, s.arc.r, s.arc.start + s.arc.sweep);
    if (Math.abs(s.arc.sweep) >= 360 - 1e-9) return Math.abs(dist(p, s.arc.c) - s.arc.r);
    return contourDistance(p, { start: a, segs: [{ to: b, arc: { c: s.arc.c, ccw: s.arc.sweep > 0 } }, { to: a, arc: { c: s.arc.c, ccw: s.arc.sweep < 0 } }] });
  }
  if ('circle' in s) return Math.abs(dist(p, s.circle.c) - s.circle.r);
  if ('poly' in s) return contourDistance(p, s.poly);
  if ('region' in s) return Math.min(...s.region.map((c) => contourDistance(p, c)));
  return Infinity;
}

// Whether a shape lies on the board shape (every point within the tolerance of it), so Edge.Cuts has it already.
function onOutline(s: DesignShape, outline: Contour[], tol: number): boolean {
  let pts: Pt[];
  if ('line' in s) pts = [s.line[0], s.line[1], { x: (s.line[0].x + s.line[1].x) / 2, y: (s.line[0].y + s.line[1].y) / 2 }];
  else if ('arc' in s) pts = [0, 0.25, 0.5, 0.75, 1].map((t) => arcPoint(s.arc.c, s.arc.r, s.arc.start + t * s.arc.sweep));
  else if ('circle' in s) pts = [0, 90, 180, 270].map((a) => arcPoint(s.circle.c, s.circle.r, a));
  else if ('poly' in s) pts = contourPoints(s.poly, 30);
  else if ('region' in s) pts = s.region.flatMap((c) => contourPoints(c, 30));
  else pts = s.curve;
  return pts.every((p) => outline.some((c) => contourDistance(p, c) <= tol));
}

// The design as a KiCad board file (text).
export async function kicadBoardText(board: Board, o: KicadOptions = {}): Promise<{ text: string; counts: Map<string, number>; offset: { dx: number; dy: number } }> {
  const design = board.design;
  if (!design) throw new Error('Only a board read from a design file can be saved for KiCad.');
  const w = new Writer(board, design, o);
  const text = await w.write();
  return { text, counts: w.summary(), offset: w.offset() };
}

// The design as a .kicad_pcb file.
export async function exportKicad(board: Board, o: KicadOptions = {}): Promise<Blob> {
  const { text } = await kicadBoardText(board, o);
  return new Blob([text], { type: 'application/octet-stream' });
}
