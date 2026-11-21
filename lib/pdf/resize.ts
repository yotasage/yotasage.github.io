// Vector-preserving PDF page resizing via embedPage (honors /Rotate and /CropBox).
import {
  clip,
  endPath,
  PDFDocument,
  PDFEmbeddedPage,
  PDFPage,
  popGraphicsState,
  pushGraphicsState,
  rectangle,
} from '@cantoo/pdf-lib';

import { parsePageRanges } from './merge';
import { N } from './objects';

export type ResizePresetKey = 'a3' | 'a4' | 'a5' | 'letter' | 'legal' | 'tabloid' | 'custom';
export type ResizeUnit = 'pt' | 'mm' | 'in';
export type PageOrientation = 'auto' | 'portrait' | 'landscape';
export type ResizeFitMode = 'fit' | 'fill' | 'stretch' | 'center';

export interface PaperSizeSpec {
  label: string;
  widthPt: number;
  heightPt: number;
}

/** Standard portrait paper sizes in PDF points (1 in = 72 pt, 1 mm = 72 / 25.4 pt). */
export const RESIZE_PRESETS: Record<Exclude<ResizePresetKey, 'custom'>, PaperSizeSpec> = {
  a3: { label: 'A3 (297 × 420 mm)', widthPt: 841.89, heightPt: 1190.55 },
  a4: { label: 'A4 (210 × 297 mm)', widthPt: 595.28, heightPt: 841.89 },
  a5: { label: 'A5 (148 × 210 mm)', widthPt: 419.53, heightPt: 595.28 },
  letter: { label: 'US Letter (8.5 × 11 in)', widthPt: 612, heightPt: 792 },
  legal: { label: 'US Legal (8.5 × 14 in)', widthPt: 612, heightPt: 1008 },
  tabloid: { label: 'Tabloid (11 × 17 in)', widthPt: 792, heightPt: 1224 },
};

export interface ResizeOptions {
  preset: ResizePresetKey;
  /** Width in `customUnit` when preset === 'custom'. */
  customWidth?: number;
  /** Height in `customUnit` when preset === 'custom'. */
  customHeight?: number;
  /** Unit for custom dimensions. Default 'mm'. */
  customUnit?: ResizeUnit;
  /** 'auto' matches each source page's portrait/landscape orientation. Default 'auto'. */
  orientation?: PageOrientation;
  /** 'fit' (contain), 'fill' (cover), 'stretch', or 'center' (1:1 actual size). Default 'fit'. */
  fitMode?: ResizeFitMode;
  /** Uniform page margin in PDF points. Default 0. */
  margin?: number;
  /** Optional 1-based page range string. Unselected pages are copied unchanged. */
  pageRange?: string;
}

export function toPoints(value: number, unit: ResizeUnit): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error('Custom page dimensions must be positive numbers.');
  }
  if (unit === 'mm') return (value * 72) / 25.4;
  if (unit === 'in') return value * 72;
  return value;
}

export interface UprightEmbeddedSource {
  embedded: PDFEmbeddedPage | null;
  visW: number;
  visH: number;
}

function getEffectiveVisibleBox(page: PDFPage): [number, number, number, number] {
  const media = page.getMediaBox();
  const crop = page.getCropBox();

  const mx0 = Math.min(media.x, media.x + media.width);
  const my0 = Math.min(media.y, media.y + media.height);
  const mx1 = Math.max(media.x, media.x + media.width);
  const my1 = Math.max(media.y, media.y + media.height);

  const cx0 = Math.min(crop.x, crop.x + crop.width);
  const cy0 = Math.min(crop.y, crop.y + crop.height);
  const cx1 = Math.max(crop.x, crop.x + crop.width);
  const cy1 = Math.max(crop.y, crop.y + crop.height);

  const vx0 = Math.max(mx0, cx0);
  const vy0 = Math.max(my0, cy0);
  const vx1 = Math.min(mx1, cx1);
  const vy1 = Math.min(my1, cy1);

  if (vx1 <= vx0 || vy1 <= vy0) return [mx0, my0, mx1, my1];
  return [vx0, vy0, vx1, vy1];
}

/**
 * Embeds a source page into `outDoc` clipped to its effective /CropBox and transformed via /Matrix
 * so that the resulting Form XObject occupies [0, visW] x [0, visH] visually upright regardless of /Rotate.
 * Returns `embedded: null` if the source page has no content stream (blank page).
 */
export async function embedPageUpright(outDoc: PDFDocument, srcPage: PDFPage): Promise<UprightEmbeddedSource> {
  const [vx0, vy0, vx1, vy1] = getEffectiveVisibleBox(srcPage);
  const rawW = Math.max(1, vx1 - vx0);
  const rawH = Math.max(1, vy1 - vy0);
  const rot = ((Math.round(srcPage.getRotation().angle / 90) * 90) % 360 + 360) % 360;

  let visW: number;
  let visH: number;
  let matrix: [number, number, number, number, number, number];

  if (rot === 90) {
    visW = rawH;
    visH = rawW;
    matrix = [0, -1, 1, 0, -vy0, vx1];
  } else if (rot === 180) {
    visW = rawW;
    visH = rawH;
    matrix = [-1, 0, 0, -1, vx1, vy1];
  } else if (rot === 270) {
    visW = rawH;
    visH = rawW;
    matrix = [0, 1, -1, 0, vy1, -vx0];
  } else {
    visW = rawW;
    visH = rawH;
    matrix = [1, 0, 0, 1, -vx0, -vy0];
  }

  const hasContents = srcPage.node.get(N('Contents')) !== undefined;
  if (!hasContents) {
    return { embedded: null, visW, visH };
  }

  try {
    const embedded = await outDoc.embedPage(
      srcPage,
      { left: vx0, bottom: vy0, right: vx1, top: vy1 },
      matrix,
    );
    return { embedded, visW, visH };
  } catch {
    // Pages with missing/empty normalized contents render as blank without throwing.
    return { embedded: null, visW, visH };
  }
}

