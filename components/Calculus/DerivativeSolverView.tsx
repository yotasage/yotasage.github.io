import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import { formatNum, identToLatex } from '../../lib/calculus/ast';
import { solveDerivative } from '../../lib/calculus/differentiate';
import { DERIVATIVE_EXAMPLES } from '../../lib/calculus/identities';
import type { SolverExample } from '../../lib/calculus/types';
import { useI18n } from '../../lib/ui/i18n';
import { localizeCalculusText } from '../../lib/ui/localizeCalculusStep';
import styles from '../../styles/Calculus.module.css';
import KatexSpan from '../KatexSpan';
import ExpressionInput, { type SolveFeedback } from './ExpressionInput';
import StepViewer from './StepViewer';

export interface DerivativeSolverViewProps {
  readonly expr: string;
  readonly onExprChange: (next: string) => void;
  readonly variable: string;
  readonly onVariableChange: (next: string) => void;
  readonly order: number;
  readonly onOrderChange: (next: number) => void;
  readonly evaluateAt: string;
  readonly onEvaluateAtChange: (next: string) => void;
  readonly submitted: {
    readonly expr: string;
    readonly variable: string;
    readonly order: number;
    readonly evaluateAt: string;
    readonly seq: number;
  };
  readonly onSolve: (next?: {
    expr: string;
    variable?: string;
    order?: number;
    evaluateAt?: string;
  }) => void;
  readonly onInspectRule: (ruleId: string) => void;
}

