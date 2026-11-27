import React from 'react';

import { QUICK_INSERT_TOKENS } from '../../lib/regex/theory';
import { MatchItem, RegexToken, TokenMatchSpan } from '../../lib/regex/types';
import { useI18n } from '../../lib/ui/i18n';
import styles from '../../styles/Regex.module.css';

export type InspectorTab = 'explain' | 'matches' | 'quickRef';

interface ExplanationPanelProps {
  activeTab: InspectorTab;
  onTabChange: (tab: InspectorTab) => void;
  tokens: readonly RegexToken[];
  matches: readonly MatchItem[];
  tokenSpansByTokenId: Record<string, TokenMatchSpan[]>;
  activeTokenId: string | null;
  pinnedTokenId: string | null;
  onHoverToken: (tokenId: string | null) => void;
  onTogglePinToken: (tokenId: string) => void;
  onHighlightRange: (range: { start: number; end: number } | null) => void;
  onInsertPatternToken: (token: string) => void;
}

interface TokenNodeProps {
  token: RegexToken;
  tokenSpansByTokenId: Record<string, TokenMatchSpan[]>;
  activeTokenId: string | null;
  pinnedTokenId: string | null;
  onHoverToken: (tokenId: string | null) => void;
  onTogglePinToken: (tokenId: string) => void;
}

function formatVisibleSnippet(value: string): string {
  if (value === '') return '""';
  if (/^\s+$/.test(value)) {
    return value.replace(/ /g, '␣').replace(/\t/g, '⇥').replace(/\r/g, '␍').replace(/\n/g, '↵');
  }
  return value.replace(/\t/g, '⇥').replace(/\n/g, '↵');
}

