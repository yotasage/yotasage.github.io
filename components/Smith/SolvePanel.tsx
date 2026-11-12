import React, { memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';

import { formatAmount, readAmount } from '../../lib/quantity';
import { goalNode, goalProblem, goalValue, isWithin } from '../../lib/smith/goal';
import type { Goal, GoalKind } from '../../lib/smith/goal';
import { LINE, QUARTER, SERIES_C, SERIES_L, SERIES_R, SHUNT_C, SHUNT_L, SHUNT_R, STUB_OPEN, STUB_SHORT } from '../../lib/smith/parts';
import { atFrequency, solve } from '../../lib/smith/solve';
import type { Solution, SolvedValue, SolveResult, ValueRange } from '../../lib/smith/solve';
import {
  Ask, askOf, Circuit, cleanAsk, KIND_NAMES, numText, toggleUnknown, Unknown, unknownName, withGoal, withPart,
} from '../../lib/smith/state';
import { LIST_IDS, VALUE_UNITS, parseOwnList, standardVariants } from '../../lib/smith/values';
import type { ListId, ValueChoice, ValueKind, Variant } from '../../lib/smith/values';
import styles from '../../styles/SmithSolve.module.css';
import base from '../../styles/Smith.module.css';
import { nodeName } from './pathLayer';
import { Field } from './Strip';
import { Why } from './Why';

// The Solve panel (step M4.3a; solver.md, notes-M4.1a/b, M4.2): what is unknown (marked on the parts' cards, f0 here),
// the goal (where, and a point or a circle), and what the solver gives back, in the words of solver.md's counting table:
// solutions with Apply (one undo step), the best value of one unknown for a point, the ranges of an inequality goal, a
// family of two unknowns for a circle, and why there is none. The unknowns and the goal are the circuit's `ask`
// (state.ts), so the link, undo and redo carry them.
//
// Solving never runs in the drag's frames: the panel solves the committed circuit in a deferred render (most solves
// take microseconds). The few problems of the generic 2-D search (f0 or a line's Zc with another such unknown: 7 to
// 20 ms) are solved after a pause with no drag in progress, outside any render.

export interface Outcome {
  /** The circuit (with its ask) that was solved. */
  circuit: Circuit;
  /** null when nothing is marked. */
  result: SolveResult | null;
  /** The solve's time in ms. */
  ms: number;
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
  /** A solution's circuit to draw as a preview on the chart, null for none (M4.3b). */
  onPreview?: (c: Circuit | null) => void;
  /** The value lists per kind (D17) and their change (the page keeps them in the link and localStorage). */
  lists: ValueChoice;
  onLists: (next: ValueChoice) => void;
}

/** A slow solve waits this long after the last change, and again while a drag is in progress. */
const SLOW_WAIT_MS = 150;
const DIGITS = 4;

/** Whether the solver takes its generic 2-D grid (notes-M4.2.md: 7–20 ms) for this ask. */
function slowAsk(c: Circuit, ask: Ask): boolean {
  if (ask.unknowns.length !== 2) return false;
  const kind = (u: Unknown) => c.parts[u.part]?.kind;
  return ask.unknowns.some((u) => u.param === 'f0' || (u.param === 'zc' && kind(u) === LINE))
    && ask.unknowns.every((u) => u.param === 'f0' || u.param === 'zc' || kind(u) === QUARTER);
}

function run(c: Circuit): Outcome {
  const ask = askOf(c);
  if (!ask.unknowns.length) return { circuit: c, result: null, ms: 0 };
  const t = performance.now();
  const result = solve(c, ask.unknowns, ask.goal);
  return { circuit: c, result, ms: performance.now() - t };
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
  return unit ? formatAmount(v, unit, DIGITS) : `${formatAmount(v, '', DIGITS)} λ`;
}
const symbolOf = (kind: number, param: string): string => (param === 'f0' ? 'f0' : param === 'zc' ? 'Zc' : VALUE_SYMBOL[kind]);
/** A small number: plain to three digits, else in e-notation. */
const small = (v: number): string => (v === 0 ? '0' : v >= 1e-3 ? formatAmount(v, '', 3) : v.toExponential(1).replace('-', '−'));
/** A kind's name inside a sentence ("series C"). */
const kindName = (k: number): string => `${KIND_NAMES[k][0].toLowerCase()}${KIND_NAMES[k].slice(1)}`;
const sentence = (s: string): string => (s ? `${s[0].toUpperCase()}${s.slice(1)}${/[.!?]$/.test(s) ? '' : '.'}` : '');

/** Goal kinds as the selector offers them ("centre" is the point target at Z0). */
type Choice = 'centre' | GoalKind;
const CHOICES: { id: Choice; text: string }[] = [
  { id: 'centre', text: 'the centre (a match)' },
  { id: 'point', text: 'a point Z' },
  { id: 'vswr', text: 'a VSWR' },
  { id: 'mag', text: 'a |Γ|' },
  { id: 'rl', text: 'a return loss' },
  { id: 'r', text: 'an r circle (r = 1)' },
  { id: 'g', text: 'a g circle (g = 1)' },
  { id: 'x', text: 'an x circle (x = 0: no reactance)' },
  { id: 'b', text: 'a b circle (b = 0: no susceptance)' },
];
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
function countText(n: number, g: Goal): string {
  if (n === 1) {
    if (g.kind === 'point') return 'One value and a point: exact only by chance, so the solver gives the nearest value.';
    if (isWithin(g)) return 'One value and a goal with “at most”: the ranges of values that keep it.';
    return 'One value and a circle: 0, 1 or 2 values, where the part’s circle crosses the goal’s.';
  }
  if (g.kind === 'point') return 'Two values and a point: 0, 1 or 2 solutions, where two circles cross.';
  return 'Two values and a circle: a family; for each value of the first, 0 to 2 values of the second.';
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
function suggestSecond(c: Circuit, r: SolveResult): string {
  const u = r.unknowns[0];
  const g = r.goalNode, a = u.param === 'f0' ? -1 : u.part;
  let best = -1;
  for (let d = 1; d < c.parts.length + 1 && best < 0; d++) {
    for (const j of [a + d, a - d]) {
      if (j >= 0 && j < g && j !== a && best < 0 && c.parts[j].kind !== SERIES_R && c.parts[j].kind !== SHUNT_R) best = j;
    }
  }
  if (best < 0 && a >= 0) return 'Free a second value to reach the point exactly (add a part, or mark f0), or choose a circle goal.';
  if (best < 0) return 'Free a second value to reach the point exactly (mark a part’s value), or choose a circle goal.';
  return `Free a second value to reach the point exactly, for example ${unknownName(c, { part: best, param: 'value' })}, or choose a circle goal.`;
}

// ---------------------------------------------------------------------------------------------------------------

function ValueText({ c, v }: { c: Circuit; v: SolvedValue }) {
  const own = v.param === 'f0' ? -1 : c.parts[v.part]?.kind ?? -1;
  const kind = v.param === 'value' ? v.kind : own;
  return (
    <span className={styles.value} data-value="" data-part={v.part} data-param={v.param} data-kind={v.kind} data-raw={numText(v.value)}>
      <span className={styles.who}>{v.param === 'f0' ? 'f0' : `Part ${v.part + 1}`}{v.param === 'value' && v.kind !== own ? ` as a ${kindName(v.kind)},` : ''}</span>
      {' '}<b>{symbolOf(kind, v.param)} = {amount(kind, v.param, v.value)}</b>
      {v.swapped && <span className={styles.flag} data-swapped=""> true at this frequency only</span>}
      {v.period > 0 && <span className={styles.flag} data-period=""> (+ λ/2 gives the same match at f0, over a narrower band)</span>}
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
}

/** A solution with the values of a standard-value variant (values.ts standardVariants) in place of its own. */
const withValues = (s: Solution, values: readonly number[]): Solution => ({ ...s, values: s.values.map((v, j) => ({ ...v, value: values[j] })) });

/** How near the goal a variant comes, in the words of its goal. */
function variantMeta(g: Goal, v: Variant, node: string): string {
  if (g.kind === 'point') return `comes within ${small(v.mismatch)} of the target (|Γ| = ${small(v.gamma)} at ${node})`;
  const within = isWithin(g);
  return `|Γ| = ${small(v.gamma)} at ${node}; ${v.meets ? (within ? 'keeps the goal' : 'on the goal') : `${within ? 'outside the goal' : 'off the goal'} by ${small(v.residual)}`}`;
}

/** The standard values next to a solution's (none when every list is "any value"), each with Apply and a preview. */
function Variants({ x, s, pv }: { x: ListCtx; s: Solution; pv: string }) {
  const list = useMemo(() => standardVariants(x.c, x.goal, s, x.lists), [x.c, x.goal, s, x.lists]);
  if (!list.some((v) => !v.exact)) return null;
  return (
    <div className={styles.variantBox}>
      <span className={styles.variantHead}>With standard values:</span>
      <ul className={styles.variants} data-variants="">
        {list.map((v, j) => {
          const key = `${pv}:${j}`, sv = withValues(s, v.values);
          x.makers.set(key, () => applySolution(x.c, sv));
          return (
            <li key={j} className={styles.variant} data-variant={j} data-pv={key} tabIndex={0} data-meets={v.meets ? '' : undefined}
              aria-label={`Standard values ${j + 1}: focus to preview on the chart`}>
              <span className={styles.variantValues}>
                {sv.values.map((u, i) => (
                  <span key={i} data-variant-value="" data-raw={numText(u.value)}>
                    {i ? ', ' : ''}{symbolOf(u.param === 'value' ? u.kind : x.c.parts[u.part]?.kind ?? -1, u.param)} = <b>{amount(u.param === 'value' ? u.kind : x.c.parts[u.part]?.kind ?? -1, u.param, u.value)}</b>
                  </span>
                ))}
              </span>
              <span className={styles.meta}>{variantMeta(x.goal, v, x.node)}</span>
              <button type="button" className={`${base.button} ${styles.small}`} data-apply-variant={j} disabled={x.stale}
                onClick={() => x.apply(sv)} title="Put these standard values in the circuit (one step; Undo takes it back)">Apply</button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function SolutionList({ x, list, best, item = 'solution' }: { x: ListCtx; list: Solution[]; best?: boolean; item?: 'solution' | 'member' }) {
  return (
    <ol className={styles.solutions}>
      {list.map((s, k) => {
        const key = `${item}:${k}`;
        x.makers.set(key, () => applySolution(x.c, s));
        const attrs = item === 'solution' ? { 'data-solution': k } : { 'data-member': k };
        return (
          <li key={k} className={styles.solution} {...attrs} data-residual={numText(s.residual)} data-pv={key} tabIndex={0}
            aria-label={`${item === 'solution' ? 'Solution' : 'Member'} ${k + 1}: focus to preview its path on the chart`}>
            <div className={styles.values}>{s.values.map((v, j) => <ValueText key={j} c={x.c} v={v} />)}</div>
            <div className={styles.meta}>
              {best
                ? <span>comes within <b>{small(s.mismatch)}</b> of the target (|Γ| = {small(s.gamma)} at {x.node})</span>
                : <span>|Γ| = {small(s.gamma)} at {x.node}; off the goal by {small(s.residual)}</span>}
              {!s.realisable && !s.atF0Only && <span className={styles.flag}> not of the part’s own kind</span>}
            </div>
            <span className={styles.applyGroup}>
              <button type="button" className={base.button} {...{ [item === 'solution' ? 'data-apply' : 'data-apply-member']: k }} disabled={x.stale}
                onClick={() => x.apply(s)} title="Put these values in the circuit (one step; Undo takes it back)">Apply</button>
            </span>
            <div className={styles.variantRow}><Variants x={x} s={s} pv={`v${key}`} /></div>
          </li>
        );
      })}
    </ol>
  );
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
  const ranges = r.ranges;
  const [pos, setPos] = useState(() => {
    let total = 0;
    for (const g of ranges) total += g.t1 - g.t0;
    return Math.round((0.5 * (ranges[0].t1 - ranges[0].t0) / total) * FAMILY_STEPS);
  });
  const t = familyT(ranges, pos);
  const members = useMemo(() => r.family!.at(t), [r, t]);
  x.makers.set('fam', () => (members.length ? applySolution(x.c, members[0]) : x.c));
  useEffect(onMove, [t, onMove]);
  const first = members[0]?.values[0];
  const firstText = first ? `${symbolOf(first.param === 'value' ? first.kind : x.c.parts[first.part]?.kind ?? -1, first.param)} = ${amount(first.param === 'value' ? first.kind : x.c.parts[first.part]?.kind ?? -1, first.param, first.value)}` : 'no member here';
  return (
    <div className={styles.family} data-family="">
      <label className={styles.familyLabel}>
        <span>Pick a member by {unknownName(x.c, r.unknowns[0])}:</span>
        <input type="range" className={styles.slider} min={0} max={FAMILY_STEPS} step={1} value={pos} data-family-slider="" data-pv="fam"
          data-t={numText(t)} aria-valuetext={firstText} onChange={(e) => setPos(Number(e.target.value))} />
      </label>
      <p className={styles.familyNow} data-family-first={first ? numText(first.value) : ''}>
        {first ? <>{firstText}{first.swapped ? ' (true at this frequency only)' : ''}: {members.length === 2 ? 'two values' : 'one value'} of {unknownName(x.c, r.unknowns[1])}</> : 'No member at this value.'}
      </p>
      {members.length > 0 && <SolutionList x={x} list={members} item="member" />}
    </div>
  );
}

const LIST_KINDS: { kind: ValueKind; name: string }[] = [{ kind: 'R', name: 'R' }, { kind: 'L', name: 'L' }, { kind: 'C', name: 'C' }, { kind: 'Z', name: 'Zt, Zc' }];
const listName = (id: string): string => (id === 'own' ? 'own list' : id === 'any' ? 'any value' : id);
/** An own list as text to edit (no spaces inside an amount, so the reader splits only between values). */
const ownText = (kind: ValueKind, values: readonly number[]): string =>
  values.map((v) => formatAmount(v, VALUE_UNITS[kind], 4).replace(/\s+/g, '')).join(', ');

/** The value list per kind (D17): what Snap and the standard values below each solution use; kept in the link. */
function ListsSetting({ lists, onLists }: { lists: ValueChoice; onLists: (next: ValueChoice) => void }) {
  const [texts, setTexts] = useState<Partial<Record<ValueKind, string>>>({});
  const [rejected, setRejected] = useState<Partial<Record<ValueKind, string[]>>>({});
  const choose = (kind: ValueKind, id: ListId) => {
    if (id === 'own') {
      const values = lists[kind].id === 'own' ? lists[kind].values ?? [] : [];
      setTexts((t) => ({ ...t, [kind]: t[kind] ?? ownText(kind, values) }));
      onLists({ ...lists, [kind]: { id, values } });
    } else onLists({ ...lists, [kind]: { id } });
  };
  const typeOwn = (kind: ValueKind, text: string) => {
    setTexts((t) => ({ ...t, [kind]: text }));
    const { values, rejected: bad } = parseOwnList(text, kind);
    setRejected((r) => ({ ...r, [kind]: bad }));
    onLists({ ...lists, [kind]: { id: 'own', values } });
  };
  return (
    <details className={styles.lists} data-lists="">
      <summary className={styles.listsSummary}>
        Standard values: {LIST_KINDS.map(({ kind, name }) => `${name.split(',')[0]} ${listName(lists[kind].id)}`).join(' · ')}
      </summary>
      <p className={styles.hint}>Snap rounds a dragged value to its kind’s list, and each solution shows its neighbours in it with what they cost.</p>
      <div className={styles.listGrid}>
        {LIST_KINDS.map(({ kind, name }) => {
          const l = lists[kind];
          return (
            <div key={kind} className={styles.listRow}>
              <label className={styles.goalPart}>
                <span className={styles.label}>{name}</span>
                <select className={base.select} data-list-kind={kind} value={l.id} onChange={(e) => choose(kind, e.target.value as ListId)}>
                  {LIST_IDS.map((id) => <option key={id} value={id}>{listName(id)}</option>)}
                </select>
              </label>
              {l.id === 'own' && (
                <label className={styles.ownBox}>
                  <span className={styles.label}>{name} values ({l.values?.length ?? 0})</span>
                  <textarea className={styles.own} rows={2} data-list-own={kind} spellCheck={false}
                    value={texts[kind] ?? ownText(kind, l.values ?? [])} onChange={(e) => typeOwn(kind, e.target.value)}
                    placeholder={kind === 'R' ? '10, 22, 47, 4k7' : kind === 'L' ? '10n, 22n, 47n' : kind === 'C' ? '1p, 2.2p, 4.7p' : '35, 50, 75'} />
                  {(rejected[kind]?.length ?? 0) > 0 && <span className={styles.flag} data-list-rejected={kind}>Not read: {rejected[kind]!.slice(0, 5).join(', ')}</span>}
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
function circlesText(c: Circuit, r: SolveResult): string {
  if (r.circleNode < 0) return '';
  const n = c.parts.length, k = r.circleNode;
  const at = k === n ? 'the input' : k === 0 ? 'the load' : `node ${k}`;
  const a = unknownName(c, r.unknowns[0]);
  if (r.status === 'family') return `On the chart: the circle ${a} moves ${at} on (its colour) and the goal carried back past ${unknownName(c, r.unknowns[1])} (the goal’s colour); each member is a point of the first that ${unknownName(c, r.unknowns[1])} carries onto the second.`;
  if (r.unknowns.length === 2) return `On the chart at ${at}: the circle ${a} reaches (its colour) and the circle ${unknownName(c, r.unknowns[1])} must start on (its colour); the solutions are where they cross.`;
  if (r.status === 'best') return `On the chart at ${at}: the circle ${a} moves the node on and the circle of the nearest mismatch, which it touches at the best value.`;
  return `On the chart at ${at}: the circle ${a} moves the node on and the goal carried back to it; the values are where they cross.`;
}

function RangeList({ c, r, first }: { c: Circuit; r: SolveResult; first: Unknown }) {
  return (
    <ul className={styles.ranges}>
      {r.ranges.map((g: ValueRange, k) => {
        const kind = first.param === 'value' && g.kind >= 0 ? g.kind : first.param === 'f0' ? -1 : c.parts[first.part].kind;
        const sym = symbolOf(kind, first.param ?? 'value');
        return (
          <li key={k} data-range={k} data-min={numText(g.min)} data-max={numText(g.max)}>
            any {first.param === 'f0' ? 'f0' : `${sym} of part ${first.part + 1}`}{first.param === 'value' && g.kind >= 0 && g.kind !== c.parts[first.part].kind ? ` (as a ${kindName(g.kind)})` : ''}
            {' '}from <b>{amount(kind, first.param ?? 'value', g.min)}</b> to <b>{amount(kind, first.param ?? 'value', g.max)}</b>
            {g.swapped && <span className={styles.flag}> true at this frequency only</span>}
            {r.status === 'family' && <span className={styles.meta}> ({g.branches === 2 ? 'one or two values' : 'one value'} of the second each)</span>}
          </li>
        );
      })}
    </ul>
  );
}

function SolvePanel({ circuit, onChange, revision, busy, onResult, onPreview, lists, onLists }: SolvePanelProps) {
  const c = circuit;
  const n = c.parts.length;
  const ask = askOf(c);
  const goal = ask.goal;

  // The outcome follows the committed circuit in a deferred render; slow problems after a pause, outside renders.
  const shown = useDeferredValue(circuit);
  const slow = slowAsk(shown, askOf(shown));
  const quick = useMemo(() => (slow ? null : run(shown)), [shown, slow]);
  const [late, setLate] = useState<Outcome | null>(null);
  useEffect(() => {
    if (!slow) return undefined;
    let id = 0;
    const go = () => {
      if (busy?.()) { id = window.setTimeout(go, SLOW_WAIT_MS); return; }
      setLate(run(shown));
    };
    id = window.setTimeout(go, SLOW_WAIT_MS);
    return () => window.clearTimeout(id);
  }, [shown, slow, busy]);
  const outcome = slow ? (late && late.circuit === shown ? late : null) : quick;
  const box = useRef<HTMLElement>(null);
  useEffect(() => {
    if (box.current) (box.current as HTMLElement & { smithSolve?: Outcome | null }).smithSolve = outcome;
    onResult?.(outcome);
  }, [outcome, onResult]);

  const [markNote, setMarkNote] = useState<{ text: string; after: Circuit } | null>(null);
  const toggle = (u: Unknown) => {
    const { circuit: next, dropped } = toggleUnknown(c, u);
    onChange(next);
    setMarkNote(dropped ? { text: `At most two at a time: ${unknownName(c, dropped)} is no longer solved for.`, after: next } : null);
  };
  const f0Marked = ask.unknowns.some((u) => u.param === 'f0');

  const setGoal = (g: Goal, group = '') => onChange(withGoal(c, g), group);
  const choice = choiceOf(goal);
  const node = goalNode(goal, n);
  const figure = FIGURE[goal.kind];
  const goalField = (name: string, label: string, unit: string, infinite: boolean, value: number, make: (v: number) => Goal) => (
    <Field name={name} label={label} revision={revision} shown={formatAmount(value, unit, DIGITS)} edit={(t) => {
      const v = readAmount(t, unit || undefined, infinite);
      if (v === null) return t.trim() ? `cannot read “${t.trim()}”${unit ? ` as ${unit}` : ' as a number'}` : 'empty';
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
  const nodeText = (k: number) => (k === oc.parts.length ? 'the input' : k === 0 ? 'the load' : `node ${k}`);
  const apply = (s: Solution) => { if (!stale) onChange(applySolution(oc, s)); };
  const reason = r ? sentence(r.reason) : '';

  // Previews (D14): hovering a solution, a member, a variant or the family's slider (mouse), or focusing it (keys, a
  // tap) draws its circuit on the chart; hover wins over focus, leaving clears. Items carry a key (data-pv) whose
  // circuit is made only when it is shown.
  const makers = new Map<string, () => Circuit>();
  const makersRef = useRef(makers);
  makersRef.current = makers;
  const pv = useRef({ hover: '', focus: '', shown: null as Circuit | null });
  const sendRef = useRef(onPreview);
  sendRef.current = onPreview;
  const showPreview = useCallback(() => {
    const s = pv.current, key = s.hover || s.focus, make = key ? makersRef.current.get(key) : undefined;
    const c = make ? make() : null;
    if (c !== s.shown) { s.shown = c; sendRef.current?.(c); }
  }, []);
  const keyAt = (e: React.SyntheticEvent): string => ((e.target as Element).closest?.('[data-pv]')?.getAttribute('data-pv')) ?? '';
  const onOver = (e: React.MouseEvent) => { const k = keyAt(e); if (k !== pv.current.hover) { pv.current.hover = k; showPreview(); } };
  const onOut = () => { if (pv.current.hover) { pv.current.hover = ''; showPreview(); } };
  const onFocusIn = (e: React.FocusEvent) => { pv.current.focus = keyAt(e); showPreview(); };
  const onFocusOut = (e: React.FocusEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) { pv.current.focus = ''; showPreview(); }
  };
  // A new outcome replaces the items: the preview goes with them; and with the panel.
  useEffect(() => { pv.current.hover = ''; pv.current.focus = ''; showPreview(); }, [outcome, lists, showPreview]);
  useEffect(() => () => sendRef.current?.(null), []);
  const x: ListCtx = { c: oc, goal: askOf(oc).goal, node: r ? nodeText(r.goalNode) : '', stale, lists, apply, makers };

  let body: React.ReactNode = null;
  if (status === 'solving') body = <p className={styles.message}>Solving…</p>;
  else if (status === 'nothing') {
    body = (
      <p className={styles.message}>
        Nothing is marked yet. Select a part in the strip and press its value under “Solve for” on its card (a line or stub
        also offers Zc), or press f0 above. Mark two values to reach a point, one to reach a circle.
      </p>
    );
  } else if (r) {
    const first = r.unknowns[0];
    const head: Record<string, string> = {
      solved: `${r.solutions.length === 2 ? 'Two' : r.solutions.length} solutions.`,
      tangent: 'One solution: the two circles just touch.',
      one: 'One solution.',
      none: `No solution. ${reason}`,
      samejob: `These two parts do the same job. ${reason}`,
      'samejob-all': 'These two parts do the same job: their circles are one, so any value of one has a value of the other. Fix one of them.',
      coincident: `Every value works. ${reason}`,
      degenerate: `${reason} Fix one of them, or choose another target.`,
      best: `One value alone reaches a point only by chance. ${r.solutions.length ? 'The nearest it comes:' : reason}`,
      range: r.ranges.length ? 'The values that keep the goal:' : `No value keeps the goal. ${reason}`,
      family: r.ranges.length ? 'A family of solutions: for every value of the first unknown in a range, the second has a value that meets the goal.' : reason,
      rejected: `Cannot solve this: ${reason}`,
    };
    body = (
      <>
        <p className={styles.message} data-solve-head="">{head[status]}</p>
        {r.status === 'best' && <p className={styles.hint} data-solve-suggest="">{suggestSecond(oc, r)}</p>}
        {(r.status === 'range' || r.status === 'family') && r.ranges.length > 0 && <RangeList c={oc} r={r} first={first} />}
        {r.status === 'family' && r.family && r.family.ends.length > 0 && <p className={styles.hint}>At the ends of the ranges:</p>}
        {r.status === 'range' && r.solutions.length > 0 && <p className={styles.hint}>The edges, where the goal holds exactly:</p>}
        {r.solutions.length > 0 && r.status !== 'family' && (
          <SolutionList x={x} list={r.solutions} best={r.status === 'best'} />
        )}
        {r.status === 'family' && r.family && r.family.ends.length > 0 && (
          <SolutionList x={x} list={distinctEnds(r.family.ends)} />
        )}
        {r.status === 'family' && r.family && r.ranges.length > 0 && <FamilySlider key={r.ranges.map((g) => `${g.t0}:${g.t1}`).join()} x={x} r={r} onMove={showPreview} />}
        {r.status === 'family' && r.ranges.length > 0 && (
          <p className={styles.hint}>
            Or fix {unknownName(oc, first)} at a value inside a range and solve for {unknownName(oc, r.unknowns[1])} alone, or
            choose a point target.
          </p>
        )}
      </>
    );
  }

  return (
    <section ref={box} className={`${base.panel} ${styles.panel}`} aria-labelledby="smith-solve" data-solve="">
      <h2 className={base.panelTitle} id="smith-solve">Find the missing value <span className={base.panelNote}>at f0</span></h2>

      <div className={styles.row}>
        <span className={styles.label}>Solve for</span>
        {ask.unknowns.length === 0 && <span className={styles.none}>nothing marked</span>}
        {ask.unknowns.map((u, i) => (
          <button key={`${u.param}${u.part}`} type="button" className={styles.chip} data-unmark={i} onClick={() => toggle(u)}
            title="No longer solve for this" aria-label={`No longer solve for ${unknownName(c, u)}`}>
            {unknownName(c, u)} <span aria-hidden="true">×</span>
          </button>
        ))}
        <button type="button" className={`${base.button} ${base.toggle}`} aria-pressed={f0Marked} data-solve-mark="f0"
          onClick={() => toggle({ part: -1, param: 'f0' })} title="Let the solver find the frequency at which the goal holds (f0/10 to 10·f0)">f0</button>
        <Why k="solve-mark" />
      </div>
      {markNote && markNote.after === c && <p className={styles.note} role="status" data-mark-note="">{markNote.text}</p>}

      <div className={styles.goal}>
        <label className={styles.goalPart}>
          <span className={styles.label}>Goal at</span>
          <select className={base.select} data-goal-node="" value={node} onChange={(e) => setGoal({ ...goal, node: Number(e.target.value) })}>
            {Array.from({ length: n + 1 }, (_, k) => n - k).map((k) => <option key={k} value={k}>{k === n ? 'the input' : nodeName(k, n).toLowerCase()}</option>)}
          </select>
        </label>
        <label className={styles.goalPart}>
          <span className={styles.label}>reach</span>
          <select className={base.select} data-goal-kind="" value={choice} onChange={(e) => setGoal(startGoal(e.target.value as Choice, c.z0, goal.node))}>
            {CHOICES.map(({ id, text }) => <option key={id} value={id}>{text}</option>)}
          </select>
        </label>
        <Why k="solve-goal" />
      </div>
      {(choice === 'point' || figure) && (
        <div className={styles.goalFields}>
          {choice === 'point' && goalField('goal-R', 'R', 'Ω', true, goal.targetR ?? c.z0, (v) => ({ ...goal, targetR: v, targetX: v === Infinity ? 0 : goal.targetX ?? 0 }))}
          {choice === 'point' && goalField('goal-X', 'X', 'Ω', false, goal.targetX ?? 0, (v) => ({ ...goal, targetX: v }))}
          {figure && goalField('goal-value', figure.label, figure.unit, figure.infinite, goalValue(goal), (v) => ({ ...goal, value: v }))}
          {(goal.kind === 'vswr' || goal.kind === 'mag' || goal.kind === 'rl') && (
            <label className={styles.within}>
              <input type="checkbox" data-goal-within="" checked={!!goal.within} onChange={(e) => setGoal({ ...goal, within: e.target.checked })} />
              {goal.kind === 'rl' ? 'or more' : 'or less'}
            </label>
          )}
        </div>
      )}

      {ask.unknowns.length > 0 && (
        <p className={styles.count} data-solve-count="">{countText(ask.unknowns.length, goal)} <Why k="solve-count" /></p>
      )}
      <div className={styles.result} data-solve-status={status} aria-live="polite" aria-busy={stale || undefined}
        onMouseOver={onOver} onMouseLeave={onOut} onFocus={onFocusIn} onBlur={onFocusOut}>
        {body}
        {r && r.circleNode >= 0 && <p className={styles.hint} data-solve-circles="">{circlesText(oc, r)}</p>}
        {r && r.solutions.length + (r.family?.ends.length ?? 0) > 0 && <span className={styles.applyWhy}><Why k="solve-apply" /></span>}
      </div>
      <ListsSetting lists={lists} onLists={onLists} />
    </section>
  );
}

export default memo(SolvePanel);
