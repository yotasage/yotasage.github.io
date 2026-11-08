// Turns a Design (from any design format) into a Board: artwork layers with their kind and side, so that the layer
// view, the realistic view, measuring and the exports work as for Gerber files. Pads and vias are flashes of
// apertures (measuring snaps to their centres), tracks are lines and arcs, zones are their saved fill, mask and paste
// openings are the shapes the reader made, and the holes go to drill layers: plated, non-plated, and one per span of
// blind and buried vias. Board.objects gets an entry per pad, via, zone and component and one per net for tracks;
// Board.placements gets the components.
import { addItem, apertureBox, DEG } from '../geometry';
import { compareLayers } from '../identify';
import {
  Aperture, ArtItem, Board, BoardObject, Design, DesignLayer, emptyBox, Layer, PadShape, Placement, Pt,
} from '../model';
import { boardShape } from '../outline';
import { graphicItems, textItems } from './art';
import { padParts, shapeKey } from './pads';

export interface BuildOptions {
  name: string;
  source: Board['source'];
  onProgress?: (share: number) => void;
  pause?: () => Promise<void>;
}

class LayerArt {
  items: ArtItem[] = [];
  apertures: Aperture[] = [];
  private keys = new Map<string, number>();
  // Knockout text goes first, so its letters erase only its own box.
  knockout: ArtItem[] = [];

  constructor(readonly layer: Layer) {}

  aperture(shape: PadShape): number {
    const key = shapeKey(shape);
    let i = this.keys.get(key);
    if (i === undefined) {
      i = this.apertures.length;
      this.apertures.push({ parts: padParts(shape), name: describeShape(shape) });
      this.keys.set(key, i);
    }
    return i;
  }

  flash(at: Pt, shape: PadShape, rot: number, obj: number | undefined) {
    const ap = this.aperture(shape);
    if (!this.apertures[ap].parts.length) return;
    this.items.push({ k: 'flash', at, ap, rot, mirror: 'none', scale: 1, dark: true, ...(obj !== undefined ? { obj } : {}) });
  }
}

function describeShape(s: PadShape): string {
  const size = `${round(s.w)} × ${round(s.h)} mm`;
  switch (s.k) {
    case 'circle':
      return `Circle ${round(s.w)} mm`;
    case 'roundrect':
      return `Rounded rectangle ${size}, radius ${round(s.r ?? 0)} mm`;
    case 'custom':
      return `Custom shape ${size}`;
    default:
      return `${s.k.charAt(0).toUpperCase()}${s.k.slice(1)} ${size}`;
  }
}

function round(v: number): string {
  return String(Math.round(v * 1e4) / 1e4);
}

const SLICE_MS = 30;

