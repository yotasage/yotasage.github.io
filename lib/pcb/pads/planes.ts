// PADS planes whose copper the file does not store, as the builder's planes (Design.planes).
//
// Mixed planes saved with "outline" only (PLANEFLAGS OUTLINE): each plane area is its outline in copper, drawn in
// order (larger areas first, or by priority), with cut out of it: other areas of other nets that lie over it, with the
// copper-to-copper clearance between them; copper cut-outs (grown by half their line width); and the copper of other
// nets on the layer (tracks, pads, vias, teardrops and copper items) grown by the clearance of the design rules. Pads
// and vias of the area's own net join it directly, as in Linear's Gerber files; isolated copper is not removed.
//
// CAM planes are negative: the board shape in copper, with an antipad (the pad stack's RA or SA entry, else the pad
// grown by the clearance) around holes of other nets and a thermal relief (RT or ST, else the thermal settings of the
// *PCB* section) around plated holes of the plane's nets. What else is drawn on a CAM plane is cut out of it.
import { Box, Contour, Design, DesignPlane, DesignShape, PadShape, Pt } from '../model';
import { boxOf, centre, inside, overlaps, padShapes, Poly, polyArea as area, polysOf, reaches, shapeBox } from '../design/areas';
import { PadsLayers } from './layers';

export interface PlaneArea {
  level: number;
  net: number;
  contours: Contour[];
  name: string;
  priority?: number;
  order: number;
}

export interface PlaneCut {
  level: number;
  shape: DesignShape;
  w: number;
}

interface StackLineLike {
  level: number;
  size: number;
  shape: string;
  rest: string[];
}

type PadShapeOf = (s: StackLineLike, scale: number, via: boolean, flip: boolean) => {
  kind: 'pad' | 'thermal' | 'antipad';
  shape?: PadShape;
  thermal?: { d: number; outer: number; width: number; spokes: number; angle: number; square: boolean };
  antipad?: { d: number; square: boolean };
};

export interface PlaneInput {
  design: Design;
  layers: PadsLayers;
  areas: PlaneArea[];
  cutouts: PlaneCut[];
  copperGraphics: Set<number>;
  clearance: (key: string, net?: string) => number;
  padStacks: { stack: StackLineLike[]; scale: number; bottom: boolean }[];
  viaTypes: { lines: StackLineLike[]; start?: number; end?: number }[];
  id: (n: number) => string;
  padShape: PadShapeOf;
  pcb: Map<string, string[]>;
  unit: number;
}

// PLANEFLAGS: the 14th flag removes the pads of mixed plane layers that connect to nothing there (their clearance
// stays), as Linear's Gerber files show.
function removesUnusedPads(pcb: Map<string, string[]>): boolean {
  return (pcb.get('PLANEFLAGS')?.[13] ?? '').toUpperCase() === 'Y';
}

// --- Mixed planes ---

