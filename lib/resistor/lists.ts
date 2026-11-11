// The visitor's own value lists for the combination search: how a list is kept in the browser, how it travels in a
// link, the presets to start from, and what a list can reach.

import { same } from './eseries';
import type { SeriesId } from './eseries';
import { formatOhms, formatRkm } from './format';
import type { Connections } from './combine';
import { cleanValues, readValue, seriesList } from './values';

// A list as it is kept: the text as its owner wrote it, so that editing it later shows the same notation.
export interface StoredList {
  id: string;
  name: string;
  text: string;
}

export const LISTS_KEY = 'resistor.lists';
export const MAX_LISTS = 40;
export const MAX_LIST_NAME = 40;

// What localStorage holds under LISTS_KEY: { "v": 1, "lists": [{ "id", "name", "text" }] }.
export function listsFromStorage(json: string | null): StoredList[] {
  if (!json) return [];
  try {
    const data = JSON.parse(json);
    if (!data || !Array.isArray(data.lists)) return [];
    return data.lists
      .filter((l: StoredList) => l && typeof l.id === 'string' && typeof l.name === 'string' && typeof l.text === 'string')
      .slice(0, MAX_LISTS)
      .map((l: StoredList) => ({ id: l.id, name: l.name.slice(0, MAX_LIST_NAME), text: l.text }));
  } catch {
    return [];
  }
}

export function listsToStorage(lists: StoredList[]): string {
  return JSON.stringify({ v: 1, lists });
}

// The most values a link carries (about 1,500 characters). A longer list stays in the browser it was made in.
export const LINK_LIST_MAX = 300;

// A list in a link: its values in the letter notation, joined by "_": 10R_4k7_1M. A value the notation cannot hold
// is written as a number.
export function listToLink(values: number[]): string {
  return values.map((value) => {
    const rkm = formatRkm(value, 9);
    const back = readValue(rkm);
    return back !== null && same(back, value) ? rkm : String(value);
  }).join('_');
}

export function listFromLink(text: string): number[] {
  const values: number[] = [];
  for (const part of text.split('_').slice(0, LINK_LIST_MAX)) {
    const value = part ? readValue(part) : null;
    if (value !== null) values.push(value);
  }
  return cleanValues(values);
}

export function sameValues(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((value, i) => same(value, b[i]));
}

// Lists to start from: a series over the range of a usual resistor kit. They can be derived, so nothing is invented.
export interface ListPreset {
  name: string;
  series: SeriesId;
  min: number;
  max: number;
}

export const LIST_PRESETS: ListPreset[] = (['E6', 'E12', 'E24', 'E96'] as SeriesId[]).map((id) => ({
  name: `${id}, 10 Ω to 1 MΩ`, series: id, min: 10, max: 1e6,
}));

// The values of a preset as a text, one decade on a line.
export function presetText(preset: ListPreset): string {
  const lines: string[][] = [];
  let decade = NaN;
  for (const value of seriesList(preset.series, preset.min, preset.max)) {
    const d = Math.floor(Math.log10(value) + 1e-9);
    if (d !== decade) lines.push([]);
    decade = d;
    lines[lines.length - 1].push(formatRkm(value));
  }
  return lines.map((line) => line.join(' ')).join('\n');
}

// A text without one entry (from `start` to `end`), with the separators around it tidied.
export function withoutEntry(text: string, start: number, end: number): string {
  const before = text.slice(0, start).replace(/[ \t,;]+$/, '');
  const after = text.slice(end).replace(/^[ \t,;]+/, '');
  if (!before.trim()) return after;
  return /^\s*$/.test(after) ? before : `${before}${/\n$/.test(before) || /^\n/.test(after) ? '' : ' '}${after}`;
}

// The smallest and the largest value that networks of up to `parts` resistors from the list can have.
export function listReach(values: number[], parts: number, connections: Connections, reuse: boolean): { low: number; high: number } | null {
  if (!values.length) return null;
  const n = Math.max(1, Math.min(parts, reuse ? parts : values.length));
  let low = values[0];
  let high = values[values.length - 1];
  if (connections !== 'series') {
    let siemens = 0;
    for (let i = 0; i < n; i++) siemens += 1 / values[reuse ? 0 : i];
    low = 1 / siemens;
  }
  if (connections !== 'parallel') {
    high = 0;
    for (let i = 0; i < n; i++) high += values[values.length - 1 - (reuse ? 0 : i)];
  }
  return { low, high };
}

// "1 Ω to 10 MΩ"
export function formatRange(min: number, max: number): string {
  return `${formatOhms(min)} to ${formatOhms(max)}`;
}

const SI: Record<string, number> = { p: 1e-12, n: 1e-9, u: 1e-6, µ: 1e-6, μ: 1e-6, m: 1e-3, '': 1, k: 1e3, M: 1e6 };

// A voltage or a current as typed: "12", "3,3 V", "20m", "20 mA", "1.5k". null when it is not a positive number.
export function parseQuantity(text: string): number | null {
  const match = /^\s*(\d+(?:[.,]\d+)?|[.,]\d+)\s*([pnuµμmkM]?)\s*[VvAa]?\s*$/.exec(text);
  if (!match) return null;
  const value = Number(match[1].replace(',', '.')) * SI[match[2]];
  return value > 0 && Number.isFinite(value) ? value : null;
}

// "204 mW", "19.1 mA", "12 V": three significant digits with an SI prefix.
export function formatQuantity(value: number, unit: string): string {
  if (!(Math.abs(value) > 0) || !Number.isFinite(value)) return `0 ${unit}`;
  const steps: [number, string][] = [[1e6, 'M'], [1e3, 'k'], [1, ''], [1e-3, 'm'], [1e-6, 'µ'], [1e-9, 'n'], [1e-12, 'p']];
  const [scale, prefix] = steps.find(([s]) => Math.abs(value) >= s * 0.9995) ?? steps[steps.length - 1];
  return `${Number((value / scale).toPrecision(3))} ${prefix}${unit}`;
}

// "1.8 billion", "12,400", "169": how many networks a search covered.
export function formatCount(count: number): string {
  if (count < 1e6) return Math.round(count).toLocaleString('en-US');
  const names: [number, string][] = [[1e15, 'quadrillion'], [1e12, 'trillion'], [1e9, 'billion'], [1e6, 'million']];
  const [scale, name] = names.find(([s]) => count >= s) ?? names[names.length - 1];
  return `${Number((count / scale).toPrecision(3))} ${name}`;
}
