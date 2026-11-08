// KiCad's layers: canonical names ("F.Cu", "In2.Cu", "B.SilkS", "User.3"), what kind of layer each is, the numbering
// of older files (whose layer table may give a copper layer the user's name only, as "Composant" or "top_layer"), and
// the wildcards of pad layer lists ("*.Cu", "F&B.Cu", "*.Mask").
import { DesignLayer, LayerKind, Side } from '../model';

// The layer numbers of KiCad 4 to 8; KiCad 9 numbers them differently, but its files always use canonical names.
const OLD_NUMBERS: Record<number, string> = {
  0: 'F.Cu', 31: 'B.Cu', 32: 'B.Adhes', 33: 'F.Adhes', 34: 'B.Paste', 35: 'F.Paste', 36: 'B.SilkS', 37: 'F.SilkS', 38: 'B.Mask',
  39: 'F.Mask', 40: 'Dwgs.User', 41: 'Cmts.User', 42: 'Eco1.User', 43: 'Eco2.User', 44: 'Edge.Cuts', 45: 'Margin', 46: 'B.CrtYd',
  47: 'F.CrtYd', 48: 'B.Fab', 49: 'F.Fab',
};
for (let i = 1; i <= 30; i += 1) OLD_NUMBERS[i] = `In${i}.Cu`;
for (let i = 1; i <= 9; i += 1) OLD_NUMBERS[49 + i] = `User.${i}`;

// The numbering of the first S-expression boards (file version 3, KiCad of 2013 and 2014): the bottom 0, the top 15.
const LEGACY_NUMBERS: Record<number, string> = {
  0: 'B.Cu', 15: 'F.Cu', 16: 'B.Adhes', 17: 'F.Adhes', 18: 'B.Paste', 19: 'F.Paste', 20: 'B.SilkS', 21: 'F.SilkS', 22: 'B.Mask',
  23: 'F.Mask', 24: 'Dwgs.User', 25: 'Cmts.User', 26: 'Eco1.User', 27: 'Eco2.User', 28: 'Edge.Cuts',
};
for (let i = 1; i <= 14; i += 1) LEGACY_NUMBERS[i] = `In${15 - i}.Cu`;

const TECHNICAL: Record<string, [LayerKind, string?]> = {
  Adhes: ['other', 'Glue'],
  Paste: ['paste'],
  SilkS: ['silk'],
  Mask: ['mask'],
  CrtYd: ['courtyard'],
  Fab: ['fab'],
};

const CANONICAL = /^(?:[FB]\.(?:Cu|Adhes|Paste|SilkS|Mask|CrtYd|Fab)|In\d+\.Cu|(?:Dwgs|Cmts|Eco1|Eco2)\.User|Edge\.Cuts|Margin|User\.\d+)$/;

export function isCanonical(name: string): boolean {
  return CANONICAL.test(name);
}

export function isCopperName(name: string): boolean {
  return /^(?:[FB]\.Cu|In\d+\.Cu)$/.test(name);
}

// The canonical name of a layer of an old file's layer table, from its number.
export function canonicalFromOldNumber(n: number, legacy = false): string | undefined {
  return legacy ? LEGACY_NUMBERS[n] : OLD_NUMBERS[n];
}

const USER_LABELS: Record<string, string> = {
  'Dwgs.User': 'User drawings',
  'Cmts.User': 'User comments',
  'Eco1.User': 'User Eco 1',
  'Eco2.User': 'User Eco 2',
};

// What a canonical layer is. Copper numbers are given later, once the copper layers are known.
export function layerIdentity(canonical: string): { kind: LayerKind; side: Side; label?: string } {
  if (canonical === 'F.Cu') return { kind: 'copper', side: 'top' };
  if (canonical === 'B.Cu') return { kind: 'copper', side: 'bottom' };
  if (/^In\d+\.Cu$/.test(canonical)) return { kind: 'copper', side: 'inner' };
  const m = /^([FB])\.(\w+)$/.exec(canonical);
  if (m && TECHNICAL[m[2]]) {
    const [kind, label] = TECHNICAL[m[2]];
    return { kind, side: m[1] === 'F' ? 'top' : 'bottom', ...(label ? { label } : {}) };
  }
  if (canonical === 'Edge.Cuts') return { kind: 'outline', side: 'none' };
  if (canonical === 'Margin') return { kind: 'mechanical', side: 'none', label: 'Margin' };
  if (USER_LABELS[canonical]) return { kind: 'other', side: 'none', label: USER_LABELS[canonical] };
  const u = /^User\.(\d+)$/.exec(canonical);
  if (u) return { kind: 'other', side: 'none', label: `User ${u[1]}` };
  return { kind: 'other', side: 'none', label: canonical };
}

