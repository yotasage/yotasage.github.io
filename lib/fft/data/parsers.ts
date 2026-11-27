// Strict, zero-dependency file parsers for CSV/TSV text, NumPy .npy, WAV audio, and SPICE .raw.
// Enforces security.md P3 caps (no object/pickle .npy, shape-vs-byte-length validation, typed errors).

import type { ColumnInfo, ParsedDataset, SignalDef, SignalKind } from '../types';
import { analyseTimeGrid } from './timegrid';

export const MAX_ROWS = 1 << 21; // 2,097,152 rows safety cap for smooth browser memory
export const MAX_COLS = 512;
export const MAX_CELL_LEN = 256;

const SPICE_SUFFIXES: Record<string, number> = {
  f: 1e-15,
  p: 1e-12,
  n: 1e-9,
  u: 1e-6,
  µ: 1e-6,
  m: 1e-3,
  k: 1e3,
  meg: 1e6,
  g: 1e9,
  t: 1e12,
};

/** Parses a numeric token with optional decimal comma and SPICE suffixes (e.g. 100u, 1.5meg). */
export function parseNumberToken(raw: string, decimalComma: boolean, spiceSuffix: boolean): number {
  let s = raw.trim();
  if (!s) return NaN;
  if (s.length > MAX_CELL_LEN) return NaN;
  if (s.startsWith('"') && s.endsWith('"') && s.length >= 2) {
    s = s.slice(1, -1).trim();
  }
  if (decimalComma) {
    s = s.replace(',', '.');
  }
  const direct = Number(s);
  if (Number.isFinite(direct)) return direct;
  const lower = s.toLowerCase();
  if (lower === 'nan') return NaN;
  if (lower === 'inf' || lower === '+inf' || lower === 'infinity') return Infinity;
  if (lower === '-inf' || lower === '-infinity') return -Infinity;

  if (spiceSuffix) {
    const match = /^([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)(meg|[fpnuµmkgt])(?:[a-z]*)$/i.exec(s);
    if (match) {
      const base = Number(match[1]);
      const mult = SPICE_SUFFIXES[match[2].toLowerCase()];
      if (Number.isFinite(base) && mult !== undefined) return base * mult;
    }
  }
  return NaN;
}

/** Extracts an optional unit in brackets or parentheses from a column header, e.g. "V(outp) [V]". */
function extractHeaderUnit(rawName: string): { name: string; unit?: string } {
  const clean = rawName.replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, 120);
  const bracket = /^(.*?)\s*[\[(](V|mV|uV|A|mA|uA|s|ms|us|ns|ps|Hz|kHz|MHz|GHz|code|LSB)[\])]\s*$/i.exec(
    clean,
  );
  if (bracket) {
    return { name: bracket[1].trim() || clean, unit: bracket[2] };
  }
  return { name: clean };
}

/** Detects differential signal pairs such as outp/outn, vop/von, v(out+)/v(out-), inp/inn. */
export function detectDifferentialPair(
  columns: readonly ColumnInfo[],
  timeCol: number | null,
): { colA: number; colB: number } | null {
  const candidates = columns.filter((c) => c.index !== timeCol && c.kind !== 'text');
  if (candidates.length < 2) return null;

  const normalizeKey = (name: string): { stem: string; polarity: 'p' | 'n' | null } => {
    const s = name.trim().toLowerCase();
    // Match V(outp) / V(out+) / out_p / outp / vop
    const inner = /^v\((.+)\)$/.exec(s)?.[1] ?? s;
    const plusMatch = /^(.+?)(?:[_\-.]?(?:p|pos|plus|\+))$/.exec(inner);
    if (plusMatch) return { stem: plusMatch[1], polarity: 'p' };
    const minusMatch = /^(.+?)(?:[_\-.]?(?:n|neg|minus|-))$/.exec(inner);
    if (minusMatch) return { stem: minusMatch[1], polarity: 'n' };
    return { stem: inner, polarity: null };
  };

  const posMap = new Map<string, number>();
  const negMap = new Map<string, number>();
  for (const col of candidates) {
    const { stem, polarity } = normalizeKey(col.name);
    if (!stem) continue;
    if (polarity === 'p' && !posMap.has(stem)) posMap.set(stem, col.index);
    if (polarity === 'n' && !negMap.has(stem)) negMap.set(stem, col.index);
  }

  for (const [stem, colA] of posMap.entries()) {
    const colB = negMap.get(stem);
    if (colB !== undefined && colB !== colA) {
      return { colA, colB };
    }
  }
  return null;
}

