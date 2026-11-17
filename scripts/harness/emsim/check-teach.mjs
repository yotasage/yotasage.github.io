// Checks of the EM teaching layer (step M4.2): the 61 equations of lib/emsim/equations.ts (equationsLines.ts,
// equationsVia.ts) and their derivation steps, the via values of lib/emsim/eqvaluesVia.ts and the worked examples of
// lib/emsim/examples.ts. Every entry with numbers evaluates equal (1e-9 relative) to the engine on the default setups
// and on seeded random setups and vias; every derivation step's sides are equal on random values that satisfy the
// entry's assumptions; every example link decodes to the setup its recipe builds and every number it quotes equals the
// engine to the decimals shown; every source key exists in references.bib.

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { mulberry32 } from './check-geometry.mjs';
import * as EQ0 from '../../../lib/emsim/equations.ts';
import * as EV0 from '../../../lib/emsim/eqvalues.ts';
import * as EVV0 from '../../../lib/emsim/eqvaluesVia.ts';
import * as EX0 from '../../../lib/emsim/examples.ts';
import * as PA0 from '../../../lib/equations/parse.ts';
import * as CO0 from '../../../lib/equations/compile.ts';
import * as LN0 from '../../../lib/emsim/lines.ts';
import * as CF0 from '../../../lib/emsim/closedform.ts';
import * as SU0 from '../../../lib/emsim/setup.ts';
import * as S0 from '../../../lib/emsim/stackup.ts';
import * as P0 from '../../../lib/emsim/presets.ts';
import * as ST0 from '../../../lib/emsim/structure.ts';
import * as V0 from '../../../lib/emsim/via.ts';
import * as VM0 from '../../../lib/emsim/viamodel.ts';
import * as NP0 from '../../../lib/emsim/nport.ts';
import * as IN0 from '../../../lib/emsim/inverse.ts';
import * as J0 from '../../../lib/emsim/jlcCalc.ts';
import * as L0 from '../../../lib/emsim/link.ts';
import * as TD0 from '../../../lib/emsim/tdr.ts';

const d = (m) => m.default ?? m;
const EQ = d(EQ0), EV = d(EV0), EVV = d(EVV0), EX = d(EX0), PA = d(PA0), CO = d(CO0), LN = d(LN0), CF = d(CF0), SU = d(SU0);
const S = d(S0), P = d(P0), ST = d(ST0), V = d(V0), VM = d(VM0), NP = d(NP0), IN = d(IN0), J = d(J0), L = d(L0), TD = d(TD0);
const katex = createRequire(import.meta.url)('../../../node_modules/katex');
const renders = (s) => { try { katex.renderToString(s, { output: 'mathml', throwOnError: true, strict: 'error' }); return null; } catch (e) { return e.message; } };

const TOL = 1e-9;
const C0 = 299792458, EPS0 = EVV.MU0_VIA ? 1 / (EVV.MU0_VIA * C0 * C0) : NaN, MU0 = EVV.MU0_VIA;
const CONST = { c_0: C0, mu_0: MU0, varepsilon_0: EPS0, eta_0: 1 / (EPS0 * C0), z_90: TD.EDGE_Z90, R_TDR: 25 };

// ---- complex helpers for the step bindings ----
const re = (x) => (typeof x === 'number' ? x : x[0]), im = (x) => (typeof x === 'number' ? 0 : x[1]);
const add = (a, b) => [re(a) + re(b), im(a) + im(b)];
const sub = (a, b) => [re(a) - re(b), im(a) - im(b)];
const mul = (a, b) => [re(a) * re(b) - im(a) * im(b), re(a) * im(b) + im(a) * re(b)];
const div = (a, b) => { const q = re(b) ** 2 + im(b) ** 2; return [(re(a) * re(b) + im(a) * im(b)) / q, (im(a) * re(b) - re(a) * im(b)) / q]; };
const ej = (t) => [Math.cos(t), Math.sin(t)];
const J1 = [0, 1];

// Spread of every side of a tree against the first (complex, matrices element by element), relative to the largest
// magnitude of that element over the sides.
function spread(tree, b, floor = 0) {
  const sides = CO.evaluate(tree, b);
  let worst = 0;
  for (let k = 0; k < sides[0].length; k += 2) {
    let big = floor;
    for (const s of sides) big = Math.max(big, Math.hypot(s[k], s[k + 1]));
    for (const s of sides.slice(1)) {
      const dd = Math.hypot(s[k] - sides[0][k], s[k + 1] - sides[0][k + 1]);
      worst = Math.max(worst, big === 0 ? 0 : dd / big);
    }
  }
  return worst;
}

