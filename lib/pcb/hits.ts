// What lies under a point of a layer: the items whose shape comes within a tolerance of it, the topmost first, for
// inspecting what a click or tap is on. A grid index per layer, built the first time the layer is asked and kept as
// long as its items are (like the points of points.ts), keeps this fast on layers of hundreds of thousands of items:
// small items are listed in every cell their box touches, large ones (zone fills, long diagonal lines) in a list of
// their own with their boxes. A clear item that covers the point hides what is under it on its layer.
import { addArc, addContour, apertureRadius, DEG, flashMatrix } from './geometry';
import { Aperture, ArtItem, Box, Contour, emptyBox, isEmptyBox, Layer, Pt } from './model';
import { contourPoints } from './outline';

export interface ItemHit {
  // Index into layer.items.
  index: number;
  // Millimetres from the point to the item's shape; 0 on it.
  dist: number;
}

interface ItemIndex {
  cell: number;
  minX: number;
  minY: number;
  cols: number;
  rows: number;
  // Where each cell's items start in `cells` (items by cell, in item order).
  starts: Uint32Array;
  cells: Uint32Array;
  // Items listed on their own, with their boxes (minX, minY, maxX, maxY).
  big: Uint32Array;
  bigBoxes: Float64Array;
  radii: number[];
}

// Most cells a grid gets, and most cells an item may be listed in before it goes to the list of large items.
const MAX_CELLS = 1 << 20;
const MAX_SPAN = 64;

// Writes the box of an item (a little larger where that is simpler) to out[k..k+3]; false when it has none.
function itemBox(item: ArtItem, radii: number[], out: Float64Array, k: number): boolean {
  let x0: number;
  let y0: number;
  let x1: number;
  let y1: number;
  switch (item.k) {
    case 'line': {
      // A square end reaches w/2·√2 from the end point at its corners.
      const h = item.cap === 'square' ? (item.w / 2) * Math.SQRT2 : item.w / 2;
      x0 = Math.min(item.a.x, item.b.x) - h;
      y0 = Math.min(item.a.y, item.b.y) - h;
      x1 = Math.max(item.a.x, item.b.x) + h;
      y1 = Math.max(item.a.y, item.b.y) + h;
      break;
    }
    case 'arc': {
      const b = emptyBox();
      addArc(b, item.c, item.r, item.start, item.sweep, item.w);
      ({ minX: x0, minY: y0, maxX: x1, maxY: y1 } = b);
      break;
    }
    case 'flash': {
      const r = (radii[item.ap] ?? 0) * item.scale;
      x0 = item.at.x - r;
      y0 = item.at.y - r;
      x1 = item.at.x + r;
      y1 = item.at.y + r;
      break;
    }
    case 'region': {
      const b = emptyBox();
      for (const c of item.contours) addContour(b, c);
      ({ minX: x0, minY: y0, maxX: x1, maxY: y1 } = b);
      break;
    }
    case 'hole': {
      const h = item.d / 2;
      const to = item.to ?? item.at;
      x0 = Math.min(item.at.x, to.x) - h;
      y0 = Math.min(item.at.y, to.y) - h;
      x1 = Math.max(item.at.x, to.x) + h;
      y1 = Math.max(item.at.y, to.y) + h;
      break;
    }
    default:
      return false;
  }
  if (!(x0 <= x1 && y0 <= y1)) return false;
  out[k] = x0;
  out[k + 1] = y0;
  out[k + 2] = x1;
  out[k + 3] = y1;
  return true;
}

