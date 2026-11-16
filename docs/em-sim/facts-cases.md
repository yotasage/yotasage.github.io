# EM simulation – numeric cases (steps M0.2a and M0.2b)

Reference values for the harness: exact quasi-static solutions computed to 10 significant digits, formula values with
the accuracy their source states, and published numbers. Formulas and sources are in [facts.md](facts.md) §8 and
[facts-formulas.md](facts-formulas.md); keys in `code` are entries of `references.bib`.

**How the exact values were computed** (M0.2a, 2026-11-16): a short Python 3.14 script in the session's scratch folder
(not kept in the repo), f64 arithmetic, constants of facts.md §1 (CODATA 2022 μ0, η0 = 376.730 313 4 Ω,
ε0 = 8.854 187 819 × 10⁻¹² F/m). Complete elliptic integrals by the AGM (`DLMF19` 19.8.5) with k′ = sech(·) taken
directly, never √(1 − k²). **Second routes:** K(k) by the AGM agreed with mpmath's `ellipk` (30 digits) and with
mpmath's quadrature of ∫dθ/√(1 − k²sin²θ) to all 10 digits at k = 0.1, 0.5, 0.9, 0.999 (C30); Cohn's stripline at
w/b = 0.5 and 2 recomputed in 30-digit mpmath: identical to 10 digits. The cross-checks of each row are in the last
column. Values are per unit length; C in pF/m, Z in Ω; all dimensions in mm. A row's εr = 1 value scales as Z/√εr,
C·εr for a homogeneous medium.

## Exact cases

