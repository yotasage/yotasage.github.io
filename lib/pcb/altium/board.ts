// Reads Altium PCB documents (.PcbDoc, binary and ASCII) into a Design (lib/pcb/model.ts), through altiumts, which the
// page loads only when an Altium file is opened. altiumts gives the records of both formats as fields; this reader
// turns them into the design: the layer stack (lib/pcb/altium/layers.ts), nets, components, pads with their stacks,
// mask and paste openings from the pads' settings and the rules (lib/pcb/altium/rules.ts), vias, tracks, arcs, fills,
// regions, polygon pours as saved, text (lib/pcb/altium/text.ts), internal planes, the board shape and its cutouts.
//
// Altium's coordinates are mil with Y up, so they only change unit. Positions and angles of a component's primitives
// are stored on the board (the component's place included).
import type { AltiumRecord } from 'altiumts' with { 'resolution-mode': 'import' };

import { counterClockwise, DEG, reverseContour } from '../geometry';
import { growShape } from '../design/pads';
import {
  Contour, Design, DesignComponent, DesignGraphic, DesignPad, DesignPlane, DesignShape, DesignText, DesignVia, DesignZone, PadShape, Pt,
  Stackup,
} from '../model';
import { AltiumLayers, BOARD_SHAPE, canonical, isCopper } from './layers';
import {
  arcTrackContour, bool, cleanText, codes, contourOf, fieldMap, has, holeContours, index, lengthOf, MIL, mm, mmOf, num, point, Rec,
  rectContour, str, trackContour,
} from './records';
import { AltiumRules, ScopeObject } from './rules';
import { placeAltiumText } from './text';

export interface AltiumReadOptions {
  // The file name, for the ".PCB_File_Name" special string.
  fileName?: string;
  onProgress?: (share: number) => void;
  // Awaited every few dozen milliseconds, so the page keeps answering.
  pause?: () => Promise<void>;
}

const SLICE_MS = 30;

// A component as the reader keeps it while reading its primitives.
interface Part {
  index: number;
  comp: DesignComponent;
  pattern: string;
  nameOn: boolean;
  commentOn: boolean;
}

// Shapes of a pad on a layer of its stack: 0 top, 1–30 mid layers, 31 bottom.
type Ordinal = number;

class AltiumReader {
  design: Design;
  warnings: string[] = [];
  private counts = new Map<string, number>();
  layers: AltiumLayers;
  rules: AltiumRules;
  private used = new Set<string>();
  private parts: Part[] = [];
  private netNames: string[] = [''];
  private polygonZone = new Map<number, number>();
  // Polygons that are not drawn as zones (split planes): what they own is not drawn either.
  private polygonSkipped = new Set<number>();
  private board: Rec;
  private skippedLayers = new Set<string>();

  constructor(private records: Rec[], private o: AltiumReadOptions, library = false) {
    // Every Board record (ASCII files can split it over several) into one.
    const board: Rec = { kind: 'Board', f: new Map() };
    for (const r of records) if (r.kind === 'Board') for (const [k, v] of r.f) if (!board.f.has(k)) board.f.set(k, v);
    this.board = board;
    this.layers = new AltiumLayers(board);
    this.rules = new AltiumRules(records);
    // The PCB file format's version (5.00, 5.01) as the board record gives it.
    const version = /^\d+(\.\d+)?$/.test(board.f.get('VERSION') ?? '') ? ` ${board.f.get('VERSION')}` : '';
    this.design = {
      format: `Altium ${library ? 'PcbLib' : 'PcbDoc'}${version}`,
      layers: [], nets: this.netNames, outline: [], components: [], pads: [], tracks: [], vias: [], zones: [], graphics: [], texts: [], holes: [],
      warnings: this.warnings,
    };
  }

  count(what: string, n = 1) {
    this.counts.set(what, (this.counts.get(what) ?? 0) + n);
  }

  // --- Layers ---

  // A record's layer as a design layer id, or undefined (a copper layer not in the stack, an unknown layer).
  layerOf(r: Rec): string | undefined {
    // Mechanical layers 17–32 have their own ids (V7).
    for (const key of ['V7_LAYER', 'LAYER_V7']) {
      const v7 = canonical(r.f.get(key));
      if (v7 && /^MECHANICAL(1[7-9]|2\d|3[0-2])$/.test(v7)) return this.use(v7);
    }
    const id = canonical(str(r, 'LAYER'));
    if (!id) return undefined;
    if (id === 'MULTILAYER') return id;
    if (isCopper(id) && !this.layers.copper.includes(id)) {
      this.skippedLayers.add(this.layers.names.get(id) ?? id);
      return undefined;
    }
    return this.use(id);
  }

  use(id: string): string {
    this.used.add(id);
    return id;
  }

  private signalLayers(): string[] {
    return this.layers.copper.filter((id) => !this.layers.isPlane(id));
  }

  // --- Nets and components ---

  readNets() {
    for (const r of this.records) {
      if (r.kind !== 'Net') continue;
      this.netNames.push(codes(str(r, 'NAME')) ?? '');
    }
  }

  netOf(r: Rec): number {
    const i = index(r, 'NET');
    return i !== undefined && i + 1 < this.netNames.length ? i + 1 : 0;
  }

