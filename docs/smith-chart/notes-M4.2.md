# Smith chart – notes of step M4.2 (solver validation)

Part of [plan.md](plan.md); the method is [solver.md](solver.md) "Validation (M4.2)", the solver
[notes-M4.1a.md](notes-M4.1a.md) and [notes-M4.1b.md](notes-M4.1b.md). Nothing on the site yet. Checks:
`cd scripts/harness/smith && npm run check` (the groups `validate …` are in `check-validate.mjs`, called last from
`check.mjs`; about 13 s of the 52 s).

## What is checked

`check-validate.mjs` uses nothing of the solver's but `solve` itself and the part-kind numbers of `parts.ts`:

- **Evaluation**: plain impedance arithmetic in ohms, Z = N/D kept as a pair (series adds Z·D to N, shunt adds Y·N to D,
  a line by cos/sin, stubs scaled by cos or sin), so opens, shorts, values of 0 or ∞ and stubs of a multiple of λ/4
  need no special case; Γ = (N − Z0·D)/(N + Z0·D).
- **Goals in Γ**: a point's |Γ − Γt|; |Γ| = m for |Γ|, VSWR and return loss; the textbook circles of r, g, x, b
  (centre and radius), signed distance; a point target's mismatch |Γ − Γt|/|1 − Γt*Γ|.
- **Coordinates**: atan of r, x, g, b or (Zt/Z0)², atan(Zc/Z0), a length in λ, ln(f/f0); x and b over (−π/2, π/2]
  with L and C both covered (so swapped answers are found too), lengths over [0, λ/2).
