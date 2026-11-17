// The page's side of the full-wave worker (engine.md §10, step M6.2b; the page uses it from M7): one run at a time, a
// new run cancels the running one (its promise gives null), progress and snapshot frames through callbacks, the
// refusal of the estimator's rules as a result of its own. Without a worker (none here, or it fails) the same handler
// (fdtd/job.ts) runs on the page in chunks.

import { createFdtdHandler } from './fdtd/job';
import type { FdtdJob, FdtdInfo, FdtdProgress, FdtdReply, FdtdRequest, FdtdResult } from './fdtd/job';
import type { Offer, Verdict } from './fdtd/estimate';
import type { Note } from './fdtd/model';
import { messageScheduler } from './jobs';

export type FdtdOutcome =
  | { kind: 'done'; result: FdtdResult; where: 'worker' | 'page' }
  | { kind: 'refused'; verdicts: Verdict[]; offer: Offer | null; notes: Note[] };
export interface FdtdCallbacks { started?: (info: FdtdInfo) => void; progress?: (p: FdtdProgress) => void }

interface Pending { id: number; job: FdtdJob; cb: FdtdCallbacks; resolve: (r: FdtdOutcome | null) => void; reject: (e: Error) => void }

export class FdtdClient {
  private worker: Worker | null = null;
  private page: ((req: FdtdRequest) => void) | null = null;
  private broken = false;
  private nextId = 0;
  private cur: Pending | null = null;
  where: 'worker' | 'page' | null = null;

  constructor(private opt: { worker?: boolean } = {}) {}

  private onReply = (msg: FdtdReply): void => {
    const c = this.cur;
    if (!c || msg.id !== c.id) return; // an overtaken run
    if (msg.type === 'started') { c.cb.started?.(msg.info); return; }
    if (msg.type === 'progress') { c.cb.progress?.(msg); return; }
    this.cur = null;
    if (msg.type === 'done') c.resolve({ kind: 'done', result: msg.result, where: this.where ?? 'page' });
    else if (msg.type === 'refused') c.resolve({ kind: 'refused', verdicts: msg.verdicts, offer: msg.offer, notes: msg.notes });
    else if (msg.type === 'error') c.reject(new Error(msg.message));
    else c.resolve(null);
  };

  private getWorker(): Worker | null {
    if (this.worker || this.broken || this.opt.worker === false) return this.worker;
    try {
      if (typeof Worker === 'undefined') throw new Error('No workers here.');
      // @ts-expect-error TypeScript takes this file for CommonJS, where import.meta is not allowed; the bundler needs exactly this form to build the worker as a file of its own.
      const w: Worker = new Worker(new URL('./fdtd.worker.ts', import.meta.url));
      w.onmessage = (event) => this.onReply(event.data as FdtdReply);
      w.onerror = (event) => { event.preventDefault?.(); this.giveUp(); };
      this.worker = w;
    } catch {
      this.broken = true;
      this.worker = null;
    }
    return this.worker;
  }

  // The worker failed: run the pending job on the page.
  private giveUp(): void {
    this.broken = true;
    this.worker?.terminate();
    this.worker = null;
    if (this.cur) this.send({ type: 'run', id: this.cur.id, job: this.cur.job });
  }

  private send(req: FdtdRequest): void {
    const w = this.getWorker();
    if (w) { this.where = 'worker'; w.postMessage(req); return; }
    if (!this.page) this.page = createFdtdHandler((msg) => this.onReply(msg), messageScheduler());
    this.where = 'page';
    this.page(req);
  }

  /** Runs a job; the running one is cancelled. Resolves null when cancelled or overtaken. */
  run(job: FdtdJob, cb: FdtdCallbacks = {}): Promise<FdtdOutcome | null> {
    this.cancel();
    const id = (this.nextId += 1);
    return new Promise((resolve, reject) => {
      this.cur = { id, job, cb, resolve, reject };
      this.send({ type: 'run', id, job });
    });
  }

  /** Cancels the running job (its promise gives null). */
  cancel(): void {
    const c = this.cur;
    if (!c) return;
    this.cur = null;
    this.send({ type: 'cancel', id: c.id });
    c.resolve(null);
  }

  /** Cancels and ends the worker. */
  stop(): void {
    this.cancel();
    this.worker?.terminate();
    this.worker = null;
  }
}
