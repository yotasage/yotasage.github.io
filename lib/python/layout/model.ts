// Layout model of the Python playground's desktop dock (docs/python/notes-L1.md §5): a split tree of
// tab groups that holds the six panels, its validation, and pure tree operations (every operation
// returns a new tree). Framework-free and erasable TypeScript only: the harness imports this file
// directly (scripts/harness/python/layout-unit-checks.mjs).

export type PanelId = 'files' | 'editor' | 'console' | 'repl' | 'plots' | 'display';
/** row: children left to right; column: top to bottom. */
export type SplitDir = 'row' | 'column';
export type Edge = 'left' | 'right' | 'top' | 'bottom';

export interface GroupNode {
  readonly kind: 'group';
  readonly id: string;
  readonly panels: readonly PanelId[];
  readonly active: PanelId;
}

export interface SplitNode {
  readonly kind: 'split';
  readonly id: string;
  readonly dir: SplitDir;
  readonly children: readonly LayoutNode[];
  /** Fractions of the split's length, one per child, sum 1. */
  readonly sizes: readonly number[];
}

export type LayoutNode = GroupNode | SplitNode;

/** Where a panel can be moved to (L2b: drag and drop, Move to…). */
export type DropTarget =
  | { readonly kind: 'tab'; readonly groupId: string; readonly index: number }
  | { readonly kind: 'edge'; readonly groupId: string; readonly edge: Edge }
  | { readonly kind: 'page'; readonly edge: 'bottom' | 'right' };

export interface Size {
  readonly w: number;
  readonly h: number;
}

export const PANEL_IDS: readonly PanelId[] = ['files', 'editor', 'console', 'repl', 'plots', 'display'];
export const OUTPUT_PANELS: readonly PanelId[] = ['console', 'repl', 'plots', 'display'];

/** Smallest size of each panel's body in CSS px. */
export const PANEL_MIN: Readonly<Record<PanelId, Size>> = {
  editor: { w: 320, h: 200 },
  files: { w: 180, h: 160 },
  console: { w: 260, h: 120 },
  repl: { w: 260, h: 120 },
  plots: { w: 260, h: 160 },
  display: { w: 240, h: 160 },
};

export const SPLITTER_PX = 8;
/** Height of a group's tab strip (fixed in styles/PythonLayout.module.css). */
export const GROUP_HEADER_PX = 44;
/** A group's card border on both sides (the 2 px "Program output" frame). */
export const GROUP_BORDER_PX = 4;
export const MIN_FRACTION = 0.05;
export const MAX_SPLIT_DEPTH = 4;
export const MAX_GROUPS = 6;
export const MAX_SPLIT_CHILDREN = 6;
const ID_RE = /^[a-z0-9-]{1,24}$/;
const SUM_EPS = 1e-3;

export function isPanelId(x: unknown): x is PanelId {
  return typeof x === 'string' && (PANEL_IDS as readonly string[]).includes(x);
}

export function isOutputPanel(p: PanelId): boolean {
  return OUTPUT_PANELS.includes(p);
}

export function isValidNodeId(x: unknown): x is string {
  return typeof x === 'string' && ID_RE.test(x);
}

/** A group shows a tab strip unless it holds only the Editor or only Files (they have their own headers). */
export function groupHasHeader(g: GroupNode): boolean {
  return !(g.panels.length === 1 && (g.panels[0] === 'editor' || g.panels[0] === 'files'));
}

// ---------------------------------------------------------------------------------------- validation

function isPlainObject(x: unknown): x is Record<string, unknown> {
  if (typeof x !== 'object' || x === null || Array.isArray(x)) return false;
  const proto = Object.getPrototypeOf(x);
  return proto === Object.prototype || proto === null;
}

function hasExactKeys(o: Record<string, unknown>, keys: readonly string[]): boolean {
  const own = Object.keys(o);
  return own.length === keys.length && keys.every((k) => Object.prototype.hasOwnProperty.call(o, k));
}

/**
 * Checks shape and invariants of a tree (stored or built): every panel in exactly one group, groups
 * never empty, `active` in the group, the Editor alone, splits of 2–6 children with sizes ≥ 5 % that sum
 * to 1, a split child never in its parent's direction, unique ids, split depth ≤ 4, at most 6 groups.
 * Returns null when valid, else the first problem found.
 */