  readComponents(texts: Rec[]) {
    const comps = this.records.filter((r) => r.kind === 'Component');
    // The comment (value) is the component's comment text.
    const comments = new Map<number, string>();
    const designators = new Map<number, string>();
    for (const t of texts) {
      const c = index(t, 'COMPONENT');
      if (c === undefined) continue;
      if (bool(t, 'COMMENT') && !comments.has(c)) comments.set(c, textOf(t));
      if (bool(t, 'DESIGNATOR') && !designators.has(c)) designators.set(c, textOf(t));
    }
    comps.forEach((r, i) => {
      const ref = codes(str(r, 'SOURCEDESIGNATOR')) || designators.get(i) || '';
      const library = str(r, 'SOURCEFOOTPRINTLIBRARY');
      const pattern = str(r, 'PATTERN') ?? '';
      const comp: DesignComponent = {
        ref,
        value: (codes(str(r, 'SOURCECOMMENT') ?? str(r, 'COMMENT')) || comments.get(i) || '').trim(),
        footprint: library && pattern ? `${library.replace(/\.PcbLib$/i, '')}:${pattern}` : pattern,
        at: point(r, 'X', 'Y'),
        rot: normalize(num(r, 'ROTATION')),
        side: canonical(str(r, 'LAYER')) === 'BOTTOM' ? 'bottom' : 'top',
        attrs: {},
        fields: {},
      };
      const description = codes(str(r, 'SOURCEDESCRIPTION') ?? str(r, 'FOOTPRINTDESCRIPTION'));
      if (description) comp.description = description;
      // Component kinds: 0 standard, 1 mechanical, 2 graphical, 3 net tie (in the BOM), 4 net tie (not in the BOM),
      // 5 standard (not in the BOM), 6 jumper.
      const kind = num(r, 'COMPONENTKIND', 0);
      if (kind === 1 || kind === 2 || kind === 4 || kind === 5) comp.attrs.exclude_from_bom = 'yes';
      if (kind === 1 || kind === 2) comp.attrs.exclude_from_pos_files = 'yes';
      if (bool(r, 'NOTFITTED') || bool(r, 'DNP')) comp.attrs.dnp = 'yes';
      const libRef = codes(str(r, 'SOURCELIBREFERENCE'));
      if (libRef) comp.fields['Library reference'] = libRef;
      const compLib = codes(str(r, 'SOURCECOMPONENTLIBRARY'));
      if (compLib) comp.fields['Component library'] = compLib;
      this.parts.push({ index: i, comp, pattern, nameOn: bool(r, 'NAMEON', true), commentOn: bool(r, 'COMMENTON', false) });
      this.design.components.push(comp);
    });
  }

  partOf(r: Rec): Part | undefined {
    const i = index(r, 'COMPONENT');
    return i !== undefined ? this.parts[i] : undefined;
  }

  scope(kind: ScopeObject['kind'], r: Rec, layer: string | undefined, extra: Partial<ScopeObject> = {}): ScopeObject {
    const part = this.partOf(r);
    const net = this.netOf(r);
    return {
      kind,
      ...(net ? { net: this.netNames[net] } : {}),
      ...(part ? { component: part.comp.ref, footprint: part.pattern } : {}),
      ...(layer ? { layer, layerName: this.layers.names.get(layer) ?? layer } : {}),
      ...extra,
    };
  }

  // --- Pads ---

  private padSize(r: Rec, o: Ordinal): { w: number; h: number; shape: string } {
    const mode = num(r, 'PADMODE', 0);
    const top = () => ({ w: mmOf(r, ['XSIZE', 'TOPXSIZE']), h: mmOf(r, ['YSIZE', 'TOPYSIZE']), shape: str(r, 'SHAPE') ?? str(r, 'TOPSHAPE') ?? 'ROUND' });
    if (o === 0 || mode === 0) return top();
    if (o === 31) {
      return {
        w: mmOf(r, ['BOTTOMXSIZE', 'BOTXSIZE', 'XSIZE']),
        h: mmOf(r, ['BOTTOMYSIZE', 'BOTYSIZE', 'YSIZE']),
        shape: str(r, 'BOTTOMSHAPE') ?? str(r, 'BOTSHAPE') ?? str(r, 'SHAPE') ?? 'ROUND',
      };
    }
    if (mode === 2 && o >= 2) {
      return {
        w: mmOf(r, [`LAYER${o}XSIZE`, 'MIDXSIZE', 'XSIZE']),
        h: mmOf(r, [`LAYER${o}YSIZE`, 'MIDYSIZE', 'YSIZE']),
        shape: str(r, `LAYER${o}SHAPE`) ?? str(r, 'MIDSHAPE') ?? str(r, 'SHAPE') ?? 'ROUND',
      };
    }
    return { w: mmOf(r, ['MIDXSIZE', 'XSIZE']), h: mmOf(r, ['MIDYSIZE', 'YSIZE']), shape: str(r, 'MIDSHAPE') ?? str(r, 'SHAPE') ?? 'ROUND' };
  }

  // The copper shape of a pad on a layer of its stack, in pad coordinates.
  padShape(r: Rec, o: Ordinal): PadShape {
    const { w, h, shape } = this.padSize(r, o);
    const off = { x: mmOf(r, [`LAYER${o}HOLEXOFFSET`, `PADXOFFSET${o}`]), y: mmOf(r, [`LAYER${o}HOLEYOFFSET`, `PADYOFFSET${o}`]) };
    const offset = Math.abs(off.x) > 1e-7 || Math.abs(off.y) > 1e-7 ? { offset: off } : {};
    const alt = (str(r, `LAYER${o}ALTSHAPE`) ?? '').toUpperCase();
    if (alt === 'ROUNDRECT') {
      const pct = num(r, `LAYER${o}CORNERRADIUS`, 0);
      return { k: 'roundrect', w, h, r: (Math.min(w, h) * Math.max(0, Math.min(100, pct))) / 200, ...offset };
    }
    switch (shape.toUpperCase()) {
      case 'ROUND':
        return Math.abs(w - h) < 1e-9 ? { k: 'circle', w, h: w, ...offset } : { k: 'oval', w, h, ...offset };
      case 'OCTAGONAL':
        // Altium cuts a quarter of the shorter side off each corner.
        return { k: 'chamfer', w, h, chamfer: { size: Math.min(w, h) / 4, corners: ['tl', 'tr', 'bl', 'br'] }, ...offset };
      default:
        return { k: 'rect', w, h, ...offset };
    }
  }

  private ordinalOf(layer: string): Ordinal {
    if (layer === 'TOP') return 0;
    if (layer === 'BOTTOM') return 31;
    const m = /^MID(\d+)$/.exec(layer);
    return m ? Number(m[1]) : 0;
  }

