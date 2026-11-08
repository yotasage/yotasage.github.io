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
| EAGLE | none yet | S7 finds two or three public EAGLE boards (e.g. Adafruit or SparkFun on GitHub, ideally with Gerbers) and keeps them in a scratch folder |

`kicad-cli` 10.0.6 (`C:\Program Files\KiCad\10.0\bin\kicad-cli.exe`) makes reference output: `pcb export
gerbers|drill|svg|pdf|pos|dxf|ipc2581|ipcd356`, `pcb render` (3D picture), and `pcb import --format altium|pads|eagle`,
which turns the Altium, PADS and EAGLE samples into KiCad boards as a second opinion. Write its output to a scratch
folder, never next to the test files.

## Architecture

| Part | Location | Notes |
| --- | --- | --- |
| Page | `pages/pcb-viewer/main.tsx` | Head, home link, global styles, as every page (CLAUDE.md) |
| UI | `components/PcbViewer/` | Viewer shell, canvas view, file list, layer panel, info panel, export dialog |
| Styles | `styles/PcbViewer.module.css` | |
| Model | `lib/pcb/model.ts` | See below |
| Loading | `lib/pcb/detect.ts`, `lib/pcb/load.ts` | Recognise formats by content, expand ZIPs, hand each file to its reader |
| Gerber | `lib/pcb/gerber/` | Parser and plotter → `Layer` |
| Gerber job, layer identification | `lib/pcb/gbrjob.ts`, `lib/pcb/identify.ts` | |
| Excellon | `lib/pcb/excellon.ts` | |
| Design → layers | `lib/pcb/design/` | Shared by all design formats (S3) |
| Stroke font | `lib/pcb/font/` | Newstroke (S3) |
| Design formats | `lib/pcb/kicad/`, `lib/pcb/altium/`, `lib/pcb/pads/`, `lib/pcb/eagle/` | Each produces a `Design` |
| Drawing | `lib/pcb/render/` | Layer view and realistic view on Canvas 2D |
| Exports | `lib/pcb/export/` | PNG, SVG, CSV, PDF, DXF, KiCad |

Flow: files → recognise → reader → `Board`. Gerber and drill files become layers directly. A design file becomes a
`Design`, which `lib/pcb/design/` turns into layers. Drawing and the PNG, SVG, PDF and DXF exports use only the layers;
the CSV exports use `Board.placements`; the KiCad export uses `Board.design`.

### Model (sketch)

S1 writes the artwork part, S3 the design part. Names and fields may change. Keep this section in step with the code.

