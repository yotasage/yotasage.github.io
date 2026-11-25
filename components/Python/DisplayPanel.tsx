// Display panel (P8): the Display output tab of the playground. The toolbar (Fit, 100 %, Screenshot to
// Plots, Fullscreen, Close), the focus hint and the resize handle are trusted UI drawn by the page
// outside the frame; the framed area labelled "Program output" holds the program's title (a text
// node, never HTML) and its canvas. Fullscreen covers the whole panel, so the trusted "Exit
// fullscreen" control stays visible. The canvas stays mounted while hidden: the renderer needs it.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';

import type { DisplayInfo, DisplaySource } from '../../lib/python/display/renderer';
import { useI18n } from '../../lib/ui/i18n';
import styles from '../../styles/Python.module.css';
import displayStyles from '../../styles/PythonDisplay.module.css';
import plotStyles from '../../styles/PythonPlots.module.css';
import type { GalleryPlotInput } from './usePlots';
import { useDisplay } from './useDisplay';

const STARTER = 'import vdisplay as vd\nd = vd.Display(480, 320, title="Hello")';
const NOTICE_MS = 2500;
const RESIZE_STEP = 40;
const MIN_WORKSPACE_H = 420;
const MAX_WORKSPACE_H = 2400;

export interface DisplayPanelProps {
  readonly source: DisplaySource | null;
  readonly visible: boolean;
  readonly compact: boolean;
  /** A program opened a new display (the playground shows the tab, once per run). */
  readonly onOpen: (info: DisplayInfo) => void;
  /** Adds a screenshot to the Plots gallery. */
  readonly onScreenshot: (plot: GalleryPlotInput) => void;
  /** Desktop only: sets the workspace height (px) from the resize handle. */
  readonly onResizeWorkspace?: (height: number) => void;
}

