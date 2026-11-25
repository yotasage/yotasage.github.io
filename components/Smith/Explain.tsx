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
import { useI18n } from '../../lib/ui/i18n';
import css from '../../styles/SmithExplain.module.css';
import mcss from '../../styles/SmithMath.module.css';
import { openDerivation } from './Derivation';
import { mathHtml } from './MathPanel';
import { mathLink } from './mathLink';
import { markWide, watchWide } from '../Equations/wide';
import { rowOf, specsFor, v } from './mathRows';
import { complexText } from './readout';
import { eqTitle, kindName, valueName as partValueName } from './smithText';
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

function reducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export default function Explain({ circuit: c, i, digits, bib, move, full }: ExplainProps) {
  const { t, locale } = useI18n();
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

  const senseWord = (s: Sense): string => t(s === CW ? 'sm.exp.cw' : s === CCW ? 'sm.exp.ccw' : 'sm.exp.realAxis');
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
  const name = kindName(ex.kind, locale).toLowerCase();
  const valueName = partValueName(ex.kind, locale);
  const nodeOf = (k: number): string => (k === 0 ? t('sm.solve.theLoad') : k === n ? t('sm.solve.theInput') : t('sm.solve.nodeN', { k }));
  const topicName = (id: string): string => (id === 'transmission-lines' ? t('sm.exp.topicLines') : t('sm.exp.topicMoving'));
  const circleName = (e: Explanation): React.ReactNode => {
    const ci = e.circle;
    if (!ci) return t('sm.exp.noCircle');
    if (ci.kind === 'rotation') return <>{t('sm.exp.rotCircle')} {num(ci.radius, 'radius')}</>;
    if (ci.kind === 'line') return <>{t('sm.exp.lineCircle')} ({num(ci.cx, 'cx')}, 0), {t('sm.exp.radiusWord')} {num(ci.radius, 'radius')}</>;
    if (ci.radius === Infinity) return t('sm.exp.realAxisEq', { kind: ci.kind });
    return <>{t('sm.exp.theKindCircle', { kind: ci.kind })} {num(ci.value, 'kept')} {t(ci.kind === 'r' || ci.kind === 'g' ? 'sm.exp.circleWord' : 'sm.exp.arcWord')}</>;
  };

  // ---- The move: what the change did.
  let moveBlock: React.ReactNode = null;
  if (mv) {
    const a = mv.after, b = mv.before, k = ex.kind;
    const lc = k === SERIES_L || k === SERIES_C || k === SHUNT_L || k === SHUNT_C;
    const stub = k === STUB_OPEN || k === STUB_SHORT;
    const coord = a.changes;
    const rose = t(mv.dMag > 0 ? 'sm.exp.rose' : mv.dMag < 0 ? 'sm.exp.fell' : 'sm.exp.stayed');
    let why: React.ReactNode = null;
    if (lc) why = t('sm.exp.whyLC');
    else if (k === LINE) why = <>{t('sm.exp.whyLine')}{cite('SteerVol3')}.</>;
    else if (stub) why = t('sm.exp.whyStub');
    else if (k === SERIES_R) why = <>{t('sm.exp.whySeriesR')}{cite('WikiSmith')}.</>;
    else if (k === SHUNT_R) why = <>{t('sm.exp.whyShuntR')}{cite('WikiSmith')}.</>;
    const how = mv.sense === 0 ? t('sm.exp.movedRealAxis') : t('sm.exp.turnedSense', { sense: senseWord(mv.sense) });
    moveBlock = (
      <div className={css.move} data-explain-move="" data-sense={senseWord(mv.sense)}>
        <p className={css.lead}>
          <strong>{valueName} {t('sm.exp.fromWord')} {val(mv.oldValue, 'old')} {t('sm.exp.toWord')} {val(mv.newValue, 'new')}</strong>
          {coord && <>: {coord} {t('sm.exp.fromWord')} {num(b.to, 'old-coord')} {t('sm.exp.toWord')} {num(a.to, 'new-coord')} (Δ{coord} = {mv.delta >= 0 ? '+' : '−'}{num(Math.abs(mv.delta), 'delta')})</>}
          {(k === LINE || stub) && <> (Δℓ = {mv.delta >= 0 ? '+' : '−'}{num(Math.abs(mv.delta), 'delta')} λ{k === LINE ? <>, {num(Math.abs(mv.turns), 'turns')} {t('sm.exp.turnsOfChart')}</> : null})</>}
          {k === QUARTER && <> (Δ(Zt/Z0) = {mv.delta >= 0 ? '+' : '−'}{num(Math.abs(mv.delta), 'delta')})</>}
          .
        </p>
        <p>
          {t('sm.exp.pointAtHow', { node: nodeOf(i + 1), how })}
          {k === SERIES_R || k === SHUNT_R ? <>, {t(mv.approach > 0 ? 'sm.exp.towards' : 'sm.exp.awayFrom')} {t(k === SERIES_R ? 'sm.exp.theOpen' : 'sm.exp.theShort')}</> : null}
          {a.circle && k !== QUARTER ? <> {t('sm.exp.onWord')} {circleName(a)}</> : null}, {t('sm.exp.fromZ')} {z(b.end, 'old-z')} {t('sm.exp.toZ')} {z(a.end, 'new-z')}{t('sm.exp.magChange', { dir: rose })} {num(b.end.mag, 'old-mag')} {t('sm.exp.toWord')} {num(a.end.mag, 'new-mag')}.
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
    if (series) rule.push(<>{t('sm.exp.ruleSeries')} z<sub>in</sub> = z<sub>L</sub> + z<sub>s</sub>{cite('SteerVol3')}.</>);
    if (shunt) rule.push(<>{t('sm.exp.ruleShunt')} y<sub>in</sub> = y<sub>L</sub> + y<sub>p</sub>{cite('SteerVol3')}.</>);
    if (k === SERIES_L) rule.push(<>{t('sm.exp.ruleSeriesL1')} {num(e.added, 'added')}{t('sm.exp.ruleSeriesL2')}{cite('WikiSmith')}{t('sm.exp.ruleSeriesL3')} {num(e.kept, 'kept')}{t('sm.exp.ruleSeriesL4')}</>);
    if (k === SERIES_C) rule.push(<>{t('sm.exp.ruleSeriesC1')} {num(e.added, 'added')}{t('sm.exp.ruleSeriesC2')}{cite('WikiSmith')}{t('sm.exp.ruleSeriesL3')} {num(e.kept, 'kept')}{t('sm.exp.ruleSeriesL4')}</>);
    if (k === SERIES_R) rule.push(<>{t('sm.exp.ruleSeriesR1')} {num(e.added, 'added')}{t('sm.exp.ruleSeriesR2')} {num(e.kept, 'kept')}{t('sm.exp.ruleSeriesR3')}{cite('WikiSmith')}.</>);
    if (k === SHUNT_C) rule.push(<>{t('sm.exp.ruleShuntC1')} {num(e.added, 'added')}{t('sm.exp.ruleShuntC2')}{cite('WikiSmith')}{t('sm.exp.ruleShuntC3')} {num(e.kept, 'kept')}{t('sm.exp.ruleShuntC4')}</>);
    if (k === SHUNT_L) rule.push(<>{t('sm.exp.ruleShuntL1')} {num(e.added, 'added')}{t('sm.exp.ruleShuntL2')}{cite('WikiSmith')}{t('sm.exp.ruleShuntC3')} {num(e.kept, 'kept')}{t('sm.exp.ruleShuntC4')}</>);
    if (k === SHUNT_R) rule.push(<>{t('sm.exp.ruleShuntR1')} {num(e.added, 'added')}{t('sm.exp.ruleShuntR2')} {num(e.kept, 'kept')}{t('sm.exp.ruleShuntR3')}{cite('WikiSmith')}.</>);
    if (k === STUB_OPEN || k === STUB_SHORT) rule.push(<>{t('sm.exp.ruleStub1')} {num(e.added, 'added')} {t('sm.exp.ruleStub2')} {num(e.kept, 'kept')}).</>);
    if (k === LINE) rule.push(<>{t('sm.exp.ruleLine1')}{cite('SteerVol3')}{t('sm.exp.ruleLine2')} {num(e.value, 'length')} {t('sm.exp.ruleLine3')} {num(e.turns, 'turns')} {t('sm.exp.ruleLine4')}</>);
    if (k === QUARTER) rule.push(<>{t('sm.exp.ruleQuarter')}{cite('SteerVol3')}.</>);
    let way: React.ReactNode = null;
    if (k === SERIES_L) way = <>{t('sm.exp.waySeriesL1')} <b>{t('sm.exp.cw')}</b> {t('sm.exp.waySeriesL2')}{cite('SteerVol3')}.</>;
    if (k === SERIES_C) way = <>{t('sm.exp.waySeriesC1')} <b>{t('sm.exp.ccw')}</b>{cite('SteerVol3')}.</>;
    if (k === SHUNT_C || k === SHUNT_L || k === STUB_OPEN || k === STUB_SHORT) {
      way = <>{t('sm.exp.wayShunt1')}{cite('SteerVol3')}{t('sm.exp.wayShunt2')} <b>{senseWord(e.sense)}</b>.</>;
    }
    if (k === SERIES_R || k === SHUNT_R) way = e.sense === 0 ? <>{t('sm.exp.wayStraight')}</> : <>{t('sm.exp.wayArcCentre1')}{num(e.circle?.cx ?? NaN, 'cx')}, {num(e.circle?.cy ?? NaN, 'cy')}{t('sm.exp.wayArcCentre2')} <b>{senseWord(e.sense)}</b>.</>;
    if (k === LINE && e.circle?.kind === 'line') way = <>{t('sm.exp.wayLineOff')}{cite('SteerVol3')}.</>;
    let circle: React.ReactNode = null;
    if (e.circle && e.circle.radius < Infinity) {
      circle = (k === SERIES_L || k === SERIES_C)
        ? <>{t('sm.exp.circleWhyLC1')} {num(e.kept, 'kept')}{t('sm.exp.circleWhyLC2')}{cite('WikiMobius')}{t('sm.exp.hereCentre')}{num(e.circle.cx, 'cx')}, {num(e.circle.cy, 'cy')}), {t('sm.exp.radiusWord')} {num(e.circle.radius, 'radius')}.</>
        : <>{t('sm.exp.circleWhyMobius')}{cite('WikiMobius')}{t('sm.exp.hereCentreColon')}{num(e.circle.cx, 'cx')}, {num(e.circle.cy, 'cy')}), {t('sm.exp.radiusWord')} {num(e.circle.radius, 'radius')}.</>;
    }
    const noneText = k === QUARTER ? <>{t('sm.exp.noneQuarter')}</> : <>{valueName} = {val(e.none, 'none')}</>;
    const derEq = EQUATION_BY_ID.get(e.derivation);
    arc = (
      <div className={css.arc} data-explain-arc="" data-sense={senseWord(e.sense)}>
        <h4 className={css.head}>{t('sm.exp.arcHead', { n: i + 1 })}</h4>
        {e.still ? (
          <p>{t('sm.exp.still1', { node: nodeOf(i) })} {z(e.start, 'start-z')}{t('sm.exp.still2')}</p>
        ) : (
          <>
            {rule.map((r, j) => <p key={j}>{r}</p>)}
            {way && <p>{way}</p>}
            {circle && <p>{circle}</p>}
            <p>
              {t('sm.exp.arcStarts')}{noneText}{t('sm.exp.arcAtNode', { node: nodeOf(i) })} {z(e.start, 'start-z')}, |Γ| = {num(e.start.mag, 'start-mag')}{t('sm.exp.arcEnds', { val: valueName })} {val(e.value, 'value')}{t('sm.exp.arcEndsAt', { node: nodeOf(i + 1) })} {z(e.end, 'end-z')}, |Γ| = {num(e.end.mag, 'end-mag')}
              {e.changes ? <> ({e.changes} {t('sm.exp.fromWord')} {num(e.from, 'from')} {t('sm.exp.toWord')} {num(e.to, 'to')})</> : null}{t('sm.exp.arcLength')}
            </p>
          </>
        )}
        <Equations c={c} e={e} digits={d} />
        <p className={css.links}>
          <button type="button" className={css.link} data-explain-derive={e.derivation}
            onClick={(ev) => openDerivation(e.derivation, ev.currentTarget, { t: 'part', i })}>{t('sm.exp.deriveBtn', { title: derEq ? eqTitle(e.derivation, derEq.title, locale) : '' })}</button>
          <a href={`#${e.topic}`} className={css.link} data-explain-topic={e.topic}
            onClick={(ev) => followTopic(e.topic, ev.currentTarget)}>{t('sm.exp.theoryLink', { topic: topicName(e.topic) })}</a>
          {!reducedMotion() && !e.still && (
            <button type="button" className={css.link} data-explain-trace=""
              onClick={() => mathLink.path?.trace(movePath(c, i, e.none, e.value))}>{t('sm.exp.traceBtn')}</button>
          )}
        </p>
      </div>
    );
  }

  if (!moveBlock && !arc) return null;
  return (
    <section className={css.explain} data-explain={i} aria-label={t('sm.exp.sectionAria', { name, n: i + 1 })} aria-live="polite">
      {moveBlock}
      {arc}
    </section>
  );
}

