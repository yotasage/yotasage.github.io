// The circuit of the Smith chart tool as one value (D2: the one source of truth) and its form in the link (step M3.1).
// A circuit is Z0, f0, the load R + jX and the parts counted from the load towards the source (engine.md §2), the
// `Circuit` of network.ts. This module gives the start state (D16, its values computed by the engine), the three value
// forms of every part (component, ohms or siemens at f0, normalised), checks of every value with a reason, and the
// query string: versioned, readable, exact to the last bit of every double, and read back without ever throwing.
// Framework-free; the page keeps the circuit in React state and writes the link with history.replaceState.

import { readAmount } from '../quantity';
import { GOAL_KINDS, goalProblem } from './goal';
import type { Goal, GoalKind } from './goal';
import { inputGamma } from './network';
import type { Circuit as Network } from './network';
import {
  added, ADDS, LINE, packParts, Part, PartKind, PART_KINDS, QUARTER, SERIES_C, SERIES_L, SERIES_R, SHUNT_C, SHUNT_L,
  SHUNT_R, STUB_OPEN, STUB_SHORT, valueFor,
} from './parts';
import type { Unknown } from './solve';

export type { Part, PartKind } from './parts';
export type { Goal } from './goal';
export type { Unknown } from './solve';

/**
 * What the solver is asked (step M4.3a): at most two unknowns and the goal. Part of the circuit, so the link, undo and
 * redo and every edit carry it; absent when nothing is marked and the goal is the default (the centre at the input).
 */
export interface Ask {
  /** In the order they were marked (the oldest first: a third mark replaces it). */
  unknowns: readonly Unknown[];
  goal: Goal;
}

/** network.ts's circuit (Z0, f0, the load, the parts from the load) with what the solver is asked. */
export interface Circuit extends Network {
  ask?: Ask;
}

// ---------------------------------------------------------------------------------------------------------------
// Kinds

/** The kinds' codes in the link, indexed by kind: series r l c, parallel (shunt) r l c, line, stubs, λ/4. */
export const KIND_CODES: readonly string[] = ['rs', 'ls', 'cs', 'rp', 'lp', 'cp', 'tl', 'so', 'ss', 'qw'];
/** The kinds' names on the page. */
export const KIND_NAMES: readonly string[] = [
  'Series R', 'Series L', 'Series C', 'Shunt R', 'Shunt L', 'Shunt C', 'Line', 'Open stub', 'Short stub', 'λ/4 transformer',
];
/** Short names for the strip's tiles. */
export const KIND_SHORT: readonly string[] = ['R', 'L', 'C', 'R', 'L', 'C', 'Line', 'Open', 'Short', 'λ/4'];
/** The order of the "add" list (lumped series, lumped shunt, lines). */
export const KIND_ORDER: readonly PartKind[] = [
  SERIES_L, SERIES_C, SERIES_R, SHUNT_L, SHUNT_C, SHUNT_R, LINE, STUB_OPEN, STUB_SHORT, QUARTER,
];
const hasZc = (kind: number): boolean => kind === LINE || kind === STUB_OPEN || kind === STUB_SHORT;

/** At most this many parts (a link with more keeps the first ones, nearest the load). */
export const MAX_PARTS = 24;

// ---------------------------------------------------------------------------------------------------------------
// Validity (engine.md §2 and the degenerate rule of notes-M1.2.md: what network.ts accepts)

const isNum = (v: unknown): v is number => typeof v === 'number' && v === v;

/** Why Z0 cannot be v, or '' when it can. */
export const z0Problem = (v: number): string => (isNum(v) && v > 0 && v < Infinity ? '' : 'Z0 must be a positive number of ohms');
/** Why f0 cannot be v, or ''. */
export const f0Problem = (v: number): string => (isNum(v) && v > 0 && v < Infinity ? '' : 'f0 must be a positive frequency');
/** Why the load's R cannot be v, or '' (∞ is the open). */
export const loadRProblem = (v: number): string => (isNum(v) && v >= 0 ? '' : 'R must be 0 or more (∞ is an open)');
/** Why the load's X cannot be v, or ''. */
export const loadXProblem = (v: number): string => (isNum(v) && Math.abs(v) < Infinity ? '' : 'X must be a finite number of ohms');

/** Why a part's main value cannot be v, or ''. 0 and ∞ are allowed where they are a short or an open. */
export function valueProblem(kind: number, v: number): string {
  if (!isNum(v)) return 'not a number';
  switch (kind) {
    case SERIES_R: case SHUNT_R: return v >= 0 ? '' : 'R must be 0 or more';
    case SERIES_L: case SHUNT_L: return v >= 0 ? '' : 'L must be 0 or more';
    case SERIES_C: case SHUNT_C: return v >= 0 ? '' : 'C must be 0 or more';
    case LINE: case STUB_OPEN: case STUB_SHORT:
      return v >= 0 && v < Infinity ? '' : 'the length must be 0 or more and finite';
    case QUARTER: return v > 0 && v < Infinity ? '' : 'Zt must be a positive number of ohms';
    default: return 'unknown part';
  }
}
/** Why a line's or stub's Zc cannot be v, or ''. */
export const zcProblem = (v: number): string => (isNum(v) && v > 0 && v < Infinity ? '' : 'Zc must be a positive number of ohms');