export default function DisplayPanel({
  source,
  visible,
  compact,
  onOpen,
  onScreenshot,
  onResizeWorkspace,
}: DisplayPanelProps) {
  const { t } = useI18n();
  const d = useDisplay({ source, visible, compact, onOpen });
  const { info } = d;
  const [notice, setNotice] = useState('');
  const shotCount = useRef(0);

  // A new display starts without the previous one's notice.
  const infoId = info?.id;
  useEffect(() => setNotice(''), [infoId]);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = window.setTimeout(() => setNotice(''), NOTICE_MS);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const { screenshot } = d;
  const handleScreenshot = useCallback(async () => {
    const shown = info;
    const blob = await screenshot();
    if (!blob || !shown) {
      setNotice(t('python.displayScreenshotNone'));
      return;
    }
    const pngBytes = new Uint8Array(await blob.arrayBuffer());
    shotCount.current += 1;
    onScreenshot({
      plotId: `display-${Date.now().toString(36)}-${shotCount.current}`,
      title: shown.title,
      width: shown.width,
      height: shown.height,
      pngBytes,
      canExportVector: false,
      source: 'display',
      createdAt: Date.now(),
    });
    setNotice(t('python.displayScreenshotDone'));
  }, [info, onScreenshot, screenshot, t]);

  const workspaceHeight = useCallback(() => {
    const ws = d.panelRef.current?.closest('[data-python-workspace]');
    return ws ? ws.getBoundingClientRect().height : 0;
  }, [d.panelRef]);

  const resizeTo = useCallback(
    (h: number) => onResizeWorkspace?.(Math.round(Math.min(MAX_WORKSPACE_H, Math.max(MIN_WORKSPACE_H, h)))),
    [onResizeWorkspace],
  );

  const handleResizeDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const startY = e.clientY;
      const startH = workspaceHeight();
      if (startH <= 0) return;
      const handle = e.currentTarget;
      try {
        handle.setPointerCapture(e.pointerId);
      } catch {
        // Synthetic events cannot be captured.
      }
      const move = (ev: PointerEvent) => resizeTo(startH + ev.clientY - startY);
      const up = () => {
        handle.removeEventListener('pointermove', move);
        handle.removeEventListener('pointerup', up);
        handle.removeEventListener('pointercancel', up);
      };
      handle.addEventListener('pointermove', move);
      handle.addEventListener('pointerup', up);
      handle.addEventListener('pointercancel', up);
      e.preventDefault();
    },
    [resizeTo, workspaceHeight],
  );

  const handleResizeKey = useCallback(
    (e: ReactKeyboardEvent<HTMLDivElement>) => {
      const step = e.key === 'ArrowDown' ? RESIZE_STEP : e.key === 'ArrowUp' ? -RESIZE_STEP : 0;
      if (step === 0) return;
      e.preventDefault();
      resizeTo(workspaceHeight() + step);
    },
    [resizeTo, workspaceHeight],
  );

  const open = info?.open === true;
  const hint = notice || (open ? t(d.focused ? 'python.displayFocusActive' : 'python.displayFocusHint') : '');

  return (
    <div
      ref={d.panelRef}
      className={displayStyles.panel}
      style={{ display: visible || d.fullscreen ? 'flex' : 'none' }}
      data-testid="python-display-panel"
      data-fullscreen={d.fullscreen ? 'true' : 'false'}
    >
      <div
        className={displayStyles.toolbar}
        role="toolbar"
        aria-label={t('python.displayToolbarAria')}
        data-testid="python-display-toolbar"
      >
        <div className={displayStyles.group}>
          <button
            type="button"
            className={[plotStyles.toolBtn, d.zoom === 'fit' ? plotStyles.toolBtnActive : ''].join(' ')}
            aria-pressed={d.zoom === 'fit'}
            disabled={!info}
            onClick={() => d.setZoom('fit')}
            title={t('python.displayFitTitle')}
            data-testid="python-display-fit"
          >
            {t('python.displayFit')}
          </button>
          <button
            type="button"
            className={[plotStyles.toolBtn, d.zoom === 'actual' ? plotStyles.toolBtnActive : ''].join(' ')}
            aria-pressed={d.zoom === 'actual'}
            disabled={!info}
            onClick={() => d.setZoom('actual')}
            title={t('python.display100Title')}
            data-testid="python-display-100"
          >
            {t('python.display100')}
          </button>
          {info && (
            <span className={displayStyles.meta} data-testid="python-display-size">
              {info.width}&times;{info.height} &middot; {Math.round(d.scale * 100)}%
            </span>
          )}
        </div>
        <div className={displayStyles.group}>
          <button
            type="button"
            className={plotStyles.toolBtn}
            disabled={!info}
            onClick={() => void handleScreenshot()}
            title={t('python.displayScreenshotTitle')}
            data-testid="python-display-screenshot"
          >
            {t('python.displayScreenshot')}
          </button>
          {d.fullscreenAvailable && (
            <button
              type="button"
              className={[plotStyles.toolBtn, d.fullscreen ? plotStyles.toolBtnActive : ''].join(' ')}
              onClick={d.toggleFullscreen}
              data-testid="python-display-fullscreen"
            >
              {d.fullscreen ? t('python.displayExitFullscreen') : t('python.displayFullscreen')}
            </button>
          )}
          <button
            type="button"
            className={[plotStyles.toolBtn, plotStyles.toolBtnDanger].join(' ')}
            disabled={!open}
            onClick={d.close}
            title={t('python.displayCloseTitle')}
            data-testid="python-display-close"
          >
            {t('python.displayClose')}
          </button>
        </div>
        {hint && (
          <span
            className={[displayStyles.hint, open && d.focused && !notice ? displayStyles.hintActive : ''].join(' ')}
            role="status"
            data-testid="python-display-hint"
          >
            {hint}
          </span>
        )}
      </div>

      <div
        className={displayStyles.frame}
        role="group"
        aria-label={t('python.displayFrameAria')}
        data-testid="python-display-frame"
      >
        <div className={displayStyles.frameHeader}>
          <span className={styles.programOutputLabel} data-testid="python-display-frame-label">
            {t('python.programOutput')}
          </span>
          {info && (
            <span className={displayStyles.title} title={info.title} data-testid="python-display-title">
              {info.title}
            </span>
          )}
          {info && !open && <span className={displayStyles.closed}>{t('python.displayClosed')}</span>}
        </div>
        <div ref={d.stageRef} className={displayStyles.stage} data-testid="python-display-stage">
          <canvas
            ref={d.canvasRef}
            tabIndex={info ? 0 : -1}
            className={[
              displayStyles.canvas,
              d.pixelated ? displayStyles.pixelated : '',
              d.focused ? displayStyles.canvasFocused : '',
              info && !open ? displayStyles.closedCanvas : '',
            ].join(' ')}
            style={{ display: info ? 'block' : 'none', width: d.cssWidth, height: d.cssHeight }}
            aria-label={t('python.displayCanvasAria', { title: info?.title ?? '' })}
            data-testid="python-display-canvas"
          />
          {!info && (
            <div className={displayStyles.empty} data-testid="python-display-empty">
              <div className={displayStyles.emptyTitle}>{t('python.displayEmptyTitle')}</div>
              <div className={displayStyles.emptyDesc}>{t('python.displayEmptyDesc')}</div>
              <code className={displayStyles.code}>{STARTER}</code>
            </div>
          )}
        </div>
      </div>

      {onResizeWorkspace && !compact && !d.fullscreen && (
        <div
          className={displayStyles.resizeHandle}
          role="separator"
          aria-orientation="horizontal"
          aria-label={t('python.displayResizeAria')}
          tabIndex={0}
          onPointerDown={handleResizeDown}
          onKeyDown={handleResizeKey}
          data-testid="python-display-resize"
        />
      )}
    </div>
  );
}
