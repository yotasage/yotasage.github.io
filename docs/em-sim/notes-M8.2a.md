# EM simulation – notes of step M8.2a (data, project file, Copy link)

Part of [plan.md](plan.md) (milestones.md M8.2, split into M8.2a and M8.2b). New: `lib/emsim/export/csv.ts`,
`lib/emsim/export/touchstone.ts`, `components/EmSim/DataExport.tsx` (Export chunk), `scripts/harness/emsim/check-data.mjs`,
`scripts/harness/emsim/ui-data.mjs`. Changed: `exportFeed.ts` (raw results, types only), TraceSection, TraceTools,
ViaPlots (feed them), EmSimTool (open and drop), ExportSection (renders the group; `download` moved to DataExport).

## The Data group

Below the figures in the Export section. **Data**: only the sets that exist now: the trace's line results (the full
solve of the shown setup, not while stale, quick or dragging), the Sweep tool's finished run for the shown setup, and
while the via's result is not stale its model results, TDR and TDT, and S-parameters. **File**: CSV, or Touchstone for
the S-parameters only (disabled with the reason as its title otherwise). **Numbers** (Touchstone): RI, MA, DB. Copy puts
the text on the clipboard, Save downloads it (Blob URL, as the figures). Nothing is solved by the export.

## CSV

`#` comment lines first: `EM simulation, <site>`, what the file holds, `Date: <ISO>`, `Setup: <full link>`, `Units: …`
(then solver status, flags, port names, the model's limit as they apply). One header row, then rows; `,` separated,
`.` decimals, CRLF, ASCII (Ω → Ohm, ε → e). Numbers are `String(v)`: the shortest digits that read back to the same
double, so a parsed file equals the engine exactly (checked). ∞ "inf", NaN empty. Lengths in mm, the rest SI.

| Set | File | Columns |
|---|---|---|
| Trace | `trace-results.csv` | key, quantity, value, error, unit, status: z0/eeff/delay (per line for n > 1), the pair's zdiff … kf, modes, `zcij`, the matrices `Cij`, `C0_ij`, `Lij` with errors (F/m, H/m) |
| Sweep | `sweep-<input>.csv` | `<input> (mm\|1)`, per output `key (unit)` and `key error (unit)`, note (a failed point's reason) |
| Via | `via-results.csv` | tables after `# <name>`: Summary (quantity, value, unit), Segments of the barrel, Pad and plane crossings (ΔC and error), Stubs, Feeds |
| TDR | `via-tdr.csv` | t (s), Z (Zdiff), Z error (the record's bound), rho, TDT; a pair's Zcm, its error, rho, TDT common beside |
| S | `via-s-params.csv` | f (Hz), valid (0 above `valid.fMax`), per entry `\|Sij\| (dB)`, phase (deg), re, im, row-major; a pair's 16 single-ended then 16 mixed-mode (Sdd11 … Scc22) |

## Touchstone

1.1 (`.s2p` one via, `.s4p` a pair), `! ` comments (tool, model, date, setup link, `Port k: <name>`, the model's limit,
the data layout), `# GHZ S RI R <z0>` (MA, DB). Ports single-ended in the N-port's order: one via 1 entry, 2 exit; a
pair 1 A entry, 2 B entry, 3 A exit, 4 B exit (S31 is A's through path). A 2-port line is `f S11 S21 S12 S22` (1.1's own
order); a 4-port writes its matrix one row per line. **Every computed frequency is written** (DC up), with the limit
in a comment, so a time-domain tool gets the band it needs; the CSV's "valid" column marks the same limit. Mixed-mode
and unequal references are refused (`touchstoneRefusal`, BL129 for 2.0). `readTouchstone` reads 1.x back.

## The project file

**Save project**: `projectJson(setup, today, jlcResolve)` as `em-sim.emsim.json` (format "yotasage-emsim", version 1).
**Open project…**: a hidden file input; **a drop anywhere on the page**: EmSimTool's window `dragover`/`drop`, skipped
when the stackup's KiCad zone took it (`defaultPrevented`). Both call `openText(text, name, dropped)`: `openProject`
with the resolver; a JLCPCB list key loads the list first and reads again (as the link); the setup goes through
`commit` (one undo step); the note (`data-project-note`, `data-ok`) says opened (with issues) or why not (too large,
not JSON, not this tool's, newer version), and nothing changes when refused. A refused or noted drop scrolls to the
note. **Copy link** copies `window.location.href` (the header's Copy link stays). First load 182.5 kB gzip (181.0).

## Checks

`check-data.mjs` (49) in `npm run check` (19 861 in all); `ui-data.mjs` (41) in `npm run ui`; `ui-why.mjs` counts 190
lines. Edge's and Node's `Math.log10`/`atan2` can differ in the last digit, so ui-data compares dB and phase to 1e-12
and everything else byte for byte.

## For M8.2b (the report)

- The report needs the setup and the same feed: `trace`, `sweepRun`, `viaRun` hold every number with its error; the
  figure model gives the drawings (`figureSvg` at the page width). `quantityOf`/`unitOfKey` name the trace's keys.
- Put it in the Export section after Data (or a Print button there), loaded with the export chunk.
- Left: BL129 (Touchstone 2.0, CSV options), BL130 (settings in the project file).
