// Starts combination searches in a Web Worker (combine.worker.ts), so the page keeps responding while a large list
// is searched. One search runs at a time: a new one stops the one before. Where a worker cannot be made, the search
// runs on the page itself in short slices.

import { runSearch, searchSteps } from './combine';
import type { SearchOptions, SearchResult } from './combine';

interface Job {
  id: number;
  target: number;
  values: number[];
  options: SearchOptions;
  onProgress?: (fraction: number) => void;
  resolve: (result: SearchResult | null) => void;
  reject: (error: Error) => void;
}

// On the page itself a slice must be shorter than a frame or two.
const PAGE_SLICE_MS = 12;

let worker: Worker | null = null;
// Set when a worker could not be made or failed: from then on the searches run on the page.
let broken = false;
let nextId = 0;
let job: Job | null = null;

// Where the running search runs: 'worker', 'page' (the fallback), or null before the first search.
let place: 'worker' | 'page' | null = null;

export function searchPlace(): 'worker' | 'page' | null {
  return place;
}

function runOnPage(current: Job) {
  place = 'page';
  runSearch(searchSteps(current.target, current.values, current.options), PAGE_SLICE_MS, current.onProgress, () => job !== current)
    .then((result) => {
      if (job !== current) return;
      job = null;
      current.resolve(result);
    })
    .catch((error) => {
      if (job !== current) return;
      job = null;
      current.reject(error instanceof Error ? error : new Error(String(error)));
    });
}

// The worker failed (its script did not load, or it threw outside a search): the running search starts again here.
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
      const { id, progress, result, error } = event.data;
      const current = job;
      if (!current || current.id !== id) return;
      if (progress !== undefined) {
        current.onProgress?.(progress);
        return;
      }
      job = null;
      if (result) current.resolve(result);
      else current.reject(new Error(error || 'The search failed.'));
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

// Stops the running search, if there is one; its promise gives null.
export function cancelSearch(): void {
  const current = job;
  if (!current) return;
  job = null;
  worker?.postMessage({ id: (nextId += 1), cancel: true });
  current.resolve(null);
}

// Searches for `target` among the networks of `values` (see `searchCombinations` for the options and the result).
// The promise gives the result, or null when the search was stopped by `cancelSearch` or by a newer search.
// `onProgress` gets a fraction from 0 to 1 a few times a second while a long search runs.
export function startSearch(
  target: number,
  values: number[],
  options: SearchOptions = {},
  onProgress?: (fraction: number) => void,
): Promise<SearchResult | null> {
  cancelSearch();
  const id = (nextId += 1);
  return new Promise((resolve, reject) => {
    const current: Job = { id, target, values, options, onProgress, resolve, reject };
    job = current;
    const w = getWorker();
    if (w) {
      place = 'worker';
      w.postMessage({ id, target, values, options });
    } else {
      runOnPage(current);
    }
  });
}

// Ends the worker (when the page of the tool is left). The next search makes a new one.
export function stopSearchWorker(): void {
  cancelSearch();
  worker?.terminate();
  worker = null;
}
