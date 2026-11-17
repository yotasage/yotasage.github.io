// Topic 14 of the EM simulation page's Theory, full-wave runs and the waves (step M7.2d): docs/em-sim/theory-waves.md as
// written, without its claim markers, with the figures of TheoryWaveFigures.tsx. Rendered by Theory.tsx after the via
// topics in the same pass, so its citations are numbered in the page's order (the build-time scan of
// pages/em-sim/main.tsx finds them). The numbers in the text are the default via's (V at 35 ps); the equations and the
// "now" lines take theirs from the Waves section's estimate and, after a run for the same setup, from the run (theoryFeed
// `waves`, through lib/emsim/eqvaluesWaves.ts wavesBinding). Each equation with steps opens the shared derivation dialog.

import React, { useMemo, useState } from 'react';

import { EM_EQUATION_BY_ID } from '../../lib/emsim/equations';
import { wavesBinding } from '../../lib/emsim/eqvaluesWaves';
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
const S = (id: string) => WAVES_TOPIC.subs.find(([s]) => s === id)![1];

const ps = (s: number) => fmt(s * 1e12, 4), fs = (s: number) => fmt(s * 1e15, 4), ghz = (f: number) => fmt(f / 1e9, 4);
const big = (n: number) => n.toLocaleString('en-GB');
const time = (s: number) => (s < 60 ? `${fmt(s, 3)} s` : s < 3600 ? `${fmt(s / 60, 3)} min` : `${fmt(s / 3600, 3)} h`);

