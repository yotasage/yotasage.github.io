// The Via section's drag handles (step M3.1b), framework-free like traceGeom's: where each handle sits in the world of
// its view (lib/emsim/viaGeom.ts: side view x along the section line, y down from the board's top; top view board (x, −y)), the
// value it edits (mm), and the via with a new value, or why it cannot take it.
//   Side view: each pad on its layer and each antipad on its plane at the right-hand barrel's right edge (a pair's via
//   B), the drill at the barrel's middle, the backdrill's depth at the drilled hole's edge.
//   Top view: the signal layers' pads and all antipads at via A's right edge (an oblong antipad: its width at the
//   straight side's middle and its length at the end below via A; a joined one also its bridge), the pitch at via B's
//   centre, each return via at its centre (moved in x and y).
// A value is refused when it makes an error of viaIssues that the via did not have before (so a via already typed
// wrong can still be dragged), or when a return via would overlap another one.

import { TYPED, layerIndex } from '../../lib/emsim/stackup';
import type { Stackup, Val } from '../../lib/emsim/stackup';
import { viaIssues } from '../../lib/emsim/via';
import type { ReturnVia, ViaStructure } from '../../lib/emsim/via';
import type { SideGeom, TopGeom } from '../../lib/emsim/viaGeom';
import { emT } from './emText';

export type ViaHandleKey = string; // pad:<layer> | ap:<layer> | drill | bd | top-pad | top-ap | top-apl | top-br | pitch | ret:<k>

export interface ViaHandle {
  key: ViaHandleKey;
  axis: 'x' | 'y' | 'xy';
  x: number; // world of its view
  y: number;
  value: number; // mm; a return via: its board x
  value2: number; // a return via: its board y (else NaN)
  name: string;
  /** The value(s) with the pointer at world (x, y). */
  from: (x: number, y: number) => [number, number];
}

const keep = (old: Val | null | undefined, v: number): Val => ({ v, tol: old ? old.tol : null, src: TYPED });
const one = (v: number): [number, number] => [v, NaN];

/** The side view's handles. */
export function sideHandles(st: Stackup, v: ViaStructure, g: SideGeom): ViaHandle[] {
  if (!g.ok || !g.barrels.length) return [];
  const out: ViaHandle[] = [];
  const c = Math.max(...g.barrels.map((b) => b.s));
  const iS = layerIndex(st, v.start), iE = layerIndex(st, v.end);
  const mid = new Map(g.layers.map((l) => [l.id, 0.5 * (l.y0 + l.y1)]));
  for (const p of v.pads) {
    const i = layerIndex(st, p.layer);
    if (!p.d || !(p.d.v > 0) || i < iS || i > iE) continue;
    out.push({ key: `pad:${p.layer}`, axis: 'x', x: c + p.d.v / 2, y: mid.get(p.layer) ?? 0, value: p.d.v, value2: NaN, name: emT('em.via.h.padOn', { layer: st.layers[i].name || p.layer }), from: (x) => one(2 * (x - c)) });
  }
  for (const a of v.antipads) {
    const i = layerIndex(st, a.layer);
    if (!(a.d?.v > 0) || i < iS || i > iE) continue;
    out.push({ key: `ap:${a.layer}`, axis: 'x', x: c + a.d.v / 2, y: mid.get(a.layer) ?? 0, value: a.d.v, value2: NaN, name: emT('em.via.h.apOn', { layer: st.layers[i].name || a.layer }), from: (x) => one(2 * (x - c)) });
  }
  const b = g.barrels[g.barrels.length - 1];
  out.push({ key: 'drill', axis: 'x', x: c + v.drill.v / 2, y: 0.5 * (b.y0 + b.y1), value: v.drill.v, value2: NaN, name: emT('em.via.h.drill'), from: (x) => one(2 * (x - c)) });
  const bd = v.backdrill;
  if (bd && bd.depth?.v > 0 && bd.d?.v > 0) {
    const top = bd.side === 'top';
    out.push({ key: 'bd', axis: 'y', x: c + bd.d.v / 2, y: top ? bd.depth.v : g.thick - bd.depth.v, value: bd.depth.v, value2: NaN, name: emT('em.via.h.bdDepth', { side: emT(top ? 'em.via.top' : 'em.via.bottom') }), from: (_x, y) => one(top ? y : g.thick - y) });
  }
  return out;
}

