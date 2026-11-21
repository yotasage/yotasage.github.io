// Stamp page numbers onto PDF pages while respecting /CropBox and /Rotate (0/90/180/270).
import {
  concatTransformationMatrix,
  degrees,
  drawText,
  PDFArray,
  PDFContext,
  PDFDocument,
  PDFFont,
  PDFPage,
  PDFRef,
  PDFStream,
  popGraphicsState,
  pushGraphicsState,
  rgb,
  StandardFonts,
} from '@cantoo/pdf-lib';

import { parsePageRanges } from './merge';
import { N } from './objects';

export type PageNumberPosition =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right';

export type PageNumberFont =
  | 'helvetica'
  | 'helvetica-bold'
  | 'times'
  | 'times-bold'
  | 'courier'
  | 'courier-bold';

export interface PageNumberOptions {
  position?: PageNumberPosition;
  /** Template supporting {n}, {total}, {page}, {pages}. Default '{n}'. */
  format?: string;
  font?: PageNumberFont;
  fontSize?: number;
  /** Hex color string '#rrggbb' or '#rgb'. Default '#222222'. */
  color?: string;
  /** Opacity 0..1. Default 1. */
  opacity?: number;
  /** Horizontal margin in PDF points. Default 36. */
  marginX?: number;
  /** Vertical margin in PDF points. Default 28. */
  marginY?: number;
  /** Starting sequence number for {n}. Default 1. */
  startNumber?: number;
  /** Optional 1-based page range string (e.g. '2-10'). Empty = all pages. */
  pageRange?: string;
  /** Skip stamping the first physical page (page index 0). Default false. */
  skipFirstPage?: boolean;
  /** Swap left/right placement on even physical pages (2, 4, 6...) for duplex printing. Default false. */
  mirrorEvenPages?: boolean;
}

const FONT_MAP: Record<PageNumberFont, StandardFonts> = {
  helvetica: StandardFonts.Helvetica,
  'helvetica-bold': StandardFonts.HelveticaBold,
  times: StandardFonts.TimesRoman,
  'times-bold': StandardFonts.TimesRomanBold,
  courier: StandardFonts.Courier,
  'courier-bold': StandardFonts.CourierBold,
};

