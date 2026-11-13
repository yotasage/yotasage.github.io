# Smith chart: sources (research of 2026-11-11, step M0.2)

What each source is, what was opened, and what it may be cited for on the page (learning.md §5: every claim of the
Theory section is cited or derived; no text is copied). Keys are entries of `references.bib`. The pages were read by
fetching them during M0.2; equations and numbers taken from them are in [facts.md](facts.md) and
[facts-cases.md](facts-cases.md).

## Opened

### `Ellingson2018`: S. W. Ellingson, *Electromagnetics*, Vol. 1
Virginia Tech Publishing, 2018, doi:10.21061/electromagnetics-vol-1 (the DOI is printed on the LibreTexts pages; the year
was not read on them). Read in the LibreTexts copy:
https://eng.libretexts.org/Bookshelves/Electrical_Engineering/Electro-Optics/Book%3A_Electromagnetics_I_(Ellingson).
Licence CC BY-SA 4.0. Opened: §1.5 Phasors; chapter 3 index; §3.12 Voltage reflection coefficient, §3.14 Standing wave
ratio, §3.15 Input impedance of a terminated lossless line, §3.16 Open- and short-circuit terminations, §3.17 Stubs,
§3.19 Quarter-wavelength line, §3.20 Power flow, §3.22 Single-reactance matching, §3.23 Single-stub matching.
**Cite for:** the e^{jωt} phasor convention; Γ and its range; current reflection coefficient −Γ; SWR and \|Γ\| from SWR;
Z_in of a lossless line (both forms) and its λ/2 period; Z_in of shorted and open lines; a stub as an inductor; the λ/4
transformer; delivered and reflected power; single-reactance (series and shunt) and single-stub matching with their
examples. **Not for:** the Smith chart itself (the book solves these analytically, not on a chart), circle equations,
direction on the chart, ABCD, lumped L networks. Not opened: §3.9 (lossless line), §3.13, §3.18, §3.21.

### `SteerVol2`: M. Steer, *Microwave and RF Design II: Transmission Lines*
NC State University (3rd edition per the publisher; the edition and DOI were not readable: the NCSU repository page
refuses automated access). LibreTexts copy:
https://eng.libretexts.org/Bookshelves/Electrical_Engineering/Electronics/Microwave_and_RF_Design_II_-_Transmission_Lines_(Steer).
Licence CC BY-NC (version not stated on the page). Opened: §2.3 The terminated lossless line, §2.4 Special cases of
lossless terminated lines. **Cite for:** Γ, Z_L from Γ, Γ_in = Γ_L e^{−j2βℓ}, Z_in (both forms), VSWR, V_max and V_min
positions, Z_max = Z0·VSWR, shorted and open lines and stubs, their L and C equivalents, the λ/4 transformer and
impedance inverter, the electrically short line, and the examples of §2.3–2.4. **Not for:** the Smith chart (that is
Vol. 3). Known slips: §2.4 eq:20 prints tan⁻¹ for cot.

### `SteerVol3`: M. Steer, *Microwave and RF Design III: Networks*
As Vol. 2; LibreTexts copy:
https://eng.libretexts.org/Bookshelves/Electrical_Engineering/Electronics/Microwave_and_RF_Design_III_-_Networks_(Steer).
Licence CC BY-NC. Opened: §2.2 Two-port networks (§2.2.6 ABCD parameters, Table 2.2.6.1), §2.6 T parameters (no ABCD),
§2.8 Return loss, substitution loss and insertion loss, §3.4 Smith chart, §3.5 Transmission lines and Smith charts,
§6.4 The L matching network, §6.7 Impedance matching using Smith charts. **Cite for:** the Smith chart as a polar plot
of Γ, reading r, x, g and b, upper half inductive, the admittance and combined (ZY) charts, the retired 180° rotation,
the clockwise rotation with line length and the "wavelengths towards the generator" scale, the circle a line of
another impedance draws (§3.5), ABCD definition, cascade, reciprocity and the table of two-ports, return loss, the L
network with its Q, and the examples. **Not for:** circle centres and radii (not given), mismatch loss (named, no
formula), Z_in from ABCD (not printed), the time convention (not stated). Known slips: §3.4 "φ_D = +143.6°" then
"−143.6°"; §6.7 Example 6.7.2 prints x_S = −0.25 − (0.661) for −0.25 − (−0.661).

### `WikiSmith`: "Smith chart", Wikipedia
https://en.wikipedia.org/wiki/Smith_chart, revision 1381106295 of 20 October 2026. Licence CC BY-SA 4.0. Opened: the
whole article. **Cite for:** Γ in terms of (r, x) and (g, b); y = (1 − Γ)/(1 + Γ); the Y chart as the Z chart turned
180° about the centre; normalised impedances and admittances of R, L and C; the chart worked examples (as chart
readings); the bibliographic facts of Smith's papers. **Not for:** anything a textbook above supports (cite the
textbook first), and not for "clockwise towards the generator" (the article does not say it).

### `WikiMobius`: "Möbius transformation", Wikipedia
https://en.wikipedia.org/wiki/M%C3%B6bius_transformation, revision 1374014348 of 9 September 2026 (opened in M3.5a,
2026-11-12; the last part of the article was not read). Licence CC BY-SA 4.0. **Cite for:** that a map
f(z) = (az + b)/(cz + d) with ad − bc ≠ 0 takes generalised circles (circles and straight lines) to generalised circles
(lead; "Elementary properties"), and that such maps form a group under composition ("Definition"). **Not for:**
anything about the Smith chart or circuits.