/** The top view's handles. */
export function topHandles(st: Stackup, v: ViaStructure, g: TopGeom): ViaHandle[] {
  const out: ViaHandle[] = [];
  const sig = v.pads.filter((p) => (p.layer === v.entry || p.layer === v.exit) && p.d && p.d.v > 0);
  const name = (id: string) => st.layers[layerIndex(st, id)]?.name || id;
  if (sig.length) {
    const d = Math.max(...sig.map((p) => p.d!.v));
    out.push({ key: 'top-pad', axis: 'x', x: d / 2, y: 0, value: d, value2: NaN, name: emT('em.via.h.padOn', { layer: sig.map((p) => name(p.layer)).join(emT('em.via.h.and')) }), from: (x) => one(2 * x) });
  }
  const iS = layerIndex(st, v.start), iE = layerIndex(st, v.end);
  const aps = v.antipads.filter((a) => { const i = layerIndex(st, a.layer); return i >= iS && i <= iE && a.d?.v > 0; });
  const p = v.pitch ? v.pitch.v : 0;
  if (aps.length) {
    const a = aps[0], r = a.d.v / 2;
    const all = aps.length > 1 ? emT('em.via.h.allAp') : emT('em.via.h.apOn', { layer: name(a.layer) });
    if (a.shape === 'oblong' && p) {
      out.push({ key: 'top-ap', axis: 'x', x: r, y: -p / 2, value: a.d.v, value2: NaN, name: emT('em.via.h.width', { what: all }), from: (x) => one(2 * x) });
      out.push({ key: 'top-apl', axis: 'y', x: 0, y: r, value: p + a.d.v, value2: NaN, name: emT('em.via.h.length', { what: all }), from: (_x, y) => one(p + 2 * y) });
    } else {
      out.push({ key: 'top-ap', axis: 'x', x: r, y: 0, value: a.d.v, value2: NaN, name: all, from: (x) => one(2 * x) });
      if (a.shape === 'joined' && p && a.bridge?.v > 0) out.push({ key: 'top-br', axis: 'x', x: a.bridge.v / 2, y: -p / 2, value: a.bridge.v, value2: NaN, name: emT('em.via.h.bridgeW'), from: (x) => one(2 * x) });
    }
  }
  if (v.pitch) out.push({ key: 'pitch', axis: 'y', x: 0, y: -p, value: p, value2: NaN, name: emT('em.via.h.pitch'), from: (_x, y) => one(-y) });
  for (const r of g.returns) out.push({ key: `ret:${r.k}`, axis: 'xy', x: r.x, y: r.y, value: r.x, value2: -r.y, name: emT('em.via.h.returnN', { n: r.k + 1 }), from: (x, y) => [x, -y] });
  return out;
}

const errorsOf = (s: Stackup, v: ViaStructure): string[] => viaIssues(s, v).filter((i) => i.level === 'error').map((i) => i.message);

// The first error the new via has that the old one did not; or a return via on another one.
function check(s: Stackup, old: ViaStructure, n: ViaStructure, moved: number): { via: ViaStructure } | { reason: string } {
  const before = new Set(errorsOf(s, old));
  const bad = errorsOf(s, n).find((m) => !before.has(m));
  if (bad) return { reason: bad.charAt(0).toUpperCase() + bad.slice(1) };
  if (moved >= 0) {
    const r = n.returns[moved], rr = (r.pad ? r.pad.v : r.drill.v) / 2;
    for (let j = 0; j < n.returns.length; j++) {
      const o = n.returns[j];
      if (j === moved || !Number.isFinite(o.x?.v) || !Number.isFinite(o.y?.v)) continue;
      if (Math.hypot(r.x.v - o.x.v, r.y.v - o.y.v) < rr + (o.pad ? o.pad.v : o.drill.v) / 2) return { reason: emT('em.via.h.overlap', { a: moved + 1, b: j + 1 }) };
    }
  }
  return { via: n };
}

