// The full-wave worker's protocol and work (step M6.2b, engine.md §10, fullwave.md §7, §11.4), framework-free: the
// worker (fdtd.worker.ts) wires `createFdtdHandler` to its messages, the client (fdtdClient.ts) runs the same handler
// on the page when no worker can be made, and the harness calls it directly.
//
// One run at a time: a new 'run' cancels the running one (it answers 'cancelled'). A run builds the problem (refused
// with the estimator's reasons and its coarser-mesh offer when §11.4's rules refuse it), then steps each excitation
// in chunks of about CHUNK_MS, yielding between chunks through `schedule` so a 'cancel' gets in; after each chunk it
// posts progress (step of the cap, elapsed and estimated remaining ms, the energy level) with the new record rows and
// the snapshot frames taken since (both transferred). The result holds the records (to post-process again at another
// rise time), the N-port, the TDRs at the asked rise times, the feeds' εeff and the run's notes.
//
//   page → worker: { type: 'run', id, job: FdtdJob } | { type: 'cancel', id }
//   worker → page: 'refused' { verdicts, offer, notes } | 'started' { info } | 'progress' { …FdtdProgress }
//                  | 'done' { result: FdtdResult } | 'error' { message } | 'cancelled'

import { buildProblem } from './problem';
import type { Problem } from './problem';
import type { ModelOptions, Note } from './model';
import { RATES } from './estimate';
import type { Env, Offer, Verdict } from './estimate';
import { bandOf, drivesOf, Excitation, feedEeff, newRecords, nportOf, RECORD, stepsCap, tdrOf } from './run';
import type { Records } from './run';
import { SnapRecorder } from './snapshots';
import type { Frame, SliceInfo, SnapSpec } from './snapshots';
import type { NPort } from '../nport';
import type { TdrResult } from '../tdr';
import type { Setup } from '../setup';

export const CHUNK_MS = 100;

export interface FdtdJob {
  setup: Setup; kind: 'trace' | 'via';
  model?: ModelOptions; // trMin, length, z0 …
  precision?: 'f32' | 'f64';
  env?: Env; rate?: number; // the refusal rules' environment (default JavaScript) and cell updates per second
  mode?: 'full' | 'tdr'; // each port in turn (default), or port 1 alone
  nf?: number; // S-parameter points over 0 … f_S (default 201)
  tr?: number[]; // rise times of the TDRs (default [tr_min])
  snapshots?: SnapSpec | null; // of the first excitation
  maxSteps?: number; stopDb?: number;
}
export interface FdtdInfo { cells: number; steps: number; dt: number; runs: number; ports: string[]; seconds: number; slices: SliceInfo[]; every: number; frames: number; snapBytes: number }
export interface FdtdProgress {
  run: number; runs: number; step: number; steps: number; // the excitation (from 0) and its step of its cap
  elapsed: number; eta: number; // ms
  energyDb: number; // the last energy sum under its maximum (dB, ≤ 0)
  from: number; rows: Float64Array; // record rows from row `from` of this run (RECORD values per port)
  frames: Frame[];
}
export interface FdtdResult {
  records: Records; nport: NPort & { known: boolean[] }; tdr: TdrResult[];
  eeff: ReturnType<typeof feedEeff>;
  status: string[]; steps: number[]; ms: number; notes: Note[];
  snap: { slices: SliceInfo[]; every: number; frames: number; max: number[]; bytes: number } | null;
}
export type FdtdRequest = { type: 'run'; id: number; job: FdtdJob } | { type: 'cancel'; id: number };
export type FdtdReply =
  | { type: 'refused'; id: number; verdicts: Verdict[]; offer: Offer | null; notes: Note[] }
  | { type: 'started'; id: number; info: FdtdInfo }
  | ({ type: 'progress'; id: number } & FdtdProgress)
  | { type: 'done'; id: number; result: FdtdResult }
  | { type: 'error'; id: number; message: string }
  | { type: 'cancelled'; id: number };

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

interface Current {
  id: number; job: FdtdJob; p: Problem; rec: Records; drives: number[][]; run: number; x: Excitation; snap: SnapRecorder | null;
  t0: number; sent: number; notes: Note[];
}

