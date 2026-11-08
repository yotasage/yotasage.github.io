// Turns the items of a layer into Path2D objects once, the first time the layer is drawn, so that each frame only
// sets a transform and fills or strokes a few paths. Items are grouped into runs of the same polarity; within a run,
// lines and arcs are grouped by width and cap, and everything filled goes into one path filled with the non-zero rule
// (every solid shape runs counter-clockwise, holes clockwise, so overlapping shapes add up). Large layers are also
// split into tiles, so that a zoomed-in view only draws the tiles on screen. Paths are in board millimetres relative
// to the layer's origin, which keeps the numbers small for the 32-bit floats of the canvas.
import { addContour, addItem, addPoint, apertureBox, apertureRadius, DEG, polyArea, segArc } from '../geometry';
import { Aperture, AperturePart, Box, Contour, emptyBox, isEmptyBox, Layer, Pt } from '../model';

export interface StrokeGroup {
  w: number;
  cap: CanvasLineCap;
  path: Path2D;
}

// A flash of an aperture whose clear parts may not be expressed with the non-zero rule; it is drawn on its own
// (see view.ts) so that its holes do not erase what is under it.
export interface SeparateFlash {
  ap: number;
  // The flash transform, relative to the layer origin.
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
  // Radius around (e, f) that holds the whole flash.
  r: number;
}

// The items of a run in one part of the layer; `box` holds all of them (relative to the origin, as the paths).
export interface Tile {
  box: Box;
  fill: Path2D | null;
  strokes: StrokeGroup[];
}

export interface Run {
  dark: boolean;
  tiles: Tile[];
  separate: SeparateFlash[];
}

export interface PreparedLayer {
  origin: Pt;
  runs: Run[];
  // The parts of apertures drawn on their own, as paths in aperture coordinates.
  apertureParts: Map<number, { dark: boolean; path: Path2D }[]>;
  // Number of items, for statistics.
  count: number;
}

// About how many items go into one tile of a large layer, and the most tiles along a side.
const ITEMS_PER_TILE = 4000;
const MAX_GRID = 24;

export type ApertureClass = 'empty' | 'solid' | 'holed' | 'separate';

function partBox(part: AperturePart): Box {
  const box = emptyBox();
  if (part.circle) addPoint(box, part.circle.c.x, part.circle.c.y, part.circle.r);
  if (part.poly) for (const p of part.poly) addPoint(box, p.x, p.y);
  return box;
}

function convex(poly: Pt[]): boolean {
  let sign = 0;
  for (let i = 0; i < poly.length; i += 1) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const c = poly[(i + 2) % poly.length];
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(cross) < 1e-15) continue;
    if (sign === 0) sign = Math.sign(cross);
    else if (Math.sign(cross) !== sign) return false;
  }
  return true;
}

function insideConvex(poly: Pt[], p: Pt): boolean {
  for (let i = 0; i < poly.length; i += 1) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    if ((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x) < -1e-12) return false;
  }
  return true;
}

// Points around the edge of a part, to test whether it lies inside another.
function edgePoints(part: AperturePart): Pt[] {
  if (part.poly) return part.poly;
  const { c, r } = part.circle;
  const out: Pt[] = [];
  for (let k = 0; k < 16; k += 1) out.push({ x: c.x + r * Math.cos((k * Math.PI) / 8), y: c.y + r * Math.sin((k * Math.PI) / 8) });
  return out;
}

function boxesOverlap(a: Box, b: Box): boolean {
  return a.minX < b.maxX && b.minX < a.maxX && a.minY < b.maxY && b.minY < a.maxY;
}

// Solid: no clear parts. Holed: one solid convex shape with clear parts that lie inside it and not on each other, as
// standard apertures with a hole; these can be drawn with the non-zero rule. Anything else is drawn on its own.
export function classify(ap: Aperture): ApertureClass {
  if (!ap.parts.length) return 'empty';
  if (ap.parts.every((p) => p.dark)) return 'solid';
  const [first, ...rest] = ap.parts;
  if (!first.dark || rest.some((p) => p.dark)) return 'separate';
  const outline = first.poly ?? null;
  if (outline && !convex(outline)) return 'separate';
  const inside = (p: Pt) => (outline ? insideConvex(outline, p) : Math.hypot(p.x - first.circle.c.x, p.y - first.circle.c.y) <= first.circle.r * (1 - 1e-9));
  const boxes = rest.map(partBox);
  for (let i = 0; i < rest.length; i += 1) {
    if (!edgePoints(rest[i]).every(inside)) return 'separate';
    for (let k = 0; k < i; k += 1) if (boxesOverlap(boxes[i], boxes[k])) return 'separate';
  }
  return 'holed';
}

// Filled paths are not closed with closePath(): filling closes every subpath anyway, and in Chromium closePath() on a
// Path2D takes time proportional to the size of the path, which made large layers take seconds.
function circlePath(path: Path2D, x: number, y: number, r: number, ccw: boolean) {
  path.moveTo(x + r, y);
  if (ccw) path.arc(x, y, r, 0, 2 * Math.PI, false);
  else path.arc(x, y, r, 2 * Math.PI, 0, true);
}

