import React, { useMemo, useRef } from 'react';

import { toLatex } from '../../lib/calculus/ast';
import { parseMath } from '../../lib/calculus/parse';
import type { SolverExample } from '../../lib/calculus/types';
import { useI18n } from '../../lib/ui/i18n';
import styles from '../../styles/Calculus.module.css';
import KatexSpan from '../KatexSpan';

const QUICK_SYMBOLS: readonly { label: string; snippet: string; cursorOffset?: number }[] = [
  { label: 'x²', snippet: '^2' },
  { label: 'xⁿ', snippet: '^()' , cursorOffset: -1 },
  { label: '√', snippet: 'sqrt()', cursorOffset: -1 },
  { label: 'sin', snippet: 'sin()', cursorOffset: -1 },
  { label: 'cos', snippet: 'cos()', cursorOffset: -1 },
  { label: 'tan', snippet: 'tan()', cursorOffset: -1 },
  { label: 'ln', snippet: 'ln()', cursorOffset: -1 },
  { label: 'eˣ', snippet: 'exp()', cursorOffset: -1 },
  { label: 'π', snippet: 'pi' },
  { label: '1/x', snippet: '1/()' , cursorOffset: -1 },
];

export interface SolveFeedback {
  readonly status: 'idle' | 'success' | 'error';
  readonly seq: number;
}

export interface ExpressionInputProps {
  readonly id: string;
  readonly value: string;
  readonly onChange: (next: string) => void;
  readonly onSubmit: () => void;
  readonly placeholder: string;
  readonly previewPrefixLatex?: string;
  readonly previewSuffixLatex?: string;
  readonly examples: readonly SolverExample[];
  readonly onSelectExample: (example: SolverExample) => void;
  readonly optionsSlot?: React.ReactNode;
  readonly solveFeedback?: SolveFeedback;
}

function CheckIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function ErrorIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v5" />
      <path d="M12 16.5h.01" />
    </svg>
  );
}

export default function ExpressionInput({
  id,
  value,
  onChange,
  onSubmit,
  placeholder,
  previewPrefixLatex = '',
  previewSuffixLatex = '',
  examples,
  onSelectExample,
  optionsSlot,
  solveFeedback,
}: ExpressionInputProps) {
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);

  const feedbackStatus = solveFeedback?.status ?? 'idle';
  const feedbackSeq = solveFeedback?.seq ?? 0;
  const feedbackParity = feedbackSeq % 2 === 0;

  const solveBtnClass = [
    styles.btnPrimary,
    styles.solveBtn,
    feedbackStatus === 'success'
      ? feedbackParity
        ? styles.solveBtnSuccessA
        : styles.solveBtnSuccessB
      : '',
    feedbackStatus === 'error'
      ? feedbackParity
        ? styles.solveBtnErrorA
        : styles.solveBtnErrorB
      : '',
  ]
    .filter(Boolean)
    .join(' ');

  const preview = useMemo(() => {
    const trimmed = value.trim();
    if (!trimmed) return { ok: true as const, latex: '' };
    try {
      const ast = parseMath(trimmed);
      return {
        ok: true as const,
        latex: `${previewPrefixLatex}${toLatex(ast)}${previewSuffixLatex}`,
      };
    } catch (err) {
      return {
        ok: false as const,
        error: err instanceof Error ? err.message : 'Invalid syntax',
      };
    }
  }, [value, previewPrefixLatex, previewSuffixLatex]);

  const insertSnippet = (snippet: string, cursorOffset = 0) => {
    const input = inputRef.current;
    if (!input) {
      onChange(`${value}${snippet}`);
      return;
    }
    const start = input.selectionStart ?? value.length;
    const end = input.selectionEnd ?? value.length;
    const next = `${value.slice(0, start)}${snippet}${value.slice(end)}`;
    onChange(next);
    const caret = start + snippet.length + cursorOffset;
    window.requestAnimationFrame(() => {
      input.focus();
      input.setSelectionRange(caret, caret);
    });
  };

  return (
    <form
      className={styles.inputForm}
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <div className={styles.inputRow}>
        <div className={styles.exprInputWrap}>
          <label htmlFor={id} className={styles.fieldLabel}>
            {t('calculus.input.label')}
          </label>
          <input
            ref={inputRef}
            id={id}
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            className={styles.exprInput}
            autoComplete="off"
            spellCheck={false}
          />
        </div>
        <button
          type="submit"
          className={solveBtnClass}
          data-solve-status={feedbackStatus}
          data-solve-seq={feedbackSeq}
        >
          {feedbackStatus === 'success' ? (
            <>
              <CheckIcon />
              <span>{t('calculus.input.solved')}</span>
            </>
          ) : feedbackStatus === 'error' ? (
            <>
              <ErrorIcon />
              <span>{t('calculus.input.solveError')}</span>
            </>
          ) : (
            <span>{t('calculus.input.solve')}</span>
          )}
        </button>
        <span className={styles.srOnly} role="status" aria-live="polite">
          {feedbackStatus === 'success'
            ? t('calculus.input.solvedAria')
            : feedbackStatus === 'error'
              ? t('calculus.input.solveErrorAria')
              : ''}
        </span>
      </div>

      {optionsSlot && <div className={styles.optionsBar}>{optionsSlot}</div>}

      <div className={styles.previewBar} aria-live="polite">
        {preview.ok ? (
          preview.latex ? (
            <div className={styles.previewMath}>
              <KatexSpan text={preview.latex} />
            </div>
          ) : (
            <span className={styles.previewCaption}>{placeholder}</span>
          )
        ) : (
          <span className={styles.previewErr}>{preview.error}</span>
        )}
        <span className={styles.previewCaption}>{t('calculus.input.preview')}</span>
      </div>

      <div className={styles.insertToolbar} role="group" aria-label={t('calculus.input.insertAria')}>
        {QUICK_SYMBOLS.map((sym) => (
          <button
            key={sym.label}
            type="button"
            className={styles.insertBtn}
            onClick={() => insertSnippet(sym.snippet, sym.cursorOffset ?? 0)}
          >
            {sym.label}
          </button>
        ))}
        {value && (
          <button
            type="button"
            className={[styles.btnGhost, styles.btnSmall].join(' ')}
            onClick={() => {
              onChange('');
              inputRef.current?.focus();
            }}
          >
            {t('calculus.input.clear')}
          </button>
        )}
      </div>

      <div className={styles.examplesRow}>
        <span className={styles.examplesLabel}>{t('calculus.input.examples')}:</span>
        {examples.map((ex) => (
          <button
            key={ex.id}
            type="button"
            className={styles.exampleBtn}
            onClick={() => onSelectExample(ex)}
          >
            <span>{ex.label}</span>
            <span className={styles.exampleTag}>{ex.tag}</span>
          </button>
        ))}
      </div>
    </form>
  );
}
