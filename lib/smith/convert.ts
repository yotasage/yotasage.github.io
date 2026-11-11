// z, y and Γ of a point, both ways, normalised and in ohms and siemens, and the figures of a point: |Γ|, ∠Γ, VSWR,
// return loss, mismatch loss, node Q. Conventions of docs/smith-chart/engine.md §1 and facts.md eqs. 1–3, 13–17:
// z = Z/Z0, y = Y·Z0 = 1/z, Γ = (z − 1)/(z + 1) = (1 − y)/(1 + y), Γi up. Z0 is real and positive.
//
// Like complex.ts, conversions write (re, im) into out[o], out[o + 1] and allocate nothing. They never return NaN for
// inputs that are not NaN: an open (z = ∞, Γ = 1) is (Infinity, 0), a short (y = ∞, Γ = −1) has y = (Infinity, 0),
// any infinite input is that point at infinity, and Γ = ∞ (z = −1, not a passive load) is (Infinity, 0).
// Precision: the quotients are formed so that 1 − Γ and 1 + Γ are exact near Γ = ±1 (Sterbenz), so a round trip
// Γ → z → Γ keeps Γ to a few ulp even at |Γ| = 1 − 1e-15, and y is taken from Γ directly, not as 1/z.

import { cabs, cdiv, cinv } from './complex';
import type { Vec } from './complex';

// Beyond this |a|, a − 1 and a + 1 are a and the quotient is formed as 1 − 2/(a + 1) instead (no Inf/Inf).
const BIG = 1e150;

function setInfinite(out: Vec, o: number): void {
  out[o] = Infinity;
  out[o + 1] = 0;
}

// out = (a − 1)/(a + 1); a = ∞ gives 1, a = −1 gives ∞. The map from z to Γ (and, negated, from y to Γ).
function towardsGamma(out: Vec, o: number, re: number, im: number): void {
  if (re !== re || im !== im) { out[o] = NaN; out[o + 1] = NaN; return; }
  const size = Math.abs(re) + Math.abs(im);
  if (size === Infinity) { out[o] = 1; out[o + 1] = 0; return; }
  if (re === -1 && im === 0) { setInfinite(out, o); return; }
  if (size < BIG) cdiv(out, o, re - 1, im, re + 1, im);
  else {
    cdiv(out, o, 2, 0, re + 1, im);
    out[o] = 1 - out[o];
    out[o + 1] = -out[o + 1];
  }
  if (Math.abs(out[o]) === Infinity || Math.abs(out[o + 1]) === Infinity) setInfinite(out, o);
}

// out = (1 + g)/(1 − g); g = 1 gives ∞, g = ∞ gives −1. The map from Γ to z (and, from −Γ, to y).
function fromGamma(out: Vec, o: number, gr: number, gi: number): void {
  if (gr !== gr || gi !== gi) { out[o] = NaN; out[o + 1] = NaN; return; }
  const size = Math.abs(gr) + Math.abs(gi);
  if (size === Infinity) { out[o] = -1; out[o + 1] = 0; return; }
  if (gr === 1 && gi === 0) { setInfinite(out, o); return; }
  if (size < BIG) cdiv(out, o, 1 + gr, gi, 1 - gr, -gi);
  else {
    cdiv(out, o, 2, 0, 1 - gr, -gi);
    out[o] -= 1;
  }
  if (Math.abs(out[o]) === Infinity || Math.abs(out[o + 1]) === Infinity) setInfinite(out, o);
}

// Γ of a normalised impedance z = r + jx.
export function gammaFromZ(out: Vec, o: number, r: number, x: number): void {
  towardsGamma(out, o, r, x);
}

// Normalised impedance z of Γ.
export function zFromGamma(out: Vec, o: number, gr: number, gi: number): void {
  fromGamma(out, o, gr, gi);
}

// Γ of a normalised admittance y = g + jb: Γ = (1 − y)/(1 + y) = −(y − 1)/(y + 1).
export function gammaFromY(out: Vec, o: number, g: number, b: number): void {
  towardsGamma(out, o, g, b);
  if (out[o] !== Infinity) {
    out[o] = -out[o];
    out[o + 1] = -out[o + 1];
  }
}

// Normalised admittance y of Γ: y is the z of −Γ.
export function yFromGamma(out: Vec, o: number, gr: number, gi: number): void {
  fromGamma(out, o, -gr, -gi);
}

// y = 1/z or z = 1/y: 0 ↔ (Infinity, 0).
export function invert(out: Vec, o: number, re: number, im: number): void {
  if (re !== re || im !== im) { out[o] = NaN; out[o + 1] = NaN; return; }
  cinv(out, o, re, im);
}

