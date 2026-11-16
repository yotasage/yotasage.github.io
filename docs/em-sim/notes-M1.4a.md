# Notes of step M1.4a – the independent check (2026-11-16)

Independence (D11): this step's agent read none of the solver files (`linalg`, `kernels`, `panels`, `bem2d`,
`symmetry`, `modes`, `lines`, `inverse`, `vary`), nor solver.md, modules.md, notes-M0.3/M1.2a/M1.2b/M1.3, the spikes
or check-bem/modes/vary. The BEM is called only through `solveSetup` and `setupSection`. The FD solver has its own
linear algebra (CG, Jacobi eigen, Gauss–Jordan).

## The FD solver (`scripts/harness/emsim/fd/`)

- `solve.mts` reads a Section (the shared input: material-tagged polygons; solver-fd.md §1 wanted it to read the
  structure JSON itself, but the brief made the Section the input). Tensor grid with every polygon coordinate as a
  line, graded at 1.3 from every corner, h_min = min(copper thickness, width, gap, height)/6, h_max = (width, gap,
  height)/2, box at 200 × size with Neumann. Five-point finite volumes (ε of the dual edge, = linear FE: C_h ≥ C).
  Dirichlet conductors and planes, CG with MIC(0), tol 10⁻¹¹, charge as the reaction at conductor nodes.
- **Levels ("corner" grading):** level ℓ halves h_max and the growth − 1 but quarters h_min, so the corner
  singularities (r^½ for strips, r^⅔ for copper) converge at the bulk's order 2 (measured p 2.05–2.2). Plain halving
  ("nested", kept as an option) gave p ≈ 1.2–1.4 and extrapolated errors of 7 × 10⁻⁴.
- Four levels, Richardson per entry. Error: twice the change between the last two extrapolations, at least 0.1 ×
  |C_R − C_finest|. An entry whose order is outside [0.8, 2.5] keeps the finest level and |C2 − C1|.
- Mirror-symmetric sections are solved as even and odd halves (C = Q·P⁻¹ over the drive patterns). This halves the
  time and agrees with the full grid to 10⁻⁷.
- `lines.mts`: L = μ0ε0·C0⁻¹, Zc = C^−½ (C^½ L C^½)^½ C^−½, mode εeff, symmetric Zodd/Zeven, definition-A Zdiff/Zcm.
  Per line as the API reports (read from its output): z0 = Zc_kk, eeff = C_kk/C0_kk.

## Accuracy on exact cases (`tsx fd/exact.mts 4`)

| Cases | Worst relative error | Error inside own estimate |
|---|---|---|
| Cohn stripline C14–C18 (zero thickness; C15 also at εr 4.3) | 6.9 × 10⁻⁵ | all (ratio ≤ 0.42) |
| Coupled stripline C19, C21, C23, C28, C29 | 4.8 × 10⁻⁵ | all (≤ 0.57) |
| CPW C27 (air), C26 (half space 4.3: Z0; εeff = 2.65 to 2 × 10⁻¹⁰) | 7.3 × 10⁻⁵ | all |
| Plates C12, C13 between Neumann walls | 2 × 10⁻¹⁰ | all |

All meet solver-fd.md §6's 2 × 10⁻⁴. The estimate is honest but loose (typically 3–20 × the true error).

## The fuzz (`npm run check:fd`: 500 structures, seed 20261116, 892 s on 16 threads)

Preset stackups, dielectrics 0.05–0.5 mm with εr 2–10, copper 0.012–0.07 mm (20 % etched), mask × 0.5–1.5, widths
and gaps 0.05–1 mm, coplanar gaps 0.05–0.5 mm, mask on 60 %. Quantities: Z0 and εeff per line, mode εeff, Zc,
Zdiff, Zcm, Zodd/Zeven (symmetric pairs). Ratio = |FD − BEM|/(e_FD + e_BEM); rel = |FD − BEM|/BEM.

