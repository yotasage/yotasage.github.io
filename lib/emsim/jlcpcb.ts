// JLCPCB's stackup templates (lib/emsim/jlcpcbStackups.json, written by scripts/harness/emsim/jlcpcb/convert.mjs;
// format in docs/em-sim/notes-M1.8a.md) as stackups with the presets' conventions, and the lists a picker needs.
// Framework-free; the data is passed in, never imported here, so the page loads it with `await import` only when the
// list is opened and the first load stays small (notes-M1.8b.md).

import { PRESET_KEYS, jlcCalc, jlcCopper, jlcDielectric, jlcFinish } from './presets';
import type { Layer, Stackup } from './stackup';

export type JlcKind = 'pp' | 'core' | 'bare';
// ["cu", t] or [kind, t, εr, material key, prepreg t before the copper fill is counted (only when it differs)].
export type JlcLayer = readonly ['cu', number] | readonly [JlcKind, number, number, string, number?];
export type JlcOffer = 'free' | 'standard' | 'special';

export interface JlcMaterial {
  kind: JlcKind;
  name: string;
  glass?: string;
  resin?: string;
  brand?: string;
  supplier?: string;
  cu?: string;
}

export interface JlcEntry {
  id: string;
  board: string; // 'rigid'
  layers: number;
  thickness: number; // nominal board thickness, mm
  outer: number; // oz
  inner: number | null; // oz, null for 2 layers
  finished?: number; // finished thickness JLCPCB states, mm
  tol?: { rel: number } | { abs: number };
  offer?: JlcOffer;
  tg?: number;
  note?: string; // 'withdrawn', 'special structure', 'inner copper weights differ'
  noReq: boolean; // the stackup JLCPCB's "No requirement" choice stands for
  code?: string;
  created?: string;
  updated?: string;
  stack: readonly JlcLayer[];
}

export interface JlcData {
  source: string;
  api: string;
  fetched: { from: string; to: string };
  converted: string;
  note: string;
  files: number;
  materials: Readonly<Record<string, JlcMaterial>>;
  stackups: readonly JlcEntry[];
}

// A unique, link-safe key: board_id_thickness_outer[_inner] (ids hold only letters, digits, '-' and '.').
export function jlcKey(e: JlcEntry): string {
  return e.inner === null ? `${e.board}_${e.id}_${e.thickness}_${e.outer}` : `${e.board}_${e.id}_${e.thickness}_${e.outer}_${e.inner}`;
}

export function jlcFind(data: JlcData, key: string): JlcEntry | null {
  for (const e of data.stackups) if (jlcKey(e) === key) return e;
  return null;
}

const oz = (x: number): string => (x === 0.5 ? '½ oz' : `${x} oz`);

export function jlcName(e: JlcEntry): string {
  return `JLCPCB ${e.id}: ${e.layers} layers, ${e.thickness} mm, ${oz(e.outer)} outer${e.inner === null ? '' : `, ${oz(e.inner)} inner`}`;
}

function material(kind: JlcKind, m: JlcMaterial | undefined): string {
  if (kind === 'pp') return m?.glass || m?.name || 'not named';
  const brand = m?.brand ? ` (${m.brand})` : '';
  return kind === 'bare' ? `FR-4 core, etched bare${brand}` : `FR-4 core${brand}`;
}

// The entry as a Stackup with the presets' conventions (presets.ts): the API's pressed thicknesses and εr (ref A, the
// fetch date), mask C1/C2/C3 at εr 3.8, the calculator's copper thickness where it states one, etch 0.35 mil per side;
// cores etched bare are cores. Stackup id and every source's id are the entry's key.
export function jlcStackup(e: JlcEntry, data: JlcData): Stackup {
  const key = jlcKey(e);
  const date = data.fetched.to;
  const n = e.stack.length;
  const inner: Layer[] = e.stack.map((l, i) => {
    if (l[0] === 'cu') {
      const outer = i === 0 || i === n - 1;
      return jlcCopper(key, l[1], jlcCalc(outer, outer ? e.outer : e.inner, l[1]), date);
    }
    return jlcDielectric(key, l[0] === 'pp' ? 'prepreg' : 'core', material(l[0], data.materials[l[3]]), l[1], l[2], date);
  });
  return jlcFinish(key, jlcName(e), inner, date);
}

// --- Lists for the picker ---

export interface JlcFilter {
  board?: string;
  layers?: number;
  thickness?: number;
  outer?: number;
  inner?: number | null;
  offer?: JlcOffer | 'none'; // 'none': JLCPCB names no offer
  withdrawn?: boolean; // false: leave out the ones JLCPCB marks withdrawn
}

export function jlcMatch(e: JlcEntry, f: JlcFilter): boolean {
  return (f.board === undefined || e.board === f.board) && (f.layers === undefined || e.layers === f.layers)
    && (f.thickness === undefined || e.thickness === f.thickness) && (f.outer === undefined || e.outer === f.outer)
    && (f.inner === undefined || e.inner === f.inner)
    && (f.offer === undefined || (f.offer === 'none' ? !e.offer : e.offer === f.offer))
    && (f.withdrawn !== false || e.note !== 'withdrawn');
}

export function jlcFilter(list: readonly JlcEntry[], f: JlcFilter): JlcEntry[] {
  return list.filter((e) => jlcMatch(e, f));
}

export type JlcField = 'board' | 'layers' | 'thickness' | 'outer' | 'inner' | 'offer';

// The distinct values of a field in a list, sorted (numbers ascending; null and no offer last).
export function jlcValues(list: readonly JlcEntry[], field: JlcField): (string | number | null)[] {
  const set = new Set<string | number | null>();
  for (const e of list) set.add((e[field] as string | number | null | undefined) ?? null);
  return [...set].sort((a, b) => (a === null ? 1 : b === null ? -1 : typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b))));
}

// The list grouped by a field, groups in jlcValues order, each group in list order.
export function jlcGroup(list: readonly JlcEntry[], field: JlcField): Map<string | number | null, JlcEntry[]> {
  const out = new Map<string | number | null, JlcEntry[]>();
  for (const k of jlcValues(list, field)) out.set(k, []);
  for (const e of list) out.get((e[field] as string | number | null | undefined) ?? null)!.push(e);
  return out;
}

// A stable sort: the keys in `first` in that order (default: the hand presets'), then by board, layers, thickness,
// outer, inner, id.
export function jlcSort(list: readonly JlcEntry[], first: readonly string[] = Object.values(PRESET_KEYS)): JlcEntry[] {
  const rank = new Map<string, number>();
  first.forEach((k, i) => rank.set(k, i));
  const keyed = list.map((e, i) => ({ e, i, r: rank.get(jlcKey(e)) ?? Infinity }));
  keyed.sort((a, b) => a.r - b.r || a.e.board.localeCompare(b.e.board) || a.e.layers - b.e.layers || a.e.thickness - b.e.thickness
    || a.e.outer - b.e.outer || (a.e.inner ?? 0) - (b.e.inner ?? 0) || a.e.id.localeCompare(b.e.id) || a.i - b.i);
  return keyed.map((x) => x.e);
}
