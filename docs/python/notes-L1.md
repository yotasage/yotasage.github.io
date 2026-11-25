# L1 notes: dockable layout and view presets (research)

Research for L2a/L2b. No product code was changed. Spike: `spike-move.mjs` in the session scratchpad (not kept), run
against the real `/python/main` from `out/` (built 2026-11-25) on the harness server (`servers.mjs`, port 3023).

## 1. What the page does today (facts)

- `components/Python/PythonPlayground.tsx` (36.9 kB) renders one CSS grid `.workspace` (`data-python-workspace`,
  `styles/Python.module.css` l. 397: two columns `1.05fr 0.95fr`, `height: calc(100vh - 230px)`, min 540, max 920;
  `fileStyles.workspaceWithFiles` adds a 260 px Files column). Children: `FileTree` (rendered only while shown, so it
  unmounts when hidden), the Editor `<section>` (display toggled), and one "Program output" `<section>`
  (`.programOutputFrame`, 2 px strong border, label + `OutputTabBar` in its header, then the traceback strip, the two
  `PythonTerminal`s, `PlotsGallery` and `DisplayPanel`). The phone switch is `matchMedia('(max-width: 899px)')`
  (`isNarrow`); below it the grid is one column and `PhonePaneTabs` picks one pane.
- `OutputTabs.tsx`: `useOutputPanes` holds `outputTab` (console | repl | plots | display) and `mobilePane`;
  `showConsole()` (run starts, `input()`) and `showDisplay()` (a program opens a display) only switch tabs.
- Every output panel already stays mounted and takes a `visible` prop: `PythonTerminal` refits on `visible`
  (l. 429) and also has a `ResizeObserver` on its host that refits on any size change (l. 393); Monaco is created
  with `automaticLayout: true` (`PythonEditor.tsx` l. 106/123); `useDisplay` calls `renderer.setHidden(!visible)` and
  keeps a `ResizeObserver` on the stage (l. 207); the renderer draws with a main-thread 2D context bound to the
  canvas (`lib/python/display/renderer.ts` l. 281). `PlotsGallery` is plain React with `blob:` images.
- `FileViewer.tsx` (HTML previews in `sandbox=""` / `sandbox="allow-scripts"` iframes, `srcdoc`) lives inside the
  Editor panel, so it moves only when the Editor moves.
- `DisplayPanel`'s resize handle sets the workspace height through `closest('[data-python-workspace]')`.
- security.md §4 / D18: Console, Plots and Display are framed and labelled "Program output"; trusted UI is drawn by
  the page outside them; nothing a program draws may overlap or imitate it.
- Unit checks import `.ts` directly with Node's type stripping (`unit-checks.mjs` l. 18), so the layout model must use
  erasable TypeScript only (no `enum`, no parameter properties).

## 2. Spike: re-parenting live panels (Edge, Firefox, WebKit via Playwright)

Moved the real panels' DOM nodes into new fixed-position slots inside `#__next` while the page ran.

| Check | Edge | Firefox | WebKit |
|---|---|---|---|
| `Element.prototype.moveBefore` exists | yes | yes | **no** |
| Console xterm: 300 printed lines kept, refits by itself (420 → 563 px), Shift+PageUp scrollback to line 34 | ok | ok | ok |
| Monaco: same editor instance, model, cursor 2:5 kept, `model.undo()` undoes the typed edit, relayout by itself to the slot width (698/704), typing works | ok | ok | ok |
| REPL: `6*7` → 42 after `appendChild`, `7*7` → 49 after `moveBefore` | ok | ok | ok |
| Plots: gallery `<img>` stays decoded, no reload | ok | ok | ok |
| Display: bouncing loop keeps drawing (90 frames, pixels change), canvas re-measured by its own RO | ok | ok | ok |
| Focus inside the moved node kept: `appendChild` | lost | lost | lost |
| Focus kept: `moveBefore` | kept | kept | n/a |
| Sandboxed `srcdoc` iframe reloads on `appendChild` | 1 load | 1 load | 1 load |
| ... on `moveBefore` | 0 | 0 | n/a |

