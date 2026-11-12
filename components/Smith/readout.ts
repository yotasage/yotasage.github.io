// The cursor readout of the chart: z, Z, y, Y, Γ (polar and Cartesian), VSWR and return loss of one Γ point, written
// as text by lib/quantity.ts's formatAmount (engineering prefixes, real minus, ∞ for the open and the match). The
// numbers come from lib/smith/convert.ts. Framework-free: the chart's frame loop calls writeReadout with the elements
// of the panel, so a pointer move never re-renders React.

import { formatAmount } from '../../lib/quantity';
import {
  admittanceFromGamma, gammaAngle, gammaMag, impedanceFromGamma, returnLoss, toDegrees, vswr, yFromGamma, zFromGamma,
} from '../../lib/smith/convert';

/** The fields of the readout, in the order of the panel; `data-field` of each value element. */
export const READOUT_FIELDS = ['z', 'Z', 'y', 'Y', 'gamma', 'gammaRect', 'vswr', 'rl', 'note'] as const;
export type ReadoutField = (typeof READOUT_FIELDS)[number];

export const READOUT_DIGITS = 4;
const EMPTY = '–';
const scratch = new Float64Array(2);

/** re ± j·im with the unit on both parts ("25 Ω − j15 Ω"); an infinite real part with no imaginary one is "∞ Ω". */
export function complexText(re: number, im: number, unit: string, digits = READOUT_DIGITS): string {
  if (re !== re || im !== im) return unit ? `${EMPTY} ${unit}` : EMPTY;
  if (Math.abs(re) === Infinity && im === 0) return formatAmount(re, unit, digits);
  return `${formatAmount(re, unit, digits)} ${im < 0 ? '−' : '+'} j${formatAmount(Math.abs(im), unit, digits)}`;
}

/** Writes the texts of the readout of Γ = (gr, gi) on a real Z0 (Ω) into out, in the order of READOUT_FIELDS. */
export function readoutTexts(gr: number, gi: number, z0: number, out: string[], digits = READOUT_DIGITS): void {
  if (gr !== gr || gi !== gi) {
    for (let i = 0; i < READOUT_FIELDS.length - 1; i++) out[i] = EMPTY;
    out[READOUT_FIELDS.length - 1] = '';
    return;
  }
  zFromGamma(scratch, 0, gr, gi);
  out[0] = complexText(scratch[0], scratch[1], '', digits);
  impedanceFromGamma(scratch, 0, gr, gi, z0);
  out[1] = complexText(scratch[0], scratch[1], 'Ω', digits);
  yFromGamma(scratch, 0, gr, gi);
  out[2] = complexText(scratch[0], scratch[1], '', digits);
  admittanceFromGamma(scratch, 0, gr, gi, z0);
  out[3] = complexText(scratch[0], scratch[1], 'S', digits);
  const mag = gammaMag(gr, gi);
  out[4] = `${formatAmount(mag, '', digits)} ∠ ${formatAmount(toDegrees(gammaAngle(gr, gi)), '', digits)}°`;
  out[5] = complexText(gr, gi, '', digits);
  out[6] = formatAmount(vswr(mag), '', digits);
  out[7] = formatAmount(returnLoss(mag), 'dB', digits);
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
