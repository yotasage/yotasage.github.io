// Topic 14 of the EM simulation page's Theory, full-wave runs and the waves (step M7.2d): docs/em-sim/theory-waves.md as
// written, without its claim markers, with the figures of TheoryWaveFigures.tsx. Rendered by Theory.tsx after the via
// topics in the same pass, so its citations are numbered in the page's order (the build-time scan of
// pages/em-sim/main.tsx finds them). The numbers in the text are the default via's (V at 35 ps); the equations and the
// "now" lines take theirs from the Waves section's estimate and, after a run for the same setup, from the run (theoryFeed
// `waves`, through lib/emsim/eqvaluesWaves.ts wavesBinding). Each equation with steps opens the shared derivation dialog.

import React, { useMemo, useState } from 'react';

import { EM_EQUATION_BY_ID } from '../../lib/emsim/equations';
import { wavesBinding } from '../../lib/emsim/eqvaluesWaves';
import { useI18n } from '../../lib/ui/i18n';
import base from '../../styles/EmSim.module.css';
import css from '../../styles/EmSimTheory.module.css';
import DerivationDialog from '../Equations/DerivationDialog';
import { derivationOf } from './EqPanel';
import { Eq, N, Sub, Topic, fmt } from './theoryKit';
import type { Cite, Live } from './theoryKit';
import { useTheoryFeed } from './theoryFeed';
import { ConformalFigure, LeapfrogFigure, YeeCellFigure } from './TheoryWaveFigures';

export const WAVES_TOPIC: { id: string; title: string; subs: [string, string][] } = {
  id: 'full-wave', title: 'Full-wave runs and the waves',
  subs: [
    ['fw-why', 'Why a full-wave run'], ['fw-yee', 'How FDTD works'], ['fw-mesh', 'The mesh and round barrels'],
    ['fw-edges', 'The boundary'], ['fw-ports', 'Ports, pulse and results'], ['fw-cost', 'What a run costs'],
    ['fw-read', 'Reading the waves'], ['fw-pair', 'A pair’s drives'], ['fw-3d', 'The 3D view'],
    ['fw-checked', 'How it was checked and where it stops'],
  ],
};

const ps = (s: number) => fmt(s * 1e12, 4), fs = (s: number) => fmt(s * 1e15, 4), ghz = (f: number) => fmt(f / 1e9, 4);
const time = (s: number) => (s < 60 ? `${fmt(s, 3)} s` : s < 3600 ? `${fmt(s / 60, 3)} min` : `${fmt(s / 3600, 3)} h`);

