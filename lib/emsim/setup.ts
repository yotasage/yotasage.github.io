// The whole setup of the tool (stackup, trace structure, via structure) and its plain form: JSON-safe objects with
// short keys that the link (link.ts, as compact text) and the project file (project.ts, as JSON) both write. Reading
// a plain form never throws: a part that cannot be read gives an issue and its default; values that are readable but
// make no sense are kept as they are (stackupIssues, structureIssues and viaIssues report them), so writing and
// reading round-trip exactly.

import { DEFAULT_PRESET, READ_DATE, presetStackup, refUrl } from './presets';
import { issue, sameSource, sameStackup, sameVal, val } from './stackup';
import type { CopperLayer, DielectricLayer, Etch, Issue, Layer, MaskLayer, Source, Stackup, Tol, Val } from './stackup';
import { DEFAULT_G, DEFAULT_S, KIND_INFO, presetStructure, sameStructure } from './structure';
import type { GenGround, GenSignal, Structure, TraceKind } from './structure';
import { presetVia, sameVia } from './via';
import type { Antipad, Backdrill, Feed, ReturnVia, ViaPad, ViaStructure } from './via';

export interface Setup {
  stackup: Stackup;
  trace: Structure;
  via: ViaStructure;
}

// The owner's 50R_SE microstrip on JLC061611-3313A (facts-cases.md C39) and the carrier's via (C44).
export const DEFAULT_TRACE_W = 0.1377;

export function defaultSetup(): Setup {
  const stackup = presetStackup(DEFAULT_PRESET);
  return { stackup, trace: presetStructure('microstrip', stackup, DEFAULT_TRACE_W), via: presetVia('single', stackup) };
}

export function sameSetup(a: Setup, b: Setup): boolean {
  return sameStackup(a.stackup, b.stackup) && sameStructure(a.trace, b.trace) && sameVia(a.via, b.via);
}

// --- Writing ---

export interface Plain {
  src?: unknown[];
  s?: unknown;
  t?: unknown;
  via?: unknown;
}

class Sources {
  list: Source[] = [];
  plain: unknown[] = [];
  index(s: Source): number {
    if (!s || s.kind === 'typed') return -1;
    for (let i = 0; i < this.list.length; i += 1) if (sameSource(this.list[i], s)) return i;
    this.list.push(s);
    if (s.kind === 'preset') {
      const p: Record<string, unknown> = { k: 'p', id: s.id, r: s.ref };
      if (s.date !== READ_DATE) p.d = s.date;
      if (s.url !== refUrl(s.ref, s.id)) p.u = s.url;
      if (s.note) p.n = s.note;
      this.plain.push(p);
    } else {
      const p: Record<string, unknown> = { k: 'k', f: s.file, ver: s.version };
      if (s.absent) p.a = 1;
      if (s.placeholder) p.ph = 1;
      this.plain.push(p);
    }
    return this.list.length - 1;
  }
}

function pv(x: Val, S: Sources): unknown {
  const i = S.index(x.src);
  if (i < 0 && !x.tol) return x.v;
  const out: unknown[] = [x.v, i];
  if (x.tol) { if ('abs' in x.tol) out.push('a', x.tol.abs); else out.push('r', x.tol.rel); }
  return out;
}

function plainLayer(l: Layer, S: Sources): Record<string, unknown> {
  const o: Record<string, unknown> = { k: l.kind === 'mask' ? 'm' : l.kind === 'copper' ? 'c' : 'd', id: l.id };
  if (l.name !== l.id) o.n = l.name;
  if (l.kind === 'mask') {
    if (l.material) o.mat = l.material;
    o.er = pv(l.er, S);
    if (l.tand) o.tn = pv(l.tand, S);
    if (l.freq !== null) o.f = l.freq;
    o.c1 = pv(l.onLaminate, S); o.c2 = pv(l.onCopper, S); o.c3 = pv(l.between, S);
  } else if (l.kind === 'copper') {
    o.t = pv(l.t, S);
    if (l.base) o.b = pv(l.base, S);
    if (l.plating) o.p = pv(l.plating, S);
    if (l.calc) o.ct = pv(l.calc, S);
    if (l.etch.kind === 'offset') o.e = ['o', pv(l.etch.side, S)];
    if (l.etch.kind === 'factor') o.e = ['f', pv(l.etch.f, S)];
    if (l.fill) o.fl = l.fill === 'up' ? 'u' : 'd';
  } else {
    o.r = l.role === 'core' ? 'c' : 'p';
    if (l.material) o.mat = l.material;
    o.t = pv(l.t, S); o.er = pv(l.er, S);
    if (l.tand) o.tn = pv(l.tand, S);
    if (l.freq !== null) o.f = l.freq;
  }
  return o;
}

