// The frequency sweep on the chart (step M7.2a): the input's Γ(f) over the band as one polyline (D3) in the top layer's
// world group, and the markers on it. Framework-free, like pathLayer.ts, whose hooks on the ChartView it chains.
//
// Drawing. The polyline is one `d` of whole numbers: Γ × 1e9 rounded (5e-10 at most from the engine's value, inside the
// harness's 1e-9; sweep.ts pathData), in a group whose transform maps them into the world frame. Whole numbers print
// about twice as fast as doubles (0.57 against 1.0–1.3 ms for 10,000 points in Node) and give a shorter string to
// parse; the transform is set again only on a reframe, so neither a zoom frame nor a reframe rewrites the `d`.
//
// Budget (engine.md §9, notes-M7.2a.md). A refined 10,000-point sweep of 10 parts costs 3.6 ms at 1× and 15.7 ms at 4×
// CPU (notes-M7.1.md), so the main thread never sweeps the band in full while a worker is there: every new circuit or
// band is drawn at once as the band at as many evenly spaced points as fit COARSE_MS of script (sweep, `d` and
// setAttribute; sized from a running estimate of the cost per point and part measured on these frames, so the same
// budget gives fewer points at 4× than at 1×), and the refined trace, with its `d` written in the worker
// (lib/smith/sweep.worker.ts, the newest request wins), replaces it when it comes. During a handle's drag only the
// coarse trace is drawn, each frame, for the live circuit; the refined one is asked for when the drag ends.
//
// M7.2b: the plot (plotView.ts) is fed from here as a PlotSink, in the same frames: each trace drawn (the coarse ones
// during a drag, the refined one with the worker's plot paths), the markers and the cursor. The cursor is one frequency
// pointed at on either view (the chart: hovering near the trace or a tap that adds a marker; the plot: setCursor), shown
// on both. The band figures (sweep.ts bandFigures at the limit) come with the refined trace from the worker only, and are
// worked out here when only the limit changes.

import { formatAmount } from '../../lib/quantity';
import type { Circuit } from '../../lib/smith/network';
import { MAX_MARKERS } from '../../lib/smith/state';
import type { SweepSetting } from '../../lib/smith/state';
import { magFromReturnLoss } from '../../lib/smith/convert';
import type { PlotPaths } from '../../lib/smith/plot';
import { SWEEP_LIMIT_DB } from '../../lib/smith/state';
import { TRACE_SCALE, Trace, bandFigures, gammaAt, pathData, pickOnTrace, refine, segmentAt, sweepBand, sweepCircuit } from '../../lib/smith/sweep';
import type { Band, BandFigures, SweepCircuit, SweepReply } from '../../lib/smith/sweep';
import { ChartView, DIRTY_CONTENT, DIRTY_VIEW, TAP_MS, TAP_SLOP } from './chartView';
import { PathLayer, SEL_NONE } from './pathLayer';

const SVG_NS = 'http://www.w3.org/2000/svg';
/** Script per drag frame for the trace (sweep, `d`, setAttribute). */
export const COARSE_MS = 0.3;
/** A drag's trace has at least this many points (fewer only when the band has fewer). */
export const COARSE_MIN = 48;
/** A tap or click this near the trace (px) adds a marker. */
export const TRACE_PICK_PX = 12;
/** A press this near a marker (px) takes it. */
export const MARKER_PX = 22;
const MOUSE_SLOP = 3;
/** First guess of the script per swept point and per part plus one (ms), before a frame has measured it. */
const COST_GUESS = 6e-5;

/** What the plot (plotView.ts) is told, in the trace layer's frames. */
export interface PlotSink {
  /** A trace drawn: coarse (`full` false: the plot writes its own `d`) or refined (with the worker's paths, or null). */
  trace(tr: Trace, full: boolean, paths: PlotPaths | null, f0: number): void;
  /** The markers' frequencies and Γ (mg: re, im per marker), and the cursor's frequency (NaN: none) and Γ. */
  marks(markers: readonly number[], mg: Float64Array, cursor: number, cr: number, ci: number): void;
  /** The band figures of the refined trace (null: none yet, or no sweep). */
  figures(f: BandFigures | null): void;
  /** No sweep. */
  clear(): void;
}

