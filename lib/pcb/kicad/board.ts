// Reads KiCad boards (.kicad_pcb, KiCad 4 to 10) and footprints (.kicad_mod) into a Design (lib/pcb/model.ts), which
// lib/pcb/design/build.ts turns into layers. KiCad's Y points down, so it is negated; angles stay counter-clockwise.
//
// What changed between versions and is handled here: layer names (KiCad 4 and 5 tables may name copper layers only
// by the user's name, "Composant"; KiCad 9 renumbered the layers, so layers are matched by name), the net table
// (KiCad 10 names nets in place), arcs (centre and angle before 20211014, start, mid and end since), strokes ((width)
// and (stroke)), fills ((fill solid|none|yes|no); polygons always filled before 20201114), footprint text
// (fp_text, then property in KiCad 8; (hide yes) and (unlocked yes) as lists since KiCad 8), overbars (~text~ before
// 20210606, ~{text} since), zone fills stroked with their minimum width before KiCad 6, pad stacks and via stacks
// (KiCad 9), via tenting (a plot setting before KiCad 9, a board and via setting since) and nullable margins.
//
// Pad and footprint-text angles are stored as drawn on the board (the footprint's rotation included); positions in a
// footprint are relative to it.
import { angleOf, counterClockwise, DEG, reverseContour } from '../geometry';
import { arcParts, growShape, polygonStrokeParts, ringPart, segmentParts, shapeContains, shapeExtent } from '../design/pads';
import { outlineFromGraphics } from '../design/outline';
import {
  AperturePart, Contour, ContourSeg, Design, DesignComponent, DesignGraphic, DesignPad, DesignShape, DesignText, DesignTrack, DesignVia, DesignZone, PadShape,
  Pt, Stackup,
} from '../model';
import { LayerTable } from './layers';
import { child, children, flag, hasAtom, num, SExpr, SexprReader, str } from './sexpr';

// File versions where the format changed.
const V_RENUMBERED = 20241229;
const V_FILLED_SHAPES = 20201114;
const V_NEW_OVERBAR = 20210606;
const V_ZONE_FILL_6 = 20200000;
const V_ZONE_LAYER_CONNECTIONS = 20221018;
const V_NULLABLE = 20240201;

// KiCad's default text size (60 mil) when a file gives none.
const DEFAULT_TEXT_SIZE = 1.524;

// A footprint's place, in KiCad's coordinates (Y down).
interface Frame {
  x: number;
  y: number;
  angle: number;
}

const BOARD: Frame = { x: 0, y: 0, angle: 0 };

// KiCad's rotation (Y down, counter-clockwise on screen), exact for multiples of 90°.
function rot(x: number, y: number, angle: number): { x: number; y: number } {
  const a = ((angle % 360) + 360) % 360;
  if (a === 0) return { x, y };
  if (a === 90) return { x: y, y: -x };
  if (a === 180) return { x: -x, y: -y };
  if (a === 270) return { x: -y, y: x };
  const r = a * DEG;
  const s = Math.sin(r);
  const c = Math.cos(r);
  return { x: y * s + x * c, y: y * c - x * s };
}

// A point given relative to a frame, on the board with Y up.
function place(f: Frame, x: number, y: number): Pt {
  if (!f.angle) return { x: f.x + x, y: -(f.y + y) };
  const p = rot(x, y, f.angle);
  return { x: f.x + p.x, y: -(f.y + p.y) };
}

function xyOf(e: SExpr[] | undefined): [number, number] {
  return [num(e?.[1], 0), num(e?.[2], 0)];
}

function placeOf(f: Frame, e: SExpr[] | undefined): Pt {
  const [x, y] = xyOf(e);
  return place(f, x, y);
}

function normalize(deg: number): number {
  const r = deg % 360;
  return r < 0 ? r + 360 : r;
}

// An arc through three points: centre, radius, start angle and sweep (counter-clockwise positive). Null if the
// points are on a line.
function arcThrough(a: Pt, m: Pt, b: Pt): { c: Pt; r: number; start: number; sweep: number } | null {
  const d = 2 * (a.x * (m.y - b.y) + m.x * (b.y - a.y) + b.x * (a.y - m.y));
  if (Math.abs(d) < 1e-12) return null;
  const a2 = a.x * a.x + a.y * a.y;
  const m2 = m.x * m.x + m.y * m.y;
  const b2 = b.x * b.x + b.y * b.y;
  const c = { x: (a2 * (m.y - b.y) + m2 * (b.y - a.y) + b2 * (a.y - m.y)) / d, y: (a2 * (b.x - m.x) + m2 * (a.x - b.x) + b2 * (m.x - a.x)) / d };
  const r = Math.hypot(a.x - c.x, a.y - c.y);
  const ccw = (m.x - a.x) * (b.y - m.y) - (m.y - a.y) * (b.x - m.x) > 0;
  const start = angleOf(c, a);
  let sweep = angleOf(c, b) - start;
  if (ccw) while (sweep <= 0) sweep += 360;
  else while (sweep >= 0) sweep -= 360;
  return { c, r, start, sweep };
}

function lineSeg(to: Pt): ContourSeg {
  return { to };
}

// --- Text ---

type Justify = DesignText['just'];

interface TextStyle {
  h: number;
  w: number;
  thick: number;
  bold: boolean;
  italic: boolean;
  lineSpacing: number;
  face?: string;
  just: Justify;
  mirror: boolean;
  hidden: boolean;
}

// The font size, stroke and justification of (effects …).
function textStyle(effects: SExpr[] | undefined): TextStyle {
  const font = child(effects, 'font');
  const size = child(font, 'size');
  const h = size ? num(size[1], DEFAULT_TEXT_SIZE) : DEFAULT_TEXT_SIZE;
  const w = size ? num(size[2], h) : DEFAULT_TEXT_SIZE;
  const bold = flag(font, 'bold');
  const italic = flag(font, 'italic');
  let thick = num(child(font, 'thickness')?.[1], 0);
  if (!(thick > 1e-6)) thick = w / (bold ? 5 : 8);
  // KiCad keeps the stroke within a quarter of the glyph size.
  thick = Math.min(thick, Math.min(Math.abs(w), Math.abs(h)) * 0.25);
  const justify = child(effects, 'justify');
  const just: Justify = {
    h: hasAtom(justify, 'left') ? 'left' : hasAtom(justify, 'right') ? 'right' : 'center',
    v: hasAtom(justify, 'top') ? 'top' : hasAtom(justify, 'bottom') ? 'bottom' : 'middle',
  };
  const face = str(child(font, 'face')?.[1]);
  return {
    h, w, thick, bold, italic, just,
    // KiCad keeps (line_spacing …) but its plots of board text ignore it (kicad-cli 10, text and text boxes alike).
    lineSpacing: 1,
    face: face && face !== 'KiCad Font' ? face : undefined,
    mirror: hasAtom(justify, 'mirror'),
    hidden: flag(effects, 'hide'),
  };
}

// KiCad 5's overbars, ~text~ (~~ is a ~), as KiCad 6's ~{text}.
function newOverbars(s: string): string {
  if (!s.includes('~')) return s;
  let out = '';
  let open = false;
  for (let i = 0; i < s.length; i += 1) {
    if (s[i] === '~') {
      if (s[i + 1] === '~') {
        out += '~';
        i += 1;
      } else {
        out += open ? '}' : '~{';
        open = !open;
      }
    } else out += s[i];
  }
  return open ? `${out}}` : out;
}

// --- The reader ---

interface FootprintContext {
  frame: Frame;
  index: number;
  comp: DesignComponent;
  maskMargin?: number;
  pasteMargin?: number;
  pasteRatio?: number;
  // Name → value for ${…} in its texts, and the nets and pin names of its pads (for ${NET_NAME(1)} and the like).
  vars: Map<string, string>;
  pads: Map<string, { net: string; pin: string; type: string }>;
}

// A pad or via whose inner rings are drawn only where something connects (remove_unused_layers).
interface PendingRings {
  kind: 'pad' | 'via';
  index: number;
  candidates: string[];
  keep: Set<string>;
  // The shape on a layer, in its own coordinates, and the transform to them.
  shapeOn: (layer: string) => PadShape | null;
  at: Pt;
  rot: number;
  net: number;
}

export interface KicadReadOptions {
  // The file name, for ${FILENAME} and ${PROJECTNAME}.
  fileName?: string;
  // Called with the share read so far.
  onProgress?: (share: number) => void;
  // Awaited every few dozen milliseconds, so the page keeps answering.
  pause?: () => Promise<void>;
}

