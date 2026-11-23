import { useEffect, useRef } from 'react';

import { useI18n } from '../../lib/ui/i18n';
import styles from '../../styles/Notepad.module.css';

export interface StorageSyncDialogProps {
  open: boolean;
  fileCount: number;
  bytesUsed: number;
  storageEngine: 'indexeddb' | 'localstorage' | 'memory';
  lastSavedAt: number;
  linkedFileName: string | null;
  supportsFileSystemAccess: boolean;
  statusMessage: string | null;
  statusError: string | null;
  onClose: () => void;
  onExportJson: () => void;
  onImportJsonFile: (file: File) => void;
  onDownloadZip: () => void;
  onLinkLocalFile: () => void;
  onSaveLinkedFile: () => void;
  onLoadLinkedFile: () => void;
  onResetStarter: () => void;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export default function StorageSyncDialog({
  open,
  fileCount,
  bytesUsed,
  storageEngine,
  lastSavedAt,
  linkedFileName,
  supportsFileSystemAccess,
  statusMessage,
  statusError,
  onClose,
  onExportJson,
  onImportJsonFile,
  onDownloadZip,
  onLinkLocalFile,
  onSaveLinkedFile,
  onLoadLinkedFile,
  onResetStarter,
}: StorageSyncDialogProps) {
  const { t } = useI18n();
  const importInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const engineLabel =
    storageEngine === 'indexeddb' ? 'IndexedDB' : storageEngine === 'localstorage' ? 'localStorage' : 'Memory';
  const savedTime = new Date(lastSavedAt).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  return (
    <div
      className={styles.modalBackdrop}
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={styles.modalDialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="notepad-sync-title"
      >
        <div className={styles.modalHeader}>
          <h2 id="notepad-sync-title" className={styles.modalTitle}>
            {t('notepad.sync.title')}
          </h2>
          <button
            type="button"
            className={styles.closeIconBtn}
            onClick={onClose}
            aria-label={t('notepad.sync.close')}
          >
            ×
          </button>
        </div>

        <div className={styles.modalBody}>
          <section className={styles.syncSection}>
            <h3 className={styles.syncHeading}>{t('notepad.sync.localHeading')}</h3>
            <p className={styles.syncBody}>{t('notepad.sync.localDesc', { engine: engineLabel })}</p>
            <p className={styles.syncMeta}>
              {t('notepad.sync.stats', {
                files: fileCount,
                size: formatSize(bytesUsed),
                time: savedTime,
              })}
              {' · '}
              {t('notepad.sync.crossTabNote')}
            </p>
          </section>

          <section className={styles.syncSection}>
            <h3 className={styles.syncHeading}>{t('notepad.sync.accountHeading')}</h3>
            <p className={styles.syncBody}>{t('notepad.sync.accountDesc')}</p>
          </section>

          <section className={styles.syncSection}>
            <h3 className={styles.syncHeading}>{t('notepad.sync.howToSyncHeading')}</h3>
            <div className={styles.syncActions}>
              <button type="button" className={styles.cmdBtnPrimary} onClick={onExportJson}>
                {t('notepad.sync.exportJson')}
              </button>
              <button
                type="button"
                className={styles.cmdBtn}
                onClick={() => importInputRef.current?.click()}
              >
                {t('notepad.sync.importJson')}
              </button>
              <button type="button" className={styles.cmdBtn} onClick={onDownloadZip}>
                {t('notepad.downloadZip')}
              </button>
              <input
                ref={importInputRef}
                type="file"
                accept=".json,application/json"
                aria-hidden="true"
                tabIndex={-1}
                className={styles.srOnly}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) onImportJsonFile(file);
                  e.target.value = '';
                }}
              />
            </div>

            <div className={styles.syncFileRow}>
              {supportsFileSystemAccess ? (
                <>
                  <button type="button" className={styles.cmdBtn} onClick={onLinkLocalFile}>
                    {t('notepad.sync.linkFile')}
                  </button>
                  {linkedFileName && (
                    <>
                      <button type="button" className={styles.cmdBtn} onClick={onSaveLinkedFile}>
                        {t('notepad.sync.saveLinkedFile')}
                      </button>
                      <button type="button" className={styles.cmdBtn} onClick={onLoadLinkedFile}>
                        {t('notepad.sync.loadLinkedFile')}
                      </button>
                      <span className={styles.syncMeta}>
                        {t('notepad.sync.linkedStatus', { name: linkedFileName })}
                      </span>
                    </>
                  )}
                </>
              ) : (
                <p className={styles.syncMeta}>{t('notepad.sync.fsUnsupported')}</p>
              )}
            </div>

            {statusMessage && (
              <p className={styles.syncFeedbackOk} role="status" aria-live="polite">
                {statusMessage}
              </p>
            )}
            {statusError && (
              <p className={styles.syncFeedbackErr} role="alert">
                {statusError}
              </p>
            )}
          </section>
        </div>

        <div className={styles.modalFooter}>
          <button type="button" className={styles.cmdBtn} onClick={onResetStarter}>
            {t('notepad.sync.resetStarter')}
          </button>
          <button type="button" className={styles.cmdBtnPrimary} onClick={onClose}>
            {t('notepad.closeFile')}
          </button>
        </div>
      </div>
    </div>
  );
}
