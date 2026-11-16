# Notes from M2.2 – the field view (2026-11-16)

## Design

- **Off by default** ("Show the fields" under the drawing), so the first picture, the first load (166.0 kB gzip, was
  161.5) and the drag budgets without fields stay as they were. `fieldPaint.ts` (with `colormap.ts` and the fields
  engine's helpers) is a chunk loaded by `import()` when the view is turned on; the field work itself runs in the
  static worker (`field` job of M1.5, unchanged).
- **Map:** a canvas behind the SVG in the same box and the same view (`panZoom.ts`, `traceGeom.ts` world). The job's
  grid is the view's part of the section box (`gridView`), 2 px per point; the grid is drawn as an image of its own
  size scaled with smoothing, band by band between the stack's faces when "widen" is on (y is piecewise linear in z).
  During a pan or zoom the canvas gets the same transform as the SVG's content; when the view settles it is drawn at
  once from the last grid, then from the new job's partial grids (coarse first) and the final one.
- **Store, not state:** results go into `FieldStore`; the canvas is drawn by a listener, and only `FieldOverlay`,
  `FieldFoot` and `FieldProbe` subscribe, so a new map does not render the drawing again (at 1× this took the task
  time per drag frame from 8.8–9.6 to 4.3 ms).
- **Drag:** the job is coarse (8 px per point, progressive lattice: evaluating every point directly was slower, 55
  against 15 ms in Node), sent with the trace solve's options (the fast path included) so the worker's solve cache
  serves it, at most one per 40 ms and never cancelled by the next frame: the newest edit waits while one is in
  flight (newest-wins cancelling starved the map). Partials are not drawn while dragging. The full map follows the
  drag's end.
- With a map shown the materials are outlines (`--field-edge`) and the caption's colour keys are hidden; contours
  (dashed), field lines and the surface strips are SVG paths under the copper, two-tone (dark halo, light stroke) as
  the map's colours are the same in both themes.
- **Quantities:** φ (with 10 equipotentials; diverging when the drive has both signs), |E|, field lines (24, with
  equipotentials, over |E|), |H| with its lines (contours of Az), surface charge σ and surface current J_s as strips
  along the copper (signed, diverging, 98th percentile; the map is off and the materials keep their colours).
  **Drives** for 2 lines or more: odd, differential, even, common, one line (choose it); for more than two lines odd
  and differential use lines 1 and 2. 1 V or 1 A as `namedDrive` defines. **Scale:** linear or log (3 decades), the
  top at the 99.5th percentile (said under the bar); the bar shows the quantity, unit, range and ticks with SI
  prefixes.
- General structures get fields like any other (nothing special was needed).

## Probe and its keyboard route

Hover (mouse without a button), tap (PanZoom's `onTap`; on a general structure it also selects), and keys: the
"Probe keys" button (`aria-pressed`) makes the arrows on the focused drawing move the probe (8 px, Shift 1 px)
instead of panning; + − 0 still zoom and reset. The probe starts at the view's centre. The readout is text under the
drawing (`aria-live="polite"`): position, material and εr (or copper and which line), φ or Az, |E| or |H| and both
components, with a marker in the drawing. Values are the grid's bilinear interpolation (BL102).

## Times (Edge, owner's PC, production build; `ui-fields.mjs`)

The page's drawing is 745 px wide at a 1440 px window (the controls take the rest), so the grid is 373 × 76 points.

| Task | 1× | 4× | Budget |
|---|---|---|---|
| First picture / full map (pair, \|H\|, new jobs) | 6–7 / 18–23 ms | – | ≤ 50 / ≤ 300 ms |
| Coarse map after a drag edit, microstrip \|E\| (median / p95 / max) | 15 / 23 / 35 ms | 20 / 38 / 47 ms | ≤ 100 ms |
| Same, pair with field lines | 16 / 35 / 38 ms | 24 / 45 / 53 ms | ≤ 100 ms |
| Drag frame's own work p50 / p95, microstrip | 0.5 / 0.8 ms | 1.9 / 3.6 ms | ≤ 8 / ≤ 12 ms |
| Same, pair with field lines | 0.6 / 1.0 ms | 2.7 / 4.2 ms | ≤ 8 / ≤ 12 ms |
| All main-thread work per frame, microstrip / pair | 4.3 / 4.2 ms | 14.7 / 15.4 ms | ≤ 8 / ≤ 12 ms |

At 4× the per-frame total misses 12 ms (the drag alone, ui-drag in the same run: 10.3–11.5 ms; BL99). One attempt
was made: coarse maps at most every 40 ms (16.9 → 14.7 ms). The rest is BL101.

## Checks

`ui-fields.mjs`, 105 checks: every quantity on microstrip, pair and a 3-line general structure, every drive on the
pair and the 3 lines, the log scale; each map drawn and its scale's range equal to Node's `runJob` for the same grid
(within 3 % of the top; they agree to rounding); the probe at two points by hover, by keys and by tap equal to
`pointField` within 1 % or the grid's interpolation error; keys move the probe and do not pan, and pan again when
off; zoom and pan draw again; the times above; no horizontal scroll at 320/390/1440 in both themes; screenshots
`emsim-fields-pair-E-*` and `emsim-fields-microstrip-lines-*`.

## For M3.2 (via fields) and M8 (export)

- `fieldPaint.ts`'s `prepare`, `drawMap`, `overlay` and the scale bar take any `FieldGrid` and a world map; a via's
  top view needs only another `gridView` (its own world, no widening) and the side view the (r, z) grid mirrored
  (an image drawn twice, one flipped). `FieldStore` and the drag policy of `useFieldMap` carry over.
- Export: the map is an nx × ny image in `Painted.image` and the overlay is SVG paths in view pixels; a vector export
  wants `overlay` with board coordinates (pass X, Y in mm) and the image embedded at its grid size; the scale bar's
  ticks come from `Scale.ticks` and `si`.
- The field settings are not in the link yet (BL102).
