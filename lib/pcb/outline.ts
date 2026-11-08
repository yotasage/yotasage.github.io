// The shape of the board: the lines and arcs of the outline (profile) layer joined into closed loops, the outer edge
// and its cutouts. Ends that do not quite meet are joined when the gap is smaller than the line is wide (gaps up to
// 0.1 mm), and a loop that stays open by less than 0.5 mm is closed with a straight line. Without an outline layer,
// or when no loop closes, the shape is the rectangle around the copper.
import { addPoint, arcPoint, contourArea, counterClockwise, reverseContour, segArc } from './geometry';
import { Box, Contour, ContourSeg, emptyBox, isEmptyBox, Layer, Pt, unionBox } from './model';

export interface BoardShape {
  contours: Contour[];
  // Where the shape comes from: the outline layer, an outline drawn on several other layers, or the extent of the
  // copper (or of all layers).
  from: 'outline' | 'frame' | 'copper' | 'extent';
  // The layer it was made from.
  layer?: string;
  warnings: string[];
}

// A piece of the outline between two ends; arcs keep their centre and direction.
interface Piece {
  a: Pt;
  b: Pt;
  arc?: { c: Pt; ccw: boolean };
}

const MAX_JOIN = 0.1;
const MAX_CLOSE = 0.5;

function pieces(layer: Layer): { pieces: Piece[]; loops: Contour[]; width: number } {
  const out: Piece[] = [];
  const loops: Contour[] = [];
  let width = 0;
  for (const item of layer.items) {
    if (!item.dark) continue;
    if (item.k === 'line') {
      if (item.a.x === item.b.x && item.a.y === item.b.y) continue;
      out.push({ a: item.a, b: item.b });
      width = Math.max(width, item.w);
    } else if (item.k === 'arc') {
      width = Math.max(width, item.w);
      const a = arcPoint(item.c, item.r, item.start);
      if (Math.abs(item.sweep) >= 360) {
        // A full circle is a loop of its own (a round cutout or board).
        loops.push({ start: a, segs: [{ to: a, arc: { c: item.c, ccw: item.sweep > 0 } }] });
        continue;
      }
      out.push({ a, b: arcPoint(item.c, item.r, item.start + item.sweep), arc: { c: item.c, ccw: item.sweep > 0 } });
    } else if (item.k === 'region') {
      for (const c of item.contours) loops.push(c);
    }
  }
  return { pieces: out, loops, width };
}

// A grid of piece ends, to find the piece that continues a chain.
class EndGrid {
  private cells = new Map<string, number[]>();

  constructor(private size: number) {}

  private key(x: number, y: number): string {
    return `${Math.floor(x / this.size)},${Math.floor(y / this.size)}`;
  }

  add(p: Pt, id: number) {
    const k = this.key(p.x, p.y);
    const list = this.cells.get(k);
    if (list) list.push(id);
    else this.cells.set(k, [id]);
  }

  near(p: Pt): number[] {
    const cx = Math.floor(p.x / this.size);
    const cy = Math.floor(p.y / this.size);
    const out: number[] = [];
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        const list = this.cells.get(`${cx + dx},${cy + dy}`);
        if (list) out.push(...list);
      }
    }
    return out;
  }
}

function dist(a: Pt, b: Pt): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function reversePiece(p: Piece): Piece {
  return { a: p.b, b: p.a, ...(p.arc ? { arc: { c: p.arc.c, ccw: !p.arc.ccw } } : {}) };
}

// Joins pieces into chains, end to start, within the tolerance.
function chains(list: Piece[], tol: number): Piece[][] {
  const grid = new EndGrid(Math.max(tol * 2, 1e-3));
  // Ends are numbered 2i (start of piece i) and 2i+1 (its end).
  list.forEach((p, i) => {
    grid.add(p.a, 2 * i);
    grid.add(p.b, 2 * i + 1);
  });
  const used = new Uint8Array(list.length);
  const next = (at: Pt): Piece | null => {
    let best = -1;
    let bestD = Infinity;
    for (const e of grid.near(at)) {
      const i = e >> 1;
      if (used[i]) continue;
      const d = dist(at, e & 1 ? list[i].b : list[i].a);
      if (d <= tol && d < bestD) {
        bestD = d;
        best = e;
      }
    }
    if (best < 0) return null;
    const i = best >> 1;
    used[i] = 1;
    return best & 1 ? reversePiece(list[i]) : list[i];
  };
  const out: Piece[][] = [];
  for (let i = 0; i < list.length; i += 1) {
    if (used[i]) continue;
    used[i] = 1;
    const chain: Piece[] = [list[i]];
    // Forward from the end, then backward from the start.
    for (;;) {
      const end = chain[chain.length - 1].b;
      if (chain.length > 1 && dist(end, chain[0].a) <= tol) break;
      const p = next(end);
      if (!p) break;
      chain.push(p);
    }
    if (!(chain.length > 1 && dist(chain[chain.length - 1].b, chain[0].a) <= tol)) {
      for (;;) {
        const p = next(chain[0].a);
        if (!p) break;
        chain.unshift(reversePiece(p));
        if (dist(chain[chain.length - 1].b, chain[0].a) <= tol) break;
      }
    }
    out.push(chain);
  }
  return out;
}

