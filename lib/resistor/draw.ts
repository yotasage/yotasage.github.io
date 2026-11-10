// Drawings of a chip resistor (top view) and of an axial resistor with colour bands, as self-contained SVG markup:
// no CSS variables, no external references and no fonts (text is drawn with the stroke font of glyphs.ts). The
// viewBox is in millimetres. The same markup is shown on the page and exported (export.ts).

import { Colour, colour } from './colours';
import { strokeText, textWidth } from './glyphs';
import { AxialBody, ChipSize } from './packages';

export type DrawStyle = 'realistic' | 'flat';

export interface BodyCoat {
  id: string;
  label: string;
  hex: string;
  // Where the colour is usual, if it is.
  what?: string;
}

// Colours of the lacquer of an axial resistor.
export const BODY_COATS: BodyCoat[] = [
  { id: 'beige', label: 'Beige', hex: '#dcc8a0', what: 'usual for carbon film' },
  { id: 'blue', label: 'Blue', hex: '#84b4dc', what: 'usual for metal film' },
  { id: 'green', label: 'Green', hex: '#97c49c' },
  { id: 'grey', label: 'Grey', hex: '#c9cbc6' },
];

export const bodyCoat = (id: string) => BODY_COATS.find((c) => c.id === id) ?? BODY_COATS[0];

export interface DrawOptions {
  style: DrawStyle;
  // Outlines of the flat style, the scale bar and the caption. On the page this is `currentColor`.
  ink?: string;
  // A colour behind the drawing; none leaves it transparent.
  background?: string | null;
  // Lines under the drawing: the value first, then what else is to be said.
  caption?: string[];
  // A prefix for the ids of gradients and filters, so two drawings on one page do not share them.
  id?: string;
  // Adds an invisible area over each band, marked data-band, for clicking.
  interactive?: boolean;
  // Said by screen readers.
  label?: string;
}

export interface Drawing {
  svg: string;
  // The size of the viewBox, in millimetres.
  width: number;
  height: number;
  // Where each band is along the width, in millimetres (axial only).
  bands: { x: number; width: number }[];
}

const INK = '#2b2a27';

const f = (value: number) => String(Number(value.toFixed(4)));

function mix(hex: string, other: string, share: number): string {
  const parts = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [a, b] = [parts(hex), parts(other)];
  return `#${a.map((v, i) => Math.round(v + (b[i] - v) * share).toString(16).padStart(2, '0')).join('')}`;
}

const stops = (list: [number, string, number?][]) => list
  .map(([offset, hex, opacity]) => `<stop offset="${offset}" stop-color="${hex}"${opacity === undefined ? '' : ` stop-opacity="${opacity}"`}/>`)
  .join('');

// The parts every drawing has around the part itself: background, scale bar and caption.
function frame(o: DrawOptions, width: number, partBottom: number, left: number, defs: string, content: string, bands: Drawing['bands']): Drawing {
  const ink = o.ink ?? INK;
  // Text and the scale bar are sized by the picture, not by the part, so they read alike for every size.
  const u = Math.max(width, partBottom * 2.6) / 100;
  let extra = '';

  const length = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20].filter((v) => v <= width * 0.3).pop() ?? 0.1;
  const barY = partBottom + 2.6 * u;
  extra += `<path d="M${f(left)} ${f(barY - 1.1 * u)}V${f(barY + 1.1 * u)}M${f(left)} ${f(barY)}H${f(left + length)}M${f(left + length)} ${f(barY - 1.1 * u)}V${f(barY + 1.1 * u)}" fill="none" stroke="${ink}" stroke-width="${f(0.34 * u)}" stroke-linecap="round" opacity="0.8"/>`;
  extra += strokeText(`${length} mm`, { x: left + length + 1.8 * u, y: barY + 1.05 * u, height: 2.1 * u, colour: ink, weight: 0.75, opacity: 0.8 });
  let y = barY + 3.2 * u;

  if (o.caption?.length) {
    y += 2 * u;
    o.caption.forEach((line, i) => {
      const wanted = i === 0 ? 3.7 * u : 2.5 * u;
      const height = Math.min(wanted, (wanted * (width - 8 * u)) / Math.max(textWidth(line, wanted), 1e-9));
      y += height;
      extra += strokeText(line, { x: width / 2, y, height, colour: ink, anchor: 'middle', weight: i === 0 ? 0.85 : 0.7, opacity: i === 0 ? 1 : 0.78 });
      y += 2.1 * u;
    });
    y += 0.6 * u;
  }

  const height = y + 1.2 * u;
  const back = o.background ? `<rect width="${f(width)}" height="${f(height)}" fill="${o.background}"/>` : '';
  const label = o.label ? ` role="img" aria-label="${o.label.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')}"` : '';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${f(width)} ${f(height)}"${label}>${back}${defs ? `<defs>${defs}</defs>` : ''}${content}${extra}</svg>`;
  return { svg, width, height, bands };
}

