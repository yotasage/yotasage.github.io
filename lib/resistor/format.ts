// Writing resistances, tolerances and errors as text.

import { shift10 } from './eseries';

const PREFIXES: [number, string][] = [[-6, 'µ'], [-3, 'm'], [0, ''], [3, 'k'], [6, 'M'], [9, 'G'], [12, 'T']];

export const MINUS = '−';

const SUPERSCRIPTS: Record<string, string> = {
  '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹',
};

// 10 to a power, with the exponent as superscript digits.
export function pow10Text(exp: number): string {
  return `10${String(exp).split('').map((c) => SUPERSCRIPTS[c]).join('')}`;
}

// A plain decimal number without exponent notation or rounding noise.
function plain(value: number, digits: number): string {
  const rounded = Number(value.toPrecision(digits));
  if (rounded === 0) return '0';
  const text = String(rounded);
  if (!text.includes('e')) return text;
  return rounded.toFixed(Math.max(0, digits - 1 - Math.floor(Math.log10(Math.abs(rounded))))).replace(/\.?0+$/, '');
}

// The number and the unit of a resistance apart, so the unit can be set in a quieter colour: ["4.7", "kΩ"].
export function ohmsParts(ohms: number, digits = 6): [string, string] {
  if (!Number.isFinite(ohms)) return ['∞', 'Ω'];
  const rounded = Number(ohms.toPrecision(digits));
  if (rounded === 0) return ['0', 'Ω'];
  const exp = Math.floor(Math.log10(Math.abs(rounded)));
  const [power, prefix] = PREFIXES[Math.min(PREFIXES.length - 1, Math.max(0, Math.floor(exp / 3) + 2))];
  return [plain(shift10(rounded, -power), digits), `${prefix}Ω`];
}

// "4.7 kΩ"
export function formatOhms(ohms: number, digits = 6): string {
  return ohmsParts(ohms, digits).join(' ');
}

// RKM notation (IEC 60062), where the letter of the multiplier is the decimal point: "4k7", "47R", "R47", "1M5".
// Values below 1 mΩ are written in milliohms with L.
export function formatRkm(ohms: number, digits = 6): string {
  const rounded = Number(ohms.toPrecision(digits));
  if (!Number.isFinite(rounded)) return '';
  if (rounded === 0) return '0R';
  const abs = Math.abs(rounded);
  const [power, letter]: [number, string] = abs >= 1e9 ? [9, 'G'] : abs >= 1e6 ? [6, 'M'] : abs >= 1e3 ? [3, 'k']
    : abs >= 1e-3 ? [0, 'R'] : [-3, 'L'];
  const [whole, fraction = ''] = plain(shift10(abs, -power), digits).split('.');
  return `${whole === '0' ? '' : whole}${letter}${fraction}`;
}

// "5 %", "0.25 %"
export function formatPct(pct: number): string {
  return `${plain(pct, 4)} %`;
}

// "±5 %"
export function formatTolerance(pct: number): string {
  return `±${formatPct(pct)}`;
}

// A signed error with three significant digits: "+0.412 %", "−3.09 %", "0 %".
export function formatError(pct: number): string {
  if (pct === 0) return '0 %';
  const abs = Math.abs(pct);
  const text = abs >= 100 ? abs.toFixed(0) : abs >= 10 ? abs.toFixed(1) : abs >= 1 ? abs.toFixed(2)
    : abs >= 0.1 ? abs.toFixed(3) : plain(abs, 2);
  return `${pct < 0 ? MINUS : '+'}${text} %`;
}
