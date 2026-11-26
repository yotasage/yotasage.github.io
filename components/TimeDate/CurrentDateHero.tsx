import { useCallback, useState } from 'react';

import { formatClockTime, formatUtcOffset, getDateDetails, pad2 } from '../../lib/timedate/format';
import type { CalendarDate } from '../../lib/timedate/types';
import { useI18n } from '../../lib/ui/i18n';
import styles from '../../styles/TimeDate.module.css';

interface CurrentDateHeroProps {
  now: Date | null;
  today: CalendarDate;
  use24Hour: boolean;
  onUse24HourChange: (val: boolean) => void;
  timezoneName: string;
}

export default function CurrentDateHero({
  now,
  today,
  use24Hour,
  onUse24HourChange,
  timezoneName,
}: CurrentDateHeroProps) {
  const { locale, t } = useI18n();
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const details = getDateDetails(today, locale);
  const timeText = now ? formatClockTime(now, use24Hour) : '--:--:--';
  const offsetText = now ? formatUtcOffset(now) : '';

  const copyValue = useCallback(async (id: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedId(id);
      window.setTimeout(() => {
        setCopiedId((cur) => (cur === id ? null : cur));
      }, 1500);
    } catch {
      // Clipboard unavailable in restricted contexts
    }
  }, []);

  const formats = [
    { id: 'iso', label: t('timedate.format.iso'), value: details.isoDate },
    { id: 'ordinal', label: t('timedate.format.ordinal'), value: details.ordinalDate },
    { id: 'dot', label: t('timedate.format.dot'), value: details.dotDate },
  ];

  const heroHeadline =
    locale === 'nb'
      ? `${details.dayName}, ${details.dotDate}`
      : `${details.dayName}, ${details.ordinalDate}`;

  return (
    <section className={styles.heroCard} aria-label={t('timedate.nowHeading')}>
      <div className={styles.heroTop}>
        <div className={styles.clockBlock}>
          <span className={styles.heroEyebrow}>{t('timedate.nowHeading')}</span>
          <div className={styles.clockRow}>
            <time
              className={styles.clockDigits}
              dateTime={now ? now.toISOString() : details.isoDate}
              aria-label={t('timedate.localTimeAria')}
              data-testid="live-clock"
            >
              {timeText}
            </time>
            <div className={[styles.segmented, 'ds-no-print'].join(' ')} role="group" aria-label={t('timedate.clockFormatAria')}>
              <button
                type="button"
                className={[styles.segBtnCompact, use24Hour ? styles.segBtnActive : ''].filter(Boolean).join(' ')}
                aria-pressed={use24Hour}
                onClick={() => onUse24HourChange(true)}
              >
                {t('timedate.toggle24h')}
              </button>
              <button
                type="button"
                className={[styles.segBtnCompact, !use24Hour ? styles.segBtnActive : ''].filter(Boolean).join(' ')}
                aria-pressed={!use24Hour}
                onClick={() => onUse24HourChange(false)}
              >
                {t('timedate.toggle12h')}
              </button>
            </div>
          </div>
          <div className={styles.timezoneMeta}>
            {timezoneName && <span>{timezoneName}</span>}
            {timezoneName && offsetText && <span className={styles.metaSep} aria-hidden="true">·</span>}
            {offsetText && <span className={styles.monoInline}>{offsetText}</span>}
          </div>
        </div>

        <div className={styles.dateHeadlineBlock}>
          <h2 className={styles.dateHeadline} data-testid="current-date-headline">
            {heroHeadline}
          </h2>
          <div className={styles.dateSubMeta}>
            <span>{t('timedate.dayOfYear', { day: details.dayOfYear, total: details.daysInYear })}</span>
            <span className={styles.metaSep} aria-hidden="true">·</span>
            <span>{t('timedate.quarter', { quarter: details.quarter })}</span>
            <span className={styles.metaSep} aria-hidden="true">·</span>
            <span className={styles.monoInline}>{details.isoWeekDate}</span>
          </div>
        </div>
      </div>

      {/* Explicit Day (number + name), Month (number + name), Year, and Week */}
      <div className={styles.componentsStrip} data-testid="date-components">
        <div className={styles.componentCell}>
          <span className={styles.componentLabel}>{t('timedate.field.day')}</span>
          <span className={styles.componentValue}>
            <span className={styles.componentNum}>{details.dayNumber}</span>
            <span>{details.dayName}</span>
          </span>
          <span className={styles.componentSub}>
            {t('timedate.dayOfYear', { day: details.dayOfYear, total: details.daysInYear })}
          </span>
        </div>

        <div className={styles.componentCell}>
          <span className={styles.componentLabel}>{t('timedate.field.month')}</span>
          <span className={styles.componentValue}>
            <span className={styles.componentNum}>{pad2(details.monthNumber)}</span>
            <span>{details.monthName}</span>
          </span>
          <span className={styles.componentSub}>
            {t('timedate.quarter', { quarter: details.quarter })}
          </span>
        </div>

        <div className={styles.componentCell}>
          <span className={styles.componentLabel}>{t('timedate.field.year')}</span>
          <span className={styles.componentValue}>
            <span className={styles.componentNum}>{details.year}</span>
          </span>
          <span className={styles.componentSub}>
            {details.isLeapYear ? t('timedate.leapYear') : t('timedate.commonYear')} · {details.daysInYear}
          </span>
        </div>

        <div className={styles.componentCell}>
          <span className={styles.componentLabel}>{t('timedate.field.week')}</span>
          <span className={styles.componentValue}>
            <span>{t('timedate.field.week')}</span>
            <span className={styles.componentNum}>{details.isoWeek}</span>
          </span>
          <span className={styles.componentSub}>
            {t('timedate.isoWeekNote', { weekYear: details.isoWeekYear, week: pad2(details.isoWeek) })}
          </span>
        </div>
      </div>

      {/* Requested copyable date formats */}
      <div className={styles.formatsStrip} aria-label={t('timedate.formatsHeading')} data-testid="date-formats">
        {formats.map((item) => {
          const isCopied = copiedId === item.id;
          return (
            <div key={item.id} className={styles.formatItem}>
              <div className={styles.formatText}>
                <span className={styles.formatLabel}>{item.label}</span>
                <span className={styles.formatValue} data-testid={`format-${item.id}`}>
                  {item.value}
                </span>
              </div>
              <button
                type="button"
                className={[styles.buttonSmall, isCopied ? styles.buttonCopied : '', 'ds-no-print']
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => copyValue(item.id, item.value)}
                aria-label={t('timedate.copyFormatAria', { label: item.label, value: item.value })}
              >
                {isCopied ? t('timedate.copied') : t('timedate.copy')}
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
