import type { PDFDocumentProxy } from 'pdfjs-dist';
import React from 'react';

import type { ViewportRect } from '../../lib/pdf/extractVectors';
import { renderPage } from '../../lib/pdf/pdfjs';
import { useI18n } from '../../lib/ui/i18n';
import type { TranslationKey } from '../../lib/ui/translations';
import styles from '../../styles/PdfTools.module.css';

export interface FigureBox {
  id: string;
  sourceId: string;
  pageIndex: number;
  rect: ViewportRect;
  label: string;
  auto?: boolean;
}

type HandleDir = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

interface FigureCanvasProps {
  doc: PDFDocumentProxy | null;
  sourceId: string;
  pageIndex: number;
  boxes: FigureBox[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onAddBox: (rect: ViewportRect) => void;
  onUpdateBox: (id: string, rect: ViewportRect) => void;
  onDeleteBox: (id: string) => void;
  onTightenBox: (id: string) => void;
  onPageSize?: (size: { width: number; height: number }) => void;
}

const MIN_BOX_PT = 8;

const HANDLES: Array<{ dir: HandleDir; className: string; labelKey: TranslationKey }> = [
  { dir: 'nw', className: styles.figureHandleNw, labelKey: 'pdf.canvas.resizeNw' },
  { dir: 'n', className: styles.figureHandleN, labelKey: 'pdf.canvas.resizeN' },
  { dir: 'ne', className: styles.figureHandleNe, labelKey: 'pdf.canvas.resizeNe' },
  { dir: 'e', className: styles.figureHandleE, labelKey: 'pdf.canvas.resizeE' },
  { dir: 'se', className: styles.figureHandleSe, labelKey: 'pdf.canvas.resizeSe' },
  { dir: 's', className: styles.figureHandleS, labelKey: 'pdf.canvas.resizeS' },
  { dir: 'sw', className: styles.figureHandleSw, labelKey: 'pdf.canvas.resizeSw' },
  { dir: 'w', className: styles.figureHandleW, labelKey: 'pdf.canvas.resizeW' },
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
      boxId: string;
      startX: number;
      startY: number;
      orig: ViewportRect;
    }
  | {
      kind: 'resize';
      pointerId: number;
      boxId: string;
      dir: HandleDir;
      startX: number;
      startY: number;
      orig: ViewportRect;
    };

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function clampRectToPage(rect: ViewportRect, pageW: number, pageH: number): ViewportRect {
  const maxW = Math.max(MIN_BOX_PT, pageW);
  const maxH = Math.max(MIN_BOX_PT, pageH);
  const w = clamp(rect.width, MIN_BOX_PT, maxW);
  const h = clamp(rect.height, MIN_BOX_PT, maxH);
  const x = clamp(rect.x, 0, Math.max(0, pageW - w));
  const y = clamp(rect.y, 0, Math.max(0, pageH - h));
  return { x, y, width: w, height: h };
}

function resizeRect(
  orig: ViewportRect,
  dir: HandleDir,
  dx: number,
  dy: number,
  pageW: number,
  pageH: number,
): ViewportRect {
  let left = orig.x;
  let right = orig.x + orig.width;
  let top = orig.y;
  let bottom = orig.y + orig.height;

  if (dir.includes('w')) {
    left = clamp(orig.x + dx, 0, right - MIN_BOX_PT);
  }
  if (dir.includes('e')) {
    right = clamp(orig.x + orig.width + dx, left + MIN_BOX_PT, pageW);
  }
  if (dir.includes('n')) {
    top = clamp(orig.y + dy, 0, bottom - MIN_BOX_PT);
  }
  if (dir.includes('s')) {
    bottom = clamp(orig.y + orig.height + dy, top + MIN_BOX_PT, pageH);
  }

  return {
    x: left,
    y: top,
    width: Math.max(MIN_BOX_PT, right - left),
    height: Math.max(MIN_BOX_PT, bottom - top),
  };
}

function isEditableElement(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return (el as HTMLElement).isContentEditable === true;
}

export function FigureCanvas({
  doc,
  sourceId,
  pageIndex,
  boxes,
  selectedId,
  onSelect,
  onAddBox,
  onUpdateBox,
  onDeleteBox,
  onTightenBox,
  onPageSize,
}: FigureCanvasProps) {
  const { t } = useI18n();
  const stageRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const overlayRef = React.useRef<HTMLDivElement | null>(null);
  const dragRef = React.useRef<DragState | null>(null);

  const [stageWidth, setStageWidth] = React.useState(640);
  const [renderWidth, setRenderWidth] = React.useState(640);
  const [pageSize, setPageSize] = React.useState<{ width: number; height: number } | null>(null);
  const [rendering, setRendering] = React.useState(false);
  const [renderError, setRenderError] = React.useState<string | null>(null);
  const [draftRect, setDraftRect] = React.useState<ViewportRect | null>(null);

  const pageBoxes = React.useMemo(
    () => boxes.filter((b) => b.sourceId === sourceId && b.pageIndex === pageIndex),
    [boxes, sourceId, pageIndex],
  );

  // Measure available stage width without causing layout overflow at 390px phone width.
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

  // Debounce canvas re-renders during window resize.
  React.useEffect(() => {
    const timer = setTimeout(() => setRenderWidth(stageWidth), 120);
    return () => clearTimeout(timer);
  }, [stageWidth]);

  // Render the active page via pdf.js at crisp HiDPI resolution, cleaning up page and canvas.
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

        const maxCssW = Math.min(renderWidth, 880);
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
          if (ctx) {
            ctx.drawImage(offscreen, 0, 0);
          }
        }
      } catch (e) {
        if (!cancelled) {
          setRenderError(e instanceof Error ? e.message : String(e));
        }
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

  // Zero canvas memory on unmount.
  React.useEffect(() => () => {
    if (canvasRef.current) {
      canvasRef.current.width = 0;
      canvasRef.current.height = 0;
    }
  }, []);

  // Keyboard shortcuts for selected box: Delete/Backspace and arrow nudging (Shift = 5 pt, plain = 1 pt).
  React.useEffect(() => {
    if (!selectedId || !pageSize) return;
    const active = pageBoxes.find((b) => b.id === selectedId);
    if (!active) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (isEditableElement(document.activeElement)) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        onDeleteBox(active.id);
        return;
      }
      const step = e.shiftKey ? 5 : 1;
      let dx = 0;
      let dy = 0;
      if (e.key === 'ArrowLeft') dx = -step;
      else if (e.key === 'ArrowRight') dx = step;
      else if (e.key === 'ArrowUp') dy = -step;
      else if (e.key === 'ArrowDown') dy = step;
      else return;

      e.preventDefault();
      const next = clampRectToPage(
        {
          x: active.rect.x + dx,
          y: active.rect.y + dy,
          width: active.rect.width,
          height: active.rect.height,
        },
        pageSize.width,
        pageSize.height,
      );
      onUpdateBox(active.id, next);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedId, pageBoxes, pageSize, onDeleteBox, onUpdateBox]);

  const clientToPagePt = React.useCallback(
    (clientX: number, clientY: number): { x: number; y: number } | null => {
      const overlay = overlayRef.current;
      if (!overlay || !pageSize) return null;
      const bounds = overlay.getBoundingClientRect();
      if (bounds.width <= 0 || bounds.height <= 0) return null;
      const x = clamp(((clientX - bounds.left) / bounds.width) * pageSize.width, 0, pageSize.width);
      const y = clamp(((clientY - bounds.top) / bounds.height) * pageSize.height, 0, pageSize.height);
      return { x, y };
    },
    [pageSize],
  );

  const handleOverlayPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || !pageSize) return;
    const pt = clientToPagePt(e.clientX, e.clientY);
    if (!pt) return;
    e.preventDefault();
    overlayRef.current?.setPointerCapture(e.pointerId);
    dragRef.current = {
      kind: 'draw',
      pointerId: e.pointerId,
      startX: pt.x,
      startY: pt.y,
    };
    setDraftRect({ x: pt.x, y: pt.y, width: 0, height: 0 });
  };

  const handleBoxPointerDown = (e: React.PointerEvent<HTMLDivElement>, box: FigureBox) => {
    if (e.button !== 0 || !pageSize) return;
    e.stopPropagation();
    e.preventDefault();
    onSelect(box.id);
    const pt = clientToPagePt(e.clientX, e.clientY);
    if (!pt) return;
    overlayRef.current?.setPointerCapture(e.pointerId);
    dragRef.current = {
      kind: 'move',
      pointerId: e.pointerId,
      boxId: box.id,
      startX: pt.x,
      startY: pt.y,
      orig: { ...box.rect },
    };
  };

  const handleResizePointerDown = (
    e: React.PointerEvent<HTMLDivElement>,
    box: FigureBox,
    dir: HandleDir,
  ) => {
    if (e.button !== 0 || !pageSize) return;
    e.stopPropagation();
    e.preventDefault();
    onSelect(box.id);
    const pt = clientToPagePt(e.clientX, e.clientY);
    if (!pt) return;
    overlayRef.current?.setPointerCapture(e.pointerId);
    dragRef.current = {
      kind: 'resize',
      pointerId: e.pointerId,
      boxId: box.id,
      dir,
      startX: pt.x,
      startY: pt.y,
      orig: { ...box.rect },
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId || !pageSize) return;
    const pt = clientToPagePt(e.clientX, e.clientY);
    if (!pt) return;

    if (drag.kind === 'draw') {
      const x = Math.min(drag.startX, pt.x);
      const y = Math.min(drag.startY, pt.y);
      const width = Math.abs(pt.x - drag.startX);
      const height = Math.abs(pt.y - drag.startY);
      setDraftRect({ x, y, width, height });
    } else if (drag.kind === 'move') {
      const dx = pt.x - drag.startX;
      const dy = pt.y - drag.startY;
      const next = clampRectToPage(
        {
          x: drag.orig.x + dx,
          y: drag.orig.y + dy,
          width: drag.orig.width,
          height: drag.orig.height,
        },
        pageSize.width,
        pageSize.height,
      );
      onUpdateBox(drag.boxId, next);
    } else if (drag.kind === 'resize') {
      const dx = pt.x - drag.startX;
      const dy = pt.y - drag.startY;
      const next = resizeRect(drag.orig, drag.dir, dx, dy, pageSize.width, pageSize.height);
      onUpdateBox(drag.boxId, next);
    }
  };

  const finishDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    dragRef.current = null;
    try {
      overlayRef.current?.releasePointerCapture(e.pointerId);
    } catch {
      // Capture may already be released.
    }

    if (drag.kind === 'draw') {
      const pt = clientToPagePt(e.clientX, e.clientY);
      setDraftRect(null);
      if (pt && pageSize) {
        const x = Math.min(drag.startX, pt.x);
        const y = Math.min(drag.startY, pt.y);
        const width = Math.abs(pt.x - drag.startX);
        const height = Math.abs(pt.y - drag.startY);
        if (width >= MIN_BOX_PT && height >= MIN_BOX_PT) {
          onAddBox(clampRectToPage({ x, y, width, height }, pageSize.width, pageSize.height));
        } else {
          onSelect(null);
        }
      }
    }
  };

  const cssDisplaySize = React.useMemo(() => {
    if (!pageSize) return null;
    const maxCssW = Math.min(stageWidth, 880);
    const scale = Math.min(maxCssW / Math.max(1, pageSize.width), 2);
    return {
      width: Math.max(1, Math.round(pageSize.width * scale)),
      height: Math.max(1, Math.round(pageSize.height * scale)),
    };
  }, [pageSize, stageWidth]);

  return (
    <div ref={stageRef} className={styles.figureStage}>
      {renderError && <p className={styles.note}>{t('pdf.canvas.couldNotRender', { error: renderError })}</p>}
      {!renderError && (
        <div
          className={styles.figureWrap}
          style={
            cssDisplaySize
              ? { width: `${cssDisplaySize.width}px`, height: `${cssDisplaySize.height}px` }
              : undefined
          }
        >
          <canvas
            ref={canvasRef}
            className={styles.figureCanvas}
            style={
              cssDisplaySize
                ? { width: `${cssDisplaySize.width}px`, height: `${cssDisplaySize.height}px` }
                : undefined
            }
          />
          {pageSize && (
            <div
              ref={overlayRef}
              className={styles.figureOverlay}
              role="region"
              aria-label={t('pdf.canvas.figureRegionAria')}
              onPointerDown={handleOverlayPointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={finishDrag}
              onPointerCancel={finishDrag}
            >
              {pageBoxes.map((box) => {
                const isSelected = box.id === selectedId;
                const leftPct = (box.rect.x / pageSize.width) * 100;
                const topPct = (box.rect.y / pageSize.height) * 100;
                const widthPct = (box.rect.width / pageSize.width) * 100;
                const heightPct = (box.rect.height / pageSize.height) * 100;
                const dims = `${Math.round(box.rect.width)} × ${Math.round(box.rect.height)} pt`;

                return (
                  <div
                    key={box.id}
                    className={[
                      styles.figureBox,
                      isSelected ? styles.figureBoxSelected : '',
                    ].join(' ')}
                    style={{
                      left: `${leftPct}%`,
                      top: `${topPct}%`,
                      width: `${widthPct}%`,
                      height: `${heightPct}%`,
                    }}
                    onPointerDown={(e) => handleBoxPointerDown(e, box)}
                  >
                    <span className={styles.figureLabel} title={`${box.label} (${dims})`}>
                      {box.label} · {dims}
                    </span>

                    {isSelected && (
                      <>
                        <div
                          className={styles.figureQuickActions}
                          onPointerDown={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            className={styles.figureQuickBtn}
                            title={t('pdf.canvas.tightenTitle')}
                            onClick={(e) => {
                              e.stopPropagation();
                              onTightenBox(box.id);
                            }}
                          >
                            {t('pdf.canvas.tighten')}
                          </button>
                          <button
                            type="button"
                            className={[styles.figureQuickBtn, styles.figureQuickBtnDanger].join(' ')}
                            title={t('pdf.canvas.deleteFigureTitle')}
                            aria-label={t('pdf.canvas.deleteNamed', { label: box.label })}
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeleteBox(box.id);
                            }}
                          >
                            &times;
                          </button>
                        </div>

                        {HANDLES.map((h) => (
                          <div
                            key={h.dir}
                            className={[styles.figureHandle, h.className].join(' ')}
                            role="slider"
                            aria-label={t(h.labelKey)}
                            aria-valuenow={Math.round(box.rect.width)}
                            onPointerDown={(e) => handleResizePointerDown(e, box, h.dir)}
                          />
                        ))}
                      </>
                    )}
                  </div>
                );
              })}

              {draftRect && draftRect.width >= 2 && draftRect.height >= 2 && (
                <div
                  className={styles.figureBoxDraft}
                  style={{
                    left: `${(draftRect.x / pageSize.width) * 100}%`,
                    top: `${(draftRect.y / pageSize.height) * 100}%`,
                    width: `${(draftRect.width / pageSize.width) * 100}%`,
                    height: `${(draftRect.height / pageSize.height) * 100}%`,
                  }}
                >
                  <span className={styles.figureLabel}>
                    {Math.round(draftRect.width)} &times; {Math.round(draftRect.height)} pt
                  </span>
                </div>
              )}
            </div>
          )}

          {rendering && <div className={styles.figureLoading}>{t('pdf.canvas.renderingPage')}</div>}
        </div>
      )}
    </div>
  );
}
