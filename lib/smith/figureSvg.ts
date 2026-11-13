// The figure model (figure.ts) as a standalone SVG (step M8.1a, plan.md D18): sized in mm (`width="88mm"` with a
// viewBox in mm), colours as #rrggbb from figureStyle.ts (no CSS variables, no stylesheet), the generic font family
// `sans-serif`, exact `A` arcs (pieces of at most PIECE radians, as components/Smith/pathLayer.ts arcPath, since an
// `A` near a half circle fixes its centre only to √ε of its radius), lines to the disk cut by a clipPath. y is negated
// (the model is Y up, SVG y down); every number is rounded to 1e-6 mm. Paths of one style are written as one `path`
// with `data-role`, `data-sub` and `data-index` (the preview and the harness read them back).

import type { ArcPrim, Figure, MarkPrim, Prim, TextPrim } from './figure';
import { PT_MM } from './figure';
import { ROLE_NAMES, inkOf, strokeOf } from './figureStyle';
import type { Stroke } from './figureStyle';

/** The longest piece of an arc written as one `A` (radians). */
export const PIECE = 0.6 * Math.PI;
/** An arc whose sagitta is under this (mm) is written as a straight segment. */
export const FLAT_MM = 1e-5;
/** Baseline below a text's centre, in em (for digits and capitals, without dominant-baseline). */
export const BASELINE_EM = 0.35;

export interface SvgOptions {
  /** Prefix of the clip ids (several figures in one page). Default "smith". */
  id?: string;
  /** A white background. Default true. */
  background?: boolean;
}

/** A number in mm rounded to 1e-6 mm, without "-0" or trailing zeros. */
export function num(v: number): string {
  if (!(Math.abs(v) < 1e9)) return String(v);
  const r = Math.round(v * 1e6);
  if (r === 0) return '0';
  const neg = r < 0, a = neg ? -r : r, i = Math.floor(a / 1e6), f = a - i * 1e6;
  let s = String(i);
  if (f) s += '.' + String(f).padStart(6, '0').replace(/0+$/, '');
  return neg ? '-' + s : s;
}

const esc = (t: string): string => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The path data of an arc primitive (model coordinates, written with y negated). */
export function arcData(p: ArcPrim): string {
  const { cx, cy, r, start, sweep } = p;
  let d = `M${num(p.x0)} ${num(-p.y0)}`;
  const half = Math.min(Math.abs(sweep), Math.PI) / 2;
  if (r * (1 - Math.cos(half)) < FLAT_MM) return `${d}L${num(p.x1)} ${num(-p.y1)}`;
  const m = Math.ceil(Math.abs(sweep) / PIECE), flag = sweep > 0 ? 0 : 1, head = `A${num(r)} ${num(r)} 0 0 ${flag} `;
  for (let j = 1; j < m; j++) {
    const a = start + (sweep * j) / m;
    d += `${head}${num(cx + r * Math.cos(a))} ${num(-(cy + r * Math.sin(a)))}`;
  }
  return `${d}${head}${num(p.x1)} ${num(-p.y1)}`;
}

function primData(p: Prim): string {
  switch (p.type) {
    case 'arc': return arcData(p);
    case 'line': return `M${num(p.x0)} ${num(-p.y0)}L${num(p.x1)} ${num(-p.y1)}`;
    case 'circle': {
      const r = num(p.r), y = num(-p.cy);
      return `M${num(p.cx + p.r)} ${y}A${r} ${r} 0 0 0 ${num(p.cx - p.r)} ${y}A${r} ${r} 0 0 0 ${num(p.cx + p.r)} ${y}`;
    }
    case 'poly': {
      const a = p.pts, parts: string[] = new Array(p.n);
      parts[0] = `M${num(a[0])} ${num(-a[1])}`;
      for (let i = 1; i < p.n; i++) parts[i] = `L${num(a[2 * i])} ${num(-a[2 * i + 1])}`;
      return parts.join('');
    }
  }
  return '';
}

function strokeAttrs(s: Stroke): string {
  let a = `fill="none" stroke="${s.colour}" stroke-width="${num(s.width)}"`;
  if (s.dash.length) a += ` stroke-dasharray="${s.dash.map(num).join(' ')}"`;
  return a + ' stroke-linecap="round" stroke-linejoin="round"';
}

