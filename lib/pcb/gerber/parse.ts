// Reads a Gerber file (RS-274X with X2 attributes, Ucamco's "Gerber Layer Format Specification") and plots it into
// the items of a layer. Besides the current specification it reads what older files still use: G74 single-quadrant
// arcs, G54/G55, G70/G71, G90/G91, M00/M01, IN, LN, IP, MI, SF, OF, IR (AS is ignored, as the specification allows),
// trailing-zero and incremental formats, rectangular holes, draws with rectangular apertures, macro primitives 2, 22
// and 6, coordinates without an operation code, and step and repeat closed with SRX1Y1 or at the end of the file.
import { addItem, apertureBox, ccwPoly, convexHull, counterClockwise, DEG, determinant, flashMatrix, multiply, polyContour, transformItem, translateItem } from '../geometry';
import { Aperture, ArtItem, BoardObject, Box, Contour, emptyBox, Mirror, Pt } from '../model';
import { evaluateMacro, Macro, parseMacro } from './macro';
import { circlePoly, rotatePt } from './shapes';
import { standardAperture } from './standard';

export interface ParsedGerber {
  items: ArtItem[];
  apertures: Aperture[];
  bbox: Box;
  // File attributes (%TF), with their dot, e.g. '.FileFunction': 'Copper,L1,Top'.
  attrs: Record<string, string>;
  // Object attributes (%TO); items refer to them by index.
  objects: BoardObject[];
  // Image polarity negative (%IPNEG): the layer starts dark and the items are already toggled.
  negative: boolean;
  units: 'mm' | 'inch' | null;
  warnings: string[];
}

interface ApertureEntry {
  // Index into the layer's apertures; blocks have none.
  index?: number;
  strokeDiameter?: number;
  outline?: Pt[];
  block?: ArtItem[];
}

interface Format {
  intX: number;
  decX: number;
  intY: number;
  decY: number;
  trailing: boolean;
  incremental: boolean;
}

const INCH = 25.4;

// Character codes used by the scanner.
const C_PLUS = 43;
const C_MINUS = 45;
const C_DOT = 46;
const C_0 = 48;
const C_9 = 57;

function isDigit(c: number) {
  return c >= C_0 && c <= C_9;
}

// The object of a set of object attributes.
function boardObject(attrs: Record<string, string>): BoardObject {
  const obj: BoardObject = { kind: '.P' in attrs ? 'pin' : '.C' in attrs ? 'component' : '.N' in attrs ? 'net' : 'object' };
  const info: Record<string, string> = {};
  for (const [key, value] of Object.entries(attrs)) {
    if (key === '.N') obj.net = value;
    else if (key === '.C') obj.component = value;
    else if (key === '.P') {
      const [ref, pin, ...name] = value.split(',');
      obj.component = ref;
      obj.pin = pin;
      if (name.length) info.pinName = name.join(',');
    } else info[key] = value;
  }
  if (Object.keys(info).length) obj.info = info;
  return obj;
}

class Plotter {
  items: ArtItem[] = [];
  apertures: Aperture[] = [];
  objects: BoardObject[] = [];
  fileAttrs: Record<string, string> = {};
  warnings = new Set<string>();

  // Graphics state.
  private fmt: Format | null = null;
  private unit: number | null = null;
  private x = 0;
  private y = 0;
  // The point object at (x, y) if the last item ended there, shared with the next draw to save memory.
  private here: Pt | null = null;
  private interp = 1;
  private quadrant: 'single' | 'multi' | null = null;
  private lastOp = 0;
  private current: ApertureEntry | null = null;
  private currentCode = 0;
  private dark = true;
  private mirror: Mirror = 'none';
  private rotation = 0;
  private scale = 1;
  private ended = false;

  // Scanner results for one word.
  private sx = 0;
  private sy = 0;
  private si = 0;
  private sj = 0;
  private hasX = false;
  private hasY = false;
  private hasI = false;
  private hasJ = false;
  private pos = 0;

  // Region statement.
  private inRegion = false;
  private contour: Contour | null = null;
  private contours: Contour[] = [];

  // Where new items go: the image, a block aperture being defined, or a step-and-repeat block.
  private target: ArtItem[] = this.items;
  private blocks: { code: number; items: ArtItem[]; outer: ArtItem[] }[] = [];
  private sr: { nx: number; ny: number; dx: number; dy: number; items: ArtItem[]; outer: ArtItem[] } | null = null;

