export type DelimiterOption = 'auto' | ',' | ';' | '\t' | '|' | ':';
export type ResolvedDelimiter = ',' | ';' | '\t' | '|' | ':';
export type ColumnAlignment = 'auto' | 'left' | 'right';

export interface AlignOptions {
  delimiter?: DelimiterOption;
  alignment?: ColumnAlignment;
  hasHeader?: boolean;
  fileName?: string;
}

export interface ParsedField {
  raw: string;
  value: string;
  quoted: boolean;
}

export interface ParsedRow {
  fields: ParsedField[];
}

export interface DelimitedTable {
  delimiter: ResolvedDelimiter;
  headers: string[];
  rows: string[][];
  colTypes: ('number' | 'text')[];
  colCount: number;
  totalRows: number;
  hasHeader: boolean;
}

const CANDIDATE_DELIMITERS: readonly ResolvedDelimiter[] = [',', ';', '\t', '|', ':'];

const DELIMITER_PRIORITY: Record<ResolvedDelimiter, number> = {
  '\t': 1.05,
  ',': 1.04,
  ';': 1.03,
  '|': 1.02,
  ':': 0.85,
};

const SPECIAL_NUM_RE = /^[+-]?(?:nan|inf|infinity)$/i;
const NUMERIC_RE =
  /^(?:[+-]?\s*[$€£¥₹]|[$€£¥₹]\s*[+-]?|[+-]?)\s*(?:(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?%?$/;

function getFileExtension(fileName?: string): string {
  if (!fileName) return '';
  const trimmed = fileName.trim().toLowerCase();
  const dot = trimmed.lastIndexOf('.');
  return dot >= 0 ? trimmed.slice(dot + 1) : '';
}

function isCommentOrBlank(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.length === 0 || trimmed.startsWith('#');
}

function displayWidth(text: string): number {
  let count = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) {
      const next = text.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        i++;
      }
    }
    count++;
  }
  return count;
}

function countDelimiterOutsideQuotes(line: string, delimiter: ResolvedDelimiter): number {
  let count = 0;
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (!inQuotes && ch === delimiter) {
      count++;
    }
  }
  return count;
}

export function detectDelimiter(text: string, fileName?: string): ResolvedDelimiter {
  const ext = getFileExtension(fileName);
  if (ext === 'tsv') return '\t';
  if (ext === 'psv') return '|';

  const lines = text.split(/\r?\n/);
  const sampleLines: string[] = [];
  for (const line of lines) {
    if (isCommentOrBlank(line)) continue;
    sampleLines.push(line);
    if (sampleLines.length >= 50) break;
  }

  if (sampleLines.length === 0) return ',';

  let bestDelimiter: ResolvedDelimiter = ',';
  let bestScore = 0;

  for (const candidate of CANDIDATE_DELIMITERS) {
    const counts = sampleLines.map((line) => countDelimiterOutsideQuotes(line, candidate));
    const nonZeroCounts = counts.filter((c) => c > 0);
    if (nonZeroCounts.length === 0) continue;

    const freq = new Map<number, number>();
    for (const c of nonZeroCounts) {
      freq.set(c, (freq.get(c) ?? 0) + 1);
    }

    let modeCount = 0;
    let modeMatches = 0;
    for (const [countVal, occurrences] of freq.entries()) {
      if (occurrences > modeMatches || (occurrences === modeMatches && countVal > modeCount)) {
        modeMatches = occurrences;
        modeCount = countVal;
      }
    }

    const coverage = nonZeroCounts.length / sampleLines.length;
    const consistency = modeMatches / sampleLines.length;
    const exactMatchBonus = modeMatches === sampleLines.length && sampleLines.length > 1 ? 1.5 : 1.0;
    const widthFactor = Math.min(modeCount, 20) + 1;
    const score =
      coverage * consistency * widthFactor * 10 * exactMatchBonus * DELIMITER_PRIORITY[candidate];

    if (score > bestScore) {
      bestScore = score;
      bestDelimiter = candidate;
    }
  }

  return bestScore > 0 ? bestDelimiter : ',';
}

