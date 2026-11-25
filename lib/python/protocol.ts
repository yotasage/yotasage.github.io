// Shared worker protocol types, SAB binary layout constants, and strict runtime validator.
// Security rule (security.md §4): every worker message is untrusted input and carries data only.

import type { NetworkMode } from './network';
import { MAX_WORKSPACE_ENTRIES, normalizeWorkspacePath } from './paths';
import {
  isLockTag,
  validateMissingPackages,
  validatePackageMessage,
} from './packageProtocol';
import type {
  PackageMainToWorkerMessage,
  PackageWorkerToMainMessage,
} from './packageProtocol';
import { validateDisplayMessage } from './displayProtocol';
import type { DisplayWorkerMessage } from './displayProtocol';

export type CapabilityTier = 1 | 2 | 3;

// SharedArrayBuffer binary layout (S3 finalized contract)
export const CONTROL_SAB_BYTES = 64; // 16 x Int32 slots
export const STDIN_SAB_BYTES = 65536; // 64 KiB raw UTF-8 chunk buffer

// Int32 slot indices inside controlSab
export const CTRL_INTERRUPT = 0; // Main stores SIGINT (2) + Atomics.notify; aliased for setInterruptBuffer
export const CTRL_STDIN_STATE = 1; // STDIN_* state machine
export const CTRL_STDIN_LEN = 2; // UTF-8 byte count in stdinSab (0..65536)
export const CTRL_STDIN_SEQ = 3; // Monotonic request sequence number
// Slots 4..15 (bytes 16..63): the display (CTRL_DISPLAY_STATE ... CTRL_EV_DROPPED in displayProtocol.ts).

export const SIGINT = 2;

export const STDIN_IDLE = 0;
export const STDIN_REQUEST = 1;
export const STDIN_CHUNK_READY = 2;
export const STDIN_CHUNK_FINAL = 3;
export const STDIN_EOF = 4;
export const STDIN_INTERRUPTED = 5;

// Protocol payload caps
export const MAX_STREAM_CHUNK_CHARS = 256 * 1024;
export const MAX_ERROR_TEXT_CHARS = 128 * 1024;
export const MAX_STATUS_TEXT_CHARS = 512;
export const MAX_TRACEBACK_FRAMES = 200;
export const MAX_COMPLETIONS = 500;
export const MAX_COMPLETION_ITEM_CHARS = 256;
export const MAX_LINK_URL_CHARS = 4096;
export const MAX_FILE_PATH_CHARS = 512;
export const MAX_PLOT_BYTES = 25 * 1024 * 1024;
export const MAX_PLOT_ID_CHARS = 64;
export const MAX_PLOT_TITLE_CHARS = 256;
export const MAX_PLOT_DIM = 16384;

export type PlotSource = 'matplotlib' | 'pillow';
export type PlotExportFormat = 'svg' | 'pdf';

export interface PythonErrorFrame {
  readonly file: string;
  readonly line: number;
  readonly column?: number;
  readonly fn: string;
  readonly text?: string;
}

export interface PythonErrorInfo {
  readonly type: string;
  readonly message: string;
  readonly formatted: string;
  readonly frames: readonly PythonErrorFrame[];
}

export interface SecurityStatusInfo {
  readonly cspConfirmed: boolean;
  readonly mode: NetworkMode;
  readonly violationDirective: string | null;
  readonly reason?: string;
}

export interface WorkerInitPayload {
  readonly controlSab: SharedArrayBuffer | null;
  readonly stdinSab: SharedArrayBuffer | null;
  readonly networkMode: NetworkMode;
  readonly pyodideIndexUrl: string;
  readonly pyodideLockUrl: string;
  readonly runtimeBaseUrl: string;
  readonly storagePort?: MessagePort | null;
}

export interface FsChangeInfo {
  readonly created: readonly string[];
  readonly modified: readonly string[];
  readonly deleted: readonly string[];
}

