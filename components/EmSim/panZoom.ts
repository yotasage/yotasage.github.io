// A small pan-zoom controller for the EM simulation page's drawings (M2.1c; reused by the field view M2.2 and the via
// M3.1), framework-free and modelled on the Smith chart's (components/Smith/chartView.ts), without its content.
//
// The view is a world rectangle seen in a w × h px box: world (x, y) in model units with y down, shown at
// px = w/2 + (x − cx)·k, py = h/2 + (y − cy)·k. The page gives the whole content (`setFit`) and the box size
// (`resize`); the controller turns wheel (zoom about the pointer), pointer drags (pan), two fingers (pinch and pan) and
// keys (arrows pan, + and − zoom, 0 or Home resets) into view changes, and calls `onFrame(view, gesture)` at most once
// per animation frame (the page moves its last picture by one transform: `frameTransform`) and `onSettle(view)`
// SETTLE_MS after the last input (the page draws again). A pointer that starts on a handle (`handles.hit`) drags the
// handle and never pans. Touch: the box has `touch-action: pan-y`, so one finger moving up or down scrolls the page,
// one finger across pans, two fingers pinch; a touchstart on a handle calls preventDefault so the finger drags it.

/** A tap: one pointer that moved less than this many px and was released within this many ms. */
export const TAP_SLOP = 8;
export const TAP_MS = 600;
/** A gesture ends when no input came for this many ms. */
export const SETTLE_MS = 160;
/** Wheel: zoom factor e^(−rate·Δ) per px of deltaY; a trackpad pinch (ctrlKey) sends small deltas. */
const WHEEL_RATE = 0.002;
const WHEEL_RATE_PINCH = 0.01;
/** Keys: a zoom step of √2 about the centre, a pan step of a tenth of the box's shorter side (Shift: a hundredth). */
const KEY_ZOOM = Math.SQRT2;
const KEY_PAN = 0.1;

export interface View { cx: number; cy: number; k: number; w: number; h: number }
export interface Rect { x0: number; y0: number; x1: number; y1: number }

/** Hooks for draggable handles; coordinates are px in the box. */
export interface HandleHooks {
  hit(px: number, py: number, target: EventTarget | null): boolean;
  down(id: number, px: number, py: number, touch: boolean, time: number): void;
  move(id: number, px: number, py: number): void;
  up(id: number, px: number, py: number, cancelled: boolean, time: number): void;
}

export interface PanZoomOptions {
  /** Most px per world unit (the deepest zoom). */
  maxK: number;
  /** Least zoom as a fraction of the fit's k (1: never smaller than the whole content). */
  minFit?: number;
}

/** The SVG transform that moves a picture drawn at view `a` to where view `b` shows it. */
export function frameTransform(a: View, b: View): string {
  const f = b.k / a.k;
  const tx = b.w / 2 + (a.cx - b.cx) * b.k - (a.w / 2) * f;
  const ty = b.h / 2 + (a.cy - b.cy) * b.k - (a.h / 2) * f;
  return `translate(${tx.toFixed(2)} ${ty.toFixed(2)}) scale(${f.toPrecision(6)})`;
}

export class PanZoom {
  readonly box: HTMLElement;
  view: View = { cx: 0, cy: 0, k: 1, w: 1, h: 1 };
  fitRect: Rect = { x0: -1, y0: -1, x1: 1, y1: 1 };
  /** The view is the fit (no pan or zoom since the last reset): the page refits when its content changes. */
  atFit = true;
  /** Inside a gesture (from the first input to SETTLE_MS after the last). */
  gesture = false;
  onFrame: ((v: View, gesture: boolean) => void) | null = null;
  onSettle: ((v: View) => void) | null = null;
  onTap: ((px: number, py: number) => void) | null = null;
  handles: HandleHooks | null = null;
  /** For the harness: frames written. */
  frames = 0;

  private opt: Required<PanZoomOptions>;
  private raf = 0;
  private settleTimer = 0;
  private left = 0;
  private topPx = 0;
  private ids = [-1, -1];
  private px = [0, 0];
  private py = [0, 0];
  private count = 0;
  private handleId = -1;
  private tap = false;
  private downX = 0;
  private downY = 0;
  private downT = 0;
  private start: View = this.view;
  private startFit = true;
  private off: Array<() => void> = [];

  constructor(box: HTMLElement, opt: PanZoomOptions) {
    this.box = box;
    this.opt = { minFit: 1, ...opt };
    const on = <K extends keyof HTMLElementEventMap>(type: K, fn: (e: HTMLElementEventMap[K]) => void, o?: AddEventListenerOptions) => {
      box.addEventListener(type, fn as EventListener, o);
      this.off.push(() => box.removeEventListener(type, fn as EventListener, o));
    };
    on('pointerdown', this.pointerDown);
    on('pointermove', this.pointerMove);
    on('pointerup', (e) => this.release(e, false));
    on('pointercancel', (e) => this.release(e, true));
    on('wheel', this.wheel, { passive: false });
    on('touchstart', this.touchStart, { passive: false });
    on('keydown', this.keyDown);
  }

