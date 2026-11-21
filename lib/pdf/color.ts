// Framework-free, DOM-free PDF grayscale conversion (vectors + embedded images) and pure RGBA pixel transforms.
import {
  decodePDFRawStream,
  PDFArray,
  PDFBool,
  PDFContext,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFNumber,
  PDFObject,
  PDFRawStream,
  PDFRef,
  PDFStream,
  PDFString,
} from '@cantoo/pdf-lib';
import { zlibSync } from 'fflate';

import { decodeRawImageBytes, unpredict } from './imageDecode';
import { filterNames, N, nameOf, num, removeUnusedObjects, walkDicts } from './objects';

export type JpegToGrayConverter = (
  jpegBytes: Uint8Array,
) => Promise<
  | { grayPixels: Uint8Array; width: number; height: number }
  | { jpegBytes: Uint8Array }
  | null
>;

export interface GrayscaleOptions {
  /** Optional hook (e.g. browser Canvas converter) for converting DCTDecode JPEG XObjects to grayscale. */
  convertJpegToGray?: JpegToGrayConverter;
}

export interface GrayscaleResult {
  bytes: Uint8Array;
  convertedImages: number;
  skippedJpegImages: number;
  rewrittenStreams: number;
  convertedOperators: number;
}

export type InvertMode = 'invert' | 'smart-dark' | 'warm-dark' | 'custom';
export type PixelTransformMode = InvertMode | 'grayscale';

export interface PixelTransformOptions {
  /** Target background hex color for 'custom' mode (default '#171717'). */
  backgroundHex?: string;
  /** Target foreground / ink hex color for 'custom' mode (default '#ededed'). */
  foregroundHex?: string;
  /** Blend saturated colors to preserve hue in 'custom' mode (default true). */
  preserveHue?: boolean;
}

const RAW_STREAM_FILTERS = new Set(['FlateDecode', 'LZWDecode', 'ASCII85Decode', 'ASCIIHexDecode', 'RunLengthDecode']);

function clamp01(v: number): number {
  return v <= 0 ? 0 : v >= 1 ? 1 : v;
}

function clampByte(v: number): number {
  const r = Math.round(v);
  return r <= 0 ? 0 : r >= 255 ? 255 : r;
}

function bt709Luminance01(r: number, g: number, b: number): number {
  return clamp01(0.2126 * clamp01(r) + 0.7152 * clamp01(g) + 0.0722 * clamp01(b));
}

function cmykToLuminance01(c: number, m: number, y: number, k: number): number {
  const cc = clamp01(c);
  const mm = clamp01(m);
  const yy = clamp01(y);
  const kk = clamp01(k);
  const r = (1 - cc) * (1 - kk);
  const g = (1 - mm) * (1 - kk);
  const b = (1 - yy) * (1 - kk);
  return bt709Luminance01(r, g, b);
}

function formatGrayNum(v: number): string {
  const c = clamp01(v);
  if (c < 1e-5) return '0';
  if (c > 1 - 1e-5) return '1';
  return Number(c.toFixed(4)).toString();
}

// ---------------------------------------------------------------------------
// Image XObject color space resolution & pixel conversion
// ---------------------------------------------------------------------------

type BaseColorKind = 'gray' | 'rgb' | 'cmyk' | 'other';

function resolveBaseColorSpace(cs: PDFObject | undefined, context: PDFContext): BaseColorKind {
  const resolved = cs instanceof PDFRef ? context.lookup(cs) : cs;
  if (resolved instanceof PDFName) {
    const name = resolved.decodeText();
    if (name === 'DeviceGray' || name === 'CalGray' || name === 'G') return 'gray';
    if (name === 'DeviceRGB' || name === 'CalRGB' || name === 'RGB') return 'rgb';
    if (name === 'DeviceCMYK' || name === 'CMYK') return 'cmyk';
    return 'other';
  }
  if (resolved instanceof PDFArray && resolved.size() > 0) {
    const family = context.lookup(resolved.get(0));
    if (!(family instanceof PDFName)) return 'other';
    const name = family.decodeText();
    if (name === 'CalGray') return 'gray';
    if (name === 'CalRGB') return 'rgb';
    if (name === 'ICCBased' && resolved.size() >= 2) {
      const profile = context.lookup(resolved.get(1));
      const n = profile instanceof PDFStream ? num(profile.dict, 'N', 0) : 0;
      if (n === 1) return 'gray';
      if (n === 3) return 'rgb';
      if (n === 4) return 'cmyk';
    }
  }
  return 'other';
}

interface IndexedPaletteInfo {
  baseKind: 'rgb' | 'cmyk' | 'gray';
  hival: number;
  lookupBytes: Uint8Array;
}

