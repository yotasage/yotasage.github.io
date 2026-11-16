// The equations the EM simulation's theory shows (step M2.4b; topics, TeX and live fields in docs/em-sim/theory.md
// and theory-2.md): 33 entries on the shared equation engine of lib/equations/ (the Smith chart has its own registry
// in lib/smith/equations.ts). Each is written as short text, parsed when this module loads, printed as TeX by the
// engine's printer (names the engine would print plainly get their TeX from TEX_NAMES) and evaluated on the numbers
// that lib/emsim/eqvalues.ts takes from the solver's results. The solver never uses these trees: they are for display,
// and the harness (scripts/harness/emsim/check-equations.mjs) evaluates every entry against the engine's numbers.
// Framework-free; no engine import (the page can print an equation without loading the solver).

import { parse, variablesOf } from '../equations/parse';
import type { Node } from '../equations/parse';
import { nameTex, substitutions, tex, valueTex } from '../equations/tex';
import type { TexOptions, TexPiece } from '../equations/tex';
import type { Binding } from '../equations/compile';
import type { Equation, Source, SymbolInfo } from '../equations/equation';

// What a symbol takes its colour from on the page.
export type EmObject =
  | 'line' | 'pair' | 'mode' | 'stackup' | 'solver' | 'drive' | 'formula' | 'calculator' | 'tolerance' | 'constant';

const sym = (meaning: string, unit: string, object: EmObject): SymbolInfo<EmObject> => ({ meaning, unit, object });

