# Smith chart – notes of step M4.1b (best value, ranges, families, fallback search, value lists)

Part of [plan.md](plan.md); the method is [solver.md](solver.md), the core it extends [notes-M4.1a.md](notes-M4.1a.md).
Nothing on the site yet. Checks: `cd scripts/harness/smith && npm run check` (the M4.1b groups are in
`check-solve-b.mjs` and `check-values.mjs`, called from `check.mjs`).

## API

**`lib/smith/solve.ts`** (`solve(circuit, unknowns, goal)` as before; what is new):

- `Unknown.param` `'zc'` (a line's or stub's Zc) and `'f0'` (the frequency at which the goal holds; `part` ignored) are
  solved now; `Unknown.lo`/`hi` bound the search of a line's Zc (Ω, default 0 to ∞) and of f0 (Hz, default f0/10 to
  10·f0). The same part may be marked twice with different params (a line's Zc and length: the single-section
  transformer). A stub of a multiple of λ/4 has no Zc unknown (rejected).
- Statuses: `unsupported` is gone. `best` (one unknown, a point target not reached: `solutions` are the nearest value
  and, if that one is swapped, the nearest realisable one, realisable first); `range` (one unknown, an inequality goal:
  `ranges` keep it, `solutions` are its edges); `family` (two unknowns, a circle goal: `ranges` of the first unknown,
  `family.at(t)` the solutions, `family.ends` those at the range ends); `none` when no range exists. An exact hit of a
  point target (residual ≤ `ACCEPT`) is `solved`.
- `SolveResult.ranges: ValueRange[]` (`t0 < t1` in the first unknown's coordinate, `kind`, `from`/`to` at t0/t1 and
  `min`/`max` in its unit, `swapped`, `branches` 1 or 2), `domains: Domain[]` per unknown (`mode` angle, length or log;
  `lo`, `hi`, `periodic`, `cuts`), `family: Family | null`.
- `SolvedValue` gains `param` and `coord` (its coordinate: atan of the added quantity, a length, or ln(f/f0)); `part`
  is −1 and `kind` −1 for f0; `value` is Zc in Ω for a Zc unknown, f in Hz for f0. `Solution.mismatch` is
  `goalMismatch` (below).
- `atFrequency(circuit, f)`: the circuit for a new f0 with every part as it is physically (lengths × f/f0, a λ/4 as a
  line of Zc = Zt): what Apply needs for an f0 answer.

**Coordinates (`Domain`)**: L and C (also free) `[−π/2, π/2]`, periodic, cut at 0 (the kind changes); R, λ/4 `[0, π/2]`;
open stub `[0, π]` (its length grows from 0 to λ/2), short stub `[−π/2, π/2]`; a stub's Zc `[0, π/2]` or `[−π/2, 0]`
(the sign of its b); line length `[0, λ/2]`, periodic; a line's Zc `atan(Zc/Z0)` in `[0, π/2]`; f0 `ln(f/f0)`. Ranges
never cross a cut, so each has one kind and monotonic values; a line's range through length 0 comes as two.

**`lib/smith/goal.ts`** (added): `goalMismatch` (|Γ − Γt|/|1 − Γt*Γ|, |Γ| for the centre, |Γ − Γt| for a rim target;
the residual for circle goals), `isWithin` (within on mag, vswr, rl only), `pointGoal` (|Γ| = 0, r = ∞, g = ∞ as a
point target), `RIM`.

**`lib/smith/search.ts`** (new): `roots1D(f, lo, hi, n, out, at?)`, `minima1D`, `golden`, `refineRoot`, `newton2D`,
`CURVE`, `MAX_STEP`. Framework-free; the caller's f writes the chart point it reached into `CURVE` and the grid is
refined where consecutive points are more than 0.25 apart.

