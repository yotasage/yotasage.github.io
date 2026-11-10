// The flat drawings as TikZ, for LaTeX documents: a `tikzpicture` with its colour definitions, to paste into a
// document, and the same inside a `standalone` document that compiles as it is. Only TikZ itself is needed.
// Coordinates are millimetres on the part, as in draw.ts (whose geometry is used), with y pointing down; the picture
// is enlarged by its `x=` and `y=` options. Text is ordinary TikZ nodes, set in the document's fonts.

import { Colour, colour } from './colours';
import { axialGeometry, bodyCoat, chipGeometry, markingHeight, scaleLength } from './draw';
import { AxialBody, ChipSize } from './packages';

export interface TikzOptions {
  // Lines under the drawing: the value first. With `scale` false and no caption, the picture is the part alone.
  caption?: string[];
  scale?: boolean;
  // Lines, outlines and text.
  ink?: string;
  // A colour behind the drawing; none leaves it out.
  background?: string | null;
  // What the picture shows, for the comment at the top: "4k7 5 %, axial 1/4 W".
  title?: string;
  // What each band means, for the comments: "4", "x 100", "5 %".
  bandNotes?: string[];
}

export interface Tikz {
  // The colour definitions and the tikzpicture, to paste into a document that loads TikZ.
  picture: string;
  // A complete document of the class `standalone`.
  document: string;
  // The size of the part's drawing on paper, in millimetres (without caption and scale bar).
  width: number;
  // How many times the part is enlarged.
  enlarged: number;
}

// The widest the part is drawn on paper, in millimetres, and the enlargements to choose from.
const PAPER_WIDTH = 80;
const ENLARGEMENTS = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30, 40, 50, 60, 80, 100];

// The height of capitals as a share of the font size, for the sans-serif bold of Computer Modern and its like.
const CAP_HEIGHT = 0.69;
const PT_PER_MM = 72.27 / 25.4;

const n = (value: number, digits = 3) => String(Number(value.toFixed(digits)));
const at = (x: number, y: number) => `(${n(x)}, ${n(y)})`;

