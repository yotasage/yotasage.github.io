// Checks of lib/resistor. Run with `npm run check` in this folder (tsx reads the TypeScript of the site as it is).
// Prints the failures and one summary line; the exit code is 1 when a check fails.

import * as imported from '../../../lib/resistor/index.ts';

const lib = imported.default ?? imported;
const {
  SERIES, series, seriesValues, neighbours, errorPct, inSeries, seriesContaining, step, usualSeries,
  formatOhms, formatRkm, formatError,
  decodeBands, encodeBands, coloursFromText,
  decodeMarking, encodeMarkings, flipMarking,
  readInput, CHIP_SIZES, AXIAL_BODIES, deratedPower,
} = lib;

let passed = 0;
const failures = [];
const groups = new Map();
let group = '';

function section(name) { group = name; groups.set(name, 0); }

function ok(condition, what) {
  groups.set(group, groups.get(group) + 1);
  if (condition) passed++;
  else failures.push(`[${group}] ${what}`);
}

const close = (a, b) => Math.abs(a - b) <= 1e-9 * Math.max(Math.abs(a), Math.abs(b));

function eq(actual, expected, what) {
  const same = typeof expected === 'number' && typeof actual === 'number' ? close(actual, expected) : actual === expected;
  ok(same, `${what}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)}`);
}

// The readings of a text as numbers.
const values = (text) => readInput(text).readings.map((r) => r.ohms);
const first = (text) => readInput(text).readings[0];

function reads(text, ohms, tolerance) {
  const r = first(text);
  ok(r && close(r.ohms, ohms), `"${text}" reads as ${ohms} Ω first: got ${r ? r.ohms : 'nothing'}`);
  if (tolerance !== undefined) ok(r && r.tolerance === tolerance, `"${text}" has tolerance ${tolerance} %: got ${r?.tolerance}`);
  ok(r && typeof r.how === 'string' && r.how.length > 5 && r.id, `"${text}" explains how it was read`);
}

function hasReading(text, ohms) {
  ok(values(text).some((v) => close(v, ohms)), `"${text}" has a reading of ${ohms} Ω: got ${JSON.stringify(values(text))}`);
}

// ---------------------------------------------------------------------------------------------------------------
section('E-series');
for (const [id, count] of [['E3', 3], ['E6', 6], ['E12', 12], ['E24', 24], ['E48', 48], ['E96', 96], ['E192', 192]]) {
  eq(series(id).mantissas.length, count, `${id} has ${count} values`);
  ok(series(id).mantissas.every((m, i, all) => m >= 100 && m < 1000 && (i === 0 || m > all[i - 1])), `${id} ascends within one decade`);
}
ok(series('E192').mantissas.includes(920), 'E192 contains 9.20');
ok(!series('E192').mantissas.includes(919), 'E192 does not contain 9.19');
eq(series('E24').mantissas.join(' '), '100 110 120 130 150 160 180 200 220 240 270 300 330 360 390 430 470 510 560 620 680 750 820 910', 'E24 is the fixed table');
eq(series('E12').mantissas.join(' '), '100 120 150 180 220 270 330 390 470 560 680 820', 'E12 is every 2nd of E24');
eq(series('E6').mantissas.join(' '), '100 150 220 330 470 680', 'E6 is every 4th of E24');
eq(series('E3').mantissas.join(' '), '100 220 470', 'E3 is every 8th of E24');
ok(series('E96').mantissas.every((m, i) => m === series('E192').mantissas[2 * i]), 'E96 is every 2nd of E192');
ok(series('E48').mantissas.every((m, i) => m === series('E192').mantissas[4 * i]), 'E48 is every 4th of E192');
eq(series('E96').mantissas[0], 100, 'EIA-96 code 01 is 100');
eq(series('E96').mantissas[67], 499, 'EIA-96 code 68 is 499');
eq(series('E96').mantissas[95], 976, 'EIA-96 code 96 is 976');
// Eight E24 values differ from the rounded formula: 2.7 to 4.7, and 8.2.
const offFormula = series('E24').mantissas.filter((m, n) => m !== Math.round(10 * 10 ** (n / 24)) * 10);
eq(offFormula.join(' '), '270 300 330 360 390 430 470 820', 'eight E24 values differ from the formula');
ok([120, 160, 180].every((m) => !series('E96').mantissas.includes(m)), 'E24 is not a subset of E96');
const union = series('E24+E96').mantissas;
ok(series('E24').mantissas.every((m) => union.includes(m)) && series('E96').mantissas.every((m) => union.includes(m)), 'the union holds E24 and E96');
eq(union.length, new Set([...series('E24').mantissas, ...series('E96').mantissas]).size, 'the union has no value twice');
eq(SERIES.length, 8, 'eight series are offered');

