# EM simulation – notes of step M8.1b (the Export section)

Part of [plan.md](plan.md) (D16, milestones.md M8). New: `components/EmSim/ExportSection.tsx` (its own chunk),
`components/EmSim/exportFeed.ts` (first load), `styles/EmSimExport.module.css`, `scripts/harness/emsim/ui-export.mjs`.
Moved: `components/EmSim/viaGeom.ts` → `lib/emsim/viaGeom.ts` (BL124).

## The section

- In the nav after Via; loaded by `import()` when it comes within `LOAD_MARGIN` or the hash is `#export`
  (EmSimTool's `useNearLoad`, the Via section's pattern made a hook). First load 181.0 kB gzip (179.8 before: the
  feed, its hooks in useFieldMap/useViaField/ViaPlots/TraceTools and nine short lines).
- **What it draws** comes from the setup (stackup, `setupSection(setup)` for the cross-section, `setup.via` with the
  trace's width) and from `exportFeed.ts`: the field maps once done (`traceMap` from the Trace drawing only, not the
  theory's channels; `viaSide`, `viaTop`), the Sweep tool's plots of its finished run for the shown setup and the Via
  section's TDR, TDT and |S| (reflection and through in one plot) while not stale. A `-map` figure appears only once its
  map exists; until then a note says to turn on "Show the fields". Nothing is solved by the export.
- Options: width (column 88, text 160, page 180 mm, `\linewidth`, or a typed width read by `readWidth`, 40–2000 mm),
  colours (colour, grey, b&w), format (TikZ, SVG, PNG), PNG scale 1–8×, file name (empty: the figure's name). Lengths
  in the page's unit with 3 digits (`lenText`), εr with `numText(v, 3)`.
- **Preview:** `figureSvg(fig, { id: 'emx' })` inserted as is; the SVG's width and height are in mm, so the browser
  shows it at true size (96/25.4 px per mm); wider than the screen it scrolls inside its box.

## Copy and Save per format

| Format | Copy | Save |
|---|---|---|
| TikZ | the `picture` (its head names any image files) | the `document` as `<name>.tex`; with a map a `<name>.zip` (fflate `zipSync`) with the `.tex` and its PNG files under the names the picture uses |
| SVG | the SVG text | `<name>.svg` |
| PNG | `ClipboardItem` with `image/png` where the browser has it, else the reason | the SVG drawn into a canvas (`Image` from a Blob URL, white under it) at round(mm × scale × 96/25.4) px, `toBlob`; refused past 16384 px a side or 120 Mpx |

Downloads are Blob URLs clicked through a temporary `<a download>` and revoked after 30 s; nothing is uploaded.
Windows' clipboard turns LF into CR LF; the harness compares after normalising.

## The two fixes of the figures (from the look at M8.1a's output)

- **Labels on white boxes:** `board.ts` `knock` puts a `paper` rectangle (0.4 mm + 0.1 em across, 0.25 mm + 0.3 em
  up and down, for descenders and µ) right under each label over the drawing: w, s, h and the via names. `finish` keeps
  the boxes inside the figure. In every colour mode.
- **The mask in b&w** is hatched upright (90°, 0.45 mm, 0.08 mm lines) so the key tells it from the white air; core
  45°, prepreg 135° as before. Greyscale already had its own grey (#8c8c8c against the air's #f2f2f2).
- `check-figure.mjs` checks both (mask unlike air in every mode; every dimension and via label with its box right before
  it); 463 checks in the group. Rendered: `scratchpad/figures/m81b-section-bw-1.png` (session scratch, not the repo).

## Checks

`ui-export.mjs` (56 checks) in `npm run ui`; `ui-why.mjs` counts 182 short lines and opens `#export`.

## For M8.2

- Data exports (CSV of results, sweeps, TDR; Touchstone from the via model) fit the same section as a second group
  below the figures, with the same Copy/Save buttons and `download()`; the sweep's and the via's raw results would go
  into `exportFeed.ts` beside the plot specs (today it holds only `PlotSpec`s).
- The project file (versioned JSON) and the report (print layout) need the setup only, plus the feed for results;
  the report can reuse the figure model's SVG at the page width for its drawings.
- Left: BL125, BL126 (from M8.1a), BL127 (a map for the figure's own crop), BL128 (image names after the file name).
