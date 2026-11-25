import type { PDFDocumentProxy } from 'pdfjs-dist';
import React from 'react';

import { renderPage } from '../../lib/pdf/pdfjs';
import type { SignaturePlacement, SignatureTextFont } from '../../lib/pdf/sign';
import {
  clampPan,
  clampZoom,
  computePinchZoom,
  computeRenderScale,
  computeZoomedPan,
  MAX_SIGN_ZOOM,
  MIN_SIGN_ZOOM,
  PanOffset,
  stepZoom,
} from '../../lib/pdf/signViewport';
import { useI18n } from '../../lib/ui/i18n';
import type { TranslationKey } from '../../lib/ui/translations';
import styles from '../../styles/PdfTools.module.css';
import signStyles from '../../styles/PdfSign.module.css';

type CornerHandle = 'nw' | 'ne' | 'se' | 'sw';

export interface ArmedPlacementHint {
  label: string;
}

interface SignCanvasProps {
  doc: PDFDocumentProxy | null;
  pageIndex: number;
  placements: SignaturePlacement[];
  assetPreviews: Record<string, string>;
  selectedId: string | null;
  armedHint: ArmedPlacementHint | null;
  onSelect: (id: string | null) => void;
  onPlaceAt: (normX: number, normY: number) => void;
  onLiveChange: (id: string, patch: Partial<SignaturePlacement>) => void;
  onCommitChange: (id: string, patch: Partial<SignaturePlacement>) => void;
  onDelete: (id: string) => void;
  onCancelArm?: () => void;
  onPageSize?: (size: { width: number; height: number }) => void;
  fullscreenTopSlot?: React.ReactNode;
  fullscreenBottomSlot?: React.ReactNode;
}

type DragState =
  | {
      kind: 'move';
      id: string;
      pointerId: number;
      startClientX: number;
      startClientY: number;
      origLeft: number;
      origTop: number;
      width: number;
      height: number;
      moved: boolean;
    }
  | {
      kind: 'resize';
      id: string;
      corner: CornerHandle;
      pointerId: number;
      startClientX: number;
      startClientY: number;
      origLeft: number;
      origTop: number;
      origWidth: number;
      origHeight: number;
      origFontSize?: number;
      placementKind: 'image' | 'text';
      moved: boolean;
    };

interface PanGesture {
  pointerId: number;
  startClientX: number;
  startClientY: number;
  origPan: PanOffset;
  moved: boolean;
  placeOnTap: boolean;
  selectClearOnTap: boolean;
}

interface PinchGesture {
  startDist: number;
  startZoom: number;
  startPan: PanOffset;
  startMidX: number;
  startMidY: number;
}

const CORNERS: Array<{ corner: CornerHandle; className: string; labelKey: TranslationKey }> = [
  { corner: 'nw', className: styles.signHandleNw, labelKey: 'pdf.canvas.resizeNw' },
  { corner: 'ne', className: styles.signHandleNe, labelKey: 'pdf.canvas.resizeNe' },
  { corner: 'se', className: styles.signHandleSe, labelKey: 'pdf.canvas.resizeSe' },
  { corner: 'sw', className: styles.signHandleSw, labelKey: 'pdf.canvas.resizeSw' },
];

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function cssFontStyle(font?: SignatureTextFont): React.CSSProperties {
  switch (font) {
    case 'helvetica-bold':
      return { fontFamily: 'Helvetica, Arial, sans-serif', fontWeight: 700, fontStyle: 'normal' };
    case 'times':
      return { fontFamily: "'Times New Roman', Georgia, serif", fontWeight: 400, fontStyle: 'normal' };
    case 'times-italic':
      return { fontFamily: "'Times New Roman', Georgia, serif", fontWeight: 400, fontStyle: 'italic' };
    case 'courier':
      return { fontFamily: "'Courier New', Courier, monospace", fontWeight: 400, fontStyle: 'normal' };
    case 'helvetica':
    default:
      return { fontFamily: 'Helvetica, Arial, sans-serif', fontWeight: 400, fontStyle: 'normal' };
  }
}

