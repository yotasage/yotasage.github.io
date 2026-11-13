# Notes of M5.4: "Explain this move", and the M5 roll-up

learning.md §3: a change of a part narrated in words and equations: which equation applied, the circle the point moves
on, which way and why, with the live numbers; no animation with reduced motion.

## What is on the page

- **Where: the part card.** The card is where both moves start (its fields are typed into; a drag picks its part, so
  the card that shows after the drag is the dragged part's) and where the reader's eye already is. The Equations panel
  was the other choice: it sits below the node table, far down the side column (notes-M5.1.md "For M5.2"), and its rows
  are rewritten by MathLive in drag frames. A panel by the chart would cover the chart on a phone. The card grows
  downwards; on a phone the side column is below the chart, so the chart does not move.
- **After a move** (a drag's end, a typed value, a handle's arrow keys, undo: any render in which exactly one part's
  value changed; changes of one part within 1.5 s are one move, so typing "47p" is one move from the value before the
  first keystroke), the card shows: the value from old to new; the coordinate that changes (x, b, r, g; a line's or
  stub's length, λ/4's Zt/Z0) from old to new with its Δ; the node the part ends at, its turn ("turned clockwise on the
  r = 0.5 circle"; a resistor "towards / away from the open at Γ = +1"), z before and after and |Γ| rising or falling;
  and the reason in theory.md §4's words. "Hide move" hides it until the next move. Nothing is computed or shown during
  a drag: Strip renders on the commit at the drag's end.
- **"Explain"** (a toggle on the card, short line `explain`) shows the part's whole arc from no effect: the rule of its
  kind (series adds z, shunt adds y, the sign of what L and C add, resistors along their x or b arcs, stubs as shunt
  parts, lines turning about their own chart's centre), which way and why, why it is a circle (the Möbius map) with the
  circle's centre and radius, the arc's start at no effect and its end with z, |Γ| and the changing coordinate; then the
  equations that apply with the numbers put in (the panel's own printer, mathRows.rowOf: the part's equation,
  `series-adds-z` or `shunt-adds-y`, `gamma-z`; the circle as its registry equation with the kept r, g, x or b put in
  and its centre and radius; for lines `line-rotation` or `line-circle-b`, `-centre`, `-radius`); Derive opens the
  part's derivation (`openDerivation` with the part as subject), "→ theory" the topic (Moving on the chart, or
  Transmission lines for lines and stubs). Citations go through the page's Bibliography (Strip gets `bib`); the sources
  are already numbered by the theory before any explanation renders, so the numbers do not shift.
- **The trace.** After a move, a marker (`data-trace`) runs once along the change (geometry.ts's locus, explain.ts
  `movePath`), 0.9 s; "Trace on the chart" in the arc view runs it from no effect. It is one HTML element in the path
  layer's contained marks box moved by a transform in its own animation frames: the chart is not redrawn. A drag
  stops it, and with prefers-reduced-motion it never runs and the Trace control is not shown.
- **Data** (lib/smith/explain.ts, framework-free): `explainPart` and `explainMove` return structures; the sentences are
  made in Explain.tsx. The sense follows theory.md §4's rules (sign of x or b for L, C and stubs; clockwise for lines;
  larger L or C, or a longer line or stub, clockwise; resistors towards their pole), and the harness checks it against
  geometry. For a λ/4's Zt change no claim of §4 gives the sense: it is taken from three points of the locus and stated
  without a "why".
- **Status note:** "explains each move of a part on the chart"; "Still to come" no longer lists the equation layer.

## Harness

- `check-explain.mjs` (in `npm run check`): every kind × 200 random circuits (the part at a random place among 0–4
  others; opens, shorts, rim loads): 2000 explanations, numbers against network.evaluate and parts.added (a series part
  keeps r and adds its x, a shunt part keeps g and adds its b), 1957 circles against partArc's and partLocus's (worst
  8.8e-14), 1951 senses against partArc's sweep and full turns, 43 still and 6 straight cases, every id in the registry
  and the derivation with steps; a random change of every case: the sense against geometry's local direction of travel
  at nine places from old to new (all must agree; a first version that summed the angle in fixed steps missed a stub's
  full turn made in a narrow band of lengths), |Γ| change, the trace's ends; the start circuit's "Live numbers" of
  theory.md §4. `npm run check`: 1,390,582 of 1,390,582.
- `ui-explain.mjs` (in ui.mjs): a drag (nothing explained or traced during it; the marker after it), a typed value, a
  handle's arrow key, a typed value by tap at 320 and 390 px dark: the move against explainMove (old and new value, z
  and |Γ| before and after, Δ, sense); the arc of parts 1 and 2 against explainPart (z, kept, added, circle, from, to,
  sense, the equation ids, no MathML error), Derive opens the derivation, the theory link; reduced motion: no marker,
  no Trace; the keyboard alone (arrow key, Tab to Explain, Enter, Tab to Derive, Enter, Escape twice, focus back);
  the explanation inside the card and no sideways scroll. 77 of 77.
