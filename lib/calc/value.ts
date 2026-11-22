// Complex, unit-aware quantity arithmetic, mathematical functions, conversions,
// companion hints, and text / KaTeX formatting for the Smart Calculator engine.
// Framework-free; zero external dependencies; no node:* imports.

import { cabs, carg, cdiv, cmul, csqrt } from '../complex';
import {
  type AngleKind, type DataKind, type Dim,
  DIM_AREA, DIM_CONDUCTANCE, DIM_FREQ, DIM_POWER, DIM_RESISTANCE,
  DIM_TEMP, DIM_TIME, DIM_VOLTAGE, DIM_VOLUME, DIM_ZERO,
  type LogKind, type TempKind, type UnitSpec,
  chooseSmartUnit, dimAdd, dimEqual, dimIsZero, dimScale, dimSub,
  formatDimBaseSI, formatRealLatex, formatRealNumber, parseUnitExpr,
} from './units';

export class CalcError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CalcError';
  }
}

export interface CalcValue {
  /** Real component in SI base units (radians for angleKind, dB for logKind, bits for dataKind). */
  re: number;
  im: number;
  dim: Dim;
  unitHint?: UnitSpec;
  /** True when explicitly converted to `unitHint`, pinning formatted output to that unit. */
  unitForced?: boolean;
  angleKind?: AngleKind;
  logKind?: LogKind;
  tempKind?: TempKind;
  dataKind?: DataKind;
}

export interface FormatOptions {
  digits?: number;
  angleUnit?: 'deg' | 'rad';
}

export interface CompanionHint {
  label: string;
  text: string;
  latex: string;
  value: CalcValue;
}

const ZERO_EPS = 1e-14;
const SCRATCH = new Float64Array(2);

// Snap `x` to 0 only when negligible relative to a non-zero reference `ref` (preserves tiny SI quantities like 1e-34).
const snapZero = (x: number, ref: number): number =>
  ref !== 0 && Math.abs(x) <= ZERO_EPS * Math.abs(ref) ? 0 : x;

const isComplex = (v: CalcValue): boolean =>
  v.im !== 0 && Math.abs(v.im) > ZERO_EPS * Math.abs(v.re);

function describeUnit(v: CalcValue): string {
  if (v.logKind) return v.logKind === 'dBuV' ? 'dBµV' : v.logKind;
  if (v.tempKind === 'C') return '°C';
  if (v.tempKind === 'F') return '°F';
  if (v.unitHint) return v.unitHint.symbol;
  if (v.angleKind) return v.angleKind;
  if (v.dataKind) return 'data';
  if (dimIsZero(v.dim)) return 'dimensionless';
  return chooseSmartUnit(Math.max(1, cabs(v.re, v.im)), v.dim).symbol || formatDimBaseSI(v.dim).symbol;
}

function requireReal(v: CalcValue, op: string): number {
  if (isComplex(v)) throw new CalcError(`${op} requires a real value`);
  return v.re;
}

function requireDimensionless(v: CalcValue, op: string): void {
  if (!dimIsZero(v.dim) || v.logKind || v.dataKind) {
    throw new CalcError(`${op} requires a dimensionless argument (got ${describeUnit(v)})`);
  }
}

// ---------------------------------------------------------------------------
// Constructors
// ---------------------------------------------------------------------------

export const makeScalar = (re: number, dim: Dim = DIM_ZERO, extra?: Partial<CalcValue>): CalcValue =>
  ({ re, im: 0, dim, ...extra });

export const makeComplex = (re: number, im: number, dim: Dim = DIM_ZERO, extra?: Partial<CalcValue>): CalcValue =>
  ({ re, im, dim, ...extra });

/** Create a CalcValue from a numeric magnitude and a UnitSpec (applying affine temp or scale). */
export function fromNumberAndUnit(n: number, unit: UnitSpec): CalcValue {
  if (unit.logKind) return { re: n, im: 0, dim: DIM_ZERO, logKind: unit.logKind, unitHint: unit };
  if (unit.tempKind === 'C') return { re: n + 273.15, im: 0, dim: DIM_TEMP, tempKind: 'C', unitHint: unit };
  if (unit.tempKind === 'F') return { re: (n - 32) * (5 / 9) + 273.15, im: 0, dim: DIM_TEMP, tempKind: 'F', unitHint: unit };
  return { re: n * unit.scale, im: 0, dim: unit.dim, unitHint: unit, angleKind: unit.angleKind, dataKind: unit.dataKind };
}

/** Apply a unit to an existing (possibly complex) CalcValue, e.g. `(50 + j*30) Ohm`. */
export function applyUnit(v: CalcValue, unit: UnitSpec): CalcValue {
  if (!dimIsZero(v.dim) || v.logKind || v.tempKind || v.dataKind) {
    return vMul(v, fromNumberAndUnit(1, unit));
  }
  if (unit.logKind || unit.tempKind) return fromNumberAndUnit(requireReal(v, unit.symbol), unit);
  return {
    re: v.re * unit.scale, im: v.im * unit.scale, dim: unit.dim,
    unitHint: unit, angleKind: unit.angleKind, dataKind: unit.dataKind,
  };
}

