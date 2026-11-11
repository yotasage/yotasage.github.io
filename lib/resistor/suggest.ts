// The suggestions of the design mode: which real values, connected how, give a circuit its target and stay inside
// the allowed deviation at every temperature.
//
// A circuit with one resistance (single resistor, shunt) asks the combination search of combine.ts for the networks
// closest to the exact resistance. A circuit with two (divider, feedback, gains) is searched here: each leg is one
// value or, when allowed, two values in series or in parallel. The legs are kept in tables sorted by resistance; for
// every first leg the second leg that would give the target exactly is calculated and its neighbours in the other
// table are found by binary search, walking outwards only while a candidate can still enter the list. So the work is
// (number of legs) × log(number of legs), never legs × legs.
//
// Whether a candidate passes is decided during the search from two corners at the temperature furthest from the
// reference (the spread only grows with the distance); every candidate that is kept is then analysed exactly by
// design.ts. Kept are, for each number of parts, the `keep` best by: passing first, then the smaller nominal error,
// then the total resistance closer to the preferred one. Both limits of the output move steadily with the second
// leg, so the partners that pass are one stretch of the table: usually around the exact partner, and where the
// limits are lopsided (5 % parts, an input with a large tolerance) to one side of it, found by bisection.

import type { Network } from './network';
import { networkStats, networkValue, parallelNet, resistorNet, seriesNet } from './network';
import type { Connections } from './combine';
import { searchCombinations } from './combine';
import { cleanValues } from './values';
import type { Circuit, CircuitId } from './circuits';
import { circuitDef, circuitInputs, circuitProblem } from './circuits';
import type { DesignOptions } from './design';
import { circuitSpread } from './design';
import type { PartSpec } from './technology';
import { DESIGN_TEMPERATURES, REFERENCE_TEMPERATURE, TCR_STEPS, TOLERANCE_STEPS } from './technology';

export interface Range {
  min?: number;
  max?: number;
}

export interface SuggestOptions extends DesignOptions {
  // Required here: ± percent of the target.
  allowedPct: number;
  // A circuit with one resistance: the largest number of parts in it, 1 to 4. Default 2.
  maxParts?: number;
  // A circuit with two resistances: the largest number of parts in each of them, 1 or 2. Default 1.
  legParts?: number;
  // How the parts of one resistance may be connected. Default 'mixed'.
  connections?: Connections;
  // Whether a value may be used more than once in the circuit. Default true.
  reuse?: boolean;
  // How many candidates to keep for each number of parts, 1 to 200. Default 20.
  keep?: number;
  // Two resistances only: limits in ohms for each of them and for their sum, and in amperes for the current that
  // the circuit draws (divider: from the input; feedback: through R2; gains: through both, with a signal voltage).
  ranges?: { R1?: Range; R2?: Range; total?: Range; current?: Range };
  // Among equally good pairs, the one whose sum is closest to this is first. Default: the middle of `ranges.total`
  // when it has both ends, else 20 kΩ.
  preferTotal?: number;
}

export interface Candidate {
  // One network for each resistance of the circuit, and their values in ohms.
  legs: Network[];
  ohms: number[];
  parts: number;
  distinct: number;
  // The nominal output and its error in signed percent of the target.
  output: number;
  errorPct: number;
  // At the worst of the temperatures: the worst-case limits (signed percent of the target, with the nominal
  // error), the larger of them without sign, the RSS spread (±) and the nominal error plus the RSS spread.
  temperature: number;
  minPct: number;
  maxPct: number;
  worstPct: number;
  rssPct: number;
  rssWorstPct: number;
  // Inside the allowed deviation at every temperature in the worst case, and what is left of it (negative: outside
  // by that much). The same by RSS, which the ranking does not use.
  passes: boolean;
  margin: number;
  rssPasses: boolean;
  rssMargin: number;
  // The sum of the resistances, and the current the circuit draws (null when it has none).
  total: number;
  current: number | null;
  // How far the sum is from the preferred one, as |ln(total / preferred)|; 0 for a circuit with one resistance.
  tie: number;
}

