// Page side of the Python display (P7a): receives display.* from PythonWorkerClient, draws the shared
// framebuffer onto a canvas every animation frame, paces the worker (vsync counter, hidden flag) and
// writes input into the events ring. Framework-free; P8's Display panel wraps it.
// Design: docs/python/notes-S4.md §6-§8; slot use and the one-window rule: docs/python/notes-P7a.md.
// Everything in the shared buffers is written by the program and is untrusted: sizes come from the
// validated display.open (clamped to 1920x1080, buffers of exactly that size), indices are checked,
// and Python never sends CSS, markup or URLs here.

import {
  CTRL_DISPLAY_STATE,
  CTRL_EV_DROPPED,
  CTRL_EV_HEAD,
  CTRL_EV_TAIL,
  CTRL_FB_MID,
  CTRL_FB_SEQ,
  CTRL_HIDDEN,
  CTRL_VSYNC,
  EV_CAPACITY,
  EV_CODE_BYTES,
  EV_CODE_OFFSET,
  EV_KEY_BYTES,
  EV_KEY_DOWN,
  EV_KEY_OFFSET,
  EV_KEY_UP,
  EV_POINTER_DOWN,
  EV_POINTER_MOVE,
  EV_POINTER_UP,
  EV_RECORD_BYTES,
  EV_WHEEL,
  FB_ID_SHIFT,
  FB_INDEX_MASK,
  FB_NEW,
  MOD_ALT,
  MOD_CTRL,
  MOD_META,
  MOD_SHIFT,
} from '../displayProtocol';
import type { DisplayScale, DisplayWorkerMessage } from '../displayProtocol';
import type { PythonClientListeners } from '../workerClient';

/** What the renderer needs from PythonWorkerClient (its subscribe method). */
export interface DisplaySource {
  subscribe(listener: PythonClientListeners): () => void;
}

export interface DisplayInfo {
  readonly id: number;
  readonly width: number;
  readonly height: number;
  readonly title: string;
  readonly scale: DisplayScale;
  /** False after display.close (or the worker going away); the last frame stays on the canvas. */
  readonly open: boolean;
}

export interface DisplayStats {
  /** Frames copied onto the canvas. */
  readonly framesDrawn: number;
  /** Animation frames run while a display was open. */
  readonly rafTicks: number;
  /** Frames the program presented (CTRL_FB_SEQ). */
  readonly presented: number;
  /** Longest gap between two animation frames, ms. */
  readonly maxRafGapMs: number;
  /** Time spent copying and drawing frames, ms. */
  readonly drawMs: number;
  readonly eventsWritten: number;
  /** Pointer moves merged into a later move because the ring was full. */
  readonly eventsCoalesced: number;
  /** Events lost because the ring was full (CTRL_EV_DROPPED). */
  readonly eventsDropped: number;
}

export interface DisplayRendererOptions {
  readonly onOpen?: (info: DisplayInfo) => void;
  readonly onClose?: (info: DisplayInfo) => void;
}

export type PointerKind = 'down' | 'up' | 'move';

export interface PointerFields {
  readonly button?: number;
  readonly buttons?: number;
  readonly mods?: number;
}

interface PendingMove {
  readonly x: number;
  readonly y: number;
  readonly buttons: number;
  readonly mods: number;
  readonly t: number;
}

const encoder = new TextEncoder();
// TextEncoder.encodeInto refuses shared memory, so text is encoded here first and then copied.
const scratch = new Uint8Array(EV_KEY_BYTES);

function writeText(dst: Uint8Array, at: number, max: number, text: string): number {
  const { written } = encoder.encodeInto(text, scratch.subarray(0, max));
  dst.set(scratch.subarray(0, written), at);
  return written;
}

function clampInt(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(-1_000_000, Math.min(1_000_000, Math.trunc(v)));
}

function finiteOr0(v: number): number {
  return Number.isFinite(v) ? Math.max(-1e6, Math.min(1e6, v)) : 0;
}

/** Modifier bits (MOD_SHIFT | MOD_CTRL | MOD_ALT | MOD_META) of a DOM event. */
export function eventMods(e: { shiftKey: boolean; ctrlKey: boolean; altKey: boolean; metaKey: boolean }): number {
  return (e.shiftKey ? MOD_SHIFT : 0) | (e.ctrlKey ? MOD_CTRL : 0) | (e.altKey ? MOD_ALT : 0) | (e.metaKey ? MOD_META : 0);
}

