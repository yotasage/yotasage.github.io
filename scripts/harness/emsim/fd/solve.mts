// The harness's finite-difference reference solver for 2D quasi-static lines (docs/em-sim/solver-fd.md), written for
// step M1.4a without reading the boundary-element solver (plan.md D11). Input: a cross-section of material-tagged
// polygons (the Section that lib/emsim/geometry.ts builds, or one drawn here for the exact cases). Output: the Maxwell
// matrices C and C0 of the signal conductors with Richardson extrapolation over nested grids and an error estimate.
//
// Method: a tensor-product, non-uniform grid whose lines hold every polygon coordinate (so every cell has one εr),
// graded geometrically from every corner; five-point finite volumes (= linear finite elements on right triangles,
// hence variational: C_h ≥ C on the diagonal); conductor nodes and plane lines Dirichlet; Neumann on the far box;
// conjugate gradients with a modified incomplete Cholesky preconditioner; charge by the residual at the conductor
// nodes (the reaction), which equals the energy method.

export const MU0 = 1.25663706127e-6;
export const C0 = 299792458;
export const EPS0 = 1 / (MU0 * C0 * C0);

export const OPEN_L = 1;
export const OPEN_R = 2;

export interface FdConductor { id: number; pts: ArrayLike<number>; open: number }
export interface FdRegion { er: number; pts: ArrayLike<number>; open: number }
export interface FdInput {
  signals: number;
  conductors: FdConductor[]; // id 0 = ground, 1..signals; a polygon of zero area is a zero-thickness strip
  regions: FdRegion[]; // cells not covered by any region (inside conductors) get εr 1
  planeBelow: number | null; // z of an ideal ground plane's face, or null
  planeAbove: number | null;
  ext: number; // polygons flagged open continue unchanged beyond |u| = ext
  zLo: number; // the polygons' extent in z; beyond it (no plane there) the outermost material continues
  zHi: number;
  sideWalls?: boolean; // Neumann walls at u = ±ext instead of the far box (the plate cases)
}
export interface FdOptions {
  levels?: number; // levels, each halving the spacing (default 4)
  hMinDiv?: number; // h_min = (smallest feature) / hMinDiv at level 0 (default 6)
  hMaxDiv?: number; // h_max = (smallest of width, gap, height) / hMaxDiv (default 2)
  growth?: number; // spacing ratio away from corners (default 1.3)
  growthOut?: number; // beyond the structure towards the box (default 1.4)
  boxFactor?: number; // box at boxFactor × structure size (default 200)
  tol?: number; // CG relative residual (default 1e-11)
  vacuumOnly?: boolean; // skip the dielectric solve (C = C0) for homogeneous air cases
  symmetry?: boolean; // solve a mirror-symmetric section as even and odd halves (default true)
  grading?: 'nested' | 'corner'; // how levels refine (default 'corner', see baseGrid)
}
export interface FdLevel { nu: number; nz: number; C: number[][]; C0: number[][]; iters: number; ms: number }
export interface FdResult {
  n: number;
  C: number[][]; C0: number[][]; // F/m, extrapolated
  err: { C: number[][]; C0: number[][] };
  order: number; // measured p for C11 (last triple)
  flagged: boolean; // an entry's order outside [0.8, 2.5]: that entry is the finest level with |C2 − C1| as error
  prev: { C: number[][]; C0: number[][] } | null; // the extrapolation one level coarser (four levels, all regular)
  levels: FdLevel[];
  ms: number;
}

const DEF = { grading: 'corner' as const, levels: 4, hMinDiv: 6, hMaxDiv: 2, growth: 1.3, growthOut: 1.4, boxFactor: 200, tol: 1e-11 };

// --- Geometry helpers ---

function bbox(p: ArrayLike<number>): [number, number, number, number] {
  let u0 = Infinity, u1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (let k = 0; k < p.length; k += 2) {
    if (p[k] < u0) u0 = p[k]; if (p[k] > u1) u1 = p[k];
    if (p[k + 1] < z0) z0 = p[k + 1]; if (p[k + 1] > z1) z1 = p[k + 1];
  }
  return [u0, u1, z0, z1];
}

// Inside or on the boundary (within tol) of a closed polygon; a degenerate polygon is its boundary only.
function insideOrOn(p: ArrayLike<number>, x: number, y: number, tol: number): boolean {
  const n = p.length >> 1;
  let inside = false;
  for (let a = 0, b = n - 1; a < n; b = a, a += 1) {
    const xa = p[2 * a], ya = p[2 * a + 1], xb = p[2 * b], yb = p[2 * b + 1];
    const dx = xb - xa, dy = yb - ya;
    const L2 = dx * dx + dy * dy;
    let t = L2 > 0 ? ((x - xa) * dx + (y - ya) * dy) / L2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const ex = xa + t * dx - x, ey = ya + t * dy - y;
    if (ex * ex + ey * ey <= tol * tol) return true;
    if ((ya > y) !== (yb > y) && x < xa + ((y - ya) * dx) / dy) inside = !inside;
  }
  return inside;
}