```ts
// Units: millimetres. Y up (KiCad's Y is negated on reading). Angles: degrees, counter-clockwise from +X.
interface Pt { x: number; y: number }
interface Box { minX: number; minY: number; maxX: number; maxY: number }

// A closed outline of straight segments and circular arcs, from start back to start.
interface Contour { start: Pt; segs: { to: Pt; arc?: { c: Pt; ccw: boolean } }[] }

// What a layer looks like, in drawing order. A dark item adds; a clear one erases what is under it on that layer.
type Art =
  | { k: 'line'; a: Pt; b: Pt; w: number; cap: 'round' | 'square' }
  | { k: 'arc'; c: Pt; r: number; start: number; sweep: number; w: number }   // sweep > 0: counter-clockwise
  | { k: 'flash'; at: Pt; ap: number; rot: number; mirror: 'none' | 'x' | 'y' | 'xy'; scale: number }
  | { k: 'region'; contours: Contour[] }       // outer contours counter-clockwise, holes clockwise
  | { k: 'hole'; at: Pt; d: number; to?: Pt; plated: boolean };   // drill hit; `to` makes it a slot
type ArtItem = Art & { dark: boolean; obj?: number };   // obj: index into Board.objects

// A flash shape; parts in order, a part with dark: false erases earlier parts of the same flash only.
// Block apertures and step-and-repeat are expanded into items by the Gerber plotter.
interface Aperture { parts: { dark: boolean; circle?: { c: Pt; r: number }; poly?: Pt[] }[] }

type LayerKind = 'copper' | 'mask' | 'paste' | 'silk' | 'outline' | 'drill' | 'mechanical' | 'fab' | 'courtyard'
  | 'keepout' | 'other';
type Side = 'top' | 'bottom' | 'inner' | 'none';

interface Layer {
  id: string; name: string; kind: LayerKind; side: Side;
  copper?: number;                   // copper order: 1 = top … n = bottom
  negative?: boolean;                // drawn negative (Gerber image polarity, negative planes)
  plated?: boolean;                  // drill layers
  file?: string; attrs?: Record<string, string>;   // source file, X2 file attributes
  items: ArtItem[]; apertures: Aperture[]; bbox: Box;
}

interface BoardObject { kind: string; net?: string; component?: string; pin?: string; info?: Record<string, string> }
interface Placement { ref: string; value?: string; footprint?: string; at: Pt; rot: number; side: 'top' | 'bottom' }

interface Board {
  name: string; source: 'gerber' | 'kicad' | 'altium' | 'pads' | 'eagle';
  layers: Layer[];
  outline?: Contour[];               // board shape: the edge and its cutouts
  stackup?: { thickness?: number; mask?: string; silk?: string; finish?: string };
  objects: BoardObject[];            // what a click on an item reports (S4)
  placements: Placement[];           // components of a design, or from a pick-and-place CSV
  design?: Design;                   // design files only
  warnings: string[];
}

// Design files (S3). Layers are referred to by Design.layers[].id; nets by index (0 = no net).
interface Design {
  layers: { id: string; name: string; kind: LayerKind; side: Side; copper?: number; plane?: boolean }[];
  nets: string[];
  outline: Contour[];
  components: { ref: string; value: string; footprint: string; at: Pt; rot: number; side: 'top' | 'bottom';
    attrs: Record<string, string> }[];
  pads: { comp?: number; num: string; net: number; at: Pt; rot: number;
    shapes: { layers: string[]; shape: PadShape }[];          // per layer or group of layers (Altium pad stacks)
    hole?: { d: number; slot?: { w: number; h: number }; plated: boolean; offset?: Pt };
    mask?: { expand?: number; tented?: boolean }; paste?: { expand?: number } }[];
  tracks: { layer: string; a: Pt; b: Pt; w: number; net: number; arc?: { c: Pt; ccw: boolean } }[];
  vias: { at: Pt; d: number; drill: number; from: string; to: string; net: number; tented?: boolean }[];
  zones: { layers: string[]; net: number; outline: Contour[]; fill: Contour[][]; keepout?: boolean }[];
  graphics: { layer: string; shape: Contour | { line: [Pt, Pt] } | { arc: { c: Pt; r: number; start: number;
    sweep: number } } | { circle: { c: Pt; r: number } }; w: number; filled: boolean; comp?: number }[];
  texts: { layer: string; s: string; at: Pt; rot: number; h: number; thick: number; mirror: boolean;
    just: { h: 'left' | 'center' | 'right'; v: 'top' | 'middle' | 'bottom' }; font?: string; comp?: number }[];
  holes: { at: Pt; d: number; slot?: { w: number; h: number; rot: number }; plated: boolean }[];
}
type PadShape = { k: 'circle' | 'rect' | 'oval' | 'roundrect' | 'chamfer' | 'trapezoid' | 'octagon' | 'custom';
  w: number; h: number; r?: number; chamfer?: { size: number; corners: string[] }; delta?: Pt;
  poly?: Contour[]; offset?: Pt };
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

### Libraries

| Library | Use | Licence | Status |
| --- | --- | --- | --- |
| `fflate` | ZIP | MIT | Already a dependency |
| `altiumts` (exact version) | Altium | MIT; dependencies `cfb`, `adler-32`, `crc-32` (Apache-2.0), `transformation-matrix` (MIT) | Added in S5 |
| `@cantoo/pdf-lib` | PDF export | MIT | Already a dependency |
| Newstroke font, through KiCanvas's stroke font code | Text of design files | Font: CC0 1.0 amended with an MIT-like licence, some glyphs SIL OFL 1.1; KiCanvas: MIT | Added in S3, both notices on `/licenses` (a manual entry, like `occt-import-js`) |
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
| S1 | Viewer shell and Gerber | 📋 | |
| S2 | Drill files, realistic view, measuring, PNG and SVG export | 📋 | |
| S3 | KiCad boards and footprints, design model, stroke font | 📋 | |
| S4 | Inspect, highlight, search; BOM and pick-and-place export | 📋 | |
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
- **Compare** with the references in "Test files": `kicad-cli` output, `PCB1_1.pdf`, Linear's PDFs and Gerbers.
- **Phone width:** check a 390 × 844 viewport with touch emulation.

## Format notes

- **Gerber:** Ucamco's "Gerber Layer Format Specification" (free, ucamco.com) is the authority, including its chapter on
  deprecated commands. Ucamco's job file specification covers `.gbrjob`. KiCad writes X2 object attributes: 1,271
  `%TO` in the ARTIFICER `F_Cu`. Linear's PADS Gerbers use `%IN`, `%MOIN`, `%FSLAX35Y35` and macros with exposure off
  (`ANN`, `ODD`, `TER`).
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
