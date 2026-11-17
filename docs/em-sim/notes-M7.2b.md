# Notes from step M7.2b – the waves on cut planes in the 3D view

Done 2026-11-17. Files in [modules-page-waves.md](modules-page-waves.md) (`WavesView3D.tsx`, `lib/emsim/waves3d.ts`,
the player's changes) and [modules-page.md](modules-page.md) (`via3dRender.ts`); Node checks `check-waves3d.mjs` (group
"Waves 3D (M7.2b)"), browser checks `ui-waves3d.mjs` (in `npm run ui`).

## 1. What the visitor gets
Under the player's colour scale, **3D view** opens the run's structure in 3D with the player's slices as cut planes,
playing the same frames from the same clock. The copper is see-through (opacity 0.32), the laminate off at first
(**Show the laminate**). Each plane has a switch (**From the side**, **At the entry feed**, **Between the planes**,
**At the exit feed** for a via; **From above**, **Along the trace**, **Across the section** for a trace) and its own
colour bar below the view (the fixed scale of its slice, component and drive over the whole run, as the 2D player's).
A plane shows the field chosen in the player where it has it, else its own first (with |E| chosen: the side plane
|E|, the top planes Ez), always in the player's drive. **Cut away the near half** (a via: on at first) cuts the
structure and the other planes along the side plane, so the side plane shows whole with the top planes behind it; a
trace opens from above and across, the plane along the trace off (it would hide the plane from above, which lies
under the trace) and no cut. Play/Pause and a Time slider in the view drive the player's clock. Orbit, zoom, pan by
mouse and touch (OrbitControls, as the Via section's), keys on the focused view (arrows turn, + and − zoom, Home or 0
resets), **Reset view**. Closing disposes the view.

## 2. How it is built
- **One renderer:** `via3dRender.ts`'s `Via3D`, with options `copper` (opacity) and `fit` (0.72: the first view
  closer); its idle rAF loop now rests while the host is off screen once nothing is left to build or draw (so
  the first frame, which reports the open time, is drawn off screen too: ui-via3d opens views below the fold). New: `setWaves(planes)` (a `DataTexture` per plane over the caller's `Uint32Array`, no copy; the plane mesh's
  v turned round since framePixels writes row 0 at the top), `showWave`, `drawWaves(frame)` (marks the visible
  textures for upload and renders at once: three.js re-uploads with `texSubImage2D` into the storage allocated once),
  `setCutAt(c, keep)` (the cut through n·p = c, the plane on it left whole), `project`, `probe` (raycast that skips
  clipped hits), `turn`, `zoomBy`; `colorsOf` and `followTheme` moved here from Via3DView.
- **The structure from the run's model** (`waves3d.ts modelScene`): scene3d.ts's prisms made from the full-wave
  model (fdtd/model.ts), so it is what the run simulated, in the slices' own frame: planes with their openings (a
  pair's antipads with bridge or slot as one hole through scene3d's `antipadHoles`), feeds (rects at their mid-height
  width), pads and return pads, barrels and return vias (solid cylinders of the drill, as the model has them), laminate
  slabs with the barrels' holes, backdrilled ghosts; all inside `waveBox` (the 2D player's `focusBox` from above and
  from the side). Sheets (copper under HMIN) are drawn 12 µm thick.
- **The planes:** `planeViews` merges the player's views of one name (a trace's Ez from above lies on an edge's middle,
  its |E| on the nodes 11 µm away: two "From above" views in the player, BL183; one plane here, at the first's
  height); `viewPlace` places each in the box (corner, axes, size) with a texture of the plane's aspect, at most
  `TEX_CAP` 65 536 texels (C45: side 438 × 149, top views 356 × 183); `rasterOf(slice, tw, th, place.box)` gives the
  texels, so the texture is the 2D player's picture of the same frame at another size.
