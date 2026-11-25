// The Smith chart's lesson links on the page (step M6.3b; the link's lesson part in lib/smith/lesson.ts, the form in
// docs/smith-chart/examples-challenges.md §2). "Make a lesson link" in the Learn section writes the circuit's link with
// locks, hidden panels and a short text; a student who opens it sees the Lesson box where the guide goes (the text as
// plain text, what is locked, Leave the lesson). The page keeps every locked value in `commit` (keepLocks).

import React, { memo, useEffect, useRef, useState } from 'react';

import styles from '../../styles/Smith.module.css';
import learn from '../../styles/SmithLearn.module.css';
import { challengeText } from '../../lib/smith/challenge';
import type { ChallengeKind } from '../../lib/smith/challenge';
import { PANELS, TEXT_MAX, cutText, lessonParams } from '../../lib/smith/lesson';
import type { Lesson, Lock, Panel } from '../../lib/smith/lesson';
import { LINK_VERSION, LISTS_PARAM, encodeCircuit } from '../../lib/smith/state';
import type { Circuit } from '../../lib/smith/state';
import { translate, useI18n } from '../../lib/ui/i18n';
import type { Locale, TranslationKey } from '../../lib/ui/translations';
import { getSmithLocale, kindName } from './smithText';
import { Why } from './Why';

/** The page's link (after "?"): the circuit, the value lists, the lesson part and the challenge. A "read this point"
 * challenge writes no circuit: its load is the answer, and the seed brings it back. */
export function linkSearch(c: Circuit, lists: string, lesson: Lesson | null, ch: { kind: ChallengeKind; seed: number } | null, sweep = ''): string {
  // A '+' in a number's exponent would read back as a space.
  const vl = lists ? `&${LISTS_PARAM}=${lists.replace(/\+/g, '%2B')}` : '';
  const head = ch && ch.kind === 'read' ? `v=${LINK_VERSION}` : encodeCircuit(c);
  return `${head}${vl}${sweep}${lessonParams(lesson)}${ch ? `&ch=${challengeText(ch.kind, ch.seed)}` : ''}`;
}

/** A lock in words. */
export function lockWords(lock: Lock, locale: Locale = getSmithLocale()): string {
  if (lock === 'z0') return 'Z0';
  if (lock === 'f0') return 'f0';
  if (lock === 'zl') return translate(locale, 'sm.ls.lockLoad');
  if (lock === 'parts') return translate(locale, 'sm.ls.lockParts');
  return 'kind' in lock
    ? translate(locale, 'sm.ls.lockKind', { n: lock.kind + 1 })
    : translate(locale, 'sm.ls.lockValue', { n: lock.value + 1 });
}
const PANEL_KEYS: Readonly<Record<Panel, TranslationKey>> = {
  solve: 'sm.ls.panelSolve', suggest: 'sm.ls.panelSuggest', reveal: 'sm.ls.panelReveal',
};
const HIDE_KEYS: Readonly<Record<Panel, TranslationKey>> = {
  solve: 'sm.ls.hideSolve', suggest: 'sm.ls.hideSuggest', reveal: 'sm.ls.hideReveal',
};

// ---------------------------------------------------------------------------------------------------------------
// The Lesson box (where the guide goes)

export interface LessonBoxProps {
  lesson: Lesson;
  onLeave: () => void;
}

export const LessonBox = memo(function LessonBox({ lesson, onLeave }: LessonBoxProps) {
  const { t, locale } = useI18n();
  const head = useRef<HTMLHeadingElement>(null);
  // Opened from a link: the focus goes to the box (as to the guide) unless the visitor is already somewhere.
  useEffect(() => {
    if (document.activeElement && document.activeElement !== document.body) return;
    head.current?.focus({ preventScroll: true });
  }, []);
  return (
    <section className={learn.guide} aria-labelledby="smith-lesson" data-lesson-box="">
      <h2 className={learn.head} id="smith-lesson" ref={head} tabIndex={-1}>{t('sm.ls.title')} <Why k="lesson-box" /></h2>
      {lesson.text && <p className={learn.lessonText} data-lesson-text-shown="">{lesson.text}</p>}
      {lesson.locks.length > 0 && (
        <p className={learn.intro} data-lesson-locks="">{t('sm.ls.locked', { items: lesson.locks.map((lk) => lockWords(lk, locale)).join(', ') })}</p>
      )}
      {lesson.hidden.length > 0 && (
        <p className={learn.intro} data-lesson-hidden="">{t('sm.ls.hidden', { items: lesson.hidden.map((p) => t(PANEL_KEYS[p])).join(', ') })}</p>
      )}
      <div className={learn.bar}>
        <span className={learn.space} />
        <button type="button" className={`${styles.button} ${learn.btn}`} data-lesson-leave="" onClick={onLeave}>{t('sm.ls.leave')}</button>
      </div>
    </section>
  );
});

// ---------------------------------------------------------------------------------------------------------------
// Make a lesson link (in the Learn section)

export interface LessonMakerProps {
  circuit: Circuit;
  /** The value lists' link text ('' for the defaults). */
  lists: string;
  /** The running challenge, which the link may carry. */
  challenge: { kind: ChallengeKind; seed: number } | null;
}

const LOCK_ROWS: { lock: Lock; label?: string; key?: TranslationKey }[] = [
  { lock: 'z0', label: 'Z0' }, { lock: 'f0', label: 'f0' }, { lock: 'zl', key: 'sm.ls.lockLoadLabel' },
  { lock: 'parts', key: 'sm.ls.lockPartsLabel' },
];

