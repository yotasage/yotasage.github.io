// Typed Web Worker client for FFT analysis with transparent main-thread fallback.

import type { AnalysisResult, ParsedDataset, Setup, SignalDef } from '../types';
import { analyzeDataset } from '../metrics/analyze';
import type {
  WorkerAnalyzeRequest,
  WorkerAnalyzeResponse,
  WorkerErrorResponse,
} from './dspWorker';

let workerInstance: Worker | null = null;
let workerFailed = false;
let reqSeq = 0;

const pending = new Map<
  number,
  { resolve: (res: AnalysisResult) => void; reject: (err: Error) => void }
>();

function getWorker(): Worker | null {
  if (typeof window === 'undefined' || typeof Worker === 'undefined' || workerFailed) {
    return null;
  }
  if (workerInstance) return workerInstance;
  try {
    // @ts-expect-error -- tsconfig uses module: node16 which flags import.meta.url; Next.js bundles module workers
    const w = new Worker(new URL('./dspWorker.ts', import.meta.url), { type: 'module' });
    w.onmessage = (ev: MessageEvent<WorkerAnalyzeResponse | WorkerErrorResponse>) => {
      const msg = ev.data;
      const entry = pending.get(msg.id);
      if (!entry) return;
      pending.delete(msg.id);
      if (msg.ok === true) {
        entry.resolve(msg.result);
      } else {
        entry.reject(new Error((msg as WorkerErrorResponse).error));
      }
    };
    w.onerror = () => {
      workerFailed = true;
      for (const [, entry] of pending) {
        entry.reject(new Error('FFT worker crashed; falling back to main thread'));
      }
      pending.clear();
      workerInstance = null;
    };
    workerInstance = w;
    return w;
  } catch {
    workerFailed = true;
    return null;
  }
}

/** Run FFT analysis on the dedicated Web Worker for larger records, or directly on main thread. */
export async function runAnalysisAsync(
  dataset: ParsedDataset,
  signal: SignalDef,
  setup: Setup,
): Promise<AnalysisResult> {
  // Small records (< 8192) finish in < 3 ms synchronously without postMessage clone overhead
  if (setup.n < 8192 || typeof window === 'undefined') {
    return analyzeDataset(dataset, signal, setup);
  }
  const w = getWorker();
  if (!w) {
    return analyzeDataset(dataset, signal, setup);
  }
  const id = ++reqSeq;
  return new Promise<AnalysisResult>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    const req: WorkerAnalyzeRequest = { id, kind: 'analyze', dataset, signal, setup };
    try {
      w.postMessage(req);
    } catch {
      pending.delete(id);
      try {
        resolve(analyzeDataset(dataset, signal, setup));
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    }
  });
}

export function terminateFftWorker(): void {
  if (workerInstance) {
    workerInstance.terminate();
    workerInstance = null;
  }
  pending.clear();
}