export type MainToWorkerMessage =
  | { readonly type: 'init'; readonly id: number; readonly payload: WorkerInitPayload }
  | {
      readonly type: 'run';
      readonly id: number;
      readonly code?: string | null;
      readonly filename?: string;
      readonly files?: Readonly<Record<string, string>>;
      readonly autoLoadPackages?: boolean;
      readonly syncRev?: number;
    }
  | { readonly type: 'stop'; readonly id: number }
  | { readonly type: 'repl.push'; readonly id: number; readonly line: string }
  | { readonly type: 'repl.complete'; readonly id: number; readonly source: string }
  | {
      readonly type: 'stdin.reply';
      readonly seq: number;
      readonly text: string | null;
      readonly eof?: boolean;
      readonly interrupted?: boolean;
    }
  | {
      readonly type: 'fs.write';
      readonly id: number;
      readonly path: string;
      readonly bytes: Uint8Array;
      readonly rev?: number;
    }
  | {
      readonly type: 'fs.mkdir';
      readonly id: number;
      readonly path: string;
      readonly rev?: number;
    }
  | {
      readonly type: 'fs.rename';
      readonly id: number;
      readonly from: string;
      readonly to: string;
      readonly rev?: number;
    }
  | {
      readonly type: 'fs.delete';
      readonly id: number;
      readonly path: string;
      readonly rev?: number;
    }
  | {
      readonly type: 'fs.sync';
      readonly id: number;
    }
  | {
      readonly type: 'plot.export';
      readonly id: string;
      readonly plotId: string;
      readonly format: PlotExportFormat;
    }
  | PackageMainToWorkerMessage;

export type WorkerToMainMessage =
  | {
      readonly type: 'security.status';
      readonly status: SecurityStatusInfo;
    }
  | {
      readonly type: 'status';
      readonly phase: StatusPhase;
      readonly message: string;
    }
  | {
      readonly type: 'ready';
      readonly id: number;
      readonly pyodideVersion: string;
      readonly pythonVersion: string;
      readonly tier: CapabilityTier;
      readonly crossOriginIsolated: boolean;
      readonly canRunSync: boolean;
      /** From the Pyodide lock file, e.g. 2026_0 and emscripten_5_0_3 ('' if a worker left them out). */
      readonly abiVersion: string;
      readonly platform: string;
    }
  | {
      readonly type: 'stdout';
      readonly text: string;
    }
  | {
      readonly type: 'stderr';
      readonly text: string;
    }
  | {
      readonly type: 'stdin.request';
      readonly seq: number;
      readonly mode: 'sab' | 'jspi';
    }
  | {
      readonly type: 'stdin.chunk_ack';
      readonly seq: number;
    }
  | {
      readonly type: 'run.start';
      readonly id: number;
      readonly filename: string;
    }
  | {
      readonly type: 'run.end';
      readonly id: number;
      readonly ok: boolean;
      readonly exitCode: number;
      readonly interrupted: boolean;
      readonly durationMs: number;
      readonly error?: PythonErrorInfo;
      /** Bundled packages a run imported without the pre-run scan seeing it (missed-import finder). */
      readonly missingPackages?: readonly string[];
    }
  | {
      readonly type: 'repl.result';
      readonly id: number;
      readonly status: 'complete' | 'incomplete' | 'syntax-error' | 'error';
      readonly error?: PythonErrorInfo;
    }
  | {
      readonly type: 'repl.completions';
      readonly id: number;
      readonly completions: readonly string[];
      readonly start: number;
    }
  | {
      readonly type: 'link.request';
      readonly url: string;
    }
  | {
      readonly type: 'fs.changed';
      readonly created: readonly string[];
      readonly modified: readonly string[];
      readonly deleted: readonly string[];
    }
  | {
      readonly type: 'plot.new';
      readonly plotId: string;
      readonly title: string;
      readonly width: number;
      readonly height: number;
      readonly pngBytes: Uint8Array;
      readonly canExportVector: boolean;
      readonly source: PlotSource;
      readonly createdAt: number;
    }
  | {
      readonly type: 'plot.export.result';
      readonly id: string;
      readonly ok: boolean;
      readonly plotId: string;
      readonly format: PlotExportFormat;
      readonly bytes?: Uint8Array;
      readonly error?: string;
    }
  | {
      readonly type: 'error';
      readonly id?: number;
      readonly message: string;
    }
  | PackageWorkerToMainMessage
  | DisplayWorkerMessage;

