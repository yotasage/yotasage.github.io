// DOM-free PDF compression helpers: content-stream image display-size measurement,
// duplicate image/font object deduplication, CMYK/Indexed/16-bit image decoding,
// and grayscale / 1-bit Otsu-thresholded Flate stream encoding.
import {
  decodePDFRawStream,
  PDFArray,
  PDFBool,
  PDFContext,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFNull,
  PDFNumber,
  PDFObject,
  PDFRawStream,
  PDFRef,
  PDFStream,
  PDFString,
} from '@cantoo/pdf-lib';
import { unzlibSync, zlibSync } from 'fflate';

import { decodeRawImageBytes, unpredict } from './imageDecode';
import { filterNames, N, num, walkDicts } from './objects';

export interface ImageDisplaySize {
  widthPt: number;
  heightPt: number;
}

export interface DeduplicationResult {
  duplicateImagesMerged: number;
  duplicateFontsMerged: number;
}

export interface DecodedRgbaImage {
  rgba: Uint8ClampedArray;
  width: number;
  height: number;
  originalSpace: string;
}

type Matrix6 = [number, number, number, number, number, number];

const IDENTITY_MATRIX: Matrix6 = [1, 0, 0, 1, 0, 0];
const RAW_FILTERS = new Set(['FlateDecode', 'LZWDecode', 'ASCII85Decode', 'ASCIIHexDecode', 'RunLengthDecode']);

function refKey(ref: PDFRef): string {
  return `${ref.objectNumber}:${ref.generationNumber}`;
}

function mulMatrix(m1: Matrix6, m2: Matrix6): Matrix6 {
  return [
    m1[0] * m2[0] + m1[1] * m2[2],
    m1[0] * m2[1] + m1[1] * m2[3],
    m1[2] * m2[0] + m1[3] * m2[2],
    m1[2] * m2[1] + m1[3] * m2[3],
    m1[4] * m2[0] + m1[5] * m2[2] + m2[4],
    m1[4] * m2[1] + m1[5] * m2[3] + m2[5],
  ];
}

// ---------------------------------------------------------------------------
// Content stream decoding & tokenizer for CTM / Do tracking
// ---------------------------------------------------------------------------

function decodeStreamBytes(stream: PDFStream): Uint8Array | null {
  if (stream instanceof PDFRawStream) {
    const filters = filterNames(stream.dict);
    if (!filters) return null;
    if (filters.length === 0) return stream.contents;
    if (filters.length === 1 && filters[0] === 'FlateDecode' && !stream.dict.has(N('DecodeParms'))) {
      try {
        return unzlibSync(stream.contents);
      } catch {
        // Fall through to pdf-lib decoder in case of trailing garbage or raw deflate quirks.
      }
    }
    try {
      return decodePDFRawStream(stream).decode();
    } catch {
      return null;
    }
  }
  try {
    return stream.getContents();
  } catch {
    return null;
  }
}

function isWhitespaceByte(b: number): boolean {
  return b === 0x00 || b === 0x09 || b === 0x0a || b === 0x0c || b === 0x0d || b === 0x20;
}

function isDelimiterByte(b: number): boolean {
  return (
    b === 0x28 || // (
    b === 0x29 || // )
    b === 0x3c || // <
    b === 0x3e || // >
    b === 0x5b || // [
    b === 0x5d || // ]
    b === 0x7b || // {
    b === 0x7d || // }
    b === 0x2f || // /
    b === 0x25 // %
  );
}

function bytesToAscii(bytes: Uint8Array, start: number, end: number): string {
  let out = '';
  for (let i = start; i < end; i++) out += String.fromCharCode(bytes[i]);
  return out;
}

