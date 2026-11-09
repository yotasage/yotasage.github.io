// Reads EAGLE XML boards (.brd of EAGLE 6 to 9, and the EAGLE files Fusion 360 Electronics exports) into a Design
// (lib/pcb/model.ts): the layers (lib/pcb/eagle/layers.ts), the design rules (rules.ts), the packages of the board's
// libraries placed as elements (pads, SMDs, holes, wires with curves, circles, rectangles, polygons and text), the
// elements' smashed attributes, the signals' wires, vias and polygons with the nets of their contact references, the
// plain items, and the board shape from the Dimension and Milling layers. EAGLE does not store the copper of its
// polygons; pours.ts draws an approximation. Text is fitted to EAGLE's vector font by text.ts.
//
// Coordinates are in mm with Y up, as in the file. An element's package is turned by its angle and, when mirrored (on
// the bottom), flipped about the vertical line through the element's origin after turning; its items move to the
// other side's layers. The places EAGLE stores for smashed attribute texts, and the Gerber files of its CAM processor,
// confirm that order.
import { counterClockwise, DEG } from '../geometry';
import { outlineFromGraphics } from '../design/outline';
import {
  Contour, ContourSeg, Design, DesignComponent, DesignGraphic, DesignHole, DesignPad, DesignShape, DesignText,
  PadShape, Pt, Stackup,
} from '../model';
import { DIMENSION, EagleLayers, MILLING, mirrorLayer, T_CREAM, B_CREAM, T_RESTRICT, B_RESTRICT, T_STOP, B_STOP } from './layers';
import { eaglePours, EaglePolygon } from './pours';
import { EagleRules, parseLength } from './rules';
import { eagleMarkup, placeEagleText } from './text';
import { child, children, decodeXml, parseXml, XmlElement } from './xml';

export interface EagleReadOptions {
  fileName?: string;
  onProgress?: (share: number) => void;
  // Awaited every few dozen milliseconds, so the page keeps answering.
  pause?: () => Promise<void>;
}

const SLICE_MS = 30;

// Where a package lies on the board: point p goes to at + R(angle)·p, with x negated after turning when mirrored.
interface Frame {
  at: Pt;
  angle: number;
  mirror: boolean;
}

const IDENTITY: Frame = { at: { x: 0, y: 0 }, angle: 0, mirror: false };

function framePoint(f: Frame, x: number, y: number): Pt {
  if (!f.angle && !f.mirror) return { x: f.at.x + x, y: f.at.y + y };
  const a = f.angle * DEG;
  const c = Math.cos(a);
  const s = Math.sin(a);
  let px = x * c - y * s;
  const py = x * s + y * c;
  if (f.mirror) px = -px;
  return { x: f.at.x + round9(px), y: f.at.y + round9(py) };
}

