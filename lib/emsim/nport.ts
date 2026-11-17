// The N-port type (engine.md §8, step M1.7): frequencies, S-matrices, port reference impedances, the producer and the
// validity range. The via model returns it now and the full-wave solver will later, so the time-domain engine of
// phase 2 can take either. Also the small dense complex matrices the cascades use (ABCD → S, mixed-mode conversion)
// and the passivity and reciprocity measures. No Node APIs.

export const NPORT_VERSION = 1;

export interface NPort {
  version: number;
  ports: number;
  names: string[]; // port names, e.g. 'entry', 'exit' or 'A entry', 'B entry', 'A exit', 'B exit', or 'D1', 'D2', 'C1', 'C2'
  f: Float64Array; // Hz, ascending
  // S per frequency: ports × ports complex, row-major, re and im interleaved: s[((k·P + i)·P + j)·2 (+1)].
  s: Float64Array;
  z0: number[]; // real reference impedance of each port (Ω)
  producer: { name: string; version: number };
  valid: { fMin: number; fMax: number; reason: string }; // where the producer's model holds (outside: computed, not valid)
  mixed: boolean; // mixed-mode ports (differential first, then common)
}

// ---------- complex m × m matrices: Float64Array of 2m², (i, j) at 2(i·m + j) ----------

export function cIdentity(m: number, out: Float64Array = new Float64Array(2 * m * m)): Float64Array {
  out.fill(0);
  for (let i = 0; i < m; i++) out[2 * (i * m + i)] = 1;
  return out;
}

export function cMul(A: Float64Array, B: Float64Array, m: number, out: Float64Array = new Float64Array(2 * m * m)): Float64Array {
  for (let i = 0; i < m; i++) {
    for (let j = 0; j < m; j++) {
      let re = 0, im = 0;
      for (let k = 0; k < m; k++) {
        const a = 2 * (i * m + k), b = 2 * (k * m + j);
        re += A[a] * B[b] - A[a + 1] * B[b + 1];
        im += A[a] * B[b + 1] + A[a + 1] * B[b];
      }
      out[2 * (i * m + j)] = re;
      out[2 * (i * m + j) + 1] = im;
    }
  }
  return out;
}

// Inverse by Gauss–Jordan with partial pivoting; null when singular.
export function cInv(A: Float64Array, m: number, out: Float64Array = new Float64Array(2 * m * m)): Float64Array | null {
  const w = 2 * m;
  const a = new Float64Array(2 * m * w); // [A | I]
  for (let i = 0; i < m; i++) {
    for (let j = 0; j < m; j++) { a[2 * (i * w + j)] = A[2 * (i * m + j)]; a[2 * (i * w + j) + 1] = A[2 * (i * m + j) + 1]; }
    a[2 * (i * w + m + i)] = 1;
  }
  for (let c = 0; c < m; c++) {
    let p = c, best = -1;
    for (let r = c; r < m; r++) { const x = Math.hypot(a[2 * (r * w + c)], a[2 * (r * w + c) + 1]); if (x > best) { best = x; p = r; } }
    if (!(best > 0)) return null;
    if (p !== c) for (let j = 0; j < 2 * w; j++) { const t = a[2 * c * w + j]; a[2 * c * w + j] = a[2 * p * w + j]; a[2 * p * w + j] = t; }
    const pr = a[2 * (c * w + c)], pi = a[2 * (c * w + c) + 1], d = pr * pr + pi * pi;
    const ir = pr / d, ii = -pi / d;
    for (let j = 0; j < w; j++) {
      const k = 2 * (c * w + j), xr = a[k], xi = a[k + 1];
      a[k] = xr * ir - xi * ii; a[k + 1] = xr * ii + xi * ir;
    }
    for (let r = 0; r < m; r++) {
      if (r === c) continue;
      const fr = a[2 * (r * w + c)], fi = a[2 * (r * w + c) + 1];
      if (fr === 0 && fi === 0) continue;
      for (let j = 0; j < w; j++) {
        const k = 2 * (c * w + j), q = 2 * (r * w + j);
        a[q] -= fr * a[k] - fi * a[k + 1];
        a[q + 1] -= fr * a[k + 1] + fi * a[k];
      }
    }
  }
  for (let i = 0; i < m; i++) for (let j = 0; j < m; j++) { out[2 * (i * m + j)] = a[2 * (i * w + m + j)]; out[2 * (i * m + j) + 1] = a[2 * (i * w + m + j) + 1]; }
  return out;
}

