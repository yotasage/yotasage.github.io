// Altium text in the builder's text model (KiCad's: anchor, justification, glyph size, stroke), drawn in the stroke
// font as a stand-in for Altium's own fonts.
//
// Measured on Altium's print of the sample board: stroke text has its capitals HEIGHT tall, the anchor (X, Y) at the
// left end of the baseline, letters drawn with WIDTH as the stroke, and lines 1.2 × (HEIGHT + 2 WIDTH) apart; Altium
// 18 and later store the box around each text (TEXTBOXWIDTH × TEXTBOXHEIGHT, the strokes' extent plus WIDTH on every
// side), which sets how wide the letters are drawn, so that a text covers what it covers in Altium. A text frame
// (ISFRAME) places its lines in the box from the anchor, WIDTH inside its edges, by JUSTIFICATION (1 left top … 9
// right bottom). TrueType text has its baseline at the anchor too; its capitals are about 0.64 of HEIGHT (Arial).
// Rotation turns the text around the anchor; mirrored text is flipped about it (it reads from right to left).
import { strokeText } from '../font/stroke';
import { DesignText, Pt } from '../model';

const NM = 1e6;
// The pitch of the stroke layout's lines at lineSpacing 1, in glyph heights (lib/pcb/font/stroke.ts).
const LAYOUT_PITCH = 1.61;

export interface AltiumTextIn {
  s: string;
  at: Pt;
  rot: number;
  mirror: boolean;
  // Capital height, stroke width and line pitch of the drawn text (mm).
  cap: number;
  stroke: number;
  pitch: number;
  // The extent of the strokes' centre lines that the longest line should have (mm), when Altium gives it.
  width?: number;
  // A text frame: its size from the anchor, the margin inside it, and the justification (1–9).
  frame?: { w: number; h: number; inset: number; just: number };
}

type Just = DesignText['just'];

const H_OF: Just['h'][] = ['left', 'left', 'left', 'center', 'center', 'center', 'right', 'right', 'right'];
const V_OF: Just['v'][] = ['top', 'middle', 'bottom', 'top', 'middle', 'bottom', 'top', 'middle', 'bottom'];

interface Extent {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

// The extent of the strokes' centre lines of a text laid out at the origin (mm, Y down as the layout's).
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

// The anchor, glyph size, justification and line spacing that put the stroke font's text where Altium has it.
export function placeAltiumText(t: AltiumTextIn): Pick<DesignText, 'at' | 'rot' | 'h' | 'w' | 'thick' | 'mirror' | 'just' | 'lineSpacing'> | null {
  const lines = t.s.split('\n');
  const n = lines.length;
  const just: Just = t.frame ? { h: H_OF[t.frame.just - 1] ?? 'left', v: V_OF[t.frame.just - 1] ?? 'bottom' } : { h: 'left', v: 'bottom' };
  const lineSpacing = n > 1 ? t.pitch / (LAYOUT_PITCH * t.cap) : 1;
  let sizeX = t.cap;
  let e = extent(t.s, sizeX, t.cap, t.stroke, just, lineSpacing);
  if (!e) return null;
  // As wide as Altium's text, within reason (a single narrow glyph gives no measure).
  if (t.width && t.width > 0 && e.maxX - e.minX > t.cap * 0.2) {
    const k = t.width / (e.maxX - e.minX);
    if (k > 0.5 && k < 2) {
      sizeX = t.cap * k;
      e = extent(t.s, sizeX, t.cap, t.stroke, just, lineSpacing);
      if (!e) return null;
    }
  }
  // Where the capitals of the first line start and the baseline of the last line is, from a column of H.
  const h = extent(Array(n).fill('H').join('\n'), sizeX, t.cap, t.stroke, just, lineSpacing);
  const capTop = h ? -h.minY : t.cap;
  const baseline = h ? -h.maxY : 0;
  // The point of our layout that goes where Altium puts it (text frame, Y up), and that place.
  const ours = {
    x: just.h === 'left' ? e.minX : just.h === 'right' ? e.maxX : (e.minX + e.maxX) / 2,
    y: just.v === 'bottom' ? baseline : just.v === 'top' ? capTop : (capTop + baseline) / 2,
  };
  let target = { x: 0, y: 0 };
  if (t.frame) {
    const { w, h: fh, inset } = t.frame;
    target = {
      x: just.h === 'left' ? inset : just.h === 'right' ? w - inset : w / 2,
      y: just.v === 'bottom' ? inset : just.v === 'top' ? fh - inset : fh / 2,
    };
  }
  const dx = (target.x - ours.x) * (t.mirror ? -1 : 1);
  const dy = target.y - ours.y;
  const a = (t.rot * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  return {
    at: { x: t.at.x + dx * cos - dy * sin, y: t.at.y + dx * sin + dy * cos },
    rot: t.rot,
    h: t.cap,
    w: sizeX,
    thick: t.stroke,
    mirror: t.mirror,
    just,
    ...(n > 1 ? { lineSpacing } : {}),
  };
}
