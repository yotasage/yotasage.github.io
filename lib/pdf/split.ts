import { PDFDocument } from '@cantoo/pdf-lib';

import { baseName, nextFrame, OutputFile, safeFileName, uniqueNames } from './files';
import { parsePageRanges } from './merge';
import { openPdf } from './pdfjs';

export interface SplitPart {
  label: string;
  // Zero-based page indices included in this output PDF, in order.
  pages: number[];
}

export interface BookmarkSplit {
  title: string;
  // Zero-based starting page index of the bookmark destination.
  pageIndex: number;
}

export interface SplitBySizeResult {
  files: OutputFile[];
  parts: SplitPart[];
  // Zero-based page indices whose single-page PDF alone exceeded maxBytes.
  oversizedPages: number[];
}

// Collapses consecutive ascending or descending runs in order, e.g. [0,1,2,4,5] -> "1-3, 5-6".
export function formatOrderedRanges(pages: number[]): string {
  if (!pages.length) return '';
  const runs: string[] = [];
  let i = 0;
  while (i < pages.length) {
    const start = pages[i];
    let end = start;
    if (i + 1 < pages.length && Math.abs(pages[i + 1] - start) === 1) {
      const step = pages[i + 1] - start;
      while (i + 1 < pages.length && pages[i + 1] - pages[i] === step) {
        i += 1;
        end = pages[i];
      }
    }
    runs.push(start === end ? `${start + 1}` : `${start + 1}-${end + 1}`);
    i += 1;
  }
  return runs.join(', ');
}

function formatPartLabel(pages: number[]): string {
  if (!pages.length) return 'Empty';
  if (pages.length === 1) return `Page ${pages[0] + 1}`;
  return `Pages ${formatOrderedRanges(pages)}`;
}

// Parses range groups separated by newlines or semicolons (e.g. "1-3; 4, 6; 7-end"), or
// comma-separated ranges when no newlines/semicolons are present (e.g. "1-3, 4-6, 7-").
export function parseSplitGroups(text: string, pageCount: number): SplitPart[] {
  if (pageCount < 1) throw new Error('The PDF has no pages.');
  const trimmed = text.trim();
  if (!trimmed) throw new Error('Enter at least one page range.');

  const hasExplicitGroupSep = /[\r\n;]/.test(trimmed);
  const rawGroups = (hasExplicitGroupSep ? trimmed.split(/[\r\n;]+/) : trimmed.split(','))
    .map((g) => g.trim())
    .filter(Boolean);

  if (!rawGroups.length) throw new Error('Enter at least one page range.');

  return rawGroups.map((group) => {
    const pages = parsePageRanges(group, pageCount);
    return { label: formatPartLabel(pages), pages };
  });
}

// Splits a document of `pageCount` pages into contiguous chunks of at most `everyN` pages.
export function splitByEveryN(pageCount: number, everyN: number): SplitPart[] {
  if (pageCount < 1) return [];
  const step = Math.max(1, Math.min(pageCount, Math.floor(everyN) || 1));
  const parts: SplitPart[] = [];
  for (let start = 0; start < pageCount; start += step) {
    const end = Math.min(pageCount, start + step);
    const pages = Array.from({ length: end - start }, (_, i) => start + i);
    parts.push({ label: formatPartLabel(pages), pages });
  }
  return parts;
}

// Turns zero-based `breakAfter` indices (where a cut happens right after page `i`) into contiguous parts.
export function splitByBreakPoints(pageCount: number, breakAfter: Set<number>): SplitPart[] {
  if (pageCount < 1) return [];
  const cuts = Array.from(breakAfter)
    .filter((i) => Number.isInteger(i) && i >= 0 && i < pageCount - 1)
    .sort((a, b) => a - b);

  const parts: SplitPart[] = [];
  let start = 0;
  for (const cut of cuts) {
    if (cut < start) continue;
    const pages = Array.from({ length: cut - start + 1 }, (_, i) => start + i);
    parts.push({ label: formatPartLabel(pages), pages });
    start = cut + 1;
  }
  const tail = Array.from({ length: pageCount - start }, (_, i) => start + i);
  parts.push({ label: formatPartLabel(tail), pages: tail });
  return parts;
}

