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

// Far panels (M1.2b): when the midpoint is more than FAR panel lengths from P, both integrals are the convergent
// series of the closed form in ζ = τ·(L/2)/w (w = P − midpoint, τ the unit tangent, as complex numbers; |ζ|² ≤ 1/(4·FAR²)):
//   ∫ ln|P − Q| dl = L·(ln|w| − Re Σ ζ^2m / (2m(2m + 1))),   ∇ = conj((L/w)·Σ ζ^2m / (2m + 1)), m ≥ 0.
// Truncated after m = 5 (potential) and m = 6 (gradient), the first term left out is below 3 × 10⁻¹⁷ of L and of
// L/|w|: the same integral to rounding (closer than the closed form, whose x·ln r terms cancel for far panels),
// with one logarithm for the potential and none for the gradient instead of two logarithms and an arctangent.
const FAR2 = 64; // FAR = 8
const P1 = 1 / 6, P2 = 1 / 20, P3 = 1 / 42, P4 = 1 / 72, P5 = 1 / 110;
const D1 = 1 / 3, D2 = 1 / 5, D3 = 1 / 7, D4 = 1 / 9, D5 = 1 / 11, D6 = 1 / 13;

// ∫ ln|P − Q| dl(Q) over the panel from (ax, az) along (tx, tz) of length L, at P = (px, pz).
function logI(px: number, pz: number, ax: number, az: number, tx: number, tz: number, L: number): number {
  const rx = px - ax;
  const rz = pz - az;
  const h = 0.5 * L;
  const wx = rx - h * tx;
  const wz = rz - h * tz;
  const w2 = wx * wx + wz * wz;
  if (w2 > FAR2 * L * L) {
    const s = h / w2;
    const zr = (tx * wx + tz * wz) * s;
    const zi = (tz * wx - tx * wz) * s;
    const ar = zr * zr - zi * zi;
    const ai = 2 * zr * zi;
    // Horner in ζ²: Σ_{m=1..5} P_m ζ^2m (separate constants: reassigned doubles slow V8 down here)
    const r1 = P5 * ar + P4, i1 = P5 * ai;
    const r2 = r1 * ar - i1 * ai + P3, i2 = r1 * ai + i1 * ar;
    const r3 = r2 * ar - i2 * ai + P2, i3 = r2 * ai + i2 * ar;
    const sr = r3 * ar - i3 * ai + P1, si = r3 * ai + i3 * ar;
    return L * (0.5 * Math.log(w2) - (sr * ar - si * ai));
  }
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

// Its gradient with respect to P, into GV (a typed array: module-level doubles would be boxed on every write).
const GV = new Float64Array(2);
function logG(px: number, pz: number, ax: number, az: number, tx: number, tz: number, L: number): void {
  const rx = px - ax;
  const rz = pz - az;
  const h = 0.5 * L;
  const wx = rx - h * tx;
  const wz = rz - h * tz;
  const w2 = wx * wx + wz * wz;
  if (w2 > FAR2 * L * L) {
    const s = h / w2;
    const zr = (tx * wx + tz * wz) * s;
    const zi = (tz * wx - tx * wz) * s;
    const ar = zr * zr - zi * zi;
    const ai = 2 * zr * zi;
    const r1 = D6 * ar + D5, i1 = D6 * ai;
    const r2 = r1 * ar - i1 * ai + D4, i2 = r1 * ai + i1 * ar;
    const r3 = r2 * ar - i2 * ai + D3, i3 = r2 * ai + i2 * ar;
    const r4 = r3 * ar - i3 * ai + D2, i4 = r3 * ai + i3 * ar;
    const r5 = r4 * ar - i4 * ai + D1, i5 = r4 * ai + i4 * ar;
    const sr = r5 * ar - i5 * ai + 1, si = r5 * ai + i5 * ar;
    const f = L / w2;
    GV[0] = f * (wx * sr + wz * si);
    GV[1] = f * (wz * sr - wx * si);
    return;
  }
  const u = rx * tx + rz * tz;
  const v = rx * tz - rz * tx;
  const xb = L - u;
  const v2 = v * v;
  const du = 0.5 * Math.log((u * u + v2) / (xb * xb + v2)); // ln rA − ln rB
  const dv = Math.atan2(L * v, v2 + u * u - u * L); // the angle subtended; 0 on the panel's own line
  GV[0] = du * tx + dv * tz;
  GV[1] = du * tz - dv * tx;
}

// The smooth rest of the parallel-plate kernel at P for a unit line charge at Q: potential into RV[0], gradient
// into RV[1], RV[2].
const RV = new Float64Array(3);
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
  if (!grad) { RV[0] = (Math.log(Dp / Dm) + Math.log(r2 / (r02 * rb2))) * INV_4PI; return; }
  const s2a = 2 * sh * Math.cosh(a);
  RV[1] = k * s2a * (1 / Dp - 1 / Dm) * INV_4PI - (-dx / r2 + dx / r02 + dx / rb2) * INV_2PI;
  RV[2] = k * (Math.sin(2 * k * sp) / Dp - Math.sin(2 * k * dz) / Dm) * INV_4PI - (-dz / r2 + sp / r02 + db / rb2) * INV_2PI;
}

