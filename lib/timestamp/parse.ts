import type {
  ConcreteEpochUnit,
  DetectedFormatKind,
  EpochUnit,
  ParseResult,
} from './types';

export const NS_PER_US = 1_000n;
export const NS_PER_MS = 1_000_000n;
export const NS_PER_SEC = 1_000_000_000n;

// JavaScript Date supports ±8,640,000,000,000,000 ms (~±273,790 years around 1970).
// Keep supported range safely within civil/ISO 4-digit + extended Date range: year -9999 to +9999.
export const MIN_EPOCH_MS = -62_135_596_800_000; // 0001-01-01T00:00:00.000Z (and we allow down to -9999)
export const MIN_SUPPORTED_MS = -377_705_116_800_000; // -009999-01-01T00:00:00.000Z
export const MAX_SUPPORTED_MS = 253_402_300_799_999; // 9999-12-31T23:59:59.999Z
export const MIN_SUPPORTED_NS = BigInt(MIN_SUPPORTED_MS) * NS_PER_MS;
export const MAX_SUPPORTED_NS = BigInt(MAX_SUPPORTED_MS) * NS_PER_MS + 999_999n;

const FILETIME_EPOCH_DIFF_100NS = 116_444_736_000_000_000n; // 1601-01-01 to 1970-01-01 in 100ns ticks
const COCOA_EPOCH_DIFF_SEC = 978_307_200n; // 2001-01-01T00:00:00Z in Unix seconds

/** Floor division for BigInt (always rounds toward -Infinity, matching Unix epoch floor semantics). */
export function floorDivBigInt(a: bigint, b: bigint): bigint {
  const q = a / b;
  const r = a % b;
  if (r !== 0n && (a < 0n) !== (b < 0n)) {
    return q - 1n;
  }
  return q;
}

/** Non-negative remainder for BigInt given positive divisor b. */
export function floorModBigInt(a: bigint, b: bigint): bigint {
  const r = a % b;
  return r < 0n ? r + b : r;
}

export function isEpochNsInRange(epochNs: bigint): boolean {
  return epochNs >= MIN_SUPPORTED_NS && epochNs <= MAX_SUPPORTED_NS;
}

/**
 * Infer concrete epoch unit from magnitude of a numeric timestamp.
 * Uses standard digit-count boundaries:
 *   <= 11 digits (|v| < 1e11)  -> seconds (covers up to year 5138)
 *   12..14 digits (< 1e14)     -> milliseconds (covers up to year 5138)
 *   15..17 digits (< 1e17)     -> microseconds
 *   >= 18 digits               -> nanoseconds
 */
export function inferNumericUnit(absIntPart: bigint): ConcreteEpochUnit {
  if (absIntPart < 100_000_000_000n) return 's';
  if (absIntPart < 100_000_000_000_000n) return 'ms';
  if (absIntPart < 100_000_000_000_000_000n) return 'us';
  return 'ns';
}

function unitToScaleNs(unit: ConcreteEpochUnit): bigint {
  switch (unit) {
    case 's':
      return NS_PER_SEC;
    case 'ms':
      return NS_PER_MS;
    case 'us':
      return NS_PER_US;
    case 'ns':
      return 1n;
  }
}

function unitToKind(unit: ConcreteEpochUnit): DetectedFormatKind {
  switch (unit) {
    case 's':
      return 'unix-s';
    case 'ms':
      return 'unix-ms';
    case 'us':
      return 'unix-us';
    case 'ns':
      return 'unix-ns';
  }
}

function parseDecimalNumericEpoch(
  raw: string,
  unitOverride: EpochUnit,
): ParseResult {
  // Allow optional leading +/- and optional underscores/spaces/commas as grouping?
  // Be careful: commas can appear in RFC 2822 ("Thu, 26 Nov..."), so only match pure numeric with optional _ separators.
  const cleaned = raw.replace(/_/g, '');
  const m = /^([+-]?)(\d+)(?:\.(\d+))?$/.exec(cleaned);
  if (!m) return { ok: false, code: 'unrecognized' };

  const neg = m[1] === '-';
  const intDigits = m[2];
  const fracDigits = m[3] ?? '';

  const intBig = BigInt(intDigits);
  const concreteUnit: ConcreteEpochUnit =
    unitOverride === 'auto' ? inferNumericUnit(intBig) : unitOverride;

  const scale = unitToScaleNs(concreteUnit);
  const scaleDigits = concreteUnit === 's' ? 9 : concreteUnit === 'ms' ? 6 : concreteUnit === 'us' ? 3 : 0;

  let fracNs = 0n;
  if (fracDigits.length > 0 && scaleDigits > 0) {
    const padded = fracDigits.slice(0, scaleDigits).padEnd(scaleDigits, '0');
    fracNs = BigInt(padded);
  }

  let totalNs = intBig * scale + fracNs;
  if (neg) totalNs = -totalNs;

  if (!isEpochNsInRange(totalNs)) {
    return { ok: false, code: 'out-of-range' };
  }

  return {
    ok: true,
    epochNs: totalNs,
    detectedKind: unitToKind(concreteUnit),
    detectedUnit: concreteUnit,
    isNumericEpoch: true,
    digitCount: intDigits.length,
  };
}