  // Reads a pad; false when it is on a layer that is not shown.
  readPad(r: Rec): boolean {
    const layer = this.layerOf(r);
    if (!layer) return false;
    const part = this.partOf(r);
    const at = point(r, 'X', 'Y');
    const rot = normalize(num(r, 'ROTATION'));
    const multi = layer === 'MULTILAYER';
    const holeD = mm(r, 'HOLESIZE');
    const plated = bool(r, 'PLATED', true);
    const net = this.netOf(r);
    const type: DesignPad['type'] = multi && holeD > 0 ? (plated ? 'th' : 'np') : 'smd';
    const pad: DesignPad = { ...(part ? { comp: part.index } : {}), num: codes(str(r, 'NAME')) ?? '', net, at, rot, shapes: [], type };
    // The hole: round, square (drawn round) or a slot; a slot's length and rotation are relative to the pad.
    if (multi && holeD > 0) {
      const holeType = (str(r, 'HOLESHAPE') ?? ({ 0: 'ROUND', 1: 'SQUARE', 2: 'SLOT' } as Record<string, string>)[str(r, 'HOLETYPE') ?? '0'] ?? 'ROUND').toUpperCase();
      if (holeType === 'SLOT') {
        const len = lengthOf(r.f.get('SLOTLENGTH')) ?? mm(r, 'HOLEWIDTH', holeD);
        const slotRot = normalize(num(r, 'SLOTROTATION', num(r, 'HOLEROTATION', 0)));
        const quarter = Math.round(slotRot / 90);
        if (Math.abs(slotRot - quarter * 90) > 0.01) this.count('slot-angle');
        const along = quarter % 2 === 0;
        pad.hole = len > holeD + 1e-6
          ? { d: holeD, slot: along ? { w: len, h: holeD } : { w: holeD, h: len }, plated }
          : { d: holeD, plated };
      } else {
        if (holeType === 'SQUARE') this.count('square-hole');
        pad.hole = { d: holeD, plated };
      }
    }
    const scope = this.scope('pad', r, layer, { smd: !multi, pad: pad.num });
    // Copper: every signal layer of a through-hole pad (internal planes draw it as a connection or a clearance), or
    // the pad's layer.
    const copper = multi ? this.signalLayers() : isCopper(layer) ? [layer] : [];
    const shapes = new Map<string, PadShape>();
    for (const id of copper) shapes.set(id, this.padShape(r, this.ordinalOf(id)));
    // A non-plated hole with no copper larger than it is only a hole.
    const top = shapes.get(copper[0]);
    const bare = type === 'np' && top && (top.k === 'circle' || top.k === 'oval') && top.w <= holeD + 1e-6 && top.h <= holeD + 1e-6;
    if (!bare) this.addCopper(pad, copper, shapes);
    for (const id of copper) this.use(id);
    if (!isCopper(layer) && !multi) {
      // A pad on another layer (mechanical, overlay): its shape there.
      pad.shapes.push({ layers: [layer], shape: this.padShape(r, 0) });
    }
    // Solder mask openings, unless tented.
    const reachesTop = multi || layer === 'TOP';
    const reachesBottom = multi || layer === 'BOTTOM';
    if (reachesTop || reachesBottom) {
      const rule = this.rules.maskExpansion(scope);
      const manual = expansionMode(r, 'SOLDERMASKEXPANSIONMODE', 'CSEV') === 'manual';
      const mTop = manual ? mmOf(r, ['SOLDERMASKEXPANSION_MANUAL', 'CSE'], rule.top) : rule.top;
      const mBottom = manual ? mmOf(r, ['SOLDERMASKEXPANSION_BOTTOM', 'CSB', 'SOLDERMASKEXPANSION_MANUAL', 'CSE'], rule.bottom) : rule.bottom;
      pad.maskMargin = mTop;
      const tentTop = bool(r, 'TENTEDTOP') || bool(r, 'TENTINGTOP');
      const tentBottom = bool(r, 'TENTEDBOTTOM') || bool(r, 'TENTINGBOTTOM');
      const openings: [string, PadShape][] = [];
      const topShape = multi ? this.padShape(r, 0) : shapes.get(layer) ?? this.padShape(r, 0);
      const bottomShape = multi ? this.padShape(r, 31) : shapes.get(layer) ?? this.padShape(r, 0);
      if (reachesTop && !tentTop) openings.push(['TOPSOLDER', grow(topShape, mTop)]);
      if (reachesBottom && !tentBottom) openings.push(['BOTTOMSOLDER', grow(bottomShape, mBottom)]);
      this.addOpenings(pad, openings);
      // Paste: SMD pads only.
      if (!multi) {
        const pasteManual = expansionMode(r, 'PASTEMASKEXPANSIONMODE', 'CPEV') === 'manual';
        const e = pasteManual ? mmOf(r, ['PASTEMASKEXPANSION_MANUAL', 'CPE'], 0) : this.rules.pasteExpansion(scope);
        pad.pasteMargin = e;
        const s = grow(topShape, e);
        if (s) this.addOpenings(pad, [[layer === 'TOP' ? 'TOPPASTE' : 'BOTTOMPASTE', s]]);
      }
    }
    this.design.pads.push(pad);
    return true;
  }

  private addCopper(pad: DesignPad, layers: string[], shapes: Map<string, PadShape>) {
    const groups: { key: string; shape: PadShape; layers: string[] }[] = [];
    for (const id of layers) {
      const s = shapes.get(id);
      const key = JSON.stringify(s);
      const g = groups.find((x) => x.key === key);
      if (g) g.layers.push(id);
      else groups.push({ key, shape: s, layers: [id] });
    }
    for (const g of groups) pad.shapes.push({ layers: g.layers, shape: g.shape });
  }

  private addOpenings(pad: DesignPad, openings: [string, PadShape | null][]) {
    const list = openings.filter(([, s]) => s);
    for (const [id] of list) this.use(id);
    if (list.length === 2 && JSON.stringify(list[0][1]) === JSON.stringify(list[1][1])) {
      pad.shapes.push({ layers: [list[0][0], list[1][0]], shape: list[0][1] });
      return;
    }
    for (const [id, s] of list) pad.shapes.push({ layers: [id], shape: s });
  }

  // --- Vias ---