// The parallel-plate kernel's top image and smooth rest for panel j at P: potential.
function ppPot(b: number, p: Panels, j: number, px: number, pz: number): number {
  const tx = p.tx[j];
  const tz = p.tz[j];
  const L = p.len[j];
  const h = L / 2;
  const mx = p.mx[j];
  const mz = p.mz[j];
  const v = logI(px, pz, p.ax[j], 2 * b - p.az[j], tx, -tz, L) * INV_2PI;
  ppRest(b, px, pz, mx - G2 * h * tx, mz - G2 * h * tz, false);
  let s = RV[0];
  ppRest(b, px, pz, mx + G2 * h * tx, mz + G2 * h * tz, false);
  s += RV[0];
  return v + s * h;
}

// The same for the field: n·∇.
function ppDn(b: number, p: Panels, j: number, px: number, pz: number, nx: number, nz: number): number {
  const tx = p.tx[j];
  const tz = p.tz[j];
  const L = p.len[j];
  const h = L / 2;
  const mx = p.mx[j];
  const mz = p.mz[j];
  logG(px, pz, p.ax[j], 2 * b - p.az[j], tx, -tz, L);
  const e = (GV[0] * nx + GV[1] * nz) * INV_2PI;
  ppRest(b, px, pz, mx - G2 * h * tx, mz - G2 * h * tz, true);
  let sx = RV[1];
  let sz = RV[2];
  ppRest(b, px, pz, mx + G2 * h * tx, mz + G2 * h * tz, true);
  sx += RV[1];
  sz += RV[2];
  return e + (sx * nx + sz * nz) * h;
}

const kindOf = (k: Kernel): number => (k.kind === 'free' ? 0 : k.kind === 'image' ? 1 : 2);

// One row of potentials: out[off + j] = potential at P of unit s on panel j, for every panel (self: the index of the
// panel whose midpoint P is, or −1). logI is written out in the loop for the source and its image in z = 0: a call
// would pass its seven doubles boxed (half of the assembly's time in V8).
export function potRow(k: Kernel, p: Panels, self: number, px: number, pz: number, out: Float64Array, off: number): void {
  const N = p.n;
  const AX = p.ax;
  const AZ = p.az;
  const TX = p.tx;
  const TZ = p.tz;
  const LEN = p.len;
  const kind = kindOf(k);
  const copies = kind === 0 ? 1 : 2;
  const b = kind === 2 ? (k as { b: number }).b : 0;
  for (let j = 0; j < N; j++) {
    const ax = AX[j];
    const L = LEN[j];
    const tx = TX[j];
    const h = 0.5 * L;
    const far2 = FAR2 * L * L;
    const rx = px - ax;
    let v = 0;
    for (let c = 0; c < copies; c++) {
      // c = 0: the panel (sign −), c = 1: its image (sign +)
      if (c === 0 && j === self) { v -= L * (Math.log(h) - 1); continue; }
      const az = c === 0 ? AZ[j] : -AZ[j];
      const tz = c === 0 ? TZ[j] : -TZ[j];
      const rz = pz - az;
      const wx = rx - h * tx;
      const wz = rz - h * tz;
      const w2 = wx * wx + wz * wz;
      let I: number;
      if (w2 > far2) {
        const s = h / w2;
        const zr = (tx * wx + tz * wz) * s;
        const zi = (tz * wx - tx * wz) * s;
        const ar = zr * zr - zi * zi;
        const ai = 2 * zr * zi;
        const r1 = P5 * ar + P4, i1 = P5 * ai;
        const r2 = r1 * ar - i1 * ai + P3, i2 = r1 * ai + i1 * ar;
        const r3 = r2 * ar - i2 * ai + P2, i3 = r2 * ai + i2 * ar;
        const sr = r3 * ar - i3 * ai + P1, si = r3 * ai + i3 * ar;
        I = L * (0.5 * Math.log(w2) - (sr * ar - si * ai));
      } else {
        const u = rx * tx + rz * tz;
        const vv = rx * tz - rz * tx;
        const xb = L - u;
        const v2 = vv * vv;
        I = -L;
        if (xb !== 0) I += 0.5 * xb * Math.log(xb * xb + v2);
        if (u !== 0) I += 0.5 * u * Math.log(u * u + v2);
        if (vv !== 0) { const av = Math.abs(vv); I += av * Math.atan2(L * av, v2 + u * u - u * L); }
      }
      v += c === 0 ? -I : I;
    }
    v *= INV_2PI;
    if (kind === 2) v += ppPot(b, p, j, px, pz);
    out[off + j] = v;
  }
}

