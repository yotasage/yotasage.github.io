// Framework-free lossless PDF editing engine built on @cantoo/pdf-lib.
// Supports text (with word wrap and optional background/whiteout fill), Multiply-blended highlights,
// rectangles, ellipses, lines, arrows, freehand ink paths, and deduplicated PNG/JPEG images.
// Accurately maps normalized visual top-left coordinates (0..1) through /CropBox (fallback /MediaBox)
// and /Rotate (0/90/180/270) while preserving all existing page content losslessly.
import {
  appendBezierCurve,
  closePath,
  concatTransformationMatrix,
  degrees,
  drawImage,
  drawText,
  fill,
  fillAndStroke,
  LineCapStyle,
  LineJoinStyle,
  lineTo,
  moveTo,
  PDFArray,
  PDFContext,
  PDFDocument,
  PDFFont,
  PDFImage,
  PDFName,
  PDFOperator,
  PDFPage,
  PDFRef,
  PDFStream,
  popGraphicsState,
  pushGraphicsState,
  rectangle,
  rgb,
  setFillingRgbColor,
  setGraphicsState,
  setLineCap,
  setLineJoin,
  setLineWidth,
  setStrokingRgbColor,
  StandardFonts,
  stroke,
} from '@cantoo/pdf-lib';

import { N, removeUnusedObjects } from './objects';

export type PdfEditFont =
  | 'helvetica'
  | 'helvetica-bold'
  | 'times'
  | 'times-bold'
  | 'courier';

export interface PdfEditTextItem {
  id: string;
  pageIndex: number;
  kind: 'text';
  left: number;
  top: number;
  width: number;
  height: number;
  text: string;
  font: PdfEditFont;
  fontSize: number;
  color: string;
  backgroundColor?: string | null;
  opacity?: number;
}

export interface PdfEditHighlightItem {
  id: string;
  pageIndex: number;
  kind: 'highlight';
  left: number;
  top: number;
  width: number;
  height: number;
  color: string;
  opacity?: number;
}

export interface PdfEditRectItem {
  id: string;
  pageIndex: number;
  kind: 'rect';
  left: number;
  top: number;
  width: number;
  height: number;
  strokeColor: string;
  strokeWidth: number;
  fillColor?: string | null;
  opacity?: number;
}

export interface PdfEditEllipseItem {
  id: string;
  pageIndex: number;
  kind: 'ellipse';
  left: number;
  top: number;
  width: number;
  height: number;
  strokeColor: string;
  strokeWidth: number;
  fillColor?: string | null;
  opacity?: number;
}

export interface PdfEditLineItem {
  id: string;
  pageIndex: number;
  kind: 'line';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  strokeColor: string;
  strokeWidth: number;
  opacity?: number;
}

export interface PdfEditArrowItem {
  id: string;
  pageIndex: number;
  kind: 'arrow';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  strokeColor: string;
  strokeWidth: number;
  opacity?: number;
}

export interface PdfEditInkItem {
  id: string;
  pageIndex: number;
  kind: 'ink';
  points: Array<{ x: number; y: number }>;
  strokeColor: string;
  strokeWidth: number;
  opacity?: number;
}

export interface PdfEditImageItem {
  id: string;
  pageIndex: number;
  kind: 'image';
  assetId: string;
  imageBytes: Uint8Array;
  imageType: 'png' | 'jpeg';
  left: number;
  top: number;
  width: number;
  height: number;
  opacity?: number;
}

export type PdfEditItem =
  | PdfEditTextItem
  | PdfEditHighlightItem
  | PdfEditRectItem
  | PdfEditEllipseItem
  | PdfEditLineItem
  | PdfEditArrowItem
  | PdfEditInkItem
  | PdfEditImageItem;

export interface ApplyEditsResult {
  bytes: Uint8Array;
  appliedCount: number;
  pagesModified: number;
}