export function plainStackup(s: Stackup, S: Sources): unknown {
  if (s.id) {
    const p = presetStackup(s.id);
    if (p && sameStackup(p, s)) return s.id;
  }
  const o: Record<string, unknown> = {};
  if (s.id) o.id = s.id;
  o.n = s.name;
  if (s.finish) o.fin = s.finish;
  if (!s.controlled) o.ic = 0;
  if (s.thickness) o.th = pv(s.thickness, S);
  o.l = s.layers.map((l) => plainLayer(l, S));
  return o;
}

function plainStructure(t: Structure, S: Sources): unknown {
  const o: Record<string, unknown> = { k: t.kind, l: t.layer };
  if (t.layer2) o.l2 = t.layer2;
  if (t.below) o.b = t.below;
  if (t.above) o.a = t.above;
  o.w = pv(t.w, S);
  if (!sameVal(t.s, val(DEFAULT_S))) o.s = pv(t.s, S);
  if (!sameVal(t.g, val(DEFAULT_G))) o.g = pv(t.g, S);
  if (t.gw) o.gw = pv(t.gw, S);
  if (!t.masked) o.m = 0;
  if (t.wall) o.wl = pv(t.wall, S);
  if (t.signals.length) o.sg = t.signals.map((g) => [g.layer, pv(g.w, S), pv(g.u, S)]);
  if (t.grounds.length) o.gd = t.grounds.map((g) => [g.layer, g.a ? pv(g.a, S) : null, g.b ? pv(g.b, S) : null]);
  return o;
}

function plainVia(v: ViaStructure, S: Sources): unknown {
  const o: Record<string, unknown> = { st: v.start, en: v.end, in: v.entry, out: v.exit, dr: pv(v.drill, S), pl: pv(v.plating, S) };
  if (v.pitch) o.pi = pv(v.pitch, S);
  o.pd = v.pads.map((p) => [p.layer, p.d ? pv(p.d, S) : null]);
  o.pn = [...v.planes];
  o.ap = v.antipads.map((p) => (p.bridge ? [p.layer, pv(p.d, S), p.shape, pv(p.bridge, S)] : [p.layer, pv(p.d, S), p.shape]));
  if (v.backdrill) o.bd = [v.backdrill.side, pv(v.backdrill.depth, S), pv(v.backdrill.d, S)];
  o.rv = v.returns.map((r) => [pv(r.x, S), pv(r.y, S), pv(r.drill, S), r.pad ? pv(r.pad, S) : null, [...r.planes]]);
  o.fd = v.feeds.map((f) => [f.layer, pv(f.length, S), f.angle]);
  return o;
}

// The plain form; with `omitDefaults` a part equal to the default setup's is left out (the link's short form).
export function toPlain(x: Setup, omitDefaults = false): Plain {
  const S = new Sources();
  const d = omitDefaults ? defaultSetup() : null;
  const out: Plain = {};
  if (!d || !sameStackup(d.stackup, x.stackup)) out.s = plainStackup(x.stackup, S);
  if (!d || !sameStructure(d.trace, x.trace)) out.t = plainStructure(x.trace, S);
  if (!d || !sameVia(d.via, x.via)) out.via = plainVia(x.via, S);
  if (S.plain.length) out.src = S.plain;
  return out;
}

// --- Reading ---

class Bad extends Error {}
const bad = (what: string): never => { throw new Bad(what); };

const isObj = (x: unknown): x is Record<string, any> => !!x && typeof x === 'object' && !Array.isArray(x);
const str = (x: unknown, what: string): string => (typeof x === 'string' ? x : bad(`${what} is not text`));
const optStr = (x: unknown, what: string, d = ''): string => (x === undefined ? d : str(x, what));
const fin = (x: unknown, what: string): number => (typeof x === 'number' && Number.isFinite(x) ? x : bad(`${what} is not a number`));