  destroy(): void {
    for (const f of this.off) f();
    this.off = [];
    if (this.raf) cancelAnimationFrame(this.raf);
    clearTimeout(this.settleTimer);
  }

  // ---- the view ----

  private fitK(): number {
    const r = this.fitRect;
    return Math.min(this.view.w / Math.max(r.x1 - r.x0, 1e-12), this.view.h / Math.max(r.y1 - r.y0, 1e-12));
  }

  /** The whole content (world units); `refit` (or a view that was the fit) moves the view to it. */
  setFit(r: Rect, refit: boolean): void {
    this.fitRect = r;
    if (refit || this.atFit) this.fit(false);
    else this.setView(this.view.cx, this.view.cy, this.view.k, false);
  }

  /** The box's size in px (the view keeps its centre and scale; a view at the fit stays at the fit). */
  resize(w: number, h: number): void {
    if (w === this.view.w && h === this.view.h) return;
    this.view = { ...this.view, w, h };
    if (this.atFit) this.fit(false);
  }

  /** Back to the whole content. */
  fit(animate = true): void {
    const r = this.fitRect;
    this.view = { ...this.view, cx: (r.x0 + r.x1) / 2, cy: (r.y0 + r.y1) / 2, k: this.fitK() };
    this.atFit = true;
    if (animate) this.changed();
  }

  /** Sets the view, kept inside the zoom limits and with its centre inside the content. */
  setView(cx: number, cy: number, k: number, user = true): void {
    const kf = this.fitK();
    const kMin = kf * this.opt.minFit, kMax = Math.max(this.opt.maxK, kf);
    k = k < kMin ? kMin : k > kMax ? kMax : k;
    const r = this.fitRect;
    cx = Math.min(Math.max(cx, r.x0), r.x1);
    cy = Math.min(Math.max(cy, r.y0), r.y1);
    this.view = { ...this.view, cx, cy, k };
    if (user) {
      this.atFit = false;
      this.changed();
    }
  }

  zoomAt(px: number, py: number, f: number): void {
    const v = this.view;
    const x = this.worldX(px), y = this.worldY(py);
    const k = v.k * f;
    this.setView(x - (px - v.w / 2) / k, y - (py - v.h / 2) / k, k);
  }

  panBy(dx: number, dy: number): void {
    const v = this.view;
    this.setView(v.cx - dx / v.k, v.cy - dy / v.k, v.k);
  }

  worldX(px: number): number { return this.view.cx + (px - this.view.w / 2) / this.view.k; }
  worldY(py: number): number { return this.view.cy + (py - this.view.h / 2) / this.view.k; }
  screenX(x: number): number { return this.view.w / 2 + (x - this.view.cx) * this.view.k; }
  screenY(y: number): number { return this.view.h / 2 + (y - this.view.cy) * this.view.k; }

  // A view change: one write in the next animation frame, the settle after the last input.
  private changed(): void {
    this.gesture = true;
    if (!this.raf) this.raf = requestAnimationFrame(this.frame);
    clearTimeout(this.settleTimer);
    this.settleTimer = window.setTimeout(this.settle, SETTLE_MS);
  }

  private readonly frame = (): void => {
    this.raf = 0;
    this.frames++;
    this.onFrame?.(this.view, this.gesture);
  };

  private readonly settle = (): void => {
    if (this.count > 0) { this.settleTimer = window.setTimeout(this.settle, SETTLE_MS); return; }
    this.gesture = false;
    this.onSettle?.(this.view);
  };

  // ---- input ----

  private rect(): void {
    const b = this.box.getBoundingClientRect();
    this.left = b.left;
    this.topPx = b.top;
  }

  private slot(id: number): number { return this.ids[0] === id ? 0 : this.ids[1] === id ? 1 : -1; }

