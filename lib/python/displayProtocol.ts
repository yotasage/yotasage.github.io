// Display messages and shared-memory layout between /python/python-worker.js (display-host.js) and the
// page renderer (lib/python/display/renderer.ts), P7a; draw commands and their batch layout, P7b
// (decoded by lib/python/display/commands.ts). Design: docs/python/notes-S4.md §6-§8, notes-P7b.md.
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
// Slot 11 (CTRL_CMD_MID in notes-S4) stays unused: a frame's commands live in the command slot with
// the same index as its pixels, so one swap on CTRL_FB_MID publishes both together (notes-P7b.md).
export const CTRL_ACK = 12; // page: display.batch messages received (the worker keeps one in flight)
export const CTRL_EV_DROPPED = 13; // page: events dropped because the ring was full
export const CTRL_CLOSE_REQ = 14; // page: id of the display the visitor closed (renderer.requestClose)
// Slot 15 stays reserved.

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

// Command slots: FB_SLOTS slots of CMD_SLOT_BYTES in cmdSab, slot i belonging to framebuffer slot i.
// Header (i32, little-endian): length @0 (bytes of records, or of the display.batch when external),
// flags @4 (CMD_F_*), frame seq @8 (1..2^31-1, matches display.batch seq), reserved @12.
export const CMD_SLOT_BYTES = 256 * 1024;
export const CMD_HEADER_BYTES = 16;
export const CMD_SLOT_PAYLOAD = CMD_SLOT_BYTES - CMD_HEADER_BYTES;
export const CMD_SAB_BYTES = FB_SLOTS * CMD_SLOT_BYTES;
export const CMD_F_PIXELS = 1; // the frame has pixels in the framebuffer slot (else it starts black)
export const CMD_F_EXTERNAL = 2; // the records did not fit: they come as display.batch with this seq

// Batch records, 4-byte aligned, little-endian. Every record starts with a u32 header:
// op (bits 0-7) | flags (bits 8-15) << 8 | aux (bits 16-31) << 16. Numbers are f32, colours u32
// RGBA (r in the low byte). Sizes in bytes; n = point count, len = UTF-8 bytes, w*h = image pixels.
export const OP_CLEAR = 1; // color                                               8
export const OP_FILL_RECT = 2; // x y w h, color                                  24
export const OP_RECT = 3; // x y w h width, color (stroke)                        28
export const OP_LINE = 4; // x1 y1 x2 y2 width, color                             28
export const OP_POLY = 5; // u32 n, width, color, n x (x y); flags CLOSED | FILL   16 + 8n
export const OP_CIRCLE = 6; // cx cy r width, color; flags FILL                    24
export const OP_ELLIPSE = 7; // cx cy rx ry rotation width, color; flags FILL      32
export const OP_ARC = 8; // cx cy r start end width, color; flags FILL (a pie)     32
export const OP_TEXT = 9; // x y size, color, UTF-8 (aux = len, padded to 4);      20 + len
//                           flags: font (bits 0-1) | align (bits 2-3) | baseline (bits 4-5)
export const OP_IMAGE = 10; // x y dw dh, u16 w, u16 h, w*h RGBA bytes; flags SMOOTH  24 + 4wh
export const OP_SAVE = 11; //                                                     4
export const OP_RESTORE = 12; //                                                  4
export const OP_TRANSLATE = 13; // dx dy                                          12
export const OP_ROTATE = 14; // radians                                           8
export const OP_SCALE = 15; // sx sy                                              12
export const OP_CLIP_RECT = 16; // x y w h                                        20
export const OP_ALPHA = 17; // 0..1                                               8
export const CMD_FLAG_CLOSED = 1;
export const CMD_FLAG_FILL = 2;
export const CMD_FLAG_SMOOTH = 1;

/** Caps the page enforces on every record (vdisplay.py checks the same ones first). */
export const MAX_PATH_POINTS = 65536;
export const MAX_TEXT_BYTES = 4096;
export const MAX_TEXT_SIZE = 512;
export const MAX_IMAGE_WIDTH = 1920;
export const MAX_IMAGE_HEIGHT = 1080;
export const MAX_SAVE_DEPTH = 64;
export const MAX_LINE_WIDTH = 1024;
/** Font list (index = font field): the page maps each to its own self-hosted or generic family. */
export const DISPLAY_FONTS = ['sans', 'serif', 'mono'] as const;

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
export const EV_RESIZE = 7; // x, y = the size the panel offers (scale "window" only, requestResize)
// 8 (close) is not written to the ring: CTRL_CLOSE_REQ signals it and vdisplay makes the event.

export const MOD_SHIFT = 1;
export const MOD_CTRL = 2;
export const MOD_ALT = 4;
export const MOD_META = 8;

export type DisplayScale = 'fit' | 'pixel' | 'window' | number;

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
      readonly cmdSab: SharedArrayBuffer;
    }
  | { readonly type: 'display.close'; readonly id: number }
  | { readonly type: 'display.batch'; readonly id: number; readonly seq: number; readonly buf: ArrayBuffer };

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
    if (typeof raw.seq !== 'number' || !Number.isInteger(raw.seq) || raw.seq < 1 || raw.seq > 0x7fffffff) {
      return { ok: false, reason: 'Invalid display.batch seq' };
    }
    return { ok: true, message: { type: 'display.batch', id: raw.id, seq: raw.seq, buf: raw.buf } };
  }
  const width = clampDim(raw.width, MAX_DISPLAY_WIDTH);
  const height = clampDim(raw.height, MAX_DISPLAY_HEIGHT);
  if (width === null || height === null) return { ok: false, reason: 'Invalid display.open size' };
  if (typeof raw.title !== 'string' || raw.title.length > MAX_RAW_TITLE_CHARS) {
    return { ok: false, reason: 'Invalid display.open title' };
  }
  let scale: DisplayScale;
  if (raw.scale === 'fit' || raw.scale === 'pixel' || raw.scale === 'window') {
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
  if (!isSab(raw.cmdSab) || raw.cmdSab.byteLength !== CMD_SAB_BYTES) {
    return { ok: false, reason: 'Invalid display.open command buffer' };
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
      cmdSab: raw.cmdSab,
    },
  };
}
