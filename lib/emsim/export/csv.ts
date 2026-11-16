// The EM simulation's data as CSV (step M8.2a, docs/em-sim/notes-M8.2a.md): the trace's line results with their
// errors and the per-unit-length matrices, a sweep of an input, the via model's results, its TDR and TDT, and its
// S-parameters (single-ended, and mixed-mode for a pair). Every file starts with `#` comment lines (the tool, what the
// file holds, the date, the setup's link, the units), then one table or, for the via's results, several tables each
// after a `# <name>` line and a blank line between them. Fields are `,` separated with `.` decimals, lines end in CRLF,
// text is ASCII only (Ohm, eeff), so every spreadsheet and script reads it the same. Numbers are JavaScript's shortest
// digits that read back to the same double, so a parsed value equals the engine's exactly; ∞ is "inf", NaN empty.
// Lengths in mm (the board's unit), everything else in SI base units. Framework-free, no DOM.

import type { LineResults } from '../lines';
import type { Matrices } from '../jobs';
import type { NPort } from '../nport';
import type { SweepPoint } from '../vary';
import type { ViaModelResult } from '../viamodel';
import type { TdrResult } from '../tdr';
import { SITE } from '../figure/tikz';

export const CSV_VERSION = 1;

/** What goes into the comment lines besides the data. */
export interface DataMeta {
  /** The setup's link (the query, with or without "?", or a whole URL). */
  link?: string;
  /** The date written (default now). */
  date?: Date;
}

/** A sweep as the Sweep tool holds it: the input, its values and the points (null: not computed). */
export interface SweepRun {
  input: string;
  label: string;
  kind: 'length' | 'er';
  xs: number[];
  points: (SweepPoint | null)[];
}

