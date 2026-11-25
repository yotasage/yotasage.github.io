// Text forms of numbers, tolerances and sources for the EM simulation page (M2.1a). Display only: what a field shows
// is rounded to the digits preference, what the setup holds is never rounded.

import { formatLength, fromMm } from '../../lib/emsim/units';
import type { LengthUnit } from '../../lib/emsim/units';
import type { Source, Tol } from '../../lib/emsim/stackup';
import type { Locale } from '../../lib/ui/translations';
import { emT, getEmLocale } from './emText';

// The units the page offers for lengths (the readers also take in and oz when typed).
export type ShownUnit = 'mm' | 'mil' | 'um';
export const SHOWN_UNITS: readonly ShownUnit[] = ['mm', 'mil', 'um'];
export const DIGIT_CHOICES: readonly number[] = [3, 4, 5, 6];
export const DEFAULT_DIGITS = 4;

// A number with at most `digits` significant digits and no trailing zeros, with a true minus sign when `minus`.
export function numText(v: number, digits: number, minus = false): string {
  if (!Number.isFinite(v)) return '';
  const t = v === 0 ? '0' : String(Number(v.toPrecision(digits)));
  return minus ? t.replace('-', '−') : t;
}

// What a field shows for a value: a length in the shown unit without the unit word, or a plain number.
export function fieldText(v: number, unit: LengthUnit | null, digits: number): string {
  return numText(unit ? fromMm(v, unit) : v, digits);
}

export const lenText = (mm: number, unit: LengthUnit, digits: number) => formatLength(mm, unit, digits);

// A tolerance for reading ("±10 %", "±0.1 mil", "–" for none).
export function tolText(t: Tol, unit: LengthUnit | null, digits: number): string {
  if (!t) return '–';
  if ('rel' in t) return `±${numText(t.rel * 100, 3)} %`;
  return unit ? `±${formatLength(t.abs, unit, digits)}` : `±${numText(t.abs, digits)}`;
}

// A tolerance as its field shows it, read back by readTolerance in the same unit ('' for none).
export function tolField(t: Tol, unit: LengthUnit | null, digits: number): string {
  if (!t) return '';
  if ('rel' in t) return `±${numText(t.rel * 100, 3)} %`;
  return `±${fieldText(t.abs, unit, digits)}`;
}

export interface SourceTag {
  kind: 'preset' | 'kicad' | 'warn' | 'typed';
  text: string;
}

// The short tag a value carries (the Sources list under the table explains each).
export function sourceTag(s: Source, locale: Locale = getEmLocale()): SourceTag {
  if (s.kind === 'preset') return { kind: 'preset', text: s.note ? `${s.ref}*` : s.ref };
  if (s.kind === 'kicad') {
    if (s.absent) return { kind: 'warn', text: emT('em.src.kicadDflt', undefined, locale) };
    if (s.placeholder) return { kind: 'warn', text: emT('em.src.kicadTmpl', undefined, locale) };
    return { kind: 'kicad', text: 'KiCad' };
  }
  return { kind: 'typed', text: emT('em.src.typed', undefined, locale) };
}
