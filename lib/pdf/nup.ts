// N-up multi-page imposition and saddle-stitch booklet imposition via vector-preserving embedPage.
import {
  concatTransformationMatrix,
  PDFDocument,
  PDFPage,
  popGraphicsState,
  pushGraphicsState,
  rgb,
} from '@cantoo/pdf-lib';

import { parsePageRanges } from './merge';
import { embedPageUpright, RESIZE_PRESETS, UprightEmbeddedSource } from './resize';

export type NupPerSheet = 2 | 4 | 6 | 9 | 16;
export type NupReadingOrder = 'lr-tb' | 'rl-tb' | 'tb-lr' | 'tb-rl';
export type SheetPaperSize = 'a4' | 'a3' | 'letter' | 'legal' | 'custom';

export interface NupOptions {
  /** Number of source pages per sheet (used unless both `cols` and `rows` are given). Default 2. */
  perSheet?: NupPerSheet;
  /** Custom grid columns (must be paired with `rows`). */
  cols?: number;
  /** Custom grid rows (must be paired with `cols`). */
  rows?: number;
  /** Output sheet size. Default 'a4'. */
  paperSize?: SheetPaperSize;
  customWidthPt?: number;
  customHeightPt?: number;
  /** Output sheet orientation. Default 'auto'. */
  orientation?: 'auto' | 'portrait' | 'landscape';
  /** Reading order within each sheet. Default 'lr-tb'. */
  readingOrder?: NupReadingOrder;
  /** Outer margin around the grid in points. Default 18. */
  margin?: number;
  /** Spacing between cells in points. Default 12. */
  gutter?: number;
  /** Draw a subtle hairline border around each placed page. Default false. */
  drawBorder?: boolean;
  /** Optional 1-based page range string. Empty = all pages. */
  pageRange?: string;
}

export interface BookletOptions {
  /** Binding edge: 'left' for LTR booklets, 'right' for RTL booklets. Default 'left'. */
  binding?: 'left' | 'right';
  /** Duplex printer flip edge: 'short-edge' (upright backs) or 'long-edge' (back sides rotated 180°). Default 'short-edge'. */
  duplexEdge?: 'short-edge' | 'long-edge';
  /** Output sheet paper size (always placed in landscape). Default 'a4'. */
  paperSize?: SheetPaperSize;
  customWidthPt?: number;
  customHeightPt?: number;
  /** Outer margin around the sheet in points. Default 18. */
  margin?: number;
  /** Inner spine gutter between the two facing pages in points. Default 12. */
  gutter?: number;
  /** Draw subtle top/bottom center fold ticks. Default true. */
  drawFoldMark?: boolean;
  /** Draw a subtle hairline border around each placed page. Default false. */
  drawBorder?: boolean;
  /** Optional 1-based page range string to impose. Empty = all pages. */
  pageRange?: string;
}

function resolveSheetPaper(
  paperSize: SheetPaperSize | undefined,
  customWidthPt?: number,
  customHeightPt?: number,
): { shortSide: number; longSide: number } {
  if (paperSize === 'custom') {
    const w = customWidthPt ?? 595.28;
    const h = customHeightPt ?? 841.89;
    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
      throw new Error('Custom sheet dimensions must be positive numbers.');
    }
    return { shortSide: Math.min(w, h), longSide: Math.max(w, h) };
  }
  const spec = RESIZE_PRESETS[paperSize ?? 'a4'] ?? RESIZE_PRESETS.a4;
  return { shortSide: Math.min(spec.widthPt, spec.heightPt), longSide: Math.max(spec.widthPt, spec.heightPt) };
}

