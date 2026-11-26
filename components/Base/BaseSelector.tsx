import React from 'react';

import {
  CORE_PRESETS,
  EXTENDED_PRESETS,
  findPresetForSpec,
  MAX_RADIX,
  MIN_RADIX,
} from '../../lib/base/presets';
import type { AlphabetId, BaseSpec } from '../../lib/base/types';
import { TranslationKey, useI18n } from '../../lib/ui/i18n';
import styles from '../../styles/BaseConverter.module.css';

interface BaseSelectorProps {
  idPrefix: string;
  spec: BaseSpec;
  onChange: (next: BaseSpec) => void;
}

export function getBaseDisplayName(
  spec: BaseSpec,
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string,
): string {
  const preset = findPresetForSpec(spec);
  if (preset) {
    return t(`base.name.${preset.id}` as TranslationKey);
  }
  return t('base.name.custom', { radix: spec.radix });
}

export default function BaseSelector({ idPrefix, spec, onChange }: BaseSelectorProps) {
  const { t } = useI18n();
  const [radixDraft, setRadixDraft] = React.useState(String(spec.radix));

  React.useEffect(() => {
    setRadixDraft(String(spec.radix));
  }, [spec.radix]);

  const activePreset = findPresetForSpec(spec);
  const extendedValue = activePreset && activePreset.tier === 'extended' ? activePreset.id : '';

  const commitRadix = (nextRadix: number) => {
    const clamped = Math.max(MIN_RADIX, Math.min(MAX_RADIX, Math.trunc(nextRadix)));
    // Keep named alphabet only if still valid for that radix
    let alphabetId: AlphabetId = 'standard';
    if (clamped === 58 && spec.alphabetId === 'base58') alphabetId = 'base58';
    else if (clamped === 64 && spec.alphabetId === 'rfc4648') alphabetId = 'rfc4648';
    else if (clamped === 32 && spec.alphabetId === 'crockford32') alphabetId = 'crockford32';
    onChange({ radix: clamped, alphabetId });
  };

  return (
    <div className={styles.selectorWrap}>
      <div className={styles.presetRow} role="group" aria-label={t('base.anyBaseLabel')}>
        {CORE_PRESETS.map((preset) => {
          const isActive =
            spec.radix === preset.radix && spec.alphabetId === preset.alphabetId;
          return (
            <button
              key={preset.id}
              type="button"
              className={[styles.presetBtn, isActive ? styles.presetBtnActive : '']
                .filter(Boolean)
                .join(' ')}
              aria-pressed={isActive}
              onClick={() => onChange({ radix: preset.radix, alphabetId: preset.alphabetId })}
            >
              <span>{t(`base.name.${preset.id}` as TranslationKey)}</span>
              <span className={styles.presetBtnSub}>{preset.radix}</span>
            </button>
          );
        })}
      </div>

      <div className={styles.customControlsRow}>
        <select
          id={`${idPrefix}-preset-select`}
          className={styles.presetSelect}
          aria-label={t('base.morePresets')}
          value={extendedValue}
          onChange={(e) => {
            const found = EXTENDED_PRESETS.find((p) => p.id === e.target.value);
            if (found) {
              onChange({ radix: found.radix, alphabetId: found.alphabetId });
            }
          }}
        >
          <option value="">{t('base.morePresets')}</option>
          {EXTENDED_PRESETS.map((preset) => (
            <option key={preset.id} value={preset.id}>
              Base {preset.radix} — {t(`base.name.${preset.id}` as TranslationKey)}
            </option>
          ))}
        </select>

        <div className={styles.radixStepper}>
          <label htmlFor={`${idPrefix}-radix-input`} className={styles.radixStepperLabel}>
            {t('base.anyBaseLabel')}
          </label>
          <button
            type="button"
            className={styles.stepBtn}
            aria-label={t('base.decrementBase')}
            disabled={spec.radix <= MIN_RADIX}
            onClick={() => commitRadix(spec.radix - 1)}
          >
            −
          </button>
          <input
            id={`${idPrefix}-radix-input`}
            type="number"
            inputMode="numeric"
            min={MIN_RADIX}
            max={MAX_RADIX}
            value={radixDraft}
            aria-label={t('base.anyBaseAria')}
            className={styles.radixNumberInput}
            onChange={(e) => {
              const raw = e.target.value;
              setRadixDraft(raw);
              const parsed = Number(raw);
              if (Number.isInteger(parsed) && parsed >= MIN_RADIX && parsed <= MAX_RADIX) {
                commitRadix(parsed);
              }
            }}
            onBlur={() => {
              const parsed = Number(radixDraft);
              if (Number.isFinite(parsed)) {
                commitRadix(parsed);
              } else {
                setRadixDraft(String(spec.radix));
              }
            }}
          />
          <button
            type="button"
            className={styles.stepBtn}
            aria-label={t('base.incrementBase')}
            disabled={spec.radix >= MAX_RADIX}
            onClick={() => commitRadix(spec.radix + 1)}
          >
            +
          </button>
        </div>
      </div>
    </div>
  );
}
