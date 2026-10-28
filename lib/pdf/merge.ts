import { PDFDocument } from '@cantoo/pdf-lib';

import { nextFrame } from './files';

export interface MergeInput {
  bytes: Uint8Array;
  // Zero-based page indices in output order, or null for every page.
  pages: number[] | null;
}

// Parses page selections such as "1-3, 5, 8-" (1-based, inclusive) into zero-based indices.
// "-4" means from the first page and "8-" to the last. Descending ranges ("5-1") give reversed pages.
export function parsePageRanges(text: string, pageCount: number): number[] {
  const out: number[] = [];
  for (const raw of text.split(/[,;]/)) {
    const part = raw.trim().toLowerCase();
    if (!part) continue;
    const m = /^(\d+|end)?\s*(-\s*(\d+|end)?)?$/.exec(part);
    if (!m || (!m[1] && !m[2])) throw new Error(`"${raw.trim()}" is not a page or a range of pages.`);
    const num = (s: string | undefined, dflt: number) => (s === undefined ? dflt : s === 'end' ? pageCount : Number(s));
    const from = num(m[1], 1);
    const to = m[2] ? num(m[3], pageCount) : from;
    for (const p of [from, to]) {
      if (p < 1 || p > pageCount) throw new Error(`Page ${p} does not exist; the document has ${pageCount} page${pageCount === 1 ? '' : 's'}.`);
    }
    const step = from <= to ? 1 : -1;
    for (let p = from; p !== to + step; p += step) out.push(p - 1);
  }
  if (!out.length) throw new Error('No pages selected.');
  return out;
}

export async function mergePdfs(inputs: MergeInput[], onProgress?: (done: number, total: number) => void): Promise<Uint8Array> {
  const out = await PDFDocument.create();
  for (let i = 0; i < inputs.length; i++) {
    onProgress?.(i, inputs.length);
    await nextFrame();
    const src = await PDFDocument.load(inputs[i].bytes, { updateMetadata: false });
    const pages = await out.copyPages(src, inputs[i].pages ?? src.getPageIndices());
    for (const page of pages) out.addPage(page);
  }
  onProgress?.(inputs.length, inputs.length);
  return out.save();
}
