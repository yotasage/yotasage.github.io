import { useCallback, useState } from 'react';

import { diffDays, getIsoWeekRange, sameDate } from '../../lib/timedate/calendar';
import { formatIsoDate, getDateDetails, pad2 } from '../../lib/timedate/format';
import type { CalendarDate } from '../../lib/timedate/types';
import { useI18n } from '../../lib/ui/i18n';
import styles from '../../styles/TimeDate.module.css';

interface SelectedDateBarProps {
  today: CalendarDate;
  selectedDate: CalendarDate | null;
  selectedWeek: { weekYear: number; week: number } | null;
  onClearSelection: () => void;
}

export default function SelectedDateBar({
  today,
  selectedDate,
  selectedWeek,
  onClearSelection,
}: SelectedDateBarProps) {
  const { locale, t } = useI18n();
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const copyValue = useCallback(async (id: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedId(id);
      window.setTimeout(() => {
        setCopiedId((cur) => (cur === id ? null : cur));
      }, 1500);
    } catch {
      // Clipboard unavailable
    }
  }, []);

  if (!selectedDate && !selectedWeek) {
    return <p className={[styles.hintLine, 'ds-no-print'].join(' ')}>{t('timedate.clickHint')}</p>;
  }

  if (selectedWeek && !selectedDate) {
    const range = getIsoWeekRange(selectedWeek.weekYear, selectedWeek.week);
    const startIso = formatIsoDate(range.start);
    const endIso = formatIsoDate(range.end);
    const weekCode = `${selectedWeek.weekYear}-W${pad2(selectedWeek.week)}`;
    const isCopied = copiedId === 'week-code';

    return (
      <section
        className={[styles.inspectorBar, 'ds-no-print'].join(' ')}
        aria-label={t('timedate.selectedWeekHeading')}
        data-testid="selected-week-bar"
      >
        <div className={styles.inspectorTop}>
          <div className={styles.inspectorTitleGroup}>
            <span className={styles.inspectorKicker}>{t('timedate.selectedWeekHeading')}</span>
            <span className={styles.inspectorHeadline}>
              {t('timedate.weekSpan', {
                week: selectedWeek.week,
                year: selectedWeek.weekYear,
                start: startIso,
                end: endIso,
              })}
            </span>
          </div>
          <div className={styles.toolbarGroup}>
            <button
              type="button"
              className={[styles.buttonSmall, isCopied ? styles.buttonCopied : ''].filter(Boolean).join(' ')}
              onClick={() => copyValue('week-code', weekCode)}
            >
              {isCopied ? t('timedate.copied') : `${t('timedate.copy')} ${weekCode}`}
            </button>
            <button type="button" className={styles.buttonSmall} onClick={onClearSelection}>
              {t('timedate.clearSelection')}
            </button>
          </div>
        </div>
      </section>
    );
  }

  const target = selectedDate ?? today;
  const details = getDateDetails(target, locale);
  const delta = diffDays(today, target);
  const relativeText =
    sameDate(target, today)
      ? t('timedate.relativeToday')
      : delta === 1
        ? t('timedate.relativeTomorrow')
        : delta === -1
          ? t('timedate.relativeYesterday')
          : delta > 0
            ? t('timedate.relativeInDays', { days: delta })
            : t('timedate.relativeDaysAgo', { days: Math.abs(delta) });

  const formats = [
    { id: 'sel-iso', label: t('timedate.format.iso'), value: details.isoDate },
    { id: 'sel-ordinal', label: t('timedate.format.ordinal'), value: details.ordinalDate },
    { id: 'sel-dot', label: t('timedate.format.dot'), value: details.dotDate },
  ];

  return (
    <section
      className={[styles.inspectorBar, 'ds-no-print'].join(' ')}
      aria-label={t('timedate.selectedDateHeading')}
      data-testid="selected-date-bar"
    >
      <div className={styles.inspectorTop}>
        <div className={styles.inspectorTitleGroup}>
          <span className={styles.inspectorKicker}>{t('timedate.selectedDateHeading')}</span>
          <span className={styles.inspectorHeadline}>
            {details.dayNumber} {details.dayName} · {pad2(details.monthNumber)} {details.monthName} {details.year}
          </span>
          <span className={styles.inspectorMeta}>
            {t('timedate.weekNumber', { week: details.isoWeek })} ({details.isoWeekDate}) · {relativeText}
          </span>
        </div>

        <button type="button" className={styles.buttonSmall} onClick={onClearSelection}>
          {t('timedate.clearSelection')}
        </button>
      </div>

      <div className={styles.inspectorFormats}>
        {formats.map((item) => {
          const isCopied = copiedId === item.id;
          return (
            <div key={item.id} className={styles.inspectorFormatCell}>
              <div className={styles.formatText}>
                <span className={styles.formatLabel}>{item.label}</span>
                <span className={styles.formatValue} data-testid={item.id}>
                  {item.value}
                </span>
              </div>
              <button
                type="button"
                className={[styles.buttonSmall, isCopied ? styles.buttonCopied : ''].filter(Boolean).join(' ')}
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