function isPaddingSpace(ch: string, delimiter: ResolvedDelimiter): boolean {
  if (ch === ' ') return true;
  if (delimiter !== '\t' && ch === '\t') return true;
  return false;
}

export function parseDelimitedRow(line: string, delimiter: ResolvedDelimiter): ParsedRow {
  const len = line.length;
  if (len === 0) return { fields: [] };

  const fields: ParsedField[] = [];
  let i = 0;

  while (true) {
    const fieldStart = i;
    let wsEnd = i;
    while (wsEnd < len && isPaddingSpace(line[wsEnd], delimiter)) {
      wsEnd++;
    }

    if (wsEnd < len && line[wsEnd] === '"') {
      let j = wsEnd + 1;
      let value = '';
      let closed = false;

      while (j < len) {
        if (line[j] === '"') {
          if (j + 1 < len && line[j + 1] === '"') {
            value += '"';
            j += 2;
          } else {
            closed = true;
            j++;
            break;
          }
        } else {
          value += line[j];
          j++;
        }
      }

      if (closed) {
        let afterWs = j;
        while (afterWs < len && isPaddingSpace(line[afterWs], delimiter)) {
          afterWs++;
        }
        if (afterWs === len || line[afterWs] === delimiter) {
          fields.push({
            raw: line.slice(wsEnd, j),
            value,
            quoted: true,
          });
          i = afterWs;
          if (i < len && line[i] === delimiter) {
            i++;
            continue;
          }
          break;
        }
      } else {
        fields.push({
          raw: line.slice(wsEnd),
          value,
          quoted: true,
        });
        break;
      }
    }

    // Unquoted field (or malformed trailing text after closing quote)
    let end = fieldStart;
    while (end < len && line[end] !== delimiter) {
      end++;
    }
    const raw = line.slice(fieldStart, end);
    fields.push({
      raw,
      value: raw.trim(),
      quoted: false,
    });
    i = end;
    if (i < len && line[i] === delimiter) {
      i++;
      continue;
    }
    break;
  }

  return { fields };
}

export function isNumericCell(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length === 0) return false;
  if (SPECIAL_NUM_RE.test(trimmed)) return true;
  return NUMERIC_RE.test(trimmed);
}

function parseNumericValue(value: string): number {
  const trimmed = value.trim();
  if (trimmed.length === 0) return Number.NaN;
  const lower = trimmed.toLowerCase();
  if (lower === 'nan' || lower === '+nan' || lower === '-nan') return Number.NaN;
  if (lower === 'inf' || lower === '+inf' || lower === 'infinity' || lower === '+infinity') {
    return Number.POSITIVE_INFINITY;
  }
  if (lower === '-inf' || lower === '-infinity') {
    return Number.NEGATIVE_INFINITY;
  }
  const cleaned = trimmed.replace(/[$€£¥₹,%\s]/g, '');
  if (cleaned.length === 0) return Number.NaN;
  return Number(cleaned);
}

function resolveDelimiterOption(
  text: string,
  delimiterOption?: DelimiterOption,
  fileName?: string,
): ResolvedDelimiter {
  if (!delimiterOption || delimiterOption === 'auto') {
    return detectDelimiter(text, fileName);
  }
  return delimiterOption;
}

function inferColumnTypes(
  rows: readonly ParsedRow[],
  colCount: number,
  startRowIndex: number,
): ('number' | 'text')[] {
  const types: ('number' | 'text')[] = [];
  for (let c = 0; c < colCount; c++) {
    let seenNonEmpty = false;
    let allNumeric = true;
    for (let r = startRowIndex; r < rows.length; r++) {
      const cell = rows[r].fields[c];
      const val = cell ? cell.value.trim() : '';
      if (val.length === 0) continue;
      seenNonEmpty = true;
      if (!isNumericCell(val)) {
        allNumeric = false;
        break;
      }
    }
    types.push(seenNonEmpty && allNumeric ? 'number' : 'text');
  }
  return types;
}

