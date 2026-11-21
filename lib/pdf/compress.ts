import {
  concatTransformationMatrix,
  drawObject,
  PDFArray,
  PDFBool,
  PDFContext,
  PDFDict,
  PDFDocument,
  PDFNumber,
  PDFObject,
  PDFRawStream,
  PDFRef,
  popGraphicsState,
  pushGraphicsState,
} from '@cantoo/pdf-lib';
import { unzlibSync, zlibSync } from 'fflate';

import {
  decodeAnyImageToRgba,
  deduplicateSharedObjects,
  encodeRgbaTo1BitPdfStream,
  encodeRgbaToGray8PdfStream,
  ImageDisplaySize,
  measureImageDisplaySizes,
} from './compressContent';
import { canvasToBytes, nextFrame } from './files';
import { compressPdfWithGhostscript, GhostscriptCompressPreset } from './ghostscript';
import { filterNames, N, num, removeUnusedObjects } from './objects';
import { openPdf, renderPage } from './pdfjs';
import { runQpdf } from './qpdf';

export type CompressColorMode = 'original' | 'grayscale' | 'bw1bit';

export interface CompressOptions {
  // Downsample and re-encode images as JPEG (or grayscale/1-bit Flate when requested).
  images: boolean;
  maxDpi: number;
  // JPEG quality, 1-100.
  quality: number;
  // Replace every page with a rasterized image of the rendered page. Removes text, links and forms.
  rasterize: boolean;
  removeMetadata: boolean;
  password?: string;
  // Deduplicate identical image and embedded font streams (default true).
  deduplicateObjects?: boolean;
  // Output image colour mode when recompressing or rasterizing (default 'original').
  colorMode?: CompressColorMode;
  // Optional manual luminance threshold (0-255) for 'bw1bit'; omitted uses Otsu adaptive threshold.
  bwThreshold?: number;
  // Run QPDF WebAssembly structural optimization pass after saving (default false).
  qpdfOptimize?: boolean;
  // When set (and not rasterizing), run Ghostscript WebAssembly vector-preserving compression.
  ghostscriptPreset?: GhostscriptCompressPreset;
}

export interface CompressResult {
  bytes: Uint8Array;
  imagesRecompressed: number;
  duplicateImagesMerged?: number;
  duplicateFontsMerged?: number;
  qpdfSavedBytes?: number;
}

type Progress = (fraction: number, label: string) => void;

function refTag(ref: PDFRef): string {
  return `${ref.objectNumber}:${ref.generationNumber}`;
}

async function decodeImageForCanvas(
  stream: PDFRawStream,
  filters: string[],
  context: PDFContext,
): Promise<CanvasImageSource | null> {
  if (filters.length === 1 && filters[0] === 'DCTDecode') {
    return createImageBitmap(new Blob([stream.contents as BlobPart], { type: 'image/jpeg' }));
  }
  const decoded = decodeAnyImageToRgba(stream, context);
  if (!decoded) return null;
  const pixels = new ImageData(new Uint8ClampedArray(decoded.rgba), decoded.width, decoded.height);
  const canvas = document.createElement('canvas');
  canvas.width = decoded.width;
  canvas.height = decoded.height;
  canvas.getContext('2d').putImageData(pixels, 0, 0);
  return canvas;
}

function releaseCanvasSource(source: CanvasImageSource) {
  if ('close' in source && typeof source.close === 'function') {
    source.close();
  } else if (typeof HTMLCanvasElement !== 'undefined' && source instanceof HTMLCanvasElement) {
    source.width = 0;
  }
}

function applyGrayscaleInPlace(rgba: Uint8ClampedArray) {
  for (let i = 0; i < rgba.length; i += 4) {
    const y = Math.round(0.2126 * rgba[i] + 0.7152 * rgba[i + 1] + 0.0722 * rgba[i + 2]);
    rgba[i] = y;
    rgba[i + 1] = y;
    rgba[i + 2] = y;
  }
}

