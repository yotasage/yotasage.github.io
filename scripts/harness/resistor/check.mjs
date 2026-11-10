// Checks of lib/resistor. Run with `npm run check` in this folder (tsx reads the TypeScript of the site as it is).
// Prints the failures and one summary line; the exit code is 1 when a check fails.

import * as imported from '../../../lib/resistor/index.ts';
import * as importedView from '../../../components/Resistor/view.ts';

const lib = imported.default ?? imported;
const viewLib = importedView.default ?? importedView;
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
const first = (text, readAs) => readInput(text, readAs).readings[0];

function reads(text, ohms, tolerance, readAs) {
  const r = first(text, readAs);
  ok(r && close(r.ohms, ohms), `"${text}" reads as ${ohms} Ω first${readAs ? ` (read as ${readAs})` : ''}: got ${r ? r.ohms : 'nothing'}`);
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
  ['000', 0], ['0000', 0], ['00', 0], ['1M50', 0.0015], ['4r7', 4.7],
]) reads(text, ohms, tol, 'marking');
// Plain numbers stay numbers, with the marking as the other reading.
reads('220', 220); hasReading('220', 22);
reads('100', 100); hasReading('100', 10);
reads('7500', 7500); hasReading('7500', 750);
hasReading('101', 101);
eq(values('101').length, 2, '101 has two readings');
reads('1M50', 1.5e6); hasReading('1M50', 0.0015); hasReading('1M50', 1.5e6);
hasReading('47R', 3.01);
hasReading('601', 600); hasReading('601', 10e9);
hasReading('109', 600);
hasReading('X89', 49.9);
eq(flipMarking('601'), '109', '601 upside down');
eq(flipMarking('06'), '90', '06 upside down');
eq(flipMarking('101'), null, '101 is the same upside down');
eq(flipMarking('472'), null, '472 has no upside-down reading');
reads('472k', 472000);
reads('472K', 472000); reads('472K', 4700, 10, 'marking');
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
// Both directions valid: both are shown, and the one that was typed comes first.
let both = readInput('brown black red brown');
ok(both.readings.length === 2 && both.readings[0].ohms === 1000 && both.readings[1].ohms === 12, 'both directions are offered');
both = readInput('brown brown black black brown');
ok(both.readings[0].ohms === 110 && both.readings.some((r) => r.ohms === 1000), 'a five-band code reads both ways');
both = readInput('red green black black brown');
ok(both.readings[0].ohms === 250 && !both.readings[0].standard && both.readings[1].ohms === 1e7 && both.readings[1].standard, 'the direction that was typed is first, also when the other is a standard value');
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
section('Read as value or marking');
{
  // The value is always the first reading; the marking is offered below.
  for (const [text, value, marking] of [['472', 472, 4700], ['101', 101, 100], ['4992', 4992, 49900], ['220', 220, 22], ['01E', 1, 1e6], ['047', 47, 4e7]]) {
    reads(text, value);
    ok(first(text).kind === 'value', `"${text}" is a value first`);
    hasReading(text, marking);
    reads(text, marking, undefined, 'marking');
    ok(first(text, 'marking').kind !== 'value', `"${text}" read as a marking is a marking first`);
    ok(readInput(text, 'marking').readings.some((r) => close(r.ohms, value)), `"${text}" read as a marking still offers the value`);
    ok(readInput(text).readings.map((r) => r.id).sort().join() === readInput(text, 'marking').readings.map((r) => r.id).sort().join(), `"${text}" has the same readings either way, so a link that names one still holds`);
  }
  // A text that can only be one thing is read as that, whatever the choice.
  for (const text of ['4k7', '4,7 kΩ', '10m', '01C', '68X', 'yellow violet red gold', '4k7 1%', '472 Ω', '472 5%', '4.7', '1e3']) {
    const [a, b] = [first(text), first(text, 'marking')];
    ok(a && b && a.id === b.id && a.ohms === b.ohms, `"${text}" reads the same with either choice`);
  }
  ok(first('R005', 'marking').ohms === 0.005 && first('R005').ohms === 0.005, 'R005 is 5 mΩ with either choice');
  // What is no marking falls back to a value.
  reads('4k7', 4700, undefined, 'marking');
  reads('12', 12, undefined, 'marking');
  reads('472 5%', 472, 5, 'marking');
  // Upside down comes last with either choice.
  for (const mode of ['value', 'marking']) {
    const list = readInput('601', mode).readings;
    ok(list.length === 3 && list[2].id.startsWith('flip'), `601 read as ${mode}: the reading upside down is last`);
  }
  eq(first('601').ohms, 601, '601 is 601 Ω first');
  eq(first('601', 'marking').ohms, 600, '601 as a marking is 600 Ω first');
}

