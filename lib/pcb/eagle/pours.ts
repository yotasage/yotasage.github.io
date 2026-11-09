// EAGLE polygons as the builder's planes (Design.planes). EAGLE stores only a polygon's outline; its copper is computed
// when the board is ratsnested or plotted. This draws an approximation without polygon booleans: the outline in copper
// (its edge is the centre line of a wire of the polygon's width, so the copper reaches half a width beyond it), with cut
// out of it the copper of other signals grown by the clearance (the polygon's isolate, the design rules' wire clearances
// and the net classes'), the more important polygons of other signals (a lower rank) with that gap, cutout polygons,
// restrict areas, holes, and the board edge (the Dimension layer) with the copper/dimension distance. Polygons are drawn
// from the least important (rank 6) to the most important (rank 1), each over the ones before. Thermal reliefs, the
// removal of islands (orphans) and of parts narrower than the polygon's width are left out: pads, vias and wires of the
// polygon's own signal join it directly.
//
// A cut erases what was drawn before it on the layer, the polygons drawn earlier too. That is right for what every
// polygon keeps clear of, but a cut around copper of a signal that has an earlier polygon here would also erase that
// polygon outside this one, so such a cut is clipped to this polygon's copper (its area and the band its outline adds):
// the cut is made of convex pieces (round-ended strokes, circles, convex pads), and each piece clips the area's outline
// and the band's strokes (Sutherland–Hodgman). A more important polygon of such a signal is clipped the same way; its
// filled outline, which need not be convex, is clipped to the convex hull of the area.
import { boxOf, edgeDistance, inside, overlaps, padShapes, polysOf, reaches, shapeBox } from '../design/areas';
import { textItems } from '../design/art';
import { contourPoints } from '../outline';
import { convexHull, counterClockwise, DEG, polyArea, reverseContour } from '../geometry';
import { Box, Contour, Design, DesignGraphic, DesignPlane, DesignShape, Pt } from '../model';
import { shapeBox as contoursBox } from '../outline';
import { EagleRules } from './rules';

export interface EaglePolygon {
  id: string;
  net: number;
  width: number;
  isolate: number;
  rank: number;
  pour: 'solid' | 'hatch' | 'cutout';
  contour: Contour;
}

export interface PourInput {
  design: Design;
  polygons: EaglePolygon[];
  rules: EagleRules;
  // The net class clearance between two nets (0: none).
  classClearance: (a: number, b: number) => number;
  // Graphics that are copper of no signal (package and plain items on copper layers).
  copperGraphics: Set<number>;
  // Per copper layer id, the graphics of the restrict layer over it.
  restricts: Map<string, number[]>;
  // The board edge from the Dimension layer alone, and its lines (also those of packages).
  edge: Contour[];
  edgeLines: DesignGraphic[];
}

type Cut = NonNullable<DesignPlane['cuts']>[number];

// Points per full circle of the convex pieces.
const CIRCLE_STEPS = 32;

function circlePts(c: Pt, r: number, from = 0, sweep = 360, steps = CIRCLE_STEPS): Pt[] {
  const n = Math.max(2, Math.ceil((steps * Math.abs(sweep)) / 360));
  const out: Pt[] = [];
  const closed = Math.abs(sweep) >= 360 - 1e-9;
  for (let i = 0; i < (closed ? n : n + 1); i += 1) {
    const a = (from + (sweep * i) / n) * DEG;
    out.push({ x: c.x + r * Math.cos(a), y: c.y + r * Math.sin(a) });
  }
  return out;
}

// A segment grown by r: two half circles joined, counter-clockwise.
function stadium(a: Pt, b: Pt, r: number): Pt[] {
  if (Math.hypot(b.x - a.x, b.y - a.y) < 1e-9) return circlePts(a, r);
  const ang = Math.atan2(b.y - a.y, b.x - a.x) / DEG;
  return [...circlePts(b, r, ang - 90, 180, CIRCLE_STEPS / 2), ...circlePts(a, r, ang + 90, 180, CIRCLE_STEPS / 2)];
}

// A convex polygon grown by r with round corners: the hull of a circle at each corner.
function grownConvex(pts: Pt[], r: number): Pt[] {
  if (r <= 1e-9) return pts;
  const all: Pt[] = [];
  for (const p of pts) all.push(...circlePts(p, r, 0, 360, 16));
  return convexHull(all);
}