/** Who set the cursor: nobody, the chart (hover or tap), or the plot. */
export const CURSOR_NONE = 0;
export const CURSOR_CHART = 1;
export const CURSOR_PLOT = 2;

const STATE_NONE = 0;
const STATE_COARSE = 1;
const STATE_FULL = 2;
const STATE_NAMES = ['none', 'coarse', 'full'];

export class TraceLayer {
  readonly view: ChartView;
  readonly path: PathLayer;
  /** The markers moved or added or removed on the chart (the page keeps them, and the link). */
  onMarkers: ((markers: number[]) => void) | null = null;
  /** M7.2b: told the band figures of each refined trace (null when the sweep is off); M7.3: the plot's and the report's. */
  readonly figureListeners = new Set<(f: BandFigures | null) => void>();
  /** M7.2b: the plot, fed in this layer's frames. */
  plot: PlotSink | null = null;
  /** The band figures of the refined trace shown, at the limit (null before the first). */
  figures: BandFigures | null = null;
  /** The cursor: its frequency (NaN: none), Γ on the drawn circuit, who set it. */
  cursorF = NaN;
  cursorFrom = CURSOR_NONE;
  private readonly cg = new Float64Array(2);
  private readonly cursorEl: HTMLSpanElement;

  /** The trace on the chart: `full` once refined, else `coarse` (read its arrays after each frame). */
  full = new Trace(1024);
  readonly coarse = new Trace(256);
  shown: Trace | null = null;
  state = STATE_NONE;
  /** Estimated script per point and part plus one (ms), from the frames that swept. */
  cost = COST_GUESS;
  /** For the harness: the worker's last sweep, the main thread's taking of it, the time from asking to drawn (ms). */
  workerMs = 0; applyMs = 0;
  /** For the harness: frames that swept, their total and last script (ms), the last coarse point count. */
  frames = 0; ms = 0; lastMs = 0; coarseN = 0; fullMs = 0;

  private setting: SweepSetting | null = null;
  private markers: number[] = [];
  /** Γ of each marker on the drawn circuit (re, im). */
  private readonly mg = new Float64Array(2 * MAX_MARKERS);
  private sc: SweepCircuit | null = null;
  private readonly coarseBand: Band = { start: 0, stop: 1, points: 2, log: false };
  private drawnCircuit: Circuit | null = null;
  private bandDirty = true;
  private marksDirty = true;
  private drawnFrame = -1;
  // The worker (sweep.worker.ts) and the request it works on.
  private worker: Worker | null = null;
  private noWorker = false;
  private askId = 0;
  private asked: Circuit | null = null;
  private askedBand: Band | null = null;
  private askedAt = 0;

  private readonly group: SVGGElement;
  private readonly line: SVGPathElement;
  private readonly overlay: HTMLDivElement;
  private markEls: HTMLSpanElement[] = [];
  private labelEls: HTMLSpanElement[] = [];
  private labelF: number[] = [];

  // A marker's drag.
  private mDrag = -1;
  private offX = 0; private offY = 0; private downX = 0; private downY = 0; private downT = 0; private moved = false; private slop = MOUSE_SLOP;
  private hotMarker = -1;
  private near = false;

