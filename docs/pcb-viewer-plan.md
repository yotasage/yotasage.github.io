# PCB viewer – plan

A viewer for Gerber files and printed circuit board designs at `/pcb-viewer/main`, running entirely in the browser like
the rest of the site.

The owner's goal (2026-11-08): open designs from KiCad, Altium, PADS and EAGLE, and Gerber sets, to understand a
design and get an impression of what it looks like, without installing PADS Viewer or Altium and without ad-filled
websites. Viewing comes first. Exports are for documentation and further work, not for ordering boards. The tool is
made for the owner and public for anyone, as is.

## Ground rules

- **The site's hard constraints apply** ([CLAUDE.md](../CLAUDE.md)): no server, self-hosted assets, files never leave
  the device, licence check for every new dependency.
- **Design files are drawn as they were saved.** Copper pours and zones are shown as last poured or filled. Altium,
  PADS and EAGLE text is drawn with KiCad's stroke font as a stand-in, so it is close but not identical.
- **Formats are recognised by content, not by extension.** `.asc` is PADS or LTspice, `.pcb` is PADS binary or gEDA,
  `.brd` is EAGLE XML, EAGLE binary (before 6.0) or Allegro.
- **A file that cannot be read gets a clear message saying why**, and what to do if there is a way. For example, a PADS
  binary `.pcb`: "export PADS ASCII in PADS Layout (File → Export → .asc)".
- **Conversions carry a warning** that the result may be incomplete or wrong (KiCad export, S9).
- **Phone width and touch work.**
- **No code from GPL projects** (KiCad, altium-toolkit, altium-format) is copied. Their documentation and their programs
  (`kicad-cli`) are fine as references. MIT, BSD, ISC and Apache code may be reused with its notice on `/licenses`.
- **Each card and README entry lists only what works.** Each step updates the card on the main page and the README.

## Formats

| Read | Notes | Step |
| --- | --- | --- |
| Gerber RS-274X and X2 (also Gerber drill files) | Ucamco's specification; X2 attributes give layer functions and, in KiCad's Gerbers, nets, pins and components | S1 |
| Gerber job file (`.gbrjob`) | Layer order, thickness, mask and silkscreen colours, finish | S1 |
| ZIP archives | Of any of these files | S1 |
| Excellon drill | Including files without a header (format guessed, user can correct it) | S2 |
| KiCad `.kicad_pcb` (KiCad 4 to 10), `.kicad_mod` | | S3 |
| Altium `.PcbDoc` (binary and ASCII) | Through `altiumts`; `.PcbLib` if its decoders allow, else [BL1](BACKLOG.md) | S5 |
| PADS ASCII (`.asc`) | PowerPCB V4.0 to current | S6 |
| EAGLE `.brd` (XML, EAGLE 6 to 9, Fusion exports) | | S7 |
| Pick-and-place CSV over a Gerber set | KiCad, Altium, JLC, other by column mapping | S8 |

Not read: PADS binary `.pcb` (closed format; [BL4](BACKLOG.md)); EAGLE binary (before 6.0); Allegro, OrCAD Layout,
Xpedition, DipTrace, Proteus, EasyEDA and gEDA design files (they all export Gerber); ODB++ (downloading the
specification does not grant a licence to write software for the format, which needs membership of Siemens' ODB++
Solutions Alliance). Maybe later: IPC-2581 ([BL5](BACKLOG.md)), IPC-D-356 ([BL6](BACKLOG.md)).

| Export | Step |
| --- | --- |
| PNG: layer view or realistic view, whole board or what is on screen, transparent background as an option | S2 |
| SVG: the same, as vectors | S2 |
| BOM CSV and pick-and-place CSV, from design files | S4 |
| PDF at exactly 1:1 | S8 |
| DXF: board outline and holes for mechanical CAD, or chosen layers | S8 |
| KiCad `.kicad_pcb` from Altium, PADS and EAGLE designs, with a warning | S9 |

Not planned: STEP (needs an Open CASCADE build that writes files; `occt-import-js` only reads), Gerber and drill files
from design files ([BL7](BACKLOG.md)), 3D view ([BL2](BACKLOG.md)), revision comparison ([BL3](BACKLOG.md)).

## Test files

On the owner's machine. Read them where they are; never copy them into the repo or change them.

| What | Path | Notes |
| --- | --- | --- |
| KiCad Gerber set | `E:\OneDrive - NTNU\ULDAC\PCB\2026_ARTIFICER_TC1\manufacturing\gerbers` | KiCad 10.0.6, X2 with net/pin attributes, `.gbrjob` (6 layers, 1.657 mm, green mask, white silk), PTH and NPTH drills |
| Same set zipped | `…\2026_ARTIFICER_TC1\manufacturing\uploaded\gerbers_v1.zip`, `gerbers_v2.zip` | Two revisions |
| Same board in KiCad | `…\2026_ARTIFICER_TC1\2026_ARTIFICER_TC1.kicad_pcb` | The source of the Gerbers above |
| Its pick-and-place and BOM | `…\2026_ARTIFICER_TC1\manufacturing\assembly\POS.csv`, `BOM.csv` | Made by KiCad from the same board |
| PADS ASCII | `C:\Users\Jonat\Downloads\DC2637A\DC2637A-1_post\DC2637A-1-LAYOUT-ASC.ASC` | `!PADS-POWERPCB-V4.0-BASIC!`, 4 routing layers, pours (HATOUT) included |
| PADS binary | `…\DC2637A-1_post\DC2637A-1.PCB` | Same design, closed format (`DC2637A-1.txt` is a byte-identical copy) |
| PADS Gerbers | `…\DC2637A-1_post\DC2637A-1-GBR.ZIP` | From the same design: RS-274X `.pho` (L1–L4, TS/TM/TP, BS/BM/BP, FAB), `.rep` reports, `DRILL.drl` without a header (inch) |
| PADS prints, BOM | `…\DC2637A-1_post\DC2637A-1-PDF.ZIP`, `DC2637A-1.XLSX` | References |
| Altium ASCII | `C:\Users\Jonat\Downloads\Altium_KERALA_GF130_2026-06-27\KERALA_GF130\v1\PCB1.pcbdoc` | ASCII PcbDoc: 2,420 tracks, 376 pads, 714 regions, 5 polygons, 129 components |
| Altium binary | `…\KERALA_GF130\v2\PCB1_1.pcbdoc` | Binary PcbDoc: 2,580 tracks, 398 pads, 731 regions, 135 components, 35 rules; text in stroke font and Arial, Arial embedded; no 3D bodies |
| Altium library | `…\KERALA_GF130\v2\PCB1_1.PcbLib` | One footprint (QFN48_7x7); `altiumts` 0.0.95 rejects it |
| Altium print | `C:\Users\Jonat\Downloads\Altium_KERALA_GF130_2026-06-27\PCB1_1.pdf` | Altium's own print of the v2 board |
| KiCad demos | `C:\Program Files\KiCad\10.0\share\kicad\demos\` | Many boards; `jetson-agx-thor-baseboard` is the large one for speed tests |
| KiCad 4 to 8 boards | `https://gitlab.com/kicad/code/kicad/-/raw/<tag>/demos/<demo>/<demo>.kicad_pcb` | The same demos as saved by the releases 4.0.7, 5.1.12, 6.0.11, 7.0.11 and 8.0.9 (file versions 3, 4, 20171130, 20210722, 20211014, 20221018, 20240108); S3 kept them in its scratch folder |
| KiCad QA boards | `https://gitlab.com/kicad/code/kicad/-/raw/master/qa/data/pcbnew/` | Pad stacks (`padstacks*.kicad_pcb`, `via_stacks`), `custom_pads`, `test_copper_graphics`, `tracks_arcs_vias`, `api_kitchen_sink` (barcodes, tables, text boxes; a KiCad 11 development version) |
| EAGLE | none yet | S7 finds two or three public EAGLE boards (e.g. Adafruit or SparkFun on GitHub, ideally with Gerbers) and keeps them in a scratch folder |

`kicad-cli` 10.0.6 (`C:\Program Files\KiCad\10.0\bin\kicad-cli.exe`) makes reference output: `pcb export
gerbers|drill|svg|pdf|pos|dxf|ipc2581|ipcd356`, `pcb render` (3D picture), and `pcb import --format altium|pads|eagle`,
which turns the Altium, PADS and EAGLE samples into KiCad boards as a second opinion. Write its output to a scratch
folder, never next to the test files.

## Architecture

