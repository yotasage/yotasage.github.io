import assert from 'node:assert/strict';
import test from 'node:test';

import {
  computeAlternateEpochs,
  computeCalendarMeta,
  computeRelativeParts,
  formatTimestampAll,
} from './format';
import { applyOffset, computeDuration, parseBatchInput, serializeBatchRows } from './math';
import { NS_PER_MS, NS_PER_SEC, parseTimestampInput } from './parse';
import { calendarDayDelta, epochNsToZonedParts, zonedPartsToEpochNs } from './timezone';

test('parses Unix seconds, milliseconds, microseconds, and nanoseconds in auto mode', () => {
  const s = parseTimestampInput('1700000000', 'auto');
  assert.equal(s.ok, true);
  if (s.ok) {
    assert.equal(s.detectedKind, 'unix-s');
    assert.equal(s.epochNs, 1_700_000_000n * NS_PER_SEC);
  }

  const ms = parseTimestampInput('1700000000123', 'auto');
  assert.equal(ms.ok, true);
  if (ms.ok) {
    assert.equal(ms.detectedKind, 'unix-ms');
    assert.equal(ms.epochNs, 1_700_000_000_123n * NS_PER_MS);
  }

  const us = parseTimestampInput('1700000000123456', 'auto');
  assert.equal(us.ok, true);
  if (us.ok) {
    assert.equal(us.detectedKind, 'unix-us');
    assert.equal(us.epochNs, 1_700_000_000_123_456_000n);
  }

  const ns = parseTimestampInput('1700000000123456789', 'auto');
  assert.equal(ns.ok, true);
  if (ns.ok) {
    assert.equal(ns.detectedKind, 'unix-ns');
    assert.equal(ns.epochNs, 1_700_000_000_123_456_789n);
  }
});

test('respects explicit unit override and fractional seconds', () => {
  const asMs = parseTimestampInput('1700000000', 'ms');
  assert.equal(asMs.ok, true);
  if (asMs.ok) {
    assert.equal(asMs.detectedKind, 'unix-ms');
    assert.equal(asMs.epochNs, 1_700_000_000n * NS_PER_MS);
  }

  const frac = parseTimestampInput('1700000000.25', 's');
  assert.equal(frac.ok, true);
  if (frac.ok) {
    assert.equal(frac.epochNs, 1_700_000_000_250_000_000n);
  }

  const neg = parseTimestampInput('-86400', 'auto');
  assert.equal(neg.ok, true);
  if (neg.ok) {
    const out = formatTimestampAll(neg.epochNs, 'UTC');
    assert.equal(out.isoUtc, '1969-12-31T00:00:00.000Z');
  }
});

test('parses ISO 8601, SQL, RFC 2822, hex, UUIDv7, and MongoDB ObjectId', () => {
  const iso = parseTimestampInput('2026-11-26T20:39:25.123456789+01:00');
  assert.equal(iso.ok, true);
  if (iso.ok) {
    assert.equal(iso.detectedKind, 'iso8601');
    const out = formatTimestampAll(iso.epochNs, 'UTC');
    assert.equal(out.isoUtcNano, '2026-11-26T19:39:25.123456789Z');
  }

  const sql = parseTimestampInput('2023-11-14 22:13:20');
  assert.equal(sql.ok, true);
  if (sql.ok) {
    assert.equal(sql.detectedKind, 'sql');
    assert.equal(sql.epochNs, 1_700_000_000n * NS_PER_SEC);
  }

  const rfc = parseTimestampInput('Tue, 14 Nov 2023 22:13:20 GMT');
  assert.equal(rfc.ok, true);
  if (rfc.ok) {
    assert.equal(rfc.detectedKind, 'rfc2822');
    assert.equal(rfc.epochNs, 1_700_000_000n * NS_PER_SEC);
  }

  const hex = parseTimestampInput('0x7fffffff');
  assert.equal(hex.ok, true);
  if (hex.ok) {
    assert.equal(hex.detectedKind, 'hex');
    assert.equal(hex.epochNs, 2_147_483_647n * NS_PER_SEC);
  }

  // UUIDv7 with 0x018bd064dc00 ms = 1700008385536 ms
  const uuid = parseTimestampInput('018bd064-dc00-7000-8000-000000000000');
  assert.equal(uuid.ok, true);
  if (uuid.ok) {
    assert.equal(uuid.detectedKind, 'uuidv7');
    assert.equal(uuid.epochNs, 0x018bd064dc00n * NS_PER_MS);
  }

  // MongoDB ObjectId starting with 6553f100 = 1700000000 seconds
  const oid = parseTimestampInput('6553f100aabbccddeeff0011');
  assert.equal(oid.ok, true);
  if (oid.ok) {
    assert.equal(oid.detectedKind, 'objectid');
    assert.equal(oid.epochNs, 1_700_000_000n * NS_PER_SEC);
  }
});

test('rejects invalid inputs with structured error codes', () => {
  assert.deepEqual(parseTimestampInput(''), { ok: false, code: 'empty' });
  assert.deepEqual(parseTimestampInput('not-a-timestamp'), { ok: false, code: 'unrecognized' });
  assert.deepEqual(parseTimestampInput('2026-02-30T12:00:00Z'), { ok: false, code: 'invalid-date' });
  assert.deepEqual(parseTimestampInput('999999999999999999999999999999', 's'), {
    ok: false,
    code: 'out-of-range',
  });
});

