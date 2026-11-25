// Main-thread typed RPC client for Option 3B Dedicated Storage Worker (/python/storage-worker.js).
// - Transfers ArrayBuffers zero-copy (and passes File/Blob handles directly to the worker) so
//   50 MB uploads never freeze the main thread.
// - Creates direct MessageChannel ports for python-worker.js hydration and write-through deltas.
// - Registers active clients so clearAllPythonData() can close IndexedDB cleanly before deleteDatabase.

import { getPythonStorageWorkerUrl, getPythonWheelWorkerUrl } from './origin';

export type StorageErrorCode =
  | 'CAP_EXCEEDED'
  | 'QUOTA_EXCEEDED'
  | 'INVALID_PATH'
  | 'NOT_FOUND'
  | 'EXISTS'
  | 'WORKER_CLOSED'
  | 'HASH_MISMATCH'
  | 'UNKNOWN';

export class StorageWorkerError extends Error {
  readonly code: StorageErrorCode;

  constructor(code: StorageErrorCode, message: string) {
    super(message);
    this.name = 'StorageWorkerError';
    this.code = code;
  }
}

export interface WorkspaceStats {
  readonly workspaceId: string;
  readonly totalBytes: number;
  readonly entryCount: number;
  readonly maxFileBytes: number;
  readonly maxWorkspaceBytes: number;
  readonly maxEntries: number;
  readonly rev: number;
}

export interface WorkspaceEntryMeta {
  readonly path: string;
  readonly isDir: boolean;
  readonly size: number;
  readonly mtime: number;
  readonly createdByRun: boolean;
}

export interface WorkspaceFileData extends WorkspaceEntryMeta {
  readonly bytes: Uint8Array | null;
}

export interface WriteResult {
  readonly entry: WorkspaceEntryMeta;
  readonly stats: WorkspaceStats;
}

export interface DeleteManyResult {
  /** Outermost listed paths that existed and are now gone (with everything inside them). */
  readonly deleted: readonly string[];
  /** Listed paths that did not exist. */
  readonly missing: readonly string[];
  readonly failed: readonly { readonly path: string; readonly code: StorageErrorCode; readonly message: string }[];
  /** Entries removed, counting those inside deleted folders. */
  readonly deletedCount: number;
  readonly stats: WorkspaceStats;
}

export interface BulkWriteInput {
  readonly path: string;
  readonly bytes?: Uint8Array | ArrayBuffer | string | File | Blob | null;
  readonly isDir?: boolean;
  readonly createdByRun?: boolean;
}

export interface StorageEstimateInfo {
  readonly supported: boolean;
  readonly usage: number | null;
  readonly quota: number | null;
}

export interface StorageChangeEvent {
  readonly workspaceId: string;
  readonly kind: 'put' | 'mkdir' | 'rename' | 'delete';
  readonly entry?: WorkspaceEntryMeta;
  readonly path?: string;
  readonly from?: string;
  readonly to?: string;
  readonly stats: WorkspaceStats;
}

/** Saved wheel caps (separate from the workspace caps): 50 MiB per wheel, 200 MiB and 64 wheels in all. */
export const MAX_SAVED_WHEEL_BYTES = 50 * 1024 * 1024;
export const MAX_SAVED_WHEELS_TOTAL_BYTES = 200 * 1024 * 1024;
export const MAX_SAVED_WHEEL_COUNT = 64;

export interface WheelStoreStats {
  readonly count: number;
  readonly totalBytes: number;
  readonly maxWheelBytes: number;
  readonly maxTotalBytes: number;
  readonly maxCount: number;
}

export interface SavedWheelMeta {
  readonly sha256: string;
  /** Empty for rows not written by the storage worker (user code can write IndexedDB). */
  readonly fileName: string;
  readonly size: number;
}

export interface SavedWheel extends SavedWheelMeta {
  readonly storedAt: number;
  /** Untrusted until hashed against the page's manifest (see packageRestore.ts). */
  readonly bytes: Uint8Array;
}

