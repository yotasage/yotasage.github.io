// The figure as a standalone SVG (step M8.1a): width and height in mm, the viewBox in the model's mm with y negated,
// one `font-family="sans-serif"` (no font files), every paint as an attribute (no CSS), images as PNG data URIs, so
// the file is self-contained: the page's PNG is this SVG drawn into a canvas at 1×–8× (M8.1b). Each element carries
// `data-i` (its primitive's index; a hatch's lines `data-h`), which the harness reads back.

import { PT_MM, num } from './model';
import type { Figure, Prim, Rect } from './model';
import { hatchLines, primBox } from './model';
import { pngDataUri } from './png';
import { paintOf } from './style';
import type { Paint } from './style';

export interface SvgOptions { id?: string; background?: boolean }

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The primitives in drawing order (by layer, stable). */
export function drawOrder(fig: Figure): number[] {
  return fig.prims.map((_, i) => i).sort((a, b) => fig.prims[a].layer - fig.prims[b].layer || a - b);
}

function paintAttrs(p: Paint, closed: boolean): string {
  let a = ` fill="${closed && p.fill ? p.fill : 'none'}"`;
  if (p.stroke && p.width > 0) {
    a += ` stroke="${p.stroke}" stroke-width="${num(p.width)}"`;
    if (p.dash) a += ` stroke-dasharray="${p.dash.map(num).join(' ')}"`;
  }
  return a;
}

/** The SVG path data of a shape (y negated), for fills, outlines and hatch clips. */
export function shapePath(p: Prim): string {
  const Y = (y: number) => num(-y);
  if (p.t === 'rect') return `M${num(p.x)} ${Y(p.y)}H${num(p.x + p.w)}V${Y(p.y + p.h)}H${num(p.x)}Z`;
  if (p.t === 'circle') return `M${num(p.cx - p.r)} ${Y(p.cy)}A${num(p.r)} ${num(p.r)} 0 0 0 ${num(p.cx + p.r)} ${Y(p.cy)}A${num(p.r)} ${num(p.r)} 0 0 0 ${num(p.cx - p.r)} ${Y(p.cy)}Z`;
  if (p.t === 'poly') {
    let d = `M${num(p.pts[0])} ${Y(p.pts[1])}`;
    for (let i = 2; i < p.pts.length; i += 2) d += `L${num(p.pts[i])} ${Y(p.pts[i + 1])}`;
    return p.closed ? `${d}Z` : d;
  }
  if (p.t === 'segs') {
    const parts: string[] = [];
    for (let i = 0; i + 3 < p.s.length; i += 4) parts.push(`M${num(p.s[i])} ${Y(p.s[i + 1])}L${num(p.s[i + 2])} ${Y(p.s[i + 3])}`);
    return parts.join('');
  }
  return '';
}

export function figureSvg(fig: Figure, o: SvgOptions = {}): string {
  const id = o.id ?? 'emfig';
  const b = fig.box, W = b.x1 - b.x0, H = b.y1 - b.y0;
  const defs: string[] = fig.clips.map((c: Rect, i) => `<clipPath id="${id}-c${i}"><rect x="${num(c.x0)}" y="${num(-c.y1)}" width="${num(c.x1 - c.x0)}" height="${num(c.y1 - c.y0)}"/></clipPath>`);
  const body: string[] = [];
  if (o.background !== false) body.push(`<rect data-paper="1" x="${num(b.x0)}" y="${num(-b.y1)}" width="${num(W)}" height="${num(H)}" fill="#ffffff"/>`);
  for (const i of drawOrder(fig)) {
    const p = fig.prims[i];
    const paint = paintOf(fig.colour, p.role, p.index ?? 0);
    const clip = p.clip !== undefined ? ` clip-path="url(#${id}-c${p.clip})"` : '';
    const tag = ` data-i="${i}" data-role="${p.role}"`;
    switch (p.t) {
      case 'rect':
        body.push(`<rect${tag} x="${num(p.x)}" y="${num(-(p.y + p.h))}" width="${num(p.w)}" height="${num(p.h)}"${paintAttrs(paint, true)}${clip}/>`);
        break;
      case 'circle':
        body.push(`<circle${tag} cx="${num(p.cx)}" cy="${num(-p.cy)}" r="${num(p.r)}"${paintAttrs(paint, true)}${clip}/>`);
        break;
      case 'poly': case 'segs':
        body.push(`<path${tag} d="${shapePath(p)}"${paintAttrs(paint, p.t === 'poly' && p.closed)}${clip}/>`);
        break;
      case 'text': {
        const em = p.pt * PT_MM;
        const anchor = p.anchor === 'middle' ? 'middle' : p.anchor === 'end' ? 'end' : 'start';
        const rot = p.rotate ? ` transform="rotate(${num(-p.rotate)} ${num(p.x)} ${num(-p.y)})"` : '';
        body.push(`<text${tag} x="${num(p.x)}" y="${num(-p.y + 0.35 * em)}" font-size="${num(em)}" text-anchor="${anchor}" fill="${paint.fill}"${rot}${clip}>${esc(p.text)}</text>`);
        break;
      }
      case 'image':
        body.push(`<image${tag} x="${num(p.x)}" y="${num(-(p.y + p.h))}" width="${num(p.w)}" height="${num(p.h)}" preserveAspectRatio="none" xlink:href="${pngDataUri(p.png)}"${clip}/>`);
        break;
    }
    if (paint.hatch && (p.t === 'rect' || p.t === 'circle' || (p.t === 'poly' && p.closed))) {
      const h = paint.hatch;
      const lines = hatchLines(primBox(p), h.angle, h.gap);
      if (lines.length) {
        defs.push(`<clipPath id="${id}-h${i}"><path d="${shapePath(p)}"/></clipPath>`);
        const d: string[] = [];
        for (let k = 0; k < lines.length; k += 4) d.push(`M${num(lines[k])} ${num(-lines[k + 1])}L${num(lines[k + 2])} ${num(-lines[k + 3])}`);
        const g = p.clip !== undefined ? `<g${clip}>` : '';
        body.push(`${g}<path data-h="${i}" d="${d.join('')}" fill="none" stroke="${h.colour}" stroke-width="${num(h.width)}" clip-path="url(#${id}-h${i})"/>${g ? '</g>' : ''}`);
      }
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${num(W)}mm" height="${num(H)}mm" viewBox="${num(b.x0)} ${num(-b.y1)} ${num(W)} ${num(H)}" font-family="sans-serif" stroke-linejoin="round">\n`
    + `<defs>${defs.join('')}</defs>\n${body.join('\n')}\n</svg>\n`;
}
