// Geometry helpers for the board model: angles, arcs, bounding boxes, contour orientation and affine transforms.
import { Aperture, ArtItem, Box, Contour, ContourSeg, Mirror, Pt } from './model';

export const DEG = Math.PI / 180;

// The same tolerance everywhere a point is compared with another: 1 nm.
export const EPS = 1e-6;

export function samePoint(a: Pt, b: Pt, eps = EPS): boolean {
  return Math.abs(a.x - b.x) <= eps && Math.abs(a.y - b.y) <= eps;
}

export function arcPoint(c: Pt, r: number, deg: number): Pt {
  return { x: c.x + r * Math.cos(deg * DEG), y: c.y + r * Math.sin(deg * DEG) };
}

export function angleOf(c: Pt, p: Pt): number {
  return Math.atan2(p.y - c.y, p.x - c.x) / DEG;
}

// Grows a box by a circle.
export function addPoint(box: Box, x: number, y: number, r = 0) {
  if (x - r < box.minX) box.minX = x - r;
  if (x + r > box.maxX) box.maxX = x + r;
  if (y - r < box.minY) box.minY = y - r;
  if (y + r > box.maxY) box.maxY = y + r;
}

// Grows a box by an arc of width w (the ends and the points where it crosses an axis).
export function addArc(box: Box, c: Pt, r: number, start: number, sweep: number, w = 0) {
  const h = w / 2;
  if (Math.abs(sweep) >= 360) {
    addPoint(box, c.x, c.y, r + h);
    return;
  }
  const from = sweep >= 0 ? start : start + sweep;
  const to = from + Math.abs(sweep);
  const a = arcPoint(c, r, from);
  const b = arcPoint(c, r, to);
  addPoint(box, a.x, a.y, h);
  addPoint(box, b.x, b.y, h);
  // The first multiple of 90° after `from`, then every quarter turn up to `to`.
  for (let q = Math.ceil(from / 90) * 90; q < to; q += 90) {
    const p = arcPoint(c, r, q);
    addPoint(box, p.x, p.y, h);
  }
}

export function addContour(box: Box, contour: Contour) {
  let from = contour.start;
  addPoint(box, from.x, from.y);
  for (const seg of contour.segs) {
    if (seg.arc) {
      const { start, sweep } = segArc(from, seg);
      addArc(box, seg.arc.c, Math.hypot(from.x - seg.arc.c.x, from.y - seg.arc.c.y), start, sweep);
    }
    addPoint(box, seg.to.x, seg.to.y);
    from = seg.to;
  }
}

// The start angle and sweep of an arc segment of a contour; a segment that ends where it starts is a full circle.
export function segArc(from: Pt, seg: ContourSeg): { start: number; sweep: number } {
  const { c, ccw } = seg.arc;
  const start = angleOf(c, from);
  if (samePoint(from, seg.to)) return { start, sweep: ccw ? 360 : -360 };
  let sweep = angleOf(c, seg.to) - start;
  if (ccw) {
    while (sweep <= 0) sweep += 360;
  } else {
    while (sweep >= 0) sweep -= 360;
  }
  return { start, sweep };
}

// The signed area of a contour, positive when it runs counter-clockwise. Arcs are integrated exactly.
export function contourArea(contour: Contour): number {
  let sum = 0;
  let from = contour.start;
  for (const seg of contour.segs) {
    if (seg.arc) {
      const { c } = seg.arc;
      const r = Math.hypot(from.x - c.x, from.y - c.y);
      const { start, sweep } = segArc(from, seg);
      const a = start * DEG;
      const t = sweep * DEG;
      // ∮ x dy − y dx over the arc, from the parametric form x = cx + r cos u, y = cy + r sin u.
      sum += r * r * t + r * c.x * (Math.sin(a + t) - Math.sin(a)) - r * c.y * (Math.cos(a + t) - Math.cos(a));
    } else {
      sum += from.x * seg.to.y - seg.to.x * from.y;
    }
    from = seg.to;
  }
  // Closing segment, if the contour does not end at its start.
  if (!samePoint(from, contour.start)) sum += from.x * contour.start.y - contour.start.x * from.y;
  return sum / 2;
}

export function reverseContour(contour: Contour): Contour {
  const pts = [contour.start, ...contour.segs.map((s) => s.to)];
  const segs: ContourSeg[] = [];
  for (let i = contour.segs.length - 1; i >= 0; i -= 1) {
    const seg = contour.segs[i];
    segs.push(seg.arc ? { to: pts[i], arc: { c: seg.arc.c, ccw: !seg.arc.ccw } } : { to: pts[i] });
  }
  return { start: pts[pts.length - 1], segs };
}

// Makes a contour run counter-clockwise, so that contours filled together with the non-zero rule add up.
export function counterClockwise(contour: Contour): Contour {
  return contourArea(contour) < 0 ? reverseContour(contour) : contour;
}