export default function TheoryWaves({ live, cite }: { live: Live; cite: Cite }) {
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
              onClick={(e) => { const from = e.currentTarget; setDlg((was) => ({ id, n: (was?.n ?? 0) + 1, from })); }}>Derivation</button>
          </span>
        )}
      </Eq>
    );
  };

  // The "now" lines: the structure in the Waves section, or what gives the numbers.
  const pv = fed?.pv ?? null, est = pv?.est ?? null, res = fed?.res ?? null;
  const what = fed ? `${fed.spec.kind === 'via' ? 'the via' : 'the trace'} at ${fmt(fed.spec.tr * 1e12, 3)} ps` : '';
  const wait = (
    <p className={css.now} data-waves-now="none">
      The numbers in the text are the default via’s at 35 ps. Those of the structure in the{' '}
      <a href="#waves">Waves section</a> appear here once it has its estimate.
    </p>
  );
  const now = (k: string, body: React.ReactNode) => (pv && est && pv.minCell ? <p className={css.now} data-waves-now={k}>In the Waves section now ({what}): {body}</p> : wait);

  return (
    <div data-theory-waves="">
      <Topic id="full-wave" no={14} title={WAVES_TOPIC.title}>
        <Sub id="fw-why" title={S('fw-why')}>
          <p>
            The Via section’s model joins short lines and lumped capacitances, each solved in 2D or around one axis; that
            makes it fast enough to follow a drag, and it leaves out what does not fit that picture (<a href="#via-limits">topic 13</a>).
            Three things matter most on a board: the radial wave the barrel launches between two planes
            (<a href="#via-return">topic 9</a>), a feed that runs over its plane’s antipad and so has no plane under it there,
            and return vias far from the barrel, whose current then takes a wide path through the planes. A full-wave run
            solves Maxwell’s equations themselves in 3D, over the via with its feeds and the board around it, so all three
            are in it without a model of their own.
          </p>
          <p>
            On the 0.6/0.3 via of the openEMS comparison (its section between 3 mm feeds), before the via model took the feeds’
            runs over the antipads in, it read the section at 49.7 Ω; the full-wave runs read 73.1 Ω (this tool) and 68.9 Ω (openEMS), and the model now reads 67.9 Ω. The Via
            section suggests a run when a feed crosses its antipad by more than 0.1 mm, when the nearest return via is more
            than 1.5 mm away or there is none, when the edge’s band reaches past the model’s, or when a stub resonates within
            twice the band. The default via at 35 ps is one of these: its band reaches 25.0 GHz, the model’s 20.8 GHz. The
            same run also stores slices of the field, which the Waves player shows.
          </p>
        </Sub>

        <Sub id="fw-yee" title={S('fw-yee')}>
          <p>
            The tool’s full-wave solver is the finite-difference time-domain method (FDTD): space is cut into small boxes and
            time into small steps, and the fields are stepped forward from an empty start{cite('WikiFDTD')}. In Yee’s scheme
            the electric field’s components lie on the edges of each box and the magnetic field’s on its faces, half a cell
            apart, so that every E component sits between the H components that circle it and the other way
            round{cite('WikiFDTD')}{cite('Yee1966')}{cite('TafloveHagness2005')}. Maxwell’s two curl equations then become
            short updates: the change of E over one step follows from the curl of H around its edge, and the change of H from
            the curl of E around its face. E and H are updated in turn, half a step apart (“leapfrog”), and each value needs
            only its neighbours, so no system of equations is solved and every cell costs the same
            work{cite('WikiFDTD')}{cite('OpenEMSDocs', 'Numerical method')}. The tool stores the magnetic field as
            η<sub>0</sub>·H, so both fields are numbers of the same size; the laminate’s loss enters each E update through two
            coefficients per edge, and copper sets both to zero.
          </p>
          <YeeCellFigure />
          {E('fdtd-update')}
          <LeapfrogFigure />
          <p>
            The time step has an upper limit: above it some short waves on the grid grow from step to step and the run blows
            up{cite('WikiFDTD')}. This is the Courant–Friedrichs–Lewy condition{cite('CFL1928')}; for Yee’s grid it follows
            from the scheme’s own dispersion relation, Δt ≤ 1/(c<sub>0</sub>·√(1/Δx² + 1/Δy² + 1/Δz²)) with the smallest
            cells, and the tool takes 0.95 of it. So the smallest cell sets the step for the whole
            grid{cite('OpenEMSDocs', 'Numerical method')}: the default via’s smallest cells are 0.050, 0.034 and 0.020 mm, so a
            step is 52.4 fs. The run lasts ten of the pulse’s σ plus three round trips of the longest path from port to port,
            400.9 ps or 7645 steps for the default via; it stops sooner once the energy in the grid has fallen 50 dB under its
            peak.
          </p>
          {now('yee', pv && est && pv.minCell && (
            <>
              smallest cells <N k="minCellX" v={pv.minCell[0]}>{fmt(pv.minCell[0], 3)}</N>, <N k="minCellY" v={pv.minCell[1]}>{fmt(pv.minCell[1], 3)}</N> and{' '}
              <N k="minCellZ" v={pv.minCell[2]}>{fmt(pv.minCell[2], 3)}</N> mm, so a step of <N k="dt" v={est.dt}>{fs(est.dt)}</N> fs; a run of at
              most <N k="T" v={est.T}>{ps(est.T)}</N> ps (three round trips of <N k="tauRt" v={est.tauRt}>{ps(est.tauRt)}</N> ps after the pulse)
              or <N k="steps" v={est.steps}>{big(est.steps)}</N> steps.
            </>
          ))}
          {E('fdtd-courant')}
          {E('fdtd-steps')}
        </Sub>

        <Sub id="fw-mesh" title={S('fw-mesh')}>
          <p>
            The grid is graded: its lines lie on every copper edge and layer surface, and between them a cell is at most 1.3
            times its neighbour, up to a largest cell. That largest cell is a fifteenth of the wavelength in the highest
            ε<sub>r</sub> at 0.877/t<sub>r</sub>, where the edge’s spectrum is 20 dB down: 0.374 mm for the default stackup
            (ε<sub>r</sub> 4.55) at 35 ps. The grid itself slows short waves a little, more the coarser the
            cells{cite('WikiFDTD')}: along an axis at fifteen cells per wavelength, by at most 0.7 %. A trace gets at least
            four cells across, a pair’s gap three, a dielectric between a trace and its plane four; no cell is under 20 µm,
            so the solder mask and thinner layers are averaged into the cells around them.
          </p>
          {now('mesh', pv && (
            <>
              the largest cell is <N k="hmax" v={pv.geom.hmax}>{fmt(pv.geom.hmax, 4)}</N> mm, with ε<sub>r</sub>{' '}
              <N k="erMax" v={pv.geom.erMax}>{fmt(pv.geom.erMax, 4)}</N> at t<sub>r</sub>{' '}
              <N k="tr" v={pv.model.trMin}>{fmt(pv.model.trMin * 1e12, 3)}</N> ps.
            </>
          ))}
          {E('fdtd-cell')}
          {E('fdtd-dispersion')}
          <p>
            A round barrel on a square grid becomes a staircase{cite('OpenEMSDocs', 'Numerical method')}, and that error
            falls only slowly as cells shrink: in the tool’s first test a staircased barrel was still 4 % off in impedance at
            32 cells across the drill. The tool uses conformal cells instead: where a copper circle cuts a face of the grid,
            each E edge counts only with the part of its length outside the copper, so the update sees the true
            circle{cite('DeyMittra1997')}. With six cells across the drill the barrel’s impedance is then within 0.5 % (0.050 mm
            cells across the 0.3 mm drill), and the cut faces leave the time step as it was.
          </p>
          <ConformalFigure />
        </Sub>

        <Sub id="fw-edges" title={S('fw-edges')}>
          <p>
            The grid has to end, but the board should behave as if it went on: a wave that reaches the side of the grid must
            leave and not come back. The tool closes every open side with a convolutional perfectly matched layer (CPML),
            eight cells in which the fields are damped gradually enough that a wave enters it with almost no
            reflection{cite('WikiFDTD')}{cite('RodenGedney2000')}. It also absorbs the near field that decays without
            travelling, which older absorbing layers reflect{cite('WikiFDTD')}. In the tool’s test it reflected −92.8 dB in
            front of a face, −84.7 dB at an edge and −74.6 dB at a corner. The board’s layers and planes run into it, so the
            wave between the planes is absorbed: the run sees an endless board, as the via model does, without the resonances
            of a real board’s edges (<a href="#via-return">topic 9</a>).
          </p>
        </Sub>

        <Sub id="fw-ports" title={S('fw-ports')}>
          <p>
            Each feed ends in a lumped port: the edges from the trace’s end down to its plane carry a voltage source with a
            resistor equal to the feed’s Z<sub>0</sub> from the 2D solver{cite('OpenEMSDocs', 'Ports')}{cite('PiketMay1994')}.
            The resistor matches the line, so the wave that comes back to the port is absorbed and the run settles soon. The
            source is a Gaussian pulse of 1 V whose spectrum is 60 dB down at f<sub>run</sub> = 1.52/t<sub>r</sub>, so one run
            serves every edge from t<sub>r</sub> up (43.4 GHz, σ 13.6 ps, the peak at 5σ = 68.1 ps). A short pulse is the
            point: one run in time gives the response at every frequency in its
            spectrum{cite('WikiFDTD')}{cite('OpenEMSDocs', 'Numerical method')}.
          </p>
          {E('fdtd-pulse')}
          <p>
            Two planes on each feed record, at every step, the voltage between trace and plane and the current around the
            trace; from them the wave going in is a = (v + Z·i)/2 and the wave coming out b = (v − Z·i)/2{cite('OpenEMSDocs', 'Ports')}.
            After the run the Fourier transform of these records gives a and b at any frequency, and with one run per port
            S = B·A⁻¹, up to 0.816·f<sub>run</sub>, where the pulse is 40 dB down (35.4 GHz). The feed’s own propagation,
            fitted between its two planes, is taken out, so S belongs to the via’s reference plane. The TDR and TDT are made
            from that S with the same Gaussian edge as the via model’s, so the two curves lie on one plot without a conversion
            (<a href="#via-tdr">topic 11</a>).
          </p>
          {now('ports', pv && (
            <>
              f<sub>run</sub> <N k="fRun" v={b.f_run}>{ghz(b.f_run)}</N> GHz, σ <N k="sigma" v={b.sigma_p}>{ps(b.sigma_p)}</N> ps, the
              peak at <N k="t0" v={b.t_0}>{ps(b.t_0)}</N> ps, S up to <N k="fS" v={b.f_S}>{ghz(b.f_S)}</N> GHz
              {res ? <>
                {' '}(the last run’s), with the ports’ Z{' '}
                {res.records.ports.map((p, i) => (
                  <React.Fragment key={i}>{i ? (i === res.records.ports.length - 1 ? ' and ' : ', ') : ''}<N k={`z0-${i}`} v={p.z0}>{fmt(p.z0, 4)}</N></React.Fragment>
                ))}{' '}Ω from the 2D solver.
              </> : '; the ports’ Z follow from a run.'}
            </>
          ))}
          {E('fdtd-waves')}
          {E('fdtd-s')}
        </Sub>

        <Sub id="fw-cost" title={S('fw-cost')}>
          <p>
            The work is the number of cells times the number of steps: the default via is 712 320 cells × 7645 steps for each
            of its two ports, about 10.9 billion cell updates. Cells half the size would make eight times the cells and,
            through the Courant limit, twice the steps: sixteen times the work. Every cell does the same small update, which
            suits a graphics processor{cite('WikiFDTD')}: the tool runs on WebGPU in 32-bit numbers and falls back to a worker
            on the CPU. On the laptop the tool was built on, the default via’s two runs took 1.15 s on the GPU and 340 s on the
            CPU, 295 times longer; the pair (four ports) took 4.2 s and 10.1 min. 32-bit numbers are enough: their port
            signals differ from 64-bit ones by about 10⁻⁵ of the peak, far under the mesh’s own error. Before a run the
            estimate shows cells, memory, steps and time; the run first times a few dozen steps on its own grid, warns over
            5 minutes and refuses over 60 minutes or more memory than the device allows.
          </p>
          {now('cost', pv && est && (
            <>
              <N k="cells" v={est.cells}>{big(est.cells)}</N> cells × <N k="steps2" v={est.steps}>{big(est.steps)}</N> steps ×{' '}
              <N k="ports" v={pv.ports.length}>{pv.ports.length}</N> ports, <N k="updates" v={b.W_u}>{fmt(b.W_u / 1e9, 3)}</N> billion cell
              updates, about <N k="seconds" v={b.t_run}>{time(b.t_run)}</N> {pv.backend === 'webgpu' ? 'on WebGPU' : 'on the CPU'} at{' '}
              <N k="rate" v={est.rate}>{fmt(est.rate, 3)}</N> updates per second ({pv.rateFrom === 'measured' ? 'measured on this device' : 'the table’s rate'}).
            </>
          ))}
          {E('fdtd-cost')}
        </Sub>

        <Sub id="fw-read" title={S('fw-read')}>
          <p>
            The <a href="#waves" data-fw-link="player">player in the Waves section</a> shows the electric field on a slice
            through the run, about 300 frames over the run (294 frames, one every 26 steps, on the default via). The values
            are in V/m for the 1 V pulse behind the port’s resistor. |E| is the field’s strength, never negative; Ez, Ex and
            Ey are one direction each with its sign, one colour for each way. A signed component shows polarity: a reflection
            from a lower impedance comes back with the opposite sign (<a href="#via-tdr">topic 11</a>). Each slice keeps one
            colour scale for the whole run, so a bright frame is a strong field and never a weak one stretched. The scale’s top
            is the 99.9th percentile of the slice’s values over all frames, because a few cells at the copper’s edges, where
            the charge crowds (<a href="#field-solver">topic 2</a>), hold far stronger fields than the rest; those are drawn in
            the top colour.
          </p>
          {res?.snap && (
            <p className={css.now} data-waves-now="frames">
              The last run recorded <N k="frames" v={res.snap.frames}>{res.snap.frames}</N> frames, one every{' '}
              <N k="every" v={res.snap.every}>{res.snap.every}</N> steps, on {res.snap.slices.length} slices.
            </p>
          )}
          <p>
            On a via, the side view cuts through the barrel along its feeds: the pulse comes in under the entry feed, turns
            down the barrel between the planes and leaves under the exit feed, and a part of it comes back wherever the
            impedance changes. The view from above between two planes shows rings spreading from the antipads: the
            parallel-plate wave the barrel’s current launches into the cavity (<a href="#via-return">topic 9</a>). Return vias
            joined to both planes carry the return current beside the barrel; the cavity wave that gets past them runs out to
            the boundary and is lost to the signal. At 20 GHz the default via passes −2.61 dB and reflects −4.8 dB (openEMS:
            −2.70 and −4.8 dB), so about 12 % of the power comes out at neither port: the laminate takes some and the rest
            leaves the via as waves. That is where the via model’s cavity limit comes from: 20.8 GHz for the default via
            (<a href="#via-limits">topic 13</a>). The views from above at each feed, halfway down to its plane, show the field
            between each trace and its plane, as the Trace section’s field map does.
          </p>
        </Sub>

        <Sub id="fw-pair" title={S('fw-pair')}>
          <p>
            For a pair the run drives entry A and entry B in turn, and the player adds their frames: differential is A at
            +1 V and B at −1 V, common both at +1 V, so a drive costs no extra run. Adding is exact because Maxwell’s equations
            and the grid’s updates are linear: the field of two sources is the sum of their fields. In the differential drive
            the two barrels carry opposite currents, so their fields cancel at a distance and stay around the pair; from above,
            Ez has opposite signs at the two barrels. In the common drive the fields add and the wave spreads into the cavity
            towards the return vias, as from one via. So a pair driven differentially launches almost no cavity wave, and the
            via model’s limit for the LVDS pair stays near 23 GHz (<a href="#via-limits">topic 13</a>). The side view still
            goes through barrel A along its feeds, not through both barrels. The <a href="#waves" data-fw-link="drive">Drive
            choice in the Waves section</a> shows each.
          </p>
        </Sub>

        <Sub id="fw-3d" title={S('fw-3d')}>
          <p>
            The <a href="#waves" data-fw-link="3d">3D view in the Waves section</a> puts the same frames on planes inside the
            run’s own structure, played on the player’s clock, so both views always show one moment. Cutting the structure
            along the side plane shows that plane whole with the others behind it. On a trace the view from above shows the
            wave travelling along it and the view across its quasi-TEM cross-section, the Trace section’s field map in motion
            (<a href="#transmission-lines">topic 1</a>).
          </p>
        </Sub>

        <Sub id="fw-checked" title={S('fw-checked')}>
          <p>
            The engine was checked against openEMS, a separate open-source FDTD solver{cite('OpenEMSDocs')}, run on the same
            structures while the tool was built. openEMS meshes the copper as a staircase; this tool uses conformal cells. 43
            limits were set from that comparison and all held, the worst at 0.82 of its limit: the TDR within 2.5 Ω at 35 ps,
            |ΔS| within 0.10 up to 10 GHz and 0.15 up to 20 GHz, a section’s impedance and delay within 12 %, a stub’s notch
            within 8 %. On the default via the TDR peaks at 62.4 Ω (openEMS 61.9 Ω), its stubbed twin’s notch lies at
            22.9 GHz (openEMS 21.6 GHz, +6.0 %), and the LVDS pair’s line reads Zdiff 102.4 Ω (openEMS 103.4, the 2D solver
            103.4 Ω). Most of what is left is the mesh: with staircased barrels like openEMS’s, the difference in S up to
            20 GHz falls from 0.092 to 0.029 and the notch’s from +6.0 % to +1.9 %. Above 20 GHz nothing is held to a limit:
            the via resonates and radiates there, and the staircase alone moves the result a lot.
          </p>
          <p>
            The copper is a perfect conductor and the laminate’s loss is fitted at one frequency, so copper loss and the change
            of loss with frequency are left out. A run serves edges from its own rise time up; a faster edge needs a new run
            with finer cells. The player does not show the magnetic field or the currents in the copper, the waves of the exit
            ports’ drives, or the copper on the 3D planes yet.
          </p>
        </Sub>
      </Topic>
      {/* mounted only while open, so the page holds one derivation dialog besides the equation panel's */}
      {dlg && <DerivationDialog view={view} opening={dlg.n} from={dlg.from} onClosed={() => setDlg(null)} titleId="em-derive-theory-title" />}
    </div>
  );
}
