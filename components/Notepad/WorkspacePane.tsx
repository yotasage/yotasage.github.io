import type * as MonacoApi from 'monaco-editor';

import { AlignOptions, DelimiterOption } from '../../lib/notepad/csvTools';
import { MonacoNamespace } from '../../lib/notepad/monacoLoader';
import { PaneViewState } from '../../lib/notepad/syncMerge';
import { EditorSettings, NotepadDoc, TextMatch } from '../../lib/notepad/types';
import { useI18n } from '../../lib/ui/i18n';
import { ResolvedTheme } from '../../lib/ui/theme';
import styles from '../../styles/Notepad.module.css';
import previewStyles from '../../styles/NotepadPreview.module.css';
import MonacoPane, { MonacoPaneHandle, SelectionSnapshot } from './MonacoPane';
import PanePreviewShell from './PanePreviewShell';

export interface WorkspacePaneProps {
  paneIdx: number;
  showHeader: boolean;
  docs: readonly NotepadDoc[];
  doc: NotepadDoc;
  monaco: MonacoNamespace | null;
  monacoError: string | null;
  model: MonacoApi.editor.ITextModel | null;
  theme: ResolvedTheme;
  settings: EditorSettings;
  isPaneActive: boolean;
  paneView: PaneViewState;
  findMatchesList: readonly TextMatch[];
  activeFindMatchIndex: number;
  onAssignRef: (handle: MonacoPaneHandle | null) => void;
  onActivatePane: () => void;
  onAssignDoc: (docId: string) => void;
  onChangePaneView: (next: PaneViewState) => void;
  onAlignCsv: (opts: AlignOptions) => void;
  onShrinkCsv: (delimiter?: DelimiterOption) => void;
  onSelectionChange: (snap: SelectionSnapshot) => void;
  onOpenFindBar: () => void;
}

export default function WorkspacePane({
  paneIdx,
  showHeader,
  docs,
  doc,
  monaco,
  monacoError,
  model,
  theme,
  settings,
  isPaneActive,
  paneView,
  findMatchesList,
  activeFindMatchIndex,
  onAssignRef,
  onActivatePane,
  onAssignDoc,
  onChangePaneView,
  onAlignCsv,
  onShrinkCsv,
  onSelectionChange,
  onOpenFindBar,
}: WorkspacePaneProps) {
  const { t } = useI18n();
  const isPreviewOpen = paneView.mode !== 'editor';

  const editorNode =
    monaco && model ? (
      <MonacoPane
        ref={onAssignRef}
        paneIndex={paneIdx}
        monaco={monaco}
        model={model}
        doc={doc}
        theme={theme}
        settings={settings}
        isActive={isPaneActive}
        findMatchesList={findMatchesList}
        activeFindMatchIndex={activeFindMatchIndex}
        onFocusPane={onActivatePane}
        onSelectionChange={onSelectionChange}
        onOpenFindBar={onOpenFindBar}
      />
    ) : (
      <div className={styles.editorLoading}>
        {monacoError ? t('notepad.loadError', { error: monacoError }) : t('notepad.loadingEditor')}
      </div>
    );

  return (
    <div
      className={[styles.editorPane, isPaneActive ? styles.editorPaneActive : '']
        .filter(Boolean)
        .join(' ')}
      onMouseDown={onActivatePane}
    >
      {showHeader && (
        <div className={styles.paneHeader}>
          <span className={styles.paneIndex}>{t('notepad.pane.label', { n: paneIdx + 1 })}</span>
          <select
            className={styles.paneSelect}
            value={doc.id}
            aria-label={t('notepad.pane.selectFile', { n: paneIdx + 1 })}
            onChange={(e) => onAssignDoc(e.target.value)}
          >
            {docs.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <div className={previewStyles.paneHeaderActions}>
            <button
              type="button"
              aria-pressed={isPreviewOpen}
              aria-label={t('notepad.pane.togglePreview', { n: paneIdx + 1 })}
              title={t('notepad.pane.togglePreview', { n: paneIdx + 1 })}
              className={[
                previewStyles.panePreviewBtn,
                isPreviewOpen ? previewStyles.panePreviewBtnActive : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onChangePaneView({
                  ...paneView,
                  mode: isPreviewOpen ? 'editor' : 'split',
                });
              }}
            >
              {t('notepad.preview.button')}
            </button>
            {isPaneActive && (
              <span className={styles.paneActiveLabel}>{t('notepad.pane.active')}</span>
            )}
          </div>
        </div>
      )}
      <div className={styles.paneBody}>
        <PanePreviewShell
          doc={doc}
          theme={theme}
          paneView={paneView}
          onChangePaneView={onChangePaneView}
          onAlignCsv={onAlignCsv}
          onShrinkCsv={onShrinkCsv}
          editorNode={editorNode}
        />
      </div>
    </div>
  );
}
