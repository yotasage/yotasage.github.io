// Reading and writing numbers with SI prefixes and units, shared by the tools (resistor lookup, Smith chart).
// Framework-free; no node: imports (runs in the browser).
//
// Reading: "4.7k", "4k7", "3V3", "4n7", "3,3 V", "−10", "3e-9 F", "1meg", "100 ppm/K", "2.2 nH", "50 Ω", "10 mm".
// Writing: engineering notation with prefixes f to T, rounded with carry (999.96 → "1 k" at four digits), a real
// minus sign, "∞ Ω" for an open.

// SI prefixes by their letters. Case matters: m is milli, M mega; u, µ (micro sign) and μ (Greek mu) are micro; c
// (centi) is read only before the metre ("2 cm").
export const SI_PREFIXES: Readonly<Record<string, number>> = {
  f: 1e-15, p: 1e-12, n: 1e-9, u: 1e-6, µ: 1e-6, μ: 1e-6, m: 1e-3, c: 1e-2, '': 1, k: 1e3, M: 1e6, G: 1e9, T: 1e12,
};

// The units a text may end in, each written the way formatAmount writes it, with the spellings that are read as it.
// 'Ω' also accepts R and ohm(s); 'ppm/K' also ppm; 'm' is the metre and is only read as a unit when it is asked for
// (otherwise "10 m" is ten milli and "10 mm" is not a number, as the resistor tool always read it).
const UNIT_SPELLINGS: ReadonlyArray<readonly [string, string]> = [
  ['Ω', 'Ω|[Oo]hms?|[Rr]'],
  ['Hz', '[Hh][Zz]'],
  ['dB', '[dD][bB]'],
  ['ppm/K', 'ppm(?:\\s*/\\s*K)?'],
  ['°C', '°\\s*C'],
  ['V', '[Vv]'],
  ['A', '[Aa]'],
  ['W', '[Ww]'],
  ['S', 'S'],
  ['H', 'H'],
  ['F', 'F'],
  ['m', 'm'],
  ['%', '%'],
  ['×', '[x×]'],
];

// Units written without a prefix (a level in dB is never "1 kdB").
const NO_PREFIX = new Set(['dB']);

const UNIT_PATTERN = UNIT_SPELLINGS.map(([, spelling]) => `(?:${spelling})`).join('|');
const UNIT_TESTS = UNIT_SPELLINGS.map(([unit, spelling]) => [unit, new RegExp(`^(?:${spelling})$`)] as const);
const PREFIX_PATTERN = '[Mm][Ee][Gg]|[fpnuµμmckMGT]';

// sign, mantissa, exponent, prefix, unit
const AMOUNT_PLAIN = new RegExp(
  `^([+-]?)\\s*(\\d+(?:[.,]\\d*)?|[.,]\\d+)(?:[eE]([+-]?\\d+))?\\s*(${PREFIX_PATTERN})?\\s*(${UNIT_PATTERN})?$`,
);
// sign, whole part, letter used as the decimal point, fraction, unit: "4k7", "3V3", "4R7", "2n2", "1meg5"
const AMOUNT_LETTER = new RegExp(`^([+-]?)\\s*(\\d+)(${PREFIX_PATTERN}|[RVHFS])(\\d+)\\s*(${UNIT_PATTERN})?$`);
const AMOUNT_INFINITE = new RegExp(`^([+-]?)\\s*(?:∞|[Ii]nf(?:inity)?)\\s*(${UNIT_PATTERN})?$`);

function unitOf(text: string): string {
  for (const [unit, test] of UNIT_TESTS) if (test.test(text)) return unit;
  return '';
}

const prefixScale = (letters: string): number => (letters.length === 3 ? 1e6 : SI_PREFIXES[letters]);

// Whether a typed unit fits: any unit but the metre when no unit is asked for, else only the unit asked for.
const unitFits = (typed: string, wanted: string | undefined): boolean => !typed || (wanted ? typed === wanted : typed !== 'm');