function strictlyInside(p: ArrayLike<number>, x: number, y: number): boolean {
  const n = p.length >> 1;
  let inside = false;
  for (let a = 0, b = n - 1; a < n; b = a, a += 1) {
    const xa = p[2 * a], ya = p[2 * a + 1], xb = p[2 * b], yb = p[2 * b + 1];
    if ((ya > y) !== (yb > y) && x < xa + ((y - ya) * (xb - xa)) / (yb - ya)) inside = !inside;
  }
  return inside;
}

function uniqueSorted(a: number[], tol: number): number[] {
  a.sort((x, y) => x - y);
  const out: number[] = [];
  for (const x of a) if (!out.length || x - out[out.length - 1] > tol) out.push(x);
  return out;
}

// One axis: grid lines through every key coordinate, spacing h(x) = min(hMin + (g − 1)·d, hMax) inside the span
// (d the distance to the nearest grading source), growing by gOut per cell beyond it.
function axis(keys: number[], srcs: number[], spanLo: number, spanHi: number, hMin: number, hMax: number, g: number, gOut: number): number[] {
  const h = (x: number): number => {
    let d = Infinity;
    for (let k = 0; k < srcs.length; k += 1) { const a = Math.abs(x - srcs[k]); if (a < d) d = a; }
    const inner = Math.min(hMin + (g - 1) * d, hMax);
    const out = x < spanLo ? spanLo - x : x > spanHi ? x - spanHi : 0;
    return inner + (gOut - 1) * out;
  };
  const res: number[] = [keys[0]];
  for (let k = 0; k + 1 < keys.length; k += 1) {
    const a = keys[k], b = keys[k + 1];
    // March from the end with the finer spacing (so mirror-image intervals get mirror-image cells).
    const back = h(b) < h(a);
    const len = b - a;
    const hh = back ? (t: number) => h(b - t) : (t: number) => h(a + t);
    const xs = [0];
    let x = 0;
    while (x < len) { const s0 = hh(x); x += hh(Math.min(x + 0.5 * s0, len)); xs.push(x); }
    const m = xs.length - 1;
    const nEff = m - 1 + (len - xs[m - 1]) / (xs[m] - xs[m - 1]);
    const n = Math.max(1, Math.round(nEff));
    const pts: number[] = [];
    for (let c = 1; c < n; c += 1) {
      const s = (c * nEff) / n;
      const i = Math.floor(s);
      const t = xs[i] + (s - i) * (Math.min(xs[i + 1], len) - xs[i]);
      pts.push(back ? b - t : a + t);
    }
    if (back) pts.reverse();
    res.push(...pts, b);
  }
  return res;
}

function refine(x: number[], level: number): Float64Array {
  const f = 1 << level;
  const out = new Float64Array((x.length - 1) * f + 1);
  for (let k = 0; k + 1 < x.length; k += 1) for (let s = 0; s < f; s += 1) out[k * f + s] = x[k] + ((x[k + 1] - x[k]) * s) / f;
  out[out.length - 1] = x[x.length - 1];
  return out;
}

// --- The level-0 grid ---

export interface BaseGrid { u: number[]; z: number[]; feat: number; hMin: number; hMax: number; box: number; at: (level: number) => { u: Float64Array; z: Float64Array } }

