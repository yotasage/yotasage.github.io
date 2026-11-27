import { useMemo, useRef, useState } from 'react';

import {
  checkDerivationChain,
  formatCounterexampleText,
  type CompareSource,
  type CompareTruthTableSource,
  type DerivationStepCheck,
} from '../../lib/boolean/compare';
import { parseBoolean, toLatex } from '../../lib/boolean/parse';
import type { NotationStyle } from '../../lib/boolean/types';
import { useI18n } from '../../lib/ui/i18n';
import styles from '../../styles/Boolean.module.css';
import cStyles from '../../styles/BooleanCompare.module.css';
import KatexSpan from '../KatexSpan';
import CompareResultsPanel from './CompareResultsPanel';
import CompareTruthTableEditor from './CompareTruthTableEditor';

const QUICK_OPS: readonly { label: string; snippet: string; cursorOffset?: number }[] = [
  { label: 'AND (·)', snippet: ' * ' },
  { label: 'OR (+)', snippet: ' + ' },
  { label: "NOT (')", snippet: "'" },
  { label: '¬()', snippet: '!()', cursorOffset: -1 },
  { label: 'XOR (⊕)', snippet: ' ^ ' },
  { label: 'XNOR', snippet: ' XNOR ' },
  { label: 'NAND', snippet: ' NAND ' },
  { label: 'NOR', snippet: ' NOR ' },
  { label: '( )', snippet: '()', cursorOffset: -1 },
];

export interface DerivationCheckerViewProps {
  readonly startMode: 'expression' | 'truth-table';
  readonly onStartModeChange: (next: 'expression' | 'truth-table') => void;
  readonly startExpr: string;
  readonly onStartExprChange: (next: string) => void;
  readonly startTable: CompareTruthTableSource;
  readonly onStartTableChange: (next: CompareTruthTableSource) => void;
  readonly steps: readonly string[];
  readonly onStepsChange: (next: string[]) => void;
  readonly notation: NotationStyle;
  readonly explicitAnd: boolean;
  readonly onOpenInSimplifier?: (expr: string) => void;
}

