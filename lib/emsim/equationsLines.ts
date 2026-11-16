// The 33 equations of the EM theory's trace topics (step M2.4b; moved here from equations.ts in step M4.2, which added
// their derivation steps from docs/em-sim/equations-list.md). Text form and steps: lib/equations/parse.ts. Assembled,
// parsed and checked in equations.ts; the harness (scripts/harness/emsim/check-equations.mjs, check-teach.mjs) checks
// every entry against the engine and every step on random values.

import { QUASI_TEM, SYM_PAIR, src, sym } from './equationsDef';
import type { Def, EmObject } from './equationsDef';
import type { SymbolInfo } from '../equations/equation';

const DEFS: Def[] = [
  // Transmission lines and quasi-TEM (theory.md topic 1).
  { id: 'telegraph', title: 'Telegrapher’s equations', topic: 'transmission-lines', text: '-dV/dz = L*dI/dt', where: ['-dI/dz = C*dV/dt'], live: false, derivation: 'A short piece of line as a series L and a shunt C per unit length.', assumptions: [QUASI_TEM, 'lossless line'], engine: 'none (a definition)' },
  { id: 'z0-lc', title: 'Characteristic impedance from L and C', topic: 'transmission-lines', text: 'Z_0 = sqrt(L/C)', applies: 'line', sources: [src('Ellingson2018', '§3.12')], assumptions: [QUASI_TEM, 'lossless line'], engine: 'lines.linesOf: lines[0].z0 against bem.L, bem.C' },
  { id: 'delay-lc', title: 'Delay per unit length', topic: 'transmission-lines', text: 'tau = sqrt(L*C) = 1/v', applies: 'line', derivation: 'The speed 1/√(LC) of the telegrapher’s equations.', assumptions: [QUASI_TEM], engine: 'lines.linesOf: lines[0].delay' },
  { id: 'eeff-c', title: 'Effective permittivity', topic: 'transmission-lines', text: 'varepsilon_eff = C/C_0', derivation: 'The definition: the line as if in one uniform material.', assumptions: [QUASI_TEM], engine: 'lines.linesOf: lines[0].eeff = C_kk/C0_kk' },
  { id: 'l-c0', title: 'Inductance from the vacuum capacitance', topic: 'transmission-lines', text: 'L = mu_0*varepsilon_0/C_0', applies: 'line', sources: [src('Paul2008', '')], assumptions: [QUASI_TEM, 'non-magnetic materials'], engine: 'bem2d.solveBoundary: L = µ₀ε₀·C0⁻¹' },
  { id: 'v-eeff', title: 'Speed on the line', topic: 'transmission-lines', text: 'v = c_0/sqrt(varepsilon_eff)', sources: [src('Ellingson2018', '§3.11')], assumptions: [QUASI_TEM], engine: 'lines.linesOf: 1/lines[0].delay' },
  { id: 'lambda-eeff', title: 'Wavelength on the line', topic: 'transmission-lines', text: 'lambda = lambda_0/sqrt(varepsilon_eff)', where: ['lambda_0 = c_0/f'], sources: [src('Ellingson2018', '§3.11')], assumptions: [QUASI_TEM], engine: 'lines.linesOf: v/f' },
  { id: 'getsinger', title: 'Dispersion of microstrip (Getsinger)', topic: 'transmission-lines', text: 'varepsilon_f = varepsilon_r - (varepsilon_r - varepsilon_eff)/(1 + G*(f/f_p)^2)', where: ['f_p = Z_0/(2*mu_0*h)', 'G = 0.6 + 0.009*Z_ohm'], applies: 'line', sources: [src('QucsTech', '§11.1'), src('Getsinger1973', '')], assumptions: ['microstrip', 'an estimate: the solver is static'], engine: 'eqvalues.getsinger on lines[0] and closedForms(setup).reduced' },
  { id: 'getsinger-limit', title: 'Where dispersion reaches the solver’s error', topic: 'transmission-lines', text: 'f_lim = f_p*sqrt(x)', where: ['x = delta*varepsilon_eff/(G*(varepsilon_r - varepsilon_eff - delta*varepsilon_eff))', 'delta = e_eff/varepsilon_eff'], extra: '\\text{(the frequency at which the rise equals the error)}', applies: 'line', derivation: 'Getsinger’s εeff(f) − εeff set equal to the error δ·εeff and solved for f.', assumptions: ['microstrip'], engine: 'eqvalues.getsingerLimit; getsinger at f_lim rises by δ' },
  // The field solver (topic 2).
  { id: 'charge-potential', title: 'Charge and potential', topic: 'field-solver', text: 'Q_vec = C_mat*V_vec', extra: 'C_{ij} \\le 0\\ (i \\ne j)', live: false, sources: [src('Paul2008', '')], assumptions: ['per unit length', 'Maxwell capacitance matrix'], engine: 'bem2d.solveBoundary: C' },
  { id: 'error-shown', title: 'The error shown', topic: 'field-solver', text: 'e = 1.5*D_X', extra: '\\text{(differences shrinking at least twofold; the full rule in solver.md, section 2.6)}', derivation: 'Richardson’s estimate with a safety factor of 1.5, at least a quarter of the coarser difference (bem2d.estimateOf).', assumptions: ['the last two differences shrink at least twofold, with one sign'], engine: 'bem2d.estimateOf on eqvalues.levelSeries' },
  { id: 'order', title: 'Observed order', topic: 'field-solver', text: 'p = ln(abs(X_M2 - X_M4)/abs(X_M - X_M2))/ln(2)', extra: '\\text{regular when } 0.8 \\le p \\le 4', derivation: 'Two differences of three levels halving the panel size (bem2d.estimateOf).', engine: 'bem2d.estimateOf(…).order on eqvalues.levelSeries' },
  // Pairs (topic 3).
  { id: 'mixed-mode-vars', title: 'Mixed-mode voltages and currents', topic: 'pairs', text: 'V_d = V_1 - V_2', where: ['I_d = (I_1 - I_2)/2', 'V_c = (V_1 + V_2)/2', 'I_c = I_1 + I_2'], applies: 'pair', live: false, sources: [src('BockelmanEisenstadt1995', '')], engine: 'none (a definition)' },
  { id: 'zodd-sym', title: 'Odd-mode impedance', topic: 'pairs', text: 'Z_odd = sqrt((L_11 - L_12)/(C_11 - C_12))', applies: 'pair', assumptions: [SYM_PAIR, QUASI_TEM], engine: 'lines.linesOf: pair.zodd = Zdd/2' },
  { id: 'zeven-sym', title: 'Even-mode impedance', topic: 'pairs', text: 'Z_even = sqrt((L_11 + L_12)/(C_11 + C_12))', applies: 'pair', assumptions: [SYM_PAIR, QUASI_TEM], engine: 'lines.linesOf: pair.zeven = 2·Zcc' },
  { id: 'zdiff-zodd', title: 'Differential and common-mode impedance', topic: 'pairs', text: 'Z_diff = 2*Z_odd', where: ['Z_cm = Z_even/2'], applies: 'pair', assumptions: [SYM_PAIR], engine: 'lines.linesOf: pair.zdiff, pair.zcm' },
  { id: 'zdd-zc', title: 'Differential impedance from Zc', topic: 'pairs', text: 'Z_diff = Z_c11 + Z_c22 - 2*Z_c12', applies: 'pair', engine: 'lines.levelValues: zdiff' },
  { id: 'zcc-zc', title: 'Common-mode impedance from Zc', topic: 'pairs', text: 'Z_cm = (Z_c11 + Z_c22 + 2*Z_c12)/4', applies: 'pair', engine: 'lines.levelValues: zcm' },
  { id: 'zdc-zc', title: 'Mixed-mode impedance Zdc', topic: 'pairs', text: 'Z_dc = (Z_c11 - Z_c22)/2', applies: 'pair', engine: 'lines.levelValues: zdc' },
  { id: 'zdiff-b', title: 'Definition B (voltage drive)', topic: 'pairs', text: 'Z_diffB = 4/(Y_c11 + Y_c22 - 2*Y_c12)', where: ['Z_cmB = 1/(Y_c11 + Y_c22 + 2*Y_c12)'], applies: 'pair', engine: 'lines.levelValues: zdiffB, zcmB' },
  { id: 'ztdr', title: 'What a differential TDR shows', topic: 'pairs', text: 'Z_TDR = Z_dd - Z_dc^2/(Z_cc + R_TDR)', applies: 'pair', derivation: 'notes-M0.2e.md item 2: two 50 Ω sources, 25 Ω in common mode.', engine: 'lines.levelValues: ztdr' },
  { id: 'kb', title: 'Backward coupling', topic: 'pairs', text: 'k_b = (C_m/C_11 + L_m/L_11)/4', where: ['C_m = -C_12', 'L_m = L_12'], applies: 'pair', sources: [src('Paul2008', ''), src('Bogatin2018', '')], assumptions: [SYM_PAIR, 'weak coupling'], engine: 'lines.levelValues: kb' },
  { id: 'kf', title: 'Forward coupling', topic: 'pairs', text: 'k_f = (C_m/C_11 - L_m/L_11)/(2*v_c)', where: ['v_c = 1/sqrt(L_11*C_11)'], applies: 'pair', sources: [src('Paul2008', ''), src('Bogatin2018', '')], assumptions: [SYM_PAIR, 'weak coupling'], engine: 'lines.levelValues: kf (s/m)' },
  { id: 'fext-pulse', title: 'Far-end crosstalk of a step', topic: 'pairs', text: 'V_FEXT = k_f*ell*V_r/t_r', applies: 'pair', assumptions: ['weak coupling', 'a linear ramp of V_r in t_r', 'matched ends'], engine: 'pair.kf with ℓ = 100 mm, 1 V in 100 ps' },
  { id: 'eeff-mode', title: 'Effective permittivity of a mode', topic: 'pairs', text: 'varepsilon_effm = (c_0/v_m)^2', applies: 'pair', engine: 'lines.linesOf: modes[m].eeff, modes[m].v' },
  { id: 'mode-skew', title: 'Skew between the modes', topic: 'pairs', text: 'Delta_tau = (tau_even - tau_odd)*ell', applies: 'pair', engine: 'lines.linesOf: modes[m].delay' },
  // Calculators (topic 5).
  { id: 'pct-diff', title: 'Difference of a closed form', topic: 'calculators', text: 'Delta = (X_formula - X_field)/X_field', engine: 'closedform.closedForms(setup).results[i].values against lines[0].z0 or pair.zdiff' },
  { id: 'parts-sum', title: 'The calculator’s inputs by parts', topic: 'calculators', text: 'Delta_Z = Z_stackup - Z_calc', where: ['Delta_sum = Delta_er + Delta_cu + Delta_etch + Delta_mask'], extra: '\\Delta Z \\approx \\textstyle\\sum_\\mathrm{part}\\Delta_\\mathrm{part},\\quad \\Delta_\\mathrm{part} = Z(\\text{calculator, part as stackup}) - Z(\\text{calculator})', derivation: 'Each part changed alone from the calculator’s inputs; the sum leaves out how the parts interact.', engine: 'eqvalues.calculatorParts (jlcCalc.asJlcpcbCalculator, jlcAllBut, solved)' },
  // Tolerances (topic 6).
  { id: 'sens', title: 'Sensitivity to one input', topic: 'tolerances', text: 'd_i = (Z_plus - Z_minus)/2', engine: 'vary.corners: inputs[i].d[key]' },
  { id: 'share', title: 'Share of the spread', topic: 'tolerances', text: 's_i = d_i^2/S_d', extra: 'S_d = \\textstyle\\sum_j d_j^2', engine: 'components/EmSim/tools.shares' },
  { id: 'corners', title: 'Worst-case corners', topic: 'tolerances', text: 'Z_hi = Z_hiat', where: ['Z_lo = Z_loat'], engine: 'vary.corners: corners[0].lo, hi' },
  { id: 'rss-sigma', title: 'Spread from the ranking', topic: 'tolerances', text: 'sigma = sqrt(S_d)/3', assumptions: ['independent inputs, each normal with σ = t/3', 'linear response'], engine: 'vary.corners (ranking) against vary.monteCarlo stats sd' },
  { id: 'mc-normal', title: 'How Monte Carlo draws an input', topic: 'tolerances', text: 'sigma_i = t_i/3', extra: 'x_i \\sim \\mathcal N\\big(\\bar x_i, \\sigma_i^2\\big),\\ \\lvert x_i - \\bar x_i\\rvert \\le t_i', engine: 'vary.monteCarlo (normal, redrawn beyond the limit)' },
];

