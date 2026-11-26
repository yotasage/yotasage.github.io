export interface CalendarDate {
  year: number;
  month: number; // 1..12
  day: number; // 1..31
}

export interface YearMonth {
  year: number;
  month: number; // 1..12
}

export type CalendarViewMode = 'three-months' | 'plus-minus-six' | 'year' | 'year-margin';

export type WeekStart = 'monday' | 'sunday';

export interface MonthSpec {
  year: number;
  month: number; // 1..12
  isMargin?: boolean;
}

export interface IsoWeekInfo {
  week: number; // 1..53
  weekYear: number;
  isoWeekday: number; // 1 (Mon) .. 7 (Sun)
}

export interface CalendarCell {
  date: CalendarDate;
  inMonth: boolean;
  dayOfWeek: number; // 0 (Sun) .. 6 (Sat)
  isoWeekday: number; // 1 (Mon) .. 7 (Sun)
}

export interface CalendarWeekRow {
  isoWeek: number;
  isoWeekYear: number;
  cells: readonly CalendarCell[]; // always length 7
}

export interface MonthGrid {
  year: number;
  month: number; // 1..12
  rows: readonly CalendarWeekRow[];
}

export interface DateDetails {
  date: CalendarDate;
  dayNumber: number;
  dayName: string;
  dayShortName: string;
  monthNumber: number;
  monthName: string;
  monthShortName: string;
  year: number;
  isoWeek: number;
  isoWeekYear: number;
  isoWeekday: number;
  dayOfYear: number;
  daysInYear: number;
  isLeapYear: boolean;
  quarter: number;
  isoDate: string; // YYYY-MM-DD
  ordinalDate: string; // 25th of November 2026
  dotDate: string; // 25. November 2026
  isoWeekDate: string; // 2026-W48-3
}
