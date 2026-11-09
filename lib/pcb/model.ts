// The board model of the PCB viewer: what every reader produces and what the drawing and the exports use. The plan
// (docs/pcb-viewer-plan.md, "Model") describes it; keep the two in step.
//
// Units: millimetres. Y up (KiCad's Y is negated on reading). Angles: degrees, counter-clockwise from +X.

export interface Pt {
  x: number;
  y: number;
}

export interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

// A segment of a contour, from the end of the previous one (or the start). An arc segment that ends where it starts is
// a full circle.
export interface ContourSeg {
  to: Pt;
  arc?: { c: Pt; ccw: boolean };
}

// A closed outline of straight segments and circular arcs, from start back to start.
export interface Contour {
  start: Pt;
  segs: ContourSeg[];
}

export type Mirror = 'none' | 'x' | 'y' | 'xy';

// What a layer looks like, in drawing order. A dark item adds; a clear one erases what is under it on that layer.
export type Art =
  | { k: 'line'; a: Pt; b: Pt; w: number; cap: 'round' | 'square' }
  // sweep > 0: counter-clockwise; ±360 is a full circle.
  | { k: 'arc'; c: Pt; r: number; start: number; sweep: number; w: number }
  // The aperture is mirrored first ('x' negates x, 'y' negates y), then rotated, then scaled, then moved to `at`.
  | { k: 'flash'; at: Pt; ap: number; rot: number; mirror: Mirror; scale: number }
  // Filled with the non-zero rule: outer contours counter-clockwise, holes clockwise. Overlapping outer contours add up.
  | { k: 'region'; contours: Contour[] }
  // A drill hit; `to` makes it a slot. Drill layers hold holes (Excellon and Gerber drill files alike); a routed path
  // of an Excellon file is a slot per straight part and an arc item (w: the tool diameter) per curved part.
  | { k: 'hole'; at: Pt; d: number; to?: Pt; plated: boolean };

// obj: index into Board.objects.
export type ArtItem = Art & { dark: boolean; obj?: number };

// A part of a flash shape, in aperture coordinates. Polygons are counter-clockwise.
export interface AperturePart {
  dark: boolean;
  circle?: { c: Pt; r: number };
  poly?: Pt[];
}

// A flash shape: its parts in order; a part with dark: false erases earlier parts of the same flash only, never what
// is under the flash. Block apertures and step-and-repeat are expanded into items by the Gerber plotter.
export interface Aperture {
  parts: AperturePart[];
  // How the file defines it, e.g. "C,0.5" or "RoundRect,0.1X…", for inspection.
  name?: string;
  // The D code of a Gerber aperture (D10 and up).
  code?: number;
  // Gerber X2 aperture attributes, e.g. { '.AperFunction': 'SMDPad,CuDef' }.
  attrs?: Record<string, string>;
}

export type LayerKind =
  | 'copper' | 'mask' | 'paste' | 'silk' | 'outline' | 'drill' | 'mechanical' | 'fab' | 'courtyard' | 'keepout' | 'other';

export type Side = 'top' | 'bottom' | 'inner' | 'none';

// How a layer's kind and side were found (lib/pcb/identify.ts), shown in the layer panel. 'format': the file format
// says it (an Excellon file is a drill layer).
export type IdentifiedBy = 'x2' | 'job' | 'name' | 'format' | 'design' | 'user' | 'none';

export interface Layer {
  id: string;
  // The file name, or the layer name of a design.
  name: string;
  kind: LayerKind;
  side: Side;
  // More about what the layer is, e.g. "Glue", "ECO1" or "Drill drawing".
  label?: string;
  // Copper order: 1 = top … n = bottom.
  copper?: number;
  // The layer starts dark over its bbox and the items are already in their final polarity (Gerber IPNEG). A negative
  // plane of a design can instead start with a dark region of the board shape.
  negative?: boolean;
  // Drill layers: true or false when all holes are plated or not, undefined when the file has both (each hole says).
  plated?: boolean;
  // Source file (its path, inside an archive if it came from one) and Gerber X2 file attributes, with the dot
  // (e.g. '.FileFunction': 'Copper,L1,Top').
  file?: string;
  attrs?: Record<string, string>;
  identifiedBy?: IdentifiedBy;
  // Made from a pick-and-place file: a marker and the designator of each part of one side (lib/pcb/markers.ts).
  markers?: boolean;
  items: ArtItem[];
  apertures: Aperture[];
  bbox: Box;
}

