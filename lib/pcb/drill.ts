// Drill layers: Gerber drill files become holes like Excellon files, and Excellon files whose format the file does not
// state (as Linear's DRILL.drl, which has no header) get the format that puts the most holes on the pads of the
// copper layers.
import { candidateFormats, defaultFormat, DrillFormat, DrillProgram, plotExcellon } from './excellon';
import { apertureRadius } from './geometry';
import { ArtItem, Box, isEmptyBox, Layer, unionBox } from './model';
import { maxRadius, onPoint, pointIndex } from './points';

// Kept as long as the Gerber items are, so the drawing's cache (keyed by the items) holds across board rebuilds.
const converted = new WeakMap<ArtItem[], { plated: boolean; items: ArtItem[] }>();

// The items of a Gerber drill layer (X2 Plated or NonPlated) as holes: round flashes become holes and lines drawn
// with a round aperture become slots. Anything else (arcs, regions, other shapes) stays as it is.
export function gerberDrillItems(layer: Layer, plated: boolean): ArtItem[] {
  const cached = converted.get(layer.items);
  if (cached && cached.plated === plated) return cached.items;
  const round = layer.apertures.map((ap) => ap.parts.length === 1 && ap.parts[0].dark && ap.parts[0].circle && Math.hypot(ap.parts[0].circle.c.x, ap.parts[0].circle.c.y) < 1e-9);
  const radii = layer.apertures.map(apertureRadius);
  const items = layer.items.map((item): ArtItem => {
    const obj = item.obj !== undefined ? { obj: item.obj } : {};
    if (!item.dark) return item;
    if (item.k === 'flash' && round[item.ap]) return { k: 'hole', at: item.at, d: 2 * radii[item.ap] * item.scale, plated, dark: true, ...obj };
    if (item.k === 'line' && item.cap === 'round') return { k: 'hole', at: item.a, to: item.b, d: item.w, plated, dark: true, ...obj };
    return item;
  });
  converted.set(layer.items, { plated, items });
  return items;
}

export interface FittedFormat {
  format: DrillFormat;
  // The share of holes that land on a pad, a via or the end of a track, with this format; undefined without copper.
  onPads?: number;
}

// The share of copper layers' points a format puts holes on, of up to 400 holes.
function score(program: DrillProgram, format: DrillFormat, copper: Layer[], box: Box | null): { onPads: number; inside: number } {
  const plot = plotExcellon(program, format, { plated: true, maxHoles: 400 });
  const holes = plot.items.filter((i) => i.k === 'hole');
  if (!holes.length) return { onPads: 0, inside: 0 };
  const indices = copper.map(pointIndex);
  const reach = Math.min(3, Math.max(0, ...indices.map(maxRadius)));
  let on = 0;
  let inside = 0;
  for (const h of holes) {
    if (h.k !== 'hole') continue;
    if (onPoint(indices, h.at, 0.02, reach)) on += 1;
    if (box && h.at.x >= box.minX && h.at.x <= box.maxX && h.at.y >= box.minY && h.at.y <= box.maxY) inside += 1;
  }
  return { onPads: on / holes.length, inside: inside / holes.length };
}

// The format for a file that does not state all of it: the candidate that puts the most holes on the copper's pads
// (the most likely candidate first, so it wins a tie). Without copper layers, the most likely candidate.
export function fitFormat(program: DrillProgram, copper: Layer[]): FittedFormat {
  const candidates = candidateFormats(program);
  const usable = copper.filter((l) => l.items.length && !isEmptyBox(l.bbox));
  if (!usable.length || !candidates.length) return { format: candidates[0] ?? defaultFormat(program) };
  let box: Box | null = null;
  for (const l of usable) box = box ? unionBox(box, l.bbox) : { ...l.bbox };
  let best: FittedFormat | null = null;
  let bestScore = -1;
  for (const format of candidates) {
    const s = score(program, format, usable, box);
    // Holes on pads count most; holes inside the copper's extent decide between formats that hit no pads.
    const total = s.onPads + s.inside * 0.01;
    if (total > bestScore + 1e-9) {
      bestScore = total;
      best = { format, onPads: s.onPads };
    }
  }
  return best ?? { format: candidates[0] };
}
