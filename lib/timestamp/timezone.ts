import { floorDivBigInt, floorModBigInt, NS_PER_MS, NS_PER_SEC } from './parse';
import type { ZonedDateTimeParts } from './types';

export const DEFAULT_WORLD_ZONES: readonly string[] = [
  'UTC',
  'America/New_York',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Oslo',
  'Asia/Tokyo',
  'Australia/Sydney',
];

export const CURATED_TIMEZONES: readonly string[] = [
  'UTC',
  'Pacific/Honolulu',
  'America/Anchorage',
  'America/Los_Angeles',
  'America/Denver',
  'America/Chicago',
  'America/New_York',
  'America/Toronto',
  'America/Sao_Paulo',
  'Atlantic/Reykjavik',
  'Europe/London',
  'Europe/Dublin',
  'Europe/Oslo',
  'Europe/Stockholm',
  'Europe/Berlin',
  'Europe/Paris',
  'Europe/Zurich',
  'Europe/Athens',
  'Europe/Helsinki',
  'Africa/Cairo',
  'Africa/Johannesburg',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Bangkok',
  'Asia/Singapore',
  'Asia/Shanghai',
  'Asia/Seoul',
  'Asia/Tokyo',
  'Australia/Sydney',
  'Pacific/Auckland',
];

let cachedTimezones: readonly string[] | null = null;

/** Return all supported IANA timezones (always starting with UTC), using Intl when available. */
export function getSupportedTimezones(): readonly string[] {
  if (cachedTimezones) return cachedTimezones;
  try {
    const intlAny = Intl as unknown as { supportedValuesOf?: (key: string) => string[] };
    if (typeof intlAny.supportedValuesOf === 'function') {
      const list = intlAny.supportedValuesOf('timeZone');
      const merged = list.includes('UTC') ? ['UTC', ...list.filter((z) => z !== 'UTC')] : ['UTC', ...list];
      cachedTimezones = merged;
      return merged;
    }
  } catch {
    // Fallback below
  }
  cachedTimezones = CURATED_TIMEZONES;
  return cachedTimezones;
}

export function getLocalTimezone(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return tz || 'UTC';
  } catch {
    return 'UTC';
  }
}

export function isValidTimezone(tz: string): boolean {
  if (!tz) return false;
  if (tz === 'UTC') return true;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();
const abbrFormatterCache = new Map<string, Intl.DateTimeFormat>();

function getPartsFormatter(timeZone: string): Intl.DateTimeFormat {
  let fmt = formatterCache.get(timeZone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
      weekday: 'short',
    });
    formatterCache.set(timeZone, fmt);
  }
  return fmt;
}

function getAbbrFormatter(timeZone: string): Intl.DateTimeFormat {
  let fmt = abbrFormatterCache.get(timeZone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-US', {
      timeZone,
      timeZoneName: 'short',
    });
    abbrFormatterCache.set(timeZone, fmt);
  }
  return fmt;
}

const WEEKDAY_MAP: Record<string, number> = {
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
  Sun: 7,
};

