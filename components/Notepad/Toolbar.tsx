import { useRef, useState } from 'react';

import { HashAlgorithm } from '../../lib/notepad/cryptoHash';
import { AlignOptions, DelimiterOption } from '../../lib/notepad/csvTools';
import { ConcretePreviewKind } from '../../lib/notepad/htmlPreview';
import { MimeToolAction } from '../../lib/notepad/mimeTools';
import { PaneViewState } from '../../lib/notepad/syncMerge';
import {
  EditorSettings,
  FileEncoding,
  LayoutMode,
  SymbolSettings,
  TextDirection,
} from '../../lib/notepad/types';
import { useI18n } from '../../lib/ui/i18n';
import styles from '../../styles/Notepad.module.css';
import previewStyles from '../../styles/NotepadPreview.module.css';
import {
  DataAlignMenuControl,
  EncodingMenuControl,
  GridMenuControl,
  LanguageMenuControl,
  MimeToolsMenuControl,
  OpenMenuId,
  SymbolsMenuControl,
  ToolsHashMenuControl,
  useMenuDismiss,
} from './ToolbarMenus';

export interface ToolbarProps {
  layout: LayoutMode;
  gridRows: number;
  gridCols: number;
  findOpen: boolean;
  settings: EditorSettings;
  activeLanguage: string;
  activeEncoding: FileEncoding;
  activeDirection: TextDirection;
  activePaneView: PaneViewState;
  detectedPreviewKind: ConcretePreviewKind | null;
  onNewDoc: () => void;
  onPasteAsNew: () => void;
  onOpenFiles: (files: FileList) => void;
  onDownloadActive: () => void;
  onChangeLayout: (mode: LayoutMode) => void;
  onSelectGrid: (rows: number, cols: number) => void;
  onResetGridSizes: () => void;
  onToggleFind: () => void;
  onToggleSetting: (key: 'wordWrap' | 'showMinimap') => void;
  onToggleSymbol: (key: keyof SymbolSettings) => void;
  onToggleAllSymbols: () => void;
  onToggleDirection: () => void;
  onChangeLanguage: (langId: string) => void;
  onReinterpretEncoding: (encoding: FileEncoding) => void;
  onConvertEncoding: (encoding: FileEncoding) => void;
  onRunMimeTool: (action: MimeToolAction) => void;
  onOpenHashDialog: (algo: HashAlgorithm | 'ALL') => void;
  onChangeActivePaneView: (next: PaneViewState) => void;
  onAlignCsv: (opts: AlignOptions) => void;
  onShrinkCsv: (delimiter?: DelimiterOption) => void;
  onOpenSync: () => void;
}

