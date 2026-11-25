// The desktop dock of the Python playground (docs/python/notes-L1.md §8): renders the shown split tree
// (useDockLayout) as nested flex splits with splitters, and a DockGroup per group. It never renders the
// panels themselves; their hosts are moved into the group bodies (usePanelHosts), so tab switches,
// preset switches and splitter drags never re-create xterm, Monaco or the display. L2b: drag and drop
// (useTabDrag + DragOverlay) and the Move to… menu (MoveToMenu) move panels; either makes the layout Custom.
import { Fragment, useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode } from 'react';

import { findGroup, findPanel, minSize, moveIfChanged, moveTargets } from '../../../lib/python/layout/model';
import type { DropTarget, LayoutNode, PanelId, SplitNode } from '../../../lib/python/layout/model';
import { useI18n } from '../../../lib/ui/i18n';
import pyStyles from '../../../styles/Python.module.css';
import layoutStyles from '../../../styles/PythonLayout.module.css';
import DockGroup, { PANEL_LABEL_KEYS } from './DockGroup';
import DragOverlay from './DragOverlay';
import MoveToMenu from './MoveToMenu';
import type { MoveItem } from './MoveToMenu';
import Splitter from './Splitter';
import { useTabDrag } from './useTabDrag';
import type { DockApi } from './useDockLayout';
import type { HostRegistry } from './usePanelHosts';

interface Props {
  readonly dock: DockApi;
  readonly registry: HostRegistry;
  readonly isRunning: boolean;
  readonly plotsUnread: number;
  readonly onSelectTab: (groupId: string, panel: PanelId) => void;
  readonly consoleExtras?: ReactNode;
  /** Height set by the Display panel's resize handle (px), or null for the default. */
  readonly height: number | null;
}

interface Ctx extends Omit<Props, 'height'> {
  readonly label: (n: LayoutNode) => string;
  readonly onDragStart: (panel: PanelId, e: ReactPointerEvent<HTMLElement>) => void;
  readonly onOpenMove: (panel: PanelId, anchor: HTMLElement) => void;
  readonly menuPanel: PanelId | null;
}

const TARGET_ORDER = { tab: 0, edge: 1, page: 2 } as const;
const EDGE_KEYS = {
  top: 'python.layoutTarget.top',
  bottom: 'python.layoutTarget.bottom',
  left: 'python.layoutTarget.left',
  right: 'python.layoutTarget.right',
} as const;

function targetKey(tg: DropTarget): string {
  if (tg.kind === 'page') return `page-${tg.edge}`;
  if (tg.kind === 'tab') return `tab-${tg.groupId}`;
  return `edge-${tg.groupId}-${tg.edge}`;
}

function SplitView({ node, ctx }: { readonly node: SplitNode; readonly ctx: Ctx }) {
  const { t } = useI18n();
  const splitRef = useRef<HTMLDivElement>(null);
  const cellRefs = useRef<Array<HTMLDivElement | null>>([]);
  const getSplit = useCallback(() => splitRef.current, []);
  const getCell = useCallback((i: number) => cellRefs.current[i] ?? null, []);
  const mins = node.children.map(minSize);
  const minPx = mins.map((m) => (node.dir === 'row' ? m.w : m.h));
  const { resizeSplit, resetSplit } = ctx.dock;
  const commit = useCallback(
    (sizes: number[]) => resizeSplit(node.id, Object.fromEntries(node.children.map((c, i) => [c.id, sizes[i]]))),
    [resizeSplit, node],
  );
  const reset = useCallback(() => resetSplit(node.id), [resetSplit, node.id]);

  return (
    <div ref={splitRef} className={layoutStyles.split} data-dir={node.dir} data-split={node.id}>
      {node.children.map((c, i) => {
        const style: CSSProperties = { flexGrow: node.sizes[i], minWidth: mins[i].w, minHeight: mins[i].h };
        return (
          <Fragment key={c.id}>
            {i > 0 && (
              <Splitter
                splitId={node.id}
                dir={node.dir}
                index={i}
                sizes={node.sizes}
                minPx={minPx}
                label={t('python.layoutResize', { a: ctx.label(node.children[i - 1]), b: ctx.label(c) })}
                getSplit={getSplit}
                getCell={getCell}
                onCommit={commit}
                onReset={reset}
              />
            )}
            <div
              ref={(el) => {
                cellRefs.current[i] = el;
              }}
              className={layoutStyles.cell}
              style={style}
            >
              <NodeView node={c} ctx={ctx} />
            </div>
          </Fragment>
        );
      })}
    </div>
  );
}

function NodeView({ node, ctx }: { readonly node: LayoutNode; readonly ctx: Ctx }) {
  if (node.kind === 'split') return <SplitView node={node} ctx={ctx} />;
  return (
    <DockGroup
      group={node}
      active={ctx.dock.activeOf(node)}
      registry={ctx.registry}
      isRunning={ctx.isRunning}
      plotsUnread={ctx.plotsUnread}
      onSelect={ctx.onSelectTab}
      consoleExtras={ctx.consoleExtras}
      onDragStart={ctx.onDragStart}
      onOpenMove={ctx.onOpenMove}
      menuPanel={ctx.menuPanel}
    />
  );
}

