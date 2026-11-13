// Turns what the visitor gives the page (image files, PDF pages, camera frames) into pixels for the reader. Browser
// only. Images are decoded by the browser, with their EXIF orientation applied, and scaled down when very large;
// when nothing is found in a scaled image, it is read again at a larger size.

import { scan } from './scanClient';
import type { Detection, ScanOptions } from './zxing';

/** Longest side of the first reading of an image; larger images are scaled to it. */
const FIRST_SIDE = 4096;
/** Longest side of the second reading, when the first found nothing. */
const SECOND_SIDE = 7000;
/** PDF pages are drawn at this many pixels per inch (codes on tickets are often small). */
const PDF_DPI = 220;

export interface Scanned {
  /** A picture of what was read, for the preview: an object URL (revoke it when done). */
  previewUrl: string;
  /** Size of the pixels the detections' corners refer to. */
  width: number;
  height: number;
  detections: Detection[];
}

function canvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function pixels(source: CanvasImageSource, sw: number, sh: number, maxSide: number): { image: ImageData; c: HTMLCanvasElement } {
  const k = Math.min(1, maxSide / Math.max(sw, sh));
  const w = Math.max(1, Math.round(sw * k));
  const h = Math.max(1, Math.round(sh * k));
  const c = canvas(w, h);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  // White under transparent images: a dark code on a transparent background must not become dark on black.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(source, 0, 0, w, h);
  return { image: ctx.getImageData(0, 0, w, h), c };
}

async function loadImage(file: Blob): Promise<{ source: CanvasImageSource; width: number; height: number; close: () => void }> {
  if (file.type !== 'image/svg+xml') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
    } catch { /* Fall back to an <img>, which knows more formats in some browsers. */ }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    // SVGs without a size get one large enough to read.
    const w = img.naturalWidth || 1024;
    const h = img.naturalHeight || 1024;
    return { source: img, width: w, height: h, close: () => URL.revokeObjectURL(url) };
  } catch {
    URL.revokeObjectURL(url);
    throw new Error('This browser cannot open this kind of image.');
  }
}

async function scanSource(source: CanvasImageSource, w: number, h: number, options: ScanOptions): Promise<{ detections: Detection[]; c: HTMLCanvasElement; scale: number }> {
  let { image, c } = pixels(source, w, h, FIRST_SIDE);
  let scale = c.width / w;
  let detections = await scanWithRetry(image, options, () => pixels(source, w, h, FIRST_SIDE).image);
  if (!detections.some((d) => d.valid) && Math.max(w, h) > FIRST_SIDE) {
    const second = pixels(source, w, h, SECOND_SIDE);
    const more = await scanWithRetry(second.image, options, () => pixels(source, w, h, SECOND_SIDE).image);
    if (more.some((d) => d.valid)) {
      ({ c } = second);
      scale = c.width / w;
      detections = more;
    }
  }
  return { detections, c, scale };
}

/** The pixels go to the worker; if the worker fails meanwhile, they are drawn again for the reading on the page. */
async function scanWithRetry(image: ImageData, options: ScanOptions, again: () => ImageData) {
  try {
    return await scan(image, options);
  } catch {
    return scan(again(), options);
  }
}

function toBlobUrl(c: HTMLCanvasElement, type = 'image/jpeg'): Promise<string> {
  return new Promise((resolve) => c.toBlob((b) => resolve(b ? URL.createObjectURL(b) : c.toDataURL()), type, 0.85));
}

/** Reads an image file. The preview is the file itself, so it shows at full quality. */
export async function scanImageFile(file: Blob, options: ScanOptions): Promise<Scanned> {
  const img = await loadImage(file);
  try {
    const { detections, c } = await scanSource(img.source, img.width, img.height, options);
    return { previewUrl: URL.createObjectURL(file), width: c.width, height: c.height, detections };
  } finally {
    img.close();
  }
}

/** Reads every page of a PDF, one at a time, calling `onPage` as each is done. */
export async function scanPdf(bytes: Uint8Array, options: ScanOptions, onPage: (page: number, pages: number, result: Scanned) => void): Promise<void> {
  // @ts-expect-error TypeScript wants a .js extension here, which the bundler does not resolve.
  const { openPdf, renderPage } = await import('../pdf/pdfjs');
  const { doc, close } = await openPdf(bytes);
  try {
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const pageCanvas: HTMLCanvasElement = await renderPage(page, PDF_DPI / 72);
      const { detections, c } = await scanSource(pageCanvas, pageCanvas.width, pageCanvas.height, options);
      onPage(n, doc.numPages, { previewUrl: await toBlobUrl(c), width: c.width, height: c.height, detections });
      page.cleanup();
    }
  } finally {
    await close();
  }
}

/** Pixels of a camera frame, at most `maxSide` on the longest side, drawn into a reused canvas. */
export function framePixels(video: HTMLVideoElement, c: HTMLCanvasElement, maxSide: number): ImageData | null {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) return null;
  const k = Math.min(1, maxSide / Math.max(vw, vh));
  const w = Math.round(vw * k);
  const h = Math.round(vh * k);
  if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(video, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h);
}

/** A JPEG of the frame now in the canvas, for the preview of what the camera read. */
export function snapshot(c: HTMLCanvasElement): Promise<string> {
  return toBlobUrl(c);
}