export function innerIndex(canonical: string): number {
  const m = /^In(\d+)\.Cu$/.exec(canonical);
  return m ? Number(m[1]) : 0;
}

// The layers of a design, in KiCad's order: copper from the top, then the technical layers and the others.
export class LayerTable {
  readonly layers = new Map<string, DesignLayer>();
  // Names as items write them (canonical and user names) → canonical name.
  private names = new Map<string, string>();

  // A layer of the file's layer table: its number, the name in the table, its type (signal, power, user…) and the
  // user's name for it. `numbering`: how the file numbers layers ('legacy' for version 3 files, 'old' for KiCad 4 to 8).
  addFromTable(n: number, name: string, type: string | undefined, userName: string | undefined, numbering: 'legacy' | 'old' | 'new') {
    let canonical = isCanonical(name) && numbering !== 'legacy' ? name : undefined;
    if (!canonical && numbering !== 'new') canonical = canonicalFromOldNumber(n, numbering === 'legacy');
    if (!canonical) canonical = name;
    this.names.set(name, canonical);
    if (userName) this.names.set(userName, canonical);
    const shown = userName ?? (name !== canonical ? name : canonical);
    this.ensure(canonical, shown, type);
  }

  ensure(canonical: string, shown?: string, type?: string): DesignLayer {
    let l = this.layers.get(canonical);
    if (!l) {
      const id = layerIdentity(canonical);
      // A layer that is not a canonical one but has a copper type in the table (signal, power…).
      if (id.kind === 'other' && type && /^(signal|power|mixed|jumper)$/.test(type)) {
        id.kind = 'copper';
        id.side = 'inner';
      }
      // KiCad 9 can say which side a user layer belongs to.
      if (id.kind === 'other' && /^User\.\d+$/.test(canonical) && (type === 'front' || type === 'back')) id.side = type === 'front' ? 'top' : 'bottom';
      l = { id: canonical, name: shown ?? canonical, kind: id.kind, side: id.side, ...(id.label ? { label: id.label } : {}) };
      this.layers.set(canonical, l);
      this.names.set(canonical, canonical);
    }
    return l;
  }

  // The canonical name of a layer as an item names it, adding the layer if the table does not have it.
  resolve(name: string): string {
    const known = this.names.get(name);
    if (known) return known;
    this.ensure(name);
    return name;
  }

  copper(): DesignLayer[] {
    const list = [...this.layers.values()].filter((l) => l.kind === 'copper');
    const rank = (l: DesignLayer) => (l.id === 'F.Cu' ? 0 : l.id === 'B.Cu' ? 1000 : innerIndex(l.id) || 500);
    return list.sort((a, b) => rank(a) - rank(b));
  }

  // Numbers the copper layers from the top: F.Cu 1, the inner layers in order, B.Cu last.
  numberCopper() {
    this.copper().forEach((l, i) => {
      l.copper = i + 1;
    });
  }

  // The layers a pad's layer list names, with KiCad's wildcards: *.Cu (every copper layer), F&B.Cu (the outer ones),
  // *In.Cu (the inner ones), *.Mask, *.Paste, *.SilkS and so on (front and back).
  expand(list: string[]): string[] {
    const out = new Set<string>();
    for (const raw of list) {
      if (raw === '*.Cu') for (const l of this.copper()) out.add(l.id);
      else if (raw === 'F&B.Cu') {
        out.add('F.Cu');
        out.add('B.Cu');
      } else if (raw === '*In.Cu' || raw === 'Inner') {
        for (const l of this.copper()) if (l.side === 'inner') out.add(l.id);
      } else if (raw.startsWith('*.')) {
        out.add(this.resolve(`F.${raw.slice(2)}`));
        out.add(this.resolve(`B.${raw.slice(2)}`));
      } else if (raw.startsWith('F&B.')) {
        out.add(this.resolve(`F.${raw.slice(4)}`));
        out.add(this.resolve(`B.${raw.slice(4)}`));
      } else {
        out.add(this.resolve(raw));
      }
    }
    return [...out];
  }
}
