import { useCallback, useRef, useState } from 'react';

import {
  cloneLayer,
  createCanvas,
  createLayer,
  createSampleDocument,
  cropCanvas,
  deserializeProject,
  flipCanvas,
  type FloatingPastePreview,
  renderCompositeCanvas,
  resampleCanvas,
  resizeCanvasBounds,
  restoreLayers,
  rotateCanvas,
  serializeProject,
  snapshotLayers,
} from '../../lib/paint/canvasOps';
import {
  copyCanvasToClipboard,
  decodeBlobToCanvas,
  readImageFromClipboardApi,
} from '../../lib/paint/clipboard';
import {
  applyAdjustmentsBuffer,
  applyColorStyleBuffer,
  applyConvolution3x3Buffer,
  KERNEL_BLUR,
  KERNEL_SHARPEN,
} from '../../lib/paint/filters';
import { clampRect, nudgeRect } from '../../lib/paint/geometry';
import {
  type AnchorPosition,
  type BlendMode,
  type ColorStyleId,
  type HistorySnapshot,
  MAX_HISTORY,
  type PaintLayer,
  type Rect,
  type ResampleQuality,
  type ToolId,
} from '../../lib/paint/types';
import { type TranslationKey, useI18n } from '../../lib/ui/i18n';

export function usePaintActions(onSetActiveTool: (tool: ToolId) => void) {
  const { t } = useI18n();

  const [docSize, setDocSize] = useState({ width: 960, height: 640 });
  const layersRef = useRef<PaintLayer[]>([]);
  const [layersVersion, setLayersVersion] = useState(0);
  const [activeLayerId, setActiveLayerId] = useState('');

  const historyRef = useRef<HistorySnapshot[]>([]);
  const historyIdxRef = useRef(-1);
  const [historyState, setHistoryState] = useState({ canUndo: false, canRedo: false });

  const [selection, setSelection] = useState<Rect | null>(null);
  const [cropRect, setCropRect] = useState<Rect | null>(null);

  // Floating movable paste/lifted selection (committed to active layer only when deselected!)
  const floatingRef = useRef<FloatingPastePreview | null>(null);
  const [hasFloatingSelection, setHasFloatingSelection] = useState(false);

  const [statusMsg, setStatusMsg] = useState('');
  const statusTimerRef = useRef<number | null>(null);

  const showStatus = useCallback((msg: string) => {
    setStatusMsg(msg);
    if (statusTimerRef.current) window.clearTimeout(statusTimerRef.current);
    statusTimerRef.current = window.setTimeout(() => setStatusMsg(''), 4400);
  }, []);

  const syncHistoryFlags = useCallback(() => {
    setHistoryState({
      canUndo: historyIdxRef.current > 0,
      canRedo: historyIdxRef.current < historyRef.current.length - 1,
    });
  }, []);

  const getActiveLayer = useCallback((): PaintLayer | undefined => {
    return (
      layersRef.current.find((l) => l.id === activeLayerId) ??
      layersRef.current[layersRef.current.length - 1]
    );
  }, [activeLayerId]);

  const commitLayers = useCallback(
    (label: string, nextLayers: PaintLayer[], nextActiveId: string, nextW?: number, nextH?: number) => {
      layersRef.current = nextLayers;
      const w = nextW ?? (nextLayers[0]?.canvas.width || docSize.width);
      const h = nextH ?? (nextLayers[0]?.canvas.height || docSize.height);
      if (w !== docSize.width || h !== docSize.height) {
        setDocSize({ width: w, height: h });
      }
      setActiveLayerId(nextActiveId);

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
      setLayersVersion((v) => v + 1);
    },
    [docSize.height, docSize.width, syncHistoryFlags],
  );

  const initDefaultDocument = useCallback(() => {
    const bg = createLayer(960, 640, 'Background', '#ffffff');
    const sketch = createLayer(960, 640, 'Layer 2');
    const initLayers = [bg, sketch];
    layersRef.current = initLayers;
    setActiveLayerId(sketch.id);
    historyRef.current = [
      {
        label: 'Init',
        width: 960,
        height: 640,
        activeLayerId: sketch.id,
        layers: snapshotLayers(initLayers),
      },
    ];
    historyIdxRef.current = 0;
    syncHistoryFlags();
    setLayersVersion(1);
  }, [syncHistoryFlags]);

  /**
   * Stamps the floating pasted/moved selection permanently onto the active layer and clears selection.
   */
  const commitFloatingSelection = useCallback(
    (clearSel = true, announce = false) => {
      const floating = floatingRef.current;
      if (!floating) {
        if (clearSel) setSelection(null);
        return;
      }
      const layer = getActiveLayer();
      floatingRef.current = null;
      setHasFloatingSelection(false);
      if (clearSel) setSelection(null);
      if (layer) {
        const ctx = layer.canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(floating.canvas, Math.round(floating.x), Math.round(floating.y));
        }
        commitLayers('Apply Paste', [...layersRef.current], layer.id);
        if (announce) showStatus(t('paint.status.pastedCommitted'));
      }
    },
    [commitLayers, getActiveLayer, showStatus, t],
  );

  const discardFloatingSelection = useCallback(() => {
    if (!floatingRef.current) return;
    floatingRef.current = null;
    setHasFloatingSelection(false);
    setSelection(null);
    setLayersVersion((v) => v + 1);
  }, []);

  /**
   * Lifts the pixels inside the current marquee selection out of the active layer into a movable floating selection.
   */
  const liftSelectionToFloating = useCallback((): FloatingPastePreview | null => {
    if (floatingRef.current) return floatingRef.current;
    if (!selection || selection.w <= 0 || selection.h <= 0) return null;
    const layer = getActiveLayer();
    if (!layer) return null;

    const clamped = clampRect(selection, docSize.width, docSize.height);
    if (clamped.w <= 0 || clamped.h <= 0) return null;

    const lifted = createCanvas(clamped.w, clamped.h);
    const lCtx = lifted.getContext('2d');
    if (lCtx) {
      lCtx.drawImage(layer.canvas, clamped.x, clamped.y, clamped.w, clamped.h, 0, 0, clamped.w, clamped.h);
    }
    const ctx = layer.canvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(clamped.x, clamped.y, clamped.w, clamped.h);
    }

    const preview: FloatingPastePreview = {
      canvas: lifted,
      x: clamped.x,
      y: clamped.y,
      w: clamped.w,
      h: clamped.h,
    };
    floatingRef.current = preview;
    setHasFloatingSelection(true);
    setSelection({ x: preview.x, y: preview.y, w: preview.w, h: preview.h });
    setLayersVersion((v) => v + 1);
    return preview;
  }, [docSize.height, docSize.width, getActiveLayer, selection]);

  /**
   * Nudges active floating selection (or lifts regular selection first) by dx, dy pixels (arrow keys = 1px).
   */
  const nudgeActiveSelection = useCallback(
    (dx: number, dy: number) => {
      const floating = floatingRef.current ?? liftSelectionToFloating();
      if (!floating) return;
      const next = nudgeRect(
        { x: floating.x, y: floating.y, w: floating.w, h: floating.h },
        dx,
        dy,
      );
      floating.x = next.x;
      floating.y = next.y;
      setSelection(next);
      setLayersVersion((v) => v + 1);
    },
    [liftSelectionToFloating],
  );

  /**
   * Pastes an incoming image as a selected, movable floating selection (not committed until deselected!).
   */
  const pasteCanvasAsFloatingSelection = useCallback(
    (incoming: HTMLCanvasElement) => {
      // Commit any prior floating selection first
      if (floatingRef.current) {
        commitFloatingSelection(false, false);
      }

      const targetW = Math.max(docSize.width, incoming.width);
      const targetH = Math.max(docSize.height, incoming.height);

      if (targetW !== docSize.width || targetH !== docSize.height) {
        const expanded = layersRef.current.map((layer) => ({
          ...layer,
          canvas: resizeCanvasBounds(layer.canvas, targetW, targetH, 'tl'),
        }));
        commitLayers(t('paint.history.expandForPaste'), expanded, activeLayerId, targetW, targetH);
      }

      const px = incoming.width >= targetW ? 0 : Math.floor((targetW - incoming.width) / 2);
      const py = incoming.height >= targetH ? 0 : Math.floor((targetH - incoming.height) / 2);

      const preview: FloatingPastePreview = {
        canvas: incoming,
        x: px,
        y: py,
        w: incoming.width,
        h: incoming.height,
      };
      floatingRef.current = preview;
      setHasFloatingSelection(true);
      setSelection({ x: px, y: py, w: incoming.width, h: incoming.height });
      onSetActiveTool('move');
      setLayersVersion((v) => v + 1);
      showStatus(t('paint.status.pasted', { w: incoming.width, h: incoming.height }));
    },
    [activeLayerId, commitFloatingSelection, commitLayers, docSize.height, docSize.width, onSetActiveTool, showStatus, t],
  );

  const insertCanvasAsNewLayer = useCallback(
    (incoming: HTMLCanvasElement, layerName: string) => {
      if (floatingRef.current) commitFloatingSelection(true, false);
      const targetW = Math.max(docSize.width, incoming.width);
      const targetH = Math.max(docSize.height, incoming.height);

      const updatedExisting = layersRef.current.map((layer) => {
        if (layer.canvas.width === targetW && layer.canvas.height === targetH) return layer;
        return { ...layer, canvas: resizeCanvasBounds(layer.canvas, targetW, targetH, 'tl') };
      });

      const newLayer = createLayer(targetW, targetH, layerName);
      const ctx = newLayer.canvas.getContext('2d');
      if (ctx) {
        const dx = Math.max(0, Math.floor((targetW - incoming.width) / 2));
        const dy = Math.max(0, Math.floor((targetH - incoming.height) / 2));
        ctx.drawImage(incoming, dx, dy);
      }

      commitLayers('Add Image Layer', [...updatedExisting, newLayer], newLayer.id, targetW, targetH);
    },
    [commitFloatingSelection, commitLayers, docSize.height, docSize.width],
  );

  const handleUndo = useCallback(() => {
    if (floatingRef.current) {
      discardFloatingSelection();
      return;
    }
    if (historyIdxRef.current <= 0) return;
    historyIdxRef.current -= 1;
    const snap = historyRef.current[historyIdxRef.current];
    layersRef.current = restoreLayers(snap.layers);
    setDocSize({ width: snap.width, height: snap.height });
    setActiveLayerId(snap.activeLayerId);
    setSelection(null);
    setCropRect(null);
    syncHistoryFlags();
    setLayersVersion((v) => v + 1);
  }, [discardFloatingSelection, syncHistoryFlags]);

  const handleRedo = useCallback(() => {
    if (historyIdxRef.current >= historyRef.current.length - 1) return;
    historyIdxRef.current += 1;
    const snap = historyRef.current[historyIdxRef.current];
    layersRef.current = restoreLayers(snap.layers);
    setDocSize({ width: snap.width, height: snap.height });
    setActiveLayerId(snap.activeLayerId);
    setSelection(null);
    setCropRect(null);
    syncHistoryFlags();
    setLayersVersion((v) => v + 1);
  }, [syncHistoryFlags]);

  const handleCopy = useCallback(
    async (merged = true) => {
      if (floatingRef.current) {
        const res = await copyCanvasToClipboard(floatingRef.current.canvas, null);
        showStatus(
          res.osCopied
            ? t('paint.status.copiedOs', { w: res.width, h: res.height })
            : t('paint.status.copiedInternal', { w: res.width, h: res.height }),
        );
        return;
      }

      const source = merged
        ? renderCompositeCanvas(layersRef.current, docSize.width, docSize.height)
        : (getActiveLayer()?.canvas ?? renderCompositeCanvas(layersRef.current, docSize.width, docSize.height));

      const res = await copyCanvasToClipboard(source, selection);
      showStatus(
        res.osCopied
          ? t('paint.status.copiedOs', { w: res.width, h: res.height })
          : t('paint.status.copiedInternal', { w: res.width, h: res.height }),
      );
    },
    [docSize.height, docSize.width, getActiveLayer, selection, showStatus, t],
  );

  const handlePasteAction = useCallback(async () => {
    const found = await readImageFromClipboardApi();
    if (!found) {
      showStatus(t('paint.status.pasteEmpty'));
      return;
    }
    pasteCanvasAsFloatingSelection(found.canvas);
  }, [pasteCanvasAsFloatingSelection, showStatus, t]);

  const handleClearSelection = useCallback(() => {
    if (floatingRef.current) {
      discardFloatingSelection();
      return;
    }
    const layer = getActiveLayer();
    if (!layer || !selection || selection.w <= 0 || selection.h <= 0) return;
    const ctx = layer.canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(selection.x, selection.y, selection.w, selection.h);
    commitLayers('Clear Selection', [...layersRef.current], layer.id);
  }, [commitLayers, discardFloatingSelection, getActiveLayer, selection]);

  const handleCut = useCallback(async () => {
    if (floatingRef.current) {
      await handleCopy(false);
      discardFloatingSelection();
      return;
    }
    if (!selection || selection.w <= 0 || selection.h <= 0) {
      await handleCopy(false);
      return;
    }
    await handleCopy(false);
    handleClearSelection();
  }, [discardFloatingSelection, handleClearSelection, handleCopy, selection]);

  const applyCropRect = useCallback(
    (rect: Rect) => {
      if (floatingRef.current) commitFloatingSelection(false, false);
      const clamped = clampRect(rect, docSize.width, docSize.height);
      if (clamped.w < 1 || clamped.h < 1) return;
      const croppedLayers = layersRef.current.map((layer) => ({
        ...layer,
        canvas: cropCanvas(layer.canvas, clamped),
      }));
      setCropRect(null);
      setSelection(null);
      commitLayers('Crop', croppedLayers, activeLayerId, clamped.w, clamped.h);
      showStatus(t('paint.status.cropped', { w: clamped.w, h: clamped.h }));
    },
    [activeLayerId, commitFloatingSelection, commitLayers, docSize.height, docSize.width, showStatus, t],
  );

  const handleActivateCrop = useCallback(() => {
    if (floatingRef.current) commitFloatingSelection(false, false);
    onSetActiveTool('crop');
    if (selection && selection.w > 2 && selection.h > 2) {
      setCropRect({ ...selection });
      setSelection(null);
    } else {
      const padX = Math.round(docSize.width * 0.1);
      const padY = Math.round(docSize.height * 0.1);
      setCropRect({
        x: padX,
        y: padY,
        w: Math.max(16, docSize.width - padX * 2),
        h: Math.max(16, docSize.height - padY * 2),
      });
    }
  }, [commitFloatingSelection, docSize.height, docSize.width, onSetActiveTool, selection]);

  const handleCropToSelection = useCallback(() => {
    if (selection && selection.w > 0 && selection.h > 0) {
      applyCropRect(selection);
    }
  }, [applyCropRect, selection]);

  const handleNewCanvas = useCallback(
    (w: number, h: number, bg: 'white' | 'transparent' | 'black') => {
      floatingRef.current = null;
      setHasFloatingSelection(false);
      const fill = bg === 'white' ? '#ffffff' : bg === 'black' ? '#000000' : undefined;
      const base = createLayer(w, h, t('paint.layer.background'), fill);
      const top = createLayer(w, h, 'Layer 2');
      setSelection(null);
      setCropRect(null);
      commitLayers('New Canvas', [base, top], top.id, w, h);
    },
    [commitLayers, t],
  );

  const handleLoadSample = useCallback(() => {
    floatingRef.current = null;
    setHasFloatingSelection(false);
    const sampleLayers = createSampleDocument(960, 640);
    setSelection(null);
    setCropRect(null);
    commitLayers('Sample', sampleLayers, sampleLayers[sampleLayers.length - 1].id, 960, 640);
  }, [commitLayers]);

  const handleResize = useCallback(
    (w: number, h: number, quality: ResampleQuality, isScaleDown = false) => {
      if (floatingRef.current) commitFloatingSelection(true, false);
      const next = layersRef.current.map((layer) => ({
        ...layer,
        canvas: resampleCanvas(layer.canvas, w, h, quality),
      }));
      setSelection(null);
      setCropRect(null);
      commitLayers(isScaleDown ? 'Scale Down' : 'Resize', next, activeLayerId, w, h);
      showStatus(t(isScaleDown ? 'paint.status.scaledDown' : 'paint.status.resized', { w, h }));
    },
    [activeLayerId, commitFloatingSelection, commitLayers, showStatus, t],
  );

  const handleCanvasSize = useCallback(
    (w: number, h: number, anchor: AnchorPosition) => {
      if (floatingRef.current) commitFloatingSelection(true, false);
      const next = layersRef.current.map((layer) => ({
        ...layer,
        canvas: resizeCanvasBounds(layer.canvas, w, h, anchor),
      }));
      setSelection(null);
      setCropRect(null);
      commitLayers('Canvas Size', next, activeLayerId, w, h);
    },
    [activeLayerId, commitFloatingSelection, commitLayers],
  );

  const handleRotate = useCallback(
    (angleDeg: number, expandCanvas: boolean, allLayers: boolean) => {
      if (floatingRef.current) commitFloatingSelection(true, false);
      if (allLayers) {
        const next = layersRef.current.map((layer) => ({
          ...layer,
          canvas: rotateCanvas(layer.canvas, angleDeg, expandCanvas, 'smooth'),
        }));
        const newW = next[0].canvas.width;
        const newH = next[0].canvas.height;
        setSelection(null);
        setCropRect(null);
        commitLayers('Rotate', next, activeLayerId, newW, newH);
      } else {
        const next = layersRef.current.map((layer) =>
          layer.id !== activeLayerId
            ? layer
            : { ...layer, canvas: rotateCanvas(layer.canvas, angleDeg, false, 'smooth') },
        );
        commitLayers('Rotate Layer', next, activeLayerId);
      }
      showStatus(t('paint.status.rotated'));
    },
    [activeLayerId, commitFloatingSelection, commitLayers, showStatus, t],
  );

  const handleFlip = useCallback(
    (dir: 'horizontal' | 'vertical', allLayers: boolean) => {
      if (floatingRef.current) commitFloatingSelection(true, false);
      const next = layersRef.current.map((layer) =>
        !allLayers && layer.id !== activeLayerId ? layer : { ...layer, canvas: flipCanvas(layer.canvas, dir) },
      );
      commitLayers(`Flip ${dir}`, next, activeLayerId);
    },
    [activeLayerId, commitFloatingSelection, commitLayers],
  );

  const handleApplyColorStyle = useCallback(
    (style: ColorStyleId, opts: { threshold: number; posterizeLevels: number; allLayers: boolean }) => {
      if (floatingRef.current) commitFloatingSelection(false, false);
      const next = layersRef.current.map((layer) => {
        if (!opts.allLayers && layer.id !== activeLayerId) return layer;
        const clone = createCanvas(layer.canvas.width, layer.canvas.height);
        const ctx = clone.getContext('2d', { willReadFrequently: true });
        if (!ctx) return layer;
        ctx.drawImage(layer.canvas, 0, 0);
        const img = ctx.getImageData(0, 0, clone.width, clone.height);
        const processed = applyColorStyleBuffer(img.data, clone.width, clone.height, style, {
          threshold: opts.threshold,
          posterizeLevels: opts.posterizeLevels,
          selection,
        });
        ctx.putImageData(new ImageData(new Uint8ClampedArray(processed), clone.width, clone.height), 0, 0);
        return { ...layer, canvas: clone };
      });
      commitLayers(`Style ${style}`, next, activeLayerId);
      showStatus(t('paint.status.styleApplied', { style: t(`paint.style.${style}` as TranslationKey) }));
    },
    [activeLayerId, commitFloatingSelection, commitLayers, selection, showStatus, t],
  );

  const handleApplyAdjustments = useCallback(
    (opts: { brightness: number; contrast: number; hue: number; saturation: number; allLayers: boolean }) => {
      if (floatingRef.current) commitFloatingSelection(false, false);
      const next = layersRef.current.map((layer) => {
        if (!opts.allLayers && layer.id !== activeLayerId) return layer;
        const clone = createCanvas(layer.canvas.width, layer.canvas.height);
        const ctx = clone.getContext('2d', { willReadFrequently: true });
        if (!ctx) return layer;
        ctx.drawImage(layer.canvas, 0, 0);
        const img = ctx.getImageData(0, 0, clone.width, clone.height);
        const processed = applyAdjustmentsBuffer(img.data, clone.width, clone.height, { ...opts, selection });
        ctx.putImageData(new ImageData(new Uint8ClampedArray(processed), clone.width, clone.height), 0, 0);
        return { ...layer, canvas: clone };
      });
      commitLayers('Adjustments', next, activeLayerId);
    },
    [activeLayerId, commitFloatingSelection, commitLayers, selection],
  );

  const handleApplyQuickFilter = useCallback(
    (kind: 'blur' | 'sharpen', allLayers: boolean) => {
      if (floatingRef.current) commitFloatingSelection(false, false);
      const kernel = kind === 'blur' ? KERNEL_BLUR : KERNEL_SHARPEN;
      const next = layersRef.current.map((layer) => {
        if (!allLayers && layer.id !== activeLayerId) return layer;
        const clone = createCanvas(layer.canvas.width, layer.canvas.height);
        const ctx = clone.getContext('2d', { willReadFrequently: true });
        if (!ctx) return layer;
        ctx.drawImage(layer.canvas, 0, 0);
        const img = ctx.getImageData(0, 0, clone.width, clone.height);
        const processed = applyConvolution3x3Buffer(img.data, clone.width, clone.height, kernel, selection);
        ctx.putImageData(new ImageData(new Uint8ClampedArray(processed), clone.width, clone.height), 0, 0);
        return { ...layer, canvas: clone };
      });
      commitLayers(`Filter ${kind}`, next, activeLayerId);
    },
    [activeLayerId, commitFloatingSelection, commitLayers, selection],
  );

  const handleSelectLayer = useCallback(
    (id: string) => {
      if (floatingRef.current && id !== activeLayerId) commitFloatingSelection(true, false);
      setActiveLayerId(id);
    },
    [activeLayerId, commitFloatingSelection],
  );

  const handleAddLayer = useCallback(() => {
    if (floatingRef.current) commitFloatingSelection(true, false);
    const idx = layersRef.current.findIndex((l) => l.id === activeLayerId);
    const layer = createLayer(docSize.width, docSize.height, `Layer ${layersRef.current.length + 1}`);
    const next = [...layersRef.current];
    next.splice(idx >= 0 ? idx + 1 : next.length, 0, layer);
    commitLayers('Add Layer', next, layer.id);
  }, [activeLayerId, commitFloatingSelection, commitLayers, docSize.height, docSize.width]);

  const handleDuplicateLayer = useCallback(() => {
    if (floatingRef.current) commitFloatingSelection(true, false);
    const idx = layersRef.current.findIndex((l) => l.id === activeLayerId);
    if (idx < 0) return;
    const copy = cloneLayer(layersRef.current[idx]);
    const next = [...layersRef.current];
    next.splice(idx + 1, 0, copy);
    commitLayers('Duplicate Layer', next, copy.id);
  }, [activeLayerId, commitFloatingSelection, commitLayers]);

  const handleDeleteLayer = useCallback(() => {
    if (layersRef.current.length <= 1) return;
    if (floatingRef.current) discardFloatingSelection();
    const idx = layersRef.current.findIndex((l) => l.id === activeLayerId);
    if (idx < 0) return;
    const next = layersRef.current.filter((l) => l.id !== activeLayerId);
    commitLayers('Delete Layer', next, next[Math.max(0, idx - 1)].id);
  }, [activeLayerId, commitLayers, discardFloatingSelection]);

  const handleMoveLayer = useCallback(
    (direction: 'up' | 'down') => {
      const idx = layersRef.current.findIndex((l) => l.id === activeLayerId);
      if (idx < 0) return;
      const target = direction === 'up' ? idx + 1 : idx - 1;
      if (target < 0 || target >= layersRef.current.length) return;
      const next = [...layersRef.current];
      const [item] = next.splice(idx, 1);
      next.splice(target, 0, item);
      commitLayers('Reorder Layer', next, activeLayerId);
    },
    [activeLayerId, commitLayers],
  );

  const handleMergeDown = useCallback(() => {
    if (floatingRef.current) commitFloatingSelection(true, false);
    const idx = layersRef.current.findIndex((l) => l.id === activeLayerId);
    if (idx <= 0) return;
    const upper = layersRef.current[idx];
    const lower = layersRef.current[idx - 1];
    const mergedCanvas = createCanvas(docSize.width, docSize.height);
    const ctx = mergedCanvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(lower.canvas, 0, 0);
      if (upper.visible && upper.opacity > 0) {
        ctx.save();
        ctx.globalAlpha = upper.opacity;
        ctx.globalCompositeOperation = upper.blendMode as GlobalCompositeOperation;
        ctx.drawImage(upper.canvas, 0, 0);
        ctx.restore();
      }
    }
    const mergedLayer: PaintLayer = { ...lower, canvas: mergedCanvas };
    const next = [...layersRef.current];
    next.splice(idx - 1, 2, mergedLayer);
    commitLayers('Merge Down', next, mergedLayer.id);
  }, [activeLayerId, commitFloatingSelection, commitLayers, docSize.height, docSize.width]);

  const handleFlatten = useCallback(() => {
    if (floatingRef.current) commitFloatingSelection(true, false);
    if (layersRef.current.length <= 1) return;
    const flatCanvas = renderCompositeCanvas(layersRef.current, docSize.width, docSize.height);
    const flatLayer: PaintLayer = {
      id: layersRef.current[0].id,
      name: t('paint.layer.background'),
      visible: true,
      opacity: 1,
      blendMode: 'source-over',
      locked: false,
      canvas: flatCanvas,
    };
    commitLayers('Flatten', [flatLayer], flatLayer.id);
  }, [commitFloatingSelection, commitLayers, docSize.height, docSize.width, t]);

  const handleClearLayer = useCallback(() => {
    if (floatingRef.current) discardFloatingSelection();
    const layer = getActiveLayer();
    if (!layer) return;
    const ctx = layer.canvas.getContext('2d');
    if (ctx) ctx.clearRect(0, 0, layer.canvas.width, layer.canvas.height);
    commitLayers('Clear Layer', [...layersRef.current], layer.id);
  }, [commitLayers, discardFloatingSelection, getActiveLayer]);

  const handleToggleVisibility = useCallback((id: string) => {
    layersRef.current = layersRef.current.map((l) => (l.id === id ? { ...l, visible: !l.visible } : l));
    setLayersVersion((v) => v + 1);
  }, []);

  const handleRenameLayer = useCallback((id: string, name: string) => {
    layersRef.current = layersRef.current.map((l) => (l.id === id ? { ...l, name } : l));
    setLayersVersion((v) => v + 1);
  }, []);

  const handleChangeOpacity = useCallback((id: string, opacity: number) => {
    layersRef.current = layersRef.current.map((l) => (l.id === id ? { ...l, opacity } : l));
    setLayersVersion((v) => v + 1);
  }, []);

  const handleChangeBlendMode = useCallback((id: string, blendMode: BlendMode) => {
    layersRef.current = layersRef.current.map((l) => (l.id === id ? { ...l, blendMode } : l));
    setLayersVersion((v) => v + 1);
  }, []);

  const handleFiles = useCallback(
    async (files: FileList | null, asLayer: boolean) => {
      if (!files || files.length === 0) return;
      const file = files[0];
      try {
        if (file.name.endsWith('.paint.json') || file.type === 'application/json') {
          floatingRef.current = null;
          setHasFloatingSelection(false);
          const proj = await deserializeProject(await file.text());
          setSelection(null);
          setCropRect(null);
          commitLayers(t('paint.history.openProject'), proj.layers, proj.layers[proj.layers.length - 1].id, proj.width, proj.height);
          return;
        }
        const imgCanvas = await decodeBlobToCanvas(file);
        if (asLayer) {
          insertCanvasAsNewLayer(imgCanvas, file.name.replace(/\.[^.]+$/, '') || 'Image');
        } else {
          floatingRef.current = null;
          setHasFloatingSelection(false);
          const layer: PaintLayer = {
            id: createLayer(1, 1, '').id,
            name: file.name.replace(/\.[^.]+$/, '') || 'Background',
            visible: true,
            opacity: 1,
            blendMode: 'source-over',
            locked: false,
            canvas: imgCanvas,
          };
          setSelection(null);
          setCropRect(null);
          commitLayers(t('paint.history.openImage'), [layer], layer.id, imgCanvas.width, imgCanvas.height);
        }
      } catch (err) {
        showStatus(err instanceof Error ? err.message : t('paint.status.openFailed'));
      }
    },
    [commitLayers, insertCanvasAsNewLayer, showStatus, t],
  );

  const handleExportImage = useCallback(
    (format: 'png' | 'jpeg' | 'webp', quality: number, filename: string) => {
      if (floatingRef.current) commitFloatingSelection(true, false);
      const bg = format === 'jpeg' ? '#ffffff' : undefined;
      const composite = renderCompositeCanvas(layersRef.current, docSize.width, docSize.height, bg);
      composite.toBlob(
        (blob) => {
          if (!blob) return;
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `${filename}.${format === 'jpeg' ? 'jpg' : format}`;
          a.click();
          URL.revokeObjectURL(url);
        },
        `image/${format}`,
        quality,
      );
    },
    [commitFloatingSelection, docSize.height, docSize.width],
  );

  const handleSaveProject = useCallback(
    (filename: string) => {
      if (floatingRef.current) commitFloatingSelection(true, false);
      const json = serializeProject(layersRef.current, docSize.width, docSize.height);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${filename}.paint.json`;
      a.click();
      URL.revokeObjectURL(url);
    },
    [commitFloatingSelection, docSize.height, docSize.width],
  );

  return {
    docSize,
    layersRef,
    layersVersion,
    setLayersVersion,
    activeLayerId,
    historyState,
    selection,
    setSelection,
    cropRect,
    setCropRect,
    floatingRef,
    hasFloatingSelection,
    statusMsg,
    getActiveLayer,
    commitLayers,
    initDefaultDocument,
    commitFloatingSelection,
    discardFloatingSelection,
    liftSelectionToFloating,
    nudgeActiveSelection,
    pasteCanvasAsFloatingSelection,
    handleUndo,
    handleRedo,
    handleCopy,
    handleCut,
    handlePasteAction,
    handleClearSelection,
    applyCropRect,
    handleActivateCrop,
    handleCropToSelection,
    handleNewCanvas,
    handleLoadSample,
    handleResize,
    handleCanvasSize,
    handleRotate,
    handleFlip,
    handleApplyColorStyle,
    handleApplyAdjustments,
    handleApplyQuickFilter,
    handleSelectLayer,
    handleAddLayer,
    handleDuplicateLayer,
    handleDeleteLayer,
    handleMoveLayer,
    handleMergeDown,
    handleFlatten,
    handleClearLayer,
    handleToggleVisibility,
    handleRenameLayer,
    handleChangeOpacity,
    handleChangeBlendMode,
    handleFiles,
    handleExportImage,
    handleSaveProject,
  };
}
