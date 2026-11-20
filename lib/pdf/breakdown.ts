// Estimates how a PDF's file size is split across images, fonts, page content, metadata/attachments, and structure.
import { PDFArray, PDFDict, PDFDocument, PDFObject, PDFRawStream, PDFRef, PDFStream } from '@cantoo/pdf-lib';

import { N, nameOf } from './objects';

export type SizeBreakdownCategoryId = 'images' | 'fonts' | 'content' | 'metadata' | 'other';

export interface SizeBreakdownCategory {
  id: SizeBreakdownCategoryId;
  label: string;
  bytes: number;
  color: string;
}

export interface PdfSizeBreakdown {
  totalBytes: number;
  categories: SizeBreakdownCategory[];
}

function addRef(set: Set<PDFRef>, obj: PDFObject | undefined) {
  if (obj instanceof PDFRef) set.add(obj);
}

function objectByteSize(obj: PDFObject): number {
  if (obj instanceof PDFRawStream) return obj.contents.length;
  if (obj instanceof PDFStream) return obj.getContentsSize();
  try {
    return obj.sizeInBytes();
  } catch {
    return 0;
  }
}

export async function inspectPdfSizeBreakdown(bytes: Uint8Array, password?: string): Promise<PdfSizeBreakdown> {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false, password });
  const ctx = doc.context;

  const pageContentRefs = new Set<PDFRef>();
  const fontRefs = new Set<PDFRef>();
  const metadataRefs = new Set<PDFRef>();

  // 1. Collect page /Contents stream references.
  for (const page of doc.getPages()) {
    const contents = page.node.get(N('Contents'));
    if (contents instanceof PDFRef) {
      pageContentRefs.add(contents);
      const resolved = ctx.lookup(contents);
      if (resolved instanceof PDFArray) {
        for (const item of resolved.asArray()) addRef(pageContentRefs, item);
      }
    } else if (contents instanceof PDFArray) {
      for (const item of contents.asArray()) addRef(pageContentRefs, item);
    }
  }

  // 2. Collect trailer /Info ref.
  addRef(metadataRefs, ctx.trailerInfo.Info);

  // 3. Pre-pass indirect dicts to identify embedded font streams and metadata/attachment streams referenced by dicts.
  const entries = ctx.enumerateIndirectObjects();
  for (const [ref, obj] of entries) {
    const dict = obj instanceof PDFDict ? obj : obj instanceof PDFStream ? obj.dict : null;
    if (!dict) continue;

    const type = nameOf(dict, 'Type');
    if (type === 'Font' || type === 'FontDescriptor') {
      fontRefs.add(ref);
      for (const key of ['FontFile', 'FontFile2', 'FontFile3', 'FontDescriptor', 'ToUnicode', 'CIDToGIDMap', 'CIDSet']) {
        addRef(fontRefs, dict.get(N(key)));
      }
      const descendants = dict.lookup(N('DescendantFonts'));
      if (descendants instanceof PDFArray) {
        for (const d of descendants.asArray()) addRef(fontRefs, d);
      }
    }

    addRef(metadataRefs, dict.get(N('Metadata')));

    const ef = dict.lookup(N('EF'));
    if (ef instanceof PDFDict) {
      for (const val of ef.values()) addRef(metadataRefs, val);
    }
  }

  // 4. Classify every indirect object into one bucket.
  let imageBytes = 0;
  let fontBytes = 0;
  let contentBytes = 0;
  let metadataBytes = 0;

  for (const [ref, obj] of entries) {
    const isStream = obj instanceof PDFStream;
    const dict = isStream ? obj.dict : obj instanceof PDFDict ? obj : null;
    const type = dict ? nameOf(dict, 'Type') : undefined;
    const subtype = dict ? nameOf(dict, 'Subtype') : undefined;

    // Cross-reference and object stream containers are counted under Structure & other.
    if (type === 'XRef' || type === 'ObjStm') continue;

    if (isStream && subtype === 'Image') {
      imageBytes += objectByteSize(obj);
      continue;
    }

    const isFont =
      fontRefs.has(ref) ||
      type === 'Font' ||
      type === 'FontDescriptor' ||
      type === 'FontFile' ||
      type === 'FontFile2' ||
      type === 'FontFile3' ||
      (type !== undefined && /^CIDFontType/i.test(type)) ||
      (subtype !== undefined && (/^CIDFontType/i.test(subtype) || subtype === 'Type1C' || subtype === 'OpenType'));

    if (isFont) {
      fontBytes += objectByteSize(obj);
      continue;
    }

    if (pageContentRefs.has(ref) || (isStream && subtype === 'Form')) {
      contentBytes += objectByteSize(obj);
      continue;
    }

    if (metadataRefs.has(ref) || type === 'Metadata' || type === 'EmbeddedFile') {
      metadataBytes += objectByteSize(obj);
      continue;
    }
  }

  const sumCategorized = imageBytes + fontBytes + contentBytes + metadataBytes;
  const otherBytes = Math.max(0, bytes.length - sumCategorized);

  return {
    totalBytes: bytes.length,
    categories: [
      { id: 'images', label: 'Images', bytes: imageBytes, color: '#4da3ff' },
      { id: 'fonts', label: 'Fonts', bytes: fontBytes, color: '#f0a83a' },
      { id: 'content', label: 'Page content', bytes: contentBytes, color: '#6fdc9c' },
      { id: 'metadata', label: 'Metadata & attachments', bytes: metadataBytes, color: '#b894ff' },
      { id: 'other', label: 'Structure & other', bytes: otherBytes, color: '#888888' },
    ],
  };
}
