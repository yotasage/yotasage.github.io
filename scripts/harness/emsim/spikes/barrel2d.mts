// SPIKE (M0.4a), not product code.
// Round barrels on a Cartesian mesh: the capacitance per length of a coaxial via (barrel radius a inside an antipad
// or return ring of radius b) on the Yee grid's nodes, staircased or with the conformal edge rule, against the exact
// 2*pi*eps/ln(b/a). This is the cross-section a z-directed TEM wave sees in the FDTD mesh: potentials on the primary
// nodes, E on the primary edges, eps*(dual face width)/(edge length) per edge.
//   staircase: nodes inside a conductor are held at its potential, every edge has its full length h;
//   conformal: an edge from a free node to a conductor node is shortened to the part outside the conductor (f*h),
//              the static counterpart of the shortened E-edge lengths in the contour integrals of Dey-Mittra and
//              Yu-Mittra conformal FDTD (the area division they differ in does not enter a curl-free static field).

export interface BarrelRow { cellsPerDrill: number; stair: { mean: number; max: number }; conf: { mean: number; max: number } }

const OFFSETS: [number, number][] = [[0, 0], [0.5, 0.5], [0.25, 0.1], [0.37, 0.71], [0.13, 0.29], [0.81, 0.44], [0.62, 0.07], [0.93, 0.86]];

/** Relative error of Z0 (= sqrt(mu eps)/C') of the discrete coax; positive when the mesh gives a higher Z0. */
function coaxError(a: number, b: number, h: number, x0: number, y0: number, conformal: boolean): number {
  const m = Math.ceil((b + 2 * h) / h) * 2 + 1;     // nodes per axis, centred near the coax axis
  const off = (m - 1) / 2;
  const X = (i: number) => (i - off) * h - x0, Y = (j: number) => (j - off) * h - y0;
  const kind = new Int8Array(m * m);                 // 0 free, 1 inner (V=1), 2 outer (V=0)
  for (let j = 0; j < m; j++) for (let i = 0; i < m; i++) {
    const r = Math.hypot(X(i), Y(j));
    kind[i + m * j] = r <= a ? 1 : r >= b ? 2 : 0;
  }
  // fraction of the edge P->Q (free P, conductor Q) outside the conductor
  const frac = (px: number, py: number, qx: number, qy: number, R: number) => {
    if (!conformal) return 1;
    const dx = qx - px, dy = qy - py, A = dx * dx + dy * dy, B = 2 * (px * dx + py * dy), C = px * px + py * py - R * R;
    const disc = Math.sqrt(Math.max(0, B * B - 4 * A * C));
    const ts = [(-B - disc) / (2 * A), (-B + disc) / (2 * A)].filter(t => t > 0 && t <= 1 + 1e-12);
    return Math.max(1e-3, Math.min(1, Math.min(...ts)));
  };
  const idx = new Int32Array(m * m).fill(-1);
  let nf = 0;
  for (let c = 0; c < m * m; c++) if (kind[c] === 0) idx[c] = nf++;
  // matrix-free operator: diag and neighbour conductances
  const diag = new Float64Array(nf), rhs = new Float64Array(nf);
  const nb: number[][] = Array.from({ length: nf }, () => []);
  const edges: { p: number; q: number; g: number; vq: number }[] = [];
  for (let j = 0; j < m; j++) for (let i = 0; i < m; i++) {
    const c = i + m * j;
    for (const [di, dj] of [[1, 0], [0, 1]]) {
      const i2 = i + di, j2 = j + dj; if (i2 >= m || j2 >= m) continue;
      const c2 = i2 + m * j2;
      const k1 = kind[c], k2 = kind[c2];
      if (k1 !== 0 && k2 !== 0) continue;           // inside a conductor or between conductors: no field
      let g = 1;
      if (k1 === 0 && k2 !== 0) g = 1 / frac(X(i), Y(j), X(i2), Y(j2), k2 === 1 ? a : b);
      if (k2 === 0 && k1 !== 0) g = 1 / frac(X(i2), Y(j2), X(i), Y(j), k1 === 1 ? a : b);
      if (k1 === 0 && k2 === 0) { const p = idx[c], q = idx[c2]; diag[p] += g; diag[q] += g; nb[p].push(q, g); nb[q].push(p, g); edges.push({ p, q, g, vq: NaN }); }
      else { const p = idx[k1 === 0 ? c : c2], vq = (k1 === 0 ? k2 : k1) === 1 ? 1 : 0; diag[p] += g; rhs[p] += g * vq; edges.push({ p, q: -1, g, vq }); }
    }
  }
  // Jacobi-preconditioned conjugate gradients
  const v = new Float64Array(nf), r = Float64Array.from(rhs), z = new Float64Array(nf), d = new Float64Array(nf), Ad = new Float64Array(nf);
  for (let p = 0; p < nf; p++) { z[p] = r[p] / diag[p]; d[p] = z[p]; }
  let rz = r.reduce((s, x, p) => s + x * z[p], 0);
  const r0 = Math.sqrt(rhs.reduce((s, x) => s + x * x, 0));
  for (let it = 0; it < 20 * nf && Math.sqrt(r.reduce((s, x) => s + x * x, 0)) > 1e-13 * r0; it++) {
    for (let p = 0; p < nf; p++) { let s = diag[p] * d[p]; const L = nb[p]; for (let t = 0; t < L.length; t += 2) s -= L[t + 1] * d[L[t]]; Ad[p] = s; }
    const alpha = rz / d.reduce((s, x, p) => s + x * Ad[p], 0);
    for (let p = 0; p < nf; p++) { v[p] += alpha * d[p]; r[p] -= alpha * Ad[p]; z[p] = r[p] / diag[p]; }
    const rz2 = r.reduce((s, x, p) => s + x * z[p], 0);
    const beta = rz2 / rz; rz = rz2;
    for (let p = 0; p < nf; p++) d[p] = z[p] + beta * d[p];
  }
  let cOverEps = 0;                                   // C'/eps = sum g*dV^2 at 1 V
  for (const e of edges) { const dv = v[e.p] - (e.q >= 0 ? v[e.q] : e.vq); cOverEps += e.g * dv * dv; }
  const exact = (2 * Math.PI) / Math.log(b / a);
  return exact / cOverEps - 1;                        // Z ~ 1/C'
}

export function barrelTable(a = 0.15, b = 0.35, cells = [4, 6, 8, 12, 16, 24, 32]): BarrelRow[] {
  return cells.map(n => {
    const h = (2 * a) / n;
    const st = OFFSETS.map(([u, w]) => Math.abs(coaxError(a, b, h, u * h, w * h, false)));
    const cf = OFFSETS.map(([u, w]) => Math.abs(coaxError(a, b, h, u * h, w * h, true)));
    const s = (x: number[]) => ({ mean: x.reduce((p, q) => p + q, 0) / x.length, max: Math.max(...x) });
    return { cellsPerDrill: n, stair: s(st), conf: s(cf) };
  });
}
