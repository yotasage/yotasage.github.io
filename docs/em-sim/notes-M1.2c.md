# Notes of step M1.2c – per-corner grading (2026-11-16)

## The rule (panels.ts, solver.md §2.5)

`cornerExponent` gives every vertex the exponent ν of its strongest wedge, from the sectors around it (copper or εr):
transfer matrices [[cos να, sin να/εr], [−εr·sin να, cos να]] per sector, upper right entry 0 between copper faces,
trace 2 at a corner of dielectrics alone (checked: 2/3, 0.53544 at the slab corner of εr 8, 1, and 2/3 for εr → ∞).

- **Triple points** (copper and two dielectrics): interfaces q = 2/ν (≤ 5; second kind, order q·ν), copper faces a
  fixed q = 4 (ν-dependent q made L depend on the laminate's εr: check "C39 L" failed by 2.3 × 10⁻⁴) and at least 4
  panels at level 1, rays 2 × the near panels.
- Copper in one dielectric and corners of dielectrics alone keep q = 2 (2/ν there: C39 50.501 ± 0.094 irregular, and
  the fuzz slightly worse).
- The largest error left was not a grading but a count: **copper side faces at triple points with 2 panels at level
  1** (1 at level 1/2). Refining edge kinds one at a time (#438): sides alone moved C by 1.2 %; with n ≥ 4, #438 went
  from 1.9 % to 0.30 % at M = 2 and #172 (cpw on εr 8.7) from 2.3 % to 1.4 %.

## Orders (C11 over levels ½…8, from self-differences)

| Case | before (q = 3 at triple points) | after |
|---|---|---|
| strip 0.076 × 0.048 on εr 8.1 (= #192) | 2.07, 1.61, 1.33 | 1.94, 1.46, 1.21 |
| the same etched | 2.80, 2.48, 1.39 | 2.83, 1.92, 0.67 (differences ≤ 2 × 10⁻⁴) |
| pair 0.26/0.1 on εr 9.9 | 0.55, 1.23, 1.50 | 1.19, 1.38, **2.00** |
| #42 | 0.35, 1.20, 1.50 | 1.12, 1.35, **2.04** |

**Order 2 is not reached everywhere.** Copper q = 2 at triple points gives the strip order 1.76, 1.76, 2.25 but the
pair 0.8–1.1; q = 4 is the better compromise on the fuzz. Masked structures (#118, #412, #425) stay at order ≈ 1.3
to level 8: the mask's short interfaces (15–40 µm) beside the copper corners, unchanged by any interface grading up to
4/ν, so a near-singular effect of the copper corner, not a corner exponent: **BL84**. Fuzz median apparent order at
levels ½, 1, 2: 1.15 → 1.53.

## Estimate (bem2d.ts `estimateOf`, lines.ts `CFLOOR`)

1.5 × the last difference as before, with a quarter of the coarser from r > 4 (was 8; #33's C11 was outside with r
7.8); the floor from C's and C0's estimates 0.25 × (ρ + ρ0) for impedances and delays, 0.5 × for εeff (was ½, 1).
Estimate / true error on the fuzz where the true error exceeds 3 × the FD's (`fd/bench.mts` prints it):

| | before | after |
|---|---|---|
| C's diagonal: min, p10, median, p90 | 0.98, 2.13, 3.48, 8.44 | **1.21**, 2.28, **3.50**, 8.23 |
| all quantities: min, median, p90 | 1.40, 4.91, 18.5 | 1.05, **3.90**, 14.0 |
| \|C error\| median, p90, max | 7.6 × 10⁻⁴, 5.9 × 10⁻³, 2.4 × 10⁻² | 3.8 × 10⁻⁴, 2.0 × 10⁻³, 1.4 × 10⁻² |

Bench at M = 2: **0 of 3678 quantities outside** the combined estimates (max ratio 0.88), C's diagonal max 0.98.

## Cases (M = 2)

| Case | FD | before | after |
|---|---|---|---|
| #42 Zc11 (Ω) | 51.6609 ± 0.0042 | 51.5818 ± 0.69 | 51.6050 ± 0.16 |
| #192 Z0 (Ω) | 47.7095 ± 0.0026 | 47.7448 ± 0.107 | 47.7470 ± 0.11 |
| C39 Z0 (Ω) | 50.5265 ± 0.0099 | 50.5193 ± 0.076 | 50.5216 ± 0.100 |

C39's levels: 110 → 50.54705, 220 → 50.52158, 438 → 50.52240, 876 → 50.52471 panels (Ω).

## Budgets (all pass)

Pair with mask and coplanar ground 16.7 ms (40), single level 13.0 ms (15; 636 panels, was 620); microstrip 1.4 ms;
M1.3: inverse 60 ms, asymmetric pair sweep 0.89 s, Monte Carlo 8.6 s.

## Checks

check-bem "Triple points": the four corner exponents, and per structure the estimate / true error of C11 within 1…5
and the order over levels 1…8 at least 1.2 (a guard against the order ≈ 1 of M1.4a); check-modes uses `CFLOOR`.