function replaceImageStream(
  stream: PDFRawStream,
  bytes: Uint8Array,
  width: number,
  height: number,
  filter: 'DCTDecode' | 'FlateDecode',
  colorSpace: 'DeviceRGB' | 'DeviceGray',
  bpc: 1 | 8,
) {
  const dict = stream.dict;
  for (const key of ['DecodeParms', 'Length', 'Decode', 'Intent']) dict.delete(N(key));
  dict.set(N('Filter'), N(filter));
  dict.set(N('Width'), PDFNumber.of(width));
  dict.set(N('Height'), PDFNumber.of(height));
  dict.set(N('BitsPerComponent'), PDFNumber.of(bpc));
  dict.set(N('ColorSpace'), N(colorSpace));
  stream.updateContents(bytes);
}

// Re-encodes embedded images (JPEG, RGB, Gray, CMYK, Indexed, 16-bit) downsampled to each image's
// actual on-page display size at `maxDpi` (falling back to largest page dimension if unreferenced).
async function recompressImages(doc: PDFDocument, opts: CompressOptions, onProgress: Progress): Promise<number> {
  const context = doc.context;
  const colorMode: CompressColorMode = opts.colorMode ?? 'original';
  const largestSide = Math.max(1, ...doc.getPages().map((p) => Math.max(p.getWidth(), p.getHeight())));
  const fallbackMaxPixels = Math.ceil((largestSide / 72) * opts.maxDpi);

  const displaySizes = measureImageDisplaySizes(doc);
  const displaySizesByTag = new Map<string, ImageDisplaySize>();
  for (const [ref, size] of displaySizes.entries()) {
    displaySizesByTag.set(refTag(ref), size);
  }

  const images: Array<[PDFRef, PDFRawStream]> = [];
  const masks = new Set<PDFObject>();
  for (const [ref, obj] of context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFRawStream) || obj.dict.lookup(N('Subtype')) !== N('Image')) continue;
    images.push([ref, obj]);
    for (const key of ['SMask', 'Mask']) {
      const mRef = obj.dict.get(N(key));
      if (mRef instanceof PDFRef) masks.add(context.lookup(mRef));
    }
  }

  let count = 0;
  for (let i = 0; i < images.length; i++) {
    const [ref, stream] = images[i];
    onProgress(i / images.length, `Image ${i + 1} of ${images.length}`);
    await nextFrame();
    const dict = stream.dict;
    if (masks.has(stream) || stream.contents.length < 4096) continue;
    const imageMask = dict.lookup(N('ImageMask'));
    if ((imageMask instanceof PDFBool && imageMask.asBoolean()) || dict.lookup(N('Mask')) instanceof PDFArray) continue;
    if (dict.has(N('SMaskInData'))) continue;

    const w = num(dict, 'Width', 0);
    const h = num(dict, 'Height', 0);
    if (w < 16 || h < 16) continue;

    const filters = filterNames(dict);
    if (!filters) continue;
    const isJpeg = filters.length === 1 && filters[0] === 'DCTDecode';
    if (isJpeg && dict.has(N('Decode'))) continue;

    let source: CanvasImageSource | null;
    try {
      source = await decodeImageForCanvas(stream, filters, context);
    } catch {
      continue;
    }
    if (!source) continue;

    const measured = displaySizes.get(ref) ?? displaySizesByTag.get(refTag(ref));
    let scale: number;
    if (measured && measured.widthPt > 0 && measured.heightPt > 0) {
      const targetW = Math.min(w, Math.max(1, Math.ceil((measured.widthPt / 72) * opts.maxDpi)));
      const targetH = Math.min(h, Math.max(1, Math.ceil((measured.heightPt / 72) * opts.maxDpi)));
      scale = Math.min(1, targetW / w, targetH / h);
    } else {
      scale = Math.min(1, fallbackMaxPixels / Math.max(w, h));
    }

    const outW = Math.max(1, Math.round(w * scale));
    const outH = Math.max(1, Math.round(h * scale));
    const canvas = document.createElement('canvas');
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(source, 0, 0, outW, outH);
    releaseCanvasSource(source);

    if (colorMode === 'bw1bit') {
      const imgData = ctx.getImageData(0, 0, outW, outH);
      canvas.width = 0;
      const { compressed } = encodeRgbaTo1BitPdfStream(imgData.data, outW, outH, opts.bwThreshold);
      if (compressed.length >= stream.contents.length * 0.98) continue;
      replaceImageStream(stream, compressed, outW, outH, 'FlateDecode', 'DeviceGray', 1);
      count++;
      continue;
    }

    if (colorMode === 'grayscale') {
      const imgData = ctx.getImageData(0, 0, outW, outH);
      applyGrayscaleInPlace(imgData.data);
      const grayFlate = encodeRgbaToGray8PdfStream(imgData.data, outW, outH);
      ctx.putImageData(imgData, 0, 0);
      const grayJpeg = await canvasToBytes(canvas, 'image/jpeg', opts.quality / 100);
      canvas.width = 0;

      if (grayFlate.length <= grayJpeg.length) {
        if (grayFlate.length >= stream.contents.length * 0.95) continue;
        replaceImageStream(stream, grayFlate, outW, outH, 'FlateDecode', 'DeviceGray', 8);
      } else {
        if (grayJpeg.length >= stream.contents.length * 0.95) continue;
        replaceImageStream(stream, grayJpeg, outW, outH, 'DCTDecode', 'DeviceRGB', 8);
      }
      count++;
      continue;
    }

    const jpeg = await canvasToBytes(canvas, 'image/jpeg', opts.quality / 100);
    canvas.width = 0;
    if (jpeg.length >= stream.contents.length * 0.95) continue;
    // A canvas always produces a three-component JPEG.
    replaceImageStream(stream, jpeg, outW, outH, 'DCTDecode', 'DeviceRGB', 8);
    count++;
  }
  return count;
}

