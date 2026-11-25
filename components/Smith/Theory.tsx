// The Theory section of the Smith chart (step M3.5b): the seven topics of docs/smith-chart/theory.md §1–7, folding,
// with the equations taken from the registry (lib/smith/equations.ts) by id and printed by its TeX printer, never
// retyped, and the numbers of the visitor's circuit from the engine (network.evaluateCircuit and nodeMetrics, parts,
// convert, geometry.partMobius). Every element that shows a live number carries data-live with a name, so the harness
// (scripts/harness/smith/ui-theory.mjs) can compare it with its own engine run. Citations are numbered through the
// page's one Bibliography, in the order this component calls them (the order of the page).

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';

import { belowFloor, formatResidual, formatReturnLoss } from '../../lib/quantity';
import { gammaFromImpedance, magFromVswr, mismatchLoss, reflectedPower, deliveredPower, returnLoss, toDegrees } from '../../lib/smith/convert';
import { EQUATION_BY_ID, TexPiece, substitutions, tex, valueTex } from '../../lib/smith/equations';
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
import { defaultCircuit, sameCircuit } from '../../lib/smith/state';
import type { SweepSetting } from '../../lib/smith/state';
import type { ValueChoice } from '../../lib/smith/values';
import { useI18n } from '../../lib/ui/i18n';
import type { TranslationKey } from '../../lib/ui/translations';
import bibCss from '../../styles/Bibliography.module.css';
import css from '../../styles/SmithTheory.module.css';
import Bibliography from '../Bibliography';
import KatexSpan from '../KatexSpan';
import { openDerivation } from './Derivation';
import { hasDerivation } from './derive';
import { GOAL_VSWR } from './pathLayer';
import { onFollowTopic, returnFromTopic } from './Why';
import { markWide, watchWide } from '../Equations/wide';
import { complexText } from './readout';
import { eqTitle, kindName } from './smithText';
import type { Outcome } from './SolvePanel';
import { CirclesFigure, GammaFigure, LineFigure, MatchFigure, PlaneFigure, VswrFigure, WalksFigure } from './TheoryFigures';
import { SOLVER_IDS, SolverTopics } from './TheorySolver';
import { SWEEP_IDS, SweepCircuitContext, SweepTopics } from './TheorySweep';
import type { TraceLayer } from './traceLayer';

/** The topics in the order of the page; the ids are the anchors (#moving-on-the-chart). */
export const TOPICS: readonly { id: string; title: string }[] = [
  { id: 'how-to-use', title: 'How to use this tool' },
  { id: 'gamma-z-y', title: 'Γ, z and y, and normalising by Z₀' },
  { id: 'reading-the-chart', title: 'Reading the chart' },
  { id: 'moving-on-the-chart', title: 'Moving on the chart' },
  { id: 'transmission-lines', title: 'Transmission lines' },
  { id: 'how-good-is-a-match', title: 'How good is a match' },
  { id: 'matching-with-two-parts', title: 'Matching with two parts' },
  { id: 'two-one-or-none', title: 'Two solutions, one or none' },
  { id: 'one-value-and-a-point', title: 'Why one value cannot reach a point' },
  { id: 'realisable-values', title: 'Realisable values and standard values' },
  { id: 'q-and-bandwidth', title: 'Q and bandwidth' },
  { id: 'reading-a-trace', title: 'Reading a frequency trace' },
];
const TOPIC_IDS = new Set(TOPICS.map((t) => t.id));

const E = 'Ellingson2018', S2 = 'SteerVol2', S3 = 'SteerVol3', W = 'WikiSmith', M = 'WikiMobius';
const TAU = 2 * Math.PI;
const PHONE = '(max-width: 720px)';

// The texts of live numbers: four significant digits with their zeros, as the readout and the node table.
// Rounding-level residuals as the bound of plan.md D20 (lib/quantity.ts formatResidual), never as 1e−17.
const num = (v: number): string => formatResidual(v, '', 4);
const amt = (v: number, unit: string): string => formatResidual(v, unit, 4);
const cx = (re: number, im: number, unit = ''): string => complexText(re, im, unit, 4);
const fin = (...v: number[]): boolean => v.every((n) => Number.isFinite(n));
/** A value of TeX at rounding level (D20, lib/quantity.ts): a residual part under the floor is put in as 0. */
const fl = (v: number): number => (belowFloor(v) ? 0 : v);
const tv = (re: number, im = 0, unit = ''): TexPiece | undefined => (fin(re, im) ? valueTex(unit && unit !== 'dB' ? re : fl(re), unit && unit !== 'dB' ? im : fl(im), unit) : undefined);
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

/** ω as the page writes it in a substitution: 2π·f0, in the unit f0 is typed in (not "Mrad/s"). */
const omegaTex = (f0: number): TexPiece | undefined => {
  const f = tv(f0, 0, 'Hz');
  return f && { s: `2\\pi \\cdot ${f.s}`, p: 2, digit: true };
};

function Eq({ id, values, note }: { id: string; values?: Values; note?: string }) {
  const { locale, t } = useI18n();
  const eq = EQUATION_BY_ID.get(id);
  if (!eq) throw new Error(`Unknown equation "${id}" in the Smith chart's theory.`);
  // M5.3: "derive" opens its derivation, with the numbers of the place the theory uses (derive.ts theorySubject).
  const title = (
    <span className={css.eqTitle}>
      {eqTitle(id, eq.title, locale)}{note ? ` · ${note}` : ''}
      {hasDerivation(id) && <> · <button type="button" className={css.derive} data-derive-open={id} onClick={(e) => openDerivation(id, e.currentTarget)}>{t('sm.th.derive')}</button></>}
    </span>
  );
  const sub = values && substitutions(eq.tree, values);
  // Aligned on "=": the symbol, then its equation and every substitution line in the second column.
  if (sub) {
    return (
      <div className={css.eq} data-eq={id}>
        <div className={css.eqRows}>
          <KatexSpan className={css.eqLhs} text={`\\displaystyle ${sub.lhs}`} />
          <KatexSpan text={`\\displaystyle {}= ${sub.rhs}`} />
          {sub.lines.map((s, i) => (
            <KatexSpan key={i} className={css.eqLive} data-eq-live={id} text={`\\displaystyle {}= ${s}`} />
          ))}
        </div>
        {title}
      </div>
    );
  }
  const live = values && tex(eq.tree, { value: (name) => values[name] });
  return (
    <div className={css.eq} data-eq={id}>
      <KatexSpan text={`\\displaystyle ${tex(eq.tree)}`} />
      {live && <KatexSpan className={css.eqLive} data-eq-live={id} text={`\\displaystyle ${live}`} />}
      {title}
    </div>
  );
}

