// Pad shapes of designs: as the solid parts of an aperture (exact circles and polygons, so pads are flashes that
// measuring snaps to), and grown or shrunk for solder mask and paste openings the way KiCad plots them: a rectangle
// grown by m becomes a rounded rectangle of radius m, a rounded rectangle keeps its radius plus m, other polygons get
// round corners (the polygon, a rectangle along each side and a circle at each corner). Shared by every design reader.
import { ccwPoly, DEG, polyArea } from '../geometry';
import { AperturePart, PadShape, Pt } from '../model';

// Points per quarter circle where a curve has to become a polygon (rounded corners of chamfered pads, arcs).
const QUARTER_STEPS = 12;

function rect(cx: number, cy: number, w: number, h: number): Pt[] {
  return [
    { x: cx - w / 2, y: cy - h / 2 },
    { x: cx + w / 2, y: cy - h / 2 },
    { x: cx + w / 2, y: cy + h / 2 },
    { x: cx - w / 2, y: cy + h / 2 },
  ];
}

function circle(c: Pt, r: number): AperturePart {
  return { dark: true, circle: { c, r } };
}

function poly(pts: Pt[]): AperturePart {
  return { dark: true, poly: ccwPoly(pts) };
}

// A rectangle with rounded corners as two rectangles and four circles.
function roundRectParts(cx: number, cy: number, w: number, h: number, r: number): AperturePart[] {
  const rr = Math.min(r, w / 2, h / 2);
  if (rr <= 1e-9) return [poly(rect(cx, cy, w, h))];
  const parts: AperturePart[] = [];
  if (w - 2 * rr > 1e-9) parts.push(poly(rect(cx, cy, w - 2 * rr, h)));
  if (h - 2 * rr > 1e-9) parts.push(poly(rect(cx, cy, w, h - 2 * rr)));
  const dx = w / 2 - rr;
  const dy = h / 2 - rr;
  for (const [sx, sy] of [[1, 1], [-1, 1], [-1, -1], [1, -1]]) {
    if (dx < 1e-9 && sx < 0) continue;
    if (dy < 1e-9 && sy < 0) continue;
    parts.push(circle({ x: cx + sx * dx, y: cy + sy * dy }, rr));
  }
  return parts;
}

function ovalParts(cx: number, cy: number, w: number, h: number): AperturePart[] {
  if (Math.abs(w - h) < 1e-9) return [circle({ x: cx, y: cy }, w / 2)];
  return roundRectParts(cx, cy, w, h, Math.min(w, h) / 2);
}

function arcPts(c: Pt, r: number, from: number, to: number, steps: number): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const a = (from + ((to - from) * i) / steps) * DEG;
    out.push({ x: c.x + r * Math.cos(a), y: c.y + r * Math.sin(a) });
  }
  return out;
}

// A rectangle with some corners cut at 45° and the others rounded with radius r, counter-clockwise (Y up).
function chamferedOutline(cx: number, cy: number, w: number, h: number, size: number, corners: string[], r: number): Pt[] {
  const c = Math.min(size, w / 2, h / 2);
  const rr = Math.min(r, w / 2, h / 2);
  const hw = w / 2;
  const hh = h / 2;
  const out: Pt[] = [];
  // Corners counter-clockwise from the bottom right: each as (corner point, incoming direction, outgoing direction).
  const list: [string, number, number, number][] = [['br', 1, -1, -90], ['tr', 1, 1, 0], ['tl', -1, 1, 90], ['bl', -1, -1, 180]];
  for (const [name, sx, sy, startDeg] of list) {
    const px = cx + sx * hw;
    const py = cy + sy * hh;
    if (corners.includes(name) && c > 1e-9) {
      // Cut: from the point before the corner (along the incoming side) to the point after.
      const before = startDeg === -90 ? { x: px - c, y: py } : startDeg === 0 ? { x: px, y: py - c } : startDeg === 90 ? { x: px + c, y: py } : { x: px, y: py + c };
      const after = startDeg === -90 ? { x: px, y: py + c } : startDeg === 0 ? { x: px - c, y: py } : startDeg === 90 ? { x: px, y: py - c } : { x: px + c, y: py };
      out.push(before, after);
    } else if (rr > 1e-9) {
      const centre = { x: px - sx * rr, y: py - sy * rr };
      out.push(...arcPts(centre, rr, startDeg, startDeg + 90, QUARTER_STEPS));
    } else {
      out.push({ x: px, y: py });
    }
  }
  return out;
}

