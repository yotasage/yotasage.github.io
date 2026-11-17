// The status note at the top of the EM simulation page (step M2.5). The tool goes live before it has been used for a
// real order (plan.md, owner checkpoints), so the note says plainly what works, how it is checked, what it assumes and
// what it leaves out. The texts are in statusText.ts.

import React from 'react';

import styles from '../../styles/EmSim.module.css';
import { STATUS_ASSUMES, STATUS_CHECKED, STATUS_COMING, STATUS_LEAD, STATUS_NOW } from './statusText';

export function Status() {
  return (
    <aside className={styles.status} aria-label="Status of this tool" data-status>
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
  );
}
