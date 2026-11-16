// The board figures (step M8.1a): the stackup, the trace's cross-section and the via's side and top views, laid out in
// mm for a width on paper. Built downwards from y = 0 (the top) and shifted at the end so the box is [0, W] × [0, H].
// The geometry is the page's: the stackup's sketch as components/EmSim/StackupDrawing.tsx draws it (in mm instead of
// px), the cross-section from lib/emsim/geometry.ts's Section at true scale, the via views from
// components/EmSim/viaGeom.ts (framework-free) at true scale. `fig.world` maps world mm (x, z up; the top view's
// board y up) to paper, so field.ts can lay a map under the copper.

import { layerIndex, stackThickness, stackZ } from '../stackup';
import type { Layer, MaskLayer, Stackup } from '../stackup';
import type { Section } from '../geometry';
import type { Structure } from '../structure';
import type { ViaStructure } from '../via';
import { addMap, mapFooter } from './field';
import type { MapInput } from './field';
import { sideGeom, topGeom } from '../../../components/EmSim/viaGeom';
import {
  L_BACK, L_COPPER, L_NOTE, addClip, barLength, emMm, mmText, newFigure, shift, text, textBox, textWidth, wrapText,
} from './model';
import type { Figure, FigureOptions } from './model';
import type { Role } from './style';
import { paintOf } from './style';

export interface BoardOptions extends FigureOptions {
  len?: (mm: number) => string; // a length as text (default mmText; the page passes its unit)
  num?: (v: number) => string; // a plain number (εr)
  legend?: boolean; // the key of materials (default true)
  map?: MapInput; // a field map under the copper (not on the stackup), with its colour bar below
}


function rect(fig: Figure, x0: number, y0: number, x1: number, y1: number, role: Role, layer: number, clip?: number): void {
  if (!(x1 > x0) || !(y1 > y0)) return;
  fig.prims.push({ t: 'rect', x: x0, y: y0, w: x1 - x0, h: y1 - y0, role, layer, clip });
}

function poly(fig: Figure, pts: number[], closed: boolean, role: Role, layer: number, clip?: number): void {
  if (pts.length >= 4) fig.prims.push({ t: 'poly', pts, closed, role, layer, clip });
}

/** Sets the box from y = bottom (≤ 0) to 0 and moves everything up by −bottom. */
function finish(fig: Figure, bottom: number, top = 0): Figure {
  shift(fig, 0, -bottom);
  fig.height = top - bottom;
  fig.box = { x0: 0, y0: 0, x1: fig.width, y1: fig.height };
  return fig;
}

const ROLE_NAME: Partial<Record<Role, string>> = { copper: 'copper', core: 'core', prepreg: 'prepreg', mask: 'mask', air: 'air', hole: 'hole', faded: 'behind the cut' };

/** The key of materials as a flowing row from y down; returns the new y. */
export function legendRow(fig: Figure, y: number, roles: Role[]): number {
  const pt = Math.max(6, fig.fontPt - 1), em = emMm(pt), sw = 2.6 * em * 0.5 + 1.6, sh = 0.9 * em, gap = 1.6;
  let x = 0, line = y - 0.9 * em;
  for (const r of roles) {
    const label = ROLE_NAME[r] ?? r;
    const w = sw + 0.8 + textWidth(label, pt);
    if (x > 0 && x + w > fig.width) { x = 0; line -= 1.5 * em; }
    const p = paintOf(fig.colour, r);
    // white swatches (b&w air, hole) get an outline from the leader's paint
    fig.prims.push({ t: 'rect', x, y: line - sh / 2, w: sw, h: sh, role: r, layer: L_NOTE });
    if (!p.stroke && (p.fill === '#ffffff' || p.fill === null) && !p.hatch) poly(fig, [x, line - sh / 2, x + sw, line - sh / 2, x + sw, line + sh / 2, x, line + sh / 2], true, 'leader', L_NOTE);
    text(fig, x + sw + 0.8, line, label, pt, 'start');
    x += w + gap;
  }
  return line - 0.6 * em - 0.8;
}

