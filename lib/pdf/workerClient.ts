// Client wrapper around lib/pdf/worker.ts. Lazily starts one module worker in the browser and falls back
// transparently to running on the main thread if Web Workers are unavailable or fail to initialize.
// Caller-owned Uint8Arrays are never transferred (so caller buffers are never neutered).

import {
  AnnotationSummary,
  FlattenOptions,
  flattenPdf,
  FlattenResult,
  inspectAnnotations,
  RemoveAnnotationsOptions,
  removeAnnotations,
  RemoveAnnotationsResult,
} from './annotations';
import { inspectPdfSizeBreakdown, PdfSizeBreakdown } from './breakdown';
import { grayscalePdf, GrayscaleOptions, GrayscaleResult } from './color';
import { compressPdf, CompressOptions, CompressResult } from './compress';
import { cropPdf, CropOptions, getPageBoxes, PageBoxInfo } from './crop';
import { applyEditsToPdf, ApplyEditsResult, PdfEditItem } from './editPdf';
import { extractImagesFromPdf, ExtractImagesOptions, ExtractImagesResult } from './extractImages';
import { OutputFile } from './files';
import {
  FillFormOptions,
  fillFormPdf,
  FillFormResult,
  FormFieldValue,
  FormInspection,
  inspectFormFields,
} from './forms';
import { MergeInput, mergePdfs } from './merge';
import { PdfMetadata, PdfMetadataEdit, readPdfMetadata, writePdfMetadata } from './metadata';
import { bookletPdf, BookletOptions, nupPdf, NupOptions } from './nup';
import { addPageNumbers, PageNumberOptions } from './pageNumbers';
import { buildPdfFromPages, extractPagesPdf, LoadSource, PageSpec, removePagesPdf, rotatePdf } from './pages';
import { resizePdf, ResizeOptions } from './resize';
import { CleanOptions, cleanPdf, Finding, inspectPdf } from './sanitize';
import { inspectSecurity, ProtectOptions, protectPdf, SecurityInfo, unlockPdf, UnlockResult } from './security';
import { applySignaturesToPdf, ApplySignaturesResult, SignaturePlacement } from './sign';
import { SplitBySizeResult, SplitPart, splitPdfBySize, splitPdfParts } from './split';
import { addWatermark, WatermarkOptions } from './watermark';
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
  // Image recompression, page rasterization, and QPDF WASM script loading run on the main thread.
  if (opts.images || opts.rasterize || opts.qpdfOptimize) {
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

export function runInspectSecurity(bytes: Uint8Array, password?: string): Promise<SecurityInfo> {
  return dispatch<SecurityInfo>(
    (id) => ({ id, task: 'inspectSecurity', bytes, password }),
    () => inspectSecurity(bytes, password),
  );
}

export function runProtectPdf(bytes: Uint8Array, opts: ProtectOptions, password?: string): Promise<Uint8Array> {
  return dispatch<Uint8Array>(
    (id) => ({ id, task: 'protect', bytes, opts, password }),
    () => protectPdf(bytes, opts, password),
  );
}

export function runUnlockPdf(bytes: Uint8Array, password: string): Promise<UnlockResult> {
  return dispatch<UnlockResult>(
    (id) => ({ id, task: 'unlock', bytes, password }),
    () => unlockPdf(bytes, password),
  );
}

export function runReadPdfMetadata(bytes: Uint8Array, password?: string): Promise<PdfMetadata> {
  return dispatch<PdfMetadata>(
    (id) => ({ id, task: 'readMetadata', bytes, password }),
    () => readPdfMetadata(bytes, password),
  );
}

export function runWritePdfMetadata(
  bytes: Uint8Array,
  fields: PdfMetadataEdit,
  password?: string,
): Promise<Uint8Array> {
  return dispatch<Uint8Array>(
    (id) => ({ id, task: 'writeMetadata', bytes, fields, password }),
    () => writePdfMetadata(bytes, fields, password),
  );
}

export function runInspectAnnotations(bytes: Uint8Array, password?: string): Promise<AnnotationSummary> {
  return dispatch<AnnotationSummary>(
    (id) => ({ id, task: 'inspectAnnotations', bytes, password }),
    () => inspectAnnotations(bytes, password),
  );
}

export function runRemoveAnnotations(
  bytes: Uint8Array,
  opts: RemoveAnnotationsOptions,
  password?: string,
): Promise<RemoveAnnotationsResult> {
  return dispatch<RemoveAnnotationsResult>(
    (id) => ({ id, task: 'removeAnnotations', bytes, opts, password }),
    () => removeAnnotations(bytes, opts, password),
  );
}

export function runFlattenPdf(
  bytes: Uint8Array,
  opts: FlattenOptions,
  password?: string,
): Promise<FlattenResult> {
  return dispatch<FlattenResult>(
    (id) => ({ id, task: 'flatten', bytes, opts, password }),
    () => flattenPdf(bytes, opts, password),
  );
}

export function runAddPageNumbers(
  bytes: Uint8Array,
  opts: PageNumberOptions,
  password?: string,
): Promise<Uint8Array> {
  return dispatch<Uint8Array>(
    (id) => ({ id, task: 'addPageNumbers', bytes, opts, password }),
    () => addPageNumbers(bytes, opts, password),
  );
}

export function runAddWatermark(
  bytes: Uint8Array,
  opts: WatermarkOptions,
  password?: string,
): Promise<Uint8Array> {
  return dispatch<Uint8Array>(
    (id) => ({ id, task: 'addWatermark', bytes, opts, password }),
    () => addWatermark(bytes, opts, password),
  );
}

export function runGetPageBoxes(bytes: Uint8Array, password?: string): Promise<PageBoxInfo[]> {
  return dispatch<PageBoxInfo[]>(
    (id) => ({ id, task: 'getPageBoxes', bytes, password }),
    () => getPageBoxes(bytes, password),
  );
}

export function runCropPdf(
  bytes: Uint8Array,
  opts: CropOptions,
  password?: string,
): Promise<Uint8Array> {
  return dispatch<Uint8Array>(
    (id) => ({ id, task: 'crop', bytes, opts, password }),
    () => cropPdf(bytes, opts, password),
  );
}

export function runResizePdf(
  bytes: Uint8Array,
  opts: ResizeOptions,
  password?: string,
): Promise<Uint8Array> {
  return dispatch<Uint8Array>(
    (id) => ({ id, task: 'resize', bytes, opts, password }),
    () => resizePdf(bytes, opts, password),
  );
}

export function runNupPdf(
  bytes: Uint8Array,
  opts: NupOptions,
  password?: string,
): Promise<Uint8Array> {
  return dispatch<Uint8Array>(
    (id) => ({ id, task: 'nup', bytes, opts, password }),
    () => nupPdf(bytes, opts, password),
  );
}

export function runBookletPdf(
  bytes: Uint8Array,
  opts: BookletOptions,
  password?: string,
): Promise<Uint8Array> {
  return dispatch<Uint8Array>(
    (id) => ({ id, task: 'booklet', bytes, opts, password }),
    () => bookletPdf(bytes, opts, password),
  );
}

export function runGrayscalePdf(
  bytes: Uint8Array,
  opts?: GrayscaleOptions,
  password?: string,
): Promise<GrayscaleResult> {
  // Function callbacks cannot be structured-cloned into a Web Worker, so run on the main thread when provided.
  if (opts?.convertJpegToGray) {
    return grayscalePdf(bytes, opts, password);
  }
  return dispatch<GrayscaleResult>(
    (id) => ({ id, task: 'grayscale', bytes, password }),
    () => grayscalePdf(bytes, opts, password),
  );
}

export function runInspectFormFields(bytes: Uint8Array, password?: string): Promise<FormInspection> {
  return dispatch<FormInspection>(
    (id) => ({ id, task: 'inspectFormFields', bytes, password }),
    () => inspectFormFields(bytes, password),
  );
}

export function runFillFormPdf(
  bytes: Uint8Array,
  values: Record<string, FormFieldValue>,
  opts?: FillFormOptions,
  password?: string,
): Promise<FillFormResult> {
  return dispatch<FillFormResult>(
    (id) => ({ id, task: 'fillForm', bytes, values, opts, password }),
    () => fillFormPdf(bytes, values, opts, password),
  );
}

export function runApplySignatures(
  bytes: Uint8Array,
  placements: SignaturePlacement[],
  password?: string,
): Promise<ApplySignaturesResult> {
  return dispatch<ApplySignaturesResult>(
    (id) => ({ id, task: 'applySignatures', bytes, placements, password }),
    () => applySignaturesToPdf(bytes, placements, password),
  );
}

export function runApplyEdits(
  bytes: Uint8Array,
  items: PdfEditItem[],
  password?: string,
): Promise<ApplyEditsResult> {
  return dispatch<ApplyEditsResult>(
    (id) => ({ id, task: 'applyEdits', bytes, items, password }),
    () => applyEditsToPdf(bytes, items, password),
  );
}
