// Web Worker for heavy off-main-thread pdf-lib work (merge, lossless compress, sanitize, page operations,
// split, image extraction, and size breakdown). Canvas / pdf.js tasks stay on the main thread.

import {
  FlattenOptions,
  flattenPdf,
  inspectAnnotations,
  RemoveAnnotationsOptions,
  removeAnnotations,
} from './annotations';
import { inspectPdfSizeBreakdown } from './breakdown';
import { grayscalePdf, GrayscaleOptions } from './color';
import { compressPdf, CompressOptions } from './compress';
import { cropPdf, CropOptions, getPageBoxes } from './crop';
import { extractImagesFromPdf, ExtractImagesOptions } from './extractImages';
import { isPasswordError } from './files';
import { FillFormOptions, fillFormPdf, FormFieldValue, inspectFormFields } from './forms';
import { MergeInput, mergePdfs } from './merge';
import { PdfMetadataEdit, readPdfMetadata, writePdfMetadata } from './metadata';
import { bookletPdf, BookletOptions, nupPdf, NupOptions } from './nup';
import { addPageNumbers, PageNumberOptions } from './pageNumbers';
import { buildPdfFromPages, extractPagesPdf, LoadSource, PageSpec, removePagesPdf, rotatePdf } from './pages';
import { resizePdf, ResizeOptions } from './resize';
import { CleanOptions, cleanPdf, inspectPdf } from './sanitize';
import { inspectSecurity, ProtectOptions, protectPdf, unlockPdf } from './security';
import { applySignaturesToPdf, SignaturePlacement } from './sign';
import { SplitPart, splitPdfBySize, splitPdfParts } from './split';
import { addWatermark, WatermarkOptions } from './watermark';

export type WorkerRequest =
  | { id: number; task: 'merge'; inputs: MergeInput[] }
  | { id: number; task: 'compressLossless'; bytes: Uint8Array; opts: CompressOptions }
  | { id: number; task: 'sanitize'; bytes: Uint8Array; opts: CleanOptions; password?: string }
  | { id: number; task: 'inspectSanitize'; bytes: Uint8Array; password?: string }
  | { id: number; task: 'rotate'; bytes: Uint8Array; rotations: number[]; password?: string }
  | { id: number; task: 'removePages'; bytes: Uint8Array; removeIndices: number[]; password?: string }
  | {
      id: number;
      task: 'extractPages';
      bytes: Uint8Array;
      keepIndices: number[];
      opts: { separate: boolean; sourceName: string; outputName?: string; password?: string };
    }
  | { id: number; task: 'buildPages'; sources: LoadSource[]; pages: PageSpec[] }
  | { id: number; task: 'splitParts'; bytes: Uint8Array; parts: SplitPart[]; opts: { sourceName: string; password?: string } }
  | { id: number; task: 'splitBySize'; bytes: Uint8Array; maxBytes: number; opts: { sourceName: string; password?: string } }
  | { id: number; task: 'extractImages'; bytes: Uint8Array; opts: ExtractImagesOptions }
  | { id: number; task: 'breakdown'; bytes: Uint8Array; password?: string }
  | { id: number; task: 'inspectSecurity'; bytes: Uint8Array; password?: string }
  | { id: number; task: 'protect'; bytes: Uint8Array; opts: ProtectOptions; password?: string }
  | { id: number; task: 'unlock'; bytes: Uint8Array; password: string }
  | { id: number; task: 'readMetadata'; bytes: Uint8Array; password?: string }
  | { id: number; task: 'writeMetadata'; bytes: Uint8Array; fields: PdfMetadataEdit; password?: string }
  | { id: number; task: 'inspectAnnotations'; bytes: Uint8Array; password?: string }
  | { id: number; task: 'removeAnnotations'; bytes: Uint8Array; opts: RemoveAnnotationsOptions; password?: string }
  | { id: number; task: 'flatten'; bytes: Uint8Array; opts: FlattenOptions; password?: string }
  | { id: number; task: 'addPageNumbers'; bytes: Uint8Array; opts: PageNumberOptions; password?: string }
  | { id: number; task: 'addWatermark'; bytes: Uint8Array; opts: WatermarkOptions; password?: string }
  | { id: number; task: 'getPageBoxes'; bytes: Uint8Array; password?: string }
  | { id: number; task: 'crop'; bytes: Uint8Array; opts: CropOptions; password?: string }
  | { id: number; task: 'resize'; bytes: Uint8Array; opts: ResizeOptions; password?: string }
  | { id: number; task: 'nup'; bytes: Uint8Array; opts: NupOptions; password?: string }
  | { id: number; task: 'booklet'; bytes: Uint8Array; opts: BookletOptions; password?: string }
  | { id: number; task: 'grayscale'; bytes: Uint8Array; opts?: Omit<GrayscaleOptions, 'convertJpegToGray'>; password?: string }
  | { id: number; task: 'inspectFormFields'; bytes: Uint8Array; password?: string }
  | { id: number; task: 'fillForm'; bytes: Uint8Array; values: Record<string, FormFieldValue>; opts?: FillFormOptions; password?: string }
  | { id: number; task: 'applySignatures'; bytes: Uint8Array; placements: SignaturePlacement[]; password?: string };

