// The derivations of the Smith chart (step M5.3, docs/smith-chart/learning.md §4): how an equation follows, one step at
// a time with its one-line reason, from the registry's steps (components/Smith/derive.ts), in the shared dialog of
// components/Equations/DerivationDialog.tsx (shared since EM step M4.3a). It opens from an equation of the Equations
// panel (its "Derive" button, or Enter on the focused row) with the panel's subject, and from the theory's "derive"
// links with the place the theory uses.
//
// Variables are linked to the page as the panel's are (M5.2, mathLink.ts): hover, a tap that stays, or ← and → in a
// focused step light the part, node or readout row behind the dialog. Why a dialog (docs/smith-chart/notes-M5.3.md):
// it is the one place both the panel and the theory open, it never pushes the readout or the circuit down, and being
// modal it fixes the numbers it shows: nothing on the page can be dragged while it is open, so it costs drag frames
// nothing, and nothing of it renders until it is opened.

import React, { useEffect, useMemo, useRef, useState } from 'react';

import DerivationDialog, { reasonHtml, sidesHtml } from '../Equations/DerivationDialog';
import type { DerivationLink, DerivationView } from '../Equations/DerivationDialog';
import type { Circuit } from '../../lib/smith/network';
import { derivation, theorySubject } from './derive';
import { mathLink } from './mathLink';
import { MATH_CLASSES } from './MathPanel';
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
  useEffect(() => {
    opener = (r) => setReq((was) => ({ ...r, n: (was?.n ?? 0) + 1 }));
    return () => { opener = null; };
  }, []);

  const d = useMemo(() => {
    if (!req) return null;
    const subject = req.subject === undefined ? theorySubject(circuit, req.id) : req.subject;
    return derivation(circuit, req.id, subject, digits, req.gr, req.gi);
  }, [req, circuit, digits]);
  const view = useMemo<DerivationView | null>(() => d && {
    id: d.id,
    title: d.title,
    goal: sidesHtml(d.tex, d.targets, '', MATH_CLASSES),
    meta: (
      <>
        {d.assumptions.length > 0 && <>Assumes {d.assumptions.join(', ')}. </>}
        {d.owner && <>Finishes the owner’s notes, {d.owner}. </>}
        {d.source ? <>Numbers: {d.source}, where every quantity of a step has a value.</> : <>Symbols only: no numbers of your circuit fit these steps.</>}
      </>
    ),
    steps: d.steps.map((s) => ({
      sym: sidesHtml(s.tex, d.targets, '', MATH_CLASSES),
      why: reasonHtml(s.why, d.targets, MATH_CLASSES),
      nums: s.nums.length ? sidesHtml(s.nums, [], s.value, MATH_CLASSES) : '',
      sides: JSON.stringify(s.sides),
    })),
    bind: JSON.stringify(d.binding),
  }, [d]);

  // ← and → in a focused step: its variables' targets one by one; Escape (a first press) ends that.
  const stop = useRef(-1);
  const link = useMemo<DerivationLink>(() => ({
    opened: (el) => { mathLink.extra = el; },
    closed: () => {
      mathLink.unpin();
      mathLink.point('hover', '');
      mathLink.point('focus', '');
      mathLink.extra = null;
    },
    revealed: (li) => mathLink.mark(li),
    escape: () => {
      if (stop.current < 0 && !mathLink.pinned) return false;
      stop.current = -1;
      mathLink.unpin();
      mathLink.point('focus', '');
      return true;
    },
    stepKey: (e) => {
      if (e.target !== e.currentTarget) return;
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      e.preventDefault();
      const s = [...new Set([...e.currentTarget.querySelectorAll('[data-mt]')].map((x) => x.getAttribute('data-mt') ?? ''))];
      if (!s.length) return;
      const step = e.key === 'ArrowRight' ? 1 : -1;
      stop.current = stop.current < 0 ? (step > 0 ? 0 : s.length - 1) : (stop.current + step + s.length) % s.length;
      mathLink.unpin();
      mathLink.point('focus', s[stop.current]);
    },
    stepFocus: () => { stop.current = -1; },
    stepBlur: () => mathLink.point('focus', ''),
    body: {
      onPointerOver: (e) => { if (e.pointerType !== 'touch') mathLink.point('hover', tokensAt(e.target)); },
      onPointerLeave: () => mathLink.point('hover', ''),
      onClick: (e) => { if (!(e.target as Element).closest('button')) mathLink.point('pin', tokensAt(e.target)); },
    },
  }), []);

  return <DerivationDialog view={view} opening={req?.n ?? 0} from={req?.from ?? null} onClosed={() => setReq(null)} titleId="smith-derive-title" link={link} />;
}

export default React.memo(Derivation);
