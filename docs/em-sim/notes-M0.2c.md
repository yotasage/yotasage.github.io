# EM simulation – notes of step M0.2c (formulas checked against the original papers, 2026-11-16)

M0.2a wrote [facts-formulas.md](facts-formulas.md) from secondary sources, with pieces completed from memory
(notes-M0.2a.md, open questions 1–2). This step opened the originals: `IPC2141` (April 1996, the first edition),
`KirschningJansen1984` with `KirschningJansen1985corr`, and `Cohn1955problems` ([sources.md](sources.md), "Opened in
M0.2c"; both new bib keys added to `references.bib`, which still parses with `lib/bibtex.ts`).

## Checked and confirmed

- Kirschning–Jansen static coupled microstrip (eqs. 1, 3, 4, 8, 9 with corrections 1–3): every piece completed from
  memory was right: (εr − 1)/2 of εeff,e, the bracket of εeff,o (−εeff(0), correction 2), (g/5.8)¹⁰ in Q6, −0.387 in
  Q3, both impedance denominators (377 Ω, Q4, Q10); range and 0.6 % confirmed.
- The exponent 20 in P1 (dispersion): restated in the 1984 paper (eq. 6), confirmed with P2–P4 and fn.
- Cohn's wide-strip eqs. 4–5 and the bound 0.11 for the equivalent diameter.
- IPC microstrip and symmetric stripline: same as the LearnEMC forms (C37's IPC value stands; no case changed).
- Bib details: Kirschning–Jansen title, volume, issue and pages match; Cohn's title and page numbers (119–122 seen)
  match (the paper's pages carry no journal header); no fix was needed.

## Changed (old → new)

- Cohn d0: 0.51π·(t/w)² → 0.510·(d″/d′)² inside the outer bracket, d′/d″ the larger/smaller of w and t (eq. 21; its
  printed form drops a π, settled by its derivative eq. 22).
- Cohn ranges: narrow w/(b − t) < 0.35 → ≤ 0.35 and t/b ≤ 0.25; added the stated −1.24 % at the crossover.
- K–J accuracy: "0.6 %" → εeff,e 0.7 %, εeff,o 0.5 %, impedances 0.6 %; added that thickness is outside the model
  and the coupled dispersion limits (not used in phase 1).
- IPC §1: added IPC-2141 (1996) with its four unbalanced forms, εr′ for embedded microstrip (printed "1 + e^…",
  flagged as unphysical), no ranges, no accuracy, no differential formulas; the LearnEMC ranges are IPC-2251's.
- Open question 2 of M0.2a answered: the factor (1 − (h1 − t − h)/0.1) is **not** in IPC-2141 (1996).

## Sanity check (scratch script, not kept)

K–J static at u = 1, εr = 4.3 (single line εeff 3.1045, ZL 71.751 Ω): g = 1 → εeff,e 3.3126, εeff,o 2.8312,
ZL,e 81.742 Ω, ZL,o 61.141 Ω; g = 10 → 71.983 / 71.392 Ω; g = 100 → 71.752 / 71.749 Ω, εeff 3.1047 / 3.1045: the large
spacing limit is the Hammerstad–Jensen single line. Same at u = 0.5, εr = 9.7 and u = 3, εr = 2.35. The paper gives
no numeric example (curves only). Cohn's eq. 22 matches the numerical derivative of the corrected eq. 21 to 2·10⁻⁵.

## Still open

- Kirschning–Jansen 1982 (single-line dispersion): range 0.1 ≤ u ≤ 100, 1 ≤ εr ≤ 20, h/λ0 ≤ 0.13 and 0.6 % still from
  QucsTech (letter not opened).
- IPC-2141A (2004): not opened; its embedded form, ranges and any differential formulas may differ. The sign of
  IPC-2141's εr′ and whether to show an embedded IPC value at all: decide in M2.
- Hammerstad–Jensen 1980, Wheeler 1977, Wen 1969 and the via estimates (Johnson & Graham) remain through secondaries.

**M1.4 implements the closed-form comparison** from facts-formulas.md (with the g → ∞ limit and the numbers above as
tests).
