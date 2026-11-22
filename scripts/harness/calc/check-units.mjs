// Independent verification suite for lib/calc/{units,constants,value}.ts (Step C1).
// Run via: scripts/harness/resistor/node_modules/.bin/tsx scripts/harness/calc/check-units.mjs

import {
  DIM_AREA,
  DIM_CAPACITANCE,
  DIM_FREQ,
  DIM_INDUCTANCE,
  DIM_LENGTH,
  DIM_POWER,
  DIM_RESISTANCE,
  DIM_TEMP,
  DIM_TIME,
  DIM_VOLTAGE,
  DIM_VOLUME,
  DIM_ZERO,
  dimAdd,
  dimEqual,
  dimIsZero,
  dimKey,
  dimScale,
  dimSub,
  formatWithSmartUnit,
  lookupBarePrefix,
  parseUnitExpr,
  parseUnitToken,
  suggestConversions,
} from '../../../lib/calc/units.ts';
import { CONSTANTS, lookupConstant } from '../../../lib/calc/constants.ts';
import {
  CalcError,
  applyUnit,
  formatBaseSI,
  formatPolar,
  formatPolarLatex,
  formatValueLatex,
  formatValueText,
  fromNumberAndUnit,
  getCompanionHints,
  makeComplex,
  makeScalar,
  vAbs,
  vAdd,
  vArg,
  vAtan,
  vAtan2,
  vConj,
  vConvert,
  vCos,
  vDb,
  vDb10,
  vDbm,
  vDiv,
  vExp,
  vFromDbm,
  vIm,
  vLn,
  vLog10,
  vLog2,
  vMax,
  vMin,
  vMul,
  vNeg,
  vParallel,
  vPolar,
  vPow,
  vRe,
  vSin,
  vSqrt,
  vSub,
  valueInUnit,
} from '../../../lib/calc/value.ts';

let passed = 0;
const failures = [];
let currentGroup = '';

function section(name) {
  currentGroup = name;
}

function ok(cond, msg) {
  if (cond) passed++;
  else failures.push(`[${currentGroup}] ${msg}`);
}

function close(a, b, rel = 1e-6, abs = 1e-12) {
  return Math.abs(a - b) <= Math.max(abs, rel * Math.max(Math.abs(a), Math.abs(b)));
}

