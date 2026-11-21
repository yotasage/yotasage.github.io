import type { PDFDocumentProxy } from 'pdfjs-dist';
import React from 'react';

import type { NormalizedCropRect } from '../../lib/pdf/crop';
import { renderPage } from '../../lib/pdf/pdfjs';
import styles from '../../styles/PdfTools.module.css';

type HandleDir = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

interface CropCanvasProps {
  doc: PDFDocumentProxy | null;
  pageIndex: number;
  rect: NormalizedCropRect;
  onChange: (rect: NormalizedCropRect) => void;
  disabled?: boolean;
  onPageSize?: (size: { width: number; height: number }) => void;
}

const MIN_SPAN = 0.02;

const HANDLES: Array<{ dir: HandleDir; className: string; label: string }> = [
  { dir: 'nw', className: styles.cropHandleNw, label: 'Resize top-left corner' },
  { dir: 'n', className: styles.cropHandleN, label: 'Resize top edge' },
  { dir: 'ne', className: styles.cropHandleNe, label: 'Resize top-right corner' },
  { dir: 'e', className: styles.cropHandleE, label: 'Resize right edge' },
  { dir: 'se', className: styles.cropHandleSe, label: 'Resize bottom-right corner' },
  { dir: 's', className: styles.cropHandleS, label: 'Resize bottom edge' },
  { dir: 'sw', className: styles.cropHandleSw, label: 'Resize bottom-left corner' },
  { dir: 'w', className: styles.cropHandleW, label: 'Resize left edge' },
];

type DragState =
  | {
      kind: 'draw';
      pointerId: number;
      startX: number;
      startY: number;
    }
  | {
      kind: 'move';
      pointerId: number;
      startX: number;
      startY: number;
      orig: NormalizedCropRect;
    }
  | {
      kind: 'resize';
      pointerId: number;
      dir: HandleDir;
      startX: number;
      startY: number;
      orig: NormalizedCropRect;
    };

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function normalizeRect(r: NormalizedCropRect): NormalizedCropRect {
  const l = clamp(Math.min(r.left, r.right), 0, 1 - MIN_SPAN);
  const t = clamp(Math.min(r.top, r.bottom), 0, 1 - MIN_SPAN);
  const right = clamp(Math.max(r.left, r.right), l + MIN_SPAN, 1);
  const bottom = clamp(Math.max(r.top, r.bottom), t + MIN_SPAN, 1);
  return { left: l, top: t, right, bottom };
}

function moveRect(orig: NormalizedCropRect, dx: number, dy: number): NormalizedCropRect {
  const w = orig.right - orig.left;
  const h = orig.bottom - orig.top;
  const left = clamp(orig.left + dx, 0, Math.max(0, 1 - w));
  const top = clamp(orig.top + dy, 0, Math.max(0, 1 - h));
  return { left, top, right: left + w, bottom: top + h };
}

function resizeRect(orig: NormalizedCropRect, dir: HandleDir, dx: number, dy: number): NormalizedCropRect {
  let { left, top, right, bottom } = orig;
  if (dir.includes('w')) left = clamp(orig.left + dx, 0, orig.right - MIN_SPAN);
  if (dir.includes('e')) right = clamp(orig.right + dx, orig.left + MIN_SPAN, 1);
  if (dir.includes('n')) top = clamp(orig.top + dy, 0, orig.bottom - MIN_SPAN);
  if (dir.includes('s')) bottom = clamp(orig.bottom + dy, orig.top + MIN_SPAN, 1);
  return { left, top, right, bottom };
}

