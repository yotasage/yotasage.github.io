// The figure as plain TikZ (step M8.1a, plan.md D16): `{ picture, document, files }`. The picture needs only
// `\usepackage{tikz}` (TikZ loads graphicx, which places the field maps' PNG files); the document is a `standalone`
// page exactly the figure's size. Coordinates are the model's mm (`x=1mm, y=1mm`, y up), or for a `\linewidth`
// figure `x=\linewidth/W` with W the width it was laid out for (text keeps its pt and lines their mm). Colours are
// `\definecolor{emRRGGBB}{HTML}{…}`; text is `\node`s in the document's font at the model's pt, 0.7 em high with no
// depth, so a node's centre is 0.35 em above the baseline as in the SVG. Each statement is on its own line ending in
// `%p<i>` (its primitive; a hatch's block `%h<i>`), which the harness reads back. Polylines are split every
// POLY_CHUNK points and segment lists every POLY_CHUNK segments (pgf builds a path in a macro, quadratic in length).

import { PT_MM, asciiText, hatchLines, num, primBox } from './model';
import type { Figure, Prim } from './model';
import { drawOrder } from './svg';
import { paintOf } from './style';
import type { Paint } from './style';

export const POLY_CHUNK = 200;
export const SITE = 'https://yotasage.github.io/em-sim/main';

const UNI: Record<string, string> = {
  'µ': '\\ensuremath{\\mu}', 'μ': '\\ensuremath{\\mu}', 'Ω': '\\ensuremath{\\Omega}', 'ε': '\\ensuremath{\\varepsilon}',
  'φ': '\\ensuremath{\\varphi}', 'Δ': '\\ensuremath{\\Delta}', 'λ': '\\ensuremath{\\lambda}', 'ρ': '\\ensuremath{\\rho}',
  'θ': '\\ensuremath{\\theta}', 'π': '\\ensuremath{\\pi}', 'σ': '\\ensuremath{\\sigma}', 'τ': '\\ensuremath{\\tau}',
  '−': '\\ensuremath{-}', '·': '\\ensuremath{\\cdot}', '×': '\\ensuremath{\\times}', '²': '\\ensuremath{^2}',
  '³': '\\ensuremath{^3}', '°': '\\ensuremath{^\\circ}', '±': '\\ensuremath{\\pm}', '≤': '\\ensuremath{\\leq}',
  '≥': '\\ensuremath{\\geq}', '≈': '\\ensuremath{\\approx}', '∞': '\\ensuremath{\\infty}', '√': '\\ensuremath{\\surd}',
  '’': "'", '‘': '`', '–': '--', '—': '---', 'Ø': '\\O{}', 'ø': '\\o{}', '|': '\\ensuremath{|}', '<': '\\ensuremath{<}',
  '>': '\\ensuremath{>}', '\\': '\\textbackslash{}', '{': '\\{', '}': '\\}', '$': '\\$', '&': '\\&', '%': '\\%',
  '#': '\\#', '_': '\\_', '^': '\\textasciicircum{}', '~': '\\textasciitilde{}', '"': "''",
};

/** A label as TeX for pdfLaTeX, XeLaTeX and LuaLaTeX (ASCII only; unknown characters become "?"). */
export function texText(s: string): string {
  let out = '';
  for (const ch of s) out += UNI[ch] ?? (ch >= ' ' && ch <= '~' ? ch : '?');
  return out;
}

const colName = (c: string) => `em${c.slice(1).toUpperCase()}`;

function opts(p: Paint, closed: boolean, cols: Set<string>): string {
  const o: string[] = [];
  if (closed && p.fill) { o.push(`fill=${colName(p.fill)}`); cols.add(p.fill); }
  if (p.stroke && p.width > 0) {
    o.push(`draw=${colName(p.stroke)}`, `line width=${num(p.width)}mm`);
    cols.add(p.stroke);
    if (p.dash) o.push(`dash pattern=${p.dash.map((d, k) => `${k % 2 ? 'off' : 'on'} ${num(d)}mm`).join(' ')}`);
  }
  return o.join(', ');
}

const pt = (x: number, y: number) => `(${num(x)},${num(y)})`;

/** The TikZ path of a shape (for fills, outlines and hatch clips); polylines as one piece. */
function shape(p: Prim): string {
  if (p.t === 'rect') return `${pt(p.x, p.y)} rectangle ${pt(p.x + p.w, p.y + p.h)}`;
  if (p.t === 'circle') return `${pt(p.cx, p.cy)} circle[radius=${num(p.r)}]`;
  if (p.t === 'poly') {
    const parts: string[] = [];
    for (let i = 0; i < p.pts.length; i += 2) parts.push(pt(p.pts[i], p.pts[i + 1]));
    return parts.join(' -- ') + (p.closed ? ' -- cycle' : '');
  }
  return '';
}

export interface TikzOutput { picture: string; document: string; files: { name: string; bytes: Uint8Array }[] }

