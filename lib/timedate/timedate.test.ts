import assert from 'node:assert/strict';
import test from 'node:test';

import {
  addDays,
  addMonths,
  buildMonthGrid,
  buildMonthSpecs,
  daysInMonth,
  diffDays,
  getDayOfWeek,
  getDayOfYear,
  getIsoWeek,
  getIsoWeekRange,
  isLeapYear,
} from './calendar';
import {
  formatDotDate,
  formatIsoDate,
  formatOrdinalDate,
  getDateDetails,
  getOrdinalSuffix,
} from './format';

test('formats 2026-11-25 in all three requested formats', () => {
  const date = { year: 2026, month: 11, day: 25 };
  assert.equal(formatIsoDate(date), '2026-11-25');
  assert.equal(formatOrdinalDate(date), '25th of November 2026');
  assert.equal(formatDotDate(date, 'en'), '25. November 2026');
  assert.equal(formatDotDate(date, 'nb'), '25. November 2026');
});

test('ordinal suffix handles 1st, 2nd, 3rd, teens, and 21st-31st', () => {
  assert.equal(getOrdinalSuffix(1), 'st');
  assert.equal(getOrdinalSuffix(2), 'nd');
  assert.equal(getOrdinalSuffix(3), 'rd');
  assert.equal(getOrdinalSuffix(4), 'th');
  assert.equal(getOrdinalSuffix(11), 'th');
  assert.equal(getOrdinalSuffix(12), 'th');
  assert.equal(getOrdinalSuffix(13), 'th');
  assert.equal(getOrdinalSuffix(21), 'st');
  assert.equal(getOrdinalSuffix(22), 'nd');
  assert.equal(getOrdinalSuffix(23), 'rd');
  assert.equal(getOrdinalSuffix(25), 'th');
  assert.equal(getOrdinalSuffix(31), 'st');
});

test('date details expose day, month, year, ISO week, and weekday accurately', () => {
  const details = getDateDetails({ year: 2026, month: 11, day: 25 }, 'en');
  assert.equal(details.dayNumber, 25);
  assert.equal(details.dayName, 'Wednesday');
  assert.equal(details.monthNumber, 11);
  assert.equal(details.monthName, 'November');
  assert.equal(details.year, 2026);
  assert.equal(details.isoWeek, 48);
  assert.equal(details.isoWeekYear, 2026);
  assert.equal(details.isoWeekday, 3);
  assert.equal(details.isoWeekDate, '2026-W48-3');
  assert.equal(details.dayOfYear, 329);
  assert.equal(details.daysInYear, 365);
  assert.equal(details.isLeapYear, false);
  assert.equal(details.quarter, 4);
});

test('ISO 8601 week numbering handles year boundaries and 53-week years', () => {
  // 2026 starts on Thursday -> 53-week ISO year
  assert.deepEqual(getIsoWeek({ year: 2026, month: 1, day: 1 }), {
    week: 1,
    weekYear: 2026,
    isoWeekday: 4,
  });
  assert.deepEqual(getIsoWeek({ year: 2026, month: 12, day: 31 }), {
    week: 53,
    weekYear: 2026,
    isoWeekday: 4,
  });
  // 2021-01-01 (Friday) belongs to ISO week 53 of 2020
  assert.deepEqual(getIsoWeek({ year: 2021, month: 1, day: 1 }), {
    week: 53,
    weekYear: 2020,
    isoWeekday: 5,
  });
  // 2025-12-29 (Monday) belongs to ISO week 1 of 2026
  assert.deepEqual(getIsoWeek({ year: 2025, month: 12, day: 29 }), {
    week: 1,
    weekYear: 2026,
    isoWeekday: 1,
  });
});

test('ISO week range returns Monday to Sunday', () => {
  const range = getIsoWeekRange(2026, 48);
  assert.deepEqual(range.start, { year: 2026, month: 11, day: 23 });
  assert.deepEqual(range.end, { year: 2026, month: 11, day: 29 });
  assert.equal(getDayOfWeek(range.start), 1); // Monday
  assert.equal(getDayOfWeek(range.end), 0); // Sunday
});

test('leap year and days-in-month math', () => {
  assert.equal(isLeapYear(2024), true);
  assert.equal(isLeapYear(2026), false);
  assert.equal(isLeapYear(2000), true);
  assert.equal(isLeapYear(1900), false);
  assert.equal(daysInMonth(2024, 2), 29);
  assert.equal(daysInMonth(2026, 2), 28);
  assert.equal(getDayOfYear({ year: 2024, month: 12, day: 31 }), 366);
  assert.equal(diffDays({ year: 2026, month: 11, day: 25 }, { year: 2026, month: 12, day: 25 }), 30);
  assert.deepEqual(addDays({ year: 2024, month: 2, day: 28 }, 2), { year: 2024, month: 3, day: 1 });
});

