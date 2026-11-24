import { useEffect, useMemo, useRef, useState } from 'react';

import type { BooleanStep, StepLayoutMode } from '../../lib/boolean/types';
import { useI18n } from '../../lib/ui/i18n';
import { useExperienceMode } from '../../lib/ui/mode';
import styles from '../../styles/Boolean.module.css';
import KatexSpan from '../KatexSpan';

const LAYOUT_STORAGE_KEY = 'boolean.stepLayout';
const AUTO_SPLIT_MIN_WIDTH = 740;

function isStepLayoutMode(val: string | null): val is StepLayoutMode {
  return val === 'auto' || val === 'split' || val === 'interleaved' || val === 'same-side';
}

export interface BooleanStepViewerProps {
  readonly steps: readonly BooleanStep[];
  readonly equationTitle?: string;
  readonly inspectedStepIndex: number | null;
  readonly onInspectStep: (index: number | null) => void;
  readonly onInspectLaw: (lawId: string) => void;
}

export default function BooleanStepViewer({
  steps,
  equationTitle,
  inspectedStepIndex,
  onInspectStep,
  onInspectLaw,
}: BooleanStepViewerProps) {
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
          if (entry.contentRect.width > 0) setContainerWidth(entry.contentRect.width);
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

  const visibleEntries = useMemo(() => {
    const mapped = steps.map((step, originalIndex) => ({ step, originalIndex }));
    if (!isQuick) return mapped;
    const filtered = mapped.filter((e) => !e.step.minor);
    return filtered.length > 0 ? filtered : mapped;
  }, [steps, isQuick]);

  const resolvedLayout: 'split' | 'interleaved' | 'same-side' = isQuick
    ? 'same-side'
    : layoutPref === 'auto'
      ? containerWidth >= AUTO_SPLIT_MIN_WIDTH
        ? 'split'
        : 'interleaved'
      : layoutPref;

  const layoutOptions: readonly { id: StepLayoutMode; label: string }[] = [
    { id: 'auto', label: t('boolean.steps.layout.auto') },
    { id: 'split', label: t('boolean.steps.layout.split') },
    { id: 'interleaved', label: t('boolean.steps.layout.interleaved') },
    { id: 'same-side', label: t('boolean.steps.layout.sameSide') },
  ];

  const autoStatusLabel =
    !isQuick && layoutPref === 'auto'
      ? resolvedLayout === 'split'
        ? t('boolean.steps.autoSplit')
        : t('boolean.steps.autoInterleaved')
      : null;

  const renderInspectButton = (originalIndex: number, stepNum: number, isFinal: boolean) => {
    const isInspected =
      inspectedStepIndex === originalIndex || (inspectedStepIndex === null && isFinal);
    const isIntermediateActive = inspectedStepIndex === originalIndex;
    return (
      <button
        type="button"
        aria-pressed={isInspected}
        className={[
          styles.btn,
          styles.btnSmall,
          isIntermediateActive ? styles.btnActiveSoft : '',
        ]
          .filter(Boolean)
          .join(' ')}
        onClick={() => onInspectStep(isFinal ? null : isIntermediateActive ? null : originalIndex)}
        aria-label={`${t('boolean.steps.inspectStep')} ${stepNum}`}
      >
        {isIntermediateActive ? t('boolean.steps.inspecting') : t('boolean.steps.inspectStep')}
      </button>
    );
  };

  return (
    <section
      ref={containerRef}
      className={styles.stepsCard}
      aria-label={t('boolean.steps.title')}
      data-step-layout={resolvedLayout}
    >
      <div className={styles.stepsToolbar}>
        <div className={styles.stepsTitleGroup}>
          <h2 className={styles.cardTitle}>
            {t('boolean.steps.title')}
            {equationTitle ? ` — ${equationTitle}` : ''}
          </h2>
          <span className={styles.metaInline}>
            <span>{t('boolean.steps.count', { count: visibleEntries.length })}</span>
            {autoStatusLabel && (
              <>
                <span className={styles.metaDot} aria-hidden="true">
                  ·
                </span>
                <span>{autoStatusLabel}</span>
              </>
            )}
          </span>
        </div>

        {!isQuick && (
          <div className={styles.stepsControls}>
            <div className={styles.segmented} role="group" aria-label={t('boolean.steps.layoutLabel')}>
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
              className={[styles.btn, styles.btnSmall, isTeaching ? styles.btnActiveSoft : '']
                .filter(Boolean)
                .join(' ')}
              onClick={() => setMode(isTeaching ? 'standard' : 'teaching')}
            >
              {isTeaching ? t('boolean.steps.theoryOn') : t('boolean.steps.theoryOff')}
            </button>
          </div>
        )}
      </div>

      {resolvedLayout === 'split' && (
        <div className={styles.splitTable}>
          <div className={styles.splitHeader} role="row">
            <div className={styles.splitHeaderCell}>{t('boolean.steps.colWork')}</div>
            <div className={styles.splitHeaderCellRight}>
              {isTeaching ? t('boolean.steps.colRulesTeaching') : t('boolean.steps.colRules')}
            </div>
          </div>

          <ol className={styles.splitList}>
            {visibleEntries.map(({ step, originalIndex }, idx) => {
              const isFinal = step.kind === 'result';
              const isSelected = inspectedStepIndex === originalIndex;
              return (
                <li
                  key={step.id}
                  className={[
                    styles.splitRow,
                    isFinal ? styles.splitRowResult : '',
                    isSelected ? styles.stepRowSelected : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  <div className={styles.splitLeft}>
                    <span className={styles.stepNum}>{idx + 1}.</span>
                    <div className={styles.workContent}>
                      <div className={styles.workMetaLine}>
                        <span className={styles.metaInline}>
                          {step.workLabel && <span className={styles.workTag}>{step.workLabel}</span>}
                          <span>
                            {step.gateCount} gates · {step.literalCount} literals
                          </span>
                        </span>
                        {renderInspectButton(originalIndex, idx + 1, isFinal)}
                      </div>
                      <div className={styles.workMath}>
                        <KatexSpan text={step.workLatex} />
                      </div>
                    </div>
                  </div>

                  <div className={styles.splitRight}>
                    <div className={styles.ruleHead}>
                      <span className={styles.ruleTitle}>{step.ruleTitle}</span>
                      {step.ruleId && (
                        <button
                          type="button"
                          className={styles.ruleJumpBtn}
                          onClick={() => onInspectLaw(step.ruleId!)}
                        >
                          {t('boolean.steps.viewLaw')}
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
                        <span className={styles.theoryPrefix}>{t('boolean.steps.theoryLabel')}:</span>
                        <span>{step.theory}</span>
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      )}

      {resolvedLayout === 'interleaved' && (
        <ol className={styles.interleavedList}>
          {visibleEntries.map(({ step, originalIndex }, idx) => {
            const isFinal = step.kind === 'result';
            const isSelected = inspectedStepIndex === originalIndex;
            return (
              <li
                key={step.id}
                className={[styles.interleavedItem, isSelected ? styles.stepRowSelected : '']
                  .filter(Boolean)
                  .join(' ')}
              >
                <div className={styles.interleavedRuleBand}>
                  <div className={styles.ruleHead}>
                    <span className={styles.metaInline}>
                      <span className={styles.stepNum}>{idx + 1}.</span>
                      <span className={styles.ruleTitle}>{step.ruleTitle}</span>
                      {step.workLabel && <span className={styles.workTag}>{step.workLabel}</span>}
                    </span>
                    <div className={styles.btnRow}>
                      {step.ruleId && (
                        <button
                          type="button"
                          className={styles.ruleJumpBtn}
                          onClick={() => onInspectLaw(step.ruleId!)}
                        >
                          {t('boolean.steps.viewLaw')}
                        </button>
                      )}
                      {renderInspectButton(originalIndex, idx + 1, isFinal)}
                    </div>
                  </div>
                  {step.ruleFormulaLatex && (
                    <div className={styles.ruleFormula}>
                      <KatexSpan text={step.ruleFormulaLatex} />
                    </div>
                  )}
                  {step.annotation && <p className={styles.ruleAnnotation}>{step.annotation}</p>}
                  {isTeaching && step.theory && (
                    <div className={styles.theoryBox}>
                      <span className={styles.theoryPrefix}>{t('boolean.steps.theoryLabel')}:</span>
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
            );
          })}
        </ol>
      )}

      {resolvedLayout === 'same-side' && (
        <ol className={styles.sameSideList}>
          {visibleEntries.map(({ step, originalIndex }, idx) => {
            const isFinal = step.kind === 'result';
            const isSelected = inspectedStepIndex === originalIndex;
            return (
              <li
                key={step.id}
                className={[
                  styles.sameSideStep,
                  isFinal ? styles.splitRowResult : '',
                  isSelected ? styles.stepRowSelected : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                <div className={styles.sameSideWorkLine}>
                  <span className={styles.stepNum}>{idx + 1}.</span>
                  <div className={styles.workContent}>
                    <div className={styles.workMetaLine}>
                      <div className={styles.workMath}>
                        <KatexSpan text={step.workLatex} />
                      </div>
                      {renderInspectButton(originalIndex, idx + 1, isFinal)}
                    </div>
                  </div>
                </div>
                <div className={styles.sameSideRuleLine}>
                  <span className={styles.sameSideRuleName}>{step.ruleTitle}</span>
                  {step.ruleFormulaLatex && <KatexSpan text={step.ruleFormulaLatex} />}
                  {step.annotation && <span>{step.annotation}</span>}
                  {step.ruleId && (
                    <button
                      type="button"
                      className={styles.ruleJumpBtn}
                      onClick={() => onInspectLaw(step.ruleId!)}
                    >
                      {t('boolean.steps.viewLaw')}
                    </button>
                  )}
                </div>
                {isTeaching && step.theory && (
                  <div className={styles.theoryBox}>
                    <span className={styles.theoryPrefix}>{t('boolean.steps.theoryLabel')}:</span>
                    <span>{step.theory}</span>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