// ---------------------------------------------------------------------------
// Core Unit-Safe Arithmetic
// ---------------------------------------------------------------------------

export function vNeg(a: CalcValue): CalcValue {
  if (a.tempKind && a.unitHint) {
    const disp = a.tempKind === 'C' ? a.re - 273.15 : (a.re - 273.15) * (9 / 5) + 32;
    return fromNumberAndUnit(-disp, a.unitHint);
  }
  return { ...a, re: -a.re, im: -a.im };
}

const logPowerOffset = (k: LogKind): number | null => (k === 'dBm' ? 0 : k === 'dBW' ? 30 : null);
const logVoltOffset = (k: LogKind): number | null => (k === 'dBV' ? 0 : k === 'dBuV' ? -120 : null);

export function vAdd(a: CalcValue, b: CalcValue): CalcValue {
  if (a.logKind || b.logKind) {
    if (a.logKind === 'dB' && b.logKind === 'dB') return { re: a.re + b.re, im: 0, dim: DIM_ZERO, logKind: 'dB' };
    if (a.logKind && a.logKind !== 'dB' && b.logKind === 'dB') {
      return { re: a.re + b.re, im: 0, dim: DIM_ZERO, logKind: a.logKind, unitHint: a.unitHint };
    }
    if (a.logKind === 'dB' && b.logKind && b.logKind !== 'dB') {
      return { re: a.re + b.re, im: 0, dim: DIM_ZERO, logKind: b.logKind, unitHint: b.unitHint };
    }
    throw new CalcError(`Cannot add ${describeUnit(a)} and ${describeUnit(b)}; add a dB offset or convert to linear units first`);
  }
  if (a.dataKind !== b.dataKind || !dimEqual(a.dim, b.dim)) {
    throw new CalcError(`Dimension mismatch: cannot add ${describeUnit(a)} and ${describeUnit(b)}`);
  }
  if (a.tempKind && b.tempKind) {
    throw new CalcError(`Cannot add two absolute temperatures (${describeUnit(a)} + ${describeUnit(b)}); add a Kelvin interval (K) instead`);
  }
  const tempKind = a.tempKind ?? b.tempKind;
  const sameHint = a.unitHint && b.unitHint && a.unitHint.symbol === b.unitHint.symbol ? a.unitHint : undefined;
  return {
    re: a.re + b.re, im: a.im + b.im, dim: a.dim,
    unitHint: tempKind ? (a.tempKind ? a.unitHint : b.unitHint) : sameHint,
    angleKind: a.angleKind ?? b.angleKind, tempKind, dataKind: a.dataKind,
  };
}

export function vSub(a: CalcValue, b: CalcValue): CalcValue {
  if (a.logKind || b.logKind) {
    if (a.logKind === 'dB' && b.logKind === 'dB') return { re: a.re - b.re, im: 0, dim: DIM_ZERO, logKind: 'dB' };
    if (a.logKind && a.logKind !== 'dB' && b.logKind === 'dB') {
      return { re: a.re - b.re, im: 0, dim: DIM_ZERO, logKind: a.logKind, unitHint: a.unitHint };
    }
    if (a.logKind && b.logKind && a.logKind !== 'dB' && b.logKind !== 'dB') {
      const pa = logPowerOffset(a.logKind), pb = logPowerOffset(b.logKind);
      if (pa !== null && pb !== null) return { re: (a.re + pa) - (b.re + pb), im: 0, dim: DIM_ZERO, logKind: 'dB' };
      const va = logVoltOffset(a.logKind), vb = logVoltOffset(b.logKind);
      if (va !== null && vb !== null) return { re: (a.re + va) - (b.re + vb), im: 0, dim: DIM_ZERO, logKind: 'dB' };
    }
    throw new CalcError(`Cannot subtract ${describeUnit(b)} from ${describeUnit(a)}; convert to compatible units first`);
  }
  if (a.dataKind !== b.dataKind || !dimEqual(a.dim, b.dim)) {
    throw new CalcError(`Dimension mismatch: cannot subtract ${describeUnit(b)} from ${describeUnit(a)}`);
  }
  const tempKind = a.tempKind && !b.tempKind ? a.tempKind : undefined;
  const sameHint = !a.tempKind && !b.tempKind && a.unitHint?.symbol === b.unitHint?.symbol ? a.unitHint : undefined;
  return {
    re: a.re - b.re, im: a.im - b.im, dim: a.dim,
    unitHint: tempKind ? a.unitHint : sameHint,
    angleKind: a.angleKind ?? b.angleKind, tempKind, dataKind: a.dataKind,
  };
}

