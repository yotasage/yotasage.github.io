// The challenges of the Smith chart tool's Learn section (step M6.2; docs/smith-chart/examples-challenges.md §1): a
// kind and a seed make one problem on every machine. The generator draws from mulberry32 seeded with the seed, in the
// order of §1's table and nothing else; an attempt draws every number of its kind, then tests them (the load's |Γ|
// bound, then the solver: every problem is solvable before it is offered), and a failed attempt is followed by the
// next numbers of the same stream. Also: whether a circuit reaches the challenge (with the reason it does not), the
// hint ladder from the solver's construction, and the reveal (the solver's solutions, for `e24` with E24 variants).
// Framework-free.

import { formatAmount } from '../quantity';
import { explainPart } from './explain';
import type { Goal } from './goal';
import { CHALLENGE_KINDS, challengeText, readChallenge } from './lesson';
import type { ChallengeKind } from './lesson';
import {
  LINE, QUARTER, SERIES_C, SERIES_L, SHUNT_C, SHUNT_L, STUB_OPEN, STUB_SHORT, isSeries, isShunt,
} from './parts';
import type { Part, PartKind } from './parts';
import { solve } from './solve';
import type { Solution, SolveResult, Unknown } from './solve';
import type { Circuit } from './state';
import { goalHolds } from './suggest';
import { around, defaultChoice, standardVariants } from './values';
import type { Variant } from './values';

export { CHALLENGE_KINDS, challengeText, readChallenge };
export type { ChallengeKind };

/** The kinds' titles on the page (§1). */
export const CHALLENGE_TITLES: Readonly<Record<ChallengeKind, string>> = {
  two: 'Two parts to the centre', stub: 'One stub', qw: 'A λ/4 transformer', e24: 'Standard values only', read: 'Read this point',
};

export type ReadAsk = 'z' | 'y' | 'mag' | 'vswr' | 'rl';

/** One way to the goal: the finished circuit and the solver's solution; for `e24` the E24 variants that meet the goal. */
export interface Revealed {
  circuit: Circuit;
  solution: Solution;
  standard?: { circuit: Circuit; variant: Variant }[];
}

export interface Challenge {
  kind: ChallengeKind;
  seed: number;
  /** The problem: Z0 = 50 Ω, f0, the load, no parts. */
  circuit: Circuit;
  allowed: readonly PartKind[];
  maxParts: number;
  /** Lines and stubs must have Zc = Z0 (within 1e-9 relative). */
  zcIsZ0: boolean;
  /** Every L and C must be an E24 value. */
  e24: boolean;
  /** At the input: |Γ| ≤ 0.05 (e24: the drawn 0.1 or 0.2); `read`: the centre (unused). */
  goal: Goal;
  /** `read`: what is asked about the point z = r + jx (the load). */
  read?: { ask: ReadAsk; r: number; x: number };
  /** `qw`: whether the load is complex (a line first). */
  complex?: boolean;
  /** The solver's realisable solutions within the bounds (empty for `read`), from the test before it was offered. */
  revealed: Revealed[];
  /** How many attempts the seed's stream took (1 when the first drawn problem passed). */
  draws: number;
}

// ---------------------------------------------------------------------------------------------------------------
// The generator

/** mulberry32 (public domain): a uniform number in [0, 1) per call. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const Z0 = 50;
const F_STUB = 100e6;
/** Realisable values: L 0.1 nH – 10 µH, C 0.1 pF – 10 nF, Zt 15–150 Ω. */
export const L_RANGE: readonly [number, number] = [0.1e-9, 10e-6];
export const C_RANGE: readonly [number, number] = [0.1e-12, 10e-9];
export const ZT_RANGE: readonly [number, number] = [15, 150];
/** The goal of every kind but `e24`: |Γ_in| ≤ 0.05. */
export const MATCH: Goal = Object.freeze({ kind: 'mag', value: 0.05, within: true }) as Goal;
const CENTRE: Goal = Object.freeze({ kind: 'point' }) as Goal;
const LUMPED: readonly PartKind[] = [SERIES_L, SERIES_C, SHUNT_L, SHUNT_C];
export const READ_R: readonly number[] = [0.2, 0.5, 1, 2, 5];
export const READ_X: readonly number[] = [-5, -2, -1, -0.5, -0.2, 0, 0.2, 0.5, 1, 2, 5];
export const READ_ASKS: readonly ReadAsk[] = ['z', 'y', 'mag', 'vswr', 'rl'];
/** After this many failed attempts (never seen: 4 at most in 1,000 seeds per kind) a fixed problem of the kind is used. */
const MAX_DRAWS = 4096;