export type ValidationResult =
  | { readonly ok: true; readonly message: WorkerToMainMessage }
  | { readonly ok: false; readonly reason: string };

const VALID_MODES = new Set<string>(['off', 'pkg', 'hosts', 'all']);
export type StatusPhase = 'booting' | 'loading-packages' | 'installing' | 'ready' | 'running' | 'idle';
const VALID_PHASES = new Set<string>([
  'booting',
  'loading-packages',
  'installing',
  'ready',
  'running',
  'idle',
]);
const VALID_REPL_STATUSES = new Set<string>(['complete', 'incomplete', 'syntax-error', 'error']);
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;

function hasPngSignature(bytes: Uint8Array): boolean {
  if (bytes.byteLength < 24) return false;
  for (let i = 0; i < PNG_MAGIC.length; i += 1) {
    if (bytes[i] !== PNG_MAGIC[i]) return false;
  }
  return true;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isBoundedString(v: unknown, maxLen: number): v is string {
  return typeof v === 'string' && v.length <= maxLen;
}

function isFiniteInt(v: unknown, min = -2147483648, max = 2147483647): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;
}

function isFiniteNonNeg(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0;
}

function validateErrorInfo(raw: unknown): PythonErrorInfo | null {
  if (!isRecord(raw)) return null;
  if (!isBoundedString(raw.type, 256)) return null;
  if (!isBoundedString(raw.message, MAX_ERROR_TEXT_CHARS)) return null;
  if (!isBoundedString(raw.formatted, MAX_ERROR_TEXT_CHARS)) return null;
  if (!Array.isArray(raw.frames) || raw.frames.length > MAX_TRACEBACK_FRAMES) return null;

  const frames: PythonErrorFrame[] = [];
  for (const f of raw.frames) {
    if (!isRecord(f)) return null;
    if (!isBoundedString(f.file, MAX_FILE_PATH_CHARS)) return null;
    if (!isFiniteInt(f.line, 0, 10_000_000)) return null;
    if (!isBoundedString(f.fn, 512)) return null;
    let column: number | undefined;
    if (f.column !== undefined) {
      if (!isFiniteInt(f.column, 0, 1_000_000)) return null;
      column = f.column;
    }
    let text: string | undefined;
    if (f.text !== undefined) {
      if (!isBoundedString(f.text, 2048)) return null;
      text = f.text;
    }
    frames.push({
      file: f.file,
      line: f.line,
      ...(column !== undefined ? { column } : {}),
      fn: f.fn,
      ...(text !== undefined ? { text } : {}),
    });
  }

  return {
    type: raw.type,
    message: raw.message,
    formatted: raw.formatted,
    frames,
  };
}

