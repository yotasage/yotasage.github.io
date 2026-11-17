// The full-wave solver's structure as 3D geometry (step M6.1, docs/em-sim/fullwave.md §2–§6), framework-free: what
// the mesh must hold (fixed lines, uniform barrel blocks, cell counts across traces and dielectrics), the copper (layer
// regions, barrels), the material columns, the ports with their feed lines, and the extent with its margins.
//
// Frame: mm, z up as stackZ (0 at the board's bottom). A trace section runs along +y from the port at y = 0 to the port
// at y = length, x across (the section's u). A via is in the board frame of via.ts (via A at the origin).
// Copper: layers with t ≥ HMIN are volumes between their faces, thinner ones sheets on their mid-plane (§3). A trace's
// trapezoid is meshed as the rectangle of its mean width (base less one etch offset), so its edges are mesh lines.
// Materials are columns in z that depend on (x, y) only through three bits (outer copper under a solder mask on top or
// bottom, a backdrilled hole): `column(m, v)`. Inside a sheet's thickness each half takes its neighbour dielectric (§3).

import { etchOffset, fillSide, layerIndex, stackZ } from '../stackup';
import type { CopperLayer, DielectricLayer, MaskLayer, Stackup } from '../stackup';
import { arrangement } from '../structure';
import type { Structure } from '../structure';
import type { ViaStructure } from '../via';
import { barrelsOf } from '../viaGeom';
import { feedStructure } from '../viamodel';
import { solveSetup } from '../lines';
import type { Setup } from '../setup';

export const HMIN = 0.02; // mm, smallest cell (§2)
export const RATIO = 1.3; // neighbour cells (§2)
export const COURANT = 0.95; // of the 3D limit (§2)
export const CPML_CELLS = 8; // §5
export const C0_MM = 299792458e3; // mm/s
export const ETA0 = 376.730313412; // Ω (as closedform.ts)
export const F_TAN = 1e9; // Hz: tanδ's frequency when the stackup states none (§3)
export const TR_MIN = 35e-12; // s, the default smallest rise time (viamodel.ts VIA_TR)
export const BARREL_CELLS = 6; // cells per drill diameter (§4)

/** A trapezoid's sides (M6.2b): the x edges of a rect moved outwards by d, linear from d0 at z0 to d1 at z1 (clamped). */
export interface Taper { z0: number; z1: number; d0: number; d1: number }
export type Shape = { k: 'rect'; x0: number; x1: number; y0: number; y1: number; tx?: Taper } | { k: 'disk'; x: number; y: number; r0: number; r1: number };
/** The outward shift of a tapered rect's x edges at z (0 without a taper or z). */
export function taperAt(t: Taper | undefined, z: number | undefined): number {
  if (!t || z === undefined) return 0;
  const u = t.z1 === t.z0 ? 0 : Math.min(1, Math.max(0, (z - t.z0) / (t.z1 - t.z0)));
  return t.d0 + (t.d1 - t.d0) * u;
}
export interface CuLayer {
  id: string; index: number; zb: number; zt: number;
  sheet: boolean; z: number; // a sheet's plane (NaN for a volume)
  plane: boolean; openings: Shape[]; // a plane: copper everywhere but the openings
  shapes: Shape[]; // copper added (traces, feeds, pads)
}
export interface Cyl { x: number; y: number; r: number; z0: number; z1: number; name: string }
export interface Drill { x: number; y: number; r: number; z0: number; z1: number }
export interface Piece { z0: number; z1: number; er: number; g: number } // g = σ/ε0 (1/s)
export interface Fixed { c: number; rank: 0 | 1 | 2; why: string } // 0 copper, 1 interface, 2 port plane or centre
export interface Span { a: number; b: number; n: number; why: string } // at least n cells in [a, b]
export interface Block { lo: number; hi: number; h: number } // uniform cells of h
export interface Note { level: 'error' | 'warning' | 'info'; code: string; message: string }

