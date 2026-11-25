import { useMemo, useRef, useState } from 'react';

import { BOOLEAN_EXAMPLES } from '../../lib/boolean/laws';
import { parseBoolean, toLatex, varToLatex } from '../../lib/boolean/parse';
import type {
  BooleanExample,
  NotationStyle,
  SimplifyEffort,
  SimplifyMethod,
  TargetForm,
} from '../../lib/boolean/types';
import { type TranslationKey, useI18n } from '../../lib/ui/i18n';
import { useExperienceMode } from '../../lib/ui/mode';
import styles from '../../styles/Boolean.module.css';
import KatexSpan from '../KatexSpan';

const QUICK_OPERATORS: readonly { label: string; snippet: string; cursorOffset?: number }[] = [
  { label: 'AND (·)', snippet: ' * ' },
  { label: 'OR (+)', snippet: ' + ' },
  { label: "NOT (')", snippet: "'" },
  { label: '¬()', snippet: '!()', cursorOffset: -1 },
  { label: 'XOR (⊕)', snippet: ' ^ ' },
  { label: 'XNOR', snippet: ' XNOR ' },
  { label: 'NAND', snippet: ' NAND ' },
  { label: 'NOR', snippet: ' NOR ' },
  { label: '( )', snippet: '()', cursorOffset: -1 },
  { label: '0', snippet: '0' },
  { label: '1', snippet: '1' },
];

export interface BooleanSubmitOverride {
  equations?: readonly string[];
  method?: SimplifyMethod;
  effort?: SimplifyEffort;
  targetForm?: TargetForm;
  notation?: NotationStyle;
  explicitAnd?: boolean;
}

export interface BooleanInputProps {
  readonly equations: readonly string[];
  readonly onEquationsChange: (next: string[]) => void;
  readonly method: SimplifyMethod;
  readonly onMethodChange: (next: SimplifyMethod) => void;
  readonly effort: SimplifyEffort;
  readonly onEffortChange: (next: SimplifyEffort) => void;
  readonly targetForm: TargetForm;
  readonly onTargetFormChange: (next: TargetForm) => void;
  readonly notation: NotationStyle;
  readonly onNotationChange: (next: NotationStyle) => void;
  readonly explicitAnd: boolean;
  readonly onExplicitAndChange: (next: boolean) => void;
  readonly onSubmit: (override?: BooleanSubmitOverride) => void;
}