  constructor(view: ChartView, path: PathLayer) {
    this.view = view;
    this.path = path;
    this.group = document.createElementNS(SVG_NS, 'g');
    this.group.setAttribute('data-layer', 'sweep');
    this.group.setAttribute('display', 'none');
    this.line = document.createElementNS(SVG_NS, 'path');
    this.line.setAttribute('data-sweep-trace', '');
    this.line.setAttribute('d', '');
    this.group.appendChild(this.line);
    // Under the circuit's path (its arcs and handles stay on top), over the solver's circles.
    view.world.insertBefore(this.group, view.world.querySelector('[data-layer="path"]'));

    this.overlay = document.createElement('div');
    this.overlay.setAttribute('data-layer', 'sweep-marks');
    this.overlay.setAttribute('role', 'group');
    this.overlay.setAttribute('aria-label', 'Markers on the frequency sweep');
    this.overlay.hidden = true;
    view.box.appendChild(this.overlay);
    this.overlay.addEventListener('keydown', this.keyDown);
    this.cursorEl = document.createElement('span');
    this.cursorEl.setAttribute('data-sweep-cursor', '');
    this.cursorEl.setAttribute('aria-hidden', 'true');
    this.cursorEl.hidden = true;
    this.overlay.appendChild(this.cursorEl);

    const before = view.onFrame;
    view.onFrame = (dirty) => { before?.(dirty); this.frame(dirty); };

    const tap = view.onTap;
    view.onTap = (px, py) => { if (!this.addAt(px, py)) tap?.(px, py); };

    const hover = view.onHover;
    view.onHover = (px, py) => {
      hover?.(px, py);
      const live = px === px && this.setting !== null && this.path.dragPart < 0;
      const m = live ? this.markerHit(px, py) : -1;
      const near = live && m < 0 && this.nearTrace(px, py);
      if (m !== this.hotMarker) { this.hotMarker = m; view.box.toggleAttribute('data-sweep-hot', m >= 0); }
      if (near !== this.near) { this.near = near; view.box.toggleAttribute('data-sweep-near', near); }
      // The cursor follows a pointer near the trace (or over a marker), for the plot.
      if (live && this.mDrag < 0) {
        const tr = this.shown;
        let f = NaN;
        if (m >= 0) f = this.markers[m];
        else if (tr && tr.n >= 2) {
          const pk = pickOnTrace(tr, view.gammaX(px), view.gammaY(py));
          if (pk.dist * view.k <= TRACE_PICK_PX) f = pk.f;
        }
        if (f === f) this.setCursor(f, CURSOR_CHART);
        else if (this.cursorFrom === CURSOR_CHART) this.setCursor(NaN, CURSOR_NONE);
      } else if (px !== px && this.cursorFrom === CURSOR_CHART) this.setCursor(NaN, CURSOR_NONE);
    };

    const h = view.handles;
    view.handles = {
      hit: (px, py, target) => this.markerHit(px, py) >= 0 || !!h?.hit(px, py, target),
      down: (id, px, py, touch, alt, time) => {
        const m = this.markerHit(px, py);
        if (m < 0) { h?.down(id, px, py, touch, alt, time); return; }
        this.mDrag = m;
        this.offX = px - view.screenX(this.mg[2 * m]);
        this.offY = py - view.screenY(this.mg[2 * m + 1]);
        this.downX = px; this.downY = py; this.downT = time; this.moved = false;
        this.slop = touch ? TAP_SLOP : MOUSE_SLOP;
        view.box.setAttribute('data-sweep-drag', '');
        this.markEls[m]?.setAttribute('data-drag', '');
      },
      move: (id, px, py, alt) => {
        if (this.mDrag < 0) { h?.move(id, px, py, alt); return; }
        if (!this.moved && Math.abs(px - this.downX) + Math.abs(py - this.downY) <= this.slop) return;
        this.moved = true;
        const tr = this.shown;
        if (!tr || tr.n < 2) return;
        this.setMarker(this.mDrag, pickOnTrace(tr, view.gammaX(px - this.offX), view.gammaY(py - this.offY)).f);
      },
      up: (id, px, py, cancelled, time) => {
        const m = this.mDrag;
        if (m < 0) { h?.up(id, px, py, cancelled, time); return; }
        this.mDrag = -1;
        view.box.removeAttribute('data-sweep-drag');
        this.markEls[m]?.removeAttribute('data-drag');
        if (this.moved) this.onMarkers?.(this.markers.slice());
        else if (!cancelled && time - this.downT <= TAP_MS) this.markEls[m]?.focus({ preventScroll: true });
      },
    };
  }