function polyPath(path: Path2D, pts: Pt[], m: { a: number; b: number; c: number; d: number; e: number; f: number }, reverse: boolean) {
  const n = pts.length;
  for (let k = 0; k < n; k += 1) {
    const p = pts[reverse ? n - 1 - k : k];
    const x = m.a * p.x + m.c * p.y + m.e;
    const y = m.b * p.x + m.d * p.y + m.f;
    if (k === 0) path.moveTo(x, y);
    else path.lineTo(x, y);
  }
}

const IDENT = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

// The parts of an aperture as paths in aperture coordinates, for flashes drawn on their own.
function separateParts(ap: Aperture): { dark: boolean; path: Path2D }[] {
  return ap.parts.map((part) => {
    const path = new Path2D();
    if (part.circle) circlePath(path, part.circle.c.x, part.circle.c.y, part.circle.r, true);
    if (part.poly) polyPath(path, part.poly, IDENT, polyArea(part.poly) < 0);
    return { dark: part.dark, path };
  });
}

export function layerOrigin(box: Box): Pt {
  if (isEmptyBox(box)) return { x: 0, y: 0 };
  return { x: Math.round((box.minX + box.maxX) / 2), y: Math.round((box.minY + box.maxY) / 2) };
}

// The board shape as one path: outer edges counter-clockwise and cutouts clockwise, so a non-zero fill is the board.
export interface PreparedShape {
  origin: Pt;
  path: Path2D;
  box: Box;
}

function contourPath(path: Path2D, contour: Contour, ox: number, oy: number) {
  let from = contour.start;
  path.moveTo(from.x - ox, from.y - oy);
  for (const seg of contour.segs) {
    if (seg.arc) {
      const { start, sweep } = segArc(from, seg);
      const r = Math.hypot(from.x - seg.arc.c.x, from.y - seg.arc.c.y);
      path.arc(seg.arc.c.x - ox, seg.arc.c.y - oy, r, start * DEG, (start + sweep) * DEG, sweep < 0);
    } else {
      path.lineTo(seg.to.x - ox, seg.to.y - oy);
    }
    from = seg.to;
  }
}

export function prepareShape(contours: Contour[]): PreparedShape | null {
  if (!contours.length) return null;
  const box = emptyBox();
  for (const c of contours) addContour(box, c);
  const origin = layerOrigin(box);
  const path = new Path2D();
  for (const c of contours) contourPath(path, c, origin.x, origin.y);
  return { origin, path, box };
}

type BuildTile = Tile & { groups: Map<string, StrokeGroup & { endX: number; endY: number }> };