export function SignCanvas({
  doc,
  pageIndex,
  placements,
  assetPreviews,
  selectedId,
  armedHint,
  onSelect,
  onPlaceAt,
  onLiveChange,
  onCommitChange,
  onDelete,
  onCancelArm,
  onPageSize,
  fullscreenTopSlot,
  fullscreenBottomSlot,
}: SignCanvasProps) {
  const { t } = useI18n();
  const stageRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const overlayRef = React.useRef<HTMLDivElement | null>(null);
  const dragRef = React.useRef<DragState | null>(null);
  const latestPatchRef = React.useRef<{ id: string; patch: Partial<SignaturePlacement> } | null>(null);

  const stagePointersRef = React.useRef<Map<number, { x: number; y: number }>>(new Map());
  const panGestureRef = React.useRef<PanGesture | null>(null);
  const pinchRef = React.useRef<PinchGesture | null>(null);

  const [stageSize, setStageSize] = React.useState<{ width: number; height: number }>({
    width: 620,
    height: 620,
  });
  const [zoom, setZoom] = React.useState(1);
  const [pan, setPan] = React.useState<PanOffset>({ x: 0, y: 0 });
  const [panMode, setPanMode] = React.useState(false);
  const [isPanning, setIsPanning] = React.useState(false);
  const [fullscreen, setFullscreen] = React.useState(false);

  const [renderTargetWidth, setRenderTargetWidth] = React.useState(620);
  const [overlayCssSize, setOverlayCssSize] = React.useState<{ width: number; height: number }>({
    width: 600,
    height: 800,
  });
  const [pageSize, setPageSize] = React.useState<{ width: number; height: number } | null>(null);
  const [rendering, setRendering] = React.useState(false);
  const [renderError, setRenderError] = React.useState<string | null>(null);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editingText, setEditingText] = React.useState('');

  const zoomRef = React.useRef(zoom);
  zoomRef.current = zoom;
  const panRef = React.useRef(pan);
  panRef.current = pan;

  const pagePlacements = React.useMemo(
    () => placements.filter((p) => p.pageIndex === pageIndex),
    [placements, pageIndex],
  );

  // Stop inline edit if selection leaves or page changes.
  React.useEffect(() => {
    if (editingId && editingId !== selectedId) {
      setEditingId(null);
    }
  }, [selectedId, editingId]);

  React.useEffect(() => {
    setEditingId(null);
    setPan({ x: 0, y: 0 });
  }, [pageIndex]);

  // Lock body scroll and support Escape to exit full screen.
  React.useEffect(() => {
    if (!fullscreen) return undefined;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !armedHint && !editingId) {
        e.preventDefault();
        setFullscreen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [fullscreen, armedHint, editingId]);

  // Measure the stage box (updates on resize and fullscreen transitions).
  React.useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const measure = () => {
      const style = window.getComputedStyle(el);
      const padX = (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0);
      const padY = (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0);
      const innerW = Math.max(180, Math.floor(el.clientWidth - padX));
      const innerH = Math.max(220, Math.floor(el.clientHeight - padY));
      setStageSize((prev) =>
        Math.abs(prev.width - innerW) > 2 || Math.abs(prev.height - innerH) > 2
          ? { width: innerW, height: innerH }
          : prev,
      );
    };
    measure();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [fullscreen]);

  // Base fit size at zoom = 1.
  const baseCssWidth = React.useMemo(() => {
    if (!pageSize) return Math.min(stageSize.width, 620);
    if (fullscreen) {
      const fitScale = Math.min(
        stageSize.width / Math.max(1, pageSize.width),
        stageSize.height / Math.max(1, pageSize.height),
      );
      return Math.max(160, Math.round(pageSize.width * fitScale));
    }
    return Math.max(180, Math.round(Math.min(stageSize.width, 820, pageSize.width * 2)));
  }, [pageSize, stageSize, fullscreen]);

  const baseCssHeight = React.useMemo(() => {
    if (!pageSize) return 420;
    return Math.max(120, Math.round((baseCssWidth * pageSize.height) / Math.max(1, pageSize.width)));
  }, [pageSize, baseCssWidth]);

  const displayWidth = Math.max(120, Math.round(baseCssWidth * zoom));
  const displayHeight = Math.max(90, Math.round(baseCssHeight * zoom));

  const clampCurrentPan = React.useCallback(
    (nextPan: PanOffset, nextZoom: number): PanOffset => {
      const w = baseCssWidth * nextZoom;
      const h = baseCssHeight * nextZoom;
      return clampPan(nextPan, w, h, stageSize.width, stageSize.height, 48);
    },
    [baseCssWidth, baseCssHeight, stageSize.width, stageSize.height],
  );

  // Re-clamp pan when viewport size or zoom changes.
  React.useEffect(() => {
    setPan((prev) => clampCurrentPan(prev, zoom));
  }, [zoom, clampCurrentPan]);

  React.useEffect(() => {
    const el = overlayRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      if (r.width > 10 && r.height > 10) {
        setOverlayCssSize({ width: r.width, height: r.height });
      }
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [pageSize, displayWidth, displayHeight]);

  React.useEffect(() => {
    const timer = setTimeout(() => setRenderTargetWidth(displayWidth), 140);
    return () => clearTimeout(timer);
  }, [displayWidth]);

  React.useEffect(() => {
    let cancelled = false;
    if (!doc) {
      setPageSize(null);
      setRendering(false);
      if (canvasRef.current) {
        canvasRef.current.width = 0;
        canvasRef.current.height = 0;
      }
      return;
    }

    const pageNum = clamp(pageIndex + 1, 1, doc.numPages);
    setRendering(true);
    setRenderError(null);

    (async () => {
      let page: Awaited<ReturnType<PDFDocumentProxy['getPage']>> | null = null;
      let offscreen: HTMLCanvasElement | null = null;
      try {
        page = await doc.getPage(pageNum);
        if (cancelled) return;
        const baseVp = page.getViewport({ scale: 1 });
        const size = { width: baseVp.width, height: baseVp.height };
        setPageSize(size);
        onPageSize?.(size);

        const dpr = Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1, 2.5);
        const renderScale = computeRenderScale(renderTargetWidth, baseVp.width, baseVp.height, dpr, 2400);

        offscreen = await renderPage(page, renderScale);
        if (cancelled) return;

        const target = canvasRef.current;
        if (target) {
          target.width = offscreen.width;
          target.height = offscreen.height;
          const ctx = target.getContext('2d');
          if (ctx) ctx.drawImage(offscreen, 0, 0);
        }
      } catch (e) {
        if (!cancelled) setRenderError(e instanceof Error ? e.message : String(e));
      } finally {
        if (offscreen) {
          offscreen.width = 0;
          offscreen.height = 0;
        }
        try {
          page?.cleanup();
        } catch {
          // Ignore cleanup errors on closed document.
        }
        if (!cancelled) setRendering(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [doc, pageIndex, renderTargetWidth, onPageSize]);

  const ptToPx = pageSize ? overlayCssSize.width / Math.max(1, pageSize.width) : 1;
  const isZoomed = zoom > 1.01;
  const canDragPan = panMode || isZoomed || fullscreen;

  function applyZoomAt(nextZoomRaw: number, focalClient?: { x: number; y: number }) {
    const oldZoom = zoomRef.current;
    const nextZoom = clampZoom(nextZoomRaw);
    if (Math.abs(nextZoom - oldZoom) < 0.001) return;

    const stage = stageRef.current;
    let nextPan = panRef.current;
    if (stage && focalClient) {
      const rect = stage.getBoundingClientRect();
      nextPan = computeZoomedPan(
        panRef.current,
        { x: focalClient.x - rect.left, y: focalClient.y - rect.top },
        { x: rect.width / 2, y: rect.height / 2 },
        oldZoom,
        nextZoom,
      );
    } else if (nextZoom <= 1) {
      nextPan = { x: 0, y: 0 };
    }

    setZoom(nextZoom);
    setPan(clampCurrentPan(nextPan, nextZoom));
  }

  function resetView() {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }

  function handleStageWheel(e: React.WheelEvent<HTMLDivElement>) {
    if (!e.ctrlKey && !e.metaKey && !fullscreen) return;
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    applyZoomAt(zoomRef.current * factor, { x: e.clientX, y: e.clientY });
  }

  function handleStagePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.button !== 0 && e.pointerType === 'mouse') return;

    stagePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    // Two active pointers anywhere on the stage initiate pinch-to-zoom + two-finger pan.
    if (stagePointersRef.current.size === 2) {
      const pts = Array.from(stagePointersRef.current.values());
      const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
      pinchRef.current = {
        startDist: Math.max(10, dist),
        startZoom: zoomRef.current,
        startPan: panRef.current,
        startMidX: (pts[0].x + pts[1].x) / 2,
        startMidY: (pts[0].y + pts[1].y) / 2,
      };
      panGestureRef.current = null;
      dragRef.current = null;
      setIsPanning(true);
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }

    if (stagePointersRef.current.size > 2) return;

    // Single-pointer interaction on background or while in explicit Pan mode.
    const onOverlayBg = e.target === overlayRef.current;
    const onStageBg = e.target === stageRef.current;
    if (!panMode && !onOverlayBg && !onStageBg) return;

    if (panMode || onOverlayBg || onStageBg) {
      const shouldPan = panMode || isZoomed || (fullscreen && !armedHint);
      if (shouldPan) {
        panGestureRef.current = {
          pointerId: e.pointerId,
          startClientX: e.clientX,
          startClientY: e.clientY,
          origPan: panRef.current,
          moved: false,
          placeOnTap: !panMode && onOverlayBg && Boolean(armedHint),
          selectClearOnTap: !panMode && (onOverlayBg || onStageBg) && !armedHint,
        };
        if (panMode) setIsPanning(true);
        e.currentTarget.setPointerCapture(e.pointerId);
        return;
      }

      if (onOverlayBg && armedHint) {
        const rect = overlayRef.current?.getBoundingClientRect();
        if (!rect || rect.width <= 0 || rect.height <= 0) return;
        e.preventDefault();
        const nx = clamp((e.clientX - rect.left) / rect.width, 0, 1);
        const ny = clamp((e.clientY - rect.top) / rect.height, 0, 1);
        onPlaceAt(nx, ny);
      } else if (onOverlayBg || onStageBg) {
        onSelect(null);
        setEditingId(null);
      }
    }
  }

  function handleStagePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (stagePointersRef.current.has(e.pointerId)) {
      stagePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }

    // Pinch-to-zoom + two-finger pan
    if (pinchRef.current && stagePointersRef.current.size >= 2) {
      e.preventDefault();
      const pts = Array.from(stagePointersRef.current.values());
      const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
      const midX = (pts[0].x + pts[1].x) / 2;
      const midY = (pts[0].y + pts[1].y) / 2;
      const pinch = pinchRef.current;
      const nextZoom = computePinchZoom(pinch.startZoom, pinch.startDist, dist);
      const stage = stageRef.current;
      let nextPan = pinch.startPan;
      if (stage) {
        const rect = stage.getBoundingClientRect();
        const zoomedPan = computeZoomedPan(
          pinch.startPan,
          { x: pinch.startMidX - rect.left, y: pinch.startMidY - rect.top },
          { x: rect.width / 2, y: rect.height / 2 },
          pinch.startZoom,
          nextZoom,
        );
        nextPan = {
          x: zoomedPan.x + (midX - pinch.startMidX),
          y: zoomedPan.y + (midY - pinch.startMidY),
        };
      }
      setZoom(nextZoom);
      setPan(clampCurrentPan(nextPan, nextZoom));
      return;
    }

    // Single-pointer pan
    const pg = panGestureRef.current;
    if (!pg || pg.pointerId !== e.pointerId) return;
    const dx = e.clientX - pg.startClientX;
    const dy = e.clientY - pg.startClientY;
    if (!pg.moved && Math.hypot(dx, dy) < 6) return;
    pg.moved = true;
    setIsPanning(true);
    e.preventDefault();
    setPan(clampCurrentPan({ x: pg.origPan.x + dx, y: pg.origPan.y + dy }, zoomRef.current));
  }

  function handleStagePointerEnd(e: React.PointerEvent<HTMLDivElement>) {
    stagePointersRef.current.delete(e.pointerId);

    if (stagePointersRef.current.size < 2 && pinchRef.current) {
      pinchRef.current = null;
      setIsPanning(false);
    }

    const pg = panGestureRef.current;
    if (pg && pg.pointerId === e.pointerId) {
      panGestureRef.current = null;
      setIsPanning(false);
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // Ignore if already released.
      }
      if (!pg.moved) {
        if (pg.placeOnTap) {
          const rect = overlayRef.current?.getBoundingClientRect();
          if (rect && rect.width > 0 && rect.height > 0) {
            const nx = clamp((e.clientX - rect.left) / rect.width, 0, 1);
            const ny = clamp((e.clientY - rect.top) / rect.height, 0, 1);
            onPlaceAt(nx, ny);
          }
        } else if (pg.selectClearOnTap) {
          onSelect(null);
          setEditingId(null);
        }
      }
    }
  }

  function beginInlineEdit(p: SignaturePlacement) {
    if (p.kind !== 'text') return;
    setEditingId(p.id);
    setEditingText(p.text);
  }

  function finishInlineEdit(p: SignaturePlacement, commit: boolean) {
    setEditingId(null);
    if (!commit || p.kind !== 'text') return;
    const next = editingText.trim();
    if (!next) {
      onDelete(p.id);
    } else if (next !== p.text) {
      onCommitChange(p.id, { text: next });
    }
  }

  function startMove(e: React.PointerEvent<HTMLDivElement>, p: SignaturePlacement) {
    if (panMode || stagePointersRef.current.size >= 1) return;
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    if (editingId === p.id) return;
    e.stopPropagation();
    e.preventDefault();
    onSelect(p.id);
    dragRef.current = {
      kind: 'move',
      id: p.id,
      pointerId: e.pointerId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      origLeft: p.left,
      origTop: p.top,
      width: p.width,
      height: p.height,
      moved: false,
    };
    latestPatchRef.current = null;
    e.currentTarget.setPointerCapture(e.pointerId);
    e.currentTarget.focus({ preventScroll: true });
  }

  function startResize(e: React.PointerEvent<HTMLDivElement>, p: SignaturePlacement, corner: CornerHandle) {
    if (panMode || stagePointersRef.current.size >= 1) return;
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    e.stopPropagation();
    e.preventDefault();
    onSelect(p.id);
    setEditingId(null);
    dragRef.current = {
      kind: 'resize',
      id: p.id,
      corner,
      pointerId: e.pointerId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      origLeft: p.left,
      origTop: p.top,
      origWidth: p.width,
      origHeight: p.height,
      origFontSize: p.kind === 'text' ? p.fontSize : undefined,
      placementKind: p.kind,
      moved: false,
    };
    latestPatchRef.current = null;
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function handleDragMove(e: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    const overlay = overlayRef.current;
    if (!overlay) return;
    const rect = overlay.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const dxPx = e.clientX - drag.startClientX;
    const dyPx = e.clientY - drag.startClientY;
    if (!drag.moved && Math.hypot(dxPx, dyPx) < 2) return;
    drag.moved = true;

    if (drag.kind === 'move') {
      const dx = dxPx / rect.width;
      const dy = dyPx / rect.height;
      const left = clamp(drag.origLeft + dx, 0, Math.max(0, 1 - drag.width));
      const top = clamp(drag.origTop + dy, 0, Math.max(0, 1 - drag.height));
      const patch = { left, top };
      latestPatchRef.current = { id: drag.id, patch };
      onLiveChange(drag.id, patch);
      return;
    }

    const origX = drag.origLeft * rect.width;
    const origY = drag.origTop * rect.height;
    const origW = drag.origWidth * rect.width;
    const origH = drag.origHeight * rect.height;
    const minPxW = 28;
    const minPxH = 16;

    const signX = drag.corner === 'ne' || drag.corner === 'se' ? 1 : -1;
    const signY = drag.corner === 'sw' || drag.corner === 'se' ? 1 : -1;

    const anchorX = signX > 0 ? origX : origX + origW;
    const anchorY = signY > 0 ? origY : origY + origH;

    const maxAvailW = signX > 0 ? rect.width - anchorX : anchorX;
    const maxAvailH = signY > 0 ? rect.height - anchorY : anchorY;

    let newW = clamp(origW + signX * dxPx, minPxW, Math.max(minPxW, maxAvailW));
    let newH = clamp(origH + signY * dyPx, minPxH, Math.max(minPxH, maxAvailH));

    if (drag.placementKind === 'image') {
      const aspect = origW / Math.max(1, origH);
      const scaleW = newW / Math.max(1, origW);
      const scaleH = newH / Math.max(1, origH);
      const chosenScale = Math.abs(scaleW - 1) >= Math.abs(scaleH - 1) ? scaleW : scaleH;
      newW = origW * chosenScale;
      newH = origH * chosenScale;

      if (newW > maxAvailW) {
        newW = maxAvailW;
        newH = newW / aspect;
      }
      if (newH > maxAvailH) {
        newH = maxAvailH;
        newW = newH * aspect;
      }
      if (newW < minPxW) {
        newW = minPxW;
        newH = newW / aspect;
      }
      if (newH < minPxH) {
        newH = minPxH;
        newW = newH * aspect;
      }
    }

    const newX = signX > 0 ? anchorX : anchorX - newW;
    const newY = signY > 0 ? anchorY : anchorY - newH;

    const patch: Partial<SignaturePlacement> = {
      left: clamp(newX / rect.width, 0, 1),
      top: clamp(newY / rect.height, 0, 1),
      width: clamp(newW / rect.width, 0.01, 1),
      height: clamp(newH / rect.height, 0.01, 1),
    };

    if (drag.placementKind === 'text' && typeof drag.origFontSize === 'number') {
      const ratio = newH / Math.max(1, origH);
      (patch as Partial<{ fontSize: number }>).fontSize =
        Math.round(clamp(drag.origFontSize * ratio, 6, 144) * 2) / 2;
    }

    latestPatchRef.current = { id: drag.id, patch };
    onLiveChange(drag.id, patch);
  }

  function handleDragEnd(e: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    dragRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // Ignore release errors.
    }
    if (drag.moved && latestPatchRef.current) {
      const { id, patch } = latestPatchRef.current;
      latestPatchRef.current = null;
      onCommitChange(id, patch);
    }
  }

  function handlePlacementKeyDown(e: React.KeyboardEvent<HTMLDivElement>, p: SignaturePlacement) {
    if (editingId === p.id) return;
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      onDelete(p.id);
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      if (armedHint) onCancelArm?.();
      else onSelect(null);
      return;
    }
    if (e.key === 'Enter' && p.kind === 'text') {
      e.preventDefault();
      beginInlineEdit(p);
      return;
    }

    const step = e.shiftKey ? 0.02 : 0.005;
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      onCommitChange(p.id, { left: clamp(p.left - step, 0, Math.max(0, 1 - p.width)) });
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      onCommitChange(p.id, { left: clamp(p.left + step, 0, Math.max(0, 1 - p.width)) });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      onCommitChange(p.id, { top: clamp(p.top - step, 0, Math.max(0, 1 - p.height)) });
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      onCommitChange(p.id, { top: clamp(p.top + step, 0, Math.max(0, 1 - p.height)) });
    }
  }

  const zoomPercent = Math.round(zoom * 100);
  const canResetView = Math.abs(zoom - 1) > 0.01 || Math.hypot(pan.x, pan.y) > 2;

  return (
    <div
      className={fullscreen ? signStyles.viewerShellFullscreen : signStyles.viewerShell}
      role={fullscreen ? 'dialog' : undefined}
      aria-modal={fullscreen || undefined}
      aria-label={fullscreen ? t('pdf.canvas.fullscreenViewerAria') : undefined}
    >
      <div className={signStyles.viewerBar} role="toolbar" aria-label={t('pdf.canvas.zoomPanToolbarAria')}>
        <div className={signStyles.viewerBarGroup}>
          {fullscreen && fullscreenTopSlot}
          <button
            type="button"
            className={signStyles.toolBtn}
            aria-label={t('pdf.canvas.zoomOut')}
            disabled={zoom <= MIN_SIGN_ZOOM + 0.01}
            onClick={() => applyZoomAt(stepZoom(zoom, 'out'))}
          >
            &minus;
          </button>
          <button
            type="button"
            className={signStyles.zoomReadout}
            title={t('pdf.canvas.zoomResetTitle')}
            aria-label={t('pdf.canvas.zoomResetAria', { pct: zoomPercent })}
            onClick={resetView}
          >
            {zoomPercent}%
          </button>
          <button
            type="button"
            className={signStyles.toolBtn}
            aria-label={t('pdf.canvas.zoomIn')}
            disabled={zoom >= MAX_SIGN_ZOOM - 0.01}
            onClick={() => applyZoomAt(stepZoom(zoom, 'in'))}
          >
            +
          </button>
          {canResetView && (
            <button type="button" className={signStyles.toolBtn} onClick={resetView}>
              {t('pdf.canvas.fit')}
            </button>
          )}
        </div>

        <div className={signStyles.viewerBarGroup}>
          <button
            type="button"
            className={[signStyles.toolBtn, panMode ? signStyles.toolBtnActive : ''].join(' ')}
            aria-pressed={panMode}
            title={t('pdf.canvas.panTitle')}
            onClick={() => setPanMode((v) => !v)}
          >
            {panMode ? t('pdf.canvas.panOn') : t('pdf.canvas.pan')}
          </button>
          <button
            type="button"
            className={[signStyles.toolBtn, fullscreen ? signStyles.toolBtnActive : ''].join(' ')}
            aria-pressed={fullscreen}
            onClick={() => {
              setFullscreen((v) => !v);
              setPan({ x: 0, y: 0 });
            }}
          >
            {fullscreen ? t('pdf.canvas.exitFullscreen') : t('pdf.canvas.fullscreen')}
          </button>
        </div>
      </div>

      <div
        ref={stageRef}
        className={[
          signStyles.panStage,
          canDragPan ? signStyles.panStageInteractive : '',
          !fullscreen && isZoomed ? signStyles.panStageZoomedInline : '',
          panMode ? (isPanning ? signStyles.panStageGrabbing : signStyles.panStageGrab) : '',
        ].join(' ')}
        onWheel={handleStageWheel}
        onPointerDown={handleStagePointerDown}
        onPointerMove={handleStagePointerMove}
        onPointerUp={handleStagePointerEnd}
        onPointerCancel={handleStagePointerEnd}
      >
        {armedHint && !panMode && (
          <div className={signStyles.stageArmedBanner}>
            {t('pdf.canvas.placeBanner', { label: armedHint.label })}
          </div>
        )}

        <div
          className={signStyles.panTransformWrap}
          style={{
            transform: `translate3d(${pan.x}px, ${pan.y}px, 0)`,
          }}
        >
          <div
            className={styles.previewWrap}
            style={{ width: displayWidth, minHeight: pageSize ? undefined : displayHeight }}
          >
            <canvas
              ref={canvasRef}
              className={styles.previewCanvas}
              style={{ width: displayWidth, height: pageSize ? displayHeight : 'auto' }}
            />

            {pageSize && (
              <div
                ref={overlayRef}
                className={[
                  styles.signOverlay,
                  armedHint && !panMode ? styles.signOverlayArmed : '',
                ].join(' ')}
              >

                {pagePlacements.map((p) => {
                  const selected = p.id === selectedId;
                  const isEditing = p.id === editingId;
                  const previewUrl = p.kind === 'image' ? assetPreviews[p.assetId] : undefined;
                  const textFontPx =
                    p.kind === 'text'
                      ? Math.max(
                          8,
                          (p.fontSize ??
                            Math.max(
                              8,
                              ((p.height * pageSize.height) / Math.max(1, p.text.split(/\r?\n/).length)) * 0.72,
                            )) * ptToPx,
                        )
                      : 14;

                  return (
                    <div
                      key={p.id}
                      tabIndex={panMode ? -1 : 0}
                      role="button"
                      aria-label={
                        p.kind === 'image'
                          ? t('pdf.canvas.placedSignatureAria')
                          : t('pdf.canvas.textStampAria', { text: p.text })
                      }
                      aria-pressed={selected}
                      className={[
                        styles.signBox,
                        selected ? styles.signBoxSelected : '',
                      ].join(' ')}
                      style={{
                        left: `${p.left * 100}%`,
                        top: `${p.top * 100}%`,
                        width: `${p.width * 100}%`,
                        height: `${p.height * 100}%`,
                        pointerEvents: panMode ? 'none' : undefined,
                      }}
                      onPointerDown={(e) => startMove(e, p)}
                      onPointerMove={handleDragMove}
                      onPointerUp={handleDragEnd}
                      onPointerCancel={handleDragEnd}
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        if (!panMode && p.kind === 'text') beginInlineEdit(p);
                      }}
                      onKeyDown={(e) => handlePlacementKeyDown(e, p)}
                    >
                      {p.kind === 'image' ? (
                        previewUrl ? (
                          <img
                            src={previewUrl}
                            alt=""
                            draggable={false}
                            className={styles.signBoxImg}
                            style={{ opacity: p.opacity ?? 1 }}
                          />
                        ) : (
                          <span className={styles.signBoxFallback}>{t('pdf.canvas.signatureFallback')}</span>
                        )
                      ) : isEditing ? (
                        <textarea
                          autoFocus
                          className={styles.signInlineInput}
                          value={editingText}
                          style={{
                            ...cssFontStyle(p.font),
                            color: p.color ?? '#111827',
                            fontSize: `${textFontPx}px`,
                          }}
                          onPointerDown={(e) => e.stopPropagation()}
                          onChange={(e) => setEditingText(e.target.value)}
                          onBlur={() => finishInlineEdit(p, true)}
                          onKeyDown={(e) => {
                            e.stopPropagation();
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault();
                              finishInlineEdit(p, true);
                            } else if (e.key === 'Escape') {
                              e.preventDefault();
                              finishInlineEdit(p, false);
                            }
                          }}
                        />
                      ) : (
                        <div
                          className={styles.signTextContent}
                          style={{
                            ...cssFontStyle(p.font),
                            color: p.color ?? '#111827',
                            opacity: p.opacity ?? 1,
                            fontSize: `${textFontPx}px`,
                          }}
                        >
                          {p.text}
                        </div>
                      )}

                      {selected && !isEditing && !panMode && (
                        <>
                          <div className={styles.signBoxActions} onPointerDown={(e) => e.stopPropagation()}>
                            {p.kind === 'text' && (
                              <button
                                type="button"
                                className={styles.signBoxActionBtn}
                                title={t('pdf.canvas.editTextTitle')}
                                onClick={() => beginInlineEdit(p)}
                              >
                                {t('pdf.canvas.edit')}
                              </button>
                            )}
                            <button
                              type="button"
                              className={[styles.signBoxActionBtn, styles.signBoxActionDanger].join(' ')}
                              title={t('pdf.canvas.removeTitle')}
                              aria-label={t('pdf.canvas.removePlacementAria')}
                              onClick={() => onDelete(p.id)}
                            >
                              &times;
                            </button>
                          </div>

                          {CORNERS.map((h) => (
                            <div
                              key={h.corner}
                              role="presentation"
                              aria-label={t(h.labelKey)}
                              className={[styles.signHandle, h.className].join(' ')}
                              onPointerDown={(e) => startResize(e, p, h.corner)}
                              onPointerMove={handleDragMove}
                              onPointerUp={handleDragEnd}
                              onPointerCancel={handleDragEnd}
                            />
                          ))}
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {rendering && <div className={styles.figureLoading}>{t('pdf.canvas.renderingPage')}</div>}
            {renderError && (
              <div className={styles.figureLoading}>
                {t('pdf.canvas.previewError', { error: renderError })}
              </div>
            )}
          </div>
        </div>
      </div>

      {fullscreen && fullscreenBottomSlot && (
        <div className={signStyles.viewerFooterBar}>{fullscreenBottomSlot}</div>
      )}
    </div>
  );
}