export function baseGrid(inp: FdInput, o: Required<Omit<FdOptions, 'vacuumOnly' | 'symmetry'>>, half = false): BaseGrid {
  const ext = inp.ext;
  const scale = Math.max(ext, Math.abs(inp.zHi), Math.abs(inp.zLo), 1e-3);
  const tol = 1e-9 * scale;
  const fakeU = (u: number) => !inp.sideWalls && Math.abs(u) >= ext - tol;
  const fakeZ = (z: number) => (inp.planeAbove == null && z >= inp.zHi - tol) || (inp.planeBelow == null && z <= inp.zLo + tol);
  const keysU: number[] = [], keysZ: number[] = [], srcU: number[] = [], srcZ: number[] = [];
  const add = (p: ArrayLike<number>, src: boolean) => {
    for (let k = 0; k < p.length; k += 2) {
      const u = p[k], z = p[k + 1];
      const fu = fakeU(u), fz = fakeZ(z);
      if (!fu) keysU.push(u);
      if (!fz) keysZ.push(z);
      if (src && !fu && !fz) {
        srcU.push(u);
        if (z !== inp.planeBelow && z !== inp.planeAbove) srcZ.push(z);
      }
    }
  };
  for (const c of inp.conductors) add(c.pts, true);
  for (const r of inp.regions) add(r.pts, true);
  if (inp.planeBelow != null) keysZ.push(inp.planeBelow);
  if (inp.planeAbove != null) keysZ.push(inp.planeAbove);
  if (inp.sideWalls) keysU.push(-ext, ext);
  let ku = uniqueSorted(keysU, tol), kz = uniqueSorted(keysZ, tol);
  // Smallest feature: the closest pair of grid key lines; major dimension: widths, gaps and heights of the signals.
  let feat = Infinity;
  for (const k of [ku, kz]) for (let i = 0; i + 1 < k.length; i += 1) feat = Math.min(feat, k[i + 1] - k[i]);
  let major = Infinity, thick = Infinity;
  const sig = inp.conductors.filter((c) => c.id > 0).map((c) => bbox(c.pts));
  const all = inp.conductors.map((c) => ({ id: c.id, b: bbox(c.pts), open: c.open }));
  for (const [u0, u1, z0, z1] of sig) {
    if (u1 - u0 > 0) major = Math.min(major, u1 - u0);
    if (z1 - z0 > 0) thick = Math.min(thick, z1 - z0);
    for (const o2 of all) {
      const [a0, a1, b0, b1] = o2.b;
      const A0 = o2.open & OPEN_L ? -Infinity : a0, A1 = o2.open & OPEN_R ? Infinity : a1;
      if (A0 === u0 && A1 === u1 && b0 === z0 && b1 === z1) continue; // itself
      const du = Math.max(0, A0 - u1, u0 - A1), dz = Math.max(0, b0 - z1, z0 - b1);
      const d = Math.hypot(du, dz);
      if (d > 0) major = Math.min(major, d);
    }
    if (inp.planeBelow != null && z0 > inp.planeBelow) major = Math.min(major, z0 - inp.planeBelow);
    if (inp.planeAbove != null && inp.planeAbove > z1) major = Math.min(major, inp.planeAbove - z1);
  }
  if (!(major < Infinity)) major = Math.min(ku[ku.length - 1] - ku[0], kz[kz.length - 1] - kz[0]);
  const hMax = major / o.hMaxDiv;
  // h_min from the copper's own size (closer key lines just get the cells between them); feat is reported only.
  const hMin = Math.min(thick, major) / o.hMinDiv;
  const S = Math.max(ku[ku.length - 1] - ku[0], kz[kz.length - 1] - kz[0]);
  const box = o.boxFactor * S;
  // Half (mirror-symmetric section): u ≥ 0 only, with the mirror line u = 0 as the left end.
  if (half) ku = [0, ...ku.filter((x) => x > tol)];
  const spanU0 = ku[0], spanU1 = ku[ku.length - 1], spanZ0 = kz[0], spanZ1 = kz[kz.length - 1];
  if (!inp.sideWalls) ku = half ? [...ku, spanU1 + box] : [spanU0 - box, ...ku, spanU1 + box];
  if (inp.planeBelow == null) kz = [spanZ0 - box, ...kz];
  if (inp.planeAbove == null) kz = [...kz, spanZ1 + box];
  const su = srcU.length ? uniqueSorted(srcU.map((x) => (half ? Math.abs(x) : x)), tol) : [], sz = srcZ.length ? uniqueSorted(srcZ, tol) : [];
  const u = axis(ku, su, spanU0, spanU1, hMin, hMax, o.growth, o.growthOut);
  const z = axis(kz, sz, spanZ0, spanZ1, hMin, hMax, o.growth, o.growthOut);
  // Level ℓ: 'nested' halves every cell; 'corner' halves the spacing away from corners (hMax and the growth − 1)
  // but quarters h_min, so the corner singularities (φ ~ r^λ, λ ≥ 1/2) converge at the bulk's second order.
  const at = (l: number) => {
    if (o.grading === 'nested' || l === 0) return { u: refine(u, l), z: refine(z, l) };
    const f = 2 ** -l;
    const args = [hMin * f * f, hMax * f, 1 + (o.growth - 1) * f, 1 + (o.growthOut - 1) * f] as const;
    return { u: Float64Array.from(axis(ku, su, spanU0, spanU1, ...args)), z: Float64Array.from(axis(kz, sz, spanZ0, spanZ1, ...args)) };
  };
  return { u, z, feat, hMin, hMax, box, at };
}

// --- One level: rasterise, assemble, solve ---

