import { degrees, PDFDocument } from '@cantoo/pdf-lib';

import { baseName, nextFrame, OutputFile } from './files';

export type PageSpec =
  | { kind: 'page'; sourceIndex: number; pageIndex: number; rotation?: number }
  | { kind: 'blank'; width: number; height: number };

export interface LoadSource {
  bytes: Uint8Array;
  password?: string;
}

export function normalizeRotation(deg: number): 0 | 90 | 180 | 270 {
  const n = ((Math.round(deg / 90) * 90) % 360 + 360) % 360;
  return n as 0 | 90 | 180 | 270;
}

// Formats a set or list of zero-based page indices into compact 1-based ranges like "1-3, 5, 8-10".
export function formatPageRanges(indices: Iterable<number>): string {
  const sorted = Array.from(new Set(indices)).sort((a, b) => a - b);
  if (!sorted.length) return '';
  const parts: string[] = [];
  let start = sorted[0];
  let prev = sorted[0];
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === prev + 1) {
      prev = sorted[i];
    } else {
      parts.push(start === prev ? `${start + 1}` : `${start + 1}-${prev + 1}`);
      start = prev = sorted[i];
    }
  }
  parts.push(start === prev ? `${start + 1}` : `${start + 1}-${prev + 1}`);
  return parts.join(', ');
}

// Builds a new PDF from an arbitrary sequence of source pages (from one or more PDFs) and blank pages.
// Copies all needed pages from each source in a single `copyPages` call so shared resources (fonts,
// images) are not duplicated inside the output PDF.
export async function buildPdfFromPages(
  sources: LoadSource[],
  pages: PageSpec[],
  onProgress?: (fraction: number, label: string) => void,
): Promise<Uint8Array> {
  if (!pages.length) throw new Error('No pages to save.');
  const out = await PDFDocument.create();

  // Group page requests per source so each source PDF is parsed and copied once.
  const perSource = new Map<number, { outPos: number; pageIndex: number; rotation: number }[]>();
  pages.forEach((spec, outPos) => {
    if (spec.kind !== 'page') return;
    let list = perSource.get(spec.sourceIndex);
    if (!list) {
      list = [];
      perSource.set(spec.sourceIndex, list);
    }
    list.push({ outPos, pageIndex: spec.pageIndex, rotation: spec.rotation ?? 0 });
  });

  const resolved: Array<{ kind: 'copied'; page: ReturnType<PDFDocument['addPage']> } | { kind: 'blank'; width: number; height: number }> =
    new Array(pages.length);

  pages.forEach((spec, i) => {
    if (spec.kind === 'blank') resolved[i] = { kind: 'blank', width: spec.width, height: spec.height };
  });

  const sourceEntries = Array.from(perSource.entries());
  for (let s = 0; s < sourceEntries.length; s++) {
    const [sourceIndex, reqs] = sourceEntries[s];
    onProgress?.(s / Math.max(1, sourceEntries.length) * 0.8, `Reading PDF ${s + 1} of ${sourceEntries.length}`);
    await nextFrame();
    const src = await PDFDocument.load(sources[sourceIndex].bytes, {
      updateMetadata: false,
      password: sources[sourceIndex].password,
    });
    const copied = await out.copyPages(src, reqs.map((r) => r.pageIndex));
    for (let j = 0; j < reqs.length; j++) {
      const page = copied[j];
      const delta = normalizeRotation(reqs[j].rotation);
      if (delta !== 0) {
        const current = page.getRotation().angle;
        page.setRotation(degrees(normalizeRotation(current + delta)));
      }
      resolved[reqs[j].outPos] = { kind: 'copied', page };
    }
  }

  onProgress?.(0.85, 'Building PDF');
  await nextFrame();
  for (const item of resolved) {
    if (item.kind === 'copied') out.addPage(item.page);
    else out.addPage([item.width, item.height]);
  }
  onProgress?.(0.95, 'Writing PDF');
  await nextFrame();
  return out.save({ useObjectStreams: true, addDefaultPage: false, updateFieldAppearances: false });
}

