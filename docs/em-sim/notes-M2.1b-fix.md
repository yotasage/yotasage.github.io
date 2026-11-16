# Notes of step M2.1b-fix – the status on ordinary structures (2026-11-16)

## The cause

C39 on the 3313A preset (Z0 51.4976 ± 0.047 Ω) and C41 (Zdiff 103.364 ± 0.15 Ω) showed `irregular`. Their C11
**turns back** over levels ½, 1, 2 (C39: 1.17658, 1.17691, 1.17633 × 10⁻¹⁰ F/m; r = −0.56): C = (C/C0)·C0, with C0
converging upwards at order ≈ 3 (r 7.4) and C/C0 downwards at order ≈ 1.4–1.9 (r 3.8, then 2.6, 2.5, 2.7, 3.0 to level
32). The sum of two regular errors of opposite sign is not monotone. Z0's own levels (51.625, 51.501, 51.498) looked
too fast (r 42) while levels 4, 8 go on to 51.504, 51.508: the C floor covered that, the status did not know it.

## The rule (bem2d.ts)

- `estimateOf`: `regular` for the same sign and r = 1.74…16 (order 0.8…4; was 2…16): corners with ν ≈ ½ converge at
  q·ν ≈ 1, and C/C0 of masked structures at 0.9–1.5 (#3: r 1.94).
- An entry of C whose own levels are irregular takes the worse status of its factors C0 and C/C0 (`factorStatus`).
- A derived quantity (lines.ts, `single`) whose own levels are irregular takes the status of C and C0
  (`derivedStatus`); its estimate keeps the floor from C and C0.
- **The estimates are unchanged**, so the fuzz coverage is unchanged by construction.

## Fuzz (`fd/bench.mts`, M = 2, 500 structures, 3678 quantities)

| | before | after |
|---|---|---|
| structures regular / irregular | 153 / 347 | **362 / 138** |
| quantities converged / regular / irregular | 98 / 1970 / 1119 | 98 / **2439 / 650** |
| C's diagonal regular / irregular | 447 / 294 (own levels) | 617 / 124 |
| estimate / true, regular quantities: min, median | 1.32, 3.79 (1106) | **1.23**, 3.76 (1468) |
| estimate / true, irregular: min, median | 1.05, 4.07 | 1.05, 4.35 |
| C's diagonal estimate / true: min, median | 1.21, 3.50 | 1.21, 3.50 |

0 of 3678 outside the combined estimates before and after. The 138 left are sign changes of C/C0 or of an
off-diagonal entry, growing differences, or r < 1.74: their levels do not show convergence.

## Cases (M = 2; values and estimates unchanged)

| Case | before | after |
|---|---|---|
| C39 on the preset, Z0 (Ω) | 51.4976 ± 0.047, irregular | **regular** |
| C41 0.11/0.2, Zdiff (Ω) | 103.364 ± 0.150, irregular | **regular** |
| default pair, Zdiff (Ω) | 78.216 ± 0.085, irregular | **regular** |
| pair with coplanar ground 0.1/0.15/0.3, Zdiff (Ω) | 102.12 ± 0.65, irregular | **regular** |

## Also

engine.md §8 states the page's digits: the error with one significant digit, two when it starts with 1 or 2.
`npm run check` passes with no expected status changed. The bench prints the status counts and estimate / true by
status; `WHY=1` lists the entries that make a structure irregular.
