# Smith chart – notes of step M4.4b (suggestions on the page) and the M4 roll-up

Part of [plan.md](plan.md); the engine is [notes-M4.4a.md](notes-M4.4a.md), the panel [notes-M4.3a.md](notes-M4.3a.md)
and [notes-M4.3b.md](notes-M4.3b.md). Checks: `npm run ui` (`ui-solve-suggest.mjs`, run by `ui-solve.mjs`; the new
line in `ui-why.mjs`). Last step of M4: owner checkpoint 2 follows.

## What is on the page

- **Suggestions** under the Solve panel's "Nothing is marked yet" text (which now ends "or take a suggestion"), when
  nothing is marked: `suggestOffPage(circuit, { lists })` in the suggestions worker (newest request wins; cancelled
  when something is marked). The box has `data-suggest-status` (`looking`, `holds`, `some`, `none`, `rejected`) and a
  head (`data-suggest-head`):
  - `some`: "Suggestions: change one value, or two, to meet the goal (the smallest changes first)." or, when none of
    them meets it (one part and a point, say), "No change of one or two parts meets the goal exactly; the nearest:".
  - `holds`: "The circuit already meets the goal at the input: nothing needs to change."
  - `none`: "No change of one or two parts meets the goal: {reason}. Add a part, or choose another goal."
  - `rejected`: "No suggestions: {reason}." (cleanAsk keeps bad goals out of the link, so the page does not reach it
    in the harness).
- **Each suggestion** (`data-suggestion`, `data-meets`, `data-gamma`, `data-mismatch`, `data-residual`) is the
  solution row of M4.3a/b: its value(s) (`ValueText`, `data-value`/`data-raw`, the kind when swapped, "true at this
  frequency only") with the part's value now beside it ("now 31.83 pF"), "meets the goal: |Γ| = … at the input" or
  "comes within m of the target (|Γ| = …)" or "off the goal by …", "not of the part's own kind"; **Apply**
  (`data-apply-suggestion`, `applySolution`, one undo step) and **Solve for** (`data-mark-suggestion`: marks the
  suggestion's unknowns, so the panel solves them with every solution and the circles); its standard values (the
  suggestion's own `variants`) folded in "With standard values (n)" (`data-variant-fold`, a `details`) so eight rows
  stay short enough to scan on a phone; each variant previews and applies as under a solution.
- **Previews**: hover, focus or a tap on a row or its variant draws its circuit (as before) **and the suggestion's
  construction circles** at its `circleNode` (two unknowns: the two loci with their crossings; one: the part's circle
  and the goal carried back). `SolveLayer.setPreview(c, shape, base)` draws a `CircleShape` in place of the result's
  circles while shown and puts the result's back after (`drawCircles`, split out of `setResult`).
- **Stale**: while the next list is found, the last one stays with `aria-busy` and its Apply/Solve for disabled (it was
  found for another circuit, and applying it would undo the edits since).
- **Short line** `solve-suggest` beside the first suggestion: "One changed value reaches a point only by chance; two
  reach it exactly." → `one-value-and-a-point` (claims 153, 154; theory.md §8 table, claims.md short lines). 54 lines.
- **Home card and README** say the tool finds missing values (one or two unknowns, the goals, circles, standard values,
  suggestions); "E24 values" became "standard values".

## Checks (ui-solve-suggest.mjs)

Three circuits with nothing marked (the start circuit with its load at 30 + j10 Ω: two exact pairs and two singles;
the same with VSWR ≤ 1.5: one single; three parts with a point Z target: three nearest singles): every row equals
`suggest()` for the linked circuit (order, part, param, kind, value to 1e-12, meets, |Γ|, variant count); `holds` and
`none` texts; previews by hover (every row), focus, a folded variant, leaving (preview and circles gone); Apply on every
row gives the |Γ| it states to 1e-9 (the goal held when it meets) and one Undo restores the circuit; "Solve for" marks
the parts and the panel solves; keys alone (Tab to a row: preview; Tab to Apply; Enter; Ctrl+Z); at 390 and 320 px no
horizontal scroll, a tap previews and Apply by tap. Counts: 3 circuits, 8 suggestions, 10 values, 12 previews,
8 applied; ui-solve 587 of 587.

## M4 "done when" (milestones.md), rolled up

| Item | Evidence | |
|---|---|---|
| Exact cases have a residual below 1e-9 | check-validate "closed-form cases" (7 problems, 13 solutions, worst 1.1e-15), "regressions" (13, 70 solutions, worst 3.6e-11); every solution of every validate group re-evaluated by network.ts, worst 3.6e-10 (the BL56 pair at 4.7e-9 is rounding of the high-Q case, bar 1e-9 plus its conditioning, notes-M4.2.md); check-suggest: 888 suggestions re-evaluated to 1e-9; ui-solve: Apply on 20 solutions and 8 suggestions meets the goal to 1e-9 on the page | pass |
| Brute force finds no missed solution on 200 or more random problems of each kind | check-validate: two unknowns with a point target 240, one unknown with a circle goal 240, best value 240, ranges 240, families 220, fallback one unknown 200, fallback two unknowns 280 (notes-M4.2.md's table), and three more seeds of the fallback each run (100 and 56 problems per seed) plus the BL56 and BL58 cases; 0 missed, 0 false in every group of this step's run; check-suggest: 524 singles against a 20,000-point scan, none worse, 364 pair solutions of solve() all suggested | pass |
| The same input gives the same order | check-validate "determinism": 671 of 671 results identical on a second run; check-suggest: the same JSON twice | pass |
| Time within budget | check-solve "solve timing": two unknowns in a 10-part circuit 5.3 µs median, one unknown 1.9 µs; check-solve-b: best 20 µs, family 0.06 ms, fallback 0.14–2 ms; suggest 0.04 ms (start), 0.5 ms (ten parts); slow problems in the worker (ui-solve: a 41 ms solve with no long task on the page). **Excepted:** ui-drag's absolute 4× budget (10 ms per drag frame at 4× CPU throttle) passed in this step's run (9.14 ms) but usually fails on this machine, also for code before M4.3a: its baseline drifted from 9.0–9.5 ms (M3.5) to about 12 ms (notes-M4.3a.md "Main session's check"); this step adds nothing to the drag. To be proven again on a quiet machine before M9 | pass, ui-drag 4× excepted |
| A scripted case reaches every message of the counting table | ui-solve "messages reached": best, coincident, degenerate, family, none, nothing, range, rejected, samejob, samejob-all, solved, tangent (all 12 of `MUST`) | pass |

Owner checkpoint 2 (milestones.md M4) can be run on the page: mark C in a two-part circuit (answers and circles), free
one unknown with a point target (the "only by chance" message with a second value suggested), pick a solution, open
its standard values, apply one and read the |Γ| it gives.

## Counts

- `npm run check`: 1,389,933 of 1,389,933 (unchanged: no engine change).
- `npm run ui`: ui-grid 20,719, ui-chart 309, ui-strip 347, ui-drag 145 of 145 (its 4× drag 9.14 ms per frame, inside the 10 ms budget in this run), ui-edit 3,714, ui-theory 4,983, ui-why 625, ui-solve 587 pass; ui-path 1,118 of 1,119 in the full run (the known 4× zoom frame loss, 9 frames, notes-M4.3c.md), 1,117 of 1,117 alone.
- `npx tsc --noEmit` and `npm run build` pass.

## For later

- Pairs for a circle goal are families (BL59): not suggested yet.
- `rejected` is reachable only by a goal the link and the fields already refuse; its text is not exercised.
