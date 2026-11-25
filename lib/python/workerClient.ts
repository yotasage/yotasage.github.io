// Main-thread lifecycle controller for /python/python-worker.js.
// Handles fail-closed CSP enforcement, chunked SAB & JSPI stdin, S3 10 ms SIGINT re-assert,
// 1.5 s Soft Stop -> Force Stop warm restart escalation, and crash/OOM recovery.

import type { NetworkMode } from './network';
import {
  getPyodideIndexUrl,
  getPyodideLockFileUrl,
  getPythonRuntimeBaseUrl,
  getPythonWorkerUrl,
} from './origin';
import {
  CONTROL_SAB_BYTES,
  CTRL_INTERRUPT,
  CTRL_STDIN_LEN,
  CTRL_STDIN_STATE,
  SIGINT,
  STDIN_CHUNK_FINAL,
  STDIN_CHUNK_READY,
  STDIN_EOF,
  STDIN_INTERRUPTED,
  STDIN_REQUEST,
  STDIN_SAB_BYTES,
  validateWorkerMessage,
} from './protocol';
import type {
  CapabilityTier,
  FsChangeInfo,
  MainToWorkerMessage,
  PlotExportFormat,
  PlotSource,
  PythonErrorInfo,
  SecurityStatusInfo,
  WorkerToMainMessage,
} from './protocol';
import type { PythonStorageClient } from './storageClient';

export type PythonClientState =
  | 'idle'
  | 'booting'
  | 'ready'
  | 'running'
  | 'stopping'
  | 'crashed'
  | 'blocked';

export interface ReadyInfo {
  readonly pyodideVersion: string;
  readonly pythonVersion: string;
  readonly tier: CapabilityTier;
  readonly crossOriginIsolated: boolean;
  readonly canRunSync: boolean;
}

export interface RunOptions {
  readonly filename?: string;
  readonly files?: Readonly<Record<string, string>>;
  readonly autoLoadPackages?: boolean;
  /** Explicitly overrides the W7 fail-closed gate when networkMode === 'off' and CSP is unconfirmed. */
  readonly allowUnconfirmed?: boolean;
}

export interface RunResult {
  readonly ok: boolean;
  readonly exitCode: number;
  readonly interrupted: boolean;
  readonly durationMs: number;
  readonly forceStopped?: boolean;
  readonly error?: PythonErrorInfo;
}

export interface ReplPushResult {
  readonly status: 'complete' | 'incomplete' | 'syntax-error' | 'error';
  readonly error?: PythonErrorInfo;
}

export interface ReplCompletionsResult {
  readonly completions: readonly string[];
  readonly start: number;
}

export interface PlotEvent {
  readonly plotId: string;
  readonly title: string;
  readonly width: number;
  readonly height: number;
  readonly pngBytes: Uint8Array;
  readonly canExportVector: boolean;
  readonly source: PlotSource;
  readonly createdAt: number;
}

export interface PlotExportResult {
  readonly ok: boolean;
  readonly plotId: string;
  readonly format: PlotExportFormat;
  readonly bytes?: Uint8Array;
  readonly error?: string;
}

export interface PythonWorkerClientOptions {
  readonly networkMode?: NetworkMode;
  readonly softStopTimeoutMs?: number;
  readonly sigintRetryIntervalMs?: number;
  readonly storageClient?: PythonStorageClient | null;
}

export interface PythonClientListeners {
  state?: (state: PythonClientState, detail?: string) => void;
  status?: (phase: string, message: string) => void;
  security?: (status: SecurityStatusInfo) => void;
  stdout?: (text: string) => void;
  stderr?: (text: string) => void;
  stdinRequest?: (seq: number, mode: 'sab' | 'jspi') => void;
  linkRequest?: (url: string) => void;
  fsChanged?: (change: FsChangeInfo) => void;
  plot?: (plot: PlotEvent) => void;
  crash?: (reason: string) => void;
  droppedMessage?: (reason: string) => void;
}

interface PendingStdinTransfer {
  readonly seq: number;
  readonly bytes: Uint8Array;
  offset: number;
}

