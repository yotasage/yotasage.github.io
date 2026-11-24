import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  FileSystemFileHandleLike,
  PickerWindow,
  triggerDownload,
} from '../../lib/notepad/fileActions';
import {
  createStarterWorkspace,
  exportWorkspaceJson,
  loadWorkspace,
  loadWorkspaceSync,
  parseWorkspaceJson,
  saveWorkspace,
  saveWorkspaceSync,
  SYNC_CHANNEL_NAME,
} from '../../lib/notepad/storage';
import {
  composeWorkspaceState,
  extractWindowViewState,
  loadWindowViewState,
  mergeRemotePatch,
  reconcileWindowViewState,
  saveWindowViewState,
  SharedWorkspaceData,
  SyncMessage,
  WindowViewState,
} from '../../lib/notepad/syncMerge';
import { EditorSettings, NotepadDoc, NotepadWorkspaceState } from '../../lib/notepad/types';

export interface UseWorkspaceSyncOptions {
  t: (key: string, params?: Record<string, string | number>) => string;
  onResetRawBytes: () => void;
}

export function useWorkspaceSync({ t, onResetRawBytes }: UseWorkspaceSyncOptions) {
  const initialRef = useRef<NotepadWorkspaceState | null>(null);
  if (!initialRef.current) {
    initialRef.current = createStarterWorkspace();
  }

  const [shared, setShared] = useState<SharedWorkspaceData>(() => ({
    docs: initialRef.current!.docs,
    settings: initialRef.current!.settings,
    savedAt: initialRef.current!.savedAt,
  }));
  const [viewState, setViewStateRaw] = useState<WindowViewState>(() =>
    extractWindowViewState(initialRef.current!),
  );
  const [hydrated, setHydrated] = useState(false);
  const [storageEngine, setStorageEngine] = useState<'indexeddb' | 'localstorage' | 'memory'>('indexeddb');
  const [saveState, setSaveState] = useState<'saved' | 'saving'>('saved');
  const [localSaveVersion, setLocalSaveVersion] = useState(0);

  const [syncOpen, setSyncOpen] = useState(false);
  const [linkedHandle, setLinkedHandle] = useState<FileSystemFileHandleLike | null>(null);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  const sharedRef = useRef(shared);
  sharedRef.current = shared;
  const viewStateRef = useRef(viewState);
  viewStateRef.current = viewState;
  const localSaveVersionRef = useRef(0);
  const aliveRef = useRef(true);

  const dirtyDocUpdatedAtRef = useRef<Map<string, number>>(new Map());
  const deletedDocIdsRef = useRef<Set<string>>(new Set());
  const settingsDirtyRef = useRef(false);
  const resetPendingRef = useRef(false);
  const saveTimerRef = useRef<number | null>(null);

  const tabInstanceIdRef = useRef(`tab-${Math.random().toString(36).slice(2, 10)}`);
  const channelRef = useRef<BroadcastChannel | null>(null);

  const workspace = useMemo(() => composeWorkspaceState(shared, viewState), [shared, viewState]);

  const setViewState = useCallback(
    (updater: WindowViewState | ((prev: WindowViewState) => WindowViewState)) => {
      const prev = viewStateRef.current;
      const rawNext = typeof updater === 'function' ? updater(prev) : updater;
      if (rawNext === prev) return;
      const reconciled = reconcileWindowViewState(rawNext, sharedRef.current.docs);
      viewStateRef.current = reconciled;
      saveWindowViewState(reconciled);
      setViewStateRaw(reconciled);
    },
    [],
  );

  const updateDocs = useCallback((updater: (docs: NotepadDoc[]) => NotepadDoc[]) => {
    const prev = sharedRef.current;
    const nextDocs = updater(prev.docs);
    if (nextDocs === prev.docs) return;

    const prevMap = new Map(prev.docs.map((d) => [d.id, d]));
    const nextIds = new Set(nextDocs.map((d) => d.id));
    let hasDelete = false;

    for (const doc of nextDocs) {
      const old = prevMap.get(doc.id);
      if (!old || old !== doc) {
        dirtyDocUpdatedAtRef.current.set(doc.id, doc.updatedAt);
        deletedDocIdsRef.current.delete(doc.id);
      }
    }
    for (const old of prev.docs) {
      if (!nextIds.has(old.id)) {
        deletedDocIdsRef.current.add(old.id);
        dirtyDocUpdatedAtRef.current.delete(old.id);
        hasDelete = true;
      }
    }

    const nextShared: SharedWorkspaceData = { ...prev, docs: nextDocs };
    sharedRef.current = nextShared;
    setShared(nextShared);

    if (hasDelete) {
      const reconciled = reconcileWindowViewState(viewStateRef.current, nextDocs);
      if (reconciled !== viewStateRef.current) {
        viewStateRef.current = reconciled;
        saveWindowViewState(reconciled);
        setViewStateRaw(reconciled);
      }
    }

    localSaveVersionRef.current += 1;
    setLocalSaveVersion(localSaveVersionRef.current);
  }, []);

  const updateSettings = useCallback((updater: (settings: EditorSettings) => EditorSettings) => {
    const prev = sharedRef.current;
    const nextSettings = updater(prev.settings);
    if (nextSettings === prev.settings) return;

    settingsDirtyRef.current = true;
    const nextShared: SharedWorkspaceData = { ...prev, settings: nextSettings };
    sharedRef.current = nextShared;
    setShared(nextShared);

    localSaveVersionRef.current += 1;
    setLocalSaveVersion(localSaveVersionRef.current);
  }, []);

  const replaceSharedWorkspace = useCallback((nextWorkspace: NotepadWorkspaceState) => {
    const nextShared: SharedWorkspaceData = {
      docs: nextWorkspace.docs,
      settings: nextWorkspace.settings,
      savedAt: nextWorkspace.savedAt,
    };
    const nextView = extractWindowViewState(nextWorkspace);

    dirtyDocUpdatedAtRef.current.clear();
    deletedDocIdsRef.current.clear();
    settingsDirtyRef.current = false;
    resetPendingRef.current = true;

    sharedRef.current = nextShared;
    viewStateRef.current = nextView;
    saveWindowViewState(nextView);
    setShared(nextShared);
    setViewStateRaw(nextView);

    localSaveVersionRef.current += 1;
    setLocalSaveVersion(localSaveVersionRef.current);
  }, []);

  const persistAndBroadcast = useCallback((forceWrite = false) => {
    const capturedVersion = localSaveVersionRef.current;
    const isReset = resetPendingRef.current;
    const capturedDirty = new Map(dirtyDocUpdatedAtRef.current);
    const capturedDeleted = Array.from(deletedDocIdsRef.current);
    const capturedSettingsDirty = settingsDirtyRef.current;

    const hasPending =
      isReset || capturedDirty.size > 0 || capturedDeleted.length > 0 || capturedSettingsDirty;
    if (!hasPending && !forceWrite) {
      setSaveState('saved');
      return;
    }

    const now = Date.now();
    const currentShared = sharedRef.current;
    const currentView = viewStateRef.current;
    const snapshot = composeWorkspaceState({ ...currentShared, savedAt: now }, currentView);

    let msg: SyncMessage | null = null;
    if (isReset) {
      msg = {
        sender: tabInstanceIdRef.current,
        kind: 'workspace-reset',
        sentAt: now,
        docs: currentShared.docs,
        settings: currentShared.settings,
      };
    } else if (capturedDirty.size > 0 || capturedDeleted.length > 0 || capturedSettingsDirty) {
      const updatedDocs = currentShared.docs.filter((d) => capturedDirty.has(d.id));
      msg = {
        sender: tabInstanceIdRef.current,
        kind: 'docs-patch',
        sentAt: now,
        updatedDocs,
        deletedIds: capturedDeleted,
        docOrder: currentShared.docs.map((d) => d.id),
        ...(capturedSettingsDirty ? { settings: currentShared.settings } : {}),
      };
    }

    saveWorkspace(snapshot)
      .then((engine) => {
        if (!aliveRef.current) return;

        for (const [id, snapUpdatedAt] of capturedDirty.entries()) {
          if (dirtyDocUpdatedAtRef.current.get(id) === snapUpdatedAt) {
            dirtyDocUpdatedAtRef.current.delete(id);
          }
        }
        for (const id of capturedDeleted) {
          deletedDocIdsRef.current.delete(id);
        }
        if (capturedSettingsDirty && sharedRef.current.settings === currentShared.settings) {
          settingsDirtyRef.current = false;
        }
        if (isReset && localSaveVersionRef.current === capturedVersion) {
          resetPendingRef.current = false;
        }

        const updatedShared: SharedWorkspaceData = { ...sharedRef.current, savedAt: now };
        sharedRef.current = updatedShared;
        setShared(updatedShared);
        setStorageEngine(engine);

        if (localSaveVersionRef.current === capturedVersion) {
          setSaveState('saved');
        }
        if (msg) {
          channelRef.current?.postMessage(msg);
        }
      })
      .catch(() => {
        if (aliveRef.current && localSaveVersionRef.current === capturedVersion) {
          setSaveState('saved');
        }
      });
  }, []);

  useEffect(() => {
    aliveRef.current = true;
    const quick = loadWorkspaceSync();
    if (quick && localSaveVersionRef.current === 0) {
      const quickShared: SharedWorkspaceData = {
        docs: quick.docs,
        settings: quick.settings,
        savedAt: quick.savedAt,
      };
      const quickView = loadWindowViewState(quick.docs, extractWindowViewState(quick));
      sharedRef.current = quickShared;
      viewStateRef.current = quickView;
      setShared(quickShared);
      setViewStateRaw(quickView);
    }

    loadWorkspace()
      .then(({ state, engine }) => {
        if (!aliveRef.current) return;
        if (localSaveVersionRef.current === 0) {
          const loadedShared: SharedWorkspaceData = {
            docs: state.docs,
            settings: state.settings,
            savedAt: state.savedAt,
          };
          const loadedView = loadWindowViewState(state.docs, extractWindowViewState(state));
          sharedRef.current = loadedShared;
          viewStateRef.current = loadedView;
          setShared(loadedShared);
          setViewStateRaw(loadedView);
        }
        setStorageEngine(engine);
        setHydrated(true);
      })
      .catch(() => {
        if (aliveRef.current) setHydrated(true);
      });

    return () => {
      aliveRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return;
    const ch = new BroadcastChannel(SYNC_CHANNEL_NAME);
    channelRef.current = ch;
    ch.onmessage = (event: MessageEvent<SyncMessage>) => {
      const msg = event.data;
      if (!msg || typeof msg !== 'object' || msg.sender === tabInstanceIdRef.current) return;

      if (msg.kind === 'workspace-reset') {
        if (!Array.isArray(msg.docs) || msg.docs.length === 0) return;
        dirtyDocUpdatedAtRef.current.clear();
        deletedDocIdsRef.current.clear();
        settingsDirtyRef.current = false;
        resetPendingRef.current = false;

        const nextShared: SharedWorkspaceData = {
          docs: msg.docs,
          settings: msg.settings,
          savedAt: msg.sentAt,
        };
        sharedRef.current = nextShared;
        setShared(nextShared);

        const reconciled = reconcileWindowViewState(viewStateRef.current, nextShared.docs);
        if (reconciled !== viewStateRef.current) {
          viewStateRef.current = reconciled;
          saveWindowViewState(reconciled);
          setViewStateRaw(reconciled);
        }
        return;
      }

      if (msg.kind === 'docs-patch') {
        const prev = sharedRef.current;
        const dirtyIds = new Set(dirtyDocUpdatedAtRef.current.keys());
        const mergedDocs = mergeRemotePatch(prev.docs, msg, dirtyIds);
        const nextSettings =
          msg.settings && !settingsDirtyRef.current ? msg.settings : prev.settings;
        const nextShared: SharedWorkspaceData = {
          docs: mergedDocs,
          settings: nextSettings,
          savedAt: Math.max(prev.savedAt, msg.sentAt),
        };
        sharedRef.current = nextShared;
        setShared(nextShared);

        const reconciled = reconcileWindowViewState(viewStateRef.current, mergedDocs);
        if (reconciled !== viewStateRef.current) {
          viewStateRef.current = reconciled;
          saveWindowViewState(reconciled);
          setViewStateRaw(reconciled);
        }
      }
    };
    return () => {
      ch.close();
      channelRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!hydrated || localSaveVersion === 0) return;
    setSaveState('saving');
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null;
      persistAndBroadcast(false);
    }, 150);
    return () => {
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
    };
  }, [localSaveVersion, hydrated, persistAndBroadcast]);

  useEffect(() => {
    const flush = () => {
      if (!hydrated) return;
      saveWindowViewState(viewStateRef.current);
      const hasPending =
        resetPendingRef.current ||
        dirtyDocUpdatedAtRef.current.size > 0 ||
        deletedDocIdsRef.current.size > 0 ||
        settingsDirtyRef.current;
      if (hasPending) {
        saveWorkspaceSync(
          composeWorkspaceState({ ...sharedRef.current, savedAt: Date.now() }, viewStateRef.current),
        );
      }
    };
    window.addEventListener('beforeunload', flush);
    window.addEventListener('pagehide', flush);
    return () => {
      window.removeEventListener('beforeunload', flush);
      window.removeEventListener('pagehide', flush);
    };
  }, [hydrated]);

  const flushSaveNow = useCallback(() => {
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    persistAndBroadcast(true);
  }, [persistAndBroadcast]);

  const handleExportWorkspace = useCallback(() => {
    const json = exportWorkspaceJson(composeWorkspaceState(sharedRef.current, viewStateRef.current));
    triggerDownload(new Blob([json], { type: 'application/json' }), 'scratchpad-workspace.json');
    setSyncMessage(t('notepad.sync.exportJson'));
    setSyncError(null);
  }, [t]);

  const handleImportWorkspace = useCallback(
    async (file: File) => {
      const text = await file.text();
      const parsed = parseWorkspaceJson(text);
      if (parsed.error || !parsed.state) {
        setSyncError(t('notepad.sync.importError', { error: parsed.error ?? 'Invalid file' }));
        setSyncMessage(null);
        return;
      }
      onResetRawBytes();
      replaceSharedWorkspace(parsed.state);
      setSyncError(null);
      setSyncMessage(t('notepad.sync.importSuccess', { count: parsed.state.docs.length }));
    },
    [onResetRawBytes, replaceSharedWorkspace, t],
  );

  const supportsFsAccess =
    typeof window !== 'undefined' && typeof (window as PickerWindow).showSaveFilePicker === 'function';

  const handleLinkLocalFile = useCallback(async () => {
    const picker = (window as PickerWindow).showSaveFilePicker;
    if (!picker) return;
    try {
      const handle = await picker({
        suggestedName: 'scratchpad-workspace.json',
        types: [{ description: 'Scratchpad Workspace JSON', accept: { 'application/json': ['.json'] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(
        exportWorkspaceJson(composeWorkspaceState(sharedRef.current, viewStateRef.current)),
      );
      await writable.close();
      setLinkedHandle(handle);
      setSyncError(null);
      setSyncMessage(t('notepad.sync.linkedStatus', { name: handle.name }));
    } catch {
      // User cancelled picker
    }
  }, [t]);

  const handleSaveLinkedFile = useCallback(async () => {
    if (!linkedHandle) return;
    try {
      const writable = await linkedHandle.createWritable();
      await writable.write(
        exportWorkspaceJson(composeWorkspaceState(sharedRef.current, viewStateRef.current)),
      );
      await writable.close();
      setSyncError(null);
      setSyncMessage(t('notepad.sync.linkedStatus', { name: linkedHandle.name }));
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : 'Failed to write linked file.');
    }
  }, [linkedHandle, t]);

  const handleLoadLinkedFile = useCallback(async () => {
    if (!linkedHandle) return;
    try {
      const file = await linkedHandle.getFile();
      await handleImportWorkspace(file);
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : 'Failed to read linked file.');
    }
  }, [linkedHandle, handleImportWorkspace]);

  const handleResetStarter = useCallback(() => {
    onResetRawBytes();
    replaceSharedWorkspace(createStarterWorkspace());
    setSyncMessage(t('notepad.sync.resetStarter'));
    setSyncError(null);
  }, [onResetRawBytes, replaceSharedWorkspace, t]);

  const openSyncDialog = useCallback(() => {
    setSyncMessage(null);
    setSyncError(null);
    setSyncOpen(true);
  }, []);

  return {
    workspace,
    viewState,
    setViewState,
    updateDocs,
    updateSettings,
    replaceSharedWorkspace,
    storageEngine,
    saveState,
    syncOpen,
    setSyncOpen,
    openSyncDialog,
    linkedHandle,
    supportsFsAccess,
    syncMessage,
    syncError,
    flushSaveNow,
    handleExportWorkspace,
    handleImportWorkspace,
    handleLinkLocalFile,
    handleSaveLinkedFile,
    handleLoadLinkedFile,
    handleResetStarter,
  };
}
