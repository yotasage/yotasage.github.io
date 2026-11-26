export type EpochUnit = 'auto' | 's' | 'ms' | 'us' | 'ns';
export type ConcreteEpochUnit = 's' | 'ms' | 'us' | 'ns';

export type DetectedFormatKind =
  | 'unix-s'
  | 'unix-ms'
  | 'unix-us'
  | 'unix-ns'
  | 'hex'
  | 'iso8601'
  | 'rfc2822'
  | 'sql'
  | 'uuidv7'
  | 'objectid'
  | 'filetime'
  | 'cocoa';

export type ParseErrorCode =
  | 'empty'
  | 'unrecognized'
  | 'out-of-range'
  | 'invalid-date';

export interface ParseSuccess {
  ok: true;
  /** Exact instant as signed nanoseconds since 1970-01-01T00:00:00.000000000Z. */
  epochNs: bigint;
  detectedKind: DetectedFormatKind;
  detectedUnit?: ConcreteEpochUnit;
  /** Whether the input was interpreted as a plain numeric epoch (where unit override applies). */
  isNumericEpoch: boolean;
  /** Digit count for plain integer numeric epochs. */
  digitCount?: number;
}

export interface ParseFailure {
  ok: false;
  code: ParseErrorCode;
}

export type ParseResult = ParseSuccess | ParseFailure;

export function isParseSuccess(result: ParseResult): result is ParseSuccess {
  return result.ok === true;
}

export function getParseErrorCode(result: ParseResult): ParseErrorCode | null {
  return result.ok ? null : (result as ParseFailure).code;
}

export interface ZonedDateTimeParts {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
  hour: number; // 0-23
  minute: number; // 0-59
  second: number; // 0-59
  /** Sub-second nanoseconds (0 .. 999_999_999). */
  nanosecond: number;
  /** Offset from UTC in minutes (e.g. +60 for UTC+01:00, -300 for UTC-05:00). */
  offsetMinutes: number;
  /** Formatted offset string, e.g. '+01:00' or 'Z'. */
  offsetIso: string;
  /** Short timezone label, e.g. 'UTC', 'CET', 'PDT', 'GMT+1'. */
  tzAbbr: string;
  /** 1 = Monday .. 7 = Sunday (ISO 8601). */
  isoWeekday: number;
}

export interface CalendarMeta {
  isoWeekday: number; // 1 = Mon .. 7 = Sun
  isoWeekYear: number;
  isoWeek: number;
  dayOfYear: number;
  daysInYear: number;
  quarter: 1 | 2 | 3 | 4;
  isLeapYear: boolean;
  signed32BitStatus: 'safe' | 'negative-overflow' | 'positive-overflow';
  unsigned32BitSafe: boolean;
}

export interface AlternateEpochs {
  filetime: string; // Windows 100-ns ticks since 1601-01-01
  cocoaSeconds: string; // Apple Cocoa / Core Data seconds since 2001-01-01
  ntpSeconds: string; // NTP seconds since 1900-01-01
  gpsSeconds: string; // POSIX-based seconds since 1980-01-06 (ignoring leap seconds)
  julianDate: string; // JD
  modifiedJulianDate: string; // MJD
  excelSerial: string; // Excel 1900 serial date
}

export interface FormattedTimestamp {
  seconds: string;
  milliseconds: string;
  microseconds: string;
  nanoseconds: string;
  hexSeconds: string;
  isoUtc: string;
  isoUtcNano: string;
  isoZoned: string;
  rfc2822Utc: string;
  sqlUtc: string;
  sqlZoned: string;
  humanZoned: string;
  calendar: CalendarMeta;
  altEpochs: AlternateEpochs;
}

export interface DurationBreakdown {
  negative: boolean;
  totalNanoseconds: bigint;
  totalMilliseconds: number;
  totalSeconds: number;
  totalMinutes: number;
  totalHours: number;
  totalDays: number;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  milliseconds: number;
  isoDuration: string;
}

export interface OffsetSpec {
  sign: 1 | -1;
  years: number;
  months: number;
  weeks: number;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

export interface BatchRow {
  lineNumber: number;
  raw: string;
  result: ParseResult;
  isoUtc: string;
  isoZoned: string;
  seconds: string;
  milliseconds: string;
}

export interface TimestampPreset {
  id: string;
  epochNs: bigint;
  displayValue: string;
}
