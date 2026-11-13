// Reads QR codes (and, when asked, other barcodes) in an image with zxing-wasm: ZXing-C++ compiled to WebAssembly.
// The wasm file is served from /qr/ (copied there by scripts/copy-qr-assets.mjs), never from a CDN. Runs in the
// scan worker (scan.worker.ts), on the page when no worker can be made, and in Node in the harness, which hands the
// wasm over as bytes with `useWasmBinary`.

import { prepareZXingModule, readBarcodes } from 'zxing-wasm/reader';
import type { ReaderOptions, ReadResult } from 'zxing-wasm/reader';

export const WASM_URL = '/qr/zxing_reader.wasm';

/** The QR family: what the site's generator makes. */
export const QR_FORMATS = ['QRCode', 'MicroQRCode', 'RMQRCode'] as const;

export type FormatSet = 'qr' | 'all';

export interface ScanOptions {
  formats: FormatSet;
  /** Retries with other binarizers and denoising when the first pass finds nothing. For files, not camera frames. */
  thorough: boolean;
}

export type Point = [number, number];

/** One code found in an image: plain data, so it can cross from the worker. */
export interface Detection {
  /** False when a code was found but could not be decoded (too damaged, or cut off). */
  valid: boolean;
  error: string;
  /** zxing's format name: QRCode, QRCodeModel1, MicroQRCode, RMQRCode, DataMatrix, EAN13, … */
  format: string;
  /** The content as stored: without ECI designators, with FNC1 as GS (0x1D). */
  bytes: Uint8Array;
  /** The content with ECI designators as \\nnnnnn, as the standard defines for transmission. */
  bytesECI: Uint8Array;
  /** The bytes as text, in the character sets the symbol declares (ECI) or the reader guessed. */
  text: string;
  hasECI: boolean;
  /** zxing's hint: Text, Binary, Mixed, GS1, ISO15434 or UnknownECI. */
  contentType: string;
  /** Corners in image pixels: top left, top right, bottom right, bottom left (of the symbol as read). */
  corners: [Point, Point, Point, Point];
  rotation: number;
  mirrored: boolean;
  inverted: boolean;
  /** "]Q1" and so on (ISO/IEC 15424): ]Q3 and ]Q4 mean FNC1 in first position (GS1), ]Q5 and ]Q6 in second. */
  symbologyId: string;
  /** Structured append: this symbol's place in a sequence of `size` symbols with the same `id` (QR: the parity). */
  sequence: { size: number; index: number; id: string } | null;
  version: string;
  ecLevel: string;
  mask: number | null;
  /** The modules as read, one byte per module (0 = dark), or null. */
  symbol: { width: number; height: number; data: Uint8Array } | null;
}

let prepared = false;

/** Node (the harness): give the wasm as bytes instead of a URL. Call before the first scan. */
export function useWasmBinary(binary: ArrayBuffer) {
  prepareZXingModule({ overrides: { wasmBinary: binary }, fireImmediately: false });
  prepared = true;
}

function prepare() {
  if (prepared) return;
  prepareZXingModule({
    overrides: { locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? WASM_URL : prefix + path) },
    fireImmediately: false,
  });
  prepared = true;
}

function baseOptions(formats: FormatSet): ReaderOptions {
  return {
    formats: formats === 'qr' ? [...QR_FORMATS] : [],
    tryHarder: true,
    tryRotate: true,
    tryInvert: true,
    tryDownscale: true,
    maxNumberOfSymbols: 255,
    returnErrors: true,
    textMode: 'Plain',
  };
}

// Later passes when the first finds nothing: denoising helps with dotted or worn codes, a global threshold with
// low-contrast prints, a fixed one with codes on a screen photographed at an angle.
const RETRIES: ReaderOptions[] = [
  { tryDenoise: true },
  { binarizer: 'GlobalHistogram' },
  { binarizer: 'FixedThreshold' },
];

function parseExtra(extra: string): Record<string, unknown> {
  try {
    return extra ? JSON.parse(extra) : {};
  } catch {
    return {};
  }
}

function toDetection(r: ReadResult): Detection {
  const extra = parseExtra(r.extra);
  const p = r.position;
  const mask = typeof extra.DataMask === 'number' ? extra.DataMask : null;
  return {
    valid: r.isValid,
    error: r.error,
    format: r.format,
    // Copies: the result's arrays may be views of the wasm heap.
    bytes: new Uint8Array(r.bytes),
    bytesECI: new Uint8Array(r.bytesECI),
    text: r.text,
    hasECI: r.hasECI,
    contentType: r.contentType,
    corners: [[p.topLeft.x, p.topLeft.y], [p.topRight.x, p.topRight.y], [p.bottomRight.x, p.bottomRight.y], [p.bottomLeft.x, p.bottomLeft.y]],
    rotation: r.rotation,
    mirrored: r.isMirrored,
    inverted: r.isInverted,
    symbologyId: r.symbologyIdentifier,
    sequence: r.sequenceSize > 0 ? { size: r.sequenceSize, index: r.sequenceIndex, id: r.sequenceId } : null,
    version: String(extra.Version ?? r.version ?? ''),
    ecLevel: String(extra.ECLevel ?? r.ecLevel ?? ''),
    mask,
    symbol: r.symbol && r.symbol.width > 0
      ? { width: r.symbol.width, height: r.symbol.height, data: new Uint8Array(r.symbol.data) }
      : null,
  };
}

function centre(d: Detection): Point {
  let x = 0;
  let y = 0;
  for (const [px, py] of d.corners) { x += px / 4; y += py / 4; }
  return [x, y];
}

function size(d: Detection) {
  const [a, b] = [d.corners[0], d.corners[2]];
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

/** Whether two detections are the same symbol: their centres lie within a quarter of the symbol's size. */
export function samePlace(a: Detection, b: Detection) {
  const [ax, ay] = centre(a);
  const [bx, by] = centre(b);
  return Math.hypot(ax - bx, ay - by) < 0.25 * Math.max(size(a), size(b), 4);
}

/** Puts the codes found by a later pass to those of the earlier ones; a readable code replaces a damaged one. */
function merge(into: Detection[], found: Detection[]) {
  for (const d of found) {
    const i = into.findIndex((e) => samePlace(e, d));
    if (i < 0) into.push(d);
    else if (!into[i].valid && d.valid) into[i] = d;
  }
}

/**
 * Finds the codes in an image. Readable codes first, in reading order (top to bottom, then left to right); a code
 * that was found but could not be decoded is kept with `valid: false` unless a readable one lies in the same place.
 */
export async function scanImageData(image: ImageData, options: ScanOptions): Promise<Detection[]> {
  prepare();
  const base = baseOptions(options.formats);
  const out: Detection[] = [];
  merge(out, (await readBarcodes(image, base)).map(toDetection));
  if (options.thorough) {
    for (const retry of RETRIES) {
      if (out.some((d) => d.valid)) break;
      merge(out, (await readBarcodes(image, { ...base, ...retry })).map(toDetection));
    }
  }
  // Codes whose heights overlap are in one row, read left to right; rows top to bottom.
  const span = (d: Detection) => [Math.min(...d.corners.map((c) => c[1])), Math.max(...d.corners.map((c) => c[1]))];
  const order = (a: Detection, b: Detection) => {
    const [at, ab] = span(a);
    const [bt, bb] = span(b);
    return at < bb && bt < ab ? centre(a)[0] - centre(b)[0] : centre(a)[1] - centre(b)[1];
  };
  return out.sort((a, b) => Number(b.valid) - Number(a.valid) || order(a, b));
}