interface Mesh {
  nu: number; nz: number; N: number; off: number;
  cond: Int32Array; // per node: −1 free, else the conductor id (planes are 0)
  wx: Float64Array; wz: Float64Array; // edge weights (εr), wx[i]: node i to i+1; wz[i]: node i to i+nu
}

function rasterise(inp: FdInput, u: Float64Array, z: Float64Array, vacuum: boolean, er?: Float64Array): { cond: Int32Array; er: Float64Array } {
  const nu = u.length, nz = z.length;
  const ext = inp.ext;
  const scale = Math.max(ext, Math.abs(inp.zHi), Math.abs(inp.zLo), 1e-3);
  const tol = 1e-9 * scale;
  const cu = (x: number) => (inp.sideWalls ? x : Math.max(-ext * (1 - 1e-9), Math.min(ext * (1 - 1e-9), x)));
  const zl = inp.zLo + 1e-9 * scale, zh = inp.zHi - 1e-9 * scale;
  const cz = (x: number) => Math.max(zl, Math.min(zh, x));
  // Cells
  if (!er) {
    const ncu = nu - 1, ncz = nz - 1;
    er = new Float64Array(ncu * ncz).fill(NaN);
    const mu = new Float64Array(ncu), mz = new Float64Array(ncz);
    for (let i = 0; i < ncu; i += 1) mu[i] = cu(0.5 * (u[i] + u[i + 1]));
    for (let j = 0; j < ncz; j += 1) mz[j] = cz(0.5 * (z[j] + z[j + 1]));
    for (const r of inp.regions) {
      const [a0, a1, b0, b1] = bbox(r.pts);
      for (let j = 0; j < ncz; j += 1) {
        if (mz[j] < b0 || mz[j] > b1) continue;
        for (let i = 0; i < ncu; i += 1) {
          const c = i + ncu * j;
          if (er[c] === er[c] || mu[i] < a0 || mu[i] > a1) continue;
          if (strictlyInside(r.pts, mu[i], mz[j])) er[c] = r.er;
        }
      }
    }
    for (let j = 0; j < ncz; j += 1) for (let i = 0; i < ncu; i += 1) {
      const c = i + ncu * j;
      if (er[c] === er[c]) continue;
      // Not inside any region: inside a conductor, or cut by a sloped edge (staircase): take a region at a corner.
      let v = 1;
      search: for (const [fu, fz] of [[0.02, 0.02], [0.98, 0.02], [0.02, 0.98], [0.98, 0.98], [0.5, 0.02], [0.5, 0.98], [0.02, 0.5], [0.98, 0.5]]) {
        const x = cu(u[i] + fu * (u[i + 1] - u[i])), y = cz(z[j] + fz * (z[j + 1] - z[j]));
        for (const r of inp.regions) if (strictlyInside(r.pts, x, y)) { v = r.er; break search; }
      }
      er[c] = v;
    }
  }
  // Nodes
  const cond = new Int32Array(nu * nz).fill(-1);
  for (let j = 0; j < nz; j += 1) {
    if ((inp.planeBelow != null && Math.abs(z[j] - inp.planeBelow) <= tol) || (inp.planeAbove != null && Math.abs(z[j] - inp.planeAbove) <= tol)) {
      for (let i = 0; i < nu; i += 1) cond[i + nu * j] = 0;
    }
  }
  for (const c of inp.conductors) {
    let [a0, a1, b0, b1] = bbox(c.pts);
    if (c.open & OPEN_L) a0 = -Infinity;
    if (c.open & OPEN_R) a1 = Infinity;
    for (let j = 0; j < nz; j += 1) {
      const zz = cz(z[j]);
      if (zz < b0 - tol || zz > b1 + tol) continue;
      for (let i = 0; i < nu; i += 1) {
        if (u[i] < a0 - tol || u[i] > a1 + tol) continue;
        const k = i + nu * j;
        if (cond[k] >= 0) continue;
        if (insideOrOn(c.pts, cu(u[i]), zz, tol)) cond[k] = c.id;
      }
    }
  }
  if (vacuum) er = new Float64Array(er.length).fill(1);
  return { cond, er };
}

