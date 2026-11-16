// The derivation dialog shared by the Smith chart and the EM simulation (Smith step M5.3; made shared by EM step M4.3a,
// docs/em-sim/notes-M0.5.md item 1b): a modal dialog that shows how an equation follows, one step at a time with its
// one-line reason ("Next step", "Show all", "Back"), on the right of the screen and the whole screen under 600 px; the
// focus goes back to what opened it. It takes a built derivation as data (`DerivationView`: the equation and each
// step as MathML, from `sidesHtml` and `reasonHtml`); what the numbers are and how variables link to the page stay with
// the page (Smith: components/Smith/Derivation.tsx with derive.ts and mathLink.ts; EM: components/EmSim/EqPanel.tsx).
// Being modal it fixes the numbers it shows, and nothing of it renders until it is opened.

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';

import css from '../../styles/Equations.module.css';
import { mathHtml } from './math';
import { markWide, watchWide } from './wide';

/** A step as the dialog prints it: its sides, its reason and, where every quantity has a value, its numbers. */
export interface DerivationStepView {
  sym: string;
  why: string;
  /** '' when the step has no numbers. */
  nums: string;
  /** The page's own record of the step for its harness (data-derive-sides). */
  sides?: string;
}

export interface DerivationView {
  id: string;
  title: string;
  /** The equation derived (sidesHtml). */
  goal: string;
  /** Assumptions and where the numbers come from, under the equation. */
  meta: React.ReactNode;
  steps: readonly DerivationStepView[];
  /** The binding the numbers come from, for the page's harness (data-derive-bind). */
  bind?: string;
}

/** What a page links to the dialog (the Smith chart lights its parts from the variables); every member optional. */
export interface DerivationLink {
  opened?(dialog: HTMLDialogElement): void;
  closed?(): void;
  /** A step newly shown (Next step, Show all). */
  revealed?(step: HTMLElement): void;
  /** Escape pressed: true when the page used it (the dialog then stays open). */
  escape?(): boolean;
  stepKey?(e: React.KeyboardEvent<HTMLLIElement>): void;
  stepFocus?(): void;
  stepBlur?(): void;
  /** Handlers on the scrolling body. */
  body?: React.HTMLAttributes<HTMLDivElement>;
}

const LINE = '[data-derive-line]';
const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;' };

/**
 * An equation as the dialog prints it: each side a line of its own ("= …" from the second on) in a row that wraps, so
 * a narrow screen breaks it between sides; `tail` (the shared value) follows last. `classes`: the page's sentinel
 * colours (math.ts).
 */
export function sidesHtml(sides: readonly string[], targets: readonly string[] = [], tail = '', classes: readonly string[] = []): string {
  let h = '';
  for (let k = 0; k < sides.length; k++) h += `<span class="${css.line}" data-derive-line="">${mathHtml(k ? `{}= ${sides[k]}` : sides[k], targets, false, classes)}</span>`;
  if (tail) h += `<span class="${css.line}" data-derive-line="" data-derive-value="">${mathHtml(tail, [], false, classes)}</span>`;
  return h;
}

/** A reason: text and TeX alternating (text first), the text escaped, the maths inline. */
export function reasonHtml(why: readonly string[], targets: readonly string[] = [], classes: readonly string[] = []): string {
  let h = '';
  for (let k = 0; k < why.length; k++) h += k % 2 ? mathHtml(why[k], targets, true, classes) : why[k].replace(/[&<>]/g, (c) => ESC[c]);
  return h;
}

interface Props {
  /** The derivation shown; null: the dialog is closed and empty. */
  view: DerivationView | null;
  /** Counts the openings: a new value opens the dialog at its first step with the focus on "Next step". */
  opening: number;
  /** Gets the focus back when the dialog closes. */
  from: HTMLElement | null;
  /** After the dialog has closed (the page drops its view). */
  onClosed: () => void;
  titleId: string;
  link?: DerivationLink;
}

