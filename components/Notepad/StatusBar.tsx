import { getEncodingLabel, getEncodingShortLabel } from '../../lib/notepad/encoding';
import { EolMode, NotepadDoc, SUPPORTED_LANGUAGES } from '../../lib/notepad/types';
import { useI18n } from '../../lib/ui/i18n';
import styles from '../../styles/Notepad.module.css';
import { SelectionSnapshot } from './MonacoPane';

export interface StatusBarProps {
  saveState: 'saved' | 'saving';
  activeDoc: NotepadDoc;
  textStats: { lines: number; words: number; chars: number };
  selectionInfo: SelectionSnapshot | null;
  isDiffMode: boolean;
  toast: string | null;
  onJumpSelection: (direction: 'prev' | 'next') => void;
  onUseSelectionInFind: (selectedText: string) => void;
  onChangeEol: (eol: EolMode) => void;
  onChangeLanguage: (lang: string) => void;
}

export default function StatusBar({
  saveState,
  activeDoc,
  textStats,
  selectionInfo,
  isDiffMode,
  toast,
  onJumpSelection,
  onUseSelectionInFind,
  onChangeEol,
  onChangeLanguage,
}: StatusBarProps) {
  const { t } = useI18n();

  const encodingShort = getEncodingShortLabel(activeDoc.encoding);
  const encodingDisplay =
    activeDoc.encodingConfidence === 'likely'
      ? t('notepad.encoding.likelyBadge', { name: encodingShort })
      : encodingShort;
  const encodingTooltip =
    activeDoc.encodingConfidence === 'likely'
      ? t('notepad.encoding.likelyTooltip', { name: getEncodingLabel(activeDoc.encoding) })
      : t('notepad.encoding.exactTooltip', { name: getEncodingLabel(activeDoc.encoding) });

  return (
    <div className={styles.statusBar}>
      <div className={styles.statusGroup}>
        <span className={styles.statusItem}>
          {saveState === 'saving' ? t('notepad.status.saving') : t('notepad.status.saved')}
        </span>
        <span className={styles.statusDot} aria-hidden="true">
          ·
        </span>
        <span className={styles.statusItem}>
          {t('notepad.status.lineCol', {
            line: selectionInfo?.line ?? 1,
            col: selectionInfo?.column ?? 1,
          })}
          {selectionInfo && selectionInfo.selectedLength > 0 && (
            <> {t('notepad.status.selected', { count: selectionInfo.selectedLength })}</>
          )}
        </span>
        <span className={styles.statusDot} aria-hidden="true">
          ·
        </span>
        <span className={styles.statusItem}>
          {t('notepad.status.lines', { count: textStats.lines })}
          {' · '}
          {t('notepad.status.words', { count: textStats.words })}
          {' · '}
          {t('notepad.status.chars', { count: textStats.chars })}
        </span>
      </div>

      {selectionInfo && selectionInfo.selectedText.length > 0 && !isDiffMode && (
        <div className={styles.selectionNav} role="status" aria-live="polite">
          <span className={styles.selectionLabel}>
            {selectionInfo.selectionMatches.length > 1
              ? t('notepad.selection.matches', {
                  index: selectionInfo.activeMatchIndex + 1,
                  count: selectionInfo.selectionMatches.length,
                })
              : t('notepad.selection.single')}
          </span>
          {selectionInfo.selectionMatches.length > 1 && (
            <>
              <button
                type="button"
                className={styles.statusActionBtn}
                onClick={() => onJumpSelection('prev')}
                title="Shift+F3"
              >
                ↑ {t('notepad.selection.prevEqual')}
              </button>
              <button
                type="button"
                className={styles.statusActionBtn}
                onClick={() => onJumpSelection('next')}
                title="F3"
              >
                ↓ {t('notepad.selection.nextEqual')}
              </button>
            </>
          )}
          <button
            type="button"
            className={styles.statusActionBtn}
            onClick={() => onUseSelectionInFind(selectionInfo.selectedText)}
          >
            {t('notepad.selection.toFind')}
          </button>
        </div>
      )}

      <div className={styles.statusGroup}>
        {toast && (
          <span className={styles.toastInline} role="status" aria-live="polite">
            {toast}
          </span>
        )}
        <span
          className={styles.statusEncodingTag}
          title={encodingTooltip}
          data-testid="status-encoding"
        >
          {encodingDisplay}
        </span>
        <span className={styles.statusDirTag} title={t('notepad.direction.tooltip')} data-testid="status-direction">
          {activeDoc.direction.toUpperCase()}
        </span>
        <select
          className={styles.statusSelect}
          value={activeDoc.eol}
          aria-label={t('notepad.status.eolAria')}
          onChange={(e) => onChangeEol(e.target.value as EolMode)}
        >
          <option value="CRLF">CRLF (\r\n)</option>
          <option value="LF">LF (\n)</option>
        </select>

        <select
          className={styles.statusSelect}
          value={activeDoc.language}
          aria-label={t('notepad.status.languageAria')}
          onChange={(e) => onChangeLanguage(e.target.value)}
        >
          {SUPPORTED_LANGUAGES.map((lang) => (
            <option key={lang.id} value={lang.id}>
              {lang.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