class KicadReader {
  version = 0;
  generator = '';
  layers = new LayerTable();
  nets: string[] = [''];
  private netNumbers = new Map<number, number>();
  private netNames = new Map<string, number>([['', 0]]);
  design: Design;
  warnings: string[] = [];
  private counts = new Map<string, number>();
  // Board settings.
  private maskMargin = 0;
  private pasteMargin = 0;
  private pasteRatio = 0;
  private viaTenting = { top: true, bottom: true };
  private dashRatio = 12;
  private gapRatio = 3;
  private boardVars = new Map<string, string>();
  // KiCad 4 and 5: via drills of the board and of net classes, for vias that give none.
  private viaDrill: { drill?: number; micro?: number } = {};
  private defaultClass: { drill?: number; micro?: number } = {};
  private netClasses = new Map<string, { drill?: number; micro?: number }>();
  private stackup: Stackup = {};
  private pending: PendingRings[] = [];
  private emptyZones = 0;

  constructor(options: KicadReadOptions) {
    this.design = {
      format: 'KiCad', layers: [], nets: this.nets, outline: [], components: [], pads: [], tracks: [], vias: [], zones: [], graphics: [], texts: [], holes: [],
      warnings: this.warnings,
    };
    const fileName = options.fileName ?? '';
    this.boardVars.set('FILENAME', fileName);
    this.boardVars.set('PROJECTNAME', fileName.replace(/\.[^.]+$/, ''));
    this.boardVars.set('CURRENT_DATE', new Date().toISOString().slice(0, 10));
  }

  count(what: string) {
    this.counts.set(what, (this.counts.get(what) ?? 0) + 1);
  }

  // --- Nets ---

  private netIndex(name: string): number {
    let i = this.netNames.get(name);
    if (i === undefined) {
      i = this.nets.length;
      this.nets.push(name);
      this.netNames.set(name, i);
    }
    return i;
  }

  // (net 3), (net 3 "GND") or, without a net table (KiCad 10), (net "GND").
  netOf(e: SExpr[] | undefined): number {
    if (!e || e.length < 2) return 0;
    const v = e[1];
    if (e.length >= 3 && typeof e[2] === 'string') {
      const n = num(v, NaN);
      const i = this.netIndex(e[2]);
      if (Number.isFinite(n) && !this.netNumbers.has(n)) this.netNumbers.set(n, i);
      return i;
    }
    if (!this.netNumbers.size || (typeof v === 'string' && !/^-?\d+$/.test(v))) return this.netIndex(str(v) ?? '');
    const n = num(v, 0);
    return this.netNumbers.get(n) ?? (n === 0 ? 0 : this.netIndex(`Net ${n}`));
  }

  private readNetTable(e: SExpr[]) {
    // (net 0 ""), (net 1 "GND"), and in KiCad 4 unquoted names.
    const n = num(e[1], NaN);
    const name = str(e[2]) ?? '';
    if (!Number.isFinite(n)) return;
    this.netNumbers.set(n, n === 0 && !name ? 0 : this.netIndex(name));
  }

  // --- Variables ---