const DEFAULT_SOFT_STOP_TIMEOUT_MS = 1500;
const DEFAULT_SIGINT_RETRY_MS = 10;

export class PythonWorkerClient {
  private readonly networkMode: NetworkMode;
  private readonly softStopTimeoutMs: number;
  private readonly sigintRetryIntervalMs: number;
  private readonly encoder = new TextEncoder();
  private storageClient: PythonStorageClient | null;

  private worker: Worker | null = null;
  private controlSab: SharedArrayBuffer | null = null;
  private stdinSab: SharedArrayBuffer | null = null;
  private ctrlView: Int32Array | null = null;
  private stdinView: Uint8Array | null = null;

  private _state: PythonClientState = 'idle';
  private _readyInfo: ReadyInfo | null = null;
  private _securityStatus: SecurityStatusInfo | null = null;
  private _activeStdin: { seq: number; mode: 'sab' | 'jspi' } | null = null;
  private pendingTransfer: PendingStdinTransfer | null = null;

  private nextId = 1;
  private initPromise: Promise<ReadyInfo> | null = null;
  private pendingInit: {
    id: number;
    resolve: (info: ReadyInfo) => void;
    reject: (err: Error) => void;
  } | null = null;
  private pendingRun: {
    id: number;
    resolve: (res: RunResult) => void;
    reject: (err: Error) => void;
  } | null = null;
  private pendingRepl: {
    id: number;
    resolve: (res: ReplPushResult) => void;
    reject: (err: Error) => void;
  } | null = null;
  private pendingCompletions: {
    id: number;
    resolve: (res: ReplCompletionsResult) => void;
    reject: (err: Error) => void;
  } | null = null;
  private pendingPlotExports = new Map<
    string,
    {
      resolve: (res: PlotExportResult) => void;
      reject: (err: Error) => void;
    }
  >();

  private sigintRetryTimer: ReturnType<typeof setInterval> | null = null;
  private forceStopTimer: ReturnType<typeof setTimeout> | null = null;
  private listeners = new Set<PythonClientListeners>();

  constructor(options: PythonWorkerClientOptions = {}) {
    this.networkMode = options.networkMode ?? 'off';
    this.softStopTimeoutMs = options.softStopTimeoutMs ?? DEFAULT_SOFT_STOP_TIMEOUT_MS;
    this.sigintRetryIntervalMs = options.sigintRetryIntervalMs ?? DEFAULT_SIGINT_RETRY_MS;
    this.storageClient = options.storageClient ?? null;
  }

  attachStorage(client: PythonStorageClient | null): void {
    this.storageClient = client;
  }

  get state(): PythonClientState {
    return this._state;
  }

  get readyInfo(): ReadyInfo | null {
    return this._readyInfo;
  }

  get securityStatus(): SecurityStatusInfo | null {
    return this._securityStatus;
  }

  get awaitingStdin(): { readonly seq: number; readonly mode: 'sab' | 'jspi' } | null {
    return this._activeStdin;
  }

  get isFailClosedBlocked(): boolean {
    return (
      this.networkMode === 'off' &&
      this._securityStatus !== null &&
      !this._securityStatus.cspConfirmed
    );
  }

  subscribe(listener: PythonClientListeners): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Convenience helper subscribing specifically to plot.new events. */
  onPlot(listener: (plot: PlotEvent) => void): () => void {
    return this.subscribe({ plot: listener });
  }

  private emit<K extends keyof PythonClientListeners>(
    key: K,
    ...args: Parameters<NonNullable<PythonClientListeners[K]>>
  ): void {
    for (const l of this.listeners) {
      const fn = l[key] as ((...a: unknown[]) => void) | undefined;
      if (fn) fn(...args);
    }
  }

  private setState(next: PythonClientState, detail?: string): void {
    this._state = next;
    this.emit('state', next, detail);
  }

  private clearStopTimers(): void {
    if (this.sigintRetryTimer !== null) {
      clearInterval(this.sigintRetryTimer);
      this.sigintRetryTimer = null;
    }
    if (this.forceStopTimer !== null) {
      clearTimeout(this.forceStopTimer);
      this.forceStopTimer = null;
    }
  }