export function checkTree(x: unknown): string | null {
  const seenPanels = new Set<PanelId>();
  const ids = new Set<string>();
  let groups = 0;

  const visit = (n: unknown, depth: number, parentDir: SplitDir | null): string | null => {
    if (!isPlainObject(n)) return 'node is not an object';
    if (!isValidNodeId(n.id)) return 'bad node id';
    if (ids.has(n.id)) return `duplicate id ${n.id}`;
    ids.add(n.id);
    if (n.kind === 'group') {
      if (!hasExactKeys(n, ['kind', 'id', 'panels', 'active'])) return `group ${n.id}: unexpected keys`;
      groups += 1;
      const panels = n.panels;
      if (!Array.isArray(panels) || panels.length === 0) return `group ${n.id}: no panels`;
      for (const p of panels) {
        if (!isPanelId(p)) return `group ${n.id}: unknown panel`;
        if (seenPanels.has(p)) return `panel ${p} appears twice`;
        seenPanels.add(p);
      }
      if (panels.includes('editor') && panels.length !== 1) return 'the editor must be alone in its group';
      if (!isPanelId(n.active) || !panels.includes(n.active)) return `group ${n.id}: active panel not in group`;
      return null;
    }
    if (n.kind === 'split') {
      if (!hasExactKeys(n, ['kind', 'id', 'dir', 'children', 'sizes'])) return `split ${n.id}: unexpected keys`;
      if (n.dir !== 'row' && n.dir !== 'column') return `split ${n.id}: bad direction`;
      if (n.dir === parentDir) return `split ${n.id}: same direction as its parent`;
      if (depth + 1 > MAX_SPLIT_DEPTH) return 'splits nested too deep';
      const { children, sizes } = n;
      if (!Array.isArray(children) || children.length < 2 || children.length > MAX_SPLIT_CHILDREN) {
        return `split ${n.id}: needs 2–${MAX_SPLIT_CHILDREN} children`;
      }
      if (!Array.isArray(sizes) || sizes.length !== children.length) return `split ${n.id}: sizes do not match children`;
      let sum = 0;
      for (const s of sizes) {
        if (typeof s !== 'number' || !Number.isFinite(s) || s < MIN_FRACTION - 1e-6) return `split ${n.id}: size too small`;
        sum += s;
      }
      if (Math.abs(sum - 1) > SUM_EPS) return `split ${n.id}: sizes do not sum to 1`;
      for (const c of children) {
        const err = visit(c, depth + 1, n.dir);
        if (err) return err;
      }
      return null;
    }
    return 'unknown node kind';
  };

  const err = visit(x, 0, null);
  if (err) return err;
  for (const p of PANEL_IDS) if (!seenPanels.has(p)) return `panel ${p} is missing`;
  if (groups > MAX_GROUPS) return 'too many groups';
  return null;
}

// ------------------------------------------------------------------------------------------- queries

export function allGroups(node: LayoutNode): GroupNode[] {
  if (node.kind === 'group') return [node];
  return node.children.flatMap(allGroups);
}

export function allIds(node: LayoutNode): string[] {
  if (node.kind === 'group') return [node.id];
  return [node.id, ...node.children.flatMap(allIds)];
}

export function findNode(node: LayoutNode, id: string): LayoutNode | null {
  if (node.id === id) return node;
  if (node.kind === 'split') {
    for (const c of node.children) {
      const f = findNode(c, id);
      if (f) return f;
    }
  }
  return null;
}

export function findGroup(node: LayoutNode, id: string): GroupNode | null {
  const n = findNode(node, id);
  return n && n.kind === 'group' ? n : null;
}

export function findSplit(node: LayoutNode, id: string): SplitNode | null {
  const n = findNode(node, id);
  return n && n.kind === 'split' ? n : null;
}

/** The group that holds a panel. */
export function findPanel(node: LayoutNode, panel: PanelId): GroupNode | null {
  return allGroups(node).find((g) => g.panels.includes(panel)) ?? null;
}

export function splitDepth(node: LayoutNode): number {
  if (node.kind === 'group') return 0;
  return 1 + Math.max(...node.children.map(splitDepth));
}