/**
 * "Make a lesson link". The body is rendered with the circuit only while the box is open: closed, it keeps the circuit
 * it last showed, so a commit (the end of every drag) renders the summary alone and the memoised body is skipped.
 */
export const LessonMaker = memo(function LessonMaker({ circuit, lists, challenge }: LessonMakerProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const kept = useRef(circuit);
  if (open) kept.current = circuit;
  return (
    <details className={learn.maker} data-lesson-maker="" onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary className={learn.makerHead}>{t('sm.ls.makerHead')} <Why k="lesson" /></summary>
      <MakerBody circuit={kept.current} lists={lists} challenge={challenge} />
    </details>
  );
});

const MakerBody = memo(function MakerBody({ circuit, lists, challenge }: LessonMakerProps) {
  const { t, locale } = useI18n();
  const [locks, setLocks] = useState<ReadonlySet<string>>(() => new Set());
  const [hidden, setHidden] = useState<ReadonlySet<Panel>>(() => new Set());
  const [text, setText] = useState('');
  const [withCh, setWithCh] = useState(true);
  const [origin, setOrigin] = useState('');
  const [copied, setCopied] = useState('');
  const out = useRef<HTMLInputElement>(null);
  useEffect(() => { setOrigin(`${window.location.origin}${window.location.pathname}`); }, []);

  const n = circuit.parts.length;
  const chosen: Lock[] = [];
  for (const r of LOCK_ROWS) if (locks.has(r.lock as string)) chosen.push(r.lock);
  for (let i = 0; i < n; i++) {
    if (locks.has(`k${i + 1}`)) chosen.push({ kind: i });
    if (locks.has(`v${i + 1}`)) chosen.push({ value: i });
  }
  const lesson: Lesson = { locks: chosen, hidden: PANELS.filter((p) => hidden.has(p)), text };
  const ch = withCh ? challenge : null;
  const link = `${origin}?${linkSearch(circuit, lists, lesson.locks.length || lesson.hidden.length || text ? lesson : null, ch)}`;
  useEffect(() => { setCopied(''); }, [link]);

  const flip = (token: string, on: boolean) => setLocks((s) => { const next = new Set(s); if (on) next.add(token); else next.delete(token); return next; });
  const hide = (p: Panel, on: boolean) => setHidden((s) => { const next = new Set(s); if (on) next.add(p); else next.delete(p); return next; });
  const copy = () => {
    const done = () => setCopied(t('sm.ls.copied'));
    const fallback = () => {
      out.current?.select();
      try { setCopied(document.execCommand('copy') ? t('sm.ls.copied') : t('sm.ls.copyFallback')); } catch { setCopied(t('sm.ls.copyFallback')); }
    };
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(link).then(done, fallback);
    else fallback();
  };
  const box = (token: string, label: string) => (
    <label key={token} className={learn.check}>
      <input type="checkbox" data-lock={token} checked={locks.has(token)} onChange={(e) => flip(token, e.target.checked)} />
      {label}
    </label>
  );
  const count = [...text].length;

  return (
    <>
      <p className={learn.lead}>{t('sm.ls.makerLead')}</p>
      <fieldset className={learn.set}>
        <legend>{t('sm.ls.lockLegend')} <Why k="lesson-lock" /></legend>
        {LOCK_ROWS.map((r) => box(r.lock as string, r.key ? t(r.key) : r.label!))}
        {circuit.parts.map((p, i) => (
          <span key={i} className={learn.partLocks}>
            <span className={learn.partName}>{t('sm.ls.partLabel', { n: i + 1, kind: kindName(p.kind, locale) })}</span>
            {box(`k${i + 1}`, t('sm.ls.kindBox'))}
            {box(`v${i + 1}`, t('sm.ls.valueBox'))}
          </span>
        ))}
      </fieldset>
      <fieldset className={learn.set}>
        <legend>{t('sm.ls.hideLegend')} <Why k="lesson-hide" /></legend>
        {PANELS.map((p) => (
          <label key={p} className={learn.check}>
            <input type="checkbox" data-hide={p} checked={hidden.has(p)} onChange={(e) => hide(p, e.target.checked)} />
            {t(HIDE_KEYS[p])}
          </label>
        ))}
      </fieldset>
      <div className={learn.textRow}>
        <span className={learn.answerHead}>
          <label htmlFor="smith-lesson-text">{t('sm.ls.textLabel')}</label> <Why k="lesson-text" />
          <span className={learn.space} />
          <span className={learn.counter} data-lesson-count="" aria-live="polite">{count} / {TEXT_MAX}</span>
        </span>
        <textarea id="smith-lesson-text" className={`${styles.input} ${learn.textarea}`} rows={3} value={text} data-lesson-text=""
          onChange={(e) => setText(cutText(e.target.value).text)} />
      </div>
      {challenge && (
        <label className={learn.check}>
          <input type="checkbox" data-lesson-ch="" checked={withCh} onChange={(e) => setWithCh(e.target.checked)} />
          {t('sm.ls.withCh', {
            title: t(`sm.ch.title.${challenge.kind}` as TranslationKey),
            code: challengeText(challenge.kind, challenge.seed),
          })}
        </label>
      )}
      <div className={learn.linkRow}>
        <input ref={out} className={styles.input} readOnly value={link} aria-label={t('sm.ls.linkAria')} data-lesson-link="" onFocus={(e) => e.currentTarget.select()} />
        <button type="button" className={`${styles.button} ${learn.btn} ${learn.next}`} data-lesson-copy="" onClick={copy}>{t('sm.ls.copyLink')}</button>
      </div>
      <p className={learn.state} role="status" data-lesson-copied="">{copied}</p>
    </>
  );
});
