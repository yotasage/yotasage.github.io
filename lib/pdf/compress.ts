import {
  PDFArray, PDFBool, PDFContext, PDFDict, PDFDocument, PDFNumber, PDFObject, PDFRawStream, PDFRef,
} from '@cantoo/pdf-lib';
import { unzlibSync, zlibSync } from 'fflate';

import { canvasToBytes, nextFrame } from './files';
import { decodeRawImageBytes, imageComponents } from './imageDecode';
import { filterNames, N, num, removeUnusedObjects } from './objects';
import { openPdf, renderPage } from './pdfjs';

export interface CompressOptions {
  // Downsample and re-encode images as JPEG.
  images: boolean;
  maxDpi: number;
  // JPEG quality, 1-100.
  quality: number;
  // Replace every page with a JPEG of the rendered page. Removes text, links and forms.
  rasterize: boolean;
  removeMetadata: boolean;
}

export interface CompressResult {
  bytes: Uint8Array;
  imagesRecompressed: number;
}

type Progress = (fraction: number, label: string) => void;

function rgbaFromRaw(data: Uint8Array, w: number, h: number, comps: 1 | 3): ImageData | null {
  if (data.length < w * h * comps) return null;
  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let i = 0, j = 0; i < w * h; i++, j += comps) {
    rgba[i * 4] = data[j];
    rgba[i * 4 + 1] = data[comps === 3 ? j + 1 : j];
    rgba[i * 4 + 2] = data[comps === 3 ? j + 2 : j];
    rgba[i * 4 + 3] = 255;
  }
  return new ImageData(rgba, w, h);
}

async function decodeImage(stream: PDFRawStream, filters: string[], w: number, h: number, comps: 1 | 3): Promise<CanvasImageSource | null> {
  if (filters.length === 1 && filters[0] === 'DCTDecode') {
    return createImageBitmap(new Blob([stream.contents as BlobPart], { type: 'image/jpeg' }));
  }
  const data = decodeRawImageBytes(stream, filters);
  if (!data) return null;
  const pixels = rgbaFromRaw(data, w, h, comps);
  if (!pixels) return null;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d').putImageData(pixels, 0, 0);
  return canvas;
}

// Re-encodes RGB and greyscale images as JPEG, downsampled so that an image covering the largest page is at most
// `maxDpi`. Images that are used as masks, have colour-key masks or exotic colour spaces are left untouched.
async function recompressImages(doc: PDFDocument, opts: CompressOptions, onProgress: Progress): Promise<number> {
  const context = doc.context;
  const largestSide = Math.max(1, ...doc.getPages().map((p) => Math.max(p.getWidth(), p.getHeight())));
  const maxPixels = Math.ceil((largestSide / 72) * opts.maxDpi);

  const images: PDFRawStream[] = [];
  const masks = new Set<PDFObject>();
  for (const [, obj] of context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFRawStream) || obj.dict.lookup(N('Subtype')) !== N('Image')) continue;
    images.push(obj);
    for (const key of ['SMask', 'Mask']) {
      const ref = obj.dict.get(N(key));
      if (ref instanceof PDFRef) masks.add(context.lookup(ref));
    }
  }

  let count = 0;
  for (let i = 0; i < images.length; i++) {
    const stream = images[i];
    onProgress(i / images.length, `Image ${i + 1} of ${images.length}`);
    await nextFrame();
    const dict = stream.dict;
    if (masks.has(stream) || stream.contents.length < 8192) continue;
    const imageMask = dict.lookup(N('ImageMask'));
    if ((imageMask instanceof PDFBool && imageMask.asBoolean()) || dict.lookup(N('Mask')) instanceof PDFArray) continue;
    if (dict.has(N('Decode')) || dict.has(N('SMaskInData'))) continue;
    const w = num(dict, 'Width', 0);
    const h = num(dict, 'Height', 0);
    if (w < 16 || h < 16) continue;
    const comps = imageComponents(dict.lookup(N('ColorSpace')), context);
    const filters = filterNames(dict);
    if (!comps || !filters) continue;

    let source: CanvasImageSource | null;
    try {
      source = await decodeImage(stream, filters, w, h, comps);
    } catch {
      continue;
    }
    if (!source) continue;

    const scale = Math.min(1, maxPixels / Math.max(w, h));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
    if ('close' in source) source.close();
    const jpeg = await canvasToBytes(canvas, 'image/jpeg', opts.quality / 100);
    canvas.width = 0;
    if (jpeg.length >= stream.contents.length * 0.95) continue;

    for (const key of ['DecodeParms', 'Length']) dict.delete(N(key));
    dict.set(N('Filter'), N('DCTDecode'));
    dict.set(N('Width'), PDFNumber.of(Math.round(w * scale)));
    dict.set(N('Height'), PDFNumber.of(Math.round(h * scale)));
    dict.set(N('BitsPerComponent'), PDFNumber.of(8));
    // A canvas always produces a three-component JPEG.
    if (comps === 1) dict.set(N('ColorSpace'), N('DeviceRGB'));
    stream.updateContents(jpeg);
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

async function rasterizePdf(bytes: Uint8Array, opts: CompressOptions, onProgress: Progress): Promise<Uint8Array> {
  const { doc: src, close } = await openPdf(bytes);
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
      const jpeg = await canvasToBytes(canvas, 'image/jpeg', opts.quality / 100);
      canvas.width = 0;
      page.cleanup();
      const image = await out.embedJpg(jpeg);
      out.addPage([width, height]).drawImage(image, { x: 0, y: 0, width, height });
    }
    return out.save();
  } finally {
    await close();
  }
}

export async function compressPdf(bytes: Uint8Array, opts: CompressOptions, onProgress: Progress = () => {}): Promise<CompressResult> {
  if (opts.rasterize) return { bytes: await rasterizePdf(bytes, opts, onProgress), imagesRecompressed: 0 };

  onProgress(0, 'Reading the PDF');
  await nextFrame();
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  if (opts.removeMetadata) removeMetadata(doc);
  const imagesRecompressed = opts.images ? await recompressImages(doc, opts, (f, l) => onProgress(f * 0.7, l)) : 0;
  removeUnusedObjects(doc.context);
  await deflateStreams(doc.context, (f, l) => onProgress(0.7 + f * 0.25, l));
  onProgress(0.95, 'Writing the PDF');
  await nextFrame();
  const out = await doc.save({ useObjectStreams: true, addDefaultPage: false, updateFieldAppearances: false });
  return { bytes: out, imagesRecompressed };
}
