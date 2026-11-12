// The circuit of the Smith chart tool as one value (D2: the one source of truth) and its form in the link (step M3.1).
// A circuit is Z0, f0, the load R + jX and the parts counted from the load towards the source (engine.md §2), the
// `Circuit` of network.ts. This module gives the start state (D16, its values computed by the engine), the three value
// forms of every part (component, ohms or siemens at f0, normalised), checks of every value with a reason, and the
// query string: versioned, readable, exact to the last bit of every double, and read back without ever throwing.
// Framework-free; the page keeps the circuit in React state and writes the link with history.replaceState.

import { readAmount } from '../quantity';
import { inputGamma } from './network';
import type { Circuit } from './network';
import {
  added, ADDS, LINE, packParts, Part, PartKind, PART_KINDS, QUARTER, SERIES_C, SERIES_L, SERIES_R, SHUNT_C, SHUNT_L,
  SHUNT_R, STUB_OPEN, STUB_SHORT, valueFor,
} from './parts';

export type { Circuit } from './network';
export type { Part, PartKind } from './parts';

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

// ---------------------------------------------------------------------------------------------------------------
// Edits (each returns a new circuit; the page's single commit point is where M3.3's undo hooks in)

export const withPart = (c: Circuit, index: number, part: Part): Circuit =>
  ({ ...c, parts: c.parts.map((p, i) => (i === index ? part : p)) });
export const insertPart = (c: Circuit, index: number, part: Part): Circuit =>
  ({ ...c, parts: [...c.parts.slice(0, index), part, ...c.parts.slice(index)] });
export const removePart = (c: Circuit, index: number): Circuit => ({ ...c, parts: c.parts.filter((_, i) => i !== index) });
/** Moves part `from` to position `to` (both counted from the load). */
export function movePart(c: Circuit, from: number, to: number): Circuit {
  if (from === to || to < 0 || to >= c.parts.length) return c;
  const parts = c.parts.slice();
  const [p] = parts.splice(from, 1);
  parts.splice(to, 0, p);
  return { ...c, parts };
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

export const LINK_VERSION = 1;
const PARAMS = ['v', 'z0', 'f0', 'zl', 'p'];

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
  return `v=${LINK_VERSION}&z0=${numText(c.z0)}&f0=${numText(c.f0)}&zl=${numText(c.loadR)}:${numText(c.loadX)}&p=${p}`;
}

export interface Decoded {
  circuit: Circuit;
  /** What was wrong with the link and what was used instead; empty when it was read as written. */
  issues: string[];
  /** Whether the link held any of the circuit's parameters (else it is the start state). */
  linked: boolean;
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
    return { circuit: c, issues: ['the link could not be read; the start circuit is shown'], linked: false };
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
  return { circuit: c, issues, linked };
}

/** Whether two circuits are the same to the bit (the harness's round trip and the page's "changed" test). */
export function sameCircuit(a: Circuit, b: Circuit): boolean {
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