/** A free id with this prefix (`g-1`, `s-2`, …). */
export function uniqueId(tree: LayoutNode, prefix: string): string {
  const used = new Set(allIds(tree));
  for (let n = 1; ; n += 1) {
    const id = `${prefix}-${n}`;
    if (!used.has(id)) return id;
  }
}

// ------------------------------------------------------------------------------------------- sizes

/** Renormalises to sum 1 with every size ≥ MIN_FRACTION (water-filling), keeping proportions otherwise. */
export function fixSizes(raw: readonly number[]): number[] {
  const n = raw.length;
  if (n === 0) return [];
  const vals = raw.map((v) => (Number.isFinite(v) && v > 0 ? v : 0));
  const total = vals.reduce((a, b) => a + b, 0);
  const s = total > 0 ? vals.map((v) => v / total) : vals.map(() => 1 / n);
  if (n * MIN_FRACTION >= 1) return s.map(() => 1 / n);
  const fixed = s.map(() => false);
  for (let iter = 0; iter <= n; iter += 1) {
    let freeSum = 0;
    let fixedCount = 0;
    for (let i = 0; i < n; i += 1) {
      if (fixed[i]) fixedCount += 1;
      else freeSum += s[i];
    }
    const room = 1 - fixedCount * MIN_FRACTION;
    if (freeSum <= 0) {
      const free = n - fixedCount;
      return s.map((_, i) => (fixed[i] ? MIN_FRACTION : room / free));
    }
    const scale = room / freeSum;
    let changed = false;
    for (let i = 0; i < n; i += 1) {
      if (!fixed[i] && s[i] * scale < MIN_FRACTION) {
        fixed[i] = true;
        changed = true;
      }
    }
    if (!changed) return s.map((v, i) => (fixed[i] ? MIN_FRACTION : v * scale));
  }
  return s.map(() => 1 / n);
}

/**
 * Moves the boundary between children `index` and `index + 1` by `delta` (a fraction of the split),
 * keeping each of the two at least its minimum fraction; the other children keep their sizes.
 */
export function resizeBoundary(
  sizes: readonly number[],
  index: number,
  delta: number,
  minFractions: readonly number[],
): number[] {
  const out = sizes.slice();
  if (index < 0 || index + 1 >= sizes.length || !Number.isFinite(delta)) return out;
  const a = sizes[index];
  const b = sizes[index + 1];
  const pair = a + b;
  const minA = Math.max(MIN_FRACTION, minFractions[index] ?? 0);
  const minB = Math.max(MIN_FRACTION, minFractions[index + 1] ?? 0);
  let na: number;
  if (minA + minB >= pair) na = (pair * minA) / (minA + minB);
  else na = Math.min(pair - minB, Math.max(minA, a + delta));
  out[index] = na;
  out[index + 1] = pair - na;
  return out;
}

/** Smallest size of a node in CSS px (groups: largest panel minimum, plus the tab strip and the border). */
export function minSize(node: LayoutNode): Size {
  if (node.kind === 'group') {
    let w = 0;
    let h = 0;
    for (const p of node.panels) {
      w = Math.max(w, PANEL_MIN[p].w);
      h = Math.max(h, PANEL_MIN[p].h);
    }
    return { w: w + GROUP_BORDER_PX, h: h + GROUP_BORDER_PX + (groupHasHeader(node) ? GROUP_HEADER_PX : 0) };
  }
  const kids = node.children.map(minSize);
  const gaps = (kids.length - 1) * SPLITTER_PX;
  if (node.dir === 'row') {
    return { w: kids.reduce((a, k) => a + k.w, 0) + gaps, h: Math.max(...kids.map((k) => k.h)) };
  }
  return { w: Math.max(...kids.map((k) => k.w)), h: kids.reduce((a, k) => a + k.h, 0) + gaps };
}

// -------------------------------------------------------------------------------------- operations

