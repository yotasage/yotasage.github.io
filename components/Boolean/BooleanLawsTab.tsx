import { useEffect, useMemo, useState } from 'react';

import { BOOLEAN_THEORY_TOPICS } from '../../lib/boolean/gateReference';
import { BOOLEAN_LAWS } from '../../lib/boolean/laws';
import type { BooleanLaw } from '../../lib/boolean/types';
import { type TranslationKey, useI18n } from '../../lib/ui/i18n';
import { useExperienceMode } from '../../lib/ui/mode';
import styles from '../../styles/Boolean.module.css';
import dStyles from '../../styles/BooleanDiagrams.module.css';
import KatexSpan from '../KatexSpan';
import PillTabs, { type PillTabItem } from '../UI/PillTabs';
import GateReferenceTab from './GateReferenceTab';
import KMapGuideSection from './KMapGuideSection';

type LawCategoryFilter = 'all' | BooleanLaw['category'];
export type TheorySubTab = 'overview' | 'gates' | 'kmap-guide';

export interface BooleanLawsTabProps {
  readonly highlightedLawId: string | null;
  readonly activeSubTab: TheorySubTab;
  readonly onSubTabChange: (next: TheorySubTab) => void;
  readonly onTryExample: (expr: string) => void;
  readonly onOpenKMapExample: (expr: string) => void;
}

export default function BooleanLawsTab({
  highlightedLawId,
  activeSubTab,
  onSubTabChange,
  onTryExample,
  onOpenKMapExample,
}: BooleanLawsTabProps) {
  const { t } = useI18n();
  const { mode } = useExperienceMode();
  const isTeaching = mode === 'teaching';

  const [category, setCategory] = useState<LawCategoryFilter>('all');
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!highlightedLawId) return;
    onSubTabChange('overview');
    const match = BOOLEAN_LAWS.find((l) => l.id === highlightedLawId);
    if (match) {
      setCategory(match.category);
      setQuery('');
      const timer = window.setTimeout(() => {
        document.getElementById(`bool-law-${highlightedLawId}`)?.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        });
      }, 60);
      return () => window.clearTimeout(timer);
    }
  }, [highlightedLawId, onSubTabChange]);

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

  const tx = (key: string, fallback: string) => {
    const k = key as TranslationKey;
    const res = t(k);
    return res === k ? fallback : res;
  };

  const filtered = useMemo(() => {
    return BOOLEAN_LAWS.filter((item) => {
      if (category !== 'all' && item.category !== category) return false;
      if (!normalizedQuery) return true;
      const locName = tx(`boolean.law.${item.id}.name`, item.name);
      const locSummary = tx(`boolean.law.${item.id}.summary`, item.summary);
      const locTheory = tx(`boolean.law.${item.id}.theory`, item.theory);
      const hay = [
        locName,
        locSummary,
        locTheory,
        item.name,
        item.summary,
        item.theory,
        item.exampleExpr,
        ...item.keywords,
      ]
        .join(' ')
        .toLowerCase();
      return hay.includes(normalizedQuery);
    });
  }, [category, normalizedQuery, t]);

  return (
    <div className={styles.workspacePanel}>
      <div className={styles.workspaceBar}>
        <div className={styles.analysisTabList} role="tablist" aria-label={t('boolean.laws.sectionsAria')}>
          <button
            type="button"
            role="tab"
            aria-selected={activeSubTab === 'overview'}
            data-testid="theory-subtab-overview"
            className={[
              styles.analysisTab,
              activeSubTab === 'overview' ? styles.analysisTabActive : '',
            ]
              .filter(Boolean)
              .join(' ')}
            onClick={() => onSubTabChange('overview')}
          >
            {t('boolean.theory.subtab.overview')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeSubTab === 'gates'}
            data-testid="theory-subtab-gates"
            className={[
              styles.analysisTab,
              activeSubTab === 'gates' ? styles.analysisTabActive : '',
            ]
              .filter(Boolean)
              .join(' ')}
            onClick={() => onSubTabChange('gates')}
          >
            {t('boolean.workspace.gates')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeSubTab === 'kmap-guide'}
            data-testid="theory-subtab-kmap-guide"
            className={[
              styles.analysisTab,
              activeSubTab === 'kmap-guide' ? styles.analysisTabActive : '',
            ]
              .filter(Boolean)
              .join(' ')}
            onClick={() => onSubTabChange('kmap-guide')}
          >
            {t('boolean.theory.subtab.kmapGuide')}
          </button>
        </div>
      </div>

      {activeSubTab === 'gates' ? (
        <GateReferenceTab onTryGate={onTryExample} />
      ) : activeSubTab === 'kmap-guide' ? (
        <KMapGuideSection onOpenExampleInKMap={onOpenKMapExample} />
      ) : (
        <>
          {/* Background Theory section */}
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <div>
                <h2 className={styles.cardTitle}>{t('boolean.theory.title')}</h2>
                <p className={styles.lead}>{t('boolean.theory.lead')}</p>
              </div>
              <button
                type="button"
                className={[styles.btn, styles.btnSmall].join(' ')}
                onClick={() => onSubTabChange('kmap-guide')}
              >
                {t('boolean.theory.subtab.kmapGuide')} →
              </button>
            </div>
            <div className={dStyles.theoryTopicsGrid}>
              {BOOLEAN_THEORY_TOPICS.map((topic) => (
                <article key={topic.id} className={dStyles.theoryTopicCard}>
                  <h3 className={styles.identityTitle}>
                    {tx(`boolean.theory.${topic.id}.title`, topic.title)}
                  </h3>
                  {topic.formulaLatex && (
                    <div className={styles.identityFormula}>
                      <KatexSpan text={topic.formulaLatex} />
                    </div>
                  )}
                  <p className={styles.identitySummary}>
                    {tx(`boolean.theory.${topic.id}.summary`, topic.summary)}
                  </p>
                  <ul className={dStyles.theoryBulletList}>
                    {topic.details.map((pt, idx) => (
                      <li key={idx}>{tx(`boolean.theory.${topic.id}.d${idx}`, pt)}</li>
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
                      <h3 className={styles.identityTitle}>
                        {tx(`boolean.law.${item.id}.name`, item.name)}
                      </h3>
                      <span className={styles.identityMeta}>
                        {t(`boolean.laws.cat.${item.category}`)}
                      </span>
                    </div>
                    <div className={styles.identityFormula}>
                      <KatexSpan text={item.formulaLatex} />
                    </div>
                    <p className={styles.identitySummary}>
                      {tx(`boolean.law.${item.id}.summary`, item.summary)}
                    </p>
                    {isTeaching && (
                      <div className={styles.theoryBox}>
                        <span className={styles.theoryPrefix}>{t('boolean.steps.theoryLabel')}:</span>
                        <span>{tx(`boolean.law.${item.id}.theory`, item.theory)}</span>
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
        </>
      )}
    </div>
  );
}