| Part | Location | Notes |
| --- | --- | --- |
| Page | `pages/pcb-viewer/main.tsx` | Head, home link, global styles, as every page (CLAUDE.md) |
| UI | `components/PcbViewer/` | `PcbViewer.tsx` start screen (loads `Workspace.tsx` on first open), `Workspace.tsx` view, toolbar and cards, `LayerPanel.tsx` (also the format of drill files), `FileList.tsx`, `pick.tsx` (file and folder pickers, drop zone that reads dropped folders), `Measure.tsx` (overlay and card), `SaveCard.tsx` (PNG and SVG), `Inspect.tsx` (S4: the panel over the view that says what a click is on, and the searchable lists of components and nets), `AssemblyCard.tsx` (S4: BOM and pick-and-place) |
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
| Design → layers | `lib/pcb/design/` | Shared by all design formats (S3): `build.ts` the `Design` into a `Board`, `pads.ts` pad shapes as aperture parts and grown or shrunk for mask and paste, `art.ts` graphics (dashes too) and text as items, `outline.ts` the board shape from outline graphics, `overrides.ts` the user's layer types on a design's board, `open.ts` the entry loaded with `await import` when a design file is opened |
| Stroke font | `lib/pcb/font/` | Newstroke (S3): `newstroke-glyphs.ts` generated from the font author's own CC0 release (see Libraries), `stroke.ts` layout adapted from KiCanvas, `LICENSE.kicanvas.txt` and `LICENSE.newstroke.txt` (read by `scripts/collect-licenses.mjs` for `/licenses`) |
| Design formats | `lib/pcb/kicad/` (S3: `sexpr.ts` reader, `layers.ts` layer names and wildcards, `board.ts` boards and footprints), `lib/pcb/altium/`, `lib/pcb/pads/`, `lib/pcb/eagle/` | Each produces a `Design` |
| Drawing | `lib/pcb/render/` | Layer view and realistic view on Canvas 2D: `prepare.ts` paths, `paint.ts` a layer into a canvas and the two ways of compositing (shared with the PNG export), `view.ts` canvas, gestures, clicks and modes, `colors.ts` default and realistic colours |
| Exports | `lib/pcb/export/` | `png.ts`, `svg.ts` (S2); `csv.ts` BOM and pick-and-place (S4); PDF, DXF, KiCad later |

Flow: files → recognise → reader → `Board`. Gerber and drill files become layers directly. A design file becomes a
`Design`, which `lib/pcb/design/` turns into layers. Drawing and the PNG, SVG, PDF and DXF exports use only the layers;
the CSV exports use `Board.placements`; the KiCad export uses `Board.design`. `readFiles` (`load.ts`) chooses one design
file among those opened and reads it through `design/open.ts`; the board made from it is kept on the `LoadedFile`
(`designBoard`), and `buildBoard` returns it with the user's layer types on top (`design/overrides.ts`).

### Model (sketch)

S1 wrote the artwork part (in `lib/pcb/model.ts`, as below; S2 added `outlineFrom`, the `'format'` way of identifying
a layer, and drill layers with plated and non-plated holes), S3 wrote the design part (and `Board.design`, the
`design` link of `BoardObject`, and `attrs` and `fields` of `Placement`), S4 added `Aperture.code` and
`Design.placeOrigin`. Names and fields may change. Keep this section in step with the code.

```ts
// Units: millimetres. Y up (KiCad's Y is negated on reading). Angles: degrees, counter-clockwise from +X.
interface Pt { x: number; y: number }
interface Box { minX: number; minY: number; maxX: number; maxY: number }

// A closed outline of straight segments and circular arcs, from start back to start. An arc segment that ends where
// it starts is a full circle.
interface ContourSeg { to: Pt; arc?: { c: Pt; ccw: boolean } }
interface Contour { start: Pt; segs: ContourSeg[] }
type Mirror = 'none' | 'x' | 'y' | 'xy';

// What a layer looks like, in drawing order. A dark item adds; a clear one erases what is under it on that layer.
type Art =
  | { k: 'line'; a: Pt; b: Pt; w: number; cap: 'round' | 'square' }
  | { k: 'arc'; c: Pt; r: number; start: number; sweep: number; w: number }   // sweep > 0: counter-clockwise, ±360 full
  | { k: 'flash'; at: Pt; ap: number; rot: number; mirror: Mirror; scale: number }   // mirror, then rotate, then scale
  | { k: 'region'; contours: Contour[] }       // non-zero fill: outer contours counter-clockwise, holes clockwise
  | { k: 'hole'; at: Pt; d: number; to?: Pt; plated: boolean };   // drill hit; `to` makes it a slot
// Drill layers hold `hole` items (Excellon and Gerber drill files alike); a routed path of an Excellon file is a slot
// per straight part and an `arc` item (w = tool diameter) per curved part.
type ArtItem = Art & { dark: boolean; obj?: number };   // obj: index into Board.objects

// A flash shape; parts in order (polygons counter-clockwise), a part with dark: false erases earlier parts of the same
// flash only. Block apertures and step-and-repeat are expanded into items by the Gerber plotter.
interface AperturePart { dark: boolean; circle?: { c: Pt; r: number }; poly?: Pt[] }
interface Aperture { parts: AperturePart[]; name?: string; code?: number;   // name as defined ("C,0.5"), Gerber D code
  attrs?: Record<string, string> }   // attrs: X2 %TA

type LayerKind = 'copper' | 'mask' | 'paste' | 'silk' | 'outline' | 'drill' | 'mechanical' | 'fab' | 'courtyard'
  | 'keepout' | 'other';
type Side = 'top' | 'bottom' | 'inner' | 'none';
type IdentifiedBy = 'x2' | 'job' | 'name' | 'format' | 'design' | 'user' | 'none';   // format: an Excellon file is a drill layer

interface Layer {
  id: string; name: string; kind: LayerKind; side: Side;
  label?: string;                    // more about it: "Glue", "ECO1", "L1–L2, blind"
  copper?: number;                   // copper order: 1 = top … n = bottom
  negative?: boolean;                // starts dark over its bbox, items already toggled (Gerber IPNEG)
  plated?: boolean;                  // drill layers: undefined when the file has both (each hole says)
  file?: string; attrs?: Record<string, string>;   // source path (inside an archive too), X2 %TF with the dot
  identifiedBy?: IdentifiedBy;
  items: ArtItem[]; apertures: Aperture[]; bbox: Box;
}

// Design boards: one object per pad, via, zone ('zone', 'teardrop', 'rule area') and component (its graphics and text
// too), with `design` pointing at the entry; one per net for tracks, one per net for board graphics, one for board text.
interface BoardObject { kind: string; net?: string; component?: string; pin?: string; info?: Record<string, string>;
  design?: { list: 'pads' | 'vias' | 'zones' | 'components' | 'tracks' | 'graphics' | 'texts'; index: number } }
// at, rot and side as KiCad's position files give them (lib/pcb/export/csv.ts writes them so): the footprint origin,
// Y up; rot counter-clockwise, for a bottom part the angle of the footprint flipped about its own X axis (Y negated)
// and then turned, as KiCad stores it; X is not negated on the bottom.
interface Placement { ref: string; value?: string; footprint?: string; at: Pt; rot: number; side: 'top' | 'bottom';
  // 'dnp', 'exclude_from_bom', 'exclude_from_pos_files', 'board_only': 'yes'; 'type': 'smd' | 'through_hole'
  attrs?: Record<string, string>;
  fields?: Record<string, string> }  // other fields (MPN, LCSC…), for the BOM

interface Board {
  name: string; source: 'gerber' | 'kicad' | 'altium' | 'pads' | 'eagle';
  layers: Layer[];                   // in the default order, top of the list first (identify.ts)
  outline?: Contour[];               // board shape: edges counter-clockwise, cutouts clockwise (outline.ts)
  outlineFrom?: 'outline' | 'design' | 'frame' | 'copper' | 'extent';   // frame: one loop drawn on several layers (PADS)
  stackup?: { thickness?: number; mask?: string; silk?: string; finish?: string; copperLayers?: number };
  objects: BoardObject[];            // what a click reports and a highlight is made of (S4); Gerber: one per
                                     // distinct %TO set, \uXXXX escapes decoded
  placements: Placement[];           // components of a design, or from a pick-and-place CSV
  design?: Design;                   // design files only (S3)
  warnings: string[];
}

// Design files (S3). Every design reader produces a Design; lib/pcb/design/build.ts makes the layers. Layers are
// referred to by Design.layers[].id; nets by index (0 = no net); components by index. Positions are on the board (a
// component's items already placed), mm, Y up, angles counter-clockwise.
interface Design {
  format: string;                    // e.g. "KiCad 9 (format 20241229)"
  layers: { id: string; name: string; kind: LayerKind; side: Side; copper?: number; plane?: boolean;
    label?: string }[];              // KiCad: id is the canonical name ("In2.Cu"), name the user's ("GND1.Cu")
  nets: string[];
  outline: Contour[];                // empty: the builder falls back to boardShape (the copper's rectangle)
  components: { ref: string; value: string; footprint: string; at: Pt; rot: number; side: 'top' | 'bottom';
    attrs: Record<string, string>; fields: Record<string, string>; description?: string }[];
  pads: { comp?: number; num: string; net: number; at: Pt; rot: number;   // at: the hole; rot: on the board
    type: 'smd' | 'th' | 'np' | 'connect';
    // Every layer the pad is drawn on, with its shape there: copper (per layer for pad stacks), the mask and paste
    // openings already grown or shrunk by the reader (lib/pcb/design/pads.ts growShape), and other layers it names.
    shapes: { layers: string[]; shape: PadShape }[];
    hole?: { d: number; slot?: { w: number; h: number }; plated: boolean };   // slot in pad coordinates
    maskMargin?: number; pasteMargin?: number; info?: Record<string, string> }[];   // info: pin function and type
  tracks: { layer: string; a: Pt; b: Pt; w: number; net: number; arc?: { c: Pt; ccw: boolean } }[];
  vias: { at: Pt; d: number; drill: number; from: string; to: string;
    layers: string[];                // the copper layers with a ring (unused ones removed)
    sizes?: Record<string, number>;  // other diameters per layer (via stacks)
    net: number; type: 'through' | 'blind' | 'buried' | 'micro';
    mask?: { top: boolean; bottom: boolean; margin: number } }[];   // where the mask is open over it
  zones: { layers: string[]; net: number; name?: string; outline: Contour[];
    fill: { layer: string; contours: Contour[] }[];   // as last filled and saved
    stroke?: number;                 // older KiCad: the fill is also stroked with this width
    keepout?: boolean; unfilled?: boolean; teardrop?: boolean; comp?: number; priority?: number }[];
  graphics: { layer: string; shape: { line: [Pt, Pt] } | { arc: { c: Pt; r: number; start: number; sweep: number } }
    | { circle: { c: Pt; r: number } } | { poly: Contour } | { curve: [Pt, Pt, Pt, Pt] };   // curve: cubic Bézier
    w: number; filled: boolean; dash?: 'dash' | 'dot' | 'dash_dot' | 'dash_dot_dot'; comp?: number; net?: number }[];
  texts: { layer: string; s: string;   // variables already replaced; KiCad's markup ^{…} _{…} ~{…} kept
    at: Pt; rot: number;             // anchor and angle as drawn (keep-upright applied)
    h: number; w: number; thick: number; mirror: boolean;
    just: { h: 'left' | 'center' | 'right'; v: 'top' | 'middle' | 'bottom' };
    italic?: boolean; bold?: boolean; lineSpacing?: number;
    font?: string;                   // a TrueType face; the stroke font stands in…
    outline?: Contour[];             // …unless the file stores the glyph outlines (KiCad's render cache), on the board
    knockout?: boolean; wrap?: number;   // wrap: a text box's column width
    comp?: number; role?: string }[];    // role: 'reference', 'value', 'user', 'field'
  holes: { at: Pt; d: number; slot?: { w: number; h: number; rot: number }; plated: boolean }[];
  stackup?: Stackup;
  placeOrigin?: Pt;                  // origin of drill and placement files (KiCad's aux_axis_origin; Altium: board origin)
  dash?: { dash: number; gap: number };  // dash and gap lengths in line widths (KiCad: 12 and 3)
  warnings: string[];
}
type PadShape = { k: 'circle' | 'rect' | 'oval' | 'roundrect' | 'chamfer' | 'trapezoid' | 'octagon' | 'custom';
  w: number; h: number; r?: number;   // r: corner radius (roundrect, and the corners of a chamfer that are not cut)
  chamfer?: { size: number; corners: ('tl' | 'tr' | 'bl' | 'br')[] };
  delta?: Pt;                         // trapezoid: KiCad's rect_delta (sides h ± delta.x and w ± delta.y)
  parts?: AperturePart[];             // custom: solid parts, their union is the pad
  offset?: Pt };                      // shape centre relative to the hole, pad coordinates
```

