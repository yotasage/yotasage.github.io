import type React from 'react';

import { rgbaToCss } from '../../lib/paint/color';
import type { Point, Rect, RGBA, ToolId, ToolOptions } from '../../lib/paint/types';
import { useI18n } from '../../lib/ui/i18n';
import styles from '../../styles/Paint.module.css';

export type CropHandle = 'move' | 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

export interface CanvasViewportProps {
  viewportRef: React.RefObject<HTMLDivElement | null>;
  displayCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  docSize: { width: number; height: number };
  zoom: number;
  showPixelGrid: boolean;
  activeTool: ToolId;
  canvasCursor: string;
  selection: Rect | null;
  hasFloatingSelection: boolean;
  cropRect: Rect | null;
  textDraft: { x: number; y: number; value: string } | null;
  toolOptions: ToolOptions;
  primaryColor: RGBA;
  onViewportWheel: (e: React.WheelEvent<HTMLDivElement>) => void;
  onCanvasPointerDown: (e: React.PointerEvent<HTMLCanvasElement>) => void;
  onCanvasPointerMove: (e: React.PointerEvent<HTMLCanvasElement>) => void;
  onCanvasPointerUp: (e: React.PointerEvent<HTMLCanvasElement>) => void;
  onCanvasPointerLeave: () => void;
  onCropHandleDown: (handle: CropHandle, e: React.PointerEvent<HTMLDivElement>) => void;
  onChangeTextDraft: (next: { x: number; y: number; value: string } | null) => void;
  onCommitTextDraft: () => void;
}

export function CanvasViewport({
  viewportRef,
  displayCanvasRef,
  docSize,
  zoom,
  showPixelGrid,
  activeTool,
  canvasCursor,
  selection,
  hasFloatingSelection,
  cropRect,
  textDraft,
  toolOptions,
  primaryColor,
  onViewportWheel,
  onCanvasPointerDown,
  onCanvasPointerMove,
  onCanvasPointerUp,
  onCanvasPointerLeave,
  onCropHandleDown,
  onChangeTextDraft,
  onCommitTextDraft,
}: CanvasViewportProps) {
  const { t } = useI18n();
  const scaledW = Math.round(docSize.width * zoom);
  const scaledH = Math.round(docSize.height * zoom);

  return (
    <div ref={viewportRef} className={styles.viewport} onWheel={onViewportWheel}>
      <div className={styles.canvasStage} style={{ width: `${scaledW}px`, height: `${scaledH}px` }}>
        <canvas
          ref={displayCanvasRef}
          width={docSize.width}
          height={docSize.height}
          data-testid="paint-canvas"
          data-width={docSize.width}
          data-height={docSize.height}
          data-floating-selection={hasFloatingSelection ? 'true' : 'false'}
          className={styles.canvas}
          style={{
            width: `${scaledW}px`,
            height: `${scaledH}px`,
            cursor: canvasCursor,
            imageRendering: zoom >= 2 ? 'pixelated' : 'auto',
          }}
          onPointerDown={onCanvasPointerDown}
          onPointerMove={onCanvasPointerMove}
          onPointerUp={onCanvasPointerUp}
          onPointerLeave={onCanvasPointerLeave}
          onContextMenu={(e) => e.preventDefault()}
        />

        {showPixelGrid && zoom >= 4 && (
          <div
            className={styles.pixelGrid}
            style={{ backgroundSize: `${zoom}px ${zoom}px` }}
            aria-hidden="true"
          />
        )}

        {selection && selection.w > 0 && selection.h > 0 && (
          <div
            className={[
              styles.selectionBox,
              hasFloatingSelection ? styles.selectionBoxFloating : '',
            ].join(' ')}
            data-testid="paint-selection-box"
            data-x={selection.x}
            data-y={selection.y}
            data-w={selection.w}
            data-h={selection.h}
            style={{
              left: `${selection.x * zoom}px`,
              top: `${selection.y * zoom}px`,
              width: `${selection.w * zoom}px`,
              height: `${selection.h * zoom}px`,
            }}
            aria-hidden="true"
          />
        )}

        {activeTool === 'crop' && cropRect && cropRect.w > 0 && cropRect.h > 0 && (
          <div
            className={styles.cropBox}
            data-testid="paint-crop-box"
            style={{
              left: `${cropRect.x * zoom}px`,
              top: `${cropRect.y * zoom}px`,
              width: `${cropRect.w * zoom}px`,
              height: `${cropRect.h * zoom}px`,
            }}
            onPointerDown={(e) => onCropHandleDown('move', e)}
          >
            <div className={styles.cropThirds} aria-hidden="true" />
            {(['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const).map((h) => (
              <div
                key={h}
                className={[styles.cropHandle, styles[`cropHandle_${h}`]].join(' ')}
                onPointerDown={(e) => onCropHandleDown(h, e)}
              />
            ))}
          </div>
        )}

        {textDraft && (
          <input
            type="text"
            autoFocus
            value={textDraft.value}
            onChange={(e) => onChangeTextDraft({ ...textDraft, value: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                onCommitTextDraft();
              } else if (e.key === 'Escape') {
                onChangeTextDraft(null);
              }
            }}
            onBlur={onCommitTextDraft}
            placeholder={t('paint.text.placeholder')}
            className={styles.textOverlayInput}
            style={{
              left: `${textDraft.x * zoom}px`,
              top: `${textDraft.y * zoom}px`,
              fontSize: `${Math.max(12, toolOptions.fontSize * zoom)}px`,
              fontWeight: toolOptions.fontBold ? 700 : 400,
              fontStyle: toolOptions.fontItalic ? 'italic' : 'normal',
              color: rgbaToCss(primaryColor),
            }}
          />
        )}
      </div>
    </div>
  );
}