export const EM_SYMBOLS: Readonly<Record<string, SymbolInfo<EmObject>>> = {
  // one line
  Z_0: sym('characteristic impedance of the line (Zc_kk; √(L/C) for one line)', 'Ω', 'line'),
  L: sym('inductance per unit length', 'H/m', 'line'),
  C: sym('capacitance per unit length', 'F/m', 'line'),
  C_0: sym('capacitance per unit length with every dielectric replaced by vacuum', 'F/m', 'line'),
  tau: sym('delay per unit length', 's/m', 'line'),
  v: sym('speed of the wave on the line', 'm/s', 'line'),
  varepsilon_eff: sym('effective permittivity', '', 'line'),
  lambda: sym('wavelength on the line at f', 'm', 'line'),
  lambda_0: sym('wavelength in vacuum at f', 'm', 'drive'),
  f: sym('frequency', 'Hz', 'drive'),
  c_0: sym('speed of light in vacuum', 'm/s', 'constant'),
  mu_0: sym('permeability of vacuum', 'H/m', 'constant'),
  varepsilon_0: sym('permittivity of vacuum', 'F/m', 'constant'),
  // telegrapher's equations and Q = CV (not evaluated)
  V: sym('voltage on the line', 'V', 'line'),
  I: sym('current on the line', 'A', 'line'),
  dV: sym('change of the voltage', 'V', 'line'), dI: sym('change of the current', 'A', 'line'),
  dz: sym('step along the line', 'm', 'line'), dt: sym('step in time', 's', 'drive'),
  Q_vec: sym('charge per unit length on each conductor', 'C/m', 'line'),
  C_mat: sym('Maxwell capacitance matrix', 'F/m', 'line'),
  V_vec: sym('voltage on each conductor', 'V', 'line'),
  // Getsinger
  varepsilon_r: sym('εr of the laminate under the trace (the series reduction of the closed forms)', '', 'stackup'),
  h: sym('height of the trace over its plane', 'm', 'stackup'),
  varepsilon_f: sym('effective permittivity at the frequency f (Getsinger)', '', 'line'),
  f_p: sym('Getsinger’s frequency Z₀/(2µ₀h)', 'Hz', 'line'),
  G: sym('Getsinger’s factor 0.6 + 0.009·Z₀/Ω', '', 'line'),
  Z_ohm: sym('the line’s impedance in ohms (a number)', '', 'line'),
  f_lim: sym('frequency at which Getsinger’s rise of εeff equals the solver’s error of εeff', 'Hz', 'line'),
  x: sym('(f/f_p)² at that frequency', '', 'line'),
  delta: sym('relative error of εeff that the solver shows', '', 'solver'),
  e_eff: sym('error of εeff that the solver shows', '', 'solver'),
  // the solver's error
  e: sym('error shown with the main value', 'Ω', 'solver'),
  X_M: sym('main value at the finest level M', 'Ω', 'solver'),
  X_M2: sym('main value at level M/2', 'Ω', 'solver'),
  X_M4: sym('main value at level M/4', 'Ω', 'solver'),
  D_X: sym('the larger of the last difference and a quarter of the one before', 'Ω', 'solver'),
  p: sym('observed order of convergence', '', 'solver'),
  // pairs
  V_1: sym('voltage on line 1', 'V', 'pair'), V_2: sym('voltage on line 2', 'V', 'pair'),
  I_1: sym('current on line 1', 'A', 'pair'), I_2: sym('current on line 2', 'A', 'pair'),
  V_d: sym('differential voltage', 'V', 'pair'), I_d: sym('differential current', 'A', 'pair'),
  V_c: sym('common-mode voltage', 'V', 'pair'), I_c: sym('common-mode current', 'A', 'pair'),
  L_11: sym('self inductance per unit length of line 1', 'H/m', 'pair'),
  L_12: sym('mutual inductance per unit length', 'H/m', 'pair'),
  C_11: sym('capacitance per unit length of line 1 (Maxwell, with line 2 at 0 V)', 'F/m', 'pair'),
  C_12: sym('Maxwell mutual capacitance per unit length (negative)', 'F/m', 'pair'),
  Z_odd: sym('odd-mode impedance', 'Ω', 'pair'),
  Z_even: sym('even-mode impedance', 'Ω', 'pair'),
  Z_diff: sym('differential impedance (definition A, Zdd)', 'Ω', 'pair'),
  Z_cm: sym('common-mode impedance (definition A, Zcc)', 'Ω', 'pair'),
  Z_dd: sym('differential impedance Zdd', 'Ω', 'pair'),
  Z_cc: sym('common-mode impedance Zcc', 'Ω', 'pair'),
  Z_dc: sym('mixed-mode impedance Zdc (0 for a symmetric pair)', 'Ω', 'pair'),
  Z_c11: sym('entry 11 of the characteristic impedance matrix Zc', 'Ω', 'pair'),
  Z_c22: sym('entry 22 of Zc', 'Ω', 'pair'),
  Z_c12: sym('entry 12 of Zc', 'Ω', 'pair'),
  Y_c11: sym('entry 11 of the characteristic admittance matrix Yc = Zc⁻¹', 'S', 'pair'),
  Y_c22: sym('entry 22 of Yc', 'S', 'pair'),
  Y_c12: sym('entry 12 of Yc', 'S', 'pair'),
  Z_diffB: sym('differential impedance, definition B (voltage drive)', 'Ω', 'pair'),
  Z_cmB: sym('common-mode impedance, definition B', 'Ω', 'pair'),
  Z_TDR: sym('impedance a differential TDR shows', 'Ω', 'pair'),
  R_TDR: sym('common-mode source of two 50 Ω sources', 'Ω', 'drive'),
  k_b: sym('backward (near-end) coupling coefficient', '', 'pair'),
  k_f: sym('forward (far-end) coupling coefficient', 's/m', 'pair'),
  C_m: sym('mutual capacitance per unit length, −C₁₂', 'F/m', 'pair'),
  L_m: sym('mutual inductance per unit length, L₁₂', 'H/m', 'pair'),
  v_c: sym('speed from the self terms, 1/√(L₁₁C₁₁)', 'm/s', 'pair'),
  V_FEXT: sym('far-end crosstalk of a step', 'V', 'pair'),
  ell: sym('length of the coupled section', 'm', 'drive'),
  V_r: sym('height of the step', 'V', 'drive'),
  t_r: sym('rise time of the step', 's', 'drive'),
  varepsilon_effm: sym('effective permittivity of mode m', '', 'mode'),
  v_m: sym('speed of mode m', 'm/s', 'mode'),
  Delta_tau: sym('skew between the modes over the length ℓ', 's', 'mode'),
  tau_even: sym('delay per unit length of the even (slower) mode', 's/m', 'mode'),
  tau_odd: sym('delay per unit length of the odd (faster) mode', 's/m', 'mode'),
  // calculators
  Delta: sym('relative difference of a closed form from the field solution', '', 'formula'),
  X_formula: sym('the closed form’s value', 'Ω', 'formula'),
  X_field: sym('the field solution’s value', 'Ω', 'line'),
  Delta_Z: sym('difference of the stackup from JLCPCB’s calculator inputs', 'Ω', 'calculator'),
  Z_stackup: sym('the field solution on the stackup as entered', 'Ω', 'calculator'),
  Z_calc: sym('the field solution on JLCPCB’s calculator inputs', 'Ω', 'calculator'),
  Delta_sum: sym('sum of the parts, each part taken as the stackup has it', 'Ω', 'calculator'),
  Delta_er: sym('part: εr of the prepregs as the stackup has it', 'Ω', 'calculator'),
  Delta_cu: sym('part: outer copper thickness as the stackup has it', 'Ω', 'calculator'),
  Delta_etch: sym('part: the trapezoid (etch) as the stackup has it', 'Ω', 'calculator'),
  Delta_mask: sym('part: the solder mask as the stackup has it', 'Ω', 'calculator'),
  // tolerances
  d_i: sym('change of the result per tolerance of input i', 'Ω', 'tolerance'),
  Z_plus: sym('result with input i at its upper limit', 'Ω', 'tolerance'),
  Z_minus: sym('result with input i at its lower limit', 'Ω', 'tolerance'),
  s_i: sym('share of input i in the spread', '', 'tolerance'),
  S_d: sym('sum of the squared changes of every input (Ω²)', '', 'tolerance'),
  Z_hi: sym('upper worst-case corner', 'Ω', 'tolerance'),
  Z_lo: sym('lower worst-case corner', 'Ω', 'tolerance'),
  Z_hiat: sym('result with every input at the limit that raises it', 'Ω', 'tolerance'),
  Z_loat: sym('result with every input at the limit that lowers it', 'Ω', 'tolerance'),
  sigma: sym('standard deviation of the result', 'Ω', 'tolerance'),
  sigma_i: sym('standard deviation input i is drawn with', '', 'tolerance'),
  t_i: sym('tolerance of input i', '', 'tolerance'),
};

