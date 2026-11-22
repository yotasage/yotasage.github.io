import React, { useMemo, useRef, useState } from 'react';

import { type EvalEnv, type EvalResult, evaluateInput } from '../../lib/calc/eval';
import type { StoredHistoryItem } from '../../lib/calc/storage';
import { useI18n } from '../../lib/ui/i18n';
import styles from '../../styles/Calculator.module.css';
import ResultDisplay from './ResultDisplay';

export interface QuickBarViewProps {
  expr: string;
  onExprChange: (next: string) => void;
  env: EvalEnv;
  history: readonly StoredHistoryItem[];
  onCommit: (expr: string, result: EvalResult) => void;
  onClearMemory: () => void;
}

const QUICK_EXAMPLES: readonly string[] = [
  '10 kOhm * 100 pF',
  '1 / (2 * pi * 10 kOhm * 100 pF)',
  'c / 2.4 GHz in mm',
  '50 + j*30 Ohm',
  '30 dBm in W',
  'diff(x^3 + sin(2*x), x)',
  'int(sin(x), x, 0, pi)',
  '100 km/h in m/s',
];

export default function QuickBarView({
  expr,
  onExprChange,
  env,
  history,
  onCommit,
  onClearMemory,
}: QuickBarViewProps) {
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [historyCursor, setHistoryCursor] = useState(-1);

  const liveEval = useMemo<{ result: EvalResult | null; error: string | null }>(() => {
    const trimmed = expr.trim();
    if (!trimmed) return { result: null, error: null };
    try {
      return { result: evaluateInput(trimmed, env), error: null };
    } catch (err) {
      return {
        result: null,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }, [expr, env]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!expr.trim() || !liveEval.result) return;
    onCommit(expr.trim(), liveEval.result);
    setHistoryCursor(-1);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowUp' && history.length > 0) {
      e.preventDefault();
      const next = historyCursor === -1 ? history.length - 1 : Math.max(0, historyCursor - 1);
      setHistoryCursor(next);
      onExprChange(history[next].expr);
    } else if (e.key === 'ArrowDown' && historyCursor !== -1) {
      e.preventDefault();
      if (historyCursor >= history.length - 1) {
        setHistoryCursor(-1);
        onExprChange('');
      } else {
        const next = historyCursor + 1;
        setHistoryCursor(next);
        onExprChange(history[next].expr);
      }
    }
  };

  const recent = useMemo(() => history.slice(-6).reverse(), [history]);

  return (
    <div className={styles.quickShell}>
      <section className={styles.card}>
        <form className={styles.inputShell} onSubmit={handleSubmit}>
          <div className={styles.inputRow}>
            <input
              ref={inputRef}
              type="text"
              className={styles.exprInput}
              value={expr}
              onChange={(e) => {
                setHistoryCursor(-1);
                onExprChange(e.target.value);
              }}
              onKeyDown={handleKeyDown}
              placeholder={t('calc.inputPlaceholder')}
              aria-label={t('calc.inputAria')}
              autoComplete="off"
              spellCheck={false}
            />
            <button
              type="submit"
              className={`${styles.btnPrimary} ${styles.evalBtn}`}
              disabled={!liveEval.result}
            >
              {t('calc.evaluate')}
            </button>
          </div>

          <div className={styles.quickExamples}>
            {QUICK_EXAMPLES.map((sample) => (
              <button
                key={sample}
                type="button"
                className={styles.insertChip}
                onClick={() => {
                  onExprChange(sample);
                  inputRef.current?.focus();
                }}
              >
                {sample}
              </button>
            ))}
          </div>
        </form>

        <div className={styles.resultWrap}>
          <ResultDisplay result={liveEval.result} error={liveEval.error} />
        </div>
      </section>

      {recent.length > 0 && (
        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <h2 className={styles.cardTitle}>{t('calc.history.recent')}</h2>
            <button
              type="button"
              className={`${styles.btnDanger} ${styles.btnSmall}`}
              onClick={onClearMemory}
            >
              {t('calc.history.clear')}
            </button>
          </div>
          <ul className={styles.tapeList}>
            {recent.map((item) => (
              <li key={item.id} className={styles.tapeItem}>
                <div className={styles.tapeMain}>
                  <button
                    type="button"
                    className={styles.tapeExprBtn}
                    onClick={() => {
                      onExprChange(item.expr);
                      inputRef.current?.focus();
                    }}
                  >
                    {item.expr}
                  </button>
                  <div className={styles.tapeRes}>= {item.resultText}</div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
