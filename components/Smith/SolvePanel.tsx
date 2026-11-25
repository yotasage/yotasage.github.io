import React, { memo, useCallback, useDeferredValue, useEffect, useId, useMemo, useRef, useState } from 'react';

import { belowFloor, formatAmount, formatResidual, readAmount } from '../../lib/quantity';
import { goalNode, goalProblem, goalValue, isWithin } from '../../lib/smith/goal';
import type { Goal, GoalKind } from '../../lib/smith/goal';
import { LINE, QUARTER, SERIES_C, SERIES_L, SERIES_R, SHUNT_C, SHUNT_L, SHUNT_R, STUB_OPEN, STUB_SHORT } from '../../lib/smith/parts';
import { atFrequency, solve } from '../../lib/smith/solve';
import { cancelSolve, cancelSuggest, solveOffPage, stopSolveWorkers, suggestOffPage } from '../../lib/smith/solveClient';
import type { Suggestion, Suggestions } from '../../lib/smith/suggest';
import type { Solution, SolvedValue, SolveResult, ValueRange } from '../../lib/smith/solve';
import {
  Ask, askOf, Circuit, cleanAsk, numText, sameUnknown, toggleUnknown, Unknown, withGoal, withPart,
} from '../../lib/smith/state';
import { LIST_IDS, VALUE_UNITS, parseOwnList, standardVariants } from '../../lib/smith/values';
import type { ListId, ValueChoice, ValueKind, Variant } from '../../lib/smith/values';
import { translate, useI18n } from '../../lib/ui/i18n';
import type { Locale, TranslationKey } from '../../lib/ui/translations';
import styles from '../../styles/SmithSolve.module.css';
import base from '../../styles/Smith.module.css';
import { nodeName } from './pathLayer';
import { kindName as partKindName, unknownLabel } from './smithText';
import { Field } from './Strip';
import type { CircleShape } from './solveLayer';
import { Why } from './Why';

// The Solve panel (step M4.3a; solver.md, notes-M4.1a/b, M4.2): what is unknown (marked on the parts' cards, f0 here),
// the goal (where, and a point or a circle), and what the solver gives back, in the words of solver.md's counting table:
// solutions with Apply (one undo step), the best value of one unknown for a point, the ranges of an inequality goal, a
// family of two unknowns for a circle, and why there is none. The unknowns and the goal are the circuit's `ask`
// (state.ts), so the link, undo and redo carry them.
//
// Solving never runs in the drag's frames: the panel solves the committed circuit in a deferred render (most solves
// take microseconds). Problems with f0 among the unknowns (its search: up to about 20 ms for one unknown, 220 ms with
// a λ/4's Zt) and the generic 2-D search of a line's Zc are solved in a Web Worker (solveClient.ts, M4.4a); only
// where no worker can be made do they run on the page, after a pause with no drag in progress.

export interface Outcome {
  /** The circuit (with its ask) that was solved. */
  circuit: Circuit;
  /** null when nothing is marked. */
  result: SolveResult | null;
  /** The solve's time in ms. */
  ms: number;
  /** Where it was solved: in the render ('render'), the solver's worker, or the page's fallback after a pause. */
  where?: 'render' | 'worker' | 'page';
}

export interface SolvePanelProps {
  circuit: Circuit;
  /** The page's commit (one undo step; a group joins a field's keystrokes). */
  onChange: (next: Circuit, group?: string) => void;
  /** Bumped by undo and redo: the fields drop their typed text. */
  revision?: number;
  /** Whether a drag or a draw is in progress (a slow solve waits for its end). */
  busy?: () => boolean;
  /** Every new outcome (the chart draws its circles: solveLayer.ts). */
  onResult?: (outcome: Outcome | null) => void;
  /**
   * A solution's circuit to draw as a preview on the chart, null for none (M4.3b); for a suggestion also its
   * construction's circles and the circuit they belong to (M4.4b).
   */
  onPreview?: (c: Circuit | null, shape?: CircleShape | null, base?: Circuit | null) => void;
  /** The value lists per kind (D17) and their change (the page keeps them in the link and localStorage). */
  lists: ValueChoice;
  onLists: (next: ValueChoice) => void;
  /** M6.3b: no suggestions (a lesson hides them): none are asked for and none are shown. */
  noSuggest?: boolean;
}

const DIGITS = 4;

/**
 * Whether the ask is solved off the page (notes-M4.4a.md): any f0 unknown (one: median 2 ms, worst 22 ms; with a
 * part: worst 20 ms; with a λ/4 or a Zc: the grid, median 17 ms, worst over 200 ms) and the generic 2-D grid of a
 * line's Zc with another Zc or a λ/4. A line's Zc alone or with a part stays in the render (under 1 ms).
 */
export function slowAsk(c: Circuit, ask: Ask): boolean {
  if (ask.unknowns.some((u) => u.param === 'f0')) return true;
  if (ask.unknowns.length !== 2) return false;
  const kind = (u: Unknown) => c.parts[u.part]?.kind;
  return ask.unknowns.some((u) => u.param === 'zc' && kind(u) === LINE)
    && ask.unknowns.every((u) => u.param === 'zc' || kind(u) === QUARTER);
}

/** The same unknowns are marked in both circuits. */
function sameMarks(a: Circuit, b: Circuit): boolean {
  const ua = askOf(a).unknowns, ub = askOf(b).unknowns;
  return ua.length === ub.length && ua.every((u, i) => sameUnknown(u, ub[i]));
}

function run(c: Circuit): Outcome {
  const ask = askOf(c);
  if (!ask.unknowns.length) return { circuit: c, result: null, ms: 0 };
  const t = performance.now();
  const result = solve(c, ask.unknowns, ask.goal);
  return { circuit: c, result, ms: performance.now() - t, where: 'render' };
}

/** The circuit with a solution's values in it: parts first (in wavelengths at the circuit's f0), then f0. */
export function applySolution(c: Circuit, s: Solution): Circuit {
  let next = c, f = NaN;
  for (const v of s.values) {
    if (v.param === 'f0') { f = v.value; continue; }
    const p = next.parts[v.part];
    if (v.param === 'zc') next = withPart(next, v.part, { ...p, zc: v.value });
    else {
      const kind = v.kind as typeof p.kind;
      next = withPart(next, v.part, kind === LINE || kind === STUB_OPEN || kind === STUB_SHORT ? { kind, value: v.value, zc: p.zc } : { kind, value: v.value });
    }
  }
  return f === f ? cleanAsk(atFrequency(next, f), next.ask) : next;
}

