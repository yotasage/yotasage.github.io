// The circuits of the design mode. Each has one or two resistances (R, or R1 and R2; each may be a network of
// several parts), inputs with a name and a unit, and one output quantity that a target is set for.
//
// The output of every circuit rises or falls steadily with each resistance and with each input, which is what the
// worst-case analysis in design.ts rests on.

import type { Network } from './network';
import { networkValue } from './network';

export type CircuitId = 'single-current' | 'single-voltage' | 'divider' | 'feedback' | 'noninverting' | 'inverting' | 'shunt';
export type CircuitFamily = 'single' | 'divider' | 'ratio' | 'shunt';

// The values of the inputs by their id, in volts, amperes and ohms.
export type Inputs = Record<string, number>;

export interface CircuitInput {
  id: string;
  label: string;
  unit: 'V' | 'A' | 'Ω';
  // An optional input may be left out; `initial` is then used (Infinity: no load).
  optional: boolean;
  initial: number;
  note?: string;
}

export interface Quantity {
  id: string;
  label: string;
  unit: 'V' | 'A' | 'Ω' | 'W' | '';
  value: number;
}

export interface CircuitDef {
  id: CircuitId;
  family: CircuitFamily;
  label: string;
  // The output written with the ids of the inputs and of the resistances.
  formula: string;
  legs: { id: string; role: string }[];
  inputs: CircuitInput[];
  output: { label: string; unit: 'V' | 'A' | '' };
  // The output for the resistances in ohms (`r2` is not used by a circuit with one resistance).
  value(x: Inputs, r1: number, r2: number): number;
  // The resistance `leg` (0 or 1) that gives the target when the other one is `other`; NaN when none does.
  solve(x: Inputs, target: number, leg: number, other: number): number;
  // The current through each resistance, in amperes.
  currents(x: Inputs, r1: number, r2: number): number[];
  // The current that the range `current` of a suggestion limits; NaN when the circuit has none.
  supply(x: Inputs, r1: number, r2: number): number;
  // What else the page reports.
  quantities(x: Inputs, r1: number, r2: number): Quantity[];
  // Why no resistances give this target, or null.
  problem(x: Inputs, target: number): string | null;
}

const parallel = (a: number, b: number) => (Number.isFinite(b) ? (a * b) / (a + b) : a);
const positive = (value: number) => (value > 0 && Number.isFinite(value) ? value : NaN);

const ohmic = (id: CircuitId, family: CircuitFamily, label: string, role: string): CircuitDef => ({
  // A voltage that a known current makes across R.
  id,
  family,
  label,
  formula: 'V = amps · R',
  legs: [{ id: 'R', role }],
  inputs: [{ id: 'amps', label: 'Current', unit: 'A', optional: false, initial: family === 'shunt' ? 5 : 0.01 }],
  output: { label: family === 'shunt' ? 'Sense voltage' : 'Voltage', unit: 'V' },
  value: (x, r1) => x.amps * r1,
  solve: (x, target) => positive(target / x.amps),
  currents: (x) => [x.amps],
  supply: (x) => x.amps,
  quantities: (x, r1) => [
    { id: 'volts', label: family === 'shunt' ? 'Sense voltage' : 'Voltage across R', unit: 'V', value: x.amps * r1 },
    { id: 'power', label: 'Power in R', unit: 'W', value: x.amps * x.amps * r1 },
  ],
  problem: (x, target) => (target / x.amps > 0 && Number.isFinite(target / x.amps) ? null : 'The voltage and the current must have the same sign and not be zero.'),
});

