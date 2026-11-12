// The chart's controller, framework-free (engine.md §9, D10): it holds the view (Γ at the centre of the box and the
// scale k in px per unit Γ), turns wheel, pointer (mouse, pen, touch) and keyboard input into view changes and writes
// the DOM at most once per animation frame. Two stacked <svg>s (M0.3 b): the grid layer (GridLayer, rebuilt only when
// its density level or covered window changes, else one transform) and the top layer for what moves: a `world` group
// in a Γ frame with one transform per frame (arcs, the trace: M3) and a `screen` group in box px (the readout marker,
// handles that keep their size: M3). Touch follows D14: the box has `touch-action: pan-y`, so one finger moving
// vertically scrolls the page; two fingers pinch and pan the chart; a tap places the readout; a touchstart on a handle
// calls preventDefault so that finger drags the handle instead.

import { MODE_Z } from '../../lib/smith/grid';
import { GridLayer, SCALE_ROOM_PX, fitK } from './gridSvg';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Zoom range: the whole chart (1×) to 1024× of it. */
export const MAX_ZOOM = 1024;
/** Wheel: zoom factor e^(−rate·Δ) per px of deltaY; a trackpad pinch (ctrlKey) sends small deltas, so a larger rate. */
const WHEEL_RATE = 0.002;
const WHEEL_RATE_PINCH = 0.01;
/** Keyboard: a zoom step of √2 about the centre, a pan step of a tenth of the box's shorter side (Shift: a hundredth). */
const KEY_ZOOM = Math.SQRT2;
const KEY_PAN = 0.1;
/** A tap: one pointer that moved less than this many px and was released within this many ms. */
const TAP_SLOP = 8;
const TAP_MS = 600;
/** The world frame is set again when its scale leaves [1/2, 2] or the view's centre is this many box sizes away. */
const FRAME_SPAN = 2;
const FRAME_FAR = 4;
/** A gesture (wheel, pinch, drag) ends when no input came for this many ms; the grid is drawn sharp at its end. */
const SETTLE_MS = 160;
/** During a gesture the grid's <svg> is stretched by a CSS transform (compositor only) within this zoom factor. */
const STRETCH = 2;

/** Flags of what the next frame has to write. */
export const DIRTY_VIEW = 1;
export const DIRTY_READ = 2;
export const DIRTY_CONTENT = 4;

/** Hooks for draggable handles (M3.3). Coordinates are px in the box. */
export interface HandleHooks {
  /** Whether a pointer or touch at (px, py) on `target` starts on a handle (hit areas of at least 44 px). */
  hit(px: number, py: number, target: EventTarget | null): boolean;
  down(id: number, px: number, py: number): void;
  move(id: number, px: number, py: number): void;
  up(id: number, px: number, py: number, cancelled: boolean): void;
}

export class ChartView {
  readonly box: HTMLElement;
  readonly grid: GridLayer;
  readonly top: SVGSVGElement;
  /** Γ frame: user units (u, v) = ((Γr − fx)·fk, (fy − Γi)·fk); see worldX, worldY. One transform per frame. */
  readonly world: SVGGElement;
  /** Box px, no transform: content placed here is positioned again each frame (onFrame). */
  readonly screen: SVGGElement;
  readonly marker: SVGGElement;

  /** The view: Γ = (cx, cy) at the centre of the w × h px box, k px per unit Γ; kFit shows the whole chart. */
  cx = 0; cy = 0; k = 0; w = 0; h = 0; kFit = 0;
  mode = MODE_Z;
  /** The world frame and how often it was set again (M3 redraws its world content in onReframe). */
  fx = 0; fy = 0; fk = 1; frameId = 0;
  /** The read point (Γ), NaN when none. */
  readX = NaN; readY = NaN;

