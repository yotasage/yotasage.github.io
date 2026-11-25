// The Smith chart's challenges on the page (step M6.3b; the problems, checks and hints in lib/smith/challenge.ts,
// the kinds in docs/smith-chart/examples-challenges.md §1). The Learn section lists the five kinds with the visitor's
// progress (kept in localStorage only); a running challenge has its panel where the guide goes, at the top of the
// side panel, beside the chart on wide screens and right under it on phones. The panel checks the visitor's circuit
// after every commit (`reached`, a few µs), gives the hint ladder one step per press (hint 1's circles are drawn on
// the chart as the solver's) and, unless a lesson hides it, the reveal with Apply. Nothing here runs during a drag:
// the panel's props change only on a commit.

import React, { memo, useEffect, useMemo, useRef, useState } from 'react';

import styles from '../../styles/Smith.module.css';
import learn from '../../styles/SmithLearn.module.css';
import { CHALLENGE_KINDS, challengeText, hintLadder, reached } from '../../lib/smith/challenge';
import type { Challenge, ChallengeKind, Hint, Revealed } from '../../lib/smith/challenge';
import { formValue, formsOf } from '../../lib/smith/state';
import type { Circuit } from '../../lib/smith/state';
import { translate, useI18n } from '../../lib/ui/i18n';
import type { Locale, TranslationKey } from '../../lib/ui/translations';
import { kindName } from './smithText';
import type { CircleShape } from './solveLayer';
import { formText } from './Strip';
import { Why } from './Why';

// ---------------------------------------------------------------------------------------------------------------
// Progress (localStorage `smith.challenges`, read after mount)

export interface KindProgress {
  /** Problems started (a kind pressed, New problem, a challenge link opened). */
  tried: number;
  solved: number;
  revealed: number;
  /** Hints 1–3 shown (the reveal is counted as revealed). */
  hints: number;
  /** The fewest parts of a solved problem, 0 for none yet. */
  fewest: number;
}
export type Progress = Readonly<Record<ChallengeKind, KindProgress>>;
export const PROGRESS_KEY = 'smith.challenges';

const ZERO: KindProgress = { tried: 0, solved: 0, revealed: 0, hints: 0, fewest: 0 };
export const NO_PROGRESS: Progress = Object.freeze(Object.fromEntries(CHALLENGE_KINDS.map((k) => [k, ZERO])) as Record<ChallengeKind, KindProgress>);

const count = (v: unknown): number => (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < 1e9 ? v : 0);

/** The stored progress; anything unreadable counts as none. */
export function readProgress(text: string | null): Progress {
  let raw: Record<string, Record<string, unknown>> = {};
  try { raw = text ? JSON.parse(text) : {}; } catch { /* None then. */ }
  if (!raw || typeof raw !== 'object') raw = {};
  const out = {} as Record<ChallengeKind, KindProgress>;
  for (const k of CHALLENGE_KINDS) {
    const p = raw[k] && typeof raw[k] === 'object' ? raw[k] : {};
    out[k] = { tried: count(p.tried), solved: count(p.solved), revealed: count(p.revealed), hints: count(p.hints), fewest: count(p.fewest) };
  }
  return out;
}

/** What happened to a problem, for the progress. */
export type ProgressEvent = { t: 'tried' } | { t: 'hint' } | { t: 'revealed' } | { t: 'solved'; parts: number };

export function addProgress(p: Progress, kind: ChallengeKind, e: ProgressEvent): Progress {
  const k = { ...p[kind] };
  if (e.t === 'tried') k.tried++;
  else if (e.t === 'hint') k.hints++;
  else if (e.t === 'revealed') k.revealed++;
  else { k.solved++; k.fewest = k.fewest ? Math.min(k.fewest, e.parts) : e.parts; }
  return { ...p, [kind]: k };
}

const progressText = (p: KindProgress, locale: Locale): string =>
  translate(locale, 'sm.ch.progress', { tried: p.tried, solved: p.solved, revealed: p.revealed, hints: p.hints })
  + (p.fewest ? translate(locale, 'sm.ch.fewest', { n: p.fewest }) : '');

// ---------------------------------------------------------------------------------------------------------------
// UI-layer localizers for lib/smith/challenge.ts strings (keeps lib/smith tests untouched)

const EN_KIND_TO_INDEX: Readonly<Record<string, number>> = {
  'series R': 0, 'series L': 1, 'series C': 2, 'shunt R': 3, 'shunt L': 4, 'shunt C': 5,
  'line': 6, 'open stub': 7, 'short stub': 8, 'λ/4 transformer': 9,
  'A series R': 0, 'A series L': 1, 'A series C': 2, 'A shunt R': 3, 'A shunt L': 4, 'A shunt C': 5,
};

