import { useState } from 'react';

import { NotepadDoc } from '../../lib/notepad/types';
import { useI18n } from '../../lib/ui/i18n';
import styles from '../../styles/Notepad.module.css';

export interface TabStripProps {
  docs: readonly NotepadDoc[];
  activeDocId: string;
  isDiffMode: boolean;
  onSelectDoc: (docId: string) => void;
  onRenameDoc: (docId: string, newName: string) => void;
  onDuplicateDoc: (doc: NotepadDoc) => void;
  onTogglePin: (docId: string) => void;
  onCloseDoc: (docId: string) => void;
  onNewDoc: () => void;
}

export default function TabStrip({
  docs,
  activeDocId,
  isDiffMode,
  onSelectDoc,
  onRenameDoc,
  onDuplicateDoc,
  onTogglePin,
  onCloseDoc,
  onNewDoc,
}: TabStripProps) {
  const { t } = useI18n();
  const [renamingDocId, setRenamingDocId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');

  const commitRename = (docId: string) => {
    const clean = renameDraft.trim().slice(0, 120);
    setRenamingDocId(null);
    if (clean) onRenameDoc(docId, clean);
  };

  return (
    <div className={styles.tabStrip} role="tablist" aria-label="Open files">
      {docs.map((doc) => {
        const isCurrent = doc.id === activeDocId && !isDiffMode;
        const isRenaming = renamingDocId === doc.id;
        return (
          <div
            key={doc.id}
            className={[styles.docTab, isCurrent ? styles.docTabActive : ''].filter(Boolean).join(' ')}
          >
            {isRenaming ? (
              <input
                type="text"
                className={styles.tabRenameInput}
                value={renameDraft}
                autoFocus
                aria-label={t('notepad.renameFile')}
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
                title={`${doc.name} (double-click to rename)`}
              >
                {doc.pinned && (
                  <span className={styles.pinMark} aria-hidden="true">
                    •
                  </span>
                )}
                <span className={styles.tabName}>{doc.name}</span>
              </button>
            )}

            <button
              type="button"
              className={styles.tabActionBtn}
              onClick={() => {
                setRenamingDocId(doc.id);
                setRenameDraft(doc.name);
              }}
              aria-label={`${t('notepad.renameFile')} ${doc.name}`}
              title={t('notepad.renameFile')}
            >
              ✎
            </button>
            <button
              type="button"
              className={styles.tabActionBtn}
              onClick={() => onDuplicateDoc(doc)}
              aria-label={`${t('notepad.duplicateFile')} ${doc.name}`}
              title={t('notepad.duplicateFile')}
            >
              ⧉
            </button>
            <button
              type="button"
              className={styles.tabActionBtn}
              onClick={() => onTogglePin(doc.id)}
              aria-label={`${doc.pinned ? t('notepad.unpinFile') : t('notepad.pinFile')} ${doc.name}`}
              title={doc.pinned ? t('notepad.unpinFile') : t('notepad.pinFile')}
            >
              {doc.pinned ? '★' : '☆'}
            </button>
            {!doc.pinned && (
              <button
                type="button"
                className={styles.tabCloseBtn}
                onClick={() => onCloseDoc(doc.id)}
                aria-label={`${t('notepad.closeFile')} ${doc.name}`}
                title={t('notepad.closeFile')}
              >
                ×
              </button>
            )}
          </div>
        );
      })}

      <button
        type="button"
        className={styles.tabAddBtn}
        onClick={onNewDoc}
        aria-label={t('notepad.newFile')}
        title={t('notepad.newFile')}
      >
        +
      </button>
    </div>
  );
}
