// A layer as it is, as polygons: its items applied in order with polygon booleans (clipper2-ts, loaded only when an
// export needs it), dark items added and clear ones cut away, so that layers with clear items (Gerber clear polarity
// and negative images, the negative planes of Altium and PADS, EAGLE polygons with their cuts, knockout text) can be
// written to PDF and DXF, which have no clear polarity. Arcs and circles become chords that stay within a tolerance of
// the true curve. The result is a list of polygons, each an outline (counter-clockwise) with its holes (clockwise), in
// board millimetres.
import type { Paths64, PolyPath64 } from 'clipper2-ts' with { 'resolution-mode': 'import' };

import { DEG, flashMatrix, polyArea, segArc } from '../geometry';
import { Aperture, ArtItem, Contour, isEmptyBox, Layer, Pt } from '../model';
import { classify } from '../render/prepare';

type Clipper2 = typeof import('clipper2-ts', { with: { 'resolution-mode': 'import' } });

export type Ring = Pt[];

export interface Polygon {
  outer: Ring;
  holes: Ring[];
}

export interface FlattenOptions {
  // The largest distance (mm) between an arc and the chords that stand in for it.
  tolerance: number;
  // Awaited between batches of items; it may throw to stop.
  pause?: () => Promise<void>;
  // Called with the number of items done since the last call.
  onItems?: (n: number) => void;
}

// Integer units per millimetre for the booleans: 0.1 µm, which keeps the products of coordinates of boards up to a
// metre within the exact range of doubles.
const SCALE = 1e4;
// Items turned into polygons and joined before the next pause. Clipper2 joins many overlapping polygons much faster in
// small batches joined in pairs than in one union (LibreVNA's 2,338 cuts of a pour: 876 ms in one, 90 ms so).
const BATCH = 500;

let clipper: Clipper2 | null = null;

async function loadClipper(): Promise<Clipper2> {
  clipper ??= await import('clipper2-ts');
  return clipper;
}

// Whether a layer needs flattening: it has clear items or starts dark (a negative image).
export function hasClearItems(layer: Layer): boolean {
  return Boolean(layer.negative) || layer.items.some((i) => !i.dark);
}

// The number of chords for an arc of radius r over `sweep` degrees.
function chords(r: number, sweep: number, tolerance: number): number {
  const a = Math.abs(sweep);
  if (!(r > 0)) return 1;
  const step = tolerance >= r ? 90 : Math.min(45, (2 * Math.acos(1 - tolerance / r)) / DEG);
  return Math.max(a >= 359.999 ? 8 : 1, Math.ceil(a / step));
}

// Points along an arc from `start` over `sweep` degrees (both ends included).
export function arcPoints(c: Pt, r: number, start: number, sweep: number, tolerance: number, out: Pt[] = []): Pt[] {
  const n = chords(r, sweep, tolerance);
  for (let k = 0; k <= n; k += 1) {
    const a = (start + (sweep * k) / n) * DEG;
    out.push({ x: c.x + r * Math.cos(a), y: c.y + r * Math.sin(a) });
  }
  return out;
}

export function circleRing(c: Pt, r: number, tolerance: number, ccw = true): Ring {
  const pts = arcPoints(c, r, 0, ccw ? 360 : -360, tolerance);
  pts.pop();
  return pts;
}

// A contour (lines and arcs) as points, without repeating the start.
export function contourRing(contour: Contour, tolerance: number): Ring {
  const pts: Pt[] = [contour.start];
  let from = contour.start;
  for (const seg of contour.segs) {
    if (seg.arc) {
      const { start, sweep } = segArc(from, seg);
      const r = Math.hypot(from.x - seg.arc.c.x, from.y - seg.arc.c.y);
      const arc = arcPoints(seg.arc.c, r, start, sweep, tolerance);
      for (let k = 1; k < arc.length - 1; k += 1) pts.push(arc[k]);
    }
    pts.push(seg.to);
    from = seg.to;
  }
  const last = pts[pts.length - 1];
  if (pts.length > 1 && Math.abs(last.x - contour.start.x) < 1e-9 && Math.abs(last.y - contour.start.y) < 1e-9) pts.pop();
  return pts;
}

// A stroke with round ends from a to b, counter-clockwise.
function stadium(a: Pt, b: Pt, w: number, tolerance: number): Ring {
  const r = w / 2;
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  if (len < 1e-9) return circleRing(a, r, tolerance);
  const dir = Math.atan2(b.y - a.y, b.x - a.x) / DEG;
  const pts: Pt[] = [];
  // Around b from the right side to the left, then around a back.
  arcPoints(b, r, dir - 90, 180, tolerance, pts);
  arcPoints(a, r, dir + 90, 180, tolerance, pts);
  return pts;
}