// S of a 2N-port from its chain (ABCD) matrix [V1; I1] = [A B; C D]·[V2; I2] (N×N blocks, I2 flowing out of side 2),
// every port referenced to the real z0. Ports 0…N−1 are side 1, N…2N−1 side 2. With
// P = ½(A + B/z0 + z0·C + D), Q = ½(A − B/z0 + z0·C − D), R = ½(A + B/z0 − z0·C − D), U = ½(A − B/z0 − z0·C + D):
// S21 = P⁻¹, S22 = −P⁻¹Q, S11 = R·P⁻¹, S12 = U − R·P⁻¹·Q. P is regular for every passive network (also at DC).
// Writes the 2N × 2N S into out at offset (complex entries).
export function abcdToS(T: Float64Array, N: number, z0: number, out: Float64Array, offset = 0): boolean {
  const m = 2 * N, n2 = 2 * N * N;
  const P = new Float64Array(n2), Q = new Float64Array(n2), R = new Float64Array(n2), U = new Float64Array(n2);
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      for (let p = 0; p < 2; p++) {
        const a = T[2 * (i * m + j) + p], b = T[2 * (i * m + N + j) + p] / z0, c = T[2 * ((N + i) * m + j) + p] * z0, d = T[2 * ((N + i) * m + N + j) + p];
        const k = 2 * (i * N + j) + p;
        P[k] = 0.5 * (a + b + c + d); Q[k] = 0.5 * (a - b + c - d); R[k] = 0.5 * (a + b - c - d); U[k] = 0.5 * (a - b - c + d);
      }
    }
  }
  const Pi = cInv(P, N);
  if (!Pi) return false;
  const S11 = cMul(R, Pi, N), PQ = cMul(Pi, Q, N), RPQ = cMul(R, PQ, N);
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      for (let p = 0; p < 2; p++) {
        const k = 2 * (i * N + j) + p;
        out[offset + 2 * (i * m + j) + p] = S11[k];
        out[offset + 2 * (i * m + N + j) + p] = U[k] - RPQ[k];
        out[offset + 2 * ((N + i) * m + j) + p] = Pi[k];
        out[offset + 2 * ((N + i) * m + N + j) + p] = -PQ[k];
      }
    }
  }
  return true;
}

// ---------- mixed mode ----------

// Mixed-mode S from single-ended S (Bockelman–Eisenstadt): for each pair (i, j) a differential wave (aᵢ − aⱼ)/√2 and a
// common wave (aᵢ + aⱼ)/√2; S_mm = M·S·Mᵀ with M orthogonal, so unitarity and symmetry are kept. Port order: the
// differential ports of the pairs in order, then the common ports. In-place over nf matrices of P ports.
export function mixedS(s: Float64Array, P: number, nf: number, pairs: [number, number][], out: Float64Array = new Float64Array(s.length)): Float64Array {
  const M = new Float64Array(P * P);
  const h = Math.SQRT1_2, np = pairs.length;
  pairs.forEach(([i, j], p) => { M[p * P + i] = h; M[p * P + j] = -h; M[(np + p) * P + i] = h; M[(np + p) * P + j] = h; });
  const tmp = new Float64Array(2 * P * P);
  for (let k = 0; k < nf; k++) {
    const o = 2 * P * P * k;
    for (let i = 0; i < P; i++) for (let j = 0; j < P; j++) {
      let re = 0, im = 0;
      for (let q = 0; q < P; q++) { const m = M[i * P + q]; if (m) { re += m * s[o + 2 * (q * P + j)]; im += m * s[o + 2 * (q * P + j) + 1]; } }
      tmp[2 * (i * P + j)] = re; tmp[2 * (i * P + j) + 1] = im;
    }
    for (let i = 0; i < P; i++) for (let j = 0; j < P; j++) {
      let re = 0, im = 0;
      for (let q = 0; q < P; q++) { const m = M[j * P + q]; if (m) { re += tmp[2 * (i * P + q)] * m; im += tmp[2 * (i * P + q) + 1] * m; } }
      out[o + 2 * (i * P + j)] = re; out[o + 2 * (i * P + j) + 1] = im;
    }
  }
  return out;
}

