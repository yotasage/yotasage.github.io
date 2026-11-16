# EM simulation – static solvers (step M0.3, 2026-11-16)

How the static solvers are formulated: the 2D boundary-element solver (engine.md §4, M1.2), the modes (M1.3), the
axisymmetric solver (§5, M1.6) and the via model (§6, M1.7), each decision with its reason and the measured numbers.
The independent finite-difference solver of the harness (M1.4) is designed in [solver-fd.md](solver-fd.md), which
M1.4's agent reads instead of this file. Where this file and engine.md disagree, this file wins (engine.md §1).

**Measurements** come from the spike in `scripts/harness/emsim/spikes/` (`bem2d.mts`, the solver; `run.mts`, the
cases and tables; `npm run spike` in `scripts/harness/emsim`, or `npx tsx spikes/run.mts exact|refined|trunc|eta|time|lu|agm`).
It ran in Node 26 (V8, the engine of Chrome and Edge) on the owner's laptop, single thread. The spike is throwaway
code but correct; M1.2 may copy its closed-form integrals and kernels (§2.3) after reading them.

## 1. Answers to engine.md's "M0.3 decides"

| engine.md | Question | Answer (section) |
|---|---|---|
| §4 Formulation | Unknowns, Green's function, planes | Total charge on straight panels, piecewise constant, midpoint collocation; planes never as panels: free space (no plane, plus a neutrality row), one image (one plane), closed-form parallel-plate kernel (two planes) (§2.1–2.2) |
| §4 Formulation | Infinite interfaces, truncation | Rays of geometrically growing panels to X = 100 × the structure's size (≥ 20 mm for PCB traces); measured error < 10⁻⁶; no asymptotic correction (§2.4) |
| §4 Formulation | Grading, corners | Algebraic grading q = 2 towards both ends of every straight edge; no singular basis functions (§2.5) |
| §4 Formulation | Panel integrals | Closed form for ln r and its gradient on every pair, no far-field quadrature; parallel-plate kernel: closed form for the source and its two first images plus 2-point Gauss on the smooth remainder (§2.3) |
| §4 Error estimate | What the page shows | e = \|Z(M) − Z(M/2)\|, at least 10⁻⁵·Z, beside Z(M) (§2.6) |
| §4 Layered Green's function | Needed? | No: the plain formulation meets 0.1 % with 182 panels on the owner's microstrip with mask (§2.7) |
| §4 Modes | Eigen-solution | Cholesky C = RᵀR, W′ = R·L·Rᵀ, cyclic Jacobi; every impedance from Zc; clusters at 10⁻⁹ (§3) |
| §5 Kernel | Singularity, truncation, output | Subtract the 2D log in closed form, 8-point Gauss on the bounded rest; grounded coaxial wall at R_w; excess capacitance per crossing by z windows (§4) |
| §6.1 Segments | Several dielectrics in one barrel segment | Cascade one homogeneous sub-segment per dielectric layer: exact for the line part, no averaging (§5.1) |
| §6.3 Pad coupling | Pair pads | ΔC12 = ΔC·(−C12/C11) of the barrel pair's cut, flagged until M6.4 checks it (§5.2) |
| §10 Budgets | Reachable? | Microstrip with mask: yes (6.5 ms for 20 ms). Coupled pair with mask and coplanar ground: **no** (57 ms for 40 ms), and the pair rows of inverse, sweep and Monte Carlo follow; flagged for the owner with the measures that close most of it (§6) |

## 2. The 2D boundary-element solver

### 2.1 Unknowns and equations

Every boundary is cut into straight panels; on panel j the unknown is the **total** surface charge density
σ_j = ε0·s_j (free plus bound), constant over the panel, and everything sits in vacuum with the Green's function of
§2.2. Collocation at panel midpoints x_i, one equation per panel:

- **conductor panel:** Σ_j s_j·P_ij = V_c(i) (P_ij the potential at x_i of unit s on panel j);
- **interface panel** between εP (the side its normal n points to) and εM: normal D continuous,
  (εP + εM)/2 · s_i + (εP − εM)·E_n,pv(x_i) = 0, with E_n,pv = −Σ_j s_j ∇P_ij·n_i the principal value (a flat panel's
  own contribution is 0; the jump ±s_i/2 is the first term). Interfaces with εP = εM are dropped.
