// Shareable bidirectional Equation Layouts (`SmartCalcLayoutV1`), curated presets,
// strict JSON import/export validator, and bidirectional solver for Smart Calculator.
// Framework-free; zero external dependencies; no node:* imports.

import { exprToLatex, exprToText } from './ast';
import { evalAstNumeric, evaluateInput } from './eval';
import { parseEquation, solveEquationNumeric, solveEquationSymbolic } from './invert';
import { parseExpression } from './parse';
import { dimIsZero, parseUnitExpr, suggestConversions, type UnitSpec } from './units';
import {
  CalcError,
  type CalcValue,
  type CompanionHint,
  formatBaseSI,
  formatValueLatex,
  formatValueText,
  fromNumberAndUnit,
  getCompanionHints,
  vConvert,
} from './value';

export type LayoutCategory = 'rc-rlc' | 'rf-waves' | 'power-dc' | 'decibels' | 'geometry' | 'custom';

export interface LayoutVariable {
  symbol: string;
  label: string;
  defaultUnit?: string;
  example?: string;
}

export interface LayoutSolverOverride {
  expr: string;
  latex?: string;
}

export interface SmartCalcLayoutV1 {
  schemaVersion: 1;
  id: string;
  name: string;
  category: LayoutCategory;
  description: string;
  equation: string;
  latex?: string;
  variables: LayoutVariable[];
  solvers?: Record<string, LayoutSolverOverride>;
  builtIn?: boolean;
}

export interface SmartCalcLayoutBundleV1 {
  schemaVersion: 1;
  layouts: SmartCalcLayoutV1[];
}

export interface LayoutSolveResult {
  solveFor: string;
  value: CalcValue;
  text: string;
  latex: string;
  baseSI: string;
  formulaLatex: string;
  expressionText: string;
  calculatorExpr: string;
  hints: CompanionHint[];
  conversions: UnitSpec[];
  method: 'preset' | 'symbolic' | 'numeric';
}

export const LAYOUT_CATEGORIES: readonly LayoutCategory[] = [
  'rc-rlc',
  'rf-waves',
  'power-dc',
  'decibels',
  'geometry',
  'custom',
];

const VALID_CATEGORY_SET = new Set<string>(LAYOUT_CATEGORIES);

const preset = (l: Omit<SmartCalcLayoutV1, 'schemaVersion' | 'builtIn'>): SmartCalcLayoutV1 => ({
  schemaVersion: 1,
  builtIn: true,
  ...l,
});

