// Materials on the mesh (step M6.1, docs/em-sim/fullwave.md §3, §4): per-edge coefficients CA, CB in the spike's
// layout (E = [Ex | Ey | Ez], cell c = i + nx·(j + ny·k), ghost node 0, PEC walls on node planes 1 and n − 1), PEC
// copper as CA = CB = 0, and the conformal fractions of the edges a copper outline cuts (Yu–Mittra: the H update takes
// each such E edge times f, the length outside the copper over the edge's length; the face area stays whole).
//
// εr of an edge: z, along which the materials are layered, exactly; across, on 4 × 4 samples of the dual face (copper
// edges are mesh lines, so a trace's mask boundary halves a face exactly). Tangential to the layers (Ex, Ey): the
// arithmetic mean over the face's height, harmonic along the edge's length, arithmetic across. Normal (Ez): harmonic
// along its length, arithmetic over the face. σ likewise (parallel: arithmetic; series: σ = ε²·mean(σ/ε²), first order
// in the loss). Copper inside the averaging takes the column's own material there (it is PEC on its edges).

import { C0_MM, COURANT, column, inLayer, taperAt, variantAt } from './model';
import type { CuLayer, Cyl, Model, Piece, Shape } from './model';
import { gridOf } from './mesh';
import type { Mesh } from './mesh';

export type FArray = Float32Array | Float64Array;
export type FCtor = Float32ArrayConstructor | Float64ArrayConstructor;

export interface Materials {
  ca: FArray; cb: FArray; // 3N each
  cut: Int32Array; frac: Float64Array; // conformal edges: index into E (comp·N + c), fraction outside the copper
  hcut: Int32Array; harea: Float64Array; // H faces beside them (comp·N + c): area outside the copper over the face's (floored)
  pec: [number, number, number]; // PEC edges per component (walls and ghost excluded)
  variants: number[]; // the column variants present
}

// ---------- columns ----------
export interface Col { B: Float64Array; P: Float64Array[] } // breakpoints, prefix integrals of er, 1/er, g, g/er²
const ZINF = 1e6;
export function prepColumn(pieces: Piece[]): Col {
  const B: number[] = [-ZINF], V: [number, number][] = [];
  for (const p of pieces) {
    if (p.z0 > B[B.length - 1] + 1e-15) { V.push([1, 0]); B.push(p.z0); }
    V.push([p.er, p.g]); B.push(p.z1);
  }
  V.push([1, 0]); B.push(ZINF);
  const P = [0, 1, 2, 3].map(() => new Float64Array(B.length));
  for (let k = 0; k < V.length; k++) {
    const d = B[k + 1] - B[k], [er, g] = V[k];
    P[0][k + 1] = P[0][k] + d * er; P[1][k + 1] = P[1][k] + d / er; P[2][k + 1] = P[2][k] + d * g; P[3][k + 1] = P[3][k] + (d * g) / (er * er);
  }
  return { B: Float64Array.from(B), P };
}
/** ∫ from za to zb of er, 1/er, g, g/er² (air where no piece). */
export function colInt(c: Col, za: number, zb: number, out: Float64Array = new Float64Array(4)): Float64Array {
  const at = (z: number, q: number) => {
    const B = c.B;
    let lo = 0, hi = B.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (B[mid] <= z) lo = mid; else hi = mid; }
    const P = c.P[q];
    return P[lo] + ((P[lo + 1] - P[lo]) * (z - B[lo])) / (B[lo + 1] - B[lo]);
  };
  for (let q = 0; q < 4; q++) out[q] = at(zb, q) - at(za, q);
  return out;
}

