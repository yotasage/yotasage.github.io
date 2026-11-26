import { useMemo } from 'react';

import {
  buildMonthGrid,
  getIsoWeek,
  getWeekdayOrder,
  sameDate,
} from '../../lib/timedate/calendar';
import {
  formatIsoDate,
  getDayName,
  getDayNarrowName,
  getMonthName,
  pad2,
} from '../../lib/timedate/format';
import type { CalendarDate, WeekStart } from '../../lib/timedate/types';
import { useI18n } from '../../lib/ui/i18n';
import styles from '../../styles/TimeDate.module.css';

interface MonthCardProps {
  year: number;
  month: number;
  isMargin?: boolean;
  today: CalendarDate;
  selectedDate: CalendarDate | null;
  selectedWeek: { weekYear: number; week: number } | null;
  showWeekNumbers: boolean;
  weekStart: WeekStart;
  onSelectDate: (date: CalendarDate) => void;
  onSelectWeek: (weekYear: number, week: number) => void;
}

export default function MonthCard({
  year,
  month,
  isMargin = false,
  today,
  selectedDate,
  selectedWeek,
  showWeekNumbers,
  weekStart,
  onSelectDate,
  onSelectWeek,
}: MonthCardProps) {
  const { locale, t } = useI18n();

  const grid = useMemo(() => buildMonthGrid(year, month, weekStart), [year, month, weekStart]);
  const weekdayOrder = useMemo(() => getWeekdayOrder(weekStart), [weekStart]);
  const todayIsoWeek = useMemo(() => getIsoWeek(today), [today]);

  const isCurrentMonth = today.year === year && today.month === month;
  const monthName = getMonthName(month, locale);

  const cardClass = [
    styles.monthCard,
    isCurrentMonth ? styles.monthCardCurrent : '',
    isMargin ? styles.monthCardMargin : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <article
      className={cardClass}
      data-testid={`month-card-${year}-${pad2(month)}`}
      data-current-month={isCurrentMonth ? 'true' : undefined}
      data-margin-month={isMargin ? 'true' : undefined}
      aria-label={`${monthName} ${year}`}
    >
      <header className={styles.monthHeader}>
        <div className={styles.monthTitleGroup}>
          <span className={styles.monthIndex}>{pad2(month)}</span>
          <h3 className={styles.monthName}>{monthName}</h3>
          <span className={styles.monthYearText}>{year}</span>
        </div>
        {isCurrentMonth ? (
          <span className={styles.monthStatusText}>{t('timedate.currentMonthLabel')}</span>
        ) : isMargin ? (
          <span className={styles.monthStatusMuted}>{t('timedate.marginMonthLabel')}</span>
        ) : null}
      </header>

      <table className={styles.monthTable}>
        <thead>
          <tr>
            {showWeekNumbers && (
              <th
                scope="col"
                className={styles.weekHeader}
                title={t('timedate.weekColTitle')}
              >
                {t('timedate.weekColHeader')}
              </th>
            )}
            {weekdayOrder.map((dow) => (
              <th
                key={dow}
                scope="col"
                className={dow === 0 ? styles.sundayHeader : undefined}
                title={getDayName(dow, locale)}
              >
                {getDayNarrowName(dow, locale)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {grid.rows.map((row) => {
            const isCurrentWeekRow =
              row.isoWeekYear === todayIsoWeek.weekYear && row.isoWeek === todayIsoWeek.week;
            const isSelectedWeekRow =
              selectedWeek !== null &&
              row.isoWeekYear === selectedWeek.weekYear &&
              row.isoWeek === selectedWeek.week;

            const rowClass = [
              styles.weekRow,
              isSelectedWeekRow
                ? styles.weekRowSelected
                : isCurrentWeekRow
                  ? styles.weekRowCurrent
                  : '',
            ]
              .filter(Boolean)
              .join(' ');

            return (
              <tr key={`${row.isoWeekYear}-W${row.isoWeek}-${row.cells[0].date.day}`} className={rowClass}>
                {showWeekNumbers && (
                  <td className={styles.weekCell}>
                    <button
                      type="button"
                      className={[
                        styles.weekBtn,
                        isCurrentWeekRow ? styles.weekBtnCurrent : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      onClick={() => onSelectWeek(row.isoWeekYear, row.isoWeek)}
                      aria-label={t('timedate.weekRowAria', {
                        week: row.isoWeek,
                        year: row.isoWeekYear,
                      })}
                      aria-pressed={isSelectedWeekRow}
                      data-testid={`week-${year}-${pad2(month)}-w${row.isoWeek}`}
                    >
                      {row.isoWeek}
                    </button>
                  </td>
                )}

                {row.cells.map((cell) => {
                  const isToday = cell.inMonth && sameDate(cell.date, today);
                  const isSelected =
                    cell.inMonth && selectedDate !== null && sameDate(cell.date, selectedDate);
                  const isSunday = cell.dayOfWeek === 0;
                  const isSaturday = cell.dayOfWeek === 6;

                  const dayBtnClass = [
                    styles.dayBtn,
                    !cell.inMonth ? styles.dayOutside : '',
                    cell.inMonth && isSunday && !isToday ? styles.daySunday : '',
                    cell.inMonth && isSaturday && !isToday ? styles.daySaturday : '',
                    isSelected ? styles.daySelected : '',
                    isToday ? styles.dayToday : '',
                  ]
                    .filter(Boolean)
                    .join(' ');

                  const isoStr = formatIsoDate(cell.date);
                  const cellDayName = getDayName(cell.dayOfWeek, locale);
                  const cellMonthName = getMonthName(cell.date.month, locale);
                  const ariaLabel = `${cellDayName}, ${cell.date.day} ${cellMonthName} ${cell.date.year}, ${t('timedate.weekNumber', { week: row.isoWeek })}${isToday ? `, ${t('timedate.todayBadge')}` : ''}`;

                  return (
                    <td key={isoStr} className={styles.dayCell}>
                      <button
                        type="button"
                        className={dayBtnClass}
                        onClick={() => onSelectDate(cell.date)}
                        aria-label={ariaLabel}
                        aria-current={isToday ? 'date' : undefined}
                        aria-pressed={isSelected}
                        data-date={cell.inMonth ? isoStr : undefined}
                        data-today={isToday ? 'true' : undefined}
                      >
                        {cell.date.day}
                      </button>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </article>
  );
}
