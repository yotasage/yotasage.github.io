# Smith chart – notes of step M3.5 (theory)

M3.5a (2026-11-12) wrote the content in [theory.md](theory.md); M3.5b builds the page from it and finishes this file.

## Claims checklist
Every factual sentence of theory.md, by its `⟨n⟩`. **S** source (key and section, as sources.md allows; E =
Ellingson2018, S2 = SteerVol2, S3 = SteerVol3, W = WikiSmith, M = WikiMobius), **D** derived (registry ids or claims it
follows from; numbers worked by hand in theory.md, M3.5b's harness checks them against the engine), **Def** definition
or wording, **T** describes the tool (checked by the code it names or the ui harness). Nothing is left unsourced:
claims without a source say "derived" on the page through their equation, or describe the tool.

**1 How to use.** 1–12 T (state.ts D16, Strip, Chart, Nodes, history; 7 also engine.md §2) · 13 S E §3.20
(`power-delivered`) · 14 T (`GOAL_VSWR`).

**2 Γ, z, y.** 15 Def · 16 S W "Normalization" · 17 D `z-norm` · 18 S E §3.12 · 19 S E §3.12, S2 §2.3 eq:9 ·
20–22 S E §3.12 · 23 S S3 §3.4 · 24 Def · 25 S W "Admittance chart" · 26 D `gamma-y`, `z-gamma` · 27 S S3 §3.4.2.

**3 Reading.** 28 Def · 29–30 D `circle-r` · 31–32 D `circle-x` (owner's item 7) · 33 D `x-gamma` at Γi = 0 ·
34 S S3 §3.4.3 · 35 D `circle-g`, `circle-b` · 36 S S3 §3.4.3 · 37 D steps of `r-gamma`…`circle-b` (M5) · 38 T ·
39 S S3 §3.4.2 · 40 D 47, 52 · 41 S S3 §3.4.5 · 42 T (grid.ts) · 43 S S3 §3.4 Ex. 3.4.2; "0 at the short" T (grid.ts)
· 44 S S3 §3.4 Fig. 3.4.6 · 45 T.

**4 Moving.** 46 S S3 §2.2.6 (`series-adds-z`) · 47 D `series-adds-z`, `circle-r` · 48 S W "Circuit elements and
topology" · 49 D `circle-x`, `gamma-parts-z` (r → ∞) · 50 S S3 §2.2.6 · 51 S W "Circuit elements and topology" ·
52 D `shunt-adds-y`, `circle-g` · 53 D `circle-b`, `gamma-parts-y` (g → ∞) · 54 D `stub-open-b`, `stub-short-b`,
`shunt-adds-y` · 55 D `circle-r` · 56 D facts.md §1 (dΓi/dx = 2/(r+1)² > 0 at x = 0) · 57 D facts.md §1
(dΓi/db = −2/(1+g)²) · 58 S S3 §3.4 Step 2, §6.7 · 59 D 56, 57, 34, 36 · 60 S S3 §3.4.3 · 61 S S3 §3.4.1, §3.5.2 ·
62 D `stub-open-b`, `stub-short-b` · 63 D `series-adds-z` · 64 D `gamma-z` · 65 S M lead, "Elementary properties" ·
66 D `circle-r` · 67 D `abcd-zin` (facts.md eq. 27) · 68 S M "Definition" · 69 D `mobius` (to add) from 64, 67, 68 ·
70 D 47, 52, `line-rotation` · 71 S S3 §3.5 · 72 T (geometry.ts, engine.md §3) · 73 Def (D3) · 74 D `x-series-l`,
`x-series-c`, `b-shunt-c`, `b-shunt-l`, `r-series`, `g-shunt`, `stub-open-b`, `stub-short-b` (engine.md §2 "no
effect") · 75 Def · 76 D `x-series-c` · 77 D the four part ids, 56, 57.

**5 Lines.** 78 Def · 79 S E §3.15 · 80 T · 81 S S2 §2.3 eq:16 · 82 S S3 §3.4.1, §3.5.2 · 83 S E §3.15 · 84 S E §3.15
· 85 D `line-rotation`, 43 · 86 D `line-rotation`, `z-gamma` (Γ = 0.4 + j0.2; also `line-zin`) · 87 S S3 §3.5;
"round Zc's point" D (the map of 69 takes the disc about Γ_Zc = 0 to the inside of the circle) · 88 S S3 §3.5 ·
89 S E §3.19 · 90 S E §3.19; 35.36 Ω D `quarter-wave-match` · 91 S E §3.19, S2 §2.4 · 92 D `quarter-wave` (Z_in = Z0
needs Z_L = Zt²/Z0, real) · 93 Def · 94 S E §3.16 · 95 S E §3.23 · 96 D 54 · 97 S S2 §2.4, E §3.17 · 98 D
`stub-short-b`, `stub-open-b` at βℓ = π/2.

**6 Match.** 99 D `vswr`, `return-loss`, `mismatch-loss` · 100 S E §3.20 · 101 S E §3.14 · 102 D `vswr` · 103 S S2
§2.3 (`z-max`); r = VSWR D `z-gamma` at Γ = |Γ| · 104 S S3 §2.8 · 105 S S3 §2.8 (positive); "larger is better" D ·
106 D `return-loss` · 107 D `power-delivered` (facts.md eq. 16) · 108 S S3 §2.8 · 109–110 D (numbers; 110's VSWR 1.5
T) · 111 T.

**7 Two parts.** 112 Def · 113 D `circle-r`, `circle-g` (r = 1, g = 1 through 0) · 114 D 47, 52 · 115 S S3 §6.7 ·
116 D `z-norm` · 117 D `x-series-c`, `y-norm` · 118 D `shunt-adds-y` · 119 D `x-series-c`, `b-shunt-l` · 120–121 D
`circle-r`, `circle-g` (leftmost point (r−1)/(r+1) ≤ 0) · 122 D (two circles meet at most twice) · 123 D
`shunt-adds-y`, `b-shunt-c` · 124 S E §3.22 · 125 S E §3.23 · 126 S S3 §6.4 · 127 S S3 §6.4; the |b|/g form D
`q-node` · 128 D `q-node` · 129 T (M7).

**Count:** 129 claims: 50 sourced (S, some with a derived part), 51 derived, 8 definitions, 20 describing the tool.
The short lines (theory.md §8) repeat claims of their topics and are not numbered again.

## Deliberately left out (not sourced)
- Bandwidth and what Q means for it (sources.md: not yet sourced; M7).
- That VSWR 1.5 is a usual "good enough": the page calls it the tool's default only (claim 111).
- Physical line length with εeff and c: the page speaks of wavelengths and degrees only.
- Lossy parts and why they leave the circles (BL42; not read in any source).
- The 1939 and 1944 papers of P. H. Smith (not opened; sources.md).

## For M3.5b
- New source `WikiMobius` (references.bib, sources.md): opened in M3.5a by a sub-agent (lead, "Definition",
  "Elementary properties"; the article's last part was not read).
- Registry: add `mobius` (theory.md §4 has its text, derivation, symbols, engine and harness binding).
- The live numbers in theory.md are hand-worked; take every one from the engine as listed, never from these texts.
- Strip the `⟨n⟩` markers; keep the order of first citation for the numbering.