test('buildMonthSpecs builds default 3 months including year rollovers', () => {
  const novSpecs = buildMonthSpecs({
    mode: 'three-months',
    anchorMonth: { year: 2026, month: 11 },
    selectedYear: 2026,
  });
  assert.deepEqual(novSpecs, [
    { year: 2026, month: 10 },
    { year: 2026, month: 11 },
    { year: 2026, month: 12 },
  ]);

  const janSpecs = buildMonthSpecs({
    mode: 'three-months',
    anchorMonth: { year: 2026, month: 1 },
    selectedYear: 2026,
  });
  assert.deepEqual(janSpecs, [
    { year: 2025, month: 12 },
    { year: 2026, month: 1 },
    { year: 2026, month: 2 },
  ]);
});

test('buildMonthSpecs builds +-6 months (13 months centered on anchor)', () => {
  const specs = buildMonthSpecs({
    mode: 'plus-minus-six',
    anchorMonth: { year: 2026, month: 11 },
    selectedYear: 2026,
  });
  assert.equal(specs.length, 13);
  assert.deepEqual(specs[0], { year: 2026, month: 5 });
  assert.deepEqual(specs[6], { year: 2026, month: 11 });
  assert.deepEqual(specs[12], { year: 2027, month: 5 });
});

test('buildMonthSpecs builds specific year and specific year with margin ahead', () => {
  const yearSpecs = buildMonthSpecs({
    mode: 'year',
    anchorMonth: { year: 2026, month: 11 },
    selectedYear: 2028,
  });
  assert.equal(yearSpecs.length, 12);
  assert.deepEqual(yearSpecs[0], { year: 2028, month: 1, isMargin: false });
  assert.deepEqual(yearSpecs[11], { year: 2028, month: 12, isMargin: false });

  const marginDefault = buildMonthSpecs({
    mode: 'year-margin',
    anchorMonth: { year: 2026, month: 11 },
    selectedYear: 2026,
  });
  assert.equal(marginDefault.length, 15);
  assert.equal(marginDefault[11].isMargin, false);
  assert.deepEqual(marginDefault[12], { year: 2027, month: 1, isMargin: true });
  assert.deepEqual(marginDefault[14], { year: 2027, month: 3, isMargin: true });

  const marginCustom = buildMonthSpecs({
    mode: 'year-margin',
    anchorMonth: { year: 2026, month: 11 },
    selectedYear: 2026,
    marginMonths: 6,
  });
  assert.equal(marginCustom.length, 18);
  assert.deepEqual(marginCustom[17], { year: 2027, month: 6, isMargin: true });
});

test('buildMonthGrid aligns Monday-first and Sunday-first weeks with ISO week numbers', () => {
  // November 2026 starts on Sunday (Nov 1, 2026 = ISO week 44)
  const monGrid = buildMonthGrid(2026, 11, 'monday');
  assert.equal(monGrid.rows.length, 6);
  assert.equal(monGrid.rows[0].isoWeek, 44);
  assert.equal(monGrid.rows[0].cells[6].inMonth, true);
  assert.deepEqual(monGrid.rows[0].cells[6].date, { year: 2026, month: 11, day: 1 });
  // Week 48 row contains Nov 25, 2026 (Wednesday at index 2)
  const w48 = monGrid.rows.find((row) => row.isoWeek === 48);
  assert.ok(w48);
  assert.deepEqual(w48.cells[2].date, { year: 2026, month: 11, day: 25 });

  // Sunday-start grid starts directly on Nov 1 (Sunday)
  const sunGrid = buildMonthGrid(2026, 11, 'sunday');
  assert.equal(sunGrid.rows.length, 5);
  assert.deepEqual(sunGrid.rows[0].cells[0].date, { year: 2026, month: 11, day: 1 });
  assert.equal(sunGrid.rows[0].isoWeek, 45);
});

test('addMonths wraps accurately across negative and positive year boundaries', () => {
  assert.deepEqual(addMonths({ year: 2026, month: 1 }, -1), { year: 2025, month: 12 });
  assert.deepEqual(addMonths({ year: 2026, month: 1 }, -13), { year: 2024, month: 12 });
  assert.deepEqual(addMonths({ year: 2026, month: 12 }, 1), { year: 2027, month: 1 });
});