// The corners of a trapezoid pad: KiCad's rect_delta (Y up here) makes the side at −x h + delta.x long and the one
// at +x h − delta.x, and the side at −y w + delta.y long and the one at +y w − delta.y.
function trapezoidOutline(cx: number, cy: number, w: number, h: number, delta: Pt): Pt[] {
  const dx = w / 2;
  const dy = h / 2;
  const ddx = delta.x / 2;
  const ddy = delta.y / 2;
  return [
    { x: cx - dx - ddy, y: cy - dy - ddx },
    { x: cx + dx + ddy, y: cy - dy + ddx },
    { x: cx + dx - ddy, y: cy + dy - ddx },
    { x: cx - dx + ddy, y: cy + dy + ddx },
  ];
}

function octagonOutline(cx: number, cy: number, w: number, h: number): Pt[] {
  // The corners cut so that a square becomes a regular octagon: its sides are d (√2 − 1) long, so each cut reaches
  // d (1 − 1/√2) along the sides from the corner.
  const cut = Math.min(w, h) * (1 - Math.SQRT1_2);
  return chamferedOutline(cx, cy, w, h, cut, ['tl', 'tr', 'bl', 'br'], 0);
}

// The outline of a polygonal shape (rect, chamfer, trapezoid, octagon), or null for the others.
function outlineOf(s: PadShape): Pt[] | null {
  const o = s.offset ?? { x: 0, y: 0 };
  switch (s.k) {
    case 'rect':
      return rect(o.x, o.y, s.w, s.h);
    case 'chamfer':
      return chamferedOutline(o.x, o.y, s.w, s.h, s.chamfer?.size ?? 0, s.chamfer?.corners ?? [], s.r ?? 0);
    case 'trapezoid':
      return trapezoidOutline(o.x, o.y, s.w, s.h, s.delta ?? { x: 0, y: 0 });
    case 'octagon':
      return octagonOutline(o.x, o.y, s.w, s.h);
    default:
      return null;
  }
}

// The solid parts of a pad shape, in pad coordinates.
export function padParts(s: PadShape): AperturePart[] {
  const o = s.offset ?? { x: 0, y: 0 };
  // A size of zero or less is no shape (as KiCad draws it).
  if (s.k !== 'custom' && !(s.w > 0 && (s.k === 'circle' || s.h > 0))) return [];
  switch (s.k) {
    case 'circle':
      return [circle(o, s.w / 2)];
    case 'oval':
      return ovalParts(o.x, o.y, s.w, s.h);
    case 'roundrect':
      return roundRectParts(o.x, o.y, s.w, s.h, s.r ?? 0);
    case 'custom':
      return (s.parts ?? []).map((p) => (p.circle ? circle({ x: p.circle.c.x + o.x, y: p.circle.c.y + o.y }, p.circle.r) : poly(p.poly.map((q) => ({ x: q.x + o.x, y: q.y + o.y })))));
    default: {
      const outline = outlineOf(s);
      return outline ? [poly(outline)] : [];
    }
  }
}

// A stroke of width w along a segment: a rectangle and a circle at each end (round ends).
export function segmentParts(a: Pt, b: Pt, w: number): AperturePart[] {
  const r = w / 2;
  if (!(r > 0)) return [];
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const parts: AperturePart[] = [circle(a, r)];
  if (len > 1e-9) {
    const nx = (-(b.y - a.y) / len) * r;
    const ny = ((b.x - a.x) / len) * r;
    parts.push(poly([{ x: a.x - nx, y: a.y - ny }, { x: b.x - nx, y: b.y - ny }, { x: b.x + nx, y: b.y + ny }, { x: a.x + nx, y: a.y + ny }]));
    parts.push(circle(b, r));
  }
  return parts;
}