export interface StorageClientListeners {
  change?: (event: StorageChangeEvent) => void;
  /** Another tab still holds an older database version open (upgrade waits for it). */
  blocked?: (message: string) => void;
  quotaExceeded?: (message: string) => void;
  capExceeded?: (message: string) => void;
  error?: (message: string) => void;
}

export interface WriteFileOptions {
  readonly createdByRun?: boolean;
  readonly mirrorToPython?: boolean;
  /**
   * When true (default for full ArrayBuffer/Uint8Array payloads), transfers the underlying
   * ArrayBuffer zero-copy to the Storage Worker to avoid main-thread stalls on large uploads.
   * Pass false if the caller needs to retain access to the passed Uint8Array buffer.
   */
  readonly transfer?: boolean;
}

interface PendingRpc {
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
}

const activeStorageClients = new Set<PythonStorageClient>();

/** Gracefully closes all active Storage Workers so IndexedDB deletion never blocks (WebKit S5 fix). */
export async function closeAllActiveStorageClients(): Promise<void> {
  const snapshot = [...activeStorageClients];
  await Promise.all(snapshot.map((client) => client.close().catch(() => {})));
}

export class PythonStorageClient {
  readonly workspaceId: string;
  private readonly encoder = new TextEncoder();
  private readonly decoder = new TextDecoder('utf-8');
  private worker: Worker | null = null;
  /** /python/wheel-worker.js (saved wheels), started on the first wheel call after the schema is open. */
  private wheelWorker: Promise<Worker> | null = null;
  private nextId = 1;
  private pending = new Map<number, PendingRpc>();
  private listeners = new Set<StorageClientListeners>();
  private _latestRev = 0;
  private _closed = false;

  constructor(workspaceId = 'default') {
    this.workspaceId = workspaceId.trim() || 'default';
  }

  get latestRev(): number {
    return this._latestRev;
  }

  get isClosed(): boolean {
    return this._closed;
  }

  subscribe(listener: StorageClientListeners): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private ensureWorker(): Worker {
    if (this._closed) {
      throw new StorageWorkerError('WORKER_CLOSED', 'Storage client has been closed');
    }
    if (this.worker) return this.worker;

    const worker = new Worker(getPythonStorageWorkerUrl(), { type: 'module' });
    this.worker = worker;
    activeStorageClients.add(this);

    worker.onmessage = (event: MessageEvent) => {
      this.handleMessage(event.data);
    };
    worker.onerror = (event: ErrorEvent) => {
      event.preventDefault();
      const msg = event.message || 'Storage worker crashed unexpectedly';
      for (const l of this.listeners) l.error?.(msg);
      this.rejectAllPending(new StorageWorkerError('UNKNOWN', msg));
    };
    return worker;
  }

  private handleMessage(raw: unknown): void {
    if (!raw || typeof raw !== 'object') return;
    const msg = raw as Record<string, unknown>;

    if (typeof msg.id === 'number') {
      const rpc = this.pending.get(msg.id);
      if (!rpc) return;
      this.pending.delete(msg.id);
      if (msg.ok === true) {
        this.captureRev(msg.result);
        rpc.resolve(msg.result);
      } else {
        const errObj = (msg.error || {}) as { code?: unknown; message?: unknown };
        const code = (typeof errObj.code === 'string' ? errObj.code : 'UNKNOWN') as StorageErrorCode;
        const message = typeof errObj.message === 'string' ? errObj.message : 'Storage RPC failed';
        rpc.reject(new StorageWorkerError(code, message));
      }
      return;
    }

    if (msg.type === 'storage.change') {
      const ev = msg as unknown as StorageChangeEvent;
      if (ev.stats && typeof ev.stats.rev === 'number') {
        this._latestRev = Math.max(this._latestRev, ev.stats.rev);
      }
      for (const l of this.listeners) l.change?.(ev);
    } else if (msg.type === 'storage.quotaExceeded' && typeof msg.message === 'string') {
      for (const l of this.listeners) l.quotaExceeded?.(msg.message);
    } else if (msg.type === 'storage.capExceeded' && typeof msg.message === 'string') {
      for (const l of this.listeners) l.capExceeded?.(msg.message);
    } else if (msg.type === 'storage.blocked' && typeof msg.message === 'string') {
      for (const l of this.listeners) l.blocked?.(msg.message);
    }
  }