function areaOrVolHint(a: CalcValue, b: CalcValue, outDim: Dim): UnitSpec | undefined {
  if (!a.unitHint || !b.unitHint) return undefined;
  if (dimEqual(outDim, DIM_AREA) && a.unitHint.symbol === b.unitHint.symbol && dimEqual(a.dim, b.dim)) {
    return parseUnitExpr(`${a.unitHint.symbol}^2`) ?? undefined;
  }
  if (dimEqual(outDim, DIM_VOLUME)) {
    if (dimEqual(a.dim, DIM_AREA) && a.unitHint.symbol.endsWith('²') && a.unitHint.symbol.slice(0, -1) === b.unitHint.symbol) {
      return parseUnitExpr(`${b.unitHint.symbol}^3`) ?? undefined;
    }
    if (dimEqual(b.dim, DIM_AREA) && b.unitHint.symbol.endsWith('²') && b.unitHint.symbol.slice(0, -1) === a.unitHint.symbol) {
      return parseUnitExpr(`${a.unitHint.symbol}^3`) ?? undefined;
    }
  }
  return undefined;
}

export function vMul(a: CalcValue, b: CalcValue): CalcValue {
  if (a.logKind || b.logKind) {
    if (a.logKind === 'dB' && dimIsZero(b.dim) && !b.logKind && !b.dataKind) {
      return { re: a.re * requireReal(b, 'dB scaling'), im: 0, dim: DIM_ZERO, logKind: 'dB' };
    }
    if (b.logKind === 'dB' && dimIsZero(a.dim) && !a.logKind && !a.dataKind) {
      return { re: requireReal(a, 'dB scaling') * b.re, im: 0, dim: DIM_ZERO, logKind: 'dB' };
    }
    throw new CalcError(`Cannot multiply ${describeUnit(a)} by ${describeUnit(b)}; convert to linear units first`);
  }
  cmul(SCRATCH, 0, a.re, a.im, b.re, b.im);
  const dim = dimAdd(a.dim, b.dim);
  return {
    re: snapZero(SCRATCH[0], SCRATCH[1]), im: snapZero(SCRATCH[1], SCRATCH[0]), dim,
    unitHint: areaOrVolHint(a, b, dim),
    angleKind: dimIsZero(dim) ? (a.angleKind ?? b.angleKind) : undefined,
    dataKind: a.dataKind ?? b.dataKind,
  };
}

export function vDiv(a: CalcValue, b: CalcValue): CalcValue {
  if (b.re === 0 && b.im === 0) throw new CalcError('Division by zero');
  if (b.logKind) throw new CalcError(`Cannot divide by ${describeUnit(b)}; convert to linear units first`);
  if (a.logKind) {
    if (a.logKind === 'dB' && dimIsZero(b.dim) && !b.dataKind) {
      return { re: a.re / requireReal(b, 'dB division'), im: 0, dim: DIM_ZERO, logKind: 'dB' };
    }
    throw new CalcError(`Cannot divide ${describeUnit(a)} by ${describeUnit(b)}; convert to linear units first`);
  }
  cdiv(SCRATCH, 0, a.re, a.im, b.re, b.im);
  const dim = dimSub(a.dim, b.dim);
  return {
    re: snapZero(SCRATCH[0], SCRATCH[1]), im: snapZero(SCRATCH[1], SCRATCH[0]), dim,
    angleKind: dimIsZero(dim) && !b.angleKind ? a.angleKind : undefined,
    dataKind: a.dataKind && b.dataKind ? undefined : (a.dataKind ?? b.dataKind),
  };
}

export function vPow(base: CalcValue, exp: CalcValue): CalcValue {
  requireDimensionless(exp, 'Exponent');
  if (base.logKind) throw new CalcError(`Cannot raise ${describeUnit(base)} to a power; convert to linear units first`);
  const expReal = !isComplex(exp);
  if (!dimIsZero(base.dim) && !expReal) throw new CalcError('Complex exponent requires a dimensionless base');
  const newDim = expReal ? dimScale(base.dim, exp.re) : DIM_ZERO;

  let re: number, im: number;
  if (!isComplex(base) && expReal && (base.re >= 0 || Number.isInteger(exp.re))) {
    if (base.re === 0 && exp.re < 0) throw new CalcError('Division by zero (0 raised to negative power)');
    re = Math.pow(base.re, exp.re);
    im = 0;
  } else {
    const r = cabs(base.re, base.im);
    if (r === 0) {
      if (exp.re > 0) return { re: 0, im: 0, dim: newDim };
      if (exp.re === 0 && exp.im === 0) return { re: 1, im: 0, dim: DIM_ZERO };
      throw new CalcError('Division by zero (0 raised to negative power)');
    }
    const lnR = Math.log(r), th = carg(base.re, base.im);
    const mag = Math.exp(lnR * exp.re - th * exp.im);
    const phase = lnR * exp.im + th * exp.re;
    re = snapZero(mag * Math.cos(phase), mag);
    im = snapZero(mag * Math.sin(phase), mag);
  }

  let unitHint: UnitSpec | undefined;
  if (expReal && base.unitHint && (exp.re === 2 || exp.re === 3) && (dimEqual(newDim, DIM_AREA) || dimEqual(newDim, DIM_VOLUME))) {
    unitHint = parseUnitExpr(`${base.unitHint.symbol}^${exp.re}`) ?? undefined;
  }
  return { re, im, dim: newDim, unitHint };
}

