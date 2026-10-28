import { concatTransformationMatrix, drawObject, PDFDocument, PDFImage, popGraphicsState, pushGraphicsState } from '@cantoo/pdf-lib';

import { canvasToBytes, nextFrame, readBytes } from './files';

export type PageSizeId = 'image' | 'a4' | 'a3' | 'a5' | 'letter' | 'legal';

// Portrait sizes in PDF points (1/72 inch).
export const PAGE_SIZES: Record<Exclude<PageSizeId, 'image'>, { label: string; w: number; h: number }> = {
  a4: { label: 'A4 (210 × 297 mm)', w: 595.28, h: 841.89 },
  a3: { label: 'A3 (297 × 420 mm)', w: 841.89, h: 1190.55 },
  a5: { label: 'A5 (148 × 210 mm)', w: 419.53, h: 595.28 },
  letter: { label: 'US Letter (8.5 × 11 in)', w: 612, h: 792 },
  legal: { label: 'US Legal (8.5 × 14 in)', w: 612, h: 1008 },
};

export interface ImagesToPdfOptions {
  pageSize: PageSizeId;
  orientation: 'auto' | 'portrait' | 'landscape';
  marginMm: number;
  // 'fit' scales every image to fill the printable area; 'original' keeps the size given by `dpi` unless it is too large.
  placement: 'fit' | 'original';
  dpi: number;
}

export interface ImageInput {
  file: File;
  // Extra clockwise rotation chosen by the user: 0, 90, 180 or 270.
  rotation: number;
}

interface Orientation {
  rotate: number;
  mirror: boolean;
}

// EXIF orientation 1-8 as a horizontal mirror followed by a clockwise rotation.
const EXIF_ORIENTATION: Record<number, Orientation> = {
  1: { rotate: 0, mirror: false },
  2: { rotate: 0, mirror: true },
  3: { rotate: 180, mirror: false },
  4: { rotate: 180, mirror: true },
  5: { rotate: 270, mirror: true },
  6: { rotate: 90, mirror: false },
  7: { rotate: 90, mirror: true },
  8: { rotate: 270, mirror: false },
};

// Reads the orientation tag (0x0112) from the EXIF block of a JPEG file.
export function jpegOrientation(bytes: Uint8Array): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let pos = 2;
  while (pos + 4 <= bytes.length && bytes[pos] === 0xff) {
    const marker = bytes[pos + 1];
    const len = view.getUint16(pos + 2);
    if (marker === 0xda || marker === 0xd9) break;
    const exif = pos + 4;
    if (marker === 0xe1 && view.getUint32(exif) === 0x45786966 && view.getUint16(exif + 4) === 0) {
      const tiff = exif + 6;
      const little = view.getUint16(tiff) === 0x4949;
      const u16 = (o: number) => view.getUint16(tiff + o, little);
      const ifd = view.getUint32(tiff + 4, little);
      const count = u16(ifd);
      for (let i = 0; i < count; i++) {
        const entry = ifd + 2 + i * 12;
        if (u16(entry) === 0x0112) {
          const value = u16(entry + 8);
          return value >= 1 && value <= 8 ? value : 1;
        }
      }
      return 1;
    }
    pos += 2 + len;
  }
  return 1;
}

function isJpeg(b: Uint8Array) {
  return b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
}

function isPng(b: Uint8Array) {
  return b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
}

function loadImageElement(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('This browser cannot decode the image format.'));
    };
    img.src = url;
  });
}

// Formats that PDF cannot hold directly are drawn on a canvas and stored as PNG (with transparency) or JPEG.
async function rasterize(file: File, doc: PDFDocument): Promise<PDFImage> {
  const img = await loadImageElement(file);
  let w = img.naturalWidth || 1024;
  let h = img.naturalHeight || 1024;
  if (/svg/i.test(file.type) || /\.svg$/i.test(file.name)) {
    const scale = Math.max(1, 2000 / Math.max(w, h));
    w = Math.round(w * scale);
    h = Math.round(h * scale);
  }
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, w, h);
  const pixels = ctx.getImageData(0, 0, w, h).data;
  let transparent = false;
  for (let i = 3; i < pixels.length; i += 4) {
    if (pixels[i] < 255) {
      transparent = true;
      break;
    }
  }
  return transparent
    ? doc.embedPng(await canvasToBytes(canvas, 'image/png'))
    : doc.embedJpg(await canvasToBytes(canvas, 'image/jpeg', 0.92));
}

