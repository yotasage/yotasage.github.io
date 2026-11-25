// The Smith chart's Learn section and guide panel (step M6.3a; data and tests in lib/smith/examples.ts, content in
// docs/smith-chart/examples.md). The section lists the worked examples; loading one is one undo step (the page's
// commit) and opens the guide at the top of the side panel, beside the chart on wide screens and right under it on
// phones, so the visitor sees the chart and what to do at once. The guide tests the visitor's own circuit after every
// committed change (stepDone, a few µs): any route counts, typing, dragging or the solver. Nothing here runs during a
// drag: the guide's props change only on a commit, a grid switch or the digits setting.

import React, { memo, useEffect, useMemo, useRef, useState } from 'react';

import styles from '../../styles/Smith.module.css';
import learn from '../../styles/SmithLearn.module.css';
import theoryCss from '../../styles/SmithTheory.module.css';
import {
  EXAMPLES, Figure, NodeRef, Quantity, answerCheck, exampleById, guideFigure, nodeGammas, stepDone,
} from '../../lib/smith/examples';
import type { Circuit } from '../../lib/smith/state';
import { translate, useI18n } from '../../lib/ui/i18n';
import type { Locale, TranslationKey } from '../../lib/ui/translations';
import { ChallengeList } from './Challenge';
import type { ChallengeListProps } from './Challenge';
import { LessonMaker } from './Lesson';
import type { LessonMakerProps } from './Lesson';
import { Why, followTopic } from './Why';

export type Grid = 'Z' | 'Y' | 'ZY';

const exText = (locale: Locale, key: string, fallback: string): string => {
  const out = translate(locale, key as TranslationKey);
  return out === key ? fallback : out;
};

// ---------------------------------------------------------------------------------------------------------------
// The section

export interface LearnSectionProps {
  /** The id of the example the guide shows, '' for none. */
  open: string;
  onLoad: (id: string) => void;
  /** M6.3b: the challenges (below the examples) and "Make a lesson link" (last). */
  challenges: ChallengeListProps;
  maker: LessonMakerProps;
}

/** The Learn section: the examples in examples.md's order, the challenges and the lesson-link maker. */
export const LearnSection = memo(function LearnSection({ open, onLoad, challenges, maker }: LearnSectionProps) {
  const { t, locale } = useI18n();
  // `maker` changes with every commit (it carries the circuit); the rest only with what it shows, so a commit renders
  // the maker's summary and nothing else of the section.
  const blocked = !!challenges.blocked;
  const examples = useMemo(() => (
    <ol className={learn.list} data-examples="">
      {EXAMPLES.map((ex, i) => (
        <li key={ex.id}>
          <button type="button" className={learn.item} data-example={ex.id} aria-current={open === ex.id ? 'true' : undefined}
            disabled={blocked} onClick={() => onLoad(ex.id)}>
            <span className={learn.num}>E{i + 1}</span>
            <span className={learn.itemTitle}>{exText(locale, `sm.exm.${ex.id}.title`, ex.title)}</span>
            <span className={learn.itemIntro}>{exText(locale, `sm.exm.${ex.id}.intro`, ex.intro)}</span>
          </button>
        </li>
      ))}
    </ol>
  ), [open, onLoad, blocked, locale]);
  const list = useMemo(() => <ChallengeList {...challenges} />, [challenges]);
  return (
    <div className={learn.wrap}>
      <section id="learn" className={`${theoryCss.section} ${learn.section}`} aria-labelledby="learn-title">
        <h2 className={theoryCss.sectionHead} id="learn-title">{t('sm.lr.title')}</h2>
        <p className={learn.lead}>
          {t('sm.lr.lead')} <Why k="learn" />
        </p>
        <h3 className={learn.listHead}>{t('sm.lr.worked')} <Why k="learn-example" /></h3>
        {examples}
        {list}
        <LessonMaker {...maker} />
      </section>
    </div>
  );
});

// ---------------------------------------------------------------------------------------------------------------
// Words and numbers

const UNIT: Readonly<Partial<Record<Quantity, string>>> = { angle: '°', rl: ' dB', R: ' Ω' };
const qtyLabel = (q: Quantity | 'z', locale: Locale): string => {
  if (q === 'rl') return translate(locale, 'sm.lr.rl');
  if (q === 'mag') return '|Γ|';
  if (q === 'angle') return '∠Γ';
  if (q === 'vswr') return 'VSWR';
  return q;
};
const where = (node: NodeRef, locale: Locale): string =>
  node === 'in' ? translate(locale, 'sm.lr.atInput') : node === 0 ? translate(locale, 'sm.lr.atLoad') : translate(locale, 'sm.lr.atNode', { n: node });