// ---------------------------------------------------------------------------
// Unit Conversions
// ---------------------------------------------------------------------------

function resolveUnit(target: UnitSpec | string): UnitSpec {
  if (typeof target !== 'string') return target;
  const parsed = parseUnitExpr(target);
  if (!parsed) throw new CalcError(`Unknown unit: "${target}"`);
  return parsed;
}

function convertLogDomain(
  val: CalcValue, unit: UnitSpec, linDim: Dim, factor: 10 | 20,
  k1: LogKind, off1: number, k2: LogKind, off2: number, linLabel: string,
): CalcValue | null {
  const isTarget = unit.logKind === k1 || unit.logKind === k2;
  const isSrc = val.logKind === k1 || val.logKind === k2;
  if (!isTarget && !isSrc) return null;
  const tOff = unit.logKind === k1 ? off1 : off2;
  const sOff = val.logKind === k1 ? off1 : off2;
  if (isTarget) {
    if (isSrc) {
      return { re: val.re - sOff + tOff, im: 0, dim: DIM_ZERO, logKind: unit.logKind, unitHint: unit, unitForced: true };
    }
    if (dimEqual(val.dim, linDim)) {
      const lin = requireReal(val, `Conversion to ${unit.symbol}`);
      if (lin <= 0) throw new CalcError(`Cannot convert non-positive ${linLabel} (${lin}) to ${unit.symbol}`);
      return { re: factor * Math.log10(lin) + tOff, im: 0, dim: DIM_ZERO, logKind: unit.logKind, unitHint: unit, unitForced: true };
    }
    throw new CalcError(`Cannot convert ${describeUnit(val)} to ${unit.symbol} (requires ${linLabel})`);
  }
  if (dimEqual(unit.dim, linDim)) {
    return { re: Math.pow(10, (val.re - sOff) / factor), im: 0, dim: linDim, unitHint: unit, unitForced: true };
  }
  throw new CalcError(`Cannot convert ${describeUnit(val)} to ${unit.symbol} (requires ${linLabel} unit)`);
}

/** Convert a CalcValue to a target unit (SI scaling, affine °C/°F/K, dBm/dBW/dBV/dBµV ↔ linear, rad/deg, data). */
export function vConvert(val: CalcValue, target: UnitSpec | string): CalcValue {
  const unit = resolveUnit(target);
  const pwr = convertLogDomain(val, unit, DIM_POWER, 10, 'dBm', 30, 'dBW', 0, 'power');
  if (pwr) return pwr;
  const volt = convertLogDomain(val, unit, DIM_VOLTAGE, 20, 'dBuV', 120, 'dBV', 0, 'voltage');
  if (volt) return volt;

  const DB_PER_NP = 20 / Math.LN10;
  if (val.logKind === 'dB' && unit.symbol === 'Np') {
    return { re: val.re / DB_PER_NP, im: 0, dim: DIM_ZERO, unitHint: unit, unitForced: true };
  }
  if (val.unitHint?.symbol === 'Np' && unit.logKind === 'dB') {
    return { re: val.re * DB_PER_NP, im: 0, dim: DIM_ZERO, logKind: 'dB', unitHint: unit, unitForced: true };
  }
  if (val.logKind === 'dB' && unit.logKind === 'dB') return { ...val, unitHint: unit, unitForced: true };
  if (val.logKind || unit.logKind) throw new CalcError(`Cannot convert ${describeUnit(val)} to ${unit.symbol}`);

  if (dimEqual(unit.dim, DIM_TEMP)) {
    if (!dimEqual(val.dim, DIM_TEMP)) {
      throw new CalcError(`Dimension mismatch: cannot convert ${describeUnit(val)} to ${unit.symbol}`);
    }
    requireReal(val, `Temperature conversion to ${unit.symbol}`);
    return { re: val.re, im: 0, dim: DIM_TEMP, tempKind: unit.tempKind, unitHint: unit, unitForced: true };
  }
  if (unit.angleKind) {
    if (!dimIsZero(val.dim) || val.dataKind) {
      throw new CalcError(`Dimension mismatch: cannot convert ${describeUnit(val)} to ${unit.symbol}`);
    }
    return { re: val.re, im: val.im, dim: DIM_ZERO, angleKind: unit.angleKind, unitHint: unit, unitForced: true };
  }
  if (val.dataKind !== unit.dataKind || !dimEqual(val.dim, unit.dim)) {
    throw new CalcError(`Dimension mismatch: cannot convert ${describeUnit(val)} to ${unit.symbol}`);
  }
  return { ...val, unitHint: unit, unitForced: true, tempKind: undefined, angleKind: undefined };
}

