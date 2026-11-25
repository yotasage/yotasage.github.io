// Draw-command batches of the Python display (P7b): decodes the records vdisplay's Canvas encodes
// (layout in lib/python/displayProtocol.ts) and draws them with Canvas 2D. Framework-free.
// A batch is written by the program and is untrusted: every record is checked before it is drawn
// (known opcode, record inside the batch, finite numbers, radii and sizes in range, caps on points,
// text bytes, image size and save depth), and drawing stops at the first bad record. Python never
// sends CSS here: colours are u32 RGBA and fonts an index into the page's own list.

import {
  CMD_FLAG_CLOSED,
  CMD_FLAG_FILL,
  CMD_FLAG_SMOOTH,
  MAX_DISPLAY_BATCH_BYTES,
  MAX_IMAGE_HEIGHT,
  MAX_IMAGE_WIDTH,
  MAX_LINE_WIDTH,
  MAX_PATH_POINTS,
  MAX_SAVE_DEPTH,
  MAX_TEXT_BYTES,
  MAX_TEXT_SIZE,
  OP_ALPHA,
  OP_ARC,
  OP_CIRCLE,
  OP_CLEAR,
  OP_CLIP_RECT,
  OP_ELLIPSE,
  OP_FILL_RECT,
  OP_IMAGE,
  OP_LINE,
  OP_POLY,
  OP_RECT,
  OP_RESTORE,
  OP_ROTATE,
  OP_SAVE,
  OP_SCALE,
  OP_TEXT,
  OP_TRANSLATE,
} from '../displayProtocol';

/** Families for DISPLAY_FONTS (sans, serif, mono): the site's self-hosted fonts or generic ones. */
export const DISPLAY_FONT_FAMILIES = [
  '"Inter Variable", Inter, system-ui, sans-serif',
  'Georgia, "Times New Roman", serif',
  '"JetBrains Mono Variable", ui-monospace, monospace',
] as const;
const ALIGNS: readonly CanvasTextAlign[] = ['left', 'center', 'right'];
const BASELINES: readonly CanvasTextBaseline[] = ['top', 'middle', 'alphabetic', 'bottom'];

export interface BatchResult {
  /** Records drawn. */
  readonly records: number;
  /** Why drawing stopped early (the first bad record), or null when the whole batch was drawn. */
  readonly error: string | null;
}

/** Reusable state for image records (a small canvas the pixels are put on before drawImage). */
export interface DrawScratch {
  canvas: HTMLCanvasElement | null;
  ctx: CanvasRenderingContext2D | null;
  image: ImageData | null;
}

export function createDrawScratch(): DrawScratch {
  return { canvas: null, ctx: null, image: null };
}

const colorCache = new Map<number, string>();

/** CSS colour of a u32 RGBA (r in the low byte); a bounded cache, as frames reuse few colours. */
export function rgbaCss(c: number): string {
  let s = colorCache.get(c);
  if (s === undefined) {
    const a = c >>> 24;
    s =
      a === 255
        ? `rgb(${c & 255},${(c >>> 8) & 255},${(c >>> 16) & 255})`
        : `rgba(${c & 255},${(c >>> 8) & 255},${(c >>> 16) & 255},${a / 255})`;
    if (colorCache.size >= 1024) colorCache.clear();
    colorCache.set(c, s);
  }
  return s;
}

const decoder = new TextDecoder('utf-8');

function scratchFor(scratch: DrawScratch, w: number, h: number): CanvasRenderingContext2D | null {
  if (!scratch.canvas) {
    if (typeof document === 'undefined') return null;
    scratch.canvas = document.createElement('canvas');
  }
  const c = scratch.canvas;
  if (c.width < w || c.height < h) {
    c.width = Math.max(c.width, w);
    c.height = Math.max(c.height, h);
    scratch.ctx = null;
  }
  if (!scratch.ctx) scratch.ctx = c.getContext('2d');
  if (!scratch.image || scratch.image.width !== w || scratch.image.height !== h) scratch.image = new ImageData(w, h);
  return scratch.ctx;
}

/**
 * Draws one batch onto ctx (whose state it leaves as it found it). `bytes` must not be a view of
 * shared memory: the caller copies the slot first, so the program cannot change it while it is read.
 */
