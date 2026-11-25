// Restoring and keeping packages (P5b), for the Packages panel (P6) to call. Framework-free.
// After every worker `ready` the kept entries of the page-only manifest are installed in one
// pkg.install (reason 'restore') before the first run or console line (the client holds runs until
// it settles). Saved wheel bytes are hashed here against the manifest before they are sent, so bytes
// user code wrote into IndexedDB are never installed (D15, D20, D22). Nothing is fetched outside
// Package index mode, and a stale entry is never re-installed from the network on its own.

import type { NetworkMode } from './network';
import {
  canonicalName,
  checkWheelTags,
  entryFromInfo,
  loadBundledIndex,
  orphanedDependencies,
  planRestore,
  readManifest,
  sha256Hex,
  writeManifest,
} from './packages';
import type { BundledIndex, ManifestEntry, RestoreSkip, RuntimeInfo } from './packages';
import { isPythonHostedUrl, isWheelFileName, MAX_INSTALL_BYTES, MAX_WHEEL_BYTES } from './packageProtocol';
import type { PackageFailure, PackageInfo, PackageInstallItem } from './packageProtocol';
import { parseLock } from './requirements';
import type { PythonStorageClient } from './storageClient';
import type { PackageInstallResult, PythonWorkerClient, ReadyInfo } from './workerClient';

export interface RestoreReport {
  /** 'restore' after a worker start, 'lock' for an imported lock file. */
  readonly reason: 'restore' | 'lock';
  readonly installed: readonly PackageInfo[];
  readonly failed: readonly PackageFailure[];
  readonly skipped: readonly RestoreSkip[];
  /** Set when the install could not be sent (the worker restarted, crashed or refused). */
  readonly error?: string;
  readonly durationMs: number;
}

/** Codes for i18n (P6). */
export type KeepFailureReason =
  /** Installed by user code (D23): never kept. */
  | 'code'
  /** A dependency was installed by user code. */
  | 'code-dependency'
  /** A dependency is not installed in this session. */
  | 'missing-dependency'
  /** No sha256/file name reported for it. */
  | 'no-hash'
  /** No saved copy could be made (no bytes, no PyPI URL, or not in Package index mode). */
  | 'no-saved-copy'
  /** The bytes did not hash to the reported sha256. */
  | 'hash-mismatch'
  /** Over the wheel store caps (50 MiB per wheel, 200 MiB / 64 wheels in all) or the 200-entry list. */
  | 'cap-exceeded'
  | 'storage-error';

export interface KeepResult {
  readonly kept: readonly string[];
  readonly failed: readonly { readonly name: string; readonly reason: KeepFailureReason }[];
}

export type WheelRejectReason = 'invalid-name' | 'too-large' | 'incompatible-wheel';

export interface WheelInstallResult {
  readonly install: PackageInstallResult | null;
  readonly rejected: readonly { readonly fileName: string; readonly reason: WheelRejectReason; readonly info?: string }[];
  readonly keep: KeepResult | null;
}

export interface PackageRestorerOptions {
  readonly client: PythonWorkerClient;
  readonly storage: PythonStorageClient;
  readonly mode: NetworkMode;
  /** Defaults to window.localStorage. */
  readonly storageArea?: Storage | null;
  /** Page-side fetch for a PyPI saved copy (Package index mode only). */
  readonly fetchFn?: typeof fetch;
  readonly loadBundled?: () => Promise<BundledIndex>;
  /** Names of stale entries the visitor confirmed (read at each restore). */
  readonly confirmStale?: () => ReadonlySet<string>;
  readonly onRestoreStart?: (count: number) => void;
  readonly onRestore?: (report: RestoreReport) => void;
}

function readyToRuntime(info: ReadyInfo): RuntimeInfo {
  return {
    pyodideVersion: info.pyodideVersion,
    pythonVersion: info.pythonVersion,
    abiVersion: info.abiVersion,
    platform: info.platform,
  };
}

