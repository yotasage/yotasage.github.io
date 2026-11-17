# Notes from step M7.1b – the 2D player

Done 2026-11-17. Files in [modules-page-waves.md](modules-page-waves.md); browser check `ui-player.mjs`, Node checks
`check-player.mjs`. M7.1 (M7.1a + M7.1b) is done.

## 1. What the player does
Under "The waves" in the Waves section's result (`WavesPlayer.tsx`, in the Waves chunk): the run's snapshot frames on a
slice, played as an animation.
- **Views and components.** The snapshots now take several (slice, component) pairs (snapshots.ts: `SliceSpec.comp`,
  `MAX_SLICES` 6; one gather per slice as before, so the engine's numbers do not change: check-player holds every
  slice's frames equal to a recorder of that component alone). `fullwave.ts snapOf` takes, for a **via**: from the side
  through barrel A along its feeds |E|, Ez and the component along the feeds; from above halfway between the entry feed
  and its plane (Ez), in the widest plane cavity the barrel crosses (Ez) and at the exit feed (Ez). For a **trace**: from
  above halfway to its plane (Ez, |E|), along trace 1 (|E|) and across the section's middle (|E|). `Preview.views`
  names them, `Preview.geom` is the run's `Model` (the outline). C44: 6 slices, 294 frames, 9.4 MiB; C45: 290 frames,
  12.2 MiB.
- **Transport.** Play/Pause, a Time slider (native range: arrows one frame, Page Up/Down a tenth, Home/End; its
  `aria-valuetext` is the frame's time), the time in ps and the frame number, speed ¼× ½× 1× 2× (1× = `FPS_1X` 30
  frames/s, a run in about 10 s), Loop (on by default; off, the play stops on the last frame and Play starts again).
- **Fixed colour scale** per slice over the whole run: the 99.9th percentile of |value| over every sample of every
  frame (`playScale`, a 4096-bin histogram on 0…`res.snap.max`); the rest, at copper edges where the field is
  singular, is drawn in the top colour, and the note says up to which value. The maps are colormap.ts's (the field
  maps' own: sequential for |E|, diverging for a signed component), so they read as the other field maps in both
  themes. Unit V/m for the run's 1 V source pulse (E is V/m: the probes' coefficients are in metres).
