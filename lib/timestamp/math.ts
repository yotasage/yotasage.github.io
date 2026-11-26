import { formatIsoString, getDaysInMonth } from './format';
import {
  floorDivBigInt,
  isEpochNsInRange,
  NS_PER_MS,
  NS_PER_SEC,
  parseTimestampInput,
} from './parse';
import { epochNsToZonedParts, zonedPartsToEpochNs } from './timezone';
import { getParseErrorCode } from './types';
import type { BatchRow, DurationBreakdown, EpochUnit, OffsetSpec } from './types';

/**
 * Compute exact duration breakdown between startNs and endNs (endNs - startNs).
 */
export function computeDuration(startNs: bigint, endNs: bigint): DurationBreakdown {
  const diffNs = endNs - startNs;
  const negative = diffNs < 0n;
  const absNs = negative ? -diffNs : diffNs;

  const totalMsNum = Number(absNs) / 1_000_000;
  const totalSecNum = Number(absNs) / 1_000_000_000;
  const totalMinNum = totalSecNum / 60;
  const totalHourNum = totalSecNum / 3600;
  const totalDayNum = totalSecNum / 86_400;

  const wholeMs = floorDivBigInt(absNs, NS_PER_MS);
  const milliseconds = Number(wholeMs % 1000n);
  const wholeSec = floorDivBigInt(absNs, NS_PER_SEC);
  const seconds = Number(wholeSec % 60n);
  const totalMinutesInt = wholeSec / 60n;
  const minutes = Number(totalMinutesInt % 60n);
  const totalHoursInt = totalMinutesInt / 60n;
  const hours = Number(totalHoursInt % 24n);
  const days = Number(totalHoursInt / 24n);

  // Build ISO 8601 duration string (e.g. P3DT4H12M5.250S or PT0S)
  const datePart = days > 0 ? `${days}D` : '';
  const timeSegments: string[] = [];
  if (hours > 0) timeSegments.push(`${hours}H`);
  if (minutes > 0) timeSegments.push(`${minutes}M`);
  if (seconds > 0 || milliseconds > 0 || (days === 0 && hours === 0 && minutes === 0)) {
    const secStr =
      milliseconds > 0
        ? `${seconds}.${String(milliseconds).padStart(3, '0').replace(/0+$/, '')}`
        : String(seconds);
    timeSegments.push(`${secStr}S`);
  }
  const prefix = negative ? '-P' : 'P';
  const isoDuration = `${prefix}${datePart}${timeSegments.length > 0 ? `T${timeSegments.join('')}` : ''}`;

  return {
    negative,
    totalNanoseconds: diffNs,
    totalMilliseconds: negative ? -totalMsNum : totalMsNum,
    totalSeconds: negative ? -totalSecNum : totalSecNum,
    totalMinutes: negative ? -totalMinNum : totalMinNum,
    totalHours: negative ? -totalHourNum : totalHourNum,
    totalDays: negative ? -totalDayNum : totalDayNum,
    days,
    hours,
    minutes,
    seconds,
    milliseconds,
    isoDuration,
  };
}

/**
 * Add or subtract calendar years/months (in UTC) and fixed time deltas (weeks/days/hours/min/sec)
 * to a base epoch nanosecond instant.
 */
export function applyOffset(baseNs: bigint, offset: OffsetSpec): bigint | null {
  const s = offset.sign;
  let currentNs = baseNs;

  // Calendar years & months applied in UTC with day clamping (e.g., Jan 31 + 1 month -> Feb 28/29)
  const deltaMonths = s * (Math.trunc(offset.years) * 12 + Math.trunc(offset.months));
  if (deltaMonths !== 0) {
    const parts = epochNsToZonedParts(currentNs, 'UTC');
    const totalMonths = parts.year * 12 + (parts.month - 1) + deltaMonths;
    const targetYear = Math.floor(totalMonths / 12);
    const targetMonth = ((totalMonths % 12) + 12) % 12 + 1;
    const clampedDay = Math.min(parts.day, getDaysInMonth(targetYear, targetMonth));
    const shifted = zonedPartsToEpochNs(
      {
        year: targetYear,
        month: targetMonth,
        day: clampedDay,
        hour: parts.hour,
        minute: parts.minute,
        second: parts.second,
        nanosecond: parts.nanosecond,
      },
      'UTC',
    );
    if (shifted === null) return null;
    currentNs = shifted;
  }

  const fixedSeconds =
    BigInt(s) *
    (BigInt(Math.trunc(offset.weeks)) * 604_800n +
      BigInt(Math.trunc(offset.days)) * 86_400n +
      BigInt(Math.trunc(offset.hours)) * 3_600n +
      BigInt(Math.trunc(offset.minutes)) * 60n +
      BigInt(Math.trunc(offset.seconds)));

  const nextNs = currentNs + fixedSeconds * NS_PER_SEC;
  if (!isEpochNsInRange(nextNs)) return null;
  return nextNs;
}

/**
 * Parse a multi-line batch of timestamps or date strings (skipping empty lines).
 */
export function parseBatchInput(
  text: string,
  unitOverride: EpochUnit,
  selectedZone: string,
): readonly BatchRow[] {
  const lines = text.split(/\r?\n/);
  const rows: BatchRow[] = [];

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i].trim();
    if (!raw) continue;
    const result = parseTimestampInput(raw, unitOverride);
    if (result.ok) {
      const utc = epochNsToZonedParts(result.epochNs, 'UTC');
      const zoned = epochNsToZonedParts(result.epochNs, selectedZone);
      rows.push({
        lineNumber: i + 1,
        raw,
        result,
        isoUtc: formatIsoString(utc, 'ms'),
        isoZoned: formatIsoString(zoned, 'ms'),
        seconds: floorDivBigInt(result.epochNs, NS_PER_SEC).toString(),
        milliseconds: floorDivBigInt(result.epochNs, NS_PER_MS).toString(),
      });
    } else {
      rows.push({
        lineNumber: i + 1,
        raw,
        result,
        isoUtc: '',
        isoZoned: '',
        seconds: '',
        milliseconds: '',
      });
    }
  }

  return rows;
}

function escapeCsvCell(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function serializeBatchRows(
  rows: readonly BatchRow[],
  delimiter: ',' | '\t',
  zoneLabel: string,
): string {
  const headers = ['Input', 'Status', 'ISO 8601 (UTC)', `ISO 8601 (${zoneLabel})`, 'Unix (s)', 'Unix (ms)'];
  const encode = (cell: string) =>
    delimiter === ',' ? escapeCsvCell(cell) : cell.replace(/[\t\r\n]+/g, ' ');

  const lines = [headers.map(encode).join(delimiter)];
  for (const row of rows) {
    const status = row.result.ok
      ? row.result.detectedKind
      : `error:${getParseErrorCode(row.result) ?? 'unrecognized'}`;
    lines.push(
      [row.raw, status, row.isoUtc, row.isoZoned, row.seconds, row.milliseconds]
        .map(encode)
        .join(delimiter),
    );
  }
  return lines.join('\n');
}
