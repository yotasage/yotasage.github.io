// Inspecting a board: what a click is on (the items under it on the layers of the picture, one entry per object), a
// description of each for the inspect panel, the lists of components and nets, and the items of a highlighted net or
// component on every layer. It works from Board.objects, Board.placements and the layers alone, so Gerber sets with
// X2 object attributes and boards of every design format get it; Board.design adds pad shapes, holes and margins.
import { addItem, apertureBox, DEG } from './geometry';
import { hitsAt } from './hits';
import { layerTitle } from './identify';
import { Aperture, ArtItem, Board, BoardObject, Box, DesignPad, emptyBox, isEmptyBox, Layer, PadShape, Pt, unionBox } from './model';

export type Units = 'mm' | 'in';

// One thing under the point: an item, and the other layers its object was found on there (a pad's copper, mask and
// paste openings and hole are one entry). A click between the pads of a design's component finds the component
// itself (`component`: its index in Board.placements; `index` is then -1).
export interface InspectHit {
  layer: Layer;
  index: number;
  dist: number;
  also: { layer: Layer; index: number }[];
  component?: number;
}

// Objects a design shares between many items (all tracks of a net, all board text): one entry per layer, not one.
const SHARED = new Set(['track', 'graphic', 'text']);

// The box around the pads of each component of a design, for clicks between the pads of a part.
const bodyCache = new WeakMap<Board, { index: number; box: Box }[]>();

function bodies(board: Board): { index: number; box: Box }[] {
  let list = bodyCache.get(board);
  if (list) return list;
  const boxes = new Map<number, Box>();
  for (const pad of board.design?.pads ?? []) {
    if (pad.comp === undefined || !pad.shapes.length) continue;
    const r = Math.max(...pad.shapes.map((s) => Math.hypot(s.shape.w, s.shape.h) / 2));
    let b = boxes.get(pad.comp);
    if (!b) {
      b = emptyBox();
      boxes.set(pad.comp, b);
    }
    b.minX = Math.min(b.minX, pad.at.x - r);
    b.minY = Math.min(b.minY, pad.at.y - r);
    b.maxX = Math.max(b.maxX, pad.at.x + r);
    b.maxY = Math.max(b.maxY, pad.at.y + r);
  }
  list = [...boxes].map(([index, box]) => ({ index, box }));
  bodyCache.set(board, list);
  return list;
}

// What a click is on, on the layers given from the top down: per layer the items on the point (the topmost first),
// then the nearest within the tolerance; items of the same object are one entry. With a design's board, a click
// within the pads of a component also finds the component: first when it is on the side in view, else after what is
// on the point.
export function inspectAt(layers: Layer[], p: Pt, tolerance: number, board?: Board, side: 'top' | 'bottom' = 'top'): InspectHit[] {
  const objects = board?.objects ?? [];
  const out: InspectHit[] = [];
  const byObject = new Map<string, InspectHit>();
  const near: InspectHit[] = [];
  for (const layer of layers) {
    for (const h of hitsAt(layer, p, tolerance)) {
      const obj = layer.items[h.index].obj;
      const key = obj === undefined ? undefined : SHARED.has(objects[obj]?.kind) ? `${obj}@${layer.id}` : String(obj);
      const known = key !== undefined ? byObject.get(key) : undefined;
      if (known) {
        if (!known.also.some((a) => a.layer === layer) && known.layer !== layer) known.also.push({ layer, index: h.index });
        continue;
      }
      const hit: InspectHit = { layer, index: h.index, dist: h.dist, also: [] };
      if (key !== undefined) byObject.set(key, hit);
      // Items on the point come before those only near it, on every layer.
      (h.dist === 0 ? out : near).push(hit);
    }
  }
  const found = out.concat(near.sort((a, b) => a.dist - b.dist));
  if (!board?.design) return found;
  // Components whose pads are around the point and that were not found by their own items, smallest first.
  const named = new Set<number>();
  for (const h of found) {
    for (const { layer, index } of [h, ...h.also]) {
      const comp = componentIndex(board, objects[layer.items[index].obj]);
      if (comp !== undefined) named.add(comp);
    }
  }
  const area = (b: Box) => (b.maxX - b.minX) * (b.maxY - b.minY);
  const around = bodies(board)
    .filter(({ index, box }) => !named.has(index) && p.x >= box.minX && p.x <= box.maxX && p.y >= box.minY && p.y <= box.maxY)
    .sort((a, b) => area(a.box) - area(b.box));
  if (!around.length || !layers.length) return found;
  const hit = (index: number): InspectHit => {
    const s = board.placements[index]?.side ?? 'top';
    const copper = layers.find((l) => l.kind === 'copper' && l.side === s) ?? layers[0];
    return { layer: copper, index: -1, dist: 0, also: [], component: index };
  };
  const mine = around.filter((c) => board.placements[c.index]?.side === side).map((c) => hit(c.index));
  const others = around.filter((c) => board.placements[c.index]?.side !== side).map((c) => hit(c.index));
  // A part on the side in view lies under what is on that side's layers there (its pads, silkscreen, tracks) and
  // over the inner layers and the other side.
  const upper = out.filter((h) => h.layer.side === side || h.layer.side === 'none');
  const lower = out.filter((h) => !upper.includes(h));
  return [...upper, ...mine, ...lower, ...others, ...near];
}