export default function BooleanInput({
  equations,
  onEquationsChange,
  method,
  onMethodChange,
  effort,
  onEffortChange,
  targetForm,
  onTargetFormChange,
  notation,
  onNotationChange,
  explicitAnd,
  onExplicitAndChange,
  onSubmit,
}: BooleanInputProps) {
  const { t } = useI18n();
  const { mode } = useExperienceMode();
  const isQuick = mode === 'quick';

  const [focusedRow, setFocusedRow] = useState(0);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const safeFocusIndex = Math.min(focusedRow, Math.max(0, equations.length - 1));

  const previews = useMemo(() => {
    const usedNames = new Set<string>();
    return equations.map((raw, idx) => {
      const trimmed = raw.trim();
      if (!trimmed || /^[A-Za-z][A-Za-z0-9_]*\s*=\s*$/.test(trimmed)) {
        return { ok: true as const, latex: '' };
      }
      try {
        const parsed = parseBoolean(trimmed);
        let outName = parsed.outputName;
        if (equations.length > 1 && !trimmed.includes('=')) {
          outName = `Y${idx + 1}`;
        }
        while (usedNames.has(outName)) outName = `${outName}_${idx + 1}`;
        usedNames.add(outName);
        return {
          ok: true as const,
          latex: `${varToLatex(outName)} = ${toLatex(parsed.ast, notation, explicitAnd)}`,
        };
      } catch (err) {
        return {
          ok: false as const,
          error: err instanceof Error ? err.message : t('boolean.input.invalidSyntax'),
        };
      }
    });
  }, [equations, notation, explicitAnd, t]);

  const handleRowChange = (index: number, nextVal: string) => {
    const updated = equations.map((eq, i) => (i === index ? nextVal : eq));
    onEquationsChange(updated);
  };

  const handleAddRow = () => {
    const nextIdx = equations.length;
    const defaultName = `Y${nextIdx + 1} = `;
    const updated = [...equations, defaultName];
    onEquationsChange(updated);
    setFocusedRow(nextIdx);
    window.requestAnimationFrame(() => {
      const el = inputRefs.current[nextIdx];
      if (el) {
        el.focus();
        el.setSelectionRange(defaultName.length, defaultName.length);
      }
    });
  };

  const handleRemoveRow = (index: number) => {
    if (equations.length <= 1) return;
    const updated = equations.filter((_, i) => i !== index);
    onEquationsChange(updated);
    onSubmit({ equations: updated });
    setFocusedRow(Math.max(0, index - 1));
  };

  const insertSnippet = (snippet: string, cursorOffset = 0) => {
    const idx = safeFocusIndex;
    const currentVal = equations[idx] ?? '';
    const input = inputRefs.current[idx];
    if (!input) {
      handleRowChange(idx, `${currentVal}${snippet}`);
      return;
    }
    const start = input.selectionStart ?? currentVal.length;
    const end = input.selectionEnd ?? currentVal.length;
    const next = `${currentVal.slice(0, start)}${snippet}${currentVal.slice(end)}`;
    handleRowChange(idx, next);
    const caret = start + snippet.length + cursorOffset;
    window.requestAnimationFrame(() => {
      input.focus();
      input.setSelectionRange(caret, caret);
    });
  };

  const handleSelectExample = (ex: BooleanExample) => {
    const next = [ex.expr];
    onEquationsChange(next);
    setFocusedRow(0);
    onSubmit({ equations: next });
  };

  const methodOptions: readonly { id: SimplifyMethod; label: string }[] = [
    { id: 'algebraic', label: t('boolean.opt.method.algebraic') },
    { id: 'qm', label: t('boolean.opt.method.qm') },
    { id: 'heuristic', label: t('boolean.opt.method.heuristic') },
  ];

  const effortOptions: readonly { id: SimplifyEffort; label: string }[] = [
    { id: 'low', label: t('boolean.opt.effort.low') },
    { id: 'medium', label: t('boolean.opt.effort.medium') },
    { id: 'high', label: t('boolean.opt.effort.high') },
  ];

  const formOptions: readonly { id: TargetForm; label: string }[] = [
    { id: 'auto', label: t('boolean.opt.form.auto') },
    { id: 'sop', label: t('boolean.opt.form.sop') },
    { id: 'pos', label: t('boolean.opt.form.pos') },
    { id: 'nand', label: t('boolean.opt.form.nand') },
    { id: 'nor', label: t('boolean.opt.form.nor') },
  ];

  const hasAnyNonEmpty = equations.some((eq) => eq.trim().length > 0);
  const firstError = previews.find((p) => !p.ok);
  const validLatexList = previews.filter((p): p is { ok: true; latex: string } => p.ok && p.latex.length > 0);

  return (
    <form
      className={styles.inputForm}
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <div className={styles.exprInputWrap}>
        <label htmlFor="boolean-expr-input-0" className={styles.fieldLabel}>
          {equations.length > 1 ? t('boolean.input.labelPlural') : t('boolean.input.label')}
        </label>

        <div className={styles.eqList}>
          {equations.map((eq, idx) => (
            <div key={idx} className={styles.eqRow}>
              {equations.length > 1 && <span className={styles.eqIndex}>{idx + 1}.</span>}
              <input
                ref={(el) => {
                  inputRefs.current[idx] = el;
                }}
                id={`boolean-expr-input-${idx}`}
                type="text"
                value={eq}
                onFocus={() => setFocusedRow(idx)}
                onChange={(e) => handleRowChange(idx, e.target.value)}
                placeholder={idx === 0 ? t('boolean.input.placeholder') : t('boolean.input.rowPlaceholder')}
                className={styles.exprInput}
                autoComplete="off"
                spellCheck={false}
              />
              {equations.length > 1 && (
                <button
                  type="button"
                  className={styles.eqRemoveBtn}
                  onClick={() => handleRemoveRow(idx)}
                  aria-label={`${t('boolean.input.removeEquation')} ${idx + 1}`}
                  title={t('boolean.input.removeEquation')}
                >
                  ×
                </button>
              )}
              {idx === equations.length - 1 && (
                <button type="submit" className={[styles.btnPrimary, styles.solveBtn].join(' ')}>
                  {t('boolean.input.simplify')}
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className={styles.eqActionsRow}>
        <div className={styles.insertToolbar} role="group" aria-label={t('boolean.input.insertAria')}>
          <button
            type="button"
            className={[styles.btn, styles.btnSmall].join(' ')}
            onClick={handleAddRow}
            data-testid="add-equation-btn"
          >
            + {t('boolean.input.addEquation')}
          </button>
          {QUICK_OPERATORS.map((sym) => (
            <button
              key={sym.label}
              type="button"
              className={styles.insertBtn}
              onClick={() => insertSnippet(sym.snippet, sym.cursorOffset ?? 0)}
            >
              {sym.label}
            </button>
          ))}
          {hasAnyNonEmpty && (
            <button
              type="button"
              className={[styles.btnGhost, styles.btnSmall].join(' ')}
              onClick={() => {
                onEquationsChange(['']);
                setFocusedRow(0);
                inputRefs.current[0]?.focus();
              }}
            >
              {t('boolean.input.clear')}
            </button>
          )}
        </div>
      </div>

      {/* Engineering options — hidden in Quick mode for a truly streamlined experience */}
      {!isQuick && (
        <div className={styles.optionsBar} data-testid="boolean-advanced-options">
          <div className={styles.optionGroup}>
            <span className={styles.fieldLabel}>{t('boolean.opt.method')}</span>
            <div className={styles.segmented} role="group" aria-label={t('boolean.opt.method')}>
              {methodOptions.map((opt) => {
                const active = method === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    aria-pressed={active}
                    className={[styles.segBtn, active ? styles.segBtnActive : ''].filter(Boolean).join(' ')}
                    onClick={() => {
                      onMethodChange(opt.id);
                      onSubmit({ method: opt.id });
                    }}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className={styles.optionGroup}>
            <span className={styles.fieldLabel}>{t('boolean.opt.effort')}</span>
            <div className={styles.segmented} role="group" aria-label={t('boolean.opt.effort')}>
              {effortOptions.map((opt) => {
                const active = effort === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    aria-pressed={active}
                    className={[styles.segBtn, active ? styles.segBtnActive : ''].filter(Boolean).join(' ')}
                    onClick={() => {
                      onEffortChange(opt.id);
                      onSubmit({ effort: opt.id });
                    }}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className={styles.optionGroup}>
            <span className={styles.fieldLabel}>{t('boolean.opt.form')}</span>
            <div className={styles.segmented} role="group" aria-label={t('boolean.opt.form')}>
              {formOptions.map((opt) => {
                const active = targetForm === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    aria-pressed={active}
                    className={[styles.segBtn, active ? styles.segBtnActive : ''].filter(Boolean).join(' ')}
                    onClick={() => {
                      onTargetFormChange(opt.id);
                      onSubmit({ targetForm: opt.id });
                    }}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className={styles.optionGroup}>
            <label htmlFor="boolean-notation-select" className={styles.fieldLabel}>
              {t('boolean.opt.notation')}
            </label>
            <select
              id="boolean-notation-select"
              value={notation}
              onChange={(e) => {
                const next = e.target.value as NotationStyle;
                onNotationChange(next);
                onSubmit({ notation: next });
              }}
              className={styles.selectInput}
            >
              <option value="engineering">{t('boolean.opt.notation.engineering')}</option>
              <option value="logic">{t('boolean.opt.notation.logic')}</option>
              <option value="programming">{t('boolean.opt.notation.programming')}</option>
              <option value="verilog">{t('boolean.opt.notation.verilog')}</option>
            </select>
          </div>

          <div className={styles.optionGroup}>
            <span className={styles.fieldLabel}>{t('boolean.opt.andStyle')}</span>
            <div className={styles.segmented} role="group" aria-label={t('boolean.opt.andStyle')}>
              <button
                type="button"
                aria-pressed={explicitAnd}
                className={[styles.segBtn, explicitAnd ? styles.segBtnActive : ''].filter(Boolean).join(' ')}
                onClick={() => {
                  onExplicitAndChange(true);
                  onSubmit({ explicitAnd: true });
                }}
              >
                {t('boolean.opt.andStyle.explicit')}
              </button>
              <button
                type="button"
                aria-pressed={!explicitAnd}
                className={[styles.segBtn, !explicitAnd ? styles.segBtnActive : ''].filter(Boolean).join(' ')}
                onClick={() => {
                  onExplicitAndChange(false);
                  onSubmit({ explicitAnd: false });
                }}
              >
                {t('boolean.opt.andStyle.minimal')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Scrollbar-free live preview */}
      <div className={styles.previewBar} aria-live="polite" data-testid="boolean-live-preview">
        {firstError && !firstError.ok ? (
          <span className={styles.previewErr}>{firstError.error}</span>
        ) : validLatexList.length > 0 ? (
          <div className={styles.previewMath}>
            {validLatexList.map((item, idx) => (
              <KatexSpan key={idx} text={item.latex} />
            ))}
          </div>
        ) : (
          <span className={styles.previewCaption}>{t('boolean.input.placeholder')}</span>
        )}
        <span className={styles.previewCaption}>{t('boolean.input.preview')}</span>
      </div>

      {!isQuick && (
        <div className={styles.examplesRow}>
          <span className={styles.examplesLabel}>{t('boolean.input.examples')}:</span>
          {BOOLEAN_EXAMPLES.map((ex) => {
            const tagKey = `boolean.quickEx.${ex.id}` as TranslationKey;
            const trTag = t(tagKey);
            const tagLabel = trTag === tagKey ? ex.tag : trTag;
            return (
              <button
                key={ex.id}
                type="button"
                className={styles.exampleBtn}
                onClick={() => handleSelectExample(ex)}
              >
                <span>{ex.label}</span>
                <span className={styles.exampleTag}>{tagLabel}</span>
              </button>
            );
          })}
        </div>
      )}
    </form>
  );
}
