// True irreversible PDF redaction engine:
//   - Pure DOM-free text/regex/PII matching into normalized [0..1] visual top-left boxes
//   - Pure RGBA pixel burning for deterministic verification and custom renderers
//   - Browser pdf.js text-span extraction accounting for /CropBox and /Rotate
//   - Permanent pixel flattening of redacted pages + lossless copying of unredacted pages
//   - Optional metadata and hidden-data scrubbing via lib/pdf/sanitize.ts

import { PDFDocument } from '@cantoo/pdf-lib';

import type { canvasToBytes as CanvasToBytesFn } from './files';
import { encodePngRgba } from './imageDecode';
import type { openPdf as OpenPdfFn, renderPage as RenderPageFn } from './pdfjs';
import { cleanPdf, PRESETS as SANITIZE_PRESETS } from './sanitize';

export interface RedactBox {
  id: string;
  pageIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
  source: 'manual' | 'search' | 'pii';
  matchedText?: string;
}

export interface TextSpanBox {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export type PiiPresetId = 'emails' | 'phones' | 'urls' | 'cards' | 'dates' | 'ipv4';

export interface PiiPreset {
  id: PiiPresetId;
  label: string;
  description: string;
  pattern: RegExp;
}

export const PII_PRESETS: PiiPreset[] = [
  {
    id: 'emails',
    label: 'Emails',
    description: 'Email addresses such as name@example.com',
    pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
  },
  {
    id: 'phones',
    label: 'Phones',
    description: 'International and local telephone numbers',
    pattern: /(?:\+\d{1,3}[\s.-]?(?:\(\d{1,4}\)[\s.-]?)?|\(\d{2,4}\)[\s.-]?)\d{2,4}[\s.-]?\d{2,4}(?:[\s.-]?\d{2,4})?|\b\d{3}[\s.-]\d{3}[\s.-]\d{4}\b/g,
  },
  {
    id: 'urls',
    label: 'URLs',
    description: 'Web links starting with http://, https://, or www.',
    pattern: /\b(?:https?:\/\/|www\.)[^\s<>()[\]{}"'`]+[^\s<>()[\]{}"'`.,;:!?]/gi,
  },
  {
    id: 'cards',
    label: 'Cards / IBAN',
    description: '13-19 digit payment cards and IBAN-like account numbers',
    pattern: /\b(?:[A-Z]{2}\d{2}(?:[\s-]?[A-Z0-9]){11,30}|\d{4}[\s-]?\d{6}[\s-]?\d{5}|\d{4}(?:[\s-]?\d{4}){2,3}(?:[\s-]?\d{1,3})?|\d{13,19})\b/g,
  },
  {
    id: 'dates',
    label: 'Dates',
    description: 'ISO, slash, and dot numeric dates (YYYY-MM-DD, DD/MM/YYYY, DD.MM.YYYY)',
    pattern: /\b(?:\d{4}[-/.](?:0?[1-9]|1[0-2])[-/.](?:0?[1-9]|[12]\d|3[01])|(?:0?[1-9]|[12]\d|3[01])[-/.](?:0?[1-9]|1[0-2])[-/.](?:19|20)\d{2}|(?:0?[1-9]|1[0-2])[-/.](?:0?[1-9]|[12]\d|3[01])[-/.](?:19|20)\d{2})\b/g,
  },
  {
    id: 'ipv4',
    label: 'IPv4',
    description: 'IPv4 addresses such as 192.168.1.42',
    pattern: /\b(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\b/g,
  },
];

export interface RedactQuery {
  text?: string;
  caseSensitive?: boolean;
  regex?: boolean;
  preset?: PiiPresetId;
}

export interface RenderedRgbaPage {
  rgba: Uint8ClampedArray;
  width: number;
  height: number;
  widthPt: number;
  heightPt: number;
}

export interface RedactOptions {
  fillColor?: string;
  overlayText?: string;
  overlayTextColor?: string;
  dpi?: number;
  sanitizeMetadata?: boolean;
  password?: string;
  onProgress?: (fraction: number, label: string) => void;
  renderPageRgba?: (pageIndex: number, dpi: number) => Promise<RenderedRgbaPage>;
}

export interface RedactResult {
  bytes: Uint8Array;
  redactedPages: number[];
  boxesApplied: number;
  metadataSanitized: boolean;
}

let redactIdCounter = 0;

export function nextRedactId(prefix = 'r'): string {
  redactIdCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${redactIdCounter}`;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export function parseHexRgb(hex: string): [number, number, number] {
  if (typeof hex !== 'string') return [0, 0, 0];
  const cleaned = hex.trim().replace(/^#/, '');
  if (/^[0-9a-fA-F]{3}$/.test(cleaned)) {
    const r = parseInt(cleaned[0] + cleaned[0], 16);
    const g = parseInt(cleaned[1] + cleaned[1], 16);
    const b = parseInt(cleaned[2] + cleaned[2], 16);
    return [r, g, b];
  }
  if (/^[0-9a-fA-F]{6}$/.test(cleaned)) {
    const r = parseInt(cleaned.slice(0, 2), 16);
    const g = parseInt(cleaned.slice(2, 4), 16);
    const b = parseInt(cleaned.slice(4, 6), 16);
    return [r, g, b];
  }
  return [0, 0, 0];
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

interface SpanLineBucket {
  ySum: number;
  count: number;
  maxHeight: number;
  spans: TextSpanBox[];
}

interface LineSegment {
  span: TextSpanBox;
  charStart: number;
  charEnd: number;
}

/**
 * Pure DOM-free matcher: groups normalized [0..1] visual text spans into lines,
 * runs substring, regex, or PII preset matching across each line, and computes
 * proportionally interpolated union bounding boxes with small safety padding.
 */
export function findTextRedactMatches(
  pageIndex: number,
  spans: TextSpanBox[],
  query: RedactQuery,
): RedactBox[] {
  let re: RegExp;
  let source: 'search' | 'pii' = 'search';

  if (query.preset) {
    const preset = PII_PRESETS.find((p) => p.id === query.preset);
    if (!preset) return [];
    const flags = preset.pattern.flags.includes('g') ? preset.pattern.flags : `${preset.pattern.flags}g`;
    re = new RegExp(preset.pattern.source, flags);
    source = 'pii';
  } else if (query.text && query.text.length > 0) {
    const flags = query.caseSensitive ? 'g' : 'gi';
    re = query.regex ? new RegExp(query.text, flags) : new RegExp(escapeRegExp(query.text), flags);
    source = 'search';
  } else {
    return [];
  }

  const nonEmpty = spans.filter((s) => s && typeof s.str === 'string' && s.str.length > 0);
  if (nonEmpty.length === 0) return [];

  // Sort top-to-bottom by visual vertical center, then left-to-right.
  const sorted = nonEmpty.slice().sort((a, b) => {
    const ca = a.y + a.height * 0.5;
    const cb = b.y + b.height * 0.5;
    if (Math.abs(ca - cb) > 1e-4) return ca - cb;
    return a.x - b.x;
  });

  const buckets: SpanLineBucket[] = [];
  for (const span of sorted) {
    const h = Math.max(span.height, 0.002);
    const cy = span.y + h * 0.5;
    let best: SpanLineBucket | null = null;
    let bestDist = Infinity;

    for (let i = buckets.length - 1; i >= Math.max(0, buckets.length - 8); i--) {
      const b = buckets[i];
      const refY = b.ySum / b.count;
      const tol = Math.max(0.008, Math.max(b.maxHeight, h) * 0.6);
      const dist = Math.abs(cy - refY);
      if (dist <= tol && dist < bestDist) {
        bestDist = dist;
        best = b;
      }
    }

    if (best) {
      best.spans.push(span);
      best.ySum += cy;
      best.count += 1;
      if (h > best.maxHeight) best.maxHeight = h;
    } else {
      buckets.push({
        ySum: cy,
        count: 1,
        maxHeight: h,
        spans: [span],
      });
    }
  }

  buckets.sort((a, b) => a.ySum / a.count - b.ySum / b.count);

  const matches: RedactBox[] = [];
  const PAD_X = 0.002;
  const PAD_Y = 0.0015;

  for (const bucket of buckets) {
    bucket.spans.sort((a, b) => a.x - b.x);
    let lineStr = '';
    const segments: LineSegment[] = [];

    for (let i = 0; i < bucket.spans.length; i++) {
      const span = bucket.spans[i];
      if (i > 0) {
        const prev = bucket.spans[i - 1];
        const prevEnd = prev.x + prev.width;
        const gap = span.x - prevEnd;
        const prevCharW =
          prev.str.length > 0 && prev.width > 0
            ? prev.width / prev.str.length
            : Math.max(0.004, prev.height * 0.45);
        const currCharW =
          span.str.length > 0 && span.width > 0
            ? span.width / span.str.length
            : Math.max(0.004, span.height * 0.45);
        const refCharW = Math.min(prevCharW, currCharW);
        if (
          gap > refCharW * 0.25 &&
          !/\s$/.test(prev.str) &&
          !/^\s/.test(span.str)
        ) {
          lineStr += ' ';
        }
      }
      const charStart = lineStr.length;
      lineStr += span.str;
      const charEnd = lineStr.length;
      segments.push({ span, charStart, charEnd });
    }

    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(lineStr)) !== null) {
      if (m[0].length === 0) {
        re.lastIndex += 1;
        continue;
      }
      const mStart = m.index;
      const mEnd = mStart + m[0].length;

      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;

      for (const seg of segments) {
        if (seg.charEnd <= mStart || seg.charStart >= mEnd) continue;
        const spanLen = Math.max(1, seg.charEnd - seg.charStart);
        const localStart = Math.max(0, mStart - seg.charStart);
        const localEnd = Math.min(spanLen, mEnd - seg.charStart);

        const sx0 = seg.span.x + seg.span.width * (localStart / spanLen);
        const sx1 = seg.span.x + seg.span.width * (localEnd / spanLen);
        const sy0 = seg.span.y;
        const sy1 = seg.span.y + seg.span.height;

        if (sx0 < minX) minX = sx0;
        if (sx1 > maxX) maxX = sx1;
        if (sy0 < minY) minY = sy0;
        if (sy1 > maxY) maxY = sy1;
      }

      if (!Number.isFinite(minX) || !Number.isFinite(minY)) continue;

      const bx0 = clamp(minX - PAD_X, 0, 1);
      const by0 = clamp(minY - PAD_Y, 0, 1);
      const bx1 = clamp(maxX + PAD_X, 0, 1);
      const by1 = clamp(maxY + PAD_Y, 0, 1);

      matches.push({
        id: nextRedactId(source === 'pii' ? 'pii' : 'srch'),
        pageIndex,
        x: bx0,
        y: by0,
        width: Math.max(0.002, bx1 - bx0),
        height: Math.max(0.002, by1 - by0),
        source,
        matchedText: m[0],
      });
    }
  }

  return matches;
}

/**
 * Pure RGBA pixel burner: overwrites every pixel inside each normalized [0..1] box
 * in-place with opaque (r, g, b, 255). Returns the count of unique pixels overwritten.
 */
export function burnRedactionsIntoRgba(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  boxes: Array<{ x: number; y: number; width: number; height: number }>,
  fillRgb: [number, number, number],
): number {
  if (width <= 0 || height <= 0 || boxes.length === 0) return 0;
  const [r, g, b] = fillRgb;
  const useMask = boxes.length > 1;
  const visited = useMask ? new Uint8Array(width * height) : null;
  let overwritten = 0;

  for (const box of boxes) {
    const x0 = clamp(Math.floor(box.x * width), 0, width);
    const y0 = clamp(Math.floor(box.y * height), 0, height);
    const x1 = clamp(Math.ceil((box.x + box.width) * width), x0, width);
    const y1 = clamp(Math.ceil((box.y + box.height) * height), y0, height);

    for (let y = y0; y < y1; y++) {
      const rowPix = y * width;
      for (let x = x0; x < x1; x++) {
        const pixIdx = rowPix + x;
        const off = pixIdx * 4;
        rgba[off] = r;
        rgba[off + 1] = g;
        rgba[off + 2] = b;
        rgba[off + 3] = 255;
        if (visited) {
          if (visited[pixIdx] === 0) {
            visited[pixIdx] = 1;
            overwritten += 1;
          }
        } else {
          overwritten += 1;
        }
      }
    }
  }

  return overwritten;
}

function applyAffine(m: number[], x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

/**
 * Extracts normalized [0..1] visual top-left text spans from a pdf.js PDFPageProxy,
 * properly mapping through viewport.transform to respect /CropBox and /Rotate.
 */
export async function extractPageTextSpans(page: {
  getViewport: (opts: { scale: number }) => { width: number; height: number; transform: number[] };
  getTextContent: () => Promise<{ items: unknown[] }>;
}): Promise<TextSpanBox[]> {
  const viewport = page.getViewport({ scale: 1 });
  const vw = Math.max(1, viewport.width);
  const vh = Math.max(1, viewport.height);
  const vt = viewport.transform;
  const content = await page.getTextContent();
  const spans: TextSpanBox[] = [];

  for (const raw of content.items) {
    if (!raw || typeof raw !== 'object' || !('str' in raw)) continue;
    const item = raw as {
      str: string;
      transform?: number[];
      width?: number;
      height?: number;
    };
    if (!item.str || item.str.length === 0) continue;
    const t = item.transform;
    if (!t || t.length < 6) continue;

    const [ta, tb, tc, td, te, tf] = t;
    const lenA = Math.hypot(ta, tb);
    const lenC = Math.hypot(tc, td);
    const h = item.height && item.height > 0 ? item.height : lenC || lenA || 10;
    const w = item.width && item.width > 0 ? item.width : Math.max(h * 0.5 * item.str.length, 1);

    const ux = lenA > 1e-6 ? ta / lenA : 1;
    const uy = lenA > 1e-6 ? tb / lenA : 0;
    const vx = lenC > 1e-6 ? tc / lenC : -uy;
    const vy = lenC > 1e-6 ? td / lenC : ux;

    // Cover descenders (~22% below baseline) through ascenders (~96% above baseline).
    const desc = h * 0.22;
    const fullH = h * 1.18;
    const bx = te - vx * desc;
    const by = tf - vy * desc;

    const corners = [
      applyAffine(vt, bx, by),
      applyAffine(vt, bx + ux * w, by + uy * w),
      applyAffine(vt, bx + vx * fullH, by + vy * fullH),
      applyAffine(vt, bx + ux * w + vx * fullH, by + uy * w + vy * fullH),
    ];

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const [cx, cy] of corners) {
      if (cx < minX) minX = cx;
      if (cx > maxX) maxX = cx;
      if (cy < minY) minY = cy;
      if (cy > maxY) maxY = cy;
    }

    const nx0 = clamp(minX / vw, 0, 1);
    const ny0 = clamp(minY / vh, 0, 1);
    const nx1 = clamp(maxX / vw, 0, 1);
    const ny1 = clamp(maxY / vh, 0, 1);
    if (nx1 <= nx0 || ny1 <= ny0) continue;

    spans.push({
      str: item.str,
      x: nx0,
      y: ny0,
      width: nx1 - nx0,
      height: ny1 - ny0,
    });
  }

  return spans;
}

function drawOverlayLabel(
  ctx: CanvasRenderingContext2D,
  bx: number,
  by: number,
  bw: number,
  bh: number,
  label: string,
  textRgb: [number, number, number],
) {
  if (!label || bw < 8 || bh < 6) return;
  ctx.save();
  ctx.beginPath();
  ctx.rect(bx, by, bw, bh);
  ctx.clip();

  let fontSize = Math.max(6, Math.floor(bh * 0.62));
  ctx.font = `700 ${fontSize}px system-ui, -apple-system, BlinkMacSystemFont, sans-serif`;
  const measured = ctx.measureText(label);
  const maxW = bw * 0.88;
  if (measured.width > maxW && measured.width > 0) {
    fontSize = Math.max(6, Math.floor(fontSize * (maxW / measured.width)));
    ctx.font = `700 ${fontSize}px system-ui, -apple-system, BlinkMacSystemFont, sans-serif`;
  }

  ctx.fillStyle = `rgb(${textRgb[0]}, ${textRgb[1]}, ${textRgb[2]})`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, bx + bw / 2, by + bh / 2);
  ctx.restore();
}

const ANONYMIZE_OPTIONS =
  SANITIZE_PRESETS.find((p) => p.id === 'anonymize')?.options ?? SANITIZE_PRESETS[0].options;

/**
 * Applies irreversible redactions to a PDF:
 *   - Pages WITHOUT boxes are copied losslessly.
 *   - Pages WITH boxes are permanently flattened to pixels with redaction rectangles burned in
 *     so zero text operators or underlying vector/image content remain in those regions.
 *   - Optionally scrubs Info, XMP, document ID, thumbnails, private data, scripts and revisions.
 */
export async function applyRedactions(
  bytes: Uint8Array,
  boxes: RedactBox[],
  opts?: RedactOptions,
): Promise<RedactResult> {
  const fillRgb = parseHexRgb(opts?.fillColor ?? '#000000');
  const overlayText = (opts?.overlayText ?? '').trim();
  const autoTextHex = fillRgb[0] * 0.299 + fillRgb[1] * 0.587 + fillRgb[2] * 0.114 > 140 ? '#000000' : '#ffffff';
  const textRgb = parseHexRgb(opts?.overlayTextColor ?? autoTextHex);
  const dpi = clamp(Math.round(opts?.dpi ?? 200), 72, 600);
  const sanitizeMetadata = opts?.sanitizeMetadata !== false;

  opts?.onProgress?.(0.05, 'Loading source PDF…');
  const srcDoc = await PDFDocument.load(bytes, { updateMetadata: false, password: opts?.password });
  const pageCount = srcDoc.getPageCount();

  const boxesByPage = new Map<number, RedactBox[]>();
  for (const box of boxes) {
    if (!Number.isInteger(box.pageIndex) || box.pageIndex < 0 || box.pageIndex >= pageCount) continue;
    if (box.width <= 0 || box.height <= 0) continue;
    const list = boxesByPage.get(box.pageIndex);
    if (list) list.push(box);
    else boxesByPage.set(box.pageIndex, [box]);
  }

  const outDoc = await PDFDocument.create();
  const redactedPages: number[] = [];
  let boxesApplied = 0;

  let pdfjsHandle: { doc: Awaited<ReturnType<typeof OpenPdfFn>>['doc']; close: () => Promise<void> } | null = null;
  let renderPageFn: typeof RenderPageFn | null = null;
  let canvasToBytesFn: typeof CanvasToBytesFn | null = null;

  try {
    if (!opts?.renderPageRgba && boxesByPage.size > 0) {
      if (typeof document === 'undefined') {
        throw new Error('Browser canvas rendering requires a browser environment or a renderPageRgba callback.');
      }
      opts?.onProgress?.(0.1, 'Initializing PDF renderer…');
      // @ts-expect-error TypeScript node16 requires .js on dynamic imports, which Next/Turbopack rejects.
      const pdfjsMod = (await import('./pdfjs')) as { openPdf: typeof OpenPdfFn; renderPage: typeof RenderPageFn };
      // @ts-expect-error TypeScript node16 requires .js on dynamic imports, which Next/Turbopack rejects.
      const filesMod = (await import('./files')) as { canvasToBytes: typeof CanvasToBytesFn };
      pdfjsHandle = await pdfjsMod.openPdf(bytes, opts?.password);
      renderPageFn = pdfjsMod.renderPage;
      canvasToBytesFn = filesMod.canvasToBytes;
    }

    const scale = dpi / 72;

    for (let i = 0; i < pageCount; i++) {
      const pageNum = i + 1;
      const pageBoxes = boxesByPage.get(i);
      const frac = 0.12 + (0.72 * i) / Math.max(1, pageCount);

      if (!pageBoxes || pageBoxes.length === 0) {
        opts?.onProgress?.(frac, `Copying unredacted page ${pageNum} of ${pageCount}…`);
        const [copied] = await outDoc.copyPages(srcDoc, [i]);
        outDoc.addPage(copied);
        continue;
      }

      opts?.onProgress?.(frac, `Burning redactions into page ${pageNum} of ${pageCount}…`);
      redactedPages.push(pageNum);
      boxesApplied += pageBoxes.length;

      if (opts?.renderPageRgba) {
        const rendered = await opts.renderPageRgba(i, dpi);
        const rgbaCopy = new Uint8ClampedArray(rendered.rgba);
        burnRedactionsIntoRgba(rgbaCopy, rendered.width, rendered.height, pageBoxes, fillRgb);
        const pngBytes = encodePngRgba(rgbaCopy, rendered.width, rendered.height);
        const embedded = await outDoc.embedPng(pngBytes);
        const outPage = outDoc.addPage([rendered.widthPt, rendered.heightPt]);
        outPage.drawImage(embedded, {
          x: 0,
          y: 0,
          width: rendered.widthPt,
          height: rendered.heightPt,
        });
      } else if (pdfjsHandle && renderPageFn && canvasToBytesFn) {
        const pdfPage = await pdfjsHandle.doc.getPage(pageNum);
        const vp1 = pdfPage.getViewport({ scale: 1 });
        const widthPt = vp1.width;
        const heightPt = vp1.height;
        const canvas = await renderPageFn(pdfPage, scale);
        try {
          const ctx = canvas.getContext('2d');
          if (!ctx) throw new Error('Could not initialize 2D canvas context for redaction.');

          for (const box of pageBoxes) {
            const bx = clamp(Math.floor(box.x * canvas.width), 0, canvas.width);
            const by = clamp(Math.floor(box.y * canvas.height), 0, canvas.height);
            const bx2 = clamp(Math.ceil((box.x + box.width) * canvas.width), bx, canvas.width);
            const by2 = clamp(Math.ceil((box.y + box.height) * canvas.height), by, canvas.height);
            const bw = Math.max(1, bx2 - bx);
            const bh = Math.max(1, by2 - by);

            ctx.fillStyle = `rgb(${fillRgb[0]}, ${fillRgb[1]}, ${fillRgb[2]})`;
            ctx.fillRect(bx, by, bw, bh);

            if (overlayText) {
              drawOverlayLabel(ctx, bx, by, bw, bh, overlayText, textRgb);
            }
          }

          let imgBytes = await canvasToBytesFn(canvas, 'image/png');
          let embedded;
          if (imgBytes.length > 4 * 1024 * 1024) {
            imgBytes = await canvasToBytesFn(canvas, 'image/jpeg', 0.94);
            embedded = await outDoc.embedJpg(imgBytes);
          } else {
            embedded = await outDoc.embedPng(imgBytes);
          }

          const outPage = outDoc.addPage([widthPt, heightPt]);
          outPage.drawImage(embedded, {
            x: 0,
            y: 0,
            width: widthPt,
            height: heightPt,
          });
        } finally {
          canvas.width = 0;
          canvas.height = 0;
          try {
            pdfPage.cleanup();
          } catch {
            // Ignore cleanup errors on already-closed documents.
          }
        }
      }
    }
  } finally {
    if (pdfjsHandle) {
      await pdfjsHandle.close().catch(() => undefined);
    }
  }

  opts?.onProgress?.(0.88, 'Saving redacted PDF…');
  let finalBytes: Uint8Array = await outDoc.save({
    useObjectStreams: true,
    addDefaultPage: false,
    updateFieldAppearances: false,
  });

  let metadataSanitized = false;
  if (sanitizeMetadata) {
    opts?.onProgress?.(0.94, 'Scrubbing metadata and hidden data…');
    finalBytes = await cleanPdf(finalBytes, ANONYMIZE_OPTIONS);
    metadataSanitized = true;
  }

  opts?.onProgress?.(1, 'Done');
  return {
    bytes: finalBytes,
    redactedPages,
    boxesApplied,
    metadataSanitized,
  };
}
