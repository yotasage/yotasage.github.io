// Geometry for planes drawn from their outlines (PADS plane areas, EAGLE polygons): areas as point lists with their
// boxes, whether a point or a stroke reaches an area, distances, and pad shapes and graphics as filled shapes on the
// board. Shared by lib/pcb/pads/planes.ts and lib/pcb/eagle/pours.ts.
import { padParts } from './pads';
import { contourPoints } from '../outline';
import { Box, Contour, DesignShape, PadShape, Pt } from '../model';

export interface Poly {
  pts: Pt[];
  box: Box;
}

export function polysOf(contours: Contour[], stepDeg = 5): Poly[] {
  return contours.map((c) => {
    const pts = contourPoints(c, stepDeg);
    const box = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
    for (const p of pts) {
      box.minX = Math.min(box.minX, p.x);
      box.minY = Math.min(box.minY, p.y);
      box.maxX = Math.max(box.maxX, p.x);
      box.maxY = Math.max(box.maxY, p.y);
    }
    return { pts, box };
  });
}

export function boxOf(polys: Poly[]): Box {
  const b = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const p of polys) {
    b.minX = Math.min(b.minX, p.box.minX);
    b.minY = Math.min(b.minY, p.box.minY);
    b.maxX = Math.max(b.maxX, p.box.maxX);
    b.maxY = Math.max(b.maxY, p.box.maxY);
  }
  return b;
}

export function overlaps(a: Box, b: Box, margin = 0): boolean {
  return a.minX - margin <= b.maxX && b.minX - margin <= a.maxX && a.minY - margin <= b.maxY && b.minY - margin <= a.maxY;
}

// Inside the area (even-odd over its contours, so holes count as outside).
export function inside(p: Pt, polys: Poly[]): boolean {
  let n = false;
  for (const { pts } of polys) {
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i, i += 1) {
      const a = pts[i];
      const b = pts[j];
      if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) n = !n;
    }
  }
  return n;
}

export function segDist(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2)) : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

export function segSegDist(a: Pt, b: Pt, c: Pt, d: Pt): number {
  const cross = (o: Pt, p: Pt, q: Pt) => (p.x - o.x) * (q.y - o.y) - (p.y - o.y) * (q.x - o.x);
  const d1 = cross(a, b, c);
  const d2 = cross(a, b, d);
  const d3 = cross(c, d, a);
  const d4 = cross(c, d, b);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return 0;
  return Math.min(segDist(a, c, d), segDist(b, c, d), segDist(c, a, b), segDist(d, a, b));
}

// The distance from a segment (a point when a = b) to the edges of an area.
export function edgeDistance(a: Pt, b: Pt, polys: Poly[], limit = Infinity): number {
  let best = Infinity;
  const sb = { minX: Math.min(a.x, b.x), minY: Math.min(a.y, b.y), maxX: Math.max(a.x, b.x), maxY: Math.max(a.y, b.y) };
  for (const { pts, box } of polys) {
    if (Number.isFinite(limit) && !overlaps(sb, box, Math.min(limit, best))) continue;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i, i += 1) {
      const d = segSegDist(a, b, pts[j], pts[i]);
      if (d < best) best = d;
    }
  }
  return best;
}

// Whether a segment of half-width r (a point when a = b) reaches the area.
export function reaches(a: Pt, b: Pt, r: number, polys: Poly[], box: Box): boolean {
  const sb = { minX: Math.min(a.x, b.x), minY: Math.min(a.y, b.y), maxX: Math.max(a.x, b.x), maxY: Math.max(a.y, b.y) };
  if (!overlaps(sb, box, r)) return false;
  if (inside(a, polys) || inside(b, polys)) return true;
  for (const { pts, box: pb } of polys) {
    if (!overlaps(sb, pb, r)) continue;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i, i += 1) if (segSegDist(a, b, pts[j], pts[i]) <= r) return true;
  }
  return false;
}

export function turn(p: Pt, deg: number): Pt {
  const a = (deg * Math.PI) / 180;
  return { x: p.x * Math.cos(a) - p.y * Math.sin(a), y: p.x * Math.sin(a) + p.y * Math.cos(a) };
}

// A pad shape on the board as filled shapes.
export function padShapes(shape: PadShape, at: Pt, rot: number): DesignShape[] {
  const place = (p: Pt) => {
    const q = turn(p, rot);
    return { x: at.x + q.x, y: at.y + q.y };
  };
  return padParts(shape).map((part): DesignShape => {
    if (part.circle) return { circle: { c: place(part.circle.c), r: part.circle.r } };
    const pts = part.poly.map(place);
    return { poly: { start: pts[0], segs: [...pts.slice(1).map((to) => ({ to })), { to: pts[0] }] } };
  });
}

export function shapeBox(shape: DesignShape): Box {
  const b = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  const add = (p: Pt, r = 0) => {
    b.minX = Math.min(b.minX, p.x - r);
    b.minY = Math.min(b.minY, p.y - r);
    b.maxX = Math.max(b.maxX, p.x + r);
    b.maxY = Math.max(b.maxY, p.y + r);
  };
  if ('circle' in shape) add(shape.circle.c, shape.circle.r);
  else if ('line' in shape) shape.line.forEach((p) => add(p));
  else if ('arc' in shape) add(shape.arc.c, shape.arc.r);
  else if ('poly' in shape) for (const p of contourPoints(shape.poly, 10)) add(p);
  else if ('region' in shape) for (const c of shape.region) for (const p of contourPoints(c, 10)) add(p);
  else if ('curve' in shape) shape.curve.forEach((p) => add(p));
  return b;
}

export function centre(b: Box): Pt {
  return { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
}

export function polyArea(polys: Poly[]): number {
  let s = 0;
  for (const { pts } of polys) {
    let a = 0;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i, i += 1) a += pts[j].x * pts[i].y - pts[i].x * pts[j].y;
    s += Math.abs(a) / 2;
  }
  return s;
}