export function alignDelimitedText(
  text: string,
  options?: AlignOptions,
): { output: string; delimiter: ResolvedDelimiter; rowCount: number; colCount: number; error: string | null } {
  const delimiter = resolveDelimiterOption(text, options?.delimiter, options?.fileName);
  const alignment: ColumnAlignment = options?.alignment ?? 'auto';
  const hasHeader = options?.hasHeader !== false;
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const rawLines = text.split(/\r?\n/);

  interface LineEntry {
    kind: 'passthrough' | 'data';
    raw: string;
    parsed?: ParsedRow;
    tokens?: string[];
  }

  const entries: LineEntry[] = [];
  const dataRows: ParsedRow[] = [];
  let colCount = 0;

  for (const raw of rawLines) {
    if (isCommentOrBlank(raw)) {
      entries.push({ kind: 'passthrough', raw });
      continue;
    }
    const parsed = parseDelimitedRow(raw, delimiter);
    const tokens = parsed.fields.map((f) => (f.quoted ? f.raw : f.value));
    if (tokens.length > colCount) {
      colCount = tokens.length;
    }
    dataRows.push(parsed);
    entries.push({ kind: 'data', raw, parsed, tokens });
  }

  if (dataRows.length === 0) {
    return { output: text, delimiter, rowCount: 0, colCount: 0, error: null };
  }

  const colWidths = new Array<number>(colCount).fill(0);
  for (const entry of entries) {
    if (entry.kind !== 'data' || !entry.tokens) continue;
    for (let c = 0; c < entry.tokens.length; c++) {
      const w = displayWidth(entry.tokens[c]);
      if (w > colWidths[c]) colWidths[c] = w;
    }
  }

  const skipHeaderRow = hasHeader && dataRows.length >= 2;
  const colTypes = inferColumnTypes(dataRows, colCount, skipHeaderRow ? 1 : 0);
  const colAlignments: ('left' | 'right')[] = colTypes.map((t) => {
    if (alignment === 'left') return 'left';
    if (alignment === 'right') return 'right';
    return t === 'number' ? 'right' : 'left';
  });

  let dataRowIndex = 0;
  const outputLines = entries.map((entry) => {
    if (entry.kind === 'passthrough' || !entry.tokens) {
      return entry.raw;
    }

    const tokens = entry.tokens;
    const isHeaderAutoRow = alignment === 'auto' && skipHeaderRow && dataRowIndex === 0;
    dataRowIndex++;

    let lineOut = '';
    for (let c = 0; c < tokens.length; c++) {
      const token = tokens[c];
      const isLast = c === tokens.length - 1;
      const cellAlign = isHeaderAutoRow ? 'left' : colAlignments[c];
      const pad = Math.max(0, colWidths[c] - displayWidth(token));

      let formatted: string;
      if (isLast) {
        formatted = cellAlign === 'right' && token.length > 0 ? ' '.repeat(pad) + token : token;
      } else {
        formatted = cellAlign === 'right' ? ' '.repeat(pad) + token : token + ' '.repeat(pad);
      }

      if (c > 0) {
        lineOut += delimiter;
        if (!(isLast && formatted.length === 0)) {
          lineOut += ' ';
        }
      }
      lineOut += formatted;
    }

    return lineOut;
  });

  return {
    output: outputLines.join(eol),
    delimiter,
    rowCount: dataRows.length,
    colCount,
    error: null,
  };
}

export function shrinkDelimitedText(
  text: string,
  delimiterOption?: DelimiterOption,
  fileName?: string,
): { output: string; delimiter: ResolvedDelimiter; rowCount: number; error: string | null } {
  const delimiter = resolveDelimiterOption(text, delimiterOption, fileName);
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const rawLines = text.split(/\r?\n/);
  let rowCount = 0;

  const outputLines = rawLines.map((raw) => {
    if (isCommentOrBlank(raw)) return raw;
    rowCount++;
    const parsed = parseDelimitedRow(raw, delimiter);
    return parsed.fields.map((f) => (f.quoted ? f.raw : f.value)).join(delimiter);
  });

  return {
    output: outputLines.join(eol),
    delimiter,
    rowCount,
    error: null,
  };
}

