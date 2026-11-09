// EAGLE text in the builder's text model (KiCad's: anchor, justification, glyph size, stroke), drawn in the stroke font
// as a stand-in for EAGLE's vector font, which EAGLE's CAM processor uses for every text.
//
// Measured on the Gerber files of EAGLE's CAM processor (LibreVNA, mutantC): the strokes are the text's size × ratio %
// wide, and the outer edges of the capitals span the size: with bottom-left alignment the left edge of the first letter
// and the bottom edge of the capitals are at the anchor, top puts the top edge of the capitals there, right the right
// edge of the last letter, and center the middle of the strokes. Several lines are each aligned, the size × (1 +
// distance %) apart. A rotation turns the text about the anchor, then a mirrored text is flipped about the anchor's
// vertical line. Unless the text has the spin flag, a text that would read upside down (an angle over 90° and up to
// 270°, or from 90° below 270° when vertical text reads downwards) is turned by 180° with its alignment reversed, so it
// covers the same place and reads from the bottom or the right.
//
// EAGLE marks overlines with "!": "!RESET", "!RST!/NMI"; a "!" or "," ends one, "\!" is an exclamation mark, and a "!"
// at the end or before a blank, a quote or a closing bracket starts none.
import { strokeText } from '../font/stroke';
import { DesignText, Pt } from '../model';

const NM = 1e6;
// The glyph width of the stroke font as a share of its capital height, so that a text is about as wide as EAGLE's.
export const WIDTH_RATIO = 1;

export interface EagleTextIn {
  s: string;
  at: Pt;
  // The angle of the text on the board before the readability turn, counter-clockwise; mirrored text is turned by it,
  // then flipped about the anchor's vertical line.
  angle: number;
  mirror: boolean;
  spin: boolean;
  size: number;
  ratio: number;
  align: string;
  distance: number;
  verticalDown?: boolean;
}

type Just = DesignText['just'];

