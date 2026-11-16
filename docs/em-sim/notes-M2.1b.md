# Notes from M2.1b – the Trace section (2026-11-16)

The Trace section of `/em-sim/main`: structure presets, the KiCad net classes as structures, typed dimensions and layers,
the cross-section drawn to scale from the solver's polygons, and the results through the static worker with a stale
state. Files in [modules-page.md](modules-page.md). Checks: `npm run ui` (size, `ui-stackup.mjs` 52, `ui-trace.mjs` 65).

## What the owner's classes show

| | on the 3313A preset | on the board's KiCad stackup as read |
|---|---|---|
| carrier `50R_SE` (single, 0.1377) | Z0 **51.50 ± 0.05 Ω** (C39) | **51.37 Ω** |
| mezzanine `LVDS_100R` (pair 0.11 / 0.2) | Zdiff **103.36 ± 0.15 Ω** (C41) | Zdiff **103.64 ± 0.20 Ω**, Zcm 30.81 ± 0.05 |

The harness compares every shown value and error with `solveSetup` in Node to 10⁻⁹ (same code in the worker).

## For M2.1c (handles, pan and zoom, the general editor)

- **Mapping** (`traceView` in `TraceDrawing.tsx`): the SVG is in px at the measured width W; x = W/2 + u·k (u mm, 0 at
  the structure's centre), y = `view.y(z)` (z mm up from the stack's bottom; linear with k unless widened, then
  piecewise over the stackup's boundaries, each board layer ≥ 9 px). Inverse: u = (x − W/2)/k, z = `view.z(y)`.
  The view spans u ∈ [−U, U] and z ∈ [zBottom, zTop]; height 170–340 px, so a pan/zoom controller should replace
  `U`/`k` and the z window rather than scale the SVG.
- **Where handles attach:** the conductors come from `section()` (`Conductor.id` 1…n, 0 ground; `pts` CCW). A width
  handle sits on a signal's base edge (the base is on `fillSide`'s far side: bottom for top copper); gap handles on the
  facing base edges; `g` on the coplanar ground's inner edge; heights on the dielectric boundaries (`stackZ`).
  `arrangement(s, st).features` gives the base edges a, b directly (simpler than reading polygons).
- Edits go through `setTrace(f, group)` in `TraceSection.tsx` (one `commit`; give a drag one group so a drag is one undo
  step). Every drag frame starts a `solve` on the same channel; the client cancels the old job. The page keeps the old
  result dimmed (`data-stale`) until the newest arrives.
- A `general` structure from a link is drawn and solved, with a note instead of fields (its editor is M2.1c).

## For M2.2 (fields)

- The field map goes **under the conductors in the same SVG** (or a canvas behind it in `.drawing`), using the same
  `traceView`; a `field` job on its own channel (`field`) shares the worker's solve cache (newest 4 by hash). The
  section is computed on the page already (`sec` in `TraceSection`).
- `TraceResults` takes a `SolveResult` (jobs.ts): line results without levels plus `matrices` (C, C0, L and their
  estimates); field jobs still return `lineResults` without matrices.

## Decisions

- The solver stays out of the first load: `staticClient.ts` (which imports the handler for the page fallback) is
  loaded by `import()` on the first solve. First load 151.3 kB gzip JS (was 140.7), CSS 4.8 kB.
- Digits (engine.md §8): the last digit at the error's leading digit, its second when the error starts with 1 or 2
  (so 0.15 shows as 0.15, as facts-cases.md writes it), never finer than 0.01 Ω (εeff and delays 10⁻⁴, matrices 0.01).
  Errors smaller than the floor show as "± <0.01".
- A value's own status is shown only when it differs from the whole result's; the flags explain the result's.
- `withStackup` keeps the trace's kind and dimensions on a stackup with other copper ids (a microstrip when the kind
  does not fit); `withSignalLayer` moves the planes to the nearest copper on the sides the structure had them.
- Delay in ps/mm, ps/in when the shown unit is mil; C in pF/m, L in nH/m; NEXT kb in %, FEXT kf in ps per length.

## Open questions

1. The default C39 and the LVDS pair come out `irregular` at M = 2 (BL79): the panel shows the flag on every pair.
   Whether to solve at M = 4 when the result is irregular is for the solver, not the page.
2. Two-digit errors for 1.x and 2.x: finer than the strict reading of "never finer than the error"; kept to match the
   facts tables. Confirm with the owner's eye.
3. Side walls and the class name with the trace have no control yet (BL95).
