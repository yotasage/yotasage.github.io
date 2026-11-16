# Notes from M0.2e – literature findings (2026-11-16)

## What was done

[literature.md](literature.md), "Findings with numbers (M0.2e)": 36 findings in five groups (vias 10, 2D solver 4,
pairs 7, calculators 7, fabricated boards 8). 16 have a number the abstract states, 16 a claim the abstract states
without a number, 4 are "summary only, unconfirmed" (V4, P1, C2, C3: do not use). 14 numbers dropped. 43 papers
searched on Crossref, 33 verified, 28 added to the pointer tables and `references.bib` (comment "step M0.2e"; parsed by
`lib/bibtex.ts`, 157 entries, keys unique); 11 abstracts of M0.2d papers re-read for numbers. No paper was opened.

## Most useful per step

- **M1.2:** S1 `Zhechev2026`: 10⁻⁴ on 11 of 12 benchmarks with half the unknowns; iterative criteria fail silently.
- **M1.3:** P4 `Huynh2007`, P6 `Hagmann2008`; the TDR reading below.
- **M1.4:** P2 `Tang2008` (asymmetric stripline, < 2 %), P3 `Abbosh2009` (< 5 %), C1 `Bogatin1990` (5 % to 1 GHz).
- **M1.7:** V1 `Cartier2007` (λ/8), V5 `Miller2004` (antipad overlap), V6 `Duan2014` (shared antipad), V7 `Zhang2020`.
- **M6.4:** F3 `Chen2017` (3D TDR off by loose convergence), V10 `Orhanovic1998`.
- **Validation:** F1 `Renbi2011` (3, 10, 20 % between makers), F2 `Fang2019` (fixture 20 % → 3 %), F4 `Zhou2025`.

## Against the decisions (flagged; solver.md, facts.md and engine.md unchanged)

1. **Via validity, engine.md §6.7.** No verified abstract gives a GHz limit; the 20–30 GHz figure is unconfirmed (V4).
   Use Cartier's λ/8 for "no longer short": a lumped part of length ℓ in εr holds to f = c0/(8·ℓ·√εr), e.g. ℓ 1.6 mm,
   εr 4.3: 11.3 GHz, a 10–90 % rise time of about 0.35/f = 31 ps. Our barrels are cascaded lines, so this applies to
   the lumped pad and antipad parts and to the whole via only when it is shown as one element. **Return-via distance:**
   no number in any abstract (V2 has curves in the paper); M6.4's FDTD runs must set it, or the owner fetches
   `Archambeault2004`. V5 supports the overlap flag. **New candidate flag:** a pair with a shared antipad above
   about 40 GHz (V6). **Pair stubs** may differ (V7: 9 Ω, −40 dB conversion from 5 GHz): M1.7 should let each via of a
   pair have its own backdrill.
2. **What a differential TDR measures, facts.md §5** (our derivation, not a paper). Two 50 Ω sources drive with
   Rd = 100 Ω and a common-mode source of 25 Ω. On a matched pair with mixed-mode matrix [[Zdd, Zdc], [Zdc, Zcc]] it reads
   **Z_TDR = Zdd − Zdc²/(Zcc + 25 Ω)**. Definition A is the case Ic = 0 (source ∞), B the case Vc = 0 (source 0:
   Zdd − Zdc²/Zcc), so the TDR lies **between B and A**, equal to both for symmetric pairs. For §5's asymmetric
   example (A 94.1, B 92.0 Ω) it is about 93 Ω if Zcc ≈ 30 Ω. A stays the default; the details view could show
   Z_TDR, and TDR validation of asymmetric pairs should compare with it, not with A.
3. **Grading, solver.md §2.5–2.6.** S1 sharpens M0.2d's note: half the unknowns means about 8× less LU time, which
   would close the pair budget (57 ms for 40 ms). Our error estimate is a level difference, not a charge-based
   criterion, but M1.2 should still test it on the worst exact cases.
4. **Calculators, facts.md §9.** No verified number contradicts §9 (mask −4.9 %, trapezoid +3.3 %, copper +3.7 %);
   the "4–10 % each" is unconfirmed (C2). C1 adds a data point: εr 4.9 at 1 MHz matched FR-4 to 1 GHz. F4: roughness
   moved a simulated 100 Ω TDR by −4 to +1 Ω at 50 GHz, so §9's "no effect" holds for our lossless model, not for a
   measured TDR. F1 and F2: a single board's TDR tests the solver no better than a few percent.
