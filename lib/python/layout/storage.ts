// The stored desktop layout of the Python playground (localStorage `python:layout-v1`, page only; W9
// "Clear all data" removes every `python:*` key). Anything that is not exactly the expected shape, or
// breaks an invariant of model.ts, falls back to Classic and the key is removed.
import { checkTree, findSplit, isValidNodeId, MAX_SPLIT_CHILDREN, MIN_FRACTION } from './model';
import type { LayoutNode } from './model';
import { DEFAULT_PRESET, isPresetId, PRESETS, presetTree } from './presets';
import type { PresetId } from './presets';

export const LAYOUT_STORAGE_KEY = 'python:layout-v1';
export const MAX_STORED_CHARS = 8192;

export type LayoutMode = PresetId | 'custom';
export type PresetSizes = Readonly<Record<string, readonly number[]>>;

export interface StoredLayout {
  readonly v: 1;
  readonly mode: LayoutMode;
  /** Last custom tree (kept while a preset is chosen; L2b makes it). */
  readonly custom: LayoutNode | null;
  /** Splitter sizes changed by the visitor: preset → split id → sizes. */
  readonly presetSizes: Readonly<Partial<Record<PresetId, PresetSizes>>>;
  readonly filesHidden: boolean;
}

export const DEFAULT_LAYOUT: StoredLayout = {
  v: 1,
  mode: DEFAULT_PRESET,
  custom: null,
  presetSizes: {},
  filesHidden: false,
};

function isPlainObject(x: unknown): x is Record<string, unknown> {
  if (typeof x !== 'object' || x === null || Array.isArray(x)) return false;
  const proto = Object.getPrototypeOf(x);
  return proto === Object.prototype || proto === null;
}

function parsePresetSizes(x: unknown): Partial<Record<PresetId, PresetSizes>> | null {
  if (!isPlainObject(x)) return null;
  const out: Partial<Record<PresetId, PresetSizes>> = {};
  for (const [preset, bySplit] of Object.entries(x)) {
    if (!isPresetId(preset) || !isPlainObject(bySplit)) return null;
    const sizes: Record<string, readonly number[]> = {};
    for (const [splitId, arr] of Object.entries(bySplit)) {
      if (!isValidNodeId(splitId) || !Array.isArray(arr)) return null;
      if (arr.length < 2 || arr.length > MAX_SPLIT_CHILDREN) return null;
      if (!arr.every((v) => typeof v === 'number' && Number.isFinite(v) && v >= MIN_FRACTION - 1e-6 && v <= 1)) return null;
      if (Math.abs(arr.reduce((a: number, v: number) => a + v, 0) - 1) > 1e-3) return null;
      const split = findSplit(PRESETS[preset].tree, splitId);
      if (!split || split.children.length !== arr.length) return null;
      sizes[splitId] = arr.slice() as number[];
    }
    if (checkTree(presetTree(preset, sizes)) !== null) return null;
    out[preset] = sizes;
  }
  return out;
}

/** Reads a stored value: null (nothing stored) gives the default; a bad value gives null. */
export function parseStoredLayout(raw: string | null): StoredLayout | null {
  if (raw === null) return DEFAULT_LAYOUT;
  if (typeof raw !== 'string' || raw.length > MAX_STORED_CHARS) return null;
  let x: unknown;
  try {
    x = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isPlainObject(x)) return null;
  const keys = Object.keys(x);
  const want = ['v', 'mode', 'custom', 'presetSizes', 'filesHidden'];
  if (keys.length !== want.length || !want.every((k) => keys.includes(k))) return null;
  if (x.v !== 1) return null;
  if (x.mode !== 'custom' && !isPresetId(x.mode)) return null;
  if (typeof x.filesHidden !== 'boolean') return null;
  let custom: LayoutNode | null = null;
  if (x.custom !== null) {
    if (checkTree(x.custom) !== null) return null;
    custom = x.custom as LayoutNode;
  }
  if (x.mode === 'custom' && !custom) return null;
  const presetSizes = parsePresetSizes(x.presetSizes);
  if (!presetSizes) return null;
  return { v: 1, mode: x.mode, custom, presetSizes, filesHidden: x.filesHidden };
}

export function serializeLayout(layout: StoredLayout): string {
  return JSON.stringify(layout);
}

/** The tree a stored layout shows (before hidden panels are taken out and narrow windows merge groups). */
export function treeForLayout(layout: StoredLayout): LayoutNode {
  if (layout.mode === 'custom') return layout.custom ?? PRESETS[DEFAULT_PRESET].tree;
  return presetTree(layout.mode, layout.presetSizes[layout.mode]);
}

/** Whether the shown preset has a full-width bottom row (a custom tree: a column split at the root). */
export function isTallLayout(layout: StoredLayout): boolean {
  if (layout.mode !== 'custom') return PRESETS[layout.mode].tall;
  const t = layout.custom;
  return Boolean(t && t.kind === 'split' && t.dir === 'column');
}

type LayoutStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** Loads the stored layout; a bad value is removed and Classic comes back. Never throws. */
export function loadLayout(storage: LayoutStorage | null): StoredLayout {
  if (!storage) return DEFAULT_LAYOUT;
  let raw: string | null = null;
  try {
    raw = storage.getItem(LAYOUT_STORAGE_KEY);
  } catch {
    return DEFAULT_LAYOUT;
  }
  const parsed = parseStoredLayout(raw);
  if (parsed) return parsed;
  try {
    storage.removeItem(LAYOUT_STORAGE_KEY);
  } catch {
    // Storage blocked: the default is used for this page load.
  }
  return DEFAULT_LAYOUT;
}

/** Saves the layout; the default layout removes the key. Never throws. */
export function saveLayout(storage: LayoutStorage | null, layout: StoredLayout): void {
  if (!storage) return;
  try {
    const isDefault =
      layout.mode === DEFAULT_PRESET && !layout.custom && !layout.filesHidden && Object.keys(layout.presetSizes).length === 0;
    if (isDefault) storage.removeItem(LAYOUT_STORAGE_KEY);
    else storage.setItem(LAYOUT_STORAGE_KEY, serializeLayout(layout));
  } catch {
    // Storage full or blocked: the layout lasts for this page load only.
  }
}