// Rotates pages in-place so bookmarks, links, form fields and metadata are preserved losslessly.
export async function rotatePdf(
  bytes: Uint8Array,
  rotations: number[],
  opts?: { password?: string },
  onProgress?: (fraction: number, label: string) => void,
): Promise<Uint8Array> {
  onProgress?.(0.1, 'Reading PDF');
  await nextFrame();
  const doc = await PDFDocument.load(bytes, { updateMetadata: false, password: opts?.password });
  const pages = doc.getPages();
  for (let i = 0; i < pages.length; i++) {
    const delta = normalizeRotation(rotations[i] ?? 0);
    if (delta !== 0) {
      const current = pages[i].getRotation().angle;
      pages[i].setRotation(degrees(normalizeRotation(current + delta)));
    }
  }
  onProgress?.(0.8, 'Writing PDF');
  await nextFrame();
  return doc.save({ useObjectStreams: true, addDefaultPage: false, updateFieldAppearances: false });
}

// Removes the pages at zero-based `removeIndices`, keeping the rest in their original order.
export async function removePagesPdf(
  bytes: Uint8Array,
  removeIndices: Set<number>,
  opts?: { password?: string },
  onProgress?: (fraction: number, label: string) => void,
): Promise<{ bytes: Uint8Array; keptPages: number }> {
  onProgress?.(0.1, 'Reading PDF');
  await nextFrame();
  const src = await PDFDocument.load(bytes, { updateMetadata: false, password: opts?.password });
  const keep = src.getPageIndices().filter((i) => !removeIndices.has(i));
  if (!keep.length) throw new Error('Cannot remove every page from the PDF.');
  const out = await PDFDocument.create();
  onProgress?.(0.45, `Copying ${keep.length} pages`);
  await nextFrame();
  const copied = await out.copyPages(src, keep);
  for (const page of copied) out.addPage(page);
  onProgress?.(0.85, 'Writing PDF');
  await nextFrame();
  const saved = await out.save({ useObjectStreams: true, addDefaultPage: false, updateFieldAppearances: false });
  return { bytes: saved, keptPages: keep.length };
}

// Extracts the zero-based `keepIndices` either into one combined PDF or into one PDF per page.
export async function extractPagesPdf(
  bytes: Uint8Array,
  keepIndices: number[],
  opts: { separate: boolean; sourceName: string; outputName?: string; password?: string },
  onProgress?: (fraction: number, label: string) => void,
): Promise<OutputFile[]> {
  if (!keepIndices.length) throw new Error('Select at least one page to extract.');
  onProgress?.(0.05, 'Reading PDF');
  await nextFrame();
  const src = await PDFDocument.load(bytes, { updateMetadata: false, password: opts.password });
  const stem = baseName(opts.sourceName);

  if (!opts.separate) {
    const out = await PDFDocument.create();
    onProgress?.(0.4, `Copying ${keepIndices.length} pages`);
    await nextFrame();
    const copied = await out.copyPages(src, keepIndices);
    for (const page of copied) out.addPage(page);
    onProgress?.(0.85, 'Writing PDF');
    await nextFrame();
    const saved = await out.save({ useObjectStreams: true, addDefaultPage: false, updateFieldAppearances: false });
    const name = opts.outputName ? `${opts.outputName.replace(/\.pdf$/i, '')}.pdf` : `${stem}-extracted.pdf`;
    return [{ name, bytes: saved }];
  }

  const files: OutputFile[] = [];
  const width = String(src.getPageCount()).length;
  for (let i = 0; i < keepIndices.length; i++) {
    const idx = keepIndices[i];
    onProgress?.((i / keepIndices.length) * 0.9 + 0.05, `Page ${idx + 1} (${i + 1} of ${keepIndices.length})`);
    await nextFrame();
    const out = await PDFDocument.create();
    const [copied] = await out.copyPages(src, [idx]);
    out.addPage(copied);
    const saved = await out.save({ useObjectStreams: true, addDefaultPage: false, updateFieldAppearances: false });
    files.push({
      name: `${stem}-p${String(idx + 1).padStart(width, '0')}.pdf`,
      bytes: saved,
    });
  }
  return files;
}
