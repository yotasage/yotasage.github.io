// The view of the PCB viewer on a Canvas 2D. Every layer that is shown is drawn into its own canvas (paint.ts), and
// the layer canvases are put together on screen: stacked with their opacity in the layer view, or as the board looks
// in the realistic view (substrate, mask, copper, finish, silkscreen, holes). While the view is panned or zoomed, the
// last frame is moved and scaled, and the layers are drawn again when the gesture pauses, a few at a time so the page
// keeps responding. A press and release without moving is a click (or tap), for measuring.
import { Box, Contour, isEmptyBox, Layer, Pt, Side, unionBox } from '../model';
import { compositeLayers, compositeRealistic, Frame, freeSurface, newSurface, paintLayer, RealisticColors, RealisticInputs, recolor, sizeSurface, Surface } from './paint';
import { PreparedLayer, prepareLayer, PreparedShape, prepareShape } from './prepare';

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

export type ViewMode = 'layers' | 'realistic';

interface LayerCanvas extends Surface {
  // The view it was drawn with, and its colour; viewKey null when it must be drawn again.
  viewKey: string | null;
  color: string | null;
}

// The layers that make up one side in the realistic view.
export interface SideLayers {
  copper: Layer[];
  mask: Layer[];
  silk: Layer[];
  holes: Layer[];
}

export const BACKGROUND = '#16181c';
// After the last wheel or pointer movement, how long to wait before drawing the layers again.
const SETTLE_MS = 200;
// Time spent drawing layers before letting the browser show a frame.
const SLICE_MS = 40;
const MIN_SCALE = 1e-3;
const MAX_SCALE = 2e5;
// How far a pointer may move (CSS px) and still click; beyond it, the press pans.
const CLICK_SLOP_MOUSE = 4;
const CLICK_SLOP_TOUCH = 10;

function newLayerCanvas(): LayerCanvas {
  return { ...newSurface(), viewKey: null, color: null };
}

// Whether a drill layer reaches the outside of a side: blind and buried holes (X2 "Plated,1,2,…") only show on the
// side whose copper layer they start or end at.
function drillReaches(layer: Layer, side: Side, copperLayers: number): boolean {
  const m = /^(?:Plated|NonPlated|MixedPlating),(\d+),(\d+)/i.exec(layer.attrs?.['.FileFunction'] ?? '');
  if (!m) return true;
  const from = Math.min(Number(m[1]), Number(m[2]));
  const to = Math.max(Number(m[1]), Number(m[2]));
  if (side === 'top') return from === 1;
  return !copperLayers || to >= copperLayers;
}

// The layers of one side for the realistic view, chosen by kind and side only, so any board gets it.
export function sideLayers(layers: Layer[], side: 'top' | 'bottom'): SideLayers {
  const copperLayers = layers.filter((l) => l.kind === 'copper').length;
  return {
    copper: layers.filter((l) => l.kind === 'copper' && l.side === side),
    mask: layers.filter((l) => l.kind === 'mask' && l.side === side),
    silk: layers.filter((l) => l.kind === 'silk' && l.side === side),
    holes: layers.filter((l) => l.kind === 'drill' && drillReaches(l, side, copperLayers)),
  };
}