const METAL: Partial<Record<Colour, [number, string][]>> = {
  gold: [[0, '#9a7a2a'], [0.2, '#fbeeb8'], [0.36, '#d9b450'], [0.7, '#b8912f'], [1, '#8a6a1c']],
  silver: [[0, '#979ba3'], [0.2, '#ffffff'], [0.36, '#cdd1d7'], [0.7, '#a9adb5'], [1, '#83878f']],
};

// An axial resistor seen from the side, with the bands in reading order from the left. The wider gap is before the
// tolerance band (the fourth of four, the fifth of five and six).
export function drawAxial(colours: Colour[], body: AxialBody, coatId: string, o: DrawOptions): Drawing {
  const id = o.id ?? 'rz';
  const realistic = o.style !== 'flat';
  const ink = o.ink ?? INK;
  const coat = bodyCoat(coatId).hex;
  const L = body.length;
  const D = body.diameter;
  const r = D / 2;
  const d = body.leadDiameter;
  const lead = Math.min(6, Math.max(2.6, L * 0.5));
  const padX = D * 0.3;
  const width = L + 2 * lead + 2 * padX;
  const x0 = padX + lead;
  const x1 = x0 + L;
  const cy = D * 0.4 + r;
  const sw = Math.max(0.05, D * 0.036);

  // The body is thicker over the end caps (length c) than between them, with a shoulder (length s) and rounded ends.
  const rw = r * 0.88;
  const c = Math.min(0.22 * L, 0.8 * D);
  const e = r * 0.5;
  const s = c * 0.45;
  const [a, b, a2, b2] = [x0 + c - s / 2, x0 + c + s / 2, x1 - c + s / 2, x1 - c - s / 2];
  const y = (k: number, sign: number) => f(cy + sign * k);
  const half = (sign: number, from: 'left' | 'right') => (from === 'left'
    ? `C${f(x0)} ${y(r * 0.62, sign)} ${f(x0 + e * 0.3)} ${y(r, sign)} ${f(x0 + e)} ${y(r, sign)}L${f(a)} ${y(r, sign)}`
      + `C${f(x0 + c)} ${y(r, sign)} ${f(x0 + c)} ${y(rw, sign)} ${f(b)} ${y(rw, sign)}L${f(b2)} ${y(rw, sign)}`
      + `C${f(x1 - c)} ${y(rw, sign)} ${f(x1 - c)} ${y(r, sign)} ${f(a2)} ${y(r, sign)}L${f(x1 - e)} ${y(r, sign)}`
      + `C${f(x1 - e * 0.3)} ${y(r, sign)} ${f(x1)} ${y(r * 0.62, sign)} ${f(x1)} ${f(cy)}`
    : `C${f(x1)} ${y(r * 0.62, sign)} ${f(x1 - e * 0.3)} ${y(r, sign)} ${f(x1 - e)} ${y(r, sign)}L${f(a2)} ${y(r, sign)}`
      + `C${f(x1 - c)} ${y(r, sign)} ${f(x1 - c)} ${y(rw, sign)} ${f(b2)} ${y(rw, sign)}L${f(b)} ${y(rw, sign)}`
      + `C${f(x0 + c)} ${y(rw, sign)} ${f(x0 + c)} ${y(r, sign)} ${f(a)} ${y(r, sign)}L${f(x0 + e)} ${y(r, sign)}`
      + `C${f(x0 + e * 0.3)} ${y(r, sign)} ${f(x0)} ${y(r * 0.62, sign)} ${f(x0)} ${f(cy)}`);
  const outline = `M${f(x0)} ${f(cy)}${half(-1, 'left')}${half(1, 'right')}Z`;

  // Bands: the digits and the multiplier from the left cap, the tolerance (and the coefficient) at the right cap.
  const n = colours.length;
  const xl = x0 + c * 0.58;
  const xr = x1 - c * 0.58;
  let centres: number[];
  let bandWidth: number;
  let pitch: number;
  if (n <= 1) {
    centres = n ? [(x0 + x1) / 2] : [];
    bandWidth = L * 0.11;
    pitch = bandWidth * 2;
  } else {
    const leftCount = n <= 4 ? Math.min(n, 3) : 4;
    const rightCount = n - leftCount;
    pitch = (xr - xl) / (leftCount - 1 + 1.75 + Math.max(0, rightCount - 1));
    bandWidth = Math.min(0.56 * pitch, 0.095 * L);
    centres = colours.map((_, i) => (i < leftCount ? xl + i * pitch : xr - (n - 1 - i) * pitch));
  }
  const bands = centres.map((x) => ({ x: x - bandWidth / 2, width: bandWidth }));

  let defs = `<clipPath id="${id}b"><path d="${outline}"/></clipPath>`;
  let content = '';
  const bandRects = colours.map((name, i) => {
    const metal = realistic && METAL[name];
    const fill = metal ? `url(#${id}${name})` : colour(name).hex;
    const edge = realistic ? `stroke="#000" stroke-opacity="0.24" stroke-width="${f(D * 0.012)}"` : `stroke="${ink}" stroke-width="${f(sw * 0.7)}"`;
    return `<rect x="${f(bands[i].x)}" y="${f(cy - r - D * 0.1)}" width="${f(bandWidth)}" height="${f(D * 1.2)}" fill="${fill}" ${edge}/>`;
  }).join('');

  if (realistic) {
    const top = cy - r;
    const bottom = cy + r;
    for (const name of ['gold', 'silver'] as Colour[]) {
      if (colours.includes(name)) defs += `<linearGradient id="${id}${name}" gradientUnits="userSpaceOnUse" x1="0" y1="${f(top)}" x2="0" y2="${f(bottom)}">${stops(METAL[name])}</linearGradient>`;
    }
    defs += `<linearGradient id="${id}d" gradientUnits="userSpaceOnUse" x1="0" y1="${f(top)}" x2="0" y2="${f(bottom)}">${stops([[0, '#000', 0.2], [0.1, '#000', 0.04], [0.3, '#000', 0], [0.55, '#000', 0.07], [0.82, '#000', 0.3], [0.94, '#000', 0.4], [1, '#000', 0.3]])}</linearGradient>`
      + `<linearGradient id="${id}l" gradientUnits="userSpaceOnUse" x1="0" y1="${f(top)}" x2="0" y2="${f(bottom)}">${stops([[0.06, '#fff', 0], [0.24, '#fff', 0.4], [0.36, '#fff', 0.14], [0.52, '#fff', 0]])}</linearGradient>`
      + `<linearGradient id="${id}e" gradientUnits="userSpaceOnUse" x1="${f(x0)}" y1="0" x2="${f(x1)}" y2="0">${stops([[0, '#000', 0.3], [0.05, '#000', 0.05], [0.12, '#000', 0], [0.9, '#000', 0], [0.96, '#000', 0.08], [1, '#000', 0.36]])}</linearGradient>`
      + `<linearGradient id="${id}h" gradientUnits="userSpaceOnUse" x1="${f(x0)}" y1="0" x2="${f(x1)}" y2="0">${stops([[0, '#fff', 0.2], [0.12, '#fff', 0.85], [0.5, '#fff', 0.6], [1, '#fff', 0.3]])}</linearGradient>`
      + `<linearGradient id="${id}w" gradientUnits="userSpaceOnUse" x1="0" y1="${f(cy - d / 2)}" x2="0" y2="${f(cy + d / 2)}">${stops([[0, '#878b90'], [0.25, '#f6f7f8'], [0.5, '#c6c9cd'], [0.85, '#8d9196'], [1, '#6f7378']])}</linearGradient>`
      + `<linearGradient id="${id}c" gradientUnits="userSpaceOnUse" x1="0" y1="${f(cy - r * 0.55)}" x2="0" y2="${f(cy + r * 0.55)}">${stops([[0, mix(coat, '#000000', 0.22)], [0.3, mix(coat, '#ffffff', 0.12)], [0.55, mix(coat, '#000000', 0.16)], [1, mix(coat, '#000000', 0.42)]])}</linearGradient>`
      + `<clipPath id="${id}t"><rect x="${f(x0 + e * 0.9)}" y="${f(top)}" width="${f(L - e * 1.8)}" height="${f(r * 0.8)}"/></clipPath>`
      + `<filter id="${id}f" x="-10%" y="-80%" width="120%" height="260%"><feGaussianBlur stdDeviation="${f(D * 0.085)}"/></filter>`
      + `<filter id="${id}k" x="-5%" y="-100%" width="110%" height="300%"><feGaussianBlur stdDeviation="${f(D * 0.014)}"/></filter>`;

    const leads = `<rect x="${f(padX)}" y="${f(cy - d / 2)}" width="${f(lead + e)}" height="${f(d)}" rx="${f(d * 0.2)}"/><rect x="${f(x1 - e)}" y="${f(cy - d / 2)}" width="${f(lead + e)}" height="${f(d)}" rx="${f(d * 0.2)}"/>`;
    // Where a lead enters the body, the lacquer creeps a little way along it.
    const creep = (x: number, dir: number) => `M${f(x + dir * e * 0.3)} ${f(cy - r * 0.55)}Q${f(x - dir * r * 0.1)} ${f(cy - d * 0.6)} ${f(x - dir * r * 0.4)} ${f(cy - d / 2)}V${f(cy + d / 2)}Q${f(x - dir * r * 0.1)} ${f(cy + d * 0.6)} ${f(x + dir * e * 0.3)} ${f(cy + r * 0.55)}Z`;
    const k = 0.56;
    content += `<g filter="url(#${id}f)" opacity="0.3" transform="translate(${f(D * 0.09)} ${f(D * 0.3)})"><path d="${outline}"/>${leads}</g>`
      + `<g fill="url(#${id}w)" stroke="#5d6166" stroke-opacity="0.55" stroke-width="${f(D * 0.01)}">${leads}</g>`
      + `<path d="${creep(x0, 1)}${creep(x1, -1)}" fill="url(#${id}c)"/>`
      + `<path d="${outline}" fill="${coat}"/>`
      + `<g clip-path="url(#${id}b)">${bandRects}`
      + `<rect x="${f(x0)}" y="${f(top)}" width="${f(L)}" height="${f(D)}" fill="url(#${id}d)"/>`
      + `<rect x="${f(x0)}" y="${f(top)}" width="${f(L)}" height="${f(D)}" fill="url(#${id}l)"/>`
      + `<rect x="${f(x0)}" y="${f(top)}" width="${f(L)}" height="${f(D)}" fill="url(#${id}e)"/>`
      + `<g clip-path="url(#${id}t)"><path d="${outline}" transform="translate(0 ${f(cy * (1 - k))}) scale(1 ${k})" fill="none" stroke="url(#${id}h)" stroke-width="${f(r * 0.13)}" filter="url(#${id}k)"/></g>`
      + '</g>'
      + `<path d="${outline}" fill="none" stroke="${mix(coat, '#000000', 0.5)}" stroke-opacity="0.6" stroke-width="${f(D * 0.014)}"/>`;
  } else {
    const leadRect = (x: number) => `<rect x="${f(x)}" y="${f(cy - d / 2)}" width="${f(lead + e)}" height="${f(d)}" rx="${f(d * 0.2)}"/>`;
    content += `<g fill="#c2c5c9" stroke="${ink}" stroke-width="${f(sw)}">${leadRect(padX)}${leadRect(x1 - e)}</g>`
      + `<path d="${outline}" fill="${coat}"/>`
      + `<g clip-path="url(#${id}b)">${bandRects}</g>`
      + `<path d="${outline}" fill="none" stroke="${ink}" stroke-width="${f(sw)}" stroke-linejoin="round"/>`;
  }

  if (o.interactive) {
    const reach = Math.max(bandWidth / 2, Math.min(pitch / 2, bandWidth));
    content += centres.map((x, i) => `<rect data-band="${i}" x="${f(x - reach)}" y="${f(cy - r)}" width="${f(2 * reach)}" height="${f(D)}" fill="#000" fill-opacity="0"/>`).join('');
  }

  return frame(o, width, cy + r + D * (realistic ? 0.42 : 0.16), padX, defs, content, bands);
}

