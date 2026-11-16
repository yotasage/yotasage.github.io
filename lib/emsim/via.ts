// Via structures (engine.md §3, §6): a via or a differential pair of vias through a stackup, its pads, antipads,
// stub or backdrill, return (stitching) vias and feed traces. Types, presets and checks only; the model is M1.7.
// The via's centre is the origin of the board frame's (x, y); a pair's second via is at (0, pitch). Lengths in mm.

import { issue, layerIndex, sameVal, stackZ, val } from './stackup';
import type { Issue, Stackup, Val } from './stackup';

export interface ViaPad { layer: string; d: Val | null } // d null: the pad is removed (non-functional, not kept)
export interface Antipad {
  layer: string; // a plane layer
  d: Val; // round: diameter around each via; oblong: the slot's width around both vias (length pitch + d)
  shape: 'round' | 'oblong' | 'joined'; // joined: round antipads joined by a bridge of width `bridge`
  bridge: Val | null;
}
export interface ReturnVia { x: Val; y: Val; drill: Val; pad: Val | null; planes: string[] }
export interface Feed { layer: string; length: Val; angle: number } // angle in degrees in the board's (x, y)
export interface Backdrill { side: 'top' | 'bottom'; depth: Val; d: Val } // depth from that outer surface

export interface ViaStructure {
  start: string; // the barrel's top copper layer
  end: string; // and bottom copper layer
  entry: string; // signal layers (where the feed traces connect)
  exit: string;
  drill: Val;
  plating: Val; // finished hole = drill − 2 · plating
  pitch: Val | null; // a pair when set
  pads: ViaPad[]; // per copper layer the barrel passes
  planes: string[]; // reference plane layers
  antipads: Antipad[]; // per plane layer the barrel passes
  backdrill: Backdrill | null;
  returns: ReturnVia[];
  feeds: Feed[];
}

// Numbers taken from the owner's boards (facts-cases.md C44, C45) are typed here: the presets are examples on any
// stackup, not a reading of the board. The plating (0.02 mm) is a typical value, not JLCPCB's (not yet in the facts).
const typed = (x: number): Val => val(x);

export const VIA_PRESETS = ['single', 'pair'] as const;
export type ViaPreset = (typeof VIA_PRESETS)[number];

// A via preset on a stackup with copper L1…Ln (the JLCPCB presets' ids; a KiCad stackup's ids work the same when
// passed in `ids`): 'single' is the carrier's 0.6/0.3 via of C44 (through, pads kept on every layer, antipad Ø1.8 on
// the planes, two return vias 0.8 away), 'pair' the mezzanine's LVDS pair of C45 (Ø0.5/0.22, pitch 0.7, pads only on
// the signal layers, a stadium antipad 1.22 × 1.92 and six return vias). Planes: the second and second-to-last copper.
export function presetVia(kind: ViaPreset, s: Stackup): ViaStructure | null {
  const C = s.layers.filter((l) => l.kind === 'copper').map((l) => l.id);
  const n = C.length;
  if (n < 2) return null;
  const planes = n >= 4 ? [C[1], C[n - 2]] : [];
  const plating = typed(0.02);
  if (kind === 'single') {
    return {
      start: C[0], end: C[n - 1], entry: C[0], exit: C[n - 1], drill: typed(0.3), plating, pitch: null,
      pads: C.map((id) => ({ layer: id, d: typed(0.6) })), planes,
      antipads: planes.map((id) => ({ layer: id, d: typed(1.8), shape: 'round' as const, bridge: null })),
      backdrill: null,
      returns: [{ x: typed(0), y: typed(0.8), drill: typed(0.3), pad: typed(0.6), planes: [...planes] }, { x: typed(0), y: typed(-0.8), drill: typed(0.3), pad: typed(0.6), planes: [...planes] }],
      feeds: [{ layer: C[0], length: typed(2), angle: 180 }, { layer: C[n - 1], length: typed(2), angle: 0 }],
    };
  }
  const ret = (x: number, y: number): ReturnVia => ({ x: typed(x), y: typed(y), drill: typed(0.2), pad: typed(0.4), planes: [...planes] });
  return {
    start: C[0], end: C[n - 1], entry: C[0], exit: C[n - 1], drill: typed(0.22), plating, pitch: typed(0.7),
    pads: C.map((id, k) => ({ layer: id, d: k === 0 || k === n - 1 ? typed(0.5) : null })), planes,
    antipads: planes.map((id) => ({ layer: id, d: typed(1.22), shape: 'oblong' as const, bridge: null })),
    backdrill: null,
    returns: [ret(0.67, -0.47), ret(-0.67, -0.47), ret(0, -0.81), ret(0.67, 1.17), ret(-0.67, 1.17), ret(0, 1.51)],
    feeds: [{ layer: C[0], length: typed(2), angle: 270 }, { layer: C[n - 1], length: typed(2), angle: 90 }],
  };
}

