import React from 'react';

import { useI18n } from '../../lib/ui/i18n';
import { useExperienceMode } from '../../lib/ui/mode';
import styles from '../../styles/DesignSystem.module.css';

export interface TeachingCalloutProps {
  title: string;
  children: React.ReactNode;
  formula?: React.ReactNode;
  theoryLabel?: string;
  onTheoryClick?: () => void;
  theoryHref?: string;
  forceShow?: boolean;
  className?: string;
}

function BookIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
    </svg>
  );
}

export default function TeachingCallout({
  title,
  children,
  formula,
  theoryLabel,
  onTheoryClick,
  theoryHref,
  forceShow = false,
  className,
}: TeachingCalloutProps) {
  const { mode } = useExperienceMode();
  const { t } = useI18n();

  if (!forceShow && mode !== 'teaching') return null;

  const actionText = theoryLabel ?? t('teaching.readTheory');

  return (
    <aside className={[styles.callout, className ?? ''].filter(Boolean).join(' ')} aria-label={title}>
      <div className={styles.calloutHeader}>
        <span className={styles.calloutIcon}>
          <BookIcon />
        </span>
        <div className={styles.calloutTitleWrap}>
          <span className={styles.calloutBadge}>{t('teaching.badge')}</span>
          <h3 className={styles.calloutTitle}>{title}</h3>
        </div>
      </div>

      <div className={styles.calloutBody}>{children}</div>

      {formula && <div className={styles.calloutFormula}>{formula}</div>}

      {(onTheoryClick || theoryHref) && (
        <div className={styles.calloutFooter}>
          {onTheoryClick ? (
            <button type="button" className={styles.calloutAction} onClick={onTheoryClick}>
              {actionText}
            </button>
          ) : (
            <a href={theoryHref} className={styles.calloutAction}>
              {actionText}
            </a>
          )}
        </div>
      )}
    </aside>
  );
}
