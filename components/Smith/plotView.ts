// The sweep's plot (step M7.2b): return loss (downward from 0 dB, so a match is a dip) or VSWR (upward from 1) against
// frequency, in SVG (vectors, for M7.3's print and M8's export). Framework-free, like traceLayer.ts, which feeds it as
// a PlotSink in its own frames: during a handle's drag the coarse trace of the live circuit (its `d` written here, at
// most the trace's own COARSE_MS budget of points), after the release the refined trace with the `d` the worker wrote.
//
// Drawing. The polyline is one `d` of whole numbers in plot.ts's frame (x: place in the band × PLOT_X, y: value ×
// PLOT_Y) under a group transform that maps it to pixels, so a resize or a new value axis sets one attribute and never
// rewrites the `d`. The value axis follows the refined trace's figures (best return loss, largest VSWR) and the limit;
// it stays as it is during a drag. The f0 line, the limit line and the intervals below the limit (shaded; hidden while
// the trace is coarse, since they come from the refined trace's figures) are pixels, rewritten with the axes.
//
// Linking. Pointing at the plot (hover, a tap, a finger moved sideways, the arrow keys) sets the trace layer's cursor,
// which both views draw; pointing at the trace on the chart sets the same cursor. Markers are the trace layer's: a
// press near one here drags it along the band (both views follow), a tap or click on the curve adds one there.

import { formatAmount } from '../../lib/quantity';
import { magFromReturnLoss, vswr } from '../../lib/smith/convert';
import { PLOT_X, PLOT_Y, bandFreq, bandPos, freqTicks, plotPath, plotValue, rlAxis, vswrAxis } from '../../lib/smith/plot';
import type { PlotPaths, ValueAxis } from '../../lib/smith/plot';
import { MAX_MARKERS } from '../../lib/smith/state';
import { nearestIndex, segmentAt } from '../../lib/smith/sweep';
import type { BandFigures, Trace } from '../../lib/smith/sweep';
import { CURSOR_PLOT, TraceLayer, stepAlong } from './traceLayer';
import type { PlotSink } from './traceLayer';

const SVG_NS = 'http://www.w3.org/2000/svg';
/** Margins of the plot area in the svg (px): room for the value labels on the left and the frequency labels below. */
const ML = 42, MR = 14, MT = 20, MB = 24;
/** A press this near a marker's dot (px) takes it; a tap or click this near the curve (px, vertically) adds one. */
export const PLOT_MARKER_PX = 22;
export const PLOT_PICK_PX = 12;
const MOUSE_SLOP = 3;
const TOUCH_SLOP = 10;
const TAP_MS = 500;
/** Pixels per frequency label, for the number of ticks. */
const TICK_PX = 84;

let uid = 0;

const el = <K extends keyof SVGElementTagNameMap>(name: K, attrs: Record<string, string | number> = {}): SVGElementTagNameMap[K] => {
  const e = document.createElementNS(SVG_NS, name);
  for (const k in attrs) e.setAttribute(k, String(attrs[k]));
  return e;
};

/** A frequency tick's label with as few digits as tell it from its neighbours. */
function tickText(f: number, step: number): string {
  if (f === 0) return '0';
  const digits = Math.min(8, Math.max(2, Math.ceil(Math.log10(Math.abs(f) / step) - 1e-9) + 1));
  return formatAmount(f, 'Hz', digits);
}

export class PlotView implements PlotSink {
  readonly box: HTMLElement;
  /** The element whose `data-state` (none, coarse, full) the plot sets: the plot and the figures under it. */
  readonly root: HTMLElement;
  readonly layer: TraceLayer;
  /** For the harness: frames that drew a coarse trace, their last and total script (ms), the points drawn. */
  frames = 0; lastMs = 0; ms = 0; lastN = 0;

  isVswr = false;
  limitRL = 10;
  /** The plot area in svg px, and the axes. */
  L = ML; T = MT; W = 0; H = 0;
  axis: ValueAxis = { top: 0, bottom: 30, ticks: [] };
  start = 0; stop = 1; log = false; f0 = NaN;
  /** The trace drawn (its arrays as given: read them before the trace layer's next frame). */
  shown: Trace | null = null;
  full = false;
  private paths: PlotPaths | null = null;
  private figs: BandFigures | null = null;
  private axisFromFigures = false;

