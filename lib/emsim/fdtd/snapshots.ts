// Field snapshots for the animation (step M6.2b, docs/em-sim/fullwave.md §7.3): up to 6 slices through the mesh, each of
// one field component (Ex, Ey, Ez on its edges, or |E| at the nodes; the spec's, or the slice's own since M7.1b, so one
// plane can be taken twice) every k steps of the first excitation, each frame
// quantised to int8 with an f32 scale per slice (u8 for |E|), the run's largest |value| per slice kept for a fixed
// colour scale. On conformal edges the value is f·E (the edge's voltage per cell length; E itself may be several times
// larger in the narrow gap, notes-M6.2a.md). The slices cover the mesh inside the CPML, with their coordinates (mm).
// The memory is planned before the run (`snapPlan`: frames × cells, at most 64 MiB, the frame count lowered to fit)
// and the frames are taken out as they come (`drain`), so the worker can transfer them.

import type { Problem } from './problem';
import { MiB } from './estimate';

export type SnapComp = 'Ex' | 'Ey' | 'Ez' | 'E';
export interface SliceSpec { normal: 'x' | 'y' | 'z'; at: number; comp?: SnapComp } // mm; comp: this slice's own (M7.1b)
export interface SnapSpec { comp: SnapComp; slices: SliceSpec[]; frames?: number; budget?: number } // frames ≤ 300 by default, budget bytes
export interface SliceInfo {
  comp: SnapComp; // the component taken on this slice
  normal: 'x' | 'y' | 'z'; at: number; // the plane actually used (a node, or an edge's middle for the normal component)
  nu: number; nv: number; // samples along the slice's two axes (u, v: x, y, z less the normal, in order); data[iu + nu·iv]
  u: Float32Array; v: Float32Array; // their coordinates, mm
}
export interface Frame { step: number; t: number; data: (Int8Array | Uint8Array)[]; scale: Float32Array } // value = q·scale
export interface SnapPlan { comp: SnapComp; slices: SliceInfo[]; every: number; frames: number; frameBytes: number; bytes: number }

export const SNAP_FRAMES = 300;
export const SNAP_BUDGET = 64 * MiB;
export const MAX_SLICES = 6;
const AX = { x: 0, y: 1, z: 2 } as const;

interface Gather { idx: Int32Array; mul: Float32Array | null } // per sample one edge (a component) or 6 (|E|: 2 per axis)

/** The slices and the frame interval for a run of `steps` steps; its memory is `bytes` (frames at most `frames`). */
export function snapPlan(p: Problem, spec: SnapSpec, steps: number): SnapPlan {
  const slices = spec.slices.slice(0, MAX_SLICES).map((s) => sliceGeom(p, s.comp ?? spec.comp, s).info);
  const frameBytes = slices.reduce((a, s) => a + s.nu * s.nv + 4, 0); // 1 B a sample, the f32 scale
  const want = Math.max(1, Math.min(spec.frames ?? SNAP_FRAMES, Math.floor((spec.budget ?? SNAP_BUDGET) / frameBytes)));
  const every = Math.max(1, Math.ceil(steps / want));
  const frames = Math.floor(steps / every); // steps every, 2·every … ≤ steps
  return { comp: spec.comp, slices, every, frames, frameBytes, bytes: frames * frameBytes };
}

function sliceGeom(p: Problem, comp: SnapComp, s: SliceSpec): { info: SliceInfo; gather: Gather } {
  const g = [p.gx, p.gy, p.gz], n = [p.nx, p.ny, p.nz];
  const cells = [p.cpml.x.cells, p.cpml.y.cells, p.cpml.z.cells];
  const na = AX[s.normal], [ua, va] = [0, 1, 2].filter((a) => a !== na);
  const lo = (a: number) => 1 + cells[a], hi = (a: number) => n[a] - 1 - cells[a];
  const nearestNode = (a: number, x: number) => { let b = lo(a), bd = Infinity; for (let i = lo(a); i <= hi(a); i++) { const d = Math.abs(g[a][i] - x); if (d < bd) { bd = d; b = i; } } return b; };
  const nearestEdge = (a: number, x: number) => { let b = lo(a), bd = Infinity; for (let i = lo(a); i < hi(a); i++) { const d = Math.abs((g[a][i] + g[a][i + 1]) / 2 - x); if (d < bd) { bd = d; b = i; } } return b; };
  const ca = comp === 'E' ? -1 : AX[comp.slice(1) as 'x' | 'y' | 'z'];
  // along each in-plane axis: nodes, or edges for the component's own axis
  const range = (a: number) => (a === ca ? { i0: lo(a), m: hi(a) - lo(a), mid: true } : { i0: lo(a), m: hi(a) - lo(a) + 1, mid: false });
  const ru = range(ua), rv = range(va);
  const k = na === ca ? nearestEdge(na, s.at) : nearestNode(na, s.at);
  const at = na === ca ? (g[na][k] + g[na][k + 1]) / 2 : g[na][k];
  const coord = (a: number, r: { i0: number; m: number; mid: boolean }) => Float32Array.from({ length: r.m }, (_, q) => (r.mid ? (g[a][r.i0 + q] + g[a][r.i0 + q + 1]) / 2 : g[a][r.i0 + q]));
  const info: SliceInfo = { comp, normal: s.normal, at, nu: ru.m, nv: rv.m, u: coord(ua, ru), v: coord(va, rv) };
  const N = p.N, cell = (ijk: number[]) => ijk[0] + p.nx * (ijk[1] + p.ny * ijk[2]);
  const per = ca >= 0 ? 1 : 6;
  const idx = new Int32Array(ru.m * rv.m * per);
  const frac = new Map<number, number>();
  for (let q = 0; q < p.mat.cut.length; q++) frac.set(p.mat.cut[q], p.mat.frac[q]);
  const mul = new Float32Array(idx.length);
  let cut = false;
  for (let iv = 0; iv < rv.m; iv++) for (let iu = 0; iu < ru.m; iu++) {
    const ijk = [0, 0, 0];
    ijk[na] = k; ijk[ua] = ru.i0 + iu; ijk[va] = rv.i0 + iv;
    const o = (iu + ru.m * iv) * per;
    if (ca >= 0) idx[o] = ca * N + cell(ijk);
    else for (let a = 0; a < 3; a++) { const m = ijk.slice(); idx[o + 2 * a] = a * N + cell(m); m[a] -= 1; idx[o + 2 * a + 1] = a * N + cell(m); }
    for (let q = o; q < o + per; q++) { const f = frac.get(idx[q]); mul[q] = f ?? 1; if (f !== undefined) cut = true; }
  }
  return { info, gather: { idx, mul: cut ? mul : null } };
}

