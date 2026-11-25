// The overlay of a panel drag (useTabDrag.ts): page UI drawn in the dock root above every group body
// (each body is its own stacking context, security.md §4), so nothing a program draws can cover it. A
// transparent shield takes the pointer from iframes, the display canvas and Monaco; the preview shows
// the area the panel would take with a text label; the ghost follows the pointer (moved through its ref).
import type { RefObject } from 'react';

import layoutStyles from '../../../styles/PythonLayout.module.css';
import type { DragView } from './useTabDrag';

interface Props {
  readonly drag: DragView;
  readonly ghostRef: RefObject<HTMLDivElement | null>;
  readonly panelLabel: string;
  readonly zoneLabel: string | null;
}

export default function DragOverlay({ drag, ghostRef, panelLabel, zoneLabel }: Props) {
  const { zone } = drag;
  return (
    <div className={layoutStyles.dragOverlay} aria-hidden="true" data-testid="python-drag-overlay" data-drag-panel={drag.panel}>
      {zone && (
        <div
          className={layoutStyles.dropPreview}
          style={{ left: zone.box.x, top: zone.box.y, width: zone.box.w, height: zone.box.h }}
          data-testid="python-drop-preview"
          data-drop={zone.key}
        >
          {zoneLabel && <span className={layoutStyles.dropLabel}>{zoneLabel}</span>}
        </div>
      )}
      <div
        ref={ghostRef}
        className={layoutStyles.dragGhost}
        style={{ transform: `translate(${Math.round(drag.x + 14)}px, ${Math.round(drag.y + 10)}px)` }}
      >
        {panelLabel}
      </div>
    </div>
  );
}
