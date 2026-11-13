// Checks of the data files (step M8.2, lib/smith/export/csv.ts, touchstone.ts, project.ts), run by check.mjs with its
// counters:
// - Touchstone: a reference reader written here from the Touchstone specification (version 1.1 and 2.0: comments,
//   the option line with its defaults and units, RI/MA/DB, S/Y/Z of one port, 2.0's keywords), not from our writer.
//   It reads our `.s1p` of random circuits' sweeps (RI, MA and DB) back to 1e-12 against sweep.ts gammaAt at the
//   written frequencies, reads hand-written files of other forms, and rejects malformed files;
// - CSV: a small RFC 4180 reader written here: random fields with commas, quotes and line breaks read back; numbers
//   read back to the shown digits (every digit: to the bit) in plain and engineering form; the nodes, trace and
//   markers files of random circuits read back against the engine and figures computed here;
// - project: 200 random states saved and opened (no issue, the same link, the same state, the same text again), a
//   version-0 file (a link) migrated, a version-2 file refused with its message, broken files and fields read with
//   issues and never a throw (fuzzed); timings.

import * as importedCsv from '../../../lib/smith/export/csv.ts';
import * as importedTs from '../../../lib/smith/export/touchstone.ts';
import * as importedProject from '../../../lib/smith/export/project.ts';
import * as importedSweep from '../../../lib/smith/sweep.ts';
import * as importedNetwork from '../../../lib/smith/network.ts';
import * as importedState from '../../../lib/smith/state.ts';
import * as importedValues from '../../../lib/smith/values.ts';
import * as importedFigure from '../../../lib/smith/figure.ts';
import { retried } from './timing.mjs';

const CSV = importedCsv.default ?? importedCsv;
const TS = importedTs.default ?? importedTs;
const PR = importedProject.default ?? importedProject;
const S = importedSweep.default ?? importedSweep;
const N = importedNetwork.default ?? importedNetwork;
const STATE = importedState.default ?? importedState;
const V = importedValues.default ?? importedValues;
const F = importedFigure.default ?? importedFigure;
const { csvNumber, csvField, csvRows, nodesCsv, traceCsv, markersCsv, TRACE_COLUMNS, MARKER_COLUMNS, NODE_COLUMNS, nodeName } = CSV;
const { touchstone, DB_FLOOR } = TS;
const { projectJson, openProject, projectLink, defaultExportSettings, PROJECT_VERSION, PROJECT_FORMAT } = PR;
const { sweepCircuit, Trace, runSweep, gammaAt, markersAt, REFINE_DEFAULTS } = S;
const { evaluateCircuit, METRIC_STRIDE, M_ZR, M_ZI, M_YR, M_YI, M_GR, M_GI, M_Q } = N;
const { decodeCircuit, encodeCircuit, sameCircuit, sweepParams, circuitProblem, KIND_CODES, KIND_NAMES } = STATE;
const { choiceToText, LIST_IDS, VALUE_KINDS } = V;
const { DETAIL_PRESETS, DETAIL_NAMES } = F;
const TAU = 2 * Math.PI;
const median = (a) => { const s = a.slice().sort((x, y) => x - y); return s[s.length >> 1]; };

// ---------------------------------------------------------------------------------------------------------------
// The reference Touchstone reader (Touchstone File Format Specification 1.1, EIA/IBIS 2002, and 2.0, IBIS 2009),
// one port only. Throws an Error naming the line for a malformed file. Returns the version, the option line's
// values, the reference resistance and, per frequency, Γ (S11) as re, im.
// - "!" starts a comment to the end of the line; blank lines are ignored; keywords, units, parameters and formats are
//   case-insensitive.
// - The option line "# [unit] [parameter] [format] [R n]", its fields in any order, each at most once; defaults GHz,
//   S, MA, R 50. In 1.1 only the first option line counts (later ones are ignored); it comes before the data.
// - 2.0: "[Version] 2.0" is the first non-comment line, then the option line, [Number of Ports] (1 here) and
//   [Number of Frequencies] before [Network Data]; [Reference] sets the port's resistance; [End] ends the file.
//   [Two-Port Data Order] and [Noise Data] belong to two-ports only.
// - Data: for one port each line holds the frequency and one pair; frequencies rise strictly and are not negative.
// - RI real, imaginary; MA magnitude, angle in degrees; DB 20·log10 magnitude, angle in degrees.
// - S is Γ; 1.1's Y and Z are normalised to R, 2.0's are in siemens and ohms; G and H are two-port parameters.
const UNITS = { hz: 1, khz: 1e3, mhz: 1e6, ghz: 1e9 };
const NUM = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;

