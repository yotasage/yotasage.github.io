import type { Locale } from '../ui/translations';
import { daysInYear, getDayOfWeek, getDayOfYear, getIsoWeek, isLeapYear } from './calendar';
import type { CalendarDate, DateDetails } from './types';

export const MONTH_NAMES_EN: readonly string[] = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export const MONTH_SHORT_EN: readonly string[] = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

export const MONTH_NAMES_NB: readonly string[] = [
  'Januar',
  'Februar',
  'Mars',
  'April',
  'Mai',
  'Juni',
  'Juli',
  'August',
  'September',
  'Oktober',
  'November',
  'Desember',
];

export const MONTH_SHORT_NB: readonly string[] = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'Mai',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Okt',
  'Nov',
  'Des',
];

/** 0 = Sunday .. 6 = Saturday */
export const DAY_NAMES_EN: readonly string[] = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

export const DAY_SHORT_EN: readonly string[] = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const DAY_NARROW_EN: readonly string[] = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

/** 0 = Sunday .. 6 = Saturday */
export const DAY_NAMES_NB: readonly string[] = [
  'Søndag',
  'Mandag',
  'Tirsdag',
  'Onsdag',
  'Torsdag',
  'Fredag',
  'Lørdag',
];

export const DAY_SHORT_NB: readonly string[] = ['Søn', 'Man', 'Tir', 'Ons', 'Tor', 'Fre', 'Lør'];

export const DAY_NARROW_NB: readonly string[] = ['Sø', 'Ma', 'Ti', 'On', 'To', 'Fr', 'Lø'];

export function pad2(n: number): string {
  return String(Math.trunc(n)).padStart(2, '0');
}

export function pad4(n: number): string {
  return String(Math.trunc(n)).padStart(4, '0');
}

/** Returns English ordinal suffix ('st', 'nd', 'rd', 'th') for day 1..31. */
export function getOrdinalSuffix(day: number): string {
  const mod100 = Math.abs(day) % 100;
  if (mod100 >= 11 && mod100 <= 13) return 'th';
  switch (Math.abs(day) % 10) {
    case 1:
      return 'st';
    case 2:
      return 'nd';
    case 3:
      return 'rd';
    default:
      return 'th';
  }
}

export function getMonthName(month: number, locale: Locale = 'en'): string {
  const list = locale === 'nb' ? MONTH_NAMES_NB : MONTH_NAMES_EN;
  return list[month - 1] ?? '';
}

export function getMonthShortName(month: number, locale: Locale = 'en'): string {
  const list = locale === 'nb' ? MONTH_SHORT_NB : MONTH_SHORT_EN;
  return list[month - 1] ?? '';
}

export function getDayName(dayOfWeek: number, locale: Locale = 'en'): string {
  const list = locale === 'nb' ? DAY_NAMES_NB : DAY_NAMES_EN;
  return list[dayOfWeek] ?? '';
}

export function getDayShortName(dayOfWeek: number, locale: Locale = 'en'): string {
  const list = locale === 'nb' ? DAY_SHORT_NB : DAY_SHORT_EN;
  return list[dayOfWeek] ?? '';
}

export function getDayNarrowName(dayOfWeek: number, locale: Locale = 'en'): string {
  const list = locale === 'nb' ? DAY_NARROW_NB : DAY_NARROW_EN;
  return list[dayOfWeek] ?? '';
}

/** Format 1: ISO 8601 `YYYY-MM-DD`, e.g. `2026-11-25`. */
export function formatIsoDate(date: CalendarDate): string {
  return `${pad4(date.year)}-${pad2(date.month)}-${pad2(date.day)}`;
}

/** Format 2: English ordinal long format, e.g. `25th of November 2026`. */
export function formatOrdinalDate(date: CalendarDate): string {
  const monthName = MONTH_NAMES_EN[date.month - 1] ?? '';
  return `${date.day}${getOrdinalSuffix(date.day)} of ${monthName} ${date.year}`;
}

/** Format 3: Dot format, e.g. `25. November 2026` (or `25. november 2026` / `25. November 2026`). */
export function formatDotDate(date: CalendarDate, locale: Locale = 'en'): string {
  const monthName = getMonthName(date.month, locale);
  return `${date.day}. ${monthName} ${date.year}`;
}

/** ISO week date string, e.g. `2026-W48-3`. */
export function formatIsoWeekDate(date: CalendarDate): string {
  const iso = getIsoWeek(date);
  return `${pad4(iso.weekYear)}-W${pad2(iso.week)}-${iso.isoWeekday}`;
}

/** Builds a complete bundle of formatted strings and calendar components for a given date. */
export function getDateDetails(date: CalendarDate, locale: Locale = 'en'): DateDetails {
  const dow = getDayOfWeek(date);
  const iso = getIsoWeek(date);
  return {
    date,
    dayNumber: date.day,
    dayName: getDayName(dow, locale),
    dayShortName: getDayShortName(dow, locale),
    monthNumber: date.month,
    monthName: getMonthName(date.month, locale),
    monthShortName: getMonthShortName(date.month, locale),
    year: date.year,
    isoWeek: iso.week,
    isoWeekYear: iso.weekYear,
    isoWeekday: iso.isoWeekday,
    dayOfYear: getDayOfYear(date),
    daysInYear: daysInYear(date.year),
    isLeapYear: isLeapYear(date.year),
    quarter: Math.floor((date.month - 1) / 3) + 1,
    isoDate: formatIsoDate(date),
    ordinalDate: formatOrdinalDate(date),
    dotDate: formatDotDate(date, locale),
    isoWeekDate: formatIsoWeekDate(date),
  };
}

/** Formats local clock time from a JS Date object. */
export function formatClockTime(d: Date, use24Hour = true): string {
  const hours = d.getHours();
  const minutes = pad2(d.getMinutes());
  const seconds = pad2(d.getSeconds());
  if (use24Hour) {
    return `${pad2(hours)}:${minutes}:${seconds}`;
  }
  const suffix = hours >= 12 ? 'PM' : 'AM';
  const h12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${pad2(h12)}:${minutes}:${seconds} ${suffix}`;
}

/** Formats UTC offset like `UTC+01:00` or `UTC-08:00`. */
export function formatUtcOffset(d: Date): string {
  // JS getTimezoneOffset() is minutes behind UTC (negative for east of UTC)
  const totalMinutes = -d.getTimezoneOffset();
  const sign = totalMinutes >= 0 ? '+' : '-';
  const abs = Math.abs(totalMinutes);
  const hh = pad2(Math.floor(abs / 60));
  const mm = pad2(abs % 60);
  return `UTC${sign}${hh}:${mm}`;
}

/** Formats a month span label like `Oct 2026 – Dec 2026` or `May 2026 – May 2027`. */
export function formatMonthSpan(
  first: { year: number; month: number },
  last: { year: number; month: number },
  locale: Locale = 'en',
): string {
  const startLabel = `${getMonthShortName(first.month, locale)} ${first.year}`;
  const endLabel = `${getMonthShortName(last.month, locale)} ${last.year}`;
  return first.year === last.year && first.month === last.month
    ? startLabel
    : `${startLabel} – ${endLabel}`;
}
