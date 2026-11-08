// Text in KiCad's stroke font (Newstroke), laid out as KiCad lays it out: glyph width and height, justification,
// several lines and their spacing, italic, mirroring, rotation, and KiCad's markup for superscript (^{…}), subscript
// (_{…}) and overbar (~{…}).
//
// Adapted from KiCanvas (https://github.com/theacodes/kicanvas, commit b031159): src/kicad/text/stroke-font.ts,
// glyph.ts, font.ts and markup.ts, Copyright (c) 2023 Alethea Katherine Flowers, published under the MIT License (the
// full text is on /licenses). KiCanvas adapted them from KiCad's stroke font. Changed here: plain numbers instead of
// KiCanvas's vector classes, characters beyond U+FFFF, "?" for characters the font does not have, strokes returned
// instead of drawn, and the box around the letters for knockout text.
//
// Units are KiCad's internal ones (nanometres) with Y down, so that the rounding matches KiCad's; angles are in
// degrees, counter-clockwise on screen.
import { glyph_data, shared_glyphs } from './newstroke-glyphs';

const FONT_SCALE = 1 / 21;
// KiCanvas follows an older KiCad here. These match KiCad 10's plots (kicad-cli) to the micrometre: glyphs 2/21 of
// the height lower (offset −8, not −10), lines 1.61 heights apart (not 1.62), the overbar 1.23 heights above the
// line (not 1.4), and superscript and subscript at 0.8 of the size (not 0.7), 0.35 and 0.15 of their height up and
// down (not 0.5 and 0.3).
const FONT_OFFSET = -8;
const ITALIC_TILT = 1 / 8;
const INTERLINE_PITCH_RATIO = 1.61;
const OVERBAR_POSITION_FACTOR = 1.23;
const UNDERLINE_POSITION_FACTOR = -0.16;
// How far stroke text moves with its stroke width t: t / 1.52 inwards from the side it is justified to, and 0.052 t
// up.
const STROKE_SHIFT_X = 1 / 1.52;
const STROKE_SHIFT_Y = 0.052;
const TAB_WIDTH = 4 * 0.82;
const SUPER_SUB_SIZE_MULTIPLIER = 0.8;
const SUPER_HEIGHT_OFFSET = 0.35;
const SUB_HEIGHT_OFFSET = 0.15;

const R = 82; // 'R': glyph coordinates are letters counted from R.

interface Glyph {
  // Each stroke as x0, y0, x1, y1… in glyph units (the cap height is 1).
  strokes: number[][];
  // How far the cursor moves after the glyph, and the lowest point (Y down).
  width: number;
  maxY: number;
}

// Decodes a glyph: the first pair is its left and right edge, then points, with " R" lifting the pen.
function decodeGlyph(data: string): Glyph {
  let startX = 0;
  let width = 0;
  let maxY = 0;
  const strokes: number[][] = [];
  let points: number[] | null = null;
  for (let i = 0; i + 1 < data.length; i += 2) {
    const a = data.charCodeAt(i);
    const b = data.charCodeAt(i + 1);
    if (i === 0) {
      startX = (a - R) * FONT_SCALE;
      width = (b - R) * FONT_SCALE - startX;
      continue;
    }
    if (a === 32 && b === R) {
      points = null;
      continue;
    }
    const x = (a - R) * FONT_SCALE - startX;
    const y = (b - R + FONT_OFFSET) * FONT_SCALE;
    if (!points) {
      points = [];
      strokes.push(points);
    }
    if (y > maxY) maxY = y;
    points.push(x, y);
  }
  return { strokes, width, maxY };
}

const glyphs = new Map<number, Glyph>();
const shared = new Map<number, Glyph>();

function glyphAt(index: number): Glyph | null {
  let g = glyphs.get(index);
  if (g) return g;
  const data = glyph_data[index];
  if (typeof data === 'string') g = decodeGlyph(data);
  else if (typeof data === 'number') {
    g = shared.get(data);
    if (!g) {
      g = decodeGlyph(shared_glyphs[data]);
      shared.set(data, g);
    }
  } else return null;
  glyphs.set(index, g);
  return g;
}

function glyphFor(codePoint: number): Glyph {
  const index = codePoint - 32;
  return (index >= 0 && index < glyph_data.length ? glyphAt(index) : null) ?? glyphAt('?'.charCodeAt(0) - 32);
}

// --- Markup ---

interface MarkupNode {
  text: string;
  sub: boolean;
  sup: boolean;
  overbar: boolean;
  children: MarkupNode[];
}

function node(): MarkupNode {
  return { text: '', sub: false, sup: false, overbar: false, children: [] };
}

