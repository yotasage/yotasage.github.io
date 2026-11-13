// Checks of lib/smith and lib/quantity. Run with `npm run check` in this folder (tsx reads the TypeScript of the site
// as it is). Prints the failures and one summary line; the exit code is 1 when a check fails.
// Cases C1–C11 are those of docs/smith-chart/facts-cases.md: "ours" to 1e-9, the source to the digits it prints.

import * as importedQuantity from '../../../lib/quantity.ts';
import * as importedComplex from '../../../lib/smith/complex.ts';
import * as importedConvert from '../../../lib/smith/convert.ts';
import { runNetworkChecks } from './check-network.mjs';
import { runGeometryChecks } from './check-geometry.mjs';
import { runEquationChecks } from './check-equations.mjs';
import { runGridChecks } from './check-grid.mjs';
import { runStateChecks } from './check-state.mjs';
import { runSolveChecks } from './check-solve.mjs';
import { runSolveMoreChecks } from './check-solve-b.mjs';
import { runValueChecks } from './check-values.mjs';
import { runValidateChecks } from './check-validate.mjs';
import { runSuggestChecks } from './check-suggest.mjs';
import { runExplainChecks } from './check-explain.mjs';
import { runTeachChecks } from './check-teach.mjs';

const quantity = importedQuantity.default ?? importedQuantity;
const cx = importedComplex.default ?? importedComplex;
const cv = importedConvert.default ?? importedConvert;
const { readAmount, formatAmount } = quantity;
const {
  gammaFromZ, zFromGamma, gammaFromY, yFromGamma, invert, gammaFromImpedance, impedanceFromGamma, gammaFromAdmittance,
  admittanceFromGamma, gammaFromZN, zFromGammaN, gammaMag, gammaAngle, toDegrees, toRadians, vswr, magFromVswr,
  returnLoss, magFromReturnLoss, mismatchLoss, reflectedPower, deliveredPower, qFromZ, qFromGamma,
} = cv;

let passed = 0;
const failures = [];
const groups = new Map();
let group = '';

function section(name) { group = name; groups.set(name, 0); }

function ok(condition, what) {
  groups.set(group, groups.get(group) + 1);
  if (condition) passed++;
  else failures.push(`[${group}] ${what}`);
}

const close = (a, b, tol = 1e-9) => a === b || Math.abs(a - b) <= tol * Math.max(Math.abs(a), Math.abs(b));
function near(actual, expected, what, tol = 1e-9) { ok(close(actual, expected, tol), `${what}: got ${actual}, wanted ${expected}`); }
function eq(actual, expected, what) { ok(actual === expected, `${what}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)}`); }

// As the source prints it: within half a unit of its last printed digit (`units` of them where a case notes a
// rounding of the source's own).
function printed(actual, text, what, units = 0.5) {
  const decimals = (text.split('.')[1] ?? '').length;
  const tol = units * 10 ** -decimals * (1 + 1e-9);
  ok(Math.abs(actual - Number(text)) <= tol, `${what}: ${actual} is not ${text} as printed`);
}

const out = new Float64Array(8);
const pair = (fn, ...args) => { fn(out, 0, ...args); return [out[0], out[1]]; };
const polar = (mag, deg) => [mag * Math.cos(toRadians(deg)), mag * Math.sin(toRadians(deg))];

