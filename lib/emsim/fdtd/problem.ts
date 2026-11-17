// The assembled full-wave problem (step M6.1): from a Setup, the model (model.ts), the graded mesh (mesh.ts), Δt, the
// 1D update factors with the CPML's κ folded in, the materials (materials.ts), the CPML (cpml.ts), the ports
// (ports.ts) and the zeroed fields and port record, in the run's precision (f32; f64 for the harness's reference).
// The estimator (estimate.ts) runs on the mesh first and its verdicts are returned; nothing is allocated when a rule
// refuses (unless `force`). Arrays follow the spike's layout (docs/em-sim/fullwave.md §9.1).

import { buildModel, C0_MM, HMIN } from './model';
import type { Model, ModelOptions, Note } from './model';
import { buildMesh, gridOf, minCell } from './mesh';
import type { Mesh } from './mesh';
import { buildMaterials } from './materials';
import type { FArray, Materials } from './materials';
import { buildCpml } from './cpml';
import type { Cpml } from './cpml';
import { buildPorts, pulseOf } from './ports';
import type { Port, Pulse } from './ports';
import { estimate, OVERHEAD, RECORD_PER_PORT, RING, verdicts } from './estimate';
import type { Env, Estimate, Offer, Verdict } from './estimate';
import type { Setup } from '../setup';

export interface ProblemOptions extends ModelOptions {
  precision?: 'f32' | 'f64';
  closed?: boolean; // PEC box instead of CPML (tiny reference cases)
  loads?: boolean; // the ports' resistors in CA, CB (default true)
  env?: Env; // the refusal rules' environment (default WebGPU without limits)
  rate?: number;
  force?: boolean; // allocate even when refused
  allocate?: boolean; // false: model, mesh and estimate only
}
export interface Problem {
  model: Model; mesh: Mesh;
  nx: number; ny: number; nz: number; N: number;
  gx: Float64Array; gy: Float64Array; gz: Float64Array;
  dt: number; precision: 'f32' | 'f64';
  lines: FArray; // [kxE(nx) kyE(ny) kzE(nz) kxH(nx) kyH(ny) kzH(nz)], c0Δt/(κ·Δ)
  mat: Materials; cpml: Cpml; ports: Port[]; pulse: Pulse;
  E: FArray; H: FArray; record: FArray;
}
export interface Built {
  ok: boolean; model: Model; mesh: Mesh | null; est: Estimate | null;
  verdicts: Verdict[]; offer: Offer | null; notes: Note[]; problem: Problem | null;
}

export function buildProblem(setup: Setup, kind: 'trace' | 'via', opt: ProblemOptions = {}): Built {
  const model = buildModel(setup, kind, opt);
  if (opt.closed) model.open = { x: false, y: false, z: false };
  const notes = [...model.notes];
  const fail = (): Built => ({ ok: false, model, mesh: null, est: null, verdicts: [], offer: null, notes, problem: null });
  if (notes.some((n) => n.level === 'error')) return fail();
  let mesh = buildMesh(model);
  // ports at least 5 cells from the CPML: widen the margins until they are
  for (let tries = 0; tries < 4 && (model.open.x || model.open.y); tries++) {
    const short = portCellsToCpml(model, mesh) < 5;
    if (!short) break;
    for (const k of ['x', 'y'] as const) { model.extent[k][0] -= 2 * model.hmax; model.extent[k][1] += 2 * model.hmax; }
    mesh = buildMesh(model);
  }
  notes.push(...mesh.notes);
  const n: [number, number, number] = [mesh.x.lines.length + 1, mesh.y.lines.length + 1, mesh.z.lines.length + 1];
  const mc: [number, number, number] = [minCell(mesh.x), minCell(mesh.y), minCell(mesh.z)];
  const bytes = opt.precision === 'f64' ? 8 : 4;
  const est = estimate({ n, cpml: [mesh.x.cpml, mesh.y.cpml, mesh.z.cpml], minCell: mc, ports: model.ports.length, trMin: model.trMin, path: model.path, bytes, rate: opt.rate });
  const v = verdicts(est, opt.env ?? { backend: 'webgpu' }, limitsOf(model, mesh));
  const refused = v.verdicts.some((x) => x.level === 'refuse');
  const out: Built = { ok: !refused, model, mesh, est, verdicts: v.verdicts, offer: v.offer, notes, problem: null };
  if ((refused && !opt.force) || opt.allocate === false) return out;
  out.problem = allocate(model, mesh, est.dt, opt);
  return out;
}

