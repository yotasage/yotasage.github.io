// Reads PADS ASCII board files (PowerPCB V4.0 to current PADS Layout) into a Design (lib/pcb/model.ts): the layers
// (lib/pcb/pads/layers.ts), the board outline and its cutouts, 2D lines, copper and keep-outs (*LINES*), free text
// (*TEXT*), via types (*VIA*), part decals with their pieces, texts, labels, terminals and pad stacks (*PARTDECAL*),
// part types (*PARTTYPE*), parts (*PART*), the routes of the signals with their vias and teardrops (*ROUTE*, or the
// nets of *NET* and *CONN*), copper pours as last flooded (*POUR*), and from *MISC* the layer data, attributes and
// design rules. Plane layers whose copper the file does not store are drawn from their areas (lib/pcb/pads/planes.ts).
//
// Coordinates are in the file's units (basic units of 2/3 nm, mils, mm or inches) with Y up, angles in degrees
// counter-clockwise, arcs in tenths of a degree. A part's decal is turned by the part's angle and, on the bottom,
// mirrored left to right on the board (x negated after turning), which is the decal with its y negated turned by
// 180° minus the angle.
import { counterClockwise, DEG, polyArea, reverseContour } from '../geometry';
import { outlineFromGraphics } from '../design/outline';
import { padParts, ringPart, shapeExtent } from '../design/pads';
import {
  AperturePart, Contour, ContourSeg, Design, DesignComponent, DesignGraphic, DesignLayer, DesignPad, DesignShape, DesignText,
  DesignVia, DesignZone, PadShape, Pt, Stackup,
} from '../model';
import {
  child, decodePads, formatOf, isNumber, Lines, MiscNode, PadsFormat, PadsHeader, parseMisc, Section, splitSections, tokens, UNIT_MM,
} from './ascii';
import { PadsLayers } from './layers';
import { padsPlanes, PlaneArea, PlaneCut } from './planes';
import { placePadsText } from './text';

export interface PadsReadOptions {
  fileName?: string;
  onProgress?: (share: number) => void;
  // Awaited every few dozen milliseconds, so the page keeps answering.
  pause?: () => Promise<void>;
}

const SLICE_MS = 30;

// --- Records as read, in the units of their section (or decal) ---

// A corner of a piece, with the arc that leaves it towards the next corner (degrees, counter-clockwise positive).
interface Corner {
  x: number;
  y: number;
  arc?: { cx: number; cy: number; sweep: number };
}

interface Piece {
  type: string;
  width: number;
  style: number;
  level: number;
  // Decal copper: the pin (counted from 0) it belongs to.
  pin?: number;
  restrictions?: string;
  corners: Corner[];
}

interface TextRecord {
  x: number;
  y: number;
  ori: number;
  level: number;
  height: number;
  width: number;
  mirror: boolean;
  h: string;
  v: string;
  font: string;
  s: string;
}

interface LabelRecord extends TextRecord {
  visible: string;
}

interface StackLine {
  level: number;
  size: number;
  shape: string;
  rest: string[];
}

interface Decal {
  name: string;
  // Millimetres per unit of this decal.
  scale: number;
  pieces: Piece[];
  texts: TextRecord[];
  labels: LabelRecord[];
  terminals: { x: number; y: number; pin?: string }[];
  // By terminal number ("0": every terminal not listed).
  stacks: Map<string, StackLine[]>;
}

interface PartType {
  name: string;
  decals: string[];
  // Pin names of the terminals in order (alphanumeric pin mapping of older files).
  pinNames: string[];
  // Pin type and function by pin number, from the gates.
  pins: Map<string, { type?: string; function?: string }>;
  logic: string;
}

interface ViaType {
  name: string;
  drill: number;
  start?: number;
  end?: number;
  lines: StackLine[];
}

// Where a part's decal (or a lines item) lies on the board: decal point p goes to at + R(alpha)(p.x, ±p.y) × scale,
// y negated for a part on the bottom.
interface Frame {
  at: Pt;
  alpha: number;
  flip: boolean;
  scale: number;
}

function frameAt(f: Frame, x: number, y: number): Pt {
  const px = x * f.scale;
  const py = (f.flip ? -y : y) * f.scale;
  const a = f.alpha * DEG;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return { x: f.at.x + px * c - py * s, y: f.at.y + px * s + py * c };
}

// A direction in the decal (degrees) as a direction on the board.
function frameAngle(f: Frame, deg: number): number {
  return normalize(f.alpha + (f.flip ? -deg : deg));
}

function normalize(deg: number): number {
  const r = deg % 360;
  const n = r < 0 ? r + 360 : r;
  const rounded = Math.round(n * 1e9) / 1e9;
  return rounded === 360 ? 0 : rounded;
}

function num(s: string | undefined, fallback = 0): number {
  const v = s === undefined ? NaN : parseFloat(s);
  return Number.isFinite(v) ? v : fallback;
}

const VISIBLE = new Set(['VALUE', 'FULL_NAME', 'NAME', 'FULL_BOTH', 'BOTH', 'NONE']);

const STYLE_DASH: Record<number, DesignGraphic['dash']> = { 1: 'dash', 2: 'dot', 3: 'dash_dot', 4: 'dash_dot_dot' };

class PadsReader {
  design: Design;
  warnings: string[] = [];
  private counts = new Map<string, number>();
  private format: PadsFormat;
  // Millimetres per unit of the file.
  private unit: number;
  private sections = new Map<string, Section[]>();
  private misc: MiscNode[];
  layers: PadsLayers;
  private used = new Set<number>();
  private extraLayers: DesignLayer[] = [];
  private pcb = new Map<string, string[]>();
  private nets = new Map<string, number>();
  private pinNets = new Map<string, number>();
  private decals = new Map<string, Decal>();
  private partTypes = new Map<string, PartType>();
  private vias = new Map<string, ViaType>();
  private attrs = new Map<string, Map<string, string>>();
  // Copper cut-outs (*LINES* COPCUT items) by layer level, for planes whose flood is not saved.
  private cutouts: PlaneCut[] = [];
  // Plane areas without a saved flood, on mixed plane layers.
  private areas: PlaneArea[] = [];
  // Decal copper on paste and mask layers given for a pin: the pad gets no opening of its own there.
  private ownOpenings = new Set<string>();
  private rules = new Map<string, number>();
  private netRules = new Map<string, Map<string, number>>();

  constructor(private header: PadsHeader, text: string, private o: PadsReadOptions) {
    const { sections, remarks } = splitSections(text);
    for (const s of sections) {
      const list = this.sections.get(s.name);
      if (list) list.push(s);
      else this.sections.set(s.name, [s]);
    }
    this.format = formatOf(header, remarks);
    this.unit = UNIT_MM[header.units];
    this.misc = parseMisc(this.sections.get('MISC') ?? []);
    this.readPcb();
    this.layers = new PadsLayers(this.misc, num(this.pcb.get('MAXIMUMLAYER')?.[0], 0), header.layers250);
    const product = header.product === 'POWERPCB' ? 'PowerPCB' : header.product === 'LAYOUT' || header.product === 'PADS-LAYOUT' ? 'PADS Layout' : header.product;
    this.design = {
      format: `PADS ASCII (${product} V${header.version}, ${{ basic: 'basic units', mils: 'mils', mm: 'mm', inches: 'inches' }[header.units]})`,
      layers: [], nets: [''], outline: [], components: [], pads: [], tracks: [], vias: [], zones: [], graphics: [], texts: [], holes: [],
      warnings: this.warnings,
    };
  }

  count(what: string, n = 1) {
    this.counts.set(what, (this.counts.get(what) ?? 0) + n);
  }

  private lines(name: string): Lines[] {
    return (this.sections.get(name) ?? []).map((s) => new Lines(s.lines));
  }

  // --- Layers ---

  // The design layer of a level, marked as used.
  layer(n: number): string {
    this.used.add(n);
    return this.layers.id(n);
  }

  private extra(id: string, name: string, kind: DesignLayer['kind'], label?: string): string {
    if (!this.extraLayers.some((l) => l.id === id)) this.extraLayers.push({ id, name, kind, side: 'none', ...(label ? { label } : {}) });
    return id;
  }

  // --- *PCB* and *MISC* ---

  private readPcb() {
    for (const l of this.lines('PCB')) {
      for (let line = l.nextRecord(); line !== null; line = l.nextRecord()) {
        const t = tokens(line);
        if (t.length) this.pcb.set(t[0].toUpperCase(), t.slice(1));
      }
    }
  }

  private readMisc() {
    // Attributes of parts, part types and decals.
    const values = this.misc.find((n) => n.key === 'ATTRIBUTE' && n.value === 'VALUES');
    for (const n of values?.children ?? []) {
      if (!['PART', 'PARTTYPE', 'DECAL'].includes(n.key)) continue;
      const m = new Map<string, string>();
      for (const c of n.children) if (c.value.trim()) m.set(c.key, c.value.trim());
      this.attrs.set(`${n.key} ${n.value}`, m);
    }
    // Clearances: the default rule set, and rule sets for single nets.
    const rules = this.misc.find((n) => n.key === 'RULES_SECTION');
    const design = child(rules, 'DESIGN', 'RULES');
    for (const set of design?.children ?? []) {
      if (set.key !== 'RULE_SET') continue;
      const clearance = child(set, 'CLEARANCE_RULE');
      if (!clearance) continue;
      const forNode = child(set, 'FOR');
      const target = forNode?.children[0];
      const values = new Map<string, number>();
      for (const c of clearance.children) if (isNumber(c.value)) values.set(c.key, num(c.value) * this.unit);
      if (!target || target.key === 'DEFAULT') {
        for (const [k, v] of values) if (!this.rules.has(k)) this.rules.set(k, v);
      } else if (target.key === 'NET' && target.value) {
        this.netRules.set(target.value, values);
      }
    }
  }

