# Notes from M1.5 – Fields and the static worker (2026-11-16)

`lib/emsim/`: `fields.ts`, `fieldlines.ts`, `colormap.ts`, `jobs.ts`, `static.worker.ts`, `staticClient.ts`
([modules.md](modules.md)); `bem2d.ts` `freeCharges` and `panels.ts` `sheetEdge`. Harness groups "Fields (M1.5)"
(`check-fields.mjs`) and "Static worker (M1.5)" (`check-worker.mjs`) in `npm run check`.

## Field API (for M2.1b/M2.2)

- `fieldModel(lineResults.bem, section)` → model of the finest level; `electric(model, V)` (volts per signal) or
  `magnetic(model, I)` (amperes, wave along +v) → `Source`. Drives: `namedDrive(n, 'line'|'even'|'odd'|'differential'|
  'common', k, field)`, `modeDrive(lineResults, m, field)` (Tv or Ti of a mode).
- Section coordinates (mm) in, SI out: `evalField(src, x, z, out)` → [φ (V) or Az (Wb/m), Ex, Ez (V/m) or Hx, Hz
  (A/m)], copper points get the conductor's potential and zero field; `pointField` adds εr and D (C/m²) or B (T) for the
  probe; `surface(src)`: free σ (C/m²) or J_s = c0·ρ_s,0 (A/m) per conductor panel and per conductor.
- `fieldGrid(src, view)`: a generator. The first `next()` is the coarse lattice (every 8th point) with the rest
  interpolated; then spacings 4, 2, 1. Each yield is a whole `FieldGrid` (`phi`, `fx`, `fz` Float32Array, `cls`, `eps`,
  `step`, `done`). `magnitude(grid, d)` gives |E| (or |D|); D needs `eps[cls]`. H lines are the contours of Az.
- **Sampling.** A new point is evaluated when its parent cell holds a change of medium or copper (the kinks of E at
  interfaces and faces) or lies within 4 parent spacings of a corner of the geometry (E ~ r^(−1/3): bilinear error
  ≤ 1/(18·4²) ≈ 0.35 % beyond); elsewhere it is interpolated. Measured: 2 of 43 243 C39 points (pair: 2 of 40 688) off by
  more than one colour step (1/256 of the scale's top), the worst 0.45 % of it.
- Evaluation: collinear runs of panels as binary trees with 12-term multipoles (point beyond 4 half-lengths: truncation
  < 2 × 10⁻⁸), single panels by the closed forms of kernels.ts; `forView` turns panels farther than twice the view's half
  diagonal (the graded rays) into one 30-term local expansion. Parallel plates: panel by panel (BL86).
- `contours(grid, levels)`: marching squares, saddles by the cell mean. `fieldLines(src, { view, count | perCharge })`:
  seeds at equal steps of positive free charge (perCharge fixed → density comparable across drives), midpoint rule with
  step control (error h·|k2 − k1| ≤ 10⁻³ × the view's diagonal), stop in copper (bisected onto it) or at the view's edge.

## Worker protocol

In: `{ type: 'run', id, job }`, `{ type: 'cancel', id }`. Out: `{ type: 'progress', id, done, total, partial? }`
(a field job's partial is a whole grid, coarse first), `{ type: 'done', id, result }` (buffers transferred),
`{ type: 'error', id, message }`, `{ type: 'cancelled', id }`. Jobs: `solve`, `sweep`, `corners`, `montecarlo`,
`inverse` (results without the solver's levels) and `field` (`setup`, `field` 'E'|'H', `drive` {values}|{name, line}|
{mode}, `view`, `contours` (10), `lines` (24 or null) → `FieldResult` with grid, contours, lines, surface and the line
results). One job at a time, 40 ms slices, `setTimeout` between them so a cancel stops a running job at its next yield;
the worker keeps the newest 4 solves by hash, so a field map after a solve does not solve again.

`StaticClient.run(channel, job, progress)`: a new job on a channel cancels the old one (its promise gives null); results
are cached by `hashOf(canonical(job))` with the key compared (64 MB, 64 entries); without a worker the same handler
runs on the page.

## Colour maps

Sequential: a straight OKLab line from oklch(0.27 0.10 265°) to oklch(0.93 0.14 100°), blue to yellow like cividis:
equal OKLab steps (spread 1.9 % over 32-entry steps, the bytes' rounding), lightness rising under normal vision and
protan-, deutan- and tritanopia (Machado 2009 matrices); neither end black or white, so it reads on both page themes. Diverging: blue oklch(0.45 0.13 255°) – oklch(0.965 0 0) – red oklch(0.45 0.15 30°), equal end lightness;
±x stay ≥ 0.05 apart in OKLab for |x| ≥ 0.25 under every vision. `scaleOf` clips at the 99.5th percentile (corners are
singular).

## Checks and budgets (Node, Ryzen 9 7950X)

Coax and two wires at M = 8, > 2 panel lengths from copper: φ ≤ 4.6 × 10⁻⁵ V, E ≤ 6.6 × 10⁻⁵ relative; coax H 10⁻¹².
Gauss: coax 10⁻¹³, half-filled coax 10⁻¹⁴ (exact C within 1.3 × 10⁻⁴), C39 9.3 × 10⁻⁴ (estimate 1.2 × 10⁻³), the pair
1.8 × 10⁻³ (estimate 5.0 × 10⁻³): the interface condition holds at collocation points only. φ inside copper within
5.4 × 10⁻⁵ V. Ampère and Σ J_s·dl: the current to 10⁻¹⁰.

| 1440 px view (grid, 2 px per point) | panels | first picture | grid | equipotentials | 24 field lines |
|---|---|---|---|---|---|
| C39 microstrip + mask (721 × 421) | 216 | 21 ms | 64 ms | 19 ms | 4 ms |
| pair + mask + coplanar ground, odd (721 × 402) | 636 | 28 ms | 99 ms | 13 ms | 5 ms |

Budget first ≤ 50 ms, full ≤ 300 ms: met (the solve itself is not included; it is M0.3's budget). At 1 px per point
(1441 points across) C39 takes 189 + 65 ms, the pair 281 + 54 ms (BL87).

## Zero-thickness copper

Decided both ways: setups keep refusing copper thickness 0 ("The copper thickness must be above 0.", `stackupIssues`),
and the solver now handles sheets right: a conductor edge made with `sheetEdge(…, epsP, epsM)` gets the free charge
s·(εP + εM)/2 + (εP − εM)·En per panel (`freeCharges`), in C and in the fields. Checked: equal to check-closedform's own
correction to 2 × 10⁻¹⁶, Z0 within 0.18 % of Hammerstad–Jensen at t = 0, Σ σ·dl = C.

## Open questions

- The budgets exclude the solve; a drag that changes the geometry pays solve + first picture (C39 ≈ 1 + 20 ms, the
  pair ≈ 16 + 28 ms), within the 100 ms "field map follows" of engine.md §10.
- Turbopack builds `static.worker.ts` as a worker chunk once a page imports `staticClient.ts` (tried with a temporary
  page, removed); no page does yet (M2.1b).
