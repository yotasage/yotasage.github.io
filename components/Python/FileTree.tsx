// Persistent Workspace File Tree panel for /python/main (P3b).
// Supports create file/folder, rename, move, delete, upload, recursive drag-drop (files & folders),
// single-file download, safe ZIP import/export, built-in examples picker, W5 notice, and storage readout.
// All dynamic strings render strictly as React text nodes (never innerHTML per security.md §4).

import React, { useMemo, useRef, useState } from 'react';

import { PYTHON_EXAMPLES } from '../../lib/python/examples';
import {
  baseName,
  fileExtension,
  formatByteSize,
  normalizeWorkspacePath,
  parentDir,
} from '../../lib/python/paths';
import type {
  StorageEstimateInfo,
  WorkspaceEntryMeta,
  WorkspaceStats,
} from '../../lib/python/storageClient';
import { useI18n } from '../../lib/ui/i18n';
import styles from '../../styles/Python.module.css';
import fileStyles from '../../styles/PythonFiles.module.css';
import { extractDroppedItems } from './fileHelpers';

export interface FileTreeProps {
  entries: readonly WorkspaceEntryMeta[];
  activePath: string | null;
  runCreatedPaths: ReadonlySet<string>;
  stats: WorkspaceStats | null;
  storageEstimate: StorageEstimateInfo | null;
  disabled: boolean;
  errorMessage: string | null;
  w5NoticeVisible: boolean;
  onDismissError: () => void;
  onDismissW5: () => void;
  onOpenFile: (path: string) => void;
  onCreateFile: (path: string) => Promise<boolean>;
  onCreateFolder: (path: string) => Promise<boolean>;
  onRename: (from: string, to: string) => Promise<boolean>;
  onMove: (from: string, to: string) => Promise<boolean>;
  onDelete: (path: string) => Promise<boolean>;
  onDownload: (path: string) => void;
  onUploadFiles: (files: readonly { path: string; file: File }[], dirs?: readonly string[]) => Promise<void>;
  onImportZip: (file: File) => Promise<void>;
  onExportZip: () => Promise<void>;
  onLoadExample: (exampleId: string) => Promise<unknown>;
}

interface TreeNode {
  readonly entry: WorkspaceEntryMeta;
  readonly children: TreeNode[];
}

type InlineAction =
  | { readonly kind: 'new-file' }
  | { readonly kind: 'new-folder' }
  | { readonly kind: 'rename'; readonly path: string }
  | { readonly kind: 'move'; readonly path: string }
  | { readonly kind: 'delete'; readonly path: string };

function buildTree(entries: readonly WorkspaceEntryMeta[]): TreeNode[] {
  const nodeMap = new Map<string, TreeNode>();
  const roots: TreeNode[] = [];

  // Ensure every entry has a node
  const sorted = [...entries].sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
    return a.path.localeCompare(b.path);
  });

  for (const entry of sorted) {
    nodeMap.set(entry.path, { entry, children: [] });
  }

  for (const entry of sorted) {
    const node = nodeMap.get(entry.path)!;
    const parent = parentDir(entry.path);
    const parentNode = parent ? nodeMap.get(parent) : undefined;
    if (parentNode && parentNode.entry.isDir) {
      parentNode.children.push(node);
    } else {
      roots.push(node);
    }
  }

  const sortChildren = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => {
      if (a.entry.isDir !== b.entry.isDir) return a.entry.isDir ? -1 : 1;
      return baseName(a.entry.path).localeCompare(baseName(b.entry.path));
    });
    for (const n of nodes) {
      if (n.children.length > 0) sortChildren(n.children);
    }
  };
  sortChildren(roots);
  return roots;
}

function getFileIcon(entry: WorkspaceEntryMeta, expanded: boolean): string {
  if (entry.isDir) return expanded ? '▾' : '▸';
  const ext = fileExtension(entry.path);
  if (ext === '.py' || ext === '.pyi') return '🐍';
  if (ext === '.json' || ext === '.csv' || ext === '.tsv') return '▤';
  if (ext === '.png' || ext === '.jpg' || ext === '.jpeg' || ext === '.gif' || ext === '.webp' || ext === '.svg') {
    return '◫';
  }
  if (ext === '.zip' || ext === '.whl') return '⌸';
  return '◦';
}