/** A scale bar of a 1-2-5 length at s paper mm per world mm, from y down; returns the new y. */
export function scaleBar(fig: Figure, y: number, s: number, len: (mm: number) => string, note = ''): number {
  const pt = Math.max(6, fig.fontPt - 1), em = emMm(pt);
  const L = barLength(s, Math.min(25, fig.width * 0.3));
  const w = L * s, cy = y - 0.8 * em;
  fig.prims.push({ t: 'segs', s: [0, cy, w, cy, 0, cy - 0.6, 0, cy + 0.6, w, cy - 0.6, w, cy + 0.6], role: 'dim', layer: L_NOTE });
  const label = len(L);
  text(fig, w + 1.2, cy, label, pt, 'start');
  if (note) {
    const x = w + 1.2 + textWidth(label, pt) + 2.4;
    if (x + textWidth(note, pt) <= fig.width) text(fig, x, cy, note, pt, 'start', 'muted');
    else {
      let yy = cy;
      for (const l of wrapText(note, pt, fig.width)) { yy -= 1.5 * em; text(fig, 0, yy, l, pt, 'start', 'muted'); }
      return yy - 0.6 * em - 0.8;
    }
  }
  return cy - 0.6 * em - 0.8;
}

function dielectricRole(l: Layer | undefined): Role {
  return l && l.kind === 'dielectric' ? (l.role === 'core' ? 'core' : 'prepreg') : 'air';
}

// ---------------------------------------------------------------------------------------------------------------
// The stackup

const FEATURES: readonly [number, number][] = [[14, 34], [44, 52], [60, 68], [78, 100]];
const BARE = 14;

function outerCoppers(L: Layer[]): { c: number; m: number; up: boolean }[] {
  const out: { c: number; m: number; up: boolean }[] = [];
  const first = L.findIndex((l) => l.kind === 'copper');
  if (first < 0) return out;
  let last = -1;
  for (let i = L.length - 1; i >= 0; i--) if (L[i].kind === 'copper') { last = i; break; }
  const onlyMasks = (a: number, b: number) => { for (let i = a; i < b; i++) if (L[i].kind !== 'mask') return false; return true; };
  if (onlyMasks(0, first)) out.push({ c: first, m: first > 0 ? first - 1 : -1, up: true });
  if (last !== first && onlyMasks(last + 1, L.length)) out.push({ c: last, m: last + 1 < L.length ? last + 1 : -1, up: false });
  return out;
}

export interface StackupFigureOptions extends BoardOptions { widen?: boolean /* default true: every layer ≥ 3 % of the body */ }

