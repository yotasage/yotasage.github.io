// The worked examples of the Smith chart's sweep topics (docs/smith-chart/theory-sweep.md §12–13, step M7.4b): the
// circuits of notes-M7.4a.md "Example circuits", swept with lib/smith/sweep.ts, and every number the page prints for
// them as the page's text (four significant digits, lib/quantity.ts and readout.complexText), by the key of its
// data-ex span. ui-theory.mjs compares the page's spans with these; the page's numbers are fixed text.

import * as importedSweep from '../../../lib/smith/sweep.ts';
import * as importedParts from '../../../lib/smith/parts.ts';
import * as importedState from '../../../lib/smith/state.ts';
import * as importedConvert from '../../../lib/smith/convert.ts';
import * as importedQuantity from '../../../lib/quantity.ts';
import * as importedReadout from '../../../components/Smith/readout.ts';

const SW = importedSweep.default ?? importedSweep;
const P = importedParts.default ?? importedParts;
const S = importedState.default ?? importedState;
const cv = importedConvert.default ?? importedConvert;
const Q = importedQuantity.default ?? importedQuantity;
const R = importedReadout.default ?? importedReadout;

const F0 = 1e8, W0 = 2 * Math.PI * F0, Z0 = 50;
const hz = (f) => Q.formatAmount(f, 'Hz', 4, true);
const pct = (v) => Q.formatAmount(100 * v, '%', 4, true);
const num = (v) => Q.formatResidual(v, '', 4);
const db = (v) => Q.formatReturnLoss(v, 4);
const val = (v, unit) => Q.formatAmount(v, unit, 4, true);
const at = (dB) => cv.magFromReturnLoss(dB);
const LIN = (start, stop) => ({ start, stop, points: 401, log: false });
const DEF = LIN(50e6, 150e6);
const LOG = { start: 10e6, stop: 1e9, points: 401, log: true };

const circuit = (loadR, loadX, parts) => ({ z0: Z0, f0: F0, loadR, loadX, parts });
const rlc = (x) => circuit(50, 0, [{ kind: P.SERIES_L, value: (x * Z0) / W0 }, { kind: P.SERIES_C, value: 1 / (W0 * x * Z0) }]);
// An L network from R_low to R_high with a series C next to the lower and a shunt L (Q = √(R_high/R_low − 1)).
const lSection = (lo, hi) => {
  const q = Math.sqrt(hi / lo - 1);
  return [{ kind: P.SERIES_C, value: 1 / (W0 * q * lo) }, { kind: P.SHUNT_L, value: hi / (W0 * q) }];
};
const MID = Math.sqrt(10 * 50);

/** The example circuits, by the names of notes-M7.4a.md. */
export const EXAMPLES = {
  start: S.defaultCircuit(),
  rlc2: rlc(2),
  rlc5: rlc(5),
  l25: circuit(25, 0, lSection(25, 50)),
  l10: circuit(10, 0, lSection(10, 50)),
  two: circuit(10, 0, [...lSection(10, MID), ...lSection(MID, 50)]),
  stub: circuit(25, 25, [{ kind: P.STUB_OPEN, value: 0.125, zc: 50 }]),
  lineShort: circuit(25, 25, [{ kind: P.LINE, value: 0.32379, zc: 50 }, { kind: P.STUB_SHORT, value: 0.125, zc: 50 }]),
  half: circuit(25, 25, [{ kind: P.LINE, value: 0.5, zc: 50 }, { kind: P.STUB_OPEN, value: 0.125, zc: 50 }]),
  one: circuit(25, 25, [{ kind: P.LINE, value: 1, zc: 50 }, { kind: P.STUB_OPEN, value: 0.125, zc: 50 }]),
  shuntC: circuit(25, 25, [{ kind: P.SHUNT_C, value: 1 / (W0 * 50) }]),
  qw25: circuit(25, 0, [{ kind: P.QUARTER, value: Math.sqrt(50 * 25) }]),
  qw10: circuit(10, 0, [{ kind: P.QUARTER, value: Math.sqrt(50 * 10) }]),
};

