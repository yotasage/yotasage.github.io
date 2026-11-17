// M9.1a: a polite live region that speaks only once things have settled. It takes `text` (or what `read()` returns
// when it fires) after nothing has re-rendered it for `delay` ms, so a drag, a hover over a plot or a probe, a sweep's or
// a full-wave run's progress are not read out frame by frame or message by message, and a keyboard step is read once.
// The first settled text is not spoken (it is on the page already); an empty text is never spoken. With `within` (a
// selector) it speaks only when the visitor last acted there (the focus, or the last pointer or key press, inside it),
// so an edit of the trace does not also read out the via's results that follow from it. The region is visually hidden
// (`.calm`); the visible text beside it is not live.

import React, { useEffect, useRef, useState } from 'react';

import base from '../../styles/EmSim.module.css';

interface Props {
  text?: string;
  read?: () => string;
  delay?: number;
  within?: string;
  name?: string; // data-calm, for the harness
}

// Where the visitor last pressed a pointer or a key (one listener for the page, capturing).
let lastAct: Element | null = null;
let listening = false;
const listen = () => {
  if (listening || typeof window === 'undefined') return;
  listening = true;
  const note = (e: Event) => { lastAct = e.target instanceof Element ? e.target : null; };
  window.addEventListener('pointerdown', note, true);
  window.addEventListener('keydown', note, true);
};

export default function Calm({ text, read, delay = 800, within, name = '' }: Props) {
  const [said, setSaid] = useState('');
  const last = useRef<string | null>(null);
  const src = useRef({ text, read, within });
  src.current = { text, read, within };
  useEffect(listen, []);
  // No dependency list: every render of the owner (a new value, a drag frame, a progress message) restarts the wait.
  useEffect(() => {
    const t = setTimeout(() => {
      const { text: tx, read: rd, within: w } = src.current;
      const now = (rd ? rd() : tx ?? '').replace(/\s+/g, ' ').trim();
      if (last.current === null) { if (now) last.current = now; return; }
      if (!now || now === last.current) return;
      last.current = now;
      if (w && !(document.activeElement?.closest(w) || lastAct?.closest(w))) return;
      setSaid(now);
    }, delay);
    return () => clearTimeout(t);
  });
  return <span className={base.calm} role="status" data-calm={name}>{said}</span>;
}

/** The text of an element as read aloud in one line: its rendered lines joined by commas. */
export const lineOf = (el: Element | null | undefined): string => ((el as HTMLElement | null)?.innerText ?? '').split(/\s*\n+\s*/).filter(Boolean).join(', ');