/** The stackup to scale top to bottom (or with thin layers widened), with a label per layer. */
export function stackupFigure(s: Stackup, o: StackupFigureOptions = {}): Figure {
  const fig = newFigure('stackup', 'stackup', o);
  const W = fig.width, pt = fig.fontPt, em = emMm(pt);
  const len = o.len ?? mmText, numText = o.num ?? ((v: number) => String(Number(v.toPrecision(3))));
  const widen = o.widen !== false;
  const L = s.layers, n = L.length;
  const z = stackZ(s);
  const nameOf = (l: Layer) => (l.kind === 'dielectric' ? (l.material && l.material !== l.name ? `${l.material}` : l.role) : l.name);
  const detailOf = (l: Layer) => (l.kind === 'dielectric' ? `${len(l.t.v)} · εr ${numText(l.er.v)}` : l.kind === 'mask' ? len(l.onLaminate.v) : len(l.t.v));
  const LEAD = 5;
  const oneLine = L.map((l) => textWidth(`${nameOf(l)}  ${detailOf(l)}`, pt));
  const maxOne = Math.max(0, ...oneLine);
  const two = W - LEAD - maxOne < 0.35 * W;
  // narrow: the name and the detail on lines of their own, wrapped to the label column
  const avail = W - LEAD - 0.3 * W - 0.5;
  const wrapped = L.map((l) => (two ? [...wrapText(nameOf(l), pt, avail).map((x) => [x, 'ink']), ...wrapText(detailOf(l), pt, avail).map((x) => [x, 'muted'])] as [string, Role][] : []));
  const labelW = two ? Math.max(0, ...wrapped.flat().map(([x]) => textWidth(x, pt))) : maxOne;
  const bw = Math.min(0.6 * W, Math.max(0.3 * W, W - LEAD - labelW - 0.5));
  const lineH = 1.2 * em, gap = (two ? Math.max(2, ...wrapped.map((w) => w.length)) : 1) * lineH + 0.7;
  const body = Math.max(0.42 * W, n * gap);
  const t = L.map((l) => Math.max(0, stackThickness(l)));
  const total = z[0] > 0 ? z[0] : 1;
  const minH = Math.max(0.8, 0.03 * body);
  let k = body / total;
  if (widen) {
    if (n * minH >= body) k = 0;
    else {
      let lo = 0, hi = body / total;
      for (let it = 0; it < 60; it++) { const mid = (lo + hi) / 2; let sum = 0; for (const ti of t) sum += Math.max(ti * mid, minH); if (sum > body) hi = mid; else lo = mid; }
      k = lo;
    }
  }
  const h = t.map((ti) => (widen ? Math.max(ti * k, minH) : ti * k));
  const air = Math.max(3, 1.6 * lineH);
  const top: number[] = new Array(n + 1); // depth of each layer's top (down from the drawing's top)
  top[0] = air;
  for (let i = 0; i < n; i++) top[i + 1] = top[i] + h[i];
  const scaleOf = (i: number) => (t[i] > 0 ? h[i] / t[i] : k || minH / 0.01);
  const dOf = (zz: number): number => {
    if (n === 0) return air;
    if (zz >= z[0]) return air - (zz - z[0]) * scaleOf(0);
    if (zz <= z[n]) return top[n] + (z[n] - zz) * scaleOf(n - 1);
    let i = 0;
    while (i < n - 1 && zz < z[i + 1]) i++;
    return t[i] > 0 ? top[i] + ((z[i] - zz) / t[i]) * h[i] : top[i];
  };
  let Hd = top[n] + air;
  const labels = L.map((_, i) => top[i] + h[i] / 2);
  for (let i = 1; i < n; i++) labels[i] = Math.max(labels[i], labels[i - 1] + gap);
  if (n && labels[n - 1] > Hd - gap / 2) Hd = labels[n - 1] + gap / 2;
  for (let i = n - 2; i >= 0; i--) labels[i] = Math.min(labels[i], labels[i + 1] - gap);
  for (let i = 0; i < n; i++) labels[i] = Math.max(labels[i], gap / 2 + i * gap);
  const X = (u: number) => (u / 100) * bw; // the sketch's 0 … 100 across
  const clip = addClip(fig, { x0: 0, y0: -Hd, x1: bw, y1: 0 });
  rect(fig, 0, -Hd, bw, 0, 'air', L_BACK, clip);
  const outer = outerCoppers(L);
  const conformal = new Set<number>();
  for (const q of outer) { conformal.add(q.c); if (q.m >= 0) conformal.add(q.m); }
  L.forEach((l, i) => {
    if (conformal.has(i)) return;
    const role: Role = l.kind === 'copper' ? 'copper' : l.kind === 'mask' ? 'mask' : dielectricRole(l);
    rect(fig, 0, -(top[i] + h[i]), bw, -top[i], role === 'copper' ? 'plane' : role, role === 'copper' ? L_COPPER : L_BACK, clip);
    if (l.kind === 'dielectric' && i > 0 && L[i - 1].kind === 'dielectric') poly(fig, [0, -top[i], bw, -top[i]], false, 'edge', L_BACK, clip);
  });
  for (const q of outer) {
    const zCuOut = q.up ? z[q.c] : z[q.c + 1], zLam = q.up ? z[q.c + 1] : z[q.c], dir = q.up ? 1 : -1;
    if (q.m >= 0) {
      const m = L[q.m] as MaskLayer;
      const lev: [number, number, number][] = [[0, BARE, zLam + dir * m.onLaminate.v]];
      FEATURES.forEach(([a, b], j) => {
        lev.push([a, b, zCuOut + dir * m.onCopper.v]);
        if (j + 1 < FEATURES.length) lev.push([b, FEATURES[j + 1][0], zLam + dir * m.between.v]);
      });
      const pts: number[] = [X(0), -dOf(zLam)];
      for (const [a, b, zz] of lev) pts.push(X(a), -dOf(zz), X(b), -dOf(zz));
      pts.push(X(100), -dOf(zLam));
      poly(fig, pts, true, 'mask', L_BACK, clip);
    }
    const d1 = dOf(Math.max(zCuOut, zLam)), d2 = dOf(Math.min(zCuOut, zLam));
    for (const [a, b] of FEATURES) rect(fig, X(a), -d2, X(b), -d1, 'copper', L_COPPER, clip);
  }
  const apt = Math.max(6, pt - 1);
  text(fig, 1, -Math.min(air / 2, 0.5 + 0.6 * emMm(apt)), 'air', apt, 'start', 'muted');
  text(fig, 1, -(Hd - Math.min(air / 2, 0.5 + 0.6 * emMm(apt))), 'air', apt, 'start', 'muted');
  L.forEach((l, i) => {
    poly(fig, [bw, -(top[i] + h[i] / 2), bw + LEAD - 0.6, -labels[i]], false, 'leader', L_NOTE);
    if (two) {
      const ls = wrapped[i];
      ls.forEach(([x, role], j) => text(fig, bw + LEAD, -labels[i] + ((ls.length - 1) / 2 - j) * lineH, x, pt, 'start', role));
    } else {
      const nm = nameOf(l);
      text(fig, bw + LEAD, -labels[i], nm, pt, 'start');
      text(fig, bw + LEAD + textWidth(nm, pt) + 0.33 * em * 2, -labels[i], detailOf(l), pt, 'start', 'muted');
    }
  });
  let y = -Hd - 1.5;
  if (o.legend !== false) y = legendRow(fig, y, ['copper', 'core', 'prepreg', 'mask', 'air']);
  if (!widen && k > 0) y = scaleBar(fig, y, k, len, 'to scale top to bottom; across, a sketch');
  if (widen) {
    const ptn = Math.max(6, pt - 1);
    for (const l of wrapText('Thin layers widened: not to scale.', ptn, W)) { text(fig, 0, y - 0.8 * emMm(ptn), l, ptn, 'start', 'muted'); y -= 1.5 * emMm(ptn); }
    y -= 0.8;
  }
  fig.note = `stackup ${s.name || ''}, ${widen ? 'thin layers widened' : 'to scale top to bottom'}`;
  return finish(fig, y);
}

