# Smith chart – notes of step M4.1a (goals and the circle-intersection core of the solver)

Part of [plan.md](plan.md); the method is [solver.md](solver.md). Nothing on the site yet. Checks:
`cd scripts/harness/smith && npm run check` (the M4.1a groups `solve …` are in `check-solve.mjs`, called from
`check.mjs`).

## API

**`lib/smith/goal.ts`**

- `Goal { kind, node?, value?, targetR?, targetX?, within? }`, `GoalKind` = `'point' | 'mag' | 'vswr' | 'rl' | 'r' |
  'g' | 'x' | 'b'` (`GOAL_KINDS`). `node` 0 is the load, `parts.length` the input (default). A point target is in
  ohms (default Z0 + j0, the centre; R = ∞ the open). `value`: |Γ|, VSWR, return loss in dB, or the normalised r, g, x,
  b of the circle; defaults mag 0, vswr 1, rl ∞, r 1, g 1, x 0, b 0. `within` marks |Γ| ≤ m, VSWR ≤ s, RL ≥ dB:
  represented only; M4.1a solves its boundary.
- `goalCircle(out, o, goal)`: the goal as a generalised circle in geometry.ts's form (false for a point). |Γ| = 0 and
  r or g = ∞ are point circles (`pointCircle`). `goalTarget(out, o, goal, z0)`: Γ of the point target.
- `goalResidual(goal, gr, gi, z0)`: |Γ − Γt|; ||Γ| − m|; the distance to an r/g/x/b circle (to first order).
  `goalSigned` is its signed form (for scans and Newton steps). `goalProblem(goal, count)`, `goalNode`, `goalValue`,
  `goalMag`, `isCircleGoal`.

**`lib/smith/solve.ts`**

- `solve(circuit, unknowns, goal): SolveResult`. Pure (the circuit is not changed), at f0.
- `Unknown { part, param?: 'value' | 'zc' | 'f0', free? }`. `free` on a series L/C is "a series reactance", on a
  shunt L/C "a shunt susceptance": the sign picks L or C and nothing is swapped.
- `SolveResult { status, reason, solutions, unknowns (sorted, nearest the load first), goalNode, circleNode, circles,
  nonPassive, sameJob }`. Statuses: `solved`; `none` (reason says why: the circles miss; the two parts do the same
  job; only a negative R; a part that cannot move its node); `coincident` (infinitely many; "these two parts do the
  same job", or every value keeps a circle goal); `degenerate` (the target is b's own fixed point, the open for a
  series part, the short for a shunt one: b = ∞ and a free); `family` (two unknowns and a circle goal; M4.1b);
  `unsupported` (one unknown and a point target; M4.1b); `rejected` (`unknownsProblem`: f0, Zc, more than two, a part
  twice, a part at or beyond the goal node, `free` on a part that is not an L or C, a goal problem).
- `circles`: Float64Array(8), the two circles to draw (M4.3) at `circleNode`: two unknowns A′ (at 0) and B (at 4) at
  node b; one unknown a's locus and the goal carried back, at node a + 1.
