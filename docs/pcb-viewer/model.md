# Model (sketch)

Part of the [PCB viewer plan](plan.md).

S1 wrote the artwork part (in `lib/pcb/model.ts`, as below; S2 added `outlineFrom`, the `'format'` way of identifying
a layer, and drill layers with plated and non-plated holes), S3 wrote the design part (and `Board.design`, the
`design` link of `BoardObject`, and `attrs` and `fields` of `Placement`), S4 added `Aperture.code` and
`Design.placeOrigin`, S5 added `Design.planes`, graphics with holes (`region`) and `knockoutMargin` of texts, S6 added
plane areas, cuts and positive planes (several per layer), `lines` of zones and square vias, S7 added `stroke` and `info`
of planes, S8 added `Layer.markers` and `BoardObject.placement` (pick-and-place files over Gerber sets), S9 wrote down
what `DesignZone.priority` and `DesignText.lineSpacing` mean (no new fields). Names and fields may change. Keep this
section in step with the code.

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
  markers?: boolean;                 // made from a pick-and-place file: a marker per part of one side (S8)
  items: ArtItem[]; apertures: Aperture[]; bbox: Box;
}

// Design boards: one object per pad, via, zone ('zone', 'teardrop', 'rule area'), internal plane ('plane') and
// component (its graphics and text too), with `design` pointing at the entry; one per net for tracks, one per net for
// board graphics, one for board text. A pick-and-place file over a Gerber set: one per part ('placement', S8).
interface BoardObject { kind: string; net?: string; component?: string; pin?: string; info?: Record<string, string>;
  design?: { list: 'pads' | 'vias' | 'zones' | 'components' | 'tracks' | 'graphics' | 'texts' | 'planes'; index: number };
  placement?: number }               // index into Board.placements (pick-and-place markers)
// at, rot and side as KiCad's position files give them (lib/pcb/export/csv.ts writes them so): the footprint origin,
// Y up; rot counter-clockwise, for a bottom part the angle of the footprint flipped about its own X axis (Y negated)
// and then turned, as KiCad stores it; X is not negated on the bottom. From a pick-and-place file (S8): the position
// the file gives (EAGLE and Fusion: the centre of the SMDs), with the offset and units of its mapping; EAGLE's and
// Fusion's bottom angles converted (180° − angle); `fields` hold the file, and its position and rotation as written.
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
    keepout?: boolean; unfilled?: boolean; teardrop?: boolean; comp?: number;
    priority?: number }[];           // the file's own: KiCad fills higher first, Altium's pour order and PADS lower first
  graphics: { layer: string; shape: { line: [Pt, Pt] } | { arc: { c: Pt; r: number; start: number; sweep: number } }
    | { circle: { c: Pt; r: number } } | { poly: Contour } | { region: Contour[] }   // region: holes clockwise
    | { curve: [Pt, Pt, Pt, Pt] };   // curve: cubic Bézier
    w: number; filled: boolean; dash?: 'dash' | 'dot' | 'dash_dot' | 'dash_dot_dot'; comp?: number; net?: number }[];
  texts: { layer: string; s: string;   // variables already replaced; KiCad's markup ^{…} _{…} ~{…} kept
    at: Pt; rot: number;             // anchor and angle as drawn (keep-upright applied)
    h: number; w: number; thick: number; mirror: boolean;
    just: { h: 'left' | 'center' | 'right'; v: 'top' | 'middle' | 'bottom' };
    italic?: boolean; bold?: boolean;
    lineSpacing?: number;            // × KiCad's pitch (Altium, EAGLE); KiCad's plots ignore their own line_spacing
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