| Kind | Cases | Quantities | Over | Median ratio | Max ratio | Median rel | Max rel |
|---|---|---|---|---|---|---|---|
| microstrip | 49 | 147 | 6 | 0.38 | 1.34 | 1.9e-3 | 1.2e-2 |
| embedded | 39 | 117 | 0 | 0.34 | 0.98 | 4.2e-4 | 5.0e-3 |
| stripline | 42 | 126 | 3 | 0.18 | 1.23 | 2.1e-4 | 6.5e-3 |
| stripline2 | 42 | 126 | 2 | 0.24 | 1.50 | 3.1e-4 | 4.2e-3 |
| cpw | 45 | 135 | 4 | 0.58 | 1.20 | 1.9e-3 | 2.3e-2 |
| cpwg | 42 | 126 | 7 | 0.65 | 1.73 | 1.3e-3 | 1.7e-2 |
| pair-microstrip | 42 | 546 | 33 | 0.53 | 7.44 | 9.3e-4 | 1.5e-2 |
| pair-stripline | 36 | 468 | 14 | 0.24 | 1.65 | 2.0e-4 | 3.4e-3 |
| pair-cpw | 47 | 611 | 21 | 0.45 | 2.25 | 6.5e-4 | 1.2e-2 |
| broadside | 37 | 407 | 16 | 0.22 | 4.72 | 2.5e-4 | 7.2e-3 |
| asym-microstrip | 45 | 495 | 46 | 0.57 | 2.71 | 7.0e-4 | 1.4e-2 |
| asym-stripline | 34 | 374 | 7 | 0.29 | 1.68 | 1.9e-4 | 5.8e-3 |
| **all** | 500 | 3678 | 159 | 0.40 | 7.44 | 4.9e-4 | 2.3e-2 |

## Outliers: 159 quantities in 58 structures, all on the BEM's side

**The pattern:** C0 (vacuum) agrees to a median of 1.1 × 10⁻⁴ (max 1.0 × 10⁻³). C with dielectrics differs by a
median of 9.7 × 10⁻⁴ (max 2.3 × 10⁻²), and the difference grows with the εr contrast to air (median 3 × 10⁻⁴ for
contrast 2–3, 9.7 × 10⁻⁴ above 3). The FD's C is the larger in every case examined. All but #73 and #149 have BEM status
"irregular". Worst cases: #42 (pair-microstrip, εr 9.94, Zc11 FD 51.661 ± 0.004 against
BEM 51.703 ± 0.0015, ratio 7.4), #345 (broadside, 4.7), #414 (Zc12, 3.1), #406, #322, #274, #260.

**Why the FD is believed:** on #7, #42 and #192 the FD's C moves by at most 1.4 × 10⁻⁵ under a finer level 0
(h_min/2, h_max/2), a larger box (800) or the other grid family ("nested"). The difference stays 1.1–1.7 × 10⁻³
(1.2 × 10⁻² on #192). The FD is exact on the dielectric exact cases (C13, C26). So the BEM's C with dielectrics is low
at high contrast, and its error estimate does not cover it. Explanation (unconfirmed, the BEM was not read): the
treatment of dielectric interfaces, likely where an interface meets copper. **Unexplained in detail; for the fix agent.**
Reproduce one with `tsx fd/one.mts <index> ['{"hMinDiv":12}']`; it prints both solvers' C, C0 and every quantity.

FD-side causes ruled out: no overlapping regions in #7 and #42; the half and full grids agree; the FD error estimate is
honest on every exact case.

## For later steps

- `check-fd.mjs` (group "FD reference (M1.4a)", 17 s): four exact cases, invariants (signs, row sums, C_h ≥ C,
  C = εr·C0, mirror detection, halves = full grid) and fuzz cases 0–15. `KNOWN_OUTLIERS` (#7, #42) are notes, not
  failures. Remove them when the BEM is fixed.
- Etched copper is drawn as a staircase (first order). The comparison does not loosen the bar for it, and etched
  structures are 14 of the 58 outliers (20 % of all).
- The full fuzz takes 15 min because the solves are memory-bound: SMT threads do not help, so it uses half the
  logical cores (`FD_THREADS` overrides). `tsx fd/fuzz.mts [count] [seed] [levels]`.