**`lib/smith/values.ts`** (new, D17): `ValueKind` (R, L, C, Z, len), `ListId` (E6 … E96, own, any), `ValueList`,
`ValueChoice`, `defaultChoice()` (E24 for R, L, C; any for Z and lengths), `valueKindOf(kind, param)`, `around(value,
list)` (below/above/exact, across decades for E-series via `lib/resistor/eseries.ts` `neighbours`; NaN at an own
list's ends; null for any value, 0 or ∞), `candidates`, `parseOwnList(text, kind)` (R with the resistor tool's
`parseValueList`; other kinds with `readAmount` in H, F, Ω), `choiceToText`/`choiceFromText` (defaults are "", e.g.
`L12,Co1e-12_2.2e-12,Z24`; own values as JavaScript writes them, at most `LINK_LIST_MAX`; never throws),
`standardVariants(circuit, goal, solution, choice)` → `Variant[]` (`values`, `exact`, `gamma`, `residual`, `mismatch`,
`meets`), every combination of neighbours re-evaluated by network.ts, sorted by mismatch (point), |Γ| (inequality) or
residual (circle).

## How it works (beyond solver.md)

- **Best value**: Q = T∘N with N the parts after the unknown and T: Γ → (Γ − Γt)/(1 − Γt*Γ) (Γ − Γt at the rim); the
  mismatch is |Q(P)| on the locus A, Q(A) a circle whose nearest point to 0 is the closed form; carried back by Q⁻¹ it
  gives the value. |Q| along a circle has one minimum, so on a reach (R, λ/4, a realisable L or C) the best is that
  point or an end; the ends and cuts are candidates, and 32 samples guard the closed form (a golden search only if one
  beats it). `circles[4]` is the mismatch circle it touches, carried back to node a + 1.
- **Ranges**: the crossings of A and K′ (M4.1a) unrolled into the domain, plus cuts and ends; each piece is kept if its
  middle meets the goal.
- **Families**: b's loci through every point form a one-parameter family (Re z, Re y, Im z, Im y, |Γ| in b's Zc chart,
  arg z for λ/4 with z → s/z reflecting the angle). K′ (the goal carried back to node b + 1) is mapped to that plane,
  the two family members that touch it are found in closed form and mapped back; a's range ends where A′ crosses them
  or K′. A grid of 48 counts guards the classification (bisection where counts differ across a grid point).
  `family.at` sets the module state up again, so it can be called after other solves.