// --- Descriptions ---

export interface Description {
  title: string;
  rows: [string, string][];
  // What can be highlighted from here.
  net?: string;
  component?: ComponentKey;
}

// A component to highlight: by designator, and for designs by its index (designators can repeat, as H2 four times).
export interface ComponentKey {
  ref: string;
  index?: number;
}

export function formatLength(mm: number, units: Units): string {
  const v = units === 'in' ? mm / 25.4 : mm;
  const s = v.toFixed(units === 'in' ? 4 : 3).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
  return `${s.replace('-', '−')} ${units === 'in' ? 'in' : 'mm'}`;
}

function formatSize(w: number, h: number, units: Units): string {
  return `${formatLength(w, units).replace(/ (mm|in)$/, '')} × ${formatLength(h, units)}`;
}

function formatPoint(p: Pt, units: Units): string {
  const f = (v: number) => formatLength(v, units).replace(/ (mm|in)$/, '');
  return `X ${f(p.x)}, Y ${f(p.y)} ${units === 'in' ? 'in' : 'mm'}`;
}

function formatAngle(deg: number): string {
  const r = Math.round((((deg % 360) + 360) % 360) * 1000) / 1000;
  return `${r}°`;
}

function count(n: number, one: string, many = `${one}s`): string {
  return `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;
}

// The X2 aperture functions (.AperFunction) as words.
const APER_FUNCTIONS: Record<string, string> = {
  ViaPad: 'Via pad',
  ComponentPad: 'Through-hole pad',
  SMDPad: 'SMD pad',
  BGAPad: 'BGA pad',
  ConnectorPad: 'Edge connector pad',
  HeatsinkPad: 'Heat sink pad',
  TestPad: 'Test pad',
  CastellatedPad: 'Castellated pad',
  FiducialPad: 'Fiducial',
  ThermalReliefPad: 'Thermal relief pad',
  WasherPad: 'Washer pad',
  AntiPad: 'Anti-pad',
  OtherPad: 'Pad',
  Conductor: 'Conductor',
  EtchedComponent: 'Etched component',
  NonConductor: 'Non-conducting copper',
  CopperBalancing: 'Copper balancing',
  Border: 'Border',
  OtherCopper: 'Copper',
  ComponentMain: 'Component centre',
  ComponentOutline: 'Component outline',
  ComponentPin: 'Component pin',
  Profile: 'Board outline',
  ViaDrill: 'Via hole',
  ComponentDrill: 'Component hole',
  MechanicalDrill: 'Mechanical hole',
  CastellatedDrill: 'Castellated hole',
  BackDrill: 'Back-drilled hole',
  OtherDrill: 'Hole',
  NonMaterial: 'Not board material',
  Material: 'Board material',
};

function apertureFunction(ap: Aperture | undefined): string | undefined {
  const f = ap?.attrs?.['.AperFunction'];
  if (!f) return undefined;
  const [head, ...rest] = f.split(',');
  const name = APER_FUNCTIONS[head] ?? head;
  const more = rest.filter(Boolean).map((r) => (r === 'CuDef' ? 'copper defined' : r === 'SMDef' ? 'mask defined' : r));
  return more.length ? `${name} (${more.join(', ')})` : name;
}

// X2 component attributes, as KiCad writes them in component and fabrication files.
const X2_COMPONENT: Record<string, string> = {
  '.CVal': 'Value',
  '.CFtp': 'Footprint',
  '.CPgN': 'Package',
  '.CPgD': 'Package description',
  '.CMfr': 'Manufacturer',
  '.CMPN': 'MPN',
  '.CSup': 'Supplier',
  '.CMnt': 'Mounting',
  '.CRot': 'Rotation',
  '.CHgt': 'Height',
  '.CLbN': 'Library',
  '.CLbD': 'Library description',
};

function itemLength(item: ArtItem): number {
  if (item.k === 'line') return Math.hypot(item.b.x - item.a.x, item.b.y - item.a.y);
  if (item.k === 'arc') return Math.abs(item.sweep) * DEG * item.r;
  return 0;
}

function itemPosition(item: ArtItem): Pt | null {
  if (item.k === 'flash' || item.k === 'hole') return item.at;
  return null;
}

function boxOf(item: ArtItem, layer: Layer): Box {
  const box = emptyBox();
  addItem(box, item, layer.apertures.map(apertureBox));
  return box;
}

// The geometry of an item: shape, size, width, position.
function geometryRows(item: ArtItem, layer: Layer, units: Units, withAperture: boolean): [string, string][] {
  const rows: [string, string][] = [];
  switch (item.k) {
    case 'line': {
      rows.push(['Width', `${formatLength(item.w, units)}${item.cap === 'square' ? ' (square ends)' : ''}`]);
      const len = itemLength(item);
      if (len > 0) rows.push(['Length', formatLength(len, units)]);
      rows.push(['From', formatPoint(item.a, units)], ['To', formatPoint(item.b, units)]);
      break;
    }
    case 'arc':
      rows.push(['Width', formatLength(item.w, units)], ['Radius', formatLength(item.r, units)]);
      if (Math.abs(item.sweep) < 360) rows.push(['Angle', `${Math.round(Math.abs(item.sweep) * 100) / 100}°`], ['Length', formatLength(itemLength(item), units)]);
      rows.push(['Centre', formatPoint(item.c, units)]);
      break;
    case 'flash': {
      const ap = layer.apertures[item.ap];
      const b = ap ? apertureBox(ap) : null;
      if (withAperture && ap) {
        const code = ap.code !== undefined ? `D${ap.code}` : '';
        // Macro apertures can have long lists of parameters.
        const def = ap.name && ap.name.length > 40 ? `${ap.name.slice(0, 38)}…` : ap.name;
        const name = def ? `${code ? `${code}: ` : ''}${def}` : code;
        if (name) rows.push(['Aperture', name]);
      }
      const round = ap?.parts.length === 1 && ap.parts[0].circle;
      if (round) rows.push(['Diameter', formatLength(2 * ap.parts[0].circle.r * item.scale, units)]);
      else if (b && !isEmptyBox(b)) rows.push(['Size', formatSize((b.maxX - b.minX) * item.scale, (b.maxY - b.minY) * item.scale, units)]);
      if (item.rot) rows.push(['Rotation', formatAngle(item.rot)]);
      if (item.mirror !== 'none') rows.push(['Mirrored', item.mirror === 'xy' ? 'in X and Y' : `in ${item.mirror.toUpperCase()}`]);
      rows.push(['Position', formatPoint(item.at, units)]);
      break;
    }
    case 'region': {
      const b = boxOf(item, layer);
      if (!isEmptyBox(b)) rows.push(['Size', `${formatSize(b.maxX - b.minX, b.maxY - b.minY, units)} (box around it)`]);
      const holes = item.contours.length - 1;
      if (holes > 0) rows.push(['Outlines', count(item.contours.length, 'outline')]);
      break;
    }
    case 'hole':
      rows.push(['Diameter', formatLength(item.d, units)]);
      if (item.to) rows.push(['Slot length', formatLength(Math.hypot(item.to.x - item.at.x, item.to.y - item.at.y) + item.d, units)]);
      rows.push(['Plated', item.plated ? 'Yes' : 'No'], [item.to ? 'From' : 'Position', formatPoint(item.at, units)]);
      if (item.to) rows.push(['To', formatPoint(item.to, units)]);
      break;
  }
  return rows;
}

const ITEM_NAMES: Record<ArtItem['k'], string> = { line: 'Line', arc: 'Arc', flash: 'Flash', region: 'Region', hole: 'Hole' };

function layerList(hit: InspectHit): string {
  const names = [hit.layer, ...hit.also.map((a) => a.layer)].map(layerTitle);
  return names.join(', ');
}

function padType(t: DesignPad['type']): string {
  return t === 'smd' ? 'SMD' : t === 'th' ? 'Through-hole' : t === 'np' ? 'Non-plated hole' : 'Connector (no hole, no mask)';
}

export function describeShape(s: PadShape, units: Units): string {
  const size = formatSize(s.w, s.h, units);
  switch (s.k) {
    case 'circle':
      return `Circle ${formatLength(s.w, units)}`;
    case 'rect':
      return `Rectangle ${size}`;
    case 'oval':
      return `Oval ${size}`;
    case 'roundrect':
      return `Rounded rectangle ${size}, radius ${formatLength(s.r ?? 0, units)}`;
    case 'chamfer':
      return `Chamfered rectangle ${size}`;
    case 'trapezoid':
      return `Trapezoid ${size}`;
    case 'octagon':
      return `Octagon ${size}`;
    default:
      return `Custom shape ${size}`;
  }
}

function designLayerName(board: Board, id: string): string {
  return board.design?.layers.find((l) => l.id === id)?.name ?? id;
}

function layerNames(board: Board, ids: string[]): string {
  const names = ids.map((id) => designLayerName(board, id));
  return names.length > 4 ? `${names[0]} … ${names[names.length - 1]} (${names.length} layers)` : names.join(', ');
}

const ATTR_TEXT: Record<string, string> = {
  dnp: 'Do not populate',
  exclude_from_bom: 'Not in the BOM',
  exclude_from_pos_files: 'Not in position files',
  board_only: 'Only on the board (not in the schematic)',
};

// The fields worth showing first for a component.
const FIRST_FIELDS = /^(mpn|manufacturer|mfr|mfg|lcsc|description|datasheet)/i;

function componentRows(board: Board, index: number | undefined, ref: string, units: Units): [string, string][] {
  const p = index !== undefined ? board.placements[index] : board.placements.find((x) => x.ref === ref);
  if (!p) return [];
  const rows: [string, string][] = [];
  if (p.value) rows.push(['Value', p.value]);
  if (p.footprint) rows.push(['Footprint', p.footprint]);
  rows.push(['Side', p.side === 'top' ? 'Top' : 'Bottom'], ['Position', formatPoint(p.at, units)], ['Rotation', formatAngle(p.rot)]);
  const type = p.attrs?.type;
  if (type) rows.push(['Mounting', type === 'smd' ? 'SMD' : 'Through-hole']);
  const flags = Object.keys(ATTR_TEXT).filter((k) => p.attrs?.[k]);
  if (flags.length) rows.push(['Assembly', flags.map((k) => ATTR_TEXT[k]).join('; ')]);
  const fields = Object.entries(p.fields ?? {}).filter(([, v]) => v && v !== '~');
  fields.sort(([a], [b]) => Number(!FIRST_FIELDS.test(a)) - Number(!FIRST_FIELDS.test(b)));
  for (const [k, v] of fields.slice(0, 8)) rows.push([k, v]);
  if (fields.length > 8) rows.push(['More fields', fields.slice(8).map(([k]) => k).join(', ')]);
  return rows;
}

function componentIndex(board: Board, obj: BoardObject | undefined): number | undefined {
  const d = obj?.design;
  if (!d || !board.design) return undefined;
  if (d.list === 'components') return d.index;
  if (d.list === 'pads') return board.design.pads[d.index]?.comp;
  if (d.list === 'zones') return board.design.zones[d.index]?.comp;
  return undefined;
}

function describeDesign(board: Board, hit: InspectHit, obj: BoardObject, item: ArtItem, units: Units): Description {
  const design = board.design;
  const d = obj.design;
  const rows: [string, string][] = [];
  const comp = componentIndex(board, obj);
  const component: ComponentKey | undefined = obj.component ? { ref: obj.component, index: comp } : undefined;
  const net = obj.net;
  const netRow = () => rows.push(['Net', net ?? 'No net']);
  if (d?.list === 'pads') {
    const pad = design.pads[d.index];
    const p = comp !== undefined ? board.placements[comp] : undefined;
    netRow();
    if (pad.num) rows.push(['Pad', pad.num]);
    if (pad.info?.function) rows.push(['Pin name', pad.info.function]);
    if (pad.info?.type) rows.push(['Pin type', pad.info.type]);
    if (p) rows.push(['Component', [p.ref, p.value].filter(Boolean).join(' · ')]);
    if (p?.footprint) rows.push(['Footprint', p.footprint]);
    rows.push(['Type', padType(pad.type)]);
    for (const s of pad.shapes) rows.push([layerNames(board, s.layers), describeShape(s.shape, units)]);
    if (pad.hole) {
      const h = pad.hole;
      rows.push(['Hole', `${h.slot ? `Slot ${formatSize(h.slot.w, h.slot.h, units)}` : `Ø ${formatLength(h.d, units)}`}, ${h.plated ? 'plated' : 'not plated'}`]);
    }
    if (pad.maskMargin !== undefined && pad.maskMargin !== 0) rows.push(['Mask margin', formatLength(pad.maskMargin, units)]);
    rows.push(['Position', formatPoint(pad.at, units)]);
    if (pad.rot) rows.push(['Rotation', formatAngle(pad.rot)]);
    const ref = p?.ref ?? obj.component;
    return { title: ref ? `Pad ${pad.num || '(no number)'} of ${ref}` : `Pad ${pad.num}`.trim(), rows, net, component };
  }
  if (d?.list === 'vias') {
    const v = design.vias[d.index];
    netRow();
    rows.push(['Diameter', formatLength(v.d, units)], ['Drill', formatLength(v.drill, units)]);
    rows.push(['Layers', `${designLayerName(board, v.from)} to ${designLayerName(board, v.to)}`]);
    if (v.mask) {
      const open = [v.mask.top && 'top', v.mask.bottom && 'bottom'].filter(Boolean);
      rows.push(['Solder mask', open.length ? `Open on the ${open.join(' and ')}` : 'Tented']);
    } else rows.push(['Solder mask', 'Tented']);
    rows.push(['Position', formatPoint(v.at, units)]);
    const kind = v.type === 'through' ? 'Via' : v.type === 'micro' ? 'Microvia' : v.type === 'blind' ? 'Blind via' : 'Buried via';
    return { title: kind, rows, net };
  }
  if (d?.list === 'zones') {
    const z = design.zones[d.index];
    if (obj.kind !== 'rule area') netRow();
    if (z.name) rows.push(['Name', z.name]);
    rows.push(['Layers', layerNames(board, z.layers)]);
    if (z.priority) rows.push(['Priority', String(z.priority)]);
    if (obj.kind === 'rule area') rows.push(['Rule area', 'Keeps out what its rules say; no copper of its own']);
    else rows.push(['Fill', z.unfilled ? 'Never filled: its outline is shown' : 'As last filled and saved']);
    const p = z.comp !== undefined ? board.placements[z.comp] : undefined;
    if (p) rows.push(['Component', p.ref]);
    rows.push(['Found on', layerList(hit)]);
    const title = obj.kind === 'rule area' ? 'Rule area' : obj.kind === 'teardrop' ? 'Teardrop' : 'Zone';
    return { title: z.name && obj.kind !== 'teardrop' ? `${title} ${z.name}` : title, rows, net, component: p ? { ref: p.ref, index: z.comp } : undefined };
  }
  if (d?.list === 'components') {
    const p = board.placements[d.index];
    rows.push(...componentRows(board, d.index, obj.component ?? '', units));
    rows.push(['Found on', `${ITEM_NAMES[item.k].toLowerCase()} on ${layerList(hit)}`]);
    return { title: `Component ${p?.ref ?? obj.component ?? ''}`.trim(), rows, component: { ref: p?.ref ?? obj.component ?? '', index: d.index } };
  }
  if (d?.list === 'planes') {
    const plane = design.planes?.[d.index];
    netRow();
    rows.push(['Layer', layerList(hit)], ['Plane', 'The board shape in copper, with clearances and thermal reliefs cut out (negative)']);
    if (plane) {
      if (plane.pullback > 0) rows.push(['Kept from the edge', formatLength(plane.pullback, units)]);
      rows.push(['Clearances', count(plane.clearances.length, 'hole')], ['Thermal reliefs', count(plane.thermals.length, 'hole')]);
    }
    return { title: 'Internal plane', rows, net };
  }
  // Tracks, board graphics and board text: one object per net, so the item says the rest.
  if (obj.kind === 'track') {
    netRow();
    rows.push(['Layer', layerList(hit)], ...geometryRows(item, hit.layer, units, false));
    return { title: item.k === 'arc' ? 'Track (arc)' : 'Track', rows, net };
  }
  if (net) netRow();
  rows.push(['Layer', layerList(hit)], ...geometryRows(item, hit.layer, units, false));
  return { title: obj.kind === 'text' ? 'Text' : `Graphic (${ITEM_NAMES[item.k].toLowerCase()})`, rows, net };
}

function describeGerber(board: Board, hit: InspectHit, obj: BoardObject | undefined, item: ArtItem, units: Units): Description {
  const rows: [string, string][] = [];
  const layer = hit.layer;
  const ap = item.k === 'flash' ? layer.apertures[item.ap] : undefined;
  const fn = apertureFunction(ap);
  if (obj?.net !== undefined) rows.push(['Net', obj.net || 'No net']);
  if (obj?.component) rows.push(['Component', obj.component]);
  if (obj?.pin) rows.push(['Pin', obj.pin]);
  if (obj?.info?.pinName) rows.push(['Pin name', obj.info.pinName]);
  for (const [k, v] of Object.entries(obj?.info ?? {})) {
    if (k === 'pinName') continue;
    rows.push([X2_COMPONENT[k] ?? k.replace(/^\./, ''), v]);
  }
  rows.push(['Layer', `${layerList(hit)}`]);
  if (layer.file) rows.push(['File', layer.file.split('/').pop() ?? layer.file]);
  if (fn) rows.push(['Function', fn]);
  rows.push(...geometryRows(item, layer, units, true));
  let title: string;
  if (obj?.pin && obj.component) title = `Pad ${obj.pin} of ${obj.component}`;
  else if (item.k === 'flash') title = fn?.replace(/ \(.*\)$/, '') ?? 'Flash';
  else if (item.k === 'hole') title = item.to ? 'Slot' : 'Hole';
  else if ((item.k === 'line' || item.k === 'arc') && layer.kind === 'copper' && obj?.net) title = 'Track';
  else title = ITEM_NAMES[item.k];
  const component = obj?.component ? { ref: obj.component } : undefined;
  return { title, rows, net: obj?.net || undefined, component };
}

export function describeHit(board: Board, hit: InspectHit, units: Units): Description {
  if (hit.component !== undefined) {
    const p = board.placements[hit.component];
    return {
      title: `Component ${p?.ref ?? ''}`.trim(),
      rows: [...componentRows(board, hit.component, p?.ref ?? '', units), ['Found', 'Between its pads']],
      component: { ref: p?.ref ?? '', index: hit.component },
    };
  }
  const item = hit.layer.items[hit.index];
  const obj = item.obj !== undefined ? board.objects[item.obj] : undefined;
  if (!board.design) return describeGerber(board, hit, obj, item, units);
  if (obj) return describeDesign(board, hit, obj, item, units);
  // Holes of a design that belong to no pad or via.
  return { title: item.k === 'hole' ? (item.to ? 'Slot' : 'Hole') : ITEM_NAMES[item.k], rows: [['Layer', layerList(hit)], ...geometryRows(item, hit.layer, units, false)] };
}

// --- Lists of components and nets ---

export interface NetEntry {
  name: string;
  // Pads on the net (for Gerber sets: the distinct pins of the X2 attributes).
  pads: number;
}

export interface PartEntry {
  // Unique in the list.
  key: string;
  ref: string;
  value?: string;
  footprint?: string;
  side?: 'top' | 'bottom';
  // For designs: index into Board.placements.
  index?: number;
  pads: number;
}

export interface Catalog {
  nets: NetEntry[];
  parts: PartEntry[];
}

// Names in KiCad's order (its StrNumCmp): runs of digits compared as numbers, other characters by code point, ASCII
// letters without case unless `exact` (KiCad's position files sort with case).
export function compareNames(a: string, b: string, exact = false): number {
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    let c1 = a.charCodeAt(i);
    let c2 = b.charCodeAt(j);
    if (c1 >= 48 && c1 <= 57 && c2 >= 48 && c2 <= 57) {
      let n1 = 0;
      let n2 = 0;
      while (i < a.length && a.charCodeAt(i) >= 48 && a.charCodeAt(i) <= 57) n1 = n1 * 10 + a.charCodeAt(i++) - 48;
      while (j < b.length && b.charCodeAt(j) >= 48 && b.charCodeAt(j) <= 57) n2 = n2 * 10 + b.charCodeAt(j++) - 48;
      if (n1 !== n2) return n1 < n2 ? -1 : 1;
      continue;
    }
    if (!exact) {
      if (c1 >= 97 && c1 <= 122) c1 -= 32;
      if (c2 >= 97 && c2 <= 122) c2 -= 32;
    }
    if (c1 !== c2) return c1 < c2 ? -1 : 1;
    i += 1;
    j += 1;
  }
  if (i < a.length || j < b.length) return i < a.length ? 1 : -1;
  return exact || a === b ? 0 : a < b ? -1 : 1;
}

export function boardCatalog(board: Board): Catalog {
  const design = board.design;
  if (design) {
    const padsPerNet = new Map<number, number>();
    const padsPerComp = new Map<number, number>();
    for (const p of design.pads) {
      if (p.net > 0) padsPerNet.set(p.net, (padsPerNet.get(p.net) ?? 0) + 1);
      if (p.comp !== undefined) padsPerComp.set(p.comp, (padsPerComp.get(p.comp) ?? 0) + 1);
    }
    // Nets with something on the board: pads, tracks, vias, zones or graphics.
    const used = new Set<string>();
    for (const o of board.objects) if (o.net) used.add(o.net);
    const nets = design.nets
      .map((name, i) => ({ name, pads: padsPerNet.get(i) ?? 0, i }))
      .filter((n) => n.i > 0 && n.name && used.has(n.name))
      .map(({ name, pads }) => ({ name, pads }));
    // Nets of the same name (KiCad allows none, others may) are listed once.
    const seen = new Map<string, NetEntry>();
    for (const n of nets) {
      const old = seen.get(n.name);
      if (old) old.pads += n.pads;
      else seen.set(n.name, n);
    }
    const parts: PartEntry[] = board.placements.map((p, index) => ({
      key: `#${index}`, ref: p.ref, value: p.value, footprint: p.footprint, side: p.side, index, pads: padsPerComp.get(index) ?? 0,
    }));
    return { nets: [...seen.values()].sort((a, b) => compareNames(a.name, b.name)), parts: parts.sort((a, b) => compareNames(a.ref, b.ref) || a.index - b.index) };
  }
  // Gerber sets: from the X2 object attributes.
  const netPins = new Map<string, Set<string>>();
  const parts = new Map<string, PartEntry & { pins: Set<string> }>();
  for (const o of board.objects) {
    if (o.net !== undefined && o.net !== '') {
      let pins = netPins.get(o.net);
      if (!pins) {
        pins = new Set();
        netPins.set(o.net, pins);
      }
      if (o.pin !== undefined && o.component) pins.add(`${o.component}\u0001${o.pin}`);
    }
    if (o.component) {
      let part = parts.get(o.component);
      if (!part) {
        part = { key: o.component, ref: o.component, pads: 0, pins: new Set() };
        parts.set(o.component, part);
      }
      if (o.pin !== undefined) part.pins.add(o.pin);
      if (o.info?.['.CVal'] && !part.value) part.value = o.info['.CVal'];
      if (o.info?.['.CFtp'] && !part.footprint) part.footprint = o.info['.CFtp'];
    }
  }
  return {
    nets: [...netPins].map(([name, pins]) => ({ name, pads: pins.size })).sort((a, b) => compareNames(a.name, b.name)),
    parts: [...parts.values()].map(({ pins, ...p }) => ({ ...p, pads: pins.size })).sort((a, b) => compareNames(a.ref, b.ref)),
  };
}