// A seeded generator, so a failure can be reproduced.
let seed = 0x5eed1;
function random() {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

// ---------------------------------------------------------------------------------------------------------------
section('complex');
{
  const [a, b] = [[3, -4], [-1.5, 2]];
  const r = new Float64Array(2);
  cx.cmul(r, 0, ...a, ...b); near(r[0], 3 * -1.5 - -4 * 2, 'cmul re'); near(r[1], 3 * 2 + -4 * -1.5, 'cmul im');
  cx.cdiv(r, 0, ...a, ...b); const back = new Float64Array(2); cx.cmul(back, 0, r[0], r[1], ...b);
  near(back[0], 3, 'cdiv then cmul re', 1e-15); near(back[1], -4, 'cdiv then cmul im', 1e-15);
  cx.cdiv(r, 0, 1, 0, 0, 0); ok(r[0] === Infinity && r[1] === 0, 'a/0 is (Infinity, 0)');
  cx.cdiv(r, 0, 1e300, 1e300, 1e300, -1e300); near(r[0], 0, 'cdiv without overflow re'); near(r[1], 1, 'cdiv without overflow im');
  cx.cinv(r, 0, 0, 0); ok(r[0] === Infinity && r[1] === 0, '1/0 is (Infinity, 0)');
  cx.cinv(r, 0, Infinity, 0); ok(r[0] === 0 && r[1] === 0, '1/∞ is 0');
  cx.cinv(r, 0, 3, 4); near(r[0], 0.12, 'cinv re'); near(r[1], -0.16, 'cinv im');
  near(cx.cabs(3e200, 4e200), 5e200, 'cabs without overflow'); near(cx.cabs(3e-200, 4e-200), 5e-200, 'cabs without underflow');
  near(cx.carg(-1, 0), Math.PI, 'carg of −1 is π');
  for (const [re, im] of [[4, 0], [-4, 0], [0, 2], [0, -2], [-3, 4], [-3, -4], [1e-300, 0], [5, 12]]) {
    cx.csqrt(r, 0, re, im); cx.cmul(back, 0, r[0], r[1], r[0], r[1]);
    ok(close(back[0], re, 1e-14) && close(back[1], im, 1e-14) && r[0] >= 0, `csqrt(${re}, ${im})² is itself with re ≥ 0`);
  }
  cx.crotate(r, 0, 1, 0, Math.PI / 2); ok(Math.abs(r[0]) < 1e-16 && close(r[1], 1), 'crotate by 90° is counter-clockwise');
  cx.cexpj(r, 0, Math.PI / 3); near(r[0], 0.5, 'cexpj re'); near(r[1], Math.sqrt(3) / 2, 'cexpj im');
  const n = 5, A = new Float64Array(2 * n), B = new Float64Array(2 * n), C = new Float64Array(2 * n), M = new Float64Array(n);
  for (let i = 0; i < 2 * n; i++) { A[i] = random() * 4 - 2; B[i] = random() * 4 - 2; }
  cx.cmulN(C, A, B, n); cx.cdivN(C, C, B, n); cx.cabsN(M, A, n);
  for (let k = 0; k < n; k++) ok(close(C[2 * k], A[2 * k], 1e-14) && close(C[2 * k + 1], A[2 * k + 1], 1e-14) && close(M[k], Math.hypot(A[2 * k], A[2 * k + 1])), `cmulN, cdivN, cabsN at ${k}`);
}

// ---------------------------------------------------------------------------------------------------------------
section('special points');
{
  const same = (got, want, what) => ok(Object.is(got[0] + 0, want[0] + 0) && Object.is(got[1] + 0, want[1] + 0), `${what}: got ${got}, wanted ${want}`);
  same(pair(zFromGamma, 0, 0), [1, 0], 'Γ = 0 is z = 1');
  same(pair(yFromGamma, 0, 0), [1, 0], 'Γ = 0 is y = 1');
  same(pair(zFromGamma, 1, 0), [Infinity, 0], 'Γ = 1 is the open, z = ∞');
  same(pair(yFromGamma, 1, 0), [0, 0], 'Γ = 1 is y = 0');
  same(pair(zFromGamma, -1, 0), [0, 0], 'Γ = −1 is the short, z = 0');
  same(pair(yFromGamma, -1, 0), [Infinity, 0], 'Γ = −1 is y = ∞');
  same(pair(zFromGamma, 0, 1), [0, 1], 'Γ = j is z = j');
  same(pair(zFromGamma, 0, -1), [0, -1], 'Γ = −j is z = −j');
  same(pair(yFromGamma, 0, 1), [0, -1], 'Γ = j is y = −j');
  same(pair(gammaFromZ, Infinity, 0), [1, 0], 'z = ∞ is Γ = 1');
  same(pair(gammaFromZ, 3, -Infinity), [1, 0], 'z with x = −∞ is Γ = 1');
  same(pair(gammaFromZ, 0, 0), [-1, 0], 'z = 0 is Γ = −1');
  same(pair(gammaFromY, Infinity, 0), [-1, 0], 'y = ∞ is Γ = −1');
  same(pair(gammaFromY, 0, 0), [1, 0], 'y = 0 is Γ = 1');
  same(pair(gammaFromZ, -1, 0), [Infinity, 0], 'z = −1 is Γ = ∞');
  same(pair(zFromGamma, Infinity, 0), [-1, 0], 'Γ = ∞ is z = −1');
  same(pair(invert, 0, 0), [Infinity, 0], '1/0 = ∞');
  same(pair(invert, Infinity, 0), [0, 0], '1/∞ = 0');
  same(pair(impedanceFromGamma, 1, 0, 50), [Infinity, 0], 'the open in ohms');
  same(pair(admittanceFromGamma, -1, 0, 50), [Infinity, 0], 'the short in siemens');
  eq(vswr(1), Infinity, 'VSWR of |Γ| = 1'); eq(vswr(0), 1, 'VSWR of a match'); eq(magFromVswr(Infinity), 1, '|Γ| of VSWR ∞');
  eq(returnLoss(0), Infinity, 'return loss of a match'); eq(returnLoss(1), 0, 'return loss of |Γ| = 1');
  eq(mismatchLoss(0), 0, 'mismatch loss of a match'); eq(mismatchLoss(1), Infinity, 'mismatch loss of |Γ| = 1');
  eq(qFromZ(0, 1), Infinity, 'Q on the rim'); eq(qFromZ(1, 0), 0, 'Q on the real axis'); eq(qFromZ(Infinity, 0), 0, 'Q of the open');
  eq(qFromGamma(0, 1), Infinity, 'Q of Γ = j'); eq(qFromGamma(1, 0), 0, 'Q of Γ = 1'); eq(qFromGamma(-1, 0), 0, 'Q of Γ = −1');
  near(qFromGamma(...pair(gammaFromZ, 2, -3)), 1.5, 'Q from Γ is |x|/r');
}

// ---------------------------------------------------------------------------------------------------------------
section('facts-cases C1–C11');
{
  // C1: SWR to |Γ|
  for (const [s, text, ours] of [[1.1, '0.0476', 0.04761904762], [2, '0.3333', 1 / 3], [3, '0.5', 0.5]]) {
    printed(magFromVswr(s), text, `C1 |Γ| of SWR ${s}`); near(magFromVswr(s), ours, `C1 ours, SWR ${s}`);
  }
  // C2: 75 Ω on 50 Ω
  {
    const g = pair(gammaFromImpedance, 75, 0, 50), m = gammaMag(...g);
    near(g[0], 0.2, 'C2 Γ = +0.2'); ok(g[1] === 0, 'C2 Γ is real');
    near(reflectedPower(m), 0.04, 'C2 4 % reflected'); near(deliveredPower(m), 0.96, 'C2 96 % delivered');
    near(vswr(m), 1.5, 'C2 SWR 1.5'); near(returnLoss(m), 13.97940009, 'C2 return loss');
    near(mismatchLoss(m), 0.1772876696, 'C2 mismatch loss'); near(pair(gammaFromImpedance, 50, 0, 75)[0], -0.2, 'C2 50 Ω on 75 Ω flips the sign');
  }
  // C3: plotting z
  {
    const g = pair(gammaFromZ, 1, -2);
    near(g[0], 0.5, 'C3 z = 1 − j2: Γr'); near(g[1], -0.5, 'C3 Γi'); printed(gammaMag(...g), '0.707', 'C3 |Γ|');
    near(gammaMag(...g), 0.7071067812, 'C3 |Γ| ours'); near(toDegrees(gammaAngle(...g)), -45, 'C3 ∠Γ');
    const h = pair(gammaFromZ, 0.3, 0.6);
    printed(h[0], '-0.268', 'C3 z = 0.3 + j0.6: Γr'); printed(h[1], '0.585', 'C3 Γi');
    printed(gammaMag(...h), '0.644', 'C3 |Γ|'); printed(toDegrees(gammaAngle(...h)), '115', 'C3 ∠Γ');
    near(h[0], -0.2682926829, 'C3 Γr ours'); near(h[1], 0.5853658537, 'C3 Γi ours');
    near(gammaMag(...h), 0.6439209162, 'C3 |Γ| ours'); near(toDegrees(gammaAngle(...h)), 114.6235648, 'C3 ∠Γ ours');
  }
  // C4: z to y
  {
    const y = pair(invert, 1, -2);
    near(y[0], 0.2, 'C4 g', 1e-15); near(y[1], 0.4, 'C4 b', 1e-15);
    const y2 = pair(yFromGamma, ...pair(gammaFromZ, 1, -2));
    near(y2[0], 0.2, 'C4 g by Γ', 1e-14); near(y2[1], 0.4, 'C4 b by Γ', 1e-14);
  }
  // C5: plotting Γ (the source reads z from the chart to two digits: within 0.025, a chart reading)
  {
    const cases = [[0.63, 60, '0.80', '1.40', 0.7864128309, 1.422860880], [0.73, 125, '0.20', '0.50', 0.1970618673, 0.5045568442],
      [0.44, -116, '0.50', '-0.50', 0.5105844301, -0.5007949112]];
    for (const [mag, deg, r, x, rOurs, xOurs] of cases) {
      const z = pair(zFromGamma, ...polar(mag, deg));
      near(z[0], rOurs, `C5 ${mag}∠${deg}° r ours`); near(z[1], xOurs, `C5 ${mag}∠${deg}° x ours`);
      printed(z[0], r, `C5 ${mag}∠${deg}° r as read from the chart`, 2.5); printed(z[1], x, `C5 ${mag}∠${deg}° x as read from the chart`, 2.5);
    }
  }
  // C6: z to y on the chart, from C5's first Γ
  {
    const y = pair(yFromGamma, ...polar(0.63, 60));
    near(y[0], 0.2975479797, 'C6 g ours'); near(y[1], -0.5383551279, 'C6 b ours');
    printed(y[0], '0.30', 'C6 g'); printed(y[1], '-0.54', 'C6 b');
  }
  // C7: 60 Ω ∥ 10 pF at 5 GHz on 50 Ω
  {
    const w = 2 * Math.PI * 5e9, Z = pair(invert, 1 / 60, w * 10e-12);
    printed(Z[0], '0.168', 'C7 R_L'); printed(Z[1], '-3.174', 'C7 X_L');
    near(Z[0], 0.1683946963, 'C7 R_L ours'); near(Z[1], -3.174165246, 'C7 X_L ours');
    printed(Z[0] / 50 * 1e3, '3.368', 'C7 r_L (×10⁻³)'); printed(Z[1] / 50, '-0.063', 'C7 x_L');
    const g = pair(gammaFromImpedance, Z[0], Z[1], 50), m = gammaMag(...g), deg = toDegrees(gammaAngle(...g)) + 360;
    printed(g[0], '-0.985', 'C7 Γr'); printed(g[1], '-0.126', 'C7 Γi'); printed(m, '0.993', 'C7 |Γ|'); printed(deg, '187.3', 'C7 ∠Γ');
    near(g[0], -0.9853392692, 'C7 Γr ours'); near(g[1], -0.1256128474, 'C7 Γi ours');
    near(m, 0.9933136780, 'C7 |Γ| ours'); near(deg, 187.2649837, 'C7 ∠Γ ours');
    printed(-g[0], '0.985', 'C7 current reflection re'); printed(-g[1], '0.126', 'C7 current reflection im');
    printed(toDegrees(gammaAngle(-g[0], -g[1])), '7.3', 'C7 current reflection angle');
    // C8: its VSWR. The source's 285 comes from the rounded |Γ| = 0.993.
    near(vswr(m), 298.1181110, 'C8 VSWR ours (exact |Γ|)'); printed(vswr(0.993), '285', 'C8 VSWR of the source, from |Γ| = 0.993');
  }
  // C9: 45 + j75 Ω on 100 Ω, 1 mW incident
  {
    const g = pair(gammaFromImpedance, 45, 75, 100), m = gammaMag(...g);
    near(g[0], -0.08818011257, 'C9 Γr ours'); near(g[1], 0.5628517824, 'C9 Γi ours');
    near(m, 0.5697173520, 'C9 |Γ| ours'); near(toDegrees(gammaAngle(...g)), 98.90396196, 'C9 ∠Γ ours');
    printed(m, '0.570', 'C9 |Γ|'); printed(toDegrees(gammaAngle(...g)), '98.9', 'C9 ∠Γ');
    // The source's −0.0881 is one unit off its own 0.570∠98.9° (−0.0882): a rounding of the source.
    printed(g[0], '-0.0881', 'C9 Γr', 1); printed(g[1], '0.563', 'C9 Γi');
    near(vswr(m), 3.648107492, 'C9 VSWR ours'); printed(vswr(m), '3.65', 'C9 VSWR');
    near(reflectedPower(m), 0.3245778612, 'C9 P_ref ours (mW)'); near(deliveredPower(m), 0.6754221388, 'C9 P_load ours (mW)');
    printed(reflectedPower(m), '0.325', 'C9 P_ref'); printed(deliveredPower(m), '0.675', 'C9 P_load');
  }
  // C10: slotted line: VSWR 2.5, Θ = −36°; the source truncates |Γ| to 0.428 and goes on from there.
  {
    const m = magFromVswr(2.5);
    near(m, 0.4285714286, 'C10 |Γ| ours'); printed(m, '0.428', 'C10 |Γ| (truncated by the source)', 1);
    const g = polar(m, -36), Z = pair(impedanceFromGamma, ...g, 50);
    near(g[0], 0.3467215690, 'C10 Γr ours'); near(g[1], -0.2519079653, 'C10 Γi ours');
    near(Z[0], 83.25948829, 'C10 R_L ours'); near(Z[1], -51.38563429, 'C10 X_L ours');
    const gs = polar(0.428, -36), Zs = pair(impedanceFromGamma, ...gs, 50);
    printed(gs[0], '0.3463', 'C10 Γr from 0.428'); printed(gs[1], '-0.2516', 'C10 Γi from 0.428');
    printed(Zs[0], '83.2', 'C10 R_L from 0.428'); printed(Zs[1], '-51.3', 'C10 X_L from 0.428');
  }
  // C11: return loss and S-parameter magnitudes
  {
    printed(magFromReturnLoss(20), '0.1000', 'C11 |S11| of RL 20 dB'); near(magFromReturnLoss(20), 0.1, 'C11 ours');
    near(magFromReturnLoss(3), 0.7079457844, 'C11 |S21| of 3 dB ours'); printed(magFromReturnLoss(3), '0.7080', 'C11 |S21| (rounded up by the source)', 1);
    printed(pair(gammaFromImpedance, 75, 0, 50)[0], '0.2000', 'C11 Γ of 75 Ω on 50 Ω');
    near(returnLoss(magFromReturnLoss(17.3)), 17.3, 'return loss round trip', 1e-14);
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Γ → z → Γ, y = 1/z, Γ → y → Γ, the closed forms of facts eqs. 4–7, and ohms on a reference, on 10,000 points.
section('round trips');
{
  const z = new Float64Array(2), y = new Float64Array(2), g2 = new Float64Array(2), inv = new Float64Array(2), tmp = new Float64Array(2);
  let worstGamma = 0, worstY = 0, worstForms = 0, worstOhms = 0;
  const N = 10000;
  for (let k = 0; k < N; k++) {
    let gr, gi;
    const kind = k % 10;
    if (k < 5) [gr, gi] = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]][k];
    else if (kind < 4) { const r = Math.sqrt(random()), a = 2 * Math.PI * random(); [gr, gi] = [r * Math.cos(a), r * Math.sin(a)]; }
    else if (kind < 7) { const r = 1 - 10 ** -(1 + 14 * random()), a = 2 * Math.PI * random(); [gr, gi] = [r * Math.cos(a), r * Math.sin(a)]; }
    else if (kind < 8) { const a = 2 * Math.PI * random(); [gr, gi] = [Math.cos(a), Math.sin(a)]; }
    else if (kind < 9) { const e = 10 ** -(1 + 14 * random()); [gr, gi] = random() < 0.5 ? [1 - e, e * (random() - 0.5)] : [-1 + e, e * (random() - 0.5)]; }
    else { const r = 10 ** -(1 + 14 * random()), a = 2 * Math.PI * random(); [gr, gi] = [r * Math.cos(a), r * Math.sin(a)]; }
    const scale = Math.max(1, Math.hypot(gr, gi));
    zFromGamma(z, 0, gr, gi);
    gammaFromZ(g2, 0, z[0], z[1]);
    const eG = Math.hypot(g2[0] - gr, g2[1] - gi) / scale;
    worstGamma = Math.max(worstGamma, eG);
    ok(eG <= 1e-12, `Γ → z → Γ at (${gr}, ${gi}): off by ${eG}`);
    yFromGamma(y, 0, gr, gi);
    invert(inv, 0, z[0], z[1]);
    const ey = y[0] === Infinity || inv[0] === Infinity ? (y[0] === inv[0] && y[1] === inv[1] ? 0 : 1)
      : Math.hypot(y[0] - inv[0], y[1] - inv[1]) / Math.max(Math.hypot(y[0], y[1]), 1e-300);
    worstY = Math.max(worstY, ey);
    ok(ey <= 1e-12 || (Math.hypot(y[0], y[1]) === 0 && Math.hypot(inv[0], inv[1]) === 0), `y = 1/z at (${gr}, ${gi}): off by ${ey}`);
    gammaFromY(g2, 0, y[0], y[1]);
    const eGy = Math.hypot(g2[0] - gr, g2[1] - gi) / scale;
    ok(eGy <= 1e-12, `Γ → y → Γ at (${gr}, ${gi}): off by ${eGy}`);
    // Closed forms (facts eqs. 4–7) away from the poles, where they are well conditioned.
    if (Math.abs(1 - gr) > 1e-3 || Math.abs(gi) > 1e-3) {
      const d = (1 - gr) ** 2 + gi * gi, r = (1 - gr * gr - gi * gi) / d, x = (2 * gi) / d;
      const ef = Math.hypot(r - z[0], x - z[1]) / Math.max(1, Math.hypot(z[0], z[1]));
      const dz = (1 + z[0]) ** 2 + z[1] ** 2, Gr = (z[0] ** 2 + z[1] ** 2 - 1) / dz, Gi = (2 * z[1]) / dz;
      const ef2 = Math.hypot(Gr - gr, Gi - gi);
      worstForms = Math.max(worstForms, ef, ef2);
      ok(ef <= 1e-9 && ef2 <= 1e-9, `facts eqs. 4 and 6 at (${gr}, ${gi}): off by ${ef}, ${ef2}`);
    }
    if (Math.abs(1 + gr) > 1e-3 || Math.abs(gi) > 1e-3) {
      const d = (1 + gr) ** 2 + gi * gi, g = (1 - gr * gr - gi * gi) / d, b = (-2 * gi) / d;
      const ef = Math.hypot(g - y[0], b - y[1]) / Math.max(1, Math.hypot(y[0], y[1]));
      worstForms = Math.max(worstForms, ef);
      ok(ef <= 1e-9, `facts eq. 7 at (${gr}, ${gi}): off by ${ef}`);
    }
    // In ohms and siemens on a random reference.
    const z0 = 10 + 290 * random();
    impedanceFromGamma(tmp, 0, gr, gi, z0);
    gammaFromImpedance(g2, 0, tmp[0], tmp[1], z0);
    let eO = Math.hypot(g2[0] - gr, g2[1] - gi) / scale;
    admittanceFromGamma(tmp, 0, gr, gi, z0);
    gammaFromAdmittance(g2, 0, tmp[0], tmp[1], z0);
    eO = Math.max(eO, Math.hypot(g2[0] - gr, g2[1] - gi) / scale);
    worstOhms = Math.max(worstOhms, eO);
    ok(eO <= 1e-12, `ohms and siemens on ${z0} Ω at (${gr}, ${gi}): off by ${eO}`);
  }
  // The batch forms give the scalar results.
  const n = 64, G = new Float64Array(2 * n), Z = new Float64Array(2 * n), B = new Float64Array(2 * n);
  for (let i = 0; i < 2 * n; i++) G[i] = random() * 2 - 1;
  zFromGammaN(Z, G, n); gammaFromZN(B, Z, n);
  let batch = true;
  for (let k = 0; k < n; k++) {
    zFromGamma(z, 0, G[2 * k], G[2 * k + 1]);
    batch &&= z[0] === Z[2 * k] && z[1] === Z[2 * k + 1] && Math.abs(B[2 * k] - G[2 * k]) < 1e-12 && Math.abs(B[2 * k + 1] - G[2 * k + 1]) < 1e-12;
  }
  ok(batch, 'zFromGammaN and gammaFromZN match the scalar forms');
  console.log(`round trips: worst Γ → z → Γ ${worstGamma.toExponential(2)}, y = 1/z ${worstY.toExponential(2)}, closed forms ${worstForms.toExponential(2)}, ohms ${worstOhms.toExponential(2)}`);
}

// ---------------------------------------------------------------------------------------------------------------
// 100,000 inputs drawn from special values (0, −0, ±1, ±∞, the smallest and largest doubles), the unit circle and
// random sizes: no NaN from any conversion or figure, and a passive z (r ≥ 0) never leaves the unit disc.
section('no NaN');
{
  const SPECIAL = [0, -0, 1, -1, Infinity, -Infinity, 5e-324, -5e-324, 1e-300, 1e300, -1e300, Number.MAX_VALUE, -Number.MAX_VALUE, 1e150, 1 - 2 ** -53, 1 + 2 ** -52];
  const value = () => {
    const u = random();
    if (u < 0.3) return SPECIAL[Math.floor(random() * SPECIAL.length)];
    if (u < 0.6) return (random() < 0.5 ? -1 : 1) * 10 ** (600 * random() - 300);
    return 4 * random() - 2;
  };
  const o = new Float64Array(2);
  const fine = (v) => v === v;
  let outside = 0;
  for (let k = 0; k < 100000; k++) {
    let a = value(), b = value();
    if (k % 5 === 0) { const t = 2 * Math.PI * random(); [a, b] = random() < 0.1 ? [[1, 0], [-1, 0], [0, 1], [0, -1]][k % 4] : [Math.cos(t), Math.sin(t)]; }
    const z0 = 1e-3 + 1e4 * random();
    let good = true;
    for (const fn of [gammaFromZ, zFromGamma, gammaFromY, yFromGamma, invert]) { fn(o, 0, a, b); good &&= fine(o[0]) && fine(o[1]); }
    for (const fn of [gammaFromImpedance, impedanceFromGamma, gammaFromAdmittance, admittanceFromGamma]) { fn(o, 0, a, b, z0); good &&= fine(o[0]) && fine(o[1]); }
    gammaFromZ(o, 0, Math.abs(a), b);
    const m = gammaMag(o[0], o[1]);
    if (!(m <= 1 + 1e-15)) outside++;
    const mags = [m, Math.abs(a), gammaMag(a, b)];
    for (const v of mags) for (const f of [vswr, returnLoss, mismatchLoss, reflectedPower, deliveredPower]) good &&= fine(f(v));
    good &&= fine(gammaAngle(a, b)) && fine(qFromZ(a, b)) && fine(qFromGamma(a, b)) && fine(magFromVswr(1 + Math.abs(a))) && fine(magFromReturnLoss(a));
    ok(good, `a NaN from the input (${a}, ${b}) on ${z0} Ω`);
  }
  ok(outside === 0, `a passive z left the unit disc ${outside} times`);
}

// ---------------------------------------------------------------------------------------------------------------
section('quantity: reading');
{
  const cases = [
    // The resistor tool's forms (its harness checks them too).
    ['10m', undefined, 0.01], ['10 mA', undefined, 0.01], ['3,3', undefined, 3.3], ['4k7', undefined, 4700], ['3V3', undefined, 3.3],
    ['4R7', undefined, 4.7], ['−10', undefined, -10], ['–2.5 V', undefined, -2.5], ['100 ppm/K', undefined, 100], ['5 %', undefined, 5],
    ['3.', undefined, 3], ['.5', undefined, 0.5], ['1M', undefined, 1e6], ['10 Ω', undefined, 10], ['10 ohms', undefined, 10],
    ['100R', undefined, 100], ['25 °C', undefined, 25], ['2x', undefined, 2],
    // New prefixes
    ['3 fF', 'F', 3e-15], ['2.2 TΩ', 'Ω', 2.2e12], ['1 GHz', 'Hz', 1e9], ['1meg', undefined, 1e6], ['1 Meg', 'Ω', 1e6], ['1MEG', 'Ω', 1e6],
    ['1µ', 'H', 1e-6], ['1 μH', 'H', 1e-6], ['1uH', 'H', 1e-6], ['3f', 'F', 3e-15], ['5T', 'Hz', 5e12],
    // New units
    ['2.2 nH', 'H', 2.2e-9], ['10 pF', 'F', 1e-11], ['20 mS', 'S', 0.02], ['20m', 'S', 0.02], ['10 m', 'Ω', 0.01], ['50 Ω', 'Ω', 50], ['2.4 GHz', 'Hz', 2.4e9],
    ['100 hz', 'Hz', 100], ['13.98 dB', 'dB', 13.98], ['-3 dB', 'dB', -3], ['7 W', 'W', 7],
    ['10 m', 'm', 10], ['10m', 'm', 10], ['10 mm', 'm', 0.01], ['2 cm', 'm', 0.02], ['1.5 km', 'm', 1500], ['1m5', 'm', 1.5],
    // Exponent form
    ['3e-9', undefined, 3e-9], ['3e-9 F', 'F', 3e-9], ['1.5E3', 'Hz', 1500], ['2,5e+3', undefined, 2500], ['-1e-3', undefined, -1e-3], ['1e3 k', undefined, 1e6],
    // Letter decimals
    ['4n7', 'H', 4.7e-9], ['4n7 H', 'H', 4.7e-9], ['2p2', 'F', 2.2e-12], ['1G5', 'Hz', 1.5e9], ['4H7', 'H', 4.7], ['1meg5', 'Ω', 1.5e6], ['1m5', undefined, 1.5e-3],
  ];
  for (const [text, unit, value] of cases) {
    const got = readAmount(text, unit);
    ok(got !== null && Math.abs(got - value) <= Math.abs(value) * 1e-12, `readAmount("${text}", ${unit}) is ${value}: ${got}`);
  }
  const nulls = [['', undefined], ['abc', undefined], ['1..2', undefined], ['10 mm', undefined], ['k', undefined], ['--1', undefined],
    ['10 F', 'H'], ['10 nF', 'Ω'], ['1 kdB', 'dB'], ['2 cF', 'F'], ['4H7', undefined], ['4F7', 'H'], ['1e', undefined], ['1e400', undefined],
    ['∞', undefined], ['10 mm', 'Ω'], ['5 s', undefined], ['3e-9 F', 'H']];
  for (const [text, unit] of nulls) ok(readAmount(text, unit) === null, `readAmount("${text}", ${unit}) is not a number: ${readAmount(text, unit)}`);
  eq(readAmount('∞', 'Ω', true), Infinity, 'readAmount ∞ when asked for');
  eq(readAmount('inf Ω', 'Ω', true), Infinity, 'readAmount inf Ω');
  eq(readAmount('−∞', undefined, true), -Infinity, 'readAmount −∞');
  eq(readAmount('∞ F', 'H', true), null, 'readAmount ∞ in the wrong unit');
}

section('quantity: writing');
{
  // keepZeros (M2.3: the readout shows every digit, so both parts of a complex value have the same precision)
  for (const [v, u, d, want] of [[1.35, "", 4, "1.350"], [67.5, "Ω", 4, "67.50 Ω"], [-0.5, "", 4, "−0.5000"], [12345, "", 4, "12350"],
    [0.0012, "", 4, "0.001200"], [1.23e-9, "", 4, "1.230e−9"], [999.96, "Ω", 4, "1.000 kΩ"], [0, "", 4, "0"], [0, "Ω", 4, "0 Ω"], [0.02, "S", 4, "20.00 mS"], [Infinity, "Ω", 4, "∞ Ω"]])
    eq(formatAmount(v, u, d, true), want, `formatAmount(${v}, ${u}, ${d}, keepZeros)`);
  const cases = [
    [3.2961, 'V', 4, '3.296 V'], [0.000158, 'A', 3, '158 µA'], [-10, '', 4, '−10'], [0.9999999, 'V', 4, '1 V'],
    [999.96, 'Ω', 4, '1 kΩ'], [999.94, 'Ω', 4, '999.9 Ω'], [999960, 'Ω', 4, '1 MΩ'], [0.99996e-9, 'H', 4, '1 nH'],
    [2.2e-9, 'H', 4, '2.2 nH'], [1e-11, 'F', 4, '10 pF'], [3e-15, 'F', 4, '3 fF'], [4.7e-16, 'F', 3, '0.47 fF'],
    [2.4e9, 'Hz', 4, '2.4 GHz'], [1.5e12, 'Ω', 4, '1.5 TΩ'], [0.02, 'S', 4, '20 mS'], [0.0254, 'm', 3, '25.4 mm'],
    [13.9794000867, 'dB', 4, '13.98 dB'], [1500, 'dB', 4, '1500 dB'], [-3, 'dB', 3, '−3 dB'],
    [Infinity, 'Ω', 4, '∞ Ω'], [-Infinity, 'S', 4, '−∞ S'], [0, 'Ω', 4, '0 Ω'], [NaN, 'Ω', 4, '– Ω'], [NaN, '', 4, '–'],
    [-4.7e3, 'Ω', 4, '−4.7 kΩ'], [Math.PI, 'Ω', 10, '3.141592654 Ω'], [123456, 'Hz', 2, '120 kHz'], [999.5, 'Hz', 3, '1 kHz'],
  ];
  for (const [value, unit, digits, text] of cases) eq(formatAmount(value, unit, digits), text, `formatAmount(${value}, "${unit}", ${digits})`);
  // Written values read back in their unit.
  let back = true;
  for (let k = 0; k < 2000; k++) {
    const v = (random() < 0.5 ? -1 : 1) * 10 ** (30 * random() - 15);
    const unit = ['Ω', 'S', 'H', 'F', 'Hz', 'm', 'W', 'V', 'A'][k % 9];
    const text = formatAmount(v, unit, 12), read = readAmount(text, unit);
    if (!(read !== null && Math.abs(read - v) <= Math.abs(v) * 1e-11)) { back = false; ok(false, `"${text}" reads back as ${read}, not ${v}`); }
  }
  ok(back, 'formatAmount then readAmount gives the value back in every unit');
}

section('quantity: rounding level (D20)');
{
  const { formatResidual, formatReturnLoss, belowFloor, ROUNDING_FLOOR, RL_CEILING } = quantity;
  eq(ROUNDING_FLOOR, 1e-12, 'the floor');
  near(-20 * Math.log10(ROUNDING_FLOOR), RL_CEILING, 'RL_CEILING is the return loss of |Γ| at the floor', 1e-12);
  for (const [v, unit, digits, floor, want] of [
    [7.2e-17, '', 4, undefined, '< 1e−12'], [-3e-13, '', 4, undefined, '< 1e−12'], [0, '', 4, undefined, '0'],
    [1e-12, '', 4, undefined, '1.000e−12'], [0.0123, '', 4, undefined, '0.01230'], [0.0123, '', 3, undefined, '0.0123'],
    [2e-15, 'Ω', 4, 50e-12, '< 50 pΩ'], [2e-10, 'Ω', 4, 50e-12, '200.0 pΩ'], [4e-20, 'dB', 4, undefined, '< 1e−12 dB'],
    [NaN, '', 4, undefined, '–'], [Infinity, '', 4, undefined, '∞'],
  ]) eq(formatResidual(v, unit, digits, true, floor), want, `formatResidual(${v}, "${unit}", ${digits}, ${floor})`);
  for (const [rl, want] of [[320.4, '> 240 dB'], [240.0001, '> 240 dB'], [240, '240.0 dB'], [13.98, '13.98 dB'], [Infinity, '∞ dB'], [0, '0 dB']])
    eq(formatReturnLoss(rl, 4, true), want, `formatReturnLoss(${rl})`);
  ok(belowFloor(1e-13) && belowFloor(-1e-13) && !belowFloor(0) && !belowFloor(NaN) && !belowFloor(1e-12), 'belowFloor: nonzero and under 1e-12 only');
  // Every residual from 1e-30 to 1e-12 is the bound; from the floor up no text has an exponent of −12 or below.
  // Its own sequence, so the shared random() of the later sections is not shifted.
  let fine = true, seed = 7;
  for (let k = 0; k < 400; k++) {
    seed = (seed * 16807) % 2147483647;
    const v = 10 ** (-30 + 24 * (seed / 2147483647));
    const t = formatResidual(v, '', 2 + (k % 5));
    const e = /e−(\d+)/.exec(t);
    if ((v < 1e-12) !== (t === '< 1e−12') || (e && +e[1] > 12)) { fine = false; ok(false, `formatResidual(${v}) = ${t}`); }
  }
  ok(fine, 'formatResidual: the bound exactly under the floor, no exponent below −12 above it');
}

// ---------------------------------------------------------------------------------------------------------------
// Parts and network (M1.2): check-network.mjs, with the same counters.
runNetworkChecks({ section, ok, near, printed, random });

// ---------------------------------------------------------------------------------------------------------------
// Geometry (M1.3): check-geometry.mjs, with the same counters.
runGeometryChecks({ section, ok, random });

// ---------------------------------------------------------------------------------------------------------------
// Equations (M1.4): check-equations.mjs, with the same counters.
runEquationChecks({ section, ok, random });

// ---------------------------------------------------------------------------------------------------------------
// Grid (M2.1a): check-grid.mjs, with the same counters.
runGridChecks({ section, ok, random });

// ---------------------------------------------------------------------------------------------------------------
// Circuit state and link (M3.1): check-state.mjs, with the same counters.
runStateChecks({ section, ok, random });

// ---------------------------------------------------------------------------------------------------------------
// Goals and the solver's geometric core (M4.1a): check-solve.mjs, with the same counters.
runSolveChecks({ section, ok, near, printed, random });

// ---------------------------------------------------------------------------------------------------------------
// The best value, ranges, families and the fallback search (M4.1b): check-solve-b.mjs, with the same counters.
runSolveMoreChecks({ section, ok, near, random });

// ---------------------------------------------------------------------------------------------------------------
// Value lists and standard-value variants (M4.1b, D17): check-values.mjs, with the same counters.
runValueChecks({ section, ok, near, random });

// ---------------------------------------------------------------------------------------------------------------
// Independent validation of the solver against brute force (M4.2): check-validate.mjs, with the same counters.
runValidateChecks({ section, ok, random });

// ---------------------------------------------------------------------------------------------------------------
// Suggestions and the solver worker's core (M4.4a): check-suggest.mjs, on a stream of its own.
runSuggestChecks({ section, ok });

// ---------------------------------------------------------------------------------------------------------------
// "Explain this move" (M5.4): check-explain.mjs.
runExplainChecks({ section, ok, random });

// ---------------------------------------------------------------------------------------------------------------
// The teaching engine (M6.2): check-teach.mjs (examples, challenges, lesson links).
runTeachChecks({ section, ok, random });

// ---------------------------------------------------------------------------------------------------------------
const total =[...groups.values()].reduce((a, b) => a + b, 0);
for (const f of failures.slice(0, 200)) console.log(`FAIL ${f}`);
if (failures.length > 200) console.log(`… and ${failures.length - 200} more failures`);
console.log([...groups].map(([name, count]) => `${name} ${count}`).join(' · '));
console.log(`smith library: ${passed} of ${total} checks passed`);
process.exitCode = passed === total ? 0 : 1;
