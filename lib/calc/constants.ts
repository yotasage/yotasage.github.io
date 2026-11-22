// Exact CODATA 2018/2022 SI physical constants and mathematical constants
// for the Smart Calculator engine. Framework-free; zero external dependencies.

import {
  type Dim,
  DIM_ACCEL,
  DIM_ACTION,
  DIM_CHARGE,
  DIM_ENTROPY,
  DIM_INV_AMOUNT,
  DIM_MASS,
  DIM_MOLAR_ENTROPY,
  DIM_PERMEABILITY,
  DIM_PERMITTIVITY,
  DIM_RESISTANCE,
  DIM_VELOCITY,
  DIM_ZERO,
} from './units';

export interface PhysicalConstant {
  name: string;
  aliases: readonly string[];
  symbol: string;
  latex: string;
  description: string;
  value: number;
  dim: Dim;
  unitDisplay: string;
}

const C_LIGHT = 299_792_458; // exact, m/s
const MU_0 = 1.25663706127e-6; // CODATA 2022, H/m
const EPS_0 = 1 / (MU_0 * C_LIGHT * C_LIGHT); // 8.8541878188e-12 F/m (exact relation eps0 * mu0 * c^2 = 1)
const Z_0 = MU_0 * C_LIGHT; // 376.730313412 Ω (exact relation sqrt(mu0 / eps0) = mu0 * c)
const K_B = 1.380649e-23; // exact (2019 SI), J/K
const Q_E = 1.602176634e-19; // exact (2019 SI), C
const H_PLANCK = 6.62607015e-34; // exact (2019 SI), J·s
const H_BAR = H_PLANCK / (2 * Math.PI);
const N_AVOGADRO = 6.02214076e23; // exact (2019 SI), 1/mol
const R_GAS = K_B * N_AVOGADRO; // 8.31446261815324 J/(mol·K)

export const CONSTANTS: readonly PhysicalConstant[] = [
  {
    name: 'pi',
    aliases: ['π', 'PI'],
    symbol: 'π',
    latex: '\\pi',
    description: 'Archimedes constant (circle circumference to diameter)',
    value: Math.PI,
    dim: DIM_ZERO,
    unitDisplay: '',
  },
  {
    name: 'e',
    aliases: [],
    symbol: 'e',
    latex: 'e',
    description: "Euler's number (base of the natural logarithm)",
    value: Math.E,
    dim: DIM_ZERO,
    unitDisplay: '',
  },
  {
    name: 'c',
    aliases: ['c0', 'c_0'],
    symbol: 'c₀',
    latex: 'c_0',
    description: 'Speed of light in vacuum (exact)',
    value: C_LIGHT,
    dim: DIM_VELOCITY,
    unitDisplay: 'm/s',
  },
  {
    name: 'k_B',
    aliases: ['kB', 'k_b'],
    symbol: 'k_B',
    latex: 'k_B',
    description: 'Boltzmann constant (exact)',
    value: K_B,
    dim: DIM_ENTROPY,
    unitDisplay: 'J/K',
  },
  {
    name: 'q',
    aliases: ['q_e', 'e_charge'],
    symbol: 'q',
    latex: 'q',
    description: 'Elementary charge (exact)',
    value: Q_E,
    dim: DIM_CHARGE,
    unitDisplay: 'C',
  },
  {
    name: 'eps0',
    aliases: ['epsilon0', 'eps_0', 'ε₀', 'ε0'],
    symbol: 'ε₀',
    latex: '\\varepsilon_0',
    description: 'Vacuum electric permittivity (CODATA 2022)',
    value: EPS_0,
    dim: DIM_PERMITTIVITY,
    unitDisplay: 'F/m',
  },
  {
    name: 'mu0',
    aliases: ['mu_0', 'µ₀', 'μ₀', 'µ0', 'μ0'],
    symbol: 'µ₀',
    latex: '\\mu_0',
    description: 'Vacuum magnetic permeability (CODATA 2022)',
    value: MU_0,
    dim: DIM_PERMEABILITY,
    unitDisplay: 'H/m',
  },
  {
    name: 'Z0',
    aliases: ['eta0', 'Z_0', 'η₀', 'η0'],
    symbol: 'Z₀',
    latex: 'Z_0',
    description: 'Characteristic impedance of free space (√(µ₀/ε₀))',
    value: Z_0,
    dim: DIM_RESISTANCE,
    unitDisplay: 'Ω',
  },
  {
    name: 'h',
    aliases: ['h_planck'],
    symbol: 'h',
    latex: 'h',
    description: 'Planck constant (exact)',
    value: H_PLANCK,
    dim: DIM_ACTION,
    unitDisplay: 'J·s',
  },
  {
    name: 'hbar',
    aliases: ['ħ', 'h_bar'],
    symbol: 'ħ',
    latex: '\\hbar',
    description: 'Reduced Planck constant (h / 2π)',
    value: H_BAR,
    dim: DIM_ACTION,
    unitDisplay: 'J·s',
  },
  {
    name: 'g0',
    aliases: ['g_n', 'g_0'],
    symbol: 'g₀',
    latex: 'g_0',
    description: 'Standard acceleration of gravity (exact)',
    value: 9.80665,
    dim: DIM_ACCEL,
    unitDisplay: 'm/s²',
  },
  {
    name: 'N_A',
    aliases: ['NA', 'N_a'],
    symbol: 'N_A',
    latex: 'N_A',
    description: 'Avogadro constant (exact)',
    value: N_AVOGADRO,
    dim: DIM_INV_AMOUNT,
    unitDisplay: '1/mol',
  },
  {
    name: 'R_gas',
    aliases: ['R_mol'],
    symbol: 'R',
    latex: 'R',
    description: 'Molar gas constant (k_B · N_A)',
    value: R_GAS,
    dim: DIM_MOLAR_ENTROPY,
    unitDisplay: 'J/(mol·K)',
  },
  {
    name: 'm_e',
    aliases: [],
    symbol: 'm_e',
    latex: 'm_e',
    description: 'Electron mass (CODATA 2022)',
    value: 9.1093837139e-31,
    dim: DIM_MASS,
    unitDisplay: 'kg',
  },
  {
    name: 'm_p',
    aliases: [],
    symbol: 'm_p',
    latex: 'm_p',
    description: 'Proton mass (CODATA 2022)',
    value: 1.67262192595e-27,
    dim: DIM_MASS,
    unitDisplay: 'kg',
  },
];

const CONSTANT_MAP = new Map<string, PhysicalConstant>();
for (const c of CONSTANTS) {
  CONSTANT_MAP.set(c.name, c);
  for (const alias of c.aliases) {
    CONSTANT_MAP.set(alias, c);
  }
}

/** Look up a built-in physical or mathematical constant by primary name or alias. */
export function lookupConstant(name: string): PhysicalConstant | null {
  return CONSTANT_MAP.get(name) ?? null;
}
