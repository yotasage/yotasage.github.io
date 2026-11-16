// The equations the Smith chart tool shows (learning.md §1, decision D5): each is written as short text, parsed into
// a tree when this module loads, printed as TeX for KaTeX by one printer and computed on complex numbers by one
// evaluator. The engine (convert, parts, network, geometry) never uses these trees: they are for display, and the
// harness (scripts/harness/smith/check-equations.mjs) evaluates every entry and every derivation step against the
// engine on random points. This module does not import KaTeX; the page renders the TeX through KatexSpan.
//
// The engine (grammar, TeX printer, evaluator, what an entry is) is shared in lib/equations/ (moved there in EM step
// M2.4b); this module keeps the Smith chart's symbols and registry and re-exports the engine, so imports from here keep
// working.

import { parse, variablesOf } from '../equations/parse';
import { parseReason } from '../equations/equation';
import type { Equation as EquationOf, Source, Step, SymbolInfo as SymbolInfoOf } from '../equations/equation';

export { FUNCTIONS, CONSTANTS, parse, toText, variablesOf } from '../equations/parse';
export type { Node } from '../equations/parse';
export { nameTex, tex, substitutions, valueTex } from '../equations/tex';
export type { TexPiece, TexOptions } from '../equations/tex';
export { compile, bind, programOf, evaluate } from '../equations/compile';
export type { Side, Program, Value, Binding } from '../equations/compile';
export { parseReason } from '../equations/equation';
export type { Source, Step } from '../equations/equation';

// ---------------------------------------------------------------------------------------------------------------
// Symbols: what each variable means, its unit (lib/quantity.ts units, '' for none) and the chart object whose colour
// it takes in the equation panel (M5).

export type ChartObject =
  | 'chart' | 'point' | 'gamma' | 'z' | 'y' | 'r-circle' | 'x-circle' | 'g-circle' | 'b-circle' | 'load' | 'input'
  | 'part' | 'line' | 'stub' | 'quarter' | 'node' | 'frequency' | 'metric';

export type SymbolInfo = SymbolInfoOf<ChartObject>;

const sym = (meaning: string, unit: string, object: ChartObject): SymbolInfo => ({ meaning, unit, object });

export const SYMBOLS: Readonly<Record<string, SymbolInfo>> = {
  Z_0: sym('reference impedance of the chart', 'Ω', 'chart'),
  Y_0: sym('reference admittance of the chart, 1/Z₀', 'S', 'chart'),
  Z: sym('impedance', 'Ω', 'z'),
  Y: sym('admittance', 'S', 'y'),
  R: sym('resistance', 'Ω', 'part'),
  X: sym('reactance', 'Ω', 'part'),
  B: sym('susceptance', 'S', 'part'),
  L: sym('inductance', 'H', 'part'),
  C: sym('capacitance', 'F', 'part'),
  z: sym('normalised impedance', '', 'z'),
  y: sym('normalised admittance', '', 'y'),
  r: sym('normalised resistance', '', 'r-circle'),
  x: sym('normalised reactance', '', 'x-circle'),
  g: sym('normalised conductance', '', 'g-circle'),
  b: sym('normalised susceptance', '', 'b-circle'),
  Gamma: sym('reflection coefficient', '', 'gamma'),
  Gamma_r: sym('real part of Γ', '', 'gamma'),
  Gamma_i: sym('imaginary part of Γ', '', 'gamma'),
  c: sym('centre of the circle a line draws on the chart', '', 'line'),
  rho: sym('radius of the circle a line draws on the chart', '', 'line'),
  Gamma_c: sym('reflection coefficient of the load against the line’s Z_c', '', 'line'),
  Z_c: sym('characteristic impedance of the line or stub', 'Ω', 'line'),
  Y_c: sym('characteristic admittance of the line or stub, 1/Z_c', 'S', 'line'),
  VSWR: sym('voltage standing wave ratio', '', 'metric'),
  V_inc: sym('amplitude of the incident voltage wave', 'V', 'metric'),
  V_max: sym('largest voltage amplitude along the line', 'V', 'metric'),
  V_min: sym('smallest voltage amplitude along the line', 'V', 'metric'),
  Z_max: sym('impedance where the voltage is largest', 'Ω', 'metric'),
  Z_min: sym('impedance where the voltage is smallest', 'Ω', 'metric'),
  RL: sym('return loss', 'dB', 'metric'),
  ML: sym('mismatch loss', 'dB', 'metric'),
  P_inc: sym('incident power', 'W', 'metric'),
  P_ref: sym('reflected power', 'W', 'metric'),
  P_load: sym('power delivered to the load', 'W', 'metric'),
  Q: sym('quality factor', '', 'metric'),
  R_high: sym('the higher of the two resistances matched', 'Ω', 'load'),
  R_low: sym('the lower of the two resistances matched', 'Ω', 'load'),
  Z_in: sym('input impedance', 'Ω', 'input'),
  Z_L: sym('load impedance', 'Ω', 'load'),
  R_L: sym('load resistance', 'Ω', 'load'),
  Gamma_L: sym('reflection coefficient of the load', '', 'load'),
  Gamma_in: sym('reflection coefficient at the input', '', 'input'),
  beta: sym('phase constant', 'rad/m', 'line'),
  ell: sym('physical length', 'm', 'line'),
  theta: sym('electrical length βℓ', 'rad', 'line'),
  lambda: sym('wavelength on the line', 'm', 'line'),
  v_p: sym('phase velocity', 'm/s', 'line'),
  omega: sym('angular frequency', 'rad/s', 'frequency'),
  f: sym('frequency', 'Hz', 'frequency'),
  Z_t: sym('characteristic impedance of the λ/4 transformer', 'Ω', 'quarter'),
  L_s: sym('inductance equal to a short stub at one frequency', 'H', 'stub'),
  C_o: sym('capacitance equal to an open stub at one frequency', 'F', 'stub'),
  z_in: sym('normalised impedance at the input of the part', '', 'input'),
  z_L: sym('normalised impedance at the output of the part', '', 'node'),
  z_s: sym('normalised impedance of the series part', '', 'part'),
  Z_s: sym('impedance of the series part', 'Ω', 'part'),
  y_in: sym('normalised admittance at the input of the part', '', 'input'),
  y_L: sym('normalised admittance at the output of the part', '', 'node'),
  y_p: sym('normalised admittance of the shunt part', '', 'part'),
  Y_p: sym('admittance of the shunt part', 'S', 'part'),
  V: sym('voltage at a node', 'V', 'node'),
  I: sym('current at a node towards the load', 'A', 'node'),
  V_1: sym('voltage at port 1 (towards the source)', 'V', 'input'),
  I_1: sym('current into port 1', 'A', 'input'),
  V_2: sym('voltage at port 2 (towards the load)', 'V', 'node'),
  I_2: sym('current out of port 2', 'A', 'node'),
  // M7.4b: the band of a match (theory-sweep.md §12).
  f_0: sym('the frequency the circuit is designed at, f0', 'Hz', 'frequency'),
  omega_0: sym('angular frequency at f0', 'rad/s', 'frequency'),
  FBW: sym('fractional bandwidth: the width of the matched band around f0, over f0', '', 'metric'),
  f_lo: sym('lower end of the band below the limit around f0', 'Hz', 'frequency'),
  f_hi: sym('upper end of the band below the limit around f0', 'Hz', 'frequency'),
  Q_L: sym('loaded Q: the best point’s frequency over the half-power width', '', 'metric'),
  f_m: sym('frequency of the best match near f0', 'Hz', 'frequency'),
  f_1: sym('lower half-power frequency', 'Hz', 'frequency'),
  f_2: sym('upper half-power frequency', 'Hz', 'frequency'),
  omega_1: sym('angular frequency of the band’s lower edge (half power, or the limit)', 'rad/s', 'frequency'),
  omega_2: sym('angular frequency of the band’s upper edge (half power, or the limit)', 'rad/s', 'frequency'),
  X_m: sym('reactance at which |Γ| reaches the limit', 'Ω', 'part'),
  Gamma_m: sym('the limit as a |Γ|', '', 'metric'),
  v_Gamma: sym('how fast Γ leaves the centre: |dΓ/dδ| at f0, δ = (f − f0)/f0', '', 'input'),
  y_d: sym('how fast y at the input changes: dy/dδ at f0', '', 'input'),
  s: sym('+1 for a series L next to the load, −1 for a series C', '', 'part'),
  theta_m: sym('electrical length of the transformer at the band’s lower edge', 'rad', 'quarter'),
};