  private readonly pointerDown = (e: PointerEvent): void => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    // Controls on the drawing (a reset button) keep their own clicks.
    if ((e.target as Element | null)?.closest?.('button, a, input, select, [data-no-pan]')) return;
    this.rect();
    const x = e.clientX - this.left, y = e.clientY - this.topPx;
    if (this.count === 0 && this.handleId < 0 && this.handles?.hit(x, y, e.target)) {
      this.handleId = e.pointerId;
      try { this.box.setPointerCapture(e.pointerId); } catch { /* gone or synthetic */ }
      this.handles.down(e.pointerId, x, y, e.pointerType === 'touch', e.timeStamp);
      e.preventDefault();
      return;
    }
    if (this.handleId >= 0) return; // a second finger while a handle is dragged
    if (this.count >= 2) { this.tap = false; return; }
    const i = this.ids[0] < 0 ? 0 : 1;
    this.ids[i] = e.pointerId;
    this.px[i] = x;
    this.py[i] = y;
    this.count++;
    try { this.box.setPointerCapture(e.pointerId); } catch { /* gone */ }
    if (this.count === 1) {
      this.tap = true;
      this.downX = x; this.downY = y; this.downT = e.timeStamp;
      this.start = this.view;
      this.startFit = this.atFit;
      if (e.pointerType === 'mouse') this.box.setAttribute('data-drag', '');
    } else this.tap = false;
  };

  private readonly pointerMove = (e: PointerEvent): void => {
    if (this.handleId < 0 && this.count === 0) return;
    const x = e.clientX - this.left, y = e.clientY - this.topPx;
    if (e.pointerId === this.handleId) { this.handles?.move(e.pointerId, x, y); return; }
    const i = this.slot(e.pointerId);
    if (i < 0) return;
    if (this.tap && Math.abs(x - this.downX) + Math.abs(y - this.downY) > TAP_SLOP) this.tap = false;
    if (this.count === 1) this.panBy(x - this.px[i], y - this.py[i]);
    else {
      // Pinch: the world point under the old midpoint goes to the new one; k scales with the fingers' distance.
      const j = 1 - i;
      const mx0 = (this.px[0] + this.px[1]) / 2, my0 = (this.py[0] + this.py[1]) / 2;
      const d0 = Math.hypot(this.px[1] - this.px[0], this.py[1] - this.py[0]);
      const mx1 = (x + this.px[j]) / 2, my1 = (y + this.py[j]) / 2;
      const d1 = Math.hypot(x - this.px[j], y - this.py[j]);
      const wx = this.worldX(mx0), wy = this.worldY(my0);
      const k = d0 > 0 && d1 > 0 ? this.view.k * (d1 / d0) : this.view.k;
      const v = this.view;
      this.setView(wx - (mx1 - v.w / 2) / k, wy - (my1 - v.h / 2) / k, k);
    }
    this.px[i] = x;
    this.py[i] = y;
  };

  private release(e: PointerEvent, cancelled: boolean): void {
    if (e.pointerId === this.handleId) {
      this.handleId = -1;
      this.handles?.up(e.pointerId, e.clientX - this.left, e.clientY - this.topPx, cancelled, e.timeStamp);
      return;
    }
    const i = this.slot(e.pointerId);
    if (i < 0) return;
    if (this.count === 1) {
      if (cancelled) {
        // The browser took the touch for a page scroll (pan-y): undo what the finger moved before that.
        this.setView(this.start.cx, this.start.cy, this.start.k, false);
        this.atFit = this.startFit;
        this.changed();
      } else if (this.tap && e.timeStamp - this.downT <= TAP_MS) this.onTap?.(this.px[i], this.py[i]);
      this.box.removeAttribute('data-drag');
    }
    this.ids[i] = -1;
    this.count--;
    this.tap = false;
  }

  private readonly wheel = (e: WheelEvent): void => {
    e.preventDefault();
    this.rect();
    const d = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? this.view.h : 1);
    this.zoomAt(e.clientX - this.left, e.clientY - this.topPx, Math.exp(-d * (e.ctrlKey ? WHEEL_RATE_PINCH : WHEEL_RATE)));
  };

  private readonly touchStart = (e: TouchEvent): void => {
    if (!this.handles || e.touches.length !== 1) return;
    this.rect();
    const t = e.touches[0];
    if (this.handles.hit(t.clientX - this.left, t.clientY - this.topPx, e.target)) e.preventDefault();
  };

  private readonly keyDown = (e: KeyboardEvent): void => {
    if (e.altKey || e.ctrlKey || e.metaKey || e.defaultPrevented || e.target !== this.box) return;
    const v = this.view;
    const step = (e.shiftKey ? KEY_PAN / 10 : KEY_PAN) * Math.min(v.w, v.h);
    switch (e.key) {
      case 'ArrowLeft': this.panBy(step, 0); break;
      case 'ArrowRight': this.panBy(-step, 0); break;
      case 'ArrowUp': this.panBy(0, step); break;
      case 'ArrowDown': this.panBy(0, -step); break;
      case '+': case '=': this.zoomAt(v.w / 2, v.h / 2, KEY_ZOOM); break;
      case '-': case '_': this.zoomAt(v.w / 2, v.h / 2, 1 / KEY_ZOOM); break;
      case '0': case 'Home': this.fit(); break;
      default: return;
    }
    e.preventDefault();
  };
}