/** Extract the numeric (re, im) value of a CalcValue expressed in `target` unit. */
export function valueInUnit(val: CalcValue, target: UnitSpec | string): { re: number; im: number } {
  const unit = resolveUnit(target);
  const c = vConvert(val, unit);
  if (unit.logKind) return { re: c.re, im: 0 };
  if (unit.tempKind === 'C') return { re: c.re - 273.15, im: 0 };
  if (unit.tempKind === 'F') return { re: (c.re - 273.15) * (9 / 5) + 32, im: 0 };
  return { re: c.re / unit.scale, im: c.im / unit.scale };
}

// ---------------------------------------------------------------------------
// Mathematical & Engineering Functions
// ---------------------------------------------------------------------------

export function vSqrt(a: CalcValue): CalcValue {
  if (a.logKind) throw new CalcError('sqrt() requires a linear quantity');
  csqrt(SCRATCH, 0, a.re, a.im);
  return { re: snapZero(SCRATCH[0], SCRATCH[1]), im: snapZero(SCRATCH[1], SCRATCH[0]), dim: dimScale(a.dim, 0.5) };
}

export function vCbrt(a: CalcValue): CalcValue {
  if (a.logKind) throw new CalcError('cbrt() requires a linear quantity');
  return isComplex(a) ? vPow(a, makeScalar(1 / 3)) : { re: Math.cbrt(a.re), im: 0, dim: dimScale(a.dim, 1 / 3) };
}

export const vAbs = (a: CalcValue): CalcValue =>
  a.logKind ? { ...a, re: Math.abs(a.re), im: 0 } : { ...a, re: cabs(a.re, a.im), im: 0 };

export const vArg = (a: CalcValue): CalcValue => ({ re: carg(a.re, a.im), im: 0, dim: DIM_ZERO, angleKind: 'rad' });
export const vAngle = vArg;
export const vRe = (a: CalcValue): CalcValue => ({ ...a, im: 0 });
export const vIm = (a: CalcValue): CalcValue => ({ ...a, re: a.im, im: 0 });
export const vConj = (a: CalcValue): CalcValue => ({ ...a, im: -a.im });

export function vPolar(mag: CalcValue, ang: CalcValue): CalcValue {
  const m = requireReal(mag, 'polar() magnitude');
  requireDimensionless(ang, 'polar() angle');
  const th = requireReal(ang, 'polar() angle');
  return {
    re: snapZero(m * Math.cos(th), Math.abs(m)),
    im: snapZero(m * Math.sin(th), Math.abs(m)),
    dim: mag.dim, unitHint: mag.unitHint, unitForced: mag.unitForced, dataKind: mag.dataKind,
  };
}

export function vExp(a: CalcValue): CalcValue {
  requireDimensionless(a, 'exp()');
  const r = Math.exp(a.re);
  return isComplex(a) ? makeComplex(snapZero(r * Math.cos(a.im), r), snapZero(r * Math.sin(a.im), r)) : makeScalar(r);
}

export function vLn(a: CalcValue): CalcValue {
  requireDimensionless(a, 'ln()');
  if (a.re === 0 && a.im === 0) throw new CalcError('ln(0) is undefined');
  return !isComplex(a) && a.re > 0 ? makeScalar(Math.log(a.re)) : makeComplex(Math.log(cabs(a.re, a.im)), carg(a.re, a.im));
}

export const vLog10 = (a: CalcValue): CalcValue => { const l = vLn(a); return makeComplex(l.re / Math.LN10, l.im / Math.LN10); };
export const vLog2 = (a: CalcValue): CalcValue => { const l = vLn(a); return makeComplex(l.re / Math.LN2, l.im / Math.LN2); };

const trigSnap = (v: number, inAbs: number): number =>
  inAbs > 1e-6 && Math.abs(v) < 1e-15 * Math.max(1, inAbs) ? 0 : v;

export function vSin(a: CalcValue): CalcValue {
  requireDimensionless(a, 'sin()');
  return isComplex(a)
    ? makeComplex(Math.sin(a.re) * Math.cosh(a.im), Math.cos(a.re) * Math.sinh(a.im))
    : makeScalar(trigSnap(Math.sin(a.re), Math.abs(a.re)));
}

export function vCos(a: CalcValue): CalcValue {
  requireDimensionless(a, 'cos()');
  return isComplex(a)
    ? makeComplex(Math.cos(a.re) * Math.cosh(a.im), -Math.sin(a.re) * Math.sinh(a.im))
    : makeScalar(trigSnap(Math.cos(a.re), Math.abs(a.re)));
}

export function vTan(a: CalcValue): CalcValue {
  requireDimensionless(a, 'tan()');
  return isComplex(a) ? vDiv(vSin(a), vCos(a)) : makeScalar(trigSnap(Math.tan(a.re), Math.abs(a.re)));
}

export function vAsin(a: CalcValue): CalcValue {
  requireDimensionless(a, 'asin()');
  if (!isComplex(a) && Math.abs(a.re) <= 1) return { re: Math.asin(a.re), im: 0, dim: DIM_ZERO, angleKind: 'rad' };
  const l = vLn(vAdd(makeComplex(-a.im, a.re), vSqrt(vSub(makeScalar(1), vMul(a, a)))));
  return { re: l.im, im: -l.re, dim: DIM_ZERO, angleKind: 'rad' };
}