// ---------------------------------------------------------------------------------------------------------------
// Texts

const UNIT: Record<number, string> = {
  [SERIES_R]: 'Ω', [SHUNT_R]: 'Ω', [SERIES_L]: 'H', [SHUNT_L]: 'H', [SERIES_C]: 'F', [SHUNT_C]: 'F', [QUARTER]: 'Ω',
};
const VALUE_SYMBOL: Record<number, string> = {
  [SERIES_R]: 'R', [SHUNT_R]: 'R', [SERIES_L]: 'L', [SHUNT_L]: 'L', [SERIES_C]: 'C', [SHUNT_C]: 'C', [QUARTER]: 'Zt',
  [LINE]: 'ℓ', [STUB_OPEN]: 'ℓ', [STUB_SHORT]: 'ℓ',
};

/** A value of an unknown in its unit ("3.183 pF", "0.125 λ", "112.5 MHz", "∞ F"). */
function amount(kind: number, param: string, v: number): string {
  if (param === 'f0') return formatAmount(v, 'Hz', DIGITS);
  if (param === 'zc') return formatAmount(v, 'Ω', DIGITS);
  const unit = UNIT[kind];
  return unit ? formatAmount(v, unit, DIGITS) : `${formatResidual(v, '', DIGITS, false)} λ`;
}
const symbolOf = (kind: number, param: string): string => (param === 'f0' ? 'f0' : param === 'zc' ? 'Zc' : VALUE_SYMBOL[kind]);
/** A small number: plain to three digits, else in e-notation; a residual at rounding level the bound of plan.md D20. */
const small = (v: number): string => (v === 0 ? '0' : belowFloor(v) ? formatResidual(v) : v >= 1e-3 ? formatAmount(v, '', 3) : v.toExponential(1).replace('-', '−'));
/** A kind's name inside a sentence ("series C"). */
const kindLower = (k: number, locale: Locale): string => {
  const s = partKindName(k, locale);
  return `${s[0].toLowerCase()}${s.slice(1)}`;
};
const sentence = (s: string): string => (s ? `${s[0].toUpperCase()}${s.slice(1)}${/[.!?]$/.test(s) ? '' : '.'}` : '');

/** Goal kinds as the selector offers them ("centre" is the point target at Z0). */
type Choice = 'centre' | GoalKind;
const CHOICE_IDS: readonly Choice[] = ['centre', 'point', 'vswr', 'mag', 'rl', 'r', 'g', 'x', 'b'];
const choiceOf = (g: Goal): Choice => (g.kind === 'point' && g.targetR === undefined ? 'centre' : g.kind);

/** The goal a choice starts with: no typing needed (VSWR ≤ 1.5, |Γ| ≤ 0.2, RL ≥ 14 dB, the unit circles, x or b = 0). */
function startGoal(id: Choice, z0: number, node: number | undefined): Goal {
  const at = node === undefined ? {} : { node };
  switch (id) {
    case 'centre': return { kind: 'point', ...at };
    case 'point': return { kind: 'point', targetR: z0, targetX: 0, ...at };
    case 'vswr': return { kind: 'vswr', value: 1.5, within: true, ...at };
    case 'mag': return { kind: 'mag', value: 0.2, within: true, ...at };
    case 'rl': return { kind: 'rl', value: 14, within: true, ...at };
    case 'r': case 'g': return { kind: id, value: 1, ...at };
    default: return { kind: id, value: 0, ...at };
  }
}

const FIGURE: Record<string, { label: string; unit: string; infinite: boolean }> = {
  vswr: { label: 'VSWR', unit: '', infinite: true },
  mag: { label: '|Γ|', unit: '', infinite: false },
  rl: { label: 'Return loss', unit: 'dB', infinite: true },
  r: { label: 'r', unit: '', infinite: true },
  g: { label: 'g', unit: '', infinite: true },
  x: { label: 'x', unit: '', infinite: false },
  b: { label: 'b', unit: '', infinite: false },
};

/** What solver.md's counting table says for this many unknowns and this goal. */
function countText(n: number, g: Goal, locale: Locale): string {
  if (n === 1) {
    if (g.kind === 'point') return translate(locale, 'sm.solve.count1Point');
    if (isWithin(g)) return translate(locale, 'sm.solve.count1Within');
    return translate(locale, 'sm.solve.count1Circle');
  }
  return translate(locale, g.kind === 'point' ? 'sm.solve.count2Point' : 'sm.solve.count2Circle');
}

/**
 * A family's solutions at its range ends without repeats: two ranges that meet at a cut (C = ∞ is L = 0) give the same
 * member twice.
 */
export function distinctEnds(list: Solution[]): Solution[] {
  const out: Solution[] = [];
  for (const s of list) {
    if (!out.some((t) => t.values.every((v, j) => v.kind === s.values[j].kind && Object.is(v.value, s.values[j].value)))) out.push(s);
  }
  return out;
}

/** The page's status of an outcome (data-solve-status; one per message of the counting table). */
export function statusOf(o: Outcome | null): string {
  if (!o) return 'solving';
  const r = o.result;
  if (!r) return 'nothing';
  switch (r.status) {
    case 'solved':
      if (r.solutions.length > 1) return 'solved';
      // One unknown and a point target hit exactly is a lucky hit, not two circles touching.
      if (r.unknowns.length === 1 && askOf(o.circuit).goal.kind === 'point') return 'one';
      return r.circleNode >= 0 && r.nonPassive === 0 ? 'tangent' : 'one';
    case 'none': return r.sameJob ? 'samejob' : 'none';
    case 'coincident': return r.sameJob ? 'samejob-all' : 'coincident';
    default: return r.status;
  }
}

