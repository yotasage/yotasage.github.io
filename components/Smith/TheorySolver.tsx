// The solver's three topics of the Smith chart's Theory section (step M4.3c; docs/smith-chart/theory-solver.md §9–§11,
// page topics 8–10): two solutions, one or none; why one value cannot reach a point; realisable and standard values.
// Rendered by Theory's render body through solverTopics (not a component), so the citations are numbered in page order
// with the topics before them and the topics share Theory's folding, anchors and live spans.
//
// Numbers in the text are the start circuit's (D16) with the marks and goals each topic names, solved once here with
// solve.ts and standardVariants (E24, as the text says). The boxes show the visitor's own solve when the page's Solve
// panel has one of the kind the box is about (its Outcome: the same SolveResult, never solved again here), and else the
// start example. Every live span (data-live) is recomputed by name in scripts/harness/smith/ui-theory.mjs.

import React from 'react';

import { belowFloor, formatResidual } from '../../lib/quantity';
import { magFromVswr, returnLoss, vswr } from '../../lib/smith/convert';
import type { TexPiece } from '../../lib/smith/equations';
import { valueTex } from '../../lib/smith/equations';
import type { Goal } from '../../lib/smith/goal';
import { M_GI, M_GR, M_ZI, M_ZR, METRIC_STRIDE, evaluateCircuit } from '../../lib/smith/network';
import type { Circuit } from '../../lib/smith/network';
import { LINE, QUARTER, SERIES_C, SERIES_L, SERIES_R, SHUNT_C, SHUNT_L, SHUNT_R, added, isSeries } from '../../lib/smith/parts';
import { solve } from '../../lib/smith/solve';
import type { Solution, SolvedValue, SolveResult, ValueRange } from '../../lib/smith/solve';
import { askOf, defaultCircuit, withPart } from '../../lib/smith/state';
import { defaultChoice, standardVariants } from '../../lib/smith/values';
import type { ValueChoice, Variant } from '../../lib/smith/values';
import { translate } from '../../lib/ui/i18n';
import type { Locale, TranslationKey } from '../../lib/ui/translations';
import css from '../../styles/SmithTheory.module.css';
import { complexText } from './readout';
import { getSmithLocale, kindName } from './smithText';
import type { Outcome } from './SolvePanel';
import { distinctEnds } from './SolvePanel';
import { MismatchFigure, StandardFigure, TwoOneNoneFigure } from './TheoryFigures';

const M = 'WikiMobius', S3 = 'SteerVol3', WE = 'WikiE', JH = 'JohansonHighQ', WK = 'WurthWEKI';

type Values = Readonly<Record<string, TexPiece | undefined>>;
type EqProps = { id: string; values?: Values; note?: string };

/** The solver's topics, in the order of the page (their entries are in Theory's TOPICS). */
export const SOLVER_IDS: readonly string[] = ['two-one-or-none', 'one-value-and-a-point', 'realisable-values'];

export interface SolverCtx {
  topic: (id: string, children: React.ReactNode) => React.ReactNode;
  cite: (...refs: [string, string][]) => React.ReactNode;
  L: (key: string, text: string) => React.ReactNode;
  jump: (id: string, text: string) => React.ReactNode;
  Eq: (props: EqProps) => React.ReactElement;
  outcome: Outcome | null;
  lists: ValueChoice;
  /** What else they depend on, for the memo: the page's bibliography, the topics' folding, the way back and locale. */
  bib: unknown;
  folded: string;
  back: string;
  locale: Locale;
}

// ---- Texts (four significant digits with their zeros, as the rest of the theory) ----

// Rounding-level residuals as the bound of plan.md D20 (lib/quantity.ts formatResidual), never as 1e−17.
const num = (v: number): string => formatResidual(v, '', 4);
const amt = (v: number, unit: string): string => formatResidual(v, unit, 4);
const fin = (...v: number[]): boolean => v.every((n) => Number.isFinite(n));
/** A value of TeX at rounding level (D20, lib/quantity.ts): a residual part under the floor is put in as 0. */
const fl = (v: number): number => (belowFloor(v) ? 0 : v);
const tv = (re: number, im = 0, unit = ''): TexPiece | undefined => (fin(re, im) ? valueTex(unit && unit !== 'dB' ? re : fl(re), unit && unit !== 'dB' ? im : fl(im), unit) : undefined);
const omegaTex = (f0: number): TexPiece | undefined => {
  const f = tv(f0, 0, 'Hz');
  return f && { s: `2\\pi \\cdot ${f.s}`, p: 2, digit: true };
};
/** |Γ| as the topics write it: the bound of D20 below rounding (an exact match evaluates to about 1e-16). */
const gammaText = (v: number): string => num(v);
const lower = (s: string): string => `${s[0].toLowerCase()}${s.slice(1)}`;
const nodeText = (c: Circuit, k: number, locale: Locale = getSmithLocale()): string =>
  k === c.parts.length ? translate(locale, 'sm.ts.nodeInput')
    : k === 0 ? translate(locale, 'sm.ts.nodeLoad')
      : translate(locale, 'sm.ts.nodeN', { k });

