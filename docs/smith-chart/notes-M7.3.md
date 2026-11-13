# Smith chart – notes of step M7.3 (report and print)

Done 2026-11-13. `components/Smith/Report.tsx`, `bandText.ts`, `styles/SmithReport.module.css`; `SweepPlot.tsx`
(`Figures` exported, new words), `MarkerTable.tsx` (cards on phones, the report's copy), `plotView.ts` (`printCopy`),
`traceLayer.ts` (`figureListeners`), `main.tsx`, `whys.ts`, `Status.tsx`, `Smith.module.css` (print),
`SmithSweep.module.css` (cards); `scripts/harness/smith/ui-report.mjs` (in `npm run ui`), ui-plot.mjs and ui-why.mjs.

## Two fixes of M7.2b

- **The marker table at 320/390 px** was wider than its column (the Γ column cut at 390 px). Below 600 px every table
  of SmithSweep.module.css's `.table` is one card per row with the column's name before each value (`data-label`,
  `td::before`), so nothing is cut or scrolled; wider, the table keeps its box that scrolls and takes the focus.
  ui-plot.mjs and ui-report.mjs check that no cell lies outside the box that clips it unless that box scrolls and is
  focusable (320 and 390 px).
- **The band figures' words** (`bandText.ts`, used by the plot's figures and the report): an interval is "lo – hi",
  "from before the band's start (lo) to hi", "from lo to past the band's end (hi)" or "the whole band (lo – hi),
  perhaps beyond both ends"; around f0 "…: 20.00 MHz wide, 20.00 % of f0", with "at least" before both when an end is
  open, else "none: f0 (…) is outside the band" or "none: the match at f0 is worse than the limit"; the loaded Q
  "at most 4.667 at 140.0 MHz; the band ends before the power falls to half, so the true width is larger" ("on both
  sides" when both are open), "none: no power is delivered at the best match". Checked in Node for every case.

## The report

- After the tool (a sibling of `#tool` in `main`, with `content-visibility: auto`; not in a "read this point" challenge,
  whose answer it would give):
  Circuit (Z0, f0, the load, every part with every form of its card but the normalised one, from the load), The input
  at f0 (z, Z, Γ, VSWR, return loss), Nodes at f0 (the same for every node), with a sweep the band, its figures
  (`Figures`) and the marker table, then the link (the page's own search, kept in `main.tsx`'s `search`). Its copies of
  the figures and markers carry `data-r-…` attributes, so the plot's stay unique for the harness. The figures come from
  the trace layer's `figureListeners` (the plot's and the report's).
- **Print** (Print report = make the figures and `window.print()`; Ctrl+P makes them in beforeprint): `@media print`
  at the end of Smith.module.css hides everything but the report (bar, status note, chart workspace, Learn, theory;
  the footer and white html/body in main.tsx's global style, with `@page { margin: 12mm }` and no size, so A4 and
  Letter both work) and forces the light tokens with `.root.root.root` (white paper, the chart's background white),
  whatever the theme. Buttons and short-line markers are hidden; rows, list items, blocks and figures do not break.
- **The chart** is a copy of the chart's box as shown (`chartCopy`): grid SVG, top SVG and the HTML marks, without
  handles, their keys, snapping marks, the draw tool's start, the read point, the cursor and hidden items; ids, tab
  stops, roles and aria removed; cut to the disc plus 44 px for the rim's scales (within the box) and scaled to 150 mm
  by a CSS transform, so text and lines stay vectors. Chromium's own beforeprint for `page.pdf()` comes in print media,
  where the chart's box is hidden and its view has no size: a copy is then kept, not replaced by nothing.
- **The plot** is laid out again at 680 × 240 px (`PlotView.printCopy`: the axes, ticks, f0 and limit lines, shading
  and markers for that size, the same `d` under the new frame transform), cloned without the cursor and with its own
  clip id, then the page's plot is laid out back before any paint; its viewBox scales it to the page width (A4 703 px,
  Letter 725 px: about 1:1, so its 11 px labels print at their size).
- afterprint drops both copies. The report renders on commits only (memoised) and is skipped off screen (below).

## Measurements

PDFs from `page.pdf()` in Edge (the 10-part circuit with a 1,001-point log sweep, three markers, VSWR, limit 6 dB):
3 pages at A4 and at Letter, in both themes (page 1 the title and chart, circuit and input; page 2 the node table, the
plot and the band figures; page 3 the markers and the link). The light and dark PDFs hold the same text.

**A/B of ui-drag.mjs's 4× drag with the sweep shown** (`SMITH_TRACE_AB=1 tsx ui-trace.mjs`, main thread per frame,
median of three runs; HEAD 1fe3cd6 against this step, interleaved by stashing the step's tracked code files):

| Report | HEAD / M7.3 per pair (ms) | Differences |
|---|---|---|
| inside `#tool` | 13.28 / 14.08, 12.54 / 14.10 | +0.80, +1.56 |
| after `#tool`, no containment | 12.56 / 13.90, 12.86 / 14.28 | +1.34, +1.42 |
| after `#tool`, `content-visibility: auto` on the section after the first render | 12.30 / 13.04, 13.52 / 13.20, 13.30 / 12.91, 12.87 / 12.58 | +0.74, −0.32, −0.39, −0.29 (median −0.30) |
| the same on the body only, head and link outside (kept) | 12.24 / 12.01, 11.78 / 11.98 | −0.23, +0.20 |

A report on the page costs every drag frame about 1.4 ms at 4× while it is laid out and styled, wherever it sits
(the drag's frames restyle and lay out the page's flow); skipped off screen, it costs nothing measurable. The class is
added two frames after mount, so `contain-intrinsic-size: auto` has remembered the real size and nothing jumps when it
comes into view. It is on the body only: the short lines' bubbles are `position: fixed`, and inside containment a fixed
box is placed in the contained box's frame, so ui-why found the bubbles of `report` and `report-link` off screen while
the whole section was contained.
## Runs

- `npm run check`: 1,394,813 checks. `npm run ui`: ui-report 110, ui-plot 96 (two new), ui-why 990 (87 lines), every
  other script passes except ui-drag's two absolute 4× checks (this machine); ui-path's two 4× checks and ui-math's
  0.3 ms panel bar (0.32) failed in full runs and passed run again alone. ui-math's D20 scan of the page's text leaves out
  the report's link (`data-r="link"`): it is the link's machine form, where `5e-15` is how a value is written.
- `npx tsc --noEmit`, `npm run build`.

## For M7.4 and M8

- The figures' words are in `bandText.ts`; the theory can cite them as T 236 and T 235.
- M8's export can reuse `PlotView.printCopy` for the plot's SVG and `chartCopy`'s idea, though a standalone SVG
  needs the HTML marks drawn as SVG (the figure model of D18).