test('converts wall-clock times accurately across IANA timezones including DST', () => {
  // Winter in Europe/Oslo (CET = UTC+01:00): 2026-01-15 12:00:00 -> 11:00:00Z
  const winterNs = zonedPartsToEpochNs(
    { year: 2026, month: 1, day: 15, hour: 12, minute: 0, second: 0, nanosecond: 0 },
    'Europe/Oslo',
  );
  assert.notEqual(winterNs, null);
  const winterUtc = epochNsToZonedParts(winterNs!, 'UTC');
  assert.equal(winterUtc.hour, 11);

  // Summer in Europe/Oslo (CEST = UTC+02:00): 2026-07-15 12:00:00 -> 10:00:00Z
  const summerNs = zonedPartsToEpochNs(
    { year: 2026, month: 7, day: 15, hour: 12, minute: 0, second: 0, nanosecond: 0 },
    'Europe/Oslo',
  );
  assert.notEqual(summerNs, null);
  const summerUtc = epochNsToZonedParts(summerNs!, 'UTC');
  assert.equal(summerUtc.hour, 10);

  // Day delta between UTC and Asia/Tokyo at 2026-11-26T20:00:00Z (Tokyo is 2026-11-27 05:00)
  const utcEvening = zonedPartsToEpochNs(
    { year: 2026, month: 11, day: 26, hour: 20, minute: 0, second: 0 },
    'UTC',
  )!;
  const tokyoParts = epochNsToZonedParts(utcEvening, 'Asia/Tokyo');
  const utcParts = epochNsToZonedParts(utcEvening, 'UTC');
  assert.equal(calendarDayDelta(tokyoParts, utcParts), 1);
});

test('formats calendar metadata, Y2038 status, and alternate system epochs accurately', () => {
  // 2038-01-19T03:14:07Z = 2147483647 (last safe signed 32-bit second)
  const y2038Safe = 2_147_483_647n * NS_PER_SEC;
  const outSafe = formatTimestampAll(y2038Safe, 'UTC');
  assert.equal(outSafe.isoUtc, '2038-01-19T03:14:07.000Z');
  assert.equal(outSafe.hexSeconds, '0x7fffffff');
  assert.equal(outSafe.calendar.signed32BitStatus, 'safe');

  const y2038Over = 2_147_483_648n * NS_PER_SEC;
  const metaOver = computeCalendarMeta(epochNsToZonedParts(y2038Over, 'UTC'), 2_147_483_648n);
  assert.equal(metaOver.signed32BitStatus, 'positive-overflow');
  assert.equal(metaOver.unsigned32BitSafe, true);

  // ISO week rollover edge cases (2026 Jan 4 is Sunday -> Week 1 starts 2025-12-29)
  const nov2026 = zonedPartsToEpochNs(
    { year: 2026, month: 11, day: 26, hour: 12, minute: 0, second: 0 },
    'UTC',
  )!;
  const metaNov2026 = formatTimestampAll(nov2026, 'UTC').calendar;
  assert.equal(metaNov2026.isoWeekYear, 2026);
  assert.equal(metaNov2026.isoWeek, 48);

  const jan2021 = zonedPartsToEpochNs(
    { year: 2021, month: 1, day: 1, hour: 0, minute: 0, second: 0 },
    'UTC',
  )!;
  const metaJan2021 = formatTimestampAll(jan2021, 'UTC').calendar;
  assert.equal(metaJan2021.isoWeekYear, 2020);
  assert.equal(metaJan2021.isoWeek, 53);

  // Unix epoch 0 -> FILETIME = 116444736000000000, Excel = 25569.00000, JD = 2440587.50000
  const alt = computeAlternateEpochs(0n);
  assert.equal(alt.filetime, '116444736000000000');
  assert.equal(alt.cocoaSeconds, '-978307200');
  assert.equal(alt.ntpSeconds, '2208988800');
  assert.equal(alt.julianDate, '2440587.50000');
  assert.equal(alt.excelSerial, '25569.00000');
});

test('computes relative time, durations, calendar offsets, and batch CSV serialization', () => {
  const rel = computeRelativeParts(1_700_003_600n * NS_PER_SEC, 1_700_000_000 * 1000);
  assert.equal(rel.relation, 'future');
  assert.equal(rel.primaryUnit, 'h');
  assert.equal(rel.primaryValue, 1);

  const dur = computeDuration(1_700_000_000n * NS_PER_SEC, (1_700_000_000n + 90_061n) * NS_PER_SEC);
  assert.equal(dur.negative, false);
  assert.equal(dur.days, 1);
  assert.equal(dur.hours, 1);
  assert.equal(dur.minutes, 1);
  assert.equal(dur.seconds, 1);
  assert.equal(dur.isoDuration, 'P1DT1H1M1S');

  // Jan 31 + 1 month clamps to Feb 28 in non-leap year 2026
  const jan31 = zonedPartsToEpochNs({ year: 2026, month: 1, day: 31, hour: 12, minute: 0, second: 0 }, 'UTC')!;
  const shifted = applyOffset(jan31, {
    sign: 1,
    years: 0,
    months: 1,
    weeks: 0,
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0,
  });
  assert.notEqual(shifted, null);
  assert.equal(formatTimestampAll(shifted!, 'UTC').isoUtc, '2026-02-28T12:00:00.000Z');

  const rows = parseBatchInput('1700000000\n2026-11-26T12:00:00Z\nbad-input', 'auto', 'UTC');
  assert.equal(rows.length, 3);
  assert.equal(rows[0].result.ok, true);
  assert.equal(rows[1].result.ok, true);
  assert.equal(rows[2].result.ok, false);

  const csv = serializeBatchRows(rows, ',', 'UTC');
  assert.match(csv, /^Input,Status,ISO 8601 \(UTC\),ISO 8601 \(UTC\),Unix \(s\),Unix \(ms\)/);
  assert.match(csv, /2023-11-14T22:13:20\.000Z/);
});