// ---- random bindings that satisfy each entry's steps ----
function gens(r) {
  const U = (a, b) => a + (b - a) * r();
  const RC = (s = 1) => [U(-s, s), U(-s, s)];
  return {
    'z0-lc': () => { const L = U(1e-7, 1e-6), C = U(5e-11, 3e-10), omega = U(1e9, 1e11), z = U(0, 0.1), V_p = RC(), beta = omega * Math.sqrt(L * C), Z = Math.sqrt(L / C);
      const I_p = div(V_p, Z), V = mul(V_p, ej(-beta * z)), I = mul(I_p, ej(-beta * z));
      return { L, C, omega, z, V_p, I_p, beta, V, I, dz: 1, dV: mul([0, -beta], V), dI: mul([0, -beta], I), Z_0: Z }; },
    'delay-lc': () => { const L = U(1e-7, 1e-6), C = U(5e-11, 3e-10), omega = U(1e9, 1e11); return { L, C, omega, beta: omega * Math.sqrt(L * C), v: 1 / Math.sqrt(L * C), tau: Math.sqrt(L * C) }; },
    'l-c0': () => { const C_0 = U(1e-11, 1e-10); return { C_0, L: MU0 * EPS0 / C_0 }; },
    'v-eeff': () => { const C_0 = U(1e-11, 1e-10), e = U(1, 10), C = C_0 * e, Lx = MU0 * EPS0 / C_0; return { C_0, C, L: Lx, varepsilon_eff: e, v: 1 / Math.sqrt(Lx * C) }; },
    'lambda-eeff': () => { const e = U(1, 10), f = U(1e8, 1e11), v = C0 / Math.sqrt(e); return { varepsilon_eff: e, f, v, lambda: v / f, lambda_0: C0 / f }; },
    'getsinger-limit': () => { const er = U(2, 10), e = 1 + (er - 1) * U(0.3, 0.9), delta = U(1e-4, 1e-2), G = U(0.6, 1.2), f_p = U(5e10, 5e11);
      const y = delta * e / (er - e - delta * e), f = f_p * Math.sqrt(y / G);
      return { varepsilon_r: er, varepsilon_eff: e, delta, G, f_p, y, f_lim: f, x: y / G, varepsilon_f: er - (er - e) / (1 + G * (f / f_p) ** 2) }; },
    'error-shown': () => { const X = U(1, 10), k = U(1, 5) * (r() < 0.5 ? -1 : 1), h_M = U(0.1, 0.5), p = U(0.8, 4); return { X, k, h_M, p, X_M: X + k * h_M ** p, X_M2: X + k * (2 * h_M) ** p }; },
    order: () => { const X = U(1, 10), k = U(1, 5) * (r() < 0.5 ? -1 : 1), h = U(0.1, 0.5), p = U(0.8, 4); return { p, X_M: X + k * h ** p, X_M2: X + k * (2 * h) ** p, X_M4: X + k * (4 * h) ** p, h_M: h }; },
    'zodd-sym': () => pairLC(U, RC, -1),
    'zeven-sym': () => pairLC(U, RC, 1),
    'zdiff-zodd': () => { const V_1 = RC(), I_1 = RC(), V_e = RC(), I_e = RC();
      return { V_1, I_1, V_2: sub(0, V_1), I_2: sub(0, I_1), V_d: mul(2, V_1), I_d: I_1, Z_odd: div(V_1, I_1), Z_diff: mul(2, div(V_1, I_1)), V_e, I_e, V_c: V_e, I_c: mul(2, I_e), Z_even: div(V_e, I_e), Z_cm: div(V_e, mul(2, I_e)) }; },
    'zdd-zc': () => { const z = zc(U), I_d = RC(), I_1 = I_d, I_2 = sub(0, I_d);
      return { ...z, I_d, I_1, I_2, V_1: add(mul(z.Z_c11, I_1), mul(z.Z_c12, I_2)), V_2: add(mul(z.Z_c21, I_1), mul(z.Z_c22, I_2)), Z_diff: z.Z_c11 + z.Z_c22 - 2 * z.Z_c12 }; },
    'zcc-zc': () => { const z = zc(U), I_c = RC(), I = mul(0.5, I_c), V_1 = mul(z.Z_c11 + z.Z_c12, I), V_2 = mul(z.Z_c21 + z.Z_c22, I);
      return { ...z, I_c, I_1: I, I_2: I, V_1, V_2, V_c: mul(0.5, add(V_1, V_2)), Z_cm: (z.Z_c11 + z.Z_c22 + 2 * z.Z_c12) / 4 }; },
    'zdc-zc': () => { const z = zc(U), I_c = RC(), I = mul(0.5, I_c);
      return { ...z, I_c, I_1: I, I_2: I, V_1: mul(z.Z_c11 + z.Z_c12, I), V_2: mul(z.Z_c21 + z.Z_c22, I), Z_dc: (z.Z_c11 - z.Z_c22) / 2 }; },
    'zdiff-b': () => { const Y11 = U(0.01, 0.03), Y22 = U(0.01, 0.03), Y12 = -U(0, 0.005), V_d = RC(), V_c = RC(), V_1 = mul(0.5, V_d), V_2 = mul(-0.5, V_d);
      const I_1 = add(mul(Y11, V_1), mul(Y12, V_2)), I_2 = add(mul(Y12, V_1), mul(Y22, V_2)), I_d = mul(0.5, sub(I_1, I_2)), I_c = mul(Y11 + Y22 + 2 * Y12, V_c);
      return { Y_c11: Y11, Y_c22: Y22, Y_c12: Y12, V_d, V_c, V_1, V_2, I_1, I_2, I_d, I_c, Z_diffB: div(V_d, I_d), Z_cmB: div(V_c, I_c) }; },
    ztdr: () => { const Z_dd = U(80, 120), Z_dc = U(-5, 5), Z_cc = U(20, 40), I_d = RC(), I_c = mul(-Z_dc / (Z_cc + 25), I_d);
      return { Z_dd, Z_dc, Z_cc, R_TDR: 25, I_d, I_c, V_d: add(mul(Z_dd, I_d), mul(Z_dc, I_c)), V_c: add(mul(Z_dc, I_d), mul(Z_cc, I_c)), Z_TDR: Z_dd - Z_dc ** 2 / (Z_cc + 25) }; },
    kb: () => { const C_m = U(1e-12, 1e-11), C_11 = U(5e-11, 2e-10), L_m = U(1e-8, 1e-7), L_11 = U(2e-7, 6e-7), V = U(0.1, 5), k = (C_m / C_11 + L_m / L_11) / 4;
      return { C_m, C_11, L_m, L_11, V, k_b: k, V_b: k * V }; },
    kf: () => { const C_m = U(1e-12, 1e-11), C_11 = U(5e-11, 2e-10), L_m = U(1e-8, 1e-7), L_11 = U(2e-7, 6e-7), v_c = U(1e8, 2e8), ell = U(0.01, 0.3), V_r = U(0.1, 5), t_r = U(1e-11, 1e-9), k = (C_m / C_11 - L_m / L_11) / (2 * v_c);
      return { C_m, C_11, L_m, L_11, v_c, ell, V_r, t_r, k_f: k, V_f: k * ell * V_r / t_r }; },
    'fext-pulse': () => { const k_f = U(-2e-10, 2e-10), ell = U(0.01, 0.3), V_r = U(0.1, 5), t_r = U(1e-11, 1e-9); return { k_f, ell, V_r, t_r, dt: 1, dV: V_r / t_r, V_FEXT: k_f * ell * V_r / t_r }; },
    'eeff-mode': () => { const e = U(1, 10); return { varepsilon_effm: e, v_m: C0 / Math.sqrt(e) }; },
    'mode-skew': () => { const te = U(5e-9, 7e-9), to = U(5e-9, 7e-9), ell = U(0.01, 0.3); return { tau_even: te, tau_odd: to, ell, Delta_tau: (te - to) * ell }; },
    'parts-sum': () => { const p = [U(-1, 2), U(-1, 2), U(-1, 2), U(-1, 2)], rest = U(-0.1, 0.1), s = p[0] + p[1] + p[2] + p[3];
      return { Delta_er: p[0], Delta_cu: p[1], Delta_etch: p[2], Delta_mask: p[3], Delta_rest: rest, Delta_sum: s, Delta_Z: s + rest }; },
    sens: () => { const Zn = U(30, 100), Z_d = U(-20, 20), a = U(-5, 5), t = U(0.01, 0.2); return { Z_d, t_i: t, Z_plus: Zn + Z_d * t + a * t * t, Z_minus: Zn - Z_d * t + a * t * t, d_i: Z_d * t }; },
    'rss-sigma': () => { const d1 = U(-3, 3), d2 = U(-3, 3), u1 = U(-1, 1), u2 = U(-1, 1), Zn = U(30, 100), S_d = d1 * d1 + d2 * d2, x_bar = U(0, 1), t_i = U(0.01, 0.1);
      return { d_1: d1, d_2: d2, u_1: u1, u_2: u2, Z_n: Zn, Z: Zn + d1 * u1 + d2 * u2, sigma_u: 1 / 3, S_d, sigma: Math.sqrt(S_d) / 3, x_i: x_bar + u1 * t_i, x_bar, t_i, u_i: u1, sigma_i: t_i / 3 }; },
    // vias
    'via-barrel-z': () => { const C_0p = U(1e-11, 1e-10), er = U(1, 10); return { C_0p, varepsilon_ri: er, Cp: er * C_0p, Lp: MU0 * EPS0 / C_0p, Z_i: 1 / (C0 * C_0p * Math.sqrt(er)), Z_vac: 1 / (C0 * C_0p) }; },
    'via-barrel-delay': () => { const C_0p = U(1e-11, 1e-10), er = U(1, 10), ell = U(1e-5, 2e-3); return { C_0p, varepsilon_ri: er, Cp: er * C_0p, Lp: MU0 * EPS0 / C_0p, ell_i: ell, tau_i: ell * Math.sqrt(er) / C0 }; },
    'via-coax': () => { const dd = U(1e-4, 5e-4), D = dd * U(1.5, 20), er = U(1, 10), Cp = 2 * Math.PI * EPS0 * er / Math.log(D / dd), C_0p = Cp / er;
      return { d: dd, D, varepsilon_ri: er, Cp, C_0p, Z_vac: 1 / (C0 * C_0p), Z_i: Math.sqrt(er) / (C0 * Cp) }; },
    'via-quasi-coax': () => { const a = U(5e-5, 2e-4), b = U(5e-5, 2e-4), R = U(5e-4, 3e-3), N = 1 + Math.floor(U(1, 9)), er = U(1, 10), q = U(1e-12, 1e-9), eps = EPS0 * er;
      const phi_a = q * Math.log(R / a) / (2 * Math.PI * eps), phi_b = -q * Math.log(R / (N * b)) / (2 * Math.PI * eps * N), Cp = q / (phi_a - phi_b);
      return { a, b, R, N, varepsilon_ri: er, q, varepsilon: eps, phi_a, phi_b, Cp, Z_qc: Math.sqrt(er) / (C0 * Cp) }; },
    'via-req': () => { const a = U(5e-5, 2e-4), R = a * U(1.5, 20), C_0p = 2 * Math.PI * EPS0 / Math.log(R / a); return { a, R_eq: R, C_0p }; },
    'via-section-l': () => { const C_0p = U(1e-11, 1e-10), ell = U(1e-4, 3e-3), L_over = U(0, 5e-10); return { C_0p, ell_th: ell, Z_vac: 1 / (C0 * C_0p), L_ip: MU0 * EPS0 / C_0p, L_over, L_sec: MU0 * EPS0 / C_0p * ell + L_over }; },
    'via-section-c': () => { const C_0p = U(1e-11, 1e-10), e1 = U(1, 10), e2 = U(1, 10), l1 = U(1e-5, 1e-3), l2 = U(1e-5, 1e-3), dC = U(1e-14, 1e-13), Cl = e1 * C_0p * l1 + e2 * C_0p * l2;
      return { C_0p, varepsilon_ri: e1, C_ip: e1 * C_0p, C_1p: e1 * C_0p, C_2p: e2 * C_0p, ell_1: l1, ell_2: l2, C_line: Cl, Delta_Csum: dC, C_sec: Cl + dC, Delta_C: dC, k_12: U(0, 0.4) }; },
    'via-section-z': () => { const Ls = U(1e-10, 2e-9), Cs = U(1e-13, 1e-12); return { L_sec: Ls, C_sec: Cs, Z_sec: Math.sqrt(Ls / Cs) }; },
    'via-section-delay': () => { const Ls = U(1e-10, 2e-9), Cs = U(1e-13, 1e-12); return { L_sec: Ls, C_sec: Cs, tau_sec: Math.sqrt(Ls * Cs) }; },
    'via-section-pair': () => { const L11 = U(5e-10, 2e-9), L12 = L11 * U(0, 0.5), C11 = U(1e-13, 1e-12), C12 = -C11 * U(0, 0.3), zo = Math.sqrt((L11 - L12) / (C11 - C12)), ze = Math.sqrt((L11 + L12) / (C11 + C12));
      return { L_s11: L11, L_s12: L12, C_s11: C11, C_s12: C12, Z_oddsec: zo, Z_evensec: ze, Z_diffsec: 2 * zo, Z_cmsec: ze / 2, Z_odd: zo, Z_diff: 2 * zo, Z_cm: ze / 2, Z_even: ze, L_11: L11, L_12: L12, C_11: C11, C_12: C12 }; },
    'cavity-f': () => { const m = Math.floor(U(0, 4)), n = 1 + Math.floor(U(0, 4)), a = U(0.02, 0.3), bb = U(0.02, 0.3), x = U(0, a), y = U(0, bb), er = U(1, 10), k = Math.sqrt((m * Math.PI / a) ** 2 + (n * Math.PI / bb) ** 2);
      return { m_c: m, n_c: n, a_x: a, b_y: bb, x_c: x, y_c: y, varepsilon_r: er, E_z: Math.cos(m * Math.PI * x / a) * Math.cos(n * Math.PI * y / bb), k_c: k, f_mn: C0 * k / (2 * Math.PI * Math.sqrt(er)) }; },
    'stub-zin': () => { const Z_s = U(20, 120), th = U(0.05, 3), V_2 = RC(), A = Math.cos(th), Cc = [0, Math.sin(th) / Z_s];
      return { Z_s, theta_s: th, V_2, I_2: 0, A_s: A, C_s: Cc, V_1: mul(A, V_2), I_1: mul(Cc, V_2), Z_in: div(A, Cc) }; },
    'stub-quarter': () => { const ell = U(1e-4, 2e-3), e = U(1, 10), tau = ell * Math.sqrt(e) / C0, f = 1 / (4 * tau); return { ell_s: ell, varepsilon_effs: e, tau_stub: tau, f_stub: f, theta_q: Math.PI / 2 }; },
    lambda8: () => { const ell = U(1e-5, 1e-3), er = U(1, 10), f = C0 / (8 * ell * Math.sqrt(er)); return { ell_w: ell, varepsilon_rw: er, f_valid: f, lambda_w: C0 / (f * Math.sqrt(er)) }; },
    'edge-f3': () => { const sg = U(3e-12, 5e-11), f = U(1e8, 1e11), f3 = Math.sqrt(Math.log(2)) / (2 * Math.PI * sg);
      return { sigma_e: sg, t_r: 2 * TD.EDGE_Z90 * sg, z_90: TD.EDGE_Z90, f, H: Math.exp(-((2 * Math.PI * f * sg) ** 2) / 2), f_3: f3 }; },
    'edge-band': () => { const sg = U(3e-12, 5e-11), Lx = U(1e-6, 0.7), fL = Math.sqrt(2 * Math.log(1 / Lx)) / (2 * Math.PI * sg);
      return { sigma_e: sg, L_x: Lx, f_L: fL, f_3: Math.sqrt(Math.log(2)) / (2 * Math.PI * sg) }; },
    'tdr-z': () => { const Z_ref = U(25, 100), Z_t = U(10, 200); return { Z_ref, Z_t, rho: (Z_t - Z_ref) / (Z_t + Z_ref) }; },
    'tdr-roundtrip': () => { const ell = U(1e-4, 0.05), e = U(1, 10), tau = ell * Math.sqrt(e) / C0; return { ell_f: ell, varepsilon_efff: e, tau_f: tau, t_rt: 2 * tau }; },
    'abcd-line': () => { const Z_i = U(20, 120), th = U(0, 6), V_p = RC(), V_m = RC();
      const V_2 = add(mul(V_p, ej(-th)), mul(V_m, ej(th))), I_2 = div(sub(mul(V_p, ej(-th)), mul(V_m, ej(th))), Z_i);
      return { Z_i, theta_i: th, V_p, V_m, V_1: add(V_p, V_m), I_1: div(sub(V_p, V_m), Z_i), V_2, I_2, A_l: Math.cos(th), B_l: [0, Z_i * Math.sin(th)], C_l: [0, Math.sin(th) / Z_i] }; },
    's-abcd': () => { const A = RC(2), B = RC(50), Cc = RC(0.02), D = RC(2), Z = U(25, 100), b_2 = RC(), V_2 = b_2, I_2 = div(b_2, Z);
      const V_1 = add(mul(A, V_2), mul(B, I_2)), I_1 = add(mul(Cc, V_2), mul(D, I_2)), a_1 = mul(0.5, add(V_1, mul(Z, I_1))), b_1 = mul(0.5, sub(V_1, mul(Z, I_1)));
      return { A_c: A, B_c: B, C_c: Cc, D_c: D, Z_ref: Z, b_2, V_2, I_2, V_1, I_1, a_1, b_1, S_21: div(b_2, a_1), S_11: div(b_1, a_1) }; },
    'mixed-mode-s': () => { const s = {}; for (const k of ['S_11', 'S_12', 'S_21', 'S_22']) s[k] = RC(); const a_1 = RC(), a_2 = sub(0, a_1);
      const b_1 = add(mul(s.S_11, a_1), mul(s.S_12, a_2)), b_2 = add(mul(s.S_21, a_1), mul(s.S_22, a_2)), a_d1 = mul(Math.SQRT1_2, sub(a_1, a_2)), b_d1 = mul(Math.SQRT1_2, sub(b_1, b_2));
      return { ...s, a_1, a_2, b_1, b_2, a_d1, b_d1, S_dd11: div(b_d1, a_d1) }; },
  };
}
function pairLC(U, RC, sign) {
  const C_11 = U(5e-11, 2e-10), C_12 = -C_11 * U(0, 0.5), L_11 = U(2e-7, 6e-7), L_12 = L_11 * U(0, 0.5), V_1 = RC(), I_1 = RC();
  const V_2 = mul(sign, V_1), I_2 = mul(sign, I_1);
  const o = { C_11, C_12, L_11, L_12, V_1, V_2, I_1, I_2, Q_1: add(mul(C_11, V_1), mul(C_12, V_2)), Psi_1: add(mul(L_11, I_1), mul(L_12, I_2)), Q_vec: 1, C_mat: 1, V_vec: 1 };
  if (sign < 0) o.Z_odd = Math.sqrt((L_11 - L_12) / (C_11 - C_12)); else o.Z_even = Math.sqrt((L_11 + L_12) / (C_11 + C_12));
  return o;
}
function zc(U) { const Z_c11 = U(40, 70), Z_c22 = U(40, 70), Z_c12 = U(0, 10); return { Z_c11, Z_c22, Z_c12, Z_c21: Z_c12 }; }
// Steps that hold only approximately, with their bound: the rounded 0.3396 of edge-f3.
const APPROX = { 'edge-f3 5': 2e-4 };
// Entries with no steps: definitions, the tool's rules and source statements (equations-list.md, "Counts").
const NO_STEPS = ['telegraph', 'eeff-c', 'getsinger', 'charge-potential', 'mixed-mode-vars', 'pct-diff', 'share', 'corners', 'mc-normal',
  'via-dc', 'via-pad-coupling', 'via-target', 'target', 'abcd-shunt', 's-db', 'tdr-rho'];