/** Band figures of a circuit over a band at a limit in dB. */
export function figures(c, band, dB) {
  const sc = SW.sweepCircuit(c), tr = new SW.Trace(1024);
  SW.runSweep(tr, band, sc);
  return { sc, tr, fig: SW.bandFigures(tr, sc, at(dB)) };
}

/** Every data-ex text of the page by key. */
export function exampleTexts() {
  const out = new Map();
  const put = (k, t) => { if (out.has(k)) throw new Error(`duplicate example key ${k}`); out.set(k, t); };
  const E = EXAMPLES;
  // ⟨246⟩ series resonators on 10 MHz – 1 GHz (log), half power and 10 dB.
  for (const [name, x] of [['rlc2', 2], ['rlc5', 5]]) {
    const { fig } = figures(E[name], LOG, 10);
    put(`${name}-l`, val((x * Z0) / W0, 'H')); put(`${name}-c`, val(1 / (W0 * x * Z0), 'F'));
    put(`${name}-q`, num(fig.q.q)); put(`${name}-h-lo`, hz(fig.q.lo)); put(`${name}-h-hi`, hz(fig.q.hi));
    put(`${name}-lo`, hz(fig.atF0.lo)); put(`${name}-hi`, hz(fig.atF0.hi)); put(`${name}-fbw`, pct(fig.fractional));
  }
  // ⟨250⟩ L networks at 20 dB, with the estimate 2Γm√(1 + Q²)/Q².
  for (const [name, r] of [['l25', 25], ['l10', 10]]) {
    const { fig } = figures(E[name], DEF, 20), q = Math.sqrt(50 / r - 1), g = at(20);
    put(`${name}-cv`, val(E[name].parts[0].value, 'F')); put(`${name}-lv`, val(E[name].parts[1].value, 'H'));
    put(`${name}-lo`, hz(fig.atF0.lo)); put(`${name}-hi`, hz(fig.atF0.hi)); put(`${name}-fbw`, pct(fig.fractional));
    put(`${name}-est`, pct((2 * g * Math.sqrt(1 + q * q)) / (q * q)));
  }
  // ⟨252⟩ two sections through √500 Ω.
  {
    const { fig } = figures(E.two, DEF, 20), a = fig.intervals[fig.intervals.length - 1];
    put('two-q', num(Math.sqrt(MID / 10 - 1)));
    E.two.parts.forEach((p, i) => put(`two-p${i}`, val(p.value, p.kind === P.SERIES_C ? 'F' : 'H')));
    put('two-lo', hz(fig.atF0.lo)); put('two-hi', hz(fig.atF0.hi)); put('two-fbw', pct(fig.fractional));
    ok(a.lo === fig.atF0.lo);
  }
  // ⟨255⟩–⟨256⟩ lines before the start load, 10 dB.
  for (const name of ['stub', 'lineShort', 'half', 'one']) {
    const { fig } = figures(E[name], DEF, 10);
    // The stub alone is matched from before the band's start (an open end, said in words).
    if (name === 'stub') ok(fig.atF0.openLo); else put(`${name}-lo`, hz(fig.atF0.lo));
    put(`${name}-hi`, hz(fig.atF0.hi)); put(`${name}-fbw`, pct(fig.fractional));
  }
  put('shuntC-worst', db(figures(E.shuntC, DEF, 10).fig.worstRL));
  // ⟨258⟩–⟨259⟩ λ/4 transformers.
  for (const [name, r] of [['qw25', 25], ['qw10', 10]]) {
    const { fig } = figures(E[name], DEF, 20);
    put(`${name}-zt`, val(Math.sqrt(50 * r), 'Ω'));
    put(`${name}-lo`, hz(fig.atF0.lo)); put(`${name}-hi`, hz(fig.atF0.hi)); put(`${name}-fbw`, pct(fig.fractional));
  }
  {
    const { fig } = figures(E.qw25, LIN(1e6, 199e6), 10);
    put('qw25w-lo', hz(fig.atF0.lo)); put('qw25w-hi', hz(fig.atF0.hi));
  }
  // ⟨261⟩–⟨263⟩ the start circuit at 20 dB and over 10 MHz – 1 GHz.
  {
    const { fig } = figures(E.start, DEF, 20);
    put('start20-lo', hz(fig.atF0.lo)); put('start20-hi', hz(fig.atF0.hi)); put('start20-fbw', pct(fig.fractional));
    const w = figures(E.start, LOG, 10).fig;
    put('startlog-hi', hz(w.atF0.hi)); put('startlog-fbw', pct(w.fractional));
    put('start-inf', num(SW.markerAt(SW.sweepCircuit(E.start), 1e12).mag));
    const ten = figures(E.start, DEF, 10).fig, sc = SW.sweepCircuit(E.start);
    put('start10-lo', hz(ten.atF0.lo)); put('start10-w', hz(ten.atF0.hi - ten.atF0.lo)); put('start10-fbw', pct(ten.fractional));
    put('start-q', num(ten.q.q)); put('start-q-lo', hz(ten.q.lo));
    const lo = SW.markerAt(sc, 50e6), hi = SW.markerAt(sc, 150e6);
    put('start-150-mag', num(hi.mag)); put('start-150-rl', db(hi.rl));
    put('start-50-g', R.complexText(lo.gr, lo.gi, '', 4)); put('start-50-mag', num(lo.mag)); put('start-50-rl', db(lo.rl)); put('start-vswr', num(ten.maxVswr));
  }
  // ⟨269⟩–⟨270⟩ where the traces start and end.
  {
    const r2 = SW.sweepCircuit(E.rlc2), st = SW.sweepCircuit(E.start);
    const g = (sc, f) => { const m = SW.markerAt(sc, f); return R.complexText(m.gr, m.gi, '', 4); };
    put('rlc2-10m', g(r2, 10e6)); put('rlc2-1g', g(r2, 1e9)); put('start-10m', g(st, 10e6));
  }
  // ⟨272⟩ markers at 90 and 110 MHz.
  for (const name of ['start', 'rlc5']) {
    const sc = SW.sweepCircuit(E[name]);
    for (const f of [90e6, 110e6]) {
      const m = SW.markerAt(sc, f), k = `${name}-m${f / 1e6}`;
      put(`${k}-mag`, num(m.mag)); put(`${k}-rl`, db(m.rl));
    }
  }
  // ⟨274⟩ the two-section match: its second zero, the peak between, one band at 10 dB and two at 20 dB.
  {
    const sc = SW.sweepCircuit(E.two), tr = new SW.Trace(1024);
    SW.runSweep(tr, LIN(50e6, 80e6), sc);
    const lowF = SW.bandFigures(tr, sc, at(10));
    put('two-zero', hz(lowF.best.f));
    SW.runSweep(tr, LIN(lowF.best.f, 100e6), sc);
    const peak = SW.bandFigures(tr, sc, at(10)).worst;
    put('two-peak', num(peak.mag)); put('two-peak-rl', db(cv.returnLoss(peak.mag))); put('two-peak-f', hz(peak.f));
    const ten = figures(E.two, DEF, 10).fig;
    put('two10-n', String(ten.intervals.length)); put('two10-lo', hz(ten.atF0.lo)); put('two10-hi', hz(ten.atF0.hi)); put('two10-fbw', pct(ten.fractional));
    const tw = figures(E.two, DEF, 20).fig;
    put('two20-n', String(tw.intervals.length)); put('two20-a-lo', hz(tw.intervals[0].lo)); put('two20-a-hi', hz(tw.intervals[0].hi));
  }
  // ⟨276⟩ λ of line before the stub: at 50 MHz the stub's own |Γ|, and the second dip's end.
  {
    const one = figures(E.one, DEF, 10).fig;
    put('one-50m', num(SW.markerAt(SW.sweepCircuit(E.one), 50e6).mag)); put('stub-50m', num(SW.markerAt(SW.sweepCircuit(E.stub), 50e6).mag));
    put('one-n', String(one.intervals.length)); put('one-dip-hi', hz(one.intervals[0].hi));
  }
  return out;
}

function ok(c) { if (!c) throw new Error('sweep-examples: an example is not as the notes describe'); }