const whole = (u: number, lo: number, hi: number): number => lo + Math.floor(u * (hi - lo + 1));
const pick = <T>(u: number, list: readonly T[]): T => list[Math.floor(u * list.length)];
const loadMag = (R: number, X: number): number => Math.hypot(R - Z0, X) / Math.hypot(R + Z0, X);

const isLC = (k: number): boolean => k === SERIES_L || k === SERIES_C || k === SHUNT_L || k === SHUNT_C;
const isL = (k: number): boolean => k === SERIES_L || k === SHUNT_L;

/** Whether a solved value of a kind lies in the realisable bounds. */
function inBounds(kind: number, v: number): boolean {
  if (isLC(kind)) { const [lo, hi] = isL(kind) ? L_RANGE : C_RANGE; return v >= lo && v <= hi; }
  if (kind === QUARTER) return v >= ZT_RANGE[0] && v <= ZT_RANGE[1];
  return v >= 0 && v < Infinity;
}

/** The circuit with a solution's values (and kinds) in its parts. */
export function applySolution(c: Circuit, s: Solution): Circuit {
  const parts = c.parts.map((p) => ({ ...p }));
  for (const v of s.values) {
    if (v.param === 'value') parts[v.part] = v.kind === LINE || v.kind === STUB_OPEN || v.kind === STUB_SHORT
      ? { kind: v.kind, value: v.value, zc: parts[v.part].zc } : { kind: v.kind as PartKind, value: v.value };
  }
  return { z0: c.z0, f0: c.f0, loadR: c.loadR, loadX: c.loadX, parts };
}

const blank = (f0: number, R: number, X: number): Circuit => ({ z0: Z0, f0, loadR: R, loadX: X, parts: [] });
const withParts = (c: Circuit, parts: Part[]): Circuit => ({ z0: c.z0, f0: c.f0, loadR: c.loadR, loadX: c.loadX, parts });
const part = (kind: PartKind, value: number, c: Circuit): Part =>
  kind === LINE || kind === STUB_OPEN || kind === STUB_SHORT ? { kind, value, zc: c.z0 } : { kind, value };
/** A placeholder value of a kind (the solver's start; the unknowns replace it). */
const placeholder = (kind: PartKind, c: Circuit): number =>
  kind === LINE || kind === STUB_OPEN || kind === STUB_SHORT ? 0.125 : kind === QUARTER ? c.z0
    : isL(kind) ? c.z0 / (2 * Math.PI * c.f0) : 1 / (2 * Math.PI * c.f0 * c.z0);

/** Every part an unknown value; lumped ones free (L or C by the sign). */
const unknownsOf = (t: Circuit): Unknown[] => t.parts.map((p, i) => (isLC(p.kind) ? { part: i, param: 'value', free: true } : { part: i, param: 'value' }));

/** The solver on a template; its realisable solutions within the bounds as finished circuits. */
function solveTemplate(t: Circuit): { result: SolveResult; found: Revealed[] } {
  const result = solve(t, unknownsOf(t), CENTRE);
  const found: Revealed[] = [];
  if (result.status === 'solved') {
    for (const s of result.solutions) {
      if (s.realisable && s.values.every((v) => inBounds(v.kind, v.value))) found.push({ circuit: applySolution(t, s), solution: s });
    }
  }
  return { result, found };
}

/** The templates (kinds from the load) the generator tests and the hints fall back on, in order. */
function templatesOf(ch: { kind: ChallengeKind; circuit: Circuit; allowed: readonly PartKind[]; complex?: boolean }): PartKind[][] {
  switch (ch.kind) {
    case 'two': case 'e24': return [[SERIES_L, SHUNT_C], [SHUNT_C, SERIES_L]];
    case 'stub': return [[LINE, ch.allowed[1]]];
    case 'qw': return ch.complex ? [[LINE, QUARTER]] : [[QUARTER]];
    default: return [];
  }
}

const template = (c: Circuit, kinds: readonly PartKind[]): Circuit => withParts(c, kinds.map((k) => part(k, placeholder(k, c), c)));