export type PortRef = { kind: 'plane'; z: number; layer: string } | { kind: 'coplanar'; gaps: [number, number][] };
export interface PortSpec {
  name: string;
  axis: 'x' | 'y'; // the feed line runs along this axis
  pos: number; // the port's coordinate along it
  dir: 1 | -1; // from the port towards the structure
  across: [number, number]; // the trace's edges on the other axis
  centre: number;
  layer: string; zb: number; zt: number; sheet: boolean;
  zSig: number; // the trace's face towards its reference (a sheet: its plane)
  ref: PortRef;
  z0: number; eeff: number; // the feed's line (2D solver): R of the port, εeff
  feed: number; // L of §6
  planes: [number, number]; // measurement planes along the axis (at L/3 and 2L/3 from the port)
}
export interface Outer { layer: CuLayer; zL: number; t: number; mask: { er: number; g: number; onLam: number; onCu: number } | null; up: boolean }
export interface Model {
  kind: 'trace' | 'via';
  stackup: Stackup; zs: Float64Array; thick: number;
  cu: CuLayer[]; cyl: Cyl[]; drilled: Drill[];
  outerTop: Outer | null; outerBottom: Outer | null;
  dielectric: { z0: number; z1: number; er: number; id: string }[];
  erMax: number; trMin: number; hmax: number;
  extent: { x: [number, number]; y: [number, number]; z: [number, number] };
  open: { x: boolean; y: boolean; z: boolean };
  fixed: { x: Fixed[]; y: Fixed[]; z: Fixed[] };
  spans: { x: Span[]; y: Span[]; z: Span[] };
  blocks: { x: Block[]; y: Block[] };
  drill: number; // smallest barrel drill (0 for a trace)
  ports: PortSpec[];
  path: { len: number; er: number }[]; // the longest port-to-port path (mm, εeff) for τrt (§11.1)
  margins: { side: number; vert: number };
  notes: Note[];
}
export interface ModelOptions {
  trMin?: number; // s
  length?: number; // a trace section's length (mm); default 2·L of §6
  z0?: number[]; // the ports' R in the order of the ports' lines, instead of the 2D solver (harness speed)
  eeff?: number[];
  thirds?: boolean; // a trace section's signal edges by the thirds rule (default true, M6.2b); false: lines on the edges
}

const lossOf = (l: DielectricLayer | MaskLayer): number => {
  const t = l.tand?.v;
  return t > 0 ? 2 * Math.PI * (l.freq ?? F_TAN) * l.er.v * t : 0;
};

/** The largest cell (§2): λ/15 in the highest εr at f_hi = 0.877/tr_min. */
export function largestCell(trMin: number, erMax: number): number {
  return C0_MM / ((0.877 / trMin) * Math.sqrt(erMax)) / 15;
}

export const TRACE_CELLS = 4; // cells across a trace (§2)
/** openEMS's thirds rule (§2) for a trace's edges x0 < x1: lines h/3 inside and 2h/3 outside each edge with
 *  h = (x1 − x0)/(TRACE_CELLS + 2/3), so TRACE_CELLS cells of h lie between the inner lines and a cell of h straddles
 *  each edge (the strip's field singularity makes a line on the edge act about h/3 wider). Lines in ascending order:
 *  [x0 − 2h/3, x0 + h/3, x1 − h/3, x1 + 2h/3]; null when an edge is not finite or h is under HMIN. */
export function thirdsOf(x0: number, x1: number): { lines: [number, number, number, number]; h: number } | null {
  if (!Number.isFinite(x0) || !Number.isFinite(x1) || x1 <= x0) return null;
  const h = (x1 - x0) / (TRACE_CELLS + 2 / 3);
  if (h < HMIN) return null;
  return { lines: [x0 - (2 * h) / 3, x0 + h / 3, x1 - h / 3, x1 + (2 * h) / 3], h };
}

/** The feed length L of §6 (mm). */
export const feedLength = (h: number, w: number): number => Math.max(1.5, 10 * h, 5 * w);