/** Validates an untrusted message received from the Python Web Worker. */
export function validateWorkerMessage(raw: unknown): ValidationResult {
  if (!isRecord(raw) || typeof raw.type !== 'string') {
    return { ok: false, reason: 'Message must be an object with a string type' };
  }

  switch (raw.type) {
    case 'security.status': {
      if (!isRecord(raw.status)) return { ok: false, reason: 'Invalid security.status payload' };
      const st = raw.status;
      if (typeof st.cspConfirmed !== 'boolean') return { ok: false, reason: 'Invalid cspConfirmed' };
      if (typeof st.mode !== 'string' || !VALID_MODES.has(st.mode)) {
        return { ok: false, reason: 'Invalid network mode' };
      }
      let violationDirective: string | null = null;
      if (st.violationDirective !== null) {
        if (!isBoundedString(st.violationDirective, 256)) {
          return { ok: false, reason: 'Invalid violationDirective' };
        }
        violationDirective = st.violationDirective;
      }
      let reason: string | undefined;
      if (st.reason !== undefined) {
        if (!isBoundedString(st.reason, MAX_STATUS_TEXT_CHARS)) {
          return { ok: false, reason: 'Invalid security status reason' };
        }
        reason = st.reason;
      }
      return {
        ok: true,
        message: {
          type: 'security.status',
          status: {
            cspConfirmed: st.cspConfirmed,
            mode: st.mode as NetworkMode,
            violationDirective,
            ...(reason !== undefined ? { reason } : {}),
          },
        },
      };
    }

    case 'status': {
      if (typeof raw.phase !== 'string' || !VALID_PHASES.has(raw.phase)) {
        return { ok: false, reason: 'Invalid status phase' };
      }
      if (!isBoundedString(raw.message, MAX_STATUS_TEXT_CHARS)) {
        return { ok: false, reason: 'Status message invalid or too long' };
      }
      return {
        ok: true,
        message: {
          type: 'status',
          phase: raw.phase as StatusPhase,
          message: raw.message,
        },
      };
    }

    case 'ready': {
      if (!isFiniteInt(raw.id, 0)) return { ok: false, reason: 'Invalid ready id' };
      if (!isBoundedString(raw.pyodideVersion, 64) || !isBoundedString(raw.pythonVersion, 64)) {
        return { ok: false, reason: 'Invalid version strings in ready' };
      }
      if (raw.tier !== 1 && raw.tier !== 2 && raw.tier !== 3) {
        return { ok: false, reason: 'Invalid tier in ready' };
      }
      if (typeof raw.crossOriginIsolated !== 'boolean' || typeof raw.canRunSync !== 'boolean') {
        return { ok: false, reason: 'Invalid capability booleans in ready' };
      }
      if (
        (raw.abiVersion !== undefined && !isLockTag(raw.abiVersion)) ||
        (raw.platform !== undefined && !isLockTag(raw.platform))
      ) {
        return { ok: false, reason: 'Invalid abiVersion or platform in ready' };
      }
      return {
        ok: true,
        message: {
          type: 'ready',
          id: raw.id,
          pyodideVersion: raw.pyodideVersion,
          pythonVersion: raw.pythonVersion,
          tier: raw.tier,
          crossOriginIsolated: raw.crossOriginIsolated,
          canRunSync: raw.canRunSync,
          abiVersion: typeof raw.abiVersion === 'string' ? raw.abiVersion : '',
          platform: typeof raw.platform === 'string' ? raw.platform : '',
        },
      };
    }

    case 'stdout':
    case 'stderr': {
      if (!isBoundedString(raw.text, MAX_STREAM_CHUNK_CHARS)) {
        return { ok: false, reason: `${raw.type} chunk missing or exceeds cap` };
      }
      return { ok: true, message: { type: raw.type, text: raw.text } };
    }

    case 'stdin.request': {
      if (!isFiniteInt(raw.seq, 0)) return { ok: false, reason: 'Invalid stdin.request seq' };
      if (raw.mode !== 'sab' && raw.mode !== 'jspi') {
        return { ok: false, reason: 'Invalid stdin.request mode' };
      }
      return { ok: true, message: { type: 'stdin.request', seq: raw.seq, mode: raw.mode } };
    }

    case 'stdin.chunk_ack': {
      if (!isFiniteInt(raw.seq, 0)) return { ok: false, reason: 'Invalid stdin.chunk_ack seq' };
      return { ok: true, message: { type: 'stdin.chunk_ack', seq: raw.seq } };
    }

    case 'run.start': {
      if (!isFiniteInt(raw.id, 0)) return { ok: false, reason: 'Invalid run.start id' };
      if (!isBoundedString(raw.filename, MAX_FILE_PATH_CHARS)) {
        return { ok: false, reason: 'Invalid run.start filename' };
      }
      return { ok: true, message: { type: 'run.start', id: raw.id, filename: raw.filename } };
    }

    case 'run.end': {
      if (!isFiniteInt(raw.id, 0)) return { ok: false, reason: 'Invalid run.end id' };
      if (typeof raw.ok !== 'boolean') return { ok: false, reason: 'Invalid run.end ok' };
      if (!isFiniteInt(raw.exitCode, -1000, 1000)) return { ok: false, reason: 'Invalid exitCode' };
      if (typeof raw.interrupted !== 'boolean') return { ok: false, reason: 'Invalid interrupted' };
      if (!isFiniteNonNeg(raw.durationMs)) return { ok: false, reason: 'Invalid durationMs' };
      let error: PythonErrorInfo | undefined;
      if (raw.error !== undefined) {
        const parsed = validateErrorInfo(raw.error);
        if (!parsed) return { ok: false, reason: 'Invalid run.end error payload' };
        error = parsed;
      }
      let missingPackages: string[] | undefined;
      if (raw.missingPackages !== undefined) {
        const parsed = validateMissingPackages(raw.missingPackages);
        if (!parsed) return { ok: false, reason: 'Invalid run.end missingPackages' };
        missingPackages = parsed;
      }
      return {
        ok: true,
        message: {
          type: 'run.end',
          id: raw.id,
          ok: raw.ok,
          exitCode: raw.exitCode,
          interrupted: raw.interrupted,
          durationMs: raw.durationMs,
          ...(error ? { error } : {}),
          ...(missingPackages ? { missingPackages } : {}),
        },
      };
    }

    case 'repl.result': {
      if (!isFiniteInt(raw.id, 0)) return { ok: false, reason: 'Invalid repl.result id' };
      if (typeof raw.status !== 'string' || !VALID_REPL_STATUSES.has(raw.status)) {
        return { ok: false, reason: 'Invalid repl.result status' };
      }
      let error: PythonErrorInfo | undefined;
      if (raw.error !== undefined) {
        const parsed = validateErrorInfo(raw.error);
        if (!parsed) return { ok: false, reason: 'Invalid repl.result error payload' };
        error = parsed;
      }
      return {
        ok: true,
        message: {
          type: 'repl.result',
          id: raw.id,
          status: raw.status as 'complete' | 'incomplete' | 'syntax-error' | 'error',
          ...(error ? { error } : {}),
        },
      };
    }

    case 'repl.completions': {
      if (!isFiniteInt(raw.id, 0)) return { ok: false, reason: 'Invalid repl.completions id' };
      if (!isFiniteInt(raw.start, 0, MAX_STREAM_CHUNK_CHARS)) {
        return { ok: false, reason: 'Invalid repl.completions start' };
      }
      if (!Array.isArray(raw.completions) || raw.completions.length > MAX_COMPLETIONS) {
        return { ok: false, reason: 'Invalid or oversized completions list' };
      }
      const completions: string[] = [];
      for (const item of raw.completions) {
        if (!isBoundedString(item, MAX_COMPLETION_ITEM_CHARS)) {
          return { ok: false, reason: 'Invalid completion item' };
        }
        completions.push(item);
      }
      return {
        ok: true,
        message: { type: 'repl.completions', id: raw.id, completions, start: raw.start },
      };
    }

    case 'link.request': {
      if (!isBoundedString(raw.url, MAX_LINK_URL_CHARS)) {
        return { ok: false, reason: 'Invalid or oversized link.request url' };
      }
      let parsed: URL;
      try {
        parsed = new URL(raw.url);
      } catch {
        return { ok: false, reason: 'Malformed link.request URL' };
      }
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return { ok: false, reason: 'link.request only accepts http: or https: URLs' };
      }
      return { ok: true, message: { type: 'link.request', url: parsed.href } };
    }

    case 'fs.changed': {
      const validateList = (arr: unknown): string[] | null => {
        if (!Array.isArray(arr) || arr.length > MAX_WORKSPACE_ENTRIES) return null;
        const out: string[] = [];
        for (const item of arr) {
          if (typeof item !== 'string') return null;
          const norm = normalizeWorkspacePath(item);
          if (!norm.ok) return null;
          out.push(norm.path);
        }
        return out;
      };
      const created = validateList(raw.created);
      const modified = validateList(raw.modified);
      const deleted = validateList(raw.deleted);
      if (!created || !modified || !deleted) {
        return { ok: false, reason: 'Invalid or unsafe path list in fs.changed' };
      }
      return {
        ok: true,
        message: { type: 'fs.changed', created, modified, deleted },
      };
    }

    case 'plot.new': {
      if (!isBoundedString(raw.plotId, MAX_PLOT_ID_CHARS) || raw.plotId.length === 0) {
        return { ok: false, reason: 'Invalid or empty plotId in plot.new' };
      }
      if (!isBoundedString(raw.title, MAX_PLOT_TITLE_CHARS)) {
        return { ok: false, reason: 'Invalid or oversized title in plot.new' };
      }
      if (!isFiniteInt(raw.width, 1, MAX_PLOT_DIM) || !isFiniteInt(raw.height, 1, MAX_PLOT_DIM)) {
        return { ok: false, reason: 'Invalid plot dimensions in plot.new' };
      }
      if (!(raw.pngBytes instanceof Uint8Array)) {
        return { ok: false, reason: 'plot.new pngBytes must be a Uint8Array' };
      }
      if (raw.pngBytes.byteLength > MAX_PLOT_BYTES) {
        return { ok: false, reason: 'plot.new pngBytes exceeds 25 MiB cap' };
      }
      if (!hasPngSignature(raw.pngBytes)) {
        return { ok: false, reason: 'plot.new pngBytes missing valid PNG signature' };
      }
      if (typeof raw.canExportVector !== 'boolean') {
        return { ok: false, reason: 'Invalid canExportVector in plot.new' };
      }
      if (raw.source !== 'matplotlib' && raw.source !== 'pillow') {
        return { ok: false, reason: 'Invalid source in plot.new' };
      }
      if (!isFiniteNonNeg(raw.createdAt)) {
        return { ok: false, reason: 'Invalid createdAt in plot.new' };
      }
      return {
        ok: true,
        message: {
          type: 'plot.new',
          plotId: raw.plotId,
          title: raw.title,
          width: raw.width,
          height: raw.height,
          pngBytes: raw.pngBytes,
          canExportVector: raw.canExportVector,
          source: raw.source,
          createdAt: raw.createdAt,
        },
      };
    }

    case 'plot.export.result': {
      if (!isBoundedString(raw.id, 64) || raw.id.length === 0) {
        return { ok: false, reason: 'Invalid id in plot.export.result' };
      }
      if (typeof raw.ok !== 'boolean') {
        return { ok: false, reason: 'Invalid ok in plot.export.result' };
      }
      if (!isBoundedString(raw.plotId, MAX_PLOT_ID_CHARS) || raw.plotId.length === 0) {
        return { ok: false, reason: 'Invalid plotId in plot.export.result' };
      }
      if (raw.format !== 'svg' && raw.format !== 'pdf') {
        return { ok: false, reason: 'Invalid format in plot.export.result' };
      }
      let bytes: Uint8Array | undefined;
      if (raw.bytes !== undefined) {
        if (!(raw.bytes instanceof Uint8Array)) {
          return { ok: false, reason: 'plot.export.result bytes must be a Uint8Array' };
        }
        if (raw.bytes.byteLength === 0 || raw.bytes.byteLength > MAX_PLOT_BYTES) {
          return { ok: false, reason: 'plot.export.result bytes empty or exceeds 25 MiB cap' };
        }
        bytes = raw.bytes;
      }
      if (raw.ok && !bytes) {
        return { ok: false, reason: 'Successful plot.export.result requires bytes' };
      }
      let error: string | undefined;
      if (raw.error !== undefined) {
        if (!isBoundedString(raw.error, MAX_ERROR_TEXT_CHARS)) {
          return { ok: false, reason: 'Invalid or oversized error in plot.export.result' };
        }
        error = raw.error;
      }
      return {
        ok: true,
        message: {
          type: 'plot.export.result',
          id: raw.id,
          ok: raw.ok,
          plotId: raw.plotId,
          format: raw.format,
          ...(bytes ? { bytes } : {}),
          ...(error !== undefined ? { error } : {}),
        },
      };
    }

    case 'error': {
      let id: number | undefined;
      if (raw.id !== undefined) {
        if (!isFiniteInt(raw.id, 0)) return { ok: false, reason: 'Invalid error id' };
        id = raw.id;
      }
      if (!isBoundedString(raw.message, MAX_ERROR_TEXT_CHARS)) {
        return { ok: false, reason: 'Invalid or oversized error message' };
      }
      return {
        ok: true,
        message: {
          type: 'error',
          ...(id !== undefined ? { id } : {}),
          message: raw.message,
        },
      };
    }

    case 'pkg.result':
    case 'pkg.list.result':
      return validatePackageMessage(raw);

    case 'display.open':
    case 'display.close':
    case 'display.batch':
      return validateDisplayMessage(raw);

    default:
      return { ok: false, reason: `Unknown worker message type "${raw.type}"` };
  }
}
