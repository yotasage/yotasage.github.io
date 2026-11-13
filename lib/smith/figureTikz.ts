// The figure model (figure.ts) as TikZ for LaTeX reports (step M8.1b, plan.md D18), after lib/resistor/tikz.ts: a
// `tikzpicture` with its colour definitions to paste into a document that loads TikZ, and the same in a `standalone`
// document that compiles as it is. Plain TikZ only (`\usepackage{tikz}`, which loads xcolor): no library.
//
// Coordinates are the model's as they are: millimetres on paper, origin at Γ = 0, Y up (`x=1mm, y=1mm`). A width of
// `\linewidth` sets the unit to `\linewidth / width` (the width the density and text were chosen for), so the picture
// fills the line; text stays at its pt size and lines at their width in mm. Numbers are rounded to 1e-6 mm (`num`),
// an arc's start and radius to 1e-7 mm and its angles to the decimals that keep r × error ≤ 2.5e-8 mm, so the end
// TikZ computes from them stays within 3e-7 mm of the model's.
//
// Circles are `circle[radius=…]`, arcs `(x0,y0) arc[start angle=…, delta angle=…, radius=…]` from the engine's start
// point. An arc or circle of radius over ARC_MAX_MM (lines near x = 0 in a zoomed view: up to 10⁴ × the width) is
// written as its part inside the visible disc (the clip circle, or the box's circumcircle) in cubic Béziers with the
// exact ends and control points (error under 1e-7 mm): pgf would compute such an arc's end from sin and cos to five
// digits of its radius, and its centre overflows TeX's 16384 pt. The trace and other polylines are coordinate lists
// split every POLY_CHUNK points, and one `\draw` holds at most DRAW_WEIGHT segments: pgf appends each segment to a
// macro, so a long path costs time quadratic in its length. Text is nodes in the document's font at `\fontsize{pt}`,
// with `text height` 0.7 em and no depth, so the anchor sits 0.35 em above the baseline as in figureSvg.ts. Marks
// are paths with the shapes and sizes of figureSvg.ts.

import type { ArcPrim, Detail, Figure, MarkPrim, Prim, TextPrim } from './figure';
import { DETAIL_NAMES, DETAIL_PRESETS } from './figure';
import { FLAT_MM, num } from './figureSvg';
import { inkOf, strokeOf } from './figureStyle';
import type { Stroke } from './figureStyle';

/** Arcs and circles of a larger radius (mm) are written as Béziers of their visible part. */
export const ARC_MAX_MM = 500;
/** Points of a polyline per `\draw`. */
export const POLY_CHUNK = 200;
/** Segments per `\draw` at most (an arc counts one per quarter turn, a circle four). */
export const DRAW_WEIGHT = 200;
/** A text node's height (em; no depth): the anchor is half of it above the baseline. */
export const TEXT_HEIGHT_EM = 0.7;
/** The visible disc is the clip circle (or the box's circumcircle) widened by this (mm). */
export const VISIBLE_PAD = 0.5;
/** The largest radial error (mm) of a Bézier piece of a large arc. */
export const BEZIER_ERR = 1e-7;
export const SITE = 'https://yotasage.github.io/smith-chart/main';

export interface TikzOptions {
  /** Text nodes. Default true (false for the pixel comparison). */
  text?: boolean;
}

export interface FigureTikz {
  /** The colour definitions and the tikzpicture, to paste into a document that loads TikZ. */
  picture: string;
  /** A complete `standalone` document. */
  document: string;
}

const TAU = 2 * Math.PI;
const DEG = 180 / Math.PI;

/** A number rounded to d decimals, without trailing zeros or "-0". */
function fixed(v: number, d: number): string {
  const s = v.toFixed(d);
  const t = d === 0 ? s : s.replace(/0+$/, '').replace(/\.$/, '');
  return t === '-0' ? '0' : t;
}

/** An angle (radians) in degrees, with the decimals that keep r·error ≤ 2.5e-8 mm. */
const deg = (a: number, r: number): string =>
  fixed(a * DEG, Math.min(14, Math.max(0, Math.ceil(Math.log10(Math.max(r, 1e-6) / 2.865e-6)))));

const pt = (x: number, y: number): string => `(${num(x)},${num(y)})`;
/**
 * An arc's start and radius to 1e-7 mm: TikZ finds the arc's centre and end from them, so their rounding adds up
 * (start, radius and angles to 1e-6 mm would leave the end up to 1.7e-6 mm off; to 1e-7 it stays under 3e-7).
 */
const n7 = (v: number): string => fixed(v, 7);
const pt7 = (x: number, y: number): string => `(${n7(x)},${n7(y)})`;

