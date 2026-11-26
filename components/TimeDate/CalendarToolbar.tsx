import { useEffect, useState } from 'react';

import { clampYear } from '../../lib/timedate/calendar';
import { formatMonthSpan } from '../../lib/timedate/format';
import type { CalendarViewMode, MonthSpec, WeekStart } from '../../lib/timedate/types';
import { useI18n } from '../../lib/ui/i18n';
import styles from '../../styles/TimeDate.module.css';

interface CalendarToolbarProps {
  mode: CalendarViewMode;
  onModeChange: (mode: CalendarViewMode) => void;
  monthSpecs: readonly MonthSpec[];
  todayYear: number;
  selectedYear: number;
  onSelectedYearChange: (year: number) => void;
  marginMonths: number;
  onMarginMonthsChange: (months: number) => void;
  onStepPeriod: (delta: number) => void;
  onJumpToday: () => void;
  isShowingToday: boolean;
  showWeekNumbers: boolean;
  onShowWeekNumbersChange: (show: boolean) => void;
  weekStart: WeekStart;
  onWeekStartChange: (ws: WeekStart) => void;
}

const MARGIN_CHOICES: readonly number[] = [0, 1, 2, 3, 4, 5, 6, 9, 12];

export default function CalendarToolbar({
  mode,
  onModeChange,
  monthSpecs,
  todayYear,
  selectedYear,
  onSelectedYearChange,
  marginMonths,
  onMarginMonthsChange,
  onStepPeriod,
  onJumpToday,
  isShowingToday,
  showWeekNumbers,
  onShowWeekNumbersChange,
  weekStart,
  onWeekStartChange,
}: CalendarToolbarProps) {
  const { locale, t } = useI18n();
  const [yearDraft, setYearDraft] = useState<string>(String(selectedYear));

  useEffect(() => {
    setYearDraft(String(selectedYear));
  }, [selectedYear]);

  const commitYearDraft = () => {
    const parsed = Number.parseInt(yearDraft.trim(), 10);
    if (Number.isFinite(parsed)) {
      const clamped = clampYear(parsed);
      onSelectedYearChange(clamped);
      setYearDraft(String(clamped));
    } else {
      setYearDraft(String(selectedYear));
    }
  };

  const firstSpec = monthSpecs[0];
  const lastSpec = monthSpecs[monthSpecs.length - 1];
  const spanText =
    firstSpec && lastSpec ? formatMonthSpan(firstSpec, lastSpec, locale) : '';

  const modes: readonly { id: CalendarViewMode; label: string; desc: string }[] = [
    {
      id: 'three-months',
      label: t('timedate.mode.threeMonths'),
      desc: t('timedate.modeDesc.threeMonths'),
    },
    {
      id: 'plus-minus-six',
      label: t('timedate.mode.plusMinusSix'),
      desc: t('timedate.modeDesc.plusMinusSix'),
    },
    {
      id: 'year',
      label: t('timedate.mode.year'),
      desc: t('timedate.modeDesc.year'),
    },
    {
      id: 'year-margin',
      label: t('timedate.mode.yearMargin'),
      desc: t('timedate.modeDesc.yearMargin'),
    },
  ];

  const activeModeDesc = modes.find((m) => m.id === mode)?.desc ?? '';
  const isYearMode = mode === 'year' || mode === 'year-margin';

  return (
    <section className={[styles.toolbarCard, 'ds-no-print'].join(' ')} aria-label={t('timedate.viewModeAria')}>
      <div className={styles.toolbarRow}>
        <div
          className={[styles.segmented, styles.modeTabs].join(' ')}
          role="tablist"
          aria-label={t('timedate.viewModeAria')}
        >
          {modes.map((m) => {
            const active = mode === m.id;
            return (
              <button
                key={m.id}
                type="button"
                role="tab"
                aria-selected={active}
                title={m.desc}
                className={[styles.segBtn, active ? styles.segBtnActive : ''].filter(Boolean).join(' ')}
                onClick={() => onModeChange(m.id)}
              >
                {m.label}
              </button>
            );
          })}
        </div>

        <div
          className={[styles.toolbarGroup, !isYearMode ? styles.periodNav : '']
            .filter(Boolean)
            .join(' ')}
        >
          {isYearMode ? (
            <>
              <div className={styles.yearControl}>
                <label htmlFor="td-year-input" className={styles.fieldLabel}>
                  {t('timedate.yearLabel')}
                </label>
                <button
                  type="button"
                  className={styles.iconBtn}
                  onClick={() => onSelectedYearChange(clampYear(selectedYear - 1))}
                  aria-label={t('timedate.prevYearAria')}
                  title={t('timedate.prevYearAria')}
                >
                  ‹
                </button>
                <input
                  id="td-year-input"
                  type="number"
                  min={1}
                  max={9999}
                  step={1}
                  value={yearDraft}
                  onChange={(e) => {
                    const next = e.target.value;
                    setYearDraft(next);
                    const parsed = Number.parseInt(next, 10);
                    if (Number.isFinite(parsed) && parsed >= 100 && parsed <= 9999) {
                      onSelectedYearChange(parsed);
                    }
                  }}
                  onBlur={commitYearDraft}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      commitYearDraft();
                    }
                  }}
                  aria-label={t('timedate.yearInputAria')}
                  className={styles.yearInput}
                />
                <button
                  type="button"
                  className={styles.iconBtn}
                  onClick={() => onSelectedYearChange(clampYear(selectedYear + 1))}
                  aria-label={t('timedate.nextYearAria')}
                  title={t('timedate.nextYearAria')}
                >
                  ›
                </button>
              </div>

              {mode === 'year-margin' && (
                <div className={styles.yearControl}>
                  <label htmlFor="td-margin-select" className={styles.fieldLabel}>
                    {t('timedate.marginLabel')}
                  </label>
                  <select
                    id="td-margin-select"
                    value={marginMonths}
                    onChange={(e) => onMarginMonthsChange(Number(e.target.value))}
                    aria-label={t('timedate.marginAria')}
                    className={styles.selectInput}
                  >
                    {MARGIN_CHOICES.map((count) => (
                      <option key={count} value={count}>
                        {count === 0
                          ? t('timedate.marginNone')
                          : count === 1
                            ? t('timedate.marginMonthOne')
                            : t('timedate.marginMonthsOptionLong', { count })}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {selectedYear !== todayYear && (
                <button
                  type="button"
                  className={styles.buttonAccent}
                  onClick={onJumpToday}
                  aria-label={t('timedate.jumpTodayAria')}
                >
                  {t('timedate.todayBtn')} ({todayYear})
                </button>
              )}
            </>
          ) : (
            <>
              <button
                type="button"
                className={styles.button}
                onClick={() => onStepPeriod(-1)}
                aria-label={t('timedate.prevPeriodAria')}
              >
                ‹ {t('timedate.prevPeriod')}
              </button>
              <span className={styles.spanLabel} data-testid="calendar-span-label">
                {spanText}
              </span>
              <button
                type="button"
                className={styles.button}
                onClick={() => onStepPeriod(1)}
                aria-label={t('timedate.nextPeriodAria')}
              >
                {t('timedate.nextPeriod')} ›
              </button>
              <button
                type="button"
                className={isShowingToday ? styles.button : styles.buttonAccent}
                onClick={onJumpToday}
                aria-label={t('timedate.jumpTodayAria')}
              >
                {t('timedate.todayBtn')}
              </button>
            </>
          )}
        </div>
      </div>

      <div className={styles.toolbarSecondary}>
        <span className={styles.modeHint}>
          {activeModeDesc} · {t('timedate.monthsShown', { count: monthSpecs.length })}
        </span>

        <div className={styles.toolbarGroup}>
          <label className={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={showWeekNumbers}
              onChange={(e) => onShowWeekNumbersChange(e.target.checked)}
            />
            <span>{t('timedate.showWeekNumbers')}</span>
          </label>

          <div className={styles.segmented} role="group" aria-label={t('timedate.weekStartAria')}>
            <button
              type="button"
              className={[styles.segBtnCompact, weekStart === 'monday' ? styles.segBtnActive : '']
                .filter(Boolean)
                .join(' ')}
              aria-pressed={weekStart === 'monday'}
              onClick={() => onWeekStartChange('monday')}
            >
              {t('timedate.weekStartMonday')}
            </button>
            <button
              type="button"
              className={[styles.segBtnCompact, weekStart === 'sunday' ? styles.segBtnActive : '']
                .filter(Boolean)
                .join(' ')}
              aria-pressed={weekStart === 'sunday'}
              onClick={() => onWeekStartChange('sunday')}
            >
              {t('timedate.weekStartSunday')}
            </button>
          </div>

          <button
            type="button"
            className={styles.buttonSmall}
            onClick={() => window.print()}
            aria-label={t('timedate.printAria')}
          >
            {t('timedate.printBtn')}
          </button>
        </div>
      </div>
    </section>
  );
}
