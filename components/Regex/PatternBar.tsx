import React from 'react';

import {
  ALL_FLAGS,
  DELIMITER_OPTIONS,
  FLAVOR_LIST,
  FLAVORS,
  getDelimiterDisplay,
} from '../../lib/regex/flavors';
import { flattenTokens } from '../../lib/regex/parser';
import {
  DelimiterOption,
  ExecutionResult,
  RegexFlavorId,
  RegexFlagId,
  RegexToken,
} from '../../lib/regex/types';
import { useI18n } from '../../lib/ui/i18n';
import styles from '../../styles/Regex.module.css';

interface PatternBarProps {
  pattern: string;
  onPatternChange: (value: string) => void;
  flavor: RegexFlavorId;
  onFlavorChange: (flavor: RegexFlavorId) => void;
  delimiter: DelimiterOption;
  onDelimiterChange: (delim: DelimiterOption) => void;
  flags: readonly RegexFlagId[];
  onToggleFlag: (flag: RegexFlagId) => void;
  onResetDefaultFlags: () => void;
  result: ExecutionResult;
  activeTokenId: string | null;
  pinnedTokenId: string | null;
  onClearPin: () => void;
  onClearAll: () => void;
}

function tokenClassName(kind: RegexToken['kind']): string {
  switch (kind) {
    case 'group':
    case 'namedGroup':
    case 'nonCapturingGroup':
    case 'lookahead':
    case 'negLookahead':
    case 'lookbehind':
    case 'negLookbehind':
      return styles.synGroup;
    case 'charClass':
    case 'negCharClass':
      return styles.synCharClass;
    case 'shorthand':
    case 'dot':
      return styles.synShorthand;
    case 'anchor':
    case 'alternation':
    case 'inlineFlag':
      return styles.synAnchor;
    case 'escape':
    case 'backreference':
      return styles.synEscape;
    case 'comment':
      return styles.synComment;
    default:
      return '';
  }
}

function renderPatternHighlight(
  pattern: string,
  tokens: readonly RegexToken[],
  activeTokenId: string | null,
): React.ReactNode {
  if (!pattern) {
    return '\u00a0';
  }

  // Highlight active token range directly if one is hovered or pinned
  const flat = flattenTokens(tokens);
  const activeToken = activeTokenId ? flat.find((tok) => tok.id === activeTokenId) : undefined;

  if (activeToken && activeToken.start >= 0 && activeToken.end <= pattern.length && activeToken.end > activeToken.start) {
    return (
      <>
        <span>{pattern.slice(0, activeToken.start)}</span>
        <mark className={styles.synActiveToken}>{pattern.slice(activeToken.start, activeToken.end)}</mark>
        <span>{pattern.slice(activeToken.end)}</span>
      </>
    );
  }

  // Otherwise syntax-color top-level leaf/group tokens cleanly without losing a single character
  const pieces: React.ReactNode[] = [];
  let cursor = 0;

  for (const tok of tokens) {
    if (tok.start > cursor) {
      pieces.push(<span key={`gap-${cursor}`}>{pattern.slice(cursor, tok.start)}</span>);
    }
    if (tok.start >= cursor && tok.end <= pattern.length) {
      const cls = tokenClassName(tok.kind);
      if (tok.quantifier && tok.quantifier.start >= tok.start && tok.quantifier.end <= tok.end) {
        const coreSlice = pattern.slice(tok.start, tok.quantifier.start);
        const quantSlice = pattern.slice(tok.quantifier.start, tok.quantifier.end);
        pieces.push(
          <span key={tok.id}>
            <span className={cls}>{coreSlice}</span>
            <span className={styles.synQuant}>{quantSlice}</span>
          </span>,
        );
      } else {
        pieces.push(
          <span key={tok.id} className={cls}>
            {pattern.slice(tok.start, tok.end)}
          </span>,
        );
      }
      cursor = tok.end;
    }
  }
  if (cursor < pattern.length) {
    pieces.push(<span key={`tail-${cursor}`}>{pattern.slice(cursor)}</span>);
  }

  // Trailing space keeps line-height aligned when pattern ends with a newline
  if (pattern.endsWith('\n')) {
    pieces.push(<span key="eol-pad">{'\u00a0'}</span>);
  }
  return pieces;
}

