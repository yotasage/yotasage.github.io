// The via cut (engine.md §6.2, solver.md §5.1, step M1.6): the barrel (or a pair's two barrels) and the return vias
// as circles in the board's (x, y) plane, solved once in vacuum by the 2D boundary-element solver (free kernel with
// neutrality, conductor panels only); every barrel segment is then a homogeneous line of its dielectric layer with
// Z = Z_vac/√εr and delay ℓ·√εr/c0 (one sub-segment per layer, never an averaged εr). Circles are polygons of 32·M
// vertices placed so that the mean of the polygon's circumradius and inradius is the circle's radius.
// No Node APIs.

import { C0 as CLIGHT, DEFAULT_LEVEL, EPS0, estimateOf, solveBoundary, worse } from './bem2d';
import type { BemResult, Estimate, Status } from './bem2d';
import { conductorEdge, GRADE_FIXED, MESH_DEFAULTS } from './panels';
import type { Boundary, Edge } from './panels';
import { viaLayout } from './axisym';
import type { Stackup } from './stackup';
import type { ViaStructure } from './via';

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

// A circle of the cut (mm, the board's x and y); cond 0 = return (ground), 1, 2 = the barrels.
export interface CutCircle { x: number; y: number; r: number; cond: number }

export function cutBoundary(circles: CutCircle[], M: number): Boundary {
  const edges: Edge[] = [];
  let rmin = Infinity;
  let signals = 0;
  for (const c of circles) {
    const n = Math.max(8, Math.round(32 * M));
    const rv = (2 * c.r) / (1 + Math.cos(Math.PI / n));
    for (let k = 0; k < n; k++) {
      const a0 = (2 * Math.PI * k) / n, a1 = (2 * Math.PI * (k + 1)) / n;
      edges.push(conductorEdge(c.x + rv * Math.cos(a0), c.y + rv * Math.sin(a0), c.x + rv * Math.cos(a1), c.y + rv * Math.sin(a1), c.cond, 1, GRADE_FIXED, 1));
    }
    rmin = Math.min(rmin, c.r);
    signals = Math.max(signals, c.cond);
  }
  const h0 = 0.2 * rmin;
  const D = MESH_DEFAULTS;
  return { kernel: { kind: 'free' }, signals, edges, h0, dNear: D.nearPerH0 * h0, mNear: D.mNear, rho: D.rho, X: 0, zShift: 0, flip: false };
}

// Vacuum line values of the cut (per metre): single: Z_vac; pair: Zc = C0⁻¹/c0 and from it Zdiff, Zcm (definition
// A), Zodd = Zdiff/2, Zeven = 2·Zcm, and k12 = −C12/C11 (the share of a pad's excess that couples, solver.md §5.2).
export interface CutValues { z: number; zdiff: number; zcm: number; zodd: number; zeven: number; k12: number }
const cutValues = (C: ArrayLike<number>, n: number): CutValues => {
  if (n === 1) return { z: 1 / (CLIGHT * C[0]), zdiff: NaN, zcm: NaN, zodd: NaN, zeven: NaN, k12: NaN };
  const det = C[0] * C[3] - C[1] * C[2];
  const z11 = C[3] / det / CLIGHT, z22 = C[0] / det / CLIGHT, z12 = -0.5 * (C[1] + C[2]) / det / CLIGHT;
  const zdiff = z11 + z22 - 2 * z12, zcm = 0.25 * (z11 + z22 + 2 * z12);
  return { z: z11, zdiff, zcm, zodd: zdiff / 2, zeven: 2 * zcm, k12: (-0.5 * (C[1] + C[2])) / C[0] };
};

export interface CutSolution {
  ok: boolean;
  reason: string;
  n: number; // barrels
  C0: number[][]; // vacuum capacitance matrix (F/m)
  vac: CutValues; // vacuum values (Ω; scale by 1/√εr per layer)
  err: Record<keyof CutValues, Estimate>;
  status: Status;
  bem: BemResult;
  ms: number;
}