- **Fallback**: one unknown: bracketed roots of the goal's signed distance (sign changes, the 4 samples beside each root
  for a triple, golden section at local minima of |f| for a pair inside one step) or the minima of the mismatch. f0
  grids have 256 + 64·ln(hi/lo)·(turns of the lines at the top frequency) points, plus every frequency where a stub is
  a multiple of λ/4 long (its b through 0 or ∞, where the input can jump round the chart) with points 1e-9, 1e-6 and
  1e-3 beside it. Two unknowns: when one of them moves its node on a circle for every value of the other (a part's
  value with a line's Zc, or with f0 unless it is a λ/4 or a stub's Zc), the roots of the target's signed distance from
  that circle in the other unknown (`searchMixed`; with f0 every length that gives the same b or rotation is tried);
  otherwise a grid (64 by 64–2048) and damped Newton from every local minimum (`searchGrid`: f0 with Zc, two Zc, f0
  with a λ/4 or a stub's Zc).
- **λ/4 limits**: Zt within 1e-6·Z0 of 0 or ∞ is not written (it was only 0 and ∞): every λ/4 locus passes through the
  short and the open, so such a "solution" says nothing about the part, and in families it flickered with rounding.
- A circle goal that is one point (|Γ| = 0, r = ∞, g = ∞) is solved as that point target for two unknowns and for the
  search; residuals are still reported against the goal as asked.

## Results (check-solve-b.mjs, check-values.mjs)

- Best value: 300 problems (every kind, free and swapped, 40 % off-centre targets, 20 % intermediate nodes) against a
  100,000-value scan: the solver is never worse (largest solver − scan 1.2e-16 relative); the best realisable value
  against the realisable scan too; every reported mismatch re-evaluated by network.ts.
- Ranges: 300 problems × 10,000 samples agree with the reported ranges (no sample within 1e-9 of an edge had to be
  skipped); a case by hand (25 Ω, series L, |Γ| ≤ 0.4: L up to x = 0.3619 and C from 1/(ω·0.3619·Z0)), every R keeps
  |Γ| ≤ 1.
- Families: 200 problems (158 families): about 9,000 members re-evaluated (worst residual 1.5e-11), every sampled value
  inside a range has a member, and a 300 × 400 scan of a and b finds no solution outside the ranges.
- Fallback: λ/4 line Zc = √(Z0·RL), a single-section transformer (100 + j50 Ω: Zc = √7500 Ω, ℓ = λ/3), the same line at
  a fixed 0.3 λ with Zc and f0 (six frequencies), LC resonance (x = 0 and as a point target), a shorted stub's matches
  at 1.25, 3.75, 6.25, 8.75 f0, a 0.3 λ line's 12 zero-reactance frequencies, the VSWR ≤ 2 band of an LC circuit, all to
  1e-9; 200 random one-unknown problems: every root of a 100,000-point (f0) or 20,000-point (Zc) scan found; 50
  two-unknown problems against a 200 × 200 grid with Newton: none missed; the same JSON on a second run.
- Values: E6–E96 neighbours at every decade edge from 1e-13 to 1e7 and for 10,000 random values (nothing of the series
  between); an own list's inside, ends and exact values; own lists of every kind; 500 random choices round-trip
  through the text; broken texts; 707 variants re-evaluated.
- Fuzz of 10,000 problems with Zc, f0, inequality goals, rim and point-circle goals: no throw, no NaN, residuals as
  reported.
- **Timing** (10-part circuit, medians): best value 20 µs; ranges 4 µs; a family with its ranges 0.08 ms; fallback: a
  line's Zc with a circle goal 0.23 ms, its best value 0.27 ms, f0 with a circle goal 1.2 ms, Zc and length 0.26 ms,
  f0 and a series C 1.9 ms (target 5 ms); the generic grid (Zc and f0 of one line) 1.6 ms in a 1-part circuit. The whole
  `npm run check` takes about 40 s (the M4.1b groups about 25 s, most of it the scans).

## For M4.2, M4.3 and M4.4

- M4.2: the generic 2-D grid (`searchGrid`) has one known case and the fuzz; it deserves the brute force of the
  others. Families with a line's Zc or f0 are not built (status `family`, no ranges, the reason asks to fix one); two
  unknowns with an inequality goal give the family of its boundary circle (the reason says values inside keep it too).
- M4.3: a range is shown in `from`/`to` (ascending: `min`/`max`) with its kind; the family slider runs over the first
  unknown's `ranges` in `domains[0]`'s coordinate and calls `family.at(t)` (0 to 2 solutions, a few µs to 0.1 ms).
  `circles`/`circleNode`: best value: a's locus and the mismatch circle at node a + 1; family: A′ at node b and K′ at
  node b + 1 (drawn together). Variants: `standardVariants` with the choice from `choiceFromText` (link) and
  localStorage; `parseOwnList` for the pasted lists. `SNAP_SERIES` in `components/Smith/pathLayer.ts` is untouched; M4.3
  replaces it with `around`/`candidates` of the part kind's list. values.ts imports the resistor tool's reader
  (lib/resistor/read.ts and what it needs) for R lists: load it with `await import` if its size shows. An f0 answer is
  applied with `atFrequency`.
- M4.4: suggestions can call `solve` per free part (one unknown: `solved` or `best` with its mismatch) and per pair.
- solve.ts is over 40 kB now (CLAUDE.md lists it with the other large files): read it by its outline.
- The plan stands; plan.md has the status and the module map.