let n = neighbours(4700, 'E24');
ok(n.exact && n.nearest === 4700 && n.below === 4300 && n.above === 5100, '4.7 kΩ is exact in E24, between 4.3 kΩ and 5.1 kΩ');
n = neighbours(4850, 'E96');
ok(!n.exact && n.below === 4750 && n.above === 4870 && n.nearest === 4870, '4.85 kΩ lies between 4.75 kΩ and 4.87 kΩ in E96');
eq(errorPct(4870, 4850), (20 / 4850) * 100, 'signed error is positive for a larger value');
ok(errorPct(4750, 4850) < 0, 'signed error is negative for a smaller value');
n = neighbours(9.9, 'E3');
ok(n.below === 4.7 && n.above === 10 && n.nearest === 10, '9.9 Ω in E3 crosses the decade');
n = neighbours(1, 'E24');
ok(n.exact && n.below === 0.91 && n.above === 1.1, '1 Ω in E24 has 0.91 Ω below');
ok(inSeries(4990, 'E96') && !inSeries(4990, 'E24') && inSeries(1e6, 'E3'), 'membership');
eq(seriesContaining(4700).join(' '), 'E3 E6 E12 E24 E192', '4.7 kΩ is in E3 to E24 and E192, not in E48 and E96');
eq(seriesContaining(1000).join(' '), 'E3 E6 E12 E24 E48 E96 E192', '1 kΩ is in every series');
eq(step(4700, 'E24', 1), 5100, 'step up in E24');
eq(step(4700, 'E24', -1), 4300, 'step down in E24');
eq(step(4800, 'E24', 1), 5100, 'step up from a value between');
eq(step(9100, 'E24', 1), 10000, 'step over the decade');
eq(usualSeries(5), 'E24', '5 % is usual in E24');
eq(usualSeries(1), 'E96', '1 % is usual in E96');
eq(usualSeries(0.1), 'E192', '0.1 % is usual in E192');
eq(seriesValues('E96', 1, 1e7).length, 96 * 7 + 1, 'E96 from 1 Ω to 10 MΩ has 673 values');
eq(seriesValues('E192', 1, 1e7).length, 1345, 'E192 over seven decades has 1,345 values');
ok(seriesValues('E192', 1e-3, 1e9).every((v) => v === Number(v.toPrecision(3))), 'standard values are exact decimals');

// ---------------------------------------------------------------------------------------------------------------
section('Writing values');
for (const [ohms, text, rkm] of [
  [4700, '4.7 kΩ', '4k7'], [47, '47 Ω', '47R'], [4.7, '4.7 Ω', '4R7'], [0.47, '470 mΩ', 'R47'], [100, '100 Ω', '100R'],
  [1000, '1 kΩ', '1k'], [1e6, '1 MΩ', '1M'], [1.5e6, '1.5 MΩ', '1M5'], [49900, '49.9 kΩ', '49k9'], [0.01, '10 mΩ', 'R01'],
  [0.005, '5 mΩ', 'R005'], [1e9, '1 GΩ', '1G'], [0, '0 Ω', '0R'], [4870, '4.87 kΩ', '4k87'], [2.2e-5, '22 µΩ', 'L022'],
  [999999, '999.999 kΩ', '999k999'], [0.1 + 0.2, '300 mΩ', 'R3'],
]) {
  eq(formatOhms(ohms), text, `${ohms} Ω is written`);
  eq(formatRkm(ohms), rkm, `${ohms} Ω in RKM`);
  if (ohms > 0) {
    reads(text, ohms);
    reads(rkm, ohms);
  }
}
eq(formatError(0.4123), '+0.412 %', 'error with three digits');
eq(formatError(-3.0927), '−3.09 %', 'negative error with a real minus sign');
eq(formatError(0), '0 %', 'no error');