export const CIRCUITS: CircuitDef[] = [
  {
    id: 'single-current',
    family: 'single',
    label: 'Resistor for a current',
    formula: 'I = (volts − drop) / R',
    legs: [{ id: 'R', role: 'in series with the supply' }],
    inputs: [
      { id: 'volts', label: 'Supply voltage', unit: 'V', optional: false, initial: 5 },
      { id: 'drop', label: 'Voltage drop in series', unit: 'V', optional: true, initial: 0, note: 'An LED, a diode or a saturated transistor' },
    ],
    output: { label: 'Current', unit: 'A' },
    value: (x, r1) => (x.volts - x.drop) / r1,
    solve: (x, target) => positive((x.volts - x.drop) / target),
    currents: (x, r1) => [(x.volts - x.drop) / r1],
    supply: (x, r1) => (x.volts - x.drop) / r1,
    quantities: (x, r1) => [
      { id: 'volts', label: 'Voltage across R', unit: 'V', value: x.volts - x.drop },
      { id: 'power', label: 'Power in R', unit: 'W', value: ((x.volts - x.drop) * (x.volts - x.drop)) / r1 },
    ],
    problem: (x, target) => ((x.volts - x.drop) / target > 0 && Number.isFinite((x.volts - x.drop) / target)
      ? null
      : 'The supply must be above the voltage drop, and the current must not be zero.'),
  },
  ohmic('single-voltage', 'single', 'Resistor for a voltage', 'carries the current'),
  {
    id: 'divider',
    family: 'divider',
    label: 'Voltage divider',
    formula: 'Vout = vin · (R2 ∥ load) / (R1 + R2 ∥ load)',
    legs: [{ id: 'R1', role: 'from the input to the output' }, { id: 'R2', role: 'from the output to ground' }],
    inputs: [
      { id: 'vin', label: 'Input voltage', unit: 'V', optional: false, initial: 5 },
      { id: 'load', label: 'Load at the output', unit: 'Ω', optional: true, initial: Infinity, note: 'In parallel with R2' },
    ],
    output: { label: 'Output voltage', unit: 'V' },
    value: (x, r1, r2) => {
      const low = parallel(r2, x.load);
      return (x.vin * low) / (r1 + low);
    },
    solve: (x, target, leg, other) => {
      const k = target / x.vin;
      if (!(k > 0 && k < 1)) return NaN;
      if (leg === 0) return positive((parallel(other, x.load) * (1 - k)) / k);
      const low = (other * k) / (1 - k);
      if (!Number.isFinite(x.load)) return positive(low);
      return low < x.load ? positive((low * x.load) / (x.load - low)) : NaN;
    },
    currents: (x, r1, r2) => {
      const low = parallel(r2, x.load);
      return [x.vin / (r1 + low), (x.vin * low) / (r1 + low) / r2];
    },
    supply: (x, r1, r2) => x.vin / (r1 + parallel(r2, x.load)),
    quantities: (x, r1, r2) => {
      const low = parallel(r2, x.load);
      const out = (x.vin * low) / (r1 + low);
      const list: Quantity[] = [
        { id: 'current', label: 'Current drawn from the input', unit: 'A', value: x.vin / (r1 + low) },
        { id: 'outputResistance', label: 'Output resistance (R1 ∥ R2)', unit: 'Ω', value: (r1 * r2) / (r1 + r2) },
        { id: 'power', label: 'Power drawn from the input', unit: 'W', value: (x.vin * x.vin) / (r1 + low) },
      ];
      if (Number.isFinite(x.load)) {
        list.push({ id: 'unloaded', label: 'Output without the load', unit: 'V', value: (x.vin * r2) / (r1 + r2) });
        list.push({ id: 'loadCurrent', label: 'Current in the load', unit: 'A', value: out / x.load });
      }
      return list;
    },
    problem: (x, target) => (target / x.vin > 0 && target / x.vin < 1 ? null : 'The output of a divider lies between zero and the input voltage.'),
  },
  {
    id: 'feedback',
    family: 'ratio',
    label: 'Regulator feedback',
    formula: 'Vout = vref · (1 + R1 / R2) + ifb · R1',
    legs: [{ id: 'R1', role: 'from the output to the feedback pin' }, { id: 'R2', role: 'across the reference (feedback pin to ground)' }],
    inputs: [
      { id: 'vref', label: 'Reference voltage', unit: 'V', optional: false, initial: 0.8 },
      { id: 'ifb', label: 'Feedback pin current', unit: 'A', optional: true, initial: 0, note: 'Positive when it flows through R1 and raises the output' },
    ],
    output: { label: 'Output voltage', unit: 'V' },
    value: (x, r1, r2) => x.vref * (1 + r1 / r2) + x.ifb * r1,
    solve: (x, target, leg, other) => (leg === 0
      ? positive((target - x.vref) / (x.vref / other + x.ifb))
      : positive((x.vref * other) / (target - x.vref - x.ifb * other))),
    currents: (x, r1, r2) => [x.vref / r2 + x.ifb, x.vref / r2],
    supply: (x, r1, r2) => x.vref / r2,
    quantities: (x, r1, r2) => {
      const list: Quantity[] = [
        { id: 'current', label: 'Current in R2', unit: 'A', value: x.vref / r2 },
        { id: 'power', label: 'Power in R1 and R2', unit: 'W', value: (x.vref / r2 + x.ifb) ** 2 * r1 + (x.vref * x.vref) / r2 },
      ];
      if (x.ifb !== 0) list.push({ id: 'pinShift', label: 'Part of the output from the pin current', unit: 'V', value: x.ifb * r1 });
      return list;
    },
    problem: (x, target) => ((target - x.vref) / x.vref > 0 && Number.isFinite(target / x.vref) ? null : 'The output must be beyond the reference voltage, with the same sign.'),
  },
  {
    id: 'noninverting',
    family: 'ratio',
    label: 'Non-inverting gain',
    formula: 'G = 1 + R1 / R2',
    legs: [{ id: 'R1', role: 'feedback, from the output to the inverting input' }, { id: 'R2', role: 'from the inverting input to ground' }],
    inputs: [{ id: 'vin', label: 'Signal voltage', unit: 'V', optional: true, initial: 0, note: 'Only for the current and power in the parts' }],
    output: { label: 'Gain', unit: '' },
    value: (x, r1, r2) => 1 + r1 / r2,
    solve: (x, target, leg, other) => (leg === 0 ? positive(other * (target - 1)) : positive(other / (target - 1))),
    currents: (x, r1, r2) => [x.vin / r2, x.vin / r2],
    supply: (x, r1, r2) => (x.vin ? x.vin / r2 : NaN),
    quantities: (x, r1, r2) => (x.vin
      ? [
        { id: 'vout', label: 'Output voltage', unit: 'V', value: x.vin * (1 + r1 / r2) },
        { id: 'current', label: 'Current in R1 and R2', unit: 'A', value: x.vin / r2 },
      ]
      : []),
    problem: (x, target) => (target > 1 && Number.isFinite(target) ? null : 'A non-inverting gain is above 1.'),
  },
  {
    id: 'inverting',
    family: 'ratio',
    label: 'Inverting gain',
    formula: 'G = −R2 / R1',
    legs: [{ id: 'R1', role: 'from the signal to the inverting input' }, { id: 'R2', role: 'feedback, from the output to the inverting input' }],
    inputs: [{ id: 'vin', label: 'Signal voltage', unit: 'V', optional: true, initial: 0, note: 'Only for the current and power in the parts' }],
    output: { label: 'Gain', unit: '' },
    value: (x, r1, r2) => -r2 / r1,
    solve: (x, target, leg, other) => (leg === 0 ? positive(-other / target) : positive(-other * target)),
    currents: (x, r1) => [x.vin / r1, x.vin / r1],
    supply: (x, r1) => (x.vin ? x.vin / r1 : NaN),
    quantities: (x, r1, r2) => {
      const list: Quantity[] = [{ id: 'inputResistance', label: 'Input resistance (R1)', unit: 'Ω', value: r1 }];
      if (x.vin) {
        list.push({ id: 'vout', label: 'Output voltage', unit: 'V', value: (-x.vin * r2) / r1 });
        list.push({ id: 'current', label: 'Current in R1 and R2', unit: 'A', value: x.vin / r1 });
      }
      return list;
    },
    problem: (x, target) => (target < 0 && Number.isFinite(target) ? null : 'An inverting gain is negative.'),
  },
  ohmic('shunt', 'shunt', 'Current-sense shunt', 'carries the measured current'),
];