// ---------------------------------------------------------------------------------------------------------------
// The cross-section

export interface SectionFigureOptions extends BoardOptions { dims?: boolean /* w, s and h (default true; never with a map) */ }

/**
 * The trace's cross-section at true scale (lib/emsim/geometry.ts's Section) with its dimensions, cropped as the page's
 * drawing is: across, the signals and about 2.5 section heights beside them; up and down, the planes or the copper
 * with a margin, at least 0.35 of the width high when there is air above to show.
 */
export function sectionFigure(s: Stackup, st: Structure, sec: Section, o: SectionFigureOptions = {}): Figure {
  const fig = newFigure('section', 'section', o);
  const W = fig.width, pt = fig.fontPt;
  const len = o.len ?? mmText;
  const z = stackZ(s);
  const thick = (id: string) => { const i = layerIndex(s, id); return i >= 0 ? z[i] - z[i + 1] : 0; };
  const tB = sec.planeBelow !== null && st.below ? thick(st.below) : 0;
  const tA = sec.planeAbove !== null && st.above ? thick(st.above) : 0;
  const sig: { u0: number; u1: number; zb: number; zt: number }[] = [];
  let zc0 = Infinity, zc1 = -Infinity, xc = 0;
  for (const c of sec.conductors) {
    let u0 = Infinity, u1 = -Infinity, zb = Infinity, zt = -Infinity;
    for (let i = 0; i < c.pts.length; i += 2) { u0 = Math.min(u0, c.pts[i]); u1 = Math.max(u1, c.pts[i]); zb = Math.min(zb, c.pts[i + 1]); zt = Math.max(zt, c.pts[i + 1]); }
    zc0 = Math.min(zc0, zb); zc1 = Math.max(zc1, zt);
    if (c.id > 0) { sig[c.id - 1] = { u0, u1, zb, zt }; xc = Math.max(xc, Math.abs(u0), Math.abs(u1)); }
  }
  for (const k of sec.skins) for (let i = 1; i < k.surface.length; i += 2) if (Math.abs(k.surface[i - 1]) <= xc * 3) zc1 = Math.max(zc1, k.surface[i]);
  if (!(zc1 > zc0)) { zc0 = sec.zLo; zc1 = sec.zHi; }
  const hz = Math.max(zc1 - (sec.planeBelow ?? zc0), 0.02);
  const ext = Math.min(sec.ext, Math.max(xc * 1.5, xc + 2.5 * hz));
  let zBot = sec.planeBelow !== null ? sec.zLo - tB : Math.max(sec.zLo, zc0 - Math.max(2 * hz, 0.1));
  let zTop = sec.planeAbove !== null ? sec.zHi + tA : Math.min(sec.zHi, zc1 + Math.max(1.5 * hz, 0.1));
  if (sec.planeAbove === null && zTop - zBot < 0.35 * 2 * ext) zTop = Math.min(sec.zHi, zBot + 0.35 * 2 * ext);
  if (sec.planeBelow === null && zTop - zBot < 0.35 * 2 * ext) zBot = Math.max(sec.zLo, zTop - 0.35 * 2 * ext);
  const sc = W / (2 * ext);
  const wx = (x: number) => sc * (x + ext), wy = (zz: number) => sc * (zz - zTop);
  const Hd = sc * (zTop - zBot);
  const clip = addClip(fig, { x0: 0, y0: -Hd, x1: W, y1: 0 });
  fig.world = { s: sc, ox: sc * ext, oy: -sc * zTop, clip, rect: { x0: 0, y0: -Hd, x1: W, y1: 0 } };
  const pts = (a: Float64Array) => { const out: number[] = new Array(a.length); for (let i = 0; i < a.length; i += 2) { out[i] = wx(a[i]); out[i + 1] = wy(a[i + 1]); } return out; };
  for (const r of sec.regions) {
    const m = sec.materials[r.mat];
    const role: Role = m.kind === 'air' ? 'air' : m.kind === 'mask' ? 'mask' : dielectricRole(s.layers[m.layer]);
    poly(fig, pts(r.pts), true, role, L_BACK, clip);
  }
  if (tB > 0) rect(fig, 0, wy(sec.zLo - tB), W, wy(sec.zLo), 'copper', L_COPPER, clip);
  if (tA > 0) rect(fig, 0, wy(sec.zHi), W, wy(sec.zHi + tA), 'copper', L_COPPER, clip);
  for (const c of sec.conductors) poly(fig, pts(c.pts), true, 'copper', L_COPPER, clip);
  if (o.map) addMap(fig, o.map);
  else if (o.dims !== false && sig[0]) {
    const dpt = Math.max(6, pt - 1), dem = emMm(dpt), tk = 0.7;
    const a = sig[0];
    const yTop = wy(Math.max(...sig.filter(Boolean).map((q) => q.zt)));
    const yd1 = yTop + 1.8, yd2 = yd1 + 1.2 * dem + 1.4;
    const dimText = (x: number, yy: number, label: string) => {
      const tw = textWidth(label, dpt);
      text(fig, Math.min(W - tw / 2 - 0.3, Math.max(tw / 2 + 0.3, x)), yy + 0.9 + 0.35 * dem, label, dpt, 'middle');
    };
    fig.prims.push({ t: 'segs', s: [wx(a.u0), yd1, wx(a.u1), yd1, wx(a.u0), yd1 - tk, wx(a.u0), yd1 + tk, wx(a.u1), yd1 - tk, wx(a.u1), yd1 + tk], role: 'dim', layer: L_NOTE });
    const b = sig[1];
    // w: above its line, or for a pair beside it, away from the gap's dimension
    const wl = `w ${len(a.u1 - a.u0)}`, ww = textWidth(wl, dpt);
    if (b && b.u0 > a.u1 && wx(a.u0) - 1.2 - ww >= 0) text(fig, wx(a.u0) - 1.2, yd1, wl, dpt, 'end');
    else if (b && b.u1 < a.u0 && wx(a.u1) + 1.2 + ww <= W) text(fig, wx(a.u1) + 1.2, yd1, wl, dpt, 'start');
    else dimText((wx(a.u0) + wx(a.u1)) / 2, yd1, wl);
    if (b && Math.abs(b.zb - a.zb) < 1e-9 && st.kind !== 'general') {
      const lo = a.u1 < b.u0 ? a : b, hi = a.u1 < b.u0 ? b : a;
      const g0 = wx(lo.u1), g1 = wx(hi.u0);
      if (g1 > g0) {
        fig.prims.push({ t: 'segs', s: [g0, yd2, g1, yd2, g0, wy(lo.zt) + 0.4, g0, yd2 + tk, g1, wy(hi.zt) + 0.4, g1, yd2 + tk], role: 'dim', layer: L_NOTE });
        dimText((g0 + g1) / 2, yd2, `s ${len(hi.u0 - lo.u1)}`);
      }
    }
    if (sec.planeBelow !== null && a.zb > sec.planeBelow) {
      const label = `h ${len(a.zb - sec.planeBelow)}`, tw = textWidth(label, dpt);
      let left = !!(b && b.u0 > a.u1);
      if (left && wx(a.u0) - 2.5 - 0.8 - tw < 0) left = false;
      if (!left && wx(a.u1) + 2.5 + 0.8 + tw > W) left = true;
      const xh = left ? wx(a.u0) - 2.5 : wx(a.u1) + 2.5, y0 = wy(sec.planeBelow), y1 = wy(a.zb);
      fig.prims.push({ t: 'segs', s: [xh, y0, xh, y1, xh - tk, y0, xh + tk, y0, xh - tk, y1, xh + tk, y1], role: 'dim', layer: L_NOTE });
      text(fig, left ? xh - 0.8 : xh + 0.8, (y0 + y1) / 2, label, dpt, left ? 'end' : 'start');
    }
  }
  const y = footer(fig, Hd, sc, len, o, ['copper', 'core', 'prepreg', 'mask', 'air']);
  fig.note = `cross-section of the ${st.kind} trace at true scale` + fig.note;
  // a dimension's text may stand above the drawing: the box grows to hold it
  return finish(fig, y, Math.max(0, ...fig.prims.map((p) => (p.t === 'text' ? textBox(p).y1 + 0.3 : 0))));
}

