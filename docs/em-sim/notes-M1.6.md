# Notes from M1.6 – axisymmetric solver and via cut (2026-11-16)

## API for M1.7 and M3

- `axisym.ts`: `viaAxisym(stackup, via, { M = 1, estimate, rwFactor = 4, Rw, gauss8, cache })` → `crossings[]`
  (`layer`, `kind` plane/pad/plane+pad, `z`, window `zLo`–`zHi`, window charge `q`, `line`, **`dC` = q − line** in F,
  `err`), `total`, `lineC` per slab, `levels` (the last is the side view's solution), `cached`. One via alone (a pair:
  each via, solver.md §5.2). Generic: `solveAxiLevel(edges, M)`, `axiCharge`; side view `axiField`, `axiGrid`.
- `viacut.ts`: `viaCut(stackup, via, { M = 2 })` → vacuum `vac` (`z`, or `zdiff`, `zcm`, `zodd`, `zeven`, `k12`
  = −C12/C11 for ΔC12 = ΔC·k12), `segments` (cut at slab boundaries and at each crossing's middle; Z = Z_vac/√εr,
  `delay`); `equivalentRadius(cut, a)`; refuses a via without returns.

## Decisions

- Copper is thick (rectangles): copper at t/4 changes ΔC by −7 to −14 % on C44, so sheets would not do.
- Mesh: 2·⌈√(len/h0)⌉ panels per edge, h0 = half the smallest gap or radius, grading exponent 3 at every copper edge
  and triple point (2 converged irregularly, 4 not monotonically). Level 1 is the default (370 panels on C44).
- Estimate: levels 1/2 and 1; half the difference, and per window at least the total's half difference shared by
  window charge (a window's own difference vanished by chance on L3). Estimate / true error ≥ 3.1 against level 4.
- Self panel: log part in closed form, rest by 8-point Gauss on s = h·u²; 4 points to 6 lengths, 2 beyond: 1.4 × 10⁻⁷
  from 8 points everywhere, 37 against 57 ms.
- Cut circles: polygon vertices at 2r/(1 + cos(π/n)), which makes the coax converge at order 3.

## Exact cases

| case | result |
|---|---|
| sphere 4πε0a (free space) | −1.5e-3, −2.5e-4, −5.2e-5, −1.3e-5 (M 1–8), order 2.06; field φ, E 1.4e-5 |
| disk 8ε0a | −6.0e-3 … −9.6e-5, order 1.99 |
| coax C03, C′ from a z window | 3–5e-7 |
| pad + plane + antipad + interface in a can | BEM 231.2266 fF (order 2.9) vs FD Richardson 231.236 ± 0.024: −4e-5 |
| kernel gradient vs central differences | < 1e-7 |
| cut: C03 as a ring | −1.6e-5 at M 2, order 3.0 |
| cut: C36 N 4 / 8 (b 0.15) | BEM 57.537 / 52.646 Ω; thin-wire formula +1.8 % / +2.9 % |
| cut: thin returns b 0.01, N 16 / 32 | thin-wire +1.7e-5 / +2.3e-4 (tends to the coax as N grows) |

No exact coax-with-plane-gap value was found; the can against the FD solution stands for it.

## C44 via (default setup) and the pair preset

ΔC L1–L6 (fF): 17.49 19.72 39.14 39.14 19.72 17.49 (level 4: 17.71 19.76 39.28), total 260.5 ± 1.4 fF, R_w 4.91 mm.
Pair preset (round antipad of the slot's half width): L1 34.1, L2 31.2, L5 31.2, L6 34.1, total 225 fF. Cut: C44
Z_vac 127.36 Ω (60.5 Ω in εr 4.43), 15 segments, 11.03 ps; pair vacuum Zdiff 196.7 Ω, Zcm 86.3 Ω, k12 0.274.

**The ΔC convention (open, for M1.7).** The window charges do not depend on R_w (doubled: ≤ 5 × 10⁻⁴), but
solver.md's line part 2πε0εr/ln(R_w/a) does, so ΔC does: R_w 8.92 mm gives 18.2 21.1 45.3 fF (L3 +16 %). Between the
planes the field without returns ends on the planes, not on the wall, so the R_w rule counts barrel-to-plane charge
as pad excess, which the cut's C′ counts again. **Proposal:** M1.7 passes `Rw: equivalentRadius(cut, a)` (C44: 1.255
mm), so that the line part is the cut's own C′ and the cascade's total equals the axisymmetric total: ΔC 15.3 14.3
15.3 15.3 14.3 15.3 fF, total 267 fF. When R_eq lies inside an opening (or there are no returns) the call refuses and
M1.7 flags it.

**Johnson & Graham** (whole-via estimate, ∝ board thickness): 193–207 fF for C44 against the solve's total 261 fF
(+26 to +35 %); ΣΔC is 153 fF (R_w rule) or 90 fF (equivalent wall). The formula is rough and was not opened.

## Budgets (C44, 6 crossings)

| what | ms |
|---|---|
| axisymmetric, uncached with estimate | 30 (5 per crossing) |
| level 1 alone / level 1/2 alone | 22.5 (18.9 assembly + 3.9 LU) / 7.6 |
| cached | 0.01 |
| cut with estimate (3 circles) / pair (8 circles) | 0.9 / 7 |
| side-view grid 64 × 64 (direct) | 230 (BL89) |

M1.7 has about 22–29 ms left of the 30 ms for the cascade when pads are cached; dragging a pad, antipad or drill
costs ≈ 31–37 ms (show level 1/2 first, 8 ms).

## Left out (BACKLOG BL88, BL89)

Mask (air), hollow barrel (solid), oblong antipads as round, returns through the whole barrel; the side view's
far-field speed-up.
