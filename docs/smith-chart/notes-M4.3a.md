# Smith chart – notes of step M4.3a (the Solve panel)

Part of [plan.md](plan.md); the solver is [solver.md](solver.md), its API [notes-M4.1a.md](notes-M4.1a.md),
[notes-M4.1b.md](notes-M4.1b.md), its validation [notes-M4.2.md](notes-M4.2.md). Checks: `npm run check` (state
groups "unknowns and goal in the link", "broken unknowns and goals", "marking and edits keep the unknowns on their
parts" in `check-state.mjs`) and `npm run ui` (`ui-solve.mjs`, new; `ui-why.mjs` and `ui-drag.mjs` adjusted).

## What is on the page

- **Solve for**: on the selected part's card (`Strip.tsx`, `data-solve-row`) a toggle for its value (`data-solve-mark="value"`:
  R, L, C, length or Zt) and, for a line or stub, its Zc (`"zc"`); a marked L or C gets "L or C" (`data-solve-free`: a
  series reactance or shunt susceptance whose sign picks the kind). A marked part's tile has `data-unknown` (a "?" in
  its corner, ", solved for" in its name). The Solve panel (`components/Smith/SolvePanel.tsx`, between the strip and the
  node table) lists the marks as chips (`data-unmark`) and has the f0 toggle.
- **At most two**: a third mark replaces the oldest and says so ("At most two at a time: part 1’s C is no longer solved
  for.", `data-mark-note`, shown until the next change). Chosen over refusing: one press always does what was asked.
- **Goal**: node (`data-goal-node`: the input by default, the load, between k and k + 1) and kind (`data-goal-kind`: the
  centre; a point Z with R and X in Ω; VSWR, |Γ|, return loss with "or less"/"or more" (`data-goal-within`); r, g, x,
  b circles). Defaults need no typing: VSWR ≤ 1.5, |Γ| ≤ 0.2, RL ≥ 14 dB, r = 1, g = 1, x = 0, b = 0; a point starts at Z0.
  Fields are Strip's `Field` (now exported), read per keystroke, checked with `goalProblem`.
- **Counting line** (`data-solve-count`) and **result** (`data-solve-status`): `nothing` (how to mark), `solved` (n
  solutions), `tangent` (one: the circles touch; not used for a lucky hit of one unknown on a point, which is `one`),
  `one`, `none` (the solver's reason), `samejob` (none, the same circle), `samejob-all` (coincident, the same job),
  `coincident` (every value keeps a circle goal), `degenerate`, `best` (the nearest values, the mismatch reached and a
  suggested second value: the nearest non-R part on the source side of the unknown before the goal, else f0 or a part),
  `range` ("any C of part 1 from … to …", `data-range` with `data-min`/`data-max`, then the edges), `family` (ranges of
  the first unknown, the solutions at the range ends, and how to pick one), `rejected` (the reason), `solving`.
- **Solutions** in the solver's order: each value (`data-value` with `data-part`, `data-param`, `data-kind`, `data-raw` =
  `numText(value)`) with its unit, "as a series L" when the kind differs, "true at this frequency only" (swapped), the
  λ/2 note on lengths; |Γ| at the goal node and the residual (best: the mismatch reached); **Apply** (`data-apply`).
- Five new short lines (whys.ts, 44 now): `solve-mark`, `solve-free`, `solve-goal`, `solve-count`, `solve-apply`,
  linked to `matching-with-two-parts`, `moving-on-the-chart`, `how-good-is-a-match`, `how-to-use` until M4.3c.

## State and link (`lib/smith/state.ts`)

- `Circuit` is now state.ts's own: network.ts's circuit with `ask?: Ask` (`unknowns` in marking order, `goal`). No `ask`
  when nothing is marked and the goal is the centre at the input (`cleanAsk` normalises; so old circuits compare equal).
- `cleanAsk` drops unknowns impossible for the part's kind (Zc of a lumped part, "L or C" off an L or C), repeats and
  all but the newest two; the goal keeps only its kind's fields and leaves out the input node (it then follows the
  input when parts are added at the source end). `toggleUnknown` (→ `{ circuit, dropped }`), `withFree`, `withGoal`,
  `askOf`, `sameUnknown`, `unknownName`, `VALUE_NAMES`, `DEFAULT_GOAL`, `MAX_UNKNOWNS`.
- Edits carry the ask: `insertPart`, `removePart`, `movePart` renumber unknowns (a removed part's are dropped) and the
  goal node; `withPart` cleans when the kind changes.
- Link, still `v=1` (old links read the same; `u`, `g` are written only when not default): `u=1,2lc,3zc,f0` (part numbers
  from 1 at the load; `lc` "L or C", `zc` its Zc), `g=vswr:1.5:within@1` (kinds `pt mag vswr rl r g x b`, `pt:R:X`,
  `@k` the node, 0 the load). Every bad token is an issue and is left out; never throws.
- `sameCircuit` compares the ask too; `sameNetwork` leaves it out.

## Undo and performance

- The ask is in the circuit, so marking, "L or C", the goal and Apply are steps of `commit`'s history like any edit; the
  goal's typed fields group by field (`field:goal-value`, `goal-R`, `goal-X`); Apply is one step (no group). Start over
  clears the ask. The link read at load is no step.
- The theory gets the circuit only when the network changes (`sameNetwork` ref in main.tsx), so marking does not
  re-render it. The page hands the panel stable functions (`stable.commit`, `busy`, `result`) so the memoised panel
  skips the page's other renders (a drag's pick).