// Derivation steps (equations-list.md): each an equality in the text form, then its reason (maths between backticks).
// Every step's sides are checked equal on random values that satisfy the entry's assumptions (check-teach.mjs).
const STEPS: Record<string, [string, string][]> = {
  'z0-lc': [
    ['-dV/dz = j*omega*L*I', 'the first telegrapher’s equation for phasors at angular frequency `omega`'],
    ['-dI/dz = j*omega*C*V', 'the same for the current'],
    ['V = V_p*exp(-j*beta*z)', 'a wave travelling towards larger `z`, with `I = I_p*exp(-j*beta*z)`'],
    ['beta*V_p = omega*L*I_p', 'step 1 on that wave'],
    ['beta = omega*sqrt(L*C)', 'steps 1 and 2 together'],
    ['Z_0 = V_p/I_p = omega*L/beta = sqrt(L/C)', 'the wave’s voltage over its current'],
  ],
  'delay-lc': [
    ['v = omega/beta = 1/sqrt(L*C)', 'the speed of a phase, with `beta = omega*sqrt(L*C)`'],
    ['tau = 1/v = sqrt(L*C)', 'the delay per unit length is the inverse of the speed'],
  ],
  'l-c0': [
    ['1/sqrt(L*C_0) = c_0', 'in vacuum the line is TEM and its wave travels at the speed of light'],
    ['L = 1/(c_0^2*C_0) = mu_0*varepsilon_0/C_0', 'L does not depend on non-magnetic dielectrics (for several conductors, the inverse of the matrix)'],
  ],
  'v-eeff': [
    ['L*C = mu_0*varepsilon_0*C/C_0', '`L = mu_0*varepsilon_0/C_0`'],
    ['L*C = varepsilon_eff/c_0^2', '`varepsilon_eff = C/C_0` and `mu_0*varepsilon_0 = 1/c_0^2`'],
    ['v = 1/sqrt(L*C) = c_0/sqrt(varepsilon_eff)', 'the speed of the telegrapher’s equations'],
  ],
  'lambda-eeff': [
    ['lambda = v/f = c_0/(f*sqrt(varepsilon_eff))', 'one period travels one wavelength'],
    ['lambda = lambda_0/sqrt(varepsilon_eff)', 'with `lambda_0 = c_0/f`'],
  ],
  'getsinger-limit': [
    ['varepsilon_f - varepsilon_eff = (varepsilon_r - varepsilon_eff)*y/(1 + y)', 'Getsinger’s rise, with `y = G*(f/f_p)^2`'],
    ['(varepsilon_r - varepsilon_eff)*y/(1 + y) = delta*varepsilon_eff', 'the rise equals the error'],
    ['y = delta*varepsilon_eff/(varepsilon_r - varepsilon_eff - delta*varepsilon_eff)', 'solved for y'],
    ['f_lim = f_p*sqrt(y/G) = f_p*sqrt(x)', 'with x as the entry writes it'],
  ],
  'error-shown': [
    ['X_M = X + k*h_M^p', 'the error of order p at panel size `h_M`'],
    ['X_M2 - X_M = k*h_M^p*(2^p - 1)', 'the coarser level has panels twice as large'],
    ['X_M - X = (X_M2 - X_M)/(2^p - 1)', 'at most the difference when p is at least 1; the factor 1.5 is a margin'],
  ],
  order: [
    ['X_M4 - X_M2 = 2^p*(X_M2 - X_M)', 'the same at panels `2*h_M` and `4*h_M`'],
    ['p = ln(abs(X_M2 - X_M4)/abs(X_M - X_M2))/ln(2)', 'solved for p'],
  ],
  'zodd-sym': [
    ['V_2 = -V_1', 'the odd mode of a symmetric pair, with `I_2 = -I_1`'],
    ['Q_1 = C_11*V_1 + C_12*V_2 = (C_11 - C_12)*V_1', 'row 1 of `Q_vec = C_mat*V_vec`'],
    ['Psi_1 = L_11*I_1 + L_12*I_2 = (L_11 - L_12)*I_1', 'the flux likewise'],
    ['Z_odd = sqrt((L_11 - L_12)/(C_11 - C_12))', '`Z_0 = sqrt(L/C)` on the mode’s own L and C'],
  ],
  'zeven-sym': [
    ['V_2 = V_1', 'the even mode, with `I_2 = I_1`'],
    ['Q_1 = C_11*V_1 + C_12*V_2 = (C_11 + C_12)*V_1', 'row 1 of `Q_vec = C_mat*V_vec`'],
    ['Psi_1 = L_11*I_1 + L_12*I_2 = (L_11 + L_12)*I_1', 'the flux likewise'],
    ['Z_even = sqrt((L_11 + L_12)/(C_11 + C_12))', '`Z_0 = sqrt(L/C)` on the mode’s own L and C'],
  ],
  'zdiff-zodd': [
    ['V_d = V_1 - V_2 = 2*V_1', 'the odd mode, `V_2 = -V_1` and `I_2 = -I_1`'],
    ['I_d = (I_1 - I_2)/2 = I_1', 'the mixed-mode current'],
    ['Z_diff = V_d/I_d = 2*V_1/I_1 = 2*Z_odd', 'each line alone sees `Z_odd`'],
    ['V_c = (V_e + V_e)/2 = V_e', 'the even mode: both lines at `V_e`, each carrying `I_e`'],
    ['I_c = I_e + I_e = 2*I_e', 'the common current is the sum'],
    ['Z_cm = V_c/I_c = V_e/(2*I_e) = Z_even/2', 'each line alone sees `Z_even`'],
  ],
  'zdd-zc': [
    ['I_2 = -I_1 = -I_d', 'no common current'],
    ['V_1 - V_2 = Z_c11*I_1 + Z_c12*I_2 - Z_c21*I_1 - Z_c22*I_2 = (Z_c11 - Z_c12 - Z_c21 + Z_c22)*I_d', 'the rows of the impedance matrix'],
    ['Z_diff = (V_1 - V_2)/I_d = Z_c11 + Z_c22 - 2*Z_c12', 'the matrix is symmetric, `Z_c21 = Z_c12`'],
  ],
  'zcc-zc': [
    ['I_1 = I_2 = I_c/2', 'no differential current'],
    ['V_c = (V_1 + V_2)/2 = (Z_c11 + 2*Z_c12 + Z_c22)*I_c/4', 'the rows of the impedance matrix'],
    ['Z_cm = V_c/I_c = (Z_c11 + Z_c22 + 2*Z_c12)/4', 'the common voltage over the common current'],
  ],
  'zdc-zc': [
    ['I_1 = I_2 = I_c/2', 'no differential current'],
    ['V_1 - V_2 = (Z_c11 - Z_c22)*I_c/2', 'the differential voltage a common current makes'],
    ['Z_dc = (V_1 - V_2)/I_c = (Z_c11 - Z_c22)/2', 'zero for a symmetric pair'],
  ],
  'zdiff-b': [
    ['V_1 = -V_2 = V_d/2', 'a differential voltage drive'],
    ['I_d = (I_1 - I_2)/2 = (Y_c11 + Y_c22 - 2*Y_c12)*V_d/4', 'the rows of the admittance matrix, the inverse of the impedance matrix'],
    ['Z_diffB = V_d/I_d = 4/(Y_c11 + Y_c22 - 2*Y_c12)', 'the voltage over the current'],
    ['Z_cmB = V_c/I_c = 1/(Y_c11 + Y_c22 + 2*Y_c12)', 'both lines at `V_c`, so `I_c = (Y_c11 + 2*Y_c12 + Y_c22)*V_c`'],
  ],
  ztdr: [
    ['V_d = Z_dd*I_d + Z_dc*I_c', 'the mixed-mode impedances'],
    ['V_c = Z_dc*I_d + Z_cc*I_c', 'the same for the common voltage'],
    ['V_c = -R_TDR*I_c', 'the common mode of the two sources'],
    ['I_c = -Z_dc*I_d/(Z_cc + R_TDR)', 'steps 2 and 3'],
    ['Z_TDR = V_d/I_d = Z_dd - Z_dc^2/(Z_cc + R_TDR)', 'into step 1'],
  ],
  kb: [
    ['V_b = (C_m/C_11 + L_m/L_11)*V/4 = k_b*V', 'the capacitive and inductive coupled currents add towards the near end (weak coupling, matched ends)'],
  ],
  kf: [
    ['V_f = (C_m/C_11 - L_m/L_11)*ell*V_r/(2*v_c*t_r) = k_f*ell*V_r/t_r', 'towards the far end they subtract, growing with the length and the slope'],
  ],
  'fext-pulse': [
    ['dV/dt = V_r/t_r', 'a linear ramp'],
    ['V_FEXT = k_f*ell*dV/dt = k_f*ell*V_r/t_r', 'the far-end voltage grows with the slope'],
  ],
  'eeff-mode': [
    ['v_m = c_0/sqrt(varepsilon_effm)', '`v = c_0/sqrt(varepsilon_eff)` on the mode'],
    ['varepsilon_effm = (c_0/v_m)^2', 'solved for the permittivity'],
  ],
  'mode-skew': [
    ['Delta_tau = tau_even*ell - tau_odd*ell = (tau_even - tau_odd)*ell', 'each mode’s delay over the length'],
  ],
  'parts-sum': [
    ['Delta_Z = Delta_er + Delta_cu + Delta_etch + Delta_mask + Delta_rest = Delta_sum + Delta_rest', 'changing the parts one after another is exact; each part alone leaves out how they interact (`Delta_rest`)'],
  ],
  sens: [
    ['Z_plus - Z_minus = 2*Z_d*t_i', 'to first order in `t_i` (the even terms cancel), with `Z_d` the slope'],
    ['d_i = (Z_plus - Z_minus)/2 = Z_d*t_i', 'half the difference'],
  ],
  'rss-sigma': [
    ['Z - Z_n = d_1*u_1 + d_2*u_2', 'linear in the inputs (and so on for more), with `u_i = (x_i - x_bar)/t_i`'],
    ['sigma_u = 1/3', 'each input drawn with `sigma_i = t_i/3`'],
    ['sigma^2 = (d_1^2 + d_2^2)*sigma_u^2 = S_d/9', 'independent inputs: the variances add'],
    ['sigma = sqrt(S_d)/3', 'the square root'],
  ],
};

