// The stackup as data (engine.md §2, plan.md D8): an ordered list of layers from top to bottom, every number with a
// tolerance and a source. Lengths in mm. Framework-free.

// Where a number comes from. A preset's number names the preset, the reference it was read from (a key of
// presets.ts's REFS) with that reference's date and URL; a KiCad number the file and its format version (`absent`:
// not in the file, KiCad's default stands in; `placeholder`: in the file but a template value, engine.md §2).
export type Source =
  | { kind: 'preset'; id: string; ref: string; date: string; url: string; note?: string }
  | { kind: 'kicad'; file: string; version: number; absent?: boolean; placeholder?: boolean }
  | { kind: 'typed' };

// ± absolute (in the value's unit) or ± relative (a fraction: 0.1 is ±10 %). null: none stated.
export type Tol = { abs: number } | { rel: number } | null;

export interface Val {
  v: number;
  tol: Tol;
  src: Source;
}

export const TYPED: Source = Object.freeze({ kind: 'typed' }) as Source;

export function val(v: number, src: Source = TYPED, tol: Tol = null): Val {
  return { v, tol, src };
}

// The half-width of the tolerance band in the value's unit (0 without one).
export function tolAbs(x: Val): number {
  if (!x.tol) return 0;
  return 'abs' in x.tol ? x.tol.abs : Math.abs(x.v) * x.tol.rel;
}

export interface MaskLayer {
  kind: 'mask';
  id: string;
  name: string;
  material: string;
  er: Val;
  tand: Val | null; // null: not stated
  freq: number | null; // Hz at which εr (and tanδ) are stated; null: not stated
  onLaminate: Val; // thickness on bare laminate, away from copper (JLCPCB's C1)
  onCopper: Val; // over copper; also on the copper's side walls (the convention of engine.md §3)
  between: Val; // on laminate in the gap between two copper features of the same layer (C3)
}

// Etch: the trapezoid's top is narrower than its base by 2·offset (JLCPCB: top = base − 0.7 mil, 0.35 mil per side),
// or by 2·t/factor with the etch factor of IPC (thickness over the undercut per side).
export type Etch = { kind: 'none' } | { kind: 'offset'; side: Val } | { kind: 'factor'; f: Val };

export interface CopperLayer {
  kind: 'copper';
  id: string;
  name: string;
  t: Val; // finished thickness (outer layers: base foil plus plating)
  base: Val | null; // base foil, when given separately
  plating: Val | null; // plating, when given separately (then base + plating = t)
  calc: Val | null; // the thickness the fab's own impedance calculator uses, when it differs (JLCPCB outer 1.6 mil)
  etch: Etch;
  // Which side the trapezoid's narrow top faces and whose material fills the gaps between features: 'up' or 'down'
  // (z up), null for the default (`fillSide`): the adjacent prepreg, or outwards on an outer layer.
  fill: 'up' | 'down' | null;
}

export interface DielectricLayer {
  kind: 'dielectric';
  id: string;
  name: string;
  role: 'core' | 'prepreg';
  material: string; // "3313", "7628", "FR4"…
  t: Val; // as pressed: the distance between the copper faces on either side
  er: Val;
  tand: Val | null;
  freq: number | null;
}

export type Layer = MaskLayer | CopperLayer | DielectricLayer;

export interface Stackup {
  id: string; // a preset's id when it is one (or was one before an edit), else ''
  name: string;
  layers: Layer[];
  finish: string; // surface finish as stated ("None", "ENIG"…), '' when not stated
  controlled: boolean; // impedance controlled (KiCad's dielectric_constraints)
  thickness: Val | null; // the board thickness as stated by the source (KiCad's general thickness), if any
}

export interface Issue {
  level: 'error' | 'warn' | 'note';
  code: string;
  where: string;
  message: string;
}

export function issue(level: Issue['level'], code: string, where: string, message: string): Issue {
  return { level, code, where, message };
}

// --- Positions ---

// How thick a layer is in the stack sum: a mask counts with its thickness on laminate.
export function stackThickness(l: Layer): number {
  return l.kind === 'mask' ? l.onLaminate.v : l.t.v;
}