function resolveIndexedColorSpace(cs: PDFObject | undefined, context: PDFContext): IndexedPaletteInfo | null {
  const resolved = cs instanceof PDFRef ? context.lookup(cs) : cs;
  if (!(resolved instanceof PDFArray) || resolved.size() < 4) return null;
  const family = context.lookup(resolved.get(0));
  if (!(family instanceof PDFName)) return null;
  const fName = family.decodeText();
  if (fName !== 'Indexed' && fName !== 'I') return null;

  const baseKind = resolveBaseColorSpace(resolved.get(1), context);
  if (baseKind === 'other') return null;

  const hivalObj = context.lookup(resolved.get(2));
  const hival = hivalObj instanceof PDFNumber ? Math.max(0, Math.min(255, Math.floor(hivalObj.asNumber()))) : 255;

  const lookupObj = context.lookup(resolved.get(3));
  let lookupBytes: Uint8Array | null = null;
  if (lookupObj instanceof PDFRawStream) {
    const flts = filterNames(lookupObj.dict);
    if (!flts) return null;
    try {
      lookupBytes = flts.length === 0 ? lookupObj.contents : decodePDFRawStream(lookupObj).decode();
    } catch {
      return null;
    }
  } else if (lookupObj instanceof PDFHexString) {
    lookupBytes = lookupObj.asBytes();
  } else if (lookupObj instanceof PDFString) {
    lookupBytes = lookupObj.asBytes();
  }
  if (!lookupBytes) return null;

  return { baseKind, hival, lookupBytes };
}

function decodeRawWithAnyBpc(stream: PDFRawStream, filters: string[]): Uint8Array | null {
  if (filters.some((f) => !RAW_STREAM_FILTERS.has(f))) return null;
  try {
    let data = filters.length === 0 ? stream.contents : decodePDFRawStream(stream).decode();
    const parms = stream.dict.lookup(N('DecodeParms'));
    const lastParms = parms instanceof PDFArray
      ? (parms.size() > 0 ? stream.dict.context.lookup(parms.get(parms.size() - 1)) : undefined)
      : parms;
    data = unpredict(data, lastParms instanceof PDFDict ? lastParms : undefined);
    return data;
  } catch {
    return null;
  }
}

function readDecodePairs(dict: PDFDict, expectedComponents: number): number[] | null {
  const arr = dict.lookup(N('Decode'));
  if (!(arr instanceof PDFArray) || arr.size() < expectedComponents * 2) return null;
  const out: number[] = [];
  for (let i = 0; i < expectedComponents * 2; i++) {
    const v = dict.context.lookup(arr.get(i));
    if (!(v instanceof PDFNumber)) return null;
    out.push(v.asNumber());
  }
  return out;
}

function inspectJpegComponents(jpeg: Uint8Array): number | null {
  if (jpeg.length < 4 || jpeg[0] !== 0xff || jpeg[1] !== 0xd8) return null;
  let i = 2;
  while (i + 3 < jpeg.length) {
    if (jpeg[i] !== 0xff) {
      i++;
      continue;
    }
    while (i < jpeg.length && jpeg[i] === 0xff) i++;
    if (i >= jpeg.length) break;
    const marker = jpeg[i++];
    if (marker === 0xd9 || marker === 0xda) break; // EOI or SOS
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (i + 1 >= jpeg.length) break;
    const segLen = (jpeg[i] << 8) | jpeg[i + 1];
    if (segLen < 2 || i + segLen > jpeg.length) break;
    const isSof =
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf);
    if (isSof && segLen >= 8) {
      return jpeg[i + 7];
    }
    i += segLen;
  }
  return null;
}

function unpackIndexedPixels(
  raw: Uint8Array,
  width: number,
  height: number,
  bpc: number,
): Uint8Array | null {
  if (bpc === 8) {
    return raw.length >= width * height ? raw : null;
  }
  if (bpc !== 1 && bpc !== 2 && bpc !== 4) return null;
  const rowBytes = Math.ceil((width * bpc) / 8);
  if (raw.length < rowBytes * height) return null;
  const out = new Uint8Array(width * height);
  const mask = (1 << bpc) - 1;
  const perByte = 8 / bpc;
  for (let y = 0; y < height; y++) {
    const rowStart = y * rowBytes;
    const dstStart = y * width;
    for (let x = 0; x < width; x++) {
      const byteVal = raw[rowStart + Math.floor(x / perByte)];
      const shift = 8 - bpc * ((x % perByte) + 1);
      out[dstStart + x] = (byteVal >> shift) & mask;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Content stream tokenizer & color operator rewriter (pure Uint8Array / Latin-1)
// ---------------------------------------------------------------------------

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
    b === 0x25    // %
  );
}

function bytesToAscii(bytes: Uint8Array, start: number, end: number): string {
  let s = '';
  for (let i = start; i < end; i++) s += String.fromCharCode(bytes[i]);
  return s;
}

function asciiToBytes(str: string): Uint8Array {
  const out = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) out[i] = str.charCodeAt(i) & 0xff;
  return out;
}

interface StreamToken {
  kind: 'number' | 'name' | 'keyword' | 'other';
  start: number;
  end: number;
  text: string;
  numValue?: number;
}