/** Orders entries so dependencies come first (cycles broken by manifest order). */
function dependencyOrder<T extends { readonly entry: ManifestEntry }>(items: readonly T[]): T[] {
  const byName = new Map(items.map((it) => [it.entry.name, it]));
  const done = new Set<string>();
  const out: T[] = [];
  const visit = (it: T, stack: Set<string>) => {
    if (done.has(it.entry.name) || stack.has(it.entry.name)) return;
    stack.add(it.entry.name);
    for (const d of it.entry.depends) {
      const dep = byName.get(d);
      if (dep) visit(dep, stack);
    }
    done.add(it.entry.name);
    out.push(it);
  };
  for (const it of items) visit(it, new Set());
  return out;
}

export class PackageRestorer {
  private readonly opts: PackageRestorerOptions;
  private readonly fetchFn: typeof fetch;
  private unsubscribe: (() => void) | null = null;
  private generation = 0;
  private idle: Promise<unknown> = Promise.resolve();

  constructor(options: PackageRestorerOptions) {
    this.opts = options;
    this.fetchFn = options.fetchFn ?? ((input, init) => fetch(input, init));
  }

  /** Restores after every `ready` from now on (and now, if the worker is already ready). */
  attach(): void {
    if (this.unsubscribe) return;
    this.unsubscribe = this.opts.client.subscribe({ ready: (info) => this.onReady(info) });
    const info = this.opts.client.readyInfo;
    if (info) this.onReady(info);
  }

  dispose(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.generation += 1;
  }

  /** Settles when the restore (or keep/import) in progress has finished. */
  whenIdle(): Promise<void> {
    return this.idle.then(
      () => undefined,
      () => undefined,
    );
  }

  get entries(): readonly ManifestEntry[] {
    return readManifest(this.opts.storageArea).manifest.entries;
  }

  private onReady(info: ReadyInfo): void {
    const gen = ++this.generation;
    const entries = this.entries.filter((e) => e.keep);
    if (entries.length === 0) return;
    const p = this.installEntries(entries, info, 'restore', gen).then((report) => {
      if (report && gen === this.generation) this.opts.onRestore?.(report);
      return report;
    });
    this.idle = p;
    this.opts.client.holdUntil(p);
  }

  private async savedShas(): Promise<Set<string>> {
    try {
      const { wheels } = await this.opts.storage.listWheels();
      return new Set(wheels.map((w) => w.sha256));
    } catch {
      return new Set();
    }
  }

  private async bundled(): Promise<BundledIndex> {
    return (this.opts.loadBundled ?? (() => loadBundledIndex()))();
  }