/** Removes empty groups, collapses one-child splits, flattens same-direction splits, fixes sizes and active tabs. */
export function normalize(node: LayoutNode): LayoutNode | null {
  if (node.kind === 'group') {
    if (node.panels.length === 0) return null;
    return node.panels.includes(node.active) ? node : { ...node, active: node.panels[0] };
  }
  const kids: LayoutNode[] = [];
  const sizes: number[] = [];
  node.children.forEach((c, i) => {
    const n = normalize(c);
    if (!n) return;
    const s = node.sizes[i] ?? 0;
    if (n.kind === 'split' && n.dir === node.dir) {
      n.children.forEach((cc, j) => {
        kids.push(cc);
        sizes.push(s * (n.sizes[j] ?? 0));
      });
    } else {
      kids.push(n);
      sizes.push(s);
    }
  });
  if (kids.length === 0) return null;
  if (kids.length === 1) return kids[0];
  return { ...node, children: kids, sizes: fixSizes(sizes) };
}

function mapGroups(node: LayoutNode, fn: (g: GroupNode) => LayoutNode): LayoutNode {
  if (node.kind === 'group') return fn(node);
  return { ...node, children: node.children.map((c) => mapGroups(c, fn)) };
}

function mapSplit(node: LayoutNode, id: string, fn: (s: SplitNode) => SplitNode): LayoutNode {
  if (node.kind === 'group') return node;
  if (node.id === id) return fn(node);
  return { ...node, children: node.children.map((c) => mapSplit(c, id, fn)) };
}

/** Takes a panel out of its group; an emptied group disappears and its split collapses. */
export function removePanel(tree: LayoutNode, panel: PanelId): LayoutNode | null {
  const next = mapGroups(tree, (g) => {
    const at = g.panels.indexOf(panel);
    if (at < 0) return g;
    const panels = g.panels.filter((p) => p !== panel);
    const active = g.active !== panel ? g.active : (panels[Math.min(at, panels.length - 1)] ?? g.active);
    return { ...g, panels, active };
  });
  return normalize(next);
}

/** Removes several panels (hidden Files) for rendering; null when nothing is left. */
export function withoutPanels(tree: LayoutNode, panels: readonly PanelId[]): LayoutNode | null {
  let t: LayoutNode | null = tree;
  for (const p of panels) {
    if (!t) return null;
    t = removePanel(t, p);
  }
  return t;
}

/** Adds a panel (not in the tree) as a tab of a group and makes it active. Null if not allowed. */
export function insertTab(tree: LayoutNode, groupId: string, panel: PanelId, index: number): LayoutNode | null {
  const g = findGroup(tree, groupId);
  if (!g || panel === 'editor' || g.panels.includes('editor') || g.panels.includes(panel)) return null;
  const at = Math.max(0, Math.min(g.panels.length, Math.floor(index)));
  return mapGroups(tree, (x) =>
    x.id === groupId ? { ...x, panels: [...x.panels.slice(0, at), panel, ...x.panels.slice(at)], active: panel } : x,
  );
}

function newGroup(tree: LayoutNode, panel: PanelId): GroupNode {
  return { kind: 'group', id: uniqueId(tree, 'g'), panels: [panel], active: panel };
}

/** Puts a panel (not in the tree) in a new group on one edge of a group, taking half its size. */
export function splitGroup(tree: LayoutNode, groupId: string, edge: Edge, panel: PanelId): LayoutNode | null {
  const g = findGroup(tree, groupId);
  if (!g) return null;
  const ng = newGroup(tree, panel);
  const splitId = uniqueId({ kind: 'split', id: '-', dir: 'row', children: [tree, ng], sizes: [0.5, 0.5] }, 's');
  const dir: SplitDir = edge === 'left' || edge === 'right' ? 'row' : 'column';
  const first = edge === 'left' || edge === 'top';
  const replace = (node: LayoutNode): LayoutNode => {
    if (node.kind === 'group') {
      if (node.id !== groupId) return node;
      return { kind: 'split', id: splitId, dir, children: first ? [ng, node] : [node, ng], sizes: [0.5, 0.5] };
    }
    return { ...node, children: node.children.map(replace) };
  };
  return normalize(replace(tree));
}

/** Default share of a page-edge group: full width at the bottom, full height at the right. */
export const PAGE_EDGE_FRACTION: Readonly<Record<'bottom' | 'right', number>> = { bottom: 0.32, right: 0.3 };

