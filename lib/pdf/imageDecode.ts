// Shared raw PDF image stream decoding and pure-JS lossless RGBA->PNG encoding.
import {
  decodePDFRawStream, PDFArray, PDFContext, PDFDict, PDFName, PDFObject, PDFRawStream, PDFRef, PDFStream,
} from '@cantoo/pdf-lib';
import { zlibSync } from 'fflate';

import { filterNames, N, num } from './objects';

const RAW_FILTERS = new Set(['FlateDecode', 'LZWDecode', 'ASCII85Decode', 'ASCIIHexDecode', 'RunLengthDecode']);

// Undoes the PNG (10-15) and TIFF (2) predictors that can follow FlateDecode and LZWDecode.
export function unpredict(data: Uint8Array, parms: PDFDict | undefined): Uint8Array {
  const predictor = num(parms, 'Predictor', 1);
  if (predictor === 1) return data;
  const colors = num(parms, 'Colors', 1);
  const bpc = num(parms, 'BitsPerComponent', 8);
  const columns = num(parms, 'Columns', 1);
  const rowLen = Math.ceil((columns * colors * bpc) / 8);
  if (rowLen <= 0) return data;
  if (predictor === 2) {
    if (bpc !== 8) throw new Error('Unsupported TIFF predictor');
    const out = data.slice();
    for (let row = 0; row + rowLen <= out.length; row += rowLen) {
      for (let i = colors; i < rowLen; i++) out[row + i] = (out[row + i] + out[row + i - colors]) & 0xff;
    }
    return out;
  }
  if (predictor < 10 || predictor > 15) throw new Error(`Unsupported predictor ${predictor}`);
  const bpp = Math.max(1, Math.ceil((colors * bpc) / 8));
  const rows = Math.floor(data.length / (rowLen + 1));
  const out = new Uint8Array(rows * rowLen);
  for (let r = 0; r < rows; r++) {
    const type = data[r * (rowLen + 1)];
    const src = r * (rowLen + 1) + 1;
    const dst = r * rowLen;
    for (let i = 0; i < rowLen; i++) {
      const left = i >= bpp ? out[dst + i - bpp] : 0;
      const up = r > 0 ? out[dst - rowLen + i] : 0;
      const upLeft = r > 0 && i >= bpp ? out[dst - rowLen + i - bpp] : 0;
      let pred = 0;
      if (type === 1) pred = left;
      else if (type === 2) pred = up;
      else if (type === 3) pred = (left + up) >> 1;
      else if (type === 4) {
        const p = left + up - upLeft;
        const pa = Math.abs(p - left);
        const pb = Math.abs(p - up);
        const pc = Math.abs(p - upLeft);
        pred = pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
      }
      out[dst + i] = (data[src + i] + pred) & 0xff;
    }
  }
  return out;
}

// Number of colour components for the colour spaces that can be reproduced directly as RGB or greyscale, otherwise null.
export function imageComponents(cs: PDFObject | undefined, context: PDFContext): 1 | 3 | null {
  const resolved = cs instanceof PDFRef ? context.lookup(cs) : cs;
  if (resolved instanceof PDFName) {
    const name = resolved.decodeText();
    if (name === 'DeviceRGB' || name === 'CalRGB') return 3;
    if (name === 'DeviceGray' || name === 'CalGray') return 1;
    return null;
  }
  if (resolved instanceof PDFArray && resolved.size() > 0) {
    const family = context.lookup(resolved.get(0));
    if (!(family instanceof PDFName)) return null;
    const name = family.decodeText();
    if (name === 'CalRGB') return 3;
    if (name === 'CalGray') return 1;
    if (name === 'ICCBased') {
      const profile = context.lookup(resolved.get(1));
      const n = profile instanceof PDFStream ? num(profile.dict, 'N', 0) : 0;
      return n === 3 ? 3 : n === 1 ? 1 : null;
    }
  }
  return null;
}

