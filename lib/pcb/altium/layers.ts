// Altium's layers: the names records use (TOP, MID1…MID30, BOTTOM, PLANE1…PLANE16, TOPOVERLAY, MECHANICAL1… and the
// spellings of binary files, MID-LAYER2, INTERNALPLANE3, LAYER16973830), and the board's layer stack: the copper
// layers in order from the top (internal planes among them), with the names the designer gave them, and the other
// layers with theirs. The stack comes from the board record: the V9 and V8 lists of newer files, and the numbered
// LAYERn fields (with PREV and NEXT) that every file has.
import { DesignLayer, LayerKind, Side } from '../model';
import { codes, Rec } from './records';

// The legacy layer numbers: 1 top, 2–31 mid layers, 32 bottom, 33–38 overlays, paste and solder mask, 39–54 internal
// planes, 55 drill guide, 56 keep-out, 57–72 mechanical 1–16, 73 drill drawing, 74 multi-layer.
export function legacyName(n: number): string | undefined {
  if (n === 1) return 'TOP';
  if (n >= 2 && n <= 31) return `MID${n - 1}`;
  if (n === 32) return 'BOTTOM';
  const fixed: Record<number, string> = {
    33: 'TOPOVERLAY', 34: 'BOTTOMOVERLAY', 35: 'TOPPASTE', 36: 'BOTTOMPASTE', 37: 'TOPSOLDER', 38: 'BOTTOMSOLDER',
    55: 'DRILLGUIDE', 56: 'KEEPOUT', 73: 'DRILLDRAWING', 74: 'MULTILAYER',
  };
  if (fixed[n]) return fixed[n];
  if (n >= 39 && n <= 54) return `PLANE${n - 38}`;
  if (n >= 57 && n <= 72) return `MECHANICAL${n - 56}`;
  return undefined;
}

// The name of a layer from its V7/V8 id: families 256 (copper), 257 (planes), 258 (mechanical), 259 (others).
export function nameFromId(id: number): string | undefined {
  if (!Number.isSafeInteger(id)) return undefined;
  const family = Math.floor(id / 65536);
  const n = id % 65536;
  if (family === 256) return n === 1 ? 'TOP' : n === 65535 ? 'BOTTOM' : n >= 2 && n <= 31 ? `MID${n - 1}` : undefined;
  if (family === 257 && n >= 1 && n <= 16) return `PLANE${n}`;
  if (family === 258 && n >= 1 && n <= 32) return `MECHANICAL${n}`;
  const other: Record<number, string> = {
    6: 'TOPOVERLAY', 7: 'BOTTOMOVERLAY', 8: 'TOPPASTE', 9: 'BOTTOMPASTE', 10: 'TOPSOLDER', 11: 'BOTTOMSOLDER',
    12: 'DRILLGUIDE', 13: 'KEEPOUT', 14: 'DRILLDRAWING', 15: 'MULTILAYER',
  };
  if (family === 259) return other[n];
  return undefined;
}

// A layer name as records write it, in one spelling: TOP, MID3, BOTTOM, PLANE2, MECHANICAL13, TOPOVERLAY…
export function canonical(name: string | undefined): string | undefined {
  if (!name) return undefined;
  const n = name.replace(/[\s_.-]+/g, '').toUpperCase();
  if (n === 'TOP' || n === 'TOPLAYER') return 'TOP';
  if (n === 'BOTTOM' || n === 'BOTTOMLAYER') return 'BOTTOM';
  let m = /^(?:MID|MIDLAYER)(\d{1,2})$/.exec(n);
  if (m) return `MID${Number(m[1])}`;
  m = /^(?:PLANE|INTERNALPLANE)(\d{1,2})$/.exec(n);
  if (m) return `PLANE${Number(m[1])}`;
  m = /^MECHANICAL(?:LAYER)?(\d{1,2})$/.exec(n);
  if (m) return `MECHANICAL${Number(m[1])}`;
  m = /^LAYER(\d{6,})$/.exec(n);
  if (m) return nameFromId(Number(m[1]));
  if (n === 'KEEPOUTLAYER') return 'KEEPOUT';
  if (['TOPOVERLAY', 'BOTTOMOVERLAY', 'TOPPASTE', 'BOTTOMPASTE', 'TOPSOLDER', 'BOTTOMSOLDER', 'DRILLGUIDE', 'KEEPOUT', 'DRILLDRAWING', 'MULTILAYER'].includes(n)) return n;
  return undefined;
}

export function isCopper(id: string): boolean {
  return id === 'TOP' || id === 'BOTTOM' || /^(MID|PLANE)\d+$/.test(id);
}

const OTHER: Record<string, { kind: LayerKind; side: Side; label?: string; name: string }> = {
  TOPOVERLAY: { kind: 'silk', side: 'top', name: 'Top Overlay' },
  BOTTOMOVERLAY: { kind: 'silk', side: 'bottom', name: 'Bottom Overlay' },
  TOPPASTE: { kind: 'paste', side: 'top', name: 'Top Paste' },
  BOTTOMPASTE: { kind: 'paste', side: 'bottom', name: 'Bottom Paste' },
  TOPSOLDER: { kind: 'mask', side: 'top', name: 'Top Solder' },
  BOTTOMSOLDER: { kind: 'mask', side: 'bottom', name: 'Bottom Solder' },
  DRILLGUIDE: { kind: 'other', side: 'none', label: 'Drill guide', name: 'Drill Guide' },
  KEEPOUT: { kind: 'keepout', side: 'none', name: 'Keep-Out Layer' },
  DRILLDRAWING: { kind: 'other', side: 'none', label: 'Drill drawing', name: 'Drill Drawing' },
};