  readVia(r: Rec) {
    const at = point(r, 'X', 'Y');
    const d = mm(r, 'DIAMETER');
    const drill = mm(r, 'HOLESIZE');
    let from = canonical(str(r, 'STARTLAYER')) ?? 'TOP';
    let to = canonical(str(r, 'ENDLAYER') ?? str(r, 'STOPLAYER')) ?? 'BOTTOM';
    const order = this.layers.copper;
    if (!order.includes(from)) from = order[0];
    if (!order.includes(to)) to = order[order.length - 1];
    if (order.indexOf(from) > order.indexOf(to)) [from, to] = [to, from];
    const span = order.slice(order.indexOf(from), order.indexOf(to) + 1);
    const outer = (id: string) => id === order[0] || id === order[order.length - 1];
    const type: DesignVia['type'] = outer(from) && outer(to) ? 'through' : outer(from) || outer(to) ? 'blind' : 'buried';
    const net = this.netOf(r);
    // Diameters per layer: ASCII TOPLAYERSIZE, MIDLAYERnSIZE, BOTTOMLAYERSIZE; binary files keep them (and the via's
    // own mask expansion) in bytes altiumts does not decode (a via stack of 32 layers from byte 75).
    const sizes: Record<string, number> = {};
    const p = r.payload;
    const view = p && p.byteLength >= 203 ? new DataView(p.buffer, p.byteOffset, p.byteLength) : null;
    const stackMode = view ? view.getUint8(74) : num(r, 'VIAMODE', 0);
    for (const id of span) {
      if (this.layers.isPlane(id)) continue;
      const o = this.ordinalOf(id);
      let size: number | undefined;
      if (view && stackMode !== 0) size = (view.getInt32(75 + 4 * o, true) / 1e4) * MIL;
      else if (!view) size = lengthOf(r.f.get(o === 0 ? 'TOPLAYERSIZE' : o === 31 ? 'BOTTOMLAYERSIZE' : `MIDLAYER${o}SIZE`));
      if (size !== undefined && size > 0 && Math.abs(size - d) > 1e-6) sizes[id] = size;
    }
    const via: DesignVia = {
      at, d, drill, from, to, layers: span.filter((id) => !this.layers.isPlane(id)), net, type,
      ...(Object.keys(sizes).length ? { sizes } : {}),
    };
    for (const id of via.layers) this.use(id);
    // Solder mask: open unless tented (the via's flag or the rule's tenting); the via's own expansion when set by
    // hand, else the rule's.
    const scope = this.scope('via', r, 'MULTILAYER');
    const rule = this.rules.maskExpansion(scope);
    let margin = rule.top;
    if (view && view.byteLength >= 67) {
      if ((view.getUint8(66) & 2) !== 0) margin = (view.getInt32(54, true) / 1e4) * MIL;
    } else if (expansionMode(r, 'SOLDERMASKEXPANSIONMODE', 'CSEV') === 'manual') {
      margin = mmOf(r, ['SOLDERMASKEXPANSION_MANUAL', 'CSE'], margin);
    }
    const openTop = from === order[0] && !(bool(r, 'TENTEDTOP') || bool(r, 'TENTINGTOP') || rule.tentTop);
    const openBottom = to === order[order.length - 1] && !(bool(r, 'TENTEDBOTTOM') || bool(r, 'TENTINGBOTTOM') || rule.tentBottom);
    if (openTop || openBottom) {
      via.mask = { top: openTop, bottom: openBottom, margin };
      if (openTop) this.use('TOPSOLDER');
      if (openBottom) this.use('BOTTOMSOLDER');
    }
    this.design.vias.push(via);
  }

  // --- Tracks, arcs, fills and regions ---

  // Layers a primitive is drawn on: its own, or every signal layer for a multi-layer one.
  private targets(layer: string): string[] {
    return layer === 'MULTILAYER' ? this.signalLayers() : [layer];
  }

  private graphic(layer: string, shape: DesignShape, w: number, filled: boolean, r: Rec) {
    const part = this.partOf(r);
    const net = this.netOf(r);
    const g: DesignGraphic = { layer, shape, w, filled, ...(part ? { comp: part.index } : {}), ...(net ? { net } : {}) };
    this.design.graphics.push(g);
  }

  // A keep-out primitive: on the keep-out layer, as Altium shows it.
  private keepout(r: Rec): boolean {
    return bool(r, 'KEEPOUT') && canonical(str(r, 'LAYER')) !== 'KEEPOUT';
  }

  readTrack(r: Rec, polygonOwned: Map<number, Contour[]>) {
    let layer = this.layerOf(r);
    if (!layer) return;
    const a = point(r, 'X1', 'Y1');
    const b = point(r, 'X2', 'Y2');
    const w = mm(r, 'WIDTH');
    const polygon = index(r, 'POLYGON');
    if (polygon !== undefined && this.polygonSkipped.has(polygon)) return;
    if (polygon !== undefined && this.polygonZone.has(polygon) && isCopper(layer)) {
      // Poured copper drawn as tracks (hatched polygons): part of the pour.
      const c = trackContour(a, b, w);
      if (c) polygonOwned.get(polygon)?.push(c) ?? polygonOwned.set(polygon, [c]);
      return;
    }
    if (this.keepout(r)) layer = this.use('KEEPOUT');
    for (const id of this.targets(layer)) {
      if (isCopper(id)) this.design.tracks.push({ layer: id, a, b, w, net: this.netOf(r) });
      else this.graphic(id, { line: [a, b] }, w, false, r);
    }
  }

  readArc(r: Rec, polygonOwned: Map<number, Contour[]>) {
    let layer = this.layerOf(r);
    if (!layer) return;
    const c = point(r, 'LOCATION.X', 'LOCATION.Y');
    const radius = mm(r, 'RADIUS');
    const w = mm(r, 'WIDTH');
    const sa = num(r, 'STARTANGLE');
    const ea = num(r, 'ENDANGLE');
    let sweep = (((ea - sa) % 360) + 360) % 360;
    if (sweep < 1e-9) sweep = 360;
    const polygon = index(r, 'POLYGON');
    if (polygon !== undefined && this.polygonSkipped.has(polygon)) return;
    if (polygon !== undefined && this.polygonZone.has(polygon) && isCopper(layer)) {
      const k = arcTrackContour(c, radius, sa, sweep, w);
      if (k) polygonOwned.get(polygon)?.push(k) ?? polygonOwned.set(polygon, [k]);
      return;
    }
    if (this.keepout(r)) layer = this.use('KEEPOUT');
    const pt = (deg: number): Pt => ({ x: c.x + radius * Math.cos(deg * DEG), y: c.y + radius * Math.sin(deg * DEG) });
    for (const id of this.targets(layer)) {
      if (isCopper(id)) {
        const a = pt(sa);
        this.design.tracks.push({ layer: id, a, b: sweep >= 360 ? a : pt(sa + sweep), w, net: this.netOf(r), arc: { c, ccw: true } });
      } else if (sweep >= 360) {
        this.graphic(id, { circle: { c, r: radius } }, w, false, r);
      } else {
        this.graphic(id, { arc: { c, r: radius, start: sa, sweep } }, w, false, r);
      }
    }
  }