export async function buildDesignBoard(design: Design, o: BuildOptions): Promise<Board> {
  let slice = performance.now();
  let done = 0;
  const total = design.pads.length + design.tracks.length + design.vias.length + design.zones.length + design.graphics.length + design.texts.length || 1;
  const tick = async (n = 1) => {
    done += n;
    if (performance.now() - slice < SLICE_MS) return;
    o.onProgress?.(Math.min(1, done / total));
    if (o.pause) await o.pause();
    slice = performance.now();
  };

  // Layers.
  const art = new Map<string, LayerArt>();
  const layerFor = (d: DesignLayer): LayerArt => {
    let a = art.get(d.id);
    if (!a) {
      a = new LayerArt({
        id: d.id, name: d.name, kind: d.kind, side: d.side, identifiedBy: 'design', items: [], apertures: [], bbox: emptyBox(),
        ...(d.copper ? { copper: d.copper } : {}),
        ...(d.label ? { label: d.label } : {}),
      });
      art.set(d.id, a);
    }
    return a;
  };
  const byId = new Map(design.layers.map((l) => [l.id, l]));
  const get = (id: string): LayerArt | null => {
    const d = byId.get(id);
    return d ? layerFor(d) : null;
  };
  for (const l of design.layers) layerFor(l);

  // Objects.
  const objects: BoardObject[] = [];
  const netName = (n: number) => (n > 0 ? design.nets[n] : undefined);
  const compObjects = design.components.map((c, index) => {
    objects.push({ kind: 'component', component: c.ref, info: { value: c.value, footprint: c.footprint }, design: { list: 'components', index } });
    return objects.length - 1;
  });
  const shared = new Map<string, number>();
  const sharedObject = (kind: string, net: number): number => {
    const key = `${kind}|${net}`;
    let i = shared.get(key);
    if (i === undefined) {
      i = objects.length;
      objects.push({ kind, ...(netName(net) ? { net: netName(net) } : {}) });
      shared.set(key, i);
    }
    return i;
  };
  const dash = design.dash ?? { dash: 12, gap: 3 };

  // Knockout texts first, then everything else in the order: zones, graphics, tracks, vias, pads, texts.
  for (const t of design.texts) {
    if (!t.knockout) continue;
    const a = get(t.layer);
    if (a) a.knockout.push(...textItems(t, t.comp !== undefined ? compObjects[t.comp] : sharedObject('text', 0)));
    await tick();
  }

  // Zones: the fill as saved, an outline for those never filled, and rule areas on a layer of their own.
  let rules: LayerArt | null = null;
  design.zones.forEach((z, index) => {
    if (z.keepout) {
      if (!rules) {
        rules = new LayerArt({ id: 'design:rule-areas', name: 'Rule areas', kind: 'keepout', side: 'none', label: 'Rule areas', identifiedBy: 'design', items: [], apertures: [], bbox: emptyBox() });
        art.set(rules.layer.id, rules);
      }
      const obj = objects.push({ kind: 'rule area', ...(z.name ? { info: { name: z.name, layers: z.layers.join(', ') } } : { info: { layers: z.layers.join(', ') } }), design: { list: 'zones', index } }) - 1;
      for (const c of z.outline) rules.items.push(...graphicItems({ layer: '', shape: { poly: c }, w: 0.05, filled: false }, obj, dash));
      return;
    }
    const obj = objects.push({ kind: z.teardrop ? 'teardrop' : 'zone', ...(netName(z.net) ? { net: netName(z.net) } : {}), ...(z.name ? { info: { name: z.name } } : {}), design: { list: 'zones', index } }) - 1;
    for (const f of z.fill) {
      const a = get(f.layer);
      if (!a) continue;
      a.items.push({ k: 'region', contours: f.contours, dark: true, obj });
      if (z.stroke) for (const c of f.contours) a.items.push(...graphicItems({ layer: '', shape: { poly: c }, w: z.stroke, filled: false }, obj, dash));
    }
    if (z.unfilled) {
      for (const id of z.layers) {
        const a = get(id);
        if (a) for (const c of z.outline) a.items.push(...graphicItems({ layer: '', shape: { poly: c }, w: 0.1, filled: false }, obj, dash));
      }
    }
  });
  await tick(design.zones.length);

  for (const g of design.graphics) {
    const a = get(g.layer);
    if (a) a.items.push(...graphicItems(g, g.comp !== undefined ? compObjects[g.comp] : sharedObject('graphic', g.net ?? 0), dash));
    await tick();
  }

  for (const t of design.tracks) {
    const a = get(t.layer);
    if (a && t.w > 0) {
      const obj = sharedObject('track', t.net);
      if (t.arc) {
        const r = Math.hypot(t.a.x - t.arc.c.x, t.a.y - t.arc.c.y);
        const start = Math.atan2(t.a.y - t.arc.c.y, t.a.x - t.arc.c.x) / DEG;
        let sweep = Math.atan2(t.b.y - t.arc.c.y, t.b.x - t.arc.c.x) / DEG - start;
        if (t.arc.ccw) while (sweep <= 0) sweep += 360;
        else while (sweep >= 0) sweep -= 360;
        a.items.push({ k: 'arc', c: t.arc.c, r, start, sweep, w: t.w, dark: true, obj });
      } else {
        a.items.push({ k: 'line', a: t.a, b: t.b, w: t.w, cap: 'round', dark: true, obj });
      }
    }
    await tick();
  }

  // Drill layers.
  const copperLayers = design.layers.filter((l) => l.kind === 'copper');
  const copperCount = copperLayers.length;
  const copperNumber = (id: string) => byId.get(id)?.copper ?? 0;
  const drills = new Map<string, LayerArt>();
  const drillLayer = (key: string, plated: boolean, from = 1, to = copperCount, how = ''): LayerArt => {
    let a = drills.get(key);
    if (!a) {
      const span = from !== 1 || to !== copperCount;
      a = new LayerArt({
        id: `design:drill:${key}`,
        name: plated ? (span ? `Plated holes L${from}–L${to}` : 'Plated holes') : 'Non-plated holes',
        kind: 'drill',
        side: 'none',
        plated,
        identifiedBy: 'design',
        attrs: { '.FileFunction': `${plated ? 'Plated' : 'NonPlated'},${from},${to},${plated ? (how || 'PTH') : 'NPTH'}` },
        ...(span ? { label: `L${from}–L${to}${how ? `, ${how.toLowerCase()}` : ''}` } : {}),
        items: [],
        apertures: [],
        bbox: emptyBox(),
      });
      drills.set(key, a);
      art.set(a.layer.id, a);
    }
    return a;
  };

  design.vias.forEach((v, index) => {
    const obj = objects.push({
      kind: 'via', ...(netName(v.net) ? { net: netName(v.net) } : {}),
      info: { size: round(v.d), drill: round(v.drill), layers: `${v.from}–${v.to}`, type: v.type },
      design: { list: 'vias', index },
    }) - 1;
    for (const id of v.layers) {
      const a = get(id);
      const d = v.sizes?.[id] ?? v.d;
      if (a && d > 0) a.flash(v.at, { k: 'circle', w: d, h: d }, 0, obj);
    }
    if (v.mask) {
      const d = v.d + 2 * v.mask.margin;
      if (d > 0) {
        if (v.mask.top) get('F.Mask')?.flash(v.at, { k: 'circle', w: d, h: d }, 0, obj);
        if (v.mask.bottom) get('B.Mask')?.flash(v.at, { k: 'circle', w: d, h: d }, 0, obj);
      }
    }
    if (v.drill > 0) {
      const from = copperNumber(v.from) || 1;
      const to = copperNumber(v.to) || copperCount;
      const through = v.type === 'through' || (from === 1 && to === copperCount);
      const how = v.type === 'micro' ? 'Blind' : v.type === 'buried' ? 'Buried' : 'Blind';
      const a = through ? drillLayer('plated', true) : drillLayer(`${from}-${to}`, true, from, to, how);
      a.items.push({ k: 'hole', at: v.at, d: v.drill, plated: true, dark: true, obj });
    }
  });
  await tick(design.vias.length);

  for (let index = 0; index < design.pads.length; index += 1) {
    const p = design.pads[index];
    const comp = p.comp !== undefined ? design.components[p.comp] : undefined;
    const obj = objects.push({
      kind: 'pad',
      ...(netName(p.net) ? { net: netName(p.net) } : {}),
      ...(comp ? { component: comp.ref } : {}),
      ...(p.num ? { pin: p.num } : {}),
      ...(p.info ? { info: p.info } : {}),
      design: { list: 'pads', index },
    }) - 1;
    for (const s of p.shapes) {
      for (const id of s.layers) get(id)?.flash(p.at, s.shape, p.rot, obj);
    }
    if (p.hole) {
      const a = p.hole.plated ? drillLayer('plated', true) : drillLayer('npth', false);
      if (p.hole.slot && Math.abs(p.hole.slot.w - p.hole.slot.h) > 1e-9) {
        // A slot along the pad's longer axis, turned with the pad.
        const half = Math.abs(p.hole.slot.w - p.hole.slot.h) / 2;
        const along = p.hole.slot.w > p.hole.slot.h ? p.rot : p.rot + 90;
        const dx = Math.cos(along * DEG) * half;
        const dy = Math.sin(along * DEG) * half;
        a.items.push({ k: 'hole', at: { x: p.at.x - dx, y: p.at.y - dy }, to: { x: p.at.x + dx, y: p.at.y + dy }, d: Math.min(p.hole.slot.w, p.hole.slot.h), plated: p.hole.plated, dark: true, obj });
      } else {
        a.items.push({ k: 'hole', at: p.at, d: p.hole.d, plated: p.hole.plated, dark: true, obj });
      }
    }
    await tick();
  }

  for (const h of design.holes) {
    const a = h.plated ? drillLayer('plated', true) : drillLayer('npth', false);
    if (h.slot && Math.abs(h.slot.w - h.slot.h) > 1e-9) {
      const half = Math.abs(h.slot.w - h.slot.h) / 2;
      const along = h.slot.w > h.slot.h ? h.slot.rot : h.slot.rot + 90;
      const dx = Math.cos(along * DEG) * half;
      const dy = Math.sin(along * DEG) * half;
      a.items.push({ k: 'hole', at: { x: h.at.x - dx, y: h.at.y - dy }, to: { x: h.at.x + dx, y: h.at.y + dy }, d: Math.min(h.slot.w, h.slot.h), plated: h.plated, dark: true });
    } else {
      a.items.push({ k: 'hole', at: h.at, d: h.d, plated: h.plated, dark: true });
    }
  }

  for (const t of design.texts) {
    if (t.knockout) continue;
    const a = get(t.layer);
    if (a) a.items.push(...textItems(t, t.comp !== undefined ? compObjects[t.comp] : sharedObject('text', 0)));
    await tick();
  }

  // The layers: items with knockout text first, the box around them, and only layers that have something on them
  // (copper and mask layers stay: the realistic view needs to know there is a mask).
  const layers: Layer[] = [];
  for (const a of art.values()) {
    const items = a.knockout.length ? [...a.knockout, ...a.items] : a.items;
    const keep = items.length || a.layer.kind === 'copper' || a.layer.kind === 'mask';
    if (!keep) continue;
    const boxes = a.apertures.map(apertureBox);
    const bbox = emptyBox();
    for (const item of items) addItem(bbox, item, boxes);
    layers.push({ ...a.layer, items, apertures: a.apertures, bbox });
  }
  layers.sort(compareLayers);

  // The board shape: the design's outline, or else from the layers.
  const warnings = [...design.warnings];
  let outline = design.outline.length ? design.outline : undefined;
  let outlineFrom: Board['outlineFrom'] = outline ? 'design' : undefined;
  if (!outline) {
    const shape = boardShape(layers);
    if (shape) {
      outline = shape.contours;
      outlineFrom = shape.from;
      warnings.push(...shape.warnings);
    }
  }

  const placements: Placement[] = design.components.map((c) => ({
    ref: c.ref, value: c.value, footprint: c.footprint, at: c.at, rot: c.rot, side: c.side,
    ...(Object.keys(c.attrs).length ? { attrs: c.attrs } : {}),
    ...(Object.keys(c.fields).length ? { fields: c.fields } : {}),
  }));
  o.onProgress?.(1);
  return {
    name: o.name,
    source: o.source,
    layers,
    ...(outline ? { outline, outlineFrom } : {}),
    ...(design.stackup ? { stackup: design.stackup } : {}),
    objects,
    placements,
    design,
    warnings,
  };
}
