# Notes of step M2.4c – Theory and References on the page (2026-11-16)

## Components

- `components/EmSim/Theory.tsx` (topics 0–3, the frame, `TOPICS`, `bibOf`, `References`), `Theory2.tsx` (topics 4–6),
  `theoryKit.tsx` (`Eq`, `citeWith`, `Topic`, `Sub`, `N`, `Live`), `TheoryFigures.tsx`, `styles/EmSimTheory.module.css`:
  one chunk, loaded by `import('./Theory')` in EmSimTool when `#theory` or `#references` comes within 400 px of the
  window, or when the hash names an id outside Stackup/Trace (then scrolled to once it exists). The sections are empty
  frames in the static HTML. The text is theory.md / theory-2.md as written, without the ⟨n⟩ markers; example numbers
  stay static.
- Citations: `cite('Key', 'at')` → `[n, at]` linked to `#ref-Key`, numbered by the page's one `Bibliography`
  (`References` renders after `Theory` in the same React pass, so the order is the page's). Because the theory is not
  rendered at build time, `getStaticProps` of `pages/em-sim/main.tsx` scans `cite('Key'` in `components/EmSim/*.tsx`
  plus the registry's sources: an unknown key stops the build, and only the cited entries go into the page props.
- First load 169.0 kB gzip (166.9 before: the feed, the frames, `useReplayHighlight`); the theory's chunks (with KaTeX
  and the registry) 110 kB gzip, loaded later.

## How live numbers are fed

`components/EmSim/theoryFeed.ts` (first load) is a small store: TraceSection feeds its last full solve for the shown
setup (not during a drag, so drag frames stay cheap: the drag budget of ui-drag failed while the theory re-rendered
every frame), CalcTool its field, calculator and parts after a complete run, ToleranceTool its corners and Monte Carlo.
Theory shows a tool's numbers only while its setup `sameSetup`s the solved one. The worker's results carry no `bem`;
`jobs.ts` `withMatrices` now also sends each level's C, C0, L (`Matrices.levels`, **copied**: the worker transfers
what it sends, and transferring the cached solve's arrays broke the H and current maps), and Theory puts them back as
`bem` for `emBinding`. Zdc of a symmetric pair (1e-14 Ω of rounding) is printed as 0. Nothing is solved on the main
thread; `closedForms` (formulas only) gives Getsinger's h/εr and `pct-diff`'s formula (the first one with the main key).

`Eq` prints a relation with numbers only when the entry fits (line/pair/any) and `bindingFor` gives every symbol;
else symbolic with a note of what gives numbers (Calculators, Tolerance, a pair, a microstrip).

## Figures

Done: default microstrip field lines (topic 1), the L–C ladder (SVG), odd and even field lines of the default pair
(topic 3), |E| with and without mask (topic 4, each map on its own scale, said in the caption), the parts bars (topic
5; the default example's numbers until Calculators has run) and the ranking bars with corners and ±2σ (topic 6; the
default's until Tolerance has run, σ from Monte Carlo when run). Field figures are `TraceDrawing` with the new `still`
prop (no handles) and the field view, on fixed setups, each on its own worker channel (`FieldEnv.channel`, new),
mounted when within 600 px. Left: the panels of two levels, the trapezoid close up, one shared colour range (BL110).

## Checks

`ui-theory.mjs` (81): see modules-page.md. Live numbers checked on the default microstrip (at least 10 equations
incl. z0-lc, delay-lc, eeff-c, l-c0, v-eeff, lambda-eeff, getsinger, getsinger-limit, order, pct-diff), after a typed
width 0.2 mm, and on the default pair (19 equations), within 1e-9 relative. `npm run ui` 578 of 578, `npm run check`
19 221.

## For M2.4d

- Anchors: `how-to-use`, `transmission-lines`, `field-solver`, `pairs` (`pair-definitions`, `coupling`, `two-speeds`),
  `structures` (`trapezoid`, `solder-mask`, `coplanar-ground`, `copper-thickness`), `calculators` (`closed-forms`,
  `jlcpcb-calculator`), `tolerances`, `references`; every topic and sub-anchor has `data-topic`.
- A short line's "→ theory" is a plain `<a href="#field-solver">`: the hashchange loads the chunk if needed and scrolls
  to the id once it exists; `.topic:target` / `.sub:target` fade in (`useReplayHighlight` in EmSimTool replays it on a
  second click of the same link). The short lines themselves stay in the first load (text only; no KaTeX).

## Fix after M2.4c (2026-11-16)

Dragging a width got slower with this step: at 4× CPU throttle, 16.1–17.2 ms of main-thread work per frame against
10.2–12.9 ms before, with 2–9 dropped frames where there had been none. The drag frame's own work (p50/p95) and the
script time did not change. A Chromium trace of a 2 s drag showed where it went: Paint 601 → 859 ms and PrePaint
82 → 333 ms. The loaded Theory (about 3 000 elements of text, KaTeX and figures) is below the Trace section but inside the
area the browser paints around the window, so every drag frame painted it again. The solve results' new
`Matrices.levels` (a few n×n arrays) and the feed (`feedTheory` is not called during a drag) cost nothing measurable.

Fix: once the Theory is loaded, `#theory` and `#references` get `styles.offscreen` (`EmSim.module.css`:
`content-visibility: auto` and `contain-intrinsic-size: auto 14000px` / `2000px`). The browser then skips their layout
and paint while they are off screen; links into the theory, find in page and the figures work as before. EmSimTool's
IntersectionObserver that loads the theory now disconnects once it has loaded. After the fix Paint and PrePaint are
the same as before M2.4c.

`ui-drag.mjs` A/B, production builds, interleaved, 5 runs each (mean task/frame; dropped frames over all runs):

| structure | 1× before M2.4c | 1× fixed | 4× before M2.4c | 4× with M2.4c | 4× fixed | dropped at 4× (before / fixed) |
|---|---|---|---|---|---|---|
| microstrip | 2.24 ms | 2.31 ms | 10.63 ms | 16.1–16.5 ms | 11.58 ms | 0 / 0 |
| pair-microstrip | 2.69 ms | 2.85 ms | 11.57 ms | 16.5–16.8 ms | 12.36 ms | 0 / 0 |
| pair-cpw | 2.77 ms | 3.03 ms | 12.14 ms | 16.8–17.2 ms | 12.07 ms | 1 / 0 |

Single runs scatter by ±0.7 ms. What is left, about 0.8–1.0 ms at 4× on the microstrip and the pair microstrip, comes
from the loaded theory but not from drawing it: the same harness with the sections hidden by `display: none` after the
theory had loaded gave 11.3 and 11.9 ms, and with the theory never loaded 10.7–10.9 and 10.7–11.5 ms. Most likely the
larger heap (the theory's DOM and React tree) makes garbage collection dearer. It is BL111.
