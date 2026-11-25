// The desktop dock of the Python playground (docs/python/notes-L1.md §8): renders the shown split tree
// (useDockLayout) as nested flex splits with splitters, and a DockGroup per group. It never renders the
// panels themselves; their hosts are moved into the group bodies (usePanelHosts), so tab switches,
// preset switches and splitter drags never re-create xterm, Monaco or the display.
import { Fragment, useCallback, useLayoutEffect, useRef } from 'react';
import type { CSSProperties, ReactNode } from 'react';

import { minSize } from '../../../lib/python/layout/model';
import type { LayoutNode, PanelId, SplitNode } from '../../../lib/python/layout/model';
import { useI18n } from '../../../lib/ui/i18n';
import pyStyles from '../../../styles/Python.module.css';
import layoutStyles from '../../../styles/PythonLayout.module.css';
import DockGroup, { PANEL_LABEL_KEYS } from './DockGroup';
import Splitter from './Splitter';
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

  const ctx: Ctx = { ...rest, label };
  return (
    <div
      ref={rootRef}
      className={[layoutStyles.dock, rest.dock.tall ? layoutStyles.dockTall : '', pyStyles.dockFill].filter(Boolean).join(' ')}
      style={height ? { height, maxHeight: 'none' } : undefined}
      data-python-workspace=""
      data-layout-mode={rest.dock.mode}
      data-testid="python-dock"
    >
      <NodeView node={rest.dock.shownTree} ctx={ctx} />
    </div>
  );
}
