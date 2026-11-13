// The Smith chart's Touchstone file (step M8.2, docs/smith-chart/notes-M8.2.md): a one-port `.s1p` of S11 at the
// circuit's input, i.e. Γ of the sweep normalised to Z0, in Touchstone 1.1's form (which 2.0 readers also take):
// comment lines with the tool, the date and the circuit's link as measuring instruments and simulators write theirs,
// the option line `# Hz S RI R <Z0>` (MA and DB on request), then one line per frequency of the trace, ascending.
// Every number has JavaScript's shortest digits that read back to the same double (full precision). Only ASCII is
// written: Touchstone readers are not required to take anything else. Framework-free.

import { SITE } from '../figureTikz';

export type TouchstoneFormat = 'RI' | 'MA' | 'DB';
export const TOUCHSTONE_FORMATS: readonly TouchstoneFormat[] = ['RI', 'MA', 'DB'];

export interface TouchstoneInput {
  /** The frequencies (Hz, ascending) and Γ interleaved re, im (sweep.ts's Trace), `n` points. */
  freqs: ArrayLike<number>;
  gamma: ArrayLike<number>;
  n: number;
  /** The reference impedance the Γ is normalised to (Ω): the option line's R. */
  z0: number;
  /** The circuit's link (a full URL or the query after "?"), written as a comment. */
  link?: string;
  /** The date written (default now). */
  date?: Date;
  /** Real and imaginary (default), magnitude and angle, or dB and angle (degrees). */
  format?: TouchstoneFormat;
}

const DEG = 180 / Math.PI;
/** |Γ| = 0 in dB: the dB of the smallest double (−6,473.6 dB), which reads back as a Γ under 1e-300. */
export const DB_FLOOR = 20 * Math.log10(Number.MIN_VALUE);

/** Printable ASCII only: anything else becomes "?". */
const ascii = (text: string): string => text.replace(/[^\x20-\x7e]/g, '?');

/** The `.s1p` text, lines ending in CRLF. Frequencies that do not rise (a repeat) are left out. */
export function touchstone(input: TouchstoneInput): string {
  const { freqs, gamma, n, z0 } = input;
  const format = input.format ?? 'RI';
  const date = (input.date ?? new Date()).toISOString().replace(/\.\d+Z$/, 'Z');
  let link = input.link ?? '';
  if (link && !/^[a-z]+:/i.test(link)) link = `${SITE}?${link.replace(/^\?/, '')}`;
  let out = '', last = -Infinity, count = 0;
  for (let i = 0; i < n; i++) {
    const f = freqs[i];
    if (!(f > last)) continue;
    last = f;
    const gr = gamma[2 * i], gi = gamma[2 * i + 1];
    let a: number, b: number;
    if (format === 'RI') { a = gr; b = gi; } else {
      const mag = Math.sqrt(gr * gr + gi * gi);
      a = format === 'MA' ? mag : mag > 0 ? 20 * Math.log10(mag) : DB_FLOOR;
      b = Math.atan2(gi, gr) * DEG;
    }
    out += `${String(f)} ${String(a)} ${String(b)}\r\n`;
    count++;
  }
  return `! Smith chart, ${SITE}\r\n`
    + '! S11 at the input of the circuit (one port), normalised to the reference impedance R\r\n'
    + `! Date: ${date}\r\n`
    + (link ? `! Circuit: ${ascii(link)}\r\n` : '')
    + `! ${count} frequencies\r\n`
    + `# Hz S ${format} R ${String(z0)}\r\n`
    + out;
}
