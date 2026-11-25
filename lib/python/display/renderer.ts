// Page side of the Python display (P7a, P7b): receives display.* from PythonWorkerClient, draws each
// frame onto a canvas every animation frame (the framebuffer's pixels, or black when the frame has
// none, then the frame's draw commands through commands.ts), paces the worker (vsync counter, hidden
// flag), writes input into the events ring and passes on the visitor's close and resize requests.
// Framework-free; P8's Display panel wraps it.
// Design: docs/python/notes-S4.md §6-§8; slots and rules: docs/python/notes-P7a.md, notes-P7b.md.
// Everything in the shared buffers is written by the program and is untrusted: sizes come from the
// validated display.open (clamped to 1920x1080, buffers of exactly that size), indices are checked,
// and Python never sends CSS, markup or URLs here.

import { createDrawScratch, drawBatch } from './commands';
import {
  CMD_F_EXTERNAL,
  CMD_F_PIXELS,
  CMD_HEADER_BYTES,
  CMD_SLOT_BYTES,
  CMD_SLOT_PAYLOAD,
  CTRL_ACK,
  CTRL_CLOSE_REQ,
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
  EV_RESIZE,
  EV_WHEEL,
  FB_ID_SHIFT,
  FB_INDEX_MASK,
  FB_NEW,
  MAX_DISPLAY_HEIGHT,
  MAX_DISPLAY_WIDTH,
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
  /** Draw-command records drawn. */
  readonly commandsDrawn: number;
  /** Frames whose commands stopped at a bad record (or held an impossible slot length). */
  readonly batchErrors: number;
  /** Why the last bad batch stopped, or null. */
  readonly lastBatchError: string | null;
  /** display.batch messages received (frames whose commands did not fit a slot). */
  readonly batchesReceived: number;
  /** Frames drawn with commands from a display.batch message. */
  readonly externalDrawn: number;
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

interface ReceivedBatch {
  readonly seq: number;
  readonly bytes: Uint8Array;
}

const emptyStats = () => ({
  framesDrawn: 0,
  rafTicks: 0,
  maxRafGapMs: 0,
  drawMs: 0,
  eventsWritten: 0,
  eventsCoalesced: 0,
  commandsDrawn: 0,
  batchErrors: 0,
  lastBatchError: null as string | null,
  batchesReceived: 0,
  externalDrawn: 0,
});

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
  private cmdU8: Uint8Array | null = null;
  private cmdI32: Int32Array | null = null;
  /** Private copy of a command slot: decoded from here so the program cannot change it meanwhile. */
  private readonly cmdCopy = new Uint8Array(CMD_SLOT_PAYLOAD);
  private readonly scratch = createDrawScratch();
  /** The newest display.batch messages (at most 2), by frame seq. */
  private batches: ReceivedBatch[] = [];
  /** Seq of the frame in `front` waiting for its display.batch (0: none) and its flags. */
  private pendingSeq = 0;
  private pendingFlags = 0;
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
  private s = emptyStats();

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
    this.s = emptyStats();
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
    } else if (control) {
      this.receiveBatch(msg, control);
    }
  }

  /** A frame's commands that did not fit its slot: acknowledged at once (the worker sends the next only then). */
  private receiveBatch(msg: Extract<DisplayWorkerMessage, { type: 'display.batch' }>, control: Int32Array): void {
    Atomics.add(control, CTRL_ACK, 1);
    Atomics.notify(control, CTRL_ACK);
    this.s.batchesReceived += 1;
    if (!this._info?.open || msg.id !== this._info.id || control !== this.ctrl) return;
    const b = { seq: msg.seq, bytes: new Uint8Array(msg.buf) };
    this.batches.push(b);
    if (this.batches.length > 2) this.batches.shift();
    if (this.pendingSeq === msg.seq && this.isCurrent()) {
      this.pendingSeq = 0;
      this.batches = [];
      this.drawFrame(this.pendingFlags, b.bytes, true);
    }
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
    this.cmdU8 = new Uint8Array(msg.cmdSab);
    this.cmdI32 = new Int32Array(msg.cmdSab);
    this.batches = [];
    this.pendingSeq = 0;
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
    if (!this._info?.open) return;
    this._info = { ...this._info, open: false };
    this.fb = null;
    this.cmdU8 = null;
    this.cmdI32 = null;
    this.batches = [];
    this.pendingSeq = 0;
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

  /**
   * Takes the newest presented frame (triple-buffer swap) and draws its pixels and commands, which
   * share the slot index; false when there is none. A frame whose commands come by display.batch
   * waits in `front` until the message arrives (or a newer frame replaces it).
   */
  private drawNewest(): boolean {
    const ctrl = this.ctrl;
    const info = this._info;
    const cmdI32 = this.cmdI32;
    if (!ctrl || !info || !this.fb || !cmdI32 || !this.cmdU8) return false;
    const mid = Atomics.load(ctrl, CTRL_FB_MID);
    if (mid >>> FB_ID_SHIFT !== info.id || (mid & FB_NEW) === 0 || (mid & FB_INDEX_MASK) > 2) return false;
    if (Atomics.compareExchange(ctrl, CTRL_FB_MID, mid, (info.id << FB_ID_SHIFT) | this.front) !== mid) {
      return false; // the worker swapped in a newer frame meanwhile: take it next frame
    }
    this.front = mid & FB_INDEX_MASK;
    this.pendingSeq = 0;
    const h = (this.front * CMD_SLOT_BYTES) >> 2;
    const len = cmdI32[h];
    const flags = cmdI32[h + 1];
    const seq = cmdI32[h + 2];
    if (flags & CMD_F_EXTERNAL) {
      const i = this.batches.findIndex((b) => b.seq === seq);
      if (i >= 0) {
        const b = this.batches[i];
        this.batches.splice(0, i + 1);
        return this.drawFrame(flags, b.bytes, true);
      }
      if (this.batches.every((b) => b.seq < seq)) {
        this.pendingSeq = seq; // posted before the swap; its message is still on the way
        this.pendingFlags = flags;
        return false;
      }
      return this.drawFrame(flags, null, false); // replaced by a newer batch: pixels only
    }
    if (len < 0 || len > CMD_SLOT_PAYLOAD) {
      this.s.batchErrors += 1;
      this.s.lastBatchError = `command slot length ${len}`;
      return this.drawFrame(flags, null, false);
    }
    let cmds: Uint8Array | null = null;
    if (len > 0) {
      const base = this.front * CMD_SLOT_BYTES + CMD_HEADER_BYTES;
      this.cmdCopy.set(this.cmdU8.subarray(base, base + len));
      cmds = this.cmdCopy.subarray(0, len);
    }
    return this.drawFrame(flags, cmds, false);
  }

  /** Draws the frame in `front`: its pixels (or black), then its commands. */
  private drawFrame(flags: number, cmds: Uint8Array | null, external: boolean): boolean {
    const info = this._info;
    const ctx = this.ctx2d;
    if (!info || !ctx || !this.fb || !this.image) return false;
    const t0 = performance.now();
    if (flags & CMD_F_PIXELS) {
      const off = this.front * this.frameBytes;
      this.image.data.set(this.fb.subarray(off, off + this.frameBytes));
      ctx.putImageData(this.image, 0, 0);
    } else {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, info.width, info.height);
    }
    if (cmds) {
      const r = drawBatch(ctx, cmds, this.scratch);
      this.s.commandsDrawn += r.records;
      if (r.error) {
        this.s.batchErrors += 1;
        this.s.lastBatchError = r.error;
      }
      if (external) this.s.externalDrawn += 1;
    }
    this.s.drawMs += performance.now() - t0;
    this.s.framesDrawn += 1;
    return true;
  }

  /**
   * Draws an untrusted batch straight onto the canvas (the harness's malformed-batch checks; P8 has
   * no use for it). The bytes are copied first; the result says how far drawing got.
   */
  drawRawBatch(bytes: Uint8Array): { records: number; error: string | null } {
    const ctx = this.ctx2d ?? this.canvas.getContext('2d');
    if (!ctx) return { records: 0, error: 'no canvas context' };
    return drawBatch(ctx, bytes.slice(), this.scratch);
  }

  /**
   * The visitor closed the Display panel (P8): the program's display becomes closed (`d.closed`,
   * a "close" event, its waits end at once) and the last frame stays on the canvas. False when no
   * display is open.
   */
  requestClose(): boolean {
    const ctrl = this.ctrl;
    const info = this._info;
    if (!ctrl || !info?.open) return false;
    if (this.isCurrent()) {
      Atomics.store(ctrl, CTRL_CLOSE_REQ, info.id);
      Atomics.notify(ctrl, CTRL_VSYNC);
      Atomics.notify(ctrl, CTRL_EV_HEAD);
      Atomics.notify(ctrl, CTRL_ACK);
    }
    this.close();
    return true;
  }

  /**
   * Offers the program a new size (P8 calls it when the panel's box changes, for displays opened
   * with scale="window" only): a "resize" event with x, y = width, height, clamped to 1920x1080.
   * The program decides whether to follow it with d.resize(); the display keeps its size until then.
   */
  requestResize(width: number, height: number): boolean {
    const info = this._info;
    if (!info?.open || info.scale !== 'window') return false;
    const w = Math.min(MAX_DISPLAY_WIDTH, Math.max(1, clampInt(width)));
    const h = Math.min(MAX_DISPLAY_HEIGHT, Math.max(1, clampInt(height)));
    const ok = this.write(EV_RESIZE, (base) => {
      const i = base >> 2;
      const i32 = this.evI32 as Int32Array;
      i32[i + 1] = w;
      i32[i + 2] = h;
      (this.evF64 as Float64Array)[(base + 24) >> 3] = this.now();
    });
    if (!ok) this.drop();
    return ok;
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
    ctx.drawImage(this.canvas, 0, 0);
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
