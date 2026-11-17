# Notes from step M9.2 – performance, size, memory

Done 2026-11-17. engine.md §10's budgets on a production build (`next build` + `next start` on 3022) at 1× and 4×
CPU throttle in one table, the first-load budget with every chunk and its trigger, and a 10-minute session with
full-wave runs whose memory does not grow. New checks in `npm run ui`: `scripts/harness/emsim/ui-perf.mjs` (about
4 minutes) and `ui-session.mjs` (2 minutes; `EMSIM_SESSION_LONG=1` 10 minutes), after the Smith chart's
`ui-perf.mjs` and `ui-memory.mjs` ([../smith-chart/notes-M9.3.md](../smith-chart/notes-M9.3.md)).

**Machine:** AMD Ryzen 9 7950X (16 cores, 32 threads), Windows 11, Edge 157.0.4341.60 headless (playwright-core),
WebGPU adapter "amd rdna-3", WebGL "ANGLE (AMD Radeon RX 7900 XTX Direct3D11)". "4×" is CDP's
`Emulation.setCPUThrottlingRate`, the stand-in for a phone.

**Worker budgets at 4×:** Chromium throttles the page's main thread only. A dedicated worker runs at full speed under
the page's throttle (a fixed loop: 50 ms in the worker at 1× and at 4×, 49 → 213 ms on the page), and CDP refuses the
call on a worker target ("Operation is only supported for pages, not workers"). So the 4× figure of a task in the static
worker is its 1× time × 4 (one thread, CPU-bound), with the measured round trip on the throttled page beside it.
engine.md §10 now says so.

## Budget table (ui-perf.mjs, median / p95 of 5 repeats; final build)

| task (engine.md §10) | budget | 1× | 4× | verdict |
| --- | --- | --- | --- | --- |
| one 2D solve, C39 microstrip with mask (worker, `[data-results]` `data-ms`) | ≤ 20 ms (≤ 80 at 4×) | 3.8 / 4.5 ms | × 4 = 18.0 ms | met |
| one 2D solve, pair-cpw: pair with mask and coplanar ground (worker) | ≤ 40 ms (≤ 150 at 4×) | 26.7 / 35.4 ms | × 4 = 141.6 ms | met (close: one p95 run read 42 ms) |
| inverse (width for a Z0 target, page clock) | ≤ 0.3 s | 17 / 57 ms | 29 / 34 ms | met |
| sweep of 100 points, drawn as it goes | ≤ 2 s | 115 / 119 ms | 128 / 147 ms | met |
| Monte Carlo, 1,000 samples, cancellable | ≤ 20 s | 876 / 884 ms | 1,046 / 1,093 ms | met |
| field map at 1440 px after a typed width: first picture | ≤ 50 ms | 20 / 22 ms (97 ms before the fix) | 67 / 71 ms | met |
| field map: full | ≤ 300 ms | 104 / 112 ms | 185 / 200 ms | met |
| via model C44, a new drill (worker) | ≤ 30 ms | 31.3 / 33.8 ms (Node: 21–25 ms) | × 4 = 135 ms | **missed by 1–4 ms in the worker** (BL199) |
| via model after a trace edit (feeds solved again) | ≤ 30 ms | Node 41–42 ms (feeds 36 ms) | – | **missed** (BL197) |
| drag a trace width, microstrip: drag frame p95; all main-thread work per frame; results per frame | ≤ 8 ms (≤ 12 at 4×); a result every frame or second | 0.7; 3.1; 0.99 | 3.1; 13.0; 1.00 | met at 1×; 4× over by 1 ms (BL99) |
| drag pair-cpw width | as above | 0.9; 3.3; 0.92 | 4.2; 13.5; 0.99 | met at 1×; 4× over (BL99) |
| drag microstrip width with the field map (\|E\|) | as above; map within 100 ms | 0.9; 6.2; 0.99; map 14 ms | 3.7; 21.6; 1.00; map 45 ms | met at 1×; 4× over (BL101) |
| drag the via's side antipad (C44) | as above | 1.3; 5.3; 0.76 | 6.7; 21.9; 1.00 | met at 1×; 4× over (BL115) |
| full-wave run C44 on WebGPU: estimate against real time | within 2× | 1.92 / 1.70 / 1.68 s against 1.54 s (the table's 2.72 s before the first run) | – (GPU-bound) | met (1.25×, first run calibrates) |
| full-wave pair C45 (ui-waves.mjs) | within 2× | see "Results of the runs" | – | met |
| player (ui-player.mjs): tick interval p95, work p95 | ≤ 20 ms, ≤ 4 ms at 1× | see "Results of the runs" | reported | met |
| 3D views: via orbit median frame (ui-via3d), waves 3D playback (ui-waves3d) | ≤ 17.5 ms; interval p95 ≤ 20 ms, work p95 ≤ 8 ms; first frame ≤ 1 s / ≤ 2 s | see "Results of the runs" | reported | met |
| first load (information) | – | FCP 76 / 100 ms, first result 160 / 171 ms | FCP 276 / 292 ms, first result 627 / 671 ms | – |
| theory by the nav link (cold chunk and KaTeX; information) | – | 349 / 364 ms | 1,402 / 1,943 ms | – |
| equation panel / derivation dialog / figure saved (information) | – | 51 / 58 / 31 ms | 138 / 149 / 55 ms | – |

The drag rows' "all main-thread work per frame" is CDP TaskDuration over the rAF ticks; it includes the harness's own
pointer events every 8 ms (the Smith chart measured 0.6 ms of them per 4× frame). Each drag case runs on a fresh page
with the tools closed: on a page whose Tolerance tool is open every edit re-runs its corners in the same worker, which
put the 4× microstrip drag at 20.9 ms and the via model at 54 ms p95 in a first draft of the script.

## The first load and every chunk (ui-perf.mjs, gzip -9)

`size.mjs`: the page's scripts 13 chunks, 573.0 kB, **187.5 kB gzip** (budget 200), CSS 16.6 kB gzip (budget 30); 43
later chunks, 725.9 kB gzip. In the browser the first paint fetches 24 scripts, 281.2 kB gzip: the page's 13 and the
static worker's (`2r6l…` starts it, then its own chunks: turbopack-worker, `2aq7…`, `2sf3…`, `0cut…`, `0vmu…`, `0w1v…`,
`3dtm…`, about 92 kB gzip), which the first result needs. None of three.js, the FDTD kernels or KaTeX is in it (checked
by content).