// The barrel beyond the signal layers on each side, after backdrilling (mm).
export function viaStubs(s: Stackup, v: ViaStructure): { top: number; bottom: number } {
  const z = stackZ(s);
  const iS = layerIndex(s, v.start);
  const iE = layerIndex(s, v.end);
  const a = layerIndex(s, v.entry);
  const b = layerIndex(s, v.exit);
  if (iS < 0 || iE < 0 || a < 0 || b < 0) return { top: NaN, bottom: NaN };
  const sigTop = Math.min(a, b);
  const sigBot = Math.max(a, b);
  let top = z[iS] - z[sigTop];
  let bottom = z[sigBot + 1] - z[iE + 1];
  if (v.backdrill) {
    if (v.backdrill.side === 'top') top = Math.max(0, top - Math.max(0, v.backdrill.depth.v - (z[0] - z[iS])));
    else bottom = Math.max(0, bottom - Math.max(0, v.backdrill.depth.v - z[iE + 1]));
  }
  return { top, bottom };
}

// What makes a via structure unusable (errors) or doubtful (warnings) on this stackup.
export function viaIssues(s: Stackup, v: ViaStructure): Issue[] {
  const out: Issue[] = [];
  const cu = (id: string, what: string): number => {
    const i = layerIndex(s, id);
    if (i < 0 || s.layers[i].kind !== 'copper') { out.push(issue('error', 'layer', what, `The ${what} layer "${id}" is not a copper layer of the stackup.`)); return -1; }
    return i;
  };
  const num = (x: Val | null, what: string, min = 0, open = true): boolean => {
    if (!x || !Number.isFinite(x.v)) { out.push(issue('error', 'number', what, `${what} is not a number.`)); return false; }
    if (open ? !(x.v > min) : !(x.v >= min)) { out.push(issue('error', 'range', what, `${what} must be ${open ? 'above' : 'at least'} ${min}.`)); return false; }
    return true;
  };
  const iS = cu(v.start, 'barrel top');
  const iE = cu(v.end, 'barrel bottom');
  const a = cu(v.entry, 'entry');
  const b = cu(v.exit, 'exit');
  if (out.length) return out;
  if (iS >= iE) out.push(issue('error', 'barrel', 'barrel', 'The barrel must start above where it ends.'));
  if (a === b) out.push(issue('error', 'layer', 'exit', 'The entry and exit layers must differ.'));
  for (const [i, w] of [[a, 'entry'], [b, 'exit']] as const) if (i < iS || i > iE) out.push(issue('error', 'layer', w, `The ${w} layer is outside the barrel.`));
  if (num(v.drill, 'The drill') && num(v.plating, 'The plating', 0, false) && v.plating.v * 2 >= v.drill.v) out.push(issue('error', 'range', 'plating', 'The plating closes the hole.'));
  const padOn = new Map<string, number>();
  for (const p of v.pads) {
    const i = cu(p.layer, 'pad');
    if (i < 0) continue;
    if (padOn.has(p.layer)) out.push(issue('error', 'pad', p.layer, `Two pads on ${p.layer}.`));
    if (i < iS || i > iE) out.push(issue('error', 'pad', p.layer, `The pad on ${p.layer} is outside the barrel.`));
    if (p.d && num(p.d, `The pad on ${p.layer}`) && p.d.v <= v.drill.v) out.push(issue('error', 'pad', p.layer, `The pad on ${p.layer} is not larger than the drill.`));
    padOn.set(p.layer, p.d ? p.d.v : 0);
  }
  for (const w of [v.entry, v.exit]) if (!(padOn.get(w) > 0)) out.push(issue('error', 'pad', w, `The signal layer ${w} needs a pad.`));
  const planeSet = new Set(v.planes);
  for (const id of v.planes) {
    const i = cu(id, 'plane');
    if (i === a || i === b) out.push(issue('error', 'plane', id, `${id} is a signal layer and cannot be a plane.`));
    if (i >= iS && i <= iE && !v.antipads.some((p) => p.layer === id)) out.push(issue('error', 'antipad', id, `The barrel passes the plane ${id} without an antipad.`));
  }
  const anti = new Map<string, number>();
  for (const p of v.antipads) {
    if (!planeSet.has(p.layer)) out.push(issue('error', 'antipad', p.layer, `An antipad is on ${p.layer}, which is not a plane.`));
    if (anti.has(p.layer)) out.push(issue('error', 'antipad', p.layer, `Two antipads on ${p.layer}.`));
    if (!num(p.d, `The antipad on ${p.layer}`)) continue;
    anti.set(p.layer, p.d.v);
    const pad = padOn.get(p.layer) ?? 0;
    if (p.d.v <= Math.max(pad, v.drill.v)) out.push(issue('error', 'antipad', p.layer, `The antipad on ${p.layer} does not clear the ${pad > 0 ? 'pad' : 'drill'}: the via would short to the plane.`));
    if (p.shape !== 'round' && !v.pitch) out.push(issue('error', 'antipad', p.layer, 'An oblong or joined antipad is for a pair.'));
    if (p.shape === 'joined' && !(p.bridge && num(p.bridge, `The bridge on ${p.layer}`))) out.push(issue('error', 'antipad', p.layer, 'A joined antipad needs the bridge width.'));
  }
  let maxPad = v.drill.v;
  for (const d of padOn.values()) maxPad = Math.max(maxPad, d);
  if (v.pitch && num(v.pitch, 'The pitch') && v.pitch.v <= maxPad) out.push(issue('error', 'pitch', 'pitch', 'The two vias’ pads overlap: the pitch must exceed the largest pad.'));
  if (v.backdrill) {
    const bd = v.backdrill;
    const z = stackZ(s);
    if (num(bd.depth, 'The backdrill depth') && num(bd.d, 'The backdrill diameter')) {
      if (bd.d.v <= v.drill.v) out.push(issue('error', 'backdrill', 'backdrill', 'The backdrill must be wider than the drill.'));
      const limit = bd.side === 'top' ? z[0] - z[Math.min(a, b)] : z[Math.max(a, b) + 1];
      if (bd.depth.v >= limit) out.push(issue('error', 'backdrill', 'backdrill', `The backdrill reaches the signal layer (it may go at most ${+limit.toFixed(4)} mm deep).`));
    }
  }
  const centres = v.pitch ? [0, v.pitch.v] : [0];
  v.returns.forEach((r, k) => {
    const w = `return via ${k + 1}`;
    if (!num(r.drill, `The drill of ${w}`) || !Number.isFinite(r.x?.v) || !Number.isFinite(r.y?.v)) return;
    if (r.pad && !num(r.pad, `The pad of ${w}`)) return;
    const rr = (r.pad ? r.pad.v : r.drill.v) / 2;
    for (const p of r.planes) if (!planeSet.has(p)) out.push(issue('error', 'return', w, `${w} joins ${p}, which is not a plane.`));
    for (const cy of centres) {
      const d = Math.hypot(r.x.v, r.y.v - cy);
      if (d <= rr + maxPad / 2) out.push(issue('error', 'return', w, `${w} overlaps the signal via.`));
      else for (const p of r.planes) {
        const ap = anti.get(p);
        if (ap !== undefined && d - rr < ap / 2) out.push(issue('warn', 'return', w, `The antipad on ${p} cuts into ${w}.`));
      }
    }
  });
  v.feeds.forEach((f, k) => {
    if (f.layer !== v.entry && f.layer !== v.exit) out.push(issue('error', 'feed', `feed ${k + 1}`, 'A feed trace is on the entry or the exit layer.'));
    num(f.length, `The length of feed ${k + 1}`);
    if (!Number.isFinite(f.angle)) out.push(issue('error', 'number', `feed ${k + 1}`, 'The feed’s direction is not a number.'));
  });
  return out;
}