  /** Called in the frame when the read point changed (write the readout panel). */
  onReadout: ((gr: number, gi: number) => void) | null = null;
  /** Called at the end of every frame with the flags it wrote (M3 positions screen content; the zoom indicator). */
  onFrame: ((dirty: number) => void) | null = null;
  /** Called when the world frame is set again, before onFrame: world content must be rewritten in the new frame. */
  onReframe: (() => void) | null = null;
  handles: HandleHooks | null = null;
  /** A mouse or pen hovering at box px (px, py), NaN when it left the box (M3.2: the path's hover highlight). */
  onHover: ((px: number, py: number) => void) | null = null;
  /** A tap or click at box px (px, py), after the read point was placed there (M3.2: picking an arc or a node). */
  onTap: ((px: number, py: number) => void) | null = null;

  /** Script time of the frames, for the harness: count, total and last in ms. */
  frames = 0; workMs = 0; lastWorkMs = 0;

  private dirty = 0;
  private raf = 0;
  private left = 0; private topPx = 0; private rectStale = true;
  // Up to two tracked pointers (pan with one, pinch with two); more are ignored.
  private ids = [-1, -1];
  private px = [0, 0];
  private py = [0, 0];
  private count = 0;
  private handleId = -1;
  private tap = false;
  private downX = 0; private downY = 0; private downT = 0;
  private startCx = 0; private startCy = 0; private startK = 0;
  private hover = false;
  /**
   * In a gesture, frames do not touch the grid's SVG: they move and scale its <svg> by a CSS transform from the view
   * it was last drawn for (ccx, ccy, ck), which the compositor applies without layout or paint. Redrawing the grid's
   * transform costs about 10 ms of main thread per frame at 4× CPU throttling (repaint of every path); the stretch
   * costs nothing. The grid is drawn again when the gesture ends, the stretch passes STRETCH or the grid does not hold.
   */
  private gesture = false;
  private stretched = false;
  private ccx = 0; private ccy = 0; private ck = 1;
  private settleTimer = 0;
  private readonly settle = (): void => { this.settleTimer = 0; this.gesture = false; this.request(DIRTY_VIEW); };
  private readonly observer: ResizeObserver;
  private readonly off: (() => void)[] = [];

  constructor(box: HTMLElement, gridSvg: SVGSVGElement, top: SVGSVGElement) {
    this.box = box;
    this.top = top;
    this.grid = new GridLayer(gridSvg);
    this.world = document.createElementNS(SVG_NS, 'g');
    this.world.setAttribute('data-layer', 'world');
    this.screen = document.createElementNS(SVG_NS, 'g');
    this.screen.setAttribute('data-layer', 'screen');
    this.marker = document.createElementNS(SVG_NS, 'g');
    this.marker.setAttribute('data-part', 'read');
    this.marker.setAttribute('display', 'none');
    const ring = document.createElementNS(SVG_NS, 'circle');
    ring.setAttribute('r', '6');
    const cross = document.createElementNS(SVG_NS, 'path');
    cross.setAttribute('d', 'M-11 0H-3M3 0H11M0-11V-3M0 3V11');
    this.marker.append(ring, cross);
    this.screen.appendChild(this.marker);
    top.replaceChildren(this.world, this.screen);

    this.w = box.clientWidth;
    this.h = box.clientHeight;
    this.kFit = fitK(this.w, this.h);
    this.k = this.kFit;

    const on = <K extends keyof HTMLElementEventMap>(type: K, fn: (e: HTMLElementEventMap[K]) => void, opts?: AddEventListenerOptions) => {
      box.addEventListener(type, fn, opts);
      this.off.push(() => box.removeEventListener(type, fn, opts));
    };
    on('pointerdown', this.pointerDown);
    on('pointermove', this.pointerMove);
    on('pointerup', this.pointerUp);
    on('pointercancel', this.pointerCancel);
    on('pointerleave', this.pointerLeave);
    on('wheel', this.wheel, { passive: false });
    on('touchstart', this.touchStart, { passive: false });
    on('keydown', this.keyDown);
    const stale = () => { this.rectStale = true; };
    window.addEventListener('scroll', stale, { passive: true, capture: true });
    window.addEventListener('resize', stale, { passive: true });
    this.off.push(() => { window.removeEventListener('scroll', stale, { capture: true }); window.removeEventListener('resize', stale); });
    this.observer = new ResizeObserver(([entry]) => this.resize(entry.contentRect.width, entry.contentRect.height));
    this.observer.observe(box);
    this.request(DIRTY_VIEW | DIRTY_READ);
  }

