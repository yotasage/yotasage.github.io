// E-series of preferred values (IEC 60063) and the numeric helpers the rest of the resistor library shares.
// Resistances are plain numbers in ohms. A standard value is a three-digit mantissa (100 to 976) times a power of ten,
// and is always built from decimal text so that 4.7 kΩ is exactly 4700 and not 4700.000000000001.

export type SeriesId = 'E3' | 'E6' | 'E12' | 'E24' | 'E48' | 'E96' | 'E192' | 'E24+E96';

export interface Series {
  id: SeriesId;
  // Shown on the page.
  label: string;
  // The values of one decade as integers from 100 to 976, ascending.
  mantissas: number[];
  // The tolerance the series is usually sold in, as text and in percent.
  tolerance: string;
  tolerancePct: number;
}

// True when two resistances are the same within rounding of floating point.
export function same(a: number, b: number): boolean {
  return Math.abs(a - b) <= 1e-9 * Math.max(Math.abs(a), Math.abs(b));
}

// value · 10^n without the rounding of a multiplication.
export function shift10(value: number, n: number): number {
  if (value === 0 || !Number.isFinite(value)) return value;
  const [mantissa, exponent] = value.toExponential().split('e');
  return Number(`${mantissa}e${Number(exponent) + n}`);
}

// A value as an integer of `digits` digits times a power of ten. `exact` is false when the value needs more digits.
export function decompose(ohms: number, digits: number): { mantissa: number; exp: number; exact: boolean } {
  const [m, e] = ohms.toExponential(digits - 1).split('e');
  const mantissa = Number(m.replace('.', ''));
  const exp = Number(e) - (digits - 1);
  return { mantissa, exp, exact: same(Number(`${mantissa}e${exp}`), ohms) };
}

const E24 = [100, 110, 120, 130, 150, 160, 180, 200, 220, 240, 270, 300, 330, 360, 390, 430, 470, 510, 560, 620, 680, 750, 820, 910];

// round(10^(n/192)) to three significant figures, except n = 185, which the standard gives as 9.20.
const E192 = Array.from({ length: 192 }, (_, n) => (n === 185 ? 920 : Math.round(100 * 10 ** (n / 192))));

const every = (values: number[], step: number) => values.filter((_, i) => i % step === 0);

const E96 = every(E192, 2);

export const SERIES: Series[] = [
  { id: 'E3', label: 'E3', mantissas: every(E24, 8), tolerance: 'over 20 %', tolerancePct: 50 },
  { id: 'E6', label: 'E6', mantissas: every(E24, 4), tolerance: '20 %', tolerancePct: 20 },
  { id: 'E12', label: 'E12', mantissas: every(E24, 2), tolerance: '10 %', tolerancePct: 10 },
  { id: 'E24', label: 'E24', mantissas: E24, tolerance: '5 %', tolerancePct: 5 },
  { id: 'E48', label: 'E48', mantissas: every(E192, 4), tolerance: '2 %', tolerancePct: 2 },
  { id: 'E96', label: 'E96', mantissas: E96, tolerance: '1 %', tolerancePct: 1 },
  { id: 'E192', label: 'E192', mantissas: E192, tolerance: '0.5 % and tighter', tolerancePct: 0.5 },
  // 1 % parts are sold in E24 values too, and E24 is not a subset of E96.
  { id: 'E24+E96', label: 'E24 ∪ E96', mantissas: [...new Set([...E24, ...E96])].sort((a, b) => a - b), tolerance: '1 %', tolerancePct: 1 },
];

export function series(id: SeriesId): Series {
  return SERIES.find((s) => s.id === id);
}

export function isSeriesId(text: string): text is SeriesId {
  return SERIES.some((s) => s.id === text);
}

// The series a tolerance is usually sold in.
export function usualSeries(tolerancePct: number): SeriesId {
  if (tolerancePct > 20) return 'E3';
  if (tolerancePct >= 20) return 'E6';
  if (tolerancePct >= 10) return 'E12';
  if (tolerancePct >= 5) return 'E24';
  if (tolerancePct >= 2) return 'E48';
  if (tolerancePct >= 1) return 'E96';
  return 'E192';
}

// The standard value with this mantissa (100 to 976) in the decade 10^decade (2 gives 100 Ω to 976 Ω).
export function standardValue(mantissa: number, decade: number): number {
  return Number(`${mantissa}e${decade - 2}`);
}

// Every value of a series from min to max, both included, ascending.
export function seriesValues(id: SeriesId, min: number, max: number): number[] {
  const { mantissas } = series(id);
  const out: number[] = [];
  if (!(min > 0) || !(max >= min)) return out;
  for (let decade = Math.floor(Math.log10(min)) - 1; decade <= Math.ceil(Math.log10(max)); decade++) {
    for (const m of mantissas) {
      const v = standardValue(m, decade);
      if ((v > min || same(v, min)) && (v < max || same(v, max))) out.push(v);
    }
  }
  return out;
}

export interface Neighbours {
  // The nearest standard value below and above the target, never the target itself.
  below: number;
  above: number;
  // The standard value with the smallest relative error; the target itself when it is in the series.
  nearest: number;
  exact: boolean;
}

// The neighbours of a positive resistance in a series.
export function neighbours(ohms: number, id: SeriesId): Neighbours | null {
  if (!(ohms > 0) || !Number.isFinite(ohms)) return null;
  const { mantissas } = series(id);
  const decade = Math.floor(Math.log10(ohms));
  let below = -Infinity;
  let above = Infinity;
  let exact = false;
  for (let d = decade - 1; d <= decade + 1; d++) {
    for (const m of mantissas) {
      const v = standardValue(m, d);
      if (same(v, ohms)) exact = true;
      else if (v < ohms) below = Math.max(below, v);
      else above = Math.min(above, v);
    }
  }
  const nearest = exact ? ohms : (ohms - below <= above - ohms ? below : above);
  return { below, above, nearest, exact };
}

// Signed error of a value against the wanted one, in percent: positive when the value is larger.
export function errorPct(value: number, target: number): number {
  if (same(value, target)) return 0;
  return ((value - target) / target) * 100;
}

export function inSeries(ohms: number, id: SeriesId): boolean {
  if (!(ohms > 0) || !Number.isFinite(ohms)) return false;
  const { mantissa, exact } = decompose(ohms, 3);
  return exact && series(id).mantissas.includes(mantissa);
}

// The series a value belongs to, coarsest first (without the union, which follows from E24 and E96).
export function seriesContaining(ohms: number): SeriesId[] {
  return SERIES.filter((s) => s.id !== 'E24+E96' && inSeries(ohms, s.id)).map((s) => s.id);
}

// How common a value is: 0 for E24, 1 for E96, 2 for E192, 3 when it is in no series.
export function commonness(ohms: number): number {
  if (inSeries(ohms, 'E24')) return 0;
  if (inSeries(ohms, 'E96')) return 1;
  if (inSeries(ohms, 'E192')) return 2;
  return 3;
}

// The next value of a series above (dir 1) or below (dir -1) a resistance.
export function step(ohms: number, id: SeriesId, dir: 1 | -1): number | null {
  const n = neighbours(ohms, id);
  if (!n) return null;
  return dir > 0 ? n.above : n.below;
}
