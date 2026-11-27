import React, { useRef } from 'react';

import { clampFloatingPanel } from '../../lib/paint/geometry';
import type { DockSide, PanelId, PanelLayout } from '../../lib/paint/types';
import { useI18n } from '../../lib/ui/i18n';
import styles from '../../styles/PaintPanels.module.css';
import { CloseIcon, DockLeftIcon, DockRightIcon, FloatIcon } from './icons';

export interface DockablePanelProps {
  id: PanelId;
  title: string;
  layout: PanelLayout;
  workspaceRef: React.RefObject<HTMLDivElement | null>;
  onChangeLayout: (patch: Partial<PanelLayout>) => void;
  onFocus: () => void;
  onDragSnapPreview?: (side: 'left' | 'right' | null) => void;
  children: React.ReactNode;
}

const SNAP_EDGE_PX = 48;
const UNDOCK_THRESHOLD_PX = 18;

export default function DockablePanel({
  id,
  title,
  layout,
  workspaceRef,
  onChangeLayout,
  onFocus,
  onDragSnapPreview,
  children,
}: DockablePanelProps) {
  const { t } = useI18n();
  const panelRef = useRef<HTMLElement | null>(null);

  if (!layout.visible) return null;

  const isFloating = layout.dock === 'floating';

  const handleHeaderPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // Ignore clicks on header buttons
    if ((e.target as HTMLElement).closest('button')) return;
    if (e.button !== 0) return;

    const ws = workspaceRef.current;
    const panel = panelRef.current;
    if (!ws || !panel) return;

    e.preventDefault();
    onFocus();

    const wsRect = ws.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    const startClientX = e.clientX;
    const startClientY = e.clientY;
    const offsetX = e.clientX - panelRect.left;
    const offsetY = e.clientY - panelRect.top;
    let floatingNow = isFloating;
    let snapTarget: 'left' | 'right' | null = null;

    const targetEl = e.currentTarget;
    targetEl.setPointerCapture(e.pointerId);

    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startClientX;
      const dy = ev.clientY - startClientY;

      if (!floatingNow && Math.hypot(dx, dy) >= UNDOCK_THRESHOLD_PX) {
        floatingNow = true;
      }

      if (!floatingNow) return;

      const relX = ev.clientX - wsRect.left - offsetX;
      const relY = ev.clientY - wsRect.top - offsetY;
      const clamped = clampFloatingPanel(
        relX,
        relY,
        panelRect.width || 272,
        panelRect.height || 320,
        wsRect.width,
        wsRect.height,
      );

      onChangeLayout({ dock: 'floating', x: clamped.x, y: clamped.y });

      const cursorRelX = ev.clientX - wsRect.left;
      if (cursorRelX <= SNAP_EDGE_PX) {
        snapTarget = 'left';
      } else if (cursorRelX >= wsRect.width - SNAP_EDGE_PX) {
        snapTarget = 'right';
      } else {
        snapTarget = null;
      }
      onDragSnapPreview?.(snapTarget);
    };

    const onUp = (ev: PointerEvent) => {
      try {
        targetEl.releasePointerCapture(ev.pointerId);
      } catch {
        // ignore if already released
      }
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      onDragSnapPreview?.(null);

      if (floatingNow && snapTarget) {
        onChangeLayout({ dock: snapTarget });
      }
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  const dockTo = (side: DockSide) => {
    if (side === 'floating') {
      const ws = workspaceRef.current;
      const panel = panelRef.current;
      let nextX = layout.x;
      let nextY = layout.y;
      if (ws && panel) {
        const wsRect = ws.getBoundingClientRect();
        const pRect = panel.getBoundingClientRect();
        const panelW = pRect.width || 274;
        const panelH = pRect.height || 320;
        const wideEnoughForSideBySide = wsRect.width >= 960;
        const extraOffset = id === 'layers' && wideEnoughForSideBySide ? panelW + 16 : 0;

        let rawX = pRect.left - wsRect.left - panelW - 18 - extraOffset;
        let rawY = id === 'layers' && !wideEnoughForSideBySide ? 56 : 16;

        if (layout.dock === 'left') {
          rawX = pRect.right - wsRect.left + 18 + extraOffset;
        }

        const clamped = clampFloatingPanel(
          rawX,
          rawY,
          panelW,
          panelH,
          wsRect.width,
          wsRect.height,
        );
        nextX = clamped.x;
        nextY = clamped.y;
      }
      onFocus();
      onChangeLayout({ dock: 'floating', x: nextX, y: nextY });
    } else {
      onChangeLayout({ dock: side });
    }
  };

  return (
    <section
      ref={panelRef}
      data-testid={`paint-panel-${id}`}
      data-dock-state={layout.dock}
      aria-label={title}
      className={[styles.panel, isFloating ? styles.panelFloating : styles.panelDocked].join(' ')}
      style={
        isFloating
          ? { left: `${layout.x}px`, top: `${layout.y}px`, zIndex: layout.zIndex }
          : undefined
      }
      onPointerDown={() => {
        if (isFloating) onFocus();
      }}
    >
      <div
        className={styles.panelHeader}
        onPointerDown={handleHeaderPointerDown}
        title={isFloating ? title : `${title} — drag to float`}
      >
        <span className={styles.panelGrip} aria-hidden="true">
          ⋮⋮
        </span>
        <h2 className={styles.panelTitle}>{title}</h2>
        <div className={styles.panelHeaderActions}>
          {isFloating ? (
            <>
              <button
                type="button"
                className={styles.panelHeaderBtn}
                onClick={() => dockTo('left')}
                aria-label={`${title}: ${t('paint.panel.dockLeft')}`}
                title={t('paint.panel.dockLeft')}
              >
                <DockLeftIcon />
              </button>
              <button
                type="button"
                className={styles.panelHeaderBtn}
                onClick={() => dockTo('right')}
                aria-label={`${title}: ${t('paint.panel.dockRight')}`}
                title={t('paint.panel.dockRight')}
              >
                <DockRightIcon />
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className={styles.panelHeaderBtn}
                onClick={() => dockTo(layout.dock === 'right' ? 'left' : 'right')}
                aria-label={`${title}: ${layout.dock === 'right' ? t('paint.panel.dockLeft') : t('paint.panel.dockRight')}`}
                title={layout.dock === 'right' ? t('paint.panel.dockLeft') : t('paint.panel.dockRight')}
              >
                {layout.dock === 'right' ? <DockLeftIcon /> : <DockRightIcon />}
              </button>
              <button
                type="button"
                className={styles.panelHeaderBtn}
                onClick={() => dockTo('floating')}
                aria-label={`${title}: ${t('paint.panel.float')}`}
                title={t('paint.panel.float')}
              >
                <FloatIcon />
              </button>
            </>
          )}
          <button
            type="button"
            className={styles.panelHeaderBtn}
            onClick={() => onChangeLayout({ visible: false })}
            aria-label={`${title}: ${t('paint.panel.close')}`}
            title={t('paint.panel.close')}
          >
            <CloseIcon />
          </button>
        </div>
      </div>

      <div className={styles.panelBody}>{children}</div>
    </section>
  );
}