function mixedPlanes(input: PlaneInput, level: number, areas: PlaneArea[]): DesignPlane[] {
  const { design } = input;
  const id = input.id(level);
  const netName = (n: number | undefined) => (n ? design.nets[n] : undefined);
  // Larger areas first; a priority (lower number first in PADS) puts the more important ones on top.
  const sorted = areas.map((a) => ({ a, polys: polysOf(a.contours) })).map((x) => ({ ...x, box: boxOf(x.polys), size: area(x.polys) }));
  sorted.sort((x, y) => (y.a.priority ?? 0) - (x.a.priority ?? 0) || y.size - x.size || x.a.order - y.a.order);
  const out: DesignPlane[] = [];
  sorted.forEach(({ a, polys, box }, i) => {
    const net = netName(a.net);
    const cuts: NonNullable<DesignPlane['cuts']> = [];
    const gap = Math.max(input.clearance('COPPER_TO_COPPER', net), 0) || input.clearance('COPPER_TO_TRACK', net);
    // Areas of other nets over this one.
    for (const later of sorted.slice(i + 1)) {
      if (later.a.net === a.net || !overlaps(box, later.box, gap)) continue;
      cuts.push({ shape: later.a.contours.length > 1 ? { region: later.a.contours } : { poly: later.a.contours[0] }, w: 2 * gap, filled: true });
    }
    // Copper cut-outs.
    for (const c of input.cutouts) {
      if (c.level !== level || !overlaps(box, shapeBox(c.shape), c.w)) continue;
      cuts.push({ shape: c.shape, w: c.w, filled: true });
    }
    // Copper of other nets.
    const other = (n: number) => n !== a.net;
    const cut = (shape: DesignShape, w: number, filled: boolean, reach: number, key: string, objNet: number) => {
      const b = shapeBox(shape);
      if (!overlaps(box, b, reach)) return;
      const c = centre(b);
      const r = Math.max(b.maxX - b.minX, b.maxY - b.minY) / 2 + reach;
      if (!reaches(c, c, r, polys, box)) return;
      const clearance = Math.max(input.clearance(key, netName(objNet)), input.clearance(key, net));
      cuts.push({ shape, w: w + 2 * clearance, filled });
    };
    for (const t of design.tracks) {
      if (t.layer !== id || !other(t.net)) continue;
      const c = Math.max(input.clearance('COPPER_TO_TRACK', netName(t.net)), input.clearance('COPPER_TO_TRACK', net));
      if (!reaches(t.a, t.b, t.w / 2 + c, polys, box)) continue;
      if (t.arc) {
        const rr = Math.hypot(t.a.x - t.arc.c.x, t.a.y - t.arc.c.y);
        const start = (Math.atan2(t.a.y - t.arc.c.y, t.a.x - t.arc.c.x) * 180) / Math.PI;
        let sweep = (Math.atan2(t.b.y - t.arc.c.y, t.b.x - t.arc.c.x) * 180) / Math.PI - start;
        if (t.arc.ccw) while (sweep <= 0) sweep += 360;
        else while (sweep >= 0) sweep -= 360;
        cuts.push({ shape: { arc: { c: t.arc.c, r: rr, start, sweep } }, w: t.w + 2 * c, filled: false });
      } else cuts.push({ shape: { line: [t.a, t.b] }, w: t.w + 2 * c, filled: false });
    }
    design.vias.forEach((v) => {
      if (!other(v.net)) return;
      const lo = Number(v.from.slice(1));
      const hi = Number(v.to.slice(1));
      if (!(level >= Math.min(lo, hi) && level <= Math.max(lo, hi))) return;
      const ring = v.layers.includes(id) ? v.sizes?.[id] ?? v.d : 0;
      const d = ring > 0 ? ring : v.drill;
      cut({ circle: { c: v.at, r: d / 2 } }, 0, true, input.clearance('COPPER_TO_VIA'), ring > 0 ? 'COPPER_TO_VIA' : 'DRILL_TO_COPPER', v.net);
    });
    for (const p of design.pads) {
      if (!other(p.net)) continue;
      const own = p.shapes.find((s) => s.layers.includes(id));
      const key = p.type === 'smd' ? 'COPPER_TO_SMD' : 'COPPER_TO_PAD';
      if (own) {
        for (const s of padShapes(own.shape, p.at, p.rot)) cut(s, 0, true, input.clearance(key), key, p.net);
      } else if (p.hole) {
        const d = p.hole.slot ? Math.max(p.hole.slot.w, p.hole.slot.h) : p.hole.d;
        cut({ circle: { c: p.at, r: d / 2 } }, 0, true, input.clearance('DRILL_TO_COPPER'), 'DRILL_TO_COPPER', p.net);
      }
    }
    for (const z of design.zones) {
      if (z.teardrop && z.layers.includes(id) && other(z.net)) for (const c of z.outline) cut({ poly: c }, 0, true, input.clearance('COPPER_TO_TRACK'), 'COPPER_TO_TRACK', z.net);
      // Keep-outs of copper pours and plane areas.
      if (z.keepout && z.layers.includes(id) && /copper pour and plane area/.test(z.name ?? '')) for (const c of z.outline) cuts.push({ shape: { poly: c }, w: 0, filled: true });
    }
    design.graphics.forEach((g, gi) => {
      if (g.layer !== id || !input.copperGraphics.has(gi) || !other(g.net ?? 0)) return;
      cut(g.shape, g.w, g.filled, input.clearance('COPPER_TO_COPPER') || input.clearance('COPPER_TO_TRACK'), 'COPPER_TO_TRACK', g.net ?? 0);
    });
    out.push({ layer: id, net: a.net, pullback: 0, clearances: [], thermals: [], area: a.contours, name: a.name, cuts, positive: true });
  });
  if (removesUnusedPads(input.pcb) && level > 1 && level < input.layers.copper) removeUnused(input, id, sorted.map((x) => ({ net: x.a.net, polys: x.polys, box: x.box })));
  return out;
}