  readFill(r: Rec) {
    const layer = this.layerOf(r);
    if (!layer) return;
    const contour = counterClockwise(rectContour(point(r, 'X1', 'Y1'), point(r, 'X2', 'Y2'), num(r, 'ROTATION')));
    if (bool(r, 'KEEPOUT')) {
      this.keepoutZone(r, layer, [contour]);
      return;
    }
    for (const id of this.targets(layer)) this.graphic(id, { poly: contour }, 0, true, r);
  }

  private keepoutZone(r: Rec, layer: string, outline: Contour[]) {
    const part = this.partOf(r);
    const layers = layer === 'MULTILAYER' ? [...this.layers.copper] : [layer === 'KEEPOUT' ? 'KEEPOUT' : layer];
    this.design.zones.push({ layers, net: 0, outline, fill: [], keepout: true, ...(part ? { comp: part.index } : {}) });
  }

  // A region: copper (a pour's fill when it belongs to a polygon), a board cutout, a polygon cutout or keep-out (rule
  // areas), or a dashed outline.
  readRegion(r: Rec, polygonFill: Map<number, Contour[]>, cutouts: Contour[]) {
    const outer = contourOf(r);
    if (!outer) return;
    const contours = [counterClockwise(outer), ...holeContours(r).map((h) => reverseContour(counterClockwise(h)))];
    if (bool(r, 'ISBOARDCUTOUT')) {
      cutouts.push(outer);
      return;
    }
    const layer = this.layerOf(r);
    if (!layer) return;
    const kind = num(r, 'KIND', 0);
    const polygon = index(r, 'POLYGON');
    if (polygon !== undefined && this.polygonSkipped.has(polygon)) return;
    if (polygon !== undefined && this.polygonZone.has(polygon) && kind === 0) {
      const list = polygonFill.get(polygon);
      if (list) list.push(...contours);
      else polygonFill.set(polygon, contours);
      return;
    }
    // Polygon cutouts and keep-out regions are rule areas.
    if (kind === 1 || bool(r, 'KEEPOUT') || r.f.get('REGIONKIND') === 'POLYGON_CUTOUT') {
      this.keepoutZone(r, layer, [contours[0]]);
      return;
    }
    if (kind === 2) {
      for (const id of this.targets(layer)) {
        for (const c of contours) this.design.graphics.push({ layer: id, shape: { poly: c }, w: 0.1, filled: false, dash: 'dash', ...(this.partOf(r) ? { comp: this.partOf(r).index } : {}) });
      }
      return;
    }
    if (kind !== 0) {
      this.count('region-kind');
      return;
    }
    for (const id of this.targets(layer)) {
      this.graphic(id, contours.length > 1 ? { region: contours } : { poly: contours[0] }, 0, true, r);
    }
  }

  // --- Polygons ---

  readPolygons() {
    let i = -1;
    for (const r of this.records) {
      if (r.kind !== 'Polygon') continue;
      i += 1;
      const layer = this.layerOf(r);
      if (!layer || !isCopper(layer)) continue;
      // Split planes of an internal plane: the plane is drawn as one, of its own net.
      if (this.layers.isPlane(layer)) {
        this.count('split-plane');
        this.polygonSkipped.add(i);
        continue;
      }
      const outline = contourOf(r);
      const zone: DesignZone = {
        layers: [layer],
        net: this.netOf(r),
        outline: outline ? [counterClockwise(outline)] : [],
        fill: [],
      };
      const name = cleanText(codes(str(r, 'NAME')) ?? '').trim();
      if (name) zone.name = name;
      const pour = num(r, 'POURINDEX', NaN);
      if (Number.isFinite(pour) && pour >= 0) zone.priority = pour;
      if (bool(r, 'SHELVED')) zone.unfilled = true;
      this.polygonZone.set(i, this.design.zones.length);
      this.design.zones.push(zone);
    }
  }

  // --- Text ---

  readText(r: Rec) {
    const layer = this.layerOf(r);
    if (!layer) return;
    const part = this.partOf(r);
    const designator = bool(r, 'DESIGNATOR');
    const comment = bool(r, 'COMMENT');
    if (part && ((designator && !part.nameOn) || (comment && !part.commentOn))) return;
    const fontType = num(r, 'FONTTYPE', num(r, 'TEXTKIND', 0));
    if (fontType === 2) {
      this.count('barcode');
      return;
    }
    let s = textOf(r);
    if (part && designator && part.comp.ref) s = part.comp.ref;
    s = this.special(s, layer);
    if (!s.trim()) return;
    const height = mm(r, 'HEIGHT');
    const stroke = mm(r, 'WIDTH');
    const trueType = fontType === 1 || bool(r, 'USETTFONTS');
    const font = codes(str(r, 'FONTNAME'));
    const bold = bool(r, 'BOLD');
    let cap = height;
    let thick = stroke;
    if (trueType) {
      cap = height * (/arial|helvetica|liberation sans|segoe|calibri|verdana|tahoma/i.test(font ?? '') ? 0.64 : 0.6);
      thick = cap / (bold ? 5 : 8);
    }
    if (!(cap > 0)) return;
    const frame = bool(r, 'ISFRAME');
    const boxW = mm(r, 'TEXTBOXWIDTH');
    const boxH = mm(r, 'TEXTBOXHEIGHT');
    const placed = placeAltiumText({
      s,
      at: point(r, 'X', 'Y'),
      rot: normalize(num(r, 'ROTATION')),
      mirror: bool(r, 'MIRROR'),
      cap,
      stroke: thick,
      pitch: trueType ? height : 1.2 * (height + 2 * stroke),
      ...(!frame && boxW > 0 ? { width: Math.max(0, boxW - (trueType ? thick : 2 * stroke)) } : {}),
      ...(frame && boxW > 0 && boxH > 0 ? { frame: { w: boxW, h: boxH, inset: trueType ? 0 : stroke, just: num(r, 'JUSTIFICATION', 3) } } : {}),
    });
    if (!placed) return;
    const t: DesignText = {
      layer,
      s,
      ...placed,
      ...(bold ? { bold: true } : {}),
      ...(bool(r, 'ITALIC') ? { italic: true } : {}),
      ...(trueType && font ? { font } : {}),
      ...(part ? { comp: part.index, role: designator ? 'reference' : comment ? 'value' : 'user' } : {}),
    };
    if (bool(r, 'INVERTED')) {
      t.knockout = true;
      t.knockoutMargin = mm(r, 'MARGINBORDERWIDTH', 0);
    }
    this.design.texts.push(t);
  }

