// The combination search: every series-parallel network of 1 to 4 resistors from a list of allowed values that
// comes closest to a target. Not brute force: the two-resistor series and parallel values are built once and sorted
// (cached per value list), and the part that completes a network is found in them by binary search, as KiCad's PCB
// Calculator does. Parallel is series in conductance, so one routine (`domain`) serves the networks whose outer
// group is in series (in ohms) and those whose outer group is in parallel (in siemens).

import type { Network } from './network';
import { canonicalNetwork, networkKey, networkValue, parallelNet, resistorNet, seriesNet } from './network';
import { cleanValues } from './values';

export type Connections = 'series' | 'parallel' | 'mixed';

export interface SearchOptions {
  // The largest number of resistors in a network, 1 to 4. Default 2.
  maxParts?: number;
  // 'series': resistors in a row only; 'parallel': side by side only; 'mixed': every network, also groups in
  // groups. Default 'mixed'.
  connections?: Connections;
  // Whether a value may be used more than once in a network. Default true.
  reuse?: boolean;
  // Whether a single resistor of the target value counts as a result. Default true.
  allowTarget?: boolean;
  // The largest error to report, in percent of the target, without sign. Default: no limit.
  maxErrorPct?: number;
  // How many results to keep, for the ranked list and for each number of parts; 1 to 1000. Default 50.
  keep?: number;
}

export interface Combination {
  // In its canonical order (see `canonicalNetwork`).
  network: Network;
  key: string;
  ohms: number;
  // Signed: value − target. Both are 0 for an exact match.
  errorOhms: number;
  errorPct: number;
  // Within 1e-9 of the target, relative.
  exact: boolean;
  parts: number;
  distinct: number;
  depth: number;
}

export interface SearchResult {
  target: number;
  // The options as they were used.
  options: Required<SearchOptions>;
  // The number of values searched, after sorting and removing duplicates.
  values: number;
  // Ranked: smaller error first; near ties to fewer parts, then the simpler network, then fewer different values.
  results: Combination[];
  // The same ranking among the networks of exactly 1, 2, 3 and 4 parts: `byParts[2]` are the two-resistor networks.
  byParts: Combination[][];
  // `best[n]` is `byParts[n][0]`, or null.
  best: (Combination | null)[];
  // How many different networks the search covers, in all and for each number of parts.
  considered: number;
  consideredByParts: number[];
  ms: number;
  // Why the search did less than asked (too many values, no values, no target).
  note?: string;
}

// With more values than this, networks of three and four parts are not searched (the pair tables would take more
// than about 100 MB).
export const MAX_SEARCH_VALUES = 2000;
export const MAX_SEARCH_KEEP = 1000;

// Relative: a value this close to the target is an exact match, and errors this close together are a tie.
const EXACT = 1e-9;
const TIE = 1e-12;

// --- How many networks there are ------------------------------------------------------------------------------

function choose(n: number, k: number): number {
  if (k < 0 || n < k) return 0;
  let out = 1;
  for (let i = 1; i <= k; i++) out = (out * (n - k + i)) / i;
  return Math.round(out);
}

// The number of different networks of exactly `parts` resistors from `n` values.
export function networkCount(n: number, parts: number, connections: Connections, reuse: boolean): number {
  if (n < 1 || parts < 1 || parts > 4) return 0;
  if (parts === 1) return n;
  // Plain series (or plain parallel) groups, and the networks with groups inside whose outer group is in series.
  let flat: number;
  let nested = 0;
  if (reuse) {
    const pairs = choose(n + 1, 2);
    flat = choose(n + parts - 1, parts);
    if (parts === 3) nested = n * pairs;
    if (parts === 4) nested = pairs * pairs + choose(pairs + 1, 2) + n * choose(n + 2, 3) + n * n * pairs;
  } else {
    flat = choose(n, parts);
    if (parts === 3) nested = n * choose(n - 1, 2);
    if (parts === 4) {
      const twoPairs = choose(n, 2) * choose(n - 2, 2);
      nested = twoPairs + twoPairs / 2 + n * choose(n - 1, 3) + n * (n - 1) * choose(n - 2, 2);
    }
  }
  return connections === 'mixed' ? 2 * (flat + nested) : flat;
}