// ---------- lines through the copper ----------
type Iv = [number, number];
function merge(iv: Iv[]): Iv[] {
  iv.sort((a, b) => a[0] - b[0]);
  const out: Iv[] = [];
  for (const v of iv) {
    if (!(v[1] > v[0])) continue;
    const l = out[out.length - 1];
    if (l && v[0] <= l[1]) l[1] = Math.max(l[1], v[1]); else out.push([v[0], v[1]]);
  }
  return out;
}
/** The intervals of the line {other = o} (along `ax`) a shape covers. */
function shapeIv(sh: Shape, ax: 'x' | 'y', o: number, out: Iv[], z?: number): void {
  if (sh.k === 'rect') {
    const d = taperAt(sh.tx, z);
    const [a0, a1, b0, b1] = ax === 'x' ? [sh.x0 - d, sh.x1 + d, sh.y0, sh.y1] : [sh.y0, sh.y1, sh.x0 - d, sh.x1 + d];
    if (o >= b0 - 1e-9 && o <= b1 + 1e-9) out.push([a0, a1]);
    return;
  }
  const [cA, cB] = ax === 'x' ? [sh.x, sh.y] : [sh.y, sh.x];
  const dd = o - cB;
  const h1 = sh.r1 * sh.r1 - dd * dd;
  if (h1 < 0) return;
  const s1 = Math.sqrt(h1);
  const h0 = sh.r0 * sh.r0 - dd * dd;
  if (sh.r0 > 0 && h0 > 0) { const s0 = Math.sqrt(h0); out.push([cA - s1, cA - s0], [cA + s0, cA + s1]); }
  else out.push([cA - s1, cA + s1]);
}
function layerIv(c: CuLayer, ax: 'x' | 'y', o: number, z?: number): Iv[] {
  const iv: Iv[] = [];
  for (const sh of c.shapes) shapeIv(sh, ax, o, iv, z);
  if (c.plane) {
    const op: Iv[] = [];
    for (const sh of c.openings) shapeIv(sh, ax, o, op);
    let x = -Infinity;
    for (const v of merge(op)) { iv.push([x, v[0]]); x = v[1]; }
    iv.push([x, Infinity]);
  }
  return iv;
}

const SUB = [0.125, 0.375, 0.625, 0.875];

