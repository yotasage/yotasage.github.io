# Smith chart – notes of step M3.3a (handles and dragging)

Part of [plan.md](plan.md). First half of M3.3; M3.3b adds the draw tool, undo, redo and keyboard handles.

## Files

- `pathLayer.ts`: handles, drag, snapping. `live.ts`: `writeLive(root, c, part, half)`, the panel's texts in a drag.
- `chartView.ts`: `HandleHooks.down(id, px, py, touch, alt, time)`, `move(…, alt)`, `up(…, cancelled, time)`; other
  pointers are ignored while a handle is dragged; `TAP_SLOP`, `TAP_MS` exported. `Strip.tsx`: `data-tile-value`.
  Page: `layer.onCommit = commit`, `layer.onLive`, the Snap switch (`data-snap-toggle`, `aria-pressed`) after Z/Y/ZY.

## The drag pipeline

- Handle of part i = node i + 1 (`gamma[2i+2]`): `<span data-handle=i>` in the marks box, 44 × 44 px, a 28 px ring of
  the part's colour under the node marker (`data-hot` 32 px, `data-drag` 34 px). Hit test is geometric (`handleAt`:
  nearest node within `HANDLE_PX` 22 px, inside the box; coinciding handles: the one nearer the source). Box
  attributes `data-handle-hot` (cursor grab) and `data-handle-drag` (grabbing).
- Down: `beginDrag(i)` builds the locus once (`nodeLocus` from the evaluated nodes), keeps the circuit (`base`) and the
  grab offset (pointer − handle, px). Touch: ChartView's touchstart already calls `preventDefault` on a handle (D14).
- Move (every pointer event, not per frame, so length tracking sees each step): Γ = view.gamma(pointer − offset) →
  `project(…, prev = raw)` (raw is the unsnapped value: lines and stubs track turns from it) → `findSnap` → if the
  value changed: the packed value is replaced, `evaluate` + `partArcs` + node Γ, the `withPart` circuit kept as `live`,
  `request(DIRTY_CONTENT)`. No DOM in the event.
- Frame: arcs (only changed `d`), marks, handles, snap mark; then `writeLive`: the side panel's two halves and the
  read point take turns, one per frame (half 0: tile, card fields, circuit input, goal, first half of the changed node
  rows; readout; half 1: the other rows; readout). All panel texts in one frame cost 3–5 ms of layout and paint at 4×
  CPU (traced: layout 3.6, paint 2.8 ms a frame vs 1.3 / 1.5 without the panel); containment did not help.
- Up: moved (more than 3 px L1 for a mouse, `TAP_SLOP` 8 for a finger, or longer than `TAP_MS`) → `endDrag(true)` →
  `onCommit(next)` once → page `commit` → React renders the same texts, `replaceState` writes the link once. Not moved
  → a tap: values restored, read point and M3.2's pick. `pointercancel` → restored (`onLive(base, i, −1)`). A
  `setCircuit` from elsewhere during a drag ends it without a commit. The first real move selects the part
  (`onPick(SEL_PART, i)`); the card React then mounts is rewritten by the next live frame (`select` marks it dirty).

## Snapping

- On unless the Snap switch is off or the move has Alt. Candidates within `SNAP_PX` 8 px (in Γ: 8 / k) of the projected
  point; the nearest wins. The value is exactly the candidate's, the tracked raw value stays unsnapped.
- Standard values (R, L, C only): the two neighbours of the value in `SNAP_SERIES` (E24 for all three; the inductor
  series is the owner's open choice, one constant), built by `standardValue` from decimal text, so 33 pF is 33e-12.
- Grid circles: every arc of the grid built now (`view.grid.grid`, the density level shown) of family r, x, g, b and
  the real axis; the locus circle (A, D, C of `L_A`) meets a grid circle c + R·e^(jθ) where a cos θ + b sin θ = d
  (the axis: a quadratic); the crossing must lie on the drawn arc (`within`) and be reachable (`locusValue` then
  `locusPoint` gives back the crossing within 0.5 px). Value = `locusValue(crossing, raw)`.
- The mark: `<span data-snap>`, a dashed accent ring and a label ("33 pF · E24", "r = 1"). `snapCode`, `snapFamily`,
  `snapGridValue`, `snapLabel` are public.

## Checks (`npm run ui`: grid 20,719, chart 309, strip 347, path 1,117, drag 135)

`ui-drag.mjs`: every kind (series/shunt R L C, line, open/short stub, λ/4) by mouse at 1280 px and by CDP touch at
390 px, snapping off: the committed value equals `project` replayed over the pointer events the page received (grab
offset, tracking) to 1e-9; a line dragged 2.3 turns gives 1.25 λ; typed value → its handle → drag there agrees to the
shown digits; edit → `dragTo` back gives the value before to 1e-9; snapping: 33 pF exactly (mouse and touch) with the
mark, a line onto z = 1 + j1 (r and x to 1e-9), Alt off, 30 targets over all kinds each holding exactly what it
snapped to (E24, or the named circle's r/x/g/b of the end node to 1e-9, within 8 px); panel mid-drag equals React's
render after; link written once; touch moves neither page nor view; a finger off the handles scrolls; a click on a
handle picks its node; 44 px targets; no horizontal scroll at 320/390 px.
`ui-chart.mjs` and `ui-path.mjs` now count lost frames against grid rebuilds at 4× (`lost ≤ rebuilds + 1`; each
rebuild ~32 ms loses about one; BL52 would fix it); 1× still needs p95 ≤ 17.5 ms.

## Timings (headless Edge, 1280 × 900, 10-part circuit, a line's handle circled 2 s, snapping off, median of 3)

| CPU | drag script p50 / p95 | main thread per frame | frames lost |
| --- | --- | --- | --- |
| 1× | 0.2 / 0.4 ms | 1.8 ms | 0 |
| 4× | 0.6 / 1.6 ms | 8.8 ms (chart alone ≈ 4.5–5) | 1 of 120 |

With snapping on the value often stays put between moves (5.8–7 ms at 4×). Within engine.md §9 (frame ≤ 16 ms,
chart ≤ 6 ms); the harness bounds 4× at 10 ms main thread, p95 script 4 ms, lost ≤ 1.

## For M3.3b

- Undo hooks into the page's `commit` (one call per drag, from `onCommit`; fields, add, remove, move, link also come
  through it). A drag never commits intermediate states, so one drag is one undo step.
- Keyboard handles: `data-handle` spans exist (not focusable yet). Use `beginDrag(i)`, `dragTo(Γr, Γi, free)` (snapping
  applies unless `free`), `endDrag(commit)`; e.g. arrows step the end along the locus by `locusPoint` of a value step,
  or move a target in px through `view.gammaX/Y`. `handleAt`, `dragPart`, `snap*` are public.