/** Below a board drawing: the scale bar, the map's colour bar, the key of what shows (with a map: the copper only). */
function footer(fig: Figure, Hd: number, sc: number, len: (mm: number) => string, o: BoardOptions, all: Role[], barNote = ''): number {
  let y = scaleBar(fig, -Hd - 1.5, sc, len, barNote);
  if (o.map) y = mapFooter(fig, y, o.map);
  if (o.legend !== false) {
    const shown = new Set<Role>();
    for (const p of fig.prims) if (p.layer === L_COPPER || (!o.map && p.layer === L_BACK)) shown.add(p.role === 'plane' ? 'copper' : p.role);
    y = legendRow(fig, y, all.filter((r) => shown.has(r)));
  }
  return y;
}

// ---------------------------------------------------------------------------------------------------------------
// The via

/** The via's side view: a cut along its section line (pairs: through both barrels), true scale. */
export function viaSideFigure(s: Stackup, v: ViaStructure, traceW: number, o: BoardOptions = {}): Figure {
  const g = sideGeom(s, v, traceW);
  if (!g.ok) throw new Error('the via cannot be drawn (check its layers and drill)');
  const fig = newFigure('via-side', 'via-side', o);
  const W = fig.width, pt = fig.fontPt;
  const len = o.len ?? mmText;
  const { x0, x1, y0, y1 } = g.box;
  const sc = W / (x1 - x0);
  const X = (x: number) => sc * (x - x0), Y = (yy: number) => -sc * (yy - y0); // y down from the board's top
  const Hd = sc * (y1 - y0);
  const clip = addClip(fig, { x0: 0, y0: -Hd, x1: W, y1: 0 });
  fig.world = { s: sc, ox: -sc * x0, oy: -sc * (g.thick - y0), clip, rect: { x0: 0, y0: -Hd, x1: W, y1: 0 } };
  rect(fig, 0, -Hd, W, 0, 'air', L_BACK, clip);
  const L = s.layers;
  for (const l of g.layers) {
    const up = L[l.i - 1], down = L[l.i + 1];
    let role: Role;
    if (l.kind === 'dielectric') role = dielectricRole(L[l.i]);
    else if (l.kind === 'mask') role = 'mask';
    else if (l.plane) role = dielectricRole(up?.kind === 'dielectric' ? up : down); // the plane's antipads show laminate
    else role = up?.kind === 'dielectric' && down?.kind === 'dielectric' ? dielectricRole(up) : up?.kind === 'mask' || down?.kind === 'mask' ? 'mask' : 'air'; // signal layers: the fill
    rect(fig, 0, Y(l.y1), W, Y(l.y0), role, L_BACK, clip);
  }
  // copper as fills without edges, so a pad on a plane shows no seam
  for (const c of g.copper) rect(fig, X(c.x0), Y(c.y1), X(c.x1), Y(c.y0), 'plane', L_COPPER, clip);
  for (const d of g.drilled) rect(fig, X(d.x0), Y(d.y1), X(d.x1), Y(d.y0), 'hole', L_COPPER, clip);
  const wall = g.barrels[0]?.wall ?? 0;
  const barrel = (cx: number, d: number, ya: number, yb: number, inCut: boolean, w: number) => {
    if (!inCut) { rect(fig, X(cx - d / 2), Y(yb), X(cx + d / 2), Y(ya), 'faded', L_COPPER, clip); return; }
    rect(fig, X(cx - d / 2), Y(yb), X(cx + d / 2), Y(ya), 'hole', L_COPPER, clip);
    if (w > 0) {
      rect(fig, X(cx - d / 2), Y(yb), X(cx - d / 2 + w), Y(ya), 'plane', L_COPPER, clip);
      rect(fig, X(cx + d / 2 - w), Y(yb), X(cx + d / 2), Y(ya), 'plane', L_COPPER, clip);
    }
  };
  for (const r of g.returns) barrel(r.s, r.d, r.y0, r.y1, r.inCut, wall);
  for (const b of g.barrels) barrel(b.s, b.d, b.y0, b.y1, b.inCut, b.wall);
  for (const b of g.barrels) if (b.name) text(fig, X(b.s), Y(y0 + g.air / 2), b.name, pt, 'middle');
  if (o.map) addMap(fig, o.map);
  const y = footer(fig, Hd, sc, len, o, ['copper', 'core', 'prepreg', 'mask', 'air', 'hole', 'faded']);
  fig.note = `via side view along its section line, true scale${v.pitch ? ' (a pair)' : ''}` + fig.note;
  return finish(fig, y);
}

