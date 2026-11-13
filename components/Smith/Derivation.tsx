// The derivations of the Smith chart (step M5.3, docs/smith-chart/learning.md §4): a modal dialog that shows how an
// equation follows, one step at a time with its one-line reason ("Next step", "Show all", "Back"), from the registry's
// steps (components/Smith/derive.ts). It opens from an equation of the Equations panel (its "Derive" button, or Enter on
// the focused row) with the panel's subject, and from the theory's "derive" links with the place the theory uses.
//
// Variables are linked to the page as the panel's are (M5.2, mathLink.ts): hover, a tap that stays, or ← and → in a
// focused step light the part, node or readout row behind the dialog. Why a dialog (docs/smith-chart/notes-M5.3.md):
// it is the one place both the panel and the theory open, it never pushes the readout or the circuit down, and being
// modal it fixes the numbers it shows: nothing on the page can be dragged while it is open, so it costs drag frames
// nothing, and nothing of it renders until it is opened.

import React, { useEffect, useMemo, useRef, useState } from 'react';

import type { Circuit } from '../../lib/smith/network';
import css from '../../styles/SmithDerive.module.css';
import { derivation, theorySubject } from './derive';
import { mathLink } from './mathLink';
import { mathHtml } from './MathPanel';
import type { Subject } from './mathRows';

interface Request {
  id: string;
  /** The panel's subject; undefined: the theory's place for this equation (theorySubject). */
  subject: Subject | undefined;
  gr: number;
  gi: number;
  from: HTMLElement | null;
}

let opener: ((r: Request) => void) | null = null;

/** Opens the derivation of a registry entry; `from` gets the focus back when it closes. */
export function openDerivation(id: string, from: HTMLElement | null, subject?: Subject, gr = NaN, gi = NaN): void {
  opener?.({ id, subject, gr, gi, from });
}

/** The target tokens under a pointer or a tap ('' off a variable). */
const tokensAt = (target: EventTarget | null): string => (target as Element | null)?.closest?.('[data-mt]')?.getAttribute('data-mt') ?? '';

