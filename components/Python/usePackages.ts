// State and actions of the Packages tab (P6): wires PackageRestorer (attached before the worker's first
// start, so kept packages are restored after every `ready`) and the worker client to the panel. Every
// install starts from a click in this trusted panel (D18): PyPI installs only in Package index mode
// (D21) and only after W6; nothing a program prints or sends can start one. Texts are kept as i18n
// keys so a language switch re-renders them.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { NetworkMode } from '../../lib/python/network';
import { PackageRestorer } from '../../lib/python/packageRestore';
import type { KeepResult, RestoreReport } from '../../lib/python/packageRestore';
import type { PackageFailure, PackageInfo, PackageInstallItem } from '../../lib/python/packageProtocol';
import {
  canonicalName,
  entryFromInfo,
  loadBundledIndex,
  planRestore,
  readManifest,
} from '../../lib/python/packages';
import type { BundledIndex, ManifestEntry, RestoreSkipReason } from '../../lib/python/packages';
import { resolvePypi } from '../../lib/python/pypiResolve';
import {
  exportLock,
  exportRequirements,
  hashProblems,
  parseLock,
  parseRequirementLine,
  parseRequirements,
  planRequirements,
  satisfies,
} from '../../lib/python/requirements';
import type { PythonStorageClient } from '../../lib/python/storageClient';
import type { PythonWorkerClient, RunResult } from '../../lib/python/workerClient';
import { triggerBlobDownload } from './fileHelpers';

export type RowSource = 'bundled' | 'pypi' | 'pypi-saved' | 'wheel' | 'code';

export interface PackageRow {
  readonly name: string;
  readonly version: string;
  readonly source: RowSource;
  /** Loaded in this worker session. */
  readonly installed: boolean;
  readonly kept: boolean;
  /** Kept only because another kept package needs it. */
  readonly keptAsDependency: boolean;
  /** Why a kept entry was not restored at the last start. */
  readonly skip?: RestoreSkipReason;
  readonly info?: PackageInfo;
}

/** A package of our bundled index (pyodide-lock.json) that is not loaded in this worker session. */
export interface BundledRow {
  readonly name: string;
  readonly version: string;
  /** Import names when none is the package name (`PIL` for pillow), else empty. */
  readonly imports: readonly string[];
  /** Bundled packages that depend on it; empty for a top-level package (listed first). */
  readonly neededBy: readonly string[];
}

/** An i18n key with its values (translated when rendered). */
export interface Msg {
  readonly key: string;
  readonly vars?: Readonly<Record<string, string | number>>;
}

export interface PanelNotice {
  readonly tone: 'good' | 'warn' | 'bad';
  readonly lines: readonly Msg[];
  /** Raw error text for a Details toggle. */
  readonly details?: string;
}

export interface W6Item {
  readonly name: string;
  /** '' when a requirement names no exact version. */
  readonly version: string;
  readonly host: string;
}

export interface W6Request {
  readonly items: readonly W6Item[];
  readonly onConfirm: () => Promise<void>;
}

export interface ImportPreview {
  readonly fileName: string;
  readonly kind: 'requirements' | 'lock';
  readonly install: readonly { readonly name: string; readonly detail: string; readonly via: 'bundled' | 'pypi' | 'saved' }[];
  readonly skipped: readonly { readonly text: string; readonly line?: number; readonly reason: Msg }[];
  readonly pypi: readonly W6Item[];
  readonly lines: readonly Msg[];
  readonly run: () => Promise<void>;
}

export interface UsePackagesOptions {
  readonly mode: NetworkMode;
  readonly running: boolean;
  readonly locked: boolean;
  /** The Packages tab is shown (refreshes the list and clears the badge). */
  readonly visible: boolean;
}

const MAX_IMPORT_BYTES = 256 * 1024;
const IMPORT_NAME_RE = /No module named '([A-Za-z_][A-Za-z0-9_]{0,99})/;

const msg = (key: string, vars?: Record<string, string | number>): Msg => (vars ? { key, vars } : { key });

