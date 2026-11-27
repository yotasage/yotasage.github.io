// Persistent Workspace File Tree panel for /python/main (P3b).
// Supports create file/folder, rename, move, delete, upload, recursive drag-drop (files & folders),
// single-file download, safe ZIP import/export, W5 notice, and storage readout. Examples are loaded from the
// Examples tab (the empty tree points there). U2: several files and folders can be selected (useTreeSelection)
// and deleted or downloaded together, and Reset workspace starts again from a new main.py (WorkspaceDialogs).
// All dynamic strings render strictly as React text nodes (never innerHTML per security.md §4).

import React, { useEffect, useMemo, useRef, useState } from 'react';

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
import { useTreeSelection } from './useTreeSelection';
import type { DeleteSelectionResult } from './useWorkspace';
import { DeleteSelectionDialog, describeCounts, ResetWorkspaceDialog } from './WorkspaceDialogs';

export interface FileTreeProps {
  entries: readonly WorkspaceEntryMeta[];
  activePath: string | null;
  runCreatedPaths: ReadonlySet<string>;
  stats: WorkspaceStats | null;
  storageEstimate: StorageEstimateInfo | null;
  disabled: boolean;
  /** A program is running (Reset is off). */
  running: boolean;
  /** Another tab holds the workspace (Reset is off with that reason). */
  locked: boolean;
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
  onDeleteMany: (paths: readonly string[]) => Promise<DeleteSelectionResult>;
  onResetWorkspace: () => Promise<boolean>;
  onDownload: (path: string) => void;
  onUploadFiles: (files: readonly { path: string; file: File }[], dirs?: readonly string[]) => Promise<void>;
  onImportZip: (file: File) => Promise<void>;
  /** Downloads the workspace, or with `only` just those files and folders, as a ZIP. */
  onExportZip: (only?: readonly string[]) => Promise<void>;
  /** Shows the Examples header tab. */
  onOpenExamples: () => void;
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
  running,
  locked,
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
  onDeleteMany,
  onResetWorkspace,
  onDownload,
  onUploadFiles,
  onImportZip,
  onExportZip,
  onOpenExamples,
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

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [selectionNote, setSelectionNote] = useState<{
    readonly done: string | null;
    readonly failed: readonly { readonly path: string; readonly message: string }[];
  } | null>(null);

  const tree = useMemo(() => buildTree(entries), [entries]);
  // Paths of the rows on screen, top to bottom (Shift+click ranges and Ctrl+A follow it).
  const visibleOrder = useMemo(() => {
    const out: string[] = [];
    const walk = (nodes: readonly TreeNode[]) => {
      for (const n of nodes) {
        out.push(n.entry.path);
        if (n.entry.isDir && !collapsedDirs.has(n.entry.path)) walk(n.children);
      }
    };
    walk(tree);
    return out;
  }, [tree, collapsedDirs]);
  const sel = useTreeSelection(entries, visibleOrder);
  const entryCounts = useMemo(() => {
    let files = 0;
    for (const e of entries) if (!e.isDir) files += 1;
    return { files, folders: entries.length - files };
  }, [entries]);

  const confirmDeleteSelection = async () => {
    const roots = sel.summary.roots;
    if (roots.length === 0 || busy) return;
    const what = describeCounts(t, sel.summary.files, sel.summary.folders);
    setBusy(true);
    try {
      const res = await onDeleteMany(roots);
      setDeleteOpen(false);
      setSelectionNote({ done: res.deleted.length > 0 && res.failed.length === 0 ? what : null, failed: res.failed });
      if (res.failed.length === 0) sel.clear();
    } finally {
      setBusy(false);
    }
  };

