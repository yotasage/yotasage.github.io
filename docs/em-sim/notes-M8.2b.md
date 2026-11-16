# EM simulation – notes of step M8.2b (the printable report)

Part of [plan.md](plan.md) (milestones.md M8.2, split into M8.2a and M8.2b). New: `components/EmSim/Report.tsx` (Export
chunk), `styles/EmSimReport.module.css`, `scripts/harness/emsim/ui-report.mjs`. Changed: `exportFeed.ts` (`calc`),
CalcTool (feeds it), ExportSection (renders the group, takes `digits`), EmSimTool (passes `digits`), ViaResults
(`pieceRows` exported), whys.ts and theory-lines.md (three lines), statusText.ts (export complete).

## The group

After Data in the Export section: **Paper** A4 or Letter (default Letter for en-US, en-CA, es-MX, en-PH, else A4),
**Include** (checkboxes: Stackup, Trace, Via always; Field maps, Plots, Calculators enabled once the page has them),
**Print report**: `flushSync` renders the report, then `window.print()`. "Save as PDF" in the dialog gives a file.

## How it prints

The report is built **only while printing**: the button, or the browser's own Print through `beforeprint` (rendered
at once with `flushSync`); `afterprint` drops it. So nothing of it costs while dragging. It is a **portal straight
under `<body>`** (`[data-report]`), with a `<style>`:

- `@page { size: A4|letter portrait; margin: 14mm 15mm 16mm; @bottom-right { "page / pages" } }`
- `@media print { html, body { background: #fff } body > #__next { display: none } }`: the whole app (bar, nav,
  controls, short lines, status note, site footer) goes in one rule.

`.sheet` is `display: none` on screen and shown in print, with **its own light colours** (#1d1c19 on white, accent
#0b6a5f), not the page's theme variables (the portal is outside `.root`), and `print-color-adjust: exact`. Breaks:
`h2`/`h3` `break-after: avoid`, figures (`<figure>` with its caption) and table rows `break-inside: avoid`, `thead` as
a header group. The via's two tables stand one under the other: in a flex row Chromium moved one to the next page.

## Contents

1. Head: title, local date and time, the site, the setup's full link as text, and a short kind line on what the
   numbers are (quasi-static, the solver's error, not the board's tolerances, a careful estimate).
2. **Stackup**: name, finish, board thickness, controlled; a table of every layer (kind and material; thickness, for
   the mask on copper, on laminate and between traces, for copper the calculator thickness and etch; εr at its
   frequency, tan δ, each with its tolerance; the source tags), the sources listed (ref, date, URL), the figure.
3. **Trace**: kind, layers, w, s or offset, ground gap, mask; the cross-section (and its field map when included);
   every quantity with its error by `qText` exactly as the page (one line; a pair with definitions A and B, Z_TDR,
   NEXT, FEXT, each line's Zc_kk, the modes; n > 2 lines and modes), the definition's note, the C, L and Zc matrices,
   the flags, the solve's level, panels and status.
4. **Via**: pitch, barrel, drill, plating, entry and exit, backdrill, returns; side and top figures (and maps); barrel
   and section Z (or Zdiff, Zcm), delay, L, C with the same error formulas as ViaResults; the barrel piece by piece,
   ΔC per pad and plane, stubs, feeds, the model's limit; flags and assumptions (`ASSUME_TEXT`).
5. **Plots**: every fed plot (the via's TDR, TDT, |S|; the last sweep's) by `plotFigure` at 160 mm.
6. **Calculators** (once run for this setup): this tool, as JLCPCB's calculator, JLCPCB's stated number, each closed
   form with its difference, range and accuracy.

Figures: the figure model in colour, inline SVG at their size in mm (drawings 120 mm, plots 160 mm); a figure taller
than 150 mm is made again narrower so it and its caption fit a page. Ids `rpt-<figure>` keep the clip paths apart.

## Checks

`ui-report.mjs` (36 checks; 1181 in `npm run ui`) in `npm run ui`; window.print is stubbed to count calls. **Chromium's `page.pdf()` fires
`beforeprint` and `afterprint`** like a real print, so after a PDF the report is gone until Print is pressed again.
PDF page sizes are read from the MediaBox (Chromium writes A4 as 594.96 × 841.92 pt). With a folder the A4 and Letter
PDFs and the first A4 page as PNG (`pdftoppm` of TeX Live) are saved. `ui-why.mjs` counts 193 lines.

## For later steps

- M7 (full-wave): add its S-parameters and fields as plots (through `feedExport({ via: … })` or a new key) and a
  section with its own error and run settings; the report's head line on "quasi-static" must then name both.
- Left: BL131 (screen preview, the via's inputs in full, unit and digits in the head), BL132 (Ctrl+P before the
  Export chunk has loaded prints the page itself).