/**
 * Parse strict ISO 8601 / RFC 3339 / SQL-like date-time string with optional up to 9 fractional digits.
 * Examples:
 *   2026-11-26
 *   2026-11-26T19:39:25Z
 *   2026-11-26 19:39:25.123456789+01:00
 *   2026-11-26T19:39:25.5-0800
 */
function parseIsoOrSql(raw: string): ParseResult | null {
  const isoRe =
    /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s](\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?)?(?:\s*(Z|z|[+-]\d{2}:?\d{2}))?$/;
  const m = isoRe.exec(raw);
  if (!m) return null;

  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const hasTime = m[4] !== undefined;
  const hour = hasTime ? Number(m[4]) : 0;
  const minute = hasTime ? Number(m[5]) : 0;
  const second = m[6] !== undefined ? Number(m[6]) : 0;
  const fracStr = m[7] ?? '';
  const tzToken = m[8];

  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return { ok: false, code: 'invalid-date' };
  }
  if (hour > 23 || minute > 59 || second > 59) {
    return { ok: false, code: 'invalid-date' };
  }

  // Validate real calendar date (reject e.g. 2026-02-30)
  const check = new Date(Date.UTC(year, month - 1, day, hour, minute, second, 0));
  check.setUTCFullYear(year);
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    return { ok: false, code: 'invalid-date' };
  }

  let offsetMinutes = 0;
  if (tzToken && tzToken !== 'Z' && tzToken !== 'z') {
    const sign = tzToken[0] === '-' ? -1 : 1;
    const digits = tzToken.slice(1).replace(':', '');
    const offH = Number(digits.slice(0, 2));
    const offM = Number(digits.slice(2, 4));
    if (offH > 23 || offM > 59) {
      return { ok: false, code: 'invalid-date' };
    }
    offsetMinutes = sign * (offH * 60 + offM);
  }

  const utcMs = check.getTime() - offsetMinutes * 60_000;
  const fracNs = fracStr ? BigInt(fracStr.padEnd(9, '0')) : 0n;
  const epochNs = BigInt(utcMs) * NS_PER_MS + fracNs;

  if (!isEpochNsInRange(epochNs)) {
    return { ok: false, code: 'out-of-range' };
  }

  const isSql = raw.includes(' ') && !raw.includes('T') && !tzToken;
  return {
    ok: true,
    epochNs,
    detectedKind: isSql ? 'sql' : 'iso8601',
    isNumericEpoch: false,
  };
}

/**
 * Parse a UUIDv7 string (RFC 9562): first 48 bits are Unix timestamp in milliseconds.
 * Format: xxxxxxxx-xxxx-7xxx-[89ab]xxx-xxxxxxxxxxxx
 */
