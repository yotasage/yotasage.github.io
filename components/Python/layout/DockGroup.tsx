// One group of the desktop dock: a tab strip (page UI) over a body slot that holds the group's panel
// hosts. When the active panel is program output (Console, REPL, Plots, Display) the group is framed
// and labelled "Program output" (security.md §4), as the output column was before the dock.
import { useMemo } from 'react';
import type { ReactNode } from 'react';

import { groupHasHeader, isOutputPanel } from '../../../lib/python/layout/model';
import type { GroupNode, PanelId } from '../../../lib/python/layout/model';
import { useI18n } from '../../../lib/ui/i18n';
import pyStyles from '../../../styles/Python.module.css';
import layoutStyles from '../../../styles/PythonLayout.module.css';
import PillTabs from '../../UI/PillTabs';
import type { PillTabItem } from '../../UI/PillTabs';
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
}

export default function DockGroup({ group, active, registry, isRunning, plotsUnread, onSelect, consoleExtras }: Props) {
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

  return (
    <section
      className={className}
      aria-label={framed ? t('python.programOutput') : t(PANEL_LABEL_KEYS[active])}
      data-dock-group={group.id}
      data-program-output={framed ? '' : undefined}
      data-testid={holdsConsole ? 'python-program-output-frame' : undefined}
    >
      {header && (
        <div className={[pyStyles.paneHeader, layoutStyles.groupHeader].join(' ')}>
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
            />
          </div>
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
