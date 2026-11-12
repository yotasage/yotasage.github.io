# Smith chart – fix after M3.5b (the drag's frame cost with the theory on the page)

After M3.5b, ui-drag's 4× drag measured 10.0–11.1 ms of main thread per frame and 2 frames lost (8.4–8.9 ms and 1
without the theory). notes-M3.5.md guessed the page's DOM (4,100 nodes, 3,600 of them the theory's).

## What it was (CDP traces of the 2 s drag at 4× CPU, headless Edge, dev server)

- **Not the DOM.** Removing `#theory` and `#references` from the DOM after hydration left the drag's frames as they
  were (10.4 vs 10.7 ms): style recalc touched 41–44 elements a frame and layout 16–153 dirty objects either way,
  paint, Layerize and the rAF script were the same. Containment had nothing to cut.
- **The commit on release.** The pointerup's commit rendered the theory synchronously with the tool: one task of
  230 ms at 4× (React's development build: `jsxDEV`, `console.createTask`, fibre logging over 3,600 nodes; KaTeX only
  for the lines whose numbers changed), against 48 ms for the tool alone. The timing window ends after it, so it
  added about 1.5 ms to every frame's average.
- **The pick at the drag's start.** The first move selects the dragged part (`onPick`), a sync page render of
  ~31 ms at 4× (Strip, Nodes, Chart), which lost 1–2 frames with or without the theory.

## The fix

- `pages/smith-chart/main.tsx`: the Theory renders `useDeferredValue(circuit)`, so the commit renders the tool only
  and the theory follows in a time-sliced background render (yields every 5 ms; restarted if another commit comes).
  The theory and references sections are one `useMemo` element on `[bib, theoryCircuit]`, so other page renders (a
  pick, a selection, undo state) skip them and the reference list entirely. Citations are still made in page order
  in one render, so the numbering is unchanged.
- `components/Smith/pathLayer.ts` passes `drag = true` with the pick at a drag's first move, and the page selects in
  `startTransition`: the side panel's re-render is sliced and no longer drops the drag's first frames; the live
  frames rewrite the card once it is mounted (as before, through `select`).
- No visible change: the numbers in the theory still follow every commit (a frame or a few later).

## Numbers (ui-drag's timing: 10 parts, a line's handle circled 2 s, snapping off)

| | main thread per frame at 4× | frames lost |
| --- | --- | --- |
| before (M3.5b), ui-drag | 10.0–11.1 ms | 2 |
| after, ui-drag (`npm run ui` and twice alone; median run of 3) | 9.0–9.4 ms | 0–1 |
| after, a fresh page in a trace script (the same drag) | 7.3–8.7 ms | 0–1 |
| zoom (ui-chart), after | 4.6–5.0 ms | 2 (5 grid rebuilds) |

The 9 ms aim is met on a fresh page, not in ui-drag, which times the drag after its other checks on the same browser:
there it is 9.0–9.4 ms, so the check stays at 10 ms. What a 4× drag frame costs now (trace, fresh page): style
0.8 ms (41–44 elements), layout 1.5–1.9 (16–153 dirty objects of the tool), paint 1.8–2.1, pre-paint 0.5, Layerize
1.0–1.4, the frame's script 1.3–1.7, the harness's pointer events and timers 0.7–1.0, the release commit of the tool
(45 ms once) 0.4 a frame on average. None of it scales with the theory; cutting further means the side panel's
layout and paint (notes-M3.3a.md) or Layerize.

Interleaved A/B on the same machine after the deferred render (5 runs each): with the theory 7.3–8.7 ms (median 8.6),
with the theory not rendered at all (a temporary switch) 8.8–9.3 ms (median 8.8): the theory no longer costs the drag
anything measurable. The machine drifts by ±1–2 ms between minutes (one run of the same build took 12.6 ms), which is
why the timing checks measure again.

## Harness

- ui-chart, ui-path and ui-drag: a rate whose timing checks fail is measured again, up to twice, and passes if any
  attempt passes; the line printed at the end lists the main thread of every run of every attempt.
- ui-drag's 4× bounds stay: 10 ms of main thread per frame, lost frames ≤ grid rebuilds + 1.
- `npm run ui` is `node ui.mjs`: every script runs even if one fails, the failures are listed at the end and the exit
  code is 1 if any failed.
