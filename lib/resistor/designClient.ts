// Asks for the suggestions of the design mode in a Web Worker (combine.worker.ts, a worker of its own beside the
// one of the combination search), so the page keeps responding while pairs of two-value legs are compared. One
// request counts at a time: a new one overtakes the one before, whose promise gives null. Where a worker cannot be
// made, `suggestParts` runs on the page itself after the next paint.

import type { Circuit } from './circuits';
import { suggestParts } from './suggest';
import type { SuggestOptions, Suggestions } from './suggest';

export interface SuggestRequest {
  circuit: Circuit;
  target: number;
  values: number[];
  options: SuggestOptions;
}

interface Job {
  id: number;
  request: SuggestRequest;
  timer?: ReturnType<typeof setTimeout>;
  resolve: (result: Suggestions | null) => void;
  reject: (error: Error) => void;
}

// On the page itself the call waits this long, so the page can show that it is working first.
const PAGE_DELAY_MS = 40;

let worker: Worker | null = null;
let broken = false;
let nextId = 0;
let job: Job | null = null;
let place: 'worker' | 'page' | null = null;

// Where the last request ran: 'worker', 'page' (the fallback), or null before the first one.
export function suggestPlace(): 'worker' | 'page' | null {
  return place;
}

function runOnPage(current: Job) {
  place = 'page';
  current.timer = setTimeout(() => {
    if (job !== current) return;
    job = null;
    try {
      const { circuit, target, values, options } = current.request;
      current.resolve(suggestParts(circuit, target, values, options));
    } catch (error) {
      current.reject(error instanceof Error ? error : new Error(String(error)));
    }
  }, PAGE_DELAY_MS);
}

function giveUpWorker() {
  broken = true;
  worker?.terminate();
  worker = null;
  if (job) runOnPage(job);
}

function getWorker(): Worker | null {
  if (worker || broken) return worker;
  try {
    if (typeof Worker === 'undefined') throw new Error('No workers here.');
    // @ts-expect-error TypeScript takes this file for CommonJS, where import.meta is not allowed; the bundler needs exactly this form to build the worker as a file of its own.
    worker = new Worker(new URL('./combine.worker.ts', import.meta.url));
    worker.onmessage = (event) => {
      const { id, suggestions, error } = event.data;
      const current = job;
      if (!current || current.id !== id) return;
      job = null;
      if (suggestions) current.resolve(suggestions);
      else current.reject(new Error(error || 'The suggestions failed.'));
    };
    worker.onerror = (event) => {
      event.preventDefault?.();
      giveUpWorker();
    };
  } catch {
    broken = true;
    worker = null;
  }
  return worker;
}

// Drops the running request, if there is one; its promise gives null.
export function cancelSuggest(): void {
  const current = job;
  if (!current) return;
  job = null;
  if (current.timer) clearTimeout(current.timer);
  else worker?.postMessage({ id: (nextId += 1), cancel: true });
  current.resolve(null);
}

// The suggestions for a circuit (see `suggestParts`). The promise gives them, or null when the request was dropped
// by `cancelSuggest` or overtaken by a newer one.
export function startSuggest(request: SuggestRequest): Promise<Suggestions | null> {
  cancelSuggest();
  const id = (nextId += 1);
  return new Promise((resolve, reject) => {
    const current: Job = { id, request, resolve, reject };
    job = current;
    const w = getWorker();
    if (w) {
      place = 'worker';
      w.postMessage({ id, suggest: request });
    } else {
      runOnPage(current);
    }
  });
}

// Ends the worker (when the page of the tool is left). The next request makes a new one.
export function stopSuggestWorker(): void {
  cancelSuggest();
  worker?.terminate();
  worker = null;
}