Findings:
1. **Re-parenting keeps every stateful panel alive** in all three browsers, and the panels re-measure themselves
   (xterm RO + fit, Monaco `automaticLayout`, Display stage RO). Nothing extra is needed after a move; a panel that
   was `display:none` still refits when it becomes visible (existing effects).
2. **React events stop on nodes moved outside the React root.** The first spike run appended slots to `<body>`: the
   REPL `<form>` lost React's `onSubmit`, did a native submit and reloaded the page. React listens on its root
   container and on **portal containers**. So L2 must move only nodes React does not own as children: each panel is
   rendered with `createPortal(panel, host)` into a host `<div>` made once with `document.createElement`; React
   attaches its listeners to that host, so the host works wherever it is placed. Never move a React-rendered element.
3. **Focus:** use `parent.moveBefore(host, null)` when it exists (Chromium, Firefox), else `appendChild` and, if
   `document.activeElement` was inside the host, call `.focus({ preventScroll: true })` on it again (WebKit).
4. **Iframes reload on `appendChild`** (all three) and not on `moveBefore`. Only the Editor's HTML preview has one:
   its content is a static `srcdoc`, so a reload redraws it; with "allow scripts" the preview script runs again
   (its state is lost). Acceptable; no need to forbid moving the Editor.
5. xterm wheel scrolling could not be driven by Playwright in any browser even before a move (test artefact);
   scrollback was checked with Shift+PageUp, which the UI checks should use too.

## 3. Build or library

npm data 2026-11-25 (`npm view`, tarballs unpacked in the scratchpad, sizes minified + gzip -9, React external):

| Package | Licence | Deps | React 19 | Size (gz) | Drag | Notes |
|---|---|---|---|---|---|---|
| dockview 8.9.1 (+ dockview-core) | MIT | dockview-core | yes | ~93 kB core (noStyle) + CSS | HTML5 DnD (`dragstart`, `setDragImage`) | full IDE docking, popouts, own theme classes |
| flexlayout-react 0.11.2 | MIT | none | yes | ~54 kB | pointer events | own JSON model and CSS themes |
| rc-dock 4.1.0 | Apache-2.0 | lodash, classnames, @rc-component/{tabs,menu,dropdown}, rc-new-window | ≥18 | larger (rc stack) | HTML5 DnD | heavy |
| react-mosaic-component 7.2.1 | Apache-2.0 | react-dnd ×5 backends, lodash-es, uuid, immutability-helper | 16–19 | larger | react-dnd | tiles only, no tabs |
| allotment 1.20.6 / react-resizable-panels 4.24.2 | MIT | several / none | yes | splitters only | — | no docking |

**Recommendation: write our own.** Reasons: the whole feature (split tree, tab strips, pointer drag with zones,
splitters, menus) is about 6–8 kB gzipped of our code against 54–93 kB plus CSS for a library; the libraries own the
panel DOM (wrappers, absolutely positioned overlays) while we need exact control of where hosts live (portals,
`moveBefore`, focus restore, frames for §4); their strings are English-only (we need EN/NB); their themes are their
own class sets, not our `--ds-*` tokens with Light/Dark/HC; dockview drags tabs with the HTML5 drag API (`dragstart`, `setDragImage` in its bundle), which most touch browsers do not drive. A model of
six panels is small, and its operations are pure functions that the unit checks can cover.

## 4. Which panels move

**All six (Files, Editor, Console, REPL, Plots, Display) are movable**: the model and the host code are the same for
every panel and the spike shows the Editor survives a move, so fixing two of them would add special cases, not remove
them. Constraints: the **Editor is always alone in its group** (never tabbed, so never hidden) and can never be
closed; **Files** keeps its Show/Hide button (it is the only panel that can be hidden); the four output panels are
always somewhere in the tree.