  destroy(): void {
    cancelAnimationFrame(this.raf);
    clearTimeout(this.settleTimer);
    this.observer.disconnect();
    for (const f of this.off) f();
  }

  // ---------- coordinates ----------

  /** Γ at box px (px, py) and back. */
  gammaX(px: number): number { return this.cx + (px - this.w / 2) / this.k; }
  gammaY(py: number): number { return this.cy - (py - this.h / 2) / this.k; }
  screenX(gr: number): number { return this.w / 2 + (gr - this.cx) * this.k; }
  screenY(gi: number): number { return this.h / 2 - (gi - this.cy) * this.k; }
  /** World user units of Γ (valid until the next onReframe). */
  worldX(gr: number): number { return (gr - this.fx) * this.fk; }
  worldY(gi: number): number { return (this.fy - gi) * this.fk; }
  get zoom(): number { return this.k / this.kFit; }

  // ---------- view changes (all coalesced into the next frame) ----------

  request(flags: number): void {
    this.dirty |= flags;
    if (!this.raf) this.raf = requestAnimationFrame(this.frame);
  }

  /** Shows Γ = (cx, cy) at the centre at k px per unit Γ, within the zoom and pan limits. */
  setView(cx: number, cy: number, k: number): void {
    const kMin = this.kFit, kMax = this.kFit * MAX_ZOOM;
    this.k = k < kMin ? kMin : k > kMax ? kMax : k;
    // The centre stays where the chart and its scales are: within 1 + the scale ring of Γ = 0 on each axis.
    const lim = 1 + SCALE_ROOM_PX / this.k;
    this.cx = cx < -lim ? -lim : cx > lim ? lim : cx;
    this.cy = cy < -lim ? -lim : cy > lim ? lim : cy;
    this.request(DIRTY_VIEW);
  }

  /** Zooms by f about box px (px, py): the Γ under that point stays under it (unless a limit is reached). */
  zoomAt(px: number, py: number, f: number): void {
    const gx = this.gammaX(px), gy = this.gammaY(py);
    const kMin = this.kFit, kMax = this.kFit * MAX_ZOOM;
    let k = this.k * f;
    k = k < kMin ? kMin : k > kMax ? kMax : k;
    this.setView(gx - (px - this.w / 2) / k, gy + (py - this.h / 2) / k, k);
  }

  panBy(dx: number, dy: number): void { this.setView(this.cx - dx / this.k, this.cy + dy / this.k, this.k); }

  /** The whole chart. */
  fit(): void { this.setView(0, 0, this.kFit); }

  /** The whole chart and no read point. */
  reset(): void { this.fit(); this.setRead(NaN, NaN); }

  setMode(mode: number): void {
    if (mode !== this.mode) { this.mode = mode; this.request(DIRTY_VIEW); }
  }

  setRead(gr: number, gi: number): void {
    if (gr === this.readX && gi === this.readY) return;
    if (gr !== gr && this.readX !== this.readX) return;
    this.readX = gr;
    this.readY = gi;
    this.request(DIRTY_READ);
  }

  private resize(w: number, h: number): void {
    if (w === this.w && h === this.h) return;
    const zoom = this.kFit > 0 ? this.k / this.kFit : 1;
    this.w = w;
    this.h = h;
    this.kFit = fitK(w, h);
    this.rectStale = true;
    this.setView(this.cx, this.cy, this.kFit * zoom);
  }

  // ---------- the frame ----------

