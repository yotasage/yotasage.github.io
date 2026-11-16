# Notes from M2.1d: the general editor

Step M2.1d (2026-11-16): a `general` structure's traces and grounds are added, removed, typed and dragged; any preset
becomes the equivalent general structure; two fixes to the M2.1c drawing. Checks: `npm run check` 18 587,
`npm run ui` 294 (ui-general.mjs 65 new), first load 161.5 kB gzip.

## The editor's controls (components/EmSim/GeneralEditor.tsx)

- Kind select: "General arrangement" is offered last, always; choosing it converts the current preset. "Edit as
  general" beside the select (`data-trace-to-general`, preset kinds only) does the same. The way back is the kind
  select (`withKind`, which keeps the preset's own `w`, `s`, `g`, `gw`, still carried by the general structure).
- For `general` the signal layer select is hidden (each row has its own layer); the planes above and below stay.
  `st.layer` follows the first trace's layer (the drawing's "· signal" label).
- Tools: "On layer" (the layer for new features: the selected feature's layer by default), "Add trace", "Add
  ground", "Remove <selected>". Refusals show under the tools (`data-gen-refused`, role alert).
  - A new trace is as wide as the last one, at the free place nearest u = 0: a gap between features of that layer at
    least w + 0.4 mm wide, else 0.2 mm beside the outermost feature; the 9th is refused ("at most 8 traces").
  - A new ground runs from 0.2 mm beside the layer's features (or the traces', on an empty layer) to the edge, on the
    right when that side is free, else on the left; refused when both sides already run to the edge.
  - Remove keeps at least one trace. Every change is one commit (one undo step).
- Rows: trace (layer, "Position (centre)" with negative values allowed by `ValField`'s new `negative`, width) and
  ground (layer, left and right edge, empty for "to the edge"), each with tolerance and source like the other fields.
  Typed values that make the structure invalid are kept and shown in the issue list, as for presets.
- Selection (`GenSel`: `sig.<i>` / `gnd.<i>`, in `TraceSection`): by a row's name button, by a press or focus in a
  row, by a tap within 6 px of a conductor in the drawing (`PanZoom.onTap`), or by pressing one of its handles. The
  selected row is highlighted and the conductor outlined in the drawing (dashed accent rectangle, cut at the view
  for a ground to the edge).

## Handle keys (components/EmSim/traceGeom.ts)

- `sig.<i>.w`: the trace's width, on the right end of its base (`from` = 2 (p − u)).
- `sig.<i>.u`: its centre, on its top face (so it does not sit on the width handle).
- `gnd.<i>.a`, `gnd.<i>.b`: a ground's finite edges on its base. An edge to the board's edge has no handle and stays
  null; a typed value makes it finite.
- `t:<id>`: the dielectrics between the topmost and lowest signal layers and their planes, as for presets.
- `applyHandle` refuses with the first error of `structureIssues` (overlap or touch, ground on a plane layer, top
  narrower than the etch, walls); the drag stays at its last valid value. The fast path and one undo step per drag are
  `TraceSection`'s `edit`, unchanged.

## The conversion (lib/emsim/structure.ts `toGeneral`)

The features are built with the same arithmetic as `arrangement` (a pair's centres ±(w + s)/2, a broadside pair's
second trace at u = s, coplanar grounds from ±(edge + g) to ±(edge + g + gw) or the edge), so the solver sees exactly
the same numbers: in Node every preset gives bit-equal Z0 / Zdiff and errors, and ui-general checks it in the page. The
width keeps its tolerance and source; derived positions and edges are typed values.

## The two fixes

- (a) `traceFit`: when the width limits the scale (a thin board on a phone), the default view zooms in until the
  section is at least `FILL` = 0.52 of a 170 px box, as long as the signals stay whole across (a wide ground's far
  edge may be cut; at 0.52 the default view still shows ui-drag's 0.5 mm ground width beside the 50 Ω microstrip at
  1440 px, which 0.6 did not). The box is at least 170 px; spare height is air or board on the side without a plane.
  `data-content-h` / `data-box-h` on the figure are what ui-general checks.
- (b) Plane labels are placed by `labelSpot`: beside the plane on the structure's side, else on its other side, else
  moved left past the handles they meet; checked by bounding boxes at 390 px for four kinds.

## Results for more than two lines

`TraceResults` shows every line's Z0 (Zc_kk) and εeff (C_kk/C0_kk), the modes' εeff and delay in a details view, and
the n × n matrices on demand as before. Two general traces get the pair panel (the engine gives `pair` for n = 2).

## For M2.2 (fields) and later

- A general structure is an `Arrangement` like any other: `section()` and the field jobs need nothing new. The drive
  for n > 2 lines must name the line or mode (`modes` has n entries, labelled only for pairs).
- Grounds are id 0 in `Arrangement.features` and in `section().conductors`; to tell them apart use their order
  (features after the signals, in `st.grounds` order) or their extents, as the selection outline and the tap do.
- Narrow gaps solve slowly (0.005 mm about 1 s, 0.002 mm about 12.5 s for a pair in Node): a drag stopped by an
  overlap can leave a micrometre gap. BL100.
- Not done: walls (`st.wall`) have no control yet; dragging a whole ground (both edges) or a feature to another layer
  by pointer; per-feature mask choice.
