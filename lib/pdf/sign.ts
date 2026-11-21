// Framework-free visual signature and text stamp embedding engine built on @cantoo/pdf-lib.
// Accurately maps visual top-left normalized rectangles (0..1) through /CropBox (fallback /MediaBox)
// and /Rotate (0/90/180/270) so signatures and text stamps render upright in exact visual positions.
import {
  concatTransformationMatrix,
  degrees,
  drawImage,
  drawText,
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
  rgb,
  StandardFonts,
} from '@cantoo/pdf-lib';

import { N, removeUnusedObjects } from './objects';

export type SignatureTextFont =
  | 'helvetica'
  | 'helvetica-bold'
  | 'times'
  | 'times-italic'
  | 'courier';

/**
 * Normalized image signature placement on a single page.
 * `left`, `top`, `width`, `height` are 0..1 fractions of the visually rotated /CropBox (fallback /MediaBox),
 * with origin at the visual top-left corner.
 */
export interface SignatureImagePlacement {
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

/**
 * Normalized text stamp placement (date, printed name, initials, title) on a single page.
 * `left`, `top`, `width`, `height` are 0..1 fractions of the visually rotated /CropBox (fallback /MediaBox),
 * with origin at the visual top-left corner.
 */
export interface SignatureTextPlacement {
  id: string;
  pageIndex: number;
  kind: 'text';
  text: string;
  font?: SignatureTextFont;
  fontSize?: number;
  color?: string;
  left: number;
  top: number;
  width: number;
  height: number;
  opacity?: number;
}

export type SignaturePlacement = SignatureImagePlacement | SignatureTextPlacement;

export interface ApplySignaturesResult {
  bytes: Uint8Array;
  placedCount: number;
  pagesModified: number;
}

const FONT_MAP: Record<SignatureTextFont, StandardFonts> = {
  helvetica: StandardFonts.Helvetica,
  'helvetica-bold': StandardFonts.HelveticaBold,
  times: StandardFonts.TimesRoman,
  'times-italic': StandardFonts.TimesRomanItalic,
  courier: StandardFonts.Courier,
};

function clamp(v: number, lo: number, hi: number): number {
  if (!Number.isFinite(v)) return lo;
  return Math.max(lo, Math.min(hi, v));
}

function parseHexColor(hex: string | undefined, fallback = '#111827') {
  const raw = (hex ?? fallback).trim().replace(/^#/, '');
  let full = raw;
  if (/^[0-9a-fA-F]{3}$/.test(raw)) {
    full = raw[0] + raw[0] + raw[1] + raw[1] + raw[2] + raw[2];
  }
  if (!/^[0-9a-fA-F]{6}$/.test(full)) {
    return parseHexColor(fallback, '#111827');
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

function encodeSafe(font: PDFFont, line: string): { encoded: ReturnType<PDFFont['encodeText']>; clean: string } {
  try {
    return { encoded: font.encodeText(line), clean: line };
  } catch {
    const clean = line.replace(/[^\x20-\x7e\xa0-\xff]/g, '?');
    return { encoded: font.encodeText(clean), clean };
  }
}

/**
 * Embeds visual signature images and text stamps onto PDF pages, deduplicating repeated image assets
 * by `assetId` and honoring each page's `/CropBox` and `/Rotate`.
 */
export async function applySignaturesToPdf(
  bytes: Uint8Array,
  placements: SignaturePlacement[],
  password?: string,
): Promise<ApplySignaturesResult> {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false, password });
  const ctx = doc.context;
  const pages = doc.getPages();
  const wasEncrypted = Boolean(
    ctx.trailerInfo.Encrypt ||
      ctx.security ||
      (ctx as { isDecrypted?: boolean }).isDecrypted,
  );

  // Group valid placements by page index while preserving stacking order.
  const byPage = new Map<number, SignaturePlacement[]>();
  for (const p of placements) {
    if (!Number.isInteger(p.pageIndex) || p.pageIndex < 0 || p.pageIndex >= pages.length) continue;
    if (p.kind === 'image' && (!p.imageBytes || p.imageBytes.length === 0)) continue;
    if (p.kind === 'text' && !p.text.trim()) continue;
    const list = byPage.get(p.pageIndex);
    if (list) list.push(p);
    else byPage.set(p.pageIndex, [p]);
  }

  // Document-level caches so repeated signatures and fonts are embedded only once in the output PDF.
  const imageCache = new Map<string, PDFImage>();
  const fontCache = new Map<SignatureTextFont, PDFFont>();

  async function getEmbeddedImage(p: SignatureImagePlacement): Promise<PDFImage> {
    const key = p.assetId || p.id;
    const existing = imageCache.get(key);
    if (existing) return existing;
    const embedded =
      p.imageType === 'png'
        ? await doc.embedPng(p.imageBytes)
        : await doc.embedJpg(p.imageBytes);
    imageCache.set(key, embedded);
    return embedded;
  }

  async function getEmbeddedFont(choice: SignatureTextFont): Promise<PDFFont> {
    const existing = fontCache.get(choice);
    if (existing) return existing;
    const embedded = await doc.embedFont(FONT_MAP[choice] ?? StandardFonts.Helvetica);
    fontCache.set(choice, embedded);
    return embedded;
  }

  let placedCount = 0;
  let pagesModified = 0;

  for (const [pageIndex, pagePlacements] of byPage.entries()) {
    const page = pages[pageIndex];
    const { visW, visH, matrix } = uprightPageTransform(page);
    if (visW <= 0 || visH <= 0) continue;

    // Per-page resource deduplication (XObject / Font / ExtGState names).
    const pageImgKeys = new Map<string, PDFName>();
    const pageFontKeys = new Map<SignatureTextFont, PDFName>();
    const pageGsKeys = new Map<string, PDFName>();

    const getOpacityGsKey = (opacity: number): PDFName | undefined => {
      if (opacity >= 0.999) return undefined;
      const key = opacity.toFixed(3);
      const existing = pageGsKeys.get(key);
      if (existing) return existing;
      const gsDict = ctx.obj({ Type: 'ExtGState', ca: opacity, CA: opacity });
      const created = page.node.newExtGState('SigGS', gsDict);
      pageGsKeys.set(key, created);
      return created;
    };

    const ops: PDFOperator[] = [
      pushGraphicsState(),
      concatTransformationMatrix(matrix[0], matrix[1], matrix[2], matrix[3], matrix[4], matrix[5]),
    ];

    let pagePlaced = 0;

    for (const p of pagePlacements) {
      const normW = clamp(p.width, 0.002, 1);
      const normH = clamp(p.height, 0.002, 1);
      const normLeft = clamp(p.left, 0, Math.max(0, 1 - normW));
      const normTop = clamp(p.top, 0, Math.max(0, 1 - normH));

      const w = normW * visW;
      const h = normH * visH;
      const u = normLeft * visW;
      const vTop = (1 - normTop) * visH;
      const vBottom = vTop - h;
      const opacity = clamp(p.opacity ?? 1, 0.02, 1);
      const gsKey = getOpacityGsKey(opacity);

      if (p.kind === 'image') {
        const assetKey = p.assetId || p.id;
        const embeddedImg = await getEmbeddedImage(p);
        let imgKey = pageImgKeys.get(assetKey);
        if (!imgKey) {
          imgKey = page.node.newXObject('SigImg', embeddedImg.ref);
          pageImgKeys.set(assetKey, imgKey);
        }
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
        pagePlaced += 1;
      } else {
        const lines = p.text.split(/\r?\n/);
        const fontChoice: SignatureTextFont = p.font ?? 'helvetica';
        const font = await getEmbeddedFont(fontChoice);
        let fontKey = pageFontKeys.get(fontChoice);
        if (!fontKey) {
          fontKey = page.node.newFontDictionary('SigFont', font.ref);
          pageFontKeys.set(fontChoice, fontKey);
        }

        const fontSize =
          typeof p.fontSize === 'number' && Number.isFinite(p.fontSize) && p.fontSize > 0
            ? clamp(p.fontSize, 4, 240)
            : clamp((h / Math.max(1, lines.length)) * 0.72, 6, 144);
        const color = parseHexColor(p.color, '#111827');
        const capHeight = font.heightAtSize(fontSize, { descender: false });
        const lineHeight = fontSize * 1.22;
        const totalBlockH = lines.length === 1 ? capHeight : (lines.length - 1) * lineHeight + capHeight;
        const topOffset = Math.max(0, (h - totalBlockH) / 2);

        for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
          const rawLine = lines[lineIdx];
          if (!rawLine) continue;
          const { encoded } = encodeSafe(font, rawLine);
          const baselineY = vTop - topOffset - capHeight - lineIdx * lineHeight;
          ops.push(
            ...drawText(encoded, {
              color,
              font: fontKey,
              size: fontSize,
              rotate: degrees(0),
              xSkew: degrees(0),
              ySkew: degrees(0),
              x: u,
              y: baselineY,
              graphicsState: gsKey,
            }),
          );
        }
        pagePlaced += 1;
      }
    }

    ops.push(popGraphicsState());

    if (pagePlaced > 0) {
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
      placedCount += pagePlaced;
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

  return { bytes: outBytes, placedCount, pagesModified };
}