| id | Geometry (mm) | εr | Quantity | Value | Source · cross-check |
|---|---|---|---|---|---|
| C01 | Coax, a = 0.5, b = 1.75 | 1 | Z0; C | 75.11377791 Ω; 44.40784427 pF/m | facts.md §8 coax · equals the eccentric formula at d = 0 to 10 digits |
| C02 | Coax, a = 1.0, b = 2.3 | 2.1 | Z0; C | 34.46185654 Ω; 140.2653095 pF/m | coax · as C01 |
| C03 | Coax (via-like: drill 0.3, antipad 1.0), a = 0.15, b = 0.5 | 4.3 | Z0; C | 34.81233450 Ω; 198.6919980 pF/m | coax · as C01 |
| C04 | Coax with two layers: a = 0.5, r1 = 1.0 (εr 4.3 inside r1), b = 2.0 (εr 1 outside) | 4.3 / 1 | C; C0; εeff; L; Z0 | 65.11720084 pF/m; 40.13036796 pF/m; 1.622641509; 277.2588722 nH/m; 65.25215579 Ω | two-layer coax · εeff = 2·4.3/5.3 in closed form (ln r1/a = ln b/r1); L = (μ0/2π)·ln 4 |
| C05 | Eccentric coax, a = 0.5, b = 2.0, offset d = 0.75 | 1 | Z0; C | 73.24781427 Ω; 45.53911929 pF/m | eccentric coax · Z0 below the concentric 83.1 Ω, as it must |
| C06 | Eccentric coax, a = 0.5, b = 2.0, d = 1.2 (0.3 mm wall gap) | 4.3 | Z0; C | 25.21636182 Ω; 274.3033411 pF/m | eccentric coax |
| C07 | Two wires, radius a = 0.5, centre distance D = 2.0 | 1 | Z0 (balanced = Zdiff); C | 157.9256180 Ω; 21.12159506 pF/m | two wires · = 2 × C10 to 10 digits (image) |
| C08 | Two wires, a = 0.1, D = 1.0 | 4.3 | Z0; C | 132.5692703 Ω; 52.17598528 pF/m | two wires · = 2 × wire over plane at h = 0.5 to 10 digits |
| C09 | Two unequal wires, a1 = 0.15, a2 = 0.25, D = 1.0 | 1 | Z0; C | 191.4414216 Ω; 17.42382043 pF/m | two unequal wires · thin-wire value 196.8685715 Ω is 2.8 % high (the quasi-coax N = 1 check, facts-formulas.md §7) |
| C10 | Wire over plane, a = 0.5, centre height h = 1.0 | 1 | Z0; C | 78.96280899 Ω; 42.24319011 pF/m | wire over plane · ½ × C07 |
| C11 | Wire over plane, a = 0.1, h = 0.5 | 4.3 | Z0; C | 66.28463517 Ω; 104.3519706 pF/m | wire over plane |
| C12 | Parallel plates, w = 1.0, d = 0.1, no fringing (per 1 mm of width) | 4.3 | C; Z0 | 380.7300762 pF/m; 18.16754895 Ω | parallel plates (exact only as w/d → ∞; for the solver: a periodic or wall-bounded cell) |
| C13 | Parallel plates, two layers: d1 = 0.092 (εr 4.3) + d2 = 0.02 (εr 3.8), w = 1.0, no fringing | 4.3 / 3.8 | C; C0; εeff; Z0 | 332.1336753 pF/m; 79.05524838 pF/m; 4.201285583; 20.58531361 Ω | series layers · εeff = 0.112/(0.092/4.3 + 0.02/3.8) |
| C14 | Zero-thickness stripline, w/b = 0.1 | 1 | Z0 | 194.2262546 Ω | Cohn · narrow limit (η0/2π)·ln(8b/πw) = 194.1034 (0.06 %) |
| C15 | Stripline, w/b = 0.5 | 1 (4.3) | Z0 | 100.4324507 Ω (48.43282847 Ω at εr 4.3) | Cohn · mpmath 30 digits identical |
| C16 | Stripline, w/b = 1.0 | 1 (4.3) | Z0 | 65.35362510 Ω (31.51631661 Ω) | Cohn · wide limit 65.3469 (0.01 %) |
| C17 | Stripline, w/b = 2.0 | 1 | Z0 | 38.57932255 Ω | Cohn · wide limit (η0/4)/(w/b + 2ln2/π) = 38.57931816 (1.1 × 10⁻⁷) |
| C18 | Stripline, w/b = 5.0 | 1 | Z0 | 17.30892927 Ω | Cohn · equals the wide limit to 10 digits (parallel plates plus exact fringe) |
| C19 | Edge-coupled stripline, w/b = 0.5, s/b = 0.1 | 1 | Zeven; Zodd | 122.8856652 Ω; 69.86609071 Ω | Cohn coupled |
| C20 | as C19 | 1 | Zdiff = 2Zodd; Zcm = Zeven/2; k = (Ze − Zo)/(Ze + Zo) | 139.7321814 Ω; 61.44283258 Ω; 0.2750666224 | from C19 (symmetric pair, facts.md §5–6) |
| C21 | Coupled stripline, w/b = 0.5, s/b = 0.5 | 1 | Zeven; Zodd | 107.1543785 Ω; 93.21719672 Ω | Cohn coupled |
| C22 | Coupled stripline, w/b = 0.5, s/b = 1.0 | 1 | Zeven; Zodd | 101.8633803 Ω; 98.98059904 Ω | Cohn coupled · approaching C15 (100.4325) from both sides |
| C23 | Coupled stripline, w/b = 0.25, s/b = 0.25 | 1 | Zeven; Zodd | 166.5138396 Ω; 111.1743647 Ω | Cohn coupled (single line at w/b = 0.25: 139.9170993 Ω) |
| C24 | Coupled stripline, w/b = 0.5, s/b = 5.0 | 1 | Zeven; Zodd | 100.4324557 Ω; 100.4324457 Ω | Cohn coupled · both within 5 × 10⁻⁸ of the single line C15 |
| C25 | Coupled stripline, w/b = 0.5, s = 0 (strips touching) | 1 | Zeven; Zodd | 130.7072502 Ω; 0 | Cohn coupled · Zeven = 2 × stripline at w/b = 1.0 (2 × C16) to 10 digits (Landen's transformation) |
| C26 | Coplanar waveguide, zero thickness, w = 0.3, gaps g = 0.2, on an infinitely thick substrate | 4.3 | Z0; εeff; C | 80.43498551 Ω; 2.65 (exact); 67.50831157 pF/m | CPW (Wen) · εeff = (εr + 1)/2 derived (facts.md §8) |
| C27 | Coplanar waveguide in air, w = 1.0, g = 0.5 | 1 | Z0; C | 120.4841532 Ω; 27.68530852 pF/m | CPW |
| C28 | Coupled stripline, w/b = 1.0, s/b = 0.2 | 1 | Zeven; Zodd (Zdiff; Zcm) | 72.16242989 Ω; 55.94039373 Ω (111.8807875 Ω; 36.08121494 Ω) | Cohn coupled |
| C29 | Coupled stripline, w/b = 0.3, s/b = 0.3 | 4.3 | Zeven; Zodd (Zdiff; Zcm) | 71.93362543 Ω; 51.97862642 Ω (103.9572528 Ω; 35.96681271 Ω) | Cohn coupled (a 100 Ω-class pair in FR-4) |
| C30 | Complete elliptic integral K(k) at k = 0.1; 0.5; 0.9; 0.999 | — | K | 1.574745562; 1.685750355; 2.280549138; 4.495596396 | AGM = mpmath `ellipk` = quadrature, 10 digits |

## Approximate and published cases

| id | Geometry (mm) | εr | Quantity | Value | Source · status |
|---|---|---|---|---|---|
| C31 | Hilberg's approximation of K(k)/K(k′) at k = 3/7 (C26's modulus) | — | K/K′ | 0.7192877194 (exact 0.7192877280) | `QucsTech` CPW page · error 1.2 × 10⁻⁸, within the stated 10⁻⁵ |
| C32 | Microstrip in air, zero thickness, u = w/h = 0.5 | 1 | Z0 | 166.6997986 Ω | `HammerstadJensen1980` via `QucsTech` · formula value; stated within 0.01 % of the exact air line (so the exact value is 166.70 ± 0.017 Ω) |
| C33 | Microstrip in air, u = 1.0 | 1 | Z0 | 126.4238651 Ω | as C32 · ± 0.013 Ω |
| C34 | Microstrip in air, u = 2.0 | 1 | Z0 | 89.02893020 Ω | as C32 · stated 0.03 % for u ≤ 1000: ± 0.027 Ω |
| C35 | Microstrip, FR-4: h = 1.575, w = 3.15, t → 0 (Ellingson's Example 3.11.1) | 4.5 | Z0 | "≈ 50 Ω" (published, design value) | `Ellingson2018` §3.11 · Wheeler 1977 gives 48.08004869 Ω, Hammerstad–Jensen 48.19509044 Ω with εeff 3.412374676 (the example's εeff ≈ 2.75 is its stated crude estimate) |
| C36 | Quasi-coaxial via: barrel a = 0.15, N = 4 returns of b = 0.15 on R = 1.0 | 4.3 | Z0 (thin-wire formula) | 58.54694837 Ω (N = 8: 54.19540656 Ω) | facts-formulas.md §7, derived · approximate (thin-wire); the harness's FD solver gives the reference |
| C37 | Microstrip w = 0.1375, h = 0.0925, t = 0.035 | 4.3 | Z0 by the closed forms | Hammerstad–Jensen 53.18045893; Wheeler 1977 53.44447643; IPC-2141 48.74699745 Ω | facts-formulas.md §1–3 · formula values for testing their implementation; M0.2a's rough FD gives 52.04 Ω (facts.md §9) |

