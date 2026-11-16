# Notes of step M1.4a-fix – the BEM at triple points (2026-11-16)

## The cause, and the proof

M1.4a's fuzz had 159 quantities in 58 structures outside the combined estimates, C with dielectrics low by up to
2.3 %. **The BEM was right in formulation and under-resolved at triple points** (copper, laminate and air or mask
meeting), with an estimate that did not see it.

- **It converges to the FD.** #192 (microstrip, εr 8.09, t 0.048 on h 0.079), C11 in 10⁻¹⁰ F/m, FD 1.51391: old mesh
  M = 0.5…16: 1.4460, 1.4784, 1.4954, 1.5046, 1.5093, 1.5117 (order 1); with 4 × the near-ray panels M = 4…32:
  1.513846, 1.513850, 1.513872, 1.513888. #42 (FD 1.724230) reaches 1.724192 at M = 16; #412, #425, #260, #118 too.
- **Which panels:** refining one kind at M = 2 (#192): near-ray panels × 2/4/8 raise C by 8.6/3.8/1.4 × 10⁻³ (order
  1.2–1.4), the geometric ray part changes it by 2 × 10⁻⁵, copper faces lower it at order 1.5–1.9. On #42 the gap
  interface raises and the copper lowers C by similar amounts, so the three levels **cancel and turn back**
  (1.72465, 1.72328, 1.72233, then up to 1.7238 at M = 16): `irregular` with an estimate of 8 × 10⁻⁴ against a true
  1.1 × 10⁻³ (Z0 estimate 1.5 × 10⁻³ Ω against 0.042 Ω).
- **Why order 1:** at a right-angled copper corner on a slab, tan(νπ/2)·εr = −tan(νπ) gives ν = 2/3 (εr 1), 0.535
  (εr 8) → ½; the density goes as r^(ν−1). The interface equation is of the second kind (no smoothing), so s^q grading
  gives order ≈ q·ν: 1.07 with q = 2. Measured on #192's near ray: q = 2, 3, 4 give orders 1.0, 1.2→1.4, 1.45→1.7→2.
- **Not the cause:** the kernels or the interface equation (both converge to the FD), the geometric ray part
  (ρ^(1/8): 3 × 10⁻⁶), the mask (the worst cases have none), the FD.

## The fix (lib/emsim)

- `panels.ts`: interfaces that end on copper, and the copper faces meeting them there, are graded with q = 3 at that
  end, as h(t) = t³(2 − t) (same slope as s² where it meets the rest; other ends keep their old nodes bit for bit);
  rays starting on copper get 2 × the near panels (`MESH_DEFAULTS.qTriple`, `nearTriple`). q = 4: better on #42,
  worse on the fuzz.
- `bem2d.ts` `estimateOf`: 1.5 × (a1; at least a2/4 when r > 8; a1/(r − 1) when 1.25 ≤ r < 2; a1 + a2 otherwise).
  Chosen on the 741 diagonal entries of C in the fuzz (worst ratio 0.98; the old rule had 17 outside, worst 2.4).
- `lines.ts`: every impedance, εeff and delay at least the error implied by the relative estimates of C's and C0's
  diagonal (½ or 1 × their sum): #260's mode εeff agreed over three levels by chance (e 2.7 × 10⁻⁵, true 7 × 10⁻⁴).

## Before and after (M = 2)

| Case | FD | Before | After |
|---|---|---|---|
| #42 Zc11 (Ω) | 51.6609 ± 0.0042 | 51.7031 ± 0.0015, irregular (ratio 7.4) | 51.5818 ± 0.69, irregular (ratio 0.11) |
| #192 Z0 (Ω) | 47.7095 ± 0.0026 | 48.0051 ± 0.29 (C 1.2 % low) | 47.7448 ± 0.107, regular (C 0.14 % low) |
| C39 Z0 (Ω) | 50.5265 ± 0.0099 | 50.5294 ± 0.065 | 50.5193 ± 0.076 |
| default microstrip Z0 (Ω) | 51.5123 ± 0.0088 | 51.5048 ± 0.049 | 51.4934 ± 0.099 |

The estimates are now honest and looser (median ratio to the FD difference 0.15, before 0.40). **openEMS's 49.79 Ω for
C39 is 0.74 Ω (1.5 %) below both independent 2D solvers**, which agree to 1.4 × 10⁻⁴: the difference is openEMS's
(mesh or setup), not the BEM's. Wide pairs on εr ≈ 10 are now less accurate at M = 2 (the regression pair: C11 3.4 ×
10⁻³ high, estimate 1.7 × 10⁻²) where the old mesh was 4 × 10⁻⁴ by cancellation: the price of a regular sequence.

## Fuzz and budgets

`npm run check:fd` (seed 20261116, 885 s): **0 of 3678 quantities over the bar** (before 159 in 58 structures); median
ratio 0.15 (0.40), max 0.66 (7.44); every kind's max ≤ 0.66. The differences themselves hardly moved (median rel 4.8 ×
10⁻⁴, max 2.3 × 10⁻²; median ΔC 9.0 × 10⁻⁴ above contrast 3): the estimates now cover them.

Budgets (all pass): pair with mask and coplanar ground 15.8 ms (40), single level 12.2 ms (15; still 620 panels: its
rays start at the mask); microstrip 1.3 ms; M1.3: inverse 60 ms, asymmetric pair sweep 0.94 s, Monte Carlo 8.0 s.

## Checks

- check-bem "Triple points": strip, etched strip and wide pair on εr 8.1–9.9 within the BEM's estimate of the FD's C.
- check-fd: `KNOWN_OUTLIERS` removed. check-modes: modal impedances = Zodd/Zeven to 10⁻¹¹ (was 10⁻¹²: rounding moved
  with the mesh); the single-line Z0 estimate includes the C floor.
- `fd/cache.mts`, `fd/bench.mts`: the FD side saved once, then the BEM on the whole fuzz in 20 s.

## Open

BL79 (per-corner grading from the wedge exponent, Zhechev2026) would give order 2 everywhere and tighter estimates;
level M = 2 meets 0.1 % on C39 but only ≈ 0.2–0.4 % on thick copper on εr ≈ 8–10.
