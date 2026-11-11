// What the Combinations section searches with. All of it is part of the link.

import {
  Connections, LINK_LIST_MAX, LIST_MAX_OHMS, LIST_MIN_OHMS, MAX_LIST_NAME, SERIES, SeriesId, formatRkm, listFromLink, listToLink, readValue,
} from '../../lib/resistor';

export interface Combo {
  // The series searched; null follows the tolerance (the series usual for it).
  series: SeriesId | null;
  // The range of the series, in ohms.
  min: number;
  max: number;
  // The visitor's own list in use, with its values as they travel in the link; null searches the series.
  list: { name: string; values: number[] } | null;
  // The id of that list in this browser's storage, when it is kept there.
  listId: string | null;
  // The largest number of resistors, 1 to 4.
  parts: number;
  connections: Connections;
  // Whether a value may be used more than once in a network.
  reuse: boolean;
  // Show only the networks of this many resistors; 0 shows all.
  filter: number;
  // An optional voltage across the network ('v') or current through it ('i'), as typed.
  loadKind: 'v' | 'i';
  load: string;
}

export const DEFAULT_COMBO: Combo = {
  series: null, min: LIST_MIN_OHMS, max: LIST_MAX_OHMS, list: null, listId: null, parts: 2, connections: 'mixed', reuse: true, filter: 0,
  loadKind: 'v', load: '',
};

// E24+E96 is e24e96 in a link.
const seriesParam = (id: SeriesId) => id.toLowerCase().replace('+', '');

// cs series, cr range (10R-1M), cl the list's values (10R_4k7_1M) with cln its name, cid the id of a list too long
// for a link, cn number of resistors, cc connections (s, p), cu=1 each value once, cf filter, cv volts or ci amps.
export function comboFromParams(params: URLSearchParams): Combo {
  const combo: Combo = { ...DEFAULT_COMBO };
  const chosen = SERIES.find((s) => seriesParam(s.id) === params.get('cs'));
  if (chosen) combo.series = chosen.id;
  const [min, max] = (params.get('cr') ?? '').split('-').map((part) => readValue(part));
  if (min && max && min < max) {
    combo.min = min;
    combo.max = max;
  }
  const name = (params.get('cln') ?? '').slice(0, MAX_LIST_NAME);
  if (params.has('cl')) combo.list = { name: name || 'Shared list', values: listFromLink(params.get('cl')) };
  else if (params.get('cid')) combo.listId = params.get('cid');
  const parts = Number(params.get('cn'));
  if (parts >= 1 && parts <= 4 && Number.isInteger(parts)) combo.parts = parts;
  if (params.get('cc') === 's') combo.connections = 'series';
  if (params.get('cc') === 'p') combo.connections = 'parallel';
  if (params.get('cu') === '1') combo.reuse = false;
  const filter = Number(params.get('cf'));
  if (filter >= 1 && filter <= combo.parts && Number.isInteger(filter)) combo.filter = filter;
  if (params.get('ci')) {
    combo.loadKind = 'i';
    combo.load = params.get('ci');
  } else if (params.get('cv')) combo.load = params.get('cv');
  return combo;
}

export function comboToParams(combo: Combo, params: URLSearchParams): void {
  if (combo.list && combo.list.values.length <= LINK_LIST_MAX) {
    params.set('cl', listToLink(combo.list.values));
    params.set('cln', combo.list.name);
  } else if (combo.listId) {
    params.set('cid', combo.listId);
  }
  if (combo.series) params.set('cs', seriesParam(combo.series));
  if (combo.min !== LIST_MIN_OHMS || combo.max !== LIST_MAX_OHMS) params.set('cr', `${formatRkm(combo.min, 9)}-${formatRkm(combo.max, 9)}`);
  if (combo.parts !== 2) params.set('cn', String(combo.parts));
  if (combo.connections !== 'mixed') params.set('cc', combo.connections === 'series' ? 's' : 'p');
  if (!combo.reuse) params.set('cu', '1');
  if (combo.filter && combo.filter <= combo.parts) params.set('cf', String(combo.filter));
  if (combo.load.trim()) params.set(combo.loadKind === 'i' ? 'ci' : 'cv', combo.load.trim());
}