  const confirmReset = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const ok = await onResetWorkspace();
      if (ok) {
        setResetOpen(false);
        sel.clear();
        sel.setSelectMode(false);
        setSelectionNote(null);
        closeAction();
      }
    } finally {
      setBusy(false);
    }
  };
  const resetReason = locked ? t('python.filesResetLocked') : running ? t('python.filesResetRunning') : null;
  useEffect(() => {
    if (resetReason) setResetOpen(false);
  }, [resetReason]);

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

  const renderNodes = (nodes: readonly TreeNode[], depth: number): React.ReactNode =>
    nodes.map((node) => {
      const { entry, children } = node;
      const expanded = !collapsedDirs.has(entry.path);
      const isActive = !entry.isDir && activePath === entry.path;
      const isRunCreated = runCreatedPaths.has(entry.path);
      const name = baseName(entry.path);
      const isSelected = sel.selected.has(entry.path);

      return (
        <React.Fragment key={entry.path}>
          <div
            className={[
              fileStyles.treeRow,
              isActive ? fileStyles.treeRowActive : '',
              isSelected ? fileStyles.treeRowSelected : '',
            ]
              .filter(Boolean)
              .join(' ')}
            style={{ paddingLeft: `${6 + depth * 14}px` }}
            data-testid={`python-tree-item-${entry.path}`}
            data-path={entry.path}
            data-is-dir={entry.isDir ? 'true' : 'false'}
            data-created-by-run={isRunCreated ? 'true' : undefined}
            data-selected={isSelected ? 'true' : undefined}
          >
            {sel.showChecks && (
              <label className={fileStyles.treeCheck}>
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => sel.toggle(entry.path)}
                  aria-label={t('python.filesSelectRow', { path: entry.path })}
                  data-testid={`python-tree-check-${entry.path}`}
                />
              </label>
            )}
            <button
              type="button"
              className={fileStyles.treeMainBtn}
              aria-expanded={entry.isDir ? expanded : undefined}
              aria-current={isActive ? 'page' : undefined}
              title={entry.path}
              onMouseDown={(e) => {
                // Keep Shift+click from selecting the text of the rows.
                if (e.shiftKey) e.preventDefault();
              }}
              onClick={(e) => {
                if (sel.handleRowClick(e, entry.path)) return;
                if (entry.isDir) toggleDir(entry.path);
                else onOpenFile(entry.path);
              }}
              onKeyDown={(e) => {
                sel.handleRowKey(e, entry.path);
              }}
              onKeyUp={(e) => {
                // Space toggles the selection (on keydown), so it must not also open the row.
                if (e.key === ' ') e.preventDefault();
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
            {stats.entryCount === 1
              ? t('python.filesEntriesCountOne')
              : t('python.filesEntriesCount', { count: stats.entryCount })}
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
        <button
          type="button"
          className={[fileStyles.iconActionBtn, sel.selectMode ? fileStyles.iconActionBtnOn : ''].filter(Boolean).join(' ')}
          aria-pressed={sel.selectMode}
          title={t('python.filesSelectModeTitle')}
          disabled={entries.length === 0}
          onClick={() => {
            if (sel.selectMode) sel.clear();
            sel.setSelectMode(!sel.selectMode);
          }}
          data-testid="python-select-mode-btn"
        >
          {t('python.filesSelectMode')}
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

      {/* U2 selection bar */}
      {sel.showChecks && (
        <div className={fileStyles.selectionBar} role="group" aria-label={t('python.filesSelectionAria')} data-testid="python-selection-bar">
          <span className={fileStyles.selectionCount} aria-live="polite" data-testid="python-selection-count">
            {t('python.filesSelectedCount', { count: sel.summary.roots.length })}
          </span>
          <button type="button" className={fileStyles.iconActionBtn} onClick={sel.selectAll} data-testid="python-select-all">
            {t('python.filesSelectAll')}
          </button>
          <button
            type="button"
            className={fileStyles.iconActionBtn}
            disabled={busy || sel.summary.roots.length === 0}
            onClick={() => {
              void onExportZip(sel.summary.roots);
            }}
            data-testid="python-selection-zip"
          >
            {t('python.filesZipSelected')}
          </button>
          <button
            type="button"
            className={[fileStyles.iconActionBtn, fileStyles.selectionDangerBtn].join(' ')}
            disabled={disabled || busy || sel.summary.roots.length === 0}
            onClick={() => {
              setSelectionNote(null);
              setDeleteOpen(true);
            }}
            data-testid="python-selection-delete"
          >
            {t('python.filesDeleteSelected')}
          </button>
          <button
            type="button"
            className={fileStyles.iconActionBtn}
            onClick={() => {
              sel.clear();
              sel.setSelectMode(false);
            }}
            data-testid="python-selection-clear"
          >
            {t('python.filesClearSelection')}
          </button>
        </div>
      )}
      {selectionNote && (selectionNote.done || selectionNote.failed.length > 0) && (
        <div
          className={[fileStyles.selectionNote, selectionNote.failed.length > 0 ? fileStyles.selectionNoteBad : '']
            .filter(Boolean)
            .join(' ')}
          role={selectionNote.failed.length > 0 ? 'alert' : 'status'}
          data-testid="python-selection-note"
        >
          {selectionNote.failed.length > 0 ? (
            <>
              <span>{t('python.filesDeleteManyFailed')}</span>
              <ul>
                {selectionNote.failed.map((f) => (
                  <li key={f.path}>{t('python.filesDeleteManyFailedItem', { path: f.path, message: f.message })}</li>
                ))}
              </ul>
            </>
          ) : (
            <span>{t('python.filesDeleteManyDone', { what: selectionNote.done ?? '' })}</span>
          )}
          <button type="button" className={fileStyles.inlineErrorClose} aria-label={t('python.filesDismiss')} onClick={() => setSelectionNote(null)}>
            &times;
          </button>
        </div>
      )}

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
      <div className={fileStyles.treeScroll} data-testid="python-file-tree" onKeyDown={sel.handleTreeKey}>
        {tree.length === 0 ? (
          <div className={fileStyles.treeEmpty} data-testid="python-tree-empty">
            <p className={fileStyles.treeEmptyText}>{t('python.filesEmpty')}</p>
            <button type="button" className={fileStyles.treeEmptyLink} onClick={onOpenExamples} data-testid="python-tree-open-examples">
              {t('python.filesOpenExamples')}
            </button>
          </div>
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
        <div className={fileStyles.resetRow}>
          <button
            type="button"
            className={fileStyles.resetBtn}
            title={resetReason ?? t('python.filesResetTitle')}
            aria-describedby={resetReason ? 'python-reset-reason' : undefined}
            disabled={disabled || busy || resetReason !== null}
            onClick={() => setResetOpen(true)}
            data-testid="python-reset-btn"
          >
            {t('python.filesReset')}
          </button>
          {resetReason && (
            <span id="python-reset-reason" className={fileStyles.resetReason} data-testid="python-reset-reason">
              {resetReason}
            </span>
          )}
        </div>
      </div>

      <DeleteSelectionDialog
        open={deleteOpen}
        summary={sel.summary}
        busy={busy}
        onCancel={() => setDeleteOpen(false)}
        onConfirm={() => {
          void confirmDeleteSelection();
        }}
      />
      <ResetWorkspaceDialog
        open={resetOpen && resetReason === null}
        files={entryCounts.files}
        folders={entryCounts.folders}
        totalBytes={stats?.totalBytes ?? 0}
        busy={busy}
        onCancel={() => setResetOpen(false)}
        onDownloadZip={() => {
          void onExportZip();
        }}
        onConfirm={() => {
          void confirmReset();
        }}
      />
    </aside>
  );
}