const ABCD_SYMBOLS: Readonly<Record<string, SymbolInfo>> = {
  A: sym('ABCD entry A (voltage ratio)', '', 'part'),
  B: sym('ABCD entry B (transfer impedance)', 'Ω', 'part'),
  C: sym('ABCD entry C (transfer admittance)', 'S', 'part'),
  D: sym('ABCD entry D (current ratio)', '', 'part'),
  A_1: sym('A of the part towards the source', '', 'part'), B_1: sym('B of the part towards the source', 'Ω', 'part'),
  C_1: sym('C of the part towards the source', 'S', 'part'), D_1: sym('D of the part towards the source', '', 'part'),
  A_2: sym('A of the part towards the load', '', 'part'), B_2: sym('B of the part towards the load', 'Ω', 'part'),
  C_2: sym('C of the part towards the load', 'S', 'part'), D_2: sym('D of the part towards the load', '', 'part'),
};

// ---------------------------------------------------------------------------------------------------------------
// The registry.

export type Equation = EquationOf<ChartObject>;

const E = 'Ellingson2018', S2 = 'SteerVol2', S3 = 'SteerVol3', W = 'WikiSmith', WQ = 'WikiQ';
const src = (key: string, at: string): Source => ({ key, at });

const EJWT = 'time dependence e^{jωt}';
const REAL_Z0 = 'real reference impedance Z₀';
const LOSSLESS = 'lossless line';
const OUT_OF_PORT_2 = 'I₂ flows out of port 2 into the load';

interface Def {
  id: string;
  title: string;
  text: string;
  sources?: Source[];
  derivation?: string;
  owner?: string;
  assumptions?: string[];
  steps?: [string, string][];
  engine: string;
  symbols?: Record<string, SymbolInfo>;
}

