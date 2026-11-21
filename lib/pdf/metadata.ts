// Read and edit PDF document metadata (/Info dictionary standard & custom fields, plus XMP stream control).
import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFStream, PDFString } from '@cantoo/pdf-lib';

import { N, removeUnusedObjects } from './objects';

export interface CustomMetadataField {
  key: string;
  value: string;
}

export interface PdfMetadata {
  title: string;
  author: string;
  subject: string;
  keywords: string;
  creator: string;
  producer: string;
  creationDate: string | null;
  modificationDate: string | null;
  hasXmp: boolean;
  customFields: CustomMetadataField[];
}

export interface PdfMetadataEdit {
  title?: string;
  author?: string;
  subject?: string;
  keywords?: string;
  creator?: string;
  producer?: string;
  /** ISO date string to set, null or '' to clear, undefined to preserve existing value. */
  creationDate?: string | null;
  /** ISO date string to set, null or '' to clear, undefined to preserve existing value. */
  modificationDate?: string | null;
  /** When provided, replaces all custom (non-standard) string entries in /Info. */
  customFields?: CustomMetadataField[];
  /** Strip stale catalog /Metadata XMP stream so readers reflect updated /Info values. Default true. */
  clearXmp?: boolean;
}

const STANDARD_INFO_KEYS = new Set([
  'Title',
  'Author',
  'Subject',
  'Keywords',
  'Creator',
  'Producer',
  'CreationDate',
  'ModDate',
  'Trapped',
]);

function readKeywords(doc: PDFDocument, info: PDFDict | undefined): string {
  const fromApi = doc.getKeywords();
  if (typeof fromApi === 'string') return fromApi;
  if (!info) return '';
  const raw = info.lookup(N('Keywords'));
  if (raw instanceof PDFString || raw instanceof PDFHexString) return raw.decodeText();
  if (raw instanceof PDFArray) {
    return raw
      .asArray()
      .map((item) => {
        const val = doc.context.lookup(item);
        return val instanceof PDFString || val instanceof PDFHexString ? val.decodeText() : '';
      })
      .filter(Boolean)
      .join(', ');
  }
  return '';
}

function dateToIso(date: Date | undefined): string | null {
  if (!date || Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

/**
 * Reads standard /Info fields, dates, XMP presence, and custom string entries from a PDF.
 */
export async function readPdfMetadata(bytes: Uint8Array, password?: string): Promise<PdfMetadata> {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false, password });
  const infoObj = doc.context.lookup(doc.context.trailerInfo.Info);
  const info = infoObj instanceof PDFDict ? infoObj : undefined;

  const customFields: CustomMetadataField[] = [];
  if (info) {
    for (const [keyName, valObj] of info.entries()) {
      const key = keyName.decodeText();
      if (STANDARD_INFO_KEYS.has(key)) continue;
      const val = doc.context.lookup(valObj);
      if (val instanceof PDFString || val instanceof PDFHexString) {
        customFields.push({ key, value: val.decodeText() });
      }
    }
  }

  const hasXmp = doc.catalog.lookup(N('Metadata')) instanceof PDFStream;

  return {
    title: doc.getTitle() ?? '',
    author: doc.getAuthor() ?? '',
    subject: doc.getSubject() ?? '',
    keywords: readKeywords(doc, info),
    creator: doc.getCreator() ?? '',
    producer: doc.getProducer() ?? '',
    creationDate: dateToIso(doc.getCreationDate()),
    modificationDate: dateToIso(doc.getModificationDate()),
    hasXmp,
    customFields,
  };
}

/**
 * Updates /Info metadata fields (standard and custom), dates, and optionally strips stale XMP metadata.
 */
export async function writePdfMetadata(
  bytes: Uint8Array,
  fields: PdfMetadataEdit,
  password?: string,
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false, password });
  const ctx = doc.context;

  let infoObj = ctx.lookup(ctx.trailerInfo.Info);
  let info: PDFDict;
  if (infoObj instanceof PDFDict) {
    info = infoObj;
  } else {
    info = ctx.obj({});
    ctx.trailerInfo.Info = ctx.register(info);
  }

  const setOrClearText = (key: string, value: string | undefined, setter?: (v: string) => void) => {
    if (value === undefined) return;
    if (value === '') {
      info.delete(N(key));
    } else if (setter) {
      setter(value);
    } else {
      info.set(N(key), PDFHexString.fromText(value));
    }
  };

  setOrClearText('Title', fields.title, (v) => doc.setTitle(v));
  setOrClearText('Author', fields.author, (v) => doc.setAuthor(v));
  setOrClearText('Subject', fields.subject, (v) => doc.setSubject(v));
  // Write Keywords directly as a single string so comma/semicolon separation is preserved verbatim.
  setOrClearText('Keywords', fields.keywords);
  setOrClearText('Creator', fields.creator, (v) => doc.setCreator(v));
  setOrClearText('Producer', fields.producer, (v) => doc.setProducer(v));

  if (fields.creationDate !== undefined) {
    if (fields.creationDate === null || fields.creationDate.trim() === '') {
      info.delete(N('CreationDate'));
    } else {
      const parsed = new Date(fields.creationDate);
      if (Number.isNaN(parsed.getTime())) {
        throw new Error(`Invalid creation date: "${fields.creationDate}".`);
      }
      doc.setCreationDate(parsed);
    }
  }

  if (fields.modificationDate !== undefined) {
    if (fields.modificationDate === null || fields.modificationDate.trim() === '') {
      info.delete(N('ModDate'));
    } else {
      const parsed = new Date(fields.modificationDate);
      if (Number.isNaN(parsed.getTime())) {
        throw new Error(`Invalid modification date: "${fields.modificationDate}".`);
      }
      doc.setModificationDate(parsed);
    }
  }

  if (fields.customFields !== undefined) {
    // Remove all previous non-standard keys before setting the updated list.
    for (const [keyName] of info.entries()) {
      const key = keyName.decodeText();
      if (!STANDARD_INFO_KEYS.has(key)) {
        info.delete(keyName);
      }
    }
    for (const entry of fields.customFields) {
      const cleanKey = entry.key.trim();
      if (!cleanKey || STANDARD_INFO_KEYS.has(cleanKey) || entry.value === '') continue;
      info.set(N(cleanKey), PDFHexString.fromText(entry.value));
    }
  }

  if (fields.clearXmp ?? true) {
    doc.catalog.delete(N('Metadata'));
  }

  if (info.entries().length === 0) {
    ctx.trailerInfo.Info = undefined;
  }

  removeUnusedObjects(ctx);
  return doc.save({
    useObjectStreams: true,
    addDefaultPage: false,
    updateFieldAppearances: false,
  });
}