export interface NeededSpec {
  // The loosest tolerance and TCR of the usual steps with which the parts pass; null when none does.
  spec: PartSpec | null;
  // 'passes': the given parts already do. 'tighter': `spec` is needed. 'nominal': the nominal error alone is
  // outside, so no parts help. 'fixed': the tolerances of the inputs (or the tracking spread) alone are outside.
  // 'beyond': tighter than the tightest step.
  why: 'passes' | 'tighter' | 'nominal' | 'fixed' | 'beyond';
}

export interface Suggestions {
  circuit: CircuitId;
  target: number;
  // The exact resistance, for a circuit with one; null otherwise.
  ideal: number | null;
  // Ranked: the candidates that pass first (fewer parts, then the smaller nominal error, then nearer the preferred
  // total), then the others by how far outside they are (then fewer parts, then the smaller nominal error).
  candidates: Candidate[];
  // `best[n]`: the first candidate with n parts in all, or null.
  best: (Candidate | null)[];
  passing: number;
  // When nothing passes: what the candidate with the smallest nominal error would need. Null when something passes.
  needed: (NeededSpec & { candidate: Candidate }) | null;
  // The number of values searched, and how many networks or pairs of legs the search covers.
  values: number;
  considered: number;
  ms: number;
  // Why there are no candidates, or what was left out.
  note?: string;
}

// With more values than this, the legs of a circuit with two resistances are single values only.
export const MAX_PAIR_LEG_VALUES = 1400;

// --- Leg tables ------------------------------------------------------------------------------------------------

// Legs sorted by resistance. `code` is the index of the value for a single value, and (i·n + j)·2 + kind for two
// values (kind 0: in series, 1: in parallel).
interface LegTable {
  ohms: Float64Array;
  code: Uint32Array;
  size: number;
}

const LOW_WORD = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1 ? 0 : 1;