  private apertureDict = new Map<number, ApertureEntry>();
  private macros = new Map<string, Macro>();
  private apertureAttrs: Record<string, string> = {};
  private objectAttrs: Record<string, string> = {};
  private objectDirty = false;
  private currentObject: number | undefined = undefined;
  private objectIndex = new Map<string, number>();

  // Deprecated image parameters, applied to the whole image at the end.
  negative = false;
  private imageMirror = { a: false, b: false };
  private imageScale = { a: 1, b: 1 };
  private imageOffset = { a: 0, b: 0 };
  private imageRotation = 0;

  warn(message: string) {
    if (this.warnings.size < 50) this.warnings.add(message);
  }

  get units(): 'mm' | 'inch' | null {
    return this.unit === null ? null : this.unit === 1 ? 'mm' : 'inch';
  }

  private unitFactor(): number {
    if (this.unit === null) {
      this.warn('The file does not give its unit (MO); inch is assumed.');
      this.unit = INCH;
    }
    return this.unit;
  }

  private format(): Format {
    if (!this.fmt) {
      this.warn('The file does not give its coordinate format (FS); 2.4 with leading zeros omitted is assumed.');
      this.fmt = { intX: 2, decX: 4, intY: 2, decY: 4, trailing: false, incremental: false };
    }
    return this.fmt;
  }

  // --- Reading ---

  read(text: string) {
    const n = text.length;
    let i = 0;
    while (i < n && !this.ended) {
      const c = text.charCodeAt(i);
      if (c <= 32) {
        i += 1;
        continue;
      }
      if (c === 37) {
        // An extended command: %...%, possibly several words.
        let end = text.indexOf('%', i + 1);
        if (end < 0) end = n;
        this.extended(text.slice(i + 1, end));
        i = end + 1;
        continue;
      }
      let end = text.indexOf('*', i);
      if (end < 0) end = n;
      this.word(text.slice(i, end));
      i = end + 1;
    }
    this.finish();
  }

  // Reads a coordinate number at this.pos and returns it in file units, as an integer count of the last digit unless
  // it has a decimal point (then as a decimal, flagged by `decimal`).
  private decimal = false;
  private digits = 0;
  private scanNumber(w: string): number {
    const n = w.length;
    let p = this.pos;
    let sign = 1;
    const c0 = w.charCodeAt(p);
    if (c0 === C_MINUS) {
      sign = -1;
      p += 1;
    } else if (c0 === C_PLUS) p += 1;
    let value = 0;
    let digits = 0;
    const start = p;
    while (p < n && isDigit(w.charCodeAt(p))) {
      value = value * 10 + (w.charCodeAt(p) - C_0);
      digits += 1;
      p += 1;
    }
    this.decimal = false;
    if (p < n && w.charCodeAt(p) === C_DOT) {
      p += 1;
      while (p < n && isDigit(w.charCodeAt(p))) p += 1;
      this.decimal = true;
      value = Number(w.slice(start, p));
    }
    this.digits = digits;
    this.pos = p;
    return sign * value;
  }

  // A coordinate in mm from its text in the file.
  private coordinate(w: string, axis: 'x' | 'y'): number {
    const fmt = this.format();
    const raw = this.scanNumber(w);
    const unit = this.unitFactor();
    if (this.decimal) return raw * unit;
    const intDigits = axis === 'x' ? fmt.intX : fmt.intY;
    const decDigits = axis === 'x' ? fmt.decX : fmt.decY;
    if (fmt.trailing) return raw * 10 ** (intDigits - this.digits) * unit;
    return (raw / 10 ** decDigits) * unit;
  }

  private readInt(w: string): number {
    const n = w.length;
    let p = this.pos;
    let value = 0;
    while (p < n && isDigit(w.charCodeAt(p))) {
      value = value * 10 + (w.charCodeAt(p) - C_0);
      p += 1;
    }
    this.pos = p;
    return value;
  }

