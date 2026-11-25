// U2 multi-selection of the Files tree (files and folders): Ctrl/Cmd+click toggles, Shift+click selects a
// range of visible rows from the anchor (Ctrl/Cmd+Shift adds the range), Space toggles the focused row,
// Ctrl/Cmd+A selects every visible row, Esc clears. Select mode (for touch) shows a check box on every row.
// Paths that leave the workspace drop out of the selection by themselves.

import { useCallback, useEffect, useMemo, useState } from 'react';

import { isAtOrUnder } from '../../lib/python/paths';
import type { WorkspaceEntryMeta } from '../../lib/python/storageClient';

export interface TreeSelectionSummary {
  /** Outermost selected paths (a path inside a selected folder counts once), in visible order. */
  readonly roots: readonly string[];
  readonly files: number;
  readonly folders: number;
  /** Entries inside the selected folders, which are deleted with them. */
  readonly inside: number;
}

export function summarizeSelection(
  selected: ReadonlySet<string>,
  entries: readonly WorkspaceEntryMeta[],
  order: readonly string[],
): TreeSelectionSummary {
  const byPath = new Map(entries.map((e) => [e.path, e]));
  const roots: string[] = [];
  const seen = new Set<string>();
  const consider = (p: string) => {
    if (seen.has(p) || !selected.has(p) || !byPath.has(p)) return;
    seen.add(p);
    const parent = p.lastIndexOf('/');
    if (parent > 0 && isAtOrUnder(p.slice(0, parent), selected)) return;
    roots.push(p);
  };
  for (const p of order) consider(p);
  // Selected rows hidden in a collapsed folder still count.
  for (const p of selected) consider(p);
  let files = 0;
  let folders = 0;
  for (const p of roots) {
    if (byPath.get(p)!.isDir) folders += 1;
    else files += 1;
  }
  let inside = 0;
  if (folders > 0) {
    const dirRoots = new Set(roots.filter((p) => byPath.get(p)!.isDir));
    for (const e of entries) {
      if (!dirRoots.has(e.path) && isAtOrUnder(e.path, dirRoots)) inside += 1;
    }
  }
  return { roots, files, folders, inside };
}

export function useTreeSelection(entries: readonly WorkspaceEntryMeta[], order: readonly string[]) {
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());
  const [anchor, setAnchor] = useState<string | null>(null);
  const [selectMode, setSelectMode] = useState(false);

  // Drop paths that no longer exist (deleted, renamed, or changed by a program).
  useEffect(() => {
    setSelected((prev) => {
      if (prev.size === 0) return prev;
      const live = new Set(entries.map((e) => e.path));
      let changed = false;
      const next = new Set<string>();
      for (const p of prev) {
        if (live.has(p)) next.add(p);
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [entries]);

  const toggle = useCallback((path: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
    setAnchor(path);
  }, []);

  const selectRange = useCallback(
    (path: string, additive: boolean) => {
      const from = anchor !== null ? order.indexOf(anchor) : -1;
      const to = order.indexOf(path);
      if (to < 0) return;
      const start = from < 0 ? to : Math.min(from, to);
      const end = from < 0 ? to : Math.max(from, to);
      setSelected((prev) => {
        const next = additive ? new Set(prev) : new Set<string>();
        for (let i = start; i <= end; i += 1) next.add(order[i]);
        return next;
      });
      if (from < 0) setAnchor(path);
    },
    [anchor, order],
  );

  const selectAll = useCallback(() => {
    setSelected(new Set(order));
  }, [order]);

  const clear = useCallback(() => {
    setSelected((prev) => (prev.size === 0 ? prev : new Set()));
  }, []);

  /**
   * Handles a click on a row's main button. Returns true when the click changed the selection
   * (Ctrl/Cmd or Shift held), so the caller skips opening the file or folding the folder.
   */
  const handleRowClick = useCallback(
    (e: React.MouseEvent, path: string): boolean => {
      const mod = e.ctrlKey || e.metaKey;
      if (e.shiftKey) {
        e.preventDefault();
        selectRange(path, mod);
        return true;
      }
      if (mod) {
        e.preventDefault();
        toggle(path);
        return true;
      }
      // A plain click keeps today's behaviour; outside Select mode it also ends a selection.
      setAnchor(path);
      if (!selectMode) clear();
      return false;
    },
    [clear, selectMode, selectRange, toggle],
  );

  /** Space on a row toggles it. Returns true when handled. */
  const handleRowKey = useCallback(
    (e: React.KeyboardEvent, path: string): boolean => {
      if (e.key === ' ' && !e.altKey) {
        e.preventDefault();
        if (e.shiftKey) selectRange(path, true);
        else toggle(path);
        return true;
      }
      return false;
    },
    [selectRange, toggle],
  );

  /** Ctrl/Cmd+A and Esc anywhere in the tree list. */
  const handleTreeKey = useCallback(
    (e: React.KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') && (target as HTMLInputElement).type !== 'checkbox') {
        return;
      }
      if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === 'a' || e.key === 'A')) {
        e.preventDefault();
        selectAll();
        return;
      }
      if (e.key === 'Escape' && (selected.size > 0 || selectMode)) {
        e.preventDefault();
        e.stopPropagation();
        clear();
        if (selected.size === 0) setSelectMode(false);
      }
    },
    [clear, selectAll, selected.size, selectMode],
  );

  const summary = useMemo(() => summarizeSelection(selected, entries, order), [selected, entries, order]);

  return {
    selected,
    selectMode,
    setSelectMode,
    toggle,
    selectAll,
    clear,
    handleRowClick,
    handleRowKey,
    handleTreeKey,
    summary,
    /** Check boxes show in Select mode and whenever something is selected. */
    showChecks: selectMode || selected.size > 0,
  };
}