/** The E24 variants of a solution that meet the goal with values in the bounds. */
function e24Variants(t: Circuit, goal: Goal, r: Revealed): { circuit: Circuit; variant: Variant }[] {
  const out: { circuit: Circuit; variant: Variant }[] = [];
  for (const v of standardVariants(t, goal, r.solution, defaultChoice())) {
    if (!v.meets) continue;
    const s: Solution = { ...r.solution, values: r.solution.values.map((sv, i) => ({ ...sv, value: v.values[i] })) };
    if (!s.values.every((sv) => inBounds(sv.kind, sv.value))) continue;
    out.push({ circuit: applySolution(t, s), variant: v });
  }
  return out;
}

/** The test before a problem is offered: its revealed solutions, or null when it fails. */
function tested(ch: Challenge): Revealed[] | null {
  if (ch.kind === 'read') return [];
  const out: Revealed[] = [];
  for (const kinds of templatesOf(ch)) {
    const t = template(ch.circuit, kinds);
    for (const r of solveTemplate(t).found) {
      if (ch.e24) { r.standard = e24Variants(t, ch.goal, r); if (!r.standard.length) continue; }
      out.push(r);
    }
  }
  return out.length ? out : null;
}

/** One attempt's draws, in §1's order. */
function drawn(kind: ChallengeKind, seed: number, u: () => number): Challenge {
  const ch: Challenge = {
    kind, seed, circuit: blank(F_STUB, 0, 0), allowed: LUMPED, maxParts: 2, zcIsZ0: false, e24: false, goal: MATCH, revealed: [], draws: 0,
  };
  switch (kind) {
    case 'two': case 'e24': {
      const f0 = Number((10 ** (7 + u() * Math.log10(300))).toPrecision(3));
      const R = whole(u(), 5, 250), X = whole(u(), -150, 150);
      ch.circuit = blank(f0, R, X);
      if (kind === 'e24') { ch.e24 = true; ch.goal = { kind: 'mag', value: u() < 0.5 ? 0.1 : 0.2, within: true }; }
      break;
    }
    case 'stub': {
      const stub = u() < 0.5 ? STUB_OPEN : STUB_SHORT;
      const R = whole(u(), 10, 250), X = whole(u(), -150, 150);
      ch.circuit = blank(F_STUB, R, X);
      ch.allowed = [LINE, stub];
      ch.zcIsZ0 = true;
      break;
    }
    case 'qw': {
      const complex = u() < 0.5;
      const R = complex ? whole(u(), 10, 200) : whole(u(), 10, 500), X = complex ? whole(u(), -150, 150) : 0;
      ch.circuit = blank(F_STUB, R, X);
      ch.complex = complex;
      ch.allowed = complex ? [LINE, QUARTER] : [QUARTER];
      ch.maxParts = complex ? 2 : 1;
      ch.zcIsZ0 = true;
      break;
    }
    case 'read': {
      const r = pick(u(), READ_R), x = pick(u(), READ_X), ask = pick(u(), READ_ASKS);
      ch.circuit = blank(F_STUB, Z0 * r, Z0 * x);
      ch.allowed = [];
      ch.maxParts = 0;
      ch.goal = CENTRE;
      ch.read = { ask, r, x };
      break;
    }
  }
  return ch;
}

/** Whether an attempt's load passes its kind's bound. */
function loadPasses(ch: Challenge): boolean {
  const m = loadMag(ch.circuit.loadR, ch.circuit.loadX);
  switch (ch.kind) {
    case 'read': return m <= 0.9 && !(ch.read.r === 1 && ch.read.x === 0);
    case 'qw': return m >= (ch.complex ? 0.3 : 0.2);
    default: return m >= 0.3;
  }
}

/** A fixed problem of each kind, for a stream that never passes (none seen). */
function fallback(kind: ChallengeKind, seed: number): Challenge {
  const ch = drawn(kind, seed, () => 0.25);
  switch (kind) {
    case 'two': case 'e24': ch.circuit = blank(100e6, 25, 0); break;
    case 'stub': ch.circuit = blank(F_STUB, 100, 0); break;
    case 'qw': ch.circuit = blank(F_STUB, 100, 0); ch.complex = false; ch.allowed = [QUARTER]; ch.maxParts = 1; break;
    case 'read': ch.circuit = blank(F_STUB, 25, 25); ch.read = { ask: 'z', r: 0.5, x: 0.5 }; break;
  }
  return ch;
}

