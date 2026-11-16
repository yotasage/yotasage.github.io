// Dense linear algebra for the static solvers (solver.md §2.1): row-major Float64Array matrices, factorised in place.
// Plain loops over contiguous rows; no allocation inside the loops.

// LU factorisation with partial pivoting, P·A = L·U, in place (L unit lower, below the diagonal; U on and above).
// piv[k] is the row swapped with row k at step k. Returns the smallest |pivot| divided by the largest (0: singular).
//
// Blocked right-looking (M1.2b): columns are factorised four at a time (the same pivots as the unblocked algorithm,
// whole rows swapped), the block's rows of U are completed by a unit lower solve, and the trailing matrix gets one
// rank-4 update, four rows at a time, so that every element of the trailing matrix is loaded and stored once per four
// columns and the four rows of U once per four rows: 8.5 GFlop/s in Node on a Ryzen 9 7950X against 2.5 for the
// rank-1 form (n = 310 and 620).
export function luFactor(A: Float64Array, n: number, piv: Int32Array): number {
  let pmin = Infinity;
  let pmax = 0;
  for (let k0 = 0; k0 < n; k0 += 4) {
    const ke = k0 + 4 < n ? k0 + 4 : n;
    // the block's columns, with partial pivoting
    for (let k = k0; k < ke; k++) {
      const rk = k * n;
      let p = k;
      let mx = Math.abs(A[rk + k]);
      for (let i = k + 1, ik = rk + n + k; i < n; i++, ik += n) {
        const v = Math.abs(A[ik]);
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
      for (let ri = rk + n; ri < n * n; ri += n) {
        const f = A[ri + k] * inv;
        A[ri + k] = f;
        for (let j = k + 1; j < ke; j++) A[ri + j] -= f * A[rk + j];
      }
    }
    if (ke === n) break;
    // the block's rows of U right of the block: unit lower solve
    for (let r = k0 + 1; r < ke; r++) {
      const rr = r * n;
      for (let c = k0; c < r; c++) {
        const f = A[rr + c];
        if (f === 0) continue;
        const rc = c * n;
        for (let j = ke; j < n; j++) A[rr + j] -= f * A[rc + j];
      }
    }
    // trailing update, rank kb
    if (ke - k0 === 4) {
      const u0 = k0 * n;
      const u1 = u0 + n;
      const u2 = u1 + n;
      const u3 = u2 + n;
      let i = ke;
      for (; i + 3 < n; i += 4) {
        const ra = i * n;
        const rb = ra + n;
        const rc = rb + n;
        const rd = rc + n;
        const a0 = A[ra + k0], a1 = A[ra + k0 + 1], a2 = A[ra + k0 + 2], a3 = A[ra + k0 + 3];
        const b0 = A[rb + k0], b1 = A[rb + k0 + 1], b2 = A[rb + k0 + 2], b3 = A[rb + k0 + 3];
        const c0 = A[rc + k0], c1 = A[rc + k0 + 1], c2 = A[rc + k0 + 2], c3 = A[rc + k0 + 3];
        const d0 = A[rd + k0], d1 = A[rd + k0 + 1], d2 = A[rd + k0 + 2], d3 = A[rd + k0 + 3];
        for (let j = ke; j < n; j++) {
          const x0 = A[u0 + j], x1 = A[u1 + j], x2 = A[u2 + j], x3 = A[u3 + j];
          A[ra + j] -= a0 * x0 + a1 * x1 + a2 * x2 + a3 * x3;
          A[rb + j] -= b0 * x0 + b1 * x1 + b2 * x2 + b3 * x3;
          A[rc + j] -= c0 * x0 + c1 * x1 + c2 * x2 + c3 * x3;
          A[rd + j] -= d0 * x0 + d1 * x1 + d2 * x2 + d3 * x3;
        }
      }
      for (; i < n; i++) {
        const ri = i * n;
        const l0 = A[ri + k0], l1 = A[ri + k0 + 1], l2 = A[ri + k0 + 2], l3 = A[ri + k0 + 3];
        for (let j = ke; j < n; j++) A[ri + j] -= l0 * A[u0 + j] + l1 * A[u1 + j] + l2 * A[u2 + j] + l3 * A[u3 + j];
      }
    } else {
      for (let i = ke; i < n; i++) {
        const ri = i * n;
        for (let c = k0; c < ke; c++) {
          const f = A[ri + c];
          if (f === 0) continue;
          const rc = c * n;
          for (let j = ke; j < n; j++) A[ri + j] -= f * A[rc + j];
        }
      }
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