// Decodes an 8-bit image stream encoded with standard lossless PDF filters (or uncompressed),
// undoing PNG/TIFF predictors when present. Returns null if the stream uses unsupported filters
// or bit depth, or cannot be decoded.
export function decodeRawImageBytes(stream: PDFRawStream, filters?: string[] | null): Uint8Array | null {
  const dict = stream.dict;
  const resolvedFilters = filters === undefined ? filterNames(dict) : filters;
  if (!resolvedFilters) return null;
  if (resolvedFilters.some((f) => !RAW_FILTERS.has(f))) return null;
  if (num(dict, 'BitsPerComponent', 8) !== 8) return null;
  try {
    let data = resolvedFilters.length === 0 ? stream.contents : decodePDFRawStream(stream).decode();
    const parms = dict.lookup(N('DecodeParms'));
    const lastParms = parms instanceof PDFArray
      ? (parms.size() > 0 ? dict.context.lookup(parms.get(parms.size() - 1)) : undefined)
      : parms;
    data = unpredict(data, lastParms instanceof PDFDict ? lastParms : undefined);
    return data;
  } catch {
    return null;
  }
}

// IEEE 802.3 CRC-32 table for PNG chunk checksums.
const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  CRC_TABLE[n] = c >>> 0;
}

function crc32(bytes: Uint8Array, start = 0, end = bytes.length): number {
  let c = 0xffffffff;
  for (let i = start; i < end; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function writeUint32BE(out: Uint8Array, offset: number, value: number) {
  out[offset] = (value >>> 24) & 0xff;
  out[offset + 1] = (value >>> 16) & 0xff;
  out[offset + 2] = (value >>> 8) & 0xff;
  out[offset + 3] = value & 0xff;
}

function makeChunk(type: string, data: Uint8Array): Uint8Array {
  const chunk = new Uint8Array(12 + data.length);
  writeUint32BE(chunk, 0, data.length);
  chunk[4] = type.charCodeAt(0);
  chunk[5] = type.charCodeAt(1);
  chunk[6] = type.charCodeAt(2);
  chunk[7] = type.charCodeAt(3);
  chunk.set(data, 8);
  writeUint32BE(chunk, 8 + data.length, crc32(chunk, 4, 8 + data.length));
  return chunk;
}

const PNG_SIGNATURE = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

// Pure-JS lossless RGBA -> PNG encoder (browser and Node compatible).
export function encodePngRgba(rgba: Uint8ClampedArray | Uint8Array, width: number, height: number): Uint8Array {
  if (width <= 0 || height <= 0) throw new Error('Invalid PNG dimensions.');
  const rowBytes = width * 4;
  if (rgba.length < rowBytes * height) throw new Error('RGBA buffer is smaller than width * height * 4.');

  const ihdr = new Uint8Array(13);
  writeUint32BE(ihdr, 0, width);
  writeUint32BE(ihdr, 4, height);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: truecolour with alpha (RGBA)
  ihdr[10] = 0; // compression: deflate
  ihdr[11] = 0; // filter method: standard
  ihdr[12] = 0; // interlace: none

  // One filter byte (0 = None) before each scanline.
  const scanlines = new Uint8Array(height * (rowBytes + 1));
  for (let y = 0; y < height; y++) {
    const srcStart = y * rowBytes;
    const dstStart = y * (rowBytes + 1);
    scanlines[dstStart] = 0;
    scanlines.set(rgba.subarray(srcStart, srcStart + rowBytes), dstStart + 1);
  }
  const compressed = zlibSync(scanlines);

  const ihdrChunk = makeChunk('IHDR', ihdr);
  const idatChunk = makeChunk('IDAT', compressed);
  const iendChunk = makeChunk('IEND', new Uint8Array(0));

  const png = new Uint8Array(PNG_SIGNATURE.length + ihdrChunk.length + idatChunk.length + iendChunk.length);
  let offset = 0;
  png.set(PNG_SIGNATURE, offset); offset += PNG_SIGNATURE.length;
  png.set(ihdrChunk, offset); offset += ihdrChunk.length;
  png.set(idatChunk, offset); offset += idatChunk.length;
  png.set(iendChunk, offset);
  return png;
}
