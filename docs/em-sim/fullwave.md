# EM simulation – full-wave solver (step M0.4a, 2026-11-16)

How the 3D FDTD solver of D5 (engine.md §7) is built: mesh, materials, round barrels, CPML, ports, outputs, numbers,
the WebGPU and JavaScript backends, the estimator, and how the harness runs WebGPU code. Each decision has its reason
and, where it was measured, the number. Where this file and engine.md disagree, this file wins (engine.md §1). The
openEMS installation, its interface and the fixtures are step M0.4b and go in the last section.

**Measurements** come from the spike in `scripts/harness/emsim/spikes/` (`yee.mts`: problem, JavaScript and WGSL
kernels; `yee-gpu.mts`: WebGPU host code; `barrel2d.mts`: the round-barrel test; `fdtd.mts`: the command) and the
harness's WebGPU runner `scripts/harness/emsim/webgpu/` (§12). Run `npm run spike:fdtd` in `scripts/harness/emsim`
(about 2 minutes; `barrel`, `js` or `gpu` as an argument runs one part). Machine: the owner's PC, AMD Ryzen 9 7950X,
AMD Radeon RX 7900 XTX, 31 GB RAM, Edge 157, Node 26. The spike is throwaway code; M6.2 and M6.3 may copy its kernels
after reading them.

## 1. Answers to engine.md's "M0.4 decides" and the scope of M0.4

| Question | Answer (section) |
|---|---|
| Mesh grading, smallest cell, thin copper and mask (engine.md §7) | Graded Cartesian mesh, neighbour ratio ≤ 1.3, smallest cell 20 µm; copper ≥ 20 µm thick is a PEC volume, thinner a sheet; mask and thin dielectrics averaged into the edges, not meshed (§2, §3) |
| Round barrels: conformal cells or a fine mesh (engine.md §7, line 127) | **Conformal** (shortened-edge rule of Dey–Mittra / Yu–Mittra, without time-step reduction) at 6 cells per drill diameter: Z0 error ≤ 0.5 %; a staircased barrel is still 4 % off at 32 cells (§4) |
| CPML | 8 cells, polynomial order 3, σmax = 0.8·(m+1)/(η0·Δ·√εr), κmax = 4, α from 0.05 S/m to 0 (§5) |
| Ports, source, feed lines, de-embedding | Lumped resistive port R = the feed's Z0 (2D solver) at the end of a feed trace; Gaussian pulse (baseband); two measurement planes per feed; waves from v and i; de-embedding with γ fitted from the two planes (§6) |
| TDR from incident and reflected waves | Γ(f) = B/A in f64, times the Gaussian edge of the page's rise time, inverse transform, step response; same edge as the via model (§7.2) |
| DFT | Stored port time signals (f32 on the GPU, f64 on the CPU), DFT after the run at any frequency; no running DFT in phase 1 (§7.1) |
| Snapshots | ≤ 3 slices, one component, about 300 frames, int8 with a per-frame scale, ≤ 64 MB (§7.3) |
| f32 strategy | Fields and coefficients f32; H stored as η0·H; time, coefficients, port integrals' sums, DFT, TDR in f64 on the CPU; measured f32 error 7·10⁻⁶ of the peak after 2000 steps (§8) |
| Buffer layout, workgroups | One buffer per field (E, H) with the three components as blocks, per-edge coefficient arrays CA, CB; workgroup 64×4×1 over (i, j), z by the dispatch (§9) |
| Dispatch splitting, adapter limits | Steps per submit so a submit takes about 30 ms (≥ 10 steps), at most two in flight; request the adapter's `maxBufferSize` and `maxStorageBufferBindingSize` (§9) |
| Estimator and refusal | Cells, steps, memory, time from a calibration run on the real mesh; refusal rules in §11 |
| JavaScript fallback | One worker, Float32Array, about 3·10⁷ cell updates per second here; no threads in phase 1 (§10) |
| WebGPU types (plan.md D12, "M0.4 decides") | `@webgpu/types` (BSD-3-Clause) as a dev dependency, referenced only by the full-wave GPU module (§9.5) |
| How the harness runs WebGPU code | Node server on 127.0.0.1:3023, esbuild bundle, headless Edge by Playwright: adapter found headless (§12) |
| Run time of a 2 M-cell via run | WebGPU about 3 s, JavaScript about 10 min on this PC (§11.3) |

