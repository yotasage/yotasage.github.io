import { TIMESTAMP_PRESETS } from '../../lib/timestamp/format';
import { NS_PER_SEC } from '../../lib/timestamp/parse';
import { getParseErrorCode } from '../../lib/timestamp/types';
import type { EpochUnit, ParseResult } from '../../lib/timestamp/types';
import { TranslationKey, useI18n } from '../../lib/ui/i18n';
import styles from '../../styles/Timestamp.module.css';

interface SmartInputCardProps {
  rawInput: string;
  unitOverride: EpochUnit;
  parseResult: ParseResult;
  onRawInputChange: (next: string) => void;
  onUnitChange: (unit: EpochUnit) => void;
  onNudgeSeconds: (deltaSec: bigint) => void;
  onSetStartOfDayUtc: () => void;
  onSelectPreset: (epochNs: bigint, displayValue: string) => void;
  onSetNow: () => void;
}

const UNITS: readonly EpochUnit[] = ['auto', 's', 'ms', 'us', 'ns'];

const NUDGES: readonly { label: string; deltaSec: bigint }[] = [
  { label: '-1d', deltaSec: -86_400n },
  { label: '-1h', deltaSec: -3_600n },
  { label: '-15m', deltaSec: -900n },
  { label: '+15m', deltaSec: 900n },
  { label: '+1h', deltaSec: 3_600n },
  { label: '+1d', deltaSec: 86_400n },
  { label: '+7d', deltaSec: 604_800n },
];

export default function SmartInputCard({
  rawInput,
  unitOverride,
  parseResult,
  onRawInputChange,
  onUnitChange,
  onNudgeSeconds,
  onSetStartOfDayUtc,
  onSelectPreset,
  onSetNow,
}: SmartInputCardProps) {
  const { t } = useI18n();
  const inputId = 'ts-smart-input';

  const errorCode = getParseErrorCode(parseResult);
  const errorMessage = errorCode
    ? t(`ts.error.${errorCode}` as TranslationKey)
    : null;

  const detectedLabel = parseResult.ok
    ? parseResult.isNumericEpoch && parseResult.digitCount !== undefined
      ? t('ts.input.detectedDigits', {
          kind: t(`ts.kind.${parseResult.detectedKind}` as TranslationKey),
          digits: parseResult.digitCount,
        })
      : t('ts.input.detected', {
          kind: t(`ts.kind.${parseResult.detectedKind}` as TranslationKey),
        })
    : null;

  return (
    <section className={styles.card} aria-labelledby="ts-input-heading">
      <div className={styles.cardHeader}>
        <div>
          <h2 id="ts-input-heading" className={styles.cardTitle}>
            {t('ts.input.title')}
          </h2>
          <p className={styles.cardSub}>{t('ts.input.sub')}</p>
        </div>

        <div className={styles.segmented} role="group" aria-label={t('ts.input.unitAria')}>
          {UNITS.map((unit) => {
            const active = unitOverride === unit;
            return (
              <button
                key={unit}
                type="button"
                className={[styles.segBtn, active ? styles.segBtnActive : ''].filter(Boolean).join(' ')}
                aria-pressed={active}
                onClick={() => onUnitChange(unit)}
              >
                {t(`ts.input.unit.${unit}` as TranslationKey)}
              </button>
            );
          })}
        </div>
      </div>

      <div className={styles.inputRow}>
        <label htmlFor={inputId} className="sr-only" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0,0,0,0)' }}>
          {t('ts.input.label')}
        </label>
        <input
          id={inputId}
          type="text"
          value={rawInput}
          onChange={(e) => onRawInputChange(e.target.value)}
          placeholder={t('ts.input.placeholder')}
          aria-invalid={!parseResult.ok}
          aria-describedby={errorMessage ? 'ts-input-error' : 'ts-input-status'}
          className={[styles.primaryInput, !parseResult.ok ? styles.inputErrorState : '']
            .filter(Boolean)
            .join(' ')}
          spellCheck={false}
          autoComplete="off"
        />
        <div className={styles.inputActionRow}>
          <button type="button" className={styles.button} onClick={onSetNow}>
            {t('ts.input.now')}
          </button>
          <button
            type="button"
            className={styles.button}
            onClick={() => onRawInputChange('')}
            disabled={rawInput.length === 0}
          >
            {t('ts.input.clear')}
          </button>
        </div>
      </div>

      {errorMessage ? (
        <p id="ts-input-error" className={styles.errorBanner} role="alert">
          {errorMessage}
        </p>
      ) : (
        <div className={styles.statusRow}>
          <p id="ts-input-status" className={styles.detectedNote} role="status" aria-live="polite">
            {detectedLabel}
          </p>
        </div>
      )}

      <div className={styles.toolbarBlock}>
        <div className={styles.toolbarLine}>
          <span className={styles.toolbarLabel}>{t('ts.input.nudgeLabel')}</span>
          {NUDGES.map((n) => (
            <button
              key={n.label}
              type="button"
              className={styles.buttonSmall}
              onClick={() => onNudgeSeconds(n.deltaSec)}
            >
              {n.label}
            </button>
          ))}
          <button type="button" className={styles.buttonSmall} onClick={onSetStartOfDayUtc}>
            {t('ts.input.startOfDay')}
          </button>
        </div>

        <div className={styles.toolbarLine}>
          <span className={styles.toolbarLabel}>{t('ts.input.presetsLabel')}</span>
          {TIMESTAMP_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className={styles.buttonSmall}
              onClick={() => onSelectPreset(preset.epochNs, preset.displayValue)}
              title={`${preset.displayValue} s (${Number(preset.epochNs / NS_PER_SEC)} s)`}
            >
              {t(`ts.preset.${preset.id}` as TranslationKey)}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
