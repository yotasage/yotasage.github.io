# Smith chart – notes of step M4.3b (the solver on the chart)

Part of [plan.md](plan.md); builds on [notes-M4.3a.md](notes-M4.3a.md) (the Solve panel). Checks: `npm run check`
(`check-state.mjs` "value lists in the link (M4.3b)", `check-values.mjs` `around` against eseries.ts `neighbours`) and
`npm run ui` (`ui-solve-chart.mjs`, new, run by `ui-solve.mjs`; `ui-drag.mjs` snapping and keys per list).

## What is on the page

- **The goal on the chart** follows the circuit's goal (`askOf(c).goal`; M3's fixed VSWR 1.5 ring is gone): a point
  target has its mark (`data-goal`) and its close-enough ring, the circle of mismatch ≤ |Γ| 0.2 (VSWR 1.5) about it
  (`goalView.ts` `mismatchCircle`: a circle in Γ, about the centre M3's ring); an inequality goal its circle with the
  mark at the centre; an exact circle (|Γ|, VSWR, RL, r, g, x, b) its circle, no mark, open where the rim cuts it
  (`data-open`, not filled). The dashed line runs from the goal's node (not always the input) to the mark, or to the
  circle's nearest point. An r or x goal's open, a g or b goal's short (`goalPole`) is crossed out (`data-goal-pole`).
  The node table's goal line names the goal and its node and says inside/outside (point, inequality) or on it/off it
  (exact circle, within 1e-6 in Γ); the default reads as in M3.
- **The construction's circles** (`SolveResult.circles` at `circleNode`): circle 0 in the first unknown's part colour,
  circle 1 in the second's (two unknowns, a point target) or the accent (the goal carried back: one unknown, best,
  family); muted (1.5 px, 55 %). Both cut to the unit disk. The crossings of a solved pair are marked (`data-crossing`).
  A line under the result (`data-solve-circles`) says where they are and what they mean.
- **Previews**: a solution, a family member, a standard-value variant or the family's slider previews its circuit
  (dashed path in the text colour, `data-preview`, a dashed ring at its goal node) on mouse hover, on focus (Tab, or a
  tap, as the items are focusable) and leaves with the pointer or the focus. Hover wins over focus. Apply stays the only
  commit. Delegated on the result box by a key per item (`data-pv`); the circuit is made only when shown.
- **Family slider** (`data-family-slider`, a native range: arrows, PageUp/Down, touch): positions 0–1000 over the first
  unknown's ranges end to end (`familyT`, 1e-6 inside each end; the ends are listed already), `family.at(t)` live with
  its 0–2 members (`data-member`, Apply `data-apply-member`, variants, previews); starts in the middle of the first range;
  `aria-valuetext` is the first unknown's value.
- **Standard values** (D17): a closed "Standard values: R E24 · L E24 · C E24 · Zt any value" disclosure at the foot of
  the Solve panel (chosen over the toolbar: the toolbar is full on phones, and the panel is where the variants are)
  with a select per kind (R, L, C, "Zt, Zc") of E6–E96, own list, any value; an own list is a textarea read by
  `parseOwnList` on every keystroke (count in the label, entries not read shown). Lengths keep "any" (only the link can
  change them). Kept in the link (`vl`, values.ts `choiceToText`, not a circuit parameter, so no undo step) and in
  localStorage (`smith.lists`), read after mount; the link wins.
- **Variants** under every solution and member (`data-variant`, values `data-variant-value` with `data-raw`, Apply
  `data-apply-variant`): `standardVariants` in its order, with |Γ| and "comes within … of the target", "keeps the goal",
  "on the goal" or "off the goal by …"; none when no value moves (every list "any value", or values already standard).
- **Snap** (pathLayer.ts): `SNAP_SERIES` is gone; a drag snaps to `around(raw, list)` of the part kind's list (R, L, C,
  Zt, lengths; "any value" none), the label "33 pF · E24", "35 pF · own list", "51 Ω · E24", "0.125 λ · E12". Keys with
  Snap on: an E-series list steps by stepValue's mantissas, an own list to its next entry (three with Shift), any value
  by 1 % (10 %); lengths by whole degrees as before. Zt now drags and steps freely by default (it snapped to E24 in M3).
  The short line `snap` (whys.ts, theory.md §8, claims.md) says "each kind's listed values (E24 unless changed)".

## Decisions and fixes on the way