function readSources(raw: unknown, issues: Issue[]): Source[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) { issues.push(issue('warn', 'link', 'src', 'The list of sources cannot be read; numbers that cite it are refused.')); return []; }
  return raw.map((p, i): Source => {
    try {
      if (!isObj(p)) bad('not an object');
      if (p.k === 'p') {
        const id = str(p.id, 'id');
        const ref = str(p.r, 'ref');
        const s: Source = { kind: 'preset', id, ref, date: optStr(p.d, 'date', READ_DATE), url: optStr(p.u, 'url', refUrl(ref, id)) };
        if (p.n !== undefined) (s as any).note = str(p.n, 'note');
        return s;
      }
      if (p.k === 'k') {
        const s: Source = { kind: 'kicad', file: str(p.f, 'file'), version: fin(p.ver, 'version') };
        if (p.a) (s as any).absent = true;
        if (p.ph) (s as any).placeholder = true;
        return s;
      }
      return bad('unknown kind');
    } catch (e) {
      issues.push(issue('warn', 'link', 'src', `Source ${i + 1} cannot be read (${(e as Error).message}).`));
      return null;
    }
  });
}

function rv(x: unknown, src: Source[], what: string): Val {
  if (typeof x === 'number') return { v: fin(x, what), tol: null, src: { kind: 'typed' } };
  if (!Array.isArray(x) || x.length < 2) return bad(`${what} cannot be read`);
  const v = fin(x[0], what);
  const i = fin(x[1], `${what}'s source`);
  let s: Source;
  if (i === -1) s = { kind: 'typed' };
  else if (Number.isInteger(i) && i >= 0 && i < src.length && src[i]) s = src[i];
  else return bad(`${what}'s source is missing`);
  let tol: Tol = null;
  if (x.length >= 4) {
    const t = fin(x[3], `${what}'s tolerance`);
    if (x[2] === 'a') tol = { abs: t };
    else if (x[2] === 'r') tol = { rel: t };
    else bad(`${what}'s tolerance cannot be read`);
  } else if (x.length !== 2) bad(`${what} cannot be read`);
  return { v, tol, src: s };
}

const optV = (x: unknown, src: Source[], what: string): Val | null => (x === undefined || x === null ? null : rv(x, src, what));
const optF = (x: unknown, what: string): number | null => (x === undefined || x === null ? null : fin(x, what));

function readLayer(o: any, src: Source[], k: number): Layer {
  if (!isObj(o)) bad(`layer ${k + 1} is not an object`);
  const id = str(o.id, `layer ${k + 1}'s id`);
  const name = optStr(o.n, `${id}'s name`, id);
  if (o.k === 'm') {
    const m: MaskLayer = {
      kind: 'mask', id, name, material: optStr(o.mat, `${id}'s material`), er: rv(o.er, src, `${id} εr`),
      tand: optV(o.tn, src, `${id} tanδ`), freq: optF(o.f, `${id} frequency`),
      onLaminate: rv(o.c1, src, `${id} on laminate`), onCopper: rv(o.c2, src, `${id} over copper`), between: rv(o.c3, src, `${id} between traces`),
    };
    return m;
  }
  if (o.k === 'c') {
    let etch: Etch = { kind: 'none' };
    if (o.e !== undefined) {
      if (!Array.isArray(o.e) || o.e.length !== 2) bad(`${id}'s etch cannot be read`);
      if (o.e[0] === 'o') etch = { kind: 'offset', side: rv(o.e[1], src, `${id} etch offset`) };
      else if (o.e[0] === 'f') etch = { kind: 'factor', f: rv(o.e[1], src, `${id} etch factor`) };
      else bad(`${id}'s etch cannot be read`);
    }
    if (o.fl !== undefined && o.fl !== 'u' && o.fl !== 'd') bad(`${id}'s fill side cannot be read`);
    const c: CopperLayer = {
      kind: 'copper', id, name, t: rv(o.t, src, `${id} thickness`), base: optV(o.b, src, `${id} base`),
      plating: optV(o.p, src, `${id} plating`), calc: optV(o.ct, src, `${id} calculator thickness`), etch,
      fill: o.fl === 'u' ? 'up' : o.fl === 'd' ? 'down' : null,
    };
    return c;
  }
  if (o.k === 'd') {
    if (o.r !== 'c' && o.r !== 'p') bad(`${id}'s role cannot be read`);
    const d: DielectricLayer = {
      kind: 'dielectric', id, name, role: o.r === 'c' ? 'core' : 'prepreg', material: optStr(o.mat, `${id}'s material`),
      t: rv(o.t, src, `${id} thickness`), er: rv(o.er, src, `${id} εr`), tand: optV(o.tn, src, `${id} tanδ`), freq: optF(o.f, `${id} frequency`),
    };
    return d;
  }
  return bad(`layer ${k + 1} is of no known kind`);
}

