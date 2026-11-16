# EM simulation – the harness's finite-difference solver (design, step M0.3, 2026-11-16)

The independent check of D11: a 2D Laplace solver by finite differences, written for the harness by M1.4's agent,
who **reads this file, engine.md §2–§4 (the stackup, the structures and the 2D solver's contract), facts.md,
facts-fab.md and facts-cases.md, and never `lib/emsim/` beyond the structure types and the JSON form of a structure**
(the files M1.1 names as the model; not the geometry builder, not the solver). Two methods that share no code and no
discretisation idea (boundary elements with total charge against a volume grid with ε per cell) agree only if both
are right. It runs offline in the harness, never on the site.

## 1. Interface

```ts
// scripts/harness/emsim/fd/solve.mts
export function fdSolve(structure: StructureJson, opts?: FdOptions): FdResult;
interface FdOptions { levels?: 3 | 4; hMin?: number; growth?: number; boxFactor?: number; tol?: number }
interface FdResult {
  C: number[][]; C0: number[][];            // F/m, n × n Maxwell matrices of the signal conductors (Richardson)
  err: { C: number[][]; C0: number[][] };   // absolute error estimates, same shape
  order: number[];                          // measured order p per level triple, for C11
  levels: { nx: number; nz: number; C: number[][]; C0: number[][]; ms: number }[];
  box: { C11Change: number };               // relative change of C11 when the box is doubled (§3)
  ms: number;
}
```

A CLI (`node fd/cli.mjs structure.json > result.json`, through tsx) for fixtures. Input is the trace cross-section
as engine.md §3 describes it, in the JSON form M1.1 defines (stackup layers with thickness and εr, conductors with
layer, width, u position, etch, references, mask with its three thicknesses). **The FD solver resolves that
description into geometry itself** (layer z, trace rectangles, mask outline, plane positions), following the
conventions of engine.md §2–3 and facts-fab.md §1 (mask 30.5 µm on laminate, 15.2 µm on copper, the side thickness as
the engine contract states it, gaps at the bottom of the copper). An independent resolution also checks the engine's
geometry builder; where the conventions are ambiguous, M1.4 writes the question down instead of reading the engine.

Supported exactly: rectangular conductors (etch 0) and zero-thickness strips (one row of Dirichlet nodes), any number
of dielectric layers, the mask as a union of rectangles, planes, coplanar grounds of any width or to the edge. A
trapezoid (etch ≠ 0) is drawn as a staircase on the grid; its error is first order and is stated as such (the
comparison with the BEM uses a looser tolerance for those, §6). Circles (via cuts) are not supported: the via cuts are
homogeneous and are checked against the exact coax, eccentric coax and two-wire cases instead.

## 2. Grid

- **Tensor-product, non-uniform** grid in (u, z). The lines include every geometric coordinate: each conductor's left
  and right edge, every layer boundary and copper top and bottom, every mask edge and step, the planes. Material
  boundaries therefore lie on grid lines and every cell has one εr.
- Spacing: **h_min at each copper corner** (default h_min = min(feature)/40, feature = widths, gaps, thicknesses,
  mask steps), growing geometrically by at most **growth = 1.2** per cell away from every corner coordinate, capped at
  h_max = (smallest feature)/4 within the structure's span, then growing by 1.3 per cell to the box.
- **Levels:** level 0 as above; level ℓ halves every cell (inserting midpoints), so levels are nested and the ratio is
  exactly 2. Default 3 levels (4 for the reference fixtures).

## 3. Boundaries

- **Planes:** Dirichlet φ = 0 on their grid lines; the domain ends there (nothing beyond a solid plane matters).
- **Box:** where there is no plane (above a microstrip, both sides, below a structure without ground) the domain ends
  at a box at boxFactor (default 200) × the structure's size S (the larger of its height above the plane and its
  width), reached by the growing spacing in about 30 cells. **Neumann (∂φ/∂n = 0) on the box.** Neumann is the right
  far condition in 2D: it makes the total flux out of the box zero, i.e. the net charge zero, which is the condition
  under which a 2D capacitance between conductors is defined (a Dirichlet box would act as a further ground and bias
  C by about 1/ln(box) for structures without a plane). With a plane the far field is a dipole, and the box error is
  O((S/box)²) ≈ 2.5 × 10⁻⁵ at 200·S. The solver reports the change of C11 when the box is doubled (`box.C11Change`)
  on the finest level of the first structure of a batch, and M1.4 sets boxFactor so that it is below 10⁻⁵.

