# EM simulation – numeric cases (step M0.2a; the owner's cases follow in M0.2b)

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

## Owner's cases and validation table (M0.2b)

Filled by M0.2b: the owner's boards (read where they are, path given per row), JLCPCB's numbers and the inputs for the
owner to run JLCPCB's calculator and Saturn PCB Toolkit where the agent cannot. One row per case, v2's form
(notes-M0.1.md):

| Case | Geometry | Exact or refined reference | JLCPCB | Saturn | Other calculators | This tool | Largest difference | Explanation |
|---|---|---|---|---|---|---|---|---|
