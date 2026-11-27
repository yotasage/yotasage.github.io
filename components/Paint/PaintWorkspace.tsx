import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  compositeLayers,
  createCanvas,
  drawBrushSegment,
  drawPixelLine,
  drawShape,
} from '../../lib/paint/canvasOps';
import { readImageFromPasteEvent } from '../../lib/paint/clipboard';
import { BLACK, rgbaToCss, WHITE } from '../../lib/paint/color';
import { buildPaintExampleRuntime, type PaintExampleId } from '../../lib/paint/examples';
import { floodFillBuffer } from '../../lib/paint/floodFill';
import {
  clampRect,
  constrainRectAspect,
  isPointInRect,
  normalizeRect,
  parseAspectRatio,
  snapAnglePoint,
} from '../../lib/paint/geometry';
import {
  DEFAULT_TOOL_OPTIONS,
  type PanelId,
  type PanelLayout,
  type Point,
  type RGBA,
  type ToolId,
  type ToolOptions,
} from '../../lib/paint/types';
import { useI18n } from '../../lib/ui/i18n';
import styles from '../../styles/Paint.module.css';
import { CanvasViewport, type CropHandle, StatusBar } from './CanvasViewport';
import ColorPickerPanel from './ColorPickerPanel';
import DockablePanel from './DockablePanel';
import FileBrowserPanel from './FileBrowserPanel';
import ImageTabStrip from './ImageTabStrip';
import LayersPanel from './LayersPanel';
import { LeftToolStrip, type ModalId, ToolOptionsBar, TopCommandBar } from './ToolBar';
import TransformModals from './TransformModals';
import { usePaintActions } from './usePaintActions';
import { useViewportZoom } from './useViewportZoom';

const LAYOUT_STORAGE_KEY = 'yotasage:paint:panels:v1';

const DEFAULT_FILES_LAYOUT: PanelLayout = {
  dock: 'left',
  visible: false,
  x: 64,
  y: 20,
  zIndex: 29,
};

const DEFAULT_COLORS_LAYOUT: PanelLayout = {
  dock: 'right',
  visible: true,
  x: 92,
  y: 20,
  zIndex: 30,
};

const DEFAULT_LAYERS_LAYOUT: PanelLayout = {
  dock: 'right',
  visible: true,
  x: 384,
  y: 20,
  zIndex: 31,
};

interface DragState {
  mode: 'draw' | 'shape' | 'select' | 'crop-new' | 'move-layer' | 'move-floating' | 'pan';
  start: Point;
  last: Point;
  color: RGBA;
  secondaryColor: RGBA;
  origFloatingPos?: Point;
  moveSnapshot?: HTMLCanvasElement;
  panStartScroll?: { x: number; y: number };
  panStartClient?: { x: number; y: number };
}

function isEditableElement(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT' ||
    target.isContentEditable
  );
}

export interface PaintWorkspaceProps {
  exampleRequest?: { id: PaintExampleId; seq: number } | null;
}