export interface StatusBarProps {
  docSize: { width: number; height: number };
  cursorPos: Point | null;
  selection: Rect | null;
  statusMsg: string;
  zoom: number;
  onZoomChange: (next: number) => void;
  onFitZoom: () => void;
}

export function StatusBar({
  docSize,
  cursorPos,
  selection,
  statusMsg,
  zoom,
  onZoomChange,
  onFitZoom,
}: StatusBarProps) {
  const { t } = useI18n();

  return (
    <div className={styles.statusBar} role="status" aria-live="polite">
      <div className={styles.statusGroup}>
        <span className={styles.statusMetric} data-testid="paint-dimensions">
          {docSize.width} × {docSize.height} px
        </span>
        <span className={styles.statusSep} aria-hidden="true">·</span>
        <span className={styles.statusMetric}>
          {cursorPos ? `${cursorPos.x}, ${cursorPos.y}` : '—'}
        </span>
        {selection && selection.w > 0 && selection.h > 0 && (
          <>
            <span className={styles.statusSep} aria-hidden="true">·</span>
            <span className={styles.statusMetric} data-testid="paint-selection-coords">
              {t('paint.status.selection', { w: selection.w, h: selection.h })} ({selection.x}, {selection.y})
            </span>
          </>
        )}
        <span className={styles.statusSep} aria-hidden="true">·</span>
        <span className={styles.statusMsg} data-testid="paint-status-msg">
          {statusMsg || t('paint.status.clipboardHint')}
        </span>
      </div>

      <div className={styles.zoomGroup}>
        <button
          type="button"
          className={styles.zoomBtn}
          onClick={() => onZoomChange(Math.max(0.15, Math.round((zoom / 1.25) * 100) / 100))}
          aria-label="Zoom out"
        >
          −
        </button>
        <input
          type="range"
          min={15}
          max={800}
          value={Math.min(800, Math.round(zoom * 100))}
          onChange={(e) => onZoomChange(Number(e.target.value) / 100)}
          className={styles.zoomRange}
          aria-label="Zoom level slider"
        />
        <button
          type="button"
          className={styles.zoomBtn}
          onClick={() => onZoomChange(Math.min(16, Math.round(zoom * 1.25 * 100) / 100))}
          aria-label="Zoom in"
        >
          +
        </button>
        <input
          type="number"
          min={15}
          max={1600}
          value={Math.round(zoom * 100)}
          onChange={(e) => {
            const pct = Math.max(15, Math.min(1600, Math.round(Number(e.target.value) || 100)));
            onZoomChange(pct / 100);
          }}
          className={styles.zoomNumInput}
          aria-label="Zoom percentage"
        />
        <span className={styles.optUnit}>%</span>
        <button type="button" className={styles.zoomFitBtn} onClick={onFitZoom}>
          {t('paint.action.fit')}
        </button>
        <button type="button" className={styles.zoomFitBtn} onClick={() => onZoomChange(1)}>
          100%
        </button>
      </div>
    </div>
  );
}
