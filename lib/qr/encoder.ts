// QR code family encoder: Model 1, Model 2, Micro QR and rMQR.

import { Charset, CHARSET_ECI, kanjiValue } from './charsets';
import {
  applyMask, buildFunctionPatterns, dataModuleCount, drawFormat, EcLevel, Grid, maskCount, microMaskScore,
  model1CodewordPositions, penaltyScore, placeCodewords, symbolSize,
} from './matrix';
import { reedSolomonRemainder } from './reedSolomon';
import {
  appendBits, appendSegmentData, countBits, eciDesignator, makeUnits, Mode, MODE_LABELS, modeAllowed, modeIndicator,
  optimalSegments, Segment, segmentCount, splitLongSegments, Symbology, terminatorBits, unitFits,
} from './segments';
import { EcRow, MICRO_EC, MODEL1_EC, MODEL2_EC, RMQR_EC, RMQR_SIZES } from './tables';

export type { EcLevel } from './matrix';
export type { Mode, Symbology } from './segments';

export type ModeOption = 'auto' | Mode | 'manual';

export interface ManualSegment {
  mode: Mode | 'eci';
  text: string; // the ECI assignment number for 'eci' segments
}

export interface EncodeOptions {
  symbology: Symbology;
  version: 'auto' | number;       // Model 2: 1-40, Model 1: 1-14, Micro: 1-4 (M1-M4), rMQR: 1-32 (R7x43 ... R17x139)
  minVersion?: number;            // limits for automatic version selection
  maxVersion?: number;
  rmqrHeight?: 'auto' | number;   // constraints for automatic rMQR selection
  rmqrWidth?: 'auto' | number;
  rmqrPreference?: 'area' | 'height' | 'width';
  ecLevel: EcLevel;
  boostEc?: boolean;              // raise the error correction level while the data still fits
  mask: 'auto' | number;
  mode: ModeOption;
  manualSegments?: ManualSegment[];
  allowKanji?: boolean;
  charset: Charset;
  eci: 'auto' | 'none' | number;
  fnc1?: 'none' | 'gs1' | 'aim';
  aimIndicator?: string;          // two digits or one letter
  structuredAppend?: { index: number; total: number; parity: number };
}

export interface SegmentInfo {
  label: string;
  mode: Mode | 'header';
  count: number;
  bits: number;
  preview: string;
}

export interface QrSymbol {
  symbology: Symbology;
  version: number;
  versionName: string;
  width: number;
  height: number;
  ecLevel: EcLevel | null;        // null for M1, which only has error detection
  mask: number;
  maskScores: number[] | null;    // per mask: penalty (Model 1/2, lower is better) or score (Micro, higher is better)
  modules: Uint8Array;            // row major, 1 = dark
  functionModules: Uint8Array;    // row major, 1 = finder/timing/format/... module
  segments: SegmentInfo[];
  usedBits: number;               // data bits before terminator and padding
  capacityBits: number;
  dataCodewords: number;
  ecCodewords: number;
  blocks: { count: number; data: number; ec: number }[];
  remainderBits: number;
  warnings: string[];
}

export class QrEncodeError extends Error {}

export const SYMBOLOGY_LABELS: Record<Symbology, string> = {
  qr2: 'QR Code Model 2',
  qr1: 'QR Code Model 1',
  micro: 'Micro QR Code',
  rmqr: 'rMQR (rectangular Micro QR)',
};

export function versionRange(sym: Symbology): [number, number] {
  switch (sym) {
    case 'qr2': return [1, 40];
    case 'qr1': return [1, 14];
    case 'micro': return [1, 4];
    case 'rmqr': return [1, 32];
  }
}

export function versionName(sym: Symbology, version: number): string {
  if (sym === 'micro') return `M${version}`;
  if (sym === 'rmqr') {
    const [w, h] = RMQR_SIZES[version - 1];
    return `R${h}x${w}`;
  }
  return String(version);
}

export function ecLevelsFor(sym: Symbology, version: number | 'auto'): EcLevel[] {
  if (sym === 'rmqr') return ['M', 'H'];
  if (sym === 'micro') {
    if (version === 'auto') return ['L', 'M', 'Q'];
    return version === 1 ? ['L'] : version === 4 ? ['L', 'M', 'Q'] : ['L', 'M'];
  }
  return ['L', 'M', 'Q', 'H'];
}

const EC_INDEX: Record<EcLevel, number> = { L: 0, M: 1, Q: 2, H: 3 };