/** The model of a setup: the trace section ('trace') or the via with its feeds ('via'). */
export function buildModel(setup: Setup, kind: 'trace' | 'via', opt: ModelOptions = {}): Model {
  const s = setup.stackup;
  const z = stackZ(s);
  const thick = z[0];
  const notes: Note[] = [];
  const trMin = opt.trMin ?? TR_MIN;
  const m: Model = {
    kind, stackup: s, zs: z, thick, cu: [], cyl: [], drilled: [], outerTop: null, outerBottom: null, dielectric: [],
    erMax: 1, trMin, hmax: 0, extent: { x: [0, 0], y: [0, 0], z: [0, 0] }, open: { x: true, y: true, z: true },
    fixed: { x: [], y: [], z: [] }, spans: { x: [], y: [], z: [] }, blocks: { x: [], y: [] }, drill: 0, ports: [], path: [],
    margins: { side: 0, vert: 0 }, notes,
  };
  const cuIdx: number[] = [];
  s.layers.forEach((l, i) => {
    if (l.kind === 'dielectric') { m.dielectric.push({ z0: z[i + 1], z1: z[i], er: l.er.v, id: l.id }); m.erMax = Math.max(m.erMax, l.er.v); }
    if (l.kind === 'mask') m.erMax = Math.max(m.erMax, l.er.v);
    if (l.kind === 'copper') cuIdx.push(i);
  });
  m.hmax = largestCell(trMin, m.erMax);
  const cuOf = new Map<string, CuLayer>();
  for (const i of cuIdx) {
    const zb = z[i + 1], zt = z[i], sheet = zt - zb < HMIN;
    const c: CuLayer = { id: s.layers[i].id, index: i, zb, zt, sheet, z: sheet ? (zb + zt) / 2 : NaN, plane: false, openings: [], shapes: [] };
    m.cu.push(c); cuOf.set(c.id, c);
  }
  const masked = kind === 'trace' ? setup.trace.masked : true;
  const outer = (i: number, up: boolean): Outer => {
    const c = cuOf.get(s.layers[i].id);
    const ml = s.layers[up ? i - 1 : i + 1];
    const mk = masked && ml && ml.kind === 'mask' ? ml : null;
    return { layer: c, zL: up ? c.zb : c.zt, t: c.zt - c.zb, up, mask: mk ? { er: mk.er.v, g: lossOf(mk), onLam: mk.onLaminate.v, onCu: mk.onCopper.v } : null };
  };
  if (cuIdx.length) { m.outerTop = outer(cuIdx[0], true); m.outerBottom = outer(cuIdx[cuIdx.length - 1], false); }

  // z: copper faces (rank 0 where the model has copper on the layer, set after the copper is placed), interfaces.
  // a sheet's faces are not interfaces: its halves take the neighbours' εr, which meet on its plane (§3)
  const eff = (zz: number) => { for (const c of m.cu) if (c.sheet && (Math.abs(zz - c.zb) < 1e-12 || Math.abs(zz - c.zt) < 1e-12)) return c.z; return zz; };
  for (const d of m.dielectric) { m.fixed.z.push({ c: eff(d.z0), rank: 1, why: `${d.id} bottom` }, { c: eff(d.z1), rank: 1, why: `${d.id} top` }); }
  const signalLayers = new Set<string>();
  let wMax = 0;
  let solved: ReturnType<typeof solveSetup> | null = null;
  const lineZ = (k: number, n: number, st: Structure): { z0: number; eeff: number } => {
    if (opt.z0 && opt.z0[k] > 0) return { z0: opt.z0[k], eeff: opt.eeff?.[k] ?? 3 };
    const r = st === setup.trace ? (solved ??= solveSetup(setup)) : solveSetup({ ...setup, trace: st });
    if (!r.ok) { notes.push({ level: 'error', code: 'line', message: `The 2D solver gives no line for a port: ${r.reason}` }); return { z0: 50, eeff: 3 }; }
    const li = r.lines[Math.min(k % Math.max(r.n, 1), r.lines.length - 1)];
    return { z0: r.n === 2 && r.pair ? r.pair.zodd.v : li.z0.v, eeff: li.eeff.v };
  };
  // The plane nearest a signal layer among the given ids (face towards the signal), or null.
  const refPlane = (sig: CuLayer, ids: string[]): { z: number; layer: string } | null => {
    let best: { z: number; layer: string } | null = null, bd = Infinity;
    for (const id of ids) {
      const p = cuOf.get(id);
      if (!p || p === sig) continue;
      const below = p.index > sig.index;
      const zf = p.sheet ? p.z : below ? p.zt : p.zb;
      const d = Math.abs(zf - (sig.sheet ? sig.z : below ? sig.zb : sig.zt));
      if (d < bd) { bd = d; best = { z: zf, layer: id }; }
    }
    return best;
  };
  const sigFace = (sig: CuLayer, zRef: number) => (sig.sheet ? sig.z : zRef < sig.zb ? sig.zb : sig.zt);
  const adjacentH = (c: CuLayer) => Math.max(...[c.index - 1, c.index + 1].map((i) => (s.layers[i]?.kind === 'dielectric' ? (s.layers[i] as DielectricLayer).t.v : 0)));

  if (kind === 'trace') {
    const st = setup.trace;
    const arr = arrangement(s, st);
    const sigs = arr.features.filter((f) => f.id > 0);
    const planeIds = [st.below, st.above].filter(Boolean);
    for (const id of planeIds) { const p = cuOf.get(id); if (p) p.plane = true; }
    // Ports need L first: h and w of the first signal.
    const edges = (f: { layer: number; a: number; b: number }) => {
      const e = etchOffset(s.layers[f.layer] as CopperLayer) / 2;
      return [Number.isFinite(f.a) ? f.a + e : -Infinity, Number.isFinite(f.b) ? f.b - e : Infinity];
    };
    let hMax = 0;
    const refs = sigs.map((f) => {
      const c = cuOf.get(s.layers[f.layer].id);
      const rp = refPlane(c, planeIds);
      hMax = Math.max(hMax, rp ? Math.abs(rp.z - sigFace(c, rp.z)) : 0, adjacentH(c));
      wMax = Math.max(wMax, f.b - f.a);
      return rp;
    });
    const L = feedLength(hMax, wMax);
    const len = opt.length ?? 2 * L;
    const Lp = Math.min(L, len / 2);
    for (const f of arr.features) {
      const c = cuOf.get(s.layers[f.layer].id);
      const [x0, x1] = edges(f);
      // the trapezoid (base on the side it was etched from, stackup.ts fillSide) on the copper's faces: the mean width
      // in the lines, the base and the narrow top by conformal fractions of the edges that cross them (thick copper only)
      const e2 = etchOffset(s.layers[f.layer] as CopperLayer) / 2;
      const up = fillSide(s, f.layer) === 'up';
      const tx = !c.sheet && e2 > 0 && opt.thirds !== false ? { z0: c.zb, z1: c.zt, d0: up ? e2 : -e2, d1: up ? -e2 : e2 } : undefined;
      c.shapes.push(tx ? { k: 'rect', x0, x1, y0: 0, y1: len, tx } : { k: 'rect', x0, x1, y0: 0, y1: len });
      const th = f.id > 0 && opt.thirds !== false ? thirdsOf(x0, x1) : null;
      if (th) for (const x of th.lines) m.fixed.x.push({ c: x, rank: 0, why: 'trace edge (thirds rule)' });
      else for (const x of [x0, x1]) if (Number.isFinite(x)) m.fixed.x.push({ c: x, rank: 0, why: `${f.id ? 'trace' : 'ground'} edge` });
      if (f.id > 0) {
        signalLayers.add(c.id);
        m.fixed.x.push({ c: (x0 + x1) / 2, rank: 2, why: 'trace centre' });
        m.spans.x.push(th ? { a: th.lines[1], b: th.lines[2], n: TRACE_CELLS, why: 'across a trace' } : { a: x0, b: x1, n: TRACE_CELLS, why: 'across a trace' });
      }
    }
    // gaps between features of one layer: 3 cells (pair gap, coplanar gap)
    const byLayer = new Map<number, [number, number][]>();
    for (const f of arr.features) { const e = edges(f); (byLayer.get(f.layer) ?? byLayer.set(f.layer, []).get(f.layer)).push([e[0], e[1]]); }
    for (const list of byLayer.values()) {
      list.sort((a, b) => a[0] - b[0]);
      for (let k = 1; k < list.length; k++) if (list[k][0] > list[k - 1][1]) m.spans.x.push({ a: list[k - 1][1], b: list[k][0], n: 3, why: 'across a gap' });
    }
    m.fixed.y.push({ c: 0, rank: 0, why: 'port 1 end' }, { c: len, rank: 0, why: 'port 2 end' });
    sigs.forEach((f, k) => {
      const c = cuOf.get(s.layers[f.layer].id);
      const [x0, x1] = edges(f);
      const rp = refs[k];
      let ref: PortRef;
      if (rp) ref = { kind: 'plane', z: rp.z, layer: rp.layer };
      else {
        const gr = arr.features.filter((g) => g.id === 0 && g.layer === f.layer).map(edges);
        const left = gr.filter((g) => g[1] <= x0).sort((a, b) => b[1] - a[1])[0];
        const right = gr.filter((g) => g[0] >= x1).sort((a, b) => a[0] - b[0])[0];
        const gaps: [number, number][] = [];
        if (left) gaps.push([left[1], x0]);
        if (right) gaps.push([x1, right[0]]);
        if (!gaps.length) notes.push({ level: 'error', code: 'reference', message: `Trace ${f.id} has no reference plane or coplanar ground for its ports.` });
        ref = { kind: 'coplanar', gaps };
      }
      const zSig = ref.kind === 'plane' ? sigFace(c, ref.z) : c.sheet ? c.z : c.zb;
      const lz = lineZ(k, sigs.length, st);
      for (const [end, pos, dir] of [[1, 0, 1], [2, len, -1]] as const) {
        const planes: [number, number] = [pos + (dir * Lp) / 3, pos + (2 * dir * Lp) / 3];
        m.ports.push({ name: `${sigs.length > 1 ? `T${f.id}.` : ''}${end}`, axis: 'y', pos, dir, across: [x0, x1], centre: (x0 + x1) / 2, layer: c.id, zb: c.zb, zt: c.zt, sheet: c.sheet, zSig, ref, z0: lz.z0, eeff: lz.eeff, feed: Lp, planes });
        for (const p of planes) m.fixed.y.push({ c: p, rank: 2, why: 'measurement plane' });
      }
      if (ref.kind === 'plane') m.spans.z.push({ a: Math.min(zSig, ref.z), b: Math.max(zSig, ref.z), n: 4, why: 'trace to its plane' });
    });
    m.path.push({ len, er: Math.max(...m.ports.map((p) => p.eeff)) });
    m.margins = { side: Math.max(1, 5 * hMax), vert: Math.max(1, 10 * hMax) };
    const fin = arr.features.flatMap(edges).filter(Number.isFinite);
    const xs = fin.length ? fin : [0];
    if (arr.wall > 0) { m.extent.x = [-arr.wall, arr.wall]; m.open.x = false; }
    else m.extent.x = [Math.min(...xs) - m.margins.side, Math.max(...xs) + m.margins.side];
    m.extent.y = [-m.margins.side, len + m.margins.side];
  } else {
    const v: ViaStructure = setup.via;
    const B = barrelsOf(v);
    const rd = v.drill.v / 2;
    m.drill = v.drill.v;
    const iS = layerIndex(s, v.start), iE = layerIndex(s, v.end);
    let zb0 = z[iE + 1], zb1 = z[iS];
    const bd = v.backdrill && v.backdrill.depth?.v > 0 && v.backdrill.d?.v > 0 ? v.backdrill : null;
    const rb = bd ? Math.max(bd.d.v / 2, rd) : 0;
    let zc = bd ? (bd.side === 'top' ? thick - bd.depth.v : bd.depth.v) : NaN;
    if (bd) { // within HMIN of a layer face: on it (nothing thinner than a cell is meshed, §2)
      let best = NaN;
      for (let i = 0; i < z.length; i++) if (Math.abs(z[i] - zc) < HMIN && !(Math.abs(z[i] - zc) >= Math.abs(best - zc))) best = z[i];
      if (Number.isFinite(best) && best !== zc) { notes.push({ level: 'info', code: 'backdrill-depth', message: `The backdrill ends on the layer face ${(Math.abs(best - zc) * 1000).toFixed(1)} µm away.` }); zc = best; }
    }
    if (bd) {
      if (bd.side === 'top') zb1 = Math.min(zb1, zc); else zb0 = Math.max(zb0, zc);
      for (const b of B) m.drilled.push(bd.side === 'top' ? { x: b.x, y: b.y, r: rb, z0: zc, z1: thick + 1 } : { x: b.x, y: b.y, r: rb, z0: -1, z1: zc });
      m.fixed.z.push({ c: zc, rank: 0, why: 'backdrill depth' });
    }
    B.forEach((b, k) => m.cyl.push({ x: b.x, y: b.y, r: rd, z0: zb0, z1: zb1, name: B.length > 1 ? (k ? 'B' : 'A') : 'barrel' }));
    const zr0 = m.cu.length ? m.cu[m.cu.length - 1].zb : 0, zr1 = m.cu.length ? m.cu[0].zt : thick;
    const drilledAt = (c: CuLayer) => !!bd && (bd.side === 'top' ? (c.zb + c.zt) / 2 > zc : (c.zb + c.zt) / 2 < zc);
    const inBarrel = (c: CuLayer) => c.index >= iS && c.index <= iE;
    // pads
    const padOf = new Map(v.pads.map((p) => [p.layer, p.d ? p.d.v / 2 : 0]));
    let reach = rd;
    for (const c of m.cu) {
      const pr = inBarrel(c) ? padOf.get(c.id) ?? 0 : 0;
      if (pr > 0) { reach = Math.max(reach, pr); for (const b of B) c.shapes.push({ k: 'disk', x: b.x, y: b.y, r0: drilledAt(c) ? rb : 0, r1: pr }); }
    }
    // planes and antipads
    for (const id of v.planes) {
      const c = cuOf.get(id);
      if (!c) continue;
      c.plane = true;
      const ap = inBarrel(c) || drilledAt(c) ? v.antipads.find((a) => a.layer === id && a.d?.v > 0) : undefined;
      if (!ap) continue;
      const r = ap.d.v / 2;
      reach = Math.max(reach, r);
      for (const b of B) c.openings.push({ k: 'disk', x: b.x, y: b.y, r0: 0, r1: r });
      if (v.pitch) {
        const p = v.pitch.v;
        if (ap.shape === 'oblong') c.openings.push({ k: 'rect', x0: -r, x1: r, y0: 0, y1: p });
        else if (ap.shape === 'joined' && ap.bridge?.v > 0) c.openings.push({ k: 'rect', x0: -ap.bridge.v / 2, x1: ap.bridge.v / 2, y0: 0, y1: p });
      }
    }
    // return vias: through the copper, with their pads on their planes
    v.returns.forEach((r, k) => {
      if (!Number.isFinite(r.x?.v) || !Number.isFinite(r.y?.v) || !(r.drill?.v > 0)) return;
      const R = r.drill.v / 2;
      m.cyl.push({ x: r.x.v, y: r.y.v, r: R, z0: zr0, z1: zr1, name: `return ${k + 1}` });
      const near = Math.min(...B.map((b) => Math.hypot(r.x.v - b.x, r.y.v - b.y)));
      reach = Math.max(reach, near + Math.max(R, r.pad?.v > 0 ? r.pad.v / 2 : 0));
      if (r.pad?.v > 0) for (const id of r.planes) cuOf.get(id)?.shapes.push({ k: 'disk', x: r.x.v, y: r.y.v, r0: 0, r1: r.pad.v / 2 });
    });
    // the barrel block: d/6 per axis, aligned so the feeds' edges and a pair's second barrel are on its lines
    const w = setup.trace.w.v;
    wMax = w;
    const feeds = v.feeds.filter((f) => cuOf.has(f.layer) && Number.isFinite(f.angle));
    const dirs = feeds.map((f) => {
      const q = Math.round(f.angle / 90);
      if (Math.abs(f.angle - 90 * q) > 1e-6) notes.push({ level: 'warning', code: 'feed-angle', message: `The feed on ${f.layer} at ${f.angle}° runs along the nearest axis (${(((90 * q) % 360) + 360) % 360}°) in the full-wave mesh.` });
      const a = (q * Math.PI) / 2;
      return { dx: Math.round(Math.cos(a)), dy: Math.round(Math.sin(a)) };
    });
    let h0 = v.drill.v / BARREL_CELLS;
    if (h0 < HMIN) { notes.push({ level: 'warning', code: 'barrel-cells', message: `A drill of ${v.drill.v} mm has fewer than ${BARREL_CELLS} cells of the smallest cell ${HMIN} mm.` }); h0 = HMIN; }
    h0 = Math.min(h0, m.hmax);
    const fit = (len: number, mMin: number) => len / Math.max(mMin, Math.ceil(len / h0 - 1e-9));
    const along = (ax: 'x' | 'y') => dirs.some((d) => (ax === 'x' ? d.dy !== 0 : d.dx !== 0)); // feeds whose edges are lines on ax
    const hx = along('x') ? fit(w / 2, 2) : h0;
    const hy = v.pitch ? (along('y') ? Math.min(fit(w / 2, 2), fit(v.pitch.v, 1)) : fit(v.pitch.v, 1)) : along('y') ? fit(w / 2, 2) : h0;
    if (v.pitch && along('y') && Math.abs(v.pitch.v / hy - Math.round(v.pitch.v / hy)) > 1e-6) notes.push({ level: 'info', code: 'pitch-off-grid', message: 'The second barrel of the pair is off the block lines.' });
    const Rx = Math.ceil((reach + 2 * hx) / hx - 1e-9) * hx, Ry = Math.ceil((reach + 2 * hy) / hy - 1e-9) * hy;
    const yHi = v.pitch ? v.pitch.v : 0;
    m.blocks.x.push({ lo: -Rx, hi: Rx, h: hx });
    m.blocks.y.push({ lo: -Ry, hi: yHi + Ry, h: hy });
    // feeds, ports
    let hMax = 0;
    let feedLen = 0;
    const ports: PortSpec[] = [];
    const lzOf = new Map<string, { z0: number; eeff: number; ref: { z: number; layer: string } | null }>();
    feeds.forEach((f, fi) => {
      const c = cuOf.get(f.layer);
      let fsr = feedStructure(s, setup.trace, f.layer);
      if (typeof fsr === 'string') {
        // not the trace's layer or its mirror: a single trace of its width between the via's nearest planes there
        const ab = v.planes.map((id) => cuOf.get(id)).filter((p) => p && p !== c);
        const above = ab.filter((p) => p.index < c.index).sort((a, b) => b.index - a.index)[0];
        const below = ab.filter((p) => p.index > c.index).sort((a, b) => a.index - b.index)[0];
        if (!above && !below) { notes.push({ level: 'error', code: 'feed', message: fsr }); return; }
        fsr = { ...setup.trace, kind: above && below ? 'stripline' : 'microstrip', layer: f.layer, layer2: '', above: above?.id ?? '', below: below?.id ?? '', signals: [], grounds: [] };
        if (above && !below && c.index < cuIdx[cuIdx.length - 1]) fsr.kind = 'embedded';
        if (below && !above && c.index > cuIdx[0]) fsr.kind = 'embedded';
        notes.push({ level: 'info', code: 'feed-line', message: `The feed on ${f.layer} is a ${fsr.kind} of the trace's width between the via's planes.` });
      }
      const fs = fsr;
      const rp = refPlane(c, [fs.below, fs.above].filter((id) => id && v.planes.includes(id)));
      if (!rp) { notes.push({ level: 'error', code: 'reference', message: `The feed on ${f.layer} has no reference plane among the via's planes.` }); return; }
      hMax = Math.max(hMax, Math.abs(rp.z - sigFace(c, rp.z)), adjacentH(c));
      if (!lzOf.has(f.layer)) { const q = lineZ(fi, 1, fs); lzOf.set(f.layer, { ...q, ref: rp }); }
    });
    const L = feedLength(hMax, w);
    feeds.forEach((f, fi) => {
      const c = cuOf.get(f.layer);
      const q = lzOf.get(f.layer);
      if (!q) return;
      signalLayers.add(c.id);
      B.forEach((b, k) => {
        let { dx, dy } = dirs[fi];
        const o = B[1 - k];
        if (o && dx * (o.x - b.x) + dy * (o.y - b.y) > 1e-9) { dx = -dx; dy = -dy; } // towards the other via: away
        const axis: 'x' | 'y' = dx !== 0 ? 'x' : 'y';
        const d = dx !== 0 ? dx : dy;
        const R = axis === 'x' ? Rx : d > 0 ? Ry + yHi - b.y : Ry + b.y;
        const D = R + L;
        const o0 = axis === 'x' ? b.x : b.y, cAcross = axis === 'x' ? b.y : b.x;
        const pos = o0 + d * D;
        const [a0, a1] = [Math.min(o0, pos), Math.max(o0, pos)];
        c.shapes.push(axis === 'x' ? { k: 'rect', x0: a0, x1: a1, y0: cAcross - w / 2, y1: cAcross + w / 2 } : { k: 'rect', x0: cAcross - w / 2, x1: cAcross + w / 2, y0: a0, y1: a1 });
        const across: [number, number] = [cAcross - w / 2, cAcross + w / 2];
        const other = axis === 'x' ? m.fixed.y : m.fixed.x;
        other.push({ c: across[0], rank: 0, why: 'feed edge' }, { c: across[1], rank: 0, why: 'feed edge' }, { c: cAcross, rank: 2, why: 'feed centre' });
        (axis === 'x' ? m.spans.y : m.spans.x).push({ a: across[0], b: across[1], n: 4, why: 'across a feed' });
        const mine = axis === 'x' ? m.fixed.x : m.fixed.y;
        const planes: [number, number] = [pos - (d * L) / 3, pos - (2 * d * L) / 3];
        mine.push({ c: pos, rank: 0, why: 'feed end' }, { c: planes[0], rank: 2, why: 'measurement plane' }, { c: planes[1], rank: 2, why: 'measurement plane' });
        const ref: PortRef = { kind: 'plane', z: q.ref.z, layer: q.ref.layer };
        const zSig = sigFace(c, q.ref.z);
        ports.push({ name: `${f.layer === v.entry ? 'entry' : f.layer === v.exit ? 'exit' : f.layer}${B.length > 1 ? (k ? ' B' : ' A') : ''}`, axis, pos, dir: (-d) as 1 | -1, across, centre: cAcross, layer: c.id, zb: c.zb, zt: c.zt, sheet: c.sheet, zSig, ref, z0: q.z0, eeff: q.eeff, feed: L, planes });
        m.spans.z.push({ a: Math.min(zSig, q.ref.z), b: Math.max(zSig, q.ref.z), n: 4, why: 'feed to its plane' });
        feedLen = Math.max(feedLen, D);
      });
    });
    m.ports = ports;
    // the path: entry feed, the barrel between the signal layers, exit feed
    const ze = cuOf.get(v.entry), zx = cuOf.get(v.exit);
    const zLo = Math.min(ze?.zb ?? 0, zx?.zb ?? 0), zHi = Math.max(ze?.zt ?? 0, zx?.zt ?? 0);
    let acc = 0, accEr = 0;
    for (const d of m.dielectric) { const o = Math.max(0, Math.min(zHi, d.z1) - Math.max(zLo, d.z0)); acc += o; accEr += o * d.er; }
    const eFeed = Math.max(1, ...ports.map((p) => p.eeff));
    m.path.push({ len: feedLen, er: eFeed }, { len: zHi - zLo, er: acc > 0 ? accEr / acc : 1 }, { len: feedLen, er: eFeed });
    m.margins = { side: Math.max(1, 5 * hMax), vert: Math.max(1, 10 * hMax) };
    const xs: number[] = [-Rx, Rx], ys: number[] = [-Ry, yHi + Ry];
    for (const p of ports) (p.axis === 'x' ? xs : ys).push(p.pos);
    m.extent.x = [Math.min(...xs) - m.margins.side, Math.max(...xs) + m.margins.side];
    m.extent.y = [Math.min(...ys) - m.margins.side, Math.max(...ys) + m.margins.side];
  }
  m.extent.z = [-m.margins.vert, thick + m.margins.vert];
  // copper faces: rank 0 where the layer holds copper in the model, else interfaces
  for (const c of m.cu) {
    const has = c.plane || c.shapes.length > 0 || m.cyl.some((y) => y.z0 <= c.zb + 1e-9 && y.z1 >= c.zt - 1e-9);
    if (c.sheet) m.fixed.z.push({ c: c.z, rank: has ? 0 : 1, why: `${c.id} sheet` });
    else m.fixed.z.push({ c: c.zb, rank: has ? 0 : 1, why: `${c.id} bottom` }, { c: c.zt, rank: has ? 0 : 1, why: `${c.id} top` });
  }
  for (const y of m.cyl) for (const zz of [y.z0, y.z1]) m.fixed.z.push({ c: zz, rank: 0, why: `${y.name} end` });
  // two cells across every other dielectric
  for (const d of m.dielectric) if (!m.spans.z.some((q) => q.a <= d.z0 + 1e-9 && q.b >= d.z1 - 1e-9)) m.spans.z.push({ a: eff(d.z0), b: eff(d.z1), n: 2, why: `across ${d.id}` });
  if (m.ports.length === 0) notes.push({ level: 'error', code: 'ports', message: 'The structure has no ports.' });
  if (!(m.trMin > 0)) notes.push({ level: 'error', code: 'rise', message: 'The smallest rise time must be above zero.' });
  void signalLayers;
  return m;
}