/** The 33 entries with their steps. */
export const LINE_DEFS: Def[] = DEFS.map((d) => (STEPS[d.id] ? { ...d, steps: STEPS[d.id] } : d));

/** Meanings of the names only the trace's derivation steps use. */
export const STEP_SYMBOLS: Readonly<Record<string, SymbolInfo<EmObject>>> = {
  omega: sym('angular frequency 2πf', 'rad/s', 'drive'),
  z: sym('position along the line', 'm', 'derivation'),
  V_p: sym('amplitude of the wave travelling towards larger z', 'V', 'derivation'),
  I_p: sym('current of that wave', 'A', 'derivation'),
  beta: sym('phase constant', 'rad/m', 'derivation'),
  y: sym('Getsinger’s G·(f/f_p)²', '', 'formula'),
  X: sym('the exact value the levels approach', '', 'solver'),
  k: sym('the error’s factor', '', 'solver'),
  h_M: sym('panel size of the finest level', '', 'solver'),
  Q_1: sym('charge per unit length on line 1', 'C/m', 'pair'),
  Psi_1: sym('flux per unit length of line 1', 'Wb/m', 'pair'),
  V_e: sym('voltage of each line in the even mode', 'V', 'derivation'),
  I_e: sym('current of each line in the even mode', 'A', 'derivation'),
  Z_c21: sym('characteristic impedance matrix, element (2, 1)', 'Ω', 'pair'),
  V_b: sym('near-end crosstalk voltage', 'V', 'pair'),
  V_f: sym('far-end crosstalk voltage', 'V', 'pair'),
  Delta_rest: sym('how the parts interact: the total less the parts’ sum', 'Ω', 'calculator'),
  Z_d: sym('slope of Z in input i', 'Ω', 'tolerance'),
  Z: sym('the result at some inputs', 'Ω', 'tolerance'),
  Z_n: sym('the result at the nominal inputs', 'Ω', 'tolerance'),
  d_1: sym('sensitivity to input 1', 'Ω', 'tolerance'), d_2: sym('sensitivity to input 2', 'Ω', 'tolerance'),
  u_1: sym('input 1 in units of its tolerance', '', 'tolerance'), u_2: sym('input 2 in units of its tolerance', '', 'tolerance'),
  u_i: sym('input i in units of its tolerance', '', 'tolerance'),
  x_i: sym('input i', '', 'tolerance'), x_bar: sym('nominal value of input i', '', 'tolerance'),
  sigma_u: sym('standard deviation of each u_i', '', 'tolerance'),
};

export const STEP_TEX_NAMES: Readonly<Record<string, string>> = {
  Psi_1: '\\Psi_1', Z_c21: 'Z_{c,21}', Delta_rest: '\\Delta_\\mathrm{rest}', Z_d: "Z'", Z_n: 'Z_\\mathrm{nom}', x_bar: '\\bar x_i',
  h_M: 'h',
};
