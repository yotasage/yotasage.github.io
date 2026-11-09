// The layers of a PADS design: levels 1 to n are copper (n = MAXIMUMLAYER), the others are named and typed in the
// *MISC* section's LAYER DATA (solder mask, paste, silkscreen, assembly, drill drawing, unassigned). Copper layers can
// be planes: CAM planes (negative, their copper not in the file) or mixed planes (plane areas flooded with copper).
// Layer 1 and layer n name their silkscreen, paste, solder mask and assembly layers, which pairs the layers of the two
// sides: a part on the bottom has its decal's items for the top on the paired bottom layers.
import { DesignLayer, LayerKind, Side } from '../model';
import { child, MiscNode } from './ascii';

export interface PadsLevel {
  n: number;
  name: string;
  // ROUTING, COMPONENT, SOLDER_MASK, PASTE_MASK, SILK_SCREEN, ASSEMBLY, DRILL, UNASSIGNED…
  type: string;
  plane: 'none' | 'cam' | 'mixed';
  nets: string[];
  assoc: Partial<Record<'silk' | 'paste' | 'mask' | 'assembly', string>>;
  // Dielectric and copper thickness, mm.
  thickness: number;
  copperThickness: number;
}

const TYPES: Record<keyof PadsLevel['assoc'], string> = { silk: 'SILK_SCREEN', paste: 'PASTE_MASK', mask: 'SOLDER_MASK', assembly: 'ASSEMBLY' };

const ASSOC: [keyof PadsLevel['assoc'], string][] = [
  ['silk', 'ASSOCIATED_SILK_SCREEN'], ['paste', 'ASSOCIATED_PASTE_MASK'], ['mask', 'ASSOCIATED_SOLDER_MASK'], ['assembly', 'ASSOCIATED_ASSEMBLY'],
];

// PADS's own layers when the file has no layer data (30-layer mode; 250-layer mode adds 100).
const DEFAULTS: [number, string, string][] = [
  [21, 'Solder Mask Top', 'SOLDER_MASK'], [22, 'Paste Mask Bottom', 'PASTE_MASK'], [23, 'Paste Mask Top', 'PASTE_MASK'],
  [24, 'Drill Drawing', 'DRILL'], [26, 'Silkscreen Top', 'SILK_SCREEN'], [27, 'Assembly Drawing Top', 'ASSEMBLY'],
  [28, 'Solder Mask Bottom', 'SOLDER_MASK'], [29, 'Silkscreen Bottom', 'SILK_SCREEN'], [30, 'Assembly Drawing Bottom', 'ASSEMBLY'],
];

// The units of the layer data: "LAYER DATA" is in basic units, "LAYER MIL" in mils and so on.
const LAYER_UNITS: Record<string, number> = { DATA: 0.0254 / 38100, MIL: 0.0254, MILS: 0.0254, METRIC: 1, MM: 1, INCHES: 25.4, INCH: 25.4 };

export class PadsLayers {
  levels = new Map<number, PadsLevel>();
  private byName = new Map<string, number>();
  // Each layer's counterpart on the other side, for parts on the bottom.
  private pairs = new Map<number, number>();
  readonly copper: number;

  constructor(misc: MiscNode[], maxLayer: number, layers250: boolean) {
    const data = misc.find((n) => n.key === 'LAYER' && LAYER_UNITS[n.value.toUpperCase()] !== undefined);
    const unit = data ? LAYER_UNITS[data.value.toUpperCase()] : 0;
    for (const node of data?.children ?? []) {
      const n = Number(node.key === 'LAYER' ? node.value : NaN);
      if (!Number.isInteger(n) || n <= 0 || this.levels.has(n)) continue;
      const get = (key: string) => child(node, key)?.value.trim() ?? '';
      const plane = get('PLANE').toUpperCase();
      const level: PadsLevel = {
        n,
        name: get('LAYER_NAME') || `Layer ${n}`,
        type: get('LAYER_TYPE').toUpperCase() || 'UNASSIGNED',
        plane: plane === 'CAM' ? 'cam' : plane === 'MIXED' || plane === 'SPLIT/MIXED' ? 'mixed' : 'none',
        nets: node.children.filter((c) => c.key === 'NET').map((c) => c.value.trim()).filter(Boolean),
        assoc: {},
        thickness: (Number(get('LAYER_THICKNESS')) || 0) * unit,
        copperThickness: (Number(get('COPPER_THICKNESS')) || 0) * unit,
      };
      for (const [k, key] of ASSOC) {
        const v = get(key);
        if (v) level.assoc[k] = v;
      }
      this.levels.set(n, level);
    }
    // The copper layers: MAXIMUMLAYER, else the routing layers counted from 1.
    let copper = maxLayer;
    if (!(copper > 0)) {
      copper = 0;
      while (['ROUTING', 'COMPONENT', 'PLANE'].includes(this.levels.get(copper + 1)?.type ?? '')) copper += 1;
      if (!copper) copper = 2;
    }
    this.copper = copper;
    for (let n = 1; n <= copper; n += 1) {
      if (!this.levels.has(n)) {
        this.levels.set(n, { n, name: n === 1 ? 'Top' : n === copper ? 'Bottom' : `Inner Layer ${n}`, type: 'ROUTING', plane: 'none', nets: [], assoc: {}, thickness: 0, copperThickness: 0 });
      }
    }
    if (!data) {
      const shift = layers250 ? 100 : 0;
      for (const [n, name, type] of DEFAULTS) {
        if (!this.levels.has(n + shift)) this.levels.set(n + shift, { n: n + shift, name, type, plane: 'none', nets: [], assoc: {}, thickness: 0, copperThickness: 0 });
      }
      const pair = (a: number, b: number) => {
        this.pairs.set(a + shift, b + shift);
        this.pairs.set(b + shift, a + shift);
      };
      pair(21, 28);
      pair(23, 22);
      pair(26, 29);
      pair(27, 30);
    }
    for (const l of this.levels.values()) if (!this.byName.has(norm(l.name))) this.byName.set(norm(l.name), l.n);
    // Pairs from the layers of each kind on the two sides (what layers 1 and n name, else by their names).
    for (const [k] of ASSOC) {
      const a = this.sideLayer(k, 'top');
      const b = this.sideLayer(k, 'bottom');
      if (a !== undefined && b !== undefined && a !== b && !this.pairs.has(a) && !this.pairs.has(b)) {
        this.pairs.set(a, b);
        this.pairs.set(b, a);
      }
    }
  }