// What a click on an item reports (lib/pcb/inspect.ts), and what a highlighted net or component is made of. For
// Gerber X2 these are the object attributes: .N (net), .P (component, pin and pin name), .C (component), and any
// others in `info` (e.g. '.CVal'). For a design (lib/pcb/design/build.ts): one object per pad, via, zone ('zone',
// 'teardrop' or 'rule area'), internal plane ('plane') and component (shared by its graphics and text), with `design`
// pointing at its entry in Board.design; and one per net for tracks ('track'), for board graphics ('graphic') and one
// for board text ('text'). A pick-and-place file over a Gerber set gives one per part ('placement'), with its index in
// Board.placements.
export interface BoardObject {
  kind: string;
  net?: string;
  component?: string;
  pin?: string;
  info?: Record<string, string>;
  design?: { list: 'pads' | 'vias' | 'zones' | 'components' | 'tracks' | 'graphics' | 'texts' | 'planes'; index: number };
  placement?: number;
}

// A component as the BOM and pick-and-place exports (lib/pcb/export/csv.ts) and the component list use it, from a
// design or from a pick-and-place file read over a Gerber set (lib/pcb/pnp.ts).
export interface Placement {
  ref: string;
  value?: string;
  // "library:name" where the format has libraries (KiCad).
  footprint?: string;
  // The footprint origin, as the design's own position files give it (KiCad: Y negated, nothing else changed).
  at: Pt;
  // The footprint's angle, counter-clockwise; for a bottom part the angle of the footprint flipped about its own X axis
  // and then turned, as KiCad stores it (EAGLE's and Fusion's angles of bottom parts are converted to it).
  rot: number;
  side: 'top' | 'bottom';
  // Assembly attributes of a design ('dnp', 'exclude_from_bom', 'exclude_from_pos_files', 'board_only', 'type': 'smd'
  // or 'through_hole'), each with the value 'yes' unless said otherwise.
  attrs?: Record<string, string>;
  // Other fields of the component (MPN, manufacturer…), for the BOM.
  fields?: Record<string, string>;
}

export interface Stackup {
  // Board thickness in mm.
  thickness?: number;
  // Colours and finish as the source names them (e.g. "Green", "White", "ENIG").
  mask?: string;
  silk?: string;
  finish?: string;
  copperLayers?: number;
}

export interface Board {
  name: string;
  source: 'gerber' | 'kicad' | 'altium' | 'pads' | 'eagle';
  layers: Layer[];
  // Board shape: the edge and its cutouts, outer edges counter-clockwise and cutouts clockwise (lib/pcb/outline.ts).
  outline?: Contour[];
  // Where the shape comes from: the outline layer, the design, the same closed outline drawn on several other layers
  // (as PADS does), or the rectangle around the copper (or around all layers).
  outlineFrom?: 'outline' | 'design' | 'frame' | 'copper' | 'extent';
  stackup?: Stackup;
  objects: BoardObject[];
  // Components of a design, or from a pick-and-place CSV.
  placements: Placement[];
  // The design a design file was read into (lib/pcb/design/build.ts made the layers from it).
  design?: Design;
  warnings: string[];
}

// --- Design files (KiCad, Altium, PADS, EAGLE) ---
//
// Every design reader produces a Design; lib/pcb/design/build.ts turns it into the layers above. Layers are referred
// to by DesignLayer.id, nets by index into `nets` (0: no net), components by index into `components`. Positions are on
// the board (a component's items are already placed), in millimetres with Y up, angles counter-clockwise.

export interface DesignLayer {
  // Unique in the design. KiCad: the canonical name ("F.Cu", "In2.Cu", "B.SilkS", "User.1").
  id: string;
  // The name the design gives it (KiCad's user name, e.g. "GND1.Cu").
  name: string;
  kind: LayerKind;
  side: Side;
  // Copper order: 1 = top … n = bottom.
  copper?: number;
  // A negative plane (Altium internal planes, PADS CAM planes): the board shape in copper, with everything on the layer
  // and the plane's clearances and thermal reliefs (Design.planes) cut out of it.
  plane?: boolean;
  // More about it, e.g. "Glue", "Margin", or KiCad's canonical name when the user renamed the layer.
  label?: string;
}