  // A data block such as G01X100Y200D01, D10, G75 or M02.
  private word(w: string) {
    const n = w.length;
    // X2 attributes written as comments, as older KiCad versions did: G04 #@! TF.FileFunction,Copper,L1,Top
    if (w.startsWith('G04 #@! T')) {
      this.command(w.slice(8).trim());
      return;
    }
    this.hasX = this.hasY = this.hasI = this.hasJ = false;
    let op = 0;
    this.pos = 0;
    while (this.pos < n) {
      // Lower case codes were tolerated in old files.
      const ch = w[this.pos].toUpperCase();
      this.pos += 1;
      switch (ch) {
        case 'X':
          this.sx = this.coordinate(w, 'x');
          this.hasX = true;
          break;
        case 'Y':
          this.sy = this.coordinate(w, 'y');
          this.hasY = true;
          break;
        case 'I':
          this.si = this.coordinate(w, 'x');
          this.hasI = true;
          break;
        case 'J':
          this.sj = this.coordinate(w, 'y');
          this.hasJ = true;
          break;
        case 'G': {
          const g = this.readInt(w);
          // A comment: the rest of the word is text.
          if (g === 4) return;
          this.gCode(g);
          break;
        }
        case 'D': {
          const d = this.readInt(w);
          if (d >= 10) this.select(d);
          else if (d >= 1 && d <= 3) op = d;
          break;
        }
        case 'M': {
          const m = this.readInt(w);
          if (m === 2 || m === 0 || m === 30) this.ended = true;
          break;
        }
        case 'N':
          // Sequence numbers of old files.
          this.readInt(w);
          break;
        case ' ':
        case '\t':
        case '\r':
        case '\n':
          break;
        default:
          this.warn(`Unknown code "${ch}" in "${w.trim().slice(0, 40)}" was ignored.`);
          return;
      }
    }
    const hasCoords = this.hasX || this.hasY || this.hasI || this.hasJ;
    if (!op && hasCoords) {
      // Coordinates without an operation code repeat the last one (deprecated), or just move.
      op = this.lastOp || 2;
    }
    if (op) this.operation(op);
  }

  private gCode(g: number) {
    switch (g) {
      case 1:
      case 10:
      case 11:
      case 12:
        this.interp = 1;
        break;
      case 2:
        this.interp = 2;
        break;
      case 3:
        this.interp = 3;
        break;
      case 36:
        this.inRegion = true;
        this.contour = null;
        this.contours = [];
        break;
      case 37:
        this.endRegion();
        break;
      case 74:
        this.quadrant = 'single';
        break;
      case 75:
        this.quadrant = 'multi';
        break;
      case 70:
        this.unit = INCH;
        break;
      case 71:
        this.unit = 1;
        break;
      case 90:
        if (this.fmt) this.fmt.incremental = false;
        break;
      case 91:
        this.format().incremental = true;
        break;
      case 54:
      case 55:
        break;
      default:
        this.warn(`G${String(g).padStart(2, '0')} is not a Gerber command and was ignored.`);
    }
  }

  private select(code: number) {
    this.currentCode = code;
    this.current = this.apertureDict.get(code) ?? null;
  }

  private aperture(): ApertureEntry | null {
    if (!this.current) {
      this.current = this.apertureDict.get(this.currentCode) ?? null;
      if (!this.current) {
        this.warn(this.currentCode ? `Aperture D${this.currentCode} is used but not defined.` : 'An object is drawn before an aperture is selected.');
      }
    }
    return this.current;
  }

  private point(x: number, y: number): Pt {
    return { x, y };
  }

  private object(): number | undefined {
    if (this.objectDirty) {
      this.objectDirty = false;
      const keys = Object.keys(this.objectAttrs).sort();
      if (!keys.length) this.currentObject = undefined;
      else {
        const key = keys.map((k) => `${k}=${this.objectAttrs[k]}`).join('\u0001');
        let index = this.objectIndex.get(key);
        if (index === undefined) {
          index = this.objects.length;
          this.objects.push(boardObject(this.objectAttrs));
          this.objectIndex.set(key, index);
        }
        this.currentObject = index;
      }
    }
    return this.currentObject;
  }

  private emit(item: ArtItem) {
    const obj = this.object();
    if (obj !== undefined) item.obj = obj;
    this.target.push(item);
  }

  private operation(op: number) {
    const fmt = this.format();
    let x = this.x;
    let y = this.y;
    if (fmt.incremental) {
      if (this.hasX) x += this.sx;
      if (this.hasY) y += this.sy;
    } else {
      if (this.hasX) x = this.sx;
      if (this.hasY) y = this.sy;
    }
    const i = this.hasI ? this.si : 0;
    const j = this.hasJ ? this.sj : 0;
    this.lastOp = op;

    if (this.inRegion) {
      this.regionOperation(op, x, y, i, j);
    } else if (op === 1) {
      if (this.interp === 1) this.draw(x, y);
      else this.arc(x, y, i, j);
    } else if (op === 3) {
      this.flash(x, y);
    } else {
      this.here = null;
    }
    this.x = x;
    this.y = y;
  }

