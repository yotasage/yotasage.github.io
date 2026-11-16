// Modal decomposition of a multiconductor line (solver.md §3, facts.md §4), framework-free.
//
// Input: the Maxwell capacitance matrix C (F/m, with the dielectrics) and L (H/m, = μ0ε0·C0⁻¹), n × n row-major.
//   1. C = RᵀR (Cholesky, R upper triangular), C symmetrised first; its asymmetry is reported.
//   2. W′ = R·L·Rᵀ (symmetrised), similar to L·C: eigenvalues λ_m = 1/v_m².
//   3. Cyclic Jacobi on W′ until every off-diagonal element is below 10⁻¹⁵·‖W′‖_F.
//   4. Λ ascending (fastest mode first), Tv = R⁻¹U, Ti = RᵀU (= C·Tv), Zc = Tv·Λ^{1/2}·Tvᵀ = Σ Tv,m·Tv,mᵀ/v_m,
//      Yc = Ti·Λ^{−1/2}·Tiᵀ = Σ v_m·Ti,m·Ti,mᵀ = Zc⁻¹.
//   5. Degenerate clusters (|λ_i − λ_j| ≤ 10⁻⁹·λ_max, chained): inside a cluster with eigenvectors P the basis is
//      rotated to the eigenvectors Q of Pᵀ·C⁻¹·P (ascending; ties ordered by the conductor of the largest |Tv|), so
//      the voltage vectors are orthogonal both in C and in the plain metric: a symmetric pair gives odd then even.
//      Every mode's sign: its largest |Tv| entry (lowest conductor on a tie) is positive.
// Every impedance of the tool is taken from Zc (lines.ts); the modes are for display and the modal εeff.

export const CLUSTER_TOL = 1e-9;
export const JACOBI_TOL = 1e-15;
const C_LIGHT = 299792458;

export interface Modes {
  ok: boolean;
  reason: string;
  n: number;
  lambda: Float64Array; // 1/v_m² (s²/m²), ascending
  v: Float64Array; // m/s
  eeff: Float64Array; // (c0/v_m)²
  Tv: Float64Array; // n × n row-major, column m is mode m: Tv[k·n + m]
  Ti: Float64Array;
  Zc: Float64Array; // Ω
  Yc: Float64Array; // S
  zMode: Float64Array; // Z_k,m = Tv_km/(v_m·Ti_km) (Tripathi's modal impedance of conductor k in mode m)
  clusters: number[][]; // degenerate clusters (mode indices, two or more)
  asymC: number; // ‖C − Cᵀ‖_F/‖C‖_F of the input
  residual: number; // ‖Zc·C·Zc − L‖_F/‖L‖_F
  sweeps: number; // Jacobi sweeps of W′
}

function fro(A: Float64Array): number {
  let s = 0;
  for (let i = 0; i < A.length; i++) s += A[i] * A[i];
  return Math.sqrt(s);
}

// C = RᵀR, R upper triangular (row-major). Null when C is not positive definite.
export function cholesky(C: Float64Array, n: number): Float64Array | null {
  const R = new Float64Array(n * n);
  for (let j = 0; j < n; j++) {
    let d = C[j * n + j];
    for (let k = 0; k < j; k++) d -= R[k * n + j] * R[k * n + j];
    if (!(d > 0)) return null;
    const r = Math.sqrt(d);
    R[j * n + j] = r;
    for (let i = j + 1; i < n; i++) {
      let s = C[j * n + i];
      for (let k = 0; k < j; k++) s -= R[k * n + j] * R[k * n + i];
      R[j * n + i] = s / r;
    }
  }
  return R;
}

// Inverse of an upper triangular matrix (row-major).
export function invUpper(R: Float64Array, n: number): Float64Array {
  const X = new Float64Array(n * n);
  for (let j = 0; j < n; j++) {
    X[j * n + j] = 1 / R[j * n + j];
    for (let i = j - 1; i >= 0; i--) {
      let s = 0;
      for (let k = i + 1; k <= j; k++) s += R[i * n + k] * X[k * n + j];
      X[i * n + j] = -s / R[i * n + i];
    }
  }
  return X;
}