  private post(msg: MainToWorkerMessage, transfer: Transferable[] = []): void {
    if (!this.worker) {
      throw new Error('Python worker is not running');
    }
    this.worker.postMessage(msg, transfer);
  }

  /** Spawns /python/python-worker.js, runs the fail-closed CSP self-test, and boots Pyodide. */
  async start(): Promise<ReadyInfo> {
    if (this._readyInfo && (this._state === 'ready' || this._state === 'blocked')) {
      return this._readyInfo;
    }
    if (this.initPromise) {
      return this.initPromise;
    }

    this.terminateWorkerOnly();
    this._readyInfo = null;
    this._securityStatus = null;
    this._activeStdin = null;
    this.pendingTransfer = null;

    const canUseSab =
      typeof window !== 'undefined' &&
      window.crossOriginIsolated === true &&
      typeof SharedArrayBuffer === 'function';

    if (canUseSab) {
      this.controlSab = new SharedArrayBuffer(CONTROL_SAB_BYTES);
      this.stdinSab = new SharedArrayBuffer(STDIN_SAB_BYTES);
      this.ctrlView = new Int32Array(this.controlSab);
      this.stdinView = new Uint8Array(this.stdinSab);
    } else {
      this.controlSab = null;
      this.stdinSab = null;
      this.ctrlView = null;
      this.stdinView = null;
    }

    this.setState('booting', 'Starting Python worker…');
    let storagePort: MessagePort | null = null;
    if (this.storageClient && !this.storageClient.isClosed) {
      try {
        storagePort = await this.storageClient.createPythonPort();
      } catch {
        storagePort = null;
      }
    }

    const worker = new Worker(getPythonWorkerUrl(), { type: 'module' });
    this.worker = worker;

    worker.onmessage = (event: MessageEvent) => {
      this.handleRawMessage(event.data);
    };

    worker.onerror = (event: ErrorEvent) => {
      // Prevent uncaught pageerror propagation in Firefox/WebKit (S3 §4).
      event.preventDefault();
      const reason = event.message || 'Unexpected Python worker crash or out-of-memory error';
      this.handleWorkerCrash(reason);
    };

    worker.onmessageerror = () => {
      this.emit('droppedMessage', 'Worker message could not be deserialized');
    };

    const id = this.nextId++;
    const transfer: Transferable[] = storagePort ? [storagePort] : [];
    this.initPromise = new Promise<ReadyInfo>((resolve, reject) => {
      this.pendingInit = { id, resolve, reject };
      this.post(
        {
          type: 'init',
          id,
          payload: {
            controlSab: this.controlSab,
            stdinSab: this.stdinSab,
            networkMode: this.networkMode,
            pyodideIndexUrl: getPyodideIndexUrl(),
            pyodideLockUrl: getPyodideLockFileUrl(),
            runtimeBaseUrl: getPythonRuntimeBaseUrl(),
            ...(storagePort ? { storagePort } : {}),
          },
        },
        transfer,
      );
    });

    return this.initPromise;
  }

  /** Terminates the current worker and boots a clean replacement. */
  async restart(): Promise<ReadyInfo> {
    this.clearStopTimers();
    this.rejectInFlight('Python worker restarted');
    this.terminateWorkerOnly();
    this.initPromise = null;
    return this.start();
  }