// z of the layer faces (z up, 0 at the bottom of the stack: the bottom mask's outside on laminate), into `out` of
// length layers + 1: z[i] is the top of layer i, z[i + 1] its bottom, z[n] = 0, z[0] the total thickness.
export function stackZ(s: Stackup, out?: Float64Array): Float64Array {
  const n = s.layers.length;
  const z = out && out.length >= n + 1 ? out : new Float64Array(n + 1);
  let acc = 0;
  z[n] = 0;
  for (let i = n - 1; i >= 0; i -= 1) {
    acc += stackThickness(s.layers[i]);
    z[i] = acc;
  }
  return z;
}

export function totalThickness(s: Stackup): number {
  let t = 0;
  for (const l of s.layers) t += stackThickness(l);
  return t;
}

export function layerIndex(s: Stackup, id: string): number {
  for (let i = 0; i < s.layers.length; i += 1) if (s.layers[i].id === id) return i;
  return -1;
}

export function copperIds(s: Stackup): string[] {
  const out: string[] = [];
  for (const l of s.layers) if (l.kind === 'copper') out.push(l.id);
  return out;
}

// Whether copper layer i is an outer layer (no dielectric on one side).
export function isOuter(s: Stackup, i: number): boolean {
  return neighbour(s, i, -1) < 0 || neighbour(s, i, 1) < 0;
}

// The index of the dielectric next to layer i going up (dir −1, towards the top of the list) or down (+1); −1 at a
// mask or the end.
export function neighbour(s: Stackup, i: number, dir: -1 | 1): number {
  const j = i + dir;
  if (j < 0 || j >= s.layers.length) return -1;
  return s.layers[j].kind === 'dielectric' ? j : -1;
}

// Where copper layer i's narrow top faces ('up' = towards the top of the board): as set, else outwards on an outer
// layer, else towards the adjacent prepreg (the copper sits on the core it was etched on), else towards the nearer
// outer surface.
export function fillSide(s: Stackup, i: number): 'up' | 'down' {
  const l = s.layers[i] as CopperLayer;
  if (l.fill) return l.fill;
  const up = neighbour(s, i, -1);
  const down = neighbour(s, i, 1);
  if (up < 0) return 'up';
  if (down < 0) return 'down';
  const ru = (s.layers[up] as DielectricLayer).role;
  const rd = (s.layers[down] as DielectricLayer).role;
  if (ru !== rd) return ru === 'prepreg' ? 'up' : 'down';
  return i < s.layers.length / 2 ? 'up' : 'down';
}

// The etch offset per side in mm for copper of thickness t.
export function etchOffset(c: CopperLayer): number {
  const e = c.etch;
  if (e.kind === 'offset') return e.side.v;
  if (e.kind === 'factor') return e.f.v > 0 ? c.t.v / e.f.v : 0;
  return 0;
}

// --- Checks ---

const EPS = 1e-12;

function checkVal(x: Val, where: string, what: string, out: Issue[], min: number, minOpen: boolean, max = Infinity): void {
  if (!x || typeof x.v !== 'number' || !Number.isFinite(x.v)) {
    out.push(issue('error', 'number', where, `${what} is not a number.`));
    return;
  }
  if (minOpen ? !(x.v > min) : !(x.v >= min)) out.push(issue('error', 'range', where, `${what} must be ${minOpen ? 'above' : 'at least'} ${min}.`));
  if (x.v > max) out.push(issue('error', 'range', where, `${what} must be at most ${max}.`));
  if (!x.src || !x.src.kind) out.push(issue('error', 'source', where, `${what} has no source.`));
  if (x.tol) {
    const t = 'abs' in x.tol ? x.tol.abs : x.tol.rel;
    if (!(t >= 0) || !Number.isFinite(t)) out.push(issue('error', 'tolerance', where, `${what}: the tolerance must be zero or more.`));
  }
}

