// Trusted security modals rendered strictly outside program-output containers (security.md §4 & §7).
// Covers W1 (first visit), W4 (on-load blocking network confirmation), W7 (fail-closed CSP), and W8 (external link).

import React, { useEffect, useId, useRef, useState } from 'react';

import type { NetworkPolicy } from '../../lib/python/network';
import { useI18n } from '../../lib/ui/i18n';
import styles from '../../styles/PythonDialogs.module.css';

export const W1_ACK_KEY = 'python:ack-v1';

interface ModalFrameProps {
  open: boolean;
  titleId: string;
  danger?: boolean;
  dismissible?: boolean;
  onDismiss?: () => void;
  testId?: string;
  children: React.ReactNode;
}

function ModalFrame({
  open,
  titleId,
  danger = false,
  dismissible = false,
  onDismiss,
  testId,
  children,
}: ModalFrameProps) {
  const cardRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    cardRef.current?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && dismissible && onDismiss) {
        e.preventDefault();
        onDismiss();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      prev?.focus?.();
    };
  }, [open, dismissible, onDismiss]);

  if (!open) return null;

  return (
    <div
      className={styles.backdrop}
      onClick={(e) => {
        if (dismissible && onDismiss && e.target === e.currentTarget) {
          onDismiss();
        }
      }}
    >
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        data-testid={testId}
        className={[styles.dialog, danger ? styles.dialogDanger : ''].filter(Boolean).join(' ')}
      >
        {children}
      </div>
    </div>
  );
}

export function W1FirstVisitDialog({
  open,
  onAcknowledge,
}: {
  open: boolean;
  onAcknowledge: () => void;
}) {
  const { t } = useI18n();
  const titleId = useId();

  return (
    <ModalFrame open={open} titleId={titleId} dismissible={false} testId="python-w1-dialog">
      <div className={styles.header}>
        <h2 id={titleId} className={styles.title}>
          {t('python.w1Title')}
        </h2>
      </div>
      <div className={styles.body}>
        <p className={styles.paragraph}>{t('python.w1Body')}</p>
        <p className={styles.calloutWarn}>{t('python.w1SecretNote')}</p>
        <p className={styles.mutedNote}>{t('python.w9Body')}</p>
      </div>
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.primaryBtn}
          onClick={onAcknowledge}
          data-testid="python-w1-ack"
        >
          {t('python.w1Ack')}
        </button>
      </div>
    </ModalFrame>
  );
}

export function W4OnLoadDialog({
  open,
  policy,
  onContinue,
  onReloadOff,
}: {
  open: boolean;
  policy: NetworkPolicy;
  onContinue: () => void;
  onReloadOff: () => void;
}) {
  const { t } = useI18n();
  const titleId = useId();
  const [checkedAll, setCheckedAll] = useState(false);

  useEffect(() => {
    if (!open) setCheckedAll(false);
  }, [open, policy.mode]);

  const isAll = policy.mode === 'all';
  const target =
    policy.mode === 'pkg'
      ? t('python.w4TargetPkg')
      : policy.mode === 'hosts'
        ? t('python.w4TargetHosts', { hosts: policy.hosts.join(', ') })
        : t('python.w4TargetAll');

  return (
    <ModalFrame open={open} titleId={titleId} danger={isAll} dismissible={false} testId="python-w4-load-dialog">
      <div className={styles.header}>
        <h2 id={titleId} className={styles.title}>
          {t('python.w4TitleLoad')}
        </h2>
      </div>
      <div className={styles.body}>
        <p className={styles.paragraph}>{t('python.w4BodyLoad', { target })}</p>
        <p className={styles.mutedNote}>{t('python.lanNote')}</p>
        {isAll && (
          <label className={styles.checkboxRow}>
            <input
              type="checkbox"
              checked={checkedAll}
              onChange={(e) => setCheckedAll(e.target.checked)}
              data-testid="python-w4-load-all-checkbox"
            />
            <span>{t('python.w4AllCheckbox')}</span>
          </label>
        )}
      </div>
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.secondaryBtn}
          onClick={onReloadOff}
          data-testid="python-w4-reload-off"
        >
          {t('python.w4ReloadOff')}
        </button>
        <button
          type="button"
          className={isAll ? styles.dangerBtn : styles.primaryBtn}
          disabled={isAll && !checkedAll}
          onClick={onContinue}
          data-testid="python-w4-continue"
        >
          {t('python.w4ConfirmLoad')}
        </button>
      </div>
    </ModalFrame>
  );
}

export function W7FailClosedDialog({
  open,
  reason,
  onReloadRepair,
  onRunAnyway,
  onDismiss,
}: {
  open: boolean;
  reason?: string;
  onReloadRepair: () => void;
  onRunAnyway: () => void;
  onDismiss: () => void;
}) {
  const { t } = useI18n();
  const titleId = useId();

  return (
    <ModalFrame open={open} titleId={titleId} danger dismissible onDismiss={onDismiss} testId="python-w7-dialog">
      <div className={styles.header}>
        <h2 id={titleId} className={styles.title}>
          {t('python.w7Title')}
        </h2>
      </div>
      <div className={styles.body}>
        <p className={styles.paragraph}>{t('python.w7Body')}</p>
        {reason && <p className={styles.codeBox}>{reason}</p>}
      </div>
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.secondaryBtn}
          onClick={onRunAnyway}
          data-testid="python-w7-run-anyway"
        >
          {t('python.w7RunAnyway')}
        </button>
        <button
          type="button"
          className={styles.primaryBtn}
          onClick={onReloadRepair}
          data-testid="python-w7-reload"
        >
          {t('python.w7Reload')}
        </button>
      </div>
    </ModalFrame>
  );
}

export function W8ExternalLinkDialog({
  url,
  onConfirm,
  onCancel,
}: {
  url: string | null;
  onConfirm: (url: string) => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const titleId = useId();

  return (
    <ModalFrame open={url !== null} titleId={titleId} dismissible onDismiss={onCancel} testId="python-w8-dialog">
      <div className={styles.header}>
        <h2 id={titleId} className={styles.title}>
          {t('python.w8Title')}
        </h2>
      </div>
      <div className={styles.body}>
        <p className={styles.codeBox} data-testid="python-w8-url">
          {url ?? ''}
        </p>
        <p className={styles.paragraph}>{t('python.w8Body')}</p>
      </div>
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.secondaryBtn}
          onClick={onCancel}
          data-testid="python-w8-cancel"
        >
          {t('python.cancel')}
        </button>
        <button
          type="button"
          className={styles.primaryBtn}
          onClick={() => {
            if (url) onConfirm(url);
          }}
          data-testid="python-w8-open"
        >
          {t('python.w8Open')}
        </button>
      </div>
    </ModalFrame>
  );
}
