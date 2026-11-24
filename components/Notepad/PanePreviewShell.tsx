import React, { useCallback, useRef, useState } from 'react';

import { AlignOptions, DelimiterOption } from '../../lib/notepad/csvTools';
import {
  ConcretePreviewKind,
  detectPreviewKind,
  resolvePreviewKind,
} from '../../lib/notepad/htmlPreview';
import { PaneViewState, PreviewKind } from '../../lib/notepad/syncMerge';
import { NotepadDoc } from '../../lib/notepad/types';
import { useI18n } from '../../lib/ui/i18n';
import { ResolvedTheme } from '../../lib/ui/theme';
import styles from '../../styles/NotepadPreview.module.css';
import CsvTablePreview from './CsvTablePreview';
import HtmlPreview from './HtmlPreview';
import MarkdownPreview from './MarkdownPreview';

export interface PanePreviewShellProps {
  doc: NotepadDoc;
  theme: ResolvedTheme;
  paneView: PaneViewState;
  onChangePaneView: (next: PaneViewState) => void;
  onAlignCsv: (opts: AlignOptions) => void;
  onShrinkCsv: (delimiter?: DelimiterOption) => void;
  editorNode: React.ReactNode;
}

export default function PanePreviewShell({
  doc,
  theme,
  paneView,
  onChangePaneView,
  onAlignCsv,
  onShrinkCsv,
  editorNode,
}: PanePreviewShellProps) {
  const { t } = useI18n();
  const containerRef = useRef<HTMLDivElement>(null);
  const [splitRatio, setSplitRatio] = useState(50);
  const [dragging, setDragging] = useState(false);

  const showPreview = paneView.mode !== 'editor';
  const detectedKind = showPreview ? detectPreviewKind(doc.language, doc.name, doc.content) : null;
  const resolvedKind: ConcretePreviewKind = showPreview
    ? resolvePreviewKind(paneView.kind, doc.language, doc.name, doc.content)
    : 'markdown';

  const labelForKind = (kind: ConcretePreviewKind): string => {
    if (kind === 'html') return t('notepad.preview.kindHtml');
    if (kind === 'csv') return t('notepad.preview.kindCsv');
    return t('notepad.preview.kindMarkdown');
  };

  const autoKindLabel = labelForKind(detectedKind ?? 'markdown');

  const handleStartResize = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const container = containerRef.current;
    if (!container) return;
    const handle = e.currentTarget;
    try {
      handle.setPointerCapture(e.pointerId);
    } catch {
      // Ignore synthetic events without active pointer
    }
    const rect = container.getBoundingClientRect();
    const isStacked = window.matchMedia('(max-width: 720px)').matches;
    setDragging(true);

    const onMove = (ev: PointerEvent) => {
      const pct = isStacked
        ? ((ev.clientY - rect.top) / Math.max(1, rect.height)) * 100
        : ((ev.clientX - rect.left) / Math.max(1, rect.width)) * 100;
      setSplitRatio(Math.min(80, Math.max(20, pct)));
    };
    const onUp = () => {
      setDragging(false);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  }, []);

  const editorSlotClass =
    paneView.mode === 'preview'
      ? styles.editorSlotHidden
      : paneView.mode === 'split'
        ? styles.editorSlotSplit
        : styles.editorSlot;

  return (
    <div
      ref={containerRef}
      className={[styles.shell, paneView.mode === 'split' ? styles.shellSplit : '']
        .filter(Boolean)
        .join(' ')}
    >
      <div
        className={editorSlotClass}
        style={paneView.mode === 'split' ? { flexBasis: `${splitRatio}%` } : undefined}
      >
        {editorNode}
      </div>

      {paneView.mode === 'split' && (
        <div
          className={[styles.previewDivider, dragging ? styles.previewDividerActive : '']
            .filter(Boolean)
            .join(' ')}
          role="separator"
          aria-orientation="vertical"
          aria-label={t('notepad.preview.resizeAria')}
          onPointerDown={handleStartResize}
        />
      )}

      {showPreview && (
        <div className={styles.previewPanel}>
          <div className={styles.previewBar}>
            <div className={styles.previewBarGroup}>
              <select
                className={styles.previewSelect}
                value={paneView.kind}
                aria-label={t('notepad.preview.kindAria')}
                onChange={(e) =>
                  onChangePaneView({ ...paneView, kind: e.target.value as PreviewKind })
                }
              >
                <option value="auto">{t('notepad.preview.kindAuto', { kind: autoKindLabel })}</option>
                <option value="markdown">{t('notepad.preview.kindMarkdown')}</option>
                <option value="html">{t('notepad.preview.kindHtml')}</option>
                <option value="csv">{t('notepad.preview.kindCsv')}</option>
              </select>
            </div>

            <div className={styles.previewBarGroup}>
              <div
                className={styles.previewModeGroup}
                role="group"
                aria-label={t('notepad.preview.modeGroup')}
              >
                <button
                  type="button"
                  aria-pressed={paneView.mode === 'split'}
                  className={[
                    styles.previewModeBtn,
                    paneView.mode === 'split' ? styles.previewModeBtnActive : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => onChangePaneView({ ...paneView, mode: 'split' })}
                >
                  {t('notepad.preview.modeSplit')}
                </button>
                <button
                  type="button"
                  aria-pressed={paneView.mode === 'preview'}
                  className={[
                    styles.previewModeBtn,
                    paneView.mode === 'preview' ? styles.previewModeBtnActive : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => onChangePaneView({ ...paneView, mode: 'preview' })}
                >
                  {t('notepad.preview.modePreview')}
                </button>
              </div>
              <button
                type="button"
                className={styles.previewCloseBtn}
                aria-label={t('notepad.preview.close')}
                title={t('notepad.preview.close')}
                onClick={() => onChangePaneView({ ...paneView, mode: 'editor' })}
              >
                ×
              </button>
            </div>
          </div>

          <div
            className={[styles.previewContent, dragging ? styles.previewContentDragging : '']
              .filter(Boolean)
              .join(' ')}
          >
            {resolvedKind === 'markdown' && <MarkdownPreview content={doc.content} />}
            {resolvedKind === 'html' && (
              <HtmlPreview content={doc.content} fileName={doc.name} theme={theme} />
            )}
            {resolvedKind === 'csv' && (
              <CsvTablePreview
                content={doc.content}
                fileName={doc.name}
                onAlignText={onAlignCsv}
                onShrinkText={onShrinkCsv}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