/** Why a part cannot be used, or ''. */
export function partProblem(p: Part): string {
  if (!p || !Number.isInteger(p.kind) || p.kind < 0 || p.kind >= PART_KINDS) return 'unknown part';
  return valueProblem(p.kind, p.value) || (hasZc(p.kind) ? zcProblem(p.zc) : '');
}

/** Why a circuit cannot be used, or '' (the harness checks every decoded circuit with it). */
export function circuitProblem(c: Circuit): string {
  const top = z0Problem(c.z0) || f0Problem(c.f0) || loadRProblem(c.loadR) || loadXProblem(c.loadX);
  if (top) return top;
  if (!Array.isArray(c.parts) || c.parts.length > MAX_PARTS) return 'parts';
  for (const p of c.parts) { const why = partProblem(p); if (why) return why; }
  return '';
}

// ---------------------------------------------------------------------------------------------------------------
// The start state (D16): Z0 = 50 Ω, load 25 + j25 Ω, f0 = 100 MHz, two parts that bring the load to the centre.
// z = 0.5 + j0.5: a series C adding x = −1 takes it to 0.5 − j0.5 on the g = 1 circle (y = 1 + j1), and a shunt L
// adding b = −1 takes it to the centre. The values are the engine's inverse of those steps (valueFor), not roundings.

export const DEFAULT_Z0 = 50;
export const DEFAULT_F0 = 100e6;
export const DEFAULT_LOAD_R = 25;
export const DEFAULT_LOAD_X = 25;

const DEFAULT_PARTS: readonly Part[] = [
  { kind: SERIES_C, value: valueFor(SERIES_C, -1, 0, DEFAULT_F0, DEFAULT_F0, DEFAULT_Z0) },
  { kind: SHUNT_L, value: valueFor(SHUNT_L, -1, 0, DEFAULT_F0, DEFAULT_F0, DEFAULT_Z0) },
];

/** A fresh copy of the start state. */
export function defaultCircuit(): Circuit {
  return { z0: DEFAULT_Z0, f0: DEFAULT_F0, loadR: DEFAULT_LOAD_R, loadX: DEFAULT_LOAD_X, parts: DEFAULT_PARTS.map((p) => ({ ...p })) };
}

/** A new part of a kind for a circuit: a lumped part adds 1 (normalised) with its kind's sign, a line or stub is 1/8 λ of Zc = Z0, a λ/4 transformer has Zt = Z0. */
export function newPart(kind: PartKind, c: Circuit): Part {
  switch (kind) {
    case LINE: case STUB_OPEN: case STUB_SHORT: return { kind, value: 0.125, zc: c.z0 };
    case QUARTER: return { kind, value: c.z0 };
    default: {
      const sign = kind === SERIES_C || kind === SHUNT_L ? -1 : 1;
      return { kind, value: valueFor(kind, sign, 0, c.f0, c.f0, c.z0) };
    }
  }
}

/**
 * The part the draw tool (M3.3b) appends at the source end before the pointer moves: of no effect where one exists
 * (R, L 0 in series, ∞ in shunt; C ∞ in series, 0 in shunt; a line or open stub of length 0, a short stub of λ/4), so
 * the new end starts on the input; a λ/4 transformer has none and starts at Zt = Z0.
 */
export function startPart(kind: PartKind, c: Circuit): Part {
  const p = newPart(kind, c);
  switch (kind) {
    case SERIES_R: case SERIES_L: case SHUNT_C: case LINE: case STUB_OPEN: p.value = 0; break;
    case SERIES_C: case SHUNT_R: case SHUNT_L: p.value = Infinity; break;
    case STUB_SHORT: p.value = 0.25; break;
  }
  return p;
}

/** A focused handle's arrow keys (M3.3b): line and stub lengths step by 1° (Shift 10°) of electrical length. */
export const KEY_DIV = 360;
export const KEY_DIV_COARSE = 36;
/** Without standard values, R, L, C and Zt step by these factors. */
export const KEY_FACTOR = 1.01;
export const KEY_FACTOR_COARSE = 1.1;

/**
 * The value a focused handle's arrow key gives part `kind` of value v: one step up or down (`coarse` with Shift).
 * Lengths go to the next multiple of 1° (10°) when `mantissas` is given (snapping on), else ±1° (10°), never below 0.
 * R, L, C and Zt go to the next standard value of `mantissas` (a decade of them when coarse; values from decimal text,
 * so 33 pF is 33e-12), else × or ÷ KEY_FACTOR(_COARSE); from 0 or ∞ the first step lands on newPart's value (±1
 * normalised, Zt = Z0).
 */
export function stepValue(kind: PartKind, v: number, up: boolean, coarse: boolean, mantissas: readonly number[] | null, c: Circuit): number {
  if (kind === LINE || kind === STUB_OPEN || kind === STUB_SHORT) {
    const div = coarse ? KEY_DIV_COARSE : KEY_DIV;
    let next: number;
    if (mantissas) {
      const q = v * div;
      next = (up ? Math.floor(q + 1e-9) + 1 : Math.ceil(q - 1e-9) - 1) / div;
    } else next = up ? v + 1 / div : v - 1 / div;
    return next > 0 ? next : 0;
  }
  if (!(v > 0 && v < Infinity)) return newPart(kind, c).value;
  if (!mantissas) {
    const f = coarse ? KEY_FACTOR_COARSE : KEY_FACTOR;
    return up ? v * f : v / f;
  }
  let x = v;
  for (let s = coarse ? mantissas.length : 1; s > 0; s--) x = nextStandard(x, up, mantissas);
  return x;
}