/** TeX for names the engine's `nameTex` would print otherwise (subscripts with commas, arguments, bold vectors). */
export const TEX_NAMES: Readonly<Record<string, string>> = {
  varepsilon_eff: '\\varepsilon_\\mathrm{eff}', varepsilon_effm: '\\varepsilon_{\\mathrm{eff},m}',
  varepsilon_f: '\\varepsilon_\\mathrm{eff}(f)', varepsilon_0: '\\varepsilon_0', varepsilon_r: '\\varepsilon_r',
  dV: '\\partial V', dI: '\\partial I', dz: '\\partial z', dt: '\\partial t',
  Q_vec: '\\mathbf Q', C_mat: '\\mathbf C', V_vec: '\\mathbf V',
  Z_ohm: 'Z_0/\\Omega', e_eff: 'e_{\\varepsilon}',
  X_M2: 'X_{M/2}', X_M4: 'X_{M/4}',
  D_X: '\\max\\big(\\lvert X_M - X_{M/2}\\rvert,\\ \\tfrac14\\lvert X_{M/2} - X_{M/4}\\rvert\\big)',
  Z_c11: 'Z_{c,11}', Z_c22: 'Z_{c,22}', Z_c12: 'Z_{c,12}', Y_c11: 'Y_{c,11}', Y_c22: 'Y_{c,22}', Y_c12: 'Y_{c,12}',
  Z_diffB: 'Z_\\mathrm{diff}^{(B)}', Z_cmB: 'Z_\\mathrm{cm}^{(B)}', R_TDR: 'R_\\mathrm{TDR}',
  Delta_tau: '\\Delta\\tau', Delta_Z: '\\Delta Z', Delta_sum: '\\textstyle\\sum_\\mathrm{part}\\Delta_\\mathrm{part}',
  Delta_er: '\\Delta_{\\varepsilon_r}', Delta_cu: '\\Delta_\\mathrm{copper}',
  Z_stackup: 'Z(\\text{stackup})', Z_calc: 'Z(\\text{calculator})',
  Z_plus: 'Z(x_i + t_i)', Z_minus: 'Z(x_i - t_i)',
  Z_hiat: 'Z\\big(x_i + \\operatorname{sign}(d_i)\\,t_i\\big)', Z_loat: 'Z\\big(x_i - \\operatorname{sign}(d_i)\\,t_i\\big)',
};

