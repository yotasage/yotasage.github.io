# Notes from step M0.4a (2026-11-16)

Step M0.4 was split by the main session: **M0.4a** (this step: the FDTD design in [fullwave.md](fullwave.md), the
harness's WebGPU runner, the Yee spike in WGSL and JavaScript) and **M0.4b** (openEMS installed, its interface, the
fixture format, the first two fixtures; it fills fullwave.md §14).

## What was done
- `fullwave.md` answers every "M0.4 decides" of engine.md (round barrels: conformal) and the scope list of M0.4 except
  openEMS, plus plan.md D12 (`@webgpu/types`, dev only; D12's row is unchanged and points nowhere yet: the main
  session may add "answered in fullwave.md §9.5"). engine.md §7 and §10 point to it.
- Spike in `scripts/harness/emsim/spikes/` (`yee.mts`, `yee-gpu.mts`, `barrel2d.mts`, `fdtd.mts`), run by
  `npm run spike:fdtd [barrel|js|gpu|all]` (about 80 s).
- The **WebGPU runner** `scripts/harness/emsim/webgpu/runner.mjs` with `index.html` stays as the harness's way to run
  GPU code (M6.3): `withWebGpuPage(entry, fn)`, port 3023, headless Edge, server and browser closed in a `finally`.
  `playwright-core` ^1.65.1 is now a devDependency of the emsim harness.

## Adapter (headless Edge 157 finds it; no headed fallback needed)
`adapter.info`: vendor `amd`, architecture `rdna-3`, description empty; not a fallback adapter; the low-power request
returns the same. Limits: `maxBufferSize` 2 GiB, `maxStorageBufferBindingSize` 2 GiB − 4, 16 storage buffers per
stage. Features include `shader-f16`, `subgroups`, `timestamp-query`. The PC: Ryzen 9 7950X, RX 7900 XTX, 31 GB.

## Numbers
- Cell updates (E + H) per second, 2.1 M cells: **WebGPU f32 5.8–6.5·10⁹**, **JS f32 3.0–3.4·10⁷**, JS f64 the same
  (compute-bound). 8.4 M cells on the GPU: 3.7–4.2·10⁹ (overflows the GPU's cache).
- WebGPU vs JS f32: 6·10⁻⁶ of the probe's peak after 2000 steps; f32 vs f64: 7–10·10⁻⁶.
- **2 M-cell via run** (6475 steps, overhead 1.5 for CPML and ports): **WebGPU 3.0–3.4 s, JavaScript 10–11 min**.
- Round barrel at 6 cells per drill: conformal ≤ 0.5 % in Z0, staircase 23 %.

## What later steps must know
- **M6.1:** mesh rules of fullwave.md §2–§4 (ratio 1.3, smallest cell 20 µm, copper ≥ 20 µm as volume, mask averaged,
  barrel block at d/6 with conformal fractions from exact circles, also for pad and antipad circles in sheets); the
  estimator's static part §11.1 and memory §9.1 (48 B per cell + 32 B per CPML cell); refusal rules §11.4.
- **M6.2:** kernel conventions of `yee.mts` (ghost plane 0, H stored as η0·H, PEC by CA = CB = 0, coefficients per
  edge, mesh spacing per line), CPML §5 (start parameters; reflection bar −40 dB), ports and waves §6, DTFT and TDR §7,
  energy stop and stability §7.4. New checks: a coaxial via's TDR within 1 % at 6 cells per drill; the microstrip's
  1 % bar may need the thirds rule.
- **M6.3:** buffers §9.1, workgroup 64×4×1, K steps per submit from the calibration (~30 ms, ≥ 10), two in flight,
  required limits, the f32 bar of §8, calibration §11.2, the ideas in §13. Reuse the runner; it bundles any `.mts`
  entry. The spike's rate is the bare update; the 1.5 overhead is a guess to measure.
- **M7.1:** snapshots §7.3 (≤ 3 slices, ~300 frames, int8 with a per-frame scale, ≤ 64 MB, run maximum for the fixed
  scale); the JavaScript fallback needs about 10 minutes for the owner's via at full resolution on this PC, so the
  estimator's warning (> 5 min) and the coarser-mesh offer will show; at 4 cells per drill (s ≈ 1.5) it is about
  2 minutes.
- **M0.4b:** the openEMS via fixture should use the same geometry as §11.3 where possible (0.3 mm drill, 1.6 mm via,
  3 mm feeds), and its mesh notes should say whether openEMS staircases the barrel (it does unless told otherwise),
  so M6.4 can separate mesh error from model error.

## Budgets (engine.md §10)
The full-wave row (estimator within 2×, no fixed target) looks reachable: the WebGPU run takes seconds, and the
calibration on the real mesh replaces the table rate. Phones are not measured: a mobile GPU at a tenth to a hundredth
of this rate gives 30 s to 5 min; the JavaScript fallback on a phone (≈ 10⁷/s) is about 40 minutes and will be
refused or coarsened.

## Open questions
- **Phones:** no WebGPU rate on a phone yet; the owner may run the harness page on one (it needs a secure context:
  the dev server's LAN address is not one, so M6.3 needs another way, for example the published site).
- **CPML parameters** are quoted, not opened (Roden & Gedney, Taflove & Hagness); M6.2's reflection test decides.
- The **conformal claim** rests on the static analogue (2D test) and on the literature as commonly described
  (Dey–Mittra 1997, Yu–Mittra 2000/2001, not opened); M6.2's coax-via check confirms it in 3D.
- The machine is called a laptop in the brief but reports a desktop CPU and GPU (7950X, RX 7900 XTX), maybe an
  external GPU: the rates are for this machine.
