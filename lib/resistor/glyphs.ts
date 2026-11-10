// A small stroke font for the drawings, so their markings, scale bars and captions do not depend on any installed
// font. Every glyph is the path of a pen: capitals stand on y = 6 and reach y = 0, lower-case letters are 4 high and
// descenders reach y = 8. Drawn for this tool; arcs are SVG arcs, so the shapes stay round at any size.

// [advance width, path]
const GLYPHS: Record<string, [number, string]> = {
  ' ': [2, ''],
  0: [4, 'M0 2A2 2 0 0 1 4 2V4A2 2 0 0 1 0 4Z'],
  1: [4, 'M0.9 1.4L2.5 0V6'],
  2: [4, 'M0 1.9A2 1.9 0 0 1 4 1.9C4 3.3 0 4.3 0 6H4'],
  3: [4, 'M0.2 1.1A1.9 1.5 0 1 1 2.1 3H1.5M2.1 3A1.9 1.5 0 1 1 0.1 4.8'],
  4: [4, 'M3.1 6V0L0 4.2H4'],
  5: [4, 'M3.7 0H0.7L0.4 2.6C1 2.2 1.6 2.1 2 2.1A2 1.95 0 0 1 2 6C1.1 6 0.4 5.6 0 5'],
  6: [4, 'M3.5 0.2C1.5 0.6 0 2.2 0 4A2 2 0 1 0 4 4A2 2 0 1 0 0 4'],
  7: [4, 'M0 0H4L1.4 6'],
  8: [4, 'M2 0A1.7 1.45 0 1 0 2 2.9A1.7 1.45 0 1 0 2 0M2 2.9A2 1.55 0 1 0 2 6A2 1.55 0 1 0 2 2.9'],
  9: [4, 'M0.5 5.8C2.5 5.4 4 3.8 4 2A2 2 0 1 0 0 2A2 2 0 1 0 4 2'],
  A: [4, 'M0 6L2 0L4 6M0.8 4H3.2'],
  B: [4, 'M0 0V6H2.3A1.7 1.6 0 0 0 2.3 2.8H0M2.3 2.8A1.4 1.4 0 0 0 2.3 0H0'],
  C: [4, 'M4 1.5A2.1 2.2 0 0 0 0 2.2V3.8A2.1 2.2 0 0 0 4 4.5'],
  D: [4, 'M0 0V6H1.6A2.4 3 0 0 0 1.6 0H0'],
  E: [3.8, 'M3.8 0H0V6H3.8M0 2.9H2.9'],
  F: [3.8, 'M3.8 0H0V6M0 2.9H2.9'],
  G: [4, 'M4 1.5A2.1 2.2 0 0 0 0 2.2V3.8A2.1 2.2 0 0 0 4 4.2V3.2H2.2'],
  H: [4, 'M0 0V6M4 0V6M0 2.9H4'],
  I: [1, 'M0.5 0V6'],
  J: [3, 'M3 0V4.3A1.5 1.7 0 0 1 0 4.5'],
  K: [4, 'M0 0V6M4 0L0 3.6M1.4 2.4L4 6'],
  L: [3.4, 'M0 0V6H3.4'],
  M: [5, 'M0 6V0L2.5 4L5 0V6'],
  N: [4, 'M0 6V0L4 6V0'],
  O: [4.4, 'M0 2.2A2.2 2.2 0 0 1 4.4 2.2V3.8A2.2 2.2 0 0 1 0 3.8Z'],
  P: [4, 'M0 6V0H2.3A1.6 1.6 0 0 1 2.3 3.2H0'],
  Q: [4.4, 'M0 2.2A2.2 2.2 0 0 1 4.4 2.2V3.8A2.2 2.2 0 0 1 0 3.8ZM2.6 4.4L4.5 6.3'],
  R: [4, 'M0 6V0H2.3A1.6 1.6 0 0 1 2.3 3.2H0M2.2 3.2L4 6'],
  S: [4, 'M3.8 1.2A1.9 1.5 0 0 0 2 0A1.9 1.5 0 0 0 2 3A1.9 1.5 0 0 1 2 6A1.9 1.5 0 0 1 0.1 4.7'],
  T: [4, 'M0 0H4M2 0V6'],
  U: [4, 'M0 0V4A2 2 0 0 0 4 4V0'],
  V: [4, 'M0 0L2 6L4 0'],
  W: [5.6, 'M0 0L1.4 6L2.8 1.2L4.2 6L5.6 0'],
  X: [4, 'M0 0L4 6M4 0L0 6'],
  Y: [4, 'M0 0L2 3L4 0M2 3V6'],
  Z: [4, 'M0 0H4L0 6H4'],
  a: [3.4, 'M3.4 2V6M3.4 4A1.7 2 0 1 0 0 4A1.7 2 0 1 0 3.4 4'],
  b: [3.4, 'M0 0V6M0 4A1.7 2 0 1 0 3.4 4A1.7 2 0 1 0 0 4'],
  c: [3.2, 'M3.2 2.9A1.7 2 0 1 0 3.2 5.1'],
  d: [3.4, 'M3.4 0V6M3.4 4A1.7 2 0 1 0 0 4A1.7 2 0 1 0 3.4 4'],
  e: [3.4, 'M0 4H3.4A1.7 2 0 1 0 3 5.3'],
  f: [2.4, 'M2.4 0.2A1.2 1.2 0 0 0 1 1.3V6M0 2.2H2.2'],
  g: [3.4, 'M3.4 2V6.4A1.7 1.6 0 0 1 0.3 7.3M3.4 4A1.7 2 0 1 0 0 4A1.7 2 0 1 0 3.4 4'],
  h: [3.4, 'M0 0V6M0 3.7A1.7 1.7 0 0 1 3.4 3.7V6'],
  i: [1, 'M0.5 2V6M0.5 0.3V0.5'],
  j: [1.6, 'M1.1 2V6.6A1.1 1.2 0 0 1 0 7.6M1.1 0.3V0.5'],
  k: [3.2, 'M0 0V6M3.2 2L0 4.6M1.2 3.7L3.2 6'],
  l: [1, 'M0.5 0V6'],
  m: [5.4, 'M0 2V6M0 3.4A1.35 1.4 0 0 1 2.7 3.4V6M2.7 3.4A1.35 1.4 0 0 1 5.4 3.4V6'],
  n: [3.4, 'M0 2V6M0 3.7A1.7 1.7 0 0 1 3.4 3.7V6'],
  o: [3.4, 'M3.4 4A1.7 2 0 1 0 0 4A1.7 2 0 1 0 3.4 4'],
  p: [3.4, 'M0 2V8M0 4A1.7 2 0 1 0 3.4 4A1.7 2 0 1 0 0 4'],
  q: [3.4, 'M3.4 2V8M3.4 4A1.7 2 0 1 0 0 4A1.7 2 0 1 0 3.4 4'],
  r: [2.4, 'M0 2V6M0 3.6A1.7 1.7 0 0 1 2.4 2.3'],
  s: [3, 'M2.8 2.8A1.4 1 0 0 0 1.5 2A1.4 1 0 0 0 1.5 4A1.4 1 0 0 1 1.5 6A1.4 1 0 0 1 0.1 5.2'],
  t: [2.4, 'M1 0.6V4.8A1.2 1.2 0 0 0 2.4 5.9M0 2.2H2.2'],
  u: [3.4, 'M0 2V4.3A1.7 1.7 0 0 0 3.4 4.3M3.4 2V6'],
  v: [3.4, 'M0 2L1.7 6L3.4 2'],
  w: [5, 'M0 2L1.25 6L2.5 2.8L3.75 6L5 2'],
  x: [3.2, 'M0 2L3.2 6M3.2 2L0 6'],
  y: [3.4, 'M0 2L1.7 6M3.4 2L1.2 7.3C1 7.8 0.6 8 0.1 7.9'],
  z: [3.2, 'M0 2H3.2L0 6H3.2'],
  '.': [1, 'M0.5 5.8V6'],
  ',': [1, 'M0.6 5.8V6L0.2 7'],
  ':': [1, 'M0.5 2.6V2.8M0.5 5.8V6'],
  '-': [2.6, 'M0 3.6H2.6'],
  '−': [3.4, 'M0 3.2H3.4'],
  '–': [3.4, 'M0 3.4H3.4'],
  '+': [3.4, 'M0 3.2H3.4M1.7 1.5V4.9'],
  '±': [3.4, 'M0 2.6H3.4M1.7 0.9V4.3M0 6H3.4'],
  '=': [3.4, 'M0 2.4H3.4M0 4.2H3.4'],
  '%': [4.6, 'M4.2 0L0.4 6M1 0A1 1.2 0 1 0 1 2.4A1 1.2 0 1 0 1 0M3.6 3.6A1 1.2 0 1 0 3.6 6A1 1.2 0 1 0 3.6 3.6'],
  '/': [2.8, 'M2.8 0L0 6.6'],
  '×': [3, 'M0 1.8L3 4.8M3 1.8L0 4.8'],
  '·': [1, 'M0.5 3.1V3.3'],
  '(': [1.6, 'M1.6 -0.4A6 6 0 0 0 1.6 7'],
  ')': [1.6, 'M0 -0.4A6 6 0 0 1 0 7'],
  _: [4, 'M0 7H4'],
  '°': [2, 'M1 0A1 1 0 1 0 1 2A1 1 0 1 0 1 0'],
  'Ω': [4.6, 'M0 6H1.6V5.3A2.3 2.6 0 1 1 3 5.3V6H4.6'],
  'µ': [3.4, 'M0 2V8M0 4.3A1.7 1.7 0 0 0 3.4 4.3M3.4 2V6'],
  '⌀': [4, 'M2 1A2 2 0 1 0 2 5A2 2 0 1 0 2 1M3.8 0.6L0.2 5.4'],
};

