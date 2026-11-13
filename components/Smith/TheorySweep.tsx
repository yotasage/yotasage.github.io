// The sweep's two topics of the Smith chart's Theory section (step M7.4b; docs/smith-chart/theory-sweep.md §12–13,
// page topics 11–12): Q and bandwidth, and reading a frequency trace. A memoised child of Theory, as TheorySolver.tsx,
// sharing its folding, anchors, citations (numbered in page order: this child renders after the solver's) and `Eq`.
//
// The boxes show the visitor's sweep when one is on: the band figures the trace layer already worked out in its worker
// (the listeners the plot and the report share; nothing is swept again here), the band, the markers and the input at
// the band's ends by sweep.markerAt on the committed circuit (a handful of point evaluations), node Q by network.ts.
// With the sweep off they show the start circuit over the Sweep panel's first band at 10 dB, swept here once (0.3 ms).
// The worked examples are fixed text in data-ex spans, which scripts/harness/smith/ui-theory.mjs sweeps again from the
// example circuits (sweep-examples.mjs); every data-live span it recomputes from the engine by name.

import React, { startTransition, useContext, useEffect, useState } from 'react';

import { formatAmount, formatResidual, formatReturnLoss } from '../../lib/quantity';
import { magFromReturnLoss, vswr } from '../../lib/smith/convert';
import { valueTex } from '../../lib/smith/equations';
import type { TexPiece } from '../../lib/smith/equations';
import { M_Q, METRIC_STRIDE, evaluateCircuit } from '../../lib/smith/network';
import type { Circuit } from '../../lib/smith/network';
import { Trace, bandFigures, defaultBand, markerAt, runSweep, sweepCircuit } from '../../lib/smith/sweep';
import type { Band, BandFigures } from '../../lib/smith/sweep';
import { SWEEP_LIMIT_DB, defaultCircuit } from '../../lib/smith/state';
import type { SweepSetting } from '../../lib/smith/state';
import css from '../../styles/SmithTheory.module.css';
import { figureTexts, hzText, spanText } from './bandText';
import { complexText } from './readout';
import type { TraceLayer } from './traceLayer';
import { QBandFigure, ReadTraceFigure } from './TheorySweepFigures';

type Values = Readonly<Record<string, TexPiece | undefined>>;
type EqProps = { id: string; values?: Values; note?: string };

/** The sweep's topics, in the order of the page (their entries are in Theory's TOPICS). */
export const SWEEP_IDS: readonly string[] = ['q-and-bandwidth', 'reading-a-trace'];

export interface SweepCtx {
  topic: (id: string, children: React.ReactNode) => React.ReactNode;
  cite: (...refs: [string, string][]) => React.ReactNode;
  L: (key: string, text: string) => React.ReactNode;
  jump: (id: string, text: string) => React.ReactNode;
  Eq: (props: EqProps) => React.ReactElement;
  /** The page's sweep (null when off, or hidden in a "read this point" challenge). */
  sweep: SweepSetting | null;
  layer: () => TraceLayer | null;
  /** What else they depend on, for the memo: the page's bibliography, the topics' folding and the way back. */
  bib: unknown;
  folded: string;
  back: string;
}

const WQ = 'WikiQ', S3 = 'SteerVol3';
const D = 4;
const num = (v: number): string => formatResidual(v, '', D);
const db = (v: number): string => formatReturnLoss(v, D);
const tv = (v: number, unit = ''): TexPiece | undefined => (Number.isFinite(v) ? valueTex(v, 0, unit) : undefined);
const bandText = (b: Band): string => `${hzText(b.start, D)} – ${hzText(b.stop, D)}, ${b.points} points, ${b.log ? 'logarithmic' : 'linear'}`;
const nodeName = (k: number, n: number): string => (k === 0 ? 'the load' : k === n ? 'the input' : `node ${k}`);
/** A fixed number of a worked example (checked against the engine by the harness). */
const X = (key: string, text: string) => <span className={css.n} data-ex={key}>{text}</span>;
const Z0 = <>Z<sub>0</sub></>;
const F0 = <>f<sub>0</sub></>;

