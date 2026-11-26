import React from 'react';

import { formatTimestampAll } from '../../lib/timestamp/format';
import { applyOffset, computeDuration } from '../../lib/timestamp/math';
import { floorDivBigInt, NS_PER_SEC, parseTimestampInput } from '../../lib/timestamp/parse';
import { getParseErrorCode } from '../../lib/timestamp/types';
import type { OffsetSpec } from '../../lib/timestamp/types';
import { TranslationKey, useI18n } from '../../lib/ui/i18n';
import styles from '../../styles/Timestamp.module.css';

interface DifferencePanelProps {
  currentEpochNs: bigint;
  nowMs: number;
  selectedZone: string;
  onOpenInConverter: (epochNs: bigint) => void;
}

const ZERO_OFFSET: OffsetSpec = {
  sign: 1,
  years: 0,
  months: 0,
  weeks: 0,
  days: 1,
  hours: 0,
  minutes: 0,
  seconds: 0,
};

function formatCompactNumber(n: number): string {
  if (!Number.isFinite(n)) return '—';
  if (Math.abs(n - Math.round(n)) < 1e-6) {
    return Math.round(n).toLocaleString('en-US');
  }
  return n.toLocaleString('en-US', { maximumFractionDigits: 4 });
}

export default function DifferencePanel({
  currentEpochNs,
  nowMs,
  selectedZone,
  onOpenInConverter,
}: DifferencePanelProps) {
  const { locale, t } = useI18n();

  const [startRaw, setStartRaw] = React.useState('1700000000');
  const [endRaw, setEndRaw] = React.useState('1700086400');

  const [baseRaw, setBaseRaw] = React.useState(() =>
    floorDivBigInt(currentEpochNs, NS_PER_SEC).toString(),
  );
  const [offset, setOffset] = React.useState<OffsetSpec>(ZERO_OFFSET);
  const [copiedId, setCopiedId] = React.useState<string | null>(null);

  const startParsed = React.useMemo(() => parseTimestampInput(startRaw, 'auto'), [startRaw]);
  const endParsed = React.useMemo(() => parseTimestampInput(endRaw, 'auto'), [endRaw]);
  const duration = React.useMemo(() => {
    if (!startParsed.ok || !endParsed.ok) return null;
    return computeDuration(startParsed.epochNs, endParsed.epochNs);
  }, [startParsed, endParsed]);

  const baseParsed = React.useMemo(() => parseTimestampInput(baseRaw, 'auto'), [baseRaw]);
  const shiftedNs = React.useMemo(() => {
    if (!baseParsed.ok) return null;
    return applyOffset(baseParsed.epochNs, offset);
  }, [baseParsed, offset]);
  const shiftedFormatted = React.useMemo(
    () => (shiftedNs !== null ? formatTimestampAll(shiftedNs, selectedZone, locale, true) : null),
    [shiftedNs, selectedZone, locale],
  );

  const handleSwap = () => {
    setStartRaw(endRaw);
    setEndRaw(startRaw);
  };

  const handleOffsetField = (field: keyof Omit<OffsetSpec, 'sign'>, raw: string) => {
    const parsed = Math.max(0, Math.min(100_000, Math.trunc(Number(raw) || 0)));
    setOffset((prev) => ({ ...prev, [field]: parsed }));
  };

  const handleCopy = async (id: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedId(id);
      window.setTimeout(() => setCopiedId((p) => (p === id ? null : p)), 1500);
    } catch {
      // ignore clipboard errors
    }
  };

  const nowSecStr = String(Math.floor(nowMs / 1000));
  const currentSecStr = floorDivBigInt(currentEpochNs, NS_PER_SEC).toString();

  return (
    <div className={styles.stack}>
      {/* Duration between two timestamps */}
      <section className={styles.card} aria-labelledby="ts-diff-heading">
        <div className={styles.cardHeader}>
          <div>
            <h2 id="ts-diff-heading" className={styles.cardTitle}>
              {t('ts.diff.title')}
            </h2>
            <p className={styles.cardSub}>{t('ts.diff.sub')}</p>
          </div>
        </div>

        <div className={styles.diffInputsGrid}>
          <div className={styles.diffInputGroup}>
            <div className={styles.diffInputHead}>
              <label htmlFor="ts-diff-start" className={styles.fieldLabel}>
                {t('ts.diff.startLabel')}
              </label>
              <div className={styles.rowActions}>
                <button
                  type="button"
                  className={styles.buttonSmall}
                  onClick={() => setStartRaw(currentSecStr)}
                >
                  {t('ts.diff.useCurrent')}
                </button>
                <button
                  type="button"
                  className={styles.buttonSmall}
                  onClick={() => setStartRaw(nowSecStr)}
                >
                  {t('ts.diff.setNow')}
                </button>
              </div>
            </div>
            <input
              id="ts-diff-start"
              type="text"
              className={[styles.textInput, !startParsed.ok ? styles.inputErrorState : '']
                .filter(Boolean)
                .join(' ')}
              value={startRaw}
              onChange={(e) => setStartRaw(e.target.value)}
              spellCheck={false}
            />
          </div>

          <button type="button" className={styles.button} onClick={handleSwap}>
            ⇄ {t('ts.diff.swap')}
          </button>

          <div className={styles.diffInputGroup}>
            <div className={styles.diffInputHead}>
              <label htmlFor="ts-diff-end" className={styles.fieldLabel}>
                {t('ts.diff.endLabel')}
              </label>
              <div className={styles.rowActions}>
                <button
                  type="button"
                  className={styles.buttonSmall}
                  onClick={() => setEndRaw(currentSecStr)}
                >
                  {t('ts.diff.useCurrent')}
                </button>
                <button
                  type="button"
                  className={styles.buttonSmall}
                  onClick={() => setEndRaw(nowSecStr)}
                >
                  {t('ts.diff.setNow')}
                </button>
              </div>
            </div>
            <input
              id="ts-diff-end"
              type="text"
              className={[styles.textInput, !endParsed.ok ? styles.inputErrorState : '']
                .filter(Boolean)
                .join(' ')}
              value={endRaw}
              onChange={(e) => setEndRaw(e.target.value)}
              spellCheck={false}
            />
          </div>
        </div>

        {getParseErrorCode(startParsed) && (
          <p className={styles.errorBanner} role="alert">
            {t(`ts.error.${getParseErrorCode(startParsed)}` as TranslationKey)}
          </p>
        )}
        {startParsed.ok && getParseErrorCode(endParsed) && (
          <p className={styles.errorBanner} role="alert">
            {t(`ts.error.${getParseErrorCode(endParsed)}` as TranslationKey)}
          </p>
        )}

        {duration && (
          <>
            <div className={styles.diffSummaryHero}>
              <div>
                <div className={styles.metaKey}>{t('ts.diff.breakdown')}</div>
                <div className={styles.diffSummaryValue} data-testid="diff-summary">
                  {duration.negative ? '−' : ''}
                  {t('ts.diff.summaryText', {
                    days: duration.days,
                    hours: duration.hours,
                    minutes: duration.minutes,
                    seconds: duration.seconds,
                  })}
                  {duration.milliseconds > 0 ? `.${String(duration.milliseconds).padStart(3, '0')}` : ''}
                </div>
                {duration.negative && <div className={styles.subMeta}>{t('ts.diff.negativeNote')}</div>}
              </div>

              <div className={styles.rowActions}>
                <span className={styles.monoCell} data-testid="diff-iso-duration">
                  {duration.isoDuration}
                </span>
                <button
                  type="button"
                  className={[styles.copyBtn, copiedId === 'iso-dur' ? styles.copyBtnCopied : '']
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => handleCopy('iso-dur', duration.isoDuration)}
                >
                  {copiedId === 'iso-dur' ? t('ts.formats.copied') : t('ts.formats.copy')}
                </button>
              </div>
            </div>

            <div className={styles.diffStatsGrid}>
              <div className={styles.metaItem}>
                <span className={styles.metaKey}>{t('ts.diff.totalDays')}</span>
                <span className={styles.metaVal}>{formatCompactNumber(duration.totalDays)}</span>
              </div>
              <div className={styles.metaItem}>
                <span className={styles.metaKey}>{t('ts.diff.totalHours')}</span>
                <span className={styles.metaVal}>{formatCompactNumber(duration.totalHours)}</span>
              </div>
              <div className={styles.metaItem}>
                <span className={styles.metaKey}>{t('ts.diff.totalMinutes')}</span>
                <span className={styles.metaVal}>{formatCompactNumber(duration.totalMinutes)}</span>
              </div>
              <div className={styles.metaItem}>
                <span className={styles.metaKey}>{t('ts.diff.totalSeconds')}</span>
                <span className={styles.metaVal}>{formatCompactNumber(duration.totalSeconds)}</span>
              </div>
              <div className={styles.metaItem}>
                <span className={styles.metaKey}>{t('ts.diff.totalMs')}</span>
                <span className={styles.metaVal}>{formatCompactNumber(duration.totalMilliseconds)}</span>
              </div>
              <div className={styles.metaItem}>
                <span className={styles.metaKey}>{t('ts.diff.isoDuration')}</span>
                <span className={styles.metaVal}>{duration.isoDuration}</span>
              </div>
            </div>
          </>
        )}
      </section>

      {/* Timestamp Offset / Math Calculator */}
      <section className={styles.card} aria-labelledby="ts-math-heading">
        <div className={styles.cardHeader}>
          <div>
            <h2 id="ts-math-heading" className={styles.cardTitle}>
              {t('ts.math.title')}
            </h2>
            <p className={styles.cardSub}>{t('ts.math.sub')}</p>
          </div>

          <div className={styles.segmented} role="group" aria-label={t('ts.math.operation')}>
            <button
              type="button"
              className={[styles.segBtn, offset.sign === 1 ? styles.segBtnActive : '']
                .filter(Boolean)
                .join(' ')}
              aria-pressed={offset.sign === 1}
              onClick={() => setOffset((prev) => ({ ...prev, sign: 1 }))}
            >
              {t('ts.math.add')}
            </button>
            <button
              type="button"
              className={[styles.segBtn, offset.sign === -1 ? styles.segBtnActive : '']
                .filter(Boolean)
                .join(' ')}
              aria-pressed={offset.sign === -1}
              onClick={() => setOffset((prev) => ({ ...prev, sign: -1 }))}
            >
              {t('ts.math.subtract')}
            </button>
          </div>
        </div>

        <div className={styles.diffInputGroup}>
          <div className={styles.diffInputHead}>
            <label htmlFor="ts-math-base" className={styles.fieldLabel}>
              {t('ts.math.baseLabel')}
            </label>
            <div className={styles.rowActions}>
              <button
                type="button"
                className={styles.buttonSmall}
                onClick={() => setBaseRaw(currentSecStr)}
              >
                {t('ts.diff.useCurrent')}
              </button>
              <button
                type="button"
                className={styles.buttonSmall}
                onClick={() => setBaseRaw(nowSecStr)}
              >
                {t('ts.diff.setNow')}
              </button>
              <button
                type="button"
                className={styles.buttonSmall}
                onClick={() =>
                  setOffset((prev) => ({
                    ...prev,
                    years: 0,
                    months: 0,
                    weeks: 0,
                    days: 0,
                    hours: 0,
                    minutes: 0,
                    seconds: 0,
                  }))
                }
              >
                {t('ts.math.resetDelta')}
              </button>
            </div>
          </div>
          <input
            id="ts-math-base"
            type="text"
            className={[styles.textInput, !baseParsed.ok ? styles.inputErrorState : '']
              .filter(Boolean)
              .join(' ')}
            value={baseRaw}
            onChange={(e) => setBaseRaw(e.target.value)}
            spellCheck={false}
          />
        </div>

        <div className={styles.deltaFieldsGrid}>
          {(['years', 'months', 'weeks', 'days', 'hours', 'minutes', 'seconds'] as const).map(
            (unit) => (
              <div key={unit} className={styles.field}>
                <label htmlFor={`ts-delta-${unit}`} className={styles.fieldLabel}>
                  {t(`ts.math.${unit}` as TranslationKey)}
                </label>
                <input
                  id={`ts-delta-${unit}`}
                  type="number"
                  min={0}
                  max={100000}
                  className={styles.numInput}
                  value={offset[unit]}
                  onChange={(e) => handleOffsetField(unit, e.target.value)}
                />
              </div>
            ),
          )}
        </div>

        {getParseErrorCode(baseParsed) && (
          <p className={styles.errorBanner} role="alert">
            {t(`ts.error.${getParseErrorCode(baseParsed)}` as TranslationKey)}
          </p>
        )}

        {shiftedNs !== null && shiftedFormatted && (
          <div className={styles.mathResultBox}>
            <div>
              <div className={styles.metaKey}>{t('ts.math.resultTitle')}</div>
              <div className={styles.diffSummaryValue} data-testid="math-result-iso">
                {shiftedFormatted.isoUtc}
              </div>
              <div className={styles.subMeta}>
                Unix (s): {shiftedFormatted.seconds} · {selectedZone}: {shiftedFormatted.isoZoned}
              </div>
            </div>

            <div className={styles.rowActions}>
              <button
                type="button"
                className={[styles.copyBtn, copiedId === 'math-sec' ? styles.copyBtnCopied : '']
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => handleCopy('math-sec', shiftedFormatted.seconds)}
              >
                {copiedId === 'math-sec' ? t('ts.formats.copied') : t('ts.live.copySec')}
              </button>
              <button
                type="button"
                className={styles.primaryButton}
                onClick={() => onOpenInConverter(shiftedNs)}
              >
                {t('ts.math.openInConverter')}
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
