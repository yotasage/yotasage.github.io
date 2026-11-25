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
import { translate } from '../../lib/ui/i18n';
import type { Locale, TranslationKey } from '../../lib/ui/translations';
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
  /** What else they depend on, for the memo: the page's bibliography, the topics' folding, the way back and locale. */
  bib: unknown;
  folded: string;
  back: string;
  locale: Locale;
}

const WQ = 'WikiQ', S3 = 'SteerVol3';
const D = 4;
const num = (v: number): string => formatResidual(v, '', D);
const db = (v: number): string => formatReturnLoss(v, D);
const tv = (v: number, unit = ''): TexPiece | undefined => (Number.isFinite(v) ? valueTex(v, 0, unit) : undefined);
const bandText = (b: Band, locale: Locale): string =>
  translate(locale, 'sm.th.sw.band', {
    start: hzText(b.start, D),
    stop: hzText(b.stop, D),
    n: b.points,
    scale: translate(locale, b.log ? 'sm.th.sw.log' : 'sm.th.sw.lin'),
  });
const nodeName = (k: number, n: number, locale: Locale): string =>
  k === 0 ? translate(locale, 'sm.ts.nodeLoad')
    : k === n ? translate(locale, 'sm.ts.nodeInput')
      : translate(locale, 'sm.ts.nodeN', { k });
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

interface BoxProps { L: SweepCtx['L']; mine: boolean; s: SweepSetting; fig: BandFigures | null; locale: Locale }
const boxHead = (mine: boolean, what: string, locale: Locale) => (
  <div className={css.liveHead}>{translate(locale, mine ? 'sm.th.yourCircuit' : 'sm.th.startCircuit')}<span>{what}</span></div>
);

function QBox({ L, mine, s, fig, locale }: BoxProps) {
  const t = (key: TranslationKey, vars?: Record<string, string | number>) => translate(locale, key, vars);
  const own = useContext(SweepCircuitContext);
  const c = mine ? own : START;
  const band = s.band, limit = s.limit ?? SWEEP_LIMIT_DB, th = magFromReturnLoss(limit);
  const ft = fig && figureTexts(fig, c.f0, limit, D, locale), q = fig?.q;
  const { metrics } = evaluateCircuit(c);
  const n = c.parts.length;
  let kMax = 0;
  for (let k = 1; k <= n; k++) if (metrics[k * METRIC_STRIDE + M_Q] > metrics[kMax * METRIC_STRIDE + M_Q]) kMax = k;
  const wait = t('sm.th.sw.wait'), head = (what: string) => boxHead(mine, what, locale);
  return (
    <div className={css.live} data-sweep-box="q">
      {head(mine ? t('sm.th.sw.qHeadMine') : t('sm.th.sw.qHeadStart'))}
      <p>{t('sm.th.sw.bandLbl')}{L('qb-band', bandText(band, locale))}{t('sm.th.sw.limitLbl')}{L('qb-limit', formatAmount(limit, 'dB', D, true))} (|Γ| = {L('qb-limit-mag', num(th))}).</p>
      <p>{t('sm.th.sw.around')}{F0}: {L('qb-f0', ft ? `${ft.f0[0]} ${ft.f0[1]}` : wait)}</p>
      <p>{t('sm.th.sw.loadedQ')}{L('qb-q', ft ? (ft.q[1] ? `${ft.q[0]}, ${ft.q[1]}` : ft.q[0]) : wait)}</p>
      {q && <p>{t('sm.th.sw.halfPower')}{L('qb-q-span', spanText(q, D, locale))}</p>}
      <p>
        {t('sm.th.sw.nodeQAt')}{F0}:{' '}
        {Array.from({ length: n + 1 }, (_, k) => <React.Fragment key={k}>{k ? ', ' : ''}{nodeName(k, n, locale)} {L(`qb-node-${k}`, num(metrics[k * METRIC_STRIDE + M_Q]))}</React.Fragment>)}
        {t('sm.th.sw.largestAt')}{L('qb-qmax', nodeName(kMax, n, locale))}.
      </p>
    </div>
  );
}