// A character the font does not have is drawn as a small box.
const MISSING: [number, string] = [3, 'M0 1H3V6H0Z'];

// Space between two characters, in the units of the glyphs.
const GAP = 1.5;

const glyph = (c: string) => GLYPHS[c] ?? MISSING;

const num = (value: number) => String(Number(value.toFixed(4)));

// The width of a text whose capitals are `height` high.
export function textWidth(text: string, height: number): number {
  let units = 0;
  for (const c of text) units += glyph(c)[0] + GAP;
  return Math.max(0, units - GAP) * (height / 6);
}

export interface StrokeTextOptions {
  // Where the text starts, is centred or ends, by `anchor`.
  x: number;
  // The line the capitals stand on.
  y: number;
  // The height of a capital.
  height: number;
  colour: string;
  anchor?: 'start' | 'middle' | 'end';
  // The width of the pen in the units of the glyphs (a capital is 6 high): about 0.7 is regular, 1.1 is bold.
  weight?: number;
  opacity?: number;
}

// A text as SVG paths.
export function strokeText(text: string, o: StrokeTextOptions): string {
  const scale = o.height / 6;
  const width = textWidth(text, o.height);
  const left = o.anchor === 'middle' ? o.x - width / 2 : o.anchor === 'end' ? o.x - width : o.x;
  let at = 0;
  let paths = '';
  for (const c of text) {
    const [advance, d] = glyph(c);
    if (d) paths += `<path${at ? ` transform="translate(${num(at)})"` : ''} d="${d}"/>`;
    at += advance + GAP;
  }
  const opacity = o.opacity === undefined ? '' : ` opacity="${o.opacity}"`;
  return `<g transform="translate(${num(left)} ${num(o.y - o.height)}) scale(${num(scale)})" fill="none" stroke="${o.colour}" stroke-width="${o.weight ?? 0.72}" stroke-linecap="round" stroke-linejoin="round"${opacity}>${paths}</g>`;
}
