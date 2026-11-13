// "Explain this move" (step M5.4, docs/smith-chart/learning.md §3), in the selected part's card: after a drag or a
// typed change of the part's value, what the change did (old and new value, the nodes, the sense and amount, |Γ|) and
// why, by the rules of theory.md §4; on demand ("Explain this move" on the card) the part's whole arc from no effect:
// the rule of its kind, the circle it moves on with centre and radius, the sense and why, the equations with the
// numbers put in (the panel's printer, mathRows.rowOf), the derivation and the theory topic. The data is
// lib/smith/explain.ts; every number is the engine's. It renders only after a commit (never in a drag's frames), and
// the marker that traces the move on the chart (PathLayer.trace) runs in its own animation frames, never with
// prefers-reduced-motion.

import React, { useEffect, useMemo, useRef } from 'react';

import type Bibliography from '../Bibliography';
import { EQUATION_BY_ID, tex, valueTex } from '../../lib/smith/equations';
import type { TexPiece } from '../../lib/smith/equations';
import { CCW, CW, explainMove, explainPart, movePath } from '../../lib/smith/explain';
import type { Explanation, MoveExplanation, Point, Sense } from '../../lib/smith/explain';
import type { Circuit } from '../../lib/smith/network';
import {
  LINE, QUARTER, SERIES_C, SERIES_L, SERIES_R, SHUNT_C, SHUNT_L, SHUNT_R, STUB_OPEN, STUB_SHORT,
} from '../../lib/smith/parts';
import { formatAmount, formatResidual } from '../../lib/quantity';
import { KIND_NAMES, VALUE_NAMES } from '../../lib/smith/state';
import css from '../../styles/SmithExplain.module.css';
import mcss from '../../styles/SmithMath.module.css';
import { openDerivation } from './Derivation';
import { mathHtml } from './MathPanel';
import { mathLink } from './mathLink';
import { markWide, watchWide } from './wide';
import { rowOf, specsFor, v } from './mathRows';
import { complexText } from './readout';
import { followTopic } from './Why';

/** A change of a part's value the card explains: the part, the value before and a counter that tells moves apart. */
export interface Move { i: number; old: number; seq: number }

export interface ExplainProps {
  circuit: Circuit;
  i: number;
  digits: number;
  bib: Bibliography | null;
  /** The last change of this part's value, or null. */
  move: Move | null;
  /** The whole arc and its equations shown (the card's "Explain this move"). */
  full: boolean;
}

const WIDE = `.${mcss.grid}`;
const UNIT = ['Ω', 'H', 'F', 'Ω', 'H', 'F', 'λ', 'λ', 'λ', 'Ω'];
const TOPIC_NAME: Record<string, string> = { 'moving-on-the-chart': 'Moving on the chart', 'transmission-lines': 'Transmission lines' };

const senseWord = (s: Sense): string => (s === CW ? 'clockwise' : s === CCW ? 'counter-clockwise' : 'along the real axis');

function reducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export default function Explain({ circuit: c, i, digits, bib, move, full }: ExplainProps) {
  const d = digits;
  const n = c.parts.length;
  const ex = useMemo(() => (i >= 0 && i < n ? explainPart(c, i) : null), [c, i, n]);
  const mv = useMemo<MoveExplanation | null>(
    () => (move && move.i === i && i < n && move.old !== c.parts[i].value ? explainMove(c, i, move.old) : null), [c, i, n, move]);
  // The trace of a new move on the chart, once, after the render that shows it (never with reduced motion: trace says no).
  const traced = useRef(-1);
  useEffect(() => {
    if (!mv || !move || traced.current === move.seq) return;
    traced.current = move.seq;
    mathLink.path?.trace(movePath(c, i, mv.oldValue, mv.newValue));
  }, [mv, move, c, i]);
  useEffect(() => () => { mathLink.path?.trace(null); }, []);
  if (!ex) return null;

  const cite = (key: string): React.ReactNode => (bib ? <> {bib.cite(key)}</> : null);
  // Computed numbers by D20: a residual under the floor (|Γ| of an exact match) as its bound, never as 1e−17.
  const num = (x: number, what: string): React.ReactNode => (
    <span className={css.num} data-ex={what} data-raw={String(x)}>{Math.abs(x) === Infinity ? formatAmount(x, '', d) : formatResidual(x, '', d, false)}</span>
  );
  const val = (x: number, what: string): React.ReactNode => (
    <span className={css.num} data-ex={what} data-raw={String(x)}>{UNIT[ex.kind] === 'λ' ? `${formatAmount(x, '', d)} λ` : formatAmount(x, UNIT[ex.kind], d)}</span>
  );
  const z = (p: Point, what: string): React.ReactNode => (
    <span className={css.num} data-ex={what} data-raw={`${p.zr},${p.zi}`}>{complexText(p.zr, p.zi, '', d)}</span>
  );
  const name = KIND_NAMES[ex.kind].toLowerCase();
  const valueName = VALUE_NAMES[ex.kind];
  const nodeOf = (k: number): string => (k === 0 ? 'the load' : k === n ? 'the input' : `node ${k}`);
  const circleName = (e: Explanation): React.ReactNode => {
    const ci = e.circle;
    if (!ci) return 'no circle';
    if (ci.kind === 'rotation') return <>a circle about the centre, radius |Γ| = {num(ci.radius, 'radius')}</>;
    if (ci.kind === 'line') return <>its line’s circle, centre ({num(ci.cx, 'cx')}, 0), radius {num(ci.radius, 'radius')}</>;
    if (ci.radius === Infinity) return <>the real axis ({ci.kind} = 0)</>;
    return <>the {ci.kind} = {num(ci.value, 'kept')} {ci.kind === 'r' || ci.kind === 'g' ? 'circle' : 'arc'}</>;
  };

  // ---- The move: what the change did.
  let moveBlock: React.ReactNode = null;
  if (mv) {
    const a = mv.after, b = mv.before, k = ex.kind;
    const lc = k === SERIES_L || k === SERIES_C || k === SHUNT_L || k === SHUNT_C;
    const stub = k === STUB_OPEN || k === STUB_SHORT;
    const coord = a.changes;
    const rose = mv.dMag > 0 ? 'rose' : mv.dMag < 0 ? 'fell' : 'stayed';
    let why: React.ReactNode = null;
    if (lc) why = <>Making an L or a C larger always turns its point clockwise, in series or in shunt; making it smaller, counter-clockwise.</>;
    else if (k === LINE) why = <>A line turns the point about the centre of its own chart, clockwise as it gets longer: the direction the rim’s scale calls “towards the generator”{cite('SteerVol3')}.</>;
    else if (stub) why = <>A stub adds susceptance and moves along its g circle; its b grows with its length, and a growing b turns the point clockwise round its g circle.</>;
    else if (k === SERIES_R) why = <>A series resistor adds only r: the point slides along its constant-x arc, towards the open circuit at Γ = +1 as R grows{cite('WikiSmith')}.</>;
    else if (k === SHUNT_R) why = <>A shunt resistor adds only g: the point slides along its constant-b arc, towards the short at Γ = −1 as R falls{cite('WikiSmith')}.</>;
    const how = mv.sense === 0 ? 'moved along the real axis' : `turned ${senseWord(mv.sense)}`;
    moveBlock = (
      <div className={css.move} data-explain-move="" data-sense={senseWord(mv.sense)}>
        <p className={css.lead}>
          <strong>{valueName} from {val(mv.oldValue, 'old')} to {val(mv.newValue, 'new')}</strong>
          {coord && <>: {coord} from {num(b.to, 'old-coord')} to {num(a.to, 'new-coord')} (Δ{coord} = {mv.delta >= 0 ? '+' : '−'}{num(Math.abs(mv.delta), 'delta')})</>}
          {(k === LINE || stub) && <> (Δℓ = {mv.delta >= 0 ? '+' : '−'}{num(Math.abs(mv.delta), 'delta')} λ{k === LINE ? <>, {num(Math.abs(mv.turns), 'turns')} turns of its chart</> : null})</>}
          {k === QUARTER && <> (Δ(Zt/Z0) = {mv.delta >= 0 ? '+' : '−'}{num(Math.abs(mv.delta), 'delta')})</>}
          .
        </p>
        <p>
          The point at {nodeOf(i + 1)} {how}
          {k === SERIES_R || k === SHUNT_R ? <>, {mv.approach > 0 ? 'towards' : 'away from'} the {k === SERIES_R ? 'open at Γ = +1' : 'short at Γ = −1'}</> : null}
          {a.circle && k !== QUARTER ? <> on {circleName(a)}</> : null}, from z = {z(b.end, 'old-z')} to z = {z(a.end, 'new-z')}; |Γ| {rose} from {num(b.end.mag, 'old-mag')} to {num(a.end.mag, 'new-mag')}.
        </p>
        {why && <p className={css.why}>{why}</p>}
      </div>
    );
  }

  // ---- The arc from no effect: the rule, the circle, the sense, the equations.
  let arc: React.ReactNode = null;
  if (full) {
    const e = ex, k = e.kind;
    const rule: React.ReactNode[] = [];
    const series = k <= SERIES_C, shunt = k === SHUNT_R || k === SHUNT_L || k === SHUNT_C || k === STUB_OPEN || k === STUB_SHORT;
    if (series) rule.push(<>A part in series adds its own impedance: z<sub>in</sub> = z<sub>L</sub> + z<sub>s</sub>{cite('SteerVol3')}.</>);
    if (shunt) rule.push(<>A part in shunt adds its admittance: y<sub>in</sub> = y<sub>L</sub> + y<sub>p</sub>{cite('SteerVol3')}.</>);
    if (k === SERIES_L) rule.push(<>An inductor adds x = ωL/Z0 = {num(e.added, 'added')}, which is positive{cite('WikiSmith')}, so r does not change (r = {num(e.kept, 'kept')}) and the point slides along its constant-r circle.</>);
    if (k === SERIES_C) rule.push(<>A capacitor adds x = −1/(ωCZ0) = {num(e.added, 'added')}, which is negative{cite('WikiSmith')}, so r does not change (r = {num(e.kept, 'kept')}) and the point slides along its constant-r circle.</>);
    if (k === SERIES_R) rule.push(<>A series resistor adds only r = R/Z0 = {num(e.added, 'added')}: the point slides along its constant-x arc (x = {num(e.kept, 'kept')}), towards the open circuit at Γ = +1 as R grows{cite('WikiSmith')}.</>);
    if (k === SHUNT_C) rule.push(<>A capacitor adds b = ωCZ0 = {num(e.added, 'added')}, positive{cite('WikiSmith')}; g does not change (g = {num(e.kept, 'kept')}), so the point slides along its constant-g circle.</>);
    if (k === SHUNT_L) rule.push(<>An inductor adds b = −Z0/(ωL) = {num(e.added, 'added')}, negative{cite('WikiSmith')}; g does not change (g = {num(e.kept, 'kept')}), so the point slides along its constant-g circle.</>);
    if (k === SHUNT_R) rule.push(<>A shunt resistor adds only g = Z0/R = {num(e.added, 'added')}: the point slides along its constant-b arc (b = {num(e.kept, 'kept')}), towards the short at Γ = −1 as R falls{cite('WikiSmith')}.</>);
    if (k === STUB_OPEN || k === STUB_SHORT) rule.push(<>Open and shorted stubs are shunt parts too: this one adds b = {num(e.added, 'added')} and moves along its g circle (g = {num(e.kept, 'kept')}).</>);
    if (k === LINE) rule.push(<>A line turns the point about the centre of its own chart, clockwise as it gets longer{cite('SteerVol3')}; this one is {num(e.value, 'length')} λ long, {num(e.turns, 'turns')} turns of its own chart.</>);
    if (k === QUARTER) rule.push(<>A λ/4 transformer is a line of Zt a quarter wavelength long: it turns the point clockwise by half a turn of the chart of Zt{cite('SteerVol3')}.</>);
    let way: React.ReactNode = null;
    if (k === SERIES_L) way = <>Every r circle runs from Γ = +1 round to the point on the real axis where x = 0. As x grows from 0, the point leaves the real axis upwards, so adding inductance in series turns the point <b>clockwise</b> round its r circle{cite('SteerVol3')}.</>;
    if (k === SERIES_C) way = <>Every r circle runs from Γ = +1 round to the point on the real axis where x = 0. As x grows from 0 the point leaves it upwards, so adding capacitance in series, a negative x, turns it <b>counter-clockwise</b>{cite('SteerVol3')}.</>;
    if (k === SHUNT_C || k === SHUNT_L || k === STUB_OPEN || k === STUB_SHORT) {
      way = <>Every g circle runs from Γ = −1 round to the point on the real axis where b = 0; as b grows from 0 the point leaves it downwards, so a positive b (a shunt capacitor) turns the point clockwise round its g circle and a negative b (a shunt inductor) counter-clockwise{cite('SteerVol3')}. Here: <b>{senseWord(e.sense)}</b>.</>;
    }
    if (k === SERIES_R || k === SHUNT_R) way = e.sense === 0 ? <>On the real axis the arc is straight.</> : <>On this arc, whose centre is at ({num(e.circle?.cx ?? NaN, 'cx')}, {num(e.circle?.cy ?? NaN, 'cy')}), that way is <b>{senseWord(e.sense)}</b>.</>;
    if (k === LINE && e.circle?.kind === 'line') way = <>A line whose impedance is not Z0 still draws a circle, centred on the real axis but not at the centre{cite('SteerVol3')}.</>;
    let circle: React.ReactNode = null;
    if (e.circle && e.circle.radius < Infinity) {
      circle = (k === SERIES_L || k === SERIES_C)
        ? <>Why a circle: z moves along the straight line r = {num(e.kept, 'kept')}; Γ = (z − 1)/(z + 1) takes every straight line to a circle{cite('WikiMobius')}, here centre ({num(e.circle.cx, 'cx')}, {num(e.circle.cy, 'cy')}), radius {num(e.circle.radius, 'radius')}.</>
        : <>Why a circle: with its value fixed every ideal part maps the point by Γ′ = (aΓ + b)/(cΓ + d), a Möbius transformation, so turning its value moves the point round a circle{cite('WikiMobius')}: here centre ({num(e.circle.cx, 'cx')}, {num(e.circle.cy, 'cy')}), radius {num(e.circle.radius, 'radius')}.</>;
    }
    const noneText = k === QUARTER ? <>a line of Zt of length 0</> : <>{valueName} = {val(e.none, 'none')}</>;
    arc = (
      <div className={css.arc} data-explain-arc="" data-sense={senseWord(e.sense)}>
        <h4 className={css.head}>Part {i + 1}’s arc on the chart</h4>
        {e.still ? (
          <p>Here the part does not move the point: it starts at {nodeOf(i)}, z = {z(e.start, 'start-z')}, which it cannot change.</p>
        ) : (
          <>
            {rule.map((r, j) => <p key={j}>{r}</p>)}
            {way && <p>{way}</p>}
            {circle && <p>{circle}</p>}
            <p>
              The arc starts where the part does nothing ({noneText}), at {nodeOf(i)}: z = {z(e.start, 'start-z')}, |Γ| = {num(e.start.mag, 'start-mag')}; it
              ends at {valueName} = {val(e.value, 'value')}, at {nodeOf(i + 1)}: z = {z(e.end, 'end-z')}, |Γ| = {num(e.end.mag, 'end-mag')}
              {e.changes ? <> ({e.changes} from {num(e.from, 'from')} to {num(e.to, 'to')})</> : null}. Its length is how much the part does.
            </p>
          </>
        )}
        <Equations c={c} e={e} digits={d} />
        <p className={css.links}>
          <button type="button" className={css.link} data-explain-derive={e.derivation}
            onClick={(ev) => openDerivation(e.derivation, ev.currentTarget, { t: 'part', i })}>Derive: {EQUATION_BY_ID.get(e.derivation)?.title}</button>
          <a href={`#${e.topic}`} className={css.link} data-explain-topic={e.topic}
            onClick={(ev) => followTopic(e.topic, ev.currentTarget)}>→ theory: {TOPIC_NAME[e.topic]}</a>
          {!reducedMotion() && !e.still && (
            <button type="button" className={css.link} data-explain-trace=""
              onClick={() => mathLink.path?.trace(movePath(c, i, e.none, e.value))}>Trace on the chart</button>
          )}
        </p>
      </div>
    );
  }

  if (!moveBlock && !arc) return null;
  return (
    <section className={css.explain} data-explain={i} aria-label={`Explanation of ${name} ${i + 1}`} aria-live="polite">
      {moveBlock}
      {arc}
    </section>
  );
}