function round9(v: number): number {
  return Math.round(v * 1e9) / 1e9;
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

// "SMR90": spin, mirrored, 90°.
export function parseRotation(s: string | undefined): { angle: number; mirror: boolean; spin: boolean } {
  const m = /^\s*([SM]*)R(-?[\d.]+)\s*$/i.exec(s ?? '');
  if (!m) return { angle: 0, mirror: false, spin: false };
  const flags = m[1].toUpperCase();
  return { angle: normalize(Number(m[2])), mirror: flags.includes('M'), spin: flags.includes('S') };
}

// The centre of an EAGLE wire's arc from a to b turning by `curve` degrees (counter-clockwise when positive).
function arcCentre(a: Pt, b: Pt, curve: number): Pt {
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  const h = len / 2 / Math.tan((curve * DEG) / 2);
  return { x: mx - (dy / len) * h, y: my + (dx / len) * h };
}

function wireShape(a: Pt, b: Pt, curve: number): DesignShape {
  if (!curve || Math.hypot(b.x - a.x, b.y - a.y) < 1e-9) return { line: [a, b] };
  const c = arcCentre(a, b, curve);
  const r = Math.hypot(a.x - c.x, a.y - c.y);
  return { arc: { c, r, start: Math.atan2(a.y - c.y, a.x - c.x) / DEG, sweep: curve } };
}

// A polygon's vertices (each with the curve to the next one) as a contour; the last vertex is dropped when it repeats the
// first.
function polygonContour(pts: { p: Pt; curve: number }[]): Contour | null {
  const v = pts.slice();
  if (v.length > 1 && Math.hypot(v[0].p.x - v[v.length - 1].p.x, v[0].p.y - v[v.length - 1].p.y) < 1e-9) v.pop();
  if (v.length < 2) return null;
  const segs: ContourSeg[] = v.map((cur, i) => {
    const next = v[(i + 1) % v.length];
    if (!cur.curve || Math.hypot(next.p.x - cur.p.x, next.p.y - cur.p.y) < 1e-9) return { to: next.p };
    return { to: next.p, arc: { c: arcCentre(cur.p, next.p, cur.curve), ccw: cur.curve > 0 } };
  });
  if (v.length === 2 && !segs.some((s) => s.arc)) return null;
  return { start: v[0].p, segs };
}

const PLACEHOLDER = /^>/;

class EagleReader {
  design: Design;
  warnings: string[] = [];
  private counts = new Map<string, number>();
  layers: EagleLayers;
  rules: EagleRules;
  private verticalDown: boolean;
  private packages = new Map<string, Map<string, XmlElement>>();
  private nets = new Map<string, number>();
  private netClass: number[] = [0];
  private classClearances = new Map<string, number>();
  private pinNets = new Map<string, number>();
  private variant: string | undefined;
  // Graphics that are copper of no signal, the restrict areas over each copper layer, the board edge of the Dimension
  // layer alone, and the signal polygons, for the pours.
  private copperGraphics = new Set<number>();
  private restricts = new Map<string, number[]>();
  private edge: Contour[] = [];
  private polygons: EaglePolygon[] = [];
  private outlineGraphics: DesignGraphic[] = [];
  private millingGraphics: DesignGraphic[] = [];

  constructor(private root: XmlElement, private o: EagleReadOptions) {
    const drawing = child(root, 'drawing');
    const board = child(drawing, 'board');
    const settings = children(child(drawing, 'settings'), 'setting');
    this.verticalDown = settings.some((s) => s.attrs.verticaltext === 'down');
    const table = children(child(drawing, 'layers'), 'layer').map((l) => ({ number: Math.round(num(l.attrs.number)), name: l.attrs.name ?? '' }));
    const dr = child(board, 'designrules');
    const params = new Map<string, string>();
    for (const p of children(dr, 'param')) if (p.attrs.name) params.set(p.attrs.name, p.attrs.value ?? '');
    this.rules = new EagleRules(params, dr?.attrs.name);
    this.layers = new EagleLayers(table, this.rules.raw('layerSetup'));
    const version = root.attrs.version ?? '';
    // EAGLE's last release is 9.6.2; Fusion 360 writes 9.7.0 and its own design rules.
    const fusion = /^9\.(7|[89])|^\d{2,}\./.test(version) || (dr?.children.some((c) => c.name === 'description' && /Fusion 360/i.test(c.text)) ?? false);
    this.design = {
      format: `EAGLE ${version || '(no version)'}${fusion ? ' (Fusion 360 export)' : ''}`,
      layers: [], nets: [''], outline: [], components: [], pads: [], tracks: [], vias: [], zones: [], graphics: [], texts: [], holes: [],
      warnings: this.warnings,
    };
  }

  count(what: string, n = 1) {
    this.counts.set(what, (this.counts.get(what) ?? 0) + n);
  }

  // --- Libraries, classes, nets ---

  readLibraries(board: XmlElement) {
    for (const lib of children(child(board, 'libraries'), 'library')) {
      const name = lib.attrs.name ?? '';
      const map = new Map<string, XmlElement>();
      for (const p of children(child(lib, 'packages'), 'package')) map.set(p.attrs.name ?? '', p);
      // A board can hold two libraries of one name from different places (their URN tells them apart).
      this.packages.set(`${name}\u0000${lib.attrs.urn ?? ''}`, map);
      if (!this.packages.has(name)) this.packages.set(name, map);
    }
  }

  private packageOf(e: XmlElement): XmlElement | undefined {
    const lib = this.packages.get(`${e.attrs.library ?? ''}\u0000${e.attrs.library_urn ?? ''}`) ?? this.packages.get(e.attrs.library ?? '');
    return lib?.get(e.attrs.package ?? '');
  }

  readClasses(board: XmlElement) {
    for (const c of children(child(board, 'classes'), 'class')) {
      const n = Math.round(num(c.attrs.number));
      for (const cl of children(c, 'clearance')) {
        const m = Math.round(num(cl.attrs.class));
        const v = num(cl.attrs.value);
        if (v > 0) this.classClearances.set(`${Math.max(n, m)},${Math.min(n, m)}`, v);
      }
    }
  }

  classClearance(a: number, b: number): number {
    const ca = this.netClass[a] ?? 0;
    const cb = this.netClass[b] ?? 0;
    return this.classClearances.get(`${Math.max(ca, cb)},${Math.min(ca, cb)}`) ?? 0;
  }

  net(name: string): number {
    let n = this.nets.get(name);
    if (n === undefined) {
      n = this.design.nets.length;
      this.design.nets.push(name);
      this.nets.set(name, n);
    }
    return n;
  }

  readNets(board: XmlElement) {
    for (const s of children(child(board, 'signals'), 'signal')) {
      const name = s.attrs.name ?? '';
      if (name === '_OUTLINES_') continue;
      const net = this.net(name);
      this.netClass[net] = Math.round(num(s.attrs.class));
      for (const c of children(s, 'contactref')) this.pinNets.set(`${c.attrs.element ?? ''}\u0000${c.attrs.pad ?? ''}`, net);
    }
  }

  readVariant(board: XmlElement) {
    this.variant = children(child(board, 'variantdefs'), 'variantdef').find((v) => v.attrs.current === 'yes')?.attrs.name;
  }

  // --- Items ---

  private layerId(n: number): string | null {
    return this.layers.id(n);
  }

  private graphic(n: number, shape: DesignShape, w: number, filled: boolean, extra: Partial<DesignGraphic> = {}) {
    const layer = this.layerId(n);
    if (layer === null) return;
    const g: DesignGraphic = { layer, shape, w, filled, ...extra };
    if (n === DIMENSION) this.outlineGraphics.push(g);
    if (n === MILLING) this.millingGraphics.push(g);
    const index = this.design.graphics.length;
    this.design.graphics.push(g);
    if (this.layers.isCopper(n) && !extra.net) this.copperGraphics.add(index);
    if (n === T_RESTRICT || n === B_RESTRICT) {
      const copper = n === T_RESTRICT ? this.layers.copper[0] : this.layers.copper[this.layers.copper.length - 1];
      const id = String(copper);
      const list = this.restricts.get(id) ?? [];
      list.push(index);
      this.restricts.set(id, list);
    }
  }

  // A wire, circle, rectangle or polygon of a package (frame f, layers mirrored with it) or of the board (identity).
  private drawItem(el: XmlElement, f: Frame, layerOf: (n: number) => number, extra: Partial<DesignGraphic>) {
    const n = layerOf(Math.round(num(el.attrs.layer)));
    const w = Math.max(0, num(el.attrs.width));
    switch (el.name) {
      case 'wire': {
        const a = framePoint(f, num(el.attrs.x1), num(el.attrs.y1));
        const b = framePoint(f, num(el.attrs.x2), num(el.attrs.y2));
        const curve = num(el.attrs.curve) * (f.mirror ? -1 : 1);
        if (curve && el.attrs.cap === 'flat') this.count('flat-cap');
        const style = el.attrs.style;
        const dash = style === 'longdash' ? 'dash' : style === 'shortdash' ? 'dot' : style === 'dashdot' ? 'dash_dot' : undefined;
        this.graphic(n, wireShape(a, b, curve), w, false, { ...extra, ...(dash ? { dash } : {}) });
        break;
      }
      case 'circle': {
        const c = framePoint(f, num(el.attrs.x), num(el.attrs.y));
        const r = num(el.attrs.radius);
        if (r > 0) this.graphic(n, { circle: { c, r } }, w, w === 0, extra);
        break;
      }
      case 'rectangle': {
        const x1 = num(el.attrs.x1);
        const y1 = num(el.attrs.y1);
        const x2 = num(el.attrs.x2);
        const y2 = num(el.attrs.y2);
        const rot = parseRotation(el.attrs.rot).angle;
        const cx = (x1 + x2) / 2;
        const cy = (y1 + y2) / 2;
        const hx = Math.abs(x2 - x1) / 2;
        const hy = Math.abs(y2 - y1) / 2;
        const a = rot * DEG;
        const corners = [[-hx, -hy], [hx, -hy], [hx, hy], [-hx, hy]].map(([dx, dy]) => framePoint(f, cx + dx * Math.cos(a) - dy * Math.sin(a), cy + dx * Math.sin(a) + dy * Math.cos(a)));
        const contour = counterClockwise({ start: corners[0], segs: [...corners.slice(1).map((to) => ({ to })), { to: corners[0] }] });
        this.graphic(n, { poly: contour }, 0, true, extra);
        break;
      }
      case 'polygon': {
        const contour = this.polygon(el, f);
        if (contour) this.graphic(n, { poly: contour }, w, true, extra);
        break;
      }
      default:
        break;
    }
  }

  private polygon(el: XmlElement, f: Frame): Contour | null {
    const pts = children(el, 'vertex').map((v) => ({ p: framePoint(f, num(v.attrs.x), num(v.attrs.y)), curve: num(v.attrs.curve) * (f.mirror ? -1 : 1) }));
    const c = polygonContour(pts);
    return c ? counterClockwise(c) : null;
  }

  // A text in EAGLE's terms, placed for the stroke font.
  private text(raw: string, n: number, at: Pt, rot: { angle: number; mirror: boolean; spin: boolean }, el: XmlElement, extra: Partial<DesignText>) {
    const layer = this.layerId(n);
    if (layer === null) return;
    const size = num(el.attrs.size);
    const s = eagleMarkup(raw);
    const placed = placeEagleText({
      s, at, angle: rot.angle, mirror: rot.mirror, spin: rot.spin, size, ratio: num(el.attrs.ratio, 8),
      align: el.attrs.align ?? 'bottom-left', distance: num(el.attrs.distance, 50), verticalDown: this.verticalDown,
    });
    if (!placed) return;
    const font = el.attrs.font === 'custom' ? el.attrs.fontFamily || 'a TrueType font' : undefined;
    this.design.texts.push({ layer, s, ...placed, ...(font ? { font } : {}), ...extra });
  }

  readPlain(board: XmlElement) {
    for (const el of child(board, 'plain')?.children ?? []) {
      switch (el.name) {
        case 'wire':
        case 'circle':
        case 'rectangle':
        case 'polygon':
          this.drawItem(el, IDENTITY, (n) => n, {});
          break;
        case 'text':
          this.text(el.text, Math.round(num(el.attrs.layer)), { x: num(el.attrs.x), y: num(el.attrs.y) }, parseRotation(el.attrs.rot), el, { role: 'user' });
          break;
        case 'hole':
          this.hole(el, IDENTITY);
          break;
        case 'dimension':
          this.count('dimension');
          break;
        case 'frame':
          this.count('frame');
          break;
        default:
          break;
      }
    }
  }

  // A hole, with the stop mask openings EAGLE makes on both sides (as for a pad of the hole's size).
  private hole(el: XmlElement, f: Frame, comp?: number) {
    const d = num(el.attrs.drill);
    if (!(d > 0)) return;
    const h: DesignHole = { at: framePoint(f, num(el.attrs.x), num(el.attrs.y)), d, plated: false };
    this.design.holes.push(h);
    const r = d / 2 + this.rules.stopMargin(d);
    for (const n of [T_STOP, B_STOP]) this.graphic(n, { circle: { c: h.at, r } }, 0, true, comp !== undefined ? { comp } : {});
  }

  // --- Elements ---

  readElements(board: XmlElement) {
    for (const e of children(child(board, 'elements'), 'element')) {
      const pkg = this.packageOf(e);
      if (!pkg) {
        this.count('no-package');
        continue;
      }
      this.placeElement(e, pkg);
    }
  }

  private placeElement(e: XmlElement, pkg: XmlElement) {
    const rot = parseRotation(e.attrs.rot);
    const at = { x: num(e.attrs.x), y: num(e.attrs.y) };
    const f: Frame = { at, angle: rot.angle, mirror: rot.mirror };
    const name = e.attrs.name ?? '';
    const variant = this.variant ? children(e, 'variant').find((v) => v.attrs.name === this.variant) : undefined;
    const value = variant?.attrs.value ?? e.attrs.value ?? '';
    const index = this.design.components.length;
    const bottom = rot.mirror;
    const comp: DesignComponent = {
      ref: name, value, footprint: e.attrs.library ? `${e.attrs.library}:${e.attrs.package ?? ''}` : e.attrs.package ?? '', at,
      // As KiCad stores a flipped footprint (the footprint with y negated, then turned): EAGLE's mirror after turning is
      // y negated and turned by 180° − angle.
      rot: bottom ? normalize(180 - rot.angle) : rot.angle, side: bottom ? 'bottom' : 'top', attrs: {}, fields: {},
    };
    if (e.attrs.populate === 'no' || variant?.attrs.populate === 'no') comp.attrs.dnp = 'yes';
    const attrs = children(e, 'attribute');
    const attrValue = (key: string): string | undefined => {
      const k = key.toUpperCase();
      if (k === 'NAME' || k === 'PART') return name;
      if (k === 'VALUE') return value;
      return attrs.find((a) => (a.attrs.name ?? '').toUpperCase() === k)?.attrs.value;
    };
    for (const a of attrs) {
      const key = a.attrs.name ?? '';
      if (!key || /^(NAME|VALUE)$/i.test(key) || a.attrs.value === undefined || !a.attrs.value.trim()) continue;
      comp.fields[key] = a.attrs.value.trim();
    }
    this.design.components.push(comp);
    const layerOf = (n: number) => (bottom ? mirrorLayer(n) : n);
    const smashed = e.attrs.smashed === 'yes';
    let th = 0;
    let smd = 0;
    for (const el of pkg.children) {
      switch (el.name) {
        case 'wire':
        case 'circle':
        case 'rectangle':
        case 'polygon':
          this.drawItem(el, f, layerOf, { comp: index });
          break;
        case 'text': {
          const raw = el.text;
          const placeholder = PLACEHOLDER.test(raw.trim());
          // A smashed element draws its attributes instead of the package's placeholders.
          if (placeholder && smashed) break;
          const s = placeholder ? this.substitute(raw, attrValue) : raw;
          const own = parseRotation(el.attrs.rot);
          const angle = own.mirror ? own.angle - rot.angle : rot.angle + own.angle;
          const key = raw.trim().toUpperCase();
          this.text(s, layerOf(Math.round(num(el.attrs.layer))), framePoint(f, num(el.attrs.x), num(el.attrs.y)),
            { angle, mirror: own.mirror !== rot.mirror, spin: own.spin }, el,
            { comp: index, role: key === '>NAME' ? 'reference' : key === '>VALUE' ? 'value' : placeholder ? 'field' : 'user' });
          break;
        }
        case 'pad':
          this.pad(el, f, name, index);
          th += 1;
          break;
        case 'smd':
          this.smd(el, f, name, index);
          smd += 1;
          break;
        case 'hole':
          this.hole(el, f, index);
          break;
        case 'dimension':
          this.count('dimension');
          break;
        case 'frame':
          this.count('frame');
          break;
        default:
          break;
      }
    }
    if (th) comp.attrs.type = 'through_hole';
    else if (smd) comp.attrs.type = 'smd';
    // The element's attributes with a place of their own (smashed texts), as they are displayed.
    for (const a of attrs) {
      if (a.attrs.x === undefined || a.attrs.layer === undefined || a.attrs.display === 'off') continue;
      const key = a.attrs.name ?? '';
      const v = attrValue(key) ?? a.attrs.value ?? '';
      const display = a.attrs.display ?? 'value';
      const s = display === 'name' ? key : display === 'both' ? `${key} = ${v}` : v;
      if (!s.trim()) continue;
      const role = /^NAME$/i.test(key) ? 'reference' : /^VALUE$/i.test(key) ? 'value' : 'field';
      this.text(s, Math.round(num(a.attrs.layer)), { x: num(a.attrs.x), y: num(a.attrs.y) }, parseRotation(a.attrs.rot), a, { comp: index, role });
    }
  }

  // A text of placeholders (">NAME", ">VALUE", ">MPN"…) with the element's values; others stay as written.
  private substitute(raw: string, value: (key: string) => string | undefined): string {
    return raw.split('\n').map((line) => {
      const m = /^>([^\s]+)$/.exec(line.trim());
      if (!m) return line;
      const v = value(m[1]);
      return v !== undefined ? v : line;
    }).join('\n');
  }

  // A pad's shape in its own frame, mirrored with its element.
  private padShape(shape: string, d: number, mirror: boolean): PadShape {
    switch (shape) {
      case 'square':
        return { k: 'rect', w: d, h: d };
      case 'octagon':
        return { k: 'octagon', w: d, h: d };
      case 'long':
        return { k: 'oval', w: d * this.rules.elongation('long'), h: d };
      case 'offset': {
        const len = d * this.rules.elongation('offset');
        return { k: 'oval', w: len, h: d, offset: { x: ((len - d) / 2) * (mirror ? -1 : 1), y: 0 } };
      }
      default:
        return { k: 'circle', w: d, h: d };
    }
  }

  private padShapeGrown(s: PadShape, m: number): PadShape | null {
    const w = s.w + 2 * m;
    const h = s.h + 2 * m;
    if (!(w > 1e-9 && h > 1e-9)) return null;
    if (s.k === 'roundrect') return { ...s, w, h, r: Math.max(0, (s.r ?? 0) * (Math.min(w, h) / Math.min(s.w, s.h))) };
    return { ...s, w, h, ...(s.offset ? { offset: s.offset } : {}) };
  }

  private pad(el: XmlElement, f: Frame, ref: string, comp: number) {
    const drill = num(el.attrs.drill);
    const library = num(el.attrs.diameter);
    const own = parseRotation(el.attrs.rot).angle;
    const at = framePoint(f, num(el.attrs.x), num(el.attrs.y));
    const rot = f.mirror ? normalize(-(f.angle + own)) : normalize(f.angle + own);
    const num_ = el.attrs.name ?? '';
    const first = el.attrs.first === 'yes';
    const shape = el.attrs.shape ?? 'round';
    const copper = this.layers.copper;
    const top = copper[0];
    const bottom = copper[copper.length - 1];
    const dTop = this.rules.padDiameter(drill, library, 'top');
    const dBottom = this.rules.padDiameter(drill, library, 'bottom');
    const dInner = this.rules.padDiameter(drill, library, 'inner');
    const topShape = this.padShape(this.rules.padShape(shape, first, 'top'), dTop, f.mirror);
    const bottomShape = this.padShape(this.rules.padShape(shape, first, 'bottom'), dBottom, f.mirror);
    const pad: DesignPad = {
      comp, num: num_, net: this.pinNets.get(`${ref}\u0000${num_}`) ?? 0, at, rot, shapes: [], type: 'th',
      hole: { d: drill, plated: true },
    };
    const add = (id: string | null, s: PadShape | null) => {
      if (id === null || !s) return;
      const key = JSON.stringify(s);
      const g = pad.shapes.find((x) => JSON.stringify(x.shape) === key);
      if (g) g.layers.push(id);
      else pad.shapes.push({ layers: [id], shape: s });
    };
    add(this.layerId(top), topShape);
    for (const n of copper.slice(1, -1)) add(this.layerId(n), { k: 'circle', w: dInner, h: dInner });
    if (bottom !== top) add(this.layerId(bottom), bottomShape);
    if (el.attrs.stop !== 'no') {
      const mTop = this.rules.stopMargin(dTop);
      const mBottom = this.rules.stopMargin(dBottom);
      add(this.layerId(T_STOP), this.padShapeGrown(topShape, mTop));
      add(this.layerId(B_STOP), this.padShapeGrown(bottomShape, mBottom));
      pad.maskMargin = mTop;
    }
    this.design.pads.push(pad);
  }

  private smd(el: XmlElement, f: Frame, ref: string, comp: number) {
    const dx = num(el.attrs.dx);
    const dy = num(el.attrs.dy);
    if (!(dx > 0 && dy > 0)) return;
    const own = parseRotation(el.attrs.rot).angle;
    const at = framePoint(f, num(el.attrs.x), num(el.attrs.y));
    const rot = f.mirror ? normalize(-(f.angle + own)) : normalize(f.angle + own);
    const layerNumber = f.mirror ? mirrorLayer(Math.round(num(el.attrs.layer, 1))) : Math.round(num(el.attrs.layer, 1));
    const roundness = num(el.attrs.roundness);
    const shapeOf = (w: number, h: number): PadShape => {
      // The rules' roundness is a share of half the smaller side, so a grown or shrunk opening keeps the share.
      const r = this.rules.smdRadius(w, h, roundness);
      if (r <= 1e-9) return { k: 'rect', w, h };
      if (r >= Math.min(w, h) / 2 - 1e-9) return Math.abs(w - h) < 1e-9 ? { k: 'circle', w, h } : { k: 'oval', w, h };
      return { k: 'roundrect', w, h, r };
    };
    const num_ = el.attrs.name ?? '';
    const pad: DesignPad = { comp, num: num_, net: this.pinNets.get(`${ref}\u0000${num_}`) ?? 0, at, rot, shapes: [], type: 'smd' };
    const copperId = this.layerId(layerNumber);
    if (copperId !== null) pad.shapes.push({ layers: [copperId], shape: shapeOf(dx, dy) });
    const onTop = layerNumber === this.layers.copper[0];
    const onBottom = layerNumber === this.layers.copper[this.layers.copper.length - 1];
    if ((onTop || onBottom) && el.attrs.stop !== 'no') {
      const m = this.rules.stopMargin(Math.min(dx, dy));
      const id = this.layerId(onTop ? T_STOP : B_STOP);
      if (id !== null && dx + 2 * m > 0 && dy + 2 * m > 0) pad.shapes.push({ layers: [id], shape: shapeOf(dx + 2 * m, dy + 2 * m) });
      pad.maskMargin = m;
    }
    if ((onTop || onBottom) && el.attrs.cream !== 'no') {
      const m = this.rules.creamMargin(Math.min(dx, dy));
      const id = this.layerId(onTop ? T_CREAM : B_CREAM);
      if (id !== null && dx - 2 * m > 1e-9 && dy - 2 * m > 1e-9) pad.shapes.push({ layers: [id], shape: shapeOf(dx - 2 * m, dy - 2 * m) });
      if (m) pad.pasteMargin = -m;
    }
    this.design.pads.push(pad);
  }

  // --- Signals ---

  async readSignals(board: XmlElement, tick: () => Promise<void>) {
    const copper = this.layers.copper;
    const top = copper[0];
    const bottom = copper[copper.length - 1];
    for (const s of children(child(board, 'signals'), 'signal')) {
      const name = s.attrs.name ?? '';
      if (name === '_OUTLINES_') {
        this.count('outlines-signal');
        continue;
      }
      const net = this.net(name);
      for (const el of s.children) {
        if (el.name === 'wire') {
          const n = Math.round(num(el.attrs.layer));
          if (n === 19) continue;
          const a = { x: num(el.attrs.x1), y: num(el.attrs.y1) };
          const b = { x: num(el.attrs.x2), y: num(el.attrs.y2) };
          const w = Math.max(0, num(el.attrs.width));
          const curve = num(el.attrs.curve);
          if (curve && el.attrs.cap === 'flat') this.count('flat-cap');
          if (this.layers.isCopper(n)) {
            const layer = this.layerId(n);
            if (curve && Math.hypot(b.x - a.x, b.y - a.y) > 1e-9) this.design.tracks.push({ layer, a, b, w, net, arc: { c: arcCentre(a, b, curve), ccw: curve > 0 } });
            else this.design.tracks.push({ layer, a, b, w, net });
          } else {
            this.graphic(n, wireShape(a, b, curve), w, false, { net });
          }
        } else if (el.name === 'via') {
          const [from, to] = (el.attrs.extent ?? '1-16').split('-').map((v) => Math.round(Number(v)));
          const span = this.layers.span(from, to);
          const drill = num(el.attrs.drill);
          const given = num(el.attrs.diameter);
          const outer = this.rules.viaDiameter(drill, given, false, false);
          const inner = this.rules.viaDiameter(drill, given, true, false);
          const isOuter = (n: number) => n === top || n === bottom;
          const d = span.some(isOuter) ? outer : inner;
          const sizes: Record<string, number> = {};
          for (const n of span) {
            const size = isOuter(n) ? outer : inner;
            if (Math.abs(size - d) > 1e-9) sizes[String(n)] = size;
          }
          const ids = span.map((n) => this.layerId(n)).filter((x): x is string => x !== null);
          const through = span.length === copper.length;
          const open = el.attrs.alwaysstop === 'yes' || drill > this.rules.viaStopLimit + 1e-9;
          const shape = el.attrs.shape ?? 'round';
          if (shape === 'octagon') this.count('octagon-via');
          this.design.vias.push({
            at: { x: num(el.attrs.x), y: num(el.attrs.y) }, d, drill, from: String(span[0] ?? top), to: String(span[span.length - 1] ?? bottom),
            layers: ids, ...(Object.keys(sizes).length ? { sizes } : {}), net,
            type: through ? 'through' : span.some(isOuter) ? 'blind' : 'buried',
            ...(open ? { mask: { top: span.includes(top), bottom: span.includes(bottom), margin: this.rules.stopMargin(d) } } : {}),
            ...(shape === 'square' ? { square: true } : {}),
          });
        } else if (el.name === 'polygon') {
          const n = Math.round(num(el.attrs.layer));
          const contour = this.polygon(el, IDENTITY);
          if (!contour) continue;
          const w = Math.max(0, num(el.attrs.width));
          if (!this.layers.isCopper(n)) {
            this.graphic(n, { poly: contour }, w, true, { net });
            continue;
          }
          const pour = el.attrs.pour === 'cutout' ? 'cutout' : el.attrs.pour === 'hatch' ? 'hatch' : 'solid';
          const id = this.layerId(n);
          // Signal polygons have ranks 1 to 6; EAGLE leaves out rank 1.
          const rank = Math.round(num(el.attrs.rank, 1)) || 1;
          this.polygons.push({ id, net, width: w, isolate: num(el.attrs.isolate), rank, pour, contour });
          if (pour === 'cutout') {
            this.design.zones.push({ layers: [id], net: 0, name: 'Polygon cutout', outline: [contour], fill: [], keepout: true });
          }
        }
      }
      await tick();
    }
  }

  // --- The board shape ---

  readOutline() {
    // Closed milling contours are cutouts; open ones (slots) are not part of the shape. Polygons keep clear of the
    // Dimension layer only.
    const milled = this.millingGraphics.length ? outlineFromGraphics(this.millingGraphics).contours : [];
    if (this.outlineGraphics.length) this.edge = outlineFromGraphics(this.outlineGraphics).contours;
    const graphics = [...this.outlineGraphics, ...milled.map((c): DesignGraphic => ({ layer: '', shape: { poly: c }, w: 0, filled: false }))];
    if (!graphics.length) return;
    const shape = outlineFromGraphics(graphics);
    this.design.outline = shape.contours;
    this.warnings.push(...shape.warnings);
  }

  // --- Libraries (.lbr) ---

  // The packages of a library file side by side, each an element named after it, in rows about as wide as they are
  // tall together.
  readLibraryFile(library: XmlElement) {
    const name = library.attrs.name || this.o.fileName?.replace(/\.lbr$/i, '') || 'library';
    const packages = children(child(library, 'packages'), 'package');
    this.packages.set(name, new Map(packages.map((p) => [p.attrs.name ?? '', p])));
    const boxes = packages.map((p) => packageBox(p));
    const area = boxes.reduce((sum, b) => sum + (b.maxX - b.minX + GAP) * (b.maxY - b.minY + GAP), 0);
    const rowWidth = Math.max(40, Math.sqrt(area) * 1.3);
    let x = 0;
    let y = 0;
    let rowHeight = 0;
    packages.forEach((p, i) => {
      const b = boxes[i];
      const w = b.maxX - b.minX;
      const h = b.maxY - b.minY;
      if (x > 0 && x + w > rowWidth) {
        x = 0;
        y -= rowHeight + GAP;
        rowHeight = 0;
      }
      const element: XmlElement = {
        name: 'element',
        attrs: { name: p.attrs.name ?? '', library: name, package: p.attrs.name ?? '', value: '', x: String(x - b.minX), y: String(y - b.maxY) },
        children: [],
        text: '',
      };
      this.placeElement(element, p);
      x += w + GAP;
      rowHeight = Math.max(rowHeight, h);
    });
    const version = this.root.attrs.version ? ` ${this.root.attrs.version}` : '';
    this.design.format = `EAGLE${version} library (${packages.length} ${packages.length === 1 ? 'package' : 'packages'})`;
  }

  // A library has no board shape: Dimension lines of its packages are drawn, the copper's rectangle is the shape.
  finishLibrary(): Design {
    return this.finish();
  }

  // --- All ---

  // The thickness from the copper and isolation thicknesses of the layer setup (mtCopper per layer 1–16, mtIsolate after
  // each layer): the copper of the layers used and the isolation between each two of them.
  private stackup(): Stackup {
    const stackup: Stackup = { copperLayers: this.layers.copper.length };
    const list = (key: string) => this.rules.raw(key).trim().split(/\s+/).map((v) => parseLength(v) ?? NaN);
    const copper = list('mtCopper');
    const isolate = list('mtIsolate');
    const used = this.layers.copper;
    let t = 0;
    for (const n of used) t += copper[n - 1];
    for (let i = 0; i + 1 < used.length; i += 1) t += isolate[Math.min(used[i], used[i + 1]) - 1];
    if (Number.isFinite(t) && t > 0) stackup.thickness = Math.round(t * 1e4) / 1e4;
    return stackup;
  }

  async read(tick: () => Promise<void>, next: () => void): Promise<Design> {
    const board = child(child(this.root, 'drawing'), 'board');
    if (!board) throw new Error('The file is not an EAGLE board.');
    this.readLibraries(board);
    this.readClasses(board);
    this.readVariant(board);
    this.readNets(board);
    next();
    this.readPlain(board);
    this.readElements(board);
    next();
    await this.readSignals(board, tick);
    next();
    this.readOutline();
    const pours = eaglePours({
      design: this.design, polygons: this.polygons, rules: this.rules, classClearance: (a, b) => this.classClearance(a, b),
      copperGraphics: this.copperGraphics, restricts: this.restricts, edge: this.edge, edgeLines: this.outlineGraphics,
    });
    if (pours.planes.length) this.design.planes = pours.planes;
    this.warnings.push(...pours.warnings);
    next();
    return this.finish();
  }

  private finish(): Design {
    this.design.layers = this.layers.designLayers();
    this.design.stackup = this.stackup();
    const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
    const notes: [string, string, string][] = [
      ['no-package', 'element has no package in the file and is', 'elements have no package in the file and are'],
      ['dimension', 'dimension is', 'dimensions are'],
      ['frame', 'drawing frame is', 'drawing frames are'],
      ['outlines-signal', 'signal _OUTLINES_ (outlines data for milling) is', 'signals _OUTLINES_ (outlines data for milling) are'],
    ];
    for (const [key, one, many] of notes) {
      const n = this.counts.get(key);
      if (n) this.warnings.push(`${plural(n, one, many)} not shown.`);
    }
    const flat = this.counts.get('flat-cap');
    if (flat) this.warnings.push(`${plural(flat, 'arc with flat ends is', 'arcs with flat ends are')} drawn with round ends.`);
    const oct = this.counts.get('octagon-via');
    if (oct) this.warnings.push(`${plural(oct, 'octagonal via is', 'octagonal vias are')} drawn round.`);
    const fonts = this.design.texts.filter((t) => t.font).length;
    if (fonts) this.warnings.push(`${plural(fonts, 'text uses a TrueType font', 'texts use TrueType fonts')}; the stroke font stands in.`);
    return this.design;
  }
}

// The space between packages laid out side by side (mm).
const GAP = 3;

// The box around a package's items in its own coordinates (texts by their anchors).
function packageBox(p: XmlElement): { minX: number; minY: number; maxX: number; maxY: number } {
  const b = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  const add = (x: number, y: number, r = 0) => {
    b.minX = Math.min(b.minX, x - r);
    b.minY = Math.min(b.minY, y - r);
    b.maxX = Math.max(b.maxX, x + r);
    b.maxY = Math.max(b.maxY, y + r);
  };
  for (const el of p.children) {
    const a = el.attrs;
    switch (el.name) {
      case 'wire':
      case 'rectangle':
        add(num(a.x1), num(a.y1), num(a.width) / 2);
        add(num(a.x2), num(a.y2), num(a.width) / 2);
        break;
      case 'circle':
        add(num(a.x), num(a.y), num(a.radius) + num(a.width) / 2);
        break;
      case 'pad':
        add(num(a.x), num(a.y), Math.max(num(a.diameter), num(a.drill) * 1.5) * (a.shape === 'long' || a.shape === 'offset' ? 1 : 0.5));
        break;
      case 'smd':
        add(num(a.x), num(a.y), Math.hypot(num(a.dx), num(a.dy)) / 2);
        break;
      case 'hole':
        add(num(a.x), num(a.y), num(a.drill) / 2);
        break;
      case 'polygon':
        for (const v of children(el, 'vertex')) add(num(v.attrs.x), num(v.attrs.y), num(a.width) / 2);
        break;
      case 'text':
        add(num(a.x), num(a.y), num(a.size) / 2);
        break;
      default:
        break;
    }
  }
  return b.minX <= b.maxX ? b : { minX: 0, minY: 0, maxX: 1, maxY: 1 };
}

// Reads an EAGLE XML library (.lbr) into a design: its packages side by side.
export async function readEagleLibrary(bytes: Uint8Array, options: EagleReadOptions = {}): Promise<Design> {
  const root = parseXml(decodeXml(bytes));
  const library = child(child(root, 'drawing'), 'library');
  if (root.name !== 'eagle' || !library) throw new Error('The file is not an EAGLE library.');
  const r = new EagleReader(root, options);
  r.readLibraryFile(library);
  return r.finishLibrary();
}

// Reads an EAGLE XML board (.brd) into a design.
export async function readEagleBoard(bytes: Uint8Array, options: EagleReadOptions = {}): Promise<Design> {
  const root = parseXml(decodeXml(bytes));
  if (root.name !== 'eagle') throw new Error('The file is not an EAGLE XML file.');
  const r = new EagleReader(root, options);
  let slice = performance.now();
  let step = 0;
  const steps = 4;
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

