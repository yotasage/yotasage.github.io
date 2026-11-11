// The parts of a ladder (docs/smith-chart/engine.md §2): their kinds, what each adds to a node, the value at which a
// part has no effect, the range it can reach, the conversions between a component value and its normalised
// reactance or susceptance, and its ABCD matrix at a frequency (facts.md eqs. 24–26).
//
// Conventions (engine.md §1): e^{jωt}, X_L = ωL, X_C = −1/(ωC), B_C = ωC, B_L = −1/(ωL); normalised to the chart's
// real Z0: z = Z/Z0, y = Y·Z0. A line or stub has its own real Zc and a length in wavelengths at f0 ("turns": the
// electrical length θ = 2π·turns·f/f0 at the frequency f). Frequencies are > 0 and finite, Z0 and Zc > 0 and finite,
// lengths finite and ≥ 0; R, L and C may be 0 or ∞ (network.ts gives those their limits, engine.md §4).
//
// Hot paths use plain numbers: a circuit's parts are packed into a Float64Array of PART_STRIDE numbers per part
// (kind, value, zc) by packParts, and nothing here allocates except packParts itself.

import type { Vec } from './complex';

// Part kinds. Numbers, so a packed circuit is one Float64Array and the evaluation is a switch on small integers.
export const SERIES_R = 0;
export const SERIES_L = 1;
export const SERIES_C = 2;
export const SHUNT_R = 3;
export const SHUNT_L = 4;
export const SHUNT_C = 5;
/** A line in cascade: value = length in wavelengths at f0, zc = its characteristic impedance (Ω). */
export const LINE = 6;
/** A shunt stub, open at its far end: value = length in wavelengths at f0, zc in Ω. */
export const STUB_OPEN = 7;
/** A shunt stub, shorted at its far end: value = length in wavelengths at f0, zc in Ω. */
export const STUB_SHORT = 8;
/** A λ/4 transformer: value = Zt (Ω); its length is a quarter wavelength at f0 (so θ = π/2·f/f0). */
export const QUARTER = 9;
export const PART_KINDS = 10;

export type PartKind = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

/** A part as the editor holds it. value: R (Ω), L (H), C (F), a length in wavelengths at f0, or Zt (Ω). */
export interface Part {
  kind: PartKind;
  value: number;
  /** Characteristic impedance (Ω) of a line or stub; ignored by the other kinds. */
  zc?: number;
}

export const PART_STRIDE = 3;

/** Packs parts as (kind, value, zc) triples, load first. Reuses `into` when it is long enough. */
export function packParts(parts: readonly Part[], into?: Float64Array): Float64Array {
  const n = parts.length * PART_STRIDE;
  const out = into && into.length >= n ? into : new Float64Array(n);
  for (let k = 0, o = 0; k < parts.length; k++, o += PART_STRIDE) {
    const p = parts[k];
    out[o] = p.kind;
    out[o + 1] = p.value;
    out[o + 2] = p.zc ?? 0;
  }
  return out;
}

export const isSeries = (kind: number): boolean => kind <= SERIES_C;
export const isShunt = (kind: number): boolean => (kind >= SHUNT_R && kind <= SHUNT_C) || kind === STUB_OPEN || kind === STUB_SHORT;
export const isLine = (kind: number): boolean => kind === LINE || kind === QUARTER;
export const isStub = (kind: number): boolean => kind === STUB_OPEN || kind === STUB_SHORT;

/** What a part adds, normalised: 'r' or 'x' to z, 'g' or 'b' to y, 'turns' of electrical length, 'zt' = Zt/Z0. */
export type Added = 'r' | 'x' | 'g' | 'b' | 'turns' | 'zt';
export const ADDS: readonly Added[] = ['r', 'x', 'x', 'g', 'b', 'b', 'turns', 'b', 'b', 'zt'];

/**
 * The range of the added quantity a part can reach (both ends included; ±∞ are the limits of 0 and ∞ values): a
 * series L only adds x ≥ 0, a series C only x ≤ 0, a stub any b (the open stub over lengths [0, λ/2) and the short
 * one too), a line any rotation (half a wavelength is a full turn of Γ).
 */
export const REACH_LO: readonly number[] = [0, 0, -Infinity, 0, -Infinity, 0, 0, -Infinity, -Infinity, 0];
export const REACH_HI: readonly number[] = [Infinity, Infinity, 0, Infinity, 0, Infinity, Infinity, Infinity, Infinity, Infinity];

/** A line's or stub's Γ repeats every half wavelength. */
export const LINE_PERIOD = 0.5;

/**
 * The value at which a part has no effect at frequency f, where its arc starts (engine.md §2, D3): R = 0 in series,
 * ∞ in shunt; L = 0 in series, ∞ in shunt; C = ∞ in series, 0 in shunt; a line of length 0; an open stub of length 0
 * and a shorted one of λ/4 at f (b = 0). A λ/4 transformer has no Zt without effect on every load: its arc is that of
 * a line of Zt from length 0, so it gives NaN here.
 */