export const BUILTIN_LAYOUTS: readonly SmartCalcLayoutV1[] = [
  // RC & RLC
  preset({
    id: 'rc-time-constant',
    name: 'RC Time Constant',
    category: 'rc-rlc',
    description: 'Time constant of a first-order RC circuit.',
    equation: 'tau = R * C',
    latex: '\\tau = R \\cdot C',
    variables: [
      { symbol: 'tau', label: 'Time constant (τ)', defaultUnit: 's', example: '1 us' },
      { symbol: 'R', label: 'Resistance (R)', defaultUnit: 'ohm', example: '10 kOhm' },
      { symbol: 'C', label: 'Capacitance (C)', defaultUnit: 'F', example: '100 pF' },
    ],
    solvers: {
      tau: { expr: 'R * C', latex: '\\tau = R \\cdot C' },
      R: { expr: 'tau / C', latex: 'R = \\frac{\\tau}{C}' },
      C: { expr: 'tau / R', latex: 'C = \\frac{\\tau}{R}' },
    },
  }),
  preset({
    id: 'rc-cutoff',
    name: 'RC Cutoff Frequency',
    category: 'rc-rlc',
    description: '−3 dB corner frequency of a first-order RC filter.',
    equation: 'f_c = 1 / (2 * pi * R * C)',
    latex: 'f_c = \\frac{1}{2\\pi R C}',
    variables: [
      { symbol: 'f_c', label: 'Cutoff frequency (f_c)', defaultUnit: 'Hz', example: '159.15 kHz' },
      { symbol: 'R', label: 'Resistance (R)', defaultUnit: 'ohm', example: '10 kOhm' },
      { symbol: 'C', label: 'Capacitance (C)', defaultUnit: 'F', example: '100 pF' },
    ],
    solvers: {
      f_c: { expr: '1 / (2 * pi * R * C)', latex: 'f_c = \\frac{1}{2\\pi R C}' },
      R: { expr: '1 / (2 * pi * f_c * C)', latex: 'R = \\frac{1}{2\\pi f_c C}' },
      C: { expr: '1 / (2 * pi * f_c * R)', latex: 'C = \\frac{1}{2\\pi f_c R}' },
    },
  }),
  preset({
    id: 'rl-time-constant',
    name: 'RL Time Constant',
    category: 'rc-rlc',
    description: 'Time constant of a first-order RL circuit.',
    equation: 'tau = L / R',
    latex: '\\tau = \\frac{L}{R}',
    variables: [
      { symbol: 'tau', label: 'Time constant (τ)', defaultUnit: 's', example: '200 ns' },
      { symbol: 'L', label: 'Inductance (L)', defaultUnit: 'H', example: '10 uH' },
      { symbol: 'R', label: 'Resistance (R)', defaultUnit: 'ohm', example: '50 ohm' },
    ],
    solvers: {
      tau: { expr: 'L / R', latex: '\\tau = \\frac{L}{R}' },
      L: { expr: 'tau * R', latex: 'L = \\tau \\cdot R' },
      R: { expr: 'L / tau', latex: 'R = \\frac{L}{\\tau}' },
    },
  }),
  preset({
    id: 'lc-resonance',
    name: 'LC Resonant Frequency',
    category: 'rc-rlc',
    description: 'Resonant frequency of an ideal series or parallel LC tank.',
    equation: 'f_0 = 1 / (2 * pi * sqrt(L * C))',
    latex: 'f_0 = \\frac{1}{2\\pi\\sqrt{LC}}',
    variables: [
      { symbol: 'f_0', label: 'Resonant frequency (f₀)', defaultUnit: 'Hz', example: '15.915 MHz' },
      { symbol: 'L', label: 'Inductance (L)', defaultUnit: 'H', example: '1 uH' },
      { symbol: 'C', label: 'Capacitance (C)', defaultUnit: 'F', example: '100 pF' },
    ],
    solvers: {
      f_0: { expr: '1 / (2 * pi * sqrt(L * C))', latex: 'f_0 = \\frac{1}{2\\pi\\sqrt{LC}}' },
      L: { expr: '1 / ((2 * pi * f_0)^2 * C)', latex: 'L = \\frac{1}{(2\\pi f_0)^2 C}' },
      C: { expr: '1 / ((2 * pi * f_0)^2 * L)', latex: 'C = \\frac{1}{(2\\pi f_0)^2 L}' },
    },
  }),
  preset({
    id: 'capacitive-reactance',
    name: 'Capacitive Reactance',
    category: 'rc-rlc',
    description: 'Magnitude of capacitive reactance X_C at frequency f.',
    equation: 'X_C = 1 / (2 * pi * f * C)',
    latex: 'X_C = \\frac{1}{2\\pi f C}',
    variables: [
      { symbol: 'X_C', label: 'Reactance (X_C)', defaultUnit: 'ohm', example: '1.592 kOhm' },
      { symbol: 'f', label: 'Frequency (f)', defaultUnit: 'Hz', example: '1 MHz' },
      { symbol: 'C', label: 'Capacitance (C)', defaultUnit: 'F', example: '100 pF' },
    ],
    solvers: {
      X_C: { expr: '1 / (2 * pi * f * C)', latex: 'X_C = \\frac{1}{2\\pi f C}' },
      f: { expr: '1 / (2 * pi * X_C * C)', latex: 'f = \\frac{1}{2\\pi X_C C}' },
      C: { expr: '1 / (2 * pi * f * X_C)', latex: 'C = \\frac{1}{2\\pi f X_C}' },
    },
  }),
  preset({
    id: 'inductive-reactance',
    name: 'Inductive Reactance',
    category: 'rc-rlc',
    description: 'Magnitude of inductive reactance X_L at frequency f.',
    equation: 'X_L = 2 * pi * f * L',
    latex: 'X_L = 2\\pi f L',
    variables: [
      { symbol: 'X_L', label: 'Reactance (X_L)', defaultUnit: 'ohm', example: '62.83 ohm' },
      { symbol: 'f', label: 'Frequency (f)', defaultUnit: 'Hz', example: '10 MHz' },
      { symbol: 'L', label: 'Inductance (L)', defaultUnit: 'H', example: '1 uH' },
    ],
    solvers: {
      X_L: { expr: '2 * pi * f * L', latex: 'X_L = 2\\pi f L' },
      f: { expr: 'X_L / (2 * pi * L)', latex: 'f = \\frac{X_L}{2\\pi L}' },
      L: { expr: 'X_L / (2 * pi * f)', latex: 'L = \\frac{X_L}{2\\pi f}' },
    },
  }),

  // RF & Waves
  preset({
    id: 'period-frequency',
    name: 'Period & Frequency',
    category: 'rf-waves',
    description: 'Reciprocal relationship between period T and frequency f.',
    equation: 'T = 1 / f',
    latex: 'T = \\frac{1}{f}',
    variables: [
      { symbol: 'T', label: 'Period (T)', defaultUnit: 's', example: '10 ns' },
      { symbol: 'f', label: 'Frequency (f)', defaultUnit: 'Hz', example: '100 MHz' },
    ],
    solvers: {
      T: { expr: '1 / f', latex: 'T = \\frac{1}{f}' },
      f: { expr: '1 / T', latex: 'f = \\frac{1}{T}' },
    },
  }),
  preset({
    id: 'angular-frequency',
    name: 'Angular Frequency',
    category: 'rf-waves',
    description: 'Convert between linear frequency f and angular frequency ω.',
    equation: 'omega = 2 * pi * f',
    latex: '\\omega = 2\\pi f',
    variables: [
      { symbol: 'omega', label: 'Angular frequency (ω)', defaultUnit: 'rad/s', example: '6.283e6 rad/s' },
      { symbol: 'f', label: 'Frequency (f)', defaultUnit: 'Hz', example: '1 MHz' },
    ],
    solvers: {
      omega: { expr: '(2 * pi * f) to rad/s', latex: '\\omega = 2\\pi f' },
      f: { expr: 'omega / (2 * pi)', latex: 'f = \\frac{\\omega}{2\\pi}' },
    },
  }),
  preset({
    id: 'wavelength-freespace',
    name: 'Wavelength (Free Space)',
    category: 'rf-waves',
    description: 'Electromagnetic wavelength in vacuum λ = c / f.',
    equation: 'lambda = c / f',
    latex: '\\lambda = \\frac{c}{f}',
    variables: [
      { symbol: 'lambda', label: 'Wavelength (λ)', defaultUnit: 'm', example: '124.9 mm' },
      { symbol: 'f', label: 'Frequency (f)', defaultUnit: 'Hz', example: '2.4 GHz' },
    ],
    solvers: {
      lambda: { expr: 'c / f', latex: '\\lambda = \\frac{c}{f}' },
      f: { expr: 'c / lambda', latex: 'f = \\frac{c}{\\lambda}' },
    },
  }),

  // Power & DC
  preset({
    id: 'ohms-law',
    name: "Ohm's Law",
    category: 'power-dc',
    description: 'Voltage, current, and resistance relationship.',
    equation: 'V = I * R',
    latex: 'V = I \\cdot R',
    variables: [
      { symbol: 'V', label: 'Voltage (V)', defaultUnit: 'V', example: '3.3 V' },
      { symbol: 'I', label: 'Current (I)', defaultUnit: 'A', example: '10 mA' },
      { symbol: 'R', label: 'Resistance (R)', defaultUnit: 'ohm', example: '330 ohm' },
    ],
    solvers: {
      V: { expr: 'I * R', latex: 'V = I \\cdot R' },
      I: { expr: 'V / R', latex: 'I = \\frac{V}{R}' },
      R: { expr: 'V / I', latex: 'R = \\frac{V}{I}' },
    },
  }),
  preset({
    id: 'dc-power-vi',
    name: 'Electrical Power (V · I)',
    category: 'power-dc',
    description: 'Power dissipated from voltage and current.',
    equation: 'P = V * I',
    latex: 'P = V \\cdot I',
    variables: [
      { symbol: 'P', label: 'Power (P)', defaultUnit: 'W', example: '1.25 W' },
      { symbol: 'V', label: 'Voltage (V)', defaultUnit: 'V', example: '5 V' },
      { symbol: 'I', label: 'Current (I)', defaultUnit: 'A', example: '250 mA' },
    ],
    solvers: {
      P: { expr: 'V * I', latex: 'P = V \\cdot I' },
      V: { expr: 'P / I', latex: 'V = \\frac{P}{I}' },
      I: { expr: 'P / V', latex: 'I = \\frac{P}{V}' },
    },
  }),
  preset({
    id: 'power-v2-r',
    name: 'Power from Voltage & Resistance',
    category: 'power-dc',
    description: 'Resistor power dissipation P = V² / R.',
    equation: 'P = V^2 / R',
    latex: 'P = \\frac{V^2}{R}',
    variables: [
      { symbol: 'P', label: 'Power (P)', defaultUnit: 'W', example: '20 mW' },
      { symbol: 'V', label: 'Voltage (V)', defaultUnit: 'V', example: '1 V' },
      { symbol: 'R', label: 'Resistance (R)', defaultUnit: 'ohm', example: '50 ohm' },
    ],
    solvers: {
      P: { expr: 'V^2 / R', latex: 'P = \\frac{V^2}{R}' },
      V: { expr: 'sqrt(P * R)', latex: 'V = \\sqrt{P \\cdot R}' },
      R: { expr: 'V^2 / P', latex: 'R = \\frac{V^2}{P}' },
    },
  }),
  preset({
    id: 'voltage-divider',
    name: 'Voltage Divider',
    category: 'power-dc',
    description: 'Unloaded resistive voltage divider V_out = V_in · R₂ / (R₁ + R₂).',
    equation: 'V_out = V_in * R_2 / (R_1 + R_2)',
    latex: 'V_{\\text{out}} = V_{\\text{in}} \\cdot \\frac{R_2}{R_1 + R_2}',
    variables: [
      { symbol: 'V_out', label: 'Output voltage (V_out)', defaultUnit: 'V', example: '3.3 V' },
      { symbol: 'V_in', label: 'Input voltage (V_in)', defaultUnit: 'V', example: '5 V' },
      { symbol: 'R_1', label: 'Top resistor (R₁)', defaultUnit: 'ohm', example: '5.1 kOhm' },
      { symbol: 'R_2', label: 'Bottom resistor (R₂)', defaultUnit: 'ohm', example: '10 kOhm' },
    ],
    solvers: {
      V_out: { expr: 'V_in * R_2 / (R_1 + R_2)', latex: 'V_{\\text{out}} = V_{\\text{in}} \\cdot \\frac{R_2}{R_1 + R_2}' },
      V_in: { expr: 'V_out * (R_1 + R_2) / R_2', latex: 'V_{\\text{in}} = V_{\\text{out}} \\cdot \\frac{R_1 + R_2}{R_2}' },
      R_1: { expr: 'R_2 * (V_in - V_out) / V_out', latex: 'R_1 = R_2 \\cdot \\frac{V_{\\text{in}} - V_{\\text{out}}}{V_{\\text{out}}}' },
      R_2: { expr: 'R_1 * V_out / (V_in - V_out)', latex: 'R_2 = R_1 \\cdot \\frac{V_{\\text{out}}}{V_{\\text{in}} - V_{\\text{out}}}' },
    },
  }),
  preset({
    id: 'parallel-resistors',
    name: 'Parallel Resistors',
    category: 'power-dc',
    description: 'Equivalent resistance of two resistors in parallel.',
    equation: 'R_eq = (R_1 * R_2) / (R_1 + R_2)',
    latex: 'R_{\\text{eq}} = \\frac{R_1 R_2}{R_1 + R_2}',
    variables: [
      { symbol: 'R_eq', label: 'Equivalent (R_eq)', defaultUnit: 'ohm', example: '3.333 kOhm' },
      { symbol: 'R_1', label: 'Resistor 1 (R₁)', defaultUnit: 'ohm', example: '10 kOhm' },
      { symbol: 'R_2', label: 'Resistor 2 (R₂)', defaultUnit: 'ohm', example: '5 kOhm' },
    ],
    solvers: {
      R_eq: { expr: '(R_1 * R_2) / (R_1 + R_2)', latex: 'R_{\\text{eq}} = \\frac{R_1 R_2}{R_1 + R_2}' },
      R_1: { expr: '(R_eq * R_2) / (R_2 - R_eq)', latex: 'R_1 = \\frac{R_{\\text{eq}} R_2}{R_2 - R_{\\text{eq}}}' },
      R_2: { expr: '(R_eq * R_1) / (R_1 - R_eq)', latex: 'R_2 = \\frac{R_{\\text{eq}} R_1}{R_1 - R_{\\text{eq}}}' },
    },
  }),

  // Decibels
  preset({
    id: 'dbm-watts',
    name: 'dBm ↔ Power (W)',
    category: 'decibels',
    description: 'Convert between RF power level in dBm and linear power in Watts.',
    equation: 'P_dBm = dbm(P_W)',
    latex: 'P_{\\text{dBm}} = 10\\log_{10}\\!\\left(\\frac{P_W}{1\\,\\text{mW}}\\right)',
    variables: [
      { symbol: 'P_dBm', label: 'Power level (dBm)', defaultUnit: 'dBm', example: '20 dBm' },
      { symbol: 'P_W', label: 'Linear power (W)', defaultUnit: 'W', example: '100 mW' },
    ],
    solvers: {
      P_dBm: { expr: 'P_W to dBm', latex: 'P_{\\text{dBm}} = 10\\log_{10}\\!\\left(\\frac{P_W}{1\\,\\text{mW}}\\right)' },
      P_W: { expr: 'fromDbm(P_dBm)', latex: 'P_W = 10^{(P_{\\text{dBm}} - 30)/10}\\,\\text{W}' },
    },
  }),
  preset({
    id: 'db-voltage-ratio',
    name: 'dB ↔ Voltage Ratio',
    category: 'decibels',
    description: 'Voltage gain or attenuation in dB (20·log₁₀(V_out / V_in)).',
    equation: 'G_dB = db(V_out / V_in)',
    latex: 'G_{\\text{dB}} = 20\\log_{10}\\!\\left(\\frac{V_{\\text{out}}}{V_{\\text{in}}}\\right)',
    variables: [
      { symbol: 'G_dB', label: 'Gain (dB)', defaultUnit: 'dB', example: '6.02 dB' },
      { symbol: 'V_out', label: 'Output voltage (V_out)', defaultUnit: 'V', example: '2 V' },
      { symbol: 'V_in', label: 'Input voltage (V_in)', defaultUnit: 'V', example: '1 V' },
    ],
    solvers: {
      G_dB: { expr: 'db(V_out / V_in)', latex: 'G_{\\text{dB}} = 20\\log_{10}\\!\\left(\\frac{V_{\\text{out}}}{V_{\\text{in}}}\\right)' },
      V_out: { expr: 'V_in * fromDb(G_dB)', latex: 'V_{\\text{out}} = V_{\\text{in}} \\cdot 10^{G_{\\text{dB}}/20}' },
      V_in: { expr: 'V_out / fromDb(G_dB)', latex: 'V_{\\text{in}} = \\frac{V_{\\text{out}}}{10^{G_{\\text{dB}}/20}}' },
    },
  }),

  // Geometry
  preset({
    id: 'rect-area',
    name: 'Rectangle Area',
    category: 'geometry',
    description: 'Area of a rectangle (e.g. IC die, PCB pad, trace cross-section).',
    equation: 'A = w * h',
    latex: 'A = w \\cdot h',
    variables: [
      { symbol: 'A', label: 'Area (A)', defaultUnit: 'mm^2', example: '1000 um^2' },
      { symbol: 'w', label: 'Width (w)', defaultUnit: 'mm', example: '25 um' },
      { symbol: 'h', label: 'Height (h)', defaultUnit: 'mm', example: '40 um' },
    ],
    solvers: {
      A: { expr: 'w * h', latex: 'A = w \\cdot h' },
      w: { expr: 'A / h', latex: 'w = \\frac{A}{h}' },
      h: { expr: 'A / w', latex: 'h = \\frac{A}{w}' },
    },
  }),
  preset({
    id: 'circle-area',
    name: 'Circle Area',
    category: 'geometry',
    description: 'Area of a circle from radius r (e.g. via pad or wire cross-section).',
    equation: 'A = pi * r^2',
    latex: 'A = \\pi r^2',
    variables: [
      { symbol: 'A', label: 'Area (A)', defaultUnit: 'mm^2', example: '0.7854 mm^2' },
      { symbol: 'r', label: 'Radius (r)', defaultUnit: 'mm', example: '0.5 mm' },
    ],
    solvers: {
      A: { expr: 'pi * r^2', latex: 'A = \\pi r^2' },
      r: { expr: 'sqrt(A / pi)', latex: 'r = \\sqrt{\\frac{A}{\\pi}}' },
    },
  }),
  preset({
    id: 'box-volume',
    name: 'Box Volume',
    category: 'geometry',
    description: 'Volume of a rectangular prism V = w · h · d.',
    equation: 'V = w * h * d',
    latex: 'V = w \\cdot h \\cdot d',
    variables: [
      { symbol: 'V', label: 'Volume (V)', defaultUnit: 'cm^3', example: '24 cm^3' },
      { symbol: 'w', label: 'Width (w)', defaultUnit: 'cm', example: '4 cm' },
      { symbol: 'h', label: 'Height (h)', defaultUnit: 'cm', example: '3 cm' },
      { symbol: 'd', label: 'Depth (d)', defaultUnit: 'cm', example: '2 cm' },
    ],
    solvers: {
      V: { expr: 'w * h * d', latex: 'V = w \\cdot h \\cdot d' },
      w: { expr: 'V / (h * d)', latex: 'w = \\frac{V}{h \\cdot d}' },
      h: { expr: 'V / (w * d)', latex: 'h = \\frac{V}{w \\cdot d}' },
      d: { expr: 'V / (w * h)', latex: 'd = \\frac{V}{w \\cdot h}' },
    },
  }),
];