export class BoardView {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private layers: Layer[] = [];
  // Paths of each layer, made the first time the layer is drawn (hidden layers never are). Keyed by the items, which
  // stay the same when the board is built again after adding files or changing a layer's type.
  private prepared = new WeakMap<object, PreparedLayer>();
  private styles = new Map<string, LayerStyle>();
  private order: string[] = [];
  private flipped = false;
  private mode: ViewMode = 'layers';
  private colors: RealisticColors | null = null;
  private shape: PreparedShape | null = null;
  private view: ViewState = { scale: 1, cx: 0, cy: 0 };
  private width = 1;
  private height = 1;
  private dpr = 1;
  private layerCanvases = new Map<string, LayerCanvas>();
  // The last composited frame and the view it was drawn with, shown moved and scaled during gestures.
  private frame = newLayerCanvas();
  private frameView: ViewState | null = null;
  private frameFlipped = false;
  private scratch = newSurface();
  private temps: [Surface, Surface] = [newSurface(), newSurface()];
  private renderToken = 0;
  private rendering = false;
  private settleTimer: number | null = null;
  private rafId: number | null = null;
  private idleWaiters: (() => void)[] = [];
  private pointers = new Map<number, { x: number; y: number }>();
  private gesture: { kind: 'pan' | 'pinch'; startView: ViewState; x: number; y: number; dist?: number; moving?: boolean } | null = null;
  // A press that may still be a click: where it started, and with what.
  private press: { id: number; x: number; y: number; type: string } | null = null;
  private resizeObserver: ResizeObserver;
  private disposed = false;
  private cursorListeners = new Set<(p: Pt | null, pointerType: string) => void>();
  private viewListeners = new Set<() => void>();
  // Called when drawing starts and ends, for a busy indicator.
  onBusy: ((busy: boolean) => void) | null = null;
  // Called for a click or tap (press and release without moving), with the board point, the CSS point on the canvas
  // and the pointer type ('mouse', 'touch' or 'pen').
  onTap: ((p: Pt, css: { x: number; y: number }, pointerType: string) => void) | null = null;
  // Milliseconds the last full drawing took.
  lastDrawMs = 0;

  // Listens to the board point under the mouse (or the first touch), null when it leaves. Returns the way to stop.
  listenCursor(fn: (p: Pt | null, pointerType: string) => void): () => void {
    this.cursorListeners.add(fn);
    return () => this.cursorListeners.delete(fn);
  }

  // Listens to every change of the view: move, zoom, flip, resize (for overlays drawn over the canvas).
  listenView(fn: () => void): () => void {
    this.viewListeners.add(fn);
    return () => this.viewListeners.delete(fn);
  }

  private emitCursor(p: Pt | null, pointerType = 'mouse') {
    for (const fn of this.cursorListeners) fn(p, pointerType);
  }