  // A clearance rule for an object of a net (the larger of the net's own rule and the default).
  clearance(key: string, net?: string): number {
    const base = this.rules.get(key) ?? this.rules.get('COPPER_TO_TRACK') ?? 0.254;
    const own = net ? this.netRules.get(net)?.get(key) : undefined;
    return own !== undefined ? Math.max(base, own) : base;
  }

  private attr(kind: 'PART' | 'PARTTYPE' | 'DECAL', name: string, key: string): string | undefined {
    return this.attrs.get(`${kind} ${name}`)?.get(key);
  }

  // --- Nets ---

  net(name: string): number {
    let i = this.nets.get(name);
    if (i === undefined) {
      i = this.design.nets.length;
      this.design.nets.push(name);
      this.nets.set(name, i);
    }
    return i;
  }

  private pinNet(ref: string, pin: string, net: number) {
    const key = `${ref}.${pin}`;
    if (!this.pinNets.has(key)) this.pinNets.set(key, net);
  }

  // "U1.4" (the part names cannot have dots; pins can).
  private splitPin(token: string): [string, string] | null {
    const dot = token.indexOf('.');
    return dot > 0 ? [token.slice(0, dot), token.slice(dot + 1)] : null;
  }

  // --- Pieces, texts, labels ---

  private readPiece(l: Lines, decal: boolean): Piece | null {
    const t = tokens(l.next());
    if (t.length < 3) return null;
    const type = t[0].toUpperCase();
    const n = Math.max(0, Math.round(num(t[1])));
    const width = num(t[2]);
    let k = 3;
    let style = 0;
    if (this.format.lineStyle && isNumber(t[k]) && isNumber(t[k + 1])) style = num(t[k++]);
    const level = num(t[k++]);
    const piece: Piece = { type, width, style, level, corners: [] };
    const extra = t[k];
    if (extra !== undefined) {
      if (isNumber(extra)) {
        if (decal) piece.pin = num(extra);
      } else piece.restrictions = extra;
    }
    for (let i = 0; i < n && !l.done; i += 1) {
      const c = tokens(l.next());
      if (c.length < 2 || !isNumber(c[0]) || !isNumber(c[1])) {
        // Not a corner: the piece is shorter than it said.
        l.i -= 1;
        break;
      }
      const corner: Corner = { x: num(c[0]), y: num(c[1]) };
      if (c.length >= 8) {
        const ax1 = num(c[4]);
        const ay1 = num(c[5]);
        const ax2 = num(c[6]);
        const ay2 = num(c[7]);
        corner.arc = { cx: (ax1 + ax2) / 2, cy: (ay1 + ay2) / 2, sweep: num(c[3]) / 10 };
      }
      piece.corners.push(corner);
    }
    return piece;
  }

  // A text entry: the position line, the font line (PADS 2005 and later), the text.
  private readText(l: Lines, first: string): TextRecord | null {
    const t = tokens(first);
    if (t.length < 6) return null;
    let k = 6;
    let mirror = false;
    if (t[k] === 'M' || t[k] === 'N') mirror = t[k++] === 'M';
    const h = t[k] && !isNumber(t[k]) ? t[k++] : 'LEFT';
    const v = t[k] && !isNumber(t[k]) ? t[k++] : 'DOWN';
    const font = this.format.fontLine ? l.next().trim() : '';
    const s = l.next().replace(/\s+$/, '');
    return { x: num(t[0]), y: num(t[1]), ori: num(t[2]), level: num(t[3]), height: num(t[4]), width: num(t[5]), mirror, h, v, font, s };
  }

  // A label: like a text, with its visibility first and an attribute name for its text.
  private readLabel(l: Lines): LabelRecord | null {
    const first = l.next();
    const t = tokens(first);
    if (!t.length || !VISIBLE.has(t[0].toUpperCase())) {
      // Not a label line: give it back.
      l.i -= 1;
      return null;
    }
    const rec = this.readText(l, t.slice(1).join(' '));
    return rec ? { ...rec, visible: t[0].toUpperCase() } : null;
  }

  // --- Shapes from pieces ---

  // The corners of a piece on the board, with arcs as contour segments.
  private contour(p: Piece, f: Frame): Contour | null {
    const pts = p.corners.map((c) => frameAt(f, c.x, c.y));
    if (pts.length < 2) return null;
    const segs: ContourSeg[] = [];
    for (let i = 1; i < pts.length; i += 1) {
      const arc = p.corners[i - 1].arc;
      if (arc) {
        const c = frameAt(f, arc.cx, arc.cy);
        segs.push({ to: pts[i], arc: { c, ccw: f.flip ? arc.sweep < 0 : arc.sweep > 0 } });
      } else segs.push({ to: pts[i] });
    }
    const last = pts[pts.length - 1];
    if (Math.hypot(last.x - pts[0].x, last.y - pts[0].y) > 1e-9) segs.push({ to: pts[0] });
    return segs.length >= 2 ? { start: pts[0], segs } : null;
  }

  // The lines and arcs of an open piece.
  private path(p: Piece, f: Frame): DesignShape[] {
    const out: DesignShape[] = [];
    for (let i = 1; i < p.corners.length; i += 1) {
      const a = frameAt(f, p.corners[i - 1].x, p.corners[i - 1].y);
      const b = frameAt(f, p.corners[i].x, p.corners[i].y);
      const arc = p.corners[i - 1].arc;
      if (arc) {
        const c = frameAt(f, arc.cx, arc.cy);
        const r = Math.hypot(a.x - c.x, a.y - c.y);
        const start = Math.atan2(a.y - c.y, a.x - c.x) / DEG;
        const sweep = f.flip ? -arc.sweep : arc.sweep;
        if (r > 0 && Math.abs(sweep) > 1e-9) out.push(Math.abs(sweep) >= 360 - 1e-9 ? { circle: { c, r } } : { arc: { c, r, start, sweep } });
        else out.push({ line: [a, b] });
      } else out.push({ line: [a, b] });
    }
    return out;
  }

  // A circle piece: two corners at the ends of a diameter.
  private circle(p: Piece, f: Frame): { c: Pt; r: number } | null {
    if (p.corners.length < 2) return null;
    const a = frameAt(f, p.corners[0].x, p.corners[0].y);
    const b = frameAt(f, p.corners[1].x, p.corners[1].y);
    const r = Math.hypot(b.x - a.x, b.y - a.y) / 2;
    return r > 0 ? { c: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, r } : null;
  }

  // The filled shape of a closed or circle piece.
  private area(p: Piece, f: Frame): DesignShape | null {
    if (/CI[RC]|CCO|CIRCUT/.test(p.type) || p.type === 'CIRCLE') {
      const c = this.circle(p, f);
      return c ? { circle: c } : null;
    }
    const c = this.contour(p, f);
    return c ? { poly: counterClockwise(c) } : null;
  }

  private shapeContours(s: DesignShape): Contour[] {
    if ('poly' in s) return [s.poly];
    if ('region' in s) return s.region;
    if ('circle' in s) {
      const p = { x: s.circle.c.x + s.circle.r, y: s.circle.c.y };
      return [{ start: p, segs: [{ to: p, arc: { c: s.circle.c, ccw: true } }] }];
    }
    return [];
  }

  // A graphic; copper ones (copper items, not 2D lines) are what plane areas keep clear of.
  private graphic(layer: string, shape: DesignShape, w: number, filled: boolean, extra: Partial<DesignGraphic> = {}, copper = false) {
    if (copper) this.copperGraphics.add(this.design.graphics.length);
    this.design.graphics.push({ layer, shape, w, filled, ...extra });
  }

  // A text record as a design text.
  private text(r: TextRecord, layer: string, at: Pt, rot: number, mirror: boolean, scale: number, s: string, extra: Partial<DesignText> = {}) {
    const face = /^\S+\s+(.*)$/.exec(r.font)?.[1]?.trim() ?? '';
    const trueType = Boolean(face) && !/stroke font/i.test(face);
    const placed = placePadsText({ s, at, rot, mirror, height: r.height * scale, stroke: r.width * scale, h: r.h, v: r.v, trueType });
    if (!placed) return;
    this.design.texts.push({
      layer, s, ...placed, ...(trueType ? { font: face } : {}),
      ...(/bold/i.test(r.font.split(/\s/)[0] ?? '') ? { bold: true } : {}), ...extra,
    });
  }

  // --- *TEXT* ---

  readTexts() {
    for (const l of this.lines('TEXT')) {
      for (let line = l.nextRecord(); line !== null; line = l.nextRecord()) {
        const r = this.readText(l, line);
        if (!r || !r.s.trim()) continue;
        const layer = this.freeLayer(r.level);
        if (!layer) continue;
        this.text(r, layer, { x: r.x * this.unit, y: r.y * this.unit }, normalize(r.ori), r.mirror, this.unit, r.s);
      }
    }
  }

  // The layer of a free item's level: level 0 (all layers) gets a layer of its own.
  private freeLayer(level: number): string | null {
    if (level === 0) return this.extra('L0', 'All layers', 'other', 'All layers');
    if (level < 0) return null;
    return this.layer(level);
  }

  // --- *LINES* ---