export function noEffect(kind: number, f: number, f0: number): number {
  switch (kind) {
    case SERIES_R: case SERIES_L: case SHUNT_C: case LINE: case STUB_OPEN: return 0;
    case SERIES_C: case SHUNT_R: case SHUNT_L: return Infinity;
    case STUB_SHORT: return 0.25 * (f0 / f);
    default: return NaN;
  }
}

/** Speed of light in vacuum (m/s), for physical lengths. */
export const C0 = 299792458;

/** A length in wavelengths at f0 from metres, on a line of effective permittivity eEff (v_p = c/√eEff). */
export const turnsFromMetres = (metres: number, f0: number, eEff = 1, c = C0): number => (metres * f0 * Math.sqrt(eEff)) / c;
/** Metres from a length in wavelengths at f0. */
export const metresFromTurns = (turns: number, f0: number, eEff = 1, c = C0): number => (turns * c) / (f0 * Math.sqrt(eEff));

// sin and cos of 2π·t, with the turn reduced exactly: lengths of exact quarter and half wavelengths give exact 0 and
// ±1 (a λ/4 short stub is an exact open, a λ/2 line an exact identity, Γ repeats every λ/2 to the last bit).
// Written into SIN and COS so the hot loop allocates nothing.
export let SIN = 0;
export let COS = 1;
const HALF_PI = Math.PI / 2;

export function sincosTurns(t: number): void {
  const q4 = 4 * t; // quarter turns; exact
  const q = Math.round(q4);
  const a = (q4 - q) * HALF_PI; // q4 − q is exact, |a| ≤ π/4
  const s = Math.sin(a);
  const c = Math.cos(a);
  switch (q - 4 * Math.floor(q / 4)) {
    case 0: SIN = s; COS = c; break;
    case 1: SIN = c; COS = -s; break;
    case 2: SIN = -s; COS = -c; break;
    default: SIN = -c; COS = s; break;
  }
}

/** The electrical length of a part in turns at f (θ = 2π·turns), 0 for lumped parts. */
export function turnsAt(kind: number, value: number, f: number, f0: number): number {
  if (kind === QUARTER) return 0.25 * (f / f0);
  if (kind === LINE || kind === STUB_OPEN || kind === STUB_SHORT) return value * (f / f0);
  return 0;
}

/**
 * The normalised quantity a part adds at f (facts.md eqs. 22, 24): r, x, g or b; for a line its electrical length
 * in turns at f; for a λ/4 transformer Zt/Z0. Values 0 and ∞ give their limits (±∞ or 0).
 */
export function added(kind: number, value: number, zc: number, f: number, f0: number, z0: number): number {
  const w = 2 * Math.PI * f;
  switch (kind) {
    case SERIES_R: return value / z0;
    case SERIES_L: return (w * value) / z0;
    case SERIES_C: return -1 / (w * value * z0);
    case SHUNT_R: return z0 / value;
    case SHUNT_L: return -z0 / (w * value);
    case SHUNT_C: return w * value * z0;
    case LINE: return value * (f / f0);
    case STUB_OPEN: sincosTurns(value * (f / f0)); return (z0 * SIN) / (zc * COS);
    case STUB_SHORT: sincosTurns(value * (f / f0)); return -(z0 * COS) / (zc * SIN);
    case QUARTER: return value / z0;
    default: return NaN;
  }
}

/**
 * The value that adds `a` at f: the inverse of `added`. A stub gets its shortest length ≥ 0 at f, given in
 * wavelengths at f0 (open: θ in [0, π), short: θ in (0, π]); a line the length of `a` turns at f.
 */
export function valueFor(kind: number, a: number, zc: number, f: number, f0: number, z0: number): number {
  const w = 2 * Math.PI * f;
  switch (kind) {
    case SERIES_R: return a * z0;
    case SERIES_L: return (a * z0) / w;
    case SERIES_C: return -1 / (w * a * z0);
    case SHUNT_R: return z0 / a;
    case SHUNT_L: return -z0 / (w * a);
    case SHUNT_C: return a / (w * z0);
    case LINE: return a * (f0 / f);
    case STUB_OPEN: {
      let theta = Math.atan((a * zc) / z0);
      if (theta < 0) theta += Math.PI;
      return (theta / (2 * Math.PI)) * (f0 / f);
    }
    case STUB_SHORT: return (Math.atan2(1, -(a * zc) / z0) / (2 * Math.PI)) * (f0 / f);
    case QUARTER: return a * z0;
    default: return NaN;
  }
}

/**
 * The normalised ABCD matrix [[A, B/Z0], [C·Z0, D]] of a part at f, as 8 numbers (A re, A im, B, C, D) into m[o…].
 * The matrix is written up to a non-zero factor chosen so that every entry stays finite, which leaves Γ unchanged:
 * a series z with |z| > 1 is written as [[1/z, 1], [0, 1/z]] and a shunt y with |y| > 1 as [[1/y, 0], [1, 1/y]].
 * So a series open (z = ∞) is [[0, 1], [0, 0]] and a shunt short (y = ∞) [[0, 0], [1, 0]], the scaled matrices of
 * engine.md §4. A line is [[cos θ, j(Zc/Z0) sin θ], [j(Z0/Zc) sin θ, cos θ]] (facts.md eq. 26).
 * network.ts applies parts without forming the matrix; this is the reference form for geometry and the harness.
 */