/** Puts a panel (not in the tree) in a new group along the whole bottom or right edge of the dock. */
export function splitPage(tree: LayoutNode, edge: 'bottom' | 'right', panel: PanelId): LayoutNode | null {
  const ng = newGroup(tree, panel);
  const frac = PAGE_EDGE_FRACTION[edge];
  const splitId = uniqueId({ kind: 'split', id: '-', dir: 'row', children: [tree, ng], sizes: [0.5, 0.5] }, 's');
  return normalize({
    kind: 'split',
    id: splitId,
    dir: edge === 'bottom' ? 'column' : 'row',
    children: [tree, ng],
    sizes: [1 - frac, frac],
  });
}

/**
 * Moves a panel to a drop target (remove, then insert). A move onto the panel's own one-panel group is a
 * no-op (the same tree comes back); a target that would break an invariant gives null.
 */
export function movePanel(tree: LayoutNode, panel: PanelId, target: DropTarget): LayoutNode | null {
  const own = findPanel(tree, panel);
  if (!own) return null;
  if (target.kind !== 'page') {
    const g = findGroup(tree, target.groupId);
    if (!g) return null;
    if (g.id === own.id && own.panels.length === 1) return tree;
    if (target.kind === 'tab' && g.id === own.id) {
      const from = own.panels.indexOf(panel);
      const rest = own.panels.filter((p) => p !== panel);
      let at = Math.max(0, Math.min(own.panels.length, Math.floor(target.index)));
      if (at > from) at -= 1;
      const panels = [...rest.slice(0, at), panel, ...rest.slice(at)];
      return mapGroups(tree, (x) => (x.id === own.id ? { ...x, panels, active: panel } : x));
    }
  }
  const removed = removePanel(tree, panel);
  if (!removed) return null;
  let out: LayoutNode | null;
  if (target.kind === 'tab') out = insertTab(removed, target.groupId, panel, target.index);
  else if (target.kind === 'edge') out = splitGroup(removed, target.groupId, target.edge, panel);
  else out = splitPage(removed, target.edge, panel);
  return out && checkTree(out) === null ? out : null;
}

/** True when two trees arrange the panels the same way (shape, ids, panel order, sizes); the stored active tabs are ignored. */
export function sameArrangement(a: LayoutNode, b: LayoutNode): boolean {
  const key = (t: LayoutNode) => JSON.stringify(t, (k, v: unknown) => (k === 'active' ? undefined : v));
  return a === b || key(a) === key(b);
}

/** movePanel for drag and drop and Move to…: the new tree, or null when the move is not allowed or changes nothing (a drop onto its own place). */
export function moveIfChanged(tree: LayoutNode, panel: PanelId, target: DropTarget): LayoutNode | null {
  const next = movePanel(tree, panel, target);
  return next && !sameArrangement(next, tree) ? next : null;
}

/** The targets a "Move to…" menu offers for a panel (each one valid): other groups' tab strips, their bottom and right edges, and the two page edges. */
export function moveTargets(tree: LayoutNode, panel: PanelId): DropTarget[] {
  const own = findPanel(tree, panel);
  if (!own) return [];
  const out: DropTarget[] = [];
  for (const g of allGroups(tree)) {
    if (g.id !== own.id) out.push({ kind: 'tab', groupId: g.id, index: g.panels.length });
    out.push({ kind: 'edge', groupId: g.id, edge: 'bottom' }, { kind: 'edge', groupId: g.id, edge: 'right' });
  }
  out.push({ kind: 'page', edge: 'bottom' }, { kind: 'page', edge: 'right' });
  return out.filter((t) => {
    const r = movePanel(tree, panel, t);
    return r !== null && r !== tree;
  });
}

export function setActive(tree: LayoutNode, groupId: string, panel: PanelId): LayoutNode {
  return mapGroups(tree, (g) => (g.id === groupId && g.panels.includes(panel) ? { ...g, active: panel } : g));
}

/** Replaces a split's sizes (fixed to the invariants); unchanged when the split or the length does not match. */
export function setSizes(tree: LayoutNode, splitId: string, sizes: readonly number[]): LayoutNode {
  return mapSplit(tree, splitId, (s) => (sizes.length === s.children.length ? { ...s, sizes: fixSizes(sizes) } : s));
}

