// Data export (step M8.2a): the CSV writers of lib/emsim/export/csv.ts read back equal the engine's numbers exactly
// (shortest round-trip digits) on C39 (the default microstrip), C41 (the LVDS pair), the C44 via (its results, TDR,
// TDT and S-parameters) with a sweep of the width, and the C45 pair's mixed-mode S; the Touchstone files of
// touchstone.ts read back by readTouchstone equal the N-port to 1e-9 relative in RI, MA and DB, the .s4p's ports in
// the order its comments state, and the written S is reciprocal (S21 = S12).

import * as SU0 from '../../../lib/emsim/setup.ts';
import * as ST0 from '../../../lib/emsim/structure.ts';
import * as LN0 from '../../../lib/emsim/lines.ts';
import * as V0 from '../../../lib/emsim/vary.ts';
import * as VM0 from '../../../lib/emsim/viamodel.ts';
import * as VIA0 from '../../../lib/emsim/via.ts';
import * as NP0 from '../../../lib/emsim/nport.ts';
import * as LK0 from '../../../lib/emsim/link.ts';
import * as CSV0 from '../../../lib/emsim/export/csv.ts';
import * as TS0 from '../../../lib/emsim/export/touchstone.ts';

const d = (m) => m.default ?? m;
const SU = d(SU0), ST = d(ST0), LN = d(LN0), V = d(V0), VM = d(VM0), VIA = d(VIA0), NP = d(NP0), LK = d(LK0), CSV = d(CSV0), TS = d(TS0);
const DATE = new Date('2026-11-16T12:00:00Z');

function pairSetup(kind, w, s) {
  const su = SU.defaultSetup();
  const st = ST.presetStructure(kind, su.stackup, w);
  st.s.v = s;
  return { ...su, trace: st };
}
const withMatrices = (r) => ({ ...r, bem: null, matrices: r.bem && r.bem.ok ? { C: r.bem.C, C0: r.bem.C0, L: r.bem.L, errC: r.bem.errC, errC0: r.bem.errC0, errL: r.bem.errL, levels: [] } : null });
const num = CSV.csvNumber;