/** The standard value of `mantissas` (three digits, 100 to 999) next above (or below) x. */
function nextStandard(x: number, up: boolean, ms: readonly number[]): number {
  const dec = Math.floor(Math.log10(x)), last = ms.length - 1;
  if (up) {
    for (let d = dec - 1; d <= dec + 1; d++) for (let j = 0; j <= last; j++) { const s = Number(`${ms[j]}e${d - 2}`); if (s > x) return s; }
    return Number(`${ms[0]}e${dec}`);
  }
  for (let d = dec + 1; d >= dec - 1; d--) for (let j = last; j >= 0; j--) { const s = Number(`${ms[j]}e${d - 2}`); if (s < x) return s; }
  return Number(`${ms[last]}e${dec - 4}`);
}

// ---------------------------------------------------------------------------------------------------------------
// Edits (each returns a new circuit; the page's single commit point is where M3.3's undo hooks in)

// The ask's unknowns name parts by index and its goal a node, so edits that shift parts carry them along (M4.3a).

/** The circuit with its unknowns' parts renumbered by `part` (−1 drops one) and its goal's node by `node`. */
function remap(c: Circuit, parts: Part[], part: (i: number) => number, node: (k: number) => number): Circuit {
  const next: Circuit = { ...c, parts };
  if (!c.ask) return next;
  const unknowns: Unknown[] = [];
  for (const u of c.ask.unknowns) {
    if (u.param === 'f0') { unknowns.push(u); continue; }
    const i = part(u.part);
    if (i >= 0) unknowns.push(i === u.part ? u : { ...u, part: i });
  }
  const g = c.ask.goal;
  const goal = g.node === undefined ? g : { ...g, node: node(g.node) };
  return cleanAsk(next, { unknowns, goal });
}

export const withPart = (c: Circuit, index: number, part: Part): Circuit => {
  const next: Circuit = { ...c, parts: c.parts.map((p, i) => (i === index ? part : p)) };
  return c.ask && c.parts[index] && c.parts[index].kind !== part.kind ? cleanAsk(next, c.ask) : next;
};
export const insertPart = (c: Circuit, index: number, part: Part): Circuit =>
  remap(c, [...c.parts.slice(0, index), part, ...c.parts.slice(index)], (i) => (i >= index ? i + 1 : i), (k) => (k > index ? k + 1 : k));
export const removePart = (c: Circuit, index: number): Circuit =>
  remap(c, c.parts.filter((_, i) => i !== index), (i) => (i === index ? -1 : i > index ? i - 1 : i), (k) => (k > index ? k - 1 : k));
/** Moves part `from` to position `to` (both counted from the load); marked unknowns follow their parts. */
export function movePart(c: Circuit, from: number, to: number): Circuit {
  if (from === to || to < 0 || to >= c.parts.length) return c;
  const parts = c.parts.slice();
  const [p] = parts.splice(from, 1);
  parts.splice(to, 0, p);
  const lo = Math.min(from, to), hi = Math.max(from, to), step = from < to ? -1 : 1;
  return remap(c, parts, (i) => (i === from ? to : i >= lo && i <= hi ? i + step : i), (k) => k);
}

// ---------------------------------------------------------------------------------------------------------------
// What the solver is asked (M4.3a): unknowns and the goal

/** The default goal: the centre (Z0, the match) at the input. */
export const DEFAULT_GOAL: Goal = Object.freeze({ kind: 'point' }) as Goal;
const NO_ASK: Ask = Object.freeze({ unknowns: Object.freeze([]) as readonly Unknown[], goal: DEFAULT_GOAL }) as Ask;
/** At most this many unknowns at a time (solver.md: two). */
export const MAX_UNKNOWNS = 2;

/** The circuit's ask, or the empty one (nothing marked, the centre at the input). */
export const askOf = (c: Circuit): Ask => c.ask ?? NO_ASK;

const isLC = (kind: number): boolean => kind === SERIES_L || kind === SERIES_C || kind === SHUNT_L || kind === SHUNT_C;
const paramOf = (u: Unknown): string => u.param ?? 'value';
/** Whether two unknowns are the same parameter (a part's value, its Zc, or f0). */
export const sameUnknown = (a: Unknown, b: Unknown): boolean =>
  paramOf(a) === paramOf(b) && (paramOf(a) === 'f0' || a.part === b.part);

/** The goal without the fields its kind does not use, the node at the input left out; the default is DEFAULT_GOAL. */
function cleanGoal(g: Goal, count: number): Goal {
  const node = g.node !== undefined && Number.isInteger(g.node) && g.node >= 0 && g.node < count ? g.node : undefined;
  let goal: Goal;
  if (g.kind === 'point') {
    if (g.targetR === undefined && g.targetX === undefined) {
      if (node === undefined) return DEFAULT_GOAL;
      goal = { kind: 'point' };
    } else goal = { kind: 'point', targetR: (g.targetR ?? 0) || 0, targetX: g.targetR === Infinity ? 0 : (g.targetX ?? 0) || 0 };
  } else {
    goal = { kind: g.kind };
    // −0 is 0 (the link writes it as 0).
    if (g.value !== undefined) goal.value = g.value || 0;
    if (g.within && (g.kind === 'mag' || g.kind === 'vswr' || g.kind === 'rl')) goal.within = true;
  }
  if (node !== undefined) goal.node = node;
  return goal;
}