// A stroke with square ends (reaching half its width past each end), counter-clockwise.
function squareStroke(a: Pt, b: Pt, w: number): Ring {
  const r = w / 2;
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const ux = len < 1e-9 ? 1 : (b.x - a.x) / len;
  const uy = len < 1e-9 ? 0 : (b.y - a.y) / len;
  const nx = -uy * r;
  const ny = ux * r;
  const sx = a.x - ux * r;
  const sy = a.y - uy * r;
  const ex = b.x + ux * r;
  const ey = b.y + uy * r;
  return [{ x: sx - nx, y: sy - ny }, { x: ex - nx, y: ey - ny }, { x: ex + nx, y: ey + ny }, { x: sx + nx, y: sy + ny }];
}

// An arc stroke of width w with round ends, as rings to be joined (non-zero).
function arcStroke(c: Pt, rad: number, start: number, sweep: number, w: number, tolerance: number): Ring[] {
  const r = w / 2;
  const outer = rad + r;
  const inner = rad - r;
  if (Math.abs(sweep) >= 359.999) {
    const rings = [circleRing(c, outer, tolerance)];
    if (inner > 1e-9) rings.push(circleRing(c, inner, tolerance, false));
    return rings;
  }
  const s = sweep > 0 ? start : start + sweep;
  const a = Math.abs(sweep);
  const end = (deg: number) => ({ x: c.x + rad * Math.cos(deg * DEG), y: c.y + rad * Math.sin(deg * DEG) });
  if (inner <= 1e-9) {
    // Wider than its radius: the swept sector and a disc at each end.
    const pts = arcPoints(c, outer, s, a, tolerance);
    pts.push(c);
    return [pts, circleRing(end(s), r, tolerance), circleRing(end(s + a), r, tolerance)];
  }
  const pts: Pt[] = [];
  arcPoints(c, outer, s, a, tolerance, pts);
  arcPoints(end(s + a), r, s + a, 180, tolerance, pts);
  arcPoints(c, inner, s + a, -a, tolerance, pts);
  arcPoints(end(s), r, s + 180, 180, tolerance, pts);
  return [pts];
}

// The rings of an aperture in aperture coordinates: solid parts counter-clockwise, holes clockwise; apertures whose
// clear parts are not plain holes are worked out with booleans, each part over the ones before.
function apertureRings(ap: Aperture, tolerance: number, C: Clipper2): Ring[] {
  const ring = (p: Aperture['parts'][number], ccw: boolean): Ring => {
    if (p.circle) return circleRing(p.circle.c, p.circle.r, tolerance, ccw);
    const pts = p.poly ?? [];
    const positive = polyArea(pts) >= 0;
    return positive === ccw ? pts.slice() : pts.slice().reverse();
  };
  const cls = classify(ap);
  if (cls === 'empty') return [];
  if (cls === 'solid') return ap.parts.map((p) => ring(p, true));
  if (cls === 'holed') return ap.parts.map((p) => ring(p, p.dark));
  let acc: Paths64 = [];
  for (const p of ap.parts) {
    const path = [toPath(ring(p, true))];
    acc = p.dark ? C.Clipper.union(acc, path, C.FillRule.NonZero) : C.Clipper.difference(acc, path, C.FillRule.NonZero);
  }
  return acc.map(fromPath);
}

// Aperture rings are worked out once per aperture.
const apertureCache = new WeakMap<Aperture, { tolerance: number; rings: Ring[] }>();

function cachedApertureRings(ap: Aperture, tolerance: number, C: Clipper2): Ring[] {
  const hit = apertureCache.get(ap);
  if (hit && hit.tolerance === tolerance) return hit.rings;
  const rings = apertureRings(ap, tolerance, C);
  apertureCache.set(ap, { tolerance, rings });
  return rings;
}

// A flash: the aperture's rings moved into place; a mirror reverses them, so they keep their direction.
function flashRings(item: Extract<ArtItem, { k: 'flash' }>, ap: Aperture, tolerance: number, C: Clipper2): Ring[] {
  const m = flashMatrix(item.at, item.rot, item.mirror, item.scale);
  const flip = m.a * m.d - m.b * m.c < 0;
  return cachedApertureRings(ap, tolerance / Math.max(item.scale, 1e-9), C).map((r) => {
    const pts = r.map((p) => ({ x: m.a * p.x + m.c * p.y + m.e, y: m.b * p.x + m.d * p.y + m.f }));
    return flip ? pts.reverse() : pts;
  });
}

