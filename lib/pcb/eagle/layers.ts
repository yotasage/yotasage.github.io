// EAGLE's layers in a board: copper 1 (Top) to 16 (Bottom) in the order of the design rules' layer setup, and the fixed
// layers 17 to 52 (pads, vias, dimension, place, names, values, stop and cream masks, keep-outs, restricts, milling,
// documentation), plus user layers from 100 up. A mirrored element (on the bottom) puts its items on the other side's
// layer of each pair (1 ↔ 16, tPlace ↔ bPlace, tStop ↔ bStop…).
import { DesignLayer, LayerKind, Side } from '../model';

interface Fixed {
  kind: LayerKind;
  side: Side;
  label?: string;
}

// The fixed layers that are drawn. Not drawn: 17 Pads and 18 Vias (pads and vias are on every copper layer they reach),
// 19 Unrouted (air wires), 23 and 24 (element origins), 44 Drills and 45 Holes (the holes are drill layers), and the
// schematic layers 90 to 99.
const FIXED: Record<number, Fixed> = {
  20: { kind: 'outline', side: 'none', label: 'Dimension' },
  21: { kind: 'silk', side: 'top' },
  22: { kind: 'silk', side: 'bottom' },
  25: { kind: 'silk', side: 'top', label: 'Names' },
  26: { kind: 'silk', side: 'bottom', label: 'Names' },
  27: { kind: 'fab', side: 'top', label: 'Values' },
  28: { kind: 'fab', side: 'bottom', label: 'Values' },
  29: { kind: 'mask', side: 'top' },
  30: { kind: 'mask', side: 'bottom' },
  31: { kind: 'paste', side: 'top' },
  32: { kind: 'paste', side: 'bottom' },
  33: { kind: 'other', side: 'top', label: 'Finish' },
  34: { kind: 'other', side: 'bottom', label: 'Finish' },
  35: { kind: 'other', side: 'top', label: 'Glue' },
  36: { kind: 'other', side: 'bottom', label: 'Glue' },
  37: { kind: 'other', side: 'top', label: 'Test' },
  38: { kind: 'other', side: 'bottom', label: 'Test' },
  39: { kind: 'courtyard', side: 'top', label: 'Keepout' },
  40: { kind: 'courtyard', side: 'bottom', label: 'Keepout' },
  41: { kind: 'keepout', side: 'top', label: 'Restrict' },
  42: { kind: 'keepout', side: 'bottom', label: 'Restrict' },
  43: { kind: 'keepout', side: 'none', label: 'Via restrict' },
  46: { kind: 'mechanical', side: 'none', label: 'Milling' },
  47: { kind: 'mechanical', side: 'none', label: 'Measures' },
  48: { kind: 'other', side: 'none', label: 'Document' },
  49: { kind: 'other', side: 'none', label: 'Reference' },
  51: { kind: 'fab', side: 'top', label: 'Documentation' },
  52: { kind: 'fab', side: 'bottom', label: 'Documentation' },
};

const SKIPPED = new Set([17, 18, 19, 23, 24, 44, 45]);

// The pairs a mirrored element swaps.
const PAIRS: [number, number][] = [[1, 16], [21, 22], [23, 24], [25, 26], [27, 28], [29, 30], [31, 32], [33, 34], [35, 36], [37, 38], [39, 40], [41, 42], [51, 52]];
const MIRROR = new Map<number, number>();
for (const [a, b] of PAIRS) {
  MIRROR.set(a, b);
  MIRROR.set(b, a);
}

export const DIMENSION = 20;
export const MILLING = 46;
export const T_STOP = 29;
export const B_STOP = 30;
export const T_CREAM = 31;
export const B_CREAM = 32;
export const T_RESTRICT = 41;
export const B_RESTRICT = 42;
export const V_RESTRICT = 43;

// The layer an item of a mirrored element goes to: the other side's layer of its pair, inner copper n to 17 − n.
export function mirrorLayer(n: number): number {
  const m = MIRROR.get(n);
  if (m !== undefined) return m;
  if (n >= 2 && n <= 15) return 17 - n;
  return n;
}

export function isCopperNumber(n: number): boolean {
  return n >= 1 && n <= 16;
}

// The copper layers of the layer setup ("(1*16)", "(1+2*3+14*15+16)", "[2:1+((2*3)+(14*15))+16:15]") in their order
// from the top, without the numbers that only say how far a blind via reaches.
export function setupLayers(setup: string | undefined): number[] {
  const s = (setup ?? '').replace(/\[\d+:/g, '[').replace(/:\d+\]/g, ']');
  const out: number[] = [];
  for (const m of s.matchAll(/\d+/g)) {
    const n = Number(m[0]);
    if (isCopperNumber(n) && !out.includes(n)) out.push(n);
  }
  if (!out.length) return [1, 16];
  return out;
}

export class EagleLayers {
  // Copper layers from the top: their EAGLE numbers.
  readonly copper: number[];
  private names = new Map<number, string>();
  private used = new Set<number>();

  constructor(table: { number: number; name: string }[], setup: string | undefined) {
    for (const l of table) this.names.set(l.number, l.name);
    this.copper = setupLayers(setup);
  }

  name(n: number): string {
    return this.names.get(n) ?? `Layer ${n}`;
  }

  isCopper(n: number): boolean {
    return this.copper.includes(n);
  }

  // Whether items on this layer are drawn at all.
  drawn(n: number): boolean {
    if (n >= 1 && n <= 16) return true;
    return n > 0 && !SKIPPED.has(n) && !(n >= 90 && n <= 99);
  }

  // The design layer id of a layer, marked as used; null for layers that are not drawn.
  id(n: number): string | null {
    if (!this.drawn(n)) return null;
    this.used.add(n);
    return String(n);
  }

  // The copper layers between two layers of the setup (a via's extent), from the top; all of them if either is unknown.
  span(from: number, to: number): number[] {
    const a = this.copper.indexOf(from);
    const b = this.copper.indexOf(to);
    if (a < 0 || b < 0) return [...this.copper];
    return this.copper.slice(Math.min(a, b), Math.max(a, b) + 1);
  }

  // The design layers: copper in order, then every other layer that has something on it (and both solder masks, which
  // the realistic view needs).
  designLayers(): DesignLayer[] {
    const out: DesignLayer[] = [];
    const count = this.copper.length;
    this.copper.forEach((n, i) => {
      const side: Side = i === 0 ? 'top' : i === count - 1 ? 'bottom' : 'inner';
      out.push({ id: String(n), name: this.name(n), kind: 'copper', side, copper: i + 1 });
    });
    this.used.add(29);
    this.used.add(30);
    for (const n of [...this.used].sort((a, b) => a - b)) {
      if (this.isCopper(n)) continue;
      const f = FIXED[n];
      const name = this.name(n);
      if (f) {
        // Other and mechanical layers are titled by their label.
        const label = f.label && (f.label !== name || f.kind === 'other' || f.kind === 'mechanical') ? f.label : undefined;
        out.push({ id: String(n), name, kind: f.kind, side: f.side, ...(label ? { label } : {}) });
      } else if (n >= 1 && n <= 16) {
        out.push({ id: String(n), name, kind: 'other', side: 'none', label: `${name} (not in the layer setup)` });
      } else if (n >= 100 && /silk/i.test(name)) {
        // A user layer named for the silkscreen ("_tsilk", "bSilk") is plotted with it.
        out.push({ id: String(n), name, kind: 'silk', side: /^_?b|bot/i.test(name) ? 'bottom' : 'top', label: name });
      } else {
        out.push({ id: String(n), name, kind: 'other', side: 'none', label: name });
      }
    }
    return out;
  }
}
