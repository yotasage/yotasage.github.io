// Lumped ports, their feed lines' measurement planes and the source pulse (step M6.1, docs/em-sim/fullwave.md §6).
//
// A port is a set of parallel paths of E edges from the reference conductor to the trace at the feed's end: the z
// edges under the trace across its width down (or up) to its plane, or, without a plane, the x or y edges across the
// coplanar gaps on every mesh plane of the copper's thickness. Each path is a resistive voltage source of R·paths
// (R = the feed's Z0 from the 2D solver), spread over its edges in proportion to their length, so the field it drives
// is uniform along the path. In the E update of a path edge: CA = (1 − a)/(1 + a), CB = (1/εr)/(1 + a) with
// a = a_σ + a_R, a_R = Δt·ℓ/(2·ε0·εr·R_path·dA) (ℓ the path's length, dA the edge's dual face), and the source term
// E += src·Vs(t), src = −s·2·a_R/((1 + a)·ℓ) (s = ±1, the edge's direction from ground to trace).
// Measurement planes (two per feed, L/3 and 2L/3 from the port): v = Σ coef·E on the trace's centre column at the
// plane's line and the next one towards the structure; i = Σ coef·H̃ on the loop of H around the trace between them
// (H̃ = η0·H; coef in m/η0), positive along the feed away from the port.

import { C0_MM, ETA0 } from './model';
import type { Model, PortSpec } from './model';
import { gridOf } from './mesh';
import type { Mesh } from './mesh';
import type { FArray } from './materials';

export interface Pulse { trMin: number; fRun: number; sigma: number; t0: number } // s, Hz, s, s
/** The Gaussian pulse of §6: f_run = 1.52/tr_min (−60 dB there), σ = 3.717/(2π·f_run), peak at 5σ. */
export function pulseOf(trMin: number): Pulse {
  const fRun = 1.52 / trMin, sigma = 3.717 / (2 * Math.PI * fRun);
  return { trMin, fRun, sigma, t0: 5 * sigma };
}
export const pulseAt = (p: Pulse, t: number): number => Math.exp(-((t - p.t0) ** 2) / (2 * p.sigma * p.sigma));

export interface Probe { idx: Int32Array; coef: Float64Array } // into E (comp·N + c) or H
export interface Port {
  spec: PortSpec;
  R: number; paths: number; len: number; // Ω, number of paths, ℓ (mm)
  edges: Int32Array; src: Float64Array; aR: Float64Array; // per edge
  v: Probe[]; // [plane 1 at its line, plane 1 next line, plane 2 …, …]
  i: Probe[]; // [plane 1, plane 2], between the two lines
  lines: number[][]; // the grid indices of each plane's two lines
}

const ROUND = 1e-7;
function indexOf(g: Float64Array, x: number): number {
  let best = -1, bd = Infinity;
  for (let i = 1; i < g.length; i++) { const d = Math.abs(g[i] - x); if (d < bd) { bd = d; best = i; } }
  return best;
}
const between = (g: Float64Array, a: number, b: number) => { const out: number[] = []; for (let i = 1; i < g.length; i++) if (g[i] >= a - ROUND && g[i] <= b + ROUND) out.push(i); return out; };