  /** Runs a Python script in the worker, enforcing the W7 fail-closed gate by default. */
  async run(code?: string | null, options: RunOptions = {}): Promise<RunResult> {
    if (!this._readyInfo) {
      await this.start();
    }
    if (this._state === 'running' || this._state === 'stopping') {
      throw new Error('A Python script is already running');
    }
    if (this._state === 'crashed') {
      throw new Error('Python worker crashed; call restart() before running');
    }
    if (this.isFailClosedBlocked && !options.allowUnconfirmed) {
      throw new Error(
        'Execution blocked (fail-closed): network block could not be confirmed in Off mode.',
      );
    }

    const id = this.nextId++;
    this._activeStdin = null;
    this.pendingTransfer = null;
    this.setState('running');

    const syncRev =
      this.storageClient && !this.storageClient.isClosed ? this.storageClient.latestRev : undefined;

    return new Promise<RunResult>((resolve, reject) => {
      this.pendingRun = { id, resolve, reject };
      this.post({
        type: 'run',
        id,
        ...(code !== undefined ? { code } : {}),
        ...(options.filename !== undefined ? { filename: options.filename } : {}),
        ...(options.files !== undefined ? { files: options.files } : {}),
        ...(options.autoLoadPackages !== undefined
          ? { autoLoadPackages: options.autoLoadPackages }
          : {}),
        ...(syncRev !== undefined ? { syncRev } : {}),
      });
    });
  }

  /** Live-syncs a file write into the running Pyodide worker's MEMFS without rebooting. */
  syncFileWrite(path: string, bytes: Uint8Array, rev?: number): void {
    if (!this.worker || !this._readyInfo) return;
    const copy = bytes.slice();
    this.post(
      { type: 'fs.write', id: this.nextId++, path, bytes: copy, ...(rev !== undefined ? { rev } : {}) },
      [copy.buffer],
    );
  }

  syncMkdir(path: string, rev?: number): void {
    if (!this.worker || !this._readyInfo) return;
    this.post({ type: 'fs.mkdir', id: this.nextId++, path, ...(rev !== undefined ? { rev } : {}) });
  }

  syncRename(from: string, to: string, rev?: number): void {
    if (!this.worker || !this._readyInfo) return;
    this.post({
      type: 'fs.rename',
      id: this.nextId++,
      from,
      to,
      ...(rev !== undefined ? { rev } : {}),
    });
  }

  syncDelete(path: string, rev?: number): void {
    if (!this.worker || !this._readyInfo) return;
    this.post({ type: 'fs.delete', id: this.nextId++, path, ...(rev !== undefined ? { rev } : {}) });
  }

  syncWorkspace(): void {
    if (!this.worker || !this._readyInfo) return;
    this.post({ type: 'fs.sync', id: this.nextId++ });
  }

  /** Sends one line of stdin to a blocked Tier 1 (SAB) or Tier 2 (JSPI) input() call. */
  sendStdin(text: string): boolean {
    const req = this._activeStdin;
    if (!req) return false;

    if (req.mode === 'jspi') {
      this._activeStdin = null;
      this.post({ type: 'stdin.reply', seq: req.seq, text });
      return true;
    }

    if (!this.ctrlView || !this.stdinView) return false;
    const normalized = text.endsWith('\n') ? text : `${text}\n`;
    const bytes = this.encoder.encode(normalized);
    this.pendingTransfer = { seq: req.seq, bytes, offset: 0 };
    this.writeNextSabStdinChunk();
    return true;
  }

  /** Signals EOF (Ctrl+D) to a blocked input() call. */
  sendStdinEof(): boolean {
    const req = this._activeStdin;
    if (!req) return false;
    this._activeStdin = null;
    this.pendingTransfer = null;

    if (req.mode === 'jspi') {
      this.post({ type: 'stdin.reply', seq: req.seq, text: null, eof: true });
      return true;
    }

    if (!this.ctrlView) return false;
    Atomics.store(this.ctrlView, CTRL_STDIN_LEN, 0);
    Atomics.store(this.ctrlView, CTRL_STDIN_STATE, STDIN_EOF);
    Atomics.notify(this.ctrlView, CTRL_STDIN_STATE, 1);
    return true;
  }