const VIA_IDS = ['via-barrel-z', 'via-barrel-delay', 'via-coax', 'via-quasi-coax', 'via-req', 'via-section-l', 'via-section-c', 'via-section-z',
  'via-section-delay', 'via-section-pair', 'via-dc', 'via-pad-coupling', 'via-target', 'target', 'cavity-f', 'stub-zin', 'stub-quarter', 'lambda8',
  'edge-f3', 'edge-band', 'tdr-rho', 'tdr-z', 'tdr-roundtrip', 'abcd-line', 'abcd-shunt', 's-abcd', 's-db', 'mixed-mode-s'];
// Trace entries checked on the default cases only (check-equations.mjs): their numbers need the Tolerance tool's or the
// calculator's runs (dozens of solves each), or exist only where the shown error is the printed rule.
const DEFAULT_ONLY = ['error-shown', 'parts-sum', 'sens', 'share', 'corners', 'rss-sigma', 'mc-normal'];
const RANDOM_CASES = 50;

export async function run(t) {
  const E = EQ.EM_EQUATIONS;
  const byId = EQ.EM_EQUATION_BY_ID;
  t.eq(E.length, 61, 'the registry has 61 equations (33 + 28 of equations-list.md)');
  t.eq(E.slice(33).map((e) => e.id).join(','), VIA_IDS.join(','), 'the 28 new ids in the order of equations-list.md');
  const bib = readFileSync(new URL('../../../references.bib', import.meta.url), 'utf8');
  const keys = new Set([...bib.matchAll(/^@\w+\{([^,\s]+),/gm)].map((m) => m[1]));
  const topics = new Set(['transmission-lines', 'field-solver', 'pairs', 'calculators', 'tolerances', 'via-line', 'via-pads', 'via-return', 'via-stubs', 'via-tdr', 'via-sparams', 'via-limits']);

  // ---- 1. the registry: steps, sources, symbols, TeX ----
  let stepCount = 0;
  for (const e of E) {
    for (const s of e.sources) t.ok(keys.has(s.key), `${e.id}: source ${s.key} is in references.bib`);
    t.ok(topics.has(e.topic), `${e.id}: topic ${e.topic}`);
    t.ok((e.on === 'via') === (VIA_IDS.includes(e.id) && e.id !== 'target'), `${e.id}: numbers from the ${e.on}`);
    t.ok(NO_STEPS.includes(e.id) === (e.steps.length === 0), `${e.id}: ${e.steps.length} steps (a derived entry has steps, a definition none)`);
    const unknown = [...e.variables, ...e.stepVariables].filter((v) => !EQ.emSymbolOf(v, e));
    t.ok(unknown.length === 0, () => `${e.id}: names without a meaning: ${unknown.join(', ')}`);
    t.ok([...e.variables, ...e.stepVariables].every((v) => !renders(EQ.emNameTex(v))), `${e.id}: every name's TeX renders`);
    for (const tr of [e.tree, ...e.where.map((w) => w.tree)]) {
      t.ok(PA.toText(PA.parse(PA.toText(tr))) === PA.toText(tr), `${e.id}: text → tree → text is stable`);
      const err = renders(EQ.emTex(tr)); t.ok(!err, () => `${e.id}: TeX renders: ${err}`);
    }
    if (e.extra) t.ok(!renders(e.extra), () => `${e.id}: extra renders: ${renders(e.extra)}`);
    e.steps.forEach((s, k) => {
      stepCount++;
      t.ok(s.tree.t === 'eq', `${e.id} step ${k + 1} is an equality`);
      t.ok(PA.toText(PA.parse(PA.toText(s.tree))) === PA.toText(s.tree), `${e.id} step ${k + 1}: text → tree → text is stable`);
      const err = renders(EQ.emTex(s.tree)); t.ok(!err, () => `${e.id} step ${k + 1}: TeX renders: ${err}`);
      t.ok(s.why.length > 0 && s.reason.length % 2 === 1, `${e.id} step ${k + 1}: a reason that alternates text and maths`);
      t.ok(s.reason.filter((_, j) => j % 2 === 1).every((m) => !renders(EQ.emTex(m))), `${e.id} step ${k + 1}: the reason's maths renders`);
    });
  }
  t.note(`registry: ${E.length} equations (${E.filter((e) => e.on === 'via').length} on the via model), ${stepCount} derivation steps in ${E.filter((e) => e.steps.length).length} entries`);

  // ---- 2. every step on random values ----
  {
    const G = gens(mulberry32(41620261));
    let evals = 0, worst = 0, worstAt = '';
    for (const e of E) {
      if (!e.steps.length) continue;
      const g = G[e.id];
      if (!t.ok(!!g, `${e.id}: a random binding for its steps`)) continue;
      let fails = 0, bad = '', ew = 0, unbound = null;
      for (let n = 0; n < 200; n++) {
        const b = { ...CONST, ...g() };
        e.steps.forEach((s, k) => {
          let dd;
          try { dd = spread(s.tree, b); } catch (x) { unbound ??= `step ${k + 1}: ${x.message}`; return; }
          evals++;
          const lim = APPROX[`${e.id} ${k + 1}`] ?? TOL;
          if (!(dd <= lim)) { fails++; bad ||= `step ${k + 1} (${dd.toExponential(2)})`; }
          if (!APPROX[`${e.id} ${k + 1}`]) ew = Math.max(ew, dd);
        });
      }
      t.ok(unbound === null, () => `${e.id}: every step's names bound (${unbound})`);
      t.ok(fails === 0, () => `${e.id}: every step's sides equal at 200 random points within ${TOL} (${fails} over, first ${bad})`);
      if (ew > worst) { worst = ew; worstAt = e.id; }
    }
    // the thin-wire identity of via-quasi-coax step 2: the product of |1 − exp(2πjk/N)| over k = 1 … N − 1 is N
    for (let N = 2; N <= 12; N++) { let p = 1; for (let k = 1; k < N; k++) p *= Math.hypot(1 - Math.cos(2 * Math.PI * k / N), Math.sin(2 * Math.PI * k / N)); t.near(p, N, `quasi-coax: product of the return distances for N = ${N}`, 1e-12); }
    // the rounded constants of edge-f3 and edge-band
    t.near(2 * TD.EDGE_Z90 * Math.sqrt(Math.LN2) / (2 * Math.PI), 0.3396, 'f3·tr = 0.3396 to four digits', 1.5e-4);
    t.near(Math.sqrt(2 * Math.log(10) / Math.LN2), 2.578, 'f(0.1)/f3 = 2.578', 2e-4); t.near(Math.sqrt(2 * Math.log(1000) / Math.LN2), 4.465, 'f(0.001)/f3 = 4.465', 2e-4);
    t.note(`steps: ${evals} step evaluations at 200 random points per entry, worst relative spread ${worst.toExponential(2)} (${worstAt}); edge-f3 step 5 rounded (0.3396, within 2e-4)`);
  }

  // ---- 3. the trace entries against the engine on random setups ----
  const def = SU.defaultSetup();
  const withTrace = (base, f) => { const s = { ...base, trace: { ...base.trace } }; f(s.trace, s.stackup); return s; };
  const kindAt = (base, kind, w) => withTrace(base, (tr, st) => { Object.assign(tr, ST.presetStructure(kind, st, w)); });
  const count = {};
  const bump = (id) => { count[id] = (count[id] ?? 0) + 1; };
  let worstTrace = 0, worstTraceAt = '';
  // Values zero by symmetry (Scd21 of a symmetric pair, ρ on a flat TDR) are compared against the entry's scale: the
  // largest bound value of the first name's unit (and at least 1 for dimensionless names).
  const evalEntry = (e, bind, label) => {
    const unit0 = EQ.emSymbolOf(e.variables[0], e)?.unit ?? '';
    let scale = unit0 === '' ? 1 : 0;
    for (const v of e.variables) if ((EQ.emSymbolOf(v, e)?.unit ?? '') === unit0) { const x = bind[v]; scale = Math.max(scale, typeof x === 'number' ? Math.abs(x) : Math.hypot(x[0], x[1])); }
    const w = Math.max(...[e.tree, ...e.where.map((x) => x.tree)].map((tr) => spread(tr, bind, 1e-6 * scale)));
    t.ok(w <= TOL, () => `${label}: ${e.id} sides differ by ${w.toExponential(2)}`);
    return w;
  };
  {
    const rnd = mulberry32(20261116);
    const kinds = ['microstrip', 'pair-microstrip', 'embedded', 'pair-microstrip', 'stripline', 'pair-microstrip', 'cpwg', 'pair-microstrip'];
    let solved = 0, inv = 0;
    for (let n = 0; n < 240; n++) {
      const sk = P.presetStackup(P.PRESET_IDS[Math.floor(rnd() * P.PRESET_IDS.length)]);
      const kind = kinds[n % kinds.length];
      const st = ST.presetStructure(kind, sk, 0.06 + rnd() * 0.3);
      if (!st) continue;
      const setup = { ...def, stackup: sk, trace: st };
      const r = LN.solveSetup(setup, { M: 2 });
      if (!r.ok) continue;
      solved++;
      const cfs = CF.closedForms(setup);
      const field = r.n === 2 ? r.pair.zdiff.v : r.lines[0].z0.v;
      const cf = cfs.results.find((x) => Number.isFinite(r.n === 2 ? x.values.zdiff : x.values.z0));
      let inverse = null;
      if (inv < RANDOM_CASES + 10 && n % 2 === 0) { inverse = IN.inverse(setup, r.n === 2 ? 'zdiff' : 'z0', field * (0.85 + 0.3 * rnd()), 'w', { M: 1, tol: 1e-12 }); inv++; }
      const b = EV.emBinding({ result: r, kind, reduced: cfs.reduced, formula: cf ? { value: r.n === 2 ? cf.values.zdiff : cf.values.z0, field } : undefined, inverse, f: 1e9 + rnd() * 3e10, ell: 0.01 + rnd() * 0.2 });
      for (const e of E) {
        if (e.on !== 'trace' || !e.live || DEFAULT_ONLY.includes(e.id)) continue;
        if (!(e.applies === 'any' || (e.applies === 'line') === (r.n === 1))) continue;
        const bind = EQ.bindingFor(e, b);
        if (!bind) continue;
        bump(e.id);
        const w = evalEntry(e, bind, `random trace ${n} (${kind})`);
        if (w > worstTrace) { worstTrace = w; worstTraceAt = e.id; }
      }
    }
    const low = E.filter((e) => e.on === 'trace' && e.live && !DEFAULT_ONLY.includes(e.id) && !((count[e.id] ?? 0) >= RANDOM_CASES)).map((e) => `${e.id} ${count[e.id] ?? 0}`);
    t.ok(low.length === 0, () => `every trace entry on at least ${RANDOM_CASES} random setups (short: ${low.join(', ')})`);
    t.note(`trace entries: ${solved} random setups (M = 2), ${E.filter((e) => count[e.id] && e.on === 'trace').length} entries on ${Math.min(...Object.values(count))}–${Math.max(...Object.values(count))} each, worst ${worstTrace.toExponential(2)} (${worstTraceAt}); ${DEFAULT_ONLY.join(', ')} on the default cases (check-equations.mjs)`);
  }

  // ---- 4. the via entries against the engine: the named vias and random ones ----
  const viaCount = {};
  let worstVia = 0, worstViaAt = '';
  const viaEntries = E.filter((e) => e.on === 'via' && e.live && e.id !== 'via-target');
  const checkVia = (label, model, via, ctx = {}) => {
    const b = EVV.viaBinding({ model, via, ...ctx });
    for (const e of viaEntries) {
      if (!(e.applies === 'any' || (e.applies === 'line') === (model.n === 1))) continue;
      const bind = EQ.bindingFor(e, b);
      if (!bind) continue;
      viaCount[e.id] = (viaCount[e.id] ?? 0) + 1;
      const w = evalEntry(e, bind, label);
      if (w > worstVia) { worstVia = w; worstViaAt = e.id; }
    }
    // identities of notes-M4.1.md
    if (model.n === 1 && model.wall.kind === 'equivalent') t.near(model.lumped.lineC + model.lumped.dCsum, model.axiTotal, `${label}: C_line + ΣΔC = axiTotal`, 1e-12);
    for (const s of model.stubs) t.near(s.fFormula, 1 / (4 * s.delay), `${label}: stub fFormula = 1/(4τ)`, 1e-15);
    if (model.n === 2 && model.nport) { const m = NP.toMixedMode(model.nport); let w = 0; for (let k = 0; k < m.s.length; k++) w = Math.max(w, Math.abs(m.s[k] - model.mixed.s[k])); t.ok(w <= 1e-12, `${label}: mixed = toMixedMode(nport) (${w})`); }
    if (model.tdr) { const td = model.tdr; let w = 0; for (let k = 0; k < td.z.length; k += 7) w = Math.max(w, Math.abs(td.z[k] - td.zRef * (1 + td.rho[k]) / (1 - td.rho[k])) / td.z[k]); t.ok(w <= 1e-12, `${label}: tdr.z = zRef(1 + ρ)/(1 − ρ) (${w.toExponential(2)})`); }
    if (model.nport) t.near(model.nport.f[model.nport.f.length - 1], TD.edgeFrequency(model.tr, EVV.SWEEP_LEVEL), `${label}: the sweep ends where the edge is at −60 dB`, 1e-12);
    return b;
  };
  const su = def, sk = su.stackup;
  const named = {
    V: { ...su }, VP: { ...kindAt(su, 'pair-microstrip', 0.11), via: V.presetVia('pair', sk) },
    E: { ...su, via: { ...su.via, exit: 'L3', feeds: su.via.feeds.filter((f) => f.layer === 'L1') } },
  };
  named.Eb = { ...named.E, via: { ...named.E.via, backdrill: { side: 'bottom', depth: S.val(1.2), d: S.val(0.5) } } };
  const models = {};
  for (const [name, x] of Object.entries(named)) {
    const m = VM.viaModel(x.stackup, x.via, x.trace);
    models[name] = m;
    if (!t.ok(m.ok, `${name}: the via model solves (${m.reason})`)) continue;
    for (let pi = 0; pi < m.pieces.length; pi++) checkVia(`${name} piece ${pi}`, m, x.via, { piece: pi, node: pi % m.nodes.length, fIndex: (pi * 37) % m.nport.f.length });
  }
  // V's numbers of theory-vias.md (notes-M4.1.md): the thin-wire estimate against the solver
  if (models.V.ok) {
    const bV = EVV.viaBinding({ model: models.V, via: named.V.via, piece: models.V.pieces.findIndex((p) => p.er === 4.55) });
    t.ok(Math.abs(bV.Z_qc - 60.84) <= 0.005 && Math.abs(bV.Z_i - 59.71) <= 0.005, `V: thin wires 60.84 Ω against the solver's 59.71 Ω (${bV.Z_qc}, ${bV.Z_i})`);
    t.ok(Math.abs(bV.D * 1e3 / 2 - 1.255) <= 0.0005, `V: R_eq 1.255 mm (${bV.R_eq})`);
  }
  {
    const rnd = mulberry32(4220261116);
    let tried = 0, solved = 0, targets = 0;
    const ids = P.PRESET_IDS;
    for (let n = 0; n < 400 && (solved < 2 * RANDOM_CASES + 40 || targets < RANDOM_CASES); n++) {
      const pair = n % 2 === 1;
      const skr = P.presetStackup(ids[Math.floor(rnd() * ids.length)]);
      let via = V.presetVia(pair ? 'pair' : 'single', skr);
      if (!via) continue;
      tried++;
      const copper = skr.layers.filter((l) => l.kind === 'copper' && !via.planes.includes(l.id)).map((l) => l.id);
      const drill = 0.15 + rnd() * 0.2;
      const padD = drill + 0.15 + rnd() * 0.3;
      via = { ...via, drill: S.val(drill), pads: via.pads.map((p) => (p.d ? { ...p, d: S.val(padD) } : p)) };
      via = VM.withAntipad(via, padD + 0.25 + rnd() * 0.8);
      via = VM.withReturnDistance(via, Math.max(...via.antipads.map((a) => a.d.v / 2)) + 0.25 + rnd() * 0.8);
      if (rnd() < 0.5 && copper.length > 2) { const ex = copper[1 + Math.floor(rnd() * (copper.length - 1))]; via = { ...via, exit: ex }; }
      via = { ...via, feeds: [{ layer: via.entry, length: S.val(1 + rnd() * 4), angle: 180 }, { layer: via.exit, length: S.val(1 + rnd() * 4), angle: 0 }] };
      const trace = ST.presetStructure(pair ? 'pair-microstrip' : 'microstrip', skr, 0.08 + rnd() * 0.15);
      const tr = (15 + rnd() * 65) * 1e-12;
      let m = VM.viaModel(skr, via, trace, { tr, nf: 41 });
      if (!m.ok) m = VM.viaModel(skr, via, null, { tr, nf: 41 });
      if (!m.ok) continue;
      solved++;
      checkVia(`random via ${n}${pair ? ' (pair)' : ''}`, m, via, {
        piece: Math.floor(rnd() * m.pieces.length), node: ((ks) => ks[Math.floor(rnd() * ks.length)])(m.nodes.map((x, k) => (x.dC ? k : -1)).filter((k) => k >= 0)), fIndex: 1 + Math.floor(rnd() * 40),
        tIndex: m.tdr ? Math.floor(rnd() * m.tdr.z.length) : undefined, feed: Math.floor(rnd() * Math.max(1, m.feeds.length)),
      });
      if (!pair && targets < RANDOM_CASES && m.lumped) {
        const tg = VM.viaTarget(skr, via, null, 'z', m.lumped.z * (0.93 + 0.14 * rnd()), 'antipad', { tol: 1e-12, nf: 9, tdr: false });
        if (tg.reached) {
          targets++;
          const e = byId.get('via-target'), bind = EQ.bindingFor(e, EVV.viaBinding({ model: m, via, target: tg }));
          if (t.ok(!!bind, 'via-target bound when reached')) { viaCount[e.id] = (viaCount[e.id] ?? 0) + 1; evalEntry(e, bind, `random via ${n} target`); }
          t.near(tg.model.lumped.z, tg.value, `random via ${n}: the target's value is its model's section`, 1e-12);
        }
      }
    }
    const low = E.filter((e) => e.on === 'via' && e.live && !((viaCount[e.id] ?? 0) >= RANDOM_CASES)).map((e) => `${e.id} ${viaCount[e.id] ?? 0}`);
    t.ok(low.length === 0, () => `every via entry on at least ${RANDOM_CASES} cases (short: ${low.join(', ')})`);
    t.note(`via entries: ${solved} of ${tried} random vias solved (single and pair, random drill, pads, antipads, returns, exit, feeds, rise time, cursor), ${targets} targets; per entry ${Math.min(...Object.values(viaCount))}–${Math.max(...Object.values(viaCount))} cases; worst ${worstVia.toExponential(2)} (${worstViaAt})`);
  }

  // ---- 5. the examples ----
  checkExamples(t, { def, kindAt, withTrace, models });
}

function checkExamples(t, { def, kindAt, withTrace }) {
  const pair = withTrace(kindAt(def, 'pair-microstrip', 0.11), (tr) => { tr.s = S.val(0.2); });
  const feeds = (s, len) => ({ ...s, via: { ...s.via, feeds: s.via.feeds.map((f) => ({ ...f, length: S.val(len) })) } });
  const viaP = { ...pair, via: V.presetVia('pair', pair.stackup) };
  const stub = { ...def, via: { ...def.via, exit: 'L3', feeds: def.via.feeds.filter((f) => f.layer === 'L1') } };
  const R = {
    'ex-microstrip/stackup': def, 'ex-microstrip/w50': withTrace(def, (tr) => { tr.w = S.val(0.1465); }), 'ex-microstrip/calc': J.asJlcpcbCalculator(def).setup,
    'ex-lvds-pair/pair': pair, 'ex-lvds-pair/w100': withTrace(pair, (tr) => { tr.w = S.val(0.1191); }), 'ex-lvds-pair/calc': J.asJlcpcbCalculator(pair).setup,
    'ex-via-pair/via': viaP, 'ex-via-pair/long': feeds(viaP, 25),
    'ex-jlcpcb-widths/stackup': def, 'ex-jlcpcb-widths/calc': J.asJlcpcbCalculator(def).setup,
    ...Object.fromEntries(J.JLC_PARTS.map((p) => [`ex-jlcpcb-widths/${p}`, J.jlcAllBut(def, p)])),
    'ex-via-stub/through': feeds(def, 25), 'ex-via-stub/stub': stub,
    'ex-via-stub/backdrill': { ...stub, via: { ...stub.via, backdrill: { side: 'bottom', depth: S.val(1.2), d: S.val(0.5) } } },
  };
  const cache = new Map();
  const memo = (k, f) => { if (!cache.has(k)) cache.set(k, f()); return cache.get(k); };
  // S at exactly 10 GHz from the model's chain (the page's cursor), mixed-mode for a pair
  const dB10 = (m, mixed, i, j) => { const P = 2 * m.n; let s = VM.cascadeS(m.elements, m.n, [10e9], m.z0); if (mixed) s = NP.mixedS(s, P, 1, [[0, 1], [2, 3]]); const o = 2 * (i * P + j); return 20 * Math.log10(Math.hypot(s[o], s[o + 1])); };
  const layerEr = (s, id) => s.stackup.layers.find((l) => l.id === id).er.v;
  const pieceIn = (m, s, id) => m.pieces.filter((p) => p.er === layerEr(s, id)).sort((a, b) => (b.zTop - b.zBot) - (a.zTop - a.zBot))[0];
  // the via's dip: the lowest point within 100 ps of the round trip to the via (after the step has entered the feed)
  const tdrMin = (td, m) => { const f = m.feeds[0], tv = f ? 2 * f.length * 1e-3 * Math.sqrt(f.eeff) / 299792458 : 0; let k = -1; for (let i = 0; i < td.z.length; i++) if (td.t[i] >= Math.max(tv - 100e-12, tv / 2) && td.t[i] <= tv + 100e-12 && (k < 0 || td.z[i] < td.z[k])) k = i; return k; };
  function value(key, name, s) {
    const res = () => memo(`${name}:res`, () => LN.solveSetup(s, { M: 2 }));
    const vm = (tr) => memo(`${name}:vm:${tr}`, () => VM.viaModel(s.stackup, s.via, s.trace, tr ? { tr } : {}));
    const mode = (lab) => res().modes.find((x) => (lab === 'odd' ? ['odd', 'π'] : ['even', 'c']).includes(x.label));
    let m;
    if ((m = key.match(/^inverse\((\w+),(\d+),w\)\.w(\.mil)?$/))) { const w = memo(`${name}:${key.replace('.mil', '')}`, () => IN.inverse(s, m[1], +m[2], 'w')).w; return m[3] ? w / 0.0254 : w; }
    if ((m = key.match(/^viaTarget\((\w+),(\d+),antipad\)\.(\w+)(?:\[(\d)\])?$/))) { const r = memo(`${name}:vt:${m[1]}:${m[2]}`, () => VM.viaTarget(s.stackup, s.via, s.trace, m[1], +m[2], 'antipad')); return m[4] ? r[m[3]][+m[4]] : r[m[3]]; }
    if ((m = key.match(/^calc\.(parts\.(\w+)|sum|total)$/))) { const c = memo(`${name}:calc`, () => EV.calculatorParts(s)); return m[2] ? c.parts[m[2]] : m[1] === 'sum' ? J.JLC_PARTS.reduce((a, p) => a + c.parts[p], 0) : c.stackup - c.calculator; }
    if ((m = key.match(/^pieces\[(\w+)\]\.(\w+)$/))) return pieceIn(vm(), s, m[1])[m[2]];
    if ((m = key.match(/^lumped\.(\w+)$/))) { const x = vm().lumped[m[1]]; return m[1] === 'delay' ? x * 1e12 : ['dCsum', 'lineC'].includes(m[1]) ? x * 1e15 : x; }
    if ((m = key.match(/^tdr(\d*)\.(min|max|flat)$/))) {
      const mm = vm(m[1] ? +m[1] * 1e-12 : 0), td = mm.tdr, k = tdrMin(td, mm);
      if (m[2] === 'min') return td.z[k];
      if (m[2] === 'max') { let x = -Infinity; for (let i = 0; i < td.z.length; i++) if (Math.abs(td.t[i] - td.t[k]) <= 50e-12) x = Math.max(x, td.z[i]); return x; }
      const feed = vm().feeds[0]; const tf = td.t[k] - feed.length * 1e-3 * Math.sqrt(feed.eeff) / 299792458;
      return td.z[EVV.nearestIndex(td.t, tf)];
    }
    if ((m = key.match(/^(mixed|S)\.dB\((\d),(\d)\)@10GHz$/))) return dB10(vm(), m[1] === 'mixed', +m[2], +m[3]);
    if ((m = key.match(/^stubs\[long\]\.(\w+)$/))) { const x = [...vm().stubs].sort((a, b) => b.length - a.length)[0][m[1]]; return m[1] === 'delay' ? x * 1e12 : m[1].startsWith('f') ? x / 1e9 : x; }
    if (key === 'band') return vm().band / 1e9;
    if ((m = key.match(/^nodes\[(\w+)\]\.dC$/))) return vm().nodes.find((x) => x.layer === m[1]).dC * 1e15;
    if (key === 'lone.z0') return memo('lone', () => LN.solveSetup(kindAt(s, 'microstrip', s.trace.w.v), { M: 2 })).lines[0].z0.v;
    if ((m = key.match(/^modes\.(odd|even)\.(eeff|delay)$/))) { const x = mode(m[1]); return m[2] === 'eeff' ? x.eeff.v : x.delay.v * 1e9; }
    if ((m = key.match(/^Zc\[(\d)\]\[(\d)\]$/))) return res().Zc[+m[1]][+m[2]];
    if ((m = key.match(/^lines\[0\]\.(\w+)(\.e)?$/))) { const x = res().lines[0][m[1]]; return m[2] ? x.e : m[1] === 'delay' ? x.v * 1e9 : x.v; }
    if ((m = key.match(/^pair\.(\w+)(\.e)?$/))) { const x = res().pair[m[1]]; return m[2] ? x.e : x.v; }
    throw new Error(`no resolver for ${key}`);
  }
  let links = 0, values = 0;
  for (const ex of EX.EXAMPLES) {
    for (const ln of ex.links) {
      const k = `${ex.id}/${ln.name}`, s = R[k];
      if (!t.ok(!!s, `${k}: a recipe`)) continue;
      links++;
      t.ok(ln.link.startsWith(EX.EXAMPLE_PATH), `${k}: the link opens the EM page`);
      const q = ln.link.slice(EX.EXAMPLE_PATH.length);
      t.eq(q, L.encodeLink(s), `${k}: the link is encodeLink of its recipe`);
      const dec = L.decodeLink(q);
      t.ok(dec.issues.length === 0 && SU.sameSetup(dec.setup, s), () => `${k}: decodes with no issues to its setup (${dec.issues.map((i) => i.message ?? i).join('; ')})`);
    }
    for (const st of ex.steps) for (const x of st.values) {
      const k = x.link.includes('/') ? x.link : `${ex.id}/${x.link}`;
      const s = R[k];
      if (!t.ok(!!s, `${ex.id}: the value ${x.key} names a link (${k})`)) continue;
      let got;
      try { got = value(x.key, k, s); } catch (e) { t.ok(false, `${ex.id}: ${x.key}: ${e.message}`); continue; }
      values++;
      t.ok(Math.abs(got - x.value) <= 0.5 * 10 ** -x.digits * (1 + 1e-9), () => `${ex.id} ${k} ${x.key}: engine ${got} against ${x.value} ${x.unit} (${x.digits} decimals)`);
    }
    t.ok(ex.topics.length > 0 && ex.steps.length > 0 && ex.intro.length > 0, `${ex.id}: intro, steps and topics`);
  }
  t.note(`examples: ${EX.EXAMPLES.length}, ${links} links (encodeLink of each recipe, decoded with no issues), ${values} quoted numbers equal to the engine to the decimals shown`);
}
