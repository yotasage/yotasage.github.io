# Resistor lookup – notes from S4b (the Design section)

Step S4b (2026-11-11): what the visitor sees of the engine of [S4a](notes-S4a.md).

## State added

One `Design` (`components/Resistor/design.ts`), held by `ResistorTool.tsx`. A parameter is written only when it
differs from what the page starts with.

| URL | What |
| --- | --- |
| `dc` | Circuit: `i` (resistor for a current, the start), `v`, `div`, `fb`, `ni`, `inv`, `sh` |
| `dt`, `dv`, `da`, `dd`, `dl`, `df` | Target, voltage (supply, input, reference or signal), current, series drop, load, pin current, as typed |
| `dp` | Allowed deviation, ± percent (5) |
| `dk`, `dtol`, `dtcr` | Technology (`thick-film`), and tolerance and TCR when they are not its usual ones |
| `dtemp` | Temperatures, `-40_25_85_125` |
| `dm`, `dts` | `t`: parts track; their spread in ppm/K |
| `ds`, `dr` | Series (else the usual one for the tolerance) and range (`100R-1M`; else 1 Ω to 10 MΩ, a shunt 1 mΩ to 1 Ω) |
| `dvl`, `dvn` | An own list in use: its values and its name (lists over 300 values do not travel) |
| `dn` / `dg` | Resistors in one resistance (1 to 3, start 2) / `2`: up to two values in each of two resistances |
| `dtr`, `dcr` | Limits of R1 + R2 (`1k-1M` at the start) and of the current (`10u-2m`, an end may be empty) |
| `dz` | Chip size for the power check (`0603`) |

## Decisions

- **Fields are texts**, read by `readAmount` (`10m`, `10 mA`, `3,3`, `4k7`, `3V3`, `−10`; `3.` is 3 while typing) and,
  for ohms, by `readValue`. `parseDesign` gives the engine's circuit, target and parts and the error of each field; a
  field in error is marked and nothing is suggested.
- **The request** goes to `startSuggest` (`designClient.ts`): a second instance of `combine.worker.ts`, so the
  combination search and the suggestions do not stop each other. `suggestParts` is one call; a newer request replaces
  one that waits, and an overtaken answer is dropped. The results stay on the page, dimmed, with the request they were
  found for (`Shown`), so an opened suggestion is always analysed with its own options. `keep` is 20 for each number of
  parts; 6 rows are shown, "Show more" adds 10.
- **Two values in each resistance** are offered up to `PAIR_LEG_LIMIT` (900) values, which is E24∪E96 over seven
  decades; above it (E192) the page says why and searches single values.
- **The answer** (`answerText`) is the first suggestion when it passes, else what `needed` says; "Use ±0.25 %, 25 ppm/K
  parts" sets the two fields, the technology whose usual range has them (`technologyFor`) and pins the series, so the
  suggestion named still exists. Errors within 1e-9 % are shown as 0 % (`errorText`).
- **The range chart** is positioned HTML, not SVG: one row for each temperature on a common scale in percent of the
  target (a round half-width just above the widest span), with the allowed band, the worst-case box (dashed and
  labelled "outside" when it leaves the band), the RSS bar and the nominal tick. At phone width the numbers go under it.
- **Power**: a row says "too much power for a 0603" when a part is not carried at the hottest temperature; the opened
  suggestion has the figures and names the chip size that carries it.
- **Value lists** are read by the Combinations section and passed on (`onLists`); the Design section keeps a copy of
  the list in use and follows its text while the list is kept in this browser.
- The status line (`data-testid="design-status"`) carries `data-place` and `data-busy`, as in S3b.

## Harness

`npm run ui` ends with `ui-design.mjs` (42 checks against `suggestParts`); `npm run check` has 32 more (`amounts`).
`node shots-design.mjs <folder>` writes six pictures cropped to the section.

## Left out

- A tolerance on the circuit's own quantities, the opened suggestion in the link, saving the schematic (BL35).
- Limits on R1 and R2 alone, and "connections" and "each value once" for a design (the engine has them).