function parseHexColor(hex: string | undefined, fallback = '#222222') {
  const raw = (hex ?? fallback).trim().replace(/^#/, '');
  let full = raw;
  if (/^[0-9a-fA-F]{3}$/.test(raw)) {
    full = raw[0] + raw[0] + raw[1] + raw[1] + raw[2] + raw[2];
  }
  if (!/^[0-9a-fA-F]{6}$/.test(full)) {
    return parseHexColor(fallback, '#222222');
  }
  const r = parseInt(full.slice(0, 2), 16) / 255;
  const g = parseInt(full.slice(2, 4), 16) / 255;
  const b = parseInt(full.slice(4, 6), 16) / 255;
  return rgb(r, g, b);
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
 * bottom-left coordinates (u, v) into raw PDF page space, cancelling /Rotate and honoring /CropBox.
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

function mirrorPosition(pos: PageNumberPosition): PageNumberPosition {
  if (pos === 'top-left') return 'top-right';
  if (pos === 'top-right') return 'top-left';
  if (pos === 'bottom-left') return 'bottom-right';
  if (pos === 'bottom-right') return 'bottom-left';
  return pos;
}

function encodeSafe(font: PDFFont, text: string): { encoded: ReturnType<PDFFont['encodeText']>; clean: string } {
  try {
    return { encoded: font.encodeText(text), clean: text };
  } catch {
    const clean = text.replace(/[^\x20-\x7e\xa0-\xff]/g, '?');
    return { encoded: font.encodeText(clean), clean };
  }
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

/**
 * Stamps formatted page numbers onto selected pages, respecting /CropBox and /Rotate.
 */
export async function addPageNumbers(
  bytes: Uint8Array,
  options: PageNumberOptions = {},
  password?: string,
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false, password });
  const ctx = doc.context;
  const pages = doc.getPages();
  const totalDocPages = pages.length;

  const position: PageNumberPosition = options.position ?? 'bottom-center';
  const format = options.format?.length ? options.format : '{n}';
  const fontChoice: PageNumberFont = options.font ?? 'helvetica';
  const fontSize = Math.max(4, Math.min(144, options.fontSize ?? 11));
  const color = parseHexColor(options.color, '#222222');
  const opacity = Math.max(0, Math.min(1, options.opacity ?? 1));
  const marginX = Math.max(0, options.marginX ?? 36);
  const marginY = Math.max(0, options.marginY ?? 28);
  const startNumber = Number.isFinite(options.startNumber) ? Math.trunc(options.startNumber!) : 1;
  const skipFirstPage = options.skipFirstPage ?? false;
  const mirrorEvenPages = options.mirrorEvenPages ?? false;

  // Determine ordered unique target page indices.
  let targetIndices: number[];
  if (options.pageRange && options.pageRange.trim()) {
    const seen = new Set<number>();
    targetIndices = [];
    for (const idx of parsePageRanges(options.pageRange, totalDocPages)) {
      if (!seen.has(idx)) {
        seen.add(idx);
        targetIndices.push(idx);
      }
    }
  } else {
    targetIndices = pages.map((_, idx) => idx);
  }

  if (skipFirstPage) {
    targetIndices = targetIndices.filter((idx) => idx !== 0);
  }

  if (targetIndices.length === 0) {
    return doc.save({
      useObjectStreams: true,
      addDefaultPage: false,
      updateFieldAppearances: false,
    });
  }

  const font = await doc.embedFont(FONT_MAP[fontChoice] ?? StandardFonts.Helvetica);
  const totalNumbered = targetIndices.length;
  const capHeight = font.heightAtSize(fontSize, { descender: false });

  for (let seq = 0; seq < targetIndices.length; seq++) {
    const pageIndex = targetIndices[seq];
    const page = pages[pageIndex];
    const physicalPage = pageIndex + 1;
    const currentNum = startNumber + seq;

    const label = format
      .replace(/\{n\}/g, String(currentNum))
      .replace(/\{total\}/g, String(totalNumbered))
      .replace(/\{page\}/g, String(physicalPage))
      .replace(/\{pages\}/g, String(totalDocPages));

    const { encoded, clean } = encodeSafe(font, label);
    const textWidth = font.widthOfTextAtSize(clean, fontSize);

    const { visW, visH, matrix } = uprightPageTransform(page);
    const effectivePos = mirrorEvenPages && physicalPage % 2 === 0 ? mirrorPosition(position) : position;

    let u: number;
    if (effectivePos.endsWith('-left')) {
      u = marginX;
    } else if (effectivePos.endsWith('-right')) {
      u = visW - marginX - textWidth;
    } else {
      u = (visW - textWidth) / 2;
    }

    const v = effectivePos.startsWith('top-') ? visH - marginY - capHeight : marginY;

    const fontKey = page.node.newFontDictionary('PgNum', font.ref);
    let gsKey: ReturnType<typeof page.node.newExtGState> | undefined;
    if (opacity < 1) {
      const gsDict = ctx.obj({ Type: 'ExtGState', ca: opacity, CA: opacity });
      gsKey = page.node.newExtGState('GS', gsDict);
    }

    const ops = [
      pushGraphicsState(),
      concatTransformationMatrix(matrix[0], matrix[1], matrix[2], matrix[3], matrix[4], matrix[5]),
      ...drawText(encoded, {
        color,
        font: fontKey,
        size: fontSize,
        rotate: degrees(0),
        xSkew: degrees(0),
        ySkew: degrees(0),
        x: u,
        y: v,
        graphicsState: gsKey,
      }),
      popGraphicsState(),
    ];

    const stampRef = ctx.register(ctx.contentStream(ops));
    const existingRefs = getPageContentRefs(ctx, page);
    if (existingRefs.length > 0) {
      page.node.set(
        N('Contents'),
        ctx.obj([
          ctx.getPushGraphicsStateContentStream(),
          ...existingRefs,
          ctx.getPopGraphicsStateContentStream(),
          stampRef,
        ]),
      );
    } else {
      page.node.set(N('Contents'), ctx.obj([stampRef]));
    }
  }

  return doc.save({
    useObjectStreams: true,
    addDefaultPage: false,
    updateFieldAppearances: false,
  });
}
