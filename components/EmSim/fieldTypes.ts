// The field view's settings (M2.2), in the first load: what is shown, with which drive and scale. The drawing code
// (fieldPaint.ts, colour maps, the fields engine's helpers) is loaded by `await import` when the view is turned on.

import type { DriveSpec } from '../../lib/emsim/jobs';

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
export function driveText(f: FieldSettings, n: number): string {
  const unit = isMagnetic(f.qty) ? 'A' : 'V';
  if (n <= 1) return `1 ${unit} on the line`;
  const d = f.drive;
  if (d === 'line') return `1 ${unit} on line ${Math.min(n, Math.max(1, f.line))}, the others at 0`;
  if (d === 'odd') return `+1 ${unit} on line 1, −1 ${unit} on line 2${n > 2 ? ', the others at 0' : ''}`;
  if (d === 'differential') return `+½ ${unit} on line 1, −½ ${unit} on line 2${n > 2 ? ', the others at 0' : ''}`;
  if (d === 'even') return `1 ${unit} on every line`;
  return unit === 'V' ? '1 V on every line' : `1 A in all lines together`;
}