// Vias and through-hole pads on an inner mixed plane layer that no track there ends on and that do not lie in an area
// of their own net lose their copper on that layer.
function removeUnused(input: PlaneInput, id: string, areas: { net: number; polys: Poly[]; box: Box }[]) {
  const { design } = input;
  // Track ends on the layer in a grid of 1 mm cells.
  const ends = new Map<string, Pt[]>();
  const cell = (x: number, y: number) => `${Math.floor(x)},${Math.floor(y)}`;
  for (const t of design.tracks) {
    if (t.layer !== id) continue;
    for (const e of [t.a, t.b]) {
      const key = cell(e.x, e.y);
      const list = ends.get(key);
      if (list) list.push(e);
      else ends.set(key, [e]);
    }
  }
  const ended = (at: Pt, r: number) => {
    const n = Math.ceil(r);
    for (let i = -n; i <= n; i += 1) {
      for (let j = -n; j <= n; j += 1) {
        for (const e of ends.get(cell(at.x + i, at.y + j)) ?? []) if (Math.hypot(e.x - at.x, e.y - at.y) <= r + 1e-6) return true;
      }
    }
    return false;
  };
  const used = (at: Pt, r: number, net: number) => {
    if (ended(at, r)) return true;
    for (let i = areas.length - 1; i >= 0; i -= 1) {
      const a = areas[i];
      const b = a.box;
      if (at.x < b.minX || at.x > b.maxX || at.y < b.minY || at.y > b.maxY || !inside(at, a.polys)) continue;
      return a.net === net && net > 0;
    }
    return false;
  };
  for (const v of design.vias) {
    if (!v.layers.includes(id)) continue;
    const d = v.sizes?.[id] ?? v.d;
    if (used(v.at, d / 2, v.net)) continue;
    v.layers = v.layers.filter((l) => l !== id);
    if (v.sizes?.[id] !== undefined) delete v.sizes[id];
  }
  for (const p of design.pads) {
    const s = p.hole ? p.shapes.find((x) => x.layers.includes(id)) : undefined;
    if (!s || used(p.at, Math.min(s.shape.w, s.shape.h) / 2, p.net)) continue;
    p.shapes = p.shapes.map((x) => (x.layers.includes(id) ? { ...x, layers: x.layers.filter((l) => l !== id) } : x)).filter((x) => x.layers.length);
  }
}


// --- CAM planes ---