| trigger | scripts | gzip kB | what (by a string only that part has) |
| --- | --- | --- | --- |
| first paint | 24 | 281.2 | the page (react-dom 73.3, Trace section 20.0, …) and the static worker |
| the JLCPCB list opened | 2 | 45.7 | the picker 2.2, the list's data 43.4 (875 kB raw) |
| the field map switched on | 5 | 64.4 | the map's painter and colour maps; the Via section 19.3 (the taller page brings it within the load margin) |
| an equation opened | 4 | 121.9 | KaTeX 75.7, the equation panel 24.1, the derivation 7.0, 15.1 shared |
| the via 3D view opened | 5 | 176.6 | three.js 82.3 + 71.8, the view 18.1 |
| `#waves` near (the sections below load by their margin) | 13 | 233.2 | Waves section 22.0 (starts the full-wave worker, whose FDTD kernels 24.6 come at once for the device and the estimate), player 14.6, Export 29.7, Theory 31.4, derivation 33.4, Examples 6.2, … |
| a full-wave run | 2 | 13.3 | the run's own chunk |
| the waves 3D view opened | 1 | 11.3 | the view (three.js already loaded) |

## Session memory (ui-session.mjs, EMSIM_SESSION_LONG=1, final build)

22 rounds in 10.1 minutes: 67 full-wave runs to the end (single via 1.7 s, LVDS pair 4.5 s on WebGPU, each within 2× of
its estimate), 33 cancelled mid-run, 44 opens of each 3D view, 22 of everything else (typed width and thickness, kind
switched, trace and via handles dragged, the field map, an equation and its derivation, a figure and data saved, the
player's drives). Samples at the first rest state after every 30 s, each after two forced collections:

| min | page heap MiB | ArrayBuffers MiB | static worker MiB | full-wave worker MiB | DOM nodes | listeners | WebGL made / live | GPU buffers held |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0.0 | 14.19 | 13.95 | 1.45 | 1.73 | 18,377 | 707 | 0 / 0 | 20 / 56.4 MB (first run, calibration) |
| 1.1 | 22.38 | 18.75 | 2.73 | 2.29 | 18,489 | 717 | 7 / 0 | 19 / 56.4 MB |
| 2.0 | 23.40 | 18.75 | 2.66 | 2.33 | 18,493 | 717 | 13 / 0 | 19 / 56.4 MB |
| 4.2 | 23.10 | 22.95 | 2.81 | 2.31 | 18,492 | 717 | 27 / 0 | 19 / 56.4 MB |
| 6.0 | 23.67 | 22.96 | 2.81 | 2.32 | 18,500 | 717 | 39 / 0 | 19 / 56.4 MB |
| 8.0 | 24.11 | 18.78 | 2.81 | 2.33 | 18,519 | 717 | 52 / 0 | 19 / 56.4 MB |
| 10.1 | 24.39 | 22.96 | 2.82 | 2.34 | 18,518 | 717 | 66 / 0 | 19 / 56.4 MB |

**Criterion and result:** the post-GC heap's least-squares slope from minute 2 on under 1 MiB/min (page 118 kiB/min,
static worker 9, full-wave worker 2) and the last sample within 10 % of the third (page +9.0 %, workers +3 % and +2 %);
DOM nodes and listeners within 10 % (+29 nodes, listeners flat); one document; no WebGL context live at a rest state;
a heap snapshot at the end holds one WebGL context object and 1 detached DOM node; the GPU buffers held once a run's
are made are the same for every run of a structure from the worker's second run on (single 19 / 56,433,580 B, pair
19 / 73,286,936 B; the first run 20, its calibration's staging buffer), so no run, finished or cancelled, leaves any.
What is left of the page's slope is V8's compiled code (InstructionStream, FeedbackVector and bytecode grew by about
0.5 MB per ten opens of a view in a snapshot diff, nothing of the page's own objects) and the undo history (at most
200 steps; the session commits two per round).