// --- Tables -----------------------------------------------------------------------------------------------------

// Values in ascending order with the indices (into the value list) of the one or two resistors behind each.
interface Table {
  x: Float64Array;
  i: Uint16Array | Uint32Array;
  j: Uint16Array | Uint32Array;
}

interface Tables {
  // The values, and their conductances in ascending order (so g[k] belongs to v[n − 1 − k]).
  v: Float64Array;
  g: Float64Array;
  atomsR: Table;
  atomsG: Table;
  // Two resistors in series and in parallel, in ohms (sr, pr) and in siemens (sg, pg).
  pairs?: { sr: Table; pr: Table; sg: Table; pg: Table };
}

// Every sum x[i] + x[j] with i ≤ j, sorted.
function sortedSums(x: Float64Array): Table {
  const n = x.length;
  const m = (n * (n + 1)) / 2;
  const sum = new Float64Array(m);
  const pi = new Uint16Array(m);
  const pj = new Uint16Array(m);
  let k = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i; j < n; j++) {
      sum[k] = x[i] + x[j];
      pi[k] = i;
      pj[k] = j;
      k++;
    }
  }
  const order = new Uint32Array(m);
  for (k = 0; k < m; k++) order[k] = k;
  order.sort((p, q) => sum[p] - sum[q]);
  const out: Table = { x: new Float64Array(m), i: new Uint16Array(m), j: new Uint16Array(m) };
  for (k = 0; k < m; k++) {
    const from = order[k];
    out.x[k] = sum[from];
    out.i[k] = pi[from];
    out.j[k] = pj[from];
  }
  return out;
}

// The reciprocals of a table, ascending again.
function reciprocals(table: Table): Table {
  const m = table.x.length;
  const out: Table = { x: new Float64Array(m), i: new Uint16Array(m), j: new Uint16Array(m) };
  for (let k = 0; k < m; k++) {
    const from = m - 1 - k;
    out.x[k] = 1 / table.x[from];
    out.i[k] = table.i[from];
    out.j[k] = table.j[from];
  }
  return out;
}

let cache: Tables | null = null;

// Forgets the tables of the last value list (they are kept so that a new target on the same list starts at once).
export function clearSearchCache(): void {
  cache = null;
}

function* tablesFor(values: number[], pairs: boolean): Generator<number, Tables, void> {
  const n = values.length;
  let tables = cache;
  let hit = !!tables && tables.v.length === n;
  for (let k = 0; hit && k < n; k++) hit = tables.v[k] === values[k];
  if (!hit) {
    const v = Float64Array.from(values);
    const g = new Float64Array(n);
    const up = new Uint32Array(n);
    const down = new Uint32Array(n);
    for (let k = 0; k < n; k++) {
      g[k] = 1 / v[n - 1 - k];
      up[k] = k;
      down[k] = n - 1 - k;
    }
    tables = { v, g, atomsR: { x: v, i: up, j: up }, atomsG: { x: g, i: down, j: down } };
    cache = tables;
  }
  if (pairs && !tables.pairs) {
    yield 0;
    const sr = sortedSums(tables.v);
    yield 0;
    const conductances = new Float64Array(n);
    for (let k = 0; k < n; k++) conductances[k] = 1 / tables.v[k];
    const pg = sortedSums(conductances);
    yield 0;
    tables.pairs = { sr, pg, sg: reciprocals(sr), pr: reciprocals(pg) };
    yield 0;
  }
  return tables;
}

// --- The search -------------------------------------------------------------------------------------------------

// A network that was found: the shape (`topo`) and the indices of its values.
// Shapes, with G the outer group and D the other kind: 0 one resistor; 1 G(a,b); 3 G(a,b,c); 5 G(a,D(b,c));
// 7 G(a,b,c,d); 9 G(a,b,D(c,d)); 11 G(D(a,b),D(c,d)); 13 G(a,D(b,c,d)); 15 G(a,D(b,G(c,d))). An odd number is the
// shape with G in series, the number after it the same with G in parallel.
interface Found {
  q: number;
  parts: number;
  depth: number;
  distinct: number;
  topo: number;
  a: number;
  b: number;
  c: number;
  d: number;
}