/** A second value to free for a best value: the nearest other part on the source side of the unknown, before the goal. */
function suggestSecond(c: Circuit, r: SolveResult, locale: Locale): string {
  const u = r.unknowns[0];
  const g = r.goalNode, a = u.param === 'f0' ? -1 : u.part;
  let best = -1;
  for (let d = 1; d < c.parts.length + 1 && best < 0; d++) {
    for (const j of [a + d, a - d]) {
      if (j >= 0 && j < g && j !== a && best < 0 && c.parts[j].kind !== SERIES_R && c.parts[j].kind !== SHUNT_R) best = j;
    }
  }
  if (best < 0 && a >= 0) return translate(locale, 'sm.solve.suggestSecondAdd');
  if (best < 0) return translate(locale, 'sm.solve.suggestSecondMark');
  return translate(locale, 'sm.solve.suggestSecondPart', { name: unknownLabel(c, { part: best, param: 'value' }, locale) });
}

// ---------------------------------------------------------------------------------------------------------------

function ValueText({ c, v }: { c: Circuit; v: SolvedValue }) {
  const { t, locale } = useI18n();
  const own = v.param === 'f0' ? -1 : c.parts[v.part]?.kind ?? -1;
  const kind = v.param === 'value' ? v.kind : own;
  return (
    <span className={styles.value} data-value="" data-part={v.part} data-param={v.param} data-kind={v.kind} data-raw={numText(v.value)}>
      <span className={styles.who}>{v.param === 'f0' ? 'f0' : t('sm.solve.partN', { n: v.part + 1 })}{v.param === 'value' && v.kind !== own ? t('sm.solve.asKind', { kind: kindLower(v.kind, locale) }) : ''}</span>
      {' '}<b>{symbolOf(kind, v.param)} = {amount(kind, v.param, v.value)}</b>
      {v.swapped && <span className={styles.flag} data-swapped="">{t('sm.solve.atF0Only')}</span>}
      {v.period > 0 && <span className={styles.flag} data-period="">{t('sm.solve.periodHint')}</span>}
    </span>
  );
}

/**
 * What the solution lists share: the solved circuit and its goal, Apply, whether the outcome is behind the circuit,
 * the value lists, and the previews (a key per previewable item, `data-pv`; the panel looks the key up on hover and
 * focus and draws that circuit on the chart).
 */
interface ListCtx {
  c: Circuit;
  goal: Goal;
  node: string;
  stale: boolean;
  lists: ValueChoice;
  apply: (s: Solution) => void;
  makers: Map<string, () => Circuit>;
  /** Circles to draw with a preview (a suggestion's construction), by the same keys. */
  shapes?: Map<string, CircleShape>;
}

/** A solution with the values of a standard-value variant (values.ts standardVariants) in place of its own. */
const withValues = (s: Solution, values: readonly number[]): Solution => ({ ...s, values: s.values.map((v, j) => ({ ...v, value: values[j] })) });

/** How near the goal a variant comes, in the words of its goal. */
function variantMeta(g: Goal, v: Variant, node: string, locale: Locale): string {
  if (g.kind === 'point') return translate(locale, 'sm.solve.varPoint', { mismatch: small(v.mismatch), gamma: small(v.gamma), node });
  const within = isWithin(g);
  const standing = v.meets
    ? translate(locale, within ? 'sm.solve.keepsGoal' : 'sm.solve.onGoal')
    : translate(locale, within ? 'sm.solve.outsideBy' : 'sm.solve.offBy', { res: small(v.residual) });
  return translate(locale, 'sm.solve.varCircle', { gamma: small(v.gamma), node, standing });
}

/**
 * The standard values next to a solution's (none when every list is "any value"), each with Apply and a preview. A
 * suggestion's are folded (`fold`), so the list of suggestions stays short enough to scan on a phone.
 */
function Variants({ x, s, pv, given, shape, fold }: { x: ListCtx; s: Solution; pv: string; given?: Variant[]; shape?: CircleShape; fold?: boolean }) {
  const { t, locale } = useI18n();
  const list = useMemo(() => given ?? standardVariants(x.c, x.goal, s, x.lists), [given, x.c, x.goal, s, x.lists]);
  if (!list.some((v) => !v.exact)) return null;
  const items = (
      <ul className={styles.variants} data-variants="">
        {list.map((v, j) => {
          const key = `${pv}:${j}`, sv = withValues(s, v.values);
          x.makers.set(key, () => applySolution(x.c, sv));
          if (shape) x.shapes?.set(key, shape);
          return (
            <li key={j} className={styles.variant} data-variant={j} data-pv={key} tabIndex={0} data-meets={v.meets ? '' : undefined}
              aria-label={t('sm.solve.variantAria', { n: j + 1 })}>
              <span className={styles.variantValues}>
                {sv.values.map((u, i) => (
                  <span key={i} data-variant-value="" data-raw={numText(u.value)}>
                    {i ? ', ' : ''}{symbolOf(u.param === 'value' ? u.kind : x.c.parts[u.part]?.kind ?? -1, u.param)} = <b>{amount(u.param === 'value' ? u.kind : x.c.parts[u.part]?.kind ?? -1, u.param, u.value)}</b>
                  </span>
                ))}
              </span>
              <span className={styles.meta}>{variantMeta(x.goal, v, x.node, locale)}</span>
              <button type="button" className={`${base.button} ${styles.small}`} data-apply-variant={j} disabled={x.stale}
                onClick={() => x.apply(sv)} title={t('sm.solve.applyVariantTitle')}>{t('sm.solve.apply')}</button>
            </li>
          );
        })}
      </ul>
  );
  if (fold) {
    return (
      <details className={styles.variantBox} data-variant-fold="">
        <summary className={styles.variantHead}>{t('sm.solve.withStdCount', { n: list.length })}</summary>
        {items}
      </details>
    );
  }
  return (
    <div className={styles.variantBox}>
      <span className={styles.variantHead}>{t('sm.solve.withStd')} <Why k="solve-variant" /></span>
      {items}
    </div>
  );
}