  expand(s: string, fp: FootprintContext | null, layer: string): string {
    const old = this.version < V_NEW_OVERBAR;
    let text = old ? newOverbars(s) : s;
    // KiCad 5's footprint text variables.
    if (fp && old && text.includes('%')) text = text.replace(/%R/g, fp.comp.ref).replace(/%V/g, fp.comp.value);
    if (!text.includes('${')) return text;
    const layerName = this.layers.layers.get(layer)?.name ?? layer;
    return text.replace(/\$\{([^}]+)\}/g, (whole, name: string) => {
      const key = name.trim();
      if (key === 'LAYER') return layerName;
      if (fp) {
        const v = fp.vars.get(key) ?? fp.vars.get(key.toUpperCase());
        if (v !== undefined) return v;
        // ${NET_NAME(1)}, ${SHORT_NET_NAME(1)}, ${PIN_NAME(1)}, ${PIN_TYPE(1)}: of the footprint's pad 1.
        const m = /^(NET_NAME|SHORT_NET_NAME|PIN_NAME|PIN_TYPE)\((.*)\)$/.exec(key);
        const pad = m ? fp.pads.get(m[2]) : undefined;
        if (pad) {
          if (m[1] === 'NET_NAME') return pad.net;
          if (m[1] === 'SHORT_NET_NAME') return pad.net.split('/').pop() ?? pad.net;
          return m[1] === 'PIN_NAME' ? pad.pin : pad.type;
        }
      }
      const b = this.boardVars.get(key) ?? this.boardVars.get(key.toUpperCase());
      return b ?? whole;
    });
  }

  // --- Points and contours ---

  // (pts (xy …) … (arc (start …) (mid …) (end …))) as a closed contour.
  contourOf(pts: SExpr[] | undefined, f: Frame): Contour | null {
    if (!pts) return null;
    let start: Pt | null = null;
    let last: Pt | null = null;
    const segs: ContourSeg[] = [];
    for (let i = 1; i < pts.length; i += 1) {
      const p = pts[i];
      if (!Array.isArray(p)) continue;
      if (p[0] === 'xy') {
        const q = place(f, num(p[1], 0), num(p[2], 0));
        if (!start) start = q;
        else segs.push(lineSeg(q));
        last = q;
      } else if (p[0] === 'arc') {
        const a = placeOf(f, child(p, 'start'));
        const m = placeOf(f, child(p, 'mid'));
        const b = placeOf(f, child(p, 'end'));
        if (!start) start = a;
        else if (!last || Math.hypot(last.x - a.x, last.y - a.y) > 1e-9) segs.push(lineSeg(a));
        const arc = arcThrough(a, m, b);
        segs.push(arc ? { to: b, arc: { c: arc.c, ccw: arc.sweep > 0 } } : lineSeg(b));
        last = b;
      }
    }
    if (!start || !last) return null;
    // Closed back to the start.
    if (Math.hypot(last.x - start.x, last.y - start.y) > 1e-9) segs.push(lineSeg(start));
    return { start, segs };
  }

  // The points of (pts …) as a list (for open curves).
  pointsOf(pts: SExpr[] | undefined, f: Frame): Pt[] {
    const out: Pt[] = [];
    for (let i = 1; i < (pts?.length ?? 0); i += 1) {
      const p = pts[i];
      if (Array.isArray(p) && p[0] === 'xy') out.push(place(f, num(p[1], 0), num(p[2], 0)));
    }
    return out;
  }

  // --- Graphics ---

  private strokeOf(e: SExpr[]): { w: number; dash?: DesignGraphic['dash'] } {
    const stroke = child(e, 'stroke');
    const w = num(child(stroke ?? e, 'width')?.[1], 0);
    const type = str(child(stroke, 'type')?.[1]);
    const dash = type === 'dash' || type === 'dot' || type === 'dash_dot' || type === 'dash_dot_dot' ? type : undefined;
    return { w, ...(dash ? { dash } : {}) };
  }

  // Whether a shape is filled: (fill solid|yes) since 20201114; before, polygons always were.
  private filled(e: SExpr[], polygon: boolean): boolean {
    const fill = child(e, 'fill');
    if (!fill) return polygon && this.version < V_FILLED_SHAPES;
    const v = fill[1];
    if (Array.isArray(v)) return v[0] === 'type' && (v[1] === 'outline' || v[1] === 'background' || v[1] === 'solid');
    return v === 'solid' || v === 'yes' || v === 'true' || v === 'hatch' || v === 'reverse_hatch' || v === 'cross_hatch';
  }

  // A graphic shape (gr_* or fp_*): line, arc, circle, rect, poly, curve.
  shapeOf(kind: string, e: SExpr[], f: Frame): DesignShape | null {
    switch (kind) {
      case 'line':
        return { line: [placeOf(f, child(e, 'start')), placeOf(f, child(e, 'end'))] };
      case 'arc': {
        const mid = child(e, 'mid');
        if (mid) {
          const a = placeOf(f, child(e, 'start'));
          const b = placeOf(f, child(e, 'end'));
          const arc = arcThrough(a, placeOf(f, mid), b);
          return arc ? { arc } : { line: [a, b] };
        }
        // Before 20211014: (start) is the centre, (end) where the arc starts, (angle) the sweep, clockwise on screen.
        const c = placeOf(f, child(e, 'start'));
        const p = placeOf(f, child(e, 'end'));
        const angle = num(child(e, 'angle')?.[1], 0);
        return { arc: { c, r: Math.hypot(p.x - c.x, p.y - c.y), start: angleOf(c, p), sweep: -angle } };
      }
      case 'circle': {
        const c = placeOf(f, child(e, 'center'));
        const p = placeOf(f, child(e, 'end'));
        return { circle: { c, r: Math.hypot(p.x - c.x, p.y - c.y) } };
      }
      case 'rect': {
        const [x0, y0] = xyOf(child(e, 'start'));
        const [x1, y1] = xyOf(child(e, 'end'));
        const pts = [place(f, x0, y0), place(f, x1, y0), place(f, x1, y1), place(f, x0, y1)];
        return { poly: { start: pts[0], segs: [lineSeg(pts[1]), lineSeg(pts[2]), lineSeg(pts[3]), lineSeg(pts[0])] } };
      }
      case 'poly': {
        const c = this.contourOf(child(e, 'pts'), f);
        return c ? { poly: c } : null;
      }
      case 'curve': {
        const pts = this.pointsOf(child(e, 'pts'), f);
        return pts.length === 4 ? { curve: [pts[0], pts[1], pts[2], pts[3]] } : null;
      }
      default:
        return null;
    }
  }

  readGraphic(kind: string, e: SExpr[], f: Frame, comp?: number) {
    const layerName = str(child(e, 'layer')?.[1]);
    if (!layerName) return;
    const shape = this.shapeOf(kind, e, f);
    if (!shape) return;
    const { w, dash } = this.strokeOf(e);
    const g: DesignGraphic = {
      layer: this.layers.resolve(layerName),
      shape,
      w,
      filled: this.filled(e, kind === 'poly') && kind !== 'line' && kind !== 'arc' && kind !== 'curve',
      ...(dash ? { dash } : {}),
      ...(comp !== undefined ? { comp } : {}),
    };
    const net = child(e, 'net');
    if (net) g.net = this.netOf(net);
    this.design.graphics.push(g);
  }

  // --- Text ---

  // gr_text, fp_text and property (`from`: where the options start, after the type and the text). Nothing is added
  // for hidden text and for a property without a place.
  readText(e: SExpr[], text: string, fp: FootprintContext | null, from: number, role?: string): void {
    const at = child(e, 'at');
    const layerList = child(e, 'layer');
    const layerName = str(layerList?.[1]);
    if (!at || !layerName) return;
    const effects = child(e, 'effects');
    const style = textStyle(effects);
    const options = ['', ...e.slice(from)];
    if (style.hidden || flag(options, 'hide')) return;
    const layer = this.layers.resolve(layerName);
    const shown = this.expand(text, fp, layer);
    if (!shown.trim()) return;
    const [x, y] = xyOf(at);
    const f = fp?.frame ?? BOARD;
    let angle = normalize(num(at[3], 0));
    // Footprint text is kept readable unless it is unlocked: its angle stays in (−90°, 90°].
    const unlocked = hasAtom(at, 'unlocked') || flag(options, 'unlocked');
    if (fp && !unlocked) {
      if (angle > 90 && angle <= 270) angle = normalize(angle - 180);
    }
    const t: DesignText = {
      layer,
      s: shown,
      at: place(f, x, y),
      rot: angle,
      h: style.h,
      w: style.w,
      thick: style.thick,
      mirror: style.mirror,
      just: style.just,
      ...(style.italic ? { italic: true } : {}),
      ...(style.bold ? { bold: true } : {}),
      ...(style.lineSpacing !== 1 ? { lineSpacing: style.lineSpacing } : {}),
      ...(style.face ? { font: style.face } : {}),
      ...(hasAtom(layerList, 'knockout') || flag(layerList, 'knockout') ? { knockout: true } : {}),
      ...(fp ? { comp: fp.index } : {}),
      ...(role ? { role } : {}),
    };
    const cache = child(e, 'render_cache');
    if (cache) {
      const outline: Contour[] = [];
      for (const polygon of children(cache, 'polygon')) {
        children(polygon, 'pts').forEach((pts, i) => {
          const c = this.contourOf(pts, BOARD);
          if (!c) return;
          const ccw = counterClockwise(c);
          outline.push(i === 0 ? ccw : reverseContour(ccw));
        });
      }
      if (outline.length) t.outline = outline;
    }
    this.design.texts.push(t);
  }

  // gr_text_box and fp_text_box: the border, and the text inside its margins.
  readTextBox(e: SExpr[], fp: FootprintContext | null) {
    const layerName = str(child(e, 'layer')?.[1]);
    if (!layerName) return;
    const layer = this.layers.resolve(layerName);
    const f = fp?.frame ?? BOARD;
    let corners: Pt[];
    const pts = child(e, 'pts');
    if (pts) corners = this.pointsOf(pts, f);
    else {
      const [x0, y0] = xyOf(child(e, 'start'));
      const [x1, y1] = xyOf(child(e, 'end'));
      corners = [place(f, x0, y0), place(f, x1, y0), place(f, x1, y1), place(f, x0, y1)];
    }
    if (corners.length < 4) return;
    const { w, dash } = this.strokeOf(e);
    const border = child(e, 'border');
    const bordered = border ? border[1] === 'yes' : w > 0;
    if (bordered) {
      const contour: Contour = { start: corners[0], segs: [lineSeg(corners[1]), lineSeg(corners[2]), lineSeg(corners[3]), lineSeg(corners[0])] };
      this.design.graphics.push({ layer, shape: { poly: contour }, w, filled: this.filled(e, false), ...(dash ? { dash } : {}), ...(fp ? { comp: fp.index } : {}) });
    }
    const text = str(e[1]) ?? '';
    const effects = child(e, 'effects');
    const style = textStyle(effects);
    if (style.hidden || !text.trim()) return;
    const margins = child(e, 'margins');
    const m = margins ? [1, 2, 3, 4].map((i) => num(margins[i], 0)) : [0, 0, 0, 0].map(() => w / 2 + style.h / 5);
    // The box's own axes: from the first corner along the first and the last side.
    const ux = { x: corners[1].x - corners[0].x, y: corners[1].y - corners[0].y };
    const uy = { x: corners[3].x - corners[0].x, y: corners[3].y - corners[0].y };
    const width = Math.hypot(ux.x, ux.y);
    const height = Math.hypot(uy.x, uy.y);
    if (!(width > 0 && height > 0)) return;
    const angle = normalize(Math.atan2(ux.y, ux.x) / DEG);
    const ex = { x: ux.x / width, y: ux.y / width };
    const ey = { x: uy.x / height, y: uy.y / height };
    // The anchor: at the margins for left/top and right/bottom, in the middle for centred text. With a border, KiCad
    // counts the margins from its outer edge.
    const edge = bordered ? w / 2 : 0;
    const along = style.just.h === 'left' ? m[0] - edge : style.just.h === 'right' ? width - m[2] + edge : width / 2;
    const down = style.just.v === 'top' ? m[1] - edge : style.just.v === 'bottom' ? height - m[3] + edge : height / 2;
    const at = { x: corners[0].x + ex.x * along + ey.x * down, y: corners[0].y + ex.y * along + ey.y * down };
    const t: DesignText = {
      layer,
      s: this.expand(text, fp, layer),
      at,
      rot: angle,
      h: style.h,
      w: style.w,
      thick: style.thick,
      mirror: style.mirror,
      just: style.just,
      wrap: Math.max(0, width - m[0] - m[2]),
      ...(style.italic ? { italic: true } : {}),
      ...(style.bold ? { bold: true } : {}),
      ...(style.lineSpacing !== 1 ? { lineSpacing: style.lineSpacing } : {}),
      ...(style.face ? { font: style.face } : {}),
      ...(fp ? { comp: fp.index } : {}),
    };
    this.design.texts.push(t);
  }

  // --- Tracks and vias ---

  readSegment(e: SExpr[]) {
    const layer = str(child(e, 'layer')?.[1]);
    if (!layer) return;
    const t: DesignTrack = {
      layer: this.layers.resolve(layer),
      a: placeOf(BOARD, child(e, 'start')),
      b: placeOf(BOARD, child(e, 'end')),
      w: num(child(e, 'width')?.[1], 0),
      net: this.netOf(child(e, 'net')),
    };
    this.design.tracks.push(t);
  }

  readTrackArc(e: SExpr[]) {
    const layer = str(child(e, 'layer')?.[1]);
    if (!layer) return;
    const a = placeOf(BOARD, child(e, 'start'));
    const b = placeOf(BOARD, child(e, 'end'));
    const arc = arcThrough(a, placeOf(BOARD, child(e, 'mid')), b);
    const t: DesignTrack = {
      layer: this.layers.resolve(layer),
      a,
      b,
      w: num(child(e, 'width')?.[1], 0),
      net: this.netOf(child(e, 'net')),
      ...(arc ? { arc: { c: arc.c, ccw: arc.sweep > 0 } } : {}),
    };
    this.design.tracks.push(t);
  }

  // Tenting as (tenting front back), (tenting (front yes) (back no)) or (tenting none); undefined: not said.
  // The board's setting names the tented sides; a via or pad overrides only the sides it names ("none": none).
  private tentingOf(e: SExpr[] | undefined, board = false): { top?: boolean; bottom?: boolean } {
    const t = child(e, 'tenting');
    if (!t) return {};
    if (t.slice(1).every((x) => typeof x === 'string')) {
      if (board) return { top: hasAtom(t, 'front'), bottom: hasAtom(t, 'back') };
      return { ...(hasAtom(t, 'front') ? { top: true } : {}), ...(hasAtom(t, 'back') ? { bottom: true } : {}) };
    }
    const side = (name: string): boolean | undefined => {
      const v = child(t, name)?.[1];
      return v === 'yes' ? true : v === 'no' ? false : undefined;
    };
    return { top: side('front'), bottom: side('back') };
  }

  readVia(e: SExpr[]) {
    const at = placeOf(BOARD, child(e, 'at'));
    const d = num(child(e, 'size')?.[1], 0);
    const net = this.netOf(child(e, 'net'));
    let drill = num(child(e, 'drill')?.[1], 0);
    if (!child(e, 'drill')) {
      // KiCad 4 and 5 leave the drill out when it is the one of the via's net class.
      const micro = hasAtom(e, 'micro');
      const cls = this.netClasses.get(this.nets[net]) ?? this.defaultClass;
      drill = (micro ? cls.micro ?? this.viaDrill.micro : cls.drill ?? this.viaDrill.drill) ?? 0;
    }
    const names = (child(e, 'layers') ?? []).slice(1).map((x) => this.layers.resolve(str(x) ?? ''));
    const copper = this.layers.copper();
    const order = new Map(copper.map((l, i) => [l.id, i]));
    let from = names[0] ?? 'F.Cu';
    let to = names[1] ?? 'B.Cu';
    if ((order.get(from) ?? 0) > (order.get(to) ?? 0)) [from, to] = [to, from];
    const i0 = order.get(from) ?? 0;
    const i1 = order.get(to) ?? copper.length - 1;
    const span = copper.slice(i0, i1 + 1).map((l) => l.id);
    const outer = (id: string) => id === 'F.Cu' || id === 'B.Cu';
    const type: DesignVia['type'] = hasAtom(e, 'micro') ? 'micro' : hasAtom(e, 'blind') || !(from === 'F.Cu' && to === 'B.Cu')
      ? (outer(from) || outer(to) ? 'blind' : 'buried') : 'through';
    // Other diameters per layer (KiCad 9 via stacks).
    const sizes: Record<string, number> = {};
    const stack = child(e, 'padstack');
    if (stack) {
      for (const l of children(stack, 'layer')) {
        const name = str(l[1]) ?? '';
        const size = num(child(l, 'size')?.[1], NaN);
        if (!Number.isFinite(size)) continue;
        const targets = name === 'Inner' ? span.filter((id) => !outer(id)) : [this.layers.resolve(name)];
        for (const id of targets) sizes[id] = size;
      }
    }
    const tent = this.tentingOf(e);
    const reachesTop = from === 'F.Cu';
    const reachesBottom = to === 'B.Cu';
    const openTop = reachesTop && !(tent.top ?? this.viaTenting.top);
    const openBottom = reachesBottom && !(tent.bottom ?? this.viaTenting.bottom);
    const via: DesignVia = {
      at, d, drill, from, to, layers: span, net, type,
      ...(Object.keys(sizes).length ? { sizes } : {}),
      ...(openTop || openBottom ? { mask: { top: openTop, bottom: openBottom, margin: this.maskMargin } } : {}),
    };
    const index = this.design.vias.length;
    this.design.vias.push(via);
    if (flag(e, 'remove_unused_layers')) {
      const keepEnds = flag(e, 'keep_end_layers');
      const keep = new Set<string>((child(e, 'zone_layer_connections') ?? []).slice(1).map((x) => this.layers.resolve(str(x) ?? '')));
      if (keepEnds) {
        keep.add(from);
        keep.add(to);
      }
      this.pending.push({
        kind: 'via', index, candidates: span, keep, at, rot: 0, net: via.net,
        shapeOn: (layer) => ({ k: 'circle', w: sizes[layer] ?? d, h: sizes[layer] ?? d }),
      });
    }
  }

  // --- Pads ---

  // The custom shape of a pad: its anchor and primitives, in pad coordinates (Y up).
  private customParts(e: SExpr[], anchor: PadShape): AperturePart[] {
    const parts: AperturePart[] = [];
    const options = child(e, 'options');
    const anchorKind = str(child(options, 'anchor')?.[1]) ?? 'circle';
    if (anchor.w > 0) {
      parts.push(anchorKind === 'rect'
        ? { dark: true, poly: [{ x: -anchor.w / 2, y: -anchor.h / 2 }, { x: anchor.w / 2, y: -anchor.h / 2 }, { x: anchor.w / 2, y: anchor.h / 2 }, { x: -anchor.w / 2, y: anchor.h / 2 }] }
        : { dark: true, circle: { c: { x: 0, y: 0 }, r: anchor.w / 2 } });
    }
    const pf: Frame = BOARD;
    for (const p of (child(e, 'primitives') ?? []).slice(1)) {
      if (!Array.isArray(p)) continue;
      const kind = String(p[0]).replace(/^(gr|fp)_/, '');
      const width = num(child(child(p, 'stroke') ?? p, 'width')?.[1], 0);
      const fillToken = child(p, 'fill');
      switch (kind) {
        case 'poly': {
          const pts = this.pointsOf(child(p, 'pts'), pf);
          if (pts.length >= 3) {
            parts.push({ dark: true, poly: pts });
            if (width > 0) parts.push(...polygonStrokeParts(pts, width));
          }
          break;
        }
        case 'line':
          parts.push(...segmentParts(placeOf(pf, child(p, 'start')), placeOf(pf, child(p, 'end')), width));
          break;
        case 'arc': {
          const s = this.shapeOf('arc', p, pf);
          if (s && 'arc' in s) parts.push(...arcParts(s.arc.c, s.arc.r, s.arc.start, s.arc.sweep, width));
          break;
        }
        case 'circle': {
          const c = placeOf(pf, child(p, 'center'));
          const q = placeOf(pf, child(p, 'end'));
          const r = Math.hypot(q.x - c.x, q.y - c.y);
          const fill = fillToken ? fillToken[1] === 'yes' || fillToken[1] === 'solid' : width === 0;
          if (fill) parts.push({ dark: true, circle: { c, r: r + width / 2 } });
          else parts.push(ringPart(c, r + width / 2, r - width / 2));
          break;
        }
        case 'rect': {
          const [x0, y0] = xyOf(child(p, 'start'));
          const [x1, y1] = xyOf(child(p, 'end'));
          const pts = [place(pf, x0, y0), place(pf, x1, y0), place(pf, x1, y1), place(pf, x0, y1)];
          const fill = fillToken ? fillToken[1] === 'yes' || fillToken[1] === 'solid' : true;
          if (fill) parts.push({ dark: true, poly: pts });
          if (width > 0) parts.push(...polygonStrokeParts(pts, width));
          break;
        }
        case 'curve': {
          const pts = this.pointsOf(child(p, 'pts'), pf);
          if (pts.length === 4) {
            const line = bezierPoints(pts[0], pts[1], pts[2], pts[3]);
            for (let i = 1; i < line.length; i += 1) parts.push(...segmentParts(line[i - 1], line[i], width));
          }
          break;
        }
        default:
          break;
      }
    }
    return parts.map((part) => (part.poly ? { dark: true, poly: polyCcw(part.poly) } : part));
  }

  // The shape of a pad (or of one layer of its pad stack) from its shape token, size and options.
  private padShape(shapeName: string, e: SExpr[], offset: Pt | undefined, isCustom: (s: PadShape) => AperturePart[]): PadShape {
    const size = child(e, 'size');
    const w = num(size?.[1], 0);
    const h = num(size?.[2], w);
    const minSide = Math.min(w, h);
    const o = offset && (offset.x || offset.y) ? { offset } : {};
    switch (shapeName) {
      case 'circle':
        return { k: 'circle', w, h: w, ...o };
      case 'rect':
      case 'square':
        return { k: 'rect', w, h, ...o };
      case 'oval':
        return { k: 'oval', w, h, ...o };
      case 'trapezoid':
      case 'trapeze': {
        const d = child(e, 'rect_delta');
        // KiCad's rect_delta with Y down; the y part turns around with Y up.
        return { k: 'trapezoid', w, h, delta: { x: num(d?.[1], 0), y: num(d?.[2], 0) }, ...o };
      }
      case 'roundrect':
      case 'chamfered_rect': {
        const r = num(child(e, 'roundrect_rratio')?.[1], 0) * minSide;
        const ratio = num(child(e, 'chamfer_ratio')?.[1], 0);
        const chamfer = child(e, 'chamfer');
        const corners = (chamfer ?? []).slice(1).map((c) => ({ top_left: 'tl', top_right: 'tr', bottom_left: 'bl', bottom_right: 'br' } as const)[String(c)]).filter(Boolean);
        if (ratio > 0 && corners.length) return { k: 'chamfer', w, h, r, chamfer: { size: ratio * minSide, corners }, ...o };
        return { k: 'roundrect', w, h, r, ...o };
      }
      case 'custom': {
        const anchor: PadShape = { k: 'circle', w, h };
        return { k: 'custom', w, h, parts: isCustom(anchor), ...o };
      }
      default:
        return { k: 'rect', w, h, ...o };
    }
  }

  readPad(e: SExpr[], fp: FootprintContext) {
    const number = str(e[1]) ?? '';
    const typeName = str(e[2]) ?? 'smd';
    const shapeName = str(e[3]) ?? 'rect';
    const at = child(e, 'at');
    const [rx, ry] = xyOf(at);
    const position = place(fp.frame, rx, ry);
    const angle = normalize(num(at?.[3], 0));
    const drill = child(e, 'drill');
    const offsetList = child(drill, 'offset');
    const offset = offsetList ? { x: num(offsetList[1], 0), y: -num(offsetList[2], 0) } : undefined;
    const base = this.padShape(shapeName, e, offset, (anchor) => this.customParts(e, anchor));
    const type: DesignPad['type'] = typeName === 'thru_hole' ? 'th' : typeName === 'np_thru_hole' ? 'np' : typeName === 'connect' ? 'connect' : 'smd';
    const layerNames = this.layers.expand((child(e, 'layers') ?? []).slice(1).map((x) => str(x) ?? ''));
    const all = new Set(layerNames);
    const copper = this.layers.copper().map((l) => l.id).filter((id) => all.has(id));

    // Copper shapes, per layer when a pad stack differs.
    const shapeOn = new Map<string, PadShape>();
    for (const id of copper) shapeOn.set(id, base);
    // Pad stacks (KiCad 9): "front_inner_back" gives the inner layers ("Inner") and the back, "custom" every layer;
    // the pad's own shape is the front's.
    const stack = child(e, 'padstack');
    if (stack) {
      for (const l of children(stack, 'layer')) {
        const name = str(l[1]) ?? '';
        const lShape = str(child(l, 'shape')?.[1]) ?? shapeName;
        const lo = child(l, 'offset');
        const s = this.padShape(lShape, l, lo ? { x: num(lo[1], 0), y: -num(lo[2], 0) } : offset, (anchor) => this.customParts(l, anchor));
        const targets = name === 'Inner' ? copper.filter((id) => id !== 'F.Cu' && id !== 'B.Cu') : [this.layers.resolve(name)];
        for (const id of targets) if (shapeOn.has(id)) shapeOn.set(id, s);
      }
    }

    // Drill: (drill d), (drill oval w h), with an offset of the shape.
    let hole: DesignPad['hole'];
    if (drill && (type === 'th' || type === 'np')) {
      const vals = drill.slice(1).filter((x) => !Array.isArray(x));
      const oval = vals[0] === 'oval';
      const nums = vals.filter((x) => x !== 'oval').map((x) => num(x, NaN)).filter((x) => Number.isFinite(x));
      const dw = nums[0] ?? 0;
      const dh = nums[1] ?? dw;
      if (dw > 0) hole = oval && Math.abs(dw - dh) > 1e-9 ? { d: Math.min(dw, dh), slot: { w: dw, h: dh }, plated: type === 'th' } : { d: dw, plated: type === 'th' };
    }

    const pad: DesignPad = { comp: fp.index, num: number, net: this.netOf(child(e, 'net')), at: position, rot: angle, shapes: [], type, ...(hole ? { hole } : {}) };
    const info: Record<string, string> = {};
    const fn = str(child(e, 'pinfunction')?.[1]);
    const pt = str(child(e, 'pintype')?.[1]);
    if (fn) info.function = fn;
    if (pt) info.type = pt;
    if (Object.keys(info).length) pad.info = info;

    // An NPTH pad no larger than its hole (round or oval) has no copper.
    const holeW = hole?.slot ? hole.slot.w : hole?.d ?? 0;
    const holeH = hole?.slot ? hole.slot.h : hole?.d ?? 0;
    const bareHole = type === 'np' && hole && (base.k === 'circle' || base.k === 'oval') && base.w <= holeW + 1e-6 && base.h <= holeH + 1e-6 && !base.offset;
    const index = this.design.pads.length;
    const removeUnused = flag(e, 'remove_unused_layers') && type === 'th';
    let drawnCopper = bareHole ? [] : copper;
    if (removeUnused && drawnCopper.length) {
      const keep = new Set<string>((child(e, 'zone_layer_connections') ?? []).slice(1).map((x) => this.layers.resolve(str(x) ?? '')));
      // The outer rings stay without a connection only with keep_end_layers.
      if (flag(e, 'keep_end_layers')) for (const id of drawnCopper) if (id === 'F.Cu' || id === 'B.Cu') keep.add(id);
      this.pending.push({ kind: 'pad', index, candidates: drawnCopper, keep, at: position, rot: angle, net: pad.net, shapeOn: (layer) => shapeOn.get(layer) ?? null });
      drawnCopper = [];
    }
    this.addCopperShapes(pad, drawnCopper, shapeOn);

    // Mask and paste, from the copper shape of their side. A pad without copper (an aperture pad, such as a paste
    // window) is its own shape there: KiCad applies no margin to it.
    const tent = this.tentingOf(e);
    const front = shapeOn.get('F.Cu') ?? base;
    const back = shapeOn.get('B.Cu') ?? base;
    const aperture = !copper.length;
    if (all.has('F.Mask') || all.has('B.Mask')) {
      const local = this.margin(child(e, 'solder_mask_margin'));
      const m = aperture ? 0 : local ?? fp.maskMargin ?? this.maskMargin;
      pad.maskMargin = m;
      const openings: { layer: string; shape: PadShape }[] = [];
      // A negative margin takes at most half the pad away.
      const limited = (s: PadShape) => {
        const e = shapeExtent(s);
        return Math.max(m, -Math.min(e.w, e.h) / 2);
      };
      if (all.has('F.Mask') && tent.top !== true) {
        const s = growShape(front, limited(front));
        if (s) openings.push({ layer: 'F.Mask', shape: s });
      }
      if (all.has('B.Mask') && tent.bottom !== true) {
        const s = growShape(back, limited(back));
        if (s) openings.push({ layer: 'B.Mask', shape: s });
      }
      this.addShapes(pad, openings);
    }
    if (all.has('F.Paste') || all.has('B.Paste')) {
      const localMargin = this.margin(child(e, 'solder_paste_margin'));
      const localRatio = this.margin(child(e, 'solder_paste_margin_ratio') ?? child(e, 'solder_paste_ratio'));
      const margin = aperture ? 0 : localMargin ?? fp.pasteMargin ?? this.pasteMargin;
      const ratio = aperture ? 0 : localRatio ?? fp.pasteRatio ?? this.pasteRatio;
      pad.pasteMargin = margin;
      const openings: { layer: string; shape: PadShape }[] = [];
      for (const [layer, s] of [['F.Paste', front], ['B.Paste', back]] as [string, PadShape][]) {
        if (!all.has(layer)) continue;
        const e = shapeExtent(s);
        const mx = Math.max(margin + s.w * ratio, -e.w / 2);
        const my = Math.max(margin + s.h * ratio, -e.h / 2);
        const grown = Math.abs(mx - my) > 1e-9 ? resized(s, mx, my) : growShape(s, mx, my);
        if (grown) openings.push({ layer, shape: grown });
      }
      this.addShapes(pad, openings);
    }
    // Other layers a pad names (silkscreen, fabrication…, as older footprints do): KiCad plots its shape there too.
    const others = layerNames.filter((id) => !copper.includes(id) && !/^[FB]\.(Mask|Paste)$/.test(id) && this.layers.layers.get(id)?.kind !== 'copper');
    const front2: string[] = others.filter((id) => !id.startsWith('B.'));
    const back2: string[] = others.filter((id) => id.startsWith('B.'));
    if (front2.length) pad.shapes.push({ layers: front2, shape: front });
    if (back2.length) pad.shapes.push({ layers: back2, shape: back });
    this.design.pads.push(pad);
  }

  // Adds the copper shapes of a pad, the layers with the same shape together.
  addCopperShapes(pad: DesignPad, layers: string[], shapeOn: Map<string, PadShape> | ((l: string) => PadShape | null)) {
    const get = typeof shapeOn === 'function' ? shapeOn : (l: string) => shapeOn.get(l) ?? null;
    const groups = new Map<PadShape, string[]>();
    for (const id of layers) {
      const s = get(id);
      if (!s) continue;
      const list = groups.get(s);
      if (list) list.push(id);
      else groups.set(s, [id]);
    }
    for (const [shape, ls] of groups) pad.shapes.push({ layers: ls, shape });
  }

  private addShapes(pad: DesignPad, openings: { layer: string; shape: PadShape }[]) {
    // Equal openings on both sides share an entry.
    if (openings.length === 2 && openings[0].shape === openings[1].shape) {
      pad.shapes.push({ layers: [openings[0].layer, openings[1].layer], shape: openings[0].shape });
      return;
    }
    for (const o of openings) pad.shapes.push({ layers: [o.layer], shape: o.shape });
  }

  // A margin override: a number, or undefined when not set (KiCad before 9 wrote 0 for "not set").
  private margin(e: SExpr[] | undefined): number | undefined {
    if (!e) return undefined;
    const v = num(e[1], NaN);
    if (!Number.isFinite(v)) return undefined;
    if (v === 0 && this.version < V_NULLABLE) return undefined;
    return v;
  }

  // --- Footprints ---

  readFootprint(e: SExpr[], libraryFile = false) {
    const name = str(e[1]) ?? '';
    const layerName = str(child(e, 'layer')?.[1]) ?? 'F.Cu';
    const side = this.layers.resolve(layerName) === 'B.Cu' ? 'bottom' : 'top';
    const at = child(e, 'at');
    const frame: Frame = { x: num(at?.[1], 0), y: num(at?.[2], 0), angle: normalize(num(at?.[3], 0)) };
    const index = this.design.components.length;
    const comp: DesignComponent = { ref: '', value: '', footprint: name, at: place(BOARD, frame.x, frame.y), rot: frame.angle, side, attrs: {}, fields: {} };
    const descr = str(child(e, 'descr')?.[1]);
    if (descr) comp.description = descr;
    // Reference and value first, for the variables of the other texts.
    for (const t of children(e, 'fp_text')) {
      if (t[1] === 'reference') comp.ref = str(t[2]) ?? '';
      else if (t[1] === 'value') comp.value = str(t[2]) ?? '';
    }
    for (const p of children(e, 'property')) {
      const key = str(p[1]) ?? '';
      const value = str(p[2]) ?? '';
      if (key === 'Reference') comp.ref = value;
      else if (key === 'Value') comp.value = value;
      else if (key && !/^(ki_|Sheetfile$|Sheetname$)/.test(key)) comp.fields[key] = value;
    }
    const attr = child(e, 'attr');
    if (attr) {
      for (const a of attr.slice(1)) {
        if (typeof a !== 'string') continue;
        if (a === 'smd' || a === 'through_hole') comp.attrs.type = a;
        else if (a === 'virtual') {
          comp.attrs.board_only = 'yes';
          comp.attrs.exclude_from_bom = 'yes';
          comp.attrs.exclude_from_pos_files = 'yes';
        } else comp.attrs[a] = 'yes';
      }
    }
    const vars = new Map<string, string>();
    vars.set('REFERENCE', comp.ref);
    vars.set('VALUE', comp.value);
    const colon = name.indexOf(':');
    vars.set('FOOTPRINT_LIBRARY', colon >= 0 ? name.slice(0, colon) : '');
    vars.set('FOOTPRINT_NAME', colon >= 0 ? name.slice(colon + 1) : name);
    for (const [k, v] of Object.entries(comp.fields)) vars.set(k, v);
    const pads = new Map<string, { net: string; pin: string; type: string }>();
    for (const p of children(e, 'pad')) {
      const n = str(p[1]) ?? '';
      if (!pads.has(n)) pads.set(n, { net: this.nets[this.netOf(child(p, 'net'))] ?? '', pin: str(child(p, 'pinfunction')?.[1]) ?? '', type: str(child(p, 'pintype')?.[1]) ?? '' });
    }
    const fp: FootprintContext = {
      frame, index, comp, vars, pads,
      maskMargin: this.margin(child(e, 'solder_mask_margin')),
      pasteMargin: this.margin(child(e, 'solder_paste_margin')),
      pasteRatio: this.margin(child(e, 'solder_paste_margin_ratio') ?? child(e, 'solder_paste_ratio')),
    };
    this.design.components.push(comp);
    for (const c of e.slice(1)) {
      if (!Array.isArray(c)) continue;
      const h = c[0];
      switch (h) {
        case 'fp_line':
        case 'fp_arc':
        case 'fp_circle':
        case 'fp_rect':
        case 'fp_poly':
        case 'fp_curve':
          this.readGraphic(h.slice(3), c, frame, index);
          break;
        case 'fp_text': {
          const role = c[1] === 'reference' ? 'reference' : c[1] === 'value' ? 'value' : 'user';
          this.readText(c, str(c[2]) ?? '', fp, 3, role);
          break;
        }
        case 'property': {
          const key = str(c[1]) ?? '';
          this.readText(c, str(c[2]) ?? '', fp, 3, key === 'Reference' ? 'reference' : key === 'Value' ? 'value' : 'field');
          break;
        }
        case 'fp_text_box':
          this.readTextBox(c, fp);
          break;
        case 'pad':
          this.readPad(c, fp);
          break;
        case 'zone':
          this.readZone(c, fp, libraryFile);
          break;
        case 'dimension':
          this.count('dimension');
          break;
        case 'table':
          this.count('table');
          break;
        case 'barcode':
          this.count('barcode');
          break;
        default:
          break;
      }
    }
  }

  // --- Zones ---

  readZone(e: SExpr[], fp?: FootprintContext, libraryFile = false) {
    const layerList = child(e, 'layers');
    const single = str(child(e, 'layer')?.[1]);
    const layers = layerList ? this.layers.expand(layerList.slice(1).map((x) => str(x) ?? '')) : single ? [this.layers.resolve(single)] : [];
    if (!layers.length) return;
    const keepout = Boolean(child(e, 'keepout') || child(e, 'placement'));
    const teardrop = Boolean(child(child(e, 'attr'), 'teardrop'));
    // Zones of a footprint are written relative to it in some files and on the board in others: take the reading
    // that puts the zone nearest the footprint.
    let frame = BOARD;
    if (fp && !libraryFile) {
      const pts = children(e, 'polygon').flatMap((p) => this.pointsOf(child(p, 'pts'), BOARD));
      if (pts.length) {
        const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
        const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
        const absolute = Math.hypot(cx - fp.frame.x, -cy - fp.frame.y);
        const relative = Math.hypot(cx, cy);
        if (relative < absolute) frame = fp.frame;
      }
    } else if (fp) frame = fp.frame;
    const outline: Contour[] = [];
    for (const p of children(e, 'polygon')) {
      const c = this.contourOf(child(p, 'pts'), frame);
      if (c) outline.push(counterClockwise(c));
    }
    const fill: DesignZone['fill'] = [];
    const byLayer = new Map<string, Contour[]>();
    for (const fpoly of children(e, 'filled_polygon')) {
      const l = str(child(fpoly, 'layer')?.[1]);
      const layer = l ? this.layers.resolve(l) : layers[0];
      const c = this.contourOf(child(fpoly, 'pts'), frame);
      if (!c) continue;
      let list = byLayer.get(layer);
      if (!list) {
        list = [];
        byLayer.set(layer, list);
        fill.push({ layer, contours: list });
      }
      list.push(counterClockwise(c));
    }
    const zone: DesignZone = {
      layers, net: this.netOf(child(e, 'net') ?? (child(e, 'net_name') ? ['net', child(e, 'net_name')[1]] : undefined)), outline, fill,
      ...(keepout ? { keepout: true } : {}),
      ...(teardrop ? { teardrop: true } : {}),
      ...(fp ? { comp: fp.index } : {}),
    };
    const name = str(child(e, 'name')?.[1]);
    if (name) zone.name = name;
    const priority = num(child(e, 'priority')?.[1], NaN);
    if (Number.isFinite(priority)) zone.priority = priority;
    // Before KiCad 6 the filled areas were also stroked with the minimum width.
    const thicknessToken = child(e, 'filled_areas_thickness');
    const stroked = thicknessToken ? flag(e, 'filled_areas_thickness') : this.version < V_ZONE_FILL_6;
    if (stroked && fill.length) zone.stroke = num(child(e, 'min_thickness')?.[1], 0);
    // Never filled: KiCad writes "fill yes" for a zone that was filled, even when nothing is left of it.
    if (!keepout && !fill.length && !hasAtom(child(e, 'fill'), 'yes') && layers.some((l) => this.layers.layers.get(l)?.kind === 'copper')) {
      this.emptyZones += 1;
      zone.unfilled = true;
    }
    if (child(e, 'fill_segments')) this.count('fill_segments');
    this.design.zones.push(zone);
  }

  // --- Setup ---

  readSetup(e: SExpr[]) {
    const viaDrill = num(child(e, 'via_drill')?.[1], NaN);
    const microDrill = num(child(e, 'uvia_drill')?.[1], NaN);
    if (Number.isFinite(viaDrill)) this.viaDrill.drill = viaDrill;
    if (Number.isFinite(microDrill)) this.viaDrill.micro = microDrill;
    // The drill/place file origin (written only when it is not the file's origin).
    const aux = child(e, 'aux_axis_origin');
    const [ax, ay] = [num(aux?.[1], 0), num(aux?.[2], 0)];
    if (ax || ay) this.design.placeOrigin = { x: ax, y: -ay };
    this.maskMargin = num(child(e, 'pad_to_mask_clearance')?.[1], 0);
    this.pasteMargin = num(child(e, 'pad_to_paste_clearance')?.[1], 0);
    this.pasteRatio = num(child(e, 'pad_to_paste_clearance_ratio')?.[1], 0);
    const plot = child(e, 'pcbplotparams');
    const viasOnMask = str(child(plot, 'viasonmask')?.[1]);
    if (viasOnMask) {
      const open = viasOnMask === 'true' || viasOnMask === 'yes';
      this.viaTenting = { top: !open, bottom: !open };
    }
    const tent = this.tentingOf(e, true);
    if (child(e, 'tenting')) this.viaTenting = { top: tent.top ?? false, bottom: tent.bottom ?? false };
    this.dashRatio = num(child(plot, 'dashed_line_dash_ratio')?.[1], 12);
    this.gapRatio = num(child(plot, 'dashed_line_gap_ratio')?.[1], 3);
    const stack = child(e, 'stackup');
    if (stack) {
      for (const l of children(stack, 'layer')) {
        const name = str(l[1]) ?? '';
        const color = str(child(l, 'color')?.[1]);
        if (!color) continue;
        if ((name === 'F.Mask' || (name === 'B.Mask' && !this.stackup.mask))) this.stackup.mask = color;
        if ((name === 'F.SilkS' || (name === 'B.SilkS' && !this.stackup.silk))) this.stackup.silk = color;
      }
      const finish = str(child(stack, 'copper_finish')?.[1]);
      if (finish) this.stackup.finish = finish;
    }
  }

  readTitleBlock(e: SExpr[]) {
    const set = (key: string, v: SExpr | undefined) => {
      const s = str(v);
      if (s !== undefined) this.boardVars.set(key, s);
    };
    set('TITLE', child(e, 'title')?.[1]);
    set('ISSUE_DATE', child(e, 'date')?.[1]);
    set('REVISION', child(e, 'rev')?.[1]);
    set('COMPANY', child(e, 'company')?.[1]);
    for (const c of children(e, 'comment')) set(`COMMENT${num(c[1], 0)}`, c[2]);
  }

  readLayerTable(e: SExpr[]) {
    const numbering = this.version >= V_RENUMBERED ? 'new' : this.version > 0 && this.version < 4 ? 'legacy' : 'old';
    for (const l of e.slice(1)) {
      if (!Array.isArray(l)) continue;
      const n = num(l[0], NaN);
      const name = str(l[1]);
      if (!Number.isFinite(n) || !name) continue;
      this.layers.addFromTable(n, name, str(l[2]), str(l[3]), numbering);
    }
  }

  // KiCad 4 and 5: net classes in the board, for vias that take their drill from their net's class.
  readNetClass(e: SExpr[]) {
    const drill = num(child(e, 'via_drill')?.[1], NaN);
    const micro = num(child(e, 'uvia_drill')?.[1], NaN);
    const entry = { drill: Number.isFinite(drill) ? drill : undefined, micro: Number.isFinite(micro) ? micro : undefined };
    if (str(e[1]) === 'Default') this.defaultClass = entry;
    for (const n of children(e, 'add_net')) this.netClasses.set(str(n[1]) ?? '', entry);
  }

  // --- Top level ---

  item(e: SExpr) {
    if (!Array.isArray(e)) return;
    const h = e[0];
    switch (h) {
      case 'version':
        this.version = num(e[1], 0);
        break;
      case 'generator':
      case 'host':
        this.generator = str(e[1]) ?? '';
        break;
      case 'general':
        this.stackup.thickness = num(child(e, 'thickness')?.[1], NaN);
        if (!Number.isFinite(this.stackup.thickness)) delete this.stackup.thickness;
        break;
      case 'title_block':
        this.readTitleBlock(e);
        break;
      case 'layers':
        this.readLayerTable(e);
        break;
      case 'setup':
        this.readSetup(e);
        break;
      case 'property':
        if (typeof e[1] === 'string') this.boardVars.set(e[1], str(e[2]) ?? '');
        break;
      case 'net':
        this.readNetTable(e);
        break;
      case 'net_class':
        this.readNetClass(e);
        break;
      case 'module':
      case 'footprint':
        this.readFootprint(e);
        break;
      case 'gr_line':
      case 'gr_arc':
      case 'gr_circle':
      case 'gr_rect':
      case 'gr_poly':
      case 'gr_curve':
        this.readGraphic(h.slice(3), e, BOARD);
        break;
      case 'gr_text':
        this.readText(e, str(e[1]) ?? '', null, 2);
        break;
      case 'gr_text_box':
        this.readTextBox(e, null);
        break;
      case 'segment':
        this.readSegment(e);
        break;
      case 'arc':
        this.readTrackArc(e);
        break;
      case 'via':
        this.readVia(e);
        break;
      case 'zone':
        this.readZone(e);
        break;
      case 'target':
        this.readTarget(e);
        break;
      case 'dimension':
      case 'table':
      case 'barcode':
      case 'gr_bbox':
        this.count(h);
        break;
      default:
        break;
    }
  }

  // A layer alignment target: a circle with a cross (plus) or a diagonal cross (x).
  readTarget(e: SExpr[]) {
    const layerName = str(child(e, 'layer')?.[1]);
    if (!layerName) return;
    const layer = this.layers.resolve(layerName);
    const c = placeOf(BOARD, child(e, 'at'));
    const size = num(child(e, 'size')?.[1], 5);
    const w = num(child(e, 'width')?.[1], 0.15);
    this.design.graphics.push({ layer, shape: { circle: { c, r: size / 3 } }, w, filled: false });
    const r = size / 2;
    const diagonal = hasAtom(e, 'x');
    const d = diagonal ? r * Math.SQRT1_2 : r;
    const pairs: [Pt, Pt][] = diagonal
      ? [[{ x: c.x - d, y: c.y - d }, { x: c.x + d, y: c.y + d }], [{ x: c.x - d, y: c.y + d }, { x: c.x + d, y: c.y - d }]]
      : [[{ x: c.x - r, y: c.y }, { x: c.x + r, y: c.y }], [{ x: c.x, y: c.y - r }, { x: c.x, y: c.y + r }]];
    for (const line of pairs) this.design.graphics.push({ layer, shape: { line }, w, filled: false });
  }

  // --- After reading ---

  // Draws the inner rings of pads and vias that remove unused layers where a track ends on them or a zone connects.
  private resolveRings() {
    if (!this.pending.length) return;
    // Track ends by layer, in a grid of 1 mm cells.
    const cell = 1;
    const ends = new Map<string, { p: Pt; w: number }[]>();
    const add = (layer: string, p: Pt, w: number) => {
      const key = `${layer}|${Math.floor(p.x / cell)}|${Math.floor(p.y / cell)}`;
      const list = ends.get(key);
      if (list) list.push({ p, w });
      else ends.set(key, [{ p, w }]);
    };
    for (const t of this.design.tracks) {
      add(t.layer, t.a, t.w);
      add(t.layer, t.b, t.w);
    }
    const oldZones = this.version < V_ZONE_LAYER_CONNECTIONS;
    for (const p of this.pending) {
      const connected: string[] = [];
      for (const layer of p.candidates) {
        if (p.keep.has(layer)) {
          connected.push(layer);
          continue;
        }
        const shape = p.shapeOn(layer);
        if (!shape) continue;
        const reach = Math.max(shape.w, shape.h) / 2 + Math.abs(shape.offset?.x ?? 0) + Math.abs(shape.offset?.y ?? 0) + 1;
        let found = false;
        for (let gx = Math.floor((p.at.x - reach) / cell); gx <= Math.floor((p.at.x + reach) / cell) && !found; gx += 1) {
          for (let gy = Math.floor((p.at.y - reach) / cell); gy <= Math.floor((p.at.y + reach) / cell) && !found; gy += 1) {
            for (const end of ends.get(`${layer}|${gx}|${gy}`) ?? []) {
              const local = toPad(end.p, p.at, p.rot);
              if (shapeContains(shape, local, end.w / 2)) {
                found = true;
                break;
              }
            }
          }
        }
        // Files before zone_layer_connections: a zone of the same net whose fill reaches the ring.
        if (!found && oldZones && p.net) found = this.zoneTouches(layer, p.net, p.at, Math.min(shape.w, shape.h) / 2);
        if (found) connected.push(layer);
      }
      if (p.kind === 'pad') {
        const pad = this.design.pads[p.index];
        const shapes = pad.shapes;
        pad.shapes = [];
        this.addCopperShapes(pad, connected, p.shapeOn);
        pad.shapes.push(...shapes);
      } else {
        this.design.vias[p.index].layers = connected;
      }
    }
  }

  private zoneTouches(layer: string, net: number, at: Pt, r: number): boolean {
    const probes = [at, ...[0, 45, 90, 135, 180, 225, 270, 315].map((a) => ({ x: at.x + r * 0.95 * Math.cos(a * DEG), y: at.y + r * 0.95 * Math.sin(a * DEG) }))];
    for (const z of this.design.zones) {
      if (z.net !== net || z.keepout) continue;
      for (const f of z.fill) {
        if (f.layer !== layer) continue;
        for (const c of f.contours) if (probes.some((q) => insideContour(q, c))) return true;
      }
    }
    return false;
  }

  finish(): Design {
    this.resolveRings();
    this.layers.numberCopper();
    this.design.layers = [...this.layers.layers.values()];
    const edge = this.design.graphics.filter((g) => g.layer === 'Edge.Cuts');
    if (edge.length) {
      const shape = outlineFromGraphics(edge);
      this.design.outline = shape.contours;
      this.warnings.push(...shape.warnings);
    }
    if (Object.keys(this.stackup).length) {
      this.stackup.copperLayers = this.layers.copper().length;
      this.design.stackup = this.stackup;
    }
    this.design.dash = { dash: this.dashRatio, gap: this.gapRatio };
    const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
    const left: [string, string, string][] = [
      ['dimension', 'dimension is', 'dimensions are'],
      ['table', 'table is', 'tables are'],
      ['barcode', 'barcode is', 'barcodes are'],
      ['fill_segments', 'zone filled with segments (KiCad 4) is drawn without them', 'zones filled with segments (KiCad 4) are drawn without them'],
    ];
    for (const [key, one, many] of left) {
      const n = this.counts.get(key);
      if (n) this.warnings.push(key === 'fill_segments' ? `${plural(n, one, many)}.` : `${plural(n, one, many)} not shown.`);
    }
    if (this.emptyZones) {
      this.warnings.push(`${plural(this.emptyZones, 'zone has', 'zones have')} no fill saved in the file, so only ${this.emptyZones === 1 ? 'its outline is' : 'their outlines are'} shown. Fill the zones in KiCad (B) and save the board to see the copper.`);
    }
    const fonts = this.design.texts.filter((t) => t.font && !t.outline).length;
    if (fonts) this.warnings.push(`${plural(fonts, 'text uses a TrueType font', 'texts use TrueType fonts')} whose letters the file does not store; KiCad's stroke font stands in.`);
    this.design.format = kicadRelease(this.version);
    return this.design;
  }
}