// Splits text into runs: ^{…} superscript, _{…} subscript, ~{…} overbar, nested as written.
function parseMarkup(text: string): MarkupNode {
  const root = node();
  const stack: MarkupNode[] = [root];
  let start = 0;
  const push = (end: number) => {
    if (end > start) {
      const n = node();
      n.text = text.slice(start, end);
      stack[stack.length - 1].children.push(n);
    }
  };
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if ((c === '^' || c === '_' || c === '~') && text[i + 1] === '{') {
      push(i);
      const n = node();
      if (c === '^') n.sup = true;
      else if (c === '_') n.sub = true;
      else n.overbar = true;
      stack[stack.length - 1].children.push(n);
      stack.push(n);
      i += 1;
      start = i + 1;
    } else if (c === '}' && stack.length > 1) {
      push(i);
      stack.pop();
      start = i + 1;
    }
  }
  push(text.length);
  return root;
}

interface Style {
  italic: boolean;
  sub: boolean;
  sup: boolean;
  overbar: boolean;
  underline: boolean;
}

// Strokes of a text before mirroring and rotation, as x0, y0, x1, y1… in internal units.
interface Layout {
  strokes: number[][];
}

// Lays out a run of plain text from (x, y), adding its strokes; returns the cursor after it.
function layoutRun(text: string, sizeX: number, sizeY: number, x: number, y: number, originX: number, style: Style, out: Layout): { x: number; y: number } {
  let gx = sizeX;
  let gy = sizeY;
  let cx = x;
  let cy = y;
  const tilt = style.italic ? ITALIC_TILT : 0;
  if (style.sub || style.sup) {
    gx *= SUPER_SUB_SIZE_MULTIPLIER;
    gy *= SUPER_SUB_SIZE_MULTIPLIER;
    if (style.sub) cy += gy * SUB_HEIGHT_OFFSET;
    else cy -= gy * SUPER_HEIGHT_OFFSET;
  }
  for (const ch of text) {
    if (ch === '\t') {
      const tab = Math.round(gx * TAB_WIDTH);
      if (tab > 0) cx += tab - ((cx - originX) % tab);
      continue;
    }
    // A space is the font's space glyph: empty, 16/21 of the width wide.
    const g = glyphFor(ch.codePointAt(0));
    for (const s of g.strokes) {
      const pts: number[] = new Array(s.length);
      for (let k = 0; k < s.length; k += 2) {
        let px = s[k] * gx;
        const py = s[k + 1] * gy;
        if (tilt > 0) px -= py * tilt;
        pts[k] = px + cx;
        pts[k + 1] = py + cy;
      }
      out.strokes.push(pts);
    }
    // KiCanvas also takes the slant of italic glyphs off the advance; KiCad 10 does not.
    cx += Math.round(g.width * gx);
  }
  // Overbar or underline over the run, a little shorter than it.
  let barY: number | null = null;
  if (style.overbar) barY = gy * OVERBAR_POSITION_FACTOR;
  else if (style.underline) barY = gy * UNDERLINE_POSITION_FACTOR;
  if (barY !== null) {
    const trim = gx * 0.1;
    const barX = style.italic ? barY * ITALIC_TILT : 0;
    out.strokes.push([x + barX + trim, cy - barY, cx + barX - trim, cy - barY]);
  }
  return { x: cx, y };
}

function layoutMarkup(n: MarkupNode, sizeX: number, sizeY: number, x: number, y: number, originX: number, style: Style, out: Layout, root: boolean): { x: number; y: number } {
  let s = style;
  if (!root) {
    if (n.sub || n.sup) s = { italic: false, sub: n.sub, sup: n.sup, overbar: false, underline: false };
    if (n.overbar) s = { ...s, overbar: true };
  }
  let cursor = { x, y };
  if (!root && n.text) cursor = layoutRun(n.text, sizeX, sizeY, x, y, originX, s, out);
  for (const c of n.children) cursor = layoutMarkup(c, sizeX, sizeY, cursor.x, cursor.y, originX, s, out, false);
  return cursor;
}

// The cursor after a line of marked-up text: its width.
function lineWidth(text: string, sizeX: number, sizeY: number, italic: boolean): number {
  const scratch: Layout = { strokes: [] };
  return layoutMarkup(parseMarkup(text), sizeX, sizeY, 0, 0, 0, { italic, sub: false, sup: false, overbar: false, underline: false }, scratch, true).x;
}

export interface TextSpec {
  text: string;
  // The anchor, in internal units with Y down.
  x: number;
  y: number;
  // Degrees, counter-clockwise on screen.
  angle: number;
  // Glyph width and height and stroke width, internal units.
  sizeX: number;
  sizeY: number;
  thickness: number;
  hAlign: 'left' | 'center' | 'right';
  vAlign: 'top' | 'center' | 'bottom';
  mirror: boolean;
  italic: boolean;
  underline?: boolean;
  lineSpacing?: number;
}