### `WikiQ`: "Q factor", Wikipedia
https://en.wikipedia.org/wiki/Q_factor, revision 1374399236 of 11 September 2026 (opened in M7.4a, 2026-11-13, by a
sub-agent; the text from "References" on was not read). Licence CC BY-SA 4.0. **Cite for:** Q as the resonant frequency
over the half-power width, "the reciprocal of fractional bandwidth" ("Bandwidth definition"); the Q of an ideal series
RLC circuit, (1/R)√(L/C) = ω0L/R ("RLC circuits"). **Not for:** loaded Q (the article does not use the term), the Q of
matching networks, or anything about the Smith chart. Also opened and not usable: "Quarter-wave impedance transformer"
(revision 1381286039 of 21 October 2026) gives no bandwidth formula, only that λ/4 inverter filters are narrow-band.

### `Touchstone21`: IBIS Open Forum, *Touchstone File Format Specification*, Version 2.1
Ratified 26 January 2024. https://ibis.org/touchstone_ver2.1/ (landing page; © 1995–2026 IBIS Open Forum, no licence
terms). Opened: the landing page only; the PDF (36 pages) is password-protected against text extraction and the
version 2.0 and 1.1 PDFs gave no readable text. **Cite for:** that version 2.1 exists, its ratification date and
publisher. **Not for:** the option line, formats or any syntax, until M8 (BL37) reads the document in a browser.

### `JohansonHighQ`: Johanson Technology, "High-Q multi-layer capacitors" (product page)
https://www.johansontechnology.com/high-q-multi-layer-capacitors. Opened: the product page (not the linked datasheet).
**Cite for:** the 0402 range 0.1 (or 0.2) – 33 pF and the tolerance codes in pF below 10 pF and in percent from 10 pF.
**Not for:** Q or ESR (not read).

### `WurthWEKI`: Würth Elektronik, "WE-KI SMT wire wound ceramic inductor" (product page)
https://www.we-online.com/en/components/products/WE-KI. Opened: the product page and its part list, 0402 rows to
7.5 nH. **Cite for:** that RF chip inductor values are an irregular list (1.9, 2.4 nH …), tolerances 2 %, 5 % and
±0.2 nH, Q and SRF of the listed parts. **Not for:** the full range of the series.

### Already in references.bib (resistor tool): `WikiE`, `IEC60063`
The E series and their use for resistors and capacitors; see docs/resistor/sources.md for what was opened.

## Not opened

| Source | Why | Bibliographic facts known (from `WikiSmith`'s references, not the scans) |
|---|---|---|
| P. H. Smith, "Transmission line calculator", *Electronics* | worldradiohistory.com scans returned 404 at the paths tried; the article's own scan link is `worldradiohistory.com/Archive-Electronics/30s/Electronics-1939-01.pdf` | vol. 12, no. 1, pp. 29–31, Jan. 1939 |
| P. H. Smith, "An improved transmission line calculator", *Electronics* | as above (`…/40s/Electronics-1944-01.pdf`) | vol. 17, no. 1, pp. 130–133, 318, 320, 322, 324–325, Jan. 1944 |
| D. M. Pozar, *Microwave Engineering* | not open access; no copy at hand | – |
| Coilcraft 0402HP datasheet | coilcraft.com refuses automated fetches (403) | – |
| Murata LQW15AN, GJM15 | murata.com product URLs tried returned 404 | – |
| TDK MLG1005S | product.tdk.com 403; distributor copy password-protected | – |
| Touchstone 2.1 / 2.0 PDF text | password-protected / unreadable | – |

The Smith papers may be named on the page as history ("P. H. Smith published the chart in *Electronics* in January
1939") citing `WikiSmith`; they are not in references.bib until a scan is opened.

## Topic map (learning.md §5)

| Topic | Cite |
|---|---|
| Γ, z and y, normalising | Ellingson2018 §3.12; SteerVol3 §3.4; WikiSmith |
| Reading the chart, Z, Y, ZY | SteerVol3 §3.4; WikiSmith; circle equations: derivation (facts.md §3) |
| Moving on the chart (series on r, shunt on g, which way) | SteerVol3 §3.4, §6.7 for the signs; the direction is a derivation (facts.md §1); circles stay circles: WikiMobius |
| Lines, λ/2 period, other Zc, λ/4, stubs | Ellingson2018 §3.15–3.17, §3.19, §3.23; SteerVol2 §2.3–2.4; SteerVol3 §3.5 |
| How good is a match: \|Γ\|, VSWR, RL, ML | Ellingson2018 §3.14, §3.20; SteerVol2 §2.3; SteerVol3 §2.8; ML: derivation |
| Matching with two parts | SteerVol3 §6.4, §6.7; Ellingson2018 §3.22 |
| Realisable and standard values (M4) | WikiE, IEC60063, JohansonHighQ, WurthWEKI |
| Q and bandwidth, reading a trace (M7) | WikiQ (Q and half-power width, series RLC); SteerVol3 §6.4 (node and L-network Q); the bandwidths: derivations (notes-M7.1.md, registry entries of notes-M7.4a.md) |
