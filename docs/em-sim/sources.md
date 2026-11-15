# EM simulation: sources (research of 2026-11-16, step M0.2a)

What each source is, what was opened, and what it may be cited for on the page (D7: every claim of the theory is cited
or derived; no text is copied). Keys are entries of `references.bib`. Pages were fetched during M0.2a; equations and
numbers taken from them are in [facts.md](facts.md), [facts-formulas.md](facts-formulas.md) and
[facts-cases.md](facts-cases.md). M0.2b adds JLCPCB's and KiCad's sources below the last section.

**Rule for "not opened" entries:** cite them on the page only beside the opened secondary or the derivation that
carries the statement (facts.md names it on every row). Do not quote equation numbers from them.

## Opened

### `QucsTech`: Qucs Technical Papers
The Qucs project's technical documentation, https://qucs.sourceforge.net/tech/technical.html (HTML nodes 75 single
microstrip, 77 coupled microstrip, 86 coplanar waveguide). Licence: GNU FDL/GPL documentation (cite, do not copy).
Opened 2026-11-16 through a page-reading tool that cut off parts of several long equations (marked in
facts-formulas.md §3–4 as completed from memory). **Cite for:** Hammerstad–Jensen's single microstrip (Z01, εeff, their
stated accuracy 0.01 %/0.03 % and 0.2 %, the thickness correction), Getsinger's and Kirschning–Jansen's dispersion
models with ranges, Kirschning–Jansen's static coupled-microstrip model with its range (0.1 ≤ u ≤ 10, 0.1 ≤ g ≤ 10,
1 ≤ εr ≤ 18) and stated 0.6 %, the coplanar waveguide (moduli k1, k2, k3, εeff, Z0, Hilberg's K/K′ with 10⁻⁵ /
3 × 10⁻⁶, Gupta's thickness Δ). **Not for:** the cut-off pieces (check against the papers or the Qucs source first);
the Qucs page's reference list was not read.

### `WikiCapacitance`: "Capacitance", Wikipedia
https://en.wikipedia.org/wiki/Capacitance, revision 1378855098 of 6 October 2026. Licence CC BY-SA 4.0. Opened: the
table of capacitances of simple systems. **Cite for:** concentric cylinders, eccentric cylinders
(arcosh((R1² + R2² − d²)/(2R1R2))), two parallel wires (arcosh(d/2a)), wire parallel to a wall (arcosh(d/a)). **Not
for:** the "two parallel coplanar strips" row (its moduli were garbled in the fetch and look non-standard).

### `WikiMicrostrip`: "Microstrip", Wikipedia
https://en.wikipedia.org/wiki/Microstrip, revision 1356129625 of 25 May 2026. CC BY-SA 4.0. Opened: the
characteristic-impedance section. **Cite for:** Wheeler's 1977 formula with the effective width w′ (thickness
correction), its stated accuracy (below 1 % for most cases, always below 2 %), the bibliographic data of
`Wheeler1977`. The fetch garbled the brackets; facts-formulas.md §2 matches it with Ellingson's print.

### `Ellingson2018`: S. W. Ellingson, *Electromagnetics*, Vol. 1
Already in `references.bib` (Smith chart; docs/smith-chart/sources.md). Newly opened here: §3.11 Microstrip Line.
**Cite for:** Wheeler's Z0 formula (42.4 Ω/√(εr + 1)·ln[…], Φ), w′ ≈ w for thin strips, εeff ≈ (εr + 1)/2 as a crude
estimate, β = β0√εeff, v = c/√εeff, λ = λ0/√εeff, Example 3.11.1 (50 Ω on FR-4: h = 1.575 mm, εr 4.5, w ≈ 3.15 mm).
From the Smith chart's reading (§3.16): open and shorted stubs. **Not for:** §3.10 (coax, not opened in this step).

### `SteerVol2`: M. Steer, *Microwave and RF Design II*
Already in `references.bib`; opened in the Smith chart's M0.2 (§2.4). **Cite for:** the open stub's input impedance
(the via stub resonance).

### `DLMF19`: NIST Digital Library of Mathematical Functions, §19.8
https://dlmf.nist.gov/19.8. Opened: 19.8.1–19.8.6. **Cite for:** the arithmetic-geometric mean, K(k) = π/(2M(1, k′))
(19.8.5) and E(k) by the AGM sums (19.8.6). (The fetch dropped some radical signs; restored from 19.8.3's consistency.)

### `CODATA2022`: NIST, CODATA value of μ0
https://physics.nist.gov/cgi-bin/cuu/Value?mu0. Opened. **Cite for:** μ0 = 1.256 637 061 27(20) × 10⁻⁶ N A⁻², 2022
CODATA recommended values. ε0 and η0 follow from μ0 and the exact c0.

### `PolarAP157`: Polar Instruments, application note AP157 "Considering odd and even mode impedance"
https://www.polarinstruments.com/support/cits/AP157.html (no date or version on the page). Opened. **Cite for:** the
verbal definitions of Zdiff, Zodd, Zcommon and Zeven; Zdiff = 2·Zodd; Zeven = 2·Zcommon; that Si8000/Si9000 use 2D field
solvers. **Not for:** asymmetric pairs (the note does not discuss them), Polar's algorithms.

### `LearnEMCPCB`: LearnEMC PCB transmission-line calculators
https://learnemc.com/ext/calculators/pcb-tl/microstrip.html (and `embedded.html`, `stripline.html`; the equations are
images `pics/Equations-microstrip.png`, `…-embedded-microstrip.png`, `…-stripline.png`, viewed). The site attributes
them to "Design Guide for Electronic Packaging Utilizing High-Speed Techniques" (IPC-2251, 4th working draft, February
2001). **Cite for:** the IPC-style formulas of facts-formulas.md §1 and their ranges as the pages state them. **Not
for:** IPC-2141A's own wording or accuracy (not opened).