export function vAcos(a: CalcValue): CalcValue {
  requireDimensionless(a, 'acos()');
  if (!isComplex(a) && Math.abs(a.re) <= 1) return { re: Math.acos(a.re), im: 0, dim: DIM_ZERO, angleKind: 'rad' };
  const s = vAsin(a);
  return { re: Math.PI / 2 - s.re, im: -s.im, dim: DIM_ZERO, angleKind: 'rad' };
}

export function vAtan(a: CalcValue): CalcValue {
  requireDimensionless(a, 'atan()');
  if (!isComplex(a)) return { re: Math.atan(a.re), im: 0, dim: DIM_ZERO, angleKind: 'rad' };
  const l = vLn(vDiv(makeComplex(1 + a.im, -a.re), makeComplex(1 - a.im, a.re)));
  return { re: -0.5 * l.im, im: 0.5 * l.re, dim: DIM_ZERO, angleKind: 'rad' };
}

export function vAtan2(y: CalcValue, x: CalcValue): CalcValue {
  if (!dimEqual(y.dim, x.dim)) throw new CalcError(`Dimension mismatch in atan2(${describeUnit(y)}, ${describeUnit(x)})`);
  return { re: Math.atan2(requireReal(y, 'atan2()'), requireReal(x, 'atan2()')), im: 0, dim: DIM_ZERO, angleKind: 'rad' };
}

export function vSinh(a: CalcValue): CalcValue {
  requireDimensionless(a, 'sinh()');
  return isComplex(a)
    ? makeComplex(Math.sinh(a.re) * Math.cos(a.im), Math.cosh(a.re) * Math.sin(a.im))
    : makeScalar(Math.sinh(a.re));
}

export function vCosh(a: CalcValue): CalcValue {
  requireDimensionless(a, 'cosh()');
  return isComplex(a)
    ? makeComplex(Math.cosh(a.re) * Math.cos(a.im), Math.sinh(a.re) * Math.sin(a.im))
    : makeScalar(Math.cosh(a.re));
}

export function vTanh(a: CalcValue): CalcValue {
  requireDimensionless(a, 'tanh()');
  return isComplex(a) ? vDiv(vSinh(a), vCosh(a)) : makeScalar(Math.tanh(a.re));
}

export function vAsinh(a: CalcValue): CalcValue {
  requireDimensionless(a, 'asinh()');
  return isComplex(a) ? vLn(vAdd(a, vSqrt(vAdd(vMul(a, a), makeScalar(1))))) : makeScalar(Math.asinh(a.re));
}

export function vAcosh(a: CalcValue): CalcValue {
  requireDimensionless(a, 'acosh()');
  return !isComplex(a) && a.re >= 1
    ? makeScalar(Math.acosh(a.re))
    : vLn(vAdd(a, vMul(vSqrt(vAdd(a, makeScalar(1))), vSqrt(vSub(a, makeScalar(1))))));
}

export function vAtanh(a: CalcValue): CalcValue {
  requireDimensionless(a, 'atanh()');
  if (!isComplex(a) && Math.abs(a.re) < 1) return makeScalar(Math.atanh(a.re));
  const l = vLn(vDiv(vAdd(makeScalar(1), a), vSub(makeScalar(1), a)));
  return makeComplex(0.5 * l.re, 0.5 * l.im);
}

export const vFloor = (a: CalcValue): CalcValue => ({ ...a, re: Math.floor(requireReal(a, 'floor()')), im: 0 });
export const vCeil = (a: CalcValue): CalcValue => ({ ...a, re: Math.ceil(requireReal(a, 'ceil()')), im: 0 });
export const vRound = (a: CalcValue): CalcValue => ({ ...a, re: Math.round(requireReal(a, 'round()')), im: 0 });

function extrema(op: 'min' | 'max', args: CalcValue[]): CalcValue {
  if (args.length === 0) throw new CalcError(`${op}() requires at least one argument`);
  let best = args[0], bestVal = requireReal(best, `${op}()`);
  for (let i = 1; i < args.length; i++) {
    const cur = args[i];
    if (!dimEqual(best.dim, cur.dim) || best.logKind !== cur.logKind) {
      throw new CalcError(`Dimension mismatch in ${op}(): ${describeUnit(best)} vs ${describeUnit(cur)}`);
    }
    const v = requireReal(cur, `${op}()`);
    if (op === 'min' ? v < bestVal : v > bestVal) { best = cur; bestVal = v; }
  }
  return best;
}

export const vMin = (...args: CalcValue[]): CalcValue => extrema('min', args);
export const vMax = (...args: CalcValue[]): CalcValue => extrema('max', args);