/** The ports of a model on its mesh; with `ca`, `cb` (and `load`), the path edges' coefficients are set. */
export function buildPorts(m: Model, mesh: Mesh, dt: number, ca: FArray | null, cb: FArray | null): Port[] {
  const gx = gridOf(mesh.x), gy = gridOf(mesh.y), gz = gridOf(mesh.z);
  const nx = gx.length, ny = gy.length, nz = gz.length, N = nx * ny * nz;
  const cellOf = (i: number, j: number, k: number) => i + nx * (j + ny * k);
  const dual = (g: Float64Array, i: number) => (i >= 1 && i <= g.length - 2 ? (g[i + 1] - g[i - 1]) / 2 : g[1] - g[0]);
  const prim = (g: Float64Array, i: number) => g[Math.min(i + 1, g.length - 1)] - g[Math.min(i, g.length - 2)];
  const c0dt = C0_MM * dt * 1e-3; // m
  return m.ports.map((p) => {
    const along = p.axis === 'y' ? gy : gx, across = p.axis === 'y' ? gx : gy;
    const ip = indexOf(along, p.pos);
    // paths: [comp, i, j, k, sign][] each
    const paths: { comp: number; i: number; j: number; k: number; s: number; len: number }[][] = [];
    const at = (a: number, t: number) => (p.axis === 'y' ? [t, a] : [a, t]);
    const kS = indexOf(gz, p.zSig);
    if (p.ref.kind === 'plane') {
      const kR = indexOf(gz, p.ref.z);
      const [k0, k1] = [Math.min(kS, kR), Math.max(kS, kR)];
      const s = kR < kS ? 1 : -1;
      for (const t of between(across, p.across[0], p.across[1])) {
        const [i, j] = at(ip, t);
        const path = [];
        for (let k = k0; k < k1; k++) path.push({ comp: 2, i, j, k, s, len: gz[k + 1] - gz[k] });
        paths.push(path);
      }
    } else {
      const rows = p.sheet ? [kS] : between(gz, p.zb, p.zt);
      for (const [a, b] of p.ref.gaps) {
        const s = Math.abs(b - p.across[0]) < 1e-9 ? 1 : -1; // the trace on the gap's high side: ground → trace is +
        const ts = between(across, a, b);
        for (const k of rows) {
          const path = [];
          for (let q = 0; q + 1 < ts.length; q++) {
            const [i, j] = at(ip, ts[q]);
            path.push({ comp: p.axis === 'y' ? 0 : 1, i, j, k, s, len: across[ts[q] + 1] - across[ts[q]] });
          }
          paths.push(path);
        }
      }
    }
    const len = paths.length ? paths[0].reduce((a, e) => a + e.len, 0) : 0;
    const R = p.z0 * paths.length;
    const flat = paths.flat();
    const edges = new Int32Array(flat.length), src = new Float64Array(flat.length), aR = new Float64Array(flat.length);
    flat.forEach((e, q) => {
      const idx = e.comp * N + cellOf(e.i, e.j, e.k);
      const dA = e.comp === 2 ? dual(gx, e.i) * dual(gy, e.j) : e.comp === 0 ? dual(gy, e.j) * dual(gz, e.k) : dual(gx, e.i) * dual(gz, e.k);
      edges[q] = idx;
      let er = 1, aS = 0;
      if (ca && cb) { aS = (1 - ca[idx]) / (1 + ca[idx]); er = cb[idx] > 0 ? 1 / (cb[idx] * (1 + aS)) : 1; }
      const a = (c0dt * ETA0 * (len * 1e-3)) / (2 * er * R * dA * 1e-6);
      aR[q] = a;
      const at2 = aS + a;
      src[q] = (-e.s * 2 * a) / ((1 + at2) * len * 1e-3);
      if (ca && cb) { ca[idx] = (1 - at2) / (1 + at2); cb[idx] = 1 / (er * (1 + at2)); }
    });
    // measurement planes
    const it = between(across, p.across[0], p.across[1]);
    const t0 = it[0], t1 = it[it.length - 1], tc = indexOf(across, p.centre);
    const kb = p.sheet ? kS : indexOf(gz, p.zb), kt = p.sheet ? kS : indexOf(gz, p.zt);
    const v: Probe[] = [], cur: Probe[] = [], lines: number[][] = [];
    for (const pl of p.planes) {
      const a0 = indexOf(along, pl);
      const a1 = a0 + p.dir;
      lines.push([a0, a1]);
      for (const a of [a0, a1]) {
        const idx: number[] = [], coef: number[] = [];
        if (p.ref.kind === 'plane') {
          const kR = indexOf(gz, p.ref.z);
          const s = kR < kS ? 1 : -1;
          for (let k = Math.min(kS, kR); k < Math.max(kS, kR); k++) { const [i, j] = at(a, tc); idx.push(2 * N + cellOf(i, j, k)); coef.push(-s * (gz[k + 1] - gz[k]) * 1e-3); }
        } else {
          const [g0, g1] = p.ref.gaps[0];
          const s = Math.abs(g1 - p.across[0]) < 1e-9 ? 1 : -1;
          const ts = between(across, g0, g1);
          for (let q = 0; q + 1 < ts.length; q++) { const [i, j] = at(a, ts[q]); idx.push((p.axis === 'y' ? 0 : 1) * N + cellOf(i, j, kS)); coef.push(-s * (across[ts[q] + 1] - across[ts[q]]) * 1e-3); }
        }
        v.push({ idx: Int32Array.from(idx), coef: Float64Array.from(coef) });
      }
      // the loop between the two lines (H at the half index min(a0, a1))
      const ah = Math.min(a0, a1);
      const idx: number[] = [], coef: number[] = [];
      const put = (comp: number, i: number, j: number, k: number, c: number) => { idx.push(comp * N + cellOf(i, j, k)); coef.push((c * p.dir * 1e-3) / ETA0); };
      if (p.axis === 'y') {
        for (let i = t0; i <= t1; i++) { put(0, i, ah, kt, dual(gx, i)); put(0, i, ah, kb - 1, -dual(gx, i)); }
        for (let k = kb; k <= kt; k++) { put(2, t1, ah, k, -dual(gz, k)); put(2, t0 - 1, ah, k, dual(gz, k)); }
      } else {
        for (let j = t0; j <= t1; j++) { put(1, ah, j, kt, -dual(gy, j)); put(1, ah, j, kb - 1, dual(gy, j)); }
        for (let k = kb; k <= kt; k++) { put(2, ah, t1, k, dual(gz, k)); put(2, ah, t0 - 1, k, -dual(gz, k)); }
      }
      cur.push({ idx: Int32Array.from(idx), coef: Float64Array.from(coef) });
    }
    void prim;
    return { spec: p, R, paths: paths.length, len, edges, src, aR, v, i: cur, lines };
  });
}