function failureLines(failed: readonly PackageFailure[]): Msg[] {
  return failed.map((f) =>
    msg(`python.pkgErr.${f.kind}`, { name: f.requirement || '?', info: f.info ?? '', spec: f.requirement }),
  );
}

function keepFailureLines(res: KeepResult): Msg[] {
  return res.failed.map((f) => msg('python.pkgKeepFailed', { name: f.name, reasonKey: `python.pkgKeepFail.${f.reason}` }));
}

export function usePackages({ mode, running, locked, visible }: UsePackagesOptions) {
  const clientRef = useRef<PythonWorkerClient | null>(null);
  const storageRef = useRef<PythonStorageClient | null>(null);
  const restorerRef = useRef<PackageRestorer | null>(null);
  const confirmStaleRef = useRef<Set<string>>(new Set());
  const pageInstalledRef = useRef<Set<string>>(new Set());
  const wheelFilesRef = useRef<Map<string, File>>(new Map());
  const refreshSeq = useRef(0);

  const [ready, setReady] = useState(false);
  const [installed, setInstalled] = useState<readonly PackageInfo[]>([]);
  const [manifest, setManifest] = useState<readonly ManifestEntry[]>([]);
  const [saved, setSaved] = useState<ReadonlySet<string>>(() => new Set());
  const [skips, setSkips] = useState<ReadonlyMap<string, RestoreSkipReason>>(() => new Map());
  const [bundled, setBundled] = useState<BundledIndex | null>(null);
  const [busy, setBusy] = useState<Msg | null>(null);
  const [workerInstalling, setWorkerInstalling] = useState(false);
  const [notice, setNotice] = useState<PanelNotice | null>(null);
  const [restoreNotice, setRestoreNotice] = useState<PanelNotice | null>(null);
  const [restoreProblems, setRestoreProblems] = useState(0);
  const [w6, setW6] = useState<W6Request | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [missing, setMissing] = useState<readonly string[]>([]);
  const [draft, setDraft] = useState('');

  // The bundled index (our pyodide-lock.json) is fetched only after the worker is ready, so nothing
  // under /pyodide/ loads before W1 and W4 are answered.
  useEffect(() => {
    setManifest(readManifest().manifest.entries);
  }, []);

  const refresh = useCallback(async () => {
    const client = clientRef.current;
    const storage = storageRef.current;
    setManifest(readManifest().manifest.entries);
    if (!client?.readyInfo || client.state === 'running' || client.state === 'stopping' || client.state === 'booting') return;
    const seq = ++refreshSeq.current;
    const [list, shas] = await Promise.all([
      client.listPackages().catch(() => null),
      storage
        ? storage.listWheels().then(
            (r) => new Set(r.wheels.map((w) => w.sha256)),
            () => new Set<string>(),
          )
        : Promise.resolve(new Set<string>()),
    ]);
    if (seq !== refreshSeq.current) return;
    if (list && !list.refused) setInstalled(list.packages);
    setSaved(shas);
    setManifest(readManifest().manifest.entries);
  }, []);

  const handleRestore = useCallback(
    (report: RestoreReport) => {
      const confirmed = confirmStaleRef.current;
      const done = report.installed.map((p) => canonicalName(p.name)).filter((n) => confirmed.has(n));
      if (done.length) {
        restorerRef.current?.markCurrent(done);
        for (const n of done) confirmed.delete(n);
      }
      setSkips(new Map(report.skipped.map((s) => [s.name, s.reason])));
      const problems = report.skipped.length + report.failed.length + (report.error ? 1 : 0);
      const lines: Msg[] = [];
      const restored = report.installed.length;
      if (restored) lines.push(msg('python.pkgRestoreOk', { count: restored }));
      if (report.skipped.length) {
        lines.push(msg('python.pkgRestoreSkipped', { count: report.skipped.length }));
        for (const s of report.skipped) lines.push(msg('python.pkgRestoreSkipLine', { name: s.name, reasonKey: `python.pkgSkip.${s.reason}` }));
      }
      lines.push(...failureLines(report.failed));
      if (report.error) lines.push(msg('python.pkgRestoreError'));
      setRestoreNotice(lines.length ? { tone: problems ? 'warn' : 'good', lines } : null);
      setRestoreProblems(problems);
      setBusy(null);
      void refresh();
    },
    [refresh],
  );

  /** Call right after creating the worker client and before its first start(); returns the cleanup. */
  const attach = useCallback(
    (client: PythonWorkerClient, storage: PythonStorageClient | null): (() => void) => {
      clientRef.current = client;
      storageRef.current = storage;
      let restorer: PackageRestorer | null = null;
      if (storage) {
        restorer = new PackageRestorer({
          client,
          storage,
          mode,
          confirmStale: () => confirmStaleRef.current,
          onRestoreStart: (count) => setBusy(msg('python.pkgBusyRestore', { count })),
          onRestore: handleRestore,
        });
        restorer.attach();
      }
      restorerRef.current = restorer;
      const unsub = client.subscribe({
        ready: () => {
          setReady(true);
          void loadBundledIndex().then(setBundled);
          void (restorer ? restorer.whenIdle() : Promise.resolve()).then(() => {
            // A restore superseded by a restart reports nothing; never leave its busy line behind.
            setBusy((b) => (b && b.key === 'python.pkgBusyRestore' ? null : b));
            return refresh();
          });
        },
        state: (s) => {
          if (s === 'crashed' || s === 'idle' || s === 'booting') setReady(false);
          else if (s === 'ready' || s === 'blocked') setReady(true);
        },
        status: (phase) => setWorkerInstalling(phase === 'installing'),
      });
      return () => {
        unsub();
        restorer?.dispose();
        if (restorerRef.current === restorer) restorerRef.current = null;
        if (clientRef.current === client) clientRef.current = null;
        setReady(false);
      };
    },
    [handleRestore, mode, refresh],
  );

  useEffect(() => {
    if (!visible) return;
    setRestoreProblems(0);
    if (!running) void refresh();
  }, [visible, running, refresh]);

  const disabledReason: Msg | null = locked
    ? msg('python.pkgDisabledLocked')
    : running
      ? msg('python.pkgDisabledRunning')
      : !ready
        ? msg('python.pkgDisabledNotReady')
        : null;

  /** Runs one panel operation with a busy line; errors become a notice. */
  const guarded = useCallback(async (busyMsg: Msg, fn: () => Promise<void>) => {
    setBusy(busyMsg);
    try {
      await fn();
    } catch (err) {
      setNotice({ tone: 'bad', lines: [msg('python.pkgErr.other', { name: '' })], details: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(null);
    }
  }, []);

  const doInstall = useCallback(
    async (
      items: readonly PackageInstallItem[],
      requested: readonly string[],
      after?: (installed: readonly PackageInfo[]) => Msg[] | Promise<Msg[]>,
    ) => {
      const client = clientRef.current;
      if (!client) return;
      await guarded(msg('python.pkgBusyInstall'), async () => {
        await restorerRef.current?.whenIdle();
        const res = await client.installPackages(items, 'user');
        if (res.refused) {
          setNotice({ tone: 'bad', lines: [msg(res.refused === 'run-active' ? 'python.pkgDisabledRunning' : 'python.pkgDisabledNotReady')] });
          return;
        }
        const want = new Set(requested.map(canonicalName));
        for (const p of res.installed) if (want.has(canonicalName(p.name))) pageInstalledRef.current.add(canonicalName(p.name));
        const names = res.installed.map((p) => `${p.name} ${p.version}`).join(', ');
        const lines: Msg[] = [];
        if (res.installed.length) lines.push(msg('python.pkgInstalled', { names }), msg('python.pkgInstalledKeepHint'));
        lines.push(...failureLines(res.failed));
        const afterLines = after ? await after(res.installed) : [];
        lines.push(...afterLines);
        setNotice({
          tone: res.failed.length || afterLines.length ? (res.installed.length ? 'warn' : 'bad') : 'good',
          lines,
          details: res.failed.map((f) => f.detail).filter(Boolean).join('\n\n') || undefined,
        });
        await refresh();
      });
    },
    [guarded, refresh],
  );

  const installDraft = useCallback(async () => {
    const text = draft.trim();
    if (!text || disabledReason) return;
    setNotice(null);
    const parsed = parseRequirementLine(text.replace(/\s+/g, ' '));
    if ('reason' in parsed) {
      setNotice({ tone: 'bad', lines: [msg('python.pkgInvalidReq')] });
      return;
    }
    const b = bundled?.get(parsed.name);
    if (b) {
      if (!satisfies(b.version, parsed.specifier)) {
        setNotice({ tone: 'bad', lines: [msg('python.pkgReqSkip.bundled-version', { info: b.version })] });
        return;
      }
      await doInstall([{ kind: 'bundled', name: parsed.name }], [parsed.name]);
      return;
    }
    if (mode !== 'pkg') {
      setNotice({ tone: 'warn', lines: [msg(mode === 'off' ? 'python.pkgOffNotBundled' : 'python.pkgOtherNotBundled', { name: parsed.name })] });
      return;
    }
    const runtime = clientRef.current?.readyInfo;
    if (!runtime) return;
    setBusy(msg('python.pkgBusyResolve', { name: parsed.name }));
    const r = await resolvePypi(parsed, mode, runtime).finally(() => setBusy(null));
    if ('problem' in r) {
      setNotice({ tone: 'bad', lines: [msg(`python.pkgResolve.${r.problem}`, { name: r.name, info: r.info ?? '' })] });
      return;
    }
    setW6({
      items: [{ name: r.name, version: r.version, host: r.host }],
      onConfirm: () => doInstall([{ kind: 'pypi', requirement: r.requirement }], [r.name]),
    });
  }, [bundled, disabledReason, doInstall, draft, mode]);

  const confirmW6 = useCallback(() => {
    const req = w6;
    setW6(null);
    if (req) void req.onConfirm();
  }, [w6]);

  const cancelW6 = useCallback(() => setW6(null), []);

  const uploadWheels = useCallback(
    async (files: readonly File[], keep: boolean) => {
      const restorer = restorerRef.current;
      if (!restorer || !files.length || disabledReason) return;
      setNotice(null);
      await guarded(msg('python.pkgBusyInstall'), async () => {
        const res = await restorer.installWheelFiles(files, { keep });
        const lines: Msg[] = res.rejected.map((r) => msg(`python.pkgWheelReject.${r.reason}`, { file: r.fileName, info: r.info ?? '' }));
        const inst = res.install;
        if (inst?.refused) lines.push(msg('python.pkgDisabledRunning'));
        if (inst && !inst.refused) {
          for (const p of inst.installed) {
            if (p.source !== 'wheel' || !p.fileName) continue;
            pageInstalledRef.current.add(canonicalName(p.name));
            const f = files.find((x) => x.name === p.fileName);
            if (f && p.sha256) wheelFilesRef.current.set(p.sha256, f);
          }
          if (inst.installed.length) {
            lines.push(msg('python.pkgInstalled', { names: inst.installed.map((p) => `${p.name} ${p.version}`).join(', ') }));
            if (!keep) lines.push(msg('python.pkgInstalledKeepHint'));
          }
          lines.push(...failureLines(inst.failed));
        }
        if (res.keep) {
          for (const n of res.keep.kept) lines.push(msg('python.pkgKept', { name: n }));
          lines.push(...keepFailureLines(res.keep));
        }
        const bad = res.rejected.length + (inst?.failed.length ?? 0) + (res.keep?.failed.length ?? 0);
        setNotice({
          tone: bad ? (inst?.installed.length ? 'warn' : 'bad') : 'good',
          lines,
          details: inst?.failed.map((f) => f.detail).filter(Boolean).join('\n\n') || undefined,
        });
        await refresh();
      });
    },
    [disabledReason, guarded, refresh],
  );

  const setKeep = useCallback(
    async (row: PackageRow, keep: boolean) => {
      const restorer = restorerRef.current;
      if (!restorer || disabledReason) return;
      setNotice(null);
      if (!keep) {
        await guarded(msg('python.pkgBusyKeep', { name: row.name }), async () => {
          await restorer.removePackage(row.name, { restart: false });
          setNotice({ tone: 'good', lines: [msg('python.pkgUnkept', { name: row.name })] });
          await refresh();
        });
        return;
      }
      if (!row.info) return;
      const info = row.info;
      await guarded(msg('python.pkgBusyKeep', { name: row.name }), async () => {
        const bytesBySha = new Map<string, Uint8Array>();
        for (const [sha, f] of wheelFilesRef.current) bytesBySha.set(sha, new Uint8Array(await f.arrayBuffer()));
        const res = await restorer.keepPackages([info], { installed, bytesBySha });
        const lines = [...res.kept.map((n) => msg('python.pkgKept', { name: n })), ...keepFailureLines(res)];
        setNotice({ tone: res.failed.length ? 'bad' : 'good', lines });
        await refresh();
      });
    },
    [disabledReason, guarded, installed, refresh],
  );

  const removeRow = useCallback(
    async (name: string) => {
      const restorer = restorerRef.current;
      const client = clientRef.current;
      setConfirmRemove(null);
      if (!client || disabledReason) return;
      setNotice(null);
      setRestoreNotice(null);
      await guarded(msg('python.pkgBusyRemove', { name }), async () => {
        let removed: readonly string[] = [name];
        const isKept = readManifest().manifest.entries.some((e) => e.name === name);
        if (restorer && isKept) removed = (await restorer.removePackage(name)).removed;
        else await client.restart();
        pageInstalledRef.current.clear();
        await restorer?.whenIdle();
        setNotice({ tone: 'good', lines: [msg('python.pkgRemoved', { names: removed.join(', ') })] });
        await refresh();
      });
    },
    [disabledReason, guarded, refresh],
  );

  /** A stale entry (another Pyodide version): restore it after the visitor's click, never on its own. */
  const reinstallStale = useCallback(
    async (name: string) => {
      const client = clientRef.current;
      if (!client || disabledReason) return;
      confirmStaleRef.current.add(name);
      setNotice(null);
      setRestoreNotice(null);
      await guarded(msg('python.pkgBusyRestore', { count: 1 }), async () => {
        await client.restart();
        await restorerRef.current?.whenIdle();
        await refresh();
      });
    },
    [disabledReason, guarded, refresh],
  );

  const previewImport = useCallback(
    async (file: File) => {
      setNotice(null);
      const runtime = clientRef.current?.readyInfo;
      if (!runtime || disabledReason) return;
      if (file.size > MAX_IMPORT_BYTES) {
        setNotice({ tone: 'bad', lines: [msg('python.pkgPreviewTooBig')] });
        return;
      }
      const text = await file.text();
      const index = bundled ?? (await loadBundledIndex());
      let isLock = false;
      try {
        const j = JSON.parse(text) as unknown;
        isLock = !!j && typeof j === 'object' && 'format' in (j as object);
      } catch {
        isLock = false;
      }
      if (isLock) {
        const { lock, dropped } = parseLock(text);
        if (!lock) {
          setNotice({ tone: 'bad', lines: [msg('python.pkgPreviewInvalid')] });
          return;
        }
        const plan = planRestore(lock.entries, mode, runtime, { saved, bundled: index });
        const install = plan.items.map((it) => ({
          name: it.entry.name,
          detail: it.entry.version,
          via: it.kind === 'bundled' ? ('bundled' as const) : saved.has(it.entry.sha256 ?? '') ? ('saved' as const) : ('pypi' as const),
        }));
        setPreview({
          fileName: file.name,
          kind: 'lock',
          install,
          skipped: plan.skipped.map((s) => ({ text: `${s.name}==${s.version}`, reason: msg(`python.pkgSkip.${s.reason}`) })),
          pypi: install.filter((i) => i.via === 'pypi').map((i) => ({ name: i.name, version: i.detail, host: 'files.pythonhosted.org' })),
          lines: dropped ? [msg('python.pkgLockDropped', { count: dropped })] : [],
          run: async () => {
            const restorer = restorerRef.current;
            if (!restorer) return;
            await guarded(msg('python.pkgBusyInstall'), async () => {
              const r = await restorer.importLock(text);
              const rep = r.report;
              for (const p of rep?.installed ?? []) pageInstalledRef.current.add(canonicalName(p.name));
              const lines: Msg[] = [];
              if (rep?.installed.length) lines.push(msg('python.pkgInstalled', { names: rep.installed.map((p) => `${p.name} ${p.version}`).join(', ') }), msg('python.pkgInstalledKeepHint'));
              lines.push(...failureLines(rep?.failed ?? []));
              if (rep?.error) lines.push(msg('python.pkgDisabledRunning'));
              setNotice({ tone: rep?.failed.length || rep?.error ? 'warn' : 'good', lines });
              await refresh();
            });
          },
        });
        return;
      }
      const parsed = parseRequirements(text);
      const plan = planRequirements(parsed, mode, index);
      setPreview({
        fileName: file.name,
        kind: 'requirements',
        install: plan.planned.map((p) => ({ name: p.requirement.name, detail: p.requirement.requirement, via: p.via })),
        skipped: plan.skipped.map((s) => ({ text: s.text, line: s.line, reason: msg(`python.pkgReqSkip.${s.reason}`, { info: s.info ?? '' }) })),
        pypi: plan.planned
          .filter((p) => p.via === 'pypi')
          .map((p) => ({ name: p.requirement.name, version: p.requirement.specifier, host: 'pypi.org' })),
        lines: [],
        run: () =>
          doInstall(
            plan.items,
            plan.planned.map((p) => p.requirement.name),
            async (inst) => {
              const bad = hashProblems(inst, parsed.requirements);
              if (bad.length > 0) {
                // Defense-in-depth: unload any unverified code if a mismatch slipped past pre-install checks.
                await clientRef.current?.restart();
                return [msg('python.pkgHashProblem', { names: bad.join(', ') })];
              }
              return [];
            },
          ),
      });
    },
    [bundled, disabledReason, doInstall, guarded, mode, refresh, saved],
  );

  const confirmImport = useCallback(() => {
    const p = preview;
    setPreview(null);
    if (!p || p.install.length === 0) return;
    if (p.pypi.length) setW6({ items: p.pypi, onConfirm: p.run });
    else void p.run();
  }, [preview]);

  const cancelImport = useCallback(() => setPreview(null), []);

  const exportEntries = useMemo((): ManifestEntry[] => {
    const runtime = clientRef.current?.readyInfo;
    const out = new Map(manifest.filter((e) => e.keep).map((e) => [e.name, e]));
    if (runtime) {
      for (const p of installed) {
        const n = canonicalName(p.name);
        if (p.source === 'code' || out.has(n) || !pageInstalledRef.current.has(n)) continue;
        const e = entryFromInfo(p, runtime, true);
        if (typeof e !== 'string') out.set(n, e);
      }
    }
    return [...out.values()];
  }, [installed, manifest]);

  const downloadExport = useCallback(
    (kind: 'requirements' | 'lock') => {
      const runtime = clientRef.current?.readyInfo;
      if (!exportEntries.length || !runtime) return;
      const text = kind === 'requirements' ? exportRequirements(exportEntries) : exportLock(exportEntries, runtime);
      triggerBlobDownload(
        new TextEncoder().encode(text),
        kind === 'requirements' ? 'requirements.txt' : 'python-packages.lock.json',
        kind === 'requirements' ? 'text/plain' : 'application/json',
      );
    },
    [exportEntries],
  );

  // Bundled packages that are not loaded yet: top-level ones (nothing bundled depends on them) first.
  const bundledRows = useMemo((): BundledRow[] => {
    if (!bundled) return [];
    const loaded = new Set(installed.map((p) => canonicalName(p.name)));
    const neededBy = new Map<string, string[]>();
    for (const b of bundled.values()) {
      for (const d of b.depends) {
        const n = canonicalName(d);
        const list = neededBy.get(n);
        if (list) list.push(b.name);
        else neededBy.set(n, [b.name]);
      }
    }
    const out: BundledRow[] = [];
    for (const b of bundled.values()) {
      if (loaded.has(b.name)) continue;
      const imports = b.imports.some((i) => canonicalName(i) === b.name) ? [] : b.imports;
      out.push({ name: b.name, version: b.version, imports, neededBy: (neededBy.get(b.name) ?? []).sort() });
    }
    return out.sort((a, b) => Number(a.neededBy.length > 0) - Number(b.neededBy.length > 0) || a.name.localeCompare(b.name));
  }, [bundled, installed]);

  /** Loads one bundled package now, between runs (same origin, so no W6 in any network mode). */
  const loadBundled = useCallback(
    async (name: string) => {
      if (disabledReason || !bundled?.has(name)) return;
      setNotice(null);
      await doInstall([{ kind: 'bundled', name }], [name]);
    },
    [bundled, disabledReason, doInstall],
  );

  const rows = useMemo((): PackageRow[] => {
    const byName = new Map<string, PackageRow>();
    const entries = new Map(manifest.map((e) => [e.name, e]));
    const savedCopy = (e: ManifestEntry | undefined, sha?: string) =>
      !!e && e.keep && e.source === 'pypi' && !!e.sha256 && saved.has(e.sha256) && (sha === undefined || sha === e.sha256);
    for (const p of installed) {
      const name = canonicalName(p.name);
      const e = entries.get(name);
      const kept = !!e?.keep;
      byName.set(name, {
        name,
        version: p.version,
        source: p.source === 'pypi' && savedCopy(e, p.sha256) ? 'pypi-saved' : p.source,
        installed: true,
        kept,
        keptAsDependency: kept && !e?.requested,
        info: p,
      });
    }
    for (const e of manifest) {
      if (!e.keep || byName.has(e.name)) continue;
      const skip = skips.get(e.name);
      byName.set(e.name, {
        name: e.name,
        version: e.version,
        source: savedCopy(e) ? 'pypi-saved' : e.source,
        installed: false,
        kept: true,
        keptAsDependency: !e.requested,
        ...(skip ? { skip } : {}),
      });
    }
    return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [installed, manifest, saved, skips]);

  /** After a run: names a ModuleNotFoundError or the run's missingPackages point at (never installs). */
  const reportRun = useCallback((res: RunResult | null) => {
    if (!res) {
      setMissing([]);
      return;
    }
    const names = new Set<string>();
    for (const n of res.missingPackages ?? []) names.add(n);
    const m = res.error?.type === 'ModuleNotFoundError' ? IMPORT_NAME_RE.exec(res.error.message) : null;
    if (m) names.add(m[1]);
    setMissing([...names].slice(0, 4));
  }, []);

  /** The install name for an import name (bundled `imports`, else as written). */
  const installNameFor = useCallback(
    (importName: string): string => {
      for (const b of bundled?.values() ?? []) if (b.imports.includes(importName)) return b.name;
      return importName;
    },
    [bundled],
  );

  return {
    attach,
    mode,
    rows,
    bundled,
    bundledRows,
    loadBundled,
    busy: busy ?? (workerInstalling ? msg('python.pkgBusyInstall') : null),
    notice,
    dismissNotice: () => setNotice(null),
    restoreNotice,
    dismissRestoreNotice: () => setRestoreNotice(null),
    restoreProblems,
    disabledReason,
    draft,
    setDraft,
    installDraft,
    w6,
    confirmW6,
    cancelW6,
    uploadWheels,
    setKeep,
    confirmRemove,
    setConfirmRemove,
    removeRow,
    reinstallStale,
    preview,
    previewImport,
    confirmImport,
    cancelImport,
    canExport: exportEntries.length > 0,
    downloadExport,
    missing,
    reportRun,
    installNameFor,
  };
}

export type PackagesController = ReturnType<typeof usePackages>;
