import type {
  CalendarCell,
  CalendarDate,
  CalendarViewMode,
  CalendarWeekRow,
  IsoWeekInfo,
  MonthGrid,
  MonthSpec,
  WeekStart,
  YearMonth,
} from './types';

const MS_PER_DAY = 86_400_000;

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInYear(year: number): number {
  return isLeapYear(year) ? 366 : 365;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function toUtcMs(date: CalendarDate): number {
  const d = new Date(0);
  d.setUTCFullYear(date.year, date.month - 1, date.day);
  d.setUTCHours(0, 0, 0, 0);
  return d.getTime();
}

export function fromUtcMs(ms: number): CalendarDate {
  const d = new Date(ms);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
  };
}

export function fromLocalDate(d: Date): CalendarDate {
  return {
    year: d.getFullYear(),
    month: d.getMonth() + 1,
    day: d.getDate(),
  };
}

export function sameDate(a: CalendarDate, b: CalendarDate): boolean {
  return a.year === b.year && a.month === b.month && a.day === b.day;
}

export function sameYearMonth(a: YearMonth, b: YearMonth): boolean {
  return a.year === b.year && a.month === b.month;
}

/** Returns 0 for Sunday through 6 for Saturday. */
export function getDayOfWeek(date: CalendarDate): number {
  const d = new Date(toUtcMs(date));
  return d.getUTCDay();
}

/** Returns ISO 8601 weekday: 1 for Monday through 7 for Sunday. */
export function getIsoWeekday(date: CalendarDate): number {
  const dow = getDayOfWeek(date);
  return dow === 0 ? 7 : dow;
}

/** Returns 1-indexed day of year (1..366). */
export function getDayOfYear(date: CalendarDate): number {
  const start = toUtcMs({ year: date.year, month: 1, day: 1 });
  const current = toUtcMs(date);
  return Math.round((current - start) / MS_PER_DAY) + 1;
}

/** Adds signed days to a CalendarDate using timezone-free UTC math. */
export function addDays(date: CalendarDate, deltaDays: number): CalendarDate {
  return fromUtcMs(toUtcMs(date) + deltaDays * MS_PER_DAY);
}

/** Signed day difference (to - from). Positive means `to` is in the future relative to `from`. */
export function diffDays(from: CalendarDate, to: CalendarDate): number {
  return Math.round((toUtcMs(to) - toUtcMs(from)) / MS_PER_DAY);
}

/** Adds signed months to a YearMonth, cleanly rolling over year boundaries. */
export function addMonths(ym: YearMonth, deltaMonths: number): YearMonth {
  const total = ym.year * 12 + (ym.month - 1) + deltaMonths;
  const year = Math.floor(total / 12);
  const month = ((total % 12) + 12) % 12 + 1;
  return { year, month };
}

/** Computes ISO 8601 week number (1..53) and ISO week-numbering year. */
export function getIsoWeek(date: CalendarDate): IsoWeekInfo {
  const isoWeekday = getIsoWeekday(date);
  // Thursday in the same ISO week always falls in the ISO week-numbering year.
  const thursday = addDays(date, 4 - isoWeekday);
  const weekYear = thursday.year;
  const jan4: CalendarDate = { year: weekYear, month: 1, day: 4 };
  const jan4IsoWeekday = getIsoWeekday(jan4);
  const week1Monday = addDays(jan4, 1 - jan4IsoWeekday);
  const daysSinceWeek1Monday = diffDays(week1Monday, thursday);
  const week = Math.floor(daysSinceWeek1Monday / 7) + 1;
  return { week, weekYear, isoWeekday };
}

/** Returns the Monday..Sunday date range for a given ISO week-year and week number. */
export function getIsoWeekRange(weekYear: number, week: number): { start: CalendarDate; end: CalendarDate } {
  const jan4: CalendarDate = { year: weekYear, month: 1, day: 4 };
  const jan4IsoWeekday = getIsoWeekday(jan4);
  const week1Monday = addDays(jan4, 1 - jan4IsoWeekday);
  const start = addDays(week1Monday, (week - 1) * 7);
  const end = addDays(start, 6);
  return { start, end };
}

/** Clamp a year to a reasonable calendar range (1..9999). */
export function clampYear(year: number): number {
  if (!Number.isFinite(year)) return new Date().getFullYear();
  return Math.max(1, Math.min(9999, Math.trunc(year)));
}

