# Notes from step M9.1b – the page in Firefox and WebKit

Done 2026-11-17. M9.1 was split (milestones.md): M9.1a was access in Edge ([notes-M9.1a.md](notes-M9.1a.md)); this step
is the page in Firefox and WebKit as well as Edge, what each offers for WebGPU, and the CPU fallback's message where
WebGPU is missing. **M9.1 is done.** The check is `scripts/harness/emsim/ui-browsers.mjs` in `npm run ui` (about
10 minutes: a walk of the features per browser, then `ui-access.mjs` in Firefox and in WebKit), after the Smith chart's
ui-browsers.mjs ([../smith-chart/notes-M9.2.md](../smith-chart/notes-M9.2.md)).

Browsers: Edge 157 (`channel: 'msedge'`, WebGPU flags as every script), Playwright's Firefox 159 and WebKit 27.2
(playwright-core 1.65.1's builds, already in `%LOCALAPPDATA%\ms-playwright`; WebKit on Windows stands in for Safari).

## Feature × browser (ui-browsers.mjs)

| Feature | Edge | Firefox | WebKit |
| --- | --- | --- | --- |
| trace results (the same text as Edge's) | ok | ok | ok |
| trace handle by mouse | ok | ok | ok |
| via results (the same text as Edge's) | ok | ok | ok |
| via handle by mouse and by keys (`:focus-visible` shown) | ok | ok | ok |
| via layer labels inside the drawing (1440 and 390 px) | ok | ok | ok |
| equation and derivation dialog (MathML sized, no `merror`) | ok | ok | ok |
| theory MathML laid out (every shown `<math>` sized, every `<mfrac>` stacked) | ok | ok | ok |
| via 3D view (WebGL), turned by a drag | ok | ok | ok |
| files saved: figure, data, project (names as Edge's, not empty) | ok | ok | ok |
| WebGPU | adapter amd rdna-3, maxBufferSize 2 GiB, binding 2 GiB, 16 storage buffers | `navigator.gpu`, no adapter | no `navigator.gpu` |
| Waves: where it runs and why | GPU | CPU, fallback message (no adapter) | CPU, fallback message (no WebGPU) |
| full-wave run of the trace 1 mm at 100 ps: Cancel (focus back on Run), then to the end | GPU 0.87–0.92 s (estimate 1.03–1.10 s; ends before Cancel) | CPU 57.5–61.0 s, calibrated estimate 79.6–83.1 s (126 s shown before it measured) | CPU 27.1–28.4 s, calibrated estimate 39–56 s (126 s before) |
| player: play, pause, End and Home | ok | ok | ok |
| waves 3D view (WebGL) | ok | ok | ok |
| taps: a section link in the bar | ok | ok | ok |
| via handle by a finger | ok (CDP touch) | ok (touch PointerEvents) | ok (touch PointerEvents) |
| no sideways scroll at 390 px; no page or console errors | ok | ok | ok |
| ui-access.mjs (contrast, names, Tab, 21 tasks by keys and by touch, live regions, reduced motion, 200 % zoom, 320 px) | 218 of 218 (its own run) | 218 of 218 | 218 of 218 |

The engine's numbers print the same in the three engines (the trace's Z0, εeff and delay, the via's results). The CPU
runs end well inside the calibrated estimate × 1.25 (over four runs Firefox at 69–76 % of it, WebKit at 50–73 %); the estimate shown before
the first run uses V8's table rate and is pessimistic in both (BL196).

## The fallback message

When the visitor leaves "GPU if it can" and the run is on the CPU anyway, the Waves section says why in plain words
instead of the engine's reason (`WavesSection.tsx` `cpuWhy`, `[data-waves-fallback]` none / noadapter / software):

> This browser does not offer WebGPU, the way a web page can compute on the graphics card, so the run is on the CPU.
> It does the same steps on one core, often a hundred times slower than a graphics card: this run takes about 2.1 min.
> The trace with the 100 ps rise is the quickest case; Edge or Chrome on a computer with a graphics card run it in
> seconds.

Firefox's first sentence: "This browser has WebGPU but found no graphics card it may use (it can be turned off, or the
card or its driver is not supported), so the run is on the CPU."; a software adapter: "WebGPU here offers only a software
stand-in for a graphics card, no faster than the CPU, so the run is on the CPU." While it runs, the progress line says
"On the CPU, as this browser offers no WebGPU." (was "On the CPU: This browser has no WebGPU. The run is on the CPU.").
The engine's reasons in `lib/emsim/fullwave.ts` are unchanged (check-fdtd-gpu.mjs matches them). Screenshots:
`emsim-browsers-{firefox,webkit}-waves-{1440-light,390-dark}.png`.

## Findings and fixes

| Kind | Found | Fix |
| --- | --- | --- |
| Clipped label (all engines) | The via's side drawing reserved 58 px for the layer labels; "L1 (top) in" (about 62 px of text after a 10 px leader) ran past the drawing's right edge at every width (seen at 320 px and 200 % zoom). | `ViaDrawing.tsx` `sideLabels`: the column is as wide as the widest label, measured with a canvas `measureText` in the page's font, at least 58 px and at most 30 % of the drawing; a longer name drops its bracket ("L6 out"), then is cut with "…", with the full text in a `<title>`. ui-access.mjs checks every label inside the SVG at 320, 390, 1440 px and 200 % zoom (default and pair), ui-browsers.mjs at 390 and 1440 in every engine. |
| Focus (WebKit) | Tab moved the focus but WebKit did not scroll the page: the stops past the first screen ended off it (Export, Report, the theory's Derivation buttons up to 31,900 px below the screen), so keys tasks there failed. | `EmSimTool.tsx`: after a Tab key, a `focusin` listener scrolls the newly focused control into view if it is off screen or under the sticky bar (`block: 'nearest'`, so the html `scroll-padding-top` keeps it clear of the bar), a frame later and only if nothing scrolled the page meanwhile, so the browser's own scroll and a part laid out as the focus enters it come first; where the browser scrolled, nothing happens. Two earlier forms were dropped: checked at once in `focusin`, it once left a citation under Edge's bar (the theory laid out after the check); for every focus, or without the scroll condition, it undid a Back that came within a frame of the Tab (the harness's Firefox runs: the focus left in the topic pulled the page off the short line Back had scrolled to). |
| Names (Firefox, WebKit) | The aria snapshot listed the KiCad file input (visually hidden, `tabIndex -1`, `aria-hidden`) as an unnamed button. | `StackupSection.tsx`: the input is `hidden`, as the project's file input already was (`click()` and `setInputFiles` work on it). |
| Harness: touch | Playwright has no touch move outside Chromium; a synthetic pointer cannot be captured, so `setPointerCapture` threw (NotFoundError, "Invalid pointer id") and three.js's OrbitControls stopped: the 3D views did not turn by a "finger". A synthetic tap on the player's range input did not move it. | Touch drags are touch PointerEvents to the element under the finger with capture made a no-op for the drag (our `panZoom.ts` already caught it); taps are `touchscreen.tap`. Not a page bug. |
| Harness: Tab in WebKit | WebKit's Tab skips links (Safari's default; Option+Tab or "Press Tab to highlight each item" reaches them; Playwright's WebKit reaches them by neither): 275 stops against Edge's 604, the first the short lines' switch. | Links are focused by script there and their focus checked the same way; the cycle's first stop is the first control. |
| Harness: Tab in Firefox | After the last stop Tab leaves the page for the browser's own controls (none in a headless window): the focus fell to the body and the next Tab went on from where the page was scrolled, so the cycle never came back to the home link. | The cycle re-enters at the body's start then, as after the browser's controls: 609 stops, back at the home link. |
| Firefox scroll jump (BL194) | One to three Tab stops a cycle, a different one each run, are scrolled off just after Firefox brought them in (390 px: Save .csv from 742 to 1292 px as the page scrolled from 20688 to 20138 px). No page script scrolls then; a scripted focus never shows it. | Listed as KNOWN (at most 3 a cycle) in ui-access.mjs; BL194. |
| Tab stop under the bar (Edge, now and then) | A theory citation was left under the sticky bar right after Tab (Edge laid the theory out as the focus entered it, after its own scroll); seen in two of six Edge runs, a different citation each time. | The focus guard brings it in a frame later; ui-access.mjs checks every stop a frame after the press, as a visitor sees it. |
| Fragment focus (WebKit, BL193) | After a "→ theory" link followed by keys, the next Tab goes on from the link, not from the topic. | Listed as KNOWN; BL193 (a page fix moves the focus to the target). |

Checked and the same in all three: `Calm`'s spoken texts (its `innerText` reading; the live part of ui-access passes in
both: a drag once, a run "Running…" and "Done …", the player nothing), `:focus-visible` on the drawings' SVG `g`
handles (the ring shows on Tab in Firefox and WebKit), pointer events of the drawings' handles and pan-zoom, download
names, both 3D views in WebGL (each opens and turns; a view that could not would say "The 3D view needs WebGL, which
this browser did not give (…)"), MathML layout, the layouts at 320 px, 390 px and 200 % zoom (no sideways scroll, no
text cut, every control on the screen), contrast of 34,000 texts in both themes.

## What could not be emulated

- **WebGPU outside Edge**: Playwright's Firefox has `navigator.gpu` without an adapter, its WebKit has none, so only
  the fallback was checked there (BL195: real Firefox 141+ and Safari 26).
- **Touch outside Chromium**: taps only; drags are PointerEvents to our handlers, not the browser's gestures,
  `touch-action` or scrolling by finger. Firefox has no `isMobile`. WebKit on Windows is not Safari on iOS.
- **Firefox's Back** restores the scroll a little later than 400 ms after a long session: the short line's check waits up to 3 s for it now (it once missed in Edge too).
- **The accessibility tree outside Chromium** is Playwright's aria snapshot (its own computation in the page), not the
  engine's tree; the CDP audit's "focusable without a name" has no equivalent there. CPU throttling and
  `performance.memory` are Chromium only (none of the scripts run in Firefox or WebKit needs them).

## Check counts

`npm run ui` on the step's build: 24 scripts passed before ui-access and ui-browsers (ui-drag and ui-release included, no flake this time); the last fixes (the guard tied to the Tab key, the harness's waits) were checked by ui-access.mjs in Edge (218 of 218: 34,260 texts, 64,153 accessibility nodes in 5 states, Tab cycles of 600 and 606 stops, 1,236 touch targets), ui-why.mjs (142), ui-release.mjs (35) and ui-browsers.mjs (62 of 62) on the final build. ui-access.mjs in Edge 218 of 218 (Tab cycles 606 and 610 stops), Firefox 218 of 218 (606 and 613) and WebKit 218 of 218 (275 stops; KNOWN BL193); 21 tasks by keys and 21 by touch pass in each. First load
187.4 kB gzip (budget 200; 187.2 before: the fallback text and the label measure). `npx tsc --noEmit` clean; no
`lib/` change (`npm run check` not needed).

## For M9.2 (performance, size, memory over a 10-minute session)

- The focus guard adds a `keydown` and a `focusin` listener and a `requestAnimationFrame` per focus after Tab; nothing on the drag path.
  The label measure runs once per geometry change of the via (a canvas `measureText` per copper layer).
- The CPU fallback's rate: V8 (Edge's JS backend) about 3·10⁷ cells/s, SpiderMonkey and JavaScriptCore faster on
  this small case (BL196); a 10-minute session in Firefox or WebKit would be the first measure of their memory.
- ui-browsers.mjs takes about 10 minutes (two CPU runs of about 30 and 60 s, and ui-access in two engines).
