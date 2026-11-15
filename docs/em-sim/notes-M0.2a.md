# Notes from M0.2a – theory, formulas, exact cases, sources (2026-11-16)

## What was done

- [facts.md](facts.md): conventions and constants (CODATA 2022 μ0; (u, v, z) right-handed), quasi-TEM and its limits
  with numbers for thin PCB dielectrics, one line, the multiconductor line (L = μ0ε0·C0⁻¹, the symmetric eigenproblem
  W = C^{1/2}·L·C^{1/2}, modal impedances, Zc·C·Zc = L and its closed-form solution, degenerate modes), every Zdiff/Zcm
  definition in use with a derivation and a measured spread, NEXT/FEXT coefficients derived, the quasi-TEM H field from
  the vacuum solve, exact solutions with the AGM, why calculators disagree with estimates, placeholders §10 JLCPCB and
  §11 KiCad for M0.2b.
- [facts-formulas.md](facts-formulas.md) (split from facts.md to stay under 40 kB): IPC-style formulas (from the LearnEMC
  pages' equation images), Wheeler 1977, Hammerstad–Jensen, Kirschning–Jansen static coupled microstrip and the
  dispersion models (out of scope), Cohn's thick stripline, CPW (Qucs), via formulas (coaxial, quasi-coaxial with N
  returns derived here, pad/antipad and inductance estimates, stub resonance), rise time and bandwidth (0.350 single
  pole, 0.340 Gaussian, derived).
- [facts-cases.md](facts-cases.md): 37 cases (C01–C37): 30 exact to 10 digits (coax, two-layer coax, eccentric coax, two
  equal and unequal wires, wire over plane, plates, Cohn stripline at five w/b, coupled stripline at eight geometries,
  CPW, K values) and 7 approximate or published; the validation table's headings for M0.2b, no rows.
- [sources.md](sources.md), 25 new `references.bib` entries (parsed by `lib/bibtex.ts`: 61 entries, no duplicate keys).

## Decisions

- **Default Zdiff/Zcm: definition A**, the mixed-mode transform of the characteristic impedance matrix
  (Zdd = Zc11 + Zc22 − 2Zc12, Zcc = (Zc11 + Zc22 + 2Zc12)/4), with Zdc shown for asymmetric pairs; equals 2·Zodd and
  Zeven/2 for symmetric pairs (Polar AP157). Voltage-drive (B) and modal (C) values in the details view; the
  "symmetric formula on one line" (D) never. Reasons in facts.md §5.
- **Every impedance comes from Zc**, never from single mode vectors (robust for degenerate and nearly degenerate modes).
  Display modes inside a degenerate cluster: eigenvectors of C restricted to the cluster (proposal; M1 confirms).
- (u, v, z) right-handed; H = (1/η0)·v̂ × E0 with E0 from the vacuum solve driven by Q0 = I/c0.
- The TDR's Gaussian edge uses f3·tr = 0.34, not 0.35 (facts-formulas.md §8).

## Cross-checks done (facts-cases.md)

AGM K = mpmath `ellipk` = quadrature to 10 digits; Cohn stripline in 30-digit mpmath; coax = eccentric coax at d = 0;
two wires = 2 × wire over plane; Cohn stripline → wide limit (10⁻⁷ at w/b = 2, exact at 5) and narrow limit (0.06 % at
0.1); coupled stripline → single line at s/b = 5 (5 × 10⁻⁸) and Zeven(s = 0) = 2·Z0(2w) (Landen) to 10 digits;
two-layer coax and plates against closed-form εeff; Hilberg's approximation error 1.2 × 10⁻⁸.

## How the estimates were made

A rough 2D finite-difference Laplace solver (scratch, not kept; 2.5 µm grid, energy method) for the owner's kind of
microstrip and pairs (facts.md §5, §6, §9). Its absolute error is about 1–2 % (52.0 Ω against Hammerstad–Jensen's
53.2 Ω); only differences between variants are quoted. The harness's independent FD solver (D11) is a separate job.

## Sources not opened

All IEEE/IRE papers (Wheeler 1977, Hammerstad–Jensen 1980, Getsinger 1973, Kirschning–Jansen 1982/1984, Cohn
1954/1955 ×2, Wen 1969, Tripathi 1975, Bockelman–Eisenstadt 1995), IPC-2141A, Rosa 1908 and the textbooks (Pozar, Paul,
Wadell, Johnson & Graham, Bogatin). Each is cited only beside an opened secondary or a derivation (sources.md). TI
SNLA035 (AN-905) is password-protected.

## Open questions

1. **Completed from memory, check before implementing:** parts of Kirschning–Jansen's coupled formulas cut off in the
   fetch (facts-formulas.md §4), the exponent 20 in Kirschning–Jansen's dispersion P1 (§3), Cohn's narrow thick-strip
   constants 0.51 and 0.11 (§5). Whoever implements the closed-form comparison (M2) checks them against the Qucs source
   or the papers, with the limits given as tests.
2. The IPC embedded-microstrip formula as printed on LearnEMC has an odd "(1 − (h1 − t − h)/0.1)" factor and
   "1 + e^{…}" in t_pd; recorded as printed. Decide in M2 whether to show it at all.
3. Polar's definition for asymmetric pairs is undocumented in what was opened; JLCPCB's is for M0.2b.
4. Degenerate-mode display rule and its tolerance: M0.3/M1.
5. Quasi-coax with N returns: the harness's FD solver should give C36's reference (thin-wire is approximate).

## What M0.2b adds, and where

- facts.md §10 **JLCPCB** (stackups, materials, εr with frequency, copper and mask thickness, W1/W2/S and trapezoid
  conventions, JLC061611-3313G, the Zdiff definition their calculator reports; every number with date and URL) and §11
  **KiCad fields** (`(stackup …)` and `.kicad_pro` net classes by version). If facts.md would pass 40 kB, put them in a
  new `facts-fab.md` and link it from facts.md's index line.
- facts-cases.md: the owner's cases from C38 on, and rows of the validation table (headings in place); the done-when
  of M0.2 asks for at least 25 cases including the owner's (37 are in).
- sources.md: JLCPCB's and KiCad's pages under a new heading; `references.bib` entries for them.
- facts.md §9's estimates use εr 4.3 and no mask: M0.2b may restate them with JLCPCB's real numbers.
