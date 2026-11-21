// Core self-hosted Ghostscript WebAssembly runtime (@wasmedia/wghostscript, Ghostscript 10.08.0, AGPL-3.0).
// Kept separate from lib/pdf/ghostscript.ts so lib/pdf/ghostscript.worker.ts forms a strict acyclic dependency graph.
//
// Browser / Web Worker: dynamically imports `/pdf-wasm/gs/wghostscript.js` and loads `/pdf-wasm/gs/wghostscript.wasm`
// from public/pdf-wasm/gs/ (copied by scripts/copy-pdf-wasm-assets.mjs), with zero CDN fetches and zero bundling.
// Node.js (verification harness): resolves public/pdf-wasm/gs/wghostscript.{js,wasm} on disk (falling back to
// node_modules/@wasmedia/wghostscript/dist/) and executes directly.
//
// Calls are serialized on a module instance with isolated per-run virtual FS cleanup, C stack save/restore,
// and byte-level stdout/stderr capture; any unexpected WASM trap discards the instance so the next call starts fresh.

import type { WasmModule } from '@wasmedia/wghostscript' with { 'resolution-mode': 'import' };

export const GS_JS_URL = '/pdf-wasm/gs/wghostscript.js';
export const GS_WASM_URL = '/pdf-wasm/gs/wghostscript.wasm';

export interface GhostscriptRunOptions {
  /** Extra files written into the virtual filesystem before invocation (e.g. ICC profiles or PDFA_def.ps). */
  extraFiles?: Record<string, Uint8Array | string>;
  /** Output file path inside the virtual filesystem (default `'/out.pdf'`). */
  outputFile?: string;
}

export interface GhostscriptRunResult {
  output?: Uint8Array;
  exitCode: number;
  stdout: string;
  stderr: string;
}

export type GhostscriptCompressPreset = 'screen' | 'ebook' | 'printer' | 'prepress';

export interface GhostscriptCompressOptions {
  preset: GhostscriptCompressPreset;
  colorMode?: 'original' | 'grayscale';
  compatibilityLevel?: '1.4' | '1.5' | '1.7';
  password?: string;
}

type RawGsFactory = (moduleArg?: Record<string, unknown>) => Promise<WasmModule>;

let modulePromise: Promise<WasmModule> | null = null;
let nodeAssetPathsPromise: Promise<{ jsPath: string; wasmPath: string }> | null = null;
let activeStdout: ((byte: number) => void) | null = null;
let activeStderr: ((byte: number) => void) | null = null;
let runQueue: Promise<void> = Promise.resolve();

function isNodeRuntime(): boolean {
  return typeof process !== 'undefined' && Boolean(process.versions?.node);
}

function resolveOriginUrl(path: string): string {
  if (typeof self !== 'undefined' && self.location?.origin && self.location.origin !== 'null') {
    return new URL(path, self.location.origin).href;
  }
  return path;
}

async function resolveNodeAssetPaths(): Promise<{ jsPath: string; wasmPath: string }> {
  if (!nodeAssetPathsPromise) {
    nodeAssetPathsPromise = (async () => {
      const fsModName = 'node:' + 'fs';
      const pathModName = 'node:' + 'path';
      const fs = await import(/* webpackIgnore: true */ fsModName);
      const path = await import(/* webpackIgnore: true */ pathModName);

      const starts = [typeof __dirname === 'string' ? __dirname : '', process.cwd()].filter(Boolean);
      const visited = new Set<string>();
      for (const start of starts) {
        let dir = path.resolve(start);
        for (let depth = 0; depth < 6; depth++) {
          if (!visited.has(dir)) {
            visited.add(dir);
            const pubJs = path.join(dir, 'public', 'pdf-wasm', 'gs', 'wghostscript.js');
            const pubWasm = path.join(dir, 'public', 'pdf-wasm', 'gs', 'wghostscript.wasm');
            if (fs.existsSync(pubJs) && fs.existsSync(pubWasm)) {
              return { jsPath: pubJs, wasmPath: pubWasm };
            }
            const modJs = path.join(dir, 'node_modules', '@wasmedia', 'wghostscript', 'dist', 'wghostscript.js');
            const modWasm = path.join(dir, 'node_modules', '@wasmedia', 'wghostscript', 'dist', 'wghostscript.wasm');
            if (fs.existsSync(modJs) && fs.existsSync(modWasm)) {
              return { jsPath: modJs, wasmPath: modWasm };
            }
          }
          const parent = path.dirname(dir);
          if (parent === dir) break;
          dir = parent;
        }
      }
      throw new Error('Could not locate wghostscript.{js,wasm} in public/pdf-wasm/gs/ or node_modules/.');
    })();
  }
  return nodeAssetPathsPromise;
}