export function ecRow(sym: Symbology, version: number, ec: EcLevel): EcRow | null {
  switch (sym) {
    case 'qr2': return MODEL2_EC[version - 1][EC_INDEX[ec]];
    case 'qr1': return MODEL1_EC[version - 1][EC_INDEX[ec]];
    case 'rmqr': return ec === 'M' ? RMQR_EC[version - 1][0] : ec === 'H' ? RMQR_EC[version - 1][1] : null;
    case 'micro': {
      if (version === 1) return ec === 'L' ? MICRO_EC[0][0] : null;
      const row = MICRO_EC[version - 1][EC_INDEX[ec]];
      return row ?? null;
    }
  }
}

function dataCodewordCount(row: EcRow): number {
  return row[1] * row[2] + row[3] * row[4];
}

export function capacityBits(sym: Symbology, version: number, ec: EcLevel): number {
  const row = ecRow(sym, version, ec);
  if (!row) return 0;
  const halfCodeword = sym === 'micro' && (version === 1 || version === 3);
  return dataCodewordCount(row) * 8 - (halfCodeword ? 4 : 0);
}

// XOR of all data bytes, used as the Structured Append parity.
export function structuredAppendParity(bytes: ArrayLike<number>): number {
  let p = 0;
  for (let i = 0; i < bytes.length; i++) p ^= bytes[i];
  return p;
}

// ---------------------------------------------------------------------------------------------

interface Plan {
  version: number;
  ec: EcLevel;
  bits: number[];
  segments: SegmentInfo[];
}

function candidateVersions(opts: EncodeOptions): number[] {
  const [lo, hi] = versionRange(opts.symbology);
  if (opts.version !== 'auto') {
    if (!Number.isInteger(opts.version) || opts.version < lo || opts.version > hi) {
      throw new QrEncodeError(`Version ${opts.version} does not exist for ${SYMBOLOGY_LABELS[opts.symbology]}.`);
    }
    return [opts.version];
  }
  if (opts.symbology !== 'rmqr') {
    const min = Math.max(lo, opts.minVersion ?? lo);
    const max = Math.min(hi, opts.maxVersion ?? hi);
    const out = [];
    for (let v = min; v <= max; v++) out.push(v);
    return out;
  }
  const versions = RMQR_SIZES.map((_, i) => i + 1).filter((v) => {
    const [w, h] = RMQR_SIZES[v - 1];
    return (opts.rmqrHeight === undefined || opts.rmqrHeight === 'auto' || opts.rmqrHeight === h)
      && (opts.rmqrWidth === undefined || opts.rmqrWidth === 'auto' || opts.rmqrWidth === w);
  });
  const key = (v: number) => {
    const [w, h] = RMQR_SIZES[v - 1];
    switch (opts.rmqrPreference ?? 'area') {
      case 'height': return h * 1000 + w;
      case 'width': return w * 1000 + h;
      default: return w * h * 1000 + h;
    }
  };
  return versions.sort((a, b) => key(a) - key(b));
}

function aimIndicatorValue(s: string): number {
  if (/^[0-9]{2}$/.test(s)) return parseInt(s, 10);
  if (/^[A-Za-z]$/.test(s)) return s.charCodeAt(0) + 100;
  throw new QrEncodeError('The AIM application indicator must be two digits (00-99) or a single letter.');
}

function previewOf(seg: Segment): string {
  return seg.units.map((u) => (u.ch < ' ' || u.ch === '\x7f' ? `\\x${u.ch.charCodeAt(0).toString(16).padStart(2, '0')}` : u.ch)).join('');
}

// Whether automatic ECI should be added: some non-ASCII character ends up in byte mode, i.e. it is not
// going to be sent in Kanji mode.
function needsEci(input: string | Uint8Array, opts: EncodeOptions, sym: Symbology, version: number): boolean {
  if (typeof input !== 'string') return false;
  const texts = opts.mode === 'manual' ? (opts.manualSegments ?? []).filter((m) => m.mode === 'byte').map((m) => m.text) : [input];
  const kanjiPossible = opts.mode === 'kanji'
    || (opts.mode === 'auto' && (opts.allowKanji ?? true) && modeAllowed(sym, version, 'kanji'));
  return texts.some((t) => [...t].some((ch) => ch.codePointAt(0) > 0x7e && !(kanjiPossible && kanjiValue(ch) >= 0)));
}

