# Smith chart – notes of step M0.2 (research pass), 2026-11-11

## Done

- [facts.md](facts.md): the conventions of engine.md §1 with sources, 28 equations each with a source (book, section,
  the page's equation label) or a derivation, the owner's notes checked item by item, the values real L and C come in,
  and the constants the sources use.
- [facts-cases.md](facts-cases.md): 28 worked cases (C1–C28) with the sources' numbers and ours to 10 digits, covering
  Γ ↔ z ↔ y, VSWR, return and mismatch loss, power, line input impedance, a line of another Zc, λ/4, open and short
  stubs, single-stub, single-reactance and L-network matching (two-solution case included).
- [sources.md](sources.md): seven sources opened, what each may and may not be cited for, the sources not opened, and
  a topic map for the Theory section.
- references.bib: `Ellingson2018`, `SteerVol2`, `SteerVol3`, `WikiSmith`, `Touchstone21`, `JohansonHighQ`,
  `WurthWEKI` (the file is now CRLF throughout; it had a few LF lines).
- Web pages were read by Haiku sub-agents, one question each; every number they returned was recomputed in Node.

## Findings

- **engine.md §1 is right**: the signs of X and B, Γ, the circle centres and radii, and the directions (series L and
  shunt C clockwise, series C and shunt L counter-clockwise, a line clockwise). No opened source states the lumped
  directions in words; facts.md §1 derives them (dΓi/dx = 2/(r+1)² > 0 at the leftmost point of the r circle,
  dΓi/db = −2/(1+g)² < 0 at the rightmost point of the g circle). No change to engine.md.
- **Owner's notes**: 1, 2, 4, 6 and the r circle of 7 verified; 3 (plain text) and the x circle of 7 (i for 1)
  corrected; "Addmittance" corrected; 5, 8–11 verified and completed to circle form. Also checked numerically.
- **No source prints the circle centres and radii.** Steer and Wikipedia name the families only; the Theory section
  must show the derivation (facts.md §3), which is what learning.md §4 plans anyway.
- **The LibreTexts pages print no equation numbers.** Cite by section (e.g. "[3, §3.15]"), not "(3.15.4)".
- **Mismatch loss** has no formula in an opened source; it is shown as derived from P_load = (1 − \|Γ\|²)P_inc
  (Ellingson §3.20).
- **Z_in from ABCD** is not printed in Steer; derived in facts.md eq. 27 and checked equal to the line formula.
- **Sources' slips** (do not copy; harness against ours): Steer III Example 6.7.2 drops a minus (x_S = 0.411 is
  right); Steer II §2.3 Example 3 gives VSWR 285 from a rounded \|Γ\| (exact 298.118); Steer II §2.4 eq:20 tan⁻¹ for
  cot; Steer III §3.4 sign of φ_D; chart readings in Wikipedia's examples (j1.52 for j1.558).
- **c = 3·10⁸** in the textbooks' examples; the engine should use the exact c and the harness compares lengths with
  the source's c where the case says so.

## Decisions

- Wikipedia is cited only where no opened textbook says the same (Γ(r, x), Γ(g, b), part normalisation, Y chart as the
  rotated grid). Textbooks first.
- The Smith papers are not in references.bib: the scans could not be opened. Their bibliographic facts (from
  Wikipedia) are in sources.md for a history line citing `WikiSmith`.
- Touchstone is cited only for its existence and date until M8 reads the PDF (password-protected against extraction).
- Facts split in two files (facts.md 15 kB, facts-cases.md 11 kB) so neither nears 40 kB.

## Open questions (for the owner, before M4)

1. Realisable values: E24 for capacitors from 1 pF (0.1 pF steps below), and for inductors? Makers' lists are
   irregular (WE-KI 0402: 1.9, 2.4 nH …). Proposal: E24 for both by default, E12 as a choice, tolerances shown.
2. Coilcraft, Murata and TDK pages refuse automated reading. If the owner wants their ranges (e.g. 0402HP, GJM15),
   saving the datasheets in `.local/` would let a later step read them.
3. Should the page name Pozar? Only if the owner has a copy to check page numbers against.

## For M1

Test first, in this order:
1. Γ ↔ z ↔ y round trips and the circle equations (facts.md eqs. 2–11) on random points, then C3–C5, C7.
2. The direction facts of facts.md §1 (sign of dΓi at the arc start for each part kind).
3. Line Z_in by the tan form, the Γ-rotation form and the ABCD product, all equal; then C15, C20–C22, C27.
4. λ/4 and stubs: C14, C16–C19.
5. VSWR, RL, ML: C1, C2, C8 (use 298.118…, not 285), C9, C10.
6. The L networks C23–C26 (both solutions of C24) feed M4's solver tests later.