function SolutionList({ x, list, best, item = 'solution' }: { x: ListCtx; list: Solution[]; best?: boolean; item?: 'solution' | 'member' }) {
  const { t } = useI18n();
  return (
    <ol className={styles.solutions}>
      {list.map((s, k) => {
        const key = `${item}:${k}`;
        x.makers.set(key, () => applySolution(x.c, s));
        const attrs = item === 'solution' ? { 'data-solution': k } : { 'data-member': k };
        return (
          <li key={k} className={styles.solution} {...attrs} data-residual={numText(s.residual)} data-pv={key} tabIndex={0}
            aria-label={t('sm.solve.solAria', { item: t(item === 'solution' ? 'sm.solve.solution' : 'sm.solve.member'), n: k + 1 })}>
            <div className={styles.values}>{s.values.map((v, j) => <ValueText key={j} c={x.c} v={v} />)}</div>
            <div className={styles.meta}>
              {best
                ? <span>{t('sm.solve.comesWithin')} <b>{small(s.mismatch)}</b> {t('sm.solve.ofTarget', { gamma: small(s.gamma), node: x.node })}</span>
                : <span>{t('sm.solve.offGoalMeta', { gamma: small(s.gamma), node: x.node, res: small(s.residual) })}</span>}
              {!s.realisable && !s.atF0Only && <span className={styles.flag}>{t('sm.solve.notOwnKind')}</span>}
              {k === 0 && <Why k="solve-solution" />}
            </div>
            <span className={styles.applyGroup}>
              <button type="button" className={base.button} {...{ [item === 'solution' ? 'data-apply' : 'data-apply-member']: k }} disabled={x.stale}
                onClick={() => x.apply(s)} title={t('sm.solve.applyTitle')}>{t('sm.solve.apply')}</button>
            </span>
            <div className={styles.variantRow}><Variants x={x} s={s} pv={`v${key}`} /></div>
          </li>
        );
      })}
    </ol>
  );
}

/** A part's value as it is now, beside a suggested one ("now 31.83 pF"). */
function nowText(c: Circuit, v: SolvedValue, locale: Locale): string {
  const p = c.parts[v.part];
  if (!p || v.param === 'f0') return '';
  const val = v.param === 'zc' ? amount(-1, 'zc', p.zc ?? c.z0) : amount(p.kind, 'value', p.value);
  return translate(locale, 'sm.solve.nowVal', { val });
}

/** A suggestion's construction as the chart draws it (solveLayer.ts): two unknowns cross like a solved pair. */
const shapeOf = (g: Suggestion): CircleShape => ({ circleNode: g.circleNode, circles: g.circles, unknowns: g.unknowns, status: g.unknowns.length === 2 ? 'solved' : 'one' });

/**
 * The suggestions (M4.4b, suggest.ts): one or two values changed, each with what it reaches, Apply (one undo step),
 * "Solve for" (marks its parts as the unknowns), its standard values and a preview with its circles.
 */
function SuggestionList({ x, list, onMark }: { x: ListCtx; list: Suggestion[]; onMark: (g: Suggestion) => void }) {
  const { t, locale } = useI18n();
  const point = x.goal.kind === 'point';
  return (
    <ol className={styles.solutions} data-suggestions="">
      {list.map((g, k) => {
        const key = `sug:${k}`, s = g.solution, shape = shapeOf(g);
        x.makers.set(key, () => applySolution(x.c, s));
        x.shapes?.set(key, shape);
        return (
          <li key={k} className={`${styles.solution} ${styles.suggestion}`} data-suggestion={k} data-meets={g.meets ? '' : undefined}
            data-residual={numText(s.residual)} data-mismatch={numText(s.mismatch)} data-gamma={numText(s.gamma)} data-pv={key} tabIndex={0}
            aria-label={t('sm.solve.sugAria', { n: k + 1 })}>
            <div className={styles.values}>
              {s.values.map((v, j) => (
                <span key={j}><ValueText c={x.c} v={v} /> <span className={styles.was}>({nowText(x.c, v, locale)})</span></span>
              ))}
            </div>
            <div className={styles.meta}>
              {g.meets
                ? <span>{t('sm.solve.meetsGoal')} <b>{small(s.gamma)}</b> {t('sm.solve.atNode', { node: x.node })}</span>
                : point
                  ? <span>{t('sm.solve.comesWithin')} <b>{small(s.mismatch)}</b> {t('sm.solve.ofTarget', { gamma: small(s.gamma), node: x.node })}</span>
                  : <span>{t('sm.solve.offGoalMeta', { gamma: small(s.gamma), node: x.node, res: small(s.residual) })}</span>}
              {!s.realisable && !s.atF0Only && <span className={styles.flag}>{t('sm.solve.notOwnKind')}</span>}
              {k === 0 && <Why k="solve-suggest" />}
            </div>
            <span className={styles.actions}>
              <button type="button" className={base.button} data-apply-suggestion={k} disabled={x.stale}
                onClick={() => x.apply(s)} title={t('sm.solve.applyTitle')}>{t('sm.solve.apply')}</button>
              <button type="button" className={`${base.button} ${styles.small}`} data-mark-suggestion={k} disabled={x.stale}
                onClick={() => onMark(g)} title={t('sm.solve.markTitle')}>{t('sm.solve.solveFor')}</button>
            </span>
            <div className={styles.variantRow}><Variants x={x} s={s} pv={`v${key}`} given={g.variants} shape={shape} fold /></div>
          </li>
        );
      })}
    </ol>
  );
}

/** The suggestions' heading for a status of suggest.ts, in plain words. */
function suggestHead(o: Suggestions, node: string, some: boolean, locale: Locale): string {
  switch (o.status) {
    case 'holds': return translate(locale, 'sm.solve.sugHolds', { node });
    case 'rejected': return translate(locale, 'sm.solve.sugRejected', { reason: o.reason });
    case 'none': return translate(locale, 'sm.solve.sugNone', { reason: o.reason });
    default: return translate(locale, some ? 'sm.solve.sugSome' : 'sm.solve.sugNearest');
  }
}

/** Positions of the family's slider: the ranges of the first unknown laid end to end. */
const FAMILY_STEPS = 1000;
/** A member is taken this far (relative) inside its range's ends, which the list of ends already gives. */
const FAMILY_INSET = 1e-6;

/** The first unknown's coordinate at slider position p over the ranges laid end to end. */
export function familyT(ranges: readonly ValueRange[], p: number): number {
  let total = 0;
  for (const g of ranges) total += g.t1 - g.t0;
  let u = (p / FAMILY_STEPS) * total;
  for (let k = 0; k < ranges.length; k++) {
    const g = ranges[k], len = g.t1 - g.t0;
    if (u <= len || k === ranges.length - 1) {
      const f = Math.min(Math.max(u / len, FAMILY_INSET), 1 - FAMILY_INSET);
      return g.t0 + f * len;
    }
    u -= len;
  }
  return NaN;
}

