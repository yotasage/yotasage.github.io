// Pure PCB board statistics computed from Board (works for both EDA designs
// like KiCad/Altium/PADS/EAGLE and Gerber + Excellon manufacturing sets).

import { Aperture, Board, Contour, isEmptyBox, Layer, Pt, unionBox } from './model';
import { shapeBox } from './outline';

export interface ViaStats {
  count: number;
  source: 'design' | 'gerber-x2' | 'gerber-inferred';
  minOuterMm: number | null;
  maxOuterMm: number | null;
  minDrillMm: number | null;
  maxDrillMm: number | null;
  minAnnularRingMm: number | null;
  uniqueSizes: number;
  byType: {
    through: number;
    blind: number;
    buried: number;
    micro: number;
  };
}

export interface DrillStats {
  total: number;
  plated: number;
  nonPlated: number;
  slots: number;
  minDiameterMm: number | null;
  maxDiameterMm: number | null;
  uniqueDiameters: number;
}

export interface TrackStats {
  segmentCount: number;
  minWidthMm: number | null;
  maxWidthMm: number | null;
  totalLengthMm: number | null;
}

export interface ComponentStats {
  total: number;
  top: number;
  bottom: number;
  smd: number;
  tht: number;
}

export interface PadStats {
  total: number;
  smd: number;
  tht: number;
  npth: number;
}

export interface PcbStats {
  widthMm: number | null;
  heightMm: number | null;
  areaMm2: number | null;
  copperLayers: number;
  vias: ViaStats;
  drills: DrillStats;
  tracks: TrackStats;
  components: ComponentStats | null;
  pads: PadStats | null;
  netsCount: number | null;
  zonesCount: number | null;
}

function roundUm(mm: number): number {
  return Math.round(mm * 1000);
}

function updateMinMax(cur: { min: number; max: number }, v: number) {
  if (!Number.isFinite(v) || v <= 0) return;
  if (v < cur.min) cur.min = v;
  if (v > cur.max) cur.max = v;
}

function arcLength(a: Pt, b: Pt, c: Pt, ccw: boolean): number {
  const r = Math.hypot(a.x - c.x, a.y - c.y);
  if (r <= 1e-9) return 0;
  const a1 = Math.atan2(a.y - c.y, a.x - c.x);
  const a2 = Math.atan2(b.y - c.y, b.x - c.x);
  let sweep = ccw ? a2 - a1 : a1 - a2;
  if (sweep <= 1e-9) sweep += Math.PI * 2;
  return r * sweep;
}

/**
 * Computes signed area of a closed contour (CCW outer contours are positive,
 * CW cutouts are negative), including exact circular arc segment corrections.
 */
export function contourSignedAreaMm2(contour: Contour): number {
  if (contour.segs.length === 0) return 0;
  let area = 0;
  let prev = contour.start;
  for (const seg of contour.segs) {
    const next = seg.to;
    // Polygon chord contribution (shoelace)
    area += (prev.x * next.y - next.x * prev.y) * 0.5;
    if (seg.arc) {
      const { c, ccw } = seg.arc;
      const r = Math.hypot(prev.x - c.x, prev.y - c.y);
      if (r > 1e-9) {
        const a1 = Math.atan2(prev.y - c.y, prev.x - c.x);
        const a2 = Math.atan2(next.y - c.y, next.x - c.x);
        let theta = ccw ? a2 - a1 : a1 - a2;
        if (theta <= 1e-9) theta += Math.PI * 2;
        // Circular segment area between arc and chord: 0.5 * r^2 * (theta - sin(theta))
        const segArea = 0.5 * r * r * (theta - Math.sin(theta));
        area += ccw ? segArea : -segArea;
      }
    }
    prev = next;
  }
  // Close back to start if final segment didn't land exactly on start
  if (Math.hypot(prev.x - contour.start.x, prev.y - contour.start.y) > 1e-6) {
    area += (prev.x * contour.start.y - contour.start.x * prev.y) * 0.5;
  }
  return area;
}

