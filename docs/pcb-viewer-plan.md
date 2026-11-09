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
| Altium `.PcbDoc` (binary and ASCII), binary `.PcbLib` | Through `altiumts` (S5); ASCII `.PcbLib` is not read | S5 |
| PADS ASCII (`.asc`) | PowerPCB V4.0 to current | S6 |
| EAGLE `.brd` (XML, EAGLE 6 to 9, Fusion 360 exports), `.lbr` | Polygons approximated from their outlines (EAGLE stores no pour); libraries with the packages side by side | S7 |
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
| PADS ASCII | `C:\Users\Jonat\Downloads\DC2637A\DC2637A-1_post\DC2637A-1-LAYOUT-ASC.ASC` | `!PADS-POWERPCB-V4.0-BASIC!`, 4 routing layers, pours (HATOUT) included; layers 2 and 3 are mixed planes saved as outlines only (PLANEFLAGS OUTLINE), so their copper is not in the file |
| PADS binary | `…\DC2637A-1_post\DC2637A-1.PCB` | Same design, closed format (`DC2637A-1.txt` is a byte-identical copy) |
| PADS Gerbers | `…\DC2637A-1_post\DC2637A-1-GBR.ZIP` | From the same design: RS-274X `.pho` (L1–L4, TS/TM/TP, BS/BM/BP, FAB), `.rep` reports, `DRILL.drl` without a header (inch) |
| PADS prints, BOM | `…\DC2637A-1_post\DC2637A-1-PDF.ZIP`, `DC2637A-1.XLSX` | References |
| PADS footprint board | `…\DC2637A-1_post\LT3045-1EDD-LIBRARY.ZIP` | `05-08-1725-Rev-A.asc`: a V4.0 board with only the DFN-12 footprint |
| More PADS ASCII | `https://gitlab.com/kicad/code/kicad/-/raw/master/qa/data/pcbnew/plugins/pads/<folder>/<name>.asc` | KiCad's PADS importer test files, each with its LICENSE (MIT, BSD, CERN-OHL-W, GPL-3.0): V5.0 `MAIS_FC`, V2005 `LCORE_2`, V2007 `Dexter_MotorCtrl`, V9.0 `LCORE_4`, V9.4 `Ems4_Rev2` and `MC2_PLUS_REV1`, V9.5 `TMS1mmX19` (basic) and `MC4_PLUS_CSHAPE` (mils), V10.0 `ClaySight_MK1` and `issue23425/controlCARDDockingStation` (250-layer mode), and small ones (`issue*.asc`, `keepout_test.asc`); several folders also hold the binary `.pcb` of the same board ([BL4](BACKLOG.md)). S6 kept them in its scratch folder. None has a METRIC or INCHES file or a CAM plane |
| Altium ASCII | `C:\Users\Jonat\Downloads\Altium_KERALA_GF130_2026-06-27\KERALA_GF130\v1\PCB1.pcbdoc` | ASCII PcbDoc written by EasyEDA (`gge` ids, the board record in 11 parts on one line, no rules, no text boxes): 2,420 tracks, 376 pads, 714 regions, 5 polygons (not poured), 129 components; an earlier revision of v2. `kicad-cli pcb import` cannot read it |
| Altium binary | `…\KERALA_GF130\v2\PCB1_1.pcbdoc` | Binary PcbDoc (v1 opened and saved by Altium 20 or later): 2,580 tracks, 398 pads, 731 regions, 135 components, 35 rules; text in stroke font and Arial, Arial embedded; 5 polygons not poured; no planes, fills, rounded or octagonal pads, pad or via stacks, inverted text or 3D bodies |
| Altium library | `…\KERALA_GF130\v2\PCB1_1.PcbLib` | One footprint (QFN48_7x7, 41 pads); `altiumts` 0.0.95's `parseAltiumFile` rejects it, its primitive decoders read it record by record (S5) |
| Altium print | `C:\Users\Jonat\Downloads\Altium_KERALA_GF130_2026-06-27\PCB1_1.pdf` | Altium's own print of the v2 board |
| KiCad demos | `C:\Program Files\KiCad\10.0\share\kicad\demos\` | Many boards; `jetson-agx-thor-baseboard` is the large one for speed tests |
| KiCad 4 to 8 boards | `https://gitlab.com/kicad/code/kicad/-/raw/<tag>/demos/<demo>/<demo>.kicad_pcb` | The same demos as saved by the releases 4.0.7, 5.1.12, 6.0.11, 7.0.11 and 8.0.9 (file versions 3, 4, 20171130, 20210722, 20211014, 20221018, 20240108); S3 kept them in its scratch folder |
| KiCad QA boards | `https://gitlab.com/kicad/code/kicad/-/raw/master/qa/data/pcbnew/` | Pad stacks (`padstacks*.kicad_pcb`, `via_stacks`), `custom_pads`, `test_copper_graphics`, `tracks_arcs_vias`, `api_kitchen_sink` (barcodes, tables, text boxes; a KiCad 11 development version) |
| EAGLE 9.5.0, 2 layers | `https://gitlab.com/mutantcybernetics/mutantc-v1/-/raw/master/PCB/main_PCB/mutantC.brd` and `main_gerber_files.zip` beside it (GPL-3.0) | mutantC main board: 51 elements (43 on the bottom, smashed attributes), 2 polygons, 4 holes, octagon and long pads; Gerbers from EAGLE's CAM processor (`CAMOutputs/`) |
| EAGLE 9.3.1, 6 layers | `https://raw.githubusercontent.com/jankae/LibreVNA/13f37c5bf5bc24e1c65d8e11108d4abcfc4cd88d/Hardware/Eagle/VNA.brd` with `Gerber/CAMOutputs/` (GPL-3.0) | LibreVNA: 590 elements (19 on the bottom, angles like R225), 2,853 vias, 134 polygons with ranks 1 to 6 (a GND frame drawn as one polygon with a slit), SMDs with roundness, milled slots, tStop polygons, `VNA.mnt`/`.mnb` (EAGLE's position files); the board is the one the Gerbers of 2022-11-19 were made from |
| EAGLE 6.4, 4 layers | `https://raw.githubusercontent.com/ultimachine/RAMBo/46b47bc42b/board/RAMBo.brd` (the 1.2e commit) and `board/gerbers/RAMBo1-2e.zip` (RAMBo, RepRap) | 266 elements, 1,075 vias, 39 polygons and 82 cutout polygons on 4 layers, net classes with clearances, stop and cream frames that differ from the defaults (20 % and 10 %, a via stop limit of 25 mil); its Gerbers (RS-274X, inch, no X2) are offset by (62.408, 16.873) mm and name the inner layers `.G2L`, `.G3L` (`s7-compare.mjs --align --keys`) |
| Fusion 360 export (9.7.0), 2 layers | `https://raw.githubusercontent.com/stevenbennett/Open-Task-Light/main/Open Task Light/Electronics/Control Board/Source/Control Board.brd`, `control-board-gerbers.zip` and `Assembly/PnP_Control Board_*.csv` (MIT) | Open Task Light control board: 25 elements (5 on the bottom), 1 polygon, TrueType ("custom") fonts, Fusion's design rules; Gerbers from Fusion's CAM |
| EAGLE libraries, binary boards | `https://raw.githubusercontent.com/micropython/pyboard/master/eagle/rcl.lbr` (also `pinhead.lbr`, `pyboard.lbr`); Olimex's `OLINUXINO` repository (`HARDWARE/…/*.brd` are EAGLE 5 binary files) | S7 kept all of these, with `kicad-cli pcb import --format eagle` of the boards, in its scratch folder |

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
| Design → layers | `lib/pcb/design/` | Shared by all design formats (S3): `build.ts` the `Design` into a `Board` (S5: negative planes; S6: several planes per layer, plane areas with cuts, positive planes, zone lines, square vias; S7: the outline stroke of plane areas), `areas.ts` (S7, moved from PADS's `planes.ts`) areas as point lists, whether a stroke reaches one, distances, pad shapes as filled shapes, `pads.ts` pad shapes as aperture parts and grown or shrunk for mask and paste, `art.ts` graphics (dashes too) and text as items, `outline.ts` the board shape from outline graphics, `overrides.ts` the user's layer types on a design's board, `open.ts` the entry loaded with `await import` when a design file is opened |
| Stroke font | `lib/pcb/font/` | Newstroke (S3): `newstroke-glyphs.ts` generated from the font author's own CC0 release (see Libraries), `stroke.ts` layout adapted from KiCanvas, `LICENSE.kicanvas.txt` and `LICENSE.newstroke.txt` (read by `scripts/collect-licenses.mjs` for `/licenses`) |
| Design formats | `lib/pcb/kicad/` (S3: `sexpr.ts` reader, `layers.ts` layer names and wildcards, `board.ts` boards and footprints), `lib/pcb/altium/` (S5: `board.ts` boards and libraries through `altiumts`, `records.ts` fields, lengths, text and contours, `layers.ts` layer names and the stack, `rules.ts` rule scopes and the mask, paste and plane rules, `text.ts` text placement), `lib/pcb/pads/` (S6: `ascii.ts` header, units, sections, what each version writes differently and the `*MISC*` blocks, `layers.ts` levels, kinds, sides and the pairs a bottom part is mirrored with, `board.ts` the reader, `planes.ts` plane areas without a saved flood and CAM planes, `text.ts` text placement), `lib/pcb/eagle/` (S7: `xml.ts` a small XML reader, `layers.ts` layer numbers, kinds and the pairs a mirrored element swaps, `rules.ts` the design rules (restring, masks, roundness, shapes, elongation), `board.ts` boards and libraries, `pours.ts` polygons as plane areas with cuts, `text.ts` text placement) | Each produces a `Design` |
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
`Design.placeOrigin`, S5 added `Design.planes`, graphics with holes (`region`) and `knockoutMargin` of texts, S6 added
plane areas, cuts and positive planes (several per layer), `lines` of zones and square vias, S7 added `stroke` and `info`
of planes. Names and fields may change. Keep this section in step with the code.

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

// Design boards: one object per pad, via, zone ('zone', 'teardrop', 'rule area'), internal plane ('plane') and
// component (its graphics and text too), with `design` pointing at the entry; one per net for tracks, one per net for
// board graphics, one for board text.
interface BoardObject { kind: string; net?: string; component?: string; pin?: string; info?: Record<string, string>;
  design?: { list: 'pads' | 'vias' | 'zones' | 'components' | 'tracks' | 'graphics' | 'texts' | 'planes'; index: number } }
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
  format: string;                    // e.g. "KiCad 9 (format 20241229)", "PADS ASCII (PowerPCB V4.0, basic units)"
  layers: { id: string; name: string; kind: LayerKind; side: Side; copper?: number;
    plane?: boolean;                 // negative: the board shape in copper with everything on the layer cut out
    label?: string }[];              // KiCad: id is the canonical name ("In2.Cu"), name the user's ("GND1.Cu");
                                     // Altium: TOP, MID1, PLANE1, TOPOVERLAY… and the stack's names ("GND (1)");
                                     // PADS: L1, L2… by level and the layer data's names ("Silkscreen Top");
                                     // EAGLE: the layer number ("1", "16", "21") and the board's name ("tPlace")
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
    mask?: { top: boolean; bottom: boolean; margin: number };   // where the mask is open over it
    square?: boolean }[];            // a square pad of side d (PADS)
  zones: { layers: string[]; net: number; name?: string; outline: Contour[];
    fill: { layer: string; contours: Contour[] }[];   // as last filled and saved
    stroke?: number;                 // older KiCad, PADS pours: the fill is also stroked with this width
    lines?: { layer: string; a: Pt; b: Pt; w: number }[];   // copper drawn as lines (PADS thermal spokes)
    keepout?: boolean; unfilled?: boolean; teardrop?: boolean; comp?: number; priority?: number }[];
  graphics: { layer: string; shape: { line: [Pt, Pt] } | { arc: { c: Pt; r: number; start: number; sweep: number } }
    | { circle: { c: Pt; r: number } } | { poly: Contour } | { region: Contour[] }   // region: holes clockwise
    | { curve: [Pt, Pt, Pt, Pt] };   // curve: cubic Bézier
    w: number; filled: boolean; dash?: 'dash' | 'dot' | 'dash_dot' | 'dash_dot_dot'; comp?: number; net?: number }[];
  texts: { layer: string; s: string;   // variables already replaced; KiCad's markup ^{…} _{…} ~{…} kept
    at: Pt; rot: number;             // anchor and angle as drawn (keep-upright applied)
    h: number; w: number; thick: number; mirror: boolean;
    just: { h: 'left' | 'center' | 'right'; v: 'top' | 'middle' | 'bottom' };
    italic?: boolean; bold?: boolean; lineSpacing?: number;
    font?: string;                   // a TrueType face; the stroke font stands in…
    outline?: Contour[];             // …unless the file stores the glyph outlines (KiCad's render cache), on the board
    knockout?: boolean; knockoutMargin?: number;   // the box around the letters (default: a ninth of h)
    wrap?: number;                   // a text box's column width
    comp?: number; role?: string }[];    // role: 'reference', 'value', 'user', 'field'
  holes: { at: Pt; d: number; slot?: { w: number; h: number; rot: number }; plated: boolean }[];
  // Planes whose copper the file does not store (S5, S6, S7): the board shape (Altium internal planes, PADS CAM
  // planes) or a plane area (PADS mixed planes without a saved flood, EAGLE polygons) in copper, with its net, the
  // distance kept from the board edge, round clearances around holes that pass through without connecting, thermal
  // reliefs (a ring of width gap from diameter d out, interrupted by `spokes` copper spokes of width `width`, the first
  // at `angle`) and other cuts. Several can share a layer; later ones lie over earlier ones. Pads and vias do not list
  // negative plane layers.
  planes?: { layer: string; net: number; pullback: number; clearances: { at: Pt; d: number }[];
    thermals: { at: Pt; d: number; gap: number; spokes: number; width: number; angle: number }[];
    area?: Contour[]; name?: string; // a plane area instead of the board shape
    stroke?: number;                 // the area's outline drawn with this width too (EAGLE: its edge is a wire's centre)
    info?: Record<string, string>;   // more for inspection (EAGLE: rank, isolate, width)
    cuts?: { shape: DesignShape; w: number; filled: boolean }[];   // cut out too, drawn as graphics: cut-outs, areas
                                     // over it with the gap, other nets' copper grown by the clearance
    positive?: boolean }[];          // the layer's other items are copper over it (PADS), not cut out of it (Altium)
  stackup?: Stackup;
  placeOrigin?: Pt;                  // origin of drill and placement files (KiCad's aux_axis_origin; Altium's board
                                     // origin, ORIGINX/ORIGINY)
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
| `altiumts` 0.0.95 (exact version) | Altium | MIT; dependencies `cfb` 1.2.2, `adler-32` 1.3.1, `crc-32` 1.2.2 (Apache-2.0), `transformation-matrix` 2.16.1 (MIT), `fflate` (MIT, already a dependency); no install scripts | Added in S5. It declares `typescript ^5` as a peer dependency (only its build needs it), so `package.json` has `"overrides": { "altiumts": { "typescript": "$typescript" } }` for npm to install it with the site's TypeScript 7 (`npm ci` too). Loaded by `await import('altiumts')` in `lib/pcb/altium/board.ts`: a chunk of its own (277 kB minified) that only opening an Altium file loads. `/licenses` lists it and its dependencies (the import scanner finds dynamic imports) |
| `@cantoo/pdf-lib` | PDF export | MIT | Already a dependency |
| Newstroke font, and KiCanvas's stroke font code | Text of design files | Font: CC0 1.0 (the README of the author's distribution: "Now released under CC0 licence, to give it right to be used in any project."); KiCanvas: MIT | Added in S3: the layout in `stroke.ts` adapted from KiCanvas commit b031159 (metrics corrected to KiCad 10). `lib/pcb/font/newstroke-glyphs.ts` is generated by a converter of our own (not in the repository; it follows the encoding of the author's `fontconv.awk`) from `symbol.lib`, `font.lib` and `charlist.txt` of the author's `newstroke-font.tgz` (https://vovanium.ru/_media/sledy/newstroke/newstroke-font.tgz, linked from https://vovanium.ru/sledy/newstroke/en; retrieved 2026-11-09, SHA-256 `dba1c334834e21bdbd15395dc610ecc2bf2eb6675ba0c4585597b375b7bd099e`). It replaced KiCanvas's copy of the glyphs, which came from KiCad's `newstroke_font.cpp` with KiCad's GPL-2.0-or-later header (KiCad's `LICENSE.README` does not list Newstroke, and its catch-all is GPL-3.0-or-later) and CJK glyphs under MIT and OFL-1.1. Never take glyphs from KiCad or KiCanvas: KiCanvas's `third_party/newstroke/` is KiCad's extended copy (another `font.lib` and `charlist.txt`, CJK libraries), not the author's release. The licence texts are in `lib/pcb/font/LICENSE.kicanvas.txt` and `LICENSE.newstroke.txt`; `scripts/collect-licenses.mjs` puts both on `/licenses` ("Font and code used by the PCB viewer") |
| Polygon booleans | Only if a step needs them (PDF/DXF flattening, exact EAGLE pours) | Must be permissive (e.g. a Clipper port under the Boost licence) | The first step that needs it chooses and records it here. S7 did without: EAGLE's pours are plane areas with cuts, and a cut is clipped to a polygon only as convex pieces (Sutherland–Hodgman, `lib/pcb/eagle/pours.ts`); exact pours are [BL23](BACKLOG.md) |

- **`altiumts` is ESM only,** so it is loaded with `await import('altiumts')` (CLAUDE.md, `"module": "node16"`), and
  only when an Altium file is opened; its types come with `import type … with { 'resolution-mode': 'import' }`.
  Version 0.0.95 reads both sample boards: the ASCII one in 59 ms and the binary one in 172 ms, with counts that match
  the file's own headers.
- **`altiumts` limits** (worked around in `lib/pcb/altium/`, see "Notes from S5"): `parseAltiumFile` does not read
  `.PcbLib`; binary vias come with their basic fields only; an ASCII board record split into several gives an empty
  layer stack; binary regions come twice; strings keep control characters (U+0001).

## Steps

Each step is done by one agent, from reading to commit (see "Running a step").

Status: ✅ done · 🔄 in progress · 📋 planned

| Step | What | Status | Commit |
| --- | --- | :-: | --- |
| S1 | Viewer shell and Gerber | ✅ | 7f75723 |
| S2 | Drill files, realistic view, measuring, PNG and SVG export | ✅ | bf8c4ef |
| S3 | KiCad boards and footprints, design model, stroke font | ✅ | c679764 |
| S4 | Inspect, highlight, search; BOM and pick-and-place export | ✅ | fc5432d |
| S5 | Altium | ✅ | 84130dc |
| S6 | PADS ASCII | ✅ | 5238540 |
| S7 | EAGLE | ✅ | |
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

**Notes from S5:**

- **Reading** (`lib/pcb/altium/`): altiumts parses the file (binary CFB or ASCII) and the reader works on each record's
  fields, the same for both forms: lengths in mil (`4249.4417mil`; bare numbers are mil too), angles counter-clockwise
  and Y up, so only the unit changes; indices of nets, components and polygons (65535, -1 or missing: none); every
  `Board` record merged into one (EasyEDA's ASCII file splits it into 11). Reading takes 195 ms for v2 (altiumts 170 ms
  of it) and 110 ms for v1; building 8–20 ms.
- **Layers** (`layers.ts`): copper order from the V9 stack (or the V8 list), else the legacy chain (`LAYERnNEXT` from
  the top layer); the designer's names ("GND (1)", "Top Silkscreen Layer"); mechanical layers 1–32 that hold something,
  labelled with their names; the keep-out layer as a `keepout` layer; a `BOARDSHAPE` outline layer draws the board shape
  (0.05 mm, as KiCad's import does on Edge.Cuts). Records name layers TOP, MID1, BOTTOM…, binary primitives MID-LAYER2
  and V7 ids (`LAYER16973830`); all are normalised. Objects on copper layers outside the stack are left out with a note.
- **Pads:** a shape per layer (top, mid, bottom and the full stack: `MIDXSIZE` for mid layer 1, `LAYERnXSIZE` for 2–30);
  ROUND with unequal sides is an oval, OCTAGONAL a rectangle with a quarter of the shorter side cut off each corner (as
  KiCad imports it), the alternative shape ROUNDRECT has a radius of `LAYERnCORNERRADIUS` % × the shorter side / 200;
  hole offsets (`LAYERnHOLEXOFFSET`, `PADXOFFSETn`) are the copper's offset from the hole; holes round, square (drawn
  round, with a note) or slots (`SLOTLENGTH` or `HOLEWIDTH`, along the pad's X at slot rotation 0, else along Y); a
  through-hole pad has copper on every signal layer, never on a plane. Openings are made as Altium makes them: the same
  shape grown (rectangles keep sharp corners, rounded corners grow by the expansion, octagon cuts by e(2 − √2)), unlike
  KiCad's rounded growth (`growShape`); solder mask from the pad's manual expansion (`SOLDERMASKEXPANSION_MANUAL` or
  `CSE`, `CSB`) or the SolderMaskExpansion rule (default 4 mil), none where tented; paste on SMD pads only, manual
  (EasyEDA's −3937 mil means no paste; its paste openings are regions) or the PasteMaskExpansion rule. PcbDoc files
  keep no pin names.
- **Rules** (`rules.ts`): the first enabled rule of a kind (by priority) whose first scope matches. Scopes are parsed:
  All, IsPad, IsVia, IsSMDPad, InNet, InNetClass (net classes from `Class` records), InComponent, HasFootprint,
  OnLayer, InPad…, with and, or, not; an unknown word or a comparison (`CompPinCount < 5`) keeps a rule from applying,
  with a note, so a broader one does.
- **Vias:** through, blind or buried from their start and end layers. altiumts decodes only the basic fields of binary
  vias, so the reader takes the stack mode and the diameter per layer (bytes 74 and 75 + 4n) and the hand-set mask
  expansion (byte 66, bit 1; the value at byte 54) from the record's bytes; tenting from the via's flags or the rule's
  `ISTENTINGTOP`/`ISTENTINGBOTTOM`.
- **Tracks, arcs, fills, regions:** copper tracks and arcs are tracks (arcs run counter-clockwise from STARTANGLE to
  ENDANGLE; equal angles make a full circle), the others graphics of their component. Keep-out tracks and arcs go to the
  keep-out layer, keep-out and polygon-cutout regions and fills are rule areas, board cutouts (`ISBOARDCUTOUT`: KIND 0 on
  the keep-out layer in Altium's file, KIND 2 on the multi-layer in EasyEDA's) cut the board shape, dashed-outline
  regions are dashed, copper regions with holes use the new `region` graphic. A contour's arc vertex runs from the end
  of the arc the vertex is at: counter-clockwise from SA to EA, or clockwise the other way (as KiCad reads them).
  Binary files keep their regions twice (Regions6, which altiumts calls `RegionFill`, and ShapeBasedRegions6 with arcs,
  which it calls `Region`); the shape-based ones are used.
- **Polygons:** a zone each, with its outline; the copper is what the file saved, the regions, tracks (as contours with
  round ends) and arcs the polygon owns. A polygon with nothing saved shows its outline with a note (both samples have 5
  such polygons; KiCad's import has no fill for them either). Checked with a synthetic pour (a region with an arc
  vertex, a track and an arc) in a copy of v1.
- **Internal planes** (`Design.planes`, drawn by the builder): the board shape in copper, kept back from every edge by
  the layer's pullback (default 20 mil: a clear stroke of twice that along each contour), then clearances (the hole +
  2 × PlaneClearance, default 20 mil) around holes not on the plane's net (`PLANEnNETNAME`), thermal reliefs
  (PlaneConnect, default Relief: the air gap from the hole + 2 × expansion out, 4 spokes at 45°) around plated holes on
  it (none for Direct), and everything drawn on the plane layer, all cut out. Split planes (polygons on a plane layer)
  are drawn as one plane of its net, with a note; their split lines cut it. Neither sample has a plane: checked with v1
  whose mid layer 1 was turned into a GND plane; clicking the plane says "Internal plane" with its net, pullback and
  counts, and highlighting GND lights it.
- **Text** (`text.ts`), measured on Altium's print (`PCB1_1.pdf` rendered with the repo's pdf.js at 8 px/pt; the page
  transform fitted on the hidden pad labels `PA<ref>0<pin>` to 1.4 pt and refined on 66 via centres to 0.6 px): stroke
  text has capitals HEIGHT tall, the baseline and the left end of the first letter's stroke at the anchor, and WIDTH as
  the stroke; Altium 18 and later store each text's box (TEXTBOXWIDTH × TEXTBOXHEIGHT: the strokes plus WIDTH on every
  side), so the letters are drawn as wide as Altium's; a frame (ISFRAME) puts its lines WIDTH inside its box by
  JUSTIFICATION (1 left top … 9 right bottom); lines are 1.2 × (HEIGHT + 2 WIDTH) apart; Altium breaks lines at both
  `\r` and `\n` (EasyEDA writes `\n\r\u0001`: an empty line, and a U+0001 that Altium draws as a blank indenting the
  line by 2–3 letters, left out here). TrueType text: capitals 0.64 × HEIGHT for Arial-like faces (from the outlines and
  advances Altium stores for its letters: em = HEIGHT / 1.117), else 0.6, a stroke an eighth of that, the baseline at
  the anchor, as wide as its box. Mirrored text is flipped about the anchor, inverted text is knockout with
  MARGINBORDERWIDTH, designators and comments are hidden as the component says (NAMEON, COMMENTON). Against the print,
  the top silkscreen's texts land in Altium's boxes (72.6 % of the pixels agree, the rest are the letters' shapes);
  KiCad's import has the same anchors but the stroke font's own widths.
- **Components:** designator `SOURCEDESIGNATOR`, value the comment text (or a `COMMENT` field), footprint the PATTERN
  (`library:name` with `SOURCEFOOTPRINTLIBRARY`), side from LAYER, rotation as stored: bottom parts need no 180° (v2's
  ten bottom 0402 and 0603 parts have pad 1 where KiCad's convention puts it, and kicad-cli's position file of KiCad's
  import has the same angles). COMPONENTKIND 1, 2, 4 and 5 leave the BOM, 1 and 2 the position file. "Not Fitted" is a
  variant setting of the project, not in the PcbDoc (a NOTFITTED or DNP field would be taken). PcbDoc files keep no
  component parameters; the library reference and component library become fields where the record has them.
- **Libraries:** `parseAltiumFile` rejects `.PcbLib`, but a footprint's Data stream (its name, then records: a type
  byte and 1, 2 or 6 length-prefixed parts) splits into records that altiumts's board decoders
  (`parseAltiumBinaryPcbPrimitiveStream`) read one at a time. The footprints are laid side by side, each a component
  named after it, with the layer stack of `Library/Data`. ASCII libraries are not read (no sample, and altiumts reads
  none).
- **Checked** against KiCad's import (`kicad-cli pcb import --format altium` of v2, moved onto ours by
  `s3-compare.mjs --align`): copper (4 layers), paste, drill, outline and mechanical layers agree but for edge pixels
  (≤ 0.02 % at 20 px/mm), solder masks within 0.05–0.14 % (the sharp corners), silkscreen 32–34 % (the letter widths,
  above). Every pad click (511 on v2, 466 on v1) finds the pad with its net, component and pin; v2's 398 pads have the
  nets of KiCad's import; the pick-and-place file equals kicad-cli's of the import (135 rows in the same order with the
  same angles, positions within 6.4e-6 mm after the import's shift). KiCad's import puts its drill/place origin at
  Altium's sheet position (SHEETX, SHEETY), ours is the board origin (ORIGINX, ORIGINY; 0, 0 in v2). The phone layout
  works; the KiCad checks of S3 and S4 (ARTIFICER against its Gerbers, 1,071 pad clicks) are unchanged.
- **Harness** (`…\scratchpad\pcb\harness\`): `s5-read.mjs` reads boards and libraries in Node, `s5-hits.mjs` clicks
  every pad and compares the nets with KiCad's import, `s5-csv.mjs` writes the CSVs and compares the position file
  (`--shift`), `s5-pdfcmp.mjs` renders a layer in the frame of Altium's print and compares it with the print's grey;
  `s3-compare.mjs` gained `--align` (b moved onto a's outline box) and `--keys` (layers matched by name).
  `…\scratchpad\pcb\s5\pdf-render.mjs` renders PDF pages with the repo's pdf.js (legacy build) and `@napi-rs/canvas`,
  `fit-pdf.mjs` and `fit-vias.mjs` fit a print's transform, and `plane\` holds the synthetic variants of v1.

**For S6:**

- **CAM planes:** give the layer `plane: true` and a `Design.planes` entry (net, pullback, clearances, thermals), with
  the sizes from the pad stacks' antipad and thermal entries; pads and vias must not list the plane layer, and anything
  drawn on it is cut out. Non-round antipads or thermals would need the model to grow.
- **Graphics with holes:** `{ region: Contour[] }`; mask layers are found by kind and side, so any layer ids work.
- **Text:** `lib/pcb/altium/text.ts` shows how to put the stroke font where another program's font was: lay out our
  text, measure it and move it onto the program's anchor rule. Linear's PDF prints can be fitted the same way.
- **KiCad's importer** reads only binary PcbDoc files; try `kicad-cli pcb import --format pads` on the PowerPCB V4.0
  file early.

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

**Notes from S6:**

- **Reading** (`lib/pcb/pads/`): `ascii.ts` decodes the file in the code page of its header (CP932 as Shift_JIS and so
  on, else Windows-1252) and splits it into sections; only known section names start one (`*SIGNAL*`, `*GET*` and
  `*STANDARD*` stay inside theirs), so a text line starting with `*` stays a text. What changed between versions is
  read from the `*REMARK*` lines, else from the version: a font line after texts and labels (2005), pin numbers on
  terminals and no units field in part types (2007), a flags field in lines items (2007; the REMARK lines do not show
  it), corner radii of square and rectangular finger pads (9.0), line styles of pieces (9.4). Versions are compared on
  one scale (4.0, 5.0, 2005, 2007, 9.x as 2009.x, 10.0 as 2010). Units: basic (38,100 to the mil), mils, metric,
  inches; except in basic files, a decal's own flag (I mils, M mm) gives the units of its numbers. A piece stops at the
  first line that is not a corner (before the 2007 flags field was known, a text line read as a piece made a count of
  122,396,250 and 0.7 s of reading). Reading
  the sample takes about 40 ms and building it 10–30 ms; Ems4_Rev2 (1 MB, 1,291 pads) 80–120 ms and 20–40 ms.
- **Layers** (`layers.ts`): copper is 1 to MAXIMUMLAYER; the other levels are named and typed by the LAYER DATA of
  `*MISC*` (PADS's defaults 21–30, plus 100 in 250-layer mode, when a file has none). The mask, paste, silkscreen and
  assembly layer of each side are those that layer 1 and layer n name, else the layer of that type with PADS's own
  name or the side's word (Ems4_Rev2 names them only on an inner layer); these pairs mirror a bottom part's items.
  Plane layers get the label "Mixed plane" or "CAM plane". Level 0 (all layers) gets a layer of its own.
- **Parts:** a decal is turned by the part's angle and, on the bottom, mirrored left to right after turning, which is
  the decal with y negated turned by 180° minus the angle. So `Placement.rot` is the angle on the top and 180° minus it
  on the bottom, as KiCad stores flipped footprints: the pick-and-place file equals `kicad-cli pcb export pos` of
  KiCad's import (52 rows in the same order, with the same angles; positions after its centring shift of 40.64 mm). The
  part's own labels replace the decal's; they lie in the part's frame, their angle relative to the part's, mirrored
  with it. As Linear's CAM documents plot them, decal outlines (2D pieces on level 0 or a copper level) and Ref.Des.
  and attribute labels go to the silkscreen of the part's side and Part Type labels to its assembly drawing (else a
  "Part types" layer); items on other levels go to their layer, mirrored for the bottom. Value: the part's Value
  attribute, else its part type; footprint: the decal (the alternate the part picks); fields: the other attributes of
  the part and its part type. Pins are named by the part type's alphanumeric pin names where it has them (Ems4's
  diodes: A and C, as its routes name them), else by the terminal's pin number (2007 and later), else in order; KiCad's
  import names them by number and loses those nets.
- **Pads:** a shape per layer from the stack lines (-2 the part's side, 0 the other side, -1 the inner layers, a number
  that layer, which overrides -1); R and O round, S square, A a ring, OF and RF fingers along their angle with their
  offset, rounded or chamfered corners from the corner radius; the drill and plating on the side's line; a slot with
  its angle and offset (the pad's origin moves onto the hole); RT/ST and RA/SA only for CAM planes. A pin's filled
  copper in its decal (COPCLS with a pin number) joins the pad and its openings (C1–C7 of the sample); a pin's copper
  on a paste or mask layer replaces the pad's own opening there (the paste windows of the DFN's thermal pad). Mask:
  the stack's entry for the mask layer, else the copper of each outer side, not grown (TM.pho is identical); paste
  likewise for SMD pads. A non-plated hole at least as large as its pad keeps its mask opening but has no copper.
- **Routes:** a segment from each corner of a connection to the next on the corner's layer (0: not routed, 65: the end
  at a pin), arcs around corners flagged 0x1000 with CW or CCW, vias where a via type is named; the segments and vias
  that connections share are listed in each and kept once. Teardrops (TEARDROP P or N, width and length in percent) are
  lined tapers from the pad's full width at its centre to the track's width 0.57 × length × the pad's diameter past
  its edge (fitted on J1, J2 and E1 of the sample), none on a pad narrower than the track or along a track shorter
  than the teardrop (E4). Square via pads (Ems4's 455 "VIAS") are `DesignVia.square`.
- **Pours:** a zone per POUROUT, its HATOUTs the fill and its VOIDOUTs holes, stroked with the pour's line width (the
  outlines are the centre lines of the copper's edges), PADTHERM and VIATHERM spokes as `DesignZone.lines`
  (zero-length in the sample: the flood covers the pads). A pour with nothing flooded shows its outline with a note.
  Filled copper items (COPCLS) are exactly their polygon: PADS strokes their outline inside it.
- **Plane areas whose flood is not saved** (PLANEFLAGS OUTLINE; the sample's layers 2 and 3), in `planes.ts`: each
  area, larger ones first (or by priority), is copper exactly to its outline; cut out of it are the later areas of
  other nets with COPPER_TO_COPPER around them (else COPPER_TO_TRACK: the measured 10 mil), copper cut-outs (COPCUT,
  CIRCUT) grown by half their line width, keep-outs that forbid plane areas, and the tracks, pads, vias, teardrops and
  copper of other nets grown by the COPPER_TO_* clearances (the larger of the two nets' rule sets). Pads and vias of
  the area's net join it directly: Linear's Gerbers have no thermals there. With the 14th flag of PLANEFLAGS (remove
  unused pads), vias and through-hole pads on inner plane layers that no track there ends on and that do not lie in an
  area of their own net have no copper there; their clearance stays. Isolated copper is not removed (a note says so).
  The builder now draws several planes on one layer, plane areas, cuts and positive planes (the layer's tracks and pads
  over the plane). Against L2.pho and L3.pho 0.06 % and 0.08 % of the pixels differ at 20 px/mm: PADS hatches the
  flood with 5-mil lines on a 4.5-mil grid, so its horizontal edges move by up to a grid step.
- **CAM planes** (no sample has one; checked with the sample's layer 2 turned into a CAM plane of GND): the board
  shape kept OUTLINE_TO_COPPER from the edge, antipads from the RA/SA lines of the stacks (else the pad grown by
  COPPER_TO_PAD or COPPER_TO_VIA) around holes of other nets, thermal reliefs from the RT/ST lines (else THERLINEWID
  spokes, diagonal or orthogonal by THERFLAGS) around plated holes of the layer's nets, and what is drawn on the layer
  cut out. Square antipads and thermals are drawn round.
- **Text** (`text.ts`), measured on TS.pho: capitals are 21/32 of the height (Romansim is a Hershey font: a 32-unit
  cell, capitals 21 units) with the width as the stroke; LEFT and RIGHT put the end of the first or last stroke at the
  anchor, CENTER the middle of the strokes; DOWN puts the baseline there, CENTER 12.5/32 of the height below it, UP
  (not in the sample) 25/32. The stroke font's glyphs are drawn 0.82 of the capital height wide and its spaces widened
  to Hershey's 16/21, which makes the 39 upright texts of TS.pho as wide as PADS's within 3 % (the long line with
  commas 5 %). Mirrored text is flipped about its anchor. TrueType faces (a font face not "<… Stroke Font>") get
  capitals 0.7 of the height, with a note.
- **Checked** against Linear's Gerbers (the CAM output the PDF prints come from), inside the board edge at 10 and
  20 px/mm with `s3-compare.mjs --align --box`: the top solder mask is identical; the outer copper differs only by
  the 185-mil pads of the four non-plated mounting holes (plotted by PADS, drilled away), "REV 1" in the stroke font
  and edge pixels; inner planes as above; plated drills identical, the six non-plated holes on a layer of their own.
  Differences that come from Linear's CAM documents, which the viewer does not read ([BL21](BACKLOG.md)): the bottom
  mask is 3 mil larger (DOC_PAD_OVERSIZE), the paste leaves out the parts the documents suppress (H5, C2, C26, C32,
  C34–C40), the silkscreen leaves out the E and MH designators, and every plot carries the board frame and the titles
  on layers 18 and 20. The silkscreen otherwise differs by the letters' shapes (about 40 % of its pixels). Every pad
  click finds the pad with its net and pin (171 of 171 on the sample; all on Ems4_Rev2, Dexter_MotorCtrl, MC4 and
  controlCARD); the nets of the pads equal those of KiCad's import (149 of 149 on the sample, and on Dexter and
  controlCARD; on Ems4 KiCad's import loses the nets of parts named with digits and of pins with letters). Opening the
  whole DC2637A folder picks the `.ASC`, lists the Gerbers as not used and the binary `.PCB` with its message. The
  phone layout works.
- **Other samples** (KiCad's PADS test files): V5.0, V2005, V2007, V9.0, V9.4, V9.5 (basic and mils) and V10.0 (basic
  and 250-layer) all read. Against KiCad's imports, the differences are where KiCad leaves things out (pins' copper,
  the voids of floods, pours it does not fill, plane areas) or puts layers by a fixed table instead of the file's layer
  data (MC4's texts on its "Silkscreen Bottom", level 25, end up on KiCad's F.Mask). `kicad-cli pcb import --format
  pads` reads the PowerPCB V4.0 sample, but leaves its plane areas unfilled.
- **Harness** (`…\scratchpad\pcb\harness\`): `s6-read.mjs` reads boards in Node, `s6-hits.mjs` clicks every pad and
  compares the nets with KiCad's import, `s6-csv.mjs` writes the CSVs and compares the position file, `s6-textfit.mjs`
  measures the texts of a layer against a Gerber file, `s6-diffspots.mjs` lists the clusters of differing pixels of a
  diff image, and `s6-near.mjs`, `s6-planes.mjs`, `s6-texts.mjs`, `s6-gbrbox.mjs` and `s6-gbrlines.mjs` look at items.
  `…\scratchpad\pcb\s6\samples\` holds KiCad's PADS test files, `s6\kicad\` their imports, `s6\cam\` the sample with
  a CAM plane, `s6\spec\` the specification as text.

**For S7:**

- `Design.planes` now draws several planes per layer, plane areas with cuts, and positive planes (the layer's own
  items over them). EAGLE polygons without a computed pour can be drawn the same way: the polygon's outline as a plane
  area, other nets' copper grown by the isolation as cuts (orphan removal and thermals left out), without polygon
  booleans.
- Fitting the stroke font to another program's text: `lib/pcb/pads/text.ts` (anchor rules and a width ratio measured
  on Gerber files with `s6-textfit.mjs`) and `lib/pcb/altium/text.ts`.
- A footprint's filled copper that belongs to a pin can join the pad as a custom shape (`localParts` in
  `lib/pcb/pads/board.ts`), so clicks, highlights and openings include it.
- KiCad's importers are a second opinion only: they leave things out and map layers by fixed tables.

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

**Notes from S7:**

- **Reading** (`lib/pcb/eagle/`): `xml.ts` reads the XML without a library (elements, attributes, text, entities; the
  DOCTYPE, comments and processing instructions skipped). EAGLE 6.4, 9.3.1, 9.5.0 and Fusion 360's 9.7.0 read the same;
  Fusion's own elements (`drillsymbolsettings`, `mfgpreviewcolors`, `groups`, `packageinstances`) are skipped, and its
  exports are told by the version (EAGLE's last release is 9.6.2) or its design rules' description. Libraries are found
  by name and URN (a board can hold two libraries of one name). LibreVNA (966 KB) reads in about 150 ms and builds in
  60 ms; the page shows it 0.9 s after opening. The binary files of EAGLE 5 and older (Olimex's boards) get S1's
  message. Libraries (`.lbr`) show their packages side by side in rows about as wide as they are tall, each a
  component named after it, with EAGLE's default rules and no board shape.
- **Layers** (`layers.ts`): copper in the order of the layer setup (`(1+2*3+14*15+16)` gives 1, 2, 3, 14, 15, 16; the
  blind-via marks `[2:` and `:15]` are dropped); copper numbers that are not in the setup become other layers. tPlace
  and tNames are silkscreen (EAGLE's CAM jobs plot both; the samples' silkscreens agree), tValues is fabrication
  ("Values", not on any sample's silkscreen), tStop and tCream masks and paste, tKeepout courtyard, tRestrict and
  bRestrict keep-out (they also cut the polygons of the outer copper), Milling mechanical, tDocu fabrication; a user
  layer named for the silkscreen (RAMBo's `_tsilk`, plotted on its GTO) is silkscreen, other user layers are other
  layers. Pads, Vias, Unrouted, the origins, Drills, Holes and the schematic layers are not drawn. A mirrored element
  swaps 1 and 16, the t and b layers, and inner n with 17 − n.
- **Placement:** a package is turned by the element's angle and then, when mirrored, flipped about the vertical line
  through the element's origin (x negated after turning). The smashed attributes confirm it: they store absolute
  places, and mutantC's S111 (MR270 at 93.25, 67.35) has its package text at (0, 3.302) and its NAME at (89.948, 67.35).
  A package text's own angle τ and mirror add up: turned by angle + τ, or by τ − angle when the text is mirrored, and
  mirrored when exactly one of the two is. `Placement.rot` is the angle on the top and 180° − angle on the bottom (as
  KiCad stores a flipped footprint): the pick-and-place files of all four boards equal `kicad-cli pcb export pos` of
  KiCad's imports (590, 266, 51 and 25 parts; positions within 1.4e-6 mm, the same angles), apart from KiCad's renaming
  (it numbers references without a number, puts "UNK" before those starting with a digit, and writes "/" in package
  names as "_"). Fusion's own position files give the centre of the SMDs instead of the origin. Value: the current
  variant's, else the element's; footprint "library:package"; fields: the element's attributes (MPN, MANUFACTURER,
  DATASHEET…); DNP from `populate="no"` or the current variant; SMD or through-hole from the pads.
- **Pads** (`rules.ts`): the restring is a share of the drill clamped to a minimum and a maximum, for the top, inner
  and bottom layers of pads and the outer and inner layers of vias; the pad's or via's own diameter is used where it is
  larger on the layers whose `useDiameter` bit is set (1 pads top, 2 pads inner, 4 pads bottom, 8 vias outer, 16 vias
  inner; every sample has 13, and LibreVNA's inner layers agree that their rings come from the restring alone). Inner
  rings are round. Shapes: square, round, octagon (the diameter across flats; the builder's octagon was cut twice as
  far, a diamond, which nothing had used before), long (an oval 1 + psElongationLong % as long), offset (the same with
  the hole at one end, toward −x); psTop, psBottom and psFirst force a shape (−1 as in the library, 0 square, 1 round,
  2 octagon; every sample has −1). SMDs: roundness is a share of half the smaller side, the rules' share if larger; the
  openings keep the share. The stop mask is larger by mvStopFrame × the smaller side, clamped, around SMDs, pads, vias
  whose drill exceeds mlViaStopLimit (or with `alwaysstop`) and holes (EAGLE opens the mask over its holes); cream is
  for SMDs only, smaller by mvCreamFrame × the smaller side, clamped (RAMBo's 10 % clamped to 1–4 mil checked). The
  solder masks equal the Gerbers within 0.00–0.22 % of their pixels, the paste within 0.00–0.35 %.
- **Text** (`text.ts`), measured with `s7-textfit2.mjs` on the vector-font texts of mutantC and LibreVNA: the outer
  edges of the capitals span the size, and the strokes are size × ratio % wide (EAGLE's CAM rounds them to whole mils,
  3.2 to 3); left, right, bottom and top alignment put the outer edges of the letters at the anchor, center the middle
  (all within 0.006 mm). With the stroke font's glyphs as wide as high, capitals and digits are as wide as EAGLE's
  within 1–3 %, lowercase text and spaces 3–8 % wider. Unless it has the spin flag, a text at an angle over 90° up to
  270° (from 90° up to below 270° when vertical text reads down) is turned by 180° with its alignment reversed; mirrored
  text is judged at the same angle, since it is flipped after turning (MR90 reads normally from the bottom, MR270 is
  turned). Lines are size × (1 + distance %) apart. `!RESET` and `!RST!/NMI` overlines become KiCad's `~{…}`. EAGLE's
  CAM draws every text in the vector font; Fusion's TrueType ("custom") texts are drawn in the stroke font with a note.
- **Polygons** (`pours.ts`): EAGLE stores only their outlines, so each is a plane area (S6's mechanism) with its outline
  also stroked with its width (`DesignPlane.stroke`: the outline is the centre line of the copper's edge), drawn from
  rank 6 to rank 1 (a missing rank is 1), each over the ones before. Cut out of it: other signals' wires, vias and pads
  grown by the larger of its isolate, the wire–wire, wire–via or wire–pad clearance and the net classes' clearance;
  copper of no signal and text on the layer; more important polygons of other signals with that gap; cutout polygons
  (`pour="cutout"`, also listed as rule areas); restrict areas; holes and the Dimension layer with mdCopperDimension
  (everything outside the board edge is one region: a large rectangle with the edge as its hole). Milling does not cut
  polygons (LibreVNA's inner layers keep their copper in its milled slots). A cut erases the polygons drawn before it
  too, which is right for what every polygon keeps clear of but not around copper of a signal that has an earlier
  polygon on the layer (LibreVNA's GND frame of rank 1 cut a 0.55 mm line through its GND polygon of rank 6), so those
  cuts are clipped to the polygon's copper as convex pieces (Sutherland–Hodgman: strokes, circles, convex pads; a
  more important polygon's filled outline is clipped to the hull of the area). Thermal reliefs, the removal of islands
  and of copper narrower than the polygon's width are left out, and a warning says the pours are approximate
  ([BL23](BACKLOG.md)). Hatched polygons would be drawn solid (no sample has one).
- **Board shape:** the Dimension layer of the board and its packages, with closed Milling loops as cutouts; open milling
  lines (slots) are not part of it, and Dimension lines of packages that end on the edge (LibreVNA's SMA connectors)
  are left out with the outline's note.
- **Checked** at 20 px/mm with `s7-compare.mjs` (S3's comparison with the layers of one kind and side painted together,
  as EAGLE plots tPlace and tNames on one silkscreen), percent of the pixels that differ:

  | Board | Copper | Solder mask | Paste | Silkscreen | Drill, outline |
  | --- | --- | --- | --- | --- | --- |
  | mutantC (EAGLE 9.5.0) | 4.85, 2.87 | 0.00, 0.00 | –, 0.00 | 22.6, 10.2 | the NPTH holes are a layer of their own |
  | LibreVNA (9.3.1, 6 layers) | 3.56, 0.49, 0.42, 1.30, 1.10, 0.38 | 0.16, 0.22 | 0.01, 0.00 | 4.9, 60 (labels only) | 0.55 (NPTH) |
  | RAMBo 1.2e (6.4, 4 layers, aligned) | 6.55, 0.52, 1.34, 3.49 | 0.21, 0.03 | 0.21 | 26.9 | outline 0.00 |
  | Open Task Light (Fusion 9.7.0) | 0.00, 1.52 | 0.15, 0.00 | 0.35, 0.00 | 45.5, 59.0 (TrueType) | drill 0.15 |

  What the copper keeps is pours: thermal reliefs, islands and slivers that EAGLE removes, and edge pixels. KiCad's
  import, with its zones refilled (`kicad-cli pcb export gerbers --check-zones`), differs from EAGLE's Gerbers by 8.80
  and 6.27 % on mutantC and 1.32 to 3.39 % on LibreVNA's layers, and from its masks by 0.41 and 9.68 % (it loses the
  tStop polygons). The silkscreens differ by the letters' shapes. Every pad click finds the pad with its element, pad
  and net as the first entry (572, 112, 1,878 and 1,252 clicks); the pads' nets equal KiCad's import (1,841 of 1,841 on
  LibreVNA, 1,020 of 1,020 on RAMBo, 274 of 294 on mutantC and 45 of 78 on Open Task Light, whose other parts KiCad
  renamed). Clicking a polygon says "Polygon" with its net, rank,
  isolate and width. The phone layout works. S6's PADS boards build the same designs and layers as before S7 (14 files).
- **Harness** (`…\scratchpad\pcb\harness\`): `s7-read.mjs` reads boards and libraries in Node, `s7-compare.mjs`
  compares layer kinds, `s7-textfit2.mjs` measures texts at any angle against a Gerber file, `s7-hits.mjs` clicks every
  pad and compares the nets with KiCad's import, `s7-csv.mjs` writes the CSVs and compares the position file,
  `s7-cutsat.mjs` lists the plane cuts at a point, `s7-crop.mjs` and `s7-shrink.mjs` crop and shrink diff images,
  `s7-padsregress.mjs` builds PADS boards with the committed code and the working copy, `s7-detect.mjs` recognises
  files. `…\scratchpad\pcb\s7\samples\` holds the boards and Gerbers, `s7\kicad\` KiCad's imports with their Gerbers
  and position files, `s7\docs\` EAGLE 7.1's DTD (from openpnp) and EAGLE 4.16's help on the design rules, `s7\tools\`
  small Python readers of EAGLE Gerbers.

**For S8:**

- **PDF and DXF** see only layers. EAGLE polygons are dark regions with their outline stroked and clear cuts after
  them (some cuts are regions clipped to the polygon), on positive plane layers; flattening clear polarity for a PDF
  needs the polygon booleans or the image the plan foresees.
- **The board shape** of an EAGLE board is the Dimension layer with closed Milling loops as cutouts; DXF can take
  `Board.outline` and the drill layers as they are.
- **Pick-and-place files of EAGLE and Fusion** come with two samples: LibreVNA's `VNA.mnt` and `VNA.mnb` (EAGLE's
  `mountsmd.ulp`: name, x, y, angle, value and package separated by blanks, the bottom's angles as EAGLE stores them)
  and Open Task Light's `PnP_Control Board_front.csv` and `_back.csv` (Fusion: `Name,X,Y,Angle,Value,Package`, the
  centre of the SMDs rather than the origin, and parts with no SMD left out). Both have the Gerbers to lay them over.

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
  - Mentor's "PADS Layout ASCII Format Specification" (PADS 9.4: `Ppcb_ASCII.pdf` at www.freecalypso.org; the bare
    host name did not resolve in S6) and KiCad's import-format notes on PADS;
  - the DC2637A file is in the PowerPCB V4.0 format, older than Altium's importer accepts (5.2 and later);
  - the files differ from the specification in places: via thermals (RT, ST) give the outer size before the spoke
    angle, decal thermals the angle first; lines items have no flags field before PADS 2007; a stack can have fewer
    than three lines; arcs of lines and decals are a start corner with start angle, sweep and the box of the circle,
    arcs of pours a centre line with start angle and sweep between two corners (tenths of a degree in both).
- **EAGLE:** XML described by `eagle.dtd` (EAGLE 7.1's copy, CC BY-ND 3.0 for programs that read the format, is in
  openpnp's repository: `src/main/resources/eagle.dtd`; KiCad's import-format notes list the attributes). Polygons
  store only outlines. EAGLE's help on the design rules and the TEXT command (overlines, spin) describe the rest; Fusion
  360's help (Fusion ECAD: design rules, CLI reference) has the newer texts. Coordinates are mm with Y up.
- **Pick-and-place CSV columns:**
  - KiCad: `Ref, Val, Package, PosX, PosY, Rot, Side`;
  - Altium: `Designator, Comment, Layer, Footprint, Center-X(mm), Center-Y(mm), Rotation`, …;
  - JLC: `Designator, Mid X, Mid Y, Layer, Rotation`.
