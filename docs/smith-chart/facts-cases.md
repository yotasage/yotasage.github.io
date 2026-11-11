# Smith chart – worked numeric cases (step M0.2)

Part of [facts.md](facts.md) (source keys [E], [S2], [S3], [W] are explained there). Each case: the inputs, the source's
own numbers with the digits it prints, and **ours**: computed in double precision with Node during M0.2 (complex
arithmetic, bisection to full precision where a length is solved for; c = 299 792 458 m/s unless a case says 3·10⁸).
"≈" in a source column means the source writes ≈ or reads the value from a chart. For M1's harness: compare with
*ours* to 1e-9 and with the source to the digits the source prints, unless the case notes a rounding.

## Γ, z, y, VSWR, return loss

**C1. SWR to |Γ|** – [E] §3.14 Example 1. SWR 1.1, 2.0, 3.0 → \|Γ\| = 0.0476, 1/3, 1/2.
Ours: 0.04761904762, 0.3333333333, 0.5.

**C2. 75 Ω on a 50 Ω line** – [E] §3.20 Example 1. Γ = +0.2, \|Γ\|² = 0.04 (4 % reflected), 96 % delivered, SWR = 1.5;
75 Ω to 50 Ω only flips the sign of Γ. Ours: the same exactly; also RL = 13.97940009 dB, ML = 0.1772876696 dB (not
printed by the source; eqs. 14 and 16 of facts.md).

**C3. Plotting z** – [S3] §3.4 Example 3.4.1. z = 1 − j2 → Γ = 0.5 − j0.5 = 0.707∠−45°; z = 0.3 + j0.6 → Γ = −0.268 +
j0.585 = 0.644∠115° (read from the chart, then given to three digits). Ours: 0.5 − j0.5, 0.7071067812∠−45.00000000°;
−0.2682926829 + j0.5853658537, 0.6439209162∠114.6235648°.

**C4. z to y** – [S3] §3.4 Example 3.4.3. z = 1 − j2 → y = 0.2 + j0.4 (the source checks it by 1/z). Ours: 0.2 + j0.4
exactly.

**C5. Plotting Γ** – [W] "Plotting examples". Γ = 0.63∠60° → z = 0.80 + j1.40; 0.73∠125° → 0.20 + j0.50; 0.44∠−116°
→ 0.50 − j0.50 (chart readings, two digits). Ours: 0.7864128309 + j1.422860880; 0.1970618673 + j0.5045568442;
0.5105844301 − j0.5007949112.