  // Altium's special strings that a text can hold, as far as they are known without the project.
  private special(s: string, layer: string): string {
    if (!s.includes('.')) return s;
    return s.replace(/\.(Layer_Name|PCB_File_Name_No_Path|PCB_File_Name|Print_Date)\b/gi, (whole, name: string) => {
      switch (name.toLowerCase()) {
        case 'layer_name':
          return this.layers.names.get(layer) ?? layer;
        case 'pcb_file_name':
        case 'pcb_file_name_no_path':
          return this.o.fileName ?? whole;
        case 'print_date':
          return new Date().toISOString().slice(0, 10);
        default:
          return whole;
      }
    });
  }

  // --- Internal planes ---

  readPlanes() {
    const planes: DesignPlane[] = [];
    const order = this.layers.copper;
    for (const id of order) {
      if (!this.layers.isPlane(id)) continue;
      const netName = this.layers.planeNets.get(id);
      const net = netName ? Math.max(0, this.netNames.indexOf(netName)) : 0;
      const plane: DesignPlane = { layer: id, net, pullback: this.layers.pullback.get(id) ?? 20 * MIL, clearances: [], thermals: [] };
      const at = order.indexOf(id);
      const hole = (p: Pt, d: number, padNet: number, plated: boolean, scope: ScopeObject) => {
        if (plated && net && padNet === net) {
          const c = this.rules.planeConnect(scope);
          if (c.style === 'direct') return;
          if (c.style === 'relief' && c.spokes > 0) {
            plane.thermals.push({ at: p, d: d + 2 * c.expansion, gap: c.gap, spokes: c.spokes, width: c.width, angle: c.angle });
            return;
          }
        }
        plane.clearances.push({ at: p, d: d + 2 * this.rules.planeClearance(scope) });
      };
      this.design.pads.forEach((pad, i) => {
        if (!pad.hole) return;
        const r = this.padRecords[i];
        const d = pad.hole.slot ? Math.max(pad.hole.slot.w, pad.hole.slot.h) : pad.hole.d;
        hole(pad.at, d, pad.net, pad.hole.plated, this.scope('pad', r, 'MULTILAYER', { smd: false, pad: pad.num }));
      });
      this.design.vias.forEach((v, i) => {
        if (order.indexOf(v.from) > at || order.indexOf(v.to) < at) return;
        hole(v.at, v.drill, v.net, true, this.scope('via', this.viaRecords[i], 'MULTILAYER'));
      });
      planes.push(plane);
      this.use(id);
    }
    if (planes.length) this.design.planes = planes;
  }

  padRecords: Rec[] = [];
  viaRecords: Rec[] = [];

  // --- The board shape ---

  readOutline(cutouts: Contour[]) {
    const edge = contourOf(this.board);
    if (!edge) return;
    this.design.outline = [counterClockwise(edge), ...cutouts.map((c) => reverseContour(counterClockwise(c)))];
    // Drawn on a layer of its own, as KiCad's import draws it on Edge.Cuts.
    for (const c of this.design.outline) this.design.graphics.push({ layer: BOARD_SHAPE, shape: { poly: c }, w: 0.05, filled: false });
  }

  // --- All ---

  async read(): Promise<Design> {
    let slice = performance.now();
    let done = 0;
    const total = this.records.length || 1;
    const tick = async () => {
      done += 1;
      if (performance.now() - slice < SLICE_MS) return;
      this.o.onProgress?.(done / total);
      if (this.o.pause) await this.o.pause();
      slice = performance.now();
    };
    this.readNets();
    const texts = this.records.filter((r) => r.kind === 'Text');
    this.readComponents(texts);
    this.readPolygons();
    // Binary files keep regions twice: with arcs (ShapeBasedRegions6) and as polygons (Regions6); the first is used.
    const shapeBased = this.records.filter((r) => r.kind === 'Region' && r.f.get('SOURCESTREAM') === 'ShapeBasedRegions6');
    const plain = this.records.filter((r) => r.kind === 'RegionFill' || (r.kind === 'Region' && r.f.get('SOURCESTREAM') !== 'ShapeBasedRegions6'));
    const regions = shapeBased.length ? shapeBased : plain;
    // Pours: regions, tracks and arcs owned by a polygon.
    const pourFill = new Map<number, Contour[]>();
    const pourTracks = new Map<number, Contour[]>();
    const cutouts: Contour[] = [];
    for (const r of this.records) {
      switch (r.kind) {
        case 'Pad':
          if (this.readPad(r)) this.padRecords.push(r);
          break;
        case 'Via':
          this.readVia(r);
          this.viaRecords.push(r);
          break;
        case 'Track':
          this.readTrack(r, pourTracks);
          break;
        case 'Arc':
          this.readArc(r, pourTracks);
          break;
        case 'Fill':
          this.readFill(r);
          break;
        case 'Text':
          this.readText(r);
          break;
        case 'Dimension':
          this.count('dimension');
          break;
        case 'EmbeddedBoard':
          this.count('embedded-board');
          break;
        default:
          break;
      }
      await tick();
    }
    for (const r of regions) {
      this.readRegion(r, pourFill, cutouts);
      await tick();
    }
    // The pours as saved: their regions and tracks on the polygon's layer.
    for (const [polygon, zi] of this.polygonZone) {
      const zone = this.design.zones[zi];
      const contours = [...(pourFill.get(polygon) ?? []), ...(pourTracks.get(polygon) ?? [])];
      if (contours.length) zone.fill.push({ layer: zone.layers[0], contours });
      else zone.unfilled = true;
    }
    this.readOutline(cutouts);
    this.readPlanes();
    return this.finish();
  }

