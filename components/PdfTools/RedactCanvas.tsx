import type { PDFDocumentProxy } from 'pdfjs-dist';
import React from 'react';

import { renderPage } from '../../lib/pdf/pdfjs';
import type { RedactBox } from '../../lib/pdf/redact';
import styles from '../../styles/PdfRedact.module.css';

type HandleDir = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

interface BoxRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface RedactCanvasProps {
  doc: PDFDocumentProxy | null;
  pageIndex: number;
  boxes: RedactBox[];
  selectedId: string | null;
  previewFinal: boolean;
  fillColor: string;
  overlayText: string;
  overlayTextColor: string;
  onSelect: (id: string | null) => void;
  onAddBox: (box: Omit<RedactBox, 'id'>) => void;
  onUpdateBox: (id: string, rect: BoxRect, commit: boolean) => void;
  onDeleteBox: (id: string) => void;
}

const MIN_SPAN = 0.008;

const HANDLES: Array<{ dir: HandleDir; className: string; label: string }> = [
  { dir: 'nw', className: styles.handleNw, label: 'Resize top-left corner' },
  { dir: 'n', className: styles.handleN, label: 'Resize top edge' },
  { dir: 'ne', className: styles.handleNe, label: 'Resize top-right corner' },
  { dir: 'e', className: styles.handleE, label: 'Resize right edge' },
  { dir: 'se', className: styles.handleSe, label: 'Resize bottom-right corner' },
  { dir: 's', className: styles.handleS, label: 'Resize bottom edge' },
  { dir: 'sw', className: styles.handleSw, label: 'Resize bottom-left corner' },
  { dir: 'w', className: styles.handleW, label: 'Resize left edge' },
];

type DragState =
  | {
      kind: 'draw';
      pointerId: number;
      startX: number;
      startY: number;
      moved: boolean;
    }
  | {
      kind: 'move';
      pointerId: number;
      id: string;
      startX: number;
      startY: number;
      orig: BoxRect;
      last: BoxRect;
      moved: boolean;
    }
  | {
      kind: 'resize';
      pointerId: number;
      id: string;
      dir: HandleDir;
      startX: number;
      startY: number;
      orig: BoxRect;
      last: BoxRect;
      moved: boolean;
    };

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function moveBox(orig: BoxRect, dx: number, dy: number): BoxRect {
  const x = clamp(orig.x + dx, 0, Math.max(0, 1 - orig.width));
  const y = clamp(orig.y + dy, 0, Math.max(0, 1 - orig.height));
  return { x, y, width: orig.width, height: orig.height };
}

function resizeBox(orig: BoxRect, dir: HandleDir, dx: number, dy: number): BoxRect {
  let left = orig.x;
  let top = orig.y;
  let right = orig.x + orig.width;
  let bottom = orig.y + orig.height;

  if (dir.includes('w')) left = clamp(orig.x + dx, 0, right - MIN_SPAN);
  if (dir.includes('e')) right = clamp(orig.x + orig.width + dx, left + MIN_SPAN, 1);
  if (dir.includes('n')) top = clamp(orig.y + dy, 0, bottom - MIN_SPAN);
  if (dir.includes('s')) bottom = clamp(orig.y + orig.height + dy, top + MIN_SPAN, 1);

  return {
    x: left,
    y: top,
    width: Math.max(MIN_SPAN, right - left),
    height: Math.max(MIN_SPAN, bottom - top),
  };
}