function localizedTask(ch: Challenge, locale: Locale): string {
  if (ch.kind === 'read' && ch.read) {
    return translate(locale, 'sm.ch.task.read', { ask: translate(locale, `sm.ch.ask.${ch.read.ask}` as TranslationKey) });
  }
  const goal = `|Γ| ≤ ${ch.goal.value}`;
  switch (ch.kind) {
    case 'two': return translate(locale, 'sm.ch.task.two', { goal });
    case 'e24': return translate(locale, 'sm.ch.task.e24', { goal });
    case 'stub': return translate(locale, 'sm.ch.task.stub', { goal, stub: kindName(ch.allowed[1], locale).toLowerCase() });
    case 'qw': return translate(locale, ch.complex ? 'sm.ch.task.qwComplex' : 'sm.ch.task.qwReal', { goal });
  }
}

function localizedWhy(why: string, locale: Locale): string {
  if (!why || locale === 'en') return why;
  if (why === 'Type two numbers.') return translate(locale, 'sm.ch.typeTwo');
  if (why === 'Type a number.') return translate(locale, 'sm.ch.typeOne');
  if (why === 'Not yet: that is not where the point is.') return translate(locale, 'sm.ch.why.notPoint');
  if (why.startsWith('Z0, f0 or the load')) return translate(locale, 'sm.ch.why.changedBase');
  if (why === 'At most one part.') return translate(locale, 'sm.ch.why.maxOne');
  let m = /^At most (\d+) parts\.$/.exec(why);
  if (m) return translate(locale, 'sm.ch.why.maxParts', { n: m[1] });
  m = /^Part (\d+) is a (.+), which this challenge does not allow\.$/.exec(why);
  if (m) {
    const idx = EN_KIND_TO_INDEX[m[2]];
    return translate(locale, 'sm.ch.why.disallowed', { n: m[1], kind: idx !== undefined ? kindName(idx, locale).toLowerCase() : m[2] });
  }
  m = /^Part (\d+)’s Zc must be Z0\.$/.exec(why);
  if (m) return translate(locale, 'sm.ch.why.zc', { n: m[1] });
  m = /^Part (\d+)’s (L|C) is not an E24 value\.$/.exec(why);
  if (m) return translate(locale, 'sm.ch.why.e24', { n: m[1], lc: m[2] });
  m = /^Not yet: \|Γ\| at the input is above (.+)\.$/.exec(why);
  if (m) return translate(locale, 'sm.ch.why.above', { v: m[1] });
  return why;
}

const EXACT_HINTS: Readonly<Record<string, TranslationKey>> = {
  'The point lies where its r circle and its x circle cross; both are drawn.': 'sm.ch.h.readZ1',
  'Read r and x where their circles’ labels are: r on the axis, x on the rim.': 'sm.ch.h.readZ2',
  'The point lies where its g circle and its b circle cross; both are drawn.': 'sm.ch.h.readY1',
  'Read g and b where their circles’ labels are, on the Y grid (the Z grid turned half a turn).': 'sm.ch.h.readY2',
  'The point’s |Γ| circle about the centre is drawn.': 'sm.ch.h.readG1',
  '|Γ| is the distance from the centre, the rim being 1.': 'sm.ch.h.readMag2',
  'The VSWR is r where the |Γ| circle crosses the right half of the axis.': 'sm.ch.h.readVswr2',
  'RL = −20 log₁₀|Γ|, with |Γ| the distance from the centre.': 'sm.ch.h.readRl2',
  'Reveal shows the solver’s answers.': 'sm.ch.h.fallbackReveal',
  'The solver’s answers; Apply sets one.': 'sm.ch.h.solverApply',
  'The line turns the point on this circle until it meets g = 1.': 'sm.ch.h.stub1',
  'A line of Z0, clockwise to the first crossing; the stub then cancels b.': 'sm.ch.h.stub2',
  'A line first turns the point to the axis, where the load is real.': 'sm.ch.h.qwC1',
  'A line, clockwise to either crossing of the axis.': 'sm.ch.h.qwC2',
  'As Zt changes, the input moves on this circle through the centre.': 'sm.ch.h.qwR1',
  'Zt lies between Z0 and the load’s R.': 'sm.ch.h.qwR2',
};