/** The family's slider: a value of the first unknown inside its ranges and the 0 to 2 members there, live (D14: keys, touch). */
function FamilySlider({ x, r, onMove }: { x: ListCtx; r: SolveResult; onMove: () => void }) {
  const { t: tr, locale } = useI18n();
  const ranges = r.ranges;
  const [pos, setPos] = useState(() => {
    let total = 0;
    for (const g of ranges) total += g.t1 - g.t0;
    return Math.round((0.5 * (ranges[0].t1 - ranges[0].t0) / total) * FAMILY_STEPS);
  });
  const t = familyT(ranges, pos);
  const members = useMemo(() => r.family!.at(t), [r, t]);
  const sliderId = `family-${useId().replace(/:/g, '')}`;
  x.makers.set('fam', () => (members.length ? applySolution(x.c, members[0]) : x.c));
  useEffect(onMove, [t, onMove]);
  const first = members[0]?.values[0];
  const firstText = first ? `${symbolOf(first.param === 'value' ? first.kind : x.c.parts[first.part]?.kind ?? -1, first.param)} = ${amount(first.param === 'value' ? first.kind : x.c.parts[first.part]?.kind ?? -1, first.param, first.value)}` : tr('sm.solve.noMemberHere');
  return (
    <div className={styles.family} data-family="">
      <div className={styles.familyLabel}>
        <span><label htmlFor={sliderId}>{tr('sm.solve.pickMember', { name: unknownLabel(x.c, r.unknowns[0], locale) })}</label> <Why k="solve-family" /></span>
        <input id={sliderId} type="range" className={styles.slider} min={0} max={FAMILY_STEPS} step={1} value={pos} data-family-slider="" data-pv="fam"
          data-t={numText(t)} aria-valuetext={firstText} onChange={(e) => setPos(Number(e.target.value))} />
      </div>
      <p className={styles.familyNow} data-family-first={first ? numText(first.value) : ''}>
        {first ? <>{firstText}{first.swapped ? tr('sm.solve.atF0OnlyParen') : ''}: {tr('sm.solve.memberValuesOf', { count: tr(members.length === 2 ? 'sm.solve.twoValuesOf' : 'sm.solve.oneValueOf'), name: unknownLabel(x.c, r.unknowns[1], locale) })}</> : tr('sm.solve.noMemberVal')}
      </p>
      {members.length > 0 && <SolutionList x={x} list={members} item="member" />}
    </div>
  );
}

const LIST_KINDS: { kind: ValueKind; name: string }[] = [{ kind: 'R', name: 'R' }, { kind: 'L', name: 'L' }, { kind: 'C', name: 'C' }, { kind: 'Z', name: 'Zt, Zc' }];
const listName = (id: string, locale: Locale): string => (id === 'own' ? translate(locale, 'sm.solve.listOwn') : id === 'any' ? translate(locale, 'sm.solve.listAny') : id);
/** An own list as text to edit (no spaces inside an amount, so the reader splits only between values). */
const ownText = (kind: ValueKind, values: readonly number[]): string =>
  values.map((v) => formatAmount(v, VALUE_UNITS[kind], 4).replace(/\s+/g, '')).join(', ');

/** The value list per kind (D17): what Snap and the standard values below each solution use; kept in the link. */
function ListsSetting({ lists, onLists }: { lists: ValueChoice; onLists: (next: ValueChoice) => void }) {
  const { t, locale } = useI18n();
  const [texts, setTexts] = useState<Partial<Record<ValueKind, string>>>({});
  const [rejected, setRejected] = useState<Partial<Record<ValueKind, string[]>>>({});
  const choose = (kind: ValueKind, id: ListId) => {
    if (id === 'own') {
      const values = lists[kind].id === 'own' ? lists[kind].values ?? [] : [];
      setTexts((prev) => ({ ...prev, [kind]: prev[kind] ?? ownText(kind, values) }));
      onLists({ ...lists, [kind]: { id, values } });
    } else onLists({ ...lists, [kind]: { id } });
  };
  const typeOwn = (kind: ValueKind, text: string) => {
    setTexts((prev) => ({ ...prev, [kind]: text }));
    const { values, rejected: bad } = parseOwnList(text, kind);
    setRejected((r) => ({ ...r, [kind]: bad }));
    onLists({ ...lists, [kind]: { id: 'own', values } });
  };
  return (
    <details className={styles.lists} data-lists="">
      <summary className={styles.listsSummary}>
        {t('sm.solve.stdValues')} {LIST_KINDS.map(({ kind, name }) => `${name.split(',')[0]} ${listName(lists[kind].id, locale)}`).join(' · ')}
        {' '}<Why k="solve-lists" />
      </summary>
      <p className={styles.hint}>{t('sm.solve.listsHint')}</p>
      <div className={styles.listGrid}>
        {LIST_KINDS.map(({ kind, name }) => {
          const l = lists[kind];
          return (
            <div key={kind} className={styles.listRow}>
              <div className={styles.listHead}>
                <label className={styles.goalPart}>
                  <span className={styles.label}>{name}</span>
                  <select className={base.select} data-list-kind={kind} value={l.id} onChange={(e) => choose(kind, e.target.value as ListId)}>
                    {LIST_IDS.map((id) => <option key={id} value={id}>{listName(id, locale)}</option>)}
                  </select>
                </label>
                <Why k={`list-${kind}`} />
              </div>
              {l.id === 'own' && (
                <label className={styles.ownBox}>
                  <span className={styles.label}>{t('sm.solve.kindValuesCount', { name, n: l.values?.length ?? 0 })}</span>
                  <textarea className={styles.own} rows={2} data-list-own={kind} spellCheck={false}
                    value={texts[kind] ?? ownText(kind, l.values ?? [])} onChange={(e) => typeOwn(kind, e.target.value)}
                    placeholder={kind === 'R' ? '10, 22, 47, 4k7' : kind === 'L' ? '10n, 22n, 47n' : kind === 'C' ? '1p, 2.2p, 4.7p' : '35, 50, 75'} />
                  {(rejected[kind]?.length ?? 0) > 0 && <span className={styles.flag} data-list-rejected={kind}>{t('sm.solve.notRead', { list: rejected[kind]!.slice(0, 5).join(', ') })}</span>}
                </label>
              )}
            </div>
          );
        })}
      </div>
    </details>
  );
}