### Drawing

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

### Libraries

| Library | Use | Licence | Status |
| --- | --- | --- | --- |
| `fflate` | ZIP | MIT | Already a dependency |
| `altiumts` (exact version) | Altium | MIT; dependencies `cfb`, `adler-32`, `crc-32` (Apache-2.0), `transformation-matrix` (MIT) | Added in S5 |
| `@cantoo/pdf-lib` | PDF export | MIT | Already a dependency |
| Newstroke font, and KiCanvas's stroke font code | Text of design files | Font: CC0 1.0 (the README of the author's distribution: "Now released under CC0 licence, to give it right to be used in any project."); KiCanvas: MIT | Added in S3: the layout in `stroke.ts` adapted from KiCanvas commit b031159 (metrics corrected to KiCad 10). `lib/pcb/font/newstroke-glyphs.ts` is generated by a converter of our own (not in the repository; it follows the encoding of the author's `fontconv.awk`) from `symbol.lib`, `font.lib` and `charlist.txt` of the author's `newstroke-font.tgz` (https://vovanium.ru/_media/sledy/newstroke/newstroke-font.tgz, linked from https://vovanium.ru/sledy/newstroke/en; retrieved 2026-11-09, SHA-256 `dba1c334834e21bdbd15395dc610ecc2bf2eb6675ba0c4585597b375b7bd099e`). It replaced KiCanvas's copy of the glyphs, which came from KiCad's `newstroke_font.cpp` with KiCad's GPL-2.0-or-later header (KiCad's `LICENSE.README` does not list Newstroke, and its catch-all is GPL-3.0-or-later) and CJK glyphs under MIT and OFL-1.1. Never take glyphs from KiCad or KiCanvas: KiCanvas's `third_party/newstroke/` is KiCad's extended copy (another `font.lib` and `charlist.txt`, CJK libraries), not the author's release. The licence texts are in `lib/pcb/font/LICENSE.kicanvas.txt` and `LICENSE.newstroke.txt`; `scripts/collect-licenses.mjs` puts both on `/licenses` ("Font and code used by the PCB viewer") |
| Polygon booleans | Only if a step needs them (PDF/DXF flattening, EAGLE pours) | Must be permissive (e.g. a Clipper port under the Boost licence) | The first step that needs it chooses and records it here |

- **`altiumts` is ESM only,** so it is loaded with `await import('altiumts')` (CLAUDE.md, `"module": "node16"`), and
  only when an Altium file is opened. Version 0.0.95 reads both sample boards: the ASCII one in 59 ms and the binary one
  in 172 ms, with counts that match the file's own headers.
- **`altiumts` limits:** it does not read `PCB1_1.PcbLib`. Its own SVG writer puts a U+0001 character from a text
  record into its output, so strings from it must be cleaned.

## Steps

Each step is done by one agent, from reading to commit (see "Running a step").

Status: ✅ done · 🔄 in progress · 📋 planned

| Step | What | Status | Commit |
| --- | --- | :-: | --- |
| S1 | Viewer shell and Gerber | ✅ | 7f75723 |
| S2 | Drill files, realistic view, measuring, PNG and SVG export | ✅ | bf8c4ef |
| S3 | KiCad boards and footprints, design model, stroke font | ✅ | c679764 |
| S4 | Inspect, highlight, search; BOM and pick-and-place export | ✅ | |
| S5 | Altium | 📋 | |
| S6 | PADS ASCII | 📋 | |
| S7 | EAGLE | 📋 | |
| S8 | PDF and DXF export; pick-and-place CSV over Gerbers | 📋 | |
| S9 | KiCad export | 📋 | |

### S1 – Viewer shell and Gerber

- **Page** `/pcb-viewer/main`, with a card on the main page (`TOOLS` in `pages/index.tsx`, icon in
  `components/Home/ToolIcon.tsx`). README.md and CLAUDE.md list the tool.
- **Opening files:** file picker, folder picker and drag and drop. ZIP archives are expanded, including nested folders.
  The file list shows each file with its recognised type, or why it is ignored or not supported (yet).
  - Gerber, drill, job and CSV files opened together form one board, and "Add files" adds to it.
  - Opening a design file replaces the board.
- **Recognition by content** for every format in this plan. Formats of later steps say "not supported yet".
- **`lib/pcb/model.ts`:** the artwork part.
- **Gerber parser and plotter:** the whole current specification, plus the deprecated commands older files still use.
  X2 attributes are kept: the file function and polarity on the layer, object attributes (`%TO.N`, `%TO.P`, `%TO.C`)
  in `Board.objects`.
- **Layer identification,** in this order:
  1. X2 file function.
  2. `.gbrjob`.
  3. File names from KiCad, Altium/Protel, EAGLE/Fusion, OrCAD/Allegro, DipTrace, EasyEDA/JLC and PADS (as Linear's
     `L1.pho`, `TS.pho`, `BM.pho`, `FAB.pho`).

  The user can change a layer's type, side and order.
- **`.gbrjob`:** layer order, thickness, mask and silkscreen colours, and finish go into `Board.stackup`.
- **Layer view** (see Drawing):
  - each layer in its own colour, with show and hide, colour and opacity;
  - pan, zoom at the cursor, pinch, fit and view from the bottom;
  - the coordinates under the cursor, in mm or inch.

**Done when:** the ARTIFICER Gerbers (the folder and `gerbers_v2.zip`) and `DC2637A-1-GBR.ZIP` open with every layer
identified, and every layer looks right in screenshots. Compare ARTIFICER with `kicad-cli pcb export svg` of its
`.kicad_pcb`. Gerbers exported from the large KiCad demo stay usable, and the page works at phone width. Drill files
are recognised and listed but drawn in S2.

**Notes from S1:**

- Checked against Ucamco's test files (gerber-layer-format-test-files.zip, with reference PNGs: polarities, macros
  with holes over a grid, blocks in four orientations, nested blocks, primitives 20 and 21), its two fabrication
  examples, and small files for G74 arcs, IPNEG, MI/SF/OF/IR, trailing-zero incremental inch, draws with rectangles,
  rectangular holes, primitives 2, 22, 6 and 7, step and repeat closed by `SRX1Y1` or the end of file, and
  coordinates without an operation code. ARTIFICER matches `kicad-cli pcb export svg` layer by layer.
- Identification: X2 "Other,…" is weak, so a name like `F_Courtyard` or `Margin` wins over it. Without X2 or a job
  file, inner layers with their own names and `.gbr` extensions (KiCad `--no-protel-ext`) cannot be ordered; they
  come in name order and the user reorders them. Protel extensions (`.g1`…) and `In2_Cu`, `L2`, `ly2` give the order.
- The deprecated `AS` is ignored as the specification allows (warning on `AYBX`). Rectangular holes of standard
  apertures turn with the flash (the old specification said they do not). Arcs drawn with a non-circular aperture are
  approximated by sweeps along short chords. `IPNEG` is approximate (see Drawing).
- Format recognition also covers files that are not read: ODB++ (in a ZIP or `.tgz`), IPC-2581, IPC-D-356, KiCad
  legacy, PADS binary also when renamed (`DC2637A-1.txt`), EAGLE binary, Allegro, gEDA, DipTrace, EasyEDA, Protel
  ASCII, RS-274-D Gerber without apertures, other archives; schematics, PDFs, Office files (not expanded), reports and
  other text are listed as ignored. Opening a design file does not replace the board yet (there is no design reader
  in S1); `Workspace.tsx` marks the place.
- Gerber files that are drill data (X2 `Plated`/`NonPlated`) become drill layers drawn with their flashes.

**For S2:**

- **Excellon:** `detect.ts` returns `excellon` with status `later`; make it `read`, read it in `readFiles`
  (`load.ts`), and let `buildBoard` turn it into a `Layer` with `kind: 'drill'`, `plated` from the X2 comments, and
  `hole` items (`prepare.ts` already draws holes: circles, and slots as round-capped strokes). `LoadedFile` has
  `gerber?`/`job?`; add a drill result next to them. Gerber drill files could become `hole` items too.
- **Board shape:** compute `Board.outline` in `buildBoard` from the layer with `kind: 'outline'`; `centerlineBox` in
  `geometry.ts` gives its size without line widths (the Board card uses it).
- **Realistic view:** `BoardView` (`view.ts`) keeps one canvas per visible layer with the layer's coverage in alpha;
  `composite()` is where a second mode would combine them (substrate, copper under mask, mask openings, silk) instead
  of stacking them with opacity. `drawOrder()` gives the order seen from the top or the bottom.
- **Measuring:** every pointer press starts a pan now; a measure tool needs a click (press and release without
  moving) to place points. `boardPoint(x, y)` turns CSS pixels into board millimetres, `onCursor` reports the point
  under the mouse (or the first touch).
- **Export:** `getView()` gives the view for "what is on screen"; drawing the whole board at another resolution needs
  a method that runs `drawLayer` into a canvas of its own with its own view.

### S2 – Drill files, realistic view, measuring, PNG and SVG

- **Excellon parser:**
  - header: units, zeros, format, and the X2 comments of KiCad and Altium;
  - tools, drill hits, slots (`G85`) and routed slots (`G00`–`G03` with `M15`/`M16`), repeats, incremental mode;
  - files without a header: guess units and format by fitting the holes to the pads of the copper layers, and let
    the user correct units, digits and zero suppression.
- **Board shape** from the outline (profile) layer: join segments and arcs into closed loops, giving the edge and its
  cutouts. If there is no outline, use the extent of the copper.
- **Realistic top and bottom views:**
  - substrate, copper under the mask, exposed copper in the finish colour, mask with its openings, silkscreen, and holes
    through everything;
  - colours from the job file or stackup, else defaults;
  - the user can choose the mask (green, red, blue, black, white, yellow, purple), the silkscreen (white, black,
    yellow) and the finish (ENIG, HASL, bare copper).
- **Measure:** two clicks or taps give the distance, dx and dy, in mm and mil. It snaps to pad and hole centres and to
  line ends.
- **Export:**
  - PNG: what is on screen or the whole board, at a chosen resolution, with an optional transparent background;
  - SVG: visible layers as vectors, or the realistic view composited, with clear polarity done with masks. The SVG must
    be valid XML.

**Done when:**
- holes land on pads in both sample sets, including Linear's `DRILL.drl` after guessing;
- the realistic top and bottom look like the real boards (compare ARTIFICER with `kicad-cli pcb render`);
- measuring works with mouse and touch;
- PNG and SVG files open correctly.

**Notes from S2:**

- **Excellon** (`excellon.ts`): read once into a program with the numbers as written, then plotted with a
  `DrillFormat` (units, zeros left out, integer and decimal digits), so a format can be tried, guessed and corrected
  without reading the file again. KiCad's "suppress leading zeros" is `TZ` and "suppress trailing zeros" `LZ`; its
  `; FORMAT={2:4/ absolute / inch / …}` comment and Altium's `;FILE_FORMAT=2:5` give the digits; numbers that are all
  as wide as int + dec need no zeros mode. Plating comes per tool from KiCad's `TA.AperFunction` comments
  (`MixedPlating` files) and Altium's `;TYPE=PLATED`/`NON_PLATED`, else from the file's X2 function or its name
  (`NPTH`, `NonPlated`…), else plated; a file with both gets `plated: undefined`. R repeats are spacings from the
  last hole; routed paths cut only with the tool down (M15), unless the file never uses M15. Checked with every
  `kicad-cli pcb export drill` variant of ARTIFICER (units, zero formats, minimal header, Gerber format) and ecc83
  (slots routed and with G85, separate PTH/NPTH), and with small files for Altium and EAGLE headers, R, G85, G02/G03
  with I/J and A, G91, M25/M01/M02 patterns and G93.
- **Guessing a format** (`drill.ts`): the candidates the file leaves open (units also from the tool sizes; zeros from
  how the numbers are written) are each plotted for up to 400 holes and scored by how many land within the radius of
  a pad, via or track end of the outer copper layers (`points.ts`); the most likely candidate wins ties. Linear's
  `DRILL.drl` comes out inch, 2.4, trailing zeros left out, with all 569 holes on pads; KiCad's `--excellon-min-header`
  file (`INCH,TZ` only) gives 2.4 too. A guess is said in the Board card, the layer row and the file list, and the
  layer's settings correct units, zeros and digits ("Use the file's format" goes back). The guess is redone only when
  the copper layers change.
- **Gerber drill files** become holes in `buildBoard`: round flashes are holes and lines with round ends slots;
  other items stay.
- **Board shape** (`outline.ts`): lines and arcs of the first outline layer are joined end to end with a tolerance of
  half the line width (2 µm to 0.1 mm), loops that stay open by up to 0.5 mm are closed with a warning, regions and
  full circles are loops of their own, and nesting decides the direction (edge, cutout, island in a cutout). Without
  an outline layer, the same closed loop drawn on at least two layers is the board (Linear's PADS Gerbers all carry
  the 3.2 × 3.2 inch frame, while their title block lies outside it); else the copper's rectangle. Loops are cached
  per layer. Text on an outline layer that forms closed loops (an "O") would become a cutout.
- **Realistic view:** colours in `colors.ts`; the job file's names map to them (`maskFromName`, `silkFromName`,
  `finishFromName`), finish "None" and unknown give ENIG as KiCad's 3D view shows them. Compared with
  `kicad-cli pcb render` (orthographic, top and bottom; it always draws the 3D models): the same board, holes and
  colours, except that KiCad draws mask over copper darker and over substrate olive, where ours is lighter over
  copper, as real green boards look. The large demo switches between the views by compositing only (its layer
  canvases are reused).
