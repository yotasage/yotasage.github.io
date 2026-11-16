// Units of the EM simulation tool (engine.md §1): lengths in mm inside the engine, everything electrical in SI. The
// conversions to mil, µm, inch and copper weight happen only here, at the edges (fields, import, export). Reading a
// typed value never throws: it gives a value or the reason it cannot be read. Framework-free, no node: imports.

import { readAmount } from '../quantity';

export const MM_PER_MIL = 0.0254;
export const MM_PER_INCH = 25.4;
export const MM_PER_UM = 0.001;
// 1 oz/ft² of copper is 34.79 µm nominal (engine.md §1). What a fab means by "1 oz" as finished copper is in the
// stackup presets (JLCPCB: 0.035 mm outer, 0.03 mm inner), never derived from this constant.
export const MM_PER_OZ = 0.03479;

export type LengthUnit = 'mm' | 'mil' | 'um' | 'in' | 'oz';
export const LENGTH_UNITS: readonly LengthUnit[] = ['mm', 'mil', 'um', 'in', 'oz'];
// How each unit is written in text.
export const UNIT_TEXT: Readonly<Record<LengthUnit, string>> = { mm: 'mm', mil: 'mil', um: 'µm', in: 'in', oz: 'oz' };

const MM_PER: Readonly<Record<LengthUnit, number>> = { mm: 1, mil: MM_PER_MIL, um: MM_PER_UM, in: MM_PER_INCH, oz: MM_PER_OZ };

export function toMm(value: number, unit: LengthUnit): number {
  return unit === 'mm' ? value : value * MM_PER[unit];
}

export function fromMm(mm: number, unit: LengthUnit): number {
  return unit === 'mm' ? mm : mm / MM_PER[unit];
}

