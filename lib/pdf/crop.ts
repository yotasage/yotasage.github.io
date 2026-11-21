// Inspect page boxes and crop PDF pages via /CropBox (honoring /Rotate and /MediaBox clamping).
import { PDFArray, PDFDict, PDFDocument, PDFNumber, PDFPage } from '@cantoo/pdf-lib';

import { parsePageRanges } from './merge';
import { N, removeUnusedObjects } from './objects';

export interface PdfBoxRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PageBoxInfo {
  pageIndex: number;
  rotation: number;
  mediaBox: PdfBoxRect;
  cropBox: PdfBoxRect;
  visualWidth: number;
  visualHeight: number;
}

/** Normalized visual crop rectangle in 0..1 fractions of the visually rotated page, origin at visual top-left. */
export interface NormalizedCropRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Uniform inward trim margins in PDF points relative to the visually rotated page. */
export interface CropMarginsPt {
  left?: number;
  top?: number;
  right?: number;
  bottom?: number;
}

export interface CropOptions {
  /** Reset /CropBox back to /MediaBox on selected pages. */
  resetCrop?: boolean;
  /** Uniform normalized visual crop rectangle (0..1 fractions, origin at visual top-left). */
  cropRect?: NormalizedCropRect;
  /** Per-page normalized visual crop rectangles keyed by 1-based page number. */
  perPageCrops?: Record<number, NormalizedCropRect>;
  /** Uniform margins in PDF points to trim inward from each visual edge. */
  margins?: CropMarginsPt;
  /** Optional 1-based page range string (e.g. '1-3, 5'). Empty = all pages. */
  pageRange?: string;
}

function normalizeRotation(angle: number): number {
  return ((Math.round(angle / 90) * 90) % 360 + 360) % 360;
}

function normalizeRect(box: { x: number; y: number; width: number; height: number }): [number, number, number, number] {
  const x0 = Math.min(box.x, box.x + box.width);
  const y0 = Math.min(box.y, box.y + box.height);
  const x1 = Math.max(box.x, box.x + box.width);
  const y1 = Math.max(box.y, box.y + box.height);
  return [x0, y0, x1, y1];
}

function toPdfBoxRect(coords: [number, number, number, number]): PdfBoxRect {
  return {
    x: coords[0],
    y: coords[1],
    width: coords[2] - coords[0],
    height: coords[3] - coords[1],
  };
}

function getEffectiveBoxes(page: PDFPage): {
  media: [number, number, number, number];
  crop: [number, number, number, number];
  rotation: number;
  visualWidth: number;
  visualHeight: number;
} {
  const media = normalizeRect(page.getMediaBox());
  const rawCrop = normalizeRect(page.getCropBox());

  const vx0 = Math.max(media[0], rawCrop[0]);
  const vy0 = Math.max(media[1], rawCrop[1]);
  const vx1 = Math.min(media[2], rawCrop[2]);
  const vy1 = Math.min(media[3], rawCrop[3]);

  const crop: [number, number, number, number] = vx1 > vx0 && vy1 > vy0 ? [vx0, vy0, vx1, vy1] : media;
  const rotation = normalizeRotation(page.getRotation().angle);
  const cropW = crop[2] - crop[0];
  const cropH = crop[3] - crop[1];
  const swapped = rotation === 90 || rotation === 270;

  return {
    media,
    crop,
    rotation,
    visualWidth: swapped ? cropH : cropW,
    visualHeight: swapped ? cropW : cropH,
  };
}

function readBoxArray(node: PDFDict, key: string): [number, number, number, number] | null {
  const arr = node.lookup(N(key));
  if (!(arr instanceof PDFArray) || arr.size() < 4) return null;
  const nums: number[] = [];
  for (let i = 0; i < 4; i++) {
    const val = node.context.lookup(arr.get(i));
    if (!(val instanceof PDFNumber)) return null;
    const n = val.asNumber();
    if (!Number.isFinite(n)) return null;
    nums.push(n);
  }
  return [Math.min(nums[0], nums[2]), Math.min(nums[1], nums[3]), Math.max(nums[0], nums[2]), Math.max(nums[1], nums[3])];
}

