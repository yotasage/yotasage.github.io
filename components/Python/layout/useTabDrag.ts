// Drag and drop of dock panels (docs/python/notes-L1.md §8): a pointer drag on a group tab or a drag
// handle starts after 6 px (10 px for touch), then a full-dock overlay (DragOverlay.tsx) shields the
// group bodies (iframes, the display canvas and Monaco never see the pointer), a ghost follows the
// pointer and a preview shows where the panel lands. Zones are computed against the stored tree
// (treeForLayout), the group rects are cached at the start. Esc, pointercancel or a drop on no zone
// cancels; a drop calls onDrop with a target that moveIfChanged accepts.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';

import { PAGE_EDGE_FRACTION, findGroup, isPanelId, moveIfChanged } from '../../../lib/python/layout/model';
import type { DropTarget, Edge, LayoutNode, PanelId } from '../../../lib/python/layout/model';

/** Width of the bands along the dock's bottom and right edges that drop a panel across the whole dock. */
export const PAGE_EDGE_BAND_PX = 28;

export interface Box {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface DragZone {
  readonly key: string;
  readonly target: DropTarget;
  /** Preview of the area the panel would take, relative to the dock root. */
  readonly box: Box;
}

export interface DragView {
  readonly panel: PanelId;
  /** Pointer position relative to the dock root when the drag started (the ghost's first place). */
  readonly x: number;
  readonly y: number;
  readonly zone: DragZone | null;
}

interface GroupGeom {
  readonly id: string;
  readonly rect: DOMRect;
  readonly strip: DOMRect | null;
  readonly tabs: ReadonlyArray<{ readonly panel: PanelId; readonly mid: number }>;
}

interface Session {
  readonly panel: PanelId;
  readonly pointerId: number;
  readonly el: HTMLElement;
  readonly sx: number;
  readonly sy: number;
  readonly threshold: number;
  phase: 'pending' | 'dragging' | 'cancelled';
  root: DOMRect | null;
  groups: GroupGeom[];
  zone: DragZone | null;
  stop: () => void;
}

interface Options {
  readonly rootRef: { readonly current: HTMLElement | null };
  /** The stored tree (treeForLayout), read at every pointer move. */
  readonly getTree: () => LayoutNode;
  readonly onDrop: (panel: PanelId, target: DropTarget) => void;
}

const inside = (r: DOMRect, x: number, y: number) => x >= r.left && x < r.right && y >= r.top && y < r.bottom;

function rel(r: DOMRect, root: DOMRect): Box {
  return { x: r.left - root.left, y: r.top - root.top, w: r.width, h: r.height };
}

function edgeBox(b: Box, edge: Edge): Box {
  if (edge === 'left') return { ...b, w: b.w / 2 };
  if (edge === 'right') return { ...b, x: b.x + b.w / 2, w: b.w / 2 };
  if (edge === 'top') return { ...b, h: b.h / 2 };
  return { ...b, y: b.y + b.h / 2, h: b.h / 2 };
}

function measureGroups(root: HTMLElement): GroupGeom[] {
  return Array.from(root.querySelectorAll<HTMLElement>('[data-dock-group]')).map((el) => {
    const header = el.querySelector<HTMLElement>('[data-dock-header]');
    const tabs: Array<{ panel: PanelId; mid: number }> = [];
    if (header) {
      for (const tab of Array.from(header.querySelectorAll<HTMLElement>('[role="tab"][data-tab-panel]'))) {
        const p = tab.dataset.tabPanel;
        const r = tab.getBoundingClientRect();
        if (isPanelId(p)) tabs.push({ panel: p, mid: r.left + r.width / 2 });
      }
    }
    return { id: el.dataset.dockGroup ?? '', rect: el.getBoundingClientRect(), strip: header?.getBoundingClientRect() ?? null, tabs };
  });
}

/** The drop zone under a point, or null (outside the dock, a forbidden target, or the panel's own place). */
function zoneAt(tree: LayoutNode, panel: PanelId, root: DOMRect, groups: readonly GroupGeom[], x: number, y: number): DragZone | null {
  if (!inside(root, x, y)) return null;
  const rb: Box = { x: 0, y: 0, w: root.width, h: root.height };
  const accept = (key: string, target: DropTarget, box: Box): DragZone | null =>
    moveIfChanged(tree, panel, target) ? { key, target, box } : null;

  if (root.bottom - y <= PAGE_EDGE_BAND_PX) {
    const h = rb.h * PAGE_EDGE_FRACTION.bottom;
    return accept('page-bottom', { kind: 'page', edge: 'bottom' }, { x: 0, y: rb.h - h, w: rb.w, h });
  }
  if (root.right - x <= PAGE_EDGE_BAND_PX) {
    const w = rb.w * PAGE_EDGE_FRACTION.right;
    return accept('page-right', { kind: 'page', edge: 'right' }, { x: rb.w - w, y: 0, w, h: rb.h });
  }
  const g = groups.find((c) => inside(c.rect, x, y));
  if (!g) return null;
  const stored = findGroup(tree, g.id);
  if (!stored) return null;
  const box = rel(g.rect, root);
  const editor = stored.panels.includes('editor');
  if (!editor && g.strip && inside(g.strip, x, y)) {
    // Over the tab strip: insert at the pointer (index among the stored group's own tabs).
    const index = g.tabs.filter((tb) => tb.mid < x && stored.panels.includes(tb.panel)).length;
    return accept(`tab-${g.id}-${index}`, { kind: 'tab', groupId: g.id, index }, box);
  }
  const nx = (x - g.rect.left) / g.rect.width;
  const ny = (y - g.rect.top) / g.rect.height;
  if (!editor && nx >= 0.25 && nx <= 0.75 && ny >= 0.25 && ny <= 0.75) {
    return accept(`tab-${g.id}-end`, { kind: 'tab', groupId: g.id, index: stored.panels.length }, box);
  }
  const dists: Array<[Edge, number]> = [
    ['left', nx],
    ['right', 1 - nx],
    ['top', ny],
    ['bottom', 1 - ny],
  ];
  dists.sort((a, b) => a[1] - b[1]);
  const edge = dists[0][0];
  return accept(`edge-${g.id}-${edge}`, { kind: 'edge', groupId: g.id, edge }, edgeBox(box, edge));
}

/** Swallows the click that follows a drag's pointerup (it would select the tab under the pointer). */
function swallowNextClick(): void {
  const swallow = (ev: MouseEvent) => {
    ev.stopPropagation();
    ev.preventDefault();
  };
  window.addEventListener('click', swallow, true);
  window.setTimeout(() => window.removeEventListener('click', swallow, true), 0);
}

export function useTabDrag({ rootRef, getTree, onDrop }: Options) {
  const [drag, setDrag] = useState<DragView | null>(null);
  const ghostRef = useRef<HTMLDivElement>(null);
  const sessionRef = useRef<Session | null>(null);
  const optsRef = useRef({ getTree, onDrop });
  optsRef.current = { getTree, onDrop };

  useEffect(() => () => sessionRef.current?.stop(), []);

  const start = useCallback(
    (panel: PanelId, e: ReactPointerEvent<HTMLElement>) => {
      if (sessionRef.current || !e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) return;
      const el = e.currentTarget;
      if (el instanceof HTMLButtonElement && el.disabled) return;
      const prevSelect = document.body.style.userSelect;

      const finish = () => {
        s.stop();
        if (s.phase !== 'pending') swallowNextClick();
      };

      const update = (x: number, y: number) => {
        const root = s.root;
        if (!root) return;
        const ghost = ghostRef.current;
        if (ghost) ghost.style.transform = `translate(${Math.round(x - root.left + 14)}px, ${Math.round(y - root.top + 10)}px)`;
        const zone = zoneAt(optsRef.current.getTree(), panel, root, s.groups, x, y);
        if ((zone?.key ?? null) !== (s.zone?.key ?? null)) {
          s.zone = zone;
          setDrag((d) => (d ? { ...d, zone } : d));
        }
      };

      const measure = () => {
        const root = rootRef.current;
        if (!root) return false;
        s.root = root.getBoundingClientRect();
        s.groups = measureGroups(root);
        return true;
      };

      const begin = (x: number, y: number) => {
        if (!measure() || !s.root) {
          finish();
          return;
        }
        s.phase = 'dragging';
        try {
          el.setPointerCapture(s.pointerId);
        } catch {
          // the pointer is already gone; pointerup/cancel ends the drag
        }
        document.body.style.userSelect = 'none';
        document.getSelection()?.removeAllRanges();
        setDrag({ panel, x: x - s.root.left, y: y - s.root.top, zone: null });
        update(x, y);
      };

      const onMove = (ev: PointerEvent) => {
        if (ev.pointerId !== s.pointerId) return;
        if (s.phase === 'pending') {
          if (Math.hypot(ev.clientX - s.sx, ev.clientY - s.sy) < s.threshold) return;
          begin(ev.clientX, ev.clientY);
        }
        if (s.phase !== 'dragging') return;
        ev.preventDefault();
        update(ev.clientX, ev.clientY);
      };

      const onUp = (ev: PointerEvent) => {
        if (ev.pointerId !== s.pointerId) return;
        const zone = s.phase === 'dragging' ? s.zone : null;
        finish();
        if (zone) optsRef.current.onDrop(panel, zone.target);
      };

      const onCancel = (ev: PointerEvent) => {
        if (ev.pointerId === s.pointerId) finish();
      };

      const onKey = (ev: KeyboardEvent) => {
        if (ev.key !== 'Escape' || s.phase !== 'dragging') return;
        ev.preventDefault();
        ev.stopPropagation();
        // Cancelled: the visuals go now, the listeners stay until the pointer is released (its click is swallowed).
        s.phase = 'cancelled';
        s.zone = null;
        clearVisuals();
      };

      const onScroll = () => {
        if (s.phase === 'dragging') measure();
      };

      const clearVisuals = () => {
        document.body.style.userSelect = prevSelect;
        try {
          if (el.hasPointerCapture(s.pointerId)) el.releasePointerCapture(s.pointerId);
        } catch {
          // already released
        }
        setDrag(null);
      };

      const s: Session = {
        panel,
        pointerId: e.pointerId,
        el,
        sx: e.clientX,
        sy: e.clientY,
        threshold: e.pointerType === 'touch' ? 10 : 6,
        phase: 'pending',
        root: null,
        groups: [],
        zone: null,
        stop: () => {
          window.removeEventListener('pointermove', onMove, true);
          window.removeEventListener('pointerup', onUp, true);
          window.removeEventListener('pointercancel', onCancel, true);
          window.removeEventListener('keydown', onKey, true);
          window.removeEventListener('scroll', onScroll, true);
          if (s.phase === 'dragging') clearVisuals();
          if (sessionRef.current === s) sessionRef.current = null;
        },
      };
      sessionRef.current = s;
      window.addEventListener('pointermove', onMove, true);
      window.addEventListener('pointerup', onUp, true);
      window.addEventListener('pointercancel', onCancel, true);
      window.addEventListener('keydown', onKey, true);
      window.addEventListener('scroll', onScroll, true);
    },
    [rootRef],
  );

  return { drag, ghostRef, start };
}