- **free charge** of conductor c: Q_c = ε0·Σ_{j∈c} εr(j)·s_j·L_j, εr(j) of the medium the panel faces (a conductor
  panel faces one medium; split panels where a conductor meets an interface, which the edge cut does anyway).
- One LU of the matrix, one right-hand side per signal conductor (V = 1 on it, 0 on all others) → the Maxwell matrix
  C; the vacuum problem (conductor panels only, εr = 1) → C0. In 2D C per unit length is scale-free, so lengths stay
  in mm.

Why total charge: one unknown per panel everywhere, one free-space-type kernel for all of them, and the image and
parallel-plate kernels stay exact because planes are conductors (their total charge is what the image represents).

**Curved interfaces are not used.** Every interface of a trace cross-section is straight (stackup layers, mask,
trapezoids), the via cuts are homogeneous (§5.1) and the axisymmetric generating lines are straight. The spike shows
why that matters: on the two-layer coax C04 (a circular interface as an inscribed polygon) the error falls only at
order 0.6–0.9 (1.71 %, 1.15 %, 0.66 %, 0.35 % at 73–577 panels); adding the missing curvature part of the self term
(κL/4π) helps (0.27 %, 0.13 %, 0.14 %, 0.085 %) but stays irregular. If a curved interface is ever needed (phase 2),
it takes curved panels, not this correction.

### 2.2 Green's function: chosen by the planes

Only the nearest solid plane below and above the signal conductors matter: a solid plane shields everything beyond
it, which is therefore left out of the cross-section (engine.md §2 roles). Three kernels, all exact:

| Planes | Kernel (potential at P of a unit line charge at Q, in 1/ε0) | Extra |
|---|---|---|
| none (CPW without bottom ground, a via cut) | −ln r / 2π | one unknown constant V0 in every conductor row and one row Σ s_j·L_j = 0 (net charge zero; without it a 2D capacitance to "ground" is undefined) |
| one plane at z = zp | −(ln r − ln r′)/2π, r′ to the mirror image of Q in the plane | coordinates shifted so zp = 0, mirrored when the plane is above |
| two planes, z = 0 and z = b | (1/4π)·ln(D₊/D₋), D± = sinh²(πΔx/2b) + sin²(π(z ± z′)/2b) | D± written with sinh² and sin² (not cosh − cos) so that ln D₋ keeps full precision near the source |

The parallel-plate kernel replaces the image series (which converges slowly) and handles stripline, dual stripline and
anything between two planes; its gradient is (1/4π)(π/2b)·[(sinh 2a, sin 2c₊)/D₊ − (sinh 2a, sin 2c₋)/D₋] with
a = πΔx/2b, c± = π(z ± z′)/2b. **Planes as wide conductor panels were rejected:** their truncation adds a fake edge
with a singular charge, a large number of panels, and in the one-plane case a net-charge problem; the images are exact
and cost nothing.

### 2.3 Panel integrals

For a straight panel from A of length L, unit tangent t and normal n = (t_z, −t_x), and P with local coordinates
u = (P − A)·t, v = (P − A)·n, x_a = −u, x_b = L − u:

- I = ∫ ln|P − Q| dl = x_b·ln r_B − x_a·ln r_A − L + |v|·(atan(x_b/|v|) − atan(x_a/|v|)) (terms x·ln r with x = 0
  taken as 0; the atan term only for v ≠ 0); self term (P the midpoint) I = L·(ln(L/2) − 1);