- `ui-why.mjs`: 58 lines, 669 of 669.

## Performance

Interleaved A/B with ui-drag.mjs (10 parts, 2 s drag), HEAD's app code (the changed files stashed) against this
step's, alternating, two runs each; main thread per drag frame, ms (each 4× figure the median of its attempts' medians):

| Run | HEAD 1× | HEAD 4× | after 1× | after 4× |
| --- | --- | --- | --- | --- |
| 1 | 2.55 | 11.99 | 2.89 | 10.88 |
| 2 | 2.72 | 10.75 | 2.38 | 11.98 |

Means at 4×: 11.37 (HEAD) and 11.43 (after): +0.06 ms, within the noise and under the 0.3 ms allowed. A drag frame
does nothing new: the move is found and explained in the render of the drag's commit, and the trace never runs in a
drag (beginDrag stops it). ui-drag's absolute 4× budget and 4× frame-loss checks fail on this machine at HEAD as well
(notes-M4.3a.md); 143 of 145 in all four runs. The full `npm run ui`: 12 of 13 scripts, ui-drag the only failure with
those two checks (ui-why first failed on its line count, 57 → 58, then 669 of 669).

## M5 roll-up (milestones.md M5 "done when")

| Item | Result | Evidence |
| --- | --- | --- |
| Every equation on screen passes the numeric check | pass | check-equations.mjs (registry against the engine, every derivation step an equality at 200 random points); ui-math (every panel row's sides on the binding, 4 circuits), ui-derive (34,023 checks: every shown step's sides on the registry's tree), ui-theory (4,998), ui-explain (the explanation's numbers against explain.ts, which check-explain holds against the engine) |
| TeX renders with errors turned on | pass | ui-math and ui-derive render every TeX string with KaTeX `throwOnError`, `strict: 'error'`; ui-explain finds no MathML error in the arcs |
| Screenshots in Edge, Firefox and WebKit | pass | Edge: every ui script and this step's shots. Firefox and WebKit installed by `npx playwright-core install firefox webkit` in scripts/harness/smith (playwright-core's own CLI; the `playwright` package is not a dependency): the Equations panel and the `series-adds-z` derivation in each (206 MathML elements, no error, no page error); MathML spacing and fractions as in Edge |
| The panel within budget at 1× and 4× | 1× pass, 4× excepted | ui-math's panel cost at 4× (+0.15 to +0.58 ms, within its own check); ui-drag's absolute 4× budget and 4× frame-loss checks fail on this machine at HEAD as well (notes-M4.3a.md), so this step is held to an interleaved A/B instead (above) |
| A fresh reading agent reads every derivation | pass (replaces the owner's reading, D19) | notes-M5.3.md "Read-through": all 26 derivations read, 8 steps added (110) |
| No number below the rounding floor of D20 in scientific notation | pass | ui-math: no `10^{-n}` (n > 12) in text or MathML outside `data-math-raw` after the start circuit's exact solutions and a scripted exact match; check.mjs "quantity: rounding level (D20)" (21); the explanation prints through formatAmount and complexText (D20's floor for z) |

M5 is done.
