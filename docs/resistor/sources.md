# Resistor lookup: sources (research of 2026-11-11)

"opened: yes" = I read the text; "partly" = catalogue page, abstract or one part; "no" = not read. Add urldate = {2026-11-11} to every entry with a url (left out below to save space).

## Corrections to facts.md

- EIA-96 letters: old "Y or R 0.01, X or S 0.1"; now "Y or S 0.01, X or R 0.1" (TTTN004); other tables pair R and S the
  other way, so both are kept as ambiguous. Z and F not in TTTN004.
- Axial bodies: 1/8 W 3.0x1.8 became 1/6 W 3.4x1.9; 1/4 W 6.5x2.5 became 6.3x2.4 (Yageo) or 6.5x2.5 max (Vishay);
  1/2 W 8.5x3.2 became 9.0x3.3; 1 W 11x5 became 11.5x4.5 (YageoCFR, VishayMRS).
- Carbon film TCR "+-200 to +-1000" became "-200 to -1500" (VishayBasics).
- Thin film voltage coefficient "about 0.1 ppm/V" became "below 1 ppm/V" (VishayTNPV).
- Limiting voltages added: 0201 25 to 30 V, 1206 200, 1210 200, 2010 200 (Vishay 400), 2512 200 (Vishay 500).
- Milliohm: Vishay uses L (10L0 = 10 mohm), R from 0.1 ohm (VishayMarking); "IEC's letter is L" removed.
- Unmarked sizes: Yageo marks nothing on 0075 to 0402, marks 0603 and up.
- "Unverified" became "verified against" for E-series, colour table, military band, derating, chip sizes and powers.

## Still unverified

- Texts of IEC 60063 and IEC 60062 (paywalled; catalogue pages only).
- EIA-96 letters Z and F, and the R/S pairing: secondary guides disagree, no maker table with them.
- Milliohm M or m (1M50): search excerpts only (Venkel, TT Welwyn ULR). Underline meaning: no source.
- 1812 chip (4.5x3.2, 0.75 W): no datasheet. Metal oxide, carbon composition, foil figures.
- Noise index definition (MIL-STD-202 method 308), HF parasitics, pulse ratings, Horowitz and Hill: not opened. ADI
  Analog Dialogue AAE-24: fetch timed out.

## Sources

```bibtex
@techreport{IEC60063, organization = {International Electrotechnical Commission},
  title = {Preferred number series for resistors and capacitors}, type = {International Standard},
  number = {IEC 60063:2015}, version = {Edition 3.0}, date = {2015-03-27},
  url = {https://webstore.iec.ch/en/publication/22011}}
```
Scope: preferred values for resistance and capacitance; 2015 changes: E series versus tolerance, inferring series from a marking. No tables in the preview. opened: partly.

```bibtex
@techreport{IEC60062, organization = {International Electrotechnical Commission},
  title = {Marking codes for resistors and capacitors}, type = {International Standard},
  number = {IEC 60062:2016}, version = {Edition 6.0}, date = {2016-07-12},
  url = {https://webstore.iec.ch/publication/25395}}
```
Abstract: value, tolerance, colour and date codes; 2016 adds pink for 10^-3 and Annex A (three-character code). No tables in
the preview. opened: partly.

```bibtex
@online{VishayCRCW, organization = {Vishay Dale}, title = {D/CRCW e3: Standard Thick Film Chip Resistors},
  type = {Datasheet}, number = {20035}, version = {Revision 14-Apr-2026},
  url = {https://www.vishay.com/docs/20035/dcrcwe3.pdf}}
```
P70 (standard) and limiting voltage: 0402 0.063 W 50 V; 0603 0.1 W 75 V; 0805 0.125 W 150 V; 1206 0.25 W 200 V; 1210 0.5 W 200 V;
2010 0.75 W 400 V; 2512 1 W 500 V. TCR +-200 and +-100 ppm/K, +-5 and +-1 %, film -55 to +155 C. L x W: 1.0x0.5, 1.55x0.85,
2.0x1.25, 3.2x1.6, 3.2x2.5, 5.0x2.5, 6.3x3.15 (1218: 3.2x4.6); T1 0.25-0.6. Zero ohm: Rmax 20 mohm, Imax at
70 C 1.5/2.0/2.5/3.5/5.0 A for 0402 to 1210, 6 and 7 A for 2010 and 2512. Drift 1 % after 1000 h.
Graphs not readable. opened: yes.

