import type { CalcWorkflowTab, StoredVariable } from './storage';

export interface CalcExamplePreset {
  readonly id: string;
  readonly tagKey: string;
  readonly code: string;
  readonly titleKey: string;
  readonly descKey: string;
  readonly workflow: CalcWorkflowTab;
  readonly expr: string;
  readonly variables: readonly StoredVariable[];
  readonly notebookText?: string;
}

export const CALC_EXAMPLES: readonly CalcExamplePreset[] = [
  {
    id: 'rc-cutoff',
    tagKey: 'ex.calc.rc.tag',
    code: 'Units · SI',
    titleKey: 'ex.calc.rc.title',
    descKey: 'ex.calc.rc.desc',
    workflow: 'hybrid',
    expr: '1 / (2 * pi * R * C) to kHz',
    variables: [
      { name: 'R', expr: '10 kOhm' },
      { name: 'C', expr: '10 nF' },
    ],
  },
  {
    id: 'phasor-impedance',
    tagKey: 'ex.calc.phasor.tag',
    code: 'Complex · AC',
    titleKey: 'ex.calc.phasor.title',
    descKey: 'ex.calc.phasor.desc',
    workflow: 'hybrid',
    expr: 'abs(R + j * 2 * pi * f * L)',
    variables: [
      { name: 'R', expr: '50' },
      { name: 'f', expr: '1e6' },
      { name: 'L', expr: '10e-6' },
    ],
  },
  {
    id: 'rf-link',
    tagKey: 'ex.calc.rf.tag',
    code: 'RF · dBm',
    titleKey: 'ex.calc.rf.title',
    descKey: 'ex.calc.rf.desc',
    workflow: 'notebook',
    expr: 'Ptx + Gtx + Grx - FSPL',
    variables: [
      { name: 'Ptx', expr: '20' },
      { name: 'Gtx', expr: '3' },
      { name: 'Grx', expr: '2.15' },
    ],
    notebookText: `# 2.4 GHz Free-Space Link Budget
Ptx = 20
Gtx = 3
Grx = 2.15
d_km = 0.5
f_MHz = 2440
FSPL = 20 * log10(d_km) + 20 * log10(f_MHz) + 32.44
Prx_dBm = Ptx + Gtx + Grx - FSPL
Prx_dBm`,
  },
  {
    id: 'buck-power',
    tagKey: 'ex.calc.buck.tag',
    code: 'Power · Notebook',
    titleKey: 'ex.calc.buck.title',
    descKey: 'ex.calc.buck.desc',
    workflow: 'notebook',
    expr: 'Vout * Iout / eta',
    variables: [
      { name: 'Vin', expr: '24 V' },
      { name: 'Vout', expr: '5 V' },
      { name: 'Iout', expr: '2.5 A' },
      { name: 'eta', expr: '0.91' },
    ],
    notebookText: `# Buck Regulator Thermal & Efficiency Check
Vin = 24 V
Vout = 5 V
Iout = 2.5 A
eta = 0.91
Pout = Vout * Iout
Pin = Pout / eta
Ploss = Pin - Pout
Iin = Pin / Vin`,
  },
  {
    id: 'kinematics',
    tagKey: 'ex.calc.kin.tag',
    code: 'Physics · Units',
    titleKey: 'ex.calc.kin.title',
    descKey: 'ex.calc.kin.desc',
    workflow: 'hybrid',
    expr: '0.5 * m * v^2 to kJ',
    variables: [
      { name: 'm', expr: '1450 kg' },
      { name: 'v', expr: '90 km/h' },
    ],
  },
  {
    id: 'calculus-eval',
    tagKey: 'ex.calc.calc.tag',
    code: 'Symbolic · ∫ / d/dx',
    titleKey: 'ex.calc.calc.title',
    descKey: 'ex.calc.calc.desc',
    workflow: 'hybrid',
    expr: 'integrate(sin(x)^2, x, 0, pi)',
    variables: [],
  },
];
