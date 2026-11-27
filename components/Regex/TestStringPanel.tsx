import React from 'react';

import { MatchItem, TokenMatchSpan } from '../../lib/regex/types';
import { useI18n } from '../../lib/ui/i18n';
import styles from '../../styles/Regex.module.css';

interface TestStringPanelProps {
  testText: string;
  onTestTextChange: (value: string) => void;
  matches: readonly MatchItem[];
  activeTokenSpans: readonly TokenMatchSpan[];
  selectedMatchRange: { start: number; end: number } | null;
  onSelectMatchIndex?: (matchIndex: number) => void;
  hasActiveToken: boolean;
}

interface HighlightSegment {
  start: number;
  end: number;
  kind: 'plain' | 'matchEven' | 'matchOdd' | 'matchDim' | 'tokenActive' | 'matchSelected';
  matchIndex?: number;
}

function buildHighlightSegments(
  text: string,
  matches: readonly MatchItem[],
  activeTokenSpans: readonly TokenMatchSpan[],
  selectedMatchRange: { start: number; end: number } | null,
  hasActiveToken: boolean,
): HighlightSegment[] {
  const len = text.length;
  if (len === 0) return [];

  // Collect all boundary points
  const pts = new Set<number>([0, len]);
  for (const m of matches) {
    if (m.end > m.start) {
      pts.add(Math.max(0, Math.min(len, m.start)));
      pts.add(Math.max(0, Math.min(len, m.end)));
    }
  }
  for (const sp of activeTokenSpans) {
    if (sp.end > sp.start) {
      pts.add(Math.max(0, Math.min(len, sp.start)));
      pts.add(Math.max(0, Math.min(len, sp.end)));
    }
  }
  if (selectedMatchRange && selectedMatchRange.end > selectedMatchRange.start) {
    pts.add(Math.max(0, Math.min(len, selectedMatchRange.start)));
    pts.add(Math.max(0, Math.min(len, selectedMatchRange.end)));
  }

  const sorted = [...pts].sort((a, b) => a - b);
  const segments: HighlightSegment[] = [];

  for (let i = 0; i < sorted.length - 1; i++) {
    const start = sorted[i];
    const end = sorted[i + 1];
    if (end <= start) continue;

    const coveredByToken = activeTokenSpans.some((sp) => sp.start <= start && sp.end >= end && sp.end > sp.start);
    const coveredBySelected =
      selectedMatchRange !== null &&
      selectedMatchRange.start <= start &&
      selectedMatchRange.end >= end &&
      selectedMatchRange.end > selectedMatchRange.start;
    const matchObj = matches.find((m) => m.start <= start && m.end >= end && m.end > m.start);

    let kind: HighlightSegment['kind'] = 'plain';
    if (coveredByToken) {
      kind = 'tokenActive';
    } else if (coveredBySelected) {
      kind = 'matchSelected';
    } else if (matchObj) {
      kind = hasActiveToken
        ? 'matchDim'
        : matchObj.matchIndex % 2 === 0
          ? 'matchEven'
          : 'matchOdd';
    }

    segments.push({
      start,
      end,
      kind,
      matchIndex: matchObj?.matchIndex,
    });
  }

  return segments;
}

function segmentClass(kind: HighlightSegment['kind']): string {
  switch (kind) {
    case 'matchEven':
      return styles.hlMatchEven;
    case 'matchOdd':
      return styles.hlMatchOdd;
    case 'matchDim':
      return styles.hlMatchDim;
    case 'tokenActive':
      return styles.hlTokenActive;
    case 'matchSelected':
      return styles.hlMatchSelected;
    default:
      return '';
  }
}