export function solveCut(circles: CutCircle[], opt: { M?: number; estimate?: boolean } = {}): CutSolution {
  const t0 = now();
  const bem = solveBoundary((M) => cutBoundary(circles, M), { M: opt.M ?? DEFAULT_LEVEL, estimate: opt.estimate });
  const keys: (keyof CutValues)[] = ['z', 'zdiff', 'zcm', 'zodd', 'zeven', 'k12'];
  if (!bem.ok) {
    const e = { e: NaN, order: NaN, status: 'unchecked' as Status };
    return { ok: false, reason: bem.reason, n: 0, C0: [], vac: null, err: Object.fromEntries(keys.map((k) => [k, e])) as any, status: 'unchecked', bem, ms: now() - t0 };
  }
  const n = bem.signals;
  const per = bem.levels.map((lv) => cutValues(lv.C0, n));
  let status: Status = bem.status;
  const err = {} as Record<keyof CutValues, Estimate>;
  for (const k of keys) {
    err[k] = n === 1 && k !== 'z' ? { e: NaN, order: NaN, status: 'unchecked' } : estimateOf(per.map((p) => p[k]));
    if (n === 2 || k === 'z') status = worse(status, err[k].status);
  }
  return { ok: true, reason: '', n, C0: bem.C0, vac: per[per.length - 1], err, status, bem, ms: now() - t0 };
}

// The coaxial wall radius with the same vacuum C′ as via 1 of the cut (the others at 0 V): a·exp(2πε0/C11), the
// axisymmetric solve's wall for M1.7 (notes-M1.6.md).
export function equivalentRadius(sol: CutSolution, a: number): number {
  return sol.ok ? a * Math.exp((2 * Math.PI * EPS0) / sol.C0[0][0]) : NaN;
}

// One homogeneous piece of the barrel between z boundaries (mm, stackZ's frame): its line values in its εr.
export interface CutSegment { zTop: number; zBot: number; er: number; z0: number; delay: number; zdiff: number; zcm: number; zodd: number; zeven: number }

export interface ViaCutResult extends CutSolution { segments: CutSegment[]; circles: CutCircle[] }

// The via's cut and its segments: cut at every slab boundary (one sub-segment per dielectric layer, the copper
// layers counted with the material filling their gaps) and at every crossing's middle, where M1.7 places ΔC.
// Return vias are taken as through the whole barrel. ring > 0 (checks): a coaxial ring of that radius as the return
// instead of the return vias. Without returns the barrel between planes is not a line: refused (M1.7 flags it).
export function viaCut(s: Stackup, v: ViaStructure, opt: { M?: number; estimate?: boolean; ring?: number } = {}): ViaCutResult {
  const L = viaLayout(s, v);
  const e: Estimate = { e: NaN, order: NaN, status: 'unchecked' };
  const empty = (reason: string): ViaCutResult => ({
    ok: false, reason, n: 0, C0: [], vac: null, err: { z: e, zdiff: e, zcm: e, zodd: e, zeven: e, k12: e }, status: 'unchecked', bem: null, ms: 0, segments: [], circles: [],
  });
  if (!L.ok) return empty(L.reason);
  const circles: CutCircle[] = [{ x: 0, y: 0, r: L.a, cond: 1 }];
  if (v.pitch) circles.push({ x: 0, y: v.pitch.v, r: L.a, cond: 2 });
  if (opt.ring > 0) circles.push({ x: 0, y: 0, r: opt.ring, cond: 0 });
  else for (const r of v.returns) circles.push({ x: r.x.v, y: r.y.v, r: r.drill.v / 2, cond: 0 });
  if (circles.length === (v.pitch ? 2 : 1) && !(opt.ring > 0)) return empty('No return via: between the planes the barrel is not a line (the via model flags it).');
  const sol = solveCut(circles, opt);
  if (!sol.ok) return { ...sol, segments: [], circles };
  const zs = new Set<number>([L.zTop, L.zBot]);
  for (const sl of L.slabs) for (const z of [sl.zLo, sl.zHi]) if (z > L.zBot + 1e-9 && z < L.zTop - 1e-9) zs.add(z);
  for (const c of L.crossings) zs.add(0.5 * (c.zLo + c.zHi));
  const pts = [...zs].sort((x, y) => y - x);
  const segments: CutSegment[] = [];
  for (let k = 0; k + 1 < pts.length; k++) {
    const zTop = pts[k], zBot = pts[k + 1];
    if (zTop - zBot < 1e-9) continue;
    const mid = 0.5 * (zTop + zBot);
    const sl = L.slabs.find((x) => mid >= x.zLo && mid < x.zHi);
    const er = sl ? sl.er : 1;
    const f = 1 / Math.sqrt(er);
    const V = sol.vac;
    segments.push({ zTop, zBot, er, z0: V.z * f, delay: ((zTop - zBot) * 1e-3 * Math.sqrt(er)) / CLIGHT, zdiff: V.zdiff * f, zcm: V.zcm * f, zodd: V.zodd * f, zeven: V.zeven * f });
  }
  return { ...sol, segments, circles };
}
