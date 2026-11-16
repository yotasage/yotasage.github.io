// Trace cross-sections (engine.md §3): the presets (microstrip, embedded microstrip, stripline, asymmetric stripline,
// coplanar with and without ground, edge- and broadside-coupled pairs) and the general arrangement they all reduce to.
// Widths are base (bottom) widths, gaps edge to edge at the base, u across the line in mm. Framework-free.

import type { NetClass } from './kicad';
import { etchOffset, issue, isOuter, layerIndex, sameVal, val } from './stackup';
import type { CopperLayer, Issue, Stackup, Val } from './stackup';

export type TraceKind =
  | 'microstrip' | 'embedded' | 'stripline' | 'stripline2' | 'cpw' | 'cpwg'
  | 'pair-microstrip' | 'pair-stripline' | 'pair-cpw' | 'broadside' | 'general';

export interface KindInfo {
  kind: TraceKind;
  name: string;
  signals: number; // 1 or 2 (general: any)
  coplanar: boolean;
}

export const TRACE_KINDS: readonly KindInfo[] = [
  { kind: 'microstrip', name: 'Microstrip', signals: 1, coplanar: false },
  { kind: 'embedded', name: 'Embedded microstrip', signals: 1, coplanar: false },
  { kind: 'stripline', name: 'Stripline', signals: 1, coplanar: false },
  { kind: 'stripline2', name: 'Asymmetric (dual) stripline', signals: 1, coplanar: false },
  { kind: 'cpw', name: 'Coplanar waveguide', signals: 1, coplanar: true },
  { kind: 'cpwg', name: 'Coplanar waveguide with ground', signals: 1, coplanar: true },
  { kind: 'pair-microstrip', name: 'Edge-coupled microstrip pair', signals: 2, coplanar: false },
  { kind: 'pair-stripline', name: 'Edge-coupled stripline pair', signals: 2, coplanar: false },
  { kind: 'pair-cpw', name: 'Edge-coupled coplanar pair with ground', signals: 2, coplanar: true },
  { kind: 'broadside', name: 'Broadside-coupled stripline', signals: 2, coplanar: false },
  { kind: 'general', name: 'General arrangement', signals: 0, coplanar: false },
];

export const KIND_INFO: Readonly<Record<TraceKind, KindInfo>> = Object.fromEntries(TRACE_KINDS.map((k) => [k.kind, k])) as any;

// A signal of the general arrangement: base width and the u of its base centre.
export interface GenSignal { layer: string; w: Val; u: Val }
// A ground on a signal layer: copper from a to b at the base; null for "to the edge" on that side.
export interface GenGround { layer: string; a: Val | null; b: Val | null }

export interface Structure {
  kind: TraceKind;
  layer: string; // signal layer (copper layer id)
  layer2: string; // broadside: the second signal layer ('' otherwise)
  below: string; // solid reference plane below the signals (z lower; '' none)
  above: string; // and above
  w: Val; // base width
  s: Val; // pair: gap at the base; broadside: lateral offset of the second trace
  g: Val; // coplanar: gap from the signal(s) to the ground
  gw: Val | null; // coplanar ground width, null to the edge
  masked: boolean; // solder mask on outer layers (when the stackup has one)
  wall: Val | null; // ideal side walls (fence) at ±wall from u = 0, flagged as such
  signals: GenSignal[]; // general only
  grounds: GenGround[]; // general only
}

export const MAX_SIGNALS = 8;
export const DEFAULT_W = 0.2;
export const DEFAULT_S = 0.2;
export const DEFAULT_G = 0.2;

export function defaultStructure(): Structure {
  return {
    kind: 'microstrip', layer: '', layer2: '', below: '', above: '',
    w: val(DEFAULT_W), s: val(DEFAULT_S), g: val(DEFAULT_G), gw: null, masked: true, wall: null, signals: [], grounds: [],
  };
}

// Copper layer indices from top to bottom.
function coppers(s: Stackup): number[] {
  const out: number[] = [];
  s.layers.forEach((l, i) => { if (l.kind === 'copper') out.push(i); });
  return out;
}

