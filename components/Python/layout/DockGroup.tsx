// One group of the desktop dock: a tab strip (page UI) over a body slot that holds the group's panel
// hosts. When the active panel is program output (Console, REPL, Plots, Display) the group is framed
// and labelled "Program output" (security.md §4), as the output column was before the dock. L2b: tabs
// (or, in an Editor-only or Files-only group, a small handle) start a drag and open the Move to… menu.
import { useMemo } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent, ReactNode } from 'react';

import { groupHasHeader, isOutputPanel } from '../../../lib/python/layout/model';
import type { GroupNode, PanelId } from '../../../lib/python/layout/model';
import { useI18n } from '../../../lib/ui/i18n';
import pyStyles from '../../../styles/Python.module.css';
import layoutStyles from '../../../styles/PythonLayout.module.css';
import PillTabs from '../../UI/PillTabs';
import type { PillTabExtraProps, PillTabItem } from '../../UI/PillTabs';
import HostSlot from './HostSlot';
import type { HostRegistry } from './usePanelHosts';

export const PANEL_LABEL_KEYS = {
  files: 'python.tabFiles',
  editor: 'python.tabEditor',
  console: 'python.tabConsole',
  repl: 'python.tabRepl',
  plots: 'python.tabPlots',
  display: 'python.tabDisplay',
} as const satisfies Record<PanelId, string>;

interface Props {
  readonly group: GroupNode;
  readonly active: PanelId;
  readonly registry: HostRegistry;
  readonly isRunning: boolean;
  readonly plotsUnread: number;
  readonly onSelect: (groupId: string, panel: PanelId) => void;
  /** Page UI shown between the tab strip and the body of the group that holds the Console (traceback chips). */
  readonly consoleExtras?: ReactNode;
  /** Pointer down on a tab or the handle (useTabDrag decides whether it becomes a drag). */
  readonly onDragStart: (panel: PanelId, e: ReactPointerEvent<HTMLElement>) => void;
  /** Opens the Move to… menu of a panel under `anchor`. */
  readonly onOpenMove: (panel: PanelId, anchor: HTMLElement) => void;
  /** The panel whose Move to… menu is open, if any. */
  readonly menuPanel: PanelId | null;
}

function DragDots() {
  return (
    <svg width="10" height="14" viewBox="0 0 10 14" aria-hidden="true" focusable="false">
      {[2, 7, 12].map((y) => [2.5, 7.5].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.4" fill="currentColor" />))}
    </svg>
  );
}

const isMenuKey = (e: ReactKeyboardEvent) => e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey);

export default function DockGroup({
  group,
  active,
  registry,
  isRunning,
  plotsUnread,
  onSelect,
  consoleExtras,
  onDragStart,
  onOpenMove,
  menuPanel,
}: Props) {
  const { t } = useI18n();
  const header = groupHasHeader(group);
  const framed = isOutputPanel(active);
  const holdsConsole = group.panels.includes('console');
  const items = useMemo<readonly PillTabItem<PanelId>[]>(
    () =>
      group.panels.map((p) => ({
        id: p,
        label: t(PANEL_LABEL_KEYS[p]),
        disabled: p === 'repl' && isRunning,
        badge: p === 'plots' && plotsUnread > 0 ? plotsUnread : undefined,
      })),
    [group.panels, t, isRunning, plotsUnread],
  );

  const onlyFiles = group.panels.length === 1 && group.panels[0] === 'files';
  const className = [
    layoutStyles.group,
    onlyFiles ? '' : pyStyles.paneCard,
    framed ? pyStyles.programOutputFrame : '',
  ]
    .filter(Boolean)
    .join(' ');

  const names = items.map((i) => i.label);
  const tabsAria = holdsConsole
    ? t('python.outputNavAria')
    : t('python.layoutGroupTabsAria', {
      names: names.length > 1 ? t('python.layoutAnd', { a: names.slice(0, -1).join(', '), b: names[names.length - 1] }) : names[0],
    });

  const tabProps = (p: PanelId): PillTabExtraProps => ({
    'data-tab-panel': p,
    className: layoutStyles.dragTab,
    'aria-keyshortcuts': 'Shift+F10',
    onPointerDown: (e) => onDragStart(p, e),
    onContextMenu: (e) => {
      e.preventDefault();
      onOpenMove(p, e.currentTarget);
    },
    onKeyDown: (e) => {
      if (!isMenuKey(e)) return;
      e.preventDefault();
      onOpenMove(p, e.currentTarget);
    },
  });
  const activeLabel = t(PANEL_LABEL_KEYS[active]);
  const single = group.panels[0];
  const singleLabel = t(PANEL_LABEL_KEYS[single]);

  return (
    <section
      className={className}
      aria-label={framed ? t('python.programOutput') : t(PANEL_LABEL_KEYS[active])}
      data-dock-group={group.id}
      data-program-output={framed ? '' : undefined}
      data-testid={holdsConsole ? 'python-program-output-frame' : undefined}
      data-handle={header ? undefined : ''}
    >
      {!header && (
        <button
          type="button"
          className={layoutStyles.groupHandle}
          data-tab-panel={single}
          aria-label={t('python.layoutHandle', { panel: singleLabel })}
          title={t('python.layoutHandleTitle', { panel: singleLabel })}
          aria-haspopup="menu"
          aria-expanded={menuPanel === single}
          aria-keyshortcuts="Shift+F10"
          onPointerDown={(e) => onDragStart(single, e)}
          onClick={(e) => onOpenMove(single, e.currentTarget)}
          onKeyDown={(e) => {
            if (!isMenuKey(e)) return;
            e.preventDefault();
            onOpenMove(single, e.currentTarget);
          }}
          data-testid={`python-move-handle-${single}`}
        >
          <DragDots />
        </button>
      )}
      {header && (
        <div className={[pyStyles.paneHeader, layoutStyles.groupHeader].join(' ')} data-dock-header="">
          <div className={[pyStyles.paneHeaderLeft, layoutStyles.groupHeaderLeft].join(' ')}>
            {framed && (
              <span
                className={pyStyles.programOutputLabel}
                data-testid={holdsConsole ? 'python-program-output-label' : undefined}
              >
                {t('python.programOutput')}
              </span>
            )}
            <PillTabs
              items={items}
              value={active}
              onChange={(next) => onSelect(group.id, next)}
              ariaLabel={tabsAria}
              size="sm"
              variant="subtle"
              tabProps={tabProps}
            />
          </div>
          <button
            type="button"
            className={layoutStyles.moveBtn}
            aria-label={t('python.layoutMoveTo', { panel: activeLabel }) + '…'}
            title={t('python.layoutMoveBtnTitle', { panel: activeLabel })}
            aria-haspopup="menu"
            aria-expanded={menuPanel === active}
            onClick={(e) => onOpenMove(active, e.currentTarget)}
            data-testid="python-move-btn"
          >
            <span aria-hidden="true">&#8943;</span>
          </button>
        </div>
      )}
      {holdsConsole && consoleExtras}
      <HostSlot
        registry={registry}
        panels={group.panels}
        shown={active}
        className={layoutStyles.groupBody}
        data-tabbed={group.panels.length > 1 ? '' : undefined}
      />
    </section>
  );
}
