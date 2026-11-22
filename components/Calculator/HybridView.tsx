import React, { useMemo, useRef, useState } from 'react';

import { type EvalEnv, type EvalResult, evaluateInput } from '../../lib/calc/eval';
import type { StoredHistoryItem, StoredVariable } from '../../lib/calc/storage';
import { useI18n } from '../../lib/ui/i18n';
import styles from '../../styles/Calculator.module.css';
import ResultDisplay from './ResultDisplay';
import VariablesPanel, { type EvaluatedVariableInfo } from './VariablesPanel';

export interface HybridViewProps {
  expr: string;
  onExprChange: (next: string) => void;
  env: EvalEnv;
  history: readonly StoredHistoryItem[];
  variables: readonly StoredVariable[];
  evaluatedVars: Readonly<Record<string, EvaluatedVariableInfo>>;
  onCommit: (expr: string, result: EvalResult) => void;
  onRemoveHistory: (id: string) => void;
  onClearMemory: () => void;
  onAddVar: (name: string, expr: string) => void;
  onUpdateVarExpr: (name: string, expr: string) => void;
  onDeleteVar: (name: string) => void;
  onClearVars: () => void;
}

const QUICK_INSERTS: readonly { label: string; insert: string }[] = [
  { label: 'π', insert: 'pi' },
  { label: 'Ω', insert: ' Ohm' },
  { label: 'µ', insert: 'u' },
  { label: '∠', insert: ' angle ' },
  { label: '∥', insert: ' || ' },
  { label: 'd/dx', insert: 'diff(x^3, x)' },
  { label: '∫', insert: 'int(sin(x), x, 0, pi)' },
  { label: 'in ', insert: ' in ' },
];

export default function HybridView({
  expr,
  onExprChange,
  env,
  history,
  variables,
  evaluatedVars,
  onCommit,
  onRemoveHistory,
  onClearMemory,
  onAddVar,
  onUpdateVarExpr,
  onDeleteVar,
  onClearVars,
}: HybridViewProps) {
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [historyCursor, setHistoryCursor] = useState<number>(-1);
  const [copiedId, setCopiedId] = useState<string | null>(null);

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

  const insertToken = (snippet: string) => {
    const el = inputRef.current;
    if (!el) {
      onExprChange(`${expr}${snippet}`);
      return;
    }
    const start = el.selectionStart ?? expr.length;
    const end = el.selectionEnd ?? expr.length;
    const next = `${expr.slice(0, start)}${snippet}${expr.slice(end)}`;
    onExprChange(next);
    window.requestAnimationFrame(() => {
      el.focus();
      const pos = start + snippet.length;
      el.setSelectionRange(pos, pos);
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!expr.trim() || !liveEval.result) return;
    onCommit(expr.trim(), liveEval.result);
    setHistoryCursor(-1);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowUp' && history.length > 0) {
      e.preventDefault();
      const nextCursor = historyCursor === -1 ? history.length - 1 : Math.max(0, historyCursor - 1);
      setHistoryCursor(nextCursor);
      onExprChange(history[nextCursor].expr);
    } else if (e.key === 'ArrowDown' && historyCursor !== -1) {
      e.preventDefault();
      if (historyCursor >= history.length - 1) {
        setHistoryCursor(-1);
        onExprChange('');
      } else {
        const nextCursor = historyCursor + 1;
        setHistoryCursor(nextCursor);
        onExprChange(history[nextCursor].expr);
      }
    } else if (e.key === 'Escape') {
      setHistoryCursor(-1);
      onExprChange('');
    }
  };

  const handleCopyTapeResult = async (id: string, text: string) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        setCopiedId(id);
        window.setTimeout(() => setCopiedId((prev) => (prev === id ? null : prev)), 1400);
      } catch {
        // ignore clipboard failure
      }
    }
  };

  const reversedHistory = useMemo(
    () =>
      history
        .map((item, idx) => ({ item, ansIndex: idx + 1 }))
        .reverse(),
    [history],
  );

  return (
    <div className={styles.hybridGrid}>
      <div className={styles.leftCol}>
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

            <div className={styles.quickBarRow}>
              <div className={styles.insertStrip}>
                {QUICK_INSERTS.map((chip) => (
                  <button
                    key={chip.label}
                    type="button"
                    className={styles.insertChip}
                    onClick={() => insertToken(chip.insert)}
                  >
                    {chip.label}
                  </button>
                ))}
              </div>
              <span className={styles.enterHint}>{t('calc.enterHint')}</span>
            </div>
          </form>

          <div className={styles.resultWrap}>
            <ResultDisplay result={liveEval.result} error={liveEval.error} />
          </div>
        </section>

        <section className={styles.card} aria-labelledby="calc-history-heading">
          <div className={styles.cardHeader}>
            <h2 id="calc-history-heading" className={styles.cardTitle}>
              {t('calc.history.title')}
            </h2>
            {history.length > 0 && (
              <button
                type="button"
                className={`${styles.btnDanger} ${styles.btnSmall}`}
                onClick={onClearMemory}
              >
                {t('calc.history.clear')}
              </button>
            )}
          </div>

          {reversedHistory.length === 0 ? (
            <p className={styles.emptyPrompt}>{t('calc.history.empty')}</p>
          ) : (
            <ul className={styles.tapeList}>
              {reversedHistory.map(({ item, ansIndex }) => (
                <li key={item.id} className={styles.tapeItem}>
                  <div className={styles.tapeMain}>
                    <button
                      type="button"
                      className={styles.tapeExprBtn}
                      title={t('calc.history.recall')}
                      onClick={() => {
                        onExprChange(item.expr);
                        inputRef.current?.focus();
                      }}
                    >
                      {item.expr}
                    </button>
                    <div className={styles.tapeRes}>= {item.resultText}</div>
                  </div>

                  <div className={styles.tapeActions}>
                    <button
                      type="button"
                      className={styles.ansTag}
                      title={t('calc.history.useRef')}
                      onClick={() => insertToken(`ans${ansIndex}`)}
                    >
                      ans{ansIndex}
                    </button>
                    <button
                      type="button"
                      className={`${styles.btnGhost} ${styles.btnSmall}`}
                      onClick={() => { void handleCopyTapeResult(item.id, item.resultText); }}
                    >
                      {copiedId === item.id ? t('calc.result.copied') : t('calc.result.copy')}
                    </button>
                    <button
                      type="button"
                      className={`${styles.btnGhost} ${styles.btnSmall}`}
                      aria-label={t('calc.history.remove')}
                      title={t('calc.history.remove')}
                      onClick={() => onRemoveHistory(item.id)}
                    >
                      ×
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className={styles.rightCol}>
        <VariablesPanel
          variables={variables}
          evaluated={evaluatedVars}
          onAdd={onAddVar}
          onUpdateExpr={onUpdateVarExpr}
          onDelete={onDeleteVar}
          onClear={onClearVars}
          onInsertName={(name) => insertToken(name)}
        />
      </div>
    </div>
  );
}