interface Extent {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

function extent(text: string, sizeX: number, sizeY: number, thick: number, just: Just, lineSpacing: number): Extent | null {
  const r = strokeText({
    text, x: 0, y: 0, angle: 0, sizeX: sizeX * NM, sizeY: sizeY * NM, thickness: thick * NM,
    hAlign: just.h, vAlign: just.v === 'middle' ? 'center' : just.v, mirror: false, italic: false, lineSpacing,
  });
  const e: Extent = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
  for (const s of r.strokes) {
    for (let k = 0; k < s.length; k += 2) {
      e.minX = Math.min(e.minX, s[k] / NM);
      e.maxX = Math.max(e.maxX, s[k] / NM);
      e.minY = Math.min(e.minY, s[k + 1] / NM);
      e.maxY = Math.max(e.maxY, s[k + 1] / NM);
    }
  }
  return e.minX <= e.maxX ? e : null;
}

function normalize(deg: number): number {
  const r = deg % 360;
  const n = r < 0 ? r + 360 : r;
  const rounded = Math.round(n * 1e9) / 1e9;
  return rounded === 360 ? 0 : rounded;
}

// EAGLE's alignment keyword as justification.
export function eagleJust(align: string | undefined): Just {
  const a = (align ?? 'bottom-left').toLowerCase();
  const h = /left/.test(a) ? 'left' : /right/.test(a) ? 'right' : 'center';
  const v = /bottom/.test(a) ? 'bottom' : /top/.test(a) ? 'top' : 'middle';
  return { h, v };
}

// Whether EAGLE turns a text at this angle (as seen from the side it is read from) by 180° to keep it readable.
export function upsideDown(angle: number, verticalDown = false): boolean {
  const a = normalize(angle);
  return verticalDown ? a >= 90 && a < 270 : a > 90 && a <= 270;
}

// EAGLE's overline marks as KiCad's markup (~{…}).
export function eagleMarkup(s: string): string {
  let out = '';
  let open = false;
  for (let i = 0; i < s.length; i += 1) {
    const c = s[i];
    if (c === '\\' && s[i + 1] === '!') {
      out += '!';
      i += 1;
      continue;
    }
    if (c === '!') {
      if (open) {
        out += '}';
        open = false;
        continue;
      }
      const next = s[i + 1];
      if (next === undefined || next === '\n' || /[\s"')\]}]/.test(next)) {
        out += '!';
        continue;
      }
      out += '~{';
      open = true;
      continue;
    }
    if (open && (c === ',' || c === '\n')) {
      out += '}';
      open = false;
    }
    out += c;
  }
  if (open) out += '}';
  return out;
}

// The anchor, glyph size, justification and line spacing that put the stroke font's text where EAGLE draws it.
export function placeEagleText(t: EagleTextIn): Pick<DesignText, 'at' | 'rot' | 'h' | 'w' | 'thick' | 'mirror' | 'just' | 'lineSpacing'> | null {
  if (!t.s.trim() || !(t.size > 0)) return null;
  let just = eagleJust(t.align);
  let angle = normalize(t.angle);
  if (!t.spin && upsideDown(angle, t.verticalDown)) {
    angle = normalize(angle + 180);
    just = { h: just.h === 'left' ? 'right' : just.h === 'right' ? 'left' : 'center', v: just.v === 'top' ? 'bottom' : just.v === 'bottom' ? 'top' : 'middle' };
  }
  const thick = (t.size * Math.max(0, t.ratio)) / 100;
  // The centre lines of the capitals span the size less the stroke.
  const cap = Math.max(t.size - thick, t.size * 0.1);
  const lines = t.s.split('\n');
  const n = lines.length;
  // The stroke layout puts lines 1.61 glyph heights apart at line spacing 1.
  const pitch = t.size * (1 + Math.max(0, t.distance) / 100);
  const hRef = extent('H', cap, cap, thick, { h: 'left', v: 'bottom' }, 1);
  const hHeight = hRef ? hRef.maxY - hRef.minY : cap;
  const sizeY = (cap * cap) / (hHeight || cap);
  const sizeX = sizeY * WIDTH_RATIO;
  const lineSpacing = n > 1 ? pitch / (1.61 * sizeY) : 1;
  const e = extent(t.s, sizeX, sizeY, thick, just, lineSpacing);
  if (!e) return null;
  // Where the capitals of the first line start and the baseline of the last line is, from a column of H.
  const col = extent(Array(n).fill('H').join('\n'), sizeX, sizeY, thick, just, lineSpacing);
  const capTop = col ? -col.minY : cap;
  const baseline = col ? -col.maxY : 0;
  // The point of our layout (Y up) that goes where EAGLE puts the anchor, and where that is from the anchor.
  const ours = {
    x: just.h === 'left' ? e.minX : just.h === 'right' ? e.maxX : (e.minX + e.maxX) / 2,
    y: just.v === 'bottom' ? baseline : just.v === 'top' ? capTop : (capTop + baseline) / 2,
  };
  const half = thick / 2;
  const target = {
    x: just.h === 'left' ? half : just.h === 'right' ? -half : 0,
    y: just.v === 'bottom' ? half : just.v === 'top' ? -half : 0,
  };
  // In the board frame: EAGLE turns the text, then flips it about the vertical line through the anchor; the stroke
  // layout mirrors first and turns after, so a mirrored text has the opposite angle there.
  const rot = t.mirror ? normalize(-angle) : angle;
  const dx = (target.x - ours.x) * (t.mirror ? -1 : 1);
  const dy = target.y - ours.y;
  const a = (rot * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  return {
    at: { x: t.at.x + dx * cos - dy * sin, y: t.at.y + dx * sin + dy * cos },
    rot,
    h: sizeY,
    w: sizeX,
    thick,
    mirror: t.mirror,
    just,
    ...(n > 1 ? { lineSpacing } : {}),
  };
}
