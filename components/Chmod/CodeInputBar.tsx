import React from 'react';

import type { ParseErrorCode } from '../../lib/chmod/types';
import { useI18n } from '../../lib/ui/i18n';
import styles from '../../styles/Chmod.module.css';

interface CodeInputBarProps {
  value: string;
  errorCode: ParseErrorCode | null;
  errorDetail?: string;
  appliedNote: string | null;
  onChange: (next: string) => void;
  onApply: () => void;
  onReset: () => void;
}

export default function CodeInputBar({
  value,
  errorCode,
  errorDetail,
  appliedNote,
  onChange,
  onApply,
  onReset,
}: CodeInputBarProps) {
  const { t } = useI18n();
  const inputId = React.useId();
  const errorId = React.useId();
  const hintId = React.useId();

  const errorMessage = errorCode
    ? t(`chmod.decode.error.${errorCode}` as const, errorDetail ? { detail: errorDetail } : undefined)
    : null;

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onApply();
  };

  return (
    <section className={styles.decodeCard} aria-labelledby={`${inputId}-heading`}>
      <div className={styles.decodeHeader}>
        <div className={styles.decodeHeaderText}>
          <h2 id={`${inputId}-heading`} className={styles.cardTitle}>
            {t('chmod.decode.title')}
          </h2>
          <label htmlFor={inputId} className={styles.decodeSubLabel}>
            {t('chmod.decode.label')}
          </label>
        </div>
        <button type="button" className={styles.buttonSmall} onClick={onReset}>
          {t('chmod.decode.reset')}
        </button>
      </div>

      <form className={styles.decodeForm} onSubmit={handleSubmit} noValidate>

        <div className={styles.decodeRow}>
          <div className={styles.decodeInputWrap}>
            <input
              id={inputId}
              type="text"
              inputMode="text"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              value={value}
              onChange={(event) => onChange(event.target.value)}
              placeholder={t('chmod.decode.placeholder')}
              aria-invalid={errorMessage ? true : undefined}
              aria-describedby={errorMessage ? `${errorId} ${hintId}` : hintId}
              className={[styles.decodeInput, errorMessage ? styles.decodeInputError : '']
                .filter(Boolean)
                .join(' ')}
            />
          </div>
          <div className={styles.decodeActions}>
            <button type="submit" className={styles.primaryButton}>
              {t('chmod.decode.apply')}
            </button>
          </div>
        </div>

        {errorMessage ? (
          <p id={errorId} className={styles.decodeError} role="alert">
            {errorMessage}
          </p>
        ) : appliedNote ? (
          <p className={styles.decodeStatus} role="status" aria-live="polite">
            {appliedNote}
          </p>
        ) : null}

        <p id={hintId} className={styles.decodeHint}>
          {t('chmod.decode.hint')}
        </p>
      </form>
    </section>
  );
}