export function vDb(a: CalcValue): CalcValue {
  requireDimensionless(a, 'db()');
  const m = cabs(a.re, a.im);
  if (m <= 0) throw new CalcError('db() requires a non-zero ratio');
  return { re: 20 * Math.log10(m), im: 0, dim: DIM_ZERO, logKind: 'dB' };
}
export const vDb20 = vDb;

export function vDb10(a: CalcValue): CalcValue {
  requireDimensionless(a, 'db10()');
  const m = cabs(a.re, a.im);
  if (m <= 0) throw new CalcError('db10() requires a non-zero ratio');
  return { re: 10 * Math.log10(m), im: 0, dim: DIM_ZERO, logKind: 'dB' };
}

export const vDbm = (power: CalcValue): CalcValue => vConvert(power, 'dBm');

export function vFromDbm(val: CalcValue): CalcValue {
  if (val.logKind === 'dBm' || val.logKind === 'dBW') return vConvert(val, 'W');
  requireDimensionless(val, 'fromDbm()');
  return { re: Math.pow(10, (requireReal(val, 'fromDbm()') - 30) / 10), im: 0, dim: DIM_POWER };
}

export function vParallel(...args: CalcValue[]): CalcValue {
  if (args.length < 2) throw new CalcError('parallel() requires at least 2 arguments');
  const first = args[0];
  let sumRe = 0, sumIm = 0;
  for (const arg of args) {
    if (!dimEqual(first.dim, arg.dim) || arg.logKind) {
      throw new CalcError(`Dimension mismatch in parallel(): ${describeUnit(first)} vs ${describeUnit(arg)}`);
    }
    if (arg.re === 0 && arg.im === 0) return { re: 0, im: 0, dim: first.dim };
    cdiv(SCRATCH, 0, 1, 0, arg.re, arg.im);
    sumRe += SCRATCH[0];
    sumIm += SCRATCH[1];
  }
  if (sumRe === 0 && sumIm === 0) throw new CalcError('Parallel combination is infinite (resonant open)');
  cdiv(SCRATCH, 0, 1, 0, sumRe, sumIm);
  return { re: snapZero(SCRATCH[0], SCRATCH[1]), im: snapZero(SCRATCH[1], SCRATCH[0]), dim: first.dim };
}

// ---------------------------------------------------------------------------
// Formatting & Companion Hints
// ---------------------------------------------------------------------------

function toDisplayParts(val: CalcValue) {
  const c = chooseSmartUnit(Math.max(Math.abs(val.re), Math.abs(val.im)), val.dim, {
    unitHint: val.unitHint, unitForced: val.unitForced,
    angleKind: val.angleKind, logKind: val.logKind, tempKind: val.tempKind, dataKind: val.dataKind,
  });
  if (c.tempKind === 'C') return { re: val.re - 273.15, im: 0, symbol: c.symbol, latex: c.latex };
  if (c.tempKind === 'F') return { re: (val.re - 273.15) * (9 / 5) + 32, im: 0, symbol: c.symbol, latex: c.latex };
  return { re: val.re / c.scale, im: val.im / c.scale, symbol: c.symbol, latex: c.latex };
}

const attachText = (num: string, sym: string): string =>
  !sym ? num : (sym === '°' || sym === '%') ? `${num}${sym}` : `${num} ${sym}`;

const attachLatex = (num: string, tex: string, wrap: boolean): string =>
  !tex ? num : (tex === '^\\circ' || tex === '\\%') ? `${num}${tex}` : wrap ? `\\left(${num}\\right)\\,${tex}` : `${num}\\,${tex}`;

export function formatValueText(val: CalcValue, opts: FormatOptions = {}): string {
  const d = opts.digits ?? 6;
  const { re, im, symbol } = toDisplayParts(val);
  const hasIm = im !== 0 && Math.abs(im) > ZERO_EPS * Math.abs(re);
  const hasRe = re !== 0 && Math.abs(re) > ZERO_EPS * Math.abs(im);
  if (!hasIm) return attachText(formatRealNumber(re, d), symbol);
  if (!hasRe) {
    const sign = im < 0 ? '−' : '', a = Math.abs(im);
    return attachText(a === 1 && !symbol ? `${sign}j` : `${sign}j ${formatRealNumber(a, d)}`, symbol);
  }
  return attachText(`${formatRealNumber(re, d)}${im < 0 ? ' − j ' : ' + j '}${formatRealNumber(Math.abs(im), d)}`, symbol);
}

export function formatValueLatex(val: CalcValue, opts: FormatOptions = {}): string {
  const d = opts.digits ?? 6;
  const { re, im, latex } = toDisplayParts(val);
  const hasIm = im !== 0 && Math.abs(im) > ZERO_EPS * Math.abs(re);
  const hasRe = re !== 0 && Math.abs(re) > ZERO_EPS * Math.abs(im);
  if (!hasIm) return attachLatex(formatRealLatex(re, d), latex, false);
  if (!hasRe) {
    const sign = im < 0 ? '-' : '', a = Math.abs(im);
    return attachLatex(a === 1 && !latex ? `${sign}j` : `${sign}j\\,${formatRealLatex(a, d)}`, latex, false);
  }
  return attachLatex(`${formatRealLatex(re, d)}${im < 0 ? ' - j\\,' : ' + j\\,'}${formatRealLatex(Math.abs(im), d)}`, latex, Boolean(latex));
}

