// SPIKE (M0.3), not product code.
//
// Minimal 2D boundary-element (method of moments) solver for the per-unit-length Maxwell capacitance matrix of the
// signal conductors of a cross-section, kept as the worked example for M1.2 (docs/em-sim/solver.md):
// - unknowns: TOTAL (free + bound) surface charge, piecewise constant on straight panels; collocation at midpoints;
// - conductor rows: potential prescribed; dielectric interface rows: normal D continuous,
//   s_i (eP + eM)/2 + (eP - eM) E_pv,n = 0 (s = sigma/eps0, eP on the side the panel normal points to);
// - Green's function by the planes present: 'free' (ln r, plus a neutrality row and a free constant),
//   'image' (one plane at z = 0), 'pp' (planes at z = 0 and z = b, closed-form parallel-plate kernel);
// - panel integrals of ln r and of its gradient in closed form when the collocation point is near the panel
//   (distance <= eta * panel length), 2-point Gauss-Legendre otherwise; for 'pp' the near integral is the closed
//   form of the source and its two first images plus 2-point Gauss on the smooth remainder.
// Units: lengths in mm (C per unit length in 2D does not depend on the length unit), C in F/m.

export const EPS0 = 8.8541878188e-12; // CODATA 2022
export const C0 = 299792458;

export type Kernel = { kind: 'free' } | { kind: 'image' } | { kind: 'pp'; b: number };

export interface Panel {
  ax: number; az: number; bx: number; bz: number;
  mx: number; mz: number; L: number;
  tx: number; tz: number; nx: number; nz: number; // n = (tz, -tx): outward for a counter-clockwise conductor
  cond: number; // conductor index, or -1 for a dielectric interface
  epsC: number; epsP: number; epsM: number;
  kappa?: number; // curvature of the true interface (1/R, > 0 when it bends away from n): self-term correction
}

export interface Problem { kernel: Kernel; panels: Panel[]; nSig: number }

export function panel(ax: number, az: number, bx: number, bz: number, cond: number): Panel {
  const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz);
  return { ax, az, bx, bz, mx: (ax + bx) / 2, mz: (az + bz) / 2, L, tx: dx / L, tz: dz / L, nx: dz / L, nz: -dx / L,
    cond, epsC: 1, epsP: 1, epsM: 1 };
}

export function polyline(out: Panel[], pts: number[][], cond: number): void {
  for (let i = 0; i + 1 < pts.length; i++) out.push(panel(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], cond));
}

const TWO_PI = 2 * Math.PI, FOUR_PI = 4 * Math.PI, G2 = 0.5773502691896257;
const o = new Float64Array(3);

// ∫_A^B ln|P - Q| dl(Q) and its gradient with respect to P, in closed form. `self`: P is the panel's own midpoint
// (principal value: the normal derivative's jump is left to the interface equation).
function segLog(px: number, pz: number, ax: number, az: number, tx: number, tz: number, L: number, self: boolean): void {
  const rx = px - ax, rz = pz - az;
  const u = rx * tx + rz * tz;
  const v = self ? 0 : rx * tz - rz * tx;
  const xa = -u, xb = L - u, v2 = v * v;
  const ra2 = xa * xa + v2, rb2 = xb * xb + v2;
  const lnA = 0.5 * Math.log(ra2), lnB = 0.5 * Math.log(rb2);
  let I = (xb === 0 ? 0 : xb * lnB) - (xa === 0 ? 0 : xa * lnA) - L;
  const av = Math.abs(v);
  if (av > 0) I += av * (Math.atan(xb / av) - Math.atan(xa / av));
  const dIdu = lnA - lnB;
  const dIdv = self ? 0 : Math.atan2(L * v, v2 + u * u - u * L);
  o[0] = I; o[1] = dIdu * tx + dIdv * tz; o[2] = dIdu * tz - dIdv * tx;
}