## 5. Layout model (`lib/python/layout/model.ts`)

```ts
export type PanelId = 'files' | 'editor' | 'console' | 'repl' | 'plots' | 'display';
export type PresetId = 'classic' | 'consoleBelow' | 'wideOutput' | 'sideBySide' | 'editorFocus' | 'displayFocus';
export type SplitDir = 'row' | 'column';        // row: children left→right; column: top→bottom
export interface GroupNode { readonly kind: 'group'; readonly id: string; readonly panels: readonly PanelId[]; readonly active: PanelId }
export interface SplitNode { readonly kind: 'split'; readonly id: string; readonly dir: SplitDir;
  readonly children: readonly LayoutNode[]; readonly sizes: readonly number[] }   // fractions, sum 1
export type LayoutNode = GroupNode | SplitNode;
export interface StoredLayout {                   // localStorage 'python:layout-v1', page only
  readonly v: 1;
  readonly mode: PresetId | 'custom';
  readonly custom: LayoutNode | null;             // last custom tree (kept when a preset is chosen)
  readonly presetSizes: Partial<Record<PresetId, Record<string, readonly number[]>>>; // split id → sizes
  readonly filesHidden: boolean;
}
export type DropTarget =
  | { kind: 'tab'; groupId: string; index: number }               // into a group's tab strip
  | { kind: 'edge'; groupId: string; edge: 'left' | 'right' | 'top' | 'bottom' }
  | { kind: 'page'; edge: 'bottom' | 'right' };                   // full-width bottom / full-height right
```

Invariants (checked by `validate`, restored by `normalize` after every operation):
1. Every `PanelId` is in exactly one group; groups are never empty; `active ∈ panels`.
2. The `editor` group holds only `editor`.
3. A split has ≥ 2 children, `sizes.length === children.length`, every size ≥ 0.05, sum 1 (renormalised); a split
   child never has the same `dir` as its parent (flattened); a one-child split is replaced by its child.
4. Ids unique, `[a-z0-9-]{1,24}`; depth ≤ 4; at most 6 groups.
5. Min sizes in CSS px (used by the renderer and by `fitToWidth`): Editor 320×200, Files 180×160, Console/REPL
   260×120, Plots 260×160, Display 240×160; a split's min is the sum (plus 8 px per splitter) along its axis, the max
   across it.

Hidden Files stays in the tree; the renderer skips a group with no visible panel and renormalises its siblings, so
"Show files" brings it back to exactly where it was.