  // --- Arcs ---

  // The center, radius and angles of an arc from the current point to (x, y), or 'dot' for a zero-length one.
  private arcGeometry(x: number, y: number, i: number, j: number): { c: Pt; r: number; start: number; sweep: number } | 'dot' | null {
    const ccw = this.interp === 3;
    const x0 = this.x;
    const y0 = this.y;
    const closed = Math.abs(x - x0) < 1e-9 && Math.abs(y - y0) < 1e-9;
    const sweepFor = (cx: number, cy: number) => {
      const a0 = Math.atan2(y0 - cy, x0 - cx) / DEG;
      if (closed) return { a0, sweep: ccw ? 360 : -360 };
      let sweep = Math.atan2(y - cy, x - cx) / DEG - a0;
      if (ccw) {
        while (sweep <= 0) sweep += 360;
        while (sweep > 360) sweep -= 360;
      } else {
        while (sweep >= 0) sweep -= 360;
        while (sweep < -360) sweep += 360;
      }
      return { a0, sweep };
    };
    const multi = () => {
      const cx = x0 + i;
      const cy = y0 + j;
      const r = Math.hypot(x0 - cx, y0 - cy);
      if (r === 0) return null;
      const { a0, sweep } = sweepFor(cx, cy);
      return { c: this.point(cx, cy), r, start: a0, sweep, deviation: Math.abs(Math.hypot(x - cx, y - cy) - r) };
    };
    const single = () => {
      if (closed) return 'dot' as const;
      let best: { c: Pt; r: number; start: number; sweep: number; deviation: number; valid: boolean } | null = null;
      for (const sxi of i ? [1, -1] : [1]) {
        for (const syj of j ? [1, -1] : [1]) {
          const cx = x0 + sxi * Math.abs(i);
          const cy = y0 + syj * Math.abs(j);
          const r = Math.hypot(x0 - cx, y0 - cy);
          if (r === 0) continue;
          const { a0, sweep } = sweepFor(cx, cy);
          const deviation = Math.abs(Math.hypot(x - cx, y - cy) - r);
          const valid = Math.abs(sweep) <= 90.5;
          if (!best || (valid && !best.valid) || (valid === best.valid && deviation < best.deviation)) {
            best = { c: this.point(cx, cy), r, start: a0, sweep, deviation, valid };
          }
        }
      }
      return best;
    };
    if (this.quadrant === 'multi') return multi();
    if (this.quadrant === 'single') return single();
    // No quadrant mode given: take the reading that fits best.
    const m = multi();
    if (m && (closed || m.deviation <= Math.max(1e-3, m.r * 0.01))) return m;
    const s = single();
    if (s === 'dot' || !m) return s;
    return s && s.deviation < m.deviation ? s : m;
  }

  private arc(x: number, y: number, i: number, j: number) {
    const ap = this.aperture();
    if (!ap) return;
    const geo = this.arcGeometry(x, y, i, j);
    if (!geo) return;
    const dark = this.dark;
    if (geo === 'dot') {
      if (ap.strokeDiameter !== undefined) {
        const p = this.point(x, y);
        this.emit({ k: 'line', a: p, b: p, w: ap.strokeDiameter * this.scale, cap: 'round', dark });
      }
      this.here = null;
      return;
    }
    if (ap.strokeDiameter !== undefined) {
      this.emit({ k: 'arc', c: geo.c, r: geo.r, start: geo.start, sweep: geo.sweep, w: ap.strokeDiameter * this.scale, dark });
    } else if (ap.outline) {
      // Swept with a non-circular aperture (deprecated): the union of the sweeps along short chords.
      this.warn('Arcs drawn with a non-circular aperture (deprecated) are approximated.');
      const steps = Math.max(4, Math.ceil(Math.abs(geo.sweep) / 5));
      const outline = this.transformedOutline(ap.outline);
      const contours: Contour[] = [];
      let prev = { x: this.x, y: this.y };
      for (let k = 1; k <= steps; k += 1) {
        const a = (geo.start + (geo.sweep * k) / steps) * DEG;
        const next = k === steps ? { x, y } : { x: geo.c.x + geo.r * Math.cos(a), y: geo.c.y + geo.r * Math.sin(a) };
        contours.push(this.sweepContour(outline, prev, next));
        prev = next;
      }
      this.emit({ k: 'region', contours, dark });
    } else {
      this.warn('A block aperture cannot draw arcs; such arcs were left out.');
    }
    this.here = null;
  }

