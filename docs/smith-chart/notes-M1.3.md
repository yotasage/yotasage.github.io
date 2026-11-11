# Smith chart – notes of step M1.3 (geometry)

Part of [plan.md](plan.md). Nothing on the site yet. Checks: `cd scripts/harness/smith && npm run check` (159,819
checks; the M1.3 groups are in `check-geometry.mjs`; the resistor harness still passes its 3294).

## API (`lib/smith/geometry.ts`, all Γ coordinates, Γi up, allocation-free per frame)

- **Möbius maps** (`MOB_STRIDE` 8: a, b, c, d complex, Γ → (aΓ + b)/(cΓ + d), up to a factor): `partMobius` (from
  `partMatrix`, Γ_in = M(Γ_out)), `mobApply` (∞ → a/c; a rank-1 map at its kernel gives its image point),
  `mobCompose` (out = M1 ∘ M2, rescaled by a power of two), `mobInvert` (adjugate).
- **Generalised circles** (`CIRCLE_STRIDE` 4: A|w|² − 2(Dr·wr + Di·wi) + C = 0, largest coefficient 1; A = 0 is a
  line): `circleThrough` (3 points), `circleImage` (under a map), `circleCentre` (cx, cy, r; a line gives r = ∞),
  `circleResidual` (≈ signed distance), `projectOnCircle` (stable for any radius, no centre formed).
- **Loci** (`LOCUS_STRIDE` 27; the circle at `L_A`): `partLocus(loc, l, kind, zc, Γs, z0, f, f0)`, `nodeLocus(…,
  nodes, parts, k, …)` (part k from node k, 0-based); modes `LOCUS_FIXED` (nothing moves: series part on the open,
  shunt on the short, line matched to its Zc), `LOCUS_MOBIUS`, `LOCUS_LINE`, `LOCUS_NUMERIC` (λ/4 at f ≠ f0).
  `locusPoint(out, o, loc, l, value)`, `locusValue(loc, l, Γ, prev)`, `project(out, o, loc, l, px, py, prev)`.
- **Arcs** (`ARC_STRIDE` 11): `partArcs(arcs, nodes, parts, count, z0, f, f0)` over network.ts's nodes, `partArc` for
  one; `arcFlags`; `trackLength`; `samplePolyline(out, cap, fn, t0, t1, tol, start = 16)`.

## Parametrisation

A lumped part or stub adds a real p (r, x, g, b) to z or y: Γ(p) = (αp + β)/(γp + δ) with series α = γ = u(1 − Γs),
shunt γ = −α = u(1 + Γs), β = 2Γs, δ = 2 (u = 1 for R, j otherwise); λ/4 at f0 multiplies z by s = (Zt/Z0)² against
1/z_L (α = γ = 1 − Γs, β = −(1 + Γs), δ = 1 + Γs). The locus is the image of the real line; p of a point is
(δΓ − β)/(α − γΓ). A line rotates Γo = (Γ − B)/(1 − BΓ), B = (zc − 1)/(zc + 1), clockwise by 4π·turns; its circle
has centre B(1 − ρ²)/(1 − B²ρ²) and radius ρ(1 − B²)/(1 − B²ρ²) (= facts.md eq. 12).

## The arc representation (what M2/M3 feed to SVG)

S (`ARC_SX/SY`) = node k, E = node k + 1 (copied from network.ts, so the path is continuous), centre C, radius R,
`ARC_SWEEP` the turn from S to E (> 0 anticlockwise in the model, |sweep| < 2π), `ARC_TURNS` full circles first
(lines and λ/4 longer than λ/2 at f), M the point halfway along the sweep. Drawing: per full turn two half-circle `A`
commands, then `A R R 0 large sweep E` with `arcFlags` (bit 1 large-arc = |sweep| > π, bit 0 sweep-flag = sweep < 0,
which already accounts for the y flip; M2.1b corrected it from sweep > 0, which drew the other side of the chord). R = ∞ (series R or shunt R on the real axis, Zt of 0 or ∞): a straight
segment; R = 0: a point. M2 should also draw a segment when R in pixels is huge. A stub's arc is its b from 0 the
short way (b = ±∞ is drawn as +∞, clockwise); λ/4 is its line of Zt from length 0.

Sweep of a lumped arc: −2·arg(1 + (γ/δ)·p1) (twice the turn of the chord from Γ(∞)), exact sign even for tiny arcs,
no wrap. Lines: the own-chart angle ψ maps to the angle χ about C by tan(χ/2) = k·tan(ψ/2), k = (1 − Bρ)/(1 + Bρ).

## Projection and length tracking

- The pointer is projected onto the locus circle; its p decides reach. Lumped parts reach [`REACH_LO`, `REACH_HI`]
  (the arc from the start to the open or short in the part's direction); a projection outside goes to the nearer end
  (by distance to the pointer), so values are never negative. Stubs, lines reach the whole circle.
- `prev` is the value before this pointer event. Lines and stubs: the candidate (shortest length, or clockwise angle
  in the line's own chart) plus the multiple of λ/2 (at f, in wavelengths at f0) nearest `prev`; a drag back past 0
  stays at 0 until the pointer comes round. Pass NaN for a plain nearest point.
- λ/4 away from f0 (Zt changes Γ along a curve that is not a circle): 129 samples of zt = tan u, golden section around
  every local minimum (28.8 µs); `locusValue` solves jS(1 − Γs)(1 − Γ)zt² + 2C(Γs − Γ)zt − jS(1 + Γ)(1 + Γs) = 0.

## Results

- Arcs on 10,000 random circuits (f0 and f within ×2): ends exact; locus at the value vs network.ts 1.6e-14; M on the
  locus 9.9e-14, on the arc's circle, on engine.md §1's r/x/g/b circle or eq. 12 (< 1e-11: the formula's z loses
  digits near the open); rotating S by the sweep gives E and by half M (1.6e-14).
- Directions (1,000 each): every kind turns as network.ts moves the point, and as engine.md §1 says.
- value → point → value < 1e-9 for every kind over 1e-4…1e4 of the natural scale (|z_s + 1| series, |y_s + 1|
  shunt), lines and stubs to 3 λ and within 1e-4 λ of their special lengths, λ/4 at and away from f0; 0 and ∞ exact.
  Limit: p from a point has relative error ≈ ε/|ΔΓ| near no effect and ≈ ε·|p| near the far end; a line
  start within ρ < 0.05 of its Zc resolves short lengths only to ε/ρ.
- Projection (600 per kind) on the locus to 1e-12, never farther than 5,000 brute-force samples of the reach.
- Fuzz 100,000 circuits with 0, ∞, open, short, rim and subnormal loads: no NaN. A start within 1e-140 of the open
  or short counts as fixed (its map's determinant underflows).
- **Timing**: a drag frame of 10 parts (nodes, 10 arcs, a locus, a projection) **1.55 µs**;
  10 arcs 0.9 µs. Far within engine.md §9's 4 ms per frame.

## For M1.4 and M3

- engine.md stands.
- M3: build the locus once on pointer down (`nodeLocus`), then per event `project(…, prev)` and re-evaluate; the
  value goes into the part, the point is where the handle is drawn.
- M1.4/M2: `arcFlags` already includes the y flip; the flip of coordinates is the drawing boundary's.
- M7: `samplePolyline` with tol = a quarter pixel in Γ units.