```bibtex
@online{VishayCRCW0201, organization = {Vishay},
  title = {CRCW0201 e3: Lead (Pb)-Free Commodity Thick Film Chip Resistors}, type = {Datasheet},
  number = {20052}, version = {Revision 21-Sep-2022}, url = {https://www.vishay.com/docs/20052/crcw0201e3.pdf}}
```
0201: 0.05 W at 70 C, 30 V, film 155 C (Yageo: 125 C), zero ohm 50 mohm, 1.0 A. opened: yes.

```bibtex
@online{YageoRC, organization = {Yageo}, title = {General Purpose Chip Resistors, RC\_L series, sizes 0075 to 2512},
  type = {Datasheet}, version = {Product specification V.11, 2020-05-15},
  url = {https://www.rcscomponents.kiev.ua/datasheets/Yageo_03_18_2021_PYu_RC_Group_51.pdf}}
```
Mirror. P70, voltage: 0075 1/50 W; 0100 1/32 W 15 V; 0201 1/20 W 25 V; 0402 1/16 W 50 V; 0603 1/10 W 75 V;
0805 1/8 W 150 V; 1206 1/4 W 200 V; 1210 1/2 W 200 V; 1218 1 W; 2010 3/4 W 200 V; 2512 1 W 200 V. L x W: 0.4x0.2, 0.6x0.3, 1.0x0.5, 1.6x0.8, 2.0x1.25, 3.1x1.6, 3.1x2.6, 5.0x2.5, 6.35x3.1. Derating (Fig. 10): 100 % to
70 C, then down to 0 at 155 C (0402 to 2512) or 125 C (0075 to 0201). Rated voltage sqrt(P R) or the maximum, whichever is
less. Marking: none on 0075-0402; 0603 3 digits (5 %) or EIA-96 (1 %); 0805 up 4 digits (1 %). opened: yes.

```bibtex
@online{VishayBasics, organization = {Vishay Beyschlag}, title = {Basics of Linear Fixed Resistors},
  type = {Application Note}, number = {28771}, version = {Revision 11-Nov-08},
  url = {https://www.vishay.com/docs/28771/basics.pdf}}
```
Table: carbon film +-2 to 10 %, TCR -200 to -1500; metal film +-0.1 to 2 %, +-5 to 50; thick film +-1 to 5 %,
+-50 to 200; wirewound +-0.1 to 10 %, +-1 to 200. E-series formula, constant tolerance (E24/5 %, E96/1 %, E192/0.5 %);
TCR; stability; derating; pulse (IEC 60115-1 4.27); dT = P Rth; thermal vs current noise, IEC 60195 index; parasitic L
and C, wirewound worst at HF. opened: yes.

```bibtex
@online{VishayMarking, organization = {Vishay Draloric}, title = {Surface Mount Resistor Marking},
  type = {Technical note}, number = {20020}, version = {Revision 25-May-2010},
  url = {https://www.vishay.com/docs/20020/smdresistormarking.pdf}}
```
Chips 0603 to 2512: 0.01 to 0.091 ohm = 10L0 to 91L0; 0.1 to 0.91 ohm = R10 to R91 (E24), R100 to R976 (E96). TCR 6th band: brown 100, red 50, yellow 25, orange 15, blue 10, violet 5 ppm/K. opened: yes.

```bibtex
@online{TTTN004, organization = {TT Electronics},
  title = {Technical Note TN004: Methods for Marking Values on Resistors}, type = {Technical note},
  number = {TN004}, date = {2024-09},
  url = {https://www.ttelectronics.com/TTElectronics/media/ProductFiles/Application-Note/TN004-Methods-for-Marking-Values-on-Resistors.pdf}}
```
3 or 4 characters, the last the number of zeros (472 = 4k7, 1331 = 1k33, 330 = 33 ohm); R as decimal point; tolerance not
marked; EIA-96 on E96 0603: digits 01 to 96 plus letter (07B = 1k15; 01 = 100; 96 = 976), letters S or Y, R or X, A, H or B,
C, D, E = x0.01 to x10000. Colour table with tolerance letters K J F G D C B A M (A = 0.05 %). opened: yes.

```bibtex
@online{VishayHDN, organization = {Vishay Angstrohm},
  title = {HDN (Military RNR/RNN): Metal Film Resistors, Military/Established Reliability, MIL-PRF-55182},
  type = {Datasheet}, number = {66001}, version = {Revision 11-Sep-2026},
  url = {https://www.vishay.com/docs/66001/hdn.pdf}}
```
Failure-rate codes M 1.0, P 0.1, R 0.01, S 0.001 %/1000 h. opened: yes.