- **Measuring** (`Measure.tsx`): snaps within 10 px (mouse) or 22 px (touch) to the nearest pad or hole centre
  (preferred, distance × 0.6) or line or arc end of the layers in the picture; the mouse shows the snap target. The
  point index of a layer is built the first time it is needed: on the large demo the first hover took about 30 ms,
  later ones fit in a frame. Escape clears, a second Escape stops.
- **Export:** PNG of the screen (device pixels) or of the whole board in 1024-pixel tiles at 10–80 px/mm, up to
  16,384 pixels a side and 100 Mpx, with progress and Cancel and the resolution in a pHYs chunk. SVG is in mm at 1:1
  (Y negated, X too from the bottom): one group per shown layer (an Inkscape layer); layers with clear items or a
  negative image are a coloured rectangle through a luminance mask of their runs; flashes are `<use>` of aperture
  paths (apertures with odd clear parts carry their own mask); the realistic SVG composes masks for copper, silk,
  openings, "covered" and the board minus holes. Aperture paths need `stroke="none"`: a `<use>` inherits the run
  group's stroke, which drew every pad 1 mm too wide. All SVGs passed a strict XML parser (saxes) and were rendered in
  headless Edge, including Ucamco's polarity and macro test files, which match their reference images. Large demo:
  the PNG of the default layers (3,770 × 2,151) in 1.2 s, the layer SVG (15 MB) in about 0.1 s; the page never stopped
  answering for more than 40 ms. "What is on screen" also exists for SVG (the whole board is written, the view box
  crops it).