/** Clamp ahead-margin months (0..12). */
export function clampMarginMonths(months: number): number {
  if (!Number.isFinite(months)) return 3;
  return Math.max(0, Math.min(12, Math.trunc(months)));
}

export interface BuildMonthSpecsOptions {
  mode: CalendarViewMode;
  /** Center month for 'three-months' and 'plus-minus-six'. */
  anchorMonth: YearMonth;
  /** Selected year for 'year' and 'year-margin'. */
  selectedYear: number;
  /** Number of margin months ahead for 'year-margin' (default 3). */
  marginMonths?: number;
}

/**
 * Produces the ordered list of months to render for any of the four calendar modes:
 * - 'three-months': previous, current, next (3 months)
 * - 'plus-minus-six': current - 6 through current + 6 (13 months)
 * - 'year': January through December of selectedYear (12 months)
 * - 'year-margin': January through December of selectedYear + marginMonths ahead (default 3 -> 15 months)
 */
export function buildMonthSpecs(options: BuildMonthSpecsOptions): readonly MonthSpec[] {
  const { mode, anchorMonth } = options;

  if (mode === 'three-months') {
    return [
      addMonths(anchorMonth, -1),
      { year: anchorMonth.year, month: anchorMonth.month },
      addMonths(anchorMonth, 1),
    ];
  }

  if (mode === 'plus-minus-six') {
    const list: MonthSpec[] = [];
    for (let offset = -6; offset <= 6; offset += 1) {
      list.push(addMonths(anchorMonth, offset));
    }
    return list;
  }

  const year = clampYear(options.selectedYear);
  const baseMonths: MonthSpec[] = [];
  for (let m = 1; m <= 12; m += 1) {
    baseMonths.push({ year, month: m, isMargin: false });
  }

  if (mode === 'year') {
    return baseMonths;
  }

  const margin = clampMarginMonths(options.marginMonths ?? 3);
  for (let i = 1; i <= margin; i += 1) {
    const nextYm = addMonths({ year, month: 12 }, i);
    baseMonths.push({ year: nextYm.year, month: nextYm.month, isMargin: true });
  }
  return baseMonths;
}

/**
 * Builds the calendar rows (4..6 weeks) for a single month.
 * Every row carries its ISO 8601 week number (anchored to the row's Thursday / Monday-based week).
 */
export function buildMonthGrid(year: number, month: number, weekStart: WeekStart = 'monday'): MonthGrid {
  const firstDay: CalendarDate = { year, month, day: 1 };
  const totalDays = daysInMonth(year, month);

  const leadingDays =
    weekStart === 'monday' ? getIsoWeekday(firstDay) - 1 : getDayOfWeek(firstDay);

  const gridStart = addDays(firstDay, -leadingDays);
  const totalCells = Math.ceil((leadingDays + totalDays) / 7) * 7;
  const rowCount = totalCells / 7;

  const rows: CalendarWeekRow[] = [];
  for (let r = 0; r < rowCount; r += 1) {
    const cells: CalendarCell[] = [];
    for (let c = 0; c < 7; c += 1) {
      const date = addDays(gridStart, r * 7 + c);
      cells.push({
        date,
        inMonth: date.year === year && date.month === month,
        dayOfWeek: getDayOfWeek(date),
        isoWeekday: getIsoWeekday(date),
      });
    }
    // For Monday-start, cell[3] is Thursday (exact ISO 8601 week owner).
    // For Sunday-start, cell[4] is Thursday (so the ISO week number matches the bulk Mon-Sat of that row).
    const thursdayCell = weekStart === 'monday' ? cells[3] : cells[4];
    const iso = getIsoWeek(thursdayCell.date);
    rows.push({
      isoWeek: iso.week,
      isoWeekYear: iso.weekYear,
      cells,
    });
  }

  return { year, month, rows };
}

/** Returns the 0-based day-of-week order matching weekStart (Monday-first: [1,2,3,4,5,6,0]; Sunday-first: [0..6]). */
export function getWeekdayOrder(weekStart: WeekStart): readonly number[] {
  return weekStart === 'monday' ? [1, 2, 3, 4, 5, 6, 0] : [0, 1, 2, 3, 4, 5, 6];
}