export default function Toolbar({
  layout,
  gridRows,
  gridCols,
  findOpen,
  settings,
  activeLanguage,
  activeEncoding,
  activeDirection,
  activePaneView,
  detectedPreviewKind,
  onNewDoc,
  onPasteAsNew,
  onOpenFiles,
  onDownloadActive,
  onChangeLayout,
  onSelectGrid,
  onResetGridSizes,
  onToggleFind,
  onToggleSetting,
  onToggleSymbol,
  onToggleAllSymbols,
  onToggleDirection,
  onChangeLanguage,
  onReinterpretEncoding,
  onConvertEncoding,
  onRunMimeTool,
  onOpenHashDialog,
  onChangeActivePaneView,
  onAlignCsv,
  onShrinkCsv,
  onOpenSync,
}: ToolbarProps) {
  const { t } = useI18n();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [openMenu, setOpenMenu] = useState<OpenMenuId>(null);

  useMenuDismiss(toolbarRef, openMenu, setOpenMenu);

  const previewBtnLabel =
    detectedPreviewKind === 'markdown'
      ? t('notepad.preview.buttonMd')
      : detectedPreviewKind === 'html'
        ? t('notepad.preview.buttonHtml')
        : detectedPreviewKind === 'csv'
          ? t('notepad.preview.buttonCsv')
          : t('notepad.preview.button');

  const isDiff = layout === 'diff';

  return (
    <div ref={toolbarRef} className={styles.commandBar} role="toolbar" aria-label="Scratchpad toolbar">
      <div className={styles.cmdGroup}>
        <button type="button" className={styles.cmdBtnPrimary} onClick={onNewDoc}>
          + {t('notepad.newFile')}
        </button>
        <button type="button" className={styles.cmdBtn} onClick={onPasteAsNew}>
          {t('notepad.pasteNew')}
        </button>
        <button type="button" className={styles.cmdBtn} onClick={() => fileInputRef.current?.click()}>
          {t('notepad.openFiles')}
        </button>
        <button type="button" className={styles.cmdBtn} onClick={onDownloadActive}>
          {t('notepad.downloadFile')}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          aria-hidden="true"
          tabIndex={-1}
          className={styles.srOnly}
          onChange={(e) => {
            if (e.target.files?.length) onOpenFiles(e.target.files);
            e.target.value = '';
          }}
        />
      </div>

      <span className={styles.cmdSep} aria-hidden="true" />

      <div className={styles.segmentedGroup} role="group" aria-label={t('notepad.layout.label')}>
        <button
          type="button"
          aria-pressed={layout === 'single'}
          className={[styles.segBtn, layout === 'single' ? styles.segBtnActive : ''].filter(Boolean).join(' ')}
          onClick={() => {
            setOpenMenu(null);
            onChangeLayout('single');
          }}
        >
          {t('notepad.layout.single')}
        </button>
        <button
          type="button"
          aria-pressed={layout === 'split'}
          className={[styles.segBtn, layout === 'split' ? styles.segBtnActive : ''].filter(Boolean).join(' ')}
          onClick={() => {
            setOpenMenu(null);
            onChangeLayout('split');
          }}
        >
          {t('notepad.layout.split')}
        </button>
        <GridMenuControl
          openMenu={openMenu}
          setOpenMenu={setOpenMenu}
          gridRows={gridRows}
          gridCols={gridCols}
          isGridActive={layout === 'grid'}
          onSelectGrid={onSelectGrid}
          onResetGridSizes={onResetGridSizes}
        />
        <button
          type="button"
          aria-pressed={layout === 'diff'}
          className={[styles.segBtn, layout === 'diff' ? styles.segBtnActive : ''].filter(Boolean).join(' ')}
          onClick={() => {
            setOpenMenu(null);
            onChangeLayout('diff');
          }}
        >
          {t('notepad.layout.diff')}
        </button>
      </div>

      <span className={styles.cmdSep} aria-hidden="true" />

      <div className={styles.cmdGroup}>
        <button
          type="button"
          aria-pressed={findOpen}
          className={[styles.toggleBtn, findOpen ? styles.toggleBtnActive : ''].filter(Boolean).join(' ')}
          onClick={onToggleFind}
          title="Ctrl+H"
        >
          {t('notepad.findToggle')}
        </button>
        <button
          type="button"
          aria-pressed={settings.wordWrap}
          className={[styles.toggleBtn, settings.wordWrap ? styles.toggleBtnActive : ''].filter(Boolean).join(' ')}
          onClick={() => onToggleSetting('wordWrap')}
        >
          {t('notepad.wrap')}
        </button>
        <SymbolsMenuControl
          openMenu={openMenu}
          setOpenMenu={setOpenMenu}
          symbols={settings.symbols}
          onToggleSymbol={onToggleSymbol}
          onToggleAllSymbols={onToggleAllSymbols}
        />
        <button
          type="button"
          aria-pressed={activeDirection === 'rtl'}
          className={[styles.toggleBtn, activeDirection === 'rtl' ? styles.toggleBtnActive : '']
            .filter(Boolean)
            .join(' ')}
          onClick={onToggleDirection}
          title={t('notepad.direction.tooltip')}
        >
          {activeDirection === 'rtl' ? 'RTL' : 'LTR'}
        </button>
        <button
          type="button"
          aria-pressed={settings.showMinimap}
          className={[styles.toggleBtn, settings.showMinimap ? styles.toggleBtnActive : ''].filter(Boolean).join(' ')}
          onClick={() => onToggleSetting('showMinimap')}
        >
          {t('notepad.minimap')}
        </button>
      </div>

      <span className={styles.cmdSep} aria-hidden="true" />

      <div className={styles.cmdGroup}>
        <LanguageMenuControl
          openMenu={openMenu}
          setOpenMenu={setOpenMenu}
          activeLanguage={activeLanguage}
          onChangeLanguage={onChangeLanguage}
        />
        <EncodingMenuControl
          openMenu={openMenu}
          setOpenMenu={setOpenMenu}
          activeEncoding={activeEncoding}
          onReinterpretEncoding={onReinterpretEncoding}
          onConvertEncoding={onConvertEncoding}
        />
        <MimeToolsMenuControl
          openMenu={openMenu}
          setOpenMenu={setOpenMenu}
          onRunMimeTool={onRunMimeTool}
        />
        <DataAlignMenuControl
          openMenu={openMenu}
          setOpenMenu={setOpenMenu}
          onAlignCsv={onAlignCsv}
          onShrinkCsv={onShrinkCsv}
          onOpenCsvPreview={() => {
            if (isDiff) onChangeLayout('single');
            onChangeActivePaneView({
              mode: activePaneView.mode === 'editor' ? 'split' : activePaneView.mode,
              kind: 'csv',
            });
          }}
        />
        <ToolsHashMenuControl
          openMenu={openMenu}
          setOpenMenu={setOpenMenu}
          onOpenHashDialog={onOpenHashDialog}
        />
      </div>

      <span className={styles.cmdSep} aria-hidden="true" />

      <div className={styles.cmdGroup}>
        {activePaneView.mode === 'editor' || isDiff ? (
          <button
            type="button"
            disabled={isDiff}
            aria-pressed={false}
            className={[
              styles.toggleBtn,
              !isDiff && detectedPreviewKind !== null ? previewStyles.toolbarPreviewHint : '',
            ]
              .filter(Boolean)
              .join(' ')}
            onClick={() => {
              setOpenMenu(null);
              onChangeActivePaneView({ ...activePaneView, mode: 'split' });
            }}
          >
            {previewBtnLabel}
          </button>
        ) : (
          <div
            className={styles.segmentedGroup}
            role="group"
            aria-label={t('notepad.preview.modeGroup')}
          >
            <button
              type="button"
              aria-pressed={false}
              className={styles.segBtn}
              onClick={() => onChangeActivePaneView({ ...activePaneView, mode: 'editor' })}
            >
              {t('notepad.preview.modeEditor')}
            </button>
            <button
              type="button"
              aria-pressed={activePaneView.mode === 'split'}
              className={[
                styles.segBtn,
                activePaneView.mode === 'split' ? styles.segBtnActive : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => onChangeActivePaneView({ ...activePaneView, mode: 'split' })}
            >
              {t('notepad.preview.modeSplit')}
            </button>
            <button
              type="button"
              aria-pressed={activePaneView.mode === 'preview'}
              className={[
                styles.segBtn,
                activePaneView.mode === 'preview' ? styles.segBtnActive : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => onChangeActivePaneView({ ...activePaneView, mode: 'preview' })}
            >
              {t('notepad.preview.modePreview')}
            </button>
          </div>
        )}
      </div>

      <div className={styles.cmdSpacer} />

      <div className={styles.cmdGroup}>
        <button type="button" className={styles.cmdBtn} onClick={onOpenSync}>
          {t('notepad.syncToggle')}
        </button>
      </div>
    </div>
  );
}