function decodePdfNameEscapes(raw: string): string {
  if (!raw.includes('#')) return raw;
  return raw.replace(/#([0-9a-fA-F]{2})/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
}

function skipInlineImage(bytes: Uint8Array, start: number): number {
  const len = bytes.length;
  let i = start;
  while (i < len) {
    // Look for ID followed by a single whitespace byte.
    if (
      bytes[i] === 0x49 && // I
      i + 2 < len &&
      bytes[i + 1] === 0x44 && // D
      isWhitespaceByte(bytes[i + 2]) &&
      (i === start || isWhitespaceByte(bytes[i - 1]) || isDelimiterByte(bytes[i - 1]))
    ) {
      i += 3;
      break;
    }
    i++;
  }
  // Scan until EI preceded by whitespace and followed by whitespace/delimiter/EOF.
  while (i + 1 < len) {
    if (
      bytes[i] === 0x45 && // E
      bytes[i + 1] === 0x49 && // I
      isWhitespaceByte(bytes[i - 1]) &&
      (i + 2 >= len || isWhitespaceByte(bytes[i + 2]) || isDelimiterByte(bytes[i + 2]))
    ) {
      return i + 2;
    }
    i++;
  }
  return len;
}

interface ContentToken {
  kind: 'number' | 'name' | 'keyword' | 'other';
  text: string;
  rawText?: string;
  numValue?: number;
}

function tokenizeContentStream(bytes: Uint8Array): ContentToken[] {
  const tokens: ContentToken[] = [];
  const len = bytes.length;
  let i = 0;

  while (i < len) {
    const b = bytes[i];
    if (isWhitespaceByte(b)) {
      i++;
      continue;
    }
    // Comment % ... EOL
    if (b === 0x25) {
      i++;
      while (i < len && bytes[i] !== 0x0a && bytes[i] !== 0x0d) i++;
      continue;
    }
    // Literal string (...)
    if (b === 0x28) {
      i++;
      let depth = 1;
      while (i < len && depth > 0) {
        const ch = bytes[i++];
        if (ch === 0x5c) {
          if (i < len) i++;
        } else if (ch === 0x28) {
          depth++;
        } else if (ch === 0x29) {
          depth--;
        }
      }
      tokens.push({ kind: 'other', text: '()' });
      continue;
    }
    // Hex string <...> or dict <<...>>
    if (b === 0x3c) {
      if (i + 1 < len && bytes[i + 1] === 0x3c) {
        i += 2;
        tokens.push({ kind: 'other', text: '<<' });
      } else {
        i++;
        while (i < len && bytes[i] !== 0x3e) i++;
        if (i < len) i++;
        tokens.push({ kind: 'other', text: '<>' });
      }
      continue;
    }
    if (b === 0x3e && i + 1 < len && bytes[i + 1] === 0x3e) {
      i += 2;
      tokens.push({ kind: 'other', text: '>>' });
      continue;
    }
    // Single-char delimiters: [ ] { } ) >
    if (b === 0x5b || b === 0x5d || b === 0x7b || b === 0x7d || b === 0x29 || b === 0x3e) {
      i++;
      tokens.push({ kind: 'other', text: String.fromCharCode(b) });
      continue;
    }
    // Name /Foo
    if (b === 0x2f) {
      const start = ++i;
      while (i < len && !isWhitespaceByte(bytes[i]) && !isDelimiterByte(bytes[i])) i++;
      const rawText = bytesToAscii(bytes, start, i);
      tokens.push({ kind: 'name', text: decodePdfNameEscapes(rawText), rawText });
      continue;
    }
    // Number, boolean, null, or operator keyword
    const start = i;
    while (i < len && !isWhitespaceByte(bytes[i]) && !isDelimiterByte(bytes[i])) i++;
    const text = bytesToAscii(bytes, start, i);
    if (text === 'BI') {
      i = skipInlineImage(bytes, i);
      tokens.push({ kind: 'other', text: 'BI' });
      continue;
    }
    if (/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(text)) {
      const n = Number(text);
      if (Number.isFinite(n)) {
        tokens.push({ kind: 'number', text, numValue: n });
        continue;
      }
    }
    if (text === 'true' || text === 'false' || text === 'null') {
      tokens.push({ kind: 'other', text });
    } else {
      tokens.push({ kind: 'keyword', text });
    }
  }

  return tokens;
}

function resolvePageResources(pageDict: PDFDict, context: PDFContext): PDFDict | undefined {
  let cur: PDFDict | undefined = pageDict;
  let guard = 0;
  while (cur && guard++ < 32) {
    const res = cur.lookup(N('Resources'));
    if (res instanceof PDFDict) return res;
    const parent = cur.lookup(N('Parent'));
    cur = parent instanceof PDFDict ? parent : undefined;
  }
  return undefined;
}

function readMatrix(dict: PDFDict, context: PDFContext): Matrix6 {
  const arr = dict.lookup(N('Matrix'));
  if (!(arr instanceof PDFArray) || arr.size() < 6) return IDENTITY_MATRIX;
  const vals: number[] = [];
  for (let i = 0; i < 6; i++) {
    const item = context.lookup(arr.get(i));
    if (!(item instanceof PDFNumber)) return IDENTITY_MATRIX;
    vals.push(item.asNumber());
  }
  return [vals[0], vals[1], vals[2], vals[3], vals[4], vals[5]];
}

function concatStreamsWithNewlines(parts: Uint8Array[]): Uint8Array {
  if (parts.length === 1) return parts[0];
  let total = 0;
  for (let i = 0; i < parts.length; i++) total += parts[i].length + (i > 0 ? 1 : 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (let i = 0; i < parts.length; i++) {
    if (i > 0) out[offset++] = 0x0a;
    out.set(parts[i], offset);
    offset += parts[i].length;
  }
  return out;
}

function scanContentStreamForImages(
  bytes: Uint8Array,
  resources: PDFDict | undefined,
  initialCtm: Matrix6,
  context: PDFContext,
  sizes: Map<PDFRef, ImageDisplaySize>,
  sizesByKey: Map<string, { ref: PDFRef; size: ImageDisplaySize }>,
  activeForms: Set<string>,
  budget: { formVisits: number },
  depth: number,
) {
  const tokens = tokenizeContentStream(bytes);
  const operands: ContentToken[] = [];
  const stack: Matrix6[] = [];
  let ctm: Matrix6 = [...initialCtm];

  const xobjDictObj = resources?.lookup(N('XObject'));
  const xobjDict = xobjDictObj instanceof PDFDict ? xobjDictObj : undefined;

  for (const tok of tokens) {
    if (tok.kind !== 'keyword') {
      operands.push(tok);
      continue;
    }

    const op = tok.text;
    if (op === 'q') {
      stack.push([ctm[0], ctm[1], ctm[2], ctm[3], ctm[4], ctm[5]]);
    } else if (op === 'Q') {
      const prev = stack.pop();
      if (prev) ctm = prev;
    } else if (op === 'cm' && operands.length >= 6) {
      const base = operands.length - 6;
      const a = operands[base];
      const b = operands[base + 1];
      const c = operands[base + 2];
      const d = operands[base + 3];
      const e = operands[base + 4];
      const f = operands[base + 5];
      if (
        a.kind === 'number' &&
        b.kind === 'number' &&
        c.kind === 'number' &&
        d.kind === 'number' &&
        e.kind === 'number' &&
        f.kind === 'number'
      ) {
        ctm = mulMatrix(
          [a.numValue!, b.numValue!, c.numValue!, d.numValue!, e.numValue!, f.numValue!],
          ctm,
        );
      }
    } else if (op === 'Do' && operands.length >= 1 && xobjDict) {
      const nameTok = operands[operands.length - 1];
      if (nameTok.kind === 'name') {
        let entry = xobjDict.get(N(nameTok.text));
        if (entry === undefined && nameTok.rawText && nameTok.rawText !== nameTok.text) {
          entry = xobjDict.get(N(nameTok.rawText));
        }
        const ref = entry instanceof PDFRef ? entry : undefined;
        const target = entry ? context.lookup(entry) : undefined;
        if (target instanceof PDFStream) {
          const subtype = target.dict.lookup(N('Subtype'));
          if (subtype === N('Image') && ref) {
            const widthPt = Math.hypot(ctm[0], ctm[1]);
            const heightPt = Math.hypot(ctm[2], ctm[3]);
            if (widthPt > 0 && heightPt > 0) {
              const key = refKey(ref);
              const existing = sizesByKey.get(key);
              if (existing) {
                existing.size.widthPt = Math.max(existing.size.widthPt, widthPt);
                existing.size.heightPt = Math.max(existing.size.heightPt, heightPt);
              } else {
                const entrySize: ImageDisplaySize = { widthPt, heightPt };
                sizes.set(ref, entrySize);
                sizesByKey.set(key, { ref, size: entrySize });
              }
            }
          } else if (subtype === N('Form') && depth < 16 && budget.formVisits < 2000) {
            const formKey = ref ? refKey(ref) : null;
            if (!formKey || !activeForms.has(formKey)) {
              const formBytes = decodeStreamBytes(target);
              if (formBytes) {
                budget.formVisits++;
                const formMatrix = readMatrix(target.dict, context);
                const formCtm = mulMatrix(formMatrix, ctm);
                const formResObj = target.dict.lookup(N('Resources'));
                const formResources = formResObj instanceof PDFDict ? formResObj : resources;
                if (formKey) activeForms.add(formKey);
                try {
                  scanContentStreamForImages(
                    formBytes,
                    formResources,
                    formCtm,
                    context,
                    sizes,
                    sizesByKey,
                    activeForms,
                    budget,
                    depth + 1,
                  );
                } finally {
                  if (formKey) activeForms.delete(formKey);
                }
              }
            }
          }
        }
      }
    }

    operands.length = 0;
  }
}

/**
 * Parses page content streams (and nested Form XObjects) to measure the maximum on-page
 * display size (in PDF points) of every referenced Image XObject.
 */
export function measureImageDisplaySizes(doc: PDFDocument): Map<PDFRef, ImageDisplaySize> {
  const sizes = new Map<PDFRef, ImageDisplaySize>();
  const sizesByKey = new Map<string, { ref: PDFRef; size: ImageDisplaySize }>();
  const context = doc.context;
  const budget = { formVisits: 0 };

  for (const page of doc.getPages()) {
    const pageDict = page.node;
    const resources = resolvePageResources(pageDict, context);
    const contents = pageDict.lookup(N('Contents'));
    if (!contents) continue;

    const parts: Uint8Array[] = [];
    if (contents instanceof PDFStream) {
      const decoded = decodeStreamBytes(contents);
      if (decoded) parts.push(decoded);
    } else if (contents instanceof PDFArray) {
      for (let i = 0; i < contents.size(); i++) {
        const item = context.lookup(contents.get(i));
        if (item instanceof PDFStream) {
          const decoded = decodeStreamBytes(item);
          if (decoded) parts.push(decoded);
        }
      }
    }
    if (parts.length === 0) continue;

    const combined = concatStreamsWithNewlines(parts);
    scanContentStreamForImages(
      combined,
      resources,
      IDENTITY_MATRIX,
      context,
      sizes,
      sizesByKey,
      new Set<string>(),
      budget,
      0,
    );
  }

  return sizes;
}

// ---------------------------------------------------------------------------
// Duplicate image & embedded font stream deduplication
// ---------------------------------------------------------------------------

function fnv1a32(bytes: Uint8Array): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i];
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function bytesToHex(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, '0');
  }
  return out;
}

