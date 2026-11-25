// Workspace state & Option 3B Storage Worker lifecycle hook for /python/main.
// Manages:
// - Web Locks single-tab ownership (acquireWorkspaceLock + BroadcastChannel release notice)
// - PythonStorageClient boot, initial main.py seeding, and clean shutdown on Clear all data
// - Multi-tab editor state (max 15 tabs with LRU clean eviction) persisted across reloads
// - Debounced 400 ms autosave + synchronous flushDirtyTabs() before Run
// - File CRUD, File/Blob streaming upload, safe ZIP import/export, built-in examples, W5 notice
// - Worker fs.changed sync (reloads clean open tabs, flags newly created files)

import { useCallback, useEffect, useRef, useState } from 'react';

import { getPythonExample } from '../../lib/python/examples';
import { isDangerousUploadExt, normalizeWorkspacePath } from '../../lib/python/paths';
import type { FsChangeInfo } from '../../lib/python/protocol';
import {
  PythonStorageClient,
  StorageWorkerError,
} from '../../lib/python/storageClient';
import type {
  BulkWriteInput,
  StorageEstimateInfo,
  WorkspaceEntryMeta,
  WorkspaceStats,
} from '../../lib/python/storageClient';
import {
  acquireWorkspaceLock,
  onWorkspaceLockReleased,
} from '../../lib/python/workspaceLock';
import type { WorkspaceLockHandle } from '../../lib/python/workspaceLock';
import { exportWorkspaceZip, importZipBytes } from '../../lib/python/zip';
import { useI18n } from '../../lib/ui/i18n';
import {
  isBinaryFile,
  MAX_OPEN_TABS,
  triggerBlobDownload,
} from './fileHelpers';
import { DEFAULT_PYTHON_CODE } from './PythonEditor';
import type { EditorTabItem, PythonEditorHandle } from './PythonEditor';

const OPEN_TABS_STORAGE_KEY = 'python:open-tabs-v1';
const AUTOSAVE_DEBOUNCE_MS = 400;

export type WorkspaceLockStatus = 'checking' | 'acquired' | 'blocked';

interface SavedTabsState {
  readonly tabs: readonly string[];
  readonly active: string | null;
}