- `values.ts` `around` built 288 values from text per call for E96 (eseries.ts `neighbours`): now four values round the
  mantissa's place, bit-equal to `neighbours` on 34,530 values (random, every standard value of 21 decades, ±1 ulp and ±1e-10 of each), under 5 µs budget (check-values).
- `parseOwnList` keeps a typed value as its decimal (`Number(v.toPrecision(15))`): "22p" was 2.1999999999999998e-11.
- The link was not written on load when only the lists changed (localStorage): Next.js hydrates a static page's query
  with a `replaceState` of the link as loaded, after the page's effects. main.tsx now writes the link once
  `router.isReady`.
- The ring moved from pathLayer.ts to solveLayer.ts; the attribute naming the goal kind on it is `data-ring-kind`
  (`data-goal-kind` is the panel's select).
- check-values.mjs's new random values use a stream of their own: on the shared stream the validation groups after it
  got other problems, and two of those fail (BL56).

## Performance

Nothing is computed per drag frame: the ring, circles and preview are rebuilt when the goal, the outcome or the
preview changes and rewritten only when the world frame is set again; the marks move on view frames only. The drag
frame pays one comparison in SolveLayer's frame hook, `around` (under 5 µs, check-values) instead of the old E24 scan, and in half 0 of
the live texts one evaluation for the goal's node (µs). ui-drag's 10-part drag at 4× CPU, same circuit, this session:
before the step (HEAD 674b741, at the start of the session) 10.07 ms per frame (runs 9.88–10.95); at the end 8.10 ms standalone and 12.64 ms inside `npm run ui` (machine load). So the drift is larger than any step: an interleaved A/B (HEAD in a worktree on port 3021, this step on 3020, five rounds each, `tmp` script not kept) gave medians 9.89 (HEAD) / 9.17 ms (this step), and in the other order 8.14 / 8.02 ms. No measurable cost; ui-drag's absolute 4× budget of 10 ms still fails on this machine when it is busy, as notes-M4.3a.md says.

**Lesson (also for agent-workflow):** a Next.js 16 dev server (Turbopack) makes junctions in `.next/node_modules` to the packages it keeps external; `git worktree remove --force` (or a recursive delete) of a folder holding such a `.next` follows them and empties the real package (`katex` here, so the page failed to build). `npm install` restored it. Delete such a `.next` with `cmd /c rmdir /s /q` after stopping the server, or keep A/B copies' `.next` out of the way.

## Checks

- `npm run check`: 1,375,893 checks pass (new: \"state: value lists in the link (M4.3b)\" 2,000 random choices through the link to the text, a link with only `vl`, broken tokens, an exponent's '+'; \"values: neighbours\" `around` vs `neighbours` and its time).
- `ui-solve.mjs` 473 checks (M4.3b in `ui-solve-chart.mjs`): 22 circles and 133 path points on the engine's circles to 1e-9 over 11 circuits (A radii, open arcs on the rim), the ring of every goal kind used, 9 crossings on the solutions' points, the mark and the crossed-out pole, the node table's goal line for an r goal at node 1; 15 previews (hover per solution, focus, focus on Apply, leaving by mouse and focus, a variant, a tap at 390 px, a tap elsewhere clears); the slider by 40 arrow keys and PageUp against `family.at` for the t it reports, its preview, Apply on a member and its Undo, a finger tap at 390 px; 20 variants equal to `standardVariants` for E24, L on E12 and an own C list, a variant's Apply exact, none for any value; the lists in the link and localStorage, restored from localStorage without `vl`, the link's `vl` winning.
- `ui-drag.mjs` 145 checks: C snaps to 36 pF on E24, never to 36 pF on E12 and to 39 pF there, to 35 pF of an own list, not at all on any value; λ/4 not by default and to 51 Ω on E24 (labels \"· E24\", \"· E12\", \"· own list\"); keys 33 pF → 39 pF (E12), → 35 pF (own), × 1.01 (any).
- `npm run ui`: 8 of 9 scripts pass; ui-drag fails only its absolute 4× budget (12.64 ms in the suite's run, 2 frames lost), judged by the A/B above.

## For M4.3c and M4.4

- M4.3c: short lines for the new controls (the lists, the slider, the previews, the circles' line) and the theory
  topics; the `data-solve-circles` sentence is the place to link "matching-with-two-parts".
- M4.4: suggestions can reuse `Variants`, the previews (`data-pv` keys) and `SolveLayer.setResult` for a suggestion's
  circles.
- Family members at a value's limit are still shown as they come (notes-M4.3a).
