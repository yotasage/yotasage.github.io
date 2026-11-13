// The "show equation" control of the Smith chart (step M5.2): a small "=" beside a readout row, the circuit input, a
// node of the node table and the part card. It sets the equation panel's subject, brings the panel into view with the
// focus on the row wanted, and the panel offers a way back (components/Smith/mathLink.ts).

import React from 'react';

import styles from '../../styles/Smith.module.css';
import { mathLink } from './mathLink';
import type { Subject } from './mathRows';

export interface ShowEqProps {
  subject: Subject;
  /** The registry id of the row to focus ('' the subject's first). */
  row?: string;
  /** The control's key (`data-show-eq`), unique on the page: the way back finds it again by it. */
  k: string;
  /** What it shows the equation of ("the VSWR") and where the way back goes ("the readout"). */
  what: string;
  back: string;
}

export function ShowEq({ subject, row = '', k, what, back }: ShowEqProps) {
  const label = `Show the equation of ${what}`;
  return (
    <button type="button" className={styles.showEq} data-show-eq={k} aria-label={label} title={label}
      onClick={(e) => { e.stopPropagation(); mathLink.show({ subject, row, from: e.currentTarget, key: k, back }); }}>=</button>
  );
}
