// Topics 4–6 of the EM simulation page's Theory (step M2.4c): docs/em-sim/theory-2.md as written, with the figures
// of TheoryFigures.tsx. Rendered by Theory.tsx in the same pass, so its citations are numbered in the page's order.

import React from 'react';

import css from '../../styles/EmSimTheory.module.css';
import { MaskFigure, PartsFigure, RankingFigure } from './TheoryFigures';
import { Sub, Topic } from './theoryKit';
import type { Cite, Live } from './theoryKit';

const TOL_NEED = 'With numbers once the Tolerance tool in the Trace section has run on this structure.';

export default function Theory2({ live, cite, E }: { live: Live; cite: Cite; E: (id: string, need?: string) => React.ReactNode }) {
  const { unit, digits } = live;
  const sd = live.mc?.ok && live.corners ? live.mc.stats[live.corners.key]?.sd ?? null : null;
  return (
    <>
      <Topic id="structures" no={4} title="Microstrip, stripline and the solder mask">
        <p>
          A microstrip is a trace on an outer layer over a plane, with air and usually solder mask above it. A stripline is
          a trace inside the board between two planes. An embedded microstrip is an inner trace with a plane below it only.
          A stripline’s field lies wholly in the laminate, so its ε<sub>eff</sub> is the laminate’s: 4.13 for 0.1377 mm on
          L2 of the default stackup, between its prepreg’s 4.1 and its core’s 4.17. It is slower than the microstrip, 6.78
          against 6.06 ps/mm, and with planes on both sides it has more capacitance: the same 0.1377 mm gives 51.50 Ω as
          microstrip on L1, 38.44 Ω as stripline on L2 between L1 and L3, and 57.24 Ω as embedded microstrip on L2 over the
          thicker core to L3.
        </p>
        <Sub id="trapezoid" title="The trapezoid">
          <p>
            Etching removes copper from the top down, so a trace’s top ends up narrower than its base. JLCPCB’s guide gives
            the top as the base minus 0.7 mil{cite('JLCPCBCalcGuide')}. The page draws the trace as that trapezoid when the
            stackup has an etch, and every width you type is the base. A narrower top means less capacitance: the trapezoid
            raises the default microstrip by 0.98 Ω and the default pair’s Z<sub>diff</sub> by 2.85 Ω against rectangles.
          </p>
        </Sub>
        <Sub id="solder-mask" title="Solder mask">
          <p>
            Solder mask is a dielectric too: JLCPCB’s guide gives it εr 3.8, 1.2 mil thick on the laminate and 0.6 mil over
            the copper{cite('JLCPCBCalcGuide')}. It takes the place of some of the air in the trace’s field, so
            ε<sub>eff</sub> rises and Z<sub>0</sub> falls. On the default microstrip the mask lowers Z<sub>0</sub> by 3.48 Ω,
            from 54.98 to 51.50 Ω (6.3 %); on the default pair it lowers Z<sub>diff</sub> by 9.15 Ω, from 112.52 to
            103.36 Ω, more because the mask fills the gap where the odd mode’s field is strongest. The mask also slows the
            signal: ε<sub>eff</sub> 3.30 with it, 2.89 without. The closed formulas leave the mask out, which alone puts them
            a few ohms above a masked microstrip (<a href="#calculators">topic 5</a>). “Solder mask over the trace” switches
            it off for traces left bare.
          </p>
          <MaskFigure unit={unit} digits={digits} />
        </Sub>
        <Sub id="coplanar-ground" title="Coplanar ground">
          <p>
            Ground copper beside the trace on the same layer adds capacitance from the sides. With the default microstrip as
            a coplanar waveguide with ground, a gap of 0.6 mm changes nothing visible (51.43 ± 0.17 Ω), 0.2 mm lowers
            Z<sub>0</sub> by 1.1 Ω and 0.1 mm by 4.8 Ω. A pour that keeps a gap of a few laminate thicknesses hardly
            matters; a close one must be part of the design.
          </p>
        </Sub>
        <Sub id="copper-thickness" title="Copper thickness">
          <p>
            The copper’s side walls face the plane and, in a pair, each other (<a href="#coupling">crosstalk</a>). Thicker
            copper adds capacitance there, most between the two traces of a pair. The thickness changes the impedance of
            single and coupled microstrip too much to ignore in many practical cases{cite('Gunston1969', 'abstract')}: on the
            default pair, without mask and trapezoid, the 0.035 mm copper lowers Z<sub>diff</sub> by 16.4 Ω against
            zero-thickness copper, and on the single microstrip by 5.3 Ω.
          </p>
        </Sub>
      </Topic>

      <Topic id="calculators" no={5} title="Why calculators and fabs disagree">
        <p>
          Calculators get their numbers in two ways. A field solver works out the field of the actual cross-section, as
          this page does and as Polar’s Si8000 and Si9000 do{cite('PolarAP157')}. A closed formula is a fitted expression
          for one kind of structure, quick and good inside the range it was fitted for. In the examples below, where two of
          them disagree, the cause is in what they were told or what they leave out, not in the arithmetic.
        </p>
        <Sub id="closed-forms" title="Closed forms and their ranges">
          <p>
            Hammerstad–Jensen’s microstrip is stated within 0.03 % for Z<sub>0</sub> in air and 0.2 % for ε<sub>eff</sub>, for
            zero thickness{cite('QucsTech', '“single microstrip”')}{cite('HammerstadJensen1980')}. Wheeler’s 1977 formula is
            within 1 % for most cases and always within 2 %{cite('WikiMicrostrip')}{cite('Wheeler1977')}. Kirschning and
            Jansen’s coupled microstrip is stated within 0.6 % for impedances, for 0.1 ≤ w/h ≤ 10, 0.1 ≤ s/h ≤ 10 and
            1 ≤ εr ≤ 18, with zero-thickness strips{cite('KirschningJansen1984', '§II')}. IPC-2141 states no range or
            accuracy for its formulas and points to measurement{cite('IPC2141', '§4')}.
          </p>
          <p>
            To use a formula the page first reduces the structure to its inputs: the trapezoid becomes its mean width,
            several layers one height and one εr. What the formulas leave out matters more than their own error: none has
            the solder mask, Kirschning–Jansen has no copper thickness, and the coplanar formulas take the grounds as
            endless.
          </p>
          <p>
            On the bare default microstrip (no mask, a rectangle) the formulas hold: Hammerstad–Jensen gives 54.06 Ω against
            this page’s 54.16 Ω, 0.2 % apart, and Wheeler 54.33 Ω, while IPC-2141 gives 49.38 Ω, 8.8 % low. On the trace as
            it is, with mask and trapezoid, Hammerstad–Jensen gives 55.85 Ω against 51.50 Ω, the mask’s few ohms; IPC-2141
            lands at 51.24 Ω, close only because its own error and the missing mask cancel. Kirschning–Jansen gives
            132.3 Ω for the default pair against 103.36 Ω: no mask and no copper thickness. Published comparisons find
            closed forms for coupled microstrip within 5 % of a full-wave solver in most cases{cite('Abbosh2009', 'abstract')}.
          </p>
          {E('pct-diff', 'No closed form covers this structure.')}
        </Sub>
        <Sub id="jlcpcb-calculator" title="JLCPCB’s calculator">
          <p>
            JLCPCB’s online impedance calculator sends its inputs to Polar’s Si9000 field solver{cite('JLCPCBCalc')}. For
            JLC061611-3313A, a trace on L1 over L2, it uses εr 4.3 for the prepreg, copper 1.6 mil thick with a top 0.5 mil
            narrower than the base, and mask 1.0 mil on the laminate and between traces and 0.6 mil over the copper, at
            εr 3.8{cite('JLCPCBCalc')}. JLCPCB’s own lists give other values for the same stackup: εr 4.1 for its 3313
            prepreg and 0.035 mm finished outer copper{cite('JLCPCBImpedance')}, a top 0.7 mil narrower and mask 1.2 mil on
            the laminate{cite('JLCPCBCalcGuide')}. The page’s preset keeps the listed values; “Use JLCPCB’s calculator
            inputs” puts the calculator’s in, as one step you can undo.
          </p>
          <p>
            On the calculator’s inputs the two solvers agree: JLCPCB states 50 Ω at 5.42 mil, where Si9000 gives
            49.96 Ω{cite('JLCPCBCalc')}, and this page gives 50.06 ± 0.06 Ω at 0.1377 mm (5.42 mil). Over ten such queries
            the largest difference was 0.33 %. With the listed values the same trace is 51.50 Ω, 3.0 % above the 50 Ω
            JLCPCB states. One at a time, from the calculator’s inputs to the listed ones: εr 4.1 instead of 4.3 adds
            0.94 Ω, 0.035 mm copper instead of 1.6 mil 0.51 Ω, the wider trapezoid 0.25 Ω, and the thicker mask takes
            0.27 Ω; together 1.44 Ω. The default pair is 100.01 Ω on the calculator’s inputs and 103.36 Ω on the listed
            values, against JLCPCB’s 100 Ω at 4.36 / 8 mil. So the 3 % is the inputs, not the solvers.
          </p>
          <PartsFigure calc={live.calc} shown={!!live.calc} />
          {E('parts-sum', 'With numbers once Calculators in the Trace section has run on this structure (JLCPCB stackups only).')}
          <p>
            The Target tool on the calculator’s inputs finds 5.435 mil (0.1380 mm) for 50 Ω; the calculator’s 5.42 mil is a
            little narrower because its search stops within ±0.5 % of the target{cite('JLCPCBCalc')}. On the listed values
            50 Ω needs 0.1465 mm.
          </p>
          <p>
            Which to trust? Both describe a board that has not been made yet. JLCPCB promises impedance within
            ±10 %{cite('JLCPCBCapabilities')}, and both numbers lie well inside that. Finished boards vary too: in one study,
            boards of the same 50 Ω trace from three makers were off the nominal by 3 %, 10 % and 20 %{cite('Renbi2011', 'abstract')}.
            A measurement of the finished board has the last word; the page helps you start close to it.
          </p>
        </Sub>
      </Topic>

      <Topic id="tolerances" no={6} title="Tolerances and what matters most">
        <p>
          Every input has a tolerance: the laminate’s thickness after pressing, its εr, the etched width, the mask. A fab
          states its promise on the impedance instead: JLCPCB gives ±10 %, or ±5 % on request{cite('JLCPCBCapabilities')}.
          Where you have not typed a tolerance, the Tolerance tool fills in placeholders: ±10 % for widths, gaps and
          thicknesses, ±0.2 for εr and ±30 % for the mask. They show the method, not your fab’s figures; type real ones
          where you have them.
        </p>
        <p>
          <b>What moves it.</b> The ranking sets each input alone to the ends of its tolerance and shows how far Z moves. On
          the default microstrip with the placeholders: the prepreg’s thickness ±2.87 Ω, the width ∓2.42 Ω, the prepreg’s
          εr ∓0.98 Ω, the mask on the laminate ∓0.49 Ω, the copper’s thickness ∓0.34 Ω, and the rest less. Each input’s
          share is its change squared over the sum of the squares: 53 % thickness, 38 % width, 6 % εr. With these
          tolerances on a thin outer laminate, the laminate’s thickness and the width matter most, εr comes a distant
          third, and the mask’s thickness hardly counts.
        </p>
        {E('sens', TOL_NEED)}
        {E('share', TOL_NEED)}
        <p>
          <b>Worst case.</b> The corners put every input at the end of its tolerance that moves Z the same way, and solve
          those two setups: 44.54 to 59.37 Ω here. It is a safe bound but a pessimistic one, because every input at its
          limit at once is unlikely.
        </p>
        {E('corners', TOL_NEED)}
        <RankingFigure corners={live.corners} setup={live.setup} sd={sd} />
        <p>
          <b>Monte Carlo.</b> The tool draws 1000 boards, each input independent and normal with its tolerance at 3σ
          (redrawn beyond it), from a fixed seed so the result repeats. Here: median 51.44 Ω, 95 % between 49.06 and
          54.24 Ω, standard deviation 1.31 Ω. The same 1.31 Ω follows from the ranking: the root of the sum of the squared
          changes, divided by three, because changes this small add almost like straight lines. Inputs that move together
          in a real panel (a prepreg’s thickness and its εr through the resin content) would widen or narrow the band; the
          tool takes them as independent.
        </p>
        {E('rss-sigma', TOL_NEED)}
        {E('mc-normal', TOL_NEED)}
        {sd !== null && (
          <p className={css.now} data-live-text="mc-sd" data-v={sd}>
            Your structure’s Monte Carlo gives σ = {sd.toFixed(3)} Ω against {live.b.sigma !== undefined ? `${live.b.sigma.toFixed(3)} Ω from the ranking` : 'the ranking’s'}.
          </p>
        )}
      </Topic>
    </>
  );
}