// One row of normal derivatives, times f: out[off + j] = f·n·∇ at P of the potential of unit s on panel j; the self
// term's principal value is 0 (the jump is in the interface equation). logG written out as in potRow.
export function dnRow(k: Kernel, p: Panels, self: number, px: number, pz: number, nx: number, nz: number, f: number, out: Float64Array, off: number): void {
  const N = p.n;
  const AX = p.ax;
  const AZ = p.az;
  const TX = p.tx;
  const TZ = p.tz;
  const LEN = p.len;
  const kind = kindOf(k);
  const copies = kind === 0 ? 1 : 2;
  const b = kind === 2 ? (k as { b: number }).b : 0;
  const fn = f * INV_2PI;
  for (let j = 0; j < N; j++) {
    const ax = AX[j];
    const L = LEN[j];
    const tx = TX[j];
    const h = 0.5 * L;
    const far2 = FAR2 * L * L;
    const rx = px - ax;
    let e = 0;
    for (let c = 0; c < copies; c++) {
      if (c === 0 && j === self) continue;
      const az = c === 0 ? AZ[j] : -AZ[j];
      const tz = c === 0 ? TZ[j] : -TZ[j];
      const rz = pz - az;
      const wx = rx - h * tx;
      const wz = rz - h * tz;
      const w2 = wx * wx + wz * wz;
      let g: number;
      if (w2 > far2) {
        const s = h / w2;
        const zr = (tx * wx + tz * wz) * s;
        const zi = (tz * wx - tx * wz) * s;
        const ar = zr * zr - zi * zi;
        const ai = 2 * zr * zi;
        const r1 = D6 * ar + D5, i1 = D6 * ai;
        const r2 = r1 * ar - i1 * ai + D4, i2 = r1 * ai + i1 * ar;
        const r3 = r2 * ar - i2 * ai + D3, i3 = r2 * ai + i2 * ar;
        const r4 = r3 * ar - i3 * ai + D2, i4 = r3 * ai + i3 * ar;
        const r5 = r4 * ar - i4 * ai + D1, i5 = r4 * ai + i4 * ar;
        const sr = r5 * ar - i5 * ai + 1, si = r5 * ai + i5 * ar;
        const q = L / w2;
        g = q * ((wx * sr + wz * si) * nx + (wz * sr - wx * si) * nz);
      } else {
        const u = rx * tx + rz * tz;
        const vv = rx * tz - rz * tx;
        const xb = L - u;
        const v2 = vv * vv;
        const du = 0.5 * Math.log((u * u + v2) / (xb * xb + v2));
        const dv = Math.atan2(L * vv, v2 + u * u - u * L);
        g = (du * tx + dv * tz) * nx + (du * tz - dv * tx) * nz;
      }
      e += c === 0 ? -g : g;
    }
    e *= fn;
    if (kind === 2) e += f * ppDn(b, p, j, px, pz, nx, nz);
    out[off + j] = e;
  }
}

// Potential at P of unit s on panel j (self: P is the panel's own midpoint).
export function panelPot(k: Kernel, p: Panels, j: number, px: number, pz: number, self: boolean): number {
  const ax = p.ax[j];
  const az = p.az[j];
  const tx = p.tx[j];
  const tz = p.tz[j];
  const L = p.len[j];
  let v = self ? -L * (Math.log(L / 2) - 1) : -logI(px, pz, ax, az, tx, tz, L);
  if (k.kind !== 'free') v += logI(px, pz, ax, -az, tx, -tz, L);
  v *= INV_2PI;
  if (k.kind === 'pp') v += ppPot(k.b, p, j, px, pz);
  return v;
}

// Normal derivative n·∇ (with respect to P) of the potential of unit s on panel j (self: principal value).
export function panelDn(k: Kernel, p: Panels, j: number, px: number, pz: number, nx: number, nz: number, self: boolean): number {
  const ax = p.ax[j];
  const az = p.az[j];
  const tx = p.tx[j];
  const tz = p.tz[j];
  const L = p.len[j];
  let e = 0;
  if (!self) { logG(px, pz, ax, az, tx, tz, L); e = -(GV[0] * nx + GV[1] * nz); }
  if (k.kind !== 'free') { logG(px, pz, ax, -az, tx, -tz, L); e += GV[0] * nx + GV[1] * nz; }
  e *= INV_2PI;
  if (k.kind === 'pp') e += ppDn(k.b, p, j, px, pz, nx, nz);
  return e;
}

// The factor of interface row i: −2(εP − εM)/(εP + εM).
export function interfaceFactor(p: Panels, i: number): number {
  return (-2 * (p.epsP[i] - p.epsM[i])) / (p.epsP[i] + p.epsM[i]);
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
    potRow(k, p, i, p.mx[i], p.mz[i], A, i * n);
    if (free) A[i * n + N] = 1;
  }
  for (let i = nc; i < N; i++) {
    dnRow(k, p, i, p.mx[i], p.mz[i], p.tz[i], -p.tx[i], interfaceFactor(p, i), A, i * n);
    A[i * n + i] += 1;
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
