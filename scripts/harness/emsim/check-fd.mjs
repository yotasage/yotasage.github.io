// The independent check of step M1.4a (plan.md D11): the harness's finite-difference solver (fd/) on a few exact
// cases of facts-cases.md, its invariants, and a small subset of the fuzz against the boundary-element solver. The
// full fuzz of 500 structures is `npm run check:fd` (fd/fuzz.mts); notes-M1.4a.md has its results.

import * as F0 from './fd/solve.mts';
import * as X0 from './fd/exact.mts';
import * as Z0 from './fd/fuzz.mts';

const F = F0.default ?? F0;
const X = X0.default ?? X0;
const Z = Z0.default ?? Z0;

// Fuzz structures of the default seed where the BEM is outside the combined estimate (notes-M1.4a.md, "Outliers"):
// reported as notes, not failures, until the BEM is fixed.
export const KNOWN_OUTLIERS = new Set([7, 42]);

export async function run(t) {
  // Exact cases: within solver-fd.md §6's 2 × 10⁻⁴ and within the FD's own estimate.
  const want = new Set(['C15', 'C19', 'C26', 'C12']);
  for (const c of X.exactCases().filter((c) => want.has(c.id))) {
    for (const r of X.runExact(c, { levels: 4 })) {
      t.ok(r.rel <= 2e-4, () => `FD ${r.id} ${r.q}: ${r.got} against ${r.want} (${r.rel.toExponential(2)} > 2e-4)`);
      t.ok(Math.abs(r.got - r.want) <= r.err, () => `FD ${r.id} ${r.q}: error ${Math.abs(r.got - r.want).toExponential(2)} over its estimate ${r.err.toExponential(2)}`);
    }
  }
  // Invariants on an asymmetric pair (no mirror symmetry: the full grid) and its mirror-symmetric neighbour.
  const pair = (w2, er2) => ({
    signals: 2,
    conductors: [{ id: 1, pts: [-0.35, 0.1, -0.05, 0.1, -0.05, 0.135, -0.35, 0.135], open: 0 }, { id: 2, pts: [0.05, 0.1, 0.05 + w2, 0.1, 0.05 + w2, 0.135, 0.05, 0.135], open: 0 }],
    regions: [{ er: 4.3, pts: [-3, 0, 3, 0, 3, 0.1, -3, 0.1], open: 3 }, { er: er2, pts: [-3, 0.1, 3, 0.1, 3, 0.5, -3, 0.5], open: 7 }],
    planeBelow: 0, planeAbove: null, ext: 3, zLo: 0, zHi: 0.5,
  });
  const a = F.fdSolve(pair(0.2, 1), { levels: 3 });
  const C = a.C;
  t.ok(C[0][0] > 0 && C[1][1] > 0 && C[0][1] < 0, 'FD: C11, C22 > 0 and C12 < 0');
  t.ok(C[0][0] + C[0][1] >= 0 && C[1][1] + C[1][0] >= 0, 'FD: row sums of C ≥ 0');
  const lv = a.levels[a.levels.length - 1];
  t.ok(lv.C[0][0] >= C[0][0] && lv.C[1][1] >= C[1][1], 'FD: the finest level is above the extrapolation (variational, C_h ≥ C)');
  const h = F.fdSolve(pair(0.3, 4.3), { levels: 3 });
  t.near(h.C[0][0], 4.3 * h.C0[0][0], 'FD: one εr gives C = εr·C0', 1e-9);
  const s = pair(0.3, 2.2);
  const half = F.fdSolve(s, { levels: 3 }), full = F.fdSolve(s, { levels: 3, symmetry: false });
  t.ok(F.mirrorMap(s) !== null && F.mirrorMap(pair(0.2, 1)) === null, 'FD: mirror symmetry found exactly when present');
  for (const k of ['C', 'C0']) for (const [i, j] of [[0, 0], [0, 1]]) {
    t.near(half[k][i][j], full[k][i][j], `FD: even and odd halves equal the full grid (${k}${i + 1}${j + 1})`, 2e-6);
  }
  // Fuzz subset: the first 16 structures of the default seed on worker threads.
  const res = await Z.runPool(Array.from({ length: 16 }, (_, k) => k), Z.SEED, { levels: 4 }, Math.min(16, Z.defaultThreads()), 600_000);
  for (const r of res) {
    if (!t.ok(!!r.rows, () => `fuzz #${r.i}: ${r.skip}`)) continue;
    for (const x of r.rows) {
      const line = `fuzz #${r.i} ${r.desc}: ${x.q} FD ${x.fd.toPrecision(8)} ± ${x.eF.toExponential(1)}, BEM ${x.bem.toPrecision(8)} ± ${x.eB.toExponential(1)} (ratio ${x.ratio.toFixed(2)})`;
      if (KNOWN_OUTLIERS.has(r.i)) { if (!(x.ratio <= 1)) t.note(`known outlier ${line}`); continue; }
      t.ok(x.ratio <= 1, line);
    }
  }
}
