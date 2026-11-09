// What the KiCad export (lib/pcb/export/kicad.ts) does to a board that the user has to know before using the file, for
// the warning in the save card. Kept apart from the writer, so the page loads the writer only when a file is saved.
import { Board } from '../model';

// Whether a board can be saved for KiCad: one read from an Altium, PADS or EAGLE board file (not a library, whose
// footprints lie side by side; not a KiCad board, which is one already).
export function kicadExportable(board: Board): boolean {
  const d = board.design;
  return Boolean(d) && (board.source === 'altium' || board.source === 'pads' || board.source === 'eagle') && !/PcbLib|library/i.test(d.format);
}

function count(n: number, one: string, many: string): string {
  return `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;
}

// The board's own points, then those of every conversion.
export function kicadNotes(board: Board): string[] {
  const d = board.design;
  if (!d) return [];
  const notes: string[] = [];
  const negative = new Set(d.layers.filter((l) => l.plane).map((l) => l.id));
  const planes = d.planes ?? [];
  if (planes.length) {
    const neg = planes.filter((p) => negative.has(p.layer)).length;
    const areas = planes.length - neg;
    const what = [
      neg ? count(neg, board.source === 'altium' ? 'internal plane' : 'CAM plane', board.source === 'altium' ? 'internal planes' : 'CAM planes') : '',
      areas ? count(areas, board.source === 'eagle' ? 'polygon' : 'plane area', board.source === 'eagle' ? 'polygons' : 'plane areas') : '',
    ].filter(Boolean).join(' and ');
    // Plane areas and EAGLE polygons are drawn from their outlines by approximate rules; negative planes by the file's.
    const approximate = areas > 0 ? ', which is an approximation' : '';
    notes.push(`${what} ${planes.length === 1 ? 'has' : 'have'} no copper in the file, so each is a zone filled with the copper drawn here${approximate}. KiCad keeps that fill until the zones are filled again (B), which gives other copper by KiCad's own rules.`);
  }
  const unfilled = d.zones.filter((z) => !z.keepout && z.unfilled).length;
  if (unfilled) notes.push(`${count(unfilled, 'pour has', 'pours have')} no copper saved and ${unfilled === 1 ? 'is an unfilled zone' : 'are unfilled zones'}.`);
  const rules = d.zones.filter((z) => z.keepout).length;
  if (rules) notes.push(`${count(rules, 'keep-out or cut-out is a rule area', 'keep-outs and cut-outs are rule areas')} of KiCad; check what ${rules === 1 ? 'it keeps' : 'they keep'} out.`);
  const onPlanes = d.tracks.filter((t) => negative.has(t.layer)).length + d.graphics.filter((g) => negative.has(g.layer)).length + d.texts.filter((t) => negative.has(t.layer)).length;
  if (onPlanes) notes.push(`${count(onPlanes, 'item drawn on a negative plane layer is', 'items drawn on negative plane layers are')} cut out of the plane's copper rather than written as copper.`);
  const trueType = d.texts.filter((t) => t.font).length;
  if (trueType) notes.push(`${count(trueType, 'text in a TrueType font is', 'texts in TrueType fonts are')} in KiCad's stroke font, as drawn here.`);
  const thick = d.texts.filter((t) => t.thick > Math.min(t.h, t.w) * 0.25 + 1e-9).length;
  if (thick) notes.push(`${count(thick, 'text has strokes', 'texts have strokes')} thicker than a quarter of the letters' size, which KiCad draws thinner.`);
  const square = d.vias.filter((v) => v.square).length;
  if (square) notes.push(`${count(square, 'square via is', 'square vias are')} round in KiCad.`);
  const margins = new Set(d.vias.filter((v) => v.mask && (v.mask.top || v.mask.bottom)).map((v) => Math.round(v.mask.margin * 1e4)));
  if (margins.size > 1) notes.push('The vias\' solder mask openings have different margins; KiCad has one for all vias (the most common one is used).');
  const copper = d.layers.filter((l) => l.kind === 'copper').length;
  if (copper > 32) notes.push(`The board has ${copper} copper layers; KiCad has 32, so the inner layers from the 31st on share In30.Cu.`);
  const free = d.pads.filter((p) => p.comp === undefined).length + d.holes.length;
  if (free) notes.push(`${count(free, 'pad or hole that is not part of a component gets', 'pads and holes that are not part of a component get')} a footprint of ${free === 1 ? 'its' : 'their'} own (REF**).`);
  notes.push('Solder mask and paste openings are margins of the pads where they are the pad grown (KiCad rounds the corners of a grown rectangle), else pads of their own on the mask or paste layer.');
  notes.push('Text is in KiCad\'s stroke font with the place and size it has here.');
  notes.push('Design rules, net classes and a project file (.kicad_pro) are not written: KiCad uses its defaults until they are set in Board Setup.');
  notes.push('The board is moved onto the drawing sheet; the drill/place and grid origins are at the design\'s origin.');
  return notes;
}
