import { useEffect, useMemo, useState } from 'react';

import { BOOLEAN_THEORY_TOPICS } from '../../lib/boolean/gateReference';
import { BOOLEAN_LAWS } from '../../lib/boolean/laws';
import type { BooleanLaw } from '../../lib/boolean/types';
import { useI18n } from '../../lib/ui/i18n';
import { useExperienceMode } from '../../lib/ui/mode';
import styles from '../../styles/Boolean.module.css';
import dStyles from '../../styles/BooleanDiagrams.module.css';
import KatexSpan from '../KatexSpan';
import PillTabs, { type PillTabItem } from '../UI/PillTabs';

type LawCategoryFilter = 'all' | BooleanLaw['category'];

export interface BooleanLawsTabProps {
  readonly highlightedLawId: string | null;
  readonly onTryExample: (expr: string) => void;
}

export default function BooleanLawsTab({
  highlightedLawId,
  onTryExample,
}: BooleanLawsTabProps) {
  const { t } = useI18n();
  const { mode } = useExperienceMode();
  const isTeaching = mode === 'teaching';

  const [category, setCategory] = useState<LawCategoryFilter>('all');
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!highlightedLawId) return;
    const match = BOOLEAN_LAWS.find((l) => l.id === highlightedLawId);
    if (match) {
      setCategory(match.category);
      setQuery('');
      const timer = window.setTimeout(() => {
        document.getElementById(`bool-law-${highlightedLawId}`)?.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        });
      }, 40);
      return () => window.clearTimeout(timer);
    }
  }, [highlightedLawId]);

  const counts = useMemo(() => {
    const map: Record<LawCategoryFilter, number> = {
      all: BOOLEAN_LAWS.length,
      basic: 0,
      distributive: 0,
      demorgan: 0,
      advanced: 0,
    };
    for (const item of BOOLEAN_LAWS) map[item.category] += 1;
    return map;
  }, []);

  const categoryTabs: readonly PillTabItem<LawCategoryFilter>[] = useMemo(
    () => [
      { id: 'all', label: t('boolean.laws.cat.all'), badge: counts.all },
      { id: 'basic', label: t('boolean.laws.cat.basic'), badge: counts.basic },
      { id: 'distributive', label: t('boolean.laws.cat.distributive'), badge: counts.distributive },
      { id: 'demorgan', label: t('boolean.laws.cat.demorgan'), badge: counts.demorgan },
      { id: 'advanced', label: t('boolean.laws.cat.advanced'), badge: counts.advanced },
    ],
    [t, counts],
  );

  const normalizedQuery = query.trim().toLowerCase();

  const filtered = useMemo(() => {
    return BOOLEAN_LAWS.filter((item) => {
      if (category !== 'all' && item.category !== category) return false;
      if (!normalizedQuery) return true;
      const hay = [item.name, item.summary, item.theory, item.exampleExpr, ...item.keywords]
        .join(' ')
        .toLowerCase();
      return hay.includes(normalizedQuery);
    });
  }, [category, normalizedQuery]);

  return (
    <div className={styles.workspacePanel}>
      {/* Background Theory section */}
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <div>
            <h2 className={styles.cardTitle}>{t('boolean.theory.title')}</h2>
            <p className={styles.lead}>{t('boolean.theory.lead')}</p>
          </div>
        </div>
        <div className={dStyles.theoryTopicsGrid}>
          {BOOLEAN_THEORY_TOPICS.map((topic) => (
            <article key={topic.id} className={dStyles.theoryTopicCard}>
              <h3 className={styles.identityTitle}>{topic.title}</h3>
              {topic.formulaLatex && (
                <div className={styles.identityFormula}>
                  <KatexSpan text={topic.formulaLatex} />
                </div>
              )}
              <p className={styles.identitySummary}>{topic.summary}</p>
              <ul className={dStyles.theoryBulletList}>
                {topic.details.map((pt, idx) => (
                  <li key={idx}>{pt}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </div>

      {/* Searchable Laws & Identities catalog */}
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <div>
            <h2 className={styles.cardTitle}>{t('boolean.laws.title')}</h2>
            <p className={styles.lead}>{t('boolean.laws.lead')}</p>
          </div>
          <span className={styles.metaInline}>
            {t('boolean.laws.count', { count: filtered.length })}
          </span>
        </div>

        <div className={styles.identitiesControls}>
          <PillTabs<LawCategoryFilter>
            items={categoryTabs}
            value={category}
            onChange={setCategory}
            ariaLabel={t('boolean.laws.title')}
            size="sm"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('boolean.laws.searchPlaceholder')}
            aria-label={t('boolean.laws.searchPlaceholder')}
            className={styles.searchInput}
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className={styles.emptyState} role="status">
          <p>{t('boolean.laws.empty', { query: query.trim() })}</p>
          <button
            type="button"
            className={styles.btn}
            onClick={() => {
              setCategory('all');
              setQuery('');
            }}
          >
            {t('boolean.laws.reset')}
          </button>
        </div>
      ) : (
        <ul className={styles.identitiesGrid}>
          {filtered.map((item) => {
            const highlighted = highlightedLawId === item.id;
            return (
              <li
                key={item.id}
                id={`bool-law-${item.id}`}
                className={[
                  styles.identityCard,
                  highlighted ? styles.identityCardHighlight : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                <div className={styles.identityHead}>
                  <h3 className={styles.identityTitle}>{item.name}</h3>
                  <span className={styles.identityMeta}>
                    {t(`boolean.laws.cat.${item.category}`)}
                  </span>
                </div>
                <div className={styles.identityFormula}>
                  <KatexSpan text={item.formulaLatex} />
                </div>
                <p className={styles.identitySummary}>{item.summary}</p>
                {isTeaching && (
                  <div className={styles.theoryBox}>
                    <span className={styles.theoryPrefix}>{t('boolean.steps.theoryLabel')}:</span>
                    <span>{item.theory}</span>
                  </div>
                )}
                <div className={styles.identityFooter}>
                  <code className={styles.monoCode}>{item.exampleExpr}</code>
                  <button
                    type="button"
                    className={[styles.btn, styles.btnSmall].join(' ')}
                    onClick={() => onTryExample(item.exampleExpr)}
                  >
                    {t('boolean.laws.tryExample')}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
