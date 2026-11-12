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

import { formatAmount } from '../../lib/quantity';
import { magFromVswr, returnLoss, vswr } from '../../lib/smith/convert';
import type { TexPiece } from '../../lib/smith/equations';
import { valueTex } from '../../lib/smith/equations';
import type { Goal } from '../../lib/smith/goal';
import { M_GI, M_GR, M_ZI, M_ZR, METRIC_STRIDE, evaluateCircuit } from '../../lib/smith/network';
import type { Circuit } from '../../lib/smith/network';
import { LINE, QUARTER, SERIES_C, SERIES_L, SERIES_R, SHUNT_C, SHUNT_L, SHUNT_R, added, isSeries } from '../../lib/smith/parts';
import { solve } from '../../lib/smith/solve';
import type { Solution, SolvedValue, SolveResult, ValueRange } from '../../lib/smith/solve';
import { KIND_NAMES, askOf, defaultCircuit, withPart } from '../../lib/smith/state';
import { defaultChoice, standardVariants } from '../../lib/smith/values';
import type { ValueChoice, Variant } from '../../lib/smith/values';
import css from '../../styles/SmithTheory.module.css';
import { complexText } from './readout';
import type { Outcome } from './SolvePanel';
import { distinctEnds } from './SolvePanel';
import { MismatchFigure, StandardFigure, TwoOneNoneFigure } from './TheoryFigures';

const M = 'WikiMobius', S3 = 'SteerVol3', WE = 'WikiE', JH = 'JohansonHighQ', WK = 'WurthWEKI';
const TAU = 2 * Math.PI;

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
  /** What else they depend on, for the memo: the page's bibliography, the topics' folding and the way back. */
  bib: unknown;
  folded: string;
  back: string;
}

// ---- Texts (four significant digits with their zeros, as the rest of the theory) ----

