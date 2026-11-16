// The Via section's edits (step M3.1a): each takes the via (and the stackup where it needs the layers) and gives the
// next via, keeping what the user typed. Framework-free, so the harness and M3.1b's handles use the same edits.
// Nothing is refused here: a via that makes no sense is committed as it is and viaIssues says why (as the Trace
// section does), except the edits that cannot be done at all, which return a reason.

import { layerIndex, val } from '../../lib/emsim/stackup';
import type { Stackup, Val } from '../../lib/emsim/stackup';
import type { Structure } from '../../lib/emsim/structure';
import type { Antipad, Backdrill, ReturnVia, ViaStructure } from '../../lib/emsim/via';
import { stackZ } from '../../lib/emsim/stackup';
import { barrelsOf } from '../../lib/emsim/viaGeom';

const typed = (x: number): Val => val(+x.toPrecision(6));

/** The copper layers' ids, top first. */
export const coppersOf = (s: Stackup): string[] => s.layers.filter((l) => l.kind === 'copper').map((l) => l.id);

const byStack = (s: Stackup) => (a: string, b: string) => layerIndex(s, a) - layerIndex(s, b);

/** The pads and antipads that belong to the barrel's layers, in stack order (new layers: no pad, a round antipad). */
function fitLayers(s: Stackup, v: ViaStructure): ViaStructure {
  const iS = layerIndex(s, v.start), iE = layerIndex(s, v.end);
  const inB = (id: string) => { const i = layerIndex(s, id); return i >= iS && i <= iE; };
  const ids = coppersOf(s).filter(inB);
  const pads = ids.map((id) => v.pads.find((p) => p.layer === id) ?? { layer: id, d: id === v.entry || id === v.exit ? padOfSignal(v) : null });
  const apD = v.antipads[0]?.d ?? typed(Math.max(padOfSignal(v)?.v ?? v.drill.v, v.drill.v) + 0.6);
  const antipads = v.planes.filter(inB).map((id) => v.antipads.find((a) => a.layer === id) ?? { layer: id, d: apD, shape: 'round' as const, bridge: null });
  return { ...v, pads, antipads };
}

const padOfSignal = (v: ViaStructure): Val | null => v.pads.find((p) => (p.layer === v.entry || p.layer === v.exit) && p.d)?.d ?? v.pads.find((p) => p.d)?.d ?? null;

/** Single via or pair: a pair gets a pitch that clears the pads; back to one via, shared antipads become round. */
export function withPair(v: ViaStructure, pair: boolean): ViaStructure {
  if (pair === !!v.pitch) return v;
  if (!pair) return { ...v, pitch: null, antipads: v.antipads.map((a) => (a.shape === 'round' ? a : { ...a, shape: 'round' as const, bridge: null })) };
  const pad = Math.max(v.drill.v, ...v.pads.map((p) => (p.d ? p.d.v : 0)));
  return { ...v, pitch: typed(Math.ceil((pad + 0.2) * 20) / 20) };
}

/** The barrel's start and end layers (pads and antipads follow; entry and exit kept). */
export function withBarrel(s: Stackup, v: ViaStructure, start: string, end: string): ViaStructure {
  return fitLayers(s, { ...v, start, end });
}

/** The entry or exit layer; its feed moves with it, and a removed pad there comes back. */
export function withSignal(s: Stackup, v: ViaStructure, which: 'entry' | 'exit', id: string): ViaStructure {
  const old = v[which];
  const pad = padOfSignal(v);
  const next = { ...v, [which]: id, feeds: v.feeds.map((f) => (f.layer === old ? { ...f, layer: id } : f)), planes: v.planes.filter((p) => p !== id) };
  next.antipads = next.antipads.filter((a) => a.layer !== id);
  next.returns = next.returns.map((r) => ({ ...r, planes: r.planes.filter((p) => p !== id) }));
  const f = fitLayers(s, next);
  return { ...f, pads: f.pads.map((p) => (p.layer === id && !p.d ? { ...p, d: pad } : p)) };
}

/** Entry on the Trace section's signal layer (exit kept unless it is that layer): null with nothing to do. */
export function withTraceLayer(s: Stackup, v: ViaStructure, t: Structure): { via: ViaStructure } | { reason: string } {
  const id = t.kind === 'general' ? '' : t.layer;
  if (!id || layerIndex(s, id) < 0) return { reason: 'The trace has no single signal layer.' };
  if (v.entry === id) return { reason: `The entry is already on ${id}.` };
  const iS = layerIndex(s, v.start), iE = layerIndex(s, v.end), i = layerIndex(s, id);
  if (i < iS || i > iE) return { reason: `The barrel does not reach ${id}.` };
  if (v.exit === id) return { via: withSignal(s, withSignal(s, v, 'exit', v.entry), 'entry', id) };
  return { via: withSignal(s, v, 'entry', id) };
}

export function withPad(v: ViaStructure, layer: string, d: Val | null): ViaStructure {
  return { ...v, pads: v.pads.map((p) => (p.layer === layer ? { ...p, d } : p)) };
}

/** A copper layer made a plane or not: its antipad (and the return vias joining it) follow. */
export function withPlane(s: Stackup, v: ViaStructure, layer: string, on: boolean): ViaStructure {
  if (on === v.planes.includes(layer)) return v;
  if (!on) {
    return {
      ...v, planes: v.planes.filter((p) => p !== layer), antipads: v.antipads.filter((a) => a.layer !== layer),
      returns: v.returns.map((r) => ({ ...r, planes: r.planes.filter((p) => p !== layer) })),
    };
  }
  const planes = [...v.planes, layer].sort(byStack(s));
  const returns = v.returns.map((r) => ({ ...r, planes: [...r.planes, layer].sort(byStack(s)) }));
  return fitLayers(s, { ...v, planes, returns });
}