function clampBoxInsideMedia(
  px0: number,
  py0: number,
  px1: number,
  py1: number,
  media: [number, number, number, number],
): [number, number, number, number] {
  const [mx0, my0, mx1, my1] = media;
  let x0 = Math.max(mx0, Math.min(mx1, Math.min(px0, px1)));
  let x1 = Math.max(mx0, Math.min(mx1, Math.max(px0, px1)));
  let y0 = Math.max(my0, Math.min(my1, Math.min(py0, py1)));
  let y1 = Math.max(my0, Math.min(my1, Math.max(py0, py1)));

  const mediaW = mx1 - mx0;
  const mediaH = my1 - my0;
  const minW = Math.min(1, Math.max(0.01, mediaW));
  const minH = Math.min(1, Math.max(0.01, mediaH));

  if (x1 - x0 < minW) {
    const mid = (x0 + x1) / 2;
    x0 = Math.max(mx0, Math.min(mx1 - minW, mid - minW / 2));
    x1 = Math.min(mx1, x0 + minW);
  }
  if (y1 - y0 < minH) {
    const mid = (y0 + y1) / 2;
    y0 = Math.max(my0, Math.min(my1 - minH, mid - minH / 2));
    y1 = Math.min(my1, y0 + minH);
  }

  return [x0, y0, x1, y1];
}

/**
 * Converts a visual top-left rectangle (rx, ry, rw, rh) in points on the rotated page's current visible box
 * into raw PDF user-space coordinates [x0, y0, x1, y1], clamped to /MediaBox with width/height >= 1pt.
 */
function visualRectToPdfCoords(
  rx: number,
  ry: number,
  rw: number,
  rh: number,
  viewBox: [number, number, number, number],
  mediaBox: [number, number, number, number],
  rotation: number,
): [number, number, number, number] {
  const [vx0, vy0, vx1, vy1] = viewBox;
  let px0: number;
  let py0: number;
  let px1: number;
  let py1: number;

  if (rotation === 90) {
    px0 = vx0 + ry;
    px1 = vx0 + ry + rh;
    py0 = vy0 + rx;
    py1 = vy0 + rx + rw;
  } else if (rotation === 180) {
    px0 = vx1 - (rx + rw);
    px1 = vx1 - rx;
    py0 = vy0 + ry;
    py1 = vy0 + ry + rh;
  } else if (rotation === 270) {
    px0 = vx1 - (ry + rh);
    px1 = vx1 - ry;
    py0 = vy1 - (rx + rw);
    py1 = vy1 - rx;
  } else {
    px0 = vx0 + rx;
    px1 = vx0 + rx + rw;
    py0 = vy1 - (ry + rh);
    py1 = vy1 - ry;
  }

  return clampBoxInsideMedia(px0, py0, px1, py1, mediaBox);
}

function clampOptionalSubBox(page: PDFPage, key: 'TrimBox' | 'ArtBox', crop: [number, number, number, number]) {
  const existing = readBoxArray(page.node, key);
  if (!existing) return;
  const [ex0, ey0, ex1, ey1] = existing;
  const [cx0, cy0, cx1, cy1] = crop;
  if (ex0 >= cx0 && ey0 >= cy0 && ex1 <= cx1 && ey1 <= cy1) return;

  const ix0 = Math.max(ex0, cx0);
  const iy0 = Math.max(ey0, cy0);
  const ix1 = Math.min(ex1, cx1);
  const iy1 = Math.min(ey1, cy1);
  const [nx0, ny0, nx1, ny1] = ix1 - ix0 >= 1 && iy1 - iy0 >= 1 ? [ix0, iy0, ix1, iy1] : crop;

  if (key === 'TrimBox') {
    page.setTrimBox(nx0, ny0, nx1 - nx0, ny1 - ny0);
  } else {
    page.setArtBox(nx0, ny0, nx1 - nx0, ny1 - ny0);
  }
}

/**
 * Returns per-page MediaBox, effective CropBox, normalized rotation, and visual dimensions in points.
 */