const START = defaultCircuit();
const START_SWEEP: SweepSetting = { band: defaultBand(START.f0), markers: [9e7, 1.1e8], limit: SWEEP_LIMIT_DB };
let startFig: BandFigures | null = null;
/** The start circuit's figures over its first band at 10 dB, swept once (as the trace layer's worker does). */
function startFigures(): BandFigures {
  if (!startFig) {
    const sc = sweepCircuit(START), tr = new Trace(1024);
    runSweep(tr, START_SWEEP.band, sc);
    startFig = bandFigures(tr, sc, magFromReturnLoss(SWEEP_LIMIT_DB));
  }
  return startFig;
}

/** The figures the boxes show: the layer's when they are of the page's band and limit (a stale set waits), else the start's. */
function figuresFor(mine: boolean, s: SweepSetting, layerFig: BandFigures | null): BandFigures | null {
  if (!mine) return startFigures();
  const th = magFromReturnLoss(s.limit ?? SWEEP_LIMIT_DB);
  return layerFig && layerFig.start === s.band.start && layerFig.stop === s.band.stop && layerFig.threshold === th ? layerFig : null;
}

/**
 * The committed circuit, for the boxes alone: Theory provides it, so a new circuit (every drag's commit) renders the
 * two boxes and not the topics' text and equations around them.
 */
export const SweepCircuitContext = React.createContext<Circuit>(START);

interface BoxProps { L: SweepCtx['L']; mine: boolean; s: SweepSetting; fig: BandFigures | null }
const WAIT = 'working…';
const boxHead = (mine: boolean, what: string) => <div className={css.liveHead}>{mine ? 'Your circuit' : 'Start circuit'}<span>{what}</span></div>;

function QBox({ L, mine, s, fig }: BoxProps) {
  const own = useContext(SweepCircuitContext);
  const c = mine ? own : START;
  const band = s.band, limit = s.limit ?? SWEEP_LIMIT_DB, th = magFromReturnLoss(limit);
  const t = fig && figureTexts(fig, c.f0, limit, D), q = fig?.q;
  const { metrics } = evaluateCircuit(c);
  const n = c.parts.length;
  let kMax = 0;
  for (let k = 1; k <= n; k++) if (metrics[k * METRIC_STRIDE + M_Q] > metrics[kMax * METRIC_STRIDE + M_Q]) kMax = k;
  const wait = WAIT, head = (what: string) => boxHead(mine, what);
  return (
    <div className={css.live} data-sweep-box="q">
            {head(mine ? 'your band at your limit' : 'the Sweep panel’s first band at 10 dB')}
            <p>Band: {L('qb-band', bandText(band))}; limit {L('qb-limit', formatAmount(limit, 'dB', D, true))} (|Γ| = {L('qb-limit-mag', num(th))}).</p>
            <p>Around {F0}: {L('qb-f0', t ? `${t.f0[0]} ${t.f0[1]}` : wait)}</p>
            <p>Loaded Q: {L('qb-q', t ? (t.q[1] ? `${t.q[0]}, ${t.q[1]}` : t.q[0]) : wait)}</p>
            {q && <p>Half power: {L('qb-q-span', spanText(q, D))}</p>}
            <p>
              Node Q at {F0}:{' '}
              {Array.from({ length: n + 1 }, (_, k) => <React.Fragment key={k}>{k ? ', ' : ''}{nodeName(k, n)} {L(`qb-node-${k}`, num(metrics[k * METRIC_STRIDE + M_Q]))}</React.Fragment>)};
              the largest at {L('qb-qmax', nodeName(kMax, n))}.
            </p>
          </div>
  );
}

