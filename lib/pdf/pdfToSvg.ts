// PDF page / Form XObject / cropped region -> standalone SVG converter.
// Works in both browser (via self-hosted pdf.js) and Node without DOM dependencies.
import type { PDFPageProxy } from 'pdfjs-dist';

import type { ViewportRect } from './extractVectors';
import { encodePngRgba } from './imageDecode';
import { openPdf } from './pdfjs';

export type Matrix2D = [number, number, number, number, number, number];

export interface BBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export type PathCmd =
  | { kind: 'M'; x: number; y: number }
  | { kind: 'L'; x: number; y: number }
  | { kind: 'C'; x1: number; y1: number; x2: number; y2: number; x3: number; y3: number }
  | { kind: 'Q'; x1: number; y1: number; x2: number; y2: number }
  | { kind: 'Z' };

export interface DecodedConstructPath {
  paintOp: number | null;
  cmds: PathCmd[];
  minMax: BBox | null;
}

export interface PdfToSvgResult {
  svg: string;
  width: number;
  height: number;
  pathCount: number;
  imageCount: number;
  textCount: number;
  warnings: string[];
}

export interface PdfBytesToSvgOptions {
  pageIndex?: number;
  rect?: ViewportRect;
  password?: string;
}

// Numeric operator codes matching pdfjs-dist 6.4.x (`OPS` & `DrawOPS`).
export const PDFJS_OPS: Record<string, number> = {
  setLineWidth: 2,
  setLineCap: 3,
  setLineJoin: 4,
  setMiterLimit: 5,
  setDash: 6,
  setGState: 9,
  save: 10,
  restore: 11,
  transform: 12,
  moveTo: 13,
  lineTo: 14,
  curveTo: 15,
  curveTo2: 16,
  curveTo3: 17,
  closePath: 18,
  rectangle: 19,
  stroke: 20,
  closeStroke: 21,
  fill: 22,
  eoFill: 23,
  fillStroke: 24,
  eoFillStroke: 25,
  closeFillStroke: 26,
  closeEOFillStroke: 27,
  endPath: 28,
  clip: 29,
  eoClip: 30,
  beginText: 31,
  endText: 32,
  setLeading: 36,
  setFont: 37,
  moveText: 40,
  setLeadingMoveText: 41,
  setTextMatrix: 42,
  nextLine: 43,
  showText: 44,
  showSpacedText: 45,
  setStrokeColorN: 53,
  setFillColorN: 55,
  setStrokeGray: 56,
  setFillGray: 57,
  setStrokeRGBColor: 58,
  setFillRGBColor: 59,
  setStrokeCMYKColor: 60,
  setFillCMYKColor: 61,
  shadingFill: 62,
  paintFormXObjectBegin: 74,
  paintFormXObjectEnd: 75,
  beginGroup: 76,
  endGroup: 77,
  paintImageMaskXObject: 83,
  paintImageXObject: 85,
  paintInlineImageXObject: 86,
  constructPath: 91,
  setStrokeTransparent: 92,
  setFillTransparent: 93,
  rawFillPath: 94,
};

const DRAW_OPS = {
  moveTo: 0,
  lineTo: 1,
  curveTo: 2,
  quadraticCurveTo: 3,
  closePath: 4,
};

const LINE_CAPS: Array<'butt' | 'round' | 'square'> = ['butt', 'round', 'square'];
const LINE_JOINS: Array<'miter' | 'round' | 'bevel'> = ['miter', 'round', 'bevel'];

export function multiplyMatrix(m1: Matrix2D, m2: Matrix2D): Matrix2D {
  return [
    m1[0] * m2[0] + m1[2] * m2[1],
    m1[1] * m2[0] + m1[3] * m2[1],
    m1[0] * m2[2] + m1[2] * m2[3],
    m1[1] * m2[2] + m1[3] * m2[3],
    m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
    m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
  ];
}

export function applyMatrix(m: Matrix2D, x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

export function matrixScale(m: Matrix2D): number {
  const det = Math.abs(m[0] * m[3] - m[1] * m[2]);
  return det > 0 ? Math.sqrt(det) : Math.max(Math.hypot(m[0], m[1]), Math.hypot(m[2], m[3]));
}

export function transformBBox(box: BBox, m: Matrix2D): BBox {
  const pts: Array<[number, number]> = [
    applyMatrix(m, box.minX, box.minY),
    applyMatrix(m, box.maxX, box.minY),
    applyMatrix(m, box.maxX, box.maxY),
    applyMatrix(m, box.minX, box.maxY),
  ];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of pts) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return { minX, minY, maxX, maxY };
}

export function bboxesIntersect(a: BBox, b: BBox): boolean {
  return a.maxX >= b.minX && a.minX <= b.maxX && a.maxY >= b.minY && a.minY <= b.maxY;
}

export function intersectBBox(a: BBox, b: BBox): BBox | null {
  const minX = Math.max(a.minX, b.minX);
  const minY = Math.max(a.minY, b.minY);
  const maxX = Math.min(a.maxX, b.maxX);
  const maxY = Math.min(a.maxY, b.maxY);
  if (minX > maxX || minY > maxY) return null;
  return { minX, minY, maxX, maxY };
}

export function unionBBox(a: BBox | null, b: BBox): BBox {
  if (!a) return { ...b };
  return {
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY),
  };
}

function isNumericBuffer(val: unknown): val is ArrayLike<number> {
  if (!val || typeof val !== 'object') return false;
  if (Array.isArray(val) || ArrayBuffer.isView(val)) return true;
  return typeof (val as ArrayLike<number>).length === 'number';
}

function readMinMax(raw: unknown): BBox | null {
  if (!isNumericBuffer(raw) || raw.length < 4) return null;
  const minX = Number(raw[0]);
  const minY = Number(raw[1]);
  const maxX = Number(raw[2]);
  const maxY = Number(raw[3]);
  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
    return null;
  }
  return { minX, minY, maxX, maxY };
}

