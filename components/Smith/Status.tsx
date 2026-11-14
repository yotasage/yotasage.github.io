// The status note at the top of the Smith chart page. The tool goes live before its owner has used it (plan.md D19),
// so the note says plainly what works, how it is checked, what it assumes and what comes next. Every step that
// changes what the page does keeps these texts true: this file is the one place they live.

import React from 'react';

import styles from '../../styles/Smith.module.css';

/** The short lines, always shown. */
export const STATUS_LEAD = 'New and still growing.';
export const STATUS_NOW =
  'It draws the Smith chart, builds a matching circuit as you type or drag, ' +
  'finds a missing value with suggestions, shows the equations with your numbers, linked to the chart, ' +
  'derives them step by step, explains each move and the theory, guides you through 16 worked ' +
  'examples, sets exercises of five kinds with hints, makes lesson links with locks, ' +
  'sweeps Γ(f) with a plot and figures, prints a report, and saves figures (TikZ, SVG, PNG), CSV, Touchstone and ' +
  'project files.';
export const STATUS_CHECKED =
  'Checked by automated tests against independent computations and textbook cases, but not yet used for real ' +
  'design work, so a quick check against another source is a good idea for results that matter.';
/** Behind "More". */
export const STATUS_ASSUMES = 'It assumes ideal parts, lossless lines and a real Z0; the values are worked out at f0, and a sweep ' +
  'evaluates the same ideal parts at each frequency.';
export const STATUS_COMING =
  'Every planned feature is in. Every task works by keyboard alone, every control has a name for screen readers, text ' +
  'and lines meet WCAG AA contrast in both themes, and the page follows reduced motion and twice the text size; it is ' +
  'checked in Edge, Firefox and Safari’s engine, by touch, and for speed.';

export function Status() {
  return (
    <div className={styles.statusWrap}>
      <aside id="status" className={styles.status} aria-label="Status of this tool">
        <p className={styles.statusLine}>
          <strong>{STATUS_LEAD}</strong> {STATUS_NOW}
        </p>
        <p className={styles.statusLine}>{STATUS_CHECKED}</p>
        <details className={styles.statusMore}>
          <summary>More</summary>
          <p className={styles.statusLine}>{STATUS_ASSUMES}</p>
          <p className={styles.statusLine}>{STATUS_COMING}</p>
        </details>
      </aside>
    </div>
  );
}
