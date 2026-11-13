// The cursor readout of the chart: z, Z, y, Y, Γ (polar and Cartesian), VSWR and return loss of one Γ point, written
// as text by lib/quantity.ts's formatAmount (engineering prefixes, real minus, ∞ for the open and the match). The
// numbers come from lib/smith/convert.ts. Framework-free: the chart's frame loop calls writeReadout with the elements
// of the panel, so a pointer move never re-renders React.

import { FLOOR_TEXT, ROUNDING_FLOOR, belowFloor, formatAmount, formatResidual, formatReturnLoss } from '../../lib/quantity';
import {
  admittanceFromGamma, gammaAngle, gammaMag, impedanceFromGamma, returnLoss, toDegrees, vswr, yFromGamma, zFromGamma,
} from '../../lib/smith/convert';

/** The fields of the readout, in the order of the panel; `data-field` of each value element. */
export const READOUT_FIELDS = ['z', 'Z', 'y', 'Y', 'gamma', 'gammaRect', 'vswr', 'rl', 'note'] as const;
export type ReadoutField = (typeof READOUT_FIELDS)[number];

/** The default of the digits setting (M5.1). */
export const READOUT_DIGITS = 4;
/** The digits setting's choices. */
export const DIGIT_CHOICES: readonly number[] = [3, 4, 5, 6, 8];
const EMPTY = '–';

// The digits setting (M5.1): the significant digits of the readout, the node table, the circuit input and the equation
// panel. The page sets it (main.tsx, kept in localStorage after mount) and re-renders what shows it; the frame loops
// (writeReadout, live.ts) read it here, so a drag frame passes no setting around.
let shown = READOUT_DIGITS;
/** The digits the readouts show now. */
export const shownDigits = (): number => shown;
export function setShownDigits(d: number): void { shown = d; }

/** |Γ| at rounding level (plan.md D20), as every Γ text of the readouts writes it. */
export const GAMMA_BOUND = `|Γ| < ${FLOOR_TEXT}`;
const scratch = new Float64Array(2);

// Every number of the readout has the digits setting's significant digits with its trailing zeros ("1.797 + j1.350",
// "89.83 Ω + j67.50 Ω"), so both parts of a complex value show the same precision and no digit is dropped silently.
const num = (value: number, unit: string, digits: number): string => formatAmount(value, unit, digits, true);

/**
 * re ± j·im with the unit on both parts ("25.00 Ω − j15.00 Ω"); an infinite real part with no imaginary one is "∞ Ω".
 * A part under `floor` that is not an exact 0 is a rounding residual (plan.md D20) and is written as the bound
 * ("1.000 ± j< 1e−12", "50.00 Ω ± j< 50 pΩ"); the floor is ROUNDING_FLOOR for a value without a unit, none for one
 * with a unit unless given (readoutTexts gives 1e-12·Z0 for ohms and 1e-12/Z0 for siemens).
 */
export function complexText(re: number, im: number, unit: string, digits = shown, floor = unit ? 0 : ROUNDING_FLOOR): string {
  if (re !== re || im !== im) return unit ? `${EMPTY} ${unit}` : EMPTY;
  if (Math.abs(re) === Infinity && im === 0) return num(re, unit, digits);
  const r = formatResidual(re, unit, digits, true, floor);
  if (belowFloor(im, floor)) return `${r} ± j${formatResidual(im, unit, digits, true, floor)}`;
  return `${r} ${im < 0 ? '−' : '+'} j${num(Math.abs(im), unit, digits)}`;
}

/** Γ in polar form ("0.4472 ∠ 116.6°"), or the bound of D20 when |Γ| is a residual under the floor. */
export const gammaPolarText = (mag: number, degrees: number, digits = shown): string =>
  belowFloor(mag) ? GAMMA_BOUND : `${num(mag, '', digits)} ∠ ${num(degrees, '', digits)}°`;

/** Writes the texts of the readout of Γ = (gr, gi) on a real Z0 (Ω) into out, in the order of READOUT_FIELDS. */
export function readoutTexts(gr: number, gi: number, z0: number, out: string[], digits = shown): void {
  if (gr !== gr || gi !== gi) {
    for (let i = 0; i < READOUT_FIELDS.length - 1; i++) out[i] = EMPTY;
    out[READOUT_FIELDS.length - 1] = '';
    return;
  }
  zFromGamma(scratch, 0, gr, gi);
  out[0] = complexText(scratch[0], scratch[1], '', digits);
  impedanceFromGamma(scratch, 0, gr, gi, z0);
  out[1] = complexText(scratch[0], scratch[1], 'Ω', digits, ROUNDING_FLOOR * z0);
  yFromGamma(scratch, 0, gr, gi);
  out[2] = complexText(scratch[0], scratch[1], '', digits);
  admittanceFromGamma(scratch, 0, gr, gi, z0);
  out[3] = complexText(scratch[0], scratch[1], 'S', digits, ROUNDING_FLOOR / z0);
  const mag = gammaMag(gr, gi);
  out[4] = gammaPolarText(mag, toDegrees(gammaAngle(gr, gi)), digits);
  out[5] = belowFloor(mag) ? GAMMA_BOUND : complexText(gr, gi, '', digits);
  out[6] = num(vswr(mag), '', digits);
  out[7] = formatReturnLoss(returnLoss(mag), digits);
  out[8] = mag > 1 ? '|Γ| > 1: outside the chart, r < 0 (an active load); VSWR is not defined there.'
    : mag === 1 ? '|Γ| = 1: on the rim, r = 0 (lossless).' : '';
}

const texts: string[] = [];

/** Sets the text of each element (indexed like READOUT_FIELDS) only where it changed. */
export function writeReadout(elements: readonly (HTMLElement | null)[], gr: number, gi: number, z0: number): void {
  readoutTexts(gr, gi, z0, texts);
  for (let i = 0; i < elements.length; i++) {
    const el = elements[i];
    if (el && el.textContent !== texts[i]) el.textContent = texts[i];
  }
}