  finish(): Design {
    this.design.layers = this.layers.designLayers(this.used);
    const origin = { x: mm(this.board, 'ORIGINX'), y: mm(this.board, 'ORIGINY') };
    if (has(this.board, 'ORIGINX') || has(this.board, 'ORIGINY')) this.design.placeOrigin = origin;
    const stackup: Stackup = {};
    if (this.layers.thickness) stackup.thickness = Math.round(this.layers.thickness * 1e4) / 1e4;
    stackup.copperLayers = this.layers.copper.length;
    this.design.stackup = stackup;
    const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
    const unpoured = this.design.zones.filter((z) => z.unfilled).length;
    if (unpoured) {
      this.warnings.push(`${plural(unpoured, 'polygon has', 'polygons have')} no pour saved in the file, so only ${unpoured === 1 ? 'its outline is' : 'their outlines are'} shown. Repour the polygons in Altium (Tools → Polygon Pours → Repour All) and save the board to see the copper.`);
    }
    const notes: [string, string, string][] = [
      ['dimension', 'dimension is', 'dimensions are'],
      ['barcode', 'barcode text is', 'barcode texts are'],
      ['embedded-board', 'embedded board (panel) is', 'embedded boards (panels) are'],
      ['region-kind', 'region of an unknown kind is', 'regions of unknown kinds are'],
    ];
    for (const [key, one, many] of notes) {
      const n = this.counts.get(key);
      if (n) this.warnings.push(`${plural(n, one, many)} not shown.`);
    }
    const square = this.counts.get('square-hole');
    if (square) this.warnings.push(`${plural(square, 'square hole is', 'square holes are')} drawn round.`);
    const slots = this.counts.get('slot-angle');
    if (slots) this.warnings.push(`${plural(slots, 'slot at an angle to its pad is', 'slots at an angle to their pads are')} drawn along the nearest axis.`);
    if (this.counts.get('split-plane')) this.warnings.push('Split planes are drawn as one plane of the layer\'s net.');
    if (this.skippedLayers.size) this.warnings.push(`Objects on copper layers that are not in the layer stack are not shown (${[...this.skippedLayers].join(', ')}).`);
    const fonts = this.design.texts.filter((t) => t.font).length;
    if (fonts) this.warnings.push(`${plural(fonts, 'text uses a TrueType font', 'texts use TrueType fonts')}; the stroke font stands in, in the place and size of the original.`);
    if (this.rules.unknown.length) this.warnings.push(`Some rule scopes are not evaluated (${this.rules.unknown.slice(0, 4).join(', ')}${this.rules.unknown.length > 4 ? '…' : ''}); broader rules were used for mask and paste openings.`);
    return this.design;
  }
}

type Mode = 'none' | 'rule' | 'manual';

// A pad's or via's expansion mode: None, Rule or Manual (binary and ASCII), or the ASCII value mode (1 rule, 2
// manual).
function expansionMode(r: Rec, key: string, valueKey: string): Mode {
  const v = (r.f.get(key) ?? '').toUpperCase();
  if (v === 'MANUAL') return 'manual';
  if (v === 'RULE') return 'rule';
  if (v === 'NONE') return 'none';
  const n = num(r, valueKey, 1);
  return n === 2 ? 'manual' : 'rule';
}

// A pad shape grown by an expansion (negative: shrunk), as Altium makes mask and paste openings: the same shape with
// every side moved out (corners stay sharp, rounded corners grow by the expansion). Null when nothing is left.
function grow(s: PadShape, e: number): PadShape | null {
  if (Math.abs(e) < 1e-9) return s;
  const w = s.w + 2 * e;
  const h = s.h + 2 * e;
  if (!(w > 1e-9) || (s.k !== 'circle' && !(h > 1e-9))) return null;
  switch (s.k) {
    case 'circle':
      return { ...s, w, h: w };
    case 'oval':
    case 'rect':
      return { ...s, w, h };
    case 'roundrect':
      return { ...s, w, h, r: Math.max(0, (s.r ?? 0) + e) };
    case 'chamfer':
      // A 45° cut moves with its side: the cut along each side grows by e (2 − √2).
      return { ...s, w, h, chamfer: { ...s.chamfer, size: Math.max(0, (s.chamfer?.size ?? 0) + e * (2 - Math.SQRT2)) } };
    default:
      return growShape(s, e);
  }
}

function normalize(deg: number): number {
  const r = deg % 360;
  const n = r < 0 ? r + 360 : r;
  const rounded = Math.round(n * 1e9) / 1e9;
  return rounded === 360 ? 0 : rounded;
}

// The text of a text record: its wide string (character codes) or its plain text, cleaned.
function textOf(r: Rec): string {
  const wide = str(r, 'WIDESTRING');
  const s = wide !== undefined ? codes(wide, true) : str(r, 'TEXT') ?? '';
  return cleanText(s);
}

// --- Libraries ---

// The primitive records of a footprint's Data stream: a type byte and this many length-prefixed parts each, decoded by
// altiumts's decoder of the stream family of a board's primitives.
const FOOTPRINT_RECORDS: Record<number, [string, number]> = {
  1: ['Arcs6', 1], 2: ['Pads6', 6], 3: ['Vias6', 1], 4: ['Tracks6', 1], 5: ['Texts6', 2], 6: ['Fills6', 1], 11: ['Regions6', 1], 12: ['ComponentBodies6', 1],
};

// Coordinates of a record moved by dx, dy (mil), to lay the footprints of a library out side by side.
function shiftRec(r: Rec, dx: number, dy: number) {
  for (const [k, v] of r.f) {
    const isX = /^(X|X1|X2|LOCATION\.X|VX\d+|CX\d+|HOLE\d+VX\d+)$/.test(k);
    const isY = /^(Y|Y1|Y2|LOCATION\.Y|VY\d+|CY\d+|HOLE\d+VY\d+)$/.test(k);
    if (!isX && !isY) continue;
    const mmValue = lengthOf(v);
    if (mmValue === undefined) continue;
    r.f.set(k, `${mmValue / MIL + (isX ? dx : dy)}mil`);
  }
}

