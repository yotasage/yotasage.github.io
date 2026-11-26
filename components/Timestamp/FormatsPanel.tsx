import React from 'react';

import { computeRelativeParts, formatTimestampAll } from '../../lib/timestamp/format';
import { TranslationKey, useI18n } from '../../lib/ui/i18n';
import styles from '../../styles/Timestamp.module.css';

interface FormatsPanelProps {
  epochNs: bigint;
  nowMs: number;
  selectedZone: string;
  quickMode: boolean;
}

interface CopyRowItem {
  id: string;
  label: string;
  value: string;
  hero?: boolean;
}

export default function FormatsPanel({
  epochNs,
  nowMs,
  selectedZone,
  quickMode,
}: FormatsPanelProps) {
  const { locale, t } = useI18n();
  const [copiedId, setCopiedId] = React.useState<string | null>(null);

  const formatted = React.useMemo(
    () => formatTimestampAll(epochNs, selectedZone, locale, true),
    [epochNs, selectedZone, locale],
  );

  const relativeText = React.useMemo(() => {
    const rel = computeRelativeParts(epochNs, nowMs);
    if (rel.relation === 'now') return t('ts.rel.now');
    const primary = t(`ts.rel.unit.${rel.primaryUnit}` as TranslationKey, { n: rel.primaryValue });
    const combined =
      rel.secondaryUnit && rel.secondaryValue
        ? `${primary} ${t(`ts.rel.unit.${rel.secondaryUnit}` as TranslationKey, {
            n: rel.secondaryValue,
          })}`
        : primary;
    return rel.relation === 'past'
      ? t('ts.rel.past', { value: combined })
      : t('ts.rel.future', { value: combined });
  }, [epochNs, nowMs, t]);

  const handleCopy = async (id: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedId(id);
      window.setTimeout(() => {
        setCopiedId((prev) => (prev === id ? null : prev));
      }, 1500);
    } catch {
      // ignore clipboard errors
    }
  };

  const epochRows: readonly CopyRowItem[] = [
    { id: 'unix-s', label: t('ts.formats.unixS'), value: formatted.seconds, hero: true },
    { id: 'unix-ms', label: t('ts.formats.unixMs'), value: formatted.milliseconds },
    { id: 'unix-us', label: t('ts.formats.unixUs'), value: formatted.microseconds },
    { id: 'unix-ns', label: t('ts.formats.unixNs'), value: formatted.nanoseconds },
    { id: 'hex-s', label: t('ts.formats.hexS'), value: formatted.hexSeconds },
  ];

  const standardRows: readonly CopyRowItem[] = [
    { id: 'iso-utc', label: t('ts.formats.isoUtc'), value: formatted.isoUtc, hero: true },
    ...(selectedZone !== 'UTC'
      ? [
          {
            id: 'iso-zoned',
            label: t('ts.formats.isoZoned', { tz: selectedZone }),
            value: formatted.isoZoned,
          },
        ]
      : []),
    { id: 'iso-nano', label: t('ts.formats.isoUtcNano'), value: formatted.isoUtcNano },
    { id: 'rfc2822', label: t('ts.formats.rfc2822'), value: formatted.rfc2822Utc },
    { id: 'sql-utc', label: t('ts.formats.sqlUtc'), value: formatted.sqlUtc },
    {
      id: 'human',
      label: t('ts.formats.humanZoned', { tz: selectedZone }),
      value: formatted.humanZoned,
    },
    { id: 'relative', label: t('ts.formats.relative'), value: relativeText },
  ];

  const altRows: readonly CopyRowItem[] = [
    { id: 'filetime', label: t('ts.formats.filetime'), value: formatted.altEpochs.filetime },
    { id: 'cocoa', label: t('ts.formats.cocoa'), value: formatted.altEpochs.cocoaSeconds },
    { id: 'ntp', label: t('ts.formats.ntp'), value: formatted.altEpochs.ntpSeconds },
    { id: 'gps', label: t('ts.formats.gps'), value: formatted.altEpochs.gpsSeconds },
    { id: 'jd', label: t('ts.formats.jd'), value: formatted.altEpochs.julianDate },
    { id: 'mjd', label: t('ts.formats.mjd'), value: formatted.altEpochs.modifiedJulianDate },
    { id: 'excel', label: t('ts.formats.excel'), value: formatted.altEpochs.excelSerial },
  ];

  const renderRows = (rows: readonly CopyRowItem[]) => (
    <div className={styles.formatList}>
      {rows.map((row) => {
        const isCopied = copiedId === row.id;
        return (
          <div
            key={row.id}
            className={[styles.formatRow, row.hero ? styles.formatRowHero : '']
              .filter(Boolean)
              .join(' ')}
          >
            <span className={styles.formatLabel}>{row.label}</span>
            <span
              className={[styles.formatValue, row.hero ? styles.formatValueHero : '']
                .filter(Boolean)
                .join(' ')}
              data-testid={`fmt-${row.id}`}
            >
              {row.value}
            </span>
            <button
              type="button"
              className={[styles.copyBtn, isCopied ? styles.copyBtnCopied : '']
                .filter(Boolean)
                .join(' ')}
              aria-label={t('ts.formats.copyAria', { label: row.label })}
              onClick={() => handleCopy(row.id, row.value)}
            >
              {isCopied ? t('ts.formats.copied') : t('ts.formats.copy')}
            </button>
          </div>
        );
      })}
    </div>
  );

  const { calendar } = formatted;
  const int32Label =
    calendar.signed32BitStatus === 'safe'
      ? t('ts.meta.int32Safe')
      : calendar.signed32BitStatus === 'positive-overflow'
        ? t('ts.meta.int32Overflow')
        : t('ts.meta.int32Underflow');
  const int32Class =
    calendar.signed32BitStatus === 'safe' ? styles.metaGood : styles.metaBad;

  return (
    <section className={styles.card} aria-labelledby="ts-formats-heading">
      <div className={styles.cardHeader}>
        <div>
          <h2 id="ts-formats-heading" className={styles.cardTitle}>
            {t('ts.formats.title')}
          </h2>
          <p className={styles.cardSub}>{t('ts.formats.sub')}</p>
        </div>
      </div>

      <div className={styles.equalCol}>
        <div>
          <h3 className={styles.formatSectionTitle}>{t('ts.formats.epochGroup')}</h3>
          {renderRows(epochRows)}
        </div>

        <div>
          <h3 className={styles.formatSectionTitle}>{t('ts.formats.standardGroup')}</h3>
          {renderRows(standardRows)}
        </div>
      </div>

      <div className={styles.formatSectionGap}>
        <h3 className={styles.formatSectionTitle}>{t('ts.formats.metaGroup')}</h3>
        <div className={styles.metaGrid}>
          <div className={styles.metaItem}>
            <span className={styles.metaKey}>{t('ts.meta.weekday')}</span>
            <span className={styles.metaVal}>
              {t(`ts.weekday.${calendar.isoWeekday}` as TranslationKey)}
            </span>
          </div>
          <div className={styles.metaItem}>
            <span className={styles.metaKey}>{t('ts.meta.isoWeek')}</span>
            <span className={styles.metaVal}>
              {calendar.isoWeekYear}-W{String(calendar.isoWeek).padStart(2, '0')}
            </span>
          </div>
          <div className={styles.metaItem}>
            <span className={styles.metaKey}>{t('ts.meta.dayOfYear')}</span>
            <span className={styles.metaVal}>
              {calendar.dayOfYear} / {calendar.daysInYear}
            </span>
          </div>
          <div className={styles.metaItem}>
            <span className={styles.metaKey}>{t('ts.meta.quarter')}</span>
            <span className={styles.metaVal}>Q{calendar.quarter}</span>
          </div>
          <div className={styles.metaItem}>
            <span className={styles.metaKey}>{t('ts.meta.leapYear')}</span>
            <span className={styles.metaVal}>
              {calendar.isLeapYear ? t('ts.meta.yes') : t('ts.meta.no')}
            </span>
          </div>
          <div className={styles.metaItem}>
            <span className={styles.metaKey}>{t('ts.meta.int32')}</span>
            <span className={[styles.metaVal, int32Class].join(' ')} data-testid="meta-int32">
              {int32Label}
            </span>
          </div>
        </div>
      </div>

      {!quickMode && (
        <div className={styles.formatSectionGap}>
          <h3 className={styles.formatSectionTitle}>{t('ts.formats.altGroup')}</h3>
          {renderRows(altRows)}
        </div>
      )}
    </section>
  );
}
