// Helpers of the Trace section (M2.1b), framework-free: the kinds offered, a structure moved to another kind or signal
// layer with the user's widths kept, the stackup's copper layers, and the text of a result with its error (engine.md
// §8: digits never finer than the larger of the error and the quantity's floor, 0.01 Ω for impedances).

import { copperIds, etchOffset, layerIndex, val } from '../../lib/emsim/stackup';
import type { CopperLayer, Stackup, Val } from '../../lib/emsim/stackup';
import { DEFAULT_W, KIND_INFO, MAX_SIGNALS, TRACE_KINDS, presetStructure, structureIssues } from '../../lib/emsim/structure';
import type { Structure, TraceKind } from '../../lib/emsim/structure';

// The presets of the section's kind list (the general arrangement is offered on its own, M2.1d).
export const KINDS = TRACE_KINDS.filter((k) => k.kind !== 'general');

// A structure of another kind on the same stackup: the preset's layers, the user's width, gap, coplanar gap, ground
// width and mask kept (a broadside pair starts with no offset). null when the stackup has too few copper layers.
export function withKind(st: Structure, s: Stackup, kind: TraceKind): Structure | null {
  const n = presetStructure(kind, s, st.w.v);
  if (!n) return null;
  n.w = st.w;
  if (kind !== 'broadside' && st.kind !== 'broadside') n.s = st.s;
  n.g = st.g;
  n.gw = st.gw;
  n.masked = st.masked;
  n.wall = st.wall;
  return n;
}

// The structure on another signal layer, with its reference planes moved to the nearest copper on the sides it had
// them (on the other side when that side has none, as a microstrip going to the bottom layer).
export function withSignalLayer(st: Structure, s: Stackup, id: string): Structure {
  const ids = copperIds(s);
  const k = ids.indexOf(id);
  const n: Structure = { ...st, layer: id };
  if (k < 0) return n;
  const up = k > 0 ? ids[k - 1] : '', dn = k < ids.length - 1 ? ids[k + 1] : '';
  const hadBelow = !!st.below, hadAbove = !!st.above;
  if (hadBelow && hadAbove) { n.below = dn; n.above = up; }
  else if (hadBelow || hadAbove) {
    const want = hadBelow ? dn : up, other = hadBelow ? up : dn;
    const pick = want || other;
    n.below = pick === dn ? pick : '';
    n.above = pick === up && pick !== dn ? pick : '';
  }
  if (st.kind === 'broadside') {
    // The second layer follows below the first when there is room, else above.
    n.layer2 = dn && dn !== n.below ? dn : up && up !== n.above ? up : st.layer2;
  }
  return n;
}

export interface CopperChoice { id: string; name: string; index: number }
export function coppersOf(s: Stackup): CopperChoice[] {
  const out: CopperChoice[] = [];
  s.layers.forEach((l, i) => { if (l.kind === 'copper') out.push({ id: l.id, name: l.name, index: i }); });
  return out;
}

// The etch of a copper layer as the stackup gives it: per-side offset in mm, and where it comes from.
export function etchOf(s: Stackup, id: string): { side: number; src: Val | null } | null {
  const i = layerIndex(s, id);
  if (i < 0 || s.layers[i].kind !== 'copper') return null;
  const c = s.layers[i] as CopperLayer;
  const src = c.etch.kind === 'offset' ? c.etch.side : c.etch.kind === 'factor' ? c.etch.f : null;
  return { side: etchOffset(c), src };
}

export const isPair = (st: Structure) => KIND_INFO[st.kind]?.signals === 2;
export const isCoplanar = (st: Structure) => !!KIND_INFO[st.kind]?.coplanar;

// A value with its error as text. The last digit is at the error's leading digit (its second when the error starts
// with 1 or 2, so 0.15 stays 0.15), never finer than `floor`; `scale` turns the value into the shown unit first.
export interface QText { v: string; e: string; place: number }
export function qText(v: number, e: number, floor: number, scale = 1): QText {
  if (!Number.isFinite(v)) return { v: '–', e: '', place: 0 };
  const x = v * scale;
  const err = Number.isFinite(e) ? Math.abs(e * scale) : 0;
  const step = Math.max(err, floor);
  let p = Math.floor(Math.log10(step));
  if (step / 10 ** p < 3) p -= 1;
  p = Math.max(p, Math.floor(Math.log10(floor) + 1e-9));
  const dec = Math.max(0, -p);
  const round = (y: number) => (Math.round(y / 10 ** p) * 10 ** p).toFixed(dec);
  const vt = round(x).replace('-', '−');
  let et = '';
  if (err > 0) et = Math.round(err / 10 ** p) === 0 ? `<${(10 ** p).toFixed(dec)}` : round(err);
  return { v: vt, e: et, place: p };
}

// Ω and the other quantities' floors, in the shown unit.
export const FLOOR = { ohm: 0.01, ratio: 1e-4, delay: 1e-4, pct: 1e-3, perM: 0.01 } as const;