export function withAntipad(v: ViaStructure, layer: string, patch: Partial<Antipad>): ViaStructure {
  return {
    ...v, antipads: v.antipads.map((a) => {
      if (a.layer !== layer) return a;
      const n = { ...a, ...patch };
      if (n.shape === 'joined' && !n.bridge) n.bridge = typed(Math.max(0.1, Math.min(n.d.v * 0.6, (v.pitch?.v ?? 1) * 0.8)));
      if (n.shape !== 'joined') n.bridge = null;
      return n;
    }),
  };
}

/** The same antipad size on every plane (its tolerance and source as typed). */
export function withAllAntipads(v: ViaStructure, d: Val): ViaStructure {
  return { ...v, antipads: v.antipads.map((a) => ({ ...a, d })) };
}

/** A new return via at the free place around the via nearest to where the others are (or 0.8 mm from it). */
export function addReturn(v: ViaStructure): ViaStructure {
  const B = barrelsOf(v);
  const last = v.returns[v.returns.length - 1];
  const drill = last?.drill ?? typed(Math.min(v.drill.v, 0.3));
  const pad = last ? last.pad : typed(drill.v + 0.3);
  const rr = (pad ? pad.v : drill.v) / 2;
  const padMax = Math.max(v.drill.v, ...v.pads.map((p) => (p.d ? p.d.v : 0)));
  const apMax = Math.max(0, ...v.antipads.map((a) => a.d?.v ?? 0));
  let dist = Infinity;
  for (const r of v.returns) for (const b of B) dist = Math.min(dist, Math.hypot(r.x.v - b.x, r.y.v - b.y));
  if (!Number.isFinite(dist)) dist = Math.max(0.8, apMax / 2 + rr + 0.05, padMax / 2 + rr + 0.15);
  const others = v.returns.map((r) => ({ x: r.x.v, y: r.y.v, r: (r.pad ? r.pad.v : r.drill.v) / 2 }));
  const feeds = v.feeds.filter((f) => Number.isFinite(f.angle)).map((f) => (f.angle * Math.PI) / 180);
  let best: { x: number; y: number } | null = null, bestScore = -Infinity;
  for (const b of B) {
    for (let k = 0; k < 72; k++) {
      const a = (k * Math.PI) / 36;
      const x = b.x + dist * Math.cos(a), y = b.y + dist * Math.sin(a);
      let clear = Infinity;
      for (const o of others) clear = Math.min(clear, Math.hypot(x - o.x, y - o.y) - o.r - rr);
      for (const c of B) clear = Math.min(clear, Math.hypot(x - c.x, y - c.y) - padMax / 2 - rr);
      if (clear <= 0.05) continue;
      let feedAway = Math.PI;
      for (const fa of feeds) { const dd = Math.abs(((a - fa + 3 * Math.PI) % (2 * Math.PI)) - Math.PI); feedAway = Math.min(feedAway, dd); }
      const score = Math.min(clear, 2) + 0.5 * Math.min(feedAway, Math.PI / 2);
      if (score > bestScore) { bestScore = score; best = { x, y }; }
    }
  }
  if (!best) best = { x: 0, y: -dist };
  const nr: ReturnVia = { x: typed(Math.round(best.x * 1000) / 1000), y: typed(Math.round(best.y * 1000) / 1000), drill, pad, planes: [...v.planes] };
  return { ...v, returns: [...v.returns, nr] };
}

export function removeReturn(v: ViaStructure, k: number): ViaStructure {
  return { ...v, returns: v.returns.filter((_, i) => i !== k) };
}

export function withReturn(v: ViaStructure, k: number, patch: Partial<ReturnVia>): ViaStructure {
  return { ...v, returns: v.returns.map((r, i) => (i === k ? { ...r, ...patch } : r)) };
}

/** Backdrill on (from the side with the longer stub, to 0.1 mm short of the signal layer) or off. */
export function withBackdrill(s: Stackup, v: ViaStructure, on: boolean): { via: ViaStructure } | { reason: string } {
  if (on === !!v.backdrill) return { via: v };
  if (!on) return { via: { ...v, backdrill: null } };
  const z = stackZ(s);
  const a = layerIndex(s, v.entry), b = layerIndex(s, v.exit);
  const iS = layerIndex(s, v.start), iE = layerIndex(s, v.end);
  const top = z[iS] - z[Math.min(a, b)], bottom = z[Math.max(a, b) + 1] - z[iE + 1];
  if (!(Math.max(top, bottom) > 1e-6)) return { reason: 'There is no stub to backdrill: the barrel ends on the signal layers.' };
  const side: Backdrill['side'] = bottom >= top ? 'bottom' : 'top';
  const limit = side === 'top' ? z[0] - z[Math.min(a, b)] : z[Math.max(a, b) + 1];
  const depth = typed(Math.max(0.05, Math.round((limit - 0.1) * 1000) / 1000));
  return { via: { ...v, backdrill: { side, depth, d: typed(Math.round((v.drill.v + 0.2) * 1000) / 1000) } } };
}

export function withFeed(v: ViaStructure, k: number, patch: Partial<ViaStructure['feeds'][number]>): ViaStructure {
  return { ...v, feeds: v.feeds.map((f, i) => (i === k ? { ...f, ...patch } : f)) };
}

export function addFeed(v: ViaStructure, layer: string): ViaStructure {
  const other = v.feeds[0];
  const angle = other ? (other.angle + 180) % 360 : layer === v.entry ? 180 : 0;
  return { ...v, feeds: [...v.feeds, { layer, length: typed(2), angle }] };
}

export function removeFeed(v: ViaStructure, k: number): ViaStructure {
  return { ...v, feeds: v.feeds.filter((_, i) => i !== k) };
}