## 2. Mesh

- **Yee scheme** on a graded Cartesian (tensor-product) mesh in the board frame (engine.md §1: x, y in the board,
  z up). One global time step.
- **Mesh lines** (M6.1 builds them): every copper edge of traces and sheets (x or y), every copper and dielectric
  surface (z), the ports and measurement planes, and a uniform **barrel block** around each via (§4) from the axis out
  to the largest of pad, antipad and return-via ring plus two cells. Between fixed lines, cells grow by a ratio
  **≤ 1.3 per neighbour** (engine.md) up to the largest cell.
- **Largest cell:** λ/15 in the highest εr at f_hi = 0.877/tr_min, the frequency where the TDR edge of the smallest
  rise time is at −20 dB (facts-formulas.md §8: 2.58·f3, f3 = 0.34/tr). At tr_min = 35 ps and εr 4.4 this is 0.38 mm;
  it rarely binds, the geometry does.
- **Across a trace:** at least 4 cells across the width and 3 across the gap of a pair, copper edges on mesh lines
  (M6.1's invariant). If M6.2's microstrip misses its 1 % bar, the first remedy is openEMS's "thirds rule" (lines at
  h/3 inside and 2h/3 outside an edge), not a finer mesh.
- **In z:** at least 4 cells across a dielectric that lies between a signal trace of the structure and its reference
  plane, 2 across other layers.
- **Smallest cell: 20 µm** in any direction. It sets the time step, so nothing thinner is meshed: thinner copper
  becomes a sheet, the solder mask (10–30 µm) and thinner dielectrics are averaged into the edges (§3).
- **Time step:** Courant number **0.95** of the 3D limit with the smallest dx, dy, dz:
  Δt = 0.95/(c0·√(dx⁻² + dy⁻² + dz⁻²)). The margin covers f32 coefficients and graded cells; the conformal rule of §4
  does not lower it.

## 3. Materials and copper

- **Copper is PEC.** A PEC edge has CA = CB = 0 (§9). Copper of thickness t ≥ 20 µm (outer layers, 1 oz inner
  layers) is a **volume** between two mesh planes, so heights stay exact; thinner copper (0.5 oz inner layers) is a
  **sheet** on its mid-plane: the tangential E edges in its outline are PEC. The half thickness moved into the
  dielectrics on each side (≤ 10 µm) is an assumption id the page states.
