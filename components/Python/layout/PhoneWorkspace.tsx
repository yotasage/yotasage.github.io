// The phone workspace of the playground (below 900 px), unchanged from before the dock: one pane at a
// time picked by PhonePaneTabs, the output pane framed and labelled "Program output" with its own tab bar.
// It holds slots for the same panel hosts as the dock, so crossing the breakpoint moves the panels
// instead of re-creating them.
import type { ReactNode } from 'react';

import type { PanelId } from '../../../lib/python/layout/model';
import { useI18n } from '../../../lib/ui/i18n';
import pyStyles from '../../../styles/Python.module.css';
import layoutStyles from '../../../styles/PythonLayout.module.css';
import { OutputTabBar } from '../OutputTabs';
import type { OutputPanes } from '../OutputTabs';
import HostSlot from './HostSlot';
import type { HostRegistry } from './usePanelHosts';

const OUTPUT: readonly PanelId[] = ['console', 'repl', 'plots', 'display'];
const FILES: readonly PanelId[] = ['files'];
const EDITOR: readonly PanelId[] = ['editor'];

interface Props {
  readonly registry: HostRegistry;
  readonly panes: OutputPanes;
  readonly isRunning: boolean;
  readonly plotsUnread: number;
  readonly onPlotsSeen: () => void;
  readonly consoleExtras?: ReactNode;
}

/** Which output panel the phone's output pane shows. */
export function phoneOutputShown(panes: OutputPanes): PanelId | null {
  const { mobilePane, outputTab } = panes;
  if (mobilePane === 'plots') return 'plots';
  if (mobilePane === 'display') return 'display';
  if (mobilePane === 'output') return outputTab === 'repl' ? 'repl' : 'console';
  return null;
}

export default function PhoneWorkspace({ registry, panes, isRunning, plotsUnread, onPlotsSeen, consoleExtras }: Props) {
  const { t } = useI18n();
  const shownOutput = phoneOutputShown(panes);
  return (
    <div className={pyStyles.workspace} data-python-workspace="">
      {panes.mobilePane === 'files' && (
        <HostSlot registry={registry} panels={FILES} shown="files" className={layoutStyles.phoneSlot} />
      )}

      <section
        className={pyStyles.paneCard}
        style={{ display: panes.mobilePane === 'editor' ? 'flex' : 'none' }}
        aria-label={t('python.tabEditor')}
      >
        <HostSlot registry={registry} panels={EDITOR} shown="editor" className={layoutStyles.phoneSlot} />
      </section>

      <section
        className={[pyStyles.paneCard, pyStyles.programOutputFrame].join(' ')}
        style={{ display: panes.showOutputPane ? 'flex' : 'none' }}
        aria-label={t('python.programOutput')}
        data-testid="python-program-output-frame"
      >
        <div className={pyStyles.paneHeader}>
          <div className={pyStyles.paneHeaderLeft}>
            <span className={pyStyles.programOutputLabel} data-testid="python-program-output-label">
              {t('python.programOutput')}
            </span>
            <OutputTabBar panes={panes} isNarrow isRunning={isRunning} plotsUnread={plotsUnread} onPlotsSeen={onPlotsSeen} />
          </div>
        </div>
        {consoleExtras}
        <HostSlot registry={registry} panels={OUTPUT} shown={shownOutput} className={layoutStyles.phoneSlot} />
      </section>
    </div>
  );
}