/** The problem of a kind and seed (§1): the same on every machine. */
export function makeChallenge(kind: ChallengeKind, seed: number): Challenge {
  const s = seed >>> 0, u = mulberry32(s);
  for (let draws = 1; draws <= MAX_DRAWS; draws++) {
    const ch = drawn(kind, s, u);
    if (!loadPasses(ch)) continue;
    const found = tested(ch);
    if (!found) continue;
    ch.revealed = found;
    ch.draws = draws;
    return ch;
  }
  const ch = fallback(kind, s);
  ch.revealed = tested(ch) ?? [];
  ch.draws = MAX_DRAWS + 1;
  return ch;
}

/** The challenge of a link's `ch` text, or why there is none. */
export function challengeOf(text: string): Challenge | string {
  const read = readChallenge(text);
  return typeof read === 'string' ? read : makeChallenge(read.kind, read.seed);
}

// ---------------------------------------------------------------------------------------------------------------
// The task, the answer of `read` and the check

const KIND_WORDS: readonly string[] = ['series R', 'series L', 'series C', 'shunt R', 'shunt L', 'shunt C', 'line', 'open stub', 'short stub', 'λ/4 transformer'];
const ASK_WORDS: Readonly<Record<ReadAsk, string>> = {
  z: 'z = r + jx (two numbers: r, then x)', y: 'y = g + jb (two numbers: g, then b)', mag: '|Γ|', vswr: 'the VSWR', rl: 'the return loss in dB',
};

/** The task in one sentence, for the page. */
export function challengeTask(ch: Challenge): string {
  if (ch.kind === 'read') return `Read ${ASK_WORDS[ch.read.ask]} of the load from the chart.`;
  const goal = `|Γ| ≤ ${ch.goal.value}`;
  switch (ch.kind) {
    case 'two': return `Bring the input to ${goal} with at most two parts: series or shunt L and C.`;
    case 'e24': return `Bring the input to ${goal} with at most two series or shunt L and C, every one an E24 value.`;
    case 'stub': return `Bring the input to ${goal} with a line and one ${KIND_WORDS[ch.allowed[1]]}, both of Zc = Z0.`;
    case 'qw': return ch.complex
      ? `Bring the input to ${goal} with a line of Zc = Z0 and a λ/4 transformer.`
      : `Bring the input to ${goal} with one λ/4 transformer.`;
  }
}

/** Γ of a normalised z = r + jx. */
function gammaOfZ(r: number, x: number): [number, number] {
  const dr = r + 1, den = dr * dr + x * x;
  return [((r - 1) * dr + x * x) / den, (x * dr - (r - 1) * x) / den];
}

/** The exact answer of a `read` challenge: [r, x], [g, b], [|Γ|], [VSWR] or [RL in dB]. */
export function readAnswer(ch: Challenge): number[] {
  const { ask, r, x } = ch.read;
  const [gr, gi] = gammaOfZ(r, x), m = Math.hypot(gr, gi);
  switch (ask) {
    case 'z': return [r, x];
    case 'y': { const d = r * r + x * x; return [r / d, -x / d]; }
    case 'mag': return [m];
    case 'vswr': return [(1 + m) / (1 - m)];
    case 'rl': return [-20 * Math.log10(m)];
  }
}

/** The tolerances of `read` (§1): Γ of a typed z or y within 0.02, |Γ| 0.01, VSWR 3 %, RL 0.3 dB. */
export const READ_TOL = { gamma: 0.02, mag: 0.01, vswr: 0.03, rl: 0.3 } as const;

