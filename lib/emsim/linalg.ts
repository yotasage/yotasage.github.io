// Dense linear algebra for the static solvers (solver.md §2.1): row-major Float64Array matrices, factorised in place.
// Plain loops over contiguous rows; no allocation inside the loops.

// LU factorisation with partial pivoting, P·A = L·U, in place (L unit lower, below the diagonal; U on and above).
// piv[k] is the row swapped with row k at step k. Returns the smallest |pivot| divided by the largest (0: singular).
export function luFactor(A: Float64Array, n: number, piv: Int32Array): number {
  let pmin = Infinity;
  let pmax = 0;
  for (let k = 0; k < n; k++) {
    const rk = k * n;
    let p = k;
    let mx = Math.abs(A[rk + k]);
    for (let i = k + 1; i < n; i++) {
      const v = Math.abs(A[i * n + k]);
      if (v > mx) { mx = v; p = i; }
    }
    piv[k] = p;
    if (mx === 0) return 0;
    if (p !== k) {
      const rp = p * n;
      for (let j = 0; j < n; j++) { const t = A[rk + j]; A[rk + j] = A[rp + j]; A[rp + j] = t; }
    }
    if (mx < pmin) pmin = mx;
    if (mx > pmax) pmax = mx;
    const inv = 1 / A[rk + k];
    for (let i = k + 1; i < n; i++) {
      const ri = i * n;
      const f = A[ri + k] * inv;
      A[ri + k] = f;
      if (f !== 0) for (let j = k + 1; j < n; j++) A[ri + j] -= f * A[rk + j];
    }
  }
  return n ? pmin / pmax : 1;
}

// Solves A·x = b for m right-hand sides with the factors of luFactor: B holds the m vectors one after the other
// (B[r·n + i]) and is overwritten by the solutions.
export function luSolve(A: Float64Array, n: number, piv: Int32Array, B: Float64Array, m = 1): void {
  for (let r = 0; r < m; r++) {
    const o = r * n;
    for (let k = 0; k < n; k++) {
      const p = piv[k];
      if (p !== k) { const t = B[o + k]; B[o + k] = B[o + p]; B[o + p] = t; }
    }
    for (let i = 1; i < n; i++) {
      const ri = i * n;
      let s = B[o + i];
      for (let j = 0; j < i; j++) s -= A[ri + j] * B[o + j];
      B[o + i] = s;
    }
    for (let i = n - 1; i >= 0; i--) {
      const ri = i * n;
      let s = B[o + i];
      for (let j = i + 1; j < n; j++) s -= A[ri + j] * B[o + j];
      B[o + i] = s / A[ri + i];
    }
  }
}

// Inverse of a small matrix (the n×n capacitance matrices) by Gauss–Jordan with partial pivoting; null when singular.
export function invert(A: Float64Array, n: number): Float64Array | null {
  const W = Float64Array.from(A);
  const X = new Float64Array(n * n);
  for (let i = 0; i < n; i++) X[i * n + i] = 1;
  for (let k = 0; k < n; k++) {
    let p = k;
    let mx = Math.abs(W[k * n + k]);
    for (let i = k + 1; i < n; i++) { const v = Math.abs(W[i * n + k]); if (v > mx) { mx = v; p = i; } }
    if (!(mx > 0) || !isFinite(mx)) return null;
    if (p !== k) {
      for (let j = 0; j < n; j++) {
        let t = W[k * n + j]; W[k * n + j] = W[p * n + j]; W[p * n + j] = t;
        t = X[k * n + j]; X[k * n + j] = X[p * n + j]; X[p * n + j] = t;
      }
    }
    const inv = 1 / W[k * n + k];
    for (let j = 0; j < n; j++) { W[k * n + j] *= inv; X[k * n + j] *= inv; }
    for (let i = 0; i < n; i++) {
      if (i === k) continue;
      const f = W[i * n + k];
      if (f === 0) continue;
      for (let j = 0; j < n; j++) { W[i * n + j] -= f * W[k * n + j]; X[i * n + j] -= f * X[k * n + j]; }
    }
  }
  return X;
}

// Replaces A by (A + Aᵀ)/2 and returns the largest |Aij − Aji| / √(|Aii·Ajj|) it removed.
export function symmetrize(A: Float64Array, n: number): number {
  let worst = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = A[i * n + j];
      const b = A[j * n + i];
      const d = Math.abs(a - b) / Math.sqrt(Math.abs(A[i * n + i] * A[j * n + j]));
      if (d > worst) worst = d;
      const m = (a + b) / 2;
      A[i * n + j] = m;
      A[j * n + i] = m;
    }
  }
  return worst;
}

// Rows of a row-major n×n matrix as arrays.
export function toRows(A: Float64Array, n: number): number[][] {
  const out: number[][] = [];
  for (let i = 0; i < n; i++) out.push(Array.from(A.subarray(i * n, i * n + n)));
  return out;
}
