# EM simulation – notes of step M6.2b (2026-11-17)

Ports and records, S-parameters by DFT, TDR/TDT, snapshots and the full-wave worker, `lib/emsim/fdtd/run.ts`,
`snapshots.ts`, `job.ts`, `lib/emsim/fdtd.worker.ts`, `fdtdClient.ts` ([modules-fdtd.md](modules-fdtd.md)); checks in
`check-fdtd-run.mjs`, group "FDTD runs (M6.2b)" (109 checks, about 50 s; 53 201 in all, `npm run check` 3 min 15 s; `EMSIM_FDTD_LONG=1` adds 7 checks and about 2 min). Harness only, no page work.

## The run and its outputs
- `runProblem(p, 'full' | 'tdr' | drives)` or an `Excitation` per drive (the worker's way): fields and ψ zeroed, one
  `CpuLoop` with the ports' sources, a record row after every step (6 f64 per port: v at the 4 plane lines, i at the
  2 planes), the −50 dB energy stop or the cap T = 10σ + 3τrt. `Records` are plain data: the page can keep them and
  post-process again (another rise time, another reference) without a new run.
- **DFT** at any frequency list (f64, phasor rotation re-synced every 256 steps); a plane's V is the mean of its two
  lines, I is moved from (n − ½)Δt to nΔt by e^{jωΔt/2}. Power waves at the feed's Zr (2D Z0); γ of each feed from
  a₂/a₁ of the run with that port's largest a (βd < 3π/2); waves at plane 2 moved to the reference plane (the feed's
  end, L from the port) by e^{∓γℓ}. **S = B·A⁻¹** with one run per port, which removes the waves the loads reflect
  (the lumped port's own reflection is −19 dB at the band's top, BL151); with fewer runs only the driven columns.
- `nportOf` → `NPort` at Zr per port, producer `fdtd`, valid 0…f_S = 0.816·f_run, `known` columns;
  `renormalize(np, z0)` (new in nport.ts) moves it to 50 Ω. `feedEeff` flags εeff off the 2D solver's by > 1 %.
- **TDR/TDT** (`tdrOf`): tdr.ts's series (engine.md §6.6, so the via model's TDR overlays it) on its grid from the
  DFT of the records, S = 0 above f_run, the series' level max(10⁻⁷, G(f_run)) (−60 dB at tr_min). t = 0 at the
  reference plane.
- **Snapshots** of the first excitation: up to 3 slices inside the CPML, Ex/Ey/Ez on their edges or |E| at nodes,
  f·E on conformal edges, int8 (u8 for |E|) with an f32 scale per slice and frame, the run's maximum per slice;
  `snapPlan` sets every k = ⌈cap/frames⌉ (≤ 300 frames, ≤ 64 MiB, fewer frames to fit).

## The worker protocol (for M7)
`{type:'run', id, job: FdtdJob}` / `{type:'cancel', id}` → `refused` (verdicts, offer, notes) | `started` (cells,
steps, Δt, runs, ports, estimate, slices, every, frames, bytes) | `progress` (run, runs, step, steps, elapsed, eta,
energyDb, `from` + new record `rows`, `frames`; buffers transferred) | `done` (`FdtdResult`: records, nport, tdr per
asked tr, eeff, status, steps, notes, snap) | `error` | `cancelled`. One run at a time (a new run cancels the old),
chunks of 100 ms between which a cancel gets in; JavaScript env and `RATES.js` for the refusal rules by default.
`FdtdClient.run(job, {started, progress})` resolves `{kind:'done'|'refused'}` or null; it runs the handler on the page
when there is no worker.

## The microstrip, the thirds rule and the trapezoid
Lines on the trace's edges made the strip act wider: two-plane Zc **49.1 Ω** (−4.6 %), εeff 3.252; 8 cells across
50.05 Ω (first order in h). The 2D solver gives 52.06 Ω for the mean-width rectangle the mesh holds (51.50 Ω for the
trapezoid). Tried (4 mm, Zc / εeff): thirds rule, staircase 53.2 / 3.243; thirds rule with the conformal edge (f = 2/3)
52.08 / 3.384 (0.04 % from the rectangle's 2D); **plus the trapezoid's base and narrow top as conformal fractions on
the two copper faces 51.70 / 3.434** (adopted, model.ts `thirdsOf`, `Taper`; materials.ts at each z node). The
inductance stays about 2 % high (Yu–Mittra keeps H faces whole), so εeff is 4 % over the 2D solver's (BL150);
`thirds: false` restores lines on the edges. Via feeds are unchanged (BL153).

| Case | Cells | Steps | Run | Z0 TDR vs 2D 51.50 Ω | \|S11\| max | Reciprocity |
|---|---|---|---|---|---|---|
| microstrip 6 mm, 2 runs (f32) | 149 178 | 6 839 + 6 839 | 46 s | 51.556 Ω (+0.11 %) | −36.1 dB | 1.3·10⁻⁶ |
| microstrip 12 mm, port 1 (LONG) | 199 962 | 11 048 | 47 s | 51.577 Ω (+0.15 %) | – | – |
| pair-microstrip 3 mm, 4 runs (LONG) | 158 769 | 4 × 4 994 | 71 s | – | −24.9 dB (at Zodd) | 6.7·10⁻⁷ |

Passivity excess 10⁻⁵ (the pair 5.8·10⁻³: one γ per feed for two modes, BL155, bar 10⁻² there); |S21(0)| = 1; S21's phase follows εeff from γ; the TDR's stated error 0.003 Ω; the mesh's own
error is the spread above (lines on edges −4.6 %, the adopted rule +0.1 %). Neither run reaches the −50 dB stop:
low-frequency energy lingers at −45…−48 dB between the CPML and the loads (BL152), so both run to the cap. That
rose and fell by a few dB, which the 2× rule called unstable: a rise now counts only above −30 dB of the maximum
(cpu.ts `UNSTABLE_FLOOR`); Δt over the Courant limit is still caught.

## For M6.3 and M7
- cpu.ts: `compile()` puts a serial in each kernel's source; V8's compilation cache otherwise shared the kernels' feedback between loops, and a run after one in the other precision was 2× slower (the microstrip 113 s instead of 46 s in the full check).
- M6.3: the GPU writes the same 6 values per port and step (`RECORD`, the ring of estimate.ts) and a gather of the
  slices per frame; everything after the records (run.ts, snapshots' quantisation) is shared. Compare on the 6 mm
  microstrip (lossy, open, as fullwave.md §8 asks).
- M7: `FdtdClient`; show `notes` (εeff flag, not settled, unstable); renormalise to the page's reference; TDR at the
  page's rise time from `records` (`tdrOf`) without a new run; frames arrive in `progress` and are not repeated in
  the result.
- Pairs: only 'full' or port 1 (BL154). The microstrip mesh grew (113 022 → 123 786 cells for the 3 mm default).
