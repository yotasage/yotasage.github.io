import { useEffect, useMemo, useRef, useState } from 'react';

import type { SolutionStep, StepLayoutMode } from '../../lib/calculus/types';
import { useI18n } from '../../lib/ui/i18n';
import { useExperienceMode } from '../../lib/ui/mode';
import styles from '../../styles/Calculus.module.css';
import KatexSpan from '../KatexSpan';

const LAYOUT_STORAGE_KEY = 'calculus.stepLayout';
const AUTO_SPLIT_MIN_WIDTH = 740;

function isStepLayoutMode(val: string | null): val is StepLayoutMode {
  return val === 'auto' || val === 'split' || val === 'interleaved' || val === 'same-side';
}

export interface StepViewerProps {
  readonly steps: readonly SolutionStep[];
  readonly onInspectRule?: (ruleId: string) => void;
}

export default function StepViewer({ steps, onInspectRule }: StepViewerProps) {
  const { t } = useI18n();
  const { mode, setMode } = useExperienceMode();
  const containerRef = useRef<HTMLDivElement>(null);

  const [layoutPref, setLayoutPref] = useState<StepLayoutMode>('auto');
  const [hydrated, setHydrated] = useState(false);
  const [containerWidth, setContainerWidth] = useState<number>(1000);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(LAYOUT_STORAGE_KEY);
      if (isStepLayoutMode(saved)) setLayoutPref(saved);
    } catch {
      // Ignore storage errors
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(LAYOUT_STORAGE_KEY, layoutPref);
    } catch {
      // Ignore storage errors
    }
  }, [layoutPref, hydrated]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const updateWidth = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0) setContainerWidth(rect.width);
    };
    updateWidth();
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver((entries) => {
        for (const entry of entries) {
          if (entry.contentRect.width > 0) {
            setContainerWidth(entry.contentRect.width);
          }
        }
      });
      ro.observe(el);
      return () => ro.disconnect();
    }
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, []);

  const isTeaching = mode === 'teaching';
  const isQuick = mode === 'quick';

  const visibleSteps = useMemo(() => {
    if (!isQuick) return steps;
    const filtered = steps.filter((s) => !s.minor);
    return filtered.length > 0 ? filtered : steps;
  }, [steps, isQuick]);

  const resolvedLayout: 'split' | 'interleaved' | 'same-side' =
    layoutPref === 'auto'
      ? containerWidth >= AUTO_SPLIT_MIN_WIDTH
        ? 'split'
        : 'interleaved'
      : layoutPref;

  const layoutOptions: readonly { id: StepLayoutMode; label: string }[] = [
    { id: 'auto', label: t('calculus.steps.layout.auto') },
    { id: 'split', label: t('calculus.steps.layout.split') },
    { id: 'interleaved', label: t('calculus.steps.layout.interleaved') },
    { id: 'same-side', label: t('calculus.steps.layout.sameSide') },
  ];

  const autoStatusLabel =
    layoutPref === 'auto'
      ? resolvedLayout === 'split'
        ? t('calculus.steps.autoResolvedSplit')
        : t('calculus.steps.autoResolvedInterleaved')
      : null;

  return (
    <section
      ref={containerRef}
      className={styles.stepsCard}
      aria-label={t('calculus.steps.title')}
      data-step-layout={resolvedLayout}
      data-step-pref={layoutPref}
    >
      <div className={styles.stepsToolbar}>
        <div className={styles.stepsTitleGroup}>
          <h2 className={styles.cardTitle}>{t('calculus.steps.title')}</h2>
          <span className={styles.metaInline}>
            <span>{t('calculus.steps.count', { count: visibleSteps.length })}</span>
            {autoStatusLabel && (
              <>
                <span className={styles.metaDot} aria-hidden="true">
                  ·
                </span>
                <span>{autoStatusLabel}</span>
              </>
            )}
            {isQuick && (
              <>
                <span className={styles.metaDot} aria-hidden="true">
                  ·
                </span>
                <span>{t('calculus.steps.quickNote')}</span>
              </>
            )}
          </span>
        </div>

        <div className={styles.stepsControls}>
          <div className={styles.segmented} role="group" aria-label={t('calculus.steps.layoutLabel')}>
            {layoutOptions.map((opt) => {
              const active = layoutPref === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  aria-pressed={active}
                  className={[styles.segBtn, active ? styles.segBtnActive : ''].filter(Boolean).join(' ')}
                  onClick={() => setLayoutPref(opt.id)}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            aria-pressed={isTeaching}
            aria-label={t('calculus.steps.theoryToggleAria')}
            className={[styles.btn, styles.btnSmall, isTeaching ? styles.btnActiveSoft : '']
              .filter(Boolean)
              .join(' ')}
            onClick={() => setMode(isTeaching ? 'standard' : 'teaching')}
          >
            {isTeaching ? t('calculus.steps.theoryOn') : t('calculus.steps.theoryOff')}
          </button>
        </div>
      </div>

      {resolvedLayout === 'split' && (
        <div className={styles.splitTable}>
          <div className={styles.splitHeader} role="row">
            <div className={styles.splitHeaderCell}>{t('calculus.steps.colWork')}</div>
            <div className={styles.splitHeaderCellRight}>
              {isTeaching ? t('calculus.steps.colRulesTeaching') : t('calculus.steps.colRules')}
            </div>
          </div>

          <ol className={styles.splitList}>
            {visibleSteps.map((step, idx) => (
              <li
                key={step.id}
                className={[styles.splitRow, step.kind === 'result' ? styles.splitRowResult : '']
                  .filter(Boolean)
                  .join(' ')}
              >
                <div className={styles.splitLeft}>
                  <span className={styles.stepNum}>{idx + 1}.</span>
                  <div className={styles.workContent}>
                    {step.workLabel && <span className={styles.workTag}>{step.workLabel}</span>}
                    <div className={styles.workMath}>
                      <KatexSpan text={step.workLatex} />
                    </div>
                  </div>
                </div>

                <div className={styles.splitRight}>
                  <div className={styles.ruleHead}>
                    <span className={styles.ruleTitle}>{step.ruleTitle}</span>
                    {step.ruleId && onInspectRule && (
                      <button
                        type="button"
                        className={styles.ruleJumpBtn}
                        onClick={() => onInspectRule(step.ruleId!)}
                      >
                        {t('calculus.steps.viewRule')}
                      </button>
                    )}
                  </div>

                  {step.ruleFormulaLatex && (
                    <div className={styles.ruleFormula}>
                      <KatexSpan text={step.ruleFormulaLatex} />
                    </div>
                  )}

                  {step.annotation && <p className={styles.ruleAnnotation}>{step.annotation}</p>}

                  {isTeaching && step.theory && (
                    <div className={styles.theoryBox} data-theory-block="true">
                      <span className={styles.theoryPrefix}>{t('calculus.steps.theoryLabel')}:</span>
                      <span>{step.theory}</span>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}

      {resolvedLayout === 'interleaved' && (
        <ol className={styles.interleavedList}>
          {visibleSteps.map((step, idx) => (
            <li
              key={step.id}
              className={[
                styles.interleavedItem,
                step.kind === 'result' ? styles.interleavedItemResult : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <div className={styles.interleavedRuleBand}>
                <div className={styles.interleavedRuleTop}>
                  <div className={styles.interleavedRuleLeft}>
                    <span className={styles.stepNum}>{idx + 1}.</span>
                    <span className={styles.ruleTitle}>{step.ruleTitle}</span>
                    {step.workLabel && <span className={styles.workTag}>{step.workLabel}</span>}
                  </div>
                  {step.ruleId && onInspectRule && (
                    <button
                      type="button"
                      className={styles.ruleJumpBtn}
                      onClick={() => onInspectRule(step.ruleId!)}
                    >
                      {t('calculus.steps.viewRule')}
                    </button>
                  )}
                </div>

                {step.ruleFormulaLatex && (
                  <div className={styles.ruleFormula}>
                    <KatexSpan text={step.ruleFormulaLatex} />
                  </div>
                )}

                {step.annotation && <p className={styles.ruleAnnotation}>{step.annotation}</p>}

                {isTeaching && step.theory && (
                  <div className={styles.theoryBox} data-theory-block="true">
                    <span className={styles.theoryPrefix}>{t('calculus.steps.theoryLabel')}:</span>
                    <span>{step.theory}</span>
                  </div>
                )}
              </div>

              <div className={styles.interleavedWorkBand}>
                <div className={styles.workMath}>
                  <KatexSpan text={step.workLatex} />
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}

      {resolvedLayout === 'same-side' && (
        <ol className={styles.sameSideList}>
          {visibleSteps.map((step, idx) => (
            <li
              key={step.id}
              className={[
                styles.sameSideStep,
                step.kind === 'result' ? styles.sameSideStepResult : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <div className={styles.sameSideWorkLine}>
                <span className={styles.stepNum}>{idx + 1}.</span>
                <div className={styles.workContent}>
                  {step.workLabel && <span className={styles.workTag}>{step.workLabel}</span>}
                  <div className={styles.workMath}>
                    <KatexSpan text={step.workLatex} />
                  </div>
                </div>
              </div>

              <div className={styles.sameSideRuleLine}>
                <span className={styles.sameSideRuleName}>{step.ruleTitle}</span>
                {step.ruleFormulaLatex && (
                  <span className={styles.ruleFormula}>
                    <KatexSpan text={step.ruleFormulaLatex} />
                  </span>
                )}
                {step.annotation && <span>{step.annotation}</span>}
                {step.ruleId && onInspectRule && (
                  <button
                    type="button"
                    className={styles.ruleJumpBtn}
                    onClick={() => onInspectRule(step.ruleId!)}
                  >
                    {t('calculus.steps.viewRule')}
                  </button>
                )}
              </div>

              {isTeaching && step.theory && (
                <div className={styles.sameSideTheoryLine} data-theory-block="true">
                  <span className={styles.theoryPrefix}>{t('calculus.steps.theoryLabel')}:</span>
                  <span>{step.theory}</span>
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
