import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import { MATH_IDENTITIES } from '../../lib/calculus/identities';
import type { IdentityCategory, MathIdentity } from '../../lib/calculus/types';
import { type TranslationKey, useI18n } from '../../lib/ui/i18n';
import { useExperienceMode } from '../../lib/ui/mode';
import styles from '../../styles/Calculus.module.css';
import KatexSpan from '../KatexSpan';
import PillTabs, { type PillTabItem } from '../UI/PillTabs';

type CategoryFilter = 'all' | IdentityCategory;

export interface IdentitiesTabProps {
  readonly activeSolver: 'derivative' | 'integral';
  readonly highlightedRuleId?: string | null;
  readonly onTryExample: (expr: string) => void;
}

export default function IdentitiesTab({
  activeSolver,
  highlightedRuleId,
  onTryExample,
}: IdentitiesTabProps) {
  const { t } = useI18n();
  const { mode } = useExperienceMode();
  const isTeaching = mode === 'teaching';

  const [category, setCategory] = useState<CategoryFilter>(
    activeSolver === 'integral' ? 'integrals' : 'derivatives',
  );
  const [query, setQuery] = useState('');

  // When jumping from a specific step's rule link, ensure that rule is visible and scrolled into view
  useEffect(() => {
    if (!highlightedRuleId) return;
    const match = MATH_IDENTITIES.find((item) => item.id === highlightedRuleId);
    if (match) {
      setCategory(match.category);
      setQuery('');
      const timer = window.setTimeout(() => {
        const el = document.getElementById(`identity-${highlightedRuleId}`);
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 40);
      return () => window.clearTimeout(timer);
    }
  }, [highlightedRuleId]);

  const counts = useMemo(() => {
    const map: Record<CategoryFilter, number> = {
      all: MATH_IDENTITIES.length,
      derivatives: 0,
      integrals: 0,
      trig: 0,
      hyperbolic: 0,
      algebra: 0,
    };
    for (const item of MATH_IDENTITIES) {
      map[item.category] += 1;
    }
    return map;
  }, []);

  const categoryTabs: readonly PillTabItem<CategoryFilter>[] = useMemo(
    () => [
      { id: 'all', label: t('calculus.identities.cat.all'), badge: counts.all },
      { id: 'derivatives', label: t('calculus.identities.cat.derivatives'), badge: counts.derivatives },
      { id: 'integrals', label: t('calculus.identities.cat.integrals'), badge: counts.integrals },
      { id: 'trig', label: t('calculus.identities.cat.trig'), badge: counts.trig },
      { id: 'hyperbolic', label: t('calculus.identities.cat.hyperbolic'), badge: counts.hyperbolic },
      { id: 'algebra', label: t('calculus.identities.cat.algebra'), badge: counts.algebra },
    ],
    [t, counts],
  );

  const normalizedQuery = query.trim().toLowerCase();

  const localizeIdentity = (item: MathIdentity) => {
    const nameKey = `calculus.id.${item.id}.name` as TranslationKey;
    const summaryKey = `calculus.id.${item.id}.summary` as TranslationKey;
    const theoryKey = `calculus.id.${item.id}.theory` as TranslationKey;
    const condKey = `calculus.id.${item.id}.condition` as TranslationKey;
    const trName = t(nameKey);
    const trSummary = t(summaryKey);
    const trTheory = t(theoryKey);
    const trCond = item.condition ? t(condKey) : undefined;
    return {
      name: trName === nameKey ? item.name : trName,
      summary: trSummary === summaryKey ? item.summary : trSummary,
      theory: trTheory === theoryKey ? item.theory : trTheory,
      condition: item.condition
        ? trCond && trCond !== condKey
          ? trCond
          : item.condition
        : undefined,
    };
  };

  const filtered = useMemo(() => {
    return MATH_IDENTITIES.filter((item) => {
      if (category !== 'all' && item.category !== category) return false;
      if (!normalizedQuery) return true;
      const loc = localizeIdentity(item);
      const hay = [
        loc.name,
        loc.summary,
        loc.theory,
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

  const categoryLabel = (cat: IdentityCategory): string => {
    switch (cat) {
      case 'derivatives':
        return t('calculus.identities.cat.derivatives');
      case 'integrals':
        return t('calculus.identities.cat.integrals');
      case 'trig':
        return t('calculus.identities.cat.trig');
      case 'hyperbolic':
        return t('calculus.identities.cat.hyperbolic');
      case 'algebra':
        return t('calculus.identities.cat.algebra');
    }
  };

  const renderTryAction = (item: MathIdentity) => {
    const sameSolver = item.exampleSolver === activeSolver;
    if (sameSolver) {
      return (
        <button
          type="button"
          className={[styles.btn, styles.btnSmall].join(' ')}
          onClick={() => onTryExample(item.exampleExpr)}
        >
          {t('calculus.identities.tryExample')}
        </button>
      );
    }
    const targetHref =
      item.exampleSolver === 'derivative'
        ? `/derivative/main?expr=${encodeURIComponent(item.exampleExpr)}`
        : `/integral/main?expr=${encodeURIComponent(item.exampleExpr)}`;
    return (
      <Link href={targetHref} className={[styles.btn, styles.btnSmall].join(' ')}>
        {item.exampleSolver === 'derivative'
          ? t('calculus.identities.openDerivative')
          : t('calculus.identities.openIntegral')}
      </Link>
    );
  };

  return (
    <div className={styles.workspacePanel}>
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <div>
            <h2 className={styles.cardTitle}>{t('calculus.identities.title')}</h2>
            <p className={styles.lead}>{t('calculus.identities.lead')}</p>
          </div>
          <span className={styles.metaInline}>
            {t('calculus.identities.count', { count: filtered.length })}
          </span>
        </div>

        <div className={styles.identitiesControls}>
          <PillTabs<CategoryFilter>
            items={categoryTabs}
            value={category}
            onChange={setCategory}
            ariaLabel={t('calculus.identities.title')}
            size="sm"
          />

          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('calculus.identities.searchPlaceholder')}
            aria-label={t('calculus.identities.searchAria')}
            className={styles.searchInput}
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className={styles.emptyState} role="status">
          <p>{t('calculus.identities.empty', { query: query.trim() })}</p>
          <button
            type="button"
            className={styles.btn}
            onClick={() => {
              setCategory('all');
              setQuery('');
            }}
          >
            {t('calculus.identities.reset')}
          </button>
        </div>
      ) : (
        <ul className={styles.identitiesGrid}>
          {filtered.map((item) => {
            const isHighlighted = highlightedRuleId === item.id;
            const loc = localizeIdentity(item);
            return (
              <li
                key={item.id}
                id={`identity-${item.id}`}
                className={[
                  styles.identityCard,
                  isHighlighted ? styles.identityCardHighlight : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                <div className={styles.identityHead}>
                  <h3 className={styles.identityTitle}>{loc.name}</h3>
                  <span className={styles.identityMeta}>
                    {categoryLabel(item.category)}
                    {loc.condition ? ` · ${loc.condition}` : ''}
                  </span>
                </div>

                <div className={styles.identityFormula}>
                  <KatexSpan text={item.formulaLatex} />
                </div>

                <p className={styles.identitySummary}>{loc.summary}</p>

                {isTeaching && (
                  <div className={styles.theoryBox}>
                    <span className={styles.theoryPrefix}>{t('calculus.steps.theoryLabel')}:</span>
                    <span>{loc.theory}</span>
                  </div>
                )}

                <div className={styles.identityFooter}>
                  <code className={styles.identityExampleCode}>{item.exampleExpr}</code>
                  {renderTryAction(item)}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