  /** Plans, loads and hash-checks the saved bytes, then sends one install per ≤ 150 MiB of wheels. */
  private async installEntries(
    entries: readonly ManifestEntry[],
    info: ReadyInfo,
    reason: 'restore' | 'lock',
    gen: number | null,
  ): Promise<RestoreReport | null> {
    const t0 = performance.now();
    const runtime = readyToRuntime(info);
    const [saved, bundled] = await Promise.all([this.savedShas(), this.bundled()]);
    const plan = planRestore(entries, this.opts.mode, runtime, {
      saved,
      bundled,
      confirmStale: this.opts.confirmStale?.(),
    });
    const skipped: RestoreSkip[] = [...plan.skipped];
    const skipEntry = (e: ManifestEntry, why: RestoreSkip['reason']) =>
      skipped.push({ name: e.name, version: e.version, source: e.source, reason: why });
    const bundledItems: PackageInstallItem[] = [];
    const wheels: { entry: ManifestEntry; item: PackageInstallItem; size: number }[] = [];
    for (const it of plan.items) {
      const e = it.entry;
      if (it.kind === 'bundled') {
        bundledItems.push({ kind: 'bundled', name: e.name });
        continue;
      }
      let row = null;
      try {
        row = saved.has(e.sha256 as string) ? await this.opts.storage.getWheel(e.sha256 as string) : null;
      } catch {
        row = null;
      }
      if (row) {
        if ((await sha256Hex(row.bytes)) !== e.sha256) {
          skipEntry(e, 'hash-mismatch');
          continue;
        }
        const item: PackageInstallItem =
          e.source === 'pypi' && e.url
            ? { kind: 'wheel', fileName: e.fileName as string, sha256: e.sha256 as string, bytes: row.bytes, url: e.url }
            : { kind: 'wheel', fileName: e.fileName as string, sha256: e.sha256 as string, bytes: row.bytes };
        wheels.push({ entry: e, item, size: row.bytes.byteLength });
      } else if (it.fallbackUrl) {
        wheels.push({
          entry: e,
          item: { kind: 'pypi', requirement: `${e.name}==${e.version}`, url: it.fallbackUrl, sha256: e.sha256 as string },
          size: 0,
        });
      } else {
        skipEntry(e, 'wheel-missing');
      }
    }
    if (gen !== null && gen !== this.generation) return null;

    const batches: PackageInstallItem[][] = [];
    let current: PackageInstallItem[] = [...bundledItems];
    let bytes = 0;
    for (const w of dependencyOrder(wheels)) {
      if (bytes + w.size > MAX_INSTALL_BYTES && current.length) {
        batches.push(current);
        current = [];
        bytes = 0;
      }
      current.push(w.item);
      bytes += w.size;
    }
    if (current.length) batches.push(current);

    const installed: PackageInfo[] = [];
    const failed: PackageFailure[] = [];
    let error: string | undefined;
    if (batches.length) this.opts.onRestoreStart?.(batches.reduce((n, b) => n + b.length, 0));
    for (const batch of batches) {
      try {
        const res = await this.opts.client.installPackages(batch, 'restore');
        if (res.refused) {
          error = res.refused;
          break;
        }
        installed.push(...res.installed);
        failed.push(...res.failed);
      } catch (err) {
        error = err instanceof Error ? err.message : String(err);
        break;
      }
    }
    const report: RestoreReport = { reason, installed, failed, skipped, durationMs: performance.now() - t0 };
    return error === undefined ? report : { ...report, error };
  }

  /** Installs a lock file's entries (bundled always; PyPI by URL only in Package index mode; wheels from saved bytes). */
  async importLock(text: string): Promise<{ readonly report: RestoreReport | null; readonly dropped: number; readonly invalid: boolean }> {
    const { lock, dropped } = parseLock(text);
    if (!lock) return { report: null, dropped, invalid: true };
    const info = this.opts.client.readyInfo ?? (await this.opts.client.start());
    await this.whenIdle();
    const p = this.installEntries(lock.entries, info, 'lock', null);
    this.idle = p;
    return { report: await p, dropped, invalid: false };
  }

  /** Marks the named entries as installed under the current Pyodide (after a confirmed stale restore). */
  markCurrent(names: readonly string[]): void {
    const info = this.opts.client.readyInfo;
    if (!info) return;
    const want = new Set(names.map(canonicalName));
    const entries = this.entries.map((e) =>
      want.has(e.name) ? { ...e, pyodideVersion: info.pyodideVersion, abiVersion: info.abiVersion } : e,
    );
    writeManifest(entries, this.opts.storageArea);
  }