// Compresses streams without a filter and recompresses plain Flate streams at the highest level.
async function deflateStreams(context: PDFContext, onProgress: Progress) {
  const streams = context.enumerateIndirectObjects().filter(([, o]) => o instanceof PDFRawStream) as [PDFRef, PDFRawStream][];
  for (let i = 0; i < streams.length; i++) {
    if (i % 50 === 0) {
      onProgress(i / streams.length, 'Compressing streams');
      await nextFrame();
    }
    const stream = streams[i][1];
    const dict = stream.dict;
    const type = dict.lookup(N('Type'));
    // XMP metadata stays readable, as PDF/A requires.
    if (type === N('Metadata') || type === N('XRef') || type === N('ObjStm') || stream.contents.length < 64) continue;
    const filters = filterNames(dict);
    let raw: Uint8Array;
    if (filters?.length === 0) raw = stream.contents;
    else if (filters?.length === 1 && filters[0] === 'FlateDecode' && !dict.has(N('DecodeParms'))) {
      try {
        raw = unzlibSync(stream.contents);
      } catch {
        continue;
      }
    } else continue;
    const packed = zlibSync(raw, { level: 9 });
    if (packed.length < stream.contents.length) {
      dict.set(N('Filter'), N('FlateDecode'));
      stream.updateContents(packed);
    }
  }
}

function removeMetadata(doc: PDFDocument) {
  doc.catalog.delete(N('Metadata'));
  const info = doc.context.lookup(doc.context.trailerInfo.Info);
  if (info instanceof PDFDict) for (const key of info.keys()) info.delete(key);
}

