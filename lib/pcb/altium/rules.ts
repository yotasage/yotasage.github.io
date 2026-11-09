// Altium's design rules, as far as drawing needs them: solder mask and paste expansion, plane clearance and plane
// connections. A rule applies to an object when its first scope (a query such as All, IsVia, InNet('GND') or
// InComponent('U1') and InNetClass('Power')) matches; among the enabled rules of a kind the one with the lowest
// priority number wins. Queries the reader does not understand match nothing, so a broader rule takes over.
import { bool, codes, mm, num, Rec, str } from './records';

export interface ScopeObject {
  kind: 'pad' | 'via' | 'track' | 'arc' | 'fill' | 'region' | 'polygon' | 'text';
  net?: string;
  component?: string;
  footprint?: string;
  // The Altium name of the object's layer (TOP, MULTILAYER…) and the stack's name for it ("Top Layer").
  layer?: string;
  layerName?: string;
  pad?: string;
  smd?: boolean;
}

interface Rule {
  kind: string;
  priority: number;
  scope: Query | null;
  r: Rec;
}

// --- Queries ---

interface QueryContext {
  // Net class name → its nets, upper case.
  classes: Map<string, Set<string>>;
  // Query words the reader does not know, for a note.
  unknown: Set<string>;
}

type Query = (o: ScopeObject, c: QueryContext) => boolean | null;

type Token = { t: 'id' | 'str' | 'num' | 'op' | '(' | ')' | ','; v: string };

function tokenize(s: string): Token[] | null {
  const out: Token[] = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) {
      i += 1;
    } else if (c === '(' || c === ')' || c === ',') {
      out.push({ t: c, v: c });
      i += 1;
    } else if (c === '\'' || c === '"') {
      const end = s.indexOf(c, i + 1);
      if (end < 0) return null;
      out.push({ t: 'str', v: s.slice(i + 1, end) });
      i = end + 1;
    } else if (/[<>=!]/.test(c)) {
      const two = s.slice(i, i + 2);
      const op = ['<=', '>=', '<>', '!='].includes(two) ? two : c;
      out.push({ t: 'op', v: op });
      i += op.length;
    } else if (/[\d.]/.test(c)) {
      const m = /^[\d.]+(?:mil|mm)?/.exec(s.slice(i));
      out.push({ t: 'num', v: m[0] });
      i += m[0].length;
    } else if (/[A-Za-z_]/.test(c)) {
      const m = /^[A-Za-z_][\w.]*/.exec(s.slice(i));
      out.push({ t: 'id', v: m[0] });
      i += m[0].length;
    } else {
      return null;
    }
  }
  return out;
}

const eq = (a: string | undefined, b: string) => a !== undefined && a.toUpperCase() === b.toUpperCase();

// A query function call: true or false when known, null when the reader does not know it.
function call(name: string, args: string[], o: ScopeObject, c: QueryContext): boolean | null {
  const a = args[0] ?? '';
  switch (name.toUpperCase()) {
    case 'ALL':
      return true;
    case 'ISPAD':
      return o.kind === 'pad';
    case 'ISVIA':
      return o.kind === 'via';
    case 'ISTRACK':
      return o.kind === 'track';
    case 'ISARC':
      return o.kind === 'arc';
    case 'ISFILL':
      return o.kind === 'fill';
    case 'ISREGION':
      return o.kind === 'region';
    case 'ISPOLYGON':
      return o.kind === 'polygon';
    case 'ISTEXT':
      return o.kind === 'text';
    case 'ISSMDPAD':
    case 'ISSMTPAD':
      return o.kind === 'pad' && o.smd === true;
    case 'ISTHRUPAD':
    case 'ISTHPAD':
      return o.kind === 'pad' && o.smd === false;
    case 'INNET':
    case 'INANYNET':
      return o.net !== undefined && args.some((n) => eq(o.net, n));
    case 'INNETCLASS':
      return o.net !== undefined && (c.classes.get(a.toUpperCase())?.has(o.net.toUpperCase()) ?? false);
    case 'INCOMPONENT':
      return eq(o.component, a);
    case 'HASFOOTPRINT':
      return eq(o.footprint, a);
    case 'ONLAYER':
    case 'EXISTSONLAYER':
      return eq(o.layerName, a) || eq(o.layer, a.replace(/\s+/g, ''));
    case 'INPAD':
    case 'HASPAD':
      return o.kind === 'pad' && o.component !== undefined && eq(o.component, a) && (args.length < 2 || eq(o.pad, args[1]));
    default:
      c.unknown.add(name);
      return null;
  }
}