  /**
   * Keeps installed packages and the dependencies they need (D20: PyPI and wheel entries keep a saved
   * copy of their bytes). `bytesBySha` supplies bytes the page already has (uploaded wheels); a PyPI
   * wheel without them is fetched from its files.pythonhosted.org URL in Package index mode only.
   * Packages installed by code (source `code`) are never kept (D23).
   */
  async keepPackages(
    infos: readonly PackageInfo[],
    options: { readonly installed?: readonly PackageInfo[]; readonly bytesBySha?: ReadonlyMap<string, Uint8Array> } = {},
  ): Promise<KeepResult> {
    const ready = this.opts.client.readyInfo ?? (await this.opts.client.start());
    const runtime = readyToRuntime(ready);
    const installed = options.installed ?? (await this.opts.client.listPackages()).packages;
    const byName = new Map(installed.map((p) => [canonicalName(p.name), p]));
    for (const p of infos) byName.set(canonicalName(p.name), p);
    const failed: { name: string; reason: KeepFailureReason }[] = [];
    const add = new Map<string, ManifestEntry>();
    const requestedNames = new Set(infos.map((p) => canonicalName(p.name)));

    for (const root of infos) {
      const rootName = canonicalName(root.name);
      if (root.source === 'code') {
        failed.push({ name: rootName, reason: 'code' });
        continue;
      }
      // The root and every dependency it needs (transitively), all keepable, or nothing.
      const closure: PackageInfo[] = [];
      const seen = new Set<string>();
      let problem: KeepFailureReason | null = null;
      const visit = (name: string, isRoot: boolean) => {
        if (seen.has(name) || problem) return;
        seen.add(name);
        const p = byName.get(name);
        if (!p) {
          problem = 'missing-dependency';
          return;
        }
        if (p.source === 'code') {
          problem = isRoot ? 'code' : 'code-dependency';
          return;
        }
        closure.push(p);
        for (const d of p.depends) visit(canonicalName(d), false);
      };
      visit(rootName, true);
      if (problem) {
        failed.push({ name: rootName, reason: problem });
        continue;
      }
      for (const p of closure) {
        const name = canonicalName(p.name);
        if (add.has(name)) continue;
        const entry = entryFromInfo(p, runtime, requestedNames.has(name));
        if (typeof entry === 'string') {
          problem = entry === 'code' ? 'code-dependency' : 'no-hash';
          break;
        }
        add.set(name, entry);
      }
      if (problem) failed.push({ name: rootName, reason: problem });
    }

    // Saved copies for every pypi/wheel entry (hash-checked), before the manifest names them.
    const saved = await this.savedShas();
    const failedNames = new Set(failed.map((f) => f.name));
    for (const [name, e] of add) {
      if (e.source === 'bundled' || saved.has(e.sha256 as string)) continue;
      let bytes = options.bytesBySha?.get(e.sha256 as string) ?? null;
      if (!bytes && e.source === 'pypi' && e.url && this.opts.mode === 'pkg' && isPythonHostedUrl(e.url)) {
        try {
          const res = await this.fetchFn(e.url, { credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store' });
          bytes = res.ok ? new Uint8Array(await res.arrayBuffer()) : null;
        } catch {
          bytes = null;
        }
      }
      let why: KeepFailureReason | null = null;
      if (!bytes) why = 'no-saved-copy';
      else if (bytes.byteLength > MAX_WHEEL_BYTES) why = 'cap-exceeded';
      else if ((await sha256Hex(bytes)) !== e.sha256) why = 'hash-mismatch';
      else {
        try {
          await this.opts.storage.putWheel(e.sha256 as string, e.fileName as string, bytes);
          saved.add(e.sha256 as string);
        } catch (err) {
          const code = (err as { code?: string }).code;
          why = code === 'CAP_EXCEEDED' || code === 'QUOTA_EXCEEDED' ? 'cap-exceeded' : code === 'HASH_MISMATCH' ? 'hash-mismatch' : 'storage-error';
        }
      }
      if (why) {
        failed.push({ name, reason: why });
        failedNames.add(name);
      }
    }
    // Drop a root whose closure lost an entry, so nothing is kept half-restorable.
    const dropRoots = new Set<string>();
    for (const root of infos) {
      const rootName = canonicalName(root.name);
      if (failedNames.has(rootName)) continue;
      const stack = [rootName];
      const seen = new Set<string>();
      while (stack.length) {
        const n = stack.pop() as string;
        if (seen.has(n)) continue;
        seen.add(n);
        if (failedNames.has(n)) {
          dropRoots.add(rootName);
          break;
        }
        stack.push(...(add.get(n)?.depends ?? []));
      }
    }
    for (const r of dropRoots) failed.push({ name: r, reason: 'missing-dependency' });

    const current = this.entries;
    const merged = new Map(current.map((e) => [e.name, e]));
    const kept: string[] = [];
    for (const [name, e] of add) {
      if (failedNames.has(name) || dropRoots.has(name)) continue;
      const old = merged.get(name);
      merged.set(name, old && old.requested && !e.requested ? { ...e, requested: true } : e);
      if (requestedNames.has(name)) kept.push(name);
    }
    // Dependencies kept only for a dropped root are left out again.
    const list = [...merged.values()];
    const orphans = new Set(orphanedDependencies(list).filter((n) => !current.some((e) => e.name === n)));
    try {
      writeManifest(
        list.filter((e) => !orphans.has(e.name)),
        this.opts.storageArea,
      );
    } catch {
      return { kept: [], failed: [...failed, ...kept.map((name) => ({ name, reason: 'cap-exceeded' as const }))] };
    }
    return { kept, failed };
  }

  /**
   * Removes a kept package (and dependencies nothing else needs), deletes saved bytes no entry uses
   * (also rows user code added) and restarts the worker, which then restores what is still kept.
   */
  async removePackage(name: string, options: { readonly restart?: boolean } = {}): Promise<{ readonly removed: readonly string[] }> {
    const target = canonicalName(name);
    const before = this.entries;
    let after = before.filter((e) => e.name !== target);
    if (after.length === before.length) return { removed: [] };
    const orphans = new Set(orphanedDependencies(after));
    after = after.filter((e) => !orphans.has(e.name));
    writeManifest(after, this.opts.storageArea);
    try {
      await this.opts.storage.pruneWheels(after.flatMap((e) => (e.sha256 ? [e.sha256] : [])));
    } catch {
      // Unused bytes are never installed; they are pruned on the next removal.
    }
    if (options.restart !== false) await this.opts.client.restart();
    return { removed: [target, ...orphans] };
  }

  /**
   * Installs wheel files the visitor chose (name and tags checked first, hashed here, installed in
   * one call so they satisfy each other) and keeps them with their saved bytes when `keep` is set.
   */
  async installWheelFiles(
    files: readonly (File | { readonly name: string; readonly bytes: Uint8Array })[],
    options: { readonly keep?: boolean } = {},
  ): Promise<WheelInstallResult> {
    const info = this.opts.client.readyInfo ?? (await this.opts.client.start());
    const rejected: { fileName: string; reason: WheelRejectReason; info?: string }[] = [];
    const accepted: { fileName: string; sha256: string; bytes: Uint8Array }[] = [];
    for (const f of files) {
      const fileName = f.name;
      const blob = typeof Blob !== 'undefined' && f instanceof Blob ? f : null;
      const size = blob ? blob.size : (f as { bytes: Uint8Array }).bytes.byteLength;
      if (!isWheelFileName(fileName)) {
        rejected.push({ fileName, reason: 'invalid-name' });
        continue;
      }
      if (size > MAX_WHEEL_BYTES || size === 0) {
        rejected.push({ fileName, reason: 'too-large' });
        continue;
      }
      const tags = checkWheelTags(fileName, info);
      if (tags) {
        rejected.push({ fileName, reason: tags.problem === 'name' ? 'invalid-name' : 'incompatible-wheel', info: tags.platform });
        continue;
      }
      const bytes = blob ? new Uint8Array(await blob.arrayBuffer()) : (f as { bytes: Uint8Array }).bytes.slice();
      accepted.push({ fileName, sha256: await sha256Hex(bytes), bytes });
    }
    if (!accepted.length) return { install: null, rejected, keep: null };
    await this.whenIdle();
    const install = await this.opts.client.installPackages(
      accepted.map((w) => ({ kind: 'wheel', fileName: w.fileName, sha256: w.sha256, bytes: w.bytes.slice() })),
      'user',
    );
    if (!options.keep || install.refused) return { install, rejected, keep: null };
    const shas = new Set(accepted.map((w) => w.sha256));
    const roots = install.installed.filter((p) => p.sha256 && shas.has(p.sha256));
    const keep = roots.length
      ? await this.keepPackages(roots, { bytesBySha: new Map(accepted.map((w) => [w.sha256, w.bytes])) })
      : null;
    return { install, rejected, keep };
  }
}
