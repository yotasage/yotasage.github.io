// Client wrapper around lib/pdf/worker.ts. Lazily starts one module worker in the browser and falls back
// transparently to running on the main thread if Web Workers are unavailable or fail to initialize.
// Caller-owned Uint8Arrays are never transferred (so caller buffers are never neutered).

import { inspectPdfSizeBreakdown, PdfSizeBreakdown } from './breakdown';
import { compressPdf, CompressOptions, CompressResult } from './compress';
import { extractImagesFromPdf, ExtractImagesOptions, ExtractImagesResult } from './extractImages';
import { OutputFile } from './files';
import { MergeInput, mergePdfs } from './merge';
import { buildPdfFromPages, extractPagesPdf, LoadSource, PageSpec, removePagesPdf, rotatePdf } from './pages';
import { CleanOptions, cleanPdf, Finding, inspectPdf } from './sanitize';
import { SplitBySizeResult, SplitPart, splitPdfBySize, splitPdfParts } from './split';
import type { WorkerRequest, WorkerResponse } from './worker';

type ProgressFn = (fraction: number, label: string) => void;

interface PendingJob {
  id: number;
  req: WorkerRequest;
  onProgress?: ProgressFn;
  fallback: () => Promise<unknown>;
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
}

let worker: Worker | null = null;
let broken = false;
let nextId = 0;
const pending = new Map<number, PendingJob>();

function makeError(message: string, isPassword: boolean): Error {
  const err = new Error(message || 'PDF processing failed.');
  if (isPassword) err.name = 'EncryptedPDFError';
  return err;
}

function giveUpWorker() {
  broken = true;
  worker?.terminate();
  worker = null;
  const jobs = Array.from(pending.values());
  pending.clear();
  for (const job of jobs) {
    job.fallback()
      .then((res) => job.resolve(res))
      .catch((err) => job.reject(err instanceof Error ? err : new Error(String(err))));
  }
}