  readLines() {
    for (const l of this.lines('LINES')) {
      for (let line = l.nextRecord(); line !== null; line = l.nextRecord()) {
        const t = tokens(line);
        if (t[0] === '*GET*' || t.length < 5) continue;
        const type = t[1].toUpperCase();
        const f: Frame = { at: { x: num(t[2]) * this.unit, y: num(t[3]) * this.unit }, alpha: 0, flip: false, scale: this.unit };
        const pieces = Math.max(0, Math.round(num(t[4])));
        // pieces [flags] [texts] [signal]
        let k = this.format.linesFlags ? 6 : 5;
        const texts = isNumber(t[k]) ? Math.max(0, Math.round(num(t[k++]))) : 0;
        const signal = t[k];
        if (/^\.REUSE\./.test(l.peekRecord() ?? '')) l.next();
        const list: Piece[] = [];
        for (let i = 0; i < pieces; i += 1) {
          const p = this.readPiece(l, false);
          if (p) list.push(p);
        }
        const textRecs: TextRecord[] = [];
        for (let i = 0; i < texts; i += 1) {
          const r = this.readText(l, l.next());
          if (r) textRecs.push(r);
        }
        this.lineItem(type, list, f, signal);
        for (const r of textRecs) {
          if (!r.s.trim()) continue;
          const layer = this.freeLayer(r.level);
          if (layer) this.text(r, layer, frameAt(f, r.x, r.y), normalize(r.ori), r.mirror, this.unit, r.s);
        }
      }
    }
  }

  private lineItem(type: string, pieces: Piece[], f: Frame, signal: string | undefined) {
    const w = (p: Piece) => p.width * f.scale;
    if (type === 'BOARD') {
      const id = this.extra('BOARD', 'Board outline', 'outline');
      for (const p of pieces) {
        if (p.type === 'CIRCLE' || p.type === 'BRDCIR') {
          const c = this.circle(p, f);
          if (c) this.graphic(id, { circle: c }, w(p), false);
        } else if (p.type === 'CLOSED' || p.type === 'BRDCLS') {
          const c = this.contour(p, f);
          if (c) this.graphic(id, { poly: c }, w(p), false);
        } else for (const s of this.path(p, f)) this.graphic(id, s, w(p), false);
      }
      return;
    }
    if (type === 'KEEPOUT') {
      for (const p of pieces) {
        const s = this.area(p, f);
        if (!s) continue;
        const layers = p.level > 0 ? [this.layer(p.level)] : this.copperIds(p.level === -2);
        this.design.zones.push({ layers, net: 0, name: restrictionsText(p.restrictions), outline: this.shapeContours(s), fill: [], keepout: true });
      }
      return;
    }
    if (type === 'COPCUT') {
      for (const p of pieces) {
        const s = this.area(p, f);
        if (!s || p.level <= 0) continue;
        this.cutouts.push({ level: p.level, shape: s, w: w(p) });
        this.design.zones.push({ layers: [this.layer(p.level)], net: 0, name: 'Copper cut-out', outline: this.shapeContours(s), fill: [], keepout: true });
      }
      return;
    }
    const net = signal ? this.net(signal) : 0;
    if (type === 'COPPER') {
      // Filled copper with its voids, copper lines and circles.
      const byLevel = new Map<number, { outer: Contour[]; holes: Contour[]; width: number }>();
      for (const p of pieces) {
        const layer = p.level > 0 ? this.layer(p.level) : null;
        if (!layer) continue;
        if (p.type === 'COPOPN') {
          for (const s of this.path(p, f)) this.graphic(layer, s, w(p), false, net ? { net } : {}, true);
          continue;
        }
        const s = this.area(p, f);
        if (!s) continue;
        const g = byLevel.get(p.level) ?? { outer: [], holes: [], width: 0 };
        byLevel.set(p.level, g);
        if (p.type === 'COPCUT' || p.type === 'COPCCO') g.holes.push(...this.shapeContours(s).map((c) => reverseContour(counterClockwise(c))));
        else {
          g.outer.push(...this.shapeContours(s));
          g.width = Math.max(g.width, w(p));
        }
      }
      for (const [level, g] of byLevel) {
        if (!g.outer.length) continue;
        const shape: DesignShape = g.holes.length || g.outer.length > 1 ? { region: [...g.outer, ...g.holes] } : { poly: g.outer[0] };
        // Filled copper is its polygon: PADS strokes the outline inside it.
        this.graphic(this.layer(level), shape, 0, true, net ? { net } : {}, true);
      }
      return;
    }
    // 2D lines (also dimensions): on copper levels too, as PADS plots them there.
    for (const p of pieces) {
      const layer = this.freeLayer(p.level);
      if (!layer) continue;
      const dash = STYLE_DASH[p.style];
      const extra: Partial<DesignGraphic> = dash ? { dash } : {};
      if (p.type === 'CIRCLE') {
        const c = this.circle(p, f);
        if (c) this.graphic(layer, { circle: c }, w(p), false, extra);
      } else if (p.type === 'CLOSED') {
        const c = this.contour(p, f);
        if (c) this.graphic(layer, { poly: c }, w(p), false, extra);
      } else for (const s of this.path(p, f)) this.graphic(layer, s, w(p), false, extra);
    }
  }

  private copperIds(innerOnly = false): string[] {
    const out: string[] = [];
    for (let n = 1; n <= this.layers.copper; n += 1) if (!innerOnly || (n > 1 && n < this.layers.copper)) out.push(this.layer(n));
    return out;
  }

  // --- *VIA* ---

  readVias() {
    for (const l of this.lines('VIA')) {
      for (let line = l.nextRecord(); line !== null; line = l.nextRecord()) {
        const t = tokens(line);
        if (t.length < 3 || isNumber(t[0])) continue;
        const via: ViaType = { name: t[0], drill: num(t[1]), lines: [] };
        if (isNumber(t[3]) && isNumber(t[4])) {
          via.start = num(t[3]);
          via.end = num(t[4]);
        }
        via.lines = this.stackLines(l, Math.round(num(t[2])));
        this.vias.set(via.name, via);
      }
    }
  }

  // The lines of a pad stack, as many as it says (a line that is not one ends it early).
  private stackLines(l: Lines, n: number): StackLine[] {
    const out: StackLine[] = [];
    for (let k = 0; k < n && !l.done; k += 1) {
      const s = this.stackLine(l.next());
      if (!s) {
        l.i -= 1;
        break;
      }
      out.push(s);
    }
    return out;
  }

  private stackLine(line: string): StackLine | null {
    const t = tokens(line);
    if (t.length < 2 || !isNumber(t[0])) return null;
    // "0 55 R" or, when the size is 0, sometimes "-1 0 R".
    return { level: num(t[0]), size: num(t[1]), shape: (t[2] ?? 'R').toUpperCase(), rest: t.slice(3) };
  }

  // --- *PARTDECAL* ---

  readDecals() {
    for (const l of this.lines('PARTDECAL')) {
      for (let line = l.nextRecord(); line !== null; line = l.nextRecord()) {
        const t = tokens(line);
        if (t.length < 7 || !/^[IM]$/i.test(t[1])) {
          this.count('decal-line');
          continue;
        }
        const scale = this.header.units === 'basic' ? this.unit : t[1].toUpperCase() === 'M' ? 1 : 0.0254;
        const decal: Decal = { name: t[0], scale, pieces: [], texts: [], labels: [], terminals: [], stacks: new Map() };
        const pieces = Math.round(num(t[4]));
        const terminals = Math.round(num(t[5]));
        const stacks = Math.round(num(t[6]));
        const texts = Math.round(num(t[7]));
        const labels = Math.round(num(t[8]));
        for (let i = 0; i < pieces; i += 1) {
          const p = this.readPiece(l, true);
          if (p) decal.pieces.push(p);
        }
        for (let i = 0; i < texts; i += 1) {
          const r = this.readText(l, l.next());
          if (r) decal.texts.push(r);
        }
        for (let i = 0; i < labels; i += 1) {
          const r = this.readLabel(l);
          if (r) decal.labels.push(r);
        }
        for (let i = 0; i < terminals; i += 1) {
          const tt = tokens(l.next().replace(/^\s*T/, ''));
          if (tt.length < 2) continue;
          decal.terminals.push({ x: num(tt[0]), y: num(tt[1]), ...(this.format.pinNumbers && tt[4] !== undefined ? { pin: tt[4] } : {}) });
        }
        for (let i = 0; i < stacks; i += 1) {
          const h = tokens(l.next());
          if (h[0] !== 'PAD') continue;
          decal.stacks.set(h[1], this.stackLines(l, Math.round(num(h[2]))));
        }
        this.decals.set(decal.name, decal);
      }
    }
  }

  // --- *PARTTYPE* ---

  readPartTypes() {
    for (const l of this.lines('PARTTYPE')) {
      for (let line = l.nextRecord(); line !== null; line = l.nextRecord()) {
        const t = tokens(line);
        if (t.length < 6) continue;
        let k = 2;
        if (this.format.partTypeUnits && /^[IM]$/i.test(t[k] ?? '')) k += 1;
        const type: PartType = { name: t[0], decals: t[1].split(':').filter(Boolean), pinNames: [], pins: new Map(), logic: t[k] ?? '' };
        const gates = Math.round(num(t[k + 1]));
        const signals = Math.round(num(t[k + 2]));
        const pinNames = Math.round(num(t[k + 3]));
        for (let g = 0; g < gates; g += 1) {
          const head = tokens(l.next());
          if (head[0] !== 'G' && head[0] !== 'S') continue;
          const n = Math.round(num(head[2]));
          const pins: string[] = [];
          while (pins.length < n && !l.done) {
            const more = tokens(l.next());
            if (!more.length) break;
            pins.push(...more);
          }
          for (const p of pins) {
            const parts = p.split('.');
            if (parts.length < 3) continue;
            type.pins.set(parts[0], { type: PIN_TYPES[parts[2].toUpperCase()], ...(parts[3] ? { function: parts.slice(3).join('.') } : {}) });
          }
        }
        for (let s = 0; s < signals; s += 1) l.next();
        while (type.pinNames.length < pinNames && !l.done) {
          const more = tokens(l.next());
          if (!more.length) break;
          type.pinNames.push(...more);
        }
        this.partTypes.set(type.name, type);
      }
    }
  }