const Z0 = <>Z<sub>0</sub></>;
const F0 = <>f<sub>0</sub></>;
const Gr = <>Γ<sub>r</sub></>;
const Gi = <>Γ<sub>i</sub></>;

interface Props {
  bib: Bibliography;
  circuit: Circuit;
  /** The Solve panel's outcome (null while solving or before the first); the solver's topics show it when it is the circuit's. */
  outcome: Outcome | null;
  /** The value lists per kind (D17), for the standard values of topic 10. */
  lists: ValueChoice;
  /** M7.4b: the page's sweep (null when off) and the trace layer, whose band figures topics 11–12 show. */
  sweep: SweepSetting | null;
  layer: () => TraceLayer | null;
}

function Theory({ bib, circuit: c, outcome, lists, sweep, layer }: Props) {
  const { locale, t } = useI18n();
  const topicTitle = (id: string) => t(`sm.th.topic.${id}` as TranslationKey);

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
  // An equation wider than a phone scrolls sideways with a Tab stop (wide.ts): checked after every render (a new
  // circuit, a topic opened or closed) and when the theory's width changes.
  const root = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => { if (root.current) markWide(root.current, '[data-eq]'); });
  useEffect(() => (root.current ? watchWide(root.current, '[data-eq]') : undefined), []);
  const setAll = (value: boolean) => setClosed(Object.fromEntries(TOPICS.map(({ id }) => [id, value])));

  // A "→ theory" link of the tool (Why.tsx): open its topic even when the hash is already the link's (no hashchange),
  // put the focus on the topic's heading (the browser then scrolls to it as to any #link) and offer a way back to the
  // element the link was followed from, at the top of the topic.
  const [back, setBack] = useState<{ id: string; n: number } | null>(null);
  const from = useRef<HTMLElement | null>(null);
  useEffect(() => {
    onFollowTopic((id, el) => {
      if (!TOPIC_IDS.has(id)) return;
      from.current = el;
      setClosed((was) => (was[id] ? { ...was, [id]: false } : was));
      setBack((was) => ({ id, n: (was?.n ?? 0) + 1 }));
    });
    return () => onFollowTopic(null);
  }, []);
  useEffect(() => {
    if (!back) return undefined;
    // After the link's own navigation, which clears the focus.
    const raf = requestAnimationFrame(() => document.querySelector<HTMLElement>(`#${back.id} > summary`)?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(raf);
  }, [back?.n]);
  const goBack = () => {
    const el = from.current;
    setBack(null);
    from.current = null;
    returnFromTopic(el);
    requestAnimationFrame(() => {
      if (el?.isConnected) {
        el.scrollIntoView({ block: 'center' });
        el.focus({ preventScroll: true });
      } else document.getElementById('tool')?.scrollIntoView();
    });
  };

  // Citations: "[n, §x]", linked to the entry; numbered by the page's Bibliography in the order they are made here.
  const cite = (...refs: [string, string][]) => (
    <span className={css.cites}>
      {'\u00A0'}
      {refs.map(([key, at], i) => (
        <React.Fragment key={i}>{i > 0 && ', '}<a className={bibCss.cite} href={`#ref-${key}`} data-cite={key}>[{bib.number(key)}{at ? <>,{'\u00A0'}{at}</> : null}]</a></React.Fragment>
      ))}
    </span>
  );
  const L = (key: string, text: string) => <span className={css.n} data-live={key}>{text}</span>;

  // ---- The engine's numbers for the circuit ----
  const { metrics } = evaluateCircuit(c);
  const n = c.parts.length;
  const m = (k: number, slot: number): number => metrics[k * METRIC_STRIDE + slot];
  const z0 = c.z0, f0 = c.f0;
  const zr = m(0, M_ZR), zi = m(0, M_ZI), yr = m(0, M_YR), yi = m(0, M_YI), gr = m(0, M_GR), gi = m(0, M_GI);
  const start = sameCircuit(c, START);
  const head = (what: string) => <div className={css.liveHead}>{start ? t('sm.th.startCircuit') : t('sm.th.yourCircuit')}<span>{what}</span></div>;

  const loadValues: Values = {
    Z_0: tv(z0, 0, 'Ω'), Z: tv(zr * z0, zi * z0, 'Ω'), Y: tv(yr / z0, yi / z0, 'S'), z: tv(zr, zi), y: tv(yr, yi),
    r: tv(zr), x: tv(zi), g: tv(yr), b: tv(yi), Gamma: tv(gr, gi), Gamma_r: tv(gr), Gamma_i: tv(gi),
    VSWR: tv(m(0, M_VSWR)), RL: tv(m(0, M_RL), 0, 'dB'), ML: tv(m(0, M_ML), 0, 'dB'), Q: tv(m(0, M_Q)),
    Z_max: tv(z0 * m(0, M_VSWR), 0, 'Ω'), Z_min: tv(z0 / m(0, M_VSWR), 0, 'Ω'),
  };

  // Topic 4: per part, what it keeps and what it changes (nodes i and i + 1), and which way it turns the point.
  const walks = c.parts.map((p, i) => {
    const a = added(p.kind, p.value, p.zc ?? z0, f0, f0, z0);
    const turn = a > 0 ? t('sm.th.t4.sense.cw') : a < 0 ? t('sm.th.t4.sense.ccw') : t('sm.th.t4.sense.none');
    switch (p.kind) {
      case SERIES_L: case SERIES_C:
        return { keeps: 'r', kept: num(m(i, M_ZR)), what: 'x', from: num(m(i, M_ZI)), to: num(m(i + 1, M_ZI)), sense: turn };
      case SERIES_R:
        return { keeps: 'x', kept: num(m(i, M_ZI)), what: 'r', from: num(m(i, M_ZR)), to: num(m(i + 1, M_ZR)), sense: t('sm.th.t4.sense.p1') };
      case SHUNT_R:
        return { keeps: 'b', kept: num(m(i, M_YI)), what: 'g', from: num(m(i, M_YR)), to: num(m(i + 1, M_YR)), sense: t('sm.th.t4.sense.m1') };
      case SHUNT_L: case SHUNT_C: case STUB_OPEN: case STUB_SHORT:
        return { keeps: 'g', kept: num(m(i, M_YR)), what: 'b', from: num(m(i, M_YI)), to: num(m(i + 1, M_YI)), sense: turn };
      default: {
        // A line or λ/4: |Γ| measured against its own impedance stays.
        const zc = zcOf(c, i), o = new Float64Array(2);
        gammaFromImpedance(o, 0, m(i, M_ZR) * z0, m(i, M_ZI) * z0, zc);
        const mag = fin(o[0], o[1]) ? Math.hypot(o[0], o[1]) : 1;
        return {
          keeps: '|Γ|', kept: num(mag), zc: amt(zc, 'Ω'), what: 'Γ', from: cx(m(i, M_GR), m(i, M_GI)), to: cx(m(i + 1, M_GR), m(i + 1, M_GI)),
          sense: t('sm.th.t4.sense.cw'),
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
    const base: Record<string, TexPiece | undefined> = { Z_0: tv(z0, 0, 'Ω'), omega: omegaTex(f0) };
    if (kind === SERIES_R) return { ...base, r: tv(a), R: tv(v, 0, 'Ω') };
    if (kind === SHUNT_R) return { ...base, g: tv(a), R: tv(v, 0, 'Ω') };
    if (kind === SERIES_L) return { ...base, x: tv(a), X: tv(a * z0, 0, 'Ω'), L: tv(v, 0, 'H') };
    if (kind === SERIES_C) return { ...base, x: tv(a), X: tv(a * z0, 0, 'Ω'), C: tv(v, 0, 'F') };
    if (kind === SHUNT_L) return { ...base, b: tv(a), B: tv(a / z0, 0, 'S'), L: tv(v, 0, 'H') };
    return { ...base, b: tv(a), B: tv(a / z0, 0, 'S'), C: tv(v, 0, 'F') };
  };
  const partNote = (kind: number) => { const i = firstOf(kind); return i < 0 ? undefined : t('sm.th.note.part', { n: i + 1 }); };
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
      [t('sm.th.t6.rowRl'), L(`m-${key}-rl`, formatReturnLoss(m(k, M_RL)))],
      [t('sm.th.t6.rowMl'), L(`m-${key}-ml`, amt(m(k, M_ML), 'dB'))],
      [t('sm.th.t6.rowRef'), <>{L(`m-${key}-ref`, num(reflectedPower(mag) * 100))} %</>],
      [t('sm.th.t6.rowDel'), <>{L(`m-${key}-del`, num(deliveredPower(mag) * 100))} %</>],
      [<>Z<sub>max</sub> = Z<sub>0</sub>·VSWR</>, L(`m-${key}-zmax`, amt(z0 * s, 'Ω'))],
      [<>Z<sub>min</sub> = Z<sub>0</sub>/VSWR</>, L(`m-${key}-zmin`, amt(z0 / s, 'Ω'))],
    ] as [React.ReactNode, React.ReactNode][];
  };
  const loadRows = matchRows(0, 'load'), inputRows = matchRows(n, 'input');

  let number = 0;
  const topic = (id: string, children: React.ReactNode, no?: number) => {
    number = no ?? number + 1;
    return (
      <details key={id} id={id} className={css.topic} open={!closed[id]} data-topic={id}
        onToggle={(event) => { const open = event.currentTarget.open; setClosed((was) => (!was[id] === open ? was : { ...was, [id]: !open })); }}>
        <summary><span className={css.topicNo}>{no ?? number}</span><h3>{topicTitle(id)}</h3><span className={css.chevron} aria-hidden="true" /></summary>
        <div className={css.body}>
          {back?.id === id && <button type="button" className={css.back} onClick={goBack} data-back-to-tool="">{t('sm.th.back')}</button>}
          {children}
        </div>
      </details>
    );
  };
  const jump = (id: string, text: string) => (
    <a href={`#${id}`} className={css.jump} onClick={() => setClosed((was) => ({ ...was, [id]: false }))}>{text}</a>
  );

  return (
    <div className={css.theory} data-theory="" ref={root}>
      <p className={css.lead}>
        {t('sm.th.lead.a')}<i>{t('sm.th.yourCircuit')}</i>{t('sm.th.lead.b')}{Z0}{t('sm.th.lead.c')}{F0}{t('sm.th.lead.d')}
        <a href="#references" className={css.jump}>{t('sm.th.lead.sources')}</a>.
      </p>
      <ol className={css.contents}>
        {TOPICS.map(({ id }) => (
          <li key={id}><a href={`#${id}`} onClick={() => setClosed((was) => ({ ...was, [id]: false }))}>{topicTitle(id)}</a></li>
        ))}
      </ol>
      <div className={css.tools}>
        <button type="button" className={css.fold} onClick={() => setAll(false)} data-open-all="">{t('sm.th.openAll')}</button>
        <button type="button" className={css.fold} onClick={() => setAll(true)} data-fold-all="">{t('sm.th.foldAll')}</button>
      </div>

      {topic('how-to-use', (
        <>
          <p>{t('sm.th.t1.intro')}</p>
          <ol className={css.steps}>
            <li><b>{t('sm.th.t1.s1.b')}</b>{t('sm.th.t1.s1.a')}{Z0}{t('sm.th.t1.s1.c')}{F0}{t('sm.th.t1.s1.d')}</li>
            <li><b>{t('sm.th.t1.s2.b')}</b>{t('sm.th.t1.s2.a')}</li>
            <li><b>{t('sm.th.t1.s3.b')}</b>{t('sm.th.t1.s3.a')}</li>
            <li><b>{t('sm.th.t1.s4.b')}</b>{t('sm.th.t1.s4.a')}</li>
          </ol>
          <p>{t('sm.th.t1.aim.a')}{cite([E, '§3.20'])}{t('sm.th.t1.aim.b', { vswr: num(GOAL_VSWR) })}</p>
          <div className={css.live}>
            {head(t('sm.th.t1.head'))}
            <p>{t('sm.th.t1.inputNow')}{L('input-mag', num(m(n, M_MAG)))}.</p>
          </div>
        </>
      ))}

      {topic('gamma-z-y', (
        <>
          <p>
            {t('sm.th.t2.p1.a')}{Z0}{t('sm.th.t2.p1.b')}<span className={css.nw}>z = Z/{Z0} = r + jx</span>
            {t('sm.th.t2.p1.c')}<span className={css.nw}>y = 1/z = Y·{Z0} = g + jb</span>{cite([W, '“Normalization”'])}{t('sm.th.t2.p1.d')}
          </p>
          <Eq id="z-norm" values={loadValues} note={t('sm.th.note.load')} />
          <Eq id="y-norm" values={loadValues} />
          <p>
            {t('sm.th.t2.p2.a')}{cite([E, '§3.12'])}{t('sm.th.t2.p2.b')}<span className={css.nw}>Γ = (z − 1)/(z + 1)</span>{cite([E, '§3.12'])}
            {t('sm.th.t2.p2.c')}{cite([S2, '§2.3'])}{t('sm.th.t2.p2.d')}{Z0}{t('sm.th.t2.p2.e')}{cite([E, '§3.12'])}
            {t('sm.th.t2.p2.f')}{cite([E, '§3.12'])}{t('sm.th.t2.p2.g')}{cite([E, '§3.12'])}{t('sm.th.t2.p2.h')}
          </p>
          <Eq id="gamma-z" values={loadValues} />
          <Eq id="z-gamma" />
          <p>
            {t('sm.th.t2.p3.a')}<i>{t('sm.th.t2.p3.em')}</i>{t('sm.th.t2.p3.b')}{cite([S3, '§3.4'])}
            {t('sm.th.t2.p3.c')}{Gr} + j{Gi}{t('sm.th.t2.p3.d')}
          </p>
          <p>{t('sm.th.t2.p4.a')}{cite([W, '“Admittance chart”'])}{t('sm.th.t2.p4.b')}{cite([S3, '§3.4'])}.</p>
          <Eq id="gamma-y" />
          <Eq id="y-gamma" values={loadValues} />
          <div className={css.liveRow}>
            <div className={css.live}>
              {head(t('sm.th.t2.head'))}
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
          <p>{t('sm.th.t3.intro')}</p>
          <ul>
            <li><b>{t('sm.th.t3.r.b')}</b>{t('sm.th.t3.r.a')}</li>
            <li><b>{t('sm.th.t3.x.b')}</b>{t('sm.th.t3.x.a')}{Gi}{t('sm.th.t3.x.c')}{Gi}{t('sm.th.t3.x.d')}{cite([S3, '§3.4'])}.</li>
            <li><b>{t('sm.th.t3.gb.b')}</b>{t('sm.th.t3.gb.a')}{cite([S3, '§3.4'])}.</li>
          </ul>
          <Eq id="gamma-parts-z" />
          <Eq id="r-gamma" />
          <Eq id="x-gamma" />
          <Eq id="circle-r" values={loadValues} note={t('sm.th.note.throughLoad')} />
          <Eq id="circle-x" values={loadValues} />
          <Eq id="z-parts" />
          <Eq id="gamma-parts-y" />
          <Eq id="y-parts" />
          <Eq id="g-gamma" />
          <Eq id="b-gamma" />
          <Eq id="circle-g" values={loadValues} />
          <Eq id="circle-b" values={loadValues} />
          <p>{t('sm.th.t3.trust.a')}{Gr}{t('sm.th.t3.trust.and')}{Gi}{t('sm.th.t3.trust.b')}</p>
          <div className={css.liveRow}>
            <div className={css.live}>
              {head(t('sm.th.t3.head'))}
              <p>r = {L('load-r', num(zr))}: {t('sm.th.t3.centre')} {L('r-centre', num(zr / (1 + zr)))}, {t('sm.th.t3.radius')} {L('r-radius', num(1 / (1 + zr)))}</p>
              <p>x = {L('load-x', num(zi))}: {t('sm.th.t3.centre')} (1, {L('x-centre', num(1 / zi))}), {t('sm.th.t3.radius')} {L('x-radius', num(1 / Math.abs(zi)))}{zi === 0 ? t('sm.th.t3.realAxis') : ''}</p>
              <p>g = {L('load-g', num(yr))}: {t('sm.th.t3.centre')} {L('g-centre', num(-yr / (1 + yr)))}, {t('sm.th.t3.radius')} {L('g-radius', num(1 / (1 + yr)))}</p>
              <p>b = {L('load-b', num(yi))}: {t('sm.th.t3.centre')} (−1, {L('b-centre', num(-1 / yi))}), {t('sm.th.t3.radius')} {L('b-radius', num(1 / Math.abs(yi)))}{yi === 0 ? t('sm.th.t3.realAxis') : ''}</p>
              <p>{t('sm.th.t3.allFour')}{Gr} + j{Gi} = {L('load-gamma', cx(gr, gi))}.</p>
            </div>
            <CirclesFigure r={zr} x={zi} g={yr} b={yi} gr={gr} gi={gi} />
          </div>
          <p>
            <b>{t('sm.th.t3.zy.b')}</b>{t('sm.th.t3.zy.a')}{cite([S3, '§3.4'])}{t('sm.th.t3.zy.c')}
            {jump('moving-on-the-chart', topicTitle('moving-on-the-chart'))}{t('sm.th.t3.zy.d')}{cite([S3, '§3.4'])}{t('sm.th.t3.zy.e')}
          </p>
          <p>
            <b>{t('sm.th.t3.rim.b')}</b>{t('sm.th.t3.rim.a')}{cite([S3, '§3.4'])}{t('sm.th.t3.rim.c')}
            {jump('transmission-lines', topicTitle('transmission-lines'))}{t('sm.th.t3.rim.d')}{cite([S3, '§3.4'])}.
          </p>
          <p><b>{t('sm.th.t3.zoom.b')}</b>{t('sm.th.t3.zoom.a')}</p>
        </>
      ))}

      {topic('moving-on-the-chart', (
        <>
          <p>{t('sm.th.t4.intro')}</p>
          <p>
            <b>{t('sm.th.t4.ser.b')}</b>{t('sm.th.t4.ser.a')}<span className={css.nw}>z<sub>in</sub> = z<sub>L</sub> + z<sub>s</sub></span>{cite([S3, '§2.2.6'])}
            {t('sm.th.t4.ser.c')}<span className={css.nw}>x = ωL/{Z0}</span>{t('sm.th.t4.ser.d')}<span className={css.nw}>x = −1/(ωC{Z0})</span>
            {t('sm.th.t4.ser.e')}{cite([W, '“Circuit elements and topology”'])}{t('sm.th.t4.ser.f')}<span className={css.nw}>Γ = +1</span>{t('sm.th.t4.ser.g')}
          </p>
          <Eq id="series-adds-z" values={seriesAdds} note={firstSeries < 0 ? undefined : t('sm.th.note.part', { n: firstSeries + 1 })} />
          <Eq id="x-series-l" values={lumpedValues(SERIES_L)} note={partNote(SERIES_L)} />
          <Eq id="x-series-c" values={lumpedValues(SERIES_C)} note={partNote(SERIES_C)} />
          <Eq id="r-series" values={lumpedValues(SERIES_R)} note={partNote(SERIES_R)} />
          <Eq id="circle-r" />
          <p>
            <b>{t('sm.th.t4.sh.b')}</b>{t('sm.th.t4.sh.a')}<span className={css.nw}>y<sub>in</sub> = y<sub>L</sub> + y<sub>p</sub></span>{cite([S3, '§2.2.6'])}
            {t('sm.th.t4.sh.c')}<span className={css.nw}>b = ωC{Z0}</span>{t('sm.th.t4.sh.d')}<span className={css.nw}>b = −{Z0}/(ωL)</span>
            {t('sm.th.t4.sh.e')}{cite([W, '“Circuit elements and topology”'])}{t('sm.th.t4.sh.f')}<span className={css.nw}>Γ = −1</span>{t('sm.th.t4.sh.g')}
          </p>
          <Eq id="shunt-adds-y" values={shuntAdds} note={firstShunt < 0 ? undefined : t('sm.th.note.part', { n: firstShunt + 1 })} />
          <Eq id="b-shunt-c" values={lumpedValues(SHUNT_C)} note={partNote(SHUNT_C)} />
          <Eq id="b-shunt-l" values={lumpedValues(SHUNT_L)} note={partNote(SHUNT_L)} />
          <Eq id="g-shunt" values={lumpedValues(SHUNT_R)} note={partNote(SHUNT_R)} />
          <Eq id="circle-g" />
          <p>
            <b>{t('sm.th.t4.way.b')}</b>{t('sm.th.t4.way.a')}<b>{t('sm.th.t4.way.cw')}</b>{t('sm.th.t4.way.c')}<b>{t('sm.th.t4.way.ccw')}</b>
            {t('sm.th.t4.way.d')}<b>{t('sm.th.t4.way.cw')}</b>{t('sm.th.t4.way.e')}<b>{t('sm.th.t4.way.ccw')}</b>{t('sm.th.t4.way.f')}
            {cite([S3, '§3.4'])}{t('sm.th.t4.way.g')}{cite([S3, '§6.7'])}{t('sm.th.t4.way.h')}
          </p>
          <p>{t('sm.th.t4.short')}</p>
          <p>
            {t('sm.th.t4.line.a')}<b>{t('sm.th.t4.way.cw')}</b>{t('sm.th.t4.line.b')}{cite([S3, '§3.4, §3.5'])}{t('sm.th.t4.line.c')}
            {jump('transmission-lines', topicTitle('transmission-lines'))}{t('sm.th.t4.line.d')}
          </p>
          <div className={css.tableWrap}>
            <table className={css.table}>
              <thead><tr><th>{t('sm.th.t4.tbl.part')}</th><th>{t('sm.th.t4.tbl.keeps')}</th><th>{t('sm.th.t4.tbl.along')}</th><th>{t('sm.th.t4.tbl.arc')}</th></tr></thead>
              <tbody>
                <tr><th>{t('sm.th.t4.tbl.sl')}</th><td>r</td><td>{t('sm.th.t4.tbl.rCircle')}</td><td>{t('sm.th.t4.tbl.cwUp')}</td></tr>
                <tr><th>{t('sm.th.t4.tbl.sc')}</th><td>r</td><td>{t('sm.th.t4.tbl.rCircle')}</td><td>{t('sm.th.t4.tbl.ccwDown')}</td></tr>
                <tr><th>{t('sm.th.t4.tbl.sr')}</th><td>x</td><td>{t('sm.th.t4.tbl.xArc')}</td><td>{t('sm.th.t4.tbl.toPlus1')}</td></tr>
                <tr><th>{t('sm.th.t4.tbl.shc')}</th><td>g</td><td>{t('sm.th.t4.tbl.gCircle')}</td><td>{t('sm.th.t4.tbl.cwDown')}</td></tr>
                <tr><th>{t('sm.th.t4.tbl.shl')}</th><td>g</td><td>{t('sm.th.t4.tbl.gCircle')}</td><td>{t('sm.th.t4.tbl.ccwUp')}</td></tr>
                <tr><th>{t('sm.th.t4.tbl.shr')}</th><td>b</td><td>{t('sm.th.t4.tbl.bArc')}</td><td>{t('sm.th.t4.tbl.toMinus1')}</td></tr>
                <tr><th>{t('sm.th.t4.tbl.lineOf')}{Z0}</th><td>|Γ|</td><td>{t('sm.th.t4.tbl.centreCircle')}</td><td>{t('sm.th.t4.tbl.cw')}</td></tr>
              </tbody>
            </table>
          </div>
          <p className={css.small}>{t('sm.th.t4.stubsNote')}</p>
          <div className={css.figs}>
            <PlaneFigure />
            <WalksFigure />
          </div>
          <div className={css.live}>
            {head(t('sm.th.t4.head'))}
            {n === 0 ? <p>{t('sm.th.t4.noParts')}</p> : walks.map((s, i) => (
              <p key={i} data-walk={i}>
                {i + 1} · {kindName(c.parts[i].kind, locale)}{t('sm.th.t4.keeps')}{s.keeps} = {L(`part-${i}-kept`, s.kept)}
                {s.zc && <> ({t('sm.th.t4.againstZc')}Z<sub>c</sub> = {L(`part-${i}-zc`, s.zc)})</>}, {s.what}{t('sm.th.t4.from')}
                {L(`part-${i}-from`, s.from)}{t('sm.th.t4.to')}{L(`part-${i}-to`, s.to)}, {L(`part-${i}-sense`, s.sense)}
              </p>
            ))}
          </div>
          <p>
            <b>{t('sm.th.t4.mob1.b')}</b>{t('sm.th.t4.mob1.a')}<span className={css.nw}>Γ = (z − 1)/(z + 1)</span>
            {t('sm.th.t4.mob1.c')}<span className={css.nw}>(az + b)/(cz + d)</span>{t('sm.th.t4.mob1.d')}{cite([M, '“Elementary properties”'])}
            {t('sm.th.t4.mob1.e')}
          </p>
          <Eq id="gamma-z" />
          <p>
            {t('sm.th.t4.mob2.a')}<span className={css.nw}>(A·Z + B)/(C·Z + D)</span>{t('sm.th.t4.mob2.b')}{cite([M, '“Definition”'])}
            {t('sm.th.t4.mob2.c')}<span className={css.nw}>Γ′ = (aΓ + b)/(cΓ + d)</span>{t('sm.th.t4.mob2.d')}{Z0}
            {t('sm.th.t4.mob2.e')}{cite([S3, '§3.5'])}{t('sm.th.t4.mob2.f')}
          </p>
          <Eq id="abcd-zin" />
          <Eq id="mobius" values={mobiusValues} note={n ? t('sm.th.note.mobius') : undefined} />
          <Eq id="line-rotation" />
          <p><b>{t('sm.th.t4.startArc.b')}</b>{t('sm.th.t4.startArc.a')}{Z0}{t('sm.th.t4.startArc.c')}</p>
        </>
      ))}

      {topic('transmission-lines', (
        <>
          <p>
            {t('sm.th.t5.p1.a')}<span className={css.nw}>θ = βℓ = 2πℓ/λ</span>{t('sm.th.t5.p1.b')}{F0}{cite([E, '§3.15'])}{t('sm.th.t5.p1.c')}{F0}.
          </p>
          <Eq id="line-theta" />
          <Eq id="beta" />
          <p>
            <b>{t('sm.th.t5.rot.b')}</b>{t('sm.th.t5.rot.a')}{Z0}{t('sm.th.t5.rot.c')}
            <span className={css.nw}>Γ<sub>in</sub> = Γ<sub>L</sub>·e<sup>−j2θ</sup></span>{cite([S2, '§2.3'])}
            {t('sm.th.t5.rot.d')}<b>{t('sm.th.t5.rot.cw')}</b>{t('sm.th.t5.rot.e')}{cite([S3, '§3.4, §3.5'])}
            {t('sm.th.t5.rot.f')}{cite([E, '§3.15'])}.
          </p>
          <Eq id="line-rotation" values={egValues} note={t('sm.th.note.lambda8')} />
          <Eq id="line-zin" />
          <p>
            <b>{t('sm.th.t5.half.b')}</b>{t('sm.th.t5.half.a')}{cite([E, '§3.15'])}{t('sm.th.t5.half.c')}
            {L('eg-z-l', cx(zr, zi))}{t('sm.th.t5.half.d')}{L('eg-z-in', cx(egm[M_ZR], egm[M_ZI]))}.
          </p>
          <div className={css.liveRow}>
            <div className={css.live}>
              {head(li < 0 ? t('sm.th.t5.headNone') : t('sm.th.t5.headLine', { n: li + 1 }))}
              <p>{t('sm.th.t5.egLine.a')}{Z0}{t('sm.th.t5.egLine.b')}Γ<sub>L</sub> = {L('eg-gamma-l', cx(gr, gi))} → Γ<sub>in</sub> = {L('eg-gamma-in', cx(egm[M_GR], egm[M_GI]))}, z<sub>in</sub> = {L('eg-z-in', cx(egm[M_ZR], egm[M_ZI]))}</p>
              {li >= 0 && (
                <>
                  <p>{t('sm.th.t5.partLine.a')}{L('line-part', String(li + 1))}, {kindName(c.parts[li].kind, locale)}: θ = {L('line-theta', num(turnsAt(c.parts[li].kind, c.parts[li].value, f0, f0) * 360))}{t('sm.th.t5.partLine.at')}{F0}, Z<sub>c</sub> = {L('line-zc', amt(zcOf(c, li), 'Ω'))}</p>
                  <p>{t('sm.th.t5.gammaFrom')}{L('line-before', cx(m(li, M_GR), m(li, M_GI)))}{t('sm.th.t5.gammaTo')}{L('line-after', cx(m(li + 1, M_GR), m(li + 1, M_GI)))}</p>
                  {isStub(c.parts[li].kind) && <p>{t('sm.th.t5.stubAdds')}{L('line-b', num(added(c.parts[li].kind, c.parts[li].value, zcOf(c, li), f0, f0, z0)))}</p>}
                </>
              )}
            </div>
            <LineFigure gr={gr} gi={gi} gr2={egm[M_GR]} gi2={egm[M_GI]} />
          </div>
          <p>
            <b>{t('sm.th.t5.otherZ.b')}</b>{t('sm.th.t5.otherZ.a')}Z<sub>c</sub>{t('sm.th.t5.otherZ.c')}{Z0}{t('sm.th.t5.otherZ.d')}Z<sub>c</sub>
            {t('sm.th.t5.otherZ.e')}{Z0}{t('sm.th.t5.otherZ.f')}Z<sub>c</sub>{t('sm.th.t5.otherZ.g')}{Z0}{t('sm.th.t5.otherZ.h')}Z<sub>c</sub>
            {t('sm.th.t5.otherZ.i')}{cite([S3, '§3.5'])}.
          </p>
          <Eq id="line-circle-b" />
          <Eq id="line-circle-centre" />
          <Eq id="line-circle-radius" />
          <p>
            <b>{t('sm.th.t5.qw.b')}</b>{t('sm.th.t5.qw.a')}<span className={css.nw}>Z<sub>in</sub> = Z<sub>t</sub>²/Z<sub>L</sub></span>{cite([E, '§3.19'])}
            {t('sm.th.t5.qw.c')}R<sub>L</sub>{t('sm.th.t5.qw.d')}{Z0}{t('sm.th.t5.qw.e')}Z<sub>t</sub> = √({Z0}·R<sub>L</sub>){cite([E, '§3.19'])}
            {t('sm.th.t5.qw.f')}R<sub>L</sub> = {L('qw-rl', amt(c.loadR, 'Ω'))}{t('sm.th.t5.qw.on')}{Z0} = {L('qw-z0', amt(z0, 'Ω'))}
            {t('sm.th.t5.qw.needs')}Z<sub>t</sub> = {L('qw-zt', amt(zt, 'Ω'))}{c.loadX !== 0 ? t('sm.th.t5.qw.notRes') : null}
            {t('sm.th.t5.qw.g')}{F0}{cite([E, '§3.19'], [S2, '§2.4'])}{t('sm.th.t5.qw.h')}
          </p>
          <Eq id="quarter-wave" />
          <Eq id="quarter-wave-match" values={{ Z_t: tv(zt, 0, 'Ω'), Z_0: tv(z0, 0, 'Ω'), R_L: tv(c.loadR, 0, 'Ω') }} />
          <p>
            <b>{t('sm.th.t5.stubs.b')}</b>{t('sm.th.t5.stubs.a')}<span className={css.nw}>Z<sub>in</sub> = jZ<sub>c</sub> tan βℓ</span>
            {t('sm.th.t5.stubs.c')}<span className={css.nw}>Z<sub>in</sub> = −jZ<sub>c</sub> cot βℓ</span>{cite([E, '§3.16'])}
            {t('sm.th.t5.stubs.d')}{Z0}/Z<sub>c</sub>{t('sm.th.t5.stubs.e')}{Z0}/Z<sub>c</sub>{t('sm.th.t5.stubs.f')}{cite([E, '§3.23'])}
            {t('sm.th.t5.stubs.g')}{jump('moving-on-the-chart', topicTitle('moving-on-the-chart'))}{t('sm.th.t5.stubs.h')}
            {cite([S2, '§2.4'])}{t('sm.th.t5.stubs.i')}
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
          <p>{t('sm.th.t6.intro')}</p>
          <ul>
            <li><b>|Γ|</b>{t('sm.th.t6.g.a')}{cite([E, '§3.20'])}.</li>
            <li><b>VSWR</b>{t('sm.th.t6.vswr.a')}{cite([E, '§3.14'])}{t('sm.th.t6.vswr.b')}{Z0}·VSWR{cite([S2, '§2.3'])}.</li>
            <li><b>{t('sm.th.t6.rl.b')}</b>{t('sm.th.t6.rl.a')}<span className={css.nw}>RL = −20 log<sub>10</sub> |Γ|</span>{cite([S3, '§2.8'])}{t('sm.th.t6.rl.c')}{cite([S3, '§2.8'])}{t('sm.th.t6.rl.d')}</li>
            <li><b>{t('sm.th.t6.ml.b')}</b>{t('sm.th.t6.ml.a')}<span className={css.nw}>ML = −10 log<sub>10</sub>(1 − |Γ|²) dB</span>{t('sm.th.t6.ml.c')}{cite([S3, '§2.8'])}.</li>
          </ul>
          <Eq id="power-reflected" />
          <Eq id="power-delivered" />
          <Eq id="vswr" values={loadValues} note={t('sm.th.note.load')} />
          <Eq id="gamma-vswr" />
          <Eq id="z-max" values={loadValues} />
          <Eq id="z-min" values={loadValues} />
          <Eq id="return-loss" values={loadValues} />
          <Eq id="mismatch-loss" values={loadValues} />
          <p>
            {t('sm.th.t6.live.a')}{L('m-load-mag', num(m(0, M_MAG)))}{t('sm.th.t6.live.vswr')}{L('m-load-vswr', num(m(0, M_VSWR)))}
            {t('sm.th.t6.live.rl')}{L('m-load-rl', amt(m(0, M_RL), 'dB'))}, {L('m-load-ref', num(reflectedPower(m(0, M_MAG)) * 100))}
            {t('sm.th.t6.live.ref')}{L('m-load-ml', amt(m(0, M_ML), 'dB'))}{t('sm.th.t6.live.goal', { vswr: num(GOAL_VSWR) })}
            {L('goal-mag', num(GOAL_MAG))}{t('sm.th.t6.live.goalRl')}{L('goal-rl', amt(returnLoss(GOAL_MAG), 'dB'))}
            {t('sm.th.t6.live.goalAnd')}{L('goal-ref', num(reflectedPower(GOAL_MAG) * 100))}{t('sm.th.t6.live.goalRef')}
            {L('goal-ml', amt(mismatchLoss(GOAL_MAG), 'dB'))}{t('sm.th.t6.live.end')}
          </p>
          <div className={css.liveRow}>
            <div className={css.live}>
              {head(t('sm.th.t6.head'))}
              <table className={css.metrics}>
                <thead><tr><th /><th>{t('sm.th.t6.colLoad')}</th><th>{t('sm.th.t6.colInput')}</th></tr></thead>
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
          <p>{t('sm.th.t7.p1.a')}{jump('moving-on-the-chart', topicTitle('moving-on-the-chart'))}{t('sm.th.t7.p1.b')}{cite([S3, '§6.7'])}.</p>
          <Eq id="series-adds-z" />
          <Eq id="shunt-adds-y" />
          <Eq id="circle-r" />
          <Eq id="circle-g" />
          <Eq id="match-two-parts" note={t('sm.th.note.seriesThenShunt')} />
          <p>
            <b>{t('sm.th.t7.step.b')}</b>{t('sm.th.t7.step.a')}{L('start-load-z', cx(sm(0, M_ZR), sm(0, M_ZI)))}
            {t('sm.th.t7.step.c')}{L('start-x', num(added(SERIES_C, START_C, 0, START.f0, START.f0, START.z0)))}
            {t('sm.th.t7.step.d', { r: num(sm(0, M_ZR)) })}{L('start-node1-z', cx(sm(1, M_ZR), sm(1, M_ZI)))}
            {t('sm.th.t7.step.e')}{L('start-node1-y', cx(sm(1, M_YR), sm(1, M_YI)))}{t('sm.th.t7.step.f')}
            {L('start-b', num(added(SHUNT_L, START_L, 0, START.f0, START.f0, START.z0)))}{t('sm.th.t7.step.g')}
            {L('start-input-y', cx(sm(2, M_YR), sm(2, M_YI)))}{t('sm.th.t7.step.h')}{L('start-c', amt(START_C, 'F'))}
            {t('sm.th.t7.step.and')}{L('start-l', amt(START_L, 'H'))}.
          </p>
          <Eq id="x-series-c" values={{ x: tv(-1 / (START_W * START_C * START.z0)), X: tv(-1 / (START_W * START_C), 0, 'Ω'), omega: omegaTex(START.f0), C: tv(START_C, 0, 'F'), Z_0: tv(START.z0, 0, 'Ω') }} note={t('sm.th.note.startCircuit')} />
          <Eq id="b-shunt-l" values={{ b: tv(-START.z0 / (START_W * START_L)), B: tv(-1 / (START_W * START_L), 0, 'S'), omega: omegaTex(START.f0), L: tv(START_L, 0, 'H'), Z_0: tv(START.z0, 0, 'Ω') }} />
          <p>
            <b>{t('sm.th.t7.routes.b')}</b>{t('sm.th.t7.routes.a')}{jump('two-one-or-none', t('sm.th.t7.routes.link'))}{t('sm.th.t7.routes.c')}
          </p>
          <p>
            <b>{t('sm.th.t7.one.b')}</b>{t('sm.th.t7.one.a')}{L('start-load-y', cx(sm(0, M_YR), sm(0, M_YI)))}
            {t('sm.th.t7.one.c')}{L('start-shunt-c', amt(START_SHUNT_C, 'F'))}{t('sm.th.t7.one.d')}{cite([E, '§3.22'])}
            {t('sm.th.t7.one.e')}{cite([E, '§3.23'])}.
          </p>
          <Eq id="b-shunt-c" values={{ b: tv(START_W * START_SHUNT_C * START.z0), B: tv(START_W * START_SHUNT_C, 0, 'S'), omega: omegaTex(START.f0), C: tv(START_SHUNT_C, 0, 'F'), Z_0: tv(START.z0, 0, 'Ω') }} />
          <div className={css.liveRow}>
            <div className={css.live}>
              {head(t('sm.th.t7.head'))}
              <table className={css.metrics}>
                <thead><tr><th>{t('sm.th.t7.colNode')}</th><th>z</th><th>y</th></tr></thead>
                <tbody>
                  {Array.from({ length: n + 1 }, (_, k) => (
                    <tr key={k}><th>{k === 0 ? t('sm.th.t7.nodeLoad') : k === n ? t('sm.th.t7.nodeInput', { k }) : k}</th><td>{L(`node-${k}-z`, cx(m(k, M_ZR), m(k, M_ZI)))}</td><td>{L(`node-${k}-y`, cx(m(k, M_YR), m(k, M_YI)))}</td></tr>
                  ))}
                </tbody>
              </table>
              <p>
                {t('sm.th.t7.routeSummary.a', { r: num(zr), g: num(yr) })}{L('route-series', zr <= 1 ? t('sm.th.t7.open') : t('sm.th.t7.closed'))}
                {t('sm.th.t7.routeSummary.b')}{L('route-shunt', yr <= 1 ? t('sm.th.t7.open') : t('sm.th.t7.closed'))}{t('sm.th.t7.routeSummary.c')}
              </p>
              {c.parts.map((p, i) => (
                <p key={i}>
                  {i + 1} · {kindName(p.kind, locale)} {L(`part-${i}-value`, valueText(p.kind, p.value))}
                  {p.kind <= SHUNT_C || isStub(p.kind) ? <>{t('sm.th.t7.adds')}{p.kind === SERIES_R ? 'r' : p.kind === SHUNT_R ? 'g' : isSeries(p.kind) ? 'x' : 'b'} = {L(`part-${i}-added`, num(added(p.kind, p.value, p.zc ?? z0, f0, f0, z0)))}</> : null}
                </p>
              ))}
              <p>{t('sm.th.t7.loadQ')}{L('load-q', num(m(0, M_Q)))}.</p>
            </div>
            <MatchFigure />
          </div>
          <p>
            <b>Q.</b>{t('sm.th.t7.q.a')}√(R<sub>high</sub>/R<sub>low</sub> − 1){cite([S3, '§6.4'])}{t('sm.th.t7.q.b')}{cite([S3, '§6.4'])}
            {t('sm.th.t7.q.c')}{L('start-q', num(sm(0, M_Q)))}{t('sm.th.t7.q.d')}{jump('q-and-bandwidth', topicTitle('q-and-bandwidth'))}.
          </p>
          <Eq id="q-node" values={loadValues} note={t('sm.th.note.load')} />
          <Eq id="q-l-network" />
        </>
      ))}

      {/* Memoised on what they show: a change of the network alone (every drag's commit) does not render them again. */}
      <SolverTopics topic={(id, children) => topic(id, children, TOPICS.findIndex((x) => x.id === id) + 1)} cite={cite} L={L} jump={jump} Eq={Eq}
        outcome={outcome} lists={lists} bib={bib} folded={SOLVER_IDS.map((id) => (closed[id] ? '1' : '0')).join('')}
        back={back && SOLVER_IDS.includes(back.id) ? `${back.id}:${back.n}` : ''} locale={locale} />
      {/* M7.4b: after the solver's, so their citations are numbered in page order. */}
      <SweepCircuitContext.Provider value={c}>
        <SweepTopics topic={(id, children) => topic(id, children, TOPICS.findIndex((x) => x.id === id) + 1)} cite={cite} L={L} jump={jump} Eq={Eq}
          sweep={sweep} layer={layer} bib={bib} folded={SWEEP_IDS.map((id) => (closed[id] ? '1' : '0')).join('')}
          back={back && SWEEP_IDS.includes(back.id) ? `${back.id}:${back.n}` : ''} locale={locale} />
      </SweepCircuitContext.Provider>
    </div>
  );
}

/** Renders again only when the circuit changes (a commit), not on selection or hover. */
export default React.memo(Theory);