  // ---------- input from the page ----------

  /** The band and markers to show (null: no sweep). */
  setSweep(s: SweepSetting | null): void {
    const was = this.setting;
    this.setting = s;
    if (!s) {
      this.group.setAttribute('display', 'none');
      this.overlay.hidden = true;
      this.state = STATE_NONE;
      this.shown = null;
      this.drawnCircuit = null;
      this.asked = null;
      this.setMarkerCount(0);
      this.markers = [];
      this.cursorF = NaN; this.cursorFrom = CURSOR_NONE; this.cursorEl.hidden = true;
      this.setFigures(null);
      this.plot?.clear();
      return;
    }
    if (!was) { this.group.removeAttribute('display'); this.overlay.hidden = false; }
    const a = was?.band, b = s.band;
    if (!a || a.start !== b.start || a.stop !== b.stop || a.points !== b.points || a.log !== b.log) {
      this.bandDirty = true;
      if (this.cursorF === this.cursorF && !(this.cursorF >= b.start && this.cursorF <= b.stop)) { this.cursorF = NaN; this.cursorFrom = CURSOR_NONE; }
    } else if (this.figures && this.figures.threshold !== this.threshold && this.state === STATE_FULL && this.full === this.shown && this.sc) {
      // Only the limit changed: the figures of the refined trace shown, here (a scan of its points and a few brackets).
      this.setFigures(figuresOf(this.full, this.sc, this.threshold));
    }
    // The page's markers win, except during a marker's drag (its own frames move it).
    if (this.mDrag < 0) {
      this.markers = s.markers.slice(0, MAX_MARKERS);
      this.setMarkerCount(this.markers.length);
      if (this.sc) for (let m = 0; m < this.markers.length; m++) gammaAt(this.mg, 2 * m, this.sc, this.markers[m]);
    }
    this.marksDirty = true;
    this.view.request(DIRTY_CONTENT);
  }

  /** The figures' |Γ| threshold: the limit's. */
  get threshold(): number { return magFromReturnLoss(this.setting?.limit ?? SWEEP_LIMIT_DB); }

  private setFigures(f: BandFigures | null): void {
    this.figures = f;
    this.plot?.figures(f);
    for (const fn of this.figureListeners) fn(f);
  }

  /** Hands the plot what is shown now (it then follows in the frames). */
  attachPlot(p: PlotSink | null): void {
    this.plot = p;
    if (!p) return;
    if (!this.setting || !this.shown) { p.clear(); return; }
    p.trace(this.shown, this.state === STATE_FULL, null, this.sc?.f0 ?? NaN);
    p.figures(this.figures);
    p.marks(this.markers, this.mg, this.cursorF, this.cg[0], this.cg[1]);
  }

  /** The cursor at f (NaN: none), set by `from` (the plot's pointer, the chart's hover or tap). */
  setCursor(f: number, from: number): void {
    const b = this.setting?.band;
    if (f === f && b) f = f < b.start ? b.start : f > b.stop ? b.stop : f;
    if (!b) f = NaN;
    const nf = f === f ? from : CURSOR_NONE;
    if (Object.is(f, this.cursorF) && nf === this.cursorFrom) return;
    this.cursorF = f;
    this.cursorFrom = nf;
    if (f === f && this.sc) gammaAt(this.cg, 0, this.sc, f);
    this.cursorEl.setAttribute('data-f', String(f));
    this.marksDirty = true;
    this.view.request(DIRTY_CONTENT);
  }

  /** Marker m to f (from the plot's drag); `done` at the drag's end tells the page. */
  moveMarker(m: number, f: number, done: boolean): void {
    if (!(m >= 0 && m < this.markers.length)) return;
    this.setMarker(m, f);
    if (done) this.onMarkers?.(this.markers.slice());
  }

  /** A marker at f (from the plot); false when there are MAX_MARKERS already. */
  addMarker(f: number): boolean {
    if (!this.setting || !this.sc || this.markers.length >= MAX_MARKERS) return false;
    const m = this.markers.length;
    this.markers.push(f);
    this.setMarkerCount(m + 1);
    this.setMarker(m, f);
    this.onMarkers?.(this.markers.slice());
    return true;
  }