/**
 * The circuit with `ask` made tidy: unknowns that cannot exist for their part's kind dropped (Zc of a lumped part,
 * a part that is not there; "L or C" kept only on an L or C), repeats dropped, at most MAX_UNKNOWNS (the newest), the
 * goal's node at the input left out (it then follows the input when parts are added at the source end). With nothing
 * marked and the default goal there is no `ask`, so such a circuit equals one without it.
 */
export function cleanAsk(c: Circuit, ask: Ask | undefined): Circuit {
  const { ask: _, ...rest } = c;
  if (!ask) return rest;
  const n = c.parts.length, unknowns: Unknown[] = [];
  for (const u of ask.unknowns) {
    const param = paramOf(u);
    let v: Unknown;
    if (param === 'f0') v = { part: -1, param: 'f0' };
    else {
      if (!(Number.isInteger(u.part) && u.part >= 0 && u.part < n)) continue;
      const kind = c.parts[u.part].kind;
      if (param === 'zc') { if (!hasZc(kind)) continue; v = { part: u.part, param: 'zc' }; }
      else if (param === 'value') v = u.free && isLC(kind) ? { part: u.part, param: 'value', free: true } : { part: u.part, param: 'value' };
      else continue;
    }
    if (!unknowns.some((w) => sameUnknown(w, v))) unknowns.push(v);
  }
  if (unknowns.length > MAX_UNKNOWNS) unknowns.splice(0, unknowns.length - MAX_UNKNOWNS);
  const goal = cleanGoal(ask.goal ?? DEFAULT_GOAL, n);
  return unknowns.length === 0 && goal === DEFAULT_GOAL ? rest : { ...rest, ask: { unknowns, goal } };
}

/**
 * Marks an unknown, or unmarks it when it is marked. A third mark replaces the oldest (returned as `dropped`, for the
 * page to say so).
 */
export function toggleUnknown(c: Circuit, u: Unknown): { circuit: Circuit; dropped: Unknown | null } {
  const ask = askOf(c);
  const at = ask.unknowns.findIndex((w) => sameUnknown(w, u));
  if (at >= 0) return { circuit: cleanAsk(c, { ...ask, unknowns: ask.unknowns.filter((_, i) => i !== at) }), dropped: null };
  const unknowns = [...ask.unknowns, u];
  const dropped = unknowns.length > MAX_UNKNOWNS ? unknowns[0] : null;
  return { circuit: cleanAsk(c, { ...ask, unknowns }), dropped };
}

/** A marked L or C as "either L or C" (free: the sign of the answer picks) or as its own kind. */
export function withFree(c: Circuit, part: number, free: boolean): Circuit {
  const ask = askOf(c);
  return cleanAsk(c, { ...ask, unknowns: ask.unknowns.map((u) => (paramOf(u) === 'value' && u.part === part ? { ...u, free } : u)) });
}

export const withGoal = (c: Circuit, goal: Goal): Circuit => cleanAsk(c, { ...askOf(c), goal });

/** What an unknown is called on the page: "part 2's C", "part 3's Zc", "f0". */
export function unknownName(c: Circuit, u: Unknown): string {
  if (paramOf(u) === 'f0') return 'f0';
  const p = c.parts[u.part];
  const what = !p ? 'value' : paramOf(u) === 'zc' ? 'Zc' : u.free ? 'L or C' : VALUE_NAMES[p.kind];
  return `part ${u.part + 1}’s ${what}`;
}
/** A part's value by kind, in words. */
export const VALUE_NAMES: readonly string[] = ['R', 'L', 'C', 'R', 'L', 'C', 'length', 'length', 'length', 'Zt'];

