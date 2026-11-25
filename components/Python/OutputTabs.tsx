// Output tabs of the playground (Console | REPL | Plots | Display) and the phone pane switcher
// (Editor | Console | Files | Plots | Display), with the pane state both share. Split from
// PythonPlayground.tsx to keep it under 40 kB.
import { useCallback, useMemo, useRef, useState } from 'react';
import type { RefObject } from 'react';

import { useI18n } from '../../lib/ui/i18n';
import styles from '../../styles/Python.module.css';
import PillTabs, { PillTabItem } from '../UI/PillTabs';
import type { PythonEditorHandle } from './PythonEditor';
import type { PythonTerminalHandle } from './PythonTerminal';

export type OutputTab = 'console' | 'repl' | 'plots' | 'display';
export type MobilePane = 'editor' | 'output' | 'files' | 'plots' | 'display';

/** Pane state: which output tab shows on desktop and which pane on a phone. */
export function useOutputPanes(isNarrow: boolean) {
  const [outputTab, setOutputTab] = useState<OutputTab>('console');
  const [mobilePane, setMobilePane] = useState<MobilePane>('editor');
  const outputTabRef = useRef<OutputTab>('console');
  outputTabRef.current = outputTab;
  const isPlotsVisible = isNarrow ? mobilePane === 'plots' : outputTab === 'plots';
  const isPlotsVisibleRef = useRef(false);
  isPlotsVisibleRef.current = isPlotsVisible;
  const isDisplayTab = isNarrow ? mobilePane === 'display' : outputTab === 'display';
  const showOutputPane = !isNarrow || mobilePane === 'output' || mobilePane === 'plots' || mobilePane === 'display';

  /** Shows the console (a run starts, the program asks for input). */
  const showConsole = useCallback(() => {
    setOutputTab('console');
    if (isNarrow) setMobilePane('output');
  }, [isNarrow]);

  /** Shows the Display tab (a program opened a display). */
  const showDisplay = useCallback(() => {
    setOutputTab('display');
    if (isNarrow) setMobilePane('display');
  }, [isNarrow]);

  return {
    outputTab,
    setOutputTab,
    mobilePane,
    setMobilePane,
    outputTabRef,
    isPlotsVisible,
    isPlotsVisibleRef,
    isDisplayTab,
    showOutputPane,
    showConsole,
    showDisplay,
  };
}

export type OutputPanes = ReturnType<typeof useOutputPanes>;

interface TabBarProps {
  readonly panes: OutputPanes;
  readonly isNarrow: boolean;
  readonly plotsUnread: number;
  readonly onPlotsSeen: () => void;
}

/** Console | REPL | Plots | Display, inside the program output frame's header. */
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