function findInlineImageEnd(bytes: Uint8Array, afterBiPos: number): number {
  const len = bytes.length;
  let i = afterBiPos;
  // Scan dictionary tokens until keyword 'ID'
  while (i < len) {
    const b = bytes[i];
    if (isWhitespaceByte(b)) {
      i++;
      continue;
    }
    if (b === 0x25) {
      while (i < len && bytes[i] !== 0x0a && bytes[i] !== 0x0d) i++;
      continue;
    }
    if (b === 0x28) {
      i++;
      let depth = 1;
      while (i < len && depth > 0) {
        if (bytes[i] === 0x5c) {
          i += 2;
          continue;
        }
        if (bytes[i] === 0x28) depth++;
        else if (bytes[i] === 0x29) depth--;
        i++;
      }
      continue;
    }
    if (b === 0x3c && i + 1 < len && bytes[i + 1] !== 0x3c) {
      i++;
      while (i < len && bytes[i] !== 0x3e) i++;
      if (i < len) i++;
      continue;
    }
    if (b === 0x2f) {
      i++;
      while (i < len && !isWhitespaceByte(bytes[i]) && !isDelimiterByte(bytes[i])) i++;
      continue;
    }
    if (isDelimiterByte(b)) {
      i++;
      continue;
    }
    const start = i;
    while (i < len && !isWhitespaceByte(bytes[i]) && !isDelimiterByte(bytes[i])) i++;
    if (i - start === 2 && bytes[start] === 0x49 && bytes[start + 1] === 0x44) {
      // Found 'ID'. Skip a single whitespace byte (or \r\n).
      if (i < len && bytes[i] === 0x0d && i + 1 < len && bytes[i + 1] === 0x0a) {
        i += 2;
      } else if (i < len && isWhitespaceByte(bytes[i])) {
        i++;
      }
      break;
    }
  }

  // Scan binary payload for whitespace + 'EI' + (whitespace | delimiter | EOF) followed by plausible PDF bytes.
  while (i + 1 < len) {
    if (
      bytes[i] === 0x45 &&
      bytes[i + 1] === 0x49 &&
      (i === 0 || isWhitespaceByte(bytes[i - 1])) &&
      (i + 2 >= len || isWhitespaceByte(bytes[i + 2]) || isDelimiterByte(bytes[i + 2]))
    ) {
      // Sanity check a few following bytes to avoid false positives inside binary image data.
      let plausible = true;
      const checkEnd = Math.min(len, i + 10);
      for (let k = i + 2; k < checkEnd; k++) {
        const c = bytes[k];
        if (!isWhitespaceByte(c) && (c < 0x20 || c > 0x7e)) {
          plausible = false;
          break;
        }
      }
      if (plausible) return i + 2;
    }
    i++;
  }
  return len;
}

function tokenizeContentStream(bytes: Uint8Array): StreamToken[] {
  const tokens: StreamToken[] = [];
  const len = bytes.length;
  let i = 0;

  while (i < len) {
    const b = bytes[i];
    if (isWhitespaceByte(b)) {
      i++;
      continue;
    }
    // Comment
    if (b === 0x25) {
      while (i < len && bytes[i] !== 0x0a && bytes[i] !== 0x0d) i++;
      continue;
    }
    // Literal string (...)
    if (b === 0x28) {
      const start = i++;
      let depth = 1;
      while (i < len && depth > 0) {
        if (bytes[i] === 0x5c) {
          i += 2;
          continue;
        }
        if (bytes[i] === 0x28) depth++;
        else if (bytes[i] === 0x29) depth--;
        i++;
      }
      tokens.push({ kind: 'other', start, end: i, text: '' });
      continue;
    }
    // Dictionary << / >> or hex string <...>
    if (b === 0x3c) {
      const start = i;
      if (i + 1 < len && bytes[i + 1] === 0x3c) {
        i += 2;
        tokens.push({ kind: 'other', start, end: i, text: '<<' });
      } else {
        i++;
        while (i < len && bytes[i] !== 0x3e) i++;
        if (i < len) i++;
        tokens.push({ kind: 'other', start, end: i, text: '' });
      }
      continue;
    }
    if (b === 0x3e && i + 1 < len && bytes[i + 1] === 0x3e) {
      const start = i;
      i += 2;
      tokens.push({ kind: 'other', start, end: i, text: '>>' });
      continue;
    }
    // Single-char delimiters: [ ] { } ) >
    if (b === 0x5b || b === 0x5d || b === 0x7b || b === 0x7d || b === 0x29 || b === 0x3e) {
      const start = i++;
      tokens.push({ kind: 'other', start, end: i, text: String.fromCharCode(b) });
      continue;
    }
    // Name /Foo
    if (b === 0x2f) {
      const start = i++;
      while (i < len && !isWhitespaceByte(bytes[i]) && !isDelimiterByte(bytes[i])) i++;
      const text = bytesToAscii(bytes, start + 1, i);
      tokens.push({ kind: 'name', start, end: i, text });
      continue;
    }
    // Regular token: number, boolean, null, or operator keyword
    const start = i;
    while (i < len && !isWhitespaceByte(bytes[i]) && !isDelimiterByte(bytes[i])) i++;
    const text = bytesToAscii(bytes, start, i);
    if (text === 'BI') {
      const endPos = findInlineImageEnd(bytes, i);
      tokens.push({ kind: 'other', start, end: endPos, text: 'BI' });
      i = endPos;
      continue;
    }
    if (/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(text)) {
      const n = Number(text);
      if (Number.isFinite(n)) {
        tokens.push({ kind: 'number', start, end: i, text, numValue: n });
        continue;
      }
    }
    if (text === 'true' || text === 'false' || text === 'null') {
      tokens.push({ kind: 'other', start, end: i, text });
    } else {
      tokens.push({ kind: 'keyword', start, end: i, text });
    }
  }

  return tokens;
}