// Decodes `OPS.constructPath` arguments for both pdf.js v5/v6 (`[paintOp, [Float32Array], minMax]`)
// and legacy pdf.js v3/v4 (`[opsArray, coordsArray, minMax]`).
export function decodeConstructPathArgs(
  args: unknown[] | null | undefined,
  OPS: Record<string, number> = PDFJS_OPS,
): DecodedConstructPath {
  if (!args || !args.length) return { paintOp: null, cmds: [], minMax: null };

  const cmds: PathCmd[] = [];
  const minMax = readMinMax(args[2]);

  // pdf.js v5/v6 format: args = [paintOp: number, [DrawOPS Float32Array], minMax]
  if (typeof args[0] === 'number') {
    const paintOp = args[0];
    const container = args[1];
    const buf = Array.isArray(container) ? container[0] : container;
    if (isNumericBuffer(buf)) {
      let i = 0;
      const len = buf.length;
      while (i < len) {
        const op = buf[i++];
        if (op === DRAW_OPS.moveTo && i + 1 < len) {
          cmds.push({ kind: 'M', x: buf[i++], y: buf[i++] });
        } else if (op === DRAW_OPS.lineTo && i + 1 < len) {
          cmds.push({ kind: 'L', x: buf[i++], y: buf[i++] });
        } else if (op === DRAW_OPS.curveTo && i + 5 < len) {
          cmds.push({
            kind: 'C',
            x1: buf[i++],
            y1: buf[i++],
            x2: buf[i++],
            y2: buf[i++],
            x3: buf[i++],
            y3: buf[i++],
          });
        } else if (op === DRAW_OPS.quadraticCurveTo && i + 3 < len) {
          cmds.push({
            kind: 'Q',
            x1: buf[i++],
            y1: buf[i++],
            x2: buf[i++],
            y2: buf[i++],
          });
        } else if (op === DRAW_OPS.closePath) {
          cmds.push({ kind: 'Z' });
        } else {
          break;
        }
      }
    }
    return { paintOp, cmds, minMax };
  }

  // Legacy pdf.js v3/v4 format: args = [ops: number[], coords: number[], minMax]
  if (Array.isArray(args[0])) {
    const subOps = args[0] as number[];
    const coords = isNumericBuffer(args[1]) ? args[1] : [];
    let j = 0;
    let cx = 0;
    let cy = 0;
    for (let k = 0; k < subOps.length; k++) {
      const op = subOps[k];
      if (op === OPS.moveTo) {
        const x = coords[j++];
        const y = coords[j++];
        cmds.push({ kind: 'M', x, y });
        cx = x;
        cy = y;
      } else if (op === OPS.lineTo) {
        const x = coords[j++];
        const y = coords[j++];
        cmds.push({ kind: 'L', x, y });
        cx = x;
        cy = y;
      } else if (op === OPS.curveTo) {
        const x1 = coords[j++];
        const y1 = coords[j++];
        const x2 = coords[j++];
        const y2 = coords[j++];
        const x3 = coords[j++];
        const y3 = coords[j++];
        cmds.push({ kind: 'C', x1, y1, x2, y2, x3, y3 });
        cx = x3;
        cy = y3;
      } else if (op === OPS.curveTo2) {
        const x2 = coords[j++];
        const y2 = coords[j++];
        const x3 = coords[j++];
        const y3 = coords[j++];
        cmds.push({ kind: 'C', x1: cx, y1: cy, x2, y2, x3, y3 });
        cx = x3;
        cy = y3;
      } else if (op === OPS.curveTo3) {
        const x1 = coords[j++];
        const y1 = coords[j++];
        const x3 = coords[j++];
        const y3 = coords[j++];
        cmds.push({ kind: 'C', x1, y1, x2: x3, y2: y3, x3, y3 });
        cx = x3;
        cy = y3;
      } else if (op === OPS.closePath) {
        cmds.push({ kind: 'Z' });
      } else if (op === OPS.rectangle) {
        const x = coords[j++];
        const y = coords[j++];
        const w = coords[j++];
        const h = coords[j++];
        cmds.push(
          { kind: 'M', x, y },
          { kind: 'L', x: x + w, y },
          { kind: 'L', x: x + w, y: y + h },
          { kind: 'L', x, y: y + h },
          { kind: 'Z' },
        );
        cx = x;
        cy = y;
      }
    }
    return { paintOp: null, cmds, minMax };
  }

  return { paintOp: null, cmds: [], minMax };
}

function fmt(n: number): string {
  if (!Number.isFinite(n) || Math.abs(n) < 1e-4) return '0';
  return Number(n.toFixed(3)).toString();
}

function updateCubic1D(p0: number, p1: number, p2: number, p3: number, add: (v: number) => void) {
  add(p0);
  add(p3);
  const a = -p0 + 3 * p1 - 3 * p2 + p3;
  const b = 2 * (p0 - 2 * p1 + p2);
  const c = p1 - p0;
  const evalAt = (t: number) => {
    const mt = 1 - t;
    return mt * mt * mt * p0 + 3 * mt * mt * t * p1 + 3 * mt * t * t * p2 + t * t * t * p3;
  };
  if (Math.abs(a) < 1e-9) {
    if (Math.abs(b) > 1e-9) {
      const t = -c / b;
      if (t > 0 && t < 1) add(evalAt(t));
    }
    return;
  }
  const disc = b * b - 4 * a * c;
  if (disc < 0) return;
  const sq = Math.sqrt(disc);
  for (const t of [(-b + sq) / (2 * a), (-b - sq) / (2 * a)]) {
    if (t > 0 && t < 1) add(evalAt(t));
  }
}

function updateQuad1D(p0: number, p1: number, p2: number, add: (v: number) => void) {
  add(p0);
  add(p2);
  const denom = p0 - 2 * p1 + p2;
  if (Math.abs(denom) > 1e-9) {
    const t = (p0 - p1) / denom;
    if (t > 0 && t < 1) {
      const mt = 1 - t;
      add(mt * mt * p0 + 2 * mt * t * p1 + t * t * p2);
    }
  }
}

export interface TransformedPathInfo {
  d: string;
  bbox: BBox | null;
  segmentCount: number;
  isAxisAlignedRect: boolean;
}