- **Harness** (`…\scratchpad\pcb\harness\`): `drive.mjs` runs a list of actions (buttons, selects, wheel zoom,
  clicks, CDP taps, drags and pinches, element and page shots, downloads with progress); `drill-test.mjs` builds
  boards in Node and reports drill formats, holes on pads and the board shape; `loops-test.mjs` lists the loops of
  every layer; `xmlcheck.mjs` checks SVGs with saxes. Waiting for `[role=alert]` also matches Next.js's route
  announcer; wait for `ul[aria-label="Layers"]` instead.

**For S3:**

- **Realistic view, measuring and exports use only layers**, chosen by kind and side: give the design builder's
  layers the right `kind`/`side` (copper top and bottom, `mask` layers that draw the openings as Gerber does, `silk`,
  `drill` with `hole` items, plated per hole, slots with `to`), and set `Board.outline` from `Design.outline` with
  `outlineFrom: 'design'` instead of calling `boardShape` (`buildBoard` in `load.ts` does that for Gerber sets).
- **Snapping** finds flashes, holes and line ends: pads as flashes of apertures (not regions) and tracks as lines let
  measuring snap to pad centres and track ends.
- **Stackup colours:** `Board.stackup.mask`, `silk` and `finish` are mapped to the realistic colours by name in
  `colors.ts`; KiCad's stackup names (and colours given as `#RRGGBB`) can go there.
- **A reader that knows a layer's kind** passes it to `identifyLayers` through `fixed` (as Excellon files do), and
  user overrides still win.

### S3 – KiCad boards and footprints, design model, stroke font

- **S-expression reader.** `.kicad_pcb` from KiCad 4 to 10:
  - `module`/`footprint`, `fp_text`/`property`, `gr_*`, `segment`, `arc`, `via`, and `zone` with `filled_polygon`;
  - pads of every shape, including custom, oval drills and layer wildcards;
  - mask and paste margins at board, footprint and pad level;
  - the layer table with user names, and the stackup.

  Also `.kicad_mod`. Things left out (tables, dimensions, images) go into the backlog.
- **The design part of the model,** and the builder in `lib/pcb/design/` that turns a `Design` into layers:
  - copper; mask and paste openings; silkscreen, fab, courtyard and outline; drill;
  - it also fills `Board.objects` and `Board.placements`.

  All design formats use this builder.
- **Stroke font** (newstroke) for all text, with its notices on `/licenses`.
- **The realistic view** uses KiCad's stackup colours.

**Done when:**
- the ARTIFICER `.kicad_pcb` matches its own Gerbers (side by side or overlaid) and `kicad-cli pcb export svg`;
- several KiCad demos open, including the large one, with text in the right place and size.

**Notes from S3:**

- **Reading** (`lib/pcb/kicad/`): `sexpr.ts` reads the file one top-level item at a time, skips lists the viewer
  never needs (`uuid`, `tstamp`, `model`, `embedded_files`, `image`, `generated`, `teardrops`, `path`), reads numbers
  only in coordinate lists (`xy`, `start`, `at`, `size`…; atoms elsewhere stay strings, so pad "01" stays "01") and
  interns short symbols. The large demo (`jetson-agx-thor-baseboard.kicad_pcb`, 88.7 MB, KiCad 9): text decoding
  66 ms, tokenising 0.42 s, reading into a `Design` 0.66 s and building the layers 0.25 s in Node; in the page about
  1.7 s from opening to the first picture, with progress in the status line and a pause every 30 ms, so the page
  keeps answering. About 990,000 items and some 430 MB of JS heap after opening ([BL9](BACKLOG.md)).
- **Versions** (checked with the demos of KiCad 4.0.7, 5.1.12, 6.0.11, 7.0.11, 8.0.9 from KiCad's repository, the
  KiCad 9 and 10 demos, ARTIFICER, and KiCad's QA boards): layers are matched by canonical name, through the table's
  numbers when a table names a copper layer only by the user's name (KiCad 4 and 5: "Composant", "top_layer"; file
  version 3 uses the numbering of 2013, top 15, bottom 0); KiCad 9's renumbering needs nothing since its tables use
  canonical names. Nets by number (net table) or by name (KiCad 10). Arcs as centre, start and angle (clockwise on
  screen) before 20211014, start, mid, end since. `(width)` and `(stroke)`. Polygons always filled before 20201114.
  `fp_text`, then `property` (KiCad 8); `hide` and `unlocked` as atoms or `(… yes)`. Overbars `~text~` before
  20210606. Zone fills stroked with `min_thickness` before KiCad 6 (or `filled_areas_thickness yes`). KiCad 4 and 5
  vias without a drill take it from their net's class (`net_class … add_net`) or the setup. Pads that list silkscreen
  or fabrication layers (older footprints) are drawn there too, as KiCad plots them. Via tenting from the plot setting
  `viasonmask` (KiCad 4 to 8), the board's `(tenting front back)` (KiCad 9) or `(tenting (front yes) …)` (KiCad 10),
  per via overriding only the sides it names. Margins written as 0 mean "not set" before 20240201.
- **Angles:** pad angles and footprint text angles in the file are the angles on the board (the footprint's rotation
  included) in every version; footprint text keeps its angle in (−90°, 90°] unless unlocked. Zones in footprints are
  written relative to the footprint in some KiCad 9 files and on the board in others (both in demos): the reader
  takes the reading that puts the zone nearer the footprint.
- **Pads** are drawn as KiCad plots them: a rectangle grown by m becomes a rounded rectangle of radius m, a rounded
  rectangle keeps r + m, other polygons and custom shapes get round corners (polygon, a rectangle per side and a
  circle per corner, all solid parts of one aperture); a negative margin takes at most half the pad (the box of the
  parts for custom pads, whose `size` is only the anchor); paste margin plus ratio × size per axis; an NPTH pad no
  larger than its round or oval hole has no copper; an oval drill is a slot along the pad's longer axis, turned with
  it. `remove_unused_layers`: inner rings only where a track ends on the pad, `zone_layer_connections` says so, or
  (files before 20221018) a same-net zone fill covers the pad; outer rings only with `keep_end_layers`. KiCad 9 pad
  stacks (`front_inner_back`, `custom`) and via stacks give the copper per layer; in KiCad's own QA board of a 9.0
  development version, "custom" stacks are plotted without the board's mask margin, which we apply.
- **Text** is laid out by `lib/pcb/font/stroke.ts` (from KiCanvas) in KiCad's internal units, and was checked against
  `kicad-cli pcb export gerbers` of test boards to the micrometre: justification, rotation, mirroring, several lines
  (a final newline adds no line), bold, italic, sizes with w ≠ h, the stroke clamped to a quarter of the glyph,
  sub- and superscript, overbar, knockout and text boxes (wrapped at spaces). KiCad 10 differs from KiCanvas: glyphs
  2/21 of the height lower, lines 1.61 heights apart, overbar at 1.23 heights, sub- and superscript at 0.8 of the
  size and 0.15 or 0.35 of it down or up, spaces as wide as the font's space glyph (16/21), italic advance without the
  slant, stroke text moved t/1.52 inwards from its justified side and 0.052 t up, the knockout box h/9 around the
  letters (with half the stroke), text box margins counted from the outer edge of the border. Tab stops still differ
  (rare). TrueType text uses its render cache (glyph outlines in the file, on the board); kicad-cli on this machine
  draws such text with another font when the face is missing (RoyalBlue54L's "Ubuntu Sans"), so those differ.
  Variables: `${REFERENCE}`, `${VALUE}`, `${LAYER}`, `${FOOTPRINT_LIBRARY}`, `${FOOTPRINT_NAME}`, fields,
  `${NET_NAME(n)}`, `${SHORT_NET_NAME(n)}`, `${PIN_NAME(n)}`, `${PIN_TYPE(n)}`, the title block, board
  properties, `${FILENAME}`, `${PROJECTNAME}`, `${CURRENT_DATE}`, and KiCad 5's `%R` and `%V`. Text variables of the
  project file (`.kicad_pro`) are not read and stay as written.
- **Glyphs** come from the Newstroke author's CC0 release (see Libraries; changed after S3, 2026-11-09), U+0020 to
  U+2BFF. Against the KiCad glyphs that S3 had copied from KiCanvas: 2,529 code points identical; U+007E "~" differs
  (the author's tilde sits 11/21 of the glyph height higher than KiCad's); U+2126 OHM SIGN is only in KiCad's (a box
  here; boards use U+03A9 Ω, which is identical); 43 phonetic modifier letters (U+1D80 to U+1DBC) are only in the
  author's, where KiCad draws a box (six of them are a box with a mark, as `fontconv.awk` makes them when a small
  letter is missing from the library); KiCad's CJK glyphs (U+3000 to U+30FF, U+4E00 and up) are left out, and every
  character after U+2BFF is drawn as "?" ([BL17](BACKLOG.md)). Checked: no stroke text on the silkscreen and
  fabrication layers of ARTIFICER and the 19 KiCad 10 demo boards uses a changed glyph (the one "~" is overbar
  markup), and ARTIFICER (silkscreen against its own Gerbers, silkscreen and fabrication against `kicad-cli`) and
  `tinytapeout-demo` (635 texts) give the same diff images before and after, pixel for pixel; ARTIFICER's silkscreen
  still differs only by the QR code.
