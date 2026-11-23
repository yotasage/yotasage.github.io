import { LineDiffStats } from '../../lib/notepad/diffStats';
import { DiffViewStyle, NotepadDoc } from '../../lib/notepad/types';
import { useI18n } from '../../lib/ui/i18n';
import styles from '../../styles/Notepad.module.css';

export interface DiffControlBarProps {
  docs: readonly NotepadDoc[];
  leftDocId: string;
  rightDocId: string;
  diffStyle: DiffViewStyle;
  ignoreWhitespace: boolean;
  stats: LineDiffStats | null;
  onChangeLeft: (docId: string) => void;
  onChangeRight: (docId: string) => void;
  onSwap: () => void;
  onChangeStyle: (style: DiffViewStyle) => void;
  onToggleIgnoreWhitespace: () => void;
  onStepChange: (direction: 'prev' | 'next') => void;
}

export default function DiffControlBar({
  docs,
  leftDocId,
  rightDocId,
  diffStyle,
  ignoreWhitespace,
  stats,
  onChangeLeft,
  onChangeRight,
  onSwap,
  onChangeStyle,
  onToggleIgnoreWhitespace,
  onStepChange,
}: DiffControlBarProps) {
  const { t } = useI18n();

  return (
    <div className={styles.diffBar} role="region" aria-label={t('notepad.layout.diff')}>
      <label className={styles.diffPicker}>
        <span>{t('notepad.diff.leftLabel')}</span>
        <select
          className={styles.paneSelect}
          value={leftDocId}
          onChange={(e) => onChangeLeft(e.target.value)}
        >
          {docs.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </label>

      <button type="button" className={styles.cmdBtn} onClick={onSwap}>
        ⇄ {t('notepad.diff.swap')}
      </button>

      <label className={styles.diffPicker}>
        <span>{t('notepad.diff.rightLabel')}</span>
        <select
          className={styles.paneSelect}
          value={rightDocId}
          onChange={(e) => onChangeRight(e.target.value)}
        >
          {docs.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </label>

      <div className={styles.segmentedGroup} role="group" aria-label="Diff view style">
        <button
          type="button"
          aria-pressed={diffStyle === 'side-by-side'}
          className={[styles.segBtn, diffStyle === 'side-by-side' ? styles.segBtnActive : '']
            .filter(Boolean)
            .join(' ')}
          onClick={() => onChangeStyle('side-by-side')}
        >
          {t('notepad.diff.sideBySide')}
        </button>
        <button
          type="button"
          aria-pressed={diffStyle === 'inline'}
          className={[styles.segBtn, diffStyle === 'inline' ? styles.segBtnActive : '']
            .filter(Boolean)
            .join(' ')}
          onClick={() => onChangeStyle('inline')}
        >
          {t('notepad.diff.inline')}
        </button>
      </div>

      <button
        type="button"
        aria-pressed={ignoreWhitespace}
        className={[styles.toggleBtn, ignoreWhitespace ? styles.toggleBtnActive : '']
          .filter(Boolean)
          .join(' ')}
        onClick={onToggleIgnoreWhitespace}
      >
        {t('notepad.diff.ignoreWhitespace')}
      </button>

      <div className={styles.cmdGroup}>
        <button type="button" className={styles.cmdBtn} onClick={() => onStepChange('prev')}>
          ↑ {t('notepad.diff.prevChange')}
        </button>
        <button type="button" className={styles.cmdBtn} onClick={() => onStepChange('next')}>
          ↓ {t('notepad.diff.nextChange')}
        </button>
      </div>

      {stats && (
        <div className={styles.diffStats} role="status" aria-live="polite">
          {stats.identical ? (
            <span className={styles.diffIdentical}>{t('notepad.diff.identical')}</span>
          ) : (
            <>
              <span className={styles.diffAdded}>{t('notepad.diff.added', { count: stats.added })}</span>
              <span aria-hidden="true">·</span>
              <span className={styles.diffRemoved}>{t('notepad.diff.removed', { count: stats.removed })}</span>
            </>
          )}
        </div>
      )}
    </div>
  );
}