function addFlateGrayImagePage(
  out: PDFDocument,
  pageWidth: number,
  pageHeight: number,
  imgWidth: number,
  imgHeight: number,
  compressed: Uint8Array,
  bpc: 1 | 8,
) {
  const imgDict = out.context.obj({
    Type: 'XObject',
    Subtype: 'Image',
    Width: imgWidth,
    Height: imgHeight,
    ColorSpace: 'DeviceGray',
    BitsPerComponent: bpc,
    Filter: 'FlateDecode',
    Length: compressed.length,
  });
  const imgStream = PDFRawStream.of(imgDict, compressed);
  const imgRef = out.context.register(imgStream);
  const outPage = out.addPage([pageWidth, pageHeight]);
  outPage.node.setXObject(N('Im0'), imgRef);
  outPage.pushOperators(
    pushGraphicsState(),
    concatTransformationMatrix(pageWidth, 0, 0, pageHeight, 0, 0),
    drawObject(N('Im0')),
    popGraphicsState(),
  );
}

async function rasterizePdf(bytes: Uint8Array, opts: CompressOptions, onProgress: Progress): Promise<Uint8Array> {
  const colorMode: CompressColorMode = opts.colorMode ?? 'original';
  const { doc: src, close } = await openPdf(bytes, opts.password);
  try {
    const out = await PDFDocument.create();
    if (!opts.removeMetadata) {
      const { info } = (await src.getMetadata()) as { info: Record<string, unknown> };
      if (typeof info.Title === 'string' && info.Title) out.setTitle(info.Title);
      if (typeof info.Author === 'string' && info.Author) out.setAuthor(info.Author);
      if (typeof info.Subject === 'string' && info.Subject) out.setSubject(info.Subject);
    }
    for (let p = 1; p <= src.numPages; p++) {
      onProgress((p - 1) / src.numPages, `Page ${p} of ${src.numPages}`);
      await nextFrame();
      const page = await src.getPage(p);
      const { width, height } = page.getViewport({ scale: 1 });
      const canvas = await renderPage(page, opts.maxDpi / 72);
      const cw = canvas.width;
      const ch = canvas.height;
      page.cleanup();

      if (colorMode === 'bw1bit') {
        const imgData = canvas.getContext('2d').getImageData(0, 0, cw, ch);
        canvas.width = 0;
        const { compressed } = encodeRgbaTo1BitPdfStream(imgData.data, cw, ch, opts.bwThreshold);
        addFlateGrayImagePage(out, width, height, cw, ch, compressed, 1);
      } else if (colorMode === 'grayscale') {
        const ctx = canvas.getContext('2d');
        const imgData = ctx.getImageData(0, 0, cw, ch);
        applyGrayscaleInPlace(imgData.data);
        const grayFlate = encodeRgbaToGray8PdfStream(imgData.data, cw, ch);
        ctx.putImageData(imgData, 0, 0);
        const grayJpeg = await canvasToBytes(canvas, 'image/jpeg', opts.quality / 100);
        canvas.width = 0;
        if (grayFlate.length <= grayJpeg.length) {
          addFlateGrayImagePage(out, width, height, cw, ch, grayFlate, 8);
        } else {
          const image = await out.embedJpg(grayJpeg);
          out.addPage([width, height]).drawImage(image, { x: 0, y: 0, width, height });
        }
      } else {
        const jpeg = await canvasToBytes(canvas, 'image/jpeg', opts.quality / 100);
        canvas.width = 0;
        const image = await out.embedJpg(jpeg);
        out.addPage([width, height]).drawImage(image, { x: 0, y: 0, width, height });
      }
    }
    return out.save({ useObjectStreams: true, addDefaultPage: false, updateFieldAppearances: false });
  } finally {
    await close();
  }
}

async function applyQpdfOptimization(
  bytes: Uint8Array,
  password: string | undefined,
): Promise<{ bytes: Uint8Array; savedBytes: number }> {
  try {
    const args = ['--object-streams=generate', '--recompress-flate', '--compression-level=9'];
    if (password) args.push(`--password=${password}`);
    args.push('$IN', '$OUT');
    const res = await runQpdf(bytes, args);
    if ((res.exitCode === 0 || res.exitCode === 3) && res.output && res.output.length < bytes.length) {
      return { bytes: res.output, savedBytes: bytes.length - res.output.length };
    }
  } catch {
    // Keep the pdf-lib output if QPDF WASM is unavailable or fails.
  }
  return { bytes, savedBytes: 0 };
}