// Cyclic Jacobi: A (symmetric, row-major, destroyed) = V·diag·Vᵀ. Returns the sweeps used; the eigenvalues are left
// on A's diagonal, the eigenvectors in the columns of V.
export function jacobi(A: Float64Array, n: number, V: Float64Array, tol = JACOBI_TOL): number {
  V.fill(0);
  for (let i = 0; i < n; i++) V[i * n + i] = 1;
  const lim = tol * fro(A);
  let sweep = 0;
  for (; sweep < 60; sweep++) {
    let off = 0;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) off = Math.max(off, Math.abs(A[p * n + q]));
    if (off <= lim) break;
    for (let p = 0; p < n - 1; p++) {
      for (let q = p + 1; q < n; q++) {
        const apq = A[p * n + q];
        if (Math.abs(apq) <= lim) continue;
        const theta = (A[q * n + q] - A[p * n + p]) / (2 * apq);
        const t = (theta >= 0 ? 1 : -1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;
        A[p * n + p] -= t * apq;
        A[q * n + q] += t * apq;
        A[p * n + q] = 0;
        A[q * n + p] = 0;
        for (let r = 0; r < n; r++) {
          if (r !== p && r !== q) {
            const arp = A[r * n + p];
            const arq = A[r * n + q];
            const np = c * arp - s * arq;
            const nq = s * arp + c * arq;
            A[r * n + p] = np; A[p * n + r] = np;
            A[r * n + q] = nq; A[q * n + r] = nq;
          }
          const vrp = V[r * n + p];
          const vrq = V[r * n + q];
          V[r * n + p] = c * vrp - s * vrq;
          V[r * n + q] = s * vrp + c * vrq;
        }
      }
    }
  }
  return sweep;
}

// Eigen-decomposition of a small symmetric matrix, ascending: { w, V } with V's columns the vectors.
export function symEig(S: Float64Array, n: number): { w: Float64Array; V: Float64Array; sweeps: number } {
  const A = Float64Array.from(S);
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) { const m = 0.5 * (A[i * n + j] + A[j * n + i]); A[i * n + j] = m; A[j * n + i] = m; }
  const V0 = new Float64Array(n * n);
  const sweeps = jacobi(A, n, V0);
  const idx = Array.from({ length: n }, (_, i) => i).sort((a, b) => A[a * n + a] - A[b * n + b]);
  const w = new Float64Array(n);
  const V = new Float64Array(n * n);
  idx.forEach((src, m) => {
    w[m] = A[src * n + src];
    for (let r = 0; r < n; r++) V[r * n + m] = V0[r * n + src];
  });
  return { w, V, sweeps };
}

function failed(n: number, reason: string, asymC = 0): Modes {
  const z = () => new Float64Array(0);
  return { ok: false, reason, n, lambda: z(), v: z(), eeff: z(), Tv: z(), Ti: z(), Zc: z(), Yc: z(), zMode: z(), clusters: [], asymC, residual: NaN, sweeps: 0 };
}

// Index of the largest |x| (the lowest index among those within 10⁻⁹ of it).
function leadIndex(get: (k: number) => number, n: number): number {
  let big = 0;
  for (let k = 0; k < n; k++) big = Math.max(big, Math.abs(get(k)));
  for (let k = 0; k < n; k++) if (Math.abs(get(k)) >= big * (1 - 1e-9)) return k;
  return 0;
}

