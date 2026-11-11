// Sizes of chip resistors and of axial through-hole bodies (docs/resistor/facts.md). Power ratings are typical: they
// vary by maker and series. A missing voltage was not found. Checked against the datasheets named in
// docs/resistor/sources.md (Vishay CRCW, Yageo RC, Yageo CFR, Vishay MRS); the 1812 row has no datasheet behind it.

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
  // Limiting element voltage, in volts (Yageo's maximum working voltage), and what another maker gives.
  voltage?: number;
  voltageNote?: string;
  // No datasheet was found for this row.
  unverified?: boolean;
  // Temperature at which the rated power has fallen to zero, in °C.
  maxTemperature: number;
  // Whether parts of this size usually carry a marking.
  marked: 'no' | 'rarely' | 'some' | 'yes';
}

export const CHIP_SIZES: ChipSize[] = [
  { imperial: '01005', metric: '0402', length: 0.4, width: 0.2, termination: 0.1, power: 0.031, maxTemperature: 125, marked: 'no' },
  { imperial: '0201', metric: '0603', length: 0.6, width: 0.3, termination: 0.15, power: 0.05, voltage: 25, voltageNote: 'Vishay 30 V', maxTemperature: 125, marked: 'no' },
  { imperial: '0402', metric: '1005', length: 1.0, width: 0.5, termination: 0.2, power: 0.063, voltage: 50, maxTemperature: 155, marked: 'rarely' },
  { imperial: '0603', metric: '1608', length: 1.6, width: 0.8, termination: 0.3, power: 0.1, voltage: 75, maxTemperature: 155, marked: 'some' },
  { imperial: '0805', metric: '2012', length: 2.0, width: 1.25, termination: 0.4, power: 0.125, voltage: 150, maxTemperature: 155, marked: 'yes' },
  { imperial: '1206', metric: '3216', length: 3.2, width: 1.6, termination: 0.5, power: 0.25, voltage: 200, maxTemperature: 155, marked: 'yes' },
  { imperial: '1210', metric: '3225', length: 3.2, width: 2.5, termination: 0.5, power: 0.5, voltage: 200, maxTemperature: 155, marked: 'yes' },
  { imperial: '1812', metric: '4532', length: 4.5, width: 3.2, termination: 0.6, power: 0.75, maxTemperature: 155, marked: 'yes', unverified: true },
  { imperial: '2010', metric: '5025', length: 5.0, width: 2.5, termination: 0.6, power: 0.75, voltage: 200, voltageNote: 'Vishay 400 V', maxTemperature: 155, marked: 'yes' },
  { imperial: '2512', metric: '6332', length: 6.3, width: 3.2, termination: 0.6, power: 1, voltage: 200, voltageNote: 'Vishay 500 V', maxTemperature: 155, marked: 'yes' },
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

// The bodies of Yageo's CFR carbon film series (CFR-12, -25, -50, -100), rated at 70 °C.
export const AXIAL_BODIES: AxialBody[] = [
  { rating: '1/6 W', power: 0.167, length: 3.4, diameter: 1.9, leadDiameter: 0.45 },
  { rating: '1/4 W', power: 0.25, length: 6.3, diameter: 2.4, leadDiameter: 0.55 },
  { rating: '1/2 W', power: 0.5, length: 9.0, diameter: 3.3, leadDiameter: 0.55 },
  { rating: '1 W', power: 1, length: 11.5, diameter: 4.5, leadDiameter: 0.8 },
];

// Rated power at an ambient temperature: full up to 70 °C, then falling in a line to zero at the maximum temperature.
export function deratedPower(power: number, temperature: number, maxTemperature = 155): number {
  if (temperature <= 70) return power;
  return Math.max(0, (power * (maxTemperature - temperature)) / (maxTemperature - 70));
}