// ---------------------------------------------------------------------------
// JSON Serialization & Strict Validation
// ---------------------------------------------------------------------------

function stripRuntimeFlags(layout: SmartCalcLayoutV1): SmartCalcLayoutV1 {
  const clean: SmartCalcLayoutV1 = {
    schemaVersion: 1,
    id: layout.id,
    name: layout.name,
    category: layout.category,
    description: layout.description,
    equation: layout.equation,
    variables: layout.variables.map((v) => ({
      symbol: v.symbol,
      label: v.label,
      ...(v.defaultUnit ? { defaultUnit: v.defaultUnit } : {}),
      ...(v.example ? { example: v.example } : {}),
    })),
  };
  if (layout.latex) clean.latex = layout.latex;
  if (layout.solvers && Object.keys(layout.solvers).length > 0) clean.solvers = layout.solvers;
  return clean;
}

export function serializeLayout(layout: SmartCalcLayoutV1): string {
  return JSON.stringify(stripRuntimeFlags(layout), null, 2);
}

export function serializeLayoutBundle(layouts: readonly SmartCalcLayoutV1[]): string {
  const bundle: SmartCalcLayoutBundleV1 = {
    schemaVersion: 1,
    layouts: layouts.map(stripRuntimeFlags),
  };
  return JSON.stringify(bundle, null, 2);
}

