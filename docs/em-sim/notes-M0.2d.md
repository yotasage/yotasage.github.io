# Notes from M0.2d – literature pointers (2026-11-16)

## What was done

- [literature.md](literature.md): 57 papers in four groups (2D solver 10, pair definitions 12, calculators against
  solvers and measurements 16, vias 19), each with what its abstract says and the step it is for, a ranked list of
  eight worth opening, and the counts dropped.
- `references.bib`: 57 entries with DOIs (comment "step M0.2d"); parsed by `lib/bibtex.ts`, keys unique.
- [sources.md](sources.md): section "Literature, abstracts only (M0.2d)".
- Verification: 84 candidate papers searched on Crossref by title; 77 matched in title, authors and year (7 did not
  and are dropped); 20 of those left out as off topic after their abstracts. No paper was opened.

## Most useful per step

- **M1.2:** `Zhechev2026` (closed-form grading per corner from the wedge exponent, including etch angles and
  copper–dielectric junctions; charge-based refinement stalls). `Wei1984` is our formulation; `Cecchini2001` extracts
  the singularity at composed wedges (the mask's triple points).
- **M1.3:** `Carin1989` (two modal impedance definitions, negative values for asymmetric lines), `Nickel2001` (Zc
  matrix and modes from S-parameters), `Yan2026` (dispersion-onset frequency of pairs for a validity flag).
- **M1.4:** `Wan1996` (coupled microstrip closed form with stated 0.4 % / 1.2 % / 1.8 % accuracy), `Garg1979`
  (asymmetric pairs, about 5 %), `Bongiorno2015` (spread between formulas; no abstract), `Chen2017` (2D quasi-static
  as the impedance target for 3D runs).
- **M1.6:** `Friedrich2012b` (exact via-plate capacitance), `Kok1993` (excess C and L of a via, pads and opening),
  `Zhang2008` (wall radius and mode convergence), `Friedrich2013` (the frill formula is wrong for large pads).
- **M1.7:** `RimoloDonadio2009a` and `Muller2011` (physics-based model with parallel-plate impedance), `Kok1994`,
  `Archambeault2004` and `Cartier2007` (where quasi-static via circuits stop holding), `Kushta2003` (stubs).

## Against solver.md's decisions (flagged, solver.md unchanged)

1. **Grading (solver.md §2.5: one q = 2 on every edge, no singular basis):** `Zhechev2026` says per-corner grading
   from the local exponent reaches 10⁻⁴ in C with half the unknowns. Not a contradiction of the measured orders, but a
   candidate for M1.2's open jobs (the 10⁻⁵–10⁻⁴ drift, the pair's 57 ms against 40 ms) and for trapezoidal traces.
2. **Error estimate (|Z(M) − Z(M/2)| with a floor):** the same abstract says iterative refinement criteria "fail
   silently" on some structures. M1.2 should test the estimate against the exact cases at their worst, not only the
   typical ones.
3. **Via model:** engine.md flags a via without a nearby return via as outside the quasi-static model. The literature
   models that case with the parallel-plate (cavity) impedance (`RimoloDonadio2009a`, `Friedrich2012c`, `Chada2009`):
   a possible later extension, no conflict now.
4. **Pair impedance:** `Carin1989` supports showing the Zc matrix and the mixed-mode Zdiff (facts.md's default)
   rather than per-mode impedances, which can be negative for asymmetric lines. No conflict.

## Open

- Abstracts only: numbers above may be cited only as "the abstract says". The owner may fetch the eight papers ranked
  in literature.md; a step that reads one moves it in sources.md to an "Opened" section.