section('Readings from the other end');
{
  const { bandDoubt, otherEndLabel } = lib;
  // 49.9 kΩ 1 %: from the other end 129 GΩ at 0.02 %.
  let r = readInput('yellow white white red brown').readings;
  ok(r[0].ohms === 49900 && !r[0].doubt && !r[0].likely, 'a plausible code as typed is first and carries no label');
  ok(r[1].ohms === 129e9 && r[1].likely === 'unlikely' && /1 GΩ/.test(r[1].doubt), 'its other end is marked unlikely, with the reason');
  ok(r[1].standard && r[1].doubt, 'an unlikely reading on an E192 value carries its caveat');
  // The same part typed from the other end: taken as typed, with the other end marked more likely.
  r = readInput('brown red white white yellow').readings;
  ok(r[0].ohms === 129e9 && r[0].id === 'bands' && /1 GΩ/.test(r[0].doubt) && !r[0].likely, 'an implausible code is still read as typed first, with why it is unusual');
  ok(r[1].ohms === 49900 && r[1].likely === 'more likely' && !r[1].doubt, 'its other end is marked more likely');
  // Both plausible, both not: no label.
  r = readInput('brown black red brown').readings;
  ok(r.length === 2 && r.every((x) => !x.likely && !x.doubt), 'two plausible directions carry no label');
  r = readInput('red green black black brown').readings;
  ok(r[0].ohms === 250 && /no E-series/.test(r[0].doubt) && r[1].likely === 'more likely', 'a value in no series is unusual when the other end is a standard value');
  r = readInput('red green blue black brown').readings;
  ok(r.length === 2 && r.every((x) => x.doubt && !x.likely), 'two unusual directions carry no label, only their reasons');
  r = readInput('white white white gold').readings;
  ok(r.length === 1 && /1 GΩ/.test(r[0].doubt), 'a single reading above 1 GΩ says so');
  // The rules.
  const any = ['brown', 'red', 'white', 'black', 'brown'];
  ok(/E192/.test(bandDoubt(129, 1, any)) && bandDoubt(129, 0.5, any) === undefined && bandDoubt(129, 0.1, any) === undefined, 'a value only in E192 does not fit 1 %');
  ok(/E96/.test(bandDoubt(49900, 5, any)) && bandDoubt(49900, 1, any) === undefined, 'a value only in E96 does not fit 5 %');
  ok(/E48/.test(bandDoubt(1050, 5, any)) && bandDoubt(1050, 2, any) === undefined, 'an E48 value fits 2 %, not 5 %');
  ok(bandDoubt(4700, 20, any) === undefined && bandDoubt(4700, 5, any) === undefined && bandDoubt(4700, 0.1, any) === undefined, 'E24 values fit every usual tolerance');
  ok(/1 GΩ/.test(bandDoubt(2e9, 5, any)) && bandDoubt(1e9, 5, any) === undefined, 'above 1 GΩ is unusual, 1 GΩ is not');
  ok(/1 mΩ/.test(bandDoubt(0.0005, 5, any)) && bandDoubt(0.001, 5, any) === undefined, 'below 1 mΩ is unusual, 1 mΩ is not');
  ok(/black/.test(bandDoubt(47, 5, ['black', 'yellow', 'violet', 'black', 'gold'])), 'a first band that is black is unusual');
  ok(/rare/.test(bandDoubt(1000, 0.02, any)), 'a tolerance of 0.02 % is rare');
  ok(otherEndLabel('a', undefined) === 'more likely' && otherEndLabel(undefined, 'b') === 'unlikely' && otherEndLabel('a', 'b') === undefined && otherEndLabel(undefined, undefined) === undefined, 'the label of the other end');
}

