// A plot as a figure (step M8.1a): any plot of lib/emsim/plot.ts (sweeps, TDR and TDT, S-parameters) as plain paths
// with its frame, ticks, tick labels, axis labels, reference lines and a legend; no pgfplots. Ticks are plot.ts's
// (1-2-5 or decades), the series cut to the frame (a NaN breaks a line, as on the page).

import type { Axis } from '../plot';
import { frac, ticks, tickText } from '../plot';
import { L_BACK, L_NOTE, L_OVER, addClip, clipPolyline, emMm, newFigure, text, textWidth } from './model';
import type { Figure, FigureOptions } from './model';
import { paintOf } from './style';

export interface PlotAxisSpec extends Axis { label: string; k?: number /* tick labels show v·k (s → ns: 1e9) */ }
export interface PlotSeriesSpec { xs: ArrayLike<number>; ys: ArrayLike<number>; label?: string }
export interface PlotSpec {
  x: PlotAxisSpec;
  y: PlotAxisSpec;
  series: PlotSeriesSpec[];
  refs?: { x?: number; y?: number; label?: string }[]; // dashed lines across (y) or up (x)
  name?: string; // file name ("tdr", "s-params" …)
  what?: string; // for the TikZ head
}

export interface PlotFigureOptions extends FigureOptions { height?: number /* mm; default 0.62 × width */ }

