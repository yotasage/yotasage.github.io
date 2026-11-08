// The board shape of a design from the graphics of its outline layer (KiCad's Edge.Cuts, in footprints too): lines,
// arcs, circles, rectangles, polygons and curves joined into closed loops by the same rules as a Gerber outline
// layer (lib/pcb/outline.ts).
import { DesignGraphic, emptyBox, Layer } from '../model';
import { shapeFromOutline } from '../outline';
import { graphicItems } from './art';

export function outlineFromGraphics(graphics: DesignGraphic[]): { contours: ReturnType<typeof shapeFromOutline>['contours']; warnings: string[] } {
  const items = graphics.flatMap((g) => graphicItems({ ...g, filled: false }, undefined, { dash: 12, gap: 3 }, true));
  const layer: Layer = { id: 'design-outline', name: 'Outline', kind: 'outline', side: 'none', items, apertures: [], bbox: emptyBox() };
  return shapeFromOutline(layer);
}