function buildIndex(layer: Layer): ItemIndex {
  const items = layer.items;
  const n = items.length;
  const radii = layer.apertures.map(apertureRadius);
  const boxes = new Float64Array(4 * n);
  const has = new Uint8Array(n);
  const extent: Box = emptyBox();
  for (let i = 0; i < n; i += 1) {
    if (!itemBox(items[i], radii, boxes, 4 * i)) continue;
    has[i] = 1;
    const k = 4 * i;
    if (boxes[k] < extent.minX) extent.minX = boxes[k];
    if (boxes[k + 1] < extent.minY) extent.minY = boxes[k + 1];
    if (boxes[k + 2] > extent.maxX) extent.maxX = boxes[k + 2];
    if (boxes[k + 3] > extent.maxY) extent.maxY = boxes[k + 3];
  }
  const empty = { cell: 1, minX: 0, minY: 0, cols: 1, rows: 1, starts: new Uint32Array(2), cells: new Uint32Array(0), big: new Uint32Array(0), bigBoxes: new Float64Array(0), radii };
  if (isEmptyBox(extent)) return empty;
  const w = Math.max(extent.maxX - extent.minX, 1e-3);
  const h = Math.max(extent.maxY - extent.minY, 1e-3);
  // About one item per cell, within the cell limit.
  let cell = Math.max(Math.sqrt((w * h) / Math.max(1, n)), 0.02);
  while ((Math.floor(w / cell) + 1) * (Math.floor(h / cell) + 1) > MAX_CELLS) cell *= 1.5;
  const cols = Math.floor(w / cell) + 1;
  const rows = Math.floor(h / cell) + 1;
  const { minX, minY } = extent;
  const colOf = (x: number) => Math.min(cols - 1, Math.max(0, Math.floor((x - minX) / cell)));
  const rowOf = (y: number) => Math.min(rows - 1, Math.max(0, Math.floor((y - minY) / cell)));

  // Count, then fill: cells in order, and items in their order within a cell.
  const counts = new Uint32Array(cols * rows + 1);
  const bigList: number[] = [];
  for (let i = 0; i < n; i += 1) {
    if (!has[i]) continue;
    const k = 4 * i;
    const c0 = colOf(boxes[k]);
    const c1 = colOf(boxes[k + 2]);
    const r0 = rowOf(boxes[k + 1]);
    const r1 = rowOf(boxes[k + 3]);
    if ((c1 - c0 + 1) * (r1 - r0 + 1) > MAX_SPAN) {
      bigList.push(i);
      has[i] = 2;
      continue;
    }
    for (let r = r0; r <= r1; r += 1) for (let c = c0; c <= c1; c += 1) counts[r * cols + c + 1] += 1;
  }
  for (let c = 1; c < counts.length; c += 1) counts[c] += counts[c - 1];
  const starts = counts.slice();
  const fill = counts.slice();
  const cells = new Uint32Array(counts[counts.length - 1]);
  for (let i = 0; i < n; i += 1) {
    if (has[i] !== 1) continue;
    const k = 4 * i;
    const c0 = colOf(boxes[k]);
    const c1 = colOf(boxes[k + 2]);
    const r0 = rowOf(boxes[k + 1]);
    const r1 = rowOf(boxes[k + 3]);
    for (let r = r0; r <= r1; r += 1) for (let c = c0; c <= c1; c += 1) cells[fill[r * cols + c]++] = i;
  }
  const big = Uint32Array.from(bigList);
  const bigBoxes = new Float64Array(4 * big.length);
  big.forEach((i, j) => bigBoxes.set(boxes.subarray(4 * i, 4 * i + 4), 4 * j));
  return { cell, minX, minY, cols, rows, starts, cells, big, bigBoxes, radii };
}

const cache = new WeakMap<object, ItemIndex>();

function indexOf(layer: Layer): ItemIndex {
  let ix = cache.get(layer.items);
  if (!ix) {
    ix = buildIndex(layer);
    cache.set(layer.items, ix);
  }
  return ix;
}

// --- Distances ---

function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

// Even-odd crossings and the distance to the edges of a closed polygon.
function polyInfo(p: Pt, pts: Pt[]): { winding: number; edge: number } {
  let winding = 0;
  let edge = Infinity;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i, i += 1) {
    const a = pts[j];
    const b = pts[i];
    edge = Math.min(edge, segDist(p.x, p.y, a.x, a.y, b.x, b.y));
    // Winding number (Sunday): upward crossings left of the point count +1, downward ones right of it −1.
    if (a.y <= p.y) {
      if (b.y > p.y && (b.x - a.x) * (p.y - a.y) - (p.x - a.x) * (b.y - a.y) > 0) winding += 1;
    } else if (b.y <= p.y && (b.x - a.x) * (p.y - a.y) - (p.x - a.x) * (b.y - a.y) < 0) {
      winding -= 1;
    }
  }
  return { winding, edge };
}

function partDistance(part: Aperture['parts'][number], q: Pt): number {
  if (part.circle) return Math.max(0, Math.hypot(q.x - part.circle.c.x, q.y - part.circle.c.y) - part.circle.r);
  if (!part.poly || part.poly.length < 3) return Infinity;
  const { winding, edge } = polyInfo(q, part.poly);
  return winding !== 0 ? 0 : edge;
}

// Regions are filled with the non-zero rule: inside when the windings of all contours add up to something.
function regionDistance(contours: Contour[], p: Pt): number {
  let winding = 0;
  let edge = Infinity;
  for (const c of contours) {
    const info = polyInfo(p, contourPoints(c, 3));
    winding += info.winding;
    edge = Math.min(edge, info.edge);
  }
  return winding !== 0 ? 0 : edge;
}