function assemble(u: Float64Array, z: Float64Array, cond: Int32Array, er: Float64Array): Mesh {
  const nu = u.length, nz = z.length, ncu = nu - 1;
  const off = nu + 1;
  const N = nu * nz;
  const wx = new Float64Array(N + 2 * off), wz = new Float64Array(N + 2 * off);
  for (let j = 0; j < nz; j += 1) for (let i = 0; i < nu; i += 1) {
    const k = i + nu * j;
    if (i + 1 < nu) {
      const du = u[i + 1] - u[i];
      let s = 0;
      if (j > 0) s += er[i + ncu * (j - 1)] * 0.5 * (z[j] - z[j - 1]);
      if (j + 1 < nz) s += er[i + ncu * j] * 0.5 * (z[j + 1] - z[j]);
      wx[off + k] = s / du;
    }
    if (j + 1 < nz) {
      const dz = z[j + 1] - z[j];
      let s = 0;
      if (i > 0) s += er[i - 1 + ncu * j] * 0.5 * (u[i] - u[i - 1]);
      if (i + 1 < nu) s += er[i + ncu * j] * 0.5 * (u[i + 1] - u[i]);
      wz[off + k] = s / dz;
    }
  }
  return { nu, nz, N, off, cond, wx, wz };
}

// Solves for each drive (potential per conductor id, [0] = ground = 0); returns the charge on each signal id per drive
// (εr-weighted: multiply by ε0) and the potentials (for the next level's start).
function solveLevel(m: Mesh, n: number, drives: Float64Array[], tol: number, starts: (Float64Array | null)[]): { Q: number[][]; phis: Float64Array[]; iters: number } {
  const { nu, N, off, cond, wx, wz } = m;
  const L = N + 2 * off;
  // Couplings between free nodes only, diagonal from all edges.
  const cx = new Float64Array(L), cz = new Float64Array(L), dg = new Float64Array(L), D = new Float64Array(L);
  for (let k = 0; k < N; k += 1) {
    const p = off + k;
    dg[p] = wx[p] + wx[p - 1] + wz[p] + wz[p - nu];
    const free = cond[k] < 0;
    if (free && k + 1 < N && cond[k + 1] < 0) cx[p] = wx[p];
    if (free && k + nu < N && cond[k + nu] < 0) cz[p] = wz[p];
  }
  // Modified incomplete Cholesky (5-point, row sums preserved with α).
  const alpha = 0.97;
  for (let k = 0; k < N; k += 1) {
    const p = off + k;
    if (cond[k] >= 0) { D[p] = 1; continue; }
    let d = dg[p];
    const a = cx[p - 1], b = cz[p - nu];
    if (a) d -= (a * (a + alpha * cz[p - 1])) / D[p - 1];
    if (b) d -= (b * (b + alpha * cx[p - nu])) / D[p - nu];
    D[p] = d > 1e-12 * dg[p] ? d : dg[p];
  }
  for (let p = off; p < off + N; p += 1) D[p] = 1 / D[p]; // the sweeps multiply (a division's latency is the chain's)
  const Q: number[][] = [];
  const phis: Float64Array[] = [];
  let iters = 0;
  const x = new Float64Array(L), r = new Float64Array(L), zv = new Float64Array(L), pv = new Float64Array(L), q = new Float64Array(L);
  for (let s = 1; s <= drives.length; s += 1) {
    const V = drives[s - 1];
    x.fill(0);
    const st = starts[s - 1];
    for (let k = 0; k < N; k += 1) x[off + k] = cond[k] >= 0 ? V[cond[k]] : st ? st[k] : 0;
    // r = b − A x over free nodes, where b holds the couplings to fixed nodes: r = −(K x) at free nodes.
    let bn = 0;
    for (let k = 0; k < N; k += 1) {
      const p = off + k;
      if (cond[k] >= 0) { r[p] = 0; continue; }
      const kx = dg[p] * x[p] - wx[p] * x[p + 1] - wx[p - 1] * x[p - 1] - wz[p] * x[p + nu] - wz[p - nu] * x[p - nu];
      r[p] = -kx;
      // ‖b‖: couplings to driven nodes
      let bb = 0;
      if (k + 1 < N && cond[k + 1] >= 0) bb += wx[p] * V[cond[k + 1]];
      if (k >= 1 && cond[k - 1] >= 0) bb += wx[p - 1] * V[cond[k - 1]];
      if (k + nu < N && cond[k + nu] >= 0) bb += wz[p] * V[cond[k + nu]];
      if (k >= nu && cond[k - nu] >= 0) bb += wz[p - nu] * V[cond[k - nu]];
      bn += bb * bb;
    }
    bn = Math.sqrt(bn) || 1;
    // Fixed nodes stay at r = z = p = q = 0: their couplings are zero and D = 1.
    const prec = (): number => {
      for (let p = off; p < off + N; p += 1) zv[p] = (r[p] + cx[p - 1] * zv[p - 1] + cz[p - nu] * zv[p - nu]) * D[p];
      let rz = 0;
      for (let p = off + N - 1; p >= off; p -= 1) { const v = zv[p] + (cx[p] * zv[p + 1] + cz[p] * zv[p + nu]) * D[p]; zv[p] = v; rz += r[p] * v; }
      return rz;
    };
    let rz = prec();
    pv.set(zv);
    let rn = 0;
    for (let p = off; p < off + N; p += 1) rn += r[p] * r[p];
    const lim = tol * tol * bn * bn;
    let it = 0;
    for (; it < 20000 && rn > lim; it += 1) {
      let pq = 0;
      for (let p = off; p < off + N; p += 1) {
        const v = dg[p] * pv[p] - cx[p] * pv[p + 1] - cx[p - 1] * pv[p - 1] - cz[p] * pv[p + nu] - cz[p - nu] * pv[p - nu];
        q[p] = v; pq += pv[p] * v;
      }
      const al = rz / pq;
      rn = 0;
      for (let p = off; p < off + N; p += 1) { x[p] += al * pv[p]; const v = r[p] - al * q[p]; r[p] = v; rn += v * v; }
      const rz2 = prec();
      const be = rz2 / rz;
      rz = rz2;
      for (let p = off; p < off + N; p += 1) pv[p] = zv[p] + be * pv[p];
    }
    iters += it;
    // Charge: the reaction (K x) summed over each conductor's nodes.
    const qs = new Array(n + 1).fill(0);
    for (let k = 0; k < N; k += 1) {
      const p = off + k;
      if (k + 1 < N && wx[p]) {
        const a = cond[k], b = cond[k + 1];
        if (a !== b || a < 0) { const f = wx[p] * (x[p] - x[p + 1]); if (a > 0) qs[a] += f; if (b > 0) qs[b] -= f; }
      }
      if (k + nu < N && wz[p]) {
        const a = cond[k], b = cond[k + nu];
        if (a !== b || a < 0) { const f = wz[p] * (x[p] - x[p + nu]); if (a > 0) qs[a] += f; if (b > 0) qs[b] -= f; }
      }
    }
    Q.push(qs.slice(1)); // Q[s−1][k−1] = charge on k under drive s
    phis.push(x.slice(off, off + N));
  }
  return { Q, phis, iters };
}