export function formatOffsetIso(offsetMinutes: number): string {
  if (offsetMinutes === 0) return 'Z';
  const sign = offsetMinutes > 0 ? '+' : '-';
  const abs = Math.abs(offsetMinutes);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `${sign}${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function formatOffsetUtcLabel(offsetMinutes: number): string {
  if (offsetMinutes === 0) return 'UTC+00:00';
  return `UTC${formatOffsetIso(offsetMinutes)}`;
}

/**
 * Convert an exact epoch nanosecond instant into wall-clock components in the given IANA timezone.
 */
export function epochNsToZonedParts(epochNs: bigint, timeZone: string): ZonedDateTimeParts {
  const safeTz = isValidTimezone(timeZone) ? timeZone : 'UTC';
  const secBig = floorDivBigInt(epochNs, NS_PER_SEC);
  const nanosecond = Number(floorModBigInt(epochNs, NS_PER_SEC));
  const msNum = Number(secBig) * 1000;
  const date = new Date(msNum);

  if (safeTz === 'UTC') {
    const jsDay = date.getUTCDay();
    const isoWeekday = jsDay === 0 ? 7 : jsDay;
    return {
      year: date.getUTCFullYear(),
      month: date.getUTCMonth() + 1,
      day: date.getUTCDate(),
      hour: date.getUTCHours(),
      minute: date.getUTCMinutes(),
      second: date.getUTCSeconds(),
      nanosecond,
      offsetMinutes: 0,
      offsetIso: 'Z',
      tzAbbr: 'UTC',
      isoWeekday,
    };
  }

  const parts = getPartsFormatter(safeTz).formatToParts(date);
  let year = 1970;
  let month = 1;
  let day = 1;
  let hour = 0;
  let minute = 0;
  let second = 0;
  let weekdayStr = 'Thu';

  for (const p of parts) {
    switch (p.type) {
      case 'year':
        year = Number(p.value);
        break;
      case 'month':
        month = Number(p.value);
        break;
      case 'day':
        day = Number(p.value);
        break;
      case 'hour':
        hour = Number(p.value) % 24;
        break;
      case 'minute':
        minute = Number(p.value);
        break;
      case 'second':
        second = Number(p.value);
        break;
      case 'weekday':
        weekdayStr = p.value;
        break;
    }
  }

  // Handle BCE / era if needed
  const eraPart = parts.find((p) => p.type === 'era');
  if (eraPart && eraPart.value.toUpperCase().startsWith('B')) {
    year = 1 - year;
  }

  // Compute exact offset: wall-clock interpreted as UTC minus actual UTC ms
  const wallAsUtc = new Date(Date.UTC(year, month - 1, day, hour, minute, second, 0));
  wallAsUtc.setUTCFullYear(year);
  const offsetMinutes = Math.round((wallAsUtc.getTime() - msNum) / 60_000);

  let tzAbbr = formatOffsetUtcLabel(offsetMinutes);
  try {
    const abbrParts = getAbbrFormatter(safeTz).formatToParts(date);
    const tzPart = abbrParts.find((p) => p.type === 'timeZoneName');
    if (tzPart?.value) {
      tzAbbr =
        tzPart.value === 'GMT+0' || tzPart.value === 'GMT-0' ? 'GMT' : tzPart.value;
    }
  } catch {
    // Keep UTC offset fallback
  }

  return {
    year,
    month,
    day,
    hour,
    minute,
    second,
    nanosecond,
    offsetMinutes,
    offsetIso: formatOffsetIso(offsetMinutes),
    tzAbbr,
    isoWeekday: WEEKDAY_MAP[weekdayStr] ?? 1,
  };
}

export interface WallClockInput {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  nanosecond?: number;
}

/**
 * Convert wall-clock date & time components in a given IANA timezone to exact epoch nanoseconds.
 * Uses two-pass offset convergence so DST transitions resolve accurately.
 */
export function zonedPartsToEpochNs(
  input: WallClockInput,
  timeZone: string,
): bigint | null {
  const { year, month, day, hour, minute, second } = input;
  const nanosecond = input.nanosecond ?? 0;

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    !Number.isInteger(hour) ||
    !Number.isInteger(minute) ||
    !Number.isInteger(second) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59 ||
    second < 0 ||
    second > 59 ||
    nanosecond < 0 ||
    nanosecond >= 1_000_000_000
  ) {
    return null;
  }

  // Reject impossible calendar days (e.g., Feb 30)
  const probe = new Date(Date.UTC(year, month - 1, day, hour, minute, second, 0));
  probe.setUTCFullYear(year);
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    return null;
  }

  const wallAsUtcMs = probe.getTime();
  const safeTz = isValidTimezone(timeZone) ? timeZone : 'UTC';
  if (safeTz === 'UTC') {
    return BigInt(wallAsUtcMs) * NS_PER_MS + BigInt(nanosecond);
  }

  // Pass 1: estimate offset at wallAsUtcMs
  const pass1 = epochNsToZonedParts(BigInt(wallAsUtcMs) * NS_PER_MS, safeTz);
  let candidateMs = wallAsUtcMs - pass1.offsetMinutes * 60_000;

  // Pass 2: re-evaluate offset at candidateMs (handles DST shifts)
  const pass2 = epochNsToZonedParts(BigInt(candidateMs) * NS_PER_MS, safeTz);
  if (pass2.offsetMinutes !== pass1.offsetMinutes) {
    candidateMs = wallAsUtcMs - pass2.offsetMinutes * 60_000;
  }

  return BigInt(candidateMs) * NS_PER_MS + BigInt(nanosecond);
}

/**
 * Compute day delta (-1, 0, +1) between a target timezone's calendar date and a reference timezone's calendar date.
 */
export function calendarDayDelta(
  target: Pick<ZonedDateTimeParts, 'year' | 'month' | 'day'>,
  reference: Pick<ZonedDateTimeParts, 'year' | 'month' | 'day'>,
): number {
  const tUtc = Date.UTC(target.year, target.month - 1, target.day);
  const rUtc = Date.UTC(reference.year, reference.month - 1, reference.day);
  return Math.round((tUtc - rUtc) / 86_400_000);
}