function resolveGridAndSheet(
  options: NupOptions,
  dominantLandscape: boolean,
  shortSide: number,
  longSide: number,
): { cols: number; rows: number; sheetW: number; sheetH: number } {
  const orient = options.orientation ?? 'auto';
  const hasCustomGrid =
    Number.isInteger(options.cols) &&
    Number.isInteger(options.rows) &&
    (options.cols ?? 0) > 0 &&
    (options.rows ?? 0) > 0;

  if (hasCustomGrid) {
    const cols = options.cols!;
    const rows = options.rows!;
    let landscape: boolean;
    if (orient === 'landscape') {
      landscape = true;
    } else if (orient === 'portrait') {
      landscape = false;
    } else {
      // Choose sheet orientation that maximizes fit scale for dominant source aspect ratio.
      const srcAspect = dominantLandscape ? 1.414 : 1 / 1.414;
      const fitPortrait = Math.min(shortSide / cols / srcAspect, longSide / rows);
      const fitLandscape = Math.min(longSide / cols / srcAspect, shortSide / rows);
      landscape = fitLandscape > fitPortrait;
    }
    return {
      cols,
      rows,
      sheetW: landscape ? longSide : shortSide,
      sheetH: landscape ? shortSide : longSide,
    };
  }

  const perSheet: NupPerSheet = options.perSheet ?? 2;
  let landscape: boolean;
  if (orient === 'landscape') {
    landscape = true;
  } else if (orient === 'portrait') {
    landscape = false;
  } else if (perSheet === 2 || perSheet === 6) {
    // 2-up and 6-up of portrait pages fit best on landscape sheets (and vice versa).
    landscape = !dominantLandscape;
  } else {
    landscape = dominantLandscape;
  }

  let cols: number;
  let rows: number;
  if (perSheet === 2) {
    cols = landscape ? 2 : 1;
    rows = landscape ? 1 : 2;
  } else if (perSheet === 4) {
    cols = 2;
    rows = 2;
  } else if (perSheet === 6) {
    cols = landscape ? 3 : 2;
    rows = landscape ? 2 : 3;
  } else if (perSheet === 9) {
    cols = 3;
    rows = 3;
  } else {
    cols = 4;
    rows = 4;
  }

  return {
    cols,
    rows,
    sheetW: landscape ? longSide : shortSide,
    sheetH: landscape ? shortSide : longSide,
  };
}

function slotToColRow(
  slot: number,
  cols: number,
  rows: number,
  order: NupReadingOrder,
): { col: number; rowFromTop: number } {
  if (order === 'rl-tb') {
    return { col: cols - 1 - (slot % cols), rowFromTop: Math.floor(slot / cols) };
  }
  if (order === 'tb-lr') {
    return { col: Math.floor(slot / rows), rowFromTop: slot % rows };
  }
  if (order === 'tb-rl') {
    return { col: cols - 1 - Math.floor(slot / rows), rowFromTop: slot % rows };
  }
  return { col: slot % cols, rowFromTop: Math.floor(slot / cols) };
}

function drawFittedTile(
  sheet: PDFPage,
  tile: UprightEmbeddedSource,
  cellX: number,
  cellY: number,
  cellW: number,
  cellH: number,
  drawBorder: boolean,
) {
  const scale = Math.min(cellW / tile.visW, cellH / tile.visH);
  const drawW = tile.visW * scale;
  const drawH = tile.visH * scale;
  const x = cellX + (cellW - drawW) / 2;
  const y = cellY + (cellH - drawH) / 2;

  if (tile.embedded) {
    sheet.drawPage(tile.embedded, { x, y, xScale: scale, yScale: scale });
  }
  if (drawBorder) {
    sheet.drawRectangle({
      x,
      y,
      width: drawW,
      height: drawH,
      borderWidth: 0.5,
      borderColor: rgb(0.75, 0.75, 0.75),
    });
  }
}

/**
 * Lays out multiple source pages per output sheet (N-up) using vector-preserving `embedPage`.
 */
