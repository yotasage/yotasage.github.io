// Markings on chip resistors: three and four digits, R as the decimal point, EIA-96, milliohm forms and links.

import { decompose, same, series, shift10 } from './eseries';
import { formatOhms, pow10Text } from './format';

// Tolerance letters of IEC 60062, in percent.
export const TOLERANCE_LETTERS: Record<string, number> = {
  E: 0.005, L: 0.01, P: 0.02, W: 0.05, B: 0.1, C: 0.25, D: 0.5, F: 1, G: 2, H: 3, J: 5, K: 10, M: 20, N: 30,
};

export function toleranceLetter(pct: number): string | undefined {
  return Object.keys(TOLERANCE_LETTERS).find((letter) => same(TOLERANCE_LETTERS[letter], pct));
}

// EIA-96 multiplier letters as powers of ten. The first letter of each power is the one written.
const EIA96_LETTERS: [string, number][] = [
  ['Z', -3], ['Y', -2], ['R', -2], ['X', -1], ['S', -1], ['A', 0], ['B', 1], ['H', 1], ['C', 2], ['D', 3], ['E', 4], ['F', 5],
];

export type MarkingForm = 'link' | 'digits3' | 'digits4' | 'r' | 'milli' | 'eia96';

export interface MarkingReading {
  form: MarkingForm;
  ohms: number;
  // Percent, from a tolerance letter.
  tolerance?: number;
  // One line on how the marking was read.
  how: string;
}

function digitsReading(digits: string): MarkingReading {
  const mantissa = digits.slice(0, -1);
  const exp = Number(digits.slice(-1));
  const ohms = Number(`${mantissa}e${exp}`);
  const zeros = exp === 0 ? 'no zeros' : exp === 1 ? 'one zero' : `${exp} zeros`;
  return {
    form: digits.length === 3 ? 'digits3' : 'digits4',
    ohms,
    how: `${digits.length}-digit code: ${mantissa} and ${zeros} (${mantissa} × ${pow10Text(exp)} Ω)`,
  };
}

// Every way a marking reads, as printed (not upside down). Letters may be in either case.
export function decodeMarking(marking: string): MarkingReading[] {
  const code = marking.trim().toUpperCase();
  const out: MarkingReading[] = [];
  let m: RegExpMatchArray | null;

  if (/^0{1,4}$/.test(code)) {
    out.push({ form: 'link', ohms: 0, how: `${code} marks a 0 Ω link (jumper)` });
  } else if (/^\d{3,4}$/.test(code)) {
    out.push(digitsReading(code));
  }

  // A tolerance letter after three or four characters: 103J, 1001F, 4R7J.
  m = code.match(/^(\d{3,4}|(?=\d*R\d*[A-Z]$)[\dR]{3,4})([A-Z])$/);
  if (m && TOLERANCE_LETTERS[m[2]] !== undefined) {
    for (const base of decodeMarking(m[1])) {
      out.push({ ...base, tolerance: TOLERANCE_LETTERS[m[2]], how: `${base.how}; ${m[2]} is the tolerance ±${TOLERANCE_LETTERS[m[2]]} %` });
    }
  }

  // R is the decimal point, and there is no exponent: 4R7, 0R22, R005, 68R0.
  m = code.match(/^(\d*)R(\d*)$/);
  if (m && code.length >= 2 && code.length <= 5) {
    out.push({ form: 'r', ohms: Number(`${m[1] || '0'}.${m[2] || '0'}`), how: 'R marks the decimal point of a value in ohms' });
  }

  // Milliohms: L is IEC's letter for milli (5L0); shunt makers also use M (1M50).
  m = code.match(/^(\d*)L(\d*)$/);
  if (m && code.length >= 2 && code.length <= 5) {
    out.push({ form: 'milli', ohms: shift10(Number(`${m[1] || '0'}.${m[2] || '0'}`), -3), how: 'L marks the decimal point of a value in milliohms' });
  }
  m = code.match(/^(\d*)M(\d+)$/);
  if (m && code.length >= 3 && code.length <= 5) {
    out.push({
      form: 'milli',
      ohms: shift10(Number(`${m[1] || '0'}.${m[2]}`), -3),
      how: 'M as the decimal point of a value in milliohms, as some makers of shunts mark them',
    });
  }

  // EIA-96: the number of an E96 value, then a multiplier letter.
  m = code.match(/^(\d\d)([ZYRXSABHCDEF])$/);
  if (m && Number(m[1]) >= 1 && Number(m[1]) <= 96) {
    const mantissa = series('E96').mantissas[Number(m[1]) - 1];
    const exp = EIA96_LETTERS.find(([letter]) => letter === m[2])[1];
    out.push({
      form: 'eia96',
      ohms: Number(`${mantissa}e${exp}`),
      how: `EIA-96: ${m[1]} is the E96 value ${mantissa}, ${m[2]} is × ${pow10Text(exp)}${m[2] === 'F' ? ' (here F is a multiplier, not the tolerance letter)' : ''}`,
    });
  }
  return out;
}