function TraceBox({ L, mine, s, fig }: BoxProps) {
  const own = useContext(SweepCircuitContext);
  const c = mine ? own : START;
  const band = s.band, limit = s.limit ?? SWEEP_LIMIT_DB, th = magFromReturnLoss(limit);
  const t = fig && figureTexts(fig, c.f0, limit, D);
  // The input at the band's ends and at the markers (a handful of point evaluations).
  const sc = sweepCircuit(c);
  const ends = [markerAt(sc, band.start), markerAt(sc, band.stop)];
  const marks = s.markers.map((f) => markerAt(sc, f));
  const wait = WAIT, head = (what: string) => boxHead(mine, what);
  return (
    <div className={css.live} data-sweep-box="trace">
            {head(mine ? 'your band, its ends and your markers' : 'the Sweep panel’s first band, markers at 90 and 110 MHz')}
            <p>Band: {L('rt-band', bandText(band))}.</p>
            {ends.map((m, i) => (
              <p key={i}>
                At {L(`rt-end${i}-f`, hzText(m.f, D))}: Γ = {L(`rt-end${i}-gamma`, complexText(m.gr, m.gi, '', D))}, |Γ| ={' '}
                {L(`rt-end${i}-mag`, num(m.mag))}, return loss {L(`rt-end${i}-rl`, db(m.rl))}.
              </p>
            ))}
            <p>
              Limit {formatAmount(limit, 'dB', D, true)}: a circle of |Γ| = {L('rt-limit-mag', num(th))} (VSWR{' '}
              {L('rt-limit-vswr', num(vswr(th)))}); inside it: {L('rt-intervals', t ? t.intervals.join('; ') : wait)}.
            </p>
            <p>
              Worst {L('rt-worst', t ? `${t.worst[0]} ${t.worst[1]}` : wait)} (VSWR {L('rt-vswr', t ? t.vswr[0] : wait)}); best{' '}
              {L('rt-best', t ? `${t.best[0]} ${t.best[1]}` : wait)}.
            </p>
            {marks.map((m, i) => (
              <p key={i}>
                Marker {i + 1}: {L(`rt-m${i}`, `${hzText(m.f, D)}: Γ = ${complexText(m.gr, m.gi, '', D)}, |Γ| = ${num(m.mag)}, ${db(m.rl)}`)}
              </p>
            ))}
          </div>
  );
}