function localizedHintText(text: string, locale: Locale): string {
  if (!text || locale === 'en') return text;
  const exact = EXACT_HINTS[text];
  if (exact) return translate(locale, exact);
  let m = /^About (.+)\.$/.exec(text);
  if (m) return translate(locale, 'sm.ch.h.about', { v: m[1] });
  m = /^The answer: (.+)\.$/.exec(text);
  if (m) return translate(locale, 'sm.ch.h.answer', { v: m[1] });
  m = /^Your first part must bring the point onto this circle \((.+)\); the second runs along it to the centre\.$/.exec(text);
  if (m) return translate(locale, 'sm.ch.h.two1', { onto: m[1] });
  m = /^(A (?:series|shunt) [RLC]): (clockwise|counter-clockwise) (up|down) the (.+) circle\.$/.exec(text);
  if (m) {
    const idx = EN_KIND_TO_INDEX[m[1]];
    return translate(locale, 'sm.ch.h.two2', {
      kind: idx !== undefined ? kindName(idx, locale) : m[1],
      sense: translate(locale, m[2] === 'clockwise' ? 'sm.ch.h.cw' : 'sm.ch.h.ccw'),
      dir: translate(locale, m[3] === 'up' ? 'sm.ch.h.up' : 'sm.ch.h.down'),
      circle: m[4],
    });
  }
  m = /^The first value: about ([^;.]+)(.*)\.$/.exec(text);
  if (m) {
    let extra = m[2];
    const ex1 = /^; (.+) is an E24 value$/.exec(extra);
    const ex2 = /^; the E24 values beside it are (.+) and (.+)$/.exec(extra);
    if (ex1) extra = translate(locale, 'sm.ch.h.e24Exact', { v: ex1[1] });
    else if (ex2) extra = translate(locale, 'sm.ch.h.e24Pair', { lo: ex2[1], hi: ex2[2] });
    return translate(locale, 'sm.ch.h.firstVal', { val: m[1], extra });
  }
  m = /^The line: about (.+)\.$/.exec(text);
  if (m) return translate(locale, 'sm.ch.h.lineVal', { val: m[1] });
  m = /^Zt: about (.+)\.$/.exec(text);
  if (m) return translate(locale, 'sm.ch.h.ztVal', { val: m[1] });
  return text;
}

// ---------------------------------------------------------------------------------------------------------------
// The list in the Learn section

export interface ChallengeListProps {
  /** The running challenge's kind, '' for none. */
  running: string;
  progress: Progress;
  onStart: (kind: ChallengeKind) => void;
  /** Why the kinds cannot be started now ('' when they can): a lesson with locks fixes the circuit. */
  blocked: string;
}