// Bilinear interpolation of a potential from one tensor grid to another (the next level's start).
function interp(phi: Float64Array, uo: Float64Array, zo: Float64Array, u: Float64Array, z: Float64Array): Float64Array {
  const loc = (xo: Float64Array, x: Float64Array) => {
    const idx = new Int32Array(x.length), fr = new Float64Array(x.length);
    let k = 0;
    for (let i = 0; i < x.length; i += 1) {
      while (k + 2 < xo.length && xo[k + 1] < x[i]) k += 1;
      idx[i] = k;
      fr[i] = Math.max(0, Math.min(1, (x[i] - xo[k]) / (xo[k + 1] - xo[k])));
    }
    return { idx, fr };
  };
  const a = loc(uo, u), b = loc(zo, z);
  const nuo = uo.length, nu = u.length;
  const out = new Float64Array(nu * z.length);
  for (let j = 0; j < z.length; j += 1) {
    const jj = b.idx[j], fz = b.fr[j];
    for (let i = 0; i < nu; i += 1) {
      const ii = a.idx[i], fu = a.fr[i];
      const p = ii + nuo * jj;
      out[i + nu * j] = (1 - fz) * ((1 - fu) * phi[p] + fu * phi[p + 1]) + fz * ((1 - fu) * phi[p + nuo] + fu * phi[p + nuo + 1]);
    }
  }
  return out;
}

const sym = (A: number[][]) => A.map((row, i) => row.map((v, j) => 0.5 * (v + A[j][i])));

// Richardson of one entry over three nested levels: value, error, order, regular.
export function richardson(a: number, b: number, c: number): { v: number; e: number; p: number; ok: boolean } {
  const d1 = b - a, d2 = c - b;
  if (d2 === 0) return { v: c, e: 0, p: Infinity, ok: true };
  const p = Math.log2(Math.abs(d1 / d2));
  if (!(p >= 0.8 && p <= 2.5) || d1 * d2 < 0) return { v: c, e: Math.abs(d2), p, ok: false };
  const v = c + d2 / (2 ** p - 1);
  return { v, e: Math.abs(v - c), p, ok: true };
}