/** A number at the digits setting, with a true minus sign. */
const num = (v: number, digits: number): string => {
  if (!Number.isFinite(v)) return v > 0 ? '∞' : v < 0 ? '−∞' : '–';
  // Rounding left over from an exact match (|Γ| of 4e-17) reads as 0.
  return (Math.abs(v) < 1e-12 ? '0' : v.toPrecision(digits)).replace('-', '−');
};
const complex = (re: number, im: number, digits: number): string =>
  `${num(re, digits)} ${im < 0 ? '−' : '+'} j${num(Math.abs(im), digits)}`;
/** A number as the step states it (its data), with a true minus sign. */
const plain = (v: number): string => String(v).replace('-', '−');

/** What the visitor typed as a number: a comma for the point, a typographic minus and the quantity's unit are taken. */
export function readAnswer(text: string): number | null {
  const t = text.trim().replace(/[−–]/g, '-').replace(',', '.').replace(/\s*(db|Ω|ohms?|°|deg)$/i, '');
  if (!t || !/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(t)) return null;
  return Number(t);
}

function FigureLine({ f, digits }: { f: Figure; digits: number }) {
  const { t, locale } = useI18n();
  const value = f.q === 'z' ? complex(f.value, f.im, digits) : `${num(f.value, digits)}${UNIT[f.q as Quantity] ?? ''}`;
  const target = f.of === 'centre' ? t('sm.lr.doneAt', { v: plain(f.target) })
    : f.of === 'near' ? t('sm.lr.toReach', { v: `${plain(f.target)} ${f.tim < 0 ? '−' : '+'} j${plain(Math.abs(f.tim))}` })
      : f.of === 'circle' ? t('sm.lr.toReach', { v: plain(f.target) }) : '';
  return (
    <p className={learn.figure} data-guide-figure={f.of} data-raw={f.value} data-raw-im={f.q === 'z' ? f.im : undefined}>
      {qtyLabel(f.q, locale)} {where(f.node, locale)}: {value}{target && <> · {target}</>}
    </p>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// The guide

export interface GuideProps {
  id: string;
  circuit: Circuit;
  grid: Grid;
  digits: number;
  onLoad: (id: string) => void;
  onClose: () => void;
}

/** The guide panel; the page gives it a new key for every load, so a load starts at step 1. */
export const Guide = memo(function Guide({ id, circuit, grid, digits, onLoad, onClose }: GuideProps) {
  const { t, locale } = useI18n();
  const ex = exampleById(id);
  const index = ex ? EXAMPLES.indexOf(ex) : -1;
  const [step, setStep] = useState(0);
  // Γ of every node when each step was first done: the "other solution" steps test the distance from it.
  const [doneAt, setDoneAt] = useState<(Float64Array | null)[]>(() => (ex ? ex.steps.map(() => null) : []));
  const [draft, setDraft] = useState('');
  const [answer, setAnswer] = useState<number | null>(null);
  const [unread, setUnread] = useState(false);
  const [hint, setHint] = useState(false);
  const head = useRef<HTMLHeadingElement>(null);
  const stepRef = useRef<HTMLParagraphElement>(null);
  const moved = useRef(false);

  const s = ex?.steps[step];
  const ask = s ? answerCheck(s) : null;
  const holds = useMemo(() => !!s && stepDone(s, circuit, { grid, answer, doneAt }), [s, circuit, grid, answer, doneAt]);
  const done = holds || !!doneAt[step];
  useEffect(() => {
    if (holds && !doneAt[step]) setDoneAt((d) => { const next = d.slice(); next[step] = nodeGammas(circuit); return next; });
  }, [holds, step, circuit, doneAt]);
  const figure = useMemo(() => (s ? guideFigure(s, circuit, done) : null), [s, circuit, done]);

  // A load puts the focus on the guide's heading (the page scrolls the tool into view); a new step on its text.
  // On wide screens the side panel scrolls on its own: back to its top, where the guide is.
  useEffect(() => {
    const side = head.current?.closest('aside');
    if (side && side.scrollTop > 0) side.scrollTop = 0;
    head.current?.focus({ preventScroll: true });
  }, []);
  useEffect(() => {
    if (moved.current) stepRef.current?.focus({ preventScroll: true });
    moved.current = false;
  }, [step]);

  if (!ex || !s) return null;
  const last = step === ex.steps.length - 1;
  const nextEx = index + 1 < EXAMPLES.length ? EXAMPLES[index + 1] : null;
  const go = (to: number) => {
    moved.current = true;
    setStep(to);
    setDraft('');
    setAnswer(null);
    setUnread(false);
    setHint(false);
  };
  const check = (e: React.FormEvent) => {
    e.preventDefault();
    const v = readAnswer(draft);
    setUnread(v === null);
    setAnswer(v);
  };
  const askWhat = ask ? `${qtyLabel(ask.quantity, locale)} ${where(ask.node, locale)}${UNIT[ask.quantity] ? t('sm.lr.inUnit', { unit: UNIT[ask.quantity]! }) : ''}` : '';
  const exTitle = exText(locale, `sm.exm.${ex.id}.title`, ex.title);
  const exIntro = exText(locale, `sm.exm.${ex.id}.intro`, ex.intro);
  const stepDo = exText(locale, `sm.exm.${ex.id}.s${step}.do`, s.do);
  const stepHint = exText(locale, `sm.exm.${ex.id}.s${step}.hint`, s.hint);
  const nextTitle = nextEx ? exText(locale, `sm.exm.${nextEx.id}.title`, nextEx.title) : '';

  return (
    <section className={learn.guide} aria-labelledby="smith-guide" data-guide={ex.id} data-step={step} data-done={done ? '' : undefined}>
      <h2 className={learn.head} id="smith-guide" ref={head} tabIndex={-1}>
        {t('sm.lr.guideHead', { n: index + 1, total: EXAMPLES.length })} <Why k="guide" />
      </h2>
      <p className={learn.title}>{exTitle}</p>
      <p className={learn.intro}>{exIntro}</p>
      <p className={learn.step} ref={stepRef} tabIndex={-1} data-guide-do="">
        <span className={learn.stepNo}>{t('sm.lr.stepOf', { n: step + 1, total: ex.steps.length })}</span>
        {stepDo}{' '}
        <a href={`#${s.topic}`} className={styles.whyLink} data-guide-theory=""
          onClick={(e) => followTopic(s.topic, e.currentTarget)}>{t('sm.lr.toTheory')}</a>
      </p>
      {ask && (
        <form className={learn.answer} onSubmit={check} data-guide-answer="">
          <span className={learn.answerHead}>
            <label htmlFor="smith-guide-answer">{t('sm.lr.yourAnswer', { what: askWhat })}</label>
            <Why k="guide-answer" topic={s.topic} />
          </span>
          <input id="smith-guide-answer" className={styles.input} value={draft} inputMode="decimal" autoComplete="off" spellCheck={false}
            aria-invalid={(unread || (answer !== null && !done)) || undefined} aria-describedby="smith-guide-state"
            onChange={(e) => setDraft(e.target.value)} />
          <button type="submit" className={`${styles.button} ${learn.btn}`} data-guide-check="">{t('sm.lr.check')}</button>
        </form>
      )}
      <p className={learn.state} id="smith-guide-state" role="status" data-done={done ? '' : undefined} data-guide-state="">
        {done
          ? <><span className={learn.tick} aria-hidden="true">✓</span> {t(last ? 'sm.lr.doneLast' : 'sm.lr.done')}</>
          : unread ? t('sm.lr.typeNum')
            : ask && answer !== null ? t('sm.lr.notWithin', { tol: plain(ask.tol) })
              : t('sm.lr.notYet')}
      </p>
      {figure && <FigureLine f={figure} digits={digits} />}
      <div className={learn.hintRow}>
        <button type="button" className={`${styles.button} ${styles.toggle} ${learn.btn}`} aria-pressed={hint} data-guide-hint=""
          onClick={() => setHint(!hint)}>{t('sm.lr.hint')}</button>
        <Why k="guide-hint" topic={s.topic} />
      </div>
      {hint && <p className={learn.hint}><strong>{t('sm.lr.hintLabel')}</strong> <span data-guide-hint-text="">{stepHint}</span></p>}
      <div className={learn.bar}>
        <button type="button" className={`${styles.button} ${learn.btn}`} data-guide-back="" disabled={step === 0}
          onClick={() => go(step - 1)}>{t('sm.lr.back')}</button>
        {!last && (
          <button type="button" className={`${styles.button} ${learn.btn} ${learn.next}`} data-guide-next="" disabled={!done}
            onClick={() => go(step + 1)}>{t('sm.lr.next')}</button>
        )}
        {last && nextEx && (
          <button type="button" className={`${styles.button} ${learn.btn} ${learn.next}`} data-guide-next-example="" disabled={!done}
            onClick={() => onLoad(nextEx.id)} title={nextTitle}>{t('sm.lr.nextExample')}</button>
        )}
        <span className={learn.space} />
        <button type="button" className={`${styles.button} ${learn.btn}`} data-guide-close="" onClick={onClose}
          aria-label={t('sm.lr.closeAria')}>{t('sm.lr.close')}</button>
      </div>
    </section>
  );
});