  private captureRev(result: unknown): void {
    if (!result || typeof result !== 'object') return;
    const r = result as Record<string, unknown>;
    if (typeof r.rev === 'number') {
      this._latestRev = Math.max(this._latestRev, r.rev);
    }
    if (r.stats && typeof r.stats === 'object') {
      const s = r.stats as Record<string, unknown>;
      if (typeof s.rev === 'number') {
        this._latestRev = Math.max(this._latestRev, s.rev);
      }
    }
  }

  private rejectAllPending(err: Error): void {
    for (const rpc of this.pending.values()) {
      rpc.reject(err);
    }
    this.pending.clear();
  }

  private call<T>(
    op: string,
    payload: Record<string, unknown> = {},
    transfer: Transferable[] = [],
  ): Promise<T> {
    const worker = this.ensureWorker();
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, {
        resolve: resolve as (v: unknown) => void,
        reject,
      });
      worker.postMessage({ id, op, workspaceId: this.workspaceId, ...payload }, transfer);
    });
  }

  open(): Promise<WorkspaceStats> {
    return this.call<WorkspaceStats>('open');
  }

  stats(): Promise<WorkspaceStats> {
    return this.call<WorkspaceStats>('stats');
  }

  list(): Promise<WorkspaceEntryMeta[]> {
    return this.call<WorkspaceEntryMeta[]>('list');
  }

  read(path: string): Promise<WorkspaceFileData | null> {
    return this.call<WorkspaceFileData | null>('read', { path });
  }

  async readText(path: string): Promise<string | null> {
    const entry = await this.read(path);
    if (!entry || entry.isDir || !entry.bytes) return null;
    return this.decoder.decode(entry.bytes);
  }

  write(
    path: string,
    data: Uint8Array | ArrayBuffer | string | File | Blob,
    options: WriteFileOptions = {},
  ): Promise<WriteResult> {
    const transfer: Transferable[] = [];
    let bytesPayload: Uint8Array | ArrayBuffer | File | Blob;

    if (typeof data === 'string') {
      const encoded = this.encoder.encode(data);
      bytesPayload = encoded;
      transfer.push(encoded.buffer);
    } else if (data instanceof ArrayBuffer) {
      bytesPayload = data;
      if (options.transfer !== false) {
        transfer.push(data);
      }
    } else if (data instanceof Uint8Array) {
      bytesPayload = data;
      if (
        options.transfer !== false &&
        data.buffer instanceof ArrayBuffer &&
        data.byteOffset === 0 &&
        data.byteLength === data.buffer.byteLength
      ) {
        transfer.push(data.buffer);
      }
    } else {
      // File or Blob: passed directly to the Storage Worker (zero main-thread ArrayBuffer allocation).
      bytesPayload = data;
    }

    return this.call<WriteResult>(
      'write',
      {
        path,
        bytes: bytesPayload,
        createdByRun: Boolean(options.createdByRun),
        mirrorToPython: options.mirrorToPython !== false,
      },
      transfer,
    );
  }

  mkdir(path: string): Promise<{ readonly entry: WorkspaceEntryMeta; readonly stats: WorkspaceStats }> {
    return this.call('mkdir', { path });
  }

  rename(
    from: string,
    to: string,
    options: { readonly overwrite?: boolean } = {},
  ): Promise<{
    readonly from: string;
    readonly to: string;
    readonly movedCount: number;
    readonly stats: WorkspaceStats;
  }> {
    return this.call('rename', { from, to, overwrite: Boolean(options.overwrite) });
  }

  move(
    from: string,
    to: string,
    options: { readonly overwrite?: boolean } = {},
  ): Promise<{
    readonly from: string;
    readonly to: string;
    readonly movedCount: number;
    readonly stats: WorkspaceStats;
  }> {
    return this.call('move', { from, to, overwrite: Boolean(options.overwrite) });
  }

  delete(path: string): Promise<{
    readonly path: string;
    readonly deletedCount: number;
    readonly stats: WorkspaceStats;
  }> {
    return this.call('delete', { path });
  }

  /**
   * U2: deletes several files and folders in one transaction. A path inside another listed folder
   * counts once; `failed` lists invalid paths (the rest still go), `missing` paths that did not exist.
   */
  deleteMany(paths: readonly string[]): Promise<DeleteManyResult> {
    return this.call('deleteMany', { paths: [...paths] });
  }

  bulkWrite(
    entries: readonly BulkWriteInput[],
    options: { readonly replaceWorkspace?: boolean; readonly transfer?: boolean } = {},
  ): Promise<{ readonly count: number; readonly stats: WorkspaceStats }> {
    const transfer: Transferable[] = [];
    const seenBuffers = new Set<ArrayBuffer>();

    const prepared = entries.map((item) => {
      if (item.isDir || item.bytes === null || item.bytes === undefined) {
        return { path: item.path, isDir: Boolean(item.isDir), bytes: null, createdByRun: Boolean(item.createdByRun) };
      }
      if (typeof item.bytes === 'string') {
        const encoded = this.encoder.encode(item.bytes);
        transfer.push(encoded.buffer);
        seenBuffers.add(encoded.buffer);
        return { path: item.path, isDir: false, bytes: encoded, createdByRun: Boolean(item.createdByRun) };
      }
      if (item.bytes instanceof ArrayBuffer) {
        if (options.transfer !== false && !seenBuffers.has(item.bytes)) {
          transfer.push(item.bytes);
          seenBuffers.add(item.bytes);
        }
        return { path: item.path, isDir: false, bytes: item.bytes, createdByRun: Boolean(item.createdByRun) };
      }
      if (item.bytes instanceof Uint8Array) {
        if (
          options.transfer !== false &&
          item.bytes.buffer instanceof ArrayBuffer &&
          item.bytes.byteOffset === 0 &&
          item.bytes.byteLength === item.bytes.buffer.byteLength &&
          !seenBuffers.has(item.bytes.buffer)
        ) {
          transfer.push(item.bytes.buffer);
          seenBuffers.add(item.bytes.buffer);
        }
        return { path: item.path, isDir: false, bytes: item.bytes, createdByRun: Boolean(item.createdByRun) };
      }
      return { path: item.path, isDir: false, bytes: item.bytes, createdByRun: Boolean(item.createdByRun) };
    });

    return this.call(
      'bulkWrite',
      { entries: prepared, replaceWorkspace: Boolean(options.replaceWorkspace) },
      transfer,
    );
  }

  clearWorkspace(): Promise<{ readonly stats: WorkspaceStats }> {
    return this.call('clearWorkspace');
  }

  private ensureWheelWorker(): Promise<Worker> {
    if (this._closed) return Promise.reject(new StorageWorkerError('WORKER_CLOSED', 'Storage client has been closed'));
    if (!this.wheelWorker) {
      // The storage worker owns the schema (v2 adds the wheels store), so it opens the database first.
      this.wheelWorker = this.call('stats').then(() => {
        if (this._closed) throw new StorageWorkerError('WORKER_CLOSED', 'Storage client has been closed');
        const worker = new Worker(getPythonWheelWorkerUrl(), { type: 'module' });
        worker.onmessage = (event: MessageEvent) => this.handleMessage(event.data);
        worker.onerror = (event: ErrorEvent) => {
          event.preventDefault();
          this.wheelWorker = null;
          this.rejectAllPending(new StorageWorkerError('UNKNOWN', event.message || 'Wheel worker crashed unexpectedly'));
        };
        return worker;
      });
      this.wheelWorker.catch(() => {
        this.wheelWorker = null;
      });
    }
    return this.wheelWorker;
  }

  private async wheelCall<T>(op: string, payload: Record<string, unknown> = {}, transfer: Transferable[] = []): Promise<T> {
    const worker = await this.ensureWheelWorker();
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
      worker.postMessage({ id, op, ...payload }, transfer);
    });
  }

  /**
   * Saves wheel bytes under their SHA-256 (the storage worker hashes them again and refuses a
   * mismatch with HASH_MISMATCH). The bytes are copied, so the caller keeps its array.
   */
  putWheel(
    sha256: string,
    fileName: string,
    bytes: Uint8Array,
  ): Promise<{ readonly sha256: string; readonly fileName: string; readonly size: number; readonly stats: WheelStoreStats }> {
    const copy = bytes.slice();
    return this.wheelCall('wheel.put', { sha256, fileName, bytes: copy }, [copy.buffer]);
  }

  /** The saved row for `sha256`, or null. The bytes are untrusted: hash them before use. */
  getWheel(sha256: string): Promise<SavedWheel | null> {
    return this.wheelCall<SavedWheel | null>('wheel.get', { sha256 });
  }

  deleteWheel(sha256: string): Promise<{ readonly deleted: number }> {
    return this.wheelCall('wheel.delete', { sha256 });
  }

  /** Every row (also rows user code added), read from keys and indexes only. */
  listWheels(): Promise<{ readonly wheels: readonly SavedWheelMeta[]; readonly stats: WheelStoreStats }> {
    return this.wheelCall('wheel.list');
  }

  wheelStats(): Promise<WheelStoreStats> {
    return this.wheelCall<WheelStoreStats>('wheel.stats');
  }

  /** Deletes every saved wheel whose sha256 is not in `keep`. */
  pruneWheels(keep: readonly string[]): Promise<{ readonly deleted: number }> {
    return this.wheelCall('wheel.prune', { keep: [...keep] });
  }

  /** Creates a direct MessageChannel between the Storage Worker and python-worker.js, returning port2. */
  async createPythonPort(): Promise<MessagePort> {
    const channel = new MessageChannel();
    await this.call('connectPythonPort', { port: channel.port1 }, [channel.port1]);
    return channel.port2;
  }

  async getStorageEstimate(): Promise<StorageEstimateInfo> {
    if (
      typeof navigator === 'undefined' ||
      !navigator.storage ||
      typeof navigator.storage.estimate !== 'function'
    ) {
      return { supported: false, usage: null, quota: null };
    }
    try {
      const est = await navigator.storage.estimate();
      return {
        supported: true,
        usage: typeof est.usage === 'number' ? est.usage : null,
        quota: typeof est.quota === 'number' ? est.quota : null,
      };
    } catch {
      return { supported: false, usage: null, quota: null };
    }
  }

  /** Gracefully closes the IndexedDB connection inside the Storage Worker, then terminates it. */
  async close(): Promise<void> {
    if (this._closed) return;
    this._closed = true;
    activeStorageClients.delete(this);

    const worker = this.worker;
    if (!worker) {
      this.listeners.clear();
      return;
    }

    try {
      const id = this.nextId++;
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, 2000);
        this.pending.set(id, {
          resolve: () => {
            clearTimeout(timer);
            resolve();
          },
          reject: () => {
            clearTimeout(timer);
            resolve();
          },
        });
        try {
          worker.postMessage({ id, op: 'close', workspaceId: this.workspaceId });
        } catch {
          clearTimeout(timer);
          resolve();
        }
      });
    } finally {
      this.terminateWorker();
    }
  }

  dispose(): void {
    void this.close();
  }

  private terminateWorker(): void {
    const wheel = this.wheelWorker;
    this.wheelWorker = null;
    if (wheel) {
      void wheel.then(
        (w) => {
          w.postMessage({ id: -1, op: 'close' });
          w.terminate();
        },
        () => undefined,
      );
    }
    const worker = this.worker;
    this.worker = null;
    if (worker) {
      worker.onmessage = null;
      worker.onerror = null;
      worker.terminate();
    }
    this.rejectAllPending(new StorageWorkerError('WORKER_CLOSED', 'Storage worker closed'));
    this.listeners.clear();
  }
}