function serializePdfObject(
  obj: PDFObject | undefined,
  context: PDFContext,
  resolveIndirect: boolean,
  depth = 0,
): string {
  if (obj === undefined || obj === PDFNull) return 'null';
  if (depth > 6) return 'deep';
  if (obj instanceof PDFRef) {
    if (resolveIndirect) {
      const target = context.lookup(obj);
      if (target) return serializePdfObject(target, context, true, depth + 1);
    }
    return `R(${obj.objectNumber}:${obj.generationNumber})`;
  }
  if (obj instanceof PDFName) return `N(${obj.decodeText()})`;
  if (obj instanceof PDFNumber) return `Num(${obj.asNumber()})`;
  if (obj instanceof PDFBool) return obj.asBoolean() ? 'true' : 'false';
  if (obj instanceof PDFString) return `S(${bytesToHex(obj.asBytes())})`;
  if (obj instanceof PDFHexString) return `H(${bytesToHex(obj.asBytes())})`;
  if (obj instanceof PDFArray) {
    const items: string[] = [];
    for (let i = 0; i < obj.size(); i++) {
      items.push(serializePdfObject(obj.get(i), context, resolveIndirect, depth + 1));
    }
    return `[${items.join(',')}]`;
  }
  if (obj instanceof PDFDict) {
    return serializeDict(obj, context, new Set<string>(), resolveIndirect, depth + 1);
  }
  if (obj instanceof PDFRawStream) {
    const meta = serializeDict(obj.dict, context, new Set(['Length']), false, depth + 1);
    return `Stream(${obj.contents.length}:${fnv1a32(obj.contents)}:${meta})`;
  }
  return obj.toString();
}

