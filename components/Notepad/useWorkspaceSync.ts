import { useCallback, useEffect, useRef, useState } from 'react';

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
import { NotepadWorkspaceState } from '../../lib/notepad/types';

export interface UseWorkspaceSyncOptions {
  t: (key: string, params?: Record<string, string | number>) => string;
  onResetRawBytes: () => void;
}

export function useWorkspaceSync({ t, onResetRawBytes }: UseWorkspaceSyncOptions) {
  const [workspace, setWorkspace] = useState<NotepadWorkspaceState>(() => createStarterWorkspace());
  const [hydrated, setHydrated] = useState(false);
  const [storageEngine, setStorageEngine] = useState<'indexeddb' | 'localstorage' | 'memory'>('indexeddb');
  const [saveState, setSaveState] = useState<'saved' | 'saving'>('saved');

  const [syncOpen, setSyncOpen] = useState(false);
  const [linkedHandle, setLinkedHandle] = useState<FileSystemFileHandleLike | null>(null);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  const workspaceRef = useRef(workspace);
  workspaceRef.current = workspace;
  const tabInstanceIdRef = useRef(`tab-${Math.random().toString(36).slice(2, 10)}`);
  const channelRef = useRef<BroadcastChannel | null>(null);

  useEffect(() => {
    let alive = true;
    const quick = loadWorkspaceSync();
    if (quick) setWorkspace(quick);
    loadWorkspace()
      .then(({ state, engine }) => {
        if (!alive) return;
        setWorkspace(state);
        setStorageEngine(engine);
        setHydrated(true);
      })
      .catch(() => {
        if (alive) setHydrated(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return;
    const ch = new BroadcastChannel(SYNC_CHANNEL_NAME);
    channelRef.current = ch;
    ch.onmessage = (event: MessageEvent<{ sender?: string; state?: NotepadWorkspaceState }>) => {
      if (!event.data || event.data.sender === tabInstanceIdRef.current || !event.data.state) return;
      setWorkspace(event.data.state);
    };
    return () => {
      ch.close();
      channelRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    setSaveState('saving');
    const timer = window.setTimeout(() => {
      const snapshot: NotepadWorkspaceState = { ...workspaceRef.current, savedAt: Date.now() };
      saveWorkspace(snapshot)
        .then((engine) => {
          setStorageEngine(engine);
          setSaveState('saved');
          channelRef.current?.postMessage({ sender: tabInstanceIdRef.current, state: snapshot });
        })
        .catch(() => setSaveState('saved'));
    }, 180);
    return () => window.clearTimeout(timer);
  }, [workspace, hydrated]);

  useEffect(() => {
    const flush = () => {
      if (!hydrated) return;
      saveWorkspaceSync({ ...workspaceRef.current, savedAt: Date.now() });
    };
    window.addEventListener('beforeunload', flush);
    window.addEventListener('pagehide', flush);
    return () => {
      window.removeEventListener('beforeunload', flush);
      window.removeEventListener('pagehide', flush);
    };
  }, [hydrated]);

  const flushSaveNow = useCallback(() => {
    void saveWorkspace({ ...workspaceRef.current, savedAt: Date.now() });
  }, []);

  const handleExportWorkspace = useCallback(() => {
    const json = exportWorkspaceJson(workspaceRef.current);
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
      setWorkspace(parsed.state);
      setSyncError(null);
      setSyncMessage(t('notepad.sync.importSuccess', { count: parsed.state.docs.length }));
    },
    [onResetRawBytes, t],
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
      await writable.write(exportWorkspaceJson(workspaceRef.current));
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
      await writable.write(exportWorkspaceJson(workspaceRef.current));
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
    setWorkspace(createStarterWorkspace());
    setSyncMessage(t('notepad.sync.resetStarter'));
    setSyncError(null);
  }, [onResetRawBytes, t]);

  const openSyncDialog = useCallback(() => {
    setSyncMessage(null);
    setSyncError(null);
    setSyncOpen(true);
  }, []);

  return {
    workspace,
    setWorkspace,
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