  private writeNextSabStdinChunk(): void {
    const transfer = this.pendingTransfer;
    if (!transfer || !this.ctrlView || !this.stdinView) return;

    const remaining = transfer.bytes.length - transfer.offset;
    const chunkLen = Math.min(remaining, this.stdinView.length);
    const isFinal = transfer.offset + chunkLen >= transfer.bytes.length;

    this.stdinView.set(transfer.bytes.subarray(transfer.offset, transfer.offset + chunkLen), 0);
    transfer.offset += chunkLen;

    Atomics.store(this.ctrlView, CTRL_STDIN_LEN, chunkLen);
    Atomics.store(
      this.ctrlView,
      CTRL_STDIN_STATE,
      isFinal ? STDIN_CHUNK_FINAL : STDIN_CHUNK_READY,
    );
    Atomics.notify(this.ctrlView, CTRL_STDIN_STATE, 1);

    if (isFinal) {
      this.pendingTransfer = null;
      this._activeStdin = null;
    }
  }

  /**
   * Stops the active run.
   * - Tier 1: writes SIGINT + 10 ms re-assert timer (S3 Pyodide race workaround) and escalates
   *   to Force Stop (worker.terminate() + warm restart) after softStopTimeoutMs (default 1.5 s).
   * - Tier 2 / 3: immediately Force Stops and restarts the worker.
   */
  stop(): Promise<void> {
    if (this._state !== 'running' && this._state !== 'stopping') {
      return Promise.resolve();
    }

    if (!this.ctrlView || this._readyInfo?.tier !== 1) {
      return this.forceStop();
    }

    this.setState('stopping', 'Interrupting Python…');
    this.clearStopTimers();

    const ctrl = this.ctrlView;
    const pulse = () => {
      Atomics.store(ctrl, CTRL_INTERRUPT, SIGINT);
      Atomics.notify(ctrl, CTRL_INTERRUPT, 1);
      Atomics.compareExchange(ctrl, CTRL_STDIN_STATE, STDIN_REQUEST, STDIN_INTERRUPTED);
      Atomics.notify(ctrl, CTRL_STDIN_STATE, 1);
    };
    pulse();

    // S3 workaround: re-assert SIGINT every 10 ms if _Py_CheckEmscriptenSignals_Helper wiped it.
    this.sigintRetryTimer = setInterval(() => {
      if (this._state !== 'stopping') {
        this.clearStopTimers();
        return;
      }
      if (Atomics.load(ctrl, CTRL_INTERRUPT) === 0) {
        pulse();
      }
    }, this.sigintRetryIntervalMs);

    return new Promise<void>((resolve) => {
      let settled = false;
      let unsub = () => {};
      const done = () => {
        if (settled) return;
        settled = true;
        unsub();
        resolve();
      };

      this.forceStopTimer = setTimeout(() => {
        this.forceStop().finally(done);
      }, this.softStopTimeoutMs);

      unsub = this.subscribe({
        state: (next) => {
          if (next === 'ready' || next === 'blocked' || next === 'crashed' || next === 'idle') {
            done();
          }
        },
      });
    });
  }

  /** Immediately terminates the worker, finishes the active run as force-stopped, and warm-restarts. */
  async forceStop(): Promise<void> {
    this.clearStopTimers();
    this._activeStdin = null;
    this.pendingTransfer = null;

    const run = this.pendingRun;
    this.pendingRun = null;

    this.terminateWorkerOnly();
    this.initPromise = null;

    if (run) {
      run.resolve({
        ok: false,
        exitCode: 137,
        interrupted: true,
        forceStopped: true,
        durationMs: 0,
      });
    }

    await this.start();
  }

  /** Pushes one line into the persistent REPL console (sharing last run's __main__). */
  async replPush(line: string, options: { allowUnconfirmed?: boolean } = {}): Promise<ReplPushResult> {
    if (!this._readyInfo) {
      await this.start();
    }
    if (this.isFailClosedBlocked && !options.allowUnconfirmed) {
      throw new Error(
        'REPL blocked (fail-closed): network block could not be confirmed in Off mode.',
      );
    }
    if (this._state === 'running' || this._state === 'stopping') {
      throw new Error('Cannot push to REPL while a script is running');
    }

    const id = this.nextId++;
    return new Promise<ReplPushResult>((resolve, reject) => {
      this.pendingRepl = { id, resolve, reject };
      this.post({ type: 'repl.push', id, line });
    });
  }