  private emitView() {
    for (const fn of this.viewListeners) fn();
  }

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerup', this.onPointerUp);
    canvas.addEventListener('pointercancel', this.onPointerCancel);
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
    this.canvas.removeEventListener('pointercancel', this.onPointerCancel);
    this.canvas.removeEventListener('pointerleave', this.onPointerLeave);
    this.canvas.removeEventListener('wheel', this.onWheel);
    this.canvas.removeEventListener('keydown', this.onKeyDown);
    if (this.settleTimer !== null) clearTimeout(this.settleTimer);
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.renderToken += 1;
    for (const lc of this.layerCanvases.values()) freeSurface(lc);
    this.layerCanvases.clear();
    freeSurface(this.frame);
    freeSurface(this.scratch);
    for (const t of this.temps) freeSurface(t);
    this.resolveIdle();
  }

  // --- Content ---

  setLayers(layers: Layer[]) {
    this.layers = layers;
    const ids = new Set(layers.map((l) => l.id));
    for (const [id, lc] of this.layerCanvases) {
      if (!ids.has(id)) {
        freeSurface(lc);
        this.layerCanvases.delete(id);
      } else {
        lc.viewKey = null;
      }
    }
    this.requestRender(0);
  }

  // The board shape, for the realistic view.
  setShape(contours: Contour[] | null | undefined) {
    this.shape = contours?.length ? prepareShape(contours) : null;
    this.requestRender(0);
  }

  // Visibility, colour and opacity of each layer, and the order of the layers from the top of the list.
  setStyles(styles: Map<string, LayerStyle>, order: string[]) {
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
    this.emitView();
  }

  // The layer view, or the realistic view with its colours.
  setMode(mode: ViewMode, colors: RealisticColors | null) {
    this.mode = mode;
    this.colors = colors;
    this.requestRender(0);
  }

  isFlipped(): boolean {
    return this.flipped;
  }

  getView(): ViewState {
    return { ...this.view };
  }

  // --- View ---

  private visibleLayers(): Layer[] {
    return this.layers.filter((l) => this.styles.get(l.id)?.visible);
  }

  paths(layer: Layer): PreparedLayer {
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

  // The layers of the side in view, for the realistic view.
  sideLayers(): SideLayers {
    return sideLayers(this.layers, this.flipped ? 'bottom' : 'top');
  }

  // The layers in the current picture: shown ones in the layer view; the side's in the realistic view, with the outline.
  pictureLayers(): Layer[] {
    if (this.mode === 'layers') return this.drawOrder().filter((l) => this.styles.get(l.id)?.visible);
    const s = this.sideLayers();
    return [...s.copper, ...s.mask, ...s.silk, ...s.holes, ...this.layers.filter((l) => l.kind === 'outline')];
  }

  // The layers drawn into canvases for the current picture, with their colours.
  private drawnLayers(): { layer: Layer; color: string }[] {
    const color = (l: Layer) => this.styles.get(l.id)?.color ?? '#ffffff';
    if (this.mode === 'layers') return this.drawOrder().filter((l) => this.styles.get(l.id)?.visible).map((l) => ({ layer: l, color: color(l) }));
    const s = this.sideLayers();
    return [...s.copper, ...s.mask, ...s.silk, ...s.holes].map((l) => ({ layer: l, color: color(l) }));
  }

  // What the picture covers: the board shape in the realistic view, the shown layers in the layer view.
  contentBox(): Box | null {
    if (this.mode === 'realistic' && this.shape) return { ...this.shape.box };
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

  // A board point to CSS pixels of the canvas.
  cssPoint(p: Pt): { x: number; y: number } {
    const fx = this.flipped ? -1 : 1;
    return { x: (this.width / 2 + (p.x - this.view.cx) * this.view.scale * fx) / this.dpr, y: (this.height / 2 - (p.y - this.view.cy) * this.view.scale) / this.dpr };
  }

  // Millimetres per CSS pixel.
  get mmPerPixel(): number {
    return this.dpr / this.view.scale;
  }

  // The part of the board on screen, in board millimetres.
  screenBox(): Box {
    const hw = this.width / 2 / this.view.scale;
    const hh = this.height / 2 / this.view.scale;
    return { minX: this.view.cx - hw, minY: this.view.cy - hh, maxX: this.view.cx + hw, maxY: this.view.cy + hh };
  }

  // The frame of the canvas on screen.
  screenFrame(): Frame {
    return { scale: this.view.scale, cx: this.view.cx, cy: this.view.cy, flipped: this.flipped, width: this.width, height: this.height };
  }

  private setView(view: ViewState, settleMs: number) {
    this.view = view;
    this.invalidate();
    this.showMoved();
    this.requestRender(settleMs);
    this.emitView();
  }

  private invalidate() {
    for (const lc of this.layerCanvases.values()) lc.viewKey = null;
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
      sizeSurface(lc, w, h);
      lc.viewKey = null;
    }
    this.frameView = null;
    if (first) this.fit();
    this.requestRender(0);
    this.emitView();
  }

  // --- Drawing ---

  private viewKey(): string {
    const v = this.view;
    return `${v.scale}|${v.cx}|${v.cy}|${this.flipped}|${this.width}x${this.height}`;
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

  // Resolves when the picture on screen is up to date.
  whenDrawn(): Promise<void> {
    if (this.settleTimer === null && !this.rendering) return Promise.resolve();
    return new Promise((resolve) => this.idleWaiters.push(resolve));
  }

  private resolveIdle() {
    const waiters = this.idleWaiters;
    this.idleWaiters = [];
    for (const w of waiters) w();
  }

  // Draws every layer of the picture that is not up to date, a slice at a time, then puts them together.
  private async render() {
    if (this.disposed) return;
    const token = ++this.renderToken;
    this.rendering = true;
    const start = performance.now();
    let sliceStart = start;
    let busy = false;
    const key = this.viewKey();
    const frame = this.screenFrame();
    const jobs = this.drawnLayers();
    for (const { layer, color } of jobs) {
      let lc = this.layerCanvases.get(layer.id);
      if (!lc) {
        lc = newLayerCanvas();
        this.layerCanvases.set(layer.id, lc);
      }
      if (lc.viewKey === key) {
        // Up to date, perhaps in another colour: painted over in place.
        if (lc.color !== color) {
          recolor(lc, color);
          lc.color = color;
        }
        continue;
      }
      if (performance.now() - sliceStart > SLICE_MS) {
        if (!busy) {
          busy = true;
          this.onBusy?.(true);
        }
        await new Promise((resolve) => requestAnimationFrame(resolve));
        if (token !== this.renderToken || this.disposed) {
          this.onBusy?.(false);
          this.rendering = false;
          return;
        }
        sliceStart = performance.now();
      }
      paintLayer(lc, this.paths(layer), color, frame, this.scratch);
      lc.viewKey = key;
      lc.color = color;
    }
    // Layers not in the picture give their memory back.
    const used = new Set(jobs.map((j) => j.layer.id));
    for (const [id, lc] of this.layerCanvases) {
      if (used.has(id)) continue;
      freeSurface(lc);
      this.layerCanvases.delete(id);
    }
    this.composite(this.frame, BACKGROUND);
    this.frameView = { ...this.view };
    this.frameFlipped = this.flipped;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.globalAlpha = 1;
    this.ctx.globalCompositeOperation = 'copy';
    this.ctx.drawImage(this.frame.canvas, 0, 0);
    this.ctx.globalCompositeOperation = 'source-over';
    this.lastDrawMs = performance.now() - start;
    // For tests and curious users: how long the last drawing took, and how many there were.
    this.canvas.dataset.drawMs = String(Math.round(this.lastDrawMs));
    this.canvas.dataset.draws = String(Number(this.canvas.dataset.draws ?? 0) + 1);
    if (busy) this.onBusy?.(false);
    this.rendering = false;
    if (this.settleTimer === null) this.resolveIdle();
  }

  // Puts the layer canvases together into `target` (screen size), over the background or transparent.
  private composite(target: Surface, background: string | null) {
    sizeSurface(target, this.width, this.height);
    const canvasOf = (l: Layer) => this.layerCanvases.get(l.id)?.canvas;
    if (this.mode === 'layers') {
      const entries = this.drawOrder()
        .filter((l) => this.styles.get(l.id)?.visible && this.layerCanvases.get(l.id)?.viewKey)
        .map((l) => ({ canvas: canvasOf(l), opacity: this.styles.get(l.id).opacity }));
      compositeLayers(target, entries, background);
      return;
    }
    const s = this.sideLayers();
    const pick = (ls: Layer[]) => ls.map(canvasOf).filter(Boolean);
    compositeRealistic(target, { copper: pick(s.copper), mask: pick(s.mask), silk: pick(s.silk), holes: pick(s.holes) }, this.colors, this.shape, this.screenFrame(), this.temps, background);
  }

  // The picture on screen as a new canvas, with or without the background.
  async snapshot(transparent: boolean): Promise<HTMLCanvasElement> {
    await this.whenDrawn();
    const out = newSurface(this.width, this.height);
    this.composite(out, transparent ? null : BACKGROUND);
    return out.canvas;
  }

  // Paints the current picture (mode, layers, colours, side) for any frame into `target`, with layer surfaces from
  // `pool` (grown as needed), for exports. `pause` is awaited between layers; it may throw to stop.
  async paintFrame(target: Surface, f: Frame, background: string | null, pool: Surface[], pause: () => Promise<void>): Promise<void> {
    sizeSurface(target, f.width, f.height);
    const surface = (i: number) => {
      while (pool.length <= i) pool.push(newSurface());
      sizeSurface(pool[i], f.width, f.height);
      return pool[i];
    };
    const scratch = surface(0);
    if (this.mode === 'layers') {
      const ctx = target.ctx;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      ctx.clearRect(0, 0, f.width, f.height);
      if (background) {
        ctx.fillStyle = background;
        ctx.fillRect(0, 0, f.width, f.height);
      }
      const layer = surface(1);
      for (const l of this.drawOrder()) {
        const style = this.styles.get(l.id);
        if (!style?.visible) continue;
        await pause();
        paintLayer(layer, this.paths(l), style.color, f, scratch);
        ctx.globalAlpha = style.opacity;
        ctx.drawImage(layer.canvas, 0, 0);
        ctx.globalAlpha = 1;
      }
      return;
    }
    const s = this.sideLayers();
    let next = 3;
    const draw = async (ls: Layer[]) => {
      const out: HTMLCanvasElement[] = [];
      for (const l of ls) {
        await pause();
        const sf = surface(next++);
        paintLayer(sf, this.paths(l), this.styles.get(l.id)?.color ?? '#ffffff', f, scratch);
        out.push(sf.canvas);
      }
      return out;
    };
    const input: RealisticInputs = { copper: await draw(s.copper), mask: await draw(s.mask), silk: await draw(s.silk), holes: await draw(s.holes) };
    compositeRealistic(target, input, this.colors, this.shape, f, [surface(1), surface(2)], background);
  }

  // --- Input ---

  private cssOf(e: PointerEvent | WheelEvent): { x: number; y: number } {
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
    const p = this.cssOf(e);
    this.pointers.set(e.pointerId, p);
    // Touch screens have no hover: the point touched first shows its coordinates.
    if (e.pointerType !== 'mouse' && this.pointers.size === 1) this.emitCursor(this.boardPoint(p.x, p.y), e.pointerType);
    // The first pointer may click; a second one makes it a pinch.
    this.press = this.pointers.size === 1 && e.button === 0 ? { id: e.pointerId, x: p.x, y: p.y, type: e.pointerType } : null;
    this.startGesture();
    e.preventDefault();
  };

  private onPointerMove = (e: PointerEvent) => {
    const p = this.cssOf(e);
    if (e.pointerType === 'mouse') this.emitCursor(this.boardPoint(p.x, p.y));
    if (!this.pointers.has(e.pointerId)) return;
    this.pointers.set(e.pointerId, p);
    const g = this.gesture;
    if (!g) return;
    const fx = this.flipped ? -1 : 1;
    if (g.kind === 'pan') {
      if (!g.moving) {
        // A pan starts only past the click distance, so a click does not move the board.
        const slop = e.pointerType === 'mouse' ? CLICK_SLOP_MOUSE : CLICK_SLOP_TOUCH;
        if (Math.hypot(p.x - g.x, p.y - g.y) < slop) return;
        g.moving = true;
        this.press = null;
      }
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
    const press = this.press;
    this.pointers.delete(e.pointerId);
    if (this.canvas.hasPointerCapture(e.pointerId)) this.canvas.releasePointerCapture(e.pointerId);
    if (press && press.id === e.pointerId && !this.pointers.size) {
      this.press = null;
      this.onTap?.(this.boardPoint(press.x, press.y), { x: press.x, y: press.y }, press.type);
    }
    // From a pinch to a pan with the finger that is left, without a jump.
    this.startGesture();
    if (this.gesture) this.gesture.moving = true;
    if (!this.pointers.size) this.requestRender(0);
  };

  private onPointerCancel = (e: PointerEvent) => {
    this.press = null;
    this.onPointerUp(e);
  };

  private onPointerLeave = (e: PointerEvent) => {
    if (e.pointerType === 'mouse') this.emitCursor(null);
  };

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
    const delta = e.deltaY * unit;
    const at = this.cssOf(e);
    this.zoomBy(Math.exp(-delta * 0.0015), at);
    // The same point, now with the precision of the new zoom.
    this.emitCursor(this.boardPoint(at.x, at.y));
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
