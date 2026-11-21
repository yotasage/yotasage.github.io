import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';

export interface OutlineNode {
  id: string;
  title: string;
  pageNumber: number | null; // 1-based page number, or null if unresolved
  url: string | null;
  children: OutlineNode[];
}

export interface PdfDocInfo {
  pdfVersion: string | null;
  title: string | null;
  author: string | null;
  subject: string | null;
  creator: string | null;
  producer: string | null;
  pageWidthPt: number | null;
  pageHeightPt: number | null;
}

export interface PositionedTextItem {
  str: string;
  startOffset: number;
  endOffset: number;
  left: number;
  top: number;
  fontSize: number;
  angle: number;
  targetWidth: number;
  fontFamily: string;
}

export interface PageLinkItem {
  id: string;
  left: number;
  top: number;
  width: number;
  height: number;
  url: string | null;
  dest: unknown;
  title: string;
}

export interface SearchMatch {
  pageNumber: number; // 1-based
  start: number; // char offset within page's concatenated text
  end: number;
}

export interface PageMatchSpan {
  start: number;
  end: number;
  globalIndex: number;
}

export interface TextHighlightSegment {
  text: string;
  matchIndex: number | null;
}

export interface PageTextData {
  fullText: string;
  items: PositionedTextItem[];
}

// Splits a positioned text span into unhighlighted and search-highlighted segments.
export function splitItemWithMatches(
  item: PositionedTextItem,
  pageMatches: readonly PageMatchSpan[],
): TextHighlightSegment[] {
  if (pageMatches.length === 0 || !item.str) {
    return [{ text: item.str, matchIndex: null }];
  }

  const segments: TextHighlightSegment[] = [];
  let cursor = item.startOffset;

  for (const m of pageMatches) {
    if (m.end <= item.startOffset) continue;
    if (m.start >= item.endOffset) break;

    const overlapStart = Math.max(m.start, cursor);
    const overlapEnd = Math.min(m.end, item.endOffset);
    if (overlapStart >= overlapEnd) continue;

    if (overlapStart > cursor) {
      segments.push({
        text: item.str.slice(cursor - item.startOffset, overlapStart - item.startOffset),
        matchIndex: null,
      });
    }
    segments.push({
      text: item.str.slice(overlapStart - item.startOffset, overlapEnd - item.startOffset),
      matchIndex: m.globalIndex,
    });
    cursor = overlapEnd;
  }

  if (cursor < item.endOffset) {
    segments.push({
      text: item.str.slice(cursor - item.startOffset),
      matchIndex: null,
    });
  }

  return segments.length > 0 ? segments : [{ text: item.str, matchIndex: null }];
}

// Multiplies two 6-element 2D affine transform matrices (m1 * m2).
export function multiplyTransform(
  m1: readonly number[],
  m2: readonly number[],
): [number, number, number, number, number, number] {
  return [
    m1[0] * m2[0] + m1[2] * m2[1],
    m1[1] * m2[0] + m1[3] * m2[1],
    m1[0] * m2[2] + m1[2] * m2[3],
    m1[1] * m2[2] + m1[3] * m2[3],
    m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
    m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
  ];
}

// Resolves a PDF destination (named string or explicit array) to a 1-based page number.
export async function resolveDestinationPage(doc: PDFDocumentProxy, dest: unknown): Promise<number | null> {
  if (!dest) return null;
  try {
    const resolved = typeof dest === 'string' ? await doc.getDestination(dest) : dest;
    if (!Array.isArray(resolved) || resolved.length === 0) return null;
    const ref = resolved[0];
    let pageIndex = -1;
    if (typeof ref === 'number') {
      pageIndex = ref;
    } else if (ref && typeof ref === 'object') {
      pageIndex = await doc.getPageIndex(ref as { num: number; gen: number });
    }
    if (!Number.isInteger(pageIndex) || pageIndex < 0 || pageIndex >= doc.numPages) return null;
    return pageIndex + 1;
  } catch {
    return null;
  }
}

export function isSafeExternalUrl(url: unknown): url is string {
  if (typeof url !== 'string' || !url.trim()) return false;
  return /^(https?:|mailto:)/i.test(url.trim());
}