function TokenNode({
  token,
  tokenSpansByTokenId,
  activeTokenId,
  pinnedTokenId,
  onHoverToken,
  onTogglePinToken,
}: TokenNodeProps) {
  const { t } = useI18n();
  const spans = tokenSpansByTokenId[token.id] ?? [];
  const isActive = activeTokenId === token.id;
  const isPinned = pinnedTokenId === token.id;
  const displayRaw = formatVisibleSnippet(token.raw);

  // Deduplicate sample texts while preserving order
  const uniqueSamples = React.useMemo(() => {
    const out: string[] = [];
    for (const sp of spans) {
      if (out.length >= 4) break;
      if (!out.includes(sp.text)) out.push(sp.text);
    }
    return out;
  }, [spans]);

  return (
    <li>
      <button
        type="button"
        className={[
          styles.explainRowBtn,
          isActive ? styles.explainRowActive : '',
          isPinned && !isActive ? styles.explainRowPinned : '',
        ]
          .filter(Boolean)
          .join(' ')}
        aria-pressed={isPinned}
        aria-label={t('regex.explain.pinAria', { token: token.raw === ' ' ? 'space' : displayRaw })}
        onMouseEnter={() => onHoverToken(token.id)}
        onMouseLeave={() => onHoverToken(null)}
        onFocus={() => onHoverToken(token.id)}
        onBlur={() => onHoverToken(null)}
        onClick={() => onTogglePinToken(token.id)}
      >
        <div className={styles.explainRowTop}>
          <code className={styles.tokenCode}>{displayRaw}</code>
          <span className={styles.tokenKindLabel}>{token.label}</span>
        </div>

        <p className={styles.explainDesc}>{token.description}</p>

        {token.quantifierDescription && (
          <p className={styles.explainQuant}>
            {token.quantifier?.raw}: {token.quantifierDescription}
          </p>
        )}

        {token.matchable && spans.length > 0 && (
          <div className={styles.matchedLine}>
            <span className={styles.matchedPrefix}>{t('regex.explain.matchesPrefix')}</span>
            {uniqueSamples.map((sample, i) => (
              <code key={`${token.id}-s-${i}`} className={styles.matchedSample}>
                {formatVisibleSnippet(sample)}
              </code>
            ))}
            {spans.length > uniqueSamples.length && (
              <span className={styles.metaText}>
                {t('regex.explain.moreSpans', { count: spans.length - uniqueSamples.length })}
              </span>
            )}
          </div>
        )}
      </button>

      {token.children && token.children.length > 0 && (
        <ul className={styles.explainNested}>
          {token.children.map((child) => (
            <TokenNode
              key={child.id}
              token={child}
              tokenSpansByTokenId={tokenSpansByTokenId}
              activeTokenId={activeTokenId}
              pinnedTokenId={pinnedTokenId}
              onHoverToken={onHoverToken}
              onTogglePinToken={onTogglePinToken}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

export default function ExplanationPanel({
  activeTab,
  onTabChange,
  tokens,
  matches,
  tokenSpansByTokenId,
  activeTokenId,
  pinnedTokenId,
  onHoverToken,
  onTogglePinToken,
  onHighlightRange,
  onInsertPatternToken,
}: ExplanationPanelProps) {
  const { t } = useI18n();

  return (
    <aside className={styles.card} aria-label={t('regex.inspector.explain')}>
      <div className={styles.cardHeader}>
        <div className={styles.segmented} role="tablist" aria-label={t('regex.inspector.explain')}>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'explain'}
            className={[styles.segBtn, activeTab === 'explain' ? styles.segBtnActive : ''].filter(Boolean).join(' ')}
            onClick={() => onTabChange('explain')}
          >
            {t('regex.inspector.explain')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'matches'}
            className={[styles.segBtn, activeTab === 'matches' ? styles.segBtnActive : ''].filter(Boolean).join(' ')}
            onClick={() => onTabChange('matches')}
          >
            {t('regex.inspector.matches')} ({matches.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'quickRef'}
            className={[styles.segBtn, activeTab === 'quickRef' ? styles.segBtnActive : ''].filter(Boolean).join(' ')}
            onClick={() => onTabChange('quickRef')}
          >
            {t('regex.inspector.quickRef')}
          </button>
        </div>
      </div>

      <div className={styles.inspectorBody}>
        {activeTab === 'explain' && (
          tokens.length === 0 ? (
            <p className={styles.resultEmpty}>{t('regex.explain.empty')}</p>
          ) : (
            <ul className={styles.explainList} data-testid="regex-explanation-list">
              {tokens.map((tok) => (
                <TokenNode
                  key={tok.id}
                  token={tok}
                  tokenSpansByTokenId={tokenSpansByTokenId}
                  activeTokenId={activeTokenId}
                  pinnedTokenId={pinnedTokenId}
                  onHoverToken={onHoverToken}
                  onTogglePinToken={onTogglePinToken}
                />
              ))}
            </ul>
          )
        )}

        {activeTab === 'matches' && (
          matches.length === 0 ? (
            <p className={styles.resultEmpty}>{t('regex.matches.empty')}</p>
          ) : (
            <div className={styles.matchList} data-testid="regex-match-list">
              {matches.slice(0, 100).map((m) => (
                <div key={m.matchIndex} className={styles.matchCard}>
                  <div className={styles.matchCardHeader}>
                    <button
                      type="button"
                      className={styles.matchHeadBtn}
                      onMouseEnter={() => onHighlightRange({ start: m.start, end: m.end })}
                      onMouseLeave={() => onHighlightRange(null)}
                      onClick={() => onHighlightRange({ start: m.start, end: m.end })}
                    >
                      {t('regex.matches.matchLabel', { index: m.matchIndex + 1 })}
                    </button>
                    <span className={styles.matchRange}>
                      [{m.start}–{m.end}]
                    </span>
                  </div>

                  <button
                    type="button"
                    className={styles.matchGroupRow}
                    onMouseEnter={() => onHighlightRange({ start: m.start, end: m.end })}
                    onMouseLeave={() => onHighlightRange(null)}
                    onClick={() => onHighlightRange({ start: m.start, end: m.end })}
                  >
                    <span className={styles.matchGroupName}>{t('regex.matches.fullMatch')} ($0)</span>
                    <code className={styles.matchGroupVal}>{m.fullMatch || '""'}</code>
                  </button>

                  {m.groups.map((g) => (
                    <button
                      key={g.index}
                      type="button"
                      className={styles.matchGroupRow}
                      disabled={g.start < 0}
                      onMouseEnter={() =>
                        g.start >= 0 ? onHighlightRange({ start: g.start, end: g.end }) : undefined
                      }
                      onMouseLeave={() => onHighlightRange(null)}
                      onClick={() =>
                        g.start >= 0 ? onHighlightRange({ start: g.start, end: g.end }) : undefined
                      }
                    >
                      <span className={styles.matchGroupName}>
                        {g.name
                          ? `${g.name} ($${g.index})`
                          : `${t('regex.matches.groupLabel', { index: g.index })} ($${g.index})`}
                      </span>
                      {g.value !== undefined ? (
                        <code className={styles.matchGroupVal}>{g.value || '""'}</code>
                      ) : (
                        <span className={styles.matchGroupEmpty}>{t('regex.matches.unmatchedGroup')}</span>
                      )}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )
        )}

        {activeTab === 'quickRef' && (
          <div>
            <p className={styles.explainDesc} style={{ marginBottom: 10 }}>
              {t('regex.quickRef.hint')}
            </p>
            <div className={styles.quickRefGrid}>
              {QUICK_INSERT_TOKENS.map((item) => (
                <button
                  key={item.token}
                  type="button"
                  className={styles.quickRefBtn}
                  onClick={() => onInsertPatternToken(item.token)}
                >
                  <code className={styles.quickRefToken}>{item.token}</code>
                  <span className={styles.quickRefHint}>{item.hint}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