  // --- Draws and flashes ---

  private transformedOutline(outline: Pt[]): Pt[] {
    const mx = this.mirror === 'x' || this.mirror === 'xy' ? -1 : 1;
    const my = this.mirror === 'y' || this.mirror === 'xy' ? -1 : 1;
    return outline.map((p) => {
      const r = rotatePt({ x: p.x * mx, y: p.y * my }, this.rotation);
      return { x: r.x * this.scale, y: r.y * this.scale };
    });
  }

  // The area swept by a convex outline moved from a to b: the convex hull of the outline at both ends.
  private sweepContour(outline: Pt[], a: Pt, b: Pt): Contour {
    const pts = [...outline.map((p) => ({ x: p.x + a.x, y: p.y + a.y })), ...outline.map((p) => ({ x: p.x + b.x, y: p.y + b.y }))];
    return polyContour(convexHull(pts));
  }

  private draw(x: number, y: number) {
    const ap = this.aperture();
    if (!ap) return;
    const dark = this.dark;
    if (ap.strokeDiameter !== undefined) {
      const a = this.here && this.here.x === this.x && this.here.y === this.y ? this.here : this.point(this.x, this.y);
      const b = this.point(x, y);
      this.emit({ k: 'line', a, b, w: ap.strokeDiameter * this.scale, cap: 'round', dark });
      this.here = b;
      return;
    }
    this.here = null;
    if (ap.outline) {
      // Draws with rectangles and other shapes (deprecated): exact for convex shapes.
      if (ap.outline.length >= 3) {
        this.emit({ k: 'region', contours: [this.sweepContour(this.transformedOutline(ap.outline), { x: this.x, y: this.y }, { x, y })], dark });
      }
      return;
    }
    this.warn('A block aperture cannot draw lines; such lines were left out.');
  }

  private flash(x: number, y: number) {
    const ap = this.aperture();
    this.here = null;
    if (!ap) return;
    if (ap.block) {
      const m = flashMatrix({ x, y }, this.rotation, this.mirror, this.scale);
      const plain = this.rotation === 0 && this.mirror === 'none' && this.scale === 1;
      for (const item of ap.block) {
        const moved = plain ? translateItem(item, x, y) : transformItem(item, m);
        // A block flashed with clear polarity toggles the polarity of everything in it.
        moved.dark = this.dark ? item.dark : !item.dark;
        this.target.push(moved);
      }
      return;
    }
    if (ap.index === undefined) return;
    this.emit({ k: 'flash', at: this.point(x, y), ap: ap.index, rot: this.rotation, mirror: this.mirror, scale: this.scale, dark: this.dark });
  }

  // --- Regions ---

  private closeContour() {
    if (this.contour && this.contour.segs.length) this.contours.push(this.contour);
    this.contour = null;
  }

  private regionOperation(op: number, x: number, y: number, i: number, j: number) {
    if (op === 2) {
      this.closeContour();
      this.contour = { start: this.point(x, y), segs: [] };
      return;
    }
    if (op === 3) {
      this.warn('Flashes inside a region statement are not allowed and were ignored.');
      return;
    }
    if (!this.contour) this.contour = { start: this.point(this.x, this.y), segs: [] };
    if (this.interp === 1) {
      if (x !== this.x || y !== this.y) this.contour.segs.push({ to: this.point(x, y) });
      return;
    }
    const geo = this.arcGeometry(x, y, i, j);
    if (!geo || geo === 'dot') return;
    this.contour.segs.push({ to: this.point(x, y), arc: { c: geo.c, ccw: geo.sweep > 0 } });
  }

  private endRegion() {
    if (!this.inRegion) return;
    this.closeContour();
    this.inRegion = false;
    if (this.contours.length) this.emit({ k: 'region', contours: this.contours.map(counterClockwise), dark: this.dark });
    this.contours = [];
    this.here = null;
  }

  // --- Extended commands ---