/** A value in its unit: ohms, henries, farads, wavelengths at f0. */
function valueText(kind: number, value: number): string {
  switch (kind) {
    case SERIES_R: case SHUNT_R: case QUARTER: return amt(value, 'Ω');
    case SERIES_L: case SHUNT_L: return amt(value, 'H');
    case SERIES_C: case SHUNT_C: return amt(value, 'F');
    default: return `${num(value)} λ`;
  }
}

/** What a part adds: x or r in series, b or g in shunt (a stub b); '' for lines and λ/4. */
const addedSymbol = (kind: number): string => (kind === SERIES_R ? 'r' : kind === SHUNT_R ? 'g' : kind === SERIES_L || kind === SERIES_C ? 'x' : kind === LINE || kind === QUARTER ? '' : 'b');

/**
 * A solved value in words: "series C 31.83 pF (x = −1.000)", its swap and period noted; an x or b of exactly 0 (solve.ts
 * zeroRounding) is a plain connection in series and no part in shunt.
 */
export function solvedText(c: Circuit, v: SolvedValue, locale: Locale = getSmithLocale()): string {
  if (v.param === 'f0') return `f0 ${amt(v.value, 'Hz')}`;
  if (v.param === 'zc') return translate(locale, 'sm.ts.partZc', { n: v.part + 1, val: amt(v.value, 'Ω') });
  const sym = addedSymbol(v.kind);
  const what = !sym ? '' : v.added === 0
    ? ` (${sym} = 0: ${translate(locale, isSeries(v.kind) ? 'sm.ts.plainConn' : 'sm.ts.noPart')})`
    : ` (${sym} = ${num(v.added)})`;
  const own = c.parts[v.part]?.kind;
  return `${translate(locale, 'sm.ts.partVal', { n: v.part + 1, kind: lower(kindName(v.kind, locale)), val: valueText(v.kind, v.value) })}${what}${v.kind !== own ? translate(locale, 'sm.ts.otherKind') : ''}${v.swapped ? translate(locale, 'sm.ts.freqOnly') : ''}${v.period > 0 ? translate(locale, 'sm.ts.period') : ''}`;
}

/** A generalised circle [a, bx, by, c] as centre and radius, or a straight line (a = 0). */
function circleOf(k: Float64Array, o: number): { cx: number; cy: number; r: number } | null {
  const a = k[o];
  if (!(Math.abs(a) > 1e-12)) return null;
  const cx = k[o + 1] / a, cy = k[o + 2] / a;
  const r = Math.sqrt(Math.max(0, k[o + 1] * k[o + 1] + k[o + 2] * k[o + 2] - a * k[o + 3])) / Math.abs(a);
  // A centre on the real axis but for rounding (2e-17, whose last bits differ between engines) is on it.
  const tiny = 1e-12 * Math.max(1, Math.abs(cx), r);
  return { cx: Math.abs(cx) <= tiny ? 0 : cx, cy: Math.abs(cy) <= tiny ? 0 : cy, r };
}
export const circleText = (k: Float64Array, o: number, locale: Locale = getSmithLocale()): string => {
  const q = circleOf(k, o);
  return q ? translate(locale, 'sm.ts.circle', { c: complexText(q.cx, q.cy, '', 4), r: num(q.r) }) : translate(locale, 'sm.ts.line');
};
/** How two circles lie: they cross twice, touch or miss (relative 1e-9), from d against the sum and the difference of the radii. */
function caseText(k: Float64Array, locale: Locale = getSmithLocale()): { d: number; sum: number; diff: number; text: string } | null {
  const p = circleOf(k, 0), q = circleOf(k, 4);
  if (!p || !q) return null;
  const d = Math.hypot(p.cx - q.cx, p.cy - q.cy), sum = p.r + q.r, diff = Math.abs(p.r - q.r);
  const tol = 1e-9 * Math.max(1, sum);
  const text = Math.abs(d - sum) <= tol || Math.abs(d - diff) <= tol
    ? translate(locale, 'sm.ts.touch')
    : d < sum && d > diff ? translate(locale, 'sm.ts.cross') : translate(locale, 'sm.ts.miss');
  return { d, sum, diff, text };
}