// The part of the subject polygon inside a convex polygon (counter-clockwise); the subject keeps its orientation.
function clipConvex(subject: Pt[], clip: Pt[]): Pt[] {
  let out = subject;
  for (let i = 0; i < clip.length && out.length; i += 1) {
    const a = clip[i];
    const b = clip[(i + 1) % clip.length];
    const input = out;
    out = [];
    const side = (p: Pt) => (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
    for (let j = 0; j < input.length; j += 1) {
      const p = input[j];
      const q = input[(j + 1) % input.length];
      const sp = side(p);
      const sq = side(q);
      if (sp >= 0) out.push(p);
      if ((sp >= 0) !== (sq >= 0)) {
        const t = sp / (sp - sq);
        out.push({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t });
      }
    }
  }
  return out;
}

function ptsBox(pts: Pt[]): Box {
  const b = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const p of pts) {
    b.minX = Math.min(b.minX, p.x);
    b.minY = Math.min(b.minY, p.y);
    b.maxX = Math.max(b.maxX, p.x);
    b.maxY = Math.max(b.maxY, p.y);
  }
  return b;
}

function contourOf(pts: Pt[]): Contour {
  return { start: pts[0], segs: [...pts.slice(1).map((to) => ({ to })), { to: pts[0] }] };
}

// The convex pieces of a cut of a signal object grown to width w (lines, arcs, circles, convex polygons).
function convexPieces(shape: DesignShape, w: number): Pt[][] {
  const r = w / 2;
  if ('line' in shape) return [stadium(shape.line[0], shape.line[1], r)];
  if ('circle' in shape) return [circlePts(shape.circle.c, shape.circle.r + r)];
  if ('arc' in shape) {
    const { c, r: rad, start, sweep } = shape.arc;
    const pts = circlePts(c, rad, start, sweep, 72);
    const out: Pt[][] = [];
    for (let i = 1; i < pts.length; i += 1) out.push(stadium(pts[i - 1], pts[i], r));
    return out;
  }
  if ('poly' in shape) return [grownConvex(convexHull(shape.poly.segs.map((s) => s.to)), r)];
  return [];
}

// A polygon's copper for clipping: its outline's points, their convex hull, and the strokes its width adds along the
// outline.
interface PlaneCopper {
  pts: Pt[];
  hull: Pt[];
  band: { pts: Pt[]; box: Box }[];
}

function planeCopper(contour: Contour, width: number): PlaneCopper {
  const pts = contourPoints(contour, 5);
  if (pts.length > 1 && Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].y - pts[pts.length - 1].y) < 1e-9) pts.pop();
  const band: PlaneCopper['band'] = [];
  if (width > 0) {
    for (let i = 0; i < pts.length; i += 1) {
      const s = stadium(pts[i], pts[(i + 1) % pts.length], width / 2);
      band.push({ pts: s, box: ptsBox(s) });
    }
  }
  return { pts: polyArea(pts) < 0 ? pts.slice().reverse() : pts, hull: convexHull(pts), band };
}

// The parts of convex pieces and of other (filled, not convex) polygons that lie on a polygon's copper.
function clipToCopper(copper: PlaneCopper, pieces: Pt[][], subjects: Pt[][] = []): Contour[] {
  const out: Contour[] = [];
  const add = (part: Pt[]) => {
    if (part.length >= 3 && Math.abs(polyArea(part)) > 1e-8) out.push(contourOf(polyArea(part) < 0 ? part.slice().reverse() : part));
  };
  for (const piece of pieces) {
    const pb = ptsBox(piece);
    add(clipConvex(copper.pts, piece));
    for (const s of copper.band) if (overlaps(pb, s.box)) add(clipConvex(piece, s.pts));
  }
  for (const subject of subjects) {
    const sb = ptsBox(subject);
    add(clipConvex(subject, copper.hull));
    for (const s of copper.band) if (overlaps(sb, s.box)) add(clipConvex(subject, s.pts));
  }
  return out;
}

