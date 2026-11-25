// The field view's settings (M2.2), in the first load: what is shown, with which drive and scale. The drawing code
// (fieldPaint.ts, colour maps, the fields engine's helpers) is loaded by `await import` when the view is turned on.

import type { DriveSpec } from '../../lib/emsim/jobs';
import type { Locale } from '../../lib/ui/translations';
import { emT, getEmLocale } from './emText';

export type FieldQty = 'phi' | 'E' | 'lines' | 'H' | 'charge' | 'current';
export type FieldDrive = 'line' | 'even' | 'odd' | 'differential' | 'common';
export type FieldScale = 'linear' | 'log';

export interface FieldSettings {
  on: boolean;
  qty: FieldQty;
  drive: FieldDrive;
  line: number; // 1-based, for drive 'line'
  scale: FieldScale;
  probe: boolean; // the drawing's arrow keys move the probe instead of panning
}

export const FIELD_DEFAULT: FieldSettings = { on: false, qty: 'E', drive: 'odd', line: 1, scale: 'linear', probe: false };

export const QTY_LABEL: Record<FieldQty, string> = {
  phi: 'Potential φ',
  E: 'Electric field |E|',
  lines: 'Field lines and equipotentials',
  H: 'Magnetic field |H| and its lines',
  charge: 'Surface charge on the copper',
  current: 'Surface current on the copper',
};

export const DRIVE_LABEL: Record<FieldDrive, string> = {
  odd: 'Odd (+1, −1)',
  differential: 'Differential (±½)',
  even: 'Even (all +1)',
  common: 'Common',
  line: 'One line driven',
};

/** The worker's field kind of a quantity: magnetic for |H| and the surface current. */
export const isMagnetic = (q: FieldQty): boolean => q === 'H' || q === 'current';

/** The drive of the settings for n lines (one line: that line). */
export function driveOf(f: FieldSettings, n: number): DriveSpec {
  if (n <= 1) return { name: 'line', line: 1 };
  if (f.drive === 'line') return { name: 'line', line: Math.min(n, Math.max(1, f.line)) };
  return { name: f.drive };
}

/** The drive in words for the scale bar's caption. */
export function driveText(f: FieldSettings, n: number, locale: Locale = getEmLocale()): string {
  const unit = isMagnetic(f.qty) ? 'A' : 'V';
  if (n <= 1) return emT('em.fld.dtSingle', { unit }, locale);
  const d = f.drive;
  if (d === 'line') return emT('em.fld.dtLine', { unit, n: Math.min(n, Math.max(1, f.line)) }, locale);
  const rest = n > 2 ? emT('em.fld.dtRest', undefined, locale) : '';
  if (d === 'odd') return emT('em.fld.dtOdd', { unit, rest }, locale);
  if (d === 'differential') return emT('em.fld.dtDiff', { unit, rest }, locale);
  if (d === 'even') return emT('em.fld.dtEven', { unit }, locale);
  return unit === 'V' ? emT('em.fld.dtCommonV', undefined, locale) : emT('em.fld.dtCommonA', undefined, locale);
}