// The spellings read as each unit (case-insensitive except where noted).
const UNIT_WORDS: ReadonlyArray<readonly [RegExp, LengthUnit]> = [
  [/^(mm|millimet(er|re)s?)$/i, 'mm'],
  [/^(mils?|thou|th)$/i, 'mil'],
  [/^([uµμ]m|micro(n|ns|met(er|re)s?))$/i, 'um'],
  [/^(in|inch(es)?|"|″)$/i, 'in'],
  [/^(oz|oz\/ft²|oz\/ft2|ounces?)$/i, 'oz'],
  [/^(cm)$/i, 'mm'], // handled below (×10)
];

export type Read<T> = { ok: true; value: T } | { ok: false; reason: string };

const NUMBER_PART = /^([+-]?)(\d+\s*\/\s*\d+|\d+(?:[.,]\d*)?|[.,]\d+|½|¼|¾)(?:[eE]([+-]?\d+))?\s*(.*)$/;
const FRACTIONS: Readonly<Record<string, number>> = { '½': 0.5, '¼': 0.25, '¾': 0.75 };

// Reads a number with an optional unit word: "0.1377", "5.42 mil", "35µm", "1 oz", "½ oz", "1/2oz", "0,1 mm",
// "0.005 in", "3 thou", "1.6e-2 mm". Without a unit the value is in `unit`. Negative values and zero are refused
// unless allowed; the reason says why.
export function readLength(text: string, unit: LengthUnit = 'mm', opts?: { negative?: boolean; zero?: boolean }): Read<number> {
  const typed = String(text ?? '').trim().replace(/[−–]/g, '-');
  if (!typed) return { ok: false, reason: 'Nothing typed.' };
  const m = NUMBER_PART.exec(typed);
  if (!m) return { ok: false, reason: `"${typed}" is not a number.` };
  let v: number;
  const body = m[2];
  if (FRACTIONS[body] !== undefined) v = FRACTIONS[body];
  else if (body.includes('/')) {
    const [a, b] = body.split('/').map((s) => Number(s.trim()));
    if (!(b > 0)) return { ok: false, reason: `"${typed}" divides by zero.` };
    v = a / b;
  } else v = Number(body.replace(',', '.'));
  if (m[3]) v *= 10 ** Number(m[3]);
  if (m[1] === '-') v = -v;
  let u: LengthUnit = unit;
  let scale = 1;
  const word = m[4].trim();
  if (word) {
    const hit = UNIT_WORDS.find(([re]) => re.test(word));
    if (!hit) return { ok: false, reason: `"${word}" is not a length unit (mm, mil, µm, in or oz).` };
    u = hit[1];
    if (/^cm$/i.test(word)) scale = 10;
  }
  const mm = toMm(v * scale, u);
  if (!Number.isFinite(mm)) return { ok: false, reason: `"${typed}" is too large.` };
  if (mm < 0 && !opts?.negative) return { ok: false, reason: 'A length cannot be negative here.' };
  if (mm === 0 && !opts?.zero) return { ok: false, reason: 'A length of zero is not allowed here.' };
  return { ok: true, value: mm };
}

// A plain number (εr, tanδ, an etch factor): "4.1", "4,1", "2e-2", "0.02".
export function readPlain(text: string, opts?: { min?: number; max?: number; what?: string }): Read<number> {
  const typed = String(text ?? '').trim().replace(/[−–]/g, '-').replace(',', '.');
  const what = opts?.what ?? 'The value';
  if (!typed) return { ok: false, reason: 'Nothing typed.' };
  if (!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(typed)) return { ok: false, reason: `"${typed}" is not a number.` };
  const v = Number(typed);
  if (!Number.isFinite(v)) return { ok: false, reason: `"${typed}" is too large.` };
  if (opts?.min !== undefined && v < opts.min) return { ok: false, reason: `${what} must be at least ${opts.min}.` };
  if (opts?.max !== undefined && v > opts.max) return { ok: false, reason: `${what} must be at most ${opts.max}.` };
  return { ok: true, value: v };
}

// A frequency in Hz: "1 GHz", "100MHz", "1e9". Through lib/quantity's reader (SI prefixes).
export function readFrequency(text: string): Read<number> {
  const v = readAmount(String(text ?? ''), 'Hz');
  if (v === null) return { ok: false, reason: `"${String(text ?? '').trim()}" is not a frequency.` };
  if (!(v > 0)) return { ok: false, reason: 'A frequency must be above zero.' };
  return { ok: true, value: v };
}

// A tolerance: "±10%", "10 %", "± 0.01 mm", "0.5 mil". A percentage is relative (stored as a fraction), anything else
// a length in `unit` (absolute, in mm) or, with `plain`, an absolute plain number.
export function readTolerance(text: string, unit: LengthUnit = 'mm', plain = false): Read<{ abs: number } | { rel: number }> {
  const typed = String(text ?? '').trim().replace(/^±\s*|^\+\/-\s*/, '');
  if (!typed) return { ok: false, reason: 'Nothing typed.' };
  const pct = /^(.*?)\s*%$/.exec(typed);
  if (pct) {
    const r = readPlain(pct[1], { min: 0, what: 'A tolerance' });
    return r.ok ? { ok: true, value: { rel: r.value / 100 } } : { ok: false, reason: (r as { reason: string }).reason };
  }
  if (plain) {
    const r = readPlain(typed, { min: 0, what: 'A tolerance' });
    return r.ok ? { ok: true, value: { abs: r.value } } : { ok: false, reason: (r as { reason: string }).reason };
  }
  const r = readLength(typed, unit, { zero: true });
  return r.ok ? { ok: true, value: { abs: r.value } } : { ok: false, reason: (r as { reason: string }).reason };
}

// A length in a unit, with at most `digits` significant digits and no trailing zeros: "0.1377 mm", "5.421 mil".
export function formatLength(mm: number, unit: LengthUnit = 'mm', digits = 4): string {
  if (!Number.isFinite(mm)) return '–';
  const v = fromMm(mm, unit);
  const text = v === 0 ? '0' : String(Number(v.toPrecision(digits)));
  return `${text.replace('-', '−')} ${UNIT_TEXT[unit]}`;
}