/** One field: a number in shortest round-trip form, or text quoted when it holds a comma, a quote or a line break. */
export function csvField(x: unknown): string {
  if (typeof x === 'number') {
    if (Number.isNaN(x)) return '';
    if (x === Infinity) return 'inf';
    if (x === -Infinity) return '-inf';
    return String(x);
  }
  if (x === null || x === undefined) return '';
  const t = ascii(String(x));
  return /[",\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}

/** Printable ASCII only: Ω → Ohm, ε → e, µ → u, anything else "?". */
export function ascii(text: string): string {
  return text.replace(/Ω/g, 'Ohm').replace(/[εϵ]/g, 'e').replace(/[µμ]/g, 'u').replace(/[‘’]/g, '\'').replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-').replace(/[^\x20-\x7e]/g, '?');
}

const row = (xs: unknown[]): string => `${xs.map(csvField).join(',')}\r\n`;
const comment = (t: string): string => `# ${ascii(t)}\r\n`;

export function fullLink(link: string | undefined): string {
  if (!link) return '';
  return /^[a-z]+:/i.test(link) ? link : `${SITE}?${link.replace(/^\?/, '')}`;
}

function head(what: string, meta: DataMeta, units: string): string {
  const date = (meta.date ?? new Date()).toISOString().replace(/\.\d+Z$/, 'Z');
  const link = fullLink(meta.link);
  return comment(`EM simulation, ${SITE}`) + comment(what) + comment(`Date: ${date}`)
    + (link ? comment(`Setup: ${link}`) : '') + comment(`Units: ${units}`);
}

// ---------- the trace ----------

/** The unit of a line result's key (lines.ts valuesOf). */
export function unitOfKey(k: string): string {
  if (k === 'kf' || /delay/.test(k)) return 's/m';
  if (k === 'kb' || /eeff/.test(k)) return '1';
  return 'Ohm';
}

/** What a key of valuesOf means, in words. */
export function quantityOf(k: string): string {
  let m: RegExpMatchArray | null;
  if (k === 'z0') return 'Z0';
  if (k === 'eeff') return 'eeff';
  if (k === 'delay') return 'delay per length';
  if ((m = k.match(/^(z0|eeff|delay)\.(\d+)$/))) return `${m[1] === 'delay' ? 'delay per length' : m[1] === 'z0' ? 'Z0' : 'eeff'} of line ${m[2]}`;
  if ((m = k.match(/^mode(\d+)\.(eeff|delay)$/))) return `${m[2] === 'delay' ? 'delay per length' : 'eeff'} of mode ${m[1]}`;
  if ((m = k.match(/^mode(\d+)\.z(\d+)$/))) return `modal impedance of conductor ${m[2]} in mode ${m[1]}`;
  if ((m = k.match(/^zc(\d)(\d)$/))) return `Zc(${m[1]},${m[2]}), characteristic impedance matrix`;
  const pair: Record<string, string> = {
    zdiff: 'Zdiff (definition A)', zcm: 'Zcm (definition A)', zdc: 'Zdc, differential to common', zdiffB: 'Zdiff (definition B, voltage drive)',
    zcmB: 'Zcm (definition B)', ztdr: 'Zdiff seen by a differential TDR', zodd: 'Zodd', zeven: 'Zeven', kb: 'backward coupling kb', kf: 'forward coupling kf',
  };
  return pair[k] ?? k;
}

/** The trace's line results: every quantity with its error, then the matrices C, C0 (vacuum) and L with theirs. */
export function traceCsv(r: LineResults & { matrices?: Matrices | null }, meta: DataMeta = {}): string {
  let out = head(`Line results of the trace (${r.n} conductor${r.n === 1 ? '' : 's'}), quasi-static 2D solve`, meta, 'Ohm, s/m (delay per length), F/m, H/m; eeff and k without unit');
  if (!r.ok) return out + comment(`Not solved: ${r.reason}`);
  out += comment(`Solver status: ${r.status}; error: the solver's estimate of each value`);
  for (const f of r.flags) out += comment(`Flag ${f.code}: ${f.message}`);
  out += row(['key', 'quantity', 'value', 'error', 'unit', 'status']);
  const q = (k: string, x: { v: number; e: number; status: string }) => { out += row([k, quantityOf(k), x.v, x.e, unitOfKey(k), x.status]); };
  if (r.n === 1) { q('z0', r.lines[0].z0); q('eeff', r.lines[0].eeff); q('delay', r.lines[0].delay); }
  r.lines.forEach((l, i) => { if (r.n > 1) { q(`z0.${i + 1}`, l.z0); q(`eeff.${i + 1}`, l.eeff); q(`delay.${i + 1}`, l.delay); } });
  if (r.pair) for (const k of ['zdiff', 'zcm', 'zdc', 'zdiffB', 'zcmB', 'ztdr', 'zodd', 'zeven', 'kb', 'kf'] as const) q(k, r.pair[k]);
  r.modes.forEach((m, i) => { q(`mode${i + 1}.eeff`, m.eeff); q(`mode${i + 1}.delay`, m.delay); m.z.forEach((z, k) => q(`mode${i + 1}.z${k + 1}`, z)); });
  for (let i = 0; i < r.n; i++) for (let j = 0; j < r.n; j++) out += row([`zc${i + 1}${j + 1}`, quantityOf(`zc${i + 1}${j + 1}`), r.Zc[i][j], r.errZc[i][j], 'Ohm', '']);
  const M = r.matrices;
  if (M) {
    const mat = (name: string, A: number[][], E: number[][], what: string, unit: string) => {
      for (let i = 0; i < r.n; i++) for (let j = 0; j < r.n; j++) out += row([`${name}${i + 1}${j + 1}`, `${what}(${i + 1},${j + 1})`, A[i][j], E[i][j], unit, '']);
    };
    mat('C', M.C, M.errC, 'capacitance per length C', 'F/m');
    mat('C0_', M.C0, M.errC0, 'capacitance per length in vacuum C0', 'F/m');
    mat('L', M.L, M.errL, 'inductance per length L', 'H/m');
  }
  return out;
}

// ---------- a sweep ----------

/** The keys a sweep's points hold, in the order of the first point that has them. */
export function sweepKeys(points: (SweepPoint | null)[]): string[] {
  const seen = new Set<string>();
  for (const p of points) if (p && p.ok) for (const k of Object.keys(p.values)) seen.add(k);
  return Array.from(seen);
}

/** A sweep: the input's value, then every output and its error per point; a point that failed has its reason. */
export function sweepCsv(run: SweepRun, meta: DataMeta = {}): string {
  const keys = sweepKeys(run.points), xUnit = run.kind === 'length' ? 'mm' : '1';
  let out = head(`Sweep of ${run.label} (${run.input}), ${run.points.filter(Boolean).length} of ${run.xs.length} points`, meta, 'mm, Ohm, s/m (delay per length); eeff and k without unit');
  out += comment('Columns: the input, then each output and its error (the solver\'s estimate); "note" says why a point has no values');
  out += row([`${run.input} (${xUnit})`, ...keys.flatMap((k) => [`${k} (${unitOfKey(k)})`, `${k} error (${unitOfKey(k)})`]), 'note']);
  run.points.forEach((p, i) => {
    if (!p) return;
    out += row([p.x ?? run.xs[i], ...keys.flatMap((k) => (p.ok ? [p.values[k] ?? NaN, p.err[k] ?? NaN] : [NaN, NaN])), p.ok ? '' : p.reason]);
  });
  return out;
}

// ---------- the via ----------

/** The via model's results as tables: the summary, the barrel's segments, the pad and plane crossings, the stubs, the feeds. */
export function viaCsv(r: ViaModelResult, meta: DataMeta = {}): string {
  let out = head(`Via model results (${r.n === 2 ? 'a pair' : 'one via'}): lines and lumped capacitances`, meta, 'mm, Ohm, s, F, H, Hz');
  if (!r.ok) return out + comment(`Not solved: ${r.reason}`);
  out += comment(`The model holds up to ${r.valid.fMax} Hz: ${r.valid.reason}`);
  for (const f of r.flags) out += comment(`Flag (${f.level}) ${f.code}: ${f.message}`);
  const table = (name: string, cols: string[], rows: unknown[][]) => { out += `\r\n${comment(name)}${row(cols)}`; for (const x of rows) out += row(x); };
  const L = r.lumped;
  const sum: unknown[][] = [
    ['rise time', r.tr, 's'], ['port reference impedance', r.z0, 'Ohm'],
    ['barrel impedance in vacuum', r.barrel.zVac, 'Ohm'], ['barrel impedance in vacuum, error', r.barrel.zVacErr, 'Ohm'],
  ];
  if (r.n === 2) sum.push(['barrel Zdiff in vacuum', r.barrel.zdiffVac, 'Ohm'], ['barrel Zdiff in vacuum, error', r.barrel.zdiffVacErr, 'Ohm'], ['barrel Zcm in vacuum', r.barrel.zcmVac, 'Ohm'], ['barrel Zcm in vacuum, error', r.barrel.zcmVacErr, 'Ohm'], ['barrel coupling k12', r.barrel.k12, '1']);
  if (L) {
    sum.push(['section impedance sqrt(L/C)', L.z, 'Ohm']);
    if (r.n === 2) sum.push(['section Zdiff', L.zdiff, 'Ohm'], ['section Zcm', L.zcm, 'Ohm']);
    sum.push(['section delay', L.delay, 's'], ['sum of the crossings\' extra capacitance', L.dCsum, 'F'], ['line capacitance of the section', L.lineC, 'F']);
    for (let i = 0; i < r.n; i++) for (let j = 0; j < r.n; j++) sum.push([`section L(${i + 1},${j + 1})`, L.L[i][j], 'H']);
    for (let i = 0; i < r.n; i++) for (let j = 0; j < r.n; j++) sum.push([`section C(${i + 1},${j + 1})`, L.C[i][j], 'F']);
  }
  sum.push(['whole-via capacitance (axisymmetric)', r.axiTotal, 'F'], ['whole-via capacitance, error', r.axiTotalErr, 'F'], ['one-way delay of feeds and section', r.span, 's'], ['valid up to', r.valid.fMax, 'Hz']);
  table('Summary', ['quantity', 'value', 'unit'], sum);
  table('Segments of the barrel', ['part', 'z top (mm)', 'z bottom (mm)', 'er', 'Z0 (Ohm)', 'Zdiff (Ohm)', 'Zcm (Ohm)', 'delay (s)'],
    r.pieces.map((p) => [p.part, p.zTop, p.zBot, p.er, p.z0, r.n === 2 ? p.zdiff : NaN, r.n === 2 ? p.zcm : NaN, p.delay]));
  table('Pad and plane crossings', ['layer', 'z (mm)', 'extra capacitance (F)', 'error (F)'], r.nodes.map((n) => [n.layer, n.z, n.dC, n.dCErr]));
  table('Stubs', ['side', 'length (mm)', 'delay (s)', 'resonance bare (Hz)', 'resonance with pads (Hz)'], r.stubs.map((s) => [s.side, s.length, s.delay, s.fFormula, s.fRes]));
  table('Feeds', ['side', 'layer', 'length to the pad edge (mm)', 'Z0 (Ohm)', 'eeff'], r.feeds.map((f) => [f.side, f.layer, f.length, f.z0, f.eeff]));
  return out;
}

/** The via's TDR and TDT: time, Z, its error bound, ρ and the transmitted step; for a pair differential then common. */
export function tdrCsv(r: ViaModelResult, meta: DataMeta = {}): string {
  const pair = r.n === 2, d = r.tdr, c = pair ? r.tdrCommon : null;
  let out = head(`TDR and TDT of the via${pair ? ' pair, differential and common' : ''}, ${r.tr} s rise time (10-90 %)`, meta, 's, Ohm; rho and TDT are steps of height 1');
  if (!d) return out + comment('No TDR in this result.');
  const errs = (x: TdrResult, name: string) => comment(`${name}: ${x.method}; error bound over the record: Z ${x.err.z} Ohm, rho ${x.err.rho} (truncation ${x.err.truncation}, settling ${x.err.settle}); reference ${x.zRef} Ohm`);
  out += errs(d, pair ? 'Differential' : 'TDR') + (c ? errs(c, 'Common') : '');
  const same = !!c && c.t.length === d.t.length;
  const zn = pair ? 'Zdiff' : 'Z';
  out += row(['t (s)', `${zn} (Ohm)`, `${zn} error (Ohm)`, pair ? 'rho diff' : 'rho', pair ? 'TDT diff' : 'TDT', ...(same ? ['Zcm (Ohm)', 'Zcm error (Ohm)', 'rho common', 'TDT common'] : [])]);
  for (let i = 0; i < d.t.length; i++) {
    out += row([d.t[i], d.z[i], d.err.z, d.rho[i], d.tdt ? d.tdt[i] : NaN, ...(same ? [c.z[i], c.err.z, c.rho[i], c.tdt ? c.tdt[i] : NaN] : [])]);
  }
  if (c && !same) {
    out += `\r\n${comment('Common')}${row(['t (s)', 'Zcm (Ohm)', 'Zcm error (Ohm)', 'rho common', 'TDT common'])}`;
    for (let i = 0; i < c.t.length; i++) out += row([c.t[i], c.z[i], c.err.z, c.rho[i], c.tdt ? c.tdt[i] : NaN]);
  }
  return out;
}

const DEG = 180 / Math.PI;
/** |S| = 0 in dB: the dB of the smallest double, which reads back as |S| under 1e-300. */
export const DB_FLOOR = 20 * Math.log10(Number.MIN_VALUE);
export const dbOf = (re: number, im: number): number => { const m = Math.hypot(re, im); return m > 0 ? 20 * Math.log10(m) : DB_FLOOR; };
export const degOf = (re: number, im: number): number => Math.atan2(im, re) * DEG;

/** The column name of S(i, j) of an N-port: S12, or Sdc12 for mixed-mode ports (D1, D2, C1, C2). */
export function sName(np: NPort, i: number, j: number): string {
  if (!np.mixed) return `S${i + 1}${j + 1}`;
  const m = (k: number) => [np.names[k][0].toLowerCase(), np.names[k].slice(1)];
  const [a, x] = m(i), [b, y] = m(j);
  return `S${a}${b}${x}${y}`;
}

/** S-parameters: per frequency |S| in dB, phase in degrees, re and im of every entry; a pair's mixed-mode after. */
export function sparamCsv(np: NPort, mixed: NPort | null, meta: DataMeta = {}): string {
  const P = np.ports, nf = np.f.length;
  let out = head(`S-parameters of the via (${P} ports${mixed ? ', and mixed-mode' : ''}) from ${np.producer.name} ${np.producer.version}`, meta, 'Hz, dB, degrees; re and im without unit');
  np.names.forEach((n, k) => { out += comment(`Port ${k + 1}: ${n}, reference ${np.z0[k]} Ohm`); });
  if (mixed) mixed.names.forEach((n, k) => { out += comment(`Mixed-mode port ${n}: reference ${mixed.z0[k]} Ohm`); });
  out += comment(`The model holds from ${np.valid.fMin} to ${np.valid.fMax} Hz (${np.valid.reason}); "valid" is 0 above it: computed, not valid`);
  const sets = mixed ? [np, mixed] : [np];
  const cols: string[] = ['f (Hz)', 'valid'];
  for (const s of sets) for (let i = 0; i < s.ports; i++) for (let j = 0; j < s.ports; j++) {
    const n = sName(s, i, j);
    cols.push(`|${n}| (dB)`, `${n} phase (deg)`, `${n} re`, `${n} im`);
  }
  out += row(cols);
  for (let k = 0; k < nf; k++) {
    const f = np.f[k];
    const x: unknown[] = [f, f >= np.valid.fMin && f <= np.valid.fMax ? 1 : 0];
    for (const s of sets) {
      const o = 2 * s.ports * s.ports * k;
      for (let q = 0; q < s.ports * s.ports; q++) { const re = s.s[o + 2 * q], im = s.s[o + 2 * q + 1]; x.push(dbOf(re, im), degOf(re, im), re, im); }
    }
    out += row(x);
  }
  return out;
}

// ---------- reading back (the harness, and anyone checking a file) ----------

export interface CsvTable { name: string; header: string[]; rows: string[][]; comments: string[] }

/** Splits a file of this module into its tables: comment lines, then a header row and rows up to a blank line. */
export function readCsv(text: string): CsvTable[] {
  const tables: CsvTable[] = [];
  let cur: CsvTable | null = null, pending: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line) { cur = null; continue; }
    if (line.startsWith('#')) { pending.push(line.replace(/^# ?/, '')); continue; }
    const cells = splitRow(line);
    if (!cur) { cur = { name: pending[pending.length - 1] ?? '', header: cells, rows: [], comments: pending }; pending = []; tables.push(cur); } else cur.rows.push(cells);
  }
  return tables;
}

function splitRow(line: string): string[] {
  const out: string[] = [];
  let i = 0;
  while (i <= line.length) {
    if (line[i] === '"') {
      let s = '';
      i++;
      while (i < line.length) {
        if (line[i] === '"') { if (line[i + 1] === '"') { s += '"'; i += 2; } else { i++; break; } } else s += line[i++];
      }
      out.push(s);
      i++; // the comma
    } else {
      const c = line.indexOf(',', i);
      const e = c < 0 ? line.length : c;
      out.push(line.slice(i, e));
      i = e + 1;
    }
  }
  return out;
}

/** A field read back as a number (empty: NaN, "inf": ∞). */
export function csvNumber(t: string): number {
  if (t === '') return NaN;
  if (t === 'inf') return Infinity;
  if (t === '-inf') return -Infinity;
  return Number(t);
}