// ---------------------------------------------------------------------------------------------------------------
section('Reading values');
for (const [text, ohms] of [
  ['4700', 4700], ['4.7k', 4700], ['4,7k', 4700], ['4k7', 4700], ['4K7', 4700], ['4R7', 4.7], ['R47', 0.47], ['4E7', 4.7],
  ['1M', 1e6], ['1.5 Meg', 1.5e6], ['10m', 0.01], ['10 mΩ', 0.01], ['22µ', 22e-6], ['22u', 22e-6], ['1G', 1e9],
  ['4.7 kΩ', 4700], ['4.7 kohm', 4700], ['4.7kR', 4700], ['4k7 Ω', 4700], ['47R', 47], ['47 ohm', 47], ['47 Ω', 47], ['47Ω', 47],
  ['4,7 kΩ', 4700], ['10 MΩ', 1e7], ['10 mohm', 0.01], ['1.5meg', 1.5e6], ['1e3', 1000], ['0', 0], ['1 GΩ', 1e9], ['10 mΩ', 0.01],
  ['  4k7  ', 4700], ['.47', 0.47], ['4.7 K', 4700], ['22 μΩ', 22e-6], ['100', 100], ['220', 220], ['1000', 1000],
]) reads(text, ohms);
reads('4k7 1%', 4700, 1);
reads('10k ±0.1 %', 10000, 0.1);
reads('4,7 kΩ 5 %', 4700, 5);
hasReading('4E7', 4e7);
hasReading('4,700', 4700);
reads('4,700', 4.7);
for (const text of ['abc', 'k', '4k7k', '-5', '%', 'yel vio', 'blurple red red', '1..2', 'gold gold gold', 'black black black']) {
  const r = readInput(text);
  ok(r.readings.length === 0 && typeof r.message === 'string' && r.message.length > 10, `"${text}" cannot be read and says why`);
}
ok(readInput('').readings.length === 0 && !readInput('   ').message, 'an empty text is not an error');

// ---------------------------------------------------------------------------------------------------------------
section('SMD markings');
for (const [text, ohms, tol] of [
  ['472', 4700], ['101', 100], ['4992', 49900], ['4R7', 4.7], ['0R22', 0.22], ['R005', 0.005], ['68R0', 68],
  ['103J', 10000, 5], ['1001F', 1000, 1], ['5L0', 0.005], ['01C', 10000], ['68X', 49.9], ['96F', 97.6e6], ['01Z', 0.1],
  ['01Y', 1], ['01R', 1], ['01S', 10], ['01A', 100], ['01B', 1000], ['01H', 1000], ['01D', 1e5], ['01E', 1e6], ['01c', 10000],
  ['000', 0], ['0000', 0], ['00', 0], ['1M50', 1.5e6], ['4r7', 4.7],
]) reads(text, ohms, tol);
// Plain numbers that are common values stay numbers, with the marking as the other reading.
reads('220', 220); hasReading('220', 22);
reads('100', 100); hasReading('100', 10);
reads('7500', 7500); hasReading('7500', 750);
hasReading('101', 101);
eq(values('101').length, 2, '101 has two readings');
hasReading('1M50', 0.0015);
hasReading('47R', 3.01);
hasReading('601', 600); hasReading('601', 10e9);
hasReading('109', 600);
hasReading('X89', 49.9);
eq(flipMarking('601'), '109', '601 upside down');
eq(flipMarking('06'), '90', '06 upside down');
eq(flipMarking('101'), null, '101 is the same upside down');
eq(flipMarking('472'), null, '472 has no upside-down reading');
reads('472k', 472000);
reads('472K', 4700, 10);
ok(readInput('_103').readings.length >= 3 && readInput('_103').readings.every((r) => r.note), 'an underline gives several readings and a note');
ok(decodeMarking('472')[0].form === 'digits3' && decodeMarking('01C')[0].form === 'eia96', 'forms are named');
for (const [ohms, three, four, eia] of [
  [4700, '472', '4701', undefined], [4750, undefined, '4751', '66B'], [100, '101', '1000', '01A'], [10, '100', '10R0', '01X'], [4.7, '4R7', '4R70', undefined],
  [49900, undefined, '4992', '68C'], [0.22, 'R22', 'R220', undefined], [0.005, undefined, 'R005', undefined], [750, '751', '7500', '85A'],
  [0, '000', '0000', undefined], [1e6, '105', '1004', '01E'], [0.1, 'R10', 'R100', '01Z'], [1, '1R0', '1R00', '01Y'], [68, '680', '68R0', undefined],
]) {
  const m = encodeMarkings(ohms);
  eq(m.three, three, `${ohms} Ω as three characters`);
  eq(m.four, four, `${ohms} Ω as four characters`);
  eq(m.eia96, eia, `${ohms} Ω in EIA-96`);
  ok((m.three || m.why.three) && (m.four || m.why.four) && (m.eia96 || m.why.eia96), `${ohms} Ω: every missing marking has a reason`);
}
eq(encodeMarkings(0.005).milli, '5L0', '5 mΩ with L');

