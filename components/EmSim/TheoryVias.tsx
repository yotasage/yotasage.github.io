// Topics 7–13 of the EM simulation page's Theory, the via (step M4.3b): docs/em-sim/theory-vias.md as written, without
// its claim markers, with the figures of TheoryViaFigures.tsx. Rendered by Theory.tsx after the six trace topics in the
// same pass, so its citations are numbered in the page's order (the build-time scan of pages/em-sim/main.tsx finds
// them). The equations take their numbers from the Via section's last full solve (theoryFeed `via`, through
// lib/emsim/eqvaluesVia.ts viaBinding with its default choices: the first piece between the signal layers, the first
// node with a ΔC, 10 GHz, the TDR's lowest impedance); the numbers in the text are the examples' (V and VP).

import React, { useMemo } from 'react';

import { viaBinding } from '../../lib/emsim/eqvaluesVia';
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
const T = (id: string) => VIA_TOPICS.find((t) => t.id === id)!.title;

export default function TheoryVias({ live, cite }: { live: Live; cite: Cite }) {
  const fed = useTheoryFeed().via;
  const vlive = useMemo<Live>(() => {
    let b: Record<string, number> = {};
    try { if (fed) b = viaBinding({ model: fed.r, via: fed.v }) as unknown as Record<string, number>; } catch { b = {}; }
    return { ...live, b, n: fed && Object.keys(b).length ? fed.r.n : 0 };
  }, [fed, live]);
  const E = (id: string, need?: string) => <Eq id={id} live={vlive} cite={cite} need={need} via />;

  return (
    <div data-theory-vias="">
      <Topic id="via-line" no={7} title={T('via-line')}>
        <p>
          A via is a short vertical line: the barrel is its signal conductor, and the return vias and the planes around it
          carry the return current. Between two planes the field around the barrel lies in the horizontal cut, so the tool
          solves that cut in 2D, as it solves a trace’s cross-section, with the barrel and the return vias as circles.
          Within one material the cut is an exact TEM line: its impedance is the vacuum value divided by √ε<sub>r</sub>, and
          its delay is the length times √ε<sub>r</sub> / c<sub>0</sub>. For the 0.6/0.3 via with two return vias 0.8 mm away,
          the barrel is 127.36 Ω in vacuum, 59.71 Ω in the 0.865 mm core (ε<sub>r</sub> 4.55) and 62.90 Ω in the 3313
          prepreg (ε<sub>r</sub> 4.1).
        </p>
        <p className={css.now}>
          Equations with numbers in them follow the via in the Via section; the numbers in the text are those of the
          0.6/0.3 via and the LVDS via pair.
        </p>
        {E('via-barrel-z')}
        {E('via-barrel-delay')}
        <ViaSideFigure />
        <p>
          <b>Quick estimates.</b> A barrel of diameter d inside a solid ring of return of diameter D is a coaxial line,
          Z = η<sub>0</sub>/(2π√ε<sub>r</sub>)·ln(D/d){cite('WikiCapacitance')}. With N return vias on a circle a thin-wire
          estimate adds a term for the gaps between them; for the via above it gives 60.84 Ω, 1.9 % above the solver,
          because returns 0.8 mm from a 0.3 mm barrel are too close for the thin-wire picture. The tool turns the cut’s
          vacuum capacitance into the radius R<sub>eq</sub> of the coaxial line with the same capacitance: 1.255 mm here.
        </p>
        {E('via-coax')}
        {E('via-quasi-coax', 'With numbers for a single via whose return vias are all at the same distance.')}
        {E('via-req')}
        <ViaCutFigure />
        <p>
          <b>The section as one element.</b> Taken whole between its outer pads, the via has the inductance of its barrel
          lines and their capacitance plus every pad’s and plane’s excess; its impedance is √(L/C) and its delay √(LC). For
          the 0.6/0.3 via: L 0.681 nH, C 269.7 fF (179.8 fF of barrel line, 90.0 fF at the pads and planes), so
          √(L/C) = 50.23 Ω and 13.55 ps through the board. With a controlled return path, physics-based models treat a via
          as a line whose impedance can be matched, studied up to 20 GHz{cite('Fan2014', 'abstract')}.
        </p>
        {E('via-section-l')}
        {E('via-section-c')}
        {E('via-section-z')}
        {E('via-section-delay')}
        <p>
          A via pair is the same with two barrels: the cut gives Z<sub>diff</sub> and Z<sub>cm</sub> as for a pair of traces
          (<a href="#pairs">topic 3</a>). For the LVDS pair of 0.22 mm drills 0.7 mm apart with six return vias, the barrel’s
          Z<sub>diff</sub> is 92.23 Ω in the core and 97.16 Ω in the prepreg; the section as one element is 83.49 Ω
          differential and 36.63 Ω common, 12.59 ps.
        </p>
        {E('via-section-pair')}
      </Topic>

      <Topic id="via-pads" no={8} title={T('via-pads')}>
        <p>
          Where the barrel meets a pad, the pad’s copper adds capacitance to the planes nearby; where it passes a plane, the
          edge of the opening (the antipad) comes close to the barrel. Both are local: the tool takes each as a shunt
          capacitance at its layer, the charge in a window around the layer less the barrel line’s own over that window.
          Pads, antipads and planes are rings around the axis, so the tool solves them as bodies of revolution with ring
          charges, one via at a time. Quasi-static integral equations give the excess capacitance and inductance of a via
          with pads and openings, and how they depend on pad and opening size{cite('Kok1993', 'abstract')}.
        </p>
        <p>
          On the 0.6/0.3 via each pad adds about 15.3 fF and each plane crossing with its pad 14.3 fF: 90.0 fF over six
          layers. So the section, 50.23 Ω, lies below the barrel’s 59.71 Ω: half again as much capacitance at the same
          inductance. A smaller antipad adds capacitance and lowers the impedance, a larger one does the opposite; the
          Target finds the size: the 0.6/0.3 via reaches 50 Ω with antipads of Ø1.758 mm instead of 1.8 mm. Drill, pad,
          antipad and pitch are the means of tuning a differential via, by whether it is too capacitive or too
          inductive{cite('Vardapetyan2020', 'abstract')}.
        </p>
        {E('via-dc')}
        <ViaPadsFigure />
        <p>
          The LVDS pair keeps pads only on L1 and L6, 31.5 fF each per via, while its planes’ openings take 4.5 fF away:
          54.0 fF per via. Between the pair’s two pads the tool estimates the coupling from the barrel’s cut, as
          −k<sub>12</sub>·ΔC with k<sub>12</sub> = 0.274, and flags it until a full-wave check.
        </p>
        {E('via-pad-coupling')}
        {E('via-target', 'With numbers in the Via section’s Target, which solves for them.')}
      </Topic>

      <Topic id="via-return" no={9} title={T('via-return')}>
        <p>
          A via is a line only when its return current has a path beside it: return (stitching) vias joined to the planes
          the signal changes between{cite('Fan2014', 'abstract')}. Without one, the return current spreads from the antipad
          into the cavity between the two planes, where the radial wave has no cut-off: it is launched at every frequency.
          The board’s open edges make that plane pair a cavity with resonances; a 50 × 50 mm board with ε<sub>r</sub> 4.3
          has its first near 1.45 GHz. Shorting vias around the signal via make the plane pair’s impedance independent of
          the board’s edges{cite('Chada2009', 'abstract')}, and how far a quasi-static via model holds depends on the distance
          to the return via{cite('Archambeault2004', 'abstract')}.
        </p>
        {E('cavity-f')}
        <p>
          So the tool refuses a via without return vias and flags one whose nearest return is more than 2 mm away, a
          provisional limit that the full-wave check will set. Moving the 0.6/0.3 via’s two returns from 0.8 to 2.5 mm
          raises its barrel in the core from 59.71 to 108.78 Ω and the section from 50.23 to 68.63 Ω.
        </p>
        <ViaReturnFigure />
        <p>
          <b>The wall rule.</b> The axisymmetric solve closes its domain with a grounded coaxial wall at the returns’
          R<sub>eq</sub>, so that between the planes it has exactly the cut’s capacitance and what remains at a pad is only
          the local excess. When R<sub>eq</sub> would lie inside an opening, the tool uses a wider wall and says so. Return
          vias that an antipad cuts into are flagged too: the 0.6/0.3 via’s antipad edge lies 0.25 mm past its return vias’
          near edge.
        </p>
        <p>
          An uneven arrangement of ground vias near a pair raises mode conversion about as much as a length mismatch of its
          traces{cite('RimoloDonadio2009b', 'abstract')}. In a dense via array, overlapping antipads raise the planes’
          impedance sharply{cite('Miller2004', 'abstract')}; the tool flags a pair’s round antipads wider than its pitch.
        </p>
      </Topic>

      <Topic id="via-stubs" no={10} title={T('via-stubs')}>
        <p>
          Barrel beyond the layer where the signal leaves is a stub: an open line hanging off the path. An open line of
          length ℓ has the input impedance −jZ<sub>0</sub>·cot(βℓ), zero when βℓ = π/2: a short across the path at the
          quarter-wave frequency and its odd multiples{cite('SteerVol2', '§2.4')}{cite('Ellingson2018', '§3.16')}. So the
          bare stub resonates at f = 1/(4τ) = c<sub>0</sub>/(4ℓ√ε<sub>eff</sub>), τ its one-way delay.
        </p>
        {E('stub-zin')}
        {E('stub-quarter', 'With numbers for a via with a stub.')}
        <p>
          The 0.6/0.3 via leaving on L3 has 1.335 mm of barrel below it: 9.19 ps, a quarter wave at 27.2 GHz bare; with its
          pads the stub resonates at 21.8 GHz, where |S<sub>21</sub>| falls to −48.6 dB. The pads load the stub with
          capacitance and pull its resonance down. The frequency is set by the stub’s length, its depth by the stub’s
          structure and return paths{cite('Huddar2021', 'abstract')}.
        </p>
        <StubS21Figure />
        <p>
          Backdrilling drills the unused barrel out from the other side with a wider bit, leaving a short remainder.
          Backdrilled from the bottom to 1.2 mm, the same via keeps 0.165 mm of stub, which resonates near 215 GHz, far
          above the band; at 10 GHz the stub cost 0.68 dB of transmission, the backdrilled via 0.07 dB. In a pair, residual
          stubs that differ by the ±10 mil backdrill tolerance gave 9 Ω of differential impedance variation, mode conversion
          above −40 dB from 5 GHz and 2–3 ps of skew in simulation{cite('Zhang2020', 'abstract')}. Removing power-via stub
          resonances in 25 Gbps+ links improved the bit-error rate by seven orders of magnitude, simulated and
          measured{cite('Park2017', 'abstract')}. The tool flags a stub whose first resonance, with its pads, falls inside the
          edge’s band.
        </p>
        <BackdrillSideFigure />
      </Topic>

      <Topic id="via-tdr" no={11} title={T('via-tdr')}>
        <p>
          A TDR sends a step down the line and shows the impedance the step meets, from the part that comes back:
          Z = Z<sub>ref</sub>·(1 + ρ)/(1 − ρ), ρ the reflected step. Time on the plot is there and back: a feature at delay τ
          from the port shows at 2τ. The tool’s step has a Gaussian edge of the chosen 10–90 % rise time; its spectrum is
          down 3 dB at f<sub>3</sub> = 0.34/t<sub>r</sub> (9.70 GHz at 35 ps), and the S-parameters run to where it is down
          60 dB (43.3 GHz). The common 0.35/t<sub>r</sub> belongs to a single-pole edge; for the Gaussian edge the factor is
          0.3396.
        </p>
        {E('tdr-rho')}
        {E('tdr-z')}
        {E('edge-f3')}
        {E('edge-band')}
        <p>
          A feature shorter than the rise time shows as a softened bump or dip, smaller than its true step. On the 0.6/0.3
          via between 25 mm feeds of 51.50 Ω: at 15 ps the trace shows the pads as dips to 48.54 Ω and the barrel as a bump
          to 55.32 Ω; at 35 ps a single dip to 50.81 Ω is left; at 100 ps 51.19 Ω. Extra capacitance (pads, a wide trace)
          shows as a dip, extra inductance (a barrel far from its returns, a narrow neck) as a bump. The flat parts before
          and after the via are the feeds’ own impedance: 51.4975 Ω here, the trace’s 51.4976 Ω.
        </p>
        <ViaTdrFigure />
        <p>
          A feed shows a flat part only when its round trip is longer than the rise time: the default 2 mm feeds (1.7 mm
          from the pad’s edge) take 20.6 ps there and back, less than 35 ps, so the step never settles on them. With the
          ports right at the pads the 0.6/0.3 via reads 49.66 to 51.00 Ω at 35 ps. For a pair the TDR drives the two vias in
          opposite directions against a 100 Ω differential port, or together against 25 Ω for the common mode. The LVDS
          pair between 25 mm feeds dips from 103.36 to 91.65 Ω at 35 ps, to 88.29 Ω at 15 ps and to 97.99 Ω at 100 ps.
        </p>
        {E('tdr-roundtrip')}
      </Topic>

      <Topic id="via-sparams" no={12} title={T('via-sparams')}>
        <p>
          S-parameters describe the via as a sine wave sees it: S<sub>11</sub> what returns to the port, S<sub>21</sub> what
          goes through, each against frequency, usually in dB as 20·log<sub>10</sub>|S|. The tool chains the ABCD matrix of
          every piece (barrel lines, shunt capacitances, stubs, feeds) and turns the product into S at the ports’ impedance.
          The 0.6/0.3 via with its 2 mm feeds between 50 Ω ports: S<sub>11</sub> −33.4 dB and S<sub>21</sub> −0.002 dB at
          10 GHz, S<sub>11</sub> −17.3 dB at 25 GHz. The model has no losses, so |S<sub>11</sub>|² + |S<sub>21</sub>|² = 1 at
          every frequency.
        </p>
        {E('abcd-line')}
        {E('abcd-shunt')}
        {E('s-abcd')}
        {E('s-db')}
        <ViaSFigure />
        <p>
          For a pair, the four single-ended ports become mixed-mode ports: differential (S<sub>dd</sub>) referred to 100 Ω,
          common (S<sub>cc</sub>) to 25 Ω, and S<sub>cd</sub> and S<sub>dc</sub> for conversion between
          them{cite('BockelmanEisenstadt1995')}. The LVDS pair at 10 GHz: S<sub>dd11</sub> −19.4 dB, S<sub>dd21</sub> −0.05 dB,
          S<sub>cc11</sub> −10.3 dB. A symmetric pair converts nothing between the modes in this model (S<sub>cd21</sub> is
          rounding noise, below −300 dB); unequal stubs or return vias are what convert{cite('Zhang2020', 'abstract')}
          {cite('RimoloDonadio2009b', 'abstract')}. The plots fade above the frequency where the lumped parts stop being
          short (<a href="#via-limits">topic 13</a>).
        </p>
        {E('mixed-mode-s')}
        <ViaMixedFigure />
      </Topic>

      <Topic id="via-limits" no={13} title={T('via-limits')}>
        <p>
          Each lumped part, a pad’s window or the section as one element, holds while it is short against the wavelength.
          Quasi-static via circuits lose their usable bandwidth as the structure approaches λ/8{cite('Cartier2007', 'abstract')},
          so the tool’s limit is c<sub>0</sub>/(8ℓ√ε<sub>r</sub>) for the longest window. For the 0.6/0.3 via that is
          29.5 GHz (the 0.597 mm window at L4, ε<sub>r</sub> 4.55); for the LVDS pair 23.8 GHz. The flags name each case with
          its numbers: no return via (refused), a far return, a return inside an antipad, overlapping pads or antipads in a
          pair, a shared antipad, a long lumped part, a stub resonance in the band, a feed over its plane’s antipad, and the
          wider wall. A shared antipad of a differential via excites higher-order modes, and separate antipads on the outer
          planes did better mainly at 40–60 GHz in a full-wave study to 100 GHz{cite('Duan2014', 'abstract')}; the tool flags
          a shared antipad when the band passes 40 GHz. A feed that crosses its plane’s antipad has no plane under it there
          and is more inductive than the line it is modelled as.
        </p>
        {E('lambda8')}
        <p>
          Left out of this model: losses, the return current through the plane cavity, radiation and higher-order modes,
          and the coupling of a pair’s pads beyond the estimate. A full-wave solver in the browser comes in later steps and
          will check these limits on the same vias.
        </p>
      </Topic>
    </div>
  );
}