const DEPTH = [0, 1, 1, 1, 1, 2, 2, 1, 1, 2, 2, 2, 2, 2, 2, 3, 3];

function rank(x: Found, y: Found): number {
  return x.q - y.q || x.parts - y.parts || x.depth - y.depth || x.distinct - y.distinct
    || x.topo - y.topo || x.a - y.a || x.b - y.b || x.c - y.c || x.d - y.d;
}

function build(found: Found, v: Float64Array): Network {
  // An even shape number (from 2) has its outer group in parallel.
  const inParallel = found.topo > 0 && found.topo % 2 === 0;
  const outer = inParallel ? parallelNet : seriesNet;
  const other = inParallel ? seriesNet : parallelNet;
  const [a, b, c, d] = [found.a, found.b, found.c, found.d].map((index) => (index < 0 ? null : resistorNet(v[index])));
  switch (found.topo - (inParallel ? 1 : 0)) {
    case 0: return a;
    case 1: return outer([a, b]);
    case 3: return outer([a, b, c]);
    case 5: return outer([a, other([b, c])]);
    case 7: return outer([a, b, c, d]);
    case 9: return outer([a, b, other([c, d])]);
    case 11: return outer([other([a, b]), other([c, d])]);
    case 13: return outer([a, other([b, c, d])]);
    default: return outer([a, other([b, outer([c, d])])]);
  }
}

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