// The mixed-mode N-port of a 4-port with pairs (0, 1) and (2, 3): ports D1, D2, C1, C2, references 2·z0 and z0/2
// (for z0ᵢ ≠ z0ⱼ: z0ᵢ + z0ⱼ and z0ᵢ·z0ⱼ/(z0ᵢ + z0ⱼ)).
export function toMixedMode(np: NPort, pairs: [number, number][] = [[0, 1], [2, 3]]): NPort {
  const s = mixedS(np.s, np.ports, np.f.length, pairs);
  const z0 = [...pairs.map(([i, j]) => np.z0[i] + np.z0[j]), ...pairs.map(([i, j]) => (np.z0[i] * np.z0[j]) / (np.z0[i] + np.z0[j]))];
  const names = [...pairs.map((_, p) => `D${p + 1}`), ...pairs.map((_, p) => `C${p + 1}`)];
  return { ...np, s, z0, names, mixed: true };
}

// ---------- access and checks ----------

export function sEntry(np: NPort, k: number, i: number, j: number): [number, number] {
  const o = 2 * ((k * np.ports + i) * np.ports + j);
  return [np.s[o], np.s[o + 1]];
}

// Largest |(SᴴS − I)ᵢⱼ| over all frequencies: 0 for a lossless network (unitary S), > 0 for loss, < 0 never.
export function unitarityError(np: NPort): number {
  const P = np.ports;
  let worst = 0;
  for (let k = 0; k < np.f.length; k++) {
    const o = 2 * P * P * k;
    for (let i = 0; i < P; i++) for (let j = 0; j < P; j++) {
      let re = i === j ? -1 : 0, im = 0;
      for (let q = 0; q < P; q++) {
        const a = o + 2 * (q * P + i), b = o + 2 * (q * P + j);
        re += np.s[a] * np.s[b] + np.s[a + 1] * np.s[b + 1];
        im += np.s[a] * np.s[b + 1] - np.s[a + 1] * np.s[b];
      }
      worst = Math.max(worst, Math.hypot(re, im));
    }
  }
  return worst;
}

// Passivity: the largest eigenvalue of SᴴS above 1, bounded here by the largest column-sum excess (0 when passive
// within rounding); for the lossless cascades unitarityError is the sharper measure.
export function passivityExcess(np: NPort): number {
  const P = np.ports;
  let worst = 0;
  for (let k = 0; k < np.f.length; k++) {
    const o = 2 * P * P * k;
    for (let j = 0; j < P; j++) {
      let p = 0;
      for (let q = 0; q < P; q++) p += np.s[o + 2 * (q * P + j)] ** 2 + np.s[o + 2 * (q * P + j) + 1] ** 2;
      worst = Math.max(worst, p - 1);
    }
  }
  return worst;
}

export function reciprocityError(np: NPort): number {
  const P = np.ports;
  let worst = 0;
  for (let k = 0; k < np.f.length; k++) {
    const o = 2 * P * P * k;
    for (let i = 0; i < P; i++) for (let j = i + 1; j < P; j++) {
      const a = o + 2 * (i * P + j), b = o + 2 * (j * P + i);
      worst = Math.max(worst, Math.hypot(np.s[a] - np.s[b], np.s[a + 1] - np.s[b + 1]));
    }
  }
  return worst;
}

// S at other real reference impedances (M6.2b; the full-wave run's ports are at their feeds' Z0): with power waves,
// a' = p·a + q·b, b' = q·a + p·b per port (p = (z + z')/(2√(z·z')), q = (z − z')/(2√(z·z'))), so
// S' = (Q + P·S)·(P + Q·S)⁻¹. Returns a new N-port; null when P + Q·S is singular at some frequency.
export function renormalize(np: NPort, z0: number[]): NPort | null {
  const P = np.ports, m2 = 2 * P * P;
  const s = new Float64Array(np.s.length);
  const num = new Float64Array(m2), den = new Float64Array(m2), inv = new Float64Array(m2), out = new Float64Array(m2);
  const p = np.z0.map((z, i) => (z + z0[i]) / (2 * Math.sqrt(z * z0[i]))), q = np.z0.map((z, i) => (z - z0[i]) / (2 * Math.sqrt(z * z0[i])));
  for (let k = 0; k < np.f.length; k++) {
    const o = k * m2;
    for (let i = 0; i < P; i++) for (let j = 0; j < P; j++) {
      const e = 2 * (i * P + j), re = np.s[o + e], im = np.s[o + e + 1], d = i === j ? 1 : 0;
      num[e] = q[i] * d + p[i] * re; num[e + 1] = p[i] * im;
      den[e] = p[i] * d + q[i] * re; den[e + 1] = q[i] * im;
    }
    if (!cInv(den, P, inv)) return null;
    s.set(cMul(num, inv, P, out), o);
  }
  return { ...np, s, z0: z0.slice() };
}