  // --- Nets: *ROUTE*, *NET*, *CONN* ---

  // The pins of the nets in *NET* and *CONN* sections (files without routes).
  readNetLists() {
    for (const name of ['NET', 'NETLIST', 'CONN', 'CONNECTION']) {
      for (const l of this.lines(name)) {
        let net = 0;
        for (let line = l.nextRecord(); line !== null; line = l.nextRecord()) {
          const t = tokens(line);
          if (/^\*SIG(NAL)?\*$/i.test(t[0] ?? '')) {
            net = t[1] ? this.net(t[1]) : 0;
            continue;
          }
          if (!net) continue;
          for (const tok of t) {
            if (tok.startsWith('.')) continue;
            const p = this.splitPin(tok);
            if (p) this.pinNet(p[0], p[1], net);
          }
        }
      }
    }
  }

  async readRoutes(tick: () => Promise<void>) {
    const seenTracks = new Set<string>();
    const seenVias = new Set<string>();
    const key = (v: number) => Math.round(v * 1e5);
    for (const l of this.lines('ROUTE')) {
      let net = 0;
      let rows: string[][] = [];
      const flush = () => {
        if (rows.length) this.route(rows, net, seenTracks, seenVias, key);
        rows = [];
      };
      for (let line = l.nextRecord(); line !== null; line = l.nextRecord()) {
        const t = tokens(line);
        if (/^\*SIG(NAL)?\*$/i.test(t[0] ?? '')) {
          flush();
          net = t[1] ? this.net(t[1]) : 0;
          continue;
        }
        if (!t.length) continue;
        if (t.length >= 5 && isNumber(t[0]) && isNumber(t[1]) && isNumber(t[2])) {
          rows.push(t);
          continue;
        }
        // A pin pair: the pins of a connection; the coordinates of the last one end here.
        flush();
        for (const tok of t) {
          if (tok.startsWith('.')) continue;
          const p = this.splitPin(tok);
          if (p && net) this.pinNet(p[0], p[1], net);
        }
        await tick();
      }
      flush();
    }
  }

  // The coordinates of one connection: tracks between corners on their layer, arcs around corners flagged as arc
  // centres, vias where a via is named, and teardrops at pins and vias.
  private route(rows: string[][], net: number, seenTracks: Set<string>, seenVias: Set<string>, key: (v: number) => number) {
    const n = this.layers.copper;
    const pt = (r: string[]) => ({ x: num(r[0]) * this.unit, y: num(r[1]) * this.unit });
    for (let i = 0; i < rows.length; i += 1) {
      const r = rows[i];
      const p = pt(r);
      // A via.
      const words = r.slice(5);
      const viaName = words.find((w) => this.vias.has(w));
      if (viaName) {
        const k = `${key(p.x)},${key(p.y)},${viaName}`;
        if (!seenVias.has(k)) {
          seenVias.add(k);
          this.placeVia(viaName, p, net);
        }
      }
      // Teardrops.
      const td = words.indexOf('TEARDROP');
      if (td >= 0) this.teardrops(rows, i, words.slice(td + 1), net);
      if (i + 1 >= rows.length) break;
      const layer = num(r[2]);
      const w = num(r[3]) * this.unit;
      if (!(layer >= 1 && layer <= n) || !(w > 0)) continue;
      // An arc: this corner, a centre flagged 0x1000 with its direction, the next corner.
      const next = rows[i + 1];
      if ((num(next[4]) & 0x1000) && i + 2 < rows.length && /^(CW|CCW)$/.test(next[5] ?? '')) {
        const c = pt(next);
        const b = pt(rows[i + 2]);
        const k = `A${layer},${key(w)},${key(p.x)},${key(p.y)},${key(b.x)},${key(b.y)},${key(c.x)},${key(c.y)}`;
        if (!seenTracks.has(k)) {
          seenTracks.add(k);
          this.design.tracks.push({ layer: this.layer(layer), a: p, b, w, net, arc: { c, ccw: next[5] === 'CCW' } });
        }
        i += 1;
        continue;
      }
      const b = pt(next);
      const [lo, hi] = p.x < b.x || (p.x === b.x && p.y <= b.y) ? [p, b] : [b, p];
      const k = `${layer},${key(w)},${key(lo.x)},${key(lo.y)},${key(hi.x)},${key(hi.y)}`;
      if (seenTracks.has(k)) continue;
      seenTracks.add(k);
      this.design.tracks.push({ layer: this.layer(layer), a: p, b, w, net });
    }
  }

  private placeVia(name: string, at: Pt, net: number) {
    const v = this.vias.get(name);
    const n = this.layers.copper;
    const from = Math.max(1, Math.min(n, v.start ?? 1));
    const to = Math.max(1, Math.min(n, v.end ?? n));
    const [lo, hi] = from <= to ? [from, to] : [to, from];
    const sizes = new Map<number, number>();
    const scale = this.unit;
    for (const s of v.lines) {
      if (!['R', 'S', 'A', 'O', 'C', 'OF', 'RF'].includes(s.shape)) continue;
      const d = s.size * scale;
      if (s.level === -2) sizes.set(lo, d);
      else if (s.level === 0) sizes.set(hi, d);
      else if (s.level === -1) for (let k = lo + 1; k < hi; k += 1) if (!sizes.has(k)) sizes.set(k, d);
    }
    // Specific layers override the inner entry.
    for (const s of v.lines) if (s.level >= 1 && s.level <= n && s.level > lo && s.level < hi && ['R', 'S', 'A', 'O', 'C'].includes(s.shape)) sizes.set(s.level, s.size * scale);
    const d = sizes.get(lo) ?? Math.max(0, ...sizes.values());
    const layers: string[] = [];
    const per: Record<string, number> = {};
    for (let k = lo; k <= hi; k += 1) {
      const level = this.layers.levels.get(k);
      if (level?.plane === 'cam') continue;
      const size = sizes.get(k) ?? 0;
      if (!(size > 0)) continue;
      const id = this.layer(k);
      layers.push(id);
      if (Math.abs(size - d) > 1e-6) per[id] = size;
    }
    const outer = (k: number) => k === 1 || k === n;
    const type: DesignVia['type'] = outer(lo) && outer(hi) ? 'through' : outer(lo) || outer(hi) ? 'blind' : 'buried';
    const top = v.lines.find((s) => s.level === -2 && s.size > 0);
    const via: DesignVia = {
      at, d, drill: v.drill * scale, from: this.layer(lo), to: this.layer(hi), layers, net, type,
      ...(Object.keys(per).length ? { sizes: per } : {}),
      ...(top?.shape === 'S' ? { square: true } : {}),
    };
    // Solder mask: open where the via's stack has a solder mask entry, else tented (as PADS plots vias).
    const maskTop = this.layers.sideLayer('mask', 'top');
    const maskBottom = this.layers.sideLayer('mask', 'bottom');
    const maskT = v.lines.find((s) => s.level === maskTop && s.size > 0);
    const maskB = v.lines.find((s) => s.level === maskBottom && s.size > 0);
    if ((maskT && lo === 1) || (maskB && hi === n)) {
      via.mask = { top: Boolean(maskT && lo === 1), bottom: Boolean(maskB && hi === n), margin: ((maskT ?? maskB).size * scale - d) / 2 };
      if (via.mask.top) this.layer(maskTop);
      if (via.mask.bottom) this.layer(maskBottom);
    }
    this.design.vias.push(via);
    this.viaNames.push(name);
  }

  // --- Teardrops ---

  private teardropRows: { rows: string[][]; i: number; words: string[]; net: number }[] = [];

  private teardrops(rows: string[][], i: number, words: string[], net: number) {
    this.teardropRows.push({ rows, i, words, net });
  }

  // --- *POUR* ---

