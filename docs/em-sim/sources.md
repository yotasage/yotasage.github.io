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
Opened 2026-11-16 through a page-reading tool that cut off parts of several long equations (completed in M0.2a and
checked against the papers in M0.2c, facts-formulas.md §3–4). **Cite for:** Hammerstad–Jensen's single microstrip (Z01, εeff, their
stated accuracy 0.01 %/0.03 % and 0.2 %, the thickness correction), Getsinger's and Kirschning–Jansen's dispersion
models with ranges, Kirschning–Jansen's static coupled-microstrip model with its range (0.1 ≤ u ≤ 10, 0.1 ≤ g ≤ 10,
1 ≤ εr ≤ 18) and stated 0.6 %, the coplanar waveguide (moduli k1, k2, k3, εeff, Z0, Hilberg's K/K′ with 10⁻⁵ /
3 × 10⁻⁶, Gupta's thickness Δ). **Not for:** the coupled-line thickness widths (not from Kirschning–Jansen, partly cut off);
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
for:** IPC-2141A's own wording or accuracy (not opened); the embedded factor (1 − (h1 − t − h)/0.1), which is not in
IPC-2141 (1996).

## Opened in M0.2c (the original papers, 2026-11-16)

The originals of three sources that M0.2a carried through secondaries, and the corrections of one. Equation numbers
from them may be quoted; what was checked and changed is in [notes-M0.2c.md](notes-M0.2c.md).

### `IPC2141`: IPC-2141, "Controlled Impedance Circuit Boards and High Speed Logic Design", April 1996
The original edition (not IPC-2141A). Opened: §4.1–4.4 (unbalanced line configurations and equations, balanced lines).
**Cite for:** the surface microstrip, embedded microstrip (with εr′, its sign as printed), symmetric and dual stripline
formulas of facts-formulas.md §1; that the edition states no ranges or accuracy (it points to IPC-D-317) and gives no
differential formulas. **Not for:** the embedded C0 (malformed in print); anything of IPC-2141A (2004).

### `KirschningJansen1984`: M. Kirschning, R. H. Jansen, IEEE T-MTT 32(1), 83–90, January 1984
Opened: §II with eqs. 1–11 (the end-effect eqs. 12–13 skimmed only). **Cite for:** the static coupled-microstrip model
(eqs. 1, 3, 4, 8, 9) with its range and stated accuracy (εeff,e 0.7 %, εeff,o 0.5 %, impedances 0.6 %), the restated
single-line dispersion terms P1–P4 and fn (eqs. 2, 6), the coupled dispersion's limits (fn ≤ 25 with 1.4 %, impedances
fn ≤ 20 with 2.5 %), the power–current impedance, and the advice against Hammerstad–Jensen's coupled width correction.
Always together with `KirschningJansen1985corr`.

### `KirschningJansen1985corr`: Corrections, IEEE T-MTT 33(3), 288, March 1985
Opened (one page). **Cite for:** the four misprints of the 1984 paper (eq. 3 exponent, eq. 4 sign of εeff(0), eq. 9 Q10
parenthesis, eq. 10 εeff(0)^Ce); facts-formulas.md §4 applies them.

### `Cohn1955problems`: S. B. Cohn, "Problems in Strip Transmission Lines", IRE T-MTT 3(2), 119–126, 1955
Opened: pp. 119–120 (eqs. 1–5 and their accuracy) and p. 122 (eqs. 21–23). **Cite for:** the thick-stripline formulas
of facts-formulas.md §5 (eqs. 3–5, 21), their ranges and the −1.24 % at the crossover; eq. 22 as the check that fixes
the printed form of eq. 21. **Not for:** the attenuation formulas (not needed in phase 1).

## Not opened (cited for what an opened secondary or a derivation carries)

