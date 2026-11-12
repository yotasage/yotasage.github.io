# Smith chart – notes of step M2.3 (route and design pass)

Part of [plan.md](plan.md). Completes M2. `/smith-chart/main` is in the site's frame; still no card (M3.4).

## Tokens (`styles/Smith.module.css`, on `.root`)

| token | light | dark |
| --- | --- | --- |
| `--bg` page | `#f6f4ee` | `#2b2b2b` (the site's dark) |
| `--field` panels, chart (`--chart-bg`) | `#fffefb` | `#313130` |
| `--raise` hover | `#ece9e0` | `#3a3a38` |
| `--ink` / `--ink-2` / `--ink-3` | `#1d1c19` / `#55524b` / `#736f67` | `#edebe5` / `#bdbab1` / `#9a978e` |
| `--rule` / `--rule-strong` | `#e3dfd5` / `#cbc6ba` | `#3d3d3a` / `#54544f` |
| `--accent` (Y grid, read marker, focus) | `#0b6a5f` | `#72d1c0` |
| `--warn` (readout note) | `#8a4b08` | `#f0b26b` |
| grid Z major / minor | ink at 0.44 / 0.14 | ink at 0.42 / 0.13 |
| grid Y major / minor | accent at 0.55 / 0.18 | accent at 0.52 / 0.17 |
| `--part-1…8` (M3) | `#1971c2` `#d9480f` `#c2255c` `#2b8a3e` `#7048e8` `#9c7a00` `#0c8599` `#c92a2a` | `#74c0fc` `#ffa94d` `#f783ac` `#8ce99a` `#b197fc` `#ffd43b` `#66d9e8` `#ff8787` |

Part colours: blue, orange, raspberry, green, violet, ochre, cyan, red, in the order parts take them (neighbours
differ most). Cyan (7) is near the Y grid's teal: M3 should draw arcs at 2 px over the 1 px grid. Outside `.root`
(page and the footer of `_app.tsx`) the page sets the same `--bg` and rules with styled-jsx, as the resistor tool.

Type: system UI 15 px body, 15 px/650 title, 14 px controls and readout labels, 13 px panel title (650), 12–12.5 px
hints; numbers in `--font-num` with `tabular-nums` (readout 13.5 px, zoom 13 px, grid labels 11 px). Spacing: bar
52 px, gutter 32 px (16 px under 600 px), 28 px between chart and side, 10 px radius on the chart, 7 px on controls.

## Layout rules

- Bar: home, title, theme switch (`smith.theme` in `localStorage`, read after mount; back on the system's theme the
  key is removed). Sticky.
- `Chart` is the workspace: `.stage` (toolbar: grid switch left, zoom, Fit, Reset right; the chart box; the gesture
  hint, touch wording under `pointer: coarse`) and `.side` (`side` prop, then the readout panel).
- ≥ 960 px: two columns, side 340 px, sticky under the bar; chart height `clamp(440px, 100vh − bar − 112px, 1240px)`
  (788 px at 1440 × 900, a 650 px chart). 600–959 px: one column, chart about square, readout below in two columns.
  < 600 px: the chart runs edge to edge (`100vw + 24px` high), readout below in one column.

## Region boundaries (`grid.ts`, option `blocks` = 4)

A step's fine region is cut back to whole blocks of the next step (5 × 5 cells from 1·10ⁿ, 2 × 2 from 5·10ⁿ): block
(a, b) is kept when the r line and the x line at its far edge are fine across it by the cell rule, intersected over
rows and columns (bisection; `colTop`, `rowEnd`). Lines inside a block end together on a circle of the next step, the
line between two columns takes the larger extent. Only where the region reaches ≥ 4 blocks along both axes: shallow
regions (the coarse steps of a level, the last cells near Γ = 1) keep the cell rule, because whole blocks would empty
them (tried: always blocks loses r = 2…5 at 1× and widens gaps to 11.6 × minPx; 2–3 blocks: 10.2×). Harness: the
stairs metric (three equally spaced lines whose ends step down at each line, off Γ = ±1) falls from 335 to 122 over
the views; minimum spacing still ≥ minPx; widest gap 8.25 × minPx (band raised 7 → 9); hole near Γ = 1 unchanged.

## Labels in the field (BL48, options `inner`, `repeatPx` 280)

`GridLayer` turns them on from 1.5 × the fit zoom (`INNER_ZOOM`). A line gets them when its roundness is ≥ 2 × the
spacing to its neighbouring drawn value; candidates at fixed angles about the circle's centre from its rim point,
every 140 px of arc at the level's k (stable under pan), placed roundest first, inside the disc, ≥ 280 px from the
line's other labels, gap 12 px. Drawn centred on the line, turned along it, with a 4 px halo in `--chart-bg`.
Boxes now go through a 48 px hash (`fits`), so a 1440 × 900 view with inner labels builds in 0.9–1.4 ms.

## Readout

`formatAmount(v, unit, digits, keepZeros)`: every number keeps its 4 significant digits ("1.797 + j1.350",
"89.83 Ω + j67.50 Ω", "1.300", "17.70 dB"); exact 0 is "0".

## Checks

`npm run check` 837,853; `npm run ui`: grid 20,719 (with the theme switch and field labels), chart 309. Zooming at
4× CPU: 5.2 ms main thread per frame (was 3.8: inner labels on rebuilds), no dropped frames.

## For M3

- Wide: the circuit strip and part cards go in `side` (above the readout, sticky column); phones and tablets: below
  the chart, before the readout. The strip should stay in view with the chart at 1440 × 900.
- Arcs take `--part-n` by part index; handles in the accent's halo style (`--chart-bg` outline).
- `shots.mjs <folder> [zoom] [Γr,Γi] [widths]` takes the six screenshots (dev server on 3020).
- In headless Edge `pointer: coarse` is not emulated, so phone screenshots show the mouse hint.