const num = (v: number): string => formatAmount(v, '', 4, true);
const amt = (v: number, unit: string): string => formatAmount(v, unit, 4, true);
const fin = (...v: number[]): boolean => v.every((n) => Number.isFinite(n));
const tv = (re: number, im = 0, unit = ''): TexPiece | undefined => (fin(re, im) ? valueTex(re, im, unit) : undefined);
const omegaTex = (f0: number): TexPiece | undefined => {
  const f = tv(f0, 0, 'Hz');
  return f && { s: `2\\pi \\cdot ${f.s}`, p: 2, digit: true };
};
/** |Γ| as the topics write it: 0 below rounding (an exact match evaluates to about 1e-16). */
const gammaText = (v: number): string => (v < 1e-12 ? '0' : num(v));
const lower = (s: string): string => `${s[0].toLowerCase()}${s.slice(1)}`;
const nodeText = (c: Circuit, k: number): string => (k === c.parts.length ? 'the input' : k === 0 ? 'the load' : `node ${k}`);

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
export function solvedText(c: Circuit, v: SolvedValue): string {
  if (v.param === 'f0') return `f0 ${amt(v.value, 'Hz')}`;
  if (v.param === 'zc') return `part ${v.part + 1}’s Zc ${amt(v.value, 'Ω')}`;
  const sym = addedSymbol(v.kind);
  const what = !sym ? '' : v.added === 0 ? ` (${sym} = 0: ${isSeries(v.kind) ? 'a plain connection' : 'no part'})` : ` (${sym} = ${num(v.added)})`;
  const own = c.parts[v.part]?.kind;
  return `part ${v.part + 1}: ${lower(KIND_NAMES[v.kind])} ${valueText(v.kind, v.value)}${what}${v.kind !== own ? ' as the other kind' : ''}${v.swapped ? ', true at this frequency only' : ''}${v.period > 0 ? ', + λ/2 gives the same at f0' : ''}`;
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
export const circleText = (k: Float64Array, o: number): string => {
  const q = circleOf(k, o);
  return q ? `centre ${complexText(q.cx, q.cy, '')}, radius ${num(q.r)}` : 'a straight line';
};
/** How two circles lie: they cross twice, touch or miss (relative 1e-9), from d against the sum and the difference of the radii. */
function caseText(k: Float64Array): { d: number; sum: number; diff: number; text: string } | null {
  const p = circleOf(k, 0), q = circleOf(k, 4);
  if (!p || !q) return null;
  const d = Math.hypot(p.cx - q.cx, p.cy - q.cy), sum = p.r + q.r, diff = Math.abs(p.r - q.r);
  const tol = 1e-9 * Math.max(1, sum);
  const text = Math.abs(d - sum) <= tol || Math.abs(d - diff) <= tol ? 'they touch: one point' : d < sum && d > diff ? 'they cross twice' : 'they miss';
  return { d, sum, diff, text };
}

/** The status of a two-unknown, point-target solve in words. */
export function statusText(r: SolveResult): string {
  switch (r.status) {
    case 'solved': return r.solutions.length === 1 ? 'one solution' : `${r.solutions.length === 2 ? 'two' : r.solutions.length} solutions`;
    case 'none': return r.sameJob ? 'none: the two parts do the same job' : 'no solution';
    case 'coincident': return r.sameJob ? 'the two parts do the same job: any value of one has one of the other' : 'every value works';
    default: return r.status;
  }
}

/** A range of the first unknown in words. */
export function rangeText(c: Circuit, r: SolveResult, g: ValueRange): string {
  const u = r.unknowns[0];
  if (u.param === 'f0') return `f0 from ${amt(g.min, 'Hz')} to ${amt(g.max, 'Hz')}`;
  if (u.param === 'zc') return `Zc from ${amt(g.min, 'Ω')} to ${amt(g.max, 'Ω')}`;
  const kind = g.kind >= 0 ? g.kind : c.parts[u.part].kind;
  return `${lower(KIND_NAMES[kind])} from ${valueText(kind, g.min)} to ${valueText(kind, g.max)}${g.swapped ? ', true at this frequency only' : ''}`;
}

/** A variant's values in words: "33.00 pF · 82.00 nH". */
export function variantText(s: Solution, v: Variant): string {
  return v.values.map((x, j) => {
    const u = s.values[j];
    return u.param === 'f0' ? amt(x, 'Hz') : u.param === 'zc' ? amt(x, 'Ω') : valueText(u.kind, x);
  }).join(' · ');
}

/** The list per kind as the Solve panel's summary names it. */
export const listsText = (lists: ValueChoice): string =>
  (['R', 'L', 'C', 'Z'] as const).map((k) => `${k === 'Z' ? 'Zt, Zc' : k} ${lists[k].id === 'own' ? 'own list' : lists[k].id === 'any' ? 'any value' : lists[k].id}`).join(' · ');

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

function solverTopics({ topic, cite, L, jump, Eq, outcome, lists }: SolverCtx): React.ReactNode {
  const st = startExamples();
  const r = outcome?.result ?? null;
  const oc = outcome?.circuit ?? START;
  const goal = r ? askOf(oc).goal : CENTRE;
  const head = (mine: boolean, what: string) => <div className={css.liveHead}>{mine ? 'Your circuit' : 'Start circuit'}<span>{what}</span></div>;

  // ---- Topic 8's numbers ----
  const s1 = st.two.solutions[0], s2 = st.two.solutions[1];
  const tc = caseText(st.two.circles);
  const c1 = circleOf(st.two.circles, 0), c2 = circleOf(st.two.circles, 4);
  const fr = st.family.ranges[0];
  // The two circles: the visitor's two unknowns and a point target, or the start example.
  const twoMine = !!r && r.unknowns.length === 2 && goal.kind === 'point' && r.circleNode >= 0;
  const tr = twoMine ? r : st.two, tcirc = twoMine ? oc : START, tcase = caseText(tr.circles);
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
            Every value the solver is asked for moves a node on a circle: a series reactance along its r circle, a shunt one
            along its g circle, a line round its circle about Z<sub>c</sub> ({jump('moving-on-the-chart', 'Moving on the chart')}).
            Fixed parts in between carry a circle to another circle, since each part maps Γ by a Möbius
            transformation{cite([M, '“Elementary properties”'])}. So with two unknowns and a target point the solver draws two
            circles at the node between them: where the first unknown can take that node, and where the second must start
            from to end on the target. A node on both is a solution, so the solutions are where the circles cross; it is the
            textbook’s construction on the chart: land the point on the circle through the target, then move along
            it{cite([S3, '§6.7'])}.
          </p>
          <p>
            <b>Why two, one or none.</b> Two circles whose centres are d apart, with radii R<sub>1</sub> and R<sub>2</sub>,
            cross twice when <span className={css.nw}>|R<sub>1</sub> − R<sub>2</sub>| &lt; d &lt; R<sub>1</sub> + R<sub>2</sub></span>,
            touch once when d equals either end, and miss otherwise. Two different circles never share more than two points.
            So the page says “Two solutions.”, “One solution: the two circles just touch.” or “No solution.” with its reason.
            The textbook’s L network has two answers too, a low-pass and a high-pass one{cite([S3, '§6.4'])}.
          </p>
          <p>
            <b>When the circles are one.</b> Two series reactances in a row both move the node along the same r circle, so
            they act as one part. If that circle misses the target there is no solution (“These two parts do the same
            job.”); if it passes through, every value of one has a value of the other, and the page asks to fix one of them.
          </p>
          <Eq id="series-adds-z" />
          <Eq id="shunt-adds-y" />
          <Eq id="circle-r" />
          <Eq id="circle-g" />
          <Eq id="mobius" />
          <p>
            <b>The start circuit.</b> Mark both values (part 1’s C and part 2’s L under “Solve for”) and keep the goal, the
            centre at the input. The first circle is the load’s r = 0.5 circle: centre Γ = {L('sv9-c1-centre', num(c1?.cx ?? NaN))},
            radius {L('sv9-c1-radius', num(c1?.r ?? NaN))}. The second is g = 1, the circle a shunt part must start on to end at
            the centre: centre {L('sv9-c2-centre', num(c2?.cx ?? NaN))}, radius {L('sv9-c2-radius', num(c2?.r ?? NaN))}. Their
            centres are {L('sv9-d', num(tc?.d ?? NaN))} apart, between {L('sv9-diff', num(tc?.diff ?? NaN))} and{' '}
            {L('sv9-sum', num(tc?.sum ?? NaN))}: two crossings, <span className={css.nw}>z = 0.5 − j0.5</span> and{' '}
            <span className={css.nw}>z = 0.5 + j0.5</span> (<span className={css.nw}>Γ = −0.2 ∓ j0.4</span>). The first is the
            worked match: C {L('sv9-s1-c', amt(s1?.values[0].value ?? NaN, 'F'))}, L {L('sv9-s1-l', amt(s1?.values[1].value ?? NaN, 'H'))}{' '}
            ({jump('matching-with-two-parts', 'Matching with two parts')}). The second is the load itself, which is on g = 1
            already: part 1 adds nothing (x = {L('sv9-s2-x', num(s2?.values[0].added ?? NaN))}) and part 2 adds
            b = {L('sv9-s2-b', num(s2?.values[1].added ?? NaN))}, a shunt C of {L('sv9-s2-c', amt(s2?.values[1].value ?? NaN, 'F'))},
            the one-part match. Both leave |Γ| = {L('sv9-s1-gamma', gammaText(s1?.gamma ?? NaN))} at the input.
          </p>
          <div className={css.liveRow}>
            <div className={css.live} data-solver-box="two">
              {head(twoMine, `the two circles at ${nodeText(tcirc, tr.circleNode)}`)}
              <p>Solved: {L('b9-status', statusText(tr))}.</p>
              <p>First: {L('b9-c1', circleText(tr.circles, 0))}</p>
              <p>Second: {L('b9-c2', circleText(tr.circles, 4))}</p>
              {tcase && <p>d = {L('b9-d', num(tcase.d))}, R<sub>1</sub> + R<sub>2</sub> = {L('b9-sum', num(tcase.sum))}, |R<sub>1</sub> − R<sub>2</sub>| = {L('b9-diff', num(tcase.diff))}: {L('b9-case', tcase.text)}</p>}
              {tr.solutions.map((s, k) => (
                <p key={k}>
                  {k + 1}. {s.values.map((u, j) => <React.Fragment key={j}>{j ? '; ' : ''}{L(`b9-s${k}-v${j}`, solvedText(tcirc, u))}</React.Fragment>)};
                  |Γ| = {L(`b9-s${k}-gamma`, gammaText(s.gamma))}
                </p>
              ))}
            </div>
            <TwoOneNoneFigure />
          </div>
          <p>
            <b>The load decides the count.</b> With R = 50 Ω (r = 1) the r circle touches g = 1 at the centre: one solution,
            a series C of {L('sv9-r50-c', amt(st.r50.solutions[0]?.values[0].value ?? NaN, 'F'))} that cancels the load’s
            +j25 Ω and no shunt part (an L of {L('sv9-r50-l', amt(st.r50.solutions[0]?.values[1].value ?? NaN, 'H'))}). With
            R = 100 Ω (r = 2, centre 2/3, radius 1/3) the centres are 7/6 apart, more than 1/3 + 1/2 = 5/6: {L('sv9-r100', statusText(st.r100))} in
            this order; shunt first can ({jump('matching-with-two-parts', 'Matching with two parts')}). A line’s length repeats
            every λ/2, so its solutions are counted per λ/2.
          </p>
          <p>
            <b>A circle instead of a point.</b> A circle goal (VSWR ≤ 1.5, g = 1, …) is one condition, so one unknown meets it
            at 0, 1 or 2 values, where its circle crosses the goal’s ({jump('one-value-and-a-point', 'next topic')}). Two
            unknowns then leave a family: for every value of the first, 0 to 2 values of the second. With both start values
            marked and the goal VSWR ≤ 1.5 at the input, a C of {L('sv9-fam-c', amt(st.members[0]?.values[0].value ?? NaN, 'F'))} needs
            an L of {L('sv9-fam-l0', amt(st.members[0]?.values[1].value ?? NaN, 'H'))} or{' '}
            {L('sv9-fam-l1', amt(st.members[1]?.values[1].value ?? NaN, 'H'))} to put the input on the VSWR 1.5 circle, and any
            L between keeps it inside. The slider runs over the first unknown’s ranges (C from{' '}
            {L('sv9-fam-min', amt(fr?.min ?? NaN, 'F'))} to {L('sv9-fam-max', amt(fr?.max ?? NaN, 'F'))} is one of them) and
            shows the second’s values at each.
          </p>
          <div className={css.live} data-solver-box="family">
            {head(famMine, famMine ? 'the family, in the middle of the first range' : 'the family at the start value, goal VSWR ≤ 1.5')}
            {fmembers.length ? (
              <>
                <p>At {L('b9f-first', solvedText(fcirc, fmembers[0].values[0]))}:</p>
                {fmembers.map((s, i) => <p key={i}>{L(`b9f-m${i}`, solvedText(fcirc, s.values[1]))}</p>)}
              </>
            ) : <p>{L('b9f-none', 'No member at this value.')}</p>}
            <p>Ranges of the first unknown:</p>
            {fres.ranges.map((g, k) => <p key={k}>{L(`b9f-r${k}`, rangeText(fcirc, fres, g))}</p>)}
          </div>
          <Eq id="x-series-c" />
          <Eq id="b-shunt-c" />
          <Eq id="b-shunt-l" />
        </>
      ))}

      {topic('one-value-and-a-point', (
        <>
          <p>
            A point on the chart is two numbers, r and x (or Γ<sub>r</sub> and Γ<sub>i</sub>); one value is one number. As
            that value runs over all it can take, the node moves along one circle, and a point off that circle is never
            reached; one on it is a lucky hit. So the counting line says “One value and a point: exact only by chance, so the
            solver gives the nearest value.”, and the result says “One value alone reaches a point only by chance.”
          </p>
          <p>
            <b>The nearest value.</b> How near the node comes is measured by the mismatch m, the |Γ| the node would have on a
            chart centred on the target. For the centre as target, m is |Γ| itself. On the target’s chart the part’s circle is
            still a circle, and the nearest it comes to the target is where it touches a circle of constant m about the
            target; the page draws that circle with the part’s.
          </p>
          <Eq id="gamma-z" />
          <Eq id="circle-r" />
          <Eq id="mismatch-to-target" note="below: the start circuit’s nearest value"
            values={{ m: tv(bm), z: tv(st.bestZ[0]), z_t: tv(1), Gamma: tv((st.bestZ[0] - 1) / (st.bestZ[0] + 1)), Gamma_t: tv(0) }} />
          <p>
            <b>The start circuit.</b> Mark only part 1’s C and put the goal (the centre) at node 1, between the two parts.
            The C moves node 1 along r = 0.5, and the centre is on r = 1: no C reaches it. On an r circle |Γ| is least where
            x = 0, since <span className={css.nw}>|Γ|² = ((r − 1)² + x²)/((r + 1)² + x²)</span> grows with x². So the nearest
            is z = 0.5, Γ = −1/3: the C must cancel the load’s +j25 Ω,
            x = {L('sv10-x', num(b0?.values[0].added ?? NaN))}, C = {L('sv10-c', amt(b0?.values[0].value ?? NaN, 'F'))}, and the
            page says it comes within m = {L('sv10-m', num(bm))} of the target (VSWR {L('sv10-vswr', num(vswr(bm)))}). The
            page then suggests freeing a second value, or choosing a circle goal.
          </p>
          <Eq id="x-series-c" note="the nearest value"
            values={b0 ? { x: tv(b0.values[0].added), X: tv(b0.values[0].added * START.z0, 0, 'Ω'), omega: omegaTex(START.f0), C: tv(b0.values[0].value, 0, 'F'), Z_0: tv(START.z0, 0, 'Ω') } : undefined} />
          <div className={css.liveRow}>
            <div className={css.live} data-solver-box="best">
              {head(bestMine, `the nearest value, goal at ${nodeText(bcirc, br.goalNode)}`)}
              <p>{L('b10-v', solvedText(bcirc, br.solutions[0].values[0]))}</p>
              <p>m = {L('b10-m', num(br.solutions[0].mismatch))} (as a VSWR {L('b10-vswr', num(vswr(br.solutions[0].mismatch)))})</p>
              {br.circleNode >= 0 && (
                <>
                  <p>The part’s circle: {L('b10-c1', circleText(br.circles, 0))}</p>
                  <p>The circle it touches: {L('b10-c2', circleText(br.circles, 4))}</p>
                </>
              )}
            </div>
            <MismatchFigure />
          </div>
          <p>
            <b>Inside a circle: a range.</b> A goal that allows a margin (VSWR ≤ 1.5, |Γ| ≤ 0.2, return loss ≥ 14 dB) is the
            inside of a circle, so one value keeps it over the arc of its circle inside the goal’s: a range of values. With
            only part 1’s C marked and the goal VSWR ≤ 1.5 at the input (the L at 79.58 nH), any C
            from {L('sv10-min', amt(rg?.min ?? NaN, 'F'))} to {L('sv10-max', amt(rg?.max ?? NaN, 'F'))} keeps it:{' '}
            <span className={css.nw}>C = 1/(ω{'Z'}<sub>0</sub>(1 ± 1/√24))</span>. An exact circle (|Γ| = 0.2, or g = 1) is met at
            its 0, 1 or 2 crossings instead: with the goal g = 1 at node 1, part 1 meets it at{' '}
            {gSols.map((s, k) => <React.Fragment key={k}>{k ? ' and at ' : ''}{L(`sv10-g${k}`, solvedText(START, s.values[0]))}</React.Fragment>)}.
          </p>
          <div className={css.live} data-solver-box="range">
            {head(rangeMine, `the values that keep the goal at ${nodeText(rcirc, rr.goalNode)}`)}
            {rr.ranges.length
              ? rr.ranges.map((g, k) => <p key={k}>{L(`b10r-r${k}`, rangeText(rcirc, rr, g))}</p>)
              : <p>{L('b10r-none', 'No value keeps the goal.')}</p>}
          </div>
          <Eq id="gamma-vswr" />
        </>
      ))}

      {topic('realisable-values', (
        <>
          <p>
            <b>Values a part can have.</b> An ideal R, L or C has a value of zero or more. A series C adds{' '}
            <span className={css.nw}>x = −1/(ωC{'Z'}<sub>0</sub>)</span>, never positive, and a series L adds{' '}
            <span className={css.nw}>x = ωL/Z<sub>0</sub></span>, never negative; the shunt parts likewise with b. When an
            answer needs the other sign, the page offers the other kind (“as a series L”) and marks it “true at this frequency
            only”: ωL grows with f and 1/(ωC) falls, so the swap gives the same reactance at f<sub>0</sub> alone. Marking “L
            or C” instead lets the sign choose the kind, with no swap. In the start circuit’s second solution part 2 is such
            a swap: a shunt C of {L('sv11-s2-c', amt(s2?.values[1].value ?? NaN, 'F'))} where the circuit has an L.
          </p>
          <Eq id="x-series-l" />
          <Eq id="x-series-c" />
          <Eq id="b-shunt-l" />
          <Eq id="b-shunt-c" values={s2 ? { b: tv(s2.values[1].added), B: tv(s2.values[1].added / START.z0, 0, 'S'), omega: omegaTex(START.f0), C: tv(s2.values[1].value, 0, 'F'), Z_0: tv(START.z0, 0, 'Ω') } : undefined}
            note="the swapped shunt C" />
          <p>
            A series C of ∞ or a series L of 0 is a plain connection; a shunt L of ∞ or a shunt C of 0 is no part at all. A
            negative R would give out power, so the solver drops it and says why. A λ/4 transformer’s Z<sub>t</sub> of 0 or ∞
            is not offered: it would make the node a short or an open, whatever the load.
          </p>
          <Eq id="quarter-wave" />
          <p>
            <b>Lengths.</b> A line’s or stub’s length comes back as the shortest that works; λ/2 more turns the point once
            more round its full circle at f<sub>0</sub>, so it gives the same match there
            ({jump('transmission-lines', 'Transmission lines')}). Away from f<sub>0</sub> each extra λ/2 turns the point a
            further 360°·Δf/f<sub>0</sub>, so the match drifts away faster as f leaves f<sub>0</sub>; the page notes “(+ λ/2
            gives the same match at f0, over a narrower band)”.
          </p>
          <Eq id="line-rotation" />
          <Eq id="line-theta" />
          <Eq id="beta" />
          <p>
            <b>Standard values.</b> Resistors and capacitors follow the E series of IEC 60063: E6, E12, E24, E48 and E96 have
            6 to 96 values per decade, and parts in them are usually sold at 20, 10, 5, 2 and 1 %{cite([WE, ''])}.
            E24’s values are about 10<sup>1/24</sup> ≈ 1.10 apart, steps of about 10 %{cite([WE, ''])}. High-Q RF
            chip capacitors in 0402 run from 0.1 pF (or 0.2 pF) to 33 pF, with tolerances in pF below 10 pF (±0.05 to
            ±0.5 pF) and in percent from 10 pF{cite([JH, ''])}. RF chip inductors come in each maker’s own list, not an E
            series: 1.9 nH, which no E series has, with tolerances of 2 %, 5 % or ±0.2 nH{cite([WK, ''])}.
          </p>
          <p>
            So “Standard values” in the Solve panel picks a list per kind: E6 to E96, an own list pasted from a maker’s range,
            or any value; R, L and C start at E24, Z<sub>t</sub> and Z<sub>c</sub> at any value. Dragging snaps to the same
            lists. Under every solution the page lists the neighbouring standard values, each value’s neighbour below and
            above in every combination, re-evaluated, with the |Γ| each gives, and Apply.
          </p>
          <p>
            <b>The start match in E24.</b> {L('sv9-s1-c', amt(s1?.values[0].value ?? NaN, 'F'))} lies
            between {L('sv11-c-lo', amt(Math.min(...valsOf(0)), 'F'))} and {L('sv11-c-hi', amt(Math.max(...valsOf(0)), 'F'))},{' '}
            {L('sv9-s1-l', amt(s1?.values[1].value ?? NaN, 'H'))} between {L('sv11-l-lo', amt(Math.min(...valsOf(1)), 'H'))} and{' '}
            {L('sv11-l-hi', amt(Math.max(...valsOf(1)), 'H'))}.{' '}
            {v.map((x, j) => (
              <React.Fragment key={j}>
                {j === 0 ? '' : j === v.length - 1 ? ', and ' : ', '}
                {L(`sv11-v${j}`, variantText(s1, x))} gives{j === 0 ? ' |Γ| =' : ''} {L(`sv11-v${j}-gamma`, num(x.gamma))}
                {j === 0 && <> (VSWR {L('sv11-v0-vswr', num(vswr(x.gamma)))}, return loss {L('sv11-v0-rl', amt(returnLoss(x.gamma), 'dB'))})</>}
                {j === v.length - 1 && j > 0 && <> (VSWR {L(`sv11-v${j}-vswr`, num(vswr(x.gamma)))})</>}
              </React.Fragment>
            ))}. {v.every((x) => x.gamma <= magFromVswr(1.5)) ? 'All of them are' : 'Not all are'} inside the default
            close-enough circle, |Γ| ≤ 0.2.
          </p>
          <Eq id="vswr" values={v[0] ? { VSWR: tv(vswr(v[0].gamma)), Gamma: tv(v[0].gamma) } : undefined} note="the first pair" />
          <Eq id="return-loss" values={v[0] ? { RL: tv(returnLoss(v[0].gamma), 0, 'dB'), Gamma: tv(v[0].gamma) } : undefined} />
          <div className={css.liveRow}>
            <div className={css.live} data-solver-box="standard">
              {head(listMine, 'the solutions and the first one’s standard values')}
              {lsols.map((s, k) => (
                <p key={k}>
                  {k + 1}. {s.values.map((u, j) => <React.Fragment key={j}>{j ? '; ' : ''}{L(`b11-s${k}-v${j}`, solvedText(lcirc, u))}</React.Fragment>)}
                </p>
              ))}
              <p>Lists: {L('b11-lists', listsText(lists))}</p>
              {lvariants.length ? lvariants.map((x, j) => (
                <p key={j}>{L(`b11-v${j}`, variantText(lsols[0], x))}: |Γ| = {L(`b11-v${j}-gamma`, num(x.gamma))}</p>
              )) : <p>{L('b11-none', 'No standard values differ from the solution’s own.')}</p>}
            </div>
            <StandardFigure points={st.points} />
          </div>
          <p>
            <b>Limits.</b> All of this is for ideal parts at one frequency: the tool computes neither a part’s tolerance nor
            its losses. Real chip inductors have a finite Q and resonate on their own: the WE-KI parts of 6.2 to 7.5 nH have
            Q ≈ 20–25 at 250 MHz and self-resonate at 4.8 to 5.8 GHz{cite([WK, ''])}.
          </p>
        </>
      ))}
    </>
  );
}

/**
 * The topics as a component of their own, rendered again only when what they show changes (the Solve panel's outcome,
 * the lists, folding, the way back): Theory renders on every committed network change (a drag's end), and these
 * topics' text and equations made that render long enough to delay the strip's key handling (ui-strip's moves). The
 * functions come from Theory's latest render, which is the one that renders them. Their citations are made after
 * Theory's (a child renders after its parent), so the numbers stay in page order.
 */
export const SolverTopics = React.memo(function SolverTopics(props: SolverCtx) {
  return <>{solverTopics(props)}</>;
}, (a, b) => a.outcome === b.outcome && a.lists === b.lists && a.bib === b.bib && a.folded === b.folded && a.back === b.back);