function DerivationDialog({ view, opening, from, onClosed, titleId, link }: Props) {
  const [shown, setShown] = useState(1);
  const [at, setAt] = useState(opening);
  if (at !== opening) { setAt(opening); setShown(1); }
  const n = view?.steps.length ?? 0;

  const dlg = useRef<HTMLDialogElement>(null);
  const next = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLOListElement>(null);
  const body = useRef<HTMLDivElement>(null);
  // A side wider than the dialog even on a line of its own scrolls sideways with a Tab stop (wide.ts): checked after
  // every render and when the dialog's width changes.
  useLayoutEffect(() => { if (body.current) markWide(body.current, LINE); });
  useEffect(() => (body.current ? watchWide(body.current, LINE) : undefined), [view !== null]);
  useEffect(() => {
    const el = dlg.current;
    if (!view || !el || !opening) return;
    if (!el.open) el.showModal();
    link?.opened?.(el);
    next.current?.focus();
    el.querySelector('[data-derive-body]')?.scrollTo(0, 0);
    // a new opening only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opening]);
  // A new step: brought into view (and handed to the page).
  const revealed = useRef(1);
  useEffect(() => {
    const li = list.current?.children[shown - 1] as HTMLElement | undefined;
    if (li && shown > revealed.current) { li.scrollIntoView({ block: 'nearest' }); link?.revealed?.(li); }
    revealed.current = shown;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown]);

  const onClose = () => {
    // The close event comes after the dialog is shut: opened again meanwhile, it belongs to the new opening.
    if (dlg.current?.open) return;
    link?.closed?.();
    onClosed();
    if (from?.isConnected) from.focus();
  };
  const go = (k: number) => setShown(Math.max(1, Math.min(n, k)));

  return (
    <dialog ref={dlg} className={css.dialog} aria-labelledby={titleId} onClose={onClose} data-derive={view?.id ?? ''}
      data-derive-shown={shown} data-derive-bind={view?.bind ?? ''}
      onKeyDown={(e) => {
        // The page's own keys (undo, the chart's, the panel's Escape) stay out while the dialog is open.
        e.stopPropagation();
        if (e.key === 'Escape' && link?.escape?.()) e.preventDefault();
      }}>
      {view && (
        <>
          <div className={css.head}>
            <h2 className={css.title} id={titleId}>Derivation: {view.title}</h2>
            <button type="button" className={css.close} data-derive-close="" onClick={() => dlg.current?.close()} aria-label="Close the derivation">Close</button>
          </div>
          <div className={css.body} data-derive-body="" ref={body} {...link?.body}>
            <div className={`${css.eqn} ${css.goal}`} data-derive-goal="" dangerouslySetInnerHTML={{ __html: view.goal }} />
            <p className={css.meta}>{view.meta}</p>
            <ol className={css.steps} ref={list} aria-live="polite">
              {view.steps.slice(0, shown).map((s, k) => (
                <li key={k} className={css.step} tabIndex={0} data-derive-step={k} data-derive-sides={s.sides}
                  aria-label={`Step ${k + 1} of ${n}`} onKeyDown={link?.stepKey}
                  onFocus={(e) => { if (e.target === e.currentTarget) link?.stepFocus?.(); }}
                  onBlur={(e) => { if (e.target === e.currentTarget) link?.stepBlur?.(); }}>
                  <span className={css.no} aria-hidden="true">{k + 1}</span>
                  <div className={`${css.eqn} ${css.math}`} data-derive-sym="" dangerouslySetInnerHTML={{ __html: s.sym }} />
                  <p className={css.why} data-derive-why="" dangerouslySetInnerHTML={{ __html: s.why }} />
                  {s.nums && (
                    <div className={css.nums} data-derive-nums="">
                      <span className={css.numsLabel}>With your numbers</span>
                      <div className={`${css.eqn} ${css.math}`} dangerouslySetInnerHTML={{ __html: s.nums }} />
                    </div>
                  )}
                </li>
              ))}
            </ol>
          </div>
          <div className={css.controls}>
            <button type="button" data-derive-back="" aria-disabled={shown <= 1} onClick={() => go(shown - 1)}>Back</button>
            <button type="button" ref={next} className={css.primary} data-derive-next="" aria-disabled={shown >= n} onClick={() => go(shown + 1)}>Next step</button>
            <button type="button" data-derive-all="" aria-disabled={shown >= n} onClick={() => go(n)}>Show all</button>
            <span className={css.count} data-derive-count="">Step {shown} of {n}</span>
          </div>
        </>
      )}
    </dialog>
  );
}

export default React.memo(DerivationDialog);
