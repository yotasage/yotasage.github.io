# EM simulation – notes of step M6.3 (2026-11-17)

The full-wave engine's WebGPU backend, `lib/emsim/fdtd/gpu.ts` and `gpuKernels.ts`, the calibration and the fallback
in `job.ts` ([modules-fdtd.md](modules-fdtd.md)); checks in `check-fdtd-gpu.mjs`, group "FDTD WebGPU (M6.3)" (35
checks, about 70 s; 53 236 in all, `npm run check` about 4 min 20 s; `EMSIM_FDTD_LONG=1` 11 min 25 s). Harness only, no page work.

## Kernels and host
- **Kernels** (WGSL strings, §9.2): H, E, E with the energy sum (per-workgroup partials), ψ of E and of H per axis
  (both slabs of an axis in one dispatch), the conformal edges (`scale` E·f before H, `restore`, the monitor's
  `energy` correction), `reduce` (partials into a 64-slot ring), `post` (one workgroup: sources at (n + ½)Δt from
  waves sampled in f64 on the host, the record row of every probe into a ring, the step counter), `gather` (a frame's
  E edges). Same index layout and order as cpu.ts; 11 dispatches per ordinary step on the default cases.
- **Buffers** (§9.1): E, H, CA, CB [x | y | z] f32; L = [kE | kH | dE | dH | len | dual]; ψ and the CPML tables
  concatenated; META (sources, probes); the record ring of 2 048 rows; snapshot slots (≤ 64 frames, 32 MiB). At most
  6 storage buffers per kernel; every kernel but `post` reads a 256-byte dynamic-uniform slot (workgroup offset of
  its part, ring or frame slot, slab offsets).
- **Dispatch splitting** (§9.3): every dispatch is split to `maxComputeWorkgroupsPerDimension` (or a forced limit);
  K = clamp(⌊30 ms / t_step⌋, 10, 500) steps per submit, two in flight. One read-back per `advance` (record rows,
  energies, frames); `judgeEnergy` (cpu.ts, shared) then runs on the host and the rows end where the CPU would stop.
- **Device** (§9.4): high-performance adapter, its maxBufferSize and maxStorageBufferBindingSize required, no
  features; a software (fallback) adapter is refused. Loss and uncaptured errors are `GpuContext` events.
- run.ts drives either backend: `Excitation({ backend })`, `advanceAsync`, `runProblemAsync`; after the records
  everything is shared. Snapshots: `SnapRecorder.takeGathered` quantises the GPU's gathers as `take` does.

## GPU against CPU (fullwave.md §8 bar: signals 10⁻⁴ of the peak per 10 000 steps, |ΔS| 10⁻³, TDR 0.05 Ω)

| Case | Against | Signals / peak | \|ΔS\| to f_S | TDR |
|---|---|---|---|---|
| 6 mm microstrip, 2 runs (13 678 steps) | CPU f32 | 1.0·10⁻⁶ | 1.4·10⁻⁶ | 1.7·10⁻⁶ Ω |
| | CPU f64 | 8.6·10⁻⁷ | 2.3·10⁻⁶ | 1.3·10⁻⁶ Ω |
| C44 via, port 1, 3 000 steps | CPU f32 | 4.8·10⁻⁷ | 2.0·10⁻⁵ | 1.5·10⁻⁶ Ω |
| | CPU f64 | 8.7·10⁻⁷ | 6.8·10⁻⁵ | 1.0·10⁻⁵ Ω |
| C44 via, 2 runs to the cap (15 290 steps, LONG) | CPU f32 | 5.2·10⁻⁷ | 1.3·10⁻⁶ | 1.3·10⁻⁶ Ω |
| | CPU f64 | 8.7·10⁻⁷ | 1.0·10⁻⁶ | 9.4·10⁻⁷ Ω |

Same steps and status as the CPU on every run. A forced limit of 3 workgroups per dimension (495 dispatches per
step) gives the same records and frames bit for bit; GPU frames equal the CPU's (within 0 of a quantisation step). The C44 via's two runs take 1.15 s on the GPU and
340 s on the CPU (295×).

## Throughput and calibration
| Case | Cells | GPU cells/s (CPML, ports, records) | Spike §9.6 (bare update) | CPU f32 (Node) |
|---|---|---|---|---|
| 6 mm microstrip | 149 k | 3.2·10⁹ | – | 3.2·10⁷ |
| C44 via | 712 k | 8.5–9.4·10⁹ | 3.1·10⁹ (0.52 M) | 3.2–3.8·10⁷ |
| C45 pair | 957 k | 8.3–8.8·10⁹ | 5.8–6.5·10⁹ (2.1 M) | – |

The full loop beats the spike's bare kernel at these sizes (1 M cells fit the 96 MB cache); small meshes are bound by
the read-back per chunk and dispatch overhead (BL157). The CPU references ran four at once.

**Calibration** (§11.2): 10 warm-up and 30 timed steps on the real problem; when the 30 take under 50 ms (any GPU),
as many more as fill 50 ms are timed twice and the faster counts (`CALIB_MIN_MS`), K is set from the first figure.
The estimator's rate is the measured loop rate × 1.5 / 1.1 (`rateFromCalibration`), so the estimate is the
calibrated time × 1.1. Per backend and session; again for a mesh 4× larger *or smaller* (small meshes run slower
per cell on the GPU). **C45 pair, 4 runs, 31 808 steps: 3.46–3.65 s against estimates of 4.5–5.1 s (0.69–0.76×; bar
within 2×)**; the residual is the first submit's encoding and the read-back in a 50 ms timing (BL156). The 2 M-cell
via of §11.3 needs a mesh refinement option that does not exist; the C45 pair stands in.

## Fallback
- Backend choice in `job.ts`: WebGPU when `navigator.gpu` gives a hardware adapter, the run is f32 and fits the
  device (`gpuMisfit`: buffers and bindings; §11.4's GPU memory cap when the CPU's would pass); else the CPU. The
  first reply is `backend` with the reason ("This browser has no WebGPU.", "WebGPU found no GPU adapter.", "The run
  does not fit the GPU: …", "f64 runs on the CPU.", or "WebGPU (amd rdna-3)."). Checked for each.
- **A lost device or GPU error mid-run restarts the excitation under way on the CPU** (fullwave.md §9.3 decides:
  "falls back to the JavaScript backend with a message"): a `backend` reply with `restart` = that run (its rows and
  frames sent so far are void, rows come again from 0), finished runs keep their GPU records, the session stays on
  the CPU (BL159), and the CPU's own calibration and §11.4 decide whether the run goes on (refused otherwise).
  Checked by destroying the device after the first progress message: restarted, done, records within 10⁻⁴ of a GPU run.

## For M7
- `FdtdClient.run(job, { backend })`: show the backend line and its reason; on `restart` drop that run's rows and
  frames; `started.info` has `backend`, `rate`, `calibrated` and `seconds` per excitation (× runs for the job).
- The harness drives the handler on the page; M7's browser checks should run it in the worker (BL160).
- The estimator's GPU memory leaves out the frame slots and staging (BL158).