function apertureOuterDiameter(ap: Aperture | undefined): number | null {
  if (!ap || ap.parts.length === 0) return null;
  // Single dark circle aperture is the standard via pad shape.
  const darkParts = ap.parts.filter((p) => p.dark);
  if (darkParts.length === 1 && darkParts[0].circle) {
    return darkParts[0].circle.r * 2;
  }
  // Fallback: bounding diameter of aperture parts
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of darkParts) {
    if (p.circle) {
      minX = Math.min(minX, p.circle.c.x - p.circle.r);
      maxX = Math.max(maxX, p.circle.c.x + p.circle.r);
      minY = Math.min(minY, p.circle.c.y - p.circle.r);
      maxY = Math.max(maxY, p.circle.c.y + p.circle.r);
    } else if (p.poly) {
      for (const pt of p.poly) {
        if (pt.x < minX) minX = pt.x;
        if (pt.x > maxX) maxX = pt.x;
        if (pt.y < minY) minY = pt.y;
        if (pt.y > maxY) maxY = pt.y;
      }
    }
  }
  if (!Number.isFinite(minX)) return null;
  return Math.max(maxX - minX, maxY - minY);
}

function isViaAperture(ap: Aperture | undefined): boolean {
  const fn = ap?.attrs?.['.AperFunction'] ?? '';
  return /\bviapad\b/i.test(fn);
}

function isViaDrillLayer(layer: Layer): boolean {
  const fn = layer.attrs?.['.FileFunction'] ?? '';
  return /\bviadrill\b/i.test(fn);
}

function computeGerberVias(board: Board): ViaStats {
  const empty: ViaStats = {
    count: 0,
    source: 'gerber-inferred',
    minOuterMm: null,
    maxOuterMm: null,
    minDrillMm: null,
    maxDrillMm: null,
    minAnnularRingMm: null,
    uniqueSizes: 0,
    byType: { through: 0, blind: 0, buried: 0, micro: 0 },
  };

  const copperLayers = board.layers.filter((l) => l.kind === 'copper');
  const drillLayers = board.layers.filter((l) => l.kind === 'drill');
  if (copperLayers.length === 0 && drillLayers.length === 0) return empty;

  // Spatial hash of round copper flashes (cell = 0.25mm)
  const CELL = 0.25;
  const keyOf = (x: number, y: number) => `${Math.round(x / CELL)},${Math.round(y / CELL)}`;

  interface FlashEntry {
    x: number;
    y: number;
    d: number;
    layerIdx: number;
    isX2Via: boolean;
  }

  const grid = new Map<string, FlashEntry[]>();
  let hasX2ViaPads = false;

  copperLayers.forEach((layer, layerIdx) => {
    for (const item of layer.items) {
      if (!item.dark || item.k !== 'flash') continue;
      const ap = layer.apertures[item.ap];
      const baseD = apertureOuterDiameter(ap);
      if (!baseD || baseD <= 0) continue;
      const d = baseD * (item.scale || 1);
      const isX2Via = isViaAperture(ap);
      if (isX2Via) hasX2ViaPads = true;
      const entry: FlashEntry = { x: item.at.x, y: item.at.y, d, layerIdx, isX2Via };
      const k = keyOf(item.at.x, item.at.y);
      const bucket = grid.get(k);
      if (bucket) bucket.push(entry);
      else grid.set(k, [entry]);
    }
  });

  const outerRange = { min: Infinity, max: -Infinity };
  const drillRange = { min: Infinity, max: -Infinity };
  let minRing = Infinity;
  const pairKeys = new Set<string>();
  let count = 0;
  let usedX2 = hasX2ViaPads;

  const findMatches = (x: number, y: number): FlashEntry[] => {
    const cx = Math.round(x / CELL);
    const cy = Math.round(y / CELL);
    const hits: FlashEntry[] = [];
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const bucket = grid.get(`${cx + dx},${cy + dy}`);
        if (!bucket) continue;
        for (const f of bucket) {
          if (Math.hypot(f.x - x, f.y - y) <= 0.03) hits.push(f);
        }
      }
    }
    return hits;
  };

  for (const dl of drillLayers) {
    const layerIsVia = isViaDrillLayer(dl);
    if (layerIsVia) usedX2 = true;

    for (const item of dl.items) {
      if (!item.dark || item.k !== 'hole' || item.to || !item.plated) continue;
      const drill = item.d;
      if (!Number.isFinite(drill) || drill <= 0) continue;

      const matches = findMatches(item.at.x, item.at.y);
      const x2Matches = matches.filter((m) => m.isX2Via);

      let outer: number | null = null;
      let isVia = false;

      if (x2Matches.length > 0) {
        isVia = true;
        outer = Math.max(...x2Matches.map((m) => m.d));
      } else if (layerIsVia) {
        isVia = true;
        if (matches.length > 0) outer = Math.max(...matches.map((m) => m.d));
      } else if (!hasX2ViaPads && drill <= 0.65) {
        // Heuristic fallback when Gerber X2 ViaPad/ViaDrill attributes are absent:
        // plated round hole <= 0.65 mm coinciding with small round copper pads on >= 2 copper layers.
        const layersHit = new Set(matches.map((m) => m.layerIdx));
        const maxD = matches.length > 0 ? Math.max(...matches.map((m) => m.d)) : 0;
        if (layersHit.size >= 2 && maxD > drill + 0.02 && maxD <= Math.max(drill * 3, 1.5)) {
          isVia = true;
          outer = maxD;
        }
      }

      if (!isVia) continue;
      count++;
      updateMinMax(drillRange, drill);
      if (outer !== null && outer > 0) {
        updateMinMax(outerRange, outer);
        const ring = Math.max(0, (outer - drill) / 2);
        if (ring < minRing) minRing = ring;
        pairKeys.add(`${roundUm(outer)}:${roundUm(drill)}`);
      } else {
        pairKeys.add(`?:${roundUm(drill)}`);
      }
    }
  }

  return {
    count,
    source: usedX2 ? 'gerber-x2' : 'gerber-inferred',
    minOuterMm: Number.isFinite(outerRange.min) ? outerRange.min : null,
    maxOuterMm: Number.isFinite(outerRange.max) ? outerRange.max : null,
    minDrillMm: Number.isFinite(drillRange.min) ? drillRange.min : null,
    maxDrillMm: Number.isFinite(drillRange.max) ? drillRange.max : null,
    minAnnularRingMm: Number.isFinite(minRing) ? minRing : null,
    uniqueSizes: pairKeys.size,
    byType: { through: count, blind: 0, buried: 0, micro: 0 },
  };
}