function sweepTopics({ topic, cite, L, jump, Eq, sweep }: SweepCtx, layerFig: BandFigures | null): React.ReactNode {
  const mine = !!sweep;
  const s = sweep ?? START_SWEEP;
  const fig = figuresFor(mine, s, layerFig);
  const a = fig?.atF0, q = fig?.q;
  // f0 as the figures have it: (hi − lo)/fractional is the figure's own f0 (the circuit is read by the boxes alone).
  const fbwValues: Values | undefined = a && !a.openLo && !a.openHi
    ? { FBW: tv(fig.fractional), f_hi: tv(a.hi, 'Hz'), f_lo: tv(a.lo, 'Hz'), f_0: tv((a.hi - a.lo) / fig.fractional, 'Hz') } : undefined;
  const qValues: Values | undefined = q && !q.openLo && !q.openHi ? { Q_L: tv(q.q), f_m: tv(q.f, 'Hz'), f_2: tv(q.hi, 'Hz'), f_1: tv(q.lo, 'Hz') } : undefined;
  const note = mine ? 'below: your band' : undefined;

  return (
    <>
      {topic('q-and-bandwidth', (
        <>
          <p>
            <b>Why a match has a band.</b> Every inductor and capacitor enters the circuit only as ωL or ωC, and a line’s
            electrical length grows in proportion to f, so raising f by a factor k does what multiplying every L and C by
            k, and making every line and stub k times longer, would do at {F0}. Each part’s arc then ends a little past or
            short of where it ended at {F0}, and the end of the path leaves the centre, the further the further f is
            from {F0}.
          </p>
          <p>
            <b>Two measures.</b> The band of a match is the stretch of frequencies where |Γ| stays below a limit you
            choose; the tool takes the limit as a return loss. Its width over {F0} is the fractional bandwidth,
            (f<sub>hi</sub> − f<sub>lo</sub>)/{F0}; the tool divides by {F0}, not by the band’s middle, so the figure says
            how much of {F0}’s neighbourhood is matched. For a resonator, Q is the resonant frequency over the width where
            the power stays above half its peak, the reciprocal of the fractional bandwidth{cite([WQ, '“Bandwidth definition”'])}.
            The tool’s loaded Q applies this to the power delivered, 1 − |Γ|², around the best point near {F0}; for a
            perfect match, half power is |Γ| = 1/√2: VSWR 5.83, return loss 3.01 dB.
          </p>
          <Eq id="fractional-bandwidth" values={fbwValues} note={fbwValues ? note : undefined} />
          <Eq id="q-loaded" values={qValues} note={qValues ? note : undefined} />
          <QBox L={L} mine={mine} s={s} fig={fig} />
          <p>
            <b>The simplest case.</b> A 50 Ω load with a series L and a series C that cancel at {F0} is matched there,
            and as only x changes, its trace runs along the r = 1 circle. The Q of a series RLC circuit is
            ω<sub>0</sub>L/R{cite([WQ, '“RLC circuits”'])}; here the resistance in the loop is the load’s and the source’s{' '}
            {Z0}, so Q<sub>L</sub> = ω<sub>0</sub>L/(R + {Z0}), and the half-power width is exactly {F0}/Q<sub>L</sub>.
            Below a limit Γ<sub>m</sub> the band is X<sub>m</sub>/(ω<sub>0</sub>L) of {F0}, where X<sub>m</sub> is the
            reactance that reaches the limit: for the same R, the higher Q<sub>L</sub>, the narrower in proportion. With
            x = ±2 ({X('rlc2-l', '159.2 nH')} and {X('rlc2-c', '15.92 pF')}): Q<sub>L</sub> = {X('rlc2-q', '1.000')}, half
            power from {X('rlc2-h-lo', '61.80 MHz')} to {X('rlc2-h-hi', '161.8 MHz')}, and at 10 dB {X('rlc2-lo', '84.71 MHz')} to{' '}
            {X('rlc2-hi', '118.0 MHz')}, {X('rlc2-fbw', '33.33 %')} of {F0}; with x = ±5 ({X('rlc5-l', '397.9 nH')},{' '}
            {X('rlc5-c', '6.366 pF')}): Q<sub>L</sub> = {X('rlc5-q', '2.500')}, half power {X('rlc5-h-lo', '81.98 MHz')} to{' '}
            {X('rlc5-h-hi', '122.0 MHz')}, 10 dB {X('rlc5-lo', '93.56 MHz')} to {X('rlc5-hi', '106.9 MHz')},{' '}
            {X('rlc5-fbw', '13.33 %')}. (Band for these two: 10 MHz to 1 GHz, logarithmic.)
          </p>
          <Eq id="q-series-rlc" />
          <Eq id="fbw-series-rlc" />
          <p>
            <b>A higher-Q path.</b> An L network matching R<sub>low</sub> to R<sub>high</sub> has
            Q = √(R<sub>high</sub>/R<sub>low</sub> − 1) in both legs{cite([S3, '§6.4'])}. Near {F0} its input leaves the
            centre at |dΓ/dδ| = Q²/√(1 + Q²), with δ = (f − {F0})/{F0} the detuning, whichever of the two L networks it
            is. So for a small limit Γ<sub>m</sub> the band is about 2Γ<sub>m</sub>·√(1 + Q²)/Q² of {F0}, close to
            2Γ<sub>m</sub>/Q when Q is large. At 20 dB: 25 Ω on 50 Ω (Q 1; series C {X('l25-cv', '63.66 pF')}, shunt
            L {X('l25-lv', '79.58 nH')}) is matched from {X('l25-lo', '88.24 MHz')} to {X('l25-hi', '118.2 MHz')},{' '}
            {X('l25-fbw', '29.96 %')} (estimate {X('l25-est', '28.28 %')}); 10 Ω (Q 2; {X('l10-cv', '79.58 pF')},{' '}
            {X('l10-lv', '39.79 nH')}) from {X('l10-lo', '94.81 MHz')} to {X('l10-hi', '106.1 MHz')}, {X('l10-fbw', '11.33 %')}{' '}
            (estimate {X('l10-est', '11.18 %')}). A point’s Q is |x|/r ({jump('matching-with-two-parts', 'Matching with two parts')}):
            the larger ratio needs larger reactances against its resistance, so its path climbs to a node of Q 2 where the
            25 Ω match’s stays at Q 1. Two L sections through √(10·50) = 22.36 Ω need only Q {X('two-q', '1.112')} at
            each step ({X('two-p0', '143.2 pF')}, {X('two-p1', '32.01 nH')}, {X('two-p2', '64.02 pF')},{' '}
            {X('two-p3', '71.58 nH')}), and match 10 Ω from {X('two-lo', '90.96 MHz')} to {X('two-hi', '109.4 MHz')},{' '}
            {X('two-fbw', '18.48 %')}: more parts, a wider band. In every example here, the path that keeps to lower node
            Q has the wider band around {F0}.
          </p>
          <Eq id="q-l-network" />
          <Eq id="l-network-slope" />
          <Eq id="q-node" />
          <p>
            <b>A longer line.</b> A line’s θ grows in proportion to f, so a line ℓ long (ℓ/λ at {F0}) turns its point a
            further 720°·(ℓ/λ)·δ: each extra λ/2 adds 360°·δ. The start load sits on g = 1, so a shunt part alone
            matches it, and lines can be put in front of it. At 10 dB: an open stub of λ/8 alone is matched from before
            the band’s start to {X('stub-hi', '131.2 MHz')} (at least {X('stub-fbw', '81.19 %')}); 0.3238 λ of line and a
            shorted stub of λ/8 from {X('lineShort-lo', '88.92 MHz')} to {X('lineShort-hi', '114.3 MHz')},{' '}
            {X('lineShort-fbw', '25.37 %')}; λ/2 of line and the open stub from {X('half-lo', '90.55 MHz')} to{' '}
            {X('half-hi', '107.9 MHz')}, {X('half-fbw', '17.39 %')}; λ of line and the stub from {X('one-lo', '95.21 MHz')}{' '}
            to {X('one-hi', '104.4 MHz')}, {X('one-fbw', '9.158 %')}. Even the stub is narrower than the part it stands
            for: its b = tan θ rises by π/2 per unit of δ at λ/8, a capacitor’s b = ωC{Z0} by 1, and the shunt C of
            31.83 pF keeps the whole 50–150 MHz band above {X('shuntC-worst', '12.30 dB')}.
          </p>
          <Eq id="line-theta" />
          <Eq id="line-rotation" />
          <QBandFigure />
          <div className={`${css.tableWrap} ${css.exTable}`}>
            <table className={css.table} data-sweep-examples="">
              <thead><tr><th scope="col">Example (50 Ω, 100 MHz)</th><th scope="col">Limit</th><th scope="col">Fractional bandwidth</th></tr></thead>
              <tbody>
                <tr><th scope="row">25 Ω, L network (Q 1)</th><td>20 dB</td><td>{X('l25-fbw', '29.96 %')}</td></tr>
                <tr><th scope="row">10 Ω, L network (Q 2)</th><td>20 dB</td><td>{X('l10-fbw', '11.33 %')}</td></tr>
                <tr><th scope="row">10 Ω, two L sections</th><td>20 dB</td><td>{X('two-fbw', '18.48 %')}</td></tr>
                <tr><th scope="row">Start load, λ/8 open stub</th><td>10 dB</td><td>at least {X('stub-fbw', '81.19 %')}</td></tr>
                <tr><th scope="row">0.3238 λ line, λ/8 short stub</th><td>10 dB</td><td>{X('lineShort-fbw', '25.37 %')}</td></tr>
                <tr><th scope="row">λ/2 line, λ/8 open stub</th><td>10 dB</td><td>{X('half-fbw', '17.39 %')}</td></tr>
                <tr><th scope="row">λ line, λ/8 open stub</th><td>10 dB</td><td>{X('one-fbw', '9.158 %')}</td></tr>
                <tr><th scope="row">25 Ω, λ/4 transformer</th><td>20 dB</td><td>{X('qw25-fbw', '36.70 %')}</td></tr>
                <tr><th scope="row">10 Ω, λ/4 transformer</th><td>20 dB</td><td>{X('qw10-fbw', '14.34 %')}</td></tr>
              </tbody>
            </table>
          </div>
          <p>
            <b>The λ/4 transformer.</b> Its band below Γ<sub>m</sub> has a closed form, derived step by step below. At
            20 dB it matches 25 Ω (Z<sub>t</sub> {X('qw25-zt', '35.36 Ω')}) from {X('qw25-lo', '81.65 MHz')} to{' '}
            {X('qw25-hi', '118.4 MHz')}, {X('qw25-fbw', '36.70 %')}, and 10 Ω (Z<sub>t</sub> {X('qw10-zt', '22.36 Ω')}) from{' '}
            {X('qw10-lo', '92.83 MHz')} to {X('qw10-hi', '107.2 MHz')}, {X('qw10-fbw', '14.34 %')}: the larger the step, the
            narrower. At 10 dB the 25 Ω transformer holds from {X('qw25w-lo', '21.63 MHz')} to {X('qw25w-hi', '178.4 MHz')}{' '}
            (band: 1 to 199 MHz, linear).
          </p>
          <Eq id="quarter-wave-match" />
          <Eq id="quarter-wave-bandwidth" />
          <p>
            <b>The start circuit.</b> Its load and node 1 both have Q 1; the input, at the centre, 0. At 10 dB it is
            matched from {X('start10-lo', '79.50 MHz')} to past the band’s end (at least {X('start10-w', '70.50 MHz')} wide,{' '}
            {X('start10-fbw', '70.50 %')} of {F0}); at 20 dB from{' '}
            {X('start20-lo', '92.12 MHz')} to {X('start20-hi', '110.5 MHz')}, {X('start20-fbw', '18.41 %')}. Its loaded Q is
            at most {X('start-q', '1.122')}: the power falls to half at {X('start-q-lo', '60.87 MHz')} below {F0} but never above it, since at high f the series
            C is a short and the shunt L an open, leaving the bare load with |Γ| = {X('start-inf', '0.4472')} and 80 % of the
            power delivered. Over 10 MHz to 1 GHz (logarithmic) the 10 dB band closes at {X('startlog-hi', '162.9 MHz')}{' '}
            ({X('startlog-fbw', '83.39 %')}), and the loaded Q still has no upper edge.
          </p>
          <p>
            <b>What this leaves out.</b> Everything here is for ideal parts, lossless lines and a load whose Z is the
            same at every frequency; a real load changes with f, and real parts have their own Q, losses and
            self-resonance, which the tool does not model, so a measured trace can differ.
          </p>
        </>
      ))}

      {topic('reading-a-trace', (
        <>
          <p>
            <b>What it is.</b> The trace is the input’s point at every frequency of the band, joined in order of f: the
            point the chart shows at {F0}, swept. Its distance from the centre is |Γ| at that frequency, so the circles
            about the centre are circles of constant VSWR and return loss ({jump('how-good-is-a-match', 'How good is a match')}).
          </p>
          <p>
            <b>Which way it runs.</b> Raising f makes every part’s x or b larger (a series C’s x and a shunt L’s b rise
            towards 0) and every line longer ({jump('q-and-bandwidth', 'Q and bandwidth')}), and each of those on its own
            turns its point clockwise ({jump('moving-on-the-chart', 'Moving on the chart')}). All the traces in these two
            topics turn clockwise as f rises. The series resonator’s runs round the r = 1 circle, from near the open below
            the axis (at 10 MHz Γ = {X('rlc2-10m', '0.9899 − j0.09999')} for x = ±2) through the centre at {F0} to near
            the open above it ({X('rlc2-1g', '0.9899 + j0.09999')} at 1 GHz). The start circuit’s heads for the short at
            low f, where the series C opens and the shunt L shorts (at 10 MHz Γ = {X('start-10m', '−0.9797 + j0.2001')}),
            and for the bare load at high f.
          </p>
          <Eq id="x-series-l" />
          <Eq id="x-series-c" />
          <Eq id="b-shunt-c" />
          <Eq id="b-shunt-l" />
          <Eq id="line-theta" />
          <p>
            <b>How fast it runs.</b> Equal steps in f are not equal steps on the chart: where the trace runs fast, the
            match changes fast with f, which is what a high Q means. Markers show it: at 90 and 110 MHz the start
            circuit’s input has |Γ| = {X('start-m90-mag', '0.1314')} and {X('start-m110-mag', '0.09567')}{' '}
            ({X('start-m90-rl', '17.63 dB')} and {X('start-m110-rl', '20.38 dB')}), the x = ±5 resonator’s{' '}
            {X('rlc5-m90-mag', '0.4668')} and {X('rlc5-m110-mag', '0.4307')} ({X('rlc5-m90-rl', '6.618 dB')} and{' '}
            {X('rlc5-m110-rl', '7.316 dB')}).
          </p>
          <TraceBox L={L} mine={mine} s={s} fig={fig} />
          <p>
            <b>Through the centre, loops and crossings.</b> Where the trace passes through the centre the match is
            perfect, and the plot dips there. The two-section match of 10 Ω passes through the centre at 100 MHz and again
            at {X('two-zero', '61.80 MHz')}, looping between; its |Γ| rises only to {X('two-peak', '0.2182')}{' '}
            ({X('two-peak-rl', '13.22 dB')}) at {X('two-peak-f', '74.35 MHz')}, so at 10 dB it is {X('two10-n', '1')} band,{' '}
            {X('two10-lo', '56.93 MHz')} to {X('two10-hi', '137.1 MHz')} ({X('two10-fbw', '80.15 %')}), and at 20 dB{' '}
            {X('two20-n', '2')}, {X('two20-a-lo', '59.94 MHz')} to {X('two20-a-hi', '64.43 MHz')} and{' '}
            {X('two-lo', '90.96 MHz')} to {X('two-hi', '109.4 MHz')}. Where a trace crosses itself, two frequencies give
            the same input. A line makes the trace wind: with λ of line before the λ/8 stub, at 50 MHz the line is λ/2 and
            gives the load back unturned, so the input is the stub’s alone (|Γ| {X('one-50m', '0.2811')} and{' '}
            {X('stub-50m', '0.2811')}), and in 50–150 MHz the trace crosses itself twice and dips below 10 dB a second
            time ({X('one-n', '2')} bands), up to {X('one-dip-hi', '56.71 MHz')}.
          </p>
          <p>
            <b>The plot.</b> The plot under the chart is the same |Γ| against f, as return loss (a match is a dip) or
            VSWR. The limit is a circle about the centre (10 dB: |Γ| = 0.3162, VSWR 1.925); the shaded stretches of the
            plot are where the trace is inside it, and their edges where it crosses it. The start circuit’s trace enters
            the 10 dB circle at {X('start10-lo', '79.50 MHz')} and is still inside at 150 MHz (|Γ| {X('start-150-mag', '0.2866')},{' '}
            {X('start-150-rl', '10.85 dB')}); at 50 MHz it is at {X('start-50-g', '−0.2941 + j0.8235')}, |Γ| {X('start-50-mag', '0.8745')},
            return loss {X('start-50-rl', '1.165 dB')}, the band’s worst (VSWR {X('start-vswr', '14.93')}). The band figures read the
            same trace: the worst and best return loss are its points furthest from and nearest to the centre, the band
            around {F0} is the stretch inside the limit’s circle that holds {F0}, and the loaded Q the stretch inside the
            half-power circle around the best point near {F0}.
          </p>
          <Eq id="return-loss" />
          <Eq id="vswr" />
          <Eq id="gamma-vswr" />
          <Eq id="power-delivered" />
          <ReadTraceFigure />
          <p>
            <b>How it is drawn.</b> The sweep takes evenly spaced frequencies (or evenly spaced in log f, for wide bands)
            and adds points where the trace turns by more than 5° or steps more than 0.02 of the chart’s radius, so a
            sharp bend is drawn as it is; markers and the figures are worked out at their own frequencies, not read off
            the drawn line.
          </p>
        </>
      ))}
    </>
  );
}

/** Renders on a sweep setting, the band figures of a refined trace, folding or the way back (the boxes also on a circuit). */
export const SweepTopics = React.memo(function SweepTopics(props: SweepCtx) {
  const [fig, setFig] = useState<BandFigures | null>(null);
  const on = !!props.sweep, layer = props.layer;
  // The band figures from the trace layer's listeners (the plot's and the report's), outside the urgent updates.
  useEffect(() => {
    if (!on) { setFig(null); return undefined; }
    let raf = 0, l: TraceLayer | null = null;
    const take = (f: BandFigures | null) => startTransition(() => setFig(f));
    const join = () => {
      l = layer();
      if (!l) { raf = requestAnimationFrame(join); return; }
      l.figureListeners.add(take);
      take(l.figures);
    };
    join();
    return () => { cancelAnimationFrame(raf); l?.figureListeners.delete(take); };
  }, [on, layer]);
  return <>{sweepTopics(props, fig)}</>;
  // The circuit reaches the boxes by SweepCircuitContext: a new circuit renders them alone.
}, (a, b) => a.sweep === b.sweep && a.layer === b.layer && a.bib === b.bib && a.folded === b.folded && a.back === b.back);
