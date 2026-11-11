# Smith chart – notes of step M2.1b (grid layer and a bare route)

Part of [plan.md](plan.md). `/smith-chart/main` exists but has no card on the main page (that is M3.4).

## Files

- `components/Smith/gridSvg.ts`: `GridLayer`, framework-free. `new GridLayer(svg)` puts one `<g>` into the `<svg>`
  with six `path`s (`data-part`: `axis` = rim and real axis, `z-major`, `z-minor`, `y-major`, `y-minor`, `scale` =
  wavelength ring and ticks) and a `<g>` of `text` labels (`data-kind`: `z`, `y`, `scale`). `update(cx, cy, k, w, h,
  mode)` shows Γ = (cx, cy) at the box centre at k px per unit Γ; returns whether it rebuilt. `fitK(w, h)` is the k of
  the whole chart with `SCALE_ROOM_PX` (57 px at 11 px font) for the scales and 6 px of margin.
- `components/Smith/Grid.tsx`: `<Grid cx cy k width height mode onLayer?>`, the `<svg>` (class `.grid`) filled by the
  layer in a layout effect; `onLayer` hands the layer out so M2.2's frame loop can call `update` without React.
- `pages/smith-chart/main.tsx`: bare page; Z/Y/ZY radios, a zoom range (log2 0 to 10 in quarters) and five centres
  (0, 0.5 + j0.3, near the short, near the open, at the rim). The chart box measures itself with a `ResizeObserver`.
  Static only: no `getStaticProps` yet (M3 adds `references.bib`).
- `styles/Smith.module.css`: theme variables after the resistor tool (light; dark by system or `data-theme`; dark
  `--bg` is `#2b2b2b`, the site's dark background), `--grid-*` for the lines; Z lines in ink, Y lines in the accent.
- `scripts/harness/smith/ui-grid.mjs` (`npm run ui [shots folder]`): reuses a dev server on 3020 or starts one and
  stops it (and removes an `AGENTS.md` that `next dev` wrote).

## How the layer is built

- User units are px at the grid's own k (`grid.k` = `levelK(level)`), origin at the centre of the window the grid was
  built for (`ox`, `oy`), y down. Γ = (x / kq + ox, oy − y / kq). The view is then one
  `matrix(s 0 0 s tx ty)` on the `<g>` with s = k / kq (1 to `K_SPAN` = 1.34 within a level): tx = w/2 + (ox − cx)·k,
  ty = h/2 − (oy − cy)·k. Coordinates near the window stay small at any zoom (float32 rendering).
- One `d` string per part, concatenated `M … A …`; full circles (rim, ring) as two half `A`s; the axis as `L`. An arc
  whose sagitta at kq is under 0.02 px is written as `L`: Blink computes an `A`'s centre in single precision, which
  puts arcs of radius ~10⁸ px (x = 10⁻⁴ near the short at 256×) off their ends.
- Numbers are written at full precision (the harness reads them back to 1e-9 in Γ).
- Labels are `text` with `x`, `y`, `rotate(r x y)`; `text-anchor`, `dominant-baseline`, font (`--font-num`, 11 px)
  come from CSS. They scale with the transform (up to 1.34× before the next level); boxes grow with the distances,
  so they still do not overlap.
- Rebuilt only when `gridFor` returns a new grid (new level, window outside `covers`, new mode); otherwise one
  `setAttribute`. The DOM is written imperatively (path strings + a `DocumentFragment` of texts). A React version
  was not built to compare: the imperative write is 0.3 ms median, below anything reconciliation could give.
- The `<svg>` has `will-change: transform`, `vector-effect: non-scaling-stroke` on every path.
- `data-level`, `data-kq`, `data-ox`, `data-oy`, `data-builds`, `data-build-ms`, `data-dom-ms` on the `<svg>` are for
  the harness.

## Fix in the engine

`arcFlags` (geometry.ts) had the sweep bit backwards: a model sweep that is anticlockwise (y up) looks anticlockwise
on screen too, which is SVG's sweep-flag 0. Both engine harnesses checked the same wrong rule; they now check
`sweep < 0 → 1`. Every `A` drawn with the old flags took the other side of its chord.

## Checks (`npm run ui`: 20,214 checks)

- Geometry from the DOM: 7,827 subpaths parsed from `d`, mapped to Γ; each `A`'s centre and midpoint by the SVG
  endpoint-to-centre conversion; centre on an r, x (Z parts) or g, b (Y parts) family centre for its radius, S, E and
  the midpoint on that circle within 1e-9 (1e-9·R for the midpoint), the midpoint inside the disc; each `L` with both
  ends at one Re or Im of z (or y). At 1×, 16× and 256×, five centres when zoomed, Z, Y and ZY.
- Labels: oriented boxes from `getBBox` through `getCTM`, separating-axis test, none overlap by more than 0.5 px at
  1×, 2×, 8×, 64×, 256× × three centres × three modes (4,708 labels) and at 320 px; each real width within the grid's
  estimate (0.6 em per character + 2 px).
- D13: five Γ points and the rim's screen box stay put through Z → Y → ZY → Z at 1× and 8×.
- Themes: dark body `#2b2b2b`, line and label colours differ between themes; no horizontal scroll at 320 px.

## Timings (Edge, 1280 × 900, 41 zoom steps up and down at 0.5 + j0.3 in ZY, 60 rebuilds)

Grid data median 0.30 ms (max 1.4), DOM median 0.30 ms (max 1.3), both median 0.5 ms (max 2.6). A zoom step within a
level: one `setAttribute`.

## For M2.2

- Drive `GridLayer.update` from the rAF loop through `onLayer`; keep React out of zoom frames. Set the same matrix on
  the moving layer (its own `<svg>`, same user units: take `ox`, `oy`, `kq` from the grid layer, or give it Γ units).
- During a pinch k can leave the level's band; `gridFor` rebuilds then (≤ 2.6 ms). If that ever shows in frames,
  rebuild after the gesture pauses (as the PCB viewer does) and let the transform stretch meanwhile.
- `fitK` gives the whole-chart k; fit and reset should use it.

## For M2.3

- Labels only exist on the real axis and the rim: zoomed into the field there are none (BL48).
- On a phone the chart box is taller than wide; the whole chart at 390 px has k ≈ 132, so only the coarse levels show.
- Colours, stroke widths and the bare controls are a first pass; the `.chart` height is
  `clamp(300px, min(80vh, 100vw + 120px), 920px)`.
