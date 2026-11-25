// The EM simulation page's Theory and References (step M2.4c), loaded by EmSimTool with import() when the section
// comes near the window or a link points into it, so KaTeX, the equation registry and this text stay out of the first
// load. The text is docs/em-sim/theory.md (topics 0–3, here) and theory-2.md (topics 4–6, Theory2.tsx) as written;
// the claims are checked in docs/em-sim/claims.md. Live numbers come from the results the page already has
// (theoryFeed.ts: the Trace section's last full solve, the Calculators and Tolerance tools' last runs) through
// lib/emsim/eqvalues.ts; nothing is solved here. Citations are numbered by one Bibliography in the order of the page,
// so References must render after Theory in the same pass (EmSimTool does).
// M4.3b: topics 7–13 (TheoryVias.tsx); M7.2d: topic 14, full-wave runs (TheoryWaves.tsx, fed by the Waves section).

import React, { useMemo } from 'react';

import Bibliography from '../Bibliography';
import type { BibEntry } from '../../lib/bibtex';
import { closedForms } from '../../lib/emsim/closedform';
import { emBinding } from '../../lib/emsim/eqvalues';
import type { CalcParts } from '../../lib/emsim/eqvalues';
import type { BemResult } from '../../lib/emsim/bem2d';
import type { SolveResult } from '../../lib/emsim/jobs';
import { mainKey } from '../../lib/emsim/lines';
import { sameSetup } from '../../lib/emsim/setup';
import type { LengthUnit } from '../../lib/emsim/units';
import { useI18n } from '../../lib/ui/i18n';
import css from '../../styles/EmSimTheory.module.css';
import { emHasKey } from './emText';
import { LadderFigure, FieldLinesFigure, PairFigure } from './TheoryFigures';
import { FLOOR, qText } from './trace';
import { Eq, N, Sub, Topic, citeWith } from './theoryKit';
import type { Live } from './theoryKit';
import { useTheoryFeed } from './theoryFeed';
import Theory2 from './Theory2';
import TheoryVias, { VIA_TOPICS } from './TheoryVias';
import TheoryWaves, { WAVES_TOPIC } from './TheoryWaves';

export const bibOf = (references: BibEntry[]): Bibliography => new Bibliography(references);

export const TOPICS: readonly { id: string; title: string; subs?: [string, string][] }[] = [
  { id: 'how-to-use', title: 'How to use this tool' },
  { id: 'transmission-lines', title: 'Transmission lines and quasi-TEM' },
  { id: 'field-solver', title: 'How the field solver works and what its error means' },
  { id: 'pairs', title: 'Single-ended and differential', subs: [['pair-definitions', 'Zodd, Zeven, Zdiff and Zcm'], ['coupling', 'Crosstalk: NEXT and FEXT'], ['two-speeds', 'Two speeds']] },
  { id: 'structures', title: 'Microstrip, stripline and the solder mask', subs: [['trapezoid', 'The trapezoid'], ['solder-mask', 'Solder mask'], ['coplanar-ground', 'Coplanar ground'], ['copper-thickness', 'Copper thickness']] },
  { id: 'calculators', title: 'Why calculators and fabs disagree', subs: [['closed-forms', 'Closed forms and their ranges'], ['jlcpcb-calculator', 'JLCPCB’s calculator']] },
  { id: 'tolerances', title: 'Tolerances and what matters most' },
  ...VIA_TOPICS,
  WAVES_TOPIC,
];
export const subTitle = (id: string): string => TOPICS.flatMap((t) => t.subs ?? []).find(([s]) => s === id)?.[1] ?? '';

interface Props { bib: Bibliography; unit: LengthUnit; digits: number }