// ---------- material columns ----------

export const V_TOP = 1, V_BOTTOM = 2, V_DRILL = 4;

/** The column of materials in z for a variant (bits V_TOP / V_BOTTOM: copper under the mask there; V_DRILL: inside a
 *  backdrilled hole). Pieces sorted, not overlapping; air where none. */
export function column(m: Model, v: number): Piece[] {
  const s = m.stackup, z = m.zs;
  const out: Piece[] = [];
  const di = (i: number): DielectricLayer | null => (s.layers[i]?.kind === 'dielectric' ? (s.layers[i] as DielectricLayer) : null);
  const push = (z0: number, z1: number, er: number, g: number) => { if (z1 > z0 + 1e-15) out.push({ z0, z1, er, g }); };
  s.layers.forEach((l, i) => {
    if (l.kind === 'dielectric') push(z[i + 1], z[i], l.er.v, lossOf(l));
    if (l.kind !== 'copper') return;
    const up = di(i - 1), dn = di(i + 1);
    const zb = z[i + 1], zt = z[i];
    const o = m.outerTop && m.outerTop.layer.index === i ? m.outerTop : m.outerBottom && m.outerBottom.layer.index === i ? m.outerBottom : null;
    if (o && !(up && dn)) {
      const on = o.up ? (v & V_TOP) !== 0 : (v & V_BOTTOM) !== 0;
      const lam = o.up ? dn : up;
      const mk = o.mask;
      if (!mk) return; // air off the copper; on it the copper is PEC
      if (o.up) {
        if (on) { if (lam && zt - zb < HMIN) push(zb, (zb + zt) / 2, lam.er.v, lossOf(lam)); push(zt - zb < HMIN ? (zb + zt) / 2 : zb, zt, mk.er, mk.g); push(zt, zt + mk.onCu, mk.er, mk.g); }
        else push(zb, zb + mk.onLam, mk.er, mk.g);
      } else {
        if (on) { if (lam && zt - zb < HMIN) push((zb + zt) / 2, zt, lam.er.v, lossOf(lam)); push(zb - mk.onCu, zb, mk.er, mk.g); push(zb, zt - zb < HMIN ? (zb + zt) / 2 : zt, mk.er, mk.g); }
        else push(zt - mk.onLam, zt, mk.er, mk.g);
      }
      return;
    }
    if (!up || !dn) return;
    if (zt - zb < HMIN) { push(zb, (zb + zt) / 2, dn.er.v, lossOf(dn)); push((zb + zt) / 2, zt, up.er.v, lossOf(up)); }
    else { const f = fillSide(s, i) === 'up' ? up : dn; push(zb, zt, f.er.v, lossOf(f)); }
  });
  out.sort((a, b) => a.z0 - b.z0);
  if (v & V_DRILL) {
    const d = m.drilled[0];
    const cut: Piece[] = [];
    for (const p of out) {
      if (p.z1 <= d.z0 || p.z0 >= d.z1) { cut.push(p); continue; }
      if (p.z0 < d.z0) cut.push({ ...p, z1: d.z0 });
      if (p.z1 > d.z1) cut.push({ ...p, z0: d.z1 });
    }
    return cut;
  }
  return out;
}