// ---------------------------------------------------------------------------------------------------------------
// Text

const GREEK: Record<string, string> = {
  '\u03bb': '\\lambda', '\u03a9': '\\Omega', '\u2126': '\\Omega', '\u00b5': '\\mu', '\u03bc': '\\mu', '\u0393': '\\Gamma',
  '\u03b8': '\\theta', '\u03c6': '\\varphi', '\u03c0': '\\pi', '\u03c9': '\\omega', '\u221e': '\\infty', '\u00b1': '\\pm',
  '\u00d7': '\\times', '\u00b7': '\\cdot', '\u2212': '-', '\u2013': '-', '\u00b0': '^\\circ', '\u2190': '\\leftarrow',
  '\u2192': '\\rightarrow', '\u2264': '\\le', '\u2265': '\\ge', '\u2248': '\\approx', '\u221a': '\\surd', '\u2220': '\\angle',
  '\u2300': '\\varnothing',
};

/**
 * Text for LaTeX (as lib/resistor/tikz.ts texText): its special characters escaped, the signs that not every font and
 * input encoding has written as maths, so the file compiles with pdfLaTeX, XeLaTeX and LuaLaTeX alike; a thin space
 * between a number and its unit. Any other character outside ASCII becomes "?".
 */
export function texLabel(text: string): string {
  return text
    .replace(/[\\{}]/g, (ch) => (ch === '\\' ? '\\textbackslash ' : `\\${ch}`))
    .replace(/[#$%&_]/g, '\\$&')
    .replace(/\^/g, '\\textasciicircum ')
    .replace(/~/g, '\\textasciitilde ')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, "''")
    .replace(/(\d)\s+(?=[pn\u00b5\u03bcmkMGT]?[\u03a9\u2126HF\u03bb])/g, '$1\\,')
    .replace(/[^\x20-\x7e]/g, (ch) => (GREEK[ch] ? `\\ensuremath{${GREEK[ch]}}` : '?'));
}

/** Comments are kept to ASCII. */
const comment = (text: string): string => text.replace(/Γ/g, 'Gamma').replace(/[^\x20-\x7e]/g, '?');

// ---------------------------------------------------------------------------------------------------------------
// Large arcs

/** Max angle (rad) of one Bézier piece of a circle of radius r with radial error ≤ BEZIER_ERR (≈ 1.8e-5 r θ⁶). */
const pieceAngle = (r: number): number => Math.min(Math.PI / 2, Math.pow(BEZIER_ERR / (1.8e-5 * r), 1 / 6));

/**
 * The part of a circle (centre cx, cy, radius r) inside the disc of radius rho about the origin, as an interval of
 * angles [m − g, m + g] about the circle's centre; g < 0 none, g ≥ π the whole circle. Written without the
 * cancellation of rho² − d² − r² for a huge circle passing near the disc.
 */
function visibleArc(cx: number, cy: number, r: number, rho: number): { m: number; g: number } {
  const d = Math.hypot(cx, cy);
  if (d + r <= rho) return { m: 0, g: Math.PI };
  if (d === 0) return { m: 0, g: -1 };
  const dr = d - r, e = (rho * rho - dr * dr) / (2 * r * d);      // 1 + cos of the half-width's supplement
  if (!(e > 0)) return { m: 0, g: -1 };
  if (e >= 2) return { m: 0, g: Math.PI };
  return { m: Math.atan2(-cy, -cx), g: 2 * Math.asin(Math.sqrt(e / 2)) };
}

/** A subpath of Béziers along the circle from angle a0 to a1 (either sense), from (sx, sy) to (ex, ey). */
function bezierPath(cx: number, cy: number, r: number, a0: number, a1: number, sx: number, sy: number, ex: number, ey: number): [string, number] {
  const span = a1 - a0, half = Math.min(Math.abs(span), Math.PI) / 2;
  if (r * (1 - Math.cos(half)) < FLAT_MM) return [`${pt(sx, sy)} -- ${pt(ex, ey)}`, 1];
  const m = Math.max(1, Math.ceil(Math.abs(span) / pieceAngle(r))), step = span / m, k = (4 / 3) * Math.tan(step / 4) * r;
  let s = pt7(sx, sy), px = sx, py = sy;
  for (let j = 1; j <= m; j++) {
    const t0 = a0 + step * (j - 1), t1 = a0 + step * j;
    const qx = j === m ? ex : cx + r * Math.cos(t1), qy = j === m ? ey : cy + r * Math.sin(t1);
    s += ` .. controls ${pt7(px - k * Math.sin(t0), py + k * Math.cos(t0))} and ${pt7(qx + k * Math.sin(t1), qy - k * Math.cos(t1))} .. ${pt7(qx, qy)}`;
    px = qx; py = qy;
  }
  return [s, m];
}

/**
 * The visible pieces of a large arc or circle: subpaths with their weights. An arc keeps its sense and its exact ends
 * where they are inside the disc.
 */
function largeArc(p: ArcPrim | { cx: number; cy: number; r: number; start: number; sweep: number; x0: number; y0: number; x1: number; y1: number }, rho: number, whole: boolean, out: [string, number][]): void {
  const { cx, cy, r } = p;
  const v = visibleArc(cx, cy, r, rho);
  if (v.g < 0) return;
  if (whole) {
    if (v.g >= Math.PI) { out.push([`${pt(cx, cy)} circle[radius=${num(r)}]`, 4]); return; }
    const a0 = v.m - v.g, a1 = v.m + v.g;
    out.push(bezierPath(cx, cy, r, a0, a1, cx + r * Math.cos(a0), cy + r * Math.sin(a0), cx + r * Math.cos(a1), cy + r * Math.sin(a1)));
    return;
  }
  const { start, sweep } = p;
  if (v.g >= Math.PI) { out.push(bezierPath(cx, cy, r, start, start + sweep, p.x0, p.y0, p.x1, p.y1)); return; }
  // Intersect [lo, hi] with the visible interval's copies; pieces in the arc's own sense.
  const lo = Math.min(start, start + sweep), hi = Math.max(start, start + sweep);
  const pieces: [number, number][] = [];
  const k0 = Math.floor((lo - v.m - v.g) / TAU), k1 = Math.ceil((hi - v.m + v.g) / TAU);
  for (let k = k0; k <= k1; k++) {
    const a = Math.max(lo, v.m + k * TAU - v.g), b = Math.min(hi, v.m + k * TAU + v.g);
    if (b > a) pieces.push([a, b]);
  }
  if (sweep < 0) pieces.reverse();
  const sAt = sweep >= 0 ? lo : hi, eAt = sweep >= 0 ? hi : lo;
  for (const [a, b] of pieces) {
    const f = sweep >= 0 ? a : b, t = sweep >= 0 ? b : a;
    const fx = f === sAt ? p.x0 : cx + r * Math.cos(f), fy = f === sAt ? p.y0 : cy + r * Math.sin(f);
    const tx = t === eAt ? p.x1 : cx + r * Math.cos(t), ty = t === eAt ? p.y1 : cy + r * Math.sin(t);
    out.push(bezierPath(cx, cy, r, f, t, fx, fy, tx, ty));
  }
}

// ---------------------------------------------------------------------------------------------------------------
// The writer

/** Which preset a detail is, or "custom". */
function detailName(d: Detail): string {
  for (const name of DETAIL_NAMES) {
    const p = DETAIL_PRESETS[name];
    if ((Object.keys(p) as (keyof Detail)[]).every((k) => p[k] === d[k])) return name;
  }
  return 'custom';
}

const MODE_NAMES = { colour: 'colour', grey: 'greyscale', bw: 'black and white' } as const;

/** The figure as TikZ: the picture to paste and a standalone document. */
export function figureTikz(fig: Figure, options: TikzOptions = {}): FigureTikz {
  const withText = options.text !== false, mode = fig.colour, b = fig.box;
  const colours = new Map<string, string>();      // #rrggbb → name
  const colour = (hex: string): string => {
    let name = colours.get(hex);
    if (!name) colours.set(hex, (name = `smith${hex.slice(1).toUpperCase()}`));
    return name;
  };
  const styles = new Map<string, string>();       // definition → name
  const styleDefs: string[] = [];
  const style = (prefix: string, def: string): string => {
    let name = styles.get(def);
    if (!name) {
      name = `${prefix}${styleDefs.length + 1}`;
      styles.set(def, name);
      styleDefs.push(`  ${name}/.style={${def}}`);
    }
    return name;
  };
  const dash = (d: readonly number[]): string => {
    let s = '';
    for (let i = 0; i < d.length; i += 2) s += `${i ? ' ' : ''}on ${num(d[i])}mm off ${num(d[i + 1] ?? d[i])}mm`;
    return s;
  };
  const strokeStyle = (s: Stroke): string =>
    style('sk', `draw=${colour(s.colour)}, line width=${num(s.width)}mm${s.dash.length ? `, dash pattern=${dash(s.dash)}` : ''}`);
  const markStyle = (s: Stroke, shape: string): string =>
    style('mk', `draw=${colour(s.colour)}, fill=${colour(s.fill || s.colour)}, line width=${num(shape === 'cross' ? s.width * 1.6 : s.width)}mm`);
  const textStyle = (ink: string, size: number): string =>
    style('tx', `text=${colour(ink)}, font=\\fontsize{${num(size)}}{${num(size * 1.2)}}\\selectfont, text height=${num(TEXT_HEIGHT_EM * size)}pt, text depth=0pt, inner sep=0pt, outer sep=0pt`);

  const body: string[] = [];
  // The open \draw: its style, clip and subpaths.
  let openStyle = '', openWeight = 0, openParts: string[] = [];
  const flush = () => {
    if (!openParts.length) return;
    let line = `  \\draw[${openStyle}]`, len = line.length;
    const lines: string[] = [];
    for (const part of openParts) {
      if (len + part.length > 160 && len > 12) { lines.push(line); line = '    '; len = 4; }
      line += ` ${part}`; len += part.length + 1;
    }
    lines.push(line + ';');
    body.push(lines.join('\n'));
    openParts = []; openWeight = 0; openStyle = '';
  };
  const add = (name: string, part: string, weight: number) => {
    if (openStyle !== name || openWeight + weight > DRAW_WEIGHT) flush();
    openStyle = name; openParts.push(part); openWeight += weight;
  };
  let clipOpen = false;
  const clip = (on: boolean) => {
    if (on === clipOpen) return;
    flush();
    body.push(on ? `  \\begin{scope}\n  \\clip (0,0) circle[radius=${num(fig.clipR)}];` : '  \\end{scope}');
    clipOpen = on;
  };
  // The visible discs: the clip circle, or the box's circumcircle about the origin.
  const boxRho = Math.max(Math.hypot(b.x0, b.y0), Math.hypot(b.x1, b.y0), Math.hypot(b.x0, b.y1), Math.hypot(b.x1, b.y1)) + VISIBLE_PAD;
  const clipRho = fig.clipR + VISIBLE_PAD;
  const large: [string, number][] = [];
  const nodes = (p: Prim): void => {
    const name = strokeStyle(strokeOf(mode, p.role, p.sub, p.index));
    switch (p.type) {
      case 'circle':
        if (p.r > ARC_MAX_MM) {
          large.length = 0;
          largeArc({ cx: p.cx, cy: p.cy, r: p.r, start: 0, sweep: TAU, x0: 0, y0: 0, x1: 0, y1: 0 }, p.clip ? clipRho : boxRho, true, large);
          for (const [s, w] of large) add(name, s, w);
        } else add(name, `${pt(p.cx, p.cy)} circle[radius=${num(p.r)}]`, 4);
        return;
      case 'arc': {
        if (p.r > ARC_MAX_MM) {
          large.length = 0;
          largeArc(p, p.clip ? clipRho : boxRho, false, large);
          for (const [s, w] of large) add(name, s, w);
          return;
        }
        const half = Math.min(Math.abs(p.sweep), Math.PI) / 2;
        if (p.r * (1 - Math.cos(half)) < FLAT_MM) { add(name, `${pt(p.x0, p.y0)} -- ${pt(p.x1, p.y1)}`, 1); return; }
        add(name, `${pt7(p.x0, p.y0)} arc[start angle=${deg(p.start, p.r)}, delta angle=${deg(p.sweep, p.r)}, radius=${n7(p.r)}]`,
          Math.max(1, Math.ceil(Math.abs(p.sweep) / (Math.PI / 2))));
        return;
      }
      case 'line':
        add(name, `${pt(p.x0, p.y0)} -- ${pt(p.x1, p.y1)}`, 1);
        return;
      case 'poly': {
        const a = p.pts;
        let i = 0;
        while (i < p.n) {
          // a run of finite points, in chunks of POLY_CHUNK sharing their ends
          while (i < p.n && !(Number.isFinite(a[2 * i]) && Number.isFinite(a[2 * i + 1]))) i++;
          let j = i;
          while (j < p.n && Number.isFinite(a[2 * j]) && Number.isFinite(a[2 * j + 1])) j++;
          for (let c = i; c < j - 1; c += POLY_CHUNK - 1) {
            const e = Math.min(j - 1, c + POLY_CHUNK - 1), parts: string[] = new Array(e - c + 1);
            for (let q = c; q <= e; q++) parts[q - c] = pt(a[2 * q], a[2 * q + 1]);
            add(name, parts.join(' -- '), e - c);
          }
          i = j;
        }
      }
    }
  };

  const mark = (p: MarkPrim): string => {
    const s = strokeOf(mode, p.role, p.sub, p.index), name = markStyle(s, p.shape), x = p.x, y = p.y, h = p.size / 2;
    switch (p.shape) {
      case 'dot': return `  \\fill[${name}] ${pt(x, y)} circle[radius=${num(h)}];`;
      case 'target': return `  \\draw[${name}] ${pt(x, y)} circle[radius=${num(h - s.width / 2)}];\n  \\fill[${name}] ${pt(x, y)} circle[radius=${num(h * 0.3)}];`;
      case 'cross': {
        const q = h * 0.8;
        return `  \\draw[${name}] ${pt(x - q, y + q)} -- ${pt(x + q, y - q)} ${pt(x - q, y - q)} -- ${pt(x + q, y + q)};`;
      }
      case 'triangle': {
        const t = h * 1.1;
        return `  \\filldraw[${name}] ${pt(x, y + t)} -- ${pt(x + t * 0.866, y - t / 2)} -- ${pt(x - t * 0.866, y - t / 2)} -- cycle;`;
      }
    }
    return '';
  };

  const text = (p: TextPrim): string => {
    const name = textStyle(inkOf(mode, p.role, p.sub), p.pt);
    const opts = `${name}${p.anchor === 'start' ? ', anchor=west' : ''}${p.rotate ? `, rotate=${num(p.rotate)}` : ''}`;
    return `  \\node[${opts}] at ${pt(p.x, p.y)} {${texLabel(p.text)}};`;
  };

  for (const p of fig.prims) {
    if (p.type === 'text') {
      if (!withText) continue;
      clip(false); flush();
      body.push(text(p));
    } else if (p.type === 'mark') {
      clip(false); flush();
      body.push(mark(p));
    } else {
      clip(p.clip);
      nodes(p);
    }
  }
  clip(false);
  flush();

  // Head: what it is, the colours, the picture's options.
  const W = fig.width, H = b.y1 - b.y0;
  const what = `${fig.linewidth ? `\\linewidth wide (laid out for ${num(W)} mm)` : `${num(W)} x ${num(H)} mm`}, ${detailName(fig.detail)} detail, ${MODE_NAMES[mode]}`;
  const head: string[] = [];
  head.push(`% Smith chart, ${comment(what)}, from ${SITE}`);
  head.push('% Needs only \\usepackage{tikz}. Coordinates are millimetres on paper with the chart\'s centre (Gamma = 0)');
  head.push(fig.linewidth
    ? `% at (0,0), y up, in units of \\linewidth/${num(W)}: the picture is \\linewidth wide; text keeps its size in pt and lines`
    : '% at (0,0), y up; text is set in the document\'s font at the size in pt it was laid out for.');
  if (fig.linewidth) head.push('% their width in mm. Start the paragraph with \\noindent (or put the picture in a center or figure).');
  for (const [hex, name] of colours) head.push(`\\definecolor{${name}}{HTML}{${hex.slice(1).toUpperCase()}}%`);
  const unit = fig.linewidth ? `\\linewidth/${num(W)}` : '1mm';
  const picture = [
    ...head,
    `\\begin{tikzpicture}[x=${unit}, y=${unit}, line cap=round, line join=round,`,
    `${styleDefs.join(',\n')}]`,
    `  \\useasboundingbox ${pt(b.x0, b.y0)} rectangle ${pt(b.x1, b.y1)};`,
    '  \\begin{scope}',
    `  \\clip ${pt(b.x0, b.y0)} rectangle ${pt(b.x1, b.y1)};`,
    ...body,
    '  \\end{scope}',
    '\\end{tikzpicture}',
    '',
  ].join('\n');

  const document = fig.linewidth
    ? [
      '% Compiles as it is with pdflatex, xelatex or lualatex. The minipage sets \\linewidth to the width the figure',
      `% was laid out for (${num(W)} mm); in a report the picture takes the \\linewidth where it is pasted.`,
      '\\RequirePackage{fix-cm} % lets the standard fonts take any size; part of LaTeX itself',
      '\\documentclass[border=0pt]{standalone}',
      '\\usepackage{tikz}',
      '\\begin{document}',
      `\\begin{minipage}{${num(W)}mm}\\noindent`,
      picture.trimEnd(),
      '\\end{minipage}',
      '\\end{document}',
      '',
    ].join('\n')
    : [
      '% Compiles as it is with pdflatex, xelatex or lualatex.',
      '\\RequirePackage{fix-cm} % lets the standard fonts take any size; part of LaTeX itself',
      '\\documentclass[tikz, border=0pt]{standalone}',
      '\\begin{document}',
      picture.trimEnd(),
      '\\end{document}',
      '',
    ].join('\n');
  return { picture, document };
}