export default function Theory({ bib, unit, digits }: Props) {
  const { t: tr } = useI18n();
  const feed = useTheoryFeed();
  const live = useMemo<Live>(() => {
    const res = feed.result;
    const setup = res?.setup ?? null;
    // The worker sends the result without the solver's levels (jobs.ts withMatrices): put back what eqvalues reads.
    const sent = res?.r as SolveResult | undefined;
    const r = sent ? (sent.matrices ? { ...sent, bem: { ok: true, ...sent.matrices } as unknown as BemResult } : sent) : null;
    const mine = <T extends { setup: unknown }>(x: T | null): T | null => (x && setup && sameSetup(x.setup as never, setup) ? x : null);
    const calc = mine(feed.calc), co = mine(feed.corners), mc = mine(feed.mc);
    let b: Record<string, number> = {};
    if (r && setup) {
      const cf = closedForms(setup);
      const key = r.n === 2 ? 'zdiff' : 'z0';
      const field = r.n === 2 ? r.pair?.zdiff.v : r.lines[0]?.z0.v;
      const f = r.n <= 2 ? cf.results.find((x) => x.values[key] !== undefined) : undefined;
      const cp: CalcParts | null = calc ? { stackup: calc.stackup, calculator: calc.calculator, parts: { er: calc.parts.er ?? 0, copper: calc.parts.copper ?? 0, etch: calc.parts.etch ?? 0, mask: calc.parts.mask ?? 0 } } : null;
      b = emBinding({
        result: r, kind: setup.trace.kind, reduced: cf.reduced, calc: cp, corners: co?.r ?? null, mc: mc?.r ?? null,
        formula: f && field !== undefined ? { value: f.values[key]!, field } : undefined,
      });
      // Zdc of a symmetric pair is zero but for rounding (1e-14 Ω): printed as 0 rather than as noise.
      if (b.Z_dc !== undefined && Math.abs(b.Z_dc) < 1e-9 * Math.abs(b.Z_diff)) b.Z_dc = 0;
    }
    return { b, n: r?.ok ? r.n : 0, kind: setup?.trace.kind ?? null, setup, r, calc, corners: co?.r ?? null, mc: mc?.r ?? null, unit, digits };
  }, [feed, unit, digits]);
  const cite = useMemo(() => citeWith(bib), [bib]);
  const E = (id: string, need?: string) => <Eq id={id} live={live} cite={cite} need={need} />;

  const topicTr = (id: string, fallback: string) => {
    for (const p of ['em.th1.t.', 'em.th3.t.', 'em.th4.t.']) {
      const k = `${p}${id}`;
      if (emHasKey(k)) return tr(k);
    }
    return fallback;
  };
  const subTr = (id: string, fallback: string) => {
    for (const p of ['em.th1.s.', 'em.th4.s.']) {
      const k = `${p}${id}`;
      if (emHasKey(k)) return tr(k);
    }
    return fallback;
  };

  // The main value now, as the results panel writes it.
  const r = live.r;
  const mq = r && r.ok ? (r.n === 2 && r.pair ? r.pair.zdiff : r.lines[0]?.z0) : null;
  const mt = mq ? qText(mq.v, mq.e, FLOOR.ohm) : null;
  const mName = r?.n === 2 ? 'Zdiff' : r && r.n > 2 ? tr('em.th1.z0Line1') : 'Z0';
  const key = r && r.ok ? mainKey(r.n) : '';
  const statusText = mq ? (mq.status === 'regular' ? tr('em.th1.t2.reg') : mq.status === 'irregular' ? tr('em.th1.t2.irreg') : mq.status) : '';

  return (
    <div className={css.theory} data-theory="">
      <p className={css.lead}>
        {tr('em.th1.lead1')}<a href="#references">{tr('em.th1.sourcesLink')}</a>.
      </p>
      <nav className={css.contents} aria-label={tr('em.th1.contentsAria')} data-theory-contents="">
        <ol>
          {TOPICS.map((tp) => (
            <li key={tp.id}>
              <a href={`#${tp.id}`}>{topicTr(tp.id, tp.title)}</a>
              {tp.subs && <ul>{tp.subs.map(([id, title]) => <li key={id}><a href={`#${id}`}>{subTr(id, title)}</a></li>)}</ul>}
            </li>
          ))}
        </ol>
      </nav>

      <Topic id="how-to-use" no={0} title={tr('em.th1.t.how-to-use')}>
        <p>{tr('em.th1.t0.p1')}</p>
        <ol className={css.steps}>
          <li><b>{tr('em.th1.t0.s1b')}</b>{tr('em.th1.t0.s1a')}<code>.kicad_pcb</code>{tr('em.th1.t0.s1b2')}<code>.kicad_pro</code>{tr('em.th1.t0.s1c')}</li>
          <li><b>{tr('em.th1.t0.s2b')}</b>{tr('em.th1.t0.s2')}</li>
          <li><b>{tr('em.th1.t0.s3b')}</b> Z<sub>0</sub>{tr('em.th1.t0.s3a')}ε<sub>eff</sub>{tr('em.th1.t0.s3b2')}Z<sub>diff</sub>, Z<sub>cm</sub>{tr('em.th1.t0.s3c')}</li>
          <li><b>{tr('em.th1.t0.s4b')}</b>{tr('em.th1.t0.s4')}</li>
          <li><b>{tr('em.th1.t0.s5b')}</b>{tr('em.th1.t0.s5')}</li>
          <li><b>{tr('em.th1.t0.s6b')}</b>{tr('em.th1.t0.s6')}</li>
          <li><b>{tr('em.th1.t0.s7b')}</b>{tr('em.th1.t0.s7')}</li>
          <li><b>{tr('em.th1.t0.s8b')}</b>{tr('em.th1.t0.s8')}</li>
        </ol>
        <p>{tr('em.th1.t0.p2')}</p>
        <p className={css.now} data-theory-now="">
          {mq && mt
            ? <>{tr('em.th1.t0.now1', { name: mName })}<N k={key} v={mq.v}>{mt.v}{mt.e ? ` ± ${mt.e}` : ''} Ω</N>{tr('em.th1.t0.now2', { status: statusText })}</>
            : <>{tr('em.th1.t0.wait1')}Z<sub>0</sub>{tr('em.th1.t0.wait2')}</>}
        </p>
      </Topic>

      <Topic id="transmission-lines" no={1} title={tr('em.th1.t.transmission-lines')}>
        <p>{tr('em.th1.t1.p1')}</p>
        <LadderFigure />
        {E('telegraph')}
        <p>
          {tr('em.th1.t1.p2a')}Z<sub>0</sub>{tr('em.th1.t1.p2b')}Z<sub>0</sub>{tr('em.th1.t1.p2c')}{cite('Ellingson2018', '§3.12')}.
        </p>
        {E('z0-lc')}
        {E('delay-lc')}
        <p>
          {tr('em.th1.t1.p3a')}{cite('Pozar2012', '§3.8')}{tr('em.th1.t1.p3b')}
        </p>
        <p>
          {tr('em.th1.t1.p4a')}ε<sub>eff</sub> = C/C<sub>0</sub>{tr('em.th1.t1.p4b')}C<sub>0</sub>{tr('em.th1.t1.p4c')}
          v = c<sub>0</sub>/√ε<sub>eff</sub>{tr('em.th1.t1.p4d')}λ<sub>0</sub>/√ε<sub>eff</sub>{cite('Ellingson2018', '§3.11')}
          {tr('em.th1.t1.p4e')}L = μ<sub>0</sub>ε<sub>0</sub>·C<sub>0</sub><sup>−1</sup>{cite('Paul2008')}.
        </p>
        {E('eeff-c')}
        {E('l-c0')}
        {E('v-eeff')}
        {E('lambda-eeff')}
        <p>
          {tr('em.th1.t1.p5a')}Z<sub>0</sub>{tr('em.th1.t1.p5b')}ε<sub>eff</sub>{tr('em.th1.t1.p5c')}
        </p>
        <FieldLinesFigure unit={unit} digits={digits} />
        <p>
          <b>{tr('em.th1.t1.p6b')}</b>{tr('em.th1.t1.p6a')}ε<sub>eff</sub>{tr('em.th1.t1.p6c')}{cite('QucsTech', '§11.1')}{cite('Getsinger1973')}
          {tr('em.th1.t1.p6d')}ε<sub>eff</sub>{tr('em.th1.t1.p6e')}
        </p>
        {E('getsinger', tr('em.th1.t1.needMs'))}
        {E('getsinger-limit', tr('em.th1.t1.needMs'))}
      </Topic>

      <Topic id="field-solver" no={2} title={tr('em.th1.t.field-solver')}>
        <p>{tr('em.th1.t2.p1')}</p>
        {E('charge-potential')}
        <p>
          {tr('em.th1.t2.p2a')}C<sub>0</sub>{tr('em.th1.t2.p2b')}Z<sub>0</sub>{tr('em.th1.t2.p2c')}ε<sub>eff</sub>{tr('em.th1.t2.p2d')}
        </p>
        <p>
          <b>{tr('em.th1.t2.p3b')}</b>{tr('em.th1.t2.p3a')}{cite('Cohn1954')}{tr('em.th1.t2.p3c')}{cite('WikiCapacitance')}{tr('em.th1.t2.p3d')}
        </p>
        {E('error-shown', tr('em.th1.t2.needErr'))}
        {E('order')}
        <p>
          <b>{tr('em.th1.t2.p4b')}</b>{tr('em.th1.t2.p4a')}<i>{tr('em.th1.t2.reg')}</i>{tr('em.th1.t2.p4c')}
          <i>{tr('em.th1.t2.irreg')}</i>{tr('em.th1.t2.p4d')}Z<sub>diff</sub>{tr('em.th1.t2.p4e')}{cite('Zhechev2026', tr('em.th2.cite.abstract'))}{tr('em.th1.t2.p4f')}
        </p>
        <p>
          <b>{tr('em.th1.t2.p5b')}</b>{tr('em.th1.t2.p5')}
        </p>
        <p>
          <b>{tr('em.th1.t2.p6b')}</b>{tr('em.th1.t2.p6')}
        </p>
      </Topic>

      <Topic id="pairs" no={3} title={tr('em.th1.t.pairs')}>
        <p>{tr('em.th1.t3.p1')}</p>
        <Sub id="pair-definitions" title={tr('em.th1.s.pair-definitions')}>
          <p>
            Z<sub>odd</sub>{tr('em.th1.t3.s1p1a')}Z<sub>even</sub>{tr('em.th1.t3.s1p1b')}{cite('PolarAP157')}{tr('em.th1.t3.s1p1c')}
            Z<sub>diff</sub> = 2·Z<sub>odd</sub>{tr('em.th1.t3.s1p1d')}Z<sub>cm</sub> = Z<sub>even</sub>/2{cite('PolarAP157')}{tr('em.th1.t3.s1p1e')}
            Z<sub>odd</sub>{tr('em.th1.t3.s1p1f')}Z<sub>even</sub>{tr('em.th1.t3.s1p1g')}
            Z<sub>odd</sub>{tr('em.th1.t3.s1p1h')}Z<sub>even</sub>{tr('em.th1.t3.s1p1i')}
            Z<sub>diff</sub>{tr('em.th1.t3.s1p1j')}Z<sub>cm</sub>{tr('em.th1.t3.s1p1k')}
          </p>
          {E('zodd-sym')}
          {E('zeven-sym')}
          {E('zdiff-zodd')}
          <PairFigure unit={unit} digits={digits} />
          <p>
            {tr('em.th1.t3.s1p2a')}Z<sub>diff</sub>{tr('em.th1.t3.s1p2b')}Z<sub>c</sub>{tr('em.th1.t3.s1p2c')}
            Z<sub>diff</sub> = Z<sub>c11</sub> + Z<sub>c22</sub> − 2·Z<sub>c12</sub>{tr('em.th1.t3.s1p2d')}
            Z<sub>cm</sub> = (Z<sub>c11</sub> + Z<sub>c22</sub> + 2·Z<sub>c12</sub>)/4{tr('em.th1.t3.s1p2e')}{cite('BockelmanEisenstadt1995')}
            {tr('em.th1.t3.s1p2f')}2·Z<sub>odd</sub>{tr('em.th1.t3.s1p2d')}Z<sub>even</sub>/2{tr('em.th1.t3.s1p2g')}
            Z<sub>dc</sub> = (Z<sub>c11</sub> − Z<sub>c22</sub>)/2{tr('em.th1.t3.s1p2h')}Z<sub>diff</sub>{tr('em.th1.t3.s1p2i')}
          </p>
          {E('mixed-mode-vars')}
          {E('zdd-zc')}
          {E('zcc-zc')}
          {E('zdc-zc')}
          {E('zdiff-b')}
          {E('ztdr')}
        </Sub>
        <Sub id="coupling" title={tr('em.th1.s.coupling')}>
          <p>
            {tr('em.th1.t3.s2p1a')}k<sub>b</sub>{tr('em.th1.t3.s2p1b')}k<sub>f</sub>{tr('em.th1.t3.s2p1c')}{cite('Paul2008')}{cite('Bogatin2018')}
            {tr('em.th1.t3.s2p1d')}k<sub>b</sub> = ¼·(C<sub>m</sub>/C + L<sub>m</sub>/L){tr('em.th1.t3.s2p1e')}
            k<sub>f</sub> = (C<sub>m</sub>/C − L<sub>m</sub>/L)/(2v){tr('em.th1.t3.s2p1f')}C<sub>m</sub>/C{tr('em.th1.t3.s2p1g')}
            L<sub>m</sub>/L{tr('em.th1.t3.s2p1h')}L<sub>m</sub>/L{tr('em.th1.t3.s2p1i')}
            k<sub>b</sub>{tr('em.th1.t3.s2p1j')}k<sub>f</sub>{tr('em.th1.t3.s2p1k')}k<sub>f</sub>{tr('em.th1.t3.s2p1l')}<sup>−5</sup>{tr('em.th1.t3.s2p1m')}
          </p>
          {E('kb')}
          {E('kf')}
          {E('fext-pulse')}
        </Sub>
        <Sub id="two-speeds" title={tr('em.th1.s.two-speeds')}>
          <p>
            {tr('em.th1.t3.s3p1a')}ε<sub>eff</sub>{tr('em.th1.t3.s3p1b')}ε<sub>eff</sub>{tr('em.th1.t3.s3p1c')}
          </p>
          {E('eeff-mode')}
          {E('mode-skew')}
        </Sub>
      </Topic>

      <Theory2 live={live} cite={cite} E={E} />
      <TheoryVias live={live} cite={cite} />
      <TheoryWaves live={live} cite={cite} />
    </div>
  );
}

/** The References section's list: after Theory in the same render, so the numbers follow the page. */
export function References({ bib }: { bib: Bibliography }) {
  return <div className={css.refs} data-references="">{bib.list()}</div>;
}