function serializeDict(
  dict: PDFDict,
  context: PDFContext,
  skipKeys: Set<string>,
  resolveColorSpace: boolean,
  depth = 0,
): string {
  const entries: Array<[string, PDFObject]> = [];
  for (const [k, v] of dict.entries()) {
    const name = k.decodeText();
    if (skipKeys.has(name)) continue;
    entries.push([name, v]);
  }
  entries.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return `{${entries
    .map(([k, v]) => `${k}:${serializePdfObject(v, context, resolveColorSpace && k === 'ColorSpace', depth + 1)}`)
    .join(',')}}`;
}

function replaceRefsInObject(obj: PDFObject, replacements: Map<string, PDFRef>) {
  if (obj instanceof PDFDict) {
    for (const [key, val] of obj.entries()) {
      if (val instanceof PDFRef) {
        const repl = replacements.get(refKey(val));
        if (repl) obj.set(key, repl);
      } else {
        replaceRefsInObject(val, replacements);
      }
    }
  } else if (obj instanceof PDFArray) {
    for (let i = 0; i < obj.size(); i++) {
      const val = obj.get(i);
      if (val instanceof PDFRef) {
        const repl = replacements.get(refKey(val));
        if (repl) obj.set(i, repl);
      } else {
        replaceRefsInObject(val, replacements);
      }
    }
  } else if (obj instanceof PDFStream) {
    replaceRefsInObject(obj.dict, replacements);
  }
}

function applyRefReplacements(context: PDFContext, replacements: Map<string, PDFRef>, dupRefs: PDFRef[]) {
  if (replacements.size === 0) return;
  for (const [, obj] of context.enumerateIndirectObjects()) {
    replaceRefsInObject(obj, replacements);
  }
  const canonicalKeys = new Set(Array.from(replacements.values(), refKey));
  for (const dupRef of dupRefs) {
    if (!canonicalKeys.has(refKey(dupRef))) {
      context.delete(dupRef);
    }
  }
}

function deduplicateImagePass(context: PDFContext): number {
  const skipKeys = new Set(['Length', 'Type']);
  const buckets = new Map<string, Array<{ ref: PDFRef; stream: PDFRawStream }>>();
  const replacements = new Map<string, PDFRef>();
  const dupRefs: PDFRef[] = [];

  for (const [ref, obj] of context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFRawStream) || obj.dict.lookup(N('Subtype')) !== N('Image')) continue;
    const dictSig = serializeDict(obj.dict, context, skipKeys, true);
    const key = `${dictSig}|${obj.contents.length}|${fnv1a32(obj.contents)}`;
    const list = buckets.get(key);
    if (!list) {
      buckets.set(key, [{ ref, stream: obj }]);
      continue;
    }
    const match = list.find((cand) => bytesEqual(cand.stream.contents, obj.contents));
    if (match) {
      replacements.set(refKey(ref), match.ref);
      dupRefs.push(ref);
    } else {
      list.push({ ref, stream: obj });
    }
  }

  applyRefReplacements(context, replacements, dupRefs);
  return dupRefs.length;
}