// A stroke of width w along an arc (degrees, counter-clockwise for a positive sweep), with round ends.
export function arcParts(c: Pt, radius: number, start: number, sweep: number, w: number): AperturePart[] {
  const r = w / 2;
  if (!(r > 0) || !(radius > 0)) return [];
  if (Math.abs(sweep) >= 360 - 1e-9) return [ringPart(c, radius + r, Math.max(0, radius - r))];
  const steps = Math.max(2, Math.ceil((Math.abs(sweep) / 90) * QUARTER_STEPS));
  const outer = arcPts(c, radius + r, start, start + sweep, steps);
  const inner = radius - r > 0 ? arcPts(c, radius - r, start + sweep, start, steps) : [c];
  const end = { x: c.x + radius * Math.cos((start + sweep) * DEG), y: c.y + radius * Math.sin((start + sweep) * DEG) };
  const begin = { x: c.x + radius * Math.cos(start * DEG), y: c.y + radius * Math.sin(start * DEG) };
  return [poly([...outer, ...inner]), circle(begin, r), circle(end, r)];
}

// A ring as one polygon (outer counter-clockwise, then the inner circle clockwise through a cut), so it stays solid.
export function ringPart(c: Pt, outer: number, inner: number): AperturePart {
  const steps = QUARTER_STEPS * 4;
  const out = arcPts(c, outer, 0, 360, steps);
  if (inner <= 1e-9) return { dark: true, circle: { c, r: outer } };
  const hole = arcPts(c, inner, 360, 0, steps);
  return { dark: true, poly: [...out, ...hole] };
}

// The parts of a polygon stroked with width w (on top of its fill, if any).
export function polygonStrokeParts(pts: Pt[], w: number): AperturePart[] {
  const parts: AperturePart[] = [];
  for (let i = 0; i < pts.length; i += 1) parts.push(...segmentParts(pts[i], pts[(i + 1) % pts.length], w));
  return parts;
}

// --- Openings ---

function isConvex(pts: Pt[]): boolean {
  let sign = 0;
  for (let i = 0; i < pts.length; i += 1) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const c = pts[(i + 2) % pts.length];
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(cross) < 1e-12) continue;
    if (!sign) sign = Math.sign(cross);
    else if (Math.sign(cross) !== sign) return false;
  }
  return true;
}

// A convex polygon (counter-clockwise) shrunk by d: each side moved inwards, the corners where neighbours meet.
function insetConvex(pts: Pt[], d: number): Pt[] | null {
  const p = ccwPoly(pts).filter((q, i, all) => {
    const n = all[(i + 1) % all.length];
    return Math.hypot(n.x - q.x, n.y - q.y) > 1e-9;
  });
  const n = p.length;
  if (n < 3) return null;
  const lines = p.map((a, i) => {
    const b = p[(i + 1) % n];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    // Inward normal of a counter-clockwise polygon: to the left.
    const nx = -(b.y - a.y) / len;
    const ny = (b.x - a.x) / len;
    return { a: { x: a.x + nx * d, y: a.y + ny * d }, dx: (b.x - a.x) / len, dy: (b.y - a.y) / len };
  });
  const out: Pt[] = [];
  for (let i = 0; i < n; i += 1) {
    const l1 = lines[(i + n - 1) % n];
    const l2 = lines[i];
    const det = l1.dx * l2.dy - l1.dy * l2.dx;
    if (Math.abs(det) < 1e-12) {
      out.push(l2.a);
      continue;
    }
    const t = ((l2.a.x - l1.a.x) * l2.dy - (l2.a.y - l1.a.y) * l2.dx) / det;
    out.push({ x: l1.a.x + l1.dx * t, y: l1.a.y + l1.dy * t });
  }
  // Collapsed (or turned inside out): nothing is left.
  return polyArea(out) > 1e-12 ? out : null;
}

// A part grown (d > 0) or shrunk (d < 0) by d. Growing is exact; shrinking a polygon that is not convex is not done.
function growPart(p: AperturePart, d: number): AperturePart[] {
  if (p.circle) return p.circle.r + d > 1e-9 ? [circle(p.circle.c, p.circle.r + d)] : [];
  if (!p.poly?.length) return [];
  if (d > 0) return [p, ...polygonStrokeParts(p.poly, 2 * d)];
  if (d < 0 && isConvex(p.poly)) {
    const inset = insetConvex(p.poly, -d);
    return inset ? [poly(inset)] : [];
  }
  return [p];
}