// The file versions of KiCad's releases: a file of a version in between was written by a development version.
const RELEASES: [number, number][] = [[20171130, 5], [20211014, 6], [20221018, 7], [20240108, 8], [20241229, 9], [20260206, 10]];

function kicadRelease(version: number): string {
  if (!version) return 'KiCad';
  if (version < 20171130) return `KiCad 4 (format ${version})`;
  let major = 5;
  let exact = false;
  for (const [v, m] of RELEASES) {
    if (version >= v) {
      major = m;
      exact = version === v;
    }
  }
  return exact ? `KiCad ${major} (format ${version})` : `KiCad ${major + 1} development version (format ${version})`;
}

// A paste opening whose margin differs between the axes (a ratio of a pad that is not square): KiCad makes the pad that
// much larger or smaller and keeps the ratios of its rounded and chamfered corners (kicad-cli 10), where an even margin
// grows or shrinks the outline (growShape).
function resized(s: PadShape, mx: number, my: number): PadShape | null {
  const w = s.w + 2 * mx;
  const h = s.h + 2 * my;
  if (!(w > 1e-9 && h > 1e-9)) return null;
  const scale = Math.min(w, h) / Math.min(s.w, s.h);
  switch (s.k) {
    case 'rect':
    case 'oval':
    case 'trapezoid':
      return { ...s, w, h };
    case 'roundrect':
      return { ...s, w, h, r: (s.r ?? 0) * scale };
    case 'chamfer':
      return { ...s, w, h, r: (s.r ?? 0) * scale, chamfer: { ...s.chamfer, size: (s.chamfer?.size ?? 0) * scale } };
    default:
      return growShape(s, mx, my);
  }
}