/** The status of a two-unknown, point-target solve in words. */
export function statusText(r: SolveResult, locale: Locale = getSmithLocale()): string {
  switch (r.status) {
    case 'solved':
      return r.solutions.length === 1 ? translate(locale, 'sm.ts.oneSol')
        : r.solutions.length === 2 ? translate(locale, 'sm.ts.twoSols')
          : translate(locale, 'sm.ts.nSols', { n: r.solutions.length });
    case 'none': return translate(locale, r.sameJob ? 'sm.ts.sameJobNone' : 'sm.ts.noSol');
    case 'coincident': return translate(locale, r.sameJob ? 'sm.ts.sameJobCoinc' : 'sm.ts.everyWorks');
    default: return r.status;
  }
}

/** A range of the first unknown in words. */
export function rangeText(c: Circuit, r: SolveResult, g: ValueRange, locale: Locale = getSmithLocale()): string {
  const u = r.unknowns[0];
  if (u.param === 'f0') return translate(locale, 'sm.ts.rangeFromTo', { what: 'f0', min: amt(g.min, 'Hz'), max: amt(g.max, 'Hz') });
  if (u.param === 'zc') return translate(locale, 'sm.ts.rangeFromTo', { what: 'Zc', min: amt(g.min, 'Ω'), max: amt(g.max, 'Ω') });
  const kind = g.kind >= 0 ? g.kind : c.parts[u.part].kind;
  return `${translate(locale, 'sm.ts.rangeFromTo', { what: lower(kindName(kind, locale)), min: valueText(kind, g.min), max: valueText(kind, g.max) })}${g.swapped ? translate(locale, 'sm.ts.freqOnly') : ''}`;
}

/** A variant's values in words: "33.00 pF · 82.00 nH". */
export function variantText(s: Solution, v: Variant): string {
  return v.values.map((x, j) => {
    const u = s.values[j];
    return u.param === 'f0' ? amt(x, 'Hz') : u.param === 'zc' ? amt(x, 'Ω') : valueText(u.kind, x);
  }).join(' · ');
}

/** The list per kind as the Solve panel's summary names it. */
export const listsText = (lists: ValueChoice, locale: Locale = getSmithLocale()): string =>
  (['R', 'L', 'C', 'Z'] as const).map((k) => `${k === 'Z' ? 'Zt, Zc' : k} ${lists[k].id === 'own' ? translate(locale, 'sm.ts.ownList') : lists[k].id === 'any' ? translate(locale, 'sm.ts.anyValue') : lists[k].id}`).join(' · ');

/** The coordinate of the start value of a family's first unknown: atan of what it adds (solve.ts's angle mode). */
export const startCoord = (c: Circuit, u: { part: number }): number => {
  const p = c.parts[u.part];
  return Math.atan(added(p.kind, p.value, p.zc ?? c.z0, c.f0, c.f0, c.z0));
};

// ---- The start examples (the topics' marks and goals on defaultCircuit()), solved once ----

const START = defaultCircuit();
const BOTH = [{ part: 0, param: 'value' as const }, { part: 1, param: 'value' as const }];
const FIRST = [{ part: 0, param: 'value' as const }];
const CENTRE: Goal = { kind: 'point' };
const VSWR_GOAL: Goal = { kind: 'vswr', value: 1.5, within: true };
const NEAR_GOAL: Goal = { kind: 'point', node: 1 };