// The rings an item covers: solid shapes counter-clockwise, their holes clockwise.
export function itemRings(item: ArtItem, layer: Layer, tolerance: number, C: Clipper2): Ring[] {
  switch (item.k) {
    case 'line':
      if (!(item.w > 0)) return [];
      return [item.cap === 'square' ? squareStroke(item.a, item.b, item.w) : stadium(item.a, item.b, item.w, tolerance)];
    case 'arc':
      if (!(item.w > 0) || !(item.r > 0)) return [];
      return arcStroke(item.c, item.r, item.start, item.sweep, item.w, tolerance);
    case 'flash': {
      const ap = layer.apertures[item.ap];
      return ap ? flashRings(item, ap, tolerance, C) : [];
    }
    case 'region':
      return item.contours.map((c) => contourRing(c, tolerance)).filter((r) => r.length >= 3);
    case 'hole':
      if (item.to && (item.to.x !== item.at.x || item.to.y !== item.at.y)) return [stadium(item.at, item.to, item.d, tolerance)];
      return item.d > 0 ? [circleRing(item.at, item.d / 2, tolerance)] : [];
  }
}

function toPath(ring: Ring): Paths64[number] {
  return ring.map((p) => ({ x: Math.round(p.x * SCALE), y: Math.round(p.y * SCALE) }));
}

function fromPath(path: Paths64[number]): Ring {
  return path.map((p) => ({ x: p.x / SCALE, y: p.y / SCALE }));
}

// Outlines with their holes from a tree of the booleans' result; islands in holes are polygons of their own.
function polygonsOf(tree: PolyPath64): Polygon[] {
  const out: Polygon[] = [];
  const visit = (node: PolyPath64) => {
    for (let i = 0; i < node.count; i += 1) {
      const outer = node.child(i);
      if (!outer.polygon) continue;
      const holes: Ring[] = [];
      for (let k = 0; k < outer.count; k += 1) {
        const hole = outer.child(k);
        if (hole.polygon) holes.push(fromPath(hole.polygon));
        visit(hole);
      }
      out.push({ outer: fromPath(outer.polygon), holes });
    }
  };
  visit(tree);
  return out;
}

// Unions joined in pairs, level by level, pausing between them.
async function joinAll(parts: Paths64[], C: Clipper2, o: FlattenOptions): Promise<Paths64> {
  let level = parts;
  while (level.length > 1) {
    const next: Paths64[] = [];
    for (let i = 0; i < level.length; i += 2) {
      next.push(i + 1 < level.length ? C.Clipper.union([...level[i], ...level[i + 1]], C.FillRule.NonZero) : level[i]);
      if (o.pause) await o.pause();
    }
    level = next;
  }
  return level[0] ?? [];
}

// The layer as polygons: each run of items of one polarity is joined, then added to what is there (dark) or cut out
// of it (clear).
export async function flattenLayer(layer: Layer, o: FlattenOptions): Promise<Polygon[]> {
  const C = await loadClipper();
  const { NonZero } = C.FillRule;
  let acc: Paths64 = [];
  if (layer.negative && !isEmptyBox(layer.bbox)) {
    const b = layer.bbox;
    acc = [toPath([{ x: b.minX, y: b.minY }, { x: b.maxX, y: b.minY }, { x: b.maxX, y: b.maxY }, { x: b.minX, y: b.maxY }])];
  }
  const items = layer.items;
  let i = 0;
  while (i < items.length) {
    const dark = items[i].dark;
    let end = i;
    while (end < items.length && items[end].dark === dark) end += 1;
    // A clear run over nothing changes nothing.
    if (!dark && !acc.length) {
      o.onItems?.(end - i);
      i = end;
      continue;
    }
    const parts: Paths64[] = [];
    for (let k = i; k < end; k += BATCH) {
      const paths: Paths64 = [];
      const stop = Math.min(end, k + BATCH);
      for (let j = k; j < stop; j += 1) {
        for (const r of itemRings(items[j], layer, o.tolerance, C)) if (r.length >= 3) paths.push(toPath(r));
      }
      if (paths.length) parts.push(C.Clipper.union(paths, NonZero));
      o.onItems?.(stop - k);
      if (o.pause) await o.pause();
    }
    const run = await joinAll(parts, C, o);
    if (dark) acc = acc.length ? C.Clipper.union(acc, run, NonZero) : run;
    else acc = C.Clipper.difference(acc, run, NonZero);
    if (o.pause) await o.pause();
    i = end;
  }
  if (!acc.length) return [];
  const tree = new C.PolyTree64();
  C.Clipper.booleanOpWithPolyTree(C.ClipType.Union, acc, null, tree, NonZero);
  return polygonsOf(tree);
}

// An aperture as polygons in aperture coordinates (for apertures whose clear parts are not plain holes).
export async function flattenAperture(ap: Aperture, tolerance: number): Promise<Polygon[]> {
  const C = await loadClipper();
  const rings = apertureRings(ap, tolerance, C);
  if (!rings.length) return [];
  const tree = new C.PolyTree64();
  C.Clipper.booleanOpWithPolyTree(C.ClipType.Union, rings.map(toPath), null, tree, C.FillRule.NonZero);
  return polygonsOf(tree);
}
