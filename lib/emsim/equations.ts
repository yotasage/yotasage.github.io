// The equations the EM simulation's theory shows (step M2.4b; topics, TeX and live fields in docs/em-sim/theory.md,
// theory-2.md and theory-vias.md): 61 entries on the shared equation engine of lib/equations/, written in
// equationsLines.ts (33, the trace) and equationsVia.ts (28, vias, the TDR, S-parameters, the target; step M4.2), each
// with its derivation steps (equations-list.md) (the Smith chart has its own registry
// in lib/smith/equations.ts). Each is written as short text, parsed when this module loads, printed as TeX by the
// engine's printer (names the engine would print plainly get their TeX from TEX_NAMES) and evaluated on the numbers
// that lib/emsim/eqvalues.ts (trace) and eqvaluesVia.ts (via) take from the engine's results. The solver never uses these trees: they are for display,
// and the harness (scripts/harness/emsim/check-equations.mjs) evaluates every entry against the engine's numbers.
// Framework-free; no engine import (the page can print an equation without loading the solver).

import { parse, variablesOf } from '../equations/parse';
import type { Node } from '../equations/parse';
import { nameTex, substitutions, tex, valueTex } from '../equations/tex';
import type { TexOptions, TexPiece } from '../equations/tex';
import type { Binding, Value } from '../equations/compile';
import { parseReason } from '../equations/equation';
import type { Equation, Step, SymbolInfo } from '../equations/equation';
import { sym } from './equationsDef';
import type { Def, EmObject } from './equationsDef';
import { LINE_DEFS, STEP_SYMBOLS, STEP_TEX_NAMES } from './equationsLines';
import { VIA_DEFS, VIA_SYMBOLS, VIA_TEX_NAMES } from './equationsVia';

export type { EmObject } from './equationsDef';

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
  ...VIA_SYMBOLS,
  ...STEP_SYMBOLS,
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
  ...VIA_TEX_NAMES,
  ...STEP_TEX_NAMES,
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
  /** What its numbers come from: the trace's solve (eqvalues.emBinding) or the via model (eqvaluesVia.viaBinding). */
  on: 'trace' | 'via';
  /** Free variables of the steps (and their reasons) that the entry itself does not use: numbers only in the harness. */
  stepVariables: readonly string[];
}

function build(d: Def): EmEquation {
  const tree = parse(d.text);
  const where = (d.where ?? []).map((text): Where => ({ text, tree: parse(text) }));
  const variables = variablesOf(tree);
  for (const w of where) variablesOf(w.tree, variables);
  const steps = (d.steps ?? []).map(([text, why]): Step => ({ text, tree: parse(text), why, reason: parseReason(why) }));
  const all = [...variables];
  for (const st of steps) {
    variablesOf(st.tree, all);
    for (const r of st.reason) if (typeof r !== 'string') variablesOf(r, all);
  }
  return {
    id: d.id, title: d.title, text: d.text, tree, sources: d.sources ?? [], derivation: d.derivation,
    assumptions: d.assumptions ?? [], steps, engine: d.engine, variables, symbols: d.symbols,
    topic: d.topic, applies: d.applies ?? 'any', where, extra: d.extra, live: d.live ?? true, on: d.on ?? 'trace',
    stepVariables: all.slice(variables.length),
  };
}

/** Every equation of the EM theory, parsed. */
export const EM_EQUATIONS: readonly EmEquation[] = [...LINE_DEFS, ...VIA_DEFS].map(build);

export const EM_EQUATION_BY_ID: ReadonlyMap<string, EmEquation> = new Map(EM_EQUATIONS.map((e) => [e.id, e]));

/** What a variable means (in an entry when given: its own meanings first); undefined for an unknown name. */
export function emSymbolOf(name: string, eq?: EmEquation): SymbolInfo<EmObject> | undefined {
  return eq?.symbols?.[name] ?? EM_SYMBOLS[name];
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
export function bindingFor(eq: EmEquation, values: Readonly<Record<string, Value>>): Binding | null {
  if (!eq.live) return null;
  const b: Record<string, Value> = {};
  for (const v of eq.variables) {
    const x = values[v];
    if (!finiteValue(x)) return null;
    b[v] = x;
  }
  return b;
}

/** Each variable's value as TeX (valueTex with the symbol's unit), for `substitutions` or tex's `value` option. */
export function valuesTex(eq: EmEquation, values: Readonly<Record<string, Value>>, digits = 4): Record<string, TexPiece> {
  const out: Record<string, TexPiece> = {};
  for (const v of eq.variables) {
    const x = values[v];
    if (!finiteValue(x)) continue;
    const unit = emSymbolOf(v, eq)?.unit ?? '';
    out[v] = typeof x === 'number' ? valueTex(x, 0, unit, digits) : valueTex(x[0], x[1], unit, digits);
  }
  return out;
}

/** A real number or (re, im) pair, every part finite. */
export function finiteValue(x: Value | undefined): boolean {
  return typeof x === 'number' ? Number.isFinite(x) : x !== undefined && Number.isFinite(x[0]) && Number.isFinite(x[1]);
}

/** The substitution lines of a relation (the entry's tree or one of its `where`) with the EM names (see `substitutions`). */
export function emSubstitutions(
  tree: Node, values: Readonly<Record<string, TexPiece | undefined>>, variable?: TexOptions['variable'],
): { lhs: string; rhs: string; lines: string[] } | null {
  return substitutions(tree, values, emTexOptions({ variable }).variable);
}
