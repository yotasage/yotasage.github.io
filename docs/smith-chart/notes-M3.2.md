# Smith chart – notes of step M3.2 (path)

Part of [plan.md](plan.md). The chart draws the circuit's path; still no card (M3.4) and no dragging (M3.3).

## Files

- `components/Smith/pathLayer.ts`: `PathLayer`, framework-free; the page makes it in `Chart`'s `onView` and puts it on
  the box as `smithPath` (harness). `components/Smith/Nodes.tsx`: the node table. `ChartView` gained `onHover(px, py)`
  (NaN on leave) and `onTap(px, py)` (after the read point is placed). `partColour` moved to pathLayer.ts (Strip
  re-exports it).

## How the path is built and updated

- `setCircuit(c)` (page effect on every `commit`): `evaluate` at f0 into kept buffers, `partArcs`, Γ of every node;
  rebuilds elements only when the part count changes; `request(DIRTY_CONTENT)`. Nothing is written outside a frame.
- Frame hook (chained after Chart's `onFrame`, only on `DIRTY_VIEW | DIRTY_CONTENT`): arcs are rewritten when the
  circuit changed or `frameId` moved (reframe), else the world `matrix` alone moves them. Then the marks are placed.
- `world` (`<g data-layer=path>`): goal ring (|Γ| = 0.2, dashed up to 600 px radius, solid beyond: dashes cost per
  dash off screen), the halo (the selected arc's `d`, 12 px at 0.24), the arcs (`data-arc=i`, `--part-n`, 2.5 px,
  non-scaling). `arcPath`: full numbers (Γ back to 1e-16); `A` pieces of at most 0.6π (a half-circle `A` has its
  centre only to √ε·r, which put midpoints 6e-9 off), full turns as three 120° pieces clockwise; a chord when the
  sagitta is < 0.02 px or R = ∞; above 1e5 px radius a polyline of exact circle points within ¼ px (SVG engines place
  big `A` centres in single precision), ≤ 4096 points, only at deep zoom.
- Marks (`<div data-layer=path-marks>` in the box, after the `<svg>`s, `contain: strict`, no pointer events): goal mark,
  dashed goal line from the input (clipped to the box, shown from 16 px), arrows (`data-arrow=i`, 14 px, at the arc's
  midpoint or, when that is off the view, at the arc's point nearest the view centre; hidden under 28 px of arc) and
  markers (`data-node=k`, 18 px: L, 1…n−1, In filled). HTML moved by `style.transform`: moving SVG elements cost SVG
  layout plus a repaint of the whole top layer per frame. `will-change` per mark measured no better (more layers).
  Hidden marks use `hidden`; `transform` is then not written.

## Selection model

- Page state: `partSel` (the strip's, −1 = last part) and `nodeSel` (−1 none). A node selection takes the highlight;
  picking a part clears it. `select(kind, index)` with `SEL_PART | SEL_NODE | SEL_NONE`.
- Hot (hover): the chart's own hover (`pick` on `onHover`, `data-pick` on the box gives the pointer cursor) beats the
  list's (`hover()` from tile and row mouseenter/focus). Attributes `data-sel` / `data-hot` on arc, arrow and marker.
- Picking is geometric (`pickCode`): markers within 13 px first (input first), then arcs within 10 px (`arcDistance`,
  angle range test). A tap or click on an arc selects the part (strip card follows), on a marker the node (table row).
- Table rows are buttons (Tab, Enter, Space; focus = hover); strip tiles as M3.1 (arrows move the highlight).

## Goal

engine.md §8's default until M4.3's selector: the match, close enough at VSWR ≤ 1.5 (`GOAL_VSWR`, `GOAL_MAG` 0.2).
Not in the link yet (M4 adds `goal=`). The table's last line gives the input's |Γ − 0| and inside/outside.

## Checks (`npm run ui`: grid 20,719, chart 309, strip 347, path 1,117)

`ui-path.mjs`: start circuit at 1×, 6× and 300× (reframes) and 20 random circuits (every kind, a 0.8 λ line = 1.6
turns, open, short and R = 0 loads, R/L/C of 0 and ∞, stubs of 0 and λ/4, λ/2 line), each read from the link: every
`d` parsed and mapped through (fx, fy, fk): ends on network.ts's nodes ≤ 1e-9, every `A` piece's midpoint (SVG F.6.5
from the endpoints and flags) and polyline vertex on the locus (`partLocus`; λ/4 on its line of Zt) ≤ 1e-9; lumped
and stubs: the added r/x/g/b at the drawn midpoint between 0 and the part's (b = ±∞ of a stub as +∞); lines: every
piece clockwise, ⌊drawn turns⌋ = whole turns, the rest clockwise in the line's own chart; arrows on the locus and along
Γ(value + δ) − Γ(value) (cos > 0.999; to 0.01 px: CSS keeps ~6 digits); markers on nodes; table = network.ts figures
in the readout's texts; goal distance. Selection: tile, row (toggle), click on arc and marker, hover on chart, row and
tile, Enter / Shift+Tab / Space, strip arrows, CDP tap at 320 and 390 px; no horizontal scroll (table open and closed).

## Timings (headless Edge, 1280 × 900, wheel zoom 2 s, 10 parts)

Path script per frame p50 / p95: 0.0 / 0.1 ms at 1×, 0.1–0.3 / 0.4 ms at 4×; no dropped frame at 1×. Main thread per
frame at 4× (fresh pages, path hidden vs shown): +0.3–0.6 ms with the start circuit, +0.7–1.1 ms with 10 parts, on a
grid alone of 5.1–5.4 ms (dev server; ±0.5 ms run to run). So `ui-chart.mjs`'s bound is 6.5 ms (was 6; BL51 to win it
back) and `ui-path.mjs` checks the path's share (≤ 1.5 ms) and dropped frames against the hidden-path page. After
long harness runs this laptop measures up to 8–9 ms for the same page (heat): rerun a timing failure alone.

## For M3.3

- Handles go in the marks box (HTML, constant size) at the arc ends = node k + 1 (`gamma[2k+2]`); hit areas ≥ 44 px
  through `ChartView.handles.hit`, which runs before panning; reuse `pickCode`'s order (markers first).
- A drag frame: `nodeLocus` once on down, `project` per move, then `setCircuit` with the new value (or a cheaper
  `setPart(k, value)` that re-evaluates from node k and rewrites only arcs ≥ k) and `request(DIRTY_CONTENT)`;
  `commit` once at the end. `arcPath` is ~10 µs per arc.
- `onTap` fires after a tap places the read point; a drag that starts on a handle never reaches it.
