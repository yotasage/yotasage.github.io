import { useCallback, useEffect, useMemo, useState } from 'react';

import PageHead from '../../components/PageHead';
import CalendarToolbar from '../../components/TimeDate/CalendarToolbar';
import CurrentDateHero from '../../components/TimeDate/CurrentDateHero';
import MonthCard from '../../components/TimeDate/MonthCard';
import SelectedDateBar from '../../components/TimeDate/SelectedDateBar';
import ToolHeader from '../../components/UI/ToolHeader';
import {
  addMonths,
  buildMonthSpecs,
  fromLocalDate,
  sameDate,
  sameYearMonth,
} from '../../lib/timedate/calendar';
import type {
  CalendarDate,
  CalendarViewMode,
  MonthSpec,
  WeekStart,
  YearMonth,
} from '../../lib/timedate/types';
import { useI18n } from '../../lib/ui/i18n';
import { useDesignSystemPage } from '../../lib/ui/theme';
import styles from '../../styles/TimeDate.module.css';

// Static fallback before client hydration so SSG/static export stays deterministic.
const FALLBACK_TODAY: CalendarDate = { year: 2026, month: 11, day: 25 };

interface MonthSection {
  key: string;
  heading: string | null;
  months: readonly MonthSpec[];
}

export default function TimeDatePage() {
  useDesignSystemPage('#0f766e', '#2dd4bf');
  const { t } = useI18n();

  const [now, setNow] = useState<Date | null>(null);
  const [today, setToday] = useState<CalendarDate>(FALLBACK_TODAY);
  const [timezoneName, setTimezoneName] = useState<string>('');
  const [use24Hour, setUse24Hour] = useState<boolean>(true);

  const [mode, setMode] = useState<CalendarViewMode>('three-months');
  const [anchorMonth, setAnchorMonth] = useState<YearMonth>({
    year: FALLBACK_TODAY.year,
    month: FALLBACK_TODAY.month,
  });
  const [selectedYear, setSelectedYear] = useState<number>(FALLBACK_TODAY.year);
  const [marginMonths, setMarginMonths] = useState<number>(3);
  const [showWeekNumbers, setShowWeekNumbers] = useState<boolean>(true);
  const [weekStart, setWeekStart] = useState<WeekStart>('monday');

  const [selectedDate, setSelectedDate] = useState<CalendarDate | null>(null);
  const [selectedWeek, setSelectedWeek] = useState<{ weekYear: number; week: number } | null>(null);

  // Sync live local clock & current date on mount, ticking every second.
  useEffect(() => {
    const syncInitial = () => {
      const current = new Date();
      const localToday = fromLocalDate(current);
      setNow(current);
      setToday(localToday);
      setAnchorMonth({ year: localToday.year, month: localToday.month });
      setSelectedYear(localToday.year);
      try {
        setTimezoneName(Intl.DateTimeFormat().resolvedOptions().timeZone || '');
      } catch {
        setTimezoneName('');
      }
    };

    syncInitial();

    const timer = window.setInterval(() => {
      const current = new Date();
      setNow(current);
      const localToday = fromLocalDate(current);
      setToday((prev) => (sameDate(prev, localToday) ? prev : localToday));
    }, 1000);

    return () => window.clearInterval(timer);
  }, []);

  const monthSpecs = useMemo(
    () =>
      buildMonthSpecs({
        mode,
        anchorMonth,
        selectedYear,
        marginMonths,
      }),
    [mode, anchorMonth, selectedYear, marginMonths],
  );

  const isShowingToday = useMemo(
    () => monthSpecs.some((spec) => spec.year === today.year && spec.month === today.month),
    [monthSpecs, today.year, today.month],
  );

  const handleModeChange = useCallback(
    (nextMode: CalendarViewMode) => {
      setMode(nextMode);
      if (nextMode === 'three-months' || nextMode === 'plus-minus-six') {
        if (!sameYearMonth(anchorMonth, { year: today.year, month: today.month })) {
          setAnchorMonth({ year: today.year, month: today.month });
        }
      }
    },
    [anchorMonth, today.year, today.month],
  );

  const handleStepPeriod = useCallback(
    (direction: number) => {
      const step = mode === 'plus-minus-six' ? 6 : 1;
      setAnchorMonth((prev) => addMonths(prev, direction * step));
    },
    [mode],
  );

  const handleJumpToday = useCallback(() => {
    setAnchorMonth({ year: today.year, month: today.month });
    setSelectedYear(today.year);
    setSelectedDate(null);
    setSelectedWeek(null);
  }, [today.year, today.month]);

  const handleSelectDate = useCallback((date: CalendarDate) => {
    setSelectedWeek(null);
    setSelectedDate((prev) => (prev && sameDate(prev, date) ? null : date));
  }, []);

  const handleSelectWeek = useCallback((weekYear: number, week: number) => {
    setSelectedDate(null);
    setSelectedWeek((prev) =>
      prev && prev.weekYear === weekYear && prev.week === week ? null : { weekYear, week },
    );
  }, []);

  const sections = useMemo<readonly MonthSection[]>(() => {
    if (mode === 'year-margin') {
      const mainMonths = monthSpecs.filter((m) => !m.isMargin);
      const marginList = monthSpecs.filter((m) => m.isMargin);
      const list: MonthSection[] = [
        {
          key: `year-${selectedYear}`,
          heading: t('timedate.yearSectionTitle', { year: selectedYear }),
          months: mainMonths,
        },
      ];
      if (marginList.length > 0) {
        const nextYear = marginList[0].year;
        list.push({
          key: `margin-${nextYear}`,
          heading:
            marginList.length === 1
              ? t('timedate.marginSectionTitleSingle', { year: nextYear })
              : t('timedate.marginSectionTitle', { year: nextYear, count: marginList.length }),
          months: marginList,
        });
      }
      return list;
    }

    if (mode === 'year') {
      return [
        {
          key: `year-${selectedYear}`,
          heading: t('timedate.yearSectionTitle', { year: selectedYear }),
          months: monthSpecs,
        },
      ];
    }

    return [
      {
        key: `rolling-${mode}`,
        heading: null,
        months: monthSpecs,
      },
    ];
  }, [mode, monthSpecs, selectedYear, t]);

  const manyMonths = monthSpecs.length > 3;

  return (
    <div className={styles.page} data-ds="v2">
      <PageHead
        title={t('timedate.pageTitle')}
        description={t('timedate.metaDescription')}
        path="/time-date/main"
        ogImage="/og/home.png"
        ogAlt="yotasage.github.io browser engineering and document tools overview"
      />

      <ToolHeader title={t('timedate.title')} allowWideView />

      <main className={styles.main}>
        <CurrentDateHero
          now={now}
          today={today}
          use24Hour={use24Hour}
          onUse24HourChange={setUse24Hour}
          timezoneName={timezoneName}
        />

        <CalendarToolbar
          mode={mode}
          onModeChange={handleModeChange}
          monthSpecs={monthSpecs}
          todayYear={today.year}
          selectedYear={selectedYear}
          onSelectedYearChange={setSelectedYear}
          marginMonths={marginMonths}
          onMarginMonthsChange={setMarginMonths}
          onStepPeriod={handleStepPeriod}
          onJumpToday={handleJumpToday}
          isShowingToday={isShowingToday}
          showWeekNumbers={showWeekNumbers}
          onShowWeekNumbersChange={setShowWeekNumbers}
          weekStart={weekStart}
          onWeekStartChange={setWeekStart}
        />

        <SelectedDateBar
          today={today}
          selectedDate={selectedDate}
          selectedWeek={selectedWeek}
          onClearSelection={() => {
            setSelectedDate(null);
            setSelectedWeek(null);
          }}
        />

        <div
          className={styles.calendarSections}
          aria-label={t('timedate.calendarRegionAria')}
          data-testid="calendar-grid-container"
          data-month-count={monthSpecs.length}
        >
          {sections.map((section) => (
            <section key={section.key} className={styles.sectionBlock}>
              {section.heading && (
                <div className={styles.sectionHeadingRow}>
                  <h2 className={styles.sectionHeading}>{section.heading}</h2>
                  <span className={styles.sectionRule} aria-hidden="true" />
                  <span className={styles.sectionCount}>
                    {t('timedate.monthsShown', { count: section.months.length })}
                  </span>
                </div>
              )}

              <div
                className={[styles.monthsGrid, manyMonths ? styles.monthsGridMany : '']
                  .filter(Boolean)
                  .join(' ')}
              >
                {section.months.map((spec) => (
                  <MonthCard
                    key={`${spec.year}-${spec.month}`}
                    year={spec.year}
                    month={spec.month}
                    isMargin={spec.isMargin}
                    today={today}
                    selectedDate={selectedDate}
                    selectedWeek={selectedWeek}
                    showWeekNumbers={showWeekNumbers}
                    weekStart={weekStart}
                    onSelectDate={handleSelectDate}
                    onSelectWeek={handleSelectWeek}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      </main>
    </div>
  );
}
