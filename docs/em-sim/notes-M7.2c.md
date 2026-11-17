# Notes from step M7.2c – the full-wave theory topic (content)

Done 2026-11-17. Docs only: no page code changed. The topic goes on the page in M7.2d.

## 1. What was written
- [theory-waves.md](theory-waves.md): §14 "Full-wave runs and the waves", id `full-wave`, sub-anchors `fw-why` (what the
  via model leaves out, when the Via section suggests a run), `fw-yee` (Yee's grid, leapfrog, the Courant limit, the
  run's length), `fw-mesh` (graded mesh, the largest cell, numerical dispersion, conformal barrels), `fw-edges`
  (CPML), `fw-ports` (lumped ports, the Gaussian pulse, a and b, S by DFT, de-embedding, TDR), `fw-cost` (cells ×
  steps, GPU against CPU, f32, the estimate), `fw-read` (|E| and components, the fixed scale at the 99.9th percentile,
  what a via's slices show), `fw-pair` (differential and common drive by superposition), `fw-3d`, `fw-checked`
  (openEMS, the frozen limits, what is left out). 72 sentences, claims ⟨242⟩–⟨313⟩, each a row in
  [claims.md](claims.md) (counts there). Its last table lists the short lines that should link to each anchor.
- [equations-list.md](equations-list.md) "New for full-wave runs": `fdtd-update`, `fdtd-courant`, `fdtd-dispersion`,
  `fdtd-cell`, `fdtd-pulse`, `fdtd-steps`, `fdtd-waves`, `fdtd-s`, `fdtd-cost` with steps (70 ids in all).
- [sources.md](sources.md) "Opened in M7.2c", `references.bib` (8 keys, parsed by `loadReferences()`), BACKLOG
  BL187–BL188.

## 2. Sources
| Key | Status | Cited for |
| --- | --- | --- |
| `WikiFDTD` | opened (revision 1383755497, through a summarising page reader; the last 8 % not read) | Yee lattice, leapfrog, explicit, CFL by von Neumann, dispersion, PML/CPML, broadband pulse, cost, GPUs |
| `OpenEMSDocs` | opened (Numerical method, Boundary conditions, Ports) | what openEMS is, step set by the smallest cell, staircase, PML 8 cells, lumped port, a = ½(V + ZI) |
| `Yee1966`, `CFL1928`, `RodenGedney2000`, `DeyMittra1997`, `PiketMay1994` | not opened (Crossref checked; no abstract on Crossref or Semantic Scholar) | only beside the opened source or the tool's own check named in the claim row |
| `TafloveHagness2005` | not opened (book) | beside `WikiFDTD` |
openEMS's front page and Excitations page added nothing citable.

## 3. Numbers checked
In Node (`tsx` on `fullwave.ts preview`, `fdtd/problem.ts buildProblem`, `fdtd/ports.ts pulseOf`, the default setup,
backend 'js'; the script stayed in the session's scratch folder):

| Case | Numbers |
| --- | --- |
| V at 35 ps | 712 320 cells; smallest cells 0.0500 / 0.0344 / 0.0204 mm, largest `hmax` 0.37393 mm (εr 4.55); Δt 52.444 fs; τrt 88.237 ps, T 400.93 ps, 7645 steps; 2 ports; 38.98 MiB; frames 9.41 MiB (6 slices: side E, Ez, Ex; entry, cavity, exit Ez; 294 frames, every 26 steps); table time 1.361 s (WebGPU) and 272.3 s (CPU) per port |
| V at 15 / 100 ps | 793 728 / 739 200 cells, 6161 / 12 469 steps (Δt unchanged) |
| C45 at 35 ps | 939 400 cells, Δt 50.137 fs, 7852 steps, 4 ports, 50.75 MiB, frames 24.40 MiB (Nx, Ny, Nz side; Ez entry, cavity, exit) |
| Default trace, 10 mm | 209 484 cells, 11 750 steps |
| Pulse | 15 ps: 101.33 GHz, σ 5.838 ps; 35 ps: 43.429 GHz, σ 13.622 ps, t0 68.109 ps, f_S 35.438 GHz; 100 ps: 15.2 GHz, σ 38.92 ps |
| Derived | 712 320 × 7645 × 2 = 1.0891·10¹⁰ updates; v/c at 15 cells per λ 0.99271; f_hi 25.06 GHz; 20 µm cube Δt 36.59 fs |

From `compare.json` (version 2, M6.5): via-c44 section Z openEMS 68.9219, FDTD 73.0969, model 67.9323, modelM64
49.7234 Ω; TDR max 61.9241 / 62.4355 Ω; at 20 GHz |S21| −2.70 / −2.61 dB, |S11| −4.79 / −4.82 dB (power out of
neither port 12.2 %); `valid` band 25.0116, fMax 20.7905 GHz; |ΔS| to 20 GHz 0.0924, staircased 0.0287; stub notch
21.6 / 22.9 / staircased 22.0 GHz; lvds Zdiff 103.388 / 102.413 / 2D 103.364 Ω. From earlier notes, quoted as
measured: 1.15 s / 340 s (M6.3), 4.2 s (M7.1a), 10.1 min (M7.1b), CPML −92.8 / −84.7 / −74.6 dB and the dispersion
relation within 2.7·10⁻⁷ (M6.2a), 43 limits with the worst at 0.82 (M6.4c).

## 4. For M7.2d
- **Page:** a `TheoryWaves.tsx` (or a section of `TheoryVias.tsx`) with §14 after §13, its ten sub-anchors as `subs`;
  citations through the shared `Bibliography` (new keys `WikiFDTD`, `OpenEMSDocs`, `Yee1966`, `TafloveHagness2005`,
  `CFL1928`, `DeyMittra1997`, `RodenGedney2000`, `PiketMay1994`). ui-theory's checks extend to the new anchors.
- **Live numbers:** before a run from `preview()` (`est.cells`, `est.dt`, `est.steps`, `est.T`, `est.tauRt`,
  `est.rate`, `snapBytes`) and `pulseOf(tr)`; the smallest cells and `hmax` are not in `Preview` (only in
  `buildProblem(...).mesh`): add them to `Preview` or show the bracketed values as static. After a run
  `res.records.ports[i].z0`, `res.nport`, `res.snap.frames`, `res.snap.every`. The topic may be read with no run: the
  bracketed V values then stand as the example.
- **Equations:** register the nine ids in `lib/emsim/equations*.ts`; steps marked "rule step" have no numeric check.
- **Figures** (static SVG in both themes unless named): a Yee cell (E on edges, H on faces); the leapfrog in time; a
  barrel staircased against conformal; links from `fw-read`, `fw-pair`, `fw-3d` to the live player (`#waves`, its
  `[data-waves-player]` and `[data-waves3d]`) rather than pictures of a run.
- **Short lines:** theory-waves.md's last table (waves-kind → `fw-why`, waves-tr → `fw-mesh`, waves-backend and
  waves-estimate → `fw-cost`, waves-progress → `fw-yee`, waves-plots and waves-notes → `fw-ports`, waves-checked →
  `fw-checked`, the player's lines → `fw-read`, waves-mode → `fw-pair`, the 3D lines → `fw-3d`, via-next → `fw-why`).
- **Stale text found:** the page's §13 (TheoryVias.tsx, claim ⟨204⟩) still says a full-wave solver "comes in later
  steps": change it to a link to `#full-wave`. theory-vias.md ⟨161⟩ still says 2 mm where the page says 1.5 mm.
- Left out: BL187 (open the papers), BL188 (a measured number for the pair drives).