/** Builds column statistics and chooses smart defaults for time, signal A, signal B, and fs. */
function finalizeDataset(
  id: string,
  name: string,
  format: ParsedDataset['format'],
  colNames: string[],
  rawCols: Float64Array[],
  explicitFs: number | null,
  delimiter?: string,
  notes?: string,
): ParsedDataset {
  const rows = rawCols[0]?.length ?? 0;
  const columns: ColumnInfo[] = colNames.map((rawName, index) => {
    const { name: cleanName, unit } = extractHeaderUnit(rawName || `col_${index}`);
    const arr = rawCols[index];
    let min = Infinity;
    let max = -Infinity;
    let nonFiniteCount = 0;
    let allInt = true;
    let monotonic = rows >= 2;
    let prev = -Infinity;

    for (let i = 0; i < arr.length; i++) {
      const v = arr[i];
      if (!Number.isFinite(v)) {
        nonFiniteCount++;
        monotonic = false;
        allInt = false;
        continue;
      }
      if (v < min) min = v;
      if (v > max) max = v;
      if (allInt && !Number.isInteger(v)) allInt = false;
      if (monotonic && i > 0 && v <= prev) monotonic = false;
      prev = v;
    }

    return {
      index,
      name: cleanName || `col_${index}`,
      unit,
      kind: allInt && nonFiniteCount < arr.length ? 'int' : 'float',
      min: Number.isFinite(min) ? min : 0,
      max: Number.isFinite(max) ? max : 0,
      nonFiniteCount,
      isMonotonic: monotonic,
    };
  });

  // Auto-detect time column (first monotonic column with time-like name, or col 0 if monotonic and >1 col)
  let defaultTimeCol: number | null = null;
  if (columns.length >= 2) {
    const namedTime = columns.find(
      (c) => c.isMonotonic && /^(t|time|sec|seconds|timestamp|x|time_s)$/i.test(c.name),
    );
    if (namedTime) {
      defaultTimeCol = namedTime.index;
    } else if (columns[0].isMonotonic) {
      defaultTimeCol = 0;
    }
  }

  const pair = detectDifferentialPair(columns, defaultTimeCol);
  let defaultKind: SignalKind = 'single';
  let defaultSigACol = defaultTimeCol === 0 && columns.length > 1 ? 1 : 0;
  let defaultSigBCol: number | null = null;

  if (pair) {
    defaultKind = 'diff';
    defaultSigACol = pair.colA;
    defaultSigBCol = pair.colB;
  }

  let defaultFs = explicitFs;
  if (defaultFs === null && defaultTimeCol !== null) {
    const grid = analyseTimeGrid(rawCols[defaultTimeCol]);
    if (grid.fs && Number.isFinite(grid.fs) && grid.fs > 0) {
      defaultFs = grid.fs;
    }
  }

  return {
    id,
    name: name.replace(/[\u0000-\u001F\u007F]/g, '').slice(0, 120) || 'untitled',
    format,
    rows,
    columns,
    data: rawCols,
    defaultTimeCol,
    defaultSigACol,
    defaultSigBCol,
    defaultKind,
    defaultFs,
    defaultFullScale: null,
    defaultBits: null,
    defaultBand: null,
    delimiter,
    notes,
  };
}

