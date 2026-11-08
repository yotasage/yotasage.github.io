// Shapes of Gerber apertures as polygons and circles, in aperture coordinates (counter-clockwise).
import { ccwPoly, DEG } from '../geometry';
import { Pt } from '../model';

// Segments used for a full circle when a curve has to become a polygon (obrounds, thermals, moiré rings).
export const CIRCLE_STEPS = 72;

export function rotatePt(p: Pt, deg: number): Pt {
  if (!deg) return p;
  const cos = Math.cos(deg * DEG);
  const sin = Math.sin(deg * DEG);
  return { x: p.x * cos - p.y * sin, y: p.x * sin + p.y * cos };
}

export function rotatePoly(pts: Pt[], deg: number): Pt[] {
  return deg ? pts.map((p) => rotatePt(p, deg)) : pts;
}

export function rectPoly(cx: number, cy: number, w: number, h: number): Pt[] {
  const x0 = cx - w / 2;
  const x1 = cx + w / 2;
  const y0 = cy - h / 2;
  const y1 = cy + h / 2;
  return [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
}

// Points along an arc from `from` to `to` degrees (either direction), both ends included.
export function arcPoints(cx: number, cy: number, r: number, from: number, to: number, steps?: number): Pt[] {
  const n = steps ?? Math.max(2, Math.ceil((Math.abs(to - from) / 360) * CIRCLE_STEPS));
  const out: Pt[] = [];
  for (let i = 0; i <= n; i += 1) {
    const a = (from + ((to - from) * i) / n) * DEG;
    out.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
  }
  return out;
}

export function circlePoly(cx: number, cy: number, r: number, steps = CIRCLE_STEPS): Pt[] {
  return arcPoints(cx, cy, r, 0, 360, steps).slice(0, -1);
}

// An obround (stadium): a rectangle with half circles on its short sides.
export function obroundPoly(w: number, h: number): Pt[] {
  if (Math.abs(w - h) < 1e-12) return circlePoly(0, 0, w / 2);
  if (w > h) {
    const r = h / 2;
    const d = w / 2 - r;
    return [...arcPoints(d, 0, r, -90, 90, CIRCLE_STEPS / 2), ...arcPoints(-d, 0, r, 90, 270, CIRCLE_STEPS / 2)];
  }
  const r = w / 2;
  const d = h / 2 - r;
  return [...arcPoints(0, d, r, 0, 180, CIRCLE_STEPS / 2), ...arcPoints(0, -d, r, 180, 360, CIRCLE_STEPS / 2)];
}

// A regular polygon with its first vertex at `rot` degrees.
export function regularPoly(cx: number, cy: number, d: number, n: number, rot: number): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < n; i += 1) {
    const a = (rot + (360 * i) / n) * DEG;
    out.push({ x: cx + (d / 2) * Math.cos(a), y: cy + (d / 2) * Math.sin(a) });
  }
  return out;
}

// A rectangle along a line from s to e, with square ends (macro primitive 20).
export function vectorLinePoly(s: Pt, e: Pt, w: number): Pt[] | null {
  const len = Math.hypot(e.x - s.x, e.y - s.y);
  if (len === 0 || w <= 0) return null;
  const nx = (-(e.y - s.y) / len) * (w / 2);
  const ny = ((e.x - s.x) / len) * (w / 2);
  return ccwPoly([
    { x: s.x - nx, y: s.y - ny },
    { x: e.x - nx, y: e.y - ny },
    { x: e.x + nx, y: e.y + ny },
    { x: s.x + nx, y: s.y + ny },
  ]);
}

// A ring between two radii as one polygon: the outer circle counter-clockwise, then, through a cut-in, the inner
// circle clockwise, so that the non-zero rule leaves the middle empty.
export function ringPoly(cx: number, cy: number, outer: number, inner: number): Pt[] {
  const out = circlePoly(cx, cy, outer);
  if (inner <= 0) return out;
  const ring = [...out, out[0]];
  const hole = circlePoly(cx, cy, inner).reverse();
  // Starts the hole at angle 0, where the cut-in from the outer circle arrives.
  const first = hole.pop();
  return [...ring, first, ...hole, first];
}

// One quarter of a thermal: the part of the ring between `inner` and `outer` radius with x and y both at least gap/2,
// turned by a multiple of 90°.
export function thermalQuarter(outer: number, inner: number, gap: number, quarter: number): Pt[] | null {
  const g = gap / 2;
  if (g >= outer) return null;
  const outerFrom = Math.asin(g / outer) / DEG;
  const pts: Pt[] = arcPoints(0, 0, outer, outerFrom, 90 - outerFrom, CIRCLE_STEPS / 4);
  if (inner > 0 && g < inner) {
    const innerFrom = Math.asin(g / inner) / DEG;
    pts.push(...arcPoints(0, 0, inner, 90 - innerFrom, innerFrom, CIRCLE_STEPS / 4));
  } else {
    pts.push({ x: g, y: g });
  }
  return rotatePoly(pts, quarter * 90);
}