function readTouchstone(text) {
  if (typeof text !== 'string') throw new Error('not text');
  const lines = text.split(/\r\n|\r|\n/);
  let v2 = false, seen = false, option = null, ports = null, nfreq = null, inData = false, ended = false, refR = null, wantRef = false;
  const freqs = [], re = [], im = [];
  for (let li = 0; li < lines.length; li++) {
    let line = lines[li];
    const bang = line.indexOf('!');
    if (bang >= 0) line = line.slice(0, bang);
    line = line.trim();
    if (!line) continue;
    const at = `line ${li + 1}`;
    if (ended) throw new Error(`${at}: text after [End]`);
    if (wantRef && !line.startsWith('[') && !line.startsWith('#')) {
      // [Reference]'s values may continue on the next line.
      const t = line.split(/\s+/);
      if (t.length !== 1 || !NUM.test(t[0]) || !(+t[0] > 0)) throw new Error(`${at}: a reference wants one positive number`);
      refR = +t[0]; wantRef = false; seen = true; continue;
    }
    if (line[0] === '[') {
      const m = /^\[([^\]]+)\]\s*(.*)$/.exec(line);
      if (!m) throw new Error(`${at}: a keyword without its "]"`);
      const key = m[1].trim().toLowerCase().replace(/\s+/g, ' '), arg = m[2].trim();
      if (key === 'version') {
        if (seen) throw new Error(`${at}: [Version] must come first`);
        if (!/^2\.\d+$/.test(arg)) throw new Error(`${at}: unknown version ${arg}`);
        v2 = true; seen = true; continue;
      }
      if (!v2) throw new Error(`${at}: a keyword in a version 1 file`);
      if (!option && key !== 'end') throw new Error(`${at}: the option line must follow [Version]`);
      seen = true;
      switch (key) {
        case 'number of ports':
          if (!/^\d+$/.test(arg)) throw new Error(`${at}: [Number of Ports] wants a whole number`);
          ports = +arg;
          if (ports !== 1) throw new Error(`${at}: ${ports} ports (this reader is for one port)`);
          break;
        case 'number of frequencies':
          if (!/^\d+$/.test(arg) || +arg < 1) throw new Error(`${at}: [Number of Frequencies] wants a whole number above 0`);
          nfreq = +arg; break;
        case 'reference':
          if (arg) {
            if (!NUM.test(arg) || !(+arg > 0)) throw new Error(`${at}: a reference wants one positive number`);
            refR = +arg;
          } else wantRef = true;
          break;
        case 'matrix format':
          if (!/^(full|lower|upper)$/i.test(arg)) throw new Error(`${at}: unknown matrix format`);
          break;
        case 'two-port data order': case 'noise data': case 'number of noise frequencies':
          throw new Error(`${at}: [${m[1]}] belongs to two-ports`);
        case 'begin information': case 'end information': case 'mixed-mode order':
          break;
        case 'network data':
          if (ports === null) throw new Error(`${at}: [Network Data] before [Number of Ports]`);
          if (nfreq === null) throw new Error(`${at}: [Network Data] before [Number of Frequencies]`);
          inData = true; break;
        case 'end':
          if (!inData) throw new Error(`${at}: [End] before [Network Data]`);
          ended = true; break;
        default:
          throw new Error(`${at}: unknown keyword [${m[1]}]`);
      }
      continue;
    }
    if (line[0] === '#') {
      if (option) {
        if (v2) throw new Error(`${at}: a second option line`);
        continue; // 1.1: only the first counts
      }
      if (v2 !== seen) throw new Error(`${at}: the option line must follow [Version]`);
      const o = { unit: 'ghz', param: 's', format: 'ma', R: 50 };
      const got = new Set();
      const t = line.slice(1).trim().split(/\s+/).filter(Boolean).map((s) => s.toLowerCase());
      for (let i = 0; i < t.length; i++) {
        const tok = t[i];
        const field = tok in UNITS ? 'unit' : ['s', 'y', 'z', 'g', 'h'].includes(tok) ? 'param' : ['db', 'ma', 'ri'].includes(tok) ? 'format' : tok === 'r' ? 'R' : null;
        if (!field) throw new Error(`${at}: unknown option ${tok}`);
        if (got.has(field)) throw new Error(`${at}: ${field} given twice`);
        got.add(field);
        if (field === 'R') {
          const v = t[++i];
          if (v === undefined || !NUM.test(v) || !(+v > 0)) throw new Error(`${at}: R wants a positive number`);
          o.R = +v;
        } else o[field] = tok;
      }
      if (o.param === 'g' || o.param === 'h') throw new Error(`${at}: ${o.param.toUpperCase()} parameters belong to two-ports`);
      option = o; seen = true; continue;
    }
    if (!option) throw new Error(`${at}: data before the option line`);
    if (v2 && !inData) throw new Error(`${at}: data before [Network Data]`);
    const t = line.split(/\s+/);
    if (t.length !== 3) throw new Error(`${at}: a one-port line wants a frequency and one pair (${t.length} numbers)`);
    for (const s of t) if (!NUM.test(s)) throw new Error(`${at}: ${JSON.stringify(s)} is not a number`);
    const f = +t[0] * UNITS[option.unit], a = +t[1], b = +t[2];
    if (!Number.isFinite(f) || f < 0) throw new Error(`${at}: a negative frequency`);
    if (freqs.length && !(f > freqs[freqs.length - 1])) throw new Error(`${at}: the frequencies do not rise`);
    let pr, pi;
    if (option.format === 'ri') { pr = a; pi = b; } else {
      const mag = option.format === 'ma' ? a : 10 ** (a / 20), ang = b * Math.PI / 180;
      pr = mag * Math.cos(ang); pi = mag * Math.sin(ang);
    }
    // To Γ on the reference resistance.
    const R = refR ?? option.R;
    let gr = pr, gi = pi;
    if (option.param === 'z' || option.param === 'y') {
      // The normalised z (2.0's Z in ohms divided by R; a Y, normalised by ×R in 2.0, inverted).
      let zr, zi;
      if (option.param === 'z') { const k = v2 ? 1 / R : 1; zr = pr * k; zi = pi * k; } else {
        const k = v2 ? R : 1, yr = pr * k, yi = pi * k, dd = yr * yr + yi * yi;
        zr = yr / dd; zi = -yi / dd;
      }
      const dr = zr + 1, di = zi, nr = zr - 1, ni = zi, den = dr * dr + di * di;
      gr = (nr * dr + ni * di) / den; gi = (ni * dr - nr * di) / den;
    }
    freqs.push(f); re.push(gr); im.push(gi);
  }
  if (!option) throw new Error('no option line');
  if (v2) {
    if (!inData) throw new Error('no [Network Data]');
    if (!ended) throw new Error('no [End]');
    if (freqs.length !== nfreq) throw new Error(`[Number of Frequencies] is ${nfreq} but ${freqs.length} are given`);
  }
  if (!freqs.length) throw new Error('no data');
  return { version: v2 ? 2 : 1, unit: option.unit, param: option.param, format: option.format, R: refR ?? option.R, freqs, re, im };
}

// ---------------------------------------------------------------------------------------------------------------
// The reference RFC 4180 reader: records by CRLF (a lone LF also taken), fields by commas, a quoted field may hold
// commas, CR, LF and doubled quotes; a quote inside an unquoted field or text after a closing quote is an error. A
// leading UTF-8 BOM is skipped. The last record may end without a line break.
function readCsv(text) {
  let i = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  const rows = [];
  let row = [], field = '';
  const n = text.length;
  if (i >= n) return rows;
  for (;;) {
    if (text[i] === '"') {
      i++;
      for (;;) {
        if (i >= n) throw new Error('a quoted field without its end');
        if (text[i] === '"') {
          if (text[i + 1] === '"') { field += '"'; i += 2; } else { i++; break; }
        } else field += text[i++];
      }
      if (i < n && text[i] !== ',' && text[i] !== '\r' && text[i] !== '\n') throw new Error('text after a closing quote');
    } else {
      while (i < n && text[i] !== ',' && text[i] !== '\r' && text[i] !== '\n') {
        if (text[i] === '"') throw new Error('a quote inside an unquoted field');
        field += text[i++];
      }
    }
    row.push(field); field = '';
    if (i >= n) { rows.push(row); break; }
    if (text[i] === ',') { i++; continue; }
    if (text[i] === '\r') i++;
    if (text[i] === '\n') i++;
    rows.push(row); row = [];
    if (i >= n) break;
  }
  return rows;
}

// ---------------------------------------------------------------------------------------------------------------