// ---------------------------------------------------------------------------------------------------------------
section('Colour code');
const names = (code) => (code.ok ? code.bands.map((b) => b.colour).join(' ') : `error: ${code.error}`);
for (const [text, ohms, tol, tcr] of [
  ['yellow violet red gold', 4700, 5], ['yel vio red gold', 4700, 5], ['YE VT RD GD', 4700, 5], ['brown black black', 10, 20],
  ['brown-black-orange-brown', 10000, 1], ['yellow, violet, black, brown, brown', 4700, 1], ['purple gray red silver', 7800, 10],
  ['red red black black brown red', 220, 1, 50], ['brown black gold gold', 1, 5], ['brown black silver', 0.1, 20],
  ['brown black pink brown', 0.01, 1], ['black', 0], ['green blue yellow blue', 560000, 0.25], ['orange orange red gold', 3300, 5],
  ['gold red violet yellow', 4700, 5],
]) {
  reads(text, ohms, tol);
  if (tcr) eq(first(text).tcr, tcr, `"${text}" has a temperature coefficient`);
  ok(first(text).bands?.length > 0, `"${text}" lists its bands`);
}
// Both directions valid: both are shown, and the one on a standard value comes first.
let both = readInput('brown black red brown');
ok(both.readings.length === 2 && both.readings[0].ohms === 1000 && both.readings[1].ohms === 12, 'both directions are offered');
both = readInput('brown brown black black brown');
ok(both.readings[0].ohms === 110 && both.readings.some((r) => r.ohms === 1000), 'a five-band code reads both ways');
both = readInput('red green black black brown');
ok(both.readings[0].ohms === 1e7 && both.readings[0].standard && both.readings[1].ohms === 250 && !both.readings[1].standard, 'the direction on a standard value is first');
hasReading('yellow violet red gold brown', 4700);
ok(first('brown black red grey').note.includes('0.05'), 'a grey tolerance band mentions the older reading');
eq(names(encodeBands(4700, 4, 5)), 'yellow violet red gold', '4.7 kΩ 5 % in four bands');
eq(names(encodeBands(4700, 5, 1)), 'yellow violet black brown brown', '4.7 kΩ 1 % in five bands');
eq(names(encodeBands(4700, 3)), 'yellow violet red', '4.7 kΩ in three bands');
eq(names(encodeBands(4700, 6, 1, 50)), 'yellow violet black brown brown red', '4.7 kΩ in six bands');
eq(names(encodeBands(4700, 4, 20)), 'yellow violet red', '20 % leaves the tolerance band out');
eq(names(encodeBands(0, 4, 5)), 'black', 'a link is one black band');
eq(names(encodeBands(0.01, 4, 1)), 'brown black pink brown', '10 mΩ in four bands');
eq(names(encodeBands(0.01, 5, 1)), 'black brown black pink brown', '10 mΩ in five bands, with a leading zero');
eq(names(encodeBands(1e9, 4, 5)), 'brown black grey gold', '1 GΩ in four bands');
eq(names(encodeBands(1e9, 5, 5)), 'brown black black violet gold', '1 GΩ in five bands');
for (const [ohms, count, tol, tcr] of [[4990, 4, 1], [4995, 5, 1], [1e12, 4, 5], [4700, 4, 3], [4700, 6, 1], [0.0047, 4, 5], [4700, 5, 20]]) {
  const code = encodeBands(ohms, count, tol, tcr);
  ok(!code.ok && code.error.length > 10, `${ohms} Ω cannot be shown with ${count} bands at ${tol} %, and the reason is given`);
}
ok('error' in coloursFromText('bl red red') && 'error' in coloursFromText('gr red red'), 'bl and gr are ambiguous');