// Mirror symmetry about u = 0: σ maps each signal id to its mirror image, or null when the section is not symmetric
// (every conductor, region and open flag must have a mirror image of the same kind).
export function mirrorMap(inp: FdInput): number[] | null {
  const scale = Math.max(inp.ext, Math.abs(inp.zHi), Math.abs(inp.zLo), 1e-3);
  const key = (p: ArrayLike<number>, sign: number) => {
    const a: string[] = [];
    for (let k = 0; k < p.length; k += 2) a.push(`${Math.round((sign * p[k]) / (1e-9 * scale))},${Math.round(p[k + 1] / (1e-9 * scale))}`);
    return a.sort().join(';');
  };
  const swap = (o: number) => (o & ~3) | (o & OPEN_L ? OPEN_R : 0) | (o & OPEN_R ? OPEN_L : 0);
  const cs = inp.conductors.map((c) => ({ id: c.id, k: key(c.pts, 1), m: key(c.pts, -1), o: c.open }));
  const sigma = new Array(inp.signals + 1).fill(0);
  for (const c of cs) {
    const t = cs.find((d) => d.k === c.m && d.o === swap(c.o) && (d.id === 0) === (c.id === 0));
    if (!t) return null;
    if (c.id > 0) sigma[c.id] = t.id;
  }
  const rs = inp.regions.map((r) => ({ er: r.er, k: key(r.pts, 1), m: key(r.pts, -1), o: r.open }));
  for (const r of rs) if (!rs.some((d) => d.k === r.m && d.o === swap(r.o) && d.er === r.er)) return null;
  // A pair's members must not reach the mirror line (their nodes there would belong to both).
  for (const c of inp.conductors) {
    if (c.id > 0 && sigma[c.id] !== c.id) { const b = bbox(c.pts); if (b[0] <= 1e-9 * scale && b[1] >= -1e-9 * scale) return null; }
  }
  return sigma;
}

// X = B·A⁻¹ for small n × n by Gauss–Jordan with partial pivoting (solving Aᵀ·Xᵀ = Bᵀ).
function rightDivide(B: number[][], A: number[][]): number[][] {
  const n = A.length;
  const M = A.map((_, i) => [...A.map((r) => r[i]), ...B.map((r) => r[i])]);
  for (let c = 0; c < n; c += 1) {
    let p = c;
    for (let r = c + 1; r < n; r += 1) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    const d = M[c][c];
    for (let k = 0; k < 2 * n; k += 1) M[c][k] /= d;
    for (let r = 0; r < n; r += 1) if (r !== c && M[r][c]) { const f = M[r][c]; for (let k = 0; k < 2 * n; k += 1) M[r][k] -= f * M[c][k]; }
  }
  return Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => M[j][n + i]));
}