function markSvg(p: MarkPrim, s: Stroke): string {
  const x = p.x, y = -p.y, h = p.size / 2;
  switch (p.shape) {
    case 'dot': return `<circle cx="${num(x)}" cy="${num(y)}" r="${num(h)}" fill="${s.fill || s.colour}"/>`;
    case 'target': return `<circle cx="${num(x)}" cy="${num(y)}" r="${num(h - s.width / 2)}" fill="none" stroke="${s.colour}" stroke-width="${num(s.width)}"/><circle cx="${num(x)}" cy="${num(y)}" r="${num(h * 0.3)}" fill="${s.colour}"/>`;
    case 'cross': {
      const q = h * 0.8;
      return `<path d="M${num(x - q)} ${num(y - q)}L${num(x + q)} ${num(y + q)}M${num(x - q)} ${num(y + q)}L${num(x + q)} ${num(y - q)}" fill="none" stroke="${s.colour}" stroke-width="${num(s.width * 1.6)}" stroke-linecap="round"/>`;
    }
    case 'triangle': {
      const t = h * 1.1;
      return `<path d="M${num(x)} ${num(y - t)}L${num(x + t * 0.866)} ${num(y + t / 2)}L${num(x - t * 0.866)} ${num(y + t / 2)}Z" fill="${s.fill || s.colour}" stroke="${s.colour}" stroke-width="${num(s.width)}" stroke-linejoin="round"/>`;
    }
  }
  return '';
}

function textSvg(p: TextPrim, fill: string): string {
  const size = p.pt * PT_MM, x = num(p.x), y = num(-p.y);
  const rot = p.rotate ? ` transform="rotate(${num(-p.rotate)} ${x} ${y})"` : '';
  const anchor = p.anchor === 'start' ? 'start' : 'middle';
  return `<text x="${x}" y="${num(-p.y + BASELINE_EM * size)}" font-size="${num(size)}" text-anchor="${anchor}" fill="${fill}"${rot}>${esc(p.text)}</text>`;
}

/** The figure as a standalone SVG document. */
export function figureSvg(fig: Figure, options: SvgOptions = {}): string {
  const id = options.id ?? 'smith', mode = fig.colour, b = fig.box;
  const w = b.x1 - b.x0, h = b.y1 - b.y0;
  const out: string[] = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${num(w)}mm" height="${num(h)}mm" viewBox="${num(b.x0)} ${num(-b.y1)} ${num(w)} ${num(h)}" font-family="sans-serif">`);
  out.push(`<defs><clipPath id="${id}-disk"><circle cx="0" cy="0" r="${num(fig.clipR)}"/></clipPath><clipPath id="${id}-box"><rect x="${num(b.x0)}" y="${num(-b.y1)}" width="${num(w)}" height="${num(h)}"/></clipPath></defs>`);
  if (options.background !== false) out.push(`<rect x="${num(b.x0)}" y="${num(-b.y1)}" width="${num(w)}" height="${num(h)}" fill="#ffffff"/>`);
  out.push(`<g clip-path="url(#${id}-box)">`);
  const prims = fig.prims;
  let i = 0, clipOpen = false;
  const clip = (on: boolean) => {
    if (on === clipOpen) return;
    out.push(on ? `<g clip-path="url(#${id}-disk)">` : '</g>');
    clipOpen = on;
  };
  while (i < prims.length) {
    const p = prims[i];
    if (p.type === 'text') {
      clip(false);
      out.push(textSvg(p, inkOf(mode, p.role, p.sub)));
      i++;
      continue;
    }
    const s = strokeOf(mode, p.role, p.sub, p.index);
    if (p.type === 'mark') {
      clip(false);
      out.push(markSvg(p, s));
      i++;
      continue;
    }
    // A run of paths of one style and one clip: one element.
    clip(p.clip);
    let d = primData(p), j = i + 1;
    while (j < prims.length) {
      const q = prims[j];
      if (q.type === 'text' || q.type === 'mark' || q.role !== p.role || q.sub !== p.sub || q.index !== p.index || q.clip !== p.clip || q.key !== p.key) break;
      d += primData(q);
      j++;
    }
    out.push(`<path data-role="${ROLE_NAMES[p.role]}" data-sub="${p.sub}" data-index="${p.index}"${p.key ? ' data-key=""' : ''} d="${d}" ${strokeAttrs(s)}/>`);
    i = j;
  }
  clip(false);
  out.push('</g></svg>');
  return out.join('\n');
}