export function polyArea(pts: Pt[]): number {
  let sum = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i, i += 1) sum += pts[j].x * pts[i].y - pts[i].x * pts[j].y;
  return sum / 2;
}

export function ccwPoly(pts: Pt[]): Pt[] {
  return polyArea(pts) < 0 ? pts.slice().reverse() : pts;
}

// The convex hull of points, counter-clockwise (Andrew's monotone chain).
export function convexHull(points: Pt[]): Pt[] {
  const pts = points.slice().sort((a, b) => a.x - b.x || a.y - b.y);
  if (pts.length < 3) return pts;
  const cross = (o: Pt, a: Pt, b: Pt) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: Pt[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Pt[] = [];
  for (let i = pts.length - 1; i >= 0; i -= 1) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  upper.pop();
  lower.pop();
  return lower.concat(upper);
}

export function polyContour(pts: Pt[]): Contour {
  return { start: pts[0], segs: pts.slice(1).map((to) => ({ to })).concat([{ to: pts[0] }]) };
}

// --- Affine transforms: (x, y) → (a·x + c·y + e, b·x + d·y + f), as in Canvas 2D ---

export interface Affine {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

export const IDENTITY: Affine = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

export function apply(m: Affine, p: Pt): Pt {
  return { x: m.a * p.x + m.c * p.y + m.e, y: m.b * p.x + m.d * p.y + m.f };
}

// m1 after m2.
export function multiply(m1: Affine, m2: Affine): Affine {
  return {
    a: m1.a * m2.a + m1.c * m2.b,
    b: m1.b * m2.a + m1.d * m2.b,
    c: m1.a * m2.c + m1.c * m2.d,
    d: m1.b * m2.c + m1.d * m2.d,
    e: m1.a * m2.e + m1.c * m2.f + m1.e,
    f: m1.b * m2.e + m1.d * m2.f + m1.f,
  };
}

// The transform of a flash: mirror, then rotate, then scale, then move to `at`.
export function flashMatrix(at: Pt, rot: number, mirror: Mirror, scale: number): Affine {
  const cos = Math.cos(rot * DEG) * scale;
  const sin = Math.sin(rot * DEG) * scale;
  const mx = mirror === 'x' || mirror === 'xy' ? -1 : 1;
  const my = mirror === 'y' || mirror === 'xy' ? -1 : 1;
  return { a: cos * mx, b: sin * mx, c: -sin * my, d: cos * my, e: at.x, f: at.y };
}

export function determinant(m: Affine): number {
  return m.a * m.d - m.b * m.c;
}

// Writes the linear part of a similarity transform as scale · rotation · (mirror in x or not).
function decompose(m: Affine): { scale: number; rot: number; mirrored: boolean } {
  const mirrored = determinant(m) < 0;
  const scale = Math.sqrt(Math.abs(determinant(m)));
  // With a mirror in x first, the first column is (−s·cos θ, −s·sin θ).
  const rot = mirrored ? Math.atan2(-m.b, -m.a) / DEG : Math.atan2(m.b, m.a) / DEG;
  return { scale, rot, mirrored };
}

export function normalizeAngle(deg: number): number {
  const r = deg % 360;
  const n = r < 0 ? r + 360 : r;
  // Rounds away the noise of trigonometry, so that 90° stays 90°.
  const rounded = Math.round(n * 1e9) / 1e9;
  return rounded === 360 ? 0 : rounded;
}

function transformContour(contour: Contour, m: Affine, flip: boolean): Contour {
  const out: Contour = {
    start: apply(m, contour.start),
    segs: contour.segs.map((s) => (s.arc ? { to: apply(m, s.to), arc: { c: apply(m, s.arc.c), ccw: flip ? !s.arc.ccw : s.arc.ccw } } : { to: apply(m, s.to) })),
  };
  return flip ? reverseContour(out) : out;
}

// An item moved by a similarity transform (uniform scale, rotation, mirror, translation), as when a block aperture is
// flashed. Mirrored contours are reversed so that outer contours stay counter-clockwise.
export function transformItem(item: ArtItem, m: Affine): ArtItem {
  const { scale, rot, mirrored } = decompose(m);
  const base = { dark: item.dark, ...(item.obj !== undefined ? { obj: item.obj } : {}) };
  switch (item.k) {
    case 'line':
      return { ...base, k: 'line', a: apply(m, item.a), b: apply(m, item.b), w: item.w * scale, cap: item.cap };
    case 'arc': {
      const c = apply(m, item.c);
      const start = angleOf(c, apply(m, arcPoint(item.c, item.r, item.start)));
      return { ...base, k: 'arc', c, r: item.r * scale, start, sweep: mirrored ? -item.sweep : item.sweep, w: item.w * scale };
    }
    case 'flash': {
      // The flash's own transform, as scale · R(θ) · (mirror in x or not); a mirror in y is a mirror in x turned 180°.
      const ownMirror = item.mirror === 'x' || item.mirror === 'y';
      const ownRot = item.rot + (item.mirror === 'y' || item.mirror === 'xy' ? 180 : 0);
      return {
        ...base,
        k: 'flash',
        at: apply(m, item.at),
        ap: item.ap,
        rot: normalizeAngle(rot + (mirrored ? -ownRot : ownRot)),
        mirror: mirrored !== ownMirror ? 'x' : 'none',
        scale: item.scale * scale,
      };
    }
    case 'region':
      return { ...base, k: 'region', contours: item.contours.map((c) => transformContour(c, m, mirrored)) };
    case 'hole':
      return { ...base, k: 'hole', at: apply(m, item.at), d: item.d * scale, plated: item.plated, ...(item.to ? { to: apply(m, item.to) } : {}) };
  }
}

function movePt(p: Pt, dx: number, dy: number): Pt {
  return { x: p.x + dx, y: p.y + dy };
}

// A faster transformItem for a pure translation (step and repeat).
export function translateItem(item: ArtItem, dx: number, dy: number): ArtItem {
  switch (item.k) {
    case 'line':
      return { ...item, a: movePt(item.a, dx, dy), b: movePt(item.b, dx, dy) };
    case 'arc':
      return { ...item, c: movePt(item.c, dx, dy) };
    case 'flash':
      return { ...item, at: movePt(item.at, dx, dy) };
    case 'region':
      return {
        ...item,
        contours: item.contours.map((c) => ({
          start: movePt(c.start, dx, dy),
          segs: c.segs.map((s) => (s.arc ? { to: movePt(s.to, dx, dy), arc: { c: movePt(s.arc.c, dx, dy), ccw: s.arc.ccw } } : { to: movePt(s.to, dx, dy) })),
        })),
      };
    case 'hole':
      return { ...item, at: movePt(item.at, dx, dy), ...(item.to ? { to: movePt(item.to, dx, dy) } : {}) };
  }
}

// The distance from the origin of an aperture to the farthest point of its shape.
export function apertureRadius(ap: Aperture): number {
  let r = 0;
  for (const part of ap.parts) {
    if (part.circle) r = Math.max(r, Math.hypot(part.circle.c.x, part.circle.c.y) + part.circle.r);
    if (part.poly) for (const p of part.poly) r = Math.max(r, Math.hypot(p.x, p.y));
  }
  return r;
}

// The extent of items along their centre lines, without line widths or flash sizes: the size of a board from its
// outline layer.
export function centerlineBox(items: ArtItem[]): Box {
  const box: Box = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const item of items) {
    if (!item.dark) continue;
    switch (item.k) {
      case 'line':
        addPoint(box, item.a.x, item.a.y);
        addPoint(box, item.b.x, item.b.y);
        break;
      case 'arc':
        addArc(box, item.c, item.r, item.start, item.sweep);
        break;
      case 'region':
        for (const c of item.contours) addContour(box, c);
        break;
      case 'flash':
      case 'hole':
        addPoint(box, item.at.x, item.at.y);
        break;
    }
  }
  return box;
}

// The box around the parts of an aperture, in aperture coordinates.
export function apertureBox(ap: Aperture): Box {
  const box: Box = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const part of ap.parts) {
    if (part.circle) addPoint(box, part.circle.c.x, part.circle.c.y, part.circle.r);
    if (part.poly) for (const p of part.poly) addPoint(box, p.x, p.y);
  }
  return box;
}

// Grows a box by an item. Flashes use the corners of their aperture's box (see apertureBox), turned with the flash.
export function addItem(box: Box, item: ArtItem, apertureBoxes: Box[]) {
  switch (item.k) {
    case 'line':
      addPoint(box, item.a.x, item.a.y, item.w / 2);
      addPoint(box, item.b.x, item.b.y, item.w / 2);
      break;
    case 'arc':
      addArc(box, item.c, item.r, item.start, item.sweep, item.w);
      break;
    case 'flash': {
      const b = apertureBoxes[item.ap];
      if (!b || !(b.minX <= b.maxX)) break;
      const m = flashMatrix(item.at, item.rot, item.mirror, item.scale);
      for (const [x, y] of [[b.minX, b.minY], [b.maxX, b.minY], [b.maxX, b.maxY], [b.minX, b.maxY]]) {
        addPoint(box, m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f);
      }
      break;
    }
    case 'region':
      for (const c of item.contours) addContour(box, c);
      break;
    case 'hole':
      addPoint(box, item.at.x, item.at.y, item.d / 2);
      if (item.to) addPoint(box, item.to.x, item.to.y, item.d / 2);
      break;
  }
}