  private extended(block: string) {
    const words = block.split('*');
    const first = words[0].replace(/^\s+/, '');
    if (first.startsWith('AM')) {
      const name = first.slice(2).trim();
      try {
        this.macros.set(name, parseMacro(name, words.slice(1)));
      } catch (e) {
        this.warn(`Aperture macro ${name}: ${e instanceof Error ? e.message : String(e)}.`);
      }
      return;
    }
    for (const raw of words) {
      const w = raw.trim();
      if (w) this.command(w);
    }
  }

  private command(w: string) {
    const code = w.slice(0, 2);
    const body = w.slice(2);
    switch (code) {
      case 'FS':
        this.formatSpec(body);
        break;
      case 'MO':
        if (/^MM/i.test(body)) this.unit = 1;
        else if (/^IN/i.test(body)) this.unit = INCH;
        else this.warn(`Unknown unit "${body}".`);
        break;
      case 'AD':
        this.defineAperture(body.replace(/\s+/g, ''));
        break;
      case 'AB':
        this.apertureBlock(body.trim());
        break;
      case 'SR':
        this.stepRepeat(body.replace(/\s+/g, ''));
        break;
      case 'LP':
        this.dark = !/^C/i.test(body);
        break;
      case 'LM': {
        const m = body.trim().toUpperCase();
        this.mirror = m === 'X' ? 'x' : m === 'Y' ? 'y' : m === 'XY' ? 'xy' : 'none';
        break;
      }
      case 'LR':
        this.rotation = Number(body) || 0;
        break;
      case 'LS':
        this.scale = Number(body) > 0 ? Number(body) : 1;
        break;
      case 'TF':
      case 'TA':
      case 'TO':
      case 'TD':
        this.attribute(code, body);
        break;
      case 'IP':
        if (/^NEG/i.test(body)) this.negative = true;
        break;
      case 'MI': {
        const a = /A\s*([01])/i.exec(body);
        const b = /B\s*([01])/i.exec(body);
        this.imageMirror = { a: a?.[1] === '1', b: b?.[1] === '1' };
        break;
      }
      case 'SF': {
        const a = /A\s*([-+]?[\d.]+)/i.exec(body);
        const b = /B\s*([-+]?[\d.]+)/i.exec(body);
        this.imageScale = { a: a ? Number(a[1]) || 1 : 1, b: b ? Number(b[1]) || 1 : 1 };
        break;
      }
      case 'OF': {
        const a = /A\s*([-+]?[\d.]+)/i.exec(body);
        const b = /B\s*([-+]?[\d.]+)/i.exec(body);
        const unit = this.unitFactor();
        this.imageOffset = { a: a ? (Number(a[1]) || 0) * unit : 0, b: b ? (Number(b[1]) || 0) * unit : 0 };
        break;
      }
      case 'IR':
        this.imageRotation = Number(body) || 0;
        break;
      case 'AS':
        if (/AYBX/i.test(body)) this.warn('Axis select AYBX (deprecated) only affects output devices and was ignored.');
        break;
      case 'IN':
      case 'LN':
      case 'IC':
        // Image name, load name and input code: comments.
        break;
      default:
        this.warn(`The command %${code}% is not supported and was ignored.`);
    }
  }

  private formatSpec(body: string) {
    const s = body.toUpperCase();
    const x = /X(\d)(\d)/.exec(s);
    const y = /Y(\d)(\d)/.exec(s);
    const lead = /^[LTD]?/.exec(s)[0];
    const fmt: Format = {
      intX: x ? Number(x[1]) : 2,
      decX: x ? Number(x[2]) : 4,
      intY: y ? Number(y[1]) : x ? Number(x[1]) : 2,
      decY: y ? Number(y[2]) : x ? Number(x[2]) : 4,
      trailing: lead === 'T',
      incremental: /^[LTD]?I/.test(s),
    };
    if (!x) this.warn(`The format "${body}" has no digit counts; 2.4 is assumed.`);
    this.fmt = fmt;
  }

