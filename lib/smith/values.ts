// The values a visitor can buy (plan.md D17, engine.md §7): a list per kind of value (R, L, C, Zt or Zc, a length):
// an E-series (E6 to E96, lib/resistor/eseries.ts, which takes plain numbers, so nH and pF snap as they are), the
// visitor's own pasted list, or any value. Defaults: R, L and C on E24, impedances and lengths on any value. The
// solver's standard-value variants (solver.md "What comes back") put each solved value on its two neighbours in its
// list and re-evaluate every combination with network.ts, so the page shows what the rounding costs; Snap (M4.3) uses
// the same neighbours. The choice has a short text form for the link and localStorage. Framework-free.

import { neighbours as seriesNeighbours, same, series, standardValue } from '../resistor/eseries';
import type { SeriesId } from '../resistor/eseries';
import { LINK_LIST_MAX } from '../resistor/lists';
import { cleanValues, parseValueList } from '../resistor/values';
import { readAmount } from '../quantity';
import { goalMismatch, goalNode, goalResidual, goalSigned, isWithin } from './goal';
import type { Goal } from './goal';
import { NODE_STRIDE, evaluate, nodeGamma } from './network';
import type { Circuit } from './network';
import {
  LINE, QUARTER, SERIES_C, SERIES_L, SERIES_R, SHUNT_C, SHUNT_L, SHUNT_R, STUB_OPEN, STUB_SHORT, packParts,
} from './parts';
import type { Part } from './parts';
import type { Solution, SolvedValue } from './solve';

/** A kind of value: resistance, inductance, capacitance, an impedance (Zt, Zc), a length in wavelengths. */
export type ValueKind = 'R' | 'L' | 'C' | 'Z' | 'len';
export const VALUE_KINDS: readonly ValueKind[] = ['R', 'L', 'C', 'Z', 'len'];
/** The unit each kind is read and shown in ('' for a length in wavelengths). */
export const VALUE_UNITS: Readonly<Record<ValueKind, string>> = { R: 'Ω', L: 'H', C: 'F', Z: 'Ω', len: '' };

export type ListId = 'E6' | 'E12' | 'E24' | 'E48' | 'E96' | 'own' | 'any';
export const LIST_IDS: readonly ListId[] = ['E6', 'E12', 'E24', 'E48', 'E96', 'own', 'any'];

/** A list: an E-series, the visitor's own values (ascending, each once) or any value. */
export interface ValueList { id: ListId; values?: number[] }
export type ValueChoice = Record<ValueKind, ValueList>;

const DEFAULT_IDS: Readonly<Record<ValueKind, ListId>> = { R: 'E24', L: 'E24', C: 'E24', Z: 'any', len: 'any' };

/** The defaults of D17: R, L and C on E24, impedances and lengths on any value. */
export function defaultChoice(): ValueChoice {
  return { R: { id: 'E24' }, L: { id: 'E24' }, C: { id: 'E24' }, Z: { id: 'any' }, len: { id: 'any' } };
}

/** The list kind of a part kind's value (or Zc), null for f0. */
export function valueKindOf(kind: number, param: 'value' | 'zc' | 'f0' = 'value'): ValueKind | null {
  if (param === 'f0' || kind < 0) return null;
  if (param === 'zc') return 'Z';
  switch (kind) {
    case SERIES_R: case SHUNT_R: return 'R';
    case SERIES_L: case SHUNT_L: return 'L';
    case SERIES_C: case SHUNT_C: return 'C';
    case QUARTER: return 'Z';
    case LINE: case STUB_OPEN: case STUB_SHORT: return 'len';
    default: return null;
  }
}

/** The neighbours of a value in a list: the nearest below and above (NaN where the list has none), exact when it is in the list. */
export interface Around { below: number; above: number; exact: boolean }

/**
 * The neighbours of `value` in a list, across decades for an E-series; null for "any value" and for values that are
 * not positive and finite (an open or short, a length of 0).
 */