  async readPours(tick: () => Promise<void>) {
    interface PourItem { name: string; type: string; at: Pt; flags: number; owner?: string; signal?: string; priority?: number; pieces: { type: string; width: number; level: number; contour?: Contour; seg?: [Pt, Pt] }[] }
    const items: PourItem[] = [];
    for (const l of this.lines('POUR')) {
      for (let line = l.nextRecord(); line !== null; line = l.nextRecord()) {
        const t = tokens(line);
        if (t.length < 6) continue;
        const item: PourItem = { name: t[0], type: t[1].toUpperCase(), at: { x: num(t[2]) * this.unit, y: num(t[3]) * this.unit }, flags: num(t[5]), owner: t[6], pieces: [] };
        if (item.type === 'POUROUT' || item.type === 'HATOUT' || item.type === 'VOIDOUT') {
          item.signal = t[7];
          if (isNumber(t[10])) item.priority = num(t[10]);
        }
        if (/^\.REUSE\./.test(l.peekRecord() ?? '')) l.next();
        const pieces = Math.round(num(t[4]));
        for (let p = 0; p < pieces; p += 1) {
          const h = tokens(l.next());
          if (h.length < 5) continue;
          const corners = Math.round(num(h[1]));
          const arcs = Math.round(num(h[2]));
          const width = num(h[3]) * this.unit;
          const level = num(h[4]);
          const rows: string[][] = [];
          for (let k = 0; k < corners + arcs && !l.done; k += 1) {
            const r = tokens(l.next());
            if (r.length < 2 || !isNumber(r[0]) || !isNumber(r[1])) {
              l.i -= 1;
              break;
            }
            rows.push(r);
          }
          const type = h[0].toUpperCase();
          const at = (r: string[]) => ({ x: item.at.x + num(r[0]) * this.unit, y: item.at.y + num(r[1]) * this.unit });
          if (type === 'SEG') {
            if (rows.length >= 2) item.pieces.push({ type, width, level, seg: [at(rows[0]), at(rows[1])] });
            continue;
          }
          if (type === 'CIRCLE' || type === 'CIRCUT') {
            if (rows.length < 2) continue;
            const a = at(rows[0]);
            const b = at(rows[1]);
            const c = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
            const r = Math.hypot(b.x - a.x, b.y - a.y) / 2;
            const s = { x: c.x + r, y: c.y };
            if (r > 0) item.pieces.push({ type, width, level, contour: { start: s, segs: [{ to: s, arc: { c, ccw: true } }] } });
            continue;
          }
          // A polygon: corners, and arc lines (centre, start angle, sweep) between two corners.
          const segs: ContourSeg[] = [];
          let start: Pt | null = null;
          let pending: { c: Pt; sweep: number } | null = null;
          for (const r of rows) {
            if (r.length < 2) continue;
            if (r.length >= 4) {
              pending = { c: at(r), sweep: num(r[3]) / 10 };
              continue;
            }
            const p = at(r);
            if (!start) start = p;
            else if (pending) segs.push({ to: p, arc: { c: pending.c, ccw: pending.sweep > 0 } });
            else segs.push({ to: p });
            pending = null;
          }
          if (start && segs.length >= 2) item.pieces.push({ type, width, level, contour: { start, segs } });
        }
        items.push(item);
        await tick();
      }
    }
    // Pour outlines with what was flooded in them: hatch outlines, their voids, and thermals.
    const byName = new Map(items.map((i) => [i.name, i]));
    const ownerOf = (i: PourItem): PourItem | undefined => {
      let o = i;
      for (let guard = 0; guard < 4 && o && o.type !== 'POUROUT'; guard += 1) o = o.owner && o.owner !== o.name ? byName.get(o.owner) : undefined;
      return o?.type === 'POUROUT' ? o : undefined;
    };
    const zones = new Map<PourItem, DesignZone>();
    for (const item of items) {
      if (item.type !== 'POUROUT') continue;
      const piece = item.pieces.find((p) => p.contour);
      if (!piece) continue;
      const net = item.signal && item.signal !== '-1' ? this.net(item.signal) : 0;
      const zone: DesignZone = {
        layers: [this.layer(piece.level)], net, name: item.name, fill: [],
        // Cut-outs of a pour outline are its holes.
        outline: item.pieces.filter((p) => p.contour).map((p) => (/^CI?R?CUT|^CUTOUT/.test(p.type) ? reverseContour(counterClockwise(p.contour)) : counterClockwise(p.contour))),
        ...(item.priority !== undefined && item.priority >= 0 ? { priority: item.priority } : {}),
      };
      zones.set(item, zone);
    }
    const fills = new Map<DesignZone, Map<number, { contours: Contour[]; width: number }>>();
    for (const item of items) {
      if (item.type === 'POUROUT') continue;
      const owner = ownerOf(item);
      const zone = owner && zones.get(owner);
      if (!zone) {
        this.count('pour-orphan');
        continue;
      }
      for (const p of item.pieces) {
        if (item.type === 'PADTHERM' || item.type === 'VIATHERM') {
          if (p.seg) (zone.lines ??= []).push({ layer: this.layer(p.level), a: p.seg[0], b: p.seg[1], w: p.width });
          continue;
        }
        if (!p.contour) continue;
        let byLevel = fills.get(zone);
        if (!byLevel) fills.set(zone, (byLevel = new Map()));
        const f = byLevel.get(p.level) ?? { contours: [], width: 0 };
        byLevel.set(p.level, f);
        if (item.type === 'VOIDOUT') f.contours.push(reverseContour(counterClockwise(p.contour)));
        else {
          f.contours.push(counterClockwise(p.contour));
          f.width = Math.max(f.width, p.width);
        }
      }
    }
    for (const [item, zone] of zones) {
      const byLevel = fills.get(zone);
      let width = 0;
      for (const [level, f] of byLevel ?? []) {
        if (!f.contours.length) continue;
        zone.fill.push({ layer: this.layer(level), contours: f.contours });
        width = Math.max(width, f.width);
      }
      if (width > 0) zone.stroke = width;
      const level = item.pieces.find((p) => p.contour)?.level ?? 0;
      const plane = this.layers.levels.get(level)?.plane;
      if (!zone.fill.length) {
        if (plane === 'mixed' || plane === 'cam') {
          // A plane area whose flood the file does not keep: drawn from its outline (lib/pcb/pads/planes.ts).
          this.areas.push({ level, net: zone.net, contours: zone.outline, name: item.name, ...(item.priority !== undefined && item.priority >= 0 ? { priority: item.priority } : {}), order: this.areas.length });
          continue;
        }
        zone.unfilled = true;
      }
      this.design.zones.push(zone);
    }
  }

  // --- *PART* and the decals placed ---

  async readParts(tick: () => Promise<void>) {
    for (const l of this.lines('PART')) {
      for (let line = l.nextRecord(); line !== null; line = l.nextRecord()) {
        const t = tokens(line);
        if (t.length < 7 || !isNumber(t[2]) || !isNumber(t[3])) {
          if (t[0] !== '*STANDARD*') this.count('part-line');
          continue;
        }
        if (/^\.REUSE\./.test(l.peekRecord() ?? '')) l.next();
        const labelCount = isNumber(t[11]) ? Math.round(num(t[11])) : -1;
        const labels: LabelRecord[] = [];
        for (let i = 0; i < labelCount; i += 1) {
          const r = this.readLabel(l);
          if (r) labels.push(r);
        }
        for (const ref of expandRefs(t[0])) {
          this.placePart(ref, t, labelCount >= 0 ? labels : null);
          await tick();
        }
      }
    }
  }