const DEFS: Def[] = [
  // Normalisation and Γ (facts.md eqs. 1–3).
  { id: 'z-norm', title: 'Normalised impedance', text: 'z = Z/Z_0 = r + j*x', sources: [src(W, '"Normalization"')], assumptions: [REAL_Z0], engine: 'convert.zFromGamma, convert.impedanceFromGamma' },
  { id: 'y-norm', title: 'Normalised admittance', text: 'y = Y/Y_0 = Y*Z_0 = 1/z = g + j*b', sources: [src(W, '"Normalization"')], assumptions: [REAL_Z0], engine: 'convert.yFromGamma, convert.admittanceFromGamma' },
  {
    id: 'gamma-z', title: 'Reflection coefficient from impedance', text: 'Gamma = (z - 1)/(z + 1) = (Z - Z_0)/(Z + Z_0)',
    sources: [src(E, '§3.12'), src(S2, '§2.3'), src(S3, '§3.5')], assumptions: [EJWT, REAL_Z0], engine: 'convert.gammaFromZ, convert.gammaFromImpedance',
  },
  {
    id: 'z-gamma', title: 'Impedance from the reflection coefficient', text: 'z = (1 + Gamma)/(1 - Gamma)',
    sources: [src(E, '§3.12'), src(S2, '§2.3'), src(S3, '§3.5')], assumptions: [REAL_Z0], engine: 'convert.zFromGamma',
    steps: [
      ['Gamma = (z - 1)/(z + 1)', '`Gamma` is the reflected voltage wave over the incident one at a point; against a real `Z_0` it is `(z - 1)/(z + 1)`, the definition the other derivations rest on.'],
      ['Gamma*(z + 1) = z - 1', 'Multiply both sides by `z + 1`.'],
      ['z*(1 - Gamma) = 1 + Gamma', 'Gather the terms in `z` on one side.'],
      ['z = (1 + Gamma)/(1 - Gamma)', 'Divide by `1 - Gamma`.'],
    ],
  },
  {
    id: 'gamma-y', title: 'Reflection coefficient from admittance', text: 'Gamma = (1 - y)/(1 + y)', sources: [src(W, '"Admittance chart"')],
    assumptions: [REAL_Z0], engine: 'convert.gammaFromY',
    steps: [
      ['Gamma = (z - 1)/(z + 1) = (1/y - 1)/(1/y + 1)', 'Put `z = 1/y` into `Gamma = (z - 1)/(z + 1)`.'],
      ['Gamma = (1 - y)/(1 + y)', 'Multiply above and below by `y`.'],
    ],
  },
  {
    id: 'y-gamma', title: 'Admittance from the reflection coefficient', text: 'y = (1 - Gamma)/(1 + Gamma)', sources: [src(W, '"Admittance chart"')],
    assumptions: [REAL_Z0], engine: 'convert.yFromGamma',
    steps: [
      ['y = 1/z = 1/((1 + Gamma)/(1 - Gamma))', 'The admittance is the reciprocal of `z = (1 + Gamma)/(1 - Gamma)`.'],
      ['y = (1 - Gamma)/(1 + Gamma)', 'The reciprocal of a fraction turns it over.'],
    ],
  },
  // Γ in parts of z and y (eqs. 4, 5).
  {
    id: 'gamma-parts-z', title: 'Γ in parts of z', text: 'Gamma = Gamma_r + j*Gamma_i = (r^2 + x^2 - 1)/((1 + r)^2 + x^2) + j*(2*x/((1 + r)^2 + x^2))',
    sources: [src(W, '"Constant resistance and reactance circles"')], assumptions: [REAL_Z0], engine: 'convert.gammaFromZ',
    steps: [
      ['Gamma = (r + j*x - 1)/(r + j*x + 1)', '`Gamma = (z - 1)/(z + 1)` with `z = r + j*x`.'],
      ['Gamma = ((r - 1 + j*x)*(r + 1 - j*x))/((r + 1 + j*x)*(r + 1 - j*x))', 'Multiply above and below by the conjugate of the denominator.'],
      ['Gamma = (r^2 - 1 + x^2 + j*2*x)/((r + 1)^2 + x^2)', 'Multiply out; the denominator is now real.'],
      ['Gamma = (r^2 + x^2 - 1)/((1 + r)^2 + x^2) + j*(2*x/((1 + r)^2 + x^2))', 'Split into real and imaginary parts.'],
    ],
  },
  {
    id: 'gamma-parts-y', title: 'Γ in parts of y', text: 'Gamma = Gamma_r + j*Gamma_i = (1 - g^2 - b^2)/((1 + g)^2 + b^2) - j*(2*b/((1 + g)^2 + b^2))',
    sources: [src(W, '"Admittance chart"')], assumptions: [REAL_Z0], engine: 'convert.gammaFromY',
    steps: [
      ['Gamma = (1 - g - j*b)/(1 + g + j*b)', '`Gamma = (1 - y)/(1 + y)` with `y = g + j*b`.'],
      ['Gamma = ((1 - g - j*b)*(1 + g - j*b))/((1 + g)^2 + b^2)', 'Multiply above and below by the conjugate of the denominator.'],
      ['Gamma = (1 - g^2 - b^2 - j*2*b)/((1 + g)^2 + b^2)', 'Multiply out the numerator: `(1 - j*b)^2 - g^2`.'],
      ['Gamma = (1 - g^2 - b^2)/((1 + g)^2 + b^2) - j*(2*b/((1 + g)^2 + b^2))', 'Split into real and imaginary parts.'],
    ],
  },
  // z and y in parts of Γ (eqs. 6, 7; the owner's notes items 1–4 and 6).
  {
    id: 'z-parts', title: 'z in parts of Γ', text: 'z = r + j*x = (1 - Gamma_r^2 - Gamma_i^2)/((1 - Gamma_r)^2 + Gamma_i^2) + j*(2*Gamma_i/((1 - Gamma_r)^2 + Gamma_i^2))',
    sources: [], derivation: 'From z = (1 + Γ)/(1 − Γ) with Γ = Γr + jΓi (facts.md §3).', owner: 'items 1 and 6', assumptions: [REAL_Z0], engine: 'convert.zFromGamma',
    steps: [
      ['z = (1 + Gamma_r + j*Gamma_i)/((1 - Gamma_r) - j*Gamma_i)', '`z = (1 + Gamma)/(1 - Gamma)` with `Gamma = Gamma_r + j*Gamma_i`.'],
      ['z = ((1 + Gamma_r + j*Gamma_i)*((1 - Gamma_r) + j*Gamma_i))/(((1 - Gamma_r) - j*Gamma_i)*((1 - Gamma_r) + j*Gamma_i))', 'Multiply above and below by the conjugate of the denominator.'],
      ['z = (1 - Gamma_r^2 - Gamma_i^2 + j*2*Gamma_i)/((1 - Gamma_r)^2 + Gamma_i^2)', 'Multiply out; the denominator is now real.'],
      ['z = (1 - Gamma_r^2 - Gamma_i^2)/((1 - Gamma_r)^2 + Gamma_i^2) + j*(2*Gamma_i/((1 - Gamma_r)^2 + Gamma_i^2))', 'Split into `r` and `x`.'],
    ],
  },
  {
    id: 'y-parts', title: 'y in parts of Γ', text: 'y = g + j*b = (1 - Gamma_r^2 - Gamma_i^2)/(Gamma_i^2 + (Gamma_r + 1)^2) - j*(2*Gamma_i/(Gamma_i^2 + (Gamma_r + 1)^2))',
    sources: [], derivation: 'From y = 1/z with z of the owner’s notes item 1 (facts.md §3).', owner: 'items 2–4', assumptions: [REAL_Z0], engine: 'convert.yFromGamma',
    steps: [
      ['y = 1/z = ((1 - Gamma_r) - j*Gamma_i)/(1 + Gamma_r + j*Gamma_i)', 'Turn `z = (1 + Gamma_r + j*Gamma_i)/((1 - Gamma_r) - j*Gamma_i)` over.'],
      ['y = ((1 - Gamma_r - j*Gamma_i)*(1 + Gamma_r - j*Gamma_i))/((1 + Gamma_r + j*Gamma_i)*(1 + Gamma_r - j*Gamma_i))', 'Multiply by the conjugate `1 + Gamma_r - j*Gamma_i` over itself.'],
      ['y = (1 - Gamma_r^2 - Gamma_i^2 - j*2*Gamma_i)/(Gamma_i^2 + (Gamma_r + 1)^2)', 'Multiply out: the numerator is `(1 - j*Gamma_i)^2 - Gamma_r^2`, the denominator real.'],
      ['y = (1 - Gamma_r^2 - Gamma_i^2)/(Gamma_i^2 + (Gamma_r + 1)^2) - j*(2*Gamma_i/(Gamma_i^2 + (Gamma_r + 1)^2))', 'Split into `g` and `b`.'],
    ],
  },
  { id: 'r-gamma', title: 'Resistance from Γ', text: 'r = (1 - Gamma_r^2 - Gamma_i^2)/((1 - Gamma_r)^2 + Gamma_i^2)', sources: [], derivation: 'The real part of z in parts of Γ.', owner: 'item 6', assumptions: [REAL_Z0], engine: 'convert.zFromGamma' },
  { id: 'x-gamma', title: 'Reactance from Γ', text: 'x = 2*Gamma_i/((1 - Gamma_r)^2 + Gamma_i^2)', sources: [], derivation: 'The imaginary part of z in parts of Γ.', owner: 'item 6', assumptions: [REAL_Z0], engine: 'convert.zFromGamma' },
  { id: 'g-gamma', title: 'Conductance from Γ', text: 'g = (1 - Gamma_r^2 - Gamma_i^2)/((1 + Gamma_r)^2 + Gamma_i^2)', sources: [], derivation: 'The real part of y in parts of Γ.', owner: 'item 5', assumptions: [REAL_Z0], engine: 'convert.yFromGamma' },
  { id: 'b-gamma', title: 'Susceptance from Γ', text: 'b = -2*Gamma_i/((1 + Gamma_r)^2 + Gamma_i^2)', sources: [], derivation: 'The imaginary part of y in parts of Γ.', owner: 'item 5', assumptions: [REAL_Z0], engine: 'convert.yFromGamma' },
  // The four circles (eqs. 8–11; the owner's notes items 7–11, completed).
  {
    id: 'circle-r', title: 'Constant-resistance circle', text: '(Gamma_r - r/(1 + r))^2 + Gamma_i^2 = (1/(1 + r))^2',
    sources: [src(W, '"Constant resistance and reactance circles"'), src(S3, '§3.4')], derivation: 'Completing the square in r = Re z (facts.md §3 item 8).',
    owner: 'items 7 and 8', assumptions: [REAL_Z0], engine: 'convert.zFromGamma',
    steps: [
      ['r = (1 - Gamma_r^2 - Gamma_i^2)/(Gamma_i^2 + (1 - Gamma_r)^2)', 'The real part of `z` in parts of `Gamma` (see the derivation of `z` in parts of `Gamma`).'],
      ['r*Gamma_i^2 + r*(1 - Gamma_r)^2 + Gamma_r^2 + Gamma_i^2 = 1', 'Multiply by the denominator and bring `Gamma_r^2 + Gamma_i^2` to the left.'],
      ['r*Gamma_i^2 + r*(1 - 2*Gamma_r + Gamma_r^2) + Gamma_r^2 + Gamma_i^2 = 1', 'Expand `(1 - Gamma_r)^2`.'],
      ['Gamma_i^2*(r + 1) + r - 2*r*Gamma_r + Gamma_r^2*(r + 1) = 1', 'Gather the terms in `Gamma_i^2` and in `Gamma_r^2`.'],
      ['Gamma_r^2 - 2*Gamma_r*r/(r + 1) + r/(r + 1) + Gamma_i^2 = 1/(r + 1)', 'Divide by `r + 1`.'],
      ['(Gamma_r - r/(r + 1))^2 - (r/(r + 1))^2 + r/(r + 1) + Gamma_i^2 = 1/(r + 1)', 'Complete the square: `Gamma_r^2 - 2*Gamma_r*r/(r + 1)` is `(Gamma_r - r/(r + 1))^2` less `(r/(r + 1))^2`.'],
      ['(Gamma_r - r/(r + 1))^2 + Gamma_i^2 = 1/(r + 1) - r/(r + 1) + (r/(r + 1))^2', 'Move the constant terms to the right.'],
      ['(Gamma_r - r/(r + 1))^2 + Gamma_i^2 = ((1 - r)*(r + 1) + r^2)/(r + 1)^2', 'Bring the right side over one denominator, `(r + 1)^2`.'],
      ['(Gamma_r - r/(1 + r))^2 + Gamma_i^2 = (1/(1 + r))^2', 'The numerator `(1 - r)*(1 + r) + r^2` is 1: a circle with centre (`r/(1 + r)`, 0) and radius `1/(1 + r)`.'],
    ],
  },
  {
    id: 'circle-x', title: 'Constant-reactance circle', text: '(Gamma_r - 1)^2 + (Gamma_i - 1/x)^2 = (1/x)^2',
    sources: [src(W, '"Constant resistance and reactance circles"'), src(S3, '§3.4')], derivation: 'Completing the square in x = Im z (facts.md §3 item 9).',
    owner: 'items 7 (i corrected to 1) and 9', assumptions: [REAL_Z0], engine: 'convert.zFromGamma',
    steps: [
      ['x = 2*Gamma_i/(Gamma_i^2 + (1 - Gamma_r)^2)', 'The imaginary part of `z` in parts of `Gamma` (see the derivation of `z` in parts of `Gamma`).'],
      ['x*Gamma_i^2 + x*(1 - Gamma_r)^2 = 2*Gamma_i', 'Multiply by the denominator.'],
      ['(Gamma_r - 1)^2 + Gamma_i^2 = 2*Gamma_i/x', 'Divide by `x` (not 0); `(1 - Gamma_r)^2 = (Gamma_r - 1)^2`.'],
      ['(Gamma_r - 1)^2 + Gamma_i^2 - 2*Gamma_i/x + (1/x)^2 = (1/x)^2', 'Bring `2*Gamma_i/x` to the left and complete the square in `Gamma_i`: add `(1/x)^2` to both sides.'],
      ['(Gamma_r - 1)^2 + (Gamma_i - 1/x)^2 = (1/x)^2', '`Gamma_i^2 - 2*Gamma_i/x + (1/x)^2` is `(Gamma_i - 1/x)^2`: a circle with centre (1, `1/x`) and radius `1/abs(x)`.'],
    ],
  },
  {
    id: 'circle-g', title: 'Constant-conductance circle', text: '(Gamma_r + g/(1 + g))^2 + Gamma_i^2 = (1/(1 + g))^2',
    sources: [src(W, '"Admittance chart"')], derivation: 'Completing the square in g = Re y (facts.md §3 item 10).',
    owner: 'items 5 and 10', assumptions: [REAL_Z0], engine: 'convert.yFromGamma',
    steps: [
      ['g = (1 - Gamma_r^2 - Gamma_i^2)/(Gamma_i^2 + (Gamma_r + 1)^2)', 'The real part of `y` in parts of `Gamma` (see the derivation of `y` in parts of `Gamma`).'],
      ['g*Gamma_i^2 + g*(Gamma_r + 1)^2 = 1 - Gamma_r^2 - Gamma_i^2', 'Multiply by the denominator.'],
      ['g*Gamma_i^2 + g*(Gamma_r^2 + 2*Gamma_r + 1) + Gamma_r^2 + Gamma_i^2 = 1', 'Expand `(Gamma_r + 1)^2` and bring `Gamma_r^2 + Gamma_i^2` to the left.'],
      ['Gamma_i^2*(g + 1) + g + 2*g*Gamma_r + Gamma_r^2*(g + 1) = 1', 'Gather the terms in `Gamma_i^2` and in `Gamma_r^2`.'],
      ['Gamma_r^2 + 2*Gamma_r*g/(g + 1) + g/(g + 1) + Gamma_i^2 = 1/(g + 1)', 'Divide by `g + 1`.'],
      ['(Gamma_r + g/(g + 1))^2 - (g/(g + 1))^2 + g/(g + 1) + Gamma_i^2 = 1/(g + 1)', 'Complete the square: `Gamma_r^2 + 2*Gamma_r*g/(g + 1)` is `(Gamma_r + g/(g + 1))^2` less `(g/(g + 1))^2`.'],
      ['(Gamma_r + g/(g + 1))^2 + Gamma_i^2 = 1/(g + 1) - g/(g + 1) + (g/(g + 1))^2', 'Move the constant terms to the right.'],
      ['(Gamma_r + g/(g + 1))^2 + Gamma_i^2 = ((1 - g)*(g + 1) + g^2)/(g + 1)^2', 'Bring the right side over one denominator, `(g + 1)^2`.'],
      ['(Gamma_r + g/(1 + g))^2 + Gamma_i^2 = (1/(1 + g))^2', 'The numerator `(1 - g)*(1 + g) + g^2` is 1: a circle with centre (`-g/(1 + g)`, 0) and radius `1/(1 + g)`.'],
    ],
  },
  {
    id: 'circle-b', title: 'Constant-susceptance circle', text: '(Gamma_r + 1)^2 + (Gamma_i + 1/b)^2 = (1/b)^2',
    sources: [src(W, '"Admittance chart"')], derivation: 'Completing the square in b = Im y (facts.md §3 item 11).',
    owner: 'items 5 and 11', assumptions: [REAL_Z0], engine: 'convert.yFromGamma',
    steps: [
      ['b = -2*Gamma_i/(Gamma_i^2 + (Gamma_r + 1)^2)', 'The imaginary part of `y` in parts of `Gamma` (see the derivation of `y` in parts of `Gamma`).'],
      ['b*Gamma_i^2 + b*(Gamma_r + 1)^2 = -2*Gamma_i', 'Multiply by the denominator.'],
      ['(Gamma_r + 1)^2 + Gamma_i^2 = -2*Gamma_i/b', 'Divide by `b` (not 0).'],
      ['(Gamma_r + 1)^2 + Gamma_i^2 + 2*Gamma_i/b + (1/b)^2 = (1/b)^2', 'Bring `-2*Gamma_i/b` to the left and complete the square in `Gamma_i`: add `(1/b)^2` to both sides.'],
      ['(Gamma_r + 1)^2 + (Gamma_i + 1/b)^2 = (1/b)^2', '`Gamma_i^2 + 2*Gamma_i/b + (1/b)^2` is `(Gamma_i + 1/b)^2`: a circle with centre (`-1`, `-1/b`) and radius `1/abs(b)`.'],
    ],
  },
  // A line of another impedance (eq. 12).
  {
    id: 'line-circle-b', title: 'Mismatch of a line against the chart', text: 'B = (Z_c - Z_0)/(Z_c + Z_0)', sources: [src(S3, '§3.5')],
    assumptions: [LOSSLESS, REAL_Z0], engine: 'geometry.partLocus (LINE)', symbols: { B: sym('reflection coefficient of the line’s Z_c against Z₀', '', 'line') },
  },
  {
    id: 'line-circle-centre', title: 'Centre of a line’s circle', text: 'c = (B - 1/B)/(1 - abs(B*Gamma_c)^2) + 1/B', sources: [src(S3, '§3.5')],
    assumptions: [LOSSLESS, REAL_Z0], engine: 'geometry.partLocus, geometry.circleCentre (LINE)', symbols: { B: sym('reflection coefficient of the line’s Z_c against Z₀', '', 'line') },
  },
  {
    id: 'line-circle-radius', title: 'Radius of a line’s circle', text: 'rho = abs((B^2 - 1)*Gamma_c/(1 - abs(B*Gamma_c)^2))', sources: [src(S3, '§3.5')],
    assumptions: [LOSSLESS, REAL_Z0], engine: 'geometry.partLocus, geometry.circleCentre (LINE)', symbols: { B: sym('reflection coefficient of the line’s Z_c against Z₀', '', 'line') },
  },
  // Figures (eqs. 13–17).
  {
    id: 'vswr', title: 'Voltage standing wave ratio', text: 'VSWR = V_max/V_min = (1 + abs(Gamma))/(1 - abs(Gamma))',
    sources: [src(E, '§3.14'), src(S2, '§2.3')], assumptions: [LOSSLESS], engine: 'convert.vswr',
    symbols: {
      V: sym('voltage on the line at ℓ from the load', 'V', 'metric'),
      ell: sym('distance from the load towards the source', 'm', 'line'),
    },
    steps: [
      ['abs(V) = abs(V_inc)*abs(1 + Gamma*exp(-j*2*beta*ell))', 'The voltage is the incident wave plus the reflected one, which is `Gamma` times it at the load (`Gamma` is the reflected voltage wave over the incident one); moving `ell` towards the source the incident wave gains `exp(j*beta*ell)` and the reflected `exp(-j*beta*ell)`.'],
      ['V_max = abs(V_inc)*(1 + abs(Gamma))', 'The reflected amplitude is `abs(Gamma)` times the incident, so `abs(V)` is largest where `Gamma*exp(-j*2*beta*ell)` is real and positive: the two waves add in phase.'],
      ['V_min = abs(V_inc)*(1 - abs(Gamma))', 'It is smallest where `Gamma*exp(-j*2*beta*ell)` is real and negative: the waves are in antiphase.'],
      ['VSWR = (abs(V_inc)*(1 + abs(Gamma)))/(abs(V_inc)*(1 - abs(Gamma))) = (1 + abs(Gamma))/(1 - abs(Gamma))', 'The ratio; `abs(V_inc)` cancels.'],
    ],
  },
  {
    id: 'gamma-vswr', title: '|Γ| from the VSWR', text: 'abs(Gamma) = (VSWR - 1)/(VSWR + 1)', sources: [src(E, '§3.14'), src(S2, '§2.3')],
    assumptions: [LOSSLESS], engine: 'convert.magFromVswr',
    steps: [
      ['VSWR*(1 - abs(Gamma)) = 1 + abs(Gamma)', 'Start from `VSWR = (1 + abs(Gamma))/(1 - abs(Gamma))` and multiply both sides by `1 - abs(Gamma)`.'],
      ['abs(Gamma)*(VSWR + 1) = VSWR - 1', 'Gather the terms in `abs(Gamma)`.'],
      ['abs(Gamma) = (VSWR - 1)/(VSWR + 1)', 'Divide by `VSWR + 1`.'],
    ],
  },
  // The solver's nearest value (theory-solver.md §10, claims 156–158; notes-M4.3c.md).
  {
    id: 'mismatch-to-target', title: 'Mismatch to a target',
    text: 'm = abs(Gamma - Gamma_t)/abs(1 - conj(Gamma_t)*Gamma) = abs(z - z_t)/abs(z + conj(z_t))',
    sources: [],
    derivation: 'The |Γ| of the node on a chart whose centre is the target: Γ → (Γ − Γt)/(1 − Γt*Γ) takes Γt to 0 and keeps the unit circle. With Γ = (z − 1)/(z + 1) and Γt = (zt − 1)/(zt + 1) (gamma-z) the z form follows.',
    assumptions: [REAL_Z0, 'target inside the chart, |Γt| < 1'], engine: 'goal.goalMismatch',
    symbols: {
      m: sym('mismatch to the target: |Γ| on a chart centred on it', '', 'metric'),
      Gamma_t: sym('reflection coefficient of the target', '', 'point'),
      z_t: sym('normalised impedance of the target', '', 'point'),
    },
    steps: [
      ['m = abs(Gamma - Gamma_t)/abs(1 - conj(Gamma_t)*Gamma)', 'The map `(Gamma - Gamma_t)/(1 - conj(Gamma_t)*Gamma)` takes the target to 0 and keeps the edge of the chart, so it redraws the chart with the target at its centre; `m` is the `abs(Gamma)` the node has on that chart.'],
      ['Gamma - Gamma_t = 2*(z - z_t)/((z + 1)*(z_t + 1))', 'Put both `Gamma` in terms of `z` and take one fraction.'],
      ['1 - conj(Gamma_t)*Gamma = 2*(z + conj(z_t))/((conj(z_t) + 1)*(z + 1))', 'The same below the line, with `conj(Gamma_t) = (conj(z_t) - 1)/(conj(z_t) + 1)`, true because `Z_0` is real.'],
      ['m = abs(z - z_t)/abs(z + conj(z_t))', 'Divide; `abs(conj(z_t) + 1) = abs(z_t + 1)`, so the factors cancel.'],
    ],
  },
  { id: 'z-max', title: 'Impedance at a voltage maximum', text: 'Z_max = Z_0*VSWR', sources: [src(S2, '§2.3')], assumptions: [LOSSLESS, REAL_Z0], engine: 'convert.impedanceFromGamma at Γ = |Γ|' },
  { id: 'z-min', title: 'Impedance at a voltage minimum', text: 'Z_min = Z_0/VSWR', sources: [src(S2, '§2.3')], assumptions: [LOSSLESS, REAL_Z0], engine: 'convert.impedanceFromGamma at Γ = −|Γ|' },
  {
    id: 'return-loss', title: 'Return loss', text: 'RL = 10*log10(P_inc/P_ref) = -20*log10(abs(Gamma))', sources: [src(S3, '§2.8')],
    assumptions: ['passive load, |Γ| ≤ 1'], engine: 'convert.returnLoss',
    steps: [
      ['RL = 10*log10(1/abs(Gamma)^2)', '`Gamma` is the reflected voltage wave over the incident one, and power goes with the square of the amplitude, so the reflected power is `abs(Gamma)^2` times the incident power.'],
      ['RL = -20*log10(abs(Gamma))', 'The logarithm of a reciprocal is the negative, of a square twice the logarithm.'],
    ],
  },
  { id: 'power-reflected', title: 'Reflected power', text: 'P_ref = abs(Gamma)^2*P_inc', sources: [src(E, '§3.20'), src(S2, '§2.3')], assumptions: [LOSSLESS], engine: 'convert.reflectedPower' },
  { id: 'power-delivered', title: 'Power delivered to the load', text: 'P_load = (1 - abs(Gamma)^2)*P_inc', sources: [src(E, '§3.20'), src(S2, '§2.3')], assumptions: [LOSSLESS], engine: 'convert.deliveredPower' },
  {
    id: 'mismatch-loss', title: 'Mismatch loss', text: 'ML = 10*log10(P_inc/P_load) = -10*log10(1 - abs(Gamma)^2)', sources: [src(S3, '§2.8')],
    derivation: '[S3] names mismatch loss without a formula; it is the delivered power in decibels (facts.md eq. 16).', assumptions: ['passive load, |Γ| ≤ 1'], engine: 'convert.mismatchLoss',
    steps: [
      ['ML = 10*log10(1/(1 - abs(Gamma)^2))', '`Gamma` is the reflected voltage wave over the incident one, so `abs(Gamma)^2` of the incident power is reflected and the load receives `1 - abs(Gamma)^2` of it.'],
      ['ML = -10*log10(1 - abs(Gamma)^2)', 'The logarithm of a reciprocal is the negative.'],
    ],
  },
  {
    id: 'q-node', title: 'Q of a point', text: 'Q = abs(x)/r = abs(b)/g = 2*abs(Gamma_i)/(1 - abs(Gamma)^2)', sources: [src(S3, '§6.4')],
    derivation: '|b|/g = |x|/r because y = 1/z gives b/g = −x/r; the Γ form divides x by r in parts of Γ.', assumptions: [REAL_Z0], engine: 'convert.qFromZ, convert.qFromGamma',
  },
  {
    id: 'q-l-network', title: 'Q of an L network', text: 'Q = sqrt(R_high/R_low - 1)', sources: [src(S3, '§6.4')], assumptions: ['lossless parts'],
    engine: 'network.inputGamma of the L network built with this Q',
    steps: [
      ['1/(R_low + j*X) = (R_low - j*X)/(R_low^2 + X^2)', 'The series leg `R_low + j*X` next to the lower resistance, with `Q = abs(X)/R_low`, as an admittance: multiply above and below by `R_low - j*X`.'],
      ['(R_low^2 + X^2)/R_low = R_low*(1 + Q^2)', 'Its real part is one over a parallel resistance `(R_low^2 + X^2)/R_low`, which is `R_low*(1 + Q^2)` with `X^2 = Q^2*R_low^2`.'],
      ['R_high = (R_low^2 + X^2)/R_low = R_low*(1 + Q^2)', 'The shunt part cancels the parallel reactance, so only that resistance is left, and for a match it must equal `R_high`.'],
      ['Q^2 = R_high/R_low - 1', 'Solve for `Q^2`.'],
      ['Q = sqrt(R_high/R_low - 1)', 'Take the positive root: `Q` is a ratio of magnitudes.'],
    ],
  },
  // Lines (eqs. 18–20).
  {
    id: 'line-zin', title: 'Input impedance of a line', sources: [src(E, '§3.15'), src(S2, '§2.3')], assumptions: [LOSSLESS, EJWT], engine: 'network.evaluate (LINE)',
    symbols: { Gamma_ell: sym('reflection coefficient at ℓ from the load, against the line’s Z_c', '', 'line') },
    text: 'Z_in = Z_c*((Z_L + j*Z_c*tan(beta*ell))/(Z_c + j*Z_L*tan(beta*ell))) = Z_c*((1 + Gamma_c*exp(-j*2*beta*ell))/(1 - Gamma_c*exp(-j*2*beta*ell)))',
    steps: [
      ['Gamma_ell = Gamma_c*exp(-j*2*beta*ell)', '`Gamma` is the reflected voltage wave over the incident one. Moving `ell` towards the source, the incident wave gains `exp(j*beta*ell)` and the reflected `exp(-j*beta*ell)`, so their ratio turns by `exp(-j*2*beta*ell)` (both against the line’s `Z_c`).'],
      ['Z_in = Z_c*((1 + Gamma_ell)/(1 - Gamma_ell)) = Z_c*((1 + Gamma_c*exp(-j*2*beta*ell))/(1 - Gamma_c*exp(-j*2*beta*ell)))', 'The impedance there is `Z = Z_0*(1 + Gamma)/(1 - Gamma)` with `Z_c` in place of `Z_0`.'],
      ['Z_in = Z_c*(((Z_L + Z_c)*exp(j*beta*ell) + (Z_L - Z_c)*exp(-j*beta*ell))/((Z_L + Z_c)*exp(j*beta*ell) - (Z_L - Z_c)*exp(-j*beta*ell)))', 'Put in `Gamma_c = (Z_L - Z_c)/(Z_L + Z_c)` and multiply above and below by `(Z_L + Z_c)*exp(j*beta*ell)`.'],
      ['Z_in = Z_c*((Z_L*cos(beta*ell) + j*Z_c*sin(beta*ell))/(Z_c*cos(beta*ell) + j*Z_L*sin(beta*ell)))', 'Write `exp(j*beta*ell) = cos(beta*ell) + j*sin(beta*ell)` and `exp(-j*beta*ell) = cos(beta*ell) - j*sin(beta*ell)`; the factors 2 cancel.'],
      ['Z_in = Z_c*((Z_L + j*Z_c*tan(beta*ell))/(Z_c + j*Z_L*tan(beta*ell)))', 'Divide above and below by `cos(beta*ell)`.'],
    ],
  },
  {
    id: 'line-rotation', title: 'Rotation on a matched line', text: 'Gamma_in = Gamma_L*exp(-j*2*theta)', sources: [src(E, '§3.15'), src(E, '§3.17'), src(S3, '§3.4')],
    assumptions: [LOSSLESS, 'the line’s Z_c equals Z₀'], engine: 'network.evaluate (LINE with Z_c = Z₀)',
    steps: [
      ['Gamma_in = Gamma_c*exp(-j*2*beta*ell)', '`Gamma` is the reflected voltage wave over the incident one. Moving `ell` towards the source, the incident wave gains `exp(j*beta*ell)` and the reflected `exp(-j*beta*ell)`, so their ratio turns by `exp(-j*2*beta*ell)` (`Gamma_c` against the line’s `Z_c`).'],
      ['Gamma_in = Gamma_L*exp(-j*2*theta)', 'With `Z_c = Z_0` the line’s `Gamma_c` is the chart’s `Gamma_L`, and `beta*ell` is `theta`.'],
    ],
  },
  { id: 'line-theta', title: 'Electrical length', text: 'theta = beta*ell = 2*pi*ell/lambda', sources: [src(E, '§3.15'), src(E, '§3.17')], assumptions: [LOSSLESS], engine: 'parts.turnsFromMetres' },
  { id: 'beta', title: 'Phase constant', text: 'beta = 2*pi/lambda = omega/v_p', sources: [src(E, '§3.15')], assumptions: [LOSSLESS], engine: 'parts.turnsFromMetres, parts.metresFromTurns' },
  { id: 'omega', title: 'Angular frequency', text: 'omega = 2*pi*f', sources: [src(W, '"Circuit elements and topology"')], assumptions: [EJWT], engine: 'parts.added (SERIES_L)' },
  {
    id: 'quarter-wave', title: 'Quarter-wave transformer', text: 'Z_in = Z_t^2/Z_L', sources: [src(E, '§3.19'), src(S2, '§2.4')], assumptions: [LOSSLESS, 'ℓ = λ/4 at the frequency'],
    engine: 'network.evaluate (QUARTER at f0)',
    steps: [
      ['Z_in = Z_t*((Z_L*cos(beta*ell) + j*Z_t*sin(beta*ell))/(Z_t*cos(beta*ell) + j*Z_L*sin(beta*ell)))', 'The input impedance of a line of `Z_t`.'],
      ['Z_in = Z_t*((j*Z_t)/(j*Z_L))', 'At `ell = lambda/4`, `beta*ell = pi/2`: `cos(beta*ell) = 0` and `sin(beta*ell) = 1`.'],
      ['Z_in = Z_t^2/Z_L', 'The `j` cancels.'],
    ],
  },
  {
    id: 'quarter-wave-match', title: 'Quarter-wave match', text: 'Z_t = sqrt(Z_0*R_L)', sources: [src(E, '§3.19'), src(S2, '§2.4')], assumptions: [LOSSLESS, 'ℓ = λ/4 + nλ/2', 'resistive load'],
    engine: 'network.inputGamma (QUARTER) is 0',
    steps: [
      ['Z_0 = Z_t^2/R_L', 'A match needs the input impedance `Z_t^2/R_L` to equal `Z_0` (the same for `ell = lambda/4 + n*lambda/2`: `tan(beta*ell)` repeats every half wave).'],
      ['Z_t^2 = Z_0*R_L', 'Multiply by `R_L`.'],
      ['Z_t = sqrt(Z_0*R_L)', 'Take the positive root: a line’s impedance `Z_t` is positive.'],
    ],
  },
  // M7.4b: the band of a match (theory-sweep.md §12; notes-M7.4a.md "New registry entries").
  {
    id: 'fractional-bandwidth', title: 'Fractional bandwidth', text: 'FBW = (f_hi - f_lo)/f_0', sources: [],
    derivation: 'A definition: the interval below the limit that holds f0, over f0 (the band’s middle would differ when the band is lopsided).',
    engine: 'sweep.bandFigures (atF0, fractional)',
  },
  {
    id: 'q-loaded', title: 'Loaded Q', text: 'Q_L = f_m/(f_2 - f_1)', sources: [src(WQ, '"Bandwidth definition"')],
    derivation: 'The resonator’s Q applied to the power delivered, 1 − |Γ|²: f₁ and f₂ are where it is half its value at the best point f_m near f0, |Γ|² = (1 + |Γ_m|²)/2.',
    engine: 'sweep.bandFigures (q)',
  },
  {
    id: 'q-series-rlc', title: 'Loaded Q of a series resonator', text: 'Q_L = omega_0*L/(R + Z_0) = 1/(omega_0*C*(R + Z_0))', sources: [src(WQ, '"RLC circuits"')],
    assumptions: [EJWT, REAL_Z0, 'load R in series with L and C, f0 = 1/(2π√(LC))'], engine: 'sweep.bandFigures (q)',
    steps: [
      ['omega_2*L - 1/(omega_2*C) = R + Z_0', 'The power delivered, `4*R*Z_0/((R + Z_0)^2 + X^2)` of the incident power, is half its peak where `X^2 = (R + Z_0)^2`; above f0 the reactance is positive.'],
      ['omega_1*L - 1/(omega_1*C) = -(R + Z_0)', 'Below f0 it is negative.'],
      ['omega_2*omega_1 = 1/(L*C)', 'Add the two: `(omega_2 + omega_1)*L = (omega_2 + omega_1)/(omega_2*omega_1*C)`.'],
      ['omega_2 - omega_1 = (R + Z_0)/L', 'Subtract them; with `omega_2*omega_1 = 1/(L*C)`, `1/(omega_1*C) - 1/(omega_2*C) = (omega_2 - omega_1)*L`.'],
      ['Q_L = omega_0*L/(R + Z_0) = 1/(omega_0*C*(R + Z_0))', 'The reactance is zero at `omega_0`, so the best point is f0 and `Q_L = omega_0/(omega_2 - omega_1)`; and `omega_0*L = 1/(omega_0*C)`.'],
    ],
  },
  {
    id: 'fbw-series-rlc', title: 'Band of a series resonator', text: 'FBW = X_m/(omega_0*L) = X_m/(Q_L*(R + Z_0))', sources: [],
    derivation: 'From the resonator’s reactance at the limit, as its loaded Q from the reactance at half power.',
    assumptions: [EJWT, REAL_Z0, 'load R in series with L and C, f0 = 1/(2π√(LC))', 'Γ_m > |R − Z₀|/(R + Z₀)'], engine: 'sweep.bandFigures (atF0, fractional)',
    steps: [
      ['X_m^2 = (Gamma_m^2*(R + Z_0)^2 - (R - Z_0)^2)/(1 - Gamma_m^2)', 'The input is `R + j*X`, so `abs(Gamma)^2 = ((R - Z_0)^2 + X^2)/((R + Z_0)^2 + X^2)`, which grows with `X^2`; set it to `Gamma_m^2` and solve for `X^2`.'],
      ['omega_2 - omega_1 = X_m/L', 'As for the loaded Q of a series resonator, with `X_m` in place of `R + Z_0`.'],
      ['FBW = X_m/(omega_0*L) = X_m/(Q_L*(R + Z_0))', 'The band over f0 is `(omega_2 - omega_1)/omega_0`, and `omega_0*L = Q_L*(R + Z_0)`.'],
    ],
  },
  {
    id: 'l-network-slope', title: 'How fast an L network leaves the match', text: 'v_Gamma = Q^2/sqrt(1 + Q^2)', sources: [],
    derivation: 'Differentiate the input admittance of the L network in δ = (f − f0)/f0 at f0.',
    assumptions: [EJWT, REAL_Z0, 'resistive load R_L < Z₀, series part next to it'], engine: 'sweep.markerAt (central difference)',
    symbols: { r: sym('normalised load resistance R_L/Z₀', '', 'load') },
    steps: [
      ['r*(1 + Q^2) = 1', 'The Q of an L network, with `R_high = Z_0` and `R_low = R_L`, normalised by `Z_0`.'],
      ['y_d = j*Q - j*Q*(1 + Q^2)/(1 + j*s*Q)^2', 'The shunt part’s `b` changes by `abs(b) = Q`. The series leg `1/(r + j*x)` changes by `-j*abs(x)/(r + j*x)^2`, as `x` changes by `abs(x) = Q*r` for an inductor and a capacitor alike; with `r + j*x = r*(1 + j*s*Q)` and `r = 1/(1 + Q^2)`.'],
      ['y_d = -2*s*Q^2/(1 + j*s*Q)', 'Write `1 + Q^2 = (1 + j*s*Q)*(1 - j*s*Q)`, so the fraction is `j*Q*(1 - j*s*Q)/(1 + j*s*Q)`.'],
      ['v_Gamma = abs(y_d)/2 = Q^2/sqrt(1 + Q^2)', 'Near the centre `Gamma = (1 - y)/(1 + y)` changes by minus half the change of `y`, and `abs(1 + j*s*Q) = sqrt(1 + Q^2)`.'],
    ],
  },
  {
    id: 'quarter-wave-bandwidth', title: 'Band of a λ/4 transformer',
    text: 'FBW = 2 - 4/pi*arccos(2*Gamma_m*sqrt(Z_0*R_L)/(abs(R_L - Z_0)*sqrt(1 - Gamma_m^2)))', sources: [],
    derivation: 'notes-M7.1.md; the textbook result (Pozar) was not opened.',
    assumptions: [LOSSLESS, EJWT, 'resistive load, Z_t = √(Z₀·R_L)'], engine: 'sweep.bandFigures (fractional)',
    steps: [
      ['Z_in = Z_t*(R_L + j*Z_t*tan(theta))/(Z_t + j*R_L*tan(theta))', 'The input impedance of a line of `Z_t`, `theta` long at f, on `R_L`.'],
      ['abs(Gamma)^2 = (R_L - Z_0)^2/((R_L - Z_0)^2 + 4*Z_0*R_L*(1 + tan(theta)^2))', 'With `Z_t^2 = Z_0*R_L`, `Z_in - Z_0` is in proportion to `Z_t*(R_L - Z_0)` and `Z_in + Z_0` to `Z_t*(R_L + Z_0) + 2*j*tan(theta)*Z_0*R_L`; and `(R_L + Z_0)^2 = (R_L - Z_0)^2 + 4*Z_0*R_L`.'],
      ['cos(theta_m)^2 = 4*Gamma_m^2*Z_0*R_L/((R_L - Z_0)^2*(1 - Gamma_m^2))', 'Set `abs(Gamma) = Gamma_m` at the band’s lower edge `theta_m`, and use `1 + tan(theta)^2 = 1/cos(theta)^2`.'],
      ['FBW = 2 - 4*theta_m/pi', 'As `theta` grows in proportion to f, f0 is at `pi/2`, and `tan(theta)^2` is symmetric about it: the band runs from `theta_m` to `pi - theta_m`, f from `2*theta_m/pi*f_0` to `(2 - 2*theta_m/pi)*f_0`.'],
      ['FBW = 2 - 4*theta_m/pi = 2 - 4/pi*arccos(2*Gamma_m*sqrt(Z_0*R_L)/(abs(R_L - Z_0)*sqrt(1 - Gamma_m^2)))', 'The edge `theta_m` is the arccos of the root of the line before, between 0 and `pi/2`.'],
    ],
  },
  // Stubs (eqs. 21–23).
  { id: 'stub-short-z', title: 'Shorted line', text: 'Z_in = j*Z_c*tan(beta*ell)', sources: [src(E, '§3.16'), src(S2, '§2.4')], assumptions: [LOSSLESS], engine: 'network.evaluate (LINE on a short)' },
  { id: 'stub-open-z', title: 'Open line', text: 'Z_in = -j*Z_c*cot(beta*ell)', sources: [src(E, '§3.16'), src(S2, '§2.4')], assumptions: [LOSSLESS], engine: 'network.evaluate (LINE on an open)' },
  {
    id: 'stub-short-b', title: 'Susceptance of a shorted shunt stub', text: 'b = B*Z_0 = -Y_c*Z_0*cot(beta*ell) = -Z_0/Z_c*cot(beta*ell)',
    sources: [src(E, '§3.23')], derivation: 'Normalised with y = Y·Z₀.', assumptions: [LOSSLESS, REAL_Z0], engine: 'parts.added (STUB_SHORT)',
  },
  {
    id: 'stub-open-b', title: 'Susceptance of an open shunt stub', text: 'b = B*Z_0 = Y_c*Z_0*tan(beta*ell) = Z_0/Z_c*tan(beta*ell)',
    sources: [src(E, '§3.23')], derivation: 'Normalised with y = Y·Z₀.', assumptions: [LOSSLESS, REAL_Z0], engine: 'parts.added (STUB_OPEN)',
  },
  { id: 'stub-short-l', title: 'Inductance of a shorted stub', text: 'L_s = Z_c/omega*tan(beta*ell)', sources: [src(S2, '§2.4')], assumptions: [LOSSLESS, 'one frequency'], engine: 'network.evaluate (LINE on a short)' },
  { id: 'stub-open-c', title: 'Capacitance of an open stub', text: 'C_o = tan(beta*ell)/(omega*Z_c)', sources: [src(S2, '§2.4')], assumptions: [LOSSLESS, 'one frequency'], engine: 'network.evaluate (LINE on an open)' },
  // Lumped parts (eq. 24).
  { id: 'r-series', title: 'Series resistor', text: 'r = R/Z_0', sources: [src(W, '"Circuit elements and topology"')], assumptions: [REAL_Z0], engine: 'parts.added (SERIES_R)' },
  { id: 'g-shunt', title: 'Shunt resistor', text: 'g = Z_0/R', sources: [src(W, '"Circuit elements and topology"')], assumptions: [REAL_Z0], engine: 'parts.added (SHUNT_R)' },
  { id: 'x-series-l', title: 'Series inductor', text: 'x = X/Z_0 = omega*L/Z_0', sources: [src(W, '"Circuit elements and topology"')], assumptions: [EJWT, REAL_Z0], engine: 'parts.added (SERIES_L)' },
  { id: 'x-series-c', title: 'Series capacitor', text: 'x = X/Z_0 = -1/(omega*C*Z_0)', sources: [src(W, '"Circuit elements and topology"')], assumptions: [EJWT, REAL_Z0], engine: 'parts.added (SERIES_C)' },
  { id: 'b-shunt-c', title: 'Shunt capacitor', text: 'b = B*Z_0 = omega*C*Z_0', sources: [src(W, '"Circuit elements and topology"')], assumptions: [EJWT, REAL_Z0], engine: 'parts.added (SHUNT_C)' },
  { id: 'b-shunt-l', title: 'Shunt inductor', text: 'b = B*Z_0 = -Z_0/(omega*L)', sources: [src(W, '"Circuit elements and topology"')], assumptions: [EJWT, REAL_Z0], engine: 'parts.added (SHUNT_L)' },
  { id: 'z-inductor', title: 'Impedance of an inductor', text: 'Z = j*omega*L', sources: [src(W, '"Circuit elements and topology"')], assumptions: [EJWT], engine: 'parts.added (SERIES_L)' },
  { id: 'z-capacitor', title: 'Impedance of a capacitor', text: 'Z = 1/(j*omega*C) = -j/(omega*C)', sources: [src(W, '"Circuit elements and topology"')], assumptions: [EJWT], engine: 'parts.added (SERIES_C)' },
  { id: 'y-capacitor', title: 'Admittance of a capacitor', text: 'Y = j*omega*C', sources: [src(W, '"Circuit elements and topology"')], assumptions: [EJWT], engine: 'parts.added (SHUNT_C)' },
  { id: 'y-inductor', title: 'Admittance of an inductor', text: 'Y = 1/(j*omega*L) = -j/(omega*L)', sources: [src(W, '"Circuit elements and topology"')], assumptions: [EJWT], engine: 'parts.added (SHUNT_L)' },
  // Series adds z, shunt adds y (learning.md §4).
  {
    id: 'series-adds-z', title: 'A series part adds its impedance', text: 'z_in = z_L + z_s', sources: [src(S3, '§2.2.6')],
    derivation: 'From the ABCD matrix [1 Z_s; 0 1] of a series part.', assumptions: [REAL_Z0, OUT_OF_PORT_2], engine: 'network.applyPart (series parts)',
    steps: [
      ['z_in = V_1/(I_1*Z_0)', 'The normalised impedance at the input.'],
      ['z_in = (V_2 + Z_s*I_2)/(I_2*Z_0)', 'Across a series part `V_1 = V_2 + Z_s*I_2` and `I_1 = I_2`.'],
      ['z_in = V_2/(I_2*Z_0) + Z_s/Z_0 = z_L + z_s', 'Split the fraction: the first term is the impedance at the output.'],
    ],
  },
  {
    id: 'shunt-adds-y', title: 'A shunt part adds its admittance', text: 'y_in = y_L + y_p', sources: [src(S3, '§2.2.6')],
    derivation: 'From the ABCD matrix [1 0; Y_p 1] of a shunt part.', assumptions: [REAL_Z0, OUT_OF_PORT_2], engine: 'network.applyPart (shunt parts and stubs)',
    steps: [
      ['y_in = I_1*Z_0/V_1', 'The normalised admittance at the input.'],
      ['y_in = (Y_p*V_2 + I_2)*Z_0/V_2', 'Across a shunt part `V_1 = V_2` and `I_1 = Y_p*V_2 + I_2`.'],
      ['y_in = I_2*Z_0/V_2 + Y_p*Z_0 = y_L + y_p', 'Split the fraction: the first term is the admittance at the output.'],
    ],
  },
  // Matching with two parts, series next to the load and shunt nearest the source (learning.md §4, step M5.3; theory.md §7).
  {
    id: 'match-two-parts', title: 'Matching with two parts', text: 'y_in = 1/(r_L + j*(x_L + x_s)) + j*b_p = 1',
    sources: [src(S3, '§6.7')],
    derivation: 'Series adds z, then shunt adds y; the series part must land the point on the g = 1 circle (theory.md §7).',
    assumptions: [REAL_Z0, 'lossless parts', '0 < r_L ≤ 1'], engine: 'network.evaluate of the series and shunt part built from x_s and b_p',
    symbols: {
      z_L: sym('normalised impedance of the load', '', 'load'),
      r_L: sym('normalised resistance of the load', '', 'load'), x_L: sym('normalised reactance of the load', '', 'load'),
      x_s: sym('normalised reactance of the series part', '', 'part'), b_p: sym('normalised susceptance of the shunt part', '', 'part'),
      z_1: sym('normalised impedance between the two parts', '', 'node'), y_1: sym('normalised admittance between the two parts', '', 'node'),
      x_1: sym('normalised reactance between the two parts', '', 'node'),
      y_in: sym('normalised admittance at the input', '', 'input'),
    },
    steps: [
      ['z_1 = z_L + j*x_s = r_L + j*(x_L + x_s) = r_L + j*x_1', 'The series part next to the load adds `j*x_s` and keeps `r` (series adds `z`); `x_1 = x_L + x_s`.'],
      ['y_1 = 1/z_1 = r_L/(r_L^2 + x_1^2) - j*(x_1/(r_L^2 + x_1^2))', 'Turn it over and multiply above and below by `r_L - j*x_1`.'],
      ['r_L/(r_L^2 + x_1^2) = 1', 'The shunt part keeps `g`, so the series part must land the point on the `g = 1` circle: `Re(y_1) = 1`.'],
      ['x_1^2 = r_L*(1 - r_L)', 'Multiply out: `r_L = r_L^2 + x_1^2`. A real `x_1` needs `r_L` of at most 1; its two signs are the two solutions.'],
      ['x_s = x_1 - x_L', 'The series part to add, for either sign of `x_1`.'],
      ['y_1 = 1 - j*(x_1/r_L)', 'With `r_L^2 + x_1^2 = r_L` the imaginary part is `-x_1/r_L`.'],
      ['b_p = x_1/r_L', 'The shunt part must cancel that susceptance.'],
      ['y_in = y_1 + j*b_p = 1', 'It adds `j*b_p` (shunt adds `y`): `y_in = 1`, the centre of the chart.'],
    ],
  },
  // ABCD (eqs. 25–28).
  { id: 'abcd', title: 'ABCD matrix of a two-port', text: '[V_1; I_1] = [A, B; C, D]*[V_2; I_2]', sources: [src(S3, '§2.2.6')], assumptions: ['I₂ flows out of port 2'], engine: 'parts.partMatrix, network.applyPart', symbols: ABCD_SYMBOLS },
  { id: 'abcd-cascade', title: 'Parts in cascade', text: '[A, B; C, D] = [A_1, B_1; C_1, D_1]*[A_2, B_2; C_2, D_2]', sources: [src(S3, '§2.2.6')], assumptions: ['I₂ flows out of port 2'], engine: 'network.applyPart twice', symbols: ABCD_SYMBOLS },
  { id: 'abcd-reciprocal', title: 'A reciprocal two-port', text: 'A*D - B*C = 1', sources: [src(S3, '§2.2.6')], assumptions: ['reciprocal two-port'], engine: 'parts.partMatrix', symbols: ABCD_SYMBOLS },
  { id: 'abcd-series', title: 'ABCD of a series impedance', text: '[A, B; C, D] = [1, Z; 0, 1]', sources: [src(S3, 'Table 2.2.6.1')], assumptions: [], engine: 'parts.partMatrix (series parts)', symbols: ABCD_SYMBOLS },
  { id: 'abcd-shunt', title: 'ABCD of a shunt admittance', text: '[A, B; C, D] = [1, 0; Y, 1]', sources: [src(S3, 'Table 2.2.6.1')], assumptions: [], engine: 'parts.partMatrix (shunt parts)', symbols: ABCD_SYMBOLS },
  {
    id: 'abcd-line', title: 'ABCD of a line', text: '[A, B; C, D] = [cos(beta*ell), j*Z_c*sin(beta*ell); j*Y_c*sin(beta*ell), cos(beta*ell)]',
    sources: [src(S3, 'Table 2.2.6.1')], assumptions: [LOSSLESS], engine: 'parts.partMatrix (LINE, QUARTER)', symbols: ABCD_SYMBOLS,
  },
  { id: 'abcd-stub-short', title: 'ABCD of a shorted shunt stub', text: '[A, B; C, D] = [1, 0; -j/(Z_c*tan(theta)), 1]', sources: [src(S3, 'Table 2.2.6.1')], assumptions: [LOSSLESS], engine: 'parts.partMatrix (STUB_SHORT)', symbols: ABCD_SYMBOLS },
  { id: 'abcd-stub-open', title: 'ABCD of an open shunt stub', text: '[A, B; C, D] = [1, 0; j*tan(theta)/Z_c, 1]', sources: [src(S3, 'Table 2.2.6.1')], assumptions: [LOSSLESS], engine: 'parts.partMatrix (STUB_OPEN)', symbols: ABCD_SYMBOLS },
  {
    id: 'abcd-zin', title: 'Input impedance of a two-port', text: 'Z_in = (A*Z_L + B)/(C*Z_L + D)', sources: [],
    derivation: 'Put V_2 = Z_L I_2 into the ABCD matrix (facts.md eq. 27); [S3] does not print it.', assumptions: ['I₂ flows out of port 2'], engine: 'network.evaluate (one part)', symbols: ABCD_SYMBOLS,
    steps: [
      ['V_1 = A*V_2 + B*I_2 = (A*Z_L + B)*I_2', 'The first row with `V_2 = Z_L*I_2`.'],
      ['I_1 = C*V_2 + D*I_2 = (C*Z_L + D)*I_2', 'The second row.'],
      ['Z_in = V_1/I_1 = (A*Z_L + B)/(C*Z_L + D)', 'Divide; `I_2` cancels.'],
    ],
  },
  // A part maps Γ by a Möbius transformation (theory.md §4, claims 67–69): abcd-zin conjugated by z-gamma and gamma-z.
  {
    id: 'mobius', title: 'A part maps Γ by a Möbius transformation', text: 'Gamma_in = (a*Gamma_L + b)/(c*Gamma_L + d)',
    sources: [src('WikiMobius', '"Elementary properties"')],
    derivation: 'abcd-zin with Z_L = Z_0 (1 + Γ_L)/(1 − Γ_L) (z-gamma), then gamma-z for Γ_in; a, b, c, d up to a common factor. A series z gives a = 2 − z, b = z, c = −z, d = 2 + z.',
    assumptions: [REAL_Z0, 'ideal part, fixed value'], engine: 'geometry.partMobius, geometry.mobApply',
    symbols: {
      ...ABCD_SYMBOLS,
      a: sym('entry a of the part’s map of Γ', '', 'part'), b: sym('entry b of the part’s map of Γ', '', 'part'),
      c: sym('entry c of the part’s map of Γ', '', 'part'), d: sym('entry d of the part’s map of Γ', '', 'part'),
    },
    steps: [
      ['Z_in = Z_0*((A*(1 + Gamma_L) + B/Z_0*(1 - Gamma_L))/(C*Z_0*(1 + Gamma_L) + D*(1 - Gamma_L)))', 'Put `Z_L = Z_0*(1 + Gamma_L)/(1 - Gamma_L)` into `Z_in = (A*Z_L + B)/(C*Z_L + D)` and multiply above and below by `1 - Gamma_L`.'],
      ['Gamma_in = (Z_in - Z_0)/(Z_in + Z_0) = (A*(1 + Gamma_L) + B/Z_0*(1 - Gamma_L) - C*Z_0*(1 + Gamma_L) - D*(1 - Gamma_L))/(A*(1 + Gamma_L) + B/Z_0*(1 - Gamma_L) + C*Z_0*(1 + Gamma_L) + D*(1 - Gamma_L))', 'Take `Gamma = (Z - Z_0)/(Z + Z_0)` of it: `Z_0` cancels, leaving the difference of the two brackets over their sum.'],
      ['Gamma_in = ((A - B/Z_0 - C*Z_0 + D)*Gamma_L + A + B/Z_0 - C*Z_0 - D)/((A - B/Z_0 + C*Z_0 - D)*Gamma_L + A + B/Z_0 + C*Z_0 + D)', 'Multiply out and collect the terms in `Gamma_L` above and below the line.'],
      ['a = A - B/Z_0 - C*Z_0 + D', 'Read off the coefficient of `Gamma_L` above the line.'],
      ['b = A + B/Z_0 - C*Z_0 - D', 'The constant term above the line.'],
      ['c = A - B/Z_0 + C*Z_0 - D', 'The coefficient of `Gamma_L` below the line.'],
      ['d = A + B/Z_0 + C*Z_0 + D', 'The constant term below the line.'],
      ['Gamma_in = (a*Gamma_L + b)/(c*Gamma_L + d)', 'So `Gamma_in` is a ratio of first-degree expressions in `Gamma_L`: a Möbius transformation.'],
    ],
  },
  { id: 'node-z', title: 'Impedance at a node', text: 'z = V/(I*Z_0)', sources: [], derivation: 'A node is (V, I) at the port towards the load (engine.md §4).', assumptions: [REAL_Z0], engine: 'network.nodeMetrics' },
];