export function plotFigure(spec: PlotSpec, o: PlotFigureOptions = {}): Figure {
  const fig = newFigure('plot', spec.name ?? 'plot', o);
  const W = fig.width, H = Math.max(30, o.height ?? 0.62 * W);
  const pt = fig.fontPt, tpt = Math.max(6, pt - 1), em = emMm(pt), tem = emMm(tpt);
  const k = (a: PlotAxisSpec) => a.k ?? 1;
  // legend on top when any series has a label
  const labelled = spec.series.some((s) => s.label);
  const SAMPLE = 6;
  let top = 1.2 + 0.35 * tem;
  const legend: { x: number; y: number; i: number; label: string }[] = [];
  if (labelled) {
    let x = 0, row = 0;
    spec.series.forEach((s, i) => {
      const label = s.label ?? `series ${i + 1}`;
      const w = SAMPLE + 1 + textWidth(label, tpt) + 3;
      if (x > 0 && x + w > W) { x = 0; row++; }
      legend.push({ x, y: row, i, label });
      x += w;
    });
    top = (legend[legend.length - 1].y + 1) * 1.5 * tem + 1.2 + 0.5 * tem;
  }
  // margins from the tick labels
  const ty0 = ticks(spec.y, Math.max(2, Math.round(H / 10)));
  const yLabels = ty0.map((v) => tickText(v, ty0, spec.y.log, k(spec.y)));
  const left = Math.max(0, ...yLabels.map((s) => textWidth(s, tpt))) + 1.4 + em + 1;
  const bottom = tem + 1.4 + em + 1.2;
  const tx0 = ticks(spec.x, Math.max(2, Math.round((W - left) / 18)));
  const xLabels = tx0.map((v) => tickText(v, tx0, spec.x.log, k(spec.x)));
  const right = Math.max(1.5, xLabels.length ? textWidth(xLabels[xLabels.length - 1], tpt) / 2 + 0.3 : 0);
  const F = { x0: left, y0: bottom, x1: W - right, y1: H - top };
  const clip = addClip(fig, F);
  const PX = (v: number) => F.x0 + frac(v, spec.x) * (F.x1 - F.x0), PY = (v: number) => F.y0 + frac(v, spec.y) * (F.y1 - F.y0);
  const grid: number[] = [], tick: number[] = [];
  let lastX = -Infinity;
  tx0.forEach((v, i) => {
    const x = PX(v);
    if (!(x >= F.x0 - 1e-9 && x <= F.x1 + 1e-9)) return;
    if (x > F.x0 + 1e-6 && x < F.x1 - 1e-6) grid.push(x, F.y0, x, F.y1);
    tick.push(x, F.y0, x, F.y0 + 1);
    const tw = textWidth(xLabels[i], tpt);
    if (x - tw / 2 < lastX + 1) return;
    text(fig, x, F.y0 - 1.4 - 0.35 * tem, xLabels[i], tpt, 'middle');
    lastX = x + tw / 2;
  });
  let lastY = -Infinity;
  ty0.forEach((v, i) => {
    const y = PY(v);
    if (!(y >= F.y0 - 1e-9 && y <= F.y1 + 1e-9)) return;
    if (y > F.y0 + 1e-6 && y < F.y1 - 1e-6) grid.push(F.x0, y, F.x1, y);
    tick.push(F.x0, y, F.x0 + 1, y);
    if (y - 0.35 * tem < lastY + 0.6) return;
    text(fig, F.x0 - 1.4, y, yLabels[i], tpt, 'end');
    lastY = y + 0.35 * tem;
  });
  if (grid.length && paintOf(fig.colour, 'grid').stroke) fig.prims.push({ t: 'segs', s: grid, role: 'grid', layer: L_BACK });
  if (tick.length) fig.prims.push({ t: 'segs', s: tick, role: 'frame', layer: L_NOTE });
  fig.prims.push({ t: 'rect', x: F.x0, y: F.y0, w: F.x1 - F.x0, h: F.y1 - F.y0, role: 'frame', layer: L_NOTE });
  text(fig, (F.x0 + F.x1) / 2, 0.6 + 0.35 * em, spec.x.label, pt, 'middle');
  text(fig, 0.6 + 0.35 * em, (F.y0 + F.y1) / 2, spec.y.label, pt, 'middle', 'ink', L_NOTE, 90);
  for (const r of spec.refs ?? []) {
    if (r.y !== undefined && Number.isFinite(r.y)) {
      const y = PY(r.y);
      if (y < F.y0 || y > F.y1) continue;
      fig.prims.push({ t: 'poly', pts: [F.x0, y, F.x1, y], closed: false, role: 'ref', layer: L_BACK });
      if (r.label) text(fig, F.x1 - 1, y + 0.6 + 0.35 * tem > F.y1 - 0.4 * tem ? y - 0.6 - 0.35 * tem : y + 0.6 + 0.35 * tem, r.label, tpt, 'end', 'muted');
    } else if (r.x !== undefined && Number.isFinite(r.x)) {
      const x = PX(r.x);
      if (x < F.x0 || x > F.x1) continue;
      fig.prims.push({ t: 'poly', pts: [x, F.y0, x, F.y1], closed: false, role: 'ref', layer: L_BACK });
      if (r.label) text(fig, x - 0.8, F.y1 - 0.6 - 0.35 * tem, r.label, tpt, 'end', 'muted');
    }
  }
  spec.series.forEach((s, i) => {
    const n = Math.min(s.xs.length, s.ys.length);
    const pts: number[] = new Array(2 * n);
    for (let j = 0; j < n; j++) {
      const x = s.xs[j], y = s.ys[j];
      const ok = Number.isFinite(x) && Number.isFinite(y) && (!spec.x.log || x > 0) && (!spec.y.log || y > 0);
      pts[2 * j] = ok ? PX(x) : NaN; pts[2 * j + 1] = ok ? PY(y) : NaN;
    }
    for (const run of clipPolyline(pts, F)) fig.prims.push({ t: 'poly', pts: run, closed: false, role: 'series', index: i, layer: L_OVER, clip });
  });
  for (const l of legend) {
    const y = H - 0.6 - (l.y + 0.5) * 1.5 * tem;
    fig.prims.push({ t: 'poly', pts: [l.x, y, l.x + SAMPLE, y], closed: false, role: 'series', index: l.i, layer: L_NOTE });
    text(fig, l.x + SAMPLE + 1, y, l.label, tpt, 'start');
  }
  fig.height = H;
  fig.box = { x0: 0, y0: 0, x1: W, y1: H };
  fig.note = spec.what ?? 'plot';
  return fig;
}
