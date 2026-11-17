# EM simulation – notes of step M6.4b (2026-11-17)

BL150: the full-wave microstrip's εeff from γ was 4.1 % over the 2D solver's (3.433 against 3.298) while openEMS reads
+0.9 % on the same line. Found, fixed in `materials.ts`, `model.ts`, `cpu.ts`, `ref.ts`, `gpu.ts`/`gpuKernels.ts`;
harness only, nothing on the page.

## How it was found
The FDTD on a line is, at low frequency, two static problems on the mesh's cross-section: C on the electric links
(ε·D/(f·d) with the conformal f, as the scheme's energy weighs E by f) and L on the magnetic links (Hz beside an Ex
edge, Hx beside an Ez one: D/(A·d), A = 1 for Yu–Mittra). A small solver of both on `p.mat` at one y (scratch script,
not kept) reproduces the FDTD: Yu–Mittra 51.59 Ω / 3.411 against the FDTD's 51.54 / 3.433 (the run adds about
+0.6 % εeff: the line's dispersion at f_S/8…f_S/4 and the γ fit). Then each idea took seconds, not a run.

| Experiment (2D statics of the mesh, default microstrip unless named; 2D solver 51.50 Ω / 3.298) | Z0 | εeff |
|---|---|---|
| as M6.2b (thirds rule, conformal edge, Yu–Mittra H) | +0.19 % | **+3.43 %** |
| lines on the edges (no cut edges) | −4.8 % | −1.9 % |
| H faces by their area A (Dey–Mittra) | −2.12 % | −1.28 % |
| stripline: Yu–Mittra / Dey–Mittra (εeff must be exact) | +0.90 / −1.36 % | **+4.64 / 0.00 %** |
| Dey–Mittra, conformal edge δ·h inside: δ 0.05 / 0.1 / 0.15 / 0.333 | −1.4 / −0.61 / +0.09 / +1.9 % | −1.4 / −1.5 / −1.6 / −2.0 % |
| Dey–Mittra, 8 / 16 / 32 cells across, HMIN 10 / 5 / 2.5 µm | −0.93 / −0.86 / −0.66 % | −1.1 / −0.70 / −0.76 % |
| Dey–Mittra, 4 cells across, 16 cells (5 µm) under the trace | +0.79 % | −1.19 % |
| Dey–Mittra, 4 cells across, 8 cells (11.5 µm) under the trace | −0.10 % | −1.15 % |
| Dey–Mittra, HMIN-sized cells beside the copper faces | −1.11 % | −0.70 % |
| PEC against open walls of the box | 0.01 % | 0.02 % |

## The cause
Yu–Mittra shortens a cut edge in the H update but keeps the face whole, so the magnetic link keeps its full length: L
sees a staircased conductor while C sees the conformal one. On the microstrip both L and C came out about 2 % high (Z0
right by chance, εeff +4 %); on a stripline εeff is +4.6 % where the scheme must be exact. fullwave.md §4's argument
(the area division does not enter a static field) holds for the electric side only.

## The fix and its cost
- **Dey–Mittra areas:** every H face with a cut edge on its rim divides its update by A, its area outside the copper
  (`faceAreas`, 8 sample lines; a face in a copper face's plane counts the copper there); the energy weighs H by
  A·V_H, so the scheme stays conserving (closed C44 via 7.5·10⁻¹⁴ over 300 steps; check-fdtd-cpu's loop = ref.ts).
- **Floor:** a light H between two E has a mode at 1/(A·(2 − A)) of the band's top; `areaFloor` keeps that, on both
  sides of the face, under the Courant number 0.95 of the face's cell. Δt unchanged. Trace faces keep A (0.63–0.95),
  barrel faces go down to 0.085 (7 466 faces on the C44 via). Power iteration of the scheme: ρ = √λ·Δt/2 = 0.614 on
  the microstrip with or without the areas, 0.613 on the C44 via (stable below 1).
- **Edge inset:** with A the strip's Z0 fell to −2.1 %: the dielectric under the trace has 4 cells of 20 µm (HMIN),
  the corners act wider (8 cells: −0.1 %, but Δt halves). `EDGE_INSET` = 1/8: the copper of a thirds-rule trace is its
  rect inset by h/8 a side, the lines stay at the true edges' thirds. Calibrated on the default microstrip (BL163).
- **Cost:** two short loops over the faces per step (save, apply); WebGPU 13 dispatches per step instead of 11; the
  GPU still agrees with the CPU to 10⁻⁶ of the peak (|ΔS| ≤ 6.2·10⁻⁵, TDR ≤ 10⁻⁵ Ω).

## New numbers
| Case | Before | After |
|---|---|---|
| default microstrip 6 mm, FDTD f32: TDR Z0 (2D 51.50 Ω) | 51.54 Ω (+0.07 %) | **51.32 Ω (−0.36 %)** |
| same, εeff from γ (2D 3.298) | 3.433 (+4.1 %) | **3.269 (−0.88 %)** |
| statics: pair-microstrip 0.12 odd / even Z0 | −0.17 / +0.04 % | −0.74 / −0.42 % |
| statics: pair odd / even εeff | +3.44 / +3.22 % | −2.12 / −1.29 % |
| statics: stripline Z0 / εeff | +0.90 / +4.64 % | +0.51 / 0.00 % |
| statics: microstrip w 0.3 Z0 / εeff | +2.78 / +1.13 % | +1.67 / −1.04 % |
| C44 via, FDTD f32, port 1: TDR (35 ps) range over 0…60 ps / feed εeff (2D 3.298) | 56.45–60.08 Ω / 3.311 | 55.48–59.12 Ω / 3.306 |

The pair's modal εeff is not measured by the run harness (one γ per feed, BL155), so its bar is shown on the statics
only. The narrow microstrip (w 0.1, mean 0.091 mm) is below the thirds rule's HMIN limit and keeps lines on its edges
(−3.9 % Z0): BL163.

## For M6.4c
- Compare our via fixtures with the areas on (they change the barrels' magnetic side, see the via row above). The
  feeds of the via model still have lines on their edges (BL153, not touched), so their Z0 is about 5 % low.
- Expect our trace εeff about 1 % under the 2D solver and openEMS about 1 % over: part is the model's flat mask beside
  the trace (BL164), part is openEMS's mesh. check-fdtd-run.mjs now bars each port's εeff at 1.5 %.
