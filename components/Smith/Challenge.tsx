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
import { CHALLENGE_KINDS, CHALLENGE_TITLES, challengeTask, challengeText, hintLadder, reached } from '../../lib/smith/challenge';
import type { Challenge, ChallengeKind, Hint, Revealed } from '../../lib/smith/challenge';
import { KIND_NAMES, formValue, formsOf } from '../../lib/smith/state';
import type { Circuit } from '../../lib/smith/state';
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

const progressText = (p: KindProgress): string =>
  `tried ${p.tried} · solved ${p.solved} · revealed ${p.revealed} · hints ${p.hints}${p.fewest ? ` · fewest parts ${p.fewest}` : ''}`;

/** What each kind allows, in a few words under its title. */
const KIND_INTRO: Readonly<Record<ChallengeKind, string>> = {
  two: 'A random load to |Γ| ≤ 0.05 with at most two L or C.',
  stub: 'A line and one open or short stub, both of Zc = Z0.',
  qw: 'A λ/4 transformer, after a line for a complex load.',
  e24: 'Two L or C, every one an E24 value, to the drawn |Γ|.',
  read: 'Read z, y, |Γ|, VSWR or return loss of a point.',
};

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
  return (
    <>
      <h3 className={learn.listHead} id="smith-challenges">Challenges <Why k="challenge" /><span className={learn.space} />
        <span className={learn.headNote}>Your progress <Why k="challenge-progress" /></span></h3>
      {blocked && <p className={learn.note} data-challenge-blocked="">{blocked}</p>}
      <ol className={learn.list} data-challenges="" aria-labelledby="smith-challenges">
        {CHALLENGE_KINDS.map((k) => (
          <li key={k}>
            <button type="button" className={learn.item} data-challenge-kind={k} aria-current={running === k ? 'true' : undefined}
              disabled={!!blocked} onClick={() => onStart(k)}>
              <span className={learn.num}>{k}</span>
              <span className={learn.itemTitle}>{CHALLENGE_TITLES[k]}</span>
              <span className={learn.itemIntro}>{KIND_INTRO[k]}</span>
              <span className={learn.progress} data-progress={k}>{progressText(progress[k])}</span>
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
function partText(c: Circuit, i: number): string {
  const p = c.parts[i], form = formsOf(p.kind)[0];
  return `${KIND_NAMES[p.kind]} ${formText(form, formValue(form.id, p, c))}`;
}
const circuitText = (c: Circuit): string => c.parts.map((_, i) => partText(c, i)).join(', then ');

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

const LADDER = ['The circle', 'The part and its way', 'The first value', 'Reveal'];

/** The running challenge; the page gives it a new key for every problem. */
export const ChallengePanel = memo(function ChallengePanel({ ch, circuit, noReveal, fixed, onApply, onNew, onClose, onCircles, onProgress }: ChallengePanelProps) {
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
    ? (unread ? (two ? 'Type two numbers.' : 'Type a number.') : state.why) : '';
  const revealList = (list: Revealed[]) => (
    <ol className={learn.reveal} data-challenge-revealed="">
      {list.map((r, j) => (
        <li key={j}>
          <span className={learn.revealText} data-challenge-solution={j}>{circuitText(r.circuit)}</span>
          <button type="button" className={`${styles.button} ${learn.btn}`} data-challenge-apply={j} onClick={() => onApply(r.circuit)}>Apply</button>
          {r.standard && r.standard.length > 0 && (
            <ul className={learn.standard}>
              {r.standard.map((sv, k) => (
                <li key={k}>
                  <span className={learn.revealText}>E24: {circuitText(sv.circuit)}</span>
                  <button type="button" className={`${styles.button} ${learn.btn}`} data-challenge-apply-std={`${j}.${k}`} onClick={() => onApply(sv.circuit)}>Apply</button>
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ol>
  );

  return (
    <section className={learn.guide} aria-labelledby="smith-challenge" data-challenge={challengeText(ch.kind, ch.seed)}
      data-reached={state.reached ? '' : undefined} data-hints={shown}>
      <h2 className={learn.head} id="smith-challenge" ref={head} tabIndex={-1}>
        Challenge · {CHALLENGE_TITLES[ch.kind]} <Why k="challenge" />
      </h2>
      <p className={learn.step} data-challenge-task="">
        <span className={learn.stepNo}>Problem {challengeText(ch.kind, ch.seed)}: the link holds it</span>
        {challengeTask(ch)}
      </p>
      <form className={learn.answer} onSubmit={check} data-challenge-form="">
        {isRead && (
          <>
            <span className={learn.answerHead}><label htmlFor="smith-challenge-answer">Your answer{two ? ' (two numbers)' : ''}</label></span>
            <input id="smith-challenge-answer" className={styles.input} value={draft} inputMode={two ? 'text' : 'decimal'} autoComplete="off" spellCheck={false}
              aria-invalid={(!!why) || undefined} aria-describedby="smith-challenge-state" data-challenge-answer=""
              onChange={(e) => setDraft(e.target.value)} />
          </>
        )}
        <span className={learn.checkRow}>
          <button type="submit" className={`${styles.button} ${learn.btn}`} data-challenge-check="">Check</button>
          <Why k="challenge-check" />
        </span>
      </form>
      <p className={learn.state} id="smith-challenge-state" role="status" data-done={state.reached ? '' : undefined} data-challenge-state="">
        {state.reached
          ? <><span className={learn.tick} aria-hidden="true">✓</span> Reached{revealed ? ': counted as revealed, not solved.' : '.'}</>
          : why || 'Not yet.'}
      </p>
      <div className={learn.hintRow}>
        <button type="button" className={`${styles.button} ${learn.btn}`} data-challenge-hint="" disabled={shown >= max} onClick={hint}>
          {shown >= max ? 'No more hints' : shown === 3 ? 'Reveal' : `Hint ${shown + 1} of 3`}
        </button>
        <Why k="challenge-hint" />
        {!noReveal && <Why k="challenge-reveal" />}
      </div>
      {shown > 0 && (
        <ol className={learn.hints} data-challenge-hints="">
          {ladder.slice(0, shown).map((h, k) => (
            <li key={k} ref={k === shown - 1 ? lastHint : undefined} tabIndex={-1} data-hint={k + 1}>
              <strong>{LADDER[k]}:</strong> {h.text}
              {k === 3 && h.revealed && revealList(h.revealed)}
              {k === 3 && h.answer && (
                <span className={learn.revealText} data-challenge-answer-shown="" data-equation={h.equation}>
                  {' '}The answer: {h.answer.map((v) => String(Number(v.toPrecision(4))).replace('-', '−')).join(', ')}.
                </span>
              )}
            </li>
          ))}
        </ol>
      )}
      <div className={learn.bar}>
        {!fixed && (
          <button type="button" className={`${styles.button} ${learn.btn} ${learn.next}`} data-challenge-new="" onClick={() => onNew(ch.kind)}>New problem</button>
        )}
        <span className={learn.space} />
        <button type="button" className={`${styles.button} ${learn.btn}`} data-challenge-close="" onClick={onClose}
          aria-label="Close the challenge">Close</button>
      </div>
    </section>
  );
});
