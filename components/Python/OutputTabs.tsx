// The phone's output tabs (Console | REPL | Plots | Display) and pane switcher (Editor | Console |
// Files | Plots | Display), with the pane state they share with the desktop dock (components/Python/layout/). Split from
// PythonPlayground.tsx to keep it under 40 kB.
import { useCallback, useMemo, useRef, useState } from 'react';
import type { RefObject } from 'react';

import type { PanelId } from '../../lib/python/layout/model';
import { useI18n } from '../../lib/ui/i18n';
import styles from '../../styles/Python.module.css';
import PillTabs, { PillTabItem } from '../UI/PillTabs';
import type { PythonEditorHandle } from './PythonEditor';
import type { PythonTerminalHandle } from './PythonTerminal';

export type OutputTab = 'console' | 'repl' | 'plots' | 'display';
export type MobilePane = 'editor' | 'output' | 'files' | 'plots' | 'display';

/** What the desktop dock tells the pane state (components/Python/layout/useDockLayout.ts). */
export interface DockPanes {
  readonly isShown: (p: PanelId) => boolean;
  readonly activate: (p: PanelId) => void;
}

/**
 * Pane state: the phone's pane and output tab, and on desktop the dock's shown panels. `outputTab` is the
 * last chosen output tab on either (the phone uses it; the dock keeps its own active tab per group).
 */
export function useOutputPanes(isNarrow: boolean, dock: DockPanes) {
  const [outputTab, setOutputTab] = useState<OutputTab>('console');
  const [mobilePane, setMobilePane] = useState<MobilePane>('editor');
  const isPlotsVisible = isNarrow ? mobilePane === 'plots' : dock.isShown('plots');
  const isPlotsVisibleRef = useRef(false);
  isPlotsVisibleRef.current = isPlotsVisible;
  /** Output typed in the REPL goes to the REPL while it is the chosen tab. */
  const replActiveRef = useRef(false);
  replActiveRef.current = isNarrow ? outputTab === 'repl' : dock.isShown('repl');
  const showOutputPane = !isNarrow || mobilePane === 'output' || mobilePane === 'plots' || mobilePane === 'display';
  const { activate } = dock;

  /** Shows the console (a run starts, the program asks for input). */
  const showConsole = useCallback(() => {
    setOutputTab('console');
    if (isNarrow) setMobilePane('output');
    else activate('console');
  }, [isNarrow, activate]);

  /** Shows the Display tab (a program opened a display). */
  const showDisplay = useCallback(() => {
    setOutputTab('display');
    if (isNarrow) setMobilePane('display');
    else activate('display');
  }, [isNarrow, activate]);

  /** Whether a panel is on screen (phone: the chosen pane; desktop: the active tab of its group). */
  const isShown = useCallback(
    (p: PanelId): boolean => {
      if (!isNarrow) return dock.isShown(p);
      switch (p) {
        case 'files':
        case 'editor':
          return mobilePane === p;
        case 'plots':
        case 'display':
          return mobilePane === p;
        case 'console':
        case 'repl':
          return mobilePane === 'output' && (outputTab === 'repl' ? 'repl' : 'console') === p;
        default:
          return false;
      }
    },
    [isNarrow, dock, mobilePane, outputTab],
  );

  return {
    outputTab,
    setOutputTab,
    mobilePane,
    setMobilePane,
    replActiveRef,
    isPlotsVisible,
    isPlotsVisibleRef,
    showOutputPane,
    showConsole,
    showDisplay,
    isShown,
  };
}

export type OutputPanes = ReturnType<typeof useOutputPanes>;

interface TabBarProps {
  readonly panes: OutputPanes;
  readonly isNarrow: boolean;
  readonly plotsUnread: number;
  readonly onPlotsSeen: () => void;
}

/** Console | REPL | Plots | Display, in the header of the phone's program output frame. */
export function OutputTabBar({ panes, isNarrow, plotsUnread, onPlotsSeen, isRunning }: TabBarProps & { readonly isRunning: boolean }) {
  const { t } = useI18n();
  const { outputTab, setOutputTab, setMobilePane } = panes;
  const items = useMemo<readonly PillTabItem<OutputTab>[]>(
    () => [
      { id: 'console', label: t('python.tabConsole') },
      { id: 'repl', label: t('python.tabRepl'), disabled: isRunning },
      { id: 'plots', label: t('python.tabPlots'), badge: plotsUnread > 0 ? plotsUnread : undefined },
      { id: 'display', label: t('python.tabDisplay') },
    ],
    [t, isRunning, plotsUnread],
  );
  return (
    <PillTabs
      items={items}
      value={outputTab}
      onChange={(next) => {
        setOutputTab(next);
        if (next === 'plots') onPlotsSeen();
        if (isNarrow) setMobilePane(next === 'plots' || next === 'display' ? next : 'output');
      }}
      ariaLabel={t('python.outputNavAria')}
      size="sm"
      variant="subtle"
    />
  );
}

/** Phone pane switcher: Editor | Console | Files | Plots | Display. */
export function PhonePaneTabs({
  panes,
  plotsUnread,
  onPlotsSeen,
  editorRef,
  consoleRef,
  replRef,
}: Omit<TabBarProps, 'isNarrow'> & {
  readonly editorRef: RefObject<PythonEditorHandle | null>;
  readonly consoleRef: RefObject<PythonTerminalHandle | null>;
  readonly replRef: RefObject<PythonTerminalHandle | null>;
}) {
  const { t } = useI18n();
  const { outputTab, setOutputTab, mobilePane, setMobilePane } = panes;
  const items = useMemo<readonly PillTabItem<MobilePane>[]>(
    () => [
      { id: 'editor', label: t('python.tabEditor') },
      { id: 'output', label: outputTab === 'repl' ? t('python.tabRepl') : t('python.tabConsole') },
      { id: 'files', label: t('python.tabFiles') },
      { id: 'plots', label: t('python.tabPlots'), badge: plotsUnread > 0 ? plotsUnread : undefined },
      { id: 'display', label: t('python.tabDisplay') },
    ],
    [t, outputTab, plotsUnread],
  );
  return (
    <div className={styles.mobileTabsRow}>
      <PillTabs
        items={items}
        value={mobilePane}
        onChange={(next) => {
          setMobilePane(next);
          if (next === 'plots' || next === 'display') {
            setOutputTab(next);
            if (next === 'plots') onPlotsSeen();
          } else if (next === 'output' && (outputTab === 'plots' || outputTab === 'display')) {
            setOutputTab('console');
          }
          requestAnimationFrame(() => {
            if (next === 'editor') editorRef.current?.layout();
            else if (next === 'output') {
              consoleRef.current?.fit();
              replRef.current?.fit();
            }
          });
        }}
        ariaLabel={t('python.paneNavAria')}
        size="sm"
      />
    </div>
  );
}