function toContour(chain: Piece[]): Contour {
  const start = chain[0].a;
  const segs: ContourSeg[] = chain.map((p, i) => {
    // The last piece ends exactly at the start, and each piece where the next begins.
    const to = i === chain.length - 1 ? start : chain[i + 1].a;
    return p.arc ? { to, arc: p.arc } : { to };
  });
  return { start, segs };
}

function chainLength(chain: Piece[]): number {
  return chain.reduce((sum, p) => sum + dist(p.a, p.b), 0);
}

// Points along a contour (arcs in steps), for containment tests.
export function contourPoints(c: Contour, stepDeg = 10): Pt[] {
  const pts: Pt[] = [c.start];
  let from = c.start;
  for (const seg of c.segs) {
    if (seg.arc) {
      const { start, sweep } = segArc(from, seg);
      const r = dist(from, seg.arc.c);
      const n = Math.max(1, Math.ceil(Math.abs(sweep) / stepDeg));
      for (let k = 1; k < n; k += 1) pts.push(arcPoint(seg.arc.c, r, start + (sweep * k) / n));
    }
    pts.push(seg.to);
    from = seg.to;
  }
  return pts;
}

function insidePolygon(p: Pt, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    const a = poly[i];
    const b = poly[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

function contourBox(c: Contour): Box {
  const box = emptyBox();
  for (const p of contourPoints(c)) addPoint(box, p.x, p.y);
  return box;
}

// Orients loops by how deep they are nested: outer edges counter-clockwise, cutouts clockwise, islands in cutouts
// counter-clockwise again, so that a non-zero fill gives the board.
function orient(loops: Contour[]): Contour[] {
  const polys = loops.map((c) => contourPoints(c));
  const boxes = loops.map(contourBox);
  const areas = loops.map((c) => Math.abs(contourArea(c)));
  return loops.map((c, i) => {
    // A few points of this loop, tested against every larger loop around it; most of them decide, so that loops
    // touching at a point are still told apart.
    const pts = polys[i];
    const probes = [0, 1, 2, 3, 4].map((k) => pts[Math.floor((k * pts.length) / 5)]);
    let depth = 0;
    for (let k = 0; k < loops.length; k += 1) {
      if (k === i || areas[k] <= areas[i]) continue;
      const b = boxes[k];
      const a = boxes[i];
      if (a.minX < b.minX || a.maxX > b.maxX || a.minY < b.minY || a.maxY > b.maxY) continue;
      const inside = probes.filter((p) => insidePolygon(p, polys[k])).length;
      if (inside * 2 > probes.length) depth += 1;
    }
    const ccw = counterClockwise(c);
    return depth % 2 === 0 ? ccw : reverseContour(ccw);
  });
}

// Loops are kept as long as the layer's items are, since the board is built again after every change of a layer.
const loopCache = new WeakMap<object, { contours: Contour[]; warnings: string[] }>();
const lineLoopCache = new WeakMap<object, { contours: Contour[]; warnings: string[] }>();

// The closed loops of a layer; `linesOnly` leaves regions out.
export function shapeFromOutline(layer: Layer, linesOnly = false): { contours: Contour[]; warnings: string[] } {
  const cache = linesOnly ? lineLoopCache : loopCache;
  let s = cache.get(layer.items);
  if (!s) {
    s = findLoops(layer, linesOnly);
    cache.set(layer.items, s);
  }
  return s;
}

function findLoops(layer: Layer, linesOnly: boolean): { contours: Contour[]; warnings: string[] } {
  const { pieces: list, loops: regionLoops, width } = pieces(layer);
  const loops = linesOnly ? regionLoops.filter((c) => c.segs.length === 1 && c.segs[0].arc) : regionLoops;
  const warnings: string[] = [];
  const tol = Math.min(MAX_JOIN, Math.max(2e-3, width / 2));
  const closed: Contour[] = [...loops];
  let open = 0;
  for (const chain of chains(list, tol)) {
    const gap = dist(chain[chain.length - 1].b, chain[0].a);
    if (gap <= tol) {
      closed.push(toContour(chain));
    } else if (gap <= MAX_CLOSE && chainLength(chain) > gap * 20) {
      // Closed with a straight line over the gap.
      closed.push(toContour([...chain, { a: chain[chain.length - 1].b, b: chain[0].a }]));
      warnings.push(`The board outline had a gap of ${gap.toFixed(3)} mm, which was closed.`);
    } else {
      open += 1;
    }
  }
  if (open && closed.length) warnings.push(`${open} line${open === 1 ? '' : 's'} of the outline layer do not form a closed shape and were left out of the board shape.`);
  // Tiny loops (a dot or a drawing artefact) are not board edges.
  const kept = closed.filter((c) => Math.abs(contourArea(c)) > 1e-4);
  return { contours: orient(kept), warnings };
}

function boxContour(b: Box): Contour {
  return {
    start: { x: b.minX, y: b.minY },
    segs: [{ to: { x: b.maxX, y: b.minY } }, { to: { x: b.maxX, y: b.maxY } }, { to: { x: b.minX, y: b.maxY } }, { to: { x: b.minX, y: b.minY } }],
  };
}

// Layers with more items than this are not searched for a board frame (it would take too long, and boards that
// large come with an outline layer).
const FRAME_SEARCH_ITEMS = 60000;

// Without an outline layer: the same closed outline drawn on several layers (PADS adds the board outline to every
// CAM document, as in Linear's DC2637A), as the largest loop of each, around the middle of the copper.
function shapeFromFrames(layers: Layer[], around: Box): { contours: Contour[]; layers: string[] } | null {
  const found = new Map<string, { contour: Contour; area: number; layers: string[] }>();
  const cx = (around.minX + around.maxX) / 2;
  const cy = (around.minY + around.maxY) / 2;
  for (const l of layers) {
    if (l.kind === 'drill' || l.items.length > FRAME_SEARCH_ITEMS || !l.items.some((i) => i.k === 'line' || i.k === 'arc')) continue;
    // Lines and arcs only: regions of copper are pours, not frames.
    const loops = shapeFromOutline({ ...l, items: l.items }, true).contours;
    let best: Contour | null = null;
    let bestArea = 0;
    for (const c of loops) {
      const a = Math.abs(contourArea(c));
      if (a > bestArea) {
        bestArea = a;
        best = c;
      }
    }
    if (!best) continue;
    const b = contourBox(best);
    if (!(b.minX <= cx && cx <= b.maxX && b.minY <= cy && cy <= b.maxY)) continue;
    const key = [b.minX, b.minY, b.maxX, b.maxY].map((v) => Math.round(v * 20)).join(',');
    const entry = found.get(key);
    if (entry) entry.layers.push(l.name);
    else found.set(key, { contour: best, area: bestArea, layers: [l.name] });
  }
  const aroundArea = (around.maxX - around.minX) * (around.maxY - around.minY);
  let pick: { contour: Contour; area: number; layers: string[] } | null = null;
  for (const e of found.values()) {
    if (e.layers.length < 2 || e.area < aroundArea * 0.25) continue;
    if (!pick || e.layers.length > pick.layers.length || (e.layers.length === pick.layers.length && e.area > pick.area)) pick = e;
  }
  return pick ? { contours: orient([pick.contour]), layers: pick.layers } : null;
}

// The board shape from the layers: the first outline layer that gives closed loops; else a closed outline drawn on
// several layers; else the copper's extent, or that of all layers.
export function boardShape(layers: Layer[]): BoardShape | null {
  const warnings: string[] = [];
  for (const l of layers) {
    if (l.kind !== 'outline' || !l.items.length) continue;
    const s = shapeFromOutline(l);
    if (s.contours.length) return { contours: s.contours, from: 'outline', layer: l.id, warnings: s.warnings };
    warnings.push(`The outline layer ${l.name} has no closed shape, so the board shape is taken from the other layers.`);
  }
  const copper = layers.filter((l) => l.kind === 'copper' && !isEmptyBox(l.bbox));
  const pick = copper.length ? copper : layers.filter((l) => !isEmptyBox(l.bbox) && l.kind !== 'drill');
  if (!pick.length) return null;
  let box = { ...pick[0].bbox };
  for (const l of pick.slice(1)) box = unionBox(box, l.bbox);
  const frame = shapeFromFrames(layers, box);
  if (frame) {
    const names = frame.layers.length > 3 ? `${frame.layers.slice(0, 3).join(', ')} and ${frame.layers.length - 3} more` : frame.layers.join(', ');
    return { contours: frame.contours, from: 'frame', warnings: [...warnings, `There is no board outline layer; the board shape is the outline drawn on ${names}.`] };
  }
  return { contours: [boxContour(box)], from: copper.length ? 'copper' : 'extent', warnings };
}

export function shapeBox(contours: Contour[]): Box {
  let box = emptyBox();
  for (const c of contours) box = unionBox(box, contourBox(c));
  return box;
}