/** The fewest cells between a port (or its farther measurement plane) and the CPML's inner face. */
export function portCellsToCpml(m: Model, mesh: Mesh): number {
  let best = Infinity;
  for (const p of m.ports) {
    const a = p.axis === 'y' ? mesh.y : mesh.x;
    if (!a.cpml) continue;
    const L = a.lines, lo = L[a.cpml], hi = L[L.length - 1 - a.cpml];
    for (const x of [p.pos]) {
      let cLo = 0, cHi = 0;
      for (let i = 0; i < L.length; i++) { if (L[i] > lo + 1e-12 && L[i] <= x + 1e-12) cLo++; if (L[i] >= x - 1e-12 && L[i] < hi - 1e-12) cHi++; }
      best = Math.min(best, cLo, cHi);
    }
  }
  return best;
}

function allocate(model: Model, mesh: Mesh, dt: number, opt: ProblemOptions): Problem {
  const A = opt.precision === 'f64' ? Float64Array : Float32Array;
  const gx = gridOf(mesh.x), gy = gridOf(mesh.y), gz = gridOf(mesh.z);
  const nx = gx.length, ny = gy.length, nz = gz.length, N = nx * ny * nz;
  const mat = buildMaterials(model, mesh, dt, A);
  const cpml = buildCpml(model, mesh, dt, A);
  const c0dt = C0_MM * dt;
  const lines = new A(2 * (nx + ny + nz));
  let o = 0;
  for (const [g, kap] of [[gx, cpml.x.kapE], [gy, cpml.y.kapE], [gz, cpml.z.kapE]] as const) {
    const n = g.length;
    for (let i = 0; i < n; i++) lines[o + i] = c0dt / ((i >= 1 && i <= n - 2 ? (g[i + 1] - g[i - 1]) / 2 : g[1] - g[0]) * kap[i]);
    o += n;
  }
  for (const [g, kap] of [[gx, cpml.x.kapH], [gy, cpml.y.kapH], [gz, cpml.z.kapH]] as const) {
    const n = g.length;
    for (let i = 0; i < n; i++) lines[o + i] = c0dt / ((i <= n - 2 ? g[i + 1] - g[i] : g[n - 1] - g[n - 2]) * kap[i]);
    o += n;
  }
  const loads = opt.loads !== false;
  const ports = buildPorts(model, mesh, dt, loads ? mat.ca : null, loads ? mat.cb : null);
  return {
    model, mesh, nx, ny, nz, N, gx, gy, gz, dt, precision: opt.precision ?? 'f32', lines, mat, cpml, ports, pulse: pulseOf(model.trMin),
    E: new A(3 * N), H: new A(3 * N), record: new A(RING * ports.length * RECORD_PER_PORT),
  };
}

/** The coarser-mesh offer's limits of a model and mesh (estimate.ts `verdicts`). */
export function limitsOf(model: Model, mesh: Mesh): { drill?: number; hBarrel?: number; thinnest: number; hZ: number } {
  const thinnest = Math.min(...model.dielectric.map((d) => d.z1 - d.z0).filter((t) => t >= 2 * HMIN));
  return { drill: model.drill || undefined, hBarrel: model.blocks.x[0]?.h, thinnest, hZ: minCell(mesh.z) };
}

/** The verdicts of a built problem again for another environment or rate (the calibration, the backend's choice):
 *  the estimate's time at `rate` and §11.4's rules. */
export function judge(b: Built, env: Env, rate: number): { ok: boolean; est: Estimate; verdicts: Verdict[]; offer: Offer | null } {
  const e = b.est!;
  const est: Estimate = { ...e, rate, seconds: (e.cells * e.steps * OVERHEAD) / rate };
  const v = verdicts(est, env, limitsOf(b.model, b.mesh!));
  return { ok: !v.verdicts.some((x) => x.level === 'refuse'), est, verdicts: v.verdicts, offer: v.offer };
}

/** Allocates a problem built with `allocate: false` (job.ts decides the backend and calibrates first). */
export function allocateBuilt(b: Built, opt: ProblemOptions = {}): Problem {
  if (!b.problem) b.problem = allocate(b.model, b.mesh!, b.est!.dt, opt);
  return b.problem;
}

/** Bytes of every typed array the problem holds (what the estimator's memory is checked against). */
export function allocatedBytes(p: Problem): number {
  let b = p.E.byteLength + p.H.byteLength + p.mat.ca.byteLength + p.mat.cb.byteLength + p.lines.byteLength + p.record.byteLength;
  b += p.mat.cut.byteLength + p.mat.frac.byteLength + p.mat.hcut.byteLength + p.mat.harea.byteLength;
  for (const a of p.cpml.coef) b += a.byteLength;
  for (const a of p.cpml.psi) b += a.byteLength;
  for (const q of p.ports) {
    b += q.edges.byteLength + q.src.byteLength + q.aR.byteLength;
    for (const pr of [...q.v, ...q.i]) b += pr.idx.byteLength + pr.coef.byteLength;
  }
  return b;
}
