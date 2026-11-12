# Smith chart – notes of step M3.3b (undo, redo, draw tool, keys)

Part of [plan.md](plan.md). Second half of M3.3 (M3.3a: [notes-M3.3a.md](notes-M3.3a.md)).

## History (`pages/smith-chart/main.tsx`)

- `commit(next, group = '')` is still the one place a circuit arrives. `now` (ref) is the last committed circuit (ahead
  of React's state); `hist` holds `past`, `future` (circuits, immutable, so references), `group`, `t`.
- A commit equal to `now` (`sameCircuit`) is ignored. Otherwise it pushes `now` onto `past` (at most `HISTORY` 200,
  the oldest dropped) and clears `future`, unless it continues the step: same non-empty `group` and either a field
  (`field:<name>`, until the focus moves: a `focusin` anywhere clears `group`) or a handle's keys (`key:<i>`, less than
  `GROUP_MS` 1000 ms after the last). A continued step that comes back to where it began removes the step.
- Groups: fields (`Strip` passes `field:<data-name>`), handle keys (`key:<i>`). Add, remove, move, a drag, a draw:
  no group, one step each (a drag and a draw commit once, on release).
- `travel(back)` (undo / redo) moves `now` between the stacks, clears `group`, and bumps `revision`; every `Field`
  drops its typed text on a new `revision`. Refused while a drag or a draw is in progress (`dragPart >= 0`). The link
  follows through the existing `replaceState` effect.
- A step that ends where it began gives back the redo steps it cleared (`dropped`). The link read at mount is no step.

## Keys

| Where | Key | Does |
| --- | --- | --- |
| anywhere (also in fields) | Ctrl/Cmd+Z | undo |
| anywhere | Ctrl/Cmd+Shift+Z, Ctrl/Cmd+Y | redo |
| anywhere | Escape | takes a draw in progress away and disarms the draw tool |
| a part's slider | ↑ → / ↓ ← | one step up / down (`stepValue`) |
| a part's slider | Shift+arrows, PageUp/PageDown | a coarse step |
| a part's slider | Enter, Space | select the part (focus already selects it) |
| a part's slider | Escape | focus back to the chart (whose arrows pan) |

Toolbar: Undo (`data-undo`), Redo (`data-redo`), disabled when there is nothing; while armed, "Drawing L ×"
(`data-draw-stop`) disarms.

## The handles' sliders

- The rings (`data-handle`) stay in the aria-hidden marks box. The keys live in a separate, still, visually hidden list
  in the chart box (`data-layer="handle-keys"`): a `role="slider"` span per part (`data-handle-key=i`, source end
  first, `aria-label`, `aria-valuetext`). Focusable rings in the marks box cost the 4× drag a second lost frame. Focus marks the ring `data-focus` (accent outline, larger ring) and selects
  the part; a slider works while its ring is off screen.
- `stepValue(kind, v, up, coarse, mantissas | null, c)` (state.ts): with Snap, R, L, C and Zt go to the next E24 value
  (`SNAP_SERIES` of pathLayer.ts; values from decimal text, so exactly 82e-9), Shift a decade (24 steps); lengths of
  lines and stubs go to the next whole degree (Shift: 10°). Without Snap: × or ÷ 1.01 (Shift 1.1), lengths ±1° (10°).
  From 0 or ∞ the first step gives `newPart`'s value. Lengths never go below 0.
- `keyStep` sets the layer's circuit and read point, then `onCommit(next, 'key:i')`.

## The draw tool (pathLayer.ts)

- Armed by the strip's Draw button (`data-draw`, `aria-pressed`) with the add row's kind; changing the kind while armed
  re-arms. `arm(kind)` shows a dashed accent ring at the input (`data-draw-start`) and sets `data-draw-armed` on the
  box (crosshair cursor; grab over the ring).
- A press within `HANDLE_PX` of the input (`drawAt`, before the handles) calls `beginDraw`: `startPart(kind, c)` is
  appended at the source end (of no effect; a λ/4 transformer has none and starts at Zt = Z0) and its end is dragged exactly like a handle
  (grab offset from the new end node, `project` from the start value, snapping as in M3.3a).
- Release after a move commits once (`onCommit`, then `onDraw(i)`: the page disarms and selects the new part). A tap
  (no move), Escape (`cancelDraw`), a pointer cancel or a circuit from elsewhere takes it away (`onDraw(-1)`); the panel
  texts are restored with `onLive(before, n, -1)` (live.ts skips the tile and card of a part that is not there).
- At `MAX_PARTS` the ring is not shown and the Draw button is disabled.

## Fix in M3.3a's drag

React rewrites only texts that differ from its render before the drag, so a text equal before and after but different
in between stayed stale ("9.6e−16 dB" for "0 dB", found by the random sequences). `endDrag` now writes all texts for the committed circuit (`onLive(next, i,
-1)`) before `onCommit`, and for the circuit before when a drag ends on its old value.

## Checks

`npm run check`: state "draw and key steps" (startPart leaves Γin to 1e-12 for 9 kinds × 200 circuits; E24 steps,
decades, factors, degrees, written out by hand). `npm run ui` adds `ui-edit.mjs`: every kind drawn by mouse equals the
replayed projection to 1e-9 and is one undo step; tap, Escape and the toolbar button take a draw away; one field's
keystrokes and a 15-move drag are one step each; Ctrl+Z in a typed field; 205 steps keep 200; 200 random sequences of
3 edits (typed part and parameter values, add, remove, move, drag, draw, keys) with 3 undo/redo each against a model
history (link, the layer's circuit, readout, buttons); keyboard alone (Tab to Add, Enter, Shift+Tab along the sliders
0…n, visible focus, arrows and Shift+arrows exactly as `stepValue`, Ctrl+Z ×2, Ctrl+Shift+Z, Ctrl+Y); one finger draws
at 390 and 320 px; no horizontal scroll with the tool armed. Drag timings as M3.3a (4×: 1 lost, 8–10 ms).

## For M3.4 and M3.5

- The toolbar wraps into two rows at 320 px. An empty circuit can be drawn into (the ring is at the load).
- M3.5: any "→ theory" control stays out of the marks box (aria-hidden) and the sliders' list.
- Not undone: Snap, grid mode, view (not circuit state). No keyboard drawing (Add covers it).
