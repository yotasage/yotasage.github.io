// Green's functions and closed-form panel integrals of the 2D boundary-element solver (solver.md §2.2, §2.3), and
// the assembly of its matrix (§2.1). Unknowns: the total charge density s = σ/ε0 on each straight panel, constant
// over the panel; one collocation point per panel, its midpoint.
//
// Kernels by the planes (coordinates already shifted so that the plane below is z = 0):
// - free: G = −ln r / 2π, with a free constant V0 in every conductor row and the row Σ s·L = 0;
// - image: one plane at z = 0, G = −(ln r − ln r′)/2π;
// - pp: planes at z = 0 and z = b, G = (1/4π)·ln(D₊/D₋), D± = sinh²(πΔx/2b) + sin²(π(z ± z′)/2b): the source
//   and its images in z = 0 and z = b in closed form, the smooth rest by 2-point Gauss–Legendre.

export type Kernel = { kind: 'free' } | { kind: 'image' } | { kind: 'pp'; b: number };

// The panels as columns (structure of arrays). Conductor panels come first (indices 0 … nc − 1), then the
// interfaces. n = (tz, −tx) is the panel normal: for an interface it points into the medium epsP.
export interface Panels {
  n: number;
  nc: number;
  ax: Float64Array;
  az: Float64Array;
  tx: Float64Array;
  tz: Float64Array;
  len: Float64Array;
  mx: Float64Array;
  mz: Float64Array;
  cond: Int32Array; // conductor id (0 ground, 1…n signals), −1 interface
  epsC: Float64Array; // conductor: εr of the medium the panel faces
  epsP: Float64Array; // interface: εr on the normal's side
  epsM: Float64Array; // and on the other
}

export function allocPanels(n: number): Panels {
  return {
    n, nc: 0,
    ax: new Float64Array(n), az: new Float64Array(n), tx: new Float64Array(n), tz: new Float64Array(n),
    len: new Float64Array(n), mx: new Float64Array(n), mz: new Float64Array(n), cond: new Int32Array(n),
    epsC: new Float64Array(n), epsP: new Float64Array(n), epsM: new Float64Array(n),
  };
}

const INV_2PI = 1 / (2 * Math.PI);
const INV_4PI = 1 / (4 * Math.PI);
const G2 = 0.5773502691896257; // 1/√3: 2-point Gauss–Legendre

// ∫ ln|P − Q| dl(Q) over the panel from (ax, az) along (tx, tz) of length L, at P = (px, pz).
function logI(px: number, pz: number, ax: number, az: number, tx: number, tz: number, L: number): number {
  const rx = px - ax;
  const rz = pz - az;
  const u = rx * tx + rz * tz;
  const v = rx * tz - rz * tx;
  const xb = L - u;
  const v2 = v * v;
  let I = -L;
  if (xb !== 0) I += 0.5 * xb * Math.log(xb * xb + v2);
  if (u !== 0) I += 0.5 * u * Math.log(u * u + v2); // −xa·ln rA with xa = −u
  if (v !== 0) { const av = Math.abs(v); I += av * Math.atan2(L * av, v2 + u * u - u * L); }
  return I;
}

// Its gradient with respect to P, into gx, gz.
let gx = 0;
let gz = 0;
function logG(px: number, pz: number, ax: number, az: number, tx: number, tz: number, L: number): void {
  const rx = px - ax;
  const rz = pz - az;
  const u = rx * tx + rz * tz;
  const v = rx * tz - rz * tx;
  const xb = L - u;
  const v2 = v * v;
  const du = 0.5 * Math.log((u * u + v2) / (xb * xb + v2)); // ln rA − ln rB
  const dv = Math.atan2(L * v, v2 + u * u - u * L); // the angle subtended; 0 on the panel's own line
  gx = du * tx + dv * tz;
  gz = du * tz - dv * tx;
}

// The smooth rest of the parallel-plate kernel at P for a unit line charge at Q (potential), and its gradient.
let rp = 0;
let rgx = 0;
let rgz = 0;
function ppRest(b: number, px: number, pz: number, qx: number, qz: number, grad: boolean): void {
  const k = Math.PI / (2 * b);
  const dx = px - qx;
  const dz = pz - qz;
  const sp = pz + qz;
  const a = k * dx;
  const sh = Math.sinh(a);
  const s1 = Math.sin(k * sp);
  const s2 = Math.sin(k * dz);
  const sh2 = sh * sh;
  const Dp = sh2 + s1 * s1;
  const Dm = sh2 + s2 * s2;
  const db = pz + qz - 2 * b;
  const x2 = dx * dx;
  const r2 = x2 + dz * dz;
  const r02 = x2 + sp * sp;
  const rb2 = x2 + db * db;
  rp = (Math.log(Dp / Dm) + Math.log(r2 / (r02 * rb2))) * INV_4PI;
  if (!grad) return;
  const s2a = 2 * sh * Math.cosh(a);
  rgx = k * s2a * (1 / Dp - 1 / Dm) * INV_4PI - (-dx / r2 + dx / r02 + dx / rb2) * INV_2PI;
  rgz = k * (Math.sin(2 * k * sp) / Dp - Math.sin(2 * k * dz) / Dm) * INV_4PI - (-dz / r2 + sp / r02 + db / rb2) * INV_2PI;
}