// Computes visual cut boundaries (0-based page indices after which a contiguous split occurs) for PageGrid.
export function splitAfterFromParts(parts: SplitPart[], pageCount: number): Set<number> {
  const cuts = new Set<number>();
  for (let i = 0; i < parts.length - 1; i++) {
    const cur = parts[i].pages;
    const next = parts[i + 1].pages;
    if (!cur.length || !next.length) continue;
    const last = cur[cur.length - 1];
    if (last >= 0 && last < pageCount - 1 && next[0] === last + 1) {
      cuts.add(last);
    }
  }
  return cuts;
}

// Reads top-level PDF outline items (bookmarks) and resolves each destination to a 0-based page index.
export async function readTopLevelBookmarks(bytes: Uint8Array, password?: string): Promise<BookmarkSplit[]> {
  const { doc, close } = await openPdf(bytes, password);
  try {
    const outline = await doc.getOutline();
    if (!outline || !outline.length) return [];

    const byPage = new Map<number, string>();
    for (const item of outline) {
      if (!item || !item.dest) continue;
      try {
        const dest = typeof item.dest === 'string' ? await doc.getDestination(item.dest) : item.dest;
        if (!Array.isArray(dest) || !dest.length) continue;
        const ref = dest[0];
        let pageIndex = -1;
        if (typeof ref === 'number') {
          pageIndex = ref;
        } else if (ref && typeof ref === 'object') {
          pageIndex = await doc.getPageIndex(ref);
        }
        if (!Number.isInteger(pageIndex) || pageIndex < 0 || pageIndex >= doc.numPages) continue;
        if (!byPage.has(pageIndex)) {
          byPage.set(pageIndex, (item.title ?? '').trim() || `Page ${pageIndex + 1}`);
        }
      } catch {
        // Skip bookmarks whose destination cannot be resolved.
      }
    }

    return Array.from(byPage.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([pageIndex, title]) => ({ title, pageIndex }));
  } finally {
    await close();
  }
}

// Builds contiguous parts from top-level bookmarks, including a leading part if the first bookmark starts after page 0.
export function splitByBookmarks(pageCount: number, bookmarks: BookmarkSplit[]): SplitPart[] {
  if (pageCount < 1 || !bookmarks.length) return [];

  const dedup = new Map<number, string>();
  for (const b of bookmarks) {
    if (!Number.isInteger(b.pageIndex) || b.pageIndex < 0 || b.pageIndex >= pageCount) continue;
    if (!dedup.has(b.pageIndex)) dedup.set(b.pageIndex, b.title.trim());
  }
  const sorted = Array.from(dedup.entries()).sort((a, b) => a[0] - b[0]);
  if (!sorted.length) return [];

  const parts: SplitPart[] = [];
  if (sorted[0][0] > 0) {
    const leading = Array.from({ length: sorted[0][0] }, (_, i) => i);
    parts.push({ label: formatPartLabel(leading), pages: leading });
  }

  for (let i = 0; i < sorted.length; i++) {
    const [start, rawTitle] = sorted[i];
    const end = i + 1 < sorted.length ? sorted[i + 1][0] : pageCount;
    if (end <= start) continue;
    const pages = Array.from({ length: end - start }, (_, k) => start + k);
    parts.push({ label: rawTitle || formatPartLabel(pages), pages });
  }
  return parts;
}

function buildPartFileNames(sourceName: string, parts: SplitPart[]): string[] {
  const stem = safeFileName(baseName(sourceName), 'document');
  const width = String(parts.length).length;
  const rawNames = parts.map((part, i) => {
    const num = String(i + 1).padStart(width, '0');
    const slug = safeFileName(part.label.replace(/[–—]/g, '-'), `part-${num}`).slice(0, 64);
    return `${stem}-${num}-${slug}.pdf`;
  });
  return uniqueNames(rawNames);
}

async function copySlice(src: PDFDocument, indices: number[]): Promise<Uint8Array> {
  const out = await PDFDocument.create();
  const copied = await out.copyPages(src, indices);
  for (const page of copied) out.addPage(page);
  return out.save({ useObjectStreams: true, addDefaultPage: false, updateFieldAppearances: false });
}