## Owner's cases (M0.2b, C38–C45)

Read on 2026-11-16 where they are, never copied. **Carrier** = `E:\OneDrive - NTNU\ULDAC\PCB\ARTI-CARRIER-PICO2\`
`ARTI-CARRIER-PICO2.kicad_pcb` (with its `.kicad_pro` and `.kicad_dru`); **mezzanine** =
`E:\OneDrive - NTNU\ULDAC\PCB\2026_ARTIFICER_TC1\2026_ARTIFICER_TC1.kicad_pcb` (likewise); both KiCad 10, version
20260206. A scratch script (not kept) measured track widths and lengths per class and layer, the edge gap of each pair
(distance from a segment's midpoint to the partner's centre line minus the half widths), via and pad sizes, distances
to GND vias, and the clearance of the filled GND pours (`filled_polygon`) around vias and along tracks. Lengths in mm;
mil = 0.0254 mm. JLCPCB's numbers: [facts-fab.md](facts-fab.md) §1.

| id | What | Values | Source |
|---|---|---|---|
| C38 | **Stackup** as KiCad stores it vs JLC061611-3313A | KiCad (both boards identical): mask 0.01 / F.Cu 0.035 / prepreg 0.092 / In1 0.03 / core 0.13 / In2 0.03 / prepreg 1.003 / In3 0.03 / core 0.13 / In4 0.03 / prepreg 0.092 / B.Cu 0.035 / mask 0.01; total 1.657 (`(general (thickness 1.657))`); every dielectric "FR4", εr 4.3, tanδ 0.02; masks without material or εr; `copper_finish "None"`, `dielectric_constraints yes`. **Differences from 3313A:** (1) thicknesses equal, but KiCad's one 1.003 "prepreg" is JLCPCB's 1080 0.069 + 0.865 + 1080 0.069; (2) εr 4.3 everywhere vs 4.1 (3313), 4.17 (0.13 core), 3.91 (1080), unstated (0.865; 4.43 if a core); (3) mask 0.01 mm without εr vs 1.2 mil on laminate, 0.6 mil over copper, 1.2 mil between traces, εr 3.8; (4) outer copper 0.035 as in JLCPCB's stackup, but 1.6 mil (0.0406) in the calculator's table; (5) no trapezoid in KiCad vs top = base − 0.7 mil; (6) JLCPCB's carrier email names **3313G**, the owner's notes 3313A (open). In1 and In4 are solid GND under the controlled tracks; In2/In3 carry power and slow signals (and GND pour on the carrier) | both `.kicad_pcb` `(setup (stackup …))`; `ARTI-CARRIER-PICO2/docs/jlcpcb-production.md` Step 9; the carrier's JLCPCB email in `emails/` |
| C39 | **`50R_SE` on F.Cu over In1** (carrier) | w = 0.1377 (5.42 mil, class `track_width`), t = 0.035, h = 0.092 (3313); 388.7 of track at this width (plus a 0.6 neck at 0.2). GND pour on F.Cu: nearest edge 0.600 (rule `GND_zone_data`, 0.6 mm, in `.kicad_dru`); 203 of track with the pour 0.6–1 away, 81 at 1–2, 97 beyond 2: non-coplanar. **Hammerstad–Jensen** (no mask, rectangle; facts-formulas.md; the script reproduces C37's 53.18045893 to 10 digits): εr 4.1, t 0.035: **54.0558 Ω**, εeff 2.8632; εr 4.1, t 0.0406: 53.5169 Ω; KiCad's εr 4.3, t 0.035: 52.9811 Ω, εeff 2.9805 | carrier `.kicad_pro` `net_settings`, `.kicad_pcb` segments and zones, `.kicad_dru` |
| C40 | **`50R_SE` on B.Cu over In4** (carrier) | as C39, mirrored (In4–B.Cu prepreg 0.092 = L1–L2): 607.2 of track; pour 0.6–1 away along 246, 1–2 along 99, beyond 2 along 167; **8.7 of track nearer than 0.6** (minimum 0.20; where was not checked, probably at pads). Check: equals C39 to solver precision | as C39 |
| C41 | **`LVDS_100R` pair on F.Cu over In1** (mezzanine) | class `diff_pair_width` 0.11, `diff_pair_gap` 0.2 (`track_width` 0.11, `clearance` 0.2); 557.7 of 0.11 track on F.Cu (both conductors); measured edge gap **0.200** along 161.7 of the + conductor and 0.201–0.202 along 34.7, wider (0.25–0.91) where the pair splits at pads and vias; no GND pour on F.Cu within 2 (nearest 8.9): non-coplanar | mezzanine `.kicad_pro`, `.kicad_pcb` |
| C42 | **`LVDS_100R` pair on B.Cu over In4** (mezzanine) | 136.7 of 0.11 track; gap 0.200 along 46.4 of the + conductor; nearest GND pour on B.Cu 1.32 | as C41 |
| C43 | **Default diff pair** 0.2 / 0.25 on F.Cu over In1 | Default class of both boards: `diff_pair_width` 0.2, `diff_pair_gap` 0.25, `diff_pair_via_gap` 0.25, `track_width` 0.2, `clearance` 0.2 (carrier) / 0.1 (mezzanine); no target impedance: what an unassigned pair gets | both `.kicad_pro` |
| C44 | **Carrier `50R_SE` via** | 21 vias, pad 0.6 / drill 0.3, F.Cu–B.Cu, pad on all six layers (unused pads kept); GND pours on all six layers stay **0.9 from the via centre** (antipad Ø1.8 = pad 0.6 + 2 × 0.6 rule clearance; measured in the filled polygons); nearest GND vias 0.8 (two each, for the six vias in a column at x = 198.29) or 1.1–1.5 for the others; barrel through 1.637 (pressed), no stub for F.Cu ↔ B.Cu. All carrier vias: 0.6/0.3 ×1205, 0.55/0.25 ×78 | carrier `.kicad_pcb` vias and zones, `.kicad_dru` |
| C45 | **Mezzanine LVDS via pair** (footprint `LVDS:Via_100R`, 8 pairs; through-hole pads stand for the vias) | signal pads Ø0.5, drill 0.22, at (0, 0) and (0, 0.7) (pitch 0.7), only on the connected layers F.Cu and B.Cu (`remove_unused_layers yes`). **Antipad on In1 and In4 (GND):** the pour stays 0.61 from each centre (hole radius 0.11 + the 0.5 rule "LVDS through-hole pad to planes", taken from the hole where the pad is removed) and the footprint's keep-out joins the two (circles r 0.6 and a 1.2 × 0.7 rectangle on In1–In4): a stadium about **1.22 × 1.92**. In2/In3: no copper within 1.5 (one pair: In3 pour at 1.375). **Six GND vias** Ø0.4, drill 0.2, solid to the pours, at (±0.67, −0.47), (0, −0.81), (±0.67, 1.17), (0, 1.51): 0.810 and 0.818 from the nearer signal via, 1.160 and 1.059 from the pair's centre (0, 0.35); the board's next GND vias 2.2–5 away. Class via in `.kicad_pro`: 0.5/0.22. All mezzanine vias: 0.4/0.15 ×424, 0.6/0.3 ×412, 0.55/0.25 ×249, 0.4/0.2 ×45 | mezzanine `.kicad_pcb` footprint and zones, `.kicad_dru` |

### JLCPCB's numbers for them

- **Carrier** (`ARTI-CARRIER-PICO2/manufacturing/Impedance Control/Required_impedance_control.xlsx`): 47 rows, all
  "Single Ended (Non coplanar)", 5.42 mil, 50 Ω ±10 %, L1 ref L2 or L6 ref L5. JLCPCB's reply (email of 2026-11-14):
  "the trace width and spacing need to be adjusted as shown below. The stack-up will be kept as JLC061611-3313G". **The
  adjusted width is in an image that the `.msg` does not contain** (it links to a file on JLCPCB's server under an
  order-specific address, which was not fetched): open, for the owner to type in.
- **Mezzanine** (`2026_ARTIFICER_TC1/manufacturing/Required_impedance_control.xlsx`): 10 rows, "Differential Pair (Non
  coplanar)", **4.36 mil (0.1107) / 8 mil (0.2032)**, 100 Ω ±10 %, 8 × L1 ref L2 and 2 × L6 ref L5 (KiCad has 0.11 / 0.2).
  JLCPCB's reply (2026-10-13/14): "the trace width and spacing should be unchanged as shown below" (table again an
  image, not in the `.msg`); the owner answered that his numbers came from JLCPCB's online calculator and that theirs
  differed. Which numbers differed is open.

## Validation table

v2's form (notes-M0.1.md). Open cells (—) are for the owner (inputs below) or for later steps ("This tool": M2 and M3;
"Exact or refined reference": the harness's FD solver and openEMS, D11).

| Case | Geometry | Exact or refined reference | JLCPCB | Saturn | Other calculators | This tool | Largest difference | Explanation |
|---|---|---|---|---|---|---|---|---|
| C39 | microstrip L1/L2, w 0.1377, h 0.092 (3313), t 0.035, mask | — | target 50 Ω at 5.42 mil; adjusted width — (owner) | — | H–J 54.06 Ω (no mask, εr 4.1) | — | — | mask and trapezoid (facts.md §9) |
| C40 | as C39 on L6/L5 | = C39 | as C39 | — | as C39 | — | — | mirror check |
| C41 | edge-coupled pair L1/L2, w 0.11 (sheet 4.36 mil), s 0.2 (8 mil) | — | 100 Ω at 4.36/8 mil, "unchanged"; calculator — (owner) | — | — | — | — | — |
| C42 | as C41 on L6/L5 | = C41 | as C41 | — | — | — | — | mirror check |
| C43 | pair L1/L2, w 0.2, s 0.25 | — | — (owner) | — | — | — | — | informative |
| C44 | via 0.6/0.3, antipad Ø1.8 on all layers, GND vias 0.8–1.5 away | — (openEMS, M3) | — | — (via tab) | C36's thin-wire form | — | — | — |
| C45 | via pair Ø0.5/0.22, pitch 0.7, stadium antipad, 6 GND vias | — (openEMS, M3) | — | — | — | — | — | — |
| C14–C18 | Cohn zero-thickness stripline | exact | — | — | — | — | — | — |
| C19–C25, C28–C29 | Cohn coupled stripline | exact | — | — | — | — | — | — |
| C26–C27 | coplanar waveguide | exact | — | — | — | — | — | — |

## Inputs for the owner

**JLCPCB's calculator** (https://jlcpcb.com/pcb-impedance-calculator): 6 layers, finished thickness 1.6 mm, outer
copper 1 oz, inner copper 1 oz, stackup **JLC061611-3313G** (note its layer table; if G is missing, use 3313A and say
so). Then: C39 single-ended non-coplanar, 50 Ω, L1 over L2 → width (mil); C40 the same, L6 over L5; C41 differential
non-coplanar, 100 Ω, L1 over L2, spacing 8 mil → width, and again with spacing 7.874 mil (0.2 mm); C42 the same on L6
over L5; C43 (optional) the 100 Ω width at spacing 9.843 mil. From the order emails: the table in the carrier's reply
(width, spacing, impedance per row) and in the mezzanine's.

**Saturn PCB Toolkit** (field names as Saturn shows them): C39 Conductor Impedance, microstrip: W 5.421 mil, H 3.622 mil
(0.092 mm), Er 4.1, copper 1.378 mil (1 oz, no plating), no etch factor → Zo, εeff; again with Er 4.3 (KiCad). C41
Differential Pairs, edge-coupled external: W 4.36, S 8, H 3.622, Er 4.1, T 1.378 → Zdiff, Zodd, Zeven; again with
W 4.331, S 7.874. C43: W 7.874, S 9.843. C44 Via Properties: hole 11.81 mil, pad 23.62 mil, reference plane opening
70.87 mil, via height 64.45 mil (1.637 mm), Er 4.3. Note whether Saturn includes solder mask (if it offers one: 0.6 mil
over copper, Er 3.8).
