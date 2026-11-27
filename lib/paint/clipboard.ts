import type { Rect } from './types';

export interface ClipboardCopyResult {
  osCopied: boolean;
  width: number;
  height: number;
  message?: string;
}

export interface InternalClipboardBuffer {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
}

// Keep an in-memory PNG canvas copy so Ctrl+C -> Ctrl+V always works inside the editor
// even when the browser denies async Clipboard API permissions.
let internalBuffer: InternalClipboardBuffer | null = null;

export function getInternalClipboard(): InternalClipboardBuffer | null {
  return internalBuffer;
}

export function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Failed to encode PNG clipboard image.'));
    }, 'image/png');
  });
}

export function extractRegionCanvas(
  source: HTMLCanvasElement,
  region?: Rect | null,
): HTMLCanvasElement {
  const rx = region && region.w > 0 ? Math.max(0, Math.round(region.x)) : 0;
  const ry = region && region.h > 0 ? Math.max(0, Math.round(region.y)) : 0;
  const rw = region && region.w > 0 ? Math.min(source.width - rx, Math.round(region.w)) : source.width;
  const rh = region && region.h > 0 ? Math.min(source.height - ry, Math.round(region.h)) : source.height;

  const out = document.createElement('canvas');
  out.width = Math.max(1, rw);
  out.height = Math.max(1, rh);
  const ctx = out.getContext('2d');
  if (ctx && rw > 0 && rh > 0) {
    ctx.drawImage(source, rx, ry, rw, rh, 0, 0, rw, rh);
  }
  return out;
}

/**
 * Copies a canvas (or selected sub-region) to the OS clipboard as PNG
 * (compatible with desktop image editors) and updates the internal buffer.
 */
export async function copyCanvasToClipboard(
  source: HTMLCanvasElement,
  region?: Rect | null,
): Promise<ClipboardCopyResult> {
  const extracted = extractRegionCanvas(source, region);
  internalBuffer = {
    canvas: extracted,
    width: extracted.width,
    height: extracted.height,
  };

  let osCopied = false;
  if (
    typeof navigator !== 'undefined' &&
    navigator.clipboard &&
    typeof navigator.clipboard.write === 'function' &&
    typeof ClipboardItem !== 'undefined'
  ) {
    try {
      const blob = await canvasToPngBlob(extracted);
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      osCopied = true;
    } catch {
      osCopied = false;
    }
  }

  return {
    osCopied,
    width: extracted.width,
    height: extracted.height,
  };
}

export function decodeBlobToCanvas(blob: Blob): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || img.width;
        canvas.height = img.naturalHeight || img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Could not initialize 2D context.'));
          return;
        }
        ctx.drawImage(img, 0, 0);
        resolve(canvas);
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not decode pasted image.'));
    };
    img.src = url;
  });
}

/**
 * Reads an image from a native ClipboardEvent (triggered by Ctrl+V).
 */
export async function readImageFromPasteEvent(
  event: ClipboardEvent,
): Promise<HTMLCanvasElement | null> {
  const dt = event.clipboardData;
  if (!dt) return null;

  // Prefer image items (image/png, image/bmp, etc.)
  if (dt.items) {
    for (let i = 0; i < dt.items.length; i++) {
      const item = dt.items[i];
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          return decodeBlobToCanvas(file);
        }
      }
    }
  }

  if (dt.files && dt.files.length > 0) {
    for (let i = 0; i < dt.files.length; i++) {
      const file = dt.files[i];
      if (file.type.startsWith('image/')) {
        return decodeBlobToCanvas(file);
      }
    }
  }

  return null;
}

/**
 * Reads an image via the Async Clipboard API (for toolbar Paste button or when paste event has no data).
 * Falls back to the internal in-app clipboard buffer if OS clipboard is empty or blocked.
 */
export async function readImageFromClipboardApi(): Promise<{
  canvas: HTMLCanvasElement;
  source: 'os' | 'internal';
} | null> {
  if (
    typeof navigator !== 'undefined' &&
    navigator.clipboard &&
    typeof navigator.clipboard.read === 'function'
  ) {
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const imageType = item.types.find((t) => t.startsWith('image/'));
        if (imageType) {
          const blob = await item.getType(imageType);
          const canvas = await decodeBlobToCanvas(blob);
          return { canvas, source: 'os' };
        }
      }
    } catch {
      // Permission denied or empty OS clipboard — fall back to internal buffer below
    }
  }

  if (internalBuffer) {
    const clone = extractRegionCanvas(internalBuffer.canvas, null);
    return { canvas: clone, source: 'internal' };
  }

  return null;
}