// The distance from p to the shape an item covers (0 on it). The holes inside a flash count as part of it, so a
// click in a pad's hole finds the pad.
export function itemDistance(item: ArtItem, layer: Layer, p: Pt, radii?: number[]): number {
  switch (item.k) {
    case 'line': {
      const h = item.w / 2;
      if (item.cap === 'round') return Math.max(0, segDist(p.x, p.y, item.a.x, item.a.y, item.b.x, item.b.y) - h);
      const dx = item.b.x - item.a.x;
      const dy = item.b.y - item.a.y;
      const len = Math.hypot(dx, dy);
      if (len === 0) return Math.hypot(Math.max(0, Math.abs(p.x - item.a.x) - h), Math.max(0, Math.abs(p.y - item.a.y) - h));
      // Along and across the line, from its start.
      const u = ((p.x - item.a.x) * dx + (p.y - item.a.y) * dy) / len;
      const v = Math.abs((p.y - item.a.y) * dx - (p.x - item.a.x) * dy) / len;
      return Math.hypot(Math.max(0, -h - u, u - len - h), Math.max(0, v - h));
    }
    case 'arc': {
      const h = item.w / 2;
      const d = Math.hypot(p.x - item.c.x, p.y - item.c.y);
      if (Math.abs(item.sweep) >= 360) return Math.max(0, Math.abs(d - item.r) - h);
      const angle = Math.atan2(p.y - item.c.y, p.x - item.c.x) / DEG;
      const rel = (((item.sweep > 0 ? angle - item.start : item.start - angle) % 360) + 360) % 360;
      if (rel <= Math.abs(item.sweep)) return Math.max(0, Math.abs(d - item.r) - h);
      const a = item.start * DEG;
      const b = (item.start + item.sweep) * DEG;
      const ends = Math.min(
        Math.hypot(p.x - (item.c.x + item.r * Math.cos(a)), p.y - (item.c.y + item.r * Math.sin(a))),
        Math.hypot(p.x - (item.c.x + item.r * Math.cos(b)), p.y - (item.c.y + item.r * Math.sin(b))),
      );
      return Math.max(0, ends - h);
    }
    case 'flash': {
      const ap = layer.apertures[item.ap];
      if (!ap || !(item.scale > 0)) return Infinity;
      const r = radii?.[item.ap] ?? apertureRadius(ap);
      const far = Math.hypot(p.x - item.at.x, p.y - item.at.y) - r * item.scale;
      // Outside the circle around the whole flash: that distance is close enough.
      if (far > 0) return far;
      // The point in aperture coordinates.
      const m = flashMatrix(item.at, item.rot, item.mirror, item.scale);
      const det = m.a * m.d - m.b * m.c;
      const x = p.x - item.at.x;
      const y = p.y - item.at.y;
      const q = { x: (m.d * x - m.c * y) / det, y: (-m.b * x + m.a * y) / det };
      let best = Infinity;
      for (const part of ap.parts) if (part.dark) best = Math.min(best, partDistance(part, q));
      return best * item.scale;
    }
    case 'region':
      return regionDistance(item.contours, p);
    case 'hole': {
      const to = item.to ?? item.at;
      return Math.max(0, segDist(p.x, p.y, item.at.x, item.at.y, to.x, to.y) - item.d / 2);
    }
    default:
      return Infinity;
  }
}

// Among the items on the point: pads and holes first, then lines and arcs, then regions (zone fills), so a click on
// a pad finds the pad and not the end of the track drawn over it or the zone under it.
const RANK: Record<ArtItem['k'], number> = { flash: 0, hole: 0, line: 1, arc: 1, region: 2 };

// The items of a layer within `tolerance` mm of p: those on the point first (pads before lines before regions, the
// topmost first), then the nearest.
export function hitsAt(layer: Layer, p: Pt, tolerance: number): ItemHit[] {
  if (!layer.items.length) return [];
  const ix = indexOf(layer);
  const found = new Set<number>();
  const c0 = Math.max(0, Math.floor((p.x - tolerance - ix.minX) / ix.cell));
  const c1 = Math.min(ix.cols - 1, Math.floor((p.x + tolerance - ix.minX) / ix.cell));
  const r0 = Math.max(0, Math.floor((p.y - tolerance - ix.minY) / ix.cell));
  const r1 = Math.min(ix.rows - 1, Math.floor((p.y + tolerance - ix.minY) / ix.cell));
  // Zoomed far out the tolerance spans many cells; a click there is not aimed at small items anyway.
  if (c1 >= c0 && r1 >= r0 && (c1 - c0 + 1) * (r1 - r0 + 1) <= 4096) {
    for (let r = r0; r <= r1; r += 1) {
      for (let c = c0; c <= c1; c += 1) {
        const cell = r * ix.cols + c;
        for (let k = ix.starts[cell]; k < ix.starts[cell + 1]; k += 1) found.add(ix.cells[k]);
      }
    }
  }
  const b = ix.bigBoxes;
  for (let j = 0; j < ix.big.length; j += 1) {
    const k = 4 * j;
    if (p.x >= b[k] - tolerance && p.x <= b[k + 2] + tolerance && p.y >= b[k + 1] - tolerance && p.y <= b[k + 3] + tolerance) found.add(ix.big[j]);
  }
  const order = [...found].sort((x, y) => y - x);
  const hits: ItemHit[] = [];
  for (const i of order) {
    const item = layer.items[i];
    const dist = itemDistance(item, layer, p, ix.radii);
    if (!item.dark) {
      // Clear: erases what is under it on this layer, here.
      if (dist === 0) break;
      continue;
    }
    if (dist <= tolerance) hits.push({ index: i, dist });
  }
  // On the point by rank, the topmost first (as found; the sort keeps that order); then by distance.
  const on = hits.filter((h) => h.dist === 0).sort((x, y) => RANK[layer.items[x.index].k] - RANK[layer.items[y.index].k]);
  return on.concat(hits.filter((h) => h.dist > 0).sort((x, y) => x.dist - y.dist));
}

// Builds the index of a layer now (for timing, or to have it ready).
export function indexLayer(layer: Layer): void {
  indexOf(layer);
}
