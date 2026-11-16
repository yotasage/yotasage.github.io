// Mirror symmetry of the 2D boundary-element solver (M1.2b, solver.md §6): a cross-section whose panels are their
// own mirror image in a vertical line x = xc is solved as two half-size problems instead of one.
//
// Panel j has the mirror partner j′ (j′ = j for a panel the line cuts in half). The charge splits into an even part
// (s_j′ = s_j) and an odd part (s_j′ = −s_j), and because every kernel (free, image, parallel plates) commutes with
// the mirror, the collocation system splits exactly: for a representative row i and representative column j,
//   even: A_ij + A_ij′ (A_ij alone when j′ = j),   odd: A_ij − A_ij′ (pairs only; an odd charge on a self-mirror
//   panel is 0).
// The free kernel's constant V0 and the neutrality row belong to the even problem (the odd one has V0 = 0 and is
// neutral by itself). An excitation V splits into (V_i + V_i′)/2 and (V_i − V_i′)/2, the charges recombine to
// s_i = e_i + o_i, s_i′ = e_i − o_i, so the caller gets the charge on the whole boundary as from the full solve.
// The two LUs cost 2·(N/2)³ instead of N³ (4×), the assembly half the rows (2×); when every signal is its own
// mirror (a single trace on its axis) the odd problem has no excitation and is not solved at all (8×).
//
// The pairing is checked panel by panel (midpoint, length, direction, conductor or interface, εr, the interface
// row's factor times its normal), to 10⁻⁹ of the panel length plus a few units in the last place of the largest
// coordinate; any panel without a partner, or conductors that do not map onto each other consistently (ground onto
// ground), leaves the section to the full solve.

import { dnRow, interfaceFactor, potRow } from './kernels';
import type { Kernel, Panels } from './kernels';

export interface Mirror {
  xc: number; // the mirror line
  mate: Int32Array; // partner of every panel (itself on the line)
  reps: Int32Array; // representatives in the order of each pair's first panel (conductors first): the panel at x ≥ xc of every pair, and the self-mirror panels
  even: Int32Array; // slot of every panel's representative in the even problem
  odd: Int32Array; // slot in the odd problem (−1 for self-mirror panels), the same for both partners
  sign: Float64Array; // +1 for a representative, −1 for its partner (the odd part's sign), +1 on the line
  ne: number; // representatives (even unknowns, without V0)
  no: number; // pairs (odd unknowns)
  nce: number; // conductor representatives
  nco: number; // conductor pairs
  condMap: Int32Array; // conductor id → its mirror's id
  oddNeeded: boolean; // false when every signal is its own mirror
}

const REL = 1e-9;

export function findMirror(p: Panels, signals: number): Mirror | null {
  const N = p.n;
  if (N < 2) return null;
  let xmin = Infinity;
  let xmax = -Infinity;
  let big = 0;
  for (let i = 0; i < N; i++) {
    const ax = p.ax[i];
    const bx = ax + p.len[i] * p.tx[i];
    if (ax < xmin) xmin = ax;
    if (bx < xmin) xmin = bx;
    if (ax > xmax) xmax = ax;
    if (bx > xmax) xmax = bx;
    const az = Math.abs(p.az[i]);
    if (az > big) big = az;
  }
  const xc = 0.5 * (xmin + xmax);
  big = Math.max(big, Math.abs(xmin), Math.abs(xmax));
  const abs = 8 * Number.EPSILON * big;
  // panels by midpoint x
  const order = Array.from({ length: N }, (_, i) => i).sort((a, b) => p.mx[a] - p.mx[b]);
  const xs = new Float64Array(N);
  for (let k = 0; k < N; k++) xs[k] = p.mx[order[k]];
  let maxLen = 0;
  for (let i = 0; i < N; i++) if (p.len[i] > maxLen) maxLen = p.len[i];
  const span = REL * maxLen + abs;
  const mate = new Int32Array(N).fill(-1);
  const condMap = new Int32Array(signals + 1).fill(-1);
  for (let i = 0; i < N; i++) {
    if (mate[i] >= 0) continue;
    const tol = REL * p.len[i] + abs;
    const tx = 2 * xc - p.mx[i];
    // first index with xs ≥ tx − span
    let lo = 0;
    let hi = N;
    while (lo < hi) { const m = (lo + hi) >> 1; if (xs[m] < tx - span) lo = m + 1; else hi = m; }
    let found = -1;
    for (let k = lo; k < N && xs[k] <= tx + span; k++) {
      const j = order[k];
      if (mate[j] >= 0 && j !== i) continue;
      if (Math.abs(p.mx[j] - tx) > tol || Math.abs(p.mz[j] - p.mz[i]) > tol || Math.abs(p.len[j] - p.len[i]) > tol) continue;
      if ((p.cond[i] < 0) !== (p.cond[j] < 0)) continue;
      // direction: the mirror of t is (−tx, tz), up to the panel's orientation
      const d = p.tx[j] * -p.tx[i] + p.tz[j] * p.tz[i];
      if (Math.abs(Math.abs(d) - 1) > REL) continue;
      if (p.cond[i] >= 0) {
        if (p.epsC[i] !== p.epsC[j] && Math.abs(p.epsC[i] - p.epsC[j]) > REL * p.epsC[i]) continue;
      } else {
        // f·n of j must be the mirror of f·n of i: (−fi·nxi, fi·nzi)
        const fi = interfaceFactor(p, i);
        const fj = interfaceFactor(p, j);
        const ex = fj * p.tz[j] + fi * p.tz[i];
        const ez = -fj * p.tx[j] + fi * p.tx[i];
        if (Math.abs(ex) > REL * Math.abs(fi) || Math.abs(ez) > REL * Math.abs(fi)) continue;
      }
      found = j;
      break;
    }
    if (found < 0) return null;
    if (p.cond[i] >= 0) {
      const a = p.cond[i];
      const b = p.cond[found];
      if (condMap[a] === -1 && condMap[b] === -1) { condMap[a] = b; condMap[b] = a; } else if (condMap[a] !== b || condMap[b] !== a) return null;
    }
    mate[i] = found;
    mate[found] = i;
  }
  if (condMap[0] > 0) return null; // ground must map onto ground
  let oddNeeded = false;
  for (let s = 1; s <= signals; s++) {
    if (condMap[s] < 0) condMap[s] = s; // a signal without panels (cannot happen for a valid section)
    if (condMap[s] !== s) oddNeeded = true;
  }
  if (condMap[0] < 0) condMap[0] = 0;
  const even = new Int32Array(N);
  const odd = new Int32Array(N).fill(-1);
  const sign = new Float64Array(N);
  const reps: number[] = [];
  let ne = 0;
  let no = 0;
  let nce = 0;
  let nco = 0;
  for (let i = 0; i < N; i++) {
    const j = mate[i];
    if (j < i) continue; // the pair was taken at its first panel
    // the representative is the panel at x ≥ xc
    const r = j === i || p.mx[i] >= p.mx[j] ? i : j;
    const o = r === i ? j : i;
    reps.push(r);
    even[r] = ne;
    even[o] = ne;
    sign[r] = 1;
    sign[o] = j === i ? 1 : -1;
    if (i < p.nc) nce++;
    ne++;
    if (j !== i) {
      odd[r] = no;
      odd[o] = no;
      if (i < p.nc) nco++;
      no++;
    }
  }
  return { xc, mate, reps: Int32Array.from(reps), even, odd, sign, ne, no, nce, nco, condMap, oddNeeded };
}