// The inner copper layer whose neighbouring copper layers are most nearly equally far (the stripline preset).
function mostSymmetric(s: Stackup, C: number[]): number {
  let best = 1;
  let bestA = Infinity;
  for (let k = 1; k < C.length - 1; k += 1) {
    let up = 0;
    let dn = 0;
    for (let i = C[k - 1] + 1; i < C[k]; i += 1) up += (s.layers[i] as any).t.v;
    for (let i = C[k] + 1; i < C[k + 1]; i += 1) dn += (s.layers[i] as any).t.v;
    const a = Math.abs(up - dn) / (up + dn);
    if (a < bestA - 1e-12) { bestA = a; best = k; }
  }
  return best;
}

// A preset on a stackup, with the layers it would use (the nearest copper as reference planes, engine.md §2 roles);
// null when the stackup has too few copper layers for it.
export function presetStructure(kind: TraceKind, s: Stackup, w = DEFAULT_W): Structure | null {
  const C = coppers(s);
  const n = C.length;
  if (n < 2) return null;
  const st = defaultStructure();
  st.kind = kind;
  st.w = val(w);
  const id = (k: number) => s.layers[C[k]].id;
  const p = n >= 6 ? 1 : 0; // dual stripline: planes p and n − 1 − p
  switch (kind) {
    case 'microstrip': case 'pair-microstrip': case 'cpwg': case 'pair-cpw':
      st.layer = id(0); st.below = id(1); break;
    case 'cpw':
      st.layer = id(0); break;
    case 'embedded':
      if (n < 3) return null;
      st.layer = id(1); st.below = id(2); break;
    case 'stripline': case 'pair-stripline': {
      if (n < 3) return null;
      const k = mostSymmetric(s, C);
      st.layer = id(k); st.above = id(k - 1); st.below = id(k + 1); break;
    }
    case 'stripline2':
      if (n < 4) return null;
      st.layer = id(p + 1); st.above = id(p); st.below = id(n - 1 - p); break;
    case 'broadside':
      if (n < 4) return null;
      st.layer = id(p + 1); st.layer2 = id(p + 2); st.above = id(p); st.below = id(n - 1 - p); st.s = val(0); break;
    case 'general': {
      st.layer = id(0); st.below = id(1);
      const half = (w + DEFAULT_S) / 2;
      st.signals = [{ layer: id(0), w: val(w), u: val(-half) }, { layer: id(0), w: val(w), u: val(half) }];
      break;
    }
    default: return null;
  }
  return st;
}

// The structures a KiCad net class offers (engine.md §2): its track width as a microstrip and its pair as an
// edge-coupled microstrip pair on the top layer over the nearest plane; null where the class sets no width.
export function structuresFromClass(s: Stackup, nc: NetClass): { single: Structure | null; pair: Structure | null } {
  const single = nc.trackWidth ? presetStructure('microstrip', s, nc.trackWidth.v) : null;
  if (single) single.w = { ...nc.trackWidth };
  let pair: Structure | null = null;
  if (nc.diffPairWidth && nc.diffPairGap) {
    pair = presetStructure('pair-microstrip', s, nc.diffPairWidth.v);
    if (pair) { pair.w = { ...nc.diffPairWidth }; pair.s = { ...nc.diffPairGap }; }
  }
  return { single, pair };
}

// --- The general form ---

// One copper feature of a cross-section: base edges a < b (±Infinity: to the edge), on stackup layer `layer`.
export interface Feature { layer: number; id: number; a: number; b: number }

export interface Arrangement {
  features: Feature[]; // signals first (id 1…n, in order), then grounds (id 0)
  signals: number;
  below: number; // stackup index of the plane below (−1: none)
  above: number;
  masked: boolean;
  wall: number; // 0: none
}