function answerReached(ch: Challenge, answer: readonly number[] | undefined): { reached: boolean; why: string } {
  const ask = ch.read.ask, want = readAnswer(ch);
  const n = ask === 'z' || ask === 'y' ? 2 : 1;
  if (!answer || answer.length < n || !answer.slice(0, n).every((v) => Number.isFinite(v))) {
    return { reached: false, why: n === 2 ? 'Type two numbers.' : 'Type a number.' };
  }
  let off: boolean;
  if (n === 2) {
    // Γ of the typed value: z as is; y through z = 1/y (Γ_y = −Γ of y read as a z).
    const [ar, ai] = gammaOfZ(answer[0], answer[1]), [wr, wi] = gammaOfZ(want[0], want[1]);
    off = !(Math.hypot(ar - wr, ai - wi) <= READ_TOL.gamma);
  } else if (ask === 'mag') off = !(Math.abs(answer[0] - want[0]) <= READ_TOL.mag);
  else if (ask === 'vswr') off = !(Math.abs(answer[0] / want[0] - 1) <= READ_TOL.vswr);
  else off = !(Math.abs(answer[0] - want[0]) <= READ_TOL.rl);
  return off ? { reached: false, why: 'Not yet: that is not where the point is.' } : { reached: true, why: '' };
}

const ZC_REL = 1e-9;

/**
 * Whether the visitor's circuit (or typed answer, for `read`) reaches the challenge; `why` names the first rule that
 * fails, for the page to show under Check.
 */
export function reached(ch: Challenge, circuit: Circuit, answer?: readonly number[]): { reached: boolean; why: string } {
  if (ch.kind === 'read') return answerReached(ch, answer);
  const c0 = ch.circuit;
  if (!Object.is(circuit.z0, c0.z0) || !Object.is(circuit.f0, c0.f0) || !Object.is(circuit.loadR, c0.loadR) || !Object.is(circuit.loadX, c0.loadX)) {
    return { reached: false, why: 'Z0, f0 or the load is not the challenge’s: Start over brings it back.' };
  }
  const n = circuit.parts.length;
  if (n > ch.maxParts) return { reached: false, why: `At most ${ch.maxParts === 1 ? 'one part' : `${ch.maxParts} parts`}.` };
  for (let i = 0; i < n; i++) {
    const p = circuit.parts[i];
    if (!ch.allowed.includes(p.kind)) return { reached: false, why: `Part ${i + 1} is a ${KIND_WORDS[p.kind]}, which this challenge does not allow.` };
    if (ch.zcIsZ0 && (p.kind === LINE || p.kind === STUB_OPEN || p.kind === STUB_SHORT) && !(Math.abs(p.zc / circuit.z0 - 1) <= ZC_REL)) {
      return { reached: false, why: `Part ${i + 1}’s Zc must be Z0.` };
    }
    if (ch.e24 && isLC(p.kind) && !around(p.value, { id: 'E24' })?.exact) {
      return { reached: false, why: `Part ${i + 1}’s ${isL(p.kind) ? 'L' : 'C'} is not an E24 value.` };
    }
  }
  if (!goalHolds(circuit, ch.goal)) return { reached: false, why: `Not yet: |Γ| at the input is above ${ch.goal.value}.` };
  return { reached: true, why: '' };
}

// ---------------------------------------------------------------------------------------------------------------
// Hints and the reveal

export interface Hint {
  text: string;
  /** The node the circles are drawn at (solveLayer's drawing), −1 with none. */
  circleNode: number;
  /** Generalised circles (geometry.ts, 4 numbers each), or null. */
  circles: Float64Array | null;
  /** The last step: the solver's ways to the goal (Apply), for `e24` with the E24 variants that meet it. */
  revealed?: Revealed[];
  /** `read`, the last step: the answer and the equation (equations.ts id) that gives it. */
  answer?: number[];
  equation?: string;
}

const two = (v: number): number => Number(v.toPrecision(2));
const one = (v: number): number => Number(v.toPrecision(1));
const signed = (v: number): string => (v < 0 ? `− j${-v}` : `+ j${v}`);

/** The template the hints follow: the visitor's parts when they fit the kind's construction and solve, else the first that does. */
function hintTemplate(ch: Challenge, circuit: Circuit): { t: Circuit; result: SolveResult; found: Revealed[] } | null {
  const mine = circuit.parts;
  const fits = templatesOf(ch).some((kinds) => kinds.length === mine.length && mine.every((p, i) => {
    if (ch.kind === 'two' || ch.kind === 'e24') return isLC(p.kind) && (isSeries(kinds[i]) ? isSeries(p.kind) : isShunt(p.kind));
    return p.kind === kinds[i];
  }));
  if (fits && Object.is(circuit.loadR, ch.circuit.loadR) && Object.is(circuit.loadX, ch.circuit.loadX)) {
    const t = withParts(ch.circuit, mine.map((p) => part(p.kind, p.value > 0 && p.value < Infinity ? p.value : placeholder(p.kind, ch.circuit), ch.circuit)));
    const s = solveTemplate(t);
    if (s.found.length) return { t, ...s };
  }
  for (const kinds of templatesOf(ch)) {
    const t = template(ch.circuit, kinds);
    const s = solveTemplate(t);
    if (s.found.length) return { t, ...s };
  }
  return null;
}