export async function nupPdf(
  bytes: Uint8Array,
  options: NupOptions = {},
  password?: string,
): Promise<Uint8Array> {
  const srcDoc = await PDFDocument.load(bytes, { updateMetadata: false, password });
  const outDoc = await PDFDocument.create();
  const srcPages = srcDoc.getPages();
  const pageCount = srcPages.length;

  const indices = options.pageRange && options.pageRange.trim()
    ? parsePageRanges(options.pageRange, pageCount)
    : srcPages.map((_, i) => i);

  if (indices.length === 0) {
    return outDoc.save({ useObjectStreams: true, addDefaultPage: false, updateFieldAppearances: false });
  }

  // Embed each needed source page once (cache by source page index if repeated in pageRange).
  const embeddedCache = new Map<number, UprightEmbeddedSource>();
  let landscapeVotes = 0;
  for (const idx of indices) {
    let tile = embeddedCache.get(idx);
    if (!tile) {
      tile = await embedPageUpright(outDoc, srcPages[idx]);
      embeddedCache.set(idx, tile);
    }
    if (tile.visW > tile.visH) landscapeVotes++;
  }
  const dominantLandscape = landscapeVotes > indices.length / 2;

  const { shortSide, longSide } = resolveSheetPaper(
    options.paperSize,
    options.customWidthPt,
    options.customHeightPt,
  );
  const { cols, rows, sheetW, sheetH } = resolveGridAndSheet(options, dominantLandscape, shortSide, longSide);

  const margin = Math.max(0, Number.isFinite(options.margin) ? options.margin! : 18);
  const gutter = Math.max(0, Number.isFinite(options.gutter) ? options.gutter! : 12);
  const readingOrder: NupReadingOrder = options.readingOrder ?? 'lr-tb';
  const drawBorder = options.drawBorder ?? false;

  const availW = Math.max(1, sheetW - margin * 2 - gutter * (cols - 1));
  const availH = Math.max(1, sheetH - margin * 2 - gutter * (rows - 1));
  const cellW = availW / cols;
  const cellH = availH / rows;
  const capacity = cols * rows;

  for (let start = 0; start < indices.length; start += capacity) {
    const sheet = outDoc.addPage([sheetW, sheetH]);
    const end = Math.min(indices.length, start + capacity);
    for (let slot = 0; slot < end - start; slot++) {
      const tile = embeddedCache.get(indices[start + slot])!;
      const { col, rowFromTop } = slotToColRow(slot, cols, rows, readingOrder);
      const cellX = margin + col * (cellW + gutter);
      const cellY = sheetH - margin - (rowFromTop + 1) * cellH - rowFromTop * gutter;
      drawFittedTile(sheet, tile, cellX, cellY, cellW, cellH, drawBorder);
    }
  }

  return outDoc.save({
    useObjectStreams: true,
    addDefaultPage: false,
    updateFieldAppearances: false,
  });
}

/**
 * Computes saddle-stitch booklet page pairs `[leftPage1Based | null, rightPage1Based | null]`
 * for every sheet side (front, back, front, back, ...), padding automatically to a multiple of 4.
 *
 * Example (`pageCount = 4`, LTR): `[[4, 1], [2, 3]]`
 * Example (`pageCount = 6`, LTR): `[[null, 1], [2, null], [6, 3], [4, 5]]`
 */
export function computeBookletOrder(
  pageCount: number,
  binding: 'left' | 'right' = 'left',
): Array<[number | null, number | null]> {
  if (!Number.isFinite(pageCount) || pageCount <= 0) return [];
  const count = Math.floor(pageCount);
  const total = Math.ceil(count / 4) * 4;
  const sheetCount = total / 4;
  const toPage = (p: number): number | null => (p >= 1 && p <= count ? p : null);

  const sides: Array<[number | null, number | null]> = [];
  for (let s = 0; s < sheetCount; s++) {
    const frontLeft = toPage(total - 2 * s);
    const frontRight = toPage(1 + 2 * s);
    const backLeft = toPage(2 + 2 * s);
    const backRight = toPage(total - 1 - 2 * s);

    if (binding === 'right') {
      sides.push([frontRight, frontLeft]);
      sides.push([backRight, backLeft]);
    } else {
      sides.push([frontLeft, frontRight]);
      sides.push([backLeft, backRight]);
    }
  }
  return sides;
}