// ---------------------------------------------------------------------------------------------------------------
section('Round trips');
const e96 = seriesValues('E96', 1, 1e7);
let trips = 0;
for (const ohms of e96) {
  const five = encodeBands(ohms, 5, 1);
  const back5 = five.ok ? decodeBands(five.bands.map((b) => b.colour)) : null;
  const six = encodeBands(ohms, 6, 0.1, 25);
  const back6 = six.ok ? decodeBands(six.bands.map((b) => b.colour)) : null;
  const m = encodeMarkings(ohms);
  const viaFour = m.four ? decodeMarking(m.four) : [];
  const viaEia = m.eia96 ? decodeMarking(m.eia96) : [];
  const typed = [formatOhms(ohms), formatRkm(ohms), m.four, m.eia96].every((text) => text && values(text).some((v) => close(v, ohms)));
  const good = back5?.ok && close(back5.ohms, ohms) && back5.tolerance === 1
    && back6?.ok && close(back6.ohms, ohms) && back6.tolerance === 0.1 && back6.tcr === 25
    && viaFour.some((r) => close(r.ohms, ohms)) && viaEia.some((r) => close(r.ohms, ohms) && r.form === 'eia96')
    && typed && inSeries(ohms, 'E96') && neighbours(ohms, 'E96').exact;
  if (good) trips++;
  else if (failures.length < 20) failures.push(`[Round trips] ${ohms} Ω: bands ${five.ok ? names(five) : five.error}, four ${m.four}, EIA-96 ${m.eia96}`);
}
groups.set(group, e96.length);
passed += trips;
// Two-digit forms for every E24 value.
for (const ohms of seriesValues('E24', 1, 1e7)) {
  const four = encodeBands(ohms, 4, 5);
  const back = four.ok ? decodeBands(four.bands.map((b) => b.colour)) : null;
  const m = encodeMarkings(ohms);
  ok(back?.ok && close(back.ohms, ohms) && back.tolerance === 5 && m.three && decodeMarking(m.three).some((r) => close(r.ohms, ohms))
    && values(m.three).some((v) => close(v, ohms)), `${ohms} Ω round-trips in four bands and three characters`);
}

// ---------------------------------------------------------------------------------------------------------------
section('Edges and tables');
reads('10m', 0.01);
ok(neighbours(0.01, 'E24').exact && formatOhms(0.01) === '10 mΩ', '10 mΩ is an E24 value');
ok(first('0').ohms === 0 && neighbours(0, 'E24') === null && seriesContaining(0).length === 0, '0 Ω has no neighbours and is in no series');
ok(first('1G').standard && neighbours(1e9, 'E96').above === 1.02e9, '1 GΩ is looked up like any value');
ok(readInput('2T').readings.length === 0 && readInput('2T').message.includes('largest'), '2 TΩ is past the largest value');
ok(readInput('0.1u').readings.length === 0 && readInput('0.1u').message.includes('smallest'), '0.1 µΩ is under the smallest value');
eq(CHIP_SIZES.length, 10, 'ten chip sizes');
ok(CHIP_SIZES.find((c) => c.imperial === '0402').metric === '1005' && CHIP_SIZES.find((c) => c.metric === '0402').imperial === '01005', 'imperial 0402 and metric 0402 are different parts');
eq(AXIAL_BODIES.length, 4, 'four axial bodies');
eq(deratedPower(0.1, 70), 0.1, 'full power at 70 °C');
eq(deratedPower(0.1, 112.5), 0.05, 'half power midway to 155 °C');
eq(deratedPower(0.1, 200), 0, 'no power past the maximum temperature');

// ---------------------------------------------------------------------------------------------------------------
section('Drawings');
const { drawAxial, drawChip, BODY_COATS, textWidth, exportSvg, drawingFileName } = lib;