function deduplicateFontStreams(context: PDFContext): number {
  const fontRefs = new Map<string, PDFRef>();
  const fontKeys = ['FontFile', 'FontFile2', 'FontFile3'] as const;

  walkDicts(context, (dict) => {
    for (const key of fontKeys) {
      const entry = dict.get(N(key));
      if (entry instanceof PDFRef) {
        const target = context.lookup(entry);
        if (target instanceof PDFRawStream) {
          fontRefs.set(refKey(entry), entry);
        }
      }
    }
  });

  if (fontRefs.size < 2) return 0;

  const skipKeys = new Set(['Length']);
  const buckets = new Map<string, Array<{ ref: PDFRef; stream: PDFRawStream }>>();
  const replacements = new Map<string, PDFRef>();
  const dupRefs: PDFRef[] = [];

  for (const ref of fontRefs.values()) {
    const obj = context.lookup(ref);
    if (!(obj instanceof PDFRawStream)) continue;
    const dictSig = serializeDict(obj.dict, context, skipKeys, false);
    const key = `${dictSig}|${obj.contents.length}|${fnv1a32(obj.contents)}`;
    const list = buckets.get(key);
    if (!list) {
      buckets.set(key, [{ ref, stream: obj }]);
      continue;
    }
    const match = list.find((cand) => bytesEqual(cand.stream.contents, obj.contents));
    if (match) {
      replacements.set(refKey(ref), match.ref);
      dupRefs.push(ref);
    } else {
      list.push({ ref, stream: obj });
    }
  }

  applyRefReplacements(context, replacements, dupRefs);
  return dupRefs.length;
}

/**
 * Deduplicates byte-identical Image XObjects (including SMask cascades) and embedded font streams
 * (`/FontFile`, `/FontFile2`, `/FontFile3`), rewriting all references to the canonical object.
 */
export function deduplicateSharedObjects(doc: PDFDocument): DeduplicationResult {
  const context = doc.context;
  let duplicateImagesMerged = deduplicateImagePass(context);
  // A second pass catches images whose SMask/Mask refs became identical in pass 1.
  if (duplicateImagesMerged > 0) {
    duplicateImagesMerged += deduplicateImagePass(context);
  }
  const duplicateFontsMerged = deduplicateFontStreams(context);
  return { duplicateImagesMerged, duplicateFontsMerged };
}

// ---------------------------------------------------------------------------
// Broad image decoding: RGB, Gray, CMYK, ICCBased, CalRGB/CalGray, Indexed, 16-bit
// ---------------------------------------------------------------------------

type BaseColorKind = 'gray' | 'rgb' | 'cmyk';

interface ResolvedBaseSpace {
  kind: BaseColorKind;
  name: string;
}

interface ResolvedIndexedSpace {
  kind: 'indexed';
  name: 'Indexed';
  baseKind: BaseColorKind;
  hival: number;
  lookupBytes: Uint8Array;
}

type ResolvedColorSpace = ResolvedBaseSpace | ResolvedIndexedSpace;

function resolveBaseSpace(cs: PDFObject | undefined, context: PDFContext): ResolvedBaseSpace | null {
  const resolved = cs instanceof PDFRef ? context.lookup(cs) : cs;
  if (resolved instanceof PDFName) {
    const name = resolved.decodeText();
    if (name === 'DeviceRGB' || name === 'CalRGB' || name === 'RGB') return { kind: 'rgb', name };
    if (name === 'DeviceGray' || name === 'CalGray' || name === 'G') return { kind: 'gray', name };
    if (name === 'DeviceCMYK' || name === 'CMYK') return { kind: 'cmyk', name };
    return null;
  }
  if (resolved instanceof PDFArray && resolved.size() > 0) {
    const family = context.lookup(resolved.get(0));
    if (!(family instanceof PDFName)) return null;
    const name = family.decodeText();
    if (name === 'CalRGB') return { kind: 'rgb', name: 'CalRGB' };
    if (name === 'CalGray') return { kind: 'gray', name: 'CalGray' };
    if (name === 'ICCBased' && resolved.size() >= 2) {
      const profile = context.lookup(resolved.get(1));
      const n = profile instanceof PDFStream ? num(profile.dict, 'N', 0) : 0;
      if (n === 1) return { kind: 'gray', name: 'ICCBased' };
      if (n === 3) return { kind: 'rgb', name: 'ICCBased' };
      if (n === 4) return { kind: 'cmyk', name: 'ICCBased' };
    }
  }
  return null;
}

function resolveAnyColorSpace(cs: PDFObject | undefined, context: PDFContext): ResolvedColorSpace | null {
  const base = resolveBaseSpace(cs, context);
  if (base) return base;

  const resolved = cs instanceof PDFRef ? context.lookup(cs) : cs;
  if (!(resolved instanceof PDFArray) || resolved.size() < 4) return null;
  const family = context.lookup(resolved.get(0));
  if (!(family instanceof PDFName)) return null;
  const famName = family.decodeText();
  if (famName !== 'Indexed' && famName !== 'I') return null;

  const baseInfo = resolveBaseSpace(resolved.get(1), context);
  if (!baseInfo) return null;

  const hivalObj = context.lookup(resolved.get(2));
  const hival = hivalObj instanceof PDFNumber ? Math.max(0, Math.min(255, Math.floor(hivalObj.asNumber()))) : 255;

  const lookupObj = context.lookup(resolved.get(3));
  let lookupBytes: Uint8Array | null = null;
  if (lookupObj instanceof PDFRawStream) {
    lookupBytes = decodeStreamBytes(lookupObj);
  } else if (lookupObj instanceof PDFHexString) {
    lookupBytes = lookupObj.asBytes();
  } else if (lookupObj instanceof PDFString) {
    lookupBytes = lookupObj.asBytes();
  }
  if (!lookupBytes) return null;

  return {
    kind: 'indexed',
    name: 'Indexed',
    baseKind: baseInfo.kind,
    hival,
    lookupBytes,
  };
}