/** The equations that apply, with the numbers put in: the panel's rows of the part and its circle's. */
function Equations({ c, e, digits }: { c: Circuit; e: Explanation; digits: number }) {
  const html = useMemo(() => {
    const out: { id: string; title: string; lhs: string; rhs: string; lines: string[]; put?: { lhs: string; rhs: string }; note?: string }[] = [];
    const rows = specsFor(c, { t: 'part', i: e.i });
    const byId = new Map(rows.map((s) => [s.id, s]));
    const z0 = c.z0;
    for (const id of e.equations) {
      const eq = EQUATION_BY_ID.get(id);
      if (!eq) continue;
      let spec = byId.get(id);
      if (!spec && e.circle) {
        if (id === 'line-circle-b') spec = { id, vars: { B: v(e.lineB, 0, '', z0), Z_c: v((e.kind === QUARTER ? e.value : c.parts[e.i].zc ?? z0), 0, 'Ω', z0), Z_0: v(z0, 0, 'Ω', z0) }, colours: {} };
        if (id === 'line-circle-centre') spec = { id, vars: { c: v(e.circle.cx, 0, '', z0), B: v(e.lineB, 0, '', z0), Gamma_c: v(e.gcr, e.gci, '', z0) }, colours: {} };
        if (id === 'line-circle-radius') spec = { id, vars: { rho: v(e.circle.radius, 0, '', z0), B: v(e.lineB, 0, '', z0), Gamma_c: v(e.gcr, e.gci, '', z0) }, colours: {} };
      }
      if (spec) {
        const r = rowOf(spec, digits);
        out.push({ id, title: r.title, lhs: mathHtml(r.lhs), rhs: mathHtml(`{}= ${r.rhs}`), lines: [...r.lines.map((l) => `{}= ${l}`), r.bound ? r.result : `{}= ${r.result}`].map((t) => mathHtml(t)) });
        continue;
      }
      // A circle's equation (no single left side): the symbolic form, then with the kept value put in, and its centre
      // and radius.
      const ci = e.circle;
      if (!ci || ci.radius === Infinity) continue;
      const kept: TexPiece = valueTex(ci.value, 0, '', digits);
      const sides = eq.tree.t === 'eq' ? eq.tree.xs : [eq.tree];
      const put = (x: typeof sides[number]): string => tex(x, { value: (nm) => (nm === ci.kind ? kept : undefined) });
      const f = (x: number): string => formatAmount(x, '', digits);
      out.push({
        id, title: eq.title, lhs: mathHtml(tex(sides[0])), rhs: mathHtml(`{}= ${sides.slice(1).map((x) => tex(x)).join(' = ')}`), lines: [],
        put: { lhs: mathHtml(put(sides[0])), rhs: mathHtml(`{}= ${sides.slice(1).map(put).join(' = ')}`) },
        note: `A circle with centre (${f(ci.cx)}, ${f(ci.cy)}) and radius ${f(ci.radius)}.`,
      });
    }
    return out;
  }, [c, e, digits]);
  // An equation wider than the card scrolls inside its own box, which then takes a Tab stop (wide.ts).
  const list = useRef<HTMLOListElement>(null);
  useEffect(() => { if (list.current) markWide(list.current, WIDE); }, [html]);
  useEffect(() => (list.current ? watchWide(list.current, WIDE) : undefined), []);
  return (
    <ol className={css.eqs} aria-label="The equations that apply" ref={list}>
      {html.map((r) => (
        <li key={r.id} className={css.eq} data-explain-eq={r.id}>
          <span className={css.eqTitle}>{r.title}</span>
          <div className={mcss.grid}>
            <span className={mcss.lhs} dangerouslySetInnerHTML={{ __html: r.lhs }} />
            <span dangerouslySetInnerHTML={{ __html: r.rhs }} />
            {r.lines.map((l, j) => <span key={j} className={`${mcss.line} ${j === r.lines.length - 1 ? mcss.result : ''}`} dangerouslySetInnerHTML={{ __html: l }} />)}
            {r.put && <span className={mcss.lhs} dangerouslySetInnerHTML={{ __html: r.put.lhs }} />}
            {r.put && <span className={mcss.result} dangerouslySetInnerHTML={{ __html: r.put.rhs }} />}
          </div>
          {r.note && <span className={css.note} data-explain-circle="">{r.note}</span>}
        </li>
      ))}
    </ol>
  );
}