section('Bare drawings');
{
  const { drawAxial, drawChip } = lib;
  const fourBands = ['yellow', 'violet', 'red', 'gold'];
  const height = (svg) => Number(svg.match(/viewBox="0 0 [\d.]+ ([\d.]+)"/)[1]);
  const barred = (svg) => svg.includes('opacity="0.8"');
  for (const style of ['realistic', 'flat']) {
    for (const body of AXIAL_BODIES) {
      const full = drawAxial(fourBands, body, 'beige', { style, caption: ['4.7 kΩ'] });
      const bare = drawAxial(fourBands, body, 'beige', { style, scale: false });
      ok(barred(full.svg) && !barred(bare.svg), `${style} axial ${body.rating}: no scale bar and no scale number without a caption`);
      ok(bare.height < drawAxial(fourBands, body, 'beige', { style }).height && bare.height >= body.diameter * 1.8 - 1e-9 && bare.height <= body.diameter * 2, `${style} axial ${body.rating}: the bare picture ends under the part`);
      ok(bare.width === full.width, `${style} axial ${body.rating}: the bare picture is as wide`);
    }
    for (const size of CHIP_SIZES) {
      const full = drawChip(size, '472', { style, caption: ['4.7 kΩ'] });
      const bare = drawChip(size, '472', { style, scale: false });
      ok(barred(full.svg) && !barred(bare.svg), `${style} chip ${size.imperial}: no scale bar without a caption`);
      ok(bare.height < drawChip(size, '472', { style }).height && bare.height > size.width && bare.height < size.width * 1.7, `${style} chip ${size.imperial}: the bare picture ends under the part`);
      ok(Math.abs(height(bare.svg) - bare.height) < 1e-3, `${style} chip ${size.imperial}: the viewBox is the bare height`);
    }
  }
  const strokes = (svg) => (svg.match(/<path/g) ?? []).length;
  const flat = (o) => drawChip(CHIP_SIZES[3], null, { style: 'flat', ...o }).svg;
  eq(strokes(flat({ scale: false })), 0, 'a bare flat chip without marking has no text and no bar');
  ok(strokes(flat({})) > 0 && strokes(flat({ scale: false, caption: ['A'] })) > 0, 'the scale bar and a caption are drawn when asked for');
}