| Key | What it is | Why not opened | Use |
|---|---|---|---|
| `IPC2141A` | IPC-2141A, Design Guide for High-Speed Controlled Impedance Circuit Boards (March 2004) | paywalled; only its table of contents is public | name the current standard, beside `IPC2141` (1996, opened) and `LearnEMCPCB`; its forms may differ from 1996 |
| `Wheeler1977` | H. A. Wheeler, IEEE T-MTT 25(8), 631–647, 1977 | IEEE paywall | beside `Ellingson2018` / `WikiMicrostrip` |
| `HammerstadJensen1980` | E. Hammerstad, Ø. Jensen, MTT-S IMS Digest 1980, 407–409 | IEEE paywall | beside `QucsTech` |
| `Getsinger1973` | W. J. Getsinger, "Microstrip dispersion model", T-MTT 21(1), 1973 | IEEE paywall | beside `QucsTech` |
| `KirschningJansen1982` | Microstrip dispersion, Electronics Letters 18(6), 1982 | IET paywall | beside `QucsTech` |
| `Cohn1954` | Zero-thickness stripline, IRE T-MTT 2(2), 1954 | IEEE paywall | beside the derivation checks of facts.md §8 (wide and narrow limits) |
| `Cohn1955coupled` | Edge-coupled stripline, IRE T-MTT 3(5), 1955 | IEEE paywall | beside the checks of facts.md §8 (s → ∞, s = 0 by Landen) |
| `Wen1969` | Coplanar waveguide, T-MTT 17(12), 1969 | IEEE paywall | beside `QucsTech` and the derivation of εeff = (εr + 1)/2 |
| `Tripathi1975` | Asymmetric coupled lines, T-MTT 23(9), 1975 | IEEE paywall | modal impedances; carried by the derivation of facts.md §4 |
| `BockelmanEisenstadt1995` | Mixed-mode S-parameters, T-MTT 43(7), 1995 | IEEE paywall | the mixed-mode variables; carried by facts.md §5 and `PolarAP157` |
| `Rosa1908` | Partial self-inductance of straight conductors, Bull. Bureau of Standards 4(2), 1908 | not tried (free scans exist at NIST; a later step may open it) | facts-formulas.md §7's partial inductance |
| `Pozar2012` | D. M. Pozar, *Microwave Engineering*, 4th ed., Wiley 2012 | book | general background only (TEM, Table 2.1 lines, couplers); every statement also derived |
| `Paul2008` | C. R. Paul, *Analysis of Multiconductor Transmission Lines*, 2nd ed., Wiley-IEEE 2008 | book | L = μ0ε0·C0⁻¹, modes, crosstalk; every statement also derived in facts.md §4–7 |
| `Wadell1991` | B. C. Wadell, *Transmission Line Design Handbook*, Artech House 1991 | book | general background; Cohn's constants are now checked against `Cohn1955problems` |
| `JohnsonGraham1993` | H. W. Johnson, M. Graham, *High-Speed Digital Design*, Prentice Hall 1993 | book | the via C and L estimates "as commonly quoted"; 0.35/tr (derived anyway) |
| `Bogatin2018` | E. Bogatin, *Signal and Power Integrity – Simplified*, 3rd ed., 2018 | book | NEXT/FEXT coefficients (derived anyway, facts.md §6) |

Seen only in a search summary, not cited: an SI-LIST mailing-list thread (qsl.net/wb6tpu archive) on Johnson's via
inductance formula and the sign of its "+1"; Copper Mountain's help page on mixed-mode reference impedances
(2·Z0 differential, Z0/2 common). TI's SNLA035 (National Semiconductor AN-905, "Transmission Line RAPIDESIGNER") was
fetched but is password-protected and could not be read.

## JLCPCB and KiCad (step M0.2b, read 2026-11-16)

What each page holds is in [facts-fab.md](facts-fab.md) §1.1 and §2. JLCPCB's pages change without notice: cite them
with the read date, and re-read before a release.

### `JLCPCBImpedance`: JLCPCB, impedance and stackups page
https://jlcpcb.com/impedance. Read through a page-reading tool (text only). **Cite for:** the list of stackup codes
per layer count and thickness, εr of the prepregs (7628 4.4, 3313 4.1, 1080 3.91, 2116 4.16) and a single core value
4.6, the calculator's mask parameters (1.2 / 0.6 / 1.2 mil, εr 3.8), outer 0.035 and inner ½ oz 0.0152 mm copper.
**Not for:** exact layer thicknesses of a preset without checking `GsuberlandStackups` (the tool's output had small
inconsistencies), any frequency (none stated).