interface Start {
  two: SolveResult; family: SolveResult; familyT: number; members: Solution[]; best: SolveResult; range: SolveResult; gCircle: SolveResult;
  r50: SolveResult; r100: SolveResult; variants: Variant[]; points: { gr: number; gi: number; label: string }[];
  /** z at node 1 with the nearest value: real (x = 0 there), its rounding-level imaginary part dropped (it differs between the static page's engine and the browser's). */
  bestZ: [number, number];
}
let start: Start | null = null;
function startExamples(): Start {
  if (start) return start;
  const two = solve(START, BOTH, CENTRE);
  const family = solve(START, BOTH, VSWR_GOAL);
  const familyT = startCoord(START, BOTH[0]);
  const best = solve(START, FIRST, NEAR_GOAL);
  const variants = standardVariants(START, CENTRE, two.solutions[0], defaultChoice());
  // Each E24 variant's input point (the §11 figure): the circuit with its values, evaluated.
  const points = variants.map((v) => {
    let c = START;
    two.solutions[0].values.forEach((u, j) => { c = withPart(c, u.part, { kind: u.kind as 0, value: v.values[j] }); });
    const m = evaluateCircuit(c).metrics, k = c.parts.length * METRIC_STRIDE;
    return { gr: m[k + M_GR], gi: m[k + M_GI], label: variantText(two.solutions[0], v).replace(/\.00 /g, ' ').replace(/\.0 /g, ' ') };
  });
  let bc = START;
  if (best.solutions[0]) bc = withPart(bc, 0, { kind: best.solutions[0].values[0].kind as 0, value: best.solutions[0].values[0].value });
  const bm = evaluateCircuit(bc).metrics;
  start = {
    two, family, familyT, members: family.family ? family.family.at(familyT) : [], best, range: solve(START, FIRST, VSWR_GOAL),
    gCircle: solve(START, FIRST, { kind: 'g', value: 1, node: 1 }),
    r50: solve({ ...START, loadR: 50 }, BOTH, CENTRE), r100: solve({ ...START, loadR: 100 }, BOTH, CENTRE),
    variants, points, bestZ: [bm[METRIC_STRIDE + M_ZR], bm[METRIC_STRIDE + M_ZI]],
  };
  return start;
}