/**
 * Imposes source pages as a saddle-stitch booklet (2 pages per landscape sheet side).
 */
export async function bookletPdf(
  bytes: Uint8Array,
  options: BookletOptions = {},
  password?: string,
): Promise<Uint8Array> {
  const srcDoc = await PDFDocument.load(bytes, { updateMetadata: false, password });
  const outDoc = await PDFDocument.create();
  const srcPages = srcDoc.getPages();
  const pageCount = srcPages.length;

  const indices = options.pageRange && options.pageRange.trim()
    ? parsePageRanges(options.pageRange, pageCount)
    : srcPages.map((_, i) => i);

  if (indices.length === 0) {
    return outDoc.save({ useObjectStreams: true, addDefaultPage: false, updateFieldAppearances: false });
  }

  // Embed each selected source page once (index 1..indices.length -> embedded tile).
  const tiles: UprightEmbeddedSource[] = [];
  const cache = new Map<number, UprightEmbeddedSource>();
  for (const idx of indices) {
    let tile = cache.get(idx);
    if (!tile) {
      tile = await embedPageUpright(outDoc, srcPages[idx]);
      cache.set(idx, tile);
    }
    tiles.push(tile);
  }

  const binding = options.binding ?? 'left';
  const duplexEdge = options.duplexEdge ?? 'short-edge';
  const { shortSide, longSide } = resolveSheetPaper(
    options.paperSize,
    options.customWidthPt,
    options.customHeightPt,
  );
  const sheetW = longSide;
  const sheetH = shortSide;

  const margin = Math.max(0, Number.isFinite(options.margin) ? options.margin! : 18);
  const gutter = Math.max(0, Number.isFinite(options.gutter) ? options.gutter! : 12);
  const drawFoldMark = options.drawFoldMark ?? true;
  const drawBorder = options.drawBorder ?? false;

  const cellW = Math.max(1, (sheetW - margin * 2 - gutter) / 2);
  const cellH = Math.max(1, sheetH - margin * 2);
  const leftCellX = margin;
  const rightCellX = margin + cellW + gutter;
  const cellY = margin;

  const order = computeBookletOrder(tiles.length, binding);

  for (let sideIdx = 0; sideIdx < order.length; sideIdx++) {
    const [leftNum, rightNum] = order[sideIdx];
    const sheet = outDoc.addPage([sheetW, sheetH]);
    const isBackSide = sideIdx % 2 === 1;
    const flip180 = isBackSide && duplexEdge === 'long-edge';

    if (flip180) {
      sheet.pushOperators(
        pushGraphicsState(),
        concatTransformationMatrix(-1, 0, 0, -1, sheetW, sheetH),
      );
    }

    if (leftNum !== null) {
      drawFittedTile(sheet, tiles[leftNum - 1], leftCellX, cellY, cellW, cellH, drawBorder);
    }
    if (rightNum !== null) {
      drawFittedTile(sheet, tiles[rightNum - 1], rightCellX, cellY, cellW, cellH, drawBorder);
    }

    if (drawFoldMark) {
      const cx = sheetW / 2;
      const tickLen = Math.min(12, Math.max(5, margin > 4 ? margin - 4 : 8));
      const tickColor = rgb(0.65, 0.65, 0.65);
      sheet.drawLine({
        start: { x: cx, y: 2 },
        end: { x: cx, y: 2 + tickLen },
        thickness: 0.5,
        color: tickColor,
      });
      sheet.drawLine({
        start: { x: cx, y: sheetH - 2 - tickLen },
        end: { x: cx, y: sheetH - 2 },
        thickness: 0.5,
        color: tickColor,
      });
    }

    if (flip180) {
      sheet.pushOperators(popGraphicsState());
    }
  }

  return outDoc.save({
    useObjectStreams: true,
    addDefaultPage: false,
    updateFieldAppearances: false,
  });
}
