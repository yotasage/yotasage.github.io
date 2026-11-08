// The layer view of the PCB viewer on a Canvas 2D: every visible layer is drawn into its own canvas (dark items in
// the layer's colour, clear items with destination-out), and the layer canvases are composited onto the screen with
// their opacity. While the view is panned or zoomed, the last frame is moved and scaled, and the layers are drawn
// again when the gesture pauses, a few at a time so the page keeps responding.
import { ArtItem, Box, isEmptyBox, Layer, Pt, unionBox } from '../model';
import { PreparedLayer, prepareLayer, Run } from './prepare';

export interface LayerStyle {
  visible: boolean;
  color: string;
  opacity: number;
}

export interface ViewState {
  // Device pixels per millimetre.
  scale: number;
  // The board point at the centre of the canvas.
  cx: number;
  cy: number;
}

interface LayerCanvas {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  // The view and colour it was drawn with; null when it must be drawn again.
  key: string | null;
}

const BACKGROUND = '#16181c';
// After the last wheel or pointer movement, how long to wait before drawing the layers again.
const SETTLE_MS = 200;
// Time spent drawing layers before letting the browser show a frame.
const SLICE_MS = 40;
// The thinnest line drawn, in device pixels, so thin outlines stay visible when zoomed out.
const MIN_LINE_PX = 0.8;
const MIN_SCALE = 1e-3;
const MAX_SCALE = 2e5;

function newCanvas(): LayerCanvas {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  return { canvas, ctx, key: null };
}

