// The Theory section of the Smith chart (step M3.5b): the seven topics of docs/smith-chart/theory.md §1–7, folding,
// with the equations taken from the registry (lib/smith/equations.ts) by id and printed by its TeX printer, never
// retyped, and the numbers of the visitor's circuit from the engine (network.evaluateCircuit and nodeMetrics, parts,
// convert, geometry.partMobius). Every element that shows a live number carries data-live with a name, so the harness
// (scripts/harness/smith/ui-theory.mjs) can compare it with its own engine run. Citations are numbered through the
// page's one Bibliography, in the order this component calls them (the order of the page).

import React, { useEffect, useRef, useState } from 'react';

import { formatAmount } from '../../lib/quantity';
import { gammaFromImpedance, magFromVswr, mismatchLoss, reflectedPower, deliveredPower, returnLoss, toDegrees } from '../../lib/smith/convert';
import { EQUATION_BY_ID, TexPiece, tex, valueTex } from '../../lib/smith/equations';
import { partMobius } from '../../lib/smith/geometry';
import {
  M_ANGLE, M_GI, M_GR, M_MAG, M_ML, M_Q, M_RL, M_VSWR, M_YI, M_YR, M_ZI, M_ZR, METRIC_STRIDE, applyPart, evaluateCircuit,
  loadNode, nodeMetrics,
} from '../../lib/smith/network';
import type { Circuit } from '../../lib/smith/network';
import {
  LINE, QUARTER, SERIES_C, SERIES_L, SERIES_R, SHUNT_C, SHUNT_L, SHUNT_R, STUB_OPEN, STUB_SHORT, added, isLine, isSeries, isStub,
  turnsAt, valueFor,
} from '../../lib/smith/parts';
import { KIND_NAMES, defaultCircuit, sameCircuit } from '../../lib/smith/state';
import bibCss from '../../styles/Bibliography.module.css';
import css from '../../styles/SmithTheory.module.css';
import Bibliography from '../Bibliography';
import KatexSpan from '../KatexSpan';
import { GOAL_VSWR } from './pathLayer';
import { complexText } from './readout';
import { CirclesFigure, GammaFigure, LineFigure, MatchFigure, PlaneFigure, VswrFigure, WalksFigure } from './TheoryFigures';

/** The topics in the order of the page; the ids are the anchors (#moving-on-the-chart). */
export const TOPICS: readonly { id: string; title: string }[] = [
  { id: 'how-to-use', title: 'How to use this tool' },
  { id: 'gamma-z-y', title: 'Γ, z and y, and normalising by Z₀' },
  { id: 'reading-the-chart', title: 'Reading the chart' },
  { id: 'moving-on-the-chart', title: 'Moving on the chart' },
  { id: 'transmission-lines', title: 'Transmission lines' },
  { id: 'how-good-is-a-match', title: 'How good is a match' },
  { id: 'matching-with-two-parts', title: 'Matching with two parts' },
];
const TOPIC_IDS = new Set(TOPICS.map((t) => t.id));

const E = 'Ellingson2018', S2 = 'SteerVol2', S3 = 'SteerVol3', W = 'WikiSmith', M = 'WikiMobius';
const TAU = 2 * Math.PI;
const PHONE = '(max-width: 720px)';

// The texts of live numbers: four significant digits with their zeros, as the readout and the node table.
const num = (v: number): string => formatAmount(v, '', 4, true);
const amt = (v: number, unit: string): string => formatAmount(v, unit, 4, true);
const cx = (re: number, im: number, unit = ''): string => complexText(re, im, unit);
const fin = (...v: number[]): boolean => v.every((n) => Number.isFinite(n));
/** A live value for the TeX printer, or undefined (the symbol stays) when it is not a finite number. */
const tv = (re: number, im = 0, unit = ''): TexPiece | undefined => (fin(re, im) ? valueTex(re, im, unit) : undefined);
type Values = Readonly<Record<string, TexPiece | undefined>>;

/** What a part's value is shown as: ohms, henries, farads, wavelengths at f0, or Zt for a λ/4 transformer. */
function valueText(kind: number, value: number): string {
  switch (kind) {
    case SERIES_R: case SHUNT_R: case QUARTER: return amt(value, 'Ω');
    case SERIES_L: case SHUNT_L: return amt(value, 'H');
    case SERIES_C: case SHUNT_C: return amt(value, 'F');
    default: return `${num(value)} λ`;
  }
}

/** The impedance a line or stub's circle is measured against: Zc, or Zt for a λ/4 transformer. */
const zcOf = (c: Circuit, i: number): number => (c.parts[i].kind === QUARTER ? c.parts[i].value : c.parts[i].zc ?? c.z0);

// The start circuit (D16), evaluated once: the worked example of "Matching with two parts".
const START = defaultCircuit();
const START_M = evaluateCircuit(START).metrics;
const sm = (k: number, slot: number): number => START_M[k * METRIC_STRIDE + slot];
const START_W = TAU * START.f0;
const START_C = START.parts[0].value, START_L = START.parts[1].value;
const START_SHUNT_C = valueFor(SHUNT_C, 1, 0, START.f0, START.f0, START.z0);

// The goal circle of the tool.
const GOAL_MAG = magFromVswr(GOAL_VSWR);
const VSWR_ROWS = [1.5, 2, 3].map((v) => ({ vswr: v, mag: magFromVswr(v), label: `${v}` }));

function Eq({ id, values, note }: { id: string; values?: Values; note?: string }) {
  const eq = EQUATION_BY_ID.get(id);
  if (!eq) throw new Error(`Unknown equation "${id}" in the Smith chart's theory.`);
  const live = values && tex(eq.tree, { value: (name) => values[name] });
  return (
    <div className={css.eq} data-eq={id}>
      <KatexSpan text={`\\displaystyle ${tex(eq.tree)}`} />
      {live && <KatexSpan className={css.eqLive} data-eq-live={id} text={`\\displaystyle ${live}`} />}
      <span className={css.eqTitle}>{eq.title}{note ? ` · ${note}` : ''}</span>
    </div>
  );
}

const Z0 = <>Z<sub>0</sub></>;
const F0 = <>f<sub>0</sub></>;
const Gr = <>Γ<sub>r</sub></>;
const Gi = <>Γ<sub>i</sub></>;

interface Props { bib: Bibliography; circuit: Circuit }