/** Where the construction's circles are on the chart and what they mean (solver.md "On the chart"). */
function circlesText(c: Circuit, r: SolveResult, locale: Locale): string {
  if (r.circleNode < 0) return '';
  const n = c.parts.length, k = r.circleNode;
  const at = k === n ? translate(locale, 'sm.solve.theInput') : k === 0 ? translate(locale, 'sm.solve.theLoad') : translate(locale, 'sm.solve.nodeN', { k });
  const a = unknownLabel(c, r.unknowns[0], locale);
  if (r.status === 'family') return translate(locale, 'sm.solve.circlesFamily', { a, at, b: unknownLabel(c, r.unknowns[1], locale) });
  if (r.unknowns.length === 2) return translate(locale, 'sm.solve.circlesTwo', { at, a, b: unknownLabel(c, r.unknowns[1], locale) });
  if (r.status === 'best') return translate(locale, 'sm.solve.circlesBest', { at, a });
  return translate(locale, 'sm.solve.circlesOne', { at, a });
}

function RangeList({ c, r, first }: { c: Circuit; r: SolveResult; first: Unknown }) {
  const { t, locale } = useI18n();
  return (
    <ul className={styles.ranges}>
      {r.ranges.map((g: ValueRange, k) => {
        const kind = first.param === 'value' && g.kind >= 0 ? g.kind : first.param === 'f0' ? -1 : c.parts[first.part].kind;
        const sym = symbolOf(kind, first.param ?? 'value');
        const what = first.param === 'f0' ? 'f0' : t('sm.solve.rangePartSym', { sym, n: first.part + 1 });
        const asKind = first.param === 'value' && g.kind >= 0 && g.kind !== c.parts[first.part].kind ? t('sm.solve.rangeAsKind', { kind: kindLower(g.kind, locale) }) : '';
        return (
          <li key={k} data-range={k} data-min={numText(g.min)} data-max={numText(g.max)}>
            {t('sm.solve.rangeAny', { what, asKind })}
            {' '}{t('sm.solve.rangeFrom')} <b>{amount(kind, first.param ?? 'value', g.min)}</b> {t('sm.solve.rangeTo')} <b>{amount(kind, first.param ?? 'value', g.max)}</b>
            {g.swapped && <span className={styles.flag}>{t('sm.solve.atF0Only')}</span>}
            {r.status === 'family' && <span className={styles.meta}>{t('sm.solve.rangeBranchesOf', { count: t(g.branches === 2 ? 'sm.solve.rangeBranches2' : 'sm.solve.rangeBranches1') })}</span>}
          </li>
        );
      })}
    </ul>
  );
}