/** The equations that apply, with the numbers put in: the panel's rows of the part and its circle's. */
function Equations({ c, e, digits }: { c: Circuit; e: Explanation; digits: number }) {
  const { t, locale } = useI18n();
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
        out.push({ id, title: r.title, lhs: mathHtml(r.lhs), rhs: mathHtml(`{}= ${r.rhs}`), lines: [...r.lines.map((l) => `{}= ${l}`), r.bound ? r.result : `{}= ${r.result}`].map((txt) => mathHtml(txt)) });
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
        id, title: eqTitle(id, eq.title, locale), lhs: mathHtml(tex(sides[0])), rhs: mathHtml(`{}= ${sides.slice(1).map((x) => tex(x)).join(' = ')}`), lines: [],
        put: { lhs: mathHtml(put(sides[0])), rhs: mathHtml(`{}= ${sides.slice(1).map(put).join(' = ')}`) },
        note: t('sm.exp.circleNote', { cx: f(ci.cx), cy: f(ci.cy), r: f(ci.radius) }),
      });
    }
    return out;
  }, [c, e, digits, locale, t]);
  // An equation wider than the card scrolls inside its own box, which then takes a Tab stop (wide.ts).
  const list = useRef<HTMLOListElement>(null);
  useEffect(() => { if (list.current) markWide(list.current, WIDE); }, [html]);
  useEffect(() => (list.current ? watchWide(list.current, WIDE) : undefined), []);
  return (
    <ol className={css.eqs} aria-label={t('sm.exp.eqListAria')} ref={list}>
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

