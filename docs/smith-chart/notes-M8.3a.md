# Smith chart – notes of step M8.3a (figure export on the page)

Part of [plan.md](plan.md) (D18, milestones.md M8). New files `components/Smith/ExportPanel.tsx`,
`styles/SmithExport.module.css`, `scripts/harness/smith/ui-export.mjs` (in `npm run ui` after ui-report); changed
`pages/smith-chart/main.tsx`, `components/Smith/whys.ts`, `components/Smith/Status.tsx`, `styles/Smith.module.css`
(`.toolLink`), `ui-why.mjs` (95 lines).

## On the page

- **Where.** A section `#export` after the report, reached from an **Export link in the chart's toolbar** (after Undo,
  Redo and Start over), not from the nav. The nav has four tabs that fill the row at 44 px on screens of 480 px and
  less (71e6c89); a fifth would not fit there, and the export, like the report, belongs to the tool rather than to the
  reading sections. Not shown in a "read this point" challenge (the figure would show the answer), as the report.
- **Options** (left column; one column under 860 px): Shows (Whole chart, Current view), Width (88, 160, 180 mm, Other:
  any width `readWidth` reads, "120 mm", "12 cm", "4.5 in", or `\linewidth` with the assumed 160 mm; an unreadable
  width shows a message and builds nothing), Detail (Minimal, Standard, Full) with an Items list (grid Z/Y/ZY, density,
  the twelve switches, "Blank chart (circuit off)" = `blankDetail`; "Items (changed)" when no preset matches), Colour
  (Colour, Greyscale, Black and white), Text size 6–12 pt. Kept in localStorage `smith.export` (read after mount,
  every field checked by `readPrefs`).
- **Preview**: `figureSvg(fig, { id: 'smith-export-preview' })` in a frame of the figure's width and height in CSS mm,
  white paper in both themes, its text at its pt size. A line says the size, the current view, `\linewidth`'s assumed
  width, and "true size" or "scaled to N % to fit the screen". When the figure is wider than its column a "Fit to screen
  (scaled)" box shows (on by default): a CSS scale of the same SVG; off, the frame scrolls inside its wrapper, never
  the page.
- **Files**: LaTeX: Picture or Standalone document, Copy TikZ (clipboard API, else a hidden textarea and
  `execCommand`), Save .tex; Image: Save SVG (`figureSvg` with the default id), a scale 1×, 2×, 3×, 4×, 6×, 8× with the
  pixel size of each, Save PNG. All from the one `Figure` of the preview. Files are Blobs saved through a download link
  (`smith-chart.svg|.png|.tex`); nothing leaves the device.
- **PNG size**: the figure's mm at 96 px per inch times the factor, rounded (`pngSize`): 88 mm is 333 px at 1×, 665 at
  2×, 2661 at 8×. The SVG is drawn on a canvas of that size (`drawImage` scales the vectors, so 8× is sharp), white
  background from the SVG. Factors that would exceed 16384 px a side or 120 Mpx are disabled (a 2000 mm figure).

## Cost and the drag

Nothing is built until an IntersectionObserver sees the section within 200 px of the screen. Then the figure is built
on a change of options, circuit, sweep or solve outcome; the circuit changes on a commit only, so never in a drag's
frames, and a build asked for while a handle is dragged (`busy`) waits for the pointer's release. "Current view" reads
the chart's `cx, cy, k, w, h` every 400 ms while the section is on screen and builds once the view stood still for a
tick. The sweep's trace (`runSweep` with the page's refinement) is cached per circuit and sweep. A Full 180 mm figure
with a sweep builds and writes in a few ms. The preview's wrapper has `content-visibility: auto`: off screen its
thousands of SVG elements are not laid out or painted.

A/B (ui-export, 4× CPU, a handle drag for 2 s, one page, B = the preview's SVG taken out, A = put back, B A B A, Full
ZY 180 mm with a sweep): added −0.01 to −0.10 ms per frame over three runs (noise between runs ±0.7 ms at 13 ms a
frame). A first A/B on separate pages (B never scrolled) showed +0.6–0.8 ms, from the sections scrolled past on the way
(the report's and the theory's first layout) and the preview without containment; the one-page form measures the
export alone.

## The check moved here from M8.1b

The figure model the page builds (`smithExport.fig`, current view, 180 mm, Full detail with the Z grid) against the
chart's DOM in the same view, for the start circuit, one part of every kind and a circuit with a 0.65 λ line, at 1× and
3×: every grid circle drawn by both (109–176 per case; the two grids are thinned for different spacings, so the circles
in both are compared, at least half of either) has the same centre and radius to 2e-15–5e-15 of the chart's radius,
and the chart's arc pieces end on the model's circles; every part's arc in the model starts and ends where the chart's
does and every piece the chart draws lies on the model's circle (2e-16); every node in view equals a model node and
back (≤ 1.1e-16). Bound 1e-9.

## Checks (ui-export.mjs, 216)

Geometry above; the frame at 88, 160 and 180 mm equals the mm × 96/25.4 px to 0.02 px (layout units are 1/64 px:
332.594 for 332.598); 32 option changes each rebuild the preview, which equals element by element (tag, attributes,
text) `figureSvg` of the figure built in Node from the link with the page's options (with a sweep and two markers);
the saved SVG and the copied and saved TikZ picture and document equal the writers' output (Windows' clipboard gives
CRLF back; undone before comparing); PNGs at 1×, 2×, 8× with the IHDR size and decoded by the browser to an opaque
drawing; options kept after a reload; keyboard alone; 320 and 390 px fitted and at true size without horizontal
scroll; the A/B. `SMITH_EXPORT_AB=1` runs only the A/B.

## For M8.3b

- The section's state is `ExportPrefs` (`area`, `size`, `other`, `detail`, `colour`, `fontPt`, `tex`, `png`, `fit`);
  project.ts's `ExportSettings` holds `width`, `linewidth`, `view`, `detail`, `colour`, `fontPt` plus the CSV and
  Touchstone settings. Saving a project: `widthOf(prefs)` gives width and linewidth, `view` the chart's
  `chartWindow` when `area` is `view` (else null). Opening one: a width equal to a preset sets that size, else
  `other` = "<mm> mm" or `\linewidth`; a window sets `area: 'view'` and should set the chart's view to it.
- The CSV and Touchstone buttons belong in the same section (a "Data" group under Image); the section's note line
  (`data-export-note`) and `save()` can be reused; the short lines go in whys.ts with `how-to-use`.
- The status note's "still to come" then empties: keep the note's length (BL65).

## Left out

- The preview is not interactive (no zoom of its own); the chart's view is the way to choose a window.
- Fit to screen scales by CSS, so its text is no longer at its pt size; the note says so.