- **Dashed lines** as KiCad plots them: dash (12 − 1) w, gap (3 + 1) w, dot 0.2 w with round ends, from the plot
  settings; each side of a rectangle or polygon starts the pattern again; circles run clockwise on screen from 0°.
- **Builder** (`lib/pcb/design/build.ts`): per layer, knockout text first (its letters are clear items, so they erase
  only its box), then zones (fill as saved; the outline, 0.1 mm, of a zone never filled, with a warning), graphics,
  tracks, vias, pads, text. Pads and vias are flashes; apertures are shared per layer by shape. Rule areas go to a
  layer of their own ("Rule areas", kind `keepout`, hidden at first). Drill layers: plated holes, non-plated holes,
  and one per span of blind and buried vias, with an X2-like `.FileFunction` (`Plated,1,4,Blind`) so the realistic
  view's `drillReaches` works. Layers without items are left out, except copper and solder mask (the realistic view
  needs to know there is a mask). The board shape is `Design.outline` (`outlineFrom: 'design'`), made from the
  outline graphics by `design/outline.ts` with the joining rules of `outline.ts`; without one, `boardShape`.
- **Opening** (`load.ts`, `Workspace.tsx`): a design file replaces the board (also from "Add files"); Gerber, drill
  and job files opened with it or added later are listed as "Not used", and so are other design files. Among several,
  the board file wins over footprints, then files not in an archive, not in `*-backups`, `.history`, `backup`, `old`
  or `archive` folders, nearer the top, next to a `.kicad_pro` of the same name. The ARTIFICER project (board, backups
  as ZIPs, a `.history` copy, its Gerbers and 51 footprints) picks the right board. The board card shows the format,
  components and nets; the realistic view takes mask, silkscreen and finish from the stackup (names, and `#RRGGBB`
  colours mapped to the nearest choice).