function sameGoal(a: Goal, b: Goal): boolean {
  return a.kind === b.kind && a.node === b.node && Object.is(a.value, b.value) && Object.is(a.targetR, b.targetR)
    && Object.is(a.targetX, b.targetX) && !!a.within === !!b.within;
}
function sameAsk(a: Ask | undefined, b: Ask | undefined): boolean {
  if (a === b) return true;
  if (!a || !b || a.unknowns.length !== b.unknowns.length || !sameGoal(a.goal, b.goal)) return false;
  for (let i = 0; i < a.unknowns.length; i++) {
    const u = a.unknowns[i], v = b.unknowns[i];
    if (!sameUnknown(u, v) || !!u.free !== !!v.free) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------------------------------------------
// The three value forms (engine.md §2): component ↔ ohms or siemens at f0 (= normalised × Z0 or / Z0) ↔ normalised.
// Lines and stubs: length in λ and in degrees at f0 and Zc; stubs also their B and b; λ/4: Zt and zt.

export type FormId = 'R' | 'L' | 'C' | 'X' | 'G' | 'B' | 'n' | 'len' | 'deg' | 'zc' | 'zt';
export interface Form {
  id: FormId;
  /** Field label ("C", "X", "x", "Zc") and a hint ("at f0", "normalised"). */
  label: string;
  hint: string;
  /** Unit for readAmount and formatAmount ('' for numbers without one; 'λ' and '°' are read by readForm). */
  unit: string;
  /** Whether ∞ may be typed (an open). */
  infinite: boolean;
}

const F = (id: FormId, label: string, hint: string, unit: string, infinite = false): Form => ({ id, label, hint, unit, infinite });
const FORMS: readonly (readonly Form[])[] = [
  [F('R', 'R', '', 'Ω', true), F('n', 'r', 'normalised', '', true)],
  [F('L', 'L', '', 'H', true), F('X', 'X', 'at f0', 'Ω', true), F('n', 'x', 'normalised', '', true)],
  [F('C', 'C', '', 'F', true), F('X', 'X', 'at f0', 'Ω', true), F('n', 'x', 'normalised', '', true)],
  [F('R', 'R', '', 'Ω', true), F('G', 'G', '', 'S', true), F('n', 'g', 'normalised', '', true)],
  [F('L', 'L', '', 'H', true), F('B', 'B', 'at f0', 'S', true), F('n', 'b', 'normalised', '', true)],
  [F('C', 'C', '', 'F', true), F('B', 'B', 'at f0', 'S', true), F('n', 'b', 'normalised', '', true)],
  [F('len', 'ℓ', 'at f0', 'λ'), F('deg', 'θ', 'at f0', '°'), F('zc', 'Zc', '', 'Ω')],
  [F('len', 'ℓ', 'at f0', 'λ'), F('deg', 'θ', 'at f0', '°'), F('zc', 'Zc', '', 'Ω'), F('B', 'B', 'at f0', 'S', true), F('n', 'b', 'normalised', '', true)],
  [F('len', 'ℓ', 'at f0', 'λ'), F('deg', 'θ', 'at f0', '°'), F('zc', 'Zc', '', 'Ω'), F('B', 'B', 'at f0', 'S', true), F('n', 'b', 'normalised', '', true)],
  [F('zt', 'Zt', '', 'Ω'), F('n', 'zt', 'normalised', '')],
];

/** The value forms of a kind, in the order of its card. */
export const formsOf = (kind: number): readonly Form[] => FORMS[kind];

/** The value of a part in one of its forms, at f0. */
export function formValue(id: FormId, p: Part, c: Circuit): number {
  switch (id) {
    case 'R': case 'L': case 'C': case 'zt': return p.value;
    case 'len': return p.value;
    case 'deg': return p.value * 360;
    case 'zc': return p.zc;
    case 'X': return added(p.kind, p.value, p.zc, c.f0, c.f0, c.z0) * c.z0;
    case 'G': case 'B': return added(p.kind, p.value, p.zc, c.f0, c.f0, c.z0) / c.z0;
    case 'n': return added(p.kind, p.value, p.zc, c.f0, c.f0, c.z0);
    default: return NaN;
  }
}

// The sign an added quantity may take for a kind (series L adds x ≥ 0, series C x ≤ 0, shunt L b ≤ 0, …).
const SIGN_RULE: readonly string[] = [
  'r must be 0 or more', 'a series L adds x ≥ 0 (use a series C for x < 0)', 'a series C adds x ≤ 0 (use a series L for x > 0)',
  'g must be 0 or more', 'a shunt L adds b ≤ 0 (use a shunt C for b > 0)', 'a shunt C adds b ≥ 0 (use a shunt L for b < 0)',
];

/** The part with one form set to v, or the reason it cannot be. */
export function withForm(id: FormId, p: Part, v: number, c: Circuit): Part | string {
  if (v !== v) return 'not a number';
  const k = p.kind;
  let next: Part;
  switch (id) {
    case 'R': case 'L': case 'C': case 'zt': case 'len': next = { ...p, value: v }; break;
    case 'deg': next = { ...p, value: v / 360 }; break;
    case 'zc': {
      const why = zcProblem(v);
      if (why) return why;
      // Zc belongs to the line: its length stays, so what a stub adds changes with it.
      next = { ...p, zc: v };
      break;
    }
    case 'X': case 'G': case 'B': case 'n': {
      const a = id === 'X' ? v / c.z0 : id === 'n' ? v : v * c.z0;
      if (k <= SHUNT_C) {
        const positive = k === SERIES_R || k === SHUNT_R || k === SERIES_L || k === SHUNT_C;
        if (positive ? a < 0 : a > 0) return SIGN_RULE[k];
      }
      if (k === QUARTER && !(a > 0 && a < Infinity)) return 'zt must be positive';
      let value: number;
      if ((k === STUB_OPEN || k === STUB_SHORT) && Math.abs(a) === Infinity) value = k === STUB_OPEN ? 0.25 : 0;
      // x = 0 of a series C and b = 0 of a shunt L are C = ∞ and L = ∞ (−1/0 would be −∞).
      else if (a === 0 && (k === SERIES_C || k === SHUNT_L)) value = Infinity;
      else value = valueFor(k, a, p.zc, c.f0, c.f0, c.z0);
      next = { ...p, value: value === 0 ? 0 : value };
      break;
    }
    default: return 'unknown field';
  }
  return valueProblem(k, next.value) || next;
}

/** Reads a field's text in a form: the number with the form's unit (λ and ° may be typed after it), or null. */
export function readForm(form: Form, text: string): number | null {
  let t = String(text ?? '').trim();
  if (form.unit === 'λ' || form.unit === '°') {
    if (t.endsWith(form.unit)) t = t.slice(0, -1);
    return readAmount(t, '-', form.infinite);
  }
  // '' (normalised): no unit may be typed. readAmount takes '-' as a unit nobody types.
  return readAmount(t, form.unit || '-', form.infinite);
}

// ---------------------------------------------------------------------------------------------------------------
// The input of the circuit (what the readout calls "circuit input")

const packed = new Float64Array(MAX_PARTS * 3);
const gammaOut = new Float64Array(2);

/** Γ at the circuit's input at f (default f0) into out[o], out[o + 1]. */
export function circuitInputGamma(out: Float64Array | number[], o: number, c: Circuit, f = c.f0): void {
  packParts(c.parts, packed);
  inputGamma(gammaOut, 0, packed, c.parts.length, c.loadR, c.loadX, c.z0, f, c.f0);
  out[o] = gammaOut[0];
  out[o + 1] = gammaOut[1];
}

// ---------------------------------------------------------------------------------------------------------------
// The link
//
//   ?v=1&z0=50&f0=100e6&zl=25:25&p=cs:31.83098861837907e-12,lp:79.57747154594767e-9
//
// v the format's version; z0 in Ω; f0 in Hz; zl the load R:X in Ω (inf:0 is the open); p the parts from the load
// towards the source, separated by commas: kind code, then its values separated by colons (R, L, C in Ω, H, F; line
// and stubs length in wavelengths at f0 and Zc in Ω; λ/4 Zt in Ω). Numbers are JavaScript's shortest exact digits
// written in engineering form (100e6, 31.83…e-12, 0.125), so every double comes back to the bit; ∞ is "inf".
// Every character is one a query may hold unescaped (RFC 3986), so the link stays readable.

// From M4.3a two optional parameters say what the solver is asked (version 1 still: a link without them reads as
// before, and they are written only when something is marked or the goal is not the default):
// u the unknowns, comma-separated, oldest first: "f0", or a part's number from the load (1 = nearest the load) for its
//   value, with "zc" for its Zc or "lc" for an L or C that may be either ("u=1,2lc", "u=3zc,f0");
// g the goal: a kind (pt, mag, vswr, rl, r, g, x, b), then its numbers after colons (pt: R:X in Ω; the circles: their
//   figure), ":within" for |Γ| ≤ m, VSWR ≤ s, RL ≥ dB, and "@k" for node k (0 the load) when it is not the input
//   ("g=vswr:1.5:within", "g=pt:25:10@1", "g=x:0").

// vl the value lists of D17 (M4.3b; values.ts choiceToText: "vl=L12,Co1e-12_2.2e-12"), only when not the defaults. Not part
//   of the circuit (no undo step): decodeCircuit hands its text back as `lists`, the page reads it with choiceFromText.

export const LINK_VERSION = 1;
const PARAMS = ['v', 'z0', 'f0', 'zl', 'p', 'u', 'g', 'vl'];
/** The link's parameter of the value lists (M4.3b). */
export const LISTS_PARAM = 'vl';
const GOAL_CODE = (k: GoalKind): string => (k === 'point' ? 'pt' : k);

/** A double as the shortest digits that read back to it, in engineering form: "100e6", "0.125", "31.83098861837907e-12", "inf". */
export function numText(v: number): string {
  if (v !== v) return 'nan';
  if (v === Infinity) return 'inf';
  if (v === -Infinity) return '-inf';
  if (v === 0) return '0';
  const sign = v < 0 ? '-' : '';
  const s = String(Math.abs(v));
  const e = s.indexOf('e');
  let mant = e < 0 ? s : s.slice(0, e);
  let ex = e < 0 ? 0 : Number(s.slice(e + 1));
  const dot = mant.indexOf('.');
  if (dot >= 0) { ex -= mant.length - dot - 1; mant = mant.slice(0, dot) + mant.slice(dot + 1); }
  let a = 0;
  while (a < mant.length - 1 && mant.charCodeAt(a) === 48) a++;
  let b = mant.length;
  while (b > a + 1 && mant.charCodeAt(b - 1) === 48) b--;
  ex += mant.length - b;
  mant = mant.slice(a, b);
  // value = mant × 10^ex
  const n = mant.length, lead = ex + n - 1;
  if (lead >= -3 && lead < 6) {
    if (ex >= 0) return sign + mant + '0'.repeat(ex);
    const point = n + ex;
    return sign + (point > 0 ? `${mant.slice(0, point)}.${mant.slice(point)}` : `0.${'0'.repeat(-point)}${mant}`);
  }
  const E = 3 * Math.floor(lead / 3), whole = lead - E + 1;
  const m = n <= whole ? mant + '0'.repeat(whole - n) : `${mant.slice(0, whole)}.${mant.slice(whole)}`;
  return `${sign}${m}e${E}`;
}

const NUMBER = /^-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+ ]?\d+)?$/;

