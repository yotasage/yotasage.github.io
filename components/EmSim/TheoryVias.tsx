// Topics 7–13 of the EM simulation page's Theory, the via (step M4.3b): docs/em-sim/theory-vias.md as written, without
// its claim markers, with the figures of TheoryViaFigures.tsx. Rendered by Theory.tsx after the six trace topics in the
// same pass, so its citations are numbered in the page's order (the build-time scan of pages/em-sim/main.tsx finds
// them). The equations take their numbers from the Via section's last full solve (theoryFeed `via`, through
// lib/emsim/eqvaluesVia.ts viaBinding with its default choices: the first piece between the signal layers, the first
// node with a ΔC, 10 GHz, the TDR's lowest impedance); the numbers in the text are the examples' (V and VP).

import React, { useMemo } from 'react';

import { viaBinding } from '../../lib/emsim/eqvaluesVia';
import { useI18n } from '../../lib/ui/i18n';
import css from '../../styles/EmSimTheory.module.css';
import { Eq, Topic } from './theoryKit';
import type { Cite, Live } from './theoryKit';
import { useTheoryFeed } from './theoryFeed';
import {
  BackdrillSideFigure, StubS21Figure, ViaCutFigure, ViaMixedFigure, ViaPadsFigure, ViaReturnFigure, ViaSFigure, ViaSideFigure, ViaTdrFigure,
} from './TheoryViaFigures';

export const VIA_TOPICS: readonly { id: string; title: string }[] = [
  { id: 'via-line', title: 'The via as a line' },
  { id: 'via-pads', title: 'Pads and antipads' },
  { id: 'via-return', title: 'The return path and stitching vias' },
  { id: 'via-stubs', title: 'Stubs and backdrill' },
  { id: 'via-tdr', title: 'Reading a TDR' },
  { id: 'via-sparams', title: 'S-parameters and mixed mode' },
  { id: 'via-limits', title: 'Where the via model stops' },
];