export function eaglePours(input: PourInput): { planes: DesignPlane[]; warnings: string[] } {
  const { design, rules } = input;
  const planes: DesignPlane[] = [];
  const warnings: string[] = [];
  const wireWire = rules.length('mdWireWire');
  const wirePad = rules.length('mdWirePad');
  const wireVia = rules.length('mdWireVia');
  const copperDimension = rules.length('mdCopperDimension');
  const board = input.edge.length ? contoursBox(input.edge) : null;
  // Text strokes of copper layers, made once.
  const strokes = new Map<string, { a: Pt; b: Pt; w: number }[]>();
  const textStrokes = (id: string) => {
    let list = strokes.get(id);
    if (!list) {
      list = [];
      for (const t of design.texts) {
        if (t.layer !== id) continue;
        for (const item of textItems(t, undefined)) if (item.k === 'line') list.push({ a: item.a, b: item.b, w: item.w });
      }
      strokes.set(id, list);
    }
    return list;
  };

  const byLayer = new Map<string, EaglePolygon[]>();
  for (const p of input.polygons) {
    const list = byLayer.get(p.id);
    if (list) list.push(p);
    else byLayer.set(p.id, [p]);
  }
  let hatched = 0;
  for (const [id, all] of byLayer) {
    const cutouts = all.filter((p) => p.pour === 'cutout');
    // From the least important to the most important; the order of the file among equals.
    const order = all.filter((p) => p.pour !== 'cutout').map((p, i) => ({ p, i })).sort((a, b) => b.p.rank - a.p.rank || a.i - b.i).map((x) => x.p);
    const prepared = order.map((p) => {
      const polys = polysOf([p.contour]);
      return { p, polys, box: boxOf(polys) };
    });
    prepared.forEach(({ p, polys, box }, index) => {
      if (p.pour === 'hatch') hatched += 1;
      const iso = Math.max(0, p.isolate);
      // Signals with a polygon drawn earlier on this layer: their cuts are clipped to this polygon's copper.
      const earlier = new Set(prepared.slice(0, index).map((x) => x.p.net));
      let copper: PlaneCopper | null = null;
      const copperOf = () => {
        if (!copper) copper = planeCopper(p.contour, p.width);
        return copper;
      };
      const cuts: Cut[] = [];
      const clearance = (rule: number, net: number) => Math.max(iso, rule, input.classClearance(p.net, net));
      // A cut of a signal object: whole where it lies inside the polygon or its signal has no earlier polygon here,
      // else clipped to the polygon's copper.
      const signalCut = (shape: DesignShape, w: number, filled: boolean, net: number, core: [Pt, Pt], reach: number) => {
        if (!reaches(core[0], core[1], reach + p.width / 2, polys, box)) return;
        if (!earlier.has(net) || (inside(core[0], polys) && edgeDistance(core[0], core[1], polys, reach + p.width) > reach + p.width)) {
          cuts.push({ shape, w, filled });
          return;
        }
        const region = clipToCopper(copperOf(), convexPieces(shape, w));
        if (region.length) cuts.push({ shape: { region }, w: 0, filled: true });
      };

      for (const t of design.tracks) {
        if (t.layer !== id || t.net === p.net) continue;
        const c = clearance(wireWire, t.net);
        if (t.arc) {
          const rr = Math.hypot(t.a.x - t.arc.c.x, t.a.y - t.arc.c.y);
          const start = Math.atan2(t.a.y - t.arc.c.y, t.a.x - t.arc.c.x) / DEG;
          let sweep = Math.atan2(t.b.y - t.arc.c.y, t.b.x - t.arc.c.x) / DEG - start;
          if (t.arc.ccw) while (sweep <= 0) sweep += 360;
          else while (sweep >= 0) sweep -= 360;
          const b = shapeBox({ arc: { c: t.arc.c, r: rr, start, sweep } });
          const mid = { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
          const half = Math.hypot(b.maxX - b.minX, b.maxY - b.minY) / 2;
          signalCut({ arc: { c: t.arc.c, r: rr, start, sweep } }, t.w + 2 * c, false, t.net, [mid, mid], half + t.w / 2 + c);
        } else {
          signalCut({ line: [t.a, t.b] }, t.w + 2 * c, false, t.net, [t.a, t.b], t.w / 2 + c);
        }
      }
      for (const v of design.vias) {
        if (v.net === p.net || !v.layers.includes(id)) continue;
        const d = v.sizes?.[id] ?? v.d;
        const c = clearance(wireVia, v.net);
        signalCut({ circle: { c: v.at, r: d / 2 } }, 2 * c, true, v.net, [v.at, v.at], d / 2 + c);
      }
      for (const pad of design.pads) {
        if (pad.net === p.net) continue;
        const own = pad.shapes.find((s) => s.layers.includes(id));
        if (!own) continue;
        const c = clearance(wirePad, pad.net);
        const size = Math.hypot(own.shape.w, own.shape.h) / 2 + Math.hypot(own.shape.offset?.x ?? 0, own.shape.offset?.y ?? 0);
        if (!reaches(pad.at, pad.at, size + c + p.width / 2, polys, box)) continue;
        for (const s of padShapes(own.shape, pad.at, pad.rot)) {
          const sb = shapeBox(s);
          const mid = { x: (sb.minX + sb.maxX) / 2, y: (sb.minY + sb.maxY) / 2 };
          signalCut(s, 2 * c, true, pad.net, [mid, mid], Math.hypot(sb.maxX - sb.minX, sb.maxY - sb.minY) / 2 + c);
        }
      }
      // More important polygons of other signals, with the gap.
      for (const q of prepared.slice(index + 1)) {
        if (q.p.rank >= p.rank || q.p.net === p.net) continue;
        const c = clearance(wireWire, q.p.net);
        const w = q.p.width + 2 * c;
        if (!overlaps(box, q.box, w / 2 + p.width / 2)) continue;
        if (!earlier.has(q.p.net)) {
          cuts.push({ shape: { poly: q.p.contour }, w, filled: true });
          continue;
        }
        const pts = contourPoints(q.p.contour, 5);
        const edges: Pt[][] = [];
        for (let i = 0; i < pts.length; i += 1) {
          const a = pts[i];
          const b = pts[(i + 1) % pts.length];
          const eb = { minX: Math.min(a.x, b.x), minY: Math.min(a.y, b.y), maxX: Math.max(a.x, b.x), maxY: Math.max(a.y, b.y) };
          if (overlaps(box, eb, w / 2 + p.width / 2)) edges.push(stadium(a, b, w / 2));
        }
        const region = clipToCopper(copperOf(), edges, [polyArea(pts) < 0 ? pts.slice().reverse() : pts]);
        if (region.length) cuts.push({ shape: { region }, w: 0, filled: true });
      }

      // Copper of no signal, text on the layer, cutouts, restricts, holes and the board edge cut every polygon on the
      // layer, so they need no clipping.
      const near = (b: Box, margin: number) => overlaps(box, b, margin + p.width / 2);
      const cNone = Math.max(iso, wireWire);
      design.graphics.forEach((g, gi) => {
        if (g.layer !== id || !input.copperGraphics.has(gi)) return;
        if (near(shapeBox(g.shape), g.w / 2 + cNone)) cuts.push({ shape: g.shape, w: g.w + 2 * cNone, filled: g.filled });
      });
      for (const s of textStrokes(id)) {
        if (near({ minX: Math.min(s.a.x, s.b.x), minY: Math.min(s.a.y, s.b.y), maxX: Math.max(s.a.x, s.b.x), maxY: Math.max(s.a.y, s.b.y) }, s.w / 2 + cNone)) {
          cuts.push({ shape: { line: [s.a, s.b] }, w: s.w + 2 * cNone, filled: false });
        }
      }
      for (const q of cutouts) {
        const qb = boxOf(polysOf([q.contour], 10));
        if (near(qb, q.width / 2)) cuts.push({ shape: { poly: q.contour }, w: q.width, filled: true });
      }
      for (const gi of input.restricts.get(id) ?? []) {
        const g = design.graphics[gi];
        if (near(shapeBox(g.shape), g.w / 2)) cuts.push({ shape: g.shape, w: g.w, filled: g.filled });
      }
      const cHole = copperDimension > 0 ? copperDimension : iso;
      for (const h of design.holes) {
        const r = (h.slot ? Math.max(h.slot.w, h.slot.h) : h.d) / 2;
        if (near({ minX: h.at.x - r, minY: h.at.y - r, maxX: h.at.x + r, maxY: h.at.y + r }, cHole)) {
          cuts.push({ shape: { circle: { c: h.at, r: h.d / 2 } }, w: 2 * cHole, filled: true });
        }
      }
      if (copperDimension > 0) {
        if (board) {
          // Everything outside the board edge (and in its cutouts): a large rectangle with the edge as holes.
          const m = 1 + p.width;
          const big = {
            minX: Math.min(box.minX, board.minX) - m, minY: Math.min(box.minY, board.minY) - m,
            maxX: Math.max(box.maxX, board.maxX) + m, maxY: Math.max(box.maxY, board.maxY) + m,
          };
          const rect = contourOf([{ x: big.minX, y: big.minY }, { x: big.maxX, y: big.minY }, { x: big.maxX, y: big.maxY }, { x: big.minX, y: big.maxY }]);
          cuts.push({ shape: { region: [counterClockwise(rect), ...input.edge.map(reverseContour)] }, w: 2 * copperDimension, filled: true });
        }
        for (const g of input.edgeLines) {
          if (near(shapeBox(g.shape), g.w / 2 + copperDimension)) cuts.push({ shape: g.shape, w: g.w + 2 * copperDimension, filled: false });
        }
      }
      planes.push({
        layer: id, net: p.net, pullback: 0, clearances: [], thermals: [], area: [p.contour], ...(p.width > 0 ? { stroke: p.width } : {}),
        cuts, positive: true,
        info: { Rank: String(p.rank), Isolate: `${round(p.isolate)} mm`, Width: `${round(p.width)} mm`, ...(p.pour === 'hatch' ? { Pour: 'Hatched (drawn solid)' } : {}) },
      });
    });
  }
  if (planes.length) {
    warnings.push(`EAGLE keeps only the outlines of its polygons, so the copper of ${planes.length === 1 ? 'the polygon is' : `the ${planes.length} polygons is`} approximated: each outline in copper, clear of other signals by its isolation and the design rules, without thermal reliefs and without removing islands, so it can differ from EAGLE's pour.`);
  }
  if (hatched) warnings.push(`${hatched === 1 ? 'A hatched polygon is' : `${hatched} hatched polygons are`} drawn solid.`);
  return { planes, warnings };
}

function round(v: number): string {
  return String(Math.round(v * 1e4) / 1e4);
}