  private placePart(ref: string, t: string[], labels: LabelRecord[] | null) {
    const [typeName, decalOverride] = t[1].split('@');
    const type = this.partTypes.get(typeName);
    const alt = Math.round(num(t[7]));
    const decalName = decalOverride ?? type?.decals[alt] ?? type?.decals[0] ?? typeName;
    let decal = this.decals.get(decalName);
    if (!decal && type) decal = type.decals.map((d) => this.decals.get(d)).find(Boolean);
    if (!decal) {
      this.count('part-no-decal');
      return;
    }
    const bottom = t[6] === 'M';
    const theta = normalize(num(t[4]));
    const at = { x: num(t[2]) * this.unit, y: num(t[3]) * this.unit };
    const alpha = bottom ? normalize(180 - theta) : theta;
    const f: Frame = { at, alpha, flip: bottom, scale: decal.scale };
    const index = this.design.components.length;
    const comp: DesignComponent = {
      ref, value: '', footprint: decal.name, at, rot: alpha, side: bottom ? 'bottom' : 'top', attrs: {}, fields: {},
    };
    // Value: the part's Value attribute, else the part type's, else the part type name.
    const value = this.attr('PART', ref, 'Value') ?? this.attr('PARTTYPE', typeName, 'Value') ?? typeName;
    comp.value = value;
    for (const [k, v] of [...(this.attrs.get(`PARTTYPE ${typeName}`) ?? []), ...(this.attrs.get(`PART ${ref}`) ?? [])]) {
      if (/^(value|ref\.?des\.?|part type)$/i.test(k) || /^(Design|Strategy|Rules|DFT)\./.test(k) || /^TEXT \d+$/.test(k)) continue;
      comp.fields[k] = v;
    }
    if (typeName !== value) comp.fields['Part type'] = typeName;
    this.design.components.push(comp);
    const side = bottom ? 'bottom' : 'top';
    const lvl = (level: number) => (bottom ? this.layers.mirror(level) : level);
    const outlineLayer = this.layers.sideLayer('silk', side);
    // Decal pieces: outlines on the silkscreen of the part's side, copper on its copper layer, keep-outs as rule areas,
    // and items on other layers there (mirrored to the bottom's layers for a part on the bottom).
    const copperSide = bottom ? this.layers.copper : 1;
    const pinNet = (pin: number | undefined) => {
      if (pin === undefined) return 0;
      const name = this.pinName(decal, type, pin);
      return this.pinNets.get(`${ref}.${name}`) ?? 0;
    };
    const groups = new Map<string, { layer: string; outer: Contour[]; holes: Contour[]; width: number; net: number; copper: boolean }>();
    const pinCopper = new Map<number, { level: number; parts: AperturePart[] }[]>();
    let tag = 0;
    for (const p of decal.pieces) {
      if (p.type === 'TAG') {
        if (p.level === 1) tag += 1;
        continue;
      }
      const w = p.width * f.scale;
      if (p.type.startsWith('KPT')) {
        const s = this.area(p, f);
        if (!s) continue;
        const layers = p.level > 0 ? [this.layer(lvl(p.level))] : p.level === -2 ? this.copperIds(true) : this.copperIds();
        this.design.zones.push({ layers, net: 0, name: restrictionsText(p.restrictions), outline: this.shapeContours(s), fill: [], keepout: true, comp: index });
        continue;
      }
      if (p.type.startsWith('COP')) {
        const level = p.level === 0 || p.level === -2 ? copperSide : p.level === -1 ? this.layers.copper + 1 - copperSide : lvl(p.level);
        if (level <= 0) continue;
        const layer = this.layer(level);
        const net = pinNet(p.pin);
        if (p.pin !== undefined && !this.layers.isCopper(level)) this.ownOpenings.add(`${index}:${p.pin}:${level}`);
        // Filled copper of a pin on a copper layer is part of the pad (in its openings too, as PADS plots it).
        const term = p.pin !== undefined ? decal.terminals[p.pin] : undefined;
        if (term && this.layers.isCopper(level) && (p.type === 'COPCLS' || p.type === 'COPCIR')) {
          const parts = this.localParts(p, term, f);
          if (parts.length) {
            const list = pinCopper.get(p.pin) ?? [];
            pinCopper.set(p.pin, list);
            list.push({ level, parts });
            continue;
          }
        }
        if (p.type === 'COPOPN') {
          for (const s of this.path(p, f)) this.graphic(layer, s, w, false, { comp: index, ...(net ? { net } : {}) }, this.layers.isCopper(level));
          continue;
        }
        const s = this.area(p, f);
        if (!s) continue;
        const key = `${tag}|${level}|${p.pin ?? ''}`;
        const g = groups.get(key) ?? { layer, outer: [], holes: [], width: 0, net, copper: this.layers.isCopper(level) };
        groups.set(key, g);
        if (p.type === 'COPCUT' || p.type === 'COPCCO') g.holes.push(...this.shapeContours(s).map((c) => reverseContour(counterClockwise(c))));
        else {
          g.outer.push(...this.shapeContours(s));
          g.width = Math.max(g.width, w);
        }
        continue;
      }
      // 2D lines.
      const level = p.level <= 0 || this.layers.isCopper(p.level) ? outlineLayer : lvl(p.level);
      if (level === undefined) continue;
      const layer = this.layer(level);
      const dash = STYLE_DASH[p.style];
      const extra: Partial<DesignGraphic> = { comp: index, ...(dash ? { dash } : {}) };
      if (p.type === 'CIRCLE') {
        const c = this.circle(p, f);
        if (c) this.graphic(layer, { circle: c }, w, false, extra);
      } else if (p.type === 'CLOSED') {
        const c = this.contour(p, f);
        if (c) this.graphic(layer, { poly: c }, w, false, extra);
      } else for (const s of this.path(p, f)) this.graphic(layer, s, w, false, extra);
    }
    for (const g of groups.values()) {
      if (!g.outer.length) continue;
      const shape: DesignShape = g.holes.length || g.outer.length > 1 ? { region: [...g.outer, ...g.holes] } : { poly: g.outer[0] };
      this.graphic(g.layer, shape, 0, true, { comp: index, ...(g.net ? { net: g.net } : {}) }, g.copper);
    }
    // Decal texts.
    for (const r of decal.texts) {
      if (!r.s.trim()) continue;
      const level = r.level <= 0 ? outlineLayer : lvl(r.level);
      if (level === undefined) continue;
      this.partText(r, this.layer(level), f, bottom, decal.scale, r.s, { comp: index, role: 'user' });
    }
    // Labels: the part's own (else the decal's), each showing an attribute.
    for (const r of labels ?? decal.labels) {
      if (r.visible === 'NONE') continue;
      const name = r.s.trim();
      const isRef = /^ref\.?\s*des\.?$/i.test(name);
      const isType = /^part\s*type$/i.test(name);
      const val = isRef ? ref : isType ? typeName : this.attr('PART', ref, name) ?? this.attr('PARTTYPE', typeName, name) ?? this.attr('DECAL', decal.name, name);
      const short = name.split('.').pop();
      let s: string | undefined;
      switch (r.visible) {
        case 'NAME': s = short; break;
        case 'FULL_NAME': s = name; break;
        case 'BOTH': s = val !== undefined ? `${short} = ${val}` : undefined; break;
        case 'FULL_BOTH': s = val !== undefined ? `${name} = ${val}` : undefined; break;
        default: s = val;
      }
      if (!s || !s.trim()) continue;
      let level: number | undefined;
      // Part types go to the assembly drawing (PADS's CAM documents leave them off the silkscreen), else to a layer of
      // their own.
      if (r.level <= 0 || this.layers.isCopper(r.level)) level = isType ? this.layers.assemblyLayer(side) ?? -1 : outlineLayer;
      else level = lvl(r.level);
      if (level === undefined) continue;
      const layer = level === -1 ? this.extra('TYPES', 'Part types', 'fab', 'Part types') : this.layer(level);
      this.partText(r, layer, labels ? { ...f, scale: this.unit } : f, bottom, labels ? this.unit : decal.scale, s, { comp: index, role: isRef ? 'reference' : isType ? 'value' : 'field' });
    }
    // Pads.
    this.placePads(decal, type, ref, index, f, bottom, pinCopper);
  }

  // Text of a part: placed in the part's frame, its angle relative to the part's, mirrored with a part on the bottom.
  private partText(r: TextRecord, layer: string, f: Frame, bottom: boolean, scale: number, s: string, extra: Partial<DesignText>) {
    const at = frameAt(f, r.x, r.y);
    const rot = frameAngle(f, normalize(r.ori));
    this.text(r, layer, at, bottom ? normalize(rot + 180) : rot, bottom !== r.mirror, scale, s, extra);
  }

  // The pin name of a terminal (counted from 0): the part type's alphanumeric pin names (a diode's A and C), else the
  // terminal's own pin number (PADS 2007 and later), else its place.
  private pinName(decal: Decal, type: PartType | undefined, i: number): string {
    return type?.pinNames[i] ?? decal.terminals[i]?.pin ?? String(i + 1);
  }

