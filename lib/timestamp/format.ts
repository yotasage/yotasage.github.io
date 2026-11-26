import { floorDivBigInt, floorModBigInt, NS_PER_MS, NS_PER_SEC, NS_PER_US } from './parse';
import { epochNsToZonedParts } from './timezone';
import type {
  AlternateEpochs,
  CalendarMeta,
  FormattedTimestamp,
  TimestampPreset,
  ZonedDateTimeParts,
} from './types';

const SIGNED_INT32_MIN = -2_147_483_648n;
const SIGNED_INT32_MAX = 2_147_483_647n;
const UNSIGNED_INT32_MAX = 4_294_967_295n;

const FILETIME_EPOCH_DIFF_100NS = 116_444_736_000_000_000n;
const COCOA_EPOCH_DIFF_SEC = 978_307_200n;
const NTP_EPOCH_DIFF_SEC = 2_208_988_800n;
const GPS_EPOCH_DIFF_SEC = 315_964_800n;

const RFC_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const RFC_MONTHS = [
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
] as const;

export const TIMESTAMP_PRESETS: readonly TimestampPreset[] = [
  { id: 'unixEpoch', epochNs: 0n, displayValue: '0' },
  { id: 'y2k', epochNs: 946_684_800n * NS_PER_SEC, displayValue: '946684800' },
  { id: 'billion', epochNs: 1_000_000_000n * NS_PER_SEC, displayValue: '1000000000' },
  { id: 'twoBillion', epochNs: 2_000_000_000n * NS_PER_SEC, displayValue: '2000000000' },
  { id: 'y2038', epochNs: 2_147_483_647n * NS_PER_SEC, displayValue: '2147483647' },
  { id: 'uint32Max', epochNs: 4_294_967_295n * NS_PER_SEC, displayValue: '4294967295' },
];

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function pad3(n: number): string {
  return String(n).padStart(3, '0');
}

function pad4Year(year: number): string {
  if (year < 0) return `-${String(Math.abs(year)).padStart(4, '0')}`;
  return String(year).padStart(4, '0');
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function getDaysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  if (month === 4 || month === 6 || month === 9 || month === 11) return 30;
  return 31;
}

export function computeCalendarMeta(
  zoned: ZonedDateTimeParts,
  epochSeconds: bigint,
): CalendarMeta {
  const { year, month, day, isoWeekday } = zoned;
  const leap = isLeapYear(year);
  const daysInYear = leap ? 366 : 365;

  // Day of year (1-366)
  let dayOfYear = day;
  for (let m = 1; m < month; m++) {
    dayOfYear += getDaysInMonth(year, m);
  }

  // ISO 8601 week number & week-year
  const thursdayDate = new Date(0);
  thursdayDate.setUTCFullYear(year, month - 1, day + (4 - isoWeekday));
  thursdayDate.setUTCHours(0, 0, 0, 0);
  const isoWeekYear = thursdayDate.getUTCFullYear();
  const jan4 = new Date(0);
  jan4.setUTCFullYear(isoWeekYear, 0, 4);
  jan4.setUTCHours(0, 0, 0, 0);
  const jan4Dow = jan4.getUTCDay() === 0 ? 7 : jan4.getUTCDay();
  const week1MondayMs = jan4.getTime() - (jan4Dow - 1) * 86_400_000;
  const diffDays = Math.round((thursdayDate.getTime() - week1MondayMs) / 86_400_000);
  const isoWeek = Math.floor(diffDays / 7) + 1;

  const quarter = (Math.floor((month - 1) / 3) + 1) as 1 | 2 | 3 | 4;

  let signed32BitStatus: CalendarMeta['signed32BitStatus'] = 'safe';
  if (epochSeconds > SIGNED_INT32_MAX) signed32BitStatus = 'positive-overflow';
  else if (epochSeconds < SIGNED_INT32_MIN) signed32BitStatus = 'negative-overflow';

  const unsigned32BitSafe = epochSeconds >= 0n && epochSeconds <= UNSIGNED_INT32_MAX;

  return {
    isoWeekday,
    isoWeekYear,
    isoWeek,
    dayOfYear,
    daysInYear,
    quarter,
    isLeapYear: leap,
    signed32BitStatus,
    unsigned32BitSafe,
  };
}

export function formatIsoString(
  parts: ZonedDateTimeParts,
  precision: 'ms' | 'ns' = 'ms',
): string {
  const base = `${pad4Year(parts.year)}-${pad2(parts.month)}-${pad2(parts.day)}T${pad2(parts.hour)}:${pad2(parts.minute)}:${pad2(parts.second)}`;
  if (precision === 'ns') {
    const frac = String(parts.nanosecond).padStart(9, '0');
    return `${base}.${frac}${parts.offsetIso}`;
  }
  const ms = Math.floor(parts.nanosecond / 1_000_000);
  return `${base}.${pad3(ms)}${parts.offsetIso}`;
}