// Potential at P of unit s on panel j (self: P is the panel's own midpoint).
export function panelPot(k: Kernel, p: Panels, j: number, px: number, pz: number, self: boolean): number {
  const ax = p.ax[j];
  const az = p.az[j];
  const tx = p.tx[j];
  const tz = p.tz[j];
  const L = p.len[j];
  let v = self ? -L * (Math.log(L / 2) - 1) * INV_2PI : -logI(px, pz, ax, az, tx, tz, L) * INV_2PI;
  if (k.kind === 'free') return v;
  v += logI(px, pz, ax, -az, tx, -tz, L) * INV_2PI;
  if (k.kind === 'pp') {
    v += logI(px, pz, ax, 2 * k.b - az, tx, -tz, L) * INV_2PI;
    const h = L / 2;
    const mx = p.mx[j];
    const mz = p.mz[j];
    ppRest(k.b, px, pz, mx - G2 * h * tx, mz - G2 * h * tz, false);
    let s = rp;
    ppRest(k.b, px, pz, mx + G2 * h * tx, mz + G2 * h * tz, false);
    s += rp;
    v += s * h;
  }
  return v;
}

// Normal derivative n·∇ (with respect to P) of the potential of unit s on panel j; the self term's principal value
// is 0 (the jump is in the interface equation).
export function panelDn(k: Kernel, p: Panels, j: number, px: number, pz: number, nx: number, nz: number, self: boolean): number {
  const ax = p.ax[j];
  const az = p.az[j];
  const tx = p.tx[j];
  const tz = p.tz[j];
  const L = p.len[j];
  let ex = 0;
  let ez = 0;
  if (!self) { logG(px, pz, ax, az, tx, tz, L); ex = -gx * INV_2PI; ez = -gz * INV_2PI; }
  if (k.kind !== 'free') {
    logG(px, pz, ax, -az, tx, -tz, L);
    ex += gx * INV_2PI; ez += gz * INV_2PI;
    if (k.kind === 'pp') {
      logG(px, pz, ax, 2 * k.b - az, tx, -tz, L);
      ex += gx * INV_2PI; ez += gz * INV_2PI;
      const h = L / 2;
      const mx = p.mx[j];
      const mz = p.mz[j];
      ppRest(k.b, px, pz, mx - G2 * h * tx, mz - G2 * h * tz, true);
      let sx = rgx;
      let sz = rgz;
      ppRest(k.b, px, pz, mx + G2 * h * tx, mz + G2 * h * tz, true);
      sx += rgx; sz += rgz;
      ex += sx * h; ez += sz * h;
    }
  }
  return ex * nx + ez * nz;
}

// Assembles the dielectric problem's matrix into A (n × n, n = N + 1 for the free kernel, else N):
// conductor rows Σ s_j·G_ij (+ V0) = V; interface rows s_i − 2(εP − εM)/(εP + εM)·Σ_j s_j·∂G_ij/∂n_i = 0 (normal D
// continuous, scaled to a unit diagonal); free kernel: the last row Σ s_j·L_j = 0.
export function assemble(k: Kernel, p: Panels, A: Float64Array, n: number): void {
  const N = p.n;
  const nc = p.nc;
  const free = k.kind === 'free';
  A.fill(0, 0, n * n);
  for (let i = 0; i < nc; i++) {
    const row = i * n;
    const px = p.mx[i];
    const pz = p.mz[i];
    for (let j = 0; j < N; j++) A[row + j] = panelPot(k, p, j, px, pz, i === j);
    if (free) A[row + N] = 1;
  }
  for (let i = nc; i < N; i++) {
    const row = i * n;
    const px = p.mx[i];
    const pz = p.mz[i];
    const nx = p.tz[i];
    const nz = -p.tx[i];
    const f = (-2 * (p.epsP[i] - p.epsM[i])) / (p.epsP[i] + p.epsM[i]);
    for (let j = 0; j < N; j++) A[row + j] = f * panelDn(k, p, j, px, pz, nx, nz, i === j);
    A[row + i] += 1;
  }
  if (free) for (let j = 0; j < N; j++) A[N * n + j] = p.len[j];
}

// The vacuum problem's matrix: the conductor rows and columns of the assembled A (the same potentials), plus the
// free kernel's V0 column and neutrality row.
export function vacuumMatrix(k: Kernel, p: Panels, A: Float64Array, n: number): { A0: Float64Array; n0: number } {
  const nc = p.nc;
  const free = k.kind === 'free';
  const n0 = nc + (free ? 1 : 0);
  const A0 = new Float64Array(n0 * n0);
  for (let i = 0; i < nc; i++) {
    A0.set(A.subarray(i * n, i * n + nc), i * n0);
    if (free) A0[i * n0 + nc] = 1;
  }
  if (free) for (let j = 0; j < nc; j++) A0[nc * n0 + j] = p.len[j];
  return { A0, n0 };
}