// The structure in its general form, with nominal numbers. Assumes the layers exist (structureIssues says when not).
export function arrangement(s: Stackup, st: Structure): Arrangement {
  const L = layerIndex(s, st.layer);
  const features: Feature[] = [];
  const w = st.w.v;
  const info = KIND_INFO[st.kind] ?? KIND_INFO.microstrip;
  const sig = (layer: number, u: number, width: number) => features.push({ layer, id: features.length + 1, a: u - width / 2, b: u + width / 2 });
  if (st.kind === 'general') {
    for (const g of st.signals) sig(layerIndex(s, g.layer), g.u.v, g.w.v);
  } else if (st.kind === 'broadside') {
    sig(L, 0, w);
    sig(layerIndex(s, st.layer2), st.s.v, w);
  } else if (info.signals === 2) {
    const h = (w + st.s.v) / 2;
    sig(L, -h, w);
    sig(L, h, w);
  } else sig(L, 0, w);
  const n = features.length;
  if (st.kind === 'general') {
    for (const g of st.grounds) features.push({ layer: layerIndex(s, g.layer), id: 0, a: g.a ? g.a.v : -Infinity, b: g.b ? g.b.v : Infinity });
  } else if (info.coplanar) {
    const edge = info.signals === 2 ? w + st.s.v / 2 : w / 2;
    const in0 = edge + st.g.v;
    const out0 = st.gw ? in0 + st.gw.v : Infinity;
    features.push({ layer: L, id: 0, a: -out0, b: -in0 }, { layer: L, id: 0, a: in0, b: out0 });
  }
  return {
    features, signals: n,
    below: st.below ? layerIndex(s, st.below) : -1,
    above: st.above ? layerIndex(s, st.above) : -1,
    masked: st.masked, wall: st.wall ? st.wall.v : 0,
  };
}

function finite(x: Val | null): boolean {
  return !!x && typeof x.v === 'number' && Number.isFinite(x.v);
}