export function RedactCanvas({
  doc,
  pageIndex,
  boxes,
  selectedId,
  previewFinal,
  fillColor,
  overlayText,
  overlayTextColor,
  onSelect,
  onAddBox,
  onUpdateBox,
  onDeleteBox,
}: RedactCanvasProps) {
  const stageRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const overlayRef = React.useRef<HTMLDivElement | null>(null);
  const dragRef = React.useRef<DragState | null>(null);

  const [stageWidth, setStageWidth] = React.useState(620);
  const [renderWidth, setRenderWidth] = React.useState(620);
  const [pageSize, setPageSize] = React.useState<{ width: number; height: number } | null>(null);
  const [rendering, setRendering] = React.useState(false);
  const [renderError, setRenderError] = React.useState<string | null>(null);
  const [draftRect, setDraftRect] = React.useState<BoxRect | null>(null);

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
        setPageSize({ width: baseVp.width, height: baseVp.height });

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
  }, [doc, pageIndex, renderWidth]);

  React.useEffect(
    () => () => {
      if (canvasRef.current) {
        canvasRef.current.width = 0;
        canvasRef.current.height = 0;
      }
    },
    [],
  );

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

    if (drag.kind === 'draw') {
      const x = Math.min(drag.startX, pt.x);
      const y = Math.min(drag.startY, pt.y);
      const width = Math.abs(pt.x - drag.startX);
      const height = Math.abs(pt.y - drag.startY);
      if (width >= 0.003 || height >= 0.003) drag.moved = true;
      setDraftRect({ x, y, width, height });
    } else if (drag.kind === 'move') {
      const next = moveBox(drag.orig, pt.x - drag.startX, pt.y - drag.startY);
      drag.last = next;
      drag.moved = true;
      onUpdateBox(drag.id, next, false);
    } else if (drag.kind === 'resize') {
      const next = resizeBox(drag.orig, drag.dir, pt.x - drag.startX, pt.y - drag.startY);
      drag.last = next;
      drag.moved = true;
      onUpdateBox(drag.id, next, false);
    }
  };

  const endDrag = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    dragRef.current = null;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // Ignore pointer capture errors when already released.
    }

    if (drag.kind === 'draw') {
      const pt = clientToNorm(e.clientX, e.clientY);
      setDraftRect(null);
      if (pt) {
        const x = Math.min(drag.startX, pt.x);
        const y = Math.min(drag.startY, pt.y);
        const width = Math.abs(pt.x - drag.startX);
        const height = Math.abs(pt.y - drag.startY);
        if (width >= MIN_SPAN && height >= MIN_SPAN) {
          onAddBox({
            pageIndex,
            x,
            y,
            width,
            height,
            source: 'manual',
          });
          return;
        }
      }
      if (!drag.moved) onSelect(null);
    } else if (drag.moved) {
      onUpdateBox(drag.id, drag.last, true);
    }
  };

  const handleOverlayPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const pt = clientToNorm(e.clientX, e.clientY);
    if (!pt) return;
    e.preventDefault();
    overlayRef.current?.setPointerCapture(e.pointerId);
    dragRef.current = {
      kind: 'draw',
      pointerId: e.pointerId,
      startX: pt.x,
      startY: pt.y,
      moved: false,
    };
    setDraftRect({ x: pt.x, y: pt.y, width: 0, height: 0 });
  };

  const handleBoxPointerDown = (box: RedactBox) => (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const pt = clientToNorm(e.clientX, e.clientY);
    if (!pt) return;
    e.preventDefault();
    onSelect(box.id);
    e.currentTarget.focus();
    e.currentTarget.setPointerCapture(e.pointerId);
    const orig = { x: box.x, y: box.y, width: box.width, height: box.height };
    dragRef.current = {
      kind: 'move',
      pointerId: e.pointerId,
      id: box.id,
      startX: pt.x,
      startY: pt.y,
      orig,
      last: orig,
      moved: false,
    };
  };

  const handleHandlePointerDown = (box: RedactBox, dir: HandleDir) => (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const pt = clientToNorm(e.clientX, e.clientY);
    if (!pt) return;
    e.preventDefault();
    onSelect(box.id);
    e.currentTarget.setPointerCapture(e.pointerId);
    const orig = { x: box.x, y: box.y, width: box.width, height: box.height };
    dragRef.current = {
      kind: 'resize',
      pointerId: e.pointerId,
      id: box.id,
      dir,
      startX: pt.x,
      startY: pt.y,
      orig,
      last: orig,
      moved: false,
    };
  };

  const handleBoxKeyDown = (box: RedactBox) => (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      onDeleteBox(box.id);
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      onSelect(null);
      return;
    }
    const step = e.shiftKey ? 0.02 : 0.004;
    let dx = 0;
    let dy = 0;
    if (e.key === 'ArrowLeft') dx = -step;
    else if (e.key === 'ArrowRight') dx = step;
    else if (e.key === 'ArrowUp') dy = -step;
    else if (e.key === 'ArrowDown') dy = step;
    else return;

    e.preventDefault();
    const orig = { x: box.x, y: box.y, width: box.width, height: box.height };
    const next = e.altKey ? resizeBox(orig, dx !== 0 ? 'e' : 's', dx, dy) : moveBox(orig, dx, dy);
    onUpdateBox(box.id, next, true);
  };

  const cssDisplayW = pageSize ? Math.min(stageWidth, Math.min(pageSize.width * 2, 820)) : undefined;
  const cssDisplayH =
    pageSize && cssDisplayW ? (cssDisplayW / Math.max(1, pageSize.width)) * pageSize.height : undefined;

  const pct = (v: number) => `${(v * 100).toFixed(4)}%`;
  const trimmedLabel = overlayText.trim();

  return (
    <div ref={stageRef} className={styles.stage}>
      <div
        className={styles.canvasWrap}
        style={cssDisplayW && cssDisplayH ? { width: `${cssDisplayW}px`, height: `${cssDisplayH}px` } : undefined}
      >
        <canvas
          ref={canvasRef}
          className={styles.canvas}
          style={cssDisplayW && cssDisplayH ? { width: `${cssDisplayW}px`, height: `${cssDisplayH}px` } : undefined}
        />

        {pageSize && (
          <div
            ref={overlayRef}
            className={styles.overlay}
            onPointerDown={handleOverlayPointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          >
            {boxes.map((box, idx) => {
              const isSelected = box.id === selectedId;
              const boxPxH = cssDisplayH ? box.height * cssDisplayH : 18;
              const labelFontPx = Math.max(7, Math.min(28, Math.floor(boxPxH * 0.6)));
              return (
                <div
                  key={box.id}
                  role="region"
                  tabIndex={0}
                  aria-label={`Redaction box ${idx + 1}${box.matchedText ? ` (${box.matchedText})` : ''}. Use arrow keys to nudge, Shift+arrows for larger steps, Delete to remove.`}
                  className={[
                    styles.box,
                    previewFinal ? styles.boxPreviewFinal : '',
                    isSelected ? styles.boxSelected : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  style={{
                    left: pct(box.x),
                    top: pct(box.y),
                    width: pct(box.width),
                    height: pct(box.height),
                    backgroundColor: previewFinal ? fillColor : undefined,
                  }}
                  onPointerDown={handleBoxPointerDown(box)}
                  onPointerMove={handlePointerMove}
                  onPointerUp={endDrag}
                  onPointerCancel={endDrag}
                  onKeyDown={handleBoxKeyDown(box)}
                >
                  {previewFinal && trimmedLabel && (
                    <span
                      className={styles.boxFinalLabel}
                      style={{ color: overlayTextColor, fontSize: `${labelFontPx}px` }}
                    >
                      {trimmedLabel}
                    </span>
                  )}

                  {isSelected && (
                    <>
                      <button
                        type="button"
                        className={styles.boxDeleteBtn}
                        aria-label="Remove redaction box"
                        title="Remove redaction box (Delete)"
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteBox(box.id);
                        }}
                      >
                        &times;
                      </button>
                      {HANDLES.map((h) => (
                        <div
                          key={h.dir}
                          role="slider"
                          aria-label={h.label}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-valuenow={Math.round(
                            (h.dir.includes('w')
                              ? box.x
                              : h.dir.includes('e')
                                ? box.x + box.width
                                : h.dir.includes('n')
                                  ? box.y
                                  : box.y + box.height) * 100,
                          )}
                          className={[styles.handle, h.className].join(' ')}
                          onPointerDown={handleHandlePointerDown(box, h.dir)}
                          onPointerMove={handlePointerMove}
                          onPointerUp={endDrag}
                          onPointerCancel={endDrag}
                        />
                      ))}
                    </>
                  )}
                </div>
              );
            })}

            {draftRect && draftRect.width > 0 && draftRect.height > 0 && (
              <div
                className={styles.boxDraft}
                style={{
                  left: pct(draftRect.x),
                  top: pct(draftRect.y),
                  width: pct(draftRect.width),
                  height: pct(draftRect.height),
                }}
              />
            )}
          </div>
        )}

        {rendering && <div className={styles.loadingBadge}>Rendering page…</div>}
        {renderError && !rendering && <div className={styles.loadingBadge}>{renderError}</div>}
      </div>
    </div>
  );
}
