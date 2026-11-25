// Framed Plots Gallery component for /python/main (rendered inside the Program output container).
// Displays matplotlib plt.show() and PIL.Image.show() figures with Fit/100%/Zoom/drag-to-pan,
// write-only Copy PNG, Download PNG, live vector Export SVG/PDF, thumbnail history, and Clear all.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { PlotExportFormat } from '../../lib/python/protocol';
import type { PlotExportResult } from '../../lib/python/workerClient';
import { useI18n } from '../../lib/ui/i18n';
import plotStyles from '../../styles/PythonPlots.module.css';
import { triggerBlobDownload } from './fileHelpers';
import type { PlotGalleryItem } from './usePlots';

export interface PlotsGalleryProps {
  visible: boolean;
  plots: readonly PlotGalleryItem[];
  selectedPlotId: string | null;
  exportDisabled?: boolean;
  onSelectPlot: (plotId: string) => void;
  onDeletePlot: (plotId: string) => void;
  onClearAll: () => void;
  onExportPlot: (plotId: string, format: PlotExportFormat) => Promise<PlotExportResult>;
}

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 6;

export default function PlotsGallery({
  visible,
  plots,
  selectedPlotId,
  exportDisabled = false,
  onSelectPlot,
  onDeletePlot,
  onClearAll,
  onExportPlot,
}: PlotsGalleryProps) {
  const { t } = useI18n();
  const stageRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    scrollLeft: number;
    scrollTop: number;
  } | null>(null);

  const [zoomMode, setZoomMode] = useState<'fit' | 'manual'>('fit');
  const [zoom, setZoom] = useState(1);
  const [dragging, setDragging] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [copyFeedback, setCopyFeedback] = useState(false);
  const [exportingFormat, setExportingFormat] = useState<PlotExportFormat | null>(null);

  const selectedPlot = useMemo(() => {
    if (plots.length === 0) return null;
    return plots.find((p) => p.plotId === selectedPlotId) ?? plots[plots.length - 1];
  }, [plots, selectedPlotId]);

  useEffect(() => {
    setNotice(null);
    setCopyFeedback(false);
  }, [selectedPlot?.plotId]);

  const handleFit = useCallback(() => {
    setZoomMode('fit');
    setZoom(1);
  }, []);

  const handleActualSize = useCallback(() => {
    setZoomMode('manual');
    setZoom(1);
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoomMode('manual');
    setZoom((prev) => Math.max(MIN_ZOOM, Math.round(prev * 80) / 100));
  }, []);

  const handleZoomIn = useCallback(() => {
    setZoomMode('manual');
    setZoom((prev) => Math.min(MAX_ZOOM, Math.round(prev * 125) / 100));
  }, []);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (zoomMode !== 'manual') return;
      const el = stageRef.current;
      if (!el) return;
      e.preventDefault();
      el.setPointerCapture(e.pointerId);
      dragRef.current = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        scrollLeft: el.scrollLeft,
        scrollTop: el.scrollTop,
      };
      setDragging(true);
    },
    [zoomMode],
  );

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    const el = stageRef.current;
    if (!drag || !el || drag.pointerId !== e.pointerId) return;
    el.scrollLeft = drag.scrollLeft - (e.clientX - drag.startX);
    el.scrollTop = drag.scrollTop - (e.clientY - drag.startY);
  }, []);

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    const el = stageRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    dragRef.current = null;
    setDragging(false);
    if (el && el.hasPointerCapture(e.pointerId)) {
      el.releasePointerCapture(e.pointerId);
    }
  }, []);

  const handleCopyPng = useCallback(async () => {
    if (!selectedPlot) return;
    setNotice(null);
    const clip = typeof navigator !== 'undefined' ? navigator.clipboard : undefined;
    if (!clip || typeof clip.write !== 'function' || typeof ClipboardItem === 'undefined') {
      setNotice(t('python.plotsCopyUnsupported'));
      return;
    }
    try {
      const copy = new Uint8Array(selectedPlot.pngBytes.byteLength);
      copy.set(selectedPlot.pngBytes);
      const item = new ClipboardItem({
        'image/png': new Blob([copy], { type: 'image/png' }),
      });
      await clip.write([item]);
      setCopyFeedback(true);
      setTimeout(() => setCopyFeedback(false), 1800);
    } catch {
      setNotice(t('python.plotsCopyUnsupported'));
    }
  }, [selectedPlot, t]);

  const handleDownloadPng = useCallback(() => {
    if (!selectedPlot) return;
    triggerBlobDownload(selectedPlot.pngBytes, `plot-${selectedPlot.index}.png`, 'image/png');
  }, [selectedPlot]);

  const handleExportVector = useCallback(
    async (format: PlotExportFormat) => {
      if (!selectedPlot || !selectedPlot.canExportVector) return;
      setNotice(null);
      setExportingFormat(format);
      try {
        const res = await onExportPlot(selectedPlot.plotId, format);
        if (res.ok && res.bytes) {
          const mime = format === 'svg' ? 'image/svg+xml' : 'application/pdf';
          triggerBlobDownload(res.bytes, `plot-${selectedPlot.index}.${format}`, mime);
        } else {
          setNotice(res.error || t('python.plotsExportEvicted'));
        }
      } catch (err) {
        setNotice(err instanceof Error ? err.message : t('python.plotsExportEvicted'));
      } finally {
        setExportingFormat(null);
      }
    },
    [onExportPlot, selectedPlot, t],
  );

  return (
    <div
      className={plotStyles.plotsPane}
      style={{ display: visible ? 'flex' : 'none' }}
      data-testid="python-plots-panel"
    >
      {!selectedPlot ? (
        <div className={plotStyles.emptyState} data-testid="python-plots-empty">
          <div className={plotStyles.emptyTitle}>{t('python.plotsEmptyTitle')}</div>
          <div className={plotStyles.emptyDesc}>{t('python.plotsEmptyDesc')}</div>
        </div>
      ) : (
        <>
          {/* Trusted stage toolbar (outside the image stage) */}
          <div className={plotStyles.stageToolbar}>
            <div className={plotStyles.stageToolbarGroup}>
              <button
                type="button"
                className={[
                  plotStyles.toolBtn,
                  zoomMode === 'fit' ? plotStyles.toolBtnActive : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={handleFit}
                data-testid="python-plot-fit"
              >
                {t('python.viewerFit')}
              </button>
              <button
                type="button"
                className={[
                  plotStyles.toolBtn,
                  zoomMode === 'manual' && zoom === 1 ? plotStyles.toolBtnActive : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={handleActualSize}
                data-testid="python-plot-100"
              >
                100%
              </button>
              <button
                type="button"
                className={plotStyles.toolBtn}
                onClick={handleZoomOut}
                aria-label={t('python.viewerZoomOut')}
                data-testid="python-plot-zoom-out"
              >
                &minus;
              </button>
              <span className={plotStyles.zoomReadout}>
                {zoomMode === 'fit' ? t('python.viewerFit') : `${Math.round(zoom * 100)}%`}
              </span>
              <button
                type="button"
                className={plotStyles.toolBtn}
                onClick={handleZoomIn}
                aria-label={t('python.viewerZoomIn')}
                data-testid="python-plot-zoom-in"
              >
                +
              </button>
            </div>

            <div className={plotStyles.stageToolbarGroup}>
              <button
                type="button"
                className={plotStyles.toolBtn}
                onClick={() => {
                  void handleCopyPng();
                }}
                data-testid="python-plot-copy-png"
              >
                {copyFeedback ? t('python.copiedConsole') : t('python.plotsCopyPng')}
              </button>
              <button
                type="button"
                className={plotStyles.toolBtn}
                onClick={handleDownloadPng}
                data-testid="python-plot-download-png"
              >
                {t('python.plotsDownloadPng')}
              </button>
              {selectedPlot.canExportVector && (
                <>
                  <button
                    type="button"
                    className={plotStyles.toolBtn}
                    disabled={exportDisabled || exportingFormat !== null}
                    onClick={() => {
                      void handleExportVector('svg');
                    }}
                    data-testid="python-plot-export-svg"
                  >
                    {t('python.plotsExportSvg')}
                  </button>
                  <button
                    type="button"
                    className={plotStyles.toolBtn}
                    disabled={exportDisabled || exportingFormat !== null}
                    onClick={() => {
                      void handleExportVector('pdf');
                    }}
                    data-testid="python-plot-export-pdf"
                  >
                    {t('python.plotsExportPdf')}
                  </button>
                </>
              )}
              <button
                type="button"
                className={[plotStyles.toolBtn, plotStyles.toolBtnDanger].join(' ')}
                onClick={onClearAll}
                data-testid="python-plots-clear-all"
              >
                {t('python.plotsClearAll')}
              </button>
            </div>
          </div>

          {/* Plot metadata strip */}
          <div className={plotStyles.plotMetaBar}>
            <div className={plotStyles.plotMetaLeft}>
              <span className={plotStyles.plotIndexBadge}>#{selectedPlot.index}</span>
              <span className={plotStyles.plotTitle} title={selectedPlot.title}>
                {selectedPlot.title || `Figure ${selectedPlot.index}`}
              </span>
              <span className={plotStyles.plotSourceBadge}>
                {selectedPlot.source === 'pillow' ? 'PIL' : 'matplotlib'}
              </span>
              <span className={plotStyles.viewerMeta}>
                {selectedPlot.width}&times;{selectedPlot.height} px
              </span>
            </div>
            <button
              type="button"
              className={[plotStyles.toolBtn, plotStyles.toolBtnDanger].join(' ')}
              onClick={() => onDeletePlot(selectedPlot.plotId)}
              data-testid="python-plot-delete-active"
            >
              {t('python.filesDelete')}
            </button>
          </div>

          {notice && (
            <div className={plotStyles.noticeBar} role="status" data-testid="python-plot-notice">
              <span>{notice}</span>
              <button
                type="button"
                className={plotStyles.toolBtn}
                onClick={() => setNotice(null)}
              >
                {t('python.filesDismiss')}
              </button>
            </div>
          )}

          {/* Plot image stage (strictly <img> from revoked Blob URL) */}
          <div
            ref={stageRef}
            className={[
              plotStyles.imageStage,
              zoomMode === 'manual' ? plotStyles.imageStageZoomed : '',
              dragging ? plotStyles.imageStageDragging : '',
            ]
              .filter(Boolean)
              .join(' ')}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            data-testid="python-plot-stage"
          >
            <img
              src={selectedPlot.blobUrl}
              alt={selectedPlot.title || `Plot #${selectedPlot.index}`}
              draggable={false}
              className={
                zoomMode === 'fit' ? plotStyles.stageImgFit : plotStyles.stageImgZoomed
              }
              style={
                zoomMode === 'manual'
                  ? {
                      width: `${Math.round(selectedPlot.width * zoom)}px`,
                      height: `${Math.round(selectedPlot.height * zoom)}px`,
                    }
                  : undefined
              }
              data-testid="python-plot-stage-img"
            />
          </div>

          {/* Thumbnail history strip */}
          <div
            className={plotStyles.thumbStrip}
            aria-label={t('python.plotsHistoryAria')}
            data-testid="python-plots-thumbs"
          >
            {plots.map((item) => {
              const active = item.plotId === selectedPlot.plotId;
              return (
                <div
                  key={item.plotId}
                  role="button"
                  tabIndex={0}
                  className={[
                    plotStyles.thumbCard,
                    active ? plotStyles.thumbCardActive : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => onSelectPlot(item.plotId)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onSelectPlot(item.plotId);
                    }
                  }}
                  data-testid={`python-plot-thumb-${item.plotId}`}
                  data-active={active ? 'true' : 'false'}
                >
                  <button
                    type="button"
                    className={plotStyles.thumbDeleteBtn}
                    aria-label={t('python.plotsDeleteItem', { index: item.index })}
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeletePlot(item.plotId);
                    }}
                    data-testid={`python-plot-delete-${item.plotId}`}
                  >
                    &times;
                  </button>
                  <div className={plotStyles.thumbImgWrap}>
                    <img
                      src={item.blobUrl}
                      alt={item.title || `Plot #${item.index}`}
                      className={plotStyles.thumbImg}
                    />
                  </div>
                  <div className={plotStyles.thumbMetaRow}>
                    <span>#{item.index}</span>
                    <span>{item.source === 'pillow' ? 'PIL' : 'mpl'}</span>
                  </div>
                  <div className={plotStyles.thumbTitle} title={item.title}>
                    {item.title || `Figure ${item.index}`}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