  /** The markers on the chart now (their frequencies). */
  get markerFreqs(): readonly number[] { return this.markers; }

  /** For the harness: the trace's state ('none', 'coarse', 'full'). */
  get stateName(): string { return STATE_NAMES[this.state]; }

  // ---------- the frame ----------

  private frame(dirty: number): void {
    const s = this.setting;
    if (!s || !(dirty & (DIRTY_VIEW | DIRTY_CONTENT))) return;
    const v = this.view, p = this.path;
    if (v.frameId !== this.drawnFrame) {
      const k = v.fk / TRACE_SCALE;
      this.group.setAttribute('transform', `matrix(${k} 0 0 ${-k} ${-v.fx * v.fk} ${v.fy * v.fk})`);
      this.drawnFrame = v.frameId;
    }
    if (p.dragPart >= 0) {
      // A handle's drag: the live circuit (null until the handle moved) at the coarse budget.
      const live = p.liveCircuit;
      if (live && (live !== this.drawnCircuit || this.bandDirty)) this.drawCoarse(live);
    } else {
      const c = p.committed;
      if (c && (c !== this.drawnCircuit || this.bandDirty || (this.state !== STATE_FULL && c !== this.asked))) {
        // A new circuit or band shows at once at the coarse budget; the refined trace follows from the worker (the newest
        // request wins), or here without one.
        if (c !== this.drawnCircuit || this.bandDirty) this.drawCoarse(c);
        if (!this.askFull(c)) this.drawFull(c);
      }
    }
    if (this.marksDirty || dirty & DIRTY_VIEW) {
      const changed = this.marksDirty;
      this.writeMarks();
      this.marksDirty = false;
      if (changed) this.plot?.marks(this.markers, this.mg, this.cursorF, this.cg[0], this.cg[1]);
    }
  }

  /** The band at as many even points as fit COARSE_MS (never more than the band's own). */
  private drawCoarse(c: Circuit): void {
    const t0 = performance.now();
    const sc = (this.sc = sweepCircuit(c, this.sc ?? undefined));
    const b = this.setting!.band, cb = this.coarseBand;
    let n = Math.floor(COARSE_MS / (this.cost * (sc.count + 1)));
    n = n < COARSE_MIN ? COARSE_MIN : n;
    if (n > b.points) n = b.points;
    cb.start = b.start; cb.stop = b.stop; cb.points = n; cb.log = b.log;
    sweepBand(this.coarse, cb, sc);
    this.writePath(this.coarse, STATE_COARSE);
    this.placeMarkers(sc);
    this.drawnCircuit = c;
    this.bandDirty = false;
    const ms = performance.now() - t0;
    this.learn(ms, n * (sc.count + 1));
    this.coarseN = n;
    this.lastMs = ms; this.ms += ms; this.frames++;
  }

  /** The band refined (sweep.ts REFINE_DEFAULTS: at most 10,000 points). */
  private drawFull(c: Circuit): void {
    const t0 = performance.now();
    const sc = (this.sc = sweepCircuit(c, this.sc ?? undefined));
    const tr = this.full;
    sweepBand(tr, this.setting!.band, sc);
    refine(tr, sc);
    this.writePath(tr, STATE_FULL);
    this.placeMarkers(sc);
    this.setFigures(bandFigures(tr, sc, this.threshold));
    this.drawnCircuit = c;
    this.bandDirty = false;
    this.fullMs = performance.now() - t0;
    this.asked = null;
  }

  /**
   * A running estimate of the script per unit (points × (parts + 1)) of a coarse frame, from the frames themselves: the
   * timer's steps (0.1 ms in a page that is not cross-origin isolated) average out. The fixed part of a frame (packing,
   * the attribute) is about 0.03 ms at 1× (measured in a loop), small beside the budget.
   */
  private learn(ms: number, units: number): void {
    const per = Math.max(ms, 1e-3) / units;
    this.cost += 0.25 * (per - this.cost);
  }

