# Smith chart – notes of step M8.3b (data files, project and link on the page)

Part of [plan.md](plan.md) (milestones.md M8, the last step of M8). New file `scripts/harness/smith/ui-files.mjs` (in
`npm run ui` after ui-export) and `docs/smith-chart/theory-lines.md` (theory.md §8 split off for size); changed
`components/Smith/ExportPanel.tsx`, `pages/smith-chart/main.tsx`, `components/Smith/Strip.tsx` (`issuesOf`),
`components/Smith/whys.ts` (99 lines), `components/Smith/Status.tsx`, `lib/smith/export/project.ts` (`TOO_LARGE`
exported), `styles/Smith.module.css` (`.dropZone`, `.fileNote`), `styles/SmithExport.module.css` (`.file`,
`.fileInput`), `pages/index.tsx` and README.md (the exports listed), `check-export.mjs` (`readTouchstone` exported),
`ui-edit.mjs` (status text, card text), `ui-why.mjs` (99).

## On the page

- **Data** (in the Export section, under Image): CSV digits "As shown (N)" (the page's digits setting, `shownDigits()`)
  or "Every digit"; numbers Plain or Engineering; Nodes CSV, Trace CSV, Markers CSV (`smith-chart-nodes|trace|markers.csv`,
  `text/csv;charset=utf-8`); Touchstone RI, MA or DB and Save .s1p (`smith-chart.s1p`, with the page's full link as a
  comment). The trace and markers come from the panel's own cached `Trace` (the same `runSweep` the figure uses).
  Without a sweep the trace, markers and .s1p are disabled and a line says they need one; Markers CSV also without
  markers.
- **Project and link**: Save project (`smith-chart.smith.json`: `projectJson` with the circuit and its ask, the sweep,
  the value lists and `settingsOf(prefs)`: the width, "current view" as the chart's window, detail, colour, text size,
  CSV digits as a number, form, Touchstone format); Open project (a file input laid over a label styled as a button, so
  click, tap, Tab and Enter all open the picker); Copy link (origin + path + the page's `search`, clipboard API or
  `execCommand`). A line says a project can also be dropped on the page and that files are read on the device.
- **Opening** (main.tsx `openFile` → `applyOpened`): files over 1 MB are refused unread; else `file.text()` and
  `openProject`. A refusal is only a message. Otherwise the draw tool stops, a challenge, a lesson and the guide close,
  the circuit arrives by one `commit` (one undo step; Undo gives the old circuit back), the sweep and value lists are
  set (they are not in the history, as before), the issues are listed under Circuit as "The project file could not be
  read in full" (or "link in the file" for version 0), and the export settings go to the section (`opened`, `prefsOf`;
  a saved window becomes the chart's view). A text size outside the list's 6–12 pt shows as an extra choice.
- **Drop**: window listeners for drags that carry files only (a drag of text inside the page is left alone), a dashed
  drop zone while one is over the page; the first file is opened.
- **Message**: fixed at the bottom of the screen (`data-file-note`, `role` status or alert), so it is seen wherever the
  visitor dropped the file; an opened file's message goes after 12 s, a refusal stays until closed.
- **Short lines** `export-data`, `export-s1p`, `export-project`, `export-link`; `export`'s line now names the data and
  the project. Claims 284, 285 (claims.md).
- **Status note**: "…, sweeps Γ(f) with a plot and figures, prints a report, and saves figures (TikZ, SVG, PNG), CSV,
  Touchstone and project files." (470 characters, was 474: "as you type or drag", "16 worked examples"); More:
  "Every planned feature is in; polish comes next." (47, was 49).

## Checks

- `ui-files.mjs` 65 checks (see modules-harness.md). The files at the page's digits equal the writers' output byte for
  byte, and the .s1p in RI too; with every digit, 77 CSV numbers and 60 (MA) / 131 (DB) .s1p numbers differ from Node's
  in the last bit (Edge's `Math.atan2`/`log10` round differently): compared within 2e-15 relative. The .s1p read back by
  the reference reader: Γ to 2.9e-16 (RI 0). While saving and opening, the only requests are GETs of the site's own
  code chunks (the sweep's worker, started by an opened sweep); nothing with a body, nothing elsewhere.
- `npm run check`: 1,399,628 of 1,399,628. `npm run ui`: 15 of 20 scripts pass in one run. Failing on this machine
  for the old code as well (machine-bound 4× budgets): ui-chart (4× zoom: 9.56 ms per frame), ui-path (4×: 10 frames
  lost with 5 grid rebuilds), ui-drag (4×: 7 frames lost, 17.04 ms per drag frame), ui-trace (4×: the trace drawn in 85
  of 110 drag frames; 74 of 113 with the M8.3a code, stashed). ui-math's A/B failed once in the full run (+0.93 ms) and
  passed alone (+0.07 ms).
- A/B (ui-export, 4× drag, B A B A on one page, the section with the new Data and Project groups built): B 13.89,
  14.32 ms, A 14.37, 13.91 ms per frame, added 0.03 ms. The drop listeners react to drag events that carry files only,
  never to pointer events.

## M8 roll-up (milestones.md M8 "Done when")

| Item | Evidence |
|---|---|
| The LaTeX export's checks pass | check-tikz.mjs in `npm run check`: 47 option sets read back to 5e-7 mm, 58 compiles, MediaBox within 0.002 mm, pixels under 0.4 % (notes-M8.1b.md) |
| The standalone SVG matches the on-screen geometry | ui-export.mjs: grid circles, path arcs and nodes to ≤ 5e-15 of the radius, 3 circuits × 2 zooms (notes-M8.3a.md) |
| PNG at 1×, 2× and 8× has the expected pixel size | ui-export.mjs: IHDR sizes and decoded drawings |
| The `.s1p` is read back by a reference parser to 1e-12 | check-export.mjs (60 circuits × 3 formats, worst 6.9e-16) and ui-files.mjs (the page's file, 2.9e-16) |
| CSVs read back to the shown digits | check-export.mjs (169,127 cells of 40 circuits); ui-files.mjs (the page's files equal the writers') |
| The project file round-trips; a version-0 file migrates | check-export.mjs (200 states, 6 version-0 forms); ui-files.mjs (picker and drop restore the same link, as one undo step; version 0 opened, version 2 refused) |
| The preview's frame is the chosen width in CSS mm at three sizes | ui-export.mjs at 88, 160, 180 mm (0.02 px) |
| Layouts hold at 320 and 390 px | ui-export.mjs, ui-files.mjs (with the message shown), ui-edit.mjs |

## Left out

- A link pasted as text into the page (only files open; a link in a text file works, version 0).
- The .s1p from an evenly spaced band (the file has the refined trace the page shows, as notes-M8.2 allows).
- Opening asks no confirmation: the circuit is one undo step, but the sweep and the value lists it replaces are not in
  the history (as for every change of them).
