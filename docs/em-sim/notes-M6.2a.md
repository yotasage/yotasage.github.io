# EM simulation – notes of step M6.2a (2026-11-17)

The full-wave time loop on the CPU, `lib/emsim/fdtd/cpu.ts` ([modules-fdtd.md](modules-fdtd.md)); checks in
`check-fdtd-cpu.mjs`, group "FDTD CPU loop (M6.2a)" (47 checks, about 40 s; 53 118 in all, `npm run check` 2 min 34 s).
Harness only, no page work.

## Conformal cells (BL147): the scheme was stable, the energy sum was wrong
The Yu–Mittra rule of fullwave.md §4 (H update takes E·f on a cut edge, face area whole, E update unchanged) is the
pair M_e·dE/dt = Kᵀ·H, M_h·dH/dt = −K·E with K = C·F (F = diag f). It is adjoint, so energy-conserving, in the inner
product with **M_e = ε·V_E·F**: Kᵀ = F·Cᵀ, and M_e⁻¹·F·Cᵀ = (ε·V_E)⁻¹·Cᵀ is exactly the unchanged E update. M6.1's
`ref.ts` summed ε·V_E·E² with f = 1 on the cut edges, hence its 3·10⁻³ "drift". With f in the sum: **4.6·10⁻¹⁴ over
7 645 steps on the closed C44 via** (4 114 cut edges, least f 4·10⁻⁷; `EMSIM_FDTD_LONG=1`), 1.5·10⁻¹⁴ on a hand-made
box with a barrel, both from random fields. Stability: the iteration matrix is (ε·V_E)^-½·F^½·Cᵀ·M_h⁻¹·C·F^½·(ε·V_E)^-½,
whose norm is at most the uncut one's (‖F^½‖ ≤ 1), so the Courant Δt holds unchanged.
**Cost: none** (no Δt reduction, no clamped fractions, no accuracy given up). `ref.ts`'s `energy()` now weights by f
and check-fdtd-mesh's via tolerance is 10⁻¹⁰ (was 1 %).

E on a very short edge is the field in a narrow gap between a node and the barrel and may reach several times the field
elsewhere (bounded: ε·V·f·E² ≤ W). |f·E| (the edge's voltage per cell length) and |H̃| stay within 3× their initial
values over 7 645 steps. **For M6.2b's snapshots:** show f·E on cut edges, or interpolate from whole edges.

## The loop (for M6.2b and M6.3)
- `new CpuLoop(problem, { sources, monitorEvery = 100, sourceEnd, stopDb = 50, maxSteps })`; `run(chunk)` returns
  the steps done and stops when `status` leaves `'running'`: `'settled'` (W 50 dB under its maximum after
  `sourceEnd`), `'unstable'` (W negative, not finite, or 2× its least after `sourceEnd`), `'done'` (`maxSteps`).
  The worker calls `run(n)` with n from a time budget and posts progress between chunks; `step` and `energy` ([step, W])
  are public. `measure()` is one step that returns W.
- One step: E·f on cut edges, H, H's ψ, E restored, E, E's ψ, sources at (n + ½)Δt. After `run`, E is at step·Δt and
  H at (step − ½)·Δt: the records of M6.2b read v after the step and i (from H) at the half step, as notes-M6.1 says.
- Sources: `{ idx, w, wave(t) }`; `portSources(problem, drive)` makes the ports' (src × pulse, drive weights per
  port: [1] port 1, [1, −1, …] a differential pair); `pulseEnd(problem)` = t0 + 5σ for `sourceEnd`.
- Energy monitor: summed inside the E update on monitor steps (no extra copy of E), εr per edge from (1 + CA)/(2·CB)
  (exact with loss and port loads). In the CPML slabs it is only an indicator (BL149).
- CPML ψ: x and y slabs per (position, z node or half) tables as cpml.ts lays them out; ψ uses c0Δt/Δ without κ
  (κ is in the main update's factors). `cpml.ts` gained `cpmlOf(mesh, dt, A, erAt)` (buildCpml unchanged).
- Kernels are plain functions compiled per instance with `new Function` from their own source (one array type per
  instance, §10). Precision is the problem's: `buildProblem(..., { precision: 'f32' })` gives the f32 variant.

## Numbers
- **Cavity resonances** (TM modes from an Ez pulse, Hann-windowed DFT of a probe, 16 384 steps): vacuum
  11.5 × 8.5 × 5.5 mm on 0.5 mm cubes, 8 isolated modes up to 50 GHz: against Yee's own dispersion relation
  (sin(ωΔt/2)/(cΔt))² = Σ (sin(k_a·h/2)/h)² within 2.7·10⁻⁷, against the exact frequencies within 0.49 of the bar
  (k·h)²/24; εr 4.3 cavity (about 9.2 × 6 × 1.2 mm) on a graded mesh (ratio ≤ 1.3), 8 modes up to 60 GHz: within 0.56 of the bar
  at the largest cell.
- **CPML** (8 cells, free space, the cell λ/15 at f_hi, a 20-cell box against a 100-cell one over the 174 steps the
  large box is clean): −92.8 dB at a probe 5 cells in front of a face, −84.7 dB at an edge, −74.6 dB at a corner (§5:
  −40 dB). The matched microstrip into the CPML is M6.2b's (with its ports).
- **f32 against f64:** driven microstrip with port loads and CPML 6.2·10⁻⁷ of the peak at the far port's probe; a
  lossless cavity over 10 000 steps 3.5·10⁻⁴ (f32's rounding of the 1D factors moves high-Q resonances; M6.3 should
  compare on lossy, open cases as §8's bar intends). The microstrip settles (−50 dB) 2 700 steps in, just after its
  pulse; Δt 16 % over the Courant limit is caught as unstable at the first monitor (W < 0).
- **Time** (Node, one thread, C44 via with CPML and ports, 712 320 cells, best of three): f32 about 16 ms per step per
  million cells (6·10⁷ cells/s), f64 about 20 ms (5·10⁷), against §10's 3·10⁷; so the C44 run is about 1.5 min in
  JavaScript. Single runs in the full check vary up to 2× with the machine's load. M6.3's calibration may raise
  `RATES.js` (not changed here: it drives M6.1's refusal checks).
