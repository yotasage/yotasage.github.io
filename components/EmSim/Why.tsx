// The short lines of the EM simulation page (step M2.4d; texts in whys.ts): quiet text under a control or a group of
// controls, "Name: line → theory". Always visible text (never only on hover); the bar's "?" button hides or shows all
// of them at once by the root's data-whys (CSS only, nothing re-renders). The link is a plain `#topic`: the page's
// hashchange loads the Theory chunk if needed and scrolls to the topic, and useReplayHighlight replays its highlight.
// Both components are memoised on string props, so a drag frame that renders their parent costs nothing here.

import React from 'react';

import styles from '../../styles/EmSim.module.css';
import { TOPIC_TITLE, WHYS } from './whys';

/** One line; `bare` leaves out the control's name (for a line right under its only control). */
export const Why = React.memo(function Why({ k, bare }: { k: string; bare?: boolean }) {
  const why = WHYS[k];
  if (!why) throw new Error(`Unknown short line "${k}" on the EM simulation page.`);
  return (
    <span className={styles.why} data-why={k}>
      {!bare && <b className={styles.whyLabel}>{why.label}: </b>}
      {why.text}
      {why.topic && (
        <>
          {' '}
          <a href={`#${why.topic}`} className={styles.whyLink} data-why-link={k} aria-label={`${why.label}: theory, ${TOPIC_TITLE[why.topic] ?? why.topic}`}>→&nbsp;theory</a>
        </>
      )}
    </span>
  );
});

/** Several lines under a row of controls; `ks` is the keys separated by spaces (a string, so memo holds). */
export const Whys = React.memo(function Whys({ ks }: { ks: string }) {
  return (
    <div className={styles.whys}>
      {ks.split(' ').filter(Boolean).map((k) => <Why key={k} k={k} />)}
    </div>
  );
});