// --- Highlighting ---

export type HighlightTarget = { kind: 'net'; net: string } | { kind: 'component'; ref: string; index?: number };

export function sameTarget(a: HighlightTarget | null, b: HighlightTarget | null): boolean {
  if (!a || !b) return a === b;
  if (a.kind === 'net' && b.kind === 'net') return a.net === b.net;
  if (a.kind === 'component' && b.kind === 'component') return a.ref === b.ref && a.index === b.index;
  return false;
}

// Which objects belong to the target: a net's pads, vias, tracks, zones and copper graphics; a component's pads,
// graphics, text and zones.
export function objectMask(board: Board, t: HighlightTarget): Uint8Array {
  const mask = new Uint8Array(board.objects.length);
  const design = board.design;
  board.objects.forEach((o, i) => {
    if (t.kind === 'net') {
      if (o.net === t.net) mask[i] = 1;
      return;
    }
    if (t.index !== undefined && design && o.design) {
      if (componentIndex(board, o) === t.index) mask[i] = 1;
      return;
    }
    if (t.index === undefined && o.component === t.ref) mask[i] = 1;
  });
  return mask;
}

export interface Highlight {
  // Per layer id: a layer with only the highlighted items (and the clear items after them, which erase them as on
  // the layer), sharing the layer's apertures.
  layers: Map<string, Layer>;
  box: Box | null;
  items: number;
}

