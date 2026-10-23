// Module matrix construction: function patterns, codeword placement, data masks and format information.

import { bchEncode } from './reedSolomon';
import { Symbology } from './segments';
import { MODEL2_ALIGNMENT, RMQR_ALIGNMENT, RMQR_SIZES } from './tables';

export type EcLevel = 'L' | 'M' | 'Q' | 'H';

export class Grid {
  readonly width: number;
  readonly height: number;
  readonly dark: Uint8Array;
  readonly func: Uint8Array;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.dark = new Uint8Array(width * height);
    this.func = new Uint8Array(width * height);
  }

  inside(x: number, y: number) {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  get(x: number, y: number) {
    return this.dark[y * this.width + x] === 1;
  }

  isFunction(x: number, y: number) {
    return this.func[y * this.width + x] === 1;
  }

  setFunction(x: number, y: number, dark: boolean) {
    if (!this.inside(x, y)) return;
    this.dark[y * this.width + x] = dark ? 1 : 0;
    this.func[y * this.width + x] = 1;
  }

  setData(x: number, y: number, dark: boolean) {
    this.dark[y * this.width + x] = dark ? 1 : 0;
  }

  clone(): Grid {
    const g = new Grid(this.width, this.height);
    g.dark.set(this.dark);
    g.func.set(this.func);
    return g;
  }
}

export function symbolSize(sym: Symbology, version: number): [number, number] {
  switch (sym) {
    case 'qr2':
    case 'qr1': return [17 + 4 * version, 17 + 4 * version];
    case 'micro': return [9 + 2 * version, 9 + 2 * version];
    case 'rmqr': return RMQR_SIZES[version - 1];
  }
}

// ---------------------------------------------------------------------------------------------
// Function patterns

// Finder pattern centred at (cx, cy), including the light separator ring around it.
function drawFinder(g: Grid, cx: number, cy: number) {
  for (let dy = -4; dy <= 4; dy++) {
    for (let dx = -4; dx <= 4; dx++) {
      const d = Math.max(Math.abs(dx), Math.abs(dy));
      g.setFunction(cx + dx, cy + dy, d !== 2 && d !== 4);
    }
  }
}

// 5x5 pattern used both for Model 2 alignment patterns and the rMQR finder sub-pattern.
function drawAlignment5(g: Grid, cx: number, cy: number) {
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) g.setFunction(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }
}

function buildModel2(version: number): Grid {
  const size = 17 + 4 * version;
  const g = new Grid(size, size);

  for (let i = 0; i < size; i++) {
    g.setFunction(6, i, i % 2 === 0);
    g.setFunction(i, 6, i % 2 === 0);
  }
  drawFinder(g, 3, 3);
  drawFinder(g, size - 4, 3);
  drawFinder(g, 3, size - 4);

  const pos = MODEL2_ALIGNMENT[version - 1];
  const last = pos.length - 1;
  for (let i = 0; i <= last; i++) {
    for (let j = 0; j <= last; j++) {
      if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) continue;
      drawAlignment5(g, pos[i], pos[j]);
    }
  }

  drawQrFormat(g, 0);
  if (version >= 7) {
    const bits = bchEncode(version, 12, 0x1f25);
    for (let i = 0; i < 18; i++) {
      const bit = ((bits >>> i) & 1) === 1;
      const a = size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      g.setFunction(a, b, bit);
      g.setFunction(b, a, bit);
    }
  }
  return g;
}

// Top-left corners of the Model 1 extension patterns: 2x4 blocks on the right edge and 4x2 blocks on
// the bottom edge, at every other codeword position (see model1CodewordPositions).
function model1Extensions(size: number): { x: number; y: number; vertical: boolean }[] {
  const out = [];
  const rows = (size - 8) >> 2;
  for (let i = 2; i < rows - 1; i += 2) out.push({ x: size - 2, y: size - 4 - 4 * i, vertical: true });
  const columns = (size >> 2) + 3;
  for (let j = 3; j < columns - 5; j += 2) out.push({ x: size - 8 - (j - 2) * 4, y: size - 2, vertical: false });
  return out;
}