/** The variant bits at board point (x, y). */
export function variantAt(m: Model, x: number, y: number): number {
  let v = 0;
  if (m.outerTop?.mask && inLayer(m.outerTop.layer, x, y)) v |= V_TOP;
  if (m.outerBottom?.mask && inLayer(m.outerBottom.layer, x, y)) v |= V_BOTTOM;
  for (const d of m.drilled) if (Math.hypot(x - d.x, y - d.y) < d.r) { v |= V_DRILL; break; }
  return v;
}

const TOL = 1e-9;
export function inShape(sh: Shape, x: number, y: number, z?: number): boolean {
  if (sh.k === 'rect') { const d = taperAt(sh.tx, z); return x >= sh.x0 - d - TOL && x <= sh.x1 + d + TOL && y >= sh.y0 - TOL && y <= sh.y1 + TOL; }
  const r = Math.hypot(x - sh.x, y - sh.y);
  return r <= sh.r1 + TOL && r >= sh.r0 - TOL;
}
/** Whether (x, y) is copper on the layer (closed: its outline counts). */
export function inLayer(c: CuLayer, x: number, y: number, z?: number): boolean {
  for (const sh of c.shapes) if (inShape(sh, x, y, z)) return true;
  if (!c.plane) return false;
  for (const o of c.openings) if (inOpen(o, x, y)) return false;
  return true;
}
function inOpen(sh: Shape, x: number, y: number): boolean {
  if (sh.k === 'rect') return x > sh.x0 + TOL && x < sh.x1 - TOL && y > sh.y0 + TOL && y < sh.y1 - TOL;
  return Math.hypot(x - sh.x, y - sh.y) < sh.r1 - TOL;
}