### `JLCPCBCalcGuide`: JLCPCB, "User Guide to the JLCPCB Impedance Calculator"
https://jlcpcb.com/help/article/User-Guide-to-the-JLCPCB-Impedance-Calculator (last updated 2026-11-10). Text read
through a page-reading tool; its εr table image and naming-scheme image opened. **Cite for:** εr by core thickness and
per prepreg with resin content, laminates (NP-155F, S1000-2M), copper in the calculator (outer 1 oz 1.6 mil, inner
½ oz 0.6 mil, 1 oz 1.2 mil), mask (1.2 / 0.6 / 1.2 mil, εr 3.8), "trace top width = trace base width − 0.7 mil", the
definitions of conductor spacing and conductor-to-ground gap, the input ranges, the naming scheme, 3313 replacing 2313.
**Not for:** the solver or the Zdiff definition (not stated).

### `JLCPCBCapabilities`: JLCPCB, PCB capabilities
https://jlcpcb.com/capabilities/pcb-capabilities, read through a sub-agent's page-reading tool. **Cite for:** impedance
tolerance ±10 % (±5 % on request), mask ink ≥ 10 µm, 2-layer FR-4 εr 4.5.

### `JLCPCB6Layer`: JLCPCB, 6-layer PCB page
https://jlcpcb.com/6-layer-pcb, read through a sub-agent. **Cite for:** 6-layer thicknesses and copper weights offered.

### `GsuberlandStackups`: JLCPCB autogenerated stackups (GitHub)
https://github.com/gsuberland/jlcpcb_autogenerated_stackups: JLCPCB's impedance-template API responses of 2025-05-09
(`raw_json/`, JLCPCB's data, "for reference") and a normalisation (public domain) with εr from `JLCPCBCalcGuide`;
script MIT. Files downloaded and parsed. **Cite for:** the layer table of JLC061611-3313A–F (thicknesses as JLCPCB's
API gave them, pressed thickness 1.637 mm). **Not for:** 3313G (absent), εr (cite `JLCPCBCalcGuide`).

### `KiCadSexprPcb`: KiCad developer documentation, board file format
https://dev-docs.kicad.org/en/file-formats/sexpr-pcb/, read through a sub-agent. **Cite for:** the stackup tokens in
general and that net classes left the board file. **Not for:** per-version detail (cite the source files below).

### `KiCadSrcStackup`, `KiCadSrcBoardVersion`, `KiCadSrcNetSettings`: KiCad source on GitLab
`pcbnew/board_stackup_manager/board_stackup.cpp` and `stackup_predefined_prms.h`, `pcbnew/pcb_io/kicad_sexpr/
pcb_io_kicad_sexpr.h` (`pcbnew/plugins/kicad/pcb_plugin.h` on 7.0), `common/project/net_settings.cpp`, raw files of
branches 6.0, 7.0, 8.0, 9.0, 10.0 and master downloaded and searched (GPL source: facts only, nothing copied). **Cite
for:** the board file version of each release, the stackup writer's tokens per version, KiCad's default εr 4.5 /
tanδ 0.02 / mask εr 3.3 / 1 GHz (master), the net-class fields and schema versions.

### Not reached
JLCPCB's online calculator (JavaScript app); any JLCPCB page with JLC061611-3313G; JLCPCB's engineers' tables in the
order emails (images on JLCPCB's server under order-specific addresses, deliberately not fetched); the NP-155F
datasheet (εr against frequency), left for M1.1 or phase 2.

## Literature, abstracts only (M0.2d)

[literature.md](literature.md) lists 57 papers on the 2D field solver, pair impedance definitions, calculators against
field solvers and measurements, and via models, with the step each one is for. Each was checked on Crossref by its
DOI (title, authors and year); **none was opened**. They may be cited on the page only for what their abstract says
until someone opens them; then they move to a section above with what was read. Keys in `references.bib` from
`Wang1994` to `RimoloDonadio2009b`, under the comment "step M0.2d".