export function around(value: number, list: ValueList): Around | null {
  if (!(value > 0 && value < Infinity) || list.id === 'any') return null;
  if (list.id === 'own') {
    const v = list.values ?? [];
    if (v.length === 0) return null;
    // The first index whose value is ≥ value (within rounding).
    let lo = 0, hi = v.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (v[mid] < value && !same(v[mid], value)) lo = mid + 1; else hi = mid; }
    if (lo < v.length && same(v[lo], value)) return { below: value, above: value, exact: true };
    return { below: lo > 0 ? v[lo - 1] : NaN, above: lo < v.length ? v[lo] : NaN, exact: false };
  }
  // eseries.ts `neighbours` builds every value of three decades from text (288 for E96): too slow for a drag's
  // pointer moves. The same answer from the four values round the mantissa's place (M4.3b; check-values.mjs compares).
  const ms = series(list.id as SeriesId)?.mantissas;
  if (!ms) {
    const n = seriesNeighbours(value, list.id as SeriesId);
    if (!n) return null;
    return n.exact ? { below: value, above: value, exact: true } : { below: n.below, above: n.above, exact: false };
  }
  const m = ms.length, dec = Math.floor(Math.log10(value)), x = value / 10 ** (dec - 2);
  let lo = 0, hi = m;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (ms[mid] <= x) lo = mid + 1; else hi = mid; }
  let below = -Infinity, above = Infinity, exact = false;
  for (let g = lo - 2; g <= lo + 1; g++) {
    const w = g < 0 ? -1 : g >= m ? 1 : 0;
    const v = standardValue(ms[g - w * m], dec + w);
    if (same(v, value)) exact = true;
    else if (v < value) { if (v > below) below = v; } else if (v < above) above = v;
  }
  return exact ? { below: value, above: value, exact: true } : { below, above, exact: false };
}

/** The values of a list to try for `value`: itself when exact or when the list has none, else its one or two neighbours. */
export function candidates(value: number, list: ValueList): number[] {
  const a = around(value, list);
  if (!a || a.exact) return [value];
  const out: number[] = [];
  if (a.below === a.below) out.push(a.below);
  if (a.above === a.above) out.push(a.above);
  return out.length ? out : [value];
}

/**
 * A pasted list of values of one kind: resistances with the resistor tool's reader (lib/resistor/values.ts, its
 * notations and decimal-comma rules); other kinds with lib/quantity.ts readAmount in the kind's unit (4n7, 4.7 nH,
 * 2,2p), separated by spaces, lines, semicolons, or commas (a comma between digits is a decimal comma when the list is
 * separated by spaces or lines). Values ascending, each once; the entries that do not read.
 */
export function parseOwnList(text: string, kind: ValueKind): { values: number[]; rejected: string[] } {
  if (kind === 'R') {
    const parsed = parseValueList(text);
    return { values: parsed.values, rejected: parsed.rejected };
  }
  const spaced = /\S\s+\S/.test(text.trim());
  const unit = VALUE_UNITS[kind] || undefined;
  const values: number[] = [], rejected: string[] = [];
  for (const chunk of text.split(/[\s;]+/)) {
    if (!chunk) continue;
    const pieces = spaced && /^[^,]*\d,\d[^,]*$/.test(chunk) ? [chunk] : chunk.split(',');
    for (const piece of pieces) {
      if (!piece) continue;
      const v = readAmount(piece, unit);
      // "22p" is 22 × 1e-12 = 2.1999999999999998e-11 in binary: kept as the decimal it was typed as (15 digits).
      if (v !== null && v > 0 && v < Infinity) values.push(Number(v.toPrecision(15))); else rejected.push(piece);
    }
  }
  return { values: cleanValues(values), rejected };
}

// ---------------------------------------------------------------------------------------------------------------
// The text form: the kinds that differ from the default, comma-separated: a letter (R, L, C, Z, N for lengths) and
// the list: 6, 12, 24, 48, 96, a (any value) or o and the own values joined by "_" (as JavaScript writes them, so they
// read back exactly): "L12,Co1e-12_2.2e-12_4.7e-12,Z24". The defaults are "". Reading never throws: what does not
// read keeps the default.

const LETTERS: Readonly<Record<ValueKind, string>> = { R: 'R', L: 'L', C: 'C', Z: 'Z', len: 'N' };
const CODES: Readonly<Record<ListId, string>> = { E6: '6', E12: '12', E24: '24', E48: '48', E96: '96', own: 'o', any: 'a' };

export function choiceToText(choice: ValueChoice): string {
  const parts: string[] = [];
  for (const kind of VALUE_KINDS) {
    const list = choice[kind];
    if (!list || !LIST_IDS.includes(list.id)) continue;
    if (list.id === 'own') {
      const values = cleanValues(list.values ?? []).slice(0, LINK_LIST_MAX);
      parts.push(`${LETTERS[kind]}o${values.map(String).join('_')}`);
    } else if (list.id !== DEFAULT_IDS[kind]) parts.push(`${LETTERS[kind]}${CODES[list.id]}`);
  }
  return parts.join(',');
}