// Tags balance, every attribute is quoted, and no bare < > or & is left over.
function wellFormed(svg) {
  const stack = [];
  const rest = svg.replace(/<(\/?)([a-zA-Z][\w-]*)((?:\s+[\w:-]+="[^"<]*")*)\s*(\/?)>/g, (all, closing, name, attrs, selfClosing) => {
    if (closing) { if (stack.pop() !== name) stack.push('!'); } else if (!selfClosing) stack.push(name);
    return '';
  });
  return svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"') && stack.length === 0 && !/[<>]/.test(rest) && !/&(?!amp;|lt;|quot;)/.test(svg);
}
// Nothing from outside the file: no CSS variables, links, embedded pages, fonts or text that needs one.
const selfContained = (svg) => !/var\(|url\(\s*["']?http|<foreignObject|font-family|<text|<image|href=|currentColor|style=|class=/.test(svg);
const viewBox = (svg) => (svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/) ?? []).slice(1).map(Number);
const near = (a, b) => Math.abs(a - b) < 1e-3;
const caption = ['4.7 kΩ ±5 %', 'yellow · violet · red · gold', '1/4 W axial, 6.5 × 2.5 mm, ⌀ 0.6 µ'];

for (const style of ['realistic', 'flat']) {
  for (const size of CHIP_SIZES) {
    for (const marking of ['472', '4701', '01C', 'R005', null]) {
      const d = drawChip(size, marking, { style, caption, background: '#ffffff' });
      const [w, h] = viewBox(d.svg);
      ok(wellFormed(d.svg) && selfContained(d.svg), `chip ${size.imperial} ${marking} ${style}: well-formed and self-contained`);
      ok(near(w, d.width) && near(h, d.height) && w > size.length && w < 2 * size.length && h > size.width, `chip ${size.imperial} ${style}: a viewBox in millimetres`);
      ok(d.svg.includes(`width="${size.length}" height="${size.width}"`), `chip ${size.imperial} ${style}: the body has its true length and width`);
    }
    ok(drawChip(size, '472', { style }).svg.length > drawChip(size, null, { style }).svg.length, `chip ${size.imperial} ${style}: the marking is drawn`);
  }
  for (const body of AXIAL_BODIES) {
    for (const count of [1, 3, 4, 5, 6]) {
      const colours = count === 1 ? ['black'] : encodeBands(count >= 5 ? 49900 : 4700, count, 1, 50).bands.map((b) => b.colour);
      const d = drawAxial(colours, body, BODY_COATS[count % BODY_COATS.length].id, { style, caption });
      const [w, h] = viewBox(d.svg);
      ok(wellFormed(d.svg) && selfContained(d.svg), `axial ${body.rating} ${count} bands ${style}: well-formed and self-contained`);
      ok(near(w, d.width) && near(h, d.height) && w > body.length && h > body.diameter && d.bands.length === count, `axial ${body.rating} ${count} bands ${style}: a viewBox in millimetres and ${count} bands`);
      const gaps = d.bands.slice(1).map((b, i) => b.x - d.bands[i].x);
      const wide = count === 6 ? 3 : count - 2;
      ok(count < 4 || gaps.every((g, i) => (i === wide ? g > 1.5 * gaps[0] : near(g, gaps[0]))), `axial ${body.rating} ${count} bands: the wider gap is before the tolerance band`);
      ok(d.bands.every((b) => b.x > (w - body.length) / 2 && b.x + b.width < (w + body.length) / 2), `axial ${body.rating} ${count} bands: the bands are on the body`);
    }
  }
}
const fourBands = ['yellow', 'violet', 'red', 'gold'];
ok((drawAxial(fourBands, AXIAL_BODIES[1], 'beige', { style: 'realistic', interactive: true }).svg.match(/data-band=/g) ?? []).length === 4, 'clickable areas when asked for');
ok(!drawAxial(fourBands, AXIAL_BODIES[1], 'beige', { style: 'realistic' }).svg.includes('data-band'), 'and none otherwise');
ok(drawAxial(fourBands, AXIAL_BODIES[1], 'beige', { style: 'realistic', id: 'a' }).svg.includes('id="ab"'), 'ids take the prefix given');
ok(!drawAxial(fourBands, AXIAL_BODIES[1], 'beige', { style: 'flat' }).svg.includes('<filter') && !drawChip(CHIP_SIZES[3], '472', { style: 'flat' }).svg.includes('Gradient'), 'the flat style has no shading');
ok(textWidth('472', 6) === 3 * 4 + 2 * 1.5 && textWidth('', 6) === 0, 'the width of a text in the stroke font');
ok(/^<svg width="640" height="\d+" xmlns/.test(exportSvg(drawChip(CHIP_SIZES[3], '472', { style: 'flat' }), 640)), 'an exported SVG has its size in pixels');
eq(drawingFileName(4700, 'axial-5-band', 'svg'), 'resistor-4k7-axial-5-band.svg', 'file name of an axial drawing');
eq(drawingFileName(0.005, 'chip-2512', 'png'), 'resistor-R005-chip-2512.png', 'file name of a chip drawing');

// ---------------------------------------------------------------------------------------------------------------
const total = [...groups.values()].reduce((a, b) => a + b, 0);
for (const failure of failures) console.log(`FAIL ${failure}`);
console.log([...groups].map(([name, count]) => `${name} ${count}`).join(' · '));
console.log(`resistor library: ${passed} of ${total} checks passed${failures.length ? `, ${total - passed} FAILED` : ''}`);
process.exit(passed === total ? 0 : 1);
