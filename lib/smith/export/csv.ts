// The Smith chart's CSV files (step M8.2, docs/smith-chart/notes-M8.2.md): the nodes at f0, the frequency trace and
// the markers. RFC 4180: fields separated by commas, rows by CRLF, a field holding a comma, a double quote, CR or LF
// in double quotes with its quotes doubled. One header row, each column's unit in parentheses ("R (Ω)"); a UTF-8 BOM
// first by default, so Excel reads Γ, Ω and ° (other readers skip it). Numbers as spreadsheets read them: plain
// decimal ("0.00000003183") or engineering text ("31.83e-9"), to the digits asked for (the page's digits setting) or
// all of them (0: JavaScript's shortest digits that read back to the same double). ∞ is written "inf" (a spreadsheet
// keeps it as text), a figure that does not exist (NaN) as an empty field. Framework-free.

import { impedanceFromGamma, returnLoss, toDegrees, vswr } from '../convert';
import { M_ANGLE, M_GI, M_GR, M_MAG, M_Q, M_RL, M_VSWR, M_YI, M_YR, M_ZI, M_ZR, METRIC_STRIDE, evaluateCircuit } from '../network';
import type { Circuit } from '../network';
import type { MarkerPoint } from '../sweep';
import { KIND_NAMES } from '../state';

export type NumberForm = 'plain' | 'eng';
export const NUMBER_FORMS: readonly NumberForm[] = ['plain', 'eng'];
/** The most significant digits a CSV takes; 0 is "every digit" (the shortest that reads back to the double). */
export const CSV_DIGITS_MAX = 17;

export interface CsvOptions {
  /** Significant digits, 1…CSV_DIGITS_MAX; 0 (the default) every digit. */
  digits?: number;
  /** Plain decimal (the default) or engineering text (mantissa 1 to 999, exponent a multiple of 3). */
  form?: NumberForm;
  /** A UTF-8 byte order mark first (default true). */
  bom?: boolean;
}

const BOM = '﻿';
const CRLF = '\r\n';

/**
 * A number as a CSV field: `digits` significant digits (0: every digit), trailing zeros of a fraction left out, plain
 * or engineering. 0 and −0 are "0", ±∞ "inf" / "-inf", NaN "".
 */
export function csvNumber(v: number, digits = 0, form: NumberForm = 'plain'): string {
  if (v !== v) return '';
  if (v === Infinity) return 'inf';
  if (v === -Infinity) return '-inf';
  if (v === 0) return '0';
  const a = v < 0 ? -v : v;
  // JavaScript writes these without an exponent, with the shortest digits: the same text, several times faster.
  if (!(digits > 0) && form === 'plain' && a >= 1e-6 && a < 1e21) return String(v);
  // d.ddde±x: the mantissa's digits and the exponent of its first digit.
  const s = digits > 0 ? a.toExponential(Math.min(digits, CSV_DIGITS_MAX) - 1) : a.toExponential();
  const e = s.indexOf('e');
  const lead = +s.slice(e + 1);
  let m = s.charCodeAt(1) === 46 ? s[0] + s.slice(2, e) : s.slice(0, e);
  let end = m.length;
  while (end > 1 && m.charCodeAt(end - 1) === 48) end--;
  m = m.slice(0, end);
  const sign = v < 0 ? '-' : '';
  if (form === 'eng') {
    const E = 3 * Math.floor(lead / 3), whole = lead - E + 1;
    const body = m.length <= whole ? m + '0'.repeat(whole - m.length) : `${m.slice(0, whole)}.${m.slice(whole)}`;
    return E ? `${sign}${body}e${E}` : sign + body;
  }
  if (lead >= 0) {
    const whole = lead + 1;
    return sign + (m.length <= whole ? m + '0'.repeat(whole - m.length) : `${m.slice(0, whole)}.${m.slice(whole)}`);
  }
  return `${sign}0.${'0'.repeat(-lead - 1)}${m}`;
}

