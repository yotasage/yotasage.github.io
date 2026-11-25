import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import { formatNum, identToLatex } from '../../lib/calculus/ast';
import { INTEGRAL_EXAMPLES } from '../../lib/calculus/identities';
import { solveIntegral } from '../../lib/calculus/integrate';
import type { SolverExample } from '../../lib/calculus/types';
import { useI18n } from '../../lib/ui/i18n';
import { localizeCalculusText } from '../../lib/ui/localizeCalculusStep';
import styles from '../../styles/Calculus.module.css';
import KatexSpan from '../KatexSpan';
import ExpressionInput, { type SolveFeedback } from './ExpressionInput';
import StepViewer from './StepViewer';

export interface IntegralSolverViewProps {
  readonly expr: string;
  readonly onExprChange: (next: string) => void;
  readonly variable: string;
  readonly onVariableChange: (next: string) => void;
  readonly isDefinite: boolean;
  readonly onDefiniteChange: (next: boolean) => void;
  readonly lower: string;
  readonly onLowerChange: (next: string) => void;
  readonly upper: string;
  readonly onUpperChange: (next: string) => void;
  readonly submitted: {
    readonly expr: string;
    readonly variable: string;
    readonly definite: boolean;
    readonly lower: string;
    readonly upper: string;
    readonly seq: number;
  };
  readonly onSolve: (next?: {
    expr: string;
    variable?: string;
    definite?: boolean;
    lower?: string;
    upper?: string;
  }) => void;
  readonly onInspectRule: (ruleId: string) => void;
}