// Text for LaTeX: its special characters escaped, and the signs that not every font and input encoding has
// written as maths, so the file compiles with pdfLaTeX, XeLaTeX and LuaLaTeX alike.
export function texText(text: string): string {
  return text
    .replace(/[\\{}]/g, (ch) => (ch === '\\' ? '\\textbackslash ' : `\\${ch}`))
    .replace(/[#$%&_]/g, '\\$&')
    .replace(/\^/g, '\\textasciicircum ')
    .replace(/~/g, '\\textasciitilde ')
    .replace(/(\d)\s+\\%/g, '$1\\,\\%')
    .replace(/(\d)\s+(?=[pnµμmkMGT]?[ΩΩ]|mm\b|W\b)/g, '$1\\,')
    .replace(/[ΩΩ]/g, '\\ensuremath{\\Omega}')
    .replace(/[µμ]/g, '\\ensuremath{\\mu}')
    .replace(/±/g, '\\ensuremath{\\pm}')
    .replace(/×/g, '\\ensuremath{\\times}')
    .replace(/·/g, '\\ensuremath{\\cdot}')
    .replace(/[−–]/g, '\\ensuremath{-}')
    .replace(/⌀/g, '\\ensuremath{\\varnothing}');
}

// Comments are kept to ASCII, so the file reads the same in every editor.
const comment = (text: string) => text.replace(/[ΩΩ]/g, 'Ohm').replace(/[µμ]/g, 'u').replace(/±/g, '+-').replace(/×/g, 'x').replace(/[−–]/g, '-')
  .replace(/·/g, ',').replace(/[^\x20-\x7e]/g, '?');

const define = (name: string, hex: string) => `\\definecolor{${name}}{HTML}{${hex.replace('#', '').toUpperCase()}}`;

function isDark(hex: string): boolean {
  const [red, green, blue] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return 0.299 * red + 0.587 * green + 0.114 * blue < 110;
}

interface Part {
  // What the part is, for the first comment.
  what: string;
  colours: [string, string][];
  // The lines that draw the part.
  body: string[];
  width: number;
  left: number;
  bottom: number;
  // Outline width on the part, in millimetres.
  sw: number;
}

// Everything around the part: the colours, the picture with its options, the scale bar, the caption, the background.
function assemble(part: Part, o: TikzOptions): Tikz {
  const k = ENLARGEMENTS.filter((v) => v * part.width <= PAPER_WIDTH).pop() ?? 1;
  // A length on paper, in millimetres, as a length in the picture.
  const paper = (mm: number) => mm / k;
  const ink = o.ink ?? (o.background && isDark(o.background) ? '#e9e7e0' : '#2b2a27');
  const colours: [string, string][] = [['resistorink', ink], ...part.colours];
  if (o.background) colours.push(['resistorbackground', o.background]);

  const lines: string[] = [];
  lines.push(`% ${comment(o.title ?? part.what)}`);
  lines.push('% The flat drawing of the resistor lookup at https://yotasage.github.io/resistor/main');
  lines.push('% Needs only \\usepackage{tikz}. Colours:');
  for (const [name, hex] of colours) lines.push(define(name, hex));
  lines.push(`% Coordinates are millimetres on the part, with y pointing down. The part is drawn ${n(k)} times enlarged:`);
  lines.push(`% change x and y together to resize it (x=1mm, y=-1mm is the true size).`);
  lines.push('\\begin{tikzpicture}[');
  lines.push(`  x=${n(k)}mm, y=-${n(k)}mm,`);
  lines.push(`  outline/.style={draw=resistorink, line width=${n(Math.min(0.7, Math.max(0.2, part.sw * k)), 2)}mm, line join=round},`);
  lines.push(']');
  lines.push(...part.body.map((line) => (line ? `  ${line}` : '')));

  let y = part.bottom;
  if (o.scale !== false) {
    const length = scaleLength(part.width);
    const barY = part.bottom + paper(4);
    const tick = paper(1);
    lines.push('');
    lines.push(`  % Scale bar: ${n(length)} mm on the part`);
    lines.push(`  \\draw[resistorink, line width=0.3mm, line cap=round] ${at(part.left, barY - tick)} -- ${at(part.left, barY + tick)}`);
    lines.push(`    ${at(part.left, barY)} -- ${at(part.left + length, barY)}  ${at(part.left + length, barY - tick)} -- ${at(part.left + length, barY + tick)};`);
    lines.push(`  \\node[anchor=west, text=resistorink, font=\\footnotesize] at ${at(part.left + length + paper(1), barY)} {${texText(`${n(length)} mm`)}};`);
    y = barY + paper(2.5);
  }
  if (o.caption?.length) {
    const [first, ...rest] = o.caption;
    lines.push('');
    lines.push('  % Caption');
    lines.push(`  \\node[anchor=north, align=center, text=resistorink] at ${at(part.width / 2, y + paper(1))} {%`);
    lines.push(`    {\\bfseries\\boldmath ${texText(first)}}${rest.length ? '\\\\' : ''}`);
    rest.forEach((line, i) => lines.push(`    {\\small ${texText(line)}}${i < rest.length - 1 ? '\\\\' : ''}`));
    lines.push('  };');
  }
  if (o.background) {
    lines.push('');
    lines.push('  % Background: behind everything, 2 mm wider than the picture on every side');
    lines.push('  \\begin{pgfonlayer}{background}');
    lines.push('    \\fill[resistorbackground] ([xshift=-2mm, yshift=-2mm]current bounding box.south west) rectangle ([xshift=2mm, yshift=2mm]current bounding box.north east);');
    lines.push('  \\end{pgfonlayer}');
  }
  lines.push('\\end{tikzpicture}');
  if (o.background) {
    const start = lines.indexOf('\\begin{tikzpicture}[');
    lines.splice(start, 0, '\\pgfdeclarelayer{background}\\pgfsetlayers{background,main}');
  }

  const picture = `${lines.join('\n')}\n`;
  const document = [
    '% Compiles as it is with pdflatex, xelatex or lualatex.',
    '\\RequirePackage{fix-cm} % lets the standard fonts take any size; part of LaTeX itself',
    `\\documentclass[tikz, border=${o.background ? 0 : 2}mm]{standalone}`,
    '\\begin{document}',
    picture.trimEnd(),
    '\\end{document}',
    '',
  ].join('\n');
  return { picture, document, width: part.width * k, enlarged: k };
}

const ORDINAL = ['1st', '2nd', '3rd', '4th', '5th', '6th'];

// An axial resistor from the side, as drawAxial draws it in the flat style.
export function tikzAxial(colours: Colour[], body: AxialBody, coatId: string, o: TikzOptions = {}): Tikz {
  const g = axialGeometry(colours.length, body);
  const { x0, x1, cy, r, e, padX, lead, d } = g;
  const D = body.diameter;
  const used = [...new Set(colours)];
  const lines: string[] = [];

  lines.push('% Leads: they run a little way into the body');
  lines.push(`\\filldraw[fill=resistorlead, outline] ${at(padX, cy - d / 2)} rectangle ${at(x0 + e, cy + d / 2)};`);
  lines.push(`\\filldraw[fill=resistorlead, outline] ${at(x1 - e, cy - d / 2)} rectangle ${at(x1 + lead, cy + d / 2)};`);
  lines.push('');
  lines.push(`% Body, ${n(body.length)} x ${n(D)} mm: thicker over the two end caps, with rounded ends`);
  lines.push('\\def\\resistorbody{%');
  lines.push(`  ${at(x0, cy)}`);
  g.outline.forEach((seg) => {
    lines.push(seg.length === 2
      ? `  -- ${at(seg[0], seg[1])}`
      : `  .. controls ${at(seg[0], seg[1])} and ${at(seg[2], seg[3])} .. ${at(seg[4], seg[5])}`);
  });
  lines.push('  -- cycle}');
  lines.push('\\fill[resistorbody] \\resistorbody;');
  lines.push('');
  lines.push(colours.length ? '% Bands in reading order, cut off at the edge of the body' : '% No bands');
  if (colours.length) {
    lines.push('\\begin{scope}');
    lines.push('  \\clip \\resistorbody;');
    const top = cy - r - D * 0.1;
    colours.forEach((name, i) => {
      const note = o.bandNotes?.[i] ? `, ${comment(o.bandNotes[i])}` : '';
      lines.push(`  \\filldraw[fill=band${name}, outline] ${at(g.bands[i].x, top)} rectangle ${at(g.bands[i].x + g.bandWidth, top + D * 1.2)}; % ${ORDINAL[i]} band: ${name}${note}`);
    });
    lines.push('\\end{scope}');
  }
  lines.push('');
  lines.push('% Outline of the body, over the bands');
  lines.push('\\path[outline] \\resistorbody;');

  return assemble({
    what: `Axial resistor, ${body.rating}${colours.length ? `: ${colours.join(', ')}` : ''}`,
    colours: [['resistorbody', bodyCoat(coatId).hex], ['resistorlead', '#c2c5c9'], ...used.map((name): [string, string] => [`band${name}`, colour(name).hex])],
    body: lines,
    width: g.width,
    left: padX,
    bottom: cy + r,
    sw: g.sw,
  }, o);
}

// A chip resistor from above, as drawChip draws it in the flat style. `marking` is null for a part without one.
export function tikzChip(size: ChipSize, marking: string | null, o: TikzOptions = {}): Tikz {
  const g = chipGeometry(size);
  const { x0, y0, margin, coatX, coatW } = g;
  const L = size.length;
  const H = size.width;
  const t = size.termination;
  const k = ENLARGEMENTS.filter((v) => v * g.width <= PAPER_WIDTH).pop() ?? 1;
  const lines: string[] = [];

  lines.push(`% Ceramic body, ${n(L)} x ${n(H)} mm`);
  lines.push(`\\fill[chipceramic] ${at(x0, y0)} rectangle ${at(x0 + L, y0 + H)};`);
  lines.push('% Dark overcoat over the resistive film');
  lines.push(`\\fill[chipcoat] ${at(coatX, y0 + margin)} rectangle ${at(coatX + coatW, y0 + H - margin)};`);
  if (marking) {
    // The size of the font that gives capitals of the height the marking has in the other formats.
    const points = Math.max(1, (markingHeight(size, marking) * k * PT_PER_MM) / CAP_HEIGHT);
    lines.push('% Marking: an ordinary node, in the sans-serif bold of the document');
    lines.push(`\\node[text=chipmarking, inner sep=0pt, font=\\fontsize{${n(points, 1)}pt}{${n(points, 1)}pt}\\selectfont\\sffamily\\bfseries] at ${at(x0 + L / 2, y0 + H / 2)} {${texText(marking)}};`);
  } else {
    lines.push('% No marking: parts of this size carry none');
  }
  lines.push(`% Terminations, ${n(t)} mm long`);
  lines.push(`\\filldraw[fill=chipterminal, outline] ${at(x0, y0)} rectangle ${at(x0 + t, y0 + H)};`);
  lines.push(`\\filldraw[fill=chipterminal, outline] ${at(x0 + L - t, y0)} rectangle ${at(x0 + L, y0 + H)};`);
  lines.push('% Outline of the part');
  lines.push(`\\path[outline] ${at(x0, y0)} rectangle ${at(x0 + L, y0 + H)};`);

  const colours: [string, string][] = [['chipceramic', '#efece4'], ['chipcoat', '#2b2d31'], ['chipterminal', '#c5c8cc']];
  if (marking) colours.push(['chipmarking', '#f6f6f1']);
  return assemble({
    what: `Chip resistor ${size.imperial} (${size.metric} metric)${marking ? `, marked ${marking}` : ', no marking'}`,
    colours,
    body: lines,
    width: g.width,
    left: x0,
    bottom: y0 + H,
    sw: g.sw,
  }, o);
}