/** Splits one delimited line respecting double quotes. */
function splitLine(line: string, delim: string): string[] {
  if (delim === 'whitespace') {
    return line.trim().split(/\s+/);
  }
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (!inQuotes && ch === delim) {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

/**
 * Parses delimited text (CSV, TSV, semicolon, whitespace) into a ParsedDataset.
 * Handles UTF-8 BOM, comment lines (#, %, //, *), optional headers, decimal comma, and SPICE suffixes.
 */
export function parseTextDataset(text: string, name: string, id: string): ParsedDataset {
  const cleaned = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rawLines = cleaned.split(/\r\n|\n|\r/);

  const nonEmpty: string[] = [];
  for (let i = 0; i < rawLines.length; i++) {
    const trimmed = rawLines[i].trim();
    if (!trimmed) continue;
    if (
      trimmed.startsWith('#') ||
      trimmed.startsWith('%') ||
      trimmed.startsWith('//') ||
      trimmed.startsWith('*')
    ) {
      continue;
    }
    nonEmpty.push(trimmed);
    if (nonEmpty.length >= MAX_ROWS + 1) break;
  }

  if (nonEmpty.length === 0) {
    throw new Error('No data rows found in text input.');
  }

  // Detect delimiter from first 5 lines
  const sampleLines = nonEmpty.slice(0, Math.min(5, nonEmpty.length));
  const candidates: Array<{ key: string; score: number }> = [',', ';', '\t', 'whitespace'].map(
    (d) => {
      const counts = sampleLines.map((ln) => splitLine(ln, d).length);
      const minC = Math.min(...counts);
      const maxC = Math.max(...counts);
      const consistent = minC === maxC ? 1 : 0;
      const score = minC > 1 ? minC * 10 + consistent * 50 : 0;
      return { key: d, score };
    },
  );
  candidates.sort((a, b) => b.score - a.score);
  const delim = candidates[0].score > 0 ? candidates[0].key : 'whitespace';
  const decimalComma = delim === ';' || (delim === '\t' && /,\d/.test(sampleLines[sampleLines.length - 1]));

  const firstTokens = splitLine(nonEmpty[0], delim);
  const colCount = Math.min(MAX_COLS, Math.max(1, firstTokens.length));
  if (firstTokens.length > MAX_COLS) {
    throw new Error(`Too many columns (${firstTokens.length}); maximum supported is ${MAX_COLS}.`);
  }

  // Decide if line 0 is a header row (if >= half of its cells don't parse as numbers)
  let nonNumericFirst = 0;
  for (let c = 0; c < colCount; c++) {
    if (!Number.isFinite(parseNumberToken(firstTokens[c] ?? '', decimalComma, true))) {
      nonNumericFirst++;
    }
  }
  const hasHeader = nonNumericFirst > colCount / 2 && nonEmpty.length > 1;
  const startRow = hasHeader ? 1 : 0;
  const rowCount = nonEmpty.length - startRow;
  if (rowCount < 2) {
    throw new Error('At least 2 numeric data rows are required for spectral analysis.');
  }

  const colNames: string[] = [];
  for (let c = 0; c < colCount; c++) {
    colNames.push(hasHeader ? (firstTokens[c]?.trim() || `col_${c}`) : `col_${c}`);
  }

  const cols = Array.from({ length: colCount }, () => new Float64Array(rowCount));
  for (let r = 0; r < rowCount; r++) {
    const cells = splitLine(nonEmpty[startRow + r], delim);
    for (let c = 0; c < colCount; c++) {
      cols[c][r] = parseNumberToken(cells[c] ?? '', decimalComma, true);
    }
  }

  return finalizeDataset(id, name, 'csv', colNames, cols, null, delim);
}

/**
 * Strict NumPy .npy binary reader (v1.0/v2.0/v3.0).
 * Rejects object/pickle dtypes, non-C-contiguous arrays, >2D shapes, and shapes exceeding file size.
 */
export function parseNpyDataset(buffer: ArrayBuffer, name: string, id: string): ParsedDataset {
  const bytes = new Uint8Array(buffer);
  if (bytes.byteLength < 10) {
    throw new Error('File is too small to be a valid NumPy .npy file.');
  }
  if (
    bytes[0] !== 0x93 ||
    bytes[1] !== 0x4e || // N
    bytes[2] !== 0x55 || // U
    bytes[3] !== 0x4d || // M
    bytes[4] !== 0x50 || // P
    bytes[5] !== 0x59 // Y
  ) {
    throw new Error('Invalid .npy magic header.');
  }

  const major = bytes[6];
  const view = new DataView(buffer);
  let headerLen: number;
  let headerOffset: number;
  if (major === 1) {
    headerLen = view.getUint16(8, true);
    headerOffset = 10;
  } else if (major === 2 || major === 3) {
    if (bytes.byteLength < 12) throw new Error('Truncated .npy v2/v3 header.');
    headerLen = view.getUint32(8, true);
    headerOffset = 12;
  } else {
    throw new Error(`Unsupported .npy format version ${major}.`);
  }

  const dataOffset = headerOffset + headerLen;
  if (headerLen > 65536 || dataOffset > bytes.byteLength) {
    throw new Error('Truncated or oversized .npy header.');
  }

  const headerText = new TextDecoder('latin1').decode(bytes.subarray(headerOffset, dataOffset));
  const descrMatch = /['"]descr['"]\s*:\s*['"]([^'"]+)['"]/.exec(headerText);
  const fortranMatch = /['"]fortran_order['"]\s*:\s*(True|False)/.exec(headerText);
  const shapeMatch = /['"]shape['"]\s*:\s*\(([^)]*)\)/.exec(headerText);

  if (!descrMatch || !fortranMatch || !shapeMatch) {
    throw new Error('Malformed .npy header dictionary.');
  }
  if (fortranMatch[1] === 'True') {
    throw new Error('Fortran-ordered .npy arrays are not supported; save in C-contiguous order.');
  }

  const descr = descrMatch[1];
  if (descr.includes('O') || descr.includes('S') || descr.includes('U') || descr.includes('V')) {
    throw new Error(`Unsupported or unsafe .npy dtype '${descr}' (only plain numeric arrays are allowed).`);
  }

  const endian = descr[0];
  const littleEndian = endian !== '>';
  const kindCode = endian === '<' || endian === '>' || endian === '=' || endian === '|' ? descr.slice(1) : descr;

  const dtypeMap: Record<string, number> = {
    f4: 4,
    f8: 8,
    i1: 1,
    i2: 2,
    i4: 4,
    i8: 8,
    u1: 1,
    u2: 2,
    u4: 4,
    u8: 8,
    b1: 1,
  };
  const itemBytes = dtypeMap[kindCode];
  if (!itemBytes) {
    throw new Error(`Unsupported .npy numeric dtype '${descr}'.`);
  }

  const dims = shapeMatch[1]
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => Number(s));

  if (dims.length === 0 || dims.length > 2 || dims.some((d) => !Number.isInteger(d) || d <= 0)) {
    throw new Error(`Unsupported .npy shape (${shapeMatch[1]}); expected 1D or 2D non-empty array.`);
  }

  const rows = dims[0];
  const colsCount = dims.length === 2 ? dims[1] : 1;
  if (rows > MAX_ROWS || colsCount > MAX_COLS) {
    throw new Error(`Array shape (${rows} × ${colsCount}) exceeds safety limits.`);
  }

  const neededBytes = rows * colsCount * itemBytes;
  if (dataOffset + neededBytes > bytes.byteLength) {
    throw new Error('Declared .npy shape exceeds actual file byte length.');
  }

  const cols = Array.from({ length: colsCount }, () => new Float64Array(rows));
  const colNames = Array.from({ length: colsCount }, (_, idx) => `col_${idx}`);

  let pos = dataOffset;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < colsCount; c++) {
      let val = 0;
      switch (kindCode) {
        case 'f8':
          val = view.getFloat64(pos, littleEndian);
          break;
        case 'f4':
          val = view.getFloat32(pos, littleEndian);
          break;
        case 'i1':
          val = view.getInt8(pos);
          break;
        case 'i2':
          val = view.getInt16(pos, littleEndian);
          break;
        case 'i4':
          val = view.getInt32(pos, littleEndian);
          break;
        case 'i8':
          val = Number(view.getBigInt64(pos, littleEndian));
          break;
        case 'u1':
        case 'b1':
          val = view.getUint8(pos);
          break;
        case 'u2':
          val = view.getUint16(pos, littleEndian);
          break;
        case 'u4':
          val = view.getUint32(pos, littleEndian);
          break;
        case 'u8':
          val = Number(view.getBigUint64(pos, littleEndian));
          break;
      }
      cols[c][r] = val;
      pos += itemBytes;
    }
  }

  return finalizeDataset(id, name, 'npy', colNames, cols, null, undefined, `NumPy ${descr} (${dims.join('×')})`);
}

/**
 * Uncompressed WAV reader (PCM 8/16/24/32-bit and IEEE float 32/64-bit).
 */
export function parseWavDataset(buffer: ArrayBuffer, name: string, id: string): ParsedDataset {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  if (bytes.byteLength < 44) throw new Error('File too small to be a WAV file.');

  const tag = (off: number) =>
    String.fromCharCode(bytes[off], bytes[off + 1], bytes[off + 2], bytes[off + 3]);
  if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE') {
    throw new Error('Invalid WAV header (missing RIFF/WAVE).');
  }

  let audioFormat = 0;
  let numChannels = 0;
  let sampleRate = 0;
  let bitsPerSample = 0;
  let dataStart = 0;
  let dataSize = 0;

  let offset = 12;
  while (offset + 8 <= bytes.byteLength) {
    const idStr = tag(offset);
    const size = view.getUint32(offset + 4, true);
    const body = offset + 8;
    if (idStr === 'fmt ' && body + 16 <= bytes.byteLength) {
      audioFormat = view.getUint16(body, true);
      numChannels = view.getUint16(body + 2, true);
      sampleRate = view.getUint32(body + 4, true);
      bitsPerSample = view.getUint16(body + 14, true);
    } else if (idStr === 'data') {
      dataStart = body;
      dataSize = Math.min(size, bytes.byteLength - body);
      break;
    }
    offset = body + size + (size % 2);
  }

  if ((audioFormat !== 1 && audioFormat !== 3) || numChannels < 1 || sampleRate <= 0 || dataSize <= 0) {
    throw new Error('Unsupported WAV format (only uncompressed PCM and IEEE float are supported).');
  }

  const bytesPerSample = bitsPerSample / 8;
  const frameBytes = bytesPerSample * numChannels;
  const totalFrames = Math.min(MAX_ROWS, Math.floor(dataSize / frameBytes));
  if (totalFrames < 2) throw new Error('WAV file contains fewer than 2 samples.');

  const cols = Array.from({ length: numChannels }, () => new Float64Array(totalFrames));
  const colNames = Array.from({ length: numChannels }, (_, ch) =>
    numChannels === 1 ? 'ch0' : ch === 0 ? 'left' : ch === 1 ? 'right' : `ch${ch}`,
  );

  let pos = dataStart;
  for (let i = 0; i < totalFrames; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      let val = 0;
      if (audioFormat === 3 && bitsPerSample === 32) {
        val = view.getFloat32(pos, true);
      } else if (audioFormat === 3 && bitsPerSample === 64) {
        val = view.getFloat64(pos, true);
      } else if (bitsPerSample === 8) {
        val = (view.getUint8(pos) - 128) / 128;
      } else if (bitsPerSample === 16) {
        val = view.getInt16(pos, true) / 32768;
      } else if (bitsPerSample === 24) {
        let s = bytes[pos] | (bytes[pos + 1] << 8) | (bytes[pos + 2] << 16);
        if (s & 0x800000) s |= ~0xffffff;
        val = s / 8388608;
      } else if (bitsPerSample === 32) {
        val = view.getInt32(pos, true) / 2147483648;
      } else {
        throw new Error(`Unsupported WAV bit depth (${bitsPerSample}-bit).`);
      }
      cols[ch][i] = val;
      pos += bytesPerSample;
    }
  }

  const ds = finalizeDataset(
    id,
    name,
    'wav',
    colNames,
    cols,
    sampleRate,
    undefined,
    `WAV ${bitsPerSample}-bit ${sampleRate} Hz`,
  );
  ds.defaultFullScale = 2.0; // Normalized [-1, 1] WAV has FS = 2 Vpp equivalent
  ds.defaultBits = audioFormat === 1 ? bitsPerSample : null;
  return ds;
}

/**
 * SPICE .raw reader (ASCII and Binary real transient waveforms from ngspice / LTspice).
 */
export function parseSpiceRawDataset(buffer: ArrayBuffer, name: string, id: string): ParsedDataset {
  const bytes = new Uint8Array(buffer);
  const headSlice = new TextDecoder('latin1').decode(bytes.subarray(0, Math.min(65536, bytes.byteLength)));
  const binIdx = headSlice.indexOf('Binary:\n');
  const binCrIdx = headSlice.indexOf('Binary:\r\n');
  const ascIdx = headSlice.indexOf('Values:\n');
  const ascCrIdx = headSlice.indexOf('Values:\r\n');

  const isBinary = binIdx >= 0 || binCrIdx >= 0;
  const headerEnd = isBinary
    ? binIdx >= 0
      ? binIdx + 8
      : binCrIdx + 9
    : ascIdx >= 0
      ? ascIdx + 8
      : ascCrIdx >= 0
        ? ascCrIdx + 9
        : -1;

  if (headerEnd < 0) {
    throw new Error('Invalid SPICE .raw file (missing Values: or Binary: section).');
  }

  const header = headSlice.slice(0, headerEnd);
  const nVarsMatch = /No\.\s*Variables:\s*(\d+)/i.exec(header);
  const nPtsMatch = /No\.\s*Points:\s*(\d+)/i.exec(header);
  const flagsMatch = /Flags:\s*(.*)/i.exec(header);
  if (!nVarsMatch || !nPtsMatch) {
    throw new Error('Malformed SPICE .raw header (missing No. Variables or No. Points).');
  }
  if (flagsMatch && /complex/i.test(flagsMatch[1])) {
    throw new Error('Complex AC SPICE .raw files are not supported; export real transient data.');
  }

  const nVars = Math.min(MAX_COLS, Number(nVarsMatch[1]));
  const nPts = Math.min(MAX_ROWS, Number(nPtsMatch[1]));
  if (nVars < 1 || nPts < 2) throw new Error('SPICE .raw file has insufficient variables or points.');

  const varNames: string[] = [];
  const varsSection = header.split(/Variables:/i)[1] ?? '';
  for (const line of varsSection.split(/\r?\n/)) {
    const m = /^\s*\d+\s+(\S+)/.exec(line);
    if (m && varNames.length < nVars) varNames.push(m[1]);
  }
  while (varNames.length < nVars) varNames.push(`var_${varNames.length}`);

  const cols = Array.from({ length: nVars }, () => new Float64Array(nPts));

  if (isBinary) {
    const view = new DataView(buffer);
    const needed = nPts * nVars * 8;
    if (headerEnd + needed > bytes.byteLength) {
      throw new Error('SPICE .raw binary payload is truncated.');
    }
    let pos = headerEnd;
    for (let r = 0; r < nPts; r++) {
      for (let c = 0; c < nVars; c++) {
        cols[c][r] = view.getFloat64(pos, true);
        pos += 8;
      }
    }
  } else {
    const body = new TextDecoder('utf-8').decode(bytes.subarray(headerEnd));
    const lines = body.split(/\r?\n/);
    let row = -1;
    let col = 0;
    for (let i = 0; i < lines.length; i++) {
      const ln = lines[i].trim();
      if (!ln) continue;
      if (col === 0) {
        const parts = ln.split(/\s+/);
        row++;
        if (row >= nPts) break;
        cols[0][row] = Number(parts[parts.length - 1]);
        col = 1;
      } else {
        if (row >= 0 && row < nPts && col < nVars) {
          cols[col][row] = Number(ln);
        }
        col++;
        if (col >= nVars) col = 0;
      }
    }
  }

  return finalizeDataset(id, name, 'spice-raw', varNames, cols, null, undefined, 'SPICE .raw transient');
}

/** Auto-detects format by file extension or magic bytes and parses the file safely. */
export async function parseUploadedFile(file: File, id: string): Promise<ParsedDataset> {
  const lower = file.name.toLowerCase();
  if (lower.endsWith('.npy')) {
    return parseNpyDataset(await file.arrayBuffer(), file.name, id);
  }
  if (lower.endsWith('.wav')) {
    return parseWavDataset(await file.arrayBuffer(), file.name, id);
  }
  if (lower.endsWith('.raw')) {
    return parseSpiceRawDataset(await file.arrayBuffer(), file.name, id);
  }
  const text = await file.text();
  return parseTextDataset(text, file.name, id);
}

/** Builds the active 1D waveform (single-ended, differential, or common-mode) plus optional CM monitor. */
export function buildSignalSamples(
  dataset: ParsedDataset,
  def: SignalDef,
): {
  time: Float64Array | null;
  samples: Float64Array;
  cmMonitor: Float64Array | null;
  label: string;
} {
  const colA = dataset.data[def.colA] ?? dataset.data[0];
  const colB = def.colB !== null ? (dataset.data[def.colB] ?? null) : null;
  const time = def.timeCol !== null ? (dataset.data[def.timeCol] ?? null) : null;
  const n = colA.length;
  const samples = new Float64Array(n);
  let cmMonitor: Float64Array | null = null;

  const gain = Number.isFinite(def.gain) ? def.gain : 1;
  const offset = Number.isFinite(def.offset) ? def.offset : 0;
  const nameA = dataset.columns[def.colA]?.name ?? 'A';
  const nameB = def.colB !== null ? (dataset.columns[def.colB]?.name ?? 'B') : null;

  if (def.kind === 'diff' && colB) {
    cmMonitor = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      samples[i] = (colA[i] - colB[i]) * gain + offset;
      cmMonitor[i] = 0.5 * (colA[i] + colB[i]);
    }
    return { time, samples, cmMonitor, label: `${nameA} − ${nameB}` };
  }

  if (def.kind === 'cm' && colB) {
    for (let i = 0; i < n; i++) {
      samples[i] = 0.5 * (colA[i] + colB[i]) * gain + offset;
    }
    return { time, samples, cmMonitor: null, label: `CM(${nameA}, ${nameB})` };
  }

  for (let i = 0; i < n; i++) {
    samples[i] = colA[i] * gain + offset;
  }
  return { time, samples, cmMonitor: null, label: nameA };
}
