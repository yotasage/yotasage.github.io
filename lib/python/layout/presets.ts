// The Python playground's layout presets as data (docs/python/notes-L1.md §6). Sizes are the defaults;
// a visitor's splitter changes are stored per preset and split id (storage.ts). Every preset fits a
// 1280×720 window with all minimum sizes kept (checked by scripts/harness/python/layout-unit-checks.mjs
// and ui-layout-checks.mjs).
import { checkTree, setSizes } from './model';
import type { GroupNode, LayoutNode, PanelId, SplitDir, SplitNode } from './model';

export type PresetId = 'classic' | 'consoleBelow' | 'wideOutput' | 'sideBySide' | 'editorFocus' | 'displayFocus';

export const PRESET_IDS: readonly PresetId[] = [
  'classic',
  'consoleBelow',
  'wideOutput',
  'sideBySide',
  'editorFocus',
  'displayFocus',
];

export const DEFAULT_PRESET: PresetId = 'classic';

export interface Preset {
  readonly id: PresetId;
  readonly tree: LayoutNode;
  /** Has a full-width bottom row, so the dock gets the taller minimum height. */
  readonly tall: boolean;
}

/** Minimum dock heights in CSS px (styles/PythonLayout.module.css uses the same numbers). */
export const DOCK_MIN_HEIGHT = 540;
export const DOCK_MIN_HEIGHT_TALL = 640;

const g = (id: string, panels: readonly PanelId[]): GroupNode => ({ kind: 'group', id, panels, active: panels[0] });
const s = (id: string, dir: SplitDir, children: readonly LayoutNode[], sizes: readonly number[]): SplitNode => ({
  kind: 'split',
  id,
  dir,
  children,
  sizes,
});

const FILES = g('files', ['files']);
const EDITOR = g('editor', ['editor']);
const ALL_OUTPUT: readonly PanelId[] = ['console', 'repl', 'plots', 'display'];

export const PRESETS: Readonly<Record<PresetId, Preset>> = {
  // Today's page: Files | Editor | [Console|REPL|Plots|Display]
  classic: {
    id: 'classic',
    tall: false,
    tree: s('root', 'row', [FILES, EDITOR, g('output', ALL_OUTPUT)], [0.18, 0.44, 0.38]),
  },
  // Files | Editor | Plots | Display over a full-width [Console|REPL]
  consoleBelow: {
    id: 'consoleBelow',
    tall: true,
    tree: s(
      'root',
      'column',
      [
        s('top', 'row', [FILES, EDITOR, g('plots', ['plots']), g('display', ['display'])], [0.16, 0.4, 0.22, 0.22]),
        g('terminal', ['console', 'repl']),
      ],
      [0.68, 0.32],
    ),
  },
  // Files | Editor | [Console|REPL] over a large full-width [Plots|Display]
  wideOutput: {
    id: 'wideOutput',
    tall: true,
    tree: s(
      'root',
      'column',
      [s('top', 'row', [FILES, EDITOR, g('terminal', ['console', 'repl'])], [0.18, 0.5, 0.32]), g('graphics', ['plots', 'display'])],
      [0.42, 0.58],
    ),
  },
  // Files | Editor | [Plots|Display] over [Console|REPL]
  sideBySide: {
    id: 'sideBySide',
    tall: false,
    tree: s(
      'root',
      'row',
      [FILES, EDITOR, s('right', 'column', [g('graphics', ['plots', 'display']), g('terminal', ['console', 'repl'])], [0.55, 0.45])],
      [0.18, 0.47, 0.35],
    ),
  },
  // Files | Editor over a short [Console|REPL|Plots|Display]
  editorFocus: {
    id: 'editorFocus',
    tall: false,
    tree: s('root', 'row', [FILES, s('main', 'column', [EDITOR, g('output', ALL_OUTPUT)], [0.72, 0.28])], [0.18, 0.82]),
  },
  // Editor | large Display over [Console|REPL] | [Plots|Files]
  displayFocus: {
    id: 'displayFocus',
    tall: true,
    tree: s(
      'root',
      'column',
      [
        s('top', 'row', [EDITOR, g('display', ['display'])], [0.35, 0.65]),
        s('bottom', 'row', [g('terminal', ['console', 'repl']), g('side', ['plots', 'files'])], [0.6, 0.4]),
      ],
      [0.68, 0.32],
    ),
  },
};

export function isPresetId(x: unknown): x is PresetId {
  return typeof x === 'string' && (PRESET_IDS as readonly string[]).includes(x);
}

/** A preset's tree with stored sizes applied where they fit (wrong split ids or lengths are ignored). */
export function presetTree(id: PresetId, sizes?: Readonly<Record<string, readonly number[]>>): LayoutNode {
  const base = PRESETS[id].tree;
  if (!sizes) return base;
  let t = base;
  for (const [splitId, v] of Object.entries(sizes)) t = setSizes(t, splitId, v);
  return checkTree(t) === null ? t : base;
}
