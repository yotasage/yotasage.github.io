# Smith chart – notes of step M2.2 (chart interaction)

Part of [plan.md](plan.md). The chart on `/smith-chart/main` zooms, pans and reads points; still no card (M3.4).

## Files

- `components/Smith/chartView.ts`: `ChartView`, the framework-free controller (view, input, frame loop).
- `components/Smith/readout.ts`: `READOUT_FIELDS`, `complexText`, `readoutTexts(Γr, Γi, z0, out)`, `writeReadout`.
- `components/Smith/Chart.tsx`: `<Chart mode z0? onView?>`: Fit / Reset / zoom indicator, the focusable box with the
  two `<svg>`s, the readout panel. React renders it once; the controller writes everything that moves.
- `components/Smith/Grid.tsx` is removed: a React-props-driven grid would fight the frame loop; `ChartView` makes
  the `GridLayer` itself. `GridLayer.holds(...)` is new (whether the built grid can be shown stretched).
- `scripts/harness/smith/ui-chart.mjs`; `npm run ui` runs `ui-grid.mjs -` (no shots) then `ui-chart.mjs [shots]`.
  `ui-grid.mjs` sets the view through the controller (`document.querySelector('[data-chart]').smithChart`).

## Controller API (for M3)

- View: `cx, cy` (Γ at the box centre), `k` (px per unit Γ), `w, h`, `kFit` (`fitK`), `zoom` = k / kFit, limits
  1× to `MAX_ZOOM` = 1024×; the centre is clamped to ±(1 + scale ring) per axis. `setView(cx, cy, k)`,
  `zoomAt(px, py, f)`, `panBy(dx, dy)`, `fit()`, `reset()` (fit + no read point), `setMode(mode)`, `setRead(Γr, Γi)`
  (NaN = none). Coordinates: `gammaX/Y(px)`, `screenX/Y(Γ)` in box px.
- `request(flags)`: `DIRTY_VIEW | DIRTY_READ | DIRTY_CONTENT`; one rAF writes everything (coalescing).
- Top layer (`top` `<svg>`): `world` `<g>` in a Γ frame, user units `worldX(Γr) = (Γr − fx)·fk`, `worldY(Γi) =
  (fy − Γi)·fk`, one `matrix` per frame. The frame is set again (`frameId++`, `onReframe()`) when its scale leaves
  [½, 2] or the centre is 4 box sizes away: M3 rewrites arcs and the trace there (and in its drag frames). `screen`
  `<g>` is in box px, no transform: handles (constant size) and the read marker (`marker`, `data-part=read`) are
  positioned in `onFrame(dirty)`, which runs at the end of every frame.
- `onReadout(Γr, Γi)` runs in the frame when the read point changed (Chart writes the panel with `writeReadout`).
- `handles: HandleHooks | null` (M3.3): `hit(px, py, target)` (≥ 44 px areas), `down/move/up(id, px, py[, cancelled])`.
  A pointer that hits a handle is routed to the hooks, never pans; `touchstart` calls `preventDefault()` when one
  finger starts on a handle (D14), so that finger drags instead of scrolling.
- `frames`, `workMs`, `lastWorkMs` for timing.

## Event rules

- Mouse: hover moves the read point; drag (button 0) pans, the Γ under the pointer follows it exactly; wheel zooms
  e^(−0.002·Δy) about the pointer (trackpad pinch = ctrl wheel: rate 0.01; line and page modes scaled), always
  `preventDefault` (the page does not scroll under the chart); a click places the read point.
- Touch (`touch-action: pan-y`): one finger vertically scrolls the page (the browser sends `pointercancel`; any pan
  before it is undone); one finger sideways pans; two fingers pinch about their midpoint and pan; a tap (< 8 px,
  < 600 ms) places the read point. A third pointer is ignored.
- Keyboard (box `tabIndex 0`, ring `box-shadow inset 2px` on `:focus-visible`): arrows pan ⅒ of the shorter side
  (Shift ⅟₁₀₀), `+`/`=` and `−`/`_` zoom √2 about the centre, `0`/Home fit; the read point becomes the view centre.
- Readout: z, Z (Ω), y, Y (S), Γ polar and Cartesian, VSWR, return loss; 4 digits by `formatAmount`; open is "∞",
  "∞ Ω"; |Γ| > 1 shows the values (r < 0) and a note that VSWR is not defined there; the panel says how to read before
  the first point.

## Gestures stretch the grid (performance)

Writing the grid group's transform each frame repaints every grid path: ~10 ms main thread per frame at 4× CPU
(vector-effect and labels made no measurable difference). So during a gesture (wheel, pinch, drag; it ends 160 ms
after the last input) the grid's `<svg>` gets a CSS `matrix` from the view it was last drawn for (compositor only,
`overflow: visible` so what the grid holds beyond the box shows); it is drawn again when the gesture ends, the stretch
passes 2× or ½×, or `holds` is false (mode, density 2× off, chart in view outside `covers`). While stretched the grid
is up to 2× blurred and its strokes up to 2× wide. The top layer is written per frame (sharp).

## Checks (`npm run ui`: grid 20,214, chart 309)

Readout at 20 mouse points (one outside the disc) parsed back against convert.ts to the shown digits, read point
under the pointer to 1e-9, marker on it; wheel keeps Γ under the pointer (1e-6) with the exact factor, no page scroll;
limits 1× and 1024×; drag pans by the delta (1e-9); Tab reaches the chart, ring, arrows, + −, 0, Home; Fit, Reset;
mode switch keeps the view; CDP touch at 390 px: pinch 3× about the midpoint without page zoom or scroll, two-finger
pan, one finger up scrolls the page and leaves the view, one finger sideways pans, tap reads; 320 px fits.

## Timings (Edge headless, 1280 × 900, synthetic wheel every 8 ms for 2 s, 18× in and out; median of 3 runs)

| CPU | frame interval p50 / p95 | chart script p50 / p95 | main thread per frame | grid rebuilds |
| --- | --- | --- | --- | --- |
| 1× | 16.7 / 16.8 ms | 0.0 / 1.5 ms | 1.0 ms | 9 |
| 4× | 16.7 / 16.9 ms | 0.2 / 0.5 ms | 3.8 ms (3.6–4.2) | 5 |

Headless Edge runs rAF at 60 Hz, so p95 ≤ 17 ms means no dropped frame. Measured in the dev server.

## For M2.3 and M3

- M2.3: the bar (Fit, Reset, zoom, hint) and readout panel are a first pass; the hint text names wheel and drag also
  on phones. The owner should confirm D14 on the phone.
- M3: draw arcs in `world` on `onReframe` and drag frames; handles in `screen`, positioned in `onFrame`; set
  `handles`. Drag frames should call `request(DIRTY_CONTENT)`, not write the DOM in the event.
