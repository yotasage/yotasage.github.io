// The pieces the EM simulation page's Theory topics are written with (step M2.4c, in the Theory chunk): the live
// numbers (`Live`, from theoryFeed.ts through lib/emsim/eqvalues.ts), an equation of lib/emsim/equations.ts printed
// with KaTeX and, where the current structure gives every symbol a number, its substitution lines (`Eq`), citations
// numbered by the page's one Bibliography (`citeWith`), and the topic and sub-anchor frames.

import React from 'react';

import type Bibliography from '../Bibliography';
import KatexSpan from '../KatexSpan';
import { EM_EQUATION_BY_ID, bindingFor, emSubstitutions, emTex, valuesTex } from '../../lib/emsim/equations';
import type { Setup } from '../../lib/emsim/setup';
import type { TraceKind } from '../../lib/emsim/structure';
import type { LengthUnit } from '../../lib/emsim/units';
import type { LineResults } from '../../lib/emsim/lines';
import type { CornersResult, McResult } from '../../lib/emsim/vary';
import bibCss from '../../styles/Bibliography.module.css';
import css from '../../styles/EmSimTheory.module.css';
import type { FedCalc } from './theoryFeed';

/** What the topics print their numbers from; `b` is eqvalues.emBinding of the shown structure (SI units). */
export interface Live {
  b: Readonly<Record<string, number>>;
  /** Signal lines of the shown result (0 before the first solve). */
  n: number;
  kind: TraceKind | null;
  setup: Setup | null;
  r: LineResults | null;
  calc: FedCalc | null;
  corners: CornersResult | null;
  mc: McResult | null;
  unit: LengthUnit;
  digits: number;
}

export type Cite = (key: string, at?: string) => React.ReactNode;

/** "[n, §x]" linked to the entry of the References section; numbered by first citation as the page renders. */
export function citeWith(bib: Bibliography): Cite {
  return (key, at) => (
    <>
      {' '}
      <a className={bibCss.cite} href={`#ref-${key}`} data-cite={key}>[{bib.number(key)}{at ? <>,{' '}{at}</> : null}]</a>
    </>
  );
}

const lhsOf = (t: { t: string; xs?: { t: string; v?: unknown }[] }): string | null =>
  t.t === 'eq' && t.xs?.[0]?.t === 'id' ? String(t.xs[0].v) : null;

/**
 * An equation of the registry. With every symbol bound for the shown structure (and the entry meant for it: one line,
 * a pair or any), each relation is printed as symbol = expression = the numbers put in = the result; the result's
 * symbol carries `data-sym` and `data-v` (SI) for the harness. Otherwise it is printed without numbers and `need`
 * (or a default) says what gives them.
 */
export function Eq({ id, live, cite, need }: { id: string; live: Live; cite: Cite; need?: string }) {
  const eq = EM_EQUATION_BY_ID.get(id);
  if (!eq) throw new Error(`Unknown equation "${id}" in the EM theory.`);
  const fits = eq.applies === 'any' || (eq.applies === 'line' ? live.n === 1 : live.n === 2);
  const bound = fits && live.n > 0 ? bindingFor(eq, live.b) : null;
  const trees = [eq.tree, ...eq.where.map((w) => w.tree)];
  let body: React.ReactNode;
  if (bound) {
    const vals = valuesTex(eq, live.b, Math.max(4, live.digits));
    body = (
      <div className={css.eqRows}>
        {trees.map((t, i) => {
          const sub = emSubstitutions(t, vals);
          const sym = lhsOf(t as never);
          if (!sub) return <KatexSpan key={i} className={css.eqWide} text={`\\displaystyle ${emTex(t)}`} />;
          return (
            <React.Fragment key={i}>
              <KatexSpan className={css.eqLhs} text={`\\displaystyle ${sub.lhs}`} data-sym={sym ?? undefined} data-v={sym ? live.b[sym] : undefined} />
              <span className={css.eqRhs}>
                <KatexSpan text={`\\displaystyle {}= ${sub.rhs}`} />
                {sub.lines.map((s, j) => <KatexSpan key={j} className={css.eqLive} text={`\\displaystyle {}= ${s}`} />)}
              </span>
            </React.Fragment>
          );
        })}
      </div>
    );
  } else {
    body = <div className={css.eqRowsPlain}>{trees.map((t, i) => <KatexSpan key={i} text={`\\displaystyle ${emTex(t)}`} />)}</div>;
  }
  let note = '';
  if (!bound && eq.live) {
    if (!fits && eq.applies === 'pair') note = 'With numbers when the Trace section shows a pair.';
    else if (!fits && eq.applies === 'line') note = 'With numbers when the Trace section shows a single trace.';
    else note = live.n ? need ?? 'Not filled in for this structure.' : 'With numbers once the Trace section has solved.';
  }
  return (
    <div className={css.eq} data-eq={id} data-live={bound ? 'true' : 'false'}>
      <div className={css.eqScroll}>
        {body}
        {eq.extra && <KatexSpan className={css.eqExtra} text={`\\displaystyle ${eq.extra}`} />}
      </div>
      <div className={css.eqTitle}>
        {eq.title}
        {eq.sources.map((s) => <React.Fragment key={s.key}>{cite(s.key, s.at || undefined)}</React.Fragment>)}
        {note && <span className={css.eqNeed}> · {note}</span>}
      </div>
    </div>
  );
}

/** A topic: its anchor, number and heading. */
export function Topic({ id, no, title, children }: { id: string; no: number; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className={css.topic} data-topic={id} aria-labelledby={`${id}-h`}>
      <h3 id={`${id}-h`} className={css.topicHead}><span className={css.topicNo}>{no}</span>{title}</h3>
      {children}
    </section>
  );
}

/** A sub-anchor inside a topic (the places other parts of the page link to). */
export function Sub({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <div id={id} className={css.sub} data-topic={id}>
      <h4 className={css.subHead}>{title}</h4>
      {children}
    </div>
  );
}

/** A live number in the text, with its key for the harness. */
export const N = ({ k, v, children }: { k: string; v?: number; children: React.ReactNode }) => (
  <span className={css.n} data-live-text={k} data-v={v}>{children}</span>
);

export const fmt = (x: number, d = 4): string => (Number.isFinite(x) ? String(Number(x.toPrecision(d))) : '–');