export default function DerivationCheckerView({
  startMode,
  onStartModeChange,
  startExpr,
  onStartExprChange,
  startTable,
  onStartTableChange,
  steps,
  onStepsChange,
  notation,
  explicitAnd,
  onOpenInSimplifier,
}: DerivationCheckerViewProps) {
  const { t } = useI18n();
  const [selectedStepIdx, setSelectedStepIdx] = useState<number | null>(null);
  const [compareRefMode, setCompareRefMode] = useState<'prev' | 'start'>('prev');
  const [showPasteBox, setShowPasteBox] = useState(false);
  const [pasteDraft, setPasteDraft] = useState('');
  const [focusedField, setFocusedField] = useState<'start' | number>('start');

  const startInputRef = useRef<HTMLInputElement | null>(null);
  const stepInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const initialSource: CompareSource = useMemo(
    () =>
      startMode === 'expression'
        ? { kind: 'expression', expr: startExpr, label: t('boolean.compare.chain.startName') }
        : { ...startTable, label: t('boolean.compare.chain.startName') },
    [startMode, startExpr, startTable, t],
  );

  const chainResult = useMemo(
    () => checkDerivationChain(initialSource, steps, { notation, explicitAnd }),
    [initialSource, steps, notation, explicitAnd],
  );

  const startPreview = useMemo(() => {
    if (startMode !== 'expression') return null;
    const trimmed = startExpr.trim();
    if (!trimmed) return { ok: true as const, latex: '' };
    try {
      const p = parseBoolean(trimmed);
      return { ok: true as const, latex: toLatex(p.ast, notation, explicitAnd) };
    } catch (err) {
      return {
        ok: false as const,
        error: err instanceof Error ? err.message : t('boolean.input.invalidSyntax'),
      };
    }
  }, [startMode, startExpr, notation, explicitAnd, t]);

  // Determine which step is inspected in the detail panel below
  const effectiveSelectedIdx = useMemo(() => {
    if (
      selectedStepIdx !== null &&
      selectedStepIdx >= 0 &&
      selectedStepIdx < chainResult.steps.length
    ) {
      const s = chainResult.steps[selectedStepIdx];
      if (s && s.vsPrev && s.vsOriginal) return selectedStepIdx;
    }
    if (chainResult.firstErrorIndex !== null) {
      const s = chainResult.steps[chainResult.firstErrorIndex];
      if (s && s.vsPrev && s.vsOriginal) return chainResult.firstErrorIndex;
    }
    return null;
  }, [selectedStepIdx, chainResult]);

  const inspectedStep: DerivationStepCheck | null =
    effectiveSelectedIdx !== null ? (chainResult.steps[effectiveSelectedIdx] ?? null) : null;

  const insertSnippet = (snippet: string, cursorOffset = 0) => {
    if (focusedField === 'start' && startMode === 'expression') {
      const el = startInputRef.current;
      const cur = startExpr;
      const s = el?.selectionStart ?? cur.length;
      const e = el?.selectionEnd ?? cur.length;
      const next = `${cur.slice(0, s)}${snippet}${cur.slice(e)}`;
      onStartExprChange(next);
      const caret = s + snippet.length + cursorOffset;
      window.requestAnimationFrame(() => {
        el?.focus();
        el?.setSelectionRange(caret, caret);
      });
      return;
    }
    const idx = typeof focusedField === 'number' ? focusedField : steps.length - 1;
    if (idx < 0 || idx >= steps.length) return;
    const el = stepInputRefs.current[idx];
    const cur = steps[idx] ?? '';
    const s = el?.selectionStart ?? cur.length;
    const e = el?.selectionEnd ?? cur.length;
    const nextVal = `${cur.slice(0, s)}${snippet}${cur.slice(e)}`;
    onStepsChange(steps.map((st, i) => (i === idx ? nextVal : st)));
    const caret = s + snippet.length + cursorOffset;
    window.requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(caret, caret);
    });
  };

  const handleStepChange = (idx: number, val: string) => {
    onStepsChange(steps.map((st, i) => (i === idx ? val : st)));
  };

  const handleAddStep = (focusNew = true) => {
    const nextIdx = steps.length;
    onStepsChange([...steps, '']);
    if (focusNew) {
      setFocusedField(nextIdx);
      window.requestAnimationFrame(() => {
        stepInputRefs.current[nextIdx]?.focus();
      });
    }
  };

  const handleRemoveStep = (idx: number) => {
    if (steps.length <= 1) {
      onStepsChange(['']);
      return;
    }
    onStepsChange(steps.filter((_, i) => i !== idx));
    if (selectedStepIdx === idx) setSelectedStepIdx(null);
  };

  const handleApplyPaste = () => {
    const lines = pasteDraft
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length > 0) {
      onStepsChange(lines);
      setSelectedStepIdx(null);
    }
    setShowPasteBox(false);
    setPasteDraft('');
  };

  const stepLabel = (prevStepIndex: number | null) =>
    prevStepIndex === null
      ? t('boolean.compare.chain.startName')
      : t('boolean.compare.chain.stepName', { num: prevStepIndex + 1 });

  const renderStatusBadge = (step: DerivationStepCheck) => {
    switch (step.status) {
      case 'valid':
        return <span className={cStyles.chainBadgeOk}>✓ {t('boolean.compare.chain.status.valid')}</span>;
      case 'first-error':
        return (
          <span className={cStyles.chainBadgeErr}>
            ✕ {t('boolean.compare.chain.status.firstError')}
          </span>
        );
      case 'step-error':
        return (
          <span className={cStyles.chainBadgeErr}>
            ✕ {t('boolean.compare.chain.status.stepError')}
          </span>
        );
      case 'cascaded':
        return (
          <span className={cStyles.chainBadgeWarn}>
            ⚠ {t('boolean.compare.chain.status.cascaded')}
          </span>
        );
      case 'recovered':
        return (
          <span className={cStyles.chainBadgeOk}>
            ✓ {t('boolean.compare.chain.status.recovered')}
          </span>
        );
      case 'syntax-error':
        return (
          <span className={cStyles.chainBadgeErr}>
            ✕ {t('boolean.compare.chain.status.syntaxError')}
          </span>
        );
      case 'empty':
        return <span className={styles.metaInline}>{t('boolean.compare.chain.status.empty')}</span>;
    }
  };

  const firstErrStep =
    chainResult.firstErrorIndex !== null
      ? chainResult.steps[chainResult.firstErrorIndex]
      : null;

  return (
    <div className={cStyles.compareRoot}>
      {/* Starting Expression / Truth Table Card */}
      <section className={styles.card}>
        <div className={cStyles.sideHeader} style={{ marginBottom: '0.7rem' }}>
          <div className={cStyles.sideTitleRow}>
            <span className={[cStyles.sideTag, cStyles.sideTagA].join(' ')}>0</span>
            <h2 className={cStyles.sideTitle}>{t('boolean.compare.chain.startLabel')}</h2>
          </div>

          <div
            className={styles.segmented}
            role="group"
            aria-label={t('boolean.compare.chain.startLabel')}
          >
            <button
              type="button"
              aria-pressed={startMode === 'expression'}
              className={[
                styles.segBtn,
                startMode === 'expression' ? styles.segBtnActive : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => onStartModeChange('expression')}
              data-testid="chain-start-mode-expr"
            >
              {t('boolean.compare.sourceType.expression')}
            </button>
            <button
              type="button"
              aria-pressed={startMode === 'truth-table'}
              className={[
                styles.segBtn,
                startMode === 'truth-table' ? styles.segBtnActive : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => onStartModeChange('truth-table')}
              data-testid="chain-start-mode-tt"
            >
              {t('boolean.compare.sourceType.truthTable')}
            </button>
          </div>
        </div>

        {startMode === 'expression' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            <input
              ref={startInputRef}
              type="text"
              value={startExpr}
              onFocus={() => setFocusedField('start')}
              onChange={(e) => onStartExprChange(e.target.value)}
              placeholder={t('boolean.compare.placeholderA')}
              className={[styles.exprInput, cStyles.compareExprInput].join(' ')}
              aria-label={t('boolean.compare.chain.startLabel')}
              autoComplete="off"
              spellCheck={false}
              data-testid="chain-start-input"
            />
            {startPreview && (
              <div className={styles.previewBar}>
                {!startPreview.ok ? (
                  <span className={styles.previewErr}>{startPreview.error}</span>
                ) : startPreview.latex ? (
                  <div className={styles.previewMath}>
                    <KatexSpan text={startPreview.latex} />
                  </div>
                ) : (
                  <span className={styles.previewCaption}>{t('boolean.compare.placeholderA')}</span>
                )}
                {chainResult.initialSummary?.metrics && (
                  <span className={styles.metaInline}>
                    {t('boolean.steps.metaCounts', {
                      gates: chainResult.initialSummary.metrics.gates,
                      literals: chainResult.initialSummary.metrics.literals,
                    })}
                  </span>
                )}
              </div>
            )}
          </div>
        ) : (
          <CompareTruthTableEditor
            sideId="start"
            value={startTable}
            onChange={onStartTableChange}
          />
        )}
      </section>

      {/* Summary Banner */}
      {!chainResult.ok && chainResult.initialError ? (
        <section className={[styles.resultCard, styles.resultCardError].join(' ')} role="alert">
          <p className={styles.errorMsg}>{chainResult.initialError}</p>
        </section>
      ) : chainResult.checkedStepCount === 0 ? (
        <section className={styles.card}>
          <p className={styles.metaInline}>{t('boolean.compare.chain.summaryEmpty')}</p>
        </section>
      ) : (
        <section
          className={[
            cStyles.verdictCard,
            chainResult.allValid ? cStyles.verdictEquivalent : cStyles.verdictMismatch,
          ].join(' ')}
          role="status"
          aria-live="polite"
          data-testid="chain-verdict"
          data-all-valid={chainResult.allValid ? 'true' : 'false'}
        >
          <div className={cStyles.verdictTop}>
            <div className={cStyles.verdictLeadBlock}>
              <span
                className={[
                  cStyles.verdictIcon,
                  chainResult.allValid ? cStyles.verdictIconOk : cStyles.verdictIconBad,
                ].join(' ')}
                aria-hidden="true"
              >
                {chainResult.allValid ? '✓' : '✕'}
              </span>
              <div style={{ minWidth: 0 }}>
                <h2 className={cStyles.verdictHeading}>
                  {chainResult.allValid
                    ? t('boolean.compare.chain.summaryAllValid', {
                        count: chainResult.checkedStepCount,
                      })
                    : firstErrStep?.status === 'syntax-error'
                      ? t('boolean.compare.chain.summarySyntax', {
                          step: firstErrStep.index + 1,
                        })
                      : firstErrStep?.vsPrev
                        ? t('boolean.compare.chain.summaryFirstError', {
                            step: firstErrStep.index + 1,
                            mismatches: firstErrStep.vsPrev.mismatchCount,
                            checked: firstErrStep.vsPrev.checkedRows,
                            prevLabel: stepLabel(firstErrStep.prevStepIndex),
                          })
                        : t('boolean.compare.verdict.notEquivalent')}
                </h2>
                {firstErrStep?.vsPrev?.firstCounterexample && (
                  <p className={cStyles.verdictExplain}>
                    {t('boolean.compare.diag.counterexample')}:{' '}
                    <code className={styles.monoCode}>
                      {formatCounterexampleText(
                        firstErrStep.vsPrev.firstCounterexample,
                        firstErrStep.vsPrev.variables,
                      )}
                    </code>{' '}
                    —{' '}
                    {t('boolean.compare.diag.counterexampleDetail', {
                      labelA: stepLabel(firstErrStep.prevStepIndex),
                      labelB: stepLabel(firstErrStep.index),
                      valA: String(firstErrStep.vsPrev.firstCounterexample.valA),
                      valB: String(firstErrStep.vsPrev.firstCounterexample.valB),
                      row: firstErrStep.vsPrev.firstCounterexample.index,
                    })}
                  </p>
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Steps Editor Card */}
      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <div>
            <h2 className={styles.cardTitle}>{t('boolean.compare.chain.stepsTitle')}</h2>
            <p className={styles.metaInline} style={{ marginTop: '0.2rem' }}>
              {t('boolean.compare.chain.stepsHint')}
            </p>
          </div>
          <div className={styles.btnRow}>
            <button
              type="button"
              className={[styles.btnGhost, styles.btnSmall].join(' ')}
              onClick={() => setShowPasteBox((v) => !v)}
              data-testid="chain-paste-toggle"
            >
              {t('boolean.compare.chain.pasteLines')}
            </button>
            <button
              type="button"
              className={[styles.btn, styles.btnSmall].join(' ')}
              onClick={() => handleAddStep(true)}
              data-testid="chain-add-step"
            >
              + {t('boolean.compare.chain.addStep')}
            </button>
          </div>
        </div>

        <div
          className={styles.insertToolbar}
          role="group"
          aria-label={t('boolean.input.insertAria')}
          style={{ marginBottom: '0.75rem' }}
        >
          {QUICK_OPS.map((sym) => (
            <button
              key={sym.label}
              type="button"
              className={styles.insertBtn}
              onClick={() => insertSnippet(sym.snippet, sym.cursorOffset ?? 0)}
            >
              {sym.label}
            </button>
          ))}
        </div>

        {showPasteBox && (
          <div className={cStyles.pasteBox} style={{ marginBottom: '0.85rem' }}>
            <label htmlFor="chain-paste-area" className={styles.fieldLabel} style={{ margin: 0 }}>
              {t('boolean.compare.chain.pastePrompt')}
            </label>
            <textarea
              id="chain-paste-area"
              value={pasteDraft}
              onChange={(e) => setPasteDraft(e.target.value)}
              className={cStyles.pasteArea}
              placeholder={"A'*(B*C)' + A'*C\nA'*(B' + C') + A'*C\nA'"}
              data-testid="chain-paste-textarea"
            />
            <div className={styles.btnRow}>
              <button
                type="button"
                className={[styles.btnPrimary, styles.btnSmall].join(' ')}
                onClick={handleApplyPaste}
                disabled={!pasteDraft.trim()}
                data-testid="chain-paste-apply"
              >
                {t('boolean.compare.chain.applyPaste')}
              </button>
              <button
                type="button"
                className={[styles.btnGhost, styles.btnSmall].join(' ')}
                onClick={() => setShowPasteBox(false)}
              >
                {t('boolean.compare.chain.cancel')}
              </button>
            </div>
          </div>
        )}

        <div className={cStyles.chainList} data-testid="chain-step-list">
          {steps.map((raw, idx) => {
            const check = chainResult.steps[idx];
            const isSelected = effectiveSelectedIdx === idx;
            const isError =
              check?.status === 'first-error' ||
              check?.status === 'step-error' ||
              check?.status === 'syntax-error';
            const isValid = check?.status === 'valid' || check?.status === 'recovered';

            return (
              <div
                key={idx}
                className={[
                  cStyles.chainRow,
                  isError ? cStyles.chainRowError : isValid ? cStyles.chainRowValid : '',
                  isSelected ? cStyles.chainRowSelected : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                data-testid={`chain-step-row-${idx}`}
                data-status={check?.status ?? 'empty'}
              >
                <div className={cStyles.chainRowTop}>
                  <span className={cStyles.chainStepNum}>
                    {t('boolean.compare.chain.stepName', { num: idx + 1 })}
                  </span>
                  <input
                    ref={(el) => {
                      stepInputRefs.current[idx] = el;
                    }}
                    type="text"
                    value={raw}
                    onFocus={() => setFocusedField(idx)}
                    onChange={(e) => handleStepChange(idx, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        if (idx === steps.length - 1) {
                          handleAddStep(true);
                        } else {
                          stepInputRefs.current[idx + 1]?.focus();
                        }
                      }
                    }}
                    placeholder={t('boolean.compare.chain.stepPlaceholder', { num: idx + 1 })}
                    aria-label={t('boolean.compare.chain.stepAria', { num: idx + 1 })}
                    className={styles.exprInput}
                    autoComplete="off"
                    spellCheck={false}
                    data-testid={`chain-step-input-${idx}`}
                  />
                  <button
                    type="button"
                    className={styles.eqRemoveBtn}
                    onClick={() => handleRemoveStep(idx)}
                    aria-label={t('boolean.compare.chain.removeStep', { num: idx + 1 })}
                    title={t('boolean.compare.chain.removeStep', { num: idx + 1 })}
                  >
                    ×
                  </button>
                </div>

                {check && check.status !== 'empty' && (
                  <div className={cStyles.chainStatusLine}>
                    <div className={cStyles.chainStatusGroup}>
                      {renderStatusBadge(check)}
                      {check.latex && (
                        <span>
                          <KatexSpan text={check.latex} />
                        </span>
                      )}
                      {check.metrics && (
                        <span className={styles.metaInline}>
                          {t('boolean.steps.metaCounts', {
                            gates: check.metrics.gates,
                            literals: check.metrics.literals,
                          })}
                        </span>
                      )}
                      {check.error && <span className={styles.previewErr}>{check.error}</span>}
                    </div>

                    {check.vsPrev && check.vsOriginal && (
                      <button
                        type="button"
                        className={[
                          styles.btn,
                          styles.btnSmall,
                          isSelected ? styles.btnActiveSoft : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                        onClick={() => {
                          setSelectedStepIdx(idx);
                          setCompareRefMode(check.status === 'cascaded' ? 'start' : 'prev');
                        }}
                        data-testid={`chain-inspect-step-${idx}`}
                      >
                        {isSelected
                          ? t('boolean.compare.chain.inspecting')
                          : t('boolean.compare.chain.inspectBtn')}
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Detailed Diff Inspector for the Selected / First-Error Step */}
      {inspectedStep && inspectedStep.vsPrev && inspectedStep.vsOriginal && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          <div className={cStyles.topToolbar}>
            <span className={styles.cardTitle}>
              {t('boolean.compare.chain.compareAgainst', { step: inspectedStep.index + 1 })}
            </span>
            <div className={styles.segmented} role="group">
              <button
                type="button"
                aria-pressed={compareRefMode === 'prev'}
                className={[
                  styles.segBtn,
                  compareRefMode === 'prev' ? styles.segBtnActive : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => setCompareRefMode('prev')}
                data-testid="chain-diff-vs-prev"
              >
                {t('boolean.compare.chain.vsPrev', {
                  prevLabel: stepLabel(inspectedStep.prevStepIndex),
                })}
              </button>
              <button
                type="button"
                aria-pressed={compareRefMode === 'start'}
                className={[
                  styles.segBtn,
                  compareRefMode === 'start' ? styles.segBtnActive : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => setCompareRefMode('start')}
                data-testid="chain-diff-vs-start"
              >
                {t('boolean.compare.chain.vsStart')}
              </button>
            </div>
          </div>

          <CompareResultsPanel
            result={compareRefMode === 'prev' ? inspectedStep.vsPrev : inspectedStep.vsOriginal}
            labelA={
              compareRefMode === 'prev'
                ? stepLabel(inspectedStep.prevStepIndex)
                : t('boolean.compare.chain.startName')
            }
            labelB={t('boolean.compare.chain.stepName', { num: inspectedStep.index + 1 })}
            onOpenInSimplifier={onOpenInSimplifier}
          />
        </div>
      )}
    </div>
  );
}
