// The static worker's jobs and message handling (step M1.5, engine.md §10), as plain functions so that the harness runs
// them in Node and the client runs them on the page when no worker can be made. static.worker.ts only wires
// `createStaticHandler` to its scope.
//
// Protocol. In: { type: 'run', id, job } queues a job; { type: 'cancel', id } drops it (running or queued).
// Out: { type: 'progress', id, done, total, partial? } (a field job's partial is a whole grid, coarse first),
//      { type: 'done', id, result }, { type: 'error', id, message }, { type: 'cancelled', id }.
// Jobs run one at a time in slices of SLICE_MS; between slices the handler lets messages in (`schedule`), so a cancel
// stops a running job at its next yield. A job that has shown a picture (posted a partial) and is refining runs in
// slices of REFINE_SLICE_MS and gives way at its next yield to any queued job that has not shown one yet, so a new map
// or solve does not wait for another map's refinement. Solves are kept by the hash of (setup, options) for the field jobs (the four
// newest), so a field map after a solve of the same input does not solve again.

import type { Setup } from './setup';
import type { LineResults, SolveOptions } from './lines';
import { setupSection, solveSetup } from './lines';
import type { EvalOptions, McOptions, SweepPoint } from './vary';
import { corners, monteCarlo, sweep, MC_SAMPLES } from './vary';
import type { InverseKey, InverseOptions, InverseVary } from './inverse';
import { inverse } from './inverse';
import type { DriveName, FieldGrid, FieldKind, GridOptions, Surface, View } from './fields';
import { electric, fieldGrid, fieldModel, magnetic, modeDrive, namedDrive, sectionMedia, surface } from './fields';
import type { Contour } from './fieldlines';
import { contours, fieldLines, levelsBetween } from './fieldlines';
import type { ViaModelOptions, ViaTargetKey, ViaTargetVary } from './viamodel';
import { viaModel, viaTarget } from './viamodel';
import type { ViaFieldSpec } from './viafield';
import { viaFieldJob } from './viafield';

export const JOBS_VERSION = 1;
export const SLICE_MS = 40;
export const REFINE_SLICE_MS = 4; // a refining job's slice (after its first picture), so new requests get in soon
export const PARTIAL_MS = 50; // M2.3a: a sweep's new points go out at most this often

/** A sweep job's partial (M2.3a): the points from index `from` on, made since the last partial. */
export interface SweepPartial { from: number; points: SweepPoint[] }

export type DriveSpec = { values: number[] } | { name: DriveName; line?: number } | { mode: number };

export interface FieldJob {
  kind: 'field';
  setup: Setup;
  opt?: SolveOptions;
  field?: FieldKind; // default 'E'
  drive: DriveSpec;
  view: View;
  grid?: GridOptions;
  contours?: number; // equipotentials (E) or H lines (contours of Az): how many levels (default 10, 0 for none)
  lines?: { count?: number; perCharge?: number; tol?: number } | null; // E field lines (default 24; null for none)
}

export type StaticJob =
  | { kind: 'solve'; setup: Setup; opt?: SolveOptions }
  | { kind: 'sweep'; setup: Setup; input: string; xs: number[]; opt?: EvalOptions }
  | { kind: 'corners'; setup: Setup; opt?: EvalOptions & { keys?: string[] } }
  | { kind: 'montecarlo'; setup: Setup; opt?: McOptions }
  | { kind: 'inverse'; setup: Setup; key: InverseKey; target: number; vary?: InverseVary; opt?: InverseOptions }
  | { kind: 'via'; setup: Setup; opt?: ViaModelOptions } // M1.7: the via model of the setup's via with its trace as feeds
  | { kind: 'via-target'; setup: Setup; key: ViaTargetKey; target: number; vary: ViaTargetVary; opt?: ViaModelOptions }
  | ({ kind: 'via-field'; setup: Pick<Setup, 'stackup' | 'via'> } & ViaFieldSpec) // M3.2b: the via's side or top field map (viafield.ts)
  | FieldJob;

export interface FieldResult {
  ok: boolean;
  reason: string;
  drive: number[]; // voltages (E) or currents (H) per signal
  grid: FieldGrid | null;
  contours: Contour[];
  lines: Float32Array[];
  perCharge: number; // C/m per field line
  surface: Surface | null;
  lineResults: LineResults | null; // without the solver's levels
  ms: number;
}

export type StaticRequest = { type: 'run'; id: number; job: StaticJob } | { type: 'cancel'; id: number };
export type StaticReply =
  | { type: 'progress'; id: number; done: number; total: number; partial?: unknown }
  | { type: 'done'; id: number; result: unknown }
  | { type: 'error'; id: number; message: string }
  | { type: 'cancelled'; id: number };