export function figureTikz(fig: Figure, o: { text?: boolean } = {}): TikzOutput {
  const W = fig.width;
  const cols = new Set<string>();
  const lines: string[] = [];
  const files: TikzOutput['files'] = [];
  const dim = (mm: number) => (fig.linewidth ? `${(mm / W).toFixed(8)}\\linewidth` : `${num(mm)}mm`);
  let clip: number | undefined;
  const setClip = (c: number | undefined) => {
    if (c === clip) return;
    if (clip !== undefined) lines.push('  \\end{scope}');
    if (c !== undefined) { const r = fig.clips[c]; lines.push(`  \\begin{scope}\\clip ${pt(r.x0, r.y0)} rectangle ${pt(r.x1, r.y1)};`); }
    clip = c;
  };
  for (const i of drawOrder(fig)) {
    const p = fig.prims[i];
    if (p.t === 'text' && o.text === false) continue;
    const paint = paintOf(fig.colour, p.role, p.index ?? 0);
    setClip(p.clip);
    const tag = `%p${i}`;
    switch (p.t) {
      case 'rect': case 'circle':
        lines.push(`  \\path[${opts(paint, true, cols)}] ${shape(p)};${tag}`);
        break;
      case 'poly': {
        const op = opts(paint, p.closed, cols);
        if (p.closed || p.pts.length <= 2 * POLY_CHUNK) { lines.push(`  \\path[${op}] ${shape(p)};${tag}`); break; }
        for (let a = 0; a + 2 < p.pts.length; a += 2 * (POLY_CHUNK - 1)) {
          const part: string[] = [];
          for (let k = a; k < Math.min(p.pts.length, a + 2 * POLY_CHUNK); k += 2) part.push(pt(p.pts[k], p.pts[k + 1]));
          lines.push(`  \\path[${op}] ${part.join(' -- ')};${tag}`);
        }
        break;
      }
      case 'segs': {
        const op = opts(paint, false, cols);
        for (let a = 0; a < p.s.length; a += 4 * POLY_CHUNK) {
          const part: string[] = [];
          for (let k = a; k + 3 < Math.min(p.s.length, a + 4 * POLY_CHUNK); k += 4) part.push(`${pt(p.s[k], p.s[k + 1])} -- ${pt(p.s[k + 2], p.s[k + 3])}`);
          lines.push(`  \\path[${op}] ${part.join(' ')};${tag}`);
        }
        break;
      }
      case 'text': {
        cols.add(paint.fill);
        const anchor = p.anchor === 'start' ? 'west' : p.anchor === 'end' ? 'east' : 'center';
        const lead = Math.round(p.pt * 12) / 10;
        lines.push(`  \\node[anchor=${anchor}, inner sep=0pt, outer sep=0pt, text=${colName(paint.fill)}, font=\\fontsize{${num(p.pt)}}{${num(lead)}}\\selectfont, text height=0.7em, text depth=0pt${p.rotate ? `, rotate=${num(p.rotate)}` : ''}] at ${pt(p.x, p.y)} {${texText(p.text)}};${tag}`);
        break;
      }
      case 'image':
        files.push({ name: p.name, bytes: p.png });
        lines.push(`  \\node[anchor=south west, inner sep=0pt, outer sep=0pt] at ${pt(p.x, p.y)} {\\includegraphics[width=${dim(p.w)}, height=${dim(p.h)}, interpolate=true]{${p.name}}};${tag}`);
        break;
    }
    if (paint.hatch && (p.t === 'rect' || p.t === 'circle' || (p.t === 'poly' && p.closed))) {
      const h = paint.hatch;
      const hl = hatchLines(primBox(p), h.angle, h.gap);
      if (hl.length) {
        cols.add(h.colour);
        const segs: string[] = [];
        for (let k = 0; k < hl.length; k += 4) segs.push(`${pt(hl[k], hl[k + 1])} -- ${pt(hl[k + 2], hl[k + 3])}`);
        lines.push(`  \\begin{scope}\\clip ${shape(p)}; \\path[draw=${colName(h.colour)}, line width=${num(h.width)}mm] ${segs.join(' ')}; \\end{scope}%h${i}`);
      }
    }
  }
  setClip(undefined);
  const b = fig.box;
  const unit = fig.linewidth ? `x=\\linewidth/${num(W)}, y=\\linewidth/${num(W)}` : 'x=1mm, y=1mm';
  const head = [
    `% ${asciiText(fig.note)}: ${num(b.x1 - b.x0)} x ${num(b.y1 - b.y0)} mm${fig.linewidth ? ' laid out for a \\linewidth of that width' : ''}, ${fig.colour === 'colour' ? 'colour' : fig.colour === 'grey' ? 'greyscale' : 'black and white'}, from ${SITE}`,
    `% Needs only \\usepackage{tikz}. Coordinates are millimetres on paper, y up; text is set in the document's font`,
    `% at the size in pt it was laid out for (${num(fig.fontPt)} pt labels).${fig.linewidth ? ' Start the paragraph with \\noindent.' : ''}`,
  ];
  if (files.length) head.push(`% The field map is the image file${files.length > 1 ? 's' : ''} ${files.map((f) => f.name).join(', ')}: keep ${files.length > 1 ? 'them' : 'it'} beside the .tex file.`);
  const defs = [...cols].sort().map((c) => `\\definecolor{${colName(c)}}{HTML}{${c.slice(1).toUpperCase()}}%`);
  const picture = `${head.join('\n')}\n${defs.join('\n')}\n\\begin{tikzpicture}[${unit}, line join=round]\n`
    + `  \\useasboundingbox ${pt(b.x0, b.y0)} rectangle ${pt(b.x1, b.y1)};\n${lines.join('\n')}\n\\end{tikzpicture}%\n`;
  const body = fig.linewidth ? `\\begin{minipage}{${num(W)}mm}\\noindent\n${picture}\\end{minipage}\n` : picture;
  const document = `\\RequirePackage{fix-cm}\n\\documentclass[border=0pt]{standalone}\n\\usepackage{tikz}\n\\begin{document}\n${body}\\end{document}\n`;
  return { picture, document, files };
}

export { PT_MM };