Before the fixes below the same session grew the page heap by 3.4 MiB in 8 minutes (275 kiB/min), DOM nodes by 100 and
held a WebGL context per view ever opened.

## Fixes

- **Closed 3D views stayed in memory** (`components/EmSim/via3dRender.ts`, both the via's and the waves' 3D view): two
  ways, found with heap snapshots (shortest retaining path from the GC roots).
  1. OrbitControls' `disconnect()` takes its keydown and keyup listeners off `domElement.getRootNode()`; React removes
     the view from the page before the effect's cleanup calls `dispose`, so the root is the detached view and the
     document kept the listener, the controls, the Via3D, its scene, renderer, canvas and host: 73 DOM nodes, 7
     listeners and about 0.7 MiB per view opened and closed. `dispose` now takes them off the document they were put on
     (the root saved when the controls are made).
  2. three.js shares one DFG table (a module's DataTexture) among all renderers' standard materials; each renderer that
     drew it keys its GL texture by the table's source and listens to its `dispose`, so every disposed renderer, its
     WebGL context and canvas stayed reachable from the table. `dispose` now disposes the table after the renderer;
     a view still open uploads it again on its next frame.
- **A via model held the field map's first picture back** (`lib/emsim/jobs.ts` `createStaticHandler`): after a typed
  trace width the worker got the trace's solve, the via model (the Via section is loaded once the field map makes the
  page tall enough) and the map's job in that order, and the via model (40 ms after a trace edit, not sliced) ran before
  the map: first picture 97 ms p95. Of the jobs that have shown nothing yet, `solve`, `field` and `via-field` now go
  first: first picture 20 / 22 ms, the via's result about 5–10 ms later than before. Traced by wrapping
  `Worker.prototype.postMessage` (sends and replies with times).
