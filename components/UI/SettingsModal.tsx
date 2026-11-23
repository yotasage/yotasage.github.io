import React, { useCallback, useEffect, useRef, useState } from 'react';

import { useI18n } from '../../lib/ui/i18n';
import {
  DEFAULT_MATH_SCALE,
  MATH_SCALE_PRESETS,
  MAX_MATH_SCALE,
  MIN_MATH_SCALE,
  parseMathScaleInput,
} from '../../lib/ui/mathFormat';
import { useMathSettings } from '../../lib/ui/mathSettings';
import styles from '../../styles/SettingsModal.module.css';
import KatexSpan from '../KatexSpan';

export interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  triggerRef?: React.RefObject<HTMLButtonElement | null>;
}

const PREVIEW_INLINE_TEX = '\\frac{d}{dx}\\left(\\frac{x^2 + 1}{2x}\\right) = \\frac{x^2 - 1}{2x^2}';
const PREVIEW_DISPLAY_TEX = '\\int x\\,e^{x^2}\\,dx = \\frac{e^{x^2}}{2} + C';

function GearIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
    </svg>
  );
}

export default function SettingsModal({ open, onClose, triggerRef }: SettingsModalProps) {
  const { t } = useI18n();
  const {
    mathScale,
    setMathScale,
    fullSizeFractions,
    setFullSizeFractions,
    resetMathSettings,
    isDefault,
  } = useMathSettings();

  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const wasOpenRef = useRef(false);
  const [customDraft, setCustomDraft] = useState<string>(String(mathScale));

  useEffect(() => {
    setCustomDraft(String(mathScale));
  }, [mathScale, open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open) {
      if (!dialog.open) {
        dialog.showModal();
      }
      wasOpenRef.current = true;
    } else {
      if (dialog.open) {
        dialog.close();
      }
      if (wasOpenRef.current) {
        wasOpenRef.current = false;
        const trigger = triggerRef?.current;
        if (trigger && trigger.isConnected) {
          trigger.focus();
        }
      }
    }
  }, [open, triggerRef]);

  const handleDialogClose = useCallback(() => {
    if (open) onClose();
  }, [open, onClose]);

  const handleBackdropClick = useCallback(
    (event: React.MouseEvent<HTMLDialogElement>) => {
      if (event.target === dialogRef.current) {
        onClose();
      }
    },
    [onClose],
  );

  const commitCustomInput = useCallback(
    (raw: string) => {
      const parsed = parseMathScaleInput(raw);
      if (parsed !== null) {
        setMathScale(parsed);
        setCustomDraft(String(parsed));
      } else {
        setCustomDraft(String(mathScale));
      }
    },
    [mathScale, setMathScale],
  );

  const handleCustomChange = (nextRaw: string) => {
    setCustomDraft(nextRaw);
    const cleaned = nextRaw.trim().replace(/%$/, '').trim();
    if (/^\d+$/.test(cleaned)) {
      const num = Number(cleaned);
      if (num >= MIN_MATH_SCALE && num <= MAX_MATH_SCALE) {
        setMathScale(num);
      }
    }
  };

  const sliderValue = Math.min(250, Math.max(MIN_MATH_SCALE, mathScale));

  return (
    <dialog
      ref={dialogRef}
      data-ds="v2"
      className={styles.dialog}
      aria-labelledby="settings-modal-title"
      onClose={handleDialogClose}
      onClick={handleBackdropClick}
      onKeyDown={(event) => event.stopPropagation()}
    >
      {open && (
        <div className={styles.surface}>
          <header className={styles.header}>
            <div className={styles.headingGroup}>
              <span className={styles.headingIcon} aria-hidden="true">
                <GearIcon />
              </span>
              <div>
                <h2 id="settings-modal-title" className={styles.title}>
                  {t('settings.title')}
                </h2>
                <p className={styles.subtitle}>{t('settings.subtitle')}</p>
              </div>
            </div>
            <button
              type="button"
              className={styles.closeBtn}
              onClick={onClose}
              aria-label={t('common.close')}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M18 6 6 18" />
                <path d="m6 6 12 12" />
              </svg>
            </button>
          </header>

          <div className={styles.body}>
            <section className={styles.section} aria-labelledby="settings-math-size-heading">
              <div className={styles.sectionHeader}>
                <h3 id="settings-math-size-heading" className={styles.sectionTitle}>
                  {t('settings.mathSize.title')}
                </h3>
                <span className={styles.currentValue} data-testid="settings-math-scale-value">
                  {mathScale}%
                </span>
              </div>
              <p className={styles.sectionDesc}>{t('settings.mathSize.desc')}</p>

              <div className={styles.presetRow} role="group" aria-label={t('settings.mathSize.presetsAria')}>
                {MATH_SCALE_PRESETS.map((preset) => {
                  const active = mathScale === preset;
                  return (
                    <button
                      key={preset}
                      type="button"
                      aria-pressed={active}
                      className={[styles.presetBtn, active ? styles.presetBtnActive : '']
                        .filter(Boolean)
                        .join(' ')}
                      onClick={() => setMathScale(preset)}
                    >
                      <span>{preset}%</span>
                      {preset === DEFAULT_MATH_SCALE && (
                        <span className={styles.presetDefaultTag}>{t('settings.mathSize.defaultTag')}</span>
                      )}
                    </button>
                  );
                })}
              </div>

              <div className={styles.customRow}>
                <input
                  type="range"
                  min={MIN_MATH_SCALE}
                  max={250}
                  step={5}
                  value={sliderValue}
                  onChange={(e) => setMathScale(Number(e.target.value))}
                  aria-label={t('settings.mathSize.sliderAria')}
                  className={styles.slider}
                />
                <div className={styles.customInputWrap}>
                  <label htmlFor="settings-math-custom-input" className={styles.customLabel}>
                    {t('settings.mathSize.customLabel')}
                  </label>
                  <span className={styles.numberBox}>
                    <input
                      id="settings-math-custom-input"
                      type="number"
                      inputMode="numeric"
                      min={MIN_MATH_SCALE}
                      max={MAX_MATH_SCALE}
                      step={5}
                      value={customDraft}
                      onChange={(e) => handleCustomChange(e.target.value)}
                      onBlur={() => commitCustomInput(customDraft)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          commitCustomInput(customDraft);
                        }
                      }}
                      className={styles.numberInput}
                    />
                    <span className={styles.percentSuffix} aria-hidden="true">
                      %
                    </span>
                  </span>
                </div>
              </div>
              <p className={styles.rangeHint}>
                {t('settings.mathSize.rangeHint', { min: MIN_MATH_SCALE, max: MAX_MATH_SCALE })}
              </p>
            </section>

            <section className={styles.section} aria-label={t('settings.fractions.title')}>
              <label className={styles.toggleCard}>
                <span className={styles.toggleText}>
                  <span className={styles.toggleTitle}>{t('settings.fractions.title')}</span>
                  <span className={styles.toggleDesc}>{t('settings.fractions.desc')}</span>
                </span>
                <input
                  type="checkbox"
                  checked={fullSizeFractions}
                  onChange={(e) => setFullSizeFractions(e.target.checked)}
                  className={styles.toggleCheckbox}
                />
              </label>
            </section>

            <section className={styles.previewCard} aria-label={t('settings.preview.label')}>
              <span className={styles.previewLabel}>{t('settings.preview.label')}</span>
              <p className={styles.previewInline}>
                {t('settings.preview.inlineLead')}{' '}
                <KatexSpan text={PREVIEW_INLINE_TEX} />
              </p>
              <div className={styles.previewDisplay}>
                <KatexSpan text={PREVIEW_DISPLAY_TEX} displayMode />
              </div>
            </section>
          </div>

          <footer className={styles.footer}>
            <button
              type="button"
              className={styles.resetBtn}
              disabled={isDefault}
              onClick={resetMathSettings}
            >
              {t('settings.reset')}
            </button>
            <button type="button" className={styles.doneBtn} onClick={onClose}>
              {t('common.close')}
            </button>
          </footer>
        </div>
      )}
    </dialog>
  );
}
