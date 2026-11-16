// The EM simulation page's Examples section (step M4.3b; a chunk of its own, loaded by EmSimTool when the section comes
// near or the link's fragment is `examples` or an example's id): the worked examples of lib/emsim/examples.ts (the
// text of docs/em-sim/examples.md, every number checked against the engine by check-teach.mjs), each with its intro,
// the links that open its states and its steps. A link is a plain <a> with the state's query (a new tab or a copied
// link works as any link); a plain click applies the state in place through `apply` (EmSimTool: the query read as the
// page reads its own link, committed as one undo step, the address follows), then scrolls to the section the state is
// about and, for the links whose first step reads a result, opens that result's equation.

import React, { useEffect } from 'react';

import { EXAMPLES, EXAMPLE_PATH } from '../../lib/emsim/examples';
import type { Example, ExampleLink } from '../../lib/emsim/examples';
import css from '../../styles/EmSimExamples.module.css';
import { openEq } from './eqLinks';
import type { EqRequest } from './eqLinks';
import { TOPIC_TITLE } from './whys';

/** Reads a link's query as the page reads its own and commits it as one undo step; `then` runs once it is applied. */
export type ApplyLink = (query: string, then: () => void) => void;

// The result whose equation a link opens (the number its example's step reads first).
const OPENS: Record<string, { section: EqRequest['section']; name: string; label: string }> = {
  'ex-microstrip/stackup': { section: 'trace', name: 'z0', label: 'Z0' },
  'ex-lvds-pair/pair': { section: 'trace', name: 'zdiff', label: 'Zdiff' },
  'ex-via-pair/via': { section: 'via', name: 'section-zdiff', label: 'Via section Zdiff' },
  'ex-via-stub/through': { section: 'via', name: 'section-z', label: 'Via section √(L/C)' },
  'ex-via-stub/stub': { section: 'via', name: 'stub.exit', label: 'Stub resonance' },
};

function LinkItem({ ex, l, apply }: { ex: Example; l: ExampleLink; apply: ApplyLink }) {
  const key = `${ex.id}/${l.name}`;
  const query = l.link.slice(EXAMPLE_PATH.length);
  const section = /(^|&)via=/.test(query) ? 'via' : 'trace';
  const onClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; // a new tab or window: the browser's own
    e.preventDefault();
    const from = e.currentTarget;
    apply(query, () => {
      window.requestAnimationFrame(() => {
        document.getElementById(section)?.scrollIntoView({ block: 'start' });
        const o = OPENS[key];
        if (o) openEq(o.section, o.name, o.label, from);
      });
    });
  };
  return (
    <li className={css.link}>
      <a href={l.link} onClick={onClick} data-example-link={key} data-section={section}>Open “{l.name}”</a>
      {OPENS[key] && <span className={css.recipe}>also opens the equation of {OPENS[key].label}</span>}
    </li>
  );
}

export default function Examples({ apply }: { apply: ApplyLink }) {
  // A link to an example that arrived before the chunk: shown once it is here.
  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (id.startsWith('ex-')) window.requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView());
  }, []);
  return (
    <div className={css.examples} data-examples="">
      <p className={css.lead}>
        Worked examples on JLCPCB’s six-layer stackup. Each “Open” link puts its state on the page as one step you can
        undo, and takes you to the results; the steps say what to do and what you should see.
      </p>
      <nav className={css.contents} aria-label="Examples">
        <ol>{EXAMPLES.map((ex) => <li key={ex.id}><a href={`#${ex.id}`}>{ex.title}</a></li>)}</ol>
      </nav>
      {EXAMPLES.map((ex, i) => (
        <section key={ex.id} id={ex.id} className={css.example} aria-labelledby={`${ex.id}-h`} data-example={ex.id}>
          <h3 id={`${ex.id}-h`} className={css.head}><span className={css.no}>{i + 1}</span>{ex.title}</h3>
          <p>{ex.intro}</p>
          <ul className={css.links}>{ex.links.map((l) => <LinkItem key={l.name} ex={ex} l={l} apply={apply} />)}</ul>
          <ol className={css.steps}>
            {ex.steps.map((s, k) => <li key={k} data-example-step={k}>{s.text}</li>)}
          </ol>
          {ex.topics.length > 0 && (
            <p className={css.topics}>
              Theory:{' '}
              {ex.topics.filter((t) => TOPIC_TITLE[t]).map((t, k) => (
                <React.Fragment key={t}>{k > 0 && ' · '}<a href={`#${t}`}>{TOPIC_TITLE[t]}</a></React.Fragment>
              ))}
            </p>
          )}
        </section>
      ))}
    </div>
  );
}