export function createFdtdHandler(post: (msg: FdtdReply, transfer?: ArrayBuffer[]) => void, schedule: (fn: () => void) => void, chunkMs = CHUNK_MS): (req: FdtdRequest) => void {
  let cur: Current | null = null;
  let scheduled = false;
  const kick = () => { if (!scheduled) { scheduled = true; schedule(pump); } };

  function start(id: number, job: FdtdJob): void {
    const b = buildProblem(job.setup, job.kind, { ...job.model, precision: job.precision ?? 'f32', env: job.env ?? { backend: 'js' }, rate: job.rate ?? RATES.js });
    if (!b.ok || !b.problem) { post({ type: 'refused', id, verdicts: b.verdicts, offer: b.offer, notes: b.notes }); return; }
    const p = b.problem, rec = newRecords(p), drives = drivesOf(p.ports.length, job.mode ?? 'full');
    const snap = job.snapshots?.slices?.length ? new SnapRecorder(p, job.snapshots, stepsCap(p, job.maxSteps)) : null;
    const x = new Excitation(p, drives[0], { maxSteps: job.maxSteps, stopDb: job.stopDb, snap });
    const sp = snap?.plan;
    post({ type: 'started', id, info: { cells: p.N, steps: x.cap, dt: p.dt, runs: drives.length, ports: rec.ports.map((q) => q.name), seconds: b.est.seconds, slices: sp?.slices ?? [], every: sp?.every ?? 0, frames: sp?.frames ?? 0, snapBytes: sp?.bytes ?? 0 } });
    cur = { id, job, p, rec, drives, run: 0, x, snap, t0: now(), sent: 0, notes: b.notes };
    kick();
  }

  function pump(): void {
    scheduled = false;
    const c = cur;
    if (!c) return;
    try {
      const t0 = now();
      while (now() - t0 < chunkMs && c.x.status === 'running') c.x.advance(10);
      progress(c);
      if (c.x.status !== 'running') {
        c.rec.runs.push(c.x.record());
        if (c.run + 1 < c.drives.length) {
          c.run++; c.sent = 0;
          c.x = new Excitation(c.p, c.drives[c.run], { maxSteps: c.job.maxSteps, stopDb: c.job.stopDb });
        } else { finish(c); return; }
      }
    } catch (e) {
      cur = null;
      post({ type: 'error', id: c.id, message: String((e && (e as Error).message) || e) });
      return;
    }
    kick();
  }

  function progress(c: Current): void {
    const P = c.p.ports.length, W = P * RECORD, x = c.x;
    const rows = x.rec.slice(c.sent * W, x.rows * W);
    const from = c.sent;
    c.sent = x.rows;
    const frames = c.run === 0 && c.snap ? c.snap.drain() : [];
    const elapsed = now() - c.t0;
    const done = c.rec.runs.reduce((a, r) => a + r.rows - 1, 0) + x.step;
    const total = c.rec.runs.reduce((a, r) => a + r.rows - 1, 0) + x.cap * (c.drives.length - c.run);
    const e = x.loop.energy, w = e.length ? e[e.length - 1][1] : 0;
    const msg: FdtdReply = {
      type: 'progress', id: c.id, run: c.run, runs: c.drives.length, step: x.step, steps: x.cap, elapsed,
      eta: done > 0 ? (elapsed / done) * Math.max(0, total - done) : NaN,
      energyDb: w > 0 && x.loop.wMax > 0 ? 10 * Math.log10(w / x.loop.wMax) : -Infinity, from, rows, frames,
    };
    post(msg, [rows.buffer as ArrayBuffer, ...frames.flatMap((f) => [...f.data.map((d) => d.buffer as ArrayBuffer), f.scale.buffer as ArrayBuffer])]);
  }

  function finish(c: Current): void {
    cur = null;
    const r = c.rec, j = c.job;
    const nport = nportOf(r, bandOf(r, j.nf));
    const tdr = (j.tr ?? [r.trMin]).map((tr) => tdrOf(r, Math.max(tr, r.trMin)));
    const notes = [...c.notes];
    const eeff = feedEeff(r);
    eeff.forEach((e, q) => { if (e.flag) notes.push({ level: 'warning', code: 'eeff', message: `Port ${r.ports[q].name}: the feed's εeff from the run is ${e.eeff.toFixed(3)}, the 2D solver's ${e.eeff2d.toFixed(3)} (${(e.diff * 100).toFixed(1)} %).` }); });
    r.runs.forEach((x, q) => {
      if (x.status === 'unstable') notes.push({ level: 'error', code: 'unstable', message: `Excitation ${q + 1} became unstable; its results are not valid.` });
      else if (x.status === 'done') notes.push({ level: 'info', code: 'not-settled', message: `Excitation ${q + 1} reached the run's length before its energy fell 50 dB.` });
    });
    const s = c.snap;
    const result: FdtdResult = {
      records: r, nport, tdr, eeff, status: r.runs.map((x) => x.status), steps: r.runs.map((x) => x.rows - 1), ms: now() - c.t0, notes,
      snap: s ? { slices: s.plan.slices, every: s.plan.every, frames: s.count, max: Array.from(s.max), bytes: s.bytes } : null,
    };
    post({ type: 'done', id: c.id, result }, r.runs.map((x) => x.rec.buffer as ArrayBuffer));
  }

  return (req) => {
    if (!req || typeof req !== 'object') return;
    if (req.type === 'cancel') {
      if (cur && cur.id === req.id) { cur = null; post({ type: 'cancelled', id: req.id }); }
      return;
    }
    if (req.type === 'run') {
      if (cur) { post({ type: 'cancelled', id: cur.id }); cur = null; }
      try { start(req.id, req.job); } catch (e) { post({ type: 'error', id: req.id, message: String((e && (e as Error).message) || e) }); }
    }
  };
}
