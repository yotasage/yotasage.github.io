# Smith chart – notes of step M2.1a (grid geometry)

Part of [plan.md](plan.md). Nothing on the site yet. M2.1 was split: M2.1a is `lib/smith/grid.ts` and its harness
(`scripts/harness/smith/check-grid.mjs`, called from `check.mjs`); M2.1b maps it to the SVG grid layer on a bare route.

## API for M2.1b

- `densityLevel(k, prev?)`: level ⌊4·log2 k⌋ (k = px per unit Γ), kept while k stays within 1.06× of the level's
  range (pass the previous level). `levelK(level)`: the k a level is built at (the smallest k it is shown at);
  `K_SPAN` = 1.34: the largest k it is shown at over `levelK`.
- `gridFor(view, k, prev, options)`: returns `prev` while the level is the same and the view is inside `prev.covers`,
  else `buildGrid(view, level, options)`. The view is `{x0, y0, x1, y1}` in Γ, y up, any aspect ratio. The grid
  covers the view grown by `pad` (0.25 of its size) on each side, so small pans reuse it.
- Options (`GRID_DEFAULTS`): `mode` (`MODE_Z` 1, `MODE_Y` 2, `MODE_ZY` 3), `minPx` 8, `fontPx` 11, `labelGapPx` 6,
  `tickMinPx` 6, `scales` true, `pad` 0.25.
- `Grid`: `count` arcs in `arcs` (geometry.ts's `ARC_STRIDE` layout: S, E, M, centre, R, sweep, turns), `flags`
  (`arcFlags`: bit 1 large-arc, bit 0 sweep; the y flip is already in it), `family` (`FAM_R`, `FAM_X`, `FAM_G`,
  `FAM_B`, `FAM_RIM` full circle, `FAM_AXIS` straight segment with R = ∞, `FAM_RING` the wavelength ring),
  `cls` (`CLS_AXIS`, `CLS_MAJOR` = labelled, `CLS_MINOR`, `CLS_SCALE`), `value`, `ends` (2 per arc: x at S and E for
  an r line, r for an x line; the same for g and b). Full circles: `ARC_TURNS` = 1 and S = E (two half `A` commands).
- `labels: GridLabel[]`: centre `x, y` (Γ), `rotate` (degrees, SVG sense, in [−90, 90)), `w × h` px at `grid.k`,
  `text` (real minus), `kind` (`LBL_R`, `LBL_X`, `LBL_G`, `LBL_B`, `LBL_ANGLE`, `LBL_WTG`, `LBL_WTL`), `value`,
  `arc`. Draw with `text-anchor="middle"` and `dominant-baseline="central"`, `transform="rotate(rotate)"` about the
  centre. Text keeps its size in px if M2.1b counter-scales it; if it scales with the zoom transform the boxes grow
  with the distances, so they still do not overlap.
- Ticks: `tickCount`, `ticks` (x1, y1 at the inner end, x2, y2; Γ), `tickScale` (`SCALE_ANGLE`, `SCALE_WAVE`),
  `tickMajor`, `tickValue`. `scaleLayout(fontPx)` gives the ring offsets in px outside the rim; `grid.outerPx` (57 px
  at 11 px font) is the margin the chart needs around the rim for the scales.
- Offsets in px are turned into Γ with `grid.k`.

## The density rule

Lines are edges of square cells of a nested 1-5-10 ladder of steps Δ in the z (or y) plane. A cell is fine when the
on-screen distance between its opposite edges is ≥ `minPx` everywhere in the cell: by
|Γ(z1) − Γ(z2)| = 2|z1 − z2|/(|1+z1||1+z2|), its minimum is 2Δk/(|1+a+Δ+j(b+Δ)|·max(|1+a+j(b+Δ)|, |1+a+Δ+jb|)).
Fine cells form a staircase per level. A line is drawn where the cell on its outer side, one row (column) further
out, is fine too; it keeps the largest extent over the steps that divide its value. This gives, by construction:

- neighbouring lines of a family are ≥ `minPx` apart at `levelK` (so at any k the level is shown at);
- every line ends on a drawn line of the other family, at the rim, or outside the window;
- the drawn set depends only on the level, so panning never changes a line, and zooming changes it in steps of 2^¼
  with a hysteresis that keeps it fixed under 1.05× to and fro (measured: 0 flips in 3,000 trials).

The simpler rule (edges of all fine cells) let a last fine line come 17 % closer than `minPx` to a coarser line; the
outer-cell rule costs some lines near Γ = 1: at the whole chart lines reach r = 5 and x = ±5.

Measured band (harness, 6 centres × 5 zooms × 3 aspect ratios × 3 modes and 300 random views): neighbouring lines
1.00–6.73 × `minPx` apart at `levelK`, i.e. 8–56 px, at most 75 px at any k a level is shown; the last lines stop at
most 10 × `minPx` (80 px) from Γ = 1, where every circle meets, at any zoom.

Only lines that meet the covered window are listed: the r and x range of the window ∩ disc is exact (r and x are
harmonic, so their extremes lie on its boundary: clipped edges, their critical points, rim arcs), each level lists
only values that can reach it (bounds from |1 + z| ≥ 2/max|1 − Γ| over the window), and each arc is tested against
the window (an end inside, or a crossing of an edge within its sweep).

## Labels

Box size estimate: width = characters × 0.6 em + 2 px, height = 1 em (`textWidth`). r (g) labels along the real
axis, turned −90° (reading upwards), just above (g: below) the axis and right (g: left) of their line's crossing; x
(b) labels inside the rim, along it, beside their line on the side towards Γ = −1 (b: turned by π). Placed greedily:
the scales first (laid out by their steps), then the lines by roundness (largest of the 1-2-5 steps dividing the
value), then closeness to 1; x and b labels go in ± pairs. Whole chart (460 px): r 0.1, 0.2, 0.3, 0.5, 0.8, 1, 1.5,
2, 3, 5 and x ±0.2 … ±5.

Scales: angle of Γ (ticks ≥ `tickMinPx` apart, labels at steps that divide 90°, 15° at the whole chart);
wavelengths towards the generator (θ = π − 4πd/λ, 0 at Γ = −1, clockwise) and towards the load (θ = π + 4πd/λ) on one
ring of ticks with two label rows, label steps that divide 0.25 λ (0.025 λ at the whole chart).

## Timing (Node, median of 40 builds)

Whole chart Z 0.16 ms, ZY 0.25 ms, ZY 1000×400 0.45 ms; 256× at the centre 0.16 ms, near Γ = 1 0.42 ms, near the rim
0.09 ms (target 2 ms).

## For M2.1b

- Build the grid layer from `gridFor` on zoom changes only (engine.md §9); one `path` per class is enough (the arcs
  of one class concatenated as `M … A …`), with `vector-effect: non-scaling-stroke`.
- Flip y at the drawing boundary only (the arcs' flags already include it).
- Leave `grid.outerPx` of margin around the rim when fitting the chart, plus label room.