export function modesOf(Cin: ArrayLike<number>, Lin: ArrayLike<number>, n: number): Modes {
  const C = new Float64Array(n * n);
  const L = new Float64Array(n * n);
  let asym = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      C[i * n + j] = 0.5 * (Cin[i * n + j] + Cin[j * n + i]);
      L[i * n + j] = 0.5 * (Lin[i * n + j] + Lin[j * n + i]);
      const d = Cin[i * n + j] - Cin[j * n + i];
      asym += d * d;
    }
  }
  for (let i = 0; i < n * n; i++) if (!Number.isFinite(C[i]) || !Number.isFinite(L[i])) return failed(n, 'C or L is not finite.');
  const asymC = Math.sqrt(asym) / fro(C);
  const R = cholesky(C, n);
  if (!R) return failed(n, 'The capacitance matrix is not positive definite.', asymC);
  const Ri = invUpper(R, n);
  // W′ = R·L·Rᵀ
  const RL = new Float64Array(n * n);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    let s = 0;
    for (let k = i; k < n; k++) s += R[i * n + k] * L[k * n + j];
    RL[i * n + j] = s;
  }
  const W = new Float64Array(n * n);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    let s = 0;
    for (let k = j; k < n; k++) s += RL[i * n + k] * R[j * n + k];
    W[i * n + j] = s;
  }
  const eig = symEig(W, n);
  const lambda = eig.w;
  const U = eig.V;
  if (!(lambda[0] > 0)) return failed(n, 'L·C has an eigenvalue that is not positive.', asymC);

  // degenerate clusters
  const clusters: number[][] = [];
  const lmax = lambda[n - 1];
  for (let i = 0; i < n;) {
    let j = i;
    while (j + 1 < n && lambda[j + 1] - lambda[j] <= CLUSTER_TOL * lmax) j++;
    if (j > i) clusters.push(Array.from({ length: j - i + 1 }, (_, k) => i + k));
    i = j + 1;
  }
  const tvCol = (Ucol: Float64Array, out: Float64Array) => { // out = R⁻¹·u
    for (let r = 0; r < n; r++) { let s = 0; for (let k = r; k < n; k++) s += Ri[r * n + k] * Ucol[k]; out[r] = s; }
  };
  for (const cl of clusters) {
    const k = cl.length;
    const P = cl.map((m) => { const u = new Float64Array(n); for (let r = 0; r < n; r++) u[r] = U[r * n + m]; return u; });
    const T = P.map((u) => { const t = new Float64Array(n); tvCol(u, t); return t; });
    const Mk = new Float64Array(k * k);
    for (let a = 0; a < k; a++) for (let b = 0; b < k; b++) { let s = 0; for (let r = 0; r < n; r++) s += T[a][r] * T[b][r]; Mk[a * k + b] = s; }
    const e = symEig(Mk, k);
    const cols = Array.from({ length: k }, (_, b) => {
      const u = new Float64Array(n);
      for (let a = 0; a < k; a++) { const q = e.V[a * k + b]; for (let r = 0; r < n; r++) u[r] += P[a][r] * q; }
      const t = new Float64Array(n);
      tvCol(u, t);
      return { u, mu: e.w[b], lead: leadIndex((r) => t[r], n) };
    });
    const muMax = Math.max(...cols.map((c) => Math.abs(c.mu)));
    cols.sort((x, y) => (Math.abs(x.mu - y.mu) <= CLUSTER_TOL * muMax ? x.lead - y.lead : x.mu - y.mu));
    cl.forEach((m, b) => { for (let r = 0; r < n; r++) U[r * n + m] = cols[b].u[r]; });
  }

  // Tv = R⁻¹U, Ti = RᵀU, signs
  const Tv = new Float64Array(n * n);
  const Ti = new Float64Array(n * n);
  for (let r = 0; r < n; r++) for (let m = 0; m < n; m++) {
    let sv = 0;
    for (let k = r; k < n; k++) sv += Ri[r * n + k] * U[k * n + m];
    let si = 0;
    for (let k = 0; k <= r; k++) si += R[k * n + r] * U[k * n + m];
    Tv[r * n + m] = sv;
    Ti[r * n + m] = si;
  }
  for (let m = 0; m < n; m++) {
    const k = leadIndex((r) => Tv[r * n + m], n);
    if (Tv[k * n + m] < 0) for (let r = 0; r < n; r++) { Tv[r * n + m] = -Tv[r * n + m]; Ti[r * n + m] = -Ti[r * n + m]; }
  }
  const v = new Float64Array(n);
  const eeff = new Float64Array(n);
  const sq = new Float64Array(n);
  for (let m = 0; m < n; m++) { sq[m] = Math.sqrt(lambda[m]); v[m] = 1 / sq[m]; eeff[m] = C_LIGHT * C_LIGHT * lambda[m]; }
  const Zc = new Float64Array(n * n);
  const Yc = new Float64Array(n * n);
  const zMode = new Float64Array(n * n);
  for (let i = 0; i < n; i++) for (let j = i; j < n; j++) {
    let z = 0, y = 0;
    for (let m = 0; m < n; m++) { z += Tv[i * n + m] * Tv[j * n + m] * sq[m]; y += Ti[i * n + m] * Ti[j * n + m] / sq[m]; }
    Zc[i * n + j] = z; Zc[j * n + i] = z;
    Yc[i * n + j] = y; Yc[j * n + i] = y;
  }
  for (let k = 0; k < n; k++) for (let m = 0; m < n; m++) zMode[k * n + m] = Tv[k * n + m] / (v[m] * Ti[k * n + m]);
  // check: Zc·C·Zc = L
  const ZC = new Float64Array(n * n);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { let s = 0; for (let k = 0; k < n; k++) s += Zc[i * n + k] * C[k * n + j]; ZC[i * n + j] = s; }
  let res = 0;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    let s = 0;
    for (let k = 0; k < n; k++) s += ZC[i * n + k] * Zc[k * n + j];
    const d = s - L[i * n + j];
    res += d * d;
  }
  return { ok: true, reason: '', n, lambda, v, eeff, Tv, Ti, Zc, Yc, zMode, clusters, asymC, residual: Math.sqrt(res) / fro(L), sweeps: eig.sweeps };
}
