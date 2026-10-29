import { groupDigits } from '../simsetup/numbers';

// Digit groups are joined with a narrow no-break space, so a number is never split over two lines.
const group = (digits: string) => groupDigits(digits, 'space').replace(/ /g, ' ');

// Lengths, areas and volumes with up to `digits` significant digits (at most 6 decimals) and digit groups.
export function formatNumber(n: number, digits = 6): string {
  if (!Number.isFinite(n)) return '–';
  if (n === 0) return '0';
  const decimals = Math.max(0, Math.min(6, digits - 1 - Math.floor(Math.log10(Math.abs(n)))));
  const text = n.toFixed(decimals);
  return group(text.includes('.') ? text.replace(/\.?0+$/, '') : text);
}

export function formatCount(n: number): string {
  return group(String(n));
}

// "12.5 mm", or just the number when the units of the file are not known.
export function withUnit(value: string, units: string | null, power: '' | '²' | '³' = ''): string {
  return units ? `${value} ${units}${power}` : value;
}