interface ColorSpaceState {
  fillCs: BaseColorKind;
  strokeCs: BaseColorKind;
}

function resolveNamedColorSpace(
  name: string,
  resources: PDFDict | undefined,
  context: PDFContext,
): BaseColorKind {
  if (name === 'DeviceRGB' || name === 'CalRGB' || name === 'RGB') return 'rgb';
  if (name === 'DeviceCMYK' || name === 'CMYK') return 'cmyk';
  if (name === 'DeviceGray' || name === 'CalGray' || name === 'G') return 'gray';
  if (resources) {
    const csDict = resources.lookup(N('ColorSpace'));
    if (csDict instanceof PDFDict) {
      const entry = csDict.lookup(N(name));
      if (entry) return resolveBaseColorSpace(entry, context);
    }
  }
  return 'other';
}

interface ReplacementEdit {
  start: number;
  end: number;
  replacement: Uint8Array;
}

function rewriteContentStreamToGray(
  bytes: Uint8Array,
  state: ColorSpaceState,
  stateStack: ColorSpaceState[],
  resources: PDFDict | undefined,
  context: PDFContext,
): { bytes: Uint8Array; convertedOperators: number } {
  const tokens = tokenizeContentStream(bytes);
  const operands: StreamToken[] = [];
  const edits: ReplacementEdit[] = [];
  let convertedOperators = 0;

  for (const tok of tokens) {
    if (tok.kind !== 'keyword') {
      operands.push(tok);
      continue;
    }

    const op = tok.text;

    if (op === 'q') {
      stateStack.push({ fillCs: state.fillCs, strokeCs: state.strokeCs });
    } else if (op === 'Q') {
      const prev = stateStack.pop();
      if (prev) {
        state.fillCs = prev.fillCs;
        state.strokeCs = prev.strokeCs;
      }
    } else if ((op === 'rg' || op === 'RG') && operands.length >= 3) {
      const rTok = operands[operands.length - 3];
      const gTok = operands[operands.length - 2];
      const bTok = operands[operands.length - 1];
      if (rTok.kind === 'number' && gTok.kind === 'number' && bTok.kind === 'number') {
        const y = bt709Luminance01(rTok.numValue!, gTok.numValue!, bTok.numValue!);
        const targetOp = op === 'rg' ? 'g' : 'G';
        edits.push({
          start: rTok.start,
          end: tok.end,
          replacement: asciiToBytes(`${formatGrayNum(y)} ${targetOp}`),
        });
        if (op === 'rg') state.fillCs = 'gray';
        else state.strokeCs = 'gray';
        convertedOperators++;
      }
    } else if ((op === 'k' || op === 'K') && operands.length >= 4) {
      const cTok = operands[operands.length - 4];
      const mTok = operands[operands.length - 3];
      const yTok = operands[operands.length - 2];
      const kTok = operands[operands.length - 1];
      if (
        cTok.kind === 'number' &&
        mTok.kind === 'number' &&
        yTok.kind === 'number' &&
        kTok.kind === 'number'
      ) {
        const y = cmykToLuminance01(cTok.numValue!, mTok.numValue!, yTok.numValue!, kTok.numValue!);
        const targetOp = op === 'k' ? 'g' : 'G';
        edits.push({
          start: cTok.start,
          end: tok.end,
          replacement: asciiToBytes(`${formatGrayNum(y)} ${targetOp}`),
        });
        if (op === 'k') state.fillCs = 'gray';
        else state.strokeCs = 'gray';
        convertedOperators++;
      }
    } else if (op === 'g') {
      state.fillCs = 'gray';
    } else if (op === 'G') {
      state.strokeCs = 'gray';
    } else if ((op === 'cs' || op === 'CS') && operands.length >= 1) {
      const nameTok = operands[operands.length - 1];
      if (nameTok.kind === 'name') {
        const csKind = resolveNamedColorSpace(nameTok.text, resources, context);
        if (op === 'cs') state.fillCs = csKind;
        else state.strokeCs = csKind;
        if (csKind === 'rgb' || csKind === 'cmyk') {
          edits.push({
            start: nameTok.start,
            end: tok.end,
            replacement: asciiToBytes(`/DeviceGray ${op}`),
          });
          convertedOperators++;
        }
      }
    } else if (op === 'sc' || op === 'scn' || op === 'SC' || op === 'SCN') {
      const isFill = op === 'sc' || op === 'scn';
      const activeCs = isFill ? state.fillCs : state.strokeCs;
      const targetOp = isFill ? 'g' : 'G';
      if (activeCs === 'rgb' && operands.length === 3) {
        const [rTok, gTok, bTok] = operands;
        if (rTok.kind === 'number' && gTok.kind === 'number' && bTok.kind === 'number') {
          const y = bt709Luminance01(rTok.numValue!, gTok.numValue!, bTok.numValue!);
          edits.push({
            start: rTok.start,
            end: tok.end,
            replacement: asciiToBytes(`${formatGrayNum(y)} ${targetOp}`),
          });
          convertedOperators++;
        }
      } else if (activeCs === 'cmyk' && operands.length === 4) {
        const [cTok, mTok, yTok, kTok] = operands;
        if (
          cTok.kind === 'number' &&
          mTok.kind === 'number' &&
          yTok.kind === 'number' &&
          kTok.kind === 'number'
        ) {
          const y = cmykToLuminance01(cTok.numValue!, mTok.numValue!, yTok.numValue!, kTok.numValue!);
          edits.push({
            start: cTok.start,
            end: tok.end,
            replacement: asciiToBytes(`${formatGrayNum(y)} ${targetOp}`),
          });
          convertedOperators++;
        }
      }
    }

    operands.length = 0;
  }

  if (edits.length === 0) {
    return { bytes, convertedOperators: 0 };
  }

  // Assemble modified Uint8Array preserving all untouched binary/string/inline-image regions byte-for-byte.
  let outLen = 0;
  let cursor = 0;
  for (const edit of edits) {
    outLen += edit.start - cursor + edit.replacement.length;
    cursor = edit.end;
  }
  outLen += bytes.length - cursor;

  const out = new Uint8Array(outLen);
  let writePos = 0;
  cursor = 0;
  for (const edit of edits) {
    if (edit.start > cursor) {
      out.set(bytes.subarray(cursor, edit.start), writePos);
      writePos += edit.start - cursor;
    }
    out.set(edit.replacement, writePos);
    writePos += edit.replacement.length;
    cursor = edit.end;
  }
  if (cursor < bytes.length) {
    out.set(bytes.subarray(cursor), writePos);
  }

  return { bytes: out, convertedOperators };
}

