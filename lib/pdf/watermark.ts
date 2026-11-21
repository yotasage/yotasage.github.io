// Stamp text or image (PNG/JPEG) watermarks onto PDF pages (single or tiled, over or under content),
// honoring /CropBox and /Rotate (0/90/180/270) so watermarks stay upright and properly positioned.
import {
  clip,
  concatTransformationMatrix,
  degrees,
  drawImage,
  drawText,
  endPath,
  PDFArray,
  PDFContext,
  PDFDocument,
  PDFFont,
  PDFImage,
  PDFOperator,
  PDFPage,
  PDFRef,
  PDFStream,
  popGraphicsState,
  pushGraphicsState,
  rectangle,
  rgb,
  StandardFonts,
} from '@cantoo/pdf-lib';

import { parsePageRanges } from './merge';
import { N } from './objects';

export type WatermarkFont =
  | 'helvetica'
  | 'helvetica-bold'
  | 'times'
  | 'times-bold'
  | 'courier'
  | 'courier-bold';

export type WatermarkPosition =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'middle-left'
  | 'center'
  | 'middle-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right';

export type WatermarkLayout = 'single' | 'tiled';
export type WatermarkLayer = 'over' | 'under';

export interface WatermarkBaseOptions {
  layout?: WatermarkLayout;
  /** Anchor position when layout is 'single'. Default 'center'. */
  position?: WatermarkPosition;
  /** Horizontal gap between tiles in points when layout is 'tiled'. Default 120. */
  tileGapX?: number;
  /** Vertical gap between tiles in points when layout is 'tiled'. Default 120. */
  tileGapY?: number;
  /** Margin from page edges for non-centered single placements in points. Default 36. */
  margin?: number;
  /** Counter-clockwise rotation angle in degrees (e.g. -45 or 45). Default -45. */
  rotation?: number;
  /** Opacity in 0.02..1. Default 0.25. */
  opacity?: number;
  /** Draw over existing page content ('over') or underneath it ('under'). Default 'over'. */
  layer?: WatermarkLayer;
  /** Optional 1-based page range string (e.g. '1-3, 5'). Empty = all pages. */
  pageRange?: string;
}

export interface TextWatermarkOptions extends WatermarkBaseOptions {
  kind: 'text';
  text: string;
  font?: WatermarkFont;
  fontSize?: number;
  /** Hex color string '#rrggbb' or '#rgb'. Default '#888888'. */
  color?: string;
}

export interface ImageWatermarkOptions extends WatermarkBaseOptions {
  kind: 'image';
  imageBytes: Uint8Array;
  imageType: 'png' | 'jpeg';
  /** Fraction of the visual page width (0.05..1.5). Default 0.4. */
  imageScale?: number;
}

export type WatermarkOptions = TextWatermarkOptions | ImageWatermarkOptions;

const FONT_MAP: Record<WatermarkFont, StandardFonts> = {
  helvetica: StandardFonts.Helvetica,
  'helvetica-bold': StandardFonts.HelveticaBold,
  times: StandardFonts.TimesRoman,
  'times-bold': StandardFonts.TimesRomanBold,
  courier: StandardFonts.Courier,
  'courier-bold': StandardFonts.CourierBold,
};