function unpredictAnyBpc(data: Uint8Array, parms: PDFDict | undefined): Uint8Array {
  const predictor = num(parms, 'Predictor', 1);
  if (predictor === 1) return data;
  const bpc = num(parms, 'BitsPerComponent', 8);
  if (predictor === 2 && bpc === 16) {
    const colors = num(parms, 'Colors', 1);
    const columns = num(parms, 'Columns', 1);
    const rowLen = columns * colors * 2;
    if (rowLen <= 0) return data;
    const out = data.slice();
    const step = colors * 2;
    for (let row = 0; row + rowLen <= out.length; row += rowLen) {
      for (let i = step; i + 1 < rowLen; i += 2) {
        const prev = (out[row + i - step] << 8) | out[row + i - step + 1];
        const cur = (out[row + i] << 8) | out[row + i + 1];
        const sum = (cur + prev) & 0xffff;
        out[row + i] = (sum >>> 8) & 0xff;
        out[row + i + 1] = sum & 0xff;
      }
    }
    return out;
  }
  return unpredict(data, parms);
}

function decodeRawBytesAnyBpc(stream: PDFRawStream, filters: string[], bpc: number): Uint8Array | null {
  if (filters.some((f) => !RAW_FILTERS.has(f))) return null;
  if (bpc === 8) return decodeRawImageBytes(stream, filters);
  try {
    let data = filters.length === 0 ? stream.contents : decodePDFRawStream(stream).decode();
    const parms = stream.dict.lookup(N('DecodeParms'));
    const lastParms = parms instanceof PDFArray
      ? (parms.size() > 0 ? stream.dict.context.lookup(parms.get(parms.size() - 1)) : undefined)
      : parms;
    data = unpredictAnyBpc(data, lastParms instanceof PDFDict ? lastParms : undefined);
    return data;
  } catch {
    return null;
  }
}

function readDecodeArray(dict: PDFDict, expectedComps: number): number[] | null {
  const arr = dict.lookup(N('Decode'));
  if (!(arr instanceof PDFArray) || arr.size() < expectedComps * 2) return null;
  const vals: number[] = [];
  for (let i = 0; i < expectedComps * 2; i++) {
    const item = dict.context.lookup(arr.get(i));
    if (!(item instanceof PDFNumber)) return null;
    vals.push(item.asNumber());
  }
  return vals;
}

function clampByte(v: number): number {
  const r = Math.round(v);
  return r <= 0 ? 0 : r >= 255 ? 255 : r;
}

function applyDecodeByte(sample01: number, decode: number[] | null, compIndex: number): number {
  if (!decode) return clampByte(sample01 * 255);
  const dMin = decode[compIndex * 2];
  const dMax = decode[compIndex * 2 + 1];
  return clampByte((dMin + sample01 * (dMax - dMin)) * 255);
}

function cmykByteToRgb(c: number, m: number, y: number, k: number): [number, number, number] {
  const invK = 255 - k;
  return [
    Math.round(((255 - c) * invK) / 255),
    Math.round(((255 - m) * invK) / 255),
    Math.round(((255 - y) * invK) / 255),
  ];
}

/**
 * Decodes raw/lossless-filtered PDF image streams across DeviceRGB, DeviceGray, DeviceCMYK,
 * ICCBased (1/3/4), CalGray, CalRGB, Indexed (1/2/4/8-bit), and 8/16-bit depths into RGBA.
 */
