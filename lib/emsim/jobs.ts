// The static worker's jobs and message handling (step M1.5, engine.md §10), as plain functions so that the harness runs
// them in Node and the client runs them on the page when no worker can be made. static.worker.ts only wires
// `createStaticHandler` to its scope.
//
// Protocol. In: { type: 'run', id, job } queues a job; { type: 'cancel', id } drops it (running or queued).
// Out: { type: 'progress', id, done, total, partial? } (a field job's partial is a whole grid, coarse first),
//      { type: 'done', id, result }, { type: 'error', id, message }, { type: 'cancelled', id }.
// Jobs run one at a time in slices of SLICE_MS; between slices the handler lets messages in (`schedule`), so a cancel
// stops a running job at its next yield. Solves are kept by the hash of (setup, options) for the field jobs (the four
// newest), so a field map after a solve of the same input does not solve again.

import type { Setup } from './setup';
import type { LineResults, SolveOptions } from './lines';
import { setupSection, solveSetup } from './lines';
import type { EvalOptions, McOptions } from './vary';
import { corners, monteCarlo, sweep, MC_SAMPLES } from './vary';
import type { InverseKey, InverseOptions, InverseVary } from './inverse';
import { inverse } from './inverse';
import type { DriveName, FieldGrid, FieldKind, GridOptions, Surface, View } from './fields';
import { electric, fieldGrid, fieldModel, magnetic, modeDrive, namedDrive, sectionMedia, surface } from './fields';
import type { Contour } from './fieldlines';
import { contours, fieldLines, levelsBetween } from './fieldlines';

export const JOBS_VERSION = 1;
export const SLICE_MS = 40;

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

/** Solves kept for field jobs: the newest few, by hash. */
export class SolveCache {
  private map = new Map<string, { key: string; r: LineResults }>();
  constructor(private size = 4) {}
  get(setup: Setup, opt: SolveOptions = {}): LineResults {
    const key = canonical({ setup, opt });
    const h = hashOf(key);
    const hit = this.map.get(h);
    if (hit && hit.key === key) { this.map.delete(h); this.map.set(h, hit); return hit.r; }
    const r = solveSetup(setup, opt);
    this.map.set(h, { key, r });
    while (this.map.size > this.size) this.map.delete(this.map.keys().next().value);
    return r;
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
      return stripped(cache.get(job.setup, job.opt ?? {}));
    case 'sweep': {
      const g = sweep(job.setup, job.input, job.xs, job.opt ?? {});
      for (;;) { const s = g.next(); if (s.done) return s.value; yield { done: s.value as number, total: job.xs.length }; }
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
 * The message handler: call it with each request; it answers through post (with the buffers to transfer for a
 * result) and continues its work through schedule (setTimeout in a worker, so that messages get in between slices).
 */
export function createStaticHandler(post: (msg: StaticReply, transfer?: ArrayBuffer[]) => void, schedule: (fn: () => void) => void, sliceMs = SLICE_MS): (req: StaticRequest) => void {
  const queue: { id: number; job: StaticJob }[] = [];
  const cancelled = new Set<number>();
  const cache = new SolveCache();
  let current: { id: number; gen: Generator<JobProgress, unknown> } | null = null;
  let scheduled = false;
  const kick = () => { if (!scheduled) { scheduled = true; schedule(pump); } };
  function pump(): void {
    scheduled = false;
    const t0 = now();
    while (now() - t0 < sliceMs) {
      if (!current) {
        const next = queue.shift();
        if (!next) return;
        current = { id: next.id, gen: runJob(next.job, cache) };
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
      if (p.partial !== undefined) break; // let the picture go out
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