  private readonly frame = (): void => {
    this.raf = 0;
    const dirty = this.dirty;
    this.dirty = 0;
    const t0 = performance.now();
    const { w, h, k, cx, cy } = this;
    if (dirty & DIRTY_VIEW) {
      const a = k / this.ck;
      if (this.gesture && a >= 1 / STRETCH && a <= STRETCH && this.grid.holds(cx, cy, k, w, h, this.mode)) {
        this.grid.svg.style.transform = `matrix(${a},0,0,${a},${w / 2 + (this.ccx - cx) * k - (w / 2) * a},${h / 2 - (this.ccy - cy) * k - (h / 2) * a})`;
        this.stretched = true;
      } else {
        this.grid.update(cx, cy, k, w, h, this.mode);
        if (this.stretched) { this.grid.svg.style.transform = ''; this.stretched = false; }
        this.ccx = cx; this.ccy = cy; this.ck = k;
      }
      let s = k / this.fk;
      const far = FRAME_FAR * (w + h);
      if (this.frameId === 0 || s < 1 / FRAME_SPAN || s > FRAME_SPAN
        || Math.abs(cx - this.fx) * k > far || Math.abs(cy - this.fy) * k > far) {
        this.fx = cx; this.fy = cy; this.fk = k; this.frameId++;
        s = 1;
        this.onReframe?.();
      }
      this.world.setAttribute('transform', `matrix(${s} 0 0 ${s} ${w / 2 + (this.fx - cx) * k} ${h / 2 - (this.fy - cy) * k})`);
    }
    if (dirty & (DIRTY_VIEW | DIRTY_READ)) {
      const x = this.screenX(this.readX), y = this.screenY(this.readY);
      if (x >= -20 && x <= w + 20 && y >= -20 && y <= h + 20) {
        this.marker.setAttribute('transform', `translate(${x} ${y})`);
        this.marker.removeAttribute('display');
      } else this.marker.setAttribute('display', 'none');
    }
    if (dirty & DIRTY_READ) this.onReadout?.(this.readX, this.readY);
    this.onFrame?.(dirty);
    this.lastWorkMs = performance.now() - t0;
    this.workMs += this.lastWorkMs;
    this.frames++;
  };

  // ---------- input ----------

  private inGesture(): void {
    this.gesture = true;
    clearTimeout(this.settleTimer);
    this.settleTimer = window.setTimeout(this.settle, SETTLE_MS);
  }

  private refreshRect(): void {
    if (!this.rectStale) return;
    const r = this.box.getBoundingClientRect();
    this.left = r.left + this.box.clientLeft;
    this.topPx = r.top + this.box.clientTop;
    this.rectStale = false;
  }

  private slot(id: number): number { return this.ids[0] === id ? 0 : this.ids[1] === id ? 1 : -1; }