export function decodeAnyImageToRgba(stream: PDFRawStream, context: PDFContext): DecodedRgbaImage | null {
  const dict = stream.dict;
  const width = num(dict, 'Width', 0);
  const height = num(dict, 'Height', 0);
  if (width <= 0 || height <= 0) return null;

  const filters = filterNames(dict);
  if (!filters || filters.some((f) => !RAW_FILTERS.has(f))) return null;

  const space = resolveAnyColorSpace(dict.lookup(N('ColorSpace')), context);
  if (!space) return null;

  const bpc = num(dict, 'BitsPerComponent', 8);

  if (space.kind === 'indexed') {
    if (bpc !== 1 && bpc !== 2 && bpc !== 4 && bpc !== 8) return null;
    const raw = decodeRawBytesAnyBpc(stream, filters, bpc);
    if (!raw) return null;

    const rowBytes = Math.ceil((width * bpc) / 8);
    if (raw.length < rowBytes * height) return null;

    const baseComps = space.baseKind === 'gray' ? 1 : space.baseKind === 'rgb' ? 3 : 4;
    const lut = new Uint8Array(256 * 3);
    for (let idx = 0; idx <= space.hival; idx++) {
      const src = idx * baseComps;
      if (src + baseComps > space.lookupBytes.length) break;
      let r = 0;
      let g = 0;
      let b = 0;
      if (space.baseKind === 'gray') {
        r = g = b = space.lookupBytes[src];
      } else if (space.baseKind === 'rgb') {
        r = space.lookupBytes[src];
        g = space.lookupBytes[src + 1];
        b = space.lookupBytes[src + 2];
      } else {
        [r, g, b] = cmykByteToRgb(
          space.lookupBytes[src],
          space.lookupBytes[src + 1],
          space.lookupBytes[src + 2],
          space.lookupBytes[src + 3],
        );
      }
      lut[idx * 3] = r;
      lut[idx * 3 + 1] = g;
      lut[idx * 3 + 2] = b;
    }

    const rgba = new Uint8ClampedArray(width * height * 4);
    const mask = (1 << bpc) - 1;
    for (let y = 0; y < height; y++) {
      const rowStart = y * rowBytes;
      let dst = y * width * 4;
      for (let x = 0; x < width; x++) {
        let idx: number;
        if (bpc === 8) {
          idx = raw[rowStart + x];
        } else {
          const bitPos = x * bpc;
          const byte = raw[rowStart + (bitPos >> 3)];
          const shift = 8 - bpc - (bitPos & 7);
          idx = (byte >>> shift) & mask;
        }
        if (idx > space.hival) idx = space.hival;
        const p = idx * 3;
        rgba[dst] = lut[p];
        rgba[dst + 1] = lut[p + 1];
        rgba[dst + 2] = lut[p + 2];
        rgba[dst + 3] = 255;
        dst += 4;
      }
    }

    return { rgba, width, height, originalSpace: space.name };
  }

  // Direct Gray / RGB / CMYK spaces
  const comps = space.kind === 'gray' ? 1 : space.kind === 'rgb' ? 3 : 4;
  const decode = dict.has(N('Decode')) ? readDecodeArray(dict, comps) : null;

  if (bpc === 8) {
    const raw = decodeRawBytesAnyBpc(stream, filters, 8);
    if (!raw || raw.length < width * height * comps) return null;
    const rgba = new Uint8ClampedArray(width * height * 4);
    const pixels = width * height;
    for (let i = 0, s = 0, d = 0; i < pixels; i++, s += comps, d += 4) {
      if (space.kind === 'gray') {
        const g = decode ? applyDecodeByte(raw[s] / 255, decode, 0) : raw[s];
        rgba[d] = g;
        rgba[d + 1] = g;
        rgba[d + 2] = g;
      } else if (space.kind === 'rgb') {
        rgba[d] = decode ? applyDecodeByte(raw[s] / 255, decode, 0) : raw[s];
        rgba[d + 1] = decode ? applyDecodeByte(raw[s + 1] / 255, decode, 1) : raw[s + 1];
        rgba[d + 2] = decode ? applyDecodeByte(raw[s + 2] / 255, decode, 2) : raw[s + 2];
      } else {
        const c = decode ? applyDecodeByte(raw[s] / 255, decode, 0) : raw[s];
        const m = decode ? applyDecodeByte(raw[s + 1] / 255, decode, 1) : raw[s + 1];
        const y = decode ? applyDecodeByte(raw[s + 2] / 255, decode, 2) : raw[s + 2];
        const k = decode ? applyDecodeByte(raw[s + 3] / 255, decode, 3) : raw[s + 3];
        const [r, g, b] = cmykByteToRgb(c, m, y, k);
        rgba[d] = r;
        rgba[d + 1] = g;
        rgba[d + 2] = b;
      }
      rgba[d + 3] = 255;
    }
    return { rgba, width, height, originalSpace: space.name };
  }

  if (bpc === 16) {
    const raw = decodeRawBytesAnyBpc(stream, filters, 16);
    if (!raw || raw.length < width * height * comps * 2) return null;
    const rgba = new Uint8ClampedArray(width * height * 4);
    const pixels = width * height;
    const stride = comps * 2;
    for (let i = 0, s = 0, d = 0; i < pixels; i++, s += stride, d += 4) {
      if (space.kind === 'gray') {
        const v16 = (raw[s] << 8) | raw[s + 1];
        const g = decode ? applyDecodeByte(v16 / 65535, decode, 0) : Math.round(v16 / 257);
        rgba[d] = g;
        rgba[d + 1] = g;
        rgba[d + 2] = g;
      } else if (space.kind === 'rgb') {
        const r16 = (raw[s] << 8) | raw[s + 1];
        const g16 = (raw[s + 2] << 8) | raw[s + 3];
        const b16 = (raw[s + 4] << 8) | raw[s + 5];
        rgba[d] = decode ? applyDecodeByte(r16 / 65535, decode, 0) : Math.round(r16 / 257);
        rgba[d + 1] = decode ? applyDecodeByte(g16 / 65535, decode, 1) : Math.round(g16 / 257);
        rgba[d + 2] = decode ? applyDecodeByte(b16 / 65535, decode, 2) : Math.round(b16 / 257);
      } else {
        const c16 = (raw[s] << 8) | raw[s + 1];
        const m16 = (raw[s + 2] << 8) | raw[s + 3];
        const y16 = (raw[s + 4] << 8) | raw[s + 5];
        const k16 = (raw[s + 6] << 8) | raw[s + 7];
        const c = decode ? applyDecodeByte(c16 / 65535, decode, 0) : Math.round(c16 / 257);
        const m = decode ? applyDecodeByte(m16 / 65535, decode, 1) : Math.round(m16 / 257);
        const y = decode ? applyDecodeByte(y16 / 65535, decode, 2) : Math.round(y16 / 257);
        const k = decode ? applyDecodeByte(k16 / 65535, decode, 3) : Math.round(k16 / 257);
        const [r, g, b] = cmykByteToRgb(c, m, y, k);
        rgba[d] = r;
        rgba[d + 1] = g;
        rgba[d + 2] = b;
      }
      rgba[d + 3] = 255;
    }
    return { rgba, width, height, originalSpace: space.name };
  }

  // Sub-byte DeviceGray (1, 2, or 4 bits per component)
  if (space.kind === 'gray' && (bpc === 1 || bpc === 2 || bpc === 4)) {
    const raw = decodeRawBytesAnyBpc(stream, filters, bpc);
    const rowBytes = Math.ceil((width * bpc) / 8);
    if (!raw || raw.length < rowBytes * height) return null;
    const rgba = new Uint8ClampedArray(width * height * 4);
    const mask = (1 << bpc) - 1;
    for (let y = 0; y < height; y++) {
      const rowStart = y * rowBytes;
      let dst = y * width * 4;
      for (let x = 0; x < width; x++) {
        const bitPos = x * bpc;
        const byte = raw[rowStart + (bitPos >> 3)];
        const shift = 8 - bpc - (bitPos & 7);
        const level = (byte >>> shift) & mask;
        const g = decode ? applyDecodeByte(level / mask, decode, 0) : Math.round((level * 255) / mask);
        rgba[dst] = g;
        rgba[dst + 1] = g;
        rgba[dst + 2] = g;
        rgba[dst + 3] = 255;
        dst += 4;
      }
    }
    return { rgba, width, height, originalSpace: space.name };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Grayscale & 1-bit B&W (Otsu adaptive threshold) Flate PDF stream encoders
// ---------------------------------------------------------------------------

/**
 * Computes an adaptive binarization threshold (0..255) using Otsu's between-class variance method.
 * Pixels with luminance >= threshold are white (1); pixels < threshold are black (0).
 */
export function computeOtsuThreshold(gray: Uint8Array): number {
  const total = gray.length;
  if (total === 0) return 128;

  const hist = new Uint32Array(256);
  let sumAll = 0;
  for (let i = 0; i < total; i++) {
    const v = gray[i];
    hist[v]++;
    sumAll += v;
  }

  let wB = 0;
  let sumB = 0;
  let maxBetween = 0;
  let bestFirst = -1;
  let bestLast = -1;

  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;

    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sumAll - sumB) / wF;
    const diff = mB - mF;
    const between = wB * wF * diff * diff;

    if (between > maxBetween + 1e-9) {
      maxBetween = between;
      bestFirst = t;
      bestLast = t;
    } else if (bestFirst >= 0 && Math.abs(between - maxBetween) <= 1e-9) {
      bestLast = t;
    }
  }

  if (bestFirst < 0 || maxBetween <= 0) return 128;
  return Math.min(255, Math.max(1, Math.round((bestFirst + bestLast) / 2) + 1));
}