// ---- the general editor (M2.1d) ----

/** A selected feature of a general structure: "sig.<i>" or "gnd.<i>". */
export type GenSel = `sig.${number}` | `gnd.${number}`;
const GAP = 0.2; // mm: the gap a new trace or ground keeps to what is on its layer
const typed = (v: number): Val => val(v);

// The finite feature extents on one layer of a general structure (and whether a ground runs to either edge).
function occupied(s: Stackup, st: Structure, L: number): { iv: [number, number][]; left: boolean; right: boolean } {
  const iv: [number, number][] = [];
  let left = false, right = false;
  for (const g of st.signals) if (layerIndex(s, g.layer) === L) iv.push([g.u.v - g.w.v / 2, g.u.v + g.w.v / 2]);
  for (const g of st.grounds) {
    if (layerIndex(s, g.layer) !== L) continue;
    if (!g.a) left = true;
    if (!g.b) right = true;
    iv.push([g.a ? g.a.v : -Infinity, g.b ? g.b.v : Infinity]);
  }
  iv.sort((p, q) => p[0] - q[0]);
  return { iv, left, right };
}
const errorOf = (s: Stackup, t: Structure) => structureIssues(s, t).find((q) => q.level === 'error');

// A new trace on layer `id`, as wide as the last one, in the free place nearest the centre: a gap between features
// wide enough, else beside them. The structure or why it cannot take one.
export function addSignal(s: Stackup, st: Structure, id: string): { st: Structure } | { reason: string } {
  if (st.signals.length >= MAX_SIGNALS) return { reason: `A structure has at most ${MAX_SIGNALS} traces.` };
  const L = layerIndex(s, id);
  if (L < 0) return { reason: 'Choose a copper layer for the trace.' };
  const w = st.signals.length ? st.signals[st.signals.length - 1].w : typed(DEFAULT_W);
  const { iv } = occupied(s, st, L);
  const cand: number[] = [];
  if (!iv.length) cand.push(0);
  for (let i = 0; i + 1 < iv.length; i++) if (iv[i + 1][0] - iv[i][1] >= w.v + 2 * GAP) cand.push((iv[i][1] + iv[i + 1][0]) / 2);
  if (iv.length) {
    const hi = Math.max(...iv.map((p) => p[1])), lo = Math.min(...iv.map((p) => p[0]));
    if (Number.isFinite(hi)) cand.push(hi + GAP + w.v / 2);
    if (Number.isFinite(lo)) cand.push(lo - GAP - w.v / 2);
  }
  cand.sort((a, b) => Math.abs(a) - Math.abs(b));
  if (!cand.length) return { reason: `There is no room for a trace on ${s.layers[L].name}: grounds run to both edges.` };
  let why = '';
  for (const u of cand) {
    const t: Structure = { ...st, signals: [...st.signals, { layer: id, w, u: typed(Number(u.toPrecision(12))) }] };
    const bad = errorOf(s, t);
    if (!bad) return { st: t };
    why ||= bad.message;
  }
  return { reason: why };
}

// A new coplanar ground on layer `id`: from beside the features of that layer (or of the structure, on an empty
// layer) to the edge, on the right when that side is free, else on the left.
export function addGround(s: Stackup, st: Structure, id: string): { st: Structure } | { reason: string } {
  const L = layerIndex(s, id);
  if (L < 0) return { reason: 'Choose a copper layer for the ground.' };
  let { iv, left, right } = occupied(s, st, L);
  if (left && right) return { reason: `${s.layers[L].name} already has ground to both edges.` };
  if (!iv.length) iv = st.signals.map((g) => [g.u.v - g.w.v / 2, g.u.v + g.w.v / 2] as [number, number]);
  const fin = iv.flat().filter(Number.isFinite);
  const hi = fin.length ? Math.max(...fin) : 0, lo = fin.length ? Math.min(...fin) : 0;
  const g = !right ? { layer: id, a: typed(Number((hi + GAP).toPrecision(12))), b: null } : { layer: id, a: null, b: typed(Number((lo - GAP).toPrecision(12))) };
  const t: Structure = { ...st, grounds: [...st.grounds, g] };
  const bad = errorOf(s, t);
  return bad ? { reason: bad.message } : { st: t };
}

// The structure without the selected feature (a structure keeps at least one trace).
export function removeFeature(st: Structure, sel: GenSel): { st: Structure } | { reason: string } {
  const [what, n] = sel.split('.');
  const i = Number(n);
  if (what === 'sig') {
    if (!st.signals[i]) return { reason: 'Select a trace or ground to remove.' };
    if (st.signals.length <= 1) return { reason: 'A structure keeps at least one trace.' };
    const signals = st.signals.filter((_, k) => k !== i);
    return { st: { ...st, signals, layer: signals[0].layer } };
  }
  if (!st.grounds[i]) return { reason: 'Select a trace or ground to remove.' };
  return { st: { ...st, grounds: st.grounds.filter((_, k) => k !== i) } };
}