function TraceBox({ L, mine, s, fig, locale }: BoxProps) {
  const t = (key: TranslationKey, vars?: Record<string, string | number>) => translate(locale, key, vars);
  const own = useContext(SweepCircuitContext);
  const c = mine ? own : START;
  const band = s.band, limit = s.limit ?? SWEEP_LIMIT_DB, th = magFromReturnLoss(limit);
  const ft = fig && figureTexts(fig, c.f0, limit, D, locale);
  // The input at the band's ends and at the markers (a handful of point evaluations).
  const sc = sweepCircuit(c);
  const ends = [markerAt(sc, band.start), markerAt(sc, band.stop)];
  const marks = s.markers.map((f) => markerAt(sc, f));
  const wait = t('sm.th.sw.wait'), head = (what: string) => boxHead(mine, what, locale);
  return (
    <div className={css.live} data-sweep-box="trace">
      {head(mine ? t('sm.th.sw.trHeadMine') : t('sm.th.sw.trHeadStart'))}
      <p>{t('sm.th.sw.bandLbl')}{L('rt-band', bandText(band, locale))}.</p>
      {ends.map((m, i) => (
        <p key={i}>
          {t('sm.th.sw.at')}{L(`rt-end${i}-f`, hzText(m.f, D))}: Γ = {L(`rt-end${i}-gamma`, complexText(m.gr, m.gi, '', D))}, |Γ| ={' '}
          {L(`rt-end${i}-mag`, num(m.mag))}{t('sm.th.sw.returnLoss')}{L(`rt-end${i}-rl`, db(m.rl))}.
        </p>
      ))}
      <p>
        {t('sm.th.sw.limitCircle', { limit: formatAmount(limit, 'dB', D, true) })}{L('rt-limit-mag', num(th))} (VSWR{' '}
        {L('rt-limit-vswr', num(vswr(th)))}{t('sm.th.sw.insideIt')}{L('rt-intervals', ft ? ft.intervals.join('; ') : wait)}.
      </p>
      <p>
        {t('sm.th.sw.worst')}{L('rt-worst', ft ? `${ft.worst[0]} ${ft.worst[1]}` : wait)} (VSWR {L('rt-vswr', ft ? ft.vswr[0] : wait)}){t('sm.th.sw.best')}
        {L('rt-best', ft ? `${ft.best[0]} ${ft.best[1]}` : wait)}.
      </p>
      {marks.map((m, i) => (
        <p key={i}>
          {t('sm.th.sw.marker', { n: i + 1 })}{L(`rt-m${i}`, `${hzText(m.f, D)}: Γ = ${complexText(m.gr, m.gi, '', D)}, |Γ| = ${num(m.mag)}, ${db(m.rl)}`)}
        </p>
      ))}
    </div>
  );
}

function sweepTopics({ topic, cite, L, jump, Eq, sweep, locale }: SweepCtx, layerFig: BandFigures | null): React.ReactNode {
  const t = (key: TranslationKey, vars?: Record<string, string | number>) => translate(locale, key, vars);
  const mine = !!sweep;
  const s = sweep ?? START_SWEEP;
  const fig = figuresFor(mine, s, layerFig);
  const a = fig?.atF0, q = fig?.q;
  // f0 as the figures have it: (hi − lo)/fractional is the figure's own f0 (the circuit is read by the boxes alone).
  const fbwValues: Values | undefined = a && !a.openLo && !a.openHi
    ? { FBW: tv(fig.fractional), f_hi: tv(a.hi, 'Hz'), f_lo: tv(a.lo, 'Hz'), f_0: tv((a.hi - a.lo) / fig.fractional, 'Hz') } : undefined;
  const qValues: Values | undefined = q && !q.openLo && !q.openHi ? { Q_L: tv(q.q), f_m: tv(q.f, 'Hz'), f_2: tv(q.hi, 'Hz'), f_1: tv(q.lo, 'Hz') } : undefined;
  const note = mine ? t('sm.th.sw.noteBand') : undefined;

  return (
    <>
      {topic('q-and-bandwidth', (
        <>
          <p>
            <b>{t('sm.th.t11.why.b')}</b>{t('sm.th.t11.why.a')}{F0}{t('sm.th.t11.why.c')}{F0}{t('sm.th.t11.why.d')}{F0}.
          </p>
          <p>
            <b>{t('sm.th.t11.two.b')}</b>{t('sm.th.t11.two.a')}{F0}{t('sm.th.t11.two.c')}(f<sub>hi</sub> − f<sub>lo</sub>)/{F0}
            {t('sm.th.t11.two.d')}{F0}{t('sm.th.t11.two.e')}{F0}{t('sm.th.t11.two.f')}{cite([WQ, '“Bandwidth definition”'])}
            {t('sm.th.t11.two.g')}{F0}{t('sm.th.t11.two.h')}
          </p>
          <Eq id="fractional-bandwidth" values={fbwValues} note={fbwValues ? note : undefined} />
          <Eq id="q-loaded" values={qValues} note={qValues ? note : undefined} />
          <QBox L={L} mine={mine} s={s} fig={fig} locale={locale} />
          <p>
            <b>{t('sm.th.t11.rlc.b')}</b>{t('sm.th.t11.rlc.a')}{F0}{t('sm.th.t11.rlc.c')}ω<sub>0</sub>L/R{cite([WQ, '“RLC circuits”'])}
            {t('sm.th.t11.rlc.d')}{Z0}{t('sm.th.t11.rlc.e')}Q<sub>L</sub> = ω<sub>0</sub>L/(R + {Z0}){t('sm.th.t11.rlc.f')}{F0}/Q<sub>L</sub>
            {t('sm.th.t11.rlc.g')}Γ<sub>m</sub>{t('sm.th.t11.rlc.h')}X<sub>m</sub>/(ω<sub>0</sub>L){t('sm.th.t11.rlc.of')}{F0}
            {t('sm.th.t11.rlc.i')}X<sub>m</sub>{t('sm.th.t11.rlc.j')}Q<sub>L</sub>{t('sm.th.t11.rlc.k')}
            {X('rlc2-l', '159.2 nH')}{t('sm.th.t11.rlc.and')}{X('rlc2-c', '15.92 pF')}): Q<sub>L</sub> = {X('rlc2-q', '1.000')}
            {t('sm.th.t11.rlc.hpFrom')}{X('rlc2-h-lo', '61.80 MHz')}{t('sm.th.t11.rlc.to')}{X('rlc2-h-hi', '161.8 MHz')}
            {t('sm.th.t11.rlc.at10')}{X('rlc2-lo', '84.71 MHz')}{t('sm.th.t11.rlc.to')}{X('rlc2-hi', '118.0 MHz')},{' '}
            {X('rlc2-fbw', '33.33 %')}{t('sm.th.t11.rlc.of')}{F0}{t('sm.th.t11.rlc.with5')}{X('rlc5-l', '397.9 nH')},{' '}
            {X('rlc5-c', '6.366 pF')}): Q<sub>L</sub> = {X('rlc5-q', '2.500')}{t('sm.th.t11.rlc.hp')}{X('rlc5-h-lo', '81.98 MHz')}
            {t('sm.th.t11.rlc.to')}{X('rlc5-h-hi', '122.0 MHz')}, 10 dB {X('rlc5-lo', '93.56 MHz')}{t('sm.th.t11.rlc.to')}
            {X('rlc5-hi', '106.9 MHz')}, {X('rlc5-fbw', '13.33 %')}{t('sm.th.t11.rlc.end')}
          </p>
          <Eq id="q-series-rlc" />
          <Eq id="fbw-series-rlc" />
          <p>
            <b>{t('sm.th.t11.hiq.b')}</b>{t('sm.th.t11.hiq.a')}R<sub>low</sub>{t('sm.th.t11.hiq.to')}R<sub>high</sub>{t('sm.th.t11.hiq.has')}
            Q = √(R<sub>high</sub>/R<sub>low</sub> − 1){t('sm.th.t11.hiq.legs')}{cite([S3, '§6.4'])}{t('sm.th.t11.hiq.near')}{F0}
            {t('sm.th.t11.hiq.leaves')}{F0})/{F0}{t('sm.th.t11.hiq.detune')}Γ<sub>m</sub>{t('sm.th.t11.hiq.about')}Γ<sub>m</sub>·√(1 + Q²)/Q²
            {t('sm.th.t11.rlc.of')}{F0}{t('sm.th.t11.hiq.close')}Γ<sub>m</sub>{t('sm.th.t11.hiq.large')}{X('l25-cv', '63.66 pF')}
            {t('sm.th.t11.hiq.shuntL')}{X('l25-lv', '79.58 nH')}{t('sm.th.t11.hiq.matchedFrom')}{X('l25-lo', '88.24 MHz')}
            {t('sm.th.t11.rlc.to')}{X('l25-hi', '118.2 MHz')}, {X('l25-fbw', '29.96 %')}{t('sm.th.t11.hiq.est')}{X('l25-est', '28.28 %')}); 10 Ω (Q 2;{' '}
            {X('l10-cv', '79.58 pF')}, {X('l10-lv', '39.79 nH')}{t('sm.th.t11.hiq.from')}{X('l10-lo', '94.81 MHz')}{t('sm.th.t11.rlc.to')}
            {X('l10-hi', '106.1 MHz')}, {X('l10-fbw', '11.33 %')}{t('sm.th.t11.hiq.est')}{X('l10-est', '11.18 %')}{t('sm.th.t11.hiq.ptQ')}
            {jump('matching-with-two-parts', t('sm.th.topic.matching-with-two-parts'))}{t('sm.th.t11.hiq.climb')}{X('two-q', '1.112')}
            {t('sm.th.t11.hiq.step')}{X('two-p0', '143.2 pF')}, {X('two-p1', '32.01 nH')}, {X('two-p2', '64.02 pF')},{' '}
            {X('two-p3', '71.58 nH')}{t('sm.th.t11.hiq.match10')}{X('two-lo', '90.96 MHz')}{t('sm.th.t11.rlc.to')}{X('two-hi', '109.4 MHz')},{' '}
            {X('two-fbw', '18.48 %')}{t('sm.th.t11.hiq.moreParts')}{F0}.
          </p>
          <Eq id="q-l-network" />
          <Eq id="l-network-slope" />
          <Eq id="q-node" />
          <p>
            <b>{t('sm.th.t11.line.b')}</b>{t('sm.th.t11.line.a')}{F0}{t('sm.th.t11.line.c')}{X('stub-hi', '131.2 MHz')}
            {t('sm.th.t11.line.atLeast')}{X('stub-fbw', '81.19 %')}{t('sm.th.t11.line.ls')}{X('lineShort-lo', '88.92 MHz')}
            {t('sm.th.t11.rlc.to')}{X('lineShort-hi', '114.3 MHz')}, {X('lineShort-fbw', '25.37 %')}{t('sm.th.t11.line.half')}
            {X('half-lo', '90.55 MHz')}{t('sm.th.t11.rlc.to')}{X('half-hi', '107.9 MHz')}, {X('half-fbw', '17.39 %')}
            {t('sm.th.t11.line.one')}{X('one-lo', '95.21 MHz')}{t('sm.th.t11.rlc.to')}{X('one-hi', '104.4 MHz')},{' '}
            {X('one-fbw', '9.158 %')}{t('sm.th.t11.line.narrow')}{Z0}{t('sm.th.t11.line.shc')}{X('shuntC-worst', '12.30 dB')}.
          </p>
          <Eq id="line-theta" />
          <Eq id="line-rotation" />
          <QBandFigure />
          <div className={`${css.tableWrap} ${css.exTable}`}>
            <table className={css.table} data-sweep-examples="">
              <thead><tr><th scope="col">{t('sm.th.t11.tbl.ex')}</th><th scope="col">{t('sm.th.t11.tbl.lim')}</th><th scope="col">{t('sm.th.t11.tbl.fbw')}</th></tr></thead>
              <tbody>
                <tr><th scope="row">{t('sm.th.t11.tbl.r1')}</th><td>20 dB</td><td>{X('l25-fbw', '29.96 %')}</td></tr>
                <tr><th scope="row">{t('sm.th.t11.tbl.r2')}</th><td>20 dB</td><td>{X('l10-fbw', '11.33 %')}</td></tr>
                <tr><th scope="row">{t('sm.th.t11.tbl.r3')}</th><td>20 dB</td><td>{X('two-fbw', '18.48 %')}</td></tr>
                <tr><th scope="row">{t('sm.th.t11.tbl.r4')}</th><td>10 dB</td><td>{t('sm.th.t11.tbl.atLeast')}{X('stub-fbw', '81.19 %')}</td></tr>
                <tr><th scope="row">{t('sm.th.t11.tbl.r5')}</th><td>10 dB</td><td>{X('lineShort-fbw', '25.37 %')}</td></tr>
                <tr><th scope="row">{t('sm.th.t11.tbl.r6')}</th><td>10 dB</td><td>{X('half-fbw', '17.39 %')}</td></tr>
                <tr><th scope="row">{t('sm.th.t11.tbl.r7')}</th><td>10 dB</td><td>{X('one-fbw', '9.158 %')}</td></tr>
                <tr><th scope="row">{t('sm.th.t11.tbl.r8')}</th><td>20 dB</td><td>{X('qw25-fbw', '36.70 %')}</td></tr>
                <tr><th scope="row">{t('sm.th.t11.tbl.r9')}</th><td>20 dB</td><td>{X('qw10-fbw', '14.34 %')}</td></tr>
              </tbody>
            </table>
          </div>
          <p>
            <b>{t('sm.th.t11.qw.b')}</b>{t('sm.th.t11.qw.a')}Γ<sub>m</sub>{t('sm.th.t11.qw.c')}Z<sub>t</sub> {X('qw25-zt', '35.36 Ω')}
            {t('sm.th.t11.qw.d')}{X('qw25-lo', '81.65 MHz')}{t('sm.th.t11.rlc.to')}{X('qw25-hi', '118.4 MHz')},{' '}
            {X('qw25-fbw', '36.70 %')}{t('sm.th.t11.qw.e')}Z<sub>t</sub> {X('qw10-zt', '22.36 Ω')}{t('sm.th.t11.qw.d')}
            {X('qw10-lo', '92.83 MHz')}{t('sm.th.t11.rlc.to')}{X('qw10-hi', '107.2 MHz')}, {X('qw10-fbw', '14.34 %')}
            {t('sm.th.t11.qw.f')}{X('qw25w-lo', '21.63 MHz')}{t('sm.th.t11.rlc.to')}{X('qw25w-hi', '178.4 MHz')}{t('sm.th.t11.qw.g')}
          </p>
          <Eq id="quarter-wave-match" />
          <Eq id="quarter-wave-bandwidth" />
          <p>
            <b>{t('sm.th.t11.start.b')}</b>{t('sm.th.t11.start.a')}{X('start10-lo', '79.50 MHz')}{t('sm.th.t11.start.c')}
            {X('start10-w', '70.50 MHz')}{t('sm.th.t11.start.wide')}{X('start10-fbw', '70.50 %')}{t('sm.th.t11.rlc.of')}{F0}
            {t('sm.th.t11.start.at20')}{X('start20-lo', '92.12 MHz')}{t('sm.th.t11.rlc.to')}{X('start20-hi', '110.5 MHz')},{' '}
            {X('start20-fbw', '18.41 %')}{t('sm.th.t11.start.lq')}{X('start-q', '1.122')}{t('sm.th.t11.start.half')}
            {X('start-q-lo', '60.87 MHz')}{t('sm.th.t11.start.below')}{F0}{t('sm.th.t11.start.never')}{X('start-inf', '0.4472')}
            {t('sm.th.t11.start.deliv')}{X('startlog-hi', '162.9 MHz')} ({X('startlog-fbw', '83.39 %')}{t('sm.th.t11.start.noUpper')}
          </p>
          <p><b>{t('sm.th.t11.out.b')}</b>{t('sm.th.t11.out.a')}</p>
        </>
      ))}

      {topic('reading-a-trace', (
        <>
          <p>
            <b>{t('sm.th.t12.what.b')}</b>{t('sm.th.t12.what.a')}{F0}{t('sm.th.t12.what.c')}
            {jump('how-good-is-a-match', t('sm.th.topic.how-good-is-a-match'))}).
          </p>
          <p>
            <b>{t('sm.th.t12.way.b')}</b>{t('sm.th.t12.way.a')}{jump('q-and-bandwidth', t('sm.th.topic.q-and-bandwidth'))}
            {t('sm.th.t12.way.c')}{jump('moving-on-the-chart', t('sm.th.topic.moving-on-the-chart'))}{t('sm.th.t12.way.d')}
            {X('rlc2-10m', '0.9899 − j0.09999')}{t('sm.th.t12.way.for2')}{F0}{t('sm.th.t12.way.above')}
            {X('rlc2-1g', '0.9899 + j0.09999')}{t('sm.th.t12.way.at1g')}{X('start-10m', '−0.9797 + j0.2001')}{t('sm.th.t12.way.bare')}
          </p>
          <Eq id="x-series-l" />
          <Eq id="x-series-c" />
          <Eq id="b-shunt-c" />
          <Eq id="b-shunt-l" />
          <Eq id="line-theta" />
          <p>
            <b>{t('sm.th.t12.fast.b')}</b>{t('sm.th.t12.fast.a')}{X('start-m90-mag', '0.1314')}{t('sm.th.t12.fast.and')}
            {X('start-m110-mag', '0.09567')} ({X('start-m90-rl', '17.63 dB')}{t('sm.th.t12.fast.and')}{X('start-m110-rl', '20.38 dB')}
            {t('sm.th.t12.fast.res')}{X('rlc5-m90-mag', '0.4668')}{t('sm.th.t12.fast.and')}{X('rlc5-m110-mag', '0.4307')} (
            {X('rlc5-m90-rl', '6.618 dB')}{t('sm.th.t12.fast.and')}{X('rlc5-m110-rl', '7.316 dB')}).
          </p>
          <TraceBox L={L} mine={mine} s={s} fig={fig} locale={locale} />
          <p>
            <b>{t('sm.th.t12.loop.b')}</b>{t('sm.th.t12.loop.a')}{X('two-zero', '61.80 MHz')}{t('sm.th.t12.loop.c')}
            {X('two-peak', '0.2182')} ({X('two-peak-rl', '13.22 dB')}{t('sm.th.t12.loop.at')}{X('two-peak-f', '74.35 MHz')}
            {t('sm.th.t12.loop.so10')}{X('two10-n', '1')}{t('sm.th.t12.loop.band')}{X('two10-lo', '56.93 MHz')}{t('sm.th.t11.rlc.to')}
            {X('two10-hi', '137.1 MHz')} ({X('two10-fbw', '80.15 %')}{t('sm.th.t12.loop.at20')}{X('two20-n', '2')},{' '}
            {X('two20-a-lo', '59.94 MHz')}{t('sm.th.t11.rlc.to')}{X('two20-a-hi', '64.43 MHz')}{t('sm.th.t12.fast.and')}
            {X('two-lo', '90.96 MHz')}{t('sm.th.t11.rlc.to')}{X('two-hi', '109.4 MHz')}{t('sm.th.t12.loop.cross')}
            {X('one-50m', '0.2811')}{t('sm.th.t12.fast.and')}{X('stub-50m', '0.2811')}{t('sm.th.t12.loop.twice')}
            {X('one-n', '2')}{t('sm.th.t12.loop.bands')}{X('one-dip-hi', '56.71 MHz')}.
          </p>
          <p>
            <b>{t('sm.th.t12.plot.b')}</b>{t('sm.th.t12.plot.a')}{X('start10-lo', '79.50 MHz')}{t('sm.th.t12.plot.c')}
            {X('start-150-mag', '0.2866')}, {X('start-150-rl', '10.85 dB')}{t('sm.th.t12.plot.at50')}{X('start-50-g', '−0.2941 + j0.8235')}, |Γ|{' '}
            {X('start-50-mag', '0.8745')}{t('sm.th.sw.returnLoss')}{X('start-50-rl', '1.165 dB')}{t('sm.th.t12.plot.worst')}
            {X('start-vswr', '14.93')}{t('sm.th.t12.plot.figs')}{F0}{t('sm.th.t12.plot.holds')}{F0}{t('sm.th.t12.plot.lq')}{F0}.
          </p>
          <Eq id="return-loss" />
          <Eq id="vswr" />
          <Eq id="gamma-vswr" />
          <Eq id="power-delivered" />
          <ReadTraceFigure />
          <p><b>{t('sm.th.t12.draw.b')}</b>{t('sm.th.t12.draw.a')}</p>
        </>
      ))}
    </>
  );
}

/** Renders on a sweep setting, the band figures of a refined trace, folding, the way back or locale (the boxes also on a circuit). */
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
}, (a, b) => a.sweep === b.sweep && a.layer === b.layer && a.bib === b.bib && a.folded === b.folded && a.back === b.back && a.locale === b.locale);
