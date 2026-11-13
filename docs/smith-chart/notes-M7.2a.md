# Smith chart – notes of step M7.2a (the Γ(f) trace on the page)

Done 2026-11-13. `components/Smith/traceLayer.ts`, `components/Smith/SweepPanel.tsx`, `lib/smith/sweep.worker.ts`,
`styles/SmithSweep.module.css`; `sw`/`mk` in state.ts; `scripts/harness/smith/ui-trace.mjs` (in `npm run ui`).

## What is on the page

- **Sweep panel** in the side panel between the Solve panel and the node table: "Show the trace on the chart" (off by
  default; old links and the start state show no trace), Start and Stop (any frequency text, `readAmount`), Points
  (2 to `SWEEP_MAX_POINTS` 10,000: the refinement's cap, so the page never refines past what it sweeps), Linear or Log
  (log from 0 Hz starts at stop/1000), "±50 % around f0", Add marker (at f0, else the middle of the widest gap), the
  markers with Remove. Turning it off and on brings the band back. Not in the undo history (like the value lists).
- **The link**: `sw=start:stop:points[:log]`, `mk=f1,f2,…` (numText, so every double comes back to the bit; at most
  `MAX_MARKERS` 9; a marker outside the band, or a band the page cannot sweep, is left out with an issue).
- **The trace**: the input's Γ(f), ink colour, 1.75 px, under the circuit's arcs and handles, over the solver's circles.
- **Markers**: a dot and "M1 100 MHz" on the trace at their frequency. A tap or click within 12 px of the trace that
  picks nothing of the path adds one; a press within 22 px of a marker (unless a part's handle is nearer) drags it
  along the trace (`pickOnTrace` of the pointer, the grab offset kept); a tap on it focuses it. Focused (they are Tab
  stops, `role="slider"`): ← ↓ / → ↑ to the next trace point below / above (Shift or PageDown/PageUp ten), Home and End
  to the band's ends, Delete or Backspace removes it and the focus goes to the next. Cursors: copy near the trace, grab
  over a marker.

## Drawing and the drag (the hard part)

- **`d` in whole numbers.** `pathData` writes "M x y x y …" (pairs after M are lines; no L letters) of
  `Math.round(Γ × 1e9)`, inside `<g transform="matrix(fk/1e9 0 0 −fk/1e9 −fx·fk fy·fk)">`, the world frame's map. Whole
  numbers print about twice as fast as doubles in V8 (Node, 10,000 points: 0.57 ms against 1.0–1.3 ms; `(x+0.5)|0`
  0.43–0.57 ms but rounds negatives wrongly) and the string is 45 % shorter (208 kB against 378 kB) to parse. The
  points are within 5e-10 of the engine's (the harness's bar is 1e-9). The transform is set again only on a reframe,
  so no zoom frame and no reframe rewrites the `d`. A point that is not finite breaks the line (none seen).
- **No full sweep on the main thread.** Every new circuit or band is drawn at once as a **coarse sweep**: the band at
  n even points (not refined), n = COARSE_MS 0.3 ms / (cost per point × (parts + 1)), at least 48, at most the band's
  points; `cost` is a running average over the coarse frames' own script (sweep, `d`, setAttribute), so the timer's
  0.1 ms steps average out and 4× gives fewer points than 1×. The **refined trace** (sweep.ts `runSweep`, cap 10,000
  points) and its `d` come from `lib/smith/sweep.worker.ts`; the newest request wins (stale replies, and replies during
  a drag or for a circuit no longer shown, are dropped). Without a worker the page sweeps in full on the main thread.
  A first try with a two-figure model (fixed + per point) made the fixed part swallow the budget at constant n (the
  two are not separable from frames of one size) and was dropped; a loop measured the fixed part of a coarse frame at
  0.03 ms at 1×, 0.1 ms at 4×.
- **During a handle's drag** each frame that changed the circuit draws the coarse trace of `PathLayer.liveCircuit` and
  moves the markers to their Γ on it; after the release the committed circuit (the same object) is asked of the worker.
  At 1×: about 370–600 points; at 4×: 48–70 points (the minimum or just above).
- **Before (tried and changed):** the full refined sweep on the main thread after the release and after a pause in
  quick changes: at 4× it cost 29–32 ms of main thread on each release (10,000 points of 10 parts, the `d` included).

## Measurements (Edge 157 headless, the owner's laptop; ui-trace.mjs, the TEN circuit of ui-drag.mjs, band
20–180 MHz at 10,000 points)