function readStackup(x: unknown, src: Source[]): Stackup {
  if (typeof x === 'string') return presetStackup(x) ?? bad(`"${x}" is not a preset`);
  if (!isObj(x)) return bad('the stackup is not an object');
  if (!Array.isArray(x.l)) bad('the stackup has no layers');
  return {
    id: optStr(x.id, 'the stackup id'), name: optStr(x.n, 'the stackup name'), finish: optStr(x.fin, 'the finish'),
    controlled: x.ic === undefined ? true : x.ic === 0 ? false : bad('the controlled flag cannot be read'),
    thickness: optV(x.th, src, 'the board thickness'), layers: (x.l as unknown[]).map((l, k) => readLayer(l, src, k)),
  };
}

function readStructure(x: unknown, src: Source[]): Structure {
  if (!isObj(x)) return bad('the trace structure is not an object');
  const kind = str(x.k, 'the kind') as TraceKind;
  if (!KIND_INFO[kind]) bad(`"${kind}" is not a kind of structure`);
  const signals: GenSignal[] = x.sg === undefined ? [] : Array.isArray(x.sg) ? x.sg.map((g: unknown, k: number) => {
    if (!Array.isArray(g) || g.length !== 3) bad(`signal ${k + 1} cannot be read`);
    return { layer: str(g[0], `signal ${k + 1}'s layer`), w: rv(g[1], src, `signal ${k + 1}'s width`), u: rv(g[2], src, `signal ${k + 1}'s position`) };
  }) : bad('the signals cannot be read');
  const grounds: GenGround[] = x.gd === undefined ? [] : Array.isArray(x.gd) ? x.gd.map((g: unknown, k: number) => {
    if (!Array.isArray(g) || g.length !== 3) bad(`ground ${k + 1} cannot be read`);
    return { layer: str(g[0], `ground ${k + 1}'s layer`), a: optV(g[1], src, `ground ${k + 1}'s left edge`), b: optV(g[2], src, `ground ${k + 1}'s right edge`) };
  }) : bad('the grounds cannot be read');
  return {
    kind, layer: str(x.l, 'the signal layer'), layer2: optStr(x.l2, 'the second layer'), below: optStr(x.b, 'the plane below'),
    above: optStr(x.a, 'the plane above'), w: rv(x.w, src, 'the width'),
    s: x.s === undefined ? val(DEFAULT_S) : rv(x.s, src, 'the gap'), g: x.g === undefined ? val(DEFAULT_G) : rv(x.g, src, 'the gap to ground'),
    gw: optV(x.gw, src, 'the ground width'), masked: x.m === undefined ? true : x.m === 0 ? false : bad('the mask flag cannot be read'),
    wall: optV(x.wl, src, 'the wall'), signals, grounds,
  };
}

const strList = (x: unknown, what: string): string[] => (Array.isArray(x) ? x.map((y) => str(y, what)) : bad(`${what} cannot be read`));
const arr = (x: unknown, n: number[], what: string): unknown[] => (Array.isArray(x) && n.includes(x.length) ? x : bad(`${what} cannot be read`));