function parseHexColor(hex: string | undefined, fallback = '#888888') {
  const raw = (hex ?? fallback).trim().replace(/^#/, '');
  let full = raw;
  if (/^[0-9a-fA-F]{3}$/.test(raw)) {
    full = raw[0] + raw[0] + raw[1] + raw[1] + raw[2] + raw[2];
  }
  if (!/^[0-9a-fA-F]{6}$/.test(full)) {
    return parseHexColor(fallback, '#888888');
  }
  return rgb(
    parseInt(full.slice(0, 2), 16) / 255,
    parseInt(full.slice(2, 4), 16) / 255,
    parseInt(full.slice(4, 6), 16) / 255,
  );
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

function encodeSafe(font: PDFFont, line: string): { encoded: ReturnType<PDFFont['encodeText']>; clean: string } {
  try {
    return { encoded: font.encodeText(line), clean: line };
  } catch {
    const clean = line.replace(/[^\x20-\x7e\xa0-\xff]/g, '?');
    return { encoded: font.encodeText(clean), clean };
  }
}

function computeSingleCenter(
  position: WatermarkPosition,
  visW: number,
  visH: number,
  rotBoundW: number,
  rotBoundH: number,
  margin: number,
): [number, number] {
  let cx: number;
  if (position.endsWith('-left')) {
    cx = margin + rotBoundW / 2;
  } else if (position.endsWith('-right')) {
    cx = visW - margin - rotBoundW / 2;
  } else {
    cx = visW / 2;
  }

  let cy: number;
  if (position.startsWith('top-')) {
    cy = visH - margin - rotBoundH / 2;
  } else if (position.startsWith('bottom-')) {
    cy = margin + rotBoundH / 2;
  } else {
    cy = visH / 2;
  }

  return [cx, cy];
}

function computeCenters(
  layout: WatermarkLayout,
  position: WatermarkPosition,
  visW: number,
  visH: number,
  stampW: number,
  stampH: number,
  rotDeg: number,
  margin: number,
  tileGapX: number,
  tileGapY: number,
): Array<[number, number]> {
  const rad = (rotDeg * Math.PI) / 180;
  const c = Math.abs(Math.cos(rad));
  const s = Math.abs(Math.sin(rad));
  const rotBoundW = stampW * c + stampH * s;
  const rotBoundH = stampW * s + stampH * c;

  if (layout === 'single') {
    return [computeSingleCenter(position, visW, visH, rotBoundW, rotBoundH, margin)];
  }

  const stepX = Math.max(24, rotBoundW + Math.max(0, tileGapX));
  const stepY = Math.max(24, rotBoundH + Math.max(0, tileGapY));

  const centers: Array<[number, number]> = [];
  const startX = (visW % stepX) / 2;
  const startY = (visH % stepY) / 2;

  for (let row = -1; startY + row * stepY <= visH + stepY; row++) {
    const cy = startY + row * stepY;
    const stagger = Math.abs(row) % 2 === 1 ? stepX / 2 : 0;
    for (let col = -1; startX + col * stepX - stagger <= visW + stepX; col++) {
      const cx = startX + col * stepX + stagger;
      if (cx + rotBoundW / 2 < 0 || cx - rotBoundW / 2 > visW) continue;
      if (cy + rotBoundH / 2 < 0 || cy - rotBoundH / 2 > visH) continue;
      centers.push([cx, cy]);
    }
  }

  if (centers.length === 0) {
    centers.push([visW / 2, visH / 2]);
  }
  return centers;
}

/**
 * Adds a text or image watermark to selected pages of a PDF, supporting single/tiled layouts and over/under layers.
 */
export async function addWatermark(
  bytes: Uint8Array,
  options: WatermarkOptions,
  password?: string,
): Promise<Uint8Array> {
  if (options.kind === 'text' && !options.text.trim()) {
    throw new Error('Watermark text cannot be empty.');
  }
  if (options.kind === 'image' && (!options.imageBytes || options.imageBytes.length === 0)) {
    throw new Error('Watermark image bytes are required.');
  }

  const doc = await PDFDocument.load(bytes, { updateMetadata: false, password });
  const ctx = doc.context;
  const pages = doc.getPages();

  const layout: WatermarkLayout = options.layout ?? 'single';
  const position: WatermarkPosition = options.position ?? 'center';
  const tileGapX = options.tileGapX ?? 120;
  const tileGapY = options.tileGapY ?? 120;
  const margin = Math.max(0, options.margin ?? 36);
  const rotation = Number.isFinite(options.rotation) ? options.rotation! : -45;
  const opacity = Math.max(0.02, Math.min(1, options.opacity ?? 0.25));
  const layer: WatermarkLayer = options.layer ?? 'over';

  let targetIndices: number[];
  if (options.pageRange && options.pageRange.trim()) {
    const seen = new Set<number>();
    targetIndices = [];
    for (const idx of parsePageRanges(options.pageRange, pages.length)) {
      if (!seen.has(idx)) {
        seen.add(idx);
        targetIndices.push(idx);
      }
    }
  } else {
    targetIndices = pages.map((_, idx) => idx);
  }

  if (targetIndices.length === 0) {
    return doc.save({
      useObjectStreams: true,
      addDefaultPage: false,
      updateFieldAppearances: false,
    });
  }

  let embeddedFont: PDFFont | null = null;
  let embeddedImage: PDFImage | null = null;
  let preparedLines: Array<{ encoded: ReturnType<PDFFont['encodeText']>; width: number }> = [];
  let textBlockW = 0;
  let textBlockH = 0;
  let fontSize = 48;
  let lineHeight = 60;
  let capHeight = 34;
  const textColor = options.kind === 'text' ? parseHexColor(options.color, '#888888') : rgb(0.5, 0.5, 0.5);

  if (options.kind === 'text') {
    fontSize = Math.max(6, Math.min(300, options.fontSize ?? 48));
    lineHeight = fontSize * 1.25;
    const fontChoice: WatermarkFont = options.font ?? 'helvetica-bold';
    embeddedFont = await doc.embedFont(FONT_MAP[fontChoice] ?? StandardFonts.HelveticaBold);
    capHeight = embeddedFont.heightAtSize(fontSize, { descender: false });
    const rawLines = options.text.split(/\r?\n/);
    preparedLines = rawLines.map((line) => {
      const { encoded, clean } = encodeSafe(embeddedFont!, line);
      return { encoded, width: embeddedFont!.widthOfTextAtSize(clean, fontSize) };
    });
    textBlockW = Math.max(1, ...preparedLines.map((l) => l.width));
    textBlockH = preparedLines.length === 1 ? capHeight : (preparedLines.length - 1) * lineHeight + capHeight;
  } else {
    embeddedImage =
      options.imageType === 'png'
        ? await doc.embedPng(options.imageBytes)
        : await doc.embedJpg(options.imageBytes);
  }

  const rad = (rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  for (const pageIndex of targetIndices) {
    const page = pages[pageIndex];
    const { visW, visH, matrix } = uprightPageTransform(page);

    let stampW: number;
    let stampH: number;
    if (options.kind === 'text') {
      stampW = textBlockW;
      stampH = textBlockH;
    } else {
      const scaleFrac = Math.max(0.05, Math.min(1.5, options.imageScale ?? 0.4));
      const imgSize = embeddedImage!.size();
      const aspect = imgSize.width > 0 ? imgSize.height / imgSize.width : 1;
      stampW = Math.max(4, visW * scaleFrac);
      stampH = Math.max(4, stampW * aspect);
    }

    const centers = computeCenters(
      layout,
      position,
      visW,
      visH,
      stampW,
      stampH,
      rotation,
      margin,
      tileGapX,
      tileGapY,
    );

    const gsDict = ctx.obj({ Type: 'ExtGState', ca: opacity, CA: opacity });
    const gsKey = page.node.newExtGState('WmGS', gsDict);
    const fontKey = embeddedFont ? page.node.newFontDictionary('WmFont', embeddedFont.ref) : undefined;
    const imgKey = embeddedImage ? page.node.newXObject('WmImg', embeddedImage.ref) : undefined;

    const ops: PDFOperator[] = [
      pushGraphicsState(),
      concatTransformationMatrix(matrix[0], matrix[1], matrix[2], matrix[3], matrix[4], matrix[5]),
      // Clip to visible page box so tiled watermarks never bleed outside /CropBox.
      rectangle(0, 0, visW, visH),
      clip(),
      endPath(),
    ];

    for (const [cx, cy] of centers) {
      ops.push(
        pushGraphicsState(),
        concatTransformationMatrix(cos, sin, -sin, cos, cx, cy),
      );

      if (options.kind === 'text' && fontKey) {
        for (let lineIdx = 0; lineIdx < preparedLines.length; lineIdx++) {
          const line = preparedLines[lineIdx];
          const lx = -line.width / 2;
          // Top line starts at +textBlockH/2 - capHeight, stepping downward by lineHeight.
          const ly = textBlockH / 2 - capHeight - lineIdx * lineHeight;
          ops.push(
            ...drawText(line.encoded, {
              color: textColor,
              font: fontKey,
              size: fontSize,
              rotate: degrees(0),
              xSkew: degrees(0),
              ySkew: degrees(0),
              x: lx,
              y: ly,
              graphicsState: gsKey,
            }),
          );
        }
      } else if (imgKey) {
        ops.push(
          ...drawImage(imgKey, {
            x: -stampW / 2,
            y: -stampH / 2,
            width: stampW,
            height: stampH,
            rotate: degrees(0),
            xSkew: degrees(0),
            ySkew: degrees(0),
            graphicsState: gsKey,
          }),
        );
      }

      ops.push(popGraphicsState());
    }

    ops.push(popGraphicsState());

    const wmRef = ctx.register(ctx.contentStream(ops));
    const existingRefs = getPageContentRefs(ctx, page);

    if (layer === 'under') {
      // Watermark stream is fully wrapped in q ... Q so prepending cannot disturb existing page state.
      page.node.set(N('Contents'), ctx.obj([wmRef, ...existingRefs]));
    } else if (existingRefs.length > 0) {
      page.node.set(
        N('Contents'),
        ctx.obj([
          ctx.getPushGraphicsStateContentStream(),
          ...existingRefs,
          ctx.getPopGraphicsStateContentStream(),
          wmRef,
        ]),
      );
    } else {
      page.node.set(N('Contents'), ctx.obj([wmRef]));
    }
  }

  return doc.save({
    useObjectStreams: true,
    addDefaultPage: false,
    updateFieldAppearances: false,
  });
}