  // ---------- the refined trace from the worker ----------

  /** Asks the worker for the refined trace of c and the band; false when there is no worker (then the caller sweeps). */
  private askFull(c: Circuit): boolean {
    if (c === this.asked && this.setting!.band === this.askedBand) return true;
    const w = this.getWorker();
    if (!w) return false;
    this.asked = c;
    this.askedBand = this.setting!.band;
    this.askedAt = performance.now();
    w.postMessage({ id: ++this.askId, circuit: c, band: this.askedBand, threshold: this.threshold });
    return true;
  }

  private getWorker(): Worker | null {
    if (this.worker || this.noWorker) return this.worker;
    try {
      if (typeof Worker === 'undefined') throw new Error('No workers here.');
      // @ts-expect-error TypeScript takes this file for CommonJS, where import.meta is not allowed; the bundler needs exactly this form to build the worker as a file of its own.
      const w: Worker = new Worker(new URL('../../lib/smith/sweep.worker.ts', import.meta.url));
      w.onmessage = (e: MessageEvent<SweepReply>) => this.applyFull(e.data);
      w.onerror = () => { this.worker?.terminate(); this.worker = null; this.noWorker = true; this.asked = null; this.view.request(DIRTY_CONTENT); };
      this.worker = w;
    } catch {
      this.noWorker = true;
    }
    return this.worker;
  }

  /** The worker's trace, when it answers the newest request and that is still what the page shows. */
  private applyFull(r: SweepReply): void {
    if (r.id !== this.askId) return;
    const c = this.asked, t0 = performance.now();
    if (!c || !this.setting || this.setting.band !== this.askedBand || this.path.dragPart >= 0 || c !== this.path.committed) {
      // The newest answer, but no longer for what is shown: the next frame asks again if it must.
      this.asked = null;
      this.view.request(DIRTY_CONTENT);
      return;
    }
    const tr = new Trace(0);
    tr.freqs = r.freqs; tr.gamma = r.gamma; tr.n = tr.capacity = r.n; tr.base = r.base;
    tr.log = this.askedBand.log; tr.start = this.askedBand.start; tr.stop = this.askedBand.stop;
    this.full = tr;
    this.line.setAttribute('d', r.d);
    this.shown = tr;
    if (this.state !== STATE_FULL) { this.state = STATE_FULL; this.line.setAttribute('data-state', STATE_NAMES[STATE_FULL]); }
    const sc = (this.sc = sweepCircuit(c, this.sc ?? undefined));
    this.placeMarkers(sc);
    this.plot?.trace(tr, true, r.plot, sc.f0);
    // Figures at another limit than asked (changed while the worker swept) are worked out again here.
    const th = this.threshold;
    this.setFigures(r.figures.threshold === th ? r.figures : figuresOf(tr, sc, th));
    this.drawnCircuit = c;
    this.asked = null;
    this.workerMs = r.ms;
    this.applyMs = performance.now() - t0;
    this.fullMs = performance.now() - this.askedAt;
    this.view.request(DIRTY_CONTENT);
  }

  /** Stops the worker (the page's unmount). */
  dispose(): void {
    this.worker?.terminate();
    this.worker = null;
    this.noWorker = true;
  }

  /** One `d`: whole numbers, "M x y x y …" (pairs after M are lines); a point that is not finite breaks the line. */
  private writePath(tr: Trace, state: number): void {
    this.line.setAttribute('d', pathData(tr.gamma, tr.n));
    this.shown = tr;
    if (state !== this.state) { this.state = state; this.line.setAttribute('data-state', STATE_NAMES[state]); }
    this.plot?.trace(tr, state === STATE_FULL, null, this.sc?.f0 ?? NaN);
  }

  private placeMarkers(sc: SweepCircuit): void {
    const ms = this.markers;
    for (let m = 0; m < ms.length; m++) gammaAt(this.mg, 2 * m, sc, ms[m]);
    if (this.cursorF === this.cursorF) gammaAt(this.cg, 0, sc, this.cursorF);
    if (ms.length || this.cursorF === this.cursorF) this.marksDirty = true;
  }