// A small recursive-descent parser for and, or, not, parentheses and function calls; comparisons are unknown.
function parse(text: string): Query | null {
  const toks = tokenize(text);
  if (!toks || !toks.length) return null;
  let i = 0;
  const peek = () => toks[i];
  const isWord = (w: string) => peek()?.t === 'id' && peek().v.toUpperCase() === w;
  const unknown: Query = () => null;
  const atom = (): Query => {
    const t = toks[i];
    if (!t) return unknown;
    if (t.t === '(') {
      i += 1;
      const q = or();
      if (peek()?.t === ')') i += 1;
      return q;
    }
    if (t.t === 'id') {
      i += 1;
      const args: string[] = [];
      if (peek()?.t === '(') {
        i += 1;
        while (i < toks.length && peek().t !== ')') {
          const a = toks[i];
          if (a.t === 'str' || a.t === 'id' || a.t === 'num') args.push(a.v);
          i += 1;
        }
        i += 1;
      }
      // A comparison (CompPinCount < 5) is not known.
      if (peek()?.t === 'op') {
        i += 2;
        return (o, c) => {
          c.unknown.add(t.v);
          return null;
        };
      }
      return (o, c) => call(t.v, args, o, c);
    }
    i += 1;
    return unknown;
  };
  const not = (): Query => {
    if (isWord('NOT')) {
      i += 1;
      const q = not();
      return (o, c) => {
        const v = q(o, c);
        return v === null ? null : !v;
      };
    }
    return atom();
  };
  const and = (): Query => {
    let q = not();
    while (isWord('AND')) {
      i += 1;
      const a = q;
      const b = not();
      q = (o, c) => {
        const x = a(o, c);
        const y = b(o, c);
        if (x === false || y === false) return false;
        return x === null || y === null ? null : true;
      };
    }
    return q;
  };
  const or = (): Query => {
    let q = and();
    while (isWord('OR')) {
      i += 1;
      const a = q;
      const b = and();
      q = (o, c) => {
        const x = a(o, c);
        const y = b(o, c);
        if (x === true || y === true) return true;
        return x === null || y === null ? null : false;
      };
    }
    return q;
  };
  return or();
}

// --- Rules ---

export interface PlaneConnect {
  style: 'relief' | 'direct' | 'none';
  // Radial distance from the hole edge to the air gap, the air gap, the copper spokes and their number.
  expansion: number;
  gap: number;
  width: number;
  spokes: number;
  // The angle of the first spoke: 45° or 90° (spokes at 0°, 90°…).
  angle: number;
}

const MIL = 0.0254;

export class AltiumRules {
  private rules: Rule[] = [];
  private context: QueryContext = { classes: new Map(), unknown: new Set() };

  constructor(records: Rec[]) {
    for (const r of records) {
      if (r.kind === 'Rule' || r.kind === 'DXPRule') {
        if (!bool(r, 'ENABLED', true)) continue;
        const scopeText = str(r, 'SCOPE1EXPRESSION') ?? 'All';
        const scope = parse(scopeText);
        if (!scope) this.context.unknown.add(scopeText);
        this.rules.push({ kind: (str(r, 'RULEKIND') ?? '').toUpperCase(), priority: num(r, 'PRIORITY', 1), scope, r });
      } else if (r.kind === 'Class' && num(r, 'KIND', -1) === 0) {
        // Net classes, for InNetClass.
        const members = new Set<string>();
        for (const [k, v] of r.f) if (/^M\d+$/.test(k)) members.add((codes(v) ?? v).toUpperCase());
        this.context.classes.set((codes(str(r, 'NAME')) ?? '').toUpperCase(), members);
      }
    }
    this.rules.sort((a, b) => a.priority - b.priority);
  }

  private find(kind: string, o: ScopeObject): Rec | undefined {
    for (const rule of this.rules) {
      if (rule.kind !== kind || !rule.scope) continue;
      if (rule.scope(o, this.context) === true) return rule.r;
    }
    return undefined;
  }

  // Query words met while matching rules that the reader does not evaluate.
  get unknown(): string[] {
    return [...this.context.unknown];
  }

  // Solder mask expansion (top and bottom) and tenting from the SolderMaskExpansion rule; Altium's default is 4 mil.
  maskExpansion(o: ScopeObject): { top: number; bottom: number; tentTop: boolean; tentBottom: boolean } {
    const r = this.find('SOLDERMASKEXPANSION', o);
    const top = r ? mm(r, 'EXPANSION', 4 * MIL) : 4 * MIL;
    return {
      top,
      bottom: r && r.f.has('EXPANSIONBOTTOM') ? mm(r, 'EXPANSIONBOTTOM', top) : top,
      tentTop: r ? bool(r, 'ISTENTINGTOP') : false,
      tentBottom: r ? bool(r, 'ISTENTINGBOTTOM') : false,
    };
  }

  // Paste mask expansion from the PasteMaskExpansion rule; 0 by default.
  pasteExpansion(o: ScopeObject): number {
    const r = this.find('PASTEMASKEXPANSION', o);
    return r ? mm(r, 'EXPANSION', 0) : 0;
  }

  // The clearance around holes that pass through a plane without connecting to it; 20 mil by default.
  planeClearance(o: ScopeObject): number {
    const r = this.find('PLANECLEARANCE', o);
    return r ? mm(r, 'CLEARANCE', 20 * MIL) : 20 * MIL;
  }

  // How a hole connects to a plane of its net; Altium's default is a relief with four 10 mil spokes, a 10 mil air gap
  // 20 mil from the hole.
  planeConnect(o: ScopeObject): PlaneConnect {
    const r = this.find('PLANECONNECT', o);
    const style = (r ? str(r, 'PLANECONNECTSTYLE') ?? 'Relief' : 'Relief').toUpperCase();
    return {
      style: style.startsWith('DIRECT') ? 'direct' : style.startsWith('NO') ? 'none' : 'relief',
      expansion: r ? mm(r, 'RELIEFEXPANSION', 20 * MIL) : 20 * MIL,
      gap: r ? mm(r, 'RELIEFAIRGAP', 10 * MIL) : 10 * MIL,
      width: r ? mm(r, 'RELIEFCONDUCTORWIDTH', 10 * MIL) : 10 * MIL,
      spokes: r ? Math.max(0, Math.round(num(r, 'RELIEFENTRIES', 4))) : 4,
      angle: r && /90/.test(str(r, 'RELIEFANGLE') ?? str(r, 'PLANERELIEFANGLE') ?? '') ? 0 : 45,
    };
  }
}
