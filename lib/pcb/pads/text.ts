// PADS text in the builder's text model (KiCad's: anchor, justification, glyph size, stroke), drawn in the stroke font
// as a stand-in for PADS's own stroke font (Romansim, a Hershey font: a cell 32 units high, capitals 21 units).
//
// Measured on Linear's Gerber files of the sample board (DC2637A): capitals are 21/32 of the text's height tall, drawn
// with its width as the stroke; LEFT puts the left end of the first letter's stroke at the anchor, DOWN the baseline,
// CENTER the middle of the cell (12.5/32 of the height above the baseline) and UP its top (25/32 above). Rotation turns
// the text around the anchor; mirrored text is flipped about it (it reads from right to left).
import { strokeText } from '../font/stroke';
import { DesignText, Pt } from '../model';

const NM = 1e6;

// Capitals as a share of the height: PADS's stroke font, and TrueType faces (about Arial's).
const STROKE_CAP = 21 / 32;
const TRUETYPE_CAP = 0.7;
// The glyph width of the stroke font as a share of the capital height, so that a text is about as wide as PADS's.
export const WIDTH_RATIO = 0.82;
// The width of a space in the stroke font and in Hershey's, as a share of the capital height.
const SPACE = 16 / 21;

export interface PadsTextIn {
  s: string;
  at: Pt;
  rot: number;
  mirror: boolean;
  // The text height and stroke width (mm).
  height: number;
  stroke: number;
  h: string;
  v: string;
  trueType?: boolean;
}

interface Extent {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

// The extent of the strokes' centre lines of a text laid out at the origin, left and bottom justified (mm, Y down as
// the layout's).
function extent(text: string, sizeX: number, sizeY: number, thick: number): Extent | null {
  const r = strokeText({
    text, x: 0, y: 0, angle: 0, sizeX: sizeX * NM, sizeY: sizeY * NM, thickness: thick * NM,
    hAlign: 'left', vAlign: 'bottom', mirror: false, italic: false,
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

// The anchor, glyph size and justification that put the stroke font's text where PADS draws it.
export function placePadsText(t: PadsTextIn): Pick<DesignText, 'at' | 'rot' | 'h' | 'w' | 'thick' | 'mirror' | 'just'> | null {
  const s = t.s.replace(/\s+$/, '');
  if (!s || !(t.height > 0)) return null;
  const cap = t.height * (t.trueType ? TRUETYPE_CAP : STROKE_CAP);
  let sizeX = cap * WIDTH_RATIO;
  const thick = t.trueType ? cap / 8 : Math.max(0, t.stroke);
  let e = extent(s, sizeX, cap, thick);
  if (!e) return null;
  // Spaces are as wide as in Hershey's fonts (16/21 of the capitals) while the letters are narrower than ours: the text
  // is made as much wider as its spaces need.
  const spaces = s.split(' ').length - 1;
  const width = e.maxX - e.minX;
  if (spaces && width > cap * 0.2) {
    sizeX *= (width + spaces * SPACE * cap * (1 - WIDTH_RATIO)) / width;
    e = extent(s, sizeX, cap, thick) ?? e;
  }
  // Where the baseline of our layout is, from an H.
  const hExt = extent('H', sizeX, cap, thick);
  const baseline = hExt ? -hExt.maxY : 0;
  const h = t.h.toUpperCase();
  const v = t.v.toUpperCase();
  const ours = { x: h === 'RIGHT' ? e.maxX : h === 'CENTER' ? (e.minX + e.maxX) / 2 : e.minX, y: baseline };
  const target = { x: 0, y: v === 'UP' ? -(25 / 32) * t.height : v === 'CENTER' ? -(12.5 / 32) * t.height : 0 };
  const dx = (target.x - ours.x) * (t.mirror ? -1 : 1);
  const dy = target.y - ours.y;
  const a = (t.rot * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  return {
    at: { x: t.at.x + dx * cos - dy * sin, y: t.at.y + dx * sin + dy * cos },
    rot: t.rot,
    h: cap,
    w: sizeX,
    thick,
    mirror: t.mirror,
    just: { h: 'left', v: 'bottom' },
  };
}