function getWorker(): Worker | null {
  if (worker || broken) return worker;
  if (typeof window === 'undefined' || typeof Worker === 'undefined') return null;
  try {
    // @ts-expect-error TypeScript takes this file for CommonJS, where import.meta is not allowed; the bundler needs exactly this form to build the worker as a file of its own.
    worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const msg = event.data;
      const job = pending.get(msg.id);
      if (!job) return;
      if (msg.type === 'progress') {
        job.onProgress?.(msg.fraction, msg.label);
        return;
      }
      pending.delete(msg.id);
      if (msg.type === 'result') {
        job.resolve(msg.data);
      } else {
        job.reject(makeError(msg.message, msg.isPassword));
      }
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

function dispatch<T>(
  buildReq: (id: number) => WorkerRequest,
  fallback: () => Promise<T>,
  onProgress?: ProgressFn,
): Promise<T> {
  const w = getWorker();
  if (!w) return fallback();
  const id = (nextId += 1);
  const req = buildReq(id);
  return new Promise<T>((resolve, reject) => {
    pending.set(id, {
      id,
      req,
      onProgress,
      fallback: () => fallback(),
      resolve: (val) => resolve(val as T),
      reject,
    });
    try {
      // Structured clone without transferring caller-owned ArrayBuffers so inputs stay intact.
      w.postMessage(req);
    } catch {
      pending.delete(id);
      giveUpWorker();
      fallback().then(resolve, reject);
    }
  });
}

export function runMergePdfs(
  inputs: MergeInput[],
  onProgress?: (done: number, total: number) => void,
): Promise<Uint8Array> {
  const total = Math.max(1, inputs.length);
  return dispatch<Uint8Array>(
    (id) => ({ id, task: 'merge', inputs }),
    () => mergePdfs(inputs, onProgress),
    onProgress ? (fraction) => onProgress(Math.round(fraction * total), total) : undefined,
  );
}

export function runCompressPdf(
  bytes: Uint8Array,
  opts: CompressOptions,
  onProgress?: ProgressFn,
): Promise<CompressResult> {
  // Image recompression and page rasterization require DOM canvas / pdf.js on the main thread.
  if (opts.images || opts.rasterize) {
    return compressPdf(bytes, opts, onProgress);
  }
  return dispatch<CompressResult>(
    (id) => ({ id, task: 'compressLossless', bytes, opts }),
    () => compressPdf(bytes, opts, onProgress),
    onProgress,
  );
}

export function runInspectPdf(bytes: Uint8Array, password?: string): Promise<Finding[]> {
  return dispatch<Finding[]>(
    (id) => ({ id, task: 'inspectSanitize', bytes, password }),
    () => inspectPdf(bytes, password),
  );
}

export function runCleanPdf(bytes: Uint8Array, opts: CleanOptions, password?: string): Promise<Uint8Array> {
  return dispatch<Uint8Array>(
    (id) => ({ id, task: 'sanitize', bytes, opts, password }),
    () => cleanPdf(bytes, opts, password),
  );
}

export function runRotatePdf(
  bytes: Uint8Array,
  rotations: number[],
  opts?: { password?: string },
  onProgress?: ProgressFn,
): Promise<Uint8Array> {
  return dispatch<Uint8Array>(
    (id) => ({ id, task: 'rotate', bytes, rotations, password: opts?.password }),
    () => rotatePdf(bytes, rotations, opts, onProgress),
    onProgress,
  );
}

export function runRemovePagesPdf(
  bytes: Uint8Array,
  removeIndices: Set<number>,
  opts?: { password?: string },
  onProgress?: ProgressFn,
): Promise<{ bytes: Uint8Array; keptPages: number }> {
  const list = Array.from(removeIndices);
  return dispatch<{ bytes: Uint8Array; keptPages: number }>(
    (id) => ({ id, task: 'removePages', bytes, removeIndices: list, password: opts?.password }),
    () => removePagesPdf(bytes, removeIndices, opts, onProgress),
    onProgress,
  );
}

export function runExtractPagesPdf(
  bytes: Uint8Array,
  keepIndices: number[],
  opts: { separate: boolean; sourceName: string; outputName?: string; password?: string },
  onProgress?: ProgressFn,
): Promise<OutputFile[]> {
  return dispatch<OutputFile[]>(
    (id) => ({ id, task: 'extractPages', bytes, keepIndices, opts }),
    () => extractPagesPdf(bytes, keepIndices, opts, onProgress),
    onProgress,
  );
}

export function runBuildPdfFromPages(
  sources: LoadSource[],
  pages: PageSpec[],
  onProgress?: ProgressFn,
): Promise<Uint8Array> {
  return dispatch<Uint8Array>(
    (id) => ({ id, task: 'buildPages', sources, pages }),
    () => buildPdfFromPages(sources, pages, onProgress),
    onProgress,
  );
}

export function runSplitPdfParts(
  bytes: Uint8Array,
  parts: SplitPart[],
  opts: { sourceName: string; password?: string },
  onProgress?: ProgressFn,
): Promise<OutputFile[]> {
  return dispatch<OutputFile[]>(
    (id) => ({ id, task: 'splitParts', bytes, parts, opts }),
    () => splitPdfParts(bytes, parts, opts, onProgress),
    onProgress,
  );
}

export function runSplitPdfBySize(
  bytes: Uint8Array,
  maxBytes: number,
  opts: { sourceName: string; password?: string },
  onProgress?: ProgressFn,
): Promise<SplitBySizeResult> {
  return dispatch<SplitBySizeResult>(
    (id) => ({ id, task: 'splitBySize', bytes, maxBytes, opts }),
    () => splitPdfBySize(bytes, maxBytes, opts, onProgress),
    onProgress,
  );
}

export function runExtractImagesFromPdf(
  bytes: Uint8Array,
  opts: ExtractImagesOptions,
  onProgress?: ProgressFn,
): Promise<ExtractImagesResult> {
  return dispatch<ExtractImagesResult>(
    (id) => ({ id, task: 'extractImages', bytes, opts }),
    () => extractImagesFromPdf(bytes, opts, onProgress),
    onProgress,
  );
}

export function runInspectPdfSizeBreakdown(bytes: Uint8Array, password?: string): Promise<PdfSizeBreakdown> {
  return dispatch<PdfSizeBreakdown>(
    (id) => ({ id, task: 'breakdown', bytes, password }),
    () => inspectPdfSizeBreakdown(bytes, password),
  );
}