export default function FileTree({
  entries,
  activePath,
  runCreatedPaths,
  stats,
  storageEstimate,
  disabled,
  errorMessage,
  w5NoticeVisible,
  onDismissError,
  onDismissW5,
  onOpenFile,
  onCreateFile,
  onCreateFolder,
  onRename,
  onMove,
  onDelete,
  onDownload,
  onUploadFiles,
  onImportZip,
  onExportZip,
  onLoadExample,
}: FileTreeProps) {
  const { t } = useI18n();
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const zipInputRef = useRef<HTMLInputElement | null>(null);
  const dragDepthRef = useRef(0);

  const [collapsedDirs, setCollapsedDirs] = useState<ReadonlySet<string>>(() => new Set());
  const [action, setAction] = useState<InlineAction | null>(null);
  const [actionValue, setActionValue] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [selectedExample, setSelectedExample] = useState('');

  const tree = useMemo(() => buildTree(entries), [entries]);

  const openAction = (next: InlineAction) => {
    setAction(next);
    setActionError(null);
    if (next.kind === 'new-file') setActionValue('');
    else if (next.kind === 'new-folder') setActionValue('');
    else if (next.kind === 'rename') setActionValue(next.path);
    else if (next.kind === 'move') setActionValue(next.path);
    else setActionValue('');
  };

  const closeAction = () => {
    setAction(null);
    setActionValue('');
    setActionError(null);
  };

  const handleActionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!action || disabled || busy) return;

    if (action.kind === 'delete') {
      setBusy(true);
      try {
        const ok = await onDelete(action.path);
        if (ok) closeAction();
      } finally {
        setBusy(false);
      }
      return;
    }

    const trimmed = actionValue.trim();
    const check = normalizeWorkspacePath(trimmed, {
      allowTrailingSlash: action.kind === 'new-folder',
    });
    if (!check.ok) {
      const reason = 'reason' in check ? check.reason : 'Invalid path';
      setActionError(t('python.filesInvalidPath', { detail: reason }));
      return;
    }

    setBusy(true);
    setActionError(null);
    try {
      let ok = false;
      if (action.kind === 'new-file') {
        ok = await onCreateFile(check.path);
      } else if (action.kind === 'new-folder') {
        ok = await onCreateFolder(check.path);
      } else if (action.kind === 'rename') {
        ok = await onRename(action.path, check.path);
      } else if (action.kind === 'move') {
        ok = await onMove(action.path, check.path);
      }
      if (ok) closeAction();
    } finally {
      setBusy(false);
    }
  };

  const toggleDir = (dirPath: string) => {
    setCollapsedDirs((prev) => {
      const next = new Set(prev);
      if (next.has(dirPath)) next.delete(dirPath);
      else next.add(dirPath);
      return next;
    });
  };

  const handleUploadChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;
    const items: { path: string; file: File }[] = [];
    for (let i = 0; i < fileList.length; i += 1) {
      const f = fileList[i];
      items.push({ path: f.name, file: f });
    }
    e.target.value = '';
    setBusy(true);
    try {
      await onUploadFiles(items);
    } finally {
      setBusy(false);
    }
  };

  const handleZipChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    try {
      await onImportZip(file);
    } finally {
      setBusy(false);
    }
  };

  const handleDragEnter = (e: React.DragEvent) => {
    if (disabled) return;
    e.preventDefault();
    dragDepthRef.current += 1;
    setDragOver(true);
  };

  const handleDragOver = (e: React.DragEvent) => {
    if (disabled) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };

  const handleDragLeave = (e: React.DragEvent) => {
    if (disabled) return;
    e.preventDefault();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setDragOver(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    if (disabled) return;
    e.preventDefault();
    dragDepthRef.current = 0;
    setDragOver(false);
    const extracted = await extractDroppedItems(e.dataTransfer);
    if (extracted.files.length === 0 && extracted.dirs.length === 0) return;
    setBusy(true);
    try {
      await onUploadFiles(extracted.files, extracted.dirs);
    } finally {
      setBusy(false);
    }
  };

  const handleExampleChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value;
    setSelectedExample('');
    if (!id || disabled || busy) return;
    setBusy(true);
    try {
      await onLoadExample(id);
    } finally {
      setBusy(false);
    }
  };

  const renderNodes = (nodes: readonly TreeNode[], depth: number): React.ReactNode =>
    nodes.map((node) => {
      const { entry, children } = node;
      const expanded = !collapsedDirs.has(entry.path);
      const isActive = !entry.isDir && activePath === entry.path;
      const isRunCreated = runCreatedPaths.has(entry.path);
      const name = baseName(entry.path);

      return (
        <React.Fragment key={entry.path}>
          <div
            className={[fileStyles.treeRow, isActive ? fileStyles.treeRowActive : '']
              .filter(Boolean)
              .join(' ')}
            style={{ paddingLeft: `${6 + depth * 14}px` }}
            data-testid={`python-tree-item-${entry.path}`}
            data-path={entry.path}
            data-is-dir={entry.isDir ? 'true' : 'false'}
            data-created-by-run={isRunCreated ? 'true' : undefined}
          >
            <button
              type="button"
              className={fileStyles.treeMainBtn}
              aria-expanded={entry.isDir ? expanded : undefined}
              aria-current={isActive ? 'page' : undefined}
              title={entry.path}
              onClick={() => {
                if (entry.isDir) toggleDir(entry.path);
                else onOpenFile(entry.path);
              }}
            >
              <span className={fileStyles.treeIcon} aria-hidden="true">
                {getFileIcon(entry, expanded)}
              </span>
              <span className={fileStyles.treeName}>{name}</span>
              {isRunCreated && (
                <span
                  className={fileStyles.newBadge}
                  data-testid={`python-new-badge-${entry.path}`}
                >
                  {t('python.filesNewBadge')}
                </span>
              )}
              {!entry.isDir && (
                <span className={fileStyles.treeSize}>{formatByteSize(entry.size)}</span>
              )}
            </button>

            <div className={fileStyles.treeActions}>
              {!entry.isDir && (
                <button
                  type="button"
                  className={fileStyles.treeActBtn}
                  title={t('python.filesDownload')}
                  aria-label={`${t('python.filesDownload')} ${entry.path}`}
                  data-testid={`python-download-btn-${entry.path}`}
                  onClick={() => onDownload(entry.path)}
                >
                  &#8595;
                </button>
              )}
              <button
                type="button"
                className={fileStyles.treeActBtn}
                title={t('python.filesRename')}
                aria-label={`${t('python.filesRename')} ${entry.path}`}
                disabled={disabled || busy}
                data-testid={`python-rename-btn-${entry.path}`}
                onClick={() => openAction({ kind: 'rename', path: entry.path })}
              >
                &#9998;
              </button>
              <button
                type="button"
                className={fileStyles.treeActBtn}
                title={t('python.filesMove')}
                aria-label={`${t('python.filesMove')} ${entry.path}`}
                disabled={disabled || busy}
                data-testid={`python-move-btn-${entry.path}`}
                onClick={() => openAction({ kind: 'move', path: entry.path })}
              >
                &#8644;
              </button>
              <button
                type="button"
                className={[fileStyles.treeActBtn, fileStyles.treeActBtnDanger].join(' ')}
                title={t('python.filesDelete')}
                aria-label={`${t('python.filesDelete')} ${entry.path}`}
                disabled={disabled || busy}
                data-testid={`python-delete-btn-${entry.path}`}
                onClick={() => openAction({ kind: 'delete', path: entry.path })}
              >
                &times;
              </button>
            </div>
          </div>

          {entry.isDir && expanded && children.length > 0 && renderNodes(children, depth + 1)}
        </React.Fragment>
      );
    });

  const usedPct =
    stats && stats.maxWorkspaceBytes > 0
      ? Math.min(100, (stats.totalBytes / stats.maxWorkspaceBytes) * 100)
      : 0;

  return (
    <aside
      className={[fileStyles.filesPane, dragOver ? fileStyles.filesPaneDragOver : '']
        .filter(Boolean)
        .join(' ')}
      aria-label={t('python.filesTitle')}
      data-testid="python-files-panel"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={(e) => {
        void handleDrop(e);
      }}
    >
      <div className={fileStyles.filesHeader}>
        <span className={fileStyles.filesTitle}>{t('python.filesTitle')}</span>
        {stats && (
          <span className={fileStyles.treeSize}>
            {t('python.filesEntriesCount', { count: stats.entryCount })}
          </span>
        )}
      </div>

      {/* File action buttons */}
      <div className={fileStyles.filesToolbar}>
        <button
          type="button"
          className={fileStyles.iconActionBtn}
          disabled={disabled || busy}
          onClick={() => openAction({ kind: 'new-file' })}
          data-testid="python-new-file-btn"
        >
          {t('python.filesNewFile')}
        </button>
        <button
          type="button"
          className={fileStyles.iconActionBtn}
          disabled={disabled || busy}
          onClick={() => openAction({ kind: 'new-folder' })}
          data-testid="python-new-folder-btn"
        >
          {t('python.filesNewFolder')}
        </button>
        <button
          type="button"
          className={fileStyles.iconActionBtn}
          disabled={disabled || busy}
          onClick={() => uploadInputRef.current?.click()}
          data-testid="python-upload-btn"
        >
          {t('python.filesUpload')}
        </button>
        <button
          type="button"
          className={fileStyles.iconActionBtn}
          disabled={disabled || busy}
          onClick={() => zipInputRef.current?.click()}
          data-testid="python-zip-import-btn"
        >
          {t('python.filesImportZip')}
        </button>
        <button
          type="button"
          className={fileStyles.iconActionBtn}
          disabled={disabled || busy || entries.length === 0}
          onClick={() => {
            void onExportZip();
          }}
          data-testid="python-zip-export-btn"
        >
          {t('python.filesExportZip')}
        </button>

        <input
          ref={uploadInputRef}
          type="file"
          multiple
          className={fileStyles.hiddenInput}
          data-testid="python-upload-input"
          onChange={(e) => {
            void handleUploadChange(e);
          }}
        />
        <input
          ref={zipInputRef}
          type="file"
          accept=".zip,application/zip"
          className={fileStyles.hiddenInput}
          data-testid="python-zip-import-input"
          onChange={(e) => {
            void handleZipChange(e);
          }}
        />
      </div>

      {/* Examples picker */}
      <div className={fileStyles.examplesBar}>
        <select
          className={fileStyles.examplesSelect}
          aria-label={t('python.examplesAria')}
          value={selectedExample}
          disabled={disabled || busy}
          data-testid="python-examples-select"
          onChange={(e) => {
            void handleExampleChange(e);
          }}
        >
          <option value="">{t('python.examplesPlaceholder')}</option>
          {PYTHON_EXAMPLES.map((ex) => (
            <option key={ex.id} value={ex.id} title={t(ex.descriptionKey)}>
              {t(ex.titleKey)}
            </option>
          ))}
        </select>
      </div>

      {/* W5 dismissible upload notice (rendered outside program output) */}
      {w5NoticeVisible && (
        <div
          className={fileStyles.w5Notice}
          role="status"
          data-testid="python-w5-notice"
          style={{ margin: '6px 8px 0' }}
        >
          <span>{t('python.w5Notice')}</span>
          <button
            type="button"
            className={fileStyles.w5DismissBtn}
            onClick={onDismissW5}
            data-testid="python-w5-dismiss"
          >
            {t('python.filesDismiss')}
          </button>
        </div>
      )}

      {/* Workspace / ZIP / CAP error alert */}
      {(errorMessage || actionError) && (
        <div className={fileStyles.inlineError} role="alert" data-testid="python-files-error">
          <span>{actionError ?? errorMessage}</span>
          <button
            type="button"
            className={fileStyles.inlineErrorClose}
            aria-label={t('python.filesDismiss')}
            onClick={() => {
              setActionError(null);
              onDismissError();
            }}
          >
            &times;
          </button>
        </div>
      )}

      {/* Inline action form (New File / New Folder / Rename / Move / Delete) */}
      {action && (
        <form
          className={fileStyles.inlineForm}
          data-testid="python-file-action-form"
          onSubmit={(e) => {
            void handleActionSubmit(e);
          }}
        >
          {action.kind === 'delete' ? (
            <>
              <div className={fileStyles.inlineConfirmText}>
                {t('python.filesDeleteConfirm', { path: action.path })}
              </div>
              <div className={fileStyles.inlineFormRow}>
                <button
                  type="button"
                  className={fileStyles.iconActionBtn}
                  onClick={closeAction}
                >
                  {t('python.cancel')}
                </button>
                <button
                  type="submit"
                  className={styles.dangerOutlineBtn}
                  disabled={busy}
                  data-testid="python-delete-confirm"
                >
                  {t('python.filesDelete')}
                </button>
              </div>
            </>
          ) : (
            <>
              <label className={fileStyles.inlineFormLabel} htmlFor="python-file-action-input">
                {action.kind === 'new-file'
                  ? t('python.filesNewFileLabel')
                  : action.kind === 'new-folder'
                    ? t('python.filesNewFolderLabel')
                    : action.kind === 'rename'
                      ? t('python.filesRenameLabel', { path: action.path })
                      : t('python.filesMoveLabel', { path: action.path })}
              </label>
              <input
                id="python-file-action-input"
                type="text"
                className={fileStyles.inlineFormInput}
                value={actionValue}
                onChange={(e) => setActionValue(e.target.value)}
                autoFocus
                spellCheck={false}
                data-testid="python-file-action-input"
              />
              <div className={fileStyles.inlineFormRow}>
                <button
                  type="button"
                  className={fileStyles.iconActionBtn}
                  onClick={closeAction}
                >
                  {t('python.cancel')}
                </button>
                <button
                  type="submit"
                  className={styles.primaryBtnSm}
                  disabled={busy}
                  data-testid="python-file-action-submit"
                >
                  {action.kind === 'new-file' || action.kind === 'new-folder'
                    ? t('python.filesCreate')
                    : t('python.filesSave')}
                </button>
              </div>
            </>
          )}
        </form>
      )}

      {/* File tree list */}
      <div className={fileStyles.treeScroll} data-testid="python-file-tree">
        {tree.length === 0 ? (
          <div className={fileStyles.treeEmpty}>{t('python.filesEmpty')}</div>
        ) : (
          renderNodes(tree, 0)
        )}
      </div>

      {/* Drag-and-drop overlay */}
      {dragOver && (
        <div className={fileStyles.dropOverlay} data-testid="python-drop-overlay">
          <span>{t('python.filesDropOverlay')}</span>
        </div>
      )}

      {/* Storage usage readout */}
      <div className={fileStyles.storageFooter} data-testid="python-storage-usage">
        <div className={fileStyles.storageRow}>
          <span>{t('python.filesStorageLabel')}</span>
          <span>
            {stats
              ? `${formatByteSize(stats.totalBytes)} / ${formatByteSize(stats.maxWorkspaceBytes)}`
              : '0 B / 150.0 MB'}
          </span>
        </div>
        <div className={fileStyles.storageBarTrack}>
          <div
            className={[
              fileStyles.storageBarFill,
              usedPct >= 80 ? fileStyles.storageBarFillWarn : '',
            ]
              .filter(Boolean)
              .join(' ')}
            style={{ width: `${usedPct}%` }}
          />
        </div>
        {storageEstimate?.supported &&
          storageEstimate.usage !== null &&
          storageEstimate.quota !== null && (
            <div className={fileStyles.storageQuotaLine}>
              {t('python.filesBrowserQuota', {
                used: formatByteSize(storageEstimate.usage),
                quota: formatByteSize(storageEstimate.quota),
              })}
            </div>
          )}
        <div className={fileStyles.dropHintLine}>{t('python.filesDropHint')}</div>
      </div>
    </aside>
  );
}