const NEEDS_QUOTES = /[",\r\n]/;
/** A text as an RFC 4180 field: in double quotes (its quotes doubled) when it holds a comma, a quote, CR or LF. */
export const csvField = (text: string): string => (NEEDS_QUOTES.test(text) ? `"${text.replace(/"/g, '""')}"` : text);

/** Rows of fields (already written) as CSV text, CRLF after every row, the BOM first when asked. */
export function csvRows(rows: readonly (readonly string[])[], bom = true): string {
  let out = bom ? BOM : '';
  for (const row of rows) out += row.join(',') + CRLF;
  return out;
}

const header = (names: readonly string[]): string[] => names.map(csvField);

/** The trace's and the markers' columns after the first. */
export const POINT_COLUMNS: readonly string[] = [
  'f (Hz)', 'Re Γ', 'Im Γ', '|Γ|', '∠Γ (°)', 'Return loss (dB)', 'VSWR', 'R (Ω)', 'X (Ω)',
];
/** The trace's columns. */
export const TRACE_COLUMNS: readonly string[] = POINT_COLUMNS;
/** The markers' columns. */
export const MARKER_COLUMNS: readonly string[] = ['Marker', ...POINT_COLUMNS];
/** The nodes' columns: normalised z and y, in ohms and siemens, Γ and its figures, the node's Q (|x|/r). */
export const NODE_COLUMNS: readonly string[] = [
  'Node', 'After part', 'f (Hz)', 'r', 'x', 'R (Ω)', 'X (Ω)', 'g', 'b', 'G (S)', 'B (S)',
  'Re Γ', 'Im Γ', '|Γ|', '∠Γ (°)', 'VSWR', 'Return loss (dB)', 'Q',
];

/** A node's name as the chart labels it: L the load, 1 … n − 1, In the input. */
export const nodeName = (k: number, n: number): string => (k === 0 ? 'L' : k === n ? 'In' : String(k));

/** The nodes at f0, from the load (L) to the input (In); each with the part that leads to it ("2 Shunt L"). */
export function nodesCsv(circuit: Circuit, options: CsvOptions = {}): string {
  const d = options.digits ?? 0, form = options.form ?? 'plain';
  const num = (v: number): string => csvNumber(v, d, form);
  const n = circuit.parts.length, z0 = circuit.z0;
  const { metrics } = evaluateCircuit(circuit);
  const rows: string[][] = [header(NODE_COLUMNS)];
  const f = num(circuit.f0);
  for (let k = 0; k <= n; k++) {
    const o = k * METRIC_STRIDE;
    const zr = metrics[o + M_ZR], zi = metrics[o + M_ZI], yr = metrics[o + M_YR], yi = metrics[o + M_YI];
    rows.push([
      nodeName(k, n), csvField(k ? `${k} ${KIND_NAMES[circuit.parts[k - 1].kind]}` : 'Load'), f,
      num(zr), num(zi), num(zr * z0), num(zi * z0), num(yr), num(yi), num(yr / z0), num(yi / z0),
      num(metrics[o + M_GR]), num(metrics[o + M_GI]), num(metrics[o + M_MAG]), num(toDegrees(metrics[o + M_ANGLE])),
      num(metrics[o + M_VSWR]), num(metrics[o + M_RL]), num(metrics[o + M_Q]),
    ]);
  }
  return csvRows(rows, options.bom ?? true);
}

/** A trace as sweep.ts's `Trace` holds it (or any arrays of that form): `n` frequencies, Γ interleaved re, im. */
export interface TraceData {
  freqs: ArrayLike<number>;
  gamma: ArrayLike<number>;
  n: number;
}

const zOut = new Float64Array(2);

/** The trace at Z0 (Γ normalised to it): one row per point, ascending in f. */
export function traceCsv(trace: TraceData, z0: number, options: CsvOptions = {}): string {
  const d = options.digits ?? 0, form = options.form ?? 'plain';
  const { freqs, gamma, n } = trace;
  let out = (options.bom ?? true ? BOM : '') + header(TRACE_COLUMNS).join(',') + CRLF;
  for (let i = 0; i < n; i++) {
    const gr = gamma[2 * i], gi = gamma[2 * i + 1];
    const mag = Math.sqrt(gr * gr + gi * gi);
    impedanceFromGamma(zOut, 0, gr, gi, z0);
    out += `${csvNumber(freqs[i], d, form)},${csvNumber(gr, d, form)},${csvNumber(gi, d, form)},${csvNumber(mag, d, form)},`
      + `${csvNumber(toDegrees(Math.atan2(gi, gr)), d, form)},${csvNumber(returnLoss(mag), d, form)},`
      + `${csvNumber(vswr(mag), d, form)},${csvNumber(zOut[0], d, form)},${csvNumber(zOut[1], d, form)}${CRLF}`;
  }
  return out;
}

/** The markers (sweep.ts markerAt), named M1, M2, … in the order given. */
export function markersCsv(markers: readonly MarkerPoint[], options: CsvOptions = {}): string {
  const d = options.digits ?? 0, form = options.form ?? 'plain';
  const num = (v: number): string => csvNumber(v, d, form);
  const rows: string[][] = [header(MARKER_COLUMNS)];
  markers.forEach((m, i) => {
    rows.push([
      `M${i + 1}`, num(m.f), num(m.gr), num(m.gi), num(m.mag), num(toDegrees(Math.atan2(m.gi, m.gr))), num(m.rl),
      num(m.vswr), num(m.zr), num(m.zi),
    ]);
  });
  return csvRows(rows, options.bom ?? true);
}
