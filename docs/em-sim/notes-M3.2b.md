# Notes from step M3.2b – via field maps and the via target

## The engine (`lib/emsim/viafield.ts`, job `via-field`)

- Both maps are fields.ts `FieldGrid`s, so `fieldPaint.ts` (`prepare`, `overlay`, `probeAt`, the scale bar) serves them
  as it serves the trace's.
- **Side view:** the last level of `viaAxisym` with the wall the via model uses (R_eq of the return vias, or the rule
  wall when R_eq lies inside an opening; same options as the `via` job, so axisym.ts's cache serves it). Grid x is the
  distance along the section line through via A, z stackZ's frame; the view is snapped so its x points are multiples of
  the spacing, which puts |x| on one r lattice: each (r, z) is evaluated once and mirrored exactly (Ex = sign(x)·Er).
  Beyond the wall (a pair: also beyond half the pitch) is outside the model: copper class −1, drawn as nothing. 1 V
  on the via; for a pair the page says it is one via alone, as the model solves it.
- `axiField` costs about 30 µs a point on C44 (242 ring panels), so the grid is adaptive: the first lattice (every 8th
  point) in full, then each halving evaluates a point only near copper or where its cell's φ changes by over 0.05 V or
  |E| by over 25 %, the rest interpolated (about half the points evaluated, 3699 of 7776 in the check's window;
  against every point evaluated, φ within 4 mV and |E| within 5 % on all but 0.2 % of the points, 12 % at worst
  beside a corner). The page draws it at 4 px per point (BL122).
- **Top view:** `viaCut`'s 2D solve (vacuum; a homogeneous layer has the same φ and E for the same voltages) through
  `fieldModel` with `cutMedia` (circles as copper; points around each circle as the media's corners, so fields.ts
  evaluates directly near the barrels: without them the grid's |E| was 4.8 % off at a + 0.02 mm, with them 0.37 %).
  Drive: per-barrel volts (single 1 V; pair differential ±½, common 1/1, one via 1/0). Contours always from the drive's
  range; field lines (24) on request.
- **Check** (`check-viafield.mjs`, 109 checks): the barrel in a coaxial ring (`viaCut` with `ring`) against
  φ = ln(b/r)/ln(b/a) and |E| = 1/(r·ln(b/a)): points within 0.11 %, a progressive grid within 0.37 %; the side grid
  equal to `axiField` mirrored (5.7·10⁻⁸); the pair's differential φ = 0 on the middle line; the job through `runJob`.
- **Worker:** a job that posts a partial now lets a queued job go first (round robin at pictures), so with both maps
  sent at once each shows its first picture before either refines. Cancelling a rotated job works as before.

## The page

- "Show the fields" under the two views (off by default, so the first load and the drag budgets stay; `fieldPaint.ts`
  loads by `import()`). The map is an SVG `<image>` (the grid's own size, PNG data URL) in the view's pixels, after the
  side view's bands and the top view's antipads, under the copper; a pan or zoom moves it with the drawing's content
  and the new map follows the settle. In the top view the pads are outlines while the map is on (the field around the
  barrel shows), the drill copper.
- Quantity φ (with 10 equipotentials), |E|, or field lines with equipotentials (lines in the top view only); a pair's
  drive for the top view; linear or log; the scale bar per view (`FieldFoot`) with what the map shows.
- The probe per view: hover, tap, and "Probe keys" (arrows 8 px, Shift 1 px, `onKeyDownCapture` so PanZoom does not
  pan); the readout says the place (along the cut and depth, or x and y), copper, εr or "outside the model".
- Dragging: as the trace's map (8 px per point, `estimate: false`, at most every 40 ms, the newest edit waiting).

## The target (`ViaTarget.tsx`)

- Quantity (a single via: the section's √(L/C); a pair: Zdiff or Zcm, as `viaTarget` offers), the target in Ω, by
  every plane's antipad or the return vias' distance; the `via-target` job with `{tdr: false, nf: 2}`. Shows the value
  found with the impedance reached and its error (ViaResults' section error), or "Out of reach:" and the engine's
  reason; "Use this" is one commit (undo gives the via back); "In use." after it, "find again" when the via changed.
- Single default via, 50 Ω by the antipad: Ø1.7583 mm, 50.0000 ± 0.3 Ω (10 solves, about 220 ms). C45 Zdiff 100 Ω:
  "The target 100 Ω is outside 53.21–99.88 Ω over 0.270–3.270 mm." Zdiff 85 Ω: Ø1.3753 mm. **Zdiff 90 Ω stops at
  90.45 Ω:** the via model jumps between about 87.0 and 90.4 Ω where the pads' wall changes from R_eq to the rule wall
  (BL121); the page shows the engine's reason.

## Times (production build, the owner's laptop, 1440 px wide, both maps sent at once)

- Side (187 × 102 at 4 px): first picture 11–14 ms, full 140–191 ms. Top (373 × 191 at 2 px): first 35–50 ms, full
  181–233 ms (it shares the worker with the side map). Budget 50 / 300 ms. First load 179.8 kB gzip (179.4 before).
- ui-viadrag's 4× rows with the fields off: task per frame 16.1, 15.2 and 18.7 ms (M3.1b: 14 to 18 ms), work p95 5.3,
  5.7 and 5.1 ms (4.4 to 5.1): about as before (BL115).

## For M5 (3D view) and M8 (export)

- M5: fields on cut planes can use `viaFieldJob` as it is: the side map is any vertical plane through the barrel (the
  solution is axisymmetric), the top map any horizontal plane between two planes (the cut's field); a texture is
  `Painted.image`.
- M8: the maps are `Painted.image` at grid size with the grid's view in mm; contours and lines from `overlay` with
  board coordinates; the scale bar's ticks from `Scale.ticks`.
- Left: BL121 (the model's jump), BL122 (2 px side maps by faster ring kernels), BL123 (field and target settings in
  the link).

## Fix after M3.2b – the top map's first picture

- **Cause:** scheduling, not the top job's work (in Node its cut solve is about 1 ms, `topSource` 0.1 ms, the first
  lattice 10 ms). The harness's zoom and pan steps send the side map, then the top map a few ms later; by then the side
  map had shown its first picture and was refining in 40 ms slices with a plain yield only every 1500 points (about
  45 ms on C44), and the rotation at pictures only happened at the side's next picture. In a Node model of the worker,
  a top job arriving 15 to 60 ms after the side job waited 45 to 105 ms for its first picture.
- **Fix:** (jobs.ts) a job that has shown a picture refines in slices of `REFINE_SLICE_MS` (4 ms) and, at any yield,
  gives way to a queued job that has not shown one (picked first from the queue); the worker and the page fallback
  schedule slices with `messageScheduler()`, a MessageChannel task, as nested `setTimeout(0)` waits 4 ms each after
  five levels (in Node the port is held only while a slice waits, or check-worker's client keeps the process alive); (viafield.ts) the side grid yields every 120 points (about 4 ms). No value changes (the coarse lattice
  stays 8: 16 would save about 5 ms but changes the adaptive grid's values by up to 2.4 mV).
- **Times** (production build, 1440 px, ui-viafields' five maps, three runs): top first picture before 39, 38, 60, 43,
  50 and 33, 55, 32, 41, 40 ms; after 29, 30, 24, 34, 30 / 28, 29, 24, 34, 29 / 29, 28, 29, 36, 30 ms. Side first 11 to
  15 ms as before; full pictures side 154 to 207 ms, top 161 to 228 ms (within 300).