// A pad shape grown by mx on the sides along x and my on those along y (negative: shrunk), as KiCad plots solder mask
// (mx = my) and paste (the ratio applies to each axis) openings. Null when nothing is left.
export function growShape(s: PadShape, mx: number, my = mx): PadShape | null {
  if (Math.abs(mx) < 1e-9 && Math.abs(my) < 1e-9) return s;
  const w = s.w + 2 * mx;
  const h = s.h + 2 * my;
  switch (s.k) {
    case 'circle':
      return w > 1e-9 ? { ...s, w, h: w } : null;
    case 'oval':
      return w > 1e-9 && h > 1e-9 ? { ...s, w, h } : null;
    case 'rect':
      if (!(w > 1e-9 && h > 1e-9)) return null;
      return mx > 0 ? { k: 'roundrect', w, h, r: mx, ...(s.offset ? { offset: s.offset } : {}) } : { ...s, w, h };
    case 'roundrect':
      if (!(w > 1e-9 && h > 1e-9)) return null;
      return { ...s, w, h, r: Math.max(0, (s.r ?? 0) + mx) };
    default: {
      // Polygons and custom shapes, by the mean margin (KiCad uses one value for them).
      const d = mx;
      const parts = padParts(s).flatMap((p) => growPart(p, d));
      return parts.length ? { k: 'custom', w: Math.max(0, w), h: Math.max(0, h), parts } : null;
    }
  }
}

// The width and height a shape covers (for a custom shape the box around its parts, which its nominal size need not
// be), so that a negative margin can be limited to half of it.
export function shapeExtent(s: PadShape): { w: number; h: number } {
  if (s.k !== 'custom') return { w: s.w, h: s.h };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of s.parts ?? []) {
    if (p.circle) {
      minX = Math.min(minX, p.circle.c.x - p.circle.r);
      maxX = Math.max(maxX, p.circle.c.x + p.circle.r);
      minY = Math.min(minY, p.circle.c.y - p.circle.r);
      maxY = Math.max(maxY, p.circle.c.y + p.circle.r);
    }
    for (const q of p.poly ?? []) {
      minX = Math.min(minX, q.x);
      maxX = Math.max(maxX, q.x);
      minY = Math.min(minY, q.y);
      maxY = Math.max(maxY, q.y);
    }
  }
  return maxX >= minX ? { w: maxX - minX, h: maxY - minY } : { w: s.w, h: s.h };
}

// A key that is the same for equal shapes, to share apertures.
export function shapeKey(s: PadShape): string {
  const r = (v: number) => Math.round(v * 1e6);
  const base = `${s.k}|${r(s.w)}|${r(s.h)}|${r(s.r ?? 0)}|${s.offset ? `${r(s.offset.x)},${r(s.offset.y)}` : ''}`;
  if (s.k === 'chamfer') return `${base}|${r(s.chamfer?.size ?? 0)}|${(s.chamfer?.corners ?? []).join(',')}`;
  if (s.k === 'trapezoid') return `${base}|${r(s.delta?.x ?? 0)},${r(s.delta?.y ?? 0)}`;
  if (s.k === 'custom') {
    return `${base}|${(s.parts ?? []).map((p) => (p.circle ? `c${r(p.circle.c.x)},${r(p.circle.c.y)},${r(p.circle.r)}` : `p${p.poly.map((q) => `${r(q.x)},${r(q.y)}`).join(' ')}`)).join(';')}`;
  }
  return base;
}

// Whether a point (pad coordinates) lies on the shape, for finding what a pad connects to.
export function shapeContains(s: PadShape, p: Pt, tolerance = 0): boolean {
  return padParts(s).some((part) => {
    if (part.circle) return Math.hypot(p.x - part.circle.c.x, p.y - part.circle.c.y) <= part.circle.r + tolerance;
    const pts = part.poly;
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i, i += 1) {
      const a = pts[i];
      const b = pts[j];
      if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
    }
    if (inside || tolerance <= 0) return inside;
    // Near an edge.
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i, i += 1) {
      const a = pts[j];
      const b = pts[i];
      const len2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
      const t = len2 ? Math.max(0, Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / len2)) : 0;
      if (Math.hypot(p.x - (a.x + t * (b.x - a.x)), p.y - (a.y + t * (b.y - a.y))) <= tolerance) return true;
    }
    return false;
  });
}