function Theory({ bib, circuit: c }: Props) {
  // Which topics are folded. Open on a wide screen; on a phone folded, except the one a link points at.
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  useEffect(() => {
    const target = decodeURIComponent(window.location.hash.slice(1));
    if (window.matchMedia(PHONE).matches) {
      setClosed(Object.fromEntries(TOPICS.map(({ id }) => [id, id !== target])));
      // The browser scrolled to the target while every topic was open; folding the ones above moves it.
      if (TOPIC_IDS.has(target)) refold.current = target;
    }
    // A #link to a topic (from the contents, the page or another page) opens it.
    const open = () => {
      const id = decodeURIComponent(window.location.hash.slice(1));
      if (TOPIC_IDS.has(id)) setClosed((was) => (was[id] ? { ...was, [id]: false } : was));
    };
    window.addEventListener('hashchange', open);
    return () => window.removeEventListener('hashchange', open);
  }, []);
  const refold = useRef('');
  useEffect(() => {
    // After the render that folded the topics (not on the first one, which still has them all open).
    if (!refold.current || closed[refold.current] !== false) return;
    document.getElementById(refold.current)?.scrollIntoView();
    refold.current = '';
  }, [closed]);
  const setAll = (value: boolean) => setClosed(Object.fromEntries(TOPICS.map(({ id }) => [id, value])));

  // Citations: "[n, §x]", linked to the entry; numbered by the page's Bibliography in the order they are made here.
  const cite = (...refs: [string, string][]) => (
    <span className={css.cites}>
      {' '}
      {refs.map(([key, at], i) => (
        <React.Fragment key={i}>{i > 0 && ', '}<a className={bibCss.cite} href={`#ref-${key}`} data-cite={key}>[{bib.number(key)}, {at}]</a></React.Fragment>
      ))}
    </span>
  );
  const L = (key: string, text: string) => <span className={css.n} data-live={key}>{text}</span>;

  // ---- The engine's numbers for the circuit ----
  const { metrics } = evaluateCircuit(c);
  const n = c.parts.length;
  const m = (k: number, slot: number): number => metrics[k * METRIC_STRIDE + slot];
  const z0 = c.z0, f0 = c.f0, w = TAU * f0;
  const zr = m(0, M_ZR), zi = m(0, M_ZI), yr = m(0, M_YR), yi = m(0, M_YI), gr = m(0, M_GR), gi = m(0, M_GI);
  const start = sameCircuit(c, START);
  const head = (what: string) => <div className={css.liveHead}>{start ? 'Start circuit' : 'Your circuit'}<span>{what}</span></div>;

  const loadValues: Values = {
    Z_0: tv(z0, 0, 'Ω'), Z: tv(zr * z0, zi * z0, 'Ω'), Y: tv(yr / z0, yi / z0, 'S'), z: tv(zr, zi), y: tv(yr, yi),
    r: tv(zr), x: tv(zi), g: tv(yr), b: tv(yi), Gamma: tv(gr, gi), Gamma_r: tv(gr), Gamma_i: tv(gi),
    VSWR: tv(m(0, M_VSWR)), RL: tv(m(0, M_RL), 0, 'dB'), ML: tv(m(0, M_ML), 0, 'dB'), Q: tv(m(0, M_Q)),
    Z_max: tv(z0 * m(0, M_VSWR), 0, 'Ω'), Z_min: tv(z0 / m(0, M_VSWR), 0, 'Ω'),
  };

  // Topic 4: per part, what it keeps and what it changes (nodes i and i + 1), and which way it turns the point.
  const walks = c.parts.map((p, i) => {
    const a = added(p.kind, p.value, p.zc ?? z0, f0, f0, z0);
    const turn = a > 0 ? 'clockwise' : a < 0 ? 'counter-clockwise' : 'not at all';
    switch (p.kind) {
      case SERIES_L: case SERIES_C:
        return { keeps: 'r', kept: num(m(i, M_ZR)), what: 'x', from: num(m(i, M_ZI)), to: num(m(i + 1, M_ZI)), sense: turn };
      case SERIES_R:
        return { keeps: 'x', kept: num(m(i, M_ZI)), what: 'r', from: num(m(i, M_ZR)), to: num(m(i + 1, M_ZR)), sense: 'towards Γ = +1' };
      case SHUNT_R:
        return { keeps: 'b', kept: num(m(i, M_YI)), what: 'g', from: num(m(i, M_YR)), to: num(m(i + 1, M_YR)), sense: 'towards Γ = −1' };
      case SHUNT_L: case SHUNT_C: case STUB_OPEN: case STUB_SHORT:
        return { keeps: 'g', kept: num(m(i, M_YR)), what: 'b', from: num(m(i, M_YI)), to: num(m(i + 1, M_YI)), sense: turn };
      default: {
        // A line or λ/4: |Γ| measured against its own impedance stays.
        const zc = zcOf(c, i), o = new Float64Array(2);
        gammaFromImpedance(o, 0, m(i, M_ZR) * z0, m(i, M_ZI) * z0, zc);
        const mag = fin(o[0], o[1]) ? Math.hypot(o[0], o[1]) : 1;
        return {
          keeps: '|Γ|', kept: num(mag), zc: amt(zc, 'Ω'), what: 'Γ', from: cx(m(i, M_GR), m(i, M_GI)), to: cx(m(i + 1, M_GR), m(i + 1, M_GI)),
          sense: 'clockwise',
        };
      }
    }
  });
  // The first part of each lumped kind, for the equations with live numbers.
  const firstOf = (kind: number) => c.parts.findIndex((p) => p.kind === kind);
  const lumpedValues = (kind: number): Values | undefined => {
    const i = firstOf(kind);
    if (i < 0) return undefined;
    const v = c.parts[i].value, a = added(kind, v, 0, f0, f0, z0);
    const base: Record<string, TexPiece | undefined> = { Z_0: tv(z0, 0, 'Ω'), omega: tv(w, 0, 'rad/s') };
    if (kind === SERIES_R) return { ...base, r: tv(a), R: tv(v, 0, 'Ω') };
    if (kind === SHUNT_R) return { ...base, g: tv(a), R: tv(v, 0, 'Ω') };
    if (kind === SERIES_L) return { ...base, x: tv(a), X: tv(a * z0, 0, 'Ω'), L: tv(v, 0, 'H') };
    if (kind === SERIES_C) return { ...base, x: tv(a), X: tv(a * z0, 0, 'Ω'), C: tv(v, 0, 'F') };
    if (kind === SHUNT_L) return { ...base, b: tv(a), B: tv(a / z0, 0, 'S'), L: tv(v, 0, 'H') };
    return { ...base, b: tv(a), B: tv(a / z0, 0, 'S'), C: tv(v, 0, 'F') };
  };
  const partNote = (kind: number) => { const i = firstOf(kind); return i < 0 ? undefined : `below: part ${i + 1}`; };
  const firstSeries = c.parts.findIndex((p) => isSeries(p.kind));
  const firstShunt = c.parts.findIndex((p) => p.kind >= SHUNT_R && p.kind <= SHUNT_C);
  const seriesAdds: Values | undefined = firstSeries < 0 ? undefined : (() => {
    const p = c.parts[firstSeries], a = added(p.kind, p.value, 0, f0, f0, z0);
    return { z_L: tv(m(firstSeries, M_ZR), m(firstSeries, M_ZI)), z_in: tv(m(firstSeries + 1, M_ZR), m(firstSeries + 1, M_ZI)), z_s: p.kind === SERIES_R ? tv(a) : tv(0, a) };
  })();
  const shuntAdds: Values | undefined = firstShunt < 0 ? undefined : (() => {
    const p = c.parts[firstShunt], a = added(p.kind, p.value, 0, f0, f0, z0);
    return { y_L: tv(m(firstShunt, M_YR), m(firstShunt, M_YI)), y_in: tv(m(firstShunt + 1, M_YR), m(firstShunt + 1, M_YI)), y_p: p.kind === SHUNT_R ? tv(a) : tv(0, a) };
  })();
  const mobiusValues: Values | undefined = n === 0 ? undefined : (() => {
    const p = c.parts[0], q = new Float64Array(8);
    partMobius(q, 0, p.kind, p.value, p.zc ?? z0, f0, f0, z0);
    return {
      a: tv(q[0], q[1]), b: tv(q[2], q[3]), c: tv(q[4], q[5]), d: tv(q[6], q[7]),
      Gamma_L: tv(m(0, M_GR), m(0, M_GI)), Gamma_in: tv(m(1, M_GR), m(1, M_GI)),
    };
  })();

  // Topic 5: the first line, stub or λ/4 of the circuit, and a λ/8 line of Z0 on the load as the example.
  const li = c.parts.findIndex((p) => isLine(p.kind) || isStub(p.kind));
  const eg = new Float64Array(8), egm = new Float64Array(METRIC_STRIDE);
  loadNode(eg, 4, c.loadR, c.loadX, z0);
  applyPart(eg, 4, LINE, 0.125, z0, f0, f0, z0);
  nodeMetrics(egm, 0, eg, 1);
  const egValues: Values = { Gamma_L: tv(gr, gi), Gamma_in: tv(egm[M_GR], egm[M_GI]), theta: tv(Math.PI / 4) };
  const zt = Math.sqrt(z0 * c.loadR);

  // Topic 6: the figures of a node.
  const matchRows = (k: number, key: string) => {
    const mag = m(k, M_MAG), s = m(k, M_VSWR);
    return [
      ['|Γ|', L(`m-${key}-mag`, num(mag))],
      ['VSWR', L(`m-${key}-vswr`, num(s))],
      ['Return loss', L(`m-${key}-rl`, amt(m(k, M_RL), 'dB'))],
      ['Mismatch loss', L(`m-${key}-ml`, amt(m(k, M_ML), 'dB'))],
      ['Power reflected', <>{L(`m-${key}-ref`, num(reflectedPower(mag) * 100))} %</>],
      ['Power delivered', <>{L(`m-${key}-del`, num(deliveredPower(mag) * 100))} %</>],
      [<>Z<sub>max</sub> = Z<sub>0</sub>·VSWR</>, L(`m-${key}-zmax`, amt(z0 * s, 'Ω'))],
      [<>Z<sub>min</sub> = Z<sub>0</sub>/VSWR</>, L(`m-${key}-zmin`, amt(z0 / s, 'Ω'))],
    ] as [React.ReactNode, React.ReactNode][];
  };
  const loadRows = matchRows(0, 'load'), inputRows = matchRows(n, 'input');

  let number = 0;
  const topic = (id: string, children: React.ReactNode) => {
    const entry = TOPICS.find((t) => t.id === id);
    number += 1;
    return (
      <details key={id} id={id} className={css.topic} open={!closed[id]} data-topic={id}
        onToggle={(event) => { const open = event.currentTarget.open; setClosed((was) => (!was[id] === open ? was : { ...was, [id]: !open })); }}>
        <summary><span className={css.topicNo}>{number}</span><h3>{entry.title}</h3><span className={css.chevron} aria-hidden="true" /></summary>
        <div className={css.body}>{children}</div>
      </details>
    );
  };
  const jump = (id: string, text: string) => (
    <a href={`#${id}`} className={css.jump} onClick={() => setClosed((was) => ({ ...was, [id]: false }))}>{text}</a>
  );

  return (
    <div className={css.theory} data-theory="">
      <p className={css.lead}>
        What the chart shows and why the parts move the point the way they do. The boxes marked <i>Your circuit</i> follow
        the circuit above as you change it. Everything here assumes ideal parts, lossless lines and a real reference
        impedance Z<sub>0</sub>, at the one frequency f<sub>0</sub>. Numbers in brackets lead to
        the <a href="#references" className={css.jump}>sources</a>.
      </p>
      <ol className={css.contents}>
        {TOPICS.map(({ id, title }) => (
          <li key={id}><a href={`#${id}`} onClick={() => setClosed((was) => ({ ...was, [id]: false }))}>{title}</a></li>
        ))}
      </ol>
      <div className={css.tools}>
        <button type="button" className={css.fold} onClick={() => setAll(false)} data-open-all="">Open all</button>
        <button type="button" className={css.fold} onClick={() => setAll(true)} data-fold-all="">Fold all</button>
      </div>

      {topic('how-to-use', (
        <>
          <p>
            The page opens on a worked example: a load of 25 + j25 Ω on a 50 Ω reference at 100 MHz, brought to the centre
            of the chart by a series capacitor and a shunt inductor. Change it, or press Start over to come back to it.
          </p>
          <ol className={css.steps}>
            <li><b>Say what you have.</b> Type the load’s R and X in ohms, the reference impedance {Z0} (often 50 Ω) and the
              frequency {F0} you design for. The load appears as a point on the chart, marked L.</li>
            <li><b>Build.</b> Add a part with Add: pick its kind and where it goes. Or press Draw and drag out of the input (In)
              on the chart: the part is added at the source end and follows your pointer. The strip shows the circuit the
              textbook way, source left and load right; the path on the chart runs the other way, from the load towards the
              source, because each part changes what the parts before it look like from the source side.</li>
            <li><b>Drag.</b> Each part draws an arc that starts at the point before it and ends at a ring. Drag the ring and the
              part’s value follows. Type a value in the part’s card when you know it exactly. Undo and Redo step through
              every change.</li>
            <li><b>Read.</b> Hover over or tap any place on the chart and the readout gives z, Z, y, Y, Γ, the VSWR and the
              return loss there. The node table gives the same for every node of the path, from the load to the input.</li>
          </ol>
          <p>
            The usual aim is to bring the input to the centre. There Γ = 0: nothing is reflected and all the power the
            source sends reaches the load{cite([E, '§3.20'])}. The dashed circle around the centre is the tool’s “close
            enough” (VSWR {num(GOAL_VSWR)}).
          </p>
          <div className={css.live}>
            {head('the input')}
            <p>The input is now at |Γ| = {L('input-mag', num(m(n, M_MAG)))}.</p>
          </div>
        </>
      ))}

      {topic('gamma-z-y', (
        <>
          <p>
            The chart never shows ohms. It shows ratios to one reference impedance {Z0}, the impedance of the system the
            circuit sits in. The normalised impedance is z = Z/{Z0} = r + jx, and the normalised admittance is its inverse,
            y = 1/z = Y·{Z0} = g + jb{cite([W, '“Normalization”'])}. Normalising is what makes one drawing serve every
            system: the circle marked r = 1 is 50 Ω on a 50 Ω chart and 75 Ω on a 75 Ω chart.
          </p>
          <Eq id="z-norm" values={loadValues} note="below: your load" />
          <Eq id="y-norm" values={loadValues} />
          <p>
            What the chart plots is Γ, the reflection coefficient: the reflected voltage wave at a point divided by the
            incident one{cite([E, '§3.12'])}. It follows from z alone, Γ = (z − 1)/(z + 1){cite([E, '§3.12'])}, and z
            follows back from Γ{cite([S2, '§2.3'])}. Three points are worth knowing by heart: a load equal to {Z0} gives
            Γ = 0, the centre; an open circuit gives Γ = +1, the right-hand edge; a short gives Γ = −1, the left-hand
            edge{cite([E, '§3.12'])}. A passive load has |Γ| ≤ 1, so every passive load lies on or inside the
            rim{cite([E, '§3.12'])}. (Γ is the reflection coefficient of the voltage; that of the current is
            −Γ{cite([E, '§3.12'])}.)
          </p>
          <Eq id="gamma-z" values={loadValues} />
          <Eq id="z-gamma" />
          <p>
            So a point on the chart <i>is</i> a value of Γ, and the grid printed over it lets you read that point’s z without
            computing anything{cite([S3, '§3.4'])}. The readout gives Γ two ways: polar (|Γ| and its angle, how far out and
            which way round) and Cartesian ({Gr} + j{Gi}, the point’s coordinates across and up).
          </p>
          <p>
            Admittance needs no second plot. The same point has y = (1 − Γ)/(1 + Γ){cite([W, '“Admittance chart”'])}, which
            is the z formula applied to −Γ: the y of a point is read like the z of the point opposite it through the centre.
            That is why an admittance grid is the impedance grid turned half a turn about the centre; the point stays where it
            is, only the grid changes{cite([S3, '§3.4'])}.
          </p>
          <Eq id="gamma-y" />
          <Eq id="y-gamma" values={loadValues} />
          <div className={css.liveRow}>
            <div className={css.live}>
              {head('the load (node 0)')}
              <p>Z = {L('load-Z', cx(zr * z0, zi * z0, 'Ω'))}</p>
              <p>z = {L('load-z', cx(zr, zi))}</p>
              <p>y = {L('load-y', cx(yr, yi))}</p>
              <p>Γ = {L('load-gamma', cx(gr, gi))}</p>
              <p>Γ = {L('load-gamma-polar', `${num(m(0, M_MAG))} ∠ ${num(toDegrees(m(0, M_ANGLE)))}°`)}</p>
            </div>
            <GammaFigure gr={gr} gi={gi} />
          </div>
        </>
      ))}

      {topic('reading-the-chart', (
        <>
          <p>The grid is two families of circles for z and two for y.</p>
          <ul>
            <li><b>Constant r.</b> All points with the same resistance r lie on one circle, centred on the real axis, with
              centre r/(1 + r) and radius 1/(1 + r). Every one of them touches the right-hand edge at Γ = +1; r = 0 is the
              rim itself, and r = 1 passes through the centre.</li>
            <li><b>Constant x.</b> Points of the same reactance x lie on a circle centred at (1, 1/x) with radius 1/|x|, of
              which only an arc falls inside the chart; these too all pass through Γ = +1. The centre’s height 1/x is a real
              number: a common slip in the derivation is to write ({Gi} − i/x)², where ({Gi} − 1/x)² is right. The real axis
              is x = 0, pure resistance. The upper half is inductive (x &gt; 0), the lower half capacitive
              (x &lt; 0){cite([S3, '§3.4'])}.</li>
            <li><b>Constant g and b.</b> The admittance grid is the same picture mirrored left to right: g circles have their
              centre at −g/(1 + g) and radius 1/(1 + g), b circles their centre at (−1, −1/b) and radius 1/|b|, and all of
              them pass through Γ = −1. Read as admittance, the upper half has b &lt; 0, which is still inductive: an
              inductor’s susceptance is negative{cite([S3, '§3.4'])}.</li>
          </ul>
          <Eq id="gamma-parts-z" />
          <Eq id="r-gamma" />
          <Eq id="x-gamma" />
          <Eq id="circle-r" values={loadValues} note="below: through your load" />
          <Eq id="circle-x" values={loadValues} />
          <Eq id="gamma-parts-y" />
          <Eq id="g-gamma" />
          <Eq id="b-gamma" />
          <Eq id="circle-g" values={loadValues} />
          <Eq id="circle-b" values={loadValues} />
          <p>
            The circle equations are not taken on trust: each comes from writing r, x, g or b in terms of {Gr} and {Gi} and
            completing the square (the derivations come with the equation panel).
          </p>
          <div className={css.liveRow}>
            <div className={css.live}>
              {head('the four circles through the load')}
              <p>r = {L('load-r', num(zr))}: centre {L('r-centre', num(zr / (1 + zr)))}, radius {L('r-radius', num(1 / (1 + zr)))}</p>
              <p>x = {L('load-x', num(zi))}: centre (1, {L('x-centre', num(1 / zi))}), radius {L('x-radius', num(1 / Math.abs(zi)))}{zi === 0 ? ' (the real axis)' : ''}</p>
              <p>g = {L('load-g', num(yr))}: centre {L('g-centre', num(-yr / (1 + yr)))}, radius {L('g-radius', num(1 / (1 + yr)))}</p>
              <p>b = {L('load-b', num(yi))}: centre (−1, {L('b-centre', num(-1 / yi))}), radius {L('b-radius', num(1 / Math.abs(yi)))}{yi === 0 ? ' (the real axis)' : ''}</p>
              <p>All four pass through {Gr} + j{Gi} = {L('load-gamma', cx(gr, gi))}.</p>
            </div>
            <CirclesFigure r={zr} x={zi} g={yr} b={yi} gr={gr} gi={gi} />
          </div>
          <p>
            <b>Z, Y and ZY.</b> Z draws the r and x circles, Y the g and b circles, ZY both. The point is the same in all three;
            only what you read off it changes{cite([S3, '§3.4'])}. ZY, the combined chart, is the one to use when a circuit
            mixes series and shunt parts, because series parts move along the impedance grid and shunt parts along the
            admittance grid (see {jump('moving-on-the-chart', 'Moving on the chart')}). Older practice read admittance by
            turning the point half a turn on an impedance chart; that is not used now{cite([S3, '§3.4'])}, and this tool
            never moves the point.
          </p>
          <p>
            <b>The scales on the rim.</b> One scale gives the angle of Γ in degrees. Two more count wavelengths “towards the
            generator” (clockwise) and “towards the load” (counter-clockwise), from 0 at the short circuit to 0.5 for a full
            turn{cite([S3, '§3.4'])}. A full turn is half a wavelength because the angle of Γ changes by twice the electrical
            length of a line (see {jump('transmission-lines', 'Transmission lines')}){cite([S3, '§3.4'])}.
          </p>
          <p><b>Zooming.</b> Close to the centre the circles crowd together; zoom in and the grid fills in finer values.</p>
        </>
      ))}

      {topic('moving-on-the-chart', (
        <>
          <p>
            Every part does one simple thing to the point, and each simple thing is a walk along one of the chart’s circles.
            Learn the four walks and you can read any matching circuit off the chart.
          </p>
          <p>
            <b>Series parts add to z.</b> A part in series adds its own impedance to what it sees: z<sub>in</sub> =
            z<sub>L</sub> + z<sub>s</sub>{cite([S3, '§2.2.6'])}. An inductor or a capacitor in series adds only reactance, so
            r does not change and the point slides along its constant-r circle. An inductor adds x = ωL/{Z0}, which is
            positive; a capacitor adds x = −1/(ωC{Z0}), which is negative{cite([W, '“Circuit elements and topology”'])}. A
            series resistor adds only r: the point slides along its constant-x arc, towards the open circuit at Γ = +1 as R
            grows.
          </p>
          <Eq id="series-adds-z" values={seriesAdds} note={firstSeries < 0 ? undefined : `below: part ${firstSeries + 1}`} />
          <Eq id="x-series-l" values={lumpedValues(SERIES_L)} note={partNote(SERIES_L)} />
          <Eq id="x-series-c" values={lumpedValues(SERIES_C)} note={partNote(SERIES_C)} />
          <Eq id="r-series" values={lumpedValues(SERIES_R)} note={partNote(SERIES_R)} />
          <Eq id="circle-r" />
          <p>
            <b>Shunt parts add to y.</b> A part in shunt adds its admittance: y<sub>in</sub> = y<sub>L</sub> +
            y<sub>p</sub>{cite([S3, '§2.2.6'])}. A capacitor adds b = ωC{Z0}, positive; an inductor adds b = −{Z0}/(ωL),
            negative{cite([W, '“Circuit elements and topology”'])}. g does not change, so the point slides along its
            constant-g circle. A shunt resistor adds only g: the point slides along its constant-b arc, towards the short at
            Γ = −1 as R falls. Open and shorted stubs are shunt parts too: they add susceptance and move along g circles.
          </p>
          <Eq id="shunt-adds-y" values={shuntAdds} note={firstShunt < 0 ? undefined : `below: part ${firstShunt + 1}`} />
          <Eq id="b-shunt-c" values={lumpedValues(SHUNT_C)} note={partNote(SHUNT_C)} />
          <Eq id="b-shunt-l" values={lumpedValues(SHUNT_L)} note={partNote(SHUNT_L)} />
          <Eq id="g-shunt" values={lumpedValues(SHUNT_R)} note={partNote(SHUNT_R)} />
          <Eq id="circle-g" />
          <p>
            <b>Which way round.</b> Every r circle runs from Γ = +1 round to the point on the real axis where x = 0. As x
            grows from 0, the point leaves the real axis upwards, so adding inductance in series turns the point <b>clockwise</b> round
            its r circle, and adding capacitance in series turns it <b>counter-clockwise</b>. Every g circle runs from Γ = −1
            round to the point on the real axis where b = 0; as b grows from 0 the point leaves it downwards, so a shunt
            capacitor turns the point <b>clockwise</b> round its g circle and a shunt inductor <b>counter-clockwise</b>. The
            textbooks give the signs (a series inductor moves the point up along constant r{cite([S3, '§3.4'])}, a shunt
            capacitor raises b along constant g{cite([S3, '§6.7'])}); the turning sense follows from the circle equations.
          </p>
          <p>
            A shorter way to hold it: inductors move the point towards the upper half, capacitors towards the lower half,
            whether they sit in series or in shunt. Both follow from the upper half being inductive for z and for y alike.
          </p>
          <p>
            A line turns the point about the centre of its own chart, <b>clockwise</b> as it gets longer: the direction the
            rim’s scale calls “towards the generator”{cite([S3, '§3.4, §3.5'])}. (The details are
            in {jump('transmission-lines', 'Transmission lines')}.)
          </p>
          <div className={css.tableWrap}>
            <table className={css.table}>
              <thead><tr><th>Part</th><th>Keeps</th><th>Moves along</th><th>Arc from “no effect”</th></tr></thead>
              <tbody>
                <tr><th>Series L</th><td>r</td><td>its r circle</td><td>clockwise, upwards</td></tr>
                <tr><th>Series C</th><td>r</td><td>its r circle</td><td>counter-clockwise, downwards</td></tr>
                <tr><th>Series R</th><td>x</td><td>its x arc</td><td>towards Γ = +1</td></tr>
                <tr><th>Shunt C, open stub (short)</th><td>g</td><td>its g circle</td><td>clockwise, downwards</td></tr>
                <tr><th>Shunt L, shorted stub (short)</th><td>g</td><td>its g circle</td><td>counter-clockwise, upwards</td></tr>
                <tr><th>Shunt R</th><td>b</td><td>its b arc</td><td>towards Γ = −1</td></tr>
                <tr><th>Line of {Z0}</th><td>|Γ|</td><td>a circle about the centre</td><td>clockwise</td></tr>
              </tbody>
            </table>
          </div>
          <p className={css.small}>
            (“Short” stubs: shorter than λ/4; past that, a stub’s susceptance changes sign and the arc carries on round the
            same g circle.)
          </p>
          <div className={css.figs}>
            <PlaneFigure />
            <WalksFigure />
          </div>
          <div className={css.live}>
            {head('what each part keeps and changes, from the load')}
            {n === 0 ? <p>No parts: the chart shows the load alone.</p> : walks.map((s, i) => (
              <p key={i} data-walk={i}>
                {i + 1} · {KIND_NAMES[c.parts[i].kind]} keeps {s.keeps} = {L(`part-${i}-kept`, s.kept)}
                {s.zc && <> (against Z<sub>c</sub> = {L(`part-${i}-zc`, s.zc)})</>}, {s.what} from {L(`part-${i}-from`, s.from)} to{' '}
                {L(`part-${i}-to`, s.to)}, {L(`part-${i}-sense`, s.sense)}
              </p>
            ))}
          </div>
          <p>
            <b>Why every arc is a circle.</b> Picture z on its own plane, r across and x up. A series reactance moves z along a
            straight vertical line, r fixed. The chart does not plot z but Γ = (z − 1)/(z + 1), a fraction with a
            first-degree expression above and below. Maps of that shape, (az + b)/(cz + d), are called Möbius
            transformations, and they take every straight line and every circle to a straight line or a
            circle{cite([M, '“Elementary properties”'])}. So the straight line “r fixed” lands on the chart as the r circle;
            completing the square in the r circle’s equation shows the same thing directly.
          </p>
          <Eq id="gamma-z" />
          <p>
            The same holds for every ideal part. With its value fixed, a part turns the impedance it sees into one of the same
            shape, (A·Z + B)/(C·Z + D), with A, B, C, D from its two-port (ABCD) matrix. Going from Γ to Z and back are maps of
            that shape too, and such maps chained one after another are again of that shape{cite([M, '“Definition”'])}; so
            every ideal part maps the point by Γ′ = (aΓ + b)/(cΓ + d). Turn the part’s value and the point it would reach moves
            along a straight line in the right plane (x for series parts, b for shunt parts) or round a circle (Γ of a line,
            about its own centre), and the chart shows that path as a circle. A line whose impedance is not {Z0} still draws a
            circle, centred on the real axis but not at the centre{cite([S3, '§3.5'])}. This is why the tool can draw every
            part’s path as an exact arc and why a drag can follow it exactly.
          </p>
          <Eq id="abcd-zin" />
          <Eq id="mobius" values={mobiusValues} note={n ? 'below: part 1 on your load (a, b, c, d up to a common factor)' : undefined} />
          <Eq id="line-rotation" />
          <p>
            <b>Why an arc starts where the part does nothing.</b> Each arc starts at the value where the part has no effect at
            all, and ends at the value it has. For a series inductor that is 0 H, for a series capacitor an infinite
            capacitance (a plain wire), for a shunt inductor an infinite inductance and for a shunt capacitor 0 F (both an
            open), for a series resistor 0 Ω, for a shunt resistor an infinite resistance, and for a line or stub a length
            that adds nothing (zero length; for an open stub zero length, for a shorted stub λ/4). So an arc begins exactly on
            the point before the part and ends on the point after it, and its length on the chart is how much the part does: a
            long arc is a part doing a lot, a tiny one a part you might leave out. It also tells you something about values:
            a series capacitor moves the point less as it grows (x = −1/(ωC{Z0}) runs up to 0), so the long arcs come from the
            small capacitors. In general, making an L or a C larger always turns its point clockwise, in series or in shunt.
          </p>
        </>
      ))}

      {topic('transmission-lines', (
        <>
          <p>
            A line is a part you set by its length rather than by a value of L or C. Its electrical length is θ = βℓ = 2πℓ/λ,
            in radians, at the frequency {F0}{cite([E, '§3.15'])}. The tool takes it as ℓ in wavelengths or θ in degrees
            at {F0}.
          </p>
          <Eq id="line-theta" />
          <Eq id="beta" />
          <p>
            <b>Rotation.</b> On a lossless line whose impedance is {Z0}, the reflection coefficient a length ℓ from the load is
            the load’s turned by −2θ: Γ<sub>in</sub> = Γ<sub>L</sub>·e<sup>−j2θ</sup>{cite([S2, '§2.3'])}. Its size does not
            change, so the point walks round a circle about the centre, and a falling angle means <b>clockwise</b> as you move
            from the load towards the generator{cite([S3, '§3.4, §3.5'])}. The same result in impedances is the
            input-impedance formula of a line{cite([E, '§3.15'])}.
          </p>
          <Eq id="line-rotation" values={egValues} note="below: λ/8 on your load" />
          <Eq id="line-zin" />
          <p>
            <b>Half a wavelength is a full turn.</b> θ = π at ℓ = λ/2, and 2θ = 2π brings Γ back to where it started: a λ/2
            line shows the load’s own impedance{cite([E, '§3.15'])}. That is why the rim counts 0 to 0.5 wavelengths per turn.
            At ℓ = λ/8 the point turns a quarter turn: your load {L('eg-z-l', cx(zr, zi))} becomes{' '}
            {L('eg-z-in', cx(egm[M_ZR], egm[M_ZI]))}.
          </p>
          <div className={css.liveRow}>
            <div className={css.live}>
              {head(li < 0 ? 'no line in the circuit: a λ/8 line of Z₀ on the load' : `part ${li + 1}, the first line or stub`)}
              <p>λ/8 of {Z0} on the load: Γ<sub>L</sub> = {L('eg-gamma-l', cx(gr, gi))} → Γ<sub>in</sub> = {L('eg-gamma-in', cx(egm[M_GR], egm[M_GI]))}, z<sub>in</sub> = {L('eg-z-in', cx(egm[M_ZR], egm[M_ZI]))}</p>
              {li >= 0 && (
                <>
                  <p>Part {L('line-part', String(li + 1))}, {KIND_NAMES[c.parts[li].kind]}: θ = {L('line-theta', num(turnsAt(c.parts[li].kind, c.parts[li].value, f0, f0) * 360))}° at {F0}, Z<sub>c</sub> = {L('line-zc', amt(zcOf(c, li), 'Ω'))}</p>
                  <p>Γ from {L('line-before', cx(m(li, M_GR), m(li, M_GI)))} to {L('line-after', cx(m(li + 1, M_GR), m(li + 1, M_GI)))}</p>
                  {isStub(c.parts[li].kind) && <p>The stub adds b = {L('line-b', num(added(c.parts[li].kind, c.parts[li].value, zcOf(c, li), f0, f0, z0)))}</p>}
                </>
              )}
            </div>
            <LineFigure gr={gr} gi={gi} gr2={egm[M_GR]} gi2={egm[M_GI]} />
          </div>
          <p>
            <b>A line of another impedance.</b> When the line’s impedance Z<sub>c</sub> is not {Z0}, the line keeps the size of
            the reflection measured against Z<sub>c</sub>, not against {Z0}, so the point circles round Z<sub>c</sub>’s point
            instead of the centre. Seen on the {Z0} chart that is still a circle, with its centre on the real axis (not on
            Z<sub>c</sub>’s point), and the tool draws it exactly{cite([S3, '§3.5'])}.
          </p>
          <Eq id="line-circle-b" />
          <Eq id="line-circle-centre" />
          <Eq id="line-circle-radius" />
          <p>
            <b>The λ/4 transformer.</b> A line a quarter wavelength long takes the point half a turn round its own circle:
            Z<sub>in</sub> = Z<sub>t</sub>²/Z<sub>L</sub>{cite([E, '§3.19'])}. To match a resistive load R<sub>L</sub> to {Z0},
            choose Z<sub>t</sub> = √({Z0}·R<sub>L</sub>){cite([E, '§3.19'])}: your load’s R<sub>L</sub> = {L('qw-rl', amt(c.loadR, 'Ω'))} on{' '}
            {Z0} = {L('qw-z0', amt(z0, 'Ω'))} needs Z<sub>t</sub> = {L('qw-zt', amt(zt, 'Ω'))}
            {c.loadX !== 0 ? <> (but your load is not resistive: see below)</> : null}. It is exact only where the line is λ/4
            long (or λ/4 plus a multiple of λ/2), so at {F0}{cite([E, '§3.19'], [S2, '§2.4'])}. A load with reactance, like
            the start circuit’s, must first be made resistive: by a part that cancels the reactance, or by a length of line
            that turns the point onto the real axis.
          </p>
          <Eq id="quarter-wave" />
          <Eq id="quarter-wave-match" values={{ Z_t: tv(zt, 0, 'Ω'), Z_0: tv(z0, 0, 'Ω'), R_L: tv(c.loadR, 0, 'Ω') }} />
          <p>
            <b>Stubs.</b> A stub is a piece of line ending in a short or an open, put in shunt. A shorted line shows
            Z<sub>in</sub> = jZ<sub>c</sub> tan βℓ, an open one Z<sub>in</sub> = −jZ<sub>c</sub> cot βℓ{cite([E, '§3.16'])}. In
            shunt they add susceptance: b = ({Z0}/Z<sub>c</sub>) tan βℓ for an open stub and b = −({Z0}/Z<sub>c</sub>) cot βℓ
            for a shorted one{cite([E, '§3.23'])}, so they move the point along its g circle like a shunt C or L
            ({jump('moving-on-the-chart', 'Moving on the chart')}). A shorted stub shorter than λ/4 acts as an inductor and an
            open one as a capacitor, with the values below, at one frequency only{cite([S2, '§2.4'])}. At λ/4 they swap roles:
            a shorted λ/4 stub adds nothing (b = 0) and an open one is a short across the line.
          </p>
          <Eq id="stub-short-z" />
          <Eq id="stub-open-z" />
          <Eq id="stub-open-b" />
          <Eq id="stub-short-b" />
          <Eq id="stub-short-l" />
          <Eq id="stub-open-c" />
        </>
      ))}

      {topic('how-good-is-a-match', (
        <>
          <p>
            Four numbers say how far from a match a point is, and all four are one number in disguise: |Γ|, the distance from
            the centre.
          </p>
          <ul>
            <li><b>|Γ|</b> is the share of the incident voltage that comes back. Of the power, |Γ|² is reflected and 1 − |Γ|²
              reaches the load{cite([E, '§3.20'])}.</li>
            <li><b>VSWR</b>, the voltage standing wave ratio, is the ratio of the largest to the smallest voltage along the
              line: (1 + |Γ|)/(1 − |Γ|){cite([E, '§3.14'])}. It is 1 at a match and grows without bound as |Γ| nears 1. On
              the chart, a circle about the centre is a circle of constant VSWR, and it crosses the real axis on the right at
              r = VSWR: the impedance at a voltage maximum is {Z0}·VSWR{cite([S2, '§2.3'])}.</li>
            <li><b>Return loss</b> is how far the reflected power lies below the incident power, in decibels:
              RL = −20 log<sub>10</sub> |Γ|{cite([S3, '§2.8'])}. It is positive for a passive load{cite([S3, '§2.8'])}, and
              larger is better. (Written 20 log<sub>10</sub> |Γ|, the same figure is negative; the sign says which of the two
              is meant.)</li>
            <li><b>Mismatch loss</b> is how much less power reaches the load than with a match:
              ML = −10 log<sub>10</sub>(1 − |Γ|²) dB. It is the power delivered above, put in decibels; the textbook names
              it without the formula{cite([S3, '§2.8'])}.</li>
          </ul>
          <Eq id="power-reflected" />
          <Eq id="power-delivered" />
          <Eq id="vswr" values={loadValues} note="below: your load" />
          <Eq id="gamma-vswr" />
          <Eq id="z-max" values={loadValues} />
          <Eq id="z-min" values={loadValues} />
          <Eq id="return-loss" values={loadValues} />
          <Eq id="mismatch-loss" values={loadValues} />
          <p>
            Your load alone has |Γ| = {L('m-load-mag', num(m(0, M_MAG)))}: VSWR {L('m-load-vswr', num(m(0, M_VSWR)))}, return
            loss {L('m-load-rl', amt(m(0, M_RL), 'dB'))}, {L('m-load-ref', num(reflectedPower(m(0, M_MAG)) * 100))} % of the
            power reflected, mismatch loss {L('m-load-ml', amt(m(0, M_ML), 'dB'))}. The tool’s goal circle, VSWR{' '}
            {num(GOAL_VSWR)}, is |Γ| = {L('goal-mag', num(GOAL_MAG))}: return loss {L('goal-rl', amt(returnLoss(GOAL_MAG), 'dB'))}{' '}
            and {L('goal-ref', num(reflectedPower(GOAL_MAG) * 100))} % of the power reflected (mismatch
            loss {L('goal-ml', amt(mismatchLoss(GOAL_MAG), 'dB'))}). Whether that is good enough is the designer’s call; the
            tool’s choice is only a default.
          </p>
          <div className={css.liveRow}>
            <div className={css.live}>
              {head('the load and the input')}
              <table className={css.metrics}>
                <thead><tr><th /><th>Load</th><th>Input</th></tr></thead>
                <tbody>
                  {loadRows.map(([label, value], i) => <tr key={i}><th>{label}</th><td>{value}</td><td>{inputRows[i][1]}</td></tr>)}
                </tbody>
              </table>
            </div>
            <VswrFigure rows={VSWR_ROWS} />
          </div>
        </>
      ))}

      {topic('matching-with-two-parts', (
        <>
          <p>
            To match is to bring the input to the centre. The centre lies on two circles that matter: r = 1 and g = 1. A
            series part keeps r, a shunt part keeps g ({jump('moving-on-the-chart', 'Moving on the chart')}), so the last step
            into the centre is either a series part along r = 1 or a shunt part along g = 1. The first part’s job is to land
            the point on that circle{cite([S3, '§6.7'])}.
          </p>
          <Eq id="series-adds-z" />
          <Eq id="shunt-adds-y" />
          <Eq id="circle-r" />
          <Eq id="circle-g" />
          <p>
            <b>The start circuit, step by step.</b> The load is z = {L('start-load-z', cx(sm(0, M_ZR), sm(0, M_ZI)))}. A
            series capacitor of x = {L('start-x', num(added(SERIES_C, START_C, 0, START.f0, START.f0, START.z0)))} takes it
            along its r = {num(sm(0, M_ZR))} circle to {L('start-node1-z', cx(sm(1, M_ZR), sm(1, M_ZI)))}, whose admittance is
            y = {L('start-node1-y', cx(sm(1, M_YR), sm(1, M_YI)))}: on the g = 1 circle. A shunt inductor of
            b = {L('start-b', num(added(SHUNT_L, START_L, 0, START.f0, START.f0, START.z0)))} then takes y
            to {L('start-input-y', cx(sm(2, M_YR), sm(2, M_YI)))}, the centre. At 100 MHz on 50 Ω those
            are {L('start-c', amt(START_C, 'F'))} and {L('start-l', amt(START_L, 'H'))}.
          </p>
          <Eq id="x-series-c" values={{ x: tv(-1 / (START_W * START_C * START.z0)), X: tv(-1 / (START_W * START_C), 0, 'Ω'), omega: tv(START_W, 0, 'rad/s'), C: tv(START_C, 0, 'F'), Z_0: tv(START.z0, 0, 'Ω') }} note="below: the start circuit" />
          <Eq id="b-shunt-l" values={{ b: tv(-START.z0 / (START_W * START_L)), B: tv(-1 / (START_W * START_L), 0, 'S'), omega: tv(START_W, 0, 'rad/s'), L: tv(START_L, 0, 'H'), Z_0: tv(START.z0, 0, 'Ω') }} />
          <p>
            <b>Two routes, and when each works.</b> Series first (series, then shunt nearest the source) needs the load’s r
            circle to meet the g = 1 circle, which happens when r ≤ 1. Shunt first needs the load’s g circle to meet the r = 1
            circle, so g ≤ 1. Where a circle meets the target circle it usually meets it twice, so a route has two answers,
            with different parts. (Why two, one or none comes with the solver.)
          </p>
          <p>
            <b>One part can be enough.</b> The start load already lies on g = 1 (its y
            is {L('start-load-y', cx(sm(0, M_YR), sm(0, M_YI)))}), so a single shunt capacitor of b = +1,{' '}
            {L('start-shunt-c', amt(START_SHUNT_C, 'F'))}, matches it on its own. A single series reactance matches any load on
            r = 1, a single shunt reactance any load on g = 1{cite([E, '§3.22'])}. A line followed by a shunt stub does the same
            job with line pieces: the line turns the point onto g = 1, the stub cancels b{cite([E, '§3.23'])}.
          </p>
          <Eq id="b-shunt-c" values={{ b: tv(START_W * START_SHUNT_C * START.z0), B: tv(START_W * START_SHUNT_C, 0, 'S'), omega: tv(START_W, 0, 'rad/s'), C: tv(START_SHUNT_C, 0, 'F'), Z_0: tv(START.z0, 0, 'Ω') }} />
          <div className={css.liveRow}>
            <div className={css.live}>
              {head('the path, node by node')}
              <table className={css.metrics}>
                <thead><tr><th>Node</th><th>z</th><th>y</th></tr></thead>
                <tbody>
                  {Array.from({ length: n + 1 }, (_, k) => (
                    <tr key={k}><th>{k === 0 ? 'Load' : k === n ? `${k} (input)` : k}</th><td>{L(`node-${k}-z`, cx(m(k, M_ZR), m(k, M_ZI)))}</td><td>{L(`node-${k}-y`, cx(m(k, M_YR), m(k, M_YI)))}</td></tr>
                  ))}
                </tbody>
              </table>
              <p>
                The load has r = {num(zr)} and g = {num(yr)}: series first is {L('route-series', zr <= 1 ? 'open' : 'closed')}{' '}
                (r ≤ 1), shunt first is {L('route-shunt', yr <= 1 ? 'open' : 'closed')} (g ≤ 1).
              </p>
              {c.parts.map((p, i) => (
                <p key={i}>
                  {i + 1} · {KIND_NAMES[p.kind]} {L(`part-${i}-value`, valueText(p.kind, p.value))}
                  {p.kind <= SHUNT_C || isStub(p.kind) ? <>: adds {p.kind === SERIES_R ? 'r' : p.kind === SHUNT_R ? 'g' : isSeries(p.kind) ? 'x' : 'b'} = {L(`part-${i}-added`, num(added(p.kind, p.value, p.zc ?? z0, f0, f0, z0)))}</> : null}
                </p>
              ))}
              <p>The load’s Q = {L('load-q', num(m(0, M_Q)))}.</p>
            </div>
            <MatchFigure />
          </div>
          <p>
            <b>Q.</b> For a resistive load matched by an L network, the Q of both legs is √(R<sub>high</sub>/R<sub>low</sub> − 1){cite([S3, '§6.4'])}.
            Any point has its own Q = |x|/r = |b|/g{cite([S3, '§6.4'])}; the start load’s is {L('start-q', num(sm(0, M_Q)))}.
            What Q means for bandwidth comes with the frequency sweep.
          </p>
          <Eq id="q-node" values={loadValues} note="below: your load" />
          <Eq id="q-l-network" />
        </>
      ))}
    </div>
  );
}

/** Renders again only when the circuit changes (a commit), not on selection or hover. */
export default React.memo(Theory);