export function buildMaterials(m: Model, mesh: Mesh, dt: number, A: FCtor): Materials {
  const gx = gridOf(mesh.x), gy = gridOf(mesh.y), gz = gridOf(mesh.z);
  const nx = gx.length, ny = gy.length, nz = gz.length, N = nx * ny * nz, sy = nx, sz = nx * ny;
  const ca = new A(3 * N), cb = new A(3 * N);
  // variants on the sample lattice: 4 samples per primary cell (cell i: [g[i], g[i + 1]], i = 0 … n − 2)
  const sxs = new Float64Array(4 * (nx - 1)), sys = new Float64Array(4 * (ny - 1));
  for (let i = 0; i < nx - 1; i++) for (let q = 0; q < 4; q++) sxs[4 * i + q] = gx[i] + SUB[q] * (gx[i + 1] - gx[i]);
  for (let j = 0; j < ny - 1; j++) for (let q = 0; q < 4; q++) sys[4 * j + q] = gy[j] + SUB[q] * (gy[j + 1] - gy[j]);
  const anyVar = !!(m.outerTop?.mask || m.outerBottom?.mask || m.drilled.length);
  const LX = sxs.length;
  const vgrid = new Uint8Array(LX * sys.length);
  if (anyVar) for (let b = 0; b < sys.length; b++) for (let a = 0; a < LX; a++) vgrid[a + LX * b] = variantAt(m, sxs[a], sys[b]);
  const present = [...new Set(anyVar ? vgrid : [0])].sort((a, b) => a - b);
  const vIndex = new Int8Array(8).fill(-1);
  present.forEach((v, k) => (vIndex[v] = k));
  const nv = present.length;
  // per variant and node plane: tangential (dual height of node k) and normal (k to k + 1) values
  const et = new Float64Array(nv * nz), gt = new Float64Array(nv * nz), en = new Float64Array(nv * nz), gn = new Float64Array(nv * nz);
  const tmp = new Float64Array(4);
  present.forEach((v, vi) => {
    const col = prepColumn(column(m, v));
    for (let k = 1; k < nz; k++) {
      const za = k >= 2 ? (gz[k - 1] + gz[k]) / 2 : gz[k], zb = k <= nz - 2 ? (gz[k] + gz[k + 1]) / 2 : gz[k];
      if (zb > za) { colInt(col, za, zb, tmp); et[vi * nz + k] = tmp[0] / (zb - za); gt[vi * nz + k] = tmp[2] / (zb - za); }
      else { et[vi * nz + k] = 1; gt[vi * nz + k] = 0; }
      if (k <= nz - 2) {
        const d = gz[k + 1] - gz[k];
        colInt(col, gz[k], gz[k + 1], tmp);
        const e = d / tmp[1];
        en[vi * nz + k] = e; gn[vi * nz + k] = (e * e * tmp[3]) / d;
      }
    }
  });
  // sample patterns per (i, j) and edge kind: a uniform variant index, or −1 − offset into `pat` (16 entries)
  const pat: number[] = [];
  const kinds = [new Int32Array(nx * ny), new Int32Array(nx * ny), new Int32Array(nx * ny)];
  const xsOf = (i: number, dual: boolean) => (dual ? [4 * (i - 1) + 2, 4 * (i - 1) + 3, 4 * i, 4 * i + 1] : [4 * i, 4 * i + 1, 4 * i + 2, 4 * i + 3]);
  for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
    for (let kd = 0; kd < 3; kd++) {
      if (!anyVar) { kinds[kd][i + nx * j] = 0; continue; }
      // kd 0: Ex (x along the edge, y dual), 1: Ey (x dual, y along), 2: Ez (both dual); rows: across, columns: along
      const X = xsOf(i, kd !== 0), Y = xsOf(j, kd !== 1);
      const p: number[] = [];
      for (const b of Y) for (const a of X) p.push(vIndex[vgrid[a + LX * b]]);
      if (kd === 1) { const q = p.slice(); for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) p[4 * r + c] = q[4 * c + r]; }
      kinds[kd][i + nx * j] = p.every((x) => x === p[0]) ? p[0] : -1 - pat.push(...p) + 16;
    }
  }
  const matOf = (kd: number, ij: number, k: number, out: Float64Array) => {
    const code = kinds[kd][ij];
    const E = kd === 2 ? en : et, Gq = kd === 2 ? gn : gt;
    if (code >= 0) { out[0] = E[code * nz + k]; out[1] = Gq[code * nz + k]; return; }
    const o = -1 - code;
    let se = 0, sg = 0;
    if (kd === 2) {
      for (let q = 0; q < 16; q++) { se += E[pat[o + q] * nz + k]; sg += Gq[pat[o + q] * nz + k]; }
      out[0] = se / 16; out[1] = sg / 16; return;
    }
    for (let r = 0; r < 4; r++) {
      let inv = 0, gi = 0;
      for (let c = 0; c < 4; c++) { const e = E[pat[o + 4 * r + c] * nz + k]; inv += 1 / e; gi += Gq[pat[o + 4 * r + c] * nz + k] / (e * e); }
      const eh = 4 / inv;
      se += eh; sg += (eh * eh * gi) / 4;
    }
    out[0] = se / 4; out[1] = sg / 4;
  };
  // copper per node plane (x, y edges) and per z interval (z edges)
  const TOL = 1e-9;
  const activeAt = (z: number) => ({
    L: m.cu.filter((c) => (c.sheet ? Math.abs(z - c.z) < TOL : z >= c.zb - TOL && z <= c.zt + TOL)),
    C: m.cyl.filter((c) => z >= c.z0 - TOL && z <= c.z1 + TOL),
  });
  const cylIv = (cs: Cyl[], ax: 'x' | 'y', o: number, out: Iv[]) => { for (const c of cs) shapeIv({ k: 'disk', x: c.x, y: c.y, r0: 0, r1: c.r }, ax, o, out); };
  const fx = new Float64Array(nx * ny), fy = new Float64Array(nx * ny);
  const cutI: number[] = [], cutF: number[] = [];
  const pec: [number, number, number] = [0, 0, 0];
  const mt = new Float64Array(2);
  const setE = (idx: number, er: number, g: number) => {
    const a = (g * dt) / (2 * er);
    ca[idx] = (1 - a) / (1 + a); cb[idx] = 1 / (er * (1 + a));
  };
  const sweep = (ivs: Iv[], g: Float64Array, i0: number, i1: number, put: (i: number, f: number) => void) => {
    const iv = merge(ivs);
    let p = 0;
    for (let i = i0; i <= i1; i++) {
      const a = g[i], b = g[i + 1];
      while (p < iv.length && iv[p][1] <= a) p++;
      let cov = 0;
      for (let q = p; q < iv.length && iv[q][0] < b; q++) cov += Math.min(b, iv[q][1]) - Math.max(a, iv[q][0]);
      put(i, 1 - cov / (b - a));
    }
  };
  for (let k = 1; k < nz; k++) {
    const { L, C } = activeAt(gz[k]);
    fx.fill(1); fy.fill(1);
    if (L.length || C.length) {
      for (let j = 1; j < ny; j++) {
        const iv: Iv[] = [];
        for (const c of L) iv.push(...layerIv(c, 'x', gy[j], gz[k]));
        cylIv(C, 'x', gy[j], iv);
        if (iv.length) sweep(iv, gx, 1, nx - 2, (i, f) => (fx[i + nx * j] = f));
      }
      for (let i = 1; i < nx; i++) {
        const iv: Iv[] = [];
        for (const c of L) iv.push(...layerIv(c, 'y', gx[i], gz[k]));
        cylIv(C, 'y', gx[i], iv);
        if (iv.length) sweep(iv, gy, 1, ny - 2, (j, f) => (fy[i + nx * j] = f));
      }
    }
    // z edges k → k + 1: volumes and cylinders over the interval
    const zA = gz[k], zB = k + 1 < nz ? gz[k + 1] : zA;
    const VL = m.cu.filter((c) => !c.sheet && c.zb < zB - TOL && c.zt > zA + TOL);
    const VC = m.cyl.filter((c) => c.z0 < zB - TOL && c.z1 > zA + TOL);
    for (let j = 1; j < ny; j++) for (let i = 1; i < nx; i++) {
      const c = i + sy * j + sz * k, ij = i + nx * j;
      if (i <= nx - 2 && j >= 2 && j <= ny - 2 && k >= 2 && k <= nz - 2) {
        const f = fx[ij];
        if (f < 1e-9) pec[0]++;
        else { matOf(0, ij, k, mt); setE(c, mt[0], mt[1]); if (f < 1 - 1e-9) { cutI.push(c); cutF.push(f); } }
      }
      if (i >= 2 && i <= nx - 2 && j <= ny - 2 && k >= 2 && k <= nz - 2) {
        const f = fy[ij];
        if (f < 1e-9) pec[1]++;
        else { matOf(1, ij, k, mt); setE(N + c, mt[0], mt[1]); if (f < 1 - 1e-9) { cutI.push(N + c); cutF.push(f); } }
      }
      if (i >= 2 && i <= nx - 2 && j >= 2 && j <= ny - 2 && k <= nz - 2) {
        let cov = 0;
        if (VL.length || VC.length) {
          const iv: Iv[] = [];
          for (const v of VL) if (inLayer(v, gx[i], gy[j])) iv.push([Math.max(zA, v.zb), Math.min(zB, v.zt)]);
          for (const v of VC) if (Math.hypot(gx[i] - v.x, gy[j] - v.y) <= v.r + TOL) iv.push([Math.max(zA, v.z0), Math.min(zB, v.z1)]);
          for (const v of merge(iv)) cov += v[1] - v[0];
        }
        if (cov >= 0.5 * (zB - zA)) pec[2]++;
        else { matOf(2, ij, k, mt); setE(2 * N + c, mt[0], mt[1]); }
      }
    }
  }
  const cut = Int32Array.from(cutI);
  const { hcut, harea } = faceAreas(m, cut, gx, gy, gz, C0_MM * dt, activeAt);
  return { ca, cb, cut, frac: Float64Array.from(cutF), hcut, harea, pec, variants: present };
}