// The search in steps: `next()` does a small piece of work and gives the progress from 0 to 1; the last one returns
// the result. `searchCombinations` runs it in one go, `runSearch` in slices of time.
export function* searchSteps(target: number, values: ArrayLike<number>, options: SearchOptions = {}): Generator<number, SearchResult, void> {
  const started = now();
  const t = Number(target);
  const list = cleanValues(values);
  const n = list.length;
  const used: Required<SearchOptions> = {
    maxParts: Math.min(4, Math.max(1, Math.round(options.maxParts ?? 2) || 1)),
    connections: options.connections === 'series' || options.connections === 'parallel' ? options.connections : 'mixed',
    reuse: options.reuse !== false,
    allowTarget: options.allowTarget !== false,
    maxErrorPct: options.maxErrorPct >= 0 ? options.maxErrorPct : Infinity,
    keep: Math.min(MAX_SEARCH_KEEP, Math.max(1, Math.round(options.keep ?? 50) || 1)),
  };
  const result: SearchResult = {
    target: t, options: used, values: n, results: [], byParts: [[], [], [], [], []],
    best: [null, null, null, null, null], considered: 0, consideredByParts: [0, 0, 0, 0, 0], ms: 0,
  };
  if (!(t > 0) || !Number.isFinite(t)) {
    result.note = 'The target must be a resistance above zero.';
    return result;
  }
  if (!n) {
    result.note = 'There are no values to combine.';
    return result;
  }
  if (used.maxParts > 2 && n > MAX_SEARCH_VALUES) {
    used.maxParts = 2;
    result.note = `With more than ${MAX_SEARCH_VALUES} values, only networks of one and two resistors are searched.`;
  }
  const { maxParts, connections, reuse, keep } = used;
  const mixed = connections === 'mixed';
  const maxRel = used.maxErrorPct / 100;

  const tables = yield* tablesFor(list, maxParts > 2);
  const v = tables.v;

  // The best `keep` networks for each number of parts, as heaps with the worst on top, and the largest error
  // (in ohms) that can still get into each.
  const heaps: Found[][] = [[], [], [], [], []];
  const limit = [0, 0, 0, 0, 0].map(() => maxRel * t * 1.000001);
  // The networks in each heap, as numbers: a look-up finds the same network in several ways (a + b + c from a, from
  // b and from c), and every way is offered, so that the nearest networks of each look-up tighten the limit at once.
  const members: Set<number>[] = [new Set(), new Set(), new Set(), new Set(), new Set()];
  const radix = n + 1;

  const offer = (parts: number, topo: number, a: number, b: number, c: number, d: number, value: number) => {
    let rel = Math.abs(value - t) / t;
    if (rel <= EXACT) rel = 0;
    if (rel > maxRel) return;
    let distinct = 1;
    if (parts > 1 && b !== a) distinct++;
    if (parts > 2 && c !== a && c !== b) distinct++;
    if (parts > 3 && d !== a && d !== b && d !== c) distinct++;
    if (!reuse && distinct !== parts) return;
    // The parts of a group in ascending order, so that a network is the same however it was found.
    let swap: number;
    switch (topo - ((topo + 1) & 1)) {
      case 1:
        if (a > b) { swap = a; a = b; b = swap; }
        break;
      case 3:
        if (a > b) { swap = a; a = b; b = swap; }
        if (b > c) { swap = b; b = c; c = swap; }
        break;
      case 7:
        if (a > c) { swap = a; a = c; c = swap; }
        if (b > d) { swap = b; b = d; d = swap; }
        if (b > c) { swap = b; b = c; c = swap; }
        break;
      case 11:
        if (a > c || (a === c && b > d)) { swap = a; a = c; c = swap; swap = b; b = d; d = swap; }
        break;
      case 13:
        if (b > c) { swap = b; b = c; c = swap; }
        if (c > d) { swap = c; c = d; d = swap; }
        break;
      default:
    }
    const found: Found = { q: Math.round(rel * 1e12), parts, depth: DEPTH[topo], distinct, topo, a, b, c, d };
    const heap = heaps[parts];
    if (heap.length >= keep && rank(found, heap[0]) >= 0) return;
    const member = parts < 3 ? (topo * radix + a + 1) * radix + b + 1
      : (((topo * radix + a + 1) * radix + b + 1) * radix + c + 1) * radix + d + 1;
    const known = members[parts];
    if (known.has(member)) return;
    known.add(member);
    if (heap.length < keep) {
      // Sift up.
      let at = heap.length;
      heap.push(found);
      while (at > 0) {
        const parent = (at - 1) >> 1;
        if (rank(heap[parent], found) >= 0) break;
        heap[at] = heap[parent];
        at = parent;
      }
      heap[at] = found;
    } else {
      // Replace the worst and sift down.
      const worst = heap[0];
      known.delete(worst.parts < 3 ? (worst.topo * radix + worst.a + 1) * radix + worst.b + 1
        : (((worst.topo * radix + worst.a + 1) * radix + worst.b + 1) * radix + worst.c + 1) * radix + worst.d + 1);
      let at = 0;
      for (;;) {
        let child = 2 * at + 1;
        if (child >= keep) break;
        if (child + 1 < keep && rank(heap[child + 1], heap[child]) > 0) child++;
        if (rank(heap[child], found) <= 0) break;
        heap[at] = heap[child];
        at = child;
      }
      heap[at] = found;
    }
    if (heap.length >= keep) limit[parts] = (Math.max(heap[0].q * 1e-12, EXACT) + 2 * TIE) * t * 1.000001;
  };

  // Progress: the work is counted in look-ups, of which there are about this many.
  const m = (n * (n + 1)) / 2;
  const perDomain = (maxParts > 1 ? n : 0) + (maxParts > 2 ? n * (mixed ? 2 : 1) : 0)
    + (maxParts > 3 ? 0.05 * m * (mixed ? 3 : 1) + (mixed ? 2 * n * n : 0) : 0);
  const total = n + perDomain * (mixed ? 2 : 1);
  let done = 0;
  const progress = () => Math.min(1, done / total);

  // One resistor.
  for (let k = 0; k < n; k++) {
    if (!used.allowTarget && Math.abs(v[k] - t) <= EXACT * t) continue;
    offer(1, 0, k, -1, -1, -1, v[k]);
  }
  done = n;

  // The networks whose outer group adds up: in ohms for series (`inv` false), in siemens for parallel (`inv` true).
  // X are the single values, A the pairs that add (the same kind as the outer group), B the pairs of the other kind.
  function* domain(inv: boolean): Generator<number, void, void> {
    const atoms = inv ? tables.atomsG : tables.atomsR;
    const X = atoms.x;
    const own = atoms.i;
    const tau = inv ? 1 / t : t;
    const A = tables.pairs && (inv ? tables.pairs.pg : tables.pairs.sr);
    const B = tables.pairs && (inv ? tables.pairs.sg : tables.pairs.pr);
    const s = inv ? 1 : 0;

    // Whether every network whose sum is above `sum` is further from the target than can be used, and the same for
    // every network whose sum is below it.
    const above = (sum: number, parts: number) => (inv ? t - 1 / sum : sum - t) > limit[parts];
    const below = (sum: number, parts: number) => (inv ? 1 / sum - t : t - sum) > limit[parts];

    const emit = (mode: number, table: Table, k: number, i1: number, i2: number, value: number) => {
      const i = table.i[k];
      const j = table.j[k];
      // In a table i ≤ j, which the order of the parts in `offer` relies on.
      if (mode === 1) offer(2, 1 + s, i1, i, -1, -1, value);
      else if (mode < 7) offer(3, mode + s, i1, i, j, -1, value);
      else offer(4, mode + s, i1, i2, i, j, value);
    };

    // Offers the entries of a table around position `lo` (the first that is not below the wanted value), outwards in
    // both directions for as long as the error is within the limit. The sum is base + x, or with `harmonic`
    // base + 1 / (y + 1 / x): both grow with x, so the error grows away from `lo`.
    const walk = (table: Table, harmonic: boolean, base: number, y: number, lo: number, parts: number, mode: number, i1: number, i2: number) => {
      const x = table.x;
      const size = x.length;
      for (let k = lo; k < size; k++) {
        const sum = harmonic ? base + 1 / (y + 1 / x[k]) : base + x[k];
        const value = inv ? 1 / sum : sum;
        if (Math.abs(value - t) > limit[parts]) break;
        emit(mode, table, k, i1, i2, value);
      }
      for (let k = lo - 1; k >= 0; k--) {
        const sum = harmonic ? base + 1 / (y + 1 / x[k]) : base + x[k];
        const value = inv ? 1 / sum : sum;
        if (Math.abs(value - t) > limit[parts]) break;
        emit(mode, table, k, i1, i2, value);
      }
    };

    // The same after a binary search for `wanted`.
    const scan = (table: Table, harmonic: boolean, base: number, y: number, wanted: number, parts: number, mode: number, i1: number, i2: number) => {
      const x = table.x;
      let lo = 0;
      let hi = x.length;
      if (!(wanted > x[0])) hi = 0;
      else if (wanted > x[hi - 1]) lo = hi;
      while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (x[mid] < wanted) lo = mid + 1;
        else hi = mid;
      }
      walk(table, harmonic, base, y, lo, parts, mode, i1, i2);
    };

    // A resistor with one more (two parts) or with a pair (three parts).
    function* single(table: Table, parts: number, mode: number, units: number): Generator<number, void, void> {
      const start = done;
      for (let a = 0; a < n; a++) {
        const xa = X[a];
        if (above(xa, parts)) break;
        scan(table, false, xa, 0, tau - xa, parts, mode, own[a], -1);
        if ((a & 63) === 63) {
          done = start + (units * a) / n;
          yield progress();
        }
      }
      done = start + units;
      yield progress();
    }

    // A pair with a pair. Both tables ascend, so the place of the wanted partner only moves down.
    function* pairs(first: Table, second: Table, mode: number): Generator<number, void, void> {
      const start = done;
      const x1 = first.x;
      const x2 = second.x;
      const smallest = x2[0];
      const largest = x2[m - 1];
      let lo = m;
      for (let k = 0; k < m; k++) {
        const p = x1[k];
        if (above(p + smallest, 4)) break;
        if (!below(p + largest, 4)) {
          const wanted = tau - p;
          while (lo > 0 && x2[lo - 1] >= wanted) lo--;
          walk(second, false, p, 0, lo, 4, mode, first.i[k], first.j[k]);
        }
        if ((k & 16383) === 16383) {
          done = start + (0.05 * k);
          yield progress();
        }
      }
      done = start + 0.05 * m;
      yield progress();
    }

    // A resistor with a group of the other kind, which is a resistor with a pair: three in a row (the pair is of
    // the other kind, B) or one beside two in a row (the pair is of this kind, A).
    function* nested(): Generator<number, void, void> {
      const start = done;
      for (let a = 0; a < n; a++) {
        const xa = X[a];
        if (above(xa, 4)) break;
        const rest = tau - xa;
        for (let b = 0; b < n; b++) {
          const xb = X[b];
          // The group is below its smallest part, so the sum is below xa + xb.
          if (below(xa + xb, 4)) continue;
          const yb = 1 / xb;
          const gap = rest > 0 ? 1 / rest - yb : -1;
          const wanted = rest <= 0 ? -Infinity : gap > 0 ? 1 / gap : Infinity;
          scan(B, true, xa, yb, wanted, 4, 13, own[a], own[b]);
          scan(A, true, xa, yb, wanted, 4, 15, own[a], own[b]);
        }
        done = start + 2 * n * (a + 1);
        yield progress();
      }
      done = start + 2 * n * n;
      yield progress();
    }

    if (maxParts > 1) yield* single(atoms, 2, 1, n);
    if (maxParts > 2) {
      yield* single(A, 3, 3, n);
      if (mixed) yield* single(B, 3, 5, n);
    }
    if (maxParts > 3) {
      yield* pairs(A, A, 7);
      if (mixed) {
        yield* pairs(A, B, 9);
        yield* pairs(B, B, 11);
        yield* nested();
      }
    }
  }

  if (connections !== 'parallel') yield* domain(false);
  if (connections !== 'series') yield* domain(true);
  done = total;
  yield 1;

  // The networks that were kept, as results.
  const combination = (found: Found): Combination => {
    const network = canonicalNetwork(build(found, v));
    const ohms = networkValue(network);
    const exact = Math.abs(ohms - t) <= EXACT * t;
    const errorOhms = exact ? 0 : ohms - t;
    return {
      network, key: networkKey(network), ohms, errorOhms, errorPct: (errorOhms / t) * 100, exact,
      parts: found.parts, distinct: found.distinct, depth: found.depth,
    };
  };
  const all: Found[] = [];
  for (let parts = 1; parts <= maxParts; parts++) {
    const sorted = heaps[parts].slice().sort(rank);
    all.push(...sorted);
    result.byParts[parts] = sorted.map(combination);
    result.best[parts] = result.byParts[parts][0] ?? null;
    let count = networkCount(n, parts, connections, reuse);
    if (parts === 1 && !used.allowTarget && list.some((value) => Math.abs(value - t) <= EXACT * t)) count--;
    result.consideredByParts[parts] = count;
    result.considered += count;
  }
  result.results = all.sort(rank).slice(0, keep).map(combination);
  result.ms = now() - started;
  return result;
}

// The search in one go. Blocks until it is done: seconds for four parts from a large list (see `runSearch`).
export function searchCombinations(target: number, values: ArrayLike<number>, options: SearchOptions = {}): SearchResult {
  const steps = searchSteps(target, values, options);
  for (;;) {
    const step = steps.next();
    if (step.done) return step.value;
  }
}

// Runs a search in slices of `sliceMs` with a pause between them, in which a worker receives its messages and a
// page stays alive. `onProgress` gets 0 to 1 after each slice. When `cancelled` says so after a pause, the search
// stops and the promise gives null.
export async function runSearch(
  steps: Generator<number, SearchResult, void>,
  sliceMs: number,
  onProgress?: (fraction: number) => void,
  cancelled?: () => boolean,
): Promise<SearchResult | null> {
  for (;;) {
    const end = now() + sliceMs;
    let fraction = 0;
    for (;;) {
      const step = steps.next();
      if (step.done) return step.value;
      fraction = step.value as number;
      if (now() >= end) break;
    }
    onProgress?.(fraction);
    await new Promise((resolve) => setTimeout(resolve, 0));
    if (cancelled?.()) return null;
  }
}
