# Notes from step M7.1a – the Waves section

Done 2026-11-17. Files in [modules-page-waves.md](modules-page-waves.md); browser check `ui-waves.mjs`.

## 1. The section
`#waves`, in the nav after Via, its own chunk (`useNearLoad`, like Export). What to run: **the via** with its feeds
(the setup's via, the trace as feeds, as `buildModel(setup, 'via')` makes them) or **the trace** as a straight section
of a typed length between the reference planes (the run adds a feed of L at each end: `length + 2·L` goes to the
model). Rise time 15 / 35 / 100 ps (the run's `trMin` and the TDR's edge); "GPU if it can" or "CPU" (`job.backend`).
Run, Cancel; a second Run cancels the first (`FdtdClient.run`). The section unmounts → `client.stop()`.

## 2. Estimate and backend
`fullwave.ts preview()` repeats job.ts's choice on the page: `buildProblem(…, { allocate: false })` (17 ms for C44,
4 ms for a trace), the adapter from `navigator.gpu.requestAdapter()` (no device on the page), `gpuMisfit`, then
`judge` with the rate measured by an earlier run on this device (`started.info`, kept in `measured` when within
`CALIB_RANGE` of its mesh), else §9.6's table — said in the text ("on this device (measured by the last run)" or
"from a typical rate; the run measures this device first"). Shown: backend line with the reason (acquireGpu's
sentences), cells, MiB, steps × excitations, **time = per-excitation seconds × ports** (a 4-port is four runs), the
§11.4 verdicts ("too big" / "note"), the coarser-mesh offer as text, errors and the BL161 note. Refused → Run disabled.
After the run: "Done in 4.2 s on the GPU (estimated 3.9 s)"; a worker refusal lists its verdicts.

## 3. The overlay
Both curves at the same ports: the run's S (`res.nport`, ports at the feeds' 2D Z) **moved by a phase per port** from
the run's reference plane (R from the barrel, `|pos − barrel| − L`) to the via model's feed end (pad radius + feed
length; C44 and C45: +0.90 mm), renormalised to 50 Ω, a 4-port to mixed mode (via [[0,1],[2,3]], trace
[[0,2],[1,3]]). TDR/TDT: tdr.ts on those S (complex-linear on the run's 401 points, 0 above f_S, the edge's level at
f_S) on the model's own time grid (`t0`, `dt`, `t1`, `half` of `q.tdr`). The model: the static worker's `via` job on
channel `waves` with `{ tr, z0: 50, nf: 401 }`. A single trace: the lossless line of the run's port Z and εeff.
Coupled traces: the run only (BL172). Notes: unstable, not settled (status 'done'), εeff flags, the run's warnings once
each. The engine's line quotes fullwave-verify.md §3. Results stay, marked stale (`data-stale`), until the next run.

C45 (fixture feeds) at 35 ps: Sdd TDR peak 102.5 Ω (model 100.5 at −15 ps, peaks lower), |Sdd11| −39 against −50 dB
at 3.6 GHz, |Sdd21| −0.003 dB; the model holds to 23.0 GHz.

## 4. When a run is suggested
`wavesSuggest.ts suggestFullWave`: feed over its antipad > 0.1 mm, `return-far`, `no-return` (also shown in the
not-ok result), the edge's band above the model's (`band > valid.fMax`: the default 35 ps edge on C44 fires it), a
stub resonating under 2× the band. The line replaces "Next: full-wave waves" (`via-next`), with "Run it in Waves"
(`#waves`, asks for the via).

## 5. Measured (this PC, AMD RDNA 3, headless Edge)
| Case | Backend | Run | Estimate |
|---|---|---|---|
| C45 pair (fixture feeds), 939 k cells, 4 × 7852 steps | WebGPU, worker | 4.2 s | 3.6–3.9 s (calibrated) |
| 3 mm trace, 149 k cells, 2 excitations | CPU, worker | 48–50 s | 51–66 s (calibrated); table 102 s |
| C45 pair on the CPU | – | not run | 25 min from the table (over the harness's few minutes) |

The **pair preset** (BL161, BL173) runs its feeds over its return vias: the run reflects everything (|S| ≈ 0.99 on the
diagonal); the page warns before the run. The harness uses the fixture's feed angles (180, 0).

Cancel: the worker destroys the runner's buffers (`gpuHeld()` in `started.info.held`): over four cancelled runs the
count stays 19 buffers / 62.6 MB from the second on (the first, which also calibrates, holds one staging buffer more,
freed with it). Buffers destroyed in place (stage, wave, gathers) now leave the count at once (`drop`).

First load: 186.0 kB gzip (was 185.3; budget 200) — the Waves frame, the nav entry and the short lines.

## 6. Checks
`npm run check` 53 519 passed. `npm run ui`: 21 of 22 (ui-waves 35/35, ui-why 136 with 212 lines); **ui-viadrag fails one case** ("top antipads, mouse", BL174), which passes on the commit before; undoing the section, its nav entry, the Via hint, the status text and loading only in view, one at a time, did not fix it.

## 7. For M7.1b
Frames arrive in `progress` for excitation 1 only and are kept in `WavesSection`'s `framesRef` (290 for C45; cleared
on a new run and on a GPU restart of excitation 1). The slice: a via from the side (normal y through barrel A along
its feeds), a trace from above (normal z halfway to its plane), component |E| (`snapOf`); its `SliceInfo` is in
`info.slices` (`started`), `every`, `frames`, and `res.snap.max` per slice for a fixed colour scale. Hand the frames
to the player by prop or context; free them with the result.