section('TikZ');
{
  const { tikzAxial, tikzChip, texText, axialGeometry, chipGeometry, drawAxial, drawChip } = lib;
  const balanced = (text) => {
    let depth = 0;
    for (const line of text.split('\n')) {
      const code = line.replace(/\\[%{}]/g, '').replace(/%.*$/, '');
      for (const ch of code) { if (ch === '{') depth++; if (ch === '}') depth--; if (depth < 0) return false; }
    }
    return depth === 0;
  };
  const common = (t, what) => {
    ok(t.document.startsWith('% Compiles') && /\\documentclass\[tikz, border=\dmm\]\{standalone\}\n\\begin\{document\}/.test(t.document) && t.document.trimEnd().endsWith('\\end{document}'), `${what}: a standalone document`);
    ok(t.document.includes(t.picture.trimEnd()) && /\\begin\{tikzpicture\}\[\n  x=[\d.]+mm, y=-[\d.]+mm,/.test(t.picture) && t.picture.trimEnd().endsWith('\\end{tikzpicture}'), `${what}: the picture is a tikzpicture in millimetres, and the document holds it`);
    ok(balanced(t.document) && /^[\x09\x0a\x20-\x7e]*$/.test(t.document), `${what}: braces are balanced and the file is plain ASCII`);
    ok(!/\\usepackage|\\usetikzlibrary/.test(t.document.replace(/%.*$/gm, '')), `${what}: nothing but TikZ is needed`);
    const used = [...t.picture.matchAll(/(?:fill|draw|text)=([a-z]+)|\\(?:fill|draw)\[([a-z]+)[\],]/g)].map((m) => m[1] ?? m[2]);
    const defined = [...t.picture.matchAll(/\\definecolor\{([a-z]+)\}\{HTML\}\{[0-9A-F]{6}\}/g)].map((m) => m[1]);
    ok(used.length > 2 && used.every((name) => defined.includes(name)) && defined.every((name) => used.includes(name)), `${what}: every colour is defined by name, and every definition is used: ${used.filter((u) => !defined.includes(u))} / ${defined.filter((d) => !used.includes(d))}`);
    ok(t.width <= 80 && t.width > 30 && t.enlarged >= 1, `${what}: between 30 and 80 mm wide on paper`);
  };
  const caption = ['4.7 kΩ ±5 %', 'yellow · violet · red · gold', '1/4 W axial, 6.5 × 2.5 mm'];
  for (const body of AXIAL_BODIES) {
    for (const count of [1, 3, 4, 5, 6]) {
      const code = count === 1 ? { bands: [{ colour: 'black', meaning: '0 Ω link' }] } : encodeBands(4700, count, count === 3 ? 20 : 1, count === 6 ? 50 : undefined);
      const colours = code.bands.map((b) => b.colour);
      const t = tikzAxial(colours, body, 'blue', { caption, bandNotes: code.bands.map((b) => b.meaning) });
      const what = `TikZ axial ${body.rating}, ${count} bands`;
      common(t, what);
      eq((t.picture.match(/% \d(st|nd|rd|th) band: /g) ?? []).length, count, `${what}: a commented line for each band`);
      ok(colours.every((name) => t.picture.includes(`\\definecolor{band${name}}`)), `${what}: band colours have readable names`);
      const g = axialGeometry(count, body);
      ok(t.picture.includes(`(${Number(g.bands[0].x.toFixed(3))}, `) && t.picture.includes(`(${Number(g.x0.toFixed(3))}, ${Number(g.cy.toFixed(3))})`), `${what}: the coordinates are those of the flat drawing`);
      ok(/Scale bar/.test(t.picture) && /% Caption/.test(t.picture) && t.picture.includes('yellow \\ensuremath{\\cdot} violet'), `${what}: scale bar and caption as text nodes`);
    }
  }
  for (const size of CHIP_SIZES) {
    const marked = tikzChip(size, '4701', { caption: ['4.7 kΩ ±1 %', 'marking 4701'] });
    const what = `TikZ chip ${size.imperial}`;
    common(marked, what);
    ok(/\\node\[text=chipmarking, [^\]]*\\fontsize\{[\d.]+pt\}\{[\d.]+pt\}\\selectfont[^\]]*\] at \([\d.]+, [\d.]+\) \{4701\};/.test(marked.picture), `${what}: the marking is a text node`);
    const g = chipGeometry(size);
    ok(marked.picture.includes(`(${Number(g.x0.toFixed(3))}, ${Number(g.y0.toFixed(3))}) rectangle (${Number((g.x0 + size.length).toFixed(3))}, ${Number((g.y0 + size.width).toFixed(3))})`), `${what}: the body has the true size`);
    const plain = tikzChip(size, null, { scale: false });
    common(plain, `${what} without marking`);
    ok(!plain.picture.includes('chipmarking') && !/\\node/.test(plain.picture) && !/Scale bar|Caption/.test(plain.picture), `${what}: bare, there is no text, scale bar or caption`);
  }
  const bare = tikzAxial(['yellow', 'violet', 'red', 'gold'], AXIAL_BODIES[1], 'beige', { scale: false });
  ok(!/\\node|Scale bar|Caption/.test(bare.picture), 'TikZ axial without caption is the part alone');
  const dark = tikzChip(CHIP_SIZES[4], '472', { background: '#1a1b19', caption: ['4.7 kΩ'] });
  common(dark, 'TikZ on a dark background');
  ok(dark.picture.includes('\\begin{pgfonlayer}{background}') && dark.picture.includes('\\definecolor{resistorink}{HTML}{E9E7E0}') && dark.picture.includes('\\definecolor{resistorbackground}{HTML}{1A1B19}'), 'a background is filled behind the picture, with light lines on a dark one');
  ok(!bare.picture.includes('pgfonlayer') && bare.picture.includes('{resistorink}{HTML}{2B2A27}'), 'without a background there is none, and the lines are dark');
  eq(texText('4.7 kΩ ±5 %'), '4.7\\,k\\ensuremath{\\Omega} \\ensuremath{\\pm}5\\,\\%', 'a value as LaTeX');
  eq(texText('0805 (2012 metric), 2 × 1.25 mm'), '0805 (2012 metric), 2 \\ensuremath{\\times} 1.25\\,mm', 'a size as LaTeX');
  eq(texText('a_b & 50% {x} #1 $ ~ ^ \\'), 'a\\_b \\& 50\\% \\{x\\} \\#1 \\$ \\textasciitilde  \\textasciicircum  \\textbackslash ', 'special characters are escaped');
  eq(drawingFileName(4700, 'axial-4-band', 'tex'), 'resistor-4k7-axial-4-band.tex', 'file name of a TikZ file');
  // The geometry that TikZ shares gives the drawings their size.
  const flat = drawAxial(['yellow', 'violet', 'red', 'gold'], AXIAL_BODIES[1], 'beige', { style: 'flat' });
  eq(flat.width, axialGeometry(4, AXIAL_BODIES[1]).width, 'the SVG and the TikZ drawing share their geometry (axial)');
  eq(drawChip(CHIP_SIZES[4], '472', { style: 'flat' }).width, chipGeometry(CHIP_SIZES[4]).width, 'the SVG and the TikZ drawing share their geometry (chip)');
}

