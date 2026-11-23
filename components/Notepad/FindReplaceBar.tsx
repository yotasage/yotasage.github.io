import { useEffect, useRef } from 'react';

import { DocumentMatchSummary, SearchMode, SearchOptions } from '../../lib/notepad/types';
import { useI18n } from '../../lib/ui/i18n';
import styles from '../../styles/Notepad.module.css';

export interface FindReplaceBarProps {
  query: string;
  replacement: string;
  options: SearchOptions;
  matchCount: number;
  activeMatchIndex: number;
  searchError: string | null;
  allFilesResult: { summaries: DocumentMatchSummary[]; total: number } | null;
  feedback: string | null;
  focusTrigger: number;
  onQueryChange: (value: string) => void;
  onReplacementChange: (value: string) => void;
  onOptionsChange: (patch: Partial<SearchOptions>) => void;
  onFindStep: (direction: 'next' | 'prev') => void;
  onReplaceOne: () => void;
  onReplaceAll: () => void;
  onReplaceAllOpenFiles: () => void;
  onCountActive: () => void;
  onCountAllFiles: () => void;
  onJumpToDoc: (docId: string) => void;
  onApplyPreset: (preset: 'joinComma' | 'joinCommaSpace' | 'splitComma' | 'trimTrailing' | 'removeEmpty') => void;
  onClose: () => void;
}

const SEARCH_MODES: readonly SearchMode[] = ['normal', 'extended', 'regex'];