// Reads the full nested outline (table of contents) of a PDF document.
export async function readOutlineTree(doc: PDFDocumentProxy): Promise<OutlineNode[]> {
  let rawOutline: Awaited<ReturnType<PDFDocumentProxy['getOutline']>>;
  try {
    rawOutline = await doc.getOutline();
  } catch {
    return [];
  }
  if (!rawOutline || rawOutline.length === 0) return [];

  let counter = 0;
  const MAX_DEPTH = 12;

  async function convert(items: typeof rawOutline, depth: number): Promise<OutlineNode[]> {
    if (!items || items.length === 0 || depth > MAX_DEPTH) return [];
    const out: OutlineNode[] = [];
    for (const item of items) {
      if (!item) continue;
      counter += 1;
      const pageNumber = item.dest ? await resolveDestinationPage(doc, item.dest) : null;
      const url = isSafeExternalUrl(item.url) ? item.url.trim() : null;
      const children = item.items?.length ? await convert(item.items, depth + 1) : [];
      const title = (item.title ?? '').replace(/\s+/g, ' ').trim() || (pageNumber ? `Page ${pageNumber}` : 'Untitled');
      out.push({
        id: `ol-${counter}`,
        title,
        pageNumber,
        url,
        children,
      });
    }
    return out;
  }

  return convert(rawOutline, 0);
}

function cleanMetaString(val: unknown): string | null {
  if (typeof val !== 'string') return null;
  const trimmed = val.trim();
  return trimmed.length > 0 ? trimmed : null;
}

// Reads document metadata and first-page dimensions.
export async function readDocInfo(doc: PDFDocumentProxy): Promise<PdfDocInfo> {
  const result: PdfDocInfo = {
    pdfVersion: null,
    title: null,
    author: null,
    subject: null,
    creator: null,
    producer: null,
    pageWidthPt: null,
    pageHeightPt: null,
  };

  try {
    const meta = await doc.getMetadata();
    const info = (meta?.info ?? {}) as Record<string, unknown>;
    result.pdfVersion = cleanMetaString(info.PDFFormatVersion);
    result.title = cleanMetaString(info.Title);
    result.author = cleanMetaString(info.Author);
    result.subject = cleanMetaString(info.Subject);
    result.creator = cleanMetaString(info.Creator);
    result.producer = cleanMetaString(info.Producer);
  } catch {
    // Some malformed PDFs fail getMetadata; keep partial info.
  }

  try {
    if (doc.numPages >= 1) {
      const p1 = await doc.getPage(1);
      try {
        const vp = p1.getViewport({ scale: 1 });
        result.pageWidthPt = vp.width;
        result.pageHeightPt = vp.height;
      } finally {
        p1.cleanup();
      }
    }
  } catch {
    // Ignore first page measurement failure.
  }

  return result;
}

// Formats PDF points as millimetres and points, e.g. "210 × 297 mm (595 × 842 pt)".
export function formatPageDimensions(widthPt: number, heightPt: number): string {
  const ptToMm = 25.4 / 72;
  const wMm = Math.round(widthPt * ptToMm);
  const hMm = Math.round(heightPt * ptToMm);
  return `${wMm} × ${hMm} mm (${Math.round(widthPt)} × ${Math.round(heightPt)} pt)`;
}

