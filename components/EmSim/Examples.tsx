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
import { useI18n } from '../../lib/ui/i18n';
import type { TranslationKey } from '../../lib/ui/translations';
import css from '../../styles/EmSimExamples.module.css';
import { emHasKey, topicTitle } from './emText';
import { openEq } from './eqLinks';
import type { EqRequest } from './eqLinks';
import { TOPIC_TITLE } from './whys';

/** Reads a link's query as the page reads its own and commits it as one undo step; `then` runs once it is applied. */
export type ApplyLink = (query: string, then: () => void) => void;

// The result whose equation a link opens (the number its example's step reads first).
const OPENS: Record<string, { section: EqRequest['section']; name: string; labelKey: TranslationKey }> = {
  'ex-microstrip/stackup': { section: 'trace', name: 'z0', labelKey: 'em.ex.openLabel.z0' },
  'ex-lvds-pair/pair': { section: 'trace', name: 'zdiff', labelKey: 'em.ex.openLabel.zdiff' },
  'ex-via-pair/via': { section: 'via', name: 'section-zdiff', labelKey: 'em.ex.openLabel.viaZdiff' },
  'ex-via-stub/through': { section: 'via', name: 'section-z', labelKey: 'em.ex.openLabel.viaZ' },
  'ex-via-stub/stub': { section: 'via', name: 'stub.exit', labelKey: 'em.ex.openLabel.stub' },
};

function LinkItem({ ex, l, apply }: { ex: Example; l: ExampleLink; apply: ApplyLink }) {
  const { t } = useI18n();
  const key = `${ex.id}/${l.name}`;
  const query = l.link.slice(EXAMPLE_PATH.length);
  const section = /(^|&)via=/.test(query) ? 'via' : 'trace';
  const lk = `em.ex.${ex.id}.l.${l.name}`;
  const label = emHasKey(lk) ? t(lk) : l.label;
  const openInfo = OPENS[key];
  const openLabel = openInfo ? t(openInfo.labelKey) : '';
  const onClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; // a new tab or window: the browser's own
    e.preventDefault();
    const from = e.currentTarget;
    apply(query, () => {
      window.requestAnimationFrame(() => {
        document.getElementById(section)?.scrollIntoView({ block: 'start' });
        if (openInfo) openEq(openInfo.section, openInfo.name, openLabel, from);
      });
    });
  };
  return (
    <li className={css.link}>
      <a href={l.link} onClick={onClick} data-example-link={key} data-section={section}>{t('em.ex.openLink', { label })}</a>
      {openInfo && <span className={css.recipe}>{t('em.ex.alsoOpens', { label: openLabel })}</span>}
    </li>
  );
}

export default function Examples({ apply }: { apply: ApplyLink }) {
  const { t, locale } = useI18n();
  // A link to an example that arrived before the chunk: shown once it is here.
  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (id.startsWith('ex-')) window.requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView());
  }, []);
  const exText = (key: string, fallback: string) => (emHasKey(key) ? t(key) : fallback);
  return (
    <div className={css.examples} data-examples="">
      <p className={css.lead}>{t('em.ex.lead')}</p>
      <nav className={css.contents} aria-label={t('em.ex.navAria')}>
        <ol>{EXAMPLES.map((ex) => <li key={ex.id}><a href={`#${ex.id}`}>{exText(`em.ex.${ex.id}.title`, ex.title)}</a></li>)}</ol>
      </nav>
      {EXAMPLES.map((ex, i) => (
        <section key={ex.id} id={ex.id} className={css.example} aria-labelledby={`${ex.id}-h`} data-example={ex.id}>
          <h3 id={`${ex.id}-h`} className={css.head}><span className={css.no}>{i + 1}</span>{exText(`em.ex.${ex.id}.title`, ex.title)}</h3>
          <p>{exText(`em.ex.${ex.id}.intro`, ex.intro)}</p>
          <ul className={css.links}>{ex.links.map((l) => <LinkItem key={l.name} ex={ex} l={l} apply={apply} />)}</ul>
          <ol className={css.steps}>
            {ex.steps.map((s, k) => <li key={k} data-example-step={k}>{exText(`em.ex.${ex.id}.s.${k}`, s.text)}</li>)}
          </ol>
          {ex.topics.length > 0 && (
            <p className={css.topics}>
              {t('em.ex.theory')}{' '}
              {ex.topics.filter((top) => TOPIC_TITLE[top]).map((top, k) => (
                <React.Fragment key={top}>{k > 0 && ' · '}<a href={`#${top}`}>{topicTitle(top, locale)}</a></React.Fragment>
              ))}
            </p>
          )}
        </section>
      ))}
    </div>
  );
}
