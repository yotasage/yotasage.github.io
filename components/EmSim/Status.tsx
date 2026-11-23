// The status note at the top of the EM simulation page (step M2.5). Collapsed by default into a single compact row so
// phones and small screens see the Workbench controls immediately above the fold, while keeping the full status note
// one tap away. The texts live in statusText.ts.

import React from 'react';

import { useI18n } from '../../lib/ui/i18n';
import styles from '../../styles/EmSim.module.css';
import { STATUS_ASSUMES, STATUS_CHECKED, STATUS_COMING, STATUS_LEAD, STATUS_NOW } from './statusText';

export function Status() {
  const { t } = useI18n();
  const [open, setOpen] = React.useState(false);
  const bodyId = React.useId();

  return (
    <aside
      className={[styles.status, open ? styles.statusOpen : ''].join(' ')}
      aria-label={t('emsim.status.aria')}
      data-status
      data-open={open ? 'true' : 'false'}
    >
      <button
        type="button"
        className={styles.statusToggle}
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => setOpen((v) => !v)}
      >
        <span className={styles.statusHeaderMain}>
          <span className={styles.statusBadge}>{t('emsim.status.badge')}</span>
          <strong className={styles.statusLead}>{STATUS_LEAD}</strong>
        </span>
        <span className={styles.statusToggleAction}>
          <span>{open ? t('emsim.status.hide') : t('emsim.status.show')}</span>
          <svg
            className={[styles.statusChevron, open ? styles.statusChevronOpen : ''].join(' ')}
            width="14"
            height="14"
            viewBox="0 0 16 16"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M4 6l4 4 4-4"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </button>

      {open && (
        <div id={bodyId} className={styles.statusBody}>
          <p className={styles.statusLine}>{STATUS_NOW}</p>
          <p className={styles.statusLine}>{STATUS_CHECKED}</p>
          <details className={styles.statusMore}>
            <summary>{t('emsim.status.more')}</summary>
            <p className={styles.statusLine}>{STATUS_ASSUMES}</p>
            <p className={styles.statusLine}>{STATUS_COMING}</p>
          </details>
        </div>
      )}
    </aside>
  );
}
