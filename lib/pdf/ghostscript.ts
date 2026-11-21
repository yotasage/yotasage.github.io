// Lazy, self-hosted Ghostscript WebAssembly client (Browser Web Worker + Node.js direct).
//
// In a browser window, `runGhostscript` automatically offloads execution to a dedicated module Web Worker
// (lib/pdf/ghostscript.worker.ts -> lib/pdf/ghostscriptCore.ts), falling back transparently to the main
// thread if Web Workers are unavailable. In Node.js (harness), it runs `runGhostscriptDirect` directly.

import {
  GhostscriptCompressOptions,
  GhostscriptCompressPreset,
  GhostscriptRunOptions,
  GhostscriptRunResult,
  GS_JS_URL,
  GS_WASM_URL,
  runGhostscriptDirect,
} from './ghostscriptCore';

export { GS_JS_URL, GS_WASM_URL, runGhostscriptDirect };
export type {
  GhostscriptCompressOptions,
  GhostscriptCompressPreset,
  GhostscriptRunOptions,
  GhostscriptRunResult,
};

interface GsWorkerRequest {
  id: number;
  input: Uint8Array;
  args: string[];
  options?: GhostscriptRunOptions;
}

interface GsWorkerResponse {
  id: number;
  ok: boolean;
  result?: GhostscriptRunResult;
  error?: string;
}

interface PendingGsJob {
  resolve: (result: GhostscriptRunResult) => void;
  reject: (err: Error) => void;
  fallback: () => Promise<GhostscriptRunResult>;
}

const PASSWORD_ERROR_RE = /requires a password|Password did not work|Cannot decrypt/i;
const UNREADABLE_INPUT_RE = /Couldn't initialise file/i;

let gsWorker: Worker | null = null;
let gsWorkerBroken = false;
let gsNextJobId = 0;
const gsPending = new Map<number, PendingGsJob>();

function isBrowserMainThread(): boolean {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

function hasPdfHeader(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 5 &&
    bytes[0] === 0x25 && // %
    bytes[1] === 0x50 && // P
    bytes[2] === 0x44 && // D
    bytes[3] === 0x46 && // F
    bytes[4] === 0x2d // -
  );
}

function giveUpGsWorker() {
  gsWorkerBroken = true;
  gsWorker?.terminate();
  gsWorker = null;
  const jobs = Array.from(gsPending.values());
  gsPending.clear();
  for (const job of jobs) {
    job.fallback().then(job.resolve, job.reject);
  }
}

function getGsWorker(): Worker | null {
  if (gsWorker || gsWorkerBroken) return gsWorker;
  if (!isBrowserMainThread() || typeof Worker === 'undefined') return null;
  try {
    // @ts-expect-error TypeScript compiles this file under node16 CJS; Turbopack/webpack require this exact URL form to emit a standalone module worker.
    gsWorker = new Worker(new URL('./ghostscript.worker.ts', import.meta.url), { type: 'module' });
    gsWorker.onmessage = (event: MessageEvent<GsWorkerResponse>) => {
      const msg = event.data;
      const job = gsPending.get(msg.id);
      if (!job) return;
      gsPending.delete(msg.id);
      if (msg.ok && msg.result) {
        job.resolve(msg.result);
      } else {
        job.reject(new Error(msg.error || 'Ghostscript WebAssembly execution failed.'));
      }
    };
    gsWorker.onerror = (event) => {
      event.preventDefault?.();
      giveUpGsWorker();
    };
  } catch {
    gsWorkerBroken = true;
    gsWorker = null;
  }
  return gsWorker;
}

/**
 * Runs Ghostscript on an in-memory PDF buffer.
 *
 * Writes `input` to `/in.pdf` (plus any `options.extraFiles`) in the virtual filesystem, replaces
 * `$IN` with `/in.pdf` and `$OUT` with `options.outputFile ?? '/out.pdf'` inside every argument,
 * executes Ghostscript, reads the output bytes, and cleans up all virtual files.
 *
 * In a browser window this automatically runs off-main-thread inside a dedicated module Web Worker
 * (falling back to the main thread if Workers are unavailable). In Node.js it executes directly.
 */
export function runGhostscript(
  input: Uint8Array,
  args: string[],
  options?: GhostscriptRunOptions,
): Promise<GhostscriptRunResult> {
  const worker = getGsWorker();
  if (!worker) {
    return runGhostscriptDirect(input, args, options);
  }

  const id = (gsNextJobId += 1);
  const req: GsWorkerRequest = { id, input, args, options };
  return new Promise<GhostscriptRunResult>((resolve, reject) => {
    gsPending.set(id, {
      resolve,
      reject,
      fallback: () => runGhostscriptDirect(input, args, options),
    });
    try {
      // Structured clone without transferring caller-owned input buffers so callers keep their bytes intact.
      worker.postMessage(req);
    } catch {
      gsPending.delete(id);
      giveUpGsWorker();
      runGhostscriptDirect(input, args, options).then(resolve, reject);
    }
  });
}

/**
 * Compresses a PDF with Ghostscript's `pdfwrite` device while preserving selectable text and vector graphics.
 */
export async function compressPdfWithGhostscript(
  bytes: Uint8Array,
  opts: GhostscriptCompressOptions,
): Promise<{ bytes: Uint8Array; stdout: string; stderr: string }> {
  if (bytes.length === 0) {
    throw new Error('The input PDF is empty.');
  }

  const args: string[] = [
    '-sDEVICE=pdfwrite',
    `-dCompatibilityLevel=${opts.compatibilityLevel ?? '1.5'}`,
    `-dPDFSETTINGS=/${opts.preset}`,
    '-dNOPAUSE',
    '-dQUIET',
    '-dBATCH',
    '-dAutoRotatePages=/None',
  ];

  if (opts.colorMode === 'grayscale') {
    args.push('-sColorConversionStrategy=Gray', '-dProcessColorModel=/DeviceGray');
  }

  if (opts.password !== undefined && opts.password !== '') {
    args.push(`-sPDFPassword=${opts.password}`);
  }

  args.push('-sOutputFile=$OUT', '$IN');

  const res = await runGhostscript(bytes, args);
  const combined = `${res.stderr}\n${res.stdout}`;

  if (PASSWORD_ERROR_RE.test(combined)) {
    const err = new Error('This PDF is password protected or the password is incorrect.');
    err.name = 'EncryptedPDFError';
    throw err;
  }

  if (res.exitCode !== 0 || UNREADABLE_INPUT_RE.test(combined)) {
    const detail = res.stderr.trim() || res.stdout.trim() || `exit code ${res.exitCode}`;
    throw new Error(`Ghostscript compression failed: ${detail}`);
  }

  if (!res.output || !hasPdfHeader(res.output)) {
    const detail = res.stderr.trim() || res.stdout.trim() || 'no valid PDF output produced';
    throw new Error(`Ghostscript compression failed: ${detail}`);
  }

  return {
    bytes: res.output,
    stdout: res.stdout,
    stderr: res.stderr,
  };
}