// Builds the data bit stream (without terminator) for one version, or returns null if the data
// cannot be represented in that version at all (e.g. lowercase letters in M2).
function buildStream(input: string | Uint8Array, opts: EncodeOptions, version: number): { bits: number[]; segments: SegmentInfo[] } | null {
  const sym = opts.symbology;
  const gs1 = opts.fnc1 === 'gs1';
  const bits: number[] = [];
  const info: SegmentInfo[] = [];

  const header = (label: string, write: () => void) => {
    const before = bits.length;
    write();
    info.push({ label, mode: 'header', count: 0, bits: bits.length - before, preview: '' });
  };
  const indicator = (ind: Parameters<typeof modeIndicator>[2], what: string) => {
    const mi = modeIndicator(sym, version, ind);
    if (!mi) throw new QrEncodeError(`${SYMBOLOGY_LABELS[sym]} does not support ${what}.`);
    appendBits(bits, mi[0], mi[1]);
  };

  // Model 1 data streams start with four zero bits (they occupy the corner of the first codeword).
  if (sym === 'qr1') header('Model 1 leading bits', () => appendBits(bits, 0, 4));

  if (opts.structuredAppend) {
    const { index, total, parity } = opts.structuredAppend;
    header(`Structured Append ${index + 1}/${total}`, () => {
      indicator('structuredAppend', 'Structured Append');
      appendBits(bits, index, 4);
      appendBits(bits, total - 1, 4);
      appendBits(bits, parity, 8);
    });
  }

  let eci: number | null = null;
  if (typeof opts.eci === 'number') eci = opts.eci;
  else if (opts.eci === 'auto' && opts.charset !== 'iso-8859-1' && modeIndicator(sym, version, 'eci')) {
    if (needsEci(input, opts, sym, version)) eci = CHARSET_ECI[opts.charset];
  }
  // Kanji mode produces Shift JIS bytes, which readers interpret according to the active ECI. Under any
  // other ECI they would be decoded as garbage, so Kanji mode is only used without ECI or with ECI 20.
  const kanjiOk = eci === null || eci === CHARSET_ECI.shift_jis;
  if (eci !== null) {
    header(`ECI ${eci}`, () => {
      indicator('eci', 'ECI');
      eciDesignator(bits, eci);
    });
  }

  if (opts.fnc1 === 'gs1') header('FNC1 (GS1)', () => indicator('fnc1First', 'FNC1'));
  else if (opts.fnc1 === 'aim') {
    const value = aimIndicatorValue(opts.aimIndicator ?? '');
    header(`FNC1 (AIM ${opts.aimIndicator})`, () => {
      indicator('fnc1Second', 'FNC1');
      appendBits(bits, value, 8);
    });
  }

  const writeSegments = (segments: Segment[]) => {
    for (const seg of splitLongSegments(segments, sym, version)) {
      const before = bits.length;
      const mi = modeIndicator(sym, version, seg.mode);
      appendBits(bits, mi[0], mi[1]);
      appendBits(bits, segmentCount(seg), countBits(sym, version, seg.mode));
      appendSegmentData(bits, seg);
      info.push({ label: MODE_LABELS[seg.mode], mode: seg.mode, count: segmentCount(seg), bits: bits.length - before, preview: previewOf(seg) });
    }
  };

  if (opts.mode === 'manual') {
    for (const m of opts.manualSegments ?? []) {
      if (m.mode === 'eci') {
        const value = Number(m.text);
        header(`ECI ${value}`, () => {
          indicator('eci', 'ECI');
          eciDesignator(bits, value);
        });
        continue;
      }
      if (!modeAllowed(sym, version, m.mode)) return null;
      if (m.mode === 'kanji' && !kanjiOk) throw new QrEncodeError(`Kanji mode cannot be combined with ECI ${eci}; readers would decode it as ${eci === 26 ? 'UTF-8' : 'that character set'}.`);
      const units = makeUnits(m.text, opts.charset, gs1);
      const bad = units.find((u) => !unitFits(u, m.mode as Mode));
      if (bad) throw new QrEncodeError(`"${bad.ch}" cannot be encoded in ${MODE_LABELS[m.mode]} mode.`);
      writeSegments([{ mode: m.mode, units }]);
    }
    return { bits, segments: info };
  }

  const units = makeUnits(input, opts.charset, gs1);
  if (opts.mode === 'auto') {
    const segments = optimalSegments(units, sym, version, (opts.allowKanji ?? true) && kanjiOk);
    if (!segments) return null;
    writeSegments(segments);
  } else {
    if (!modeAllowed(sym, version, opts.mode)) return null;
    if (opts.mode === 'kanji' && !kanjiOk) throw new QrEncodeError(`Kanji mode cannot be combined with ECI ${eci}.`);
    const bad = units.find((u) => !unitFits(u, opts.mode as Mode));
    if (bad) throw new QrEncodeError(`"${bad.ch}" cannot be encoded in ${MODE_LABELS[opts.mode]} mode.`);
    if (units.length) writeSegments([{ mode: opts.mode, units }]);
  }
  return { bits, segments: info };
}