// Potential (units 1/eps0) at P of a unit line charge at Q, and its gradient with respect to P, into r.
// rem: for 'pp', the smooth remainder after removing the source and its two first images.
function pointK(k: Kernel, px: number, pz: number, qx: number, qz: number, rem: boolean, r: Float64Array): void {
  const dx = px - qx, dz = pz - qz;
  if (k.kind === 'free') {
    const r2 = dx * dx + dz * dz;
    r[0] = -Math.log(r2) / FOUR_PI; r[1] = -dx / (TWO_PI * r2); r[2] = -dz / (TWO_PI * r2);
    return;
  }
  if (k.kind === 'image') {
    const r2 = dx * dx + dz * dz, d0 = pz + qz, ri2 = dx * dx + d0 * d0;
    r[0] = Math.log(ri2 / r2) / FOUR_PI;
    r[1] = (-dx / r2 + dx / ri2) / TWO_PI; r[2] = (-dz / r2 + d0 / ri2) / TWO_PI;
    return;
  }
  const kk = Math.PI / (2 * k.b);
  const a = kk * dx, cp = kk * (pz + qz), cm = kk * dz;
  const sh = Math.sinh(a), sp = Math.sin(cp), sm = Math.sin(cm);
  const sh2 = sh * sh, Dp = sh2 + sp * sp, Dm = sh2 + sm * sm;
  let pot = Math.log(Dp / Dm) / FOUR_PI;
  const s2a = 2 * sh * Math.cosh(a);
  let gx = kk * s2a * (1 / Dp - 1 / Dm) / FOUR_PI;
  let gz = kk * (Math.sin(2 * cp) / Dp - Math.sin(2 * cm) / Dm) / FOUR_PI;
  if (rem) {
    const d0 = pz + qz, db = pz - (2 * k.b - qz);
    const r2 = dx * dx + dz * dz, r02 = dx * dx + d0 * d0, rb2 = dx * dx + db * db;
    pot += Math.log(r2 / (r02 * rb2)) / FOUR_PI;
    gx -= (-dx / r2 + dx / r02 + dx / rb2) / TWO_PI;
    gz -= (-dz / r2 + d0 / r02 + db / rb2) / TWO_PI;
  }
  r[0] = pot; r[1] = gx; r[2] = gz;
}

const kr = new Float64Array(3);

// Integral over panel j of the kernel at P: r[0] potential, r[1..2] gradient with respect to P.
function panelInt(k: Kernel, px: number, pz: number, pj: Panel, self: boolean, far: boolean, r: Float64Array): void {
  let pot = 0, gx = 0, gz = 0;
  const h = pj.L / 2;
  if (far) {
    for (let s = -1; s <= 1; s += 2) {
      pointK(k, px, pz, pj.mx + s * G2 * h * pj.tx, pj.mz + s * G2 * h * pj.tz, false, kr);
      pot += kr[0]; gx += kr[1]; gz += kr[2];
    }
    r[0] = pot * h; r[1] = gx * h; r[2] = gz * h;
    return;
  }
  segLog(px, pz, pj.ax, pj.az, pj.tx, pj.tz, pj.L, self);
  pot = -o[0] / TWO_PI; gx = -o[1] / TWO_PI; gz = -o[2] / TWO_PI;
  if (k.kind !== 'free') {
    segLog(px, pz, pj.ax, -pj.az, pj.tx, -pj.tz, pj.L, false);
    pot += o[0] / TWO_PI; gx += o[1] / TWO_PI; gz += o[2] / TWO_PI;
    if (k.kind === 'pp') {
      segLog(px, pz, pj.ax, 2 * k.b - pj.az, pj.tx, -pj.tz, pj.L, false);
      pot += o[0] / TWO_PI; gx += o[1] / TWO_PI; gz += o[2] / TWO_PI;
      for (let s = -1; s <= 1; s += 2) {
        pointK(k, px, pz, pj.mx + s * G2 * h * pj.tx, pj.mz + s * G2 * h * pj.tz, true, kr);
        pot += kr[0] * h; gx += kr[1] * h; gz += kr[2] * h;
      }
    }
  }
  r[0] = pot; r[1] = gx; r[2] = gz;
}

export function luFactor(A: Float64Array, n: number, piv: Int32Array): void {
  for (let k = 0; k < n; k++) {
    let p = k, mx = Math.abs(A[k * n + k]);
    for (let i = k + 1; i < n; i++) { const v = Math.abs(A[i * n + k]); if (v > mx) { mx = v; p = i; } }
    piv[k] = p;
    const rk = k * n;
    if (p !== k) {
      const rp = p * n;
      for (let j = 0; j < n; j++) { const t = A[rk + j]; A[rk + j] = A[rp + j]; A[rp + j] = t; }
    }
    const inv = 1 / A[rk + k];
    for (let i = k + 1; i < n; i++) {
      const ri = i * n, f = A[ri + k] * inv;
      A[ri + k] = f;
      if (f !== 0) for (let j = k + 1; j < n; j++) A[ri + j] -= f * A[rk + j];
    }
  }
}