export default function FindReplaceBar({
  query,
  replacement,
  options,
  matchCount,
  activeMatchIndex,
  searchError,
  allFilesResult,
  feedback,
  focusTrigger,
  onQueryChange,
  onReplacementChange,
  onOptionsChange,
  onFindStep,
  onReplaceOne,
  onReplaceAll,
  onReplaceAllOpenFiles,
  onCountActive,
  onCountAllFiles,
  onJumpToDoc,
  onApplyPreset,
  onClose,
}: FindReplaceBarProps) {
  const { t } = useI18n();
  const findInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    findInputRef.current?.focus();
    findInputRef.current?.select();
  }, [focusTrigger]);

  const matchLabel = searchError
    ? searchError
    : !query
      ? ''
      : matchCount === 0
        ? t('notepad.find.noMatches')
        : activeMatchIndex >= 0
          ? t('notepad.find.matchPosition', { index: activeMatchIndex + 1, count: matchCount })
          : matchCount === 1
            ? t('notepad.find.oneMatch')
            : t('notepad.find.matches', { count: matchCount });

  return (
    <section className={styles.findBar} aria-label={t('notepad.findToggle')}>
      <div className={styles.findRows}>
        <div className={styles.findRow}>
          <div className={styles.findInputWrap}>
            <input
              ref={findInputRef}
              type="text"
              className={styles.findInput}
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  onFindStep(e.shiftKey ? 'prev' : 'next');
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  onClose();
                }
              }}
              placeholder={t('notepad.find.placeholder')}
              aria-label={t('notepad.find.aria')}
              spellCheck={false}
              autoComplete="off"
            />
            {matchLabel && (
              <span
                className={[styles.matchCount, searchError ? styles.matchCountError : ''].filter(Boolean).join(' ')}
                role="status"
                aria-live="polite"
              >
                {matchLabel}
              </span>
            )}
          </div>

          <div className={styles.cmdGroup}>
            <button
              type="button"
              className={styles.cmdBtn}
              onClick={() => onFindStep('prev')}
              disabled={!query || matchCount === 0}
              aria-label={t('notepad.find.prev')}
              title={`${t('notepad.find.prev')} (Shift+Enter)`}
            >
              ↑
            </button>
            <button
              type="button"
              className={styles.cmdBtn}
              onClick={() => onFindStep('next')}
              disabled={!query || matchCount === 0}
              aria-label={t('notepad.find.next')}
              title={`${t('notepad.find.next')} (Enter)`}
            >
              ↓
            </button>
            <button
              type="button"
              className={styles.cmdBtn}
              onClick={onCountActive}
              disabled={!query}
            >
              {t('notepad.find.count')}
            </button>
            <button
              type="button"
              className={styles.cmdBtn}
              onClick={onCountAllFiles}
              disabled={!query}
            >
              {t('notepad.find.countAllFiles')}
            </button>
          </div>

          <div className={styles.segmentedGroup} role="group" aria-label="Search mode">
            {SEARCH_MODES.map((m) => {
              const active = options.mode === m;
              const labelKey =
                m === 'normal'
                  ? 'notepad.find.modeNormal'
                  : m === 'extended'
                    ? 'notepad.find.modeExtended'
                    : 'notepad.find.modeRegex';
              return (
                <button
                  key={m}
                  type="button"
                  aria-pressed={active}
                  className={[styles.segBtn, active ? styles.segBtnActive : ''].filter(Boolean).join(' ')}
                  onClick={() => onOptionsChange({ mode: m })}
                >
                  {t(labelKey)}
                </button>
              );
            })}
          </div>

          <div className={styles.cmdGroup}>
            <button
              type="button"
              aria-pressed={options.caseSensitive}
              className={[styles.toggleBtn, options.caseSensitive ? styles.toggleBtnActive : ''].filter(Boolean).join(' ')}
              onClick={() => onOptionsChange({ caseSensitive: !options.caseSensitive })}
              title={t('notepad.find.caseSensitive')}
            >
              Aa
            </button>
            <button
              type="button"
              aria-pressed={options.wholeWord}
              className={[styles.toggleBtn, options.wholeWord ? styles.toggleBtnActive : ''].filter(Boolean).join(' ')}
              onClick={() => onOptionsChange({ wholeWord: !options.wholeWord })}
              title={t('notepad.find.wholeWord')}
            >
              \b
            </button>
            {options.mode === 'regex' && (
              <button
                type="button"
                aria-pressed={options.dotMatchesNewline}
                className={[styles.toggleBtn, options.dotMatchesNewline ? styles.toggleBtnActive : '']
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => onOptionsChange({ dotMatchesNewline: !options.dotMatchesNewline })}
                title={t('notepad.find.dotAll')}
              >
                .*
              </button>
            )}
          </div>

          <button
            type="button"
            className={styles.closeIconBtn}
            onClick={onClose}
            aria-label={t('notepad.closeFile')}
            title="Esc"
          >
            ×
          </button>
        </div>

        <div className={styles.findRow}>
          <div className={styles.findInputWrap}>
            <input
              type="text"
              className={styles.findInput}
              value={replacement}
              onChange={(e) => onReplacementChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  onReplaceAll();
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  onClose();
                }
              }}
              placeholder={t('notepad.replace.placeholder')}
              aria-label={t('notepad.replace.aria')}
              spellCheck={false}
              autoComplete="off"
            />
          </div>

          <div className={styles.cmdGroup}>
            <button
              type="button"
              className={styles.cmdBtn}
              onClick={onReplaceOne}
              disabled={!query || matchCount === 0}
            >
              {t('notepad.find.replace')}
            </button>
            <button
              type="button"
              className={styles.cmdBtnPrimary}
              onClick={onReplaceAll}
              disabled={!query || matchCount === 0}
            >
              {t('notepad.find.replaceAll')}
            </button>
            <button
              type="button"
              className={styles.cmdBtn}
              onClick={onReplaceAllOpenFiles}
              disabled={!query}
            >
              {t('notepad.find.replaceAllFiles')}
            </button>
          </div>

          <span className={styles.cmdSep} aria-hidden="true" />

          <div className={styles.presetGroup} role="group" aria-label="Quick replace presets">
            <button type="button" className={styles.presetBtn} onClick={() => onApplyPreset('joinComma')}>
              {t('notepad.find.presetJoinComma')}
            </button>
            <button type="button" className={styles.presetBtn} onClick={() => onApplyPreset('joinCommaSpace')}>
              {t('notepad.find.presetJoinCommaSpace')}
            </button>
            <button type="button" className={styles.presetBtn} onClick={() => onApplyPreset('splitComma')}>
              {t('notepad.find.presetSplitComma')}
            </button>
            <button type="button" className={styles.presetBtn} onClick={() => onApplyPreset('trimTrailing')}>
              {t('notepad.find.presetTrimTrailing')}
            </button>
            <button type="button" className={styles.presetBtn} onClick={() => onApplyPreset('removeEmpty')}>
              {t('notepad.find.presetRemoveEmpty')}
            </button>
          </div>

          {feedback && (
            <span className={styles.feedbackText} role="status" aria-live="polite">
              {feedback}
            </span>
          )}
        </div>

        {allFilesResult && (
          <div className={styles.countBreakdown} role="region" aria-label={t('notepad.find.countAllFiles')}>
            <span className={styles.countBreakdownTitle}>
              {t('notepad.find.allFilesSummary', {
                total: allFilesResult.total,
                files: allFilesResult.summaries.length,
              })}
            </span>
            <div className={styles.countBreakdownList}>
              {allFilesResult.summaries.map((item) => (
                <button
                  key={item.docId}
                  type="button"
                  className={styles.countFileBtn}
                  onClick={() => onJumpToDoc(item.docId)}
                >
                  <span>{item.docName}</span>
                  <span className={styles.countFileNum}>{item.count}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