function build(d: Def): Equation {
  const tree = parse(d.text);
  const steps = (d.steps ?? []).map(([text, why]): Step => ({ text, tree: parse(text), why, reason: parseReason(why) }));
  const variables = variablesOf(tree);
  for (const s of steps) variablesOf(s.tree, variables);
  return {
    id: d.id, title: d.title, text: d.text, tree, sources: d.sources ?? [], derivation: d.derivation, owner: d.owner,
    assumptions: d.assumptions ?? [], steps, engine: d.engine, variables, symbols: d.symbols,
  };
}

const t0 = typeof performance !== 'undefined' ? performance.now() : 0;

/** Every equation of the tool, parsed. */
export const EQUATIONS: readonly Equation[] = DEFS.map(build);

/** Milliseconds this module took to parse the registry when it loaded. */
export const PARSE_MS = typeof performance !== 'undefined' ? performance.now() - t0 : 0;

export const EQUATION_BY_ID: ReadonlyMap<string, Equation> = new Map(EQUATIONS.map((e) => [e.id, e]));

/** What a variable means in an entry (its own symbols first, then SYMBOLS); undefined for an unknown name. */
export function symbolOf(eq: Equation, name: string): SymbolInfo | undefined {
  return eq.symbols?.[name] ?? SYMBOLS[name];
}