function readSavedTabs(): SavedTabsState | null {
  try {
    const raw = window.localStorage.getItem(OPEN_TABS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { tabs?: unknown; active?: unknown };
    if (!Array.isArray(parsed.tabs)) return null;
    const tabs = parsed.tabs.filter((x): x is string => typeof x === 'string' && x.length > 0);
    const active = typeof parsed.active === 'string' ? parsed.active : null;
    return { tabs, active };
  } catch {
    return null;
  }
}

function writeSavedTabs(tabs: readonly EditorTabItem[], active: string | null): void {
  try {
    const payload: SavedTabsState = {
      tabs: tabs.map((t) => t.path),
      active,
    };
    window.localStorage.setItem(OPEN_TABS_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore storage errors in private mode.
  }
}

export interface UseWorkspaceOptions {
  readonly swSettled: boolean;
  readonly canBootStorage: boolean;
  readonly editorRef: React.RefObject<PythonEditorHandle | null>;
}

export function useWorkspace({ swSettled, canBootStorage, editorRef }: UseWorkspaceOptions) {
  const { t } = useI18n();
  const decoderRef = useRef<TextDecoder | null>(null);
  const storageRef = useRef<PythonStorageClient | null>(null);
  const lockHandleRef = useRef<WorkspaceLockHandle | null>(null);

  const [lockStatus, setLockStatus] = useState<WorkspaceLockStatus>('checking');
  const [storageReady, setStorageReady] = useState(false);
  const [entries, setEntries] = useState<readonly WorkspaceEntryMeta[]>([]);
  const [stats, setStats] = useState<WorkspaceStats | null>(null);
  const [storageEstimate, setStorageEstimate] = useState<StorageEstimateInfo | null>(null);
  const [tabs, setTabs] = useState<readonly EditorTabItem[]>([]);
  const [activePath, setActivePath] = useState<string | null>(null);
  const [runCreatedPaths, setRunCreatedPaths] = useState<ReadonlySet<string>>(() => new Set());
  const [w5NoticeVisible, setW5NoticeVisible] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const tabsRef = useRef<readonly EditorTabItem[]>(tabs);
  const activePathRef = useRef<string | null>(activePath);
  const dirtyPathsRef = useRef<Set<string>>(new Set());
  const pendingSaveTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  tabsRef.current = tabs;
  activePathRef.current = activePath;

  const decodeUtf8 = useCallback((bytes: Uint8Array): string => {
    if (!decoderRef.current) decoderRef.current = new TextDecoder('utf-8');
    return decoderRef.current.decode(bytes);
  }, []);

  const formatStorageError = useCallback(
    (err: unknown): string => {
      if (err instanceof StorageWorkerError) {
        if (err.code === 'CAP_EXCEEDED') {
          return t('python.filesCapExceeded', { detail: err.message });
        }
        if (err.code === 'QUOTA_EXCEEDED') {
          return t('python.filesQuotaExceeded', { detail: err.message });
        }
        if (err.code === 'INVALID_PATH') {
          return t('python.filesInvalidPath', { detail: err.message });
        }
        return err.message;
      }
      return err instanceof Error ? err.message : String(err);
    },
    [t],
  );

  // 1. Acquire single-tab Web Lock once SW has settled.
  const attemptLock = useCallback(async () => {
    if (lockHandleRef.current?.acquired) {
      setLockStatus('acquired');
      return true;
    }
    const handle = await acquireWorkspaceLock('default');
    if (handle.acquired) {
      lockHandleRef.current = handle;
      setLockStatus('acquired');
      return true;
    }
    setLockStatus('blocked');
    return false;
  }, []);

  useEffect(() => {
    if (!swSettled) return;
    let cancelled = false;

    void acquireWorkspaceLock('default').then((handle) => {
      if (cancelled) {
        handle.release();
        return;
      }
      if (handle.acquired) {
        lockHandleRef.current = handle;
        setLockStatus('acquired');
      } else {
        setLockStatus('blocked');
      }
    });

    const unsubRelease = onWorkspaceLockReleased('default', () => {
      if (!cancelled && !lockHandleRef.current?.acquired) {
        void attemptLock();
      }
    });

    return () => {
      cancelled = true;
      unsubRelease();
      lockHandleRef.current?.release();
      lockHandleRef.current = null;
    };
  }, [swSettled, attemptLock]);

  const refreshListing = useCallback(async () => {
    const client = storageRef.current;
    if (!client || client.isClosed) return;
    const [nextEntries, nextStats, nextEst] = await Promise.all([
      client.list(),
      client.stats(),
      client.getStorageEstimate(),
    ]);
    setEntries(nextEntries);
    setStats(nextStats);
    setStorageEstimate(nextEst);
  }, []);

  const persistTabsState = useCallback((nextTabs: readonly EditorTabItem[], nextActive: string | null) => {
    if (storageRef.current && !storageRef.current.isClosed) {
      writeSavedTabs(nextTabs, nextActive);
    }
  }, []);

  // Open a file from Storage Worker into the multi-tab editor (enforcing 15-tab cap with LRU eviction).
  const openFile = useCallback(
    async (path: string, options: { focus?: boolean } = {}): Promise<boolean> => {
      const client = storageRef.current;
      if (!client || client.isClosed) return false;

      // Clear run-created badge once opened
      setRunCreatedPaths((prev) => {
        if (!prev.has(path)) return prev;
        const next = new Set(prev);
        next.delete(path);
        return next;
      });

      const existingTab = tabsRef.current.find((tab) => tab.path === path);
      if (existingTab) {
        setActivePath(path);
        persistTabsState(tabsRef.current, path);
        if (options.focus) {
          requestAnimationFrame(() => editorRef.current?.focus());
        }
        return true;
      }

      try {
        const data = await client.read(path);
        if (!data || data.isDir) return false;
        const bytes = data.bytes ?? new Uint8Array(0);
        const binary = isBinaryFile(path, data.size, bytes);

        let nextTabs = [...tabsRef.current];
        if (nextTabs.length >= MAX_OPEN_TABS) {
          const evictIdx = nextTabs.findIndex(
            (tab) => !tab.dirty && tab.path !== activePathRef.current,
          );
          if (evictIdx < 0) {
            setErrorMessage(t('python.editorTabLimitNotice'));
            return false;
          }
          const [evicted] = nextTabs.splice(evictIdx, 1);
          editorRef.current?.disposeModel(evicted.path);
        }

        if (!binary) {
          editorRef.current?.openTextFile(path, decodeUtf8(bytes));
        }

        nextTabs = [
          ...nextTabs,
          { path, dirty: false, isBinary: binary, size: data.size },
        ];
        tabsRef.current = nextTabs;
        setTabs(nextTabs);
        setActivePath(path);
        persistTabsState(nextTabs, path);

        if (options.focus && !binary) {
          requestAnimationFrame(() => editorRef.current?.focus());
        }
        return true;
      } catch (err) {
        setErrorMessage(formatStorageError(err));
        return false;
      }
    },
    [decodeUtf8, editorRef, formatStorageError, persistTabsState, t],
  );

  // 2. Boot Option 3B Storage Worker strictly AFTER W1/W4 approvals AND Web Lock acquired.
  useEffect(() => {
    if (!canBootStorage || lockStatus !== 'acquired') {
      setStorageReady(false);
      return;
    }

    let cancelled = false;
    const client = new PythonStorageClient('default');
    storageRef.current = client;

    const unsub = client.subscribe({
      capExceeded: (msg) => setErrorMessage(t('python.filesCapExceeded', { detail: msg })),
      quotaExceeded: (msg) => setErrorMessage(t('python.filesQuotaExceeded', { detail: msg })),
      error: (msg) => setErrorMessage(msg),
    });

    void (async () => {
      try {
        await client.open();
        if (cancelled) return;

        let list = await client.list();
        if (cancelled) return;

        if (list.length === 0) {
          await client.write('main.py', DEFAULT_PYTHON_CODE);
          if (cancelled) return;
          list = await client.list();
        }

        const [wsStats, est] = await Promise.all([
          client.stats(),
          client.getStorageEstimate(),
        ]);
        if (cancelled) return;

        setEntries(list);
        setStats(wsStats);
        setStorageEstimate(est);

        // Restore previously open tabs (validating each exists in IndexedDB), defaulting to main.py
        const entryMap = new Map(list.map((e) => [e.path, e]));
        const saved = readSavedTabs();
        const candidatePaths: string[] = [];
        if (saved) {
          for (const p of saved.tabs) {
            const meta = entryMap.get(p);
            if (meta && !meta.isDir && !candidatePaths.includes(p)) {
              candidatePaths.push(p);
            }
          }
        }
        if (candidatePaths.length === 0) {
          if (entryMap.has('main.py') && !entryMap.get('main.py')!.isDir) {
            candidatePaths.push('main.py');
          } else {
            const firstFile = list.find((e) => !e.isDir);
            if (firstFile) candidatePaths.push(firstFile.path);
          }
        }

        const restoredTabs: EditorTabItem[] = [];
        for (const p of candidatePaths.slice(0, MAX_OPEN_TABS)) {
          const data = await client.read(p);
          if (cancelled) return;
          if (!data || data.isDir) continue;
          const bytes = data.bytes ?? new Uint8Array(0);
          const binary = isBinaryFile(p, data.size, bytes);
          if (!binary) {
            editorRef.current?.openTextFile(p, decodeUtf8(bytes));
          }
          restoredTabs.push({ path: p, dirty: false, isBinary: binary, size: data.size });
        }

        const preferredActive =
          saved?.active && restoredTabs.some((tab) => tab.path === saved.active)
            ? saved.active
            : restoredTabs[0]?.path ?? null;

        tabsRef.current = restoredTabs;
        setTabs(restoredTabs);
        setActivePath(preferredActive);
        writeSavedTabs(restoredTabs, preferredActive);
        setStorageReady(true);
      } catch (err) {
        if (!cancelled) {
          setErrorMessage(formatStorageError(err));
        }
      }
    })();

    return () => {
      cancelled = true;
      unsub();
      for (const timer of pendingSaveTimersRef.current.values()) {
        clearTimeout(timer);
      }
      pendingSaveTimersRef.current.clear();
      dirtyPathsRef.current.clear();
      setStorageReady(false);
      storageRef.current = null;
      void client.close();
    };
  }, [canBootStorage, lockStatus, decodeUtf8, editorRef, formatStorageError, t]);

  // Write a single path immediately to Storage Worker (auto-mirrors to Python worker MEMFS).
  const saveFileNow = useCallback(
    async (path: string, content: string): Promise<boolean> => {
      const client = storageRef.current;
      if (!client || client.isClosed || lockStatus !== 'acquired') return false;
      try {
        const res = await client.write(path, content);
        dirtyPathsRef.current.delete(path);
        setTabs((prev) =>
          prev.map((tab) =>
            tab.path === path ? { ...tab, dirty: false, size: res.entry.size } : tab,
          ),
        );
        setStats(res.stats);
        setEntries((prev) => {
          const idx = prev.findIndex((e) => e.path === path);
          if (idx < 0) return [...prev, res.entry];
          const copy = [...prev];
          copy[idx] = res.entry;
          return copy;
        });
        return true;
      } catch (err) {
        setErrorMessage(formatStorageError(err));
        return false;
      }
    },
    [formatStorageError, lockStatus],
  );

  // Called by Monaco onDidChangeContent -> marks dirty + debounced 400 ms autosave.
  const handleEditorContentChange = useCallback(
    (path: string, content: string) => {
      if (lockStatus !== 'acquired') return;
      dirtyPathsRef.current.add(path);
      setRunCreatedPaths((prev) => {
        if (!prev.has(path)) return prev;
        const next = new Set(prev);
        next.delete(path);
        return next;
      });
      setTabs((prev) =>
        prev.map((tab) => (tab.path === path && !tab.dirty ? { ...tab, dirty: true } : tab)),
      );

      const prevTimer = pendingSaveTimersRef.current.get(path);
      if (prevTimer) clearTimeout(prevTimer);

      const timer = setTimeout(() => {
        pendingSaveTimersRef.current.delete(path);
        const latest = editorRef.current?.getFileValue(path) ?? content;
        void saveFileNow(path, latest);
      }, AUTOSAVE_DEBOUNCE_MS);
      pendingSaveTimersRef.current.set(path, timer);
    },
    [editorRef, lockStatus, saveFileNow],
  );

  // Immediately flush every dirty tab to IndexedDB + mirrored worker MEMFS before Run.
  const flushDirtyTabs = useCallback(async (): Promise<void> => {
    for (const timer of pendingSaveTimersRef.current.values()) {
      clearTimeout(timer);
    }
    pendingSaveTimersRef.current.clear();

    const dirtyList = [...dirtyPathsRef.current];
    for (const path of dirtyList) {
      const content = editorRef.current?.getFileValue(path);
      if (content !== null && content !== undefined) {
        await saveFileNow(path, content);
      } else {
        dirtyPathsRef.current.delete(path);
      }
    }
  }, [editorRef, saveFileNow]);

  const selectTab = useCallback(
    (path: string) => {
      setActivePath(path);
      persistTabsState(tabsRef.current, path);
    },
    [persistTabsState],
  );

  const closeTab = useCallback(
    (path: string) => {
      // Flush pending save before closing if dirty
      const pendingTimer = pendingSaveTimersRef.current.get(path);
      if (pendingTimer) {
        clearTimeout(pendingTimer);
        pendingSaveTimersRef.current.delete(path);
      }
      if (dirtyPathsRef.current.has(path)) {
        const val = editorRef.current?.getFileValue(path);
        if (val !== null && val !== undefined) {
          void saveFileNow(path, val);
        }
      }

      editorRef.current?.disposeModel(path);
      const nextTabs = tabsRef.current.filter((tab) => tab.path !== path);
      let nextActive = activePathRef.current;
      if (nextActive === path) {
        nextActive = nextTabs[nextTabs.length - 1]?.path ?? null;
      }
      tabsRef.current = nextTabs;
      setTabs(nextTabs);
      setActivePath(nextActive);
      persistTabsState(nextTabs, nextActive);
    },
    [editorRef, persistTabsState, saveFileNow],
  );

  const createFile = useCallback(
    async (rawPath: string): Promise<boolean> => {
      const client = storageRef.current;
      if (!client || client.isClosed || lockStatus !== 'acquired') return false;
      const check = normalizeWorkspacePath(rawPath);
      if (!check.ok) {
        setErrorMessage(t('python.filesInvalidPath', { detail: 'reason' in check ? check.reason : 'invalid' }));
        return false;
      }
      try {
        await client.write(check.path, '');
        await refreshListing();
        await openFile(check.path, { focus: true });
        return true;
      } catch (err) {
        setErrorMessage(formatStorageError(err));
        return false;
      }
    },
    [formatStorageError, lockStatus, openFile, refreshListing, t],
  );

  const createFolder = useCallback(
    async (rawPath: string): Promise<boolean> => {
      const client = storageRef.current;
      if (!client || client.isClosed || lockStatus !== 'acquired') return false;
      const check = normalizeWorkspacePath(rawPath, { allowTrailingSlash: true });
      if (!check.ok) {
        setErrorMessage(t('python.filesInvalidPath', { detail: 'reason' in check ? check.reason : 'invalid' }));
        return false;
      }
      try {
        await client.mkdir(check.path);
        await refreshListing();
        return true;
      } catch (err) {
        setErrorMessage(formatStorageError(err));
        return false;
      }
    },
    [formatStorageError, lockStatus, refreshListing, t],
  );

  const renameOrMove = useCallback(
    async (from: string, to: string, isMove: boolean): Promise<boolean> => {
      const client = storageRef.current;
      if (!client || client.isClosed || lockStatus !== 'acquired') return false;
      await flushDirtyTabs();
      try {
        if (isMove) {
          await client.move(from, to);
        } else {
          await client.rename(from, to);
        }

        // Update any affected open tabs + Monaco models
        const prefix = `${from}/`;
        let nextActive = activePathRef.current;
        const nextTabs = tabsRef.current.map((tab) => {
          if (tab.path === from || tab.path.startsWith(prefix)) {
            const mapped = tab.path === from ? to : `${to}${tab.path.slice(from.length)}`;
            if (!tab.isBinary) {
              editorRef.current?.renameModel(tab.path, mapped);
            }
            if (nextActive === tab.path) nextActive = mapped;
            return { ...tab, path: mapped };
          }
          return tab;
        });

        tabsRef.current = nextTabs;
        setTabs(nextTabs);
        setActivePath(nextActive);
        persistTabsState(nextTabs, nextActive);
        await refreshListing();
        return true;
      } catch (err) {
        setErrorMessage(formatStorageError(err));
        return false;
      }
    },
    [editorRef, flushDirtyTabs, formatStorageError, lockStatus, persistTabsState, refreshListing],
  );

  const deletePath = useCallback(
    async (path: string): Promise<boolean> => {
      const client = storageRef.current;
      if (!client || client.isClosed || lockStatus !== 'acquired') return false;
      try {
        await client.delete(path);
        const prefix = `${path}/`;
        const remaining: EditorTabItem[] = [];
        for (const tab of tabsRef.current) {
          if (tab.path === path || tab.path.startsWith(prefix)) {
            const timer = pendingSaveTimersRef.current.get(tab.path);
            if (timer) {
              clearTimeout(timer);
              pendingSaveTimersRef.current.delete(tab.path);
            }
            dirtyPathsRef.current.delete(tab.path);
            editorRef.current?.disposeModel(tab.path);
          } else {
            remaining.push(tab);
          }
        }
        let nextActive = activePathRef.current;
        if (nextActive && (nextActive === path || nextActive.startsWith(prefix))) {
          nextActive = remaining[remaining.length - 1]?.path ?? null;
        }
        tabsRef.current = remaining;
        setTabs(remaining);
        setActivePath(nextActive);
        persistTabsState(remaining, nextActive);
        await refreshListing();
        return true;
      } catch (err) {
        setErrorMessage(formatStorageError(err));
        return false;
      }
    },
    [editorRef, formatStorageError, lockStatus, persistTabsState, refreshListing],
  );

  const downloadFile = useCallback(
    async (path: string) => {
      const client = storageRef.current;
      if (!client || client.isClosed) return;
      try {
        const data = await client.read(path);
        if (!data || data.isDir) return;
        triggerBlobDownload(data.bytes ?? new Uint8Array(0), path);
      } catch (err) {
        setErrorMessage(formatStorageError(err));
      }
    },
    [formatStorageError],
  );

  const uploadFiles = useCallback(
    async (items: readonly { path: string; file: File }[], dirs: readonly string[] = []) => {
      const client = storageRef.current;
      if (!client || client.isClosed || lockStatus !== 'acquired') return;

      let triggeredW5 = false;
      let firstUploadedPath: string | null = null;
      setErrorMessage(null);

      try {
        for (const dir of dirs) {
          const check = normalizeWorkspacePath(dir, { allowTrailingSlash: true });
          if (check.ok) {
            await client.mkdir(check.path);
          }
        }

        for (const item of items) {
          const check = normalizeWorkspacePath(item.path);
          if (!check.ok) {
            setErrorMessage(
              t('python.filesInvalidPath', {
                detail: 'reason' in check ? check.reason : item.path,
              }),
            );
            continue;
          }
          if (isDangerousUploadExt(check.path)) {
            triggeredW5 = true;
          }
          // Pass File handle directly to Storage Worker (zero main-thread freeze for 50 MB uploads).
          await client.write(check.path, item.file);
          if (!firstUploadedPath) firstUploadedPath = check.path;

          // If this file is already open in a clean tab, refresh its contents.
          const openTab = tabsRef.current.find((tab) => tab.path === check.path);
          if (openTab && !openTab.dirty && !isBinaryFile(check.path, item.file.size)) {
            const text = await client.readText(check.path);
            if (text !== null) editorRef.current?.setFileContent(check.path, text);
          }
        }

        if (triggeredW5) setW5NoticeVisible(true);
        await refreshListing();
        if (firstUploadedPath && !tabsRef.current.some((tab) => tab.path === firstUploadedPath)) {
          await openFile(firstUploadedPath);
        }
      } catch (err) {
        setErrorMessage(formatStorageError(err));
      }
    },
    [editorRef, formatStorageError, lockStatus, openFile, refreshListing, t],
  );

  const importZip = useCallback(
    async (file: File) => {
      const client = storageRef.current;
      if (!client || client.isClosed || lockStatus !== 'acquired') return;
      setErrorMessage(null);
      try {
        const buf = await file.arrayBuffer();
        const result = await importZipBytes(new Uint8Array(buf));
        if (!result.ok) {
          setErrorMessage(
            t('python.filesInvalidZip', { detail: result.error ?? 'Invalid ZIP archive' }),
          );
          return;
        }

        const bulk: BulkWriteInput[] = result.files.map((entry) => ({
          path: entry.path,
          isDir: entry.isDir,
          bytes: entry.isDir ? null : entry.bytes,
        }));

        await client.bulkWrite(bulk, { replaceWorkspace: false });
        // Always show W5 for .zip imports (security.md §7 W5 covers .zip and extracted .py/.whl/.html).
        setW5NoticeVisible(true);

        // Reload any open clean text tabs that were overwritten by the ZIP.
        for (const imported of result.files) {
          if (imported.isDir) continue;
          const openTab = tabsRef.current.find((tab) => tab.path === imported.path);
          if (openTab && !openTab.dirty && !isBinaryFile(imported.path, imported.bytes.byteLength, imported.bytes)) {
            const text = await client.readText(imported.path);
            if (text !== null) editorRef.current?.setFileContent(imported.path, text);
          }
        }

        await refreshListing();
        const firstImportedFile = result.files.find((f) => !f.isDir);
        if (firstImportedFile) {
          await openFile(firstImportedFile.path);
        }
      } catch (err) {
        setErrorMessage(formatStorageError(err));
      }
    },
    [editorRef, formatStorageError, lockStatus, openFile, refreshListing, t],
  );

  const exportZip = useCallback(async () => {
    const client = storageRef.current;
    if (!client || client.isClosed) return;
    await flushDirtyTabs();
    try {
      const list = await client.list();
      const files = list.filter((e) => !e.isDir);
      if (files.length === 0) {
        setErrorMessage(t('python.filesZipEmpty'));
        return;
      }
      const exportEntries: { path: string; bytes: Uint8Array }[] = [];
      for (const meta of files) {
        const data = await client.read(meta.path);
        if (data && !data.isDir) {
          exportEntries.push({ path: meta.path, bytes: data.bytes ?? new Uint8Array(0) });
        }
      }
      const zipped = exportWorkspaceZip(exportEntries);
      triggerBlobDownload(zipped, 'python-workspace.zip', 'application/zip');
    } catch (err) {
      setErrorMessage(formatStorageError(err));
    }
  }, [flushDirtyTabs, formatStorageError, t]);

  const loadExample = useCallback(
    async (exampleId: string) => {
      const client = storageRef.current;
      if (!client || client.isClosed || lockStatus !== 'acquired') return;
      const ex = getPythonExample(exampleId);
      if (!ex) return;

      setErrorMessage(null);
      await flushDirtyTabs();

      try {
        const bulk: BulkWriteInput[] = Object.entries(ex.files).map(([path, content]) => ({
          path,
          bytes: content,
          isDir: false,
        }));
        await client.bulkWrite(bulk, { replaceWorkspace: false });

        // Update any already-open tabs whose files belong to this example
        for (const [path, content] of Object.entries(ex.files)) {
          dirtyPathsRef.current.delete(path);
          editorRef.current?.setFileContent(path, content);
        }
        setTabs((prev) =>
          prev.map((tab) =>
            tab.path in ex.files ? { ...tab, dirty: false, isBinary: false } : tab,
          ),
        );

        await refreshListing();
        for (const path of Object.keys(ex.files)) {
          if (path !== ex.entryFile) {
            await openFile(path);
          }
        }
        await openFile(ex.entryFile, { focus: true });
      } catch (err) {
        setErrorMessage(formatStorageError(err));
      }
    },
    [editorRef, flushDirtyTabs, formatStorageError, lockStatus, openFile, refreshListing],
  );

  // Sync UI state when Python script modifies /workspace (fs.changed from python-worker.js).
  const handleWorkerFsChanged = useCallback(
    async (change: FsChangeInfo) => {
      const client = storageRef.current;
      if (!client || client.isClosed) return;

      if (change.created.length > 0) {
        setRunCreatedPaths((prev) => {
          const next = new Set(prev);
          for (const p of change.created) next.add(p);
          return next;
        });
      }

      const deletedSet = new Set(change.deleted);
      if (deletedSet.size > 0) {
        let changedTabs = false;
        const remaining: EditorTabItem[] = [];
        for (const tab of tabsRef.current) {
          if (deletedSet.has(tab.path) && !tab.dirty) {
            editorRef.current?.disposeModel(tab.path);
            changedTabs = true;
          } else {
            remaining.push(tab);
          }
        }
        if (changedTabs) {
          let nextActive = activePathRef.current;
          if (nextActive && !remaining.some((tab) => tab.path === nextActive)) {
            nextActive = remaining[remaining.length - 1]?.path ?? null;
          }
          tabsRef.current = remaining;
          setTabs(remaining);
          setActivePath(nextActive);
          persistTabsState(remaining, nextActive);
        }
      }

      const updatedPaths = new Set([...change.created, ...change.modified]);
      for (const tab of tabsRef.current) {
        if (!updatedPaths.has(tab.path) || tab.dirty) continue;
        try {
          const data = await client.read(tab.path);
          if (!data || data.isDir) continue;
          const bytes = data.bytes ?? new Uint8Array(0);
          const binary = isBinaryFile(tab.path, data.size, bytes);
          if (!binary) {
            editorRef.current?.setFileContent(tab.path, decodeUtf8(bytes));
          }
          setTabs((prev) =>
            prev.map((item) =>
              item.path === tab.path ? { ...item, isBinary: binary, size: data.size } : item,
            ),
          );
        } catch {
          // Ignore transient read error.
        }
      }

      await refreshListing();
    },
    [decodeUtf8, editorRef, persistTabsState, refreshListing],
  );

  const clearRunCreatedBadges = useCallback(() => {
    setRunCreatedPaths(new Set());
  }, []);

  const shutdownForClear = useCallback(async () => {
    for (const timer of pendingSaveTimersRef.current.values()) {
      clearTimeout(timer);
    }
    pendingSaveTimersRef.current.clear();
    dirtyPathsRef.current.clear();
    const client = storageRef.current;
    storageRef.current = null;
    if (client) {
      await client.close();
    }
    lockHandleRef.current?.release();
    lockHandleRef.current = null;
  }, []);

  return {
    storageRef,
    lockStatus,
    storageReady,
    entries,
    stats,
    storageEstimate,
    tabs,
    activePath,
    runCreatedPaths,
    w5NoticeVisible,
    errorMessage,
    attemptLock,
    dismissError: () => setErrorMessage(null),
    dismissW5: () => setW5NoticeVisible(false),
    openFile,
    selectTab,
    closeTab,
    handleEditorContentChange,
    flushDirtyTabs,
    createFile,
    createFolder,
    renamePath: (from: string, to: string) => renameOrMove(from, to, false),
    movePath: (from: string, to: string) => renameOrMove(from, to, true),
    deletePath,
    downloadFile,
    uploadFiles,
    importZip,
    exportZip,
    loadExample,
    handleWorkerFsChanged,
    clearRunCreatedBadges,
    shutdownForClear,
  };
}