function eq(actual, expected, msg) {
  const same = typeof actual === 'number' && typeof expected === 'number'
    ? close(actual, expected)
    : actual === expected;
  ok(same, `${msg}: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
}

function throwsErr(fn, substr, msg) {
  try {
    fn();
    failures.push(`[${currentGroup}] ${msg}: expected error containing "${substr}", but succeeded`);
  } catch (err) {
    const text = err instanceof Error ? err.message : String(err);
    ok(err instanceof CalcError && text.toLowerCase().includes(substr.toLowerCase()),
      `${msg}: unexpected error "${text}"`);
  }
}

const qty = (n, uStr) => {
  const u = parseUnitExpr(uStr);
  if (!u) throw new Error(`Test unit parse failed: ${uStr}`);
  return fromNumberAndUnit(n, u);
};

const constantVal = (name) => {
  const c = lookupConstant(name);
  if (!c) throw new Error(`Missing constant: ${name}`);
  return makeScalar(c.value, c.dim);
};

// ---------------------------------------------------------------------------
section('Dimensions');
// ---------------------------------------------------------------------------
ok(dimIsZero(DIM_ZERO), 'DIM_ZERO is zero');
ok(!dimIsZero(DIM_TIME), 'DIM_TIME is not zero');
ok(dimEqual(dimAdd(DIM_RESISTANCE, DIM_CAPACITANCE), DIM_TIME), 'R * C has dimension of Time');
ok(dimEqual(dimSub(DIM_ZERO, DIM_TIME), DIM_FREQ), '1 / T has dimension of Frequency');
ok(dimEqual(dimScale(dimAdd(DIM_INDUCTANCE, DIM_CAPACITANCE), 0.5), DIM_TIME), 'sqrt(L * C) has dimension of Time');
ok(dimEqual(dimAdd(DIM_LENGTH, DIM_LENGTH), DIM_AREA), 'L * L = Area');
ok(dimEqual(dimScale(DIM_LENGTH, 3), DIM_VOLUME), 'L^3 = Volume');
eq(dimKey(DIM_TIME), '0,0,1,0,0,0,0', 'dimKey(DIM_TIME)');

// ---------------------------------------------------------------------------
section('Unit tokens, prefixes & compound expressions');
// ---------------------------------------------------------------------------
eq(parseUnitToken('m')?.symbol, 'm', 'm is metre');
eq(parseUnitToken('m')?.scale, 1, 'm scale is 1');
eq(parseUnitToken('mm')?.symbol, 'mm', 'mm is millimetre');
eq(parseUnitToken('mm')?.scale, 1e-3, 'mm scale is 1e-3');
eq(parseUnitToken('um')?.symbol, 'µm', 'um is micrometre');
eq(parseUnitToken('um')?.scale, 1e-6, 'um scale is 1e-6');
eq(parseUnitToken('µm')?.scale, 1e-6, 'µm scale is 1e-6');
eq(parseUnitToken('T')?.symbol, 'T', 'T is tesla');
eq(parseUnitToken('kOhm')?.symbol, 'kΩ', 'kOhm parses to kΩ');
eq(parseUnitToken('megOhm')?.scale, 1e6, 'megOhm SPICE prefix');
eq(parseUnitToken('pF')?.scale, 1e-12, 'pF scale');
eq(parseUnitToken('KiB')?.scale, 8 * 1024, 'KiB scale in bits');
eq(parseUnitToken('MB')?.scale, 8 * 1e6, 'MB decimal scale in bits');

// Bare prefixes must not collide with single-letter units
eq(lookupBarePrefix('k'), 1e3, 'bare k');
eq(lookupBarePrefix('M'), 1e6, 'bare M');
eq(lookupBarePrefix('meg'), 1e6, 'bare meg');
eq(lookupBarePrefix('G'), 1e9, 'bare G');
eq(lookupBarePrefix('u'), 1e-6, 'bare u');
eq(lookupBarePrefix('µ'), 1e-6, 'bare µ');
eq(lookupBarePrefix('n'), 1e-9, 'bare n');
eq(lookupBarePrefix('p'), 1e-12, 'bare p');
eq(lookupBarePrefix('f'), 1e-15, 'bare f');
eq(lookupBarePrefix('m'), null, 'bare m excluded (metre)');
eq(lookupBarePrefix('T'), null, 'bare T excluded (tesla)');
eq(lookupBarePrefix('s'), null, 'bare s excluded (second)');
eq(lookupBarePrefix('V'), null, 'bare V excluded (volt)');
eq(lookupBarePrefix('A'), null, 'bare A excluded (ampere)');

// Compound units
const um2 = parseUnitExpr('um^2');
ok(um2 !== null && dimEqual(um2.dim, DIM_AREA), 'um^2 parses as Area');
eq(um2?.scale, 1e-12, 'um^2 scale');
const jMolK = parseUnitExpr('J/(mol*K)');
ok(jMolK !== null && close(jMolK.scale, 1), 'J/(mol*K) parses');
const kgms2 = parseUnitExpr('kg*m/s^2');
ok(kgms2 !== null && dimEqual(kgms2.dim, parseUnitToken('N').dim), 'kg*m/s^2 matches Newton');
const pfPerMm = parseUnitExpr('pF/mm');
ok(pfPerMm !== null && close(pfPerMm.scale, 1e-9), 'pF/mm = 1e-9 F/m');

// ---------------------------------------------------------------------------
section('Frequency, Period & RC / LC Electronics');
// ---------------------------------------------------------------------------
// 1 / (100 MHz) -> 10 ns
const period100MHz = vDiv(makeScalar(1), qty(100, 'MHz'));
eq(period100MHz.re, 1e-8, '1 / (100 MHz) = 10 ns in SI');
eq(formatValueText(period100MHz), '10 ns', '1 / (100 MHz) formats as 10 ns');

// 1 / (10 ns) -> 100 MHz
const freq10ns = vDiv(makeScalar(1), qty(10, 'ns'));
eq(freq10ns.re, 1e8, '1 / (10 ns) = 100 MHz in SI');
eq(formatValueText(freq10ns), '100 MHz', '1 / (10 ns) formats as 100 MHz');

// 10 kOhm * 100 pF -> 1 µs
const rcTau = vMul(qty(10, 'kOhm'), qty(100, 'pF'));
eq(rcTau.re, 1e-6, '10 kOhm * 100 pF = 1e-6 s');
eq(formatValueText(rcTau), '1 µs', '10 kOhm * 100 pF formats as 1 µs');

// 1 / (2*pi * 10 kOhm * 100 pF) -> 159.155 kHz
const twoPi = makeScalar(2 * Math.PI);
const fc = vDiv(makeScalar(1), vMul(twoPi, rcTau));
eq(fc.re, 1 / (2 * Math.PI * 1e-6), 'RC cutoff frequency SI');
eq(formatValueText(fc), '159.155 kHz', 'RC cutoff formats as 159.155 kHz');

// 1 / (2*pi * sqrt(10 uH * 100 pF)) -> 5.03292 MHz
const lcProd = vMul(qty(10, 'uH'), qty(100, 'pF'));
const f0 = vDiv(makeScalar(1), vMul(twoPi, vSqrt(lcProd)));
eq(f0.re, 1 / (2 * Math.PI * Math.sqrt(10e-6 * 100e-12)), 'LC resonant frequency SI');
eq(formatValueText(f0), '5.03292 MHz', 'LC resonant frequency formats as 5.03292 MHz');

// Parallel resistors: 100 Ω || 100 Ω = 50 Ω
const rPar = vParallel(qty(100, 'ohm'), qty(100, 'ohm'));
eq(rPar.re, 50, '100 || 100 = 50 Ω');
eq(formatValueText(rPar), '50 Ω', 'parallel formats as 50 Ω');

// ---------------------------------------------------------------------------
section('Area & Length Conversions');
// ---------------------------------------------------------------------------
// 25 um * 40 um -> 1000 µm² -> 0.001 mm² -> 1e-9 m²
const area = vMul(qty(25, 'um'), qty(40, 'um'));
eq(area.re, 1e-9, '25 um * 40 um = 1e-9 m²');
eq(formatValueText(area), '1000 µm²', '25 um * 40 um formats as 1000 µm²');
eq(formatValueText(vConvert(area, 'mm^2')), '0.001 mm²', 'converted to mm²');
eq(formatValueText(vConvert(area, 'm^2')), '1e−9 m²', 'converted to m²');
eq(valueInUnit(area, 'mm^2').re, 0.001, 'valueInUnit mm²');

// 100 mil -> 2.54 mm
const len100mil = qty(100, 'mil');
eq(len100mil.re, 2.54e-3, '100 mil in SI metres');
eq(formatValueText(len100mil), '2.54 mm', '100 mil formats as 2.54 mm');
eq(formatValueText(vConvert(len100mil, 'mm')), '2.54 mm', '100 mil to mm');
eq(formatValueText(vConvert(qty(2.54, 'mm'), 'mil')), '100 mil', '2.54 mm to mil');

// ---------------------------------------------------------------------------
section('Complex Impedance & Phasors');
// ---------------------------------------------------------------------------
// Z_C = 1 / (j * 2*pi * 1 MHz * 100 pF) -> -j 1.592 kΩ and polar 1.592 kΩ ∠ -90°
const j = makeComplex(0, 1);
const omega1M = vMul(twoPi, qty(1, 'MHz'));
const zc = vDiv(makeScalar(1), vMul(j, vMul(omega1M, qty(100, 'pF'))));
ok(dimEqual(zc.dim, DIM_RESISTANCE), 'Z_C has dimension of Resistance');
eq(zc.re, 0, 'Z_C real part is 0');
eq(zc.im, -1 / (2 * Math.PI * 1e6 * 100e-12), 'Z_C imaginary part');
eq(formatValueText(zc, { digits: 4 }), '−j 1.592 kΩ', 'Z_C text at 4 digits');
eq(formatPolar(zc, { digits: 4 }), '1.592 kΩ ∠ −90°', 'Z_C polar at 4 digits');
ok(formatValueLatex(zc, { digits: 4 }).includes('\\Omega'), 'Z_C LaTeX contains \\Omega');
ok(formatPolarLatex(zc, { digits: 4 }).includes('\\angle'), 'Z_C polar LaTeX contains \\angle');

// Polar input & rectangular helpers
const zPol = vPolar(qty(10, 'V'), qty(45, 'deg'));
ok(dimEqual(zPol.dim, DIM_VOLTAGE), 'polar preserves voltage dimension');
eq(zPol.re, 10 * Math.SQRT1_2, 'polar(10 V, 45 deg) real part');
eq(zPol.im, 10 * Math.SQRT1_2, 'polar(10 V, 45 deg) imag part');
eq(vAbs(zPol).re, 10, 'abs(polar(10 V, 45 deg)) = 10 V');
eq(valueInUnit(vArg(zPol), 'deg').re, 45, 'arg(polar(10 V, 45 deg)) = 45 deg');
eq(vIm(vConj(zPol)).re, -10 * Math.SQRT1_2, 'conj flips imaginary part');
eq(vRe(applyUnit(makeComplex(50, 30), parseUnitToken('ohm'))).re, 50, 'applyUnit on complex');

// ---------------------------------------------------------------------------
section('Logarithmic dBm / dBW / dBV / dB');
// ---------------------------------------------------------------------------
eq(formatValueText(vConvert(qty(10, 'dBm'), 'mW')), '10 mW', '10 dBm -> 10 mW');
eq(formatValueText(vConvert(qty(0, 'dBm'), 'mW')), '1 mW', '0 dBm -> 1 mW');
eq(formatValueText(vConvert(qty(30, 'dBm'), 'W')), '1 W', '30 dBm -> 1 W');
const dbm50mW = vConvert(qty(50, 'mW'), 'dBm');
eq(dbm50mW.re, 10 * Math.log10(50), '50 mW in dBm exact');
eq(formatValueText(dbm50mW), '16.9897 dBm', '50 mW -> 16.9897 dBm');
eq(valueInUnit(vConvert(qty(10, 'dBm'), 'dBW'), 'dBW').re, -20, '10 dBm -> -20 dBW');
eq(valueInUnit(vConvert(qty(20, 'dBV'), 'V'), 'V').re, 10, '20 dBV -> 10 V');
eq(valueInUnit(vConvert(qty(1, 'V'), 'dBuV'), 'dBuV').re, 120, '1 V -> 120 dBµV');
eq(vAdd(qty(10, 'dBm'), qty(3, 'dB')).re, 13, '10 dBm + 3 dB = 13 dBm');
eq(vSub(qty(20, 'dBm'), qty(10, 'dBm')).logKind, 'dB', '20 dBm - 10 dBm yields dB');
eq(vSub(qty(20, 'dBm'), qty(10, 'dBm')).re, 10, '20 dBm - 10 dBm = 10 dB');
eq(vDb(makeScalar(10)).re, 20, 'db(10) = 20 dB');
eq(vDb10(makeScalar(10)).re, 10, 'db10(10) = 10 dB');
eq(vDbm(qty(1, 'W')).re, 30, 'dbm(1 W) = 30 dBm');
eq(vFromDbm(makeScalar(30)).re, 1, 'fromDbm(30) = 1 W');

// ---------------------------------------------------------------------------
section('Affine Temperature Conversions');
// ---------------------------------------------------------------------------
const t25C = qty(25, 'degC');
eq(t25C.re, 298.15, '25 degC in K');
eq(formatValueText(vConvert(t25C, 'K')), '298.15 K', '25 degC -> 298.15 K');
eq(formatValueText(vConvert(t25C, 'degF')), '77 °F', '25 degC -> 77 °F');
eq(formatValueText(vConvert(qty(100, 'degC'), 'degF')), '212 °F', '100 degC -> 212 °F');
eq(formatValueText(vConvert(qty(300, 'K'), 'degC')), '26.85 °C', '300 K -> 26.85 °C');
eq(vSub(qty(100, 'degC'), qty(25, 'degC')).re, 75, '100 degC - 25 degC = 75 K delta');
eq(vSub(qty(100, 'degC'), qty(25, 'degC')).tempKind, undefined, 'temperature difference clears tempKind');

// ---------------------------------------------------------------------------
section('Physical Constants');
// ---------------------------------------------------------------------------
ok(CONSTANTS.length >= 13, 'At least 13 built-in constants');
// c / (2.4 GHz) -> 124.914 mm (124.91 mm at 5 digits)
const lambda24 = vDiv(constantVal('c'), qty(2.4, 'GHz'));
eq(lambda24.re, 299792458 / 2.4e9, 'c / 2.4 GHz in metres');
eq(formatValueText(lambda24, { digits: 5 }), '124.91 mm', 'c / 2.4 GHz formats as 124.91 mm');

// sqrt(mu0 / eps0) ≈ 376.7303 Ω
const zFree = vSqrt(vDiv(constantVal('mu0'), constantVal('eps0')));
ok(dimEqual(zFree.dim, DIM_RESISTANCE), 'sqrt(mu0 / eps0) has dimension of Resistance');
eq(zFree.re, 376.730313412, 'sqrt(mu0 / eps0) ≈ 376.7303 Ω');
eq(formatValueText(zFree, { digits: 7 }), '376.7303 Ω', 'sqrt(mu0 / eps0) formats as 376.7303 Ω');

// 1 / sqrt(mu0 * eps0) === c
const cCheck = vDiv(makeScalar(1), vSqrt(vMul(constantVal('mu0'), constantVal('eps0'))));
eq(cCheck.re, 299792458, '1 / sqrt(mu0 * eps0) = c');

// ---------------------------------------------------------------------------
section('Angles, Trig, Logs & Misc Functions');
// ---------------------------------------------------------------------------
eq(vSin(qty(90, 'deg')).re, 1, 'sin(90 deg) = 1');
eq(vCos(qty(90, 'deg')).re, 0, 'cos(90 deg) = 0');
eq(valueInUnit(vAtan(makeScalar(1)), 'deg').re, 45, 'atan(1) in deg = 45');
eq(valueInUnit(vAtan2(qty(40, 'ohm'), qty(30, 'ohm')), 'deg').re, Math.atan2(40, 30) * (180 / Math.PI), 'atan2 with matching units');
eq(vLn(vExp(makeScalar(2.5))).re, 2.5, 'ln(exp(2.5)) = 2.5');
eq(vLog10(makeScalar(1000)).re, 3, 'log10(1000) = 3');
eq(vLog2(makeScalar(1024)).re, 10, 'log2(1024) = 10');
eq(vPow(j, makeScalar(2)).re, -1, 'j^2 = -1');
eq(vPow(j, makeScalar(2)).im, 0, 'j^2 imag = 0');
eq(vMin(qty(1, 'kOhm'), qty(500, 'ohm')).re, 500, 'min(1 kOhm, 500 ohm) = 500');
eq(vMax(qty(1, 'kOhm'), qty(500, 'ohm')).re, 1000, 'max(1 kOhm, 500 ohm) = 1000');
eq(vNeg(qty(5, 'V')).re, -5, 'vNeg(5 V) = -5 V');

// ---------------------------------------------------------------------------
section('Suggestions, Base SI & Companion Hints');
// ---------------------------------------------------------------------------
const areaSug = suggestConversions({ dim: DIM_AREA }).map((u) => u.symbol);
ok(areaSug.includes('mm²') && areaSug.includes('m²') && areaSug.includes('mil²'), 'area suggestions include mm², m², mil²');
const pwrSug = suggestConversions({ dim: DIM_POWER }).map((u) => u.symbol);
ok(pwrSug.includes('dBm') && pwrSug.includes('mW') && pwrSug.includes('W'), 'power suggestions include dBm, mW, W');
eq(formatWithSmartUnit(1e-9, DIM_AREA), '1000 µm²', 'formatWithSmartUnit area without hint');
eq(formatBaseSI(area), '1e−9 m²', 'formatBaseSI(area)');

const zcHints = getCompanionHints(zc);
ok(zcHints.some((h) => h.label === 'Polar'), 'complex impedance has Polar companion hint');
ok(zcHints.some((h) => h.label.includes('Admittance')), 'complex impedance has Admittance companion hint');
const fHints = getCompanionHints(qty(100, 'MHz'));
ok(fHints.some((h) => h.label === 'Period (T)' && h.text === '10 ns'), '100 MHz has Period = 10 ns companion hint');
const pHints = getCompanionHints(qty(10, 'mW'));
ok(pHints.some((h) => h.text === '10 dBm'), '10 mW has 10 dBm companion hint');

// ---------------------------------------------------------------------------
section('Error Handling (Dimension Mismatches & Invalid Ops)');
// ---------------------------------------------------------------------------
throwsErr(() => vAdd(qty(10, 'V'), qty(5, 'A')), 'dimension mismatch', '10 V + 5 A throws');
throwsErr(() => vSub(qty(10, 'm'), qty(5, 's')), 'dimension mismatch', '10 m - 5 s throws');
throwsErr(() => vConvert(qty(10, 'V'), 'A'), 'dimension mismatch', '10 V to A throws');
throwsErr(() => vSin(qty(10, 'm')), 'dimensionless', 'sin(10 m) throws');
throwsErr(() => vPow(qty(2, 'm'), qty(3, 's')), 'dimensionless', '2m ^ 3s throws');
throwsErr(() => vDiv(qty(10, 'V'), makeScalar(0)), 'division by zero', 'division by zero throws');
throwsErr(() => vAdd(qty(10, 'dBm'), qty(10, 'dBm')), 'dB offset', 'dBm + dBm throws clear error');
throwsErr(() => vConvert(qty(-5, 'mW'), 'dBm'), 'non-positive', 'negative power to dBm throws');

// ---------------------------------------------------------------------------
if (failures.length > 0) {
  console.error(`FAIL (${failures.length} failed, ${passed} passed):`);
  for (const f of failures) console.error('  -', f);
  process.exit(1);
}
console.log(`PASS: ${passed} assertions passed across lib/calc/{units,constants,value}.ts`);
