# Smith chart – notes of step M0.1 (plan review), 2026-11-11

## Done

- Draft plan (written with Sonnet 5.5, kept in the owner's git-ignored `.local/Smith chart/PROJECT_PLAN.md`) reviewed
  against the repo and reworked with the owner's approval into `docs/smith-chart/` (plan, engine, solver, learning,
  milestones). Main changes: arcs run from "no effect" (the draft swept the component value from 0, which starts a
  series C, a shunt L or R, a short stub and a swept λ/4 at Γ = ±1); the degenerate (0, 0) node rule; every v1 locus is
  a circle, so arcs are exact, dragging is closed form and two unknowns are the intersection of two circles; the
  missing "two unknowns, one condition" family; continuous line lengths; performance architecture (no React in the
  frame loop, equation trees for display only, 4× CPU throttling as the phone stand-in); touch from M2; the Theory
  section from M3.5 after the resistor tool; the solver (now M4) before the equation layer (now M5); M6–M9 as an
  outline until owner checkpoint 2; route `/smith-chart/main`; the chart never rotates in Y mode.
- Branch `smith-chart` created from `main` at 29e5306.
- `docs/BACKLOG.md`: BL37–BL47 (the draft's SC-1 to SC-10, and the cheat sheet the owner asked for as SC-11).
- The Smith chart lines of the owner's `TODO.md` (git-ignored) removed; they are covered by plan.md's goal (start with
  a two-part circuit, draw in the chart, SVG export, report, resolution, zoom).
- CLAUDE.md: the owner does not review code and performance is never traded for readability; `docs/smith-chart/` in
  the docs list.

## Found while reading the repo

- **No EM-tool plan exists**, only a line in `TODO.md` ("EM simulation: impedance of traces and vias, single-ended and
  differential"). Complex numbers and line maths live in `lib/smith/` and move to a shared module when that tool comes.
- `lib/resistor/eseries.ts` takes plain numbers (the names say ohms): it snaps nH and pF as it is.
- `readAmount`/`formatAmount` in `lib/resistor/lists.ts` already read `4k7`, `3V3`, the decimal comma, the real minus
  sign, prefixes p to G, and round with carry. They lack H, F, Hz, f and T, and `3e-9`. M1.1 moves and extends them.
- The resistor harness launches the installed Edge or Chrome only (`playwright-core`, `channel`); Firefox and WebKit
  need a Playwright download (plan.md "Running a step").
- **KaTeX 0.19.1, MathML output** (run in Node): `\htmlClass`, `\htmlId`, `\htmlData` are dropped (with a strict-mode
  warning); `\textcolor` becomes `mstyle mathcolor`; `\color` colours the rest of the group; `renderToString` about
  0.04 ms per equation. Consequences in learning.md §2.
- The 2021 prototype is at https://github.com/yotasage/electronics-tool (from `TODO.md`). No step needs it. Its parts
  list (series and shunt R, L, C, a line, shunted open and short stubs, a λ/4 transformer), its instant readout under
  the mouse with a selected and a last-created point, and "start from a basic two-part circuit" are the ideas kept.

## The owner's notes, transcribed

From `.local/Smith chart/Impedance and Admittance.docx` (the owner's machine only). Written as typed; Γr and Γi are the
real and imaginary parts of Γ; `[sic]` marks the slips (learning.md §6).

1. z_L = Z_L/Z_0 = r_L + j·x_L = (1 + Γr + j·Γi) / ((1 − Γr) − j·Γi)
2. y_L = Y_L/Y_0 = g_L + j·b_L = Z_0/Z_L = 1/z_L = 1/(r_L + j·x_L) = ((1 − Γr) − j·Γi)/(1 + Γr + j·Γi)
   = ((1 − Γr − j·Γi)·(1 + Γr − j·Γi)) / ((1 + Γr + j·Γi)·(1 + Γr − j·Γi)) =
3. `(1-Gr-i⋅Gi)⋅(1+Gr-i⋅Gi) / (1+Gr+i⋅Gi)⋅(1+Gr-i⋅Gi)` [sic: plain text]
4. "Addmittance [sic] equations": y_L = (1 − Γr² − Γi²)/(Γi² + (Γr + 1)²) − j·2Γi/(Γi² + (Γr + 1)²)
5. "Admittance circle equations": g_L = (1 − Γr² − Γi²)/(Γi² + (Γr + 1)²) → (no circle form);
   b_L = −2Γi/(Γi² + (Γr + 1)²) → (no circle form)
6. "Impedance equations": z_L = (1 − Γr² − Γi²)/(Γi² + (1 − Γr)²) + j·2Γi/(Γi² + (1 − Γr)²)
7. "Impedance circle equations": r_L = (1 − Γr² − Γi²)/(Γi² + (1 − Γr)²) → (Γr − r_L/(1 + r_L))² + Γi² = (1/(1 + r_L))²;
   x_L = 2Γi/(Γi² + (1 − Γr)²) → (Γr − 1)² + (Γi − i/x_L)² = (1/x_L)² [sic: i for 1]
8. "Resistance circles": r_L·Γi² + r_L·(1 − Γr)² + Γr² + Γi² = 1 → r_L·Γi² + r_L·(1 − 2Γr + Γr²) + Γr² + Γi² = 1
   → Γi²·(r_L + 1) + r_L − 2r_L·Γr + Γr²·(r_L + 1) = 1 → Γr² − 2Γr·r_L/(r_L + 1) + r_L/(r_L + 1) + Γi² = 1/(r_L + 1)
   [sic: this last line twice; completing the square not shown]
9. "Reactance circles": x_L = 2Γi/(Γi² + (1 − Γr)²) (stops here)
10. "Conductance circles": g_L·Γi² + g_L·(Γr + 1)² = 1 − Γr² − Γi² (stops here)
11. "Susceptance circles": b_L·Γi² + b_L·(Γr + 1)² = −2Γi (stops here)

Checked during M0.1 by an independent derivation: 1, 2, 4–8 and the starts of 9–11 are right apart from the marked
slips. Missing results: (Γr + g/(1+g))² + Γi² = (1/(1+g))² and (Γr + 1)² + (Γi + 1/b)² = (1/b)².

## For the next steps

- M0.2 and M0.3 are next, one at a time; the M0.3 spikes do not need M0.2's results.
- `.gitignore` has an uncommitted line `.local` from the owner (left for the owner to commit).
