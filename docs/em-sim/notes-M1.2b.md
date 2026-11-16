# Notes from M1.2b – 2D boundary-element core: speed (2026-11-16)

## What was kept, and what each gave

Node, Ryzen 9 7950X, median after warm-up; the pair is M1.2a's (w 0.1, s 0.15, g 0.3, mask, ground to the edge,
620 panels at M = 2). Mesh unchanged.

| Measure | Where | Gain |
|---|---|---|
| **Blocked LU**: four columns factorised with the same pivots, U rows by a unit lower solve, trailing rank-4 update four rows at a time | `linalg.ts` `luFactor` | 2.5 → 8.5 GFlop/s; pair LU 62 → 17.5 ms |
| **Assembly loops written out** (`potRow`, `dnRow`): calls of `logI`/`logG` passed seven doubles boxed, and module-level `let` results were boxed on every write | `kernels.ts` | 21.6 → 12.2 ms (with the next row) |
| **Far panels by series** (midpoint > 8 lengths away, 74 % of the pair's entries): the closed form's own convergent series in ζ = τ·(L/2)/w, truncated below 3 × 10⁻¹⁷ of its leading term; one log for the potential, none for the field | `kernels.ts`, solver.md §2.3 | part of the 1.8× above; results move ≤ 6 × 10⁻¹⁴ |
| **Mirror symmetry**: even and odd halves, A_ij ± A_ij′ on representative rows; the odd half skipped when every signal is its own mirror | `symmetry.ts`, `bem2d.ts` | pair 39.8 → 15.6 ms (with estimate); microstrip LU 8× less |

Tried and dropped: rank-8 and 2-row blocks (7.2 GFlop/s against 8.5 for 4 × 4); a far series with reassigned `let`
accumulators (slower than the closed form in V8: the doubles were boxed).

Not done (not needed for the budgets): a per-edge base mesh and per-corner grading (BL79), which would also be the way
to fix the pair's `irregular` estimate at M = 2 (ratio 33, unchanged); a Schur complement to get the vacuum LU from the
dielectric one (the vacuum LU is 0.4 ms of 12); GMRES with a coarse-level preconditioner.

## Final timing (printed by `npm run check`, each budget a check)

| Case (M = 2) | With estimate | Single level |
|---|---|---|
| microstrip + mask (default setup), halves, 192 panels | 1.1 ms (budget 20) | 0.8 ms |
| pair + mask + coplanar ground, halves, 620 panels | **15.6 ms** (budget 40, was 118) | **12.3 ms** (≤ 15) |
| the same pair solved whole (`mirror: false`) | 39.8 ms | 36 ms |

**For the owner:** an asymmetric pair or three conductors still takes ≈ 36 ms a solve: Monte Carlo of 1000 ≈ 36 s,
a 100-point sweep ≈ 3.6 s, the inverse ≈ 0.4–0.7 s, over those budgets. Options: a coarser base mesh per edge (BL79),
level M = 1 for sweeps and Monte Carlo (the pair at M = 1 is within 0.03 % of M = 4), or a worker per core.

## Accuracy

The exact-case table, orders, estimates and C39 print the same digits as M1.2a; invariance rows moved within rounding
(≤ 4 × 10⁻¹⁵). Halves against the full solve of the same panels (new harness rows, three kernels, eight sections):
C, C0, L ≤ 6 × 10⁻¹⁵, charges ≤ 1.4 × 10⁻¹², the same estimate status.

## API for M1.3

- `solveSection(section, { M: 2 })`: level M with the estimate from M/2 and M/4 (the page's result).
- `solveSection(section, { M: 2, estimate: false })`: **level M alone**, status `unchecked`, for sweeps, Monte Carlo
  and the inverse solve's iterations; check the final point with the estimate.
- Symmetric sections are found by themselves (`levels[k].mirror` says so); `mirror: false` forces the full solve
  (the harness compares both). A section that is symmetric only to more than 10⁻⁹ of a panel length is solved whole.

## For M1.5 (fields)

`levels[k].q` and `q0` hold the charge on **every panel of the whole boundary** (indices of `levels[k].mesh`), also
after a symmetric solve: `q[j′] = e − o`, `q[j] = e + o` for partners j, j′ (`findMirror(mesh, n).mate`). Nothing of
the halves leaks out, so the potential and field formulas of notes-M1.2a.md hold unchanged. For the free kernel the
constant V0 is not kept (solve it from a conductor panel as before). Field evaluation at many points should use
`potRow`-style loops (no per-entry calls with doubles) for speed; `panelPot`/`panelDn` stay for single points.