/** The value of a part in words, two significant digits: "about 11 nH", "about 0.15 λ", "about 71 Ω". */
function aboutValue(kind: number, v: number): string {
  if (isLC(kind)) return `about ${formatAmount(v, isL(kind) ? 'H' : 'F', 2)}`;
  if (kind === QUARTER) return `about ${formatAmount(v, 'Ω', 2)}`;
  return `about ${two(v)} λ`;
}

/** "10 and 11 nH" (or "9.1 nH and 10 nH" across a prefix) for the E24 neighbours of a value. */
function neighbours(kind: number, v: number): string {
  const a = around(v, { id: 'E24' });
  const unit = isL(kind) ? 'H' : 'F';
  if (!a) return '';
  if (a.exact) return `; ${formatAmount(v, unit, 2)} is an E24 value`;
  const lo = formatAmount(a.below, unit, 2).split(' '), hi = formatAmount(a.above, unit, 2).split(' ');
  return lo[1] === hi[1] ? `; the E24 values beside it are ${lo[0]} and ${hi[0]} ${hi[1]}` : `; the E24 values beside it are ${lo.join(' ')} and ${hi.join(' ')}`;
}

const KIND_NAME: readonly string[] = ['A series R', 'A series L', 'A series C', 'A shunt R', 'A shunt L', 'A shunt C'];

/** Generalised circle of centre (cx, cy) and radius ρ, or the straight line through 0 along the axis (ρ = ∞). */
function circleInto(out: Float64Array, o: number, cx: number, cy: number, rho: number): void {
  if (rho === Infinity) { out[o] = 0; out[o + 1] = 0; out[o + 2] = 1; out[o + 3] = 0; return; }
  out[o] = 1; out[o + 1] = cx; out[o + 2] = cy; out[o + 3] = cx * cx + cy * cy - rho * rho;
}

function readLadder(ch: Challenge): Hint[] {
  const { ask, r, x } = ch.read;
  const want = readAnswer(ch);
  const [gr, gi] = gammaOfZ(r, x), m = Math.hypot(gr, gi);
  let circles: Float64Array, first: string, rule: string, rough: string, equation: string;
  if (ask === 'z' || ask === 'y') {
    const a = want[0], b = want[1];
    circles = new Float64Array(8);
    if (ask === 'z') {
      circleInto(circles, 0, a / (1 + a), 0, 1 / (1 + a));
      circleInto(circles, 4, 1, b === 0 ? 0 : 1 / b, b === 0 ? Infinity : 1 / Math.abs(b));
      first = 'The point lies where its r circle and its x circle cross; both are drawn.';
      rule = 'Read r and x where their circles’ labels are: r on the axis, x on the rim.';
      equation = 'z-gamma';
    } else {
      circleInto(circles, 0, -a / (1 + a), 0, 1 / (1 + a));
      circleInto(circles, 4, -1, b === 0 ? 0 : -1 / b, b === 0 ? Infinity : 1 / Math.abs(b));
      first = 'The point lies where its g circle and its b circle cross; both are drawn.';
      rule = 'Read g and b where their circles’ labels are, on the Y grid (the Z grid turned half a turn).';
      equation = 'y-gamma';
    }
    rough = `About ${one(a)} ${signed(one(b))}.`;
  } else {
    circles = new Float64Array(4);
    circleInto(circles, 0, 0, 0, m);
    first = 'The point’s |Γ| circle about the centre is drawn.';
    rule = ask === 'mag' ? '|Γ| is the distance from the centre, the rim being 1.'
      : ask === 'vswr' ? 'The VSWR is r where the |Γ| circle crosses the right half of the axis.'
        : 'RL = −20 log₁₀|Γ|, with |Γ| the distance from the centre.';
    rough = `About ${one(want[0])}${ask === 'rl' ? ' dB' : ''}.`;
    equation = ask === 'mag' ? 'gamma-z' : ask === 'vswr' ? 'vswr' : 'return-loss';
  }
  const exact = ask === 'z' ? `z = ${two3(want[0])} ${signed(two3(want[1]))}` : ask === 'y' ? `y = ${two3(want[0])} ${signed(two3(want[1]))}`
    : ask === 'mag' ? `|Γ| = ${two3(want[0])}` : ask === 'vswr' ? `VSWR = ${two3(want[0])}` : `RL = ${two3(want[0])} dB`;
  return [
    { text: first, circleNode: 0, circles },
    { text: rule, circleNode: -1, circles: null },
    { text: rough, circleNode: -1, circles: null },
    { text: `The answer: ${exact}.`, circleNode: -1, circles: null, answer: want, equation },
  ];
}
const two3 = (v: number): number => Number(v.toPrecision(3));