  private numberOf(name: string | undefined): number | undefined {
    return name ? this.byName.get(norm(name)) : undefined;
  }

  id(n: number): string {
    return `L${n}`;
  }

  isCopper(n: number): boolean {
    return n >= 1 && n <= this.copper;
  }

  // The level a bottom part's item goes to: copper k to n + 1 − k, a top layer to its bottom counterpart.
  mirror(n: number): number {
    if (this.isCopper(n)) return this.copper + 1 - n;
    return this.pairs.get(n) ?? n;
  }

  // The layer of a kind on a side: the one layer 1 or layer n names, else the layer of that type whose name says the
  // side best (PADS's own name, "Silkscreen Bottom", before any name with the side's word or an abbreviation of it).
  sideLayer(kind: keyof PadsLevel['assoc'], side: 'top' | 'bottom'): number | undefined {
    const named = this.numberOf(this.levels.get(side === 'top' ? 1 : this.copper)?.assoc[kind]);
    if (named !== undefined) return named;
    const type = TYPES[kind];
    const own = DEFAULTS.find(([, name, t]) => t === type && sideOfName(name) === side)?.[1];
    let best: number | undefined;
    let score = 0;
    for (const l of this.levels.values()) {
      if (l.type !== type) continue;
      const word = side === 'top' ? /\btop\b/i : /\bbottom\b/i;
      const s = own && norm(l.name) === norm(own) ? 3 : word.test(l.name) ? 2 : sideOfName(l.name) === side ? 1 : 0;
      if (s > score) {
        score = s;
        best = l.n;
      }
    }
    return best;
  }

  // The assembly drawing layer of a side, else the only assembly layer there is.
  assemblyLayer(side: 'top' | 'bottom'): number | undefined {
    const own = this.sideLayer('assembly', side);
    if (own !== undefined) return own;
    const all = [...this.levels.values()].filter((l) => l.type === 'ASSEMBLY');
    return all.length === 1 ? all[0].n : undefined;
  }

  // The design layer of a level.
  designLayer(n: number): DesignLayer {
    const l = this.levels.get(n);
    const id = this.id(n);
    const name = l?.name ?? `Layer ${n}`;
    if (this.isCopper(n)) {
      const side: Side = n === 1 ? 'top' : n === this.copper ? 'bottom' : 'inner';
      const plane = l?.plane === 'cam' ? 'CAM plane' : l?.plane === 'mixed' ? 'Mixed plane' : undefined;
      return { id, name, kind: 'copper', side, copper: n, ...(l?.plane === 'cam' ? { plane: true } : {}), ...(plane ? { label: plane } : {}) };
    }
    const type = l?.type ?? 'UNASSIGNED';
    const kind: LayerKind = type === 'SOLDER_MASK' ? 'mask' : type === 'PASTE_MASK' ? 'paste' : type === 'SILK_SCREEN' ? 'silk' : type === 'ASSEMBLY' ? 'fab' : 'other';
    let side: Side = 'none';
    for (const s of ['top', 'bottom'] as const) {
      for (const [k] of ASSOC) if (this.sideLayer(k, s) === n) side = s;
    }
    if (side === 'none' && kind !== 'other') side = sideOfName(name) ?? 'none';
    const label = type === 'DRILL' ? 'Drill drawing' : type === 'ASSEMBLY' ? 'Assembly drawing' : kind === 'other' ? name : undefined;
    return { id, name, kind, side, ...(label ? { label } : {}) };
  }
}

function norm(name: string): string {
  return name.trim().replace(/[\s_]+/g, ' ').toLowerCase();
}

function sideOfName(name: string): 'top' | 'bottom' | undefined {
  if (/\b(top|upper|component|comp)\b/i.test(name)) return 'top';
  if (/\b(bottom|bot|lower|solder side)\b/i.test(name)) return 'bottom';
  return undefined;
}