export async function compressPdf(bytes: Uint8Array, opts: CompressOptions, onProgress: Progress = () => {}): Promise<CompressResult> {
  if (opts.rasterize) {
    let out = await rasterizePdf(bytes, opts, (f, l) => onProgress(opts.qpdfOptimize ? f * 0.9 : f, l));
    let qpdfSavedBytes = 0;
    if (opts.qpdfOptimize) {
      onProgress(0.92, 'Optimizing structure with QPDF');
      await nextFrame();
      const opt = await applyQpdfOptimization(out, opts.password);
      out = opt.bytes;
      qpdfSavedBytes = opt.savedBytes;
    }
    return {
      bytes: out,
      imagesRecompressed: 0,
      duplicateImagesMerged: 0,
      duplicateFontsMerged: 0,
      qpdfSavedBytes,
    };
  }

  if (opts.ghostscriptPreset) {
    onProgress(0.1, 'Compressing with Ghostscript WebAssembly');
    await nextFrame();
    const gsRes = await compressPdfWithGhostscript(bytes, {
      preset: opts.ghostscriptPreset,
      colorMode: opts.colorMode === 'grayscale' ? 'grayscale' : 'original',
      password: opts.password,
    });
    let out = gsRes.bytes;

    if (opts.removeMetadata) {
      onProgress(0.78, 'Removing metadata');
      await nextFrame();
      const doc = await PDFDocument.load(out, { updateMetadata: false });
      removeMetadata(doc);
      out = await doc.save({ useObjectStreams: true, addDefaultPage: false, updateFieldAppearances: false });
    }

    let qpdfSavedBytes = 0;
    if (opts.qpdfOptimize) {
      onProgress(0.9, 'Optimizing structure with QPDF');
      await nextFrame();
      const opt = await applyQpdfOptimization(out, undefined);
      out = opt.bytes;
      qpdfSavedBytes = opt.savedBytes;
    }

    return {
      bytes: out,
      imagesRecompressed: 0,
      duplicateImagesMerged: 0,
      duplicateFontsMerged: 0,
      qpdfSavedBytes,
    };
  }

  onProgress(0, 'Reading the PDF');
  await nextFrame();
  const doc = await PDFDocument.load(bytes, { updateMetadata: false, password: opts.password });
  if (opts.removeMetadata) removeMetadata(doc);

  let duplicateImagesMerged = 0;
  let duplicateFontsMerged = 0;
  if (opts.deduplicateObjects !== false) {
    const dedup = deduplicateSharedObjects(doc);
    duplicateImagesMerged = dedup.duplicateImagesMerged;
    duplicateFontsMerged = dedup.duplicateFontsMerged;
  }

  const imagesRecompressed = opts.images ? await recompressImages(doc, opts, (f, l) => onProgress(f * 0.65, l)) : 0;
  removeUnusedObjects(doc.context);
  await deflateStreams(doc.context, (f, l) => onProgress(0.65 + f * 0.25, l));
  onProgress(0.9, 'Writing the PDF');
  await nextFrame();
  let out: Uint8Array = await doc.save({ useObjectStreams: true, addDefaultPage: false, updateFieldAppearances: false });

  let qpdfSavedBytes = 0;
  if (opts.qpdfOptimize) {
    onProgress(0.94, 'Optimizing structure with QPDF');
    await nextFrame();
    const opt = await applyQpdfOptimization(out, opts.password);
    out = opt.bytes;
    qpdfSavedBytes = opt.savedBytes;
  }

  return {
    bytes: out,
    imagesRecompressed,
    duplicateImagesMerged,
    duplicateFontsMerged,
    qpdfSavedBytes,
  };
}