/** A number from the link: numText's form, or anything readAmount reads ("100M", "4n7"); ∞ as inf. null if neither. */
export function readNum(text: string): number | null {
  const t = text.trim();
  if (t === 'inf' || t === '∞') return Infinity;
  if (t === '-inf') return -Infinity;
  if (NUMBER.test(t)) {
    const v = Number(t.replace(' ', '+'));
    return Number.isFinite(v) ? v : null;
  }
  return readAmount(t, undefined, true);
}

/** The query string of a circuit, without the "?". */
export function encodeCircuit(c: Circuit): string {
  let p = '';
  for (let i = 0; i < c.parts.length; i++) {
    const part = c.parts[i];
    p += `${i ? ',' : ''}${KIND_CODES[part.kind]}:${numText(part.value)}${hasZc(part.kind) ? `:${numText(part.zc)}` : ''}`;
  }
  return `v=${LINK_VERSION}&z0=${numText(c.z0)}&f0=${numText(c.f0)}&zl=${numText(c.loadR)}:${numText(c.loadX)}&p=${p}${c.ask ? askText(c.ask) : ''}`;
}

/** The u and g parameters of an ask ("&u=1,2&g=vswr:1.5:within"), each only when it is not the default. */
function askText(ask: Ask): string {
  let s = '';
  if (ask.unknowns.length) {
    s += `&u=${ask.unknowns.map((u) => (paramOf(u) === 'f0' ? 'f0' : `${u.part + 1}${paramOf(u) === 'zc' ? 'zc' : u.free ? 'lc' : ''}`)).join(',')}`;
  }
  const g = ask.goal;
  if (g !== DEFAULT_GOAL && !(g.kind === 'point' && g.targetR === undefined && g.node === undefined)) {
    s += `&g=${GOAL_CODE(g.kind)}`;
    if (g.kind === 'point') { if (g.targetR !== undefined) s += `:${numText(g.targetR)}:${numText(g.targetX ?? 0)}`; }
    else if (g.value !== undefined) s += `:${numText(g.value)}`;
    if (g.within) s += ':within';
    if (g.node !== undefined) s += `@${g.node}`;
  }
  return s;
}