function solverTopics({ topic, cite, L, jump, Eq, outcome, lists, locale }: SolverCtx): React.ReactNode {
  const t = (key: TranslationKey, vars?: Record<string, string | number>) => translate(locale, key, vars);
  const st = startExamples();
  const r = outcome?.result ?? null;
  const oc = outcome?.circuit ?? START;
  const goal = r ? askOf(oc).goal : CENTRE;
  const head = (mine: boolean, what: string) => <div className={css.liveHead}>{mine ? t('sm.th.yourCircuit') : t('sm.th.startCircuit')}<span>{what}</span></div>;

  // ---- Topic 8's numbers ----
  const s1 = st.two.solutions[0], s2 = st.two.solutions[1];
  const tc = caseText(st.two.circles, locale);
  const c1 = circleOf(st.two.circles, 0), c2 = circleOf(st.two.circles, 4);
  const fr = st.family.ranges[0];
  // The two circles: the visitor's two unknowns and a point target, or the start example.
  const twoMine = !!r && r.unknowns.length === 2 && goal.kind === 'point' && r.circleNode >= 0;
  const tr = twoMine ? r : st.two, tcirc = twoMine ? oc : START, tcase = caseText(tr.circles, locale);
  const famMine = !!r && r.status === 'family' && !!r.family && r.ranges.length > 0;
  const fres = famMine ? r : st.family, fcirc = famMine ? oc : START;
  const ft = famMine ? 0.5 * (r.ranges[0].t0 + r.ranges[0].t1) : st.familyT;
  const fmembers = famMine ? r.family.at(ft) : st.members;

  // ---- Topic 9's ----
  const b0 = st.best.solutions[0], bm = b0?.mismatch ?? NaN;
  const bestMine = !!r && r.status === 'best' && r.solutions.length > 0;
  const br = bestMine ? r : st.best, bcirc = bestMine ? oc : START;
  const rangeMine = !!r && r.status === 'range';
  const rr = rangeMine ? r : st.range, rcirc = rangeMine ? oc : START;
  const rg = st.range.ranges[0];
  const gSols = st.gCircle.solutions;

  // ---- Topic 10's ----
  const v = st.variants;
  const valsOf = (k: number) => v.map((x) => x.values[k]);
  const sols = r ? (r.status === 'family' && r.family ? distinctEnds(r.family.ends) : r.solutions) : [];
  const listMine = sols.length > 0;
  const lsols = listMine ? sols : st.two.solutions, lcirc = listMine ? oc : START, lgoal = listMine ? goal : CENTRE;
  const lvariants = standardVariants(lcirc, lgoal, lsols[0], lists).filter((x) => !x.exact);

  return (
    <>
      {topic('two-one-or-none', (
        <>
          <p>
            {t('sm.th.t8.p1.a')}Z<sub>c</sub> ({jump('moving-on-the-chart', t('sm.th.topic.moving-on-the-chart'))}{t('sm.th.t8.p1.b')}
            {cite([M, '“Elementary properties”'])}{t('sm.th.t8.p1.c')}{cite([S3, '§6.7'])}.
          </p>
          <p>
            <b>{t('sm.th.t8.why.b')}</b>{t('sm.th.t8.why.a')}R<sub>1</sub>{t('sm.th.t8.why.and')}R<sub>2</sub>{t('sm.th.t8.why.c')}
            <span className={css.nw}>|R<sub>1</sub> − R<sub>2</sub>| &lt; d &lt; R<sub>1</sub> + R<sub>2</sub></span>
            {t('sm.th.t8.why.d')}{cite([S3, '§6.4'])}.
          </p>
          <p><b>{t('sm.th.t8.one.b')}</b>{t('sm.th.t8.one.a')}</p>
          <Eq id="series-adds-z" />
          <Eq id="shunt-adds-y" />
          <Eq id="circle-r" />
          <Eq id="circle-g" />
          <Eq id="mobius" />
          <p>
            <b>{t('sm.th.t8.start.b')}</b>{t('sm.th.t8.start.a')}{L('sv9-c1-centre', num(c1?.cx ?? NaN))}{t('sm.th.t8.start.rad')}
            {L('sv9-c1-radius', num(c1?.r ?? NaN))}{t('sm.th.t8.start.c')}{L('sv9-c2-centre', num(c2?.cx ?? NaN))}{t('sm.th.t8.start.rad')}
            {L('sv9-c2-radius', num(c2?.r ?? NaN))}{t('sm.th.t8.start.d')}{L('sv9-d', num(tc?.d ?? NaN))}{t('sm.th.t8.start.e')}
            {L('sv9-diff', num(tc?.diff ?? NaN))}{t('sm.th.t8.start.and')}{L('sv9-sum', num(tc?.sum ?? NaN))}{t('sm.th.t8.start.f')}
            <span className={css.nw}>z = 0.5 − j0.5</span>{t('sm.th.t8.start.and')}<span className={css.nw}>z = 0.5 + j0.5</span> (<span className={css.nw}>Γ = −0.2 ∓ j0.4</span>)
            {t('sm.th.t8.start.g')}{L('sv9-s1-c', amt(s1?.values[0].value ?? NaN, 'F'))}, L {L('sv9-s1-l', amt(s1?.values[1].value ?? NaN, 'H'))} (
            {jump('matching-with-two-parts', t('sm.th.topic.matching-with-two-parts'))}){t('sm.th.t8.start.h')}
            {L('sv9-s2-x', num(s2?.values[0].added ?? NaN))}{t('sm.th.t8.start.i')}{L('sv9-s2-b', num(s2?.values[1].added ?? NaN))}
            {t('sm.th.t8.start.j')}{L('sv9-s2-c', amt(s2?.values[1].value ?? NaN, 'F'))}{t('sm.th.t8.start.k')}
            {L('sv9-s1-gamma', gammaText(s1?.gamma ?? NaN))}{t('sm.th.t8.start.l')}
          </p>
          <div className={css.liveRow}>
            <div className={css.live} data-solver-box="two">
              {head(twoMine, t('sm.th.t8.boxHead', { node: nodeText(tcirc, tr.circleNode, locale) }))}
              <p>{t('sm.th.t8.solved')}{L('b9-status', statusText(tr, locale))}.</p>
              <p>{t('sm.th.t8.first')}{L('b9-c1', circleText(tr.circles, 0, locale))}</p>
              <p>{t('sm.th.t8.second')}{L('b9-c2', circleText(tr.circles, 4, locale))}</p>
              {tcase && <p>d = {L('b9-d', num(tcase.d))}, R<sub>1</sub> + R<sub>2</sub> = {L('b9-sum', num(tcase.sum))}, |R<sub>1</sub> − R<sub>2</sub>| = {L('b9-diff', num(tcase.diff))}: {L('b9-case', tcase.text)}</p>}
              {tr.solutions.map((s, k) => (
                <p key={k}>
                  {k + 1}. {s.values.map((u, j) => <React.Fragment key={j}>{j ? '; ' : ''}{L(`b9-s${k}-v${j}`, solvedText(tcirc, u, locale))}</React.Fragment>)};
                  {' '}|Γ| = {L(`b9-s${k}-gamma`, gammaText(s.gamma))}
                </p>
              ))}
            </div>
            <TwoOneNoneFigure />
          </div>
          <p>
            <b>{t('sm.th.t8.count.b')}</b>{t('sm.th.t8.count.a')}{L('sv9-r50-c', amt(st.r50.solutions[0]?.values[0].value ?? NaN, 'F'))}
            {t('sm.th.t8.count.c')}{L('sv9-r50-l', amt(st.r50.solutions[0]?.values[1].value ?? NaN, 'H'))}
            {t('sm.th.t8.count.d')}{L('sv9-r100', statusText(st.r100, locale))}{t('sm.th.t8.count.e')}
            {jump('matching-with-two-parts', t('sm.th.topic.matching-with-two-parts'))}{t('sm.th.t8.count.f')}
          </p>
          <p>
            <b>{t('sm.th.t8.circ.b')}</b>{t('sm.th.t8.circ.a')}{jump('one-value-and-a-point', t('sm.th.t8.circ.next'))}
            {t('sm.th.t8.circ.c')}{L('sv9-fam-c', amt(st.members[0]?.values[0].value ?? NaN, 'F'))}{t('sm.th.t8.circ.d')}
            {L('sv9-fam-l0', amt(st.members[0]?.values[1].value ?? NaN, 'H'))}{t('sm.th.t8.circ.or')}
            {L('sv9-fam-l1', amt(st.members[1]?.values[1].value ?? NaN, 'H'))}{t('sm.th.t8.circ.e')}
            {L('sv9-fam-min', amt(fr?.min ?? NaN, 'F'))}{t('sm.th.t8.circ.to')}{L('sv9-fam-max', amt(fr?.max ?? NaN, 'F'))}
            {t('sm.th.t8.circ.f')}
          </p>
          <div className={css.live} data-solver-box="family">
            {head(famMine, famMine ? t('sm.th.t8.famMine') : t('sm.th.t8.famStart'))}
            {fmembers.length ? (
              <>
                <p>{t('sm.th.t8.famAt')}{L('b9f-first', solvedText(fcirc, fmembers[0].values[0], locale))}:</p>
                {fmembers.map((s, i) => <p key={i}>{L(`b9f-m${i}`, solvedText(fcirc, s.values[1], locale))}</p>)}
              </>
            ) : <p>{L('b9f-none', t('sm.th.t8.famNone'))}</p>}
            <p>{t('sm.th.t8.famRanges')}</p>
            {fres.ranges.map((g, k) => <p key={k}>{L(`b9f-r${k}`, rangeText(fcirc, fres, g, locale))}</p>)}
          </div>
          <Eq id="x-series-c" />
          <Eq id="b-shunt-c" />
          <Eq id="b-shunt-l" />
        </>
      ))}

      {topic('one-value-and-a-point', (
        <>
          <p>{t('sm.th.t9.p1.a')}Γ<sub>r</sub>{t('sm.th.t8.why.and')}Γ<sub>i</sub>{t('sm.th.t9.p1.b')}</p>
          <p><b>{t('sm.th.t9.near.b')}</b>{t('sm.th.t9.near.a')}</p>
          <Eq id="gamma-z" />
          <Eq id="circle-r" />
          <Eq id="mismatch-to-target" note={t('sm.th.t9.noteNear')}
            values={{ m: tv(bm), z: tv(st.bestZ[0]), z_t: tv(1), Gamma: tv((st.bestZ[0] - 1) / (st.bestZ[0] + 1)), Gamma_t: tv(0) }} />
          <p>
            <b>{t('sm.th.t9.start.b')}</b>{t('sm.th.t9.start.a')}
            <span className={css.nw}>|Γ|² = ((r − 1)² + x²)/((r + 1)² + x²)</span>
            {t('sm.th.t9.start.c')}{L('sv10-x', num(b0?.values[0].added ?? NaN))}, C = {L('sv10-c', amt(b0?.values[0].value ?? NaN, 'F'))}
            {t('sm.th.t9.start.d')}{L('sv10-m', num(bm))}{t('sm.th.t9.start.e')}{L('sv10-vswr', num(vswr(bm)))}{t('sm.th.t9.start.f')}
          </p>
          <Eq id="x-series-c" note={t('sm.th.t9.noteNearShort')}
            values={b0 ? { x: tv(b0.values[0].added), X: tv(b0.values[0].added * START.z0, 0, 'Ω'), omega: omegaTex(START.f0), C: tv(b0.values[0].value, 0, 'F'), Z_0: tv(START.z0, 0, 'Ω') } : undefined} />
          <div className={css.liveRow}>
            <div className={css.live} data-solver-box="best">
              {head(bestMine, t('sm.th.t9.boxHead', { node: nodeText(bcirc, br.goalNode, locale) }))}
              <p>{L('b10-v', solvedText(bcirc, br.solutions[0].values[0], locale))}</p>
              <p>m = {L('b10-m', num(br.solutions[0].mismatch))}{t('sm.th.t9.asVswr')}{L('b10-vswr', num(vswr(br.solutions[0].mismatch)))})</p>
              {br.circleNode >= 0 && (
                <>
                  <p>{t('sm.th.t9.partCircle')}{L('b10-c1', circleText(br.circles, 0, locale))}</p>
                  <p>{t('sm.th.t9.touchCircle')}{L('b10-c2', circleText(br.circles, 4, locale))}</p>
                </>
              )}
            </div>
            <MismatchFigure />
          </div>
          <p>
            <b>{t('sm.th.t9.range.b')}</b>{t('sm.th.t9.range.a')}{L('sv10-min', amt(rg?.min ?? NaN, 'F'))}
            {t('sm.th.t9.range.to')}{L('sv10-max', amt(rg?.max ?? NaN, 'F'))}{t('sm.th.t9.range.c')}
            <span className={css.nw}>C = 1/(ω{'Z'}<sub>0</sub>(1 ± 1/√24))</span>{t('sm.th.t9.range.d')}
            {gSols.map((s, k) => <React.Fragment key={k}>{k ? t('sm.th.t9.range.andAt') : ''}{L(`sv10-g${k}`, solvedText(START, s.values[0], locale))}</React.Fragment>)}.
          </p>
          <div className={css.live} data-solver-box="range">
            {head(rangeMine, t('sm.th.t9.rangeHead', { node: nodeText(rcirc, rr.goalNode, locale) }))}
            {rr.ranges.length
              ? rr.ranges.map((g, k) => <p key={k}>{L(`b10r-r${k}`, rangeText(rcirc, rr, g, locale))}</p>)
              : <p>{L('b10r-none', t('sm.th.t9.rangeNone'))}</p>}
          </div>
          <Eq id="gamma-vswr" />
        </>
      ))}

      {topic('realisable-values', (
        <>
          <p>
            <b>{t('sm.th.t10.val.b')}</b>{t('sm.th.t10.val.a')}<span className={css.nw}>x = −1/(ωC{'Z'}<sub>0</sub>)</span>
            {t('sm.th.t10.val.c')}<span className={css.nw}>x = ωL/Z<sub>0</sub></span>{t('sm.th.t10.val.d')}f<sub>0</sub>
            {t('sm.th.t10.val.e')}{L('sv11-s2-c', amt(s2?.values[1].value ?? NaN, 'F'))}{t('sm.th.t10.val.f')}
          </p>
          <Eq id="x-series-l" />
          <Eq id="x-series-c" />
          <Eq id="b-shunt-l" />
          <Eq id="b-shunt-c" values={s2 ? { b: tv(s2.values[1].added), B: tv(s2.values[1].added / START.z0, 0, 'S'), omega: omegaTex(START.f0), C: tv(s2.values[1].value, 0, 'F'), Z_0: tv(START.z0, 0, 'Ω') } : undefined}
            note={t('sm.th.t10.noteSwap')} />
          <p>{t('sm.th.t10.p2.a')}Z<sub>t</sub>{t('sm.th.t10.p2.b')}</p>
          <Eq id="quarter-wave" />
          <p>
            <b>{t('sm.th.t10.len.b')}</b>{t('sm.th.t10.len.a')}f<sub>0</sub>{t('sm.th.t10.len.c')}
            {jump('transmission-lines', t('sm.th.topic.transmission-lines'))}{t('sm.th.t10.len.d')}f<sub>0</sub>
            {t('sm.th.t10.len.e')}f<sub>0</sub>{t('sm.th.t10.len.f')}f<sub>0</sub>{t('sm.th.t10.len.g')}
            {jump('q-and-bandwidth', t('sm.th.topic.q-and-bandwidth'))}).
          </p>
          <Eq id="line-rotation" />
          <Eq id="line-theta" />
          <Eq id="beta" />
          <p>
            <b>{t('sm.th.t10.std.b')}</b>{t('sm.th.t10.std.a')}{cite([WE, ''])}{t('sm.th.t10.std.c')}10<sup>1/24</sup>
            {t('sm.th.t10.std.d')}{cite([WE, ''])}{t('sm.th.t10.std.e')}{cite([JH, ''])}{t('sm.th.t10.std.f')}{cite([WK, ''])}.
          </p>
          <p>{t('sm.th.t10.std2.a')}Z<sub>t</sub>{t('sm.th.t8.why.and')}Z<sub>c</sub>{t('sm.th.t10.std2.b')}</p>
          <p>
            <b>{t('sm.th.t10.e24.b')}</b> {L('sv9-s1-c', amt(s1?.values[0].value ?? NaN, 'F'))}
            {t('sm.th.t10.e24.lies')}{L('sv11-c-lo', amt(Math.min(...valsOf(0)), 'F'))}{t('sm.th.t10.e24.and')}
            {L('sv11-c-hi', amt(Math.max(...valsOf(0)), 'F'))}, {L('sv9-s1-l', amt(s1?.values[1].value ?? NaN, 'H'))}
            {t('sm.th.t10.e24.between')}{L('sv11-l-lo', amt(Math.min(...valsOf(1)), 'H'))}{t('sm.th.t10.e24.and')}
            {L('sv11-l-hi', amt(Math.max(...valsOf(1)), 'H'))}.{' '}
            {v.map((x, j) => (
              <React.Fragment key={j}>
                {j === 0 ? '' : j === v.length - 1 ? `,${t('sm.th.t10.e24.and')}` : ', '}
                {L(`sv11-v${j}`, variantText(s1, x))}{t('sm.th.t10.e24.gives')}{j === 0 ? ' |Γ| =' : ''} {L(`sv11-v${j}-gamma`, num(x.gamma))}
                {j === 0 && <> (VSWR {L('sv11-v0-vswr', num(vswr(x.gamma)))}{t('sm.th.t10.e24.rl')}{L('sv11-v0-rl', amt(returnLoss(x.gamma), 'dB'))})</>}
                {j === v.length - 1 && j > 0 && <> (VSWR {L(`sv11-v${j}-vswr`, num(vswr(x.gamma)))})</>}
              </React.Fragment>
            ))}. {v.every((x) => x.gamma <= magFromVswr(1.5)) ? t('sm.th.t10.e24.allIn') : t('sm.th.t10.e24.notAllIn')}
            {t('sm.th.t10.e24.closeEnough')}
          </p>
          <Eq id="vswr" values={v[0] ? { VSWR: tv(vswr(v[0].gamma)), Gamma: tv(v[0].gamma) } : undefined} note={t('sm.th.t10.notePair')} />
          <Eq id="return-loss" values={v[0] ? { RL: tv(returnLoss(v[0].gamma), 0, 'dB'), Gamma: tv(v[0].gamma) } : undefined} />
          <div className={css.liveRow}>
            <div className={css.live} data-solver-box="standard">
              {head(listMine, t('sm.th.t10.boxHead'))}
              {lsols.map((s, k) => (
                <p key={k}>
                  {k + 1}. {s.values.map((u, j) => <React.Fragment key={j}>{j ? '; ' : ''}{L(`b11-s${k}-v${j}`, solvedText(lcirc, u, locale))}</React.Fragment>)}
                </p>
              ))}
              <p>{t('sm.th.t10.lists')}{L('b11-lists', listsText(lists, locale))}</p>
              {lvariants.length ? lvariants.map((x, j) => (
                <p key={j}>{L(`b11-v${j}`, variantText(lsols[0], x))}: |Γ| = {L(`b11-v${j}-gamma`, num(x.gamma))}</p>
              )) : <p>{L('b11-none', t('sm.th.t10.noneDiff'))}</p>}
            </div>
            <StandardFigure points={st.points} />
          </div>
          <p><b>{t('sm.th.t10.lim.b')}</b>{t('sm.th.t10.lim.a')}{cite([WK, ''])}.</p>
        </>
      ))}
    </>
  );
}

/**
 * The topics as a component of their own, rendered again only when what they show changes (the Solve panel's outcome,
 * the lists, folding, the way back, locale): Theory renders on every committed network change (a drag's end), and these
 * topics' text and equations made that render long enough to delay the strip's key handling (ui-strip's moves). The
 * functions come from Theory's latest render, which is the one that renders them. Their citations are made after
 * Theory's (a child renders after its parent), so the numbers stay in page order.
 */
export const SolverTopics = React.memo(function SolverTopics(props: SolverCtx) {
  return <>{solverTopics(props)}</>;
}, (a, b) => a.outcome === b.outcome && a.lists === b.lists && a.bib === b.bib && a.folded === b.folded && a.back === b.back && a.locale === b.locale);