```bibtex
@online{NEETS, organization = {Naval Electrical Engineering Training Series},
  title = {Module 1, Chapter 1: Matter, Energy, and Electricity (Wattage Rating)}, howpublished = {Web copy at tpub.com},
  url = {https://tpub.com/neets/book1/chapter1/1q.htm}}
```
Fifth band of military resistors, per 1000 h: brown 1.0 %, red 0.1 %, orange 0.01 %, yellow 0.001 %. No publication number
on the page. opened: yes.

```bibtex
@online{VishayMRS, organization = {Vishay BCcomponents}, title = {MRS16, MRS25: Professional Thin Film Leaded Resistors},
  type = {Datasheet}, number = {28724}, version = {Revision 07-Mar-16},
  url = {https://www.vishay.com/docs/28724/mrs16m25.pdf}}
```
Metal film +-1 %, +-50 ppm/K. MRS16 (0204): 0.4 W, 200 V, body 3.6x1.6 max, lead 0.5. MRS25 (0207): 0.6 W, 350 V,
6.5x2.5 max, lead 0.6 (more than 1/4 W in that body). opened: yes.

```bibtex
@online{YageoCFR, organization = {Yageo}, title = {Carbon Film Resistors, General Purpose, CFR Series, 1/6 W to 3 W},
  type = {Datasheet}, version = {Product specification V.2, 2023-09-27},
  url = {https://cdn.sparkfun.com/assets/a/9/3/0/e/yageo-cfr_datasheet.pdf}}
```
Mirror. 70 C rating, body L x D, lead d (mm): CFR-12 1/6 W 3.4x1.9 0.45; CFR-25 1/4 W 6.3x2.4
0.55; CFR-50 1/2 W 9.0x3.3 0.55; CFR-100 1 W 11.5x4.5 0.8; CFR-200 2 W 15.5x5.0 0.8. opened: yes.

```bibtex
@online{VishayTNPW, organization = {Vishay}, title = {TNPW e3: High Stability Thin Film Flat Chip Resistors},
  type = {Datasheet}, number = {28758}, version = {Revision 10-Apr-2026},
  url = {https://www.vishay.com/docs/28758/tnpw_e3.pdf}}
```
Thin film 0201 to 1210: +-0.1 to 1 %, +-10 to 50 ppm/K, film to 175 C, moisture < 0.1 % (85 C, 85 % RH, 1000 h), sulfur
resistance per ASTM B 809 and ANSI/EIA-977. opened: yes.

```bibtex
@online{VishayTNPV, organization = {Vishay Draloric}, title = {TNPV e3: High Voltage Thin Film Flat Chip Resistors},
  type = {Datasheet}, number = {28881}, version = {Revision 29-Apr-2026},
  url = {https://www.vishay.com/docs/28881/tnpve3.pdf}}
```
Voltage coefficient |c| < 1 ppm/V; internal thermal resistance 38 K/W (0805), 32 K/W (1206); to 1000 V. opened: yes.

```bibtex
@online{VishayThermal, organization = {Vishay Sfernice}, author = {Guezguez, Elyes},
  title = {Thermal Management on SMD Thick Film Resistors (DTO25, DTO35, D2TO20, D2TO35, D2TO35S)},
  type = {Application Note}, number = {52027}, version = {Revision 03-Aug-2026},
  url = {https://www.vishay.com/docs/52027/thermmgtdto25_35-d2to20_35-d2to35s.pdf}}
```
Power packages, not chips. Heat path as series thermal resistances (element, solder, board), Ohm's-law analogy. opened: yes.

```bibtex
@online{VishayCurrent, organization = {Vishay Dale}, author = {Yarborough, Bryan},
  title = {Components and Methods for Current Measurement}, type = {White Paper}, number = {30304},
  version = {Revision 31-Aug-15}, url = {https://www.vishay.com/docs/30304/currentmeasurement.pdf}}
```
Shunt: direct, linear. Below about 25 mohm four-terminal parts separate current from sense points, removing contact
resistance and copper's TCR (3900 ppm/K). opened: yes.

```bibtex
@techreport{TISLVA423, author = {Robertson, Maxwell}, institution = {Texas Instruments},
  title = {Effect of Resistor Tolerances on Power Supply Accuracy}, type = {Application Report},
  number = {SLVA423}, date = {2010-06}, url = {https://www.ti.com/lit/slva423}}
```
Vout = Vref(1 + R1/R2); worst-case error is not 2T and shrinks as Vout approaches Vref. Read to the derivation. opened: partly.

