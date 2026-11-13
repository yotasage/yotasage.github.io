// The short lines of the Smith chart's tool (step M3.5c; texts in whys.ts): `WhyLine` is a quiet line with its
// "→ theory" link, `Why` a small info button whose bubble holds the line and the link, for places with no room for a
// line (labels, table rows, the toolbar). The bubble opens by click, tap, Enter or Space (never on hover), closes by
// Escape, a second press, a press elsewhere or focus leaving it, and only one is open at a time. It is rendered only
// while open, with position: fixed (the side panel's scrolling box would clip it), placed on opening and on a scroll
// while open; none of this runs while the chart is dragged or zoomed.
//
// Following a link calls `followTopic`: the Theory opens the topic (also when the link's hash is already the page's),
// puts the focus on its heading and offers a way back to the element the link was followed from.

import React, { useEffect, useId, useRef, useState } from 'react';

import styles from '../../styles/Smith.module.css';
import { WHYS } from './whys';

type Follow = (topic: string, from: HTMLElement | null) => void;
let follower: Follow | null = null;
/** The Theory registers here (null when it unmounts). */
export const onFollowTopic = (f: Follow | null): void => { follower = f; };
/** A "→ theory" link was followed from `from`. */
export const followTopic = (topic: string, from: HTMLElement | null): void => { follower?.(topic, from); };

let closeOpen: (() => void) | null = null;

const BUBBLE_W = 288, MARGIN = 12, GAP = 6;

/** `topic` replaces the line's own topic where it depends on the context (the guide's step, M6.3a). */
export function Why({ k, label, topic: topicFor }: { k: string; label?: string; topic?: string }) {
  const why = WHYS[k];
  if (!why) throw new Error(`Unknown short line "${k}" in the Smith chart.`);
  const topic = topicFor ?? why.topic;
  const [at, setAt] = useState<React.CSSProperties | null>(null);
  const wrap = useRef<HTMLSpanElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const id = `why-${useId().replace(/:/g, '')}`;

  const close = () => setAt(null);
  // Where the bubble goes: below the button, or above it in the lower part of the screen; null when the button is
  // off the screen.
  const place = (): React.CSSProperties | null => {
    const r = button.current?.getBoundingClientRect();
    const vw = document.documentElement.clientWidth, vh = window.innerHeight;
    if (!r || r.bottom < 0 || r.top > vh) return null;
    const width = Math.min(BUBBLE_W, vw - 2 * MARGIN);
    const left = Math.max(MARGIN, Math.min(r.left + r.width / 2 - width / 2, vw - MARGIN - width));
    return r.bottom > vh * 0.62 ? { left, width, bottom: vh - r.top + GAP } : { left, width, top: r.bottom + GAP };
  };
  const toggle = () => {
    if (at) { close(); return; }
    closeOpen?.();
    setAt(place());
  };

  useEffect(() => {
    if (!at) return undefined;
    closeOpen = close;
    const outside = (e: PointerEvent) => { if (!wrap.current?.contains(e.target as Node)) close(); };
    // A scroll (of the page or the side panel; also the one a focus or a click may cause) moves the bubble with its
    // button, once a frame, and closes it when the button leaves the screen.
    let raf = 0;
    const follow = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const next = place();
        setAt((was) => (was && next && was.left === next.left && was.top === next.top && was.bottom === next.bottom ? was : next));
      });
    };
    document.addEventListener('pointerdown', outside, true);
    window.addEventListener('scroll', follow, { capture: true, passive: true });
    window.addEventListener('resize', close);
    return () => {
      if (closeOpen === close) closeOpen = null;
      cancelAnimationFrame(raf);
      document.removeEventListener('pointerdown', outside, true);
      window.removeEventListener('scroll', follow, true);
      window.removeEventListener('resize', close);
    };
  }, [!!at]);

  return (
    <span className={styles.why} ref={wrap} data-why-wrap={k}
      onKeyDown={(e) => { if (e.key === 'Escape' && at) { e.stopPropagation(); close(); button.current?.focus(); } }}
      onBlur={(e) => { if (at && !wrap.current?.contains(e.relatedTarget as Node)) close(); }}>
      {/* Unlabelled, the button is the 15 px mark itself, a box of fixed size with layout containment: the side panel
          is laid out again on every drag frame (live.ts), and these boxes then cost it nothing inside. */}
      <button ref={button} type="button" className={label ? styles.whyLabelled : styles.whyButton}
        data-why={k} data-why-topic={topicFor} aria-expanded={!!at} aria-controls={at ? id : undefined} aria-label={label ? undefined : `About ${why.about}`}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggle(); }}>
        {label ? <>{label}<span className={styles.whyMark} aria-hidden="true">?</span></> : '?'}
      </button>
      {at && (
        <span className={styles.whyBubble} id={id} role="note" style={at} data-why-bubble={k}>
          {why.text}{' '}
          <a href={`#${topic}`} className={styles.whyLink} data-why-link={k}
            onClick={() => { followTopic(topic, button.current); close(); }}>→ theory</a>
        </span>
      )}
    </span>
  );
}

export function WhyLine({ k }: { k: string }) {
  const why = WHYS[k];
  if (!why) throw new Error(`Unknown short line "${k}" in the Smith chart.`);
  return (
    <p className={styles.whyLine} data-why={k}>
      {why.text}{' '}
      <a href={`#${why.topic}`} className={styles.whyLink} data-why-link={k}
        onClick={(e) => followTopic(why.topic, e.currentTarget)}>→ theory</a>
    </p>
  );
}