const UNKNOWN_TOKEN = /^(?:(f0)|(\d{1,3})(zc|lc)?)$/;

/** Reads u and g into the circuit (after its parts), with an issue for everything left out. */
function readAsk(c: Circuit, u: string | null, g: string | null, issues: string[]): Circuit {
  if (u === null && g === null) return c;
  const n = c.parts.length, unknowns: Unknown[] = [];
  if (u !== null && u !== '') {
    for (const token of u.split(',')) {
      const m = UNKNOWN_TOKEN.exec(token.trim().toLowerCase());
      let why = '';
      let v: Unknown | null = null;
      if (!m) why = 'not an unknown (a part number, with zc or lc, or f0)';
      else if (m[1]) v = { part: -1, param: 'f0' };
      else {
        const i = Number(m[2]) - 1;
        if (i < 0 || i >= n) why = `there is no part ${i + 1}`;
        else if (m[3] === 'zc' && !hasZc(c.parts[i].kind)) why = `part ${i + 1} has no Zc`;
        else if (m[3] === 'lc' && !isLC(c.parts[i].kind)) why = `part ${i + 1} is not an L or C`;
        else v = m[3] === 'zc' ? { part: i, param: 'zc' } : m[3] === 'lc' ? { part: i, param: 'value', free: true } : { part: i, param: 'value' };
      }
      if (v && unknowns.some((w) => sameUnknown(w, v))) why = 'marked twice';
      else if (v && unknowns.length === MAX_UNKNOWNS) why = `more than ${MAX_UNKNOWNS} unknowns`;
      if (why) issues.push(`u ${quote(token)}: ${why}; left out`);
      else unknowns.push(v);
    }
  }
  let goal: Goal = DEFAULT_GOAL;
  if (g !== null && g !== '') {
    const read = readGoal(g, n);
    if (typeof read === 'string') issues.push(`g ${quote(g)}: ${read}; the goal is the centre at the input`);
    else goal = read;
  }
  return cleanAsk(c, { unknowns, goal });
}

/** A goal from its link text, or why it cannot be read. */
function readGoal(text: string, count: number): Goal | string {
  const at = text.indexOf('@');
  const main = at < 0 ? text : text.slice(0, at);
  let node: number | undefined;
  if (at >= 0) {
    const k = Number(text.slice(at + 1));
    if (!(Number.isInteger(k) && k >= 0 && k <= count)) return `the node must be 0 (the load) to ${count} (the input)`;
    if (k < count) node = k;
  }
  const bits = main.split(':');
  const code = bits[0].trim().toLowerCase();
  const kind = (code === 'pt' ? 'point' : code) as GoalKind;
  if (!GOAL_KINDS.includes(kind)) return 'unknown kind of goal';
  let within = false;
  if (bits.length > 1 && bits[bits.length - 1].trim().toLowerCase() === 'within') {
    if (kind !== 'mag' && kind !== 'vswr' && kind !== 'rl') return 'only |Γ|, VSWR and return loss take “within”';
    within = true;
    bits.pop();
  }
  const nums: number[] = [];
  for (let i = 1; i < bits.length; i++) {
    const v = readNum(bits[i]);
    if (v === null) return `${quote(bits[i])} is not a number`;
    nums.push(v);
  }
  const goal: Goal = { kind };
  if (kind === 'point') {
    if (nums.length !== 0 && nums.length !== 2) return 'a point wants R:X in ohms';
    if (nums.length) { goal.targetR = nums[0]; goal.targetX = nums[0] === Infinity ? 0 : nums[1]; }
  } else {
    if (nums.length > 1) return 'a circle wants one number';
    if (nums.length) goal.value = nums[0];
  }
  if (within) goal.within = true;
  if (node !== undefined) goal.node = node;
  return goalProblem(goal, count) ?? goal;
}