function readVia(x: unknown, src: Source[]): ViaStructure {
  if (!isObj(x)) return bad('the via is not an object');
  const list = (y: unknown, what: string): unknown[] => (Array.isArray(y) ? y : bad(`${what} cannot be read`));
  const pads: ViaPad[] = list(x.pd, 'the pads').map((p, k) => { const a = arr(p, [2], `pad ${k + 1}`); return { layer: str(a[0], `pad ${k + 1}'s layer`), d: optV(a[1], src, `pad ${k + 1}`) }; });
  const antipads: Antipad[] = list(x.ap, 'the antipads').map((p, k) => {
    const a = arr(p, [3, 4], `antipad ${k + 1}`);
    if (a[2] !== 'round' && a[2] !== 'oblong' && a[2] !== 'joined') bad(`antipad ${k + 1}'s shape cannot be read`);
    return { layer: str(a[0], `antipad ${k + 1}'s layer`), d: rv(a[1], src, `antipad ${k + 1}`), shape: a[2] as Antipad['shape'], bridge: a.length === 4 ? rv(a[3], src, `antipad ${k + 1}'s bridge`) : null };
  });
  let backdrill: Backdrill | null = null;
  if (x.bd !== undefined) {
    const a = arr(x.bd, [3], 'the backdrill');
    if (a[0] !== 'top' && a[0] !== 'bottom') bad('the backdrill side cannot be read');
    backdrill = { side: a[0] as Backdrill['side'], depth: rv(a[1], src, 'the backdrill depth'), d: rv(a[2], src, 'the backdrill diameter') };
  }
  const returns: ReturnVia[] = list(x.rv, 'the return vias').map((r, k) => {
    const a = arr(r, [5], `return via ${k + 1}`);
    return { x: rv(a[0], src, `return via ${k + 1}'s x`), y: rv(a[1], src, `return via ${k + 1}'s y`), drill: rv(a[2], src, `return via ${k + 1}'s drill`), pad: optV(a[3], src, `return via ${k + 1}'s pad`), planes: strList(a[4], `return via ${k + 1}'s planes`) };
  });
  const feeds: Feed[] = list(x.fd, 'the feeds').map((f, k) => { const a = arr(f, [3], `feed ${k + 1}`); return { layer: str(a[0], `feed ${k + 1}'s layer`), length: rv(a[1], src, `feed ${k + 1}'s length`), angle: fin(a[2], `feed ${k + 1}'s angle`) }; });
  return {
    start: str(x.st, 'the barrel top'), end: str(x.en, 'the barrel bottom'), entry: str(x.in, 'the entry'), exit: str(x.out, 'the exit'),
    drill: rv(x.dr, src, 'the drill'), plating: rv(x.pl, src, 'the plating'), pitch: optV(x.pi, src, 'the pitch'),
    pads, planes: strList(x.pn, 'the planes'), antipads, backdrill, returns, feeds,
  };
}

// Reads a plain form: missing parts are the default setup's, unreadable parts too (with an issue).
export function fromPlain(raw: unknown): { setup: Setup; issues: Issue[] } {
  const issues: Issue[] = [];
  const d = defaultSetup();
  if (!isObj(raw)) return { setup: d, issues: [issue('warn', 'link', 'setup', 'The setup cannot be read; the default is used.')] };
  const src = readSources(raw.src, issues);
  // A missing part is the default (what the short link leaves out); an unreadable one the default fitted to the
  // stackup that was read.
  const part = <T>(key: string, what: string, read: () => T, missing: T, fallback: () => T): T => {
    if (raw[key] === undefined) return missing;
    try {
      return read();
    } catch (e) {
      issues.push(issue('warn', 'link', key, `The ${what} cannot be read (${e instanceof Error ? e.message : String(e)}); the default is used.`));
      return fallback();
    }
  };
  const stackup = part('s', 'stackup', () => readStackup(raw.s, src), d.stackup, () => d.stackup);
  const fitted = stackup !== d.stackup;
  const trace = part('t', 'trace structure', () => readStructure(raw.t, src), d.trace,
    () => (fitted ? presetStructure('microstrip', stackup, DEFAULT_TRACE_W) : null) ?? d.trace);
  const via = part('via', 'via', () => readVia(raw.via, src), d.via, () => (fitted ? presetVia('single', stackup) : null) ?? d.via);
  return { setup: { stackup, trace, via }, issues };
}
