// The EM simulation page's equation panel (step M4.3a), loaded by import() when a result number is first opened
// (eqLinks.tsx): the registry entry the number comes from (lib/emsim/equations.ts) with each relation as symbols, then
// with the shown result's numbers put in and the result, which is the number in the results (`data-eq-result`: the
// engine's value in `data-v`, the relation evaluated by the shared engine in `data-eval`); its assumptions, sources
// (numbered as the References once the theory has loaded) and theory topic; and "Derivation", which opens the shared
// dialog (components/Equations/DerivationDialog.tsx) with the entry's steps and, where every quantity of a step has a
// number, the step with the numbers. The numbers follow the results: a new solve updates them, and while one runs they
// are dimmed as the results are (`data-eq-stale`). Escape or Close shuts it and the focus goes back to the number.

import React, { useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import DerivationDialog, { reasonHtml, sidesHtml } from '../Equations/DerivationDialog';
import type { DerivationView } from '../Equations/DerivationDialog';
import { mathHtml } from '../Equations/math';
import { markWide, watchWide } from '../Equations/wide';
import { latexToText } from '../../lib/bibtex';
import type { BibEntry } from '../../lib/bibtex';
import type { BemResult } from '../../lib/emsim/bem2d';
import { EM_EQUATION_BY_ID, bindingFor, emSubstitutions, emSymbolOf, emTex, finiteValue, valuesTex } from '../../lib/emsim/equations';
import type { EmEquation } from '../../lib/emsim/equations';
import { emBinding } from '../../lib/emsim/eqvalues';
import { viaBinding } from '../../lib/emsim/eqvaluesVia';
import type { SolveResult } from '../../lib/emsim/jobs';
import type { ViaStructure } from '../../lib/emsim/via';
import type { ViaModelResult } from '../../lib/emsim/viamodel';
import { evaluate } from '../../lib/equations/compile';
import type { Value } from '../../lib/equations/compile';
import { valueTex } from '../../lib/equations/tex';
import type { TexPiece } from '../../lib/equations/tex';
import eqCss from '../../styles/Equations.module.css';
import css from '../../styles/EmSimEq.module.css';
import { EqEnv, closeEq, coreIndex, traceEq, viaEq } from './eqLinks';
import type { EqRequest, EqTarget } from './eqLinks';
import { Why } from './Why';
import { TOPIC_TITLE } from './whys';

type Tree = EmEquation['tree'];
interface Bound { values: Record<string, Value>; target: EqTarget | null }

const GONE: Bound = { values: {}, target: null };
const lhsOf = (t: Tree): string | null => (t.t === 'eq' && t.xs[0].t === 'id' ? String(t.xs[0].v) : null);
const sidesOf = (t: Tree): readonly Tree[] => (t.t === 'eq' ? t.xs : [t]);

/** The numbers of the request's entry from the shown result: the trace's (eqvalues) or the via's (eqvaluesVia). */
function boundOf(req: EqRequest, trace: SolveResult | null, via: { r: ViaModelResult; v: ViaStructure } | null): Bound {
  if (req.section === 'trace') {
    if (!trace || !trace.ok) return GONE;
    const target = traceEq(req.name, trace.n);
    // The worker sends the result without the solver's levels (jobs.ts withMatrices): put back what eqvalues reads.
    const r = trace.matrices ? { ...trace, bem: { ok: true, ...trace.matrices } as unknown as BemResult } : trace;
    return { values: emBinding({ result: r, mode: target?.mode }), target };
  }
  if (!via || !via.r.ok) return GONE;
  const r = via.r;
  let piece: number | undefined, stub: number | undefined;
  const m = /^piece\.(\d+)\./.exec(req.name);
  if (m) piece = Number(m[1]);
  else if (req.name === 'barrel-z') piece = coreIndex(r.pieces);
  if (piece !== undefined && piece >= r.pieces.length) return GONE;
  if (req.name.startsWith('stub.')) {
    stub = r.stubs.findIndex((s) => s.side === req.name.slice(5));
    if (stub < 0) return GONE;
  }
  return { values: viaBinding({ model: r, via: via.v, piece, stub }), target: viaEq(req.name, r.n) };
}

/** "Author year" (with "et al." for more than one author) for a source the References do not list yet. */
function shortRef(e: BibEntry | undefined, key: string): string {
  if (!e) return key;
  const names = latexToText(e.fields.author ?? e.fields.editor ?? e.fields.organization ?? '');
  if (!names) return `${latexToText(e.fields.title ?? key)}${e.fields.year ? `, ${e.fields.year}` : ''}`;
  const all = names.split(/\s+and\s+/), first = all[0].trim();
  const last = first.includes(',') ? first.split(',')[0] : first.split(/\s+/).pop();
  return `${last}${all.length > 1 ? ' et al.' : ''}${e.fields.year ? ` ${e.fields.year}` : ''}`;
}

function Sources({ eq }: { eq: EmEquation }) {
  const { references, bib } = useContext(EqEnv);
  if (!eq.sources.length) return <>The tool’s own rule: {eq.derivation}</>;
  const cited = bib ? bib.citedEntries().map((e) => e.key) : [];
  return (
    <>
      Source:{' '}
      {eq.sources.map((s, i) => {
        const k = cited.indexOf(s.key);
        const at = s.at ? `, ${s.at}` : '';
        return (
          <React.Fragment key={s.key}>
            {i > 0 && ', '}
            {k >= 0
              ? <a href={`#ref-${s.key}`} data-eq-cite={s.key}>[{k + 1}{at}]</a>
              : <a href="#references" data-eq-cite={s.key}>{shortRef(references.find((x) => x.key === s.key), s.key)}{at}</a>}
          </React.Fragment>
        );
      })}
      .
    </>
  );
}

/** The entry's steps as the shared dialog prints them; numbers where every quantity of a step has one. */
function derivationOf(eq: EmEquation, values: Record<string, Value> | null, digits: number): DerivationView {
  const pieces: Record<string, TexPiece> = values ? valuesTex(eq, values, Math.max(4, digits)) : {};
  // The steps' own variables have numbers where the engine binds them too (c₀, a via's τ of the stub, …).
  if (values) {
    for (const k of eq.stepVariables) {
      const x = values[k];
      if (!finiteValue(x)) continue;
      const unit = emSymbolOf(k, eq)?.unit ?? '';
      pieces[k] = typeof x === 'number' ? valueTex(x, 0, unit, Math.max(4, digits)) : valueTex(x[0], x[1], unit, Math.max(4, digits));
    }
  }
  const nums = (t: Tree): string => {
    let miss = false, hit = false;
    const sides = sidesOf(t).map((x) => emTex(x, { value: (n) => { const p = pieces[n]; if (p) hit = true; else miss = true; return p; } }));
    return values && hit && !miss ? sidesHtml(sides) : '';
  };
  return {
    id: eq.id,
    title: eq.title,
    goal: sidesHtml(sidesOf(eq.tree).map((x) => emTex(x))),
    meta: (
      <>
        {eq.assumptions.length > 0 && <>Assumes {eq.assumptions.join(', ')}. </>}
        {eq.derivation}{' '}
        {values ? <>Numbers: the shown result, where every quantity of a step has one.</> : <>Symbols only: the shown result gives this entry no numbers.</>}
      </>
    ),
    steps: eq.steps.map((s) => {
      const why: string[] = [''];
      for (const r of s.reason) {
        if (typeof r === 'string') why[why.length - 1] += r;
        else why.push(emTex(r), '');
      }
      return { sym: sidesHtml(sidesOf(s.tree).map((x) => emTex(x))), why: reasonHtml(why), nums: nums(s.tree) };
    }),
    bind: values ? JSON.stringify(bindingFor(eq, values)) : '',
  };
}

const LINE = '[data-eq-line]';

interface Props {
  req: EqRequest;
  /** The Trace section's shown result. */
  trace?: SolveResult | null;
  /** The Via section's shown model and the via it is for. */
  via?: { r: ViaModelResult; v: ViaStructure } | null;
  stale: boolean;
  digits: number;
}

export default function EqPanel({ req, trace = null, via = null, stale, digits }: Props) {
  const { values, target } = useMemo(() => boundOf(req, trace, via), [req, trace, via]);
  const eq = target ? EM_EQUATION_BY_ID.get(target.id) ?? null : null;
  const bound = eq ? bindingFor(eq, values) : null;

  const rel = useMemo(() => {
    if (!eq || !target) return [];
    const vals = bound ? valuesTex(eq, values, Math.max(4, digits)) : {};
    return [eq.tree, ...eq.where.map((w) => w.tree)].map((t) => {
      const sym = lhsOf(t);
      const sub = bound ? emSubstitutions(t, vals) : null;
      const mine = sym === target.sym;
      let ev = NaN;
      if (mine && bound) {
        const sides = evaluate(t, bound);
        ev = sides[sides.length - 1][0];
      }
      const v = sym ? values[sym] : undefined;
      return {
        sym, mine, ev, v: typeof v === 'number' ? v : NaN,
        first: mathHtml(emTex(t)),
        lines: (sub?.lines ?? []).map((l) => mathHtml(`{}= ${l}`)),
      };
    });
  }, [eq, target, bound, values, digits]);
  const mineRel = rel.find((x) => x.mine);
  // An entry that assumes what this structure is not (a symmetric pair) gives another number than the solver's.
  const differs = mineRel && Number.isFinite(mineRel.ev) && Math.abs(mineRel.ev - mineRel.v) > 1e-6 * Math.abs(mineRel.v);

  const box = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    el.scrollIntoView({ block: 'nearest' });
  }, [req.n]);
  useLayoutEffect(() => { if (box.current) markWide(box.current, LINE); });
  useEffect(() => (box.current ? watchWide(box.current, LINE) : undefined), []);

  const [dOpen, setDOpen] = useState<{ n: number; from: HTMLElement } | null>(null);
  const view = useMemo(() => (dOpen && eq ? derivationOf(eq, bound ? values : null, digits) : null), [dOpen, eq, bound, values, digits]);

  const topic = eq && TOPIC_TITLE[eq.topic] ? eq.topic : '';
  return (
    <aside ref={box} className={css.panel} tabIndex={-1} aria-labelledby="em-eq-title" data-eq-panel={eq?.id ?? ''} data-eq-name={req.name}
      data-eq-stale={stale} data-eq-live={bound ? 'true' : 'false'} data-eq-bind={bound ? JSON.stringify(bound) : ''}
      onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); closeEq(); } }}>
      <div className={css.head}>
        <h4 id="em-eq-title" className={css.title}>{req.label}{eq ? <>: {eq.title}</> : null}</h4>
        <button type="button" className={css.button} data-eq-close onClick={closeEq} aria-label="Close the equation">Close</button>
      </div>
      {!eq ? (
        <p className={css.meta} data-eq-gone>This number is not in the results now.</p>
      ) : (
        <>
          <div className={css.rows}>
            {rel.map((x, i) => (
              <div key={i} className={`${eqCss.eqn} ${css.rel}`} data-eq-rel={x.sym ?? ''} data-eq-mine={x.mine || undefined}>
                <span className={eqCss.line} data-eq-line="" dangerouslySetInnerHTML={{ __html: x.first }} />
                {x.lines.map((l, j) => (
                  <span key={j} className={`${eqCss.line} ${x.mine && j === x.lines.length - 1 ? css.result : ''}`} data-eq-line=""
                    data-eq-result={x.mine && j === x.lines.length - 1 ? '' : undefined} data-v={x.mine && j === x.lines.length - 1 ? x.v : undefined}
                    data-eval={x.mine && j === x.lines.length - 1 ? x.ev : undefined} dangerouslySetInnerHTML={{ __html: l }} />
                ))}
              </div>
            ))}
            {eq.extra && <div className={eqCss.eqn}><span className={eqCss.line} data-eq-line="" dangerouslySetInnerHTML={{ __html: mathHtml(eq.extra) }} /></div>}
          </div>
          {!bound && <p className={css.note} data-eq-symbols>Symbols only: the shown result does not give every quantity of this equation a number.</p>}
          {differs && (
            <p className={css.note} data-eq-differs>
              This structure is not what the equation assumes ({eq.assumptions.join(', ')}): it gives {mineRel.ev.toPrecision(5)}, the solver {mineRel.v.toPrecision(5)} in SI units.
            </p>
          )}
          <p className={css.meta}>
            {eq.assumptions.length > 0 && <>Assumes {eq.assumptions.join(', ')}. </>}
            <Sources eq={eq} />
          </p>
          <div className={css.actions}>
            {eq.steps.length > 0 && (
              <button type="button" className={`${css.button} ${css.primary}`} data-eq-derive
                onClick={(e) => { const from = e.currentTarget; setDOpen((was) => ({ n: (was?.n ?? 0) + 1, from })); }}>Derivation</button>
            )}
            {topic && <a className={css.theory} href={`#${topic}`} data-eq-theory={topic}>→ theory: {TOPIC_TITLE[topic]}</a>}
          </div>
          {eq.steps.length > 0 && <Why k="eq-derive" />}
          <DerivationDialog view={view} opening={dOpen?.n ?? 0} from={dOpen?.from ?? null} onClosed={() => setDOpen(null)} titleId="em-derive-title" />
        </>
      )}
    </aside>
  );
}
