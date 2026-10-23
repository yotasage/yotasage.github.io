// Data segments: mode indicators, character count indicators and the bit encoding of each mode.

import { Charset, encodeChar, kanjiValue } from './charsets';
import { RMQR_COUNT_BITS } from './tables';

export type Symbology = 'qr2' | 'qr1' | 'micro' | 'rmqr';
export type Mode = 'numeric' | 'alphanumeric' | 'byte' | 'kanji';
export type Indicator = Mode | 'eci' | 'structuredAppend' | 'fnc1First' | 'fnc1Second';

export const MODES: Mode[] = ['numeric', 'alphanumeric', 'byte', 'kanji'];

export const MODE_LABELS: Record<Mode, string> = {
  numeric: 'Numeric',
  alphanumeric: 'Alphanumeric',
  byte: 'Byte',
  kanji: 'Kanji',
};

const ALPHANUMERIC = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';
const GS = '\x1d';

// One input character (or one raw byte) together with every way it can be encoded.
export interface Unit {
  ch: string;
  bytes: number[] | null;   // byte mode representation, null if the charset cannot represent it
  numeric: boolean;
  alnum: number[] | null;   // alphanumeric values (two values for a literal '%' in FNC1 mode)
  kanji: number;            // 13 bit Kanji mode value, -1 if not a Kanji mode character
}

export interface Segment {
  mode: Mode;
  units: Unit[];
}

// [value, bit length] of a mode indicator, or null if the symbology does not support it.
export function modeIndicator(sym: Symbology, version: number, ind: Indicator): [number, number] | null {
  if (sym === 'micro') {
    const values: Partial<Record<Indicator, number>> = { numeric: 0, alphanumeric: 1, byte: 2, kanji: 3 };
    return ind in values ? [values[ind], version - 1] : null;
  }
  if (sym === 'rmqr') {
    const values: Partial<Record<Indicator, number>> = {
      numeric: 1, alphanumeric: 2, byte: 3, kanji: 4, fnc1First: 5, fnc1Second: 6, eci: 7,
    };
    return ind in values ? [values[ind], 3] : null;
  }
  const values: Partial<Record<Indicator, number>> = {
    numeric: 1, alphanumeric: 2, byte: 4, kanji: 8, structuredAppend: 3, fnc1First: 5, fnc1Second: 9, eci: 7,
  };
  // Model 1 predates ECI, FNC1 and Structured Append.
  if (sym === 'qr1' && (ind === 'eci' || ind === 'fnc1First' || ind === 'fnc1Second' || ind === 'structuredAppend')) return null;
  return ind in values ? [values[ind], 4] : null;
}

export function terminatorBits(sym: Symbology, version: number): number {
  if (sym === 'micro') return version * 2 + 1;
  return sym === 'rmqr' ? 3 : 4;
}

export function modeAllowed(sym: Symbology, version: number, mode: Mode): boolean {
  if (sym !== 'micro') return true;
  if (version === 1) return mode === 'numeric';
  if (version === 2) return mode === 'numeric' || mode === 'alphanumeric';
  return true;
}

export function countBits(sym: Symbology, version: number, mode: Mode): number {
  if (sym === 'micro') {
    const table: Record<Mode, number[]> = {
      numeric: [3, 4, 5, 6],
      alphanumeric: [0, 3, 4, 5],
      byte: [0, 0, 4, 5],
      kanji: [0, 0, 3, 4],
    };
    return table[mode][version - 1];
  }
  if (sym === 'rmqr') return RMQR_COUNT_BITS[mode][version - 1];

  const i = version <= 9 ? 0 : version <= 26 ? 1 : 2;
  const table: Record<Mode, number[]> = {
    numeric: [10, 12, 14],
    alphanumeric: [9, 11, 13],
    byte: [8, 16, 16],
    kanji: [8, 10, 12],
  };
  return table[mode][i];
}

export function makeUnits(input: string | Uint8Array, charset: Charset, gs1: boolean): Unit[] {
  const alnumOf = (ch: string): number[] | null => {
    if (gs1 && ch === GS) return [ALPHANUMERIC.indexOf('%')];
    if (gs1 && ch === '%') return [ALPHANUMERIC.indexOf('%'), ALPHANUMERIC.indexOf('%')];
    const i = ALPHANUMERIC.indexOf(ch);
    return i >= 0 ? [i] : null;
  };

  if (input instanceof Uint8Array) {
    return Array.from(input, (b) => {
      const ch = String.fromCharCode(b);
      const ascii = b < 0x80;
      return {
        ch,
        bytes: [b],
        numeric: ascii && b >= 0x30 && b <= 0x39,
        alnum: ascii ? alnumOf(ch) : null,
        kanji: -1,
      };
    });
  }

  const units: Unit[] = [];
  for (const ch of input) {
    units.push({
      ch,
      bytes: encodeChar(ch, charset),
      numeric: ch >= '0' && ch <= '9',
      alnum: alnumOf(ch),
      kanji: kanjiValue(ch),
    });
  }
  return units;
}

export function unitFits(unit: Unit, mode: Mode): boolean {
  switch (mode) {
    case 'numeric': return unit.numeric;
    case 'alphanumeric': return unit.alnum !== null;
    case 'byte': return unit.bytes !== null;
    case 'kanji': return unit.kanji >= 0;
  }
}