| | 1× | 4× CPU |
|---|---|---|
| Trace script per drag frame, p50 / p95 | 0.30 / 0.50 ms at 386 points | 0.30 / 0.50 ms at 70 points |
| Path layer per drag frame, p95 | 0.40 ms | 1.8–2.1 ms |
| Main thread per drag frame (median of 3) | 3.00 ms | 12.26 ms |
| Refined trace after the release: asked to drawn | 11.0 ms | 31.6 ms |
| … the worker's sweep and `d` | 8.4 ms | 8.2 ms (workers are not throttled) |
| … the main thread's setAttribute of 10,000 points | 0.60 ms | 2.30 ms |

**A/B of ui-drag.mjs's 4× drag** (main thread per frame, median of three runs each, HEAD 4c8a336 against this step with
`sw=20e6:180e6:10000`, interleaved by stashing the step's tracked files; the window ends at the release, as in
ui-drag.mjs): HEAD 11.08 / M7.2a 11.52 (+0.44), HEAD 15.57 / 12.51 (HEAD's runs 11.07, 15.57, 18.36: an outlier),
HEAD 11.04 / 11.72 (+0.68). Median of the pairs' differences +0.44 ms, within the step's 0.5 ms; the best runs of each
side differ by +0.04, +0.55, +0.77 ms. The earlier design (full sweep on release, on the main thread) measured +0.69 ms
on average over three pairs, about 0.26 ms of it the release's sweep inside the window.

engine.md §9's budget: 4 ms of script per frame at 1× for the chart with a 2,000-point trace; the trace adds 0.3 ms at
the coarse budget and the path layer's own frame is unchanged. The machine's drifted 4× main-thread figures (ui-drag's
absolute 10 ms check, notes-M4.3a.md) are as before: 11–12.5 ms on both sides.

## Checks (`ui-trace.mjs`, 62)

Five circuits (start circuit linear; 10 parts log 1 MHz–1 GHz; open stub and line from 0 Hz; λ/4 transformer at
10,000 points; series RLC, narrow log): the `d` read from the DOM against `runSweep` of the linked circuit, every point
to 1e-9 (worst 5e-10) and the same count; the frequencies to the bit for linear bands, to 1e-15 for log bands
(`Math.exp`/`Math.log` may differ by an ulp between Node and Edge: seen in 2 of 5 cases). Markers: a click on a free
trace point adds one between its neighbours with `markerAt`'s Γ to the bit, in the link and the panel; a mouse drag
moves it to another trace point; ←, ↑, Shift+→, ←, PageDown, Home, ← at the start, End, → at the stop against the
trace's frequencies; Add marker at f0; Delete (focus to the next) and the panel's Remove; the link with two markers
read back; Log and a typed stop in the link with the new trace equal to the sweep; off and on. A drag: 8 frames, each
frame's `d` equal to the coarse sweep of `liveCircuit` at `coarseN` points (1e-9); after the release the refined
10,000 points of the committed circuit. Timing at 1× and 4× (trace drawn in more than 80 % of the path's frames, its
p95 ≤ 1 ms). 390 and 320 px (dark, touch): a tap adds a marker, no horizontal scroll, the panel fits.

## Runs and a lesson

- `npm run check`: 1,394,506 checks (15 new in "the sweep in the link"). `npm run ui`: every script passes except
  ui-drag's two absolute 4× checks (this machine's drift: 11.0–11.3 ms against 10, 2 frames lost) and, on some runs,
  ui-chart's 4× zoom main thread against its 6 ms (an interleaved A/B, two pairs: HEAD 5.68 and 5.54, this step 5.92
  and 5.64; both sides pass and fail it by turns).
- **The status note's height moves the chart.** A first, longer status text pushed the chart 20 px down at 1280 px
  (39 px at 390 px), so ui-chart's readout point near the rim fell below the 900 px viewport and the touch checks of
  ui-chart, ui-path, ui-drag and ui-edit tapped beside their targets. The note was cut back to its old length (the
  chart's top again 256.5 px at 1280, 559 px at 390). A later step that lengthens the note must keep its height, or
  the harness's viewports must grow.

## For M7.2b and M7.3

- The trace is `box.smithTrace.shown` (a `Trace`: read `n`, `freqs`, `gamma`; replaced, not refilled, by each worker
  reply) and its state `stateName` ('coarse' while dragging or until the worker answers, then 'full'); the markers are
  the page's `sweep.markers` (frequencies), their points `markerAt(sweepCircuit(circuit), f)`. A plot can redraw from
  the same coarse/full switch: during a drag the coarse arrays are in `traceLayer.coarse`.
- `TraceLayer.onMarkers` fires once per add, drag end, key and removal; a table can take the markers from the page's
  state. A marker pointed at in a plot can be focused with `[data-sweep-marker="i"]`.
- `bandFigures(trace, sc, threshold)` should run on the refined trace only (in the worker, or on 'full').
- BL64 (a faster kernel) stays open: with the worker the page does not need it; it would give more coarse points at 4×.