// Everything that makes a stackup unusable or doubtful: order (masks only outside, copper and dielectric
// alternating with one or more dielectrics between copper layers, copper on both outsides), numbers in range, unique
// ids, base + plating = finished thickness, the trapezoid's top not below zero width for a 0.01 mm trace.
export function stackupIssues(s: Stackup): Issue[] {
  const out: Issue[] = [];
  const L = s.layers;
  if (!L || L.length === 0) return [issue('error', 'empty', 'stackup', 'The stackup has no layers.')];
  const ids = new Set<string>();
  let first = -1;
  let last = -1;
  let coppers = 0;
  for (let i = 0; i < L.length; i += 1) {
    const l = L[i];
    const where = l.id || `layer ${i + 1}`;
    if (!l.id) out.push(issue('error', 'id', where, 'A layer has no id.'));
    else if (ids.has(l.id)) out.push(issue('error', 'id', where, `Two layers are called ${l.id}.`));
    ids.add(l.id);
    if (l.kind === 'mask') {
      if (i !== 0 && i !== L.length - 1) out.push(issue('error', 'order', where, 'A solder mask must be the first or last layer.'));
      checkVal(l.er, where, 'The mask’s εr', out, 1, false);
      if (l.tand) checkVal(l.tand, where, 'The mask’s tanδ', out, 0, false, 1);
      checkVal(l.onLaminate, where, 'The mask on laminate', out, 0, true);
      checkVal(l.onCopper, where, 'The mask over copper', out, 0, true);
      checkVal(l.between, where, 'The mask between traces', out, 0, true);
      if (l.freq !== null && !(l.freq > 0)) out.push(issue('error', 'range', where, 'The mask’s reference frequency must be above zero.'));
      continue;
    }
    if (first < 0) first = i;
    last = i;
    if (l.kind === 'copper') {
      coppers += 1;
      if (i > 0 && L[i - 1].kind === 'copper') out.push(issue('error', 'order', where, 'Two copper layers touch: a dielectric must lie between them.'));
      checkVal(l.t, where, 'The copper thickness', out, 0, true);
      if (l.base) checkVal(l.base, where, 'The base copper', out, 0, true);
      if (l.plating) checkVal(l.plating, where, 'The plating', out, 0, false);
      if (l.calc) checkVal(l.calc, where, 'The calculator’s copper thickness', out, 0, true);
      if (l.base && l.plating && Math.abs(l.base.v + l.plating.v - l.t.v) > 1e-9) {
        out.push(issue('error', 'copper', where, 'Base copper plus plating differs from the finished thickness.'));
      }
      if (l.etch.kind === 'offset') checkVal(l.etch.side, where, 'The etch offset', out, 0, false);
      if (l.etch.kind === 'factor') checkVal(l.etch.f, where, 'The etch factor', out, 0, true);
    } else {
      checkVal(l.t, where, 'The dielectric thickness', out, 0, true);
      checkVal(l.er, where, 'εr', out, 1, false);
      if (l.tand) checkVal(l.tand, where, 'tanδ', out, 0, false, 1);
      if (l.freq !== null && !(l.freq > 0)) out.push(issue('error', 'range', where, 'The reference frequency must be above zero.'));
      if (l.role !== 'core' && l.role !== 'prepreg') out.push(issue('error', 'role', where, 'A dielectric is a core or a prepreg.'));
    }
  }
  if (first >= 0 && L[first].kind !== 'copper') out.push(issue('error', 'order', L[first].id, 'The first layer under the mask must be copper.'));
  if (last >= 0 && L[last].kind !== 'copper') out.push(issue('error', 'order', L[last].id, 'The last layer above the mask must be copper.'));
  if (coppers < 2) out.push(issue('error', 'order', 'stackup', 'A stackup needs at least two copper layers.'));
  if (L[0].kind === 'mask' && L.length > 1 && L[1].kind !== 'copper') out.push(issue('error', 'order', L[0].id, 'The top mask must lie on copper.'));
  if (L[L.length - 1].kind === 'mask' && L.length > 1 && L[L.length - 2].kind !== 'copper') {
    out.push(issue('error', 'order', L[L.length - 1].id, 'The bottom mask must lie on copper.'));
  }
  if (s.thickness) {
    const sum = totalThickness(s);
    if (Math.abs(sum - s.thickness.v) > 0.0005 + EPS) {
      out.push(issue('note', 'thickness', 'stackup', `The layers add up to ${+sum.toFixed(4)} mm, the stated board thickness is ${s.thickness.v} mm.`));
    }
  }
  return out;
}

// --- Equality and copies (the link's round trip compares with these) ---

export function sameSource(a: Source, b: Source): boolean {
  if (a === b) return true;
  if (!a || !b || a.kind !== b.kind) return false;
  if (a.kind === 'typed') return true;
  if (a.kind === 'preset') {
    const p = b as typeof a;
    return a.id === p.id && a.ref === p.ref && a.date === p.date && a.url === p.url && (a.note ?? '') === (p.note ?? '');
  }
  const k = b as typeof a;
  return a.file === k.file && a.version === k.version && !!a.absent === !!k.absent && !!a.placeholder === !!k.placeholder;
}

export function sameTol(a: Tol, b: Tol): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if ('abs' in a) return 'abs' in b && a.abs === b.abs;
  return 'rel' in b && a.rel === b.rel;
}