export default function DerivativeSolverView({
  expr,
  onExprChange,
  variable,
  onVariableChange,
  order,
  onOrderChange,
  evaluateAt,
  onEvaluateAtChange,
  submitted,
  onSolve,
  onInspectRule,
}: DerivativeSolverViewProps) {
  const { t, locale } = useI18n();
  const [copiedKey, setCopiedKey] = useState<'latex' | 'text' | null>(null);
  const [solveFeedback, setSolveFeedback] = useState<SolveFeedback>({ status: 'idle', seq: 0 });

  const result = useMemo(
    () =>
      solveDerivative(submitted.expr, {
        variable: submitted.variable,
        order: submitted.order,
        evaluateAt: submitted.evaluateAt,
      }),
    [submitted],
  );

  useEffect(() => {
    if (submitted.seq <= 0) return;
    const status = result.ok ? 'success' : 'error';
    setSolveFeedback({ status, seq: submitted.seq });
    const timer = window.setTimeout(() => {
      setSolveFeedback((cur) => (cur.seq === submitted.seq ? { status: 'idle', seq: cur.seq } : cur));
    }, 2000);
    return () => window.clearTimeout(timer);
  }, [submitted.seq, result.ok]);

  const handleExprChange = (next: string) => {
    setSolveFeedback((cur) => (cur.status === 'idle' ? cur : { status: 'idle', seq: cur.seq }));
    onExprChange(next);
  };

  const resultPulseClass =
    solveFeedback.status === 'success'
      ? solveFeedback.seq % 2 === 0
        ? styles.resultCardPulseGoodA
        : styles.resultCardPulseGoodB
      : solveFeedback.status === 'error'
        ? solveFeedback.seq % 2 === 0
          ? styles.resultCardPulseBadA
          : styles.resultCardPulseBadB
        : '';

  const vx = identToLatex((variable.trim() || 'x').replace(/[^A-Za-z0-9_]/g, '') || 'x');
  const previewPrefix =
    order === 1
      ? `\\frac{d}{d${vx}}\\left(`
      : `\\frac{d^{${order}}}{d${vx}^{${order}}}\\left(`;

  const copyValue = async (kind: 'latex' | 'text', text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(kind);
      window.setTimeout(() => setCopiedKey(null), 1600);
    } catch {
      // Ignore clipboard permission errors
    }
  };

  const handleExample = (ex: SolverExample) => {
    const nextVar = ex.variable ?? 'x';
    const nextOrder = ex.order ?? 1;
    onExprChange(ex.expr);
    onVariableChange(nextVar);
    onOrderChange(nextOrder);
    onSolve({ expr: ex.expr, variable: nextVar, order: nextOrder, evaluateAt });
  };

  const orderLabels = [
    t('calculus.derivative.order1'),
    t('calculus.derivative.order2'),
    t('calculus.derivative.order3'),
    t('calculus.derivative.order4'),
  ];

  return (
    <div className={styles.workspacePanel}>
      <div className={styles.topStrip}>
        <p className={styles.lead}>{t('calculus.derivative.lead')}</p>
        <Link
          href={`/integral/main?expr=${encodeURIComponent(expr.trim() || 'x * cos(2x)')}`}
          className={styles.companionLink}
        >
          <span>{t('calculus.derivative.openIntegral')}</span>
          <span aria-hidden="true">&rarr;</span>
        </Link>
      </div>

      <section className={styles.card}>
        <ExpressionInput
          id="derivative-expr-input"
          value={expr}
          onChange={handleExprChange}
          onSubmit={() => onSolve()}
          placeholder={t('calculus.input.derivativePlaceholder')}
          previewPrefixLatex={previewPrefix}
          previewSuffixLatex={'\\right)'}
          examples={DERIVATIVE_EXAMPLES}
          onSelectExample={handleExample}
          solveFeedback={solveFeedback}
          optionsSlot={
            <>
              <div className={styles.optionGroup}>
                <label htmlFor="derivative-var-input" className={styles.fieldLabel}>
                  {t('calculus.input.variable')}
                </label>
                <input
                  id="derivative-var-input"
                  type="text"
                  value={variable}
                  onChange={(e) => onVariableChange(e.target.value)}
                  className={[styles.smallInput, styles.varInput].join(' ')}
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>

              <div className={styles.optionGroup}>
                <span className={styles.fieldLabel}>{t('calculus.derivative.order')}</span>
                <div className={styles.segmented} role="group" aria-label={t('calculus.derivative.order')}>
                  {[1, 2, 3, 4].map((ord, idx) => {
                    const active = order === ord;
                    return (
                      <button
                        key={ord}
                        type="button"
                        aria-pressed={active}
                        className={[styles.segBtn, active ? styles.segBtnActive : '']
                          .filter(Boolean)
                          .join(' ')}
                        onClick={() => {
                          onOrderChange(ord);
                          onSolve({ expr, variable, order: ord, evaluateAt });
                        }}
                      >
                        {orderLabels[idx]}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className={styles.optionGroup}>
                <label htmlFor="derivative-eval-input" className={styles.fieldLabel}>
                  {t('calculus.derivative.evalAt')}
                </label>
                <input
                  id="derivative-eval-input"
                  type="text"
                  value={evaluateAt}
                  onChange={(e) => onEvaluateAtChange(e.target.value)}
                  placeholder={t('calculus.derivative.evalPlaceholder')}
                  className={[styles.smallInput, styles.evalInput].join(' ')}
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>
            </>
          }
        />
      </section>

      {'error' in result ? (
        <section
          className={[styles.resultCard, styles.resultCardError, resultPulseClass].filter(Boolean).join(' ')}
          role="alert"
        >
          <p className={styles.errorMsg}>{localizeCalculusText(result.error, locale)}</p>
          {result.hint && <p className={styles.errorHint}>{localizeCalculusText(result.hint, locale)}</p>}
        </section>
      ) : (
        <>
          <section
            className={[styles.resultCard, resultPulseClass].filter(Boolean).join(' ')}
            aria-label={t('calculus.derivative.resultTitle')}
            data-testid="derivative-result"
          >
            <div className={styles.resultTop}>
              <h2 className={styles.resultHeading}>{t('calculus.derivative.resultTitle')}</h2>
              <div className={styles.btnRow}>
                <button
                  type="button"
                  className={[styles.btn, styles.btnSmall].join(' ')}
                  onClick={() => copyValue('latex', result.resultLatex)}
                >
                  {copiedKey === 'latex' ? t('calculus.result.copied') : t('calculus.result.copyLatex')}
                </button>
                <button
                  type="button"
                  className={[styles.btn, styles.btnSmall].join(' ')}
                  onClick={() => copyValue('text', result.resultText)}
                >
                  {copiedKey === 'text' ? t('calculus.result.copied') : t('calculus.result.copyText')}
                </button>
              </div>
            </div>

            <div className={styles.resultEquation}>
              <KatexSpan text={`${result.promptLatex} = ${result.resultLatex}`} displayMode />
            </div>

            {result.order > 1 && result.orderResults.length > 1 && (
              <div className={styles.subFacts}>
                <span className={styles.subFactLabel}>{t('calculus.derivative.higherOrders')}:</span>
                {result.orderResults.map((item) => (
                  <span key={item.order} className={styles.subFact}>
                    <KatexSpan
                      text={`f^{(${item.order})}(${identToLatex(result.variable)}) = ${item.latex}`}
                    />
                  </span>
                ))}
              </div>
            )}

            {result.evaluation && result.evaluation.derivativeValue !== null && (
              <div className={styles.subFacts}>
                <span className={styles.subFact}>
                  <KatexSpan
                    text={`f'(${result.evaluation.pointLatex}) = ${formatNum(result.evaluation.derivativeValue, 8)}`}
                  />
                </span>
                {result.evaluation.fValue !== null && (
                  <span className={styles.subFact}>
                    <KatexSpan
                      text={`f(${result.evaluation.pointLatex}) = ${formatNum(result.evaluation.fValue, 8)}`}
                    />
                  </span>
                )}
                {result.evaluation.tangentLatex && (
                  <span className={styles.subFact}>
                    <span className={styles.subFactLabel}>{t('calculus.derivative.tangentLine')}:</span>
                    <KatexSpan text={result.evaluation.tangentLatex} />
                  </span>
                )}
              </div>
            )}

            <div className={styles.resultSubRow}>
              <span
                className={
                  result.verification.status === 'verified' ? styles.verifyOk : styles.metaInline
                }
              >
                {result.verification.status === 'verified'
                  ? t('calculus.result.verifiedDiff', {
                      count: result.verification.samplesChecked ?? 0,
                    })
                  : result.verification.note
                    ? localizeCalculusText(result.verification.note, locale)
                    : t('calculus.result.symbolicOnly')}
              </span>
              <code className={styles.identityExampleCode}>{result.resultText}</code>
            </div>
          </section>

          <StepViewer steps={result.steps} onInspectRule={onInspectRule} />
        </>
      )}
    </div>
  );
}