  private defineAperture(body: string) {
    const m = /^D0*(\d+)([^,]+)(?:,(.*))?$/s.exec(body);
    if (!m) {
      this.warn(`Cannot read the aperture definition "AD${body}".`);
      return;
    }
    const code = Number(m[1]);
    const template = m[2];
    const args = m[3] ? m[3].split(/[Xx]/).map((v) => Number(v)) : [];
    const unit = this.unitFactor();
    const entry: ApertureEntry = {};
    let parts = null;
    const standard = standardAperture(template, args);
    if (standard) {
      parts = standard.parts;
      if (standard.strokeDiameter !== undefined) entry.strokeDiameter = standard.strokeDiameter * unit;
      if (standard.outline) entry.outline = standard.outline.map((p) => ({ x: p.x * unit, y: p.y * unit }));
    } else {
      const macro = this.macros.get(template);
      if (!macro) {
        this.warn(`Aperture D${code} uses the macro ${template}, which is not defined.`);
        parts = [];
      } else {
        parts = evaluateMacro(macro, args, (message) => this.warn(message));
        // Only for (invalid) draws with a macro aperture: the hull of its solid parts.
        const pts: Pt[] = [];
        for (const part of parts) {
          if (!part.dark) continue;
          if (part.poly) pts.push(...part.poly);
          if (part.circle) pts.push(...circlePoly(part.circle.c.x, part.circle.c.y, part.circle.r, 16));
        }
        if (pts.length >= 3) entry.outline = convexHull(pts).map((p) => ({ x: p.x * unit, y: p.y * unit }));
      }
    }
    const scaled = parts.map((part) => ({
      dark: part.dark,
      ...(part.circle ? { circle: { c: { x: part.circle.c.x * unit, y: part.circle.c.y * unit }, r: part.circle.r * unit } } : {}),
      ...(part.poly ? { poly: ccwPoly(part.poly.map((p) => ({ x: p.x * unit, y: p.y * unit }))) } : {}),
    }));
    const aperture: Aperture = { parts: scaled, name: m[3] ? `${template},${m[3]}` : template, code };
    if (Object.keys(this.apertureAttrs).length) aperture.attrs = { ...this.apertureAttrs };
    entry.index = this.apertures.length;
    this.apertures.push(aperture);
    this.apertureDict.set(code, entry);
    if (code === this.currentCode) this.current = entry;
  }

  private apertureBlock(body: string) {
    const m = /^D0*(\d+)/.exec(body);
    if (m) {
      const items: ArtItem[] = [];
      this.blocks.push({ code: Number(m[1]), items, outer: this.target });
      this.target = items;
      this.here = null;
      return;
    }
    const block = this.blocks.pop();
    if (!block) {
      this.warn('An %AB*% closes a block that was not opened.');
      return;
    }
    this.target = block.outer;
    this.apertureDict.set(block.code, { block: block.items });
    if (block.code === this.currentCode) this.current = this.apertureDict.get(block.code);
    this.here = null;
  }

  private stepRepeat(body: string) {
    const num = (letter: string, fallback: number) => {
      const m = new RegExp(`${letter}([-+]?[\\d.]+)`, 'i').exec(body);
      return m ? Number(m[1]) : fallback;
    };
    const nx = Math.max(1, Math.round(num('X', 1)));
    const ny = Math.max(1, Math.round(num('Y', 1)));
    // An open SR is closed by %SR*%, by %SRX1Y1...*%, or by the next %SRX..Y..*%.
    this.closeStepRepeat();
    if (!body || (nx === 1 && ny === 1)) return;
    if (this.blocks.length) {
      this.warn('Step and repeat inside a block aperture is not allowed and was ignored.');
      return;
    }
    const unit = this.unitFactor();
    const items: ArtItem[] = [];
    this.sr = { nx, ny, dx: num('I', 0) * unit, dy: num('J', 0) * unit, items, outer: this.target };
    this.target = items;
    this.here = null;
  }

  private closeStepRepeat() {
    const sr = this.sr;
    if (!sr) return;
    this.sr = null;
    this.target = sr.outer;
    // Copies go first along Y, then along X, as the specification requires.
    for (let ix = 0; ix < sr.nx; ix += 1) {
      for (let iy = 0; iy < sr.ny; iy += 1) {
        if (ix === 0 && iy === 0) {
          for (const item of sr.items) this.target.push(item);
        } else {
          for (const item of sr.items) this.target.push(translateItem(item, ix * sr.dx, iy * sr.dy));
        }
      }
    }
    this.here = null;
  }