function lowerBound(list: Float64Array, value: number, from: number, to: number): number {
  let lo = from;
  let hi = to;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (list[mid] < value) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function upperBound(list: Float64Array, value: number, from: number, to: number): number {
  let lo = from;
  let hi = to;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (list[mid] <= value) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

// Every leg of two values, sorted, each resistance once (the simplest of equal ones) and none that a single value
// gives as well.
function pairTable(v: Float64Array, connections: Connections, reuse: boolean): LegTable {
  const n = v.length;
  const count = (reuse ? (n * (n + 1)) / 2 : (n * (n - 1)) / 2) * (connections === 'mixed' ? 2 : 1);
  const raw = new Float64Array(count);
  const rawCode = new Uint32Array(count);
  let c = 0;
  for (let i = 0; i < n; i++) {
    for (let j = reuse ? i : i + 1; j < n; j++) {
      if (connections !== 'parallel') {
        raw[c] = v[i] + v[j];
        rawCode[c++] = (i * n + j) * 2;
      }
      if (connections !== 'series') {
        raw[c] = (v[i] * v[j]) / (v[i] + v[j]);
        rawCode[c++] = (i * n + j) * 2 + 1;
      }
    }
  }
  // Sorted without a comparator: the place of each entry is written into the low half of a copy of its value, the
  // copies are sorted as numbers (the order is then right to about 1e-6), and one pass of insertion puts the exact
  // values in order.
  const keys = Float64Array.from(raw);
  const words = new Uint32Array(keys.buffer);
  for (let k = 0; k < count; k++) words[2 * k + LOW_WORD] = k;
  keys.sort();
  const ohms = new Float64Array(count);
  const code = new Uint32Array(count);
  for (let k = 0; k < count; k++) {
    const from = words[2 * k + LOW_WORD];
    const x = raw[from];
    let p = k;
    while (p > 0 && ohms[p - 1] > x) {
      ohms[p] = ohms[p - 1];
      code[p] = code[p - 1];
      p--;
    }
    ohms[p] = x;
    code[p] = rawCode[from];
  }
  // Equal values in one leg before different ones, series before parallel.
  const plain = (entry: number) => {
    const ij = entry >>> 1;
    return (Math.floor(ij / n) === ij % n ? 0 : 2) + (entry & 1);
  };
  let size = 0;
  let k = 0;
  while (k < count) {
    const limit = ohms[k] * (1 + 1e-12);
    let best = k;
    let end = k + 1;
    while (end < count && ohms[end] <= limit) {
      if (plain(code[end]) < plain(code[best])) best = end;
      end++;
    }
    const at = lowerBound(v, ohms[k] * (1 - 1e-12), 0, n);
    if (!(at < n && v[at] <= limit)) {
      ohms[size] = ohms[best];
      code[size] = code[best];
      size++;
    }
    k = end;
  }
  return { ohms: ohms.slice(0, size), code: code.slice(0, size), size };
}

let cache: { v: Float64Array; connections: Connections; reuse: boolean; pairs: LegTable } | null = null;

// Forgets the table of two-value legs kept for the last value list (about 6 MB for E96, 22 MB for E192).
export function clearSuggestCache(): void {
  cache = null;
}

function pairsFor(v: Float64Array, connections: Connections, reuse: boolean): LegTable {
  let hit = !!cache && cache.connections === connections && cache.reuse === reuse && cache.v.length === v.length;
  for (let k = 0; hit && k < v.length; k++) hit = cache.v[k] === v[k];
  if (!hit) cache = { v, connections, reuse, pairs: pairTable(v, connections, reuse) };
  return cache.pairs;
}

function legNetwork(v: Float64Array, code: number, two: boolean): Network {
  if (!two) return resistorNet(v[code]);
  const ij = code >>> 1;
  const parts = [resistorNet(v[Math.floor(ij / v.length)]), resistorNet(v[ij % v.length])];
  return code & 1 ? parallelNet(parts) : seriesNet(parts);
}

// --- Candidates ------------------------------------------------------------------------------------------------

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function candidate(circuit: Circuit, legs: Network[], target: number, options: SuggestOptions, tie: number): Candidate {
  const def = circuitDef(circuit.id);
  const spread = circuitSpread(circuit, legs, target, options);
  const at = spread.points[spread.worst];
  const ohms = legs.map(networkValue);
  const stats = legs.map(networkStats);
  const values = new Set<number>();
  const collect = (net: Network) => {
    if (net.kind === 'r') values.add(net.ohms);
    else net.parts.forEach(collect);
  };
  legs.forEach(collect);
  const current = def.supply(circuitInputs(circuit), ohms[0], ohms[1]);
  return {
    legs,
    ohms,
    parts: stats.reduce((sum, entry) => sum + entry.parts, 0),
    distinct: values.size,
    output: spread.nominal,
    errorPct: spread.errorPct,
    temperature: at.temperature,
    minPct: at.minPct,
    maxPct: at.maxPct,
    worstPct: at.worstPct,
    rssPct: at.rssPct,
    rssWorstPct: spread.rssWorstPct,
    passes: spread.passes === true,
    margin: spread.margin,
    rssPasses: spread.rssPasses === true,
    rssMargin: spread.rssMargin,
    total: ohms.reduce((sum, value) => sum + value, 0),
    current: Number.isFinite(current) ? current : null,
    tie,
  };
}

// The order of the list (see `Suggestions.candidates`). Errors within 1e-9 % and margins within 1e-6 % are equal.
function order(a: Candidate, b: Candidate): number {
  if (a.passes !== b.passes) return a.passes ? -1 : 1;
  const error = Math.round(Math.abs(a.errorPct) * 1e9) - Math.round(Math.abs(b.errorPct) * 1e9);
  const rest = a.parts - b.parts || error || a.tie - b.tie || a.distinct - b.distinct;
  if (a.passes) return rest;
  return Math.round(b.margin * 1e6) - Math.round(a.margin * 1e6) || rest;
}

// The loosest tolerance and TCR, among the usual steps not looser than the given ones, with which these parts stay
// inside the allowed deviation: the fewest steps tighter in all, then the more even, then the looser TCR.
export function neededSpec(circuit: Circuit, legs: Network[], target: number, options: SuggestOptions): NeededSpec {
  const passes = (spec: PartSpec) => circuitSpread(circuit, legs, target, { ...options, spec }).passes === true;
  if (passes(options.spec)) return { spec: { ...options.spec }, why: 'passes' };
  const perfect = circuitSpread(circuit, legs, target, { ...options, spec: { tolerancePct: 0, tcrPpm: 0 } });
  if (!perfect.passes) return { spec: null, why: Math.abs(perfect.errorPct) > Math.abs(options.allowedPct) ? 'nominal' : 'fixed' };
  const tolerances = [Math.abs(options.spec.tolerancePct), ...TOLERANCE_STEPS.filter((step) => step < Math.abs(options.spec.tolerancePct))];
  const tcrs = [Math.abs(options.spec.tcrPpm), ...TCR_STEPS.filter((step) => step < Math.abs(options.spec.tcrPpm))];
  let best: { i: number; j: number } | null = null;
  for (let i = 0; i < tolerances.length; i++) {
    for (let j = 0; j < tcrs.length; j++) {
      if (best && i + j > best.i + best.j) break;
      if (!passes({ tolerancePct: tolerances[i], tcrPpm: tcrs[j] })) continue;
      const better = !best || i + j < best.i + best.j || Math.max(i, j) < Math.max(best.i, best.j)
        || (Math.max(i, j) === Math.max(best.i, best.j) && j < best.j);
      if (better) best = { i, j };
      break;
    }
  }
  if (!best) return { spec: null, why: 'beyond' };
  return { spec: { tolerancePct: tolerances[best.i], tcrPpm: tcrs[best.j] }, why: 'tighter' };
}

// --- The search for two resistances ----------------------------------------------------------------------------

interface Kept {
  fail: number;
  // The nominal error in steps of 1e-12 of the target.
  error: number;
  tie: number;
  r1: number;
  r2: number;
  code1: number;
  code2: number;
  // Whether each resistance is two values.
  two1: boolean;
  two2: boolean;
}

function searchPairs(circuit: Circuit, target: number, v: Float64Array, options: SuggestOptions, keep: number, two: boolean) {
  const def = circuitDef(circuit.id);
  const x = circuitInputs(circuit);
  const n = v.length;
  const connections = options.connections ?? 'mixed';
  const reuse = options.reuse !== false;
  const size = Math.abs(target);
  // Inside the allowed deviation, with the slack that design.ts gives (1e-9 percent).
  const allowed = Math.abs(options.allowedPct) / 100 + 1e-11;
  const ranges = options.ranges ?? {};
  const legRange = [ranges.R1 ?? {}, ranges.R2 ?? {}];
  const totalMin = ranges.total?.min ?? 0;
  const totalMax = ranges.total?.max ?? Infinity;
  const limitTotal = totalMin > 0 || totalMax < Infinity;
  const currentMin = ranges.current?.min ?? 0;
  const currentMax = ranges.current?.max ?? Infinity;
  const limitCurrent = currentMin > 0 || currentMax < Infinity;
  const prefer = options.preferTotal > 0 ? options.preferTotal : totalMin > 0 && totalMax < Infinity ? Math.sqrt(totalMin * totalMax) : 20e3;

  const singles: LegTable = { ohms: v, code: Uint32Array.from(v, (value, index) => index), size: n };
  const pairs = two ? pairsFor(v, connections, reuse) : null;

  // The corners at the temperature furthest from the reference. The direction of each resistance and each input is
  // found once, at the first pair that gives the target.
  const reference = options.reference ?? REFERENCE_TEMPERATURE;
  const temperatures = options.temperatures?.length ? options.temperatures : DESIGN_TEMPERATURES;
  const dT = Math.max(...temperatures.map((temperature) => Math.abs(temperature - reference)));
  const t = Math.abs(options.spec.tolerancePct) / 100;
  const tcr = Math.abs(options.spec.tcrPpm) * 1e-6 * dT;
  const tracking = options.drift === 'tracking';
  const g = tracking ? tcr : 0;
  const h = tracking ? (Math.abs(options.trackingPpm ?? 0) / 2) * 1e-6 * dT : tcr;
  let probe1 = NaN;
  let probe2 = NaN;
  for (let k = 0; k < n && !(probe2 > 0); k++) {
    probe1 = v[(k + (n >> 1)) % n];
    probe2 = def.solve(x, target, 1, probe1);
  }
  if (!(probe2 > 0)) return { kept: [[], [], [], [], []] as Kept[][], considered: 0, pairs };
  const rising = (up: number, down: number) => (up >= down ? 1 : -1);
  const d1 = rising(def.value(x, probe1 * 1.01, probe2), def.value(x, probe1 * 0.99, probe2));
  const d2 = rising(def.value(x, probe1, probe2 * 1.01), def.value(x, probe1, probe2 * 0.99));
  const xMax = { ...x };
  const xMin = { ...x };
  for (const input of def.inputs) {
    const tol = Math.abs(circuit.tolerances?.[input.id] ?? 0) / 100;
    if (!(tol > 0) || x[input.id] === 0 || !Number.isFinite(x[input.id])) continue;
    const d = rising(def.value({ ...x, [input.id]: x[input.id] * 1.01 }, probe1, probe2), def.value({ ...x, [input.id]: x[input.id] * 0.99 }, probe1, probe2));
    xMax[input.id] = x[input.id] * (1 + d * tol);
    xMin[input.id] = x[input.id] * (1 - d * tol);
  }
  // The factor of a leg at a corner: `d` its own direction, `w` that of the common drift.
  const factor = (d: number, w: number) => (1 + d * t) * (1 + w * g + d * h);
  const commons = g > 0 ? [-1, 1] : [0];
  const corners = commons.map((w) => ({ max1: factor(d1, w), max2: factor(d2, w), min1: factor(-d1, w), min2: factor(-d2, w) }));
  const high = target + allowed * size;
  const low = target - allowed * size;
  // Whether the largest output stays below the upper limit, and the smallest above the lower one.
  const maxOk = (r1: number, r2: number) => {
    for (let c = 0; c < corners.length; c++) if (def.value(xMax, r1 * corners[c].max1, r2 * corners[c].max2) > high) return false;
    return true;
  };
  const minOk = (r1: number, r2: number) => {
    for (let c = 0; c < corners.length; c++) if (def.value(xMin, r1 * corners[c].min1, r2 * corners[c].min2) < low) return false;
    return true;
  };
  const passes = (r1: number, r2: number) => maxOk(r1, r2) && minOk(r1, r2);

  // Whether two legs share a value.
  const shares = (code1: number, two1: boolean, code2: number, two2: boolean) => {
    const a = two1 ? [Math.floor((code1 >>> 1) / n), (code1 >>> 1) % n] : [code1];
    const b = two2 ? [Math.floor((code2 >>> 1) / n), (code2 >>> 1) % n] : [code2];
    return a.some((index) => b.includes(index));
  };

  const kept: Kept[][] = [[], [], [], [], []];
  let considered = 0;

  // One class of pairs: every leg of `loop` as resistance `loopLeg`, with its partners from `look`.
  const scan = (loop: LegTable, loopTwo: boolean, look: LegTable, lookTwo: boolean, loopLeg: number) => {
    const list = kept[(loopTwo ? 2 : 1) + (lookTwo ? 2 : 1)];
    const lookLeg = 1 - loopLeg;
    const from = lowerBound(loop.ohms, legRange[loopLeg].min ?? 0, 0, loop.size);
    const to = upperBound(loop.ohms, Math.min(legRange[loopLeg].max ?? Infinity, totalMax), 0, loop.size);
    const lookFrom = lowerBound(look.ohms, legRange[lookLeg].min ?? 0, 0, look.size);
    const lookTo = upperBound(look.ohms, legRange[lookLeg].max ?? Infinity, 0, look.size);
    considered += Math.max(0, to - from) * Math.max(0, lookTo - lookFrom);

    // Takes the pair into the list when it is good enough. False: nothing further out on this side can be.
    // `known` is the nominal deviation when the caller has it (else −1), `failing` whether the pair fails (else −1).
    const offer = (ia: number, ib: number, known: number, failing: number): boolean => {
      const a = loop.ohms[ia];
      const b = look.ohms[ib];
      const r1 = loopLeg === 0 ? a : b;
      const r2 = loopLeg === 0 ? b : a;
      const deviation = known >= 0 ? known : Math.abs(def.value(x, r1, r2) - target) / size;
      const error = Math.round(deviation * 1e12);
      const full = list.length >= keep;
      const last = full ? list[list.length - 1] : null;
      let fail = 1;
      if (failing >= 0) fail = failing;
      else if (deviation <= allowed) {
        if (last && last.fail === 0 && error > last.error) return false;
        fail = passes(r1, r2) ? 0 : 1;
      }
      if (last && fail === 1 && (last.fail === 0 || error > last.error)) return false;
      if (limitCurrent) {
        // A circuit without a current (a gain without a signal voltage) is not limited.
        const current = Math.abs(def.supply(x, r1, r2));
        if (current < currentMin * (1 - 1e-12) || current > currentMax * (1 + 1e-12)) return true;
      }
      const codeA = loop.code[ia];
      const codeB = look.code[ib];
      if (!reuse && shares(codeA, loopTwo, codeB, lookTwo)) return true;
      const tie = Math.abs(Math.log((r1 + r2) / prefer));
      if (last && fail === last.fail && error === last.error && tie >= last.tie) return true;
      const entry: Kept = loopLeg === 0
        ? { fail, error, tie, r1, r2, code1: codeA, code2: codeB, two1: loopTwo, two2: lookTwo }
        : { fail, error, tie, r1, r2, code1: codeB, code2: codeA, two1: lookTwo, two2: loopTwo };
      let at = list.length;
      while (at > 0 && (list[at - 1].fail - fail || list[at - 1].error - error || list[at - 1].tie - tie) > 0) at--;
      list.splice(at, 0, entry);
      if (list.length > keep) list.pop();
      return true;
    };

    // The partners of one leg on one side of the exact one, from the nearest (`first`) outwards (`step` ±1 in the
    // table). They pass, then fail. Only when the limits are lopsided (an input with a large tolerance) can the
    // nearest ones fail at the limit behind them while further ones pass: the first that passes that limit is then
    // found by bisection (both limits move steadily with the partner) and the walk goes on from there.
    const rise = lookLeg === 0 ? d1 : d2;
    const limitOk = (a: number, k: number, upper: boolean) => {
      const b = look.ohms[k];
      return loopLeg === 0 ? (upper ? maxOk(a, b) : minOk(a, b)) : (upper ? maxOk(b, a) : minOk(b, a));
    };
    const walk = (ia: number, a: number, first: number, step: number, lo: number, hi: number) => {
      if (first < lo || first >= hi) return;
      let run = -1;
      let failing = 1;
      const b = look.ohms[first];
      const deviation = Math.abs((loopLeg === 0 ? def.value(x, a, b) : def.value(x, b, a)) - target) / size;
      if (deviation <= allowed) {
        // Nothing on this side is closer than the nearest: when that is too far to be taken, so are the others.
        if (list.length >= keep && list[list.length - 1].fail === 0 && Math.round(deviation * 1e12) > list[list.length - 1].error) return;
        // The limit this side moves towards (`ahead`), and the one it moves away from.
        const ahead = rise * step > 0;
        const beyond = step > 0 ? hi - 1 - first : first - lo;
        const aheadOk = limitOk(a, first, ahead);
        const behindOk = aheadOk && limitOk(a, first, !ahead);
        if (behindOk) failing = 0;
        if (beyond > 0 && aheadOk && !behindOk && limitOk(a, first + beyond * step, !ahead)) {
          let none = 0;
          let some = beyond;
          while (some - none > 1) {
            const mid = (none + some) >>> 1;
            if (limitOk(a, first + mid * step, !ahead)) some = mid;
            else none = mid;
          }
          if (limitOk(a, first + some * step, ahead)) run = first + some * step;
        }
      }
      for (let k = first, steps = 0; k >= lo && k < hi && steps < keep; k += step, steps++) {
        if (k === run) break;
        if (!(k === first ? offer(ia, k, deviation, failing) : offer(ia, k, -1, -1))) {
          if (run < 0) return;
          break;
        }
      }
      if (run < 0) return;
      for (let k = run, steps = 0; k >= lo && k < hi && steps < keep; k += step, steps++) if (!offer(ia, k, -1, -1)) return;
    };

    for (let ia = from; ia < to; ia++) {
      const a = loop.ohms[ia];
      let lo = lookFrom;
      let hi = lookTo;
      if (limitTotal) {
        lo = Math.max(lo, lowerBound(look.ohms, (totalMin - a) * (1 - 1e-12), 0, look.size));
        hi = Math.min(hi, upperBound(look.ohms, (totalMax - a) * (1 + 1e-12), 0, look.size));
      }
      if (lo >= hi) continue;
      const ideal = def.solve(x, target, lookLeg, a);
      if (!(ideal > 0)) {
        // No partner gives the target exactly (a load that alone pulls the output down, a pin current that alone
        // lifts it): the output stays on one side of the target and is nearest at one end of the table.
        const off = (k: number) => Math.abs((loopLeg === 0 ? def.value(x, a, look.ohms[k]) : def.value(x, look.ohms[k], a)) - target);
        if (off(lo) <= off(hi - 1)) walk(ia, a, lo, 1, lo, hi);
        else walk(ia, a, hi - 1, -1, lo, hi);
        continue;
      }
      // In a dense table the neighbours draw nearly the current of the exact partner: far outside, none will do.
      if (limitCurrent && lookTwo) {
        const current = Math.abs(loopLeg === 0 ? def.supply(x, a, ideal) : def.supply(x, ideal, a));
        if (current < currentMin / 2 || current > currentMax * 2) continue;
      }
      const p = lowerBound(look.ohms, ideal, lo, hi);
      walk(ia, a, p - 1, -1, lo, hi);
      walk(ia, a, p, 1, lo, hi);
    }
  };

  scan(singles, false, singles, false, 0);
  if (pairs) {
    scan(singles, false, pairs, true, 0);
    scan(singles, false, pairs, true, 1);
    scan(pairs, true, pairs, true, 0);
  }
  return { kept, considered, pairs };
}

// --- The suggestions -------------------------------------------------------------------------------------------

// The candidates for a circuit: `target` is the output wanted (in the output's unit), `values` the resistances
// that may be used (a series over a range or the visitor's own list; any order).
export function suggestParts(circuit: Circuit, target: number, values: ArrayLike<number>, options: SuggestOptions): Suggestions {
  const started = now();
  const def = circuitDef(circuit.id);
  const list = cleanValues(values);
  const keep = Math.min(200, Math.max(1, Math.round(options.keep ?? 20)));
  const out: Suggestions = {
    circuit: circuit.id, target, ideal: null, candidates: [], best: [null, null, null, null, null], passing: 0,
    needed: null, values: list.length, considered: 0, ms: 0,
  };
  const done = (note?: string) => {
    if (note) out.note = note;
    out.ms = now() - started;
    return out;
  };
  const problem = circuitProblem(circuit, target);
  if (problem) return done(problem);
  if (!list.length) return done('There are no values to choose from.');
  if (!(Math.abs(options.allowedPct) >= 0)) return done('The allowed deviation is missing.');

  if (def.legs.length === 1) {
    const ideal = def.solve(circuitInputs(circuit), target, 0, NaN);
    out.ideal = ideal;
    const maxParts = Math.min(4, Math.max(1, Math.round(options.maxParts ?? 2)));
    const search = searchCombinations(ideal, list, { maxParts, connections: options.connections ?? 'mixed', reuse: options.reuse !== false, keep });
    for (let parts = 1; parts <= maxParts; parts++) {
      for (const found of search.byParts[parts] ?? []) out.candidates.push(candidate(circuit, [found.network], target, options, 0));
    }
    out.considered = search.considered;
    if (search.note) out.note = search.note;
  } else {
    const v = Float64Array.from(list);
    const wanted = Math.round(options.legParts ?? 1) >= 2;
    const two = wanted && v.length <= MAX_PAIR_LEG_VALUES;
    if (wanted && !two) out.note = `With more than ${MAX_PAIR_LEG_VALUES} values, each resistance is a single value.`;
    const found = searchPairs(circuit, target, v, options, keep, two);
    for (let parts = 2; parts <= 4; parts++) {
      for (const entry of found.kept[parts]) {
        const legs = [legNetwork(v, entry.code1, entry.two1), legNetwork(v, entry.code2, entry.two2)];
        out.candidates.push(candidate(circuit, legs, target, options, entry.tie));
      }
    }
    out.considered = found.considered;
  }

  out.candidates.sort(order);
  for (const entry of out.candidates) {
    if (entry.passes) out.passing++;
    if (!out.best[entry.parts]) out.best[entry.parts] = entry;
  }
  if (!out.passing && out.candidates.length) {
    let closest = out.candidates[0];
    for (const entry of out.candidates) {
      const d = Math.round(Math.abs(entry.errorPct) * 1e9) - Math.round(Math.abs(closest.errorPct) * 1e9);
      if (d < 0 || (d === 0 && (entry.parts - closest.parts || entry.tie - closest.tie) < 0)) closest = entry;
    }
    out.needed = { ...neededSpec(circuit, closest.legs, target, options), candidate: closest };
  }
  if (!out.candidates.length && !out.note) out.note = 'No values within the limits come near the target.';
  return done();
}