// JPEG and PNG files are embedded unchanged; the browser already applied the EXIF orientation to rasterized images.
async function embedImage(file: File, doc: PDFDocument): Promise<{ image: PDFImage; orientation: Orientation }> {
  const bytes = await readBytes(file);
  try {
    if (isJpeg(bytes)) return { image: await doc.embedJpg(bytes), orientation: EXIF_ORIENTATION[jpegOrientation(bytes)] };
    if (isPng(bytes)) return { image: await doc.embedPng(bytes), orientation: EXIF_ORIENTATION[1] };
  } catch {
    // Unusual variants that the embedder rejects go through the canvas below.
  }
  return { image: await rasterize(file, doc), orientation: EXIF_ORIENTATION[1] };
}

type Matrix = [number, number, number, number, number, number];

// The affine transform that applies `m` first and then `n`.
function compose(m: Matrix, n: Matrix): Matrix {
  return [
    n[0] * m[0] + n[2] * m[1],
    n[1] * m[0] + n[3] * m[1],
    n[0] * m[2] + n[2] * m[3],
    n[1] * m[2] + n[3] * m[3],
    n[0] * m[4] + n[2] * m[5] + n[4],
    n[1] * m[4] + n[3] * m[5] + n[5],
  ];
}

const MIRROR_UNIT: Matrix = [-1, 0, 0, 1, 1, 0];
const ROTATE_UNIT_CW: Matrix = [0, -1, 1, 0, 0, 1];

async function addImagePage(doc: PDFDocument, input: ImageInput, opts: ImagesToPdfOptions) {
  const { image, orientation } = await embedImage(input.file, doc);
  const rotate = (((orientation.rotate + input.rotation) % 360) + 360) % 360;
  const swap = rotate % 180 !== 0;
  const naturalW = ((swap ? image.height : image.width) * 72) / opts.dpi;
  const naturalH = ((swap ? image.width : image.height) * 72) / opts.dpi;
  const margin = (opts.marginMm * 72) / 25.4;

  let pageW: number;
  let pageH: number;
  let box: { x: number; y: number; w: number; h: number };
  if (opts.pageSize === 'image') {
    pageW = naturalW + 2 * margin;
    pageH = naturalH + 2 * margin;
    box = { x: margin, y: margin, w: naturalW, h: naturalH };
  } else {
    const size = PAGE_SIZES[opts.pageSize];
    const landscape = opts.orientation === 'landscape' || (opts.orientation === 'auto' && naturalW > naturalH);
    pageW = landscape ? size.h : size.w;
    pageH = landscape ? size.w : size.h;
    const areaW = pageW - 2 * margin;
    const areaH = pageH - 2 * margin;
    if (areaW <= 1 || areaH <= 1) throw new Error('The margins leave no room for the image on the page.');
    let scale = Math.min(areaW / naturalW, areaH / naturalH);
    if (opts.placement === 'original') scale = Math.min(1, scale);
    const w = naturalW * scale;
    const h = naturalH * scale;
    box = { x: (pageW - w) / 2, y: (pageH - h) / 2, w, h };
  }

  // The image fills the unit square; mirror and rotate it there, then stretch it over the box.
  let m: Matrix = orientation.mirror ? MIRROR_UNIT : [1, 0, 0, 1, 0, 0];
  for (let r = 0; r < rotate; r += 90) m = compose(m, ROTATE_UNIT_CW);
  m = compose(m, [box.w, 0, 0, box.h, box.x, box.y]);

  const page = doc.addPage([pageW, pageH]);
  const name = page.node.newXObject('Image', image.ref);
  page.pushOperators(pushGraphicsState(), concatTransformationMatrix(...m), drawObject(name), popGraphicsState());
}

// Returns one PDF with a page per image, or one PDF per image when `separate` is set.
export async function imagesToPdf(
  inputs: ImageInput[],
  opts: ImagesToPdfOptions,
  separate: boolean,
  onProgress?: (done: number, total: number) => void,
): Promise<Uint8Array[]> {
  const out: Uint8Array[] = [];
  let doc = await PDFDocument.create();
  for (let i = 0; i < inputs.length; i++) {
    onProgress?.(i, inputs.length);
    await nextFrame();
    try {
      await addImagePage(doc, inputs[i], opts);
    } catch (e) {
      throw new Error(`${inputs[i].file.name}: ${e instanceof Error ? e.message : String(e)}`);
    }
    if (separate) {
      out.push(await doc.save());
      doc = await PDFDocument.create();
    }
  }
  if (!separate) out.push(await doc.save());
  onProgress?.(inputs.length, inputs.length);
  return out;
}