  private attribute(code: string, body: string) {
    const comma = body.indexOf(',');
    const name = (comma < 0 ? body : body.slice(0, comma)).trim();
    // Characters a Gerber file cannot hold (such as * and %) are written as \uXXXX.
    const value = comma < 0 ? '' : body.slice(comma + 1).replace(/\\u([0-9a-fA-F]{4})/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
    switch (code) {
      case 'TF':
        this.fileAttrs[name] = value;
        break;
      case 'TA':
        this.apertureAttrs[name] = value;
        break;
      case 'TO':
        this.objectAttrs[name] = value;
        this.objectDirty = true;
        break;
      case 'TD':
        if (!name) {
          this.apertureAttrs = {};
          this.objectAttrs = {};
        } else {
          delete this.apertureAttrs[name];
          delete this.objectAttrs[name];
        }
        this.objectDirty = true;
        break;
    }
  }

  // --- End of file ---

  private finish() {
    if (this.inRegion) {
      this.warn('A region statement was not closed (G37).');
      this.endRegion();
    }
    this.closeStepRepeat();
    while (this.blocks.length) {
      this.warn('A block aperture was not closed (%AB*%).');
      this.apertureBlock('');
    }
    this.applyImageParameters();
    if (this.negative) {
      for (const item of this.items) item.dark = !item.dark;
    }
  }

  // MI, SF and OF move the coordinate data only (not the apertures); IR turns the whole image. The order is always MI,
  // SF, OF, IR.
  private applyImageParameters() {
    const { a: ma, b: mb } = this.imageMirror;
    const { a: sa, b: sb } = this.imageScale;
    const { a: oa, b: ob } = this.imageOffset;
    const rot = this.imageRotation;
    if (!ma && !mb && sa === 1 && sb === 1 && !oa && !ob && !rot) return;
    if (ma || mb || sa !== 1 || sb !== 1 || oa || ob) this.warn('The image is mirrored, scaled or moved by deprecated image parameters (MI, SF, OF).');
    const turn = { a: Math.cos(rot * DEG), b: Math.sin(rot * DEG), c: -Math.sin(rot * DEG), d: Math.cos(rot * DEG), e: 0, f: 0 };
    const coords = multiply(turn, { a: (ma ? -1 : 1) * sa, b: 0, c: 0, d: (mb ? -1 : 1) * sb, e: oa, f: ob });
    const p = (pt: Pt): Pt => ({ x: coords.a * pt.x + coords.c * pt.y + coords.e, y: coords.b * pt.x + coords.d * pt.y + coords.f });
    const flip = determinant(coords) < 0;
    const radiusScale = Math.sqrt(Math.abs(sa * sb));
    this.items = this.items.map((item): ArtItem => {
      const base = { dark: item.dark, ...(item.obj !== undefined ? { obj: item.obj } : {}) };
      switch (item.k) {
        case 'line':
          return { ...base, k: 'line', a: p(item.a), b: p(item.b), w: item.w, cap: item.cap };
        case 'arc': {
          const c = p(item.c);
          const s = p({ x: item.c.x + item.r * Math.cos(item.start * DEG), y: item.c.y + item.r * Math.sin(item.start * DEG) });
          return { ...base, k: 'arc', c, r: item.r * radiusScale, start: Math.atan2(s.y - c.y, s.x - c.x) / DEG, sweep: flip ? -item.sweep : item.sweep, w: item.w };
        }
        case 'flash':
          return { ...item, at: p(item.at), rot: item.rot + rot };
        case 'region':
          return {
            ...base,
            k: 'region',
            contours: item.contours.map((c) => counterClockwise({
              start: p(c.start),
              segs: c.segs.map((s) => (s.arc ? { to: p(s.to), arc: { c: p(s.arc.c), ccw: flip ? !s.arc.ccw : s.arc.ccw } } : { to: p(s.to) })),
            })),
          };
        default:
          return item;
      }
    });
  }
}

export function parseGerber(text: string): ParsedGerber {
  const plotter = new Plotter();
  try {
    plotter.read(text);
  } catch (e) {
    plotter.warn(`Reading stopped early: ${e instanceof Error ? e.message : String(e)}`);
  }
  const boxes = plotter.apertures.map(apertureBox);
  const bbox = emptyBox();
  for (const item of plotter.items) addItem(bbox, item, boxes);
  return {
    items: plotter.items,
    apertures: plotter.apertures,
    bbox,
    attrs: plotter.fileAttrs,
    objects: plotter.objects,
    negative: plotter.negative,
    units: plotter.units,
    warnings: [...plotter.warnings],
  };
}
