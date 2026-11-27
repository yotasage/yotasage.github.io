import React from 'react';

import { REGEX_EXAMPLES } from '../../lib/regex/examples';
import { FLAVORS } from '../../lib/regex/flavors';
import { RegexExample, RegexFlavorId } from '../../lib/regex/types';
import { TranslationKey, useI18n } from '../../lib/ui/i18n';
import styles from '../../styles/Regex.module.css';

interface RegexExamplesProps {
  activeExampleId: string | null;
  onLoadExample: (example: RegexExample) => void;
}

type FlavorFilter = 'all' | RegexFlavorId;

export default function RegexExamples({
  activeExampleId,
  onLoadExample,
}: RegexExamplesProps) {
  const { t } = useI18n();
  const [flavorFilter, setFlavorFilter] = React.useState<FlavorFilter>('all');

  const availableFlavors = React.useMemo(() => {
    const seen = new Set<RegexFlavorId>();
    for (const ex of REGEX_EXAMPLES) {
      seen.add(ex.flavor);
    }
    return Array.from(seen);
  }, []);

  const filtered = React.useMemo(
    () =>
      flavorFilter === 'all'
        ? REGEX_EXAMPLES
        : REGEX_EXAMPLES.filter((ex) => ex.flavor === flavorFilter),
    [flavorFilter],
  );

  return (
    <div className={styles.examplesWorkspace}>
      <header className={styles.theoryHeader}>
        <h2>{t('regex.examples.heading')}</h2>
        <p>{t('regex.examples.intro')}</p>
      </header>

      <div
        className={styles.filterBar}
        role="group"
        aria-label={t('regex.examples.filterAria')}
      >
        <button
          type="button"
          className={[styles.filterBtn, flavorFilter === 'all' ? styles.filterBtnActive : '']
            .filter(Boolean)
            .join(' ')}
          aria-pressed={flavorFilter === 'all'}
          onClick={() => setFlavorFilter('all')}
        >
          {t('regex.examples.filterAll', { count: REGEX_EXAMPLES.length })}
        </button>

        {availableFlavors.map((fid) => {
          const count = REGEX_EXAMPLES.filter((ex) => ex.flavor === fid).length;
          const active = flavorFilter === fid;
          return (
            <button
              key={fid}
              type="button"
              className={[styles.filterBtn, active ? styles.filterBtnActive : '']
                .filter(Boolean)
                .join(' ')}
              aria-pressed={active}
              onClick={() => setFlavorFilter(fid)}
            >
              {FLAVORS[fid].shortName} ({count})
            </button>
          );
        })}
      </div>

      <div className={styles.examplesPageGrid}>
        {filtered.map((ex) => {
          const isActive = activeExampleId === ex.id;
          const flavorLabel = FLAVORS[ex.flavor].shortName;
          const flagLabel = ex.flags.join('');
          const delimLabel = ex.delimiter === 'none' ? 'raw' : `${ex.delimiter}…${ex.delimiter}`;
          const modeLabel =
            ex.extractionMode === 'replace'
              ? t('regex.examples.modeReplace')
              : t('regex.examples.modeExtract');

          return (
            <article
              key={ex.id}
              className={[styles.exampleCard, isActive ? styles.exampleCardActive : '']
                .filter(Boolean)
                .join(' ')}
            >
              <div className={styles.exampleCardTop}>
                <div className={styles.exampleCardTitleRow}>
                  <h3 className={styles.exampleCardTitle}>
                    {t(`regex.ex.${ex.id}.title` as TranslationKey)}
                  </h3>
                  {isActive && (
                    <span className={styles.activeBadge}>{t('regex.examples.loadedBadge')}</span>
                  )}
                </div>
                <span className={styles.exampleMeta}>
                  {flavorLabel} · {delimLabel}
                  {flagLabel ? ` ${flagLabel}` : ''} · {modeLabel}
                </span>
              </div>

              <p className={styles.exampleCardDesc}>
                {t(`regex.ex.${ex.id}.desc` as TranslationKey)}
              </p>

              <div className={styles.examplePreviewBox}>
                <div className={styles.examplePreviewRow}>
                  <span className={styles.examplePreviewLabel}>
                    {t('regex.examples.patternLabel')}
                  </span>
                  <code className={styles.examplePreviewCode}>
                    {ex.pattern.replace(/\s*\n\s*/g, ' ')}
                  </code>
                </div>
                <div className={styles.examplePreviewRow}>
                  <span className={styles.examplePreviewLabel}>
                    {t('regex.examples.templateLabel')}
                  </span>
                  <code className={styles.examplePreviewCode}>{ex.template}</code>
                </div>
              </div>

              <div className={styles.exampleCardFooter}>
                <button
                  type="button"
                  className={styles.buttonSmall}
                  onClick={() => onLoadExample(ex)}
                >
                  {t('regex.examples.loadBtn')}
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
