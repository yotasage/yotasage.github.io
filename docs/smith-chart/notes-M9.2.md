# Smith chart – notes of step M9.2 (browsers and touch)

Milestone M9 (milestones.md): every task in Edge, Firefox and WebKit, MathML included, and by touch emulation; fixes.
The check is `scripts/harness/smith/ui-browsers.mjs` in `npm run ui` (371 checks, about 2½ minutes).

## Browsers

Edge 157 (Chromium), Firefox 159 and WebKit 27.2 (playwright-core's builds, installed by `npx playwright-core install
firefox webkit` in scripts/harness/smith as in notes-M5.4.md; WebKit stands in for Safari on Windows).

| Browser | Mouse, 1440 px | Touch, 390 px | 320 / 390 px | Found and fixed |
| --- | --- | --- | --- | --- |
| Edge | 15 tasks pass, `page.pdf()` of the report | 15 tasks pass (CDP touch drags) | no sideways scroll | nothing browser-specific |
| Firefox | 15 tasks pass | 15 tasks pass (PointerEvent drags) | no sideways scroll | the sweep's trace on the chart was **not drawn** and the plot's return loss was **cut flat at about 17 dB** (below) |
| WebKit | 15 tasks pass | 15 tasks pass (PointerEvent drags) | no sideways scroll | nothing browser-specific |

The 15 tasks: load, edit (add a part, type a value), drag a handle, the chart (wheel zoom, a click or tap that reads),
undo and redo, Explain, the Equations panel, a derivation, the report (Print; the print-media DOM at A4's content
width shows only the report), solve and Apply, sweep (switch, marker, the trace and plot drawn where their points are,
pointing at the plot), export (SVG, PNG, .tex, three CSVs, .s1p, project: eight files saved), Learn (E1 "Reading |Γ|,
VSWR and return loss" played to "finished", with the load typed in step 4), the theory (a topic folded, a citation
followed). No console error or page error in any browser.

**MathML.** The Equations panel, the explanation and the derivation (every step shown) in each browser: every shown
`<math>` has a size, every `<mfrac>`'s denominator is below its numerator, no `<merror>` or `.katex-error`. The three
derivation screenshots are the same to the eye (spacing and fractions as in M5.4).

**The fix: SVG coordinates under 2^24.** Firefox clamps path coordinates to about ±2^24 (16,777,216) before drawing:
the trace's `d` was whole numbers of Γ × 1e9, so every point was clamped to one corner (its box on screen 3.2 px) and
the trace vanished; the plot's `d` was dB × 1e6, so a return loss over about 17 dB was drawn at 17 dB. Chromium and WebKit
draw both. Now `TRACE_SCALE` is 4e6 (|Γ| up to 4.19 drawn; a unit is 2.5e-7 of Γ, 0.05 px at the chart's 1024× zoom)
and `PLOT_Y` 4e4 (300 dB is 1.2e7; a unit is 2.5e-5 dB), with `VSWR_MAX` 100 (was 1e4, ten times the highest VSWR axis)
so a clipped VSWR stays under the limit too. ui-trace.mjs and ui-plot.mjs compare the DOM to the engine within the `d`'s
rounding (0.5 unit) and their old tolerances. ui-browsers.mjs checks that the trace and the plot are drawn where their
points are (the path's box on screen against its points mapped by its screen CTM, 4 px) and that no `d` or `points` on
the page has a coordinate at or over 2^24.

Also fixed: the derivation of `series-adds-z` and `shunt-adds-y` (and the ABCD entries) printed its assumption as
"I_2 flows out of port 2" in plain text; it is now "I₂".

## Touch

- **Every task by taps in all three browsers** (contexts with `hasTouch`, `locator.tap()` and `touchscreen.tap()`),
  at 390 px in the dark theme. The Equations panel is folded on a phone and is opened by a tap on its summary.
- **Chromium (CDP `Input.dispatchTouchEvent`), a section of its own:** one finger on a handle drags it and neither
  scrolls nor zooms; two fingers pinch the chart 3× about their midpoint with the page's scale and scroll unchanged;
  one finger up from the chart's box outside the disc (off the handles) scrolls the page past the chart (by at least
  100 px) and leaves the view; a finger along the plot points at a frequency; and the walk's drags are real touches.
- **What cannot be emulated.** Playwright's Firefox and WebKit drivers have `hasTouch` and taps but no touch move: a
  one-finger drag there is sent as touch `PointerEvent`s to the element under the finger (our handlers in that engine,
  not the browser's own gesture, `touch-action` or scroll), and a pinch or a page scroll by finger is not tried.
  Firefox has no `isMobile` (no meta-viewport emulation); WebKit on Windows is not Safari on iOS. `page.pdf()` exists
  only in Chromium: the report's print is checked in the others by its print-media DOM and the Print button.

## Harness

`ui-browsers.mjs` (after ui-a11y in ui.mjs): per browser the walk by mouse at 1440 px (light) and by touch at 390 px
(dark), the start and a sweep at 320 and 390 px (no sideways scroll), and in Chromium the gestures; screenshots of the
chart with a sweep and of a derivation per browser into argument 1 (default the temp folder's `smith-browsers`). A
browser that is not installed fails one check and says how to install it.

## A/B and timings

Interleaved A/B, B (this step) and A (sweep.ts and plot.ts stashed: `TRACE_SCALE` 1e9, `PLOT_Y` 1e6) in the order B, A, B, A on the running dev server, each `SMITH_TRACE_AB=1 tsx ui-trace.mjs` (ui-drag's 4× handle drag of 10 parts with a 10,000-point band, median of 3): main thread per frame B 12.69 and 12.50 ms, A 12.62 and 13.08 ms; mean B − A = −0.26 ms (pairs +0.07 and −0.58: noise; shorter integers print no slower). The coarse trace's and the plot's `d` are the only drag-path changes.

`npm run check` passes (1,399,628 checks); `npm run ui` passes 21 of 22 scripts, ui-drag failing only its two 4× timing checks known to fail on this machine with the old code too (M9.3): 2 frames lost, 12.07 ms per drag frame (143 of 145). ui-path passed this time; ui-browsers 371 of 371, ui-trace 62 of 62, ui-plot passed.

## For later steps

- A real phone (iOS Safari, Android Chrome) is still the owner's check: pinch and scroll by finger are emulated only in
  Chromium.
