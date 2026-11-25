import { useMemo, useState } from 'react';

import { CURATED_EXAMPLES } from '../../lib/boolean/examples';
import type {
  AnalysisTabId,
  CuratedExamplePreset,
  GateInputMode,
  SimplifyEffort,
  SimplifyMethod,
  TargetForm,
} from '../../lib/boolean/types';
import { type TranslationKey, useI18n } from '../../lib/ui/i18n';
import styles from '../../styles/Boolean.module.css';
import dStyles from '../../styles/BooleanDiagrams.module.css';
import PillTabs, { type PillTabItem } from '../UI/PillTabs';

type ExampleCategoryFilter = 'all' | CuratedExamplePreset['category'];

export interface LoadExamplePayload {
  readonly equations: readonly string[];
  readonly method?: SimplifyMethod;
  readonly effort?: SimplifyEffort;
  readonly targetForm?: TargetForm;
  readonly gateInputMode?: GateInputMode;
  readonly openTab?: AnalysisTabId;
}

export interface ExamplesTabProps {
  readonly onLoadExample: (payload: LoadExamplePayload) => void;
}

export default function ExamplesTab({ onLoadExample }: ExamplesTabProps) {
  const { t } = useI18n();
  const [category, setCategory] = useState<ExampleCategoryFilter>('all');

  const counts = useMemo(() => {
    const map: Record<ExampleCategoryFilter, number> = {
      all: CURATED_EXAMPLES.length,
      effort: 0,
      methods: 0,
      universal: 0,
      circuits: 0,
      timing: 0,
    };
    for (const ex of CURATED_EXAMPLES) map[ex.category] += 1;
    return map;
  }, []);

  const tabs: readonly PillTabItem<ExampleCategoryFilter>[] = useMemo(
    () => [
      { id: 'all', label: t('boolean.examples.cat.all'), badge: counts.all },
      { id: 'effort', label: t('boolean.examples.cat.effort'), badge: counts.effort },
      { id: 'methods', label: t('boolean.examples.cat.methods'), badge: counts.methods },
      { id: 'universal', label: t('boolean.examples.cat.universal'), badge: counts.universal },
      { id: 'circuits', label: t('boolean.examples.cat.circuits'), badge: counts.circuits },
      { id: 'timing', label: t('boolean.examples.cat.timing'), badge: counts.timing },
    ],
    [t, counts],
  );

  const filtered = useMemo(
    () =>
      category === 'all'
        ? CURATED_EXAMPLES
        : CURATED_EXAMPLES.filter((e) => e.category === category),
    [category],
  );

  return (
    <div className={styles.workspacePanel}>
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <div>
            <h2 className={styles.cardTitle}>{t('boolean.examples.title')}</h2>
            <p className={styles.lead}>{t('boolean.examples.lead')}</p>
          </div>
        </div>
        <PillTabs<ExampleCategoryFilter>
          items={tabs}
          value={category}
          onChange={setCategory}
          ariaLabel={t('boolean.examples.title')}
          size="sm"
        />
      </div>

      <div className={dStyles.examplesGrid}>
        {filtered.map((ex) => {
          const tx = (key: string, fallback: string) => {
            const k = key as TranslationKey;
            const res = t(k);
            return res === k ? fallback : res;
          };
          const title = tx(`boolean.curated.${ex.id}.title`, ex.title);
          const summary = tx(`boolean.curated.${ex.id}.summary`, ex.summary);
          const notice = tx(`boolean.curated.${ex.id}.notice`, ex.whatToNotice);
          const effortLabel = ex.defaultEffort
            ? t(`boolean.opt.effort.${ex.defaultEffort}` as TranslationKey)
            : '';

          return (
            <article key={ex.id} className={dStyles.exampleCard} data-testid={`example-card-${ex.id}`}>
              <div className={styles.identityHead}>
                <h3 className={styles.identityTitle}>{title}</h3>
                <span className={styles.identityMeta}>{t(`boolean.examples.cat.${ex.category}`)}</span>
              </div>

              <div className={dStyles.exampleEqBlock}>
                {ex.equations.map((eq, i) => (
                  <code key={i}>{eq}</code>
                ))}
              </div>

              <p className={styles.identitySummary}>{summary}</p>

              <div className={styles.theoryBox}>
                <span className={styles.theoryPrefix}>{t('boolean.examples.notice')}:</span>
                <span>{notice}</span>
              </div>

              {ex.comparisonNotes && ex.comparisonNotes.length > 0 && (
                <ul className={dStyles.comparisonList}>
                  {ex.comparisonNotes.map((note, idx) => (
                    <li key={idx} className={dStyles.comparisonItem}>
                      <span>
                        <span className={dStyles.comparisonLabel}>
                          {tx(`boolean.curated.${ex.id}.n${idx}.label`, note.label)}:
                        </span>
                        {tx(`boolean.curated.${ex.id}.n${idx}.outcome`, note.outcome)}
                      </span>
                      <button
                        type="button"
                        className={[styles.btn, styles.btnSmall].join(' ')}
                        onClick={() =>
                          onLoadExample({
                            equations: ex.equations,
                            method: note.method ?? ex.defaultMethod,
                            effort: note.effort ?? ex.defaultEffort,
                            targetForm: note.targetForm ?? ex.defaultTargetForm,
                            gateInputMode: note.gateInputMode ?? ex.defaultGateInputMode,
                            openTab: ex.openTab,
                          })
                        }
                      >
                        {t('boolean.examples.tryVariant')}
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              <div className={styles.identityFooter}>
                <span className={styles.metaInline}>
                  {ex.equations.length > 1
                    ? t('boolean.examples.eqMany', { count: ex.equations.length })
                    : t('boolean.examples.eqOne')}
                  {ex.defaultMethod ? ` · ${t(`boolean.opt.method.${ex.defaultMethod}` as TranslationKey)}` : ''}
                  {ex.defaultEffort ? ` · ${t('boolean.examples.effortBadge', { effort: effortLabel })}` : ''}
                </span>
                <button
                  type="button"
                  className={[styles.btnPrimary, styles.btnSmall].join(' ')}
                  onClick={() =>
                    onLoadExample({
                      equations: ex.equations,
                      method: ex.defaultMethod,
                      effort: ex.defaultEffort,
                      targetForm: ex.defaultTargetForm,
                      gateInputMode: ex.defaultGateInputMode,
                      openTab: ex.openTab,
                    })
                  }
                >
                  {t('boolean.examples.load')}
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