- **Brute force**: two unknowns with a point target: a grid (240 × 240; f0 problems 160 × 1600; other fallback
  320 × 320) and Newton (central differences, damped) from every local minimum of |Γ − Γt| below 0.3, kept below
  1e-11. One unknown: 20,000 cells (f0: 100,000), sign changes bisected to 1e-16, and touching zeros by golden
  section at local minima of |s|, kept below 1e-10. Families: 120 values of the first unknown (skipping 1e-4 about a
  range edge), each with the one-unknown scan of 1,500 cells for the second, compared with `family.at`. Best value:
  20,000 cells and golden section at every local minimum, plus the ends and the L/C cut. Ranges: inside the goal
  exactly when inside a reported range for every one of 20,000 (f0: 100,000) cells not within 1e-7 of an edge, and
  every edge on the circle (ends at the domain's end or cut inside the goal).
- **Per solution**: re-evaluated independently (residual below 1e-9), its kind of the unknown's family, its `coord`
  the solver's coordinate of its value, f0 inside its search range. A solution matches a brute-force one when every
  coordinate is within 1e-6 (periodic where the coordinate is).
- Closed-form cases C14, C20 (open and short stub), C23, C24, C25, C26 of facts-cases.md through the independent
  evaluation; the regressions below; the same result for the first 40 problems of every kind, solved again in
  reverse order with the unknowns reversed.
- ngspice: `where ngspice` finds nothing on this PC, so the AC check is skipped.

## Counts (npm run check)

| kind | problems | statuses | solutions | brute-force finds | missed | false | solver only | worst residual |
|---|---|---|---|---|---|---|---|---|
| two unknowns, point target | 240 | 122 solved, 118 none | 204 | 150 | 0 | 0 | 54 | 3.5e-10 |
| one unknown, circle goal | 240 | 111 solved, 129 none | 185 | 184 | 0 | 0 | 1 | 1.1e-13 |
| one unknown, best value | 240 | 240 best | 276 | 240 scans | 0 beaten | 0 | – | solver − scan ≤ 4.2e-15 |
| one unknown, ranges | 240 | 66 range, 174 none | 80 ranges | 457,440 cells inside | 0 cells wrong | 0 | – | edges 4.9e-13 |
| two unknowns, family | 220 | 154 family, 66 none | 20,223 members | 19,395 | 0 | 0 | 828 | 5.5e-10 |
| fallback, one unknown (line and stub Zc, f0; circle, best, range) | 200 | 51 solved, 101 none, 40 best, 8 range | 161 | 262,650 | 0 | 0 | 0 | 3.8e-14 |
| fallback, two unknowns (Zc + length, f0 + lumped, Zc + lumped, Zc + f0, two Zc, f0 + λ/4, f0 + stub Zc) | 280 | 120 solved, 160 none | 356 | 320 | 0 | 0 | 36 | 1.4e-10 |
| closed-form cases | 7 | 7 solved | 13 | – | – | 0 | – | 1.1e-15 |
| regressions | 6 | | 14 | – | – | 0 | – | 1.8e-12 |
| determinism | 293 | identical | | | | | | |

"Solver only" are answers of the solver that the independent evaluation confirms (residual below 1e-9) and the brute
force's grid did not find: its resolution, not the solver's. In a standalone run (its own random problems) grids 4×
finer (960², 120 × 12,000; fallback 480 × 6,400 and 1280²) brought them from 55 to 37, 865 to 448 and 67 to 37, and
no miss appeared except the one under "Left" below. One residual above 1e-9 was seen in a standalone run (1.27e-9:
a load 2e-5 from the rim, seen through a short stub 0.00018 λ long): Γ moves by more than that when the values move
by 4 ulps, so the bar there is 1e-9 plus that movement (`conditioning`), printed when used.

## Bugs found and fixed

1. **f0 with a swapped lumped part** (`solve.ts` `atF0`): in `searchMixed` the value found at the new frequency was
   carried back to f0 as the part's own kind scales (C: b ∝ f) even when its sign made it the other kind (L: b ∝ 1/f),
   so every swapped answer failed re-evaluation and was lost (an f0 + shunt C problem missed 4 of 8 answers). Now the
   sign picks the scaling.
2. **Answers at a goal's pole** (`goal.ts` `goalPole`, `POLE_TOL`; `solve.ts` `consider`): every r and x circle passes
   through the open and every g and b circle through the short, where r, x (or g, b) mean nothing. An unknown that
   opens or shorts the node there (a stub's Zc of 0 before a λ/4, a line's Zc near 0) was returned as meeting
   "r = 1.44". Answers within 1e-7 of the pole are dropped. The brute force drops roots within 1e-6 (near the pole
   every circle of the kind is within distance² of the goal's, so bisection stops a little short of it), and the
   scans of check-solve.mjs and check-solve-b.mjs now do the same; they had counted those roots as answers.
3. **Range ends at ±π/2** (`solve.ts` `valueAt`): an infinite parameter at a range end took its sign from the range's
   middle, so a short stub's range over its whole domain read "from λ/2 to λ/2" (min = max). Now −π/2 is −∞ and π/2
   is +∞ (length 0 and λ/2; C = 0 at the C end).
4. **f0 outside its search range** (`searchGrid`): Newton could leave the f0 range (an answer at 0.06·f0 for a range
   from 0.1·f0); such a point is no longer kept.
5. **Answers in narrow bands missed by the generic grid** (`searchGrid`, `search.ts` `newton2D`): a line's Zc near ∞
   against f0, and a λ/4's Zt against f0, put answers in resonances far narrower than the 64 × (64 + 8·span·turns)
   grid. Three changes: a Zc or Zt axis is sampled with 1 − cos spacing (denser towards 0 and ∞); the grid is refined
   up to 6 times wherever Γ moves more than 0.25 across an interval in some row or column, and Newton starts from the
   local minima of the first grid and of the refined one (a refinement can turn a good start into a slope); Newton's
   Jacobian uses central differences (forward ones turned the step away from the root in a thin valley: it stalled at
   4e-6). Cost: the generic grid's median rose from 1.2–5 ms to 7–14 ms (Zc + f0 of one line; f0 + λ/4; Zc + f0 behind
   a stub), worst about 20 ms. `searchMixed` and the geometric paths are unchanged (M4.1b's timings stand).

Each is a fixed case in the group `validate regressions` (the f0 + swapped case, both narrow-band cases with no f0
below the range, the stub Zc of 0, the whole short-stub range), with a series R of ∞ at a b goal's pole (the brute
force found it before it knew the pole; the solver never returned it).

## Left

- The generic grid is still a grid: with the brute force 4× finer one answer in 280 problems was missed (f0 + λ/4,
  (Zt/Z0)² = 3, f = 7·f0, behind an open stub); denser grids found it but lost others, so no grid size is complete.
  BL54 records it. The committed check passes at its resolution; the case is not a fixed regression because it is a
  known limit, not a fixed bug.
- A short stub of length 0 (a dead short) or a shunt R of 0 is returned as a family member where it meets the goal
  (for example a series R after the short makes the input real, b = 0): true, and harmless; M4.3 may hide members at
  a value's limit.

## BL55 fix

Another random stream (notes-M4.3a.md "Found on the way") made the family group report members the solver lacked.
Two causes, one on each side:

- **Solver** (`solve.ts` `familyAt`, `FAMILY_SPLIT`; `geometry.ts` `circleIntersect`'s new `split` argument, default
  off): a short stub's length with a line's length, the node before the line 1e-11 inside the rim for every stub
  length. The line's |Γ| circle then runs a hair inside the rim and crosses K′ (a g circle, which touches the rim at
  the short) about 1.6e-6 either side of the short; the gap R − δ stayed under `TANGENT_TOL` (1e-12), so the two
  crossings were taken for one touching point, which lies on the pole and was dropped, and the range ended early
  (t up to 1.398 of π/2; now the whole domain). A crossing in the tangent band whose half-chord exceeds 1e-7 (rounding
  gives about 1e-8) now gives both members, which Newton polishes as before. Other callers keep the old behaviour.
