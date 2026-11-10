// Sizes of chip resistors and of axial through-hole bodies (docs/resistor/facts.md). Power ratings are typical: they
// vary by maker and series. A missing voltage was not found.

export interface ChipSize {
  // Imperial and metric names. Imperial 0402 and metric 0402 are different parts, so both are always shown.
  imperial: string;
  metric: string;
  // Millimetres.
  length: number;
  width: number;
  // Typical length of the metal termination at each end, seen from above, in millimetres (from datasheets, by maker).
  termination: number;
  // Typical rated power at 70 °C, in watts.
  power: number;
  // Limiting element voltage, in volts.
  voltage?: number;
  // Temperature at which the rated power has fallen to zero, in °C.
  maxTemperature: number;
  // Whether parts of this size usually carry a marking.
  marked: 'no' | 'rarely' | 'some' | 'yes';
}

export const CHIP_SIZES: ChipSize[] = [
  { imperial: '01005', metric: '0402', length: 0.4, width: 0.2, termination: 0.1, power: 0.031, maxTemperature: 125, marked: 'no' },
  { imperial: '0201', metric: '0603', length: 0.6, width: 0.3, termination: 0.15, power: 0.05, maxTemperature: 125, marked: 'no' },
  { imperial: '0402', metric: '1005', length: 1.0, width: 0.5, termination: 0.2, power: 0.063, voltage: 50, maxTemperature: 155, marked: 'rarely' },
  { imperial: '0603', metric: '1608', length: 1.6, width: 0.8, termination: 0.3, power: 0.1, voltage: 75, maxTemperature: 155, marked: 'some' },
  { imperial: '0805', metric: '2012', length: 2.0, width: 1.25, termination: 0.4, power: 0.125, voltage: 150, maxTemperature: 155, marked: 'yes' },
  { imperial: '1206', metric: '3216', length: 3.2, width: 1.6, termination: 0.5, power: 0.25, maxTemperature: 155, marked: 'yes' },
  { imperial: '1210', metric: '3225', length: 3.2, width: 2.5, termination: 0.5, power: 0.5, maxTemperature: 155, marked: 'yes' },
  { imperial: '1812', metric: '4532', length: 4.5, width: 3.2, termination: 0.6, power: 0.75, maxTemperature: 155, marked: 'yes' },
  { imperial: '2010', metric: '5025', length: 5.0, width: 2.5, termination: 0.6, power: 0.75, maxTemperature: 155, marked: 'yes' },
  { imperial: '2512', metric: '6332', length: 6.3, width: 3.2, termination: 0.6, power: 1, voltage: 200, maxTemperature: 155, marked: 'yes' },
];

export interface AxialBody {
  // "1/4 W"
  rating: string;
  // Watts.
  power: number;
  // Millimetres. The body size does not fix the rating: modern metal film in the 1/4 W body is rated higher.
  length: number;
  diameter: number;
  leadDiameter: number;
}

// Unverified, from search snippets (facts.md).
export const AXIAL_BODIES: AxialBody[] = [
  { rating: '1/8 W', power: 0.125, length: 3.0, diameter: 1.8, leadDiameter: 0.45 },
  { rating: '1/4 W', power: 0.25, length: 6.5, diameter: 2.5, leadDiameter: 0.6 },
  { rating: '1/2 W', power: 0.5, length: 8.5, diameter: 3.2, leadDiameter: 0.6 },
  { rating: '1 W', power: 1, length: 11, diameter: 5, leadDiameter: 0.8 },
];

// Rated power at an ambient temperature: full up to 70 °C, then falling in a line to zero at the maximum temperature.
export function deratedPower(power: number, temperature: number, maxTemperature = 155): number {
  if (temperature <= 70) return power;
  return Math.max(0, (power * (maxTemperature - temperature)) / (maxTemperature - 70));
}