  // A filled copper piece of a pin in the pin's pad coordinates (the part's frame, y negated on the bottom).
  private localParts(p: Piece, term: { x: number; y: number }, f: Frame): AperturePart[] {
    const local = (x: number, y: number): Pt => ({ x: (x - term.x) * f.scale, y: (f.flip ? -(y - term.y) : y - term.y) * f.scale });
    if (p.type === 'COPCIR') {
      if (p.corners.length < 2) return [];
      const a = local(p.corners[0].x, p.corners[0].y);
      const b = local(p.corners[1].x, p.corners[1].y);
      const r = Math.hypot(b.x - a.x, b.y - a.y) / 2;
      return r > 0 ? [{ dark: true, circle: { c: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, r } }] : [];
    }
    const pts: Pt[] = [];
    p.corners.forEach((c, i) => {
      const here = local(c.x, c.y);
      pts.push(here);
      const next = p.corners[i + 1];
      if (!c.arc || !next) return;
      const centre = local(c.arc.cx, c.arc.cy);
      const r = Math.hypot(here.x - centre.x, here.y - centre.y);
      const start = Math.atan2(here.y - centre.y, here.x - centre.x);
      const sweep = (f.flip ? -c.arc.sweep : c.arc.sweep) * DEG;
      const steps = Math.max(2, Math.ceil(Math.abs(sweep) / (5 * DEG)));
      for (let k = 1; k < steps; k += 1) pts.push({ x: centre.x + r * Math.cos(start + (sweep * k) / steps), y: centre.y + r * Math.sin(start + (sweep * k) / steps) });
    });
    if (pts.length > 1 && Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].y - pts[pts.length - 1].y) < 1e-9) pts.pop();
    return pts.length >= 3 ? [{ dark: true, poly: polyArea(pts) < 0 ? pts.reverse() : pts }] : [];
  }

  private placePads(decal: Decal, type: PartType | undefined, ref: string, comp: number, f: Frame, bottom: boolean, pinCopper: Map<number, { level: number; parts: AperturePart[] }[]>) {
    const n = this.layers.copper;
    const copperSide = bottom ? n : 1;
    const other = bottom ? 1 : n;
    const maskOf = (s: 'top' | 'bottom') => this.layers.sideLayer('mask', s);
    const pasteOf = (s: 'top' | 'bottom') => this.layers.sideLayer('paste', s);
    decal.terminals.forEach((term, i) => {
      const stack = decal.stacks.get(String(i + 1)) ?? decal.stacks.get(term.pin ?? '\u0000') ?? decal.stacks.get('0') ?? [];
      const pin = this.pinName(decal, type, i);
      const net = this.pinNets.get(`${ref}.${pin}`) ?? 0;
      const at = frameAt(f, term.x, term.y);
      // The level of a stack line on the board: -2 the part's side, 0 the other side, -1 inner layers.
      const levelsOf = (s: StackLine): number[] => {
        if (s.level === -2) return [copperSide];
        if (s.level === 0) return [other];
        if (s.level === -1) {
          const out: number[] = [];
          for (let k = 2; k < n; k += 1) out.push(k);
          return out;
        }
        return [bottom ? this.layers.mirror(s.level) : s.level];
      };
      // Copper and other shapes per layer; a specific layer overrides the inner entry.
      const shapes = new Map<number, PadShape>();
      const explicit = new Set<number>();
      let drill: { d: number; plated: boolean; slot?: { ori: number; len: number; off: number } } | undefined;
      for (const s of stack) {
        const parsed = this.padShape(s, decal.scale, false, f.flip);
        if (parsed.drill && !drill) drill = parsed.drill;
        if (parsed.kind !== 'pad') continue;
        for (const level of levelsOf(s)) {
          if (s.level > 0) explicit.add(level);
          else if (explicit.has(level)) continue;
          if (parsed.shape) shapes.set(level, parsed.shape);
          else shapes.delete(level);
        }
      }
      // Copper pieces of the pin join its pad on their layers.
      for (const { level, parts } of pinCopper.get(i) ?? []) {
        const own = shapes.get(level);
        const all = [...(own ? padParts(own) : []), ...parts];
        const e = shapeExtent({ k: 'custom', w: 0, h: 0, parts: all });
        shapes.set(level, { k: 'custom', w: e.w, h: e.h, parts: all });
      }
      const pad: DesignPad = { comp, num: pin, net, at, rot: f.alpha, shapes: [], type: 'smd' };
      const info = type?.pins.get(pin);
      if (info && (info.type || info.function)) pad.info = { ...(info.function ? { function: info.function } : {}), ...(info.type ? { type: info.type } : {}) };
      // The hole; a slot's offset moves the pad's origin onto the hole.
      if (drill && drill.d > 0) {
        pad.type = drill.plated ? 'th' : 'np';
        pad.hole = { d: drill.d, plated: drill.plated };
        if (drill.slot && drill.slot.len > drill.d + 1e-6) {
          const ori = (f.flip ? -drill.slot.ori : drill.slot.ori);
          const along = Math.abs(Math.round(ori / 90)) % 2 === 0;
          pad.hole.slot = along ? { w: drill.slot.len, h: drill.d } : { w: drill.d, h: drill.slot.len };
          if (Math.abs(ori - Math.round(ori / 90) * 90) > 0.01) this.count('slot-angle');
          if (Math.abs(drill.slot.off) > 1e-9) {
            const off = { x: drill.slot.off * Math.cos(ori * DEG), y: drill.slot.off * Math.sin(ori * DEG) };
            pad.at = { x: at.x + off.x * Math.cos(f.alpha * DEG) - off.y * Math.sin(f.alpha * DEG), y: at.y + off.x * Math.sin(f.alpha * DEG) + off.y * Math.cos(f.alpha * DEG) };
            for (const [level, s] of shapes) shapes.set(level, { ...s, offset: { x: (s.offset?.x ?? 0) - off.x, y: (s.offset?.y ?? 0) - off.y } });
          }
        }
      }
      // Copper (not on CAM planes, which draw their own clearances and thermals); a bare non-plated hole has none.
      const copper = [...shapes].filter(([level]) => this.layers.isCopper(level) && this.layers.levels.get(level)?.plane !== 'cam');
      const bare = pad.type === 'np' && copper.every(([, s]) => (s.k === 'circle' || s.k === 'oval') && s.w <= pad.hole.d + 1e-6 && s.h <= pad.hole.d + 1e-6);
      const groups: { key: string; shape: PadShape; layers: string[] }[] = [];
      const add = (id: string, shape: PadShape) => {
        const key = JSON.stringify(shape);
        const g = groups.find((x) => x.key === key);
        if (g) g.layers.push(id);
        else groups.push({ key, shape, layers: [id] });
      };
      if (!bare) for (const [level, s] of copper.sort((a, b) => a[0] - b[0])) add(this.layer(level), s);
      // Solder mask and paste: the stack's own entries for those layers, else the copper on each outer side (mask) and on
      // an SMD pad's side (paste).
      for (const s of ['top', 'bottom'] as const) {
        const outer = s === 'top' ? 1 : n;
        const mask = maskOf(s);
        const paste = pasteOf(s);
        // A bare non-plated hole keeps its mask opening.
        const reaches = shapes.has(outer);
        if (mask !== undefined && !this.ownOpenings.has(`${comp}:${i}:${mask}`)) {
          const own = shapes.get(mask);
          const shape = explicitIn(stack, mask, bottom, this.layers) ? own : reaches ? shapes.get(outer) : undefined;
          if (shape) add(this.layer(mask), shape);
        }
        if (paste !== undefined && !this.ownOpenings.has(`${comp}:${i}:${paste}`)) {
          const own = shapes.get(paste);
          const shape = explicitIn(stack, paste, bottom, this.layers) ? own : reaches && !bare && pad.type === 'smd' ? shapes.get(outer) : undefined;
          if (shape) add(this.layer(paste), shape);
        }
      }
      // Pads on other layers (silkscreen, assembly, drill drawing, layer 25…).
      for (const [level, s] of shapes) {
        if (this.layers.isCopper(level) || level === maskOf('top') || level === maskOf('bottom') || level === pasteOf('top') || level === pasteOf('bottom')) continue;
        add(this.layer(level), s);
      }
      for (const g of groups) pad.shapes.push({ layers: g.layers, shape: g.shape });
      this.design.pads.push(pad);
      this.padStacks.push({ stack, scale: decal.scale, bottom });
    });
  }

  // The stack of each pad (in design.pads order), for the clearances and thermals of planes.
  padStacks: { stack: StackLine[]; scale: number; bottom: boolean }[] = [];

  // A stack line as a pad shape in pad coordinates (the part's frame, y negated on the bottom), a thermal, an antipad,
  // or nothing; and the drill it gives.
  padShape(s: StackLine, scale: number, via: boolean, flip = false): {
    kind: 'pad' | 'thermal' | 'antipad';
    shape?: PadShape;
    thermal?: { d: number; outer: number; width: number; spokes: number; angle: number; square: boolean };
    antipad?: { d: number; square: boolean };
    drill?: { d: number; plated: boolean; slot?: { ori: number; len: number; off: number } };
  } {
    const size = s.size * scale;
    const r = s.rest;
    if (s.shape === 'RT' || s.shape === 'ST') {
      // Decals: angle, outer size, spoke width, spokes; via stacks: outer size first.
      const angleFirst = !via || /\./.test(r[0] ?? '');
      const angle = num(angleFirst ? r[0] : r[1]);
      const outer = num(angleFirst ? r[1] : r[0]) * scale;
      return { kind: 'thermal', thermal: { d: size, outer, width: num(r[2]) * scale, spokes: Math.round(num(r[3], 4)), angle, square: s.shape === 'ST' } };
    }
    if (s.shape === 'RA' || s.shape === 'SA') return { kind: 'antipad', antipad: { d: size, square: s.shape === 'SA' } };
    let k = 0;
    let shape: PadShape | undefined;
    const corner = () => (this.format.cornerRadius && isNumber(r[k]) ? num(r[k++]) * scale : 0);
    const withCorner = (base: PadShape, c: number): PadShape => {
      if (c > 1e-9) return { ...base, k: 'roundrect', r: Math.min(c, base.w / 2, base.h / 2) };
      if (c < -1e-9) return { ...base, k: 'chamfer', chamfer: { size: Math.min(-c, base.w / 2, base.h / 2), corners: ['tl', 'tr', 'bl', 'br'] } };
      return base;
    };
    switch (s.shape) {
      case 'S': {
        const c = corner();
        shape = withCorner({ k: 'rect', w: size, h: size }, c);
        break;
      }
      case 'A': {
        const inner = num(r[k++]) * scale;
        shape = inner > 0 && inner < size ? { k: 'custom', w: size, h: size, parts: [ringPart({ x: 0, y: 0 }, size / 2, inner / 2)] } : { k: 'circle', w: size, h: size };
        break;
      }
      case 'OF':
      case 'RF': {
        const ori = (flip ? -1 : 1) * num(r[k++]);
        const len = num(r[k++]) * scale;
        const off = num(r[k++]) * scale;
        const c = s.shape === 'RF' ? corner() : 0;
        shape = fingerShape(s.shape === 'OF' ? 'oval' : 'rect', len, size, ori, off, c, withCorner);
        break;
      }
      default:
        shape = { k: 'circle', w: size, h: size };
    }
    const out: ReturnType<PadsReader['padShape']> = { kind: 'pad', ...(size > 0 && shape ? { shape } : {}) };
    // [drill [P|N]] [slot orientation, length, offset]
    if (isNumber(r[k])) {
      const d = num(r[k++]) * scale;
      let plated = true;
      if (r[k] === 'P' || r[k] === 'N') plated = r[k++] === 'P';
      let slot: { ori: number; len: number; off: number } | undefined;
      if (isNumber(r[k]) && isNumber(r[k + 1])) slot = { ori: num(r[k]), len: num(r[k + 1]) * scale, off: num(r[k + 2]) * scale };
      if (d > 0) out.drill = { d, plated, ...(slot ? { slot } : {}) };
    }
    return out;
  }

  // --- Teardrops ---

  // A teardrop where a track leaves a pad or via: a taper from the pad's sides to the track's edges some way along
  // the track (PADS's TEARDROP P or N, with a width and a length in percent of the pad size).
  private makeTeardrops() {
    // Pads and vias by layer and position (a micrometre grid: teardrops start at their centres).
    const byPlace = new Map<string, { at: Pt; r: number }[]>();
    const place = (id: string, x: number, y: number) => `${id},${Math.round(x * 1000)},${Math.round(y * 1000)}`;
    const push = (id: string, at: Pt, r: number) => {
      const key = place(id, at.x, at.y);
      const list = byPlace.get(key);
      if (list) list.push({ at, r });
      else byPlace.set(key, [{ at, r }]);
    };
    for (const p of this.design.pads) {
      for (const s of p.shapes) {
        const r = Math.min(s.shape.w, s.shape.h) / 2;
        if (r > 0 && !s.shape.offset) for (const id of s.layers) push(id, p.at, r);
      }
    }
    for (const v of this.design.vias) for (const id of v.layers) push(id, v.at, (v.sizes?.[id] ?? v.d) / 2);
    const seen = new Set<string>();
    for (const { rows, i, words, net } of this.teardropRows) {
      const here = { x: num(rows[i][0]) * this.unit, y: num(rows[i][1]) * this.unit };
      for (let k = 0; k < words.length; k += 1) {
        const which = words[k];
        if (which !== 'P' && which !== 'N') continue;
        const width = num(words[k + 1]);
        const length = num(words[k + 2]);
        const j = which === 'P' ? i - 1 : i + 1;
        const seg = which === 'P' ? rows[i - 1] : rows[i];
        if (!rows[j] || !seg) continue;
        const level = num(seg[2]);
        const w = num(seg[3]) * this.unit;
        if (!this.layers.isCopper(level) || !(w > 0)) continue;
        const id = this.layers.id(level);
        const pad = (byPlace.get(place(id, here.x, here.y)) ?? []).sort((a, b) => b.r - a.r)[0];
        if (!pad || pad.r * 2 <= w * 1.05) continue;
        const to = { x: num(rows[j][0]) * this.unit, y: num(rows[j][1]) * this.unit };
        const key = `${id},${Math.round(here.x * 1e4)},${Math.round(here.y * 1e4)},${Math.round(to.x * 1e4)},${Math.round(to.y * 1e4)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const c = teardrop(here, to, pad.r, w, width / 100, length / 100);
        if (c) this.design.zones.push({ layers: [id], net, outline: [c], fill: [{ layer: id, contours: [c] }], teardrop: true });
      }
    }
  }

  // --- The board shape ---

  private readOutline() {
    const lines = this.design.graphics.filter((g) => g.layer === 'BOARD');
    if (!lines.length) return;
    const shape = outlineFromGraphics(lines);
    this.design.outline = shape.contours;
    this.warnings.push(...shape.warnings);
  }

  // --- All ---

  async read(tick: () => Promise<void>, next: () => void): Promise<Design> {
    this.readMisc();
    this.readVias();
    this.readDecals();
    this.readPartTypes();
    next();
    this.readNetLists();
    await this.readRoutes(tick);
    next();
    this.readTexts();
    this.readLines();
    next();
    await this.readParts(tick);
    next();
    this.makeTeardrops();
    await this.readPours(tick);
    next();
    this.readOutline();
    const planes = padsPlanes({
      design: this.design, layers: this.layers, areas: this.areas, cutouts: this.cutouts, copperGraphics: this.copperGraphics,
      clearance: (key, net) => this.clearance(key, net), padStacks: this.padStacks, viaTypes: this.viaNames.map((n) => this.vias.get(n)),
      id: (n) => this.layer(n), padShape: (s, scale, via, flip) => this.padShape(s, scale, via, flip), pcb: this.pcb, unit: this.unit,
    });
    if (planes.planes.length) this.design.planes = planes.planes;
    this.warnings.push(...planes.warnings);
    next();
    return this.finish();
  }

  // The via type of each via (in design.vias order).
  private viaNames: string[] = [];

  // Graphics that are copper (copper items of *LINES* and decals), which planes keep clear of.
  copperGraphics = new Set<number>();

  private finish(): Design {
    const layers: DesignLayer[] = [];
    for (let n = 1; n <= this.layers.copper; n += 1) this.used.add(n);
    for (const n of [...this.used].sort((a, b) => a - b)) layers.push(this.layers.designLayer(n));
    layers.push(...this.extraLayers);
    this.design.layers = layers;
    const stackup: Stackup = { copperLayers: this.layers.copper };
    let thickness = 0;
    for (const l of this.layers.levels.values()) if (this.layers.isCopper(l.n)) thickness += l.thickness + l.copperThickness;
    if (thickness > 0) stackup.thickness = Math.round(thickness * 1e4) / 1e4;
    this.design.stackup = stackup;
    const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
    const unfilled = this.design.zones.filter((z) => z.unfilled).length;
    if (unfilled) {
      this.warnings.push(`${plural(unfilled, 'copper pour has', 'copper pours have')} no flood saved in the file, so only ${unfilled === 1 ? 'its outline is' : 'their outlines are'} shown. Flood the pours in PADS Layout and export the ASCII file again to see the copper.`);
    }
    const notes: [string, string, string][] = [
      ['part-no-decal', 'part has no decal in the file and is', 'parts have no decal in the file and are'],
      ['pour-orphan', 'flooded copper item belongs to no pour outline and is', 'flooded copper items belong to no pour outline and are'],
    ];
    for (const [key, one, many] of notes) {
      const n = this.counts.get(key);
      if (n) this.warnings.push(`${plural(n, one, many)} not shown.`);
    }
    const slots = this.counts.get('slot-angle');
    if (slots) this.warnings.push(`${plural(slots, 'slot at an angle to its pad is', 'slots at an angle to their pads are')} drawn along the nearest axis.`);
    const bad = (this.counts.get('decal-line') ?? 0) + (this.counts.get('part-line') ?? 0);
    if (bad) this.warnings.push(`${plural(bad, 'line', 'lines')} of the part decals or parts could not be read.`);
    const fonts = this.design.texts.filter((t) => t.font).length;
    if (fonts) this.warnings.push(`${plural(fonts, 'text uses a TrueType font', 'texts use TrueType fonts')}; the stroke font stands in.`);
    return this.design;
  }
}

// A lined teardrop from a pad of radius r at `at` along the track towards `to` (track width w): as wide as the pad
// at its centre, narrowing to the track's width some way past the pad's edge, as a counter-clockwise contour. Fitted
// to Linear's Gerber files: for TEARDROP 90 90 the taper ends 0.51 pad diameters beyond the pad's edge.
function teardrop(at: Pt, to: Pt, r: number, w: number, width: number, length: number): Contour | null {
  const dx = to.x - at.x;
  const dy = to.y - at.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-9) return null;
  const ux = dx / len;
  const uy = dy / len;
  // A track shorter than the teardrop gets none (E4 of the sample).
  const reach = r + length * 2 * r * TEARDROP_REACH;
  if (reach <= r || reach > len) return null;
  const half = Math.max(w / 2, Math.min(r, width * r * TEARDROP_WIDTH));
  const p = (u: number, v: number): Pt => ({ x: at.x + ux * u - uy * v, y: at.y + uy * u + ux * v });
  const pts = [p(0, -half), p(reach, -w / 2), p(reach, w / 2), p(0, half)];
  return counterClockwise({ start: pts[0], segs: [{ to: pts[1] }, { to: pts[2] }, { to: pts[3] }, { to: pts[0] }] });
}

// Teardrop proportions fitted to Linear's Gerber files (see "Notes from S6" in the plan).
const TEARDROP_REACH = 0.57;
const TEARDROP_WIDTH = 1.11;

// A finger pad (oval or rectangle) len long along `ori` and width wide, its centre `off` along `ori` from the hole.
function fingerShape(k: 'oval' | 'rect', len: number, width: number, ori: number, off: number, corner: number, withCorner: (s: PadShape, c: number) => PadShape): PadShape {
  const quarter = Math.round(ori / 90);
  const square = Math.abs(ori - quarter * 90) < 1e-6;
  const offset = Math.abs(off) > 1e-9 ? { x: off * Math.cos(ori * DEG), y: off * Math.sin(ori * DEG) } : null;
  if (square) {
    const along = quarter % 2 === 0;
    const base: PadShape = { k, w: along ? len : width, h: along ? width : len, ...(offset ? { offset: round(offset) } : {}) };
    return k === 'rect' ? withCorner(base, corner) : base;
  }
  // At another angle: the outline turned, as a custom shape.
  const a = ori * DEG;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const o = offset ?? { x: 0, y: 0 };
  const turn = (x: number, y: number): Pt => ({ x: o.x + x * c - y * s, y: o.y + x * s + y * c });
  if (k === 'rect') {
    const pts = [turn(-len / 2, -width / 2), turn(len / 2, -width / 2), turn(len / 2, width / 2), turn(-len / 2, width / 2)];
    return { k: 'custom', w: len, h: width, parts: [{ dark: true, poly: pts }] };
  }
  const r = Math.min(len, width) / 2;
  const half = Math.max(0, len - width) / 2;
  const parts = [{ dark: true, circle: { c: turn(-half, 0), r } }, { dark: true, circle: { c: turn(half, 0), r } }];
  if (half > 0) parts.push({ dark: true, poly: [turn(-half, -r), turn(half, -r), turn(half, r), turn(-half, r)] } as never);
  return { k: 'custom', w: len, h: width, parts };
}

function round(p: Pt): Pt {
  return { x: Math.round(p.x * 1e9) / 1e9, y: Math.round(p.y * 1e9) / 1e9 };
}

// Whether a stack has an entry for a layer (a level on the board, mirrored for a part on the bottom).
function explicitIn(stack: StackLine[], level: number, bottom: boolean, layers: PadsLayers): boolean {
  return stack.some((s) => s.level > 0 && (bottom ? layers.mirror(s.level) : s.level) === level);
}

// "C{2-20}" in the part list: C2 to C20.
function expandRefs(ref: string): string[] {
  const m = /^(.*)\{(\d+)-(\d+)\}(.*)$/.exec(ref);
  if (!m) return [ref];
  const a = Number(m[2]);
  const b = Number(m[3]);
  if (!(b >= a) || b - a > 10000) return [ref];
  const out: string[] = [];
  for (let i = a; i <= b; i += 1) out.push(`${m[1]}${i}${m[4]}`);
  return out;
}

const PIN_TYPES: Record<string, string> = {
  S: 'source', B: 'bidirectional', C: 'open collector', T: 'tri-state', L: 'load', Z: 'terminator', P: 'power', G: 'ground', U: 'undefined',
};

const RESTRICTIONS: Record<string, string> = {
  P: 'placement', H: 'component height', R: 'traces and copper', C: 'copper pour and plane area', V: 'vias and jumpers', T: 'test points', A: 'accordion',
};

function restrictionsText(r: string | undefined): string {
  const list = [...(r ?? '')].map((c) => RESTRICTIONS[c.toUpperCase()]).filter(Boolean);
  return list.length ? `Keep-out: ${list.join(', ')}` : 'Keep-out';
}

// Reads a PADS ASCII board (.asc) into a design.
export async function readPadsBoard(bytes: Uint8Array, options: PadsReadOptions = {}): Promise<Design> {
  const { text, header } = decodePads(bytes);
  const r = new PadsReader(header, text, options);
  let slice = performance.now();
  let step = 0;
  const steps = 7;
  const tick = async () => {
    if (performance.now() - slice < SLICE_MS) return;
    options.onProgress?.(Math.min(1, step / steps));
    if (options.pause) await options.pause();
    slice = performance.now();
  };
  return r.read(tick, () => {
    step += 1;
  });
}