  /** Requests tab completions from the persistent REPL console. */
  async replComplete(source: string): Promise<ReplCompletionsResult> {
    if (!this._readyInfo) {
      return { completions: [], start: 0 };
    }
    if (this._state === 'running' || this._state === 'stopping') {
      return { completions: [], start: 0 };
    }

    const id = this.nextId++;
    return new Promise<ReplCompletionsResult>((resolve, reject) => {
      this.pendingCompletions = { id, resolve, reject };
      this.post({ type: 'repl.complete', id, source });
    });
  }

  /** Requests an on-demand SVG or PDF vector re-export of a retained live matplotlib plot. */
  async exportPlot(plotId: string, format: PlotExportFormat): Promise<PlotExportResult> {
    if (!this.worker || !this._readyInfo) {
      return { ok: false, plotId, format, error: 'Python worker is not running' };
    }
    if (this._state === 'running' || this._state === 'stopping') {
      return { ok: false, plotId, format, error: 'Cannot export plot while a script is running' };
    }
    const id = `plot-exp-${this.nextId++}`;
    return new Promise<PlotExportResult>((resolve, reject) => {
      this.pendingPlotExports.set(id, { resolve, reject });
      this.post({ type: 'plot.export', id, plotId, format });
    });
  }

  dispose(): void {
    this.clearStopTimers();
    this.rejectInFlight('Python worker client disposed');
    this.terminateWorkerOnly();
    this.initPromise = null;
    this._readyInfo = null;
    this._activeStdin = null;
    this.pendingTransfer = null;
    this.setState('idle');
    this.listeners.clear();
  }

  private terminateWorkerOnly(): void {
    if (this.worker) {
      this.worker.onmessage = null;
      this.worker.onerror = null;
      this.worker.onmessageerror = null;
      this.worker.terminate();
      this.worker = null;
    }
  }

  private rejectInFlight(reason: string): void {
    const err = new Error(reason);
    if (this.pendingInit) {
      const p = this.pendingInit;
      this.pendingInit = null;
      p.reject(err);
    }
    if (this.pendingRun) {
      const p = this.pendingRun;
      this.pendingRun = null;
      p.reject(err);
    }
    if (this.pendingRepl) {
      const p = this.pendingRepl;
      this.pendingRepl = null;
      p.reject(err);
    }
    if (this.pendingCompletions) {
      const p = this.pendingCompletions;
      this.pendingCompletions = null;
      p.reject(err);
    }
    if (this.pendingPlotExports.size > 0) {
      const pending = [...this.pendingPlotExports.values()];
      this.pendingPlotExports.clear();
      for (const p of pending) p.reject(err);
    }
  }

  private handleWorkerCrash(reason: string): void {
    this.clearStopTimers();
    this._activeStdin = null;
    this.pendingTransfer = null;
    this.terminateWorkerOnly();
    this.initPromise = null;
    this._readyInfo = null;
    this.setState('crashed', reason);
    this.emit('crash', reason);
    this.rejectInFlight(reason);
  }

  private handleRawMessage(raw: unknown): void {
    const parsed = validateWorkerMessage(raw);
    if (parsed.ok) {
      this.handleMessage(parsed.message);
      return;
    }
    const reason = 'reason' in parsed ? parsed.reason : 'Unknown validation error';
    console.warn(`[python-worker] Dropped invalid worker message: ${reason}`);
    this.emit('droppedMessage', reason);
  }