- `Solution { values, residual, gamma, realisable, atF0Only, changed, change }`; `SolvedValue { part, kind, value,
  zc, added, swapped, period }`. `kind` is what to put in the circuit (it differs from the part's for a free unknown
  of the other sign and for a swapped one). `added` is the normalised r, x, g, b (a stub's b), (Zt/Z0)² for λ/4, or a
  line's length in λ at f0. `period` 0.5 on lengths (line, stub): the λ/2 note.
- `ACCEPT` = 1e-9: the largest residual a returned solution has.

**`lib/smith/geometry.ts`** (added): `circleIntersect(out, o, c1, o1, c2, o2)` → 0, 1, 2 or `CROSS_SAME` (−1);
`sameCircle(c1, o1, c2, o2, tol)`; `pointCircle(out, o, x, y)`; `locusParam(loc, l, gr, gi)` (the raw parameter of a
point on a `LOCUS_MOBIUS` locus, any sign, no reach); `COINCIDENT_TOL` 1e-9 (on coefficients scaled to a largest of
1), `TANGENT_TOL` 1e-12 (in Γ: the gap R − δ between the radius and the centre's distance from the radical line).

## How it works (beyond solver.md)

- B is `partLocus` of b's kind from T′: for every v1 part the backward locus is the same family (adding −x, rotating
  back, z → s/z for λ/4). A line whose T′ is its own Zc gives a point circle.
- A′ ∩ B by the radical line cut with the circle of larger |A| (so a straight line is never the one cut); two lines
  meet once. a's value from M⁻¹(P) on A (`locusParam`, or `locusValue` for a line with prev NaN: the shortest length);
  then node b is **evaluated by network.ts** with that value, b's locus built from there and b's value read at T′.
- Every candidate is re-evaluated by network.ts to the goal node; above 1e-13 it gets up to four Newton steps on the
  angle-mapped coordinates (finite differences). Above `ACCEPT` it is dropped: that removes the touching point of two
  circles of one family (all constant-r circles touch at the open, so two series reactances always "meet" there) and
  points through rank-1 maps. In the random sets no real solution was dropped (the scans below).
- "The same job": when nothing is found, a point of A′ is taken and b's circle through it compared with A′.
- An R or Zt read at the far end of its circle (−∞ by rounding) is taken as +∞. Zt of 0 or ∞ is not returned (a λ/4
  of Zt = 0 makes every node a short and network.ts cannot evaluate it); lumped values may be their kind's 0 or ∞
  (an open or short), never NaN.
- Order: realisable, fewer changed (an unknown is changed when its coordinate moves by more than 1e-9 or its kind
  changes), smaller total change (per unknown the distance of atan(added) on the projective line, or 2π·Δℓ of a length
  modulo λ/2), then `added` of the first unknown, then the second.

## Results (check-solve.mjs)

- facts-cases C14 (λ/4 300 → 50 Ω, |Γ| = 0 and VSWR = 1 goals: one solution, the locus touches the point circle),
  C15 (line + λ/4), C20 (line + open or short stub), C21, C22 (line + series or shunt C), C23–C26 (L networks, with
  the swapped series-C version of C23 second, C25's target 25 Ω, C26's complex target), C27 (line + series C and line
  + shunt L): residual < 1e-9, the source's digits reproduced (C24's |X_S| = 35.35 and C25's B_P = 13.22 mS are
  truncated by the source, checked within one unit).
- 520 random two-unknown point-target problems (every part kind as an unknown, 0–2 fixed parts before, between and
  after, Z0 from 0.01 to 10 kΩ, a fifth at an intermediate node, 40 % off-centre targets): 451 solutions, worst
  residual 1.1e-11; a 400 × 400 scan of the angle-mapped values with Newton refinement found 345 distinct solutions,
  each one the solver had (it skips Zt of 0 or ∞, see above).
- 400 random one-unknown circle goals (all seven circle kinds): worst residual 1.5e-13; a 10,000-value scan found 363
  crossings, each one the solver had.
- Coincident (two series reactances on the target's r; two shunt susceptances on g = 1; a series L on the goal r = 1),
  the same job without a crossing (status `none`, `sameJob`), tangency (a series reactance from r = 3 to VSWR = 3: one
  solution x = −0.8; g = 1 load with shunt then series: the g = 1 and r = 1 circles touch at the centre, one solution),
  wrong sign as the other kind, free unknowns never swapped, negative R dropped with its reason, lengths in [0, λ/2) and
  + λ/2 keeping the match, every status, the same JSON on a second run with the unknowns given in reverse (200).
- Fuzz of 10,000 problems with open, short and rim loads, 0 and ∞ part values, targets at the open, short and rim, all
  goal kinds and nodes: no throw, no NaN; every returned solution re-evaluates below 1e-9.
- **Timing:** two unknowns in a 10-part circuit **4.3–5.0 µs** median per solve (60 batches of 100); one unknown with a
  circle goal about 2 µs. The whole `npm run check` takes about 15 s, most of it the 400 × 400 scans.

## For M4.1b and M4.3

- One unknown, point target (M4.1b): `solve` returns `unsupported` before any work; the best value can reuse
  `slots`/`settle`/`gammaAt` in solve.ts and A with the target carried back (the nearest point of A to T′ in the
  pseudo-hyperbolic sense is not the Euclidean projection: search, or a closed form if one is found).
- Families (M4.1b): two unknowns with a circle goal return `family` with no members; for each value of a, A′'s point
  carried to b and b's locus ∩ the goal circle carried back gives 0–2 values of b, with the same machinery.
- Ranges (M4.1b): an inequality goal's boundary values are what `solve` gives now; the range is the arc of the locus
  inside the circle between them (sign of `goalSigned` at a value between).
- Fallback (M4.1b): a stub's Zc at a fixed length is a circle too (b = (Z0/Zc)·tan βℓ moves along constant g), so it
  could be added to the geometric path instead of the search; a line's Zc and f0 need the search.
- M4.3: `circles` and `circleNode` are what to draw; `reason` is an English sentence per status, written for the page
  but short (the page may rephrase by status). `SolvedValue.kind` and `value` go straight into the circuit
  (`state.ts withPart`); `swapped` and `atF0Only` carry "true at this frequency only"; `period` the λ/2 note.
- The plan stands; nothing in plan.md had to change beyond the status and the module map.
