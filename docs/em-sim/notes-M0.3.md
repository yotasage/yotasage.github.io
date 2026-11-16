# Notes from M0.3 – static solvers: formulation and spikes (2026-11-16)

## What was done

- [solver.md](solver.md): the 2D boundary-element formulation, modes, axisymmetric solver, via model and the measured
  budgets; its §1 answers every "M0.3 decides" of engine.md, which now points to it (§4, §5, §6.1, §6.3, §10).
- [solver-fd.md](solver-fd.md): the design of the harness's finite-difference solver for M1.4.
- Spike in `scripts/harness/emsim/spikes/` (`bem2d.mts`, `run.mts`; `npm run spike [exact|refined|trunc|eta|time|lu|agm]`
  in `scripts/harness/emsim`, whose `package.json` has only `tsx`). The full run takes about 3 minutes.

## What each next step must know

- **M1.2:** formulation in solver.md §2. Closed-form integrals on every pair (a near/far split with η = 3 caused a
  10⁻⁴ drift at fine levels). Grading q = 2 (q = 3 is worse with a mask). Default result at level M = 2 of the base
  mesh, estimate |Z(M) − Z(M/2)| with a floor of 10⁻⁵·Z. Two jobs left open: (1) the slow drift of 1–2 × 10⁻⁵ (mask)
  and 1.3 × 10⁻⁴ (pair) beyond 364 panels, probably the mask ray's nodes staggered 15 µm against the copper ray's:
  align them and re-measure; (2) mirror symmetry (even and odd halves) to bring the pair under its budget (§6).
  Interfaces must be split where they meet copper; probe the medium on each side at 0.1 × the panel length, not at a
  fixed tiny offset (a polygonal interface's midpoint lies inside the curve: the spike's first coax run silently
  dropped its interface that way).
- **M1.3:** Cholesky + cyclic Jacobi on W′ = R·L·Rᵀ, Zc = R⁻¹·U·Λ^{1/2}·Uᵀ·R⁻ᵀ; clusters at 10⁻⁹ relative, rotated by
  the eigenvectors of Pᵀ·C⁻¹·P; "not resolved" flag when the gap is under the εeff estimate (solver.md §3).
- **M1.4:** reads solver-fd.md only (plus engine.md §2–§4 and the facts files), not `lib/emsim` beyond the structure
  types. The BEM's own exact-case orders to compare with: C15 2.05–2.16, C11 1.98–1.99, C04b 1.96–1.99.
- **M1.6:** ring kernel with the log subtracted in closed form (reuse the 2D `I`), 8-point Gauss on the rest, K and E
  by the AGM with a bounded loop (29 ns per pair; the unbounded loop hung), grounded wall at R_w = antipad + 4 h_max,
  excess capacitance by z windows (solver.md §4). Check the two field formulas against differences of φ first.
- **M1.7:** cascade one sub-segment per dielectric layer (exact for the radial barrel field; no averaging); the via
  cut is solved once in vacuum; pair pad coupling ΔC12 = ΔC·(−C12/C11), flagged (solver.md §5).

## Measured

- Exact cases, Z0 error: C15 Cohn stripline 0.024 % at 32 panels (order 2.1); C11 wire over plane 0.044 % at 64
  (order 2.0); C04b half-filled coax 0.054 % at 313 (order 2.0). C04 two-layer coax (curved interface) converges at
  order < 1: curved interfaces are not used (none occur in the product).
- Owner's microstrip C39 with JLCPCB mask: 50.526 Ω (εeff 3.292); 0.011 % error at 182 panels; without mask
  54.158 Ω, Hammerstad–Jensen 0.19 % lower.
- Dense LU in JavaScript: 2.6 / 38 / 348 / 3573 ms at n = 200 / 500 / 1000 / 2000 (about 2 GFlop/s).
- Full solve with estimate: microstrip with mask 6.5 ms (budget 20 ms, met); pair with mask and coplanar ground
  57 ms (budget 40 ms, **not met**).

## For the owner (budgets are yours to change)

1. **Coupled pair with mask and coplanar ground: 57 ms against 40 ms** (44 ms without the error estimate), on this
   laptop in V8. With it the pair rows of inverse (≈ 0.9 s for 0.3 s), sweep (≈ 5.7 s for 2 s) and Monte Carlo
   (≈ 44–57 s for 20 s) are over too. M1.2's mirror-symmetry reduction should bring symmetric pairs to about 20 ms
   (estimate); asymmetric pairs and three conductors would stay near 45–60 ms. Options: accept 60 ms for asymmetric
   structures, or Monte Carlo at the result level without per-sample estimates. Single traces meet every budget.
2. **Via model 30 ms:** the axisymmetric solve is estimated at about 50 ms for a 6-layer via (not measured). Proposal:
   cache it by the pad geometry, so the 30 ms holds except while dragging a pad, antipad or drill (a new result every
   3–4 frames). M1.6 measures.

## Open questions

- Mask side-wall thickness: the spike used the over-copper 15.2 µm on the trace sides; facts-fab.md gives three
  thicknesses but none for sides. M1.1 states the convention (and the FD resolution follows engine.md, not the spike).
- Whether pads and planes are modelled as zero-thickness sheets or rings of copper thickness in the axisymmetric solve
  (M1.6 measures the difference).