function buildModel1(version: number): Grid {
  const size = 17 + 4 * version;
  const g = new Grid(size, size);

  for (let i = 0; i < size; i++) {
    g.setFunction(6, i, i % 2 === 0);
    g.setFunction(i, 6, i % 2 === 0);
  }
  drawFinder(g, 3, 3);
  drawFinder(g, size - 4, 3);
  drawFinder(g, 3, size - 4);

  // Extension patterns: a two module wide strip, dark along the symbol edge and light on the inside.
  for (const { x, y, vertical } of model1Extensions(size)) {
    for (let d = 0; d < 4; d++) {
      if (vertical) {
        g.setFunction(x, y + d, false);
        g.setFunction(x + 1, y + d, true);
      } else {
        g.setFunction(x + d, y, false);
        g.setFunction(x + d, y + 1, true);
      }
    }
  }

  // The bottom right 2x2 corner holds the four leading bits of the first codeword. It is not masked:
  // only the outermost module is dark (as in real Model 1 symbols).
  g.setFunction(size - 1, size - 1, true);
  g.setFunction(size - 2, size - 1, false);
  g.setFunction(size - 1, size - 2, false);
  g.setFunction(size - 2, size - 2, false);

  drawQrFormat(g, 0);
  return g;
}

function buildMicro(version: number): Grid {
  const size = 9 + 2 * version;
  const g = new Grid(size, size);
  drawFinder(g, 3, 3);
  for (let i = 8; i < size; i++) {
    g.setFunction(i, 0, i % 2 === 0);
    g.setFunction(0, i, i % 2 === 0);
  }
  drawMicroFormat(g, 0);
  return g;
}

function buildRmqr(version: number): Grid {
  const [w, h] = RMQR_SIZES[version - 1];
  const g = new Grid(w, h);

  // Timing patterns along all four edges; finders and corner patterns overwrite parts of them.
  for (let x = 0; x < w; x++) {
    g.setFunction(x, 0, x % 2 === 0);
    g.setFunction(x, h - 1, x % 2 === 0);
  }
  for (let y = 0; y < h; y++) {
    g.setFunction(0, y, y % 2 === 0);
    g.setFunction(w - 1, y, y % 2 === 0);
  }

  // Corner finder patterns (top right and bottom left).
  const corner = (x: number, y: number, sx: number, sy: number) => {
    g.setFunction(x, y, true);
    g.setFunction(x + sx, y, true);
    g.setFunction(x + 2 * sx, y, true);
    g.setFunction(x, y + sy, true);
    g.setFunction(x + sx, y + sy, false);
    g.setFunction(x, y + 2 * sy, true);
  };
  corner(w - 1, 0, -1, 1);
  corner(0, h - 1, 1, -1);

  drawFinder(g, 3, 3);

  for (const cx of RMQR_ALIGNMENT[version - 1]) {
    for (const cy of [1, h - 2]) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) g.setFunction(cx + dx, cy + dy, dx !== 0 || dy !== 0);
      }
    }
    for (let y = 3; y < h - 3; y++) g.setFunction(cx, y, y % 2 === 0);
  }

  drawAlignment5(g, w - 3, h - 3);
  drawRmqrFormat(g, 0);
  return g;
}

export function buildFunctionPatterns(sym: Symbology, version: number): Grid {
  switch (sym) {
    case 'qr2': return buildModel2(version);
    case 'qr1': return buildModel1(version);
    case 'micro': return buildMicro(version);
    case 'rmqr': return buildRmqr(version);
  }
}

// ---------------------------------------------------------------------------------------------
// Format information

const EC_FORMAT_BITS: Record<EcLevel, number> = { L: 1, M: 0, Q: 3, H: 2 };

export function qrFormatBits(ec: EcLevel, mask: number, model1: boolean): number {
  return bchEncode((EC_FORMAT_BITS[ec] << 3) | mask, 10, 0x537) ^ (model1 ? 0x2825 : 0x5412);
}

function drawQrFormat(g: Grid, bits: number) {
  const size = g.width;
  const bit = (i: number) => ((bits >>> i) & 1) === 1;
  for (let i = 0; i <= 5; i++) g.setFunction(8, i, bit(i));
  g.setFunction(8, 7, bit(6));
  g.setFunction(8, 8, bit(7));
  g.setFunction(7, 8, bit(8));
  for (let i = 9; i < 15; i++) g.setFunction(14 - i, 8, bit(i));
  for (let i = 0; i < 8; i++) g.setFunction(size - 1 - i, 8, bit(i));
  for (let i = 8; i < 15; i++) g.setFunction(8, size - 15 + i, bit(i));
  g.setFunction(8, size - 8, true); // dark module
}

// Micro QR symbol numbers (ISO/IEC 18004:2015 Table 13).
export function microSymbolNumber(version: number, ec: EcLevel): number {
  switch (version) {
    case 1: return 0;
    case 2: return ec === 'L' ? 1 : 2;
    case 3: return ec === 'L' ? 3 : 4;
    default: return ec === 'L' ? 5 : ec === 'M' ? 6 : 7;
  }
}

export function microFormatBits(version: number, ec: EcLevel, mask: number): number {
  return bchEncode((microSymbolNumber(version, ec) << 2) | mask, 10, 0x537) ^ 0x4445;
}