// The even and odd matrices (n × n row-major, ne (+1 for the free kernel's V0) and no), with the same equations as
// kernels.ts `assemble`. The odd matrix is only built when `withOdd`.
export function assembleMirror(k: Kernel, p: Panels, m: Mirror, withOdd: boolean): { Ae: Float64Array; Ao: Float64Array | null; nE: number; nO: number } {
  const N = p.n;
  const free = k.kind === 'free';
  const nE = m.ne + (free ? 1 : 0);
  const nO = m.no;
  const Ae = new Float64Array(nE * nE);
  const Ao = withOdd && nO > 0 ? new Float64Array(nO * nO) : null;
  const row = new Float64Array(N);
  const mate = m.mate;
  const reps = m.reps;
  const ne = m.ne;
  for (let a = 0; a < ne; a++) {
    const i = reps[a];
    if (i < p.nc) potRow(k, p, i, p.mx[i], p.mz[i], row, 0);
    else { dnRow(k, p, i, p.mx[i], p.mz[i], p.tz[i], -p.tx[i], interfaceFactor(p, i), row, 0); row[i] += 1; }
    const re = a * nE;
    for (let c = 0; c < ne; c++) {
      const j = reps[c];
      const jj = mate[j];
      Ae[re + c] = jj === j ? row[j] : row[j] + row[jj];
    }
    if (free && i < p.nc) Ae[re + ne] = 1;
    if (Ao && mate[i] !== i) {
      const ro = m.odd[i] * nO;
      for (let c = 0; c < ne; c++) {
        const j = reps[c];
        const jj = mate[j];
        if (jj !== j) Ao[ro + m.odd[j]] = row[j] - row[jj];
      }
    }
  }
  if (free) for (let c = 0; c < ne; c++) { const j = reps[c]; Ae[ne * nE + c] = mate[j] === j ? p.len[j] : 2 * p.len[j]; }
  return { Ae, Ao, nE, nO };
}

// The vacuum problem's even (or odd) matrix: the conductor block of the even (odd) matrix, plus V0 and the
// neutrality row for the free kernel's even problem.
export function vacuumMirror(k: Kernel, p: Panels, m: Mirror, A: Float64Array, n: number, odd: boolean): { A0: Float64Array; n0: number } {
  const nc = odd ? m.nco : m.nce;
  const free = !odd && k.kind === 'free';
  const n0 = nc + (free ? 1 : 0);
  const A0 = new Float64Array(n0 * n0);
  for (let i = 0; i < nc; i++) {
    A0.set(A.subarray(i * n, i * n + nc), i * n0);
    if (free) A0[i * n0 + nc] = 1;
  }
  if (free) for (let c = 0; c < nc; c++) { const j = m.reps[c]; A0[nc * n0 + c] = m.mate[j] === j ? p.len[j] : 2 * p.len[j]; }
  return { A0, n0 };
}