// What makes a structure unusable on this stackup (errors) or doubtful (warnings).
export function structureIssues(s: Stackup, st: Structure): Issue[] {
  const out: Issue[] = [];
  const info = KIND_INFO[st.kind];
  if (!info) return [issue('error', 'kind', 'structure', `"${st.kind}" is not a kind of structure.`)];
  const copperAt = (id: string, what: string): number => {
    const i = layerIndex(s, id);
    if (i < 0) { out.push(issue('error', 'layer', what, `The ${what} layer "${id}" is not in the stackup.`)); return -1; }
    if (s.layers[i].kind !== 'copper') { out.push(issue('error', 'layer', what, `The ${what} layer "${id}" is not a copper layer.`)); return -1; }
    return i;
  };
  const sigLayers: string[] = st.kind === 'general' ? st.signals.map((g) => g.layer) : st.kind === 'broadside' ? [st.layer, st.layer2] : [st.layer];
  if (st.kind === 'general' && (st.signals.length === 0 || st.signals.length > MAX_SIGNALS)) {
    out.push(issue('error', 'signals', 'signals', `A structure has 1 to ${MAX_SIGNALS} signal conductors.`));
  }
  const idx = sigLayers.map((id) => copperAt(id, 'signal'));
  if (out.length) return out;
  const top = Math.min(...idx);
  const bottom = Math.max(...idx);
  const below = st.below ? copperAt(st.below, 'plane below') : -1;
  const above = st.above ? copperAt(st.above, 'plane above') : -1;
  if (below >= 0 && below <= bottom) out.push(issue('error', 'plane', 'below', 'The plane below must lie below every signal layer.'));
  if (above >= 0 && above >= top) out.push(issue('error', 'plane', 'above', 'The plane above must lie above every signal layer.'));
  if (st.kind === 'broadside' && st.layer === st.layer2) out.push(issue('error', 'layer', 'layer2', 'Broadside coupling needs two different layers.'));
  const needTwo = st.kind === 'stripline' || st.kind === 'stripline2' || st.kind === 'pair-stripline' || st.kind === 'broadside';
  if (needTwo && (below < 0 || above < 0)) out.push(issue('warn', 'plane', 'structure', `A ${info.name.toLowerCase()} has planes on both sides.`));
  if ((st.kind === 'microstrip' || st.kind === 'pair-microstrip') && !isOuter(s, idx[0])) out.push(issue('warn', 'layer', 'signal', 'A microstrip lies on an outer layer; this is an embedded microstrip.'));
  if (st.kind === 'cpw' && (below >= 0 || above >= 0)) out.push(issue('warn', 'plane', 'structure', 'A coplanar waveguide without ground has no planes; this is one with ground.'));
  if ((st.kind === 'cpwg' || st.kind === 'pair-cpw' || st.kind.startsWith('micro') || st.kind === 'pair-microstrip' || st.kind === 'embedded') && below < 0 && above < 0) {
    out.push(issue('warn', 'plane', 'structure', `A ${info.name.toLowerCase()} has a reference plane.`));
  }
  const pos = (x: Val | null, what: string, zero = false) => {
    if (!finite(x)) { out.push(issue('error', 'number', what, `${what} is not a number.`)); return; }
    if (zero ? x.v < 0 : x.v <= 0) out.push(issue('error', 'range', what, `${what} must be ${zero ? 'zero or more' : 'above zero'}.`));
  };
  if (st.kind !== 'general') pos(st.w, 'The width');
  if (info.signals === 2 && st.kind !== 'broadside') pos(st.s, 'The gap');
  if (st.kind === 'broadside' && !finite(st.s)) out.push(issue('error', 'number', 'offset', 'The offset is not a number.'));
  if (info.coplanar) { pos(st.g, 'The gap to ground'); if (st.gw) pos(st.gw, 'The ground width'); }
  if (st.wall) pos(st.wall, 'The wall distance');
  if (st.kind === 'general') {
    st.signals.forEach((g, k) => { pos(g.w, `Signal ${k + 1}'s width`); if (!finite(g.u)) out.push(issue('error', 'number', `signal ${k + 1}`, `Signal ${k + 1}'s position is not a number.`)); });
    st.grounds.forEach((g, k) => {
      const gi = copperAt(g.layer, 'ground');
      if (gi >= 0 && (gi === below || gi === above)) out.push(issue('error', 'layer', `ground ${k + 1}`, 'A coplanar ground cannot lie on a plane layer.'));
      if (g.a && !finite(g.a)) out.push(issue('error', 'number', `ground ${k + 1}`, 'A ground edge is not a number.'));
      if (g.b && !finite(g.b)) out.push(issue('error', 'number', `ground ${k + 1}`, 'A ground edge is not a number.'));
      if (g.a && g.b && finite(g.a) && finite(g.b) && !(g.b.v > g.a.v)) out.push(issue('error', 'range', `ground ${k + 1}`, 'A ground ends before it starts.'));
    });
  }
  if (out.some((i) => i.level === 'error')) return out;
  // Features: on no plane, top width above zero, no two touching or overlapping on a layer, inside the walls.
  const arr = arrangement(s, st);
  for (const f of arr.features) {
    if (f.layer === arr.below || f.layer === arr.above) out.push(issue('error', 'layer', 'structure', 'A trace lies on a reference plane layer.'));
    const e = etchOffset(s.layers[f.layer] as CopperLayer);
    if (f.b - f.a - 2 * e <= 0) out.push(issue('error', 'etch', f.id ? `signal ${f.id}` : 'ground', `The trace is narrower than twice the etch offset (${+(2 * e).toFixed(5)} mm): its top would vanish.`));
    if (arr.wall && (f.a <= -arr.wall || f.b >= arr.wall) && Number.isFinite(f.a) && Number.isFinite(f.b)) out.push(issue('error', 'wall', 'wall', 'The side walls must lie outside every trace.'));
  }
  const fs = arr.features;
  for (let i = 0; i < fs.length; i += 1) {
    for (let j = i + 1; j < fs.length; j += 1) {
      if (fs[i].layer !== fs[j].layer) continue;
      if (fs[i].a < fs[j].b && fs[j].a < fs[i].b) out.push(issue('error', 'overlap', 'structure', `Two conductors on ${s.layers[fs[i].layer].id} overlap or touch.`));
      else if (fs[i].b === fs[j].a || fs[j].b === fs[i].a) out.push(issue('error', 'overlap', 'structure', `Two conductors on ${s.layers[fs[i].layer].id} touch.`));
    }
  }
  return out;
}

export function sameStructure(a: Structure, b: Structure): boolean {
  if (a === b) return true;
  if (a.kind !== b.kind || a.layer !== b.layer || a.layer2 !== b.layer2 || a.below !== b.below || a.above !== b.above) return false;
  if (!sameVal(a.w, b.w) || !sameVal(a.s, b.s) || !sameVal(a.g, b.g) || !sameVal(a.gw, b.gw) || a.masked !== b.masked || !sameVal(a.wall, b.wall)) return false;
  if (a.signals.length !== b.signals.length || a.grounds.length !== b.grounds.length) return false;
  for (let i = 0; i < a.signals.length; i += 1) {
    const p = a.signals[i];
    const q = b.signals[i];
    if (p.layer !== q.layer || !sameVal(p.w, q.w) || !sameVal(p.u, q.u)) return false;
  }
  for (let i = 0; i < a.grounds.length; i += 1) {
    const p = a.grounds[i];
    const q = b.grounds[i];
    if (p.layer !== q.layer || !sameVal(p.a, q.a) || !sameVal(p.b, q.b)) return false;
  }
  return true;
}