- **Verification** (harness in `…\scratchpad\pcb\harness\`): `s3-refs.mjs` makes reference Gerbers and drill files
  with `kicad-cli`; `s3-compare.mjs` renders two boards (a Gerber set and a design) layer by layer with the same
  frame in headless Edge and counts differing pixels (diff images: red only in the reference, green only in ours);
  `s3-cmpall.sh` runs it for every demo; `s3-textboard.mjs` and `s3-textcmp.mjs` compare text boxes to the
  micrometre; `s3-read.mjs` reads boards in Node and reports counts and timings; `s3-survey.mjs` lists the
  vocabulary of files. ARTIFICER against its own Gerbers and fresh `kicad-cli` ones: copper (6 layers), mask, paste,
  outline, silk bottom and fab 0.00 to 0.02 % (edge pixels), drills 0.03 to 0.3 %; silk top differs only by the QR
  barcode ([BL12](BACKLOG.md)). The 14 other demos and 30 copies of six demos in the KiCad 4 to 8 formats stay within
  edge pixels (under 1.5 %, mostly round and oval pad edges, which KiCad approximates with polygons), apart from
  TrueType text (above), RoyalBlue54L's vias with a drill of 0.00001 mm, and the minimum mask web of KiCad 5 boards
  ([BL15](BACKLOG.md)). Measuring snaps to pad centres; phone layout, pinch and pan work.

**For S4:**

- **Objects of a design board** (`Board.objects`, items carry `obj`): one per pad (`net`, `component`, `pin`, `info`
  with the pin function and type, `design` → `Board.design.pads[i]` with shapes, hole and margins), one per via
  (`info`: size, drill, layers, type), one per zone (`zone`, `teardrop`, `rule area`), one per component (shared by
  its graphics and text; `info`: value, footprint), one per net for tracks (`track`) and for board graphics
  (`graphic`), and one for all board text. Highlighting a net means the items whose object has that `net`: tracks,
  arcs, vias, pads, zones and copper graphics on every layer, the drill layers included.
- **Placements:** `ref`, `value`, `footprint` ("library:name"), `at` (the footprint origin, Y up, as KiCad's position
  files write it), `rot` (the footprint orientation as in the file; bottom footprints too, unconverted), `side`,
  `attrs` (`dnp`, `exclude_from_bom`, `exclude_from_pos_files`, `board_only`, `type` smd or through_hole; KiCad 5's
  `virtual` sets the first three) and `fields` (properties other than Reference and Value, such as MPN, LCSC,
  Datasheet). Compare the export with ARTIFICER's `assembly/POS.csv` for the sign of bottom rotations.
- Gerber sets keep their X2 objects as before; `BoardObject.design` is only set for design boards.

**For S5 to S7 (feeding the builder):**

- Produce a `Design` and add the format to `openDesign` (`design/open.ts`), `DESIGN_FORMATS` (`load.ts`) and the
  status `read` in `detect.ts`; `buildDesignBoard` does the rest.
- Pads: `shapes` lists every layer with its shape. Make mask and paste openings with `growShape` from Altium's and
  EAGLE's rules (Altium's tenting means no mask entry); PADS gives shapes per layer directly. Use `PadShape` kinds
  (`octagon` exists for EAGLE and Altium); custom outlines as `parts` (solid, counter-clockwise).
- Text uses KiCad's model: anchor, justification, angle, mirror, glyph height and width, stroke width. Convert each
  format's anchor and size rules to it; set `font` for TrueType text (the stroke font stands in).
- `outline` from the format's outline lines with `outlineFromGraphics`, or given contours.
- Negative planes (`DesignLayer.plane`, Altium internal planes and PADS CAM planes) are not drawn yet: the builder
  needs a dark region of the board shape first on that layer, then the clearances as clear items (S5/S6).
- Zones: `fill` is what is drawn; EAGLE polygons without a computed pour can give their outline with `unfilled`.

### S4 – Inspect, highlight, search; BOM and pick-and-place export

- **Click or tap an item** to see what it is, with its net, component, pin, size, layer and drill. This works for design
  files and for Gerbers with X2 object attributes.
- **Highlight** a net (from a click or a searchable list) on every layer, or a component.
- **Search** components by designator or value, with lists of components and nets.
- **Export** for design files:
  - BOM CSV, grouped by value and footprint;
  - pick-and-place CSV: designator, value, footprint, x, y, rotation and side, in mm, with a choice of origin.

**Done when:**
- on the ARTIFICER board, clicking pads gives the right net and pin;
- a highlighted net covers tracks, pads, vias and zones on every layer;
- the pick-and-place export matches `assembly/POS.csv` (mind origin and sign conventions).

**Notes from S4:**

- **Clicks** (`hits.ts`, `inspect.ts`, `components/PcbViewer/Inspect.tsx`): a click or tap that does not pan (S2's
  `onTap`) is looked up within 3 px (mouse) or 8 px (touch) on the layers of the picture from the top down
  (`BoardView.inspectLayers`: the shown layers, with solder mask and paste openings after the others because the
  copper under them says more; in the realistic view holes, silkscreen, copper, mask, outline). While measuring, clicks
  measure. Per layer, a grid of the item boxes (about one item per cell; items over more than 64 cells in a list of
  their own) is built on the first click on the layer. Distances are exact for lines (round and square ends), arcs,
  flashes (in aperture coordinates; a hole in a pad counts as the pad), regions (non-zero winding, arcs in 3° steps)
  and holes; a clear item that covers the point hides what is under it on its layer. Within a layer, items on the
  point come first, pads and holes before lines before regions (a click on a pad finds the pad, not the track end
  drawn over it or the zone under it), then items near the point by distance. The items of one object are one entry
  (a pad's copper, openings and hole), except the objects a design shares per net (tracks, board graphics, board
  text), which are one entry per layer. On a design board, a click within the box of a component's pads that finds
  none of its items (between the pads of a 0402) also gives the component, after what is on the point on its side's
  layers and before the inner layers and the other side; it is outlined with all its items in the picture. Clicking
  the same spot again steps to the next entry (also ‹ ›) while the picture has the same layers; a new mode or side
  closes the panel. Escape closes the panel, a second one clears the highlight.
- **Checked:** every one of ARTIFICER's 1,071 pad clicks (pad centres on F.Cu and B.Cu) finds the pad with its net,
  component and pin as the first entry on the `.kicad_pcb`, and as an entry on its Gerbers (as the first in 871; the
  other 200 are vias in pads, drawn over the pad); on the large demo 4,853 of 4,853, board and Gerbers (KiCad writes
  `N/C` as the net of unconnected pads). KiCad's Gerbers write the `*` of `REF**` in X2 values as a `\uXXXX` escape
  (code 002A); the Gerber reader now decodes such escapes. Linear's Gerbers without X2 give the layer, file, aperture
  (D code and definition), size, width or position.
- **Speed** (large demo): indexing all 33 layers of the `.kicad_pcb` takes 114 ms in Node (78 ms for the 37 Gerber
  layers), a click then about 10 µs. In the page the first click answers in 60–80 ms, later ones in 20–40 ms.
- **Highlight:** `objectMask` marks the objects of a net, or of a component (a design's by its index, so the four H2 of
  ARTIFICER stay apart; Gerber sets by the `.C`/`.P` designator); `highlightLayers` takes their items per layer with
  the clear items after them, and for drill files without objects (Excellon) the holes within 10 µm of a highlighted
  copper flash. GND of the large demo (19,582 items on 15 layers) is collected in 40 ms; in the page that is one frame
  of about 125 ms, and redraws take 20–30 ms with the default layers (235 ms with all 38 Gerber layers, as without a
  highlight). PNG and SVG keep the highlight.
- **Lists:** components from `Board.placements` (Gerber sets: the `.C`/`.P` designators, values from `.CVal` where a
  file has them), nets with something on the board (Gerber sets: the `.N` values), with pad counts. Search puts exact,
  then leading, then contained designator or net matches before matches of values and footprints; 300 entries at most
  are listed. Picking one highlights it, closes the panel and zooms to its items on the layers in the picture (a
  component with 0.75 × its size around it; text on hidden fabrication layers can be far off).
- **Pick-and-place** (`lib/pcb/export/csv.ts`): `Designator,Val,Package,Mid X,Mid Y,Rotation,Side` as ARTIFICER's
  `POS.csv` (KiCad's CSV with JLC's column names), the bottom side first, then by designator in KiCad's order
  (`StrNumCmp`: numbers as numbers, other characters by code point), six decimals, angles in (−180°, 180°]. Identical,
  row by row and in order, to `kicad-cli pcb export pos --format csv --units mm` for ARTIFICER (with `--exclude-dnp`)
  and five demos, also with `--use-drill-file-origin` for the drill/place origin (`Design.placeOrigin`, read from
  `aux_axis_origin`). ARTIFICER's own `POS.csv`: its 265 rows are all equal; ours has 8 more, the board-only `REF**`
  via footprints, which the board got after `POS.csv` was made and kicad-cli 10 writes too. The third origin is the
  bottom-left corner of the box around the board shape.
- **BOM:** a line per value, footprint and part-number fields (field names with mpn, part, lcsc, jlc, manufacturer,
  mfr, mfg, digikey, mouser…), designators joined with commas in KiCad's order, the other fields where the whole line
  agrees, all text quoted (as `BOM.csv`); the value column is "Comment" as in the owner's file (JLC's and Altium's
  name). Against ARTIFICER's `BOM.csv` (made from the schematic): 51 of our 56 lines are identical; the rest differ
  where the board's fields differ from the schematic's (CN1, J2, RN1, Y1), by H2 ×4 (on the board, not in the
  schematic BOM) and U1 (DNP, left out here), and `BOM.csv` has SH1–SH4, which are not on the board.
- Both files are UTF-8 with a byte order mark (for Excel), CRLF lines, RFC 4180 quoting. `exclude_from_pos_files` and
  `exclude_from_bom` parts are always left out, DNP parts unless the box is unticked; board-only parts stay, as in
  KiCad.
- **Harness** (`…\scratchpad\pcb\harness\`): `s4-csv.mjs` writes both CSVs in Node and compares the pick-and-place file
  with reference files; `s4-hits.mjs` clicks every pad of a board and of its Gerbers and times the index and the
  highlights; `s4-drive.mjs` is `drive.mjs` with a calibration from the coordinate readout (`calib`, by taps on touch
  screens), clicks and taps at board coordinates (`clickat`, `tapat`), the panel's text (`panel`), list search and
  picks (`search`, `tab`, `pick`), and timed actions with the longest frame (`timed`, `timedclick`).

**For S5:**

- **Everything of S4 works from the builder's output:** give pads `num`, `net`, `comp` and `info.function` (the pin
  name, where Altium has one), components `ref`, `value` (Altium's Comment), `footprint` (the pattern, as
  "library:name" when the library is known), `attrs` (`dnp` for "Not Fitted"; `exclude_from_bom` for the component
  kinds Standard (No BOM), Mechanical, Graphical and Net Tie (No BOM)) and `fields` (the component parameters, which
  give the BOM its columns).
- **Angles of bottom parts:** `Placement.rot` is written as KiCad stores it: a bottom footprint is the library
  footprint flipped about its own X axis (Y negated), then turned by `rot`. Altium flips bottom components left–right
  (about the Y axis), which is the same as KiCad's flip turned by 180°, so its angle probably needs 180° added. Check
  with `kicad-cli pcb import --format altium`, then `pcb export pos`, on the samples, and with an Altium pick-and-place
  file if one can be found.
- **`Design.placeOrigin`:** Altium's board origin (the user origin of its pick-and-place files), in the coordinates of
  the design.

### S5 – Altium

- **`altiumts`**, pinned to an exact version and loaded only when an Altium file is opened. PcbDoc (binary and ASCII) is
  mapped to a `Design`:
  - the layer stack and mechanical layers with their names, the board outline and cutouts;
  - components and nets;
  - pads with their per-layer stacks: shapes, corner radius, round, square and slotted holes, plating, mask and paste
    expansion from rules and manual settings, tenting;
  - tracks, arcs, vias, fills and regions (copper, cutouts and polygon pours), and text;
  - internal planes, which are negative: drawn as the board shape minus clearances, with simple thermals.
- **TrueType text** uses the stroke font as a stand-in. If the font embedded in the file can be used (`EmbeddedFonts6`,
  perhaps the `LettersGeometry` stream), exact text is a bonus; otherwise add a backlog row.
- **`.PcbLib`:** read it if the record decoders of `altiumts` work on a footprint's streams, otherwise leave it in BL1.

**Done when:**
- both sample boards look like Altium's own print `PCB1_1.pdf`, and like KiCad's import
  (`kicad-cli pcb import --format altium`, then `pcb export svg`);
- components and nets can be inspected, and the BOM and pick-and-place exports work.

### S6 – PADS ASCII

- **Reader for PADS ASCII PCB files,** from PowerPCB V4.0 to current:
  - units: basic (1 mil = 38,100), mils, metric, inches;
  - `*PCB*`, `*TEXT*`;
  - `*LINES*`: board outline, copper, 2D lines, keepouts;
  - `*VIA*`;
  - `*PARTDECAL*`: pieces, terminals, pad stacks per layer, shapes, drills, slots;
  - `*PARTTYPE*`;
  - `*PART*`: placement, mirroring, labels;
  - `*ROUTE*`: signals with segments, arcs, vias, and teardrops where simple;
  - `*POUR*`: HATOUT copper, voids, thermals;
  - `*MISC*`: layer names and types; CAM documents are ignored.
- **CAM plane layers,** whose copper is not in the file, are drawn like Altium's internal planes.
- **A PADS binary `.pcb`** gets the message to export ASCII.

**Done when:**
- `DC2637A-1-LAYOUT-ASC.ASC` matches the Gerbers of the same design (`DC2637A-1-GBR.ZIP`), Linear's PDF prints, and
  KiCad's import (`kicad-cli pcb import --format pads`);
- parts and nets can be inspected.

### S7 – EAGLE

- **EAGLE XML `.brd`** (EAGLE 6 to 9, Fusion exports):
  - layers;
  - library packages: SMDs with roundness, pads with their shapes, holes, wires with curves, circles, rectangles,
    polygons, text;
  - elements, with rotations like `R90`, `MR180` or `SR`, and smashed attributes;
  - signals: wires, vias, polygons;
  - plain items;
  - design rules: pad and via restring, mask and cream;
  - the outline from layers 20 and 46;
  - EAGLE's vector font, drawn with the stroke font.
- **Polygons:** EAGLE stores only their outlines, not the poured copper. Compute an approximate pour (outline minus
  clearance to other nets, orphans removed) if a permissive polygon-boolean library is chosen. Otherwise draw the
  outline hatched and add a backlog row.
- **EAGLE binary** (before 6.0) gets a clear message.

**Done when:** two or three public EAGLE boards look like their Gerbers and like KiCad's import
(`kicad-cli pcb import --format eagle`).

### S8 – PDF and DXF export; pick-and-place CSV over Gerbers

- **PDF at exactly 1:1:**
  - chosen layers composited, or one page per layer;
  - page size A4, A3, Letter or fitted to the board; mirrored for the bottom;
  - a title with the file and layer names, and a scale bar.

  Vectors throughout. Layers with clear polarity are flattened with polygon booleans or embedded as a high-resolution
  image, and the dialog says which.
- **DXF** (ASCII, mm):
  - the board outline and holes, for mechanical CAD;
  - or chosen layers: lines as polylines with width, arcs as arcs, regions as closed polylines.
- **Pick-and-place CSV over a Gerber set:**
  - KiCad, Altium and JLC formats, with column mapping for others;
  - designators and markers on the board, a component list with search, top and bottom.

**Done when:**
- a 100 mm line measures 100 mm in the PDF (page coordinates);
- the DXF reads back with the right size (e.g. with `dxf-parser` in a scratch folder);
- ARTIFICER's `POS.csv` lands on its pads.

### S9 – KiCad export

- **Write `.kicad_pcb` from a design** (Altium, PADS, EAGLE):
  - layer stack and mapping: copper, silkscreen, mask, paste, fab, courtyard, Edge.Cuts, and mechanical layers to user
    layers;
  - nets;
  - footprints, with pads and graphics in footprint coordinates, reference and value;
  - tracks, arcs and vias;
  - zones, with outline, net and layer, and the stored fill;
  - board graphics, text and the outline.
- **Before saving,** a warning that the conversion may be incomplete or wrong and must be checked in KiCad.

**Done when:**
- the exports of the Altium (v1, v2), PADS and EAGLE samples open in KiCad 10: `kicad-cli pcb export svg` reads them
  without errors, and the SVG looks like our view;
- `kicad-cli pcb drc` runs on them (violations are expected, failures are not).

## Running a step

One agent per step, from reading to commit. It:

1. **reads** CLAUDE.md, this plan, the code of the earlier steps, and the 3D viewer
   (`pages/3d-viewer/main.tsx`, `components/Viewer3D/`) as the closest example of a tool page with a canvas, file
   opening, panels and a phone layout;
2. **does the step's scope.** If something does not fit, it finishes a coherent part and moves the rest to a later step
   or to [BACKLOG.md](BACKLOG.md);
3. **verifies** (below);
4. **updates** this plan (status table, notes, changes to the model), [BACKLOG.md](BACKLOG.md), README.md and
   CLAUDE.md where needed;
5. **commits once** on the branch `pcb-viewer`, in the commit style of CLAUDE.md:
   - it stages only its own files; the owner's uncommitted change to `.gitignore` stays out;
   - it restores `next-env.d.ts` after building;
   - it does not push;
6. **reports** what was done, what moved elsewhere, known problems, and what the next step must know.

## Verification

- **Types and build:** `npx tsc --noEmit`, then `npm run build`, then `git checkout -- next-env.d.ts`. Read new code
  against the static-export constraints in CLAUDE.md; a local build does not check them.
- **Look at the result:**
  - Run `npm run dev` (port 3020) and drive the page with `puppeteer-core` or `playwright-core`, using the installed
    Edge (`C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`) or Chrome
    (`C:\Program Files\Google\Chrome\Application\chrome.exe`).
  - Open test files through the file input, take screenshots and look at them.
  - Keep this tooling in a scratch folder, not in the repo's `package.json`. The owner allows running downloaded
    packages for this work.
  - Headless Edge can also screenshot a single SVG:
    `msedge --headless=new --screenshot=out.png --window-size=1600,1200 file:///C:/…/x.svg`.
  - S1's harness (in its scratch folder `…\scratchpad\pcb\harness\`; recreate it with `npm i puppeteer-core esbuild`
    in an empty folder): `shot.mjs` gives files to `input[type=file]:not([webkitdirectory])`, waits until
    `[role=status]` and `[aria-label="Drawing"]` are gone, and screenshots `div[class*="viewport"]` with the default
    layers, each layer alone (`--layers`, clicking None then one checkbox), the bottom view or a zoom (wheel events);
    `phone.mjs` does 390 × 844 with CDP touch events (pan, pinch); `perf.mjs` times redraws after wheel steps;
    `parse-test.mjs` and `detect-test.mjs` bundle `lib/pcb` with esbuild and run the parser or the recognition in
    Node; `svgshot.mjs` renders `kicad-cli` SVGs to PNG.
  - Ucamco's test files with reference images: `gerber-layer-format-test-files_en.zip` on ucamco.com (Downloads).