// Splits a PDF into one OutputFile per SplitPart, loading the source document once.
export async function splitPdfParts(
  bytes: Uint8Array,
  parts: SplitPart[],
  opts: { sourceName: string; password?: string },
  onProgress?: (fraction: number, label: string) => void,
): Promise<OutputFile[]> {
  if (!parts.length) throw new Error('No split parts to create.');
  onProgress?.(0.05, 'Reading PDF');
  await nextFrame();

  const src = await PDFDocument.load(bytes, { updateMetadata: false, password: opts.password });
  const pageCount = src.getPageCount();
  const names = buildPartFileNames(opts.sourceName, parts);
  const files: OutputFile[] = [];

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (!part.pages.length) throw new Error(`Part ${i + 1} has no pages.`);
    for (const p of part.pages) {
      if (p < 0 || p >= pageCount) {
        throw new Error(`Page ${p + 1} does not exist; the document has ${pageCount} page${pageCount === 1 ? '' : 's'}.`);
      }
    }
    onProgress?.(0.05 + (i / parts.length) * 0.9, `Building part ${i + 1} of ${parts.length}`);
    await nextFrame();
    const saved = await copySlice(src, part.pages);
    files.push({ name: names[i], bytes: saved });
  }

  onProgress?.(1, 'Done');
  return files;
}

// Splits a PDF into contiguous parts each staying under `maxBytes`, using exponential + binary search
// so large documents do not serialize O(N^2) times. Single pages exceeding `maxBytes` are emitted alone.
export async function splitPdfBySize(
  bytes: Uint8Array,
  maxBytes: number,
  opts: { sourceName: string; password?: string },
  onProgress?: (fraction: number, label: string) => void,
): Promise<SplitBySizeResult> {
  if (!Number.isFinite(maxBytes) || maxBytes <= 0) {
    throw new Error('Target file size must be greater than zero.');
  }
  onProgress?.(0.03, 'Reading PDF');
  await nextFrame();

  const src = await PDFDocument.load(bytes, { updateMetadata: false, password: opts.password });
  const pageCount = src.getPageCount();
  if (pageCount < 1) return { files: [], parts: [], oversizedPages: [] };

  const parts: SplitPart[] = [];
  const chunks: Uint8Array[] = [];
  const oversizedPages: number[] = [];

  let cursor = 0;
  let avgBytesPerPage = Math.max(1, bytes.length / pageCount);

  const sliceIndices = (start: number, count: number) => Array.from({ length: count }, (_, i) => start + i);

  while (cursor < pageCount) {
    const rem = pageCount - cursor;
    let lo = 0; // largest count proven <= maxBytes
    let hi = rem + 1; // smallest count proven > maxBytes
    let bestBytes: Uint8Array | null = null;
    let probe = Math.max(1, Math.min(rem, Math.round((maxBytes * 0.92) / avgBytesPerPage)));

    // Bracket the largest fitting chunk size via exponential doubling/halving.
    while (lo === 0 || (hi === rem + 1 && lo < rem)) {
      await nextFrame();
      const saved = await copySlice(src, sliceIndices(cursor, probe));
      if (saved.length <= maxBytes) {
        lo = probe;
        bestBytes = saved;
        if (probe === rem) break;
        if (hi === rem + 1) {
          probe = Math.min(rem, probe * 2);
        } else {
          break;
        }
      } else {
        hi = probe;
        if (probe === 1) {
          oversizedPages.push(cursor);
          lo = 1;
          bestBytes = saved;
          break;
        }
        if (lo > 0) break;
        probe = Math.max(1, Math.floor(probe / 2));
      }
    }

    // Refine exact split point via binary search between lo and hi.
    while (hi - lo > 1 && hi <= rem) {
      const mid = Math.floor((lo + hi) / 2);
      await nextFrame();
      const saved = await copySlice(src, sliceIndices(cursor, mid));
      if (saved.length <= maxBytes) {
        lo = mid;
        bestBytes = saved;
      } else {
        hi = mid;
      }
    }

    const pages = sliceIndices(cursor, lo);
    parts.push({ label: formatPartLabel(pages), pages });
    chunks.push(bestBytes!);
    avgBytesPerPage = Math.max(1, bestBytes!.length / lo);
    cursor += lo;
    onProgress?.(
      0.05 + (cursor / pageCount) * 0.9,
      `Split ${cursor} of ${pageCount} page${pageCount === 1 ? '' : 's'} (${parts.length} part${parts.length === 1 ? '' : 's'})`,
    );
  }

  const names = buildPartFileNames(opts.sourceName, parts);
  const files: OutputFile[] = chunks.map((b, i) => ({ name: names[i], bytes: b }));
  onProgress?.(1, 'Done');
  return { files, parts, oversizedPages };
}