export default function PatternBar({
  pattern,
  onPatternChange,
  flavor,
  onFlavorChange,
  delimiter,
  onDelimiterChange,
  flags,
  onToggleFlag,
  onResetDefaultFlags,
  result,
  activeTokenId,
  pinnedTokenId,
  onClearPin,
  onClearAll,
}: PatternBarProps) {
  const { t } = useI18n();
  const [copied, setCopied] = React.useState(false);
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  const flavorSpec = FLAVORS[flavor];
  const delimDisplay = getDelimiterDisplay(delimiter, flavor);
  const supportedFlagSet = React.useMemo(
    () => new Set(flavorSpec.supportedFlags),
    [flavorSpec.supportedFlags],
  );
  const activeFlagSet = React.useMemo(() => new Set(flags), [flags]);
  const isMultilinePattern = pattern.includes('\n') || activeFlagSet.has('x');

  const pinnedToken = React.useMemo(() => {
    if (!pinnedTokenId) return undefined;
    return flattenTokens(result.tokens).find((tok) => tok.id === pinnedTokenId);
  }, [pinnedTokenId, result.tokens]);

  const handleCopyRegex = () => {
    const flagStr = flags.filter((f) => supportedFlagSet.has(f)).join('');
    const formatted =
      delimiter !== 'none'
        ? `${delimiter}${pattern}${delimiter}${flagStr}`
        : `${flavorSpec.literalPrefix}${pattern}${flavorSpec.literalSuffix}`;
    navigator.clipboard?.writeText(formatted).then(
      () => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1600);
      },
      () => {},
    );
  };

  const matchUnit =
    result.matches.length === 1 ? t('regex.status.matchSingular') : t('regex.status.matchPlural');

  return (
    <section className={styles.card} aria-label={t('regex.pattern.heading')}>
      <div className={styles.studioTopRow}>
        <div className={styles.cardTitleGroup}>
          <h2 className={styles.cardTitle}>{t('regex.pattern.heading')}</h2>
          <span className={styles.metaText}>{flavorSpec.summary}</span>
        </div>

        <div className={styles.studioControls}>
          <label className={styles.inlineField}>
            <span>{t('regex.flavor.label')}</span>
            <select
              className={styles.select}
              aria-label={t('regex.flavor.aria')}
              value={flavor}
              onChange={(e) => onFlavorChange(e.target.value as RegexFlavorId)}
            >
              {FLAVOR_LIST.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            className={styles.buttonSmall}
            onClick={onResetDefaultFlags}
            title={`Default flags for ${flavorSpec.shortName}: ${flavorSpec.defaultFlags.join('') || 'none'}`}
          >
            {t('regex.flags.resetDefaults')}
          </button>

          <button
            type="button"
            className={[styles.buttonSmall, copied ? styles.buttonCopied : ''].filter(Boolean).join(' ')}
            onClick={handleCopyRegex}
            disabled={!pattern}
          >
            {copied ? t('regex.copied') : t('regex.copyPattern')}
          </button>

          <button type="button" className={styles.buttonSmall} onClick={onClearAll}>
            {t('regex.clear')}
          </button>
        </div>
      </div>

      <div
        className={[styles.patternBox, !result.valid ? styles.patternBoxError : '']
          .filter(Boolean)
          .join(' ')}
      >
        <select
          className={styles.delimSelect}
          aria-label={t('regex.delimiter.aria')}
          title={t('regex.delimiter.label')}
          value={delimiter}
          onChange={(e) => onDelimiterChange(e.target.value as DelimiterOption)}
        >
          {DELIMITER_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.value === 'none'
                ? flavorSpec.literalPrefix === '/'
                  ? 'raw'
                  : flavorSpec.literalPrefix
                : opt.value}
            </option>
          ))}
        </select>

        <div className={styles.patternEditorWrap}>
          <div className={styles.patternBackdrop} aria-hidden="true">
            {pattern ? (
              renderPatternHighlight(pattern, result.tokens, activeTokenId)
            ) : (
              <span className={styles.patternPlaceholder}>{t('regex.pattern.placeholder')}</span>
            )}
          </div>
          <textarea
            className={styles.patternInput}
            aria-label={t('regex.pattern.aria')}
            value={pattern}
            rows={isMultilinePattern ? Math.min(8, Math.max(2, pattern.split('\n').length)) : 1}
            spellCheck={false}
            autoCapitalize="off"
            autoComplete="off"
            autoCorrect="off"
            onChange={(e) => onPatternChange(e.target.value)}
            onKeyDown={(e) => {
              if (!activeFlagSet.has('x') && e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
              }
            }}
          />
        </div>

        <span className={styles.delimMirror} aria-hidden="true">
          {delimDisplay.close || '\u00a0'}
        </span>

        <div className={styles.flagsStrip} role="group" aria-label={t('regex.flags.aria')}>
          {ALL_FLAGS.filter((f) => supportedFlagSet.has(f.id)).map((flag) => {
            const active = activeFlagSet.has(flag.id);
            return (
              <button
                key={flag.id}
                type="button"
                className={[styles.flagBtn, active ? styles.flagBtnActive : ''].filter(Boolean).join(' ')}
                aria-pressed={active}
                aria-label={`${flag.id} — ${flag.name}: ${flag.shortDesc}`}
                title={`${flag.id} (${flag.name}) — ${flag.shortDesc}`}
                onClick={() => onToggleFlag(flag.id)}
              >
                {flag.id}
              </button>
            );
          })}
        </div>
      </div>

      <div className={styles.statusRow} role="status" aria-live="polite">
        <div className={styles.statusMetrics}>
          {!pattern ? (
            <span>{t('regex.status.empty')}</span>
          ) : !result.valid ? (
            <span className={styles.statusBad}>{t('regex.status.error')}</span>
          ) : (
            <>
              <span className={[styles.statusItem, result.matches.length > 0 ? styles.statusGood : ''].filter(Boolean).join(' ')}>
                {t('regex.status.matches', { count: result.matches.length, unit: matchUnit })}
              </span>
              <span className={styles.statusItem}>
                {t('regex.status.groups', { count: result.groupNames.length })}
              </span>
              {mounted && (
                <span className={styles.statusItem}>{result.elapsedMs.toFixed(2)} ms</span>
              )}
              <span className={styles.statusItem}>{flavorSpec.shortName}</span>
              {result.truncated && (
                <span className={[styles.statusItem, styles.statusBad].join(' ')}>
                  {t('regex.status.truncated')}
                </span>
              )}
            </>
          )}
        </div>
      </div>

      {pinnedToken && (
        <div className={styles.pinBanner}>
          <span>{t('regex.status.pinHint', { token: pinnedToken.raw })}</span>
          <button type="button" className={styles.buttonSmall} onClick={onClearPin}>
            {t('regex.status.clearPin')}
          </button>
        </div>
      )}

      {(!result.valid || result.warnings.length > 0) && (
        <div className={styles.diagnosticList}>
          {!result.valid && result.error && (
            <div className={styles.errorBanner} role="alert">
              {result.error}
            </div>
          )}
          {result.warnings.map((w, idx) => (
            <div key={`${w.code}-${idx}`} className={styles.warnBanner} role="status">
              {w.message}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
