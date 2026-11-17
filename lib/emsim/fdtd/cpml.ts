// CPML set-up (step M6.1, docs/em-sim/fullwave.md §5): CPML_CELLS cells on each open side (the last mesh cell
// continued), polynomial grading of order 3 for σ and κ, σmax = 0.8·(m + 1)/(η0·Δ·√εr) with εr of the material that
// runs into the CPML at that height (the board's layers on the sides), κmax = 4, α linear from 0.05 S/m at the inner
// face to 0 at the outer face; the outer face is PEC. Coefficients of the recursive convolution (Roden & Gedney):
// b = exp(−(σ/κ + α)·Δt/ε0), c = σ·(b − 1)/(σκ + κ²α). κ is folded into the mesh's 1D update factors (problem.ts);
// ψ lives only in the six slabs, 2 E and 2 H components per slab cell.

import { ETA0 } from './model';
import type { Model } from './model';
import { gridOf } from './mesh';
import type { Mesh } from './mesh';
import { column } from './model';
import type { FArray, FCtor } from './materials';

export const CPML_ORDER = 3;
export const KAPPA_MAX = 4;
export const ALPHA_MAX = 0.05; // S/m
export const EPS0 = 1 / (ETA0 * 299792458); // F/m

export interface CpmlAxis {
  cells: number; // per side (0: closed)
  depthE: Float64Array; depthH: Float64Array; // ρ ∈ [0, 1] at E nodes and H half nodes (−1 outside the CPML)
  sig0E: Float64Array; sig0H: Float64Array; // σ at εr = 1 (S/m)
  kapE: Float64Array; kapH: Float64Array; // κ (1 outside)
  alpE: Float64Array; alpH: Float64Array; // α (S/m)
}
export interface Cpml {
  x: CpmlAxis; y: CpmlAxis; z: CpmlAxis;
  erNode: Float64Array; erHalf: Float64Array; // εr at z nodes and half nodes (the side slabs' σ scale)
  coef: FArray[]; // b and c tables (see `tables`), in the run's precision
  psi: FArray[]; // 4 per open slab: [E1, E2, H1, H2]
  slabCells: number; // cells of all slabs (a corner counts in each slab it is in)
}

/** The profile of one axis. */
export function cpmlAxis(lines: Float64Array, g: Float64Array, cells: number): CpmlAxis {
  const n = g.length;
  const mk = () => new Float64Array(n);
  const ax: CpmlAxis = { cells, depthE: mk().fill(-1), depthH: mk().fill(-1), sig0E: mk(), sig0H: mk(), kapE: mk().fill(1), kapH: mk().fill(1), alpE: mk(), alpH: mk() };
  if (!cells) return ax;
  const iIn0 = 1 + cells, iIn1 = n - 1 - cells; // inner faces (grid indices)
  const d0 = g[iIn0] - g[1], d1 = g[n - 1] - g[iIn1];
  const dLo = (g[2] - g[1]) * 1e-3, dHi = (g[n - 1] - g[n - 2]) * 1e-3; // m
  const set = (x: number, i: number, depth: Float64Array, sig: Float64Array, kap: Float64Array, alp: Float64Array) => {
    let rho = -1, D = 0;
    if (x < g[iIn0] - 1e-12) { rho = (g[iIn0] - x) / d0; D = dLo; }
    else if (x > g[iIn1] + 1e-12) { rho = (x - g[iIn1]) / d1; D = dHi; }
    if (rho < 0) return;
    rho = Math.min(1, rho);
    const smax = (0.8 * (CPML_ORDER + 1)) / (ETA0 * D);
    const p = rho ** CPML_ORDER;
    depth[i] = rho; sig[i] = smax * p; kap[i] = 1 + (KAPPA_MAX - 1) * p; alp[i] = ALPHA_MAX * (1 - rho);
  };
  for (let i = 1; i < n; i++) {
    set(g[i], i, ax.depthE, ax.sig0E, ax.kapE, ax.alpE);
    if (i < n - 1) set((g[i] + g[i + 1]) / 2, i, ax.depthH, ax.sig0H, ax.kapH, ax.alpH);
  }
  void lines;
  return ax;
}

/** b and c for σ, κ, α and Δt. */
export function cpmlBC(sig: number, kap: number, alp: number, dt: number): [number, number] {
  const b = Math.exp(-(sig / kap + alp) * (dt / EPS0));
  const den = sig * kap + kap * kap * alp;
  return [b, den > 0 ? (sig * (b - 1)) / den : 0];
}