function findInheritedResources(node: PDFDict): PDFDict | undefined {
  let cur: PDFDict | undefined = node;
  const seen = new Set<PDFDict>();
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    const res = cur.lookup(N('Resources'));
    if (res instanceof PDFDict) return res;
    const parent = cur.lookup(N('Parent'));
    cur = parent instanceof PDFDict ? parent : undefined;
  }
  return undefined;
}

function getPageRawContentStreams(pageNode: PDFDict, context: PDFContext): PDFRawStream[] {
  const raw = pageNode.get(N('Contents'));
  if (!raw) return [];
  const resolved = raw instanceof PDFRef ? context.lookup(raw) : raw;
  if (resolved instanceof PDFRawStream) return [resolved];
  if (resolved instanceof PDFArray) {
    const out: PDFRawStream[] = [];
    for (let i = 0; i < resolved.size(); i++) {
      const item = context.lookup(resolved.get(i));
      if (item instanceof PDFRawStream) out.push(item);
    }
    return out;
  }
  return [];
}

/**
 * Losslessly converts vector color operators and embedded lossless/indexed images (and optionally JPEGs
 * via `options.convertJpegToGray`) to grayscale using BT.709 luminance.
 */
export async function grayscalePdf(
  bytes: Uint8Array,
  options: GrayscaleOptions = {},
  password?: string,
): Promise<GrayscaleResult> {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false, password });
  const wasEncrypted = Boolean(
    doc.context.trailerInfo.Encrypt ||
      doc.context.security ||
      (doc.context as { isDecrypted?: boolean }).isDecrypted,
  );
  const context = doc.context;

  let convertedImages = 0;
  let skippedJpegImages = 0;
  let rewrittenStreams = 0;
  let convertedOperators = 0;

  // 1. Collect all reachable Image XObjects and Form XObjects once.
  const imageStreams: PDFRawStream[] = [];
  const formStreams: PDFRawStream[] = [];
  const seenXObjects = new Set<PDFStream>();

  walkDicts(context, (dict, stream) => {
    if (!(stream instanceof PDFRawStream) || seenXObjects.has(stream)) return;
    const subtype = nameOf(dict, 'Subtype');
    if (subtype === 'Image') {
      seenXObjects.add(stream);
      imageStreams.push(stream);
    } else if (subtype === 'Form') {
      seenXObjects.add(stream);
      formStreams.push(stream);
    }
  });

  // 2. Convert embedded Image XObjects.
  for (const stream of imageStreams) {
    const dict = stream.dict;
    const imageMask = dict.lookup(N('ImageMask'));
    if (imageMask instanceof PDFBool && imageMask.asBoolean()) continue;

    const csObj = dict.lookup(N('ColorSpace'));
    const baseKind = resolveBaseColorSpace(csObj, context);
    if (baseKind === 'gray') continue; // already grayscale

    const filters = filterNames(dict);
    if (!filters) continue;

    // Handle DCTDecode (JPEG) images via optional converter hook.
    if (filters.length === 1 && filters[0] === 'DCTDecode') {
      if (options.convertJpegToGray) {
        try {
          const converted = await options.convertJpegToGray(stream.contents);
          if (converted && 'grayPixels' in converted) {
            const deflated = zlibSync(converted.grayPixels, { level: 9 });
            dict.set(N('ColorSpace'), N('DeviceGray'));
            dict.set(N('BitsPerComponent'), PDFNumber.of(8));
            dict.set(N('Width'), PDFNumber.of(converted.width));
            dict.set(N('Height'), PDFNumber.of(converted.height));
            dict.set(N('Filter'), N('FlateDecode'));
            dict.delete(N('DecodeParms'));
            dict.delete(N('Decode'));
            dict.delete(N('Length'));
            stream.updateContents(deflated);
            convertedImages++;
            continue;
          }
          if (converted && 'jpegBytes' in converted) {
            const comps = inspectJpegComponents(converted.jpegBytes);
            dict.set(N('ColorSpace'), comps === 1 ? N('DeviceGray') : N('DeviceRGB'));
            dict.set(N('BitsPerComponent'), PDFNumber.of(8));
            dict.set(N('Filter'), N('DCTDecode'));
            dict.delete(N('DecodeParms'));
            dict.delete(N('Decode'));
            dict.delete(N('Length'));
            stream.updateContents(converted.jpegBytes);
            convertedImages++;
            continue;
          }
        } catch {
          // Fall through to skipped counter if converter fails.
        }
      }
      skippedJpegImages++;
      continue;
    }

    const width = num(dict, 'Width', 0);
    const height = num(dict, 'Height', 0);
    if (width <= 0 || height <= 0) continue;
    const pixelCount = width * height;
    const bpc = num(dict, 'BitsPerComponent', 8);

    // Indexed color space (RGB or CMYK palette)
    const indexed = resolveIndexedColorSpace(csObj, context);
    if (indexed) {
      if (indexed.baseKind === 'gray') continue;
      const raw = bpc === 8 ? decodeRawImageBytes(stream, filters) : decodeRawWithAnyBpc(stream, filters);
      if (!raw) continue;
      const indices = unpackIndexedPixels(raw, width, height, bpc);
      if (!indices) continue;

      const paletteCount = indexed.hival + 1;
      const grayPalette = new Uint8Array(paletteCount);
      if (indexed.baseKind === 'rgb') {
        for (let p = 0; p < paletteCount; p++) {
          const off = p * 3;
          if (off + 2 < indexed.lookupBytes.length) {
            const r = indexed.lookupBytes[off];
            const g = indexed.lookupBytes[off + 1];
            const b = indexed.lookupBytes[off + 2];
            grayPalette[p] = clampByte(0.2126 * r + 0.7152 * g + 0.0722 * b);
          }
        }
      } else {
        for (let p = 0; p < paletteCount; p++) {
          const off = p * 4;
          if (off + 3 < indexed.lookupBytes.length) {
            const c = indexed.lookupBytes[off] / 255;
            const m = indexed.lookupBytes[off + 1] / 255;
            const y = indexed.lookupBytes[off + 2] / 255;
            const k = indexed.lookupBytes[off + 3] / 255;
            grayPalette[p] = clampByte(cmykToLuminance01(c, m, y, k) * 255);
          }
        }
      }

      const gray = new Uint8Array(pixelCount);
      for (let i = 0; i < pixelCount; i++) {
        const idx = indices[i];
        gray[i] = idx < paletteCount ? grayPalette[idx] : 0;
      }

      const deflated = zlibSync(gray, { level: 9 });
      dict.set(N('ColorSpace'), N('DeviceGray'));
      dict.set(N('BitsPerComponent'), PDFNumber.of(8));
      dict.set(N('Filter'), N('FlateDecode'));
      dict.delete(N('DecodeParms'));
      dict.delete(N('Decode'));
      dict.delete(N('Length'));
      stream.updateContents(deflated);
      convertedImages++;
      continue;
    }

    // Direct 8-bit RGB or CMYK lossless/uncompressed images
    if ((baseKind === 'rgb' || baseKind === 'cmyk') && bpc === 8) {
      const raw = decodeRawImageBytes(stream, filters);
      if (!raw) continue;
      const comps = baseKind === 'rgb' ? 3 : 4;
      if (raw.length < pixelCount * comps) continue;

      const decodePairs = readDecodePairs(dict, comps);
      const gray = new Uint8Array(pixelCount);

      if (baseKind === 'rgb') {
        for (let i = 0, j = 0; i < pixelCount; i++, j += 3) {
          let r = raw[j] / 255;
          let g = raw[j + 1] / 255;
          let b = raw[j + 2] / 255;
          if (decodePairs) {
            r = decodePairs[0] + r * (decodePairs[1] - decodePairs[0]);
            g = decodePairs[2] + g * (decodePairs[3] - decodePairs[2]);
            b = decodePairs[4] + b * (decodePairs[5] - decodePairs[4]);
          }
          gray[i] = clampByte(bt709Luminance01(r, g, b) * 255);
        }
      } else {
        for (let i = 0, j = 0; i < pixelCount; i++, j += 4) {
          let c = raw[j] / 255;
          let m = raw[j + 1] / 255;
          let y = raw[j + 2] / 255;
          let k = raw[j + 3] / 255;
          if (decodePairs) {
            c = decodePairs[0] + c * (decodePairs[1] - decodePairs[0]);
            m = decodePairs[2] + m * (decodePairs[3] - decodePairs[2]);
            y = decodePairs[4] + y * (decodePairs[5] - decodePairs[4]);
            k = decodePairs[6] + k * (decodePairs[7] - decodePairs[6]);
          }
          gray[i] = clampByte(cmykToLuminance01(c, m, y, k) * 255);
        }
      }

      const deflated = zlibSync(gray, { level: 9 });
      dict.set(N('ColorSpace'), N('DeviceGray'));
      dict.set(N('BitsPerComponent'), PDFNumber.of(8));
      dict.set(N('Filter'), N('FlateDecode'));
      dict.delete(N('DecodeParms'));
      dict.delete(N('Decode'));
      dict.delete(N('Length'));
      stream.updateContents(deflated);
      convertedImages++;
    }
  }

  // 3. Rewrite page content streams and Form XObject content streams.
  const processedContent = new Set<PDFRawStream>();

  function rewriteSingleStream(
    stream: PDFRawStream,
    state: ColorSpaceState,
    stateStack: ColorSpaceState[],
    resources: PDFDict | undefined,
  ) {
    if (processedContent.has(stream)) return;
    processedContent.add(stream);
    const flts = filterNames(stream.dict);
    if (!flts || flts.some((f) => !RAW_STREAM_FILTERS.has(f))) return;
    let decoded: Uint8Array;
    try {
      decoded = flts.length === 0 ? stream.contents : decodePDFRawStream(stream).decode();
    } catch {
      return;
    }

    const res = rewriteContentStreamToGray(decoded, state, stateStack, resources, context);
    if (res.convertedOperators > 0) {
      const deflated = zlibSync(res.bytes, { level: 9 });
      stream.dict.set(N('Filter'), N('FlateDecode'));
      stream.dict.delete(N('DecodeParms'));
      stream.dict.delete(N('Length'));
      stream.updateContents(deflated);
      rewrittenStreams++;
      convertedOperators += res.convertedOperators;
    }
  }

  for (const page of doc.getPages()) {
    const resources = findInheritedResources(page.node);
    const streams = getPageRawContentStreams(page.node, context);
    const state: ColorSpaceState = { fillCs: 'gray', strokeCs: 'gray' };
    const stateStack: ColorSpaceState[] = [];
    for (const s of streams) {
      rewriteSingleStream(s, state, stateStack, resources);
    }
  }

  for (const form of formStreams) {
    const resObj = form.dict.lookup(N('Resources'));
    const resources = resObj instanceof PDFDict ? resObj : undefined;
    const state: ColorSpaceState = { fillCs: 'gray', strokeCs: 'gray' };
    const stateStack: ColorSpaceState[] = [];
    rewriteSingleStream(form, state, stateStack, resources);
  }

  if (wasEncrypted) {
    delete doc.context.trailerInfo.Encrypt;
    doc.context.security = undefined;
    removeUnusedObjects(doc.context);
  }

  const outBytes = await doc.save({
    useObjectStreams: true,
    addDefaultPage: false,
    updateFieldAppearances: false,
  });

  return {
    bytes: outBytes,
    convertedImages,
    skippedJpegImages,
    rewrittenStreams,
    convertedOperators,
  };
}

