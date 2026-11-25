// U2 trusted dialogs of the Files panel, rendered in a portal on <body>, outside program output:
// the confirmation for deleting a selection of files and folders, and the Reset workspace dialog
// (what is deleted and what is kept, Download ZIP first, a tick-box before the red button enables).

import React, { useEffect, useId, useState } from 'react';
import { createPortal } from 'react-dom';

import { formatByteSize } from '../../lib/python/paths';
import { useI18n } from '../../lib/ui/i18n';
import styles from '../../styles/PythonDialogs.module.css';
import { ModalFrame } from './SecurityDialogs';
import type { TreeSelectionSummary } from './useTreeSelection';

type Translate = ReturnType<typeof useI18n>['t'];

const NAMES_SHOWN = 5;

/** "2 files and 1 folder", "1 file", "3 folders". */
export function describeCounts(t: Translate, files: number, folders: number): string {
  const f = files === 1 ? t('python.filesCountFile') : t('python.filesCountFiles', { count: files });
  const d = folders === 1 ? t('python.filesCountFolder') : t('python.filesCountFolders', { count: folders });
  if (files > 0 && folders > 0) return t('python.filesCountAnd', { a: f, b: d });
  return folders > 0 ? d : f;
}

function Portal({ children }: { children: React.ReactNode }) {
  if (typeof document === 'undefined') return null;
  return createPortal(children, document.body);
}

export function DeleteSelectionDialog({
  open,
  summary,
  busy,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  summary: TreeSelectionSummary;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { t } = useI18n();
  const titleId = useId();
  if (!open) return null;
  const shown = summary.roots.slice(0, NAMES_SHOWN);
  const more = summary.roots.length - shown.length;

  return (
    <Portal>
      <ModalFrame open={open} titleId={titleId} danger dismissible={!busy} onDismiss={onCancel} testId="python-delete-many-dialog">
        <div className={styles.header}>
          <h2 id={titleId} className={styles.title}>
            {t('python.filesDeleteManyTitle')}
          </h2>
        </div>
        <div className={styles.body}>
          <p className={styles.paragraph} data-testid="python-delete-many-summary">
            {t('python.filesDeleteManyBody', { what: describeCounts(t, summary.files, summary.folders) })}
          </p>
          <ul className={styles.codeList} data-testid="python-delete-many-names">
            {shown.map((p) => (
              <li key={p} title={p}>
                <code>{p}</code>
              </li>
            ))}
            {more > 0 && <li>{t('python.filesDeleteManyMore', { count: more })}</li>}
          </ul>
          {summary.inside > 0 && (
            <p className={styles.mutedNote}>{t('python.filesDeleteManyInside', { count: summary.inside })}</p>
          )}
        </div>
        <div className={styles.actions}>
          <button type="button" className={styles.secondaryBtn} onClick={onCancel} disabled={busy} data-testid="python-delete-many-cancel">
            {t('python.cancel')}
          </button>
          <button type="button" className={styles.dangerBtn} onClick={onConfirm} disabled={busy} data-testid="python-delete-many-confirm">
            {t('python.filesDeleteManyConfirm', { count: summary.roots.length })}
          </button>
        </div>
      </ModalFrame>
    </Portal>
  );
}

export function ResetWorkspaceDialog({
  open,
  files,
  folders,
  totalBytes,
  busy,
  onCancel,
  onDownloadZip,
  onConfirm,
}: {
  open: boolean;
  files: number;
  folders: number;
  totalBytes: number;
  busy: boolean;
  onCancel: () => void;
  onDownloadZip: () => void;
  onConfirm: () => void;
}) {
  const { t } = useI18n();
  const titleId = useId();
  const checkId = useId();
  const [understood, setUnderstood] = useState(false);

  useEffect(() => {
    if (!open) setUnderstood(false);
  }, [open]);

  if (!open) return null;

  return (
    <Portal>
      <ModalFrame open={open} titleId={titleId} danger dismissible={!busy} onDismiss={onCancel} testId="python-reset-dialog">
        <div className={styles.header}>
          <h2 id={titleId} className={styles.title}>
            {t('python.resetTitle')}
          </h2>
        </div>
        <div className={styles.body}>
          <p className={styles.paragraph} data-testid="python-reset-deletes">
            {t('python.resetDeletes', {
              what: describeCounts(t, files, folders),
              size: formatByteSize(totalBytes),
            })}
          </p>
          <p className={styles.paragraph} data-testid="python-reset-keeps">
            {t('python.resetKeeps')}
          </p>
          <p className={styles.mutedNote}>{t('python.resetAfter')}</p>
          <div>
            <button
              type="button"
              className={styles.secondaryBtn}
              onClick={onDownloadZip}
              disabled={busy || files === 0}
              data-testid="python-reset-zip"
            >
              {t('python.resetZip')}
            </button>
          </div>
          <label className={styles.checkboxRow} htmlFor={checkId}>
            <input
              id={checkId}
              type="checkbox"
              checked={understood}
              disabled={busy}
              onChange={(e) => setUnderstood(e.target.checked)}
              data-testid="python-reset-check"
            />
            <span>{t('python.resetCheck')}</span>
          </label>
        </div>
        <div className={styles.actions}>
          <button type="button" className={styles.secondaryBtn} onClick={onCancel} disabled={busy} data-testid="python-reset-cancel">
            {t('python.cancel')}
          </button>
          <button
            type="button"
            className={styles.dangerBtn}
            onClick={onConfirm}
            disabled={busy || !understood}
            data-testid="python-reset-confirm"
          >
            {t('python.resetConfirm')}
          </button>
        </div>
      </ModalFrame>
    </Portal>
  );
}