export function CropCanvas({
  doc,
  pageIndex,
  rect,
  onChange,
  disabled = false,
  onPageSize,
}: CropCanvasProps) {
  const stageRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const overlayRef = React.useRef<HTMLDivElement | null>(null);
  const boxRef = React.useRef<HTMLDivElement | null>(null);
  const dragRef = React.useRef<DragState | null>(null);

  const [stageWidth, setStageWidth] = React.useState(620);
  const [renderWidth, setRenderWidth] = React.useState(620);
  const [pageSize, setPageSize] = React.useState<{ width: number; height: number } | null>(null);
  const [rendering, setRendering] = React.useState(false);
  const [renderError, setRenderError] = React.useState<string | null>(null);

  const safeRect = normalizeRect(rect);

  React.useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const measure = () => {
      const style = window.getComputedStyle(el);
      const padX = (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0);
      const inner = Math.max(180, Math.floor(el.clientWidth - padX));
      setStageWidth((prev) => (Math.abs(prev - inner) > 2 ? inner : prev));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  React.useEffect(() => {
    const timer = setTimeout(() => setRenderWidth(stageWidth), 120);
    return () => clearTimeout(timer);
  }, [stageWidth]);

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

        const maxCssW = Math.min(renderWidth, 820);
        const displayScale = Math.min(maxCssW / Math.max(1, baseVp.width), 2);
        const dpr = Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1, 2.5);
        const renderScale = Math.max(0.25, displayScale * dpr);

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
          // Ignore cleanup errors on already-closed documents.
        }
        if (!cancelled) setRendering(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [doc, pageIndex, renderWidth, onPageSize]);

  React.useEffect(() => () => {
    if (canvasRef.current) {
      canvasRef.current.width = 0;
      canvasRef.current.height = 0;
    }
  }, []);

  const clientToNorm = React.useCallback((clientX: number, clientY: number): { x: number; y: number } | null => {
    const overlay = overlayRef.current;
    if (!overlay) return null;
    const bounds = overlay.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) return null;
    return {
      x: clamp((clientX - bounds.left) / bounds.width, 0, 1),
      y: clamp((clientY - bounds.top) / bounds.height, 0, 1),
    };
  }, []);

  const handlePointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    const pt = clientToNorm(e.clientX, e.clientY);
    if (!pt) return;
    e.preventDefault();

    if (drag.kind === 'move') {
      onChange(moveRect(drag.orig, pt.x - drag.startX, pt.y - drag.startY));
    } else if (drag.kind === 'resize') {
      onChange(resizeRect(drag.orig, drag.dir, pt.x - drag.startX, pt.y - drag.startY));
    } else if (drag.kind === 'draw') {
      const l = Math.min(drag.startX, pt.x);
      const r = Math.max(drag.startX, pt.x);
      const t = Math.min(drag.startY, pt.y);
      const b = Math.max(drag.startY, pt.y);
      if (r - l >= MIN_SPAN && b - t >= MIN_SPAN) {
        onChange({ left: l, top: t, right: r, bottom: b });
      }
    }
  };

  const endDrag = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    dragRef.current = null;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // Ignore release errors when pointer was already cancelled.
    }
  };

  const handleOverlayPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled || e.button !== 0) return;
    const pt = clientToNorm(e.clientX, e.clientY);
    if (!pt) return;
    e.preventDefault();
    overlayRef.current?.setPointerCapture(e.pointerId);
    dragRef.current = { kind: 'draw', pointerId: e.pointerId, startX: pt.x, startY: pt.y };
  };

  const handleBoxPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled || e.button !== 0) return;
    e.stopPropagation();
    const pt = clientToNorm(e.clientX, e.clientY);
    if (!pt) return;
    e.preventDefault();
    boxRef.current?.focus();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      kind: 'move',
      pointerId: e.pointerId,
      startX: pt.x,
      startY: pt.y,
      orig: safeRect,
    };
  };

  const handleHandlePointerDown = (dir: HandleDir) => (e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled || e.button !== 0) return;
    e.stopPropagation();
    const pt = clientToNorm(e.clientX, e.clientY);
    if (!pt) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      kind: 'resize',
      pointerId: e.pointerId,
      dir,
      startX: pt.x,
      startY: pt.y,
      orig: safeRect,
    };
  };

  const handleBoxKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    const step = e.shiftKey ? 0.02 : 0.005;
    let dx = 0;
    let dy = 0;
    if (e.key === 'ArrowLeft') dx = -step;
    else if (e.key === 'ArrowRight') dx = step;
    else if (e.key === 'ArrowUp') dy = -step;
    else if (e.key === 'ArrowDown') dy = step;
    else return;

    e.preventDefault();
    if (e.altKey) {
      // Alt+Arrow adjusts bottom/right edges directly for keyboard-only resizing.
      onChange(resizeRect(safeRect, dx !== 0 ? 'e' : 's', dx, dy));
    } else {
      onChange(moveRect(safeRect, dx, dy));
    }
  };

  const cssDisplayW = pageSize ? Math.min(stageWidth, Math.min(pageSize.width * 2, 820)) : undefined;
  const cssDisplayH = pageSize && cssDisplayW ? (cssDisplayW / Math.max(1, pageSize.width)) * pageSize.height : undefined;

  const pct = (v: number) => `${(v * 100).toFixed(4)}%`;

  return (
    <div ref={stageRef} className={styles.previewStage}>
      <div
        className={styles.previewWrap}
        style={cssDisplayW && cssDisplayH ? { width: `${cssDisplayW}px`, height: `${cssDisplayH}px` } : undefined}
      >
        <canvas
          ref={canvasRef}
          className={styles.previewCanvas}
          style={cssDisplayW && cssDisplayH ? { width: `${cssDisplayW}px`, height: `${cssDisplayH}px` } : undefined}
        />

        {pageSize && (
          <div
            ref={overlayRef}
            className={styles.cropOverlay}
            style={disabled ? { cursor: 'default' } : undefined}
            onPointerDown={handleOverlayPointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          >
            {!disabled && (
              <>
                <div
                  className={styles.cropMask}
                  style={{ left: 0, top: 0, right: 0, height: pct(safeRect.top) }}
                />
                <div
                  className={styles.cropMask}
                  style={{ left: 0, top: pct(safeRect.bottom), right: 0, bottom: 0 }}
                />
                <div
                  className={styles.cropMask}
                  style={{
                    left: 0,
                    top: pct(safeRect.top),
                    width: pct(safeRect.left),
                    height: pct(safeRect.bottom - safeRect.top),
                  }}
                />
                <div
                  className={styles.cropMask}
                  style={{
                    left: pct(safeRect.right),
                    top: pct(safeRect.top),
                    right: 0,
                    height: pct(safeRect.bottom - safeRect.top),
                  }}
                />
              </>
            )}

            <div
              ref={boxRef}
              role="region"
              tabIndex={disabled ? -1 : 0}
              aria-label="Crop selection. Use arrow keys to nudge, Shift+arrows for larger steps, Alt+arrows to resize."
              className={[styles.cropBox, disabled ? styles.cropBoxDisabled : ''].join(' ')}
              style={{
                left: pct(disabled ? 0 : safeRect.left),
                top: pct(disabled ? 0 : safeRect.top),
                width: pct(disabled ? 1 : safeRect.right - safeRect.left),
                height: pct(disabled ? 1 : safeRect.bottom - safeRect.top),
              }}
              onPointerDown={handleBoxPointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              onKeyDown={handleBoxKeyDown}
            >
              {!disabled && (
                <>
                  <div className={styles.cropGuideH} style={{ top: '33.333%' }} />
                  <div className={styles.cropGuideH} style={{ top: '66.666%' }} />
                  <div className={styles.cropGuideV} style={{ left: '33.333%' }} />
                  <div className={styles.cropGuideV} style={{ left: '66.666%' }} />
                  {HANDLES.map((h) => (
                    <div
                      key={h.dir}
                      role="slider"
                      aria-label={h.label}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={Math.round(
                        (h.dir.includes('w')
                          ? safeRect.left
                          : h.dir.includes('e')
                            ? safeRect.right
                            : h.dir.includes('n')
                              ? safeRect.top
                              : safeRect.bottom) * 100,
                      )}
                      className={[styles.cropHandle, h.className].join(' ')}
                      onPointerDown={handleHandlePointerDown(h.dir)}
                      onPointerMove={handlePointerMove}
                      onPointerUp={endDrag}
                      onPointerCancel={endDrag}
                    />
                  ))}
                </>
              )}
            </div>
          </div>
        )}

        {rendering && <div className={styles.figureLoading}>Rendering page…</div>}
        {renderError && !rendering && <div className={styles.figureLoading}>{renderError}</div>}
      </div>
    </div>
  );
}