export default function DockLayout({ height, ...rest }: Props) {
  const { t } = useI18n();
  const rootRef = useRef<HTMLDivElement>(null);
  const { setWidth } = rest.dock;

  // One ResizeObserver on the dock root drives the narrow-window merge rule (fitToWidth).
  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return undefined;
    setWidth(el.clientWidth);
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, [setWidth]);

  const label = useCallback(
    (n: LayoutNode): string => {
      if (n.kind === 'group') return n.panels.map((p) => t(PANEL_LABEL_KEYS[p])).join(', ');
      return n.children.map((c) => label(c)).join(', ');
    },
    [t],
  );

  const { dock, onSelectTab } = rest;
  const treeRef = useRef(dock.tree);
  treeRef.current = dock.tree;
  const panelName = useCallback((p: PanelId) => t(PANEL_LABEL_KEYS[p]), [t]);

  /** "With Console and REPL", "Below Editor", "Full width at the bottom": the name of a place for `moving`, from the stored tree. */
  const describe = useCallback(
    (target: DropTarget, moving: PanelId): string => {
      if (target.kind === 'page') return t(target.edge === 'bottom' ? 'python.layoutTarget.pageBottom' : 'python.layoutTarget.pageRight');
      const g = findGroup(treeRef.current, target.groupId);
      const names = (g?.panels ?? []).filter((p) => p !== moving).map(panelName);
      const joined =
        names.length > 1 ? t('python.layoutAnd', { a: names.slice(0, -1).join(', '), b: names[names.length - 1] }) : (names[0] ?? '');
      if (target.kind === 'tab') return t('python.layoutTarget.with', { names: joined });
      return t(EDGE_KEYS[target.edge], { names: joined });
    },
    [t, panelName],
  );

  // After a move: the panel is the active tab of the group it is now shown in, and its tab (or handle) has focus.
  const pendingFocusRef = useRef<PanelId | null>(null);
  const [announce, setAnnounce] = useState('');
  const doMove = useCallback(
    (panel: PanelId, target: DropTarget) => {
      const where = describe(target, panel);
      if (!dock.moveTo(panel, target)) return;
      pendingFocusRef.current = panel;
      setAnnounce(t('python.layoutMoved', { panel: panelName(panel), where }));
    },
    [dock, describe, t, panelName],
  );
  useLayoutEffect(() => {
    const panel = pendingFocusRef.current;
    if (!panel) return;
    pendingFocusRef.current = null;
    const g = findPanel(dock.shownTree, panel);
    if (!g) return;
    if (g.panels.length > 1) onSelectTab(g.id, panel);
    rootRef.current?.querySelector<HTMLElement>(`[data-dock-group="${g.id}"] [data-tab-panel="${panel}"]`)?.focus({ preventScroll: true });
  }, [dock.shownTree, onSelectTab]);

  const getTree = useCallback(() => treeRef.current, []);
  const { drag, ghostRef, start } = useTabDrag({ rootRef, getTree, onDrop: doMove });

  const [menu, setMenu] = useState<{ readonly panel: PanelId; readonly anchor: HTMLElement } | null>(null);
  const onOpenMove = useCallback((panel: PanelId, anchor: HTMLElement) => {
    setMenu((m) => (m && m.panel === panel && m.anchor === anchor ? null : { panel, anchor }));
  }, []);
  const closeMenu = useCallback((restoreFocus: boolean) => {
    setMenu((m) => {
      if (m && restoreFocus && m.anchor.isConnected) m.anchor.focus({ preventScroll: true });
      return null;
    });
  }, []);
  const menuItems = useMemo<MoveItem[]>(() => {
    if (!menu) return [];
    return moveTargets(dock.tree, menu.panel)
      .filter((tg) => (tg.kind === 'page' || findGroup(dock.visibleTree, tg.groupId) !== null) && moveIfChanged(dock.tree, menu.panel, tg))
      .sort((a, b) => TARGET_ORDER[a.kind] - TARGET_ORDER[b.kind])
      .map((tg) => ({ key: targetKey(tg), label: describe(tg, menu.panel), target: tg }));
  }, [menu, dock.tree, dock.visibleTree, describe]);
  // A layout change (preset, Reset, a drop) while the menu is open closes it: its places would be stale.
  const menuTreeRef = useRef(dock.tree);
  useLayoutEffect(() => {
    if (menuTreeRef.current !== dock.tree) setMenu(null);
    menuTreeRef.current = dock.tree;
  }, [dock.tree]);

  const ctx: Ctx = { ...rest, label, onDragStart: start, onOpenMove, menuPanel: menu?.panel ?? null };
  return (
    <div
      ref={rootRef}
      className={[layoutStyles.dock, rest.dock.tall ? layoutStyles.dockTall : '', pyStyles.dockFill].filter(Boolean).join(' ')}
      style={height ? { height, maxHeight: 'none' } : undefined}
      data-python-workspace=""
      data-layout-mode={rest.dock.mode}
      data-dragging={drag ? '' : undefined}
      data-testid="python-dock"
    >
      <NodeView node={rest.dock.shownTree} ctx={ctx} />
      {drag && (
        <DragOverlay
          drag={drag}
          ghostRef={ghostRef}
          panelLabel={panelName(drag.panel)}
          zoneLabel={drag.zone ? describe(drag.zone.target, drag.panel) : null}
        />
      )}
      <div className={layoutStyles.srOnly} role="status" aria-live="polite" data-testid="python-layout-status">
        {announce}
      </div>
      {menu && menuItems.length > 0 && (
        <MoveToMenu
          anchor={menu.anchor}
          label={t('python.layoutMoveTo', { panel: panelName(menu.panel) })}
          items={menuItems}
          onPick={(target) => {
            setMenu(null);
            doMove(menu.panel, target);
          }}
          onClose={closeMenu}
        />
      )}
    </div>
  );
}