  private readonly pointerDown = (e: PointerEvent): void => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    this.refreshRect();
    const x = e.clientX - this.left, y = e.clientY - this.topPx;
    if (this.count === 0 && this.handleId < 0 && this.handles?.hit(x, y, e.target)) {
      this.handleId = e.pointerId;
      this.box.setPointerCapture(e.pointerId);
      this.handles.down(e.pointerId, x, y);
      return;
    }
    if (this.count >= 2) { this.tap = false; return; }
    const i = this.ids[0] < 0 ? 0 : 1;
    this.ids[i] = e.pointerId;
    this.px[i] = x;
    this.py[i] = y;
    this.count++;
    try { this.box.setPointerCapture(e.pointerId); } catch { /* The pointer is already gone. */ }
    if (this.count === 1) {
      this.tap = true;
      this.downX = x; this.downY = y; this.downT = e.timeStamp;
      this.startCx = this.cx; this.startCy = this.cy; this.startK = this.k;
      if (e.pointerType === 'mouse') this.box.setAttribute('data-drag', '');
    } else this.tap = false;
  };

  private readonly pointerMove = (e: PointerEvent): void => {
    this.refreshRect();
    const x = e.clientX - this.left, y = e.clientY - this.topPx;
    if (e.pointerId === this.handleId) { this.handles?.move(e.pointerId, x, y); return; }
    const i = this.slot(e.pointerId);
    if (i < 0) {
      // Hovering mouse or pen: the readout follows it.
      if (e.pointerType !== 'touch' && this.count === 0) {
        this.hover = true;
        this.setRead(this.gammaX(x), this.gammaY(y));
        this.onHover?.(x, y);
      }
      return;
    }
    if (this.tap && Math.abs(x - this.downX) + Math.abs(y - this.downY) > TAP_SLOP) this.tap = false;
    if (this.count === 1) {
      // Pan: the Γ under the pointer moves with it (so a hover readout stays right).
      this.inGesture();
      this.panBy(x - this.px[i], y - this.py[i]);
    } else {
      // Pinch: the Γ under the old midpoint goes to the new midpoint, k scales with the fingers' distance.
      const j = 1 - i;
      const mx0 = (this.px[0] + this.px[1]) / 2, my0 = (this.py[0] + this.py[1]) / 2;
      const d0 = Math.hypot(this.px[1] - this.px[0], this.py[1] - this.py[0]);
      const mx1 = (x + this.px[j]) / 2, my1 = (y + this.py[j]) / 2;
      const d1 = Math.hypot(x - this.px[j], y - this.py[j]);
      const gx = this.gammaX(mx0), gy = this.gammaY(my0);
      this.inGesture();
      const kMin = this.kFit, kMax = this.kFit * MAX_ZOOM;
      let k = d0 > 0 && d1 > 0 ? this.k * (d1 / d0) : this.k;
      k = k < kMin ? kMin : k > kMax ? kMax : k;
      this.setView(gx - (mx1 - this.w / 2) / k, gy + (my1 - this.h / 2) / k, k);
    }
    this.px[i] = x;
    this.py[i] = y;
  };

  private release(e: PointerEvent, cancelled: boolean): void {
    if (e.pointerId === this.handleId) {
      this.refreshRect();
      this.handles?.up(e.pointerId, e.clientX - this.left, e.clientY - this.topPx, cancelled);
      this.handleId = -1;
      return;
    }
    const i = this.slot(e.pointerId);
    if (i < 0) return;
    if (this.count === 1) {
      if (cancelled) {
        // The browser took the touch for a page scroll (pan-y): undo what the finger moved before that.
        this.setView(this.startCx, this.startCy, this.startK);
      } else if (this.tap && e.timeStamp - this.downT <= TAP_MS) {
        this.setRead(this.gammaX(this.px[i]), this.gammaY(this.py[i]));
        this.onTap?.(this.px[i], this.py[i]);
      }
      this.box.removeAttribute('data-drag');
    }
    this.ids[i] = -1;
    this.count--;
    this.tap = false;
  }

  private readonly pointerUp = (e: PointerEvent): void => this.release(e, false);
  private readonly pointerCancel = (e: PointerEvent): void => this.release(e, true);
  private readonly pointerLeave = (e: PointerEvent): void => {
    if (e.pointerType === 'touch') return;
    this.hover = false;
    this.onHover?.(NaN, NaN);
  };

  private readonly wheel = (e: WheelEvent): void => {
    e.preventDefault();
    this.refreshRect();
    const d = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? this.h : 1);
    const x = e.clientX - this.left, y = e.clientY - this.topPx;
    this.inGesture();
    this.zoomAt(x, y, Math.exp(-d * (e.ctrlKey ? WHEEL_RATE_PINCH : WHEEL_RATE)));
    if (this.hover || this.readX !== this.readX) this.setRead(this.gammaX(x), this.gammaY(y));
  };

  private readonly touchStart = (e: TouchEvent): void => {
    if (!this.handles || e.touches.length !== 1) return;
    this.refreshRect();
    const t = e.touches[0];
    if (this.handles.hit(t.clientX - this.left, t.clientY - this.topPx, e.target)) e.preventDefault();
  };

  private readonly keyDown = (e: KeyboardEvent): void => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const step = (e.shiftKey ? KEY_PAN / 10 : KEY_PAN) * Math.min(this.w, this.h);
    switch (e.key) {
      case 'ArrowLeft': this.panBy(step, 0); break;
      case 'ArrowRight': this.panBy(-step, 0); break;
      case 'ArrowUp': this.panBy(0, step); break;
      case 'ArrowDown': this.panBy(0, -step); break;
      case '+': case '=': this.zoomAt(this.w / 2, this.h / 2, KEY_ZOOM); break;
      case '-': case '_': this.zoomAt(this.w / 2, this.h / 2, 1 / KEY_ZOOM); break;
      case '0': case 'Home': this.fit(); break;
      default: return;
    }
    e.preventDefault();
    // From the keyboard the read point is the centre of the view (where the marker then sits).
    this.hover = false;
    this.setRead(this.cx, this.cy);
  };
}