- **Brute force** (`check-validate.mjs` `roots1`, `nearPole`): the second problem (a series R with a short stub
  across the input, goal g) has no members off the single R where g(P) equals the goal: a shunt stub keeps g. Near
  the short every g circle is within d²·Δg/2 of the goal's (d = 1.6e-6 there, Δg = 5e-5: 7e-17), below Γ's rounding,
  so the signed distance changed sign by rounding (checked at 50 digits with mpmath: g at the input is g(P) = 0.10805,
  the goal 0.10810). Roots within 1e-3 of an r, g, x or b goal's pole are now found again on the goal's own quantity
  from Z = N/D (precise there): the sign change of q − v nearest the root within one cell, bisected and kept on the
  goal's circle in Γ as before, or a touching minimum of |q − v| below 1e-9 relative; else no root. This is a more
  precise brute force, not a looser bar: with it the main stream's family group finds more roots (19,528, was 19,395)
  and "solver only" fell from 828 to 695; in one standalone run it dropped one root at d ≥ 1e-6 (the artefact above).
- **Checks**: the family group also runs on three streams of its own (seeds 0x2f6b1, 0x9e3d7, 0x51c4a, 220 problems
  each), and three fixed cases (`two unknowns, family (BL55)`: both circuits of notes-M4.3a.md and the full-precision
  artefact from seed 0x51c4a). With `FAMILY_SPLIT` off, the first fixed case misses 3 members.

| family group | problems | statuses | solutions | brute-force finds | missed | false | solver only |
|---|---|---|---|---|---|---|---|
| shared stream | 220 | 154 family, 66 none | 20,223 | 19,528 | 0 | 0 | 695 |
| seed 0x2f6b1 | 220 | 155 family, 65 none | 19,247 | 18,410 | 0 | 0 | 837 |
| seed 0x9e3d7 | 220 | 144 family, 76 none | 17,478 | 17,065 | 0 | 0 | 413 |
| seed 0x51c4a | 220 | 144 family, 76 none | 19,892 | 19,359 | 0 | 0 | 533 |
| BL55 cases | 3 | 1 family, 2 none | 240 | 114 | 0 | 0 | 33 |

The other groups are unchanged in their bars and pass. `npm run check` now takes about 67 s (the three extra streams
about 13 s).

## BL56 fix

Two fallback problems failed when the shared stream shifted (M4.3b), and the fallback groups on three streams of their
own (seeds 0x3a7c5, 0x6e1f9, 0xc42d3) failed four more and one residual. Causes and fixes:

