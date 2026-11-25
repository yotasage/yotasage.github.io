// Display messages and shared-memory layout between /python/python-worker.js (display-host.js) and the
// page renderer (lib/python/display/renderer.ts), P7a. Design: docs/python/notes-S4.md §6-§8.
// Worker messages are untrusted data: a malformed one is dropped, never repaired (security.md §4).
// The worker creates the display SABs and sends them in display.open, because a Tier 1 run never returns
// to the worker's event loop and so could not receive a page reply (notes-P7a.md).

// Control SAB slots 4..15 (slots 0..3 are the S3 stdin/interrupt slots in protocol.ts).
export const CTRL_DISPLAY_STATE = 4; // worker: id of the open display (generation, >= 1), 0 = none
export const CTRL_FB_SEQ = 5; // worker: frames presented
export const CTRL_FB_MID = 6; // both: triple-buffer middle slot = (id << 3) | FB_NEW | index
export const CTRL_VSYNC = 7; // page: bumped + notified every rAF while the display is shown
export const CTRL_HIDDEN = 8; // page: 1 while the document or the Display panel is hidden
export const CTRL_EV_HEAD = 9; // page: events written (notified)
export const CTRL_EV_TAIL = 10; // worker: events read
export const CTRL_CMD_MID = 11; // both: command triple-buffer middle slot (P7b)
export const CTRL_ACK = 12; // page: frames drawn or dropped (fallback backpressure, P7b)
export const CTRL_EV_DROPPED = 13; // page: events dropped because the ring was full
// Slots 14..15 stay reserved (resize handshake, RPC).

export const FB_NEW = 4; // bit 2 of CTRL_FB_MID: the middle slot holds a frame the page has not shown
export const FB_INDEX_MASK = 3;
export const FB_ID_SHIFT = 3;
export const FB_SLOTS = 3;

/** Framebuffer caps (notes-S4 §9: page cost grows with size; 1920x1080 is ~6 ms per frame in Firefox). */
export const MAX_DISPLAY_WIDTH = 1920;
export const MAX_DISPLAY_HEIGHT = 1080;
export const MAX_DISPLAY_TITLE_CHARS = 200;
const MAX_RAW_TITLE_CHARS = 4096;
export const MAX_DISPLAY_SCALE = 8;
export const MAX_DISPLAY_BATCH_BYTES = 4 * 1024 * 1024;

// Events ring: EV_CAPACITY records of EV_RECORD_BYTES, little-endian, page producer / worker consumer.
// i32 type @0, i32 x @4, i32 y @8, i32 button @12, i32 buttons @16, i32 mods @20, f64 t @24 (ms since
// the epoch, performance.timeOrigin + now()), f32 dx @32, f32 dy @36, u8 keyLen @40, u8 codeLen @41,
// u8 repeat @42, u8 reserved @43, key UTF-8 @44 (32 bytes), code UTF-8 @76 (20 bytes).
export const EV_CAPACITY = 256;
export const EV_RECORD_BYTES = 96;
export const EVENTS_SAB_BYTES = EV_CAPACITY * EV_RECORD_BYTES;
export const EV_KEY_OFFSET = 44;
export const EV_KEY_BYTES = 32;
export const EV_CODE_OFFSET = 76;
export const EV_CODE_BYTES = 20;

export const EV_POINTER_DOWN = 1;
export const EV_POINTER_UP = 2;
export const EV_POINTER_MOVE = 3;
export const EV_WHEEL = 4;
export const EV_KEY_DOWN = 5;
export const EV_KEY_UP = 6;
// 7 resize and 8 close are reserved for P7b.

export const MOD_SHIFT = 1;
export const MOD_CTRL = 2;
export const MOD_ALT = 4;
export const MOD_META = 8;

export type DisplayScale = 'fit' | 'pixel' | number;

export function framebufferBytes(width: number, height: number): number {
  return FB_SLOTS * width * height * 4;
}