  // ---------- markers ----------

  private setMarkerCount(n: number): void {
    while (this.markEls.length > n) { this.markEls.pop()!.remove(); this.labelEls.pop(); this.labelF.pop(); }
    while (this.markEls.length < n) {
      const i = this.markEls.length;
      const el = document.createElement('span');
      el.setAttribute('data-sweep-marker', String(i));
      el.setAttribute('role', 'slider');
      el.tabIndex = 0;
      const dot = document.createElement('span');
      dot.setAttribute('data-sweep-dot', '');
      const label = document.createElement('span');
      label.setAttribute('data-sweep-label', '');
      el.append(dot, label);
      el.hidden = true;
      this.overlay.appendChild(el);
      this.markEls.push(el);
      this.labelEls.push(label);
      this.labelF.push(NaN);
    }
  }

  private writeMarks(): void {
    const v = this.view, { w, h } = v, ms = this.markers, n = ms.length, b = this.setting?.band;
    for (let m = 0; m < n; m++) {
      const el = this.markEls[m], f = ms[m];
      if (f !== this.labelF[m]) {
        this.labelF[m] = f;
        const t = formatAmount(f, 'Hz', 4);
        this.labelEls[m].textContent = `M${m + 1} ${t}`;
        el.setAttribute('aria-valuetext', t);
        el.setAttribute('aria-label', `Marker ${m + 1} of ${n} on the sweep: arrow keys move it along the trace, Delete removes it`);
        el.setAttribute('aria-valuenow', String(f));
        if (b) { el.setAttribute('aria-valuemin', String(b.start)); el.setAttribute('aria-valuemax', String(b.stop)); }
        el.setAttribute('data-f', String(f));
      }
      const x = v.screenX(this.mg[2 * m]), y = v.screenY(this.mg[2 * m + 1]);
      const on = x === x && y === y && x >= -12 && x <= w + 12 && y >= -12 && y <= h + 12;
      if (on) el.style.transform = `translate(${x}px,${y}px)`;
      if (el.hidden === on) el.hidden = !on;
    }
    const cf = this.cursorF, ce = this.cursorEl;
    const cx = cf === cf ? v.screenX(this.cg[0]) : NaN, cy = cf === cf ? v.screenY(this.cg[1]) : NaN;
    const con = cx === cx && cy === cy && cx >= -12 && cx <= w + 12 && cy >= -12 && cy <= h + 12;
    if (con) ce.style.transform = `translate(${cx}px,${cy}px)`;
    if (ce.hidden === con) ce.hidden = !con;
  }

  /** Marker m to frequency f on the drawn circuit (the DOM follows in the next frame). */
  private setMarker(m: number, f: number): void {
    const b = this.setting?.band;
    if (!b || !this.sc) return;
    f = f < b.start ? b.start : f > b.stop ? b.stop : f;
    this.markers[m] = f;
    gammaAt(this.mg, 2 * m, this.sc, f);
    this.marksDirty = true;
    this.view.request(DIRTY_CONTENT);
  }

  /** The marker nearest box px (px, py) within MARKER_PX, unless a part's handle is nearer; else −1. */
  markerHit(px: number, py: number): number {
    if (!this.setting || this.overlay.hidden) return -1;
    const v = this.view;
    let best = -1, bestD = MARKER_PX;
    for (let m = 0; m < this.markers.length; m++) {
      if (this.markEls[m]?.hidden) continue;
      const d = Math.hypot(v.screenX(this.mg[2 * m]) - px, v.screenY(this.mg[2 * m + 1]) - py);
      if (d < bestD) { bestD = d; best = m; }
    }
    if (best < 0) return -1;
    const hd = this.path.handleAt(px, py), g = this.path.gamma;
    if (hd >= 0 && Math.hypot(v.screenX(g[2 * hd + 2]) - px, v.screenY(g[2 * hd + 3]) - py) < bestD) return -1;
    return best;
  }