- The panel solves `useDeferredValue(circuit)` in a `useMemo` (µs to 2 ms). The generic 2-D grid (two unknowns among f0,
  a line's Zc, a stub's Zc and λ/4, at least one f0 or line Zc: 7–22 ms) is solved by a timer 150 ms after the last
  change, postponed while `dragPart >= 0`, never in a render or a drag frame; the panel shows "Solving…". No worker:
  the family's `at` is a closure and the slow cases are rare.
- Apply is disabled while the result is for an older circuit (`aria-busy` on the result). `applySolution`: part values
  first (lengths in λ at the circuit's f0), then `atFrequency` for f0, the ask kept.
- ui-drag's 10-part timing circuit now has two unknowns marked (`&u=1,5`). Its 4× budget (10 ms) did **not** pass in
  this session, with or without this step: the machine drifted from 9.5 to 15 ms during the afternoon. Interleaved
  A/B of HEAD (M4.2) and this step, same minutes: 9.55 / 10.05, 10.56 / 10.00–10.30, 14.82 / 13.63, 12.21 / 13.13 ms;
  with the panel rendering nothing 10.1–10.6 ms. No difference above the drift; the main session should re-run
  `npx tsx ui-drag.mjs` on a quiet machine. `contain: content` on the panel changed nothing and would break the
  short lines' fixed bubbles, so it is not used.
- A family's end members are shown without repeats (`distinctEnds`: two ranges meeting at the L/C cut give C = ∞ and
  L = 0 as the same member).

## Checks

- `check-state.mjs` (own seeded stream, so the solver groups after it keep their problems): 5,000 random circuits with
  random unknowns and goals through the link to the bit, no issues, only unescaped characters; M3 links unchanged;
  hand-written links; 18 broken u/g texts each with an issue; 2,000 random u/g texts; toggles, the third mark, "L or C",
  names; 1,000 random insert/remove/move edits keep every unknown on its part object; goal-node remapping.
- `ui-solve.mjs`: 327 checks. 17 scripted circuits reach all 12 statuses with the expected words; 24 solutions and 44
  values equal `solve()` (1e-12), ranges to the bit; Apply on 20 solutions (exact, swapped, lines, circle goal, a point
  30 − j10 Ω, an intermediate node, the slow f0 + Zc case, family ends) leaves the goal within 1e-9 and is one Undo,
  Redo applies again; marking by mouse, keyboard alone (Tab, Space, Enter, arrows on the goal select, Ctrl+Z, Enter on
  Apply) and tap at 390 and 320 px; the link with marks and goal survives a reload; field and kind changes are one
  undo step each; no horizontal scroll at 320 and 390 px for every result kind.

## Found on the way

- Shifting the shared random stream (before the state checks had their own) made `check-validate.mjs` report four
  family members the solver lacks in two problems (BL55): `{"z0":1,"f0":132264808.36650285,"loadR":0.00007185043044411145,
  "loadX":2.774505980209877,"parts":[so 0.13164 λ Zc 0.3205, cs 4.5536e-11, ss 0.164438 λ Zc 0.87699, cp 7.9659e-9, qw
  0.88275, tl 0.210257 λ Zc 0.53621, lp 1.68087e-8]}` unknowns parts 3 and 6, goal g = 6.798966401818079 at the input;
  and `{"z0":75,"f0":5734371.20889579,"loadR":259.49852216344755,"loadX":-154.89638350056447,"parts":[qw 50.0556, rs
  2.7425, ls 7.9025e-6, ss 0.0967 λ Zc 33.277, ss 0.27835 λ Zc 84.588]}` unknowns parts 2 and 5, goal g =
  0.11768843102733577. Not fixed here (the solver is outside this step).

## For M4.3b

- The outcome is in main.tsx's `solved` ref (`onResult`) and on the panel's element (`[data-solve]`.smithSolve):
  `result.circles`/`circleNode` to draw, `result.family` (`at(t)` over `ranges[k].t0…t1` in `domains[0]`) for the slider,
  `result.goalNode`. The chart's goal ring and Nodes' goal text are still M3's fixed VSWR 1.5 (pathLayer `GOAL_*`):
  M4.3b should draw `askOf(circuit).goal` instead.
- Preview on hover/tap of a solution: `applySolution(outcome.circuit, s)` gives its circuit.
- Standard values: `standardVariants` per solution; the value list choice goes into the link beside `u`/`g`.
- Hiding family members at a value's limit (notes-M4.2 "Left") is not done; ends are shown as they come.