```bibtex
@techreport{TISNVA112, institution = {Texas Instruments},
  title = {AN-1378 Method for Calculating Output Voltage Tolerances in Adjustable Regulators},
  type = {Application Report}, number = {SNVA112A}, date = {2013-05},
  url = {https://www.ti.com/lit/an/snva112a/snva112a.pdf}}
```
Worst case, sensitivity, RSS ("only valid for independent Gaussian random variables"), adjust-pin current. opened: partly.

```bibtex
@article{Johnson1928, author = {Johnson, J. B.}, title = {Thermal Agitation of Electricity in Conductors},
  journal = {Physical Review}, volume = {32}, number = {1}, pages = {97}, date = {1928-07-01},
  doi = {10.1103/PhysRev.32.97}, url = {https://journals.aps.org/pr/abstract/10.1103/PhysRev.32.97}}
@article{Nyquist1928, author = {Nyquist, H.}, title = {Thermal Agitation of Electric Charge in Conductors},
  journal = {Physical Review}, volume = {32}, number = {1}, pages = {110}, date = {1928-07-01},
  doi = {10.1103/PhysRev.32.110}, url = {https://journals.aps.org/pr/abstract/10.1103/PhysRev.32.110}}
```
Details from the APS abstract pages (start pages only). Johnson measured, Nyquist derived (4kTR per bandwidth: from memory,
not read). opened: partly.

```bibtex
@online{Beev2021, author = {Beev, Nikolai},
  title = {Measurement of Excess Noise in Thin Film and Metal Foil Resistor Networks},
  howpublished = {arXiv:2109.02448}, date = {2021-09-06}, url = {https://arxiv.org/abs/2109.02448}}
```
Excess noise: foil lowest, then thin film on silicon, then on ceramic. Abstract only. opened: partly.

```bibtex
@book{HorowitzHill, author = {Horowitz, Paul and Hill, Winfield}, title = {The Art of Electronics},
  edition = {3rd}, publisher = {Cambridge University Press}, address = {New York}, year = {2015}}
```
Not opened. Ch. 1 (resistors, series/parallel, power, dividers) and ch. 8 (noise), from memory; check before citing. opened: no.

```bibtex
@online{WikiE, title = {E series of preferred numbers}, howpublished = {Wikipedia},
  url = {https://en.wikipedia.org/wiki/E_series_of_preferred_numbers}}
@online{WikiColor, title = {Electronic color code}, howpublished = {Wikipedia},
  url = {https://en.wikipedia.org/wiki/Electronic_color_code}}
```
WikiE: E24 table, eight values off the formula (2.7 to 4.7, 8.2), subsets, E192 n = 185 is 9.20, tolerances
(E3 40 %, E6 20 ... E192 0.5). WikiColor: the IEC 60062:2016 table as in facts.md, older grey 0.05 %,
yellow and grey on high-voltage parts. opened: yes.

## Topic map

- E-series, E192 exception, tolerances: IEC60063, WikiE, VishayBasics. Colour code, 2016 additions, older grey, letters:
  IEC60062, WikiColor, TTTN004, VishayMarking. Military band: NEETS, VishayHDN.
- SMD digits, R point, EIA-96, unmarked sizes, milliohm L: TTTN004, YageoRC, VishayMarking.
- Chip sizes, power, voltage, terminations, zero-ohm: VishayCRCW, VishayCRCW0201, YageoRC. Axial: YageoCFR, VishayMRS.
- Derating: YageoRC, VishayBasics, VishayCRCW. Self-heating, Rth: VishayBasics, VishayThermal, VishayTNPV.
- Ohm's law, power, series/parallel: HorowitzHill (not opened). Preferred numbers: VishayBasics.
- Technologies: VishayBasics, VishayTNPW, YageoCFR, VishayMRS. TCR: VishayBasics, VishayCRCW, VishayTNPW.
- Limiting voltage: YageoRC, VishayCRCW. Pulse: VishayBasics (thin). Voltage coefficient: VishayTNPV (thin). HF: VishayBasics (thin).
- Noise: Johnson1928, Nyquist1928, VishayBasics, Beev2021. Drift, moisture, sulfur: VishayCRCW, VishayTNPW, VishayTNPV.
- Shunts: VishayCurrent. Worst case vs RSS, divider: TISLVA423, TISNVA112. Ratio tracking: no source.