## Not opened (cited for what an opened secondary or a derivation carries)

| Key | What it is | Why not opened | Use |
|---|---|---|---|
| `IPC2141A` | IPC-2141A, Design Guide for High-Speed Controlled Impedance Circuit Boards (March 2004) | paywalled; only its table of contents is public | name the standard behind the IPC formulas, beside `LearnEMCPCB` |
| `Wheeler1977` | H. A. Wheeler, IEEE T-MTT 25(8), 631–647, 1977 | IEEE paywall | beside `Ellingson2018` / `WikiMicrostrip` |
| `HammerstadJensen1980` | E. Hammerstad, Ø. Jensen, MTT-S IMS Digest 1980, 407–409 | IEEE paywall | beside `QucsTech` |
| `Getsinger1973` | W. J. Getsinger, "Microstrip dispersion model", T-MTT 21(1), 1973 | IEEE paywall | beside `QucsTech` |
| `KirschningJansen1982` | Microstrip dispersion, Electronics Letters 18(6), 1982 | IET paywall | beside `QucsTech` |
| `KirschningJansen1984` | Coupled microstrip, T-MTT 32(1), 1984 (corrections 1985) | IEEE paywall | beside `QucsTech` |
| `Cohn1954` | Zero-thickness stripline, IRE T-MTT 2(2), 1954 | IEEE paywall | beside the derivation checks of facts.md §8 (wide and narrow limits) |
| `Cohn1955coupled` | Edge-coupled stripline, IRE T-MTT 3(5), 1955 | IEEE paywall | beside the checks of facts.md §8 (s → ∞, s = 0 by Landen) |
| `Cohn1955problems` | Thick stripline corrections, IRE T-MTT 3(2), 1955 | IEEE paywall | formulas of facts-formulas.md §5, flagged; the t = 0 check |
| `Wen1969` | Coplanar waveguide, T-MTT 17(12), 1969 | IEEE paywall | beside `QucsTech` and the derivation of εeff = (εr + 1)/2 |
| `Tripathi1975` | Asymmetric coupled lines, T-MTT 23(9), 1975 | IEEE paywall | modal impedances; carried by the derivation of facts.md §4 |
| `BockelmanEisenstadt1995` | Mixed-mode S-parameters, T-MTT 43(7), 1995 | IEEE paywall | the mixed-mode variables; carried by facts.md §5 and `PolarAP157` |
| `Rosa1908` | Partial self-inductance of straight conductors, Bull. Bureau of Standards 4(2), 1908 | not tried (free scans exist at NIST; a later step may open it) | facts-formulas.md §7's partial inductance |
| `Pozar2012` | D. M. Pozar, *Microwave Engineering*, 4th ed., Wiley 2012 | book | general background only (TEM, Table 2.1 lines, couplers); every statement also derived |
| `Paul2008` | C. R. Paul, *Analysis of Multiconductor Transmission Lines*, 2nd ed., Wiley-IEEE 2008 | book | L = μ0ε0·C0⁻¹, modes, crosstalk; every statement also derived in facts.md §4–7 |
| `Wadell1991` | B. C. Wadell, *Transmission Line Design Handbook*, Artech House 1991 | book | where to check Cohn's thick-strip constants (facts-formulas.md §5) |
| `JohnsonGraham1993` | H. W. Johnson, M. Graham, *High-Speed Digital Design*, Prentice Hall 1993 | book | the via C and L estimates "as commonly quoted"; 0.35/tr (derived anyway) |
| `Bogatin2018` | E. Bogatin, *Signal and Power Integrity – Simplified*, 3rd ed., 2018 | book | NEXT/FEXT coefficients (derived anyway, facts.md §6) |

Seen only in a search summary, not cited: an SI-LIST mailing-list thread (qsl.net/wb6tpu archive) on Johnson's via
inductance formula and the sign of its "+1"; Copper Mountain's help page on mixed-mode reference impedances
(2·Z0 differential, Z0/2 common). TI's SNLA035 (National Semiconductor AN-905, "Transmission Line RAPIDESIGNER") was
fetched but is password-protected and could not be read.