  private nearTrace(px: number, py: number): boolean {
    const tr = this.shown, v = this.view;
    if (!tr || tr.n < 2 || this.markers.length >= MAX_MARKERS) return false;
    return pickOnTrace(tr, v.gammaX(px), v.gammaY(py)).dist * v.k <= TRACE_PICK_PX;
  }

  /** A tap or click on the trace (and on nothing of the circuit's path) adds a marker there. */
  addAt(px: number, py: number): boolean {
    if (!this.setting || this.mDrag >= 0 || this.path.pick(px, py)[0] !== SEL_NONE || !this.nearTrace(px, py)) return false;
    const v = this.view, f = pickOnTrace(this.shown!, v.gammaX(px), v.gammaY(py)).f;
    const m = this.markers.length;
    this.markers.push(f);
    this.setMarkerCount(m + 1);
    this.setMarker(m, f);
    this.setCursor(f, CURSOR_CHART);
    this.onMarkers?.(this.markers.slice());
    return true;
  }

  /**
   * A focused marker's keys: ← → (↓ ↑) to the next trace point below or above, with Shift or PageDown/PageUp ten points,
   * Home and End to the band's ends, Delete or Backspace removes it. Chords with Ctrl, Cmd or Alt go on to the page.
   */
  private readonly keyDown = (e: KeyboardEvent): void => {
    const a = (e.target as Element).getAttribute?.('data-sweep-marker');
    if (a === null || a === undefined || e.ctrlKey || e.metaKey || e.altKey) return;
    const m = Number(a), tr = this.shown, b = this.setting?.band;
    if (!tr || !b || !(m < this.markers.length)) return;
    const big = e.shiftKey ? 10 : 1;
    let steps = 0, to = NaN;
    switch (e.key) {
      case 'ArrowRight': case 'ArrowUp': steps = big; break;
      case 'ArrowLeft': case 'ArrowDown': steps = -big; break;
      case 'PageUp': steps = 10; break;
      case 'PageDown': steps = -10; break;
      case 'Home': to = b.start; break;
      case 'End': to = b.stop; break;
      case 'Delete': case 'Backspace': {
        e.preventDefault(); e.stopPropagation();
        this.markers.splice(m, 1);
        this.mg.copyWithin(2 * m, 2 * m + 2);
        this.setMarkerCount(this.markers.length);
        this.labelF.fill(NaN);
        this.marksDirty = true;
        this.view.request(DIRTY_CONTENT);
        const next = this.markEls[Math.min(m, this.markEls.length - 1)];
        if (next) next.focus({ preventScroll: true }); else this.view.box.focus({ preventScroll: true });
        this.onMarkers?.(this.markers.slice());
        return;
      }
      default: return;
    }
    e.preventDefault(); e.stopPropagation();
    if (steps) to = stepAlong(tr, this.markers[m], steps);
    if (to !== this.markers[m]) { this.setMarker(m, to); this.onMarkers?.(this.markers.slice()); }
  };
}

/** bandFigures of a trace; one made from the worker's arrays gets its workspace first. */
function figuresOf(tr: Trace, sc: SweepCircuit, threshold: number): BandFigures {
  if (tr.work.length < tr.n) tr.work = new Float64Array(tr.n);
  return bandFigures(tr, sc, threshold);
}

/** The trace's point `steps` points above f (below when negative), counting a point at f itself as passed. */
export function stepAlong(tr: Trace, f: number, steps: number): number {
  const fr = tr.freqs, n = tr.n;
  if (n < 2) return f;
  const s = segmentAt(tr, f);
  let j: number;
  if (steps > 0) j = (fr[s] > f ? s : fr[s + 1] > f ? s + 1 : s + 2) + steps - 1;
  else j = (fr[s + 1] < f ? s + 1 : fr[s] < f ? s : s - 1) + steps + 1;
  return fr[j < 0 ? 0 : j > n - 1 ? n - 1 : j];
}