/** One more relation printed with an entry ("with …"), in the same text form. */
export interface Where { text: string; tree: Node }

export interface EmEquation extends Equation<EmObject> {
  /** The theory topic (anchor) the entry belongs to. */
  topic: string;
  /** The structures it holds for: one line, a pair (two signals), or any. */
  applies: 'line' | 'pair' | 'any';
  /** Further relations printed with it (definitions of its auxiliary symbols). */
  where: readonly Where[];
  /** TeX printed after it as it stands (a condition or a distribution the grammar does not write). */
  extra?: string;
  /** False for definitions that have no numbers of their own (telegrapher's equations, Q = CV, mixed-mode variables). */
  live: boolean;
}

const src = (key: string, at: string): Source => ({ key, at });
const QUASI_TEM = 'quasi-TEM: the static C and L of the cross-section';
const SYM_PAIR = 'symmetric pair (Zc₁₁ = Zc₂₂)';

interface Def {
  id: string; title: string; topic: string; text: string; where?: string[]; extra?: string;
  applies?: 'line' | 'pair' | 'any'; live?: boolean;
  sources?: Source[]; derivation?: string; assumptions?: string[]; engine: string;
}

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

function build(d: Def): EmEquation {
  const tree = parse(d.text);
  const where = (d.where ?? []).map((text): Where => ({ text, tree: parse(text) }));
  const variables = variablesOf(tree);
  for (const w of where) variablesOf(w.tree, variables);
  return {
    id: d.id, title: d.title, text: d.text, tree, sources: d.sources ?? [], derivation: d.derivation,
    assumptions: d.assumptions ?? [], steps: [], engine: d.engine, variables,
    topic: d.topic, applies: d.applies ?? 'any', where, extra: d.extra, live: d.live ?? true,
  };
}

/** Every equation of the EM theory, parsed. */
export const EM_EQUATIONS: readonly EmEquation[] = DEFS.map(build);

export const EM_EQUATION_BY_ID: ReadonlyMap<string, EmEquation> = new Map(EM_EQUATIONS.map((e) => [e.id, e]));

/** What a variable means; undefined for an unknown name. */
export function emSymbolOf(name: string): SymbolInfo<EmObject> | undefined {
  return EM_SYMBOLS[name];
}

/** A symbol's TeX: TEX_NAMES first, then the engine's `nameTex`. */
export function emNameTex(name: string): string {
  return TEX_NAMES[name] ?? nameTex(name);
}

/** TeX options that print TEX_NAMES and then apply the page's own decoration (colours). */
export function emTexOptions(options: TexOptions = {}): TexOptions {
  const deco = options.variable;
  return { value: options.value, variable: (name, s) => { const t = TEX_NAMES[name] ?? s; return deco ? deco(name, t) : t; } };
}

/** A tree as TeX with the EM names. */
export function emTex(tree: Node, options: TexOptions = {}): string {
  return tex(tree, emTexOptions(options));
}

/**
 * The binding an entry evaluates on (shared engine `evaluate`), from the flat numbers of eqvalues.emBinding; null when
 * a variable has no number (the entry is then printed without numbers).
 */
export function bindingFor(eq: EmEquation, values: Readonly<Record<string, number>>): Binding | null {
  if (!eq.live) return null;
  const b: Record<string, number> = {};
  for (const v of eq.variables) {
    const x = values[v];
    if (x === undefined || !Number.isFinite(x)) return null;
    b[v] = x;
  }
  return b;
}

/** Each variable's value as TeX (valueTex with the symbol's unit), for `substitutions` or tex's `value` option. */
export function valuesTex(eq: EmEquation, values: Readonly<Record<string, number>>, digits = 4): Record<string, TexPiece> {
  const out: Record<string, TexPiece> = {};
  for (const v of eq.variables) {
    const x = values[v];
    if (x !== undefined && Number.isFinite(x)) out[v] = valueTex(x, 0, EM_SYMBOLS[v]?.unit ?? '', digits);
  }
  return out;
}

/** The substitution lines of a relation (the entry's tree or one of its `where`) with the EM names (see `substitutions`). */
export function emSubstitutions(
  tree: Node, values: Readonly<Record<string, TexPiece | undefined>>, variable?: TexOptions['variable'],
): { lhs: string; rhs: string; lines: string[] } | null {
  return substitutions(tree, values, emTexOptions({ variable }).variable);
}
