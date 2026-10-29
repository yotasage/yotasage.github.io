// Reading and writing numbers with SI prefixes, such as 2.5M, 10 ms or 100 kHz.
//
// https://en.wikipedia.org/wiki/Metric_prefix

export type NumberFormat = 'plain' | 'si';

export type DigitGrouping = 'none' | 'space' | 'underscore';

const GROUP_SEPARATORS: Record<DigitGrouping, string> = { none: '', space: ' ', underscore: '_' };

/**
 * Groups the whole-number part in threes: "2340571.4286" → "2 340 571.4286" or "2_340_571.4286".
 * Python reads the underscore form as a number.
 */
export function groupDigits(number: string, grouping: DigitGrouping): string {
  const separator = GROUP_SEPARATORS[grouping];
  if (!separator) return number;
  return number.replace(/^([+-]?)(\d+)/, (_, sign: string, digits: string) => sign + digits.replace(/\B(?=(\d{3})+$)/g, separator));
}

// Digit groups as this page writes them, or as in Python: 1 000 000, 1_000_000 (also thin and no-break spaces).
const DIGIT_GROUP_SEPARATOR = /(?<=\d)[ _   ](?=\d)/g;
const HEX_DIGIT_GROUP_SEPARATOR = /(?<=[0-9A-Fa-f])[ _   ](?=[0-9A-Fa-f])/g;

/**
 * Removes digit group separators: "1 000 000" and "1_000_000" → "1000000".
 * With hex, also between the letters A–F ("0xFF_FF"); without, "1 E 3" stays as it is.
 */
export function removeDigitGroups(text: string, hex = false): string {
  return text.replace(hex ? HEX_DIGIT_GROUP_SEPARATOR : DIGIT_GROUP_SEPARATOR, '');
}

// Power of ten for each prefix.
const PREFIX_EXPONENTS: Record<string, number> = {
  Q: 30,   // quetta
  R: 27,   // ronna
  Y: 24,   // yotta
  Z: 21,   // zetta
  E: 18,   // exa
  P: 15,   // peta
  T: 12,   // tera
  G: 9,    // giga
  M: 6,    // mega
  meg: 6,  // mega, as written in SPICE
  MEG: 6,
  Meg: 6,
  k: 3,    // kilo
  h: 2,    // hecto
  da: 1,   // deca

  d: -1,   // deci
  c: -2,   // centi
  m: -3,   // milli
  u: -6,   // micro
  'µ': -6, // micro (micro sign)
  'μ': -6, // micro (Greek mu)
  n: -9,   // nano
  p: -12,  // pico
  f: -15,  // femto
  a: -18,  // atto
  z: -21,  // zepto
  y: -24,  // yocto
  r: -27,  // ronto
  q: -30,  // quecto
};

// Prefixes used when writing numbers: one per power of 1000.
const OUTPUT_PREFIXES: Record<number, string> = {
  30: 'Q', 27: 'R', 24: 'Y', 21: 'Z', 18: 'E', 15: 'P', 12: 'T', 9: 'G', 6: 'M', 3: 'k', 0: '',
  [-3]: 'm', [-6]: 'µ', [-9]: 'n', [-12]: 'p', [-15]: 'f', [-18]: 'a', [-21]: 'z', [-24]: 'y', [-27]: 'r', [-30]: 'q',
};

const UNIT_PATTERNS: Record<string, string> = { Hz: '[Hh][Zz]', s: 's' };

// Longer prefixes first, so "meg" is not read as "m" followed by "eg".
const PREFIX_PATTERN = Object.keys(PREFIX_EXPONENTS).sort((a, b) => b.length - a.length).join('|');

const patterns = new Map<string, RegExp>();

function patternFor(unit: string): RegExp {
  let pattern = patterns.get(unit);
  if (!pattern) {
    const unitPattern = UNIT_PATTERNS[unit] ? `(?:${UNIT_PATTERNS[unit]})?` : '';
    pattern = new RegExp(`^([+-]?(?:\\d+\\.?\\d*|\\.\\d+))(?:[eE]([+-]?\\d+))?\\s*(${PREFIX_PATTERN})?\\s*${unitPattern}$`);
    patterns.set(unit, pattern);
  }
  return pattern;
}

export type Parsed = { ok: true; value: number } | { ok: false; error: string };

/**
 * Reads a number such as "16384", "16 384", "16_384", "1e3", "2.5M", "10 m", "100 kHz" or "4.7ns".
 * Prefixes are case sensitive (m is milli, M is mega). The unit is optional.
 * @param text what the user typed
 * @param unit the unit that may follow the prefix ('Hz' or 's'), or '' for plain numbers
 */
export function parseQuantity(text: string, unit = ''): Parsed {
  const trimmed = removeDigitGroups(text.trim());
  if (trimmed === '') return { ok: false, error: 'Enter a value' };

  const match = patternFor(unit).exec(trimmed);
  if (!match) return { ok: false, error: 'Not a valid number' };

  const [, mantissa, exponent = '0', prefix] = match;
  const power = Number(exponent) + (prefix ? PREFIX_EXPONENTS[prefix] : 0);
  // Moving the decimal point in the text keeps "4.7n" exactly as close to 4.7e-9 as typing 4.7e-9.
  const value = Number(`${mantissa}e${power}`);
  if (!Number.isFinite(value)) return { ok: false, error: 'Too large' };
  return { ok: true, value };
}

/** Rounds to `precision` significant digits without trailing zeros, e.g. 1000.0000001 → "1000". */
export function formatNumber(value: number, precision: number, grouping: DigitGrouping = 'none'): string {
  return groupDigits(String(Number(value.toPrecision(precision))), grouping);
}

// Splits a number into a mantissa from 1 to 999.999… and an SI prefix.
function siParts(value: number, precision: number): { mantissa: string; prefix: string } {
  const [digits, exponentText] = value.toExponential().split('e');
  const exponent = Number(exponentText);
  let power = Math.min(30, Math.max(-30, Math.floor(exponent / 3) * 3));
  let mantissa = Number(`${digits}e${exponent - power}`);
  let rounded = Number(mantissa.toPrecision(precision));
  // 999.9999 can round up to 1000, which belongs to the next prefix.
  if (Math.abs(rounded) >= 1000 && power < 30) {
    power += 3;
    mantissa = Number(`${digits}e${exponent - power}`);
    rounded = Number(mantissa.toPrecision(precision));
  }
  return { mantissa: String(rounded), prefix: OUTPUT_PREFIXES[power] };
}

/** Writes a result for display, e.g. "2340571.4286 Hz" (plain), "2_340_571.4286 Hz" (grouped) or "2.3405714286 MHz" (SI). */
export function formatQuantity(
  value: number | null, unit: string, precision: number, format: NumberFormat, grouping: DigitGrouping = 'none',
): string {
  if (value === null || !Number.isFinite(value)) return '—';
  if (format === 'si' && unit !== '') {
    const { mantissa, prefix } = siParts(value, precision);
    return `${groupDigits(mantissa, grouping)} ${prefix}${unit}`;
  }
  const number = formatNumber(value, precision, grouping);
  return unit === '' ? number : `${number} ${unit}`;
}
