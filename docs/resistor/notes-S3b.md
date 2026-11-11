# Resistor lookup – notes from S3b (the Combinations section)

Step S3b (2026-11-11): what the visitor sees of the search of [S3a](notes-S3a.md).

## State added

One `Combo` (`components/Resistor/combo.ts`: `comboFromParams`, `comboToParams`), held by `ResistorTool.tsx` and
changed with `onCombo(patch)`. A parameter is written only when it differs from the default.

| Where | Name | What |
| --- | --- | --- |
| URL | `cs` | Series searched (`e24`, `e24e96`, …); otherwise the series usual for the tolerance |
| URL | `cr` | Range of the series, `10R-1M`; otherwise 1 Ω to 10 MΩ |
| URL | `cl`, `cln` | The list in use: its values in the letter notation joined by `_` (`1k_4k7_10k`), and its name |
| URL | `cid` | Id of the list in storage, only when it has more than `LINK_LIST_MAX` (300) values |
| URL | `cn` | Largest number of resistors, 1 to 4; otherwise 2 |
| URL | `cc` | `s` series only, `p` parallel only |
| URL | `cu` | `1`: each value at most once |
| URL | `cf` | Show only the networks of this many resistors |
| URL | `cv`, `ci` | Voltage across or current through the network, as typed (`12`, `20m`) |
| localStorage | `resistor.lists` | `{ "v": 1, "lists": [{ "id", "name", "text" }] }`: the text as written, at most 40 lists |

## Decisions

- **A list in a link** is a copy of its values. On load it is matched to a kept list with the same name and values;
  otherwise it is shown as "from the link, not kept here" with **Keep**. A list too long for a link travels as `cid`
  only: in another browser the page says so and searches the series.
- **Decimal comma** (`parseValueList`): a comma beside a space or after a letter separates (`10k,22k`, `10k, 22k`). A
  comma between digits is a decimal comma when spaces, lines or semicolons separate the entries (`4,7k 10k`); three
  numbers with commas (`10,22,47`) are three values; with commas alone, a pair of numbers is read as the more usual of
  the two by E-series membership (`4,7k` is 4.7 kΩ, `100,1k,10k` three values, `10,22` two). The chips show each entry
  as read, so a misreading is visible; a chip's × takes the entry out of the text (`withoutEntry`).
- **Presets** are E6, E12, E24 and E96 from 10 Ω to 1 MΩ, written as text with a decade on a line.
- **The search** starts in an effect on every change of the target, the values or the options (`startSearch` stops the
  one before), not before the lists were read from storage. `keep` is 50; 8 results are shown, "Show more" adds 14.
  The CSV has every result of the list shown (all, or one number of parts), not only the visible ones.
- **The status line** (`data-testid="search-status"`) carries `data-place` (`worker` or `page`) and `data-busy` for the
  harness. Checked in Edge: the worker on the dev server and in a production build (`next start`), and the search on
  the page when `Worker` is missing. Not checked from a static export served as files.
- **Worst case** equals the part tolerance for equal parts, so the caption says so; the range in ohms is in the opened
  result. **Chip size** is the smallest of `CHIP_SIZES` whose typical power carries the part's watts, without margin.
- **Out of reach** (`listReach`): outside the smallest and largest value the options allow, the page says that the
  results are only the closest.
- `Circuit.tsx` draws with 46 × 30 px per layout unit in the text colours. The section's styles are a module of their
  own, as `Resistor.module.css` is at 40 kB.

## Harness

`npm run ui` runs with `tsx` and ends with `ui-combos.mjs` (27 checks against `searchCombinations`), one summary line.
`npm run check` has 24 more checks: the comma rule, the link form, storage, presets.

## Left out

- The opened result is not in the link. No export of the circuit drawing (SVG, TikZ).
- Per-part tolerances, and quantities in stock for a list.