/**
 * The four hints (§1 "Hint ladder"): the circle, the part and its way, the first value, the reveal. They follow the
 * visitor's own parts when those fit the construction, else the solver's first realisable solution's order. Hints 1–3
 * never change the circuit.
 */
export function hintLadder(ch: Challenge, circuit: Circuit): Hint[] {
  if (ch.kind === 'read') return readLadder(ch);
  const h = hintTemplate(ch, circuit);
  if (!h) return [{ text: 'Reveal shows the solver’s answers.', circleNode: -1, circles: null, revealed: ch.revealed }];
  const { t, result, found } = h;
  const first = found[0], a = first.solution.values[0];
  // A line's hint 3 follows the shortest line (the first crossing, as hint 2 says).
  const shortest = (): number => found.reduce((m, r) => Math.min(m, r.solution.values[0].value), Infinity);
  const circles = result.circleNode >= 0 ? result.circles.slice() : null;
  const revealed = ch.e24 ? found.map((r) => ({ ...r, standard: e24Variants(t, ch.goal, r) })) : found;
  const last: Hint = { text: 'The solver’s answers; Apply sets one.', circleNode: -1, circles: null, revealed };
  switch (ch.kind) {
    case 'two': case 'e24': {
      const second = first.solution.values[1];
      const onto = isShunt(second.kind) ? 'g = 1' : 'r = 1';
      const e = explainPart(first.circuit, 0);
      // An L moves the point up (x grows in series, b falls in shunt), a C down.
      const way = `${KIND_NAME[a.kind]}: ${e.sense > 0 ? 'clockwise' : 'counter-clockwise'} ${isL(a.kind) ? 'up' : 'down'} the ${e.circle ? `${e.circle.kind} = ${two(e.circle.value)}` : isSeries(a.kind) ? 'r' : 'g'} circle.`;
      return [
        { text: `Your first part must bring the point onto this circle (${onto}); the second runs along it to the centre.`, circleNode: result.circleNode, circles },
        { text: way, circleNode: -1, circles: null },
        { text: `The first value: ${aboutValue(a.kind, a.value)}${ch.e24 ? neighbours(a.kind, a.value) : ''}.`, circleNode: -1, circles: null },
        last,
      ];
    }
    case 'stub':
      return [
        { text: 'The line turns the point on this circle until it meets g = 1.', circleNode: result.circleNode, circles },
        { text: 'A line of Z0, clockwise to the first crossing; the stub then cancels b.', circleNode: -1, circles: null },
        { text: `The line: ${aboutValue(LINE, shortest())}.`, circleNode: -1, circles: null },
        last,
      ];
    case 'qw':
      return ch.complex ? [
        { text: 'A line first turns the point to the axis, where the load is real.', circleNode: result.circleNode, circles },
        { text: 'A line, clockwise to either crossing of the axis.', circleNode: -1, circles: null },
        { text: `The line: ${aboutValue(LINE, shortest())}.`, circleNode: -1, circles: null },
        last,
      ] : [
        { text: 'As Zt changes, the input moves on this circle through the centre.', circleNode: result.circleNode, circles },
        { text: 'Zt lies between Z0 and the load’s R.', circleNode: -1, circles: null },
        { text: `Zt: ${aboutValue(QUARTER, a.value)}.`, circleNode: -1, circles: null },
        last,
      ];
  }
}

/** The reveal: the solver's ways to the goal (from the test before the problem was offered). */
export const reveal = (ch: Challenge): Revealed[] => ch.revealed;