export default function TheoryWaves({ live, cite }: { live: Live; cite: Cite }) {
  const { t: tr, locale } = useI18n();
  const big = (n: number) => n.toLocaleString(locale === 'nb' ? 'nb-NO' : 'en-GB');
  const fed = useTheoryFeed().waves;
  const b = useMemo<Record<string, number>>(() => { try { return wavesBinding(fed?.pv ?? null, fed?.res ?? null); } catch { return {}; } }, [fed]);
  const n = Object.keys(b).length ? 1 : 0;
  const wlive = useMemo<Live>(() => ({ ...live, b, n }), [live, b, n]);
  const [dlg, setDlg] = useState<{ id: string; n: number; from: HTMLElement } | null>(null);
  const view = useMemo(() => {
    const eq = dlg ? EM_EQUATION_BY_ID.get(dlg.id) : undefined;
    return eq ? derivationOf(eq, n ? b : null, live.digits) : null;
  }, [dlg, b, n, live.digits]);
  const E = (id: string) => {
    const eq = EM_EQUATION_BY_ID.get(id);
    return (
      <Eq id={id} live={wlive} cite={cite} waves>
        {eq && eq.steps.length > 0 && (
          <span className={css.eqDeriveAt}>
            <button type="button" className={base.button} data-eq-derive-theory={id}
              onClick={(e) => { const from = e.currentTarget; setDlg((was) => ({ id, n: (was?.n ?? 0) + 1, from })); }}>{tr('em.th4.derivation')}</button>
          </span>
        )}
      </Eq>
    );
  };

  // The "now" lines: the structure in the Waves section, or what gives the numbers.
  const pv = fed?.pv ?? null, est = pv?.est ?? null, res = fed?.res ?? null;
  const what = fed ? tr('em.th4.whatAt', { kind: tr(fed.spec.kind === 'via' ? 'em.th4.whatVia' : 'em.th4.whatTrace'), tr: fmt(fed.spec.tr * 1e12, 3) }) : '';
  const wait = (
    <p className={css.now} data-waves-now="none">
      {tr('em.th4.wait1')}<a href="#waves">{tr('em.th4.waitLink')}</a>{tr('em.th4.wait2')}
    </p>
  );
  const now = (k: string, body: React.ReactNode) => (pv && est && pv.minCell ? <p className={css.now} data-waves-now={k}>{tr('em.th4.nowPrefix', { what })}{body}</p> : wait);
  const numMethod = tr('em.th2.cite.numMethod');
  const portsCite = tr('em.th2.cite.ports');

  return (
    <div data-theory-waves="">
      <Topic id="full-wave" no={14} title={tr('em.th4.t.full-wave')}>
        <Sub id="fw-why" title={tr('em.th4.s.fw-why')}>
          <p>
            {tr('em.th4.why.p1a')}<a href="#via-limits">{tr('em.th4.topic13')}</a>{tr('em.th4.why.p1b')}
            <a href="#via-return">{tr('em.th4.topic9')}</a>{tr('em.th4.why.p1c')}
          </p>
          <p>{tr('em.th4.why.p2')}</p>
        </Sub>

        <Sub id="fw-yee" title={tr('em.th4.s.fw-yee')}>
          <p>
            {tr('em.th4.yee.p1a')}{cite('WikiFDTD')}{tr('em.th4.yee.p1b')}{cite('WikiFDTD')}{cite('Yee1966')}{cite('TafloveHagness2005')}
            {tr('em.th4.yee.p1c')}{cite('WikiFDTD')}{cite('OpenEMSDocs', numMethod)}{tr('em.th4.yee.p1d')}
            η<sub>0</sub>{tr('em.th4.yee.p1e')}
          </p>
          <YeeCellFigure />
          {E('fdtd-update')}
          <LeapfrogFigure />
          <p>
            {tr('em.th4.yee.p2a')}{cite('WikiFDTD')}{tr('em.th4.yee.p2b')}{cite('CFL1928')}{tr('em.th4.yee.p2c')}
            c<sub>0</sub>{tr('em.th4.yee.p2d')}{cite('OpenEMSDocs', numMethod)}{tr('em.th4.yee.p2e')}
          </p>
          {now('yee', pv && est && pv.minCell && (
            <>
              {tr('em.th4.yee.now1')}<N k="minCellX" v={pv.minCell[0]}>{fmt(pv.minCell[0], 3)}</N>, <N k="minCellY" v={pv.minCell[1]}>{fmt(pv.minCell[1], 3)}</N>{tr('em.th4.yee.nowAnd')}
              <N k="minCellZ" v={pv.minCell[2]}>{fmt(pv.minCell[2], 3)}</N>{tr('em.th4.yee.now2')}<N k="dt" v={est.dt}>{fs(est.dt)}</N>{tr('em.th4.yee.now3')}
              <N k="T" v={est.T}>{ps(est.T)}</N>{tr('em.th4.yee.now4')}<N k="tauRt" v={est.tauRt}>{ps(est.tauRt)}</N>{tr('em.th4.yee.now5')}
              <N k="steps" v={est.steps}>{big(est.steps)}</N>{tr('em.th4.yee.now6')}
            </>
          ))}
          {E('fdtd-courant')}
          {E('fdtd-steps')}
        </Sub>

        <Sub id="fw-mesh" title={tr('em.th4.s.fw-mesh')}>
          <p>
            {tr('em.th4.mesh.p1a')}ε<sub>r</sub>{tr('em.th4.mesh.p1b')}t<sub>r</sub>{tr('em.th4.mesh.p1c')}
            ε<sub>r</sub>{tr('em.th4.mesh.p1d')}{cite('WikiFDTD')}{tr('em.th4.mesh.p1e')}
          </p>
          {now('mesh', pv && (
            <>
              {tr('em.th4.mesh.now1')}<N k="hmax" v={pv.geom.hmax}>{fmt(pv.geom.hmax, 4)}</N>{tr('em.th4.mesh.now2')}ε<sub>r</sub>{' '}
              <N k="erMax" v={pv.geom.erMax}>{fmt(pv.geom.erMax, 4)}</N>{tr('em.th4.mesh.now3')}t<sub>r</sub>{' '}
              <N k="tr" v={pv.model.trMin}>{fmt(pv.model.trMin * 1e12, 3)}</N>{tr('em.th4.mesh.now4')}
            </>
          ))}
          {E('fdtd-cell')}
          {E('fdtd-dispersion')}
          <p>
            {tr('em.th4.mesh.p2a')}{cite('OpenEMSDocs', numMethod)}{tr('em.th4.mesh.p2b')}{cite('DeyMittra1997')}{tr('em.th4.mesh.p2c')}
          </p>
          <ConformalFigure />
        </Sub>

        <Sub id="fw-edges" title={tr('em.th4.s.fw-edges')}>
          <p>
            {tr('em.th4.edges.p1a')}{cite('WikiFDTD')}{cite('RodenGedney2000')}{tr('em.th4.edges.p1b')}{cite('WikiFDTD')}
            {tr('em.th4.edges.p1c')}<a href="#via-return">{tr('em.th4.topic9')}</a>{tr('em.th4.edges.p1d')}
          </p>
        </Sub>

        <Sub id="fw-ports" title={tr('em.th4.s.fw-ports')}>
          <p>
            {tr('em.th4.ports.p1a')}Z<sub>0</sub>{tr('em.th4.ports.p1b')}{cite('OpenEMSDocs', portsCite)}{cite('PiketMay1994')}
            {tr('em.th4.ports.p1c')}f<sub>run</sub>{tr('em.th4.ports.p1d')}t<sub>r</sub>{tr('em.th4.ports.p1e')}
            t<sub>r</sub>{tr('em.th4.ports.p1f')}{cite('WikiFDTD')}{cite('OpenEMSDocs', numMethod)}.
          </p>
          {E('fdtd-pulse')}
          <p>
            {tr('em.th4.ports.p2a')}{cite('OpenEMSDocs', portsCite)}{tr('em.th4.ports.p2b')}f<sub>run</sub>{tr('em.th4.ports.p2c')}
            <a href="#via-tdr">{tr('em.th4.topic11')}</a>{tr('em.th4.ports.p2d')}
          </p>
          {now('ports', pv && (
            <>
              f<sub>run</sub> <N k="fRun" v={b.f_run}>{ghz(b.f_run)}</N>{tr('em.th4.ports.now1')}<N k="sigma" v={b.sigma_p}>{ps(b.sigma_p)}</N>{tr('em.th4.ports.now2')}
              <N k="t0" v={b.t_0}>{ps(b.t_0)}</N>{tr('em.th4.ports.now3')}<N k="fS" v={b.f_S}>{ghz(b.f_S)}</N>{tr('em.th4.ports.now4')}
              {res ? <>
                {tr('em.th4.ports.nowRun')}
                {res.records.ports.map((p, i) => (
                  <React.Fragment key={i}>{i ? (i === res.records.ports.length - 1 ? tr('em.th4.yee.nowAnd') : ', ') : ''}<N k={`z0-${i}`} v={p.z0}>{fmt(p.z0, 4)}</N></React.Fragment>
                ))}{tr('em.th4.ports.nowRunTail')}
              </> : tr('em.th4.ports.nowWait')}
            </>
          ))}
          {E('fdtd-waves')}
          {E('fdtd-s')}
        </Sub>

        <Sub id="fw-cost" title={tr('em.th4.s.fw-cost')}>
          <p>
            {tr('em.th4.cost.p1a')}{cite('WikiFDTD')}{tr('em.th4.cost.p1b')}
          </p>
          {now('cost', pv && est && (
            <>
              <N k="cells" v={est.cells}>{big(est.cells)}</N>{tr('em.th4.cost.now1')}<N k="steps2" v={est.steps}>{big(est.steps)}</N>{tr('em.th4.cost.now2')}
              <N k="ports" v={pv.ports.length}>{pv.ports.length}</N>{tr('em.th4.cost.now3')}<N k="updates" v={b.W_u}>{fmt(b.W_u / 1e9, 3)}</N>{tr('em.th4.cost.now4')}
              <N k="seconds" v={b.t_run}>{time(b.t_run)}</N>{tr(pv.backend === 'webgpu' ? 'em.th4.cost.onGpu' : 'em.th4.cost.onCpu')}
              <N k="rate" v={est.rate}>{fmt(est.rate, 3)}</N>{tr('em.th4.cost.now5')}{tr(pv.rateFrom === 'measured' ? 'em.th4.cost.rateMeas' : 'em.th4.cost.rateTab')}).
            </>
          ))}
          {E('fdtd-cost')}
        </Sub>

        <Sub id="fw-read" title={tr('em.th4.s.fw-read')}>
          <p>
            {locale === 'en' ? 'The ' : ''}<a href="#waves" data-fw-link="player">{tr('em.th4.read.p1Link')}</a>{tr('em.th4.read.p1b')}
            <a href="#via-tdr">{tr('em.th4.topic11')}</a>{tr('em.th4.read.p1c')}
            <a href="#field-solver">{tr('em.th4.topic2')}</a>{tr('em.th4.read.p1d')}
          </p>
          {res?.snap && (
            <p className={css.now} data-waves-now="frames">
              {tr('em.th4.read.now1')}<N k="frames" v={res.snap.frames}>{res.snap.frames}</N>{tr('em.th4.read.now2')}
              <N k="every" v={res.snap.every}>{res.snap.every}</N>{tr('em.th4.read.now3', { n: res.snap.slices.length })}
            </p>
          )}
          <p>
            {tr('em.th4.read.p2a')}<a href="#via-return">{tr('em.th4.topic9')}</a>{tr('em.th4.read.p2b')}
            <a href="#via-limits">{tr('em.th4.topic13')}</a>{tr('em.th4.read.p2c')}
          </p>
        </Sub>

        <Sub id="fw-pair" title={tr('em.th4.s.fw-pair')}>
          <p>
            {tr('em.th4.pair.p1a')}<a href="#via-limits">{tr('em.th4.topic13')}</a>{tr('em.th4.pair.p1b')}
            <a href="#waves" data-fw-link="drive">{tr('em.th4.pair.p1Link')}</a>{tr('em.th4.pair.p1c')}
          </p>
        </Sub>

        <Sub id="fw-3d" title={tr('em.th4.s.fw-3d')}>
          <p>
            {locale === 'en' ? 'The ' : ''}<a href="#waves" data-fw-link="3d">{tr('em.th4.v3d.p1Link')}</a>{tr('em.th4.v3d.p1b')}
            <a href="#transmission-lines">{tr('em.th4.topic1')}</a>{tr('em.th4.v3d.p1c')}
          </p>
        </Sub>

        <Sub id="fw-checked" title={tr('em.th4.s.fw-checked')}>
          <p>
            {tr('em.th4.chk.p1a')}{cite('OpenEMSDocs')}{tr('em.th4.chk.p1b')}
          </p>
          <p>{tr('em.th4.chk.p2')}</p>
        </Sub>
      </Topic>
      {/* mounted only while open, so the page holds one derivation dialog besides the equation panel's */}
      {dlg && <DerivationDialog view={view} opening={dlg.n} from={dlg.from} onClosed={() => setDlg(null)} titleId="em-derive-theory-title" />}
    </div>
  );
}