export default function IntegralSolverView({
  expr,
  onExprChange,
  variable,
  onVariableChange,
  isDefinite,
  onDefiniteChange,
  lower,
  onLowerChange,
  upper,
  onUpperChange,
  submitted,
  onSolve,
  onInspectRule,
}: IntegralSolverViewProps) {
  const { t, locale } = useI18n();
  const [copiedKey, setCopiedKey] = useState<'latex' | 'text' | null>(null);
  const [solveFeedback, setSolveFeedback] = useState<SolveFeedback>({ status: 'idle', seq: 0 });

  const result = useMemo(
    () =>
      solveIntegral(submitted.expr, {
        variable: submitted.variable,
        definite: submitted.definite,
        lower: submitted.lower,
        upper: submitted.upper,
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

  const cleanVar = (variable.trim() || 'x').replace(/[^A-Za-z0-9_]/g, '') || 'x';
  const vx = identToLatex(cleanVar);
  const previewPrefix = isDefinite
    ? `\\int_{${lower.trim() || 'a'}}^{${upper.trim() || 'b'}} `
    : '\\int ';
  const previewSuffix = `\\,d${vx}`;

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
    const nextDef = Boolean(ex.lower && ex.upper);
    const nextLo = ex.lower ?? lower;
    const nextHi = ex.upper ?? upper;
    onExprChange(ex.expr);
    onVariableChange(nextVar);
    onDefiniteChange(nextDef);
    if (ex.lower !== undefined) onLowerChange(ex.lower);
    if (ex.upper !== undefined) onUpperChange(ex.upper);
    onSolve({
      expr: ex.expr,
      variable: nextVar,
      definite: nextDef,
      lower: nextLo,
      upper: nextHi,
    });
  };

  return (
    <div className={styles.workspacePanel}>
      <div className={styles.topStrip}>
        <p className={styles.lead}>{t('calculus.integral.lead')}</p>
        <Link
          href={`/derivative/main?expr=${encodeURIComponent(
            result.ok && result.antiderivativeText ? result.antiderivativeText : expr.trim() || 'x^2 * sin(3x)',
          )}`}
          className={styles.companionLink}
        >
          <span>{t('calculus.integral.verifyDiff')}</span>
          <span aria-hidden="true">&rarr;</span>
        </Link>
      </div>

      <section className={styles.card}>
        <ExpressionInput
          id="integral-expr-input"
          value={expr}
          onChange={handleExprChange}
          onSubmit={() => onSolve()}
          placeholder={t('calculus.input.integralPlaceholder')}
          previewPrefixLatex={previewPrefix}
          previewSuffixLatex={previewSuffix}
          examples={INTEGRAL_EXAMPLES}
          onSelectExample={handleExample}
          solveFeedback={solveFeedback}
          optionsSlot={
            <>
              <div className={styles.optionGroup}>
                <span className={styles.fieldLabel}>{t('calculus.integral.kind')}</span>
                <div className={styles.segmented} role="group" aria-label={t('calculus.integral.kind')}>
                  <button
                    type="button"
                    aria-pressed={!isDefinite}
                    className={[styles.segBtn, !isDefinite ? styles.segBtnActive : '']
                      .filter(Boolean)
                      .join(' ')}
                    onClick={() => {
                      onDefiniteChange(false);
                      onSolve({ expr, variable, definite: false, lower, upper });
                    }}
                  >
                    {t('calculus.integral.indefinite')}
                  </button>
                  <button
                    type="button"
                    aria-pressed={isDefinite}
                    className={[styles.segBtn, isDefinite ? styles.segBtnActive : '']
                      .filter(Boolean)
                      .join(' ')}
                    onClick={() => {
                      onDefiniteChange(true);
                      onSolve({ expr, variable, definite: true, lower, upper });
                    }}
                  >
                    {t('calculus.integral.definite')}
                  </button>
                </div>
              </div>

              <div className={styles.optionGroup}>
                <label htmlFor="integral-var-input" className={styles.fieldLabel}>
                  {t('calculus.input.variable')}
                </label>
                <input
                  id="integral-var-input"
                  type="text"
                  value={variable}
                  onChange={(e) => onVariableChange(e.target.value)}
                  className={[styles.smallInput, styles.varInput].join(' ')}
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>

              {isDefinite && (
                <>
                  <div className={styles.optionGroup}>
                    <label htmlFor="integral-lower-input" className={styles.fieldLabel}>
                      {t('calculus.integral.lower')}
                    </label>
                    <input
                      id="integral-lower-input"
                      type="text"
                      value={lower}
                      onChange={(e) => onLowerChange(e.target.value)}
                      className={[styles.smallInput, styles.boundInput].join(' ')}
                      autoComplete="off"
                      spellCheck={false}
                    />
                  </div>

                  <div className={styles.optionGroup}>
                    <label htmlFor="integral-upper-input" className={styles.fieldLabel}>
                      {t('calculus.integral.upper')}
                    </label>
                    <input
                      id="integral-upper-input"
                      type="text"
                      value={upper}
                      onChange={(e) => onUpperChange(e.target.value)}
                      className={[styles.smallInput, styles.boundInput].join(' ')}
                      autoComplete="off"
                      spellCheck={false}
                    />
                  </div>
                </>
              )}
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
            aria-label={t('calculus.integral.resultTitle')}
            data-testid="integral-result"
          >
            <div className={styles.resultTop}>
              <h2 className={styles.resultHeading}>{t('calculus.integral.resultTitle')}</h2>
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

            {result.isDefinite && (result.antiderivativeLatex || result.numericValue !== undefined) && (
              <div className={styles.subFacts}>
                {result.antiderivativeLatex && (
                  <span className={styles.subFact}>
                    <span className={styles.subFactLabel}>
                      {t('calculus.integral.antiderivative', { v: result.variable })}:
                    </span>
                    <KatexSpan text={result.antiderivativeLatex} />
                  </span>
                )}
                {result.numericValue !== undefined && Number.isFinite(result.numericValue) && (
                  <span className={styles.subFact}>
                    <span className={styles.subFactLabel}>{t('calculus.integral.numericValue')}:</span>
                    <code>{formatNum(result.numericValue, 9)}</code>
                  </span>
                )}
              </div>
            )}

            <div className={styles.resultSubRow}>
              <span
                className={
                  result.verification.status === 'verified'
                    ? styles.verifyOk
                    : result.verification.status === 'numeric-only'
                      ? styles.verifyWarn
                      : styles.metaInline
                }
              >
                {result.verification.status === 'verified'
                  ? t('calculus.result.verifiedAnti', {
                      v: result.variable,
                      count: result.verification.samplesChecked ?? 0,
                    })
                  : result.verification.status === 'numeric-only'
                    ? t('calculus.result.numericMethod')
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