function resolveBaseDimensions(options: ResizeOptions): { width: number; height: number } {
  if (options.preset === 'custom') {
    const unit: ResizeUnit = options.customUnit ?? 'mm';
    const w = toPoints(options.customWidth ?? 210, unit);
    const h = toPoints(options.customHeight ?? 297, unit);
    return { width: w, height: h };
  }
  const spec = RESIZE_PRESETS[options.preset] ?? RESIZE_PRESETS.a4;
  return { width: spec.widthPt, height: spec.heightPt };
}

function orientTargetSize(
  baseW: number,
  baseH: number,
  orientation: PageOrientation,
  srcVisW: number,
  srcVisH: number,
): { targetW: number; targetH: number } {
  const shortSide = Math.min(baseW, baseH);
  const longSide = Math.max(baseW, baseH);

  if (orientation === 'portrait') {
    return { targetW: shortSide, targetH: longSide };
  }
  if (orientation === 'landscape') {
    return { targetW: longSide, targetH: shortSide };
  }
  // 'auto': match source visual orientation (landscape if strictly wider than tall)
  return srcVisW > srcVisH
    ? { targetW: longSide, targetH: shortSide }
    : { targetW: shortSide, targetH: longSide };
}

/**
 * Resizes selected pages onto target paper dimensions using vector-preserving `embedPage`.
 * Unselected pages (when `pageRange` is provided) are copied unchanged.
 */
export async function resizePdf(
  bytes: Uint8Array,
  options: ResizeOptions,
  password?: string,
): Promise<Uint8Array> {
  const srcDoc = await PDFDocument.load(bytes, { updateMetadata: false, password });
  const outDoc = await PDFDocument.create();
  const srcPages = srcDoc.getPages();
  const pageCount = srcPages.length;

  const selectedSet = options.pageRange && options.pageRange.trim()
    ? new Set(parsePageRanges(options.pageRange, pageCount))
    : new Set(srcPages.map((_, i) => i));

  const base = resolveBaseDimensions(options);
  const orientation: PageOrientation = options.orientation ?? 'auto';
  const fitMode: ResizeFitMode = options.fitMode ?? 'fit';
  const rawMargin = Math.max(0, Number.isFinite(options.margin) ? options.margin! : 0);

  for (let i = 0; i < pageCount; i++) {
    if (!selectedSet.has(i)) {
      const [copied] = await outDoc.copyPages(srcDoc, [i]);
      outDoc.addPage(copied);
      continue;
    }

    const srcPage = srcPages[i];
    const { embedded, visW, visH } = await embedPageUpright(outDoc, srcPage);
    const { targetW, targetH } = orientTargetSize(base.width, base.height, orientation, visW, visH);

    const outPage = outDoc.addPage([targetW, targetH]);
    if (!embedded) continue;

    const margin = Math.min(rawMargin, Math.min(targetW, targetH) / 2 - 1);
    const safeMargin = Math.max(0, margin);
    const availW = Math.max(1, targetW - safeMargin * 2);
    const availH = Math.max(1, targetH - safeMargin * 2);

    let xScale: number;
    let yScale: number;
    if (fitMode === 'fill') {
      const s = Math.max(availW / visW, availH / visH);
      xScale = s;
      yScale = s;
    } else if (fitMode === 'stretch') {
      xScale = availW / visW;
      yScale = availH / visH;
    } else if (fitMode === 'center') {
      xScale = 1;
      yScale = 1;
    } else {
      // 'fit'
      const s = Math.min(availW / visW, availH / visH);
      xScale = s;
      yScale = s;
    }

    const drawW = visW * xScale;
    const drawH = visH * yScale;
    const x = safeMargin + (availW - drawW) / 2;
    const y = safeMargin + (availH - drawH) / 2;

    const needsClip =
      fitMode === 'fill' ||
      fitMode === 'center' ||
      (safeMargin > 0 && (drawW > availW + 0.01 || drawH > availH + 0.01));

    if (needsClip) {
      outPage.pushOperators(
        pushGraphicsState(),
        rectangle(safeMargin, safeMargin, availW, availH),
        clip(),
        endPath(),
      );
    }

    outPage.drawPage(embedded, { x, y, xScale, yScale });

    if (needsClip) {
      outPage.pushOperators(popGraphicsState());
    }
  }

  return outDoc.save({
    useObjectStreams: true,
    addDefaultPage: false,
    updateFieldAppearances: false,
  });
}