Operations (pure, return a new tree): `findPanel`, `removePanel` (collapses), `insertTab`, `splitGroup(groupId,
edge, panel)`, `splitPage(edge, panel)` (wraps the root in a new split; the new group gets 30 % / 32 %), `movePanel
(tree, panel, target)` = remove + insert (a drop onto the panel's own one-panel group is a no-op), `setActive`,
`setSizes(splitId, sizes)`, `minSize(node)`, `fitToWidth(tree, width)` and `moveTargets(tree, panel)` (menu entries
as data).

Validation of the stored value: `JSON.parse` in try/catch, string ≤ 8 kB, exact shape (no extra keys trusted), then
the invariants; any failure → Classic with default sizes and the key is removed. The key is `python:*`, so W9 "Clear
all data" already removes it; a worker cannot reach `localStorage`.

**When the mode becomes Custom:** moving a panel (drag, Move to…, page zones) or reordering tabs copies the current
tree into `custom` and sets `mode: 'custom'`. **Resizing a splitter keeps the preset** and stores the sizes in
`presetSizes[preset][splitId]` (double-click on a splitter or "Reset layout" restores the defaults); in Custom it
changes `custom`. Switching the active tab never changes the stored layout (session state).

## 6. Presets (data in `lib/python/layout/presets.ts`)

Percentages are default `sizes`. Every preset fits 1280×720 (main width 1248 px, workspace height 540 px min) with all
mins kept; at 1920×1080 the page's 1400 px max width applies (or the full width with `data-ds-wide`).

```
Classic (default, today's page)          Console below (owner #1)
+------+-------------+-----------------+  +------+-----------+--------+--------+
|Files | Editor      |[Cons|REPL|Plots||  |Files | Editor    | Plots  |Display | 68 %
| 18 % | 44 %        | Disp]  38 %     |  | 16 % | 40 %      | 22 %   | 22 %   |
+------+-------------+-----------------+  +------+-----------+--------+--------+
                                          | [Console|REPL]  full width         | 32 %
                                          +------------------------------------+
Wide output below (owner #2)             Side by side
+------+-------------+-----------------+  +------+--------------+--------------+
|Files | Editor      | [Console|REPL]  |  |Files | Editor       |[Plots|Disp.] | 55 %
| 18 % | 50 %        | 32 %            |  | 18 % | 47 %         +--------------+
+------+-------------+-----------------+  |      |              |[Console|REPL]| 45 %
| [Plots|Display]  full width   58 %   |  +------+--------------+--------------+
+--------------------------------------+
Editor focus                             Display focus
+------+-------------------------------+  +-------------+------------------------+
|Files | Editor                  75 %  |  | Editor 35 % | Display 65 %           | 68 %
| 18 % +-------------------------------+  +-------------+-----------+------------+
|      | [Console|REPL|Plots|Disp] 25 %|  | [Console|REPL] 60 %     |[Plots|Files]| 32 %
+------+-------------------------------+  +-------------------------+------------+
```

- Owner #2: Console/REPL go **beside the editor, tabbed** (the program's text output stays in view while the picture
  is large); the bottom group is the large one.
- Heights: presets with a full-width bottom row (`consoleBelow`, `wideOutput`, `displayFocus`) use a taller workspace
  minimum (640 px; the page scrolls at 720 px tall) so the top row keeps the Editor's 200 px min and the bottom group
  ≥ 160 px. The Display's existing resize handle keeps setting the workspace height (the dock root keeps
  `data-python-workspace`).