export function partMatrix(m: Vec, o: number, kind: number, value: number, zc: number, f: number, f0: number, z0: number): void {
  for (let k = 0; k < 8; k++) m[o + k] = 0;
  if (kind === LINE || kind === QUARTER) {
    const zn = (kind === QUARTER ? value : zc) / z0;
    sincosTurns(turnsAt(kind, value, f, f0));
    m[o] = COS; m[o + 3] = zn * SIN; m[o + 5] = SIN / zn; m[o + 6] = COS;
    return;
  }
  PART_DIRECT = true; PART_RE = 0; PART_IM = 0;
  lumped(kind, value, zc, f, f0, z0);
  const re = PART_RE, im = PART_IM;
  if (isSeries(kind)) {
    if (PART_DIRECT) { m[o] = 1; m[o + 2] = re; m[o + 3] = im; m[o + 6] = 1; }
    else { m[o] = re; m[o + 1] = im; m[o + 2] = 1; m[o + 6] = re; m[o + 7] = im; }
  } else if (PART_DIRECT) { m[o] = 1; m[o + 4] = re; m[o + 5] = im; m[o + 6] = 1; }
  else { m[o] = re; m[o + 1] = im; m[o + 4] = 1; m[o + 6] = re; m[o + 7] = im; }
}

// The normalised immittance of a lumped part or stub in its bounded form, for network.ts and partMatrix: for a series
// part PART_DIRECT says whether (PART_RE, PART_IM) is z (|z| ≤ 1) or w = 1/z; for a shunt part or stub whether it is
// y (|y| ≤ 1) or u = 1/y. Each form is computed from the value directly, never by inverting the other, so 0 and ∞
// values give exact zeros (w = 0 is the series open, u = 0 the shunt short).
export let PART_DIRECT = true;
export let PART_RE = 0;
export let PART_IM = 0;

export function lumped(kind: number, value: number, zc: number, f: number, f0: number, z0: number): void {
  const w = 2 * Math.PI * f;
  switch (kind) {
    case SERIES_R: // z = R/Z0
    case SHUNT_R: { // y = Z0/R
      PART_IM = 0;
      const series = kind === SERIES_R;
      if ((value <= z0) === series) { PART_DIRECT = true; PART_RE = series ? value / z0 : z0 / value; }
      else { PART_DIRECT = false; PART_RE = series ? z0 / value : value / z0; }
      return;
    }
    case SERIES_L: { // z = jωL/Z0, w = −jZ0/(ωL)
      PART_RE = 0;
      const x = w * value;
      if (x <= z0) { PART_DIRECT = true; PART_IM = x / z0; } else { PART_DIRECT = false; PART_IM = -z0 / x; }
      return;
    }
    case SERIES_C: { // z = −j/(ωCZ0), w = jωCZ0
      PART_RE = 0;
      const a = w * value * z0;
      if (a >= 1) { PART_DIRECT = true; PART_IM = -1 / a; } else { PART_DIRECT = false; PART_IM = a; }
      return;
    }
    case SHUNT_L: { // y = −jZ0/(ωL), u = jωL/Z0
      PART_RE = 0;
      const x = w * value;
      if (x >= z0) { PART_DIRECT = true; PART_IM = -z0 / x; } else { PART_DIRECT = false; PART_IM = x / z0; }
      return;
    }
    case SHUNT_C: { // y = jωCZ0, u = −j/(ωCZ0)
      PART_RE = 0;
      const a = w * value * z0;
      if (a <= 1) { PART_DIRECT = true; PART_IM = a; } else { PART_DIRECT = false; PART_IM = -1 / a; }
      return;
    }
    case STUB_OPEN: { // y = j(Z0/Zc) tan θ, u = −j(Zc/Z0) cot θ
      PART_RE = 0;
      sincosTurns(value * (f / f0));
      const s = SIN * z0, c = COS * zc;
      if (Math.abs(s) <= Math.abs(c)) { PART_DIRECT = true; PART_IM = s / c; } else { PART_DIRECT = false; PART_IM = -c / s; }
      return;
    }
    case STUB_SHORT: { // y = −j(Z0/Zc) cot θ, u = j(Zc/Z0) tan θ
      PART_RE = 0;
      sincosTurns(value * (f / f0));
      const c = COS * z0, s = SIN * zc;
      if (Math.abs(c) <= Math.abs(s)) { PART_DIRECT = true; PART_IM = -c / s; } else { PART_DIRECT = false; PART_IM = s / c; }
      return;
    }
    default:
      PART_DIRECT = true; PART_RE = NaN; PART_IM = NaN;
  }
}