export function sameVal(a: Val | null, b: Val | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.v === b.v && sameTol(a.tol, b.tol) && sameSource(a.src, b.src);
}

function sameEtch(a: Etch, b: Etch): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'offset') return sameVal(a.side, (b as typeof a).side);
  if (a.kind === 'factor') return sameVal(a.f, (b as typeof a).f);
  return true;
}

export function sameLayer(a: Layer, b: Layer): boolean {
  if (a.kind !== b.kind || a.id !== b.id || a.name !== b.name) return false;
  if (a.kind === 'mask') {
    const m = b as MaskLayer;
    return a.material === m.material && sameVal(a.er, m.er) && sameVal(a.tand, m.tand) && a.freq === m.freq &&
      sameVal(a.onLaminate, m.onLaminate) && sameVal(a.onCopper, m.onCopper) && sameVal(a.between, m.between);
  }
  if (a.kind === 'copper') {
    const c = b as CopperLayer;
    return sameVal(a.t, c.t) && sameVal(a.base, c.base) && sameVal(a.plating, c.plating) && sameVal(a.calc, c.calc) &&
      sameEtch(a.etch, c.etch) && a.fill === c.fill;
  }
  const d = b as DielectricLayer;
  return a.role === d.role && a.material === d.material && sameVal(a.t, d.t) && sameVal(a.er, d.er) &&
    sameVal(a.tand, d.tand) && a.freq === d.freq;
}

export function sameStackup(a: Stackup, b: Stackup): boolean {
  if (a === b) return true;
  if (!a || !b || a.id !== b.id || a.name !== b.name || a.finish !== b.finish || a.controlled !== b.controlled) return false;
  if (!sameVal(a.thickness, b.thickness) || a.layers.length !== b.layers.length) return false;
  for (let i = 0; i < a.layers.length; i += 1) if (!sameLayer(a.layers[i], b.layers[i])) return false;
  return true;
}

// A deep copy (sources are shared: they are never edited in place).
export function cloneVal(x: Val | null): Val | null {
  return x ? { v: x.v, tol: x.tol ? { ...x.tol } as Tol : null, src: x.src } : null;
}

export function cloneStackup(s: Stackup): Stackup {
  return {
    ...s,
    thickness: cloneVal(s.thickness),
    layers: s.layers.map((l): Layer => {
      if (l.kind === 'mask') return { ...l, er: cloneVal(l.er), tand: cloneVal(l.tand), onLaminate: cloneVal(l.onLaminate), onCopper: cloneVal(l.onCopper), between: cloneVal(l.between) };
      if (l.kind === 'copper') {
        const etch: Etch = l.etch.kind === 'offset' ? { kind: 'offset', side: cloneVal(l.etch.side) } : l.etch.kind === 'factor' ? { kind: 'factor', f: cloneVal(l.etch.f) } : { kind: 'none' };
        return { ...l, t: cloneVal(l.t), base: cloneVal(l.base), plating: cloneVal(l.plating), calc: cloneVal(l.calc), etch };
      }
      return { ...l, t: cloneVal(l.t), er: cloneVal(l.er), tand: cloneVal(l.tand) };
    }),
  };
}

// Every Val of a stackup with where it is (for the harness's "every number has a source" and for Monte Carlo).
export function stackupVals(s: Stackup): { where: string; x: Val }[] {
  const out: { where: string; x: Val }[] = [];
  const add = (where: string, x: Val | null) => { if (x) out.push({ where, x }); };
  add('thickness', s.thickness);
  for (const l of s.layers) {
    if (l.kind === 'mask') { add(`${l.id}.er`, l.er); add(`${l.id}.tand`, l.tand); add(`${l.id}.onLaminate`, l.onLaminate); add(`${l.id}.onCopper`, l.onCopper); add(`${l.id}.between`, l.between); }
    else if (l.kind === 'copper') {
      add(`${l.id}.t`, l.t); add(`${l.id}.base`, l.base); add(`${l.id}.plating`, l.plating); add(`${l.id}.calc`, l.calc);
      if (l.etch.kind === 'offset') add(`${l.id}.etch`, l.etch.side);
      if (l.etch.kind === 'factor') add(`${l.id}.etch`, l.etch.f);
    } else { add(`${l.id}.t`, l.t); add(`${l.id}.er`, l.er); add(`${l.id}.tand`, l.tand); }
  }
  return out;
}