- ∂I/∂u = ln r_A − ln r_B, ∂I/∂v = atan2(L·v, v² + u² − u·L) (the angle subtended; 0 on the panel's own line, so the
  self term's principal value is 0), ∇I = ∂I/∂u·t + ∂I/∂v·n.

Free kernel: P = −I/2π, ∇P = −∇I/2π; image: minus the same for the mirrored panel (A′ = (A_x, −A_z), t′ = (t_x, −t_z)).
Parallel plates: the closed form of the source and of its images in z = 0 and z = b (both with sign +), plus a
**2-point Gauss–Legendre** integral of the remainder R = kernel − (−ln r + ln r₀ + ln r_b)/2π, which is smooth in the
slab (its nearest singularity is at least b away).

**No far-field approximation.** A near/far split (2-point Gauss when the midpoints are more than η panel lengths
apart) was measured on the microstrip with mask at 364 panels: η = 10 and 6 change Z0 by 3 × 10⁻⁹ and 4 × 10⁻⁹,
η = 3 by 3.4 × 10⁻⁷, η = 2 by 1.1 × 10⁻⁶, and saved at most 20 % of the assembly (the LU dominates from 300 panels).
With η = 3 the finest levels of the coupled pair also drifted, which spoils the error estimate. M1.2 uses the closed
form on every pair; η = 6 is allowed later only if profiling asks and the harness shows no change above 10⁻⁷. M1.2b keeps
the exact integral but evaluates it, for panels whose midpoint is more than 8 lengths away, as the convergent series of
the closed form in ζ = τ·(L/2)/w (kernels.ts; truncated below 3 × 10⁻¹⁷ of the leading term, so not an approximation
at double precision): one logarithm for the potential and none for the field instead of two and an arctangent; C, C0
change by at most 6 × 10⁻¹⁴ (relative).

### 2.4 Infinite interfaces and planes: truncation

Interfaces that run to infinity (laminate/air, laminate/mask, mask/air, layer boundaries in stripline) and coplanar
grounds "to the edge" are **rays**: graded with s^q over d_near (the spike: 0.15 mm, 4 panels per level) from where
they leave the copper or the mask step, then geometric (ratio ρ = 1.6 at level 1, ρ^{1/M} at level M) to |x| = X. The
cost of X is logarithmic: one decade more is 5 panels per ray at level 1.

Measured (owner's microstrip with mask, level 4, change of Z0 against X = 2000 mm):

| X (mm) | 0.3 | 0.5 | 1 | 2 | 5 | 10 | 20 | 50 | 200 |
|---|---|---|---|---|---|---|---|---|---|
| X/h | 3 | 5 | 11 | 22 | 54 | 109 | 217 | 543 | 2174 |
| change | 1.6 × 10⁻³ | 2.5 × 10⁻⁴ | 2.6 × 10⁻⁵ | 2.4 × 10⁻⁶ | −3.8 × 10⁻⁷ | 5.7 × 10⁻⁷ | −3.5 × 10⁻⁷ | −2.5 × 10⁻⁷ | −1.2 × 10⁻⁷ |

From X ≈ 50·h on, the change is below 10⁻⁶ (the rest is the level's own noise). Between two planes the field decays
as e^{−πx/b}: X = 2b beyond the outermost copper is already at 10⁻⁸ (measured on the two-layer stripline: 2 × 10⁻⁵ at
X = b, ≤ 4 × 10⁻⁸ from 2b on). **Decision:** one plane or none: X = max(100·S, 20 mm), S the larger of the height of
the highest conductor over the plane (or its distance to the next conductor when there is none) and the width the
conductors span; two planes: X = x_outer + 4b. **No asymptotic correction** (the truncated tail is below 10⁻⁶ and
costs a few panels). The far end of a coplanar ground is closed by one panel of its thickness.

### 2.5 Panel grading and corners

Every straight edge (conductor side, interface piece between two corners, mask step) gets
m = M·max(2, ⌈len/h0⌉) panels with nodes at g(k/m), **g(s) = s^q/(s^q + (1 − s)^q), q = 2** (towards both ends);
rays use s^q from their start. Charge singularities at copper corners (r^{−1/3} at a right-angled corner, r^{−1/2} at
a zero-thickness edge) and at triple points of copper, laminate and mask are resolved by this grading; no singular
basis functions. Measured on Cohn's zero-thickness stripline C15 (the strongest singularity, 8·M panels):

| grading | order | error at 32 panels | at 128 panels |
|---|---|---|---|
| uniform (q = 1) | 1.00 | 0.60 % | 0.15 % |
| q = 2 | 2.16, 2.11, 2.08, 2.05 | 0.024 % | 0.0014 % |
| q = 3 | 2.80, 2.88, 2.99, 3.25 | 0.0050 % | 0.00007 % |

q = 3 is better on an isolated edge but **worse** with a mask: on the owner's microstrip with mask the values with
q = 3 move non-monotonically by 0.03 % up to 728 panels (50.514, 50.509, 50.515, 50.523, 50.525 Ω), while q = 2
settles at 182 panels. q = 2 it is. Base size: h0 = (smallest of trace width, gap, mask step, 4·copper thickness)/7
(the spike: h0 = 0.02 mm for w = 0.138 mm), at least 2 panels per edge, so the mask's 15 µm steps get 2·M panels.
**Triple points (M1.4a-fix):** where an interface ends on copper (copper, laminate and air or mask meet), the
charge density goes as r^(ν−1) with tan(νπ/2)·εr = −tan(νπ) for a right-angled corner on a slab (ν = 2/3 at εr 1, 0.535
at 8, → 1/2), and the interfaces' second-kind equation converges only at order ≈ q·ν under s^q grading: order 1 with
q = 2, from above or below depending on the mix, so the three levels looked `irregular` while C was up to 2.3 % low
at εr 10 (notes-M1.4a-fix.md). Both the interface and the copper faces meeting there are now graded with **q = 3** at
that end (h(t) = t³·(2 − t)), and a ray that starts on copper had 2 × the near panels.
**Per corner (M1.2c, BL79):** `cornerExponent` gives every vertex its ν from the sectors around it (copper, or εr):
through a sector of width α, (f, εr·f′/ν) is multiplied by [[cos να, sin να/εr], [−εr·sin να, cos να]]; between two
copper faces the product's upper right entry must vanish, at a corner of dielectrics alone its trace must be 2 (a
periodic f); the smallest root below 1 is ν. At a **triple point** (copper and two dielectrics) the interfaces
ending there are graded as h(t) = t^q·(1 + (q − 2)(1 − t)) with **q = 2/ν (at most 5)**: the second-kind equation's
error near a corner is the charge of the first panel, ∫₀^{h₁} r^(ν−1) dr ∝ h₁^ν = m^(−qν), so qν = 2 gives order 2.
The copper faces there get a **fixed q = 4** (2/ν for ν → ½, a right-angled corner at a high contrast; fixed so that
the conductor panels, C0 and L do not depend on the dielectrics) and **at least 4 panels** at level 1: refining edge
kinds one at a time showed the short side faces (1–2 panels at level 1/2) as the largest error left (#438: C 1.9 % →
0.30 % at M = 2). Rays starting there keep 2 × the near panels. Copper in one dielectric (first-kind equation: the
error of C is of second order in the charge's error, so q·ν ≥ 1 suffices) and corners of dielectrics alone keep q = 2:
grading the latter by 2/ν made C39 and the fuzz slightly worse. **Measured (notes-M1.2c.md): not order 2 everywhere.**
Over levels 1…8 the pair on εr 9.9 and #42 reach order 2.0, the strip on εr 8.1 1.2–1.5 (q = 2 on its copper gave
2, but the pair 1.0); masked structures keep an order ≈ 1.3 from the mask's short interfaces beside the copper corners,
which no grading up to 4/ν changed: a near-singular, not a corner, effect (BL84).

### 2.6 Accuracy reached and the error estimate

Levels: M doubles every panel count (all node sets nested). Exact cases (`npm run spike exact`), error of Z0:

| Case | Kernel | Panels | Errors | Measured order |
|---|---|---|---|---|
| C15 Cohn stripline w/b = 0.5 (zero thickness) | parallel plates | 8, 16, 32, 64, 128 | 0.46, 0.10, 0.024, 0.0056, 0.0014 % | 2.16, 2.11, 2.08, 2.05 |
| C11 wire over plane, a = 0.1, h = 0.5, εr 4.3 | image | 16, 32, 64, 128 | 0.69, 0.18, 0.044, 0.011 % | 1.98, 1.99, 1.99 |
| C04b coax a = 0.5, b = 2 half filled (εr 4.3 / 1), straight interfaces along field lines: Z0 = (η0/2π)·ln 4/√2.65 = 51.06028 Ω | free + neutrality | 79, 157, 313, 625 | 0.82, 0.21, 0.054, 0.013 % | 1.96, 1.98, 1.99 |

**The bar (0.1 % on two exact cases with a measured order) is met:** C15 at 32 panels, C11 at 64, C04b at 313, all
at order 2. (C11 and C04b are limited by the inscribed polygon of the circles, a second-order geometric error.)

Refined cases (`npm run spike refined`; no exact value):

| Case | Panels → Z0 (Ω) |
|---|---|
| **C39, owner's microstrip with JLCPCB mask:** w 0.1377, t 0.035, h 0.092 (εr 4.1), mask εr 3.8, 30.5 µm on laminate, 15.2 µm on copper and sides | 91 → 50.61615; 182 → 50.53173; 364 → 50.52404; 728 → 50.52509; 1456 → 50.52590 |
| same without mask (Hammerstad–Jensen 54.0558, facts-cases.md C39) | 48 → 53.98688; 96 → 54.07576; 192 → 54.13706; 384 → 54.15441; 768 → 54.15721 (orders 1.06, 1.99, 2.63; extrapolated 54.1578, H–J 0.19 % lower) |
| stripline, planes 0.3 apart, core εr 4.6 below z = 0.2, prepreg 4.1 above, trace 0.15 × 0.03 on the core | 50 → 33.85604; 100 → 33.79448; 200 → 33.78390; 400 → 33.78194; 800 → 33.78149 (orders 2.51, 2.36, 2.12) |
| coupled pair with mask and coplanar ground to the edge: w 0.1, gap 0.15, ground gap 0.3, as C39 | 222 → 99.06364; 442 → 98.80329; 882 → 98.79539; 1762 → 98.80836 (Zdiff) |

C39 with mask: Z0 = 50.526 Ω ± 0.001, εeff 3.2918, C 119.78 pF/m; the mask lowers Z0 by 3.63 Ω (6.7 %) from the
bare 54.158 Ω. Its error is 0.18 % at 91 panels and **0.011 % at 182 panels** (against 50.526), so level 2 of the base
mesh meets the 0.1 % bar with a margin of 9. Beyond 364 panels the mask and pair cases drift by 1–2 × 10⁻⁵ (mask,
order ≈ 0.4) and 1.3 × 10⁻⁴ (pair, not monotone): a slow component, not from the quadrature (unchanged with closed
form everywhere). Likely the thin mask film over long ray panels whose nodes are staggered against the copper's
(the mask ray starts 15 µm before the copper ray). **M1.2 aligns the nodes of the mask rays with the copper's** and
checks that the drift goes; it is 10× below the bar either way.

**Error estimate shown:** the solver runs level M (the result) and level M/2 and shows
**e = max(|Z(M) − Z(M/2)|, 10⁻⁵·Z)**, not divided by 2^p − 1. Measured: with |ΔZ|/3 (order 2 assumed) the ratio
estimate/true error was 0.97–1.15 on C15, C11 and C04b and 9 on C39 at 182 panels, so |ΔZ|/3 can be slightly low;
|ΔZ| is 3× safe on the exact cases and follows the irregular convergence of the mask and pair cases. The floor covers
the truncation (< 10⁻⁶) and the drift above. Every impedance, εeff and coupling coefficient gets its estimate the same
way (computed at both levels). The page shows Z(M), not the extrapolated value (the order is not reliable enough on
masked structures to extrapolate). Default level: **M = 2** of the §2.5 base mesh.
**Since M1.4a-fix** the estimate of levels M/4, M/2, M (differences a2, a1, r = d2/d1) is 1.5 × (a1; at least a2/4
when r > 4 (8 before M1.2c); a1/(r − 1) when 1.25 ≤ r < 2; a1 + a2 otherwise), and every line quantity gets at least the error that C's
and C0's diagonal estimates imply (lines.ts), because a derived quantity's levels can agree by chance. **M1.2c:**
the measured orders at levels 1/2, 1, 2 stay between 1 and 2 (median apparent order 1.5 on the fuzz, was 1.15), so the rule
cannot assume order 2 and keeps its form, with a quarter of the coarser difference from r > 4 (was 8: an apparent
order above 2 is pre-asymptotic); and the floor is `CFLOOR` = 0.25 × (ρ + ρ0) for impedances and delays, 0.5 × for
εeff (was ½ and 1), since ρ and ρ0 are themselves bounds of about 3.5 × the true error. Fuzz: estimate / true error of
C's diagonal ≥ 1.21, median 3.5; all quantities ≥ 1.05, median 3.9 (before 4.9). C39 now shows 50.5216 ± 0.100 Ω
(FD 50.527 ± 0.010).

### 2.7 Layered-media Green's function: not needed

The plain formulation meets 0.1 % on the owner's microstrip with mask at 182 panels and 6.5 ms (§6). A layered-media
kernel (Sommerfeld-type integrals or complex images) would remove the interface panels but costs a numerical integral
per entry and its own error control. Not used in phase 1.

## 3. Modes (M1.3)

Input C and L = μ0ε0·C0⁻¹ (n ≤ 6 in practice). **Cholesky instead of C^{1/2}** (facts.md §4 allows either; this one
needs one eigenproblem instead of two and is deterministic):

1. C = RᵀR (R upper triangular; C is symmetric positive definite, symmetrize (C + Cᵀ)/2 first; the BEM's C is
   symmetric to the solver's error, report the asymmetry ‖C − Cᵀ‖/‖C‖ as a check).
2. W′ = R·L·Rᵀ, symmetrized. W′ is similar to L·C, so its eigenvalues are λ_m = 1/v_m².
3. **Cyclic Jacobi** on W′ until every off-diagonal element is below 10⁻¹⁵·‖W′‖_F (typically 4–6 sweeps for n ≤ 6).
   Jacobi gives eigenvectors orthogonal to working precision even for close eigenvalues, which tridiagonal QR also
   does but with more code; for n ≤ 6 the cost is microseconds.
4. U orthogonal, Λ = diag(λ_m) sorted ascending (fastest mode first). v_m = 1/√λ_m, εeff,m = c0²·λ_m,
   **Tv = R⁻¹U, Ti = RᵀU** (then L·C·Tv = Tv·Λ, C·L·Ti = Ti·Λ, Tvᵀ·Ti = 1),
   **Zc = R⁻¹·U·Λ^{1/2}·Uᵀ·R⁻ᵀ = Σ_m Tv,m·Tv,mᵀ/v_m**, Yc = Zc⁻¹ = Rᵀ·U·Λ^{−1/2}·Uᵀ·R. Check (harness): Zc·C·Zc = L
   to 10⁻¹², and in a homogeneous medium Zc = C⁻¹/v.
5. Every impedance (Z0, Zdiff and Zcm by definition A, Zdc), every coupling coefficient comes from Zc (notes-M0.2a
   decision); the mode vectors are only for display (mode shapes, modal fields, modal impedances in details).

**Degenerate clusters (display only).** Eigenvalues with |λ_i − λ_j| ≤ 10⁻⁹·λ_max form a cluster. That tolerance is
roundoff level: in a homogeneous medium the dielectric problem has no interface panels, so C = εr·C0 to roundoff and
the cluster is exact. Inside a cluster with eigenvectors P (columns of U), rotate by Q = the eigenvectors of Pᵀ·C⁻¹·P
(since R⁻ᵀR⁻¹ = C⁻¹, the voltage vectors Tv,cluster = R⁻¹·P·Q are then orthogonal both in C and in the plain
conductor metric); for a symmetric pair this gives the even and odd modes. If Pᵀ·C⁻¹·P is itself degenerate, order by conductor number (the
mode with its largest |Tv| on the lowest-numbered conductor first) and fix signs so that entry is positive.
**Near-degenerate** (relative gap above 10⁻⁹ but below the error estimate of εeff): the modes are computed as they
are, and the result carries the flag "mode velocities not resolved by the solver"; impedances are unaffected (Zc).

## 4. Axisymmetric solver (M1.6)

**Geometry** in (r, z): generating lines of the bodies of revolution, all straight: the barrel (r = a), pads and
plane annuli (thin rings of copper thickness, or zero-thickness sheets with total charge when t ≪ the gaps; M1.6
measures which), antipad edges, the dielectric layer boundaries (horizontal interface annuli from the barrel or pad to
R_w), the mask, and the **grounded coaxial wall** at r = R_w between every pair of planes, joining them.

**Kernel:** a ring of total charge q at (r′, z′) gives at (r, z)
φ = q·K(k) / (2π²ε0·R₊), R₊² = (r + r′)² + Δz², k² = 4rr′/R₊², k′² = R₋²/R₊², R₋² = (r − r′)² + Δz².
A panel with density σ: φ = (1/πε0)·∫ σ·r′·K(k)/R₊ dl′. Field (for interface rows):
∂/∂z [K/R₊] = −Δz·E(k)/(R₊·R₋²), ∂/∂r [K/R₊] = [((r′² − r² + Δz²)/R₋²)·E(k) − K(k)] / (2r·R₊) (standard ring-charge
field; M1.6 checks both against central differences of φ to 10⁻⁷ before use). K and E by the AGM of facts.md §8 with
k′ = R₋/R₊ formed directly (never √(1 − k²)): **29 ns per (K, E) pair** measured, with the iteration bounded (an
unbounded loop hung on one-ulp oscillation of a and g; the spike's `ellipKE` stops at |c| ≤ 4 × 10⁻¹⁶·a or 40 steps).

**Singularity:** as R₋ → 0, r′K/R₊ = −½·ln R₋ + bounded. On the self panel and its two neighbours: subtract
−½·∫ ln R₋ dl′ in closed form (the 2D `I` of §2.3, the same code) and integrate the bounded remainder
r′K/R₊ + ½·ln R₋ by **8-point Gauss–Legendre**; the gradient's singular part is the 2D one (−∇I/2π scaled the same
way, closed form), the rest by the same Gauss rule. Other panels: 4-point Gauss within 4 panel lengths, 2-point
beyond (M1.6 measures against 8 points everywhere; no closed form exists for the ring kernel). Grading as §2.5;
interfaces and planes graded towards the antipad edge and the pad edge, geometric towards R_w.

**Truncation:** without a return the field between two planes falls only as 1/r, so the domain is closed by the
grounded wall at R_w = r_antipad + 4·(largest dielectric thickness between the planes the via crosses) (the
parallel-plate fringe from an antipad edge decays as e^{−πd/h}: 4h gives < 10⁻⁵). Above the top and below the bottom
plane the free-space ring kernel needs no lid (it decays as 1/R; the outer pads' field ends mostly on the plane).
M1.6 checks R_w by doubling it.

**Output:** the free charge of the signal (via) conductor per z window, the windows cut at the middle of each
dielectric layer. Excess capacitance of a crossing k (pad, antipad, non-functional pad):
**ΔC_k = Q_window,k − C′_line·Δz_window,k**, with C′_line = 2πε0εr/ln(R_w/a) of the same wall in each layer (the
artificial wall cancels in the difference once R_w is large enough). The sum of ΔC_k is exact to the solver's
error; placing each at its plane is an error of at most half a layer thickness in position, electrically negligible
below the frequency at which a layer is λ/20. Also returned: the panel charges for the side view's field.

**Cost estimate (not measured in M0.3):** about 400 panels for a 6-layer via (barrel graded at 6 crossings,
6 plane annuli, pads, about 8 interface annuli): assembly ≈ 160 k pairs × 4 Gauss points × ≈ 45 ns ≈ 30 ms, LU(400)
≈ 20 ms (§6), so **≈ 50 ms**. Over the via model's 30 ms: M1.6 caches the axisymmetric result by the hash of
(drill, plating, pads, antipads, stackup) so that changes of return vias, feed traces, rise time or frequency stay
within 30 ms; dragging a pad, antipad or drill gives a new result every 3–4 frames (level M/2 first, about 8 ms, then
M). Flagged in notes-M0.3.md.

## 5. Via model (M1.7)

### 5.1 Barrel segments through several dielectrics: cascade, not average

The barrel line runs along z; the dielectric layer boundaries are planes z = const, i.e. **perpendicular to the
direction of propagation**, not part of the line's cross-section. The barrel's quasi-TEM field between two planes is
radial (in the (x, y) cut), tangential to every layer boundary, so E_tan and H_tan are continuous there with no bound
charge: a segment crossing layers of εr,1, εr,2, … is exactly a cascade of homogeneous lines, each with Z = Z_vac/√εr,i
and v = c0/√εr,i, the same 2D cut solved once in vacuum. **Decision: one sub-segment per dielectric layer**, no
averaged εr. Error of the line part: none beyond the line model itself (the cut and the quasi-static assumption);
averaging would instead get the delay right only with √(mean εr) weighting and the impedance steps never. Cost: one
2 × 2 (or 4 × 4) ABCD per layer per frequency, negligible. The 2D cut (barrel or barrels and return vias as circles,
free kernel with neutrality, conductor panels only) is solved once in vacuum per via geometry; C = εr·C0 per layer.

### 5.2 Pads and antipads; pair pads

Each crossing's ΔC_k (§4) is a shunt capacitor at that plane's z, split equally between the two sub-segments' ends
(their join). A non-functional pad at a signal layer is its own crossing. **Pairs:** each via gets its own ΔC_k from
its axisymmetric solve (the other via absent). The mutual excess is estimated as **ΔC12 = ΔC·(−C12/C11)** with C11,
C12 of the barrel pair's 2D cut, i.e. the pad's excess field shared like the barrels' field. It carries the flag
"pad coupling estimated, not solved" until M6.4 compares it with the full-wave or openEMS result; if that shows more
than 20 % of ΔC12 off, M6.4 records a correction or a 3D static solve for phase 2.

## 6. Budgets (engine.md §10): measured

Dense LU with partial pivoting, row-major Float64Array, plain JavaScript (`npm run spike lu`):

| n | 100 | 200 | 300 | 500 | 1000 | 2000 |
|---|---|---|---|---|---|---|
| ms | 0.3 | 2.6 | 7.7 | 38.0 | 348 | 3573 |
| GFlop/s | 2.3 | 2.0 | 2.4 | 2.2 | 1.9 | 1.5 |

Solve time against panels (one dielectric solve, median of 7):

| Case | Panels | Assembly (ms) | LU (ms) | Total (ms) |
|---|---|---|---|---|
| microstrip + mask | 91 / 182 / 364 / 728 | 0.8 / 3.0 / 12.3 / 48 | 0.2 / 1.8 / 13.3 / 124 | 1.0 / 4.9 / 25.8 / 173 |
| pair + mask + coplanar ground | 222 / 442 / 882 / 1762 | 5.6 / 17.9 / 69 / 291 | 3.6 / 26 / 237 / 2383 | 9.3 / 44 / 308 / 2681 |

**Full solve with the error estimate** (dielectric and vacuum at M and M/2): microstrip with mask at M = 2 (182
panels, error 0.011 %): **6.5 ms**, budget 20 ms: **met** (4× throttle ≈ 26 ms against 80 ms). Coupled pair with mask
and coplanar ground at M = 2 (442 panels, the first level under 0.1 %): **57 ms** (44 ms without the estimate),
budget 40 ms: **not met** (4× ≈ 230 ms against 150 ms). What follows for the pair: inverse width-and-gap
(≈ 20 solves) ≈ 0.9 s against 0.3 s; sweep of 100 points ≈ 5.7 s against 2 s; Monte Carlo of 1000 ≈ 44–57 s against
20 s. Single traces meet all of them (inverse ≈ 65 ms, sweep 0.65 s, Monte Carlo 6.5 s).

Measures for M1.2, expected to close most of the gap (not done here; the budget is the owner's): (1) **mirror
symmetry**: a symmetric structure (most pairs, single traces with symmetric grounds) solved as its even and odd halves
with a mirrored kernel: LU 4× and assembly 2× cheaper, the pair ≈ 20 ms with the estimate; (2) the base mesh tuned per
edge (the pair's 442 panels include long coplanar ground rays that carry little charge); (3) while dragging, level M
only and the estimate after release; Monte Carlo at level M without estimates. Asymmetric pairs and three conductors
stay near 45–60 ms; a blocked LU or a WebAssembly kernel would gain at most 2× (D5 leaves WebAssembly to phase 2).

**Measured after M1.2b** ([notes-M1.2b.md](notes-M1.2b.md); `npm run check` prints this table with each budget's pass or
fail; Node, Ryzen 9 7950X, median of 7 after warm-up; the panel counts of M1.2a's base mesh, results unchanged to
6 × 10⁻¹⁴). Blocked LU 8.5 GFlop/s (was 2.5), assembly 1.8× faster (far panels by series, no boxed doubles), and
mirror-symmetric sections solved as even and odd halves:

| Case (M = 2) | Panels | With estimate (budget) | Single level (≤ 15 ms for M1.3) |
|---|---|---|---|
| microstrip + mask (default setup), halves | 192 | **1.1 ms** (20: met) | 0.8 ms |
| pair + mask + coplanar ground, halves | 620 | **15.6 ms** (40: met) | **12.3 ms** |
| the same pair solved whole (as an asymmetric pair would be) | 620 | 39.8 ms | 36 ms |

What follows for a symmetric pair at level M alone: Monte Carlo of 1000 ≈ 12 s (20), sweep of 100 ≈ 1.2 s (2),
inverse of 10–20 solves ≈ 0.12–0.25 s (0.3): **met**. An asymmetric pair (or three conductors) still takes ≈ 36 ms
a solve: Monte Carlo ≈ 36 s, sweep ≈ 3.6 s, inverse ≈ 0.4–0.7 s, **over** those three budgets (the owner's call: a
coarser base mesh per edge, M = 1, or a worker per core).