- **Picture.** To scale, cropped to the structure (`focusBox`: ports, barrels, returns, openings and the board with a
  margin; the CPML-side ends are quiet), at most about 60 % of the window high. Each frame is sampled bilinearly on the
  graded mesh into a raster of at most `RASTER_CAP` 200 000 pixels (the canvas's device pixels, or fewer), put into an
  offscreen canvas and drawn scaled into the visible one. Over it an SVG (re-made only on a new view or size): the
  copper the slice cuts (filled, the copper colour), the barrels and returns a top view cuts (discs), the copper above
  and below a top view up to the first plane each way and that plane's openings (dashed, each layer one union: the
  strokes are masked by the shapes' own fill, so a stadium antipad made of two discs and a rect reads as one outline),
  the board's faces, the ports with their names, axes in the page's unit.
- **Off React.** `Engine` runs requestAnimationFrame only while playing, in view (IntersectionObserver) and with the
  tab shown; it draws a frame only when the index changes and sets the slider, the time text and `data-player-frame`
  itself. Under prefers-reduced-motion it does not start by itself.
- **Freeing.** The result keeps its frames in a `FrameStore` box: a new run, a cancel and a setup change that makes the
  result stale empty it (the plots stay; the player gives way to a line saying so). The box matters: the first version
  passed the array, and after a new run the frames stayed reachable through closures of the unmounted player's last
  render (React's props on the detached DOM nodes), found with WeakRefs in the harness; emptying the box frees them
  whatever still holds it.

## 2. Measured (this PC, AMD RDNA 3, headless Edge; ui-player.mjs)
Playback at 2× (a new frame every display frame), side view |E|, 3 s:

| width | CPU | canvas | raster | rAF interval p50 / p95 | over 25 ms | work p50 / p95 |
| --- | --- | --- | --- | --- | --- | --- |
| 1440 px | 1× | 1160×395 | 766×261 | 16.7 / 16.9 ms | 0 of 180 | 1.1 / 1.3 ms |
| 1440 px | 4× | 1160×395 | 766×261 | 16.7 / 17.0 ms | 1 of 180 | 4.8 / 5.6 ms |
| 390 px, dpr 3 | 1× | 906×306 | 770×260 | 16.7 / 16.9 ms | 0 of 181 | 0.8 / 1.0 ms |
| 390 px, dpr 3 | 4× | 906×306 | 770×260 | 33.3 / 33.4 ms | 67 of 115 | 3.7 / 4.0 ms |

Budget at 1×: interval p95 ≤ 20 ms, work p95 ≤ 4 ms (both held). At 4× the work varies between runs (an earlier run:
8.1 / 9.0 ms at 1440, 6.3 / 6.8 ms at 390), and at 390 px with dpr 3 the browser's own compositing of the larger
canvas halves the rate; the player keeps playing at the run's pace (frames are skipped, not slowed). framePixels in
Node: 688×291 px in 1.0 ms.

Frames freed (ui-player §4): after a new run during playback and its cancel, after playback, and once more, no
watched frame (WeakRefs) is reachable after GC and the heap with ArrayBuffer stores falls by about the 12.2 MiB the
frames held; the GPU buffers held at each run's start stay 19 / 72.7 MB.

**The C45 pair on the CPU** (ui-waves with `EMSIM_WAVES_LONG=1`, the "CPU" choice): the estimate before the run, from
§9.6's table rate, 24.6 min; calibrated at the run's start 9.9 min; the steps took **10.1 min** (wall 10.1 min),
progress linear (0.10 a minute). Within the calibrated estimate (2 % over). The table's CPU rate is 2.4× slow for this
laptop here as on the 3 mm trace (102 s against 49 s); the page says the first number is "from a typical rate; the run
measures this device first", and phones are slower, so the table stays (BL179).

## 3. Checks
`npm run check`: 53 560 passed (the new group "Waves player (M7.1b)" 39). `npm run ui`: 23 of 23 scripts, with
`ui-player.mjs` (43 checks; in that run work p95 2.0 / 8.4 ms at 1440 px 1× / 4×, 1.5 / 6.7 ms at 390 px, intervals
p95 16.8 ms at 1×; the heap fell by 12.9–20.0 MiB after each cancel, frames 12.2 MiB); ui-waves 36 checks (+1: the first cancelled run starts while the player holds a finished
run's frames; every cancel leaves none), with `EMSIM_WAVES_LONG=1` 38; ui-why 220 lines (the player's eight in the
waves result). First load 186.4 kB gzip (status text and short lines).

## 4. For M7.2
- **3D of the same frames:** the slices are planes with `normal`, `at`, `u`, `v` (mm, graded) and int8/u8 data with a
  per-frame scale; `playScale` gives the fixed scale per slice and `palette` the colours, so a cut plane in Via3D can
  take the same raster (`rasterOf` with a box in the plane's own mm) as a texture per frame. The side view through
  barrel A and the top views at the feeds and in the cavity are the natural cut planes; the Engine's clock (`advance`,
  FPS_1X, speeds) can drive both views from one slider.
- **Pair modes:** the frames are of the first excitation only (one port driven: entry A), so a pair's animation now
  shows a single-ended drive. A differential (or common) mode needs the frames of the A and B excitations combined
  (A − B, A + B): either keep frames of both excitations (twice the memory; snapshots.ts records only run 0) or drive
  both ports at once with opposite signs in a dedicated run (job.ts drives; the S-parameters stay from the per-port
  runs). The SnapRecorder's per-frame scale means two runs' frames must be combined as values (q·scale), not as q.
- H and surface currents are not in the snapshots (BL178); zoom and a probe (BL176); export of a frame or a video
  (BL177).
