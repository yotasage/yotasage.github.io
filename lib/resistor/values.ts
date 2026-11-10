// Lists of allowed values for the combination search: a series over a range, or a list the user pasted.

import { same, seriesValues } from './eseries';
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

export interface ParsedList {
  // Ascending, each value once.
  values: number[];
  // The entries that do not read as a resistance, as they were written.
  rejected: string[];
  // How many entries repeated a value that was already in the list.
  duplicates: number;
}

function readValue(text: string): number | null {
  const reading = readInput(text, 'value').readings.find((r) => r.kind === 'value');
  if (!reading || !(reading.ohms >= MIN_OHMS) || !(reading.ohms <= MAX_OHMS)) return null;
  return reading.ohms;
}

// A pasted list: values in the notations the tool reads (4k7, 10k, 22R, 1M, 4.7 kΩ, 0R1), separated by commas,
// semicolons, spaces or lines. A comma separates, so a decimal needs a point or the letter notation. Markings and
// colours are not read here: 472 is 472 Ω.
export function parseValueList(text: string): ParsedList {
  const tokens = text.split(/[\s,;]+/).filter(Boolean);
  const entries: { text: string; ohms: number | null }[] = [];
  for (const token of tokens) {
    const previous = entries[entries.length - 1];
    // A unit that stands apart from its number ("4.7 kΩ") belongs to the entry before it.
    if (!/\d/.test(token) && previous && /^[\d.]+$/.test(previous.text)) {
      const joined = readValue(previous.text + token);
      if (joined !== null) {
        previous.text += ` ${token}`;
        previous.ohms = joined;
        continue;
      }
    }
    entries.push({ text: token, ohms: readValue(token) });
  }
  const read: number[] = [];
  const rejected: string[] = [];
  for (const entry of entries) {
    if (entry.ohms === null) rejected.push(entry.text);
    else read.push(entry.ohms);
  }
  const values = cleanValues(read);
  return { values, rejected, duplicates: read.length - values.length };
}
