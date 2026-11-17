# Notes from step M7.2a – a pair's drive in the Waves player

Done 2026-11-17. Files in [modules-page-waves.md](modules-page-waves.md), [modules-fdtd.md](modules-fdtd.md)
(`snapshots.ts`, `job.ts`); Node checks `check-drive.mjs` (group "Waves drive (M7.2a)") and check-fdtd-gpu.mjs (e);
browser checks in `ui-player.mjs` and `ui-waves.mjs`.

## 1. What the visitor gets
For a pair (the via pair, a coupled trace pair: four ports) the player has a third choice beside the slice and the
component, **Drive**: *Entry A* (entry A driven alone, as before), *Differential* (A + 1 V, B − 1 V) and *Common*
(A + 1 V, B + 1 V). The scale's note says which ("for differential drive: A + 1 V, B − 1 V"). Changing the drive keeps
the frame and the clock (paused or playing); each slice, component and drive has its own fixed scale over the whole
run; the TDR/TDT and Sdd/S plots do not change (they come from the per-port runs as before). A single via or trace
shows no drive choice and the slices of M7.1b. The estimate says the frames' memory ("The waves’ frames take 24 MiB,
entry A’s and entry B’s, so the player can show …").

## 2. The choice: both entries' frames combined as values, not an extra run
notes-M7.1b named two ways. Measured on the C45 pair with the fixture's feeds (this PC, AMD RDNA 3):