**C6. z to y on the chart** – [W] "Impedance–admittance conversion". z = 0.80 + j1.40 → y = 0.30 − j0.54 (chart). Ours
(from C5's Γ, as the source does): 0.2975479797 − j0.5383551279. Its second pair (0.10 + j0.22 → 1.80 − j3.90) is a
rough chart reading: 1/(0.10 + j0.22) = 1.712328767 − j3.767123288. Do not test against it.

**C7. R ∥ C load at 5 GHz** – [S2] §2.3 Example 2. R = 60 Ω ∥ C = 10 pF, f = 5 GHz, Z0 = 50 Ω: Z_L = 0.168 − j3.174
Ω, z_L = 3.368·10⁻³ − j0.063, Γ_L = −0.985 − j0.126 = 0.993∠187.3°, current reflection coefficient 0.985 + j0.126 =
0.993∠7.3°. Ours: Z_L = 0.1683946963 − j3.174165246; z_L = 0.003367893927 − j0.06348330491; Γ_L = −0.9853392692 −
j0.1256128474 = 0.9933136780∠187.2649837°.

**C8. VSWR of C7** – [S2] §2.3 Example 3. VSWR = (1 + 0.993)/(1 − 0.993) = 285. **Rounding:** the source uses the
rounded \|Γ\| = 0.993; with the exact \|Γ\| it is 298.1181110 (ours). A harness must test 298.118…, and the page should
say that VSWR near \|Γ\| = 1 needs \|Γ\| to many digits.

**C9. Standing waves and power** – [S2] §2.3 Example 4. Z_L = 45 + j75 Ω, Z0 = 100 Ω, source 100 Ω with 1 mW available:
Γ_L = 0.570∠98.9° = −0.0881 + j0.563; VSWR = 3.65; P_ref = 0.325 mW; P_load = 0.675 mW; I⁺ = 4.47 mA; \|I\| = 5.48 mA;
P_TH = 1.50 mW; P_load from the current = 0.676 mW. Ours: Γ_L = −0.08818011257 + j0.5628517824 =
0.5697173520∠98.90396196°; VSWR = 3.648107492; P_ref = 0.3245778612 mW; P_load = 0.6754221388 mW (both ways);
\|I\| = 5.478938011 mA; P_TH = 1.500938086 mW. (0.676 vs 0.675 is the source's rounding of \|I\|.)

**C10. Load from a slotted-line measurement** – [S2] §2.3 Example 5. Z0 = 50 Ω, V_max 5 V, V_min 2 V, first minimum 2 cm
from the load, λg = 10 cm: VSWR = 2.5, \|Γ\| = 0.428, Θ = −36°, Γ_L = 0.3463 − j0.2516, Z_L = 83.2 − j51.3 Ω. Ours:
\|Γ\| = 0.4285714286 (the source truncates to 0.428), Γ_L = 0.3467215690 − j0.2519079653, Z_L = 83.25948829 −
j51.38563429 Ω.

**C11. Return loss and S-parameter magnitudes** – [S3] §2.8 Example 1. RL 20 dB → \|S11\| = 0.1000; 3 dB attenuation →
\|S21\| = 0.7080; Γ_S = Γ_L = 0.2000 for the 75 Ω system ((75 − 50)/(75 + 50); the
fetched text read "55", likely a transcription slip, not checked against the page image). Insertion loss in 75 Ω: 2.82 dB. Ours: 0.1, 0.7079457844 (the source rounds
to 0.7080), IL = 2.820389108 dB with 0.7079457844 (the formula of [S3] §2.8 eq:12). Use for RL only; IL is outside v1.

## Lines, λ/4 and stubs

**C12. Line of another impedance (circle centre)** – [S3] §3.5 Examples 3.5.1–3.5.2. 25 Ω load on a 50 Ω line, seen
in a 75 Ω chart: Γ_L,50 = −0.3333, B = −0.2, centre C75 = −0.17857 (the chart reading was −0.177). Ours: −0.3333333333,
−0.2, −0.1785714286; check: the locus runs between Z_in = 25 Ω and 100 Ω, whose Γ75 are −0.5 and 0.1428571429, and
their mid-point is −0.1785714286.

**C13. Shorted stub as an inductor** – [E] §3.17 Example 1. 2.2 nH at 6 GHz, Z0 = 50 Ω, v_p = 0.6c: jωL = j82.9 Ω,
βℓ = 1.028 rad, β = 209.4 rad/m, ℓ = 4.9 mm. Ours: 82.93804605 Ω, 1.028276808 rad, β = 209.4395102 rad/m with c = 3·10⁸
(209.5845022 with exact c), ℓ = 4.909660107 mm with 3·10⁸ (4.906263569 mm with exact c).

**C14. λ/4 transformer 300 → 50 Ω** – [E] §3.19 Example 1. 10 GHz, λ in the line 0.6 λ0: λ0 ≈ 3 cm, λ ≈ 1.8 cm, ℓ ≈
4.5 mm, Zt ≈ 122.5 Ω. Ours: Zt = 122.4744871 Ω; ℓ = 4.496886870 mm with exact c (4.5 mm exactly with 3·10⁸).

**C15. Patch antenna: line to a real point, then λ/4** – [E] §3.19 Example 2. Z_A = 35 + j35 Ω, first section 50 Ω:
Γ ≈ −0.0059 + j0.4142; smallest β1ℓ1 with Im Z1 = 0: 0.793 rad; Z1 ≈ 120.719 − j0.111 Ω; ℓ1 ≈ 0.126λ; λ/4 section
Z02 ≈ 77.7 Ω; ℓ1 + ℓ2 ≈ 0.376λ. Ours: Γ = −0.005917159763 + j0.4142011834; β1ℓ1 = 0.7925405347 rad; Z1 = 120.7193875 Ω
(imaginary part 0; the source's −j0.111 comes from its rounded 0.793 rad); ℓ1 = 0.1261367437λ; Z02 = 77.69150130 Ω.

**C16. Short and open stub for j140 Ω** – [S3] §3.4 Example 3.4.2. Z0 = 100 Ω, Z_in = j140 Ω: shorted stub 0.1515λ, open
stub 0.4015λ (chart readings); the text also gives θ = 54.4° → 0.1511λ. Ours: atan(1.4)/2π = 0.1512842284λ (short),
0.4012842284λ (open); the chart angle of Γ at z = j1.4 is 71.07535558° (source reads 71.2°).

**C17. Shunt shorted stub, Z_L = 75 + j15 Ω** – [S2] §2.4 Example 1. Stub Z01 = 75 Ω: Y_L = 0.01282 − j0.002564 S; stub
admittance +j0.002564 S, Z_stub = −j390 Ω; βℓ1 = 1.761 rad = 100.9°; remaining Z_X = 1/Re{Y_L} = 78.00 Ω. Ours:
Y_L = 0.01282051282 − j0.002564102564 S; Z_stub = −j390 Ω exactly; βℓ1 = 1.760784615 rad = 100.8855271°; Z_X = 78 Ω.

**C18. Shunt open stub, same load** – [S2] §2.4 Example 3. βℓ1 = 0.1900 rad = 10.89°. Ours: 0.1899882879 rad =
10.88552705°. (The two stubs differ by exactly 90° of electrical length.)

**C19. Resonant shorted λ/4 line as LC** – [S2] §2.4 Example 2. Zc = 12.28 Ω, λ/4 at 1850 MHz: C = π/(4ω_r Zc) = 5.502 pF,
L = 1.345 nH. Ours: 5.502244916 pF, 1.345107173 nH.

**C20. Single shunt stub match** – [E] §3.23 Example 1. Source 50 Ω, load 33.9 + j17.6 Ω, all lines 50 Ω: Γ ≈ −0.142 +
j0.239; line ℓ1 ≈ 0.020λ from the load to the stub; Y1 ≈ 0.0200 − j0.0116 S; stub +j0.0116 S: open ℓ2 ≈ 0.084λ, short
ℓ2 ≈ 0.334λ. Ours: Γ = −0.1416565859 + j0.2394893434; ℓ1 = 0.02006726246λ; Y1 = 0.02 − j0.01158750217 S; open
0.08357481879λ, short 0.3335748188λ.

## Lumped matching

**C21. Line + series C** – [E] §3.22 Example 1. Same load and source as C20, f = 1.5 GHz, 50 Ω line with v_p = 0.6c:
βℓ ≈ 0.408 rad, Z1 ≈ 50.0 + j29.0 Ω, β ≈ 52.360 rad/m, ℓ ≈ 7.8 mm, series −j29.0 Ω, C ≈ 3.7 pF. Ours: βℓ =
0.4080555190 rad; Z1 = 50 + j28.96875542 Ω; C = 3.662680493 pF; β = 52.35987756 rad/m with 3·10⁸ (52.39612555
exact c), ℓ = 7.793286349 mm with 3·10⁸ (7.787894901 mm exact c).

**C22. Line + shunt C** – [E] §3.22 Example 2. Same: βℓ ≈ 0.126 rad, Y1 ≈ 0.0200 − j0.0116 S, ℓ ≈ 2.4 mm, jB_p ≈
+j0.0116 S, 1/(jB_p) ≈ −j86.3 Ω, C ≈ 1.2 pF. Ours: βℓ = 0.1260863287 rad; 1/(jB_p) = −j86.29987598 Ω; C =
1.229472165 pF; ℓ = 2.406405576 mm (exact c), 2.408071496 mm with 3·10⁸.

**C23. L network 100 → 1700 Ω at 900 MHz** – [S3] §6.4 Example 6.4.1. Series L at the source side, shunt C at the load:
Q = 4, X_S = 400 Ω, L = 70.7 nH, \|X_C\| = 425 Ω, C = 0.416 pF. A series-C version also exists. Ours: L = 70.73553026 nH,
C = 0.4160913545 pF; the network's input is 100 + j0 Ω exactly.

**C24. L network 50 → 75 Ω, two solutions** – [S3] §6.4 Example 6.4.2. Q = 0.7071; \|X_S\| = 35.35 Ω, \|X_P\| = 106.1 Ω;
low-pass: X_S = +35.35, X_P = −106.1; high-pass: X_S = −35.35, X_P = +106.1. Ours: 0.7071067812, 35.35533906,
106.0660172.

**C25. L match on the chart, 25 → 200 Ω** – [S3] §6.7 Example 6.7.1. Z0 = 50 Ω, r_S = 0.5, r_L = 4: path (a) series x_S =
1.323 → X_S = 66.1 Ω; shunt b_P = 0.661 → B_P = 13.22 mS, X_P = −75.6 Ω (the other path is shown, not computed). Ours:
x_S = √1.75 = 1.322875656, X_S = 66.14378278 Ω; b_P = 0.6614378278, B_P = 13.22875656 mS, X_P = −75.59289460 Ω.

**C26. L match between complex impedances** – [S3] §6.7 Example 6.7.2. Z_S = 12.5 + j12.5 Ω, Z_L = 50 − j50 Ω, Z0 = 50 Ω,
target z_S* = 0.25 − j0.25; shunt C at the load, series L at the source: b_C = 0.5, b_B = 1.323, b_P = 0.823, B_P =
16.5 mS, X_P = −60.8 Ω, x_S = 0.411, X_S = 20.6 Ω. **Slip:** the source prints x_S = −0.25 − (0.661); it means
−0.25 − (−0.661) = 0.411 (x_B = −0.661). Ours: b_B = 1.322875656, b_P = 0.8228756555, B_P = 16.45751311 mS, X_P =
−60.76252185 Ω, z_B = 0.25 − j0.6614378278, x_S = 0.4114378278, X_S = 20.57189139 Ω.

**C27. Series-C match with a line (chart)** – [W] "Distributed-component matching". Z0 = 50 Ω, 800 MHz, load 17.5 Ω +
6.5 nH: jωL = j32.7 Ω, z_T = 0.35 + j0.65, λ = 375 mm; line 0.079λ = 29.6 mm to z = 1.00 + j1.52, series C_m = 2.6 pF;
shunt alternative: line 0.329λ = 123 mm to y = 1.00 + j1.52, shunt L_m = 6.5 nH. Ours: jωL = j32.67256360, z_T = 0.35 +
j0.6534512719, λ = 374.7405725 mm; line 0.07907895786λ = 29.63409394 mm to z = 1 + j1.557927712, C_m = 2.553952630 pF;
shunt: 0.3290789579λ = 123.3192371 mm, L_m = 6.384881574 nH. (The source's j1.52 is a chart reading; the lengths agree.)

**C28. Four-part lumped ladder at 100 MHz (chart)** – [W] "Lumped-element circuits". Z0 = 50 Ω, λ = 3 m: series C1 at
x = −0.80 → 40 pF; shunt L1 at b = −1.49 → 53 nH; series C2 at x = −0.23 → 138 pF; shunt C3 at b = +1.14 → 36 pF.
Ours (the conversions only, eq. 24): 39.78873577 pF, 53.40769902 nH, 138.3956027 pF, 36.28732702 pF; λ = 2.997924580 m.

## Coverage

Γ ↔ z: C3, C5, C7, C10 · y: C4, C6, C26 · VSWR: C1, C2, C8, C9, C10 · RL, ML: C2, C11 · power: C2, C9 · line
Z_in and rotation: C15, C20, C21, C22, C27 · line of another Zc: C12 · λ/4: C14, C15 · stubs: C13, C16–C20 · L and C
values: C13, C19, C21–C23, C27, C28 · L network and Q: C23–C26. Not found with numbers in an opened source: a series
stub, a case of the ABCD forms (the ABCD forms are tested against eq. 18 in M1 instead), the node-Q readout of a point.