async function loadGhostscriptModule(): Promise<WasmModule> {
  if (!modulePromise) {
    modulePromise = (async () => {
      let factory: RawGsFactory;
      let wasmLocation: string;

      if (isNodeRuntime()) {
        const { jsPath, wasmPath } = await resolveNodeAssetPaths();
        const urlModName = 'node:' + 'url';
        const urlMod = await import(/* webpackIgnore: true */ urlModName);
        const jsUrl = urlMod.pathToFileURL(jsPath).href;
        const glue = await import(/* webpackIgnore: true */ jsUrl);
        factory = glue.default ?? glue;
        wasmLocation = wasmPath;
      } else {
        const jsUrl = resolveOriginUrl(GS_JS_URL);
        wasmLocation = resolveOriginUrl(GS_WASM_URL);
        const glue = await import(/* webpackIgnore: true */ jsUrl);
        factory = glue.default ?? glue;
      }

      if (typeof factory !== 'function') {
        throw new Error('Failed to load Ghostscript WebAssembly runtime.');
      }

      return factory({
        stdout: (byte: number | null) => {
          if (byte !== null && byte !== undefined && activeStdout) activeStdout(byte & 0xff);
        },
        stderr: (byte: number | null) => {
          if (byte !== null && byte !== undefined && activeStderr) activeStderr(byte & 0xff);
        },
        // Prevent Ghostscript from blocking on host stdin or browser window.prompt().
        stdin: () => null,
        locateFile: (path: string) => (path.endsWith('.wasm') ? wasmLocation : path),
      });
    })();

    modulePromise.catch(() => {
      modulePromise = null;
    });
  }
  return modulePromise;
}

function parentDir(filePath: string): string | null {
  const idx = filePath.lastIndexOf('/');
  if (idx <= 0) return null;
  return filePath.slice(0, idx);
}

function ensureParentDir(mod: WasmModule, filePath: string) {
  const dir = parentDir(filePath);
  if (!dir) return;
  try {
    mod.FS.mkdirTree(dir);
  } catch {
    // Directory already exists.
  }
}

function safeUnlink(mod: WasmModule, filePath: string) {
  try {
    mod.FS.unlink(filePath);
  } catch {
    // Ignore if already removed or never created.
  }
}

function decodeUtf8(bytes: number[]): string {
  if (bytes.length === 0) return '';
  return new TextDecoder('utf-8').decode(Uint8Array.from(bytes));
}

function extractExitCode(err: unknown): number | null {
  if (err && typeof err === 'object' && 'status' in err && typeof (err as { status: unknown }).status === 'number') {
    return (err as { status: number }).status;
  }
  return null;
}

function toBytes(value: Uint8Array | string): Uint8Array {
  return typeof value === 'string' ? new TextEncoder().encode(value) : value;
}

/**
 * Executes Ghostscript directly in the current JS context (Node.js, Web Worker, or main-thread fallback).
 * Calls are serialized through an internal queue so virtual FS files and stdio capture never collide.
 */
export function runGhostscriptDirect(
  input: Uint8Array,
  args: string[],
  options?: GhostscriptRunOptions,
): Promise<GhostscriptRunResult> {
  const task = runQueue.then(() => executeGhostscriptOnce(input, args, options));
  runQueue = task.then(
    () => undefined,
    () => undefined,
  );
  return task;
}

async function executeGhostscriptOnce(
  input: Uint8Array,
  args: string[],
  options?: GhostscriptRunOptions,
): Promise<GhostscriptRunResult> {
  const mod = await loadGhostscriptModule();
  const inPath = '/in.pdf';
  const outPath = options?.outputFile ?? '/out.pdf';
  const writtenPaths: string[] = [];

  safeUnlink(mod, inPath);
  safeUnlink(mod, outPath);
  ensureParentDir(mod, outPath);

  mod.FS.writeFile(inPath, input);
  writtenPaths.push(inPath);

  if (options?.extraFiles) {
    for (const [filePath, data] of Object.entries(options.extraFiles)) {
      safeUnlink(mod, filePath);
      ensureParentDir(mod, filePath);
      mod.FS.writeFile(filePath, toBytes(data));
      writtenPaths.push(filePath);
    }
  }

  const resolvedArgs = args.map((arg) => arg.replaceAll('$IN', inPath).replaceAll('$OUT', outPath));
  const stdoutBytes: number[] = [];
  const stderrBytes: number[] = [];

  activeStdout = (b) => stdoutBytes.push(b);
  activeStderr = (b) => stderrBytes.push(b);

  const isNode = isNodeRuntime();
  const prevExitCode = isNode ? process.exitCode : undefined;
  const sp = mod.stackSave?.();
  let exitCode = 0;

  try {
    const rc = mod.callMain([...resolvedArgs]);
    if (typeof rc === 'number') exitCode = rc;
  } catch (err) {
    const status = extractExitCode(err);
    if (status !== null) {
      exitCode = status;
    } else {
      // Unexpected WASM trap or runtime abort: discard instance so the next call starts clean.
      modulePromise = null;
      throw err;
    }
  } finally {
    if (sp !== undefined) mod.stackRestore?.(sp);
    if (isNode) process.exitCode = prevExitCode;
    activeStdout = null;
    activeStderr = null;
  }

  let output: Uint8Array | undefined;
  try {
    if (exitCode === 0) {
      const raw = mod.FS.readFile(outPath);
      // Copy out of WASM linear memory so the returned buffer remains detached and safe.
      output = new Uint8Array(raw);
    }
  } catch {
    output = undefined;
  } finally {
    safeUnlink(mod, outPath);
    for (const filePath of writtenPaths) {
      safeUnlink(mod, filePath);
    }
  }

  return {
    output,
    exitCode,
    stdout: decodeUtf8(stdoutBytes).trimEnd(),
    stderr: decodeUtf8(stderrBytes).trimEnd(),
  };
}