// ---------------------------------------------------------------------------
// Pure RGBA pixel transformer (shared by colorRaster.ts and Node tests)
// ---------------------------------------------------------------------------

function parseHexRgb(hex: string | undefined, fallback: [number, number, number]): [number, number, number] {
  if (!hex) return fallback;
  const raw = hex.trim().replace(/^#/, '');
  let full = raw;
  if (/^[0-9a-fA-F]{3}$/.test(raw)) {
    full = raw[0] + raw[0] + raw[1] + raw[1] + raw[2] + raw[2];
  }
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return fallback;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

function rgb01ToHsl(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) {
    h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  } else if (max === g) {
    h = ((b - r) / d + 2) / 6;
  } else {
    h = ((r - g) / d + 4) / 6;
  }
  return [h, s, l];
}

function hue2rgb(p: number, q: number, t: number): number {
  let tt = t;
  if (tt < 0) tt += 1;
  if (tt > 1) tt -= 1;
  if (tt < 1 / 6) return p + (q - p) * 6 * tt;
  if (tt < 1 / 2) return q;
  if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
  return p;
}

function hslToRgb01(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) return [l, l, l];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [hue2rgb(p, q, h + 1 / 3), hue2rgb(p, q, h), hue2rgb(p, q, h - 1 / 3)];
}

