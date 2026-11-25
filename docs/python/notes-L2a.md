# L2a notes: dock layout model, panel hosts, presets

Built from [notes-L1.md](notes-L1.md) §5–§11. What L2b (drag and drop, Move to…, Custom mode) must know.

## Model API (`lib/python/layout/model.ts`, pure, unit-checked)

- Tree: `GroupNode { kind, id, panels, active }`, `SplitNode { kind, id, dir, children, sizes }`. `checkTree(x)` returns
  null or the first broken invariant (shape with exact keys, every panel once, Editor alone, 2–6 children, sizes ≥ 5 %
  summing to 1, no same-direction nesting, ids `[a-z0-9-]{1,24}` unique, split depth ≤ 4, ≤ 6 groups).
- Moves (each returns a new normalized tree, or null when not allowed): `movePanel(tree, panel, target)` with
  `DropTarget` = `{kind:'tab', groupId, index}` (also reorders within the own group), `{kind:'edge', groupId, edge}`
  (new group takes half the target's size; flattened into a same-direction parent), `{kind:'page', edge:'bottom'|'right'}`
  (new group takes `PAGE_EDGE_FRACTION`: 32 % / 30 %). A drop onto the panel's own one-panel group returns the same
  tree object (treat `===` as "no change"). The Editor never goes into a tab strip and nothing goes into the Editor's
  group. New ids come from `uniqueId(tree, 'g' | 's')`.
- `moveTargets(tree, panel)`: every valid target for a "Move to…" menu (other groups' tab strips, each group's bottom
  and right edges, both page edges), already filtered through `movePanel`. Labels are L2b's job.
- `minSize(node)`: CSS px including the 44 px tab strip (`groupHasHeader`) and a 4 px border per group; the renderer
  sets these as `min-width`/`min-height` on each split cell.

## Page side

- `useDockLayout` (`components/Python/layout/useDockLayout.ts`) owns `StoredLayout`. Mode `'custom'` already renders
  and persists (`custom` tree, validated on load) but nothing creates it yet: L2b's drop handler should do
  `setLayout({ ...prev, mode: 'custom', custom: movePanel(treeForLayout(prev), panel, target) })` (add an action next
  to `choose`; the Layout menu's Custom item is enabled as soon as `custom` is non-null). Splitter commits in Custom
  already change `custom` (`resizeSplit`); `resetSplit` does nothing in Custom (no defaults there).
- The rendered tree is `fitToWidth(withoutPanels(tree, hidden Files), dockWidth)`. Drop targets must be computed
  against the **stored** tree (`treeForLayout`), not the rendered one: a merged group (900–1100 px) carries the id of
  its first group, and hidden Files is not rendered. `unmergeSizes` maps sizes back after a merge.
- Active tabs are session state keyed by group id (`actives`); after a move, call `selectTab(groupId, panel)` with
  the panel's new group so it is the active tab, then focus its tab button.
- Hosts: `DockGroup` renders `HostSlot` with the group's panels; the registry places hosts one microtask after the
  commit, so after a drop the panel is already in its new slot before paint. A drag shield/overlay belongs in the
  dock root (`DockLayout.tsx`, `data-testid="python-dock"`, `overflow: hidden`), above the group bodies.
- Group tab strips are `PillTabs` (`role="tab"` buttons): drag starts on those buttons (pointer events, 6/10 px
  threshold, `touch-action: none` on tabs only). Editor-only and Files-only groups have no tab strip
  (`groupHasHeader`); L2b needs a small drag handle or a header for them.
- Every group holding the Console keeps `data-testid="python-program-output-frame"` and `outputNavAria` on its tab
  strip; the existing suites rely on both (only in Classic). Every framed group has `data-program-output`.

## Deviations from notes-L1

- The traceback strip is page UI between the tab strip and the body of the group that holds the Console (not inside
  the Console host), so it stays visible while REPL/Plots/Display is the active tab there, as before.
- Group minimums include a 4 px border (the 2 px "Program output" frame), found by the UI checks.
- Files stays mounted while hidden (it used to unmount); hidden hosts sit in a `display:none` park in `<body>`.
- `aria-valuenow` of a splitter is the left/top child's share of the whole split in %, `aria-valuemin` 5 and
  `aria-valuemax` the pair's share minus 5 (the px minimums still clamp every move).