export function formatBaseSI(val: CalcValue, digits = 6): string {
  if (val.logKind) return formatValueText(val, { digits });
  const sym = val.dataKind && dimIsZero(val.dim) ? 'bit' : formatDimBaseSI(val.dim).symbol;
  if (!isComplex(val)) return attachText(formatRealNumber(val.re, digits), sym);
  const hasRe = val.re !== 0 && Math.abs(val.re) > ZERO_EPS * Math.abs(val.im);
  if (!hasRe) return attachText(`${val.im < 0 ? '−' : ''}j ${formatRealNumber(Math.abs(val.im), digits)}`, sym);
  return attachText(`${formatRealNumber(val.re, digits)}${val.im < 0 ? ' − j ' : ' + j '}${formatRealNumber(Math.abs(val.im), digits)}`, sym);
}

export function formatPolar(val: CalcValue, opts: FormatOptions = {}): string {
  const d = opts.digits ?? 6, u = opts.angleUnit ?? 'deg';
  const mag = formatValueText({ ...val, re: cabs(val.re, val.im), im: 0 }, { digits: d });
  const rad = carg(val.re, val.im);
  const ang = u === 'deg' ? `${formatRealNumber(rad * (180 / Math.PI), d)}°` : `${formatRealNumber(rad, d)} rad`;
  return `${mag} ∠ ${ang}`;
}

export function formatPolarLatex(val: CalcValue, opts: FormatOptions = {}): string {
  const d = opts.digits ?? 6, u = opts.angleUnit ?? 'deg';
  const mag = formatValueLatex({ ...val, re: cabs(val.re, val.im), im: 0 }, { digits: d });
  const rad = carg(val.re, val.im);
  const ang = u === 'deg' ? `${formatRealLatex(rad * (180 / Math.PI), d)}^\\circ` : `${formatRealLatex(rad, d)}\\,\\text{rad}`;
  return `${mag} \\angle ${ang}`;
}

export function getCompanionHints(val: CalcValue, opts: FormatOptions = {}): CompanionHint[] {
  const hints: CompanionHint[] = [];
  const d = opts.digits ?? 6;
  const push = (label: string, v: CalcValue) =>
    hints.push({ label, text: formatValueText(v, { digits: d }), latex: formatValueLatex(v, { digits: d }), value: v });

  const complex = isComplex(val);
  if (complex) hints.push({ label: 'Polar', text: formatPolar(val, { digits: d }), latex: formatPolarLatex(val, { digits: d }), value: val });

  if (val.logKind === 'dBm' || val.logKind === 'dBW') {
    const lin = vConvert(val, 'W');
    push('Linear power', { ...lin, unitForced: false, unitHint: undefined });
    return hints;
  }
  if (val.logKind === 'dBV' || val.logKind === 'dBuV') {
    const lin = vConvert(val, 'V');
    push('Linear voltage', { ...lin, unitForced: false, unitHint: undefined });
    return hints;
  }
  if (val.angleKind === 'rad') push('Degrees', vConvert(val, 'deg'));
  else if (val.angleKind === 'deg') push('Radians', vConvert(val, 'rad'));

  if (!complex && val.re > 0 && !val.dataKind) {
    if (dimEqual(val.dim, DIM_FREQ)) {
      push('Period (T)', makeScalar(1 / val.re, DIM_TIME));
      push('Angular freq (ω)', vConvert(makeScalar(2 * Math.PI * val.re, DIM_FREQ), 'rad/s'));
    } else if (dimEqual(val.dim, DIM_TIME)) {
      push('Frequency (f)', makeScalar(1 / val.re, DIM_FREQ));
    } else if (dimEqual(val.dim, DIM_POWER)) {
      push('Power level', vConvert(val, 'dBm'));
    } else if (dimEqual(val.dim, DIM_VOLTAGE)) {
      push('Voltage level', vConvert(val, 'dBV'));
    }
  }
  if (dimEqual(val.dim, DIM_TEMP) && !complex) {
    if (val.tempKind !== 'C') push('Celsius', vConvert(val, 'degC'));
    if (val.tempKind !== 'F') push('Fahrenheit', vConvert(val, 'degF'));
    if (val.tempKind) push('Kelvin', vConvert(val, 'K'));
  }
  if (cabs(val.re, val.im) > 0) {
    if (dimEqual(val.dim, DIM_RESISTANCE)) push(complex ? 'Admittance (Y)' : 'Conductance (G)', vDiv(makeScalar(1), val));
    else if (dimEqual(val.dim, DIM_CONDUCTANCE)) push(complex ? 'Impedance (Z)' : 'Resistance (R)', vDiv(makeScalar(1), val));
  }
  return hints;
}
