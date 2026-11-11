# Resistor lookup – facts

What the tool must get right, from the research of 2026-11-10. "Unverified" means no source was read yet; the research
pass of 2026-11-11 checked most of them (keys in [sources.md](sources.md), which lists what is still unverified). Resistances are in ohms throughout the code.

## E-series (IEC 60063)

- E24 is a fixed table: 1.0 1.1 1.2 1.3 1.5 1.6 1.8 2.0 2.2 2.4 2.7 3.0 3.3 3.6 3.9 4.3 4.7 5.1 5.6 6.2 6.8 7.5 8.2 9.1.
  Eight values differ from round(10^(n/24)) for historical reasons (2.7 to 4.7, and 8.2). (Verified against WikiE, which
  cites IEC 60063:2015; the standard's text was not read.)
- E12, E6 and E3 are every 2nd, 4th and 8th value of E24.
- E48, E96 and E192 are round(10^(n/m)) to three significant figures, with one exception: E192's n = 185 is 9.20, not
  9.19. E96 is every 2nd value of E192, E48 every 4th.
- Usual tolerances: E3 over 20 %, E6 20 %, E12 10 %, E24 5 %, E48 2 %, E96 1 %, E192 0.5 % and tighter.
- E24 is not a subset of E96 (1.2, 1.6 and 1.8 are among those missing), yet 1 % parts are sold in E24 values, so the
  tool also offers the union E24∪E96.

## Colour code (IEC 60062:2016)

| Colour | Digit | Multiplier | Tolerance | TCR ppm/K |
| --- | --- | --- | --- | --- |
| none | – | – | ±20 % (M) | – |
| pink | – | 10⁻³ | – | – |
| silver | – | 10⁻² | ±10 % (K) | – |
| gold | – | 10⁻¹ | ±5 % (J) | – |
| black | 0 | 10⁰ | – | 250 (U) |
| brown | 1 | 10¹ | ±1 % (F) | 100 (S) |
| red | 2 | 10² | ±2 % (G) | 50 (R) |
| orange | 3 | 10³ | ±0.05 % (W) | 15 (P) |
| yellow | 4 | 10⁴ | ±0.02 % (P) | 25 (Q) |
| green | 5 | 10⁵ | ±0.5 % (D) | 20 (Z) |
| blue | 6 | 10⁶ | ±0.25 % (C) | 10 (Z) |
| violet | 7 | 10⁷ | ±0.1 % (B) | 5 (M) |
| grey | 8 | 10⁸ | ±0.01 % (L) | 1 (K) |
| white | 9 | 10⁹ | – | – |

- 3 bands: two digits and a multiplier (±20 %). 4 bands: plus tolerance. 5 bands: three digits. 6 bands: plus TCR.
- A single black band is a 0 Ω link.
- Reading direction: the tolerance band is set apart by a wider gap; a band of gold, silver or pink is never first.
  When both directions give a valid code, show both and mark the one that lands on a standard value.
- **Sources disagree:** older EIA usage has grey as ±0.05 % (A) (DigiKey and others still show it); orange and yellow
  tolerances and pink date from the 2016 edition and are missing from many tables; high-voltage parts use yellow and
  grey for 5 % and 10 % to avoid metallic paint. Show the IEC value and mention the older reading.
- Other tolerance letters: E 0.005 %, H 3 %, N 30 % (unverified; TTTN004 also lists A 0.05 %). The table above matches
  WikiColor (Wikipedia's account of IEC 60062:2016; the standard was not read), and its TCR colours match VishayMarking
  (brown 100, red 50, yellow 25, orange 15, blue 10, violet 5).
- Military failure-rate band (fifth band on four-band parts, % per 1000 h): brown 1, red 0.1, orange 0.01, yellow
  0.001 (verified against NEETS; the matching letters M, P, R, S are in VishayHDN).

## SMD markings

- Three digits: two digits and an exponent (`472` = 4.7 kΩ, `220` = 22 Ω, `101` = 100 Ω, `100` = 10 Ω).
- Four digits: three digits and an exponent (`4992` = 49.9 kΩ, `7500` = 750 Ω).
- `R` is the decimal point and there is then no exponent (`4R7`, `0R22`, `R005`, `68R0`).
- Links: `0`, `00`, `000`, `0000`.
- A tolerance letter may follow (`103J`, `1001F`).
- Milliohms: Vishay marks 0.01 to 0.091 Ω as `10L0` to `91L0` and uses `R` from 0.1 Ω (`R10`) (VishayMarking); whether IEC
  60062 itself uses `L` is unverified. Shunt makers also use `M` or `m` as a milliohm decimal point (`1M50` = 1.5 mΩ),
  which collides with mega: show both readings (unverified, search excerpts of Venkel and TT Welwyn datasheets).
- An underline means different things by maker (an E24 value at 1 %, an orientation mark for `06` against `90`, or a
  milliohm value): show the readings, do not pick one.
- EIA-96: a two-digit code 01 to 96 for the E96 values in order (01 = 100, 68 = 499, 96 = 976), then a multiplier
  letter: Z 0.001, Y 0.01, X 0.1, A 1, B or H 10, C 100, D 1 k, E 10 k, F 100 k. TTTN004 pairs S with Y (0.01) and R with
  X (0.1); other tables pair R with Y and S with X, so R and S are ambiguous: show both readings. TTTN004 has no Z or F
  (unverified). The multiplier F collides with the tolerance letter F. Code 01 = 100, 96 = 976 and 07B = 1.15 kΩ verified.
- Sizes 01005 and 0201 are unmarked, and Yageo marks nothing on 0402 either; 0603 is marked (3 digits at 5 %, EIA-96 at
  1 %) and 0805 and up use 4 digits at 1 % (YageoRC). TT says "where space allows".
- A marking read upside down can be another valid code (`06` and `90`, `601` and `109`): offer it.

## Reading typed values

Accept: `4700`, `4.7k`, `4,7k` (decimal comma), `4k7`, `4K7`, `4R7`, `R47`, `4E7` (E as ohms), `1M`, `1.5 Meg`,
`10m` and `10 mΩ` (lower-case m is milli, upper-case M is mega), `22µ`, `22u`, `1G`, with or without `Ω`, `ohm`, `R`.
Write values as `4.7 kΩ` and in RKM form `4k7`.

## Chip sizes

| Imperial | Metric | L × W mm | Typical power at 70 °C, W | Limiting voltage, V |
| --- | --- | --- | --- | --- |
| 01005 | 0402 | 0.4 × 0.2 | 0.031 | – |
| 0201 | 0603 | 0.6 × 0.3 | 0.05 | 25 to 30 |
| 0402 | 1005 | 1.0 × 0.5 | 0.063 | 50 |
| 0603 | 1608 | 1.6 × 0.8 | 0.1 | 75 |
| 0805 | 2012 | 2.0 × 1.25 | 0.125 | 150 |
| 1206 | 3216 | 3.2 × 1.6 | 0.25 | 200 |
| 1210 | 3225 | 3.2 × 2.5 | 0.5 | 200 |
| 1812 | 4532 | 4.5 × 3.2 | 0.75 | – |
| 2010 | 5025 | 5.0 × 2.5 | 0.75 | 200 (Vishay 400) |
| 2512 | 6332 | 6.3 × 3.2 | 1 | 200 (Vishay 500) |

- Imperial 0402 and metric 0402 are different parts, as are 0603 and 0603: always show both names.
- Power ratings vary by maker and series (0603 at 0.1 or 0.125 W, 0805 at 0.125 or 0.25 W, 2512 up to 2 W): call them
  typical. Checked against VishayCRCW (0402 to 2512, standard rating), VishayCRCW0201 and YageoRC (0075 to 2512; Yageo 1206 is
  3.1 mm long, 1210 3.1 × 2.6, 2512 6.35 × 3.1). Voltages are Yageo's maximum working voltage; Vishay's 2010 and 2512 are
  higher. The 1812 row is unverified: makers list 1218 (3.2 × 4.6, 1 W) instead. Terminations are about 0.25 to 0.6 mm wide.
  Zero-ohm links (Vishay): 20 mΩ, 1.5 A (0402), 2 A (0603), 2.5 A (0805), 3.5 A (1206), 5 A (1210), 6 to 7 A (2010, 2512).

## Axial bodies (verified against YageoCFR and VishayMRS)

| Rating | Body L × ⌀ mm | Lead ⌀ mm |
| --- | --- | --- |
| 1/6 W (Yageo CFR-12; 1/8 W is not a CFR rating) | 3.4 × 1.9 | 0.45 |
| 1/4 W | 6.3 × 2.4 (Vishay MRS25 max 6.5 × 2.5) | 0.55 (MRS25 0.6) |
| 1/2 W | 9.0 × 3.3 | 0.55 |
| 1 W | 11.5 × 4.5 | 0.8 |

Body size does not fix the rating: Vishay MRS25 metal film (0207 body, 6.5 × 2.5 max) is rated 0.6 W and MRS16 (0204,
3.6 × 1.6) 0.4 W.

## Technologies

| Technology | Tolerance | TCR ppm/K |
| --- | --- | --- |
| Thick film (most chip resistors) | 1–5 % | ±100 to ±200 (±200 below 10 Ω); Vishay's general table ±50 to ±200 |
| Thin film, metal film | 0.1–2 % | ±5 to ±50 (leaded metal film 50 to 100) |
| Metal foil | 0.005–0.1 % | about ±0.2 to ±5 |
| Carbon film | 2–10 % | −200 to −1500 (negative; VishayBasics) |
| Metal oxide | 1–5 % | ±75 to ±300 |
| Wirewound | down to 0.005 % | ±1 to ±20 |

- Derating: full rated power up to 70 °C, then linear to zero at the maximum temperature (155 °C for 0402 to 2512,
  125 °C for 0075 to 0201 at Yageo; Vishay gives 0201 155 °C): P(T) = P70·(Tmax − T)/(Tmax − 70) (the linear curve of
  YageoRC Fig. 10; VishayBasics Fig. 9 shows the same shape). The table above is VishayBasics' typical figures; the
  rows for metal oxide, foil and the wirewound extremes are unverified.
- Noise index: 0 dB is 1 µV/V per decade; carbon composition about 0 dB, thin film below −35 dB, foil about −40 dB
  (unverified; VishayBasics only says IEC 60195 defines a current-noise index; Johnson1928 and Nyquist1928 for thermal noise).
- Voltage coefficient: −10 to −100 ppm/V for thick film and carbon (unverified), below 1 ppm/V for thin film (VishayTNPV;
  the 0.1 ppm/V for thin film and foil is unverified).

## Tolerance and temperature

- A resistance at temperature T: R·(1 ± tol)·(1 ± TCR·(T − 25 °C)).
- Worst case: every part at the limit that moves the result furthest (series and parallel networks are monotonic in
  each resistor, so the corners are enough). RSS: root of the sum of squares of each part's effect; valid for
  independent parts. For a divider with ratio k = R2/(R1 + R2), the worst case is about (1 − k)(t1 + t2).
- Parts of the same kind track each other in temperature: offer "TCRs track" (drifts cancel in a ratio) against
  "TCRs opposed" (worst case).

## Combination search

- Series-parallel networks: 2 topologies for two resistors, 4 for three, 10 for four.
- Method that stays fast at E192 (KiCad's PCB Calculator): build every two-resistor series and parallel value once,
  sort it, and for each partner look up the complement by binary search; a four-resistor network is a pair with a
  pair, or a resistor with a resistor-and-pair. Parallel is series in conductance, so one routine serves both.
- E192 over seven decades is about 1,345 values and about 1.8 million pair values: typed arrays, in a worker, cached
  per value list.
- Ranking: smaller error first; near ties go to fewer parts, then the simpler topology, then fewer different values.
