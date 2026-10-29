// The calculator boxes: F_S = N_pts / N_cyc · f_0 solved for any one of the four parameters,
// plus the values that follow from them.

import { groupDigits, parseQuantity } from './numbers';
import type { DigitGrouping } from './numbers';
import { bitLength, isPowerOfTwo } from './powers';
import { gcd, isPrime } from './primes';

export type Param = 'f0' | 'fs' | 'ncyc' | 'npts';
export type InputKey = Param | 'tstart';

export const PARAMS: Param[] = ['f0', 'fs', 'ncyc', 'npts'];

export const UNITS: Record<InputKey, string> = { f0: 'Hz', fs: 'Hz', ncyc: '', npts: '', tstart: 's' };

export interface BoxState {
  id: number;
  solveFor: Param;
  // What the user typed. The text of the parameter being calculated is kept but not used.
  text: Record<InputKey, string>;
}

export function defaultBox(id: number): BoxState {
  return { id, solveFor: 'fs', text: { f0: '1000', fs: '', ncyc: '7', npts: '16384', tstart: '0' } };
}

export interface BoxResult {
  // The four parameters, typed or calculated. Missing when they cannot be worked out.
  values: Partial<Record<Param, number>>;
  errors: Partial<Record<InputKey, string>>;
  T0: number | null;
  Ts: number | null;
  fres: number | null;
  npts0: number | null;
  tstop: number | null;
  fmin: number | null;
  fmax: number | null;
}

function solve(solveFor: Param, { f0, fs, ncyc, npts }: Record<Param, number>): number {
  switch (solveFor) {
    case 'f0': return (ncyc * fs) / npts;
    case 'fs': return (npts * f0) / ncyc;
    case 'ncyc': return (npts * f0) / fs;
    case 'npts': return (ncyc * fs) / f0;
  }
}

function finiteOrNull(value: number): number | null {
  return Number.isFinite(value) ? value : null;
}

export function calculate(box: BoxState): BoxResult {
  const values: Partial<Record<Param, number>> = {};
  const errors: Partial<Record<InputKey, string>> = {};

  for (const p of PARAMS) {
    if (p === box.solveFor) continue;
    const parsed = parseQuantity(box.text[p], UNITS[p]);
    if (parsed.ok === false) errors[p] = parsed.error;
    else if (parsed.value <= 0) errors[p] = 'Must be greater than 0';
    else values[p] = parsed.value;
  }

  if (PARAMS.every((p) => p === box.solveFor || values[p] !== undefined)) {
    const solved = solve(box.solveFor, values as Record<Param, number>);
    if (Number.isFinite(solved) && solved > 0) values[box.solveFor] = solved;
  }

  let tstart: number | undefined;
  const parsedStart = parseQuantity(box.text.tstart, UNITS.tstart);
  if (parsedStart.ok === false) errors.tstart = parsedStart.error;
  else if (parsedStart.value < 0) errors.tstart = 'Must be 0 or more';
  else tstart = parsedStart.value;

  const { f0, fs, ncyc, npts } = values;
  // Length of the sampling window, N_cyc periods of f0.
  const duration = f0 !== undefined && ncyc !== undefined ? ncyc / f0 : undefined;

  return {
    values,
    errors,
    T0: f0 !== undefined ? finiteOrNull(1 / f0) : null,
    Ts: fs !== undefined ? finiteOrNull(1 / fs) : null,
    fres: fs !== undefined && npts !== undefined ? finiteOrNull(fs / npts) : null,
    npts0: npts !== undefined && ncyc !== undefined ? finiteOrNull(npts / ncyc) : null,
    tstop: duration !== undefined && tstart !== undefined ? finiteOrNull(tstart + duration) : null,
    // 1 / (t_stop - t_start), worked out from the window length so a large t_start does not cost precision.
    fmin: duration !== undefined ? finiteOrNull(1 / duration) : null,
    fmax: fs !== undefined ? finiteOrNull(fs / 2) : null,
  };
}

/**
 * Makes another parameter the calculated one. The value that was calculated becomes an input with
 * all its digits, since rounding it could turn N_cyc = 7 into 6.9999999999. It is written with the
 * chosen digit grouping, which parseQuantity reads back.
 */
export function switchSolveFor(box: BoxState, solveFor: Param, grouping: DigitGrouping = 'none'): BoxState {
  if (solveFor === box.solveFor) return box;
  const calculated = calculate(box).values[box.solveFor];
  const text = { ...box.text };
  if (calculated !== undefined) text[box.solveFor] = groupDigits(String(calculated), grouping);
  return { ...box, solveFor, text };
}

export type Check =
  | { kind: 'tooLarge' | 'notInteger' | 'prime' | 'odd' | 'even' | 'coprime' | 'notPowerOfTwo' }
  | { kind: 'commonFactor'; factor: bigint }
  | { kind: 'powerOfTwo'; exponent: number };

export type Tone = 'good' | 'ok' | 'bad' | 'info';

export const CHECK_TONES: Record<Check['kind'], Tone> = {
  tooLarge: 'info',
  notInteger: 'bad',
  prime: 'good',
  odd: 'ok',
  even: 'bad',
  coprime: 'good',
  commonFactor: 'bad',
  powerOfTwo: 'good',
  notPowerOfTwo: 'bad',
};

// Calculated counts such as 7.000000000000001 come from rounding in floating point and count as whole numbers.
function wholeNumber(value: number): bigint | null {
  const rounded = Math.round(value);
  return Math.abs(value - rounded) <= 1e-12 * Math.abs(value) ? BigInt(rounded) : null;
}

/** Checks N_cyc against RULE 1: an integer, preferably prime or at least odd, with no common factor with N_pts. */
export function checkNcyc(ncyc: number | undefined, npts: number | undefined): Check[] {
  if (ncyc === undefined) return [];
  if (ncyc > Number.MAX_SAFE_INTEGER) return [{ kind: 'tooLarge' }];
  const n = wholeNumber(ncyc);
  if (n === null) return [{ kind: 'notInteger' }];

  const checks: Check[] = [{ kind: isPrime(n) ? 'prime' : n % 2n === 1n ? 'odd' : 'even' }];
  const m = npts !== undefined && npts <= Number.MAX_SAFE_INTEGER ? wholeNumber(npts) : null;
  if (m !== null) {
    const factor = gcd(n, m);
    checks.push(factor === 1n ? { kind: 'coprime' } : { kind: 'commonFactor', factor });
  }
  return checks;
}

/** Checks N_pts against RULE 2: a power of 2. */
export function checkNpts(npts: number | undefined): Check[] {
  if (npts === undefined) return [];
  if (npts > Number.MAX_SAFE_INTEGER) return [{ kind: 'tooLarge' }];
  const n = wholeNumber(npts);
  if (n === null) return [{ kind: 'notInteger' }];
  return [isPowerOfTwo(n) ? { kind: 'powerOfTwo', exponent: bitLength(n) - 1 } : { kind: 'notPowerOfTwo' }];
}