export default function TestStringPanel({
  testText,
  onTestTextChange,
  matches,
  activeTokenSpans,
  selectedMatchRange,
  onSelectMatchIndex,
  hasActiveToken,
}: TestStringPanelProps) {
  const { t } = useI18n();
  const [viewMode, setViewMode] = React.useState<'edit' | 'lens'>('edit');
  const backdropRef = React.useRef<HTMLDivElement | null>(null);
  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);

  const segments = React.useMemo(
    () => buildHighlightSegments(testText, matches, activeTokenSpans, selectedMatchRange, hasActiveToken),
    [testText, matches, activeTokenSpans, selectedMatchRange, hasActiveToken],
  );

  const lineCount = testText.length === 0 ? 0 : testText.split('\n').length;

  const syncScroll = () => {
    if (!backdropRef.current || !textareaRef.current) return;
    backdropRef.current.scrollTop = textareaRef.current.scrollTop;
    backdropRef.current.scrollLeft = textareaRef.current.scrollLeft;
  };

  return (
    <section className={styles.card} aria-label={t('regex.test.heading')}>
      <div className={styles.cardHeader}>
        <div className={styles.cardTitleGroup}>
          <h2 className={styles.cardTitle}>{t('regex.test.heading')}</h2>
          <span className={styles.metaText}>
            {t('regex.test.charsLines', { chars: testText.length, lines: lineCount })}
          </span>
        </div>

        <div className={styles.segmented} role="group" aria-label={t('regex.test.heading')}>
          <button
            type="button"
            className={[styles.segBtn, viewMode === 'edit' ? styles.segBtnActive : ''].filter(Boolean).join(' ')}
            aria-pressed={viewMode === 'edit'}
            onClick={() => setViewMode('edit')}
          >
            {t('regex.test.viewEdit')}
          </button>
          <button
            type="button"
            className={[styles.segBtn, viewMode === 'lens' ? styles.segBtnActive : ''].filter(Boolean).join(' ')}
            aria-pressed={viewMode === 'lens'}
            onClick={() => setViewMode('lens')}
          >
            {t('regex.test.viewInspect')}
          </button>
        </div>
      </div>

      {viewMode === 'edit' ? (
        <div className={styles.testEditorShell} data-testid="regex-test-editor">
          <div ref={backdropRef} className={styles.testBackdrop} aria-hidden="true">
            {segments.length === 0 ? (
              '\u00a0'
            ) : (
              segments.map((seg) => {
                const slice = testText.slice(seg.start, seg.end);
                if (seg.kind === 'plain') {
                  return <React.Fragment key={`${seg.start}-${seg.end}`}>{slice}</React.Fragment>;
                }
                return (
                  <mark
                    key={`${seg.start}-${seg.end}`}
                    className={segmentClass(seg.kind)}
                    data-hl-kind={seg.kind}
                  >
                    {slice}
                  </mark>
                );
              })
            )}
            {testText.endsWith('\n') ? '\n\u00a0' : null}
          </div>

          <textarea
            ref={textareaRef}
            className={styles.testTextarea}
            aria-label={t('regex.test.aria')}
            placeholder={t('regex.test.placeholder')}
            value={testText}
            spellCheck={false}
            onChange={(e) => onTestTextChange(e.target.value)}
            onScroll={syncScroll}
          />
        </div>
      ) : (
        <div className={styles.testEditorShell} data-testid="regex-test-lens">
          <div className={styles.lensView}>
            {segments.length === 0 ? (
              <span className={styles.resultEmpty}>{t('regex.test.placeholder')}</span>
            ) : (
              segments.map((seg) => {
                const slice = testText.slice(seg.start, seg.end);
                if (seg.kind === 'plain') {
                  return <React.Fragment key={`${seg.start}-${seg.end}`}>{slice}</React.Fragment>;
                }
                const clickable = seg.matchIndex !== undefined && onSelectMatchIndex;
                return (
                  <mark
                    key={`${seg.start}-${seg.end}`}
                    className={[segmentClass(seg.kind), clickable ? styles.lensClickable : '']
                      .filter(Boolean)
                      .join(' ')}
                    data-hl-kind={seg.kind}
                    onClick={() => {
                      if (seg.matchIndex !== undefined && onSelectMatchIndex) {
                        onSelectMatchIndex(seg.matchIndex);
                      }
                    }}
                  >
                    {slice}
                  </mark>
                );
              })
            )}
          </div>
        </div>
      )}

      <div className={styles.testFooter}>
        <span>{matches.length === 0 && testText.length > 0 ? t('regex.test.noMatches') : t('regex.test.hintLinked')}</span>
      </div>
    </section>
  );
}