export default function PaintWorkspace({ exampleRequest }: PaintWorkspaceProps) {
  const { t } = useI18n();

  const workspaceRef = useRef<HTMLDivElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const displayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const openAsLayerRef = useRef(false);

  const [activeTool, setActiveTool] = useState<ToolId>('brush');
  const [toolOptions, setToolOptions] = useState<ToolOptions>(DEFAULT_TOOL_OPTIONS);
  const [primary, setPrimary] = useState<RGBA>({ r: 29, g: 78, b: 216, a: 255 });
  const [secondary, setSecondary] = useState<RGBA>(WHITE);
  const [activeColorSlot, setActiveColorSlot] = useState<'primary' | 'secondary'>('primary');
  const [recentColors, setRecentColors] = useState<RGBA[]>([]);

  const { zoom, zoomRef, setZoom, fitZoom } = useViewportZoom(viewportRef, displayCanvasRef);
  const [showPixelGrid, setShowPixelGrid] = useState(true);
  const [showTabStrip, setShowTabStrip] = useState(true);
  const [showTabThumbs, setShowTabThumbs] = useState(true);
  const [cursorPos, setCursorPos] = useState<Point | null>(null);
  const [textDraft, setTextDraft] = useState<{ x: number; y: number; value: string } | null>(null);
  const [spacePressed, setSpacePressed] = useState(false);
  const [modal, setModal] = useState<ModalId>(null);

  const [filesLayout, setFilesLayout] = useState<PanelLayout>(DEFAULT_FILES_LAYOUT);
  const [colorsLayout, setColorsLayout] = useState<PanelLayout>(DEFAULT_COLORS_LAYOUT);
  const [layersLayout, setLayersLayout] = useState<PanelLayout>(DEFAULT_LAYERS_LAYOUT);
  const [snapPreview, setSnapPreview] = useState<'left' | 'right' | null>(null);
  const zCounterRef = useRef(35);

  const dragRef = useRef<DragState | null>(null);
  const previewShapeRef = useRef<{
    kind: 'line' | 'rect' | 'ellipse';
    start: Point;
    end: Point;
    color: RGBA;
    secondary: RGBA;
  } | null>(null);

  const actions = usePaintActions(setActiveTool, zoomRef, setZoom);
  const {
    docs,
    activeDocId,
    docSize,
    layersRef,
    layersVersion,
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
    openNewDocument,
    commitFloatingSelection,
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
  } = actions;

  const redrawDisplay = useCallback(() => {
    const canvas = displayCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const floating = floatingRef.current
      ? { activeLayerId, item: floatingRef.current }
      : null;

    compositeLayers(layersRef.current, ctx, canvas.width, canvas.height, undefined, floating);

    const preview = previewShapeRef.current;
    if (preview) {
      drawShape(
        ctx,
        preview.kind,
        preview.start,
        preview.end,
        preview.color,
        preview.secondary,
        toolOptions.brushSize,
        toolOptions.shapeMode,
        toolOptions.lineArrow,
      );
    }
  }, [activeLayerId, floatingRef, layersRef, toolOptions.brushSize, toolOptions.lineArrow, toolOptions.shapeMode]);

  useEffect(() => {
    initDefaultDocument();
    try {
      const saved = localStorage.getItem(LAYOUT_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as {
          files?: PanelLayout;
          colors?: PanelLayout;
          layers?: PanelLayout;
          showTabStrip?: boolean;
          showTabThumbs?: boolean;
        };
        if (parsed.files) setFilesLayout(parsed.files);
        if (parsed.colors) setColorsLayout(parsed.colors);
        if (parsed.layers) setLayersLayout(parsed.layers);
        if (typeof parsed.showTabStrip === 'boolean') setShowTabStrip(parsed.showTabStrip);
        if (typeof parsed.showTabThumbs === 'boolean') setShowTabThumbs(parsed.showTabThumbs);
      }
    } catch {
      // ignore storage errors
    }
  }, [initDefaultDocument]);

  const lastExampleSeqRef = useRef(0);
  useEffect(() => {
    if (!exampleRequest || exampleRequest.seq === lastExampleSeqRef.current) return;
    lastExampleSeqRef.current = exampleRequest.seq;
    const { runtime, docName } = buildPaintExampleRuntime(exampleRequest.id);
    openNewDocument(runtime, docName, true);
  }, [exampleRequest, openNewDocument]);

  useEffect(() => {
    try {
      localStorage.setItem(
        LAYOUT_STORAGE_KEY,
        JSON.stringify({
          files: filesLayout,
          colors: colorsLayout,
          layers: layersLayout,
          showTabStrip,
          showTabThumbs,
        }),
      );
    } catch {
      // ignore
    }
  }, [filesLayout, colorsLayout, layersLayout, showTabStrip, showTabThumbs]);

  useEffect(() => {
    redrawDisplay();
  }, [docSize.width, docSize.height, layersVersion, redrawDisplay]);

  const recordRecentColor = useCallback((c: RGBA) => {
    setRecentColors((prev) => {
      const exists = prev.some((p) => p.r === c.r && p.g === c.g && p.b === c.b && p.a === c.a);
      return exists ? prev : [c, ...prev].slice(0, 12);
    });
  }, []);

  const handleFitZoom = useCallback(() => {
    fitZoom(docSize.width, docSize.height);
  }, [docSize.height, docSize.width, fitZoom]);

  // Global keyboard shortcuts, arrow-key 1px selection nudge, and clipboard Ctrl+V paste
  useEffect(() => {
    const onPaste = async (e: ClipboardEvent) => {
      if (isEditableElement(e.target)) return;
      e.preventDefault();
      const fromEvent = await readImageFromPasteEvent(e);
      if (fromEvent) {
        pasteCanvasAsFloatingSelection(fromEvent);
        return;
      }
      await handlePasteAction();
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !isEditableElement(e.target)) setSpacePressed(true);
      if (isEditableElement(e.target) || modal !== null) return;

      const mod = e.ctrlKey || e.metaKey;

      // Arrow keys move active / pasted selection 1 px at a time (Shift+Arrow = 10 px)
      if (!mod && !e.altKey && selection && selection.w > 0 && selection.h > 0) {
        const step = e.shiftKey ? 10 : 1;
        if (e.key === 'ArrowLeft') { e.preventDefault(); nudgeActiveSelection(-step, 0); return; }
        if (e.key === 'ArrowRight') { e.preventDefault(); nudgeActiveSelection(step, 0); return; }
        if (e.key === 'ArrowUp') { e.preventDefault(); nudgeActiveSelection(0, -step); return; }
        if (e.key === 'ArrowDown') { e.preventDefault(); nudgeActiveSelection(0, step); return; }
      }

      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) handleRedo();
        else handleUndo();
        return;
      }
      if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); handleRedo(); return; }
      if (mod && e.key.toLowerCase() === 'c') { e.preventDefault(); void handleCopy(true); return; }
      if (mod && e.key.toLowerCase() === 'x') {
        e.preventDefault();
        if (e.shiftKey) handleCropToSelection();
        else void handleCut();
        return;
      }
      if (mod && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        if (floatingRef.current) commitFloatingSelection(false, false);
        setSelection({ x: 0, y: 0, w: docSize.width, h: docSize.height });
        return;
      }
      if (mod && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        commitFloatingSelection(true, Boolean(floatingRef.current));
        return;
      }
      if (mod && e.key === '0') { e.preventDefault(); handleFitZoom(); return; }
      if (mod && e.key === '1') { e.preventDefault(); setZoom(1); return; }
      if (mod && (e.key === '=' || e.key === '+')) {
        e.preventDefault();
        setZoom((z) => Math.round(z * 1.25 * 100) / 100);
        return;
      }
      if (mod && e.key === '-') {
        e.preventDefault();
        setZoom((z) => Math.round((z / 1.25) * 100) / 100);
        return;
      }
      if (e.key === 'F6') { e.preventDefault(); setFilesLayout((p) => ({ ...p, visible: !p.visible })); return; }
      if (e.key === 'F7') { e.preventDefault(); setLayersLayout((p) => ({ ...p, visible: !p.visible })); return; }
      if (e.key === 'F8') { e.preventDefault(); setColorsLayout((p) => ({ ...p, visible: !p.visible })); return; }
      if (e.key === 'Escape') {
        commitFloatingSelection(true, Boolean(floatingRef.current));
        setCropRect(null);
        setTextDraft(null);
        return;
      }
      if (e.key === 'Enter') {
        if (floatingRef.current) {
          e.preventDefault();
          commitFloatingSelection(true, true);
          return;
        }
        if (activeTool === 'crop' && cropRect) {
          e.preventDefault();
          applyCropRect(cropRect);
          return;
        }
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && (selection || floatingRef.current)) {
        e.preventDefault();
        handleClearSelection();
        return;
      }
      if (mod || e.altKey) return;

      switch (e.key.toLowerCase()) {
        case 's': setActiveTool('select'); break;
        case 'm': setActiveTool('move'); break;
        case 'c': handleActivateCrop(); break;
        case 'b': setActiveTool('brush'); break;
        case 'p': setActiveTool('pencil'); break;
        case 'e': setActiveTool('eraser'); break;
        case 'f': setActiveTool('fill'); break;
        case 'k': setActiveTool('picker'); break;
        case 'l': setActiveTool('line'); break;
        case 'r': setActiveTool('rect'); break;
        case 'o': setActiveTool('ellipse'); break;
        case 't': setActiveTool('text'); break;
        case 'h': setActiveTool('pan'); break;
        case 'x': setPrimary(secondary); setSecondary(primary); break;
        case 'd': setPrimary(BLACK); setSecondary(WHITE); break;
        case '[': setToolOptions((o) => ({ ...o, brushSize: Math.max(1, o.brushSize - 2) })); break;
        case ']': setToolOptions((o) => ({ ...o, brushSize: Math.min(150, o.brushSize + 2) })); break;
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') setSpacePressed(false);
    };

    window.addEventListener('paste', onPaste);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('paste', onPaste);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [
    activeTool,
    applyCropRect,
    commitFloatingSelection,
    cropRect,
    docSize.height,
    docSize.width,
    floatingRef,
    handleActivateCrop,
    handleClearSelection,
    handleCopy,
    handleCropToSelection,
    handleCut,
    handleFitZoom,
    handlePasteAction,
    handleRedo,
    handleUndo,
    modal,
    nudgeActiveSelection,
    pasteCanvasAsFloatingSelection,
    primary,
    secondary,
    selection,
    setCropRect,
    setSelection,
    setZoom,
  ]);

  const getCanvasPoint = (e: React.PointerEvent | PointerEvent): Point => {
    const canvas = displayCanvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * docSize.width,
      y: ((e.clientY - rect.top) / rect.height) * docSize.height,
    };
  };

  const pickColorAt = (pt: Point, isSecondary: boolean) => {
    const x = Math.max(0, Math.min(docSize.width - 1, Math.floor(pt.x)));
    const y = Math.max(0, Math.min(docSize.height - 1, Math.floor(pt.y)));
    const src = toolOptions.sampleAllLayers ? displayCanvasRef.current : getActiveLayer()?.canvas;
    if (!src) return;
    const ctx = src.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    const px = ctx.getImageData(x, y, 1, 1).data;
    const sampled: RGBA = { r: px[0], g: px[1], b: px[2], a: px[3] };
    if (isSecondary) setSecondary(sampled);
    else setPrimary(sampled);
    recordRecentColor(sampled);
  };

  const commitTextDraft = () => {
    if (!textDraft) return;
    const trimmed = textDraft.value.trim();
    const layer = getActiveLayer();
    if (trimmed && layer) {
      const ctx = layer.canvas.getContext('2d');
      if (ctx) {
        ctx.save();
        if (selection && selection.w > 0 && selection.h > 0) {
          ctx.beginPath();
          ctx.rect(selection.x, selection.y, selection.w, selection.h);
          ctx.clip();
        }
        ctx.font = `${toolOptions.fontItalic ? 'italic ' : ''}${toolOptions.fontBold ? '700 ' : '400 '}${toolOptions.fontSize}px ${toolOptions.fontFamily}`;
        ctx.fillStyle = rgbaToCss(primary);
        ctx.textBaseline = 'top';
        ctx.fillText(trimmed, textDraft.x, textDraft.y);
        ctx.restore();
        recordRecentColor(primary);
        commitLayers('Text', [...layersRef.current], layer.id);
      }
    }
    setTextDraft(null);
  };

  const handleCanvasPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0 && e.button !== 2 && e.button !== 1) return;
    e.preventDefault();

    const pt = getCanvasPoint(e);
    setCursorPos({ x: Math.floor(pt.x), y: Math.floor(pt.y) });

    if (activeTool === 'pan' || spacePressed || e.button === 1) {
      const vp = viewportRef.current;
      if (!vp) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      dragRef.current = {
        mode: 'pan',
        start: pt,
        last: pt,
        color: primary,
        secondaryColor: secondary,
        panStartScroll: { x: vp.scrollLeft, y: vp.scrollTop },
        panStartClient: { x: e.clientX, y: e.clientY },
      };
      return;
    }

    const useSecondary = e.button === 2;
    const drawColor = useSecondary ? secondary : primary;
    const altColor = useSecondary ? primary : secondary;

    // Floating pasted/lifted selection interaction:
    // - Clicking INSIDE moves it smoothly (with Move or Select tool)
    // - Clicking OUTSIDE commits it into the active layer and clears selection!
    if (floatingRef.current && selection) {
      const inside = isPointInRect(pt, selection);
      if (inside && (activeTool === 'move' || activeTool === 'select')) {
        e.currentTarget.setPointerCapture(e.pointerId);
        dragRef.current = {
          mode: 'move-floating',
          start: pt,
          last: pt,
          color: drawColor,
          secondaryColor: altColor,
          origFloatingPos: { x: floatingRef.current.x, y: floatingRef.current.y },
        };
        return;
      }
      // Clicked outside (or started using a drawing/other tool): stamp onto active layer & remove selection!
      commitFloatingSelection(true, true);
      if (activeTool === 'move' || activeTool === 'select') {
        return;
      }
    }

    if (activeTool === 'picker') {
      pickColorAt(pt, useSecondary);
      return;
    }

    if (activeTool === 'text') {
      if (textDraft) commitTextDraft();
      setTextDraft({ x: Math.round(pt.x), y: Math.round(pt.y), value: '' });
      return;
    }

    if (activeTool === 'select') {
      e.currentTarget.setPointerCapture(e.pointerId);
      dragRef.current = { mode: 'select', start: pt, last: pt, color: drawColor, secondaryColor: altColor };
      setSelection({ x: Math.round(pt.x), y: Math.round(pt.y), w: 0, h: 0 });
      return;
    }

    if (activeTool === 'crop') {
      e.currentTarget.setPointerCapture(e.pointerId);
      dragRef.current = { mode: 'crop-new', start: pt, last: pt, color: drawColor, secondaryColor: altColor };
      setCropRect({ x: Math.round(pt.x), y: Math.round(pt.y), w: 0, h: 0 });
      return;
    }

    const layer = getActiveLayer();
    if (!layer || !layer.visible) return;

    if (activeTool === 'fill') {
      const ctx = layer.canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;
      const img = ctx.getImageData(0, 0, layer.canvas.width, layer.canvas.height);
      const changed = floodFillBuffer(
        img.data,
        layer.canvas.width,
        layer.canvas.height,
        pt.x,
        pt.y,
        drawColor,
        toolOptions.fillTolerance,
        selection,
      );
      if (changed) {
        ctx.putImageData(img, 0, 0);
        recordRecentColor(drawColor);
        commitLayers('Fill', [...layersRef.current], layer.id);
      }
      return;
    }

    e.currentTarget.setPointerCapture(e.pointerId);

    if (activeTool === 'move') {
      // If a marquee selection exists and user drags inside it with Move tool, lift selected pixels!
      if (selection && selection.w > 0 && selection.h > 0) {
        if (isPointInRect(pt, selection)) {
          const lifted = liftSelectionToFloating();
          if (lifted) {
            dragRef.current = {
              mode: 'move-floating',
              start: pt,
              last: pt,
              color: drawColor,
              secondaryColor: altColor,
              origFloatingPos: { x: lifted.x, y: lifted.y },
            };
            return;
          }
        } else {
          setSelection(null);
          return;
        }
      }

      const snap = createCanvas(layer.canvas.width, layer.canvas.height);
      const sCtx = snap.getContext('2d');
      if (sCtx) sCtx.drawImage(layer.canvas, 0, 0);
      dragRef.current = {
        mode: 'move-layer',
        start: pt,
        last: pt,
        color: drawColor,
        secondaryColor: altColor,
        moveSnapshot: snap,
      };
      return;
    }

    if (activeTool === 'line' || activeTool === 'rect' || activeTool === 'ellipse') {
      dragRef.current = { mode: 'shape', start: pt, last: pt, color: drawColor, secondaryColor: altColor };
      previewShapeRef.current = { kind: activeTool, start: pt, end: pt, color: drawColor, secondary: altColor };
      return;
    }

    // Brush / Pencil / Eraser
    dragRef.current = { mode: 'draw', start: pt, last: pt, color: drawColor, secondaryColor: altColor };
    const ctx = layer.canvas.getContext('2d');
    if (ctx) {
      ctx.save();
      if (selection && selection.w > 0 && selection.h > 0) {
        ctx.beginPath();
        ctx.rect(selection.x, selection.y, selection.w, selection.h);
        ctx.clip();
      }
      if (activeTool === 'pencil') {
        drawPixelLine(ctx, pt, pt, toolOptions.brushSize, drawColor);
      } else {
        drawBrushSegment(
          ctx,
          pt,
          pt,
          toolOptions.brushSize,
          toolOptions.brushHardness,
          drawColor,
          toolOptions.brushOpacity,
          activeTool === 'eraser',
        );
      }
      ctx.restore();
      redrawDisplay();
    }
  };

  const handleCanvasPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const pt = getCanvasPoint(e);
    setCursorPos({ x: Math.floor(pt.x), y: Math.floor(pt.y) });

    const drag = dragRef.current;
    if (!drag) return;

    if (drag.mode === 'pan') {
      const vp = viewportRef.current;
      if (vp && drag.panStartScroll && drag.panStartClient) {
        vp.scrollLeft = drag.panStartScroll.x - (e.clientX - drag.panStartClient.x);
        vp.scrollTop = drag.panStartScroll.y - (e.clientY - drag.panStartClient.y);
      }
      return;
    }

    if (drag.mode === 'move-floating' && floatingRef.current && drag.origFloatingPos) {
      const nx = Math.round(drag.origFloatingPos.x + (pt.x - drag.start.x));
      const ny = Math.round(drag.origFloatingPos.y + (pt.y - drag.start.y));
      floatingRef.current.x = nx;
      floatingRef.current.y = ny;
      setSelection({ x: nx, y: ny, w: floatingRef.current.w, h: floatingRef.current.h });
      redrawDisplay();
      return;
    }

    if (drag.mode === 'select') {
      const rect = e.shiftKey
        ? constrainRectAspect(drag.start.x, drag.start.y, pt.x, pt.y, 1)
        : normalizeRect(drag.start.x, drag.start.y, pt.x, pt.y);
      setSelection(clampRect(rect, docSize.width, docSize.height));
      return;
    }

    if (drag.mode === 'crop-new') {
      const aspect = parseAspectRatio(toolOptions.cropAspect);
      setCropRect(clampRect(constrainRectAspect(drag.start.x, drag.start.y, pt.x, pt.y, aspect), docSize.width, docSize.height));
      return;
    }

    const layer = getActiveLayer();
    if (!layer) return;

    if (drag.mode === 'move-layer' && drag.moveSnapshot) {
      const ctx = layer.canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, layer.canvas.width, layer.canvas.height);
        ctx.drawImage(drag.moveSnapshot, Math.round(pt.x - drag.start.x), Math.round(pt.y - drag.start.y));
        redrawDisplay();
      }
      return;
    }

    if (drag.mode === 'shape' && previewShapeRef.current) {
      let endPt = pt;
      if (e.shiftKey) {
        if (previewShapeRef.current.kind === 'line') {
          endPt = snapAnglePoint(drag.start, pt, 15);
        } else {
          const dx = pt.x - drag.start.x;
          const dy = pt.y - drag.start.y;
          const side = Math.max(Math.abs(dx), Math.abs(dy));
          endPt = { x: drag.start.x + Math.sign(dx || 1) * side, y: drag.start.y + Math.sign(dy || 1) * side };
        }
      }
      previewShapeRef.current = { ...previewShapeRef.current, end: endPt };
      redrawDisplay();
      return;
    }

    if (drag.mode === 'draw') {
      const ctx = layer.canvas.getContext('2d');
      if (ctx) {
        ctx.save();
        if (selection && selection.w > 0 && selection.h > 0) {
          ctx.beginPath();
          ctx.rect(selection.x, selection.y, selection.w, selection.h);
          ctx.clip();
        }
        if (activeTool === 'pencil') {
          drawPixelLine(ctx, drag.last, pt, toolOptions.brushSize, drag.color);
        } else {
          drawBrushSegment(
            ctx,
            drag.last,
            pt,
            toolOptions.brushSize,
            toolOptions.brushHardness,
            drag.color,
            toolOptions.brushOpacity,
            activeTool === 'eraser',
          );
        }
        ctx.restore();
        drag.last = pt;
        redrawDisplay();
      }
    }
  };

  const handleCanvasPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = null;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* ignore */ }

    if (drag.mode === 'select') {
      setSelection((prev) => (prev && prev.w >= 2 && prev.h >= 2 ? prev : null));
      return;
    }
    if (drag.mode === 'move-floating') return;

    const layer = getActiveLayer();
    if (!layer) return;

    if (drag.mode === 'shape' && previewShapeRef.current) {
      const shape = previewShapeRef.current;
      previewShapeRef.current = null;
      const ctx = layer.canvas.getContext('2d');
      if (ctx) {
        ctx.save();
        if (selection && selection.w > 0 && selection.h > 0) {
          ctx.beginPath();
          ctx.rect(selection.x, selection.y, selection.w, selection.h);
          ctx.clip();
        }
        drawShape(ctx, shape.kind, shape.start, shape.end, shape.color, shape.secondary, toolOptions.brushSize, toolOptions.shapeMode, toolOptions.lineArrow);
        ctx.restore();
      }
      recordRecentColor(shape.color);
      commitLayers(`Draw ${shape.kind}`, [...layersRef.current], layer.id);
      return;
    }

    if (drag.mode === 'draw' || drag.mode === 'move-layer') {
      if (drag.mode === 'draw' && activeTool !== 'eraser') recordRecentColor(drag.color);
      commitLayers(drag.mode === 'move-layer' ? 'Move Layer' : 'Stroke', [...layersRef.current], layer.id);
    }
  };

  const handleCropHandleDown = (handle: CropHandle, e: React.PointerEvent<HTMLDivElement>) => {
    if (!cropRect || e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    const startPt = getCanvasPoint(e);
    const orig = { ...cropRect };

    const onMove = (ev: PointerEvent) => {
      const cur = getCanvasPoint(ev);
      const dx = Math.round(cur.x - startPt.x);
      const dy = Math.round(cur.y - startPt.y);
      let { x, y, w, h } = orig;
      if (handle === 'move') {
        x = Math.max(0, Math.min(docSize.width - w, orig.x + dx));
        y = Math.max(0, Math.min(docSize.height - h, orig.y + dy));
      } else {
        if (handle.includes('w')) { const nx = Math.max(0, Math.min(orig.x + orig.w - 4, orig.x + dx)); w = orig.x + orig.w - nx; x = nx; }
        if (handle.includes('e')) w = Math.max(4, Math.min(docSize.width - orig.x, orig.w + dx));
        if (handle.includes('n')) { const ny = Math.max(0, Math.min(orig.y + orig.h - 4, orig.y + dy)); h = orig.y + orig.h - ny; y = ny; }
        if (handle.includes('s')) h = Math.max(4, Math.min(docSize.height - orig.y, orig.h + dy));
      }
      setCropRect({ x, y, w, h });
    };

    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  const openFilePicker = (asLayer: boolean) => {
    openAsLayerRef.current = asLayer;
    fileInputRef.current?.click();
  };

  const togglePanel = (panel: PanelId) => {
    if (panel === 'files') setFilesLayout((cur) => ({ ...cur, visible: !cur.visible }));
    else if (panel === 'colors') setColorsLayout((cur) => ({ ...cur, visible: !cur.visible }));
    else setLayersLayout((cur) => ({ ...cur, visible: !cur.visible }));
  };

  const focusPanel = (panel: PanelId) => {
    zCounterRef.current += 1;
    const z = zCounterRef.current;
    if (panel === 'files') setFilesLayout((p) => ({ ...p, zIndex: z }));
    else if (panel === 'colors') setColorsLayout((p) => ({ ...p, zIndex: z }));
    else setLayersLayout((p) => ({ ...p, zIndex: z }));
  };

  const renderPanel = (id: PanelId) => {
    if (id === 'files') {
      return (
        <DockablePanel
          key="files"
          id="files"
          title={t('paint.panel.files')}
          layout={filesLayout}
          workspaceRef={workspaceRef}
          onChangeLayout={(patch) => setFilesLayout((p) => ({ ...p, ...patch }))}
          onFocus={() => focusPanel('files')}
          onDragSnapPreview={setSnapPreview}
        >
          <FileBrowserPanel
            docs={docs}
            activeDocId={activeDocId}
            showTabStrip={showTabStrip}
            onSelectDoc={actions.handleSelectDoc}
            onRenameDoc={actions.handleRenameDoc}
            onDuplicateDoc={actions.handleDuplicateDoc}
            onTogglePin={actions.handleTogglePinDoc}
            onCloseDoc={actions.handleCloseDoc}
            onQuickNewDoc={actions.handleQuickNewDoc}
            onOpenFiles={() => openFilePicker(false)}
            onToggleTabStrip={() => setShowTabStrip((v) => !v)}
          />
        </DockablePanel>
      );
    }
    if (id === 'colors') {
      return (
        <DockablePanel
          key="colors"
          id="colors"
          title={t('paint.panel.colors')}
          layout={colorsLayout}
          workspaceRef={workspaceRef}
          onChangeLayout={(patch) => setColorsLayout((p) => ({ ...p, ...patch }))}
          onFocus={() => focusPanel('colors')}
          onDragSnapPreview={setSnapPreview}
        >
          <ColorPickerPanel
            primary={primary}
            secondary={secondary}
            activeSlot={activeColorSlot}
            recentColors={recentColors}
            onSelectSlot={setActiveColorSlot}
            onChangePrimary={setPrimary}
            onChangeSecondary={setSecondary}
            onSwap={() => { setPrimary(secondary); setSecondary(primary); }}
            onResetBW={() => { setPrimary(BLACK); setSecondary(WHITE); }}
          />
        </DockablePanel>
      );
    }
    return (
      <DockablePanel
        key="layers"
        id="layers"
        title={t('paint.panel.layers')}
        layout={layersLayout}
        workspaceRef={workspaceRef}
        onChangeLayout={(patch) => setLayersLayout((p) => ({ ...p, ...patch }))}
        onFocus={() => focusPanel('layers')}
        onDragSnapPreview={setSnapPreview}
      >
        <LayersPanel
          layers={layersRef.current}
          activeLayerId={activeLayerId}
          renderTick={layersVersion}
          onSelectLayer={actions.handleSelectLayer}
          onAddLayer={actions.handleAddLayer}
          onDuplicateLayer={actions.handleDuplicateLayer}
          onDeleteLayer={actions.handleDeleteLayer}
          onMoveLayer={actions.handleMoveLayer}
          onMergeDown={actions.handleMergeDown}
          onFlatten={actions.handleFlatten}
          onClearLayer={actions.handleClearLayer}
          onToggleVisibility={actions.handleToggleVisibility}
          onRenameLayer={actions.handleRenameLayer}
          onChangeOpacity={actions.handleChangeOpacity}
          onChangeBlendMode={actions.handleChangeBlendMode}
        />
      </DockablePanel>
    );
  };

  const leftDocked: PanelId[] = [];
  const rightDocked: PanelId[] = [];
  const floatingPanels: PanelId[] = [];
  for (const [id, layout] of [
    ['files', filesLayout],
    ['colors', colorsLayout],
    ['layers', layersLayout],
  ] as const) {
    if (!layout.visible) continue;
    if (layout.dock === 'left') leftDocked.push(id);
    else if (layout.dock === 'right') rightDocked.push(id);
    else floatingPanels.push(id);
  }

  const activeDoc = docs.find((d) => d.id === activeDocId);

  const canvasCursor =
    activeTool === 'pan' || spacePressed
      ? 'grab'
      : activeTool === 'move' || (hasFloatingSelection && activeTool === 'select')
        ? 'move'
        : activeTool === 'text'
          ? 'text'
          : 'crosshair';

  return (
    <div
      className={styles.studio}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => { e.preventDefault(); void actions.handleFiles(e.dataTransfer.files, false); }}
    >
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*,.img.json,.paint.json,application/json"
        className={styles.srOnly}
        onChange={(e) => { void actions.handleFiles(e.target.files, openAsLayerRef.current); e.target.value = ''; }}
      />

      <TopCommandBar
        canUndo={historyState.canUndo || hasFloatingSelection}
        canRedo={historyState.canRedo}
        hasSelection={Boolean(selection && selection.w > 0 && selection.h > 0)}
        filesLayout={filesLayout}
        colorsLayout={colorsLayout}
        layersLayout={layersLayout}
        showTabStrip={showTabStrip}
        showPixelGrid={showPixelGrid}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onOpenModal={setModal}
        onOpenFile={openFilePicker}
        onLoadSample={actions.handleLoadSample}
        onCopy={(merged) => void handleCopy(merged)}
        onPaste={() => void handlePasteAction()}
        onActivateCrop={handleActivateCrop}
        onCropToSelection={handleCropToSelection}
        onTogglePanel={togglePanel}
        onToggleTabStrip={() => setShowTabStrip((v) => !v)}
        onResetPanels={() => {
          setFilesLayout(DEFAULT_FILES_LAYOUT);
          setColorsLayout(DEFAULT_COLORS_LAYOUT);
          setLayersLayout(DEFAULT_LAYERS_LAYOUT);
          setShowTabStrip(true);
          setShowTabThumbs(true);
        }}
        onTogglePixelGrid={() => setShowPixelGrid((v) => !v)}
      />

      {showTabStrip && (
        <ImageTabStrip
          docs={docs}
          activeDocId={activeDocId}
          showThumbnails={showTabThumbs}
          fileBrowserVisible={filesLayout.visible}
          onSelectDoc={actions.handleSelectDoc}
          onRenameDoc={actions.handleRenameDoc}
          onDuplicateDoc={actions.handleDuplicateDoc}
          onTogglePin={actions.handleTogglePinDoc}
          onCloseDoc={actions.handleCloseDoc}
          onQuickNewDoc={actions.handleQuickNewDoc}
          onOpenFiles={() => openFilePicker(false)}
          onToggleThumbnails={() => setShowTabThumbs((v) => !v)}
          onToggleFileBrowser={() => togglePanel('files')}
        />
      )}

      <ToolOptionsBar
        activeTool={activeTool}
        options={toolOptions}
        cropRect={cropRect}
        selection={selection}
        onChangeOptions={(patch) => setToolOptions((cur) => ({ ...cur, ...patch }))}
        onApplyCrop={() => cropRect && applyCropRect(cropRect)}
        onCancelCrop={() => setCropRect(null)}
        onSelectAll={() => {
          if (floatingRef.current) commitFloatingSelection(false, false);
          setSelection({ x: 0, y: 0, w: docSize.width, h: docSize.height });
        }}
        onClearSelection={handleClearSelection}
        onDeselect={() => commitFloatingSelection(true, Boolean(floatingRef.current))}
        onCropToSelection={handleCropToSelection}
      />

      <div ref={workspaceRef} className={styles.workspaceBody}>
        <LeftToolStrip
          activeTool={activeTool}
          onSelectTool={(tool) => {
            if (tool !== 'move' && tool !== 'select' && floatingRef.current) {
              commitFloatingSelection(true, true);
            }
            if (tool === 'crop') handleActivateCrop();
            else {
              setActiveTool(tool);
              if (cropRect) setCropRect(null);
            }
          }}
        />

        {leftDocked.length > 0 && (
          <div className={styles.dockColumn} data-testid="paint-dock-left">
            {leftDocked.map(renderPanel)}
          </div>
        )}

        <CanvasViewport
          viewportRef={viewportRef}
          displayCanvasRef={displayCanvasRef}
          docSize={docSize}
          zoom={zoom}
          showPixelGrid={showPixelGrid}
          activeTool={activeTool}
          canvasCursor={canvasCursor}
          selection={selection}
          hasFloatingSelection={hasFloatingSelection}
          cropRect={cropRect}
          textDraft={textDraft}
          toolOptions={toolOptions}
          primaryColor={primary}
          onCanvasPointerDown={handleCanvasPointerDown}
          onCanvasPointerMove={handleCanvasPointerMove}
          onCanvasPointerUp={handleCanvasPointerUp}
          onCanvasPointerLeave={() => setCursorPos(null)}
          onCropHandleDown={handleCropHandleDown}
          onChangeTextDraft={setTextDraft}
          onCommitTextDraft={commitTextDraft}
        />

        {rightDocked.length > 0 && (
          <div className={styles.dockColumn} data-testid="paint-dock-right">
            {rightDocked.map(renderPanel)}
          </div>
        )}

        {floatingPanels.map(renderPanel)}

        {snapPreview === 'left' && (
          <div className={[styles.snapZone, styles.snapZoneLeft].join(' ')} aria-hidden="true">
            <span>{t('paint.panel.dropDockLeft')}</span>
          </div>
        )}
        {snapPreview === 'right' && (
          <div className={[styles.snapZone, styles.snapZoneRight].join(' ')} aria-hidden="true">
            <span>{t('paint.panel.dropDockRight')}</span>
          </div>
        )}
      </div>

      <StatusBar
        docSize={docSize}
        cursorPos={cursorPos}
        selection={selection}
        statusMsg={statusMsg}
        zoom={zoom}
        onZoomChange={setZoom}
        onFitZoom={handleFitZoom}
      />

      <TransformModals
        modal={modal}
        activeDocName={activeDoc?.name}
        canvasWidth={docSize.width}
        canvasHeight={docSize.height}
        onClose={() => setModal(null)}
        onNewCanvas={actions.handleNewCanvas}
        onResize={(w, h, q) => actions.handleResize(w, h, q, false)}
        onScaleDown={(w, h, q) => actions.handleResize(w, h, q, true)}
        onCanvasSize={actions.handleCanvasSize}
        onRotate={actions.handleRotate}
        onFlip={actions.handleFlip}
        onApplyColorStyle={actions.handleApplyColorStyle}
        onApplyAdjustments={actions.handleApplyAdjustments}
        onApplyQuickFilter={actions.handleApplyQuickFilter}
        onExportImage={actions.handleExportImage}
        onSaveProject={actions.handleSaveProject}
      />
    </div>
  );
}