export function computePcbStats(board: Board): PcbStats {
  // --- Board geometry ---
  let box = board.outline?.length ? shapeBox(board.outline) : null;
  if (!box) {
    for (const l of board.layers) {
      if (!isEmptyBox(l.bbox)) box = box ? unionBox(box, l.bbox) : { ...l.bbox };
    }
  }
  const widthMm = box && !isEmptyBox(box) ? box.maxX - box.minX : null;
  const heightMm = box && !isEmptyBox(box) ? box.maxY - box.minY : null;

  let areaMm2: number | null = null;
  if (board.outline?.length) {
    let total = 0;
    for (const c of board.outline) total += contourSignedAreaMm2(c);
    const absArea = Math.abs(total);
    if (absArea > 1e-4) areaMm2 = absArea;
  }
  if (areaMm2 === null && widthMm !== null && heightMm !== null) {
    areaMm2 = widthMm * heightMm;
  }

  const copperLayers = board.layers.filter((l) => l.kind === 'copper').length;
  const design = board.design;

  // --- Vias ---
  let vias: ViaStats;
  if (design) {
    const outerRange = { min: Infinity, max: -Infinity };
    const drillRange = { min: Infinity, max: -Infinity };
    let minRing = Infinity;
    const pairKeys = new Set<string>();
    const byType = { through: 0, blind: 0, buried: 0, micro: 0 };

    for (const v of design.vias) {
      byType[v.type]++;
      const layerSizes = v.sizes ? Object.values(v.sizes).filter((s) => Number.isFinite(s) && s > 0) : [];
      const minD = layerSizes.length > 0 ? Math.min(v.d, ...layerSizes) : v.d;
      const maxD = layerSizes.length > 0 ? Math.max(v.d, ...layerSizes) : v.d;

      updateMinMax(outerRange, minD);
      updateMinMax(outerRange, maxD);
      updateMinMax(drillRange, v.drill);

      if (minD > 0 && v.drill > 0) {
        const ring = Math.max(0, (minD - v.drill) / 2);
        if (ring < minRing) minRing = ring;
      }
      pairKeys.add(`${roundUm(v.d)}:${roundUm(v.drill)}`);
    }

    vias = {
      count: design.vias.length,
      source: 'design',
      minOuterMm: Number.isFinite(outerRange.min) ? outerRange.min : null,
      maxOuterMm: Number.isFinite(outerRange.max) ? outerRange.max : null,
      minDrillMm: Number.isFinite(drillRange.min) ? drillRange.min : null,
      maxDrillMm: Number.isFinite(drillRange.max) ? drillRange.max : null,
      minAnnularRingMm: Number.isFinite(minRing) ? minRing : null,
      uniqueSizes: pairKeys.size,
      byType,
    };
  } else {
    vias = computeGerberVias(board);
  }

  // --- Drills ---
  const drillRange = { min: Infinity, max: -Infinity };
  const drillDiameters = new Set<number>();
  let drillTotal = 0;
  let drillPlated = 0;
  let drillNonPlated = 0;
  let drillSlots = 0;

  const recordDrill = (d: number, plated: boolean, isSlot: boolean) => {
    drillTotal++;
    if (plated) drillPlated++;
    else drillNonPlated++;
    if (isSlot) drillSlots++;
    if (Number.isFinite(d) && d > 0) {
      updateMinMax(drillRange, d);
      drillDiameters.add(roundUm(d));
    }
  };

  if (design) {
    for (const v of design.vias) {
      if (v.drill > 0) recordDrill(v.drill, true, false);
    }
    for (const p of design.pads) {
      if (!p.hole) continue;
      const d = p.hole.slot ? Math.min(p.hole.slot.w, p.hole.slot.h) : p.hole.d;
      recordDrill(d, p.hole.plated, Boolean(p.hole.slot));
    }
    for (const h of design.holes) {
      const d = h.slot ? Math.min(h.slot.w, h.slot.h) : h.d;
      recordDrill(d, h.plated, Boolean(h.slot));
    }
  } else {
    for (const l of board.layers) {
      if (l.kind !== 'drill') continue;
      for (const item of l.items) {
        if (!item.dark || item.k !== 'hole') continue;
        recordDrill(item.d, item.plated, Boolean(item.to));
      }
    }
  }

  const drills: DrillStats = {
    total: drillTotal,
    plated: drillPlated,
    nonPlated: drillNonPlated,
    slots: drillSlots,
    minDiameterMm: Number.isFinite(drillRange.min) ? drillRange.min : null,
    maxDiameterMm: Number.isFinite(drillRange.max) ? drillRange.max : null,
    uniqueDiameters: drillDiameters.size,
  };

  // --- Tracks ---
  const trackRange = { min: Infinity, max: -Infinity };
  let segmentCount = 0;
  let totalLengthMm = 0;

  if (design) {
    for (const tr of design.tracks) {
      segmentCount++;
      updateMinMax(trackRange, tr.w);
      totalLengthMm += tr.arc
        ? arcLength(tr.a, tr.b, tr.arc.c, tr.arc.ccw)
        : Math.hypot(tr.b.x - tr.a.x, tr.b.y - tr.a.y);
    }
  } else {
    for (const l of board.layers) {
      if (l.kind !== 'copper') continue;
      for (const item of l.items) {
        if (!item.dark) continue;
        if (item.k === 'line' && item.w > 0) {
          segmentCount++;
          updateMinMax(trackRange, item.w);
          totalLengthMm += Math.hypot(item.b.x - item.a.x, item.b.y - item.a.y);
        } else if (item.k === 'arc' && item.w > 0) {
          segmentCount++;
          updateMinMax(trackRange, item.w);
          totalLengthMm += item.r * Math.abs((item.sweep * Math.PI) / 180);
        }
      }
    }
  }

  const tracks: TrackStats = {
    segmentCount,
    minWidthMm: Number.isFinite(trackRange.min) ? trackRange.min : null,
    maxWidthMm: Number.isFinite(trackRange.max) ? trackRange.max : null,
    totalLengthMm: segmentCount > 0 ? totalLengthMm : null,
  };

  // --- Components & Pads ---
  let components: ComponentStats | null = null;
  const compList = design ? design.components : board.placements;
  if (compList.length > 0) {
    let top = 0;
    let bottom = 0;
    let smd = 0;
    let tht = 0;
    for (const c of compList) {
      if (c.side === 'bottom') bottom++;
      else top++;
      const kind = c.attrs?.type;
      if (kind === 'smd') smd++;
      else if (kind === 'through_hole') tht++;
    }
    components = { total: compList.length, top, bottom, smd, tht };
  }

  let pads: PadStats | null = null;
  if (design && design.pads.length > 0) {
    let smd = 0;
    let tht = 0;
    let npth = 0;
    for (const p of design.pads) {
      if (p.type === 'smd') smd++;
      else if (p.type === 'th') tht++;
      else if (p.type === 'np') npth++;
    }
    pads = { total: design.pads.length, smd, tht, npth };
  }

  const netsCount = design ? Math.max(0, design.nets.length - 1) : null;
  const zonesCount = design ? design.zones.filter((z) => !z.keepout && !z.teardrop).length : null;

  return {
    widthMm,
    heightMm,
    areaMm2,
    copperLayers,
    vias,
    drills,
    tracks,
    components,
    pads,
    netsCount,
    zonesCount,
  };
}
