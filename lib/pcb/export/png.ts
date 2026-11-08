// PNG export of the PCB viewer: the picture on screen, or the whole board at a chosen resolution. The whole board is
// drawn in tiles of 1024 pixels, each with every layer of the picture, so that large boards at high resolutions
// need little memory besides the image itself, and the page stays responsive (with progress) while it is drawn. The
// resolution is written into the file (pHYs), so the image has its real size when printed or placed.
import { Board, Box, isEmptyBox, unionBox } from '../model';
import { shapeBox } from '../outline';
import { Frame, newSurface, Surface } from '../render/paint';
import { BACKGROUND, BoardView, LayerStyle, ViewMode } from '../render/view';

// The largest image: browsers limit canvases to 16384 pixels a side, and memory to a few hundred megapixels.
export const MAX_SIDE = 16384;
export const MAX_PIXELS = 100e6;
const TILE = 1024;
const SLICE_MS = 30;

export class Cancelled extends Error {
  constructor() {
    super('Cancelled.');
  }
}

// The area of a whole-board image or SVG: the board shape in the realistic view, the shown layers in the layer view,
// with a small margin.
export function boardImageBox(board: Board, mode: ViewMode, styles: Map<string, LayerStyle>): Box | null {
  let box: Box | null = null;
  if (mode === 'realistic' && board.outline?.length) box = shapeBox(board.outline);
  else {
    for (const l of board.layers) {
      if (!styles.get(l.id)?.visible || isEmptyBox(l.bbox)) continue;
      box = box ? unionBox(box, l.bbox) : { ...l.bbox };
    }
  }
  if (!box || isEmptyBox(box)) return null;
  const margin = Math.max(1, 0.02 * Math.max(box.maxX - box.minX, box.maxY - box.minY));
  return { minX: box.minX - margin, minY: box.minY - margin, maxX: box.maxX + margin, maxY: box.maxY + margin };
}

export function imageSize(box: Box, pxPerMm: number): { width: number; height: number; fits: boolean } {
  const width = Math.max(1, Math.round((box.maxX - box.minX) * pxPerMm));
  const height = Math.max(1, Math.round((box.maxY - box.minY) * pxPerMm));
  return { width, height, fits: width <= MAX_SIDE && height <= MAX_SIDE && width * height <= MAX_PIXELS };
}

function toBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('The browser could not make the image (it may be too large).'))), 'image/png');
  });
}

// --- pHYs: pixels per metre, so the image keeps its size ---

let crcTable: Uint32Array | null = null;

function crc32(bytes: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (const b of bytes) crc = crcTable[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

// Adds a pHYs chunk after the header of a PNG (browsers write none).
async function withResolution(blob: Blob, pxPerMm: number): Promise<Blob> {
  const png = new Uint8Array(await blob.arrayBuffer());
  // Signature (8) and IHDR (4 length + 4 type + 13 data + 4 CRC).
  const at = 8 + 25;
  if (png.length < at || String.fromCharCode(...png.subarray(12, 16)) !== 'IHDR') return blob;
  const ppm = Math.round(pxPerMm * 1000);
  const chunk = new Uint8Array(21);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, 9);
  chunk.set([0x70, 0x48, 0x59, 0x73], 4);
  view.setUint32(8, ppm);
  view.setUint32(12, ppm);
  chunk[16] = 1;
  view.setUint32(17, crc32(chunk.subarray(4, 17)));
  return new Blob([png.subarray(0, at), chunk, png.subarray(at)], { type: 'image/png' });
}

export interface PngOptions {
  // What is on screen, or the whole board (the area `box`, from boardImageBox).
  what: 'screen' | 'board';
  box: Box | null;
  pxPerMm: number;
  transparent: boolean;
  onProgress?: (done: number) => void;
  signal?: AbortSignal;
}

export async function exportPng(view: BoardView, o: PngOptions): Promise<Blob> {
  if (o.what === 'screen') {
    const canvas = await view.snapshot(o.transparent);
    const frame = view.screenFrame();
    return withResolution(await toBlob(canvas), frame.scale);
  }
  const box = o.box;
  if (!box) throw new Error('There is nothing to save.');
  const size = imageSize(box, o.pxPerMm);
  if (!size.fits) throw new Error(`An image of ${size.width} × ${size.height} pixels is too large; choose a lower resolution.`);
  const out = newSurface(size.width, size.height);
  if (out.canvas.width !== size.width) throw new Error('The browser could not make an image this large; choose a lower resolution.');
  const flipped = view.isFlipped();
  const pool: Surface[] = [];
  const tile = newSurface();
  const cols = Math.ceil(size.width / TILE);
  const rows = Math.ceil(size.height / TILE);
  let sliceStart = performance.now();
  const pause = async () => {
    if (o.signal?.aborted) throw new Cancelled();
    if (performance.now() - sliceStart > SLICE_MS) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      if (o.signal?.aborted) throw new Cancelled();
      sliceStart = performance.now();
    }
  };
  try {
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        const x0 = c * TILE;
        const y0 = r * TILE;
        const w = Math.min(TILE, size.width - x0);
        const h = Math.min(TILE, size.height - y0);
        // The board point at the tile's centre; seen from the bottom, X runs the other way.
        const ox = (x0 + w / 2) / o.pxPerMm;
        const frame: Frame = {
          scale: o.pxPerMm,
          cx: flipped ? box.maxX - ox : box.minX + ox,
          cy: box.maxY - (y0 + h / 2) / o.pxPerMm,
          flipped,
          width: w,
          height: h,
        };
        await view.paintFrame(tile, frame, o.transparent ? null : BACKGROUND, pool, pause);
        out.ctx.drawImage(tile.canvas, x0, y0);
        o.onProgress?.((r * cols + c + 1) / (rows * cols));
      }
    }
    return await withResolution(await toBlob(out.canvas), o.pxPerMm);
  } finally {
    for (const s of [...pool, tile, out]) {
      s.canvas.width = 0;
      s.canvas.height = 0;
    }
  }
}
