import { useState } from 'react';

import type { ImageDocMeta } from '../../lib/paint/types';
import { useI18n } from '../../lib/ui/i18n';
import styles from '../../styles/PaintTabs.module.css';

export interface ImageTabStripProps {
  docs: readonly ImageDocMeta[];
  activeDocId: string;
  showThumbnails: boolean;
  fileBrowserVisible: boolean;
  onSelectDoc: (docId: string) => void;
  onRenameDoc: (docId: string, newName: string) => void;
  onDuplicateDoc: (docId: string) => void;
  onTogglePin: (docId: string) => void;
  onCloseDoc: (docId: string) => void;
  onQuickNewDoc: () => void;
  onOpenFiles: () => void;
  onToggleThumbnails: () => void;
  onToggleFileBrowser: () => void;
}

export default function ImageTabStrip({
  docs,
  activeDocId,
  showThumbnails,
  fileBrowserVisible,
  onSelectDoc,
  onRenameDoc,
  onDuplicateDoc,
  onTogglePin,
  onCloseDoc,
  onQuickNewDoc,
  onOpenFiles,
  onToggleThumbnails,
  onToggleFileBrowser,
}: ImageTabStripProps) {
  const { t } = useI18n();
  const [renamingDocId, setRenamingDocId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');

  const commitRename = (docId: string) => {
    const clean = renameDraft.trim().slice(0, 120);
    setRenamingDocId(null);
    if (clean) onRenameDoc(docId, clean);
  };

  return (
    <div className={styles.tabBar} data-testid="paint-tab-strip">
      <div className={styles.tabStrip} role="tablist" aria-label={t('paint.tabs.openFilesAria')}>
        {docs.map((doc) => {
          const isCurrent = doc.id === activeDocId;
          const isRenaming = renamingDocId === doc.id;
          return (
            <div
              key={doc.id}
              data-testid={`paint-tab-${doc.id}`}
              data-active={isCurrent ? 'true' : 'false'}
              className={[
                styles.docTab,
                isCurrent ? styles.docTabActive : '',
                showThumbnails ? styles.docTabWithThumb : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onAuxClick={(e) => {
                if (e.button === 1 && !doc.pinned) {
                  e.preventDefault();
                  onCloseDoc(doc.id);
                }
              }}
            >
              {isRenaming ? (
                <input
                  type="text"
                  className={styles.tabRenameInput}
                  value={renameDraft}
                  autoFocus
                  aria-label={t('paint.tabs.rename')}
                  onChange={(e) => setRenameDraft(e.target.value)}
                  onBlur={() => commitRename(doc.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitRename(doc.id);
                    if (e.key === 'Escape') setRenamingDocId(null);
                  }}
                />
              ) : (
                <button
                  type="button"
                  role="tab"
                  aria-selected={isCurrent}
                  className={styles.tabSelectBtn}
                  onClick={() => onSelectDoc(doc.id)}
                  onDoubleClick={() => {
                    setRenamingDocId(doc.id);
                    setRenameDraft(doc.name);
                  }}
                  title={t('paint.tabs.tabTooltip', {
                    name: doc.name,
                    w: doc.width,
                    h: doc.height,
                  })}
                >
                  {showThumbnails && (
                    <span className={styles.tabThumbFrame} aria-hidden="true">
                      {doc.thumbDataUrl ? (
                        <img
                          src={doc.thumbDataUrl}
                          alt=""
                          className={styles.tabThumbImg}
                          draggable={false}
                        />
                      ) : null}
                    </span>
                  )}
                  <span className={styles.tabTextGroup}>
                    <span className={styles.tabNameRow}>
                      {doc.pinned && (
                        <span className={styles.pinMark} aria-hidden="true">
                          •
                        </span>
                      )}
                      <span className={styles.tabName}>{doc.name}</span>
                    </span>
                    {showThumbnails && (
                      <span className={styles.tabDims}>
                        {doc.width}×{doc.height}
                      </span>
                    )}
                  </span>
                </button>
              )}

              <div className={styles.tabActions}>
                <button
                  type="button"
                  className={styles.tabActionBtn}
                  onClick={() => {
                    setRenamingDocId(doc.id);
                    setRenameDraft(doc.name);
                  }}
                  aria-label={`${t('paint.tabs.rename')} ${doc.name}`}
                  title={t('paint.tabs.rename')}
                >
                  ✎
                </button>
                <button
                  type="button"
                  className={styles.tabActionBtn}
                  onClick={() => onDuplicateDoc(doc.id)}
                  aria-label={`${t('paint.tabs.duplicate')} ${doc.name}`}
                  title={t('paint.tabs.duplicate')}
                >
                  ⧉
                </button>
                <button
                  type="button"
                  className={styles.tabActionBtn}
                  onClick={() => onTogglePin(doc.id)}
                  aria-label={`${doc.pinned ? t('paint.tabs.unpin') : t('paint.tabs.pin')} ${doc.name}`}
                  title={doc.pinned ? t('paint.tabs.unpin') : t('paint.tabs.pin')}
                >
                  {doc.pinned ? '★' : '☆'}
                </button>
                {!doc.pinned && (
                  <button
                    type="button"
                    className={styles.tabCloseBtn}
                    onClick={() => onCloseDoc(doc.id)}
                    aria-label={`${t('paint.tabs.close')} ${doc.name}`}
                    title={t('paint.tabs.close')}
                  >
                    ×
                  </button>
                )}
              </div>
            </div>
          );
        })}

        <button
          type="button"
          className={styles.tabAddBtn}
          onClick={onQuickNewDoc}
          aria-label={t('paint.tabs.newFile')}
          title={t('paint.tabs.newFile')}
          data-testid="paint-tab-add"
        >
          +
        </button>
      </div>

      <div className={styles.tabBarControls}>
        <button
          type="button"
          className={styles.tabControlBtn}
          onClick={onOpenFiles}
          title={t('paint.tabs.openMultipleTooltip')}
        >
          {t('paint.action.open')}
        </button>
        <button
          type="button"
          className={[styles.tabControlBtn, showThumbnails ? styles.tabControlBtnActive : '']
            .filter(Boolean)
            .join(' ')}
          onClick={onToggleThumbnails}
          aria-pressed={showThumbnails}
          title={t('paint.tabs.toggleThumbsTooltip')}
        >
          {t('paint.tabs.thumbs')}
        </button>
        <button
          type="button"
          className={[styles.tabControlBtn, fileBrowserVisible ? styles.tabControlBtnActive : '']
            .filter(Boolean)
            .join(' ')}
          onClick={onToggleFileBrowser}
          aria-pressed={fileBrowserVisible}
          title={`${t('paint.panel.files')} (F6)`}
        >
          {t('paint.panel.files')} ({docs.length})
        </button>
      </div>
    </div>
  );
}