- **Custom** is any other tree; the menu shows it checked when active and enabled when a custom tree is stored.
- **Between 900 and ~1100 px** the renderer calls `fitToWidth(tree, width)` (never stored): while the root's min width
  exceeds the width it merges the two narrowest non-Editor groups of the widest row into one tabbed group (e.g.
  Console below's Plots | Display become [Plots|Display]); the stored layout is unchanged and returns when the window
  widens. One `ResizeObserver` on the dock root drives this.

## 7. Phone

Below the existing breakpoint (`max-width: 899px`) the dock is not rendered; the phone layout stays exactly as now
(`PhonePaneTabs`, the output header's `OutputTabBar`). The same panel hosts are placed in one phone slot and shown by
`mobilePane`, so crossing the breakpoint (tablet rotation, window resize) moves hosts instead of remounting panels.
The stored layout is not touched on a phone and applies again on a desktop.

## 8. Rendering, visibility, drag and drop

**Hosts:** `usePanelHosts()` makes six `div`s once (`data-panel="console"`, `display: flex`, fill). PythonPlayground
renders each panel with `createPortal(<PythonTerminal …/>, hosts.console)` and passes the hosts to the dock; the dock
never renders panels, so splitter drags and tab switches do not re-render them. `DockGroup` has a body slot; a
`useLayoutEffect` attaches its panels' hosts (`moveBefore` or `appendChild` + focus restore, §2) and sets
`hidden` on the inactive ones. Hosts not in any rendered group (hidden Files, collapsed) go to an off-screen
`display:none` park `div`.

**Visibility (Q4):** `useDockLayout` returns `isShown(panel)` = desktop: active in a rendered group, not hidden, and
`view === 'workbench'`; phone: from `mobilePane`/`outputTab` as today. It feeds the existing `visible` props
(terminals refit, `setHidden` on the Display, gallery). `usePlots`' `isPlotsVisibleRef` reads `isShown('plots')`,
and the Plots unread badge shows on the Plots tab of whichever group holds it; a rising `isShown('plots')` calls
`clearUnread`. `showConsole`/`showDisplay` become `activate(panel)` (makes it the active tab of its group; never
moves it, never switches to Custom). No extra per-slot `ResizeObserver`: each panel already observes its own host.

**Program output (§4):** the group header (tab strip, "Move to…" buttons) is page UI above the body. When the active
panel is Console, REPL, Plots or Display, the group body gets `.programOutputFrame` and the header shows the
"Program output" label before the tabs, so Classic looks as today and every group showing program output is framed and
labelled. The traceback strip stays at the top of the Console host (page buttons, as today). The drop preview and
the drag shield are drawn by the page in an overlay layer of the dock root above all group bodies; program content
cannot reach them (xterm text, canvas pixels, `<img>`, sandboxed iframes are clipped by the body's `overflow:
hidden`). Display fullscreen is unchanged (the Display host's own panel).

**Drag:** `pointerdown` on a tab, start after 6 px (10 px for touch, `touch-action: none` on tabs only); on start,
capture the pointer, show a transparent full-dock **shield** (so iframes, the canvas and Monaco do not take the
events) and cache group rects. Zones per group: inner 50 % box = add as tab (or the tab strip itself = insert at that
index), the outer bands = split on the nearest edge; a 28 px band along the dock root's bottom and right edges = full
width bottom / full height right. A translucent preview shows the area the panel would take. Drop → `movePanel` →
Custom → save. Esc, `pointercancel` or a drop on no zone cancels. Drops that break invariants (into the Editor group's
centre) are not offered: the Editor group only has edge zones. After a drop the moved panel is the active tab of its
group and its tab gets focus.

**Move to… menu:** a small button on every tab (and Shift+F10 / the context-menu key on a focused tab) opens a menu
built by `moveTargets`: "With Console" / "With Plots and Display" (every other group except the Editor's), "Below
the editor", "Right of the editor", "Below Plots" / "Right of Plots" (each group's two useful edges), "Full width at
the bottom", "Full height at the right". `role="menu"`, arrow keys, Enter, Esc returns focus to the tab. After a move
the tab keeps focus in its new place.

**Splitters:** a `<div role="separator" tabindex="0" aria-orientation aria-valuenow aria-valuemin aria-valuemax
aria-label="Resize Editor and Plots">` between split children; pointer drag with capture updates the two flex bases
directly through refs (no React render per move) and commits on `pointerup`; arrows ±2 %, Shift+arrows ±10 %,
Home/End to the mins, double-click/Enter resets to the default. Mins from §5 clamp every move.

**Layout menu:** a "Layout" menu button in the toolbar next to "Hide files" (desktop only): the six presets and Custom
as `menuitemradio` with `aria-checked`, then "Reset layout" (back to Classic with default sizes; the stored custom
tree is dropped). Strings EN/NB in `lib/ui/i18n/python-layout.ts`.

## 9. Where the code goes (every file < 40 kB)

| File | Contents |
|---|---|
| `lib/python/layout/model.ts` | types, min sizes, `validate`, `normalize`, tree operations, `fitToWidth`, `moveTargets` (framework-free) |
| `lib/python/layout/presets.ts` | the six presets as data, default sizes |
| `lib/python/layout/storage.ts` | `loadLayout`/`saveLayout` of `python:layout-v1` (try/catch, cap) |
| `components/Python/layout/useDockLayout.ts` | state, persistence, mode switching, `activate`, `isShown`, width fitting |
| `components/Python/layout/usePanelHosts.ts` | six host divs, `attachHost` (moveBefore / appendChild + focus), park div |
| `components/Python/layout/DockLayout.tsx` | renders the split tree, splitters, the overlay layer |
| `components/Python/layout/DockGroup.tsx` | tab strip (badges, disabled REPL during a run), body slot, frame + label |
| `components/Python/layout/Splitter.tsx` | pointer + keyboard separator |
| `components/Python/layout/useTabDrag.ts` + `DragOverlay.tsx` | drag state, hit testing, shield, preview |
| `components/Python/layout/MoveToMenu.tsx`, `LayoutMenu.tsx` | the two menus |
| `styles/PythonLayout.module.css` | dock, groups, tabs, splitters, overlay; Light/Dark/HC via `--ds-*` |
| `lib/ui/i18n/python-layout.ts` | EN/NB strings, re-exported like the other `python-*` files |

`PythonPlayground.tsx` shrinks: the workspace grid JSX (l. 760–937) becomes portals + `<DockLayout>`; `OutputTabBar`
stays for the phone only; the `workspaceWithFiles` grid rule and the Files toggle's manual refits go away.

## 10. Checks

- **Unit** (`scripts/harness/python/layout-unit-checks.mjs`, Node, imports the `.ts` files, run by `unit-checks`):
  each preset validates and keeps the invariants; every `movePanel` from every panel to every target of
  `moveTargets` keeps them (6 presets × 6 panels × all targets); Editor never tabbed; removing the last panel of a group
  collapses it and flattens same-direction splits; `setSizes` clamps to mins; `fitToWidth` at 900/1000/1100/1280 px
  never goes below mins; `validate` rejects bad JSON, 9 kB strings, duplicate/missing panels, unknown ids, wrong
  sizes, depth 5, an Editor tabbed with Console; round trip save → load.
- **UI** (`ui-layout-checks.mjs`, `PYTHON_UI_ONLY=layout`, Edge/Firefox/WebKit): each preset at 1280×720 and
  1920×1080 renders all six panels with no overlapping rects, no panel under its min, no horizontal overflow; drag
  Console's tab to "below the editor" → Custom checked in the Layout menu, survives a reload; after the move the
  Console keeps its lines (Shift+PageUp scrollback) and Monaco keeps undo (`model.undo()`); the bouncing ball keeps
  drawing while Display is dragged to the full-width bottom zone; Move to… by keyboard only (Tab, Shift+F10, arrows,
  Enter) and focus stays on the moved tab; Esc cancels a drag (layout unchanged); splitter arrows change
  `aria-valuenow` and keep the preset; Reset layout; Run shows the Console in its group without moving it; Plots badge
  on a Plots tab in another group; a broken `python:layout-v1` falls back to Classic; 1000 px window merges groups;
  375×812 phone unchanged (phone tabs, no dock); NB labels; Light/Dark screenshots to `.local/harness/python/`.
- The existing UI suites must still pass unchanged in Classic (they use the output tab bar's aria-label: keep
  `outputNavAria` on the tab strip of the group holding the Console, or update the selectors in L2a).

## 11. Proposed split

- **L2a — model, hosts, presets, Layout menu (no drag).** `model.ts`, `presets.ts`, `storage.ts`, `usePanelHosts`,
  `useDockLayout`, `DockLayout`, `DockGroup`, `Splitter` (pointer + keyboard), `LayoutMenu`, CSS, i18n; PythonPlayground
  moved onto portals; phone path on the same hosts; `fitToWidth`; unit checks; UI checks for presets, splitters,
  persistence, Reset, phone, and the existing suites green. About 120–140k tokens.
- **L2b — drag and drop, Move to…, Custom mode.** `useTabDrag`, `DragOverlay` (zones, shield, preview, Esc),
  `MoveToMenu`, tab reorder, Custom switch and storage, focus after a move, the rest of `ui-layout-checks.mjs`
  (state kept across moves, keyboard Move to…, page zones). About 100–130k tokens.

## 12. Open questions for the owner

1. Owner #2 ("Wide output below"): Console/REPL are placed **beside the editor** (tabbed). Would you rather have them
   in the bottom group too (tabbed with Plots and Display), or in a thin row between the editor and the bottom group?
2. Should panels other than Files be closable (for example hide Plots and Display until a program uses them), or is
   "every panel always somewhere" right?
