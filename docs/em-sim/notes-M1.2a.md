# Notes from M1.2a – 2D boundary-element core: correctness (2026-11-16)

## What was done

`lib/emsim/`: `linalg.ts`, `kernels.ts`, `panels.ts`, `bem2d.ts` ([modules.md](modules.md)). Harness group
"2D solver (BEM)" (`check-bem.mjs`, 215 checks, about 3.7 s) in `npm run check`. Formulation as solver.md §2, with
these choices:

- **Levels** M = 1/2, 1, 2, 4 … (every edge's level-1 count is made even, so level 1/2 exists and all node sets nest).
  The result is level M (default 2); the estimate uses M/2 and M/4 (cheap: 1/64 of the LU).
- **Estimate** (`estimateOf`): e = max(|X(M) − X(M/2)|, 10⁻⁵·X), but only when the two differences shrink with ratio
  2…16 (order 1–4, same sign): status `regular`. Otherwise `irregular` and e = the larger difference (a quarter of it
  when the ratio is over 16): the page must show the status. On all 33 exact values e/true error = 2.9–3.5 at M = 2.
- **Symmetry**: collocation leaves C slightly unsymmetric (4.5 × 10⁻⁶ on three unequal strips; 10⁻¹⁵ on mirror-symmetric
  structures). C, C0 and L are symmetrised; the removed part is `Level.asym` and is added to the off-diagonal estimates.
- **Interfaces** come from the section's polygons by adjacency (edges split at T-junctions, both sides known), not by
  probing a point beside the panel; collinear pieces through a vertex where nothing else meets are merged.
- **h0** = (smallest conductor width, same-layer gap, 4 × thickness)/7, without the mask (as the spike; the mask's
  edges get the minimum 2 panels per level). dNear = 7.5·h0.
- **Circles** (harness only): inscribed polygons of 32·M and 64·M vertices, order 2.

## Results

- **Exact cases** (33 values: C01–C03, C05–C11, C04b, C14–C18, C15 at εr 4.3, C19/C21–C24/C28/C29 Zeven and Zodd from
  the 2×2 C, C26, C27): worst error at M = 8 **0.014 %** (C19 Zodd), every order 1.9–2.2. Not run: C12/C13 (need magnetic
  walls), C04 (curved interface, solver.md §2.1), C25 (Zodd = 0): BL80.
- **Invariance**: translation, mirror in u, mirror in z (plane above: the flipped frame) to ≤ 4 × 10⁻¹⁵; a mirrored
  pair gives C with 1 ↔ 2 to 1.5 × 10⁻¹⁵. Stripline in one εr: εeff = εr to 4 × 10⁻¹⁶; L of C39 does not change with
  the laminate's εr (bit for bit: the vacuum problem is the conductor block of the same matrix).
- **C39** (rectangle, spike geometry): 98 → 50.5944, 196 → 50.5294, 390 → 50.5237, 780 → 50.5250 Ω. M = 2:
  **50.529 ± 0.065 Ω (regular)**, spike 50.526: inside. Default setup (trapezoid by JLCPCB's etch): 51.505 Ω at M = 2.
- **Ray alignment** (notes-M0.3.md): all of the copper's nodes on the mask ray made C39 worse (the mask's corner lost
  its grading); kept: own grading over dNear, shared far nodes. Changes C39 by < 10⁻⁴ Ω: **the drift beyond 364 panels
  is not from staggered nodes**. It stays (+1.3 × 10⁻³ Ω from 390 to 780, order ≈ 0.6); doubling near-ray or edge
  panels moves level values by up to 2 × 10⁻⁴: a corner effect at copper/laminate/mask. BL79 (per-corner grading).
- **Mask side walls** (notes-M1.1.md asked; M = 4, hand-drawn section): no side-wall mask 50.737 Ω, the convention
  (C2 = 15.24 µm) 50.523 Ω, C1 on the walls 50.319 Ω. **The convention weighs −0.21 Ω (0.42 %)**, more than the 0.1 Ω
  M1.1 expected: BL78 (ask JLCPCB).

## For M1.2b: where the time goes

Median of 3, this laptop, Node; per level mesh / assembly / LU / LU vacuum / solves (ms):

| Case | M/4 | M/2 | M = 2 | Total |
|---|---|---|---|---|
| microstrip + mask (default setup) | n 48: 0/0.2/0.0/0/0 | n 96: 0/0.6/0.2/0/0 | n 192: 0/2.4/1.9/0/0 | **5.4 ms** (budget 20) |
| pair + mask + coplanar ground (w 0.1, s 0.15, g 0.3, ground to the edge) | n 155: 0/1.5/1.0/0.1/0.1 | n 310: 0/5.7/7.8/0.7/0.2 | n 620: 0.1/28.8/66.6/5.3/0.7 | **118 ms** (budget 40) |

Pair Zdiff by level: 155 → 102.679, 310 → 102.147, 620 → 102.131, 1238 → 102.161 Ω (647 ms). At M = 2 the estimate
says `irregular` (ratio 33) and e = 0.13 Ω; level 1 is already within 0.03 % of level 4. The pair has 620 panels
against the spike's 442 because h0 follows w = 0.1 (0.0143 mm against the spike's fixed 0.02).

- **LU dominates** from ~300 panels (≈ 2 GFlop/s, n³/3). Ideas: (1) **mirror symmetry**: even and odd halves with a
  mirrored kernel (G(x, x′) ± G(x, −x′)), LU 4× and assembly 2× cheaper; most pairs and single traces qualify; the
  section must be mirror-symmetric to rounding (check the polygons). (2) **Base mesh per edge**: coplanar ground rays
  and the far mask rays carry little charge; level 1 of the pair is as good as level 2. (3) **Blocked/left-looking LU**
  for cache (≤ 2×). (4) **Reuse between levels**: none today; nested meshes allow a coarse-level preconditioner for an
  iterative solve of the fine level (GMRES), which may beat LU from ~600 panels.
- **Assembly** ≈ 75 ns per pair (image kernel: two closed forms). Ideas: share `u`, `v` of source and image; η = 6
  near/far split only if the harness shows < 10⁻⁷ change (solver.md §2.3). The vacuum matrix is free (conductor
  block); a Schur complement on that block would give both solves from one factorisation.

## For M1.3 and M1.5: the API

- `solveSection(section, { M })` → `BemResult`; `ok: false` with a `reason` (no ground without planes, conductors
  touching, singular matrix) and never a throw for a valid section. Signals are 1…n in the section's order.
- Modes and pair impedances (M1.3): compute them per level from `levels[k].C`, `levels[k].C0` (n × n row-major
  `Float64Array`, F/m), then `estimateOf([coarse, mid, fine])` for each impedance; take the `worse` status.
- Fields (M1.5): `levels[last].mesh` (panels in the solver's frame: z = flip ? zShift − z : z − zShift, from
  `boundary`) and the charges `q[s·N + j]` (σ/ε0, V = 1 on signal s + 1) and `q0[s·nc + j]` (vacuum, conductor
  panels). The potential anywhere is Σ q_j·`panelPot(kernel, mesh, j, x, z, false)` (+ V0 for the free kernel: solve
  it from a conductor panel), the field from `panelDn` with the two unit normals.