// Builds positioned text spans and concatenated searchable text for a page at the given viewport.
export async function extractPageTextLayout(
  page: PDFPageProxy,
  scale: number,
  extraRotation: number,
): Promise<PageTextData> {
  const totalRotation = (page.rotate + extraRotation) % 360;
  const viewport = page.getViewport({ scale, rotation: totalRotation });
  const textContent = await page.getTextContent();
  const styles = textContent.styles ?? {};

  const items: PositionedTextItem[] = [];
  const parts: string[] = [];
  let cursor = 0;

  for (const raw of textContent.items) {
    if (!('str' in raw)) continue;
    const str = raw.str;
    if (!str) {
      if (raw.hasEOL) {
        parts.push('\n');
        cursor += 1;
      }
      continue;
    }

    const tx = multiplyTransform(viewport.transform, raw.transform);
    const fontHeight = Math.hypot(tx[2], tx[3]) || Math.hypot(tx[0], tx[1]);
    if (fontHeight <= 0.5) {
      parts.push(str);
      cursor += str.length;
      if (raw.hasEOL) {
        parts.push('\n');
        cursor += 1;
      }
      continue;
    }

    const angle = Math.atan2(tx[1], tx[0]);
    const style = styles[raw.fontName];
    const ascent = typeof style?.ascent === 'number' && style.ascent > 0 && style.ascent < 1.5 ? style.ascent : 0.85;
    const left = tx[4] + tx[2] * ascent;
    const top = tx[5] + tx[3] * ascent;
    const targetWidth = raw.dir === 'ttb' ? raw.height * scale : raw.width * scale;
    const fontFamily = style?.fontFamily || 'sans-serif';

    const startOffset = cursor;
    const endOffset = cursor + str.length;
    items.push({
      str,
      startOffset,
      endOffset,
      left,
      top,
      fontSize: fontHeight,
      angle,
      targetWidth,
      fontFamily,
    });
    parts.push(str);
    cursor = endOffset;

    if (raw.hasEOL) {
      parts.push('\n');
      cursor += 1;
    }
  }

  return { fullText: parts.join(''), items };
}

// Extracts plain searchable text from a page without layout calculations (matches extractPageTextLayout offsets exactly).
export async function extractPageSearchText(doc: PDFDocumentProxy, pageNumber: number): Promise<string> {
  const page = await doc.getPage(pageNumber);
  try {
    const textContent = await page.getTextContent();
    const parts: string[] = [];
    for (const raw of textContent.items) {
      if (!('str' in raw)) continue;
      if (raw.str) parts.push(raw.str);
      if (raw.hasEOL) parts.push('\n');
    }
    return parts.join('');
  } finally {
    page.cleanup();
  }
}

// Finds all non-overlapping matches of `query` in `text`.
export function findTextMatches(
  text: string,
  query: string,
  caseSensitive: boolean,
  pageNumber: number,
): SearchMatch[] {
  if (!query || !text) return [];
  const hay = caseSensitive ? text : text.toLowerCase();
  const needle = caseSensitive ? query : query.toLowerCase();
  if (!needle) return [];

  const matches: SearchMatch[] = [];
  let idx = 0;
  while (idx <= hay.length - needle.length) {
    const found = hay.indexOf(needle, idx);
    if (found === -1) break;
    matches.push({ pageNumber, start: found, end: found + needle.length });
    idx = found + needle.length;
  }
  return matches;
}

// Extracts clickable link annotations mapped into CSS viewport coordinates.
export async function extractPageLinks(
  page: PDFPageProxy,
  scale: number,
  extraRotation: number,
): Promise<PageLinkItem[]> {
  const totalRotation = (page.rotate + extraRotation) % 360;
  const viewport = page.getViewport({ scale, rotation: totalRotation });
  const annotations = await page.getAnnotations();
  const links: PageLinkItem[] = [];

  for (let i = 0; i < annotations.length; i++) {
    const annot = annotations[i];
    if (!annot || annot.subtype !== 'Link' || !Array.isArray(annot.rect) || annot.rect.length < 4) continue;
    const url = isSafeExternalUrl(annot.url) ? annot.url.trim() : null;
    const dest = annot.dest ?? null;
    if (!url && !dest) continue;

    const [x1, y1, x2, y2] = annot.rect as [number, number, number, number];
    const [a, b, c, d, e, f] = viewport.transform;
    const p1x = a * x1 + c * y1 + e;
    const p1y = b * x1 + d * y1 + f;
    const p2x = a * x2 + c * y2 + e;
    const p2y = b * x2 + d * y2 + f;
    const left = Math.min(p1x, p2x);
    const top = Math.min(p1y, p2y);
    const width = Math.abs(p2x - p1x);
    const height = Math.abs(p2y - p1y);
    if (width < 1 || height < 1) continue;

    links.push({
      id: annot.id ? String(annot.id) : `link-${i}`,
      left,
      top,
      width,
      height,
      url,
      dest,
      title: url ? url : 'Jump to section',
    });
  }

  return links;
}