/** Points of a circle as a polygon (n points). */
function circlePts(cx: number, cy: number, r: number, from: number, to: number, n: number): number[] {
  const out: number[] = [];
  for (let i = 0; i <= n; i++) { const a = from + ((to - from) * i) / n; out.push(cx + r * Math.cos(a), cy + r * Math.sin(a)); }
  return out;
}

/** The via's top view: the plane cut by the antipads, pads, drills, return vias, feeds and the side view's line. */
export function viaTopFigure(s: Stackup, v: ViaStructure, traceW: number, o: BoardOptions = {}): Figure {
  const g = topGeom(s, v, traceW);
  const fig = newFigure('via-top', 'via-top', o);
  const W = fig.width, pt = fig.fontPt;
  const len = o.len ?? mmText;
  const { x0, x1 } = g.box;
  const yb0 = -g.box.y1, yb1 = -g.box.y0; // board y (up)
  const sc = W / (x1 - x0);
  const X = (x: number) => sc * (x - x0), Y = (yb: number) => sc * (yb - yb1);
  const Hd = sc * (yb1 - yb0);
  const clip = addClip(fig, { x0: 0, y0: -Hd, x1: W, y1: 0 });
  fig.world = { s: sc, ox: -sc * x0, oy: -sc * yb1, clip, rect: { x0: 0, y0: -Hd, x1: W, y1: 0 } };
  const iS = layerIndex(s, v.start), iE = layerIndex(s, v.end);
  const lam = dielectricRole(s.layers.slice(Math.max(0, iS), iE + 1).find((l) => l.kind === 'dielectric'));
  rect(fig, 0, -Hd, W, 0, v.planes.length ? 'plane' : lam, L_BACK, clip);
  const seen = new Set<string>();
  for (const ap of v.antipads) {
    const i = layerIndex(s, ap.layer);
    const r = ap.d?.v / 2;
    if (i < iS || i > iE || !(r > 0)) continue;
    const key = `${ap.shape}|${r}|${ap.bridge?.v ?? 0}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const p = v.pitch ? v.pitch.v : 0;
    if (!p) { fig.prims.push({ t: 'circle', cx: X(0), cy: Y(0), r: r * sc, role: lam, layer: L_BACK, clip }); continue; }
    if (ap.shape === 'oblong') {
      const a = circlePts(0, p, r, 0, Math.PI, 48), b = circlePts(0, 0, r, Math.PI, 2 * Math.PI, 48);
      const pts: number[] = [];
      for (let k = 0; k < a.length; k += 2) pts.push(X(a[k]), Y(a[k + 1]));
      for (let k = 0; k < b.length; k += 2) pts.push(X(b[k]), Y(b[k + 1]));
      poly(fig, pts, true, lam, L_BACK, clip);
      continue;
    }
    fig.prims.push({ t: 'circle', cx: X(0), cy: Y(0), r: r * sc, role: lam, layer: L_BACK, clip });
    fig.prims.push({ t: 'circle', cx: X(0), cy: Y(p), r: r * sc, role: lam, layer: L_BACK, clip });
    if (ap.shape === 'joined' && ap.bridge?.v > 0) rect(fig, X(-ap.bridge.v / 2), Y(0), X(ap.bridge.v / 2), Y(p), lam, L_BACK, clip);
  }
  for (const f of g.feeds) {
    const fx0 = X(f.x0), fy0 = Y(-f.y0), fx1 = X(f.x1), fy1 = Y(-f.y1);
    const dl = Math.hypot(fx1 - fx0, fy1 - fy0);
    if (!(dl > 0)) continue;
    const nx = (-(fy1 - fy0) / dl) * (f.w * sc) / 2, ny = ((fx1 - fx0) / dl) * (f.w * sc) / 2;
    poly(fig, [fx0 + nx, fy0 + ny, fx1 + nx, fy1 + ny, fx1 - nx, fy1 - ny, fx0 - nx, fy0 - ny], true, 'copper', L_COPPER, clip);
  }
  const via = (cx: number, cy: number, pad: number, drill: number) => {
    if (pad > drill) fig.prims.push({ t: 'circle', cx: X(cx), cy: Y(cy), r: (pad / 2) * sc, role: 'copper', layer: L_COPPER, clip });
    if (drill > 0) fig.prims.push({ t: 'circle', cx: X(cx), cy: Y(cy), r: (drill / 2) * sc, role: 'hole', layer: L_COPPER, clip });
  };
  for (const r of g.returns) via(r.x, -r.y, r.pad, r.drill);
  for (const b of g.barrels) via(b.x, -b.y, b.pad, b.drill);
  poly(fig, [X(g.cut.x0), Y(-g.cut.y0), X(g.cut.x1), Y(-g.cut.y1)], false, 'cut', L_NOTE, clip);
  for (const b of g.barrels) if (b.name) text(fig, X(b.x) + (b.pad / 2) * sc + 1.2, Y(-b.y), b.name, pt, 'start', 'ink', L_NOTE);
  if (o.map) addMap(fig, o.map);
  const y = footer(fig, Hd, sc, len, o, ['copper', 'core', 'prepreg', 'hole'], 'dashed: the side view’s line');
  fig.note = `via top view between the planes${v.pitch ? ' (a pair)' : ''}, true scale` + fig.note;
  return finish(fig, y);
}

export { finish, rect, poly };
