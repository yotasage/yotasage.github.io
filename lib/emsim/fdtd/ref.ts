// The small f64 reference kernel (step M6.1, docs/em-sim/fullwave.md §8, §10): plain Yee updates over a problem's
// arrays (the spike's kernels in yee.mts, written out once), with the conformal edges (the H update takes E·f on
// them) and the ports' sources. No CPML: it steps closed (PEC box) problems only; M6.2's CPU backend adds the ψ
// updates, DFTs, TDR, snapshots and the energy stop.
// Order of one step n: H (n − ½ → n + ½), E (n → n + 1) with the sources at t = (n + ½)·Δt.
// Energy: W = Σ εr·V_E·Eⁿ·Eⁿ⁺¹ + Σ V_H·(H̃ⁿ⁺½)² (V_E = edge length × dual face, V_H = face × dual length, E before and
// after the E update), which the Yee scheme keeps exactly on a lossless problem without conformal edges or sources.

import { pulseAt } from './ports';
import type { Problem } from './problem';

export class RefKernel {
  readonly p: Problem;
  E: Float64Array; H: Float64Array; Eprev: Float64Array;
  step = 0;
  sources: boolean;
  private save: Float64Array;
  constructor(p: Problem, sources = true) {
    if (p.precision !== 'f64') throw new Error('The reference kernel needs an f64 problem.');
    if (p.mesh.x.cpml || p.mesh.y.cpml || p.mesh.z.cpml) throw new Error('The reference kernel steps closed problems only (no CPML).');
    this.p = p;
    this.E = p.E as Float64Array; this.H = p.H as Float64Array;
    this.Eprev = new Float64Array(this.E.length);
    this.save = new Float64Array(p.mat.cut.length);
    this.sources = sources;
  }
  run(steps: number): void {
    const { nx, ny, nz, N, lines } = this.p;
    const ca = this.p.mat.ca as Float64Array, cb = this.p.mat.cb as Float64Array;
    const kxE = lines.subarray(0, nx), kyE = lines.subarray(nx, nx + ny), kzE = lines.subarray(nx + ny, nx + ny + nz);
    const o = nx + ny + nz;
    const kxH = lines.subarray(o, o + nx), kyH = lines.subarray(o + nx, o + nx + ny), kzH = lines.subarray(o + nx + ny, o + nx + ny + nz);
    const E = this.E, H = this.H, sy = nx, sz = nx * ny;
    const cut = this.p.mat.cut, frac = this.p.mat.frac;
    for (let s = 0; s < steps; s++) {
      for (let q = 0; q < cut.length; q++) { this.save[q] = E[cut[q]]; E[cut[q]] *= frac[q]; }
      for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) {
        let c = sy * j + sz * k;
        for (let i = 0; i < nx - 1; i++, c++) {
          const ex = E[c], ey = E[N + c], ez = E[2 * N + c];
          H[c] -= kyH[j] * (E[2 * N + c + sy] - ez) - kzH[k] * (E[N + c + sz] - ey);
          H[N + c] -= kzH[k] * (E[c + sz] - ex) - kxH[i] * (E[2 * N + c + 1] - ez);
          H[2 * N + c] -= kxH[i] * (E[N + c + 1] - ey) - kyH[j] * (E[c + sy] - ex);
        }
      }
      for (let q = 0; q < cut.length; q++) E[cut[q]] = this.save[q];
      this.Eprev.set(E);
      for (let k = 1; k < nz; k++) for (let j = 1; j < ny; j++) {
        let c = 1 + sy * j + sz * k;
        for (let i = 1; i < nx; i++, c++) {
          const hx = H[c], hy = H[N + c], hz = H[2 * N + c];
          E[c] = ca[c] * E[c] + cb[c] * (kyE[j] * (hz - H[2 * N + c - sy]) - kzE[k] * (hy - H[N + c - sz]));
          E[N + c] = ca[N + c] * E[N + c] + cb[N + c] * (kzE[k] * (hx - H[c - sz]) - kxE[i] * (hz - H[2 * N + c - 1]));
          E[2 * N + c] = ca[2 * N + c] * E[2 * N + c] + cb[2 * N + c] * (kxE[i] * (hy - H[N + c - 1]) - kyE[j] * (hx - H[c - sy]));
        }
      }
      if (this.sources) {
        const vs = pulseAt(this.p.pulse, (this.step + 0.5) * this.p.dt);
        for (const pt of this.p.ports.slice(0, 1)) for (let q = 0; q < pt.edges.length; q++) E[pt.edges[q]] += pt.src[q] * vs;
      }
      this.step++;
    }
  }
  /** W of the header (arbitrary units: mm³·(V/m)²). */
  energy(): number {
    const { nx, ny, nz, N, gx, gy, gz } = this.p;
    const cb = this.p.mat.cb as Float64Array;
    const d = (g: Float64Array, i: number) => (i <= g.length - 2 ? g[i + 1] - g[i] : 0);
    const dd = (g: Float64Array, i: number) => (i >= 1 && i <= g.length - 2 ? (g[i + 1] - g[i - 1]) / 2 : 0);
    let w = 0;
    const E = this.E, H = this.H, P = this.Eprev;
    for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const c = i + nx * (j + ny * k);
      for (let a = 0; a < 3; a++) {
        const e = a * N + c;
        if (cb[e] > 0) {
          const v = a === 0 ? d(gx, i) * dd(gy, j) * dd(gz, k) : a === 1 ? dd(gx, i) * d(gy, j) * dd(gz, k) : dd(gx, i) * dd(gy, j) * d(gz, k);
          w += (v / cb[e]) * P[e] * E[e];
        }
        const vh = a === 0 ? dd(gx, i) * d(gy, j) * d(gz, k) : a === 1 ? d(gx, i) * dd(gy, j) * d(gz, k) : d(gx, i) * d(gy, j) * dd(gz, k);
        w += vh * H[e] * H[e];
      }
    }
    return w;
  }
}