  private handleMessage(msg: WorkerToMainMessage): void {
    switch (msg.type) {
      case 'security.status':
        // Security status is only accepted once during initial boot before user code can run.
        if (this._securityStatus !== null || this._readyInfo !== null) {
          this.emit('droppedMessage', 'Ignored forged security.status after boot');
          break;
        }
        this._securityStatus = msg.status;
        this.emit('security', msg.status);
        break;

      case 'status':
        this.emit('status', msg.phase, msg.message);
        break;

      case 'ready': {
        if (!this.pendingInit || this.pendingInit.id !== msg.id) {
          this.emit('droppedMessage', 'Ignored unexpected or mismatched ready message');
          break;
        }
        const info: ReadyInfo = {
          pyodideVersion: msg.pyodideVersion,
          pythonVersion: msg.pythonVersion,
          tier: msg.tier,
          crossOriginIsolated: msg.crossOriginIsolated,
          canRunSync: msg.canRunSync,
        };
        this._readyInfo = info;
        this.setState(this.isFailClosedBlocked ? 'blocked' : 'ready');
        const p = this.pendingInit;
        this.pendingInit = null;
        p.resolve(info);
        break;
      }

      case 'stdout':
        this.emit('stdout', msg.text);
        break;

      case 'stderr':
        this.emit('stderr', msg.text);
        break;

      case 'stdin.request':
        this._activeStdin = { seq: msg.seq, mode: msg.mode };
        this.emit('stdinRequest', msg.seq, msg.mode);
        break;

      case 'stdin.chunk_ack':
        if (this.pendingTransfer && this.pendingTransfer.seq === msg.seq) {
          this.writeNextSabStdinChunk();
        }
        break;

      case 'run.start':
        break;

      case 'run.end': {
        if (!this.pendingRun || this.pendingRun.id !== msg.id) {
          this.emit('droppedMessage', 'Ignored unexpected or mismatched run.end message');
          break;
        }
        this.clearStopTimers();
        this._activeStdin = null;
        this.pendingTransfer = null;
        this.setState(this.isFailClosedBlocked ? 'blocked' : 'ready');
        const p = this.pendingRun;
        this.pendingRun = null;
        p.resolve({
          ok: msg.ok,
          exitCode: msg.exitCode,
          interrupted: msg.interrupted,
          durationMs: msg.durationMs,
          ...(msg.error ? { error: msg.error } : {}),
        });
        break;
      }

      case 'repl.result': {
        if (this.pendingRepl && this.pendingRepl.id === msg.id) {
          const p = this.pendingRepl;
          this.pendingRepl = null;
          p.resolve({
            status: msg.status,
            ...(msg.error ? { error: msg.error } : {}),
          });
        }
        break;
      }

      case 'repl.completions': {
        if (this.pendingCompletions && this.pendingCompletions.id === msg.id) {
          const p = this.pendingCompletions;
          this.pendingCompletions = null;
          p.resolve({ completions: msg.completions, start: msg.start });
        }
        break;
      }

      case 'link.request':
        // Passive data only: UI decides whether to show W8 confirmation. Never auto-navigate!
        this.emit('linkRequest', msg.url);
        break;

      case 'fs.changed':
        this.emit('fsChanged', {
          created: msg.created,
          modified: msg.modified,
          deleted: msg.deleted,
        });
        break;

      case 'plot.new':
        this.emit('plot', {
          plotId: msg.plotId,
          title: msg.title,
          width: msg.width,
          height: msg.height,
          pngBytes: msg.pngBytes,
          canExportVector: msg.canExportVector,
          source: msg.source,
          createdAt: msg.createdAt,
        });
        break;

      case 'plot.export.result': {
        const pending = this.pendingPlotExports.get(msg.id);
        if (!pending) {
          this.emit('droppedMessage', 'Ignored unexpected or mismatched plot.export.result');
          break;
        }
        this.pendingPlotExports.delete(msg.id);
        pending.resolve({
          ok: msg.ok,
          plotId: msg.plotId,
          format: msg.format,
          ...(msg.bytes ? { bytes: msg.bytes } : {}),
          ...(msg.error !== undefined ? { error: msg.error } : {}),
        });
        break;
      }

      case 'error': {
        if (this.pendingInit && (msg.id === undefined || this.pendingInit.id === msg.id)) {
          const p = this.pendingInit;
          this.pendingInit = null;
          this.initPromise = null;
          this.setState('crashed', msg.message);
          p.reject(new Error(msg.message));
        } else if (this.pendingRun && msg.id === this.pendingRun.id) {
          const p = this.pendingRun;
          this.pendingRun = null;
          this.setState(this.isFailClosedBlocked ? 'blocked' : 'ready');
          p.reject(new Error(msg.message));
        }
        break;
      }
    }
  }
}