// Γ of an impedance R + jX in ohms on a reference Z0.
export function gammaFromImpedance(out: Vec, o: number, R: number, X: number, z0: number): void {
  towardsGamma(out, o, R / z0, X / z0);
}

// Impedance in ohms of Γ on a reference Z0.
export function impedanceFromGamma(out: Vec, o: number, gr: number, gi: number, z0: number): void {
  fromGamma(out, o, gr, gi);
  out[o] *= z0;
  out[o + 1] *= z0;
}

// Γ of an admittance G + jB in siemens on a reference Z0.
export function gammaFromAdmittance(out: Vec, o: number, G: number, B: number, z0: number): void {
  gammaFromY(out, o, G * z0, B * z0);
}

// Admittance in siemens of Γ on a reference Z0.
export function admittanceFromGamma(out: Vec, o: number, gr: number, gi: number, z0: number): void {
  fromGamma(out, o, -gr, -gi);
  out[o] /= z0;
  out[o + 1] /= z0;
}

// Interleaved arrays of n points (a sweep trace): gamma[k] = Γ(z[k]). `gamma` may be `z`.
export function gammaFromZN(gamma: Vec, z: Vec, n: number): void {
  for (let k = 0, i = 0; k < n; k++, i += 2) towardsGamma(gamma, i, z[i], z[i + 1]);
}

// Interleaved arrays of n points: z[k] = z(Γ[k]). `z` may be `gamma`.
export function zFromGammaN(z: Vec, gamma: Vec, n: number): void {
  for (let k = 0, i = 0; k < n; k++, i += 2) fromGamma(z, i, gamma[i], gamma[i + 1]);
}

// |Γ|
export const gammaMag = (gr: number, gi: number): number => cabs(gr, gi);

// ∠Γ in radians, (−π, π]; degrees are for the screen only (toDegrees).
export const gammaAngle = (gr: number, gi: number): number => Math.atan2(gi, gr);

export const toDegrees = (radians: number): number => radians * (180 / Math.PI);
export const toRadians = (degrees: number): number => degrees * (Math.PI / 180);

// VSWR = (1 + |Γ|)/(1 − |Γ|) (facts eq. 13); Infinity from |Γ| = 1 on (a reactive or open or short load).
export const vswr = (mag: number): number => (mag >= 1 ? Infinity : (1 + mag) / (1 - mag));

// |Γ| = (VSWR − 1)/(VSWR + 1); VSWR = ∞ gives 1. For VSWR ≥ 1.
export const magFromVswr = (s: number): number => (s === Infinity ? 1 : (s - 1) / (s + 1));

const DB10 = 10 / Math.LN10;

// Return loss −20 log10 |Γ| in dB (facts eq. 14), positive for a passive load; Infinity at a match.
export const returnLoss = (mag: number): number => -2 * DB10 * Math.log(mag);

// |Γ| of a return loss in dB: 10^(−RL/20).
export const magFromReturnLoss = (rl: number): number => Math.exp(-rl / (2 * DB10));

// Mismatch loss −10 log10(1 − |Γ|²) in dB (facts eq. 16, derived from eq. 15), by log1p so a small |Γ| keeps its
// digits. Infinity from |Γ| = 1 on: nothing reaches the load (|Γ| > 1, an active load, has no loss to state).
export const mismatchLoss = (mag: number): number => (mag >= 1 ? Infinity : -DB10 * Math.log1p(-mag * mag));

// Share of the incident power that is reflected, |Γ|², and that reaches the load, 1 − |Γ|² (facts eq. 15).
export const reflectedPower = (mag: number): number => mag * mag;
export const deliveredPower = (mag: number): number => (1 - mag) * (1 + mag);

// Node Q = |x|/r = |b|/g (facts eq. 17) of a normalised z. 0 on the real axis (x = 0, including the short and the
// open) and at z = ∞; Infinity on the rim (r = 0, x ≠ 0). Negative for r < 0.
export function qFromZ(r: number, x: number): number {
  if (x === 0 || Math.abs(r) === Infinity || Math.abs(x) === Infinity) return 0;
  return r === 0 ? Infinity : Math.abs(x) / r;
}

// Node Q of Γ: from facts eq. 6, |x|/r = 2|Γi|/(1 − |Γ|²), with 1 − |Γ|² formed so that it keeps its digits near the
// rim. Same special values as qFromZ; Γ = ∞ (z = −1) gives 0.
export function qFromGamma(gr: number, gi: number): number {
  if (gi === 0 || Math.abs(gr) === Infinity || Math.abs(gi) === Infinity) return 0;
  const d = (1 - gr) * (1 + gr) - gi * gi;
  // |Γ| beyond 1e154 overflows d: Γ is then all but ∞ (z all but −1, Q all but 0).
  return d === -Infinity ? 0 : (2 * Math.abs(gi)) / d;
}