export type DisplayWorkerMessage =
  | {
      readonly type: 'display.open';
      readonly id: number;
      readonly width: number;
      readonly height: number;
      readonly title: string;
      readonly scale: DisplayScale;
      readonly fbSab: SharedArrayBuffer;
      readonly eventsSab: SharedArrayBuffer;
    }
  | { readonly type: 'display.close'; readonly id: number }
  | { readonly type: 'display.batch'; readonly id: number; readonly buf: ArrayBuffer };

type DisplayValidation =
  | { readonly ok: true; readonly message: DisplayWorkerMessage }
  | { readonly ok: false; readonly reason: string };

function isId(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 0x0fffffff;
}

function clampDim(v: unknown, max: number): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  const n = Math.trunc(v);
  if (n < 1) return null;
  return Math.min(n, max);
}

// C0/C1 controls and bidi overrides/isolates: a title is shown as plain text and cannot reorder the UI.
const UNSAFE_TITLE_RE = /[\u0000-\u001f\u007f-\u009f‎‏‪-‮⁦-⁩]/g;

/** Plain-text title: controls and bidi marks removed, trimmed, at most 200 characters. */
export function cleanDisplayTitle(raw: string): string {
  return Array.from(raw.replace(UNSAFE_TITLE_RE, '').trim()).slice(0, MAX_DISPLAY_TITLE_CHARS).join('');
}

function isSab(v: unknown): v is SharedArrayBuffer {
  return typeof SharedArrayBuffer === 'function' && v instanceof SharedArrayBuffer;
}

/** Validates an untrusted display.* message from the worker; sizes are clamped, the title cleaned. */
export function validateDisplayMessage(raw: Record<string, unknown>): DisplayValidation {
  if (!isId(raw.id)) return { ok: false, reason: `Invalid ${String(raw.type)} id` };
  if (raw.type === 'display.close') return { ok: true, message: { type: 'display.close', id: raw.id } };
  if (raw.type === 'display.batch') {
    if (!(raw.buf instanceof ArrayBuffer) || raw.buf.byteLength > MAX_DISPLAY_BATCH_BYTES) {
      return { ok: false, reason: 'Invalid or oversized display.batch buffer' };
    }
    return { ok: true, message: { type: 'display.batch', id: raw.id, buf: raw.buf } };
  }
  const width = clampDim(raw.width, MAX_DISPLAY_WIDTH);
  const height = clampDim(raw.height, MAX_DISPLAY_HEIGHT);
  if (width === null || height === null) return { ok: false, reason: 'Invalid display.open size' };
  if (typeof raw.title !== 'string' || raw.title.length > MAX_RAW_TITLE_CHARS) {
    return { ok: false, reason: 'Invalid display.open title' };
  }
  let scale: DisplayScale;
  if (raw.scale === 'fit' || raw.scale === 'pixel') {
    scale = raw.scale;
  } else if (
    typeof raw.scale === 'number' &&
    Number.isInteger(raw.scale) &&
    raw.scale >= 1 &&
    raw.scale <= MAX_DISPLAY_SCALE
  ) {
    scale = raw.scale;
  } else {
    return { ok: false, reason: 'Invalid display.open scale' };
  }
  // The buffers must match the clamped size exactly, so the page never reads outside them.
  if (!isSab(raw.fbSab) || raw.fbSab.byteLength !== framebufferBytes(width, height)) {
    return { ok: false, reason: 'display.open framebuffer does not match its size' };
  }
  if (!isSab(raw.eventsSab) || raw.eventsSab.byteLength !== EVENTS_SAB_BYTES) {
    return { ok: false, reason: 'Invalid display.open events buffer' };
  }
  return {
    ok: true,
    message: {
      type: 'display.open',
      id: raw.id,
      width,
      height,
      title: cleanDisplayTitle(raw.title),
      scale,
      fbSab: raw.fbSab,
      eventsSab: raw.eventsSab,
    },
  };
}