function SolvePanel({ circuit, onChange, revision, busy, onResult, onPreview, lists, onLists, noSuggest }: SolvePanelProps) {
  const { t, locale } = useI18n();
  const c = circuit;
  const n = c.parts.length;
  const ask = askOf(c);
  const goal = ask.goal;

  // The outcome follows the committed circuit in a deferred render; slow problems in the worker (the newest wins).
  const shown = useDeferredValue(circuit);
  const slow = slowAsk(shown, askOf(shown));
  const quick = useMemo(() => (slow ? null : run(shown)), [shown, slow]);
  const [late, setLate] = useState<Outcome | null>(null);
  useEffect(() => {
    if (!slow) return undefined;
    let live = true;
    solveOffPage(shown, busy).then((r) => {
      if (live && r) setLate({ circuit: shown, result: r.result, ms: r.ms, where: r.where });
    }, (error) => { if (live) console.error(error); });
    return () => { live = false; };
  }, [shown, slow, busy]);
  // A request that is no longer wanted (the ask became fast, or the panel went) is dropped; a newer one overtakes it anyway.
  useEffect(() => (slow ? undefined : cancelSolve()), [slow]);
  // The workers end with the panel (the tool's page left); the next request makes new ones.
  useEffect(() => () => stopSolveWorkers(), []);
  // While the worker solves, the last answer for the same unknowns stays (stale: aria-busy, Apply off) rather than
  // "Solving…" for a few ms on every keystroke.
  const outcome = slow ? (late && (late.circuit === shown || sameMarks(late.circuit, shown)) ? late : null) : quick;
  // Suggestions (M4.4b) when nothing is marked: suggest.ts in the worker, the newest request winning; the last list
  // stays (stale) while the next is found.
  const unmarked = !noSuggest && askOf(shown).unknowns.length === 0;
  const [sug, setSug] = useState<{ circuit: Circuit; lists: ValueChoice; o: Suggestions; ms: number } | null>(null);
  useEffect(() => {
    if (!unmarked) return undefined;
    let live = true;
    suggestOffPage(shown, { lists }).then((r) => {
      if (live && r) setSug({ circuit: shown, lists, o: r.suggestions, ms: r.ms });
    }, (error) => { if (live) console.error(error); });
    return () => { live = false; };
  }, [shown, lists, unmarked]);
  useEffect(() => (unmarked ? undefined : cancelSuggest()), [unmarked]);
  const box = useRef<HTMLElement>(null);
  useEffect(() => {
    if (box.current) (box.current as HTMLElement & { smithSuggest?: unknown }).smithSuggest = sug;
  }, [sug]);
  useEffect(() => {
    if (box.current) (box.current as HTMLElement & { smithSolve?: Outcome | null }).smithSolve = outcome;
    onResult?.(outcome);
  }, [outcome, onResult]);

  const [markNote, setMarkNote] = useState<{ text: string; after: Circuit } | null>(null);
  const toggle = (u: Unknown) => {
    const { circuit: next, dropped } = toggleUnknown(c, u);
    onChange(next);
    setMarkNote(dropped ? { text: t('sm.strip.maxTwoNote', { name: unknownLabel(c, dropped, locale) }), after: next } : null);
  };
  const f0Marked = ask.unknowns.some((u) => u.param === 'f0');

  const setGoal = (g: Goal, group = '') => onChange(withGoal(c, g), group);
  const choice = choiceOf(goal);
  const node = goalNode(goal, n);
  const figure = FIGURE[goal.kind];
  const goalField = (name: string, label: string, unit: string, infinite: boolean, value: number, make: (v: number) => Goal) => (
    <Field name={name} label={label} revision={revision} shown={formatAmount(value, unit, DIGITS)} edit={(txt) => {
      const v = readAmount(txt, unit || undefined, infinite);
      if (v === null) return txt.trim() ? (unit ? t('sm.err.cannotReadAs', { text: txt.trim(), unit }) : t('sm.err.cannotReadNum', { text: txt.trim() })) : t('sm.err.empty');
      const g = make(v);
      const why = goalProblem(g, n);
      if (why) return why;
      setGoal(g, `field:${name}`);
      return '';
    }} />
  );

  const stale = !outcome || outcome.circuit !== circuit;
  const status = statusOf(outcome);
  const r = outcome?.result ?? null;
  const oc = outcome?.circuit ?? c;
  const nodeText = (k: number) => (k === oc.parts.length ? t('sm.solve.theInput') : k === 0 ? t('sm.solve.theLoad') : t('sm.solve.nodeN', { k }));
  const apply = (s: Solution) => { if (!stale) onChange(applySolution(oc, s)); };
  const reason = r ? sentence(r.reason) : '';

  // Previews (D14): hovering a solution, a member, a variant or the family's slider (mouse), or focusing it (keys, a
  // tap) draws its circuit on the chart; hover wins over focus, leaving clears. Items carry a key (data-pv) whose
  // circuit is made only when it is shown.
  const makers = new Map<string, () => Circuit>();
  const makersRef = useRef(makers);
  makersRef.current = makers;
  const shapes = new Map<string, CircleShape>();
  const shapesRef = useRef(shapes);
  shapesRef.current = shapes;
  const sugBase = useRef<Circuit | null>(null);
  const pv = useRef({ hover: '', focus: '', shown: null as Circuit | null });
  const sendRef = useRef(onPreview);
  sendRef.current = onPreview;
  const showPreview = useCallback(() => {
    const s = pv.current, key = s.hover || s.focus, make = key ? makersRef.current.get(key) : undefined;
    const c = make ? make() : null;
    if (c !== s.shown) { s.shown = c; sendRef.current?.(c, (c && shapesRef.current.get(key)) ?? null, sugBase.current); }
  }, []);
  const keyAt = (e: React.SyntheticEvent): string => ((e.target as Element).closest?.('[data-pv]')?.getAttribute('data-pv')) ?? '';
  const onOver = (e: React.MouseEvent) => { const k = keyAt(e); if (k !== pv.current.hover) { pv.current.hover = k; showPreview(); } };
  const onOut = () => { if (pv.current.hover) { pv.current.hover = ''; showPreview(); } };
  const onFocusIn = (e: React.FocusEvent) => { pv.current.focus = keyAt(e); showPreview(); };
  const onFocusOut = (e: React.FocusEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) { pv.current.focus = ''; showPreview(); }
  };
  // A new outcome replaces the items: the preview goes with them; and with the panel.
  useEffect(() => { pv.current.hover = ''; pv.current.focus = ''; showPreview(); }, [outcome, sug, lists, showPreview]);
  useEffect(() => () => sendRef.current?.(null), []);
  const x: ListCtx = { c: oc, goal: askOf(oc).goal, node: r ? nodeText(r.goalNode) : '', stale, lists, apply, makers };

  // The suggestions shown: for the circuit as it is, or (stale) the last ones while the next are found.
  const unmarkedNow = !noSuggest && status === 'nothing' && ask.unknowns.length === 0;
  const sugShown = unmarkedNow ? sug : null;
  const sugStale = unmarkedNow && (!sugShown || sugShown.circuit !== circuit || sugShown.lists !== lists);
  sugBase.current = sugShown?.circuit ?? null;
  let suggestBox: React.ReactNode = null;
  if (unmarkedNow) {
    if (!sugShown) suggestBox = <div className={styles.suggest} data-suggest-status="looking"><p className={styles.hint}>{t('sm.solve.looking')}</p></div>;
    else {
      const sc = sugShown.circuit, so = sugShown.o, sg = askOf(sc).goal, gn = goalNode(sg, sc.parts.length);
      const sn = gn === sc.parts.length ? t('sm.solve.theInput') : gn === 0 ? t('sm.solve.theLoad') : t('sm.solve.nodeN', { k: gn });
      const applySug = (s: Solution) => { if (!sugStale) onChange(applySolution(sc, s)); };
      const mark = (g: Suggestion) => {
        if (sugStale) return;
        let next = sc;
        for (const u of g.unknowns) next = toggleUnknown(next, u).circuit;
        onChange(next);
      };
      const sx: ListCtx = { c: sc, goal: sg, node: sn, stale: sugStale, lists: sugShown.lists, apply: applySug, makers, shapes };
      suggestBox = (
        <div className={styles.suggest} data-suggest-status={so.status}>
          <p className={styles.suggestHead} data-suggest-head="">{suggestHead(so, sn, so.list.some((g) => g.meets), locale)}</p>
          {so.list.length > 0 && <SuggestionList x={sx} list={so.list} onMark={mark} />}
        </div>
      );
    }
  }

  let body: React.ReactNode = null;
  if (status === 'solving') body = <p className={styles.message}>{t('sm.solve.solving')}</p>;
  else if (status === 'nothing') {
    body = <p className={styles.message}>{t('sm.solve.nothingBody')}</p>;
  } else if (r) {
    const first = r.unknowns[0];
    const head: Record<string, string> = {
      solved: r.solutions.length === 2 ? t('sm.solve.headTwo') : t('sm.solve.headCount', { n: r.solutions.length }),
      tangent: t('sm.solve.headTangent'),
      one: t('sm.solve.headOne'),
      none: t('sm.solve.headNone', { reason }),
      samejob: t('sm.solve.headSameJob', { reason }),
      'samejob-all': t('sm.solve.headSameJobAll'),
      coincident: t('sm.solve.headCoincident', { reason }),
      degenerate: t('sm.solve.headDegenerate', { reason }),
      best: r.solutions.length ? t('sm.solve.headBestNear') : t('sm.solve.headBestReason', { reason }),
      range: r.ranges.length ? t('sm.solve.headRange') : t('sm.solve.headRangeNone', { reason }),
      family: r.ranges.length ? t('sm.solve.headFamily') : reason,
      rejected: t('sm.solve.headRejected', { reason }),
    };
    body = (
      <>
        <p className={styles.message} data-solve-head="">{head[status]}</p>
        {r.status === 'best' && <p className={styles.hint} data-solve-suggest="">{suggestSecond(oc, r, locale)}</p>}
        {(r.status === 'range' || r.status === 'family') && r.ranges.length > 0 && <RangeList c={oc} r={r} first={first} />}
        {r.status === 'family' && r.family && r.family.ends.length > 0 && <p className={styles.hint}>{t('sm.solve.atEnds')}</p>}
        {r.status === 'range' && r.solutions.length > 0 && <p className={styles.hint}>{t('sm.solve.atEdges')}</p>}
        {r.solutions.length > 0 && r.status !== 'family' && (
          <SolutionList x={x} list={r.solutions} best={r.status === 'best'} />
        )}
        {r.status === 'family' && r.family && r.family.ends.length > 0 && (
          <SolutionList x={x} list={distinctEnds(r.family.ends)} />
        )}
        {r.status === 'family' && r.family && r.ranges.length > 0 && <FamilySlider key={r.ranges.map((g) => `${g.t0}:${g.t1}`).join()} x={x} r={r} onMove={showPreview} />}
        {r.status === 'family' && r.ranges.length > 0 && (
          <p className={styles.hint}>
            {t('sm.solve.familyHint', { first: unknownLabel(oc, first, locale), second: unknownLabel(oc, r.unknowns[1], locale) })}
          </p>
        )}
      </>
    );
  }

  return (
    <section ref={box} className={`${base.panel} ${styles.panel}`} aria-labelledby="smith-solve" data-solve="">
      <h2 className={base.panelTitle} id="smith-solve">{t('sm.solve.title')} <span className={base.panelNote}>{t('sm.strip.atF0')}</span></h2>

      <div className={styles.row}>
        <span className={styles.label}>{t('sm.solve.solveFor')}</span>
        {ask.unknowns.length === 0 && <span className={styles.none}>{t('sm.solve.nothingMarked')}</span>}
        {ask.unknowns.map((u, i) => (
          <button key={`${u.param}${u.part}`} type="button" className={styles.chip} data-unmark={i} onClick={() => toggle(u)}
            title={t('sm.solve.unmarkTitle')} aria-label={t('sm.solve.unmarkAria', { name: unknownLabel(c, u, locale) })}>
            {unknownLabel(c, u, locale)} <span aria-hidden="true">×</span>
          </button>
        ))}
        <button type="button" className={`${base.button} ${base.toggle}`} aria-pressed={f0Marked} data-solve-mark="f0"
          onClick={() => toggle({ part: -1, param: 'f0' })} title={t('sm.solve.f0Title')}>f0</button>
        <Why k="solve-mark" />
      </div>
      {markNote && markNote.after === c && <p className={styles.note} role="status" data-mark-note="">{markNote.text}</p>}

      <div className={styles.goal}>
        <label className={styles.goalPart}>
          <span className={styles.label}>{t('sm.solve.goalAt')}</span>
          <select className={base.select} data-goal-node="" value={node} onChange={(e) => setGoal({ ...goal, node: Number(e.target.value) })}>
            {Array.from({ length: n + 1 }, (_, k) => n - k).map((k) => <option key={k} value={k}>{k === n ? t('sm.solve.theInput') : nodeName(k, n, locale).toLowerCase()}</option>)}
          </select>
        </label>
        <label className={styles.goalPart}>
          <span className={styles.label}>{t('sm.solve.reach')}</span>
          <select className={base.select} data-goal-kind="" value={choice} onChange={(e) => setGoal(startGoal(e.target.value as Choice, c.z0, goal.node))}>
            {CHOICE_IDS.map((id) => <option key={id} value={id}>{t(`sm.solve.choice.${id}` as TranslationKey)}</option>)}
          </select>
        </label>
        <Why k="solve-goal" />
      </div>
      {(choice === 'point' || figure) && (
        <div className={styles.goalFields}>
          {choice === 'point' && goalField('goal-R', 'R', 'Ω', true, goal.targetR ?? c.z0, (v) => ({ ...goal, targetR: v, targetX: v === Infinity ? 0 : goal.targetX ?? 0 }))}
          {choice === 'point' && goalField('goal-X', 'X', 'Ω', false, goal.targetX ?? 0, (v) => ({ ...goal, targetX: v }))}
          {figure && goalField('goal-value', goal.kind === 'rl' ? t('sm.chart.returnLoss') : figure.label, figure.unit, figure.infinite, goalValue(goal), (v) => ({ ...goal, value: v }))}
          {(goal.kind === 'vswr' || goal.kind === 'mag' || goal.kind === 'rl') && (
            <label className={styles.within}>
              <input type="checkbox" data-goal-within="" checked={!!goal.within} onChange={(e) => setGoal({ ...goal, within: e.target.checked })} />
              {t(goal.kind === 'rl' ? 'sm.solve.orMore' : 'sm.solve.orLess')}
            </label>
          )}
        </div>
      )}

      {ask.unknowns.length > 0 && (
        <p className={styles.count} data-solve-count="">{countText(ask.unknowns.length, goal, locale)} <Why k="solve-count" /></p>
      )}
      <div className={styles.result} data-solve-status={status} aria-live="polite" aria-busy={stale || sugStale || undefined}
        onMouseOver={onOver} onMouseLeave={onOut} onFocus={onFocusIn} onBlur={onFocusOut}>
        {body}
        {suggestBox}
        {r && r.circleNode >= 0 && <p className={styles.hint} data-solve-circles="">{circlesText(oc, r, locale)} <Why k="solve-circles" /></p>}
        {r && r.solutions.length + (r.family?.ends.length ?? 0) > 0 && <span className={styles.applyWhy}><Why k="solve-apply" /></span>}
      </div>
      <ListsSetting lists={lists} onLists={onLists} />
    </section>
  );
}

export default memo(SolvePanel);