export function ChallengeList({ running, progress, onStart, blocked }: ChallengeListProps) {
  const { t, locale } = useI18n();
  return (
    <>
      <h3 className={learn.listHead} id="smith-challenges">{t('sm.ch.sectionTitle')} <Why k="challenge" /><span className={learn.space} />
        <span className={learn.headNote}>{t('sm.ch.yourProgress')} <Why k="challenge-progress" /></span></h3>
      {blocked && <p className={learn.note} data-challenge-blocked="">{blocked}</p>}
      <ol className={learn.list} data-challenges="" aria-labelledby="smith-challenges">
        {CHALLENGE_KINDS.map((k) => (
          <li key={k}>
            <button type="button" className={learn.item} data-challenge-kind={k} aria-current={running === k ? 'true' : undefined}
              disabled={!!blocked} onClick={() => onStart(k)}>
              <span className={learn.num}>{k}</span>
              <span className={learn.itemTitle}>{t(`sm.ch.title.${k}` as TranslationKey)}</span>
              <span className={learn.itemIntro}>{t(`sm.ch.intro.${k}` as TranslationKey)}</span>
              <span className={learn.progress} data-progress={k}>{progressText(progress[k], locale)}</span>
            </button>
          </li>
        ))}
      </ol>
    </>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// The panel

/** A part as the strip's tile writes it: its kind and its main value. */
function partText(c: Circuit, i: number, locale: Locale): string {
  const p = c.parts[i], form = formsOf(p.kind)[0];
  return `${kindName(p.kind, locale)} ${formText(form, formValue(form.id, p, c))}`;
}
const circuitText = (c: Circuit, locale: Locale): string =>
  c.parts.map((_, i) => partText(c, i, locale)).join(translate(locale, 'sm.ch.then'));

/**
 * The numbers the visitor typed: one (a comma may be the decimal point) or two ("0.5, −1", "0.5 − j1"); a typographic
 * minus, a j and a unit (dB) are taken. Null when there are none.
 */
export function readNumbers(text: string, two: boolean): number[] | null {
  let t = text.trim().replace(/[−–]/g, '-').replace(/\s*(db|Ω|ohms?)$/i, '');
  if (!two) t = t.replace(',', '.');
  t = t.replace(/j/gi, '');
  const re = /([-+]?)\s*(\d+\.?\d*|\.\d+)(e[-+]?\d+)?/gi;
  const out: number[] = [];
  let m: RegExpExecArray | null;
  let rest = t;
  while ((m = re.exec(t)) !== null) {
    out.push(Number(`${m[1]}${m[2]}${m[3] ?? ''}`));
    rest = rest.replace(m[0], '');
  }
  if (!out.length || /[^\s,;]/.test(rest) || out.length > (two ? 2 : 1)) return null;
  return out;
}

export interface ChallengePanelProps {
  ch: Challenge;
  circuit: Circuit;
  /** A lesson hides the reveal (hints 1–3 stay). */
  noReveal: boolean;
  /** A lesson fixes this problem: no New problem. */
  fixed: boolean;
  onApply: (c: Circuit) => void;
  onNew: (kind: ChallengeKind) => void;
  onClose: () => void;
  /** Hint 1's circles for the chart (solveLayer.ts), null to take them away. */
  onCircles: (shape: CircleShape | null, c: Circuit | null) => void;
  onProgress: (kind: ChallengeKind, e: ProgressEvent) => void;
}

/** The running challenge; the page gives it a new key for every problem. */
export const ChallengePanel = memo(function ChallengePanel({ ch, circuit, noReveal, fixed, onApply, onNew, onClose, onCircles, onProgress }: ChallengePanelProps) {
  const { t, locale } = useI18n();
  const isRead = ch.kind === 'read';
  const two = isRead && (ch.read.ask === 'z' || ch.read.ask === 'y');
  const [draft, setDraft] = useState('');
  const [answer, setAnswer] = useState<number[] | null>(null);
  const [unread, setUnread] = useState(false);
  // The circuit Check was last pressed for: its `why` shows until the circuit changes.
  const [checked, setChecked] = useState<Circuit | null>(null);
  const [ladder, setLadder] = useState<Hint[]>([]);
  const [shown, setShown] = useState(0);
  const head = useRef<HTMLHeadingElement>(null);
  const lastHint = useRef<HTMLLIElement>(null);
  // A problem that opens reached (a link with a reaching circuit) is not counted as solved: only reaching it here is.
  const solved = useRef<boolean | null>(null);
  if (solved.current === null) solved.current = !isRead && reached(ch, circuit).reached;
  const revealed = shown >= 4;
  const max = noReveal ? 3 : 4;

  const state = useMemo(() => reached(ch, circuit, answer ?? undefined), [ch, circuit, answer]);
  // Solved once per problem, unless the reveal was shown first (then it counts as revealed only).
  useEffect(() => {
    if (state.reached && !solved.current && !revealed) {
      solved.current = true;
      onProgress(ch.kind, { t: 'solved', parts: circuit.parts.length });
    }
  }, [state.reached, revealed, ch, circuit, onProgress]);

  // The panel opens with the focus on its heading (the page scrolls the tool into view), as the guide does.
  useEffect(() => {
    const side = head.current?.closest('aside');
    if (side && side.scrollTop > 0) side.scrollTop = 0;
    head.current?.focus({ preventScroll: true });
  }, []);
  const moved = useRef(false);
  useEffect(() => {
    if (moved.current) lastHint.current?.focus({ preventScroll: true });
    moved.current = false;
  }, [shown]);

  const hint = () => {
    if (shown >= max) return;
    // The ladder follows the visitor's parts as they are now (their two parts when they fit), so it is made per press.
    const next = hintLadder(ch, circuit);
    setLadder(next);
    if (shown === 0) {
      const h = next[0];
      onCircles(h.circles && h.circleNode >= 0 ? { circleNode: h.circleNode, circles: h.circles, unknowns: [], status: 'hint' } : null, circuit);
    }
    onProgress(ch.kind, shown === 3 ? { t: 'revealed' } : { t: 'hint' });
    moved.current = true;
    setShown(shown + 1);
  };
  const check = (e: React.FormEvent) => {
    e.preventDefault();
    if (isRead) {
      const v = readNumbers(draft, two);
      setUnread(v === null);
      setAnswer(v);
    }
    setChecked(circuit);
  };

  const why = !state.reached && (isRead ? answer !== null || unread : checked === circuit)
    ? (unread ? t(two ? 'sm.ch.typeTwo' : 'sm.ch.typeOne') : localizedWhy(state.why, locale)) : '';
  const revealList = (list: Revealed[]) => (
    <ol className={learn.reveal} data-challenge-revealed="">
      {list.map((r, j) => (
        <li key={j}>
          <span className={learn.revealText} data-challenge-solution={j}>{circuitText(r.circuit, locale)}</span>
          <button type="button" className={`${styles.button} ${learn.btn}`} data-challenge-apply={j} onClick={() => onApply(r.circuit)}>{t('sm.ch.apply')}</button>
          {r.standard && r.standard.length > 0 && (
            <ul className={learn.standard}>
              {r.standard.map((sv, k) => (
                <li key={k}>
                  <span className={learn.revealText}>E24: {circuitText(sv.circuit, locale)}</span>
                  <button type="button" className={`${styles.button} ${learn.btn}`} data-challenge-apply-std={`${j}.${k}`} onClick={() => onApply(sv.circuit)}>{t('sm.ch.apply')}</button>
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ol>
  );

  const code = challengeText(ch.kind, ch.seed);
  return (
    <section className={learn.guide} aria-labelledby="smith-challenge" data-challenge={code}
      data-reached={state.reached ? '' : undefined} data-hints={shown}>
      <h2 className={learn.head} id="smith-challenge" ref={head} tabIndex={-1}>
        {t('sm.ch.panelHead', { title: t(`sm.ch.title.${ch.kind}` as TranslationKey) })} <Why k="challenge" />
      </h2>
      <p className={learn.step} data-challenge-task="">
        <span className={learn.stepNo}>{t('sm.ch.problemNote', { code })}</span>
        {localizedTask(ch, locale)}
      </p>
      <form className={learn.answer} onSubmit={check} data-challenge-form="">
        {isRead && (
          <>
            <span className={learn.answerHead}><label htmlFor="smith-challenge-answer">{t('sm.ch.yourAnswer')}{two ? t('sm.ch.twoNumsSuffix') : ''}</label></span>
            <input id="smith-challenge-answer" className={styles.input} value={draft} inputMode={two ? 'text' : 'decimal'} autoComplete="off" spellCheck={false}
              aria-invalid={(!!why) || undefined} aria-describedby="smith-challenge-state" data-challenge-answer=""
              onChange={(e) => setDraft(e.target.value)} />
          </>
        )}
        <span className={learn.checkRow}>
          <button type="submit" className={`${styles.button} ${learn.btn}`} data-challenge-check="">{t('sm.ch.check')}</button>
          <Why k="challenge-check" />
        </span>
      </form>
      <p className={learn.state} id="smith-challenge-state" role="status" data-done={state.reached ? '' : undefined} data-challenge-state="">
        {state.reached
          ? <><span className={learn.tick} aria-hidden="true">✓</span> {t(revealed ? 'sm.ch.reachedRevealed' : 'sm.ch.reached')}</>
          : why || t('sm.ch.notYet')}
      </p>
      <div className={learn.hintRow}>
        <button type="button" className={`${styles.button} ${learn.btn}`} data-challenge-hint="" disabled={shown >= max} onClick={hint}>
          {shown >= max ? t('sm.ch.noMoreHints') : shown === 3 ? t('sm.ch.reveal') : t('sm.ch.hintOf', { n: shown + 1 })}
        </button>
        <Why k="challenge-hint" />
        {!noReveal && <Why k="challenge-reveal" />}
      </div>
      {shown > 0 && (
        <ol className={learn.hints} data-challenge-hints="">
          {ladder.slice(0, shown).map((h, k) => (
            <li key={k} ref={k === shown - 1 ? lastHint : undefined} tabIndex={-1} data-hint={k + 1}>
              <strong>{t(`sm.ch.ladder.${k}` as TranslationKey)}:</strong> {localizedHintText(h.text, locale)}
              {k === 3 && h.revealed && revealList(h.revealed)}
              {k === 3 && h.answer && (
                <span className={learn.revealText} data-challenge-answer-shown="" data-equation={h.equation}>
                  {' '}{t('sm.ch.theAnswer', { vals: h.answer.map((v) => String(Number(v.toPrecision(4))).replace('-', '−')).join(', ') })}
                </span>
              )}
            </li>
          ))}
        </ol>
      )}
      <div className={learn.bar}>
        {!fixed && (
          <button type="button" className={`${styles.button} ${learn.btn} ${learn.next}`} data-challenge-new="" onClick={() => onNew(ch.kind)}>{t('sm.ch.newProblem')}</button>
        )}
        <span className={learn.space} />
        <button type="button" className={`${styles.button} ${learn.btn}`} data-challenge-close="" onClick={onClose}
          aria-label={t('sm.ch.closeAria')}>{t('sm.ch.close')}</button>
      </div>
    </section>
  );
});