function plan(input: string | Uint8Array, opts: EncodeOptions): Plan {
  const sym = opts.symbology;
  const versions = candidateVersions(opts);
  if (versions.length === 0) throw new QrEncodeError('No rMQR size matches the chosen height and width.');

  let best: { needed: number; capacity: number; name: string } | null = null;
  let unrepresentable = false;

  for (const version of versions) {
    let ec = opts.ecLevel;
    if (sym === 'micro' && version === 1) {
      // M1 only has error detection; it is offered when the lowest level is requested, or when chosen explicitly.
      if (ec !== 'L' && opts.version === 'auto') continue;
      ec = 'L';
    }
    if (!ecRow(sym, version, ec)) {
      if (opts.version !== 'auto') throw new QrEncodeError(`Error correction level ${ec} is not available for ${versionName(sym, version)}.`);
      continue;
    }
    const stream = buildStream(input, opts, version);
    if (!stream) {
      unrepresentable = true;
      continue;
    }
    const cap = capacityBits(sym, version, ec);
    if (stream.bits.length <= cap) {
      if (opts.boostEc && !(sym === 'micro' && version === 1)) {
        for (const higher of ['M', 'Q', 'H'] as EcLevel[]) {
          if (EC_INDEX[higher] <= EC_INDEX[ec] || !ecRow(sym, version, higher)) continue;
          if (stream.bits.length <= capacityBits(sym, version, higher)) ec = higher;
        }
      }
      return { version, ec, bits: stream.bits, segments: stream.segments };
    }
    best = { needed: stream.bits.length, capacity: cap, name: versionName(sym, version) };
  }

  if (best) {
    throw new QrEncodeError(`The data does not fit: it needs ${best.needed} bits, but ${SYMBOLOGY_LABELS[sym]} ${best.name} at level ${opts.ecLevel} holds ${best.capacity} bits.`);
  }
  if (unrepresentable) {
    throw new QrEncodeError(sym === 'micro'
      ? 'The data uses characters that this Micro QR version cannot encode (M1 is numeric only, M2 is numeric and alphanumeric only).'
      : 'The data cannot be encoded with the selected modes.');
  }
  throw new QrEncodeError(`Error correction level ${opts.ecLevel} is not available for ${SYMBOLOGY_LABELS[sym]}.`);
}

function finishStream(bits: number[], sym: Symbology, version: number, capacity: number): number[] {
  const out = bits.slice();
  const term = Math.min(terminatorBits(sym, version), capacity - out.length);
  appendBits(out, 0, term);
  while (out.length % 8 !== 0 && out.length < capacity) out.push(0);
  for (let pad = 0xec; capacity - out.length >= 8; pad ^= 0xec ^ 0x11) appendBits(out, pad, 8);
  while (out.length < capacity) out.push(0); // the 4 bit final codeword of M1 and M3
  return out;
}

function toBytes(bits: number[]): number[] {
  const bytes: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let b = 0;
    for (let j = 0; j < 8; j++) b = (b << 1) | (bits[i + j] ?? 0);
    bytes.push(b);
  }
  return bytes;
}

