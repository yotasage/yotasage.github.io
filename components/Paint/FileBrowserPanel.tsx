import { useState } from 'react';

import type { ImageDocMeta } from '../../lib/paint/types';
import { useI18n } from '../../lib/ui/i18n';
import styles from '../../styles/PaintTabs.module.css';

export interface FileBrowserPanelProps {
  docs: readonly ImageDocMeta[];
  activeDocId: string;
  showTabStrip: boolean;
  onSelectDoc: (docId: string) => void;
  onRenameDoc: (docId: string, newName: string) => void;
  onDuplicateDoc: (docId: string) => void;
  onTogglePin: (docId: string) => void;
  onCloseDoc: (docId: string) => void;
  onQuickNewDoc: () => void;
  onOpenFiles: () => void;
  onToggleTabStrip: () => void;
}

export default function FileBrowserPanel({
  docs,
  activeDocId,
  showTabStrip,
  onSelectDoc,
  onRenameDoc,
  onDuplicateDoc,
  onTogglePin,
  onCloseDoc,
  onQuickNewDoc,
  onOpenFiles,
  onToggleTabStrip,
}: FileBrowserPanelProps) {
  const { t } = useI18n();
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [query, setQuery] = useState('');
  const [renamingDocId, setRenamingDocId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');

  const filtered = query.trim()
    ? docs.filter((d) => d.name.toLowerCase().includes(query.trim().toLowerCase()))
    : docs;

  const commitRename = (docId: string) => {
    const clean = renameDraft.trim().slice(0, 120);
    setRenamingDocId(null);
    if (clean) onRenameDoc(docId, clean);
  };

  return (
    <div className={styles.browserRoot} data-testid="paint-file-browser">
      <div className={styles.browserToolbar}>
        <div className={styles.browserBtnGroup}>
          <button
            type="button"
            className={styles.browserBtn}
            onClick={onQuickNewDoc}
            title={t('paint.tabs.newFile')}
          >
            + {t('paint.action.new')}
          </button>
          <button
            type="button"
            className={styles.browserBtn}
            onClick={onOpenFiles}
            title={t('paint.tabs.openMultipleTooltip')}
          >
            {t('paint.action.open')}
          </button>
        </div>

        <div className={styles.browserBtnGroup}>
          <button
            type="button"
            className={[styles.browserBtn, viewMode === 'grid' ? styles.browserBtnActive : '']
              .filter(Boolean)
              .join(' ')}
            onClick={() => setViewMode('grid')}
            aria-pressed={viewMode === 'grid'}
            title={t('paint.browser.gridView')}
          >
            ⊞
          </button>
          <button
            type="button"
            className={[styles.browserBtn, viewMode === 'list' ? styles.browserBtnActive : '']
              .filter(Boolean)
              .join(' ')}
            onClick={() => setViewMode('list')}
            aria-pressed={viewMode === 'list'}
            title={t('paint.browser.listView')}
          >
            ☰
          </button>
        </div>
      </div>

      <div className={styles.browserMetaRow}>
        <span className={styles.browserCount}>
          {t('paint.browser.openCount', { count: docs.length })}
        </span>
        <label className={styles.browserToggle}>
          <input
            type="checkbox"
            checked={showTabStrip}
            onChange={onToggleTabStrip}
          />
          <span>{t('paint.browser.showTabs')}</span>
        </label>
      </div>

      {docs.length > 2 && (
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('paint.browser.searchPlaceholder')}
          aria-label={t('paint.browser.searchPlaceholder')}
          className={styles.browserSearch}
        />
      )}

      <div
        className={viewMode === 'grid' ? styles.browserGrid : styles.browserList}
        role="listbox"
        aria-label={t('paint.tabs.openFilesAria')}
      >
        {filtered.map((doc) => {
          const active = doc.id === activeDocId;
          const isRenaming = renamingDocId === doc.id;
          return (
            <div
              key={doc.id}
              className={[
                viewMode === 'grid' ? styles.browserCard : styles.browserRow,
                active ? styles.browserItemActive : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => onSelectDoc(doc.id)}
              onAuxClick={(e) => {
                if (e.button === 1 && !doc.pinned) {
                  e.preventDefault();
                  onCloseDoc(doc.id);
                }
              }}
            >
              <div
                className={
                  viewMode === 'grid' ? styles.browserCardThumb : styles.browserRowThumb
                }
              >
                {doc.thumbDataUrl ? (
                  <img
                    src={doc.thumbDataUrl}
                    alt={doc.name}
                    className={styles.browserThumbImg}
                    draggable={false}
                  />
                ) : null}
              </div>

              <div className={styles.browserItemInfo}>
                {isRenaming ? (
                  <input
                    type="text"
                    className={styles.browserRenameInput}
                    value={renameDraft}
                    autoFocus
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => setRenameDraft(e.target.value)}
                    onBlur={() => commitRename(doc.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitRename(doc.id);
                      if (e.key === 'Escape') setRenamingDocId(null);
                    }}
                  />
                ) : (
                  <div
                    className={styles.browserItemName}
                    title={doc.name}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      setRenamingDocId(doc.id);
                      setRenameDraft(doc.name);
                    }}
                  >
                    {doc.pinned && (
                      <span className={styles.pinMark} aria-hidden="true">
                        •{' '}
                      </span>
                    )}
                    {doc.name}
                  </div>
                )}

                <div className={styles.browserItemMeta}>
                  <span>
                    {doc.width}×{doc.height}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>{t('paint.browser.layersCount', { count: doc.layerCount })}</span>
                </div>
              </div>

              <div
                className={styles.browserItemActions}
                onClick={(e) => e.stopPropagation()}
              >
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

        {filtered.length === 0 && (
          <div className={styles.browserEmpty}>{t('paint.browser.noMatches')}</div>
        )}
      </div>

      <p className={styles.browserHint}>{t('paint.browser.dropHint')}</p>
    </div>
  );
}
