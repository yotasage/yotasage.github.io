import { useCallback, useRef, useState } from 'react';

import {
  type FloatingPastePreview,
  restoreLayers,
  snapshotLayers,
} from '../../lib/paint/canvasOps';
import {
  buildDocMeta,
  cloneDocumentRuntime,
  createBlankDocumentRuntime,
  type ImageDocRuntime,
  makeDuplicateName,
  makeUniqueDocName,
  nextDocId,
  nextUntitledName,
  renderDocumentThumbnail,
} from '../../lib/paint/documents';
import {
  type HistorySnapshot,
  type ImageDocMeta,
  MAX_HISTORY,
  type PaintLayer,
  type Rect,
} from '../../lib/paint/types';
import { useI18n } from '../../lib/ui/i18n';

export interface UsePaintDocumentsOptions {
  zoomRef: React.MutableRefObject<number>;
  onSetZoom: (zoom: number) => void;
}

export function usePaintDocuments({ zoomRef, onSetZoom }: UsePaintDocumentsOptions) {
  const { t } = useI18n();

  const docsRuntimeRef = useRef<Map<string, ImageDocRuntime>>(new Map());
  const docsRef = useRef<ImageDocMeta[]>([]);
  const [docs, setDocs] = useState<ImageDocMeta[]>([]);

  const activeDocIdRef = useRef('');
  const [activeDocId, setActiveDocId] = useState('');

  const docSizeRef = useRef({ width: 960, height: 640 });
  const [docSize, setDocSize] = useState({ width: 960, height: 640 });

  const layersRef = useRef<PaintLayer[]>([]);
  const [layersVersion, setLayersVersion] = useState(0);

  const activeLayerIdRef = useRef('');
  const [activeLayerId, setActiveLayerId] = useState('');

  const historyRef = useRef<HistorySnapshot[]>([]);
  const historyIdxRef = useRef(-1);
  const [historyState, setHistoryState] = useState({ canUndo: false, canRedo: false });

  const selectionRef = useRef<Rect | null>(null);
  const [selection, setSelectionState] = useState<Rect | null>(null);

  const cropRectRef = useRef<Rect | null>(null);
  const [cropRect, setCropRectState] = useState<Rect | null>(null);

  const floatingRef = useRef<FloatingPastePreview | null>(null);
  const [hasFloatingSelection, setHasFloatingSelection] = useState(false);

  const setSelection = useCallback((next: React.SetStateAction<Rect | null>) => {
    setSelectionState((prev) => {
      const resolved = typeof next === 'function' ? next(prev) : next;
      selectionRef.current = resolved;
      return resolved;
    });
  }, []);

  const setCropRect = useCallback((next: React.SetStateAction<Rect | null>) => {
    setCropRectState((prev) => {
      const resolved = typeof next === 'function' ? next(prev) : next;
      cropRectRef.current = resolved;
      return resolved;
    });
  }, []);

  const updateDocs = useCallback((updater: (prev: ImageDocMeta[]) => ImageDocMeta[]) => {
    const next = updater(docsRef.current);
    docsRef.current = next;
    setDocs(next);
  }, []);

  const syncHistoryFlags = useCallback(() => {
    setHistoryState({
      canUndo: historyIdxRef.current > 0,
      canRedo: historyIdxRef.current < historyRef.current.length - 1,
    });
  }, []);

  const setActiveLayerIdSync = useCallback((id: string) => {
    activeLayerIdRef.current = id;
    setActiveLayerId(id);
  }, []);

  const setDocSizeSync = useCallback((width: number, height: number) => {
    docSizeRef.current = { width, height };
    setDocSize({ width, height });
  }, []);

  const refreshActiveDocMeta = useCallback(
    (overrides?: { width?: number; height?: number; isPristineBlank?: boolean }) => {
      const docId = activeDocIdRef.current;
      if (!docId) return;
      const existingRt = docsRuntimeRef.current.get(docId);
      const w = overrides?.width ?? docSizeRef.current.width;
      const h = overrides?.height ?? docSizeRef.current.height;
      const isPristineBlank =
        overrides?.isPristineBlank !== undefined
          ? overrides.isPristineBlank
          : (existingRt?.isPristineBlank ?? false);

      const rt: ImageDocRuntime = {
        width: w,
        height: h,
        layers: layersRef.current,
        activeLayerId: activeLayerIdRef.current,
        history: historyRef.current,
        historyIdx: historyIdxRef.current,
        selection: selectionRef.current,
        cropRect: cropRectRef.current,
        floating: floatingRef.current,
        zoom: zoomRef.current,
        isPristineBlank,
      };
      docsRuntimeRef.current.set(docId, rt);

      const thumbDataUrl = renderDocumentThumbnail(layersRef.current, w, h);
      const layerCount = layersRef.current.length;
      const zoom = zoomRef.current;
      const now = Date.now();

      updateDocs((prev) =>
        prev.map((d) =>
          d.id === docId
            ? { ...d, width: w, height: h, layerCount, zoom, thumbDataUrl, updatedAt: now }
            : d,
        ),
      );
    },
    [updateDocs, zoomRef],
  );

  const loadRuntimeIntoWorkspace = useCallback(
    (docId: string, rt: ImageDocRuntime) => {
      activeDocIdRef.current = docId;
      setActiveDocId(docId);

      layersRef.current = rt.layers;
      setDocSizeSync(rt.width, rt.height);
      setActiveLayerIdSync(rt.activeLayerId);

      historyRef.current = rt.history;
      historyIdxRef.current = rt.historyIdx;
      syncHistoryFlags();

      selectionRef.current = rt.selection;
      setSelectionState(rt.selection);
      cropRectRef.current = rt.cropRect;
      setCropRectState(rt.cropRect);
      floatingRef.current = rt.floating;
      setHasFloatingSelection(Boolean(rt.floating));

      onSetZoom(rt.zoom);
      setLayersVersion((v) => v + 1);
    },
    [onSetZoom, setActiveLayerIdSync, setDocSizeSync, syncHistoryFlags],
  );

  const initDefaultDocument = useCallback(() => {
    docsRuntimeRef.current.clear();
    const id = nextDocId();
    const rt = createBlankDocumentRuntime(960, 640, 'white', t('paint.layer.background'), true);
    docsRuntimeRef.current.set(id, rt);
    const meta = buildDocMeta(id, nextUntitledName([], t('paint.doc.untitled')), rt, false);
    docsRef.current = [meta];
    setDocs([meta]);
    loadRuntimeIntoWorkspace(id, rt);
  }, [loadRuntimeIntoWorkspace, t]);

  const commitLayers = useCallback(
    (
      label: string,
      nextLayers: PaintLayer[],
      nextActiveId: string,
      nextW?: number,
      nextH?: number,
    ) => {
      layersRef.current = nextLayers;
      const w = nextW ?? (nextLayers[0]?.canvas.width || docSizeRef.current.width);
      const h = nextH ?? (nextLayers[0]?.canvas.height || docSizeRef.current.height);
      if (w !== docSizeRef.current.width || h !== docSizeRef.current.height) {
        setDocSizeSync(w, h);
      }
      setActiveLayerIdSync(nextActiveId);

      const snap: HistorySnapshot = {
        label,
        width: w,
        height: h,
        activeLayerId: nextActiveId,
        layers: snapshotLayers(nextLayers),
      };
      const truncated = historyRef.current.slice(0, historyIdxRef.current + 1);
      truncated.push(snap);
      if (truncated.length > MAX_HISTORY) truncated.shift();
      historyRef.current = truncated;
      historyIdxRef.current = truncated.length - 1;
      syncHistoryFlags();
      refreshActiveDocMeta({ width: w, height: h, isPristineBlank: false });
      setLayersVersion((v) => v + 1);
    },
    [refreshActiveDocMeta, setActiveLayerIdSync, setDocSizeSync, syncHistoryFlags],
  );

  const openNewDocument = useCallback(
    (rt: ImageDocRuntime, preferredName: string, replacePristine = false): string => {
      if (activeDocIdRef.current) {
        refreshActiveDocMeta();
      }

      const currentDocs = docsRef.current;
      if (replacePristine && currentDocs.length === 1) {
        const onlyDoc = currentDocs[0];
        const onlyRt = docsRuntimeRef.current.get(onlyDoc.id);
        if (onlyRt?.isPristineBlank && !onlyDoc.pinned) {
          const cleanName = preferredName.trim() || onlyDoc.name;
          docsRuntimeRef.current.set(onlyDoc.id, rt);
          const replacedMeta = buildDocMeta(onlyDoc.id, cleanName, rt, false);
          updateDocs(() => [replacedMeta]);
          loadRuntimeIntoWorkspace(onlyDoc.id, rt);
          return onlyDoc.id;
        }
      }

      const id = nextDocId();
      const uniqueName = makeUniqueDocName(
        preferredName.trim() || nextUntitledName(currentDocs.map((d) => d.name), t('paint.doc.untitled')),
        currentDocs.map((d) => d.name),
      );
      docsRuntimeRef.current.set(id, rt);
      const meta = buildDocMeta(id, uniqueName, rt, false);
      updateDocs((prev) => [...prev, meta]);
      loadRuntimeIntoWorkspace(id, rt);
      return id;
    },
    [loadRuntimeIntoWorkspace, refreshActiveDocMeta, t, updateDocs],
  );

  const handleSelectDoc = useCallback(
    (docId: string) => {
      if (docId === activeDocIdRef.current) return;
      refreshActiveDocMeta();
      const target = docsRuntimeRef.current.get(docId);
      if (!target) return;
      loadRuntimeIntoWorkspace(docId, target);
    },
    [loadRuntimeIntoWorkspace, refreshActiveDocMeta],
  );

  const handleNewCanvas = useCallback(
    (w: number, h: number, bg: 'white' | 'transparent' | 'black') => {
      const rt = createBlankDocumentRuntime(w, h, bg, t('paint.layer.background'), false);
      const name = nextUntitledName(
        docsRef.current.map((d) => d.name),
        t('paint.doc.untitled'),
      );
      openNewDocument(rt, name, false);
    },
    [openNewDocument, t],
  );

  const handleQuickNewDoc = useCallback(() => {
    handleNewCanvas(960, 640, 'white');
  }, [handleNewCanvas]);

  const handleDuplicateDoc = useCallback(
    (docId: string) => {
      if (docId === activeDocIdRef.current) {
        refreshActiveDocMeta();
      }
      const sourceRt = docsRuntimeRef.current.get(docId);
      const sourceIdx = docsRef.current.findIndex((d) => d.id === docId);
      if (!sourceRt || sourceIdx < 0) return;

      const sourceMeta = docsRef.current[sourceIdx];
      const clonedRt = cloneDocumentRuntime(sourceRt);
      const id = nextDocId();
      const dupName = makeDuplicateName(
        sourceMeta.name,
        docsRef.current.map((d) => d.name),
        t('paint.doc.copySuffix'),
      );
      docsRuntimeRef.current.set(id, clonedRt);
      const meta = buildDocMeta(id, dupName, clonedRt, false);
      updateDocs((prev) => {
        const next = [...prev];
        next.splice(sourceIdx + 1, 0, meta);
        return next;
      });
      loadRuntimeIntoWorkspace(id, clonedRt);
    },
    [loadRuntimeIntoWorkspace, refreshActiveDocMeta, t, updateDocs],
  );

  const handleRenameDoc = useCallback(
    (docId: string, newName: string) => {
      const clean = newName.trim().slice(0, 120);
      if (!clean) return;
      updateDocs((prev) => prev.map((d) => (d.id === docId ? { ...d, name: clean } : d)));
    },
    [updateDocs],
  );

  const handleTogglePinDoc = useCallback(
    (docId: string) => {
      updateDocs((prev) => prev.map((d) => (d.id === docId ? { ...d, pinned: !d.pinned } : d)));
    },
    [updateDocs],
  );

  const handleCloseDoc = useCallback(
    (docId: string) => {
      const currentDocs = docsRef.current;
      const idx = currentDocs.findIndex((d) => d.id === docId);
      if (idx < 0 || currentDocs[idx].pinned) return;

      docsRuntimeRef.current.delete(docId);
      const remaining = currentDocs.filter((d) => d.id !== docId);

      if (remaining.length === 0) {
        const freshId = nextDocId();
        const rt = createBlankDocumentRuntime(960, 640, 'white', t('paint.layer.background'), true);
        docsRuntimeRef.current.set(freshId, rt);
        const meta = buildDocMeta(freshId, nextUntitledName([], t('paint.doc.untitled')), rt, false);
        updateDocs(() => [meta]);
        loadRuntimeIntoWorkspace(freshId, rt);
        return;
      }

      updateDocs(() => remaining);
      if (docId === activeDocIdRef.current) {
        const nextDoc = remaining[Math.min(idx, remaining.length - 1)];
        const nextRt = docsRuntimeRef.current.get(nextDoc.id);
        if (nextRt) loadRuntimeIntoWorkspace(nextDoc.id, nextRt);
      }
    },
    [loadRuntimeIntoWorkspace, t, updateDocs],
  );

  const discardFloatingSelection = useCallback(() => {
    if (!floatingRef.current) return;
    floatingRef.current = null;
    setHasFloatingSelection(false);
    setSelection(null);
    setLayersVersion((v) => v + 1);
  }, [setSelection]);

  const handleUndo = useCallback(() => {
    if (floatingRef.current) {
      discardFloatingSelection();
      return;
    }
    if (historyIdxRef.current <= 0) return;
    historyIdxRef.current -= 1;
    const snap = historyRef.current[historyIdxRef.current];
    layersRef.current = restoreLayers(snap.layers);
    setDocSizeSync(snap.width, snap.height);
    setActiveLayerIdSync(snap.activeLayerId);
    setSelection(null);
    setCropRect(null);
    syncHistoryFlags();
    refreshActiveDocMeta({ width: snap.width, height: snap.height });
    setLayersVersion((v) => v + 1);
  }, [
    discardFloatingSelection,
    refreshActiveDocMeta,
    setActiveLayerIdSync,
    setCropRect,
    setDocSizeSync,
    setSelection,
    syncHistoryFlags,
  ]);

  const handleRedo = useCallback(() => {
    if (historyIdxRef.current >= historyRef.current.length - 1) return;
    historyIdxRef.current += 1;
    const snap = historyRef.current[historyIdxRef.current];
    layersRef.current = restoreLayers(snap.layers);
    setDocSizeSync(snap.width, snap.height);
    setActiveLayerIdSync(snap.activeLayerId);
    setSelection(null);
    setCropRect(null);
    syncHistoryFlags();
    refreshActiveDocMeta({ width: snap.width, height: snap.height });
    setLayersVersion((v) => v + 1);
  }, [
    refreshActiveDocMeta,
    setActiveLayerIdSync,
    setCropRect,
    setDocSizeSync,
    setSelection,
    syncHistoryFlags,
  ]);

  return {
    docs,
    activeDocId,
    docSize,
    docSizeRef,
    layersRef,
    layersVersion,
    setLayersVersion,
    activeLayerId,
    setActiveLayerId: setActiveLayerIdSync,
    historyState,
    selection,
    setSelection,
    cropRect,
    setCropRect,
    floatingRef,
    hasFloatingSelection,
    setHasFloatingSelection,
    refreshActiveDocMeta,
    initDefaultDocument,
    commitLayers,
    openNewDocument,
    handleSelectDoc,
    handleNewCanvas,
    handleQuickNewDoc,
    handleDuplicateDoc,
    handleRenameDoc,
    handleTogglePinDoc,
    handleCloseDoc,
    discardFloatingSelection,
    handleUndo,
    handleRedo,
  };
}