// The extent of a footprint's records along X (mil), from their coordinates and sizes.
function extentX(recs: Rec[]): [number, number] {
  let min = Infinity;
  let max = -Infinity;
  for (const r of recs) {
    const half = Math.max(mm(r, 'XSIZE'), mm(r, 'YSIZE'), mm(r, 'WIDTH'), 2 * mm(r, 'RADIUS')) / MIL / 2;
    for (const [k, v] of r.f) {
      if (!/^(X|X1|X2|LOCATION\.X|VX\d+)$/.test(k)) continue;
      const x = (lengthOf(v) ?? 0) / MIL;
      min = Math.min(min, x - half);
      max = Math.max(max, x + half);
    }
  }
  return min <= max ? [min, max] : [0, 0];
}

// Reads a binary .PcbLib: its footprints side by side, each a component named after it (altiumts reads no
// libraries, but its decoders of board primitives read a footprint's records one at a time).
export async function readAltiumLibrary(bytes: Uint8Array, options: AltiumReadOptions = {}): Promise<Design> {
  const alt = await import('altiumts');
  const cf = alt.parseAltiumCompoundFile(bytes);
  const stream = (path: string) => cf.streams.find((s) => s.path.join('/') === path)?.content;
  const lib = stream('Library/Data');
  if (!lib || lib.byteLength < 4) throw new Error('This is not an Altium PCB library.');
  const view = (b: Uint8Array) => new DataView(b.buffer, b.byteOffset, b.byteLength);
  const latin1 = (b: Uint8Array) => new TextDecoder('windows-1252').decode(b);
  // The library's record (its layer stack), then the number of footprints and their names.
  const propLen = view(lib).getUint32(0, true) & 0xffffff;
  const libRec = alt.parseAltiumBinaryPropertyRecord(lib.subarray(4, 4 + propLen), 'Board');
  const records: Rec[] = [{ kind: 'Board', f: fieldMap(libRec.fields.map((x) => ({ key: x.key, value: x.value }))) }];
  const names: string[] = [];
  let at = 4 + propLen;
  const count = at + 4 <= lib.byteLength ? view(lib).getUint32(at, true) : 0;
  at += 4;
  for (let i = 0; i < count && at + 5 <= lib.byteLength; i += 1) {
    const len = view(lib).getUint32(at, true);
    names.push(latin1(lib.subarray(at + 5, at + 4 + len)));
    at += 4 + len;
  }
  let x = 0;
  const skipped: string[] = [];
  names.forEach((name) => {
    const data = stream(`${name.slice(0, 31)}/Data`);
    if (!data) {
      skipped.push(name);
      return;
    }
    const dv = view(data);
    let off = 4 + dv.getUint32(0, true);
    let wideStrings: ReadonlyMap<number, string> | undefined;
    const ws = stream(`${name.slice(0, 31)}/WideStrings`);
    try {
      if (ws) wideStrings = alt.parseAltiumBinaryPcbWideStrings(ws);
    } catch {
      wideStrings = undefined;
    }
    const recs: Rec[] = [];
    while (off < data.byteLength) {
      const type = data[off];
      const spec = FOOTPRINT_RECORDS[type];
      if (!spec) {
        skipped.push(`${name} (a record of type ${type})`);
        break;
      }
      let end = off + 1;
      for (let k = 0; k < spec[1] && end + 4 <= data.byteLength; k += 1) end += 4 + (dv.getUint32(end, true) & 0xffffff);
      try {
        for (const r of alt.parseAltiumBinaryPcbPrimitiveStream(spec[0] as Parameters<typeof alt.parseAltiumBinaryPcbPrimitiveStream>[0], data.subarray(off, end), { wideStrings })) {
          recs.push({ kind: r.recordKind ?? '', f: fieldMap(r.fields.map((f) => ({ key: f.key, value: f.value }))), ...(r.recordKind === 'Via' ? { payload: r.originalBinaryPayload } : {}) });
        }
      } catch {
        skipped.push(`${name} (a record of type ${type})`);
      }
      off = end;
    }
    // Side by side, 100 mil apart, each footprint's origin on the X axis.
    const [min, max] = extentX(recs);
    const dx = x - min;
    const index = records.filter((r) => r.kind === 'Component').length;
    for (const r of recs) {
      shiftRec(r, dx, 0);
      r.f.set('COMPONENT', String(index));
    }
    x += max - min + 100;
    const comp: Rec = { kind: 'Component', f: new Map([['SOURCEDESIGNATOR', name], ['PATTERN', name], ['X', `${dx}mil`], ['Y', '0mil'], ['ROTATION', '0'], ['LAYER', 'TOP'], ['NAMEON', 'TRUE']]) };
    const params = stream(`${name.slice(0, 31)}/Parameters`);
    if (params && params.byteLength > 4) {
      const text = latin1(params.subarray(4));
      const description = /\|DESCRIPTION=([^|]*)/.exec(text)?.[1];
      if (description) comp.f.set('SOURCEDESCRIPTION', description);
    }
    // Components come before primitives, which refer to them by index.
    records.splice(1 + index, 0, comp);
    records.push(...recs);
  });
  if (options.pause) await options.pause();
  const design = await new AltiumReader(records, options, true).read();
  if (skipped.length) design.warnings.push(`Not read: ${skipped.join(', ')}.`);
  if (!names.length) design.warnings.push('The library has no footprints.');
  return design;
}

// Reads a .PcbDoc (binary or ASCII) into a design.
export async function readAltiumBoard(bytes: Uint8Array, options: AltiumReadOptions = {}): Promise<Design> {
  const alt = await import('altiumts');
  let parsed: ReturnType<typeof alt.parseAltiumFile>;
  try {
    parsed = alt.parseAltiumFile(bytes);
  } catch (e) {
    throw new Error(`altiumts could not read the file (${e instanceof Error ? e.message : String(e)}).`);
  }
  const doc = parsed.document;
  const binary = doc instanceof alt.AltiumBinaryPcbDoc;
  if (!binary && !(doc instanceof alt.AltiumPcbDoc)) throw new Error('This is not an Altium PCB document.');
  const records: Rec[] = (doc.records as AltiumRecord[]).map((r) => ({
    kind: r.recordKind ?? '',
    f: fieldMap(r.fields.map((x) => ({ key: x.key, value: x.value }))),
    ...(binary && r.recordKind === 'Via' ? { payload: r.originalBinaryPayload } : {}),
  }));
  if (options.pause) await options.pause();
  return new AltiumReader(records, options).read();
}