export function choiceFromText(text: string): ValueChoice {
  const choice = defaultChoice();
  for (const part of String(text ?? '').split(',')) {
    const kind = VALUE_KINDS.find((k) => LETTERS[k] === part[0]);
    if (!kind) continue;
    const code = part.slice(1);
    if (code[0] === 'o') {
      const values = cleanValues(code.slice(1).split('_').slice(0, LINK_LIST_MAX).map((v) => (v ? Number(v) : NaN)));
      if (values.length) choice[kind] = { id: 'own', values };
      continue;
    }
    const id = LIST_IDS.find((l) => l !== 'own' && CODES[l] === code);
    if (id) choice[kind] = { id };
  }
  return choice;
}

// ---------------------------------------------------------------------------------------------------------------
// Standard-value variants of a solution

export interface Variant {
  /** The value of each unknown (the solution's order), from its list. */
  values: number[];
  /** Every value is the solution's own (each was in its list, or its list is any value). */
  exact: boolean;
  /** |Γ| at the goal node, the goal's residual and mismatch (goal.ts), from network.ts. */
  gamma: number;
  residual: number;
  mismatch: number;
  /** The goal holds: the residual is below 1e-9, or an inequality goal is kept. */
  meets: boolean;
}

const nodes = new Float64Array(64 * NODE_STRIDE);
const gv = new Float64Array(2);

/** Γ at the goal node of the circuit with the values of a solution set to `vals`. */
function gammaWith(circuit: Circuit, node: number, values: readonly SolvedValue[], vals: readonly number[]): void {
  const parts: Part[] = circuit.parts.map((p) => ({ ...p }));
  let f = circuit.f0;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v.param === 'f0') f = vals[i];
    else if (v.param === 'zc') parts[v.part].zc = vals[i];
    else parts[v.part] = { kind: v.kind as Part['kind'], value: vals[i], zc: v.zc };
  }
  const buf = (parts.length + 1) * NODE_STRIDE <= nodes.length ? nodes : new Float64Array((parts.length + 1) * NODE_STRIDE);
  evaluate(buf, packParts(parts), parts.length, circuit.loadR, circuit.loadX, circuit.z0, f, circuit.f0);
  nodeGamma(gv, 0, buf, node * NODE_STRIDE);
}

/**
 * The solution with its values on their lists' neighbours: every combination (1, 2 or 4), each re-evaluated by
 * network.ts, ordered by how near the goal it comes (a point target: the mismatch; an inequality goal: |Γ|; a circle:
 * the residual), then by the values.
 */
export function standardVariants(circuit: Circuit, goal: Goal, solution: Solution, choice: ValueChoice): Variant[] {
  const node = goalNode(goal, circuit.parts.length);
  const options = solution.values.map((v) => {
    const kind = valueKindOf(v.kind, v.param);
    return kind ? candidates(v.value, choice[kind] ?? { id: 'any' }) : [v.value];
  });
  const out: Variant[] = [];
  const pick = (i: number, vals: number[]): void => {
    if (i === options.length) {
      gammaWith(circuit, node, solution.values, vals);
      const gr = gv[0], gi = gv[1];
      const residual = goalResidual(goal, gr, gi, circuit.z0);
      const meets = isWithin(goal) ? goalSigned(goal, gr, gi) <= 0 : residual <= 1e-9;
      out.push({
        values: vals.slice(), exact: vals.every((x, k) => x === solution.values[k].value), gamma: Math.hypot(gr, gi),
        residual, mismatch: goalMismatch(goal, gr, gi, circuit.z0), meets,
      });
      return;
    }
    for (const x of options[i]) { vals[i] = x; pick(i + 1, vals); }
  };
  pick(0, new Array(options.length));
  const score = (v: Variant): number => (goal.kind === 'point' ? v.mismatch : isWithin(goal) ? v.gamma : v.residual);
  out.sort((a, b) => {
    const d = score(a) - score(b);
    if (d) return d;
    for (let k = 0; k < a.values.length; k++) if (a.values[k] !== b.values[k]) return a.values[k] - b.values[k];
    return 0;
  });
  return out;
}