export interface JobProgress { done: number; total: number; partial?: unknown }

// ---- Hashing (shared with the client) ----

/** The canonical JSON of a value: object keys sorted, typed arrays as arrays. */
export function canonical(x: unknown): string {
  if (x === null || typeof x !== 'object') return JSON.stringify(x ?? null);
  if (ArrayBuffer.isView(x)) return JSON.stringify(Array.from(x as unknown as ArrayLike<number>));
  if (Array.isArray(x)) return `[${x.map(canonical).join(',')}]`;
  const o = x as Record<string, unknown>;
  return `{${Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`).join(',')}}`;
}

/** A 64-bit FNV-1a hash of a string, as 16 hex digits (two 32-bit lanes). */
export function hashOf(s: string): string {
  let a = 0x811c9dc5, b = 0x01000193 ^ 0x5bd1e995;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193);
    b = Math.imul(b ^ c, 0x5bd1e995) ^ (b >>> 15);
  }
  return (a >>> 0).toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0');
}

// ---- Jobs ----

const stripped = (r: LineResults | null): LineResults | null => (r ? { ...r, bem: null } : r);

/** M2.1b: a solve job's result: the line results without the solver's levels, with the per-unit-length matrices. */
export interface Matrices {
  C: number[][]; C0: number[][]; L: number[][]; errC: number[][]; errC0: number[][]; errL: number[][];
  /** M2.4c: each level's C, C0 and L, coarse to fine (the theory's error and order, eqvalues.levelSeries). */
  levels: { C: Float64Array; C0: Float64Array; L: Float64Array }[];
}
export type SolveResult = LineResults & { matrices: Matrices | null };
const withMatrices = (r: LineResults | null): SolveResult | null => {
  if (!r) return null;
  const b = r.bem;
  const matrices = b && b.ok ? { C: b.C, C0: b.C0, L: b.L, errC: b.errC, errC0: b.errC0, errL: b.errL, levels: b.levels.map((lv) => ({ C: lv.C.slice(), C0: lv.C0.slice(), L: lv.L.slice() })) /* copies: the worker transfers what it sends, and the cached solve keeps its own */ } : null;
  return { ...r, bem: null, matrices };
};

/** Solves kept for field jobs and the via's feeds: the newest few, by the hash of what a solve reads (stackup, trace, options). */
export class SolveCache {
  private map = new Map<string, { key: string; r: LineResults }>();
  constructor(private size = 4) {}
  get(setup: Setup, opt: SolveOptions = {}): LineResults {
    const key = canonical({ stackup: setup.stackup, trace: setup.trace, opt });
    const h = hashOf(key);
    const hit = this.map.get(h);
    if (hit && hit.key === key) { this.map.delete(h); this.map.set(h, hit); return hit.r; }
    const r = solveSetup(setup, opt);
    this.map.set(h, { key, r });
    while (this.map.size > this.size) this.map.delete(this.map.keys().next().value);
    return r;
  }
  /** BL197: the solve of a trace at the default options if it is kept, else null (nothing is solved or kept). */
  peek(stackup: Setup['stackup'], trace: Setup['trace']): LineResults | null {
    const key = canonical({ stackup, trace, opt: {} });
    const hit = this.map.get(hashOf(key));
    return hit && hit.key === key ? hit.r : null;
  }
}

function resolveDrive(spec: DriveSpec, r: LineResults, field: FieldKind): number[] {
  if ('values' in spec) return spec.values.slice(0, r.n).concat(new Array(Math.max(0, r.n - spec.values.length)).fill(0));
  if ('mode' in spec) return modeDrive(r, spec.mode, field);
  return namedDrive(r.n, spec.name, spec.line ?? 1, field);
}

function* fieldJob(job: FieldJob, cache: SolveCache): Generator<JobProgress, FieldResult> {
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const fail = (reason: string): FieldResult => ({ ok: false, reason, drive: [], grid: null, contours: [], lines: [], perCharge: 0, surface: null, lineResults: null, ms: 0 });
  const r = cache.get(job.setup, job.opt ?? {});
  if (!r.ok || !r.bem) return fail(r.reason || 'No solution.');
  const sec = setupSection(job.setup);
  if (typeof sec === 'string') return fail(sec);
  const model = fieldModel(r.bem, sectionMedia(sec));
  if (typeof model === 'string') return fail(model);
  const field = job.field ?? 'E';
  const drive = resolveDrive(job.drive, r, field);
  const src = field === 'E' ? electric(model, drive) : magnetic(model, drive);
  if (typeof src === 'string') return fail(src);
  const gen = fieldGrid(src, job.view, job.grid ?? {});
  let grid: FieldGrid;
  for (;;) {
    const s = gen.next();
    if (s.done) { grid = s.value; break; }
    yield { done: 0, total: 1, partial: s.value };
  }
  const nLevels = job.contours ?? 10;
  let levels: number[] = [];
  if (nLevels > 0) {
    let lo = Infinity, hi = -Infinity;
    if (field === 'E') for (const v of src.pot) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
    else for (let i = 0; i < grid.phi.length; i++) { const v = grid.phi[i]; if (v < lo) lo = v; if (v > hi) hi = v; }
    if (hi > lo) levels = levelsBetween(lo, hi, nLevels);
  }
  const cs = contours(grid, levels);
  let lines: Float32Array[] = [];
  let perCharge = 0;
  if (field === 'E' && job.lines !== null) {
    const fl = fieldLines(src, { view: job.view, ...(job.lines ?? {}) });
    lines = fl.lines;
    perCharge = fl.perCharge;
  }
  const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  return { ok: true, reason: '', drive, grid, contours: cs, lines, perCharge, surface: surface(src), lineResults: stripped(r), ms: t1 - t0 };
}

/** A job as a generator of progress, returning its result (what the worker posts). */
export function* runJob(job: StaticJob, cache: SolveCache = new SolveCache()): Generator<JobProgress, unknown> {
  switch (job.kind) {
    case 'solve':
      return withMatrices(cache.get(job.setup, job.opt ?? {}));
    case 'sweep': {
      // M2.3a: the points made since the last partial go out at most every PARTIAL_MS (the first at once), as
      // { from, points }, so the page draws the sweep as it goes.
      const pts: SweepPoint[] = [];
      let sent = 0, last = -Infinity;
      const g = sweep(job.setup, job.input, job.xs, job.opt ?? {}, (p) => { pts.push(p); });
      for (;;) {
        const s = g.next();
        if (s.done) return s.value;
        const t = now();
        if (pts.length > sent && t - last >= PARTIAL_MS) {
          yield { done: s.value as number, total: job.xs.length, partial: { from: sent, points: pts.slice(sent) } as SweepPartial };
          sent = pts.length; last = t;
        } else yield { done: s.value as number, total: job.xs.length };
      }
    }
    case 'corners': {
      const g = corners(job.setup, job.opt ?? {});
      for (;;) { const s = g.next(); if (s.done) return s.value; yield { done: s.value as number, total: NaN }; }
    }
    case 'montecarlo': {
      const g = monteCarlo(job.setup, job.opt ?? {});
      const total = job.opt?.samples ?? MC_SAMPLES;
      for (;;) { const s = g.next(); if (s.done) return s.value; yield { done: s.value as number, total }; }
    }
    case 'inverse': {
      const r = inverse(job.setup, job.key, job.target, job.vary ?? 'w', job.opt ?? {});
      return { ...r, result: stripped(r.result) };
    }
    case 'field':
      return yield* fieldJob(job, cache);
    case 'via':
      return viaModel(job.setup.stackup, job.setup.via, job.setup.trace, { ...job.opt, solved: (st, tr) => cache.peek(st, tr) });
    case 'via-target':
      return viaTarget(job.setup.stackup, job.setup.via, job.setup.trace, job.key, job.target, job.vary, { ...job.opt, solved: (st, tr) => cache.peek(st, tr) });
    case 'via-field': {
      const g = viaFieldJob(job.setup.stackup, job.setup.via, job);
      for (;;) {
        const st = g.next();
        if (st.done) return st.value;
        yield st.value ? { done: 0, total: 1, partial: st.value } : { done: 0, total: 1 };
      }
    }
    default:
      throw new Error(`Unknown job ${(job as { kind: string }).kind}.`);
  }
}

/** The ArrayBuffers of the typed arrays in a value (a few levels deep), for transferring it. */
export function buffersOf(x: unknown, out: Set<ArrayBuffer> = new Set(), depth = 0): ArrayBuffer[] {
  if (x && typeof x === 'object' && depth < 5) {
    if (ArrayBuffer.isView(x)) { if (x.buffer instanceof ArrayBuffer && x.byteLength === x.buffer.byteLength) out.add(x.buffer); }
    else if (Array.isArray(x)) for (const v of x) buffersOf(v, out, depth + 1);
    else for (const k of Object.keys(x)) buffersOf((x as Record<string, unknown>)[k], out, depth + 1);
  }
  return Array.from(out);
}

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/**
 * A scheduler for createStaticHandler that runs the next slice as soon as the messages waiting before it are in: a
 * MessageChannel task, which is not held back like nested setTimeout(0) (4 ms each after five levels), so the short
 * slices of refining jobs cost next to nothing. setTimeout where there is no MessageChannel.
 */
export function messageScheduler(): (fn: () => void) => void {
  if (typeof MessageChannel === 'undefined') return (fn) => { setTimeout(fn, 0); };
  const ch = new MessageChannel();
  const fns: (() => void)[] = [];
  // Node: a port with a listener keeps the process alive, so it is held (ref) only while a slice waits
  const port = ch.port1 as MessagePort & { ref?: () => void; unref?: () => void };
  port.onmessage = () => { const f = fns.shift(); if (!fns.length) port.unref?.(); if (f) f(); };
  port.unref?.();
  return (fn) => { fns.push(fn); port.ref?.(); ch.port2.postMessage(0); };
}

/**
 * The message handler: call it with each request; it answers through post (with the buffers to transfer for a
 * result) and continues its work through schedule (setTimeout in a worker, so that messages get in between slices).
 */
const FIRST_KINDS: ReadonlySet<StaticJob['kind']> = new Set(['solve', 'field', 'via-field']);

export function createStaticHandler(post: (msg: StaticReply, transfer?: ArrayBuffer[]) => void, schedule: (fn: () => void) => void, sliceMs = SLICE_MS): (req: StaticRequest) => void {
  // shown: the job has posted a partial (a picture); jobs that have not are run first
  const queue: { id: number; job: StaticJob; gen?: Generator<JobProgress, unknown>; shown?: boolean }[] = [];
  const cancelled = new Set<number>();
  const cache = new SolveCache();
  let current: { id: number; gen: Generator<JobProgress, unknown>; shown: boolean } | null = null;
  let scheduled = false;
  const kick = () => { if (!scheduled) { scheduled = true; schedule(pump); } };
  // Of the jobs that have shown nothing yet, the main result and the maps' first pictures (a few ms each) go first, then
  // the rest in order (M9.2: a via model after a typed width, 40 ms and not sliced, held the field map's first picture
  // back to 70 ms; now the picture comes first and the via's result about 10 ms later).
  const unshown = () => {
    let any = -1;
    for (let k = 0; k < queue.length; k++) {
      const q = queue[k];
      if (q.shown) continue;
      if (q.job && FIRST_KINDS.has(q.job.kind)) return k;
      if (any < 0) any = k;
    }
    return any;
  };
  function pump(): void {
    scheduled = false;
    const t0 = now();
    while (now() - t0 < (current && current.shown ? Math.min(sliceMs, REFINE_SLICE_MS) : sliceMs)) {
      if (!current) {
        if (!queue.length) return;
        const k = unshown();
        const next = queue.splice(k >= 0 ? k : 0, 1)[0];
        current = { id: next.id, gen: next.gen ?? runJob(next.job, cache), shown: !!next.shown };
      }
      const id = current.id;
      if (cancelled.has(id)) { cancelled.delete(id); current = null; post({ type: 'cancelled', id }); continue; }
      let step: IteratorResult<JobProgress, unknown>;
      try {
        step = current.gen.next();
      } catch (e) {
        current = null;
        post({ type: 'error', id, message: String((e && (e as Error).message) || e) });
        continue;
      }
      if (step.done) {
        current = null;
        post({ type: 'done', id, result: step.value }, buffersOf(step.value));
        continue;
      }
      const p = step.value as JobProgress;
      post(p.partial !== undefined ? { type: 'progress', id, done: p.done, total: p.total, partial: p.partial } : { type: 'progress', id, done: p.done, total: p.total });
      if (p.partial !== undefined) {
        // let the picture go out; a job waiting behind gets its turn first (M3.2b: the via's two maps both show their
        // first picture before either refines)
        current.shown = true;
        if (queue.length) { queue.push({ id, job: null, gen: current.gen, shown: true }); current = null; }
        break;
      }
      // a refining job gives way to a job that has not shown its first picture yet
      if (current.shown && unshown() >= 0) { queue.push({ id, job: null, gen: current.gen, shown: true }); current = null; }
    }
    if (current || queue.length) kick();
  }
  return (req) => {
    if (!req || typeof req !== 'object') return;
    if (req.type === 'cancel') {
      const k = queue.findIndex((q) => q.id === req.id);
      if (k >= 0) { queue.splice(k, 1); post({ type: 'cancelled', id: req.id }); return; }
      if (current && current.id === req.id) cancelled.add(req.id);
      return;
    }
    if (req.type === 'run') { queue.push({ id: req.id, job: req.job }); kick(); }
  };
}
