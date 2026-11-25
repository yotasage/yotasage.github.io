// Per-field Web Worker client for hash computation.
// - Runs all hashing (including File -> ArrayBuffer reads and text decoding) off the main thread.
// - Supports independent concurrent jobs per field so editing one field never stalls or
//   re-runs another field's heavy file computation.
// - Cancelling or superseding an active job terminates its busy worker immediately.
// - Falls back to yielding main-thread execution if Web Workers are unavailable.

import { computeDigestAsync, parseTextToBytes } from './engine';
import type { HashAlgorithmId, WorkerInputPayload } from './types';

export type { WorkerInputPayload } from './types';

export interface FieldHashJobRequest {
  payload: WorkerInputPayload;
  algorithms: readonly HashAlgorithmId[];
  hmacKey: Uint8Array | null;
}

export interface FieldHashJobCallbacks {
  onDigest: (algorithm: HashAlgorithmId, rawBytes: Uint8Array) => void;
  onDone: (byteLength: number) => void;
  onError: (message: string) => void;
}

type WorkerOutMessage =
  | { jobId: number; type: 'digest'; algorithm: HashAlgorithmId; rawBytes: Uint8Array }
  | { jobId: number; type: 'done'; byteLength: number }
  | { jobId: number; type: 'error'; message: string };

interface ActiveJob {
  jobId: number;
  worker: Worker | null;
  cancelled: boolean;
}

const MAX_IDLE_WORKERS = 2;

let nextJobId = 0;
let workersBroken = false;
const activeJobs = new Map<string, ActiveJob>();
const idleWorkers: Worker[] = [];

function releaseWorker(worker: Worker): void {
  worker.onmessage = null;
  worker.onerror = null;
  if (!workersBroken && idleWorkers.length < MAX_IDLE_WORKERS) {
    idleWorkers.push(worker);
  } else {
    worker.terminate();
  }
}

function acquireWorker(): Worker | null {
  if (workersBroken) return null;
  const cached = idleWorkers.pop();
  if (cached) return cached;
  try {
    if (typeof Worker === 'undefined') {
      workersBroken = true;
      return null;
    }
    // @ts-expect-error TypeScript compiles with CommonJS module settings where import.meta is flagged; Next.js requires this exact form to bundle the worker.
    return new Worker(new URL('./hash.worker.ts', import.meta.url));
  } catch {
    workersBroken = true;
    return null;
  }
}

async function runFallbackOnMainThread(
  job: ActiveJob,
  fieldId: string,
  request: FieldHashJobRequest,
  callbacks: FieldHashJobCallbacks,
): Promise<void> {
  try {
    let bytes: Uint8Array;
    if (request.payload.kind === 'blob') {
      bytes = new Uint8Array(await request.payload.blob.arrayBuffer());
    } else if (request.payload.kind === 'text') {
      const parsed = parseTextToBytes(request.payload.text, request.payload.textEncoding);
      if ('error' in parsed) {
        if (!job.cancelled) {
          if (activeJobs.get(fieldId) === job) activeJobs.delete(fieldId);
          callbacks.onError(parsed.error);
        }
        return;
      }
      bytes = parsed.bytes;
    } else {
      bytes = request.payload.bytes;
    }

    if (job.cancelled) return;

    for (const algo of request.algorithms) {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 0);
      });
      if (job.cancelled) return;
      const rawBytes = await computeDigestAsync(algo, bytes, request.hmacKey);
      if (job.cancelled) return;
      callbacks.onDigest(algo, rawBytes);
    }

    if (job.cancelled) return;
    if (activeJobs.get(fieldId) === job) {
      activeJobs.delete(fieldId);
    }
    callbacks.onDone(bytes.byteLength);
  } catch (err) {
    if (job.cancelled) return;
    if (activeJobs.get(fieldId) === job) {
      activeJobs.delete(fieldId);
    }
    callbacks.onError(err instanceof Error ? err.message : String(err));
  }
}

export function cancelFieldHashJob(fieldId: string): void {
  const existing = activeJobs.get(fieldId);
  if (!existing) return;
  existing.cancelled = true;
  activeJobs.delete(fieldId);
  if (existing.worker) {
    existing.worker.onmessage = null;
    existing.worker.onerror = null;
    existing.worker.terminate();
    existing.worker = null;
  }
}

export function runFieldHashJob(
  fieldId: string,
  request: FieldHashJobRequest,
  callbacks: FieldHashJobCallbacks,
): void {
  cancelFieldHashJob(fieldId);

  const jobId = ++nextJobId;
  const worker = acquireWorker();
  const job: ActiveJob = { jobId, worker, cancelled: false };
  activeJobs.set(fieldId, job);

  if (!worker) {
    void runFallbackOnMainThread(job, fieldId, request, callbacks);
    return;
  }

  worker.onmessage = (event: MessageEvent<WorkerOutMessage>) => {
    const msg = event.data;
    if (job.cancelled || msg.jobId !== jobId) return;

    if (msg.type === 'digest') {
      callbacks.onDigest(msg.algorithm, msg.rawBytes);
      return;
    }

    if (activeJobs.get(fieldId) === job) {
      activeJobs.delete(fieldId);
    }
    job.worker = null;
    releaseWorker(worker);

    if (msg.type === 'done') {
      callbacks.onDone(msg.byteLength);
    } else {
      callbacks.onError(msg.message);
    }
  };

  worker.onerror = (event: ErrorEvent) => {
    event.preventDefault?.();
    workersBroken = true;
    worker.onmessage = null;
    worker.onerror = null;
    worker.terminate();
    if (job.cancelled) return;
    job.worker = null;
    void runFallbackOnMainThread(job, fieldId, request, callbacks);
  };

  // Clone byte buffers before transferring so caller buffers stay intact if fallback is needed
  const transfer: Transferable[] = [];
  let wirePayload: WorkerInputPayload = request.payload;
  if (request.payload.kind === 'bytes') {
    const owned = new Uint8Array(request.payload.bytes);
    wirePayload = { kind: 'bytes', bytes: owned };
    if (owned.buffer instanceof ArrayBuffer) {
      transfer.push(owned.buffer);
    }
  }

  let wireHmac: Uint8Array | null = null;
  if (request.hmacKey) {
    wireHmac = new Uint8Array(request.hmacKey);
    if (wireHmac.buffer instanceof ArrayBuffer) {
      transfer.push(wireHmac.buffer);
    }
  }

  worker.postMessage(
    {
      jobId,
      payload: wirePayload,
      algorithms: [...request.algorithms],
      hmacKey: wireHmac,
    },
    transfer,
  );
}

export function disposeHashWorkers(): void {
  for (const job of activeJobs.values()) {
    job.cancelled = true;
    if (job.worker) {
      job.worker.onmessage = null;
      job.worker.onerror = null;
      job.worker.terminate();
      job.worker = null;
    }
  }
  activeJobs.clear();

  while (idleWorkers.length > 0) {
    const w = idleWorkers.pop();
    w?.terminate();
  }
}
