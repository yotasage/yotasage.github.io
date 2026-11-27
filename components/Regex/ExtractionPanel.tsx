import React from 'react';

import { FLAVORS, generateLanguageSnippet } from '../../lib/regex/flavors';
import {
  DelimiterOption,
  ExtractJoinMode,
  ExtractionMode,
  RegexFlavorId,
  RegexFlagId,
} from '../../lib/regex/types';
import { useI18n } from '../../lib/ui/i18n';
import styles from '../../styles/Regex.module.css';

interface ExtractionPanelProps {
  mode: ExtractionMode;
  onModeChange: (mode: ExtractionMode) => void;
  template: string;
  onTemplateChange: (value: string) => void;
  joinMode: ExtractJoinMode;
  onJoinModeChange: (joinMode: ExtractJoinMode) => void;
  output: string;
  itemCount: number;
  groupNames: readonly { index: number; name?: string }[];
  flavor: RegexFlavorId;
  pattern: string;
  flags: readonly RegexFlagId[];
  delimiter: DelimiterOption;
  showCodeSnippet: boolean;
}

export default function ExtractionPanel({
  mode,
  onModeChange,
  template,
  onTemplateChange,
  joinMode,
  onJoinModeChange,
  output,
  itemCount,
  groupNames,
  flavor,
  pattern,
  flags,
  delimiter,
  showCodeSnippet,
}: ExtractionPanelProps) {
  const { t } = useI18n();
  const [copiedResult, setCopiedResult] = React.useState(false);
  const [copiedCode, setCopiedCode] = React.useState(false);
  const [codeExpanded, setCodeExpanded] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  const insertToken = (token: string) => {
    const el = inputRef.current;
    if (!el) {
      onTemplateChange(template + token);
      return;
    }
    const start = el.selectionStart ?? template.length;
    const end = el.selectionEnd ?? template.length;
    const next = template.slice(0, start) + token + template.slice(end);
    onTemplateChange(next);
    window.requestAnimationFrame(() => {
      el.focus();
      const pos = start + token.length;
      el.setSelectionRange(pos, pos);
    });
  };

  const quickTokens = React.useMemo(() => {
    const list: string[] = ['$0'];
    for (const g of groupNames.slice(0, 8)) {
      list.push(g.name ? `$<${g.name}>` : `$${g.index}`);
    }
    list.push('$i', '\\n', '\\t');
    return list;
  }, [groupNames]);

  const snippet = React.useMemo(
    () =>
      generateLanguageSnippet({
        flavor,
        pattern,
        flags,
        delimiter,
        template,
        extractionMode: mode,
      }),
    [flavor, pattern, flags, delimiter, template, mode],
  );

  const copyText = (text: string, which: 'result' | 'code') => {
    navigator.clipboard?.writeText(text).then(
      () => {
        if (which === 'result') {
          setCopiedResult(true);
          window.setTimeout(() => setCopiedResult(false), 1600);
        } else {
          setCopiedCode(true);
          window.setTimeout(() => setCopiedCode(false), 1600);
        }
      },
      () => {},
    );
  };

  return (
    <section className={styles.card} aria-label={t('regex.result.heading')}>
      <div className={styles.cardHeader}>
        <div className={styles.cardTitleGroup}>
          <h2 className={styles.cardTitle}>{t('regex.result.heading')}</h2>
          <span className={styles.metaText}>
            {mode === 'extract'
              ? t('regex.result.count', { count: itemCount })
              : t('regex.result.replacedCount', { count: itemCount })}
          </span>
        </div>

        <div className={styles.studioControls}>
          <div className={styles.segmented} role="group" aria-label={t('regex.result.heading')}>
            <button
              type="button"
              className={[styles.segBtn, mode === 'extract' ? styles.segBtnActive : ''].filter(Boolean).join(' ')}
              aria-pressed={mode === 'extract'}
              onClick={() => onModeChange('extract')}
            >
              {t('regex.result.modeExtract')}
            </button>
            <button
              type="button"
              className={[styles.segBtn, mode === 'replace' ? styles.segBtnActive : ''].filter(Boolean).join(' ')}
              aria-pressed={mode === 'replace'}
              onClick={() => onModeChange('replace')}
            >
              {t('regex.result.modeReplace')}
            </button>
          </div>

          <button
            type="button"
            className={[styles.buttonSmall, copiedResult ? styles.buttonCopied : ''].filter(Boolean).join(' ')}
            onClick={() => copyText(output, 'result')}
            disabled={!output}
          >
            {copiedResult ? t('regex.copied') : t('regex.result.copy')}
          </button>
        </div>
      </div>

      <div className={styles.templateRow}>
        <input
          ref={inputRef}
          type="text"
          className={styles.templateInput}
          aria-label={mode === 'extract' ? t('regex.result.templateLabel') : t('regex.result.replaceLabel')}
          placeholder={t('regex.result.templatePlaceholder')}
          value={template}
          spellCheck={false}
          onChange={(e) => onTemplateChange(e.target.value)}
        />

        {mode === 'extract' && (
          <label className={styles.inlineField}>
            <span>{t('regex.result.joinLabel')}</span>
            <select
              className={styles.select}
              aria-label={t('regex.result.joinLabel')}
              value={joinMode}
              onChange={(e) => onJoinModeChange(e.target.value as ExtractJoinMode)}
            >
              <option value="newline">{t('regex.result.join.newline')}</option>
              <option value="comma">{t('regex.result.join.comma')}</option>
              <option value="tab">{t('regex.result.join.tab')}</option>
              <option value="none">{t('regex.result.join.none')}</option>
              <option value="json">{t('regex.result.join.json')}</option>
            </select>
          </label>
        )}
      </div>

      <div className={styles.insertBar}>
        <span className={styles.insertLabel}>{t('regex.result.insertToken')}</span>
        {quickTokens.map((tok) => (
          <button
            key={tok}
            type="button"
            className={styles.insertBtn}
            onClick={() => insertToken(tok)}
          >
            {tok}
          </button>
        ))}
      </div>

      <pre className={styles.resultOutput} data-testid="regex-extraction-output">
        {output ? output : <span className={styles.resultEmpty}>{t('regex.result.empty')}</span>}
      </pre>

      {showCodeSnippet && (
        <div className={styles.codeDrawer}>
          <div className={styles.codeHeader}>
            <button
              type="button"
              className={styles.buttonSmall}
              aria-expanded={codeExpanded}
              onClick={() => setCodeExpanded((prev) => !prev)}
            >
              {t('regex.code.heading', { flavor: FLAVORS[flavor].shortName })}
            </button>

            {codeExpanded && (
              <button
                type="button"
                className={[styles.buttonSmall, copiedCode ? styles.buttonCopied : ''].filter(Boolean).join(' ')}
                onClick={() => copyText(snippet, 'code')}
              >
                {copiedCode ? t('regex.copied') : t('regex.code.copy')}
              </button>
            )}
          </div>

          {codeExpanded && <pre className={styles.codeBlock}>{snippet}</pre>}
        </div>
      )}
    </section>
  );
}
