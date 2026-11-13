# Smith chart – notes of step M7.2b (the sweep's plot, band figures and marker table)

Done 2026-11-13. `lib/smith/plot.ts`, `components/Smith/plotView.ts`, `SweepPlot.tsx`, `MarkerTable.tsx`; the sweep
worker, `traceLayer.ts` (the plot's hooks, the shared cursor, the figures), `Chart.tsx` (`below`), `main.tsx`,
`whys.ts`, `Status.tsx`, `SmithSweep.module.css`; `sl`/`sp` in state.ts; `scripts/harness/smith/ui-plot.mjs` (in
`npm run ui`).

## What is on the page

- **Under the chart, in its column, at every width** (`Chart`'s `below`, shown while a sweep is on, not in a "read this
  point" challenge): the head (Sweep plot, Return loss | VSWR, Limit as a return loss in dB with its |Γ| and VSWR), the
  plot, the band figures and the marker table side by side (stacked below 960 px).
- **Layout decision.** Beside the chart there is no room at 1440 px (the column is about 1,000 px wide and the chart
  740 px tall: 270 px spare) and none at 390 px. Under it, the plot keeps the full width (about 1,000 × 210 px at 1440,
  350 × 190 at 390). On wide screens the stage with a plot makes the chart 250 px lower (`.stage[data-below] .chart`),
  so after scrolling past the status note (the Tool link) chart and plot are in view together at 1440 × 900. On phones
  the plot comes right after the chart, before the side panel.
- **The plot.** Return loss downward from 0 dB at the top (a match is a dip, as on an |S11| plot) to the first of 20,
  30, … 60 dB that holds the best return loss and the limit + 5 dB; or VSWR upward from 1 to the first of 1.5, 2, 3, 5,
  10 above the band's largest (else 10, cut at the top). The axis follows the refined trace's figures and stays put
  during a drag. Frequency ticks 1-2-5 (decades in a log band), labels with as many digits as tell neighbours apart.
  The f0 line (dotted), the limit (dashed, accent), the intervals below the limit shaded (hidden while the trace is
  coarse: they belong to the refined trace).
- **Linking: one cursor, two views.** `TraceLayer.cursorF` is shown on both: a ring on the chart at Γ(f)
  (`data-sweep-cursor`) and a line, dot and "f · value" on the plot. Set by hovering the plot (any x in the plot area),
  a finger moved sideways on it, a tap, the plot's keys, hovering the chart near the trace or over a marker, and a tap
  on the chart's trace (which also adds a marker). Leaving the view that set it hides it.
- **Markers on both.** The trace layer's markers; the plot draws them from its `marks` call. A press within 22 px of a
  marker on the plot drags it along the band (both move each frame; the page hears at the release), a tap or click
  within 12 px of the curve adds one. The plot is one Tab stop: ← → ↑ ↓ to the next trace point (Shift, PageUp/Down
  ten), Home, End, Enter or M adds a marker at the cursor, Escape hides it; the markers' own sliders stay on the chart.
- **Band figures** (`bandFigures` at the limit): worst and best return loss with their f, largest VSWR, every interval
  with return loss ≥ the limit (≤/≥ at an open end), the interval around f0 with its width and fractional bandwidth
  (≥ when an end is open), loaded Q (≤ with an open end). From the worker with each refined trace; only a changed limit
  is worked out on the main thread (one scan and a few brackets, 0.09 ms in Node).
- **Marker table**: f, Z, Γ (polar), VSWR, return loss of `markerAt` on the committed circuit, readout.ts's format at
  the digits setting; scrolls sideways in its own box on phones. While the circuit is dragged the figures and table are
  dimmed (`data-state="coarse"` on the results).
- **The link**: `sl` (the limit in dB; 10 is not written), `sp=vswr`.

## Drawing and the drag

- The plot's `d` is whole numbers in plot.ts's frame (x = place in band × 1e6, y = value × 1e6; within 5e-7) under a
  group transform, so a resize or a new axis sets one attribute. The worker writes both paths (return loss and VSWR)
  with the refined trace, so the switch only swaps strings; a coarse trace's `d` is written in the plot's `trace`
  call, in the trace layer's frame, from the same coarse arrays (no extra sweep). Values are clipped (−100…300 dB,
  VSWR ≤ 1e4) beyond any axis, and the clip path cuts them at the plot's edge.
- Per drag frame the plot costs its `d` (the coarse trace's 48–600 points) and ≤ 10 transforms; the grid is rebuilt
  only on a resize, band or axis change, never in a drag.

## Measurements

Edge 157 headless on the owner's laptop; ui-plot.mjs and ui-trace.mjs, the TEN circuit of ui-drag.mjs with a band of
20–180 MHz at 10,000 points.

| | 1× | 4× CPU |
|---|---|---|
| The plot's own script per drag frame, p50 / p95 | 0.0–0.1 / 0.1 ms at about 280 points | 0.0 / 0.3 ms at 48 points |
| Plot frames per trace frame | every one | every one |

**The coarse budget is shared.** The plot's coarse `d` is written inside the trace's timed coarse frame (`writePath`
calls the plot), so the running cost per point now holds both and the same 0.3 ms gives fewer points: about 280
instead of 370–600 at 1×, 48–55 instead of 70–84 at 4×. Trace and plot together stay at the trace's old budget; the
refined trace and plot come back after the release as before.

**A/B of ui-drag.mjs's 4× drag** (`SMITH_TRACE_AB=1 tsx ui-trace.mjs`: main thread per frame, median of three runs
each; HEAD ebd8676 against this step, interleaved by stashing the step's tracked code files in this tree; HEAD shows the
trace, this step the trace and the plot): HEAD 12.22 / M7.2b 12.21 (−0.01), 12.00 / 11.89 (−0.11), 12.22 / 12.02
(−0.20). Median difference −0.11 ms: the plot adds nothing measurable (bar +0.3 ms), as the shared budget predicts.

## Checks (`ui-plot.mjs`, 94)

Five circuits (start circuit linear; 10 parts log, VSWR, limit 6 dB; open stub and line from 0 Hz; λ/4 transformer at
10,000 points, limit 20 dB; series RLC narrow log, VSWR): the plot's `d` against the engine's return loss or VSWR at
every point of `runSweep` to 1e-6 (same count); the page's figures against `bandFigures` of Node's trace (relative 1e-9,
every field and interval) and their texts, the intervals listed and shaded, the limit and f0 lines. The VSWR switch and
a typed "−15 dB" limit (link, figures). Pointing: hovering the plot puts the cursor at the same f on both and the
chart's ring at Γ(f) to 1e-3 px; leaving hides it; hovering the trace puts the plot's cursor at that f; the plot's
keys (f0 first, next trace point, Enter adds a marker, End, Escape). Markers: a click on the plot's curve adds one on
both and in the link; a mouse drag on the plot moves it on both to fAt of the release; a key on the chart's marker moves
it on the plot. The marker table at 4 and 6 digits against `markerAt` formatted as the readout. A handle drag: 8
frames, each frame's plot equal to the live circuit's coarse sweep; after the release the refined 10,000 points and the
committed circuit's figures. Timing at 1× and 4×. 390 px light and 320 px dark by touch: a tap off the curve sets the
cursor on both, a tap on the curve adds a marker, a tap on the chart's trace adds one and moves the plot's cursor
there, the table, no horizontal scroll. `check-state.mjs`: 307 more (sl/sp round trips, broken values).

## Runs

- `npm run check`: 1,394,813 checks. `npm run ui`: every script passes except ui-drag's two absolute 4× checks (this
  machine: 13.1 ms against 10, 4 frames lost; its page has no sweep); ui-chart's 4× zoom check and ui-path's two 4×
  checks failed in the full run and passed when run again alone (pages without a sweep: drift of the machine).
- The status note keeps its length ("by typing or dragging" pays for "with markers, a plot and figures"); ui-chart,
  ui-path, ui-drag and ui-edit's touch checks pass.

## For M7.3 (report and print)

- The plot is SVG in `[data-plot] svg` with pixel-space grid and lines and the trace under one transform; for print,
  `PlotView.layout` can be run at the print size (or the svg cloned with `viewBox` kept). Colours are CSS variables on
  `.plot` rules; a print stylesheet must set light ones.
- The figures are `TraceLayer.figures` (`onFigures` has one subscriber, SweepPlot; a report needs a second or the state
  lifted to the page). Marker rows: `markerTexts(circuit, markers, digits)` in MarkerTable.tsx.
- The link's `sl` and `sp` belong with the band in the printed link.