- **Compare** with the references in "Test files": `kicad-cli` output, `PCB1_1.pdf`, Linear's PDFs and Gerbers.
- **Phone width:** check a 390 × 844 viewport with touch emulation.

## Format notes

- **Gerber:** Ucamco's "Gerber Layer Format Specification" (free, ucamco.com) is the authority, including its chapter on
  deprecated commands (S1 used revision 2026.05: the image parameters apply in the order MI, SF, OF, IR, and MI and SF
  move coordinates only, not apertures). Ucamco's job file specification covers `.gbrjob`; KiCad writes `SolderPaste`
  and `SolderMask` there where its Gerbers say `Paste` and `Soldermask`. KiCad writes X2 object attributes: 1,271
  `%TO` in the ARTIFICER `F_Cu`. Linear's PADS Gerbers use `%IN`, `%MOIN`, `%FSLAX35Y35`, G74 and G75, coordinates
  without D01 after a D01, and define macros with exposure off (`ANN`, `ODD`, `TER`) without using them.
- **Excellon:** there is no single standard. Ucamco's XNC specification describes a clean subset. Linear's `DRILL.drl`
  starts with `%` and tool lines like `T1C.006F0S0`, with no `M48` header, inch, coordinates like `X02515Y0168`.
- **KiCad:** S-expression file formats at dev-docs.kicad.org (board and footprint). Y points down, so it is negated.
- **Altium:**
  - the types are in `altiumts`'s `dist/index.d.ts`, and KiCad's import-format notes explain the fields;
  - coordinates are in mil (in the ASCII format written as `4249.4417mil`);
  - internal planes are negative;
  - polygon pours are stored as regions and tracks owned by the polygon.
- **PADS ASCII:**
  - Mentor's "PADS ASCII Format Specification" (PADS 9.4: `Ppcb_ASCII.pdf` at freecalypso.org) and KiCad's
    import-format notes on PADS;
  - the DC2637A file is in the PowerPCB V4.0 format, older than Altium's importer accepts (5.2 and later).
- **EAGLE:** XML described by `eagle.dtd`. Polygons store only outlines.
- **Pick-and-place CSV columns:**
  - KiCad: `Ref, Val, Package, PosX, PosY, Rot, Side`;
  - Altium: `Designator, Comment, Layer, Footprint, Center-X(mm), Center-Y(mm), Rotation`, …;
  - JLC: `Designator, Mid X, Mid Y, Layer, Rotation`.
