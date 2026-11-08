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
  items: ArtItem[];
  apertures: Aperture[];
  bbox: Box;
}

// What a click on an item reports (S4). For Gerber X2 these are the object attributes: .N (net), .P (component, pin
// and pin name), .C (component), and any others in `info`.
export interface BoardObject {
  kind: string;
  net?: string;
  component?: string;
  pin?: string;
  info?: Record<string, string>;
}

export interface Placement {
  ref: string;
  value?: string;
  footprint?: string;
  at: Pt;
  rot: number;
  side: 'top' | 'bottom';
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