export function circuitDef(id: CircuitId): CircuitDef {
  return CIRCUITS.find((entry) => entry.id === id);
}

// A circuit as the visitor set it: which one, its inputs, and the tolerance of each input in percent (0 when left out).
export interface Circuit {
  id: CircuitId;
  inputs: Inputs;
  tolerances?: Record<string, number>;
}

// The inputs with the optional ones filled in. A load of 0, a negative one and a missing one are no load.
export function circuitInputs(circuit: Circuit): Inputs {
  const out: Inputs = {};
  for (const input of circuitDef(circuit.id).inputs) {
    const given = circuit.inputs?.[input.id];
    const usable = typeof given === 'number' && !Number.isNaN(given) && !(input.id === 'load' && given <= 0);
    out[input.id] = usable ? given : input.initial;
  }
  return out;
}

// The output of a circuit with these resistances (one network for each of the circuit's legs).
export function circuitOutput(circuit: Circuit, legs: Network[]): number {
  const def = circuitDef(circuit.id);
  return def.value(circuitInputs(circuit), networkValue(legs[0]), legs[1] ? networkValue(legs[1]) : NaN);
}

// The resistance that gives the target exactly: of the only leg, or of leg `leg` (0 or 1) when the other one is
// `other` ohms. NaN when no resistance does.
export function idealResistance(circuit: Circuit, target: number, leg = 0, other = NaN): number {
  return circuitDef(circuit.id).solve(circuitInputs(circuit), target, leg, other);
}

// Why no resistances can give this target (a divider above its input, a gain on the wrong side), or null.
export function circuitProblem(circuit: Circuit, target: number): string | null {
  if (!Number.isFinite(target) || target === 0) return 'The target must be a number other than zero.';
  return circuitDef(circuit.id).problem(circuitInputs(circuit), target);
}

// The deviation of a value from the target in percent of the target's size: positive when the value is above the
// target (for a negative gain: −10.1 against −10 is −1 %).
export function deviationPct(value: number, target: number): number {
  return ((value - target) / Math.abs(target)) * 100;
}