// 4 * (sqrt(2) - 1) / 3 for accurate 4-segment cubic Bezier circle/ellipse approximation.
const ELLIPSE_KAPPA = 0.5522847498307936;

const FONT_MAP: Record<PdfEditFont, StandardFonts> = {
  helvetica: StandardFonts.Helvetica,
  'helvetica-bold': StandardFonts.HelveticaBold,
  times: StandardFonts.TimesRoman,
  'times-bold': StandardFonts.TimesRomanBold,
  courier: StandardFonts.Courier,
};

function clamp(v: number, lo: number, hi: number): number {
  if (!Number.isFinite(v)) return lo;
  return Math.max(lo, Math.min(hi, v));
}

function parseHexRgb(hex: string | undefined | null, fallback = '#111827'): [number, number, number] {
  const raw = (hex ?? fallback).trim().replace(/^#/, '');
  let full = raw;
  if (/^[0-9a-fA-F]{3}$/.test(raw)) {
    full = raw[0] + raw[0] + raw[1] + raw[1] + raw[2] + raw[2];
  }
  if (!/^[0-9a-fA-F]{6}$/.test(full)) {
    if (hex !== fallback) return parseHexRgb(fallback, '#111827');
    return [17 / 255, 24 / 255, 39 / 255];
  }
  return [
    parseInt(full.slice(0, 2), 16) / 255,
    parseInt(full.slice(2, 4), 16) / 255,
    parseInt(full.slice(4, 6), 16) / 255,
  ];
}

function getPageVisibleBox(page: PDFPage): [number, number, number, number] {
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
 * Returns the visual upright dimensions (visW, visH) and the affine matrix mapping upright visual
 * bottom-left coordinates (u, v) into raw PDF page user space, honoring /CropBox and /Rotate.
 */
function uprightPageTransform(page: PDFPage): {
  visW: number;
  visH: number;
  matrix: [number, number, number, number, number, number];
} {
  const [vx0, vy0, vx1, vy1] = getPageVisibleBox(page);
  const rawW = vx1 - vx0;
  const rawH = vy1 - vy0;
  const rot = ((Math.round(page.getRotation().angle / 90) * 90) % 360 + 360) % 360;

  if (rot === 90) {
    return { visW: rawH, visH: rawW, matrix: [0, 1, -1, 0, vx1, vy0] };
  }
  if (rot === 180) {
    return { visW: rawW, visH: rawH, matrix: [-1, 0, 0, -1, vx1, vy1] };
  }
  if (rot === 270) {
    return { visW: rawH, visH: rawW, matrix: [0, -1, 1, 0, vx0, vy1] };
  }
  return { visW: rawW, visH: rawH, matrix: [1, 0, 0, 1, vx0, vy0] };
}

function getPageContentRefs(ctx: PDFContext, page: PDFPage): PDFRef[] {
  const raw = page.node.get(N('Contents'));
  if (!raw) return [];
  if (raw instanceof PDFRef) {
    const target = ctx.lookup(raw);
    if (target instanceof PDFArray) {
      return target.asArray().filter((x): x is PDFRef => x instanceof PDFRef);
    }
    if (target instanceof PDFStream) return [raw];
    return [];
  }
  if (raw instanceof PDFArray) {
    return raw.asArray().map((item) => (item instanceof PDFRef ? item : ctx.register(item)));
  }
  if (raw instanceof PDFStream) {
    return [ctx.register(raw)];
  }
  return [];
}

function sanitizeWinAnsi(text: string): string {
  return text.replace(/[^\x20-\x7e\xa0-\xff]/g, '?');
}

function encodeSafe(font: PDFFont, line: string): ReturnType<PDFFont['encodeText']> {
  try {
    return font.encodeText(line);
  } catch {
    return font.encodeText(sanitizeWinAnsi(line));
  }
}

function measureSafe(font: PDFFont, text: string, fontSize: number): number {
  try {
    return font.widthOfTextAtSize(text, fontSize);
  } catch {
    return font.widthOfTextAtSize(sanitizeWinAnsi(text), fontSize);
  }
}

function wrapTextLines(font: PDFFont, text: string, fontSize: number, maxWidth: number): string[] {
  const limit = Math.max(fontSize * 0.6, maxWidth);
  const paragraphs = text.split(/\r?\n/);
  const result: string[] = [];

  for (const para of paragraphs) {
    if (!para) {
      result.push('');
      continue;
    }
    if (measureSafe(font, para, fontSize) <= limit) {
      result.push(para);
      continue;
    }

    const words = para.split(/(\s+)/).filter((part) => part.length > 0);
    let current = '';

    const pushOverflowWord = (word: string) => {
      let chunk = '';
      for (const ch of word) {
        const next = chunk + ch;
        if (chunk && measureSafe(font, next, fontSize) > limit) {
          result.push(chunk);
          chunk = ch;
        } else {
          chunk = next;
        }
      }
      current = chunk;
    };

    for (const token of words) {
      const candidate = current ? current + token : token.trimStart();
      if (!candidate) continue;
      if (measureSafe(font, candidate, fontSize) <= limit) {
        current = candidate;
      } else if (current) {
        result.push(current.trimEnd());
        const trimmed = token.trimStart();
        if (!trimmed) {
          current = '';
        } else if (measureSafe(font, trimmed, fontSize) <= limit) {
          current = trimmed;
        } else {
          pushOverflowWord(trimmed);
        }
      } else {
        pushOverflowWord(token.trimStart());
      }
    }

    if (current) result.push(current.trimEnd());
  }

  return result;
}

/**
 * Computes the geometry of an arrow (shaft endpoint & filled triangle vertices) in upright coordinates.
 * Shared with the SVG editor overlay so on-screen arrows match the exported PDF exactly.
 */
export function computeArrowGeometry(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  strokeWidth: number,
): {
  shaftEndX: number;
  shaftEndY: number;
  headTip: [number, number];
  headLeft: [number, number];
  headRight: [number, number];
} | null {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (len < 0.5) return null;

  const ux = dx / len;
  const uy = dy / len;
  const px = -uy;
  const py = ux;

  const headLen = Math.min(len * 0.65, Math.max(8, strokeWidth * 4.2));
  const headHalfW = headLen * 0.42;

  const baseX = x2 - ux * headLen;
  const baseY = y2 - uy * headLen;

  return {
    shaftEndX: x2 - ux * headLen * 0.72,
    shaftEndY: y2 - uy * headLen * 0.72,
    headTip: [x2, y2],
    headLeft: [baseX + px * headHalfW, baseY + py * headHalfW],
    headRight: [baseX - px * headHalfW, baseY - py * headHalfW],
  };
}

/**
 * Losslessly applies text, highlight, shape, arrow, ink, and image edits onto PDF pages.
 * Honors each page's `/CropBox` (fallback `/MediaBox`) and `/Rotate`, deduplicates repeated image
 * assets by `assetId`, wraps added operators in `q ... Q`, and cleans unused objects if decrypted.
 */
export async function applyEditsToPdf(
  bytes: Uint8Array,
  items: PdfEditItem[],
  password?: string,
): Promise<ApplyEditsResult> {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false, password });
  const ctx = doc.context;
  const pages = doc.getPages();
  const wasEncrypted = Boolean(
    ctx.trailerInfo.Encrypt ||
      ctx.security ||
      (ctx as { isDecrypted?: boolean }).isDecrypted,
  );

  // Group valid items by page index while preserving stacking order.
  const byPage = new Map<number, PdfEditItem[]>();
  for (const item of items) {
    if (!Number.isInteger(item.pageIndex) || item.pageIndex < 0 || item.pageIndex >= pages.length) {
      continue;
    }
    if (item.kind === 'image' && (!item.imageBytes || item.imageBytes.length === 0)) continue;
    if (item.kind === 'text' && !item.text.trim() && !item.backgroundColor) continue;
    if (item.kind === 'ink' && (!item.points || item.points.length === 0)) continue;

    const list = byPage.get(item.pageIndex);
    if (list) list.push(item);
    else byPage.set(item.pageIndex, [item]);
  }

  // Document-level caches for deduplicated images and standard fonts.
  const imageCache = new Map<string, PDFImage>();
  const fontCache = new Map<PdfEditFont, PDFFont>();

  async function getEmbeddedImage(item: PdfEditImageItem): Promise<PDFImage> {
    const key = item.assetId || item.id;
    const existing = imageCache.get(key);
    if (existing) return existing;
    const embedded =
      item.imageType === 'png'
        ? await doc.embedPng(item.imageBytes)
        : await doc.embedJpg(item.imageBytes);
    imageCache.set(key, embedded);
    return embedded;
  }

  async function getEmbeddedFont(choice: PdfEditFont): Promise<PDFFont> {
    const existing = fontCache.get(choice);
    if (existing) return existing;
    const embedded = await doc.embedFont(FONT_MAP[choice] ?? StandardFonts.Helvetica);
    fontCache.set(choice, embedded);
    return embedded;
  }

  let appliedCount = 0;
  let pagesModified = 0;

  for (const [pageIndex, pageItems] of byPage.entries()) {
    const page = pages[pageIndex];
    const { visW, visH, matrix } = uprightPageTransform(page);
    if (visW <= 0 || visH <= 0) continue;

    const pageImgKeys = new Map<string, PDFName>();
    const pageFontKeys = new Map<PdfEditFont, PDFName>();
    const pageGsKeys = new Map<string, PDFName>();

    const getExtGStateKey = (opacity: number, blendMode?: 'Multiply'): PDFName | undefined => {
      if (!blendMode && opacity >= 0.999) return undefined;
      const key = `${blendMode ?? 'Normal'}:${opacity.toFixed(3)}`;
      const existing = pageGsKeys.get(key);
      if (existing) return existing;
      const gsDict = blendMode
        ? ctx.obj({ Type: 'ExtGState', ca: opacity, CA: opacity, BM: PDFName.of(blendMode) })
        : ctx.obj({ Type: 'ExtGState', ca: opacity, CA: opacity });
      const created = page.node.newExtGState('EditGS', gsDict);
      pageGsKeys.set(key, created);
      return created;
    };

    const ops: PDFOperator[] = [
      pushGraphicsState(),
      concatTransformationMatrix(matrix[0], matrix[1], matrix[2], matrix[3], matrix[4], matrix[5]),
    ];

    let pageApplied = 0;

    for (const item of pageItems) {
      const opacity = clamp(item.opacity ?? (item.kind === 'highlight' ? 0.38 : 1), 0.02, 1);

      if (item.kind === 'text') {
        const normW = clamp(item.width, 0.004, 1);
        const normH = clamp(item.height, 0.004, 1);
        const normLeft = clamp(item.left, 0, Math.max(0, 1 - normW));
        const normTop = clamp(item.top, 0, Math.max(0, 1 - normH));
        const u = normLeft * visW;
        const w = normW * visW;
        const h = normH * visH;
        const vTop = (1 - normTop) * visH;
        const vBottom = vTop - h;
        const gsKey = getExtGStateKey(opacity);

        ops.push(pushGraphicsState());
        if (gsKey) ops.push(setGraphicsState(gsKey));

        if (item.backgroundColor) {
          const [br, bg, bb] = parseHexRgb(item.backgroundColor, '#ffffff');
          ops.push(setFillingRgbColor(br, bg, bb), rectangle(u, vBottom, w, h), fill());
        }

        if (item.text.trim()) {
          const fontChoice: PdfEditFont = item.font ?? 'helvetica';
          const font = await getEmbeddedFont(fontChoice);
          let fontKey = pageFontKeys.get(fontChoice);
          if (!fontKey) {
            fontKey = page.node.newFontDictionary('EditFont', font.ref);
            pageFontKeys.set(fontChoice, fontKey);
          }

          const fontSize = clamp(item.fontSize || 14, 4, 240);
          const padX = Math.min(4, Math.max(1.5, fontSize * 0.2));
          const padY = Math.min(3, Math.max(1.5, fontSize * 0.15));
          const innerW = Math.max(fontSize * 0.8, w - padX * 2);
          const lines = wrapTextLines(font, item.text, fontSize, innerW);
          const [tr, tg, tb] = parseHexRgb(item.color, '#111827');
          const textColor = rgb(tr, tg, tb);
          const capHeight = font.heightAtSize(fontSize, { descender: false });
          const lineHeight = fontSize * 1.24;

          for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
            const rawLine = lines[lineIdx];
            if (!rawLine) continue;
            const baselineY = vTop - padY - capHeight - lineIdx * lineHeight;
            ops.push(
              ...drawText(encodeSafe(font, rawLine), {
                color: textColor,
                font: fontKey,
                size: fontSize,
                rotate: degrees(0),
                xSkew: degrees(0),
                ySkew: degrees(0),
                x: u + padX,
                y: baselineY,
              }),
            );
          }
        }

        ops.push(popGraphicsState());
        pageApplied += 1;
        continue;
      }

      if (item.kind === 'highlight') {
        const normW = clamp(item.width, 0.002, 1);
        const normH = clamp(item.height, 0.002, 1);
        const normLeft = clamp(item.left, 0, Math.max(0, 1 - normW));
        const normTop = clamp(item.top, 0, Math.max(0, 1 - normH));
        const u = normLeft * visW;
        const w = normW * visW;
        const h = normH * visH;
        const vBottom = (1 - normTop) * visH - h;
        const [r, g, b] = parseHexRgb(item.color, '#fde047');
        const gsKey = getExtGStateKey(opacity, 'Multiply');

        ops.push(pushGraphicsState());
        if (gsKey) ops.push(setGraphicsState(gsKey));
        ops.push(setFillingRgbColor(r, g, b), rectangle(u, vBottom, w, h), fill(), popGraphicsState());
        pageApplied += 1;
        continue;
      }

      if (item.kind === 'rect') {
        const sw = clamp(item.strokeWidth, 0, 72);
        const hasStroke = sw > 0;
        const hasFill = Boolean(item.fillColor);
        if (!hasStroke && !hasFill) continue;

        const normW = clamp(item.width, 0.002, 1);
        const normH = clamp(item.height, 0.002, 1);
        const normLeft = clamp(item.left, 0, Math.max(0, 1 - normW));
        const normTop = clamp(item.top, 0, Math.max(0, 1 - normH));
        const u = normLeft * visW;
        const w = normW * visW;
        const h = normH * visH;
        const vBottom = (1 - normTop) * visH - h;
        const gsKey = getExtGStateKey(opacity);

        ops.push(pushGraphicsState());
        if (gsKey) ops.push(setGraphicsState(gsKey));
        if (hasFill) {
          const [fr, fg, fb] = parseHexRgb(item.fillColor, '#ffffff');
          ops.push(setFillingRgbColor(fr, fg, fb));
        }
        if (hasStroke) {
          const [sr, sg, sb] = parseHexRgb(item.strokeColor, '#dc2626');
          ops.push(setStrokingRgbColor(sr, sg, sb), setLineWidth(sw), setLineJoin(LineJoinStyle.Miter));
        }
        ops.push(rectangle(u, vBottom, w, h));
        if (hasFill && hasStroke) ops.push(fillAndStroke());
        else if (hasFill) ops.push(fill());
        else ops.push(stroke());
        ops.push(popGraphicsState());
        pageApplied += 1;
        continue;
      }

      if (item.kind === 'ellipse') {
        const sw = clamp(item.strokeWidth, 0, 72);
        const hasStroke = sw > 0;
        const hasFill = Boolean(item.fillColor);
        if (!hasStroke && !hasFill) continue;

        const normW = clamp(item.width, 0.002, 1);
        const normH = clamp(item.height, 0.002, 1);
        const normLeft = clamp(item.left, 0, Math.max(0, 1 - normW));
        const normTop = clamp(item.top, 0, Math.max(0, 1 - normH));
        const u = normLeft * visW;
        const w = normW * visW;
        const h = normH * visH;
        const vBottom = (1 - normTop) * visH - h;
        const cx = u + w / 2;
        const cy = vBottom + h / 2;
        const rx = w / 2;
        const ry = h / 2;
        const kx = rx * ELLIPSE_KAPPA;
        const ky = ry * ELLIPSE_KAPPA;
        const gsKey = getExtGStateKey(opacity);

        ops.push(pushGraphicsState());
        if (gsKey) ops.push(setGraphicsState(gsKey));
        if (hasFill) {
          const [fr, fg, fb] = parseHexRgb(item.fillColor, '#ffffff');
          ops.push(setFillingRgbColor(fr, fg, fb));
        }
        if (hasStroke) {
          const [sr, sg, sb] = parseHexRgb(item.strokeColor, '#2563eb');
          ops.push(setStrokingRgbColor(sr, sg, sb), setLineWidth(sw));
        }
        ops.push(
          moveTo(cx + rx, cy),
          appendBezierCurve(cx + rx, cy + ky, cx + kx, cy + ry, cx, cy + ry),
          appendBezierCurve(cx - kx, cy + ry, cx - rx, cy + ky, cx - rx, cy),
          appendBezierCurve(cx - rx, cy - ky, cx - kx, cy - ry, cx, cy - ry),
          appendBezierCurve(cx + kx, cy - ry, cx + rx, cy - ky, cx + rx, cy),
          closePath(),
        );
        if (hasFill && hasStroke) ops.push(fillAndStroke());
        else if (hasFill) ops.push(fill());
        else ops.push(stroke());
        ops.push(popGraphicsState());
        pageApplied += 1;
        continue;
      }

      if (item.kind === 'line') {
        const sw = clamp(item.strokeWidth, 0.5, 72);
        const u1 = clamp(item.x1, 0, 1) * visW;
        const v1 = (1 - clamp(item.y1, 0, 1)) * visH;
        const u2 = clamp(item.x2, 0, 1) * visW;
        const v2 = (1 - clamp(item.y2, 0, 1)) * visH;
        if (Math.hypot(u2 - u1, v2 - v1) < 0.25) continue;

        const [sr, sg, sb] = parseHexRgb(item.strokeColor, '#dc2626');
        const gsKey = getExtGStateKey(opacity);

        ops.push(pushGraphicsState());
        if (gsKey) ops.push(setGraphicsState(gsKey));
        ops.push(
          setStrokingRgbColor(sr, sg, sb),
          setLineWidth(sw),
          setLineCap(LineCapStyle.Round),
          moveTo(u1, v1),
          lineTo(u2, v2),
          stroke(),
          popGraphicsState(),
        );
        pageApplied += 1;
        continue;
      }

      if (item.kind === 'arrow') {
        const sw = clamp(item.strokeWidth, 0.5, 72);
        const u1 = clamp(item.x1, 0, 1) * visW;
        const v1 = (1 - clamp(item.y1, 0, 1)) * visH;
        const u2 = clamp(item.x2, 0, 1) * visW;
        const v2 = (1 - clamp(item.y2, 0, 1)) * visH;
        const geom = computeArrowGeometry(u1, v1, u2, v2, sw);
        if (!geom) continue;

        const [sr, sg, sb] = parseHexRgb(item.strokeColor, '#dc2626');
        const gsKey = getExtGStateKey(opacity);

        ops.push(pushGraphicsState());
        if (gsKey) ops.push(setGraphicsState(gsKey));
        ops.push(
          setStrokingRgbColor(sr, sg, sb),
          setFillingRgbColor(sr, sg, sb),
          setLineWidth(sw),
          setLineCap(LineCapStyle.Round),
          moveTo(u1, v1),
          lineTo(geom.shaftEndX, geom.shaftEndY),
          stroke(),
          moveTo(geom.headTip[0], geom.headTip[1]),
          lineTo(geom.headLeft[0], geom.headLeft[1]),
          lineTo(geom.headRight[0], geom.headRight[1]),
          closePath(),
          fill(),
          popGraphicsState(),
        );
        pageApplied += 1;
        continue;
      }

      if (item.kind === 'ink') {
        const sw = clamp(item.strokeWidth, 0.5, 72);
        const pts = item.points.map((pt) => ({
          u: clamp(pt.x, 0, 1) * visW,
          v: (1 - clamp(pt.y, 0, 1)) * visH,
        }));
        if (pts.length === 0) continue;

        const [sr, sg, sb] = parseHexRgb(item.strokeColor, '#111827');
        const gsKey = getExtGStateKey(opacity);

        ops.push(pushGraphicsState());
        if (gsKey) ops.push(setGraphicsState(gsKey));
        ops.push(
          setStrokingRgbColor(sr, sg, sb),
          setLineWidth(sw),
          setLineCap(LineCapStyle.Round),
          setLineJoin(LineJoinStyle.Round),
          moveTo(pts[0].u, pts[0].v),
        );
        if (pts.length === 1) {
          ops.push(lineTo(pts[0].u + 0.01, pts[0].v));
        } else {
          for (let i = 1; i < pts.length; i++) {
            ops.push(lineTo(pts[i].u, pts[i].v));
          }
        }
        ops.push(stroke(), popGraphicsState());
        pageApplied += 1;
        continue;
      }

      if (item.kind === 'image') {
        const normW = clamp(item.width, 0.002, 1);
        const normH = clamp(item.height, 0.002, 1);
        const normLeft = clamp(item.left, 0, Math.max(0, 1 - normW));
        const normTop = clamp(item.top, 0, Math.max(0, 1 - normH));
        const u = normLeft * visW;
        const w = normW * visW;
        const h = normH * visH;
        const vBottom = (1 - normTop) * visH - h;
        const gsKey = getExtGStateKey(opacity);

        const assetKey = item.assetId || item.id;
        const embeddedImg = await getEmbeddedImage(item);
        let imgKey = pageImgKeys.get(assetKey);
        if (!imgKey) {
          imgKey = page.node.newXObject('EditImg', embeddedImg.ref);
          pageImgKeys.set(assetKey, imgKey);
        }

        ops.push(pushGraphicsState());
        ops.push(
          ...drawImage(imgKey, {
            x: u,
            y: vBottom,
            width: w,
            height: h,
            rotate: degrees(0),
            xSkew: degrees(0),
            ySkew: degrees(0),
            graphicsState: gsKey,
          }),
        );
        ops.push(popGraphicsState());
        pageApplied += 1;
      }
    }

    ops.push(popGraphicsState());

    if (pageApplied > 0) {
      const editRef = ctx.register(ctx.contentStream(ops));
      const existingRefs = getPageContentRefs(ctx, page);
      if (existingRefs.length > 0) {
        page.node.set(
          N('Contents'),
          ctx.obj([
            ctx.getPushGraphicsStateContentStream(),
            ...existingRefs,
            ctx.getPopGraphicsStateContentStream(),
            editRef,
          ]),
        );
      } else {
        page.node.set(N('Contents'), ctx.obj([editRef]));
      }
      appliedCount += pageApplied;
      pagesModified += 1;
    }
  }

  if (wasEncrypted) {
    removeUnusedObjects(ctx);
  }

  const outBytes = await doc.save({
    useObjectStreams: true,
    addDefaultPage: false,
    updateFieldAppearances: false,
  });

  return { bytes: outBytes, appliedCount, pagesModified };
}