// Converts PDF path commands into an SVG `d` string in viewport coordinates, together with
// its tight transformed bounding box and shape metadata.
export function transformPathToSvg(cmds: PathCmd[], ctm: Matrix2D, closeSubpath = false): TransformedPathInfo {
  if (!cmds.length) return { d: '', bbox: null, segmentCount: 0, isAxisAlignedRect: false };

  const parts: string[] = [];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let cx = 0;
  let cy = 0;
  let sx = 0;
  let sy = 0;
  let segmentCount = 0;
  let hasCurve = false;
  let subpathCount = 0;
  let axisAlignedSegments = true;

  const addX = (v: number) => {
    if (v < minX) minX = v;
    if (v > maxX) maxX = v;
  };
  const addY = (v: number) => {
    if (v < minY) minY = v;
    if (v > maxY) maxY = v;
  };
  const addPt = (x: number, y: number) => {
    addX(x);
    addY(y);
  };

  for (let i = 0; i < cmds.length; i++) {
    const cmd = cmds[i];
    if (cmd.kind === 'M') {
      const [x, y] = applyMatrix(ctm, cmd.x, cmd.y);
      parts.push(`M${fmt(x)} ${fmt(y)}`);
      addPt(x, y);
      cx = sx = x;
      cy = sy = y;
      subpathCount++;
    } else if (cmd.kind === 'L') {
      const [x, y] = applyMatrix(ctm, cmd.x, cmd.y);
      parts.push(`L${fmt(x)} ${fmt(y)}`);
      addPt(x, y);
      if (Math.abs(x - cx) > 0.25 && Math.abs(y - cy) > 0.25) axisAlignedSegments = false;
      cx = x;
      cy = y;
      segmentCount++;
    } else if (cmd.kind === 'C') {
      const [x1, y1] = applyMatrix(ctm, cmd.x1, cmd.y1);
      const [x2, y2] = applyMatrix(ctm, cmd.x2, cmd.y2);
      const [x3, y3] = applyMatrix(ctm, cmd.x3, cmd.y3);
      parts.push(`C${fmt(x1)} ${fmt(y1)} ${fmt(x2)} ${fmt(y2)} ${fmt(x3)} ${fmt(y3)}`);
      updateCubic1D(cx, x1, x2, x3, addX);
      updateCubic1D(cy, y1, y2, y3, addY);
      cx = x3;
      cy = y3;
      segmentCount++;
      hasCurve = true;
    } else if (cmd.kind === 'Q') {
      const [x1, y1] = applyMatrix(ctm, cmd.x1, cmd.y1);
      const [x2, y2] = applyMatrix(ctm, cmd.x2, cmd.y2);
      parts.push(`Q${fmt(x1)} ${fmt(y1)} ${fmt(x2)} ${fmt(y2)}`);
      updateQuad1D(cx, x1, x2, addX);
      updateQuad1D(cy, y1, y2, addY);
      cx = x2;
      cy = y2;
      segmentCount++;
      hasCurve = true;
    } else if (cmd.kind === 'Z') {
      parts.push('Z');
      if (Math.abs(sx - cx) > 0.25 && Math.abs(sy - cy) > 0.25) axisAlignedSegments = false;
      cx = sx;
      cy = sy;
    }
  }

  if (closeSubpath && cmds[cmds.length - 1]?.kind !== 'Z') {
    parts.push('Z');
  }

  const bbox = Number.isFinite(minX) ? { minX, minY, maxX, maxY } : null;
  const isAxisAlignedRect =
    !hasCurve &&
    subpathCount === 1 &&
    axisAlignedSegments &&
    segmentCount >= 3 &&
    segmentCount <= 5 &&
    bbox !== null &&
    bbox.maxX - bbox.minX > 0.5 &&
    bbox.maxY - bbox.minY > 0.5;

  return { d: parts.join(' '), bbox, segmentCount, isAxisAlignedRect };
}

// Computes the viewport bounding box of a pdf.js TextItem (matched with viewport.transform).
export function textItemViewportBBox(
  item: { str: string; width: number; height: number; transform: number[] },
  vpTransform: Matrix2D,
): BBox | null {
  if (!item.str || !item.str.trim()) return null;
  const tr = item.transform;
  if (!tr || tr.length < 6) return null;

  const tm: Matrix2D = [tr[0], tr[1], tr[2], tr[3], tr[4], tr[5]];
  const m = multiplyMatrix(vpTransform, tm);

  const scaleX = Math.hypot(tr[0], tr[1]);
  const scaleY = Math.hypot(tr[2], tr[3]);
  const fontSize = scaleY || scaleX || item.height || 10;
  const localW = scaleX > 1e-4 ? item.width / scaleX : (item.width || item.str.length * fontSize * 0.5) / fontSize;

  return transformBBox({ minX: 0, minY: -0.2, maxX: Math.max(0.1, localW), maxY: 0.95 }, m);
}