/** Takes the frames of a plan during a run (`take` after every step; step 0 is not a frame). */
export class SnapRecorder {
  readonly plan: SnapPlan;
  readonly max: Float64Array; // per slice, the run's largest |value|
  count = 0; bytes = 0;
  private gathers: Gather[];
  private out: Frame[] = [];
  private buf: Float64Array;

  constructor(p: Problem, spec: SnapSpec, steps: number) {
    this.plan = snapPlan(p, spec, steps);
    this.gathers = spec.slices.slice(0, MAX_SLICES).map((s) => sliceGeom(p, s.comp ?? spec.comp, s).gather);
    this.max = new Float64Array(this.gathers.length);
    this.buf = new Float64Array(Math.max(1, ...this.plan.slices.map((s) => s.nu * s.nv)));
  }

  take(p: Problem, step: number): void {
    const pl = this.plan;
    if (step === 0 || step % pl.every || this.count >= pl.frames) return;
    this.fill(p.E, this.gathers, step, p.dt);
  }

  /** The edges of E every frame reads, all slices in order (the GPU gathers them, gpu.ts). */
  gatherIndex(): Int32Array {
    const out = new Int32Array(this.gathers.reduce((a, G) => a + G.idx.length, 0));
    let o = 0;
    for (const G of this.gathers) { out.set(G.idx, o); o += G.idx.length; }
    return out;
  }

  /** A frame from the values of `gatherIndex()`'s edges (the GPU's gather), at `step` (a frame step of the plan). */
  takeGathered(values: ArrayLike<number>, step: number, dt: number): void {
    if (this.count >= this.plan.frames) return;
    if (!this.local) {
      let o = 0;
      this.local = this.gathers.map((G) => { const idx = Int32Array.from(G.idx, (_, q) => o + q); o += G.idx.length; return { idx, mul: G.mul }; });
    }
    this.fill(values, this.local, step, dt);
  }

  private local: Gather[] | null = null;

  private fill(E: ArrayLike<number>, gathers: Gather[], step: number, dt: number): void {
    const pl = this.plan;
    const data: (Int8Array | Uint8Array)[] = [], scale = new Float32Array(gathers.length);
    gathers.forEach((G, s) => {
      const m = pl.slices[s].nu * pl.slices[s].nv, b = this.buf, idx = G.idx, mul = G.mul, signed = pl.slices[s].comp !== 'E';
      let mx = 0;
      if (signed) {
        for (let q = 0; q < m; q++) { const x = mul ? E[idx[q]] * mul[q] : E[idx[q]]; b[q] = x; const ax = x < 0 ? -x : x; if (ax > mx) mx = ax; }
      } else {
        for (let q = 0; q < m; q++) {
          let s2 = 0;
          for (let a = 0; a < 3; a++) {
            const e0 = 6 * q + 2 * a;
            const x = mul ? (E[idx[e0]] * mul[e0] + E[idx[e0 + 1]] * mul[e0 + 1]) / 2 : (E[idx[e0]] + E[idx[e0 + 1]]) / 2;
            s2 += x * x;
          }
          const x = Math.sqrt(s2); b[q] = x; if (x > mx) mx = x;
        }
      }
      const sc = mx > 0 ? mx / (signed ? 127 : 255) : 1;
      const d = signed ? new Int8Array(m) : new Uint8Array(m);
      const inv = 1 / sc;
      for (let q = 0; q < m; q++) d[q] = Math.round(b[q] * inv);
      data.push(d); scale[s] = sc;
      if (mx > this.max[s]) this.max[s] = mx;
    });
    this.out.push({ step, t: step * dt, data, scale });
    this.count++;
    this.bytes += data.reduce((a, d) => a + d.byteLength, 0) + scale.byteLength;
  }

  /** The frames taken since the last call (the worker transfers them). */
  drain(): Frame[] { const f = this.out; this.out = []; return f; }
}