export function formatSqlString(parts: ZonedDateTimeParts): string {
  return `${pad4Year(parts.year)}-${pad2(parts.month)}-${pad2(parts.day)} ${pad2(parts.hour)}:${pad2(parts.minute)}:${pad2(parts.second)}`;
}

export function formatRfc2822Utc(utcParts: ZonedDateTimeParts): string {
  const jsWeekday = utcParts.isoWeekday === 7 ? 0 : utcParts.isoWeekday;
  return `${RFC_DAYS[jsWeekday]}, ${pad2(utcParts.day)} ${RFC_MONTHS[utcParts.month - 1]} ${pad4Year(utcParts.year)} ${pad2(utcParts.hour)}:${pad2(utcParts.minute)}:${pad2(utcParts.second)} GMT`;
}

export function formatClockTime(
  parts: ZonedDateTimeParts,
  use24Hour: boolean,
  showSeconds = true,
): string {
  if (use24Hour) {
    return showSeconds
      ? `${pad2(parts.hour)}:${pad2(parts.minute)}:${pad2(parts.second)}`
      : `${pad2(parts.hour)}:${pad2(parts.minute)}`;
  }
  const suffix = parts.hour >= 12 ? 'PM' : 'AM';
  const h12 = parts.hour % 12 === 0 ? 12 : parts.hour % 12;
  return showSeconds
    ? `${pad2(h12)}:${pad2(parts.minute)}:${pad2(parts.second)} ${suffix}`
    : `${pad2(h12)}:${pad2(parts.minute)} ${suffix}`;
}

const HUMAN_DAYS_EN = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
const HUMAN_DAYS_NB = ['man.', 'tir.', 'ons.', 'tor.', 'fre.', 'lør.', 'søn.'] as const;
const HUMAN_MONTHS_NB = [
  'jan.',
  'feb.',
  'mar.',
  'apr.',
  'mai',
  'jun.',
  'jul.',
  'aug.',
  'sep.',
  'okt.',
  'nov.',
  'des.',
] as const;

export function formatHumanZoned(
  parts: ZonedDateTimeParts,
  locale: 'en' | 'nb',
  use24Hour = true,
): string {
  const dayIdx = Math.min(6, Math.max(0, parts.isoWeekday - 1));
  const monthIdx = Math.min(11, Math.max(0, parts.month - 1));
  const clock = formatClockTime(parts, use24Hour, true);

  if (locale === 'nb') {
    const wd = HUMAN_DAYS_NB[dayIdx];
    const mo = HUMAN_MONTHS_NB[monthIdx];
    return `${wd} ${parts.day}. ${mo} ${parts.year}, ${clock} ${parts.tzAbbr}`;
  }
  const wd = HUMAN_DAYS_EN[dayIdx];
  const mo = RFC_MONTHS[monthIdx];
  return `${wd}, ${parts.day} ${mo} ${parts.year}, ${clock} ${parts.tzAbbr}`;
}

export function formatHexSeconds(sec: bigint): string {
  if (sec < 0n) {
    return `-0x${(-sec).toString(16)}`;
  }
  const hex = sec.toString(16);
  const padded = hex.length < 8 ? hex.padStart(8, '0') : hex;
  return `0x${padded}`;
}

export function computeAlternateEpochs(epochNs: bigint): AlternateEpochs {
  const secBig = floorDivBigInt(epochNs, NS_PER_SEC);
  const subNs = floorModBigInt(epochNs, NS_PER_SEC);
  const ticks100ns = floorDivBigInt(epochNs, 100n) + FILETIME_EPOCH_DIFF_100NS;
  const cocoaSec = secBig - COCOA_EPOCH_DIFF_SEC;
  const ntpSec = secBig + NTP_EPOCH_DIFF_SEC;
  const gpsSec = secBig - GPS_EPOCH_DIFF_SEC;

  const exactDays = (Number(secBig) + Number(subNs) / 1e9) / 86_400;
  const jd = exactDays + 2_440_587.5;
  const mjd = jd - 2_400_000.5;
  // Excel 1900 serial date (includes Lotus 1-2-3 leap-year bug offset: 1970-01-01 = 25569)
  const excel = exactDays + 25_569;

  return {
    filetime: ticks100ns.toString(),
    cocoaSeconds: cocoaSec.toString(),
    ntpSeconds: ntpSec.toString(),
    gpsSeconds: gpsSec.toString(),
    julianDate: jd.toFixed(5),
    modifiedJulianDate: mjd.toFixed(5),
    excelSerial: excel.toFixed(5),
  };
}

/**
 * Format an exact epoch nanosecond instant into all standard and alternate representations.
 */