export type WorkerResponse =
  | { id: number; type: 'progress'; fraction: number; label: string }
  | { id: number; type: 'result'; data: unknown }
  | { id: number; type: 'error'; message: string; isPassword: boolean };

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
  postMessage(message: WorkerResponse, transfer?: Transferable[]): void;
};

// Collects unique full-buffer ArrayBuffers from freshly produced worker outputs for zero-copy return transfer.
function collectTransferables(value: unknown, out: Set<ArrayBuffer> = new Set()): ArrayBuffer[] {
  if (value instanceof Uint8Array) {
    if (value.byteOffset === 0 && value.byteLength === value.buffer.byteLength && value.buffer instanceof ArrayBuffer) {
      out.add(value.buffer);
    }
  } else if (Array.isArray(value)) {
    for (const item of value) collectTransferables(item, out);
  } else if (value && typeof value === 'object') {
    for (const v of Object.values(value as Record<string, unknown>)) collectTransferables(v, out);
  }
  return Array.from(out);
}

async function handleTask(req: WorkerRequest, postProgress: (fraction: number, label: string) => void): Promise<unknown> {
  switch (req.task) {
    case 'merge':
      return mergePdfs(req.inputs, (done, total) => postProgress(done / Math.max(1, total), 'Merging…'));
    case 'compressLossless':
      return compressPdf(req.bytes, req.opts, postProgress);
    case 'sanitize':
      return cleanPdf(req.bytes, req.opts, req.password);
    case 'inspectSanitize':
      return inspectPdf(req.bytes, req.password);
    case 'rotate':
      return rotatePdf(req.bytes, req.rotations, { password: req.password }, postProgress);
    case 'removePages':
      return removePagesPdf(req.bytes, new Set(req.removeIndices), { password: req.password }, postProgress);
    case 'extractPages':
      return extractPagesPdf(req.bytes, req.keepIndices, req.opts, postProgress);
    case 'buildPages':
      return buildPdfFromPages(req.sources, req.pages, postProgress);
    case 'splitParts':
      return splitPdfParts(req.bytes, req.parts, req.opts, postProgress);
    case 'splitBySize':
      return splitPdfBySize(req.bytes, req.maxBytes, req.opts, postProgress);
    case 'extractImages':
      return extractImagesFromPdf(req.bytes, req.opts, postProgress);
    case 'breakdown':
      return inspectPdfSizeBreakdown(req.bytes, req.password);
    case 'inspectSecurity':
      return inspectSecurity(req.bytes, req.password);
    case 'protect':
      return protectPdf(req.bytes, req.opts, req.password);
    case 'unlock':
      return unlockPdf(req.bytes, req.password);
    case 'readMetadata':
      return readPdfMetadata(req.bytes, req.password);
    case 'writeMetadata':
      return writePdfMetadata(req.bytes, req.fields, req.password);
    case 'inspectAnnotations':
      return inspectAnnotations(req.bytes, req.password);
    case 'removeAnnotations':
      return removeAnnotations(req.bytes, req.opts, req.password);
    case 'flatten':
      return flattenPdf(req.bytes, req.opts, req.password);
    case 'addPageNumbers':
      return addPageNumbers(req.bytes, req.opts, req.password);
    case 'addWatermark':
      return addWatermark(req.bytes, req.opts, req.password);
    case 'getPageBoxes':
      return getPageBoxes(req.bytes, req.password);
    case 'crop':
      return cropPdf(req.bytes, req.opts, req.password);
    case 'resize':
      return resizePdf(req.bytes, req.opts, req.password);
    case 'nup':
      return nupPdf(req.bytes, req.opts, req.password);
    case 'booklet':
      return bookletPdf(req.bytes, req.opts, req.password);
    case 'grayscale':
      return grayscalePdf(req.bytes, req.opts, req.password);
    case 'inspectFormFields':
      return inspectFormFields(req.bytes, req.password);
    case 'fillForm':
      return fillFormPdf(req.bytes, req.values, req.opts, req.password);
    case 'applySignatures':
      return applySignaturesToPdf(req.bytes, req.placements, req.password);
  }
}

scope.onmessage = (event) => {
  const req = event.data;
  const postProgress = (fraction: number, label: string) => {
    scope.postMessage({ id: req.id, type: 'progress', fraction, label });
  };

  handleTask(req, postProgress)
    .then((data) => {
      const transfers = collectTransferables(data);
      scope.postMessage({ id: req.id, type: 'result', data }, transfers);
    })
    .catch((err) => {
      const message = err instanceof Error ? err.message : String(err);
      scope.postMessage({ id: req.id, type: 'error', message, isPassword: isPasswordError(err) });
    });
};
