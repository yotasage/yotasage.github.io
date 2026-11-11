# Smith chart – facts (research of 2026-11-11, step M0.2)

The conventions and every equation the tool shows, each with a source or a short derivation, the owner's notes checked,
and the values real parts come in. The worked numeric cases are in [facts-cases.md](facts-cases.md). What each source
may be cited for is in [sources.md](sources.md); the BibTeX keys below are entries of `references.bib`.

Source keys used here: **[E]** Ellingson, *Electromagnetics* Vol. 1 (`Ellingson2018`); **[S2]** Steer, *Microwave and RF
Design II: Transmission Lines* (`SteerVol2`); **[S3]** Steer, *Microwave and RF Design III: Networks* (`SteerVol3`);
**[W]** Wikipedia, "Smith chart" (`WikiSmith`, revision of 20 October 2026). Section numbers are those of the LibreTexts
copies. **The LibreTexts pages print no equation numbers**; where a number is given below as `eq:N` it is the page's own
equation label (the order on the page), not a printed number. Cite by section.

## 1. Conventions (engine.md §1)

| Convention | Statement | Source |
|---|---|---|
| Time | Phasors with e^{jωt}: a(t) = Re{A·e^{jωt}}, cosine reference. | [E] §1.5 (boxed eq. 1.9). [S2] §2.3 states no convention but writes v⁺ = \|V⁺\|cos(ωt − βz) for the wave e^{−jβz}, which is the same. |
| Impedance | Z = R + jX, Y = G + jB = 1/Z. | [W] "Normalization"; [S3] §3.4 |
| Inductor | Z_L = jωL, X_L = ωL > 0; Y_L = −j/(ωL), B_L = −1/(ωL) < 0. | [E] §3.17 (+jωL); [S2] §2.4 eq:2 (Z0 tan βℓ = ωL_s); [W] "Circuit elements" (z = jωL/Z0, y = −j/(ωL·Y0)) |
| Capacitor | Z_C = 1/(jωC) = −j/(ωC), X_C = −1/(ωC) < 0; Y_C = jωC, B_C = ωC > 0. | [E] §3.22 (X = −1/(ωC)); [S2] §2.4 eq:4; [W] "Circuit elements" |
| Upper half | Upper half of the chart (Γi > 0) is inductive impedance (x > 0) and, read as admittance, b < 0; lower half is capacitive (x < 0, b > 0). | [S3] §3.4 (§3.4.3 "combined chart"); [W] "Admittance chart" |
| Normalising | z = Z/Z0 = r + jx, y = Y/Y0 = Y·Z0 = 1/z = g + jb. | [W] "Normalization"; [S3] §3.4 (z_l = Z_L/Z_REF) |
| Γ | Γ = (Z − Z0)/(Z + Z0) = (z − 1)/(z + 1); z = (1 + Γ)/(1 − Γ); Γ = (1 − y)/(1 + y), y = (1 − Γ)/(1 + Γ). 0 ≤ \|Γ\| ≤ 1 for passive loads. Open: Γ = +1; short: Γ = −1. | [E] §3.12 (boxed); [S2] §2.3 eq:6, eq:9; [S3] §3.4 eq:1–2; [W] "Admittance chart" |
| Γ is the voltage reflection coefficient | The current reflection coefficient is −Γ. | [E] §3.12; [S2] §2.3 eq:10 |
| Rotation on a line | Γ_in = Γ_L·e^{−j2βℓ}, ℓ the distance from the load: the angle *decreases*, so moving away from the load ("towards the generator") turns **clockwise**; one turn per λ/2. | [S2] §2.3 eq:16; [S3] §3.5 eq:3 and the text of §3.4.1 ("clockwise … as the line length increases") and §3.5.2; [E] §3.15 (period λ/2); [W] "Variation along a line" |
| Wavelength scale | The chart's "wavelengths towards the generator" scale runs 0 to 0.5λ; a chart angle is twice the electrical length (θ = βℓ). | [S3] §3.4 (Example 3.4.2, Figure 3.4.6 caption); [W] "Variation along a line" |
| Admittance on the same plane | An admittance chart is a polar plot of the same Γ: grid circles of the Y chart are the Z chart's turned 180° about Γ = 0, the points do not move. y of a point is the z of the point −Γ. The older practice of rotating Γ by 180° on an impedance chart "is not used now". | [S3] §3.4.2, §3.4.5; [W] "Admittance chart", "Impedance–admittance conversion" |
| Z0 real | Z0 is taken real for a lossless line (Z0 = √(L/C)); a complex reference is out of scope (plan D12). | [E] §3.9 (lossless line, section title only opened via the chapter index) – use D12 as the reason, not a source |