- **Stub Zc of 0** (`solve.ts` `farEnd`, `normalise`, `consider`): an open stub with tan θ < 0 has the domain
  [−π/2, 0] for its Zc (atan of its b); a Zc of 0 (b = −∞) was written as the coordinate +π/2, outside it. A half
  slot's far end is now −π/2 when its domain is below 0.
- **Zt near ∞** (`searchGrid`, `END_RATIO`, `END_NEAREST`): the answer (Zt = 307·Z0 at 8.01·f0, where the λ/4 is
  almost 2λ long and Zt·sin θ stays finite) lay past the first grid's last column (Zt = 64·Z0). A Zt or Zc slot now also
  gets columns towards 0 and ∞, 8× closer each, to 1e-12 of the end. The refinement's budget is counted on the points
  it adds (it was refused whenever a doubling of the whole grid would exceed `GRID_MAX`), so the refinement reaches it.
- **Narrow bands of f** (`passRows`, `passBisect`): with a Zc or Zt far from Z0 the answers lie where the node before
  the part (which f alone moves) passes close to the short or open, a high-Q resonance of the fixed parts; the band
  was far narrower than a row (under 1e-3 in ln f) and the rows either side showed no jump. Where the chord of two
  rows' node points passes the short or open nearer than half the nearer point, it is bisected towards the nearest
  point (at most 48 times) and those rows are added. Newton from a start in the thin, curved valley that follows
  crawled: one that ends within 0.03 of the target after 40 steps goes on for 160 more.
- **Brute force's rounding floor** (`check-validate.mjs` `conditioning`): a solution at a high-Q resonance
  re-evaluated to 4.7e-9 while its unknowns' rounding bound it at 2e-9; a 1e-15 change of f or of a fixed line's length
  moves Γ there by 9e-8, so network.ts and the check's evaluation differ by rounding. The floor now nudges every value
  of the circuit (each part's value and Zc, the load, f), not only the unknowns'. Nothing else became "conditioned".

Each case is fixed: `fallback, one unknown (BL56)`, `fallback, two unknowns (BL56)` (the Zt near ∞ and the resonance
residual), and five `has` cases in `validate regressions` (with the coordinates of the brute force's answer). The
extra streams run in `npm run check` with 100 one-unknown and 56 two-unknown problems each (the full groups cost 7 s a
stream); the full groups were run once:

| fallback | problems | solutions | brute-force finds | missed (before) | missed | false | solver only |
|---|---|---|---|---|---|---|---|
| shared stream, one | 200 | 161 | 262,650 | 0 | 0 | 0 | 0 |
| shared stream, two | 280 | 360 | 320 | 0 | 0 | 0 | 40 |
| 0x3a7c5, one / two | 200 / 280 | 157 / 416 | 626,831 / 373 | 0 / 0 | 0 / 0 | 0 / 0 | 6 / 43 |
| 0x6e1f9, one / two | 200 / 280 | 153 / 364 | 474,648 / 300 | 0 / 1 | 0 / 0 | 0 / 0 | 1 / 64 |
| 0xc42d3, one / two | 200 / 280 | 127 / 366 | 207,897 / 323 | 0 / 3 | 0 / 0 | 0 / 0 (1 before) | 1 / 43 |

Cost: the generic grid (Zc + f0, two Zc, f0 + λ/4, f0 + stub Zc; 640 problems from four streams) went from a median of
11 ms (p90 22, worst 52) to 17 ms (p90 32, worst about 100); the end columns cost about 2 ms of the median, the rest
is the larger refinement. `searchMixed` is unchanged. Such solves already run after a pause, never during a drag
(M4.3a). `npm run check` took 73.6 s (69.6 s without the extra streams in one run; this machine varies by ±10 %).
BL54 stands: a grid is still not a proof of completeness.

## For M4.3 and M4.4

- `goalPole(goal)` says which point a goal's circle excludes; the page can grey that point of the drawn circle.
- Range ends read correctly at ±π/2 now: show `from`/`to` (or `min`/`max`) as they come.
- f0 problems with a Zc or Zt unknown take up to about 20 ms: solve them on demand (Apply, a click), not per drag frame.
  M4.4's suggestions should not try f0 pairs with a line's Zc or a λ/4 on every edit.