// The layer that holds the board shape (drawn from the board record, as KiCad's Edge.Cuts).
export const BOARD_SHAPE = 'BOARDSHAPE';

export class AltiumLayers {
  // Copper layers from the top, internal planes among them.
  readonly copper: string[] = [];
  readonly names = new Map<string, string>();
  readonly planeNets = new Map<string, string>();
  readonly pullback = new Map<string, number>();
  readonly thickness: number | undefined;

  constructor(board: Rec) {
    const f = board.f;
    // Names: the numbered legacy fields, then the V8 list, then the V9 stack (the newest wins).
    for (let n = 1; n <= 82; n += 1) {
      const id = legacyName(n);
      const name = f.get(`LAYER${n}NAME`);
      if (id && name) this.names.set(id, name);
    }
    const lists: { id?: string; name?: string; thick?: number }[][] = [[], []];
    for (const [key, value] of f) {
      const v8 = /^LAYER_V8_(\d+)(NAME|LAYERID|COPTHICK|DIELHEIGHT)$/.exec(key);
      const v9 = /^V9_STACK_LAYER(\d+)_(NAME|LAYERID|COPTHICK|DIELHEIGHT)$/.exec(key);
      const m = v8 ?? v9;
      if (!m) continue;
      const list = lists[v8 ? 0 : 1];
      const i = Number(m[1]);
      list[i] ??= {};
      if (m[2] === 'NAME') list[i].name = value;
      else if (m[2] === 'LAYERID') list[i].id = nameFromId(Number(value));
      else {
        const t = /^([\d.]+)\s*mil$/i.exec(value);
        if (t) list[i].thick = (list[i].thick ?? 0) + Number(t[1]) * 0.0254;
      }
    }
    for (const list of lists) {
      for (const e of list) if (e?.id && e.name) this.names.set(e.id, e.name);
    }
    // Copper order: the V9 stack (or the V8 list) where it has copper, else the legacy chain from the top layer.
    const stack = (lists[1].some((e) => e?.id && isCopper(e.id)) ? lists[1] : lists[0]).filter((e) => e?.id && isCopper(e.id)).map((e) => e.id);
    if (stack.length >= 2) this.copper.push(...stack);
    else {
      const seen = new Set<number>();
      for (let n = 1; n && !seen.has(n); n = Number(f.get(`LAYER${n}NEXT`) ?? 0)) {
        seen.add(n);
        const id = legacyName(n);
        if (id && isCopper(id)) this.copper.push(id);
        if (n === 32) break;
      }
      if (!this.copper.includes('BOTTOM')) this.copper.push('BOTTOM');
      if (this.copper[0] !== 'TOP') this.copper.unshift('TOP');
    }
    // Internal planes: their nets and how far the copper stays from the board edge.
    for (let n = 1; n <= 16; n += 1) {
      const net = f.get(`PLANE${n}NETNAME`);
      if (net && net !== '(No Net)') this.planeNets.set(`PLANE${n}`, codes(net));
    }
    for (const [key, value] of f) {
      const m = /^(?:LAYER(\d+)|V9_STACK_LAYER(\d+)_|LAYER_V8_(\d+))PULLBACKDISTANCE$/.exec(key);
      if (!m) continue;
      let id: string | undefined;
      if (m[1]) id = legacyName(Number(m[1]));
      else {
        const list = lists[m[2] ? 1 : 0];
        id = list[Number(m[2] ?? m[3])]?.id;
      }
      const v = /^([\d.]+)\s*mil$/i.exec(value);
      if (id && v) this.pullback.set(id, Number(v[1]) * 0.0254);
    }
    // Board thickness: copper and dielectrics (solder mask included) of the stack.
    const physical = lists[1].length ? lists[1] : lists[0];
    const total = physical.reduce((s, e) => s + (e?.thick ?? 0), 0);
    if (total > 0.1) this.thickness = total;
  }

  isPlane(id: string): boolean {
    return /^PLANE\d+$/.test(id);
  }

  // The design layers: copper in order, then the others that are used or enabled, then the board shape.
  designLayers(used: Set<string>): DesignLayer[] {
    const out: DesignLayer[] = this.copper.map((id, i) => ({
      id,
      name: this.names.get(id) ?? defaultName(id),
      kind: 'copper',
      side: i === 0 ? 'top' : i === this.copper.length - 1 ? 'bottom' : 'inner',
      copper: i + 1,
      ...(this.isPlane(id) ? { plane: true } : {}),
    }));
    for (const [id, o] of Object.entries(OTHER)) {
      // Solder mask layers stay even when empty: the realistic view needs to know there is a mask.
      if (!used.has(id) && o.kind !== 'mask') continue;
      out.push({ id, name: this.names.get(id) ?? o.name, kind: o.kind, side: o.side, ...(o.label ? { label: o.label } : {}) });
    }
    for (let n = 1; n <= 32; n += 1) {
      const id = `MECHANICAL${n}`;
      if (!used.has(id)) continue;
      const name = this.names.get(id) ?? `Mechanical ${n}`;
      out.push({ id, name, kind: 'mechanical', side: 'none', label: name === `Mechanical ${n}` ? name : `${name} (Mechanical ${n})` });
    }
    out.push({ id: BOARD_SHAPE, name: 'Board shape', kind: 'outline', side: 'none' });
    return out;
  }
}

function defaultName(id: string): string {
  if (id === 'TOP') return 'Top Layer';
  if (id === 'BOTTOM') return 'Bottom Layer';
  const mid = /^MID(\d+)$/.exec(id);
  if (mid) return `Mid-Layer ${mid[1]}`;
  const plane = /^PLANE(\d+)$/.exec(id);
  if (plane) return `Internal Plane ${plane[1]}`;
  return id;
}