/**
 * Pure RGBA pixel transformer (mutates `rgba` in place and returns it) preserving alpha.
 * Modes:
 *  - 'grayscale': BT.709 luminance
 *  - 'invert': classic 255 - c RGB inversion
 *  - 'smart-dark': hue-preserving lightness inversion into [0.09, 0.93] (#171717 paper, #ededed ink)
 *  - 'warm-dark': hue-preserving lightness inversion tinted onto warm sepia (#1e1b17) & cream (#e8dec8)
 *  - 'custom': maps luminance smoothly between backgroundHex and foregroundHex (optional hue preservation)
 */
export function transformRgbaPixels<T extends Uint8ClampedArray | Uint8Array>(
  rgba: T,
  mode: PixelTransformMode,
  options: PixelTransformOptions = {},
): T {
  const len = rgba.length;

  if (mode === 'grayscale') {
    for (let i = 0; i + 3 < len; i += 4) {
      const y = clampByte(0.2126 * rgba[i] + 0.7152 * rgba[i + 1] + 0.0722 * rgba[i + 2]);
      rgba[i] = y;
      rgba[i + 1] = y;
      rgba[i + 2] = y;
    }
    return rgba;
  }

  if (mode === 'invert') {
    for (let i = 0; i + 3 < len; i += 4) {
      rgba[i] = 255 - rgba[i];
      rgba[i + 1] = 255 - rgba[i + 1];
      rgba[i + 2] = 255 - rgba[i + 2];
    }
    return rgba;
  }

  if (mode === 'smart-dark') {
    const minL = 0.09;
    const rangeL = 0.93 - 0.09;
    for (let i = 0; i + 3 < len; i += 4) {
      const r = rgba[i] / 255;
      const g = rgba[i + 1] / 255;
      const b = rgba[i + 2] / 255;
      const [h, s, l] = rgb01ToHsl(r, g, b);
      const darkL = minL + (1 - l) * rangeL;
      const [nr, ng, nb] = hslToRgb01(h, s, darkL);
      rgba[i] = clampByte(nr * 255);
      rgba[i + 1] = clampByte(ng * 255);
      rgba[i + 2] = clampByte(nb * 255);
    }
    return rgba;
  }

  if (mode === 'warm-dark') {
    // Warm dark sepia paper #1e1b17 (30, 27, 23) -> warm cream ink #e8dec8 (232, 222, 200)
    const bgR = 30;
    const bgG = 27;
    const bgB = 23;
    const fgR = 232;
    const fgG = 222;
    const fgB = 200;
    const bgL = 0.104;
    const fgL = 0.847;
    for (let i = 0; i + 3 < len; i += 4) {
      const r = rgba[i] / 255;
      const g = rgba[i + 1] / 255;
      const b = rgba[i + 2] / 255;
      const [h, s, l] = rgb01ToHsl(r, g, b);
      const invL = 1 - l;
      const neutralR = bgR + invL * (fgR - bgR);
      const neutralG = bgG + invL * (fgG - bgG);
      const neutralB = bgB + invL * (fgB - bgB);
      if (s < 1e-4) {
        rgba[i] = clampByte(neutralR);
        rgba[i + 1] = clampByte(neutralG);
        rgba[i + 2] = clampByte(neutralB);
      } else {
        const targetL = bgL + invL * (fgL - bgL);
        const [hr, hg, hb] = hslToRgb01(h, s, targetL);
        const blend = Math.min(1, s * 1.15);
        rgba[i] = clampByte(neutralR * (1 - blend) + hr * 255 * blend);
        rgba[i + 1] = clampByte(neutralG * (1 - blend) + hg * 255 * blend);
        rgba[i + 2] = clampByte(neutralB * (1 - blend) + hb * 255 * blend);
      }
    }
    return rgba;
  }

  // 'custom' mode
  const [bgR, bgG, bgB] = parseHexRgb(options.backgroundHex, [23, 23, 23]);
  const [fgR, fgG, fgB] = parseHexRgb(options.foregroundHex, [237, 237, 237]);
  const preserveHue = options.preserveHue ?? true;
  const [, , bgL] = rgb01ToHsl(bgR / 255, bgG / 255, bgB / 255);
  const [, , fgL] = rgb01ToHsl(fgR / 255, fgG / 255, fgB / 255);

  for (let i = 0; i + 3 < len; i += 4) {
    const r0 = rgba[i];
    const g0 = rgba[i + 1];
    const b0 = rgba[i + 2];
    const luma = (0.2126 * r0 + 0.7152 * g0 + 0.0722 * b0) / 255;
    const t = 1 - luma; // 0 = white -> background, 1 = black -> foreground
    const baseR = bgR + t * (fgR - bgR);
    const baseG = bgG + t * (fgG - bgG);
    const baseB = bgB + t * (fgB - bgB);

    if (!preserveHue) {
      rgba[i] = clampByte(baseR);
      rgba[i + 1] = clampByte(baseG);
      rgba[i + 2] = clampByte(baseB);
      continue;
    }

    const [h, s, l] = rgb01ToHsl(r0 / 255, g0 / 255, b0 / 255);
    if (s < 0.02) {
      rgba[i] = clampByte(baseR);
      rgba[i + 1] = clampByte(baseG);
      rgba[i + 2] = clampByte(baseB);
    } else {
      const targetL = clamp01(bgL + (1 - l) * (fgL - bgL));
      const [hr, hg, hb] = hslToRgb01(h, s, targetL);
      rgba[i] = clampByte(baseR * (1 - s) + hr * 255 * s);
      rgba[i + 1] = clampByte(baseG * (1 - s) + hg * 255 * s);
      rgba[i + 2] = clampByte(baseB * (1 - s) + hb * 255 * s);
    }
  }

  return rgba;
}