- **Planes** are sheets or volumes by the same rule; antipads and pads are circles in them, with the conformal rule
  of §4 (in the sheet's plane).
- **Dielectrics:** constant εr per layer. An E edge whose dual face lies in several materials takes the area-weighted
  **arithmetic mean** of εr if the edge is parallel to the interfaces (tangential) and the length-weighted **harmonic
  mean** if it crosses them (normal). This is how the solder mask and layers thinner than a cell enter: by their
  share of the cell, without a mesh line of their own (mask over a trace: the cells above the trace top).
- **Loss:** tanδ as a conductivity σ = 2π·f_tan·ε0·εr·tanδ at the stackup's stated frequency (1 GHz if none),
  flagged (engine.md §7); CA = (1 − a)/(1 + a), CB = (1/εr)/(1 + a) with a = σΔt/(2ε0εr). Dispersive media are
  phase 2. Copper loss is not modelled in phase 1 (PEC), stated on the page.

## 4. Round barrels: conformal cells

**Decision:** barrels (z-directed cylinders), and the circular edges of pads and antipads in sheets, use the
**conformal shortened-edge rule**: in the H update of a face cut by a PEC surface, each E edge contributes E times its
length outside the conductor (f·h, 0 < f ≤ 1), edges wholly inside are PEC, and the sum is divided by the **full** face
area (Yu–Mittra's form of Dey–Mittra's scheme: no time-step reduction for small cut faces; Dey & Mittra, IEEE MGWL
1997, and Yu & Mittra, 2000/2001, not opened, as commonly described). The fractions f are computed once by M6.1 from
the exact circles. The barrel block of §2 has a uniform cell of **d/6** (d the drill diameter), never above the
largest-cell rule.

**Why:** the cross-section a z-directed TEM wave sees in the mesh is the static problem on the Yee nodes (E on the
edges in the x–y plane, ε·w/ℓ per edge). In it the shortened-edge rule is the Shortley–Weller boundary; the area
division where Dey–Mittra and Yu–Mittra differ does not enter a curl-free static field. The spike (`barrel2d.mts`)
solves it for the coax of a 0.3 mm drill in a 0.7 mm antipad (exact Z0 = 60·ln(7/3) Ω/√εr) on 8 grid offsets:

| Cells per drill | Staircase, mean / max error of Z0 | Conformal, mean / max |
|---|---|---|
| 4 | 31.8 % / 40.9 % | 0.92 % / 1.23 % |
| 6 | 19.6 % / 23.4 % | 0.42 % / 0.51 % |
| 8 | 16.0 % / 18.6 % | 0.24 % / 0.29 % |
| 12 | 10.3 % / 11.4 % | 0.11 % / 0.13 % |
| 16 | 7.7 % / 8.2 % | 0.06 % / 0.08 % |
| 32 | 3.8 % / 4.2 % | 0.015 % / 0.017 % |

Staircasing (nodes inside a conductor take its potential) converges at first order with a large bias (the barrel looks
thinner, the antipad larger); a nearest-node rule would halve the bias but keep first order. A fine mesh would need
far more than 32 cells per drill for 1 %, and every fine line in x and y runs through the whole height of the board
(tensor-product mesh), so it multiplies the cells and shortens Δt. The conformal rule is second order: **6 cells per
drill give ≤ 0.5 %**, 4 cells (the estimator's coarsest offer) 1.2 %. The error estimate the page shows for the barrel
is this table's max at the run's cells per drill. **M6.2 checks** the 3D implementation on a coaxial via (barrel in a
ring of returns or a solid antipad wall): TDR impedance within 1 % of the exact Z0 at 6 cells per drill.

## 5. CPML

Convolutional PML (Roden & Gedney 2000; parameters as commonly quoted in Taflove & Hagness, ch. 7, not opened) on
every open side; the parameter set M6.2 starts from, and tunes only if its reflection test fails:

- **Thickness 8 cells**, the cell size of the last mesh cell continued (no grading inside the CPML).
- **Grading** polynomial of order m = 3 for σ and κ; σmax = 0.8·(m + 1)/(η0·Δ·√εr), Δ the cell normal to the
  boundary, εr of the material that runs into the CPML at that point (per layer for the board's sides).
- **κmax = 4** (absorbs the evanescent near field of the board's edge), **α** linear from αmax = 0.05 S/m at the inner
  face to 0 at the outer face (a corner frequency near 0.9 GHz; keeps the low-frequency response of the TDR's late time).
- **Placement:** board layers and planes run into the CPML (the plane cavity is absorbed: the structure sees an
  infinite board, as the via model assumes). Copper of the structure stays ≥ max(1 mm, 5·h) from the CPML
  sideways and ≥ max(1 mm, 10·h) above and below the outer layers (h the thickest dielectric next to a trace); ports
  ≥ 5 cells from it. The outer face of the CPML is PEC.
- **Implementation:** ψ arrays only in the six slabs (two per E or H component tangential to the slab's normal
  axis: 4 for E, 4 for H per slab cell), updated by separate correction kernels after the main H and E kernels, so the
  main kernels have no branches for the CPML.
- **Check (M6.2):** a matched microstrip running into the CPML reflects less than −40 dB up to f_hi.

## 6. Ports, source and feed lines

- **Lumped port** at the far end of each feed trace: the z edges under the trace's end, from the trace to its
  reference plane, in parallel across the trace width; each column a resistive voltage source (the standard lumped
  source term in the E update of those edges). **R = Z0 of the feed line from the 2D solver** (Zodd for each line of a
  pair), so the incident wave is absorbed and the run settles fast; S-parameters are renormalised to the page's
  reference (50 Ω or 100 Ω differential) afterwards.
- **Source:** a **Gaussian pulse** (baseband: TDR needs DC and low frequencies; a modulated Gaussian has none). Its
  width follows the smallest rise time the run must serve, tr_min (the page's rise time): the run's top frequency is
  f_run = 1.52/tr_min, where the Gaussian TDR edge of tr_min is at −60 dB (facts-formulas.md §8: 4.46·f3); the pulse
  has σ = 3.717/(2π·f_run) (−60 dB at f_run) and its peak at t0 = 5σ. Every rise time ≥ tr_min is then served by
  post-processing without a new run. Example: tr_min = 35 ps → f_run = 43 GHz, σ = 13.7 ps.
- **Feed length** from port to via: L = max(1.5 mm, 10·h, 5·w); the port's and the via's near fields decay over a few
  h. The incident and reflected waves need not separate in time: they are separated by v and i (below).
- **Measurement planes:** two per feed, at L/3 and 2L/3 from the port. Voltage v = −∫E·dl from the plane to the trace
  at the trace's centre, current i = ∮H·dl around the trace (both are short sums over edges, done on the GPU each
  step, §7.1). Waves a = (v + Zr·i)/2, b = (v − Zr·i)/2 with Zr the 2D solver's Z0 of the feed.
- **De-embedding** to the via's reference plane: the propagation constant γ(f) of the feed is fitted from the
  forward waves at the two planes (it carries the mesh's own dispersion, so the de-embedding does not add mesh error);
  then multiplied by e^{γℓ} over the remaining length. Flag if γ's εeff differs from the 2D solver's by more than 1 %.
- **Pairs:** single-ended ports on both lines. Default two runs, differential and common excitation at the near
  side (Sdd11, Sdd21, Scd11, Scd21, Sdc…, Scc… by the mixed-mode transform); all four sides on request (four runs).

## 7. Outputs

### 7.1 S-parameters by DFT of stored time signals
Per step the GPU writes v and i of every measurement plane (4 numbers per port) into a record buffer; the host reads
it back after each submit and keeps it in **f64**: 10 000 steps × 4 ports × 4 values × 8 B = 1.3 MB. After the run, the
DFT is evaluated in f64 at any frequency list (no frequency grid: once the signals have decayed, the transform of the
whole record is exact). S-parameters are reported up to f_S = 0.816·f_run, where the excitation is at −40 dB (above it,
f32 noise divided by a small incident wave grows). A running DFT on the GPU is only needed for frequency-domain field
maps, which are phase 2.

### 7.2 TDR and TDT
From the same record: A(f), B(f) on a uniform grid 0…f_run with Δf = 1/(4T) (zero padding), Γ = B/A, times the
Gaussian edge G(f) = exp(−(2πfσtr)²/2) with σtr = tr/2.563 (10–90 % rise tr, facts-formulas.md §8), inverse FFT,
cumulative sum: the step response ρ(t); Z(t) = Zr·(1 + ρ)/(1 − ρ). TDT the same with S21. G is the only window; it is
−60 dB at f_run for tr = tr_min and smaller for slower edges. This is the definition of engine.md §6.6, so the via
model's TDR and the full-wave TDR are overlaid without a conversion.

### 7.3 Snapshots for the animation
- **Slices:** up to 3 (default: x–z and y–z through the via axis, x–y at the signal layer), one component chosen
  before the run (Ez, Ex, Ey, or |E| at the nodes).
- **How often:** every k = ⌈N_steps/300⌉ steps, about 300 frames per run (12 s at 25 fps), submits aligned to frames.
- **Format:** a gather kernel copies the slice (f32) into a staging buffer, read back with the submit; the worker
  quantises it to **int8 with a per-frame f32 scale** (u8 for |E|) and keeps the run's maximum for the fixed colour
  scale (engine.md §9). A 300 × 150 slice is 45 kB per frame; 3 slices × 300 frames = 40 MB. Budget **≤ 64 MB**; the
  estimator lowers the frame count to fit.
- f16 storage (the adapter has `shader-f16`) is not needed: int8 is enough for a linear colour scale.

### 7.4 Monitors
Every 100 steps a reduction kernel sums the field energy (f32 partial sums per workgroup, f64 on the host). It gives
the **stop rule** (energy below −50 dB of its maximum after the source has ended: stop early) and the **stability
check** (energy rising after the source has ended, or a non-finite port value: abort with a message). The run's
length T (§11.1) is the cap.

## 8. Numbers: f32 and f64

- **f32** for fields and coefficients on the GPU and in the JavaScript run (engine.md §1). H is stored as **η0·H**, the
  same magnitude as E, so both use f32's relative precision alike; the updates then read
  E ← CA·E + CB·(c0Δt/Δ)·curl H̃ and H̃ ← H̃ − (c0Δt/Δ)·curl E.
- **f64 on the host:** the mesh, Δt, the coefficients before rounding to f32, the time t = n·Δt (never accumulated),
  the port record after readback, every DFT, the TDR, de-embedding and the energy sums.
- **Measured** (`npm run spike:fdtd`, 96 × 64 × 48 cells, dielectric half-space with loss, a PEC sheet, 2000 steps,
  max |difference| over the probe trace relative to its peak; final field relative to its maximum):

| Pair | Probe trace | Final Ez field |
|---|---|---|
| JS f32 vs JS f64 | 7.3·10⁻⁶ | 6.9·10⁻⁵ |
| WebGPU f32 vs JS f32 | 6.3·10⁻⁶ | 1.2·10⁻⁴ |
| WebGPU f32 vs JS f64 | 9.7·10⁻⁶ | 7.3·10⁻⁵ |

  WebGPU and JavaScript f32 agree to rounding (they round differently: JavaScript computes in f64 and stores f32;
  WGSL rounds every operation and may fuse). The f32 error is −100 dB of the peak, far below the mesh error.
- **Bar for M6.3** (WebGPU against the CPU backend on M6.2's cases, per 10 000 steps): port signals within 10⁻⁴ of
  their peak, |ΔS| ≤ 10⁻³ up to f_S, TDR impedance within 0.05 Ω. The harness's reference runs the JavaScript kernel in
  f64.

## 9. WebGPU backend

### 9.1 Buffers
- **E** and **H**: one storage buffer each, the three components as contiguous blocks [x | y | z] of N = nx·ny·nz
  (structure of arrays), cell c = i + nx·(j + ny·k). This overrides engine.md's "one storage buffer per field
  component": the bindings stay ≤ 8 (the default `maxStorageBuffersPerShaderStage`; this adapter has 16) and a slice
  copy is one call.
- **CA, CB:** per-edge coefficients, same layout (PEC edges 0, lossy and averaged edges their own values): 24 B per
  cell. Mesh spacing enters as six 1D arrays of c0Δt/Δ per mesh line (one small buffer), so the graded mesh costs
  nothing per cell and H needs no per-cell array.
- **Memory:** 48 B per cell (E 12, H 12, CA 12, CB 12) + CPML ψ (32 B per CPML cell, §5) + port record (ring of 64
  steps) + snapshot staging. 2 M cells: 96 MB plus ψ.
- A ghost node plane at index 0 and coefficients that vanish outside the domain make the kernels branch-free apart
  from one range test (the spike's convention, `yee.mts` head).

### 9.2 Kernels and workgroups
Per step: H, H-CPML, E (with the lumped port sources), E-CPML, then one single-thread kernel for the port record,
source sample and step counter (a counter in a storage buffer, so many steps fit in one command buffer without
writing uniforms between them). **Workgroup 64 × 4 × 1** over (i, j), z by the dispatch's third dimension: coalesced
along x, every dimension far under `maxComputeWorkgroupsPerDimension` (65 535). One sensible version, not tuned.

### 9.3 Dispatch splitting
All dispatches of K steps go into one compute pass and one submit; **K = clamp(⌊30 ms / t_step⌋, 10, 500)** from the
calibration (§11.2), at most **two submits in flight** (`onSubmittedWorkDone`), progress and cancel between submits.
30 ms is far below the Windows GPU watchdog (2 s) and keeps the page responsive. Measured on 2.1 M cells: 1 step per
submit 1.3·10⁹ cells/s, 10 steps 5.8–6.5·10⁹, 50 steps 6.0–6.8·10⁹; at 8.4 M cells and 10 steps the longest submit
took 50 ms. A lost device stops the run and falls back to the JavaScript backend with a message (M6.3).

### 9.4 Adapter and limits
Request `powerPreference: 'high-performance'` and, as required limits, the adapter's **`maxBufferSize`** and
**`maxStorageBufferBindingSize`**; no optional features. Recorded here (headless Edge 157):

| Item | Value |
|---|---|
| `adapter.info` (high-performance and low-power alike) | vendor `amd`, architecture `rdna-3`, description empty (Chromium hides it) |
| `maxBufferSize`, `maxStorageBufferBindingSize` | 2 147 483 648, 2 147 483 644 |
| `maxStorageBuffersPerShaderStage`, `maxComputeInvocationsPerWorkgroup` | 16, 1024 |
| `maxComputeWorkgroupsPerDimension`, `maxComputeWorkgroupStorageSize` | 65 535, 32 768 |
| Features of note | `shader-f16`, `subgroups`, `timestamp-query` |

### 9.5 Types (plan.md D12)
**`@webgpu/types`** (BSD-3-Clause, by the W3C GPU for the Web group) as a devDependency of the site, referenced with
`/// <reference types="@webgpu/types" />` only in the full-wave GPU module; types only, nothing at run time, so D12's
"no new runtime dependency" holds. A hand-written subset would drift from the browsers. M6.3 adds it (licence checked
here; `npm install` updates the licence list, which ignores type-only packages).

### 9.6 Measured rates (spike, bare E and H update with per-edge coefficients)

| Cells | WebGPU f32 | JS f32 (Node, one thread) | JS f64 |
|---|---|---|---|
| 0.52 M (128 × 64 × 64) | 3.1–3.2·10⁹ /s | 2.8–3.5·10⁷ /s | 3.0–3.4·10⁷ /s |
| 2.10 M (128³) | 5.8–6.5·10⁹ /s | 3.0–3.4·10⁷ /s | 2.9–3.4·10⁷ /s |
| 8.39 M (256 × 256 × 128) | 3.7–4.2·10⁹ /s | 3.1–3.4·10⁷ /s | 2.9–3.2·10⁷ /s |

(cell updates of E and H per second; 10 steps per submit; the range of two runs of `npm run spike:fdtd`). The GPU kernel moves about 100 B per cell and step, so
6.5·10⁹/s is about 650 GB/s: memory-bound, helped at 2 M cells by the 96 MB cache, which 8 M cells (400 MB) overflow.
The small grid is limited by dispatch overhead. JavaScript is compute-bound (f32 and f64 alike).

## 10. JavaScript fallback

The full-wave worker runs the same layout in Float32Array (Float64Array for the harness's reference), one thread:
**about 3·10⁷ cell updates per second** (2.8–3.5·10⁷) on this PC (V8, as in Edge). Kernels are built with `new Function` per
precision so V8's feedback stays monomorphic; passing the arrays as parameters or as closure variables made no
difference. Several workers would need SharedArrayBuffer, which needs COOP/COEP headers that GitHub Pages cannot send
(the service-worker shim and WebAssembly SIMD are phase 2, D5). A phone at the × 4 CPU throttle: about 10⁷/s.

## 11. Estimator

### 11.1 Static part (M6.1)
- **Cells** N including the CPML; **memory** per §9.1 (GPU) or the same in typed arrays (JavaScript).
- **Steps:** T/Δt with Δt from §2 and **T = 10σ + 3·τrt**: the excitation (start to end, §6) plus three round trips
  τrt of the longest port-to-port path (feeds and via, each at its own √εeff). The ports are matched, so three round
  trips leave the reflections far below −40 dB; the energy stop rule (§7.4) ends sooner when it can, and T is the cap.
- **Time** = N·steps·overhead/rate, overhead 1.5 for CPML, ports and records over the bare update (checked by M6.3).

### 11.2 Calibration
The rate is not taken from a table: before the first run of a session (and when the mesh is 4 × larger than the last
calibrated one) the backend runs **10 warm-up steps and 30 timed steps on the real mesh**, CPML and ports included
(< 1 s on a GPU, a few seconds in JavaScript), and the estimate uses that rate × 1.1. The table of §9.6 is only the
estimate shown before the calibration finishes. M6.3's bar: the 2 M-cell via run within 2× of the estimate.

### 11.3 The 2 M-cell via run on this PC
Smallest cells 50 µm in x and y (0.3 mm drill at 6 cells) and 25 µm in z: Δt = 64.7 fs. Feeds 2 × 3 mm at εeff 3.2
and a 1.6 mm via at εr 4.3: τrt = 93.7 ps; tr_min = 35 ps: 10σ = 138 ps; T = 419 ps, **6475 steps**. With overhead 1.5:

| Backend | Rate (2.1 M cells) | Estimated run |
|---|---|---|
| WebGPU f32 | 5.8–6.5·10⁹ /s | **3.0–3.4 s** |
| JavaScript f32 worker | 3.0–3.3·10⁷ /s | **9.7–10.9 min** |
| JavaScript f64 (harness reference) | 2.9–3.4·10⁷ /s | 9.6–11.0 min |

engine.md §10 sets no fixed target for this run (only the estimator within 2×), so the budget is reachable; a run is
short enough on WebGPU to be redone while the via is edited, and the JavaScript fallback is a wait, not a blocker.

### 11.4 Refusal rules
- Any buffer over the adapter's `maxBufferSize` or binding over `maxStorageBufferBindingSize`: refuse and offer a
  coarser mesh.
- Total memory over **1 GiB** on WebGPU (WebGPU does not expose the GPU's memory) or over **256 MiB** when the adapter's
  `maxBufferSize` ≤ 256 MiB or the device is a phone (`navigator.userAgentData.mobile`); JavaScript over 1 GiB, or
  300 MB on a phone or with `navigator.deviceMemory` ≤ 4.
- Estimated time over **5 min**: warn and offer a coarser mesh; over **60 min**: refuse and offer it.
- The offer scales every cell by s (cells ∝ s⁻³, steps ∝ s⁻¹, time ∝ s⁻⁴) to reach 5 min, but never below 4 cells per
  drill (1.2 % barrel error, §4) or 2 cells per dielectric; the page shows the error that costs.

## 12. How the harness runs WebGPU code

`scripts/harness/emsim/webgpu/runner.mjs` exports `withWebGpuPage(entry, fn, { timeoutMs, log })`: it bundles the
browser entry (`.mts`) in memory with the esbuild that `tsx` brings, serves it with the harness-only page `index.html`
from a Node HTTP server on **127.0.0.1:3023** (a secure context, so `navigator.gpu` exists), launches Edge through
`playwright-core` (`channel: 'msedge'`, flags `--enable-unsafe-webgpu --enable-features=Vulkan --use-angle=d3d11
--ignore-gpu-blocklist`), **headless first**, headed only if headless finds no adapter, waits for `__ready`, and calls
`fn(page, mode)` under a time limit; server and browser are closed in a `finally`. The entry exposes plain-JSON
functions on `globalThis` that the Node side calls with `page.evaluate`. On this PC **headless Edge has the hardware
adapter** (not a fallback adapter). M6.3's checks use the same runner with the product kernels as the entry.

## 13. Ideas for M6.3 (not done here)

- Material index per edge (u16 into a coefficient table) instead of CA/CB: 48 → 30 B per cell, about 20 % less traffic.
- Each thread walks a column in z, keeping the k−1 plane of H (E kernel) in registers: fewer loads, fewer index products.
- Fuse the step kernel's work into the E kernel's port columns; per-kernel timings with `timestamp-query`.
- For grids that overflow the GPU's cache (8 M cells), temporal blocking in workgroup memory.
- JavaScript: one loop per component (fewer live arrays), or WebAssembly SIMD (phase 2).

## 14. openEMS (M0.4b)

Written by step M0.4b: the openEMS installation (path, version), its interface, the fixture format and the first two
fixtures (a microstrip line and a through via).
