// Helpers of the Trace section (M2.1b), framework-free: the kinds offered, a structure moved to another kind or signal
// layer with the user's widths kept, the stackup's copper layers, and the text of a result with its error (engine.md
// §8: digits never finer than the larger of the error and the quantity's floor, 0.01 Ω for impedances).

import { copperIds, etchOffset, layerIndex } from '../../lib/emsim/stackup';
import type { CopperLayer, Stackup, Val } from '../../lib/emsim/stackup';
import { KIND_INFO, TRACE_KINDS, presetStructure } from '../../lib/emsim/structure';
import type { Structure, TraceKind } from '../../lib/emsim/structure';

// The presets of the section's kind list (the general arrangement's editor is M2.1c).
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