export async function run(t) {
  // 1. The trace: C39 and C41.
  for (const [name, setup] of [['C39', SU.defaultSetup()], ['C41', pairSetup('pair-microstrip', 0.11, 0.2)]]) {
    const r = withMatrices(LN.solveSetup(setup));
    const text = CSV.traceCsv(r, { link: LK.encodeLink(setup), date: DATE });
    const [tb] = CSV.readCsv(text);
    t.ok(text.split('\r\n').every((l) => /^[\x20-\x7e]*$/.test(l)), `${name}: ASCII only, CRLF`);
    t.ok(text.includes(`# Setup: https://yotasage.github.io/em-sim/main?${LK.encodeLink(setup)}\r\n`) && text.includes('# Date: 2026-11-16T12:00:00Z'), `${name}: the header has the link and the date`);
    t.eq(tb.header.join(','), 'key,quantity,value,error,unit,status', `${name}: the columns`);
    const got = new Map(tb.rows.map((x) => [x[0], x]));
    const { values, errors } = LN.valuesOf(r);
    let bad = 0, n = 0;
    for (const k of Object.keys(values)) {
      if (r.n === 1 && /\.1$/.test(k) && !k.startsWith('mode')) continue; // one line: z0, eeff, delay without ".1"
      const x = got.get(k);
      n++;
      if (!x || num(x[2]) !== values[k] || num(x[3]) !== errors[k]) { bad++; if (bad < 4) t.ok(false, `${name} ${k}: ${x && x.slice(2, 4)} against ${values[k]} ± ${errors[k]}`); }
    }
    t.ok(bad === 0 && n > 5, `${name}: ${n} line results and errors read back exactly`);
    if (r.pair) t.ok(['zdiff', 'zcm', 'ztdr', 'kb', 'kf'].every((k) => got.has(k)), `${name}: the pair's quantities are there`);
    let mb = 0;
    for (const [m, e, p] of [['C', 'errC', 'C'], ['C0', 'errC0', 'C0_'], ['L', 'errL', 'L']]) {
      for (let i = 0; i < r.n; i++) for (let j = 0; j < r.n; j++) {
        const x = got.get(`${p}${i + 1}${j + 1}`);
        if (!x || num(x[2]) !== r.matrices[m][i][j] || num(x[3]) !== r.matrices[e][i][j]) mb++;
      }
      for (let i = 0; i < r.n; i++) for (let j = 0; j < r.n; j++) { const x = got.get(`zc${i + 1}${j + 1}`); if (!x || num(x[2]) !== r.Zc[i][j] || num(x[3]) !== r.errZc[i][j]) mb++; }
    }
    t.ok(mb === 0, `${name}: the matrices C, C0, L and Zc read back exactly (${mb} differ)`);
    t.ok(got.get(r.n === 1 ? 'z0' : 'zdiff')[4] === 'Ohm' && got.get(r.n === 1 ? 'delay' : 'mode1.delay')[4] === 's/m', `${name}: units`);
  }

  // 2. A sweep of the width on the default setup (the C44 via's trace).
  {
    const setup = SU.defaultSetup();
    const xs = [0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4];
    const res = V.runAll(V.sweep(setup, 'w', xs));
    const inp = V.inputsOf(setup, true).find((i) => i.id === 'w');
    const runObj = { input: 'w', label: inp.label, kind: inp.kind, xs, points: res.points };
    const [tb] = CSV.readCsv(CSV.sweepCsv(runObj, { date: DATE }));
    const keys = CSV.sweepKeys(res.points);
    t.ok(keys.includes('z0') && keys.includes('eeff') && keys.includes('delay'), `sweep: outputs ${keys.join(' ')}`);
    t.eq(tb.header[0], 'w (mm)', 'sweep: the input column');
    let bad = 0;
    tb.rows.forEach((x, i) => {
      const p = res.points[i];
      if (num(x[0]) !== p.x) bad++;
      keys.forEach((k, q) => { if (num(x[1 + 2 * q]) !== p.values[k] || num(x[2 + 2 * q]) !== p.err[k]) bad++; });
    });
    t.ok(bad === 0 && tb.rows.length === xs.length, `sweep: ${tb.rows.length} points of ${keys.length} outputs with errors read back exactly (${bad} differ)`);
  }

  // 3. The C44 via and the C45 pair.
  const su = SU.defaultSetup(), st = su.stackup;
  const c44 = VM.viaModel(st, su.via, su.trace, { nf: 401 });
  const c45 = VM.viaModel(st, VIA.presetVia('pair', st), null, { nf: 401 });
  {
    const tabs = CSV.readCsv(CSV.viaCsv(c44, { date: DATE }));
    const by = (n) => tabs.find((x) => x.name === n);
    const sum = new Map(by('Summary').rows.map((x) => [x[0], num(x[1])]));
    t.ok(sum.get('section impedance sqrt(L/C)') === c44.lumped.z && sum.get('section delay') === c44.lumped.delay && sum.get('valid up to') === c44.valid.fMax && sum.get('section C(1,1)') === c44.lumped.C[0][0], 'C44: the summary reads back exactly');
    const nodes = by('Pad and plane crossings').rows;
    t.ok(nodes.length === c44.nodes.length && nodes.every((x, i) => x[0] === c44.nodes[i].layer && num(x[2]) === c44.nodes[i].dC && num(x[3]) === c44.nodes[i].dCErr), `C44: ${nodes.length} crossings' extra capacitance and error`);
    const seg = by('Segments of the barrel').rows;
    t.ok(seg.length === c44.pieces.length && seg.every((x, i) => num(x[4]) === c44.pieces[i].z0 && num(x[7]) === c44.pieces[i].delay), `C44: ${seg.length} segments`);
    const stubs = by('Stubs').rows;
    t.ok(stubs.length === c44.stubs.length && stubs.every((x, i) => num(x[4]) === c44.stubs[i].fRes), `C44: ${stubs.length} stubs`);
    t.ok(by('Feeds').rows.length === c44.feeds.length, 'C44: the feeds');
    const tabs45 = CSV.readCsv(CSV.viaCsv(c45, { date: DATE }));
    const s45 = new Map(tabs45.find((x) => x.name === 'Summary').rows.map((x) => [x[0], num(x[1])]));
    t.ok(s45.get('section Zdiff') === c45.lumped.zdiff && s45.get('section Zcm') === c45.lumped.zcm, 'C45: Zdiff and Zcm of the section');
  }
  {
    const [tb] = CSV.readCsv(CSV.tdrCsv(c44, { date: DATE }));
    const T = c44.tdr;
    let bad = 0;
    tb.rows.forEach((x, i) => { if (num(x[0]) !== T.t[i] || num(x[1]) !== T.z[i] || num(x[2]) !== T.err.z || num(x[3]) !== T.rho[i] || num(x[4]) !== T.tdt[i]) bad++; });
    t.ok(bad === 0 && tb.rows.length === T.t.length, `C44 TDR: ${tb.rows.length} samples of t, Z, error, rho, TDT exactly (${bad} differ)`);
    const [tp] = CSV.readCsv(CSV.tdrCsv(c45, { date: DATE }));
    const D = c45.tdr, C = c45.tdrCommon;
    let bp = 0;
    tp.rows.forEach((x, i) => { if (num(x[1]) !== D.z[i] || num(x[5]) !== C.z[i]) bp++; });
    t.ok(bp === 0 && tp.header[1] === 'Zdiff (Ohm)' && tp.header[5] === 'Zcm (Ohm)', `C45 TDR: differential and common read back (${bp} differ)`);
  }
  {
    const [tb] = CSV.readCsv(CSV.sparamCsv(c44.nport, null, { date: DATE }));
    const np = c44.nport;
    let bad = 0;
    tb.rows.forEach((x, k) => {
      if (num(x[0]) !== np.f[k]) bad++;
      for (let q = 0; q < 4; q++) {
        const re = np.s[8 * k + 2 * q], im = np.s[8 * k + 2 * q + 1];
        if (num(x[4 + 4 * q]) !== re || num(x[5 + 4 * q]) !== im || num(x[2 + 4 * q]) !== CSV.dbOf(re, im)) bad++;
      }
    });
    t.ok(bad === 0 && tb.rows.length === np.f.length && tb.header[8] === 'S12 re', `C44 S: ${tb.rows.length} frequencies of S11…S22 (dB, phase, re, im) exactly (${bad} differ)`);
    t.ok(tb.rows.every((x) => x[1] === (num(x[0]) <= np.valid.fMax ? '1' : '0')), 'C44 S: the "valid" column follows the model\'s limit');
    const [tm] = CSV.readCsv(CSV.sparamCsv(c45.nport, c45.mixed, { date: DATE }));
    const col = tm.header.indexOf('Sdd21 re');
    let bm = 0;
    tm.rows.forEach((x, k) => { const [re, im] = NP.sEntry(c45.mixed, k, 1, 0); if (num(x[col]) !== re || num(x[col + 1]) !== im) bm++; });
    t.ok(col > 0 && bm === 0 && tm.header.includes('Scd12 re') && tm.header.length === 2 + 4 * 32, `C45 S: single-ended and mixed-mode, Sdd21 exact (${bm} differ, ${tm.header.length} columns)`);
  }

  // 4. Touchstone.
  const relNear = (a, b) => Math.abs(a - b) <= 1e-9 * Math.max(1e-6, Math.abs(b)) || Math.abs(a - b) <= 1e-15;
  for (const [name, r] of [['C44 .s2p', c44], ['C45 .s4p', c45]]) {
    const np = r.nport, P = np.ports;
    t.eq(TS.touchstoneExt(np), `.s${P}p`, `${name}: the extension`);
    for (const format of TS.TOUCHSTONE_FORMATS) {
      const text = TS.touchstone(np, { format, date: DATE, link: LK.encodeLink(su) });
      const back = TS.readTouchstone(text, P);
      t.ok(text.includes(`# GHZ S ${format} R 50\r\n`) && back.z0 === 50, `${name} ${format}: the option line`);
      let bad = 0, worst = 0;
      for (let k = 0; k < np.f.length; k++) if (!relNear(back.f[k], np.f[k])) bad++;
      for (let i = 0; i < np.s.length; i += 2) {
        const re = np.s[i], im = np.s[i + 1], m = Math.hypot(re, im);
        const e = Math.hypot(back.s[i] - re, back.s[i + 1] - im) / Math.max(m, 1e-300);
        // MA and DB give the phase in degrees: a tiny |S| can carry 1e-16 absolute on top of the relative error.
        if (!(e <= 1e-9 || Math.hypot(back.s[i] - re, back.s[i + 1] - im) <= 1e-15)) bad++;
        if (m > 1e-6) worst = Math.max(worst, e);
      }
      t.ok(bad === 0 && back.f.length === np.f.length, `${name} ${format}: ${back.f.length} frequencies read back within 1e-9 (worst ${worst.toExponential(1)}, ${bad} beyond)`);
      if (format === 'RI') {
        let rec = 0;
        for (let k = 0; k < back.f.length; k++) for (let i = 0; i < P; i++) for (let j = i + 1; j < P; j++) {
          const a = 2 * ((k * P + i) * P + j), b = 2 * ((k * P + j) * P + i);
          rec = Math.max(rec, Math.hypot(back.s[a] - back.s[b], back.s[a + 1] - back.s[b + 1]));
        }
        t.ok(rec <= 1e-12, `${name}: the written S is reciprocal (largest |Sij - Sji| ${rec.toExponential(1)})`);
        t.ok(back.comments.some((c) => /holds up to [\d.]+ GHz/.test(c)) && back.comments.some((c) => c.startsWith('Setup: https://')), `${name}: the comments give the model's limit and the setup`);
        if (P === 4) {
          const ports = back.comments.filter((c) => /^Port \d: /.test(c));
          t.eq(ports.join(' | '), 'Port 1: A entry | Port 2: B entry | Port 3: A exit | Port 4: B exit', `${name}: the port order as stated`);
          // Port 3 is A's exit: A's through path is S31, B's S42; the stated order is the order of the data.
          const k = Math.floor(np.f.length / 4);
          const [r31, i31] = NP.sEntry(np, k, 2, 0), o = 2 * ((k * 4 + 2) * 4 + 0);
          t.ok(back.s[o] === r31 && back.s[o + 1] === i31 && Math.hypot(r31, i31) > 0.5, `${name}: S31 (A entry to A exit) is the through path, |S31| ${Math.hypot(r31, i31).toFixed(3)}`);
        } else {
          const lines = text.split('\r\n').filter((l) => /^\d/.test(l));
          const k = Math.floor(np.f.length / 4), w = lines[k].split(' ').map(Number);
          const [r21, i21] = NP.sEntry(np, k, 1, 0);
          t.ok(w[3] === r21 && w[4] === i21, `${name}: the second pair of a line is S21 (Touchstone 1.1's 2-port order)`);
        }
      }
    }
  }
  t.ok(TS.touchstoneRefusal(c45.mixed) !== '' && TS.touchstoneRefusal(null) !== '', 'mixed-mode and missing S are refused with a reason');
}