export class DisplayRenderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly options: DisplayRendererOptions;
  private readonly unsubscribe: () => void;
  private ctx2d: CanvasRenderingContext2D | null = null;
  private ctrl: Int32Array | null = null;
  private fb: Uint8Array | null = null;
  private evI32: Int32Array | null = null;
  private evF64: Float64Array | null = null;
  private evF32: Float32Array | null = null;
  private evU8: Uint8Array | null = null;
  private image: ImageData | null = null;
  private frameBytes = 0;
  private front = 2;
  private rafHandle = 0;
  private lastRafAt = 0;
  private manualHidden = false;
  private hiddenApplied = -1;
  private pendingMove: PendingMove | null = null;
  private unbindInput: (() => void) | null = null;
  private disposed = false;
  private _info: DisplayInfo | null = null;
  private s = {
    framesDrawn: 0,
    rafTicks: 0,
    maxRafGapMs: 0,
    drawMs: 0,
    eventsWritten: 0,
    eventsCoalesced: 0,
  };

  private readonly onVisibility = () => this.applyHidden();
  private readonly tick = (now: number) => this.frame(now);

  constructor(source: DisplaySource, canvas: HTMLCanvasElement, options: DisplayRendererOptions = {}) {
    this.canvas = canvas;
    this.options = options;
    this.unsubscribe = source.subscribe({ display: (msg, control) => this.handle(msg, control) });
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', this.onVisibility);
  }

  get info(): DisplayInfo | null {
    return this._info;
  }

  /** True while the panel (setHidden) or the document is hidden: the program's waits then block. */
  get hidden(): boolean {
    return this.manualHidden || (typeof document !== 'undefined' && document.visibilityState === 'hidden');
  }

  /** The Display panel calls this when it is collapsed or scrolled away (P8). */
  setHidden(hidden: boolean): void {
    this.manualHidden = hidden;
    this.applyHidden();
  }

  stats(): DisplayStats {
    const ctrl = this.ctrl;
    return {
      ...this.s,
      presented: ctrl ? Atomics.load(ctrl, CTRL_FB_SEQ) : 0,
      eventsDropped: ctrl ? Atomics.load(ctrl, CTRL_EV_DROPPED) : 0,
    };
  }

  resetStats(): void {
    this.s = { framesDrawn: 0, rafTicks: 0, maxRafGapMs: 0, drawMs: 0, eventsWritten: 0, eventsCoalesced: 0 };
    this.lastRafAt = 0;
  }

  // --- worker messages ------------------------------------------------------------------------

  private handle(msg: DisplayWorkerMessage, control: Int32Array | null): void {
    if (this.disposed) return;
    if (msg.type === 'display.open') {
      if (!control) return;
      this.open(msg, control);
    } else if (msg.type === 'display.close') {
      if (this._info && (msg.id === 0 || msg.id === this._info.id)) this.close();
    }
    // display.batch: drawn by P7b's batch renderer.
  }

  private open(msg: Extract<DisplayWorkerMessage, { type: 'display.open' }>, control: Int32Array): void {
    this.stopLoop();
    this.pendingMove = null;
    this.ctrl = control;
    this.fb = new Uint8Array(msg.fbSab);
    this.evI32 = new Int32Array(msg.eventsSab);
    this.evF64 = new Float64Array(msg.eventsSab);
    this.evF32 = new Float32Array(msg.eventsSab);
    this.evU8 = new Uint8Array(msg.eventsSab);
    this.frameBytes = msg.width * msg.height * 4;
    this.front = 2;
    if (this.canvas.width !== msg.width) this.canvas.width = msg.width;
    if (this.canvas.height !== msg.height) this.canvas.height = msg.height;
    this.ctx2d = this.canvas.getContext('2d');
    this.image = new ImageData(msg.width, msg.height);
    this._info = {
      id: msg.id,
      width: msg.width,
      height: msg.height,
      title: msg.title,
      scale: msg.scale,
      open: true,
    };
    this.hiddenApplied = -1;
    this.applyHidden();
    this.startLoop();
    this.options.onOpen?.(this._info);
  }

  private close(): void {
    this.stopLoop();
    this.pendingMove = null;
    if (!this._info) return;
    this._info = { ...this._info, open: false };
    this.fb = null;
    this.evI32 = null;
    this.evF64 = null;
    this.evF32 = null;
    this.evU8 = null;
    this.options.onClose?.(this._info);
  }

  private isCurrent(): boolean {
    const ctrl = this.ctrl;
    return Boolean(ctrl && this._info?.open && Atomics.load(ctrl, CTRL_DISPLAY_STATE) === this._info.id);
  }

  private applyHidden(): void {
    const ctrl = this.ctrl;
    if (!ctrl || !this._info?.open) return;
    const h = this.hidden ? 1 : 0;
    if (h === this.hiddenApplied) return;
    this.hiddenApplied = h;
    Atomics.store(ctrl, CTRL_HIDDEN, h);
    // Wake a wait_frame / hidden present() so it re-reads the flag at once.
    Atomics.notify(ctrl, CTRL_VSYNC);
  }

  // --- frames ---------------------------------------------------------------------------------

  private startLoop(): void {
    if (this.rafHandle === 0 && typeof requestAnimationFrame === 'function') {
      this.lastRafAt = 0;
      this.rafHandle = requestAnimationFrame(this.tick);
    }
  }

  private stopLoop(): void {
    if (this.rafHandle !== 0) {
      cancelAnimationFrame(this.rafHandle);
      this.rafHandle = 0;
    }
  }

  private frame(now: number): void {
    this.rafHandle = 0;
    const ctrl = this.ctrl;
    // A newer display.open (already in the worker) or a close is on its way: stop touching the slots.
    if (!ctrl || !this.isCurrent()) return;
    if (this.lastRafAt > 0) this.s.maxRafGapMs = Math.max(this.s.maxRafGapMs, now - this.lastRafAt);
    this.lastRafAt = now;
    this.s.rafTicks += 1;
    this.flushPendingMove();
    if (!this.hidden) {
      Atomics.add(ctrl, CTRL_VSYNC, 1);
      Atomics.notify(ctrl, CTRL_VSYNC);
      this.drawNewest();
    }
    this.rafHandle = requestAnimationFrame(this.tick);
  }

  /** Takes the newest presented frame (triple-buffer swap) and draws it; false when there is none. */
  private drawNewest(): boolean {
    const ctrl = this.ctrl;
    const info = this._info;
    if (!ctrl || !info || !this.fb || !this.image || !this.ctx2d) return false;
    const mid = Atomics.load(ctrl, CTRL_FB_MID);
    if (mid >>> FB_ID_SHIFT !== info.id || (mid & FB_NEW) === 0 || (mid & FB_INDEX_MASK) > 2) return false;
    if (Atomics.compareExchange(ctrl, CTRL_FB_MID, mid, (info.id << FB_ID_SHIFT) | this.front) !== mid) {
      return false; // the worker swapped in a newer frame meanwhile: take it next frame
    }
    this.front = mid & FB_INDEX_MASK;
    const t0 = performance.now();
    const off = this.front * this.frameBytes;
    this.image.data.set(this.fb.subarray(off, off + this.frameBytes));
    this.ctx2d.putImageData(this.image, 0, 0);
    this.s.drawMs += performance.now() - t0;
    this.s.framesDrawn += 1;
    return true;
  }

  /** PNG of the frame on the canvas (the newest presented one), or null before the first frame. */
  screenshot(): Promise<Blob | null> {
    const info = this._info;
    if (!info || !this.image) return Promise.resolve(null);
    if (this.isCurrent()) this.drawNewest();
    const out = document.createElement('canvas');
    out.width = info.width;
    out.height = info.height;
    const ctx = out.getContext('2d');
    if (!ctx) return Promise.resolve(null);
    ctx.putImageData(this.image, 0, 0);
    return new Promise((resolve) => out.toBlob((b) => resolve(b), 'image/png'));
  }

  // --- input ----------------------------------------------------------------------------------

  /** Maps CSS pixels inside the canvas box to display pixels. */
  toDisplayPoint(canvasX: number, canvasY: number): { x: number; y: number } {
    const info = this._info;
    if (!info) return { x: 0, y: 0 };
    const rect = this.canvas.getBoundingClientRect();
    const sx = rect.width > 0 ? info.width / rect.width : 1;
    const sy = rect.height > 0 ? info.height / rect.height : 1;
    return { x: clampInt(Math.floor(canvasX * sx)), y: clampInt(Math.floor(canvasY * sy)) };
  }

  private now(): number {
    return performance.timeOrigin + performance.now();
  }

  /** Writes one record; false when the ring is full or no display is open. */
  private write(type: number, fill: (base: number) => void): boolean {
    const ctrl = this.ctrl;
    const i32 = this.evI32;
    if (!ctrl || !i32 || !this.evU8 || !this.isCurrent()) return false;
    const head = Atomics.load(ctrl, CTRL_EV_HEAD);
    const used = (head - Atomics.load(ctrl, CTRL_EV_TAIL)) | 0;
    if (used >= EV_CAPACITY || used < 0) return false;
    const base = ((head >>> 0) % EV_CAPACITY) * EV_RECORD_BYTES;
    this.evU8.fill(0, base, base + EV_RECORD_BYTES);
    i32[base >> 2] = type;
    fill(base);
    Atomics.store(ctrl, CTRL_EV_HEAD, (head + 1) | 0);
    Atomics.notify(ctrl, CTRL_EV_HEAD);
    this.s.eventsWritten += 1;
    return true;
  }

  private drop(): void {
    if (this.ctrl && this.isCurrent()) Atomics.add(this.ctrl, CTRL_EV_DROPPED, 1);
  }

  private writePointer(type: number, x: number, y: number, button: number, buttons: number, mods: number, t: number): boolean {
    return this.write(type, (base) => {
      const i = base >> 2;
      const i32 = this.evI32 as Int32Array;
      i32[i + 1] = x;
      i32[i + 2] = y;
      i32[i + 3] = button;
      i32[i + 4] = buttons;
      i32[i + 5] = mods;
      (this.evF64 as Float64Array)[(base + 24) >> 3] = t;
    });
  }

  private flushPendingMove(): void {
    const m = this.pendingMove;
    if (m && this.writePointer(EV_POINTER_MOVE, m.x, m.y, 0, m.buttons, m.mods, m.t)) this.pendingMove = null;
  }

  /**
   * A pointer event at CSS pixels (canvasX, canvasY) inside the canvas box. When the ring is full a
   * move is kept and merged with later moves (written at the next frame); other events are dropped.
   */
  pushPointer(kind: PointerKind, canvasX: number, canvasY: number, fields: PointerFields = {}): boolean {
    if (!this._info?.open) return false;
    const { x, y } = this.toDisplayPoint(canvasX, canvasY);
    const buttons = clampInt(fields.buttons ?? 0);
    const mods = clampInt(fields.mods ?? 0) & 15;
    const t = this.now();
    if (kind === 'move') {
      this.flushPendingMove();
      if (this.pendingMove) {
        this.pendingMove = { x, y, buttons, mods, t };
        this.s.eventsCoalesced += 1;
        return true;
      }
      if (!this.writePointer(EV_POINTER_MOVE, x, y, 0, buttons, mods, t)) this.pendingMove = { x, y, buttons, mods, t };
      return true;
    }
    this.flushPendingMove();
    const type = kind === 'down' ? EV_POINTER_DOWN : EV_POINTER_UP;
    if (this.writePointer(type, x, y, clampInt(fields.button ?? 0), buttons, mods, t)) return true;
    this.drop();
    return false;
  }

  /** A wheel turn at CSS pixels (canvasX, canvasY); dx, dy in pixels. */
  pushWheel(canvasX: number, canvasY: number, dx: number, dy: number, mods = 0): boolean {
    if (!this._info?.open) return false;
    this.flushPendingMove();
    const { x, y } = this.toDisplayPoint(canvasX, canvasY);
    const t = this.now();
    const ok = this.write(EV_WHEEL, (base) => {
      const i = base >> 2;
      const i32 = this.evI32 as Int32Array;
      i32[i + 1] = x;
      i32[i + 2] = y;
      i32[i + 5] = clampInt(mods) & 15;
      (this.evF64 as Float64Array)[(base + 24) >> 3] = t;
      const f32 = this.evF32 as Float32Array;
      f32[(base + 32) >> 2] = finiteOr0(dx);
      f32[(base + 36) >> 2] = finiteOr0(dy);
    });
    if (!ok) this.drop();
    return ok;
  }

  /** A key event: key and code as in KeyboardEvent (longer values are cut at a character). */
  pushKey(kind: 'down' | 'up', key: string, code: string, mods = 0, repeat = false): boolean {
    if (!this._info?.open) return false;
    this.flushPendingMove();
    const t = this.now();
    const ok = this.write(kind === 'down' ? EV_KEY_DOWN : EV_KEY_UP, (base) => {
      const u8 = this.evU8 as Uint8Array;
      const i = base >> 2;
      (this.evI32 as Int32Array)[i + 5] = clampInt(mods) & 15;
      (this.evF64 as Float64Array)[(base + 24) >> 3] = t;
      u8[base + 40] = writeText(u8, base + EV_KEY_OFFSET, EV_KEY_BYTES, String(key));
      u8[base + 41] = writeText(u8, base + EV_CODE_OFFSET, EV_CODE_BYTES, String(code).replace(/[^\x20-\x7e]/g, ''));
      u8[base + 42] = repeat ? 1 : 0;
    });
    if (!ok) this.drop();
    return ok;
  }

  /**
   * Feeds pointer, wheel and key events of `target` (default: the canvas) into the display. Keys
   * need focus, so a canvas without a tabIndex gets 0. Tab is left to the browser (no focus trap).
   */
  bindInput(target: HTMLElement = this.canvas): () => void {
    this.unbindInput?.();
    if (target.tabIndex < 0) target.tabIndex = 0;
    const rel = (e: MouseEvent) => {
      const r = this.canvas.getBoundingClientRect();
      return [e.clientX - r.left, e.clientY - r.top] as const;
    };
    const onPointer = (e: PointerEvent) => {
      if (!this._info?.open) return;
      const kind: PointerKind = e.type === 'pointerdown' ? 'down' : e.type === 'pointerup' ? 'up' : 'move';
      if (kind === 'down') {
        target.focus();
        try {
          target.setPointerCapture(e.pointerId);
        } catch {
          // not capturable (synthetic event)
        }
      }
      const [x, y] = rel(e);
      this.pushPointer(kind, x, y, { button: e.button, buttons: e.buttons, mods: eventMods(e) });
    };
    const onWheel = (e: WheelEvent) => {
      if (!this._info?.open) return;
      e.preventDefault();
      const scale = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
      const [x, y] = rel(e);
      this.pushWheel(x, y, e.deltaX * scale, e.deltaY * scale, eventMods(e));
    };
    const onKey = (e: KeyboardEvent) => {
      if (!this._info?.open || e.key === 'Tab') return;
      e.preventDefault();
      this.pushKey(e.type === 'keydown' ? 'down' : 'up', e.key, e.code, eventMods(e), e.repeat);
    };
    const pointerTypes = ['pointerdown', 'pointerup', 'pointermove'] as const;
    for (const t of pointerTypes) target.addEventListener(t, onPointer);
    target.addEventListener('wheel', onWheel, { passive: false });
    target.addEventListener('keydown', onKey);
    target.addEventListener('keyup', onKey);
    const unbind = () => {
      for (const t of pointerTypes) target.removeEventListener(t, onPointer);
      target.removeEventListener('wheel', onWheel);
      target.removeEventListener('keydown', onKey);
      target.removeEventListener('keyup', onKey);
      if (this.unbindInput === unbind) this.unbindInput = null;
    };
    this.unbindInput = unbind;
    return unbind;
  }

  /** Stops drawing and listening; a program still waiting is released (hidden cleared, waits woken). */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.stopLoop();
    this.unbindInput?.();
    this.unsubscribe();
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', this.onVisibility);
    if (this.ctrl && this.isCurrent()) {
      Atomics.store(this.ctrl, CTRL_HIDDEN, 0);
      Atomics.notify(this.ctrl, CTRL_VSYNC);
    }
    this.close();
    this.ctrl = null;
    this.image = null;
    this.ctx2d = null;
  }
}