## 4. Discretisation and charge

- Unknowns at grid nodes; conductor nodes (inside or on a conductor) are Dirichlet (1 on the driven signal, 0 on the
  others and on grounds). εr per cell.
- **Five-point finite-volume stencil:** the flux between neighbouring nodes uses the dual edge's ε, the
  length-weighted mean of the two cells the dual edge crosses. This is the same matrix as linear finite elements on
  each rectangle cut into two right triangles (the hypotenuse couplings vanish), so the scheme is **variational**: the
  discrete energy is the minimum over the discrete space and **C_h ≥ C** converges from above, which makes
  Richardson extrapolation well behaved and gives a sign check.
- **Charge by the residual**: Q_k = Σ over the nodes of conductor k of (K·φ)_node (the reaction at the Dirichlet
  nodes), times ε0. This equals the energy method exactly (C_kj = φ_kᵀ·K·φ_j), needs no contour, and gives a symmetric
  C to solver tolerance (checked: ‖C − Cᵀ‖/‖C‖ < 10⁻⁹).
- C0: the same grid with every εr = 1.

## 5. Linear solver, levels, extrapolation

- The matrix is symmetric positive definite (Dirichlet nodes eliminated). **Conjugate gradients with an incomplete
  Cholesky IC(0) preconditioner**, stopped at a relative residual of 10⁻¹² (tol), one solve per signal conductor and
  per medium (C, C0). A banded direct Cholesky is the fallback if CG stalls (bandwidth n_x).
- **Richardson:** with values C(ℓ) at three nested levels, the measured order p = log2(|C1 − C0| / |C2 − C1|) per
  entry, then C_R = C2 + (C2 − C1)/(2^p − 1); error estimate |C_R − C2| (at least 2× the difference of the last two
  extrapolations when 4 levels are run). Expected p: about 4/3 near re-entrant copper corners on a uniform grid
  (φ ~ r^{2/3}), closer to 2 with the corner grading of §2; zero-thickness strips p ≈ 1 uniform, better graded.
  If p falls outside [0.8, 2.5], the result is flagged and the comparison uses the finest level with the larger
  estimate |C2 − C1|.
- Z values (Z0, Zodd, Zeven, Zdiff, Zcm) follow from C_R and C0_R by facts.md's definitions in the harness's own
  small code (Zc by eigen-decomposition with any method; not the engine's).

## 6. Expected accuracy and run time

- **Accuracy:** ≤ 2 × 10⁻⁴ relative on C after extrapolation for rectangular conductors (four levels, h_min = feature/40
  at level 0); staircased trapezoids about 10⁻³, stated per structure.
- **Run time** (estimate for M1.4 to confirm): level 2 of a microstrip with mask is about 200 × 150 = 3 × 10⁴ nodes,
  level 3 about 1.2 × 10⁵; PCG with IC(0) needs a few hundred iterations at 10⁻¹², about 15 flops per node and
  iteration: ≈ 0.5–1 s per right-hand side at the finest level in JavaScript; a pair (2 signals × 2 media × 3–4 levels)
  takes a few seconds. Hundreds of random structures fit in a few minutes; the fixtures of the reference set are
  computed once and stored as JSON with their provenance.

## 7. What M1.4 checks with it

1. **The FD solver itself** against the exact cases of facts-cases.md: C14–C18 (Cohn stripline, zero-thickness strip
   between two Dirichlet planes; C18 w/b = 5 is a good wide case), C19–C29 (coupled stripline), C26/C27 (CPW,
   zero-thickness, with C26's half-space substrate as a deep layer and Neumann box), C12/C13 (plates: a wide strip
   with Neumann side walls at its edges is exactly the infinite plate). Its measured order and error per case.
2. **BEM against FD** on the owner's cases (C39–C42) and on **hundreds of random structures** (seeded): microstrip,
   embedded microstrip, stripline and dual stripline, pairs, coplanar grounds, mask on and off, widths 0.05–1 mm,
   heights 0.05–0.5 mm, εr 2–10, copper 0.012–0.07 mm. Pass: |BEM − FD| ≤ e_BEM + e_FD + 10⁻⁴ (relative) on every
   entry of C and C0 and on every Z, where e are the two solvers' own estimates; a failure prints the structure as JSON
   for a fixture.
3. **Invariants** (both solvers): C symmetric, C11 > 0, C12 < 0, row sums ≥ 0; mirror and swap invariance; a uniform
   εr gives C = εr·C0; scaling all lengths leaves C unchanged.