export interface Decoded {
  circuit: Circuit;
  /** What was wrong with the link and what was used instead; empty when it was read as written. */
  issues: string[];
  /** Whether the link held any of the circuit's parameters (else it is the start state). */
  linked: boolean;
  /** The text of the value lists (vl), null when the link has none; not a circuit parameter (`linked` ignores it). */
  lists: string | null;
}

const quote = (s: string): string => `“${s.length > 40 ? `${s.slice(0, 40)}…` : s}”`;

/**
 * The circuit of a query string (with or without "?"). Never throws: a parameter that cannot be read takes its start
 * value, a part that cannot be read is left out, and each says why in `issues`. A parameter that is missing takes
 * its start value without an issue (a hand-made `?zl=100:0` keeps the start state's other values and parts).
 */
export function decodeCircuit(search: string): Decoded {
  const issues: string[] = [];
  const c = defaultCircuit();
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(String(search ?? ''));
  } catch {
    return { circuit: c, issues: ['the link could not be read; the start circuit is shown'], linked: false, lists: null };
  }
  let linked = false;
  for (const key of new Set(params.keys())) {
    if (!PARAMS.includes(key)) issues.push(`unknown parameter ${quote(key)} left out`);
    else if (params.getAll(key).length > 1) issues.push(`${key} is given more than once; the first is used`);
  }
  const get = (key: string): string | null => {
    const v = params.get(key);
    if (v !== null) linked = true;
    return v;
  };

  const version = get('v');
  if (version !== null && version !== String(LINK_VERSION)) {
    const n = Number(version);
    issues.push(Number.isInteger(n) && n > LINK_VERSION
      ? `the link is of a newer version (${quote(version)}); read as version ${LINK_VERSION}`
      : `unknown version ${quote(version)}; read as version ${LINK_VERSION}`);
  }

  const scalar = (key: string, problem: (v: number) => string, apply: (v: number) => void): void => {
    const text = get(key);
    if (text === null) return;
    const v = readNum(text);
    const why = v === null ? 'not a number' : problem(v);
    if (why) issues.push(`${key} ${quote(text)}: ${why}; the start value is used`);
    else apply(v);
  };
  scalar('z0', z0Problem, (v) => { c.z0 = v; });
  scalar('f0', f0Problem, (v) => { c.f0 = v; });

  const zl = get('zl');
  if (zl !== null) {
    const bits = zl.split(':');
    const r = readNum(bits[0] ?? ''), x = bits.length > 1 ? readNum(bits[1]) : 0;
    const why = bits.length > 2 ? 'R:X has more than two numbers'
      : r === null ? 'R is not a number' : x === null ? 'X is not a number' : loadRProblem(r) || loadXProblem(x);
    if (why) issues.push(`zl ${quote(zl)}: ${why}; the start load is used`);
    else { c.loadR = r; c.loadX = r === Infinity ? 0 : x; }
  }

  const list = get('p');
  if (list !== null) {
    c.parts = [];
    const tokens = list === '' ? [] : list.split(',');
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      if (c.parts.length === MAX_PARTS) {
        issues.push(`more than ${MAX_PARTS} parts; the ${tokens.length - i} nearest the source are left out`);
        break;
      }
      const bits = token.split(':');
      const kind = KIND_CODES.indexOf(bits[0].trim().toLowerCase()) as PartKind;
      let why = '';
      let part: Part | null = null;
      if (kind < 0) why = 'unknown kind';
      else if (bits.length !== (hasZc(kind) ? 3 : 2)) why = hasZc(kind) ? 'wants kind:length:Zc' : 'wants kind:value';
      else {
        const value = readNum(bits[1]), zc = hasZc(kind) ? readNum(bits[2]) : undefined;
        if (value === null || zc === null) why = 'not a number';
        else {
          part = hasZc(kind) ? { kind, value, zc } : { kind, value };
          why = partProblem(part);
        }
      }
      if (why) issues.push(`part ${i + 1} ${quote(token)}: ${why}; left out`);
      else c.parts.push(part);
    }
  }
  return { circuit: readAsk(c, get('u'), get('g'), issues), issues, linked, lists: params.get(LISTS_PARAM) };
}

/** Whether two circuits are the same to the bit, what the solver is asked included (the page's "changed" test). */
export const sameCircuit = (a: Circuit, b: Circuit): boolean => sameNetwork(a, b) && sameAsk(a.ask, b.ask);

/** Whether two circuits are the same to the bit, leaving out what the solver is asked (what the chart and theory show). */
export function sameNetwork(a: Circuit, b: Circuit): boolean {
  if (!Object.is(a.z0, b.z0) || !Object.is(a.f0, b.f0) || !Object.is(a.loadR, b.loadR) || !Object.is(a.loadX, b.loadX)) return false;
  if (a.parts.length !== b.parts.length) return false;
  for (let i = 0; i < a.parts.length; i++) {
    const p = a.parts[i], q = b.parts[i];
    if (p.kind !== q.kind || !Object.is(p.value, q.value) || (hasZc(p.kind) && !Object.is(p.zc, q.zc))) return false;
  }
  return true;
}

/** What a kind adds ('r', 'x', 'g', 'b', 'turns', 'zt'), re-exported for the strip. */
export const addsOf = (kind: number): string => ADDS[kind];