function camPlane(input: PlaneInput, level: number): DesignPlane | null {
  const { design, layers } = input;
  const l = layers.levels.get(level);
  const id = input.id(level);
  const nets = new Set((l?.nets ?? []).map((n) => design.nets.indexOf(n)).filter((n) => n > 0));
  const net = [...nets][0] ?? 0;
  const pullback = input.clearance('OUTLINE_TO_COPPER') || 0;
  const plane: DesignPlane = { layer: id, net, pullback, clearances: [], thermals: [] };
  const flags = Number(input.pcb.get('THERFLAGS')?.[0] ?? 0);
  const spoke = Number(input.pcb.get('THERLINEWID')?.[0] ?? 0) * input.unit;
  const inner = level > 1 && level < layers.copper;
  // The entry of a stack for this layer: the layer itself, else the inner layers' (or the side's).
  const entry = (stack: StackLineLike[], bottom: boolean, kinds: string[]) => {
    const own = stack.find((s) => s.level > 0 && (bottom ? layers.mirror(s.level) : s.level) === level && kinds.includes(s.shape));
    if (own) return own;
    const side = inner ? -1 : (level === 1) !== bottom ? -2 : 0;
    return stack.find((s) => s.level === side && kinds.includes(s.shape));
  };
  const hole = (at: Pt, rot: number, size: number, stack: StackLineLike[], scale: number, bottom: boolean, via: boolean, connects: boolean) => {
    if (connects) {
      const t = entry(stack, bottom, ['RT', 'ST']);
      const parsed = t ? input.padShape(t, scale, via, bottom).thermal : undefined;
      if (parsed && parsed.outer > parsed.d) {
        plane.thermals.push({ at, d: parsed.d, gap: (parsed.outer - parsed.d) / 2, spokes: parsed.spokes, width: parsed.width, angle: rot + (bottom ? -parsed.angle : parsed.angle) });
        return;
      }
      const gap = input.clearance('COPPER_TO_PAD');
      if (spoke > 0 && gap > 0) plane.thermals.push({ at, d: size, gap, spokes: 4, width: spoke, angle: rot + ((flags & 1) ? 0 : 45) });
      return;
    }
    const a = entry(stack, bottom, ['RA', 'SA']);
    const parsed = a ? input.padShape(a, scale, via, bottom).antipad : undefined;
    plane.clearances.push({ at, d: parsed?.d ?? size + 2 * input.clearance(via ? 'COPPER_TO_VIA' : 'COPPER_TO_PAD') });
  };
  design.pads.forEach((p, i) => {
    if (!p.hole) return;
    const st = input.padStacks[i];
    const pad = st ? entry(st.stack, st.bottom, ['R', 'S', 'A', 'O', 'C', 'OF', 'RF']) : undefined;
    const size = pad && pad.size > 0 ? pad.size * st.scale : Math.max(p.hole.d, p.hole.slot ? Math.max(p.hole.slot.w, p.hole.slot.h) : 0);
    hole(p.at, p.rot, size, st?.stack ?? [], st?.scale ?? 1, st?.bottom ?? false, false, p.hole.plated && nets.has(p.net));
  });
  design.vias.forEach((v, i) => {
    const lo = Number(v.from.slice(1));
    const hi = Number(v.to.slice(1));
    if (!(level >= Math.min(lo, hi) && level <= Math.max(lo, hi))) return;
    const t = input.viaTypes[i];
    const pad = t ? entry(t.lines, false, ['R', 'S', 'A', 'O', 'C']) : undefined;
    const size = pad && pad.size > 0 ? pad.size * input.unit : v.drill;
    hole(v.at, 0, size, t?.lines ?? [], input.unit, false, true, nets.has(v.net));
  });
  return plane;
}

// --- All ---

export function padsPlanes(input: PlaneInput): { planes: DesignPlane[]; warnings: string[] } {
  const planes: DesignPlane[] = [];
  const warnings: string[] = [];
  const byLevel = new Map<number, PlaneArea[]>();
  for (const a of input.areas) {
    const list = byLevel.get(a.level);
    if (list) list.push(a);
    else byLevel.set(a.level, [a]);
  }
  const mixed: string[] = [];
  for (const [level, areas] of [...byLevel].sort((x, y) => x[0] - y[0])) {
    if (input.layers.levels.get(level)?.plane === 'cam') continue;
    planes.push(...mixedPlanes(input, level, areas));
    mixed.push(input.layers.levels.get(level)?.name ?? `layer ${level}`);
  }
  if (mixed.length) {
    warnings.push(`The file keeps only the outlines of the plane areas of ${mixed.join(' and ')}, so their copper is drawn from those outlines, clear of other nets by the design rules; isolated copper is not removed, so it can differ from PADS's flood.`);
  }
  const cam: string[] = [];
  for (let level = 1; level <= input.layers.copper; level += 1) {
    if (input.layers.levels.get(level)?.plane !== 'cam') continue;
    const p = camPlane(input, level);
    if (p) {
      planes.push(p);
      cam.push(input.layers.levels.get(level)?.name ?? `layer ${level}`);
    }
  }
  if (cam.length) warnings.push(`${cam.join(' and ')} ${cam.length === 1 ? 'is a CAM plane' : 'are CAM planes'}: drawn as the board shape in copper with the antipads and thermal reliefs of the pad stacks.`);
  return { planes, warnings };
}
