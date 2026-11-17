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
import css from '../../styles/EmSimTheory.module.css';
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

  // The main value now, as the results panel writes it.
  const r = live.r;
  const mq = r && r.ok ? (r.n === 2 && r.pair ? r.pair.zdiff : r.lines[0]?.z0) : null;
  const mt = mq ? qText(mq.v, mq.e, FLOOR.ohm) : null;
  const mName = r?.n === 2 ? 'Zdiff' : r && r.n > 2 ? 'Z0 of line 1' : 'Z0';
  const key = r && r.ok ? mainKey(r.n) : '';

  return (
    <div className={css.theory} data-theory="">
      <p className={css.lead}>
        What the numbers above mean and where they come from. Equations with numbers in them follow the structure in the
        Trace section (topics 7–13: the via in the Via section) as you change it; numbers in the text are the default examples. Numbers in brackets lead to
        the <a href="#references">sources</a>.
      </p>
      <nav className={css.contents} aria-label="Theory contents" data-theory-contents="">
        <ol>
          {TOPICS.map((t) => (
            <li key={t.id}>
              <a href={`#${t.id}`}>{t.title}</a>
              {t.subs && <ul>{t.subs.map(([id, title]) => <li key={id}><a href={`#${id}`}>{title}</a></li>)}</ul>}
            </li>
          ))}
        </ol>
      </nav>

      <Topic id="how-to-use" no={0} title={TOPICS[0].title}>
        <p>
          The page works out what a trace on a printed circuit board looks like to a fast signal: its impedance, how fast
          the signal travels and, for a pair, how the two traces share their fields. It opens on a 50 Ω microstrip of
          0.1377 mm on the top layer of JLCPCB’s six-layer stackup JLC061611-3313A, under solder mask, over the plane on L2.
        </p>
        <ol className={css.steps}>
          <li><b>Stackup.</b> Choose a preset, any of JLCPCB’s stackups from “All JLCPCB stackups…”, or open a KiCad board
            (<code>.kicad_pcb</code>) to read its stackup; a KiCad project (<code>.kicad_pro</code>) adds its net classes. Every
            thickness and εr can be typed, with a tolerance, and shows where it came from.</li>
          <li><b>Trace.</b> Choose the structure, its layer and its planes, then type the width and gap, or drag the handles
            in the drawing. “General arrangement” places up to eight traces and any number of grounds freely.</li>
          <li><b>Read.</b> Z<sub>0</sub>, ε<sub>eff</sub> and the delay (for a pair Z<sub>diff</sub>, Z<sub>cm</sub> and their parts) appear under the
            drawing, each with the solver’s error. While you drag, a quicker coarse value follows the pointer, and the full
            one arrives when you pause.</li>
          <li><b>Look.</b> “Show the fields” draws the potential, the electric or magnetic field, or the charge and current
            on the copper behind the drawing; the probe reads the values at a point.</li>
          <li><b>Tools.</b> Target finds the width or gap for an impedance; Sweep plots what one input does; Tolerance shows
            the spread the inputs’ tolerances give; Calculators compares the result with closed formulas and with JLCPCB’s
            calculator.</li>
        </ol>
        <p>
          Undo and Redo step through every change. The page’s address holds the whole setup, so Copy link shares exactly
          what you see.
        </p>
        <p className={css.now} data-theory-now="">
          {mq && mt
            ? <>Your structure now: {mName} = <N k={key} v={mq.v}>{mt.v}{mt.e ? ` ± ${mt.e}` : ''} Ω</N> ({mq.status}); the default gives 51.50 ± 0.05 Ω.</>
            : <>The default gives Z<sub>0</sub> = 51.50 ± 0.05 Ω; your structure’s value appears here once the Trace section has solved it.</>}
        </p>
      </Topic>

      <Topic id="transmission-lines" no={1} title={TOPICS[1].title}>
        <p>
          A trace and the plane under it form a transmission line: a signal travels along it as a wave, a voltage between
          trace and plane with a current along the trace and back in the plane beneath it. Per unit length the line has a
          capacitance C between the trace and its return and an inductance L of the loop they make, and these two decide
          every number on this page.
        </p>
        <LadderFigure />
        {E('telegraph')}
        <p>
          A wave travelling one way has the same ratio of voltage to current everywhere: the characteristic impedance
          Z<sub>0</sub> = √(L/C). It needs √(LC) seconds per metre: the delay. A line ended in Z<sub>0</sub> looks to the driver
          like an endless line, so nothing is reflected{cite('Ellingson2018', '§3.12')}.
        </p>
        {E('z0-lc')}
        {E('delay-lc')}
        <p>
          On a real board the field runs through more than one material: the laminate under a microstrip, air and solder
          mask above it. Then the wave is not purely transverse (TEM): the field has a small part along the line, which
          vanishes as the frequency goes to zero{cite('Pozar2012', '§3.8')}. The static C and L describe the line exactly in
          that limit, and closely while the cross-section is small against the wavelength: the quasi-TEM model, which every
          2D field solver uses.
        </p>
        <p>
          The line then behaves as if it were in one uniform material of relative permittivity ε<sub>eff</sub> = C/C<sub>0</sub>,
          where C<sub>0</sub> is the capacitance with every dielectric replaced by air. A wave travels at
          v = c<sub>0</sub>/√ε<sub>eff</sub> and its wavelength is λ<sub>0</sub>/√ε<sub>eff</sub>{cite('Ellingson2018', '§3.11')}.
          Board materials are not magnetic, so L is the same with or without them: the solver finds L from the air-filled
          problem, L = μ<sub>0</sub>ε<sub>0</sub>·C<sub>0</sub><sup>−1</sup>{cite('Paul2008')}.
        </p>
        {E('eeff-c')}
        {E('l-c0')}
        {E('v-eeff')}
        {E('lambda-eeff')}
        <p>
          On the default microstrip C = 117.6 pF/m and L = 312.0 nH/m, which give Z<sub>0</sub> = 51.50 Ω,
          ε<sub>eff</sub> = 3.298 and 6.058 ps per millimetre.
        </p>
        <FieldLinesFigure unit={unit} digits={digits} />
        <p>
          <b>When does it hold?</b> At 10 GHz the wavelength on this line is 16.5 mm, while its cross-section is a few
          tenths of a millimetre, about 0.02 of a wavelength. Getsinger’s dispersion model estimates how ε<sub>eff</sub> of a
          microstrip rises with frequency{cite('QucsTech', '§11.1')}{cite('Getsinger1973')}. Applied to the default microstrip
          it gives a rise of 0.05 % at 10 GHz and 0.3 % at 25 GHz; the rise reaches the solver’s error on ε<sub>eff</sub>
          (0.17 %) at about 18 GHz. So on thin laminates the quasi-TEM numbers hold within their error to well above 10 GHz.
          This version leaves out dispersion, losses, copper roughness and how εr changes with frequency; they are planned
          for later.
        </p>
        {E('getsinger', 'With numbers for a microstrip or embedded microstrip.')}
        {E('getsinger-limit', 'With numbers for a microstrip or embedded microstrip.')}
      </Topic>

      <Topic id="field-solver" no={2} title={TOPICS[2].title}>
        <p>
          The page solves the cross-section itself, in your browser, for every change you make. It looks for the charge on
          the copper that holds each trace at its potential with the planes at 0 V. The unknowns sit on surfaces only: the
          outline of every piece of copper and every boundary between two materials (laminate and air, laminate and mask,
          prepreg and core) is cut into short straight pieces, the panels, each with its own constant charge. This is the
          boundary element method. Planes are not cut into panels: one plane enters through its mirror image, two through
          the exact solution between parallel plates.
        </p>
        {E('charge-potential')}
        <p>
          The solver runs twice: with the dielectrics it gives C, with every dielectric replaced by air it gives C<sub>0</sub>
          and from it L. Z<sub>0</sub>, ε<sub>eff</sub>, the delay and, for several traces, every impedance and coupling
          follow from these matrices. The panels are made shorter towards every edge and corner, where the charge crowds.
          The solver assumes perfect copper carrying its current on its surface and uniform, lossless materials.
        </p>
        <p>
          <b>The error.</b> The solver solves the same section at three levels, each with twice the panels of the one
          before, and compares them. The error it shows is 1.5 times the change between the two finest levels, with rules
          for levels that do not shrink cleanly, and never less than what the capacitances’ own errors imply. Checked
          against an independent finite-difference solver on 500 random structures, the shown error was never below the
          true error and was typically about four times it. Against exact solutions (Cohn’s stripline{cite('Cohn1954')}, a
          wire over a plane and a half-filled coax{cite('WikiCapacitance')}) the error falls as the panels are refined, at
          the rate expected, to 0.1 % and below.
        </p>
        {E('error-shown', 'Not filled in here: this result’s levels do not shrink cleanly, so its error follows one of the other rules.')}
        {E('order')}
        <p>
          <b>Regular and irregular.</b> A value is <i>regular</i> when its three levels approach their limit steadily, each
          change smaller than the last at a sensible rate; it is <i>irregular</i> when they do not, and its error is then a
          cautious difference of the levels. Irregular does not mean wrong: thin mask films and narrow gaps converge slowly,
          and the default pair shows Z<sub>diff</sub> = 103.36 ± 0.15 Ω irregular. Refinement that stops on its own can
          report convergence that has not happened{cite('Zhechev2026', 'abstract')}; the page shows how its levels behaved
          instead, so you can judge.
        </p>
        <p>
          <b>Digits.</b> A result never shows more digits than its error allows, and never finer than 0.01 Ω: the error
          gets one significant digit, two when it starts with 1 or 2, and the value ends at the error’s last digit
          (51.50 ± 0.05 Ω, 103.36 ± 0.15 Ω). The digits switch sets how many significant digits the typed values and
          lengths show; the setup keeps every digit.
        </p>
        <p>
          <b>Coarse while dragging.</b> While you drag a handle, a full solve can lag behind the pointer. When it does (a
          round trip over 30 ms), the page solves only the coarsest useful level, without an error, and marks the result
          “Coarse while dragging”; the full solve follows when the drag pauses for 200 ms or ends.
        </p>
      </Topic>

      <Topic id="pairs" no={3} title={TOPICS[3].title}>
        <p>
          A single-ended signal runs on one trace against the planes. A differential signal runs on a pair, as opposite
          voltages on the two traces, and the receiver looks at the difference. Two traces near each other share their
          fields, so a pair can carry a wave in two ways, its modes. On a symmetric pair these are the odd mode (+V and −V)
          and the even mode (both at +V).
        </p>
        <Sub id="pair-definitions" title={subTitle('pair-definitions')}>
          <p>
            Z<sub>odd</sub> is the impedance of one trace when the pair is driven in the odd mode, Z<sub>even</sub> when it is
            driven in the even mode{cite('PolarAP157')}. The differential impedance, seen between the two traces, is
            Z<sub>diff</sub> = 2·Z<sub>odd</sub>; the common-mode impedance, both traces together against the planes, is
            Z<sub>cm</sub> = Z<sub>even</sub>/2{cite('PolarAP157')}. In the odd mode the capacitance between the traces adds to
            each trace’s capacitance, so Z<sub>odd</sub> is lower than a trace’s own impedance; in the even mode it carries
            no charge and the mutual inductance adds, so Z<sub>even</sub> is higher. On the default pair
            Z<sub>odd</sub> = 51.68 Ω and Z<sub>even</sub> = 61.82 Ω around each trace’s own 56.75 Ω, so
            Z<sub>diff</sub> = 103.36 Ω and Z<sub>cm</sub> = 30.91 Ω.
          </p>
          {E('zodd-sym')}
          {E('zeven-sym')}
          {E('zdiff-zodd')}
          <PairFigure unit={unit} digits={digits} />
          <p>
            When the two traces differ (other widths, other layers, a ground on one side only) the modes are no longer odd
            and even, and several definitions of Z<sub>diff</sub> are in use. The page shows the mixed-mode one, built from
            the line’s impedance matrix Z<sub>c</sub>: Z<sub>diff</sub> = Z<sub>c11</sub> + Z<sub>c22</sub> − 2·Z<sub>c12</sub> and
            Z<sub>cm</sub> = (Z<sub>c11</sub> + Z<sub>c22</sub> + 2·Z<sub>c12</sub>)/4, the impedances a mixed-mode S-parameter
            model of the line uses{cite('BockelmanEisenstadt1995')}. For a symmetric pair they equal 2·Z<sub>odd</sub> and
            Z<sub>even</sub>/2, as above. Z<sub>dc</sub> = (Z<sub>c11</sub> − Z<sub>c22</sub>)/2 is shown when the pair is not
            symmetric: how much a differential signal turns into common mode on the line. The details also give the form
            for a pure differential voltage drive (B) and the value a differential TDR with 50 Ω ports reads; both equal
            Z<sub>diff</sub> for a symmetric pair.
          </p>
          {E('mixed-mode-vars')}
          {E('zdd-zc')}
          {E('zcc-zc')}
          {E('zdc-zc')}
          {E('zdiff-b')}
          {E('ztdr')}
        </Sub>
        <Sub id="coupling" title={subTitle('coupling')}>
          <p>
            A signal on one trace puts a copy on its neighbour. At the near end (NEXT) the copy lasts twice the line’s delay
            and its height is k<sub>b</sub> of the signal; at the far end (FEXT) it is a pulse as large as k<sub>f</sub> times
            the length times the edge’s slope{cite('Paul2008')}{cite('Bogatin2018')}. Both come from the mutual capacitance
            and inductance: k<sub>b</sub> = ¼·(C<sub>m</sub>/C + L<sub>m</sub>/L) and
            k<sub>f</sub> = (C<sub>m</sub>/C − L<sub>m</sub>/L)/(2v). In one uniform dielectric C<sub>m</sub>/C equals
            L<sub>m</sub>/L and FEXT vanishes; over a microstrip pair L<sub>m</sub>/L is larger, so FEXT is negative. On the
            default pair k<sub>b</sub> = 4.5 % and k<sub>f</sub> = −0.163 ps/mm: a 1 V step with a 100 ps edge gives a
            far-end pulse of about −0.16 V after 100 mm. A stripline pair on L2 of the same stackup, in nearly one
            dielectric, has k<sub>f</sub> of only −4 × 10<sup>−5</sup> ps/mm.
          </p>
          {E('kb')}
          {E('kf')}
          {E('fext-pulse')}
        </Sub>
        <Sub id="two-speeds" title={subTitle('two-speeds')}>
          <p>
            On a microstrip pair the two modes travel at different speeds. The odd mode’s field is strongest in the gap and
            just above it, in mask and air, and the even mode’s lies more in the laminate below, so the odd mode is faster:
            ε<sub>eff</sub> 3.08 against 3.44 on the default pair, 5.86 against 6.18 ps/mm, 33 ps apart after 100 mm. In a
            stripline both modes see nearly the same dielectric and travel together (ε<sub>eff</sub> 4.128 for both on the
            stripline pair). The page then says their speeds are not resolved; the impedances are not affected.
          </p>
          {E('eeff-mode')}
          {E('mode-skew')}
        </Sub>
      </Topic>

      <Theory2 live={live} cite={cite} E={E} />
      <TheoryVias live={live} cite={cite} />
      <TheoryWaves live={live} cite={cite} />
      <p className={css.foot}>
        The waves on a line and through a via, from a full-wave run, follow in later versions.
      </p>
    </div>
  );
}

/** The References section's list: after Theory in the same render, so the numbers follow the page. */
export function References({ bib }: { bib: Bibliography }) {
  return <div className={css.refs} data-references="">{bib.list()}</div>;
}
