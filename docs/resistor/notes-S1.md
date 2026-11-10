# Resistor lookup – notes from S1

Step S1 (2026-11-10): the library, the harness, the page shell and the Lookup section. Read with [plan.md](plan.md).

## State

| Where | Name | What |
| --- | --- | --- |
| URL | `q` | The text of the field, as typed |
| URL | `as` | Id of the picked reading (`num`, `digits3`, `eia96`, `bands-rev`, …), only when it is not the first |
| URL | `tol` | Tolerance in percent, only when it differs from the reading's own (or from 5) |
| URL | `e` | Series stepped through (`e3` … `e192`, `e24e96`), only when chosen; otherwise the series usual for the tolerance |
| localStorage | `resistor.theme` | `light` or `dark`, only when it differs from the system |

The URL is read in a layout effect after mount (`ResistorTool.tsx`) and written with `history.replaceState`. New state
goes into both effects there.

## CSS tokens (on `.root` in `styles/Resistor.module.css`)

`--bg`, `--field` (inputs, buttons), `--raise` (hover), `--ink`, `--ink-2`, `--ink-3` (labels), `--ink-4` (ghost),
`--rule`, `--rule-strong`, `--accent`, `--accent-ink`, `--accent-soft`, `--warn`, `--band-edge`, `--font-ui`,
`--font-num`, `--bar-h`, `--page-w`, `--gutter`, `--quick` (120 ms). Dark values are written twice (system dark, and
`data-theme='dark'`): change both. `LIGHT` and `DARK` in `ResistorTool.tsx` repeat five of them for `html, body` and
the site footer. Shared classes: `.num` (monospace numerals), `.unit`, `.label` (small capitals), `.block` and
`.blockHead` (a titled part of a section), `.caption`, `.chip`, `.copy`, `.valueButton`, `.seriesTag`.
Band colours are `colour(name).hex` in `lib/resistor/colours.ts`, the same in both themes.

## Library (`lib/resistor`, import from the index)

- `readInput(text)` → `{ readings, message }`; a `Reading` has `id`, `kind`, `label`, `ohms`, `tolerance`, `tcr`,
  `how`, `note`, `standard`, `bands`. `MIN_OHMS`, `MAX_OHMS` (1 µΩ to 1 TΩ).
- `SERIES`, `series(id)`, `neighbours(ohms, id)` (below, above, nearest, exact), `errorPct(value, target)`,
  `step`, `inSeries`, `seriesContaining`, `commonness`, `usualSeries(tolerance)`, `seriesValues(id, min, max)` (the
  value list for the combination search), `standardValue`, `same`, `shift10`, `decompose`.
- `formatOhms` (`4.7 kΩ`), `ohmsParts` (number and unit apart), `formatRkm` (`4k7`), `formatError`,
  `formatTolerance`, `formatPct`, `pow10Text`.
- `COLOURS`, `colour(name)`, `encodeBands(ohms, 3|4|5|6, tolerance, tcr)` and `decodeBands(colours)` → `BandCode`
  (`bands` with `colour`, `role`, `meaning`; `formula`; `note`) or `{ ok: false, error }`; `coloursFromText`,
  `toleranceColour`, `tcrColour`, `FAILURE_RATE`.
- `encodeMarkings(ohms)` (`three`, `four`, `eia96`, `milli`, with `how` and `why`), `decodeMarking(code)`,
  `flipMarking(code)`, `TOLERANCE_LETTERS`, `toleranceLetter(pct)`.
- `CHIP_SIZES`, `AXIAL_BODIES`, `deratedPower(power, temperature, maxTemperature)`: not on the page yet.

## Harness (`scripts/harness/resistor`, `npm install` there once)

- `npm run check`: the library, 1,331 checks; prints one summary line, exit code 1 on a failure.
- `npm run ui`: drives the page in the installed Edge or Chrome (typing, readings, stepping, link, theme), 23 checks.
- `npm run shots -- <folder outside the repo> [base URL] [name=query …]`: PNGs at 390 and 1440 px, light and dark,
  and a line for every page wider than its window.
- `ui` and `shots` need `npm run dev` (port 3020) running. The files are `.mjs` on purpose: the site's `tsconfig`
  takes in every `.ts`, and CI does not install the harness's packages.

## Decisions

- **Order of readings:** by how common the value is (E24, then E96, then E192, then none); on a tie the number as
  typed comes first. So `100` is 100 Ω with the marking (10 Ω) second, and `101`, `472`, `1001` are markings first.
  Markings of 100 MΩ and more, numbers with a leading zero and upside-down readings come later. Bands: the direction on
  a standard value first, forward on a tie.
- **Tolerance** defaults to 5 %. A code that carries one (bands, `103J`, `4k7 1%`) sets it; the choice can then be
  changed. The arrows step through the series usual for the tolerance until a series is clicked in the table.
- A clicked or stepped value is written into the field as `5.1 kΩ`, which reads one way only.
- **S2:** the drawing goes into `.hero` in `ResistorTool.tsx`, between `SmartInput` and `ValueHero`. The flat band
  strips are `Strip` in `Lookup.tsx`. New sections: an entry in `SECTIONS` and a `<section id>` in `.results`; the
  nav marks the section in view once there are two.
- The site footer is restyled from the page (`#__next > footer`) so it follows the theme. styled-jsx only takes
  values in `${}`, not whole rules.
- With `strict: false`, `code.ok ? … : code.error` does not narrow: compare with `=== false` or cast.
- Before anything is typed the hero shows the placeholder's value (4.7 kΩ) in the placeholder's colour.

## facts.md: found while building

- `4E7` is also 4 × 10⁷ Ω in scientific notation, and `1e3` is also 1.3 Ω: both readings are shown.
- EIA-96's multipliers `R` and `E` collide with ohm letters (`47R` is 47 Ω or 3.01 Ω, `10E` is 10 Ω or 1.24 MΩ),
  not only `F` with the tolerance letter.
- "An underline as a milliohm value" does not say how: it is read as the digits in milliohms (`_010` = 10 mΩ).
  Typed as `_`.
- `06` against `90` are two-digit codes without a multiplier, which nothing else in facts.md defines: `flipMarking`
  turns them, but the page reads `06` as 6 Ω.
- 4.7 kΩ and other E24 values are also in E192 (4.70), while missing from E48 and E96.
- Values under 10 mΩ need a leading zero in bands (5 mΩ = black green pink): shown, with the note on pink.