/**
 * Sets the sizes of some children of a split by child id (the ones shown when others are hidden or merged);
 * the children not listed keep their fractions, the listed ones share the rest in the given proportions.
 */
export function setSizesById(tree: LayoutNode, splitId: string, byId: Readonly<Record<string, number>>): LayoutNode {
  return mapSplit(tree, splitId, (s) => {
    const listed = s.children.map((c) => Object.prototype.hasOwnProperty.call(byId, c.id));
    if (!listed.some(Boolean)) return s;
    const unlistedSum = s.sizes.reduce((a, v, i) => (listed[i] ? a : a + v), 0);
    const givenSum = s.children.reduce((a, c, i) => (listed[i] ? a + Math.max(0, byId[c.id] || 0) : a), 0);
    if (givenSum <= 0) return s;
    const room = Math.max(0, 1 - unlistedSum);
    const sizes = s.children.map((c, i) => (listed[i] ? (Math.max(0, byId[c.id] || 0) / givenSum) * room : s.sizes[i]));
    return { ...s, sizes: fixSizes(sizes) };
  });
}

/** One merge made by fitToWidth: `from` was tabbed into `into`, which had `shareInto` of their total size. */
export interface FitMerge {
  readonly into: string;
  readonly from: string;
  readonly shareInto: number;
}

/**
 * Narrow windows (900–~1100 px): while the tree's minimum width exceeds `width`, merges the adjacent pair of
 * non-Editor groups with the smallest minimum width in the widest row into one tabbed group. The result is
 * for rendering only (never stored).
 */
export function fitToWidth(tree: LayoutNode, width: number): { tree: LayoutNode; merges: FitMerge[] } {
  let t = tree;
  const merges: FitMerge[] = [];
  for (let iter = 0; iter < MAX_GROUPS && minSize(t).w > width; iter += 1) {
    const rows: SplitNode[] = [];
    const collect = (n: LayoutNode) => {
      if (n.kind === 'group') return;
      if (n.dir === 'row') rows.push(n);
      n.children.forEach(collect);
    };
    collect(t);
    rows.sort((a, b) => minSize(b).w - minSize(a).w);
    let pick: { split: SplitNode; i: number } | null = null;
    for (const r of rows) {
      let best = -1;
      let bestW = Infinity;
      for (let i = 0; i + 1 < r.children.length; i += 1) {
        const a = r.children[i];
        const b = r.children[i + 1];
        if (a.kind !== 'group' || b.kind !== 'group') continue;
        if (a.panels.includes('editor') || b.panels.includes('editor')) continue;
        const w = minSize(a).w + minSize(b).w;
        if (w < bestW) {
          bestW = w;
          best = i;
        }
      }
      if (best >= 0) {
        pick = { split: r, i: best };
        break;
      }
    }
    if (!pick) break;
    const { split, i } = pick;
    const a = split.children[i] as GroupNode;
    const b = split.children[i + 1] as GroupNode;
    const sa = split.sizes[i];
    const sb = split.sizes[i + 1];
    const merged: GroupNode = { kind: 'group', id: a.id, panels: [...a.panels, ...b.panels], active: a.active };
    merges.push({ into: a.id, from: b.id, shareInto: sa / (sa + sb) });
    const next = mapSplit(t, split.id, (s) => ({
      ...s,
      children: [...s.children.slice(0, i), merged, ...s.children.slice(i + 2)],
      sizes: [...s.sizes.slice(0, i), sa + sb, ...s.sizes.slice(i + 2)],
    }));
    t = normalize(next) ?? t;
  }
  return { tree: t, merges };
}

/** Turns sizes set on a fitted tree back into sizes of the groups it merged (reverse order of the merges). */
export function unmergeSizes(byId: Readonly<Record<string, number>>, merges: readonly FitMerge[]): Record<string, number> {
  const out: Record<string, number> = { ...byId };
  for (let k = merges.length - 1; k >= 0; k -= 1) {
    const m = merges[k];
    if (!Object.prototype.hasOwnProperty.call(out, m.into)) continue;
    const v = out[m.into];
    out[m.into] = v * m.shareInto;
    out[m.from] = v * (1 - m.shareInto);
  }
  return out;
}