export function prepareLayer(layer: Layer): PreparedLayer {
  const origin = layerOrigin(layer.bbox);
  const ox = origin.x;
  const oy = origin.y;
  const classes = layer.apertures.map(classify);
  const radii = layer.apertures.map(apertureRadius);
  const boxes = layer.apertures.map(apertureBox);
  const apertureParts = new Map<number, { dark: boolean; path: Path2D }[]>();
  const runs: Run[] = [];

  // A grid of tiles over the layer, for large layers only. An item goes into the tile of its first point; the box of
  // the tile grows to hold all of it.
  const b = layer.bbox;
  const grid = isEmptyBox(b) ? 1 : Math.min(MAX_GRID, Math.max(1, Math.round(Math.sqrt(layer.items.length / ITEMS_PER_TILE))));
  const cellW = (b.maxX - b.minX) / grid || 1;
  const cellH = (b.maxY - b.minY) / grid || 1;

  if (layer.negative && !isEmptyBox(b)) {
    const fill = new Path2D();
    fill.rect(b.minX - ox, b.minY - oy, b.maxX - b.minX, b.maxY - b.minY);
    runs.push({ dark: true, tiles: [{ box: { ...b }, fill, strokes: [] }], separate: [] });
  }

  let run: Run | null = null;
  let tiles = new Map<number, BuildTile>();
  let tile: BuildTile | null = null;
  const useTile = (x: number, y: number) => {
    let key = 0;
    if (grid > 1) {
      const tx = Math.min(grid - 1, Math.max(0, Math.floor((x - b.minX) / cellW)));
      const ty = Math.min(grid - 1, Math.max(0, Math.floor((y - b.minY) / cellH)));
      key = ty * grid + tx;
    }
    tile = tiles.get(key);
    if (!tile) {
      tile = { box: emptyBox(), fill: null, strokes: [], groups: new Map() };
      tiles.set(key, tile);
      run.tiles.push(tile);
    }
  };
  // The stroke group of the current tile with this width and cap, with where its last line ended (to continue it).
  const group = (w: number, cap: CanvasLineCap) => {
    const key = `${w}|${cap}`;
    let g = tile.groups.get(key);
    if (!g) {
      g = { w, cap, path: new Path2D(), endX: NaN, endY: NaN };
      tile.groups.set(key, g);
      tile.strokes.push(g);
    }
    return g;
  };
  const fillPath = () => {
    if (!tile.fill) tile.fill = new Path2D();
    return tile.fill;
  };
  const m = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

  for (const item of layer.items) {
    if (!run || run.dark !== item.dark) {
      run = { dark: item.dark, tiles: [], separate: [] };
      runs.push(run);
      tiles = new Map();
    }
    switch (item.k) {
      case 'line': {
        if (!(item.w > 0)) break;
        useTile(item.a.x, item.a.y);
        addItem(tile.box, item, boxes);
        const ax = item.a.x - ox;
        const ay = item.a.y - oy;
        const bx = item.b.x - ox;
        const by = item.b.y - oy;
        if (ax === bx && ay === by) {
          // A dot: zero-length lines are not stroked by every browser.
          if (item.cap === 'round') circlePath(fillPath(), ax, ay, item.w / 2, true);
          else fillPath().rect(ax - item.w / 2, ay - item.w / 2, item.w, item.w);
          break;
        }
        const g = group(item.w, item.cap);
        if (g.endX !== ax || g.endY !== ay) g.path.moveTo(ax, ay);
        g.path.lineTo(bx, by);
        g.endX = bx;
        g.endY = by;
        break;
      }
      case 'arc': {
        if (!(item.w > 0) || !(item.r > 0)) break;
        useTile(item.c.x, item.c.y);
        addItem(tile.box, item, boxes);
        const g = group(item.w, 'round');
        const cx = item.c.x - ox;
        const cy = item.c.y - oy;
        const a0 = item.start * DEG;
        const a1 = (item.start + item.sweep) * DEG;
        g.path.moveTo(cx + item.r * Math.cos(a0), cy + item.r * Math.sin(a0));
        g.path.arc(cx, cy, item.r, a0, a1, item.sweep < 0);
        g.endX = NaN;
        break;
      }
      case 'flash': {
        const cls = classes[item.ap];
        if (cls === 'empty' || cls === undefined) break;
        const ap = layer.apertures[item.ap];
        const cos = Math.cos(item.rot * DEG) * item.scale;
        const sin = Math.sin(item.rot * DEG) * item.scale;
        const mx = item.mirror === 'x' || item.mirror === 'xy' ? -1 : 1;
        const my = item.mirror === 'y' || item.mirror === 'xy' ? -1 : 1;
        m.a = cos * mx;
        m.b = sin * mx;
        m.c = -sin * my;
        m.d = cos * my;
        m.e = item.at.x - ox;
        m.f = item.at.y - oy;
        if (cls === 'separate') {
          if (!apertureParts.has(item.ap)) apertureParts.set(item.ap, separateParts(ap));
          run.separate.push({ ap: item.ap, ...m, r: radii[item.ap] * item.scale });
          break;
        }
        useTile(item.at.x, item.at.y);
        addItem(tile.box, item, boxes);
        const flipped = mx * my < 0;
        const path = fillPath();
        for (const part of ap.parts) {
          // Solid parts counter-clockwise, holes clockwise.
          const ccw = part.dark;
          if (part.circle) {
            const { c, r } = part.circle;
            circlePath(path, m.a * c.x + m.c * c.y + m.e, m.b * c.x + m.d * c.y + m.f, r * item.scale, ccw);
          } else if (part.poly) {
            polyPath(path, part.poly, m, flipped === ccw);
          }
        }
        break;
      }
      case 'region': {
        if (!item.contours.length) break;
        useTile(item.contours[0].start.x, item.contours[0].start.y);
        addItem(tile.box, item, boxes);
        const path = fillPath();
        for (const contour of item.contours) contourPath(path, contour, ox, oy);
        break;
      }
      case 'hole': {
        useTile(item.at.x, item.at.y);
        addItem(tile.box, item, boxes);
        if (item.to && (item.to.x !== item.at.x || item.to.y !== item.at.y)) {
          const g = group(item.d, 'round');
          g.path.moveTo(item.at.x - ox, item.at.y - oy);
          g.path.lineTo(item.to.x - ox, item.to.y - oy);
          g.endX = NaN;
        } else {
          circlePath(fillPath(), item.at.x - ox, item.at.y - oy, item.d / 2, true);
        }
        break;
      }
    }
  }
  // Tile boxes relative to the origin, as the paths; the build state is dropped.
  for (const r of runs) {
    r.tiles = r.tiles.map((t) => ({ box: { minX: t.box.minX - ox, minY: t.box.minY - oy, maxX: t.box.maxX - ox, maxY: t.box.maxY - oy }, fill: t.fill, strokes: t.strokes.map(({ w, cap, path }) => ({ w, cap, path })) }));
  }
  return { origin, runs, apertureParts, count: layer.items.length };
}