**Direction of the parts (engine.md §1, derived, checked numerically).** No opened source states "clockwise" for lumped
parts; [S3] §3.4 Step 2 (a series inductor raises x along constant r into the upper half), §6.7 (a shunt capacitor
raises b along constant g) and [W] "Lumped-element circuits" give the signs. Derivation: on the r circle with centre
(r/(1+r), 0), Γ(x) = (r − 1 + jx)/(r + 1 + jx); at x = 0 the point is the circle's leftmost point (Γr = (r−1)/(r+1),
the circle's leftmost point is r/(1+r) − 1/(1+r) = (r−1)/(r+1)), and dΓi/dx at x = 0 is 2/(r+1)² > 0, so a growing x
(series L) leaves the leftmost point upwards: **clockwise**. Series C (x falling) is counter-clockwise. On the g circle
with centre (−g/(1+g), 0), Γ(b) = (1 − g − jb)/(1 + g + jb); at b = 0 the point is the rightmost point
((1−g)/(1+g)), and dΓi/db = −2/(1+g)² < 0, so a growing b (shunt C) leaves it downwards: **clockwise**. Shunt L is
counter-clockwise. A line turns clockwise (above). engine.md §1 is right as written.

## 2. Equations the tool shows

| # | Equation | Source |
|---|---|---|
| 1 | z = Z/Z0, y = 1/z = Y·Z0 | [W] "Normalization" |
| 2 | Γ = (z − 1)/(z + 1), z = (1 + Γ)/(1 − Γ) | [E] §3.12; [S2] §2.3 eq:6, eq:9; [S3] §3.5 eq:4 |
| 3 | Γ = (1 − y)/(1 + y), y = (1 − Γ)/(1 + Γ) | [W] "Admittance chart" |
| 4 | Γ in parts of z: Γr = (r² + x² − 1)/((1+r)² + x²), Γi = 2x/((1+r)² + x²) | [W] "Constant resistance and reactance circles" |
| 5 | Γ in parts of y: Γr = (1 − g² − b²)/((1+g)² + b²), Γi = −2b/((1+g)² + b²) | [W] "Admittance chart" |
| 6 | z in parts of Γ: r = (1 − Γr² − Γi²)/((1 − Γr)² + Γi²), x = 2Γi/((1 − Γr)² + Γi²) | derived from 2 (owner's notes item 6, verified §3) |
| 7 | y in parts of Γ: g = (1 − Γr² − Γi²)/((1 + Γr)² + Γi²), b = −2Γi/((1 + Γr)² + Γi²) | derived from 3 (owner's notes items 4–5, verified §3) |
| 8 | r circle: centre (r/(1+r), 0), radius 1/(1+r) | derived §3 item 8; [W] and [S3] §3.4 name the circle families without centre and radius |
| 9 | x circle: centre (1, 1/x), radius 1/\|x\|; x = 0 is the real axis | derived §3 item 9 |
| 10 | g circle: centre (−g/(1+g), 0), radius 1/(1+g) | derived §3 item 10 |
| 11 | b circle: centre (−1, −1/b), radius 1/\|b\|; b = 0 is the real axis | derived §3 item 11 |
| 12 | Line circle about its own Zc: \|Γ_Zc\| constant, centre 0 in the Zc chart. In a chart of reference Z01 a line of Zc = Z02 draws a circle with, for B = (Z01 − Z02)/(Z01 + Z02) and Γ_L in the Z02 chart, centre C = (B − 1/B)/(1 − \|BΓ_L\|²) + 1/B and radius \|(B² − 1)Γ_L/(1 − \|BΓ_L\|²)\| (real B, so the centre is on the real axis) | [S3] §3.5 eq:11, eq:14, eq:15 (check of the centre: case 12 in facts-cases.md) |
| 13 | VSWR = (1 + \|Γ\|)/(1 − \|Γ\|), \|Γ\| = (VSWR − 1)/(VSWR + 1); Z_max = Z0·VSWR, Z_min = Z0/VSWR | [E] §3.14 (boxed); [S2] §2.3 eq:23, eq:24, eq:31 |
| 14 | Return loss RL = 10 log10(P_inc/P_ref) = −20 log10\|Γ\| dB, positive for a passive load | [S3] §2.8 eq:1, eq:2 |
| 15 | Power: P_ref = \|Γ\|²·P_inc, P_load = (1 − \|Γ\|²)·P_inc | [E] §3.20 (boxed); [S2] §2.3 Example 4 |
| 16 | Mismatch loss ML = −10 log10(1 − \|Γ\|²) dB (the drop from 15 in dB). [S3] §2.8 names mismatch loss without a formula; the formula is the derivation from 15 and must be shown as such. | derived from 15 |
| 17 | Node Q of a point: Q = \|x\|/r = \|b\|/g (equal, since y = 1/z gives b/g = −x/r). L network: \|Q_S\| = \|Q_P\| = √(R_high/R_low − 1), Q_S = \|X_S/R_S\|, Q_P = \|R_L/X_P\| | [S3] §6.4 eq:4–6, eq:11–12 (series and shunt leg Q); the \|b\|/g form is the derivation in brackets |
| 18 | Lossless line: Z_in = Z0·(Z_L + jZ0 tan βℓ)/(Z0 + jZ_L tan βℓ) = Z0·(1 + Γ_L e^{−j2βℓ})/(1 − Γ_L e^{−j2βℓ}) | [E] §3.15 (boxed); [S2] §2.3 eq:17, eq:18 |
| 19 | β = 2π/λ = ω/v_p, electrical length θ = βℓ in radians; on the chart the angle of Γ turns by −2θ | [E] §3.15, §3.17; [S3] §3.4 Example 3.4.2 |
| 20 | λ/4 line: Z_in = Zt²/Z_L; to match R_L to Z0: Zt = √(Z0·R_L); valid at ℓ = λ/4 + nλ/2 | [E] §3.19 (boxed); [S2] §2.4 eq:35–40 |
| 21 | Short-circuited line: Z_in = jZc tan βℓ; open: Z_in = −jZc cot βℓ | [E] §3.16 (boxed); [S2] §2.4 eq:1, eq:3 |
| 22 | Shunt stub susceptance: short B = −Yc cot βℓ, open B = +Yc tan βℓ; normalised to the chart's Z0: short b = −(Z0/Zc) cot βℓ, open b = (Z0/Zc) tan βℓ | [E] §3.23 (boxed); normalising is eq. 1 |
| 23 | Equivalent L and C of a stub at one frequency: L_s = (Z0/ω) tan βℓ (short), C = tan βℓ/(ωZ0) (open) | [S2] §2.4 eq:2, eq:4 |
| 24 | Normalised parts: series L: x = ωL/Z0; series C: x = −1/(ωCZ0); shunt C: b = ωCZ0; shunt L: b = −Z0/(ωL); series R: r = R/Z0; shunt R: g = Z0/R | [W] "Circuit elements and topology" |
| 25 | ABCD: [V1; I1] = [A B; C D]·[V2; I2], I2 flowing *out of* port 2 (the negative of the usual port current); a cascade is the product in order; reciprocal: AD − BC = 1 | [S3] §2.2.6 eq:43, eq:55, eq:56 |
| 26 | ABCD of a series Z: [1 Z; 0 1]; shunt Y: [1 0; Y 1]; lossless line: [cos βℓ, jZc sin βℓ; jYc sin βℓ, cos βℓ]; shunt short stub: C = −j/(Zc tan θ); shunt open stub: C = j tan θ/Zc; series short stub: B = jZc tan θ; series open stub: B = −jZc/tan θ | [S3] Table 2.2.6.1 |
| 27 | Z_in of a two-port ending in Z_L: Z_in = (A·Z_L + B)/(C·Z_L + D) | derived: V2 = Z_L·I2 in 25 gives V1 = (AZ_L + B)I2, I1 = (CZ_L + D)I2. [S3] does not print it. With 26 for a line it gives 18 (divide by cos βℓ). |
| 28 | In (V, I) form (engine.md §4): a node is (V, I) at the port towards the load; a part maps it by its ABCD matrix; z = V/(I·Z0) | 25 and 27 |

Two printing slips found in the sources (do not copy): [S2] §2.4 eq:18's second form was fetched with cos βℓ where sin βℓ
belongs, and eq:20 prints tan⁻¹ where cot is meant (eq:19 and eq:21 have cot). [E] §3.23 is consistent.

## 3. The owner's notes (notes-M0.1.md), item by item

Γ = Γr + jΓi throughout. Every item was re-derived by hand and checked numerically at Γ = 0.3 + 0.4j (Node, 10 digits).

| Item | Verdict | Correct form |
|---|---|---|
| 1. z_L = (1 + Γr + jΓi)/((1 − Γr) − jΓi) | **verified** | as written; it is eq. 2 with Γ split |
| 2. y_L = ((1 − Γr) − jΓi)/(1 + Γr + jΓi), times the conjugate (1 + Γr − jΓi) over itself | **verified** | as written |
| 3. plain-text line `(1-Gr-i⋅Gi)⋅(1+Gr-i⋅Gi) / …` | **corrected (typography)** | ((1 − Γr − jΓi)(1 + Γr − jΓi)) / ((1 + Γr + jΓi)(1 + Γr − jΓi)) |
| 4. y_L = (1 − Γr² − Γi²)/(Γi² + (Γr + 1)²) − j·2Γi/(Γi² + (Γr + 1)²); heading "Addmittance" | **verified**; heading **corrected** to "Admittance" | as written (eq. 7) |
| 5. g_L and b_L, no circle form | **verified, completed** | (Γr + g/(1+g))² + Γi² = (1/(1+g))²; (Γr + 1)² + (Γi + 1/b)² = (1/b)² |
| 6. z_L = (1 − Γr² − Γi²)/(Γi² + (1 − Γr)²) + j·2Γi/(Γi² + (1 − Γr)²) | **verified** | as written (eq. 6) |
| 7. r circle (Γr − r/(1+r))² + Γi² = (1/(1+r))²; x circle (Γr − 1)² + (Γi − **i**/x)² = (1/x)² | r **verified**; x **corrected** | (Γr − 1)² + (Γi − 1/x)² = (1/x)² |
| 8. resistance circle derivation | **verified, completed** | r[(1−Γr)² + Γi²] = 1 − Γr² − Γi² → (r+1)Γr² − 2rΓr + (r+1)Γi² = 1 − r → Γr² − 2Γr·r/(r+1) + Γi² = (1−r)/(r+1) (the notes' last line, written once) → add r²/(r+1)²: (Γr − r/(r+1))² + Γi² = [(1−r)(1+r) + r²]/(r+1)² = 1/(r+1)² |
| 9. reactance circle, stops at x = 2Γi/(…) | **verified, completed** | x[(1−Γr)² + Γi²] = 2Γi → (Γr − 1)² + Γi² − 2Γi/x = 0 → (Γr − 1)² + (Γi − 1/x)² = 1/x² |
| 10. conductance circle, stops at g·Γi² + g(Γr + 1)² = 1 − Γr² − Γi² | **verified, completed** | (g+1)Γr² + 2gΓr + (g+1)Γi² = 1 − g → Γr² + 2Γr·g/(g+1) + Γi² = (1−g)/(1+g) → (Γr + g/(1+g))² + Γi² = 1/(1+g)² |
| 11. susceptance circle, stops at b·Γi² + b(Γr + 1)² = −2Γi | **verified, completed** | (Γr + 1)² + Γi² + 2Γi/b = 0 → (Γr + 1)² + (Γi + 1/b)² = 1/b² |

The circle results agree with engine.md §1 (centres and radii) and with [W]'s Γ(r, x) and Γ(g, b) (eqs. 4, 5): every
point of eq. 4 at fixed r lies on circle 8, checked numerically. The signs of b in item 5 are right: a point in the
upper half (Γi > 0) has b < 0, an inductive admittance, as [S3] §3.4.3 says.

## 4. Values real inductors and capacitors come in

| Fact | Source |
|---|---|
| The E series (E3 … E192) are the preferred number series of IEC 60063 for resistors and capacitors; E24 values per decade: 1.0 1.1 1.2 1.3 1.5 1.6 1.8 2.0 2.2 2.4 2.7 3.0 3.3 3.6 3.9 4.3 4.7 5.1 5.6 6.2 6.8 7.5 8.2 9.1. | `WikiE`, `IEC60063` (already in references.bib from the resistor tool; the resistor's `lib/resistor/` E-series tables) |
| RF chip capacitors, high-Q multilayer, 0402: 0.1 – 33 pF (C and S series; the dielectric table says 0.2 – 33 pF for 0402, not reconciled on the page). Tolerances below 10 pF are absolute: A ±0.05 pF, B ±0.1 pF, C ±0.25 pF, D ±0.5 pF; from 10 pF relative: F ±1 %, G ±2 %, J ±5 %, K ±10 %. A value list on the page reads 1.0 1.1 1.2 1.3 1.5 1.6 1.8 2.0 2.2 2.4 2.7 3.0, which is the E24 decade (what the list is labelled was not confirmed). | `JohansonHighQ` (Johanson Technology product page) |
| RF wire-wound ceramic chip inductors, 0402 (WE-KI): values seen 1, 1.9, 2, 2.2, 2.4, 2.7, 3.3, 3.6, 3.9, 4.3, 4.7, 5.1, 5.6, 6.2, 6.8, 7.5 nH (part of the list; not an E series: 1.9 is not in E24); tolerances 2 % and 5 %, some ±0.2 nH. Q ≈ 20–25 at 250 MHz and SRF 4.8–5.8 GHz for 6.2–7.5 nH. | `WurthWEKI` (Würth Elektronik product page) |
| Not obtained (sites refuse automated reading): Coilcraft 0402HP (403), Murata LQW15AN and GJM15 (404), TDK MLG1005S (403). | – |

Consequence for M4's "realisable values": capacitors in E24 from 1 pF (with 0.1 pF steps below 1 pF, the bottom of the
Johanson range), tolerance in pF below 10 pF; inductors are not one E series, so the tool should snap to E24 by default
and say that inductor makers' lists are irregular (an open question for the owner, notes-M0.2.md). Parasitics (finite
Q, SRF) are BL42; the WE-KI figures show an SRF a few GHz up for single-digit nH, so at f0 = 100 MHz (D16) ideal parts
are a fair model.

## 5. Constants the sources use

The textbook examples use c = 3·10⁸ m/s (Ellingson's β = 209.4 rad/m at 6 GHz and 52.360 rad/m at 1.5 GHz both need
it). The engine uses c = 299 792 458 m/s exactly, so physical lengths differ from the sources' in the fourth digit;
facts-cases.md gives both.