export async function getPageBoxes(bytes: Uint8Array, password?: string): Promise<PageBoxInfo[]> {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false, password });
  return doc.getPages().map((page, pageIndex) => {
    const info = getEffectiveBoxes(page);
    return {
      pageIndex,
      rotation: info.rotation,
      mediaBox: toPdfBoxRect(info.media),
      cropBox: toPdfBoxRect(info.crop),
      visualWidth: info.visualWidth,
      visualHeight: info.visualHeight,
    };
  });
}

/**
 * Crops selected PDF pages by updating /CropBox (and clamping /TrimBox and /ArtBox if outside the new crop).
 */
export async function cropPdf(
  bytes: Uint8Array,
  options: CropOptions,
  password?: string,
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false, password });
  const wasEncrypted = Boolean(
    doc.context.trailerInfo.Encrypt ||
      doc.context.security ||
      (doc.context as { isDecrypted?: boolean }).isDecrypted,
  );
  const pages = doc.getPages();
  const pageCount = pages.length;

  let targetIndices: number[];
  if (options.pageRange && options.pageRange.trim()) {
    targetIndices = Array.from(new Set(parsePageRanges(options.pageRange, pageCount)));
  } else if (
    options.perPageCrops &&
    !options.resetCrop &&
    !options.cropRect &&
    !options.margins
  ) {
    targetIndices = Object.keys(options.perPageCrops)
      .map((k) => Number(k) - 1)
      .filter((idx) => Number.isInteger(idx) && idx >= 0 && idx < pageCount);
  } else {
    targetIndices = pages.map((_, idx) => idx);
  }

  for (const idx of targetIndices) {
    const page = pages[idx];
    const info = getEffectiveBoxes(page);

    if (options.resetCrop) {
      const [mx0, my0, mx1, my1] = info.media;
      page.setCropBox(mx0, my0, mx1 - mx0, my1 - my0);
      continue;
    }

    const pageNum = idx + 1;
    const normRect = options.perPageCrops?.[pageNum] ?? options.cropRect;

    let rx: number;
    let ry: number;
    let rw: number;
    let rh: number;

    if (normRect) {
      const l = Math.max(0, Math.min(1, Number.isFinite(normRect.left) ? normRect.left : 0));
      const t = Math.max(0, Math.min(1, Number.isFinite(normRect.top) ? normRect.top : 0));
      const r = Math.max(0, Math.min(1, Number.isFinite(normRect.right) ? normRect.right : 1));
      const b = Math.max(0, Math.min(1, Number.isFinite(normRect.bottom) ? normRect.bottom : 1));
      const left = Math.min(l, r);
      const right = Math.max(l, r);
      const top = Math.min(t, b);
      const bottom = Math.max(t, b);
      rx = left * info.visualWidth;
      ry = top * info.visualHeight;
      rw = (right - left) * info.visualWidth;
      rh = (bottom - top) * info.visualHeight;
    } else if (options.margins) {
      const ml = Math.max(0, Number.isFinite(options.margins.left) ? options.margins.left! : 0);
      const mt = Math.max(0, Number.isFinite(options.margins.top) ? options.margins.top! : 0);
      const mr = Math.max(0, Number.isFinite(options.margins.right) ? options.margins.right! : 0);
      const mb = Math.max(0, Number.isFinite(options.margins.bottom) ? options.margins.bottom! : 0);
      rx = ml;
      ry = mt;
      rw = Math.max(1, info.visualWidth - ml - mr);
      rh = Math.max(1, info.visualHeight - mt - mb);
    } else {
      continue;
    }

    const newCrop = visualRectToPdfCoords(rx, ry, rw, rh, info.crop, info.media, info.rotation);
    page.setCropBox(newCrop[0], newCrop[1], newCrop[2] - newCrop[0], newCrop[3] - newCrop[1]);
    clampOptionalSubBox(page, 'TrimBox', newCrop);
    clampOptionalSubBox(page, 'ArtBox', newCrop);
  }

  if (wasEncrypted) {
    delete doc.context.trailerInfo.Encrypt;
    doc.context.security = undefined;
    removeUnusedObjects(doc.context);
  }

  return doc.save({
    useObjectStreams: true,
    addDefaultPage: false,
    updateFieldAppearances: false,
  });
}