- **One clock:** the Engine (WavesPlayer.tsx) calls its `listeners` with each frame it draws, inside its rAF tick, so
  the 3D work counts in `stats.work`; the 3D view's listener writes the visible planes' pixels and calls `drawWaves`.
  Its visibility is the 2D figure's or the 3D host's (`watch`/`unwatch` on the Engine's IntersectionObserver): the
  loop runs while either is in view. Seeking in either slider calls `Engine.seek`.
- **Frames:** the planes' combined frames (`trackOf` for a pair's drive or |E| from the node components) are kept in
  the result's `FrameStore.more` (`Track`: key, frames, max; the player's own `track` reused when it is the same key),
  read through the store at each frame, so a new run, a cancel or a stale setup frees them with the rest; closing
  the view lets go of them too (the player's own `track` stays).

## 3. Measured (production build, Edge, this PC's AMD GPU through ANGLE D3D11)
- First load 186.4 kB gzip (unchanged: the view is a chunk of its own); opening loads 4 chunks, 169.4 kB gzip
  (three.js 71.8 + 82.3 kB, shared with the Via section's view); first frame 456 ms after the click with the chunk
  cold.
- Playback with both views, four planes (C45, side |E| in the differential drive), 3 s:

| width | CPU | speed | 3D canvas | ticks | 2D draws | 3D draws | interval p50 | interval p95 | work p50 | work p95 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1440 px | 1× | 1× | 1214×698 | 180 | 90 | 90 | 16.7 | 16.9 | 3.30 | 4.90 |
| 1440 px | 1× | 2× | 1214×698 | 181 | 181 | 181 | 16.7 | 16.9 | 3.90 | 5.40 |
| 1440 px | 4× | 1× | 1214×698 | 77 | 77 | 77 | 33.3 | 50.4 | 23.80 | 25.50 |
| 390 px, dpr 3 | 1× | 1× | 712×534 | 180 | 90 | 90 | 16.7 | 16.9 | 3.30 | 4.40 |
| 390 px, dpr 3 | 1× | 2× | 712×534 | 181 | 181 | 181 | 16.7 | 16.8 | 3.70 | 5.40 |
| 390 px, dpr 3 | 4× | 1× | 712×534 | 52 | 51 | 51 | 66.4 | 66.8 | 23.60 | 25.10 |

  The 3D view draws every frame the 2D player draws (the same index), at the display's rate: the step's "done when".
  Budget at 1×: interval p95 ≤ 20 ms, work p95 ≤ 8 ms (the 2D player alone: 1.9 ms, notes-M7.2a). At 4× throttle the
  work (framePixels of 4 × 65k texels and the 2D picture) halves the rate; the clock keeps time, frames are skipped.
- Closing: every WebGL context lost over five open/close cycles, every wave texture disposed, the renderer's
  geometries 0 and textures 1 (three.js's own 16 × 16 DFG table of the standard materials, a module singleton that
  goes with the context). A new run during 3D playback closes the view; after its cancel no frame is reachable (10
  watched, the planes' four combined tracks among them), the heap falls by 35.7–42.1 MiB (33.8 MiB held), GPU
  buffers 19 at each start.

## 4. Checked
- `check-waves3d.mjs` (25 checks on the C44 via, the LVDS pair, a microstrip section and an edge-coupled pair): the
  box in the mesh holding ports, barrels, openings and the board; points inside each copper prism are the model's
  copper (`inLayer`, cylinders) and the model's copper in the box lies in a prism of its layer (margin 10 µm);
  ring orientation; the pair's antipads one hole; each plane's corner and far corner at the slice's (u0, v0) and
  (u1, v1) on its `at`, axes, extent, texture aspect and cap; rasterOf's sample positions at the texels' centres
  (rows from the top); `planeComp`.
- `ui-waves3d.mjs` (47 checks): three.js not in the first load nor the Waves chunk, loaded on open; each plane's
  texture at a frame equals Node byte for byte (trackOf, playScale, rasterOf, framePixels) in the entry-A, differential
  and common drives with |E|, Ez and Ex chosen, the bars' ends as Node's scales; barrel A's centre projected and picked
  back off the side plane lands on it within a texel (the cut off: the entry plane is hit first; the cavity plane with
  the side plane off); the 2D side view and the 3D side plane share the slice's box; one clock both ways and in play
  (40 display frames, the same index each); playback as above; mouse, wheel, keys, Reset view, touch turn and pinch at
  390 px; plane switches; off screen the loop and the renderer's idle loop rest, the 3D view alone in view plays;
  reduced motion; five open/close cycles; cancels; no horizontal scroll at 320/390/1440 in both themes; the microstrip
  section's planes; screenshots `emsim-waves3d-390-dark`, `-1440-light`, `emsim-waves3d-trace-1440-dark`.

## 5. For M7.2c (the theory topic on full-wave simulation and the animation)
Pictures on the page the topic can point to (all under `#waves`, after a run):
- **The 2D player** (`[data-waves-player]`): the side view through the barrel shows the pulse coming in along the
  entry feed, turning down the barrel, the parallel-plate wave spreading between the planes from the antipads (the
  cavity view from above shows the rings), and the transmitted pulse on the exit feed; |E| for the strength, Ez/Ex
  with sign for the polarity; the pair's differential drive shows the odd field held between the two barrels and the
  common drive the field spreading to the return vias.
- **The 3D view** (`[data-waves3d]`): the same frames with the side plane cut through the structure, the feed's field
  on the entry plane behind it; a trace from above (the wave travelling along) and across (the quasi-TEM cross-section).
- The colour scales' notes say what is drawn: E in V/m for a 1 V Gaussian pulse behind each port's resistor, one
  fixed scale per slice over the run, its top the 99.9th percentile (values above, at copper edges, in the top colour).
- What it does not show (honest limits for the topic): H and surface currents (BL178), the field of the exit ports'
  excitations (BL182), copper drawn on the 3D planes (BL186).