section('Clicks in the tables');
{
  const { DEFAULT_VIEW, resolveView, thirdDigit, markingExample, otherEnd } = viewLib;
  const part = (text, view = {}, tolerance) => {
    const reading = readInput(text).readings[0];
    return resolveView({ ...DEFAULT_VIEW, ...view }, reading, text, tolerance ?? reading.tolerance ?? 5);
  };
  // A third digit on a part with two digits: five bands, the value keeps its size.
  let c = thirdDigit(part('4k7'), 5);
  ok(c.ohms === 4750 && c.view.bands === 5 && c.view.type === 'axial' && c.tolerance === undefined, 'a third digit 5 makes 4.7 kΩ a five-band 4.75 kΩ');
  c = thirdDigit(part('4k7'), 0);
  ok(c.ohms === 4700 && c.view.bands === 5, 'a third digit 0 keeps the value');
  c = thirdDigit(part('yellow violet red'), 5);
  ok(c.ohms === 4750 && c.view.bands === 5 && c.tolerance === 1, 'on a three-band part it also sets a tolerance that has a colour');
  // Taking it away: four bands with two digits.
  c = thirdDigit(part('4k75', { bands: 5 }, 1), null);
  ok(c.ohms === 4700 && c.view.bands === 4 && c.view.tcr === null && c.tolerance === undefined, 'without its third digit 4.75 kΩ is a four-band 4.7 kΩ');
  c = thirdDigit(part('4k7', { bands: 6, tcr: 25 }, 1), null);
  ok(c.ohms === 4700 && c.view.bands === 4 && c.view.tcr === null, 'a six-band part without its third digit has four bands');
  c = thirdDigit(part('4k7', { bands: 6, tcr: 25 }, 1), 5);
  ok(c.ohms === 4750 && c.view.bands === 6 && c.view.tcr === 25, 'another third digit on a six-band part keeps the six bands');
  ok('error' in thirdDigit(part('0'), 5) && 'error' in thirdDigit(part('0.047', {}, 5), 5), 'a link, or a multiplier that would be below pink, gives the reason instead');
  // Examples of markings: read as a marking, drawn on a chip in the system of the example, of a size that is marked.
  for (const [code, mark] of [['472', 'three'], ['101', 'three'], ['4R7', 'three'], ['103J', 'three'], ['4992', 'four'], ['1001', 'four'], ['0R22', 'four'], ['1001F', 'four'], ['01C', 'eia96'], ['68X', 'eia96']]) {
    c = markingExample(code, part('4k7'));
    ok(c.text === code && c.readAs === 'marking' && c.view.type === 'chip' && c.view.mark === mark && c.view.size === undefined, `the example ${code} is drawn on a chip marked with ${mark}`);
  }
  eq(markingExample('01C', part('4k7')).tolerance, 1, 'an EIA-96 example sets 1 %');
  for (const size of ['01005', '0201', '0402']) eq(markingExample('472', part('4k7', { size })).view.size, '0805', `from ${size}, which is not marked, an example goes to 0805`);
  eq(markingExample('472', part('4k7', { size: '1206' })).view.size, undefined, 'a size that is marked is kept');
  // The note by the drawing.
  let o = otherEnd(part('yellow white white red brown'));
  ok(o.ok && o.likely === 'unlikely' && /1 GΩ/.test(o.doubt) && !o.givenDoubt, 'the other end of 49.9 kΩ 1 % is unlikely');
  o = otherEnd(part('brown red white white yellow'));
  ok(o.ok && o.likely === 'more likely' && /1 GΩ/.test(o.givenDoubt) && o.ohms === 49900, 'the other end of 129 GΩ is more likely');
  o = otherEnd(part('brown black red brown'));
  ok(o.ok && !o.likely && !o.doubt && !o.givenDoubt, 'two plausible directions: no label by the drawing');
}

// ---------------------------------------------------------------------------------------------------------------
const total = [...groups.values()].reduce((a, b) => a + b, 0);
for (const failure of failures) console.log(`FAIL ${failure}`);
console.log([...groups].map(([name, count]) => `${name} ${count}`).join(' · '));
console.log(`resistor library: ${passed} of ${total} checks passed${failures.length ? `, ${total - passed} FAILED` : ''}`);
process.exit(passed === total ? 0 : 1);
