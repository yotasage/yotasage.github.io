// Lazy, self-hosted wrapper around @neslinesli93/qpdf-wasm (QPDF compiled to WebAssembly).
//
// Browser / Web Worker: loads `/pdf-wasm/qpdf.js` and `/pdf-wasm/qpdf.wasm` directly from public/pdf-wasm/
// (copied by scripts/copy-pdf-wasm-assets.mjs), keeping the Emscripten Node-capable glue out of the JS bundle
// and guaranteeing zero CDN requests.
// Node.js (verification harness): loads `@neslinesli93/qpdf-wasm` directly and locates public/pdf-wasm/qpdf.wasm
// (falling back to node_modules/@neslinesli93/qpdf-wasm/dist/qpdf.wasm).
//
// Each run creates a fresh WASM instance with isolated virtual FS and stdout/stderr byte streams, so a failed
// or malformed PDF can never corrupt subsequent invocations or pollute the console.

import type { QpdfInstance } from '@neslinesli93/qpdf-wasm';

export const QPDF_WASM_URL = '/pdf-wasm/qpdf.wasm';
export const QPDF_JS_URL = '/pdf-wasm/qpdf.js';

export interface QpdfRunResult {
  output?: Uint8Array;
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface QpdfCheckResult {
  /** True when qpdf returned exit code 0 (clean) or 3 (warnings only). */
  ok: boolean;
  exitCode: number;
  warnings: string[];
  errors: string[];
  isLinearized: boolean;
  stdout: string;
  stderr: string;
}

interface RawEmscriptenFS {
  init: (
    input: (() => number | null) | null,
    output: ((ch: number) => void) | null,
    error: ((ch: number) => void) | null,
  ) => void;
  writeFile: (path: string, data: Uint8Array) => void;
  readFile: (path: string) => Uint8Array;
  unlink: (path: string) => void;
}

interface RawQpdfInstance extends Omit<QpdfInstance, 'FS'> {
  FS: RawEmscriptenFS;
}

type RawQpdfFactory = (options: {
  locateFile: (path: string, prefix?: string) => string;
  noInitialRun?: boolean;
  noFSInit?: boolean;
  preRun?: Array<(mod: RawQpdfInstance) => void>;
}) => Promise<RawQpdfInstance>;

let factoryPromise: Promise<RawQpdfFactory> | null = null;
let nodeWasmPathPromise: Promise<string> | null = null;

function isWorkerScope(): boolean {
  return typeof self !== 'undefined' && typeof (self as unknown as { importScripts?: unknown }).importScripts === 'function';
}

function isBrowserWindow(): boolean {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

function resolveOriginUrl(path: string): string {
  if (typeof self !== 'undefined' && self.location?.origin && self.location.origin !== 'null') {
    return new URL(path, self.location.origin).href;
  }
  return path;
}

function loadQpdfFactory(): Promise<RawQpdfFactory> {
  if (factoryPromise) return factoryPromise;

  if (isWorkerScope()) {
    factoryPromise = Promise.resolve().then(() => {
      const g = self as unknown as {
        importScripts: (...urls: string[]) => void;
        Module?: RawQpdfFactory;
      };
      if (typeof g.Module !== 'function') {
        g.importScripts(resolveOriginUrl(QPDF_JS_URL));
      }
      if (typeof g.Module !== 'function') {
        throw new Error('Failed to load QPDF WebAssembly runtime in Web Worker.');
      }
      return g.Module;
    });
    return factoryPromise;
  }

  if (isBrowserWindow()) {
    factoryPromise = new Promise<RawQpdfFactory>((resolve, reject) => {
      const w = window as unknown as { Module?: RawQpdfFactory };
      if (typeof w.Module === 'function') {
        resolve(w.Module);
        return;
      }
      const existing = document.querySelector<HTMLScriptElement>(`script[data-qpdf-runtime="true"]`);
      if (existing) {
        existing.addEventListener('load', () => {
          if (typeof w.Module === 'function') resolve(w.Module);
          else reject(new Error('QPDF runtime script loaded without exporting Module.'));
        });
        existing.addEventListener('error', () => reject(new Error(`Failed to load ${QPDF_JS_URL}.`)));
        return;
      }
      const script = document.createElement('script');
      script.src = QPDF_JS_URL;
      script.async = true;
      script.dataset.qpdfRuntime = 'true';
      script.onload = () => {
        if (typeof w.Module === 'function') resolve(w.Module);
        else reject(new Error('QPDF runtime script loaded without exporting Module.'));
      };
      script.onerror = () => {
        factoryPromise = null;
        reject(new Error(`Failed to load ${QPDF_JS_URL}.`));
      };
      document.head.appendChild(script);
    });
    return factoryPromise;
  }

  // Node.js path (used by the verification harness). Dynamic specifiers keep Node modules
  // out of Next.js client bundles while avoiding any next.config fallback overrides.
  factoryPromise = (async () => {
    const pkgSpec = '@neslinesli93/' + 'qpdf-wasm';
    const mod = await import(/* webpackIgnore: true */ pkgSpec);
    const factory: RawQpdfFactory = mod.default ?? mod;
    if (typeof factory !== 'function') {
      throw new Error('Failed to load @neslinesli93/qpdf-wasm in Node.js.');
    }
    return factory;
  })();
  return factoryPromise;
}

async function resolveNodeWasmPath(): Promise<string> {
  if (!nodeWasmPathPromise) {
    nodeWasmPathPromise = (async () => {
      const fsModName = 'node:' + 'fs';
      const pathModName = 'node:' + 'path';
      const fs = await import(/* webpackIgnore: true */ fsModName);
      const path = await import(/* webpackIgnore: true */ pathModName);

      // Walk upward from __dirname (when available) and process.cwd() to locate public/pdf-wasm/qpdf.wasm.
      const starts = [typeof __dirname === 'string' ? __dirname : '', process.cwd()].filter(Boolean);
      const visited = new Set<string>();
      for (const start of starts) {
        let dir = path.resolve(start);
        for (let depth = 0; depth < 6; depth++) {
          if (!visited.has(dir)) {
            visited.add(dir);
            const publicCandidate = path.join(dir, 'public', 'pdf-wasm', 'qpdf.wasm');
            if (fs.existsSync(publicCandidate)) return publicCandidate;
            const modCandidate = path.join(dir, 'node_modules', '@neslinesli93', 'qpdf-wasm', 'dist', 'qpdf.wasm');
            if (fs.existsSync(modCandidate)) return modCandidate;
          }
          const parent = path.dirname(dir);
          if (parent === dir) break;
          dir = parent;
        }
      }
      throw new Error('Could not locate qpdf.wasm in public/pdf-wasm/ or node_modules/.');
    })();
  }
  return nodeWasmPathPromise;
}

function decodeBytes(bytes: number[]): string {
  if (bytes.length === 0) return '';
  return new TextDecoder('utf-8').decode(Uint8Array.from(bytes));
}

function extractExitCode(err: unknown): number | null {
  if (err && typeof err === 'object' && 'status' in err && typeof (err as { status: unknown }).status === 'number') {
    return (err as { status: number }).status;
  }
  return null;
}

/**
 * Runs QPDF on an in-memory PDF buffer.
 *
 * Pass `'$IN'` and (optionally) `'$OUT'` tokens in `args`; they are mapped to `/in.pdf` and `/out.pdf`
 * inside an isolated Emscripten virtual filesystem. QPDF exit codes:
 * - `0`: succeeded with no warnings
 * - `2`: error (failed)
 * - `3`: succeeded with warnings
 */
export async function runQpdf(
  input: Uint8Array,
  args: string[],
  options?: { expectOutput?: boolean },
): Promise<QpdfRunResult> {
  const factory = await loadQpdfFactory();
  const isNode = !isBrowserWindow() && !isWorkerScope();
  const wasmLocation = isNode ? await resolveNodeWasmPath() : resolveOriginUrl(QPDF_WASM_URL);

  const stdoutBytes: number[] = [];
  const stderrBytes: number[] = [];

  const qpdf = await factory({
    locateFile: () => wasmLocation,
    noInitialRun: true,
    noFSInit: true,
    preRun: [
      (mod) => {
        mod.FS.init(
          null,
          (ch: number) => {
            if (ch !== null && ch !== undefined) stdoutBytes.push(ch & 0xff);
          },
          (ch: number) => {
            if (ch !== null && ch !== undefined) stderrBytes.push(ch & 0xff);
          },
        );
      },
    ],
  });

  const inPath = '/in.pdf';
  const outPath = '/out.pdf';
  const resolvedArgs = args.map((arg) => (arg === '$IN' ? inPath : arg === '$OUT' ? outPath : arg));
  const referencesOut = resolvedArgs.includes(outPath);
  const expectOutput = options?.expectOutput ?? referencesOut;

  qpdf.FS.writeFile(inPath, input);

  // In Node.js, Emscripten's callMain sets process.exitCode = code on every exit; preserve prior value.
  const prevExitCode = isNode && typeof process !== 'undefined' ? process.exitCode : undefined;
  let exitCode = 0;

  try {
    // Pass a copy because Emscripten's callMain mutates its argument array (unshift).
    const rc = qpdf.callMain([...resolvedArgs]);
    if (typeof rc === 'number') exitCode = rc;
  } catch (err) {
    const status = extractExitCode(err);
    if (status !== null) {
      exitCode = status;
    } else {
      throw err;
    }
  } finally {
    if (isNode && typeof process !== 'undefined') {
      process.exitCode = prevExitCode;
    }
  }

  let output: Uint8Array | undefined;
  try {
    if (expectOutput && (exitCode === 0 || exitCode === 3)) {
      const raw = qpdf.FS.readFile(outPath);
      // Copy out of WASM memory so the returned buffer stays valid after GC.
      output = new Uint8Array(raw);
    }
  } catch {
    output = undefined;
  } finally {
    try {
      qpdf.FS.unlink(inPath);
    } catch {
      // ignore if already removed
    }
    try {
      qpdf.FS.unlink(outPath);
    } catch {
      // ignore if never created
    }
  }

  return {
    output,
    exitCode,
    stdout: decodeBytes(stdoutBytes),
    stderr: decodeBytes(stderrBytes),
  };
}

/**
 * Inspects a PDF with `qpdf --check`, returning structured warnings, errors, and linearization status.
 */
export async function checkQpdf(input: Uint8Array, password?: string): Promise<QpdfCheckResult> {
  const args: string[] = [];
  if (password !== undefined && password !== '') {
    args.push(`--password=${password}`);
  }
  args.push('--check', '$IN');

  const res = await runQpdf(input, args, { expectOutput: false });

  const warnings: string[] = [];
  const errors: string[] = [];

  const allLines = `${res.stdout}\n${res.stderr}`
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of allLines) {
    if (/^WARNING:/i.test(line)) {
      warnings.push(line.replace(/^WARNING:\s*/i, ''));
    } else if (/^qpdf:/i.test(line) || /^ERROR:/i.test(line) || /^invalid password/i.test(line)) {
      errors.push(line);
    }
  }

  // If qpdf exited with a non-warning error code but stderr had lines without a standard prefix, include them.
  if (res.exitCode !== 0 && res.exitCode !== 3 && errors.length === 0) {
    const errLines = res.stderr
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !/^WARNING:/i.test(line));
    errors.push(...errLines);
  }

  const isLinearized = /^File is linearized$/im.test(res.stdout);

  return {
    ok: res.exitCode === 0 || res.exitCode === 3,
    exitCode: res.exitCode,
    warnings,
    errors,
    isLinearized,
    stdout: res.stdout,
    stderr: res.stderr,
  };
}