function clampByte(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

function rgbHex(r: number, g: number, b: number): string {
  const hex = (v: number) => clampByte(v).toString(16).padStart(2, '0');
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

function parseRgbArgs(args: unknown[] | null | undefined): string | null {
  if (!args || !args.length) return null;
  if (typeof args[0] === 'string') return args[0];
  if (args.length >= 3 && typeof args[0] === 'number' && typeof args[1] === 'number' && typeof args[2] === 'number') {
    const [r, g, b] = args as [number, number, number];
    const scale = r <= 1 && g <= 1 && b <= 1 && (r % 1 !== 0 || g % 1 !== 0 || b % 1 !== 0) ? 255 : 1;
    return rgbHex(r * scale, g * scale, b * scale);
  }
  return null;
}

function parseGrayArgs(args: unknown[] | null | undefined): string | null {
  if (!args || typeof args[0] !== 'number') return null;
  const v = args[0] <= 1 ? args[0] * 255 : args[0];
  return rgbHex(v, v, v);
}

function parseCmykArgs(args: unknown[] | null | undefined): string | null {
  if (!args || args.length < 4) return null;
  const [c, m, y, k] = args as number[];
  const r = 255 * (1 - c) * (1 - k);
  const g = 255 * (1 - m) * (1 - k);
  const b = 255 * (1 - y) * (1 - k);
  return rgbHex(r, g, b);
}

function parseCssColorToRgb(color: string): [number, number, number] {
  const hex = /^#([0-9a-f]{6})$/i.exec(color.trim());
  if (hex) {
    const n = parseInt(hex[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const shortHex = /^#([0-9a-f]{3})$/i.exec(color.trim());
  if (shortHex) {
    const s = shortHex[1];
    return [parseInt(s[0] + s[0], 16), parseInt(s[1] + s[1], 16), parseInt(s[2] + s[2], 16)];
  }
  return [0, 0, 0];
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

const B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function bytesToBase64(bytes: Uint8Array): string {
  let out = '';
  const len = bytes.length;
  for (let i = 0; i < len; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < len ? bytes[i + 1] : 0;
    const b2 = i + 2 < len ? bytes[i + 2] : 0;
    const triple = (b0 << 16) | (b1 << 8) | b2;
    out += B64_CHARS[(triple >> 18) & 63];
    out += B64_CHARS[(triple >> 12) & 63];
    out += i + 1 < len ? B64_CHARS[(triple >> 6) & 63] : '=';
    out += i + 2 < len ? B64_CHARS[triple & 63] : '=';
  }
  return out;
}

interface PdfJsImageLike {
  width?: number;
  height?: number;
  kind?: number;
  data?: Uint8Array | Uint8ClampedArray;
  bitmap?: ImageBitmap;
  inverseDecode?: boolean;
}

async function resolvePageObject(page: PDFPageProxy, objId: string): Promise<unknown> {
  const store = objId.startsWith('g_') ? page.commonObjs : page.objs;
  if (!store) return null;
  try {
    if (typeof store.has === 'function' && store.has(objId)) {
      return store.get(objId);
    }
  } catch {
    // Fall through to async callback getter.
  }
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), 250);
    try {
      store.get(objId, (val: unknown) => {
        clearTimeout(timer);
        resolve(val);
      });
    } catch {
      clearTimeout(timer);
      resolve(null);
    }
  });
}

function imageDataToPngDataUrl(img: PdfJsImageLike, maskColor?: string): string | null {
  const width = Math.round(img.width ?? 0);
  const height = Math.round(img.height ?? 0);
  if (width <= 0 || height <= 0) return null;

  if (img.data && img.data.length > 0) {
    const src = img.data;
    const pixelCount = width * height;
    let rgba: Uint8Array | Uint8ClampedArray;

    if (maskColor !== undefined) {
      const [mr, mg, mb] = parseCssColorToRgb(maskColor);
      rgba = new Uint8Array(pixelCount * 4);
      const rowBytes = Math.ceil(width / 8);
      if (src.length >= rowBytes * height && img.kind === 1) {
        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            const bit = (src[y * rowBytes + (x >> 3)] >> (7 - (x & 7))) & 1;
            const paint = img.inverseDecode ? bit === 1 : bit === 0;
            const dst = (y * width + x) * 4;
            rgba[dst] = mr;
            rgba[dst + 1] = mg;
            rgba[dst + 2] = mb;
            rgba[dst + 3] = paint ? 255 : 0;
          }
        }
      } else if (src.length >= pixelCount) {
        for (let p = 0; p < pixelCount; p++) {
          const paint = img.inverseDecode ? src[p] > 127 : src[p] < 128;
          const dst = p * 4;
          rgba[dst] = mr;
          rgba[dst + 1] = mg;
          rgba[dst + 2] = mb;
          rgba[dst + 3] = paint ? 255 : 0;
        }
      } else {
        return null;
      }
    } else if (img.kind === 3 || src.length === pixelCount * 4) {
      rgba = src;
    } else if (img.kind === 2 || src.length === pixelCount * 3) {
      rgba = new Uint8Array(pixelCount * 4);
      for (let p = 0; p < pixelCount; p++) {
        rgba[p * 4] = src[p * 3];
        rgba[p * 4 + 1] = src[p * 3 + 1];
        rgba[p * 4 + 2] = src[p * 3 + 2];
        rgba[p * 4 + 3] = 255;
      }
    } else if (img.kind === 1) {
      const rowBytes = Math.ceil(width / 8);
      if (src.length < rowBytes * height) return null;
      rgba = new Uint8Array(pixelCount * 4);
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const bit = (src[y * rowBytes + (x >> 3)] >> (7 - (x & 7))) & 1;
          const v = bit ? 255 : 0;
          const dst = (y * width + x) * 4;
          rgba[dst] = v;
          rgba[dst + 1] = v;
          rgba[dst + 2] = v;
          rgba[dst + 3] = 255;
        }
      }
    } else if (src.length === pixelCount) {
      rgba = new Uint8Array(pixelCount * 4);
      for (let p = 0; p < pixelCount; p++) {
        const v = src[p];
        rgba[p * 4] = v;
        rgba[p * 4 + 1] = v;
        rgba[p * 4 + 2] = v;
        rgba[p * 4 + 3] = 255;
      }
    } else {
      return null;
    }

    const png = encodePngRgba(rgba, width, height);
    return `data:image/png;base64,${bytesToBase64(png)}`;
  }

  // In browsers, pdf.js v6 may provide decoded images as an ImageBitmap without `.data`.
  if (img.bitmap && typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(img.bitmap, 0, 0, width, height);
    return canvas.toDataURL('image/png');
  }

  return null;
}

interface GraphicsState {
  ctm: Matrix2D;
  fillColor: string;
  strokeColor: string;
  fillAlpha: number;
  strokeAlpha: number;
  lineWidth: number;
  lineCap: 'butt' | 'round' | 'square';
  lineJoin: 'miter' | 'round' | 'bevel';
  miterLimit: number;
  dashArray: number[];
  dashPhase: number;
  clipIds: string[];
}

