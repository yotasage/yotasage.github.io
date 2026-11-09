// Markers of the parts of a pick-and-place file over a Gerber set: a layer per side ("Top pick-and-place", "Bottom
// pick-and-place") with, for each part, a ring around its position, a stroke from the centre in the direction of the
// part's X axis (its rotation, in KiCad's convention) and its designator beside it in the stroke font (mirrored on the
// bottom, so it reads from below). Sizes follow how close the parts are. Each part is an object of its own (kind
// 'placement', with its designator and its index in Board.placements), so a click finds it and a highlight lights it
// (with the X2 pads of the same designator). The page loads this module, with the stroke font, only when a
// pick-and-place file is opened.
import { DEG, addItem } from './geometry';
import { textItems } from './design/art';
import { ArtItem, BoardObject, emptyBox, Layer, Placement } from './model';

// The median distance from each part to its nearest neighbour on the same side.
function spacing(parts: Placement[]): number {
  if (parts.length < 2) return 4;
  const sorted = parts.map((p) => p.at).sort((a, b) => a.x - b.x);
  const near: number[] = [];
  for (let i = 0; i < sorted.length; i += 1) {
    let best = Infinity;
    for (let j = i - 1; j >= 0 && sorted[i].x - sorted[j].x < best; j -= 1) best = Math.min(best, Math.hypot(sorted[i].x - sorted[j].x, sorted[i].y - sorted[j].y));
    for (let j = i + 1; j < sorted.length && sorted[j].x - sorted[i].x < best; j += 1) best = Math.min(best, Math.hypot(sorted[i].x - sorted[j].x, sorted[i].y - sorted[j].y));
    if (best > 1e-6 && Number.isFinite(best)) near.push(best);
  }
  if (!near.length) return 4;
  near.sort((a, b) => a - b);
  return near[Math.floor(near.length / 2)];
}

// The marker layers of the placements; their objects are added to `objects`. `file` names the files on each side.
export function placementLayers(placements: Placement[], objects: BoardObject[], files: { top: string; bottom: string }): Layer[] {
  const out: Layer[] = [];
  for (const side of ['top', 'bottom'] as const) {
    const parts = placements.map((p, index) => ({ p, index })).filter(({ p }) => p.side === side);
    if (!parts.length) continue;
    const s = Math.min(2, Math.max(0.3, 0.4 * spacing(parts.map(({ p }) => p))));
    const items: ArtItem[] = [];
    for (const { p, index } of parts) {
      const obj = objects.push({ kind: 'placement', component: p.ref, placement: index, ...(p.value ? { info: { value: p.value } } : {}) }) - 1;
      const w = s / 9;
      items.push({ k: 'arc', c: p.at, r: s / 2, start: 0, sweep: 360, w, dark: true, obj });
      const a = p.rot * DEG;
      items.push({ k: 'line', a: p.at, b: { x: p.at.x + s * 0.85 * Math.cos(a), y: p.at.y + s * 0.85 * Math.sin(a) }, w, cap: 'round', dark: true, obj });
      const h = Math.max(0.25, s * 0.6);
      const bottom = side === 'bottom';
      items.push(...textItems({
        layer: '', s: p.ref, at: { x: p.at.x + (bottom ? -1 : 1) * s * 0.75, y: p.at.y }, rot: 0, h, w: h, thick: h / 7, mirror: bottom,
        just: { h: 'left', v: 'middle' },
      }, obj));
    }
    const bbox = emptyBox();
    for (const item of items) addItem(bbox, item, []);
    out.push({
      id: `pnp:${side}`,
      name: files[side],
      kind: 'fab',
      side,
      label: 'Pick-and-place',
      file: files[side],
      markers: true,
      identifiedBy: 'format',
      items,
      apertures: [],
      bbox,
    });
  }
  return out;
}
