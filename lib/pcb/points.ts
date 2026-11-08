// Points of interest on a layer: pad centres (flashes), hole centres and slot ends, and the ends of lines and arcs,
// each with a radius (the pad, the hole, half the line width). A grid index finds the nearest one quickly, also on
// layers with a million items: measuring snaps to them, and drill files without a header are fitted to the pads with
// them. An index is built the first time a layer is asked for, and kept as long as the layer's items are.
import { apertureRadius, arcPoint } from './geometry';
import { Layer, Pt } from './model';

export type PointKind = 'pad' | 'hole' | 'end';

const KIND_CODE: Record<PointKind, number> = { pad: 0, hole: 1, end: 2 };
const KINDS: PointKind[] = ['pad', 'hole', 'end'];

export interface PointIndex {
  count: number;
  xs: Float64Array;
  ys: Float64Array;
  rs: Float32Array;
  kinds: Uint8Array;
  // The grid: cell size, origin, size, and where each cell's points start (points are sorted by cell).
  cell: number;
  minX: number;
  minY: number;
  cols: number;
  rows: number;
  starts: Uint32Array;
}

export interface FoundPoint {
  p: Pt;
  kind: PointKind;
  r: number;
  dist: number;
}

// Most cells a grid gets, to keep its memory small.
const MAX_CELLS = 1 << 20;

class Growable {
  xs = new Float64Array(1024);
  ys = new Float64Array(1024);
  rs = new Float32Array(1024);
  kinds = new Uint8Array(1024);
  n = 0;

  add(x: number, y: number, r: number, kind: number) {
    if (!(Number.isFinite(x) && Number.isFinite(y))) return;
    if (this.n === this.xs.length) {
      const grow = <T extends Float64Array | Float32Array | Uint8Array>(a: T): T => {
        const b = new (a.constructor as new (n: number) => T)(a.length * 2);
        b.set(a);
        return b;
      };
      this.xs = grow(this.xs);
      this.ys = grow(this.ys);
      this.rs = grow(this.rs);
      this.kinds = grow(this.kinds);
    }
    this.xs[this.n] = x;
    this.ys[this.n] = y;
    this.rs[this.n] = r;
    this.kinds[this.n] = kind;
    this.n += 1;
  }
}

function collect(layer: Layer): Growable {
  const g = new Growable();
  const radii = layer.apertures.map(apertureRadius);
  for (const item of layer.items) {
    if (!item.dark) continue;
    switch (item.k) {
      case 'flash':
        g.add(item.at.x, item.at.y, (radii[item.ap] ?? 0) * item.scale, KIND_CODE.pad);
        break;
      case 'hole':
        g.add(item.at.x, item.at.y, item.d / 2, KIND_CODE.hole);
        if (item.to) g.add(item.to.x, item.to.y, item.d / 2, KIND_CODE.hole);
        break;
      case 'line':
        g.add(item.a.x, item.a.y, item.w / 2, KIND_CODE.end);
        if (item.b.x !== item.a.x || item.b.y !== item.a.y) g.add(item.b.x, item.b.y, item.w / 2, KIND_CODE.end);
        break;
      case 'arc': {
        if (Math.abs(item.sweep) >= 360) break;
        const a = arcPoint(item.c, item.r, item.start);
        const b = arcPoint(item.c, item.r, item.start + item.sweep);
        g.add(a.x, a.y, item.w / 2, KIND_CODE.end);
        g.add(b.x, b.y, item.w / 2, KIND_CODE.end);
        break;
      }
      default:
        break;
    }
  }
  return g;
}

