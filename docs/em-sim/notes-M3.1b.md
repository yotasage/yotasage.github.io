# Notes from step M3.1b – the Via section's handles, pan and zoom

Done 2026-11-16. Both via drawings pan and zoom and have drag handles; return vias are added, moved and removed in the
top view. Plots, fields and the target are M3.2.

## Pan and zoom (`ViaDrawing.tsx`, `ViaView`)

- One `PanZoom` per view (`panZoom.ts`, as the Trace section): wheel about the pointer, pinch, drag to pan, arrows,
  + − and 0 on the focused view, the reset button bottom left (`data-via-reset`). The fit rect is viaGeom's world `box`
  with 8 px around; the side view's 58 px label column is inside the fit rect (a strip drawn over the board on the
  right), so at the fit the board fills the rest as in M3.1a. Layers, planes and the top view's board reach one box
  beyond the content, so a pan shows board. Zoom from the fit to `MAX_K` (2000 px/mm).
- The fit is frozen during a drag and the view the drag was made in stays afterwards; Single ↔ Pair or another
  stackup refits; other edits refit only a view still at the fit (as the trace).

## Handles (`viaHandles.ts`)

- Side view, at the right-hand barrel's right edge (a pair's via B): `pad:<layer>` on each layer with a pad,
  `ap:<layer>` on each plane, `drill` at the barrel's middle, `bd` (the backdrill depth, moved up and down) at the
  drilled hole's edge. Top view: `top-pad` (the entry and exit layers' pads together), `top-ap` (all antipads; round
  and joined on the free direction from via A, `freeAngle`: away from the feeds, the return vias and via B; oblong: its
  width at the straight side's middle and `top-apl` its length at the end below via A, length = pitch + width),
  `top-br` (a joined antipad's bridge), `pitch` (via B's centre, moved up and down), `ret:<k>` (each return via's
  centre, moved both ways, snapping to nothing).
- `applyViaHandle` refuses a value that makes an error of `viaIssues` the via did not have before (a via already
  typed wrong can still be dragged) and a return via on another one ("Return via 1 would overlap return via 2."). The
  handle stays at its last valid value, the reason under the view (`data-via-handle-refused`, role alert).
- Dragged values are rounded to a 1-2-5 step of at least 1 px; keys move by a 1-2-5 step of at least 4 px at the zoom,
  Shift a tenth (Up/Right larger; a return via: arrows in x and y on the board, Delete removes it). A key press is
  one undo group `handle.via.<key>` (presses within 1.5 s merge); a drag is one undo step. Handles are `role=slider`
  with their name, value text and shortcuts (a return via: `aria-roledescription="position"`).
- The handles' keys are `data-via-handle`, not `data-handle`, so the Trace section's selectors stay unique.

## Adding and removing return vias

- "Add by tap" (`data-via-add-mode`): the next tap or click on the top view's empty space adds a return via there
  (the last one's drill and pad, joining every plane), refused with the reason over the barrel or another via; the
  mode ends after one. With the mode on, Enter on the focused view adds one at a free spot (viaEdit `addReturn`) and
  focuses its handle, so the arrows move it. The form's "Add return via" stays.
- A return via is selected by a click, tap, drag or focus (its ring shows); "Remove return via n"
  (`data-via-remove-sel`) or Delete on its handle removes it.

## Solving while dragging

- A drag edits a `LiveVia` store that only the drawings and `ViaSolve` (the solve and results, moved out of
  ViaSection) read, so the form is not drawn per frame; the end commits once. Every frame starts the `via` job (the
  newest wins). As in the Trace section, when the last full round trip took over 30 ms or nothing came for 100 ms,
  the drag solves with `estimate: false` (`VIA_QUICK`: the same values, 11 against 16 ms in Node for C44, errors not
  shown, "Coarse while dragging"); the full solve follows a 200 ms pause and the end. In practice the round trips
  are over 30 ms while dragging, so the fast path is used at 1× too.
- `ViaResults` is memoised and given the via its result was solved for, so a frame without a new result does not
  draw the panel again.

## The drag budget (ui-viadrag, production build, the owner's laptop)

Main-thread work per drag frame (`emsimDrag`: the edit and the drawings, rendered at once), script time per frame
(CDP TaskDuration over the drag's frames), new results per drag frame:

| Drag | CPU | Work p50 / p95 (ms) | Task per frame (ms) | Results per frame |
|---|---|---|---|---|
| C44 side antipad | 1× | 0.8 / 1.2 | 4.1 | 0.81 |
| C44 side antipad | 4× | 3.0 / 4.4 | 14.5 | 0.85 |
| C44 return via | 1× | 0.6 / 1.1 | 3.2 | 0.85 |
| C44 return via | 4× | 3.3 / 4.8 | 13.8 | 0.65 |
| C45 top antipads | 1× | 0.7 / 1.0 | 4.1 | 0.49 |
| C45 top antipads | 4× | 3.4 / 4.7 | 18.4 | 0.88 |

The work is within 8 / 12 ms. The whole main-thread time per frame is over 12 ms at 4× (13.8 to 18.4 ms): the
results panel drawn for every new result, the worker's messages and the SVGs' layout and paint; one attempt (the memo
above) changed little. BL115.

## Checks

`ui-viadrag.mjs` in `npm run ui`: 110 checks, 931 in all (ui-why with the four new lines: 154 keys); first load
178.7 kB gzip (the handles are in the Via chunk). `npm run check` 19 221 as before.

## For M3.2

- The TDR and S-parameter plots go into `ViaSolve` (it has the result and the via it was solved for); during a drag
  they could follow only the full solves, or draw at most every other frame (BL115).
- The field maps can draw in the views' worlds (side: along the section line, y down from the top; top: (x, −y)) and
  use `view` and `frameTransform` as the trace's field canvas does.
- The target (antipad or return-via distance) can reuse `applyViaHandle` for its refusal.
- Leftovers: BL115 (4× task time), BL116 (handles for feeds, a return via's drill and pad, plating; snapping).
