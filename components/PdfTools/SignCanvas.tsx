import type { PDFDocumentProxy } from 'pdfjs-dist';
import React from 'react';

import { renderPage } from '../../lib/pdf/pdfjs';
import type { SignaturePlacement, SignatureTextFont } from '../../lib/pdf/sign';
import styles from '../../styles/PdfTools.module.css';

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

const CORNERS: Array<{ corner: CornerHandle; className: string; label: string }> = [
  { corner: 'nw', className: styles.signHandleNw, label: 'Resize top-left corner' },
  { corner: 'ne', className: styles.signHandleNe, label: 'Resize top-right corner' },
  { corner: 'se', className: styles.signHandleSe, label: 'Resize bottom-right corner' },
  { corner: 'sw', className: styles.signHandleSw, label: 'Resize bottom-left corner' },
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
}: SignCanvasProps) {
  const stageRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const overlayRef = React.useRef<HTMLDivElement | null>(null);
  const dragRef = React.useRef<DragState | null>(null);
  const latestPatchRef = React.useRef<{ id: string; patch: Partial<SignaturePlacement> } | null>(null);

  const [stageWidth, setStageWidth] = React.useState(620);
  const [renderWidth, setRenderWidth] = React.useState(620);
  const [overlayCssSize, setOverlayCssSize] = React.useState<{ width: number; height: number }>({
    width: 600,
    height: 800,
  });
  const [pageSize, setPageSize] = React.useState<{ width: number; height: number } | null>(null);
  const [rendering, setRendering] = React.useState(false);
  const [renderError, setRenderError] = React.useState<string | null>(null);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editingText, setEditingText] = React.useState('');

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
  }, [pageIndex]);

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
  }, [pageSize, renderWidth]);

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
          // Ignore cleanup errors on closed document.
        }
        if (!cancelled) setRendering(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [doc, pageIndex, renderWidth, onPageSize]);

  const cssWidth = pageSize
    ? Math.max(180, Math.round(Math.min(stageWidth, 820, pageSize.width * 2)))
    : Math.min(stageWidth, 620);
  const cssHeight = pageSize
    ? Math.max(120, Math.round((cssWidth * pageSize.height) / Math.max(1, pageSize.width)))
    : 420;
  const ptToPx = pageSize ? overlayCssSize.width / Math.max(1, pageSize.width) : 1;

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

  function handleOverlayPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    if (e.target !== overlayRef.current) return;
    const rect = overlayRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) return;

    if (armedHint) {
      e.preventDefault();
      const nx = clamp((e.clientX - rect.left) / rect.width, 0, 1);
      const ny = clamp((e.clientY - rect.top) / rect.height, 0, 1);
      onPlaceAt(nx, ny);
      return;
    }

    onSelect(null);
    setEditingId(null);
  }

  function startMove(e: React.PointerEvent<HTMLDivElement>, p: SignaturePlacement) {
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

    // Corner resize in visual pixel coordinates so image aspect ratio stays exact on non-square pages.
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
      // Choose the axis with larger proportional drag so diagonal dragging feels smooth.
      const scaleW = newW / Math.max(1, origW);
      const scaleH = newH / Math.max(1, origH);
      const chosenScale = Math.abs(scaleW - 1) >= Math.abs(scaleH - 1) ? scaleW : scaleH;
      newW = origW * chosenScale;
      newH = origH * chosenScale;

      // Clamp uniformly against both available bounds while preserving aspect ratio.
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
      (patch as Partial<{ fontSize: number }>).fontSize = Math.round(
        clamp(drag.origFontSize * ratio, 6, 144) * 2,
      ) / 2;
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

  return (
    <div ref={stageRef} className={styles.previewStage}>
      <div
        className={styles.previewWrap}
        style={{ width: cssWidth, minHeight: pageSize ? undefined : cssHeight }}
      >
        <canvas
          ref={canvasRef}
          className={styles.previewCanvas}
          style={{ width: cssWidth, height: pageSize ? cssHeight : 'auto' }}
        />

        {pageSize && (
          <div
            ref={overlayRef}
            className={[styles.signOverlay, armedHint ? styles.signOverlayArmed : ''].join(' ')}
            onPointerDown={handleOverlayPointerDown}
          >
            {armedHint && (
              <div className={styles.signArmedBanner}>
                Click anywhere on the page to place &ldquo;{armedHint.label}&rdquo;
              </div>
            )}

            {pagePlacements.map((p) => {
              const selected = p.id === selectedId;
              const isEditing = p.id === editingId;
              const previewUrl = p.kind === 'image' ? assetPreviews[p.assetId] : undefined;
              const textFontPx =
                p.kind === 'text'
                  ? Math.max(
                      8,
                      (p.fontSize ?? Math.max(8, ((p.height * pageSize.height) / Math.max(1, p.text.split(/\r?\n/).length)) * 0.72)) *
                        ptToPx,
                    )
                  : 14;

              return (
                <div
                  key={p.id}
                  tabIndex={0}
                  role="button"
                  aria-label={p.kind === 'image' ? 'Placed signature' : `Text stamp: ${p.text}`}
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
                  }}
                  onPointerDown={(e) => startMove(e, p)}
                  onPointerMove={handleDragMove}
                  onPointerUp={handleDragEnd}
                  onPointerCancel={handleDragEnd}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    if (p.kind === 'text') beginInlineEdit(p);
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
                      <span className={styles.signBoxFallback}>Signature</span>
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

                  {selected && !isEditing && (
                    <>
                      <div className={styles.signBoxActions} onPointerDown={(e) => e.stopPropagation()}>
                        {p.kind === 'text' && (
                          <button
                            type="button"
                            className={styles.signBoxActionBtn}
                            title="Edit text"
                            onClick={() => beginInlineEdit(p)}
                          >
                            Edit
                          </button>
                        )}
                        <button
                          type="button"
                          className={[styles.signBoxActionBtn, styles.signBoxActionDanger].join(' ')}
                          title="Remove"
                          aria-label="Remove placement"
                          onClick={() => onDelete(p.id)}
                        >
                          &times;
                        </button>
                      </div>

                      {CORNERS.map((h) => (
                        <div
                          key={h.corner}
                          role="presentation"
                          aria-label={h.label}
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

        {rendering && <div className={styles.figureLoading}>Rendering page…</div>}
        {renderError && <div className={styles.figureLoading}>Preview error: {renderError}</div>}
      </div>
    </div>
  );
}
