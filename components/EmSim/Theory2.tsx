// Topics 4–6 of the EM simulation page's Theory (step M2.4c): docs/em-sim/theory-2.md as written, with the figures
// of TheoryFigures.tsx. Rendered by Theory.tsx in the same pass, so its citations are numbered in the page's order.

import React from 'react';

import { useI18n } from '../../lib/ui/i18n';
import css from '../../styles/EmSimTheory.module.css';
import { MaskFigure, PartsFigure, RankingFigure } from './TheoryFigures';
import { Sub, Topic } from './theoryKit';
import type { Cite, Live } from './theoryKit';

export default function Theory2({ live, cite, E }: { live: Live; cite: Cite; E: (id: string, need?: string) => React.ReactNode }) {
  const { t: tr } = useI18n();
  const { unit, digits } = live;
  const sd = live.mc?.ok && live.corners ? live.mc.stats[live.corners.key]?.sd ?? null : null;
  const tolNeed = tr('em.th2.tolNeed');
  const abs = tr('em.th2.cite.abstract');
  return (
    <>
      <Topic id="structures" no={4} title={tr('em.th1.t.structures')}>
        <p>
          {tr('em.th2.t4.p1a')}ε<sub>eff</sub>{tr('em.th2.t4.p1b')}
        </p>
        <Sub id="trapezoid" title={tr('em.th1.s.trapezoid')}>
          <p>
            {tr('em.th2.t4.s1p1a')}{cite('JLCPCBCalcGuide')}{tr('em.th2.t4.s1p1b')}Z<sub>diff</sub>{tr('em.th2.t4.s1p1c')}
          </p>
        </Sub>
        <Sub id="solder-mask" title={tr('em.th1.s.solder-mask')}>
          <p>
            {tr('em.th2.t4.s2p1a')}{cite('JLCPCBCalcGuide')}{tr('em.th2.t4.s2p1b')}
            ε<sub>eff</sub>{tr('em.th2.t4.s2p1c')}Z<sub>0</sub>{tr('em.th2.t4.s2p1d')}
            Z<sub>0</sub>{tr('em.th2.t4.s2p1e')}Z<sub>diff</sub>{tr('em.th2.t4.s2p1f')}
            ε<sub>eff</sub>{tr('em.th2.t4.s2p1g')}<a href="#calculators">{tr('em.th2.t4.topic5')}</a>{tr('em.th2.t4.s2p1h')}
          </p>
          <MaskFigure unit={unit} digits={digits} />
        </Sub>
        <Sub id="coplanar-ground" title={tr('em.th1.s.coplanar-ground')}>
          <p>
            {tr('em.th2.t4.s3p1a')}Z<sub>0</sub>{tr('em.th2.t4.s3p1b')}
          </p>
        </Sub>
        <Sub id="copper-thickness" title={tr('em.th1.s.copper-thickness')}>
          <p>
            {tr('em.th2.t4.s4p1a')}<a href="#coupling">{tr('em.th2.t4.xtalk')}</a>{tr('em.th2.t4.s4p1b')}
            {cite('Gunston1969', abs)}{tr('em.th2.t4.s4p1c')}Z<sub>diff</sub>{tr('em.th2.t4.s4p1d')}
          </p>
        </Sub>
      </Topic>

      <Topic id="calculators" no={5} title={tr('em.th1.t.calculators')}>
        <p>
          {tr('em.th2.t5.p1a')}{cite('PolarAP157')}{tr('em.th2.t5.p1b')}
        </p>
        <Sub id="closed-forms" title={tr('em.th1.s.closed-forms')}>
          <p>
            {tr('em.th2.t5.s1p1a')}Z<sub>0</sub>{tr('em.th2.t5.s1p1b')}ε<sub>eff</sub>{tr('em.th2.t5.s1p1c')}
            {cite('QucsTech', tr('em.th2.cite.singleMs'))}{cite('HammerstadJensen1980')}
            {tr('em.th2.t5.s1p1d')}{cite('WikiMicrostrip')}{cite('Wheeler1977')}
            {tr('em.th2.t5.s1p1e')}{cite('KirschningJansen1984', '§II')}
            {tr('em.th2.t5.s1p1f')}{cite('IPC2141', '§4')}.
          </p>
          <p>{tr('em.th2.t5.s1p2')}</p>
          <p>
            {tr('em.th2.t5.s1p3a')}{cite('Abbosh2009', abs)}.
          </p>
          {E('pct-diff', tr('em.th2.t5.noCf'))}
        </Sub>
        <Sub id="jlcpcb-calculator" title={tr('em.th1.s.jlcpcb-calculator')}>
          <p>
            {tr('em.th2.t5.s2p1a')}{cite('JLCPCBCalc')}{tr('em.th2.t5.s2p1b')}{cite('JLCPCBCalc')}
            {tr('em.th2.t5.s2p1c')}{cite('JLCPCBImpedance')}{tr('em.th2.t5.s2p1d')}{cite('JLCPCBCalcGuide')}{tr('em.th2.t5.s2p1e')}
          </p>
          <p>
            {tr('em.th2.t5.s2p2a')}{cite('JLCPCBCalc')}{tr('em.th2.t5.s2p2b')}
          </p>
          <PartsFigure calc={live.calc} shown={!!live.calc} />
          {E('parts-sum', tr('em.th2.t5.partsNeed'))}
          <p>
            {tr('em.th2.t5.s2p3a')}{cite('JLCPCBCalc')}{tr('em.th2.t5.s2p3b')}
          </p>
          <p>
            {tr('em.th2.t5.s2p4a')}{cite('JLCPCBCapabilities')}{tr('em.th2.t5.s2p4b')}{cite('Renbi2011', abs)}{tr('em.th2.t5.s2p4c')}
          </p>
        </Sub>
      </Topic>

      <Topic id="tolerances" no={6} title={tr('em.th1.t.tolerances')}>
        <p>
          {tr('em.th2.t6.p1a')}{cite('JLCPCBCapabilities')}{tr('em.th2.t6.p1b')}
        </p>
        <p>
          <b>{tr('em.th2.t6.p2b')}</b>{tr('em.th2.t6.p2')}
        </p>
        {E('sens', tolNeed)}
        {E('share', tolNeed)}
        <p>
          <b>{tr('em.th2.t6.p3b')}</b>{tr('em.th2.t6.p3')}
        </p>
        {E('corners', tolNeed)}
        <RankingFigure corners={live.corners} setup={live.setup} sd={sd} />
        <p>
          <b>{tr('em.th2.t6.p4b')}</b>{tr('em.th2.t6.p4')}
        </p>
        {E('rss-sigma', tolNeed)}
        {E('mc-normal', tolNeed)}
        {sd !== null && (
          <p className={css.now} data-live-text="mc-sd" data-v={sd}>
            {tr('em.th2.t6.mcSd', {
              sd: sd.toFixed(3),
              other: live.b.sigma !== undefined ? tr('em.th2.t6.mcRankVal', { sig: live.b.sigma.toFixed(3) }) : tr('em.th2.t6.mcRankDef'),
            })}
          </p>
        )}
      </Topic>
    </>
  );
}