export function runExportChecks({ section, ok, random }) {
  const pick = (a) => a[Math.floor(random() * a.length)];
  const logU = (lo, hi) => lo * (hi / lo) ** random();
  const int = (lo, hi) => lo + Math.floor(random() * (hi - lo + 1));

  /** A random circuit of 1…maxParts parts, every kind, values a normalised 0.05…20 at f0 (as check-sweep.mjs). */
  function randomCircuit(maxParts) {
    const z0 = pick([50, 50, 75, 100, 25]), f0 = logU(1e6, 1e10), w0 = TAU * f0;
    const count = 1 + Math.floor(random() * maxParts), parts = [];
    for (let k = 0; k < count; k++) {
      const kind = Math.floor(random() * 10), a = logU(0.05, 20);
      switch (kind) {
        case 0: parts.push({ kind, value: a * z0 }); break;
        case 3: parts.push({ kind, value: z0 / a }); break;
        case 1: parts.push({ kind, value: (a * z0) / w0 }); break;
        case 2: parts.push({ kind, value: 1 / (w0 * a * z0) }); break;
        case 4: parts.push({ kind, value: z0 / (w0 * a) }); break;
        case 5: parts.push({ kind, value: a / (w0 * z0) }); break;
        case 9: parts.push({ kind, value: 20 + 100 * random() }); break;
        default: parts.push({ kind, value: 0.02 + 0.46 * random(), zc: 20 + 100 * random() });
      }
    }
    return { z0, f0, loadR: random() < 0.05 ? Infinity : logU(1, 500), loadX: (random() - 0.5) * 600, parts };
  }
  const randomBand = (f0) => ({ start: f0 * (0.3 + 0.6 * random()), stop: f0 * (1.1 + 1.9 * random()), points: 101 + Math.floor(random() * 900), log: random() < 0.5 });

  // The figures of a Γ, computed here (not from convert.ts).
  const figures = (gr, gi, z0) => {
    const mag = Math.sqrt(gr * gr + gi * gi);
    const dr = 1 - gr, di = -gi, den = dr * dr + di * di; // z = (1 + Γ)/(1 − Γ)
    const zr = den === 0 ? Infinity : ((1 + gr) * dr + gi * di) / den, zi = den === 0 ? 0 : (gi * dr - (1 + gr) * di) / den;
    return { mag, deg: Math.atan2(gi, gr) * 180 / Math.PI, rl: -20 * Math.log10(mag), vswr: mag >= 1 ? Infinity : (1 + mag) / (1 - mag), R: zr * z0, X: zi * z0 };
  };

  // ---------------------------------------------------------------------------------------------------------------
  section('export touchstone reader');
  {
    const good = (text, what, test) => {
      let r = null, err = '';
      try { r = readTouchstone(text); } catch (e) { err = e.message; }
      ok(r !== null && test(r), `${what}: ${err || JSON.stringify(r && { ...r, freqs: r.freqs.slice(0, 3), re: r.re.slice(0, 3), im: r.im.slice(0, 3) })}`);
    };
    const close = (a, b, tol = 1e-12) => Math.abs(a - b) <= tol;
    good('# \n1 0.5 90\n2 0.5 180\n', 'defaults GHz S MA R 50', (r) => r.unit === 'ghz' && r.format === 'ma' && r.R === 50 && r.freqs[0] === 1e9 && close(r.re[0], 0) && close(r.im[0], 0.5) && close(r.re[1], -0.5));
    good('! a comment\n# mhz s ri r 75 ! trailing\n\n100 0.1 -0.2 ! point\n200 .3 4E-1\n', 'lower case, comments, R 75', (r) => r.R === 75 && r.freqs[1] === 200e6 && r.re[1] === 0.3 && r.im[1] === 0.4);
    good('# R 25 DB S KHZ\n1 -6.020599913279624 0\n', 'fields in any order, DB', (r) => r.unit === 'khz' && r.R === 25 && close(r.re[0], 0.5) && r.freqs[0] === 1000);
    good('# Hz Z RI R 50\n1e9 1 0\n2e9 2 0\n3e9 0 1\n', '1.1 Z normalised', (r) => close(r.re[0], 0) && close(r.re[1], 1 / 3) && close(r.re[2], 0) && close(r.im[2], 1));
    good('# Hz Y RI R 50\n1e9 1 0\n2e9 0.5 0\n', '1.1 Y normalised', (r) => close(r.re[0], 0) && close(r.re[1], 1 / 3));
    good('# Hz S RI R 50\n1 0.1 0\n# GHz S MA R 75\n2 0.2 0\n', '1.1: a later option line ignored', (r) => r.freqs[1] === 2 && r.R === 50);
    good('! v2\n[Version] 2.0\n# Hz Z RI R 50\n[Number of Ports] 1\n[Number of Frequencies] 2\n[Reference]\n100\n[Network Data]\n1e6 100 0\n2e6 300 0\n[End]\n', '2.0 with [Reference] on the next line, Z in ohms', (r) => r.version === 2 && r.R === 100 && close(r.re[0], 0) && close(r.re[1], 0.5));
    good('[Version] 2.0\n# GHz S RI R 50\n[Number of Ports] 1\n[Number of Frequencies] 1\n[Network Data]\n1 0.25 0.5\n[End]\n', '2.0 S', (r) => r.version === 2 && r.re[0] === 0.25 && r.im[0] === 0.5);
    const bad = [
      ['', 'empty'],
      ['1 0.5 0\n', 'no option line'],
      ['1 0.5 0\n# Hz S RI R 50\n', 'data before the option line'],
      ['# Hz S XY R 50\n1 0 0\n', 'unknown format'],
      ['# Hz S RI R\n1 0 0\n', 'R without its number'],
      ['# Hz S RI R -50\n1 0 0\n', 'a negative R'],
      ['# Hz S RI R 50 RI\n1 0 0\n', 'a format twice'],
      ['# Hz G RI R 50\n1 0 0\n', 'G of one port'],
      ['# Hz S RI R 50\n1 0.5 abc\n', 'a word in the data'],
      ['# Hz S RI R 50\n1 0.5 0.1e\n', 'a broken exponent'],
      ['# Hz S RI R 50\n1 0.5\n', 'a line short of its pair'],
      ['# Hz S RI R 50\n1 0.5 0 0.1\n', 'a line of four numbers'],
      ['# Hz S RI R 50\n2 0.5 0\n1 0.5 0\n', 'falling frequencies'],
      ['# Hz S RI R 50\n1 0.5 0\n1 0.4 0\n', 'a repeated frequency'],
      ['# Hz S RI R 50\n-1 0.5 0\n', 'a negative frequency'],
      ['# Hz S RI R 50\n', 'no data'],
      ['# Hz S RI R 50\n[Number of Ports] 1\n1 0 0\n', 'a keyword in 1.1'],
      ['[Version] 2.0\n# Hz S RI R 50\n[Number of Frequencies] 1\n[Network Data]\n1 0 0\n[End]\n', '2.0 without [Number of Ports]'],
      ['[Version] 2.0\n# Hz S RI R 50\n[Number of Ports] 1\n[Number of Frequencies] 2\n[Network Data]\n1 0 0\n[End]\n', '2.0 with the wrong count'],
      ['[Version] 2.0\n# Hz S RI R 50\n[Number of Ports] 1\n[Number of Frequencies] 1\n[Network Data]\n1 0 0\n', '2.0 without [End]'],
      ['[Version] 2.0\n# Hz S RI R 50\n[Number of Ports] 1\n[Number of Frequencies] 1\n1 0 0\n[Network Data]\n[End]\n', '2.0 data before [Network Data]'],
      ['[Version] 2.0\n# Hz S RI R 50\n[Number of Ports] 2\n[Number of Frequencies] 1\n[Network Data]\n1 0 0 0 0 0 0 0 0\n[End]\n', 'two ports'],
      ['# Hz S RI R 50\n[Version] 2.0\n1 0 0\n', '[Version] not first'],
      ['[Version] 2.0\n[Number of Ports] 1\n# Hz S RI R 50\n', '2.0 keyword before the option line'],
    ];
    for (const [text, what] of bad) {
      let threw = false;
      try { readTouchstone(text); } catch { threw = true; }
      ok(threw, `the reader takes a malformed file (${what})`);
    }
  }

  // ---------------------------------------------------------------------------------------------------------------
  section('export touchstone');
  {
    const date = new Date(Date.UTC(2026, 10, 13, 12, 34, 56, 789));
    let points = 0, worst = { RI: 0, MA: 0, DB: 0 };
    for (let t = 0; t < 60; t++) {
      const c = randomCircuit(8), sc = sweepCircuit(c), band = randomBand(c.f0);
      const trace = new Trace(16);
      runSweep(trace, band, sc, random() < 0.5 ? REFINE_DEFAULTS : null);
      const link = encodeCircuit(c);
      const g = new Float64Array(2);
      for (const format of ['RI', 'MA', 'DB']) {
        const text = touchstone({ freqs: trace.freqs, gamma: trace.gamma, n: trace.n, z0: c.z0, link, date, format });
        let r = null, err = '';
        try { r = readTouchstone(text); } catch (e) { err = e.message; }
        ok(r !== null, `circuit ${t} ${format}: the reference reader refuses our file: ${err}`);
        if (!r) continue;
        ok(r.version === 1 && r.unit === 'hz' && r.param === 's' && r.format === format.toLowerCase() && r.R === c.z0, `circuit ${t} ${format}: option line ${JSON.stringify(r)}`);
        ok(r.freqs.length === trace.n, `circuit ${t} ${format}: ${r.freqs.length} of ${trace.n} frequencies`);
        let fBad = 0, w = 0;
        for (let i = 0; i < r.freqs.length; i++) {
          if (r.freqs[i] !== trace.freqs[i]) fBad++;
          gammaAt(g, 0, sc, r.freqs[i]);
          w = Math.max(w, Math.abs(r.re[i] - g[0]), Math.abs(r.im[i] - g[1]));
        }
        ok(fBad === 0, `circuit ${t} ${format}: ${fBad} frequencies not to the bit`);
        ok(w <= 1e-12, `circuit ${t} ${format}: Γ ${w} from gammaAt`);
        if (format === 'RI') ok(w === 0, `circuit ${t}: RI is not to the bit (${w})`);
        worst[format] = Math.max(worst[format], w);
        if (format === 'RI') points += r.freqs.length;
        const lines = text.split('\r\n');
        ok(lines[lines.length - 1] === '' && !/[^\r\n]\n/.test(text), `circuit ${t} ${format}: lines end in CRLF`);
        ok(/^[\x20-\x7e\r\n]*$/.test(text), `circuit ${t} ${format}: only ASCII`);
        ok(lines[0].startsWith('! Smith chart, https://yotasage.github.io/smith-chart/main') && lines.includes('! Date: 2026-11-13T12:34:56Z')
          && lines.includes(`! Circuit: https://yotasage.github.io/smith-chart/main?${link}`) && lines.includes(`! ${trace.n} frequencies`), `circuit ${t} ${format}: comments ${lines.slice(0, 5).join(' | ')}`);
        ok(lines.find((l) => l[0] === '#') === `# Hz S ${format} R ${c.z0}`, `circuit ${t} ${format}: option line text`);
      }
    }
    console.log(`export touchstone: 60 circuits × RI, MA, DB read back by the reference reader, ${points} points; worst |ΔΓ| RI ${worst.RI}, MA ${worst.MA.toExponential(2)}, DB ${worst.DB.toExponential(2)}`);
    // A repeat is written once; |Γ| = 0 in dB; a link given with "?" or as a URL.
    const text = touchstone({ freqs: [1e9, 1e9, 2e9], gamma: [0, 0, 0.5, 0, 0.25, -0.25], n: 3, z0: 50, link: '?v=1&z0=50', format: 'DB', date: new Date(0) });
    const r = readTouchstone(text);
    ok(r.freqs.length === 2 && r.freqs[1] === 2e9 && Math.abs(r.re[0]) < 1e-300 && Math.abs(r.re[1] - 0.25) < 1e-15, `repeat and 0 in dB: ${JSON.stringify(r)}`);
    ok(text.includes(`1000000000 ${DB_FLOOR} 0`) && text.includes('! Circuit: https://yotasage.github.io/smith-chart/main?v=1&z0=50'), 'DB floor and the link with "?"');
    const url = touchstone({ freqs: [1], gamma: [0, 0], n: 1, z0: 50, link: 'https://example.org/x?y=Γ', date: new Date(0) });
    ok(url.includes('! Circuit: https://example.org/x?y=?') && !url.includes('Γ'), 'a URL kept, non-ASCII replaced');
    ok(!touchstone({ freqs: [1], gamma: [0, 0], n: 1, z0: 50 }).includes('Circuit'), 'no link, no Circuit line');
  }

  // ---------------------------------------------------------------------------------------------------------------
  section('export csv');
  {
    // Fields: random texts with commas, quotes, CR, LF, spaces and Unicode read back as written.
    const alphabet = ['a', 'Z', '0', ' ', ',', '"', '\r', '\n', 'Γ', 'Ω', '∠', '−', '-', ';', "'", '\t'];
    let fieldsOk = 0;
    for (let t = 0; t < 200; t++) {
      const rows = [];
      for (let r = int(1, 5); r > 0; r--) {
        const row = [];
        for (let k = int(1, 6); k > 0; k--) { let s = ''; for (let j = int(0, 8); j > 0; j--) s += pick(alphabet); row.push(s); }
        rows.push(row);
      }
      // An only field that is empty would be an empty line, which RFC 4180 does not tell from no record.
      for (const row of rows) if (row.length === 1 && row[0] === '') row[0] = 'x';
      const text = csvRows(rows.map((r) => r.map(csvField)), random() < 0.5);
      let back = null;
      try { back = readCsv(text); } catch { /* counted below */ }
      if (back && JSON.stringify(back) === JSON.stringify(rows)) fieldsOk++;
    }
    ok(fieldsOk === 200, `${fieldsOk} of 200 random tables read back`);
    ok(csvField('a,b') === '"a,b"' && csvField('say "hi"') === '"say ""hi"""' && csvField('plain') === 'plain' && csvField('l1\nl2') === '"l1\nl2"', 'quoting');

    // Numbers.
    const cases = [
      [31.83098861837907e-12, 4, 'eng', '31.83e-12'], [31.83098861837907e-12, 4, 'plain', '0.00000000003183'],
      [100e6, 4, 'plain', '100000000'], [100e6, 4, 'eng', '100e6'], [0.5, 4, 'eng', '500e-3'], [0.5, 4, 'plain', '0.5'],
      [9.9996, 4, 'plain', '10'], [999.96, 4, 'eng', '1e3'], [-1234.5678, 6, 'plain', '-1234.57'], [-0, 4, 'plain', '0'],
      [Infinity, 4, 'plain', 'inf'], [-Infinity, 0, 'eng', '-inf'], [NaN, 4, 'plain', ''], [0.1, 0, 'plain', '0.1'],
      [1e21, 0, 'plain', '1000000000000000000000'], [123456, 0, 'eng', '123.456e3'], [1.5e-7, 2, 'eng', '150e-9'],
      [79.57747154594767e-9, 0, 'eng', '79.57747154594767e-9'], [2, 3, 'eng', '2'],
    ];
    for (const [v, d, form, want] of cases) ok(csvNumber(v, d, form) === want, `csvNumber(${v}, ${d}, ${form}) = ${csvNumber(v, d, form)}, wanted ${want}`);
    let numbers = 0, worstRel = 0, exactBad = 0, formBad = 0;
    const buf = new Float64Array(1), bits = new Uint32Array(buf.buffer);
    for (let t = 0; t < 4000; t++) {
      let v;
      // Random bits: every double but those within a rounding of the largest (1.8e308 to one digit is 2e308, over it).
      if (t % 2) { bits[0] = Math.floor(random() * 2 ** 32); bits[1] = Math.floor(random() * 2 ** 32); v = buf[0]; if (!(Math.abs(v) < 1e307) || v === 0) continue; }
      else v = (random() < 0.5 ? -1 : 1) * logU(1e-15, 1e15);
      for (const form of ['plain', 'eng']) {
        for (const d of [0, 1, 3, 4, 5, 6, 8, 12, 15, 17]) {
          if (form === 'plain' && Math.abs(Math.log10(Math.abs(v))) > 60) continue; // 300 zeros are legal but slow to check
          const s = csvNumber(v, d, form), back = Number(s);
          numbers++;
          if (form === 'plain' ? /[eE]/.test(s) : !/^-?(?:[1-9]\d{0,2})(?:\.\d+)?(?:e-?\d+)?$/.test(s) || (s.includes('e') && +s.split('e')[1] % 3 !== 0)) formBad++;
          if (d === 0) { if (back !== v) exactBad++; } else worstRel = Math.max(worstRel, Math.abs(back - v) / Math.abs(v) / (0.5 * 10 ** (1 - d)));
        }
      }
    }
    ok(exactBad === 0, `${exactBad} numbers of every digit not read back to the bit`);
    ok(worstRel <= 1 + 1e-9, `numbers to d digits: worst error ${worstRel} of half a unit in the d-th digit`);
    ok(formBad === 0, `${formBad} numbers not in their form (plain without exponent, engineering mantissa 1…999, exponent ×3)`);

    // A table's numbers against figures computed here, to the shown digits (every digit: to the bit).
    const within = (text, want, d) => {
      if (want !== want) return text === '';
      if (want === Infinity || want === -Infinity) return text === (want > 0 ? 'inf' : '-inf');
      if (text === '' || !/^-?\d+(?:\.\d+)?(?:e-?\d+)?$/.test(text)) return false;
      const back = Number(text);
      if (d === 0) return back === want || (want === 0 && back === 0);
      return Math.abs(back - want) <= 0.5 * 10 ** (1 - d) * Math.abs(want) * (1 + 1e-9) + 1e-300;
    };
    let tables = 0, cells = 0, cellBad = 0, firstBad = '';
    const derived = (row, at, x, d, what) => {
      [x.mag, x.deg, x.rl, x.vswr, x.R, x.X].forEach((want, j) => {
        cells++;
        const text = row[at + j], back = Number(text);
        const good = want === Infinity ? text === 'inf' : text !== '' && Math.abs(back - want) <= (d ? 0.5 * 10 ** (1 - d) * (1 + 1e-9) : 0) * Math.abs(want) + 1e-12 * Math.max(1, Math.abs(want));
        if (!good) { cellBad++; if (!firstBad) firstBad = `${what} column ${at + j}: ${text} for ${want} at ${d} digits`; }
      });
    };
    const cell = (text, want, d, what) => { cells++; if (!within(text, want, d)) { cellBad++; if (!firstBad) firstBad = `${what}: ${JSON.stringify(text)} for ${want} at ${d} digits`; } };
    for (let t = 0; t < 40; t++) {
      const c = randomCircuit(6), sc = sweepCircuit(c), band = randomBand(c.f0), trace = new Trace(16);
      runSweep(trace, band, sc, null);
      const d = pick([0, 3, 4, 5, 6, 8]), form = pick(['plain', 'eng']), opts = { digits: d, form, bom: random() < 0.5 };
      // Trace.
      let rows = readCsv(traceCsv(trace, c.z0, opts));
      tables++;
      ok(JSON.stringify(rows[0]) === JSON.stringify([...TRACE_COLUMNS]) && rows.length === trace.n + 1, `trace ${t}: header or rows`);
      const g = new Float64Array(2);
      for (let i = 0; i < trace.n; i++) {
        const row = rows[i + 1], f = trace.freqs[i];
        gammaAt(g, 0, sc, f);
        const x = figures(g[0], g[1], c.z0);
        cell(row[0], f, d, `trace ${t} f`); cell(row[1], g[0], d, `trace ${t} Re Γ`); cell(row[2], g[1], d, `trace ${t} Im Γ`);
        // Derived figures: computed here in another order, so to the shown digits with a slack of 1e-12.
        derived(row, 3, x, d, `trace ${t}`);
      }
      // Nodes.
      rows = readCsv(nodesCsv(c, opts));
      tables++;
      const n = c.parts.length, { metrics } = evaluateCircuit(c);
      ok(JSON.stringify(rows[0]) === JSON.stringify([...NODE_COLUMNS]) && rows.length === n + 2, `nodes ${t}: header or rows`);
      for (let k = 0; k <= n; k++) {
        const row = rows[k + 1], o = k * METRIC_STRIDE;
        ok(row[0] === nodeName(k, n) && row[1] === (k ? `${k} ${KIND_NAMES[c.parts[k - 1].kind]}` : 'Load'), `nodes ${t}: names of node ${k}: ${row[0]}, ${row[1]}`);
        cell(row[2], c.f0, d, 'f0');
        const zr = metrics[o + M_ZR], zi = metrics[o + M_ZI], yr = metrics[o + M_YR], yi = metrics[o + M_YI], gr = metrics[o + M_GR], gi = metrics[o + M_GI];
        const x = figures(gr, gi, c.z0);
        const want = [zr, zi, zr * c.z0, zi * c.z0, yr, yi, yr / c.z0, yi / c.z0, gr, gi];
        want.forEach((w, j) => cell(row[3 + j], w, d, `nodes ${t} node ${k} ${NODE_COLUMNS[3 + j]}`));
        for (const [j, w] of [[13, x.mag], [14, x.deg], [15, x.vswr], [16, x.rl], [17, metrics[o + M_Q]]]) {
          cells++;
          const back = Number(row[j]);
          const tol = (d ? 0.5 * 10 ** (1 - d) * 1.000001 : 0) + 1e-12;
          const okd = (w === Infinity && row[j] === 'inf') || Math.abs(back - w) <= tol * Math.max(Math.abs(w), j === 14 ? 180 : 1e-300);
          if (!okd) { cellBad++; if (!firstBad) firstBad = `nodes ${t} node ${k} column ${j}: ${row[j]} for ${w}`; }
        }
      }
      // Markers.
      const freqs = [];
      for (let m = int(0, 9); m > 0; m--) freqs.push(band.start + random() * (band.stop - band.start));
      const markers = markersAt(sc, freqs);
      rows = readCsv(markersCsv(markers, opts));
      tables++;
      ok(JSON.stringify(rows[0]) === JSON.stringify([...MARKER_COLUMNS]) && rows.length === freqs.length + 1, `markers ${t}: header or rows`);
      markers.forEach((m, i) => {
        const row = rows[i + 1];
        ok(row[0] === `M${i + 1}`, `markers ${t}: name ${row[0]}`);
        gammaAt(g, 0, sc, freqs[i]);
        cell(row[1], freqs[i], d, 'marker f'); cell(row[2], g[0], d, 'marker Re Γ'); cell(row[3], g[1], d, 'marker Im Γ');
        derived(row, 4, figures(g[0], g[1], c.z0), d, `markers ${t}`);
      });
      if (opts.bom) ok(traceCsv(trace, c.z0, opts).charCodeAt(0) === 0xfeff, 'BOM first'); else ok(traceCsv(trace, c.z0, opts).startsWith('f (Hz)'), 'no BOM');
    }
    ok(cellBad === 0, `${cellBad} of ${cells} cells not to the shown digits; first: ${firstBad}`);
    console.log(`export csv: 200 random tables of RFC 4180 fields; ${numbers} numbers in plain and engineering form; ${tables} tables of 40 circuits (trace, nodes, markers), ${cells} cells to the shown digits`);
  }

  // ---------------------------------------------------------------------------------------------------------------
  section('export project');
  {
    const date = new Date(Date.UTC(2026, 10, 13));
    const GOALS = ['pt', 'mag', 'vswr', 'rl', 'r', 'g', 'x', 'b'];
    /** A random state as the page could hold it: a random link read by decodeCircuit (so the ask is a valid one). */
    function randomState() {
      const c = randomCircuit(8);
      let link = encodeCircuit(c);
      const n = c.parts.length;
      if (random() < 0.7) {
        const u = [];
        for (let k = int(0, 2); k > 0; k--) u.push(random() < 0.15 ? 'f0' : `${int(1, n)}${pick(['', '', 'zc', 'lc'])}`);
        if (u.length) link += `&u=${u.join(',')}`;
        const kind = pick(GOALS);
        let g = kind;
        if (kind === 'pt') { if (random() < 0.7) g += `:${STATE.numText(logU(1, 300))}:${STATE.numText((random() - 0.5) * 200)}`; }
        else if (random() < 0.8) g += `:${STATE.numText(kind === 'mag' ? random() * 0.9 : kind === 'vswr' ? 1 + random() * 4 : kind === 'rl' ? random() * 30 : kind === 'r' || kind === 'g' ? random() * 3 : (random() - 0.5) * 4)}`;
        if ((kind === 'mag' || kind === 'vswr' || kind === 'rl') && random() < 0.5) g += ':within';
        if (random() < 0.4) g += `@${int(0, n)}`;
        link += `&g=${g}`;
      }
      const read = decodeCircuit(link);
      let sweep = null;
      if (random() < 0.7) {
        const band = { ...randomBand(c.f0), points: int(2, 10000) };
        const markers = [];
        for (let m = int(0, 9); m > 0; m--) markers.push(band.start + random() * (band.stop - band.start));
        sweep = { band, markers };
        if (random() < 0.5) sweep.limit = pick([3, 6, 14, 20.5, 100]);
        if (random() < 0.5) sweep.vswr = true;
      }
      const lists = {};
      for (const kind of VALUE_KINDS) {
        const id = pick(LIST_IDS);
        if (id !== 'own') { lists[kind] = { id }; continue; }
        const values = [];
        for (let k = int(1, 40); k > 0; k--) values.push(Number(logU(1e-12, 1e4).toPrecision(int(2, 15))));
        lists[kind] = { id: 'own', values: [...new Set(values)].sort((a, b) => a - b) };
      }
      let detail = pick(DETAIL_NAMES);
      if (random() < 0.5) {
        detail = { ...DETAIL_PRESETS[pick(DETAIL_NAMES)] };
        for (const k of Object.keys(detail)) {
          if (k === 'density') detail[k] = pick(['coarse', 'normal', 'fine']);
          else if (k === 'grid') detail[k] = pick(['z', 'y', 'zy']);
          else detail[k] = random() < 0.5;
        }
      }
      const exports = {
        width: random() < 0.5 ? pick([88, 160, 180]) : 30 + random() * 1970, linewidth: random() < 0.3,
        view: random() < 0.3 ? { x0: -1 + random(), y0: -1 + random(), x1: 0.1 + random(), y1: 0.1 + random() } : null,
        detail, colour: pick(['colour', 'grey', 'bw']), fontPt: random() < 0.5 ? 7 : 6 + random() * 18,
        digits: int(0, 17), form: pick(['plain', 'eng']), touchstone: pick(['RI', 'MA', 'DB']),
      };
      return { circuit: read.circuit, sweep, lists, exports };
    }
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    let trips = 0, issuesSeen = 0, firstIssue = '';
    for (let t = 0; t < 200; t++) {
      const p = randomState();
      const text = projectJson(p, date);
      let json = null;
      try { json = JSON.parse(text); } catch { /* counted */ }
      ok(json && json.format === PROJECT_FORMAT && json.version === PROJECT_VERSION && json.link === `https://yotasage.github.io/smith-chart/main?${projectLink(p)}`, `state ${t}: the file's head`);
      const o = openProject(text);
      if (o.issues.length) { issuesSeen++; if (!firstIssue) firstIssue = `${o.issues.join('; ')} in ${text.slice(0, 400)}`; }
      const q = o.project;
      const good = q && o.version === 1 && o.message === '' && projectLink(q) === projectLink(p) && sameCircuit(q.circuit, p.circuit)
        && sweepParams(q.sweep) === sweepParams(p.sweep) && same(q.sweep, p.sweep) && choiceToText(q.lists) === choiceToText(p.lists)
        && same(q.lists, p.lists) && same(q.exports, p.exports);
      ok(good, `state ${t}: opened differs: ${q ? projectLink(q) : o.message} / ${projectLink(p)}; ${JSON.stringify(q && q.exports)} / ${JSON.stringify(p.exports)}`);
      ok(q && projectJson(q, date) === text, `state ${t}: saved again, a different text`);
      if (good) trips++;
    }
    ok(issuesSeen === 0, `${issuesSeen} round trips with issues; first: ${firstIssue}`);
    // An example file, as the notes show it.
    const sample = projectJson({ circuit: decodeCircuit('v=1&z0=50&f0=100e6&zl=25:25&p=cs:31.83098861837907e-12,lp:79.57747154594767e-9&u=1,2&g=vswr:1.5:within').circuit,
      sweep: { band: { start: 50e6, stop: 150e6, points: 401, log: false }, markers: [100e6] }, lists: { ...V.defaultChoice(), C: { id: 'own', values: [1e-12, 2.2e-12, 4.7e-12] } }, exports: defaultExportSettings() }, date);
    ok(sample.includes('"parts": [\n      { "kind": "cs", "value": 3.183098861837907e-11 },') && sample.includes('"markers": [100000000]') && sample.includes('"values": [1e-12, 2.2e-12, 4.7e-12]'), `compact layout:\n${sample}`);

    // Version 0: a link, as plain text, a URL, a JSON string, {link} and {version: 0, link}.
    const link = 'v=1&z0=75&f0=2.4e9&zl=10:-20&p=cs:1e-12,lp:5e-9,tl:0.1:60&u=1,2&g=vswr:1.5:within&vl=L12,Co1e-12_2.2e-12&sw=2e9:3e9:201:log&mk=2.4e9,2.5e9&sl=14&sp=vswr';
    const ref = decodeCircuit(link);
    const forms = [link, `https://yotasage.github.io/smith-chart/main?${link}#theory`, `﻿  ?${link}\n`, JSON.stringify(link), JSON.stringify({ link }), JSON.stringify({ version: 0, link })];
    for (const text of forms) {
      const o = openProject(text);
      ok(o.version === 0 && o.message === '' && o.issues.length === 0 && o.project && sameCircuit(o.project.circuit, ref.circuit)
        && sweepParams(o.project.sweep) === sweepParams(ref.sweep) && choiceToText(o.project.lists) === 'L12,Co1e-12_2.2e-12'
        && same(o.project.exports, defaultExportSettings()), `version 0 ${text.slice(0, 30)}: ${JSON.stringify(o).slice(0, 300)}`);
      // Migrated, saved as version 1 and opened again: the same link.
      if (o.project) {
        const again = openProject(projectJson(o.project, date));
        ok(again.version === 1 && projectLink(again.project) === projectLink(o.project) && projectLink(o.project) === `${encodeCircuit(ref.circuit)}&vl=L12,Co1e-12_2.2e-12${sweepParams(ref.sweep)}`, `version 0 saved as 1: ${projectLink(again.project ?? o.project)}`);
      }
    }
    const lesson = openProject(`${link}&tx=hello&ch=two.5`);
    ok(lesson.project && lesson.issues.length === 2 && lesson.issues.every((s) => s.includes('not kept')), `a lesson link: ${lesson.issues.join('; ')}`);
    const broken = openProject('v=1&z0=-5&p=cs:1e-12,xx:1');
    ok(broken.project && broken.version === 0 && broken.issues.length === 2 && broken.project.circuit.z0 === 50, `a broken link: ${broken.issues.join('; ')}`);

    // Version 2 is refused with its message.
    const v2 = JSON.parse(projectJson(randomState(), date));
    v2.version = 2;
    const refused = openProject(JSON.stringify(v2));
    ok(refused.project === null && refused.version === 2 && refused.message.includes('newer version') && refused.message.includes('file version 2') && refused.message.includes(`up to ${PROJECT_VERSION}`), `version 2: ${refused.message}`);
    console.log(`export project: version 2 → “${refused.message}”`);

    // Not a project.
    for (const [text, what] of [['', 'empty'], ['   ', 'blank'], ['hello world', 'words'], ['{', 'broken JSON'], ['[1, 2]', 'an array'], ['42', 'a number'],
      ['{"format":"other","version":1}', 'another format'], ['{"format":"smith-chart-project","version":1.5}', 'version 1.5'],
      ['{"format":"smith-chart-project","version":"1"}', 'version as text'], ['{"version":-1}', 'version −1'], ['{"a":1}', 'no version or link'],
      ['"just text"', 'a JSON string that is no link'], ['x=1&y=2', 'a query of other parameters'], ['x'.repeat(PR.PROJECT_MAX_BYTES + 1), 'too large'],
      [null, 'null'], [undefined, 'undefined']]) {
      let o, threw = false;
      try { o = openProject(text); } catch { threw = true; }
      ok(!threw && o.project === null && o.message.length > 0, `${what}: ${threw ? 'threw' : JSON.stringify(o).slice(0, 200)}`);
    }

    // Fields that cannot be used: issues, start values, never a throw.
    const base = JSON.parse(projectJson({ circuit: decodeCircuit('v=1&p=cs:1e-12,lp:5e-9,tl:0.1:60').circuit, sweep: null, lists: V.defaultChoice(), exports: defaultExportSettings() }, date));
    const edit = (fn) => { const d = JSON.parse(JSON.stringify(base)); fn(d); return openProject(JSON.stringify(d)); };
    const fieldCases = [
      [(d) => { d.circuit.z0 = 'abc'; }, (o) => o.project.circuit.z0 === 50 && o.issues.length === 1, 'z0 as words'],
      [(d) => { d.circuit.z0 = -1; }, (o) => o.project.circuit.z0 === 50 && o.issues.length === 1, 'a negative z0'],
      [(d) => { d.circuit.f0 = '2.4G'; }, (o) => o.project.circuit.f0 === 2.4e9 && o.issues.length === 0, 'f0 as link text'],
      [(d) => { d.circuit.load = { r: 'inf', x: 5 }; }, (o) => o.project.circuit.loadR === Infinity && o.project.circuit.loadX === 0 && o.issues.length === 0, 'an open load'],
      [(d) => { d.circuit.parts[0].kind = 'zz'; }, (o) => o.project.circuit.parts.length === 2 && o.issues.length === 1, 'an unknown part'],
      [(d) => { d.circuit.parts[1] = 7; }, (o) => o.project.circuit.parts.length === 2 && o.issues.length === 1, 'a part that is a number'],
      [(d) => { delete d.circuit.parts[2].zc; }, (o) => o.project.circuit.parts.length === 2 && o.issues.length === 1, 'a line without Zc'],
      [(d) => { d.circuit.parts[0].value = '1,2'; }, (o) => o.project.circuit.parts.length === 2 && o.issues.length === 1, 'a value with a comma'],
      [(d) => { delete d.circuit; }, (o) => sameCircuit(o.project.circuit, STATE.defaultCircuit()) && o.issues.length === 1, 'no circuit'],
      [(d) => { d.circuit.parts = {}; }, (o) => o.project.circuit.parts.length === 0 && o.issues.length === 1, 'parts not a list'],
      [(d) => { d.solve = { unknowns: [{ part: 9 }, { param: 'f0' }, 'x'], goal: { kind: 'vswr', value: 0.5 } }; }, (o) => o.project.circuit.ask.unknowns.length === 1 && o.issues.length === 3, 'bad unknowns and goal'],
      [(d) => { d.solve = { unknowns: [{ part: 1 }, { part: 2 }], goal: { kind: 'rl', value: 'inf', within: true, node: 1 } }; }, (o) => o.project.circuit.ask.unknowns.length === 2 && o.project.circuit.ask.goal.node === 1 && o.issues.length === 0, 'a good ask'],
      [(d) => { d.sweep = { start: 1e8, stop: 5e7, points: 101 }; }, (o) => o.project.sweep === null && o.issues.length === 1, 'a band upside down'],
      [(d) => { d.sweep = { start: 1e8, stop: 2e8, points: 101, markers: [1.5e8, 3e8, 'x'], plot: 'smith' }; }, (o) => o.project.sweep.markers.length === 1 && o.issues.length === 3, 'bad markers and plot'],
      [(d) => { d.lists = { R: { id: 'E7' }, Q: { id: 'E6' }, L: { id: 'own', values: [1e-9, -1, 'x'] }, C: { id: 'own', values: [] }, Z: 'E12' }; }, (o) => choiceToText(o.project.lists) === 'Lo1e-9,Z12' && o.issues.length === 4, 'bad lists'],
      [(d) => { d.export = { width: 5, colour: 'pink', detail: { preset: 'full', grid: 'q', legend: 'yes', nonsense: true }, digits: 18, form: 'sci', touchstone: 'XY', fontPt: 2, view: { x0: 1, y0: 0, x1: 0, y1: 1 }, linewidth: 1, what: 0 }; },
        (o) => same(o.project.exports, { ...defaultExportSettings(), detail: { ...DETAIL_PRESETS.full } }) && o.issues.length === 12, 'bad export settings'],
      [(d) => { d.extra = 1; delete d.format; }, (o) => o.issues.length === 2, 'an unknown field and no format'],
    ];
    for (const [fn, test, what] of fieldCases) {
      let o = null, threw = false;
      try { o = edit(fn); } catch { threw = true; }
      ok(!threw && o.project && test(o), `${what}: ${threw ? 'threw' : JSON.stringify({ issues: o.issues, link: o.project && projectLink(o.project), exports: o.project && o.project.exports })}`);
    }

    // Fuzz: random edits of valid files (values replaced by other types, keys removed, text cut) never throw, and a
    // file that still parses as version 1 gives a usable circuit.
    const junk = [null, true, -1, 0, 1e308, 'inf', '', 'x', [], {}, [1, 'a'], { a: 1 }, NaN];
    let fuzzOk = 0, fuzzed = 0;
    for (let t = 0; t < 500; t++) {
      const d = JSON.parse(projectJson(randomState(), date));
      const paths = [];
      const walk = (o, path) => { for (const k of Object.keys(o)) { paths.push([...path, k]); if (o[k] && typeof o[k] === 'object') walk(o[k], [...path, k]); } };
      walk(d, []);
      for (let e = int(1, 4); e > 0; e--) {
        const path = pick(paths);
        let o = d;
        for (let i = 0; i < path.length - 1 && o; i++) o = o[path[i]];
        if (!o || typeof o !== 'object') continue;
        if (random() < 0.3) delete o[path[path.length - 1]]; else o[path[path.length - 1]] = pick(junk);
      }
      let text = JSON.stringify(d);
      if (random() < 0.1) text = text.slice(0, int(0, text.length));
      fuzzed++;
      let o, threw = false;
      try { o = openProject(text); } catch { threw = true; }
      if (!threw && (o.project === null ? o.message.length > 0 : circuitProblem(o.project.circuit) === '' && Array.isArray(o.issues))) fuzzOk++;
    }
    ok(fuzzOk === fuzzed, `${fuzzed - fuzzOk} of ${fuzzed} fuzzed files threw or gave an unusable circuit`);
    console.log(`export project: ${trips} of 200 random states round-trip with no issue; version 0 in ${forms.length} forms migrated; ${fuzzed} fuzzed files`);
  }

  // ---------------------------------------------------------------------------------------------------------------
  section('export timing');
  {
    const c = { z0: 50, f0: 1e9, loadR: 10, loadX: -30, parts: Array.from({ length: 10 }, (_, k) => (k % 2 ? { kind: 4, value: 5e-9 } : { kind: 6, value: 0.1, zc: 70 })) };
    const sc = sweepCircuit(c), trace = new Trace(10000);
    runSweep(trace, { start: 0.5e9, stop: 1.5e9, points: 10000, log: false }, sc, null);
    const time = (fn) => { const t = []; for (let i = 0; i < 9; i++) { const t0 = performance.now(); fn(); t.push(performance.now() - t0); } return median(t); };
    const ts = retried(() => time(() => touchstone({ freqs: trace.freqs, gamma: trace.gamma, n: trace.n, z0: 50, link: encodeCircuit(c) })), (v) => v <= 10);
    const csvFull = retried(() => time(() => traceCsv(trace, 50, {})), (v) => v <= 40);
    const csv4 = retried(() => time(() => traceCsv(trace, 50, { digits: 4, form: 'eng' })), (v) => v <= 40);
    const p = { circuit: c, sweep: { band: { start: 0.5e9, stop: 1.5e9, points: 10000, log: false }, markers: [1e9] }, lists: V.defaultChoice(), exports: defaultExportSettings() };
    const proj = retried(() => time(() => openProject(projectJson(p))), (v) => v <= 5);
    ok(ts.value <= 10, `Touchstone of 10,000 points ${ts.value} ms (budget 10)`);
    ok(csvFull.value <= 40 && csv4.value <= 40, `trace CSV of 10,000 points ${csvFull.value} / ${csv4.value} ms (budget 40)`);
    ok(proj.value <= 5, `project save and open ${proj.value} ms (budget 5)`);
    console.log(`export timing (medians, 10,000 points): Touchstone ${ts.value.toFixed(2)} ms; trace CSV every digit ${csvFull.value.toFixed(2)} ms, 4 digits engineering ${csv4.value.toFixed(2)} ms; project save and open ${proj.value.toFixed(3)} ms`);
  }
}
