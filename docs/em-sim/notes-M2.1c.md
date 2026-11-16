# Notes from M2.1c: pan, zoom and drag handles of the cross-section

Done 2026-11-16. The Trace section's drawing pans and zooms, and the preset structures' dimensions are dragged by
mouse, touch and keys; the impedance follows the drag. Module rows: modules-page.md.

## panZoom.ts (for M2.2 and M3.1)

- `new PanZoom(box, { maxK, minFit })`. The view is `{ cx, cy, k, w, h }`: world units (model units, **y down**) seen
  in a w × h px box at px = w/2 + (x − cx)·k. The page gives the content with `setFit(rect, refit)` and the box with
  `resize(w, h)`; `fit()` goes back to the whole content; `atFit` says whether the view is still the fit (the page
  refits on new content only then, or when it passes `refit`).
- Out: `onFrame(view, gesture)` at most once per animation frame (the drawing moves its last picture by one
  `frameTransform(drawn, now)` on a `<g>`); `onSettle(view)` 160 ms after the last input (the drawing renders again);
  `onTap(px, py)`; `handles: HandleHooks` (`hit`, `down`, `move`, `up`, box px): a pointer that starts on a handle
  drags it and never pans. Wheel zooms about the pointer, one pointer pans, two pinch, keys on the focused box: arrows
  pan (Shift finer), + and − zoom by √2, 0 or Home resets. Touch: `touch-action: pan-y` (one finger up or down scrolls
  the page), touchstart on a handle is prevented. Buttons, links and `[data-no-pan]` inside the box keep their clicks.
- The trace's world: x = u (mm), y = `worldMap(...).Y(z)` = −z, or with "widen" every board layer at least 9 px at the
  fit's scale `kRef` (`traceGeom.ts`). Zoom limits: the whole box (fit) to `MAX_K` 2000 px/mm (0.5 µm per px).
  M2.2's field map can draw in the same world.

## Handles

- Preset kinds only (`general` is M2.1d). `traceHandles(s, st)` gives `HandleDef`s on the signal layer's base edge
  (fillSide's far side): `w` on the right signal's outer edge (a pair's two signals move together: w = u − s/2),
  `s` on the right signal's inner edge (s = 2u), a broadside pair's offset `s` at the second trace's centre, `g` on the
  right ground's inner edge, `gw` on its outer edge when finite, and `t:<id>` for every dielectric between the
  signals and their planes (or between a broadside pair's layers), on its top face at 64 px from the box's left edge:
  thickening a layer moves everything above, so the face follows the pointer.
- `applyHandle(setup, key, v)` makes the edit or refuses it with the first error
  of `stackupIssues` / `structureIssues`: the handle stays at its last valid value and the reason shows under the
  drawing (`role=alert`). Dragged values are rounded to a 1-2-5 step of at least 1 px in the shown unit.
- Keys: a focused handle (`role=slider`, its name and value for screen readers) moves by a 1-2-5 step of at least 4 px
  at the current zoom, Shift a tenth of that; presses within 1.5 s are one undo step (group `handle.<key>`).
- A drag edits a live setup only the Trace section sees and is committed once at its end: one undo step, the link and
  the Stackup section follow at the end. The fit (box height, widening scale) is frozen during a drag, and the view
  the drag was made in stays afterwards (the reset button, bottom left, shows the whole section again); another kind,
  layer, stackup or "widen" refits.

## Solving while dragging

Every drag frame starts a solve on channel `solve` (the client cancels the old job). The full solve with its error is
used while its last round trip took at most 30 ms and results keep coming (none for 100 ms counts as starving);
otherwise the drag solves `{ M: 1, estimate: false }` (one coarse level, 0.4–2.3 ms in Node against 1.8–12 ms full) and
the panel shows those values without errors, statuses or flags, "Coarse while dragging" and the solve note says the
full solve follows. The full solve runs after a 200 ms pause and at the end. M = 1 is within 0.003 Ω of M = 2 on
the default microstrip, 0.011 Ω on the coplanar pair.

## Budgets (ui-drag.mjs, production build, headless Edge, synthetic pointer moves every 8 ms for 2 s)

"work": one drag frame's own main-thread time (pointer to the rendered section, flushSync), "task": CDP TaskDuration
over the run divided by the frames (everything on the main thread, the harness's event driver included).

| structure | CPU | drag frames | work p50 | work p95 | task / frame | dropped | new Z per frame | fast path |
|---|---|---|---|---|---|---|---|---|
| microstrip | 1× | 113 | 0.40 ms | 0.60 ms | 2.11 ms | 0 of 122 | 0.99 | yes |
| microstrip | 4× | 113 | 1.40 ms | 2.60 ms | 11.36 ms | 0 of 122 | 1.00 | no |
| pair-microstrip | 1× | 100 | 0.50 ms | 0.70 ms | 2.44 ms | 0 of 122 | 0.99 | no |
| pair-microstrip | 4× | 95 | 2.40 ms | 3.80 ms | 12.73 ms | 0 of 122 | 1.00 | no |
| pair-cpw | 1× | 104 | 0.50 ms | 0.80 ms | 2.92 ms | 0 of 122 | 0.91 | yes |
| pair-cpw | 4× | 95 | 2.70 ms | 3.80 ms | 13.96 ms | 1 of 121 | 1.00 | no |

engine.md §10: ≤ 8 ms at 1× (met everywhere), ≤ 12 ms at 4×: the drag frame itself is far within it, the averaged
task time is just over it for the pairs (12.7 and 14.0 ms; BL99). New impedances arrive every frame or nearly
(0.91–1.00 per frame). Whether the fast path is taken varies between runs: the rule looks at the last full round
trip, which can be a cold first solve after a kind change, and CDP's throttle is set on the page (whether it slows the
worker too is not checked), so at 4× the worker's full solves usually keep up.

## For M2.1d (the general editor)

- `traceHandles` returns nothing for `general`; its handles can follow the same `HandleDef` shape (`from` maps the
  pointer to a value; `applyHandle` needs keys for `signals[i].w/u` and `grounds[i].a/b`).
- `edit` in `TraceSection` (begin / move / end / key) already does the live setup, one undo step per drag, the fast
  path and the refusal; adding and removing conductors are ordinary commits.