export function formatTimestampAll(
  epochNs: bigint,
  selectedZone: string,
  locale: 'en' | 'nb' = 'en',
  use24Hour = true,
): FormattedTimestamp {
  const secBig = floorDivBigInt(epochNs, NS_PER_SEC);
  const msBig = floorDivBigInt(epochNs, NS_PER_MS);
  const usBig = floorDivBigInt(epochNs, NS_PER_US);

  const utcParts = epochNsToZonedParts(epochNs, 'UTC');
  const zonedParts = epochNsToZonedParts(epochNs, selectedZone);

  return {
    seconds: secBig.toString(),
    milliseconds: msBig.toString(),
    microseconds: usBig.toString(),
    nanoseconds: epochNs.toString(),
    hexSeconds: formatHexSeconds(secBig),
    isoUtc: formatIsoString(utcParts, 'ms'),
    isoUtcNano: formatIsoString(utcParts, 'ns'),
    isoZoned: formatIsoString(zonedParts, 'ms'),
    rfc2822Utc: formatRfc2822Utc(utcParts),
    sqlUtc: formatSqlString(utcParts),
    sqlZoned: formatSqlString(zonedParts),
    humanZoned: formatHumanZoned(zonedParts, locale, use24Hour),
    calendar: computeCalendarMeta(zonedParts, secBig),
    altEpochs: computeAlternateEpochs(epochNs),
  };
}

export interface RelativeParts {
  relation: 'now' | 'past' | 'future';
  primaryUnit: 'y' | 'mo' | 'd' | 'h' | 'm' | 's';
  primaryValue: number;
  secondaryUnit?: 'mo' | 'd' | 'h' | 'm' | 's';
  secondaryValue?: number;
}

/**
 * Compute structured relative distance between target epochNs and reference nowMs.
 */
export function computeRelativeParts(epochNs: bigint, nowMs: number): RelativeParts {
  const nowNs = BigInt(Math.trunc(nowMs)) * NS_PER_MS;
  const diffNs = epochNs - nowNs;
  const absSec = Number(floorDivBigInt(diffNs < 0n ? -diffNs : diffNs, NS_PER_SEC));

  if (absSec < 1) {
    return { relation: 'now', primaryUnit: 's', primaryValue: 0 };
  }

  const relation: 'past' | 'future' = diffNs < 0n ? 'past' : 'future';

  const SEC_MIN = 60;
  const SEC_HOUR = 3_600;
  const SEC_DAY = 86_400;
  const SEC_MONTH = 2_629_746; // average Gregorian month (30.436875 days)
  const SEC_YEAR = 31_556_952; // average Gregorian year (365.2425 days)

  if (absSec >= SEC_YEAR) {
    const years = Math.floor(absSec / SEC_YEAR);
    const months = Math.floor((absSec % SEC_YEAR) / SEC_MONTH);
    return months > 0
      ? { relation, primaryUnit: 'y', primaryValue: years, secondaryUnit: 'mo', secondaryValue: months }
      : { relation, primaryUnit: 'y', primaryValue: years };
  }
  if (absSec >= SEC_MONTH) {
    const months = Math.floor(absSec / SEC_MONTH);
    const days = Math.floor((absSec % SEC_MONTH) / SEC_DAY);
    return days > 0
      ? { relation, primaryUnit: 'mo', primaryValue: months, secondaryUnit: 'd', secondaryValue: days }
      : { relation, primaryUnit: 'mo', primaryValue: months };
  }
  if (absSec >= SEC_DAY) {
    const days = Math.floor(absSec / SEC_DAY);
    const hours = Math.floor((absSec % SEC_DAY) / SEC_HOUR);
    return hours > 0
      ? { relation, primaryUnit: 'd', primaryValue: days, secondaryUnit: 'h', secondaryValue: hours }
      : { relation, primaryUnit: 'd', primaryValue: days };
  }
  if (absSec >= SEC_HOUR) {
    const hours = Math.floor(absSec / SEC_HOUR);
    const mins = Math.floor((absSec % SEC_HOUR) / SEC_MIN);
    return mins > 0
      ? { relation, primaryUnit: 'h', primaryValue: hours, secondaryUnit: 'm', secondaryValue: mins }
      : { relation, primaryUnit: 'h', primaryValue: hours };
  }
  if (absSec >= SEC_MIN) {
    const mins = Math.floor(absSec / SEC_MIN);
    const secs = absSec % SEC_MIN;
    return secs > 0
      ? { relation, primaryUnit: 'm', primaryValue: mins, secondaryUnit: 's', secondaryValue: secs }
      : { relation, primaryUnit: 'm', primaryValue: mins };
  }
  return { relation, primaryUnit: 's', primaryValue: absSec };
}