export interface StrokedText {
  // Polylines in internal units, Y down, mirrored and rotated.
  strokes: number[][];
  // The box around the letters before rotation (mirrored), with half the stroke width, and the point it turns
  // around: knockout text cuts the letters out of this box grown by a margin.
  box: { minX: number; minY: number; maxX: number; maxY: number };
  origin: { x: number; y: number };
}

// The strokes of a text, as KiCad draws it.
export function strokeText(t: TextSpec): StrokedText {
  // As KiCad splits lines: a newline at the very end does not start another line.
  const lines = t.text.split('\n');
  if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
  const interline = t.sizeY * (t.lineSpacing ?? 1) * INTERLINE_PITCH_RATIO;
  const widths = lines.map((l) => lineWidth(l, t.sizeX, t.sizeY, t.italic));
  // 1.17 is KiCad's factor that keeps the positions of KiCad 6.
  const height = t.sizeY * 1.17 + (lines.length - 1) * interline;
  let offsetY = t.sizeY - t.thickness * STROKE_SHIFT_Y;
  if (t.vAlign === 'center') offsetY -= height / 2;
  else if (t.vAlign === 'bottom') offsetY -= height;
  const out: Layout = { strokes: [] };
  const style: Style = { italic: t.italic, sub: false, sup: false, overbar: false, underline: Boolean(t.underline) };
  const shiftX = t.thickness * STROKE_SHIFT_X;
  lines.forEach((line, n) => {
    let offsetX = shiftX;
    if (t.hAlign === 'center') offsetX = -widths[n] / 2;
    else if (t.hAlign === 'right') offsetX = -(widths[n] + shiftX);
    layoutMarkup(parseMarkup(line), t.sizeX, t.sizeY, t.x + offsetX, t.y + offsetY + n * interline, t.x, style, out, true);
  });

  // Mirror around the anchor, measure, then turn around it.
  const box = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  const half = t.thickness / 2;
  for (const s of out.strokes) {
    for (let k = 0; k < s.length; k += 2) {
      if (t.mirror) s[k] = 2 * t.x - s[k];
      const x = s[k];
      const y = s[k + 1];
      if (x - half < box.minX) box.minX = x - half;
      if (x + half > box.maxX) box.maxX = x + half;
      if (y - half < box.minY) box.minY = y - half;
      if (y + half > box.maxY) box.maxY = y + half;
    }
  }
  const angle = ((t.angle % 360) + 360) % 360;
  if (angle) {
    for (const s of out.strokes) {
      for (let k = 0; k < s.length; k += 2) {
        const p = rotate(s[k], s[k + 1], t.x, t.y, angle);
        s[k] = p.x;
        s[k + 1] = p.y;
      }
    }
  }
  return { strokes: out.strokes, box, origin: { x: t.x, y: t.y } };
}

// KiCad's RotatePoint: Y down, counter-clockwise on screen, exact for multiples of 90°.
export function rotate(x: number, y: number, ox: number, oy: number, angle: number): { x: number; y: number } {
  let dx = x - ox;
  let dy = y - oy;
  const a = ((angle % 360) + 360) % 360;
  if (a === 0) {
    // As it is.
  } else if (a === 90) {
    [dx, dy] = [dy, -dx];
  } else if (a === 180) {
    [dx, dy] = [-dx, -dy];
  } else if (a === 270) {
    [dx, dy] = [-dy, dx];
  } else {
    const r = (a * Math.PI) / 180;
    const sin = Math.sin(r);
    const cos = Math.cos(r);
    [dx, dy] = [dy * sin + dx * cos, dy * cos - dx * sin];
  }
  return { x: dx + ox, y: dy + oy };
}

// Breaks the lines of a text box's text at spaces so that each fits the column (internal units).
export function breakLines(text: string, column: number, sizeX: number, sizeY: number, thickness: number, italic: boolean): string {
  const space = lineWidth(' ', sizeX, sizeY, italic);
  return text.split('\n').map((line) => {
    const words = line.split(' ');
    const out: string[] = [];
    let current = '';
    let width = 0;
    for (const word of words) {
      const w = lineWidth(word, sizeX, sizeY, italic);
      if (!current) {
        current = word;
        width = w;
      } else if (width + space + w < column - thickness) {
        current += ` ${word}`;
        width += space + w;
      } else {
        out.push(current);
        current = word;
        width = w;
      }
    }
    out.push(current);
    return out.join('\n');
  }).join('\n');
}

// The margin around the letters of knockout text: a ninth of the glyph height (KiCad 10's plots).
export function knockoutMargin(sizeY: number): number {
  return Math.round(sizeY / 9);
}
