# Notes from M1.3 – Modes, target, sweeps, tolerance (2026-11-16)

## What was done

`lib/emsim/`: `modes.ts`, `lines.ts`, `inverse.ts`, `vary.ts` ([modules.md](modules.md)). Harness groups "Modes and
impedances" (`check-modes.mjs`, 1489 checks, 0.2 s) and "Target, sweeps, tolerance" (`check-vary.mjs`, 90 checks,
20 s, most of it the Monte Carlo budget runs) in `npm run check`.

## Results API (for M1.5 and M2)

- `solveSetup(setup, { M, estimate, mirror })` → `LineResults`; `linesOf(bem)` for a `BemResult` already solved. Never
  throws: a setup with an error issue (`stackupIssues`, `structureIssues`) or a failed solve gives `ok: false, reason`.
- Every number is a `Q` (`v`, `e`, `status`). Per line `z0` = Zc_kk (√(L/C) for one line), `eeff` = C_kk/C0_kk, `delay`
  (s/m). `modes[m]`: `eeff`, `delay`, `v`, `Tv`, `Ti`, `z` (definition C), `ratio`, `label` (odd/even, π/c), fastest
  first. `pair`: `zdiff`, `zcm` (A, the default), `zdc`, `zdiffB`, `zcmB`, `ztdr`, `zodd` = Zdd/2, `zeven` = 2·Zcc,
  `kb`, `kf` (s/m; kb and kf take √(C11·C22), √(L11·L22) for an asymmetric pair, facts.md §6 has the symmetric form).
- `flags`: `modes-unresolved` (εeff gap below the summed estimates), `single-level`, `irregular`. `bem` keeps the levels
  with meshes and charges for the fields (notes-M1.2b.md).
- `valuesOf(r)` / `levelValues(C, C0, L, n)` give the same numbers as flat keys (`z0`, `zdiff`, `mode1.eeff`, `zc12` …);
  sweeps, corners and Monte Carlo use those keys.

## Error propagation

Each quantity is computed from every level the solver returned (M/4, M/2, M) and given `estimateOf` of those three
values, exactly as the solver's own Z0, and at least the level's removed asymmetry times the value. Quantities zero by
symmetry (Zdc of a symmetric pair, kf in one dielectric) are `converged` when all levels are below 10⁻¹⁰ of their scale,
so rounding noise does not mark a result irregular. On Cohn's pairs the estimate is 3.4–3.5 × the true error at M = 2.

## Checks (all pass)

- Modes on 600 random matrices: Zc·C·Zc = L 3.3 × 10⁻¹⁵, Tvᵀ·Ti = 1, Zc·Yc = 1, homogeneous Zc = C⁻¹/v; ≤ 5 Jacobi sweeps.
- Cohn coupled stripline through Zc: worst **0.014 %** at M = 8 (C19 Zodd), Zdiff and Zcm likewise; the cluster rule
  gives odd then even; kf = 0; C20's k. **C25** (touching strips) now runs: Zeven 0.0036 %, Zodd 41 → 25 Ω falling
  (BL80 updated). Three strips in one εr: a cluster of three, Zc = C⁻¹/v.
- Symmetric pairs (C41, coplanar pair, stripline pair): Zdiff = 2·√((L11 − L12)/(C11 − C12)) and Zcm = Zeven/2 to 10⁻¹²;
  A = B = Z_TDR; Zdc = 0.
- Asymmetric pair (facts.md §5's example 0.11/0.2/0.2, εr 4.3, no mask): **A 94.69, Z_TDR 93.54, B 92.51 Ω**, Zdc
  7.76 Ω (facts.md's finite-difference estimate: A 94.1, B 92.0, TDR ≈ 93). B = Zdd − Zdc²/Zcc to 10⁻¹¹; Tripathi's
  Z1/Z2 the same in both modes and = −1/(Rc·Rπ).
- Inverse: 8 cases and C39 at 21 targets round-trip within **5.9 × 10⁻⁸** (bar 10⁻⁶); no mesh step got in the way.
  Out of reach names the range and the cause ("narrower than twice the etch offset").
- C41 with the harness tolerances (±10 %, εr ±0.2, mask ±30 %): Zdiff **103.38 ± 0.04 Ω**, Monte Carlo 1000 sd
  2.18 Ω (the sensitivities predict 2.18), 95 % 99.3 … 107.8 Ω; ranking w −4.2, D1 thickness +4.2, D1 εr −1.8, gap
  +1.5 Ω per tolerance. C39: D1 thickness +2.9, w −2.4 Ω.

## Speed decisions and their accuracy cost

- **Fast path:** a sample is the coarse level M/2 alone, corrected by the fine nominal: fine(x0) + coarse(x) −
  coarse(x0). The nominal's estimate solve already contains coarse(x0). Cost against fine solves at every ±limit point:
  **0.16 % (C39), 0.06 % (C41), 0.09 % (asymmetric pair) of the corner spread**, worst 0.026 Ω.
- **Sweeps:** three fine anchors (first, middle, last) and the correction fine − coarse interpolated in the swept value;
  each point's error = interpolated anchor estimate + the correction's curvature. Fast points are within 0.3–26 % of
  their stated error of fine solves.
- **Inverse:** coarse bracket and Brent (7–17 coarse solves), then 2–3 fine solves (Newton with the coarse slope,
  secant) and the final solve with its estimate.
- Not done: reusing the vacuum solve when only εr changes (the vacuum LU is 3 % of a solve), a linear model for
  Monte Carlo (not needed).

| Budget (Node, Ryzen 9 7950X) | microstrip C39 | pair + ground, halves | asymmetric pair + ground |
|---|---|---|---|
| inverse ≤ 0.3 s | 5 ms | 65 ms | 148 ms (the pair solved whole) |
| sweep of 100 ≤ 2 s | 40 ms | 325 ms | 951 ms |
| Monte Carlo 1000 ≤ 20 s | 0.28 s | 3.5 s | 7.8 s |

All met with room for the 4× phone throttle on the inverse and the sweep (Monte Carlo at 4×: about 31 s for the
asymmetric pair; the budget is set for the laptop).

## Open questions

- **Tolerances of the presets** (BL81): none has a source, so the band needs the visitor's numbers; M2.3 decides the
  default (the harness's ±10 % is not a fact).
- Monte Carlo draws normal with σ = limit/3, redrawn beyond the limit; `uniform` is the conservative option. The page
  should say which. Same seed → bit-identical in one JavaScript engine (Math.log may differ in the last bit elsewhere).
- Z0 per line in a pair is Zc_kk (the other line carrying no current), not the isolated trace's Z0 that calculators give
  for one trace of a pair; the details view should name it.
- Pair quantities for n > 2 (BL82) and two-target or general-arrangement inverses (BL83) are left.
- The default C39 setup and the coplanar pair still come out `irregular` at M = 2 (the solver's drift, BL79).