export function fdSolve(inp: FdInput, opts: FdOptions = {}): FdResult {
  const t0 = performance.now();
  const o = { ...DEF, ...opts } as Required<FdOptions>;
  const n = inp.signals;
  const sigma = opts.symmetry === false ? null : mirrorMap(inp);
  const g = baseGrid(inp, o, !!sigma);
  // Drive patterns (columns of P): every signal alone without symmetry; with it, the even patterns (a self-mirror
  // signal alone, a mirror pair together) on the half with a Neumann mirror line, and the odd ones (a pair at ±1)
  // with the mirror line at 0 V. C = Q·P⁻¹, Q the full charges of each pattern.
  type Pat = { V: Float64Array; odd: boolean };
  const pats: Pat[] = [];
  const unit = (k: number, m = 0, sm = 0) => { const V = new Float64Array(n + 1); V[k] = 1; if (m) V[m] = sm; return V; };
  for (let k = 1; k <= n; k += 1) {
    if (!sigma || sigma[k] === k) pats.push({ V: unit(k), odd: false });
    else if (sigma[k] > k) { pats.push({ V: unit(k, sigma[k], 1), odd: false }); pats.push({ V: unit(k, sigma[k], -1), odd: true }); }
  }
  const P = Array.from({ length: n }, (_, i) => pats.map((p) => p.V[i + 1]));
  const right = new Array(n + 1).fill(true);
  for (const c of inp.conductors) if (c.id > 0 && sigma && sigma[c.id] !== c.id) { const b = bbox(c.pts); right[c.id] = b[0] + b[1] > 0; }
  // Full charges from the half's: a self-mirror conductor has twice its half (none in odd patterns); a pair member
  // on the left has its mirror's charge, with the sign of the pattern.
  const fullQ = (qh: number[], V: Float64Array, odd: boolean): number[] => Array.from({ length: n }, (_, i) => {
    const k = i + 1;
    if (!sigma) return qh[i];
    if (sigma[k] === k) return odd ? 0 : 2 * qh[i];
    return right[k] ? qh[i] : (odd ? -1 : 1) * qh[sigma[k] - 1];
  });
  const groups = [false, true].map((odd) => pats.map((p, i) => ({ p, i })).filter((x) => x.p.odd === odd)).filter((x) => x.length);
  const levels: FdLevel[] = [];
  let prev: { u: Float64Array; z: Float64Array; phis: Float64Array[]; phis0: Float64Array[] } | null = null;
  for (let l = 0; l < o.levels; l += 1) {
    const t1 = performance.now();
    const { u, z } = g.at(l);
    const ras = rasterise(inp, u, z, false);
    const QD: number[][] = new Array(pats.length), QV: number[][] = new Array(pats.length);
    const phis: Float64Array[] = new Array(pats.length), phis0: Float64Array[] = new Array(pats.length);
    let iters = 0;
    for (const grp of groups) {
      const odd = grp[0].p.odd;
      let cond = ras.cond;
      if (odd) { cond = cond.slice(); for (let j = 0; j < z.length; j += 1) if (cond[u.length * j] < 0) cond[u.length * j] = 0; }
      const drives = grp.map((x) => x.p.V);
      for (const vac of o.vacuumOnly ? [true] : [true, false]) {
        const mesh = assemble(u, z, cond, vac ? new Float64Array(ras.er.length).fill(1) : ras.er);
        const src = prev ? (vac ? prev.phis0 : prev.phis) : null;
        const res = solveLevel(mesh, n, drives, o.tol, grp.map((x) => (src ? interp(src[x.i], prev.u, prev.z, u, z) : null)));
        iters += res.iters;
        grp.forEach((x, k) => {
          const q = fullQ(res.Q[k], x.p.V, odd).map((v) => v * EPS0);
          if (vac) { QV[x.i] = q; phis0[x.i] = res.phis[k]; } else { QD[x.i] = q; phis[x.i] = res.phis[k]; }
        });
      }
    }
    const toC = (Qp: number[][]) => sym(rightDivide(Array.from({ length: n }, (_, i) => Qp.map((col) => col[i])), P));
    const C0m = toC(QV);
    const C = o.vacuumOnly ? C0m : toC(QD);
    levels.push({ nu: u.length, nz: z.length, C, C0: C0m, iters, ms: performance.now() - t1 });
    prev = { u, z, phis: o.vacuumOnly ? phis0 : phis, phis0 };
  }
  const L = levels.length;
  // Per entry: Richardson on the last three levels. Error: with four levels and both triples regular, twice the
  // change between the last two extrapolations (the change of the extrapolation is what is left of the error);
  // otherwise |C_R − C_finest|; an entry whose order is outside [0.8, 2.5] keeps the finest level and |C2 − C1|.
  const ex = (key: 'C' | 'C0') => {
    const V = Array.from({ length: n }, () => new Array(n).fill(0));
    const E = Array.from({ length: n }, () => new Array(n).fill(0));
    const P = Array.from({ length: n }, () => new Array(n).fill(0));
    let flagged = false, sharp = L >= 4, p11 = NaN;
    for (let i = 0; i < n; i += 1) for (let j = 0; j < n; j += 1) {
      const a = levels.map((lv) => lv[key][i][j]);
      if (L < 3) { V[i][j] = a[L - 1]; E[i][j] = L > 1 ? Math.abs(a[L - 1] - a[L - 2]) : Infinity; flagged = true; sharp = false; continue; }
      const r = richardson(a[L - 3], a[L - 2], a[L - 1]);
      let e = r.e;
      P[i][j] = r.v;
      if (L >= 4 && r.ok) {
        const r0 = richardson(a[L - 4], a[L - 3], a[L - 2]);
        P[i][j] = r0.v;
        if (r0.ok) e = Math.max(2 * Math.abs(r.v - r0.v), 0.1 * r.e); else sharp = false;
      } else sharp = false;
      if (!r.ok) flagged = true;
      if (i === 0 && j === 0) p11 = r.p;
      V[i][j] = r.v; E[i][j] = Math.max(e, 1e-9 * Math.abs(r.v));
    }
    return { V, E, P, flagged, sharp, p11 };
  };
  const a = ex('C'), b = ex('C0');
  const prevX = a.sharp && b.sharp ? { C: a.P, C0: b.P } : null;
  return { n, C: a.V, C0: b.V, err: { C: a.E, C0: b.E }, prev: prevX, order: a.p11, flagged: a.flagged || b.flagged, levels, ms: performance.now() - t0 };
}

// The shared input of the fuzz: the Section of lib/emsim/geometry.ts (its type only, no code of the solver).
export function inputFromSection(sec: any): FdInput {
  return {
    signals: sec.signals,
    conductors: sec.conductors.map((c: any) => ({ id: c.id, pts: c.pts, open: c.open })),
    regions: sec.regions.map((r: any) => ({ er: sec.materials[r.mat].er, pts: r.pts, open: r.open })),
    planeBelow: sec.planeBelow, planeAbove: sec.planeAbove, ext: sec.ext, zLo: sec.zLo, zHi: sec.zHi,
  };
}
