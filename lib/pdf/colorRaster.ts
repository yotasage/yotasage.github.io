// Browser-side Canvas + pdf.js companion for raster color transforms (Dark Mode / Invert / Raster Grayscale)
// and JPEG-to-grayscale decoding for lossless grayscalePdf.
import { PDFDocument } from '@cantoo/pdf-lib';

import { JpegToGrayConverter, PixelTransformMode, transformRgbaPixels } from './color';
import { canvasToBytes, nextFrame } from './files';
import { parsePageRanges } from './merge';
import { openPdf, renderPage } from './pdfjs';

export interface RasterColorOptions {
  mode: PixelTransformMode;
  /** Rendering DPI (default 150). */
  dpi?: number;
  /** Output image encoding per page ('jpeg' or 'png', default 'jpeg'). */
  format?: 'jpeg' | 'png';
  /** JPEG quality (0.1..1 or 10..100, default 88). */
  quality?: number;
  /** Optional 1-based page range string. Unselected pages are copied unchanged. */
  pageRange?: string;
  backgroundHex?: string;
  foregroundHex?: string;
  preserveHue?: boolean;
}

function normalizeJpegQuality(quality: number | undefined): number {
  if (quality === undefined || !Number.isFinite(quality)) return 0.88;
  const q = quality > 1 ? quality / 100 : quality;
  return Math.max(0.1, Math.min(1, q));
}

/**
 * Renders selected PDF pages via pdf.js at the chosen DPI, applies `transformRgbaPixels`, and rebuilds
 * a PDF preserving each page's exact visual dimensions in points.
 */
export async function rasterTransformPdf(
  bytes: Uint8Array,
  options: RasterColorOptions,
  password?: string,
  onProgress?: (p: { done: number; total: number }) => void,
): Promise<Uint8Array> {
  const dpi = Math.max(36, Math.min(600, options.dpi ?? 150));
  const scale = dpi / 72;
  const isPng = options.format === 'png';
  const mime = isPng ? 'image/png' : 'image/jpeg';
  const quality = isPng ? undefined : normalizeJpegQuality(options.quality);

  const { doc: pdfjsDoc, close } = await openPdf(bytes, password);
  try {
    const pageCount = pdfjsDoc.numPages;
    const selectedSet = options.pageRange && options.pageRange.trim()
      ? new Set(parsePageRanges(options.pageRange, pageCount))
      : new Set(Array.from({ length: pageCount }, (_, i) => i));

    const hasUnselected = selectedSet.size < pageCount;
    const srcDoc = hasUnselected
      ? await PDFDocument.load(bytes, { updateMetadata: false, password })
      : null;
    const outDoc = await PDFDocument.create();

    const total = pageCount;
    onProgress?.({ done: 0, total });

    for (let i = 0; i < pageCount; i++) {
      await nextFrame();
      if (!selectedSet.has(i) && srcDoc) {
        const [copied] = await outDoc.copyPages(srcDoc, [i]);
        outDoc.addPage(copied);
        onProgress?.({ done: i + 1, total });
        continue;
      }

      const page = await pdfjsDoc.getPage(i + 1);
      let canvas: HTMLCanvasElement | null = null;
      try {
        const vp1 = page.getViewport({ scale: 1 });
        canvas = await renderPage(page, scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Canvas 2D context is unavailable.');

        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        transformRgbaPixels(imgData.data, options.mode, {
          backgroundHex: options.backgroundHex,
          foregroundHex: options.foregroundHex,
          preserveHue: options.preserveHue,
        });
        ctx.putImageData(imgData, 0, 0);

        const encoded = await canvasToBytes(canvas, mime, quality);
        const embedded = isPng ? await outDoc.embedPng(encoded) : await outDoc.embedJpg(encoded);
        const outPage = outDoc.addPage([vp1.width, vp1.height]);
        outPage.drawImage(embedded, {
          x: 0,
          y: 0,
          width: vp1.width,
          height: vp1.height,
        });
      } finally {
        if (canvas) canvas.width = 0;
        page.cleanup();
      }

      onProgress?.({ done: i + 1, total });
    }

    return outDoc.save({
      useObjectStreams: true,
      addDefaultPage: false,
      updateFieldAppearances: false,
    });
  } finally {
    await close();
  }
}

async function decodeJpegToCanvas(jpegBytes: Uint8Array): Promise<HTMLCanvasElement> {
  const blob = new Blob([jpegBytes as BlobPart], { type: 'image/jpeg' });
  const canvas = document.createElement('canvas');

  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(blob);
    try {
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas 2D context is unavailable.');
      ctx.drawImage(bitmap, 0, 0);
      return canvas;
    } finally {
      bitmap.close();
    }
  }

  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Could not decode embedded JPEG image.'));
      el.src = url;
    });
    canvas.width = img.naturalWidth || img.width;
    canvas.height = img.naturalHeight || img.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context is unavailable.');
    ctx.drawImage(img, 0, 0);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Creates a browser-side JPEG-to-grayscale converter callback suitable for passing to `grayscalePdf`
 * so embedded DCTDecode JPEG XObjects are converted to grayscale without adding DOM deps to `color.ts`.
 */
export function createBrowserJpegToGrayConverter(quality = 0.88): JpegToGrayConverter {
  const q = normalizeJpegQuality(quality);
  return async (jpegBytes: Uint8Array) => {
    let canvas: HTMLCanvasElement | null = null;
    try {
      canvas = await decodeJpegToCanvas(jpegBytes);
      const ctx = canvas.getContext('2d');
      if (!ctx || canvas.width <= 0 || canvas.height <= 0) return null;

      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      transformRgbaPixels(imgData.data, 'grayscale');
      ctx.putImageData(imgData, 0, 0);

      const reencoded = await canvasToBytes(canvas, 'image/jpeg', q);
      // Keep compact JPEG encoding for photographic images; for tiny images use exact 1-channel DeviceGray pixels.
      if (canvas.width * canvas.height <= 16384) {
        const grayPixels = new Uint8Array(canvas.width * canvas.height);
        const data = imgData.data;
        for (let i = 0; i < grayPixels.length; i++) grayPixels[i] = data[i * 4];
        return { grayPixels, width: canvas.width, height: canvas.height };
      }
      return { jpegBytes: reencoded };
    } catch {
      return null;
    } finally {
      if (canvas) canvas.width = 0;
    }
  };
}