function drawMicroFormat(g: Grid, bits: number) {
  const bit = (i: number) => ((bits >>> i) & 1) === 1;
  for (let i = 0; i < 8; i++) g.setFunction(8 - i, 8, bit(7 + i));
  for (let i = 0; i < 7; i++) g.setFunction(8, 1 + i, bit(i));
}

export function rmqrFormatBits(version: number, ec: EcLevel): [number, number] {
  const bits = bchEncode(((ec === 'H' ? 1 : 0) << 5) | (version - 1), 12, 0x1f25);
  return [bits ^ 0x1fab2, bits ^ 0x20a7b];
}

function drawRmqrFormat(g: Grid, finderSide: number, subSide = finderSide) {
  const w = g.width;
  const h = g.height;
  for (let u = 0; u < 18; u++) {
    g.setFunction(8 + Math.floor(u / 5), 1 + (u % 5), ((finderSide >>> u) & 1) === 1);
    const dark = ((subSide >>> u) & 1) === 1;
    if (u < 15) g.setFunction(w - 8 + Math.floor(u / 5), h - 6 + (u % 5), dark);
    else g.setFunction(w - 8 + (u - 12), h - 6, dark);
  }
}

export function drawFormat(g: Grid, sym: Symbology, version: number, ec: EcLevel, mask: number) {
  switch (sym) {
    case 'qr2': drawQrFormat(g, qrFormatBits(ec, mask, false)); break;
    case 'qr1': drawQrFormat(g, qrFormatBits(ec, mask, true)); break;
    case 'micro': drawMicroFormat(g, microFormatBits(version, ec, mask)); break;
    case 'rmqr': {
      const [a, b] = rmqrFormatBits(version, ec);
      drawRmqrFormat(g, a, b);
      break;
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Codeword placement

// Standard two-module-wide zigzag used by Model 2, Micro QR and rMQR. Returns the number of bits placed.
function placeZigzag(g: Grid, bits: number[], startX: number, skipColumn: number): number {
  let i = 0;
  let upward = true;
  for (let right = startX; right >= 1; right -= 2) {
    if (right === skipColumn) right--;
    for (let v = 0; v < g.height; v++) {
      const y = upward ? g.height - 1 - v : v;
      for (let dx = 0; dx < 2; dx++) {
        const x = right - dx;
        if (g.isFunction(x, y)) continue;
        g.setData(x, y, i < bits.length ? bits[i] === 1 : false);
        i++;
      }
    }
    upward = !upward;
  }
  return i;
}

// Module positions of every Model 1 codeword, most significant bit first. Codewords are 2x4 blocks
// along the right and left columns and 4x2 blocks in the middle, read from the bottom right corner.
export function model1CodewordPositions(size: number): [number, number][][] {
  const out: [number, number][][] = [];
  const columns = (size >> 2) + 3;
  const vertical = (x: number, y: number) => Array.from({ length: 8 }, (_, b) => [x - (b % 2), y - (b >> 1)] as [number, number]);
  const horizontal = (x: number, y: number) => Array.from({ length: 8 }, (_, b) => [x - (b % 4), y - (b >> 2)] as [number, number]);

  for (let j = 0; j < columns; j++) {
    if (j <= 1) {
      const rows = (size - 8) >> 2;
      for (let i = 0; i < rows; i++) {
        if (j === 0 && i % 2 === 0 && i > 0 && i < rows - 1) continue; // extension pattern
        out.push(vertical(size - 1 - j * 2, size - 1 - i * 4));
      }
    } else if (columns - j <= 4) {
      const rows = (size - 16) >> 2;
      for (let i = 0; i < rows; i++) {
        const x = (columns - j - 1) * 2 + 1 + (columns - j === 4 ? 1 : 0); // skip the timing column
        out.push(vertical(x, size - 9 - i * 4));
      }
    } else {
      const rows = size >> 1;
      for (let i = 0; i < rows; i++) {
        if (j === 2 && i >= rows - 4) continue; // top right finder pattern
        if (i === 0 && j % 2 === 1 && j + 1 !== columns - 4) continue; // extension pattern
        out.push(horizontal(size - 5 - (j - 2) * 4, size - 1 - i * 2 - (i >= rows - 3 ? 1 : 0)));
      }
    }
  }
  return out;
}

export function placeCodewords(g: Grid, sym: Symbology, bits: number[]) {
  switch (sym) {
    case 'qr2': placeZigzag(g, bits, g.width - 1, 6); break;
    case 'micro': placeZigzag(g, bits, g.width - 1, -1); break;
    case 'rmqr': placeZigzag(g, bits, g.width - 2, -1); break;
    case 'qr1': {
      const positions = model1CodewordPositions(g.width);
      let i = 0;
      for (const cw of positions) {
        for (const [x, y] of cw) {
          if (i < 4) { // the corner, see buildModel1
            i++;
            continue;
          }
          if (g.isFunction(x, y)) throw new Error(`Internal error: Model 1 codeword overlaps function pattern at ${x},${y}`);
          g.setData(x, y, i < bits.length ? bits[i] === 1 : false);
          i++;
        }
      }
      break;
    }
  }
}

// Number of codeword modules available in the symbol (after function patterns).
export function dataModuleCount(g: Grid): number {
  let n = 0;
  for (let i = 0; i < g.func.length; i++) if (!g.func[i]) n++;
  return n;
}

// ---------------------------------------------------------------------------------------------
// Masking

export function maskBit(mask: number, x: number, y: number): boolean {
  switch (mask) {
    case 0: return (x + y) % 2 === 0;
    case 1: return y % 2 === 0;
    case 2: return x % 3 === 0;
    case 3: return (x + y) % 3 === 0;
    case 4: return (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0;
    case 5: return ((x * y) % 2) + ((x * y) % 3) === 0;
    case 6: return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
    case 7: return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
  }
  throw new Error(`Invalid mask ${mask}`);
}

// Micro QR masks 0-3 are Model 2 masks 1, 4, 6 and 7; rMQR always uses Model 2 mask 4.
export function maskCount(sym: Symbology): number {
  return sym === 'micro' ? 4 : sym === 'rmqr' ? 1 : 8;
}

function physicalMask(sym: Symbology, mask: number): number {
  if (sym === 'micro') return [1, 4, 6, 7][mask];
  if (sym === 'rmqr') return 4;
  return mask;
}

export function applyMask(g: Grid, sym: Symbology, mask: number) {
  const m = physicalMask(sym, mask);
  for (let y = 0; y < g.height; y++) {
    for (let x = 0; x < g.width; x++) {
      const i = y * g.width + x;
      if (!g.func[i] && maskBit(m, x, y)) g.dark[i] ^= 1;
    }
  }
}

// Model 1 / Model 2 mask penalty (ISO/IEC 18004:2015 7.8.3). Lower is better.
export function penaltyScore(g: Grid): number {
  const size = g.width;
  let result = 0;

  const line = (getter: (i: number) => number) => {
    // N1: runs of five or more modules of the same colour.
    let runColor = -1;
    let run = 0;
    for (let i = 0; i < size; i++) {
      const c = getter(i);
      if (c === runColor) {
        run++;
        if (run === 5) result += 3;
        else if (run > 5) result++;
      } else {
        runColor = c;
        run = 1;
      }
    }
    // N3: 1:1:3:1:1 finder-like patterns with four light modules on one side (outside counts as light).
    const at = (i: number) => (i < 0 || i >= size ? 0 : getter(i));
    for (let i = 0; i + 6 < size; i++) {
      if (at(i) === 1 && at(i + 1) === 0 && at(i + 2) === 1 && at(i + 3) === 1 && at(i + 4) === 1 && at(i + 5) === 0 && at(i + 6) === 1) {
        const before = at(i - 1) === 0 && at(i - 2) === 0 && at(i - 3) === 0 && at(i - 4) === 0;
        const after = at(i + 7) === 0 && at(i + 8) === 0 && at(i + 9) === 0 && at(i + 10) === 0;
        if (before) result += 40;
        if (after) result += 40;
      }
    }
  };

  for (let y = 0; y < size; y++) line((x) => g.dark[y * size + x]);
  for (let x = 0; x < size; x++) line((y) => g.dark[y * size + x]);

  // N2: 2x2 blocks of the same colour.
  for (let y = 0; y < size - 1; y++) {
    for (let x = 0; x < size - 1; x++) {
      const c = g.dark[y * size + x];
      if (c === g.dark[y * size + x + 1] && c === g.dark[(y + 1) * size + x] && c === g.dark[(y + 1) * size + x + 1]) result += 3;
    }
  }

  // N4: balance of dark and light modules.
  let dark = 0;
  for (let i = 0; i < g.dark.length; i++) dark += g.dark[i];
  const total = size * size;
  const k = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1;
  result += Math.max(0, k) * 10;
  return result;
}

// Micro QR mask evaluation (ISO/IEC 18004:2015 7.8.3.2). Higher is better.
export function microMaskScore(g: Grid): number {
  const size = g.width;
  let sum1 = 0;
  let sum2 = 0;
  for (let i = 1; i < size; i++) {
    sum1 += g.dark[i * size + size - 1];
    sum2 += g.dark[(size - 1) * size + i];
  }
  return sum1 <= sum2 ? sum1 * 16 + sum2 : sum2 * 16 + sum1;
}