// A pad's shape in pad coordinates (before the pad's rotation; Y up), centred on `offset` (default: the pad origin,
// which is where the hole is).
export interface PadShape {
  k: 'circle' | 'rect' | 'oval' | 'roundrect' | 'chamfer' | 'trapezoid' | 'octagon' | 'custom';
  w: number;
  h: number;
  // roundrect (and the corners of a chamfer that are not cut): corner radius.
  r?: number;
  // chamfer: the cut corners and how far the cut goes along each side.
  chamfer?: { size: number; corners: ('tl' | 'tr' | 'bl' | 'br')[] };
  // trapezoid: KiCad's rect_delta: the side at −x is h + delta.x long and the one at +x h − delta.x; the side at −y
  // is w + delta.y long and the one at +y w − delta.y (lib/pcb/design/pads.ts).
  delta?: Pt;
  // custom: the shape as solid parts (each counter-clockwise; their union is the pad), in pad coordinates.
  parts?: AperturePart[];
  offset?: Pt;
}

export interface DesignComponent {
  ref: string;
  value: string;
  // Library and footprint name, e.g. "Resistor_SMD:R_0603_1608Metric".
  footprint: string;
  at: Pt;
  rot: number;
  side: 'top' | 'bottom';
  // As Placement.attrs.
  attrs: Record<string, string>;
  // The other fields (properties) of the component.
  fields: Record<string, string>;
  description?: string;
}

export interface DesignPad {
  comp?: number;
  // Pad number or name ("1", "A3", "" for a mounting hole).
  num: string;
  net: number;
  // The pad origin (and hole centre) and the pad's rotation on the board.
  at: Pt;
  rot: number;
  // What is drawn on which layers: copper (per layer when a pad stack differs), and the mask and paste openings, which
  // the reader has already grown or shrunk by their margins (lib/pcb/design/pads.ts).
  shapes: { layers: string[]; shape: PadShape }[];
  // A round hole of diameter d, or a slot w × h (in pad coordinates, turned with the pad).
  hole?: { d: number; slot?: { w: number; h: number }; plated: boolean };
  type: 'smd' | 'th' | 'np' | 'connect';
  // The margins the openings were made with, for inspection and export.
  maskMargin?: number;
  pasteMargin?: number;
  // Pin function and type, as the schematic gives them.
  info?: Record<string, string>;
}

export interface DesignTrack {
  layer: string;
  a: Pt;
  b: Pt;
  w: number;
  net: number;
  // An arc track from a to b around c.
  arc?: { c: Pt; ccw: boolean };
}

export interface DesignVia {
  at: Pt;
  d: number;
  drill: number;
  // The copper layers it spans (first and last), and those its ring is drawn on (all of them unless unused layers
  // are removed), with other diameters per layer from a pad stack.
  from: string;
  to: string;
  layers: string[];
  sizes?: Record<string, number>;
  net: number;
  type: 'through' | 'blind' | 'buried' | 'micro';
  // Where the solder mask is open over the via (not tented), and how much wider than the via the opening is on each
  // side.
  mask?: { top: boolean; bottom: boolean; margin: number };
  // A square pad of side d instead of a round one (PADS via types).
  square?: boolean;
}

export interface DesignZone {
  layers: string[];
  net: number;
  name?: string;
  // The zone's outline as drawn, outer contours counter-clockwise.
  outline: Contour[];
  // The copper as last filled and saved, per layer; each entry is filled with the non-zero rule.
  fill: { layer: string; contours: Contour[] }[];
  // The filled areas are also stroked with this width (older KiCad files; PADS pours, whose outlines are the centre
  // lines of their edges).
  stroke?: number;
  // Copper of the zone drawn as lines with round ends: PADS's thermal spokes (PADTHERM, VIATHERM).
  lines?: { layer: string; a: Pt; b: Pt; w: number }[];
  // A keep-out or rule area: no copper of its own.
  keepout?: boolean;
  // Never filled: its outline is drawn instead.
  unfilled?: boolean;
  // A teardrop, made as a zone.
  teardrop?: boolean;
  comp?: number;
  // The file's own number: KiCad fills higher priorities first; Altium's pour order and PADS's priority count the other
  // way (the KiCad export turns them around).
  priority?: number;
}

export type DesignShape =
  | { line: [Pt, Pt] }
  | { arc: { c: Pt; r: number; start: number; sweep: number } }
  | { circle: { c: Pt; r: number } }
  | { poly: Contour }
  // A shape with holes: outer contours counter-clockwise, holes clockwise.
  | { region: Contour[] }
  // A cubic Bézier curve: start, two control points, end.
  | { curve: [Pt, Pt, Pt, Pt] };

export interface DesignGraphic {
  layer: string;
  shape: DesignShape;
  // Stroke width (0: no outline, only the fill).
  w: number;
  filled: boolean;
  dash?: 'dash' | 'dot' | 'dash_dot' | 'dash_dot_dot';
  comp?: number;
  net?: number;
}