/** The open slabs' cell count of a mesh (per side: cells × the cross-section of the grid). */
export function slabCellsOf(n: [number, number, number], cells: [number, number, number]): number {
  return 2 * (cells[0] * n[1] * n[2] + cells[1] * n[0] * n[2] + cells[2] * n[0] * n[1]);
}
/** Entries of the b, c tables: x and y slabs per (position along the axis, z node or half): 8 tables of n_a·nz;
 *  z slabs: 4 of nz. */
export function tableEntries(n: [number, number, number], cells: [number, number, number]): number {
  return (cells[0] ? 8 * n[0] * n[2] : 0) + (cells[1] ? 8 * n[1] * n[2] : 0) + (cells[2] ? 4 * n[2] : 0);
}

/** The CPML of a mesh: profiles, the b, c tables and zeroed ψ arrays. Tables per side axis a ∈ {x, y}, in order
 *  [bE(z node), cE(z node), bE(z half), cE(z half), bH(z node), cH(z node), bH(z half), cH(z half)], index i + n_a·k;
 *  z axis: [bE, cE, bH, cH], index k. */
export function buildCpml(m: Model, mesh: Mesh, dt: number, A: FCtor): Cpml {
  const col = column(m, 0);
  return cpmlOf(mesh, dt, A, (zz) => { for (const p of col) if (zz >= p.z0 && zz < p.z1) return p.er; return 1; });
}

/** The CPML of a mesh with the εr of the material at each height that scales the side slabs' σ (`buildCpml` takes it
 *  from the model's column; the harness's hand-made boxes give their own). */
export function cpmlOf(mesh: Pick<Mesh, 'x' | 'y' | 'z'>, dt: number, A: FCtor, erAt: (z: number) => number): Cpml {
  const gx = gridOf(mesh.x), gy = gridOf(mesh.y), gz = gridOf(mesh.z);
  const n: [number, number, number] = [gx.length, gy.length, gz.length];
  const cells: [number, number, number] = [mesh.x.cpml, mesh.y.cpml, mesh.z.cpml];
  const x = cpmlAxis(mesh.x.lines, gx, cells[0]), y = cpmlAxis(mesh.y.lines, gy, cells[1]), z = cpmlAxis(mesh.z.lines, gz, cells[2]);
  const erNode = new Float64Array(n[2]), erHalf = new Float64Array(n[2]);
  for (let k = 0; k < n[2]; k++) { erNode[k] = erAt(gz[k]); erHalf[k] = k + 1 < n[2] ? erAt((gz[k] + gz[k + 1]) / 2) : erNode[k]; }
  const coef: FArray[] = [];
  for (const [ax, na] of [[x, n[0]], [y, n[1]]] as const) {
    if (!ax.cells) continue;
    const t = Array.from({ length: 8 }, () => new A(na * n[2]));
    for (let k = 0; k < n[2]; k++) for (let i = 0; i < na; i++) {
      const o = i + na * k;
      for (const [h, s, kp, al, base] of [[0, ax.sig0E, ax.kapE, ax.alpE, 0], [1, ax.sig0H, ax.kapH, ax.alpH, 4]] as const) {
        void h;
        for (const [half, er] of [[0, erNode[k]], [1, erHalf[k]]] as const) {
          const [b, c] = cpmlBC(s[i] / Math.sqrt(er), kp[i], al[i], dt);
          t[base + 2 * half][o] = b; t[base + 2 * half + 1][o] = c;
        }
      }
    }
    coef.push(...t);
  }
  if (z.cells) {
    const t = Array.from({ length: 4 }, () => new A(n[2]));
    for (let k = 0; k < n[2]; k++) {
      const [bE, cE] = cpmlBC(z.sig0E[k], z.kapE[k], z.alpE[k], dt), [bH, cH] = cpmlBC(z.sig0H[k], z.kapH[k], z.alpH[k], dt);
      t[0][k] = bE; t[1][k] = cE; t[2][k] = bH; t[3][k] = cH;
    }
    coef.push(...t);
  }
  const psi: FArray[] = [];
  const per = [cells[0] * n[1] * n[2], cells[1] * n[0] * n[2], cells[2] * n[0] * n[1]];
  for (let a = 0; a < 3; a++) if (cells[a]) for (let side = 0; side < 2; side++) for (let q = 0; q < 4; q++) psi.push(new A(per[a]));
  return { x, y, z, erNode, erHalf, coef, psi, slabCells: slabCellsOf(n, cells) };
}