// A chip resistor seen from above: the ceramic body, its dark overcoat with the marking, and a termination at each
// end. `marking` is null for a part that carries none.
export function drawChip(size: ChipSize, marking: string | null, o: DrawOptions): Drawing {
  const id = o.id ?? 'rz';
  const realistic = o.style !== 'flat';
  const ink = o.ink ?? INK;
  const L = size.length;
  const H = size.width;
  const t = size.termination;
  const pad = Math.max(L * 0.14, H * 0.22);
  const width = L + 2 * pad;
  const x0 = pad;
  const y0 = pad * 0.85;
  const sw = H * 0.03;
  // A margin of bare ceramic along the long edges; the overcoat reaches a little under the terminations.
  const margin = H * 0.055;
  const coatX = x0 + t * 0.8;
  const coatW = L - 1.6 * t;

  let text = '';
  if (marking) {
    const height = Math.min(H * 0.4, ((coatW - t * 0.4) * 0.8) / textWidth(marking, 1));
    text = strokeText(marking, { x: x0 + L / 2, y: y0 + H / 2 + height / 2, height, colour: realistic ? '#ecece6' : '#f6f6f1', anchor: 'middle', weight: 1.02, opacity: realistic ? 0.94 : 1 });
  }

  let defs = '';
  let content = '';
  if (realistic) {
    const out = H * 0.016;
    const tin = stops([[0, '#eceded'], [0.12, '#ffffff'], [0.45, '#d6d9dc'], [0.82, '#b4b8bc'], [1, '#989ca1']]);
    defs += `<linearGradient id="${id}t" x1="0" y1="0" x2="0" y2="1">${tin}</linearGradient>`
      + `<linearGradient id="${id}tl" x1="0" y1="0" x2="1" y2="0">${stops([[0, '#000', 0.26], [0.16, '#fff', 0.3], [0.42, '#fff', 0], [0.86, '#000', 0], [1, '#000', 0.2]])}</linearGradient>`
      + `<linearGradient id="${id}tr" x1="1" y1="0" x2="0" y2="0">${stops([[0, '#000', 0.34], [0.16, '#000', 0.06], [0.42, '#000', 0], [0.86, '#000', 0], [1, '#000', 0.2]])}</linearGradient>`
      + `<linearGradient id="${id}o" x1="0" y1="0" x2="1" y2="1">${stops([[0, '#41464e'], [0.45, '#2a2d33'], [1, '#1c1e22']])}</linearGradient>`
      + `<linearGradient id="${id}s" x1="0" y1="0" x2="0" y2="1">${stops([[0, '#fff', 0.1], [0.3, '#fff', 0.02], [1, '#000', 0.12]])}</linearGradient>`
      + `<filter id="${id}f" x="-20%" y="-30%" width="140%" height="170%"><feGaussianBlur stdDeviation="${f(H * 0.06)}"/></filter>`;
    const end = (x: number, side: 'l' | 'r') => {
      const box = `x="${f(side === 'l' ? x - out : x)}" y="${f(y0 - out)}" width="${f(t + out)}" height="${f(H + 2 * out)}" rx="${f(Math.min(t, H) * 0.1)}"`;
      return `<rect ${box} fill="url(#${id}t)"/><rect ${box} fill="url(#${id}t${side})"/><rect ${box} fill="none" stroke="#6f7378" stroke-opacity="0.75" stroke-width="${f(H * 0.009)}"/>`;
    };
    content += `<rect x="${f(x0 + H * 0.04)}" y="${f(y0 + H * 0.1)}" width="${f(L)}" height="${f(H)}" rx="${f(H * 0.04)}" filter="url(#${id}f)" opacity="0.38"/>`
      + `<rect x="${f(x0)}" y="${f(y0)}" width="${f(L)}" height="${f(H)}" rx="${f(H * 0.03)}" fill="#e9e6de" stroke="#b3afa4" stroke-width="${f(H * 0.008)}"/>`
      + `<rect x="${f(coatX)}" y="${f(y0 + margin)}" width="${f(coatW)}" height="${f(H - 2 * margin)}" rx="${f(H * 0.03)}" fill="url(#${id}o)"/>`
      + `<rect x="${f(coatX)}" y="${f(y0 + margin)}" width="${f(coatW)}" height="${f(H - 2 * margin)}" rx="${f(H * 0.03)}" fill="url(#${id}s)" stroke="#000" stroke-opacity="0.4" stroke-width="${f(H * 0.008)}"/>`
      + text + end(x0, 'l') + end(x0 + L - t, 'r');
  } else {
    content += `<rect x="${f(x0)}" y="${f(y0)}" width="${f(L)}" height="${f(H)}" rx="${f(H * 0.03)}" fill="#efece4"/>`
      + `<rect x="${f(coatX)}" y="${f(y0 + margin)}" width="${f(coatW)}" height="${f(H - 2 * margin)}" fill="#2b2d31"/>`
      + text
      + `<g fill="#c5c8cc" stroke="${ink}" stroke-width="${f(sw)}" stroke-linejoin="round"><rect x="${f(x0)}" y="${f(y0)}" width="${f(t)}" height="${f(H)}" rx="${f(H * 0.03)}"/><rect x="${f(x0 + L - t)}" y="${f(y0)}" width="${f(t)}" height="${f(H)}" rx="${f(H * 0.03)}"/></g>`
      + `<rect x="${f(x0)}" y="${f(y0)}" width="${f(L)}" height="${f(H)}" rx="${f(H * 0.03)}" fill="none" stroke="${ink}" stroke-width="${f(sw)}" stroke-linejoin="round"/>`;
  }

  return frame(o, width, y0 + H + H * (realistic ? 0.26 : 0.12), x0, defs, content, []);
}