// Holes of drill files without objects (Excellon) that sit on a highlighted pad or via: a 10 µm grid of the centres.
function centreKey(x: number, y: number): string {
  return `${Math.round(x * 100)},${Math.round(y * 100)}`;
}

export function highlightLayers(board: Board, mask: Uint8Array): Highlight {
  const layers = new Map<string, Layer>();
  let box: Box | null = null;
  let total = 0;
  const centres = new Set<string>();
  const add = (layer: Layer, items: ArtItem[]) => {
    const bbox = emptyBox();
    const boxes = layer.apertures.map(apertureBox);
    let dark = 0;
    for (const item of items) {
      if (!item.dark) continue;
      addItem(bbox, item, boxes);
      dark += 1;
    }
    if (!dark) return;
    layers.set(layer.id, { ...layer, items, bbox });
    total += dark;
    if (!isEmptyBox(bbox)) box = box ? unionBox(box, bbox) : { ...bbox };
  };
  const loose: Layer[] = [];
  for (const layer of board.layers) {
    const items: ArtItem[] = [];
    let any = false;
    let withObjects = false;
    for (const item of layer.items) {
      if (item.obj !== undefined) {
        withObjects = true;
        if (mask[item.obj]) {
          items.push(item);
          any = true;
          if (item.k === 'flash' && layer.kind === 'copper') centres.add(centreKey(item.at.x, item.at.y));
          continue;
        }
      }
      if (any && !item.dark) items.push(item);
    }
    if (layer.kind === 'drill' && !withObjects) loose.push(layer);
    else if (any) add(layer, items);
  }
  if (centres.size) {
    for (const layer of loose) {
      const items = layer.items.filter((item) => {
        if (item.k !== 'hole') return false;
        const x = Math.round(item.at.x * 100);
        const y = Math.round(item.at.y * 100);
        for (let dx = -1; dx <= 1; dx += 1) for (let dy = -1; dy <= 1; dy += 1) if (centres.has(`${x + dx},${y + dy}`)) return true;
        return false;
      });
      if (items.length) add(layer, items);
    }
  }
  return { layers, box, items: total };
}

// A layer with only some items of another (for the selection), sharing its apertures.
export function subLayer(layer: Layer, indices: number[]): Layer {
  const items = indices.map((i) => layer.items[i]).filter(Boolean);
  const bbox = emptyBox();
  const boxes = layer.apertures.map(apertureBox);
  for (const item of items) addItem(bbox, item, boxes);
  return { ...layer, items, bbox };
}