const FACE_SAMPLES = 8;
/** The least area fraction a face may take (M6.4b, notes-M6.4b.md). A face of area A·d1·d2 among whole ones has a
 *  mode of its own at 1/(A·(2 − A)) times the band's top along each side it is cut across (a light H between two E
 *  in the Yee chain); with that factor on both sides, its cell (d1, d2 and the shorter cell d3 beside it) must keep
 *  the Courant number of §2, so the time step stays the one of the whole mesh. */
export function areaFloor(c0dt: number, d1: number, d2: number, d3: number): number {
  const g = ((COURANT / c0dt) ** 2 - 1 / (d3 * d3)) / (1 / (d1 * d1) + 1 / (d2 * d2));
  return g <= 1 ? 1 : 1 - Math.sqrt(1 - 1 / g);
}

/** Dey–Mittra areas (fullwave.md §4, M6.4b): every H face with a conformal edge on its rim, with the share of its area
 *  outside the copper (sampled on FACE_SAMPLES lines across it; a face in a copper face's plane counts the copper
 *  there), floored by areaFloor; faces left whole are not listed. The H update divides by it, so the magnetic side
 *  sees the same shortened edges as the electric one. */
function faceAreas(m: Model, cut: Int32Array, gx: Float64Array, gy: Float64Array, gz: Float64Array, c0dt: number,
  activeAt: (z: number) => { L: CuLayer[]; C: Cyl[] }): { hcut: Int32Array; harea: Float64Array } {
  const nx = gx.length, ny = gy.length, nz = gz.length, N = nx * ny * nz, sy = nx, sz = nx * ny;
  const faces = new Set<number>();
  const add = (comp: number, c: number) => { if (c >= 0) faces.add(comp * N + c); };
  for (const e of cut) {
    const a = Math.floor(e / N), c = e - a * N;
    // Ex: Hy (c, c − sz), Hz (c, c − sy); Ey: Hx (c, c − sz), Hz (c, c − 1); Ez: Hx (c, c − sy), Hy (c, c − 1)
    if (a === 0) { add(1, c); add(1, c - sz); add(2, c); add(2, c - sy); }
    else if (a === 1) { add(0, c); add(0, c - sz); add(2, c); add(2, c - 1); }
    else { add(0, c); add(0, c - sy); add(1, c); add(1, c - 1); }
  }
  const TOL = 1e-9;
  const covered = (ivs: Iv[], a: number, b: number) => {
    let cov = 0;
    for (const v of merge(ivs)) cov += Math.max(0, Math.min(b, v[1]) - Math.max(a, v[0]));
    return cov / (b - a);
  };
  const hcut: number[] = [], harea: number[] = [];
  for (const h of [...faces].sort((p, q) => p - q)) {
    const a = Math.floor(h / N), c = h - a * N;
    const i = c % nx, j = Math.floor(c / nx) % ny, k = Math.floor(c / sz);
    if (i >= nx - 1 && a !== 0 || j >= ny - 1 && a !== 1 || k >= nz - 1 && a !== 2) continue;
    let cov = 0;
    for (let q = 0; q < FACE_SAMPLES; q++) {
      const u = (q + 0.5) / FACE_SAMPLES, iv: Iv[] = [];
      if (a === 2) { // Hz: in the plane z = gz[k], lines along x at y samples
        const y = gy[j] + u * (gy[j + 1] - gy[j]), z = gz[k], { L, C } = activeAt(z);
        for (const cu of L) iv.push(...layerIv(cu, 'x', y, z));
        for (const cy of C) shapeIv({ k: 'disk', x: cy.x, y: cy.y, r0: 0, r1: cy.r }, 'x', y, iv);
        cov += covered(iv, gx[i], gx[i + 1]);
      } else { // Hx (plane x = gx[i], along y) or Hy (plane y = gy[j], along x), at z samples: volumes and barrels only
        const z = gz[k] + u * (gz[k + 1] - gz[k]), ax = a === 0 ? 'y' : 'x', o = a === 0 ? gx[i] : gy[j];
        for (const cu of m.cu) if (!cu.sheet && z >= cu.zb - TOL && z <= cu.zt + TOL) iv.push(...layerIv(cu, ax, o, z));
        for (const cy of m.cyl) if (z >= cy.z0 - TOL && z <= cy.z1 + TOL) shapeIv({ k: 'disk', x: cy.x, y: cy.y, r0: 0, r1: cy.r }, ax, o, iv);
        cov += a === 0 ? covered(iv, gy[j], gy[j + 1]) : covered(iv, gx[i], gx[i + 1]);
      }
    }
    const A = 1 - cov / FACE_SAMPLES;
    if (A >= 1 - 1e-9) continue;
    const g = [gx, gy, gz], n = [i, j, k], d = [0, 1, 2].map((ax) => g[ax][n[ax] + 1] - g[ax][n[ax]]);
    const g3 = g[a], k3 = n[a], d3 = Math.min(k3 >= 1 ? g3[k3] - g3[k3 - 1] : Infinity, k3 + 1 < g3.length ? g3[k3 + 1] - g3[k3] : Infinity);
    hcut.push(h); harea.push(Math.max(A, areaFloor(c0dt, d[(a + 1) % 3], d[(a + 2) % 3], d3)));
  }
  return { hcut: Int32Array.from(hcut), harea: Float64Array.from(harea) };
}
