// Runs the Smith chart's slow solves and its suggestions in Web Workers (solve.worker.ts, step M4.4a), so no frame of
// the page waits for the solver's grid search (up to about 100 ms). After lib/resistor/combineClient.ts and
// designClient.ts: two channels, each with a worker of its own, so a slow solve never delays the suggestions or the
// other way round. Per channel one request counts at a time: a new one overtakes the one before, whose promise gives
// null. Where a worker cannot be made (or fails), the job runs on the page after a pause (and not while `busy`), as
// the Solve panel did before M4.4a.

import { runJob } from './solveJob';
import type { SolveJob, SolveReply } from './solveJob';
import type { SolveResult } from './solve';
import type { SuggestOptions, Suggestions } from './suggest';
import type { Circuit } from './state';

export type Place = 'worker' | 'page';

interface Job {
  id: number;
  job: SolveJob;
  busy?: () => boolean;
  timer?: ReturnType<typeof setTimeout>;
  resolve: (reply: { reply: SolveReply; where: Place } | null) => void;
  reject: (error: Error) => void;
}

/** On the page a job waits this long after the request (and again while `busy`), so a burst of edits runs one. */
export const PAGE_WAIT_MS = 150;

class Channel {
  private worker: Worker | null = null;
  private broken = false;
  private nextId = 0;
  private job: Job | null = null;
  /** Where the last request ran (null before the first). */
  place: Place | null = null;

  private runOnPage(current: Job): void {
    this.place = 'page';
    const go = (): void => {
      if (this.job !== current) return;
      if (current.busy?.()) { current.timer = setTimeout(go, PAGE_WAIT_MS); return; }
      this.job = null;
      try {
        current.resolve({ reply: runJob(current.job), where: 'page' });
      } catch (error) {
        current.reject(error instanceof Error ? error : new Error(String(error)));
      }
    };
    current.timer = setTimeout(go, PAGE_WAIT_MS);
  }

  private giveUp(): void {
    this.broken = true;
    this.worker?.terminate();
    this.worker = null;
    if (this.job) this.runOnPage(this.job);
  }

  private getWorker(): Worker | null {
    if (this.worker || this.broken) return this.worker;
    try {
      if (typeof Worker === 'undefined') throw new Error('No workers here.');
      // @ts-expect-error TypeScript takes this file for CommonJS, where import.meta is not allowed; the bundler needs exactly this form to build the worker as a file of its own.
      const w: Worker = new Worker(new URL('./solve.worker.ts', import.meta.url));
      w.onmessage = (event) => {
        const { id, reply, error } = event.data;
        const current = this.job;
        if (!current || current.id !== id) return;
        if (reply) {
          this.job = null;
          current.resolve({ reply, where: 'worker' });
        } else {
          // The job threw in the worker: run it here, where it throws (or not) as a direct solve would.
          this.runOnPage(current);
          if (error) console.warn(`Smith chart solver worker: ${error}`);
        }
      };
      w.onerror = (event) => {
        event.preventDefault?.();
        this.giveUp();
      };
      this.worker = w;
    } catch {
      this.broken = true;
      this.worker = null;
    }
    return this.worker;
  }

  /** Drops the running request, if any; its promise gives null. */
  cancel(): void {
    const current = this.job;
    if (!current) return;
    this.job = null;
    if (current.timer) clearTimeout(current.timer);
    else this.worker?.postMessage({ id: (this.nextId += 1), cancel: true });
    current.resolve(null);
  }

  run(job: SolveJob, busy?: () => boolean): Promise<{ reply: SolveReply; where: Place } | null> {
    this.cancel();
    const id = (this.nextId += 1);
    return new Promise((resolve, reject) => {
      const current: Job = { id, job, busy, resolve, reject };
      this.job = current;
      const w = this.getWorker();
      if (w) {
        this.place = 'worker';
        w.postMessage({ id, job });
      } else {
        this.runOnPage(current);
      }
    });
  }

  stop(): void {
    this.cancel();
    this.worker?.terminate();
    this.worker = null;
  }
}

const solves = new Channel();
const suggestions = new Channel();

/**
 * Solves the circuit's ask in the worker (`family` comes back null: solveJob.ts). The promise gives the result, the
 * solve's time in the worker and where it ran, or null when a newer request (or `cancelSolve`) overtook it. `busy`
 * postpones the job only where it runs on the page.
 */
export async function solveOffPage(circuit: Circuit, busy?: () => boolean): Promise<{ result: SolveResult; ms: number; where: Place } | null> {
  const out = await solves.run({ kind: 'solve', circuit }, busy);
  if (!out || out.reply.kind !== 'solve') return null;
  return { result: out.reply.result, ms: out.reply.ms, where: out.where };
}

/** The suggestions for the circuit's goal (suggest.ts) in their own worker; null when overtaken. */
export async function suggestOffPage(circuit: Circuit, options?: SuggestOptions): Promise<{ suggestions: Suggestions; ms: number; where: Place } | null> {
  const out = await suggestions.run({ kind: 'suggest', circuit, options });
  if (!out || out.reply.kind !== 'suggest') return null;
  return { suggestions: out.reply.suggestions, ms: out.reply.ms, where: out.where };
}

export const cancelSolve = (): void => solves.cancel();
export const cancelSuggest = (): void => suggestions.cancel();
/** Where the last solve and the last suggestions ran: 'worker', 'page' (the fallback), or null before the first. */
export const solvePlace = (): Place | null => solves.place;
export const suggestPlace = (): Place | null => suggestions.place;

/** Ends both workers (when the tool's page is left); the next request makes new ones. */
export function stopSolveWorkers(): void {
  solves.stop();
  suggestions.stop();
}