export class BoardView {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private layers: Layer[] = [];
  // Paths of each layer, made the first time the layer is drawn (hidden layers never are). Keyed by the items, which
  // stay the same when the board is built again after adding files or changing a layer's type.
  private prepared = new WeakMap<ArtItem[], PreparedLayer>();
  private styles = new Map<string, LayerStyle>();
  private order: string[] = [];
  private flipped = false;
  private view: ViewState = { scale: 1, cx: 0, cy: 0 };
  private width = 1;
  private height = 1;
  private dpr = 1;
  private layerCanvases = new Map<string, LayerCanvas>();
  // The last composited frame and the view it was drawn with, shown moved and scaled during gestures.
  private frame = newCanvas();
  private frameView: ViewState | null = null;
  private frameFlipped = false;
  private scratch = newCanvas();
  private renderToken = 0;
  private settleTimer: number | null = null;
  private rafId: number | null = null;
  private pointers = new Map<number, { x: number; y: number }>();
  private gesture: { kind: 'pan' | 'pinch'; startView: ViewState; x: number; y: number; dist?: number } | null = null;
  private resizeObserver: ResizeObserver;
  private disposed = false;
  // Called with the board point under the mouse, or null when it leaves.
  onCursor: ((p: Pt | null) => void) | null = null;
  // Called when drawing starts and ends, for a busy indicator.
  onBusy: ((busy: boolean) => void) | null = null;
  // Milliseconds the last full drawing took.
  lastDrawMs = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerup', this.onPointerUp);
    canvas.addEventListener('pointercancel', this.onPointerUp);
    canvas.addEventListener('pointerleave', this.onPointerLeave);
    canvas.addEventListener('wheel', this.onWheel, { passive: false });
    canvas.addEventListener('keydown', this.onKeyDown);
    this.resize();
  }

  dispose() {
    this.disposed = true;
    this.resizeObserver.disconnect();
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('pointerup', this.onPointerUp);
    this.canvas.removeEventListener('pointercancel', this.onPointerUp);
    this.canvas.removeEventListener('pointerleave', this.onPointerLeave);
    this.canvas.removeEventListener('wheel', this.onWheel);
    this.canvas.removeEventListener('keydown', this.onKeyDown);
    if (this.settleTimer !== null) clearTimeout(this.settleTimer);
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.renderToken += 1;
    for (const lc of this.layerCanvases.values()) lc.canvas.width = lc.canvas.height = 0;
    this.layerCanvases.clear();
    this.frame.canvas.width = this.frame.canvas.height = 0;
    this.scratch.canvas.width = this.scratch.canvas.height = 0;
  }

  // --- Content ---

  setLayers(layers: Layer[]) {
    this.layers = layers;
    const ids = new Set(layers.map((l) => l.id));
    for (const [id, lc] of this.layerCanvases) {
      if (!ids.has(id)) {
        lc.canvas.width = lc.canvas.height = 0;
        this.layerCanvases.delete(id);
      } else {
        lc.key = null;
      }
    }
    this.requestRender(0);
  }

  // Visibility, colour and opacity of each layer, and the order of the layers from the top of the list.
  setStyles(styles: Map<string, LayerStyle>, order: string[]) {
    for (const [id, style] of styles) {
      const old = this.styles.get(id);
      const lc = this.layerCanvases.get(id);
      if (!lc) continue;
      if (!style.visible) {
        // Hidden layers give their memory back.
        lc.canvas.width = lc.canvas.height = 0;
        this.layerCanvases.delete(id);
      } else if (old && old.color !== style.color && lc.key) {
        // A new colour: the layer canvas has one colour, so it is painted over in place.
        lc.ctx.setTransform(1, 0, 0, 1, 0, 0);
        lc.ctx.globalCompositeOperation = 'source-in';
        lc.ctx.globalAlpha = 1;
        lc.ctx.fillStyle = style.color;
        lc.ctx.fillRect(0, 0, lc.canvas.width, lc.canvas.height);
        lc.ctx.globalCompositeOperation = 'source-over';
        lc.key = this.layerKey(id, style.color);
      }
    }
    this.styles = new Map(styles);
    this.order = order.slice();
    this.requestRender(0);
  }

  setFlipped(flipped: boolean) {
    if (flipped === this.flipped) return;
    // Keeps the same part of the board in view: mirrored, the centre stays the centre.
    this.flipped = flipped;
    this.invalidate();
    this.requestRender(0);
  }

  getView(): ViewState {
    return { ...this.view };
  }

  // --- View ---

  private visibleLayers(): Layer[] {
    return this.layers.filter((l) => this.styles.get(l.id)?.visible);
  }

  private paths(layer: Layer): PreparedLayer {
    let p = this.prepared.get(layer.items);
    if (!p) {
      p = prepareLayer(layer);
      this.prepared.set(layer.items, p);
    }
    return p;
  }

  // The order layers are drawn in: the bottom of the list first, so the top of the list is on top. Seen from the
  // bottom, the layers of a side (top, inner, bottom) are drawn in the opposite order, in the same places among the
  // layers that belong to neither side.
  drawOrder(): Layer[] {
    const byId = new Map(this.layers.map((l) => [l.id, l]));
    const listed = this.order.map((id) => byId.get(id)).filter(Boolean);
    for (const l of this.layers) if (!this.order.includes(l.id)) listed.push(l);
    const drawn = listed.reverse();
    if (!this.flipped) return drawn;
    const sided = drawn.filter((l) => l.side !== 'none').reverse();
    let k = 0;
    return drawn.map((l) => (l.side !== 'none' ? sided[k++] : l));
  }

  private contentBox(): Box | null {
    let box: Box | null = null;
    const layers = this.visibleLayers().length ? this.visibleLayers() : this.layers;
    for (const l of layers) {
      const b = l.bbox;
      if (isEmptyBox(b)) continue;
      box = box ? unionBox(box, b) : { ...b };
    }
    return box;
  }

  fit(box: Box | null = this.contentBox()) {
    if (!box) return;
    const w = Math.max(box.maxX - box.minX, 1e-3);
    const h = Math.max(box.maxY - box.minY, 1e-3);
    const scale = Math.min(this.width / (w * 1.08), this.height / (h * 1.08));
    this.setView({ scale: Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale)), cx: (box.minX + box.maxX) / 2, cy: (box.minY + box.maxY) / 2 }, 0);
  }

  // Zooms by a factor around a point in CSS pixels of the canvas (the centre if not given).
  zoomBy(factor: number, at?: { x: number; y: number }) {
    const px = at ? at.x * this.dpr : this.width / 2;
    const py = at ? at.y * this.dpr : this.height / 2;
    const before = this.toBoard(px, py);
    const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, this.view.scale * factor));
    const fx = this.flipped ? -1 : 1;
    // Keeps the board point under (px, py) where it is.
    const cx = before.x - (px - this.width / 2) / (scale * fx);
    const cy = before.y + (py - this.height / 2) / scale;
    this.setView({ scale, cx, cy }, SETTLE_MS);
  }

  panBy(dxCss: number, dyCss: number) {
    const fx = this.flipped ? -1 : 1;
    this.setView({ ...this.view, cx: this.view.cx - (dxCss * this.dpr) / (this.view.scale * fx), cy: this.view.cy + (dyCss * this.dpr) / this.view.scale }, SETTLE_MS);
  }

  // A device pixel of the canvas to a board point.
  private toBoard(px: number, py: number): Pt {
    const fx = this.flipped ? -1 : 1;
    return { x: this.view.cx + (px - this.width / 2) / (this.view.scale * fx), y: this.view.cy - (py - this.height / 2) / this.view.scale };
  }

  // A point in CSS pixels of the canvas to a board point.
  boardPoint(x: number, y: number): Pt {
    return this.toBoard(x * this.dpr, y * this.dpr);
  }

  // Millimetres per CSS pixel.
  get mmPerPixel(): number {
    return this.dpr / this.view.scale;
  }

  private setView(view: ViewState, settleMs: number) {
    this.view = view;
    this.invalidate();
    this.showMoved();
    this.requestRender(settleMs);
  }

  private invalidate() {
    for (const lc of this.layerCanvases.values()) lc.key = null;
  }

  private resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(rect.width * this.dpr));
    const h = Math.max(1, Math.round(rect.height * this.dpr));
    if (w === this.width && h === this.height && this.canvas.width === w) return;
    const first = this.width === 1 && this.height === 1;
    this.width = w;
    this.height = h;
    this.canvas.width = w;
    this.canvas.height = h;
    for (const lc of this.layerCanvases.values()) {
      lc.canvas.width = w;
      lc.canvas.height = h;
      lc.key = null;
    }
    this.frameView = null;
    if (first) this.fit();
    this.requestRender(0);
  }

  // --- Drawing ---

  private layerKey(id: string, color: string): string {
    const v = this.view;
    return `${v.scale}|${v.cx}|${v.cy}|${this.flipped}|${this.width}x${this.height}|${color}|${id}`;
  }

  // The last frame, moved and scaled to the current view.
  private showMoved() {
    if (this.rafId !== null) return;
    this.rafId = requestAnimationFrame(() => {
      this.rafId = null;
      const ctx = this.ctx;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = BACKGROUND;
      ctx.fillRect(0, 0, this.width, this.height);
      const fv = this.frameView;
      if (!fv || this.frameFlipped !== this.flipped) return;
      const k = this.view.scale / fv.scale;
      const fx = this.flipped ? -1 : 1;
      const e = this.width / 2 + (fv.cx - this.view.cx) * this.view.scale * fx - (k * this.width) / 2;
      const f = this.height / 2 - (fv.cy - this.view.cy) * this.view.scale - (k * this.height) / 2;
      ctx.setTransform(k, 0, 0, k, e, f);
      ctx.imageSmoothingEnabled = k < 1;
      ctx.drawImage(this.frame.canvas, 0, 0);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    });
  }

  // Draws the layers again after `delayMs`, unless the view changes again before; a drawing in progress stops.
  requestRender(delayMs = 0) {
    if (this.settleTimer !== null) clearTimeout(this.settleTimer);
    this.renderToken += 1;
    this.settleTimer = window.setTimeout(() => {
      this.settleTimer = null;
      void this.render();
    }, delayMs);
  }

  // Draws every visible layer that is not up to date, a slice at a time, then composites them.
  private async render() {
    if (this.disposed) return;
    const token = ++this.renderToken;
    const start = performance.now();
    let sliceStart = start;
    let busy = false;
    for (const layer of this.drawOrder()) {
      const style = this.styles.get(layer.id);
      if (!style?.visible) continue;
      let lc = this.layerCanvases.get(layer.id);
      if (!lc) {
        lc = newCanvas();
        lc.canvas.width = this.width;
        lc.canvas.height = this.height;
        this.layerCanvases.set(layer.id, lc);
      }
      const key = this.layerKey(layer.id, style.color);
      if (lc.key === key) continue;
      if (performance.now() - sliceStart > SLICE_MS) {
        if (!busy) {
          busy = true;
          this.onBusy?.(true);
        }
        await new Promise((resolve) => requestAnimationFrame(resolve));
        if (token !== this.renderToken || this.disposed) {
          this.onBusy?.(false);
          return;
        }
        sliceStart = performance.now();
      }
      this.drawLayer(this.paths(layer), style, lc);
      lc.key = key;
    }
    this.composite();
    this.lastDrawMs = performance.now() - start;
    // For tests and curious users: how long the last drawing took, and how many there were.
    this.canvas.dataset.drawMs = String(Math.round(this.lastDrawMs));
    this.canvas.dataset.draws = String(Number(this.canvas.dataset.draws ?? 0) + 1);
    if (busy) this.onBusy?.(false);
  }

  private composite() {
    const f = this.frame;
    if (f.canvas.width !== this.width || f.canvas.height !== this.height) {
      f.canvas.width = this.width;
      f.canvas.height = this.height;
    }
    const ctx = f.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.fillStyle = BACKGROUND;
    ctx.fillRect(0, 0, this.width, this.height);
    for (const layer of this.drawOrder()) {
      const style = this.styles.get(layer.id);
      const lc = this.layerCanvases.get(layer.id);
      if (!style?.visible || !lc?.key) continue;
      ctx.globalAlpha = style.opacity;
      ctx.drawImage(lc.canvas, 0, 0);
    }
    ctx.globalAlpha = 1;
    this.frameView = { ...this.view };
    this.frameFlipped = this.flipped;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.globalAlpha = 1;
    this.ctx.globalCompositeOperation = 'copy';
    this.ctx.drawImage(f.canvas, 0, 0);
    this.ctx.globalCompositeOperation = 'source-over';
  }

  // The transform from a layer's path coordinates (board mm relative to its origin) to device pixels.
  private matrix(origin: Pt): [number, number, number, number, number, number] {
    const s = this.view.scale;
    const fx = this.flipped ? -1 : 1;
    const a = s * fx;
    const d = -s;
    const e = this.width / 2 + (origin.x - this.view.cx) * a;
    const f = this.height / 2 + (origin.y - this.view.cy) * d;
    return [a, 0, 0, d, e, f];
  }

  private drawLayer(pl: PreparedLayer, style: LayerStyle, lc: LayerCanvas) {
    const ctx = lc.ctx;
    if (lc.canvas.width !== this.width || lc.canvas.height !== this.height) {
      lc.canvas.width = this.width;
      lc.canvas.height = this.height;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, this.width, this.height);
    const m = this.matrix(pl.origin);
    const minLine = MIN_LINE_PX / this.view.scale;
    ctx.fillStyle = style.color;
    ctx.strokeStyle = style.color;
    ctx.lineJoin = 'round';
    // The part of the board on screen, in the coordinates of the paths, to skip tiles that are not.
    const halfW = this.width / 2 / this.view.scale;
    const halfH = this.height / 2 / this.view.scale;
    const vx = this.view.cx - pl.origin.x;
    const vy = this.view.cy - pl.origin.y;
    const pad = minLine;
    for (const run of pl.runs) {
      ctx.setTransform(...m);
      ctx.globalCompositeOperation = run.dark ? 'source-over' : 'destination-out';
      for (const tile of run.tiles) {
        const t = tile.box;
        if (t.maxX < vx - halfW - pad || t.minX > vx + halfW + pad || t.maxY < vy - halfH - pad || t.minY > vy + halfH + pad) continue;
        if (tile.fill) ctx.fill(tile.fill);
        for (const g of tile.strokes) {
          ctx.lineWidth = Math.max(g.w, minLine);
          ctx.lineCap = g.cap;
          ctx.stroke(g.path);
        }
      }
      if (run.separate.length) this.drawSeparate(pl, run, m, ctx, style.color);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
  }

  // Flashes whose apertures have holes that cannot be drawn with the non-zero rule: each is drawn into a scratch
  // canvas, where its clear parts erase only its own solid parts, and then copied onto the layer.
  private drawSeparate(pl: PreparedLayer, run: Run, m: [number, number, number, number, number, number], ctx: CanvasRenderingContext2D, color: string) {
    const s = this.scratch;
    if (s.canvas.width !== this.width || s.canvas.height !== this.height) {
      s.canvas.width = this.width;
      s.canvas.height = this.height;
    }
    const sctx = s.ctx;
    sctx.fillStyle = color;
    const [a, , , d, e, f] = m;
    const scale = Math.abs(a);
    for (const fl of run.separate) {
      const x = a * fl.e + e;
      const y = d * fl.f + f;
      const r = fl.r * scale + 2;
      if (x + r < 0 || y + r < 0 || x - r > this.width || y - r > this.height) continue;
      const parts = pl.apertureParts.get(fl.ap);
      if (!parts) continue;
      if (r < 3) {
        // A few pixels across: the holes do not show, so the solid parts are drawn directly.
        ctx.setTransform(a * fl.a, d * fl.b, a * fl.c, d * fl.d, x, y);
        for (const p of parts) if (p.dark) ctx.fill(p.path);
        continue;
      }
      const x0 = Math.max(0, Math.floor(x - r));
      const y0 = Math.max(0, Math.floor(y - r));
      const x1 = Math.min(this.width, Math.ceil(x + r));
      const y1 = Math.min(this.height, Math.ceil(y + r));
      if (x1 <= x0 || y1 <= y0) continue;
      sctx.setTransform(1, 0, 0, 1, 0, 0);
      sctx.globalCompositeOperation = 'source-over';
      sctx.clearRect(x0, y0, x1 - x0, y1 - y0);
      sctx.setTransform(a * fl.a, d * fl.b, a * fl.c, d * fl.d, x, y);
      for (const p of parts) {
        sctx.globalCompositeOperation = p.dark ? 'source-over' : 'destination-out';
        sctx.fill(p.path);
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(s.canvas, x0, y0, x1 - x0, y1 - y0, x0, y0, x1 - x0, y1 - y0);
    }
    ctx.setTransform(...m);
  }

  // --- Input ---

  private cssPoint(e: PointerEvent | WheelEvent): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  private startGesture() {
    const pts = [...this.pointers.values()];
    if (pts.length >= 2) {
      const [p, q] = pts;
      this.gesture = { kind: 'pinch', startView: { ...this.view }, x: (p.x + q.x) / 2, y: (p.y + q.y) / 2, dist: Math.hypot(p.x - q.x, p.y - q.y) };
    } else if (pts.length === 1) {
      this.gesture = { kind: 'pan', startView: { ...this.view }, x: pts[0].x, y: pts[0].y };
    } else {
      this.gesture = null;
    }
  }

  private onPointerDown = (e: PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0 && e.button !== 1) return;
    this.canvas.setPointerCapture(e.pointerId);
    const p = this.cssPoint(e);
    this.pointers.set(e.pointerId, p);
    // Touch screens have no hover: the point touched first shows its coordinates.
    if (e.pointerType !== 'mouse' && this.pointers.size === 1) this.onCursor?.(this.boardPoint(p.x, p.y));
    this.startGesture();
    e.preventDefault();
  };

  private onPointerMove = (e: PointerEvent) => {
    const p = this.cssPoint(e);
    if (e.pointerType === 'mouse') this.onCursor?.(this.boardPoint(p.x, p.y));
    if (!this.pointers.has(e.pointerId)) return;
    this.pointers.set(e.pointerId, p);
    const g = this.gesture;
    if (!g) return;
    const fx = this.flipped ? -1 : 1;
    if (g.kind === 'pan') {
      const v = g.startView;
      this.setView({ scale: v.scale, cx: v.cx - ((p.x - g.x) * this.dpr) / (v.scale * fx), cy: v.cy + ((p.y - g.y) * this.dpr) / v.scale }, SETTLE_MS);
    } else if (this.pointers.size >= 2) {
      const [a, b] = [...this.pointers.values()];
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const v = g.startView;
      const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, v.scale * (dist / Math.max(1, g.dist))));
      // The board point that was under the starting midpoint goes under the current midpoint.
      const bx = v.cx + ((g.x * this.dpr) - this.width / 2) / (v.scale * fx);
      const by = v.cy - ((g.y * this.dpr) - this.height / 2) / v.scale;
      this.setView({ scale, cx: bx - ((mid.x * this.dpr) - this.width / 2) / (scale * fx), cy: by + ((mid.y * this.dpr) - this.height / 2) / scale }, SETTLE_MS);
    }
  };

  private onPointerUp = (e: PointerEvent) => {
    if (!this.pointers.has(e.pointerId)) return;
    this.pointers.delete(e.pointerId);
    if (this.canvas.hasPointerCapture(e.pointerId)) this.canvas.releasePointerCapture(e.pointerId);
    // From a pinch to a pan with the finger that is left, without a jump.
    this.startGesture();
    if (!this.pointers.size) this.requestRender(0);
  };

  private onPointerLeave = (e: PointerEvent) => {
    if (e.pointerType === 'mouse') this.onCursor?.(null);
  };

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
    const delta = e.deltaY * unit;
    const at = this.cssPoint(e);
    this.zoomBy(Math.exp(-delta * 0.0015), at);
    // The same point, now with the precision of the new zoom.
    this.onCursor?.(this.boardPoint(at.x, at.y));
  };

  private onKeyDown = (e: KeyboardEvent) => {
    const step = 60;
    switch (e.key) {
      case '+':
      case '=':
        this.zoomBy(1.4);
        break;
      case '-':
      case '_':
        this.zoomBy(1 / 1.4);
        break;
      case 'ArrowLeft':
        this.panBy(step, 0);
        break;
      case 'ArrowRight':
        this.panBy(-step, 0);
        break;
      case 'ArrowUp':
        this.panBy(0, step);
        break;
      case 'ArrowDown':
        this.panBy(0, -step);
        break;
      case 'f':
      case 'F':
      case '0':
        this.fit();
        break;
      default:
        return;
    }
    e.preventDefault();
  };
}