const FLIP: Record<string, string> = { 0: '0', 1: '1', 6: '9', 8: '8', 9: '6', H: 'H', S: 'S', X: 'X', Z: 'Z' };

// A marking turned upside down, or null when a character has no upside-down reading or nothing changes.
export function flipMarking(marking: string): string | null {
  const code = marking.trim().toUpperCase();
  let out = '';
  for (const c of code) {
    if (FLIP[c] === undefined) return null;
    out = FLIP[c] + out;
  }
  return out === code ? null : out;
}

export interface Markings {
  // Three characters: two digits and an exponent, or R as the decimal point.
  three?: string;
  // Four characters: three digits and an exponent, or R as the decimal point.
  four?: string;
  eia96?: string;
  // In milliohms with L, for values under 1 Ω.
  milli?: string;
  // Why a form is missing.
  why: { three?: string; four?: string; eia96?: string };
  // What each code says: "47 × 10² Ω".
  how: { three?: string; four?: string; eia96?: string; milli?: string };
}

// The value with `digits` digits around a decimal-point letter, or null when it does not fit.
function pointCode(value: number, digits: number, letter: string): string | null {
  for (let whole = digits; whole >= 0; whole--) {
    const scaled = shift10(value, digits - whole);
    const rounded = Math.round(scaled);
    if (!same(scaled, rounded) || rounded >= 10 ** digits) continue;
    const text = String(rounded).padStart(digits, '0');
    // No leading zero before the letter, unless there is no whole part.
    if (whole > 0 && text[0] === '0') continue;
    return `${text.slice(0, whole)}${letter}${text.slice(whole)}`;
  }
  return null;
}

function lengthCode(ohms: number, length: 3 | 4): { code?: string; how?: string; why?: string } {
  const digits = length - 1;
  const { mantissa, exp, exact } = decompose(ohms, digits);
  if (exact && exp >= 0 && exp <= 9) return { code: `${mantissa}${exp}`, how: `${mantissa} × ${pow10Text(exp)} Ω` };
  const point = pointCode(ohms, digits, 'R');
  if (point) return { code: point, how: 'R is the decimal point' };
  if (exact && exp > 9) return { why: 'too large for the code' };
  return { why: `needs more than ${digits === 2 ? 'two' : 'three'} digits` };
}

// The markings of a value. Sizes 01005 and 0201 and most 0402 parts carry none.
export function encodeMarkings(ohms: number): Markings {
  const out: Markings = { why: {}, how: {} };
  if (!(ohms >= 0) || !Number.isFinite(ohms)) return out;
  if (ohms === 0) {
    out.three = '000';
    out.four = '0000';
    out.how.three = out.how.four = 'a 0 Ω link; also 0 or 00';
    out.why.eia96 = 'EIA-96 has no code for a link';
    return out;
  }
  const three = lengthCode(ohms, 3);
  out.three = three.code; out.how.three = three.how; out.why.three = three.why;
  const four = lengthCode(ohms, 4);
  out.four = four.code; out.how.four = four.how; out.why.four = four.why;

  const { mantissa, exp, exact } = decompose(ohms, 3);
  const index = exact ? series('E96').mantissas.indexOf(mantissa) : -1;
  const letter = EIA96_LETTERS.find(([, e]) => e === exp);
  if (index < 0) out.why.eia96 = `${formatOhms(ohms)} is not an E96 value`;
  else if (!letter) out.why.eia96 = 'outside the multipliers of EIA-96';
  else {
    out.eia96 = `${String(index + 1).padStart(2, '0')}${letter[0]}`;
    out.how.eia96 = `value ${index + 1} of E96 (${mantissa}), ${letter[0]} is × ${pow10Text(exp)}`;
  }

  if (ohms < 1) {
    const milli = pointCode(shift10(ohms, 3), 2, 'L') ?? pointCode(shift10(ohms, 3), 3, 'L');
    if (milli) { out.milli = milli; out.how.milli = 'L is the decimal point of a value in milliohms'; }
  }
  return out;
}
