// The Smith chart's lesson links on the page (step M6.3b; the link's lesson part in lib/smith/lesson.ts, the form in
// docs/smith-chart/examples-challenges.md §2). "Make a lesson link" in the Learn section writes the circuit's link with
// locks, hidden panels and a short text; a student who opens it sees the Lesson box where the guide goes (the text as
// plain text, what is locked, Leave the lesson). The page keeps every locked value in `commit` (keepLocks).

import React, { memo, useEffect, useRef, useState } from 'react';

import styles from '../../styles/Smith.module.css';
import learn from '../../styles/SmithLearn.module.css';
import { CHALLENGE_TITLES, challengeText } from '../../lib/smith/challenge';
import type { ChallengeKind } from '../../lib/smith/challenge';
import { PANELS, TEXT_MAX, cutText, lessonParams } from '../../lib/smith/lesson';
import type { Lesson, Lock, Panel } from '../../lib/smith/lesson';
import { KIND_NAMES, LINK_VERSION, LISTS_PARAM, encodeCircuit } from '../../lib/smith/state';
import type { Circuit } from '../../lib/smith/state';
import { Why } from './Why';

/** The page's link (after "?"): the circuit, the value lists, the lesson part and the challenge. A "read this point"
 * challenge writes no circuit: its load is the answer, and the seed brings it back. */
export function linkSearch(c: Circuit, lists: string, lesson: Lesson | null, ch: { kind: ChallengeKind; seed: number } | null): string {
  // A '+' in a number's exponent would read back as a space.
  const vl = lists ? `&${LISTS_PARAM}=${lists.replace(/\+/g, '%2B')}` : '';
  const head = ch && ch.kind === 'read' ? `v=${LINK_VERSION}` : encodeCircuit(c);
  return `${head}${vl}${lessonParams(lesson)}${ch ? `&ch=${challengeText(ch.kind, ch.seed)}` : ''}`;
}

/** A lock in words. */
export function lockWords(lock: Lock): string {
  if (lock === 'z0') return 'Z0';
  if (lock === 'f0') return 'f0';
  if (lock === 'zl') return 'the load';
  if (lock === 'parts') return 'the parts’ list';
  return 'kind' in lock ? `part ${lock.kind + 1}’s kind` : `part ${lock.value + 1}’s value`;
}
const PANEL_WORDS: Readonly<Record<Panel, string>> = { solve: 'the Solve panel', suggest: 'the suggestions', reveal: 'a challenge’s reveal' };

// ---------------------------------------------------------------------------------------------------------------
// The Lesson box (where the guide goes)

export interface LessonBoxProps {
  lesson: Lesson;
  onLeave: () => void;
}

export const LessonBox = memo(function LessonBox({ lesson, onLeave }: LessonBoxProps) {
  const head = useRef<HTMLHeadingElement>(null);
  // Opened from a link: the focus goes to the box (as to the guide) unless the visitor is already somewhere.
  useEffect(() => {
    if (document.activeElement && document.activeElement !== document.body) return;
    head.current?.focus({ preventScroll: true });
  }, []);
  return (
    <section className={learn.guide} aria-labelledby="smith-lesson" data-lesson-box="">
      <h2 className={learn.head} id="smith-lesson" ref={head} tabIndex={-1}>Lesson <Why k="lesson-box" /></h2>
      {lesson.text && <p className={learn.lessonText} data-lesson-text-shown="">{lesson.text}</p>}
      {lesson.locks.length > 0 && <p className={learn.intro} data-lesson-locks="">Locked: {lesson.locks.map(lockWords).join(', ')}.</p>}
      {lesson.hidden.length > 0 && <p className={learn.intro} data-lesson-hidden="">Hidden: {lesson.hidden.map((p) => PANEL_WORDS[p]).join(', ')}.</p>}
      <div className={learn.bar}>
        <span className={learn.space} />
        <button type="button" className={`${styles.button} ${learn.btn}`} data-lesson-leave="" onClick={onLeave}>Leave the lesson</button>
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

const LOCK_ROWS: { lock: Lock; label: string }[] = [
  { lock: 'z0', label: 'Z0' }, { lock: 'f0', label: 'f0' }, { lock: 'zl', label: 'The load (R and X)' },
  { lock: 'parts', label: 'The parts’ list (no add, remove or move)' },
];

export function LessonMaker({ circuit, lists, challenge }: LessonMakerProps) {
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

  const flip = (token: string, on: boolean) => setLocks((s) => { const t = new Set(s); if (on) t.add(token); else t.delete(token); return t; });
  const hide = (p: Panel, on: boolean) => setHidden((s) => { const t = new Set(s); if (on) t.add(p); else t.delete(p); return t; });
  const copy = () => {
    const done = () => setCopied('Copied.');
    const fallback = () => {
      out.current?.select();
      try { setCopied(document.execCommand('copy') ? 'Copied.' : 'Select the link and copy it.'); } catch { setCopied('Select the link and copy it.'); }
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
    <details className={learn.maker} data-lesson-maker="">
      <summary className={learn.makerHead}>Make a lesson link <Why k="lesson" /></summary>
      <p className={learn.lead}>
        The link holds the circuit as it is now. A lock is a teaching aid, not security: anyone can edit the link.
      </p>
      <fieldset className={learn.set}>
        <legend>Lock <Why k="lesson-lock" /></legend>
        {LOCK_ROWS.map((r) => box(r.lock as string, r.label))}
        {circuit.parts.map((p, i) => (
          <span key={i} className={learn.partLocks}>
            <span className={learn.partName}>Part {i + 1}, {KIND_NAMES[p.kind]}:</span>
            {box(`k${i + 1}`, 'kind')}
            {box(`v${i + 1}`, 'value')}
          </span>
        ))}
      </fieldset>
      <fieldset className={learn.set}>
        <legend>Hide <Why k="lesson-hide" /></legend>
        {PANELS.map((p) => (
          <label key={p} className={learn.check}>
            <input type="checkbox" data-hide={p} checked={hidden.has(p)} onChange={(e) => hide(p, e.target.checked)} />
            {PANEL_WORDS[p].replace(/^(the|a) /, '').replace(/^./, (c) => c.toUpperCase())}
          </label>
        ))}
      </fieldset>
      <div className={learn.textRow}>
        <span className={learn.answerHead}>
          <label htmlFor="smith-lesson-text">Text for the student</label> <Why k="lesson-text" />
          <span className={learn.space} />
          <span className={learn.counter} data-lesson-count="" aria-live="polite">{count} / {TEXT_MAX}</span>
        </span>
        <textarea id="smith-lesson-text" className={`${styles.input} ${learn.textarea}`} rows={3} value={text} data-lesson-text=""
          onChange={(e) => setText(cutText(e.target.value).text)} />
      </div>
      {challenge && (
        <label className={learn.check}>
          <input type="checkbox" data-lesson-ch="" checked={withCh} onChange={(e) => setWithCh(e.target.checked)} />
          With the running challenge ({CHALLENGE_TITLES[challenge.kind]}, {challengeText(challenge.kind, challenge.seed)})
        </label>
      )}
      <div className={learn.linkRow}>
        <input ref={out} className={styles.input} readOnly value={link} aria-label="The lesson link" data-lesson-link="" onFocus={(e) => e.currentTarget.select()} />
        <button type="button" className={`${styles.button} ${learn.btn} ${learn.next}`} data-lesson-copy="" onClick={copy}>Copy link</button>
      </div>
      <p className={learn.state} role="status" data-lesson-copied="">{copied}</p>
    </details>
  );
}
