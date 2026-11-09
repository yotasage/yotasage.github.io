# Architecture

Part of the [PCB viewer plan](plan.md).

| Part | Location | Notes |
| --- | --- | --- |
| Page | `pages/pcb-viewer/main.tsx` | Head, home link, global styles, as every page (CLAUDE.md) |
| UI | `components/PcbViewer/` | `PcbViewer.tsx` start screen (loads `Workspace.tsx` on first open), `Workspace.tsx` view, toolbar and cards, `LayerPanel.tsx` (also the format of drill files), `FileList.tsx`, `pick.tsx` (file and folder pickers, drop zone that reads dropped folders), `Measure.tsx` (overlay and card), `SaveCard.tsx` (PNG and SVG; S8: PDF and DXF, as a choice of format; S9: KiCad, for Altium, PADS and EAGLE boards, with the warning before saving), `Inspect.tsx` (S4: the panel over the view that says what a click is on, and the searchable lists of components and nets), `AssemblyCard.tsx` (S4: BOM and pick-and-place), `PlacementCard.tsx` (S8: the pick-and-place files over a Gerber set, with their columns, units, sides and offset) |
| Styles | `styles/PcbViewer.module.css` | |
| Model | `lib/pcb/model.ts` | See below |
| Geometry | `lib/pcb/geometry.ts` | Arcs, boxes, contour orientation, affine transforms of items |
| Loading | `lib/pcb/detect.ts`, `lib/pcb/load.ts` | Recognise formats by content, expand ZIPs, hand each file to its reader, build the `Board` |
| Gerber | `lib/pcb/gerber/` | `parse.ts` reader and plotter → items and apertures; `macro.ts` aperture macros; `standard.ts`, `shapes.ts` aperture shapes |
| Gerber job, layer identification | `lib/pcb/gbrjob.ts`, `lib/pcb/identify.ts` | `identify.ts` also has the default layer order and the layer titles |
| Excellon, drill layers | `lib/pcb/excellon.ts`, `lib/pcb/drill.ts` | `excellon.ts` reads a file once into a program and plots it with a format; `drill.ts` fits a format to the pads and turns Gerber drill files into holes |
| Board shape | `lib/pcb/outline.ts` | Loops of the outline layer, else a frame drawn on several layers, else the copper's rectangle |
| Points | `lib/pcb/points.ts` | Pad and hole centres and line ends per layer in a grid index: measuring snaps to them, drill formats are fitted to them |
| Hits | `lib/pcb/hits.ts` | What lies under a point of a layer (S4): a grid index of the items per layer, built on the first click on the layer, and the distance from a point to each kind of item |
| Inspecting | `lib/pcb/inspect.ts` | What a click is on across the layers of the picture (one entry per object), its description, the lists of components and nets, and the items of a highlighted net or component on every layer (S4); only from `Board.objects`, `Board.placements` and the layers, with `Board.design` for pad shapes, holes and margins |
| Design → layers | `lib/pcb/design/` | Shared by all design formats (S3): `build.ts` the `Design` into a `Board` (S5: negative planes; S6: several planes per layer, plane areas with cuts, positive planes, zone lines, square vias; S7: the outline stroke of plane areas), `areas.ts` (S7, moved from PADS's `planes.ts`) areas as point lists, whether a stroke reaches one, distances, pad shapes as filled shapes, `pads.ts` pad shapes as aperture parts and grown or shrunk for mask and paste, `art.ts` graphics (dashes too) and text as items, `outline.ts` the board shape from outline graphics, `overrides.ts` the user's layer types on a design's board, `open.ts` the entry loaded with `await import` when a design file is opened |
| Stroke font | `lib/pcb/font/` | Newstroke (S3): `newstroke-glyphs.ts` generated from the font author's own CC0 release (see Libraries), `stroke.ts` layout adapted from KiCanvas, `LICENSE.kicanvas.txt` and `LICENSE.newstroke.txt` (read by `scripts/collect-licenses.mjs` for `/licenses`) |
| Design formats | `lib/pcb/kicad/` (S3: `sexpr.ts` reader, `layers.ts` layer names and wildcards, `board.ts` boards and footprints), `lib/pcb/altium/` (S5: `board.ts` boards and libraries through `altiumts`, `records.ts` fields, lengths, text and contours, `layers.ts` layer names and the stack, `rules.ts` rule scopes and the mask, paste and plane rules, `text.ts` text placement), `lib/pcb/pads/` (S6: `ascii.ts` header, units, sections, what each version writes differently and the `*MISC*` blocks, `layers.ts` levels, kinds, sides and the pairs a bottom part is mirrored with, `board.ts` the reader, `planes.ts` plane areas without a saved flood and CAM planes, `text.ts` text placement), `lib/pcb/eagle/` (S7: `xml.ts` a small XML reader, `layers.ts` layer numbers, kinds and the pairs a mirrored element swaps, `rules.ts` the design rules (restring, masks, roundness, shapes, elongation), `board.ts` boards and libraries, `pours.ts` polygons as plane areas with cuts, `text.ts` text placement) | Each produces a `Design` |
| Drawing | `lib/pcb/render/` | Layer view and realistic view on Canvas 2D: `prepare.ts` paths, `paint.ts` a layer into a canvas and the two ways of compositing (shared with the PNG export), `view.ts` canvas, gestures, clicks and modes, `colors.ts` default and realistic colours |
| Pick-and-place over Gerbers | `lib/pcb/pnp.ts`, `lib/pcb/markers.ts` | S8: `pnp.ts` recognises pick-and-place files by content, reads them into a table, turns rows into `Placement`s with a column mapping and fits units, origin and negated bottom X to the pads; `markers.ts` (loaded with the stroke font, with the first pick-and-place file) draws a marker layer per side |
| Exports | `lib/pcb/export/` | `png.ts`, `svg.ts` (S2); `csv.ts` BOM and pick-and-place (S4); `pdf.ts` PDF at 1:1, `dxf.ts` DXF, `flatten.ts` a layer as polygons with polygon booleans (clear items applied) for both (S8); `kicad.ts` a design as a KiCad board, loaded with `await import` when one is saved, and `kicadnotes.ts` whether a board can be saved so and what the warning says about it (S9) |

Flow: files → recognise → reader → `Board`. Gerber and drill files become layers directly; a pick-and-place file opened
with them gives `Board.placements` and a marker layer per side (S8). A design file becomes a
`Design`, which `lib/pcb/design/` turns into layers. Drawing and the PNG, SVG, PDF and DXF exports use only the layers;
the CSV exports use `Board.placements`; the KiCad export uses `Board.design`, and the board's plane layers for the copper of
planes the file does not store. `readFiles` (`load.ts`) chooses one design
file among those opened and reads it through `design/open.ts`; the board made from it is kept on the `LoadedFile`
(`designBoard`), and `buildBoard` returns it with the user's layer types on top (`design/overrides.ts`).

## Drawing

- **Canvas 2D.** After loading, each layer's items are turned once into `Path2D` objects in board coordinates. They are
  grouped into runs of the same polarity; within a run, lines are grouped by width and cap, and filled shapes go
  together. Each frame sets the view transform and draws every visible layer into its own offscreen canvas: dark in
  the layer's colour, clear with `destination-out`. The layer canvases are then composited onto the screen canvas.
- **A flash with clear parts** (macro primitives with exposure off, holes in standard apertures) must not erase what is
  under it. Draw such an aperture as its own small image, or flatten it.
- **While panning or zooming,** transform the last frame and redraw when the gesture pauses, so large boards stay
  smooth.
- **Views:** the bottom view mirrors X. The realistic view (S2) composes substrate, copper, mask, finish, silkscreen and
  holes with canvas compositing.
- If Canvas 2D is too slow for the large KiCad demo, add a backlog row (WebGL) instead of switching in the middle of a
  step.

As built in S1 (`lib/pcb/render/`):

- **Paths** are made the first time a layer is drawn, so hidden layers cost nothing, and are cached by the layer's
  `items` array (the board is rebuilt when files are added or a type changes; the items stay). Every solid shape runs
  counter-clockwise and every hole clockwise, so one non-zero fill per run is the union. **Never call `closePath()` on
  a `Path2D`:** in Chromium it takes time proportional to the path, and made the large demo's copper take 1.2 s
  instead of 3 ms. Fills close their subpaths anyway.
- **Flashes with clear parts:** standard apertures with a hole (one convex solid part with clear parts inside it) are
  drawn as outline plus reversed hole in the same fill. Any other aperture with clear parts (macros with exposure off)
  is "separate": each flash on screen is drawn into a scratch canvas, its clear parts erasing only its own solid parts,
  and copied onto the layer; flashes a few pixels across skip the holes.
- **Tiles:** layers with many items are split into a grid of up to 24 × 24 tiles (about 4,000 items each), and only
  tiles on screen are drawn, so zoomed-in views of large layers stay fast.
- **Layer canvases** exist only for visible layers, at screen size; each holds one colour (alpha = coverage), so a
  colour change repaints it in place (`source-in`), and S2 can use them as masks. Lines are at least 0.8 device pixels
  wide, so thin outlines stay visible when zoomed out.
- **Gestures:** the last composited frame is moved and scaled; 200 ms after the last change the layers are drawn
  again, a slice of about 40 ms at a time (a new gesture stops it). The canvas carries `data-draw-ms` and
  `data-draws` for tests.
- **Large KiCad demo** (`jetson-agx-thor-baseboard`, 38 Gerber files, 64 MB): reading takes about 0.7 s, opening to
  the first picture about 1.2 s; a redraw takes 60–150 ms with the default layers and up to about 250 ms with all 38
  layers (2 fabrication layers of 300,000 lines each), measured in headless Edge with a desktop GPU. The JS heap is
  about 300 MB.
- **Negative images** (Gerber IPNEG, deprecated) start dark over the layer's bbox; S2 may clip them to the board.

As built in S2:

- **Painting** moved to `paint.ts` (`paintLayer`, `compositeLayers`, `compositeRealistic`), so the view on screen and
  the PNG export share it. A layer canvas is up to date for a view (`viewKey`) and holds one colour; a new colour is
  painted over in place, and canvases of layers that are not in the picture are freed after each drawing.
- **Realistic view** (`compositeRealistic`), from the layer canvases of the side in view (`sideLayers`: copper, mask,
  silk and drill layers by kind and side, whether shown in the list or not) and the board shape: the shape in mask
  colour (or bare substrate without a mask layer); mask openings in substrate colour; copper under the mask in the
  mask's lighter "over copper" colour; exposed copper (copper in the openings) in the finish colour; silkscreen except
  in openings; holes cut through everything (`destination-out`); the background behind. Every step is `source-atop`
  the shape, so nothing shows outside the board. Two temporary canvases are needed. Seen from the bottom it is the
  same with the bottom layers, mirrored. Blind and buried drill layers (X2 span) show only on the side they reach.
- **Clicks:** a press pans only after moving 4 px (mouse) or 10 px (touch); a release before that is a click
  (`onTap`), unless a second finger came. The view tells listeners about the cursor and every view change
  (`listenCursor`, `listenView`), for the coordinates and the measuring overlay.

As built in S4:

- **Highlight and selection** are layer canvases of their own, painted from sub-layers that hold only their items and
  share the layer's apertures (`setHighlight`, `setSelection`). Their canvas keys carry a generation each, so a new
  highlight or selection is drawn again and the old canvases are freed. Layer view: the layers at 22 % of their
  opacity, the highlighted parts at their opacity, then the selection. Realistic view: `compositeRealistic(…, dim)`
  darkens the board inside its shape before the background goes behind; `compositeHighlight` lays the highlighted
  copper (lit, `HIGHLIGHT_COPPER`) and silkscreen over it with the holes of the side cut through. The selection is
  drawn by `compositeOutline`: the selected canvases grown by 2 device pixels in eight directions minus themselves, over
  a faint fill, so a selected zone does not cover the board. Exports keep the highlight and leave out the selection.

## Libraries

| Library | Use | Licence | Status |
| --- | --- | --- | --- |
| `fflate` | ZIP | MIT | Already a dependency |
| `altiumts` 0.0.95 (exact version) | Altium | MIT; dependencies `cfb` 1.2.2, `adler-32` 1.3.1, `crc-32` 1.2.2 (Apache-2.0), `transformation-matrix` 2.16.1 (MIT), `fflate` (MIT, already a dependency); no install scripts | Added in S5. It declares `typescript ^5` as a peer dependency (only its build needs it), so `package.json` has `"overrides": { "altiumts": { "typescript": "$typescript" } }` for npm to install it with the site's TypeScript 7 (`npm ci` too). Loaded by `await import('altiumts')` in `lib/pcb/altium/board.ts`: a chunk of its own (277 kB minified) that only opening an Altium file loads. `/licenses` lists it and its dependencies (the import scanner finds dynamic imports) |
| `@cantoo/pdf-lib` | PDF export | MIT | Already a dependency |
| Newstroke font, and KiCanvas's stroke font code | Text of design files | Font: CC0 1.0 (the README of the author's distribution: "Now released under CC0 licence, to give it right to be used in any project."); KiCanvas: MIT | Added in S3: the layout in `stroke.ts` adapted from KiCanvas commit b031159 (metrics corrected to KiCad 10). `lib/pcb/font/newstroke-glyphs.ts` is generated by a converter of our own (not in the repository; it follows the encoding of the author's `fontconv.awk`) from `symbol.lib`, `font.lib` and `charlist.txt` of the author's `newstroke-font.tgz` (https://vovanium.ru/_media/sledy/newstroke/newstroke-font.tgz, linked from https://vovanium.ru/sledy/newstroke/en; retrieved 2026-11-09, SHA-256 `dba1c334834e21bdbd15395dc610ecc2bf2eb6675ba0c4585597b375b7bd099e`). It replaced KiCanvas's copy of the glyphs, which came from KiCad's `newstroke_font.cpp` with KiCad's GPL-2.0-or-later header (KiCad's `LICENSE.README` does not list Newstroke, and its catch-all is GPL-3.0-or-later) and CJK glyphs under MIT and OFL-1.1. Never take glyphs from KiCad or KiCanvas: KiCanvas's `third_party/newstroke/` is KiCad's extended copy (another `font.lib` and `charlist.txt`, CJK libraries), not the author's release. The licence texts are in `lib/pcb/font/LICENSE.kicanvas.txt` and `LICENSE.newstroke.txt`; `scripts/collect-licenses.mjs` puts both on `/licenses` ("Font and code used by the PCB viewer") |
| `clipper2-ts` 2.0.1 (exact version) | Polygon booleans: PDF and DXF of layers with clear items (`lib/pcb/export/flatten.ts`) | BSL-1.0 (Boost Software License, with its `LICENSE` file); no dependencies; ESM only | Added in S8. Jeremy Tribby's TypeScript port of Angus Johnson's Clipper2 (C# version), with Clipper2's reference tests. Loaded with `await import('clipper2-ts')` only when an export flattens a layer: a chunk of its own (104 kB minified). npm's `latest` tag points at the prerelease `2.0.1-19`; the stable `2.0.1` (2025-12-21) is pinned. Chosen over `clipper-lib` (Clipper 6, no licence file, JSBN inside) and `clipper2-js` (Angular peer dependencies). S7 had done without: EAGLE's pours are plane areas with cuts, clipped to a polygon only as convex pieces (Sutherland–Hodgman, `lib/pcb/eagle/pours.ts`); exact pours ([BL23](../BACKLOG.md)) and the mask web ([BL15](../BACKLOG.md)) can use it now |

- **`altiumts` is ESM only,** so it is loaded with `await import('altiumts')` (CLAUDE.md, `"module": "node16"`), and
  only when an Altium file is opened; its types come with `import type … with { 'resolution-mode': 'import' }`.
  Version 0.0.95 reads both sample boards: the ASCII one in 59 ms and the binary one in 172 ms, with counts that match
  the file's own headers.
- **`altiumts` limits** (worked around in `lib/pcb/altium/`, see "Notes from S5"): `parseAltiumFile` does not read
  `.PcbLib`; binary vias come with their basic fields only; an ASCII board record split into several gives an empty
  layer stack; binary regions come twice; strings keep control characters (U+0001).