function cloneState(s: GraphicsState): GraphicsState {
  return {
    ctm: [...s.ctm] as Matrix2D,
    fillColor: s.fillColor,
    strokeColor: s.strokeColor,
    fillAlpha: s.fillAlpha,
    strokeAlpha: s.strokeAlpha,
    lineWidth: s.lineWidth,
    lineCap: s.lineCap,
    lineJoin: s.lineJoin,
    miterLimit: s.miterLimit,
    dashArray: s.dashArray.slice(),
    dashPhase: s.dashPhase,
    clipIds: s.clipIds.slice(),
  };
}

// Converts a PDF page (or viewport rectangle within it) into a standalone SVG string.
export async function pdfPageRegionToSvg(
  page: PDFPageProxy,
  ops: Awaited<ReturnType<PDFPageProxy['getOperatorList']>>,
  rect?: ViewportRect,
  opsEnum: Record<string, number> = PDFJS_OPS,
): Promise<PdfToSvgResult> {
  const OPS = opsEnum;
  const viewport = page.getViewport({ scale: 1 });
  const vpTransform = viewport.transform as unknown as Matrix2D;

  const box: ViewportRect = rect
    ? {
        x: Math.max(0, Math.min(viewport.width, rect.x)),
        y: Math.max(0, Math.min(viewport.height, rect.y)),
        width: Math.max(1, Math.min(viewport.width - Math.max(0, rect.x), rect.width)),
        height: Math.max(1, Math.min(viewport.height - Math.max(0, rect.y), rect.height)),
      }
    : { x: 0, y: 0, width: viewport.width, height: viewport.height };

  const regionBBox: BBox = {
    minX: box.x,
    minY: box.y,
    maxX: box.x + box.width,
    maxY: box.y + box.height,
  };

  let state: GraphicsState = {
    ctm: [...vpTransform] as Matrix2D,
    fillColor: '#000000',
    strokeColor: '#000000',
    fillAlpha: 1,
    strokeAlpha: 1,
    lineWidth: 1,
    lineCap: 'butt',
    lineJoin: 'miter',
    miterLimit: 10,
    dashArray: [],
    dashPhase: 0,
    clipIds: [],
  };
  const stack: GraphicsState[] = [];

  let currentPath: PathCmd[] = [];
  let pathCx = 0;
  let pathCy = 0;
  let pendingClip: 'nonzero' | 'evenodd' | null = null;
  let clipCounter = 0;

  const defs: string[] = [
    `<clipPath id="clip-root"><rect x="${fmt(box.x)}" y="${fmt(box.y)}" width="${fmt(box.width)}" height="${fmt(box.height)}"/></clipPath>`,
  ];
  const body: string[] = [];
  let openClips: string[] = [];
  const warningSet = new Set<string>();
  let pathCount = 0;
  let imageCount = 0;

  // Approximate text fill color tracking during operator walk (matched by viewport position).
  const textColorSamples: Array<{ x: number; y: number; color: string; alpha: number }> = [];
  let inText = false;
  let textMatrix: Matrix2D = [1, 0, 0, 1, 0, 0];
  let textLineMatrix: Matrix2D = [1, 0, 0, 1, 0, 0];
  let textLeading = 0;

  function syncClips(target: string[]) {
    let common = 0;
    while (common < openClips.length && common < target.length && openClips[common] === target[common]) {
      common++;
    }
    for (let i = openClips.length - 1; i >= common; i--) {
      body.push('</g>');
    }
    for (let i = common; i < target.length; i++) {
      body.push(`<g clip-path="url(#${target[i]})">`);
    }
    openClips = target.slice();
  }

  function pushClipPath(d: string, rule: 'nonzero' | 'evenodd') {
    if (!d) return;
    clipCounter++;
    const id = `c${clipCounter}`;
    const ruleAttr = rule === 'evenodd' ? ' clip-rule="evenodd"' : '';
    defs.push(`<clipPath id="${id}"><path d="${d}"${ruleAttr}/></clipPath>`);
    state.clipIds.push(id);
  }

  function applyPaint(cmds: PathCmd[], paintOp: number) {
    const closeSubpath =
      paintOp === OPS.closeStroke ||
      paintOp === OPS.closeFillStroke ||
      paintOp === OPS.closeEOFillStroke;

    const doFill =
      paintOp === OPS.fill ||
      paintOp === OPS.eoFill ||
      paintOp === OPS.fillStroke ||
      paintOp === OPS.eoFillStroke ||
      paintOp === OPS.closeFillStroke ||
      paintOp === OPS.closeEOFillStroke ||
      paintOp === OPS.rawFillPath;

    const doStroke =
      paintOp === OPS.stroke ||
      paintOp === OPS.closeStroke ||
      paintOp === OPS.fillStroke ||
      paintOp === OPS.eoFillStroke ||
      paintOp === OPS.closeFillStroke ||
      paintOp === OPS.closeEOFillStroke;

    const fillRule =
      paintOp === OPS.eoFill || paintOp === OPS.eoFillStroke || paintOp === OPS.closeEOFillStroke
        ? 'evenodd'
        : 'nonzero';

    const info = transformPathToSvg(cmds, state.ctm, closeSubpath);

    if (info.d && info.bbox && (doFill || doStroke)) {
      const scale = matrixScale(state.ctm);
      const sw = state.lineWidth === 0 ? 0.5 : state.lineWidth * scale;
      const pad = doStroke ? sw / 2 : 0;
      const paddedBox: BBox = {
        minX: info.bbox.minX - pad,
        minY: info.bbox.minY - pad,
        maxX: info.bbox.maxX + pad,
        maxY: info.bbox.maxY + pad,
      };

      if (bboxesIntersect(paddedBox, regionBBox)) {
        const attrs: string[] = [`d="${info.d}"`];

        if (doFill && state.fillColor !== 'none' && state.fillAlpha > 0) {
          attrs.push(`fill="${escapeXml(state.fillColor)}"`);
          if (fillRule === 'evenodd') attrs.push('fill-rule="evenodd"');
          if (state.fillAlpha < 0.999) attrs.push(`fill-opacity="${fmt(state.fillAlpha)}"`);
        } else {
          attrs.push('fill="none"');
        }

        if (doStroke && state.strokeColor !== 'none' && state.strokeAlpha > 0) {
          attrs.push(`stroke="${escapeXml(state.strokeColor)}"`);
          attrs.push(`stroke-width="${fmt(sw)}"`);
          if (state.lineCap !== 'butt') attrs.push(`stroke-linecap="${state.lineCap}"`);
          if (state.lineJoin !== 'miter') attrs.push(`stroke-linejoin="${state.lineJoin}"`);
          if (state.lineJoin === 'miter' && Math.abs(state.miterLimit - 10) > 0.01) {
            attrs.push(`stroke-miterlimit="${fmt(state.miterLimit)}"`);
          }
          if (state.dashArray.length > 0) {
            attrs.push(`stroke-dasharray="${state.dashArray.map((v) => fmt(v * scale)).join(' ')}"`);
            if (Math.abs(state.dashPhase) > 1e-4) {
              attrs.push(`stroke-dashoffset="${fmt(state.dashPhase * scale)}"`);
            }
          }
          if (state.strokeAlpha < 0.999) attrs.push(`stroke-opacity="${fmt(state.strokeAlpha)}"`);
        }

        syncClips(state.clipIds);
        body.push(`<path ${attrs.join(' ')}/>`);
        pathCount++;
      }
    }

    if (pendingClip) {
      if (info.d) pushClipPath(info.d, pendingClip);
      pendingClip = null;
    }
  }

  async function emitImage(img: PdfJsImageLike | null, isMask: boolean) {
    if (!img) return;
    const imgBox = transformBBox({ minX: 0, minY: 0, maxX: 1, maxY: 1 }, state.ctm);
    if (!bboxesIntersect(imgBox, regionBBox)) return;

    const dataUrl = imageDataToPngDataUrl(img, isMask ? state.fillColor : undefined);
    if (!dataUrl) return;

    // PDF image space has origin at bottom-left of [0..1]^2; SVG <image> has origin at top-left.
    const m = multiplyMatrix(state.ctm, [1, 0, 0, -1, 0, 1]);
    const opacityAttr = state.fillAlpha < 0.999 ? ` opacity="${fmt(state.fillAlpha)}"` : '';
    syncClips(state.clipIds);
    body.push(
      `<image href="${dataUrl}" width="1" height="1" preserveAspectRatio="none" transform="matrix(${m.map(fmt).join(' ')})"${opacityAttr}/>`,
    );
    imageCount++;
  }

  const { fnArray, argsArray } = ops;
  for (let i = 0; i < fnArray.length; i++) {
    const fn = fnArray[i];
    const args = argsArray[i] as unknown[] | null | undefined;

    if (fn === OPS.save) {
      stack.push(cloneState(state));
    } else if (fn === OPS.restore) {
      const prev = stack.pop();
      if (prev) state = prev;
    } else if (fn === OPS.transform && args && args.length >= 6) {
      state.ctm = multiplyMatrix(state.ctm, [
        Number(args[0]),
        Number(args[1]),
        Number(args[2]),
        Number(args[3]),
        Number(args[4]),
        Number(args[5]),
      ]);
    } else if (fn === OPS.paintFormXObjectBegin) {
      stack.push(cloneState(state));
      const matrix = args?.[0] as ArrayLike<number> | null | undefined;
      if (matrix && matrix.length >= 6) {
        state.ctm = multiplyMatrix(state.ctm, [
          Number(matrix[0]),
          Number(matrix[1]),
          Number(matrix[2]),
          Number(matrix[3]),
          Number(matrix[4]),
          Number(matrix[5]),
        ]);
      }
      const bbox = args?.[1] as ArrayLike<number> | null | undefined;
      if (bbox && bbox.length >= 4) {
        const [x0, y0, x1, y1] = [Number(bbox[0]), Number(bbox[1]), Number(bbox[2]), Number(bbox[3])];
        const clipCmds: PathCmd[] = [
          { kind: 'M', x: x0, y: y0 },
          { kind: 'L', x: x1, y: y0 },
          { kind: 'L', x: x1, y: y1 },
          { kind: 'L', x: x0, y: y1 },
          { kind: 'Z' },
        ];
        const clipInfo = transformPathToSvg(clipCmds, state.ctm);
        if (clipInfo.d) pushClipPath(clipInfo.d, 'nonzero');
      }
    } else if (fn === OPS.paintFormXObjectEnd) {
      const prev = stack.pop();
      if (prev) state = prev;
    } else if (fn === OPS.beginGroup) {
      stack.push(cloneState(state));
    } else if (fn === OPS.endGroup) {
      const prev = stack.pop();
      if (prev) state = prev;
    } else if (fn === OPS.setFillRGBColor) {
      const c = parseRgbArgs(args);
      if (c) state.fillColor = c;
    } else if (fn === OPS.setStrokeRGBColor) {
      const c = parseRgbArgs(args);
      if (c) state.strokeColor = c;
    } else if (fn === OPS.setFillGray) {
      const c = parseGrayArgs(args);
      if (c) state.fillColor = c;
    } else if (fn === OPS.setStrokeGray) {
      const c = parseGrayArgs(args);
      if (c) state.strokeColor = c;
    } else if (fn === OPS.setFillCMYKColor) {
      const c = parseCmykArgs(args);
      if (c) state.fillColor = c;
    } else if (fn === OPS.setStrokeCMYKColor) {
      const c = parseCmykArgs(args);
      if (c) state.strokeColor = c;
    } else if (fn === OPS.setFillTransparent) {
      state.fillColor = 'none';
    } else if (fn === OPS.setStrokeTransparent) {
      state.strokeColor = 'none';
    } else if (fn === OPS.setFillColorN || fn === OPS.setStrokeColorN) {
      const patKind = typeof args?.[0] === 'string' ? args[0] : '';
      if (patKind === 'TilingPattern' || patKind === 'RadialAxial' || patKind === 'Mesh') {
        warningSet.add(
          'This region contains a PDF shading or tiling pattern that SVG conversion approximates; try Vector PDF or PNG if anything looks off.',
        );
      }
    } else if (fn === OPS.shadingFill) {
      warningSet.add(
        'This region contains a PDF shading fill that SVG conversion skips; try Vector PDF or PNG for an exact copy.',
      );
    } else if (fn === OPS.setLineWidth && args && typeof args[0] === 'number') {
      state.lineWidth = args[0];
    } else if (fn === OPS.setLineCap && args && typeof args[0] === 'number') {
      state.lineCap = LINE_CAPS[args[0]] ?? 'butt';
    } else if (fn === OPS.setLineJoin && args && typeof args[0] === 'number') {
      state.lineJoin = LINE_JOINS[args[0]] ?? 'miter';
    } else if (fn === OPS.setMiterLimit && args && typeof args[0] === 'number') {
      state.miterLimit = args[0];
    } else if (fn === OPS.setDash && args) {
      const arr = Array.isArray(args[0]) ? (args[0] as number[]).map(Number) : [];
      state.dashArray = arr;
      state.dashPhase = typeof args[1] === 'number' ? args[1] : 0;
    } else if (fn === OPS.setGState && args && Array.isArray(args[0])) {
      for (const entry of args[0] as Array<[string, unknown]>) {
        if (!Array.isArray(entry)) continue;
        const [k, v] = entry;
        if (k === 'ca' && typeof v === 'number') state.fillAlpha = Math.max(0, Math.min(1, v));
        else if (k === 'CA' && typeof v === 'number') state.strokeAlpha = Math.max(0, Math.min(1, v));
        else if (k === 'LW' && typeof v === 'number') state.lineWidth = v;
        else if (k === 'LC' && typeof v === 'number') state.lineCap = LINE_CAPS[v] ?? 'butt';
        else if (k === 'LJ' && typeof v === 'number') state.lineJoin = LINE_JOINS[v] ?? 'miter';
        else if (k === 'ML' && typeof v === 'number') state.miterLimit = v;
        else if (k === 'D' && Array.isArray(v)) {
          state.dashArray = Array.isArray(v[0]) ? (v[0] as number[]).map(Number) : [];
          state.dashPhase = typeof v[1] === 'number' ? v[1] : 0;
        }
      }
    } else if (fn === OPS.clip) {
      pendingClip = 'nonzero';
    } else if (fn === OPS.eoClip) {
      pendingClip = 'evenodd';
    } else if (fn === OPS.constructPath) {
      const decoded = decodeConstructPathArgs(args, OPS);
      if (decoded.paintOp !== null) {
        applyPaint(decoded.cmds, decoded.paintOp);
        currentPath = [];
      } else {
        currentPath.push(...decoded.cmds);
      }
    } else if (fn === OPS.moveTo && args && args.length >= 2) {
      pathCx = Number(args[0]);
      pathCy = Number(args[1]);
      currentPath.push({ kind: 'M', x: pathCx, y: pathCy });
    } else if (fn === OPS.lineTo && args && args.length >= 2) {
      pathCx = Number(args[0]);
      pathCy = Number(args[1]);
      currentPath.push({ kind: 'L', x: pathCx, y: pathCy });
    } else if (fn === OPS.curveTo && args && args.length >= 6) {
      pathCx = Number(args[4]);
      pathCy = Number(args[5]);
      currentPath.push({
        kind: 'C',
        x1: Number(args[0]),
        y1: Number(args[1]),
        x2: Number(args[2]),
        y2: Number(args[3]),
        x3: pathCx,
        y3: pathCy,
      });
    } else if (fn === OPS.curveTo2 && args && args.length >= 4) {
      const x3 = Number(args[2]);
      const y3 = Number(args[3]);
      currentPath.push({ kind: 'C', x1: pathCx, y1: pathCy, x2: Number(args[0]), y2: Number(args[1]), x3, y3 });
      pathCx = x3;
      pathCy = y3;
    } else if (fn === OPS.curveTo3 && args && args.length >= 4) {
      const x3 = Number(args[2]);
      const y3 = Number(args[3]);
      currentPath.push({ kind: 'C', x1: Number(args[0]), y1: Number(args[1]), x2: x3, y2: y3, x3, y3 });
      pathCx = x3;
      pathCy = y3;
    } else if (fn === OPS.closePath) {
      currentPath.push({ kind: 'Z' });
    } else if (fn === OPS.rectangle && args && args.length >= 4) {
      const x = Number(args[0]);
      const y = Number(args[1]);
      const w = Number(args[2]);
      const h = Number(args[3]);
      currentPath.push(
        { kind: 'M', x, y },
        { kind: 'L', x: x + w, y },
        { kind: 'L', x: x + w, y: y + h },
        { kind: 'L', x, y: y + h },
        { kind: 'Z' },
      );
      pathCx = x;
      pathCy = y;
    } else if (
      fn === OPS.stroke ||
      fn === OPS.closeStroke ||
      fn === OPS.fill ||
      fn === OPS.eoFill ||
      fn === OPS.fillStroke ||
      fn === OPS.eoFillStroke ||
      fn === OPS.closeFillStroke ||
      fn === OPS.closeEOFillStroke ||
      fn === OPS.endPath
    ) {
      applyPaint(currentPath, fn);
      currentPath = [];
    } else if (fn === OPS.paintImageXObject && args && typeof args[0] === 'string') {
      const img = (await resolvePageObject(page, args[0])) as PdfJsImageLike | null;
      await emitImage(img, false);
    } else if (fn === OPS.paintInlineImageXObject && args && args[0]) {
      await emitImage(args[0] as PdfJsImageLike, false);
    } else if (fn === OPS.paintImageMaskXObject && args && args[0]) {
      const raw = args[0] as PdfJsImageLike & { data?: unknown };
      const resolved =
        typeof raw.data === 'string'
          ? ((await resolvePageObject(page, raw.data)) as PdfJsImageLike | null)
          : raw;
      await emitImage(resolved, true);
    } else if (fn === OPS.beginText) {
      inText = true;
      textMatrix = [1, 0, 0, 1, 0, 0];
      textLineMatrix = [1, 0, 0, 1, 0, 0];
    } else if (fn === OPS.endText) {
      inText = false;
    } else if (fn === OPS.setLeading && args && typeof args[0] === 'number') {
      textLeading = args[0];
    } else if (fn === OPS.setTextMatrix && args && args.length >= 6) {
      textMatrix = [
        Number(args[0]),
        Number(args[1]),
        Number(args[2]),
        Number(args[3]),
        Number(args[4]),
        Number(args[5]),
      ];
      textLineMatrix = [...textMatrix] as Matrix2D;
    } else if ((fn === OPS.moveText || fn === OPS.setLeadingMoveText) && args && args.length >= 2) {
      const tx = Number(args[0]);
      const ty = Number(args[1]);
      if (fn === OPS.setLeadingMoveText) textLeading = -ty;
      textLineMatrix = multiplyMatrix(textLineMatrix, [1, 0, 0, 1, tx, ty]);
      textMatrix = [...textLineMatrix] as Matrix2D;
    } else if (fn === OPS.nextLine) {
      textLineMatrix = multiplyMatrix(textLineMatrix, [1, 0, 0, 1, 0, -textLeading]);
      textMatrix = [...textLineMatrix] as Matrix2D;
    } else if (inText && (fn === OPS.showText || fn === OPS.showSpacedText)) {
      const m = multiplyMatrix(state.ctm, textMatrix);
      textColorSamples.push({ x: m[4], y: m[5], color: state.fillColor, alpha: state.fillAlpha });
    }
  }

  // Close any open inner clip groups before emitting text layer.
  syncClips([]);

  // Emit text elements intersecting the target region.
  let textCount = 0;
  try {
    const textContent = await page.getTextContent();
    const styles = (textContent.styles ?? {}) as Record<string, { fontFamily?: string }>;
    for (const rawItem of textContent.items) {
      if (!('str' in rawItem) || !rawItem.str || !rawItem.str.trim()) continue;
      const item = rawItem as { str: string; width: number; height: number; transform: number[]; fontName: string };
      const tBox = textItemViewportBBox(item, vpTransform);
      if (!tBox || !bboxesIntersect(tBox, regionBBox)) continue;

      const tr = item.transform;
      const m = multiplyMatrix(vpTransform, [tr[0], tr[1], tr[2], tr[3], tr[4], tr[5]]);
      const fontSize = Math.hypot(m[2], m[3]) || Math.hypot(m[0], m[1]) || item.height || 10;
      if (fontSize <= 0.1) continue;

      // Normalize orientation while inverting local Y so SVG ascenders align with PDF +Y.
      const a = m[0] / fontSize;
      const b = m[1] / fontSize;
      const c = -m[2] / fontSize;
      const d = -m[3] / fontSize;
      const e = m[4];
      const f = m[5];

      const isUpright =
        Math.abs(a - 1) < 0.02 && Math.abs(b) < 0.02 && Math.abs(c) < 0.02 && Math.abs(d - 1) < 0.02;

      const family = styles[item.fontName]?.fontFamily || 'sans-serif';

      // Match nearest recorded text fill color within 3 pt if available.
      let fill = '#000000';
      let alpha = 1;
      let bestDist = 9; // 3 pt squared
      for (let s = 0; s < textColorSamples.length; s++) {
        const sample = textColorSamples[s];
        const dx = sample.x - e;
        const dy = sample.y - f;
        const dist2 = dx * dx + dy * dy;
        if (dist2 < bestDist) {
          bestDist = dist2;
          fill = sample.color === 'none' ? '#000000' : sample.color;
          alpha = sample.alpha;
        }
      }

      const attrs: string[] = [];
      if (isUpright) {
        attrs.push(`x="${fmt(e)}"`, `y="${fmt(f)}"`);
      } else {
        attrs.push(`transform="matrix(${[a, b, c, d, e, f].map(fmt).join(' ')})"`);
      }
      attrs.push(`font-size="${fmt(fontSize)}"`);
      attrs.push(`font-family="${escapeXml(family)}"`);
      attrs.push(`fill="${escapeXml(fill)}"`);
      if (alpha < 0.999) attrs.push(`fill-opacity="${fmt(alpha)}"`);
      attrs.push('xml:space="preserve"');

      body.push(`<text ${attrs.join(' ')}>${escapeXml(item.str)}</text>`);
      textCount++;
    }
  } catch {
    // Text extraction failure shouldn't block vector path SVG output.
  }

  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${fmt(box.x)} ${fmt(box.y)} ${fmt(box.width)} ${fmt(box.height)}" width="${fmt(box.width)}" height="${fmt(box.height)}">`,
    `<defs>${defs.join('')}</defs>`,
    `<g clip-path="url(#clip-root)">`,
    ...body,
    '</g>',
    '</svg>',
  ].join('\n');

  return {
    svg,
    width: box.width,
    height: box.height,
    pathCount,
    imageCount,
    textCount,
    warnings: Array.from(warningSet),
  };
}

// Convenience helper: loads a PDF from bytes (in browser or Node) and converts a page or region to SVG.
export async function pdfBytesToSvg(
  bytes: Uint8Array,
  opts?: PdfBytesToSvgOptions,
): Promise<PdfToSvgResult> {
  const pageIndex = opts?.pageIndex ?? 0;

  if (typeof window !== 'undefined') {
    const { doc, close } = await openPdf(bytes, opts?.password);
    try {
      const page = await doc.getPage(pageIndex + 1);
      const ops = await page.getOperatorList();
      return await pdfPageRegionToSvg(page, ops, opts?.rect);
    } finally {
      await close();
    }
  }

  // Node / non-DOM execution path (used by verification harnesses and tests).
  const pdfjs = await import('pdfjs-dist');
  const task = pdfjs.getDocument({
    data: bytes.slice(),
    password: opts?.password,
    verbosity: 0,
  });
  try {
    const doc = await task.promise;
    const page = await doc.getPage(pageIndex + 1);
    const ops = await page.getOperatorList();
    return await pdfPageRegionToSvg(page, ops, opts?.rect, pdfjs.OPS as unknown as Record<string, number>);
  } finally {
    await task.destroy();
  }
}
