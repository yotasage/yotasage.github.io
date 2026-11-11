// The part model of the design mode: what a resistor is at a temperature, and the tolerance and temperature
// coefficient that each technology is usually made with (docs/resistor/facts.md, "Technologies").
//
// A resistor of nominal value R is R·(1 + d)·(1 + a·(T − Tref)) at the temperature T, with the deviation d anywhere
// within ± tolerance and the temperature coefficient a anywhere within ± TCR.

// The temperature at which the nominal value and the tolerance hold, in °C.
export const REFERENCE_TEMPERATURE = 25;

// The temperatures a design is checked at unless others are given, in °C.
export const DESIGN_TEMPERATURES = [-40, 25, 85, 125];

export interface PartSpec {
  // ± percent of the nominal value at the reference temperature.
  tolerancePct: number;
  // ± ppm per kelvin.
  tcrPpm: number;
}

export type TechnologyId = 'thick-film' | 'thin-film' | 'metal-film' | 'carbon-film' | 'metal-oxide' | 'foil' | 'wirewound';

export interface Technology extends PartSpec {
  id: TechnologyId;
  label: string;
  // What the technology is made in: the tightest and the loosest usual tolerance (percent) and TCR (ppm/K).
  tolerances: [number, number];
  tcrs: [number, number];
  note: string;
}

// `tolerancePct` and `tcrPpm` are a usual part of the kind: a starting point, not a limit.
export const TECHNOLOGIES: Technology[] = [
  { id: 'thick-film', label: 'Thick film', tolerancePct: 1, tcrPpm: 100, tolerances: [1, 5], tcrs: [100, 200], note: 'Most chip resistors; ±200 ppm/K below 10 Ω' },
  { id: 'thin-film', label: 'Thin film', tolerancePct: 0.1, tcrPpm: 25, tolerances: [0.1, 2], tcrs: [5, 50], note: 'Precision chip resistors' },
  { id: 'metal-film', label: 'Metal film', tolerancePct: 1, tcrPpm: 50, tolerances: [0.1, 2], tcrs: [50, 100], note: 'Leaded resistors and MELF' },
  { id: 'carbon-film', label: 'Carbon film', tolerancePct: 5, tcrPpm: 500, tolerances: [2, 10], tcrs: [200, 1000], note: 'Cheap leaded resistors' },
  { id: 'metal-oxide', label: 'Metal oxide', tolerancePct: 5, tcrPpm: 300, tolerances: [1, 5], tcrs: [75, 300], note: 'Leaded power resistors' },
  { id: 'foil', label: 'Metal foil', tolerancePct: 0.01, tcrPpm: 2, tolerances: [0.005, 0.1], tcrs: [0.2, 5], note: 'The most stable resistors' },
  { id: 'wirewound', label: 'Wirewound', tolerancePct: 0.1, tcrPpm: 20, tolerances: [0.005, 5], tcrs: [1, 20], note: 'Precision and power; inductive' },
];

export function technology(id: string): Technology | undefined {
  return TECHNOLOGIES.find((entry) => entry.id === id);
}

// The tolerances and temperature coefficients that parts are sold with, loosest first: the steps `neededSpec` tries.
export const TOLERANCE_STEPS = [20, 10, 5, 2, 1, 0.5, 0.25, 0.1, 0.05, 0.02, 0.01, 0.005];
export const TCR_STEPS = [1000, 500, 200, 100, 50, 25, 15, 10, 5, 2, 1];

// What a part with a deviation (percent) and a temperature coefficient (ppm/K) is at a temperature, as a factor of
// its nominal value.
export function partFactor(deviationPct: number, tcrPpm: number, temperature: number, reference = REFERENCE_TEMPERATURE): number {
  return (1 + deviationPct / 100) * (1 + tcrPpm * 1e-6 * (temperature - reference));
}

export function resistanceAt(ohms: number, deviationPct: number, tcrPpm: number, temperature: number, reference = REFERENCE_TEMPERATURE): number {
  return ohms * partFactor(deviationPct, tcrPpm, temperature, reference);
}

// The smallest and the largest factor of a part of this kind at a temperature.
export function partLimits(spec: PartSpec, temperature: number, reference = REFERENCE_TEMPERATURE): { low: number; high: number } {
  const t = Math.abs(spec.tolerancePct) / 100;
  const drift = Math.abs(spec.tcrPpm * 1e-6 * (temperature - reference));
  return { low: (1 - t) * (1 - drift), high: (1 + t) * (1 + drift) };
}