export interface DesignText {
  layer: string;
  // The text as shown: variables already replaced; KiCad's markup (^{…}, _{…}, ~{…}) is kept.
  s: string;
  // The anchor and the angle the text is drawn at (a footprint's text included).
  at: Pt;
  rot: number;
  // Glyph height and width, and stroke width.
  h: number;
  w: number;
  thick: number;
  mirror: boolean;
  just: { h: 'left' | 'center' | 'right'; v: 'top' | 'middle' | 'bottom' };
  italic?: boolean;
  bold?: boolean;
  // Lines this many times KiCad's pitch apart (Altium and EAGLE texts; KiCad's own plots ignore its line_spacing, so
  // the KiCad reader leaves it out and the KiCad export writes such a text line by line).
  lineSpacing?: number;
  // A TrueType font the design asks for; the stroke font stands in, unless `outline` has the glyphs.
  font?: string;
  // The glyph outlines the file stores for TrueType text (KiCad's render cache), on the board, Y up.
  outline?: Contour[];
  // Drawn as a filled box with the letters cut out, the box this far around them (default: a ninth of the height).
  knockout?: boolean;
  knockoutMargin?: number;
  // A text box's text: lines longer than this are broken at spaces.
  wrap?: number;
  comp?: number;
  // 'reference', 'value', or 'user' (and other footprint fields).
  role?: string;
}

// A plane whose copper the file does not store: the board shape in copper (Altium internal planes, PADS CAM planes)
// or a plane area (PADS mixed planes whose flood is not saved), with its net, the distance kept from the board edge,
// round clearances around holes that pass through without connecting, and thermal reliefs around those that connect:
// a ring of width `gap` cut around the hole from diameter d outwards, interrupted by `spokes` copper spokes of width
// `width`, the first at `angle` degrees. Several planes can share a layer; later ones lie over earlier ones.
export interface DesignPlane {
  layer: string;
  net: number;
  pullback: number;
  clearances: { at: Pt; d: number }[];
  thermals: { at: Pt; d: number; gap: number; spokes: number; width: number; angle: number }[];
  // A plane area instead of the board shape (PADS mixed planes, EAGLE polygons): outer contours counter-clockwise,
  // holes clockwise.
  area?: Contour[];
  // The area's outline is also drawn with this width (EAGLE polygons, whose outline is the centre line of their edge).
  stroke?: number;
  name?: string;
  // More about it for inspection (EAGLE: rank, isolation, width).
  info?: Record<string, string>;
  // Other shapes cut out of it, after the clearances: copper cut-outs, other planes over it with the gap between
  // them, and the copper of other nets on the layer grown by the clearance (a filled shape with a stroke of twice the
  // clearance), as graphics are drawn.
  cuts?: { shape: DesignShape; w: number; filled: boolean }[];
  // What else is drawn on the layer is copper over the plane (PADS mixed planes), instead of being cut out of it
  // (Altium's split lines, PADS CAM planes).
  positive?: boolean;
}

// A hole that is not part of a pad or via (Altium free holes, EAGLE holes).
export interface DesignHole {
  at: Pt;
  d: number;
  slot?: { w: number; h: number; rot: number };
  plated: boolean;
}

export interface Design {
  // The format and version the file was read as, e.g. "KiCad 9 (20241229)".
  format: string;
  layers: DesignLayer[];
  nets: string[];
  // The board shape: outer edges counter-clockwise, cutouts clockwise. Empty when the design has none.
  outline: Contour[];
  components: DesignComponent[];
  pads: DesignPad[];
  tracks: DesignTrack[];
  vias: DesignVia[];
  zones: DesignZone[];
  graphics: DesignGraphic[];
  texts: DesignText[];
  holes: DesignHole[];
  planes?: DesignPlane[];
  stackup?: Stackup;
  // The origin of the design's own drill and placement files, when the design sets one (KiCad's drill/place file
  // origin, `aux_axis_origin`; Altium's board origin). The pick-and-place export offers it.
  placeOrigin?: Pt;
  // Dashed lines: the length of a dash and of a gap, in line widths (KiCad's plot settings; 12 and 3 if not given).
  dash?: { dash: number; gap: number };
  // Things the file has that are not shown, and other notes on reading it.
  warnings: string[];
}

export function emptyBox(): Box {
  return { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
}

export function isEmptyBox(b: Box): boolean {
  return !(b.minX <= b.maxX && b.minY <= b.maxY);
}

export function unionBox(a: Box, b: Box): Box {
  return {
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY),
  };
}
