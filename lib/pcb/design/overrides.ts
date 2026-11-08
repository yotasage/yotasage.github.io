// A design's board with the user's choices of layer type and side (from the layer panel) on top. Kept apart from the
// builder so that the page does not load the builder and the stroke font until a design file is opened.
import { compareLayers, LayerOverride } from '../identify';
import { Board, Layer } from '../model';

// The layers' items are shared with the board it starts from, so their drawing caches stay.
export function designWithOverrides(base: Board, overrides: Map<string, LayerOverride>): Board {
  if (!overrides.size) return base;
  const layers = base.layers.map((l): Layer => {
    const o = overrides.get(l.id);
    if (!o || (o.kind === l.kind && o.side === l.side)) return l;
    return {
      ...l,
      kind: o.kind,
      side: o.side,
      identifiedBy: 'user',
      copper: o.kind === 'copper' ? l.copper : undefined,
      plated: o.kind === 'drill' ? l.plated ?? true : undefined,
      label: o.kind === l.kind ? l.label : undefined,
    };
  });
  layers.sort(compareLayers);
  return { ...base, layers };
}