function parseUuidV7(raw: string): ParseResult | null {
  const m =
    /^([0-9a-fA-F]{8})-([0-9a-fA-F]{4})-7[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/.exec(
      raw,
    );
  if (!m) return null;
  const hex48 = m[1] + m[2];
  const ms = BigInt(`0x${hex48}`);
  const epochNs = ms * NS_PER_MS;
  if (!isEpochNsInRange(epochNs)) {
    return { ok: false, code: 'out-of-range' };
  }
  return {
    ok: true,
    epochNs,
    detectedKind: 'uuidv7',
    detectedUnit: 'ms',
    isNumericEpoch: false,
  };
}

/**
 * Parse a 24-hex-character MongoDB ObjectId: first 8 hex chars (32 bits) are Unix seconds.
 */
function parseMongoObjectId(raw: string): ParseResult | null {
  if (!/^[0-9a-fA-F]{24}$/.test(raw)) return null;
  // Ensure it isn't purely decimal digits (24 decimal digits could be an overly long decimal timestamp)
  if (/^\d{24}$/.test(raw)) return null;
  const sec = BigInt(`0x${raw.slice(0, 8)}`);
  const epochNs = sec * NS_PER_SEC;
  if (!isEpochNsInRange(epochNs)) {
    return { ok: false, code: 'out-of-range' };
  }
  return {
    ok: true,
    epochNs,
    detectedKind: 'objectid',
    detectedUnit: 's',
    isNumericEpoch: false,
  };
}

/**
 * Parse explicit hexadecimal timestamp (0x...) as Unix seconds (or overridden unit).
 */
function parseHexTimestamp(raw: string, unitOverride: EpochUnit): ParseResult | null {
  const m = /^([+-]?)0[xX]([0-9a-fA-F_]+)$/.exec(raw);
  if (!m) return null;
  const hexDigits = m[2].replace(/_/g, '');
  if (!hexDigits) return { ok: false, code: 'unrecognized' };
  const neg = m[1] === '-';
  const val = BigInt(`0x${hexDigits}`);
  const concreteUnit: ConcreteEpochUnit = unitOverride === 'auto' ? 's' : unitOverride;
  const epochNs = (neg ? -val : val) * unitToScaleNs(concreteUnit);
  if (!isEpochNsInRange(epochNs)) {
    return { ok: false, code: 'out-of-range' };
  }
  return {
    ok: true,
    epochNs,
    detectedKind: 'hex',
    detectedUnit: concreteUnit,
    isNumericEpoch: true,
  };
}

/**
 * Parse explicit prefixed alternate epochs:
 *   filetime:133444736000000000
 *   cocoa:721692800
 */
function parsePrefixedEpoch(raw: string): ParseResult | null {
  const ft = /^(?:filetime|ft)\s*:\s*([+-]?\d+)$/i.exec(raw);
  if (ft) {
    const ticks100ns = BigInt(ft[1]);
    const epochNs = (ticks100ns - FILETIME_EPOCH_DIFF_100NS) * 100n;
    if (!isEpochNsInRange(epochNs)) return { ok: false, code: 'out-of-range' };
    return { ok: true, epochNs, detectedKind: 'filetime', isNumericEpoch: false };
  }

  const cocoa = /^(?:cocoa|apple|coredata)\s*:\s*([+-]?\d+(?:\.\d+)?)$/i.exec(raw);
  if (cocoa) {
    const num = parseDecimalNumericEpoch(cocoa[1], 's');
    if (!num.ok) return num;
    const epochNs = num.epochNs + COCOA_EPOCH_DIFF_SEC * NS_PER_SEC;
    if (!isEpochNsInRange(epochNs)) return { ok: false, code: 'out-of-range' };
    return { ok: true, epochNs, detectedKind: 'cocoa', isNumericEpoch: false };
  }
  return null;
}

/**
 * Parse RFC 2822 / HTTP-date or human date strings via JS Date.parse,
 * only when they contain month names or weekday/GMT/UTC markers so random strings never match.
 */
function parseRfc2822OrHuman(raw: string): ParseResult | null {
  const hasMonthWord =
    /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/i.test(raw);
  if (!hasMonthWord) return null;

  const ms = Date.parse(raw);
  if (!Number.isFinite(ms)) {
    return { ok: false, code: 'invalid-date' };
  }
  const epochNs = BigInt(Math.trunc(ms)) * NS_PER_MS;
  if (!isEpochNsInRange(epochNs)) {
    return { ok: false, code: 'out-of-range' };
  }
  return {
    ok: true,
    epochNs,
    detectedKind: 'rfc2822',
    isNumericEpoch: false,
  };
}

/**
 * Smart universal parser for timestamps and date strings.
 */
export function parseTimestampInput(
  input: string,
  unitOverride: EpochUnit = 'auto',
): ParseResult {
  const trimmed = input.trim();
  if (!trimmed) {
    return { ok: false, code: 'empty' };
  }

  // 1. Explicit prefixed alternate epochs (filetime:..., cocoa:...)
  const prefixed = parsePrefixedEpoch(trimmed);
  if (prefixed) return prefixed;

  // 2. Explicit hex (0x...)
  const hex = parseHexTimestamp(trimmed, unitOverride);
  if (hex) return hex;

  // 3. UUIDv7 (RFC 9562)
  const uuid = parseUuidV7(trimmed);
  if (uuid) return uuid;

  // 4. Plain decimal numeric epoch (integer or fractional)
  if (/^[+-]?[\d_]+(?:\.[\d_]+)?$/.test(trimmed)) {
    return parseDecimalNumericEpoch(trimmed, unitOverride);
  }

  // 5. ISO 8601 / RFC 3339 / SQL datetime
  const iso = parseIsoOrSql(trimmed);
  if (iso) return iso;

  // 6. 24-char hex MongoDB ObjectId
  const oid = parseMongoObjectId(trimmed);
  if (oid) return oid;

  // 7. RFC 2822 / HTTP-date / English month-name date string
  const rfc = parseRfc2822OrHuman(trimmed);
  if (rfc) return rfc;

  return { ok: false, code: 'unrecognized' };
}