| | frames of entry A and B, combined on the page (chosen) | extra runs driven at both ports |
| --- | --- | --- |
| run time, GPU | 3.58 s → 3.73 s (+4 %: the second recorder's gathers) | 4 → 6 runs: about +1.8 s (+50 %) |
| run time, CPU | +0 (the gathers are a few % of a step) | +50 %: about +5 min on the 10.1 min run (notes-M7.1b §2) |
| frames memory | 2 × 12.2 → 24.4 MiB (both runs, 290 frames each) | 3 × 12.2 = 36.6 MiB (A alone, differential, common) |
| exact? | up to the int8 steps of three quantisations (A, B, the sum) | up to one quantisation |
| switching the drive | trackOf on the page: 11–40 ms to the next frame (side \|E\| from 6 slices × 290 frames) | 0 |
| |E| of the sum | needs the vector: the |E| planes become Nx, Ny, Nz | native |

The combination costs no run time, which matters most where runs are slow (the CPU, phones), and stays inside
§7.3's 64 MiB; the cost is a click's 11–40 ms and the three components on |E| planes. **|E| is the catch:** |E_A − E_B|
is not |E_A| − |E_B|, so a pair's |E| planes are taken as the three components averaged to the nodes, `Nx`, `Ny`, `Nz`
(snapshots.ts: the same two edges per axis |E| averages, f·E on conformal edges), and the page makes |E| from them;
the signed views (Ez from above, Ez and the along-feed component from the side) come from the same slices. That keeps
six slices per run: a via pair's side view as Nx, Ny, Nz plus the three top views (Ez); a trace pair's views from
above and across the middle as Nx, Ny, Nz each, the view along trace 1 (one line of the two) left out (BL180).

**How a drive is made** (`wavesPlayer.ts trackOf`): per frame and sample, value = Σ_r w_r·q_r·scale_r with
w = (1, −1) or (1, 1) (as values, never as q: each run's frames have their own per-frame scale), |E| the root of the
three components' squares, then quantised again exactly as SnapRecorder does (int8 at max/127, u8 at max/255). A run
that settled earlier has no frame there: it counts as zero. Frame i's time is entry A's (both runs record the same
steps: one plan). Entry A alone on a plain slice is its own frames (no copy); entry A alone on |E| goes through
`trackOf` as well (from the node components). The combined frames of the shown component and drive live in the
`FrameStore` (`track`, one at a time), so emptying the box (new run, cancel, stale setup) frees them with the rest.

**The job** (`job.ts`): `SnapSpec.runs` lists the excitations recorded (default [0]; the page asks [0, 1] for a via
pair, [0, 2] for a trace pair, as wavesView pairs the ports); each gets a recorder of its own on the same plan, the
budget shared (`snapPlan` divides it by the runs). A progress message's frames are of its `run`; `started.info` has
`snapRuns` and `snapBytes` over all runs; the result's `snap.runs` each run's frame count and maxima (`frames`/`max`
stay entry A's). A GPU restart of a recorded excitation clears that run's frames on the page.

## 3. Checked (numbers from this PC)
- **Linearity, Node** (check-drive, edge-coupled microstrip pair, 3 mm, 181 608 cells, f32 CPU, 900 steps, 45
  frames, four runs in 12.5 s): A ∓ B combined as values against a run driven at both ports at once (A + 1 V,
  B ∓ 1 V) on every component of both views: worst 0.74–0.95 of the quantisation bound (½ step of the combined
  frame + ½ step of each of A, B and the direct run per component; for |E| their root-sum-square), at most 1.21 % of
  the drive's largest value over the run (bar 2 %); against the exact A ∓ B of the dequantised frames within ½ step of
  the combined scale (+ the f32 scale's rounding, 1e-4 step). trackOf reads about 270 M samples a second in Node.
- **Components at the nodes:** |E| from Nx, Ny, Nz equals the recorder's own |E| within their quantisation (worst
  0.97 of the bound); an edge Ez beside them is bit for bit a recorder of Ez alone (the engine's numbers unchanged).
- **Symmetry:** trace pair from above, Ez about x = 0 (a mirror-symmetric mesh): common even within 0.00 %,
  differential odd within 0.79 % of each frame's largest value (one int8 step: round(−x) ≠ −round(x) at ties); entry
  A alone is not even (103 %). **C45** (GPU, check-fdtd-gpu (e), about y = 0.35): the mesh's lines near barrel B lie up
  to 0.012 mm off the mirror of barrel A's, and Ez is singular at copper edges, so the bar is an RMS over the run:
  entry common 5.1 %, entry differential 5.4 %, cavity common 1.4 %, cavity differential 18.8 % (the differential
  field between the planes is small, 9 V/m against 22 V/m for entry A alone, so the mesh's offset weighs more), bar
  25 %; the other symmetry is about 200 % each (the drive's signs are right).
- **Records unchanged:** the C45 job with entry A's and B's frames gives records bit for bit those of a job with
  entry A's only (all four runs); time 3.58 → 3.73 s.
- **Page** (ui-player, 58 checks): the Drive choice for the pair, none for the C44 via; each drive's picture equals
  Node byte for byte (side |E| entry A and differential, side Ez, side Ex differential, entry Ez common, cavity Ez
  entry A and differential); the frame and its time kept on a change of drive, paused and playing; the scale fixed
  over the frames in the differential drive; the plots' markup the same in every drive; playback in the differential
  drive at 2×, side |E|: 1440 px 1× interval p95 16.9 ms, work p95 1.90 ms; 390 px dpr 3 1× 16.8 ms, 1.60 ms
  (budget 20 / 4); 4×: 8.3 and 6.9 ms work; cancels in the differential and common drive free all six watched
  frame objects (entry A's, B's, the combined), the heap falls by 26.9–34.0 MiB (25.7 MiB held), GPU buffers 19 at
  each start. ui-waves: the result's runs 0:290, 1:290, 24.4 MiB as the estimate's.

## 4. For M7.2b (the 3D cut planes)
- Take the frames through `trackOf` (the same drive as the player's, from the same `FrameStore`), so the 3D planes
  and the 2D player show the same thing; `Engine.key`/`src`/`mode` say what is shown, `Engine.pos` is the clock.
- The pair's side plane holds Nx, Ny, Nz: a cut plane of |E| in 3D is `trackOf(…, [x, y, z], 'E', mode)`.
- A via pair's side view goes through barrel A only (normal y at A's centre on C45); a plane through both barrels
  would show the differential drive better (BL181). The run's other excitations (exit ports) are not recorded.