function Derivation({ circuit, digits }: { circuit: Circuit; digits: number }) {
  const [req, setReq] = useState<(Request & { n: number }) | null>(null);
  const [shown, setShown] = useState(1);
  useEffect(() => {
    opener = (r) => { setShown(1); setReq((was) => ({ ...r, n: (was?.n ?? 0) + 1 })); };
    return () => { opener = null; };
  }, []);

  const d = useMemo(() => {
    if (!req) return null;
    const subject = req.subject === undefined ? theorySubject(circuit, req.id) : req.subject;
    return derivation(circuit, req.id, subject, digits, req.gr, req.gi);
  }, [req, circuit, digits]);
  const html = useMemo(() => d && {
    eq: mathHtml(d.tex, d.targets),
    steps: d.steps.map((s) => ({
      sym: mathHtml(s.tex, d.targets),
      nums: s.nums ? mathHtml(s.nums) : '',
      value: s.value ? mathHtml(s.value) : '',
    })),
  }, [d]);
  const n = d?.steps.length ?? 0;

  const dlg = useRef<HTMLDialogElement>(null);
  const next = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLOListElement>(null);
  useEffect(() => {
    const el = dlg.current;
    if (!req || !el) return;
    if (!el.open) el.showModal();
    mathLink.extra = el;
    next.current?.focus();
    el.querySelector('[data-derive-body]')?.scrollTo(0, 0);
  }, [req?.n]);
  // A new step: brought into view, and lit if what is pointed at is in it.
  const revealed = useRef(1);
  useEffect(() => {
    const li = list.current?.children[shown - 1] as HTMLElement | undefined;
    if (li && shown > revealed.current) { li.scrollIntoView({ block: 'nearest' }); mathLink.mark(li); }
    revealed.current = shown;
  }, [shown]);

  const onClose = () => {
    mathLink.unpin();
    mathLink.point('hover', '');
    mathLink.point('focus', '');
    mathLink.extra = null;
    const from = req?.from;
    setReq(null);
    if (from?.isConnected) from.focus();
  };
  // ← and → in a focused step: its variables' targets one by one; Escape (a first press) ends that.
  const stop = useRef(-1);
  const onStepKey = (e: React.KeyboardEvent<HTMLLIElement>) => {
    if (e.target !== e.currentTarget) return;
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const s = [...new Set([...e.currentTarget.querySelectorAll('[data-mt]')].map((x) => x.getAttribute('data-mt') ?? ''))];
    if (!s.length) return;
    const step = e.key === 'ArrowRight' ? 1 : -1;
    stop.current = stop.current < 0 ? (step > 0 ? 0 : s.length - 1) : (stop.current + step + s.length) % s.length;
    mathLink.unpin();
    mathLink.point('focus', s[stop.current]);
  };
  const go = (k: number) => setShown(Math.max(1, Math.min(n, k)));

  return (
    <dialog ref={dlg} className={css.dialog} aria-labelledby="smith-derive-title" onClose={onClose} data-derive={d?.id ?? ''}
      data-derive-shown={shown} data-derive-bind={d ? JSON.stringify(d.binding) : ''}
      onKeyDown={(e) => {
        // The page's own keys (undo, the chart's) stay out while the dialog is open.
        e.stopPropagation();
        if (e.key === 'Escape' && (stop.current >= 0 || mathLink.pinned)) {
          e.preventDefault();
          stop.current = -1;
          mathLink.unpin();
          mathLink.point('focus', '');
        }
      }}>
      {d && html && (
        <>
          <div className={css.head}>
            <h2 className={css.title} id="smith-derive-title">Derivation: {d.title}</h2>
            <button type="button" className={css.close} data-derive-close="" onClick={() => dlg.current?.close()} aria-label="Close the derivation">Close</button>
          </div>
          <div className={css.body} data-derive-body=""
            onPointerOver={(e) => { if (e.pointerType !== 'touch') mathLink.point('hover', tokensAt(e.target)); }}
            onPointerLeave={() => mathLink.point('hover', '')}
            onClick={(e) => { if (!(e.target as Element).closest('button')) mathLink.point('pin', tokensAt(e.target)); }}>
            <div className={css.goal} data-derive-goal="" dangerouslySetInnerHTML={{ __html: html.eq }} />
            <p className={css.meta}>
              {d.assumptions.length > 0 && <>Assumes {d.assumptions.join(', ')}. </>}
              {d.owner && <>Finishes the owner’s notes, {d.owner}. </>}
              {d.source ? <>Numbers: {d.source}, where every quantity of a step has a value.</> : <>Symbols only: no numbers of your circuit fit these steps.</>}
            </p>
            <ol className={css.steps} ref={list} aria-live="polite">
              {d.steps.slice(0, shown).map((s, k) => (
                <li key={k} className={css.step} tabIndex={0} data-derive-step={k} data-derive-sides={JSON.stringify(s.sides)}
                  aria-label={`Step ${k + 1} of ${n}`} onKeyDown={onStepKey}
                  onFocus={(e) => { if (e.target === e.currentTarget) stop.current = -1; }}
                  onBlur={(e) => { if (e.target === e.currentTarget) mathLink.point('focus', ''); }}>
                  <span className={css.no} aria-hidden="true">{k + 1}</span>
                  <div className={css.math} data-derive-sym="" dangerouslySetInnerHTML={{ __html: html.steps[k].sym }} />
                  <p className={css.why} data-derive-why="">{s.why}</p>
                  {s.nums && (
                    <div className={css.nums} data-derive-nums="">
                      <span className={css.numsLabel}>With your numbers</span>
                      <div className={css.math} dangerouslySetInnerHTML={{ __html: html.steps[k].nums }} />
                      {s.value && <div className={css.math} data-derive-value="" dangerouslySetInnerHTML={{ __html: html.steps[k].value }} />}
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

export default React.memo(Derivation);