export function buildDelimitedTable(
  text: string,
  options?: { delimiter?: DelimiterOption; hasHeader?: boolean; fileName?: string; maxRows?: number },
): DelimitedTable {
  const delimiter = resolveDelimiterOption(text, options?.delimiter, options?.fileName);
  const hasHeader = options?.hasHeader !== false;
  const rawLines = text.split(/\r?\n/);

  const parsedRows: ParsedRow[] = [];
  let colCount = 0;
  for (const raw of rawLines) {
    if (isCommentOrBlank(raw)) continue;
    const parsed = parseDelimitedRow(raw, delimiter);
    if (parsed.fields.length > colCount) {
      colCount = parsed.fields.length;
    }
    parsedRows.push(parsed);
  }

  if (parsedRows.length === 0) {
    return {
      delimiter,
      headers: [],
      rows: [],
      colTypes: [],
      colCount: 0,
      totalRows: 0,
      hasHeader,
    };
  }

  let headers: string[];
  let dataStartIndex: number;

  if (hasHeader) {
    const headerRow = parsedRows[0].fields;
    headers = Array.from({ length: colCount }, (_, idx) =>
      idx < headerRow.length ? headerRow[idx].value : `Column ${idx + 1}`,
    );
    dataStartIndex = 1;
  } else {
    headers = Array.from({ length: colCount }, (_, idx) => `Column ${idx + 1}`);
    dataStartIndex = 0;
  }

  const totalRows = Math.max(0, parsedRows.length - dataStartIndex);
  const maxRows =
    options?.maxRows !== undefined && options.maxRows >= 0 ? Math.floor(options.maxRows) : totalRows;
  const rowLimit = Math.min(totalRows, maxRows);

  const rows: string[][] = [];
  for (let i = 0; i < rowLimit; i++) {
    const fields = parsedRows[dataStartIndex + i].fields;
    const row = Array.from({ length: colCount }, (_, c) => (c < fields.length ? fields[c].value : ''));
    rows.push(row);
  }

  const colTypes = inferColumnTypes(parsedRows, colCount, dataStartIndex);

  return {
    delimiter,
    headers,
    rows,
    colTypes,
    colCount,
    totalRows,
    hasHeader,
  };
}

export function sortTableRows(
  rows: readonly string[][],
  colIndex: number,
  direction: 'asc' | 'desc',
  colType: 'number' | 'text',
): string[][] {
  const dir = direction === 'desc' ? -1 : 1;
  return rows.slice().sort((rowA, rowB) => {
    const aRaw = rowA[colIndex] ?? '';
    const bRaw = rowB[colIndex] ?? '';

    if (colType === 'number') {
      const aEmpty = aRaw.trim().length === 0;
      const bEmpty = bRaw.trim().length === 0;
      if (aEmpty && bEmpty) return 0;
      if (aEmpty) return 1;
      if (bEmpty) return -1;

      const aNum = parseNumericValue(aRaw);
      const bNum = parseNumericValue(bRaw);
      const aNaN = Number.isNaN(aNum);
      const bNaN = Number.isNaN(bNum);

      if (!aNaN && !bNaN) {
        if (aNum === bNum) return 0;
        return aNum < bNum ? -dir : dir;
      }
      if (aNaN && bNaN) {
        return aRaw.localeCompare(bRaw, undefined, { sensitivity: 'base' }) * dir;
      }
      return aNaN ? 1 : -1;
    }

    return aRaw.localeCompare(bRaw, undefined, { sensitivity: 'base' }) * dir;
  });
}

export function filterTableRows(rows: readonly string[][], query: string): string[][] {
  const needle = query.trim().toLowerCase();
  if (needle.length === 0) return rows.slice();
  return rows.filter((row) => row.some((cell) => cell.toLowerCase().includes(needle)));
}