export function drawBatch(ctx: CanvasRenderingContext2D, bytes: Uint8Array, scratch: DrawScratch): BatchResult {
  const len = bytes.byteLength;
  if (len > MAX_DISPLAY_BATCH_BYTES) return { records: 0, error: 'batch too large' };
  if (typeof SharedArrayBuffer === 'function' && bytes.buffer instanceof SharedArrayBuffer) {
    return { records: 0, error: 'batch in shared memory' };
  }
  const dv = new DataView(bytes.buffer, bytes.byteOffset, len);
  const f = (at: number) => dv.getFloat32(at, true);
  const u = (at: number) => dv.getUint32(at, true);
  let off = 0;
  let records = 0;
  let depth = 0;
  let error: string | null = null;
  // Style cache: a property set costs a parse even when the value is the same. restore() resets it.
  let fill = '';
  let stroke = '';
  let lw = -1;
  let font = '';
  const setStroke = (width: number, color: number) => {
    const s = rgbaCss(color);
    if (s !== stroke) {
      ctx.strokeStyle = s;
      stroke = s;
    }
    if (width !== lw) {
      ctx.lineWidth = width;
      lw = width;
    }
  };
  const setFill = (color: number) => {
    const s = rgbaCss(color);
    if (s !== fill) {
      ctx.fillStyle = s;
      fill = s;
    }
  };
  const forget = () => {
    fill = '';
    stroke = '';
    lw = -1;
    font = '';
  };
  const okWidth = (w: number) => Number.isFinite(w) && w >= 0 && w <= MAX_LINE_WIDTH;

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  try {
    while (off < len) {
      if (off + 4 > len) {
        error = `record at ${off}: truncated header`;
        break;
      }
      const hdr = u(off);
      const op = hdr & 255;
      const flags = (hdr >>> 8) & 255;
      const aux = hdr >>> 16;
      const left = len - off;
      let size = 0;
      let bad: string | null = null;
      switch (op) {
        case OP_CLEAR: {
          size = 8;
          if (left < size) break;
          const c = u(off + 4);
          ctx.save();
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.globalAlpha = 1;
          ctx.globalCompositeOperation = 'copy';
          ctx.fillStyle = rgbaCss(c);
          ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
          ctx.restore();
          break;
        }
        case OP_FILL_RECT: {
          size = 24;
          if (left < size) break;
          const x = f(off + 4);
          const y = f(off + 8);
          const w = f(off + 12);
          const h = f(off + 16);
          if (!Number.isFinite(x + y + w + h)) {
            bad = 'non-finite number';
            break;
          }
          setFill(u(off + 20));
          ctx.fillRect(x, y, w, h);
          break;
        }
        case OP_RECT:
        case OP_LINE: {
          size = 28;
          if (left < size) break;
          const a = f(off + 4);
          const b = f(off + 8);
          const c = f(off + 12);
          const d = f(off + 16);
          const width = f(off + 20);
          if (!Number.isFinite(a + b + c + d) || !okWidth(width)) {
            bad = 'non-finite number or bad line width';
            break;
          }
          if (width === 0) break;
          setStroke(width, u(off + 24));
          if (op === OP_RECT) {
            ctx.strokeRect(a, b, c, d);
          } else {
            ctx.beginPath();
            ctx.moveTo(a, b);
            ctx.lineTo(c, d);
            ctx.stroke();
          }
          break;
        }
        case OP_POLY: {
          if (left < 16) {
            size = 16;
            break;
          }
          const n = u(off + 4);
          if (n > MAX_PATH_POINTS) {
            size = 16;
            bad = `path of ${n} points (at most ${MAX_PATH_POINTS})`;
            break;
          }
          size = 16 + 8 * n;
          if (left < size) break;
          const width = f(off + 8);
          const fillIt = (flags & CMD_FLAG_FILL) !== 0;
          if (!okWidth(width)) {
            bad = 'bad line width';
            break;
          }
          ctx.beginPath();
          for (let i = 0, at = off + 16; i < n; i += 1, at += 8) {
            const x = f(at);
            const y = f(at + 4);
            if (!Number.isFinite(x + y)) {
              bad = 'non-finite point';
              break;
            }
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          if (bad) {
            ctx.beginPath();
            break;
          }
          if (fillIt) {
            setFill(u(off + 12));
            ctx.fill();
          } else if (width > 0) {
            if (flags & CMD_FLAG_CLOSED) ctx.closePath();
            setStroke(width, u(off + 12));
            ctx.stroke();
          }
          break;
        }
        case OP_CIRCLE:
        case OP_ELLIPSE:
        case OP_ARC: {
          size = op === OP_CIRCLE ? 24 : 32;
          if (left < size) break;
          const cx = f(off + 4);
          const cy = f(off + 8);
          const r1 = f(off + 12);
          const p4 = f(off + 16);
          const p5 = op === OP_CIRCLE ? 0 : f(off + 20);
          const width = f(off + size - 8);
          const color = u(off + size - 4);
          if (!Number.isFinite(cx + cy + r1 + p4 + p5) || !okWidth(width)) {
            bad = 'non-finite number or bad line width';
            break;
          }
          if (r1 < 0 || (op === OP_ELLIPSE && p4 < 0)) {
            bad = 'negative radius';
            break;
          }
          const fillIt = (flags & CMD_FLAG_FILL) !== 0;
          ctx.beginPath();
          if (op === OP_CIRCLE) {
            ctx.arc(cx, cy, r1, 0, Math.PI * 2);
          } else if (op === OP_ELLIPSE) {
            ctx.ellipse(cx, cy, r1, p4, p5, 0, Math.PI * 2);
          } else {
            if (fillIt) ctx.moveTo(cx, cy);
            ctx.arc(cx, cy, r1, p4, p5);
          }
          if (fillIt) {
            setFill(color);
            ctx.fill();
          } else if (width > 0) {
            setStroke(width, color);
            ctx.stroke();
          }
          break;
        }
        case OP_TEXT: {
          const n = aux;
          if (n > MAX_TEXT_BYTES) {
            size = 20;
            bad = `text of ${n} bytes (at most ${MAX_TEXT_BYTES})`;
            break;
          }
          size = 20 + ((n + 3) & ~3);
          if (left < size) break;
          const x = f(off + 4);
          const y = f(off + 8);
          const px = f(off + 12);
          const fontIx = flags & 3;
          const alignIx = (flags >>> 2) & 3;
          const baseIx = (flags >>> 4) & 3;
          if (!Number.isFinite(x + y + px) || px < 1 || px > MAX_TEXT_SIZE) {
            bad = 'non-finite number or bad text size';
            break;
          }
          if (fontIx >= DISPLAY_FONT_FAMILIES.length || alignIx >= ALIGNS.length || flags > 63) {
            bad = 'unknown font, alignment or flags';
            break;
          }
          const fs = `${px}px ${DISPLAY_FONT_FAMILIES[fontIx]}`;
          if (fs !== font) {
            ctx.font = fs;
            font = fs;
          }
          ctx.textAlign = ALIGNS[alignIx];
          ctx.textBaseline = BASELINES[baseIx];
          setFill(u(off + 16));
          ctx.fillText(decoder.decode(bytes.subarray(off + 20, off + 20 + n)), x, y);
          break;
        }
        case OP_IMAGE: {
          if (left < 24) {
            size = 24;
            break;
          }
          const w = dv.getUint16(off + 20, true);
          const h = dv.getUint16(off + 22, true);
          if (w < 1 || h < 1 || w > MAX_IMAGE_WIDTH || h > MAX_IMAGE_HEIGHT || flags > 1) {
            size = 24;
            bad = `image of ${w} x ${h} (1 x 1 to ${MAX_IMAGE_WIDTH} x ${MAX_IMAGE_HEIGHT})`;
            break;
          }
          size = 24 + w * h * 4;
          if (left < size) break;
          const x = f(off + 4);
          const y = f(off + 8);
          const dw = f(off + 12);
          const dh = f(off + 16);
          if (!Number.isFinite(x + y + dw + dh) || dw < 0 || dh < 0) {
            bad = 'non-finite number or negative size';
            break;
          }
          const sc = scratchFor(scratch, w, h);
          const img = scratch.image;
          if (!sc || !img || !scratch.canvas) {
            bad = 'no canvas for images';
            break;
          }
          img.data.set(bytes.subarray(off + 24, off + size));
          sc.putImageData(img, 0, 0);
          ctx.imageSmoothingEnabled = (flags & CMD_FLAG_SMOOTH) !== 0;
          ctx.drawImage(scratch.canvas, 0, 0, w, h, x, y, dw, dh);
          break;
        }
        case OP_SAVE:
          size = 4;
          if (depth >= MAX_SAVE_DEPTH) {
            bad = `save() nested deeper than ${MAX_SAVE_DEPTH}`;
            break;
          }
          ctx.save();
          depth += 1;
          break;
        case OP_RESTORE:
          size = 4;
          if (depth <= 0) {
            bad = 'restore() without save()';
            break;
          }
          ctx.restore();
          depth -= 1;
          forget();
          break;
        case OP_TRANSLATE:
        case OP_SCALE: {
          size = 12;
          if (left < size) break;
          const a = f(off + 4);
          const b = f(off + 8);
          if (!Number.isFinite(a + b)) {
            bad = 'non-finite number';
            break;
          }
          if (op === OP_TRANSLATE) ctx.translate(a, b);
          else ctx.scale(a, b);
          break;
        }
        case OP_ROTATE:
        case OP_ALPHA: {
          size = 8;
          if (left < size) break;
          const a = f(off + 4);
          if (!Number.isFinite(a) || (op === OP_ALPHA && (a < 0 || a > 1))) {
            bad = 'non-finite number or alpha outside 0..1';
            break;
          }
          if (op === OP_ROTATE) ctx.rotate(a);
          else ctx.globalAlpha = a;
          break;
        }
        case OP_CLIP_RECT: {
          size = 20;
          if (left < size) break;
          const x = f(off + 4);
          const y = f(off + 8);
          const w = f(off + 12);
          const h = f(off + 16);
          if (!Number.isFinite(x + y + w + h)) {
            bad = 'non-finite number';
            break;
          }
          ctx.beginPath();
          ctx.rect(x, y, w, h);
          ctx.clip();
          break;
        }
        default:
          bad = `unknown opcode ${op}`;
      }
      // Every case checks `left < size` before it draws anything.
      if (!bad && left < size) bad = `record of ${size} bytes runs past the batch end`;
      if (bad) {
        error = `record ${records} (opcode ${op}) at byte ${off}: ${bad}`;
        break;
      }
      off += size;
      records += 1;
    }
  } finally {
    while (depth > 0) {
      ctx.restore();
      depth -= 1;
    }
    ctx.restore();
  }
  return { records, error };
}
