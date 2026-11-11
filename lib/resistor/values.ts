// Lists of allowed values for the combination search: a series over a range, or a list the user pasted.

import { commonness, same, seriesValues } from './eseries';
import type { SeriesId } from './eseries';
import { MAX_OHMS, MIN_OHMS, readInput } from './read';

// The default range of a series in the search.
export const LIST_MIN_OHMS = 1;
export const LIST_MAX_OHMS = 1e7;

// Every value of a series from min to max, both included, ascending.
export function seriesList(id: SeriesId, min = LIST_MIN_OHMS, max = LIST_MAX_OHMS): number[] {
  return seriesValues(id, min, max);
}

// Positive, finite values in ascending order, each once (values equal within rounding count as one).
export function cleanValues(values: ArrayLike<number>): number[] {
  const sorted: number[] = [];
  for (let i = 0; i < values.length; i++) {
    const value = Number(values[i]);
    if (value > 0 && Number.isFinite(value)) sorted.push(value);
  }
  sorted.sort((a, b) => a - b);
  const out: number[] = [];
  for (const value of sorted) {
    if (!out.length || !same(out[out.length - 1], value)) out.push(value);
  }
  return out;
}

// One entry of a pasted list, as it was written, with where it stands in the text (so it can be taken out again).
export interface ListEntry {
  text: string;
  // null when the entry does not read as a resistance.
  ohms: number | null;
  start: number;
  end: number;
  // True when the same value stands earlier in the list.
  duplicate: boolean;
}

export interface ParsedList {
  // Ascending, each value once.
  values: number[];
  // The entries that do not read as a resistance, as they were written.
  rejected: string[];
  // How many entries repeated a value that was already in the list.
  duplicates: number;
  // Every entry in the order of the text.
  entries: ListEntry[];
}

// A single value in any notation the tool reads; markings and colours are not values.
export function readValue(text: string): number | null {
  const reading = readInput(text, 'value').readings.find((r) => r.kind === 'value');
  if (!reading || !(reading.ohms >= MIN_OHMS) || !(reading.ohms <= MAX_OHMS)) return null;
  return reading.ohms;
}

interface Piece {
  text: string;
  start: number;
  // Directly after the piece before it, with only a comma between: "4,7k" and "10k,22k".
  glued: boolean;
}

const DIGITS = /^\d+$/;

// A pasted list: values in the notations the tool reads (4k7, 10k, 22R, 1M, 4.7 kΩ, 0R1), separated by spaces,
// lines, semicolons or commas. Markings and colours are not read here: 472 is 472 Ω.
//
// The comma is a decimal sign in half of the world. A comma with a space beside it, or after a letter (10k,22k),
// always separates. A comma between two digits ("4,7k") is a decimal comma when the entries of the list are
// separated by spaces or lines (4,7k 10k 22k), and when a list has only that one comma and the number it gives is
// the more usual reading (4,7k, but 10,22 is 10 Ω and 22 Ω). In a list separated by commas alone (10,22,47) every
// comma separates. The entries say how each was read, so the page can show it.
export function parseValueList(text: string): ParsedList {
  const pieces: Piece[] = [];
  for (const chunk of text.matchAll(/[^\s;]+/g)) {
    let at = chunk.index;
    let before = '';
    chunk[0].split(',').forEach((part, i) => {
      if (part) pieces.push({ text: part, start: at, glued: i > 0 && before !== '' });
      before = part;
      at += part.length + 1;
    });
  }
  const spaced = pieces.some((p, i) => i > 0 && !p.glued && /\d/.test(p.text));
  const gluedCommas = pieces.filter((p) => p.glued).length;
  // Whether b follows a as the digits after a decimal comma could.
  const pair = (a: Piece | undefined, b: Piece | undefined) => !!a && !!b && b.glued && DIGITS.test(a.text) && /^\d/.test(b.text);

  const entries: ListEntry[] = [];
  for (let i = 0; i < pieces.length; i++) {
    const p = pieces[i];
    const q = pieces[i + 1];
    let number = p.text;
    let end = p.start + p.text.length;
    // Three numbers in a row with commas (10,22,47) are never a decimal number.
    if (pair(p, q) && !pair(pieces[i - 1], p) && !(DIGITS.test(q.text) && pair(q, pieces[i + 2]))) {
      const after = pieces[i + 2];
      const unit = after && !after.glued && !/\d/.test(after.text) ? after.text : '';
      const decimal = readValue(`${p.text}.${q.text}${unit}`);
      const a = readValue(p.text);
      const b = readValue(q.text + unit);
      const usual = decimal !== null && commonness(decimal) < 3;
      const apart = a !== null && b !== null && !same(a, b) && commonness(a) < 3 && commonness(b) < 3;
      let isDecimal = decimal !== null;
      if (isDecimal && !spaced) {
        if (usual !== apart) isDecimal = usual;
        else if (gluedCommas > 1) isDecimal = false;
        else if (!DIGITS.test(q.text) || unit || a === null || b === null) isDecimal = true;
        else isDecimal = commonness(decimal) <= Math.max(commonness(a), commonness(b));
      }
      if (isDecimal) {
        number = `${p.text}.${q.text}`;
        end = q.start + q.text.length;
        i += 1;
      }
    }
    let ohms = readValue(number);
    // A unit that stands apart from its number ("4.7 kΩ") belongs to it.
    const next = pieces[i + 1];
    if (next && !next.glued && !/\d/.test(next.text) && /^[\d.]+$/.test(number)) {
      const joined = readValue(number + next.text);
      if (joined !== null) {
        ohms = joined;
        end = next.start + next.text.length;
        i += 1;
      }
    }
    entries.push({ text: text.slice(p.start, end), ohms, start: p.start, end, duplicate: false });
  }

  const read: number[] = [];
  const rejected: string[] = [];
  for (const entry of entries) {
    if (entry.ohms === null) rejected.push(entry.text);
    else {
      entry.duplicate = read.some((value) => same(value, entry.ohms));
      read.push(entry.ohms);
    }
  }
  const values = cleanValues(read);
  return { values, rejected, duplicates: read.length - values.length, entries };
}