export function luSolve(A: Float64Array, n: number, piv: Int32Array, b: Float64Array): void {
  for (let k = 0; k < n; k++) { const p = piv[k]; if (p !== k) { const t = b[k]; b[k] = b[p]; b[p] = t; } }
  for (let i = 0; i < n; i++) { let s = b[i]; const ri = i * n; for (let j = 0; j < i; j++) s -= A[ri + j] * b[j]; b[i] = s; }
  for (let i = n - 1; i >= 0; i--) {
    let s = b[i]; const ri = i * n;
    for (let j = i + 1; j < n; j++) s -= A[ri + j] * b[j];
    b[i] = s / A[ri + i];
  }
}

export interface Solution { C: number[][]; n: number; tAsm: number; tLU: number; tAll: number }

export function solve(prob: Problem, eta = Infinity): Solution {
  const t0 = performance.now();
  const P = prob.panels, N = P.length, k = prob.kernel;
  const free = k.kind === 'free';
  const n = N + (free ? 1 : 0), eta2 = eta * eta;
  const A = new Float64Array(n * n);
  const r = new Float64Array(3);
  for (let i = 0; i < N; i++) {
    const pi = P[i], isC = pi.cond >= 0, row = i * n;
    const de = pi.epsP - pi.epsM;
    for (let j = 0; j < N; j++) {
      const pj = P[j];
      const dx = pi.mx - pj.mx, dz = pi.mz - pj.mz;
      const far = i !== j && dx * dx + dz * dz > eta2 * pj.L * pj.L;
      panelInt(k, pi.mx, pi.mz, pj, i === j, far, r);
      A[row + j] = isC ? r[0] : -de * (r[1] * pi.nx + r[2] * pi.nz); // interface: de·E_n, E_n = -grad(pot)·n
    }
    // the jump of E_n across the panel's own charge, and on a curved interface the part of the principal value that
    // a flat panel misses (kernel -> kappa/2 on the curve): without it the error is first order (measured, C04)
    if (!isC) A[row + i] += (pi.epsP + pi.epsM) / 2 + de * (pi.kappa ?? 0) * pi.L / (4 * Math.PI);
    if (free) A[row + N] = isC ? 1 : 0;
  }
  if (free) { for (let j = 0; j < N; j++) A[N * n + j] = P[j].L; }
  const t1 = performance.now();
  const piv = new Int32Array(n);
  luFactor(A, n, piv);
  const t2 = performance.now();
  const ns = prob.nSig, C: number[][] = [];
  for (let m = 0; m < ns; m++) C.push(new Array(ns).fill(0));
  const b = new Float64Array(n);
  for (let s = 0; s < ns; s++) {
    for (let i = 0; i < n; i++) b[i] = i < N && P[i].cond === s ? 1 : 0;
    luSolve(A, n, piv, b);
    for (let j = 0; j < N; j++) { const c = P[j].cond; if (c >= 0 && c < ns) C[c][s] += EPS0 * P[j].epsC * b[j] * P[j].L; }
  }
  const t3 = performance.now();
  return { C, n, tAsm: t1 - t0, tLU: t2 - t1, tAll: t3 - t0 };
}

// Complete elliptic integrals K(k), E(k) by the AGM (DLMF 19.8.5, 19.8.6), k' formed as sqrt((1-k)(1+k)).
export function ellipKE(k: number, out: Float64Array): void {
  let a = 1, g = Math.sqrt((1 - k) * (1 + k)), c = k, p2 = 0.5, sum = 0.5 * k * k;
  // bounded: a and g can differ by one ulp for ever (an unbounded loop hung here)
  for (let it = 0; it < 40 && Math.abs(c) > 4e-16 * a; it++) { const an = (a + g) / 2; c = (a - g) / 2; g = Math.sqrt(a * g); a = an; p2 *= 2; sum += p2 * c * c; }
  out[0] = Math.PI / (2 * a); out[1] = out[0] * (1 - sum);
}