// A board point in a pad's own coordinates (Y up).
function toPad(p: Pt, at: Pt, rotation: number): Pt {
  const dx = p.x - at.x;
  const dy = p.y - at.y;
  const r = -rotation * DEG;
  return { x: dx * Math.cos(r) - dy * Math.sin(r), y: dx * Math.sin(r) + dy * Math.cos(r) };
}

function insideContour(p: Pt, c: Contour): boolean {
  let inside = false;
  let a = c.start;
  for (const s of c.segs) {
    const b = s.to;
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
    a = b;
  }
  return inside;
}

function polyCcw(pts: Pt[]): Pt[] {
  let area = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i, i += 1) area += pts[j].x * pts[i].y - pts[i].x * pts[j].y;
  return area < 0 ? pts.slice().reverse() : pts;
}

// Points along a cubic Bézier curve.
export function bezierPoints(p0: Pt, p1: Pt, p2: Pt, p3: Pt, steps = 24): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const u = 1 - t;
    out.push({
      x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
      y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
    });
  }
  return out;
}

const SLICE_MS = 30;

// Reads a .kicad_pcb file.
export async function readKicadBoard(text: string, options: KicadReadOptions = {}): Promise<Design> {
  const r = new SexprReader(text);
  const root = r.openRoot();
  if (root !== 'kicad_pcb') throw new Error(`Not a KiCad board (it starts with "${root}").`);
  const k = new KicadReader(options);
  let slice = performance.now();
  for (;;) {
    const e = r.next();
    if (e === undefined) break;
    k.item(e);
    if (performance.now() - slice > SLICE_MS) {
      options.onProgress?.(r.pos / r.length);
      if (options.pause) await options.pause();
      slice = performance.now();
    }
  }
  for (const [what, n] of r.skipped) if (what === 'image' && n) k.warnings.push(`${n} image${n === 1 ? ' is' : 's are'} not shown.`);
  return k.finish();
}

// Reads a .kicad_mod file: one footprint at the origin, on a two-layer board.
export function readKicadFootprint(text: string, options: KicadReadOptions = {}): Design {
  const r = new SexprReader(text);
  const e = r.readAll();
  if (e[0] !== 'footprint' && e[0] !== 'module') throw new Error(`Not a KiCad footprint (it starts with "${String(e[0])}").`);
  const k = new KicadReader(options);
  k.version = num(child(e, 'version')?.[1], 0) || 20171130;
  k.layers.ensure('F.Cu');
  k.layers.ensure('B.Cu');
  for (const id of ['F.Mask', 'B.Mask']) k.layers.ensure(id);
  k.readFootprint(e, true);
  const design = k.finish();
  design.format = `KiCad footprint (format ${k.version})`;
  return design;
}
