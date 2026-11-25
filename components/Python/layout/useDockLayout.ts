// State of the Python playground's desktop dock (docs/python/notes-L1.md §5, §8): the stored layout
// (preset or custom tree, splitter sizes per preset, hidden Files) with persistence, the active tab of
// each group (session only), which panels are shown, and the tree actually rendered (hidden Files taken
// out, groups merged in 900–1100 px windows by fitToWidth). Phones do not use the dock (enabled=false).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { findPanel, findSplit, fitToWidth, setSizesById, unmergeSizes, withoutPanels } from '../../../lib/python/layout/model';
import type { FitMerge, GroupNode, LayoutNode, PanelId } from '../../../lib/python/layout/model';
import {
  DEFAULT_LAYOUT,
  isTallLayout,
  loadLayout,
  saveLayout,
  treeForLayout,
} from '../../../lib/python/layout/storage';
import type { LayoutMode, StoredLayout } from '../../../lib/python/layout/storage';

function pageStorage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

const round4 = (v: number) => Math.round(v * 10000) / 10000;

export function useDockLayout(enabled: boolean) {
  const [layout, setLayout] = useState<StoredLayout>(DEFAULT_LAYOUT);
  const loadedRef = useRef(false);
  const [actives, setActives] = useState<Readonly<Record<string, PanelId>>>({});
  const [width, setWidth] = useState(0);

  // Save before load in effect order: the first run (still the default) is skipped, later changes are saved.
  useEffect(() => {
    if (loadedRef.current) saveLayout(pageStorage(), layout);
  }, [layout]);

  useEffect(() => {
    setLayout(loadLayout(pageStorage()));
    loadedRef.current = true;
  }, []);

  const tree = useMemo(() => treeForLayout(layout), [layout]);
  const visibleTree = useMemo<LayoutNode>(
    () => (layout.filesHidden ? withoutPanels(tree, ['files']) ?? tree : tree),
    [tree, layout.filesHidden],
  );
  const fitted = useMemo<{ tree: LayoutNode; merges: FitMerge[] }>(
    () => (width > 0 ? fitToWidth(visibleTree, width) : { tree: visibleTree, merges: [] }),
    [visibleTree, width],
  );
  const shownTree = fitted.tree;
  const mergesRef = useRef(fitted.merges);
  mergesRef.current = fitted.merges;

  const activeOf = useCallback(
    (g: GroupNode): PanelId => {
      const a = actives[g.id];
      return a !== undefined && g.panels.includes(a) ? a : g.active;
    },
    [actives],
  );

  const shownSet = useMemo(() => {
    const set = new Set<PanelId>();
    if (!enabled) return set;
    const visit = (n: LayoutNode) => {
      if (n.kind === 'group') set.add(activeOf(n));
      else n.children.forEach(visit);
    };
    visit(shownTree);
    return set;
  }, [enabled, shownTree, activeOf]);

  const isShown = useCallback((p: PanelId) => shownSet.has(p), [shownSet]);

  const shownTreeRef = useRef(shownTree);
  shownTreeRef.current = shownTree;

  /** Makes a panel the active tab of its group (a run shows the Console, a program opens a display). Never moves it. */
  const activate = useCallback((p: PanelId) => {
    const g = findPanel(shownTreeRef.current, p);
    if (!g) return;
    setActives((prev) => (prev[g.id] === p ? prev : { ...prev, [g.id]: p }));
  }, []);

  const selectTab = useCallback((groupId: string, p: PanelId) => {
    setActives((prev) => (prev[groupId] === p ? prev : { ...prev, [groupId]: p }));
  }, []);

  const choose = useCallback((mode: LayoutMode) => {
    setLayout((prev) => (mode === 'custom' && !prev.custom ? prev : { ...prev, mode }));
  }, []);

  const reset = useCallback(() => {
    setLayout(DEFAULT_LAYOUT);
    setActives({});
  }, []);

  const setFilesHidden = useCallback((hidden: boolean) => {
    setLayout((prev) => (prev.filesHidden === hidden ? prev : { ...prev, filesHidden: hidden }));
  }, []);

  /** Sizes set on the rendered tree (by child id); stored per preset, or in the custom tree. */
  const resizeSplit = useCallback((splitId: string, shownById: Readonly<Record<string, number>>) => {
    const byId = unmergeSizes(shownById, mergesRef.current);
    setLayout((prev) => {
      if (prev.mode === 'custom') {
        if (!prev.custom) return prev;
        return { ...prev, custom: setSizesById(prev.custom, splitId, byId) };
      }
      const next = setSizesById(treeForLayout(prev), splitId, byId);
      const split = findSplit(next, splitId);
      if (!split) return prev;
      const mine = { ...(prev.presetSizes[prev.mode] ?? {}), [splitId]: split.sizes.map(round4) };
      return { ...prev, presetSizes: { ...prev.presetSizes, [prev.mode]: mine } };
    });
  }, []);

  /** Back to the preset's default sizes for one split (double-click or Enter on a splitter). */
  const resetSplit = useCallback((splitId: string) => {
    setLayout((prev) => {
      if (prev.mode === 'custom') return prev;
      const mine = prev.presetSizes[prev.mode];
      if (!mine || !(splitId in mine)) return prev;
      const rest: Record<string, readonly number[]> = { ...mine };
      delete rest[splitId];
      const presetSizes = { ...prev.presetSizes };
      if (Object.keys(rest).length) presetSizes[prev.mode] = rest;
      else delete presetSizes[prev.mode];
      return { ...prev, presetSizes };
    });
  }, []);

  return {
    enabled,
    mode: layout.mode,
    hasCustom: layout.custom !== null,
    tall: isTallLayout(layout),
    filesHidden: layout.filesHidden,
    shownTree,
    activeOf,
    isShown,
    activate,
    selectTab,
    choose,
    reset,
    setFilesHidden,
    resizeSplit,
    resetSplit,
    setWidth,
  };
}

export type DockApi = ReturnType<typeof useDockLayout>;