export function buildPointIndex(layer: Layer): PointIndex {
  const g = collect(layer);
  const n = g.n;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < n; i += 1) {
    const x = g.xs[i];
    const y = g.ys[i];
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  if (!n) return { count: 0, xs: g.xs, ys: g.ys, rs: g.rs, kinds: g.kinds, cell: 1, minX: 0, minY: 0, cols: 1, rows: 1, starts: new Uint32Array(2) };
  const w = Math.max(maxX - minX, 1e-3);
  const h = Math.max(maxY - minY, 1e-3);
  // About two points per cell, within the cell limit.
  let cell = Math.max(Math.sqrt((w * h) / Math.max(1, n / 2)), 0.02);
  while (Math.ceil(w / cell + 1) * Math.ceil(h / cell + 1) > MAX_CELLS) cell *= 1.5;
  const cols = Math.ceil(w / cell) + 1;
  const rows = Math.ceil(h / cell) + 1;
  const cellOf = new Uint32Array(n);
  const counts = new Uint32Array(cols * rows + 1);
  for (let i = 0; i < n; i += 1) {
    const c = Math.floor((g.ys[i] - minY) / cell) * cols + Math.floor((g.xs[i] - minX) / cell);
    cellOf[i] = c;
    counts[c + 1] += 1;
  }
  for (let c = 1; c < counts.length; c += 1) counts[c] += counts[c - 1];
  const starts = counts.slice();
  const fill = counts.slice();
  const xs = new Float64Array(n);
  const ys = new Float64Array(n);
  const rs = new Float32Array(n);
  const kinds = new Uint8Array(n);
  for (let i = 0; i < n; i += 1) {
    const k = fill[cellOf[i]]++;
    xs[k] = g.xs[i];
    ys[k] = g.ys[i];
    rs[k] = g.rs[i];
    kinds[k] = g.kinds[i];
  }
  return { count: n, xs, ys, rs, kinds, cell, minX, minY, cols, rows, starts };
}

// Calls `visit` for every point in the cells that a box around p of half-size r touches. Stops when it returns true.
function scan(ix: PointIndex, p: Pt, r: number, visit: (k: number) => boolean | void): void {
  if (!ix.count) return;
  const c0 = Math.max(0, Math.floor((p.x - r - ix.minX) / ix.cell));
  const c1 = Math.min(ix.cols - 1, Math.floor((p.x + r - ix.minX) / ix.cell));
  const r0 = Math.max(0, Math.floor((p.y - r - ix.minY) / ix.cell));
  const r1 = Math.min(ix.rows - 1, Math.floor((p.y + r - ix.minY) / ix.cell));
  if (c1 < c0 || r1 < r0) return;
  for (let row = r0; row <= r1; row += 1) {
    for (let col = c0; col <= c1; col += 1) {
      const cell = row * ix.cols + col;
      for (let k = ix.starts[cell]; k < ix.starts[cell + 1]; k += 1) if (visit(k)) return;
    }
  }
}

// How much closer a centre (pad or hole) counts than the end of a line, so that centres win when both are near.
const CENTRE_PREFERENCE = 0.6;

// The point nearest to p within maxDist on any of the indices, preferring pad and hole centres.
export function nearestPoint(indices: PointIndex[], p: Pt, maxDist: number): FoundPoint | null {
  let best: FoundPoint | null = null;
  let bestScore = Infinity;
  for (const ix of indices) {
    // Zoomed far out the box covers too many cells to be quick; the nearest point is then not useful anyway.
    if (((2 * maxDist) / ix.cell) ** 2 > 40000) continue;
    scan(ix, p, maxDist, (k) => {
      const d = Math.hypot(ix.xs[k] - p.x, ix.ys[k] - p.y);
      if (d > maxDist) return;
      const kind = KINDS[ix.kinds[k]];
      const score = kind === 'end' ? d : d * CENTRE_PREFERENCE;
      if (score < bestScore) {
        bestScore = score;
        best = { p: { x: ix.xs[k], y: ix.ys[k] }, kind, r: ix.rs[k], dist: d };
      }
    });
  }
  return best;
}

// Whether p lies on a pad, a hole or the end of a line: within its radius (and a small tolerance) of its centre.
export function onPoint(indices: PointIndex[], p: Pt, tolerance: number, maxRadius: number): boolean {
  for (const ix of indices) {
    let found = false;
    scan(ix, p, maxRadius + tolerance, (k) => {
      const d = Math.hypot(ix.xs[k] - p.x, ix.ys[k] - p.y);
      if (d <= ix.rs[k] + tolerance) {
        found = true;
        return true;
      }
      return false;
    });
    if (found) return true;
  }
  return false;
}

// The largest radius among the points of an index (to know how far onPoint must look).
export function maxRadius(ix: PointIndex): number {
  let r = 0;
  for (let k = 0; k < ix.count; k += 1) if (ix.rs[k] > r) r = ix.rs[k];
  return r;
}

// Indices kept as long as the layer's items are.
const cache = new WeakMap<object, PointIndex>();

export function pointIndex(layer: Layer): PointIndex {
  let ix = cache.get(layer.items);
  if (!ix) {
    ix = buildPointIndex(layer);
    cache.set(layer.items, ix);
  }
  return ix;
}