export type ValidationResult =
  | { ok: true; layouts: SmartCalcLayoutV1[] }
  | { ok: false; errors: string[] };

const SYMBOL_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

function validateSingleLayout(raw: unknown, prefix: string): { layout?: SmartCalcLayoutV1; errors: string[] } {
  const errors: string[] = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { errors: [`${prefix}: expected a JSON object`] };
  }
  const obj = raw as Record<string, unknown>;

  if (obj.schemaVersion !== 1) {
    errors.push(`${prefix}.schemaVersion must be 1`);
  }
  const id = typeof obj.id === 'string' ? obj.id.trim() : '';
  if (!id || id.length > 80) errors.push(`${prefix}.id must be a non-empty string (≤ 80 chars)`);

  const name = typeof obj.name === 'string' ? obj.name.trim() : '';
  if (!name || name.length > 100) errors.push(`${prefix}.name must be a non-empty string (≤ 100 chars)`);

  const category = typeof obj.category === 'string' && VALID_CATEGORY_SET.has(obj.category)
    ? (obj.category as LayoutCategory)
    : 'custom';
  if (obj.category !== undefined && (typeof obj.category !== 'string' || !VALID_CATEGORY_SET.has(obj.category))) {
    errors.push(`${prefix}.category must be one of: ${LAYOUT_CATEGORIES.join(', ')}`);
  }

  const description = typeof obj.description === 'string' ? obj.description.trim() : '';
  const equation = typeof obj.equation === 'string' ? obj.equation.trim() : '';
  if (!equation) {
    errors.push(`${prefix}.equation is required`);
  } else {
    try {
      parseEquation(equation);
    } catch (err) {
      errors.push(`${prefix}.equation invalid: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (!Array.isArray(obj.variables) || obj.variables.length < 2) {
    errors.push(`${prefix}.variables must be an array of at least 2 variables`);
  }

  const variables: LayoutVariable[] = [];
  const seenSyms = new Set<string>();
  if (Array.isArray(obj.variables)) {
    for (let i = 0; i < obj.variables.length; i++) {
      const v = obj.variables[i] as Record<string, unknown> | null;
      if (!v || typeof v !== 'object' || Array.isArray(v)) {
        errors.push(`${prefix}.variables[${i}] must be an object`);
        continue;
      }
      const sym = typeof v.symbol === 'string' ? v.symbol.trim() : '';
      const label = typeof v.label === 'string' ? v.label.trim() : '';
      if (!sym || !SYMBOL_RE.test(sym)) {
        errors.push(`${prefix}.variables[${i}].symbol "${sym}" must be a valid identifier`);
      } else if (seenSyms.has(sym)) {
        errors.push(`${prefix}.variables[${i}].symbol "${sym}" is duplicated`);
      } else {
        seenSyms.add(sym);
      }
      if (!label) errors.push(`${prefix}.variables[${i}].label is required`);
      const defaultUnit = typeof v.defaultUnit === 'string' && v.defaultUnit.trim() ? v.defaultUnit.trim() : undefined;
      if (defaultUnit && !parseUnitExpr(defaultUnit)) {
        errors.push(`${prefix}.variables[${i}].defaultUnit "${defaultUnit}" is not a recognized unit`);
      }
      const example = typeof v.example === 'string' && v.example.trim() ? v.example.trim() : undefined;
      variables.push({ symbol: sym, label: label || sym, defaultUnit, example });
    }
  }

  let solvers: Record<string, LayoutSolverOverride> | undefined;
  if (obj.solvers !== undefined) {
    if (!obj.solvers || typeof obj.solvers !== 'object' || Array.isArray(obj.solvers)) {
      errors.push(`${prefix}.solvers must be an object mapping variable symbols to { expr, latex? }`);
    } else {
      solvers = {};
      for (const [key, val] of Object.entries(obj.solvers as Record<string, unknown>)) {
        if (!val || typeof val !== 'object' || Array.isArray(val)) {
          errors.push(`${prefix}.solvers.${key} must be an object`);
          continue;
        }
        const sv = val as Record<string, unknown>;
        const expr = typeof sv.expr === 'string' ? sv.expr.trim() : '';
        if (!expr) {
          errors.push(`${prefix}.solvers.${key}.expr is required`);
          continue;
        }
        try {
          parseExpression(expr);
        } catch (err) {
          errors.push(`${prefix}.solvers.${key}.expr invalid: ${err instanceof Error ? err.message : String(err)}`);
        }
        solvers[key] = {
          expr,
          latex: typeof sv.latex === 'string' && sv.latex.trim() ? sv.latex.trim() : undefined,
        };
      }
    }
  }

  if (errors.length > 0) return { errors };

  return {
    errors: [],
    layout: {
      schemaVersion: 1,
      id,
      name,
      category,
      description,
      equation,
      latex: typeof obj.latex === 'string' && obj.latex.trim() ? obj.latex.trim() : undefined,
      variables,
      solvers,
    },
  };
}

/** Validate a JSON string containing either a single `SmartCalcLayoutV1` or a `SmartCalcLayoutBundleV1`. */
export function validateLayoutJson(rawText: string): ValidationResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch (err) {
    return { ok: false, errors: [`Invalid JSON: ${err instanceof Error ? err.message : String(err)}`] };
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, errors: ['Root JSON value must be a layout object or bundle object'] };
  }

  const root = parsed as Record<string, unknown>;
  if (Array.isArray(root.layouts)) {
    const errors: string[] = [];
    if (root.schemaVersion !== 1) errors.push('bundle.schemaVersion must be 1');
    if (root.layouts.length === 0) errors.push('bundle.layouts must contain at least one layout');
    const layouts: SmartCalcLayoutV1[] = [];
    for (let i = 0; i < root.layouts.length; i++) {
      const res = validateSingleLayout(root.layouts[i], `layouts[${i}]`);
      errors.push(...res.errors);
      if (res.layout) layouts.push(res.layout);
    }
    return errors.length > 0 ? { ok: false, errors } : { ok: true, layouts };
  }

  const single = validateSingleLayout(root, 'layout');
  if (single.errors.length > 0 || !single.layout) return { ok: false, errors: single.errors };
  return { ok: true, layouts: [single.layout] };
}

// ---------------------------------------------------------------------------
// Bidirectional Layout Solver
// ---------------------------------------------------------------------------

/** Parse a single variable input string, applying `defaultUnit` if the user gave a bare dimensionless number. */
function parseVariableInput(raw: string, variable: LayoutVariable): CalcValue {
  const trimmed = raw.trim();
  if (!trimmed) throw new CalcError(`Enter a value for ${variable.label}`);
  const evaluated = evaluateInput(trimmed);
  if (evaluated.kind !== 'value') {
    throw new CalcError(`${variable.label} must evaluate to a numeric value`);
  }
  const val = evaluated.value;
  if (variable.defaultUnit && dimIsZero(val.dim) && !val.logKind && !val.tempKind && !val.dataKind && !val.angleKind) {
    const defUnit = parseUnitExpr(variable.defaultUnit);
    if (defUnit) {
      return fromNumberAndUnit(val.re, defUnit);
    }
  }
  return val;
}

/** Build a human-friendly calculator expression with substituted input values for "Send to Calculator". */
function buildCalculatorExpr(
  exprStr: string,
  inputs: Readonly<Record<string, string>>,
  variables: readonly LayoutVariable[],
  solveFor: string,
): string {
  const assignments = variables
    .filter((v) => v.symbol !== solveFor && (inputs[v.symbol] ?? '').trim())
    .map((v) => {
      const raw = inputs[v.symbol].trim();
      const needsUnit = v.defaultUnit && /^[+-]?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(raw);
      return `${v.symbol} = ${needsUnit ? `${raw} ${v.defaultUnit}` : raw}`;
    });
  return assignments.length > 0 ? `${assignments.join('\n')}\n${solveFor} = ${exprStr}` : `${solveFor} = ${exprStr}`;
}

/** Solve any variable `solveFor` in `layout` given string values for the remaining variables. */
export function solveLayout(
  layout: SmartCalcLayoutV1,
  solveFor: string,
  inputs: Readonly<Record<string, string>>,
): LayoutSolveResult {
  const targetVar = layout.variables.find((v) => v.symbol === solveFor);
  if (!targetVar) throw new CalcError(`Variable "${solveFor}" is not part of layout "${layout.name}"`);

  const knownVars: Record<string, CalcValue> = {};
  for (const v of layout.variables) {
    if (v.symbol === solveFor) continue;
    knownVars[v.symbol] = parseVariableInput(inputs[v.symbol] ?? '', v);
  }

  let value: CalcValue;
  let formulaLatex: string;
  let expressionText: string;
  let method: 'preset' | 'symbolic' | 'numeric';

  const override = layout.solvers?.[solveFor];
  if (override) {
    const ast = parseExpression(override.expr);
    value = evalAstNumeric(ast, { vars: knownVars });
    expressionText = override.expr;
    formulaLatex = override.latex ?? `${exprToLatex(parseExpression(solveFor))} = ${exprToLatex(ast)}`;
    method = 'preset';
  } else {
    const symbolic = solveEquationSymbolic(layout.equation, solveFor);
    if (symbolic) {
      value = evalAstNumeric(symbolic.expr, { vars: knownVars });
      expressionText = symbolic.text;
      formulaLatex = symbolic.latex;
      method = 'symbolic';
    } else {
      const targetUnit = targetVar.defaultUnit ? parseUnitExpr(targetVar.defaultUnit) : null;
      value = solveEquationNumeric(layout.equation, solveFor, knownVars, targetUnit);
      expressionText = layout.equation;
      const eq = parseEquation(layout.equation);
      formulaLatex = layout.latex ?? `${exprToLatex(eq.lhs)} = ${exprToLatex(eq.rhs)}`;
      method = 'numeric';
    }
  }

  // If target variable's default unit is a log unit (e.g. dBm) or explicit non-SI unit like rad/s, honor it nicely
  if (targetVar.defaultUnit && !value.unitForced) {
    const defUnit = parseUnitExpr(targetVar.defaultUnit);
    if (defUnit && (defUnit.logKind || defUnit.tempKind || defUnit.symbol === 'rad/s')) {
      try {
        value = vConvert(value, defUnit);
      } catch {
        // Keep smart auto-prefixed unit
      }
    }
  }

  return {
    solveFor,
    value,
    text: formatValueText(value),
    latex: formatValueLatex(value),
    baseSI: formatBaseSI(value),
    formulaLatex,
    expressionText,
    calculatorExpr: buildCalculatorExpr(expressionText, inputs, layout.variables, solveFor),
    hints: getCompanionHints(value),
    conversions: suggestConversions({
      dim: value.dim,
      angleKind: value.angleKind,
      logKind: value.logKind,
      tempKind: value.tempKind,
      dataKind: value.dataKind,
    }),
    method,
  };
}

/** Get the display LaTeX for a layout's equation (falling back to AST-generated LaTeX). */
export function getLayoutEquationLatex(layout: SmartCalcLayoutV1): string {
  if (layout.latex) return layout.latex;
  try {
    const eq = parseEquation(layout.equation);
    return `${exprToLatex(eq.lhs)} = ${exprToLatex(eq.rhs)}`;
  } catch {
    return exprToText(parseExpression('0'));
  }
}