  private readonly svg: SVGSVGElement;
  private readonly clipRect: SVGRectElement;
  private readonly shade: SVGGElement;
  private readonly grid: SVGGElement;
  private readonly frameG: SVGGElement;
  private readonly line: SVGPathElement;
  private readonly f0Line: SVGLineElement;
  private readonly limitLine: SVGLineElement;
  private readonly unit: SVGTextElement;
  private readonly marksG: SVGGElement;
  private readonly cursorG: SVGGElement;
  private readonly cursorLine: SVGLineElement;
  private readonly cursorDot: SVGCircleElement;
  private readonly cursorText: SVGTextElement;
  private markEls: SVGGElement[] = [];
  /** Markers: frequency, svg px of the dot (NaN when off the plot). */
  markF: number[] = [];
  private mx: number[] = [];
  private my: number[] = [];
  cursorF = NaN;
  private cursorMag = NaN;
  private readonly ro: ResizeObserver | null;

  // A press: marker dragged (−1 none), where it started, whether it moved, the grab's offset.
  private drag = -1;
  private pid = -1;
  private downX = 0; private downY = 0; private downT = 0; private moved = false; private slop = MOUSE_SLOP; private offX = 0;
  private touch = false;

  constructor(box: HTMLElement, root: HTMLElement, trace: TraceLayer) {
    this.box = box;
    this.root = root;
    this.layer = trace;
    const id = `smith-plot-clip-${++uid}`;
    this.svg = el('svg', { 'data-plot-svg': '', 'aria-hidden': 'true' });
    const defs = el('defs'), clip = el('clipPath', { id });
    this.clipRect = el('rect');
    clip.appendChild(this.clipRect);
    defs.appendChild(clip);
    this.shade = el('g', { 'data-plot-shade': '' });
    this.grid = el('g', { 'data-plot-grid': '' });
    this.limitLine = el('line', { 'data-plot-limit': '' });
    this.f0Line = el('line', { 'data-plot-f0': '' });
    const clipped = el('g', { 'clip-path': `url(#${id})` });
    this.frameG = el('g', { 'data-plot-frame': '' });
    this.line = el('path', { 'data-plot-trace': '', d: '' });
    this.frameG.appendChild(this.line);
    clipped.appendChild(this.frameG);
    this.unit = el('text', { 'data-plot-unit': '', x: 4, y: 13 });
    this.cursorG = el('g', { 'data-plot-cursor': '', display: 'none' });
    this.cursorLine = el('line', { 'data-plot-cursor-line': '' });
    this.cursorDot = el('circle', { r: 4.5 });
    this.cursorText = el('text', { 'data-plot-cursor-text': '' });
    this.cursorG.append(this.cursorLine, this.cursorDot, this.cursorText);
    this.marksG = el('g', { 'data-plot-marks': '' });
    this.svg.append(defs, this.shade, this.grid, this.limitLine, this.f0Line, clipped, this.unit, this.cursorG, this.marksG);
    box.appendChild(this.svg);
    root.setAttribute('data-state', 'none');

    box.addEventListener('pointerdown', this.down);
    box.addEventListener('pointermove', this.move);
    box.addEventListener('pointerup', this.up);
    box.addEventListener('pointercancel', this.cancel);
    box.addEventListener('pointerleave', this.leave);
    box.addEventListener('keydown', this.key);
    box.addEventListener('touchstart', this.touchStart, { passive: false });
    this.ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => this.resize());
    this.ro?.observe(box);
    this.resize();
    trace.attachPlot(this);
  }

  destroy(): void {
    this.ro?.disconnect();
    if (this.layer.plot === this) this.layer.attachPlot(null);
    if (this.layer.cursorFrom === CURSOR_PLOT) this.layer.setCursor(NaN, CURSOR_PLOT);
    this.svg.remove();
  }

  /**
   * M7.3: a copy of the plot laid out again at w × h px (axes, ticks, lines and markers for that size; the trace's `d`
   * is the same, under the new frame transform), for the printed report: no cursor, a clip path of its own, scaled by
   * its viewBox. The plot on the page is laid out back at once, before any paint.
   */
  printCopy(w: number, h: number): SVGSVGElement {
    const W = this.W, H = this.H;
    this.W = Math.max(10, w - ML - MR);
    this.H = Math.max(10, h - MT - MB);
    this.layout();
    this.writeMarks();
    const copy = this.svg.cloneNode(true) as SVGSVGElement;
    this.W = W;
    this.H = H;
    this.layout();
    this.writeMarks();
    copy.querySelector('[data-plot-cursor]')?.remove();
    const clip = copy.querySelector('clipPath'), id = `${clip.id}-print`;
    clip.id = id;
    copy.querySelector('[clip-path]').setAttribute('clip-path', `url(#${id})`);
    copy.setAttribute('viewBox', `0 0 ${w} ${h}`);
    copy.setAttribute('width', '100%');
    copy.setAttribute('height', '100%');
    copy.removeAttribute('data-plot-svg');
    copy.setAttribute('data-print-plot', '');
    return copy;
  }

  // ---------- options from the page ----------

  /** Return loss or VSWR, and the limit (return loss in dB). */
  setOptions(isVswr: boolean, limitRL: number): void {
    if (isVswr === this.isVswr && limitRL === this.limitRL) return;
    const modeChanged = isVswr !== this.isVswr;
    this.isVswr = isVswr;
    this.limitRL = limitRL;
    this.unit.textContent = isVswr ? 'VSWR' : 'RL dB';
    if (modeChanged && this.shown) {
      this.line.setAttribute('d', this.full && this.paths ? (isVswr ? this.paths.vswr : this.paths.rl) : this.pathOf(this.shown));
    }
    this.fitAxis();
    this.layout();
    this.writeMarks();
  }

  // ---------- PlotSink: from the trace layer ----------

  trace(tr: Trace, full: boolean, paths: PlotPaths | null, f0: number): void {
    const t0 = performance.now();
    const bandChanged = tr.start !== this.start || tr.stop !== this.stop || tr.log !== this.log || !this.shown;
    this.start = tr.start; this.stop = tr.stop; this.log = tr.log;
    const f0Changed = !Object.is(f0, this.f0);
    this.f0 = f0;
    this.shown = tr;
    this.full = full;
    this.paths = full ? paths : null;
    this.line.setAttribute('d', this.paths ? (this.isVswr ? this.paths.vswr : this.paths.rl) : this.pathOf(tr));
    const state = full ? 'full' : 'coarse';
    if (this.root.getAttribute('data-state') !== state) { this.root.setAttribute('data-state', state); this.line.setAttribute('data-state', state); }
    if (!full && !this.axisFromFigures && (bandChanged || this.axis.ticks.length === 0)) this.fitAxis();
    if (bandChanged || f0Changed) this.layout();
    if (!full) {
      const ms = performance.now() - t0;
      this.frames++; this.lastMs = ms; this.ms += ms; this.lastN = tr.n;
    }
  }

  marks(markers: readonly number[], mg: Float64Array, cursor: number, cr: number, ci: number): void {
    const n = markers.length;
    while (this.markEls.length > n) { this.markEls.pop()!.remove(); this.markF.pop(); this.mx.pop(); this.my.pop(); }
    while (this.markEls.length < n) {
      const i = this.markEls.length;
      const g = el('g', { 'data-plot-marker': i });
      const c = el('circle', { r: 5 }), t = el('text', { y: -9 });
      t.textContent = `M${i + 1}`;
      g.append(c, t);
      this.marksG.appendChild(g);
      this.markEls.push(g);
      this.markF.push(NaN); this.mx.push(NaN); this.my.push(NaN);
    }
    for (let m = 0; m < n; m++) {
      this.markF[m] = markers[m];
      const gr = mg[2 * m], gi = mg[2 * m + 1];
      this.my[m] = Math.sqrt(gr * gr + gi * gi);
    }
    this.cursorF = cursor;
    this.cursorMag = cursor === cursor ? Math.sqrt(cr * cr + ci * ci) : NaN;
    this.writeMarks();
  }

  figures(f: BandFigures | null): void {
    this.figs = f;
    this.axisFromFigures = false;
    this.fitAxis();
    this.layout();
    this.writeMarks();
  }

  clear(): void {
    this.shown = null;
    this.paths = null;
    this.figs = null;
    this.axisFromFigures = false;
    this.line.setAttribute('d', '');
    this.root.setAttribute('data-state', 'none');
    this.marks([], new Float64Array(0), NaN, 0, 0);
  }

  // ---------- drawing ----------

  private pathOf(tr: Trace): string {
    return plotPath(tr.freqs, tr.gamma, tr.n, tr.start, tr.stop, tr.log, this.isVswr);
  }

  /** The value axis from the refined trace's figures (else a scan of the trace shown) and the limit. */
  private fitAxis(): void {
    const f = this.figs, limMag = magFromReturnLoss(this.limitRL);
    let best = NaN, worst = NaN;
    if (f) { best = f.bestRL; worst = f.maxVswr; this.axisFromFigures = true; }
    else if (this.shown) {
      const g = this.shown.gamma, n = this.shown.n;
      let lo = Infinity, hi = 0;
      for (let i = 0, o = 0; i < n; i++, o += 2) {
        const m2 = g[o] * g[o] + g[o + 1] * g[o + 1];
        if (m2 < lo) lo = m2;
        if (m2 > hi) hi = m2;
      }
      best = plotValue(Math.sqrt(lo), false);
      worst = vswr(Math.sqrt(hi));
    }
    this.axis = this.isVswr ? vswrAxis(worst, vswr(limMag)) : rlAxis(best, this.limitRL);
  }

  private resize(): void {
    const w = this.box.clientWidth, h = this.box.clientHeight;
    if (!(w > 0 && h > 0)) return;
    this.svg.setAttribute('width', String(w));
    this.svg.setAttribute('height', String(h));
    this.svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    this.W = Math.max(10, w - ML - MR);
    this.H = Math.max(10, h - MT - MB);
    this.layout();
    this.writeMarks();
  }

  /** svg px of a frequency, and of a value. */
  px(f: number): number { return this.L + bandPos(f, this.start, this.stop, this.log) * this.W; }
  py(v: number): number { const a = this.axis; return this.T + ((v - a.top) / (a.bottom - a.top)) * this.H; }
  /** The frequency at svg px x (clamped to the band). */
  fAt(x: number): number {
    const u = (x - this.L) / this.W;
    return bandFreq(u < 0 ? 0 : u > 1 ? 1 : u, this.start, this.stop, this.log);
  }

  /** The axes, grid, f0 and limit lines, the shading, the frame transform: on a resize, a new axis, band or limit. */
  private layout(): void {
    const { L, T, W, H } = this, a = this.axis;
    if (!(W > 0)) return;
    this.clipRect.setAttribute('x', String(L - 1));
    this.clipRect.setAttribute('y', String(T - 1));
    this.clipRect.setAttribute('width', String(W + 2));
    this.clipRect.setAttribute('height', String(H + 2));
    const sy = H / ((a.bottom - a.top) * PLOT_Y), ty = T - (a.top * H) / (a.bottom - a.top);
    this.frameG.setAttribute('transform', `matrix(${W / PLOT_X} 0 0 ${sy} ${L} ${ty})`);
    this.unit.textContent = this.isVswr ? 'VSWR' : 'RL dB';

    // The grid: value lines and labels, frequency lines and labels, the plot's frame.
    const g = this.grid;
    while (g.firstChild) g.firstChild.remove();
    for (const v of a.ticks) {
      const y = Math.round(this.py(v)) + 0.5;
      g.appendChild(el('line', { x1: L, x2: L + W, y1: y, y2: y, 'data-major': v === a.top || v === a.bottom ? '1' : '0' }));
      const t = el('text', { x: L - 6, y: y + 4, 'text-anchor': 'end' });
      t.textContent = String(v);
      g.appendChild(t);
    }
    if (this.shown) {
      const ticks = freqTicks(this.start, this.stop, this.log, Math.max(2, Math.floor(W / TICK_PX)));
      const step = ticks.length > 1 ? Math.abs(ticks[1] - ticks[0]) : this.stop - this.start;
      for (let i = 0; i < ticks.length; i++) {
        const f = ticks[i], x = Math.round(this.px(f)) + 0.5;
        g.appendChild(el('line', { x1: x, x2: x, y1: T, y2: T + H, 'data-major': '0' }));
        const t = el('text', { x, y: T + H + 16, 'text-anchor': x < L + 24 ? 'start' : x > L + W - 24 ? 'end' : 'middle', 'data-f': f });
        t.textContent = tickText(f, this.log ? f / 2 : step);
        g.appendChild(t);
      }
    }
    g.appendChild(el('rect', { x: L + 0.5, y: T + 0.5, width: W - 1, height: H - 1, 'data-plot-box': '' }));

    // f0 and the limit.
    const f0 = this.f0, on0 = this.shown !== null && f0 >= this.start && f0 <= this.stop;
    this.f0Line.setAttribute('display', on0 ? 'inline' : 'none');
    if (on0) { const x = this.px(f0); this.f0Line.setAttribute('x1', String(x)); this.f0Line.setAttribute('x2', String(x)); this.f0Line.setAttribute('y1', String(T)); this.f0Line.setAttribute('y2', String(T + H)); }
    const lv = plotValue(magFromReturnLoss(this.limitRL), this.isVswr), ly = this.py(lv);
    const onL = this.shown !== null && ly >= T && ly <= T + H;
    this.limitLine.setAttribute('display', onL ? 'inline' : 'none');
    if (onL) { this.limitLine.setAttribute('x1', String(L)); this.limitLine.setAttribute('x2', String(L + W)); this.limitLine.setAttribute('y1', String(ly)); this.limitLine.setAttribute('y2', String(ly)); }
    this.limitLine.setAttribute('data-value', String(lv));

    // The intervals below the limit.
    const s = this.shade;
    while (s.firstChild) s.firstChild.remove();
    const fig = this.figs;
    if (fig && this.shown) for (const iv of fig.intervals) {
      const x0 = this.px(iv.lo), x1 = this.px(iv.hi);
      s.appendChild(el('rect', { x: x0, y: T, width: Math.max(1, x1 - x0), height: H, 'data-lo': iv.lo, 'data-hi': iv.hi }));
    }
  }

  /** The markers' dots and the cursor, in svg px. */
  private writeMarks(): void {
    const { L, T, W, H } = this;
    for (let m = 0; m < this.markEls.length; m++) {
      const f = this.markF[m], x = this.px(f), v = plotValue(this.my[m], this.isVswr);
      const y = Math.min(T + H, Math.max(T, this.py(v)));
      const on = this.shown !== null && x === x && y === y && W > 0;
      this.mx[m] = on ? x : NaN;
      const g = this.markEls[m];
      g.setAttribute('display', on ? 'inline' : 'none');
      if (on) g.setAttribute('transform', `translate(${x} ${y})`);
      g.setAttribute('data-f', String(f));
      g.setAttribute('data-value', String(v));
    }
    const cf = this.cursorF, on = cf === cf && this.shown !== null && W > 0;
    this.cursorG.setAttribute('display', on ? 'inline' : 'none');
    this.cursorG.setAttribute('data-f', String(cf));
    if (!on) return;
    const x = this.px(cf), v = plotValue(this.cursorMag, this.isVswr), y = Math.min(T + H, Math.max(T, this.py(v)));
    this.cursorG.setAttribute('data-value', String(v));
    this.cursorLine.setAttribute('x1', String(x)); this.cursorLine.setAttribute('x2', String(x));
    this.cursorLine.setAttribute('y1', String(T)); this.cursorLine.setAttribute('y2', String(T + H));
    this.cursorDot.setAttribute('cx', String(x)); this.cursorDot.setAttribute('cy', String(y));
    const right = x > L + W / 2;
    this.cursorText.setAttribute('x', String(right ? x - 6 : x + 6));
    this.cursorText.setAttribute('y', String(T + 12));
    this.cursorText.setAttribute('text-anchor', right ? 'end' : 'start');
    this.cursorText.textContent = `${formatAmount(cf, 'Hz', 5)} · ${this.isVswr ? formatAmount(v, '', 4) : `${formatAmount(v, '', 4)} dB`}`;
  }

  // ---------- pointing ----------

  /** svg px of a pointer event. */
  private local(e: { clientX: number; clientY: number }): [number, number] {
    const r = this.svg.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }

  private inside(x: number, y: number): boolean {
    return x >= this.L - 8 && x <= this.L + this.W + 8 && y >= this.T - 8 && y <= this.T + this.H + 8;
  }

  /** The marker whose dot is nearest (x, y) within PLOT_MARKER_PX, else −1. */
  markerHit(x: number, y: number): number {
    let best = -1, bd = PLOT_MARKER_PX;
    for (let m = 0; m < this.markEls.length; m++) {
      const mx = this.mx[m];
      if (mx !== mx) continue;
      const my = Math.min(this.T + this.H, Math.max(this.T, this.py(plotValue(this.my[m], this.isVswr))));
      const d = Math.hypot(mx - x, my - y);
      if (d < bd) { bd = d; best = m; }
    }
    return best;
  }

  /** Whether (x, y) is within PLOT_PICK_PX of the curve, vertically (the shown trace, linear between its points). */
  nearCurve(x: number, y: number): boolean {
    const tr = this.shown;
    if (!tr || tr.n < 2) return false;
    const f = this.fAt(x), s = segmentAt(tr, f), fr = tr.freqs, g = tr.gamma;
    const u0 = bandPos(fr[s], this.start, this.stop, this.log), u1 = bandPos(fr[s + 1], this.start, this.stop, this.log);
    const t = u1 > u0 ? (bandPos(f, this.start, this.stop, this.log) - u0) / (u1 - u0) : 0;
    const v0 = plotValue(Math.hypot(g[2 * s], g[2 * s + 1]), this.isVswr), v1 = plotValue(Math.hypot(g[2 * s + 2], g[2 * s + 3]), this.isVswr);
    const yc = Math.min(this.T + this.H, Math.max(this.T, this.py(v0 + (v1 - v0) * t)));
    return Math.abs(yc - y) <= PLOT_PICK_PX;
  }

  private readonly touchStart = (e: TouchEvent): void => {
    // A finger on a marker drags it (not a page scroll).
    if (e.touches.length !== 1) return;
    const [x, y] = this.local(e.touches[0]);
    if (this.markerHit(x, y) >= 0) e.preventDefault();
  };

  private readonly down = (e: PointerEvent): void => {
    if (e.button !== 0 || this.pid >= 0 || !this.shown) return;
    const [x, y] = this.local(e);
    if (!this.inside(x, y)) return;
    this.pid = e.pointerId;
    this.touch = e.pointerType === 'touch';
    this.slop = this.touch ? TOUCH_SLOP : MOUSE_SLOP;
    this.downX = x; this.downY = y; this.downT = e.timeStamp; this.moved = false;
    this.drag = this.markerHit(x, y);
    if (this.drag >= 0) {
      this.offX = x - this.mx[this.drag];
      this.box.setAttribute('data-plot-drag', '');
      try { this.box.setPointerCapture(e.pointerId); } catch { /* gone */ }
      e.preventDefault();
    }
  };

  private readonly move = (e: PointerEvent): void => {
    const [x, y] = this.local(e);
    if (e.pointerId === this.pid) {
      if (!this.moved && Math.abs(x - this.downX) + Math.abs(y - this.downY) <= this.slop) return;
      this.moved = true;
      if (this.drag >= 0) { this.layer.moveMarker(this.drag, this.fAt(x - this.offX), false); this.layer.setCursor(this.fAt(x - this.offX), CURSOR_PLOT); return; }
      // A finger moved sideways (a vertical move is the page's scroll): the cursor follows it.
      this.layer.setCursor(this.fAt(x), CURSOR_PLOT);
      return;
    }
    if (e.pointerType === 'touch' || this.pid >= 0 || !this.shown) return;
    const m = this.inside(x, y) ? this.markerHit(x, y) : -1;
    this.box.toggleAttribute('data-plot-hot', m >= 0);
    this.box.toggleAttribute('data-plot-near', m < 0 && this.layer.markerFreqs.length < MAX_MARKERS && this.inside(x, y) && this.nearCurve(x, y));
    if (this.inside(x, y)) this.layer.setCursor(m >= 0 ? this.markF[m] : this.fAt(x), CURSOR_PLOT);
    else if (this.layer.cursorFrom === CURSOR_PLOT) this.layer.setCursor(NaN, CURSOR_PLOT);
  };

  private readonly up = (e: PointerEvent): void => {
    if (e.pointerId !== this.pid) return;
    const [x, y] = this.local(e);
    const m = this.drag;
    this.pid = -1;
    this.drag = -1;
    this.box.removeAttribute('data-plot-drag');
    if (m >= 0) {
      if (this.moved) this.layer.moveMarker(m, this.fAt(x - this.offX), true);
      else this.layer.setCursor(this.markF[m], CURSOR_PLOT);
      return;
    }
    if (this.moved || e.timeStamp - this.downT > TAP_MS) return;
    // A tap or click: the cursor there, and a marker when it is on the curve.
    const f = this.fAt(x);
    this.layer.setCursor(f, CURSOR_PLOT);
    if (this.nearCurve(x, y)) this.layer.addMarker(f);
  };

  private readonly cancel = (e: PointerEvent): void => {
    if (e.pointerId !== this.pid) return;
    const m = this.drag;
    this.pid = -1;
    this.drag = -1;
    this.box.removeAttribute('data-plot-drag');
    if (m >= 0 && this.moved) this.layer.moveMarker(m, this.markF[m], true);
  };

  private readonly leave = (e: PointerEvent): void => {
    if (e.pointerType === 'touch' || this.pid >= 0) return;
    this.box.removeAttribute('data-plot-hot');
    this.box.removeAttribute('data-plot-near');
    if (this.layer.cursorFrom === CURSOR_PLOT) this.layer.setCursor(NaN, CURSOR_PLOT);
  };

  /**
   * Keys on the focused plot: ← → (↓ ↑) move the cursor to the next trace point (Shift or PageDown/PageUp ten), Home and
   * End to the band's ends, Enter or M adds a marker at the cursor, Escape hides it.
   */
  private readonly key = (e: KeyboardEvent): void => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const tr = this.shown;
    if (!tr || tr.n < 1) return;
    const big = e.shiftKey ? 10 : 1;
    let cf = this.layer.cursorF;
    if (cf !== cf) cf = this.f0 >= this.start && this.f0 <= this.stop ? this.f0 : tr.freqs[nearestIndex(tr, bandFreq(0.5, this.start, this.stop, this.log))];
    let to = NaN;
    switch (e.key) {
      case 'ArrowRight': case 'ArrowUp': to = this.layer.cursorF === this.layer.cursorF ? stepAlong(tr, cf, big) : cf; break;
      case 'ArrowLeft': case 'ArrowDown': to = this.layer.cursorF === this.layer.cursorF ? stepAlong(tr, cf, -big) : cf; break;
      case 'PageUp': to = stepAlong(tr, cf, 10); break;
      case 'PageDown': to = stepAlong(tr, cf, -10); break;
      case 'Home': to = this.start; break;
      case 'End': to = this.stop; break;
      case 'Enter': case 'm': case 'M':
        if (this.layer.cursorF === this.layer.cursorF) this.layer.addMarker(this.layer.cursorF);
        e.preventDefault();
        return;
      case 'Escape':
        if (this.layer.cursorF !== this.layer.cursorF) return;
        this.layer.setCursor(NaN, CURSOR_PLOT);
        e.preventDefault();
        return;
      default: return;
    }
    e.preventDefault();
    this.layer.setCursor(to, CURSOR_PLOT);
  };
}
