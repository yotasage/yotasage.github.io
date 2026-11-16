// The page's side of the static worker (engine.md §10): jobs on named channels ('solve', 'field', 'sweep' …), where a
// new job cancels the channel's running one (the newest input wins; the old promise gives null), and results kept
// by the hash of the job (jobs.ts `canonical`, `hashOf`; the full key is compared on a hit), so going back to an input
// costs nothing. Without a worker (none here, or it fails) the same handler runs on the page, a slice per timer tick.

import type { StaticJob, StaticReply, StaticRequest } from './jobs';
import { buffersOf, canonical, createStaticHandler, hashOf, messageScheduler } from './jobs';

export type Place = 'worker' | 'page';

export interface RunResult<T> { result: T; cached: boolean; where: Place | 'cache' }

export type Progress = (done: number, total: number, partial?: unknown) => void;

interface Pending { id: number; channel: string; hash: string; key: string; resolve: (r: RunResult<unknown> | null) => void; reject: (e: Error) => void; progress?: Progress }

export interface ClientOptions { worker?: boolean; cacheBytes?: number; cacheEntries?: number }

export class StaticClient {
  private worker: Worker | null = null;
  private page: ((req: StaticRequest) => void) | null = null;
  private broken = false;
  private nextId = 0;
  private pending = new Map<string, Pending>(); // by channel
  private cache = new Map<string, { key: string; result: unknown; bytes: number }>();
  private bytes = 0;
  /** Where the last job ran. */
  where: Place | null = null;
  /** Counters for the harness and the page's status. */
  stats = { posted: 0, cancelled: 0, hits: 0, stale: 0 };

  constructor(private opt: ClientOptions = {}) {}

  private onReply = (msg: StaticReply): void => {
    let cur: Pending | null = null;
    for (const p of this.pending.values()) if (p.id === msg.id) { cur = p; break; }
    if (!cur) { this.stats.stale++; return; } // a job that was overtaken
    if (msg.type === 'progress') { cur.progress?.(msg.done, msg.total, msg.partial); return; }
    this.pending.delete(cur.channel);
    if (msg.type === 'done') {
      this.store(cur.hash, cur.key, msg.result);
      cur.resolve({ result: msg.result, cached: false, where: this.where ?? 'page' });
    } else if (msg.type === 'error') cur.reject(new Error(msg.message));
    else cur.resolve(null);
  };

  private store(hash: string, key: string, result: unknown): void {
    let bytes = key.length * 2 + 1024;
    for (const b of buffersOf(result)) bytes += b.byteLength;
    const max = this.opt.cacheBytes ?? 64 * 1024 * 1024;
    if (bytes > max) return;
    const old = this.cache.get(hash);
    if (old) { this.bytes -= old.bytes; this.cache.delete(hash); }
    this.cache.set(hash, { key, result, bytes });
    this.bytes += bytes;
    const maxN = this.opt.cacheEntries ?? 64;
    while (this.bytes > max || this.cache.size > maxN) {
      const [h, e] = this.cache.entries().next().value as [string, { bytes: number }];
      this.cache.delete(h);
      this.bytes -= e.bytes;
    }
  }

  private getWorker(): Worker | null {
    if (this.worker || this.broken || this.opt.worker === false) return this.worker;
    try {
      if (typeof Worker === 'undefined') throw new Error('No workers here.');
      // @ts-expect-error TypeScript takes this file for CommonJS, where import.meta is not allowed; the bundler needs exactly this form to build the worker as a file of its own.
      const w: Worker = new Worker(new URL('./static.worker.ts', import.meta.url));
      w.onmessage = (event) => this.onReply(event.data as StaticReply);
      w.onerror = (event) => { event.preventDefault?.(); this.giveUp(); };
      this.worker = w;
    } catch {
      this.broken = true;
      this.worker = null;
    }
    return this.worker;
  }

  // The worker failed: run everything pending on the page.
  private giveUp(): void {
    this.broken = true;
    this.worker?.terminate();
    this.worker = null;
    for (const p of this.pending.values()) this.send({ type: 'run', id: p.id, job: (p as Pending & { job: StaticJob }).job });
  }

  private send(req: StaticRequest): void {
    const w = this.getWorker();
    if (w) { this.where = 'worker'; w.postMessage(req); return; }
    if (!this.page) this.page = createStaticHandler((msg) => this.onReply(msg), messageScheduler());
    this.where = 'page';
    this.page(req);
  }

  /** Cancels the channel's running job (its promise gives null). */
  cancel(channel: string): void {
    const p = this.pending.get(channel);
    if (!p) return;
    this.pending.delete(channel);
    this.stats.cancelled++;
    this.send({ type: 'cancel', id: p.id });
    p.resolve(null);
  }

  /** The cached result of a job, if any (no work started). */
  cached<T>(job: StaticJob): T | undefined {
    const key = canonical(job);
    const hit = this.cache.get(hashOf(key));
    return hit && hit.key === key ? (hit.result as T) : undefined;
  }

  /**
   * Runs a job on a channel: the channel's previous job is cancelled; a job seen before resolves at once from the
   * cache. Resolves null when overtaken or cancelled.
   */
  run<T>(channel: string, job: StaticJob, progress?: Progress): Promise<RunResult<T> | null> {
    this.cancel(channel);
    const key = canonical(job);
    const hash = hashOf(key);
    const hit = this.cache.get(hash);
    if (hit && hit.key === key) {
      this.stats.hits++;
      this.cache.delete(hash); this.cache.set(hash, hit); // newest
      return Promise.resolve({ result: hit.result as T, cached: true, where: 'cache' });
    }
    const id = (this.nextId += 1);
    return new Promise((resolve, reject) => {
      const p = { id, channel, hash, key, resolve: resolve as (r: RunResult<unknown> | null) => void, reject, progress, job };
      this.pending.set(channel, p);
      this.stats.posted++;
      this.send({ type: 'run', id, job });
    });
  }

  /** Cancels everything and ends the worker. */
  stop(): void {
    for (const c of Array.from(this.pending.keys())) this.cancel(c);
    this.worker?.terminate();
    this.worker = null;
  }
}