export function encode(input: string | Uint8Array, opts: EncodeOptions): QrSymbol {
  const sym = opts.symbology;
  const warnings: string[] = [];
  if (opts.structuredAppend && sym !== 'qr2') throw new QrEncodeError('Structured Append is only defined for QR Code Model 2.');
  if (opts.fnc1 && opts.fnc1 !== 'none' && sym !== 'qr2' && sym !== 'rmqr') {
    throw new QrEncodeError(`${SYMBOLOGY_LABELS[sym]} does not support FNC1 (GS1 / AIM) mode.`);
  }
  if (typeof opts.eci === 'number' && !modeIndicator(sym, 1, 'eci')) throw new QrEncodeError(`${SYMBOLOGY_LABELS[sym]} does not support ECI.`);
  if (opts.eci === 'auto' && !modeIndicator(sym, 1, 'eci') && typeof input === 'string' && opts.charset !== 'iso-8859-1'
    && [...input].some((ch) => ch.codePointAt(0) > 0x7e)) {
    warnings.push(`${SYMBOLOGY_LABELS[sym]} cannot carry an ECI designator, so readers have to guess the character set.`);
  }

  const p = plan(input, opts);
  const version = p.version;
  const row = ecRow(sym, version, p.ec);
  const capacity = capacityBits(sym, version, p.ec);
  const stream = finishStream(p.bits, sym, version, capacity);

  // Data codewords. In M1 and M3 the last data codeword is only 4 bits; it is stored in the high nibble.
  const dataBytes = toBytes(capacity % 8 ? [...stream, 0, 0, 0, 0] : stream);

  const [ecPerBlock, c1, d1, c2, d2] = row;
  const dataBlocks: number[][] = [];
  let offset = 0;
  for (let i = 0; i < c1 + c2; i++) {
    const len = i < c1 ? d1 : d2;
    dataBlocks.push(dataBytes.slice(offset, offset + len));
    offset += len;
  }
  const ecBlocks = dataBlocks.map((b) => Array.from(reedSolomonRemainder(b, ecPerBlock)));

  const codewordBits: number[] = [];
  const pushByte = (b: number, length = 8) => appendBits(codewordBits, length === 8 ? b : b >> 4, length);
  if (sym === 'qr1') {
    // Model 1 does not interleave blocks.
    for (const b of dataBlocks) b.forEach((x) => pushByte(x));
    for (const b of ecBlocks) b.forEach((x) => pushByte(x));
  } else {
    const maxData = Math.max(...dataBlocks.map((b) => b.length));
    for (let i = 0; i < maxData; i++) {
      for (const b of dataBlocks) {
        if (i >= b.length) continue;
        const isHalf = capacity % 8 !== 0 && i === b.length - 1;
        pushByte(b[i], isHalf ? 4 : 8);
      }
    }
    for (let i = 0; i < ecPerBlock; i++) for (const b of ecBlocks) pushByte(b[i]);
  }

  const base = buildFunctionPatterns(sym, version);
  const available = sym === 'qr1' ? model1CodewordPositions(base.width).length * 8 : dataModuleCount(base);
  if (available < codewordBits.length) throw new Error(`Internal error: ${codewordBits.length} bits do not fit in ${available} modules.`);
  placeCodewords(base, sym, codewordBits);

  const masks = maskCount(sym);
  let chosen: number;
  let scores: number[] | null = null;
  let grid: Grid;
  if (opts.mask === 'auto' || sym === 'rmqr') {
    if (sym === 'rmqr' && opts.mask !== 'auto' && opts.mask !== 0) warnings.push('rMQR has a single fixed data mask; the mask setting is ignored.');
    scores = [];
    let bestGrid: Grid = null;
    for (let m = 0; m < masks; m++) {
      const g = base.clone();
      applyMask(g, sym, m);
      drawFormat(g, sym, version, p.ec, m);
      const s = sym === 'micro' ? microMaskScore(g) : sym === 'rmqr' ? 0 : penaltyScore(g);
      scores.push(s);
      const better = bestGrid === null || (sym === 'micro' ? s > scores[chosen] : s < scores[chosen]);
      if (better) {
        bestGrid = g;
        chosen = m;
      }
    }
    grid = bestGrid;
    if (sym === 'rmqr') scores = null;
  } else {
    if (!Number.isInteger(opts.mask) || opts.mask < 0 || opts.mask >= masks) {
      throw new QrEncodeError(`${SYMBOLOGY_LABELS[sym]} has data masks 0-${masks - 1}.`);
    }
    chosen = opts.mask;
    grid = base.clone();
    applyMask(grid, sym, chosen);
    drawFormat(grid, sym, version, p.ec, chosen);
  }

  const [width, height] = symbolSize(sym, version);
  const dataCodewords = dataCodewordCount(row);
  const ecCodewords = ecPerBlock * (c1 + c2);
  const blocks = [{ count: c1, data: d1, ec: ecPerBlock }];
  if (c2) blocks.push({ count: c2, data: d2, ec: ecPerBlock });

  return {
    symbology: sym,
    version,
    versionName: versionName(sym, version),
    width,
    height,
    ecLevel: sym === 'micro' && version === 1 ? null : p.ec,
    mask: chosen,
    maskScores: scores,
    modules: grid.dark,
    functionModules: grid.func,
    segments: p.segments,
    usedBits: p.bits.length,
    capacityBits: capacity,
    dataCodewords,
    ecCodewords,
    blocks,
    remainderBits: available - codewordBits.length,
    warnings,
  };
}
