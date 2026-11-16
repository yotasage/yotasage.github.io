// Units: conversions, reading typed values (never throws, a value or a reason), writing.

import * as U0 from '../../../lib/emsim/units.ts';

const U = U0.default ?? U0;

export function run(t) {
  const { readLength, readPlain, readFrequency, readTolerance, toMm, fromMm, formatLength, MM_PER_MIL, MM_PER_OZ } = U;
  t.eq(MM_PER_MIL, 0.0254, 'mil');
  t.eq(MM_PER_OZ, 0.03479, '1 oz/ft² = 34.79 µm');
  for (const u of U.LENGTH_UNITS) for (const x of [0.1377, 1, 1e-3, 3.14159]) t.near(fromMm(toMm(x, u), u), x, `${u} round trip ${x}`, 1e-15);
  const cases = [
    ['0.1377', 'mm', 0.1377], ['5.42 mil', 'mm', 5.42 * 0.0254], ['5.42mil', 'mm', 5.42 * 0.0254], ['35 µm', 'mm', 0.035],
    ['35um', 'mm', 0.035], ['35 μm', 'mm', 0.035], ['1 oz', 'mm', 0.03479], ['½ oz', 'mm', 0.03479 / 2], ['1/2 oz', 'mm', 0.03479 / 2],
    ['0,1 mm', 'mm', 0.1], ['0.005 in', 'mm', 0.127], ['0.005"', 'mm', 0.127], ['3 thou', 'mm', 0.0762], ['1.6e-2 mm', 'mm', 0.016],
    ['2', 'mil', 0.0508], ['0.2 cm', 'mm', 2], ['  .5  ', 'mm', 0.5], ['1.2', 'um', 0.0012],
  ];
  for (const [text, unit, mm] of cases) {
    const r = readLength(text, unit);
    t.ok(r.ok && Math.abs(r.value - mm) < 1e-15, () => `readLength("${text}", ${unit}): ${JSON.stringify(r)}, wanted ${mm}`);
  }
  for (const text of ['', 'abc', '5 furlongs', '-0.1', '0', '1/0 mm', '1e999', '0.1.2', '--1', null, undefined, {}, 'mm']) {
    let r;
    let threw = false;
    try { r = readLength(text, 'mm'); } catch { threw = true; }
    t.ok(!threw && r && r.ok === false && typeof r.reason === 'string' && r.reason.length > 0, () => `readLength(${JSON.stringify(text)}) should give a reason: ${JSON.stringify(r)}`);
  }
  t.ok(readLength('-0.1', 'mm', { negative: true }).ok, 'negative allowed');
  t.ok(readLength('0', 'mm', { zero: true }).ok, 'zero allowed');
  t.ok(readPlain('4,1').ok && readPlain('4,1').value === 4.1, 'readPlain comma');
  t.ok(readPlain('2e-2').value === 0.02, 'readPlain exponent');
  t.ok(!readPlain('0.5', { min: 1, what: 'εr' }).ok, 'readPlain min');
  t.ok(!readPlain('x').ok, 'readPlain text');
  t.eq(readFrequency('1 GHz').value, 1e9, 'readFrequency GHz');
  t.eq(readFrequency('100MHz').value, 1e8, 'readFrequency MHz');
  t.ok(!readFrequency('fast').ok && !readFrequency('0 Hz').ok, 'readFrequency refuses');
  t.near(readTolerance('±10%').value.rel, 0.1, 'tolerance %');
  t.near(readTolerance('± 0.5 mil').value.abs, 0.0127, 'tolerance mil');
  t.near(readTolerance('0.02', 'mm', true).value.abs, 0.02, 'tolerance plain');
  t.ok(!readTolerance('-5%').ok && !readTolerance('').ok, 'tolerance refuses');
  t.eq(formatLength(0.1377, 'mil'), '5.421 mil', 'formatLength mil');
  t.eq(formatLength(0.035, 'um'), '35 µm', 'formatLength µm');
  t.eq(formatLength(-0.5, 'mm'), '−0.5 mm', 'formatLength minus');
}