export function sameVia(a: ViaStructure | null, b: ViaStructure | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.start !== b.start || a.end !== b.end || a.entry !== b.entry || a.exit !== b.exit) return false;
  if (!sameVal(a.drill, b.drill) || !sameVal(a.plating, b.plating) || !sameVal(a.pitch, b.pitch)) return false;
  if (a.planes.length !== b.planes.length || a.planes.some((p, i) => p !== b.planes[i])) return false;
  if (a.pads.length !== b.pads.length || a.pads.some((p, i) => p.layer !== b.pads[i].layer || !sameVal(p.d, b.pads[i].d))) return false;
  if (a.antipads.length !== b.antipads.length || a.antipads.some((p, i) => {
    const q = b.antipads[i];
    return p.layer !== q.layer || p.shape !== q.shape || !sameVal(p.d, q.d) || !sameVal(p.bridge, q.bridge);
  })) return false;
  const bd = a.backdrill;
  const be = b.backdrill;
  if (!!bd !== !!be || (bd && (bd.side !== be.side || !sameVal(bd.depth, be.depth) || !sameVal(bd.d, be.d)))) return false;
  if (a.returns.length !== b.returns.length || a.returns.some((r, i) => {
    const q = b.returns[i];
    return !sameVal(r.x, q.x) || !sameVal(r.y, q.y) || !sameVal(r.drill, q.drill) || !sameVal(r.pad, q.pad) || r.planes.length !== q.planes.length || r.planes.some((p, j) => p !== q.planes[j]);
  })) return false;
  return a.feeds.length === b.feeds.length && a.feeds.every((f, i) => f.layer === b.feeds[i].layer && f.angle === b.feeds[i].angle && sameVal(f.length, b.feeds[i].length));
}