- **Harness:** `[data-results]` has `data-ms` (the worker's solve time, as `[data-via-results]` had). ui-drag's rate
  check takes the better of its two runs (BL120 done). ui-session waits with locators only: an element handle from
  `waitForSelector` or `$` keeps its element, and with it a closed view's whole tree, alive until disposed; the first
  draft of the session read that as a leak of 279 nodes per run.

## A/B of the drag budgets (the job order is on a drag's path)

`.ab-head` (a worktree of 1c934b2, the commit before; its own build on 3023) against this build on 3022, ui-perf's
`EMSIM_PERF_PARTS=drag,via` with 3 repeats, interleaved A B A B:

| case (all main-thread work per frame, ms; medians of 3) | A1 (HEAD) | B1 (M9.2) | A2 (HEAD) | B2 (M9.2) |
| --- | --- | --- | --- | --- |
| microstrip width, 1× / 4× | 3.42 / 12.86 | 3.15 / 12.32 | 3.32 / 12.61 | 3.39 / 12.54 |
| pair-cpw width, 1× / 4× | 3.52 / 13.64 | 3.43 / 13.42 | 3.31 / 14.06 | 3.47 / 13.27 |
| microstrip with the field map, 1× / 4× (coarse map at 4×) | 5.81 / 22.09 (38 ms) | 6.50 / 23.47 (42 ms) | 6.10 / 21.24 (39 ms) | 6.08 / 20.94 (41 ms) |
| via side antipad, 1× / 4× | 5.26 / 20.55 | 5.42 / 20.34 | 5.41 / 20.06 | 5.24 / 21.25 |
| via model, new drill, worker median | 31.5 | 31.6 | 31.8 | 32.2 |

No difference beyond the spread between runs of the same build (±1.4 ms at 4× with the map); the drag frame's own
work p95 was 2.9–7.4 ms in all. The via model's 31–32 ms is the same before this step (BL199).

## Backlog

- BL99, BL101, BL115 (4× drag budgets): updated with these numbers. The trace drags at 4× are where M2.1c left them
  (13.0–13.5 ms against 11.4–14.0); the drag with the field map (21.6 ms, was 14.7–15.4 in M2.2) and the via's antipad
  (21.9 ms, was 13.7–18.4 in M3.1b) grew with the page, as the Smith chart found for its own (notes-M9.3.md there): the
  A/B shows this step changed neither. The drag frame's own work is within 12 ms in every case (p95 3.1–6.7 ms).
- BL120 done (above). New: BL197 (the via's feeds solved again after a trace edit), BL198 (the field map's job sent
  twice per typed width), BL199 (the via model a few ms over 30 in the worker for a new drill).

## For M9.3 (docs and `npm run recheck`)

- `npm run recheck`'s table can take its M9.2 rows from ui-perf's table (one line per §10 budget with its verdict) and
  ui-session's checks; the long session is `EMSIM_SESSION_LONG=1` (11 minutes).
- `npm run ui`'s scripts now take about 30 minutes on this machine (ui-perf 4, ui-session 2; ui-browsers 11), plus
  the build.
- The budgets' wording in engine.md §10 has a "How the budgets are read" list (4× for workers, the field map's first
  picture on the page, the via after a trace edit, the two readings of a drag frame).

## Results of the runs

- `npx tsc --noEmit` clean. `npm run check`: all 54,206 checks passed (296 s; `lib/emsim/jobs.ts` changed).
- `npm run ui` on the final build (`npm run build` stopped once on Next.js's security notice and passed on the retry;
  then `node ui.mjs --no-build`): **28 of 28 scripts passed** in 1,818 s, ui-perf 218 s, ui-session 127 s. After the
  status note's text changed: rebuilt, ui-release (35 checks) and ui-perf's `solve` part passed again.
- The existing scripts' budget numbers in that run: ui-drag (TaskDuration per frame, 1× / 4×) microstrip 2.90 / 13.38,
  pair-microstrip 3.67 / 14.17, pair-cpw 3.40 / 12.97 ms, 0.92–1.00 new Z per frame; ui-fields with field lines 6.61 /
  21.22 ms, coarse map p50 21 / 30 ms, first and full picture of a new drive 8–10 / 21–30 ms; ui-via one via solve 22.2
  (new drill 0.25), 24.1 (antipads), 24.6 ms (backdrilled), the first 74.8 ms; ui-viadrag 4.16–4.62 / 18.2–18.9 ms;
  ui-via3d first frame 426 ms after the click (budget 1,000), orbit median 16.70 ms at 1× and 4× (≤ 17.5); ui-waves
  C45 on WebGPU 4.36 s against its estimate 3.86 s; ui-player at 1440 px interval p95 16.8 ms, work p95 2.10 ms (budgets
  20 and 4; at 4× 33.5 and 8.4, reported), at 390 px dpr 3 16.8 and 1.70 ms; ui-waves3d first frame 451 ms (budget
  2,000), playback interval p95 16.9 ms, work p95 4.8 ms at 1× (budgets 20 and 8; at 4× 50.3 and 25.2, reported).
- ui-perf in that run: the microstrip drag at 4× 11.89 ms per frame (met that time), the via model 29.8 / 34.3 ms,
  C44's runs 1.85–2.06 s against 1.55 s; the rest within the spread of the table above.
- ui-session's 2 minutes in that run: page heap 22.37 → 23.31 MiB from the third sample, nodes 18,489 → 18,493,
  listeners 717, GPU buffers 19 / 56,433,580 B for every single-via run, 1 WebGL context object and 2 detached nodes in
  the end's snapshot. The 10-minute run's table is above.