// A number as typed, with its sign. `unit` is the unit of the field: when given, a typed unit must be it, and the
// letter of a one-letter unit (H, F, S, m) may stand for the decimal point ("1m5" is 1.5 m when the field is in metres,
// 1.5 milli otherwise); R and V always may ("4R7", "3V3"). Without `unit` any unit but the metre is accepted and not
// checked (the resistor tool's behaviour). "3." while it is being typed is 3. `infinite` accepts "∞" or "inf" (an
// open: Infinity). null when it is not a number.
export function readAmount(text: string, unit?: string, infinite = false): number | null {
  const typed = String(text ?? '').trim().replace(/[−–]/g, '-');
  let match = AMOUNT_PLAIN.exec(typed);
  let value: number;
  if (match) {
    let prefix = match[4] ?? '';
    let typedUnit = match[5] ? unitOf(match[5]) : '';
    // "10 m" in a field in metres: the m is the unit, not milli.
    if (prefix === 'm' && !typedUnit && unit === 'm') { prefix = ''; typedUnit = 'm'; }
    if (!unitFits(typedUnit, unit) || (prefix && NO_PREFIX.has(typedUnit)) || (prefix === 'c' && typedUnit !== 'm')) return null;
    const mantissa = match[2].replace(',', '.');
    value = (match[3] ? Number(`${mantissa}e${match[3]}`) : Number(mantissa)) * prefixScale(prefix);
  } else if ((match = AMOUNT_LETTER.exec(typed))) {
    const letter = match[3];
    const typedUnit = match[5] ? unitOf(match[5]) : '';
    if (!unitFits(typedUnit, unit)) return null;
    let scale: number;
    if (letter === 'R' || letter === 'V' || letter === unit) scale = 1;
    else if (letter === 'H' || letter === 'F' || letter === 'S' || letter === 'c') return null;
    else scale = prefixScale(letter);
    value = Number(`${match[2]}.${match[4]}`) * scale;
  } else if (infinite && (match = AMOUNT_INFINITE.exec(typed))) {
    if (!unitFits(match[2] ? unitOf(match[2]) : '', unit)) return null;
    return match[1] === '-' ? -Infinity : Infinity;
  } else return null;
  if (!Number.isFinite(value)) return null;
  return match[1] === '-' ? -value : value;
}

const STEP_SCALES = [1e12, 1e9, 1e6, 1e3, 1, 1e-3, 1e-6, 1e-9, 1e-12, 1e-15];
const STEP_PREFIXES = ['T', 'G', 'M', 'k', '', 'm', 'µ', 'n', 'p', 'f'];

// A value with `digits` significant digits, an SI prefix (f to T) and a real minus sign: "3.296 V", "−10", "158 µA",
// "2.2 nH", "13.98 dB". Rounded with carry: 999.96 at four digits is "1 kΩ", never "1000 Ω". Trailing zeros are
// dropped, unless `keepZeros` (then every one of the `digits` is shown: "67.50 Ω", "1.350", for readouts whose parts
// should show the same precision). Infinity is "∞ Ω" (an open), NaN "–". Without a unit the number is written without
// a prefix.
export function formatAmount(value: number, unit: string, digits = 4, keepZeros = false): string {
  if (value !== value) return unit ? `– ${unit}` : '–';
  const sign = value < 0 ? '−' : '';
  const abs = Math.abs(value);
  if (abs === Infinity) return unit ? `${sign}∞ ${unit}` : `${sign}∞`;
  if (!unit || NO_PREFIX.has(unit)) {
    const text = `${sign}${keepZeros ? withZeros(abs, digits) : Number(abs.toPrecision(digits))}`;
    return unit ? `${text} ${unit}` : text;
  }
  if (abs === 0) return `0 ${unit}`;
  let i = 0;
  while (i < STEP_SCALES.length - 1 && abs < STEP_SCALES[i]) i++;
  let mantissa = Number((abs / STEP_SCALES[i]).toPrecision(digits));
  // The carry: 999.96 rounds to 1000, which is 1 of the next prefix.
  if (mantissa >= 1000 && i > 0) mantissa = Number((abs / STEP_SCALES[--i]).toPrecision(digits));
  return `${sign}${keepZeros ? withZeros(mantissa, digits) : mantissa} ${STEP_PREFIXES[i]}${unit}`;
}

// abs (> 0, finite) with `digits` significant digits and its trailing zeros, without an exponent down to 1e-7
// ("0.0000001230"); integers with more digits than that are written whole ("12350").
function withZeros(abs: number, digits: number): string {
  if (abs === 0) return '0';
  const r = Number(abs.toPrecision(digits));
  const dec = digits - 1 - Math.floor(Math.log10(r));
  if (dec <= 0) return String(r);
  if (dec > digits + 6) return r.toPrecision(digits).replace('e-', 'e−');
  return r.toFixed(dec);
}