/** The via with a handle's value(s), or why it cannot take them. */
export function applyViaHandle(s: Stackup, v: ViaStructure, key: ViaHandleKey, a: number, b = NaN): { via: ViaStructure } | { reason: string } {
  if (!Number.isFinite(a)) return { reason: emT('em.via.h.notNum') };
  const pos = (what: string) => (a > 0 ? null : { reason: emT('em.via.h.gtZero', { what }) });
  let n: ViaStructure;
  let moved = -1;
  if (key.startsWith('pad:')) {
    const L = key.slice(4);
    const no = pos(emT('em.via.h.thePad')); if (no) return no;
    n = { ...v, pads: v.pads.map((p) => (p.layer === L ? { ...p, d: keep(p.d, a) } : p)) };
  } else if (key.startsWith('ap:')) {
    const L = key.slice(3);
    const no = pos(emT('em.via.h.theAp')); if (no) return no;
    n = { ...v, antipads: v.antipads.map((x) => (x.layer === L ? { ...x, d: keep(x.d, a) } : x)) };
  } else if (key.startsWith('ret:')) {
    const k = Number(key.slice(4));
    if (!v.returns[k]) return { reason: emT('em.via.h.noRet') };
    if (!Number.isFinite(b)) return { reason: emT('em.via.h.notNum') };
    n = { ...v, returns: v.returns.map((r, i) => (i === k ? { ...r, x: keep(r.x, a), y: keep(r.y, b) } : r)) };
    moved = k;
  } else {
    switch (key) {
      case 'drill': { const no = pos(emT('em.via.h.theDrill')); if (no) return no; n = { ...v, drill: keep(v.drill, a) }; break; }
      case 'bd': {
        if (!v.backdrill) return { reason: emT('em.via.h.noBd') };
        const no = pos(emT('em.via.h.theBdDepth')); if (no) return no;
        n = { ...v, backdrill: { ...v.backdrill, depth: keep(v.backdrill.depth, a) } };
        break;
      }
      case 'top-pad': {
        const no = pos(emT('em.via.h.thePad')); if (no) return no;
        n = { ...v, pads: v.pads.map((p) => ((p.layer === v.entry || p.layer === v.exit) && p.d && p.d.v > 0 ? { ...p, d: keep(p.d, a) } : p)) };
        break;
      }
      case 'top-ap': case 'top-apl': {
        const d = key === 'top-apl' ? a - (v.pitch?.v ?? 0) : a;
        if (!(d > 0)) return { reason: emT('em.via.h.gtZero', { what: emT('em.via.h.theAp') }) };
        n = { ...v, antipads: v.antipads.map((x) => ({ ...x, d: keep(x.d, d) })) };
        break;
      }
      case 'top-br': {
        const no = pos(emT('em.via.h.theBridge')); if (no) return no;
        n = { ...v, antipads: v.antipads.map((x) => (x.shape === 'joined' ? { ...x, bridge: keep(x.bridge, a) } : x)) };
        break;
      }
      case 'pitch': {
        if (!v.pitch) return { reason: emT('em.via.h.noPitch') };
        const no = pos(emT('em.via.h.thePitch')); if (no) return no;
        n = { ...v, pitch: keep(v.pitch, a) };
        break;
      }
      default: return { reason: emT('em.via.h.noHandle') };
    }
  }
  return check(s, v, n, moved);
}

/** A new return via at board (x, y), with the last one's drill and pad, joining every plane; or why not there. */
export function addReturnAt(s: Stackup, v: ViaStructure, x: number, y: number): { via: ViaStructure } | { reason: string } {
  const last = v.returns[v.returns.length - 1];
  const drill = last?.drill ?? keep(null, Math.min(v.drill.v, 0.3));
  const pad = last ? last.pad : keep(null, +(drill.v + 0.3).toFixed(6));
  const r: ReturnVia = { x: keep(null, x), y: keep(null, y), drill, pad, planes: [...v.planes] };
  const n = { ...v, returns: [...v.returns, r] };
  const res = check(s, v, n, n.returns.length - 1);
  if (!('reason' in res)) return res;
  const tag = emT('em.via.h.returnN', { n: n.returns.length });
  const repl = emT('em.via.h.retThere');
  return { reason: res.reason.replace(tag, repl).replace(tag.toLowerCase(), repl).replace(`return via ${n.returns.length}`, repl).replace(`Return via ${n.returns.length}`, repl) };
}