function rgbaToGrayBytes(rgba: Uint8ClampedArray, width: number, height: number): Uint8Array {
  const pixels = width * height;
  const gray = new Uint8Array(pixels);
  for (let i = 0, p = 0; i < pixels; i++, p += 4) {
    gray[i] = Math.round(0.2126 * rgba[p] + 0.7152 * rgba[p + 1] + 0.0722 * rgba[p + 2]);
  }
  return gray;
}

/**
 * Encodes RGBA pixels into a packed 1-bit MSB-first row-aligned `/DeviceGray` FlateDecode PDF stream.
 */
export function encodeRgbaTo1BitPdfStream(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  threshold?: number,
): { compressed: Uint8Array; threshold: number } {
  const gray = rgbaToGrayBytes(rgba, width, height);
  const usedThreshold =
    threshold !== undefined ? Math.max(0, Math.min(255, Math.round(threshold))) : computeOtsuThreshold(gray);

  const rowBytes = Math.ceil(width / 8);
  const packed = new Uint8Array(height * rowBytes);
  for (let y = 0; y < height; y++) {
    const rowSrc = y * width;
    const rowDst = y * rowBytes;
    for (let x = 0; x < width; x++) {
      if (gray[rowSrc + x] >= usedThreshold) {
        packed[rowDst + (x >> 3)] |= 0x80 >> (x & 7);
      }
    }
  }

  return {
    compressed: zlibSync(packed, { level: 9 }),
    threshold: usedThreshold,
  };
}

/**
 * Encodes RGBA pixels into an 8-bit `/DeviceGray` FlateDecode PDF stream (level 9).
 */
export function encodeRgbaToGray8PdfStream(rgba: Uint8ClampedArray, width: number, height: number): Uint8Array {
  const gray = rgbaToGrayBytes(rgba, width, height);
  return zlibSync(gray, { level: 9 });
}