export function segmentCount(seg: Segment): number {
  switch (seg.mode) {
    case 'alphanumeric': return seg.units.reduce((n, u) => n + u.alnum.length, 0);
    case 'byte': return seg.units.reduce((n, u) => n + u.bytes.length, 0);
    default: return seg.units.length;
  }
}

export function segmentDataBitLength(seg: Segment): number {
  const n = segmentCount(seg);
  switch (seg.mode) {
    case 'numeric': return Math.floor(n / 3) * 10 + [0, 4, 7][n % 3];
    case 'alphanumeric': return Math.floor(n / 2) * 11 + (n % 2) * 6;
    case 'byte': return n * 8;
    case 'kanji': return n * 13;
  }
}

export function appendBits(out: number[], value: number, length: number) {
  for (let i = length - 1; i >= 0; i--) out.push((value >>> i) & 1);
}

export function appendSegmentData(out: number[], seg: Segment) {
  switch (seg.mode) {
    case 'numeric': {
      const digits = seg.units.map((u) => u.ch).join('');
      for (let i = 0; i < digits.length; i += 3) {
        const group = digits.slice(i, i + 3);
        appendBits(out, parseInt(group, 10), group.length * 3 + 1);
      }
      break;
    }
    case 'alphanumeric': {
      const values = seg.units.flatMap((u) => u.alnum);
      for (let i = 0; i + 1 < values.length; i += 2) appendBits(out, values[i] * 45 + values[i + 1], 11);
      if (values.length % 2) appendBits(out, values[values.length - 1], 6);
      break;
    }
    case 'byte':
      for (const u of seg.units) for (const b of u.bytes) appendBits(out, b, 8);
      break;
    case 'kanji':
      for (const u of seg.units) appendBits(out, u.kanji, 13);
      break;
  }
}

export function eciDesignator(out: number[], value: number) {
  if (value < 0 || value > 999999 || !Number.isInteger(value)) throw new Error('ECI designator must be an integer from 0 to 999999.');
  if (value < 128) appendBits(out, value, 8);
  else if (value < 16384) appendBits(out, 0x8000 | value, 16);
  else appendBits(out, 0xc00000 | value, 24);
}

// Splits segments whose character count does not fit in the character count indicator.
export function splitLongSegments(segments: Segment[], sym: Symbology, version: number): Segment[] {
  const out: Segment[] = [];
  for (const seg of segments) {
    const max = (1 << countBits(sym, version, seg.mode)) - 1;
    let current: Unit[] = [];
    let count = 0;
    for (const u of seg.units) {
      const size = seg.mode === 'alphanumeric' ? u.alnum.length : seg.mode === 'byte' ? u.bytes.length : 1;
      if (count + size > max && current.length) {
        out.push({ mode: seg.mode, units: current });
        current = [];
        count = 0;
      }
      current.push(u);
      count += size;
    }
    if (current.length || seg.units.length === 0) out.push({ mode: seg.mode, units: current });
  }
  return out;
}

// Finds the segmentation with the fewest bits using dynamic programming over the four modes.
// Costs are tracked in sixths of a bit so that numeric (10/3) and alphanumeric (11/2) characters are exact.
// Returns null when some character cannot be encoded with the modes available in this version.
export function optimalSegments(units: Unit[], sym: Symbology, version: number, allowKanji: boolean): Segment[] | null {
  const modes = MODES.filter((m) => modeAllowed(sym, version, m) && (allowKanji || m !== 'kanji'));
  if (units.length === 0) return [];

  const modeBits = modeIndicator(sym, version, 'numeric')[1];
  const headCost = modes.map((m) => (modeBits + countBits(sym, version, m)) * 6);
  const charCost = (u: Unit, m: Mode) => {
    switch (m) {
      case 'numeric': return 20;
      case 'alphanumeric': return 33 * u.alnum.length;
      case 'byte': return 48 * u.bytes.length;
      case 'kanji': return 78;
    }
  };

  // choice[i][j]: the mode character i is encoded in, given that the open segment after i is modes[j].
  const choice: number[][] = [];
  let prev = headCost.slice();
  for (const u of units) {
    const ext = modes.map((m, j) => (unitFits(u, m) ? prev[j] + charCost(u, m) : Infinity));
    const cur = ext.slice();
    const here = modes.map((_, j) => (ext[j] < Infinity ? j : -1));
    for (let j = 0; j < modes.length; j++) {
      for (let k = 0; k < modes.length; k++) {
        if (k === j || ext[k] === Infinity) continue;
        const cost = Math.ceil(ext[k] / 6) * 6 + headCost[j];
        if (cost < cur[j]) {
          cur[j] = cost;
          here[j] = k;
        }
      }
    }
    if (here.every((h) => h < 0)) return null;
    choice.push(here);
    prev = cur;
  }

  let state = 0;
  for (let j = 1; j < modes.length; j++) if (prev[j] < prev[state]) state = j;
  if (prev[state] === Infinity) return null;

  const charModes: number[] = new Array(units.length);
  for (let i = units.length - 1; i >= 0; i--) {
    state = choice[i][state];
    charModes[i] = state;
  }

  const segments: Segment[] = [];
  for (let i = 0; i < units.length; i++) {
    const mode = modes[charModes[i]];
    const last = segments[segments.length - 1];
    if (last && last.mode === mode) last.units.push(units[i]);
    else segments.push({ mode, units: [units[i]] });
  }
  return segments;
}