export default function TheoryVias({ live, cite }: { live: Live; cite: Cite }) {
  const { t: tr } = useI18n();
  const fed = useTheoryFeed().via;
  const vlive = useMemo<Live>(() => {
    let b: Record<string, number> = {};
    try { if (fed) b = viaBinding({ model: fed.r, via: fed.v }) as unknown as Record<string, number>; } catch { b = {}; }
    return { ...live, b, n: fed && Object.keys(b).length ? fed.r.n : 0 };
  }, [fed, live]);
  const E = (id: string, need?: string) => <Eq id={id} live={vlive} cite={cite} need={need} via />;
  const abs = tr('em.th2.cite.abstract');

  return (
    <div data-theory-vias="">
      <Topic id="via-line" no={7} title={tr('em.th3.t.via-line')}>
        <p>
          {tr('em.th3.t7.p1a')}ε<sub>r</sub>{tr('em.th3.t7.p1b')}ε<sub>r</sub>{tr('em.th3.t7.p1c')}c<sub>0</sub>
          {tr('em.th3.t7.p1d')}ε<sub>r</sub>{tr('em.th3.t7.p1e')}ε<sub>r</sub>{tr('em.th3.t7.p1f')}
        </p>
        <p className={css.now}>{tr('em.th3.t7.now')}</p>
        {E('via-barrel-z')}
        {E('via-barrel-delay')}
        <ViaSideFigure />
        <p>
          <b>{tr('em.th3.t7.p2b')}</b>{tr('em.th3.t7.p2a')}η<sub>0</sub>{tr('em.th3.t7.p2c')}ε<sub>r</sub>{tr('em.th3.t7.p2d')}
          {cite('WikiCapacitance')}{tr('em.th3.t7.p2e')}R<sub>eq</sub>{tr('em.th3.t7.p2f')}
        </p>
        {E('via-coax')}
        {E('via-quasi-coax', tr('em.th3.t7.needQuasi'))}
        {E('via-req')}
        <ViaCutFigure />
        <p>
          <b>{tr('em.th3.t7.p3b')}</b>{tr('em.th3.t7.p3a')}{cite('Fan2014', abs)}.
        </p>
        {E('via-section-l')}
        {E('via-section-c')}
        {E('via-section-z')}
        {E('via-section-delay')}
        <p>
          {tr('em.th3.t7.p4a')}Z<sub>diff</sub>{tr('em.th3.t7.p4b')}Z<sub>cm</sub>{tr('em.th3.t7.p4c')}
          <a href="#pairs">{tr('em.th3.t7.topic3')}</a>{tr('em.th3.t7.p4d')}Z<sub>diff</sub>{tr('em.th3.t7.p4e')}
        </p>
        {E('via-section-pair')}
      </Topic>

      <Topic id="via-pads" no={8} title={tr('em.th3.t.via-pads')}>
        <p>
          {tr('em.th3.t8.p1a')}{cite('Kok1993', abs)}.
        </p>
        <p>
          {tr('em.th3.t8.p2a')}{cite('Vardapetyan2020', abs)}.
        </p>
        {E('via-dc')}
        <ViaPadsFigure />
        <p>
          {tr('em.th3.t8.p3a')}k<sub>12</sub>{tr('em.th3.t8.p3b')}k<sub>12</sub>{tr('em.th3.t8.p3c')}
        </p>
        {E('via-pad-coupling')}
        {E('via-target', tr('em.th3.t8.needTarget'))}
      </Topic>

      <Topic id="via-return" no={9} title={tr('em.th3.t.via-return')}>
        <p>
          {tr('em.th3.t9.p1a')}{cite('Fan2014', abs)}{tr('em.th3.t9.p1b')}ε<sub>r</sub>{tr('em.th3.t9.p1c')}
          {cite('Chada2009', abs)}{tr('em.th3.t9.p1d')}{cite('Archambeault2004', abs)}.
        </p>
        {E('cavity-f')}
        <p>{tr('em.th3.t9.p2')}</p>
        <ViaReturnFigure />
        <p>
          <b>{tr('em.th3.t9.p3b')}</b>{tr('em.th3.t9.p3a')}R<sub>eq</sub>{tr('em.th3.t9.p3c')}R<sub>eq</sub>{tr('em.th3.t9.p3d')}
        </p>
        <p>
          {tr('em.th3.t9.p4a')}{cite('RimoloDonadio2009b', abs)}{tr('em.th3.t9.p4b')}{cite('Miller2004', abs)}{tr('em.th3.t9.p4c')}
        </p>
      </Topic>

      <Topic id="via-stubs" no={10} title={tr('em.th3.t.via-stubs')}>
        <p>
          {tr('em.th3.t10.p1a')}Z<sub>0</sub>{tr('em.th3.t10.p1b')}{cite('SteerVol2', '§2.4')}{cite('Ellingson2018', '§3.16')}
          {tr('em.th3.t10.p1c')}c<sub>0</sub>{tr('em.th3.t10.p1d')}ε<sub>eff</sub>{tr('em.th3.t10.p1e')}
        </p>
        {E('stub-zin')}
        {E('stub-quarter', tr('em.th3.t10.needStub'))}
        <p>
          {tr('em.th3.t10.p2a')}S<sub>21</sub>{tr('em.th3.t10.p2b')}{cite('Huddar2021', abs)}.
        </p>
        <StubS21Figure />
        <p>
          {tr('em.th3.t10.p3a')}{cite('Zhang2020', abs)}{tr('em.th3.t10.p3b')}{cite('Park2017', abs)}{tr('em.th3.t10.p3c')}
        </p>
        <BackdrillSideFigure />
      </Topic>

      <Topic id="via-tdr" no={11} title={tr('em.th3.t.via-tdr')}>
        <p>
          {tr('em.th3.t11.p1a')}Z<sub>ref</sub>{tr('em.th3.t11.p1b')}f<sub>3</sub>{tr('em.th3.t11.p1c')}
          t<sub>r</sub>{tr('em.th3.t11.p1d')}t<sub>r</sub>{tr('em.th3.t11.p1e')}
        </p>
        {E('tdr-rho')}
        {E('tdr-z')}
        {E('edge-f3')}
        {E('edge-band')}
        <p>{tr('em.th3.t11.p2')}</p>
        <ViaTdrFigure />
        <p>{tr('em.th3.t11.p3')}</p>
        {E('tdr-roundtrip')}
      </Topic>

      <Topic id="via-sparams" no={12} title={tr('em.th3.t.via-sparams')}>
        <p>
          {tr('em.th3.t12.p1a')}S<sub>11</sub>{tr('em.th3.t12.p1b')}S<sub>21</sub>{tr('em.th3.t12.p1c')}<sub>10</sub>
          {tr('em.th3.t12.p1d')}S<sub>11</sub>{tr('em.th3.t12.p1e')}S<sub>21</sub>{tr('em.th3.t12.p1f')}
          S<sub>11</sub>{tr('em.th3.t12.p1g')}S<sub>11</sub>{tr('em.th3.t12.p1h')}S<sub>21</sub>{tr('em.th3.t12.p1i')}
        </p>
        {E('abcd-line')}
        {E('abcd-shunt')}
        {E('s-abcd')}
        {E('s-db')}
        <ViaSFigure />
        <p>
          {tr('em.th3.t12.p2a')}S<sub>dd</sub>{tr('em.th3.t12.p2b')}S<sub>cc</sub>{tr('em.th3.t12.p2c')}
          S<sub>cd</sub>{tr('em.th3.t12.p2d')}S<sub>dc</sub>{tr('em.th3.t12.p2e')}{cite('BockelmanEisenstadt1995')}
          {tr('em.th3.t12.p2f')}S<sub>dd11</sub>{tr('em.th3.t12.p2g')}S<sub>dd21</sub>{tr('em.th3.t12.p2h')}
          S<sub>cc11</sub>{tr('em.th3.t12.p2i')}S<sub>cd21</sub>{tr('em.th3.t12.p2j')}
          {cite('Zhang2020', abs)}{cite('RimoloDonadio2009b', abs)}{tr('em.th3.t12.p2k')}
          <a href="#via-limits">{tr('em.th3.t12.topic13')}</a>{tr('em.th3.t12.p2l')}
        </p>
        {E('mixed-mode-s')}
        <ViaMixedFigure />
      </Topic>

      <Topic id="via-limits" no={13} title={tr('em.th3.t.via-limits')}>
        <p>
          {tr('em.th3.t13.p1a')}{cite('Cartier2007', abs)}{tr('em.th3.t13.p1b')}c<sub>0</sub>{tr('em.th3.t13.p1c')}
          ε<sub>r</sub>{tr('em.th3.t13.p1d')}ε<sub>r</sub>{tr('em.th3.t13.p1e')}{cite('Duan2014', abs)}{tr('em.th3.t13.p1f')}
        </p>
        {E('lambda8')}
        <p>
          {tr('em.th3.t13.p2a')}<a href="#full-wave">{tr('em.th3.t13.topic14')}</a>{tr('em.th3.t13.p2b')}
        </p>
      </Topic>
    </div>
  );
}
